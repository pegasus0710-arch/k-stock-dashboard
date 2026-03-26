// src/components/CandleChart.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import "./CandleChart.css";

const DART_API_KEY = import.meta.env.VITE_DART_API_KEY;

const PERIOD_TABS = [
  { key: "min",   label: "분봉", isMin: true },
  { key: "day",   label: "일봉" },
  { key: "week",  label: "주봉" },
  { key: "month", label: "월봉" },
  { key: "year",  label: "년봉" },
];
const MIN_TABS     = ["1","3","5","10","15","30","60"];
const MIN_DAY_TABS = [
  { label: "1일", days: 1 },
  { label: "3일", days: 3 },
  { label: "5일", days: 5 },
];
const RANGE_OPTIONS = [
  { label: "1개월", months: 1 },
  { label: "3개월", months: 3 },
  { label: "6개월", months: 6 },
  { label: "1년",   months: 12 },
  { label: "전체",  months: 0 },
];
const MA_SETTINGS = [
  { period: 5,   color: "#f59e0b" },
  { period: 20,  color: "#10b981" },
  { period: 60,  color: "#3b82f6" },
  { period: 120, color: "#ef4444" },
];
const DART_CORP_MAP = {
  "005930":"00126380","000660":"00164779","005380":"00164742",
  "035420":"00266961","051910":"00117694","006400":"00126380",
  "207940":"00401731","068270":"00105933","012450":"00129838",
  "064350":"00231467","079550":"00140593","329180":"00164876",
  "010140":"00104896","042660":"00131030","034020":"00155276",
  "298040":"00631791","373220":"01182754","005490":"00101867",
};

const UP   = "#e84b4b";
const DOWN = "#3b82f6";

