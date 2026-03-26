import { useState, useEffect, useCallback, useRef } from 'react'
import { useStockPrices } from '../hooks/useKiwoomPrice'
import { fmt, fmtRate, fmtShort, rateColor, getKstStatus } from '../utils/format'
import { ALL_THEMES } from '../constants/themes'
import StockChartModal from '../components/StockChartModal'
import './ChartAnalysisPage.css'

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

// ── 검색 풀 ──────────────────────────────────
const STOCK_LIST = [...new Map(
  ALL_THEMES.flatMap(t => [
    ...t.etf.map(e => ({ name: e.name, code: e.code, theme: t.label })),
    ...t.stocks.map(s => ({ name: s.name, code: s.code, theme: t.label })),
  ]).map(s => [s.code, s])
).values()]

const LS_RECENT    = 'cap_recent_v1'
const LS_WATCHLIST = 'cap_watch_v1'
function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

// ── 이동평균 계산 ─────────────────────────────
function calcMA(data, p) {
  return data.map((_, i) => {
    if (i < p - 1) return null
    return data.slice(i - p + 1, i + 1).reduce((s, c) => s + c.close, 0) / p
  })
}

const MA_SETTINGS = [
  { p: 5,   color: '#f59e0b' },
  { p: 20,  color: '#10b981' },
  { p: 60,  color: '#3b82f6' },
  { p: 120, color: '#ef4444' },
]

