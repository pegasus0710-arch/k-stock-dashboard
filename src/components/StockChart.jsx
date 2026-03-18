import { useState } from 'react'
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

export default function StockChart() {
  const [activeTheme, setActiveTheme] = useState(THEMES[0])
  const [activeStock, setActiveStock] = useState(THEME_STOCKS[THEMES[0]][0])

  const handleTheme = (theme) => {
    setActiveTheme(theme)
    setActiveStock(THEME_STOCKS[theme][0])
  }

  const naverUrl   = `https://finance.naver.com/item/main.naver?code=${activeStock.code}`
  const chartUrl   = `https://finance.naver.com/item/fchart.naver?code=${activeStock.code}`
  const tvUrl      = `https://kr.tradingview.com/chart/?symbol=KRX:${activeStock.code}`

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
            <span className="chart-stock-name">{activeStock.name}</span>
            <div className="interval-btns">
              <a href={naverUrl} target="_blank" rel="noreferrer" className="interval-btn">네이버증권</a>
              <a href={tvUrl}    target="_blank" rel="noreferrer" className="interval-btn">TradingView</a>
            </div>
          </div>

          <div className="chart-embed">
            <iframe
              key={activeStock.code}
              src={chartUrl}
              style={{ width: '100%', height: '100%', border: 'none', background: '#181c23' }}
              title={activeStock.name}
            />
          </div>
        </div>
      </div>
    </div>
  )
}