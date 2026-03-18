import { useState } from 'react'
import './StockChart.css'

const THEME_STOCKS = {
  '반도체·AI':  [
    { name: '삼성전자',   symbol: 'KRX:005930' },
    { name: 'SK하이닉스', symbol: 'KRX:000660' },
    { name: 'DB하이텍',   symbol: 'KRX:000990' },
  ],
  '방산': [
    { name: '한화에어로스페이스', symbol: 'KRX:012450' },
    { name: '현대로템',           symbol: 'KRX:064350' },
    { name: 'LIG넥스원',          symbol: 'KRX:079550' },
  ],
  '조선': [
    { name: 'HD현대중공업', symbol: 'KRX:329180' },
    { name: '삼성중공업',   symbol: 'KRX:010140' },
    { name: '한화오션',     symbol: 'KRX:042660' },
  ],
  '원전·전력': [
    { name: '두산에너빌리티', symbol: 'KRX:034020' },
    { name: '효성중공업',     symbol: 'KRX:298040' },
    { name: '일진전기',       symbol: 'KRX:103590' },
  ],
  '2차전지': [
    { name: 'LG에너지솔루션', symbol: 'KRX:373220' },
    { name: '삼성SDI',        symbol: 'KRX:006400' },
    { name: 'POSCO홀딩스',    symbol: 'KRX:005490' },
  ],
  '바이오': [
    { name: '셀트리온',         symbol: 'KRX:068270' },
    { name: '삼성바이오로직스', symbol: 'KRX:207940' },
    { name: 'HLB',              symbol: 'KRX:028300' },
  ],
  '밸류업·금융': [
    { name: 'KB금융',       symbol: 'KRX:105560' },
    { name: '신한지주',     symbol: 'KRX:055550' },
    { name: '하나금융지주', symbol: 'KRX:086790' },
  ],
}

const THEMES = Object.keys(THEME_STOCKS)
const INTERVALS = [
  { label: '일봉', value: 'D' },
  { label: '주봉', value: 'W' },
  { label: '월봉', value: 'M' },
]

function TradingViewChart({ symbol, interval }) {
  const tvUrl = `https://www.tradingview.com/widgetembed/?symbol=${encodeURIComponent(symbol)}&interval=${interval}&theme=dark&style=1&locale=kr&timezone=Asia%2FSeoul&hide_top_toolbar=0&hide_legend=0&save_image=0&backgroundColor=%23181c23`
  return (
    <iframe
      key={`${symbol}-${interval}`}
      src={tvUrl}
      style={{ width: '100%', height: '100%', border: 'none' }}
      allowTransparency="true"
      scrolling="no"
      allowFullScreen
    />
  )
}

export default function StockChart() {
  const [activeTheme,    setActiveTheme]    = useState(THEMES[0])
  const [activeStock,    setActiveStock]    = useState(THEME_STOCKS[THEMES[0]][0])
  const [activeInterval, setActiveInterval] = useState('D')

  const handleTheme = (theme) => {
    setActiveTheme(theme)
    setActiveStock(THEME_STOCKS[theme][0])
  }

  return (
    <div className="stock-chart-page">
      <div className="theme-selector">
        {THEMES.map(t => (
          <button key={t} className={`theme-sel-btn ${activeTheme === t ? 'active' : ''}`} onClick={() => handleTheme(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="chart-layout">
        <aside className="stock-list">
          <p className="stock-list-title dim">종목 선택</p>
          {THEME_STOCKS[activeTheme].map(s => (
            <button key={s.symbol} className={`stock-item ${activeStock.symbol === s.symbol ? 'active' : ''}`} onClick={() => setActiveStock(s)}>
              <span className="stock-item-name">{s.name}</span>
              <span className="stock-item-symbol dim mono">{s.symbol.replace('KRX:', '')}</span>
            </button>
          ))}
        </aside>
        <div className="chart-area">
          <div className="chart-controls">
            <span className="chart-stock-name">{activeStock.name}</span>
            <div className="interval-btns">
              {INTERVALS.map(i => (
                <button key={i.value} className={`interval-btn ${activeInterval === i.value ? 'active' : ''}`} onClick={() => setActiveInterval(i.value)}>
                  {i.label}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-embed">
            <TradingViewChart symbol={activeStock.symbol} interval={activeInterval} />
          </div>
        </div>
      </div>
    </div>
  )
}