// src/components/dashboard/AiBriefing.jsx
// AI 시장 브리핑 — 슬라이드 드로어 팝업
import { useState, useEffect } from 'react'
import { getTimeSlot, SLOT_LABEL, readAiCache, writeAiCache, makeAiCacheKey, saveAiBriefingMemo } from '../../hooks/useAiCache'
import MarkdownRenderer from '../ui/MarkdownRenderer'

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

function getSlotFocus(slot) {
  switch(slot) {
    case 'weekend_sat': return '전일(금) 미국장 마감 분석 + 주말 글로벌 뉴스 + 월요일 국내장 시나리오 예측'
    case 'weekend_sun': return '이번 주 시장 결산 + 다음 주 주요 일정 + 월요일 갭 방향 예측'
    case 'premarket':   return '전일 미국장 마감 분석 + 오늘 국내장 갭 방향과 수급 예측'
    case 'morning':     return '개장 초반 흐름 원인 + 오전 수급 방향 + 주목 섹터'
    case 'afternoon':   return '오후장 방향성 + 기관/외국인 수급 변화 + 마감 전 체크포인트'
    case 'after':       return '당일 마감 결산 + 오늘의 진짜 의미 + 내일 준비 포인트'
    case 'us_market':   return '현재 미국장 흐름 + 국내에 줄 영향 + 내일 갭 방향 예측'
    default:            return '현재 시장 흐름 분석'
  }
}

function buildPrompt(slot, md) {
  const now     = new Date()
  const dateStr = now.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'long' })
  const timeStr = now.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })
  const focus   = getSlotFocus(slot)
  const isWeekend = slot === 'weekend_sat' || slot === 'weekend_sun'

  const dataCtx = md ? `
[현재 시장 데이터 — ${timeStr} 기준]
${md.kospi  ? `KOSPI: ${md.kospi.price?.toLocaleString()} (${md.kospi.changeRate>=0?'+':''}${md.kospi.changeRate?.toFixed(2)}%)` : ''}
${md.kosdaq ? `KOSDAQ: ${md.kosdaq.price?.toLocaleString()} (${md.kosdaq.changeRate>=0?'+':''}${md.kosdaq.changeRate?.toFixed(2)}%)` : ''}
${md.sp500  ? `S&P500: ${md.sp500.price?.toLocaleString()} (${md.sp500.changeRate>=0?'+':''}${md.sp500.changeRate?.toFixed(2)}%)` : ''}
${md.nasdaq ? `NASDAQ: ${md.nasdaq.price?.toLocaleString()} (${md.nasdaq.changeRate>=0?'+':''}${md.nasdaq.changeRate?.toFixed(2)}%)` : ''}
${md.vix    ? `VIX: ${md.vix.price} (${md.vix.price>30?'공포':md.vix.price>20?'주의':'안정'})` : ''}
${md.usdkrw ? `USD/KRW: ${md.usdkrw.price?.toLocaleString()}원` : ''}
${md.us10y  ? `미국10Y: ${md.us10y.price}%` : ''}
${md.spread!=null ? `장단기스프레드: ${md.spread>=0?'+':''}${md.spread?.toFixed(2)}% (${md.spread<0?'역전 경고':md.spread<0.5?'주의':'정상'})` : ''}
${md.wti    ? `WTI: $${md.wti.price} (${md.wti.changeRate>=0?'+':''}${md.wti.changeRate?.toFixed(2)}%)` : ''}
${md.gold   ? `금: $${md.gold.price?.toLocaleString()} (${md.gold.changeRate>=0?'+':''}${md.gold.changeRate?.toFixed(2)}%)` : ''}
` : ''

  return `당신은 30년 경력의 한국 증권사 수석 애널리스트입니다.
주식 초보자도 이해할 수 있도록 어려운 용어는 괄호 안에 쉽게 설명해주세요.
현재 시각: ${dateStr} ${timeStr}
현재 시간대: ${SLOT_LABEL[slot]}
분석 포커스: ${focus}
${dataCtx}
웹 검색으로 최신 뉴스와 정보를 찾아 아래 7개 섹션을 작성하세요.

규칙 (반드시 준수):
- 표(table) 형식 절대 사용 금지 — 글머리 기호(-)로만 표현
- 각 섹션은 핵심만 담아 5줄 이내
- 중요 기사나 자료는 반드시 [기사제목](URL) 형식으로 링크 포함
- 위 시장 데이터 수치를 직접 언급하며 해석
- ${isWeekend ? '주말이므로 한국장은 열리지 않음. 해외장/글로벌 뉴스 중심으로 분석' : ''}

## ${SLOT_LABEL[slot]} 시장 브리핑

### 📊 지금 시장 상황
현재 어떤 장이 열려있고 핵심 흐름이 무엇인지. 초보자가 이해할 수 있게 2~3문장.

### 📈 현재 지수가 말하는 것
위 시장 데이터 수치를 직접 인용하며 지금 시장 상태 진단. 수치의 의미를 쉽게 설명. 3~4줄.

### 🔮 향후 시나리오
▲ 낙관: (한 줄)
■ 기본: (한 줄)
▼ 비관: (한 줄)
각 시나리오 발생 조건 포함.

### 🔥 이번 주 한국 시장 핵심 이슈
최근 7일 이내 한국 증시/종목 뉴스 3~4가지. 초보자가 몰랐을 포인트 포함. 중요 기사 링크 포함.

### 📰 글로벌 주요 뉴스
국내 주식시장에 영향 줄 해외 뉴스 3가지. 중요 기사 링크 포함.

### ⚠️ 지금 하면 안 되는 것
현재 시장에서 초보 투자자가 저지르기 쉬운 실수 2~3가지. 구체적으로.

### 📅 앞으로 주목할 일정
시장 영향이 큰 경제지표/실적/이벤트 3가지. 날짜와 예상 영향 포함.`
}

