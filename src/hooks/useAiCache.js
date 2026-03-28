// src/hooks/useAiCache.js
// AI 분석 결과 시간대별 캐시 공통 훅

/**
 * 현재 시간대 반환 (요일 포함)
 * weekend_sat  토요일 → 전일 미국장 마감 + 주말 뉴스
 * weekend_sun  일요일 → 이번주 결산 + 월요일 준비
 * premarket    06:00~09:00
 * morning      09:00~12:00
 * afternoon    12:00~15:30
 * after        15:30~23:00
 * us_market    23:00~06:00
 */
export function getTimeSlot() {
  const now = new Date()
  const day = now.getDay()   // 0=일 1=월 ... 6=토
  if (day === 6) return 'weekend_sat'
  if (day === 0) return 'weekend_sun'
  const h = now.getHours()
  const m = now.getMinutes()
  const t = h * 60 + m
  if (t >= 6*60  && t < 9*60)     return 'premarket'
  if (t >= 9*60  && t < 12*60)    return 'morning'
  if (t >= 12*60 && t < 15*60+30) return 'afternoon'
  if (t >= 15*60+30 && t < 23*60) return 'after'
  return 'us_market'
}

/** 시간대별 TTL (ms) */
export function getSlotTTL(slot) {
  const now = new Date()
  const h   = now.getHours()
  const m   = now.getMinutes()
  switch (slot) {
    case 'weekend_sat':
    case 'weekend_sun':
      return 4 * 60 * 60 * 1000  // 4시간
    case 'premarket': {
      const msTo9 = ((9*60) - (h*60+m)) * 60000
      return Math.max(msTo9, 60000)
    }
    case 'morning':
    case 'afternoon':
      return 30 * 60 * 1000
    case 'after':
      return 8 * 60 * 60 * 1000
    case 'us_market':
      return 60 * 60 * 1000
    default:
      return 30 * 60 * 1000
  }
}

/** 시간대 한글 레이블 */
export const SLOT_LABEL = {
  weekend_sat: '📰 주말 (토요일)',
  weekend_sun: '📋 주말 (일요일)',
  premarket:   '📅 개장 전',
  morning:     '🌅 오전장',
  afternoon:   '🌞 오후장',
  after:       '🌆 마감 후',
  us_market:   '🌃 미국장',
}

/** 캐시 읽기 — 만료 시 null */
export function readAiCache(cacheKey) {
  try {
    const raw = localStorage.getItem(cacheKey)
    if (!raw) return null
    const { text, ts, ttl } = JSON.parse(raw)
    if (Date.now() - ts > ttl) return null
    return { text, ts, ttl, remainMs: ttl - (Date.now() - ts) }
  } catch { return null }
}

/** 캐시 쓰기 */
export function writeAiCache(cacheKey, text) {
  const slot = getTimeSlot()
  const ttl  = getSlotTTL(slot)
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ text, ts: Date.now(), ttl, slot }))
  } catch {}
}

/** 캐시 키 생성 — 컴포넌트명 + 날짜 + 시간대 */
export function makeAiCacheKey(component) {
  const date = new Date().toISOString().slice(0, 10)
  const slot = getTimeSlot()
  return `ai_cache_${component}_${date}_${slot}`
}

/** AI 브리핑 메모 저장 (localStorage) */
export function saveAiBriefingMemo({ title, content, category = 'AI브리핑' }) {
  try {
    const key    = 'ai_briefing_memos'
    const memos  = JSON.parse(localStorage.getItem(key) || '[]')
    const now    = new Date()
    const entry  = {
      id:       `ai_${Date.now()}`,
      category,
      title:    title || `[${category}] ${now.toLocaleDateString('ko-KR')} ${now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`,
      content,
      createdAt: now.toISOString(),
      source:   'ai',
    }
    memos.unshift(entry)
    localStorage.setItem(key, JSON.stringify(memos.slice(0, 100))) // 최대 100개
    return entry
  } catch { return null }
}