function priceColor(o, c) { return c > o ? UP : c < o ? DOWN : "#888"; }
function fmt(n, d = 0) {
  if (!n && n !== 0) return "-";
  return Number(n).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function filterByRange(candles, months) {
  if (!months) return candles;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutStr = cutoff.toISOString().slice(0, 10).replace(/-/g, "");
  return candles.filter(c => (c.time || "").slice(0, 8) >= cutStr);
}
function calcMA(data, p) {
  return data.map((_, i) => {
    if (i < p - 1) return null;
    return data.slice(i - p + 1, i + 1).reduce((s, c) => s + c.close, 0) / p;
  });
}

export default function CandleChart({
  code, name, isIndex, inds_cd,
  initialPeriod = "day", initialMin = "5",
}) {
  const svgRef = useRef(null);
  const [period,      setPeriod]      = useState(initialPeriod);
  const [minTic,      setMinTic]      = useState(initialMin);
  const [minDays,     setMinDays]     = useState(1);
  const [range,       setRange]       = useState(3);     // months
  const [showMA,      setShowMA]      = useState(true);
  const [candles,     setCandles]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [tooltip,     setTooltip]     = useState(null);
  const [disclosures, setDisclosures] = useState([]);
  const [discPopup,   setDiscPopup]   = useState(null);

  // ── 데이터 로드 ────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      let url;
      if (isIndex) {
        url = `/api/kiwoom?type=index-chart&inds_cd=${inds_cd}&period=${period}` +
              (period === "min" ? `&tic=${minTic}&min_days=${minDays}` : "");
      } else {
        url = `/api/kiwoom?type=stock-chart&code=${code}&period=${period}` +
              (period === "min" ? `&tic=${minTic}&min_days=${minDays}` : "");
      }
      const res  = await fetch(url);
      const data = await res.json();
      setCandles(data.candles || []);
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  }, [isIndex, inds_cd, code, period, minTic, minDays]);

  useEffect(() => { load(); }, [load]);

  // ── DART 공시 ───────────────────────────────────────────
  useEffect(() => {
    if (isIndex || period === "min" || !code || !DART_API_KEY) return;
    const corpCode = DART_CORP_MAP[code];
    if (!corpCode) return;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const from  = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    fetch(`https://opendart.fss.or.kr/api/list.json?crtfc_key=${DART_API_KEY}&corp_code=${corpCode}&bgn_de=${from}&end_de=${today}&page_count=30`)
      .then(r => r.json()).then(d => setDisclosures(d.list || [])).catch(() => {});
  }, [code, isIndex, period]);

  const openDiscPopup = useCallback(async (disc) => {
    setDiscPopup({ ...disc, loading: true });
    try {
      const res  = await fetch(`https://opendart.fss.or.kr/api/document.json?crtfc_key=${DART_API_KEY}&rcept_no=${disc.rcept_no}`);
      const data = await res.json();
      setDiscPopup(prev => ({ ...prev, loading: false, detail: data }));
    } catch { setDiscPopup(prev => ({ ...prev, loading: false })); }
  }, []);

  // ── 범위 필터된 캔들 ────────────────────────────────────
  const filtered = period === "min" ? candles : filterByRange(candles, range);
  const visible  = filtered.slice(-200);
  const n        = visible.length;

  // ── SVG 레이아웃 ────────────────────────────────────────
  const W = 900, H = 540;
  const PAD     = { top: 24, right: 60, bottom: 40, left: 72 };
  const PRICE_H = 370;
  const VOL_GAP = 8;
  const VOL_H   = 60;
  const chartW  = W - PAD.left - PAD.right;

  // Y축 범위
  const prices = visible.flatMap(c => [c.high, c.low]).filter(Boolean);
  const maxP   = n ? Math.max(...prices) : 1;
  const minP   = n ? Math.min(...prices) : 0;
  const rng    = maxP - minP || 1;
  const pad5   = rng * 0.05;
  const yMax   = maxP + pad5, yMin = minP - pad5, yRange = yMax - yMin;

  const toY  = v => PAD.top + PRICE_H - ((v - yMin) / yRange) * PRICE_H;
  const barW = Math.max(2, Math.floor(chartW / (n || 1) * 0.7));
  const bx   = i => PAD.left + i * (chartW / (n || 1)) + (chartW / (n || 1)) / 2;

  // 거래량 Y
  const maxVol = Math.max(...visible.map(c => c.volume || 0), 1);
  const volTop = PAD.top + PRICE_H + VOL_GAP;
  const toVolY = v => volTop + VOL_H - (v / maxVol) * VOL_H;

  // Y축 눈금 (5개)
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (yRange / 4) * i);

  // X축 레이블
  const xStep  = Math.max(1, Math.ceil(n / 7));
  const xTicks = visible.filter((_, i) => i % xStep === 0);

  // 이동평균선
  const maLines = showMA ? MA_SETTINGS.map(({ period: p, color }) => {
    const vals = calcMA(visible, p);
    const pts  = vals.map((v, i) => v ? `${bx(i)},${toY(v)}` : null).filter(Boolean);
    return pts.length >= 2 ? { p, color, points: pts.join(" ") } : null;
  }).filter(Boolean) : [];

  // 공시 날짜 매핑
  const discMap = {};
  disclosures.forEach(d => {
    const idx = visible.findIndex(c => (c.time || "").slice(0, 8) === d.rcept_dt);
    if (idx >= 0) {
      if (!discMap[idx]) discMap[idx] = [];
      discMap[idx].push(d);
    }
  });

  // 마우스 핸들러
  function handleMouseMove(e) {
    if (!n || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx   = (e.clientX - rect.left) / (rect.width / W);
    const step = chartW / n;
    const idx  = Math.round((mx - PAD.left - step / 2) / step);
    if (idx < 0 || idx >= n) { setTooltip(null); return; }
    setTooltip({ x: bx(idx), y: PAD.top + 10, candle: visible[idx], idx });
  }

  // 헤더 정보
  const title      = isIndex ? (inds_cd === "001" ? "KOSPI" : inds_cd === "101" ? "KOSDAQ" : inds_cd) : (name || code);
  const lastCandle = visible[n - 1];
  const chg        = lastCandle ? lastCandle.close - lastCandle.open : 0;
  const chgPct     = lastCandle && lastCandle.open ? ((chg / lastCandle.open) * 100).toFixed(2) : "0.00";
  const chgColor   = chg >= 0 ? UP : DOWN;
  const dec        = isIndex ? 2 : 0;

  return (
    <div className="cc-wrapper">
      {/* 헤더 */}
      <div className="cc-header">
        <div className="cc-title-row">
          <span className="cc-name">{title}</span>
          {!isIndex && <span className="cc-code">{code}</span>}
          {lastCandle && (
            <>
              <span className="cc-price" style={{ color: chgColor }}>{fmt(lastCandle.close, dec)}</span>
              <span className="cc-change" style={{ color: chgColor }}>
                {chg >= 0 ? "▲" : "▼"} {fmt(Math.abs(chg), dec)} ({chg >= 0 ? "+" : ""}{chgPct}%)
              </span>
            </>
          )}
        </div>

        {/* 기간 탭 */}
        <div className="cc-tabs">
          {PERIOD_TABS.map(t => (
            <button key={t.key} className={`cc-tab ${period === t.key ? "active" : ""}`}
              onClick={() => setPeriod(t.key)}>{t.label}</button>
          ))}

          {/* 분봉: 틱 + 기간 선택 */}
          {period === "min" && (
            <>
              <div className="cc-min-tabs">
                {MIN_TABS.map(m => (
                  <button key={m} className={`cc-min-tab ${minTic === m ? "active" : ""}`}
                    onClick={() => setMinTic(m)}>{m}분</button>
                ))}
              </div>
              <div className="cc-min-tabs" style={{ marginLeft: 8, paddingLeft: 8, borderLeft: "1px solid #333" }}>
                {MIN_DAY_TABS.map(d => (
                  <button key={d.days} className={`cc-min-tab ${minDays === d.days ? "active" : ""}`}
                    onClick={() => setMinDays(d.days)}>{d.label}</button>
                ))}
              </div>
            </>
          )}

          {/* 일봉 이상: 범위 선택 */}
          {period !== "min" && (
            <div className="cc-range-tabs">
              {RANGE_OPTIONS.map(r => (
                <button key={r.months} className={`cc-range-tab ${range === r.months ? "active" : ""}`}
                  onClick={() => setRange(r.months)}>{r.label}</button>
              ))}
            </div>
          )}

          {/* MA 토글 */}
          <button className={`cc-ma-btn ${showMA ? "active" : ""}`} onClick={() => setShowMA(v => !v)}>MA</button>
          {showMA && (
            <div className="cc-ma-legend">
              {MA_SETTINGS.map(({ period: p, color }) => (
                <span key={p} style={{ color, fontSize: "11px", fontWeight: 600 }}>MA{p}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 차트 */}
      <div className="cc-chart-area">
        {loading && <div className="cc-loading">로딩 중…</div>}
        {error   && <div className="cc-error">⚠ {error}</div>}

        {!loading && !error && n > 0 && (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="cc-svg"
            onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}>

            {/* 가격 그리드 */}
            {yTicks.map((v, i) => (
              <g key={i}>
                <line x1={PAD.left} x2={W - PAD.right} y1={toY(v)} y2={toY(v)} stroke="#2a2a3a" strokeDasharray="4,4"/>
                <text x={PAD.left - 6} y={toY(v) + 4} fill="#888" fontSize="11" textAnchor="end">
                  {fmt(v, dec)}
                </text>
              </g>
            ))}

            {/* 거래량 그리드 */}
            <line x1={PAD.left} x2={W - PAD.right} y1={volTop} y2={volTop} stroke="#2a2a3a" strokeDasharray="2,4"/>
            <text x={PAD.left - 6} y={volTop + 10} fill="#555" fontSize="9" textAnchor="end">거래량</text>

            {/* X축 */}
            {xTicks.map((c, i) => (
              <text key={i} x={bx(visible.indexOf(c))} y={H - 8}
                fill="#888" fontSize="10" textAnchor="middle">{c.label}</text>
            ))}

            {/* 캔들 */}
            {visible.map((c, i) => {
              const x   = bx(i);
              const col = priceColor(c.open, c.close);
              const bTop = toY(Math.max(c.open, c.close));
              const bH   = Math.max(1, toY(Math.min(c.open, c.close)) - bTop);
              return (
                <g key={i}>
                  <line x1={x} x2={x} y1={toY(c.high)} y2={toY(c.low)} stroke={col} strokeWidth="1"/>
                  <rect x={x - barW / 2} y={bTop} width={barW} height={bH}
                    fill={col} opacity={tooltip?.idx === i ? 1 : 0.85}/>
                </g>
              );
            })}

            {/* 거래량 바 */}
            {visible.map((c, i) => {
              const x    = bx(i);
              const vh   = Math.max(1, (c.volume / maxVol) * VOL_H);
              const col  = priceColor(c.open, c.close);
              return <rect key={i} x={x - barW / 2} y={volTop + VOL_H - vh} width={barW} height={vh} fill={col} opacity="0.5"/>;
            })}

            {/* 이동평균선 */}
            {maLines.map(ma => (
              <polyline key={ma.p} points={ma.points} fill="none" stroke={ma.color} strokeWidth="1.2" opacity="0.9"/>
            ))}

            {/* 공시 마커 */}
            {Object.entries(discMap).map(([idx, discs]) => {
              const i = Number(idx), x = bx(i), y = toY(visible[i].high) - 16;
              return (
                <g key={`d-${idx}`} style={{ cursor: "pointer" }} onClick={() => openDiscPopup(discs[0])}>
                  <circle cx={x} cy={y} r={7} fill="#f59e0b" opacity="0.9"/>
                  <text x={x} y={y + 4} fill="#000" fontSize="9" textAnchor="middle" fontWeight="bold">공</text>
                </g>
              );
            })}

            {/* 툴팁 */}
            {tooltip && (() => {
              const c   = tooltip.candle;
              const tx  = Math.min(tooltip.x + 12, W - PAD.right - 160);
              const ty  = Math.max(PAD.top + 4, tooltip.y);
              const col = priceColor(c.open, c.close);
              const rows = [["시가", c.open], ["고가", c.high], ["저가", c.low], ["종가", c.close], ["거래량", c.volume]];
              return (
                <g>
                  <line x1={tooltip.x} x2={tooltip.x} y1={PAD.top} y2={PAD.top + PRICE_H + VOL_GAP + VOL_H}
                    stroke="#555" strokeDasharray="3,3"/>
                  <rect x={tx} y={ty} width={155} height={110} fill="#1a1a2e" stroke="#333" rx="6" opacity="0.96"/>
                  <text x={tx + 8} y={ty + 16} fill="#bbb" fontSize="11">{c.label}</text>
                  {rows.map(([lbl, val], j) => (
                    <g key={j}>
                      <text x={tx + 8}   y={ty + 32 + j * 16} fill="#888" fontSize="10">{lbl}</text>
                      <text x={tx + 150} y={ty + 32 + j * 16} fill={j === 3 ? col : "#ddd"} fontSize="10" textAnchor="end">
                        {j === 4 ? Number(val).toLocaleString() : fmt(val, dec)}
                      </text>
                    </g>
                  ))}
                </g>
              );
            })()}
          </svg>
        )}

        {!loading && !error && n === 0 && <div className="cc-empty">데이터 없음</div>}
      </div>

      {/* DART 공시 팝업 */}
      {discPopup && (
        <div className="cc-disc-overlay" onClick={() => setDiscPopup(null)}>
          <div className="cc-disc-popup" onClick={e => e.stopPropagation()}>
            <button className="cc-disc-close" onClick={() => setDiscPopup(null)}>✕</button>
            <div className="cc-disc-date">{discPopup.rcept_dt}</div>
            <h3 className="cc-disc-title">{discPopup.report_nm}</h3>
            <div className="cc-disc-meta"><span>{discPopup.corp_name}</span><span>{discPopup.flr_nm}</span></div>
            {discPopup.loading && <div className="cc-disc-body">불러오는 중…</div>}
            {!discPopup.loading && (
              <div className="cc-disc-body">
                <a href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${discPopup.rcept_no}`}
                  target="_blank" rel="noreferrer" className="cc-disc-link">📄 DART 원문 보기 →</a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
