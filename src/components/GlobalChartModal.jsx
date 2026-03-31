// src/components/GlobalChartModal.jsx
// 환율 / 해외지수 전용 차트 모달
// - 기간: 1개월 / 3개월 / 6개월 / 1년 / 5년
// - 차트 타입: 캔들 / 라인
// - 데이터: /api/kis?type=global (해외지수) or type=forex-chart (환율)
//   둘 다 Yahoo Finance OHLC 응답

import { useState, useEffect, useRef, useCallback } from 'react'
import './GlobalChartModal.css'

// ── 기간 탭 정의 ─────────────────────────────────────
const RANGES = [
  { label: '1개월', value: '1mo'  },
  { label: '3개월', value: '3mo'  },
  { label: '6개월', value: '6mo'  },
  { label: '1년',   value: '1y'   },
  { label: '5년',   value: '5y'   },
]

// ── 숫자 포맷 ────────────────────────────────────────
function fmtNum(v, digits = 2) {
  if (!v && v !== 0) return '—'
  return Number(v).toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}
function fmtDate(d, range) {
  // d = "20250101"
  if (!d || d.length < 8) return d
  if (range === '5y' || range === '2y') return d.slice(0, 4)         // 연도: "2024"
  if (range === '1y')                   return d.slice(4, 6) + '월'  // 월: "03월"
  return `${d.slice(4,6)}/${d.slice(6,8)}`                           // 일: "03/15"
}
function fmtDateLong(d) {
  if (!d || d.length < 8) return d
  return `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}`
}

