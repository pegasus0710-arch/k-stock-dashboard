// src/components/CandleChart.jsx
// 분봉/일봉/주봉/월봉 캔들차트 + 업종지수 지원 + DART 공시 팝업
import { useState, useEffect, useRef, useCallback } from "react";
import "./CandleChart.css";

const KIWOOM_URL = "/api/kiwoom";
const DART_API_KEY = import.meta.env.VITE_DART_API_KEY;

// ── 기간 탭 정의 ──────────────────────────────────────────────
const PERIOD_TABS = [
  { key: "min", label: "분봉", isMin: true },
  { key: "day",   label: "일봉" },
  { key: "week",  label: "주봉" },
  { key: "month", label: "월봉" },
  { key: "year",  label: "년봉" },
];
const MIN_TABS = ["1", "3", "5", "10", "15", "30", "60"];

// ── 색상 ─────────────────────────────────────────────────────
const UP_COLOR   = "#e84b4b";
const DOWN_COLOR = "#3b82f6";
const FLAT_COLOR = "#888";

function priceColor(o, c) {
  if (c > o) return UP_COLOR;
  if (c < o) return DOWN_COLOR;
  return FLAT_COLOR;
}

// ── 숫자 포맷 ─────────────────────────────────────────────────
function fmt(n, decimals = 0) {
  if (!n && n !== 0) return "-";
  return Number(n).toLocaleString("ko-KR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── DART 기업코드 매핑 (주요 종목) ────────────────────────────
const DART_CORP_MAP = {
  "005930": "00126380", // 삼성전자
  "000660": "00164779", // SK하이닉스
  "005380": "00164742", // 현대차
  "035420": "00266961", // NAVER
  "051910": "00117694", // LG화학
  "006400": "00126380", // 삼성SDI (임시)
  "207940": "00401731", // 삼성바이오로직스
  "068270": "00105933", // 셀트리온
};

// ─────────────────────────────────────────────────────────────
export default function CandleChart({
  // 종목 차트
  code,          // 종목코드 (예: "005930")
  name,          // 종목명
  // 업종/지수 차트
  isIndex,       // true이면 업종 차트 모드
  inds_cd,       // 업종코드 (예: "001" = KOSPI)
  // 공통
  initialPeriod = "day",
  initialMin    = "5",
}) {
  const svgRef    = useRef(null);
  const [period,  setPeriod]  = useState(initialPeriod);
  const [minTic,  setMinTic]  = useState(initialMin);
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [tooltip, setTooltip] = useState(null);   // { x, y, candle }
  const [disclosures, setDisclosures] = useState([]); // DART 공시 목록
  const [discPopup,   setDiscPopup]   = useState(null); // 팝업으로 표시할 공시

  // ── 차트 데이터 로드 ────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url;
      if (isIndex) {
        url = `${KIWOOM_URL}?type=index-chart&inds_cd=${inds_cd}&period=${period}` +
              (period === "min" ? `&tic=${minTic}` : "");
      } else {
        url = `${KIWOOM_URL}?type=stock-chart&code=${code}&period=${period}` +
              (period === "min" ? `&tic=${minTic}` : "");
      }
      const res  = await fetch(url);
      const data = await res.json();
      setCandles(data.candles || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [isIndex, inds_cd, code, period, minTic]);

  useEffect(() => { load(); }, [load]);

  // ── DART 공시 로드 (종목 차트 + 일봉 이상) ────────────────
  useEffect(() => {
    if (isIndex || period === "min" || !code) return;
    const corpCode = DART_CORP_MAP[code];
    if (!corpCode || !DART_API_KEY) return;

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const from  = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");

    fetch(
      `https://opendart.fss.or.kr/api/list.json` +
      `?crtfc_key=${DART_API_KEY}&corp_code=${corpCode}` +
      `&bgn_de=${from}&end_de=${today}&page_count=30`
    )
      .then(r => r.json())
      .then(d => setDisclosures(d.list || []))
      .catch(() => {});
  }, [code, isIndex, period]);

  // ── 공시 상세 팝업 ─────────────────────────────────────────
  const openDiscPopup = useCallback(async (disc) => {
    setDiscPopup({ ...disc, loading: true, detail: null });
    try {
      const res  = await fetch(
        `https://opendart.fss.or.kr/api/document.json` +
        `?crtfc_key=${DART_API_KEY}&rcept_no=${disc.rcept_no}`
      );
      const data = await res.json();
      setDiscPopup(prev => ({ ...prev, loading: false, detail: data }));
    } catch {
      setDiscPopup(prev => ({ ...prev, loading: false }));
    }
  }, []);

  // ── SVG 캔들차트 렌더링 ─────────────────────────────────────
  const W = 900, H = 480;
  const PAD = { top: 24, right: 60, bottom: 56, left: 72 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top  - PAD.bottom;

  // 표시할 캔들 수 제한 (최대 100개)
  const visible = candles.slice(-120);
  const n       = visible.length;

  // 최고/최저 (5% 여백)
  const highs  = visible.map(c => c.high);
  const lows   = visible.map(c => c.low);
  const maxP   = n ? Math.max(...highs) : 1;
  const minP   = n ? Math.min(...lows)  : 0;
  const range  = maxP - minP || 1;
  const padded = range * 0.05;
  const yMax   = maxP + padded;
  const yMin   = minP - padded;
  const yRange = yMax - yMin;

  const toY = v => PAD.top + chartH - ((v - yMin) / yRange) * chartH;

  // 캔들 너비/간격
  const barW    = Math.max(2, Math.floor(chartW / (n || 1) * 0.7));
  const barGap  = chartW / (n || 1);

  const barX = i => PAD.left + i * barGap + barGap / 2;

  // Y축 눈금 (5개)
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (yRange / 4) * i);

  // X축 눈금 (최대 8개 레이블)
  const xStep  = Math.max(1, Math.ceil(n / 8));
  const xTicks = visible.filter((_, i) => i % xStep === 0);

  // 공시 날짜 → X index 매핑
  const discMap = {};
  if (disclosures.length && visible.length) {
    disclosures.forEach(d => {
      const dt = d.rcept_dt; // YYYYMMDD
      const idx = visible.findIndex(c => c.time?.slice(0, 8) === dt);
      if (idx >= 0) {
        if (!discMap[idx]) discMap[idx] = [];
        discMap[idx].push(d);
      }
    });
  }

  // ── 마우스 오버 핸들러 ──────────────────────────────────────
  function handleMouseMove(e) {
    if (!n) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx   = (e.clientX - rect.left) / (rect.width / W);
    const idx  = Math.round((mx - PAD.left - barGap / 2) / barGap);
    if (idx < 0 || idx >= n) { setTooltip(null); return; }
    const c = visible[idx];
    setTooltip({ x: barX(idx), y: PAD.top + 10, candle: c, idx });
  }

  // ── 제목 표시 ──────────────────────────────────────────────
  const title = isIndex
    ? (inds_cd === "001" ? "KOSPI" : inds_cd === "101" ? "KOSDAQ" : inds_cd)
    : (name || code);

  const lastCandle = visible[visible.length - 1];
  const chg  = lastCandle ? lastCandle.close - lastCandle.open : 0;
  const chgPct = lastCandle ? ((chg / lastCandle.open) * 100).toFixed(2) : "0";
  const chgColor = chg >= 0 ? UP_COLOR : DOWN_COLOR;

  return (
    <div className="cc-wrapper">
      {/* 헤더 */}
      <div className="cc-header">
        <div className="cc-title-row">
          <span className="cc-name">{title}</span>
          {!isIndex && <span className="cc-code">{code}</span>}
          {lastCandle && (
            <>
              <span className="cc-price" style={{ color: chgColor }}>
                {fmt(lastCandle.close, isIndex ? 2 : 0)}
              </span>
              <span className="cc-change" style={{ color: chgColor }}>
                {chg >= 0 ? "▲" : "▼"} {fmt(Math.abs(chg), isIndex ? 2 : 0)}
                ({chg >= 0 ? "+" : ""}{chgPct}%)
              </span>
            </>
          )}
        </div>

        {/* 기간 탭 */}
        <div className="cc-tabs">
          {PERIOD_TABS.map(t => (
            <button
              key={t.key}
              className={`cc-tab ${period === t.key ? "active" : ""}`}
              onClick={() => setPeriod(t.key)}
            >{t.label}</button>
          ))}
          {period === "min" && (
            <div className="cc-min-tabs">
              {MIN_TABS.map(m => (
                <button
                  key={m}
                  className={`cc-min-tab ${minTic === m ? "active" : ""}`}
                  onClick={() => setMinTic(m)}
                >{m}분</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 차트 영역 */}
      <div className="cc-chart-area">
        {loading && <div className="cc-loading">로딩 중…</div>}
        {error   && <div className="cc-error">⚠ {error}</div>}

        {!loading && !error && n > 0 && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="cc-svg"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
          >
            {/* 그리드 */}
            {yTicks.map((v, i) => (
              <g key={i}>
                <line
                  x1={PAD.left} x2={W - PAD.right}
                  y1={toY(v)} y2={toY(v)}
                  stroke="#2a2a3a" strokeDasharray="4,4"
                />
                <text
                  x={PAD.left - 6} y={toY(v) + 4}
                  fill="#888" fontSize="11" textAnchor="end"
                >
                  {fmt(v, isIndex ? 2 : 0)}
                </text>
              </g>
            ))}

            {/* X축 레이블 */}
            {xTicks.map((c, i) => {
              const origIdx = visible.indexOf(c);
              return (
                <text
                  key={i}
                  x={barX(origIdx)} y={H - PAD.bottom + 16}
                  fill="#888" fontSize="10" textAnchor="middle"
                >
                  {c.label}
                </text>
              );
            })}

            {/* 캔들 */}
            {visible.map((c, i) => {
              const x    = barX(i);
              const col  = priceColor(c.open, c.close);
              const bodyTop    = toY(Math.max(c.open, c.close));
              const bodyBottom = toY(Math.min(c.open, c.close));
              const bodyH = Math.max(1, bodyBottom - bodyTop);

              return (
                <g key={i}>
                  {/* 심지 */}
                  <line
                    x1={x} x2={x}
                    y1={toY(c.high)} y2={toY(c.low)}
                    stroke={col} strokeWidth="1"
                  />
                  {/* 몸통 */}
                  <rect
                    x={x - barW / 2} y={bodyTop}
                    width={barW} height={bodyH}
                    fill={col}
                    opacity={tooltip?.idx === i ? 1 : 0.85}
                  />
                </g>
              );
            })}

            {/* 공시 마커 */}
            {Object.entries(discMap).map(([idx, discs]) => {
              const i = Number(idx);
              const x = barX(i);
              const y = toY(visible[i].high) - 18;
              return (
                <g
                  key={`disc-${idx}`}
                  className="cc-disc-marker"
                  onClick={() => openDiscPopup(discs[0])}
                  style={{ cursor: "pointer" }}
                >
                  <circle cx={x} cy={y} r={7} fill="#f59e0b" opacity={0.9} />
                  <text x={x} y={y + 4} fill="#000" fontSize="9" textAnchor="middle" fontWeight="bold">
                    공
                  </text>
                  {discs.length > 1 && (
                    <text x={x + 9} y={y - 4} fill="#f59e0b" fontSize="9">{discs.length}</text>
                  )}
                </g>
              );
            })}

            {/* 툴팁 */}
            {tooltip && (() => {
              const c  = tooltip.candle;
              const tx = Math.min(tooltip.x + 12, W - PAD.right - 160);
              const ty = Math.max(PAD.top, tooltip.y);
              const col = priceColor(c.open, c.close);
              return (
                <g>
                  {/* 수직선 */}
                  <line
                    x1={tooltip.x} x2={tooltip.x}
                    y1={PAD.top} y2={H - PAD.bottom}
                    stroke="#555" strokeDasharray="3,3"
                  />
                  {/* 박스 */}
                  <rect x={tx} y={ty} width={155} height={period === "min" ? 100 : 110}
                    fill="#1a1a2e" stroke="#333" rx="6" opacity={0.95}
                  />
                  <text x={tx + 8} y={ty + 17} fill="#bbb" fontSize="11">{c.label}</text>
                  {[
                    ["시가", c.open],
                    ["고가", c.high],
                    ["저가", c.low],
                    ["종가", c.close],
                    period !== "min" && ["거래량", c.volume],
                  ].filter(Boolean).map(([lbl, val], j) => (
                    <g key={j}>
                      <text x={tx + 8}  y={ty + 34 + j * 16} fill="#888" fontSize="10">{lbl}</text>
                      <text x={tx + 150} y={ty + 34 + j * 16} fill={j === 3 ? col : "#ddd"}
                        fontSize="10" textAnchor="end"
                      >
                        {fmt(val, isIndex ? 2 : 0)}
                      </text>
                    </g>
                  ))}
                </g>
              );
            })()}
          </svg>
        )}

        {!loading && !error && n === 0 && (
          <div className="cc-empty">데이터 없음</div>
        )}
      </div>

      {/* DART 공시 팝업 */}
      {discPopup && (
        <div className="cc-disc-overlay" onClick={() => setDiscPopup(null)}>
          <div className="cc-disc-popup" onClick={e => e.stopPropagation()}>
            <button className="cc-disc-close" onClick={() => setDiscPopup(null)}>✕</button>
            <div className="cc-disc-date">{discPopup.rcept_dt}</div>
            <h3 className="cc-disc-title">{discPopup.report_nm}</h3>
            <div className="cc-disc-meta">
              <span>{discPopup.corp_name}</span>
              <span>{discPopup.flr_nm}</span>
            </div>
            {discPopup.loading && <div className="cc-disc-body">공시 불러오는 중…</div>}
            {!discPopup.loading && (
              <div className="cc-disc-body">
                <a
                  href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${discPopup.rcept_no}`}
                  target="_blank"
                  rel="noreferrer"
                  className="cc-disc-link"
                >
                  📄 DART에서 원문 보기 →
                </a>
                {discPopup.detail?.message && (
                  <p className="cc-disc-msg">{discPopup.detail.message}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
