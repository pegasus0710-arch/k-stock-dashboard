// api/kis.js — KIS API 프록시
// 토큰을 Firebase Firestore에 저장해서 인스턴스 간 공유
// → 새 접속마다 토큰 재발급 방지, 하루 1회만 발급
//
// ⚠️  필수 Vercel 환경변수 (서버용, VITE_ 없이 따로 등록):
//   FIREBASE_PROJECT_ID  = Firebase 프로젝트 ID
//   FIREBASE_API_KEY     = Firebase API 키
//   KIS_APP_KEY          = KIS 앱키
//   KIS_APP_SECRET       = KIS 시크릿

const KIS_BASE    = 'https://openapi.koreainvestment.com:9443'
const FIRESTORE   = `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents`
const TOKEN_DOC   = `${FIRESTORE}/kis_token/main`

// ── 인스턴스 메모리 캐시 ─────────────────────────────
let _memToken = null, _memAt = 0
let _issuing  = null  // 중복 발급 방지용 Promise 락

const TTL = 23 * 60 * 60 * 1000 // 23시간

// ── 환경변수 검증 ─────────────────────────────────────
function checkEnv() {
  const pid = process.env.FIREBASE_PROJECT_ID
  const key = process.env.FIREBASE_API_KEY
  if (!pid || pid === 'undefined') {
    console.error('[KIS] FIREBASE_PROJECT_ID 환경변수 없음 → Vercel Settings에 등록 필요')
    return false
  }
  if (!key || key === 'undefined') {
    console.error('[KIS] FIREBASE_API_KEY 환경변수 없음 → Vercel Settings에 등록 필요')
    return false
  }
  return true
}

// ── Firestore에서 토큰 읽기 ──────────────────────────
async function readTokenFromFirestore() {
  if (!checkEnv()) return null
  try {
    const url = `${TOKEN_DOC}?key=${process.env.FIREBASE_API_KEY}`
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.text().catch(()=>'')
      console.error(`[KIS] Firestore 읽기 실패 ${res.status}: ${body.slice(0,200)}`)
      return null
    }
    const doc    = await res.json()
    const fields = doc.fields || {}
    const token    = fields.token?.stringValue    || null
    const issuedAt = Number(fields.issuedAt?.integerValue || 0)
    const age = Date.now() - issuedAt
    console.log(`[KIS] Firestore 토큰 읽기 성공 | 발급후 ${Math.round(age/3600000)}시간 경과`)
    return { token, issuedAt }
  } catch (e) {
    console.error('[KIS] Firestore 읽기 예외:', e.message)
    return null
  }
}

// ── Firestore에 토큰 저장 ────────────────────────────
async function saveTokenToFirestore(token, issuedAt) {
  if (!checkEnv()) return
  try {
    const url = `${TOKEN_DOC}?key=${process.env.FIREBASE_API_KEY}`
    const res = await fetch(url, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          token:    { stringValue: token },
          issuedAt: { integerValue: String(issuedAt) },
        }
      })
    })
    if (!res.ok) {
      const body = await res.text().catch(()=>'')
      console.error(`[KIS] Firestore 저장 실패 ${res.status}: ${body.slice(0,200)}`)
    } else {
      console.log('[KIS] Firestore 토큰 저장 완료')
    }
  } catch (e) {
    console.error('[KIS] Firestore 저장 예외:', e.message)
  }
}

// ── KIS 토큰 발급 ────────────────────────────────────
async function issueNewToken() {
  console.log('[KIS] 신규 토큰 발급 시작')
  const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey:    process.env.KIS_APP_KEY,
      appsecret: process.env.KIS_APP_SECRET,
    }),
  })
  if (!res.ok) throw new Error(`토큰 발급 실패: ${res.status}`)
  const data = await res.json()
  if (!data.access_token) throw new Error('토큰 응답에 access_token 없음')
  console.log('[KIS] 신규 토큰 발급 완료')
  return data.access_token
}

