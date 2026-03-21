import { useState, useEffect } from 'react'
import './DashboardPage.css'

// ─── 상수 ───────────────────────────────────────────────
const THEMES = [
  { id: 'semi',    label: '반도체·AI',  color: '#2563eb', emoji: '💻',
    stocks: ['삼성전자','SK하이닉스','한미반도체'],
    codes:  ['005930','000660','042700'] },
  { id: 'defense', label: '방산',        color: '#dc2626', emoji: '🛡️',
    stocks: ['한화에어로','현대로템','LIG넥스원'],
    codes:  ['012450','064350','079550'] },
  { id: 'ship',    label: '조선',        color: '#0d9488', emoji: '🚢',
    stocks: ['HD현대중공업','삼성중공업','한화오션'],
    codes:  ['329180','010140','042660'] },
  { id: 'nuclear', label: '원전·전력',   color: '#d97706', emoji: '⚡',
    stocks: ['두산에너빌리티','효성중공업','일진전기'],
    codes:  ['034020','298040','103590'] },
  { id: 'battery', label: '2차전지',     color: '#16a34a', emoji: '🔋',
    stocks: ['LG에너지솔루션','삼성SDI','POSCO홀딩스'],
    codes:  ['373220','006400','005490'] },
  { id: 'bio',     label: '바이오',      color: '#7c3aed', emoji: '🧬',
    stocks: ['셀트리온','삼성바이오','HLB'],
    codes:  ['068270','207940','028300'] },
  { id: 'value',   label: '밸류업·금융', color: '#ea580c', emoji: '🏦',
    stocks: ['KB금융','신한지주','하나금융'],
    codes:  ['105560','055550','086790'] },
]

const QUICK_LINKS = [
  { label: '네이버 증권',  url: 'https://finance.naver.com', icon: '📊' },
  { label: 'KRX 시장정보', url: 'https://data.krx.co.kr',   icon: '🏛️' },
  { label: 'DART 공시',    url: 'https://dart.fss.or.kr',   icon: '📋' },
  { label: '한국은행',     url: 'https://www.bok.or.kr',    icon: '🏦' },
  { label: '코스피 지수',  url: 'https://finance.naver.com/sise/sise_index.naver?code=KOSPI', icon: '📈' },
  { label: '코스닥 지수',  url: 'https://finance.naver.com/sise/sise_index.naver?code=KOSDAQ', icon: '📉' },
]

const MACRO_ITEMS = [
  { label: 'KOSPI',   url: 'https://finance.naver.com/sise/sise_index.naver?code=KOSPI',  color: '#2563eb' },
  { label: 'KOSDAQ',  url: 'https://finance.naver.com/sise/sise_index.naver?code=KOSDAQ', color: '#16a34a' },
  { label: 'USD/KRW', url: 'https://finance.naver.com/marketindex/',                       color: '#d97706' },
  { label: '국고채 3Y', url: 'https://finance.naver.com/marketindex/interestDetail.naver?marketindexCd=IRR_GOVT03Y', color: '#7c3aed' },
  { label: 'WTI 유가', url: 'https://finance.naver.com/marketindex/worldDailyQuote.naver?marketindexCd=OIL_CL&fdtc=2', color: '#dc2626' },
]

const TODAY_SCHEDULE = [
  { time: '09:00', label: '정규장 시작' },
  { time: '15:30', label: '정규장 마감' },
  { time: '종일', label: 'DART 공시 확인' },
]

// ─── 날짜 포맷 ────────────────────────────────────────────
function getTodayStr() {
  const d = new Date()
  const days = ['일','월','화','수','목','금','토']
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}

function getMarketStatus() {
  const now = new Date()
  const h = now.getHours(), m = now.getMinutes()
  const total = h * 60 + m
  if (total >= 9*60 && total < 15*60+30) return { label: '정규장 운영중', color: '#16a34a', dot: true }
  if (total >= 8*60 && total < 9*60)     return { label: '장 시작 전', color: '#d97706', dot: false }
  if (total >= 15*60+30 && total < 18*60) return { label: '시간외 거래', color: '#7c3aed', dot: false }
  return { label: '장 마감', color: '#64748b', dot: false }
}

// ─── AI 브리핑 ────────────────────────────────────────────
async function fetchAIBriefing(apiKey) {
  const today = new Date().toLocaleDateString('ko-KR')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `오늘(${today}) 한국 증시 전반에 대한 투자자용 AI 브리핑을 아래 형식으로 작성해줘.

## 📊 오늘의 시장 한줄 요약
(시장 분위기 한 문장)

## 🔥 오늘 주목할 테마 TOP 3
1. 테마명 — 이유 (한줄)
2. 테마명 — 이유 (한줄)
3. 테마명 — 이유 (한줄)

## ⚠️ 오늘의 리스크 요인
(주요 리스크 1~2가지, 간결하게)

## 💡 오늘 투자 포인트
(오늘 특히 주목해야 할 투자 관점 2~3줄)

## 📅 오늘 주요 일정
(경제지표 발표, 실적발표 등 있으면 작성, 없으면 "특이 일정 없음")

실시간 데이터 없어도 최신 시장 흐름 기반으로 구체적으로 작성해줘. "실시간 데이터 없음" 같은 말은 절대 쓰지 마.`,
      }],
    }),
  })
  if (!res.ok) throw new Error(`API 오류 ${res.status}`)
  const data = await res.json()
  return data.content[0].text
}

