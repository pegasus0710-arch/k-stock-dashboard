// src/components/ui/CandleSvg.jsx
// 공용 캔들/선형 SVG 차트 컴포넌트
// GlobalChartModal + HeroChart 에서 공통 사용
import { useState, useRef } from 'react'

// ── 유틸 ────────────────────────────────────────────
export function fmtNum(v, digits = 2) {
  if (!v && v !== 0) return '—'
  return Number(v).toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}
export function fmtDate(d, range) {
  if (!d || d.length < 6) return d || ''
  // 키움 format: YYYYMMDD(8자리) / Yahoo format: YYYY-MM-DD 또는 YYYYMMDD
  const clean = String(d).replace(/-/g, '')
  if (range === '5y' || range === '2y') return clean.slice(0, 4)
  if (range === '1y')                   return clean.slice(4, 6) + '월'
  if (clean.length >= 8) return `${clean.slice(4,6)}/${clean.slice(6,8)}`
  return clean
}
export function fmtDateLong(d) {
  if (!d) return ''
  const clean = String(d).replace(/-/g, '')
  if (clean.length >= 8) return `${clean.slice(0,4)}.${clean.slice(4,6)}.${clean.slice(6,8)}`
  return d
}

// ── CandleSvg ───────────────────────────────────────
export default function CandleSvg({
  candles,
  range,
  chartType = 'candle',   // 'candle' | 'line'
  drawings = [],
  drawTool = 'none',
  drawPhase = 0,
  drawPoint1 = null,
  mousePos = null,
  selectedColor = '#f59e0b',
  showMA = { 5:true, 20:true, 60:true, 120:true },
  onChartClick,
  onChartMouseMove,
  onChartMouseLeave,
  // 색상 accent (선형 차트용)
  accent = '#2563eb',
  // 크기 설정
  W = 820, H = 320,
  PAD = { top: 20, right: 60, bottom: 36, left: 10 },
}) {
  const svgRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)  // { c, x, y, svgY, price }

  if (!candles?.length) return <div className="gcm-no-data">데이터 없음</div>

  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top  - PAD.bottom

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

  // ── X축 레이블 — 마지막 날짜 겹침 방지 ────────────
  const xLabels = (() => {
    if (range === '5y' || range === '2y') {
      const seen = new Set()
      return data.slice(0, -1).filter(c => {
        const yr = c.date?.slice(0, 4)
        if (!yr || seen.has(yr)) return false; seen.add(yr); return true
      })
    }
    if (range === '1y') {
      const seen = new Set()
      return data.slice(0, -1).filter(c => {
        const mo = c.date?.slice(0, 6)
        if (!mo || seen.has(mo)) return false; seen.add(mo); return true
      })
    }
    // 3mo/6mo/1mo: step 기반, 마지막 항목 제외
    const step = Math.max(1, Math.floor(data.length / 6))
    return data.slice(0, -1).filter((_, i) => i % step === 0)
  })()

  // 마지막 날짜는 항상 맨 오른쪽에 단독 표시
  const lastCandle = data[data.length - 1]

  // ── MA 계산 ────────────────────────────────────────
  function calcMA(arr, period) {
    return arr.map((_, i) => {
      if (i < period - 1) return null
      return arr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
    })
  }
  const ma5   = calcMA(closes, 5)
  const ma20  = calcMA(closes, 20)
  const ma60  = calcMA(closes, 60)
  const ma120 = calcMA(closes, 120)

  // ── SVG 좌표 변환 ──────────────────────────────────
  const getSvgCoords = (e) => {
    const svg = svgRef.current
    if (!svg) return null
    const rect   = svg.getBoundingClientRect()
    const svgX   = (e.clientX - rect.left) * (W / rect.width)
    const svgY   = (e.clientY - rect.top)  * (H / rect.height)
    const rawIdx = ((svgX - PAD.left) / chartW) * (data.length - 1)
    const idx    = Math.max(0, Math.min(data.length - 1, Math.round(rawIdx)))
    const price  = yMax - ((svgY - PAD.top) / chartH) * yRange
    return { svgX, svgY, idx, price }
  }

  const handleMouseMove = (e) => {
    const c = getSvgCoords(e)
    if (!c) return
    if (c.idx >= 0 && c.idx < data.length) {
      setTooltip({
        c:     data[c.idx],
        x:     toX(c.idx),
        svgY:  c.svgY,           // 마우스 Y (크로스헤어 가로선용)
        price: c.price,           // 마우스 위치 가격 (Y축 버블용)
      })
    }
    if (onChartMouseMove) onChartMouseMove(c)
  }
  const handleClick = (e) => { const c = getSvgCoords(e); if (c && onChartClick) onChartClick(c) }
  const handleLeave = () => { setTooltip(null); if (onChartMouseLeave) onChartMouseLeave() }

  // ── 드로잉 렌더 ───────────────────────────────────
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

  // 선형 차트용 포인트
  const linePts = data.map((c, i) => {
    const x = toX(i), y = toY(c.close)
    return isFinite(x) && isFinite(y) ? `${x.toFixed(1)},${y.toFixed(1)}` : null
  }).filter(Boolean).join(' ')

  return (
    <div className="gcm-svg-wrap" onMouseLeave={handleLeave}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="gcm-svg"
        style={{ cursor: drawTool === 'none' ? 'crosshair' : 'crosshair' }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      >
        {/* Y축 그리드 + 눈금 */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={toY(t)} x2={W - PAD.right} y2={toY(t)}
              stroke="rgba(0,0,0,0.05)" strokeDasharray="4 4"/>
            <text x={W - PAD.right + 5} y={toY(t) + 4}
              fontSize="10" fill="#94a3b8" textAnchor="start">
              {fmtNum(t, t > 100 ? 0 : 2)}
            </text>
          </g>
        ))}

        {/* X축 레이블 (겹침 없는 날짜들) */}
        {xLabels.map((c, i) => {
          const idx2 = data.indexOf(c)
          const x = PAD.left + (idx2 / (data.length - 1)) * chartW
          return (
            <text key={i} x={x} y={H - 6} fontSize="10" fill="#94a3b8" textAnchor="middle">
              {fmtDate(c.date, range)}
            </text>
          )
        })}
        {/* 마지막 날짜 — 오른쪽 끝 단독 표시 */}
        {lastCandle && (
          <text x={W - PAD.right} y={H - 6} fontSize="10" fill="#2563eb"
            textAnchor="end" fontWeight="600">
            {fmtDate(lastCandle.date, range)}
          </text>
        )}

        {/* 선형 차트 */}
        {chartType === 'line' && linePts && (
          <>
            <defs>
              <linearGradient id="cs-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity="0.15"/>
                <stop offset="100%" stopColor={accent} stopOpacity="0"/>
              </linearGradient>
            </defs>
            <polygon
              points={`${PAD.left},${PAD.top+chartH} ${linePts} ${W-PAD.right},${PAD.top+chartH}`}
              fill="url(#cs-grad)"/>
            <polyline points={linePts} fill="none" stroke={accent} strokeWidth="1.8"/>
            {(() => {
              const lastX = toX(data.length-1), lastY = toY(closes[closes.length-1])
              return isFinite(lastX)&&isFinite(lastY)
                ? <circle cx={lastX} cy={lastY} r="4" fill={accent} stroke="white" strokeWidth="2"/>
                : null
            })()}
          </>
        )}

        {/* 캔들 차트 */}
        {chartType === 'candle' && data.map((c, i) => {
          const x  = toX(i)
          const o  = toY(c.open  || c.close)
          const h  = toY(c.high  || c.close)
          const l  = toY(c.low   || c.close)
          const cl = toY(c.close)
          const isUp    = c.close >= (c.open || c.close)
          const col     = isUp ? '#DC2626' : '#1D4ED8'
          const bodyTop = Math.min(o, cl)
          const bodyH   = Math.max(1, Math.max(o, cl) - bodyTop)
          if (!isFinite(x)||!isFinite(h)||!isFinite(l)) return null
          return (
            <g key={i}>
              <line x1={x} y1={h} x2={x} y2={l} stroke={col} strokeWidth="1"/>
              <rect x={x - barW/2} y={bodyTop} width={barW} height={bodyH}
                fill={isUp ? col : 'white'} stroke={col} strokeWidth="0.5"/>
            </g>
          )
        })}

        {/* MA 이동평균선 */}
        {[
          { arr: ma5,   on: showMA[5],   color: '#f59e0b' },
          { arr: ma20,  on: showMA[20],  color: '#a78bfa' },
          { arr: ma60,  on: showMA[60],  color: '#22c55e' },
          { arr: ma120, on: showMA[120], color: '#f43f5e' },
        ].map(({ arr, on, color }, mi) => {
          if (!on) return null
          const pts = arr.map((v, i) => v !== null
            ? `${toX(i).toFixed(1)},${toY(v).toFixed(1)}` : null
          ).filter(Boolean).join(' ')
          return pts ? <polyline key={mi} points={pts} fill="none"
            stroke={color} strokeWidth="1.2" opacity="0.85"/> : null
        })}

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

        {/* ── 십자 크로스헤어 ─────────────────────── */}
        {tooltip && drawTool === 'none' && isFinite(tooltip.svgY) && (
          <>
            {/* 세로선 */}
            <line
              x1={tooltip.x} y1={PAD.top}
              x2={tooltip.x} y2={PAD.top + chartH}
              stroke="rgba(0,0,0,0.25)" strokeWidth="1" strokeDasharray="4 3"
            />
            {/* 가로선 */}
            <line
              x1={PAD.left} y1={tooltip.svgY}
              x2={W - PAD.right} y2={tooltip.svgY}
              stroke="rgba(0,0,0,0.25)" strokeWidth="1" strokeDasharray="4 3"
            />
            {/* Y축 가격 버블 */}
            {isFinite(tooltip.price) && tooltip.svgY >= PAD.top && tooltip.svgY <= PAD.top + chartH && (
              <>
                <rect
                  x={W - PAD.right + 2} y={tooltip.svgY - 9}
                  width={PAD.right - 4} height={18} rx="3"
                  fill="#1e293b" opacity="0.85"
                />
                <text
                  x={W - PAD.right + PAD.right/2} y={tooltip.svgY + 4}
                  fontSize="9.5" fill="white" textAnchor="middle" fontWeight="600"
                >
                  {fmtNum(tooltip.price, tooltip.price > 100 ? 0 : 2)}
                </text>
              </>
            )}
          </>
        )}
      </svg>

      {/* 툴팁 박스 */}
      {tooltip && drawTool === 'none' && (
        <div className="gcm-tooltip" style={{
          left: `${Math.min(tooltip.x / W * 100, 72)}%`,
        }}>
          <div className="gcm-tt-date">{fmtDateLong(tooltip.c.date)}</div>
          {tooltip.c.open != null && <div>시가: <b>{fmtNum(tooltip.c.open)}</b></div>}
          {tooltip.c.high != null && <div>고가: <b style={{color:'#DC2626'}}>{fmtNum(tooltip.c.high)}</b></div>}
          {tooltip.c.low  != null && <div>저가: <b style={{color:'#1D4ED8'}}>{fmtNum(tooltip.c.low)}</b></div>}
          <div>종가: <b>{fmtNum(tooltip.c.close)}</b></div>
        </div>
      )}

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
