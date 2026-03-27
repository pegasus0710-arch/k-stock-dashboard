// src/utils/format.js
// 전체 페이지 공통 포맷 함수 — 여기서만 수정하면 전체 반영

/** 숫자 → 한국식 천단위 콤마 (예: 1234567 → '1,234,567') */
export function fmt(v) {
  if (v == null) return '—'
  const n = Number(v)
  if (isNaN(n)) return '—'
  return n.toLocaleString('ko-KR')
}

/** 숫자 → 소수점 포함 포맷 (예: 1234.56 → '1,234.56') */
export function fmtDec(v, decimals = 2) {
  if (v == null) return '—'
  const n = Number(v)
  if (isNaN(n)) return '—'
  return n.toLocaleString('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** 등락률 포맷 (예: 1.23 → '+1.23%', -0.5 → '-0.50%') */
export function fmtRate(v) {
  const x = Number(v || 0)
  return `${x > 0 ? '+' : ''}${x.toFixed(2)}%`
}

/** 등락금액 포맷 (예: 1500 → '+1,500', -500 → '-500') */
export function fmtChange(v) {
  const x = Number(v || 0)
  return `${x > 0 ? '+' : ''}${x.toLocaleString('ko-KR')}`
}

/** 등락 색상 (상승=빨강, 하락=파랑, 보합=회색) */
export function rateColor(v) {
  const x = Number(v || 0)
  return x > 0 ? '#ef4444' : x < 0 ? '#3b82f6' : '#64748b'
}

/** 금액 축약 (예: 123456789 → '1.2억', 12345 → '1.2만') */
export function fmtShort(n) {
  if (!n && n !== 0) return '0'
  const num = Number(n)
  if (num >= 1_000_000_000_000) return (num / 1_000_000_000_000).toFixed(1) + '조'
  if (num >= 100_000_000)       return (num / 100_000_000).toFixed(1) + '억'
  if (num >= 10_000)            return (num / 10_000).toFixed(0) + '만'
  if (num >= 1_000)             return (num / 1_000).toFixed(1) + 'K'
  return String(num)
}

/** 날짜 문자열 포맷 (예: '20260326' → '2026.03.26') */
export function fmtDate(s) {
  if (!s || s.length < 8) return s || ''
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`
}

/** 오늘 날짜 한국어 문자열 (예: '2026년 3월 26일 (목)') */
export function getTodayStr() {
  const d = new Date()
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}

/** 현재 시간 HH:MM 문자열 */
export function getNowTime() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

/** 숫자 문자열 파싱 (부호·콤마 제거) */
export function parseNum(s) {
  if (!s) return 0
  return parseInt(String(s).replace(/[^0-9-]/g, '')) || 0
}

/** 한국 주식 시장 상태 */
export function getKstStatus() {
  const kst  = new Date(Date.now() + 9 * 3600000)
  const day  = kst.getUTCDay()
  const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes()
  if (day === 0 || day === 6) return 'holiday'
  if (mins < 540)  return 'premarket'  // ~09:00
  if (mins < 930)  return 'open'       // 09:00~15:30
  if (mins < 1080) return 'after'      // 15:30~18:00 시간외단일가
  return 'closed'
}

export const isMarketOpen   = () => getKstStatus() === 'open'
export const isAfterHours   = () => getKstStatus() === 'after'
export const isUSMarketOpen = () => {
  const d = new Date()
  const m = d.getHours() * 60 + d.getMinutes()
  const w = d.getDay()
  return w >= 1 && w <= 6 && (m >= 1410 || m < 360)
}

/** 캐시 TTL: 장중 30초, 시간외 2분, 그 외 10분 */
export function getDashTTL() {
  const s = getKstStatus()
  if (s === 'open')  return 30_000
  if (s === 'after') return 120_000
  return 600_000
}

/**
 * 종목 ID 기반 현재 거래소 상태 (시간 기반)
 * 반환값: 'live' | 'pre' | 'after' | 'closed' | null
 */
export function getSymbolMarketStatus(itemId) {
  const kst  = new Date(Date.now() + 9 * 3600000)
  const day  = kst.getUTCDay()   // 0=일 1=월 ... 6=토
  const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes()

  // ── 한국 (KOSPI, KOSDAQ, KRX100, KOSPI200, KOSDAQ150) ──
  const KR = ['KOSPI','KOSDAQ','KRX100','K200','KQ150']
  if (KR.includes(itemId)) {
    if (day === 0 || day === 6) return 'closed'
    if (mins >= 540  && mins < 930)  return 'live'   // 09:00~15:30
    if (mins >= 930  && mins < 1080) return 'after'  // 15:30~18:00
    return 'closed'
  }

  // ── 미국 (서머타임 커버: 22:30~05:00 KST) ──
  const US = ['SP500','NASDAQ','DOW']
  if (US.includes(itemId)) {
    if (day === 0) return 'closed'
    // pre: 21:00~22:30 KST
    const isPre  = (day >= 1 && day <= 5) && mins >= 1260 && mins < 1350
    // live: 22:30~05:00 KST (across midnight)
    const isLive = ((day >= 1 && day <= 5) && mins >= 1350) ||
                   ((day >= 2 && day <= 6) && mins < 300)
    // after: 05:00~09:30 KST
    const isAft  = (day >= 2 && day <= 6) && mins >= 300 && mins < 570
    if (isLive) return 'live'
    if (isPre)  return 'pre'
    if (isAft)  return 'after'
    return 'closed'
  }

  // ── 일본 닛케이 (09:00~15:30 JST ≈ KST) ──
  if (itemId === 'N225') {
    if (day === 0 || day === 6) return 'closed'
    if (mins >= 540 && mins < 930) return 'live'
    return 'closed'
  }

  // ── 중국·홍콩 (상해 SSE, 항셍 HSI) — 10:30~16:00 KST ──
  const CN = ['SSE','HSI']
  if (CN.includes(itemId)) {
    if (day === 0 || day === 6) return 'closed'
    if (mins >= 630 && mins < 960) return 'live'
    return 'closed'
  }

  // ── 대만 가권 — 09:00~13:30 TST = 10:00~14:30 KST ──
  if (itemId === 'TWI') {
    if (day === 0 || day === 6) return 'closed'
    if (mins >= 600 && mins < 870) return 'live'
    return 'closed'
  }

  // ── 독일 DAX (유럽장) — 16:00~01:30 KST (서머타임 포함) ──
  if (itemId === 'DAX') {
    if (day === 0 || day === 6) return 'closed'
    if (mins >= 960) return 'live'                   // 16:00+ 당일
    if (mins < 90 && day >= 2) return 'live'         // 00:00~01:30 전날 세션
    return 'closed'
  }

  return null // 채권, 환율, 스프레드 등
}