function getSlotTTLMin(slot) {
  return { premarket:60, morning:30, afternoon:30, after:480, us_market:60 }[slot] || 30
}

export default function AiBriefing({ open, onClose, marketData }) {
  const slot     = getTimeSlot()
  const cacheKey = makeAiCacheKey('dashboard')

  const [text,      setText]      = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [saved,     setSaved]     = useState(false)
  const [cacheInfo, setCacheInfo] = useState(null)

  useEffect(() => {
    if (!open) return
    const cached = readAiCache(cacheKey)
    if (cached) {
      setText(cached.text)
      const mins = Math.round(cached.remainMs / 60000)
      setCacheInfo(`캐시 · ${mins}분 후 갱신`)
    } else {
      setCacheInfo(null)
    }
    setSaved(false)
  }, [open, cacheKey])

  const run = async () => {
    if (!CLAUDE_KEY) { setError('Claude API 키가 없습니다.'); return }
    setLoading(true); setError(''); setSaved(false); setCacheInfo(null)
    try {
      const res  = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: buildPrompt(slot, marketData) }],
        }),
      })
      const data   = await res.json()
      const result = data.content?.filter(b => b.type === 'text').map(b => b.text).join('\n') || ''
      if (!result) throw new Error('응답이 비어있습니다.')
      setText(result)
      writeAiCache(cacheKey, result)
      setCacheInfo(`방금 분석 · ${getSlotTTLMin(slot)}분간 캐시 유지`)
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handleSaveMemo = () => {
    if (!text) return
    const now   = new Date()
    const title = `[대시보드 종합] ${now.toLocaleDateString('ko-KR')} ${now.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })}`
    saveAiBriefingMemo({ title, content: text, category: 'AI브리핑' })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (!open) return null

  return (
    <>
      <div className="ai-drawer-overlay" onClick={onClose}/>
      <div className="ai-drawer">

        {/* 헤더 */}
        <div className="ai-drawer-header">
          <div className="ai-drawer-title-row">
            <span className="ai-drawer-title">🤖 AI 시장 브리핑</span>
            <span className="ai-drawer-slot-badge">{SLOT_LABEL[slot]}</span>
          </div>
          <button className="ai-drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* 액션 */}
        <div className="ai-drawer-actions">
          <button className="ai-run-btn" onClick={run} disabled={loading}>
            {loading ? '⟳ 분석 중...' : text ? '↺ 다시 분석' : '🔍 브리핑 생성'}
          </button>
          {text && (
            <button className="ai-memo-btn" onClick={handleSaveMemo} disabled={saved}>
              {saved ? '✅ 저장됨' : '📋 메모 저장'}
            </button>
          )}
          {cacheInfo && <span className="ai-cache-info">{cacheInfo}</span>}
        </div>

        {/* 에러 */}
        {error && <div className="ai-drawer-error">⚠️ {error}</div>}

        {/* 로딩 */}
        {loading && (
          <div className="ai-drawer-loading">
            <div className="ai-drawer-spinner"/>
            <div>
              <div style={{fontWeight:600,marginBottom:4}}>시장 정보 수집 중...</div>
              <div style={{fontSize:12,color:'var(--text-dim)'}}>웹 검색으로 최신 뉴스와 데이터를 분석하고 있습니다</div>
            </div>
          </div>
        )}

        {/* 결과 */}
        {text && !loading && (
          <div className="ai-drawer-content">
            <MarkdownRenderer text={text}/>
          </div>
        )}

        {/* 빈 상태 */}
        {!text && !loading && !error && (
          <div className="ai-drawer-empty">
            <div style={{fontSize:40,marginBottom:12}}>🤖</div>
            <div style={{fontWeight:600,marginBottom:6}}>AI 시장 브리핑</div>
            <div style={{fontSize:13,color:'var(--text-dim)',lineHeight:1.7,textAlign:'center'}}>
              현재 시장 데이터 + 최신 뉴스 기반으로<br/>
              지금 투자자가 알아야 할<br/>
              핵심 인사이트를 제공합니다.
            </div>
          </div>
        )}
      </div>
    </>
  )
}