// ── 토큰 가져오기 (캐시 우선, 중복 발급 방지) ─────────
// 순서: 메모리 캐시 → Firestore → 신규 발급
// _issuing 락으로 동시 요청이 몰려도 1회만 발급
async function getToken() {
  const now = Date.now()

  // 1. 메모리 캐시 (인스턴스 내 가장 빠름)
  if (_memToken && now < _memAt + TTL) {
    return _memToken
  }

  // 2. 이미 발급 중인 요청이 있으면 그 결과 재사용 (중복 방지)
  if (_issuing) {
    console.log('[KIS] 발급 중인 요청 대기')
    return _issuing
  }

  // 3. Firestore 캐시 확인
  const stored = await readTokenFromFirestore()
  if (stored?.token && now < stored.issuedAt + TTL) {
    _memToken = stored.token
    _memAt    = stored.issuedAt
    console.log('[KIS] Firestore 캐시 토큰 사용')
    return _memToken
  }

  // 4. 신규 발급 (락 설정)
  _issuing = (async () => {
    try {
      const token = await issueNewToken()
      _memToken = token
      _memAt    = now
      // Firestore 저장 (await: 저장 완료 확인 후 반환)
      await saveTokenToFirestore(token, now)
      return token
    } finally {
      _issuing = null
    }
  })()

  return _issuing
}

// ── fetch with timeout ──────────────────────────────
async function fetchWithTimeout(url, opts={}, ms=8000) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(id)
  }
}

