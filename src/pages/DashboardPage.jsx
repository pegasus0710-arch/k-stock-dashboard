import { useState } from 'react'
import './DashboardPage.css'

const THEMES = [
  { id: 'semi',    label: '반도체·AI',  color: '#2563eb', stocks: ['삼성전자','SK하이닉스','DB하이텍'],        code: '005930' },
  { id: 'defense', label: '방산',        color: '#dc2626', stocks: ['한화에어로스페이스','현대로템','LIG넥스원'],  code: '012450' },
  { id: 'ship',    label: '조선',        color: '#0d9488', stocks: ['HD현대중공업','삼성중공업','한화오션'],       code: '329180' },
  { id: 'nuclear', label: '원전·전력',   color: '#d97706', stocks: ['두산에너빌리티','효성중공업','일진전기'],     code: '034020' },
  { id: 'battery', label: '2차전지',     color: '#16a34a', stocks: ['LG에너지솔루션','삼성SDI','POSCO홀딩스'],    code: '373220' },
  { id: 'bio',     label: '바이오',      color: '#7c3aed', stocks: ['셀트리온','삼성바이오로직스','HLB'],          code: '068270' },
  { id: 'value',   label: '밸류업·금융', color: '#ea580c', stocks: ['KB금융','신한지주','하나금융지주'],           code: '105560' },
]

const MACRO = [
  { label: 'KOSPI',   value: '—', change: '—', link: 'https://finance.naver.com/sise/sise_index.naver?code=KOSPI' },
  { label: 'KOSDAQ',  value: '—', change: '—', link: 'https://finance.naver.com/sise/sise_index.naver?code=KOSDAQ' },
  { label: 'USD/KRW', value: '—', change: '—', link: 'https://finance.naver.com/marketindex/' },
  { label: '기준금리', value: '3.00%', change: '동결', link: 'https://www.bok.or.kr' },
]

const QUICK = [
  { label: '네이버 증권', url: 'https://finance.naver.com',       icon: '📊' },
  { label: 'DART 공시',   url: 'https://dart.fss.or.kr',          icon: '📋' },
  { label: 'KRX',         url: 'https://www.krx.co.kr',           icon: '🏦' },
  { label: 'TradingView', url: 'https://kr.tradingview.com',      icon: '📈' },
  { label: '한국은행',    url: 'https://www.bok.or.kr',           icon: '🏛️' },
  { label: '금융감독원',  url: 'https://www.fss.or.kr',           icon: '⚖️' },
]

const CHECK = [
  { color: '#2563eb', text: 'FOMC 일정 및 금리 방향 확인' },
  { color: '#d97706', text: 'USD/KRW 환율 방향 체크' },
  { color: '#2563eb', text: '삼성전자·SK하이닉스 외국인 수급' },
  { color: '#dc2626', text: '방산 수출 뉴스 체크' },
  { color: '#0d9488', text: '조선 신규 수주 공시' },
  { color: '#16a34a', text: 'ESS·전기차 관련 이슈' },
]

export default function DashboardPage() {
  const [aiText,     setAiText]     = useState('')
  const [aiLoading,  setAiLoading]  = useState(false)
  const today = new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'long' })

  const runAiAnalysis = async () => {
    setAiLoading(true)
    setAiText('')
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `오늘 날짜: ${today}

한국 주식 시장 AI 브리핑을 작성해주세요. 아래 형식으로 간결하게 작성해주세요:

📌 오늘의 시장 요약
(전반적인 시장 흐름 2-3줄)

🎯 주목 테마
(오늘 주목할 테마 2개와 이유)

⚠️ 리스크 요인
(오늘 주의할 리스크 1-2개)

📋 오늘의 전략
(간단한 대응 전략 2-3줄)`
          }]
        })
      })
      const data = await res.json()
      setAiText(data.content?.[0]?.text || '분석 결과를 불러오지 못했어요.')
    } catch {
      setAiText('AI 분석 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="dashboard-page">

      {/* 날짜 + AI 분석 버튼 */}
      <div className="dash-header">
        <div>
          <div className="dash-date">{today}</div>
          <div className="dash-sub dim">키움 REST API 연동 후 실시간 데이터 표시 예정</div>
        </div>
        <button className="ai-analysis-btn" onClick={runAiAnalysis} disabled={aiLoading}>
          {aiLoading ? <><span className="btn-spinner" /> 분석 중...</> : '✦ AI 시장 브리핑'}
        </button>
      </div>

      {/* AI 분석 결과 */}
      {(aiText || aiLoading) && (
        <div className="ai-result-box">
          {aiLoading
            ? <div className="ai-loading"><div className="ai-spinner"/><span>AI가 오늘 시장을 분석하고 있어요...</span></div>
            : <pre className="ai-result-text">{aiText}</pre>
          }
        </div>
      )}

      {/* 매크로 카드 */}
      <section className="macro-row">
        {MACRO.map(m => (
          <a key={m.label} href={m.link} target="_blank" rel="noreferrer" className="macro-card">
            <span className="macro-label">{m.label}</span>
            <span className="macro-value mono">{m.value}</span>
            <span className="macro-change dim">{m.change}</span>
          </a>
        ))}
      </section>

      {/* 본문 2단 그리드 */}
      <div className="dash-grid">

        {/* 7대 테마 현황 */}
        <section className="panel theme-panel">
          <div className="panel-header">
            <span className="panel-title">7대 테마 현황</span>
            <span className="panel-badge">핵심 테마</span>
          </div>
          <div className="theme-list">
            {THEMES.map(t => (
              <a key={t.id}
                href={`https://finance.naver.com/item/main.naver?code=${t.code}`}
                target="_blank" rel="noreferrer"
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

        {/* 오른쪽 컬럼 */}
        <div className="dash-right-col">

          {/* 오늘의 체크포인트 */}
          <section className="panel">
            <div className="panel-header">
              <span className="panel-title">오늘의 체크포인트</span>
            </div>
            <ul className="checklist">
              {CHECK.map((c, i) => (
                <li key={i}>
                  <span className="check-dot" style={{ background: c.color }} />
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* 빠른 바로가기 */}
          <section className="panel">
            <div className="panel-header">
              <span className="panel-title">빠른 바로가기</span>
            </div>
            <div className="quick-grid">
              {QUICK.map(l => (
                <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="quick-item">
                  <span className="quick-icon">{l.icon}</span>
                  <span className="quick-label">{l.label}</span>
                </a>
              ))}
            </div>
          </section>

          {/* 주요 일정 */}
          <section className="panel">
            <div className="panel-header">
              <span className="panel-title">주요 일정</span>
              <a href="https://dart.fss.or.kr" target="_blank" rel="noreferrer" className="panel-link">DART →</a>
            </div>
            <div className="schedule-placeholder">
              <p>키움 REST API 연동 후 실적 발표·공시 일정이 표시돼요</p>
              <a href="https://dart.fss.or.kr" target="_blank" rel="noreferrer" className="schedule-btn">
                DART 공시 바로가기 →
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
