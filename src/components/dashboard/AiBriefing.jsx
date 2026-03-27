// src/components/dashboard/AiBriefing.jsx
// AI 시장 브리핑 — 슬라이드 드로어 팝업
import { useState, useEffect } from 'react'
import { getTimeSlot, SLOT_LABEL, readAiCache, writeAiCache, makeAiCacheKey, saveAiBriefingMemo } from '../../hooks/useAiCache'
import MarkdownRenderer from '../ui/MarkdownRenderer'

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

function getSlotFocus(slot) {
  switch(slot) {
    case 'premarket':  return '전일 미국장 마감 분석과 오늘 국내장 시나리오 예측에 집중'
    case 'morning':    return '현재 개장 초반 흐름, 갭 방향 원인, 오전 수급 동향에 집중'
    case 'afternoon':  return '오후장 방향성, 기관/외국인 수급 변화, 마감 전 주목 포인트에 집중'
    case 'after':      return '당일 마감 결산, 오늘 시장의 진짜 의미, 내일 준비 포인트에 집중'
    case 'us_market':  return '현재 미국장 흐름 분석, 내일 국내 시장에 줄 영향 예측에 집중'
    default:           return '현재 시장 흐름 분석에 집중'
  }
}

function buildPrompt(slot, md) {
  const now     = new Date()
  const dateStr = now.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'long' })
  const timeStr = now.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })
  const focus   = getSlotFocus(slot)

  const dataCtx = md ? `
[현재 시장 데이터 — ${timeStr} 기준]
${md.kospi   ? `KOSPI: ${md.kospi.price?.toLocaleString()} (${md.kospi.changeRate>=0?'+':''}${md.kospi.changeRate?.toFixed(2)}%)` : ''}
${md.kosdaq  ? `KOSDAQ: ${md.kosdaq.price?.toLocaleString()} (${md.kosdaq.changeRate>=0?'+':''}${md.kosdaq.changeRate?.toFixed(2)}%)` : ''}
${md.sp500   ? `S&P500: ${md.sp500.price?.toLocaleString()} (${md.sp500.changeRate>=0?'+':''}${md.sp500.changeRate?.toFixed(2)}%)` : ''}
${md.nasdaq  ? `NASDAQ: ${md.nasdaq.price?.toLocaleString()} (${md.nasdaq.changeRate>=0?'+':''}${md.nasdaq.changeRate?.toFixed(2)}%)` : ''}
${md.vix     ? `VIX: ${md.vix.price} (${md.vix.price>30?'공포 구간':md.vix.price>20?'주의 구간':'안정'})` : ''}
${md.usdkrw  ? `USD/KRW: ${md.usdkrw.price?.toLocaleString()}` : ''}
${md.us10y   ? `미국10Y: ${md.us10y.price}%` : ''}
${md.spread!=null ? `장단기스프레드: ${md.spread>=0?'+':''}${md.spread?.toFixed(2)}% (${md.spread<0?'역전 경고':md.spread<0.5?'주의':'정상'})` : ''}
${md.wti     ? `WTI: $${md.wti.price} (${md.wti.changeRate>=0?'+':''}${md.wti.changeRate?.toFixed(2)}%)` : ''}
${md.gold    ? `금: $${md.gold.price?.toLocaleString()} (${md.gold.changeRate>=0?'+':''}${md.gold.changeRate?.toFixed(2)}%)` : ''}
` : ''

  return `당신은 한국 주식시장 전문 애널리스트입니다.
현재 시각: ${dateStr} ${timeStr}
현재 시간대: ${SLOT_LABEL[slot]}
분석 포커스: ${focus}
${dataCtx}
웹 검색으로 최신 뉴스와 시장 정보를 찾아 아래 형식으로 분석해주세요.
일반 투자자가 놓치기 쉬운 포인트를 특히 강조하고, 위 시장 데이터 수치를 직접 언급하며 해석하세요.

## ${SLOT_LABEL[slot]} 시장 브리핑

### 📊 지금 시장의 맥
단순 등락이 아닌 왜 이렇게 움직이는지 구조적 원인. 2~3문장.

### ⚡ 일반 투자자가 놓치는 포인트
뉴스 뒤에 숨겨진 진짜 의미, 상관관계 역전, 수급의 진짜 방향, 지금 많이들 하는 실수.

### 🔗 오늘 이슈 → 섹터 → 종목 연결고리
특정 뉴스/이슈가 어떤 섹터에 직접/간접/반사이익/후행 영향인지 구체적으로.

### 🎯 ${slot==='premarket'?'오늘 국내장 시나리오':slot==='after'||slot==='us_market'?'내일 준비 포인트':'지금 봐야 할 것'}
체크포인트 3가지 이내. 구체적으로.

### ⚠️ 지금 하면 안 되는 것
현재 시장에서 일반 투자자가 저지르기 쉬운 실수. 구체적으로.

### 📅 이번 주 주목 일정
시장에 영향 줄 경제지표, 실적, 이벤트.`
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
          max_tokens: 1200,
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