async function kisGet(path, trId, params) {
  const token = await getToken()
  const url   = new URL(`${KIS_BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetchWithTimeout(url.toString(), {
    headers: {
      'Content-Type': 'application/json',
      'authorization': `Bearer ${token}`,
      'appkey':  process.env.KIS_APP_KEY,
      'appsecret': process.env.KIS_APP_SECRET,
      'tr_id': trId,
      'custtype': 'P',
    },
  })
  if (!res.ok) throw new Error(`KIS 오류: ${res.status}`)
  return res.json()
}

const n = v => { const x = Number(v); return isNaN(x) ? 0 : x }

function marketStatus() {
  const kst  = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const day  = kst.getUTCDay()
  const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes()
  if (day === 0 || day === 6) return 'holiday'
  if (mins < 540)  return 'premarket'
  if (mins < 930)  return 'open'
  if (mins < 1080) return 'after'
  return 'closed'
}

function bizDate(offsetDays = 0) {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  kst.setUTCDate(kst.getUTCDate() + offsetDays)
  const day = kst.getUTCDay()
  if (day === 0) kst.setUTCDate(kst.getUTCDate() - 2)
  if (day === 6) kst.setUTCDate(kst.getUTCDate() - 1)
  return kst.toISOString().slice(0, 10).replace(/-/g, '')
}

// ── 지수 조회 ─────────────────────────────────────────
async function fetchIndex(market) {
  const status_ = marketStatus()
  const isOpen  = status_ === 'open'
  const mktDiv  = market === 'KOSDAQ' ? 'Q' : 'U'
  const iscd    = market === 'KOSDAQ' ? '1001' : '0001'

  // ── 실시간 (장중) ──────────────────────────────────
  if (isOpen) {
    try {
      const d = await kisGet(
        '/uapi/domestic-stock/v1/quotations/inquire-index-price',
        'FHPUP02100000',
        { FID_COND_MRKT_DIV_CODE: mktDiv, FID_INPUT_ISCD: iscd }
      )
      if (d.rt_cd === '0') {
        const o     = d.output
        const price = n(o.bstp_nmix_prpr)
        if (price > 0) {
          return {
            market, status: 'open',
            price,
            change:     n(o.bstp_nmix_prdy_vrss),
            changeRate: n(o.bstp_nmix_prdy_ctrt),
            open:       n(o.bstp_nmix_oprc),
            high:       n(o.bstp_nmix_hgpr),
            low:        n(o.bstp_nmix_lwpr),
            volume:     n(o.acml_vol),
          }
        }
      }
      console.log(`${market} 실시간: rt_cd=${d.rt_cd} msg=${d.msg1}`)
    } catch (e) {
      console.log(`${market} 실시간 실패:`, e.message)
    }
  }

  // ── 장외/실시간 실패 → 일봉 종가 ────────────────────
  const today  = bizDate(0)
  const before = bizDate(-10)
  // ✅ 일봉 API는 KOSPI/KOSDAQ 모두 'U' 사용 (실시간은 KOSDAQ='Q')
  const dailyMktDiv = 'U'

  try {
    const d = await kisGet(
      '/uapi/domestic-stock/v1/quotations/inquire-index-daily-price',
      'FHPUP02120000',
      {
        FID_COND_MRKT_DIV_CODE: dailyMktDiv,
        FID_INPUT_ISCD:         iscd,
        FID_INPUT_DATE_1:       before,
        FID_INPUT_DATE_2:       today,
        FID_PERIOD_DIV_CODE:    'D',
      }
    )
    console.log(`${market} 일봉 rt_cd=${d.rt_cd} len=${d.output2?.length}`)

    if (d.rt_cd === '0' && d.output2?.length > 0) {
      const o    = d.output2[0]
      const date = o.stck_bsop_date || today

      // KOSPI/KOSDAQ 필드명 차이 대응 — 가능한 모든 필드 시도
      const price = n(
        o.bstp_nmix_prpr || o.stck_clpr || o.bstp_nmix_clpr ||
        o.clpr || o.prpr || o.prc
      )

      if (price > 0) {
        return {
          market, status: status_, price,
          change:     n(o.bstp_nmix_prdy_vrss || o.prdy_vrss || o.vrss),
          changeRate: n(o.bstp_nmix_prdy_ctrt  || o.prdy_ctrt || o.ctrt),
          high:       n(o.bstp_nmix_hgpr        || o.stck_hgpr || o.hgpr),
          low:        n(o.bstp_nmix_lwpr         || o.stck_lwpr || o.lwpr),
          volume:     n(o.acml_vol),
          closeDate:  `${date.slice(0,4)}.${date.slice(4,6)}.${date.slice(6,8)}`,
        }
      }
      // price 0이면 실제 응답 필드 로그 출력 (Vercel 로그에서 확인)
      console.log(`${market} price=0, output2[0]:`, JSON.stringify(o))
    }
  } catch (e) {
    console.log(`${market} 일봉 실패:`, e.message)
  }

  // ── KOSDAQ 최후 수단: KODEX KOSDAQ150 ETF(229200) 대체 ──
  if (market === 'KOSDAQ') {
    try {
      const d = await kisGet(
        '/uapi/domestic-stock/v1/quotations/inquire-price',
        'FHKST01010100',
        { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: '229200' }
      )
      if (d.rt_cd === '0') {
        const o = d.output
        return {
          market: 'KOSDAQ', status: 'closed',
          price:      n(o.stck_prpr),
          change:     n(o.prdy_vrss),
          changeRate: n(o.prdy_ctrt),
          high:       n(o.stck_hgpr),
          low:        n(o.stck_lwpr),
          volume:     n(o.acml_vol),
          closeDate:  'ETF 참고치',
          note:       'KODEX KOSDAQ150 ETF 기준',
        }
      }
    } catch (e) {
      console.log('KOSDAQ ETF fallback 실패:', e.message)
    }
  }

  return { market, status: 'closed', price: 0, change: 0, changeRate: 0 }
}

// ── 종목 현재가 ───────────────────────────────────────
// inquire-price (FHKST01010100) = 장중/장외 모두 가장 최근 가격 + 전일대비 반환
// → 장중·장외 구분 없이 항상 이 API 사용 (등락률 정상)
async function fetchPrice(code) {
  const status_ = marketStatus()

  // 1) inquire-price: 장중 실시간 + 장외 마감가 모두 처리
  try {
    const d = await kisGet(
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      'FHKST01010100',
      { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code }
    )
    if (d.rt_cd === '0') {
      const o    = d.output
      const price = n(o.stck_prpr)
      if (price > 0) {
        return {
          code,
          status:     status_,   // open / after / premarket / closed 그대로 전달
          name:       o.hts_kor_isnm || '',
          price,
          change:     n(o.prdy_vrss),       // ← 전일대비 금액 (항상 있음)
          changeRate: n(o.prdy_ctrt),       // ← 전일대비율 (항상 있음)
          open:       n(o.stck_oprc),
          high:       n(o.stck_hgpr),
          low:        n(o.stck_lwpr),
          volume:     n(o.acml_vol),
          per:        n(o.per),
          pbr:        n(o.pbr),
        }
      }
    }
  } catch {}

  // 2) fallback: 일봉 차트 API (prdy_ctrt 없는 경우 직접 계산)
  try {
    const today  = bizDate(0)
    const before = bizDate(-7)
    const d = await kisGet(
      '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
      'FHKST03010100',
      { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code,
        FID_INPUT_DATE_1: before, FID_INPUT_DATE_2: today,
        FID_PERIOD_DIV_CODE: 'D', FID_ORG_ADJ_PRC: '0' }
    )
    if (d.rt_cd === '0' && d.output2?.length >= 2) {
      const o  = d.output2[0]  // 가장 최근 거래일
      const o1 = d.output1 || {}
      const prev = d.output2[1] // 전 거래일

      const price    = n(o.stck_clpr)
      const prevClose = n(prev.stck_clpr)
      const change    = price - prevClose
      const changeRate = prevClose ? Math.round(change / prevClose * 10000) / 100 : 0
      const date = o.stck_bsop_date || today

      return {
        code, status: 'closed',
        name:       o1.hts_kor_isnm || '',
        price,
        change,
        changeRate,
        volume:     n(o.acml_vol),
        closeDate:  `${date.slice(0,4)}.${date.slice(4,6)}.${date.slice(6,8)}`,
      }
    }
  } catch {}

  return { code, status: 'closed', price: 0, change: 0, changeRate: 0 }
}

// ── 환율 + 7일 히스토리 (frankfurter.app 무료) ────────
async function fetchForex() {
  try {
    const today  = new Date(Date.now() + 9*60*60*1000).toISOString().slice(0,10)
    const weekAgo = new Date(Date.now() + 9*60*60*1000 - 10*24*60*60*1000).toISOString().slice(0,10)

    // 현재 환율 + 히스토리 동시 조회
    const [curRes, histRes] = await Promise.all([
      fetch('https://open.er-api.com/v6/latest/USD'),
      fetch(`https://api.frankfurter.app/${weekAgo}..${today}?from=USD&to=KRW,JPY,CNY`),
    ])
    const cur  = await curRes.json()
    const hist = await histRes.json()

    // 히스토리 → 날짜 순 정렬
    const dates   = Object.keys(hist.rates || {}).sort()
    const krwHist = dates.map(d => hist.rates[d]?.KRW || 0)
    const jpyHist = dates.map(d => hist.rates[d]?.JPY || 0)
    const cnyHist = dates.map(d => hist.rates[d]?.CNY || 0)

    return {
      usdKrw:   Math.round(cur.rates.KRW),
      usdJpy:   cur.rates.JPY?.toFixed(2),
      usdCny:   cur.rates.CNY?.toFixed(4),
      history: { dates, krw: krwHist, jpy: jpyHist, cny: cnyHist },
    }
  } catch (e) {
    console.log('환율 조회 실패:', e.message)
    return null
  }
}