// ─── 컴포넌트 ─────────────────────────────────────────────
export default function DashboardPage() {
  const [briefing, setBriefing]   = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError]     = useState('')
  const [marketStatus]            = useState(getMarketStatus())
  const [todayStr]                = useState(getTodayStr())
  const [activeTheme, setActiveTheme] = useState(null)

  const handleAIBriefing = async () => {
    setAiLoading(true)
    setBriefing('')
    setAiError('')
    try {
      const key = import.meta.env.VITE_CLAUDE_API_KEY
      if (!key) throw new Error('Claude API 키가 없어요. Vercel 환경변수를 확인해주세요.')
      const text = await fetchAIBriefing(key)
      setBriefing(text)
    } catch (e) {
      setAiError(e.message)
    } finally {
      setAiLoading(false)
    }
  }

  const openNaverStock = (code) => {
    window.open(`https://finance.naver.com/item/main.naver?code=${code}`, '_blank')
  }

  return (
    <div className="dashboard">

      {/* ── 헤더 ── */}
      <div className="dash-header">
        <div className="dash-title-row">
          <div>
            <h1 className="dash-title">시장 대시보드</h1>
            <p className="dash-date">{todayStr}</p>
          </div>
          <div className="market-status-badge" style={{ background: marketStatus.color + '18', color: marketStatus.color, borderColor: marketStatus.color + '40' }}>
            {marketStatus.dot && <span className="status-dot" style={{ background: marketStatus.color }} />}
            {marketStatus.label}
          </div>
        </div>
      </div>

      {/* ── 매크로 지표 ── */}
      <section className="dash-section">
        <div className="section-label">매크로 지표</div>
        <div className="macro-grid">
          {MACRO_ITEMS.map(m => (
            <a key={m.label} href={m.url} target="_blank" rel="noreferrer" className="macro-card" style={{ '--accent': m.color }}>
              <span className="macro-label">{m.label}</span>
              <span className="macro-live">실시간 확인 →</span>
            </a>
          ))}
        </div>
      </section>

      {/* ── AI 시장 브리핑 ── */}
      <section className="dash-section">
        <div className="section-header">
          <div className="section-label">AI 시장 브리핑</div>
          <button
            className={`ai-briefing-btn ${aiLoading ? 'loading' : ''}`}
            onClick={handleAIBriefing}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <><span className="btn-spinner" /> 분석 중...</>
            ) : (
              <><span>✦</span> AI 브리핑 받기</>
            )}
          </button>
        </div>

        {!briefing && !aiLoading && !aiError && (
          <div className="briefing-placeholder">
            <div className="placeholder-icon">✦</div>
            <p>AI 브리핑 버튼을 눌러 오늘의 시장 분석을 받아보세요</p>
            <p className="placeholder-sub">Claude가 오늘 주목할 테마, 리스크, 투자 포인트를 정리해드려요</p>
          </div>
        )}

        {aiError && (
          <div className="briefing-error">{aiError}</div>
        )}

        {briefing && (
          <div className="briefing-result">
            <pre className="briefing-text">{briefing}</pre>
          </div>
        )}
      </section>

      {/* ── 7대 테마 현황 ── */}
      <section className="dash-section">
        <div className="section-label">7대 테마 현황</div>
        <div className="theme-grid">
          {THEMES.map(t => (
            <div
              key={t.id}
              className={`theme-card ${activeTheme === t.id ? 'active' : ''}`}
              style={{ '--theme-color': t.color }}
              onClick={() => setActiveTheme(activeTheme === t.id ? null : t.id)}
            >
              <div className="theme-card-top">
                <span className="theme-emoji">{t.emoji}</span>
                <span className="theme-name" style={{ color: t.color }}>{t.label}</span>
              </div>
              <div className="theme-stocks-list">
                {t.stocks.map((s, i) => (
                  <button
                    key={s}
                    className="theme-stock-chip"
                    onClick={(e) => { e.stopPropagation(); openNaverStock(t.codes[i]) }}
                  >
                    {s} →
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 2컬럼: 바로가기 + 오늘 일정 ── */}
      <div className="dash-two-col">

        {/* 빠른 바로가기 */}
        <section className="dash-section col-card">
          <div className="section-label">빠른 바로가기</div>
          <div className="quick-links">
            {QUICK_LINKS.map(l => (
              <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="quick-link-item">
                <span className="quick-icon">{l.icon}</span>
                <span className="quick-label">{l.label}</span>
                <span className="quick-arrow">→</span>
              </a>
            ))}
          </div>
        </section>

        {/* 오늘 일정 */}
        <section className="dash-section col-card">
          <div className="section-label">오늘 주요 일정</div>
          <div className="schedule-list">
            {TODAY_SCHEDULE.map(s => (
              <div key={s.time} className="schedule-item">
                <span className="schedule-time">{s.time}</span>
                <span className="schedule-label">{s.label}</span>
              </div>
            ))}
            <div className="schedule-divider" />
            <a
              href="https://finance.naver.com/research/invest_list.naver"
              target="_blank" rel="noreferrer"
              className="schedule-link"
            >
              📋 오늘 증권사 리포트 보기 →
            </a>
            <a
              href="https://dart.fss.or.kr/dsac999/mainY.do"
              target="_blank" rel="noreferrer"
              className="schedule-link"
            >
              📣 오늘 DART 공시 보기 →
            </a>
            <a
              href="https://finance.naver.com/sise/sise_quant.naver"
              target="_blank" rel="noreferrer"
              className="schedule-link"
            >
              🔥 거래량 상위 종목 →
            </a>
          </div>
        </section>

      </div>

      {/* ── 하단 안내 ── */}
      <div className="dash-footer-note">
        💡 키움 REST API 연동 후 실시간 시세·차트·수급 데이터가 자동으로 표시됩니다
      </div>

    </div>
  )
}
