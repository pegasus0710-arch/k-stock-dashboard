import { useState } from 'react'
import './ThemeNews.css'

const THEMES = [
  { id: 'semi',    label: '반도체·AI',  color: 'var(--theme-semi)',    keyword: '반도체 AI 삼성전자 SK하이닉스 HBM' },
  { id: 'defense', label: '방산',        color: 'var(--theme-defense)', keyword: '방산 한화에어로스페이스 현대로템 K방산' },
  { id: 'ship',    label: '조선',        color: 'var(--theme-ship)',    keyword: '조선 HD현대중공업 삼성중공업 수주' },
  { id: 'nuclear', label: '원전·전력',   color: 'var(--theme-nuclear)', keyword: '원전 두산에너빌리티 효성중공업 SMR' },
  { id: 'battery', label: '2차전지',     color: 'var(--theme-battery)', keyword: '2차전지 배터리 LG에너지솔루션 ESS' },
  { id: 'bio',     label: '바이오',      color: 'var(--theme-bio)',     keyword: '바이오 셀트리온 삼성바이오로직스 신약' },
  { id: 'value',   label: '밸류업·금융', color: 'var(--theme-value)',   keyword: '밸류업 금융주 KB금융 신한지주 배당' },
]

export default function ThemeNews() {
  const [activeTheme, setActiveTheme] = useState('semi')
  const theme = THEMES.find(t => t.id === activeTheme)

  /* 네이버 뉴스 RSS URL */
  const rssUrl = `https://news.naver.com/rss/search.nhn?query=${encodeURIComponent(theme.keyword)}`

  return (
    <div className="theme-news">

      {/* 테마 선택 탭 */}
      <div className="theme-tabs">
        {THEMES.map(t => (
          <button
            key={t.id}
            className={`theme-tab ${activeTheme === t.id ? 'active' : ''}`}
            style={ activeTheme === t.id ? { borderColor: t.color, color: t.color } : {} }
            onClick={() => setActiveTheme(t.id)}
          >
            <span className="tab-dot" style={{ background: t.color }} />
            {t.label}
          </button>
        ))}
      </div>

      {/* 뉴스 영역 */}
      <div className="news-content">
        <div className="news-header">
          <span className="news-theme-label" style={{ color: theme.color }}>
            {theme.label} 뉴스
          </span>
          <a
            href={`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(theme.keyword)}&sort=1`}
            target="_blank"
            rel="noreferrer"
            className="news-link-btn"
          >
            네이버뉴스에서 보기 →
          </a>
        </div>

        {/* ── Phase 1: 안내 메시지 (API 연동 전) ── */}
        <div className="news-guide">
          <div className="guide-step">
            <div className="step-num">1</div>
            <div className="step-body">
              <strong>현재 상태</strong>
              <p>뉴스 자동 수집 기능은 백엔드 API 연동 후 활성화돼요.<br/>지금은 아래 버튼으로 직접 확인할 수 있어요.</p>
            </div>
          </div>
          <div className="guide-step">
            <div className="step-num">2</div>
            <div className="step-body">
              <strong>다음 단계 예정</strong>
              <p>Claude API 연동 시 헤드라인 자동 요약, 감성 분석이 추가돼요.</p>
            </div>
          </div>

          <div className="quick-links">
            <p className="dim" style={{ fontSize: 12, marginBottom: 8 }}>지금 바로 열기:</p>
            <div className="link-grid">
              <a href={`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(theme.keyword)}&sort=1`} target="_blank" rel="noreferrer" className="quick-btn">
                네이버 뉴스
              </a>
              <a href={`https://finance.naver.com/news/news_list.naver?mode=LSS3D&section_id=101`} target="_blank" rel="noreferrer" className="quick-btn">
                네이버 증권 뉴스
              </a>
              <a href="https://dart.fss.or.kr/" target="_blank" rel="noreferrer" className="quick-btn">
                DART 공시
              </a>
              <a href={`https://kr.tradingview.com/markets/stocks-korea/`} target="_blank" rel="noreferrer" className="quick-btn">
                TradingView KR
              </a>
            </div>
          </div>
        </div>

        {/* 키워드 태그 */}
        <div className="keyword-section">
          <span className="dim" style={{ fontSize: 12 }}>관련 키워드:</span>
          <div className="keyword-tags">
            {theme.keyword.split(' ').map(kw => (
              <a
                key={kw}
                href={`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(kw)}&sort=1`}
                target="_blank"
                rel="noreferrer"
                className="keyword-tag"
                style={{ borderColor: theme.color + '44', color: theme.color }}
              >
                {kw}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
