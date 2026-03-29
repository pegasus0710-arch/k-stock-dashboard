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

// ── SVG 캔들 차트 ────────────────────────────────────
function CandleSvg({ candles, chartType, range }) {
  const svgRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)

  if (!candles?.length) return (
    <div className="gcm-no-data">데이터 없음</div>
  )

  const W = 820, H = 320
  const PAD = { top: 20, right: 60, bottom: 36, left: 10 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  // 최대 표시 개수 (기간에 따라)
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

  const toY = v => PAD.top + ((yMax - v) / yRange) * chartH
  const barW = Math.max(2, Math.floor(chartW / data.length * 0.7))

  // Y축 눈금 5개
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + (yRange * i) / 4)

  // X축 날짜 레이블 — range에 따라 중복 없이 생성
  const xLabels = (() => {
    if (range === '5y' || range === '2y') {
      // 연도가 바뀌는 첫 데이터만 추출
      const seen = new Set()
      return data.filter(c => {
        const yr = c.date?.slice(0, 4)
        if (!yr || seen.has(yr)) return false
        seen.add(yr); return true
      })
    }
    if (range === '1y') {
      // 월이 바뀌는 첫 데이터만 추출
      const seen = new Set()
      return data.filter(c => {
        const mo = c.date?.slice(0, 6)
        if (!mo || seen.has(mo)) return false
        seen.add(mo); return true
      })
    }
    // 1mo / 3mo / 6mo — 최대 6개 균등 분배
    const step = Math.max(1, Math.floor(data.length / 6))
    return data.filter((_, i) => i % step === 0 || i === data.length - 1)
  })()

  // MA5 / MA20 계산
  function calcMA(arr, period) {
    return arr.map((_, i) => {
      if (i < period - 1) return null
      const sum = arr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
      return sum / period
    })
  }
  const ma5  = chartType === 'candle' ? calcMA(closes, 5)  : []
  const ma20 = chartType === 'candle' ? calcMA(closes, 20) : []

  const handleMouseMove = useCallback((e) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (W / rect.width) - PAD.left
    const idx = Math.round((mx / chartW) * (data.length - 1))
    if (idx < 0 || idx >= data.length) { setTooltip(null); return }
    const c = data[idx]
    const x = PAD.left + (idx / (data.length - 1)) * chartW
    setTooltip({ c, x, y: PAD.top })
  }, [data, chartW])

  return (
    <div className="gcm-svg-wrap" onMouseLeave={() => setTooltip(null)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="gcm-svg"
        onMouseMove={handleMouseMove}
      >
        {/* 그리드 */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={toY(t)}
              x2={W - PAD.right} y2={toY(t)}
              stroke="rgba(15,23,42,0.07)" strokeDasharray="4 4"
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

        {/* 라인 차트 */}
        {chartType === 'line' && (() => {
          const points = data.map((c, i) =>
            `${PAD.left + (i / (data.length - 1)) * chartW},${toY(c.close)}`
          ).join(' ')
          const last  = data[data.length - 1]
          const first = data[0]
          const color = (last?.close || 0) >= (first?.close || 0) ? '#3b82f6' : '#ef4444'
          // 그라디언트 fill
          const fillPts = `${PAD.left},${toY(data[0].close)} ${points} ${PAD.left + chartW},${PAD.top + chartH} ${PAD.left},${PAD.top + chartH}`
          return (
            <>
              <defs>
                <linearGradient id="gcmGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={color} stopOpacity="0.3"/>
                  <stop offset="100%" stopColor={color} stopOpacity="0"/>
                </linearGradient>
              </defs>
              <polygon points={fillPts} fill="url(#gcmGrad)"/>
              <polyline points={points} fill="none" stroke={color} strokeWidth="1.8"/>
            </>
          )
        })()}

        {/* 캔들 차트 */}
        {chartType === 'candle' && data.map((c, i) => {
          const x  = PAD.left + (i / (data.length - 1)) * chartW
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
                fill={isUp ? color : color}
                stroke={color} strokeWidth="0.5"
                fillOpacity={isUp ? 0.85 : 1}
              />
            </g>
          )
        })}

        {/* MA5 라인 (캔들 모드) */}
        {chartType === 'candle' && (() => {
          const pts = ma5.map((v, i) => v !== null
            ? `${PAD.left + (i / (data.length - 1)) * chartW},${toY(v)}`
            : null
          ).filter(Boolean).join(' ')
          return pts ? <polyline points={pts} fill="none" stroke="#f59e0b" strokeWidth="1.2" opacity="0.8"/> : null
        })()}
        {/* MA20 라인 (캔들 모드) */}
        {chartType === 'candle' && (() => {
          const pts = ma20.map((v, i) => v !== null
            ? `${PAD.left + (i / (data.length - 1)) * chartW},${toY(v)}`
            : null
          ).filter(Boolean).join(' ')
          return pts ? <polyline points={pts} fill="none" stroke="#a78bfa" strokeWidth="1.2" opacity="0.8"/> : null
        })()}

        {/* 툴팁 크로스헤어 */}
        {tooltip && (
          <line
            x1={tooltip.x} y1={PAD.top}
            x2={tooltip.x} y2={PAD.top + chartH}
            stroke="rgba(15,23,42,0.25)" strokeWidth="1" strokeDasharray="3 3"
          />
        )}
      </svg>

      {/* 툴팁 박스 */}
      {tooltip && (
        <div className="gcm-tooltip" style={{
          left: `${Math.min(tooltip.x / W * 100, 75)}%`,
        }}>
          <div className="gcm-tt-date">{fmtDateLong(tooltip.c.date)}</div>
          {chartType === 'candle' ? (
            <>
              <div>시가: <b>{fmtNum(tooltip.c.open)}</b></div>
              <div>고가: <b style={{color:'#22c55e'}}>{fmtNum(tooltip.c.high)}</b></div>
              <div>저가: <b style={{color:'#ef4444'}}>{fmtNum(tooltip.c.low)}</b></div>
              <div>종가: <b>{fmtNum(tooltip.c.close)}</b></div>
            </>
          ) : (
            <div>가격: <b>{fmtNum(tooltip.c.close)}</b></div>
          )}
        </div>
      )}

      {/* MA 범례 (캔들 모드) */}
      {chartType === 'candle' && (
        <div className="gcm-ma-legend">
          <span style={{color:'#f59e0b'}}>● MA5</span>
          <span style={{color:'#a78bfa'}}>● MA20</span>
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
  const [range,     setRange]     = useState('3mo')
  const [chartType, setChartType] = useState('line')
  const [candles,   setCandles]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  // ESC 키
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

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

  // 등락률 색상
  const rateNum = parseFloat(changeRate) || 0
  const rateColor = rateNum > 0 ? '#22c55e' : rateNum < 0 ? '#ef4444' : '#94a3b8'
  const rateSign  = rateNum > 0 ? '+' : ''

  return (
    <div className="gcm-overlay" onClick={onClose}>
      <div className="gcm-modal" onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="gcm-header">
          <div className="gcm-title-row">
            <span className="gcm-name">{name}</span>
            <span className="gcm-price">
              {fmtNum(currentPrice, currentPrice > 100 ? 2 : 4)}
            </span>
            <span className="gcm-rate" style={{ color: rateColor }}>
              ({rateSign}{fmtNum(rateNum)}%)
            </span>
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

            {/* 차트 타입 */}
            <div className="gcm-type-tabs">
              <button
                className={`gcm-type-btn ${chartType === 'line' ? 'active' : ''}`}
                onClick={() => setChartType('line')}
                title="라인 차트"
              >📈 라인</button>
              <button
                className={`gcm-type-btn ${chartType === 'candle' ? 'active' : ''}`}
                onClick={() => setChartType('candle')}
                title="캔들 차트"
              >🕯️ 캔들</button>
            </div>

            <button className="gcm-close" onClick={onClose}>✕</button>
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
            <CandleSvg candles={candles} chartType={chartType} range={range} />
          )}
        </div>

        {/* 데이터 출처 */}
        <div className="gcm-footer">
          데이터: Yahoo Finance · {candles.length}개 봉
          {chartType === 'candle' && ' · 캔들 차트'}
        </div>
      </div>
    </div>
  )
}