// ── 인라인 캔들차트 ───────────────────────────
function InlineChart({ code, name, period, minTic, minDays, showMA }) {
  const [candles, setCandles]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [tooltip, setTooltip]   = useState(null)
  const svgRef = useRef(null)

  const load = useCallback(async () => {
    if (!code) return
    setLoading(true)
    try {
      const url = `/api/kiwoom?type=stock-chart&code=${code}&period=${period}` +
        (period === 'min' ? `&tic=${minTic}&min_days=${minDays}` : '')
      const data = await fetch(url).then(r => r.json())
      setCandles(data.candles || [])
    } catch {}
    finally { setLoading(false) }
  }, [code, period, minTic, minDays])

  useEffect(() => { load() }, [load])

  const n = candles.length
  if (loading) return <div className="cap-chart-loading"><div className="cap-spinner"/>차트 불러오는 중...</div>
  if (!n)      return <div className="cap-chart-empty">데이터 없음</div>

  // SVG 레이아웃
  const W = 900, H = 440
  const PAD = { top: 16, right: 60, bottom: 36, left: 72 }
  const PRICE_H = 300, VOL_GAP = 8, VOL_H = 56
  const chartW = W - PAD.left - PAD.right

  const prices  = candles.flatMap(c => [c.high, c.low]).filter(Boolean)
  const maxP    = Math.max(...prices), minP = Math.min(...prices)
  const pad5    = (maxP - minP) * 0.05 || 1
  const yMax    = maxP + pad5, yMin = minP - pad5, yRng = yMax - yMin

  const toY  = v => PAD.top + PRICE_H - ((v - yMin) / yRng) * PRICE_H
  const barW = Math.max(2, Math.floor(chartW / n * 0.7))
  const bx   = i => PAD.left + (i + 0.5) * (chartW / n)

  const maxVol = Math.max(...candles.map(c => c.volume || 0), 1)
  const volTop = PAD.top + PRICE_H + VOL_GAP
  const toVolY = v => volTop + VOL_H - (v / maxVol) * VOL_H

  const yTicks  = Array.from({ length: 5 }, (_, i) => yMin + (yRng / 4) * i)
  const xStep   = Math.max(1, Math.ceil(n / 8))
  const maLines = showMA ? MA_SETTINGS.map(({ p, color }) => {
    const vals = calcMA(candles, p)
    const pts  = vals.map((v, i) => v ? `${bx(i)},${toY(v)}` : null).filter(Boolean)
    return pts.length >= 2 ? { p, color, pts: pts.join(' ') } : null
  }).filter(Boolean) : []

  function onMouseMove(e) {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const mx   = (e.clientX - rect.left) / (rect.width / W)
    const idx  = Math.round((mx - PAD.left) / (chartW / n) - 0.5)
    if (idx < 0 || idx >= n) { setTooltip(null); return }
    setTooltip({ idx, x: bx(idx) })
  }

  const td = tooltip ? candles[tooltip.idx] : null

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="cap-svg"
      onMouseMove={onMouseMove} onMouseLeave={() => setTooltip(null)}>

      {/* Y 그리드 */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W - PAD.right} y1={toY(v)} y2={toY(v)} stroke="#f1f5f9" strokeWidth="1"/>
          <text x={PAD.left - 5} y={toY(v) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{Math.round(v).toLocaleString()}</text>
        </g>
      ))}

      {/* X 라벨 */}
      {candles.filter((_, i) => i % xStep === 0).map((c, i) => (
        <text key={i} x={bx(candles.indexOf(c))} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">{c.label}</text>
      ))}

      {/* 거래량 구분선 */}
      <line x1={PAD.left} x2={W - PAD.right} y1={volTop} y2={volTop} stroke="#f1f5f9"/>
      <text x={PAD.left - 5} y={volTop + 10} textAnchor="end" fontSize="9" fill="#94a3b8">거래량</text>

      {/* 캔들 + 거래량 */}
      {candles.map((c, i) => {
        const up  = c.close >= c.open
        const col = up ? '#ef4444' : '#3b82f6'
        const x   = bx(i)
        const bTop = toY(Math.max(c.open, c.close))
        const bH   = Math.max(1, toY(Math.min(c.open, c.close)) - bTop)
        const vh   = Math.max(1, (c.volume / maxVol) * VOL_H)
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={toY(c.high)} y2={toY(c.low)} stroke={col} strokeWidth="1"/>
            <rect x={x - barW / 2} y={bTop} width={barW} height={bH} fill={col} opacity={tooltip?.idx === i ? 1 : 0.85}/>
            <rect x={x - barW / 2} y={toVolY(c.volume)} width={barW} height={vh} fill={col} opacity="0.45"/>
          </g>
        )
      })}

      {/* MA 선 */}
      {maLines.map(ma => (
        <polyline key={ma.p} points={ma.pts} fill="none" stroke={ma.color} strokeWidth="1.2" opacity="0.9"/>
      ))}

      {/* 크로스헤어 + 툴팁 */}
      {td && (
        <>
          <line x1={tooltip.x} x2={tooltip.x} y1={PAD.top} y2={volTop + VOL_H} stroke="#94a3b8" strokeDasharray="3,3" strokeWidth="1"/>
          <rect x={tooltip.x > W / 2 ? tooltip.x - 145 : tooltip.x + 8} y={PAD.top + 4} width={138} height={102} fill="white" stroke="#e2e8f0" rx="6" opacity="0.97"/>
          {[['시가', td.open], ['고가', td.high], ['저가', td.low], ['종가', td.close], ['거래량', td.volume]].map(([lbl, val], j) => {
            const tx = tooltip.x > W / 2 ? tooltip.x - 140 : tooltip.x + 12
            const col = j === 1 ? '#ef4444' : j === 2 ? '#3b82f6' : j === 3 ? rateColor(td.close - td.open) : '#334155'
            return (
              <g key={j}>
                <text x={tx} y={PAD.top + 20 + j * 16} fontSize="11" fill="#94a3b8">{lbl}</text>
                <text x={tx + 130} y={PAD.top + 20 + j * 16} textAnchor="end" fontSize="11" fill={col} fontWeight={j === 3 ? '700' : '400'}>
                  {j === 4 ? Number(val).toLocaleString() : Math.round(val).toLocaleString()}
                </text>
              </g>
            )
          })}
          <text x={tooltip.x > W / 2 ? tooltip.x - 140 : tooltip.x + 12} y={PAD.top + 12} fontSize="10" fill="#475569">{td.label}</text>
        </>
      )}
    </svg>
  )
}