// ── SVG 캔들 차트 (드로잉 지원) ─────────────────────
function CandleSvg({ candles, range,
                     drawings=[], drawTool='none', drawPhase=0,
                     drawPoint1=null, mousePos=null, selectedColor='#f59e0b',
                     onChartClick, onChartMouseMove, onChartMouseLeave }) {
  const svgRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)

  if (!candles?.length) return (
    <div className="gcm-no-data">데이터 없음</div>
  )

  const W = 820, H = 320
  const PAD = { top: 20, right: 60, bottom: 36, left: 10 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const maxBars = range === '5y' ? 60 : range === '1y' ? 52 : range === '6mo' ? 130 : range === '3mo' ? 65 : 30
  const data = candles.slice(-maxBars)

  const highs  = data.map(c => c.high  || c.close)
  const lows   = data.map(c => c.low   || c.close)
  const closes = data.map(c => c.close)
  const rawMin = Math.min(...lows)
  const rawMax = Math.max(...highs)
  const pad5   = (rawMax - rawMin) * 0.05 || rawMax * 0.01
  const yMin   = rawMin - pad5
  const yMax   = rawMax + pad5
  const yRange = yMax - yMin || 1

  const toX = idx   => PAD.left + (idx / Math.max(data.length - 1, 1)) * chartW
  const toY = price => PAD.top  + ((yMax - price) / yRange) * chartH
  const barW = Math.max(2, Math.floor(chartW / data.length * 0.7))
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + (yRange * i) / 4)

  const xLabels = (() => {
    if (range === '5y' || range === '2y') {
      const seen = new Set()
      return data.filter(c => { const yr = c.date?.slice(0, 4); if (!yr || seen.has(yr)) return false; seen.add(yr); return true })
    }
    if (range === '1y') {
      const seen = new Set()
      return data.filter(c => { const mo = c.date?.slice(0, 6); if (!mo || seen.has(mo)) return false; seen.add(mo); return true })
    }
    const step = Math.max(1, Math.floor(data.length / 6))
    return data.filter((_, i) => i % step === 0 || i === data.length - 1)
  })()

  function calcMA(arr, period) {
    return arr.map((_, i) => {
      if (i < period - 1) return null
      return arr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
    })
  }
  const ma5  = calcMA(closes, 5)
  const ma20 = calcMA(closes, 20)

  // SVG 좌표 → 데이터 좌표
  const getSvgCoords = (e) => {
    const svg  = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const svgX = (e.clientX - rect.left) * (W / rect.width)
    const svgY = (e.clientY - rect.top)  * (H / rect.height)
    const rawIdx = ((svgX - PAD.left) / chartW) * (data.length - 1)
    const idx    = Math.max(0, Math.min(data.length - 1, Math.round(rawIdx)))
    const price  = yMax - ((svgY - PAD.top) / chartH) * yRange
    return { svgX, svgY, idx, price }
  }

  const handleMouseMove = (e) => {
    const c = getSvgCoords(e)
    if (!c) return
    if (c.idx >= 0 && c.idx < data.length) setTooltip({ c: data[c.idx], x: toX(c.idx) })
    if (onChartMouseMove) onChartMouseMove(c)
  }
  const handleClick      = (e) => { const c = getSvgCoords(e); if (c && onChartClick) onChartClick(c) }
  const handleLeave      = () => { setTooltip(null); if (onChartMouseLeave) onChartMouseLeave() }

  // 드로잉 렌더 함수
  function renderDrawing(d, key, preview = false) {
    const color = preview ? (selectedColor || '#f59e0b') : (d.color || '#f59e0b')
    const sw    = 1.5
    const dash  = preview ? '5 4' : undefined
    const op    = preview ? 0.75 : 1

    if (d.type === 'hline') {
      const y = toY(d.price)
      if (!isFinite(y)) return null
      return (
        <g key={key} opacity={op}>
          <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
            stroke={color} strokeWidth={sw} strokeDasharray={dash}/>
          {!preview && (
            <text x={W - PAD.right + 4} y={y + 4} fontSize="9" fill={color}>
              {fmtNum(d.price, d.price > 100 ? 0 : 2)}
            </text>
          )}
        </g>
      )
    }
    if (d.type === 'vline') {
      const x = toX(d.idx)
      if (!isFinite(x)) return null
      return (
        <g key={key} opacity={op}>
          <line x1={x} y1={PAD.top} x2={x} y2={PAD.top + chartH}
            stroke={color} strokeWidth={sw} strokeDasharray={dash}/>
          {!preview && d.date && (
            <text x={x} y={PAD.top + chartH + 14} fontSize="9" fill={color} textAnchor="middle">
              {fmtDate(d.date, range)}
            </text>
          )}
        </g>
      )
    }
    if (d.type === 'trendline' && d.price1 != null && d.price2 != null) {
      const x1=toX(d.idx1), y1=toY(d.price1), x2=toX(d.idx2), y2=toY(d.price2)
      if (!isFinite(x1)||!isFinite(y1)||!isFinite(x2)||!isFinite(y2)) return null
      return <line key={key} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth={sw} strokeDasharray={dash} opacity={op}/>
    }
    if (d.type === 'rect' && d.price1 != null && d.price2 != null) {
      const x1=toX(d.idx1), y1=toY(d.price1), x2=toX(d.idx2), y2=toY(d.price2)
      if (!isFinite(x1)||!isFinite(y1)||!isFinite(x2)||!isFinite(y2)) return null
      return (
        <rect key={key}
          x={Math.min(x1,x2)} y={Math.min(y1,y2)}
          width={Math.abs(x2-x1)} height={Math.abs(y2-y1)}
          fill={color} fillOpacity={preview ? 0.06 : 0.08}
          stroke={color} strokeWidth={sw} strokeDasharray={dash} opacity={op}/>
      )
    }
    return null
  }

  // 미리보기 드로잉
  const preview = (() => {
    if (drawTool === 'none' || !mousePos) return null
    if (drawTool === 'hline') return { type:'hline', price: mousePos.price }
    if (drawTool === 'vline') return { type:'vline', idx: mousePos.idx, date: data[mousePos.idx]?.date }
    if (drawPhase === 1 && drawPoint1) {
      if (drawTool === 'trendline') return { type:'trendline', idx1:drawPoint1.idx, price1:drawPoint1.price, idx2:mousePos.idx, price2:mousePos.price }
      if (drawTool === 'rect')      return { type:'rect', idx1:drawPoint1.idx, price1:drawPoint1.price, idx2:mousePos.idx, price2:mousePos.price }
    }
    return null
  })()

  return (
    <div className="gcm-svg-wrap" onMouseLeave={handleLeave}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="gcm-svg"
        style={{ cursor: drawTool === 'none' ? 'default' : 'crosshair' }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      >
        {/* 그리드 */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={toY(t)}
              x2={W - PAD.right} y2={toY(t)}
              stroke="rgba(0,0,0,0.06)" strokeDasharray="4 4"
            />
            <text
              x={W - PAD.right + 6} y={toY(t) + 4}
              fontSize="10" fill="#94a3b8" textAnchor="start"
            >
              {fmtNum(t, t > 100 ? 0 : 2)}
            </text>
          </g>
        ))}

        {/* X축 레이블 */}
        {xLabels.map((c, i) => {
          const idx2 = data.indexOf(c)
          const x = PAD.left + (idx2 / (data.length - 1)) * chartW
          return (
            <text key={i} x={x} y={H - 6} fontSize="10" fill="#94a3b8" textAnchor="middle">
              {fmtDate(c.date, range)}
            </text>
          )
        })}

        {/* 캔들 */}
        {data.map((c, i) => {
          const x  = toX(i)
          const o  = toY(c.open  || c.close)
          const h  = toY(c.high  || c.close)
          const l  = toY(c.low   || c.close)
          const cl = toY(c.close)
          const isUp   = c.close >= (c.open || c.close)
          const color  = isUp ? '#22c55e' : '#ef4444'
          const bodyTop    = Math.min(o, cl)
          const bodyBottom = Math.max(o, cl)
          const bodyH = Math.max(1, bodyBottom - bodyTop)
          return (
            <g key={i}>
              <line x1={x} y1={h} x2={x} y2={l} stroke={color} strokeWidth="1"/>
              <rect
                x={x - barW / 2} y={bodyTop}
                width={barW} height={bodyH}
                fill={color} fillOpacity={isUp ? 0.85 : 1}
                stroke={color} strokeWidth="0.5"
              />
            </g>
          )
        })}

        {/* MA5 */}
        {(() => {
          const pts = ma5.map((v, i) => v !== null
            ? `${toX(i).toFixed(1)},${toY(v).toFixed(1)}` : null
          ).filter(Boolean).join(' ')
          return pts ? <polyline points={pts} fill="none" stroke="#f59e0b" strokeWidth="1.2" opacity="0.85"/> : null
        })()}
        {/* MA20 */}
        {(() => {
          const pts = ma20.map((v, i) => v !== null
            ? `${toX(i).toFixed(1)},${toY(v).toFixed(1)}` : null
          ).filter(Boolean).join(' ')
          return pts ? <polyline points={pts} fill="none" stroke="#a78bfa" strokeWidth="1.2" opacity="0.85"/> : null
        })()}

        {/* 저장된 드로잉 */}
        {drawings.map((d, i) => renderDrawing(d, i, false))}

        {/* 미리보기 드로잉 */}
        {preview && renderDrawing(preview, 'preview', true)}

        {/* 1번째 점 마커 */}
        {drawPhase === 1 && drawPoint1 && (() => {
          const x = toX(drawPoint1.idx), y = toY(drawPoint1.price)
          return isFinite(x) && isFinite(y)
            ? <circle cx={x} cy={y} r="4" fill={selectedColor || '#f59e0b'} opacity="0.9"/>
            : null
        })()}

        {/* 크로스헤어 (선택 모드) */}
        {tooltip && drawTool === 'none' && (
          <line
            x1={tooltip.x} y1={PAD.top}
            x2={tooltip.x} y2={PAD.top + chartH}
            stroke="rgba(0,0,0,0.18)" strokeWidth="1" strokeDasharray="3 3"
          />
        )}
      </svg>

      {/* 툴팁 박스 */}
      {tooltip && drawTool === 'none' && (
        <div className="gcm-tooltip" style={{
          left: `${Math.min(tooltip.x / W * 100, 75)}%`,
        }}>
          <div className="gcm-tt-date">{fmtDateLong(tooltip.c.date)}</div>
          <div>시가: <b>{fmtNum(tooltip.c.open)}</b></div>
          <div>고가: <b style={{color:'#22c55e'}}>{fmtNum(tooltip.c.high)}</b></div>
          <div>저가: <b style={{color:'#ef4444'}}>{fmtNum(tooltip.c.low)}</b></div>
          <div>종가: <b>{fmtNum(tooltip.c.close)}</b></div>
        </div>
      )}

      {/* MA 범례 */}
      <div className="gcm-ma-legend">
        <span style={{color:'#f59e0b'}}>● MA5</span>
        <span style={{color:'#a78bfa'}}>● MA20</span>
      </div>

      {/* 드로잉 힌트 */}
      {drawTool !== 'none' && (
        <div className="gcm-draw-hint">
          {(drawTool==='trendline'||drawTool==='rect') && drawPhase===0 ? '1번째 점 클릭'
           : (drawTool==='trendline'||drawTool==='rect') && drawPhase===1 ? '2번째 점 클릭'
           : '클릭해서 추가'}
        </div>
      )}
    </div>
  )
}

