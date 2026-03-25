import { useState, useEffect, useCallback, useRef } from 'react'
import './StockChartModal.css'

const PERIODS = [
  { label: '분봉', type: 'min' },
  { label: '일봉', type: 'day' },
  { label: '주봉', type: 'week' },
  { label: '월봉', type: 'month' },
  { label: '년봉', type: 'year' },
]

const RANGES = [
  { label: '1개월',  months: 1 },
  { label: '3개월',  months: 3 },
  { label: '6개월',  months: 6 },
  { label: '1년',    months: 12 },
  { label: '3년',    months: 36 },
  { label: '전체',   months: 0 },
]

const MIN_SCOPES = ['1', '3', '5', '10', '15', '30', '60']

const DATA_KEY = {
  min:   'stk_min_pole_chart_qry',
  day:   'stk_dt_pole_chart_qry',
  week:  'stk_stk_pole_chart_qry',
  month: 'stk_mth_pole_chart_qry',
  year:  'stk_yr_pole_chart_qry',
}

function parseN(s) { if (!s) return 0; return parseInt(String(s).replace(/[^0-9-]/g, '')) || 0 }
function fmt(n) { if (n === undefined || n === null) return '-'; return Number(n).toLocaleString('ko-KR') }
function fmtShort(n) {
  if (!n) return '0'
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '억'
  if (n >= 10000) return (n / 10000).toFixed(0) + '만'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

// 날짜 필터
function filterByRange(data, months) {
  if (!months) return data
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutStr = cutoff.toISOString().slice(0, 10).replace(/-/g, '')
  return data.filter(d => d.dateRaw >= cutStr)
}

// SVG 캔들차트 컴포넌트
function CandleChart({ data, width, height }) {
  const [tooltip, setTooltip] = useState(null)
  const svgRef = useRef(null)

  if (!data || data.length === 0) return null

  const PAD = { top: 12, right: 8, bottom: 24, left: 72 }
  const W = width - PAD.left - PAD.right
  const H = height - PAD.top - PAD.bottom

  const prices = data.flatMap(d => [d.high, d.low]).filter(Boolean)
  const rawMin = Math.min(...prices)
  const rawMax = Math.max(...prices)
  const margin = (rawMax - rawMin) * 0.06
  const minP = rawMin - margin
  const maxP = rawMax + margin
  const rangeP = maxP - minP

  const py = v => PAD.top + H - ((v - minP) / rangeP) * H
  const barW = Math.max(1, Math.min(12, W / data.length - 1))
  const bx = i => PAD.left + (i + 0.5) * (W / data.length)

  // Y축 눈금
  const tickCount = 5
  const yTicks = Array.from({ length: tickCount }, (_, i) => minP + (rangeP / (tickCount - 1)) * i)

  // X축 눈금 (날짜)
  const xTickStep = Math.max(1, Math.floor(data.length / 6))
  const xTicks = data.filter((_, i) => i % xTickStep === 0 || i === data.length - 1)

  const handleMouseMove = (e) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left - PAD.left
    const idx = Math.round(x / (W / data.length) - 0.5)
    const clamped = Math.max(0, Math.min(data.length - 1, idx))
    setTooltip({ idx: clamped, x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const td = tooltip ? data[tooltip.idx] : null

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        width={width} height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        style={{ display: 'block', cursor: 'crosshair' }}
      >
        {/* 그리드 */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={py(v)} x2={PAD.left + W} y2={py(v)}
              stroke="#e2e8f0" strokeWidth={0.5} strokeDasharray="3,3" />
            <text x={PAD.left - 4} y={py(v) + 4} textAnchor="end"
              fontSize={10} fill="#94a3b8">{fmt(Math.round(v))}</text>
          </g>
        ))}

        {/* X축 눈금 */}
        {xTicks.map((d, i) => (
          <text key={i} x={bx(data.indexOf(d))} y={PAD.top + H + 16}
            textAnchor="middle" fontSize={10} fill="#94a3b8">{d.dateLabel}</text>
        ))}

        {/* 캔들 */}
        {data.map((d, i) => {
          const isUp = d.close >= d.open
          const color = isUp ? '#ef4444' : '#3b82f6'
          const cx = bx(i)
          const bodyTop = py(Math.max(d.open, d.close))
          const bodyBot = py(Math.min(d.open, d.close))
          const bodyH = Math.max(1, bodyBot - bodyTop)
          return (
            <g key={i}>
              <line x1={cx} y1={py(d.high)} x2={cx} y2={py(d.low)}
                stroke={color} strokeWidth={1} />
              <rect
                x={cx - barW / 2} y={bodyTop}
                width={barW} height={bodyH}
                fill={color}
              />
            </g>
          )
        })}

        {/* 십자선 */}
        {tooltip && td && (
          <>
            <line x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={PAD.top + H}
              stroke="#64748b" strokeWidth={0.8} strokeDasharray="4,2" />
            <line x1={PAD.left} y1={tooltip.y} x2={PAD.left + W} y2={tooltip.y}
              stroke="#64748b" strokeWidth={0.8} strokeDasharray="4,2" />
          </>
        )}
      </svg>

      {/* 툴팁 */}
      {tooltip && td && (
        <div className="smc-tooltip" style={{
          left: tooltip.x > width / 2 ? tooltip.x - 145 : tooltip.x + 10,
          top: Math.min(tooltip.y, height - 130),
        }}>
          <div className="smc-tt-date">{td.dateLabel}</div>
          <div className="smc-tt-row"><span>시가</span><b>{fmt(td.open)}</b></div>
          <div className="smc-tt-row"><span>고가</span><b style={{color:'#ef4444'}}>{fmt(td.high)}</b></div>
          <div className="smc-tt-row"><span>저가</span><b style={{color:'#3b82f6'}}>{fmt(td.low)}</b></div>
          <div className="smc-tt-row"><span>종가</span><b style={{color: td.close >= td.open ? '#ef4444' : '#3b82f6'}}>{fmt(td.close)}</b></div>
          <div className="smc-tt-row"><span>거래량</span><b>{fmtShort(td.volume)}</b></div>
        </div>
      )}
    </div>
  )
}

// 거래량 차트
function VolumeChart({ data, width, height }) {
  if (!data || data.length === 0) return null
  const PAD = { top: 4, right: 8, bottom: 4, left: 72 }
  const W = width - PAD.left - PAD.right
  const H = height - PAD.top - PAD.bottom
  const maxV = Math.max(...data.map(d => d.volume || 0))
  const barW = Math.max(1, Math.min(12, W / data.length - 1))
  const bx = i => PAD.left + (i + 0.5) * (W / data.length)

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <text x={PAD.left - 4} y={PAD.top + 10} textAnchor="end" fontSize={9} fill="#94a3b8">거래량</text>
      {data.map((d, i) => {
        const barH = maxV > 0 ? (d.volume / maxV) * H : 0
        const isUp = d.close >= d.open
        return (
          <rect key={i}
            x={bx(i) - barW / 2} y={PAD.top + H - barH}
            width={barW} height={Math.max(1, barH)}
            fill={isUp ? '#fca5a5' : '#93c5fd'}
            opacity={0.8}
          />
        )
      })}
    </svg>
  )
}

// 라인차트 (분봉용)
function LineChart({ data, width, height }) {
  const [tooltip, setTooltip] = useState(null)
  const svgRef = useRef(null)
  if (!data || data.length === 0) return null

  const PAD = { top: 12, right: 8, bottom: 24, left: 72 }
  const W = width - PAD.left - PAD.right
  const H = height - PAD.top - PAD.bottom

  const prices = data.map(d => d.close).filter(Boolean)
  const rawMin = Math.min(...prices)
  const rawMax = Math.max(...prices)
  const margin = (rawMax - rawMin) * 0.1 || rawMin * 0.005
  const minP = rawMin - margin
  const maxP = rawMax + margin
  const rangeP = maxP - minP

  const py = v => PAD.top + H - ((v - minP) / rangeP) * H
  const px = i => PAD.left + (i / (data.length - 1)) * W

  const tickCount = 5
  const yTicks = Array.from({ length: tickCount }, (_, i) => minP + (rangeP / (tickCount - 1)) * i)
  const xTickStep = Math.max(1, Math.floor(data.length / 6))

  const isUp = prices[prices.length - 1] >= prices[0]
  const lineColor = isUp ? '#ef4444' : '#3b82f6'
  const fillColor = isUp ? '#fef2f2' : '#eff6ff'

  const points = data.map((d, i) => `${px(i)},${py(d.close)}`).join(' ')
  const fillPath = `M${PAD.left},${PAD.top + H} ` + data.map((d, i) => `L${px(i)},${py(d.close)}`).join(' ') + ` L${PAD.left + W},${PAD.top + H} Z`

  const handleMouseMove = (e) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left - PAD.left
    const idx = Math.round(x / W * (data.length - 1))
    const clamped = Math.max(0, Math.min(data.length - 1, idx))
    setTooltip({ idx: clamped, x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const td = tooltip ? data[tooltip.idx] : null

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} width={width} height={height}
        onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}
        style={{ display: 'block', cursor: 'crosshair' }}>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={py(v)} x2={PAD.left + W} y2={py(v)}
              stroke="#e2e8f0" strokeWidth={0.5} strokeDasharray="3,3" />
            <text x={PAD.left - 4} y={py(v) + 4} textAnchor="end" fontSize={10} fill="#94a3b8">{fmt(Math.round(v))}</text>
          </g>
        ))}
        {data.filter((_, i) => i % xTickStep === 0).map((d, i) => (
          <text key={i} x={px(data.indexOf(d))} y={PAD.top + H + 16}
            textAnchor="middle" fontSize={10} fill="#94a3b8">{d.dateLabel}</text>
        ))}
        <path d={fillPath} fill={fillColor} opacity={0.4} />
        <polyline points={points} fill="none" stroke={lineColor} strokeWidth={1.5} />
        {tooltip && td && (
          <>
            <line x1={px(tooltip.idx)} y1={PAD.top} x2={px(tooltip.idx)} y2={PAD.top + H}
              stroke="#64748b" strokeWidth={0.8} strokeDasharray="4,2" />
            <circle cx={px(tooltip.idx)} cy={py(td.close)} r={3} fill={lineColor} />
          </>
        )}
      </svg>
      {tooltip && td && (
        <div className="smc-tooltip" style={{
          left: tooltip.x > width / 2 ? tooltip.x - 145 : tooltip.x + 10,
          top: Math.min(tooltip.y, height - 100),
        }}>
          <div className="smc-tt-date">{td.dateLabel}</div>
          <div className="smc-tt-row"><span>가격</span><b style={{color:lineColor}}>{fmt(td.close)}</b></div>
          <div className="smc-tt-row"><span>거래량</span><b>{fmtShort(td.volume)}</b></div>
        </div>
      )}
    </div>
  )
}

