import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useStockPrices } from '../hooks/useKiwoomPrice'
import { fmt, fmtRate, fmtShort, rateColor, getKstStatus } from '../utils/format'
import { ALL_THEMES } from '../constants/themes'
import './ChartAnalysisPage.css'

// ── 마크다운 렌더러 ────────────────────────────
function MarkdownView({ text }) {
  if (!text) return null
  const inlineBold = (t) => t.split(/\*\*(.*?)\*\*/g).map((p, i) => i % 2 === 1 ? <strong key={i}>{p}</strong> : p)
  return (
    <div className="cap-md-body">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="cap-md-h3">{inlineBold(line.slice(4))}</h4>
        if (line.startsWith('## '))  return <h3 key={i} className="cap-md-h2">{inlineBold(line.slice(3))}</h3>
        if (line.startsWith('# '))   return <h2 key={i} className="cap-md-h1">{inlineBold(line.slice(2))}</h2>
        if (/^[-*] /.test(line))     return <li key={i} className="cap-md-li">{inlineBold(line.slice(2))}</li>
        if (!line.trim())             return <div key={i} className="cap-md-br"/>
        return <p key={i} className="cap-md-p">{inlineBold(line)}</p>
      })}
    </div>
  )
}

// ── 수급 미니 차트 ─────────────────────────────
function SupplyMiniBarChart({ title, data, color }) {
  if (!data?.length) return null
  const vals = data.map(d => d.value)
  const maxAbs = Math.max(...vals.map(Math.abs), 1)
  const W = 900, H = 64, PAD = { l:80, r:12, t:6, b:16 }
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b
  const bw = Math.max(2, Math.floor(cW / data.length * 0.65))
  const bx = i => PAD.l + (i + 0.5) * (cW / data.length)
  const midY = PAD.t + cH / 2
  return (
    <div className="cap-supply-sub-row">
      <svg viewBox={`0 0 ${W} ${H}`} className="cap-supply-sub-svg">
        <text x={PAD.l - 5} y={PAD.t + 10} fontSize="9" fill="#64748b" textAnchor="end">{title}</text>
        <line x1={PAD.l} x2={PAD.l + cW} y1={midY} y2={midY} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5"/>
        {data.map((d, i) => {
          const v = d.value || 0
          const barH = Math.abs(v / maxAbs) * (cH / 2 - 2)
          return <rect key={i} x={bx(i) - bw/2}
            y={v >= 0 ? midY - barH : midY}
            width={bw} height={Math.max(1, barH)}
            fill={v >= 0 ? '#22c55e' : '#ef4444'} opacity="0.75"/>
        })}
        {data[0] && <text x={PAD.l} y={H - 2} fontSize="8" fill="#475569" textAnchor="middle">{(data[0].date||'').slice(4,8)?.replace(/(\d{2})(\d{2})/,'$1/$2')}</text>}
        {data[data.length-1] && <text x={PAD.l+cW} y={H - 2} fontSize="8" fill="#475569" textAnchor="middle">{(data[data.length-1].date||'').slice(4,8)?.replace(/(\d{2})(\d{2})/,'$1/$2')}</text>}
      </svg>
    </div>
  )
}