// ── 메인 모달 ────────────────────────────────────────
export default function GlobalChartModal({
  // 해외지수: type='global', symbol='SP500', name='S&P 500'
  // 환율:     type='forex',  symbol='KRW',   name='USD/KRW'
  type = 'global',
  symbol,
  name,
  currentPrice,
  changeRate,
  onClose,
}) {
  const [range,         setRange]         = useState('6mo')
  const [candles,       setCandles]       = useState([])
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  // 드로잉 상태
  const [drawings,      setDrawings]      = useState(() => { try { return JSON.parse(localStorage.getItem(`gcm_draw_${symbol}`)) || [] } catch { return [] } })
  const [drawTool,      setDrawTool]      = useState('none')
  const [drawPhase,     setDrawPhase]     = useState(0)
  const [drawPoint1,    setDrawPoint1]    = useState(null)
  const [mousePos,      setMousePos]      = useState(null)
  const [selectedColor, setSelectedColor] = useState('#f59e0b')

  // ESC 키
  useEffect(() => {
    const h = e => {
      if (e.key !== 'Escape') return
      if (drawPhase > 0) { setDrawPhase(0); setDrawPoint1(null) }
      else if (drawTool !== 'none') setDrawTool('none')
      else onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, drawTool, drawPhase])

  // 스크롤 막기
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // 데이터 로드
  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    setError('')
    const url = type === 'forex'
      ? `/api/kis?type=forex-chart&pair=${symbol}&range=${range}`
      : `/api/kis?type=global&symbol=${symbol}&range=${range}`
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setCandles(data.candles || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [type, symbol, range])

  // 드로잉 저장 (변경 시마다)
  useEffect(() => {
    try { localStorage.setItem(`gcm_draw_${symbol}`, JSON.stringify(drawings)) } catch {}
  }, [symbol, drawings])

  // 등락율 — prop 대신 로드된 캔들 마지막 2봉으로 계산
  const computedRate = candles.length >= 2
    ? (candles[candles.length-1].close - candles[candles.length-2].close)
      / candles[candles.length-2].close * 100
    : null
  const rateColor = computedRate == null ? '#94a3b8' : computedRate > 0 ? '#22c55e' : computedRate < 0 ? '#ef4444' : '#94a3b8'

  // 드로잉 클릭 핸들러
  const handleChartClick = useCallback((coords) => {
    if (drawTool === 'none') return
    const maxBars = range==='5y'?60:range==='1y'?52:range==='6mo'?130:range==='3mo'?65:30
    const data = candles.slice(-maxBars)
    if (drawTool === 'hline') {
      setDrawings(p => [...p, { type:'hline', price:coords.price, color:selectedColor }])
      return
    }
    if (drawTool === 'vline') {
      setDrawings(p => [...p, { type:'vline', idx:coords.idx, date:data[coords.idx]?.date, color:selectedColor }])
      return
    }
    if (drawPhase === 0) { setDrawPoint1(coords); setDrawPhase(1) }
    else {
      const d = drawTool === 'trendline'
        ? { type:'trendline', idx1:drawPoint1.idx, price1:drawPoint1.price, idx2:coords.idx, price2:coords.price, color:selectedColor }
        : { type:'rect',      idx1:drawPoint1.idx, price1:drawPoint1.price, idx2:coords.idx, price2:coords.price, color:selectedColor }
      setDrawings(p => [...p, d])
      setDrawPhase(0); setDrawPoint1(null)
    }
  }, [drawTool, drawPhase, drawPoint1, candles, range, selectedColor])

  const handleMouseMove = useCallback((c) => setMousePos(c), [])
  const handleLeave     = useCallback(() => setMousePos(null), [])

  return (
    <div className="gcm-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="gcm-modal">

        {/* 헤더 */}
        <div className="gcm-header">
          <div className="gcm-title-row">
            <span className="gcm-name">{name}</span>
            <span className="gcm-price">
              {fmtNum(currentPrice, currentPrice > 100 ? 2 : 4)}
            </span>
            {computedRate != null && (
              <span className="gcm-rate" style={{ color: rateColor }}>
                ({computedRate >= 0 ? '+' : ''}{fmtNum(computedRate, 2)}%)
              </span>
            )}
          </div>

          <div className="gcm-controls">
            {/* 기간 탭 */}
            <div className="gcm-range-tabs">
              {RANGES.map(r => (
                <button
                  key={r.value}
                  className={`gcm-range-btn ${range === r.value ? 'active' : ''}`}
                  onClick={() => setRange(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <button className="gcm-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* 드로잉 툴바 */}
        <div className="gcm-draw-toolbar">
          <div className="gcm-draw-tools">
            {[
              { id:'none',      label:'🖱️ 선택',  title:'기본 모드' },
              { id:'trendline', label:'📏 추세선', title:'두 점 클릭 → 추세선' },
              { id:'hline',     label:'━ 수평선', title:'클릭한 가격에 수평선' },
              { id:'vline',     label:'┃ 수직선', title:'클릭한 날짜에 수직선' },
              { id:'rect',      label:'▭ 사각형', title:'두 점 클릭 → 사각형' },
            ].map(t => (
              <button key={t.id}
                className={`gcm-draw-btn ${drawTool === t.id ? 'active' : ''}`}
                title={t.title}
                onClick={() => { setDrawTool(t.id); setDrawPhase(0); setDrawPoint1(null) }}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="gcm-color-picks">
            {['#f59e0b','#3b82f6','#22c55e','#ef4444','#a78bfa'].map(c => (
              <button key={c}
                className={`gcm-color-dot ${selectedColor === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => setSelectedColor(c)}/>
            ))}
          </div>
          <div className="gcm-draw-actions">
            <button className="gcm-draw-act-btn"
              disabled={drawings.length === 0}
              title="마지막 드로잉 삭제"
              onClick={() => { setDrawings(p => p.slice(0,-1)); setDrawPhase(0); setDrawPoint1(null) }}>
              ↩ 실행취소
            </button>
            <button className="gcm-draw-act-btn gcm-draw-clear"
              disabled={drawings.length === 0}
              title="전체 초기화"
              onClick={() => { setDrawings([]); setDrawPhase(0); setDrawPoint1(null) }}>
              🗑 초기화
            </button>
            {drawings.length > 0 && (
              <span className="gcm-draw-count">{drawings.length}개 저장됨</span>
            )}
          </div>
        </div>

        {/* 차트 영역 */}
        <div className="gcm-body">
          {loading && (
            <div className="gcm-loading">
              <div className="gcm-spinner"/>
              <span>데이터 로딩 중...</span>
            </div>
          )}
          {error && !loading && (
            <div className="gcm-error">⚠️ {error}</div>
          )}
          {!loading && !error && (
            <CandleSvg candles={candles} chartType="candle" range={range}
              drawings={drawings} drawTool={drawTool}
              drawPhase={drawPhase} drawPoint1={drawPoint1}
              mousePos={mousePos} selectedColor={selectedColor}
              onChartClick={handleChartClick}
              onChartMouseMove={handleMouseMove}
              onChartMouseLeave={handleLeave}
            />
          )}
        </div>

        {/* 데이터 출처 */}
        <div className="gcm-footer">
          데이터: Yahoo Finance · {candles.length}개 봉 · 캔들 차트
          {drawings.length > 0 && ` · ✏️ 드로잉 ${drawings.length}개 저장됨`}
        </div>
      </div>
    </div>
  )
}