// ── AI 분석 ───────────────────────────────────
async function runAI(stock, period, price) {
  const today = new Date().toLocaleDateString('ko-KR')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content:
        `오늘(${today}) ${stock.name}(${stock.code}) 주식 분석해줘.
현재가: ${fmt(price?.price)}원, 등락률: ${fmtRate(price?.changeRate)}, 차트기간: ${period}

## 📌 종목 현황
## 📈 기술적 분석
## 🔑 핵심 뉴스·모멘텀
## 🎯 지지·저항 레벨
## ⚠️ 리스크 요인
## 💡 투자 의견` }],
    }),
  })
  if (!res.ok) throw new Error(`API 오류 ${res.status}`)
  const data = await res.json()
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
}

const PERIODS    = [{ key:'min', label:'분봉' }, { key:'day', label:'일봉' }, { key:'week', label:'주봉' }, { key:'month', label:'월봉' }, { key:'year', label:'년봉' }]
const MIN_SCOPES = ['1', '3', '5', '10', '15', '30', '60']
const MIN_DAYS   = [{ label:'1일', days:1 }, { label:'3일', days:3 }, { label:'5일', days:5 }]
const SUPPLY_TABS = [{ id:'chart', label:'📈 차트' }, { id:'supply', label:'💰 수급' }, { id:'ai', label:'🤖 AI 분석' }]