// ── 해외지수 심볼 맵 (Yahoo Finance) ──────────────────
const GLOBAL_SYMBOLS = {
  // 미국 지수
  'SP500':  '%5EGSPC',
  'NASDAQ': '%5EIXIC',
  'DOW':    '%5EDJI',
  // 아시아
  'N225':   '%5EN225',    // 닛케이225
  'HSI':    '%5EHSI',     // 항셍
  'SSE':    '000001.SS',  // 상해종합
  'TWI':    '%5ETWII',    // 대만가권
  // 유럽
  'DAX':    '%5EGDAXI',   // 독일 DAX
  // 채권/금리
  'US10Y':  '%5ETNX',     // 미국 10년
  'US2Y':   '%5EIRX',     // 미국 단기(3M T-Bill 대리)
  'KR10Y':  '%5EKRX', // 한국 10년 (KRX composite as proxy)
  // 원자재
  'WTI':    'CL%3DF',     // WTI 원유
  'BRENT':  'BZ%3DF',     // 브렌트유
  'GOLD':   'GC%3DF',     // 금
  'SILVER': 'SI%3DF',     // 은
  'COPPER': 'HG%3DF',     // 구리
  // 기타
  'VIX':    '%5EVIX',     // 공포지수
  'DXY':    'DX-Y.NYB',   // 달러인덱스
}

