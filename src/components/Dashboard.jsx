import { useState, useEffect } from 'react'
import './Dashboard.css'

const THEMES = [
  { id: 'semi',    label: '반도체·AI',  color: 'var(--theme-semi)',    stocks: ['삼성전자', 'SK하이닉스', 'DB하이텍'],              naverId: '005930' },
  { id: 'defense', label: '방산',        color: 'var(--theme-defense)', stocks: ['한화에어로스페이스', '현대로템', 'LIG넥스원'],      naverId: '012450' },
  { id: 'ship',    label: '조선',        color: 'var(--theme-ship)',    stocks: ['HD현대중공업', '삼성중공업', '한화오션'],           naverId: '329180' },
  { id: 'nuclear', label: '원전·전력',   color: 'var(--theme-nuclear)', stocks: ['두산에너빌리티', '효성중공업', '일진전기'],         naverId: '034020' },
  { id: 'battery', label: '2차전지',     color: 'var(--theme-battery)', stocks: ['LG에너지솔루션', '삼성SDI', 'POSCO홀딩스'],        naverId: '373220' },
  { id: 'bio',     label: '바이오',      color: 'var(--theme-bio)',     stocks: ['셀트리온', '삼성바이오로직스', 'HLB'],              naverId: '068270' },
  { id: 'value',   label: '밸류업·금융', color: 'var(--theme-value)',   stocks: ['KB금융', '신한지주', '하나금융지주'],              naverId: '105560' },
]

const MACRO = [
  { label: 'KOSPI',    value: '—', sub: '로딩 중', link: 'https://finance.naver.com/sise/sise_index.naver?code=KOSPI' },
  { label: 'KOSDAQ',   value: '—', sub: '로딩 중', link: 'https://finance.naver.com/sise/sise_index.naver?code=KOSDAQ' },
  { label: 'USD/KRW',  value: '—', sub: '로딩 중', link: 'https://finance.naver.com/marketindex/' },
  { label: '기준금리', value: '3.00%', sub: '한국은행', link: 'https://www.bok.or.kr' },
]

const CHECKLIST = [
  { color: 'var(--accent-blue)',   text: 'FOMC 일정 및 금리 방향 확인' },
  { color: 'var(--accent-amber)',  text: 'USD/KRW 환율 방향' },
  { color: 'var(--theme-semi)',    text: '삼성전자·SK하이닉스 외국인 수급' },
  { color: 'var(--theme-defense)', text: '방산 수출 뉴스 체크' },
  { color: 'var(--theme-ship)',    text: '조선 신규 수주 공시' },
  { color: 'var(--theme-battery)', text: 'ESS·전기차 관련 이슈' },
]

const QUICK_LINKS = [
  { label: '네이버 증권',  url: 'https://finance.naver.com',                                icon: '📊' },
  { label: 'DART 공시',    url: 'https://dart.fss.or.kr',                                   icon: '📋' },
  { label: 'KRX 한국거래소',url: 'https://www.krx.co.kr',                                   icon: '🏦' },
  { label: 'TradingView',  url: 'https://kr.tradingview.com',                               icon: '📈' },
  { label: '한국은행',     url: 'https://www.bok.or.kr',                                    icon: '🏛️' },
  { label: '금융감독원',   url: 'https://www.fss.or.kr',                                    icon: '⚖️' },
]

export default function Dashboard() {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  return (
    <div className="dashboard">

      {/* 날짜 헤더 */}
      <div className="dash-date">
        <span>{today}</span>
        <span className="dim" style={{ fontSize: 12 }}>키움 REST API 연동 후 실시간 데이터 표시 예정</span>
      </div>

      {/* 매크로 카드 */}
      <section className="macro-row">
        {MACRO.map(m => (
          <a key={m.label} href={m.link} target="_blank" rel="noreferrer" className="macro-card">
            <span className="macro-label">{m.label}</span>
            <span className="macro-value mono">{m.value}</span>
            <span className="macro-sub">{m.sub}</span>
          </a>
        ))}
      </section>

      {/* 2열 그리드 */}
      <div className="dash-grid">

        {/* 테마 현황 */}
        <section className="panel theme-panel">
          <div className="panel-header">
            <span className="panel-title">7대 테마 현황</span>
            <span className="panel-badge">핵심 테마</span>
          </div>
          <div className="theme-list">
            {THEMES.map(t => (
              <a
                key={t.id}
                href={`https://finance.naver.com/item/main.naver?code=${t.naverId}`}
                target="_blank"
                rel="noreferrer"
                className="theme-row"
              >
                <div className="theme-dot" style={{ background: t.color }} />
                <span className="theme-name" style={{ color: t.color }}>{t.label}</span>
                <div className="theme-stocks">
                  {t.stocks.map(s => <span key={s} className="stock-chip">{s}</span>)}
                </div>
                <span className="theme-arrow">→</span>
              </a>
            ))}
          </div>
        </section>

        {/* 오늘의 체크리스트 */}
        <section className="panel checklist-panel">
          <div className="panel-header">
            <span className="panel-title">오늘의 체크포인트</span>
          </div>
          <ul className="checklist">
            {CHECKLIST.map((c, i) => (
              <li key={i}>
                <span className="check-dot" style={{ background: c.color }} />
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 빠른 바로가기 */}
        <section className="panel quicklink-panel">
          <div className="panel-header">
            <span className="panel-title">빠른 바로가기</span>
          </div>
          <div className="quick-grid">
            {QUICK_LINKS.map(l => (
              <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="quick-item">
                <span className="quick-icon">{l.icon}</span>
                <span className="quick-label">{l.label}</span>
              </a>
            ))}
          </div>
        </section>

        {/* 주요 일정 */}
        <section className="panel schedule-panel">
          <div className="panel-header">
            <span className="panel-title">주요 일정</span>
            <a href="https://finance.naver.com/news/news_list.naver?mode=LSS3D&section_id=101" target="_blank" rel="noreferrer" className="panel-link">더보기 →</a>
          </div>
          <div className="schedule-placeholder">
            <p>키움 REST API 연동 후</p>
            <p>실적 발표·공시 일정이 자동으로 표시돼요</p>
            <a href="https://dart.fss.or.kr" target="_blank" rel="noreferrer" className="schedule-btn">DART 공시 바로가기 →</a>
          </div>
        </section>

      </div>
    </div>
  )
}
