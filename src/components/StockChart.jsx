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

  const links = [
    {
      label: '네이버증권 차트',
      desc: '일봉·주봉·월봉·재무정보',
      url: `https://finance.naver.com/item/fchart.naver?code=${activeStock.code}`,
      color: '#03c75a',
    },
    {
      label: 'TradingView',
      desc: '고급 기술적 분석 차트',
      url: `https://kr.tradingview.com/chart/?symbol=KRX:${activeStock.code}`,
      color: '#3b82f6',
    },
    {
      label: '네이버증권 종목',
      desc: '공시·뉴스·재무제표',
      url: `https://finance.naver.com/item/main.naver?code=${activeStock.code}`,
      color: '#14b8a6',
    },
    {
      label: 'DART 공시',
      desc: '전자공시 원문 조회',
      url: `https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(activeStock.name)}`,
      color: '#f59e0b',
    },
  ]

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
            <span className="dim mono" style={{ fontSize: 12 }}>{activeStock.code}</span>
          </div>

          <div className="chart-links-area">
            <p className="chart-links-guide dim">
              차트 직접 임베드는 2단계(KIS API) 연동 후 지원 예정이에요.<br/>
              지금은 아래 링크로 바로 확인할 수 있어요.
            </p>
            <div className="chart-link-grid">
              {links.map(l => (
                
                  key={l.label}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="chart-link-card"
                  style={{ borderColor: l.color + '55' }}
                >
                  <span className="chart-link-dot" style={{ background: l.color }} />
                  <div>
                    <div className="chart-link-label" style={{ color: l.color }}>{l.label}</div>
                    <div className="chart-link-desc dim">{l.desc}</div>
                  </div>
                  <span className="chart-link-arrow">→</span>
                </a>
              ))}
            </div>

            <div className="chart-info-note">
              <span style={{ color: 'var(--accent-amber)' }}>●</span>
              &nbsp;2단계에서 KIS API 연동 시 실시간 시세·차트가 앱 안에 직접 표시돼요
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}