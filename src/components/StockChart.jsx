import { useState, useEffect, useRef } from 'react'
import './StockChart.css'

const THEME_STOCKS = {
  '반도체·AI':  [
    { name: '삼성전자',   code: '005930' },
    { name: 'SK하이닉스', code: '000660' },
    { name: 'DB하이텍',   code: '000990' },
  ],
  '방산': [
    { name: '한화에어로스페이스', code: '012450' },
    { name: '현대로템',           code: '064350' },
    { name: 'LIG넥스원',          code: '079550' },
  ],
  '조선': [
    { name: 'HD현대중공업', code: '329180' },
    { name: '삼성중공업',   code: '010140' },
    { name: '한화오션',     code: '042660' },
  ],
  '원전·전력': [
    { name: '두산에너빌리티', code: '034020' },
    { name: '효성중공업',     code: '298040' },
    { name: '일진전기',       code: '103590' },
  ],
  '2차전지': [
    { name: 'LG에너지솔루션', code: '373220' },
    { name: '삼성SDI',        code: '006400' },
    { name: 'POSCO홀딩스',    code: '005490' },
  ],
  '바이오': [
    { name: '셀트리온',         code: '068270' },
    { name: '삼성바이오로직스', code: '207940' },
    { name: 'HLB',              code: '028300' },
  ],
  '밸류업·금융': [
    { name: 'KB금융',       code: '105560' },
    { name: '신한지주',     code: '055550' },
    { name: '하나금융지주', code: '086790' },
  ],
}

const THEMES = Object.keys(THEME_STOCKS)
const CANDLE_TYPES = [
  { label: '일봉', value: 'd' },
  { label: '주봉', value: 'w' },
  { label: '월봉', value: 'm' },
]

function CandleChart({ data }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!data?.candles?.length || !containerRef.current) return
    const LW = window.LightweightCharts
    if (!LW) return

    containerRef.current.innerHTML = ''

    const chart = LW.createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 420,
      layout: { background: { color: '#181c23' }, textColor: '#8a91a8' },
      grid:   { vertLines: { color: '#252a35' }, horzLines: { color: '#252a35' } },
      crosshair: { mode: LW.CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#252a35' },
      timeScale: { borderColor: '#252a35', timeVisible: false },
    })

    const series = chart.addCandlestickSeries({
      upColor:         '#22c55e',
      downColor:       '#ef4444',
      borderUpColor:   '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor:     '#22c55e',
      wickDownColor:   '#ef4444',
    })

    series.setData(data.candles)
    chart.timeScale().fitContent()

    const handleResize = () => {
      if (containerRef.current)
        chart.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)
    return () => { window.removeEventListener('resize', handleResize); chart.remove() }
  }, [data])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}

export default function StockChart() {
  const [activeTheme,  setActiveTheme]  = useState(THEMES[0])
  const [activeStock,  setActiveStock]  = useState(THEME_STOCKS[THEMES[0]][0])
  const [candleType,   setCandleType]   = useState(CANDLE_TYPES[0])
  const [chartData,    setChartData]    = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [lwLoaded,     setLwLoaded]     = useState(false)

  useEffect(() => {
    if (window.LightweightCharts) { setLwLoaded(true); return }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js'
    script.onload = () => setLwLoaded(true)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!lwLoaded) return
    loadChart()
  }, [activeStock, candleType, lwLoaded])

  const loadChart = async () => {
    setLoading(true)
    setError('')
    setChartData(null)
    try {
      const res  = await fetch(`/api/chart?code=${activeStock.code}&freq=${candleType.value}`)
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || '데이터 없음')
      setChartData(data)
    } catch (e) {
      setError('차트 데이터를 불러오지 못했어요.')
    }
    setLoading(false)
  }

  const handleTheme = (theme) => {
    setActiveTheme(theme)
    setActiveStock(THEME_STOCKS[theme][0])
  }

  const priceChange = chartData ? chartData.currentPrice - chartData.prevClose : 0
  const pricePct    = chartData?.prevClose
    ? ((priceChange / chartData.prevClose) * 100).toFixed(2)
    : '0.00'
  const isUp = priceChange >= 0

  return (
    <div className="stock-chart-page">
      <div className="theme-selector">
        {THEMES.map(t => (
          <button
            key={t}
            className={`theme-sel-btn ${activeTheme === t ? 'active' : ''}`}
            onClick={() => handleTheme(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="chart-layout">
        <aside className="stock-list">
          <p className="stock-list-title dim">종목 선택</p>
          {THEME_STOCKS[activeTheme].map(s => (
            <button
              key={s.code}
              className={`stock-item ${activeStock.code === s.code ? 'active' : ''}`}
              onClick={() => setActiveStock(s)}
            >
              <span className="stock-item-name">{s.name}</span>
              <span className="stock-item-symbol dim mono">{s.code}</span>
            </button>
          ))}
        </aside>

        <div className="chart-area">
          <div className="chart-controls">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="chart-stock-name">{activeStock.name}</span>
              {chartData && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span className="mono" style={{ fontSize: 17, fontWeight: 500 }}>
                    {chartData.currentPrice.toLocaleString()}원
                  </span>
                  <span className={`mono ${isUp ? 'up' : 'down'}`} style={{ fontSize: 13 }}>
                    {isUp ? '+' : ''}{priceChange.toLocaleString()} ({isUp ? '+' : ''}{pricePct}%)
                  </span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {CANDLE_TYPES.map(c => (
                <button
                  key={c.value}
                  className={`interval-btn ${candleType.value === c.value ? 'active' : ''}`}
                  onClick={() => setCandleType(c)}
                >
                  {c.label}
                </button>
              ))}
              <a
                href={`https://finance.naver.com/item/fchart.naver?code=${activeStock.code}`}
                target="_blank" rel="noreferrer"
                className="interval-btn"
                style={{ textDecoration: 'none', color: 'var(--accent-blue)', borderColor: 'rgba(59,130,246,0.3)' }}
              >
                네이버↗
              </a>
            </div>
          </div>

          <div className="chart-embed">
            {loading && (
              <div className="chart-loading">
                <div className="loading-spinner" />
                <p>차트 데이터 불러오는 중...</p>
              </div>
            )}
            {error && !loading && (
              <div className="chart-error">
                <p>{error}</p>
                <button onClick={loadChart} className="retry-btn">다시 시도</button>
                <a
                  href={`https://finance.naver.com/item/fchart.naver?code=${activeStock.code}`}
                  target="_blank" rel="noreferrer"
                  className="retry-btn"
                  style={{ textDecoration: 'none', marginTop: 4 }}
                >
                  네이버 차트 보기↗
                </a>
              </div>
            )}
            {!loading && !error && chartData && lwLoaded && (
              <CandleChart
                key={`${activeStock.code}-${candleType.value}`}
                data={chartData}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