function SupplyMiniLineChart({ title, data, color, baseline }) {
  if (!data?.length) return null
  const vals = data.map(d => d.value)
  const maxV = Math.max(...vals, 1), minV = Math.min(...vals, 0)
  const range = (maxV - minV) || 1
  const W = 900, H = 64, PAD = { l:80, r:12, t:6, b:16 }
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b
  const px = i => PAD.l + (i / (data.length - 1 || 1)) * cW
  const py = v => PAD.t + cH - ((v - minV) / range) * cH
  const pts = data.map((d, i) => `${px(i)},${py(d.value||0)}`).join(' ')
  return (
    <div className="cap-supply-sub-row">
      <svg viewBox={`0 0 ${W} ${H}`} className="cap-supply-sub-svg">
        <text x={PAD.l - 5} y={PAD.t + 10} fontSize="9" fill="#64748b" textAnchor="end">{title}</text>
        {baseline !== undefined && <line x1={PAD.l} x2={PAD.l+cW} y1={py(baseline)} y2={py(baseline)} stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" strokeDasharray="3,3"/>}
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.3" opacity="0.85"/>
        {data[0] && <text x={PAD.l} y={H - 2} fontSize="8" fill="#475569" textAnchor="middle">{(data[0].date||'').slice(4,8)?.replace(/(\d{2})(\d{2})/,'$1/$2')}</text>}
        {data[data.length-1] && <text x={PAD.l+cW} y={H - 2} fontSize="8" fill="#475569" textAnchor="middle">{(data[data.length-1].date||'').slice(4,8)?.replace(/(\d{2})(\d{2})/,'$1/$2')}</text>}
      </svg>
    </div>
  )
}

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

// ── 검색 풀 ──────────────────────────────────
const STOCK_LIST = [...new Map(
  ALL_THEMES.flatMap(t => [
    ...t.etf.map(e => ({ name: e.name, code: e.code, theme: t.label })),
    ...t.stocks.map(s => ({ name: s.name, code: s.code, theme: t.label })),
  ]).map(s => [s.code, s])
).values()]

const LS_RECENT    = 'cap_recent_v2'
const LS_WATCHLIST = 'cap_watch_v2'
const LS_DRAWINGS  = 'cap_drawings_v1'
function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

const MA_SETTINGS = [
  { p:5,   color:'#f59e0b', label:'MA5'   },
  { p:20,  color:'#10b981', label:'MA20'  },
  { p:60,  color:'#3b82f6', label:'MA60'  },
  { p:120, color:'#ef4444', label:'MA120' },
]

function calcMA(data, p) {
  return data.map((_, i) => {
    if (i < p - 1) return null
    return data.slice(i - p + 1, i + 1).reduce((s, c) => s + c.close, 0) / p
  })
}

function filterByRange(candles, months) {
  if (!months) return candles
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutStr = cutoff.toISOString().slice(0, 10).replace(/-/g, '')
  return candles.filter(c => (c.time || '').slice(0, 8) >= cutStr)
}

const PERIODS = [
  { key:'min',   label:'분봉' },
  { key:'day',   label:'일봉' },
  { key:'week',  label:'주봉' },
  { key:'month', label:'월봉' },
  { key:'year',  label:'년봉' },
]
const MIN_SCOPES = ['1','3','5','10','15','30','60']
const MIN_DAYS_OPTS = [{ label:'1일', days:1 }, { label:'3일', days:3 }, { label:'5일', days:5 }]
const RANGE_OPTS = [
  { label:'1개월', months:1  },
  { label:'3개월', months:3  },
  { label:'6개월', months:6  },
  { label:'1년',   months:12 },
  { label:'3년',   months:36 },
  { label:'전체',  months:0  },
]
const DRAW_TOOLS = [
  { id:'none',   label:'🖱️ 선택',    tip:'이동/선택 모드' },
  { id:'hline',  label:'━ 수평선',   tip:'수평 지지/저항선 그리기' },
  { id:'trend',  label:'↗ 추세선',   tip:'추세선 그리기' },
  { id:'fib',    label:'🔢 피보나치', tip:'피보나치 되돌림' },
  { id:'text',   label:'📝 메모',    tip:'텍스트 메모 추가' },
]

// ══════════════════════════════════════════════
// 차트 렌더러 (공유)
// ══════════════════════════════════════════════
function ChartRenderer({ candles, showMA, enabledMA, drawings, onSvgClick, onSvgMouseMove, isFullscreen }) {
  const svgRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)

  const n = candles.length
  if (!n) return <div className="cap-chart-empty">데이터 없음</div>

  const W = isFullscreen ? 1400 : 900
  const H = isFullscreen ? 600  : 440
  const PAD = { top:16, right:60, bottom:36, left:76 }
  const PRICE_H = isFullscreen ? 440 : 300
  const VOL_GAP = 8, VOL_H = isFullscreen ? 80 : 56
  const chartW  = W - PAD.left - PAD.right

  const prices = candles.flatMap(c => [c.high, c.low]).filter(Boolean)
  const maxP   = Math.max(...prices), minP = Math.min(...prices)
  const pad5   = (maxP - minP) * 0.05 || 1
  const yMax   = maxP + pad5, yMin = minP - pad5, yRng = yMax - yMin

  const toY   = v  => PAD.top + PRICE_H - ((v - yMin) / yRng) * PRICE_H
  const fromY = y  => yMin + (PAD.top + PRICE_H - y) / PRICE_H * yRng
  const barW  = Math.max(2, Math.floor(chartW / n * 0.7))
  const bx    = i  => PAD.left + (i + 0.5) * (chartW / n)
  const fromX = x  => Math.round((x - PAD.left) / (chartW / n) - 0.5)

  const maxVol = Math.max(...candles.map(c => c.volume || 0), 1)
  const volTop = PAD.top + PRICE_H + VOL_GAP
  const toVolY = v => volTop + VOL_H - (v / maxVol) * VOL_H

  const yTicks = Array.from({ length:6 }, (_, i) => yMin + (yRng / 5) * i)
  const xStep  = Math.max(1, Math.ceil(n / 8))

  const maLines = showMA ? MA_SETTINGS.filter(m => enabledMA.has(m.p)).map(({ p, color }) => {
    const vals = calcMA(candles, p)
    const pts  = vals.map((v, i) => v ? `${bx(i)},${toY(v)}` : null).filter(Boolean)
    return pts.length >= 2 ? { p, color, pts: pts.join(' ') } : null
  }).filter(Boolean) : []

  function handleMouseMove(e) {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const mx   = (e.clientX - rect.left) * (W / rect.width)
    const idx  = Math.round((mx - PAD.left) / (chartW / n) - 0.5)
    if (idx < 0 || idx >= n) { setTooltip(null); return }
    setTooltip({ idx, x: bx(idx) })
    onSvgMouseMove && onSvgMouseMove({ x: mx, y: (e.clientY - rect.top) * (H / rect.height), idx, price: fromY((e.clientY - rect.top) * (H / rect.height)) })
  }

  function handleClick(e) {
    if (!svgRef.current || !onSvgClick) return
    const rect = svgRef.current.getBoundingClientRect()
    const x    = (e.clientX - rect.left) * (W / rect.width)
    const y    = (e.clientY - rect.top)  * (H / rect.height)
    const idx  = fromX(x)
    onSvgClick({ x, y, idx, price: fromY(y), bx, toY, PAD, chartW, n })
  }

  const td = tooltip ? candles[tooltip.idx] : null

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
      className="cap-svg" style={{ cursor: onSvgClick ? 'crosshair' : 'default', background:'#0f172a', borderRadius:'8px' }}
      onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)} onClick={handleClick}>

      {/* Y 그리드 */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W - PAD.right} y1={toY(v)} y2={toY(v)} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>
          <text x={PAD.left - 5} y={toY(v) + 4} textAnchor="end" fontSize="10" fill="#64748b">{Math.round(v).toLocaleString()}</text>
        </g>
      ))}

      {/* X 라벨 */}
      {candles.filter((_, i) => i % xStep === 0).map((c, i) => (
        <text key={i} x={bx(candles.indexOf(c))} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">{c.label}</text>
      ))}

      {/* 거래량 구분선 */}
      <line x1={PAD.left} x2={W - PAD.right} y1={volTop} y2={volTop} stroke="rgba(255,255,255,0.08)" strokeWidth="0.5"/>
      <text x={PAD.left - 5} y={volTop + 10} textAnchor="end" fontSize="9" fill="#94a3b8">거래량</text>

      {/* 캔들 */}
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
            <rect x={x - barW/2} y={bTop} width={barW} height={bH} fill={col} opacity={tooltip?.idx === i ? 1 : 0.85}/>
            <rect x={x - barW/2} y={toVolY(c.volume)} width={barW} height={vh} fill={col} opacity="0.4"/>
          </g>
        )
      })}

      {/* MA */}
      {maLines.map(ma => <polyline key={ma.p} points={ma.pts} fill="none" stroke={ma.color} strokeWidth="1.2" opacity="0.9"/>)}

      {/* 드로잉 */}
      {drawings.map((d, i) => {
        if (d.type === 'hline') {
          const y = toY(d.price)
          if (y < PAD.top || y > PAD.top + PRICE_H) return null
          return <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke={d.color || '#f59e0b'} strokeWidth="1.5" strokeDasharray="6,3"/>
            <text x={W - PAD.right + 4} y={y + 4} fontSize="10" fill={d.color || '#f59e0b'}>{Math.round(d.price).toLocaleString()}</text>
          </g>
        }
        if (d.type === 'trend' && d.x1 !== undefined && d.x2 !== undefined) {
          return <line key={i} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#8b5cf6" strokeWidth="1.5" markerEnd="url(#arr)"/>
        }
        if (d.type === 'fib' && d.x1 !== undefined && d.x2 !== undefined) {
          const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
          const range  = d.price2 - d.price1
          return <g key={i}>
            {levels.map((l, li) => {
              const price = d.price2 - range * l
              const y     = toY(price)
              const colors = ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#64748b']
              if (y < PAD.top || y > PAD.top + PRICE_H) return null
              return <g key={li}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke={colors[li]} strokeWidth="1" strokeDasharray="4,4" opacity="0.7"/>
                <text x={W - PAD.right + 4} y={y + 4} fontSize="9" fill={colors[li]}>{(l * 100).toFixed(1)}%</text>
              </g>
            })}
          </g>
        }
        if (d.type === 'text') {
          const x = d.bxVal ?? PAD.left + 50
          const y = toY(d.price)
          if (y < PAD.top || y > PAD.top + PRICE_H) return null
          return <g key={i}>
            <rect x={x - 2} y={y - 13} width={d.text.length * 7 + 8} height={16} fill="rgba(30,41,59,0.9)" stroke="#475569" rx="3" opacity="0.9"/>
            <text x={x + 2} y={y} fontSize="11" fill="#e2e8f0">{d.text}</text>
          </g>
        }
        return null
      })}

      {/* 크로스헤어 + 툴팁 */}
      {td && (
        <>
          <line x1={tooltip.x} x2={tooltip.x} y1={PAD.top} y2={volTop + VOL_H} stroke="rgba(255,255,255,0.3)" strokeDasharray="3,3" strokeWidth="1"/>
          {(() => {
            const tx = tooltip.x > W / 2 ? tooltip.x - 150 : tooltip.x + 10
            const rows = [['시가',td.open],['고가',td.high],['저가',td.low],['종가',td.close],['거래량',td.volume]]
            return <>
              <rect x={tx} y={PAD.top + 4} width={140} height={108} fill="#1e293b" stroke="#334155" rx="6" opacity="0.97"/>
              <text x={tx + 8} y={PAD.top + 17} fontSize="10" fill="#94a3b8" fontWeight="600">{td.label}</text>
              {rows.map(([lbl, val], j) => {
                const col = j===1?'#ef4444':j===2?'#3b82f6':j===3?rateColor(td.close-td.open):'#94a3b8'
                return <g key={j}>
                  <text x={tx + 8}   y={PAD.top + 31 + j*15} fontSize="10" fill="#64748b">{lbl}</text>
                  <text x={tx + 134} y={PAD.top + 31 + j*15} textAnchor="end" fontSize="10" fill={col} fontWeight={j===3?'700':'400'}>
                    {j===4?Number(val).toLocaleString():Math.round(val).toLocaleString()}
                  </text>
                </g>
              })}
            </>
          })()}
        </>
      )}

      {/* 화살표 마커 */}
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M2 1L8 5L2 9" fill="none" stroke="#8b5cf6" strokeWidth="1.5"/>
        </marker>
      </defs>
    </svg>
  )
}

// ══════════════════════════════════════════════
// 전체화면 차트
// ══════════════════════════════════════════════
function FullscreenChart({ stock, onClose }) {
  const [candles,    setCandles]    = useState([])
  const [allCandles, setAllCandles] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [period,     setPeriod]     = useState('day')
  const [minTic,     setMinTic]     = useState('5')
  const [minDays,    setMinDays]    = useState(1)
  const [range,      setRange]      = useState(3)
  const [enabledMA,  setEnabledMA]  = useState(new Set([5, 20, 60, 120]))
  const [showMA,     setShowMA]     = useState(true)
  const [drawTool,   setDrawTool]   = useState('none')
  const [drawings,   setDrawings]   = useState(() => lsGet(`${LS_DRAWINGS}_${stock.code}`, []))
  const [drawState,  setDrawState]  = useState(null) // 드로잉 진행 상태
  const [textInput,  setTextInput]  = useState(null)

  useEffect(() => { const fn = e => e.key==='Escape'&&onClose(); window.addEventListener('keydown',fn); return()=>window.removeEventListener('keydown',fn) }, [onClose])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = `/api/kiwoom?type=stock-chart&code=${stock.code}&period=${period}` +
        (period==='min' ? `&tic=${minTic}&min_days=${minDays}` : '')
      const data = await fetch(url).then(r => r.json())
      setAllCandles(data.candles || [])
    } catch {}
    finally { setLoading(false) }
  }, [stock.code, period, minTic, minDays])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    setCandles(period==='min' ? allCandles : filterByRange(allCandles, range))
  }, [allCandles, range, period])

  const saveDrawings = (next) => { setDrawings(next); lsSet(`${LS_DRAWINGS}_${stock.code}`, next) }

  function handleSvgClick({ x, y, idx, price, bx, toY, PAD, chartW, n }) {
    if (drawTool === 'none') return
    if (drawTool === 'hline') {
      saveDrawings([...drawings, { type:'hline', price }])
    } else if (drawTool === 'trend' || drawTool === 'fib') {
      if (!drawState) {
        setDrawState({ x1:x, y1:y, price1:price })
      } else {
        if (drawTool === 'trend') {
          saveDrawings([...drawings, { type:'trend', x1:drawState.x1, y1:drawState.y1, x2:x, y2:y }])
        } else {
          saveDrawings([...drawings, { type:'fib', x1:drawState.x1, y1:drawState.y1, x2:x, y2:y, price1:drawState.price1, price2:price }])
        }
        setDrawState(null)
      }
    } else if (drawTool === 'text') {
      setTextInput({ x, y, price, bxVal: x })
    }
  }

  const toggleMA = p => setEnabledMA(prev => { const n=new Set(prev); n.has(p)?n.delete(p):n.add(p); return n })

  return (
    <div className="cap-fullscreen-overlay">
      {/* 상단 툴바 */}
      <div className="cap-fs-toolbar">
        <div className="cap-fs-title">{stock.name} <span className="cap-fs-code">{stock.code}</span></div>

        {/* 기간 */}
        <div className="cap-fs-group">
          {PERIODS.map(p => <button key={p.key} className={`cap-fs-btn ${period===p.key?'active':''}`} onClick={() => setPeriod(p.key)}>{p.label}</button>)}
        </div>

        {/* 분봉 옵션 */}
        {period==='min' && <>
          <div className="cap-fs-sep"/>
          <div className="cap-fs-group">
            {MIN_SCOPES.map(s => <button key={s} className={`cap-fs-btn ${minTic===s?'active':''}`} onClick={() => setMinTic(s)}>{s}분</button>)}
          </div>
          <div className="cap-fs-sep"/>
          <div className="cap-fs-group">
            {MIN_DAYS_OPTS.map(d => <button key={d.days} className={`cap-fs-btn ${minDays===d.days?'active':''}`} onClick={() => setMinDays(d.days)}>{d.label}</button>)}
          </div>
        </>}

        {/* 범위 */}
        {period!=='min' && <>
          <div className="cap-fs-sep"/>
          <div className="cap-fs-group">
            {RANGE_OPTS.map(r => <button key={r.months} className={`cap-fs-btn ${range===r.months?'active':''}`} onClick={() => setRange(r.months)}>{r.label}</button>)}
          </div>
        </>}

        <div className="cap-fs-sep"/>

        {/* MA */}
        <div className="cap-fs-group">
          <button className={`cap-fs-btn ${showMA?'active':''}`} onClick={() => setShowMA(v=>!v)}>MA</button>
          {showMA && MA_SETTINGS.map(m => (
            <button key={m.p} className={`cap-fs-btn cap-fs-ma ${enabledMA.has(m.p)?'active':''}`}
              style={enabledMA.has(m.p)?{color:m.color,borderColor:m.color}:{}}
              onClick={() => toggleMA(m.p)}>{m.label}</button>
          ))}
        </div>

        <div className="cap-fs-sep"/>

        {/* 드로잉 툴 */}
        <div className="cap-fs-group">
          {DRAW_TOOLS.map(t => (
            <button key={t.id} className={`cap-fs-btn ${drawTool===t.id?'active':''}`}
              title={t.tip} onClick={() => { setDrawTool(t.id); setDrawState(null) }}>{t.label}</button>
          ))}
          {drawings.length > 0 && (
            <button className="cap-fs-btn cap-fs-del" title="모든 드로잉 삭제" onClick={() => { saveDrawings([]); setDrawState(null) }}>🗑 초기화</button>
          )}
        </div>

        <div style={{marginLeft:'auto', display:'flex', gap:6}}>
          {drawState && <div className="cap-fs-hint">{drawTool==='trend'?'2번째 점 클릭':drawTool==='fib'?'끝점 클릭':''}</div>}
          <button className="cap-fs-close" onClick={onClose}>✕ 닫기</button>
        </div>
      </div>

      {/* 차트 영역 */}
      <div className="cap-fs-body">
        {loading && <div className="cap-fs-loading"><div className="cap-spinner"/>불러오는 중...</div>}
        {!loading && (
          <ChartRenderer
            candles={candles}
            showMA={showMA}
            enabledMA={enabledMA}
            drawings={drawings}
            onSvgClick={handleSvgClick}
            isFullscreen={true}
          />
        )}
      </div>

      {/* 텍스트 입력 팝업 */}
      {textInput && (
        <div className="cap-text-popup" style={{ left: Math.min(textInput.x + 20, window.innerWidth - 220), top: 60 }}>
          <input autoFocus className="cap-text-input" placeholder="메모 입력 후 Enter"
            onKeyDown={e => {
              if (e.key === 'Enter' && e.target.value.trim()) {
                saveDrawings([...drawings, { type:'text', price:textInput.price, bxVal:textInput.bxVal, text:e.target.value.trim() }])
                setTextInput(null); setDrawTool('none')
              }
              if (e.key === 'Escape') { setTextInput(null) }
            }}/>
          <button className="cap-text-cancel" onClick={() => setTextInput(null)}>✕</button>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════
// AI 분석
// ══════════════════════════════════════════════
async function runAI(stock, period, price) {
  const today = new Date().toLocaleDateString('ko-KR')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body: JSON.stringify({
      model:'claude-haiku-4-5-20251001', max_tokens:1000,
      tools:[{type:'web_search_20250305',name:'web_search'}],
      messages:[{role:'user',content:`오늘(${today}) ${stock.name}(${stock.code}) 분석.\n현재가:${fmt(price?.price)}원, 등락률:${fmtRate(price?.changeRate)}, 기간:${period}\n\n## 📌 종목 현황\n## 📈 기술적 분석\n## 🔑 핵심 뉴스\n## 🎯 지지·저항 레벨\n## ⚠️ 리스크\n## 💡 투자 의견`}],
    }),
  })
  if (!res.ok) throw new Error(`API 오류 ${res.status}`)
  const data = await res.json()
  return data.content.filter(b=>b.type==='text').map(b=>b.text).join('\n')
}

// ══════════════════════════════════════════════
// 메인
// ══════════════════════════════════════════════
export default function ChartAnalysisPage() {
  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState([])
  const [showDrop,    setShowDrop]    = useState(false)
  const [selected,    setSelected]    = useState(null)
  const [recent,      setRecent]      = useState(() => lsGet(LS_RECENT, []))
  const [watchlist,   setWatchlist]   = useState(() => lsGet(LS_WATCHLIST, []))
  const [period,      setPeriod]      = useState('day')
  const [minTic,      setMinTic]      = useState('5')
  const [minDays,     setMinDays]     = useState(1)
  const [range,       setRange]       = useState(3)
  const [enabledMA,   setEnabledMA]   = useState(new Set([5, 20, 60, 120]))
  const [showMA,      setShowMA]      = useState(true)
  const [activeTab,   setActiveTab]   = useState('chart')
  const [showFull,    setShowFull]    = useState(false)
  const [showSupply,  setShowSupply]  = useState(false)
  const [drawings,    setDrawings]    = useState([])      // 인라인 드로잉
  const [drawTool,    setDrawTool]    = useState('none')  // 인라인 드로잉 툴
  const [drawState,   setDrawState]   = useState(null)    // 드로잉 진행 중
  const [textInput,   setTextInput]   = useState(null)
  const [allCandles,  setAllCandles]  = useState([])
  const [chartLoading,setChartLoading]= useState(false)
  // 수급
  const [foreignData, setForeignData] = useState(null)
  const [shortData,   setShortData]   = useState(null)
  const [strData,     setStrData]     = useState(null)
  const [supplyLoading,setSupplyLoading] = useState(false)
  // AI
  const [aiResult,    setAiResult]    = useState('')
  const [aiLoading,   setAiLoading]   = useState(false)
  const [aiError,     setAiError]     = useState('')

  const codes = selected ? [selected.code] : []
  const { prices } = useStockPrices(codes, getKstStatus()==='open'?30000:300000)
  const price = selected ? prices[selected.code] : null

  // 인라인 차트용 필터
  const candles = useMemo(() =>
    period === 'min' ? allCandles : filterByRange(allCandles, range)
  , [allCandles, range, period])

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
    setAllCandles([])
    const next = [stock, ...recent.filter(r => r.code !== stock.code)].slice(0, 8)
    setRecent(next); lsSet(LS_RECENT, next)
  }

  // 차트 로드
  const loadChart = useCallback(async () => {
    if (!selected) return
    setChartLoading(true)
    try {
      const url = `/api/kiwoom?type=stock-chart&code=${selected.code}&period=${period}` +
        (period==='min' ? `&tic=${minTic}&min_days=${minDays}` : '')
      const data = await fetch(url).then(r => r.json())
      setAllCandles(data.candles || [])
    } catch {}
    finally { setChartLoading(false) }
  }, [selected, period, minTic, minDays])

  useEffect(() => { if (selected) loadChart() }, [loadChart])

  const toggleWatch = () => {
    if (!selected) return
    const exists = watchlist.find(w => w.code === selected.code)
    const next = exists ? watchlist.filter(w => w.code !== selected.code) : [selected, ...watchlist].slice(0, 20)
    setWatchlist(next); lsSet(LS_WATCHLIST, next)
  }
  const isWatched = selected && watchlist.find(w => w.code === selected.code)
  const toggleMA = p => setEnabledMA(prev => { const n=new Set(prev); n.has(p)?n.delete(p):n.add(p); return n })

  // 수급
  const loadSupply = useCallback(async () => {
    if (!selected) return
    setSupplyLoading(true)
    try {
      const [f, sh, st] = await Promise.all([
        fetch(`/api/kiwoom?type=supply-foreign&code=${selected.code}`).then(r=>r.json()),
        fetch(`/api/kiwoom?type=supply-short&code=${selected.code}&days=30`).then(r=>r.json()),
        fetch(`/api/kiwoom?type=supply-strength&code=${selected.code}`).then(r=>r.json()),
      ])
      setForeignData(f.data?.slice(0,20)||[]); setShortData(sh.data?.slice(0,20)||[]); setStrData(st.data?.slice(0,20)||[])
    } catch {}
    finally { setSupplyLoading(false) }
  }, [selected])
  useEffect(() => { if (activeTab==='supply'&&selected&&!foreignData) loadSupply() }, [activeTab, selected])

  const doAI = async () => {
    if (!selected||!CLAUDE_KEY) return
    setAiLoading(true); setAiError('')
    try { setAiResult(await runAI(selected, period, price)) }
    catch (e) { setAiError(e.message) }
    finally { setAiLoading(false) }
  }

  // 드로잉 저장
  const saveDrawings = (next) => {
    setDrawings(next)
    if (selected) lsSet(`${LS_DRAWINGS}_${selected.code}`, next)
  }

  // 종목 선택 시 드로잉 불러오기
  const selectWithDrawings = (stock) => {
    select(stock)
    setDrawings(lsGet(`${LS_DRAWINGS}_${stock.code}`, []))
    setDrawTool('none'); setDrawState(null)
  }

  // SVG 클릭 핸들러 (인라인)
  function handleInlineSvgClick({ x, y, idx, price: clickPrice, bx, toY }) {
    if (drawTool === 'none') return
    if (drawTool === 'hline') {
      saveDrawings([...drawings, { type:'hline', price:clickPrice }])
    } else if (drawTool === 'trend' || drawTool === 'fib') {
      if (!drawState) {
        setDrawState({ x1:x, y1:y, price1:clickPrice })
      } else {
        if (drawTool === 'trend') {
          saveDrawings([...drawings, { type:'trend', x1:drawState.x1, y1:drawState.y1, x2:x, y2:y }])
        } else {
          saveDrawings([...drawings, { type:'fib', x1:drawState.x1, y1:drawState.y1, x2:x, y2:y, price1:drawState.price1, price2:clickPrice }])
        }
        setDrawState(null)
      }
    } else if (drawTool === 'text') {
      setTextInput({ x, y, price: clickPrice })
    }
  }

  const pc   = price ? rateColor(price.changeRate) : '#94a3b8'
  const sign = price?.changeRate > 0 ? '+' : ''

  const TABS = [{ id:'chart', label:'📈 차트' }, { id:'ai', label:'🤖 AI 분석' }]

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
            onKeyDown={e => e.key==='Escape'&&setShowDrop(false)}/>
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
            {recent.map(r => <button key={r.code} className="cap-chip" onClick={() => selectWithDrawings(r)}>{r.name}</button>)}
          </div>
        )}
        {!selected && watchlist.length > 0 && (
          <div className="cap-chips-row"><span className="cap-chip-label">⭐ 즐겨찾기</span>
            {watchlist.map(w => <button key={w.code} className="cap-chip cap-chip-star" onClick={() => selectWithDrawings(w)}>{w.name}</button>)}
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
                <span className="cap-price" style={{color:pc}}>{fmt(price.price)}원</span>
                <span className="cap-change" style={{color:pc}}>{sign}{price.changeRate?.toFixed(2)}%</span>
              </>}
            </div>
            <div className="cap-stock-right">
              <button className={`cap-btn-watch ${isWatched?'active':''}`} onClick={toggleWatch}>
                {isWatched?'⭐':'☆'} {isWatched?'해제':'즐겨찾기'}
              </button>
              <button className="cap-btn-close" onClick={() => { setSelected(null); setQuery('') }}>✕</button>
            </div>
          </div>

          {/* 탭 */}
          <div className="cap-tabs">
            {TABS.map(t => <button key={t.id} className={`cap-tab ${activeTab===t.id?'active':''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>)}
          </div>

          {/* ── 차트 탭 ── */}
          {activeTab === 'chart' && (
            <div className="cap-chart-section">
              {/* 컨트롤 바 */}
              <div className="cap-ctrl-bar">
                {/* 기간 */}
                <div className="cap-period-group">
                  {PERIODS.map(p => <button key={p.key} className={`cap-period-btn ${period===p.key?'active':''}`} onClick={() => setPeriod(p.key)}>{p.label}</button>)}
                </div>

                {/* 분봉 옵션 */}
                {period==='min' && <>
                  <div className="cap-sep"/>
                  <div className="cap-period-group">
                    {MIN_SCOPES.map(s => <button key={s} className={`cap-period-btn ${minTic===s?'active':''}`} onClick={() => setMinTic(s)}>{s}분</button>)}
                  </div>
                  <div className="cap-sep"/>
                  <div className="cap-period-group">
                    {MIN_DAYS_OPTS.map(d => <button key={d.days} className={`cap-period-btn ${minDays===d.days?'active':''}`} onClick={() => setMinDays(d.days)}>{d.label}</button>)}
                  </div>
                </>}

                {/* 범위 */}
                {period!=='min' && <>
                  <div className="cap-sep"/>
                  <div className="cap-period-group">
                    {RANGE_OPTS.map(r => <button key={r.months} className={`cap-period-btn ${range===r.months?'active':''}`} onClick={() => setRange(r.months)}>{r.label}</button>)}
                  </div>
                </>}

                <div className="cap-sep"/>

                {/* MA */}
                <button className={`cap-ma-btn ${showMA?'active':''}`} onClick={() => setShowMA(v=>!v)}>MA</button>
                {showMA && MA_SETTINGS.map(m => (
                  <button key={m.p} className={`cap-ma-chip ${enabledMA.has(m.p)?'active':''}`}
                    style={enabledMA.has(m.p)?{color:m.color,borderColor:m.color,background:m.color+'18'}:{}}
                    onClick={() => toggleMA(m.p)}>{m.label}</button>
                ))}

                <div style={{marginLeft:'auto', display:'flex', gap:6}}>
                  <button className={`cap-period-btn ${showSupply?'active':''}`}
                    onClick={() => { setShowSupply(v=>!v); if (!foreignData && !showSupply) loadSupply() }}>
                    📊 수급
                  </button>
                  <button className="cap-fullscreen-btn" onClick={() => setShowFull(true)}>⛶ 전체화면</button>
                </div>
              </div>

              {/* 종목 정보 바 */}
              {price?.price > 0 && (
                <div className="cap-info-bar">
                  {[
                    ['현재가', `${fmt(price.price)}원`,             pc],
                    ['등락률', `${sign}${price.changeRate?.toFixed(2)}%`, pc],
                    ['거래량', `${fmtShort(price.volume)}주`,       null],
                    ['PER',    price.per ? `${Number(price.per).toFixed(1)}배` : '-', null],
                    ['PBR',    price.pbr ? `${Number(price.pbr).toFixed(2)}배` : '-', null],
                    ['외국인', price.forExhRt ? `${price.forExhRt}%` : '-', null],
                  ].map(([label, val, color]) => (
                    <div key={label} className="cap-info-item">
                      <div className="cap-info-label">{label}</div>
                      <div className="cap-info-val" style={{color:color||'#0f172a'}}>{val}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 드로잉 툴바 */}
              <div className="cap-draw-bar">
                {[
                  { id:'none',  label:'🖱️ 선택'  },
                  { id:'hline', label:'━ 수평선' },
                  { id:'trend', label:'↗ 추세선' },
                  { id:'fib',   label:'🔢 피보나치' },
                  { id:'text',  label:'📝 메모'  },
                ].map(t => (
                  <button key={t.id}
                    className={`cap-draw-btn ${drawTool === t.id ? 'active' : ''}`}
                    title={t.label}
                    onClick={() => { setDrawTool(t.id); setDrawState(null) }}>
                    {t.label}
                  </button>
                ))}
                {drawings.length > 0 && (
                  <button className="cap-draw-btn cap-draw-del"
                    onClick={() => { saveDrawings([]); setDrawState(null) }}
                    title="드로잉 초기화">
                    🗑 초기화
                  </button>
                )}
                {drawState && (
                  <span className="cap-draw-hint">
                    {drawTool === 'trend' ? '2번째 점 클릭' : drawTool === 'fib' ? '끝점 클릭' : ''}
                  </span>
                )}
              </div>

              {/* 인라인 차트 */}
              <div className="cap-chart-area" style={{cursor: drawTool !== 'none' ? 'crosshair' : 'default'}}>
                {chartLoading
                  ? <div className="cap-chart-loading"><div className="cap-spinner"/>차트 불러오는 중...</div>
                  : <ChartRenderer candles={candles} showMA={showMA} enabledMA={enabledMA} drawings={drawings} onSvgClick={handleInlineSvgClick} isFullscreen={false}/>}
              </div>

              {/* 텍스트 메모 입력 */}
              {textInput && (
                <div className="cap-text-popup-inline">
                  <input autoFocus className="cap-text-input" placeholder="메모 입력 후 Enter"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        saveDrawings([...drawings, { type:'text', price:textInput.price, bxVal:textInput.x, text:e.target.value.trim() }])
                        setTextInput(null); setDrawTool('none')
                      }
                      if (e.key === 'Escape') setTextInput(null)
                    }}/>
                  <button className="cap-text-cancel" onClick={() => setTextInput(null)}>✕</button>
                </div>
              )}

              {/* 수급 서브차트 */}
              {showSupply && (
                <div className="cap-supply-sub">
                  {supplyLoading && <div className="cap-chart-loading"><div className="cap-spinner"/>수급 데이터 로딩 중...</div>}
                  {!supplyLoading && !foreignData && <div style={{padding:'12px',textAlign:'center'}}><button className="cap-btn-primary" onClick={loadSupply}>📡 수급 데이터 불러오기</button></div>}
                  {!supplyLoading && foreignData && (
                    <div className="cap-supply-charts">
                      <SupplyMiniBarChart title="🌐 외국인 순매수" data={(foreignData||[]).map(r=>({date:r.dt,value:Number(r.chg_qty||0)}))} color="#3b82f6"/>
                      <SupplyMiniLineChart title="📉 공매도 비중%" data={(shortData||[]).map(r=>({date:r.dt,value:parseFloat(r.trde_wght||0)}))} color="#ef4444"/>
                      <SupplyMiniLineChart title="⚡ 체결강도" data={(strData||[]).map(r=>({date:r.dt,value:parseFloat(r.cntr_str||50)-50}))} color="#10b981" baseline={0}/>
                    </div>
                  )}
                </div>
              )}

              {/* 링크 */}
              <div className="cap-links-row">
                <a href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(selected.name)}`} target="_blank" rel="noreferrer" className="cap-ext-link">📋 DART 공시 →</a>
                <a href={`https://finance.naver.com/item/main.naver?code=${selected.code}`} target="_blank" rel="noreferrer" className="cap-ext-link">📊 네이버 증권 →</a>
              </div>
            </div>
          )}

          {/* 수급은 차트 탭 하단 서브차트로 통합 */}

          {/* ── AI 탭 ── */}
          {activeTab === 'ai' && (
            <div className="cap-ai-section">
              <div className="cap-ai-header">
                <div>🤖 <strong>{selected.name}</strong> 웹 검색 기반 AI 분석</div>
                <div className="cap-ai-controls">
                  {PERIODS.map(p => <button key={p.key} className={`cap-period-btn ${period===p.key?'active':''}`} onClick={() => setPeriod(p.key)}>{p.label}</button>)}
                  <button className="cap-btn-primary" onClick={doAI} disabled={aiLoading||!CLAUDE_KEY}>
                    {aiLoading?'⟳ 분석 중...':aiResult?'↺ 다시 분석':'🔍 AI 분석 시작'}
                  </button>
                </div>
              </div>
              {!CLAUDE_KEY&&<div className="cap-ai-warn">⚠️ VITE_CLAUDE_API_KEY 미설정</div>}
              {aiError&&<div className="cap-ai-error">⚠️ {aiError}</div>}
              {aiLoading&&<div className="cap-loading"><div className="cap-spinner"/>{selected.name} 분석 중...</div>}
              {aiResult&&!aiLoading&&<div className="cap-ai-result"><div className="cap-ai-badge">🔍 웹 검색 기반 · {new Date().toLocaleTimeString('ko-KR')}</div><MarkdownView text={aiResult}/></div>}
              {!aiResult&&!aiLoading&&!aiError&&<div className="cap-ai-placeholder"><p><strong>AI 분석 시작</strong> 버튼을 눌러보세요</p><p className="cap-ai-sub">웹 검색 + 기술적 분석 종합</p></div>}
            </div>
          )}
        </div>
      )}

      {!selected && watchlist.length===0 && recent.length===0 && (
        <div className="cap-empty"><div className="cap-empty-icon">📈</div><p>종목명 또는 코드를 검색해 차트 분석을 시작하세요</p><p className="cap-empty-sub">예: 삼성전자, SK하이닉스, 005930</p></div>
      )}

      {/* 전체화면 차트 */}
      {showFull && selected && <FullscreenChart stock={selected} onClose={() => setShowFull(false)}/>}
    </div>
  )
}