// ── 단일 해외지수 조회 헬퍼 ────────────────────────────
async function fetchOneGlobal(sym, range = '3mo') {
  const yahooSym = GLOBAL_SYMBOLS[sym]
  // KR10Y fallback symbols
  if (sym === 'KR10Y') {
    for (const altSym of ['KR10YT%3DRR','%5EKR10YT%3DRR','KRGB10YD%3DRR']) {
      try {
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${altSym}?interval=1d&range=5d`,{ headers:{ 'User-Agent':'Mozilla/5.0' }})
        if (r.ok) { const j = await r.json(); if (j.chart?.result?.[0]?.meta?.regularMarketPrice) { return await _fetchOneGlobal(altSym, range) } }
      } catch {}
    }
    return { symbol: sym, error: 'KR10Y 데이터 없음' }
  }
  if (!yahooSym) return { symbol: sym, error: '알 수 없는 심볼' }
  const interval = (range === '5y' || range === '2y') ? '1mo' : range === '1y' ? '1wk' : '1d'
  try {
    const yRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=${interval}&range=${range}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (!yRes.ok) return { symbol: sym, error: `Yahoo ${yRes.status}` }
    const yData  = await yRes.json()
    const result = yData.chart?.result?.[0]
    if (!result) return { symbol: sym, error: '데이터 없음' }
    const meta       = result.meta
    const timestamps = result.timestamp || []
    const quotes     = result.indicators?.quote?.[0] || {}
    const candles = timestamps.map((ts, i) => ({
      date:   new Date(ts * 1000).toISOString().slice(0,10).replace(/-/g,''),
      open:   Math.round((quotes.open?.[i]  || 0) * 100) / 100,
      high:   Math.round((quotes.high?.[i]  || 0) * 100) / 100,
      low:    Math.round((quotes.low?.[i]   || 0) * 100) / 100,
      close:  Math.round((quotes.close?.[i] || 0) * 100) / 100,
      volume: quotes.volume?.[i] || 0,
    })).filter(c => c.close > 0)
    const regularPrice = meta.regularMarketPrice || 0
    const postPrice    = meta.postMarketPrice    || 0
    const prePrice     = meta.preMarketPrice     || 0
    const mktState     = meta.marketState || 'CLOSED'
    let price = regularPrice
    if (mktState === 'POST' && postPrice > 0) price = postPrice
    if (mktState === 'PRE'  && prePrice  > 0) price = prePrice
    // ✅ chartPreviousClose 사용 안 함 (range 시작점 종가 = 누적 등락률 버그)
    const metaPrev    = meta.regularMarketPreviousClose || 0
    const candlePrev  = candles.length >= 2 ? candles[candles.length - 2].close : 0
    const prevClose   = metaPrev > 0 ? metaPrev : candlePrev
    const change      = Math.round((price - prevClose) * 100) / 100
    const changeRate  = prevClose ? Math.round(change / prevClose * 10000) / 100 : 0
    return { symbol: sym, price, change, changeRate, marketState: mktState, candles }
  } catch (e) {
    return { symbol: sym, error: e.message }
  }
}

// ══════════════════════════════════════════════════════
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET)
    return res.status(500).json({ error: 'KIS API 키 없음' })

  const { type, code, period } = req.query
  const status = marketStatus()

  // ── 토큰 상태 진단 엔드포인트 (/api/kis?type=token-status) ──
  if (type === 'token-status') {
    const pid = process.env.FIREBASE_PROJECT_ID
    const key = process.env.FIREBASE_API_KEY
    const firestoreOk = !!(pid && pid !== 'undefined' && key && key !== 'undefined')
    const stored = firestoreOk ? await readTokenFromFirestore() : null
    const now    = Date.now()
    return res.json({
      env: {
        FIREBASE_PROJECT_ID: pid ? `${pid.slice(0,4)}...${pid.slice(-4)}` : '❌ 미등록',
        FIREBASE_API_KEY:    key ? `${key.slice(0,4)}...${key.slice(-4)}` : '❌ 미등록',
        KIS_APP_KEY:         process.env.KIS_APP_KEY ? '✅ 등록됨' : '❌ 미등록',
      },
      firestore: {
        url:       `https://firestore.googleapis.com/v1/projects/${pid || 'MISSING'}/...`,
        reachable: firestoreOk,
        hasToken:  !!(stored?.token),
        issuedAt:  stored?.issuedAt ? new Date(stored.issuedAt).toISOString() : null,
        ageHours:  stored?.issuedAt ? Math.round((now - stored.issuedAt) / 3600000) : null,
        expired:   stored?.issuedAt ? (now - stored.issuedAt > TTL) : true,
      },
      memCache: {
        hasToken:  !!_memToken,
        ageHours:  _memAt ? Math.round((now - _memAt) / 3600000) : null,
      },
    })
  }

  try {
    switch (type) {

      case 'dashboard': {
        const themeCodes = (req.query.codes || '').split(',').filter(Boolean)
        const [kospi, kosdaq, forex, ...stocks] = await Promise.allSettled([
          fetchIndex('KOSPI'),
          fetchIndex('KOSDAQ'),
          fetchForex(),
          ...themeCodes.map(fetchPrice),
        ])
        return res.json({
          marketStatus: status,
          kospi:  kospi.status  === 'fulfilled' ? kospi.value  : null,
          kosdaq: kosdaq.status === 'fulfilled' ? kosdaq.value : null,
          forex:  forex.status  === 'fulfilled' ? forex.value  : null,
          prices: stocks.map((r, i) =>
            r.status === 'fulfilled' ? r.value : { code: themeCodes[i], error: true }
          ),
        })
      }

      case 'index': {
        return res.json(await fetchIndex(req.query.market || 'KOSPI'))
      }

      // ── 지수 차트 (스파크라인 + 팝업용) ──────────────
      case 'index-chart': {
        const market  = req.query.market || 'KOSPI'
        // ✅ 일봉 API는 KOSDAQ도 'U' 사용
        const mktDiv  = 'U'
        const iscd    = market === 'KOSDAQ' ? '1001' : '0001'
        const days    = Number(req.query.days || 60)
        const today   = bizDate(0)
        const d       = new Date(Date.now() + 9*60*60*1000)
        d.setUTCDate(d.getUTCDate() - days)
        const from    = d.toISOString().slice(0,10).replace(/-/g,'')
        const data    = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-index-daily-price',
          'FHPUP02120000',
          { FID_COND_MRKT_DIV_CODE:mktDiv, FID_INPUT_ISCD:iscd,
            FID_INPUT_DATE_1:from, FID_INPUT_DATE_2:today, FID_PERIOD_DIV_CODE:'D' }
        )
        const candles = (data.output2||[]).map(o=>({
          date:  o.stck_bsop_date,
          open:  n(o.bstp_nmix_oprc  || o.stck_oprc),
          high:  n(o.bstp_nmix_hgpr  || o.stck_hgpr),
          low:   n(o.bstp_nmix_lwpr  || o.stck_lwpr),
          close: n(o.bstp_nmix_prpr  || o.stck_clpr),
          volume:n(o.acml_vol),
        })).filter(c=>c.close>0).reverse()
        return res.json({ market, candles })
      }

      // ── 해외 지수 (Yahoo Finance 프록시) ──────────────
      case 'global': {
        const sym   = req.query.symbol || 'SP500'
        const range = req.query.range  || '3mo'
        return res.json(await fetchOneGlobal(sym, range))
      }

      // ── 배치 조회 ───────────────────────────────────────
      case 'global-batch': {
        const symbols = (req.query.symbols || '').split(',').filter(Boolean)
        if (!symbols.length) return res.json({})
        const results = await Promise.allSettled(symbols.map(s => fetchOneGlobal(s, '5d')))
        const map = {}
        results.forEach((r, i) => {
          if (r.status === 'fulfilled' && !r.value?.error) map[symbols[i]] = r.value
        })
        return res.json(map)
      }

      // ── 환율 KRW 기준 배치 ────────────────────────────
      case 'forex-krw': {
        const range    = req.query.range || '3mo'
        const interval = range === '5y' ? '1mo' : range === '1y' ? '1wk' : '1d'
        const PAIRS = { USD: 'KRW=X', JPY: 'JPYKRW=X', CNY: 'CNYKRW=X', EUR: 'EURKRW=X' }
        const fetchPair = async (key, yahooSym) => {
          const r = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=${interval}&range=${range}`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } }
          )
          if (!r.ok) return null
          const j      = await r.json()
          const result = j.chart?.result?.[0]
          if (!result) return null
          const meta = result.meta
          const ts   = result.timestamp || []
          const q    = result.indicators?.quote?.[0] || {}
          const mult = key === 'JPY' ? 100 : 1  // 100엔 단위
          const r4   = v => Math.round((v || 0) * mult * 100) / 100
          const candles = ts.map((t, i) => ({
            date:  new Date(t * 1000).toISOString().slice(0,10).replace(/-/g,''),
            close: r4(q.close?.[i]),
          })).filter(c => c.close > 0)
          const price    = r4(meta.regularMarketPrice)
          const metaPrev = r4(meta.regularMarketPreviousClose)
          const prev     = metaPrev > 0 ? metaPrev : (candles.length >= 2 ? candles[candles.length-2].close : 0)
          const change   = Math.round((price - prev) * 100) / 100
          const changeRate = prev ? Math.round(change / prev * 10000) / 100 : 0
          return { price, change, changeRate, candles }
        }
        const results = await Promise.allSettled(
          Object.entries(PAIRS).map(([k, v]) => fetchPair(k, v))
        )
        const map = {}
        Object.keys(PAIRS).forEach((k, i) => {
          if (results[i].status === 'fulfilled' && results[i].value) map[k] = results[i].value
        })
        return res.json(map)
      }

      // ── 환율 차트 (frankfurter.app) ────────────────────
      case 'forex-chart': {
        // Yahoo Finance 기반 환율 OHLC (KRW=X, JPY=X, CNY=X)
        const FOREX_SYMBOLS = {
          'KRW': 'KRW=X',
          'JPY': 'JPY=X',
          'CNY': 'CNY=X',
          'EUR': 'EUR=X',
          'GBP': 'GBP=X',
        }
        const pair     = req.query.pair  || 'KRW'
        const range    = req.query.range || '3mo' // 1mo, 3mo, 6mo, 1y, 2y, 5y
        const interval = (range === '5y' || range === '2y') ? '1mo'
                       : range === '1y' ? '1wk'
                       : '1d'
        const yahooSym = FOREX_SYMBOLS[pair] || 'KRW=X'
        const fRes = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=${interval}&range=${range}`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        )
        if (!fRes.ok) throw new Error(`Yahoo 환율 오류: ${fRes.status}`)
        const fData   = await fRes.json()
        const result  = fData.chart?.result?.[0]
        if (!result) throw new Error('환율 데이터 없음')
        const meta       = result.meta
        const timestamps = result.timestamp || []
        const quotes     = result.indicators?.quote?.[0] || {}
        const r4 = v => Math.round((v||0) * 10000) / 10000
        const candles = timestamps.map((ts, i) => ({
          date:   new Date(ts * 1000).toISOString().slice(0,10).replace(/-/g,''),
          open:   r4(quotes.open?.[i]),
          high:   r4(quotes.high?.[i]),
          low:    r4(quotes.low?.[i]),
          close:  r4(quotes.close?.[i]),
          volume: quotes.volume?.[i] || 0,
        })).filter(c => c.close > 0)
        const price    = r4(meta.regularMarketPrice)
        const prevClose= r4(meta.regularMarketPreviousClose || meta.chartPreviousClose)
        const change   = r4(price - prevClose)
        const changeRate = prevClose ? Math.round(change / prevClose * 100 * 100) / 100 : 0
        return res.json({ pair, candles, price, change, changeRate })
      }

      case 'price': {
        if (!code) return res.status(400).json({ error: '종목코드 필요' })
        return res.json(await fetchPrice(code))
      }

      case 'prices': {
        const codes = (req.query.codes || '').split(',').filter(Boolean).slice(0,20)
        const results = await Promise.allSettled(codes.map(fetchPrice))
        return res.json({
          marketStatus: status,
          prices: results.map((r,i) =>
            r.status === 'fulfilled' ? r.value : { code: codes[i], error: true }
          ),
        })
      }

      case 'forex': {
        return res.json(await fetchForex() || { error: '환율 조회 실패' })
      }

      case 'chart': {
        if (!code) return res.status(400).json({ error: '종목코드 필요' })
        const div   = period === 'W' ? 'W' : period === 'M' ? 'M' : 'D'
        const today = new Date().toISOString().slice(0,10).replace(/-/g,'')
        const d     = new Date()
        if (div==='M') d.setFullYear(d.getFullYear()-5)
        else if (div==='W') d.setFullYear(d.getFullYear()-2)
        else d.setFullYear(d.getFullYear()-1)
        const data = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
          'FHKST03010100',
          { FID_COND_MRKT_DIV_CODE:'J', FID_INPUT_ISCD:code,
            FID_INPUT_DATE_1:d.toISOString().slice(0,10).replace(/-/g,''),
            FID_INPUT_DATE_2:today, FID_PERIOD_DIV_CODE:div, FID_ORG_ADJ_PRC:'0' }
        )
        return res.json({
          code, period: div, name: data.output1?.hts_kor_isnm,
          candles: (data.output2||[]).map(o=>({
            date: o.stck_bsop_date,
            open: n(o.stck_oprc), high: n(o.stck_hgpr),
            low:  n(o.stck_lwpr), close: n(o.stck_clpr),
            volume: n(o.acml_vol),
          })).reverse(),
        })
      }

      case 'supply': {
        if (!code) return res.status(400).json({ error: '종목코드 필요' })
        const data = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-investor',
          'FHKST01010900',
          { FID_COND_MRKT_DIV_CODE:'J', FID_INPUT_ISCD:code }
        )
        return res.json({
          code, supply: (data.output||[]).slice(0,10).map(o=>({
            date: o.stck_bsop_date,
            foreign: n(o.frgn_ntby_qty),
            institution: n(o.orgn_ntby_qty),
            individual: n(o.prsn_ntby_qty),
          })),
        })
      }

      // ── KOSDAQ 디버그 (raw 응답 확인용) ───────────────
      case 'debug-kosdaq': {
        const today  = bizDate(0)
        const before = bizDate(-10)
        // FID_COND_MRKT_DIV_CODE: 일봉API는 'Q' 안됨 → 'U' 시도
        const raw = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-index-daily-price',
          'FHPUP02120000',
          { FID_COND_MRKT_DIV_CODE:'U', FID_INPUT_ISCD:'1001',
            FID_INPUT_DATE_1:before, FID_INPUT_DATE_2:today, FID_PERIOD_DIV_CODE:'D' }
        )
        return res.json({
          rt_cd:   raw.rt_cd,
          msg1:    raw.msg1,
          output1: raw.output1,
          output2_first: raw.output2?.[0] || null,
          output2_keys:  raw.output2?.[0] ? Object.keys(raw.output2[0]) : [],
        })
      }

      // ── 기준금리 (FRED API) ──────────────────────────
      case 'central-rates': {
        // FRED 심볼: 미국 FEDFUNDS, 일본 IRSTCI01JPM156N, 중국 IRSTCI01CNM156N, 유럽 ECBDFR
        const FRED_SERIES = {
          US:  'FEDFUNDS',              // 미국 연방기금금리
          JP:  'IRSTCI01JPM156N',       // 일본 기준금리
          CN:  'IRSTCI01CNM156N',       // 중국 기준금리
          EU:  'ECBDFR',                // 유럽 ECB 예금금리
        }
        // 한국은행 ECOS API (FRED에 없음) → 고정값 fallback
        const KR_RATE = { rate: 2.75, date: '2025-02', note: '한국은행 기준금리' }

        const fetchFRED = async (series) => {
          try {
            const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}&vintage_date=${new Date().toISOString().slice(0,10)}`
            const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
            if (!r.ok) return null
            const text = await r.text()
            const lines = text.trim().split('\n').filter(l => !l.startsWith('DATE') && l.trim())
            const last = lines[lines.length - 1]
            if (!last) return null
            const [date, val] = last.split(',')
            const rate = parseFloat(val)
            if (isNaN(rate)) return null
            return { rate, date: date?.trim() }
          } catch { return null }
        }

        const results = await Promise.allSettled(
          Object.entries(FRED_SERIES).map(([k, v]) => fetchFRED(v).then(r => ({ k, r })))
        )
        const rates = { KR: KR_RATE }
        results.forEach(r => {
          if (r.status === 'fulfilled' && r.value?.r) {
            rates[r.value.k] = r.value.r
          }
        })
        return res.json(rates)
      }

      default:
        return res.status(400).json({ error: `알 수 없는 type: ${type}` })
    }
  } catch (e) {
    if (e.message.includes('401')) {
      // 토큰 무효 → 메모리 + Firestore 캐시 초기화
      _memToken = null; _memAt = 0
      saveTokenToFirestore('', 0)
    }
    console.error('KIS Error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}