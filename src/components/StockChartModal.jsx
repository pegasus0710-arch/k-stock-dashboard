import { useState, useEffect, useCallback } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'
import './StockChartModal.css'

const PERIODS = [
  { label: '분봉', type: 'min', scopes: ['1', '3', '5', '10', '15', '30', '60'] },
  { label: '일봉', type: 'day' },
  { label: '주봉', type: 'week' },
  { label: '월봉', type: 'month' },
  { label: '년봉', type: 'year' },
]

const DATA_KEY = {
  min:   'stk_min_pole_chart_qry',
  day:   'stk_dt_pole_chart_qry',
  week:  'stk_stk_pole_chart_qry',
  month: 'stk_mth_pole_chart_qry',
  year:  'stk_yr_pole_chart_qry',
}

function parseN(s) { if (!s) return 0; return parseInt(String(s).replace(/[^0-9-]/g, '')) || 0 }
function fmt(n) { if (!n && n !== 0) return '-'; return Number(n).toLocaleString('ko-KR') }

// 커스텀 캔들 바
function CandleBar(props) {
  const { x, y, width, height, open, close, high, low, chartH, minVal, range } = props
  if (!range || range === 0) return null
  const isUp = close >= open
  const color = isUp ? '#ef4444' : '#3b82f6'
  const bodyTop    = Math.min(open, close)
  const bodyBottom = Math.max(open, close)
  const px = v => chartH - ((v - minVal) / range) * chartH
  const bodyY = px(bodyTop)
  const bodyH = Math.max(1, px(bodyBottom) - px(bodyTop))
  const cx = x + width / 2
  return (
    <g>
      <line x1={cx} y1={px(high)} x2={cx} y2={px(low)} stroke={color} strokeWidth={1} />
      <rect x={x + 1} y={bodyY} width={Math.max(1, width - 2)} height={bodyH} fill={color} />
    </g>
  )
}

function CustomTooltip({ active, payload, label, periodType }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="smc-tooltip">
      <div className="smc-tt-date">{label}</div>
      {d.open !== undefined && (
        <>
          <div>시가 <b>{fmt(d.open)}</b></div>
          <div>고가 <b style={{ color: '#ef4444' }}>{fmt(d.high)}</b></div>
          <div>저가 <b style={{ color: '#3b82f6' }}>{fmt(d.low)}</b></div>
          <div>종가 <b>{fmt(d.close)}</b></div>
        </>
      )}
      <div>거래량 <b>{fmt(d.volume)}</b></div>
    </div>
  )
}

export default function StockChartModal({ stock, onClose }) {
  const [period, setPeriod]   = useState('day')
  const [scope, setScope]     = useState('5')
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [info, setInfo]       = useState(null)

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
      const raw = json[key] || []

      const parsed = raw.map(d => ({
        date:   d.dt || d.cntr_tm || '',
        open:   parseN(d.open_pric),
        high:   parseN(d.high_pric),
        low:    parseN(d.low_pric),
        close:  parseN(d.cur_prc),
        volume: parseN(d.trde_qty),
      })).reverse()

      setData(parsed)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [stock?.code, period, scope])

  // 종목 기본 정보
  const fetchInfo = useCallback(async () => {
    if (!stock?.code) return
    try {
      const res  = await fetch(`/api/kiwoom?type=stockinfo&code=${stock.code}`)
      const json = await res.json()
      if (!json.error) setInfo(json)
    } catch {}
  }, [stock?.code])

  useEffect(() => { fetchChart(); fetchInfo() }, [fetchChart, fetchInfo])

  // ESC 닫기
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  if (!stock) return null

  // 차트 렌더용 계산
  const prices = data.map(d => d.close).filter(Boolean)
  const minVal  = prices.length ? Math.min(...prices) * 0.995 : 0
  const maxVal  = prices.length ? Math.max(...prices) * 1.005 : 1
  const range   = maxVal - minVal

  const isUp    = data.length >= 2 && data[data.length - 1]?.close >= data[0]?.close
  const lineColor = isUp ? '#ef4444' : '#3b82f6'

  // 날짜 포맷
  const fmtDate = (str) => {
    if (!str) return ''
    const s = String(str)
    if (period === 'min') return s.length >= 6 ? s.slice(0, 2) + ':' + s.slice(2, 4) : s
    if (s.length === 8) return s.slice(4, 6) + '/' + s.slice(6, 8)
    return s
  }

  const chartData = data.map(d => ({ ...d, dateLabel: fmtDate(d.date) }))

  return (
    <div className="smc-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="smc-modal">
        {/* 헤더 */}
        <div className="smc-header">
          <div className="smc-title-wrap">
            <span className="smc-name">{stock.name}</span>
            <span className="smc-code">{stock.code}</span>
            {info && (
              <span className="smc-market">{info.listCount ? `상장주식수 ${fmt(parseN(info.listCount))}주` : ''}</span>
            )}
          </div>
          <button className="smc-close" onClick={onClose}>✕</button>
        </div>

        {/* 기간 탭 */}
        <div className="smc-period-tabs">
          {PERIODS.map(p => (
            <button key={p.type}
              className={`smc-tab ${period === p.type ? 'active' : ''}`}
              onClick={() => setPeriod(p.type)}>
              {p.label}
            </button>
          ))}
          {period === 'min' && (
            <div className="smc-scope-wrap">
              {PERIODS[0].scopes.map(s => (
                <button key={s}
                  className={`smc-scope-btn ${scope === s ? 'active' : ''}`}
                  onClick={() => setScope(s)}>
                  {s}분
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 차트 */}
        <div className="smc-chart-wrap">
          {loading && <div className="smc-loading">차트 불러오는 중...</div>}
          {error   && <div className="smc-error">⚠️ {error}</div>}
          {!loading && !error && chartData.length > 0 && (
            <>
              {/* 캔들 차트 (일봉 이상) */}
              {period !== 'min' ? (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis
                      domain={[minVal, maxVal]}
                      tick={{ fontSize: 10 }}
                      tickFormatter={v => fmt(Math.round(v))}
                      width={70}
                    />
                    <Tooltip content={<CustomTooltip periodType={period} />} />
                    <Bar dataKey="close" shape={(props) => (
                      <CandleBar {...props} chartH={300} minVal={minVal} range={range} />
                    )}>
                      {chartData.map((d, i) => (
                        <Cell key={i} fill={d.close >= d.open ? '#ef4444' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                /* 분봉 라인차트 */
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis
                      domain={[minVal, maxVal]}
                      tick={{ fontSize: 10 }}
                      tickFormatter={v => fmt(Math.round(v))}
                      width={70}
                    />
                    <Tooltip content={<CustomTooltip periodType={period} />} />
                    <Line
                      type="monotone" dataKey="close"
                      stroke={lineColor} strokeWidth={1.5}
                      dot={false} isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}

              {/* 거래량 차트 */}
              <ResponsiveContainer width="100%" height={70}>
                <ComposedChart data={chartData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <XAxis dataKey="dateLabel" hide />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={v => v >= 1000000 ? (v/1000000).toFixed(0)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'K' : v} width={40} />
                  <Bar dataKey="volume" radius={[1,1,0,0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.close >= d.open ? '#fca5a5' : '#93c5fd'} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </>
          )}
          {!loading && !error && chartData.length === 0 && (
            <div className="smc-empty">데이터가 없습니다</div>
          )}
        </div>

        {/* 하단 종목 정보 */}
        {info && (
          <div className="smc-info-bar">
            {[
              { label: '종목명', value: info.name || stock.name },
              { label: '시장', value: info.mrkt_tp_nm || '-' },
              { label: '업종', value: info.inds_nm || '-' },
              { label: '자본금', value: info.cap ? fmt(parseN(info.cap)) + '억' : '-' },
              { label: 'PER', value: info.per ? Number(info.per).toFixed(1) : '-' },
              { label: 'PBR', value: info.pbr ? Number(info.pbr).toFixed(2) : '-' },
            ].map(item => (
              <div key={item.label} className="smc-info-item">
                <span className="smc-info-label">{item.label}</span>
                <span className="smc-info-value">{item.value}</span>
              </div>
            ))}
            <a className="smc-dart-btn"
              href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(stock.name)}`}
              target="_blank" rel="noreferrer">
              📋 공시
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
