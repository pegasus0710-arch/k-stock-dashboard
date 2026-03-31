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

function buildPrompt(slot, md, flowData) {
  const now     = new Date()
  const dateStr = now.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'long' })
  const timeStr = now.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })
  const focus   = getSlotFocus(slot)
  const isWeekend = slot === 'weekend_sat' || slot === 'weekend_sun'

  // KST / EDT 동시 표시 — 시장 상태 오판 방지
  const kst   = new Date(Date.now() + 9 * 3600000)
  const edt   = new Date(Date.now() - 4 * 3600000)
  const pad   = n => String(n).padStart(2, '0')
  const kstHM = `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())} KST`
  const edtHM = `${pad(edt.getUTCHours())}:${pad(edt.getUTCMinutes())} EDT`
  const edtH  = edt.getUTCHours() + edt.getUTCMinutes() / 60
  const usMarketState = edtH >= 9.5 && edtH < 16 ? '정규장 운영 중 (09:30~16:00 EDT)'
    : edtH >= 4 && edtH < 9.5 ? '프리마켓 (04:00~09:30 EDT) — 정규장 아님'
    : edtH >= 16 && edtH < 20 ? '시간외 거래 (16:00~20:00 EDT)'
    : '마감 (장외 시간)'

  // VIX 5단계 해석 (올바른 기준)
  const vixLabel = !md?.vix?.price ? '' :
    md.vix.price >= 40 ? '패닉(40+)' :
    md.vix.price >= 30 ? '공포(30~40)' :
    md.vix.price >= 25 ? '주의(25~30)' :
    md.vix.price >= 20 ? '불안(20~25)' :
    md.vix.price >= 15 ? '정상(15~20)' : '과도한낙관(15미만)'

  // 수급 요약
  const flow = flowData?.total
  const fmtFlow = v => v == null ? '없음' : `${v >= 0 ? '+' : ''}${Math.abs(v) >= 100 ? (v/100).toFixed(0)+'백억' : v.toFixed(0)+'억'}`
  const flowCtx = flow
    ? `외국인 ${fmtFlow(flow.foreign)} / 기관 ${fmtFlow(flow.institution)} / 개인 ${fmtFlow(flow.individual)}`
    : '장외 시간 — 수급 없음'

  const dataCtx = md ? `
[현재 시장 데이터 — ${kstHM} / 미국 ${edtHM}]
※ 이 수치는 실시간 API 데이터입니다. 웹 검색 결과가 다를 경우 이 수치를 최우선 사용하세요.
미국 증시 상태: ${usMarketState}
${md.kospi  ? `KOSPI: ${md.kospi.price?.toLocaleString()} (${md.kospi.changeRate>=0?'+':''}${md.kospi.changeRate?.toFixed(2)}%)` : ''}
${md.kosdaq ? `KOSDAQ: ${md.kosdaq.price?.toLocaleString()} (${md.kosdaq.changeRate>=0?'+':''}${md.kosdaq.changeRate?.toFixed(2)}%)` : ''}
${md.sp500  ? `S&P500: ${md.sp500.price?.toLocaleString()} (${md.sp500.changeRate>=0?'+':''}${md.sp500.changeRate?.toFixed(2)}%)` : ''}
${md.nasdaq ? `NASDAQ: ${md.nasdaq.price?.toLocaleString()} (${md.nasdaq.changeRate>=0?'+':''}${md.nasdaq.changeRate?.toFixed(2)}%)` : ''}
${md.vix    ? `VIX(공포지수): ${md.vix.price} → ${vixLabel}` : ''}
${md.usdkrw ? `USD/KRW: ${md.usdkrw.price?.toLocaleString()}원` : ''}
${md.us10y  ? `미국10Y 국채: ${md.us10y.price}%` : ''}
${md.spread!=null ? `장단기스프레드(10Y-2Y): ${md.spread>=0?'+':''}${md.spread?.toFixed(2)}% (${md.spread<0?'⚠️ 역전 — 경기침체 신호':md.spread<0.5?'좁음 — 불확실성':'정상'})` : ''}
${md.wti    ? `WTI 유가: $${md.wti.price} (${md.wti.changeRate>=0?'+':''}${md.wti.changeRate?.toFixed(2)}%)` : ''}
${md.gold   ? `금: $${md.gold.price?.toLocaleString()} (${md.gold.changeRate>=0?'+':''}${md.gold.changeRate?.toFixed(2)}%)` : ''}
수급(코스피+코스닥): ${flowCtx}
` : ''

  return `당신은 30년 경력의 한국 증권사 수석 애널리스트입니다.
주식 초보자도 이해할 수 있도록 어려운 용어는 괄호 안에 쉽게 설명해주세요.
현재 시각: ${dateStr} ${kstHM} (미국 ${edtHM})
현재 시간대: ${SLOT_LABEL[slot]}
분석 포커스: ${focus}
${dataCtx}
웹 검색으로 최신 뉴스를 찾아 아래 7개 섹션을 순서대로 작성하세요.

[핵심 규칙 — 반드시 준수]
- 표(table) 형식 절대 금지 → 글머리 기호(-)만 사용
- 섹션당 최대 4줄. 초과 절대 금지
- 웹서치 결과는 핵심 사실만 1줄로 압축. 원문 길게 인용 금지
- 중요 기사는 [제목](URL) 링크 1개만 포함 (링크 없으면 생략)
- 위 시장 데이터 수치를 직접 언급하며 해석 (웹검색 수치로 절대 대체 금지)
- VIX 기준: 15미만=과도낙관, 15~20=정상, 20~25=불안, 25~30=주의, 30+=공포, 40+=패닉
- 섹션 순서 변경 금지 — 1번부터 순서대로 완성
- ${isWeekend ? '주말: 한국장 없음. 해외장/글로벌 뉴스 중심 분석' : ''}

## ${SLOT_LABEL[slot]} 시장 브리핑

### 📊 1. 지금 시장 상황 [필수 — 2줄 이내]
현재 어떤 장이 열려있고 핵심 흐름이 무엇인지. 초보자가 이해할 수 있게.

### 📈 2. 지수가 말하는 것 [필수 — 3줄 이내]
위 시장 데이터 수치를 직접 인용. 왜 이 수치가 중요한지 쉽게 설명.

### 🔥 3. 한국 시장 핵심 이슈 [필수 — 3줄 이내]
최근 7일 이내 한국 증시/종목 뉴스. 초보자가 몰랐을 포인트. 중요 기사 링크 1개.

### 📰 4. 글로벌 주요 뉴스 [필수 — 3줄 이내]
국내에 영향 줄 해외 뉴스 3가지 요점. 중요 기사 링크 1개.

### ⚠️ 5. 지금 하면 안 되는 것 [필수 — 3줄 이내]
현재 시장에서 초보 투자자가 저지르기 쉬운 실수 2가지. 구체적으로.

### 🔮 6. 향후 시나리오 [3줄]
▲ 낙관: (조건 + 한 줄)
■ 기본: (조건 + 한 줄)
▼ 비관: (조건 + 한 줄)

### 📅 7. 주목할 일정 [3줄 이내]
시장 영향이 큰 경제지표/이벤트 3가지. 날짜 포함.

---
> ⚠️ **면책 고지**: 이 브리핑은 투자 참고용 정보이며, 투자 결정에 대한 책임은 전적으로 본인에게 있습니다. AI 분석은 오류를 포함할 수 있으며 금융 전문가의 조언을 대체하지 않습니다.`
}

function getSlotTTLMin(slot) {
  return { premarket:60, morning:30, afternoon:30, after:480, us_market:60 }[slot] || 30
}

export default function AiBriefing({ open, onClose, marketData, flowData }) {
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
          model: 'claude-sonnet-4-5',
          max_tokens: 3500,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: buildPrompt(slot, marketData, flowData) }],
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