export default function StockChartModal({ stock, onClose }) {
  const [period, setPeriod]     = useState('day')
  const [scope, setScope]       = useState('5')
  const [range, setRange]       = useState(3)   // months
  const [allData, setAllData]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [priceInfo, setPriceInfo] = useState(null)
  const [stockInfo, setStockInfo] = useState(null)
  const wrapRef = useRef(null)
  const [chartWidth, setChartWidth] = useState(800)

  // 차트 너비 반응형
  useEffect(() => {
    const update = () => {
      if (wrapRef.current) setChartWidth(wrapRef.current.clientWidth)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // ESC 닫기
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const fetchChart = useCallback(async () => {
    if (!stock?.code) return
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ type: 'chart', chartType: period, code: stock.code })
      if (period === 'min') params.set('scope', scope)
      const res  = await fetch(`/api/kiwoom?${params}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)

      const key = DATA_KEY[period]
      const raw = (json[key] || []).map(d => {
        const dateRaw = d.dt || d.cntr_tm || ''
        let dateLabel = ''
        const s = String(dateRaw)
        if (period === 'min') dateLabel = s.length >= 4 ? s.slice(0, 2) + ':' + s.slice(2, 4) : s
        else if (s.length === 8) dateLabel = s.slice(4, 6) + '/' + s.slice(6, 8)
        else dateLabel = s
        return {
          dateRaw, dateLabel,
          open:   parseN(d.open_pric),
          high:   parseN(d.high_pric),
          low:    parseN(d.low_pric),
          close:  parseN(d.cur_prc),
          volume: parseN(d.trde_qty),
        }
      }).reverse()

      setAllData(raw)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [stock?.code, period, scope])

  const fetchPrice = useCallback(async () => {
    if (!stock?.code) return
    try {
      const res  = await fetch(`/api/kiwoom?type=price&code=${stock.code}`)
      const json = await res.json()
      if (!json.error) setPriceInfo(json)
    } catch {}
  }, [stock?.code])

  const fetchInfo = useCallback(async () => {
    if (!stock?.code) return
    try {
      const res  = await fetch(`/api/kiwoom?type=stockinfo&code=${stock.code}`)
      const json = await res.json()
      if (!json.error) setStockInfo(json)
    } catch {}
  }, [stock?.code])

  useEffect(() => {
    fetchChart()
    fetchPrice()
    fetchInfo()
  }, [fetchChart, fetchPrice, fetchInfo])

  if (!stock) return null

  // 범위 필터
  const chartData = period === 'min' ? allData : filterByRange(allData, range)

  const isUp   = priceInfo?.change > 0
  const isDown = priceInfo?.change < 0
  const pc     = isUp ? '#ef4444' : isDown ? '#3b82f6' : '#1e293b'
  const sign   = isUp ? '+' : ''

  return (
    <div className="smc-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="smc-modal">

        {/* 헤더 */}
        <div className="smc-header">
          <div className="smc-title-wrap">
            <span className="smc-name">{stock.name}</span>
            <span className="smc-code">{stock.code}</span>
            {priceInfo?.current ? (
              <div className="smc-price-wrap">
                <span className="smc-cur-price" style={{ color: pc }}>{fmt(priceInfo.current)}원</span>
                <span className="smc-change" style={{ color: pc }}>
                  {sign}{fmt(priceInfo.change)}원 ({sign}{Number(priceInfo.changeRate).toFixed(2)}%)
                </span>
              </div>
            ) : null}
          </div>
          <button className="smc-close" onClick={onClose}>✕</button>
        </div>

        {/* 기간 탭 */}
        <div className="smc-controls">
          <div className="smc-period-tabs">
            {PERIODS.map(p => (
              <button key={p.type}
                className={`smc-tab ${period === p.type ? 'active' : ''}`}
                onClick={() => setPeriod(p.type)}>
                {p.label}
              </button>
            ))}
          </div>

          {period === 'min' ? (
            <div className="smc-scope-wrap">
              {MIN_SCOPES.map(s => (
                <button key={s}
                  className={`smc-scope-btn ${scope === s ? 'active' : ''}`}
                  onClick={() => setScope(s)}>
                  {s}분
                </button>
              ))}
            </div>
          ) : (
            <div className="smc-range-wrap">
              {RANGES.map(r => (
                <button key={r.label}
                  className={`smc-scope-btn ${range === r.months ? 'active' : ''}`}
                  onClick={() => setRange(r.months)}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 차트 영역 */}
        <div className="smc-chart-wrap" ref={wrapRef}>
          {loading && <div className="smc-loading">⟳ 차트 불러오는 중...</div>}
          {error   && <div className="smc-error">⚠️ {error}</div>}

          {!loading && !error && chartData.length > 0 && (
            <>
              {period === 'min' ? (
                <LineChart data={chartData} width={chartWidth} height={300} />
              ) : (
                <CandleChart data={chartData} width={chartWidth} height={300} />
              )}
              <VolumeChart data={chartData} width={chartWidth} height={70} />
            </>
          )}

          {!loading && !error && chartData.length === 0 && (
            <div className="smc-empty">데이터가 없습니다</div>
          )}
        </div>

        {/* 종목 정보 */}
        <div className="smc-info-bar">
          {[
            { label: '시가',   value: priceInfo ? fmt(priceInfo.open) + '원' : '-' },
            { label: '고가',   value: priceInfo ? fmt(priceInfo.high) + '원' : '-', color: '#ef4444' },
            { label: '저가',   value: priceInfo ? fmt(priceInfo.low) + '원' : '-',  color: '#3b82f6' },
            { label: '거래량', value: priceInfo ? fmtShort(priceInfo.volume) : '-' },
            { label: 'PER',   value: stockInfo?.per ? Number(stockInfo.per).toFixed(1) + '배' : '-' },
            { label: 'PBR',   value: stockInfo?.pbr ? Number(stockInfo.pbr).toFixed(2) + '배' : '-' },
            { label: '업종',   value: stockInfo?.inds_nm || '-' },
          ].map(item => (
            <div key={item.label} className="smc-info-item">
              <span className="smc-info-label">{item.label}</span>
              <span className="smc-info-value" style={{ color: item.color }}>{item.value}</span>
            </div>
          ))}
          <a className="smc-dart-btn"
            href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(stock.name)}`}
            target="_blank" rel="noreferrer">📋 공시</a>
        </div>

      </div>
    </div>
  )
}