// ── 메인 ─────────────────────────────────────
export default function ChartAnalysisPage() {
  const [query,        setQuery]        = useState('')
  const [results,      setResults]      = useState([])
  const [showDrop,     setShowDrop]     = useState(false)
  const [selected,     setSelected]     = useState(null)
  const [recent,       setRecent]       = useState(() => lsGet(LS_RECENT, []))
  const [watchlist,    setWatchlist]    = useState(() => lsGet(LS_WATCHLIST, []))
  const [period,       setPeriod]       = useState('day')
  const [minTic,       setMinTic]       = useState('5')
  const [minDays,      setMinDays]      = useState(1)
  const [showMA,       setShowMA]       = useState(true)
  const [activeTab,    setActiveTab]    = useState('chart')
  const [fullChart,    setFullChart]    = useState(false)
  // 수급
  const [foreignData,  setForeignData]  = useState(null)
  const [shortData,    setShortData]    = useState(null)
  const [strengthData, setStrengthData] = useState(null)
  const [supplyLoading,setSupplyLoading]= useState(false)
  // AI
  const [aiResult,     setAiResult]     = useState('')
  const [aiLoading,    setAiLoading]    = useState(false)
  const [aiError,      setAiError]      = useState('')
  // 가격
  const codes = selected ? [selected.code] : []
  const { prices } = useStockPrices(codes, getKstStatus() === 'open' ? 30000 : 300000)
  const price = selected ? prices[selected.code] : null

  // 검색
  const search = q => {
    setQuery(q)
    if (!q.trim()) { setResults([]); setShowDrop(false); return }
    const kw = q.toLowerCase()
    setResults(STOCK_LIST.filter(s => s.name.toLowerCase().includes(kw) || s.code.includes(kw)).slice(0, 10))
    setShowDrop(true)
  }

  const select = stock => {
    setSelected(stock); setQuery(stock.name); setShowDrop(false)
    setAiResult(''); setAiError(''); setForeignData(null)
    const next = [stock, ...recent.filter(r => r.code !== stock.code)].slice(0, 8)
    setRecent(next); lsSet(LS_RECENT, next)
  }

  const toggleWatch = () => {
    if (!selected) return
    const exists = watchlist.find(w => w.code === selected.code)
    const next = exists ? watchlist.filter(w => w.code !== selected.code) : [selected, ...watchlist].slice(0, 20)
    setWatchlist(next); lsSet(LS_WATCHLIST, next)
  }
  const isWatched = selected && watchlist.find(w => w.code === selected.code)

  // 수급 로드
  const loadSupply = useCallback(async () => {
    if (!selected) return
    setSupplyLoading(true)
    try {
      const [f, sh, st] = await Promise.all([
        fetch(`/api/kiwoom?type=supply-foreign&code=${selected.code}`).then(r => r.json()),
        fetch(`/api/kiwoom?type=supply-short&code=${selected.code}&days=30`).then(r => r.json()),
        fetch(`/api/kiwoom?type=supply-strength&code=${selected.code}`).then(r => r.json()),
      ])
      setForeignData(f.data?.slice(0, 20) || [])
      setShortData(sh.data?.slice(0, 20)  || [])
      setStrengthData(st.data?.slice(0, 20) || [])
    } catch {}
    finally { setSupplyLoading(false) }
  }, [selected])

  useEffect(() => { if (activeTab === 'supply' && selected && !foreignData) loadSupply() }, [activeTab, selected])

  const doAI = async () => {
    if (!selected || !CLAUDE_KEY) return
    setAiLoading(true); setAiError('')
    try { setAiResult(await runAI(selected, period, price)) }
    catch (e) { setAiError(e.message) }
    finally { setAiLoading(false) }
  }

  const pc   = price ? rateColor(price.changeRate) : '#94a3b8'
  const sign = price?.changeRate > 0 ? '+' : ''

  return (
    <div className="cap-wrap">
      <div className="page-header">
        <div><h1 className="page-title">차트 분석</h1><p className="page-sub">종목 검색 · 캔들차트 · 보조지표 · 수급 · AI 분석</p></div>
      </div>

      {/* 검색 */}
      <div className="cap-search-section">
        <div className="cap-search-box">
          <span className="cap-search-icon">🔍</span>
          <input className="cap-search-input" placeholder="종목명 또는 코드 검색 (예: 삼성전자, 005930)"
            value={query} onChange={e => search(e.target.value)}
            onFocus={() => query && setShowDrop(true)}
            onKeyDown={e => e.key === 'Escape' && setShowDrop(false)}/>
          {query && <button className="cap-clear" onClick={() => { setQuery(''); setResults([]); setShowDrop(false) }}>✕</button>}
          {showDrop && results.length > 0 && (
            <div className="cap-dropdown">
              {results.map(s => (
                <button key={s.code} className="cap-dd-item" onClick={() => select(s)}>
                  <span className="cap-dd-name">{s.name}</span>
                  <span className="cap-dd-code">{s.code}</span>
                  <span className="cap-dd-theme">{s.theme}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {!selected && recent.length > 0 && (
          <div className="cap-chips-row"><span className="cap-chip-label">최근</span>
            {recent.map(r => <button key={r.code} className="cap-chip" onClick={() => select(r)}>{r.name}</button>)}
          </div>
        )}
        {!selected && watchlist.length > 0 && (
          <div className="cap-chips-row"><span className="cap-chip-label">⭐ 즐겨찾기</span>
            {watchlist.map(w => <button key={w.code} className="cap-chip cap-chip-star" onClick={() => select(w)}>{w.name}</button>)}
          </div>
        )}
      </div>

      {/* 종목 선택 후 */}
      {selected && (
        <div className="cap-body">
          {/* 헤더 */}
          <div className="cap-stock-header">
            <div className="cap-stock-left">
              <span className="cap-stock-name">{selected.name}</span>
              <span className="cap-stock-code">{selected.code}</span>
              <span className="cap-stock-theme">{selected.theme}</span>
              {price?.price > 0 && <>
                <span className="cap-price" style={{ color: pc }}>{fmt(price.price)}원</span>
                <span className="cap-change" style={{ color: pc }}>{sign}{price.changeRate?.toFixed(2)}%</span>
              </>}
            </div>
            <div className="cap-stock-right">
              <button className={`cap-btn-watch ${isWatched ? 'active' : ''}`} onClick={toggleWatch}>
                {isWatched ? '⭐' : '☆'} {isWatched ? '해제' : '즐겨찾기'}
              </button>
              <button className="cap-btn-close" onClick={() => { setSelected(null); setQuery('') }}>✕</button>
            </div>
          </div>

          {/* 탭 */}
          <div className="cap-tabs">
            {SUPPLY_TABS.map(t => <button key={t.id} className={`cap-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>)}
          </div>

          {/* ── 차트 탭 ── */}
          {activeTab === 'chart' && (
            <div className="cap-chart-section">
              {/* 컨트롤 바 */}
              <div className="cap-ctrl-bar">
                {/* 기간 */}
                <div className="cap-period-group">
                  {PERIODS.map(p => <button key={p.key} className={`cap-period-btn ${period === p.key ? 'active' : ''}`} onClick={() => setPeriod(p.key)}>{p.label}</button>)}
                </div>
                {period === 'min' && <>
                  <div className="cap-sep"/>
                  <div className="cap-period-group">
                    {MIN_SCOPES.map(s => <button key={s} className={`cap-period-btn ${minTic === s ? 'active' : ''}`} onClick={() => setMinTic(s)}>{s}분</button>)}
                  </div>
                  <div className="cap-sep"/>
                  <div className="cap-period-group">
                    {MIN_DAYS.map(d => <button key={d.days} className={`cap-period-btn ${minDays === d.days ? 'active' : ''}`} onClick={() => setMinDays(d.days)}>{d.label}</button>)}
                  </div>
                </>}
                <div className="cap-sep"/>
                <button className={`cap-ma-btn ${showMA ? 'active' : ''}`} onClick={() => setShowMA(v => !v)}>MA</button>
                {showMA && <div className="cap-ma-legend">{MA_SETTINGS.map(m => <span key={m.p} style={{ color: m.color, fontSize: 11 }}>MA{m.p}</span>)}</div>}
                <div style={{ marginLeft: 'auto' }}>
                  <button className="cap-fullscreen-btn" onClick={() => setFullChart(true)}>⛶ 전체화면</button>
                </div>
              </div>

              {/* 종목 정보 바 */}
              {price?.price > 0 && (
                <div className="cap-info-bar">
                  {[
                    ['현재가', `${fmt(price.price)}원`, pc],
                    ['등락률', `${sign}${price.changeRate?.toFixed(2)}%`, pc],
                    ['거래량', `${fmtShort(price.volume)}주`, null],
                    ['PER',   price.per ? `${Number(price.per).toFixed(1)}배` : '-', null],
                    ['PBR',   price.pbr ? `${Number(price.pbr).toFixed(2)}배` : '-', null],
                    ['외국인', price.forExhRt ? `${price.forExhRt}%` : '-', null],
                  ].map(([label, val, color]) => (
                    <div key={label} className="cap-info-item">
                      <div className="cap-info-label">{label}</div>
                      <div className="cap-info-val" style={{ color: color || '#0f172a' }}>{val}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 인라인 차트 */}
              <div className="cap-chart-area">
                <InlineChart code={selected.code} name={selected.name} period={period} minTic={minTic} minDays={minDays} showMA={showMA}/>
              </div>

              {/* DART 링크 */}
              <div className="cap-links-row">
                <a href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(selected.name)}`} target="_blank" rel="noreferrer" className="cap-ext-link">📋 DART 공시 →</a>
                <a href={`https://finance.naver.com/item/main.naver?code=${selected.code}`} target="_blank" rel="noreferrer" className="cap-ext-link">📊 네이버 증권 →</a>
              </div>
            </div>
          )}

          {/* ── 수급 탭 ── */}
          {activeTab === 'supply' && (
            <div className="cap-supply-section">
              {supplyLoading && <div className="cap-loading"><div className="cap-spinner"/>수급 데이터 불러오는 중...</div>}
              {!supplyLoading && !foreignData && <button className="cap-btn-primary" onClick={loadSupply}>📡 수급 데이터 불러오기</button>}
              {!supplyLoading && foreignData && (<>
                {[
                  { title:'🌐 외국인 보유 추이', data: foreignData, cols: ['일자','종가','변동수량','보유비중'], vals: r => [r.dt?.slice(4,8).replace(/(\d{2})(\d{2})/, '$1/$2'), fmt(r.close_pric), `${Number(r.chg_qty) > 0 ? '+' : ''}${fmt(r.chg_qty)}`, `${r.wght}%`], colors: (r, ci) => ci===2 ? (Number(r.chg_qty)>0?'#ef4444':'#3b82f6') : '#334155' },
                  { title:'📉 공매도 추이 (30일)', data: shortData, cols: ['일자','종가','공매도량','매매비중'], vals: r => [r.dt?.slice(4,8).replace(/(\d{2})(\d{2})/, '$1/$2'), fmt(r.close_pric), fmt(r.shrts_qty), `${r.trde_wght?.toFixed(2)}%`], colors: (r, ci) => ci===2?'#7c3aed':'#334155' },
                  { title:'⚡ 체결강도 추이', data: strengthData, cols: ['일자','등락률','체결강도','5일','20일'], vals: r => [r.dt?.slice(4,8).replace(/(\d{2})(\d{2})/, '$1/$2'), `${r.flu_rt?.toFixed(2)}%`, r.cntr_str?.toFixed(1), r.cntr_str_5?.toFixed(1), r.cntr_str_20?.toFixed(1)], colors: (r, ci) => { if(ci===1) return rateColor(r.flu_rt); if(ci===2) return r.cntr_str>100?'#ef4444':'#3b82f6'; return '#334155' } },
                ].map(({ title, data, cols, vals, colors }) => (
                  <div key={title} className="cap-supply-card">
                    <div className="cap-supply-title">{title}</div>
                    {!data?.length ? <div className="cap-supply-empty">데이터 없음</div> : (
                      <div className="cap-supply-table">
                        <div className="cap-supply-th" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
                          {cols.map(c => <div key={c}>{c}</div>)}
                        </div>
                        {data.map((r, i) => {
                          const row = vals(r)
                          return (
                            <div key={i} className="cap-supply-tr" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
                              {row.map((v, ci) => <div key={ci} style={{ color: colors(r, ci) }}>{v}</div>)}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </>)}
            </div>
          )}

          {/* ── AI 탭 ── */}
          {activeTab === 'ai' && (
            <div className="cap-ai-section">
              <div className="cap-ai-header">
                <div>🤖 <strong>{selected.name}</strong> 웹 검색 기반 AI 분석</div>
                <div className="cap-ai-controls">
                  {PERIODS.map(p => <button key={p.key} className={`cap-period-btn ${period === p.key ? 'active' : ''}`} onClick={() => setPeriod(p.key)}>{p.label}</button>)}
                  <button className="cap-btn-primary" onClick={doAI} disabled={aiLoading || !CLAUDE_KEY}>
                    {aiLoading ? '⟳ 분석 중...' : aiResult ? '↺ 다시 분석' : '🔍 AI 분석 시작'}
                  </button>
                </div>
              </div>
              {!CLAUDE_KEY && <div className="cap-ai-warn">⚠️ VITE_CLAUDE_API_KEY 미설정</div>}
              {aiError && <div className="cap-ai-error">⚠️ {aiError}</div>}
              {aiLoading && <div className="cap-loading"><div className="cap-spinner"/>{selected.name} 분석 중...</div>}
              {aiResult && !aiLoading && (
                <div className="cap-ai-result">
                  <div className="cap-ai-badge">🔍 웹 검색 기반 · {new Date().toLocaleTimeString('ko-KR')}</div>
                  <pre className="cap-ai-text">{aiResult}</pre>
                </div>
              )}
              {!aiResult && !aiLoading && !aiError && (
                <div className="cap-ai-placeholder">
                  <p><strong>AI 분석 시작</strong> 버튼을 눌러보세요</p>
                  <p className="cap-ai-sub">웹 검색 + 기술적 분석을 종합해드립니다</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 빈 화면 */}
      {!selected && watchlist.length === 0 && recent.length === 0 && (
        <div className="cap-empty">
          <div className="cap-empty-icon">📈</div>
          <p>종목명 또는 코드를 검색해 차트 분석을 시작하세요</p>
          <p className="cap-empty-sub">예: 삼성전자, SK하이닉스, 005930</p>
        </div>
      )}

      {/* 전체화면 차트 모달 */}
      {fullChart && selected && (
        <StockChartModal stock={{ name: selected.name, code: selected.code }} onClose={() => setFullChart(false)}/>
      )}
    </div>
  )
}
