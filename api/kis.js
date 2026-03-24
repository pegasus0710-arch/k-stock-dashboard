// api/kis.js — KIS API 프록시
// 토큰을 Firebase Firestore에 저장해서 인스턴스 간 공유
// → 새 접속마다 토큰 재발급 방지, 하루 1회만 발급

const KIS_BASE    = 'https://openapi.koreainvestment.com:9443'
const FIRESTORE   = `https://firestore.googleapis.com/v1/projects/${process.env.VITE_FIREBASE_PROJECT_ID}/databases/(default)/documents`
const TOKEN_DOC   = `${FIRESTORE}/kis_token/main`

// ── 인스턴스 메모리 캐시 (Firestore 호출 최소화) ────────
let _memToken = null, _memAt = 0

// ── Firestore에서 토큰 읽기 ──────────────────────────
async function readTokenFromFirestore() {
  try {
    const res = await fetch(`${TOKEN_DOC}?key=${process.env.VITE_FIREBASE_API_KEY}`)
    if (!res.ok) return null
    const doc = await res.json()
    const fields = doc.fields || {}
    return {
      token:    fields.token?.stringValue || null,
      issuedAt: Number(fields.issuedAt?.integerValue || 0),
    }
  } catch { return null }
}

// ── Firestore에 토큰 저장 ────────────────────────────
async function saveTokenToFirestore(token, issuedAt) {
  try {
    await fetch(`${TOKEN_DOC}?key=${process.env.VITE_FIREBASE_API_KEY}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          token:    { stringValue: token },
          issuedAt: { integerValue: String(issuedAt) },
        }
      })
    })
  } catch (e) {
    console.log('Firestore 저장 실패:', e.message)
  }
}

// ── KIS 토큰 발급 ────────────────────────────────────
async function issueNewToken() {
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
  if (!data.access_token) throw new Error('토큰 없음')
  return data.access_token
}

// ── 토큰 가져오기 (캐시 우선) ────────────────────────
// 순서: 메모리 캐시 → Firestore → 신규 발급
async function getToken() {
  const now = Date.now()
  const TTL = 23 * 60 * 60 * 1000 // 23시간

  // 1. 메모리 캐시 확인 (가장 빠름, Firestore 호출 없음)
  if (_memToken && now < _memAt + TTL) {
    return _memToken
  }

  // 2. Firestore 캐시 확인 (인스턴스 재시작 후에도 유지)
  const stored = await readTokenFromFirestore()
  if (stored?.token && now < stored.issuedAt + TTL) {
    // Firestore 토큰 유효 → 메모리에도 저장 후 반환
    _memToken = stored.token
    _memAt    = stored.issuedAt
    return _memToken
  }

  // 3. 신규 발급 (카톡 알림 1회)
  console.log('KIS 토큰 신규 발급')
  const token = await issueNewToken()
  _memToken = token
  _memAt    = now
  // Firestore에 비동기 저장 (응답 지연 없음)
  saveTokenToFirestore(token, now)
  return token
}

async function kisGet(path, trId, params) {
  const token = await getToken()
  const url   = new URL(`${KIS_BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
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
  const isOpen = marketStatus() === 'open'
  const mktDiv = market === 'KOSDAQ' ? 'Q' : 'U'
  const iscd   = market === 'KOSDAQ' ? '1001' : '0001'

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
          market, status: 'closed', price,
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
async function fetchPrice(code) {
  const isOpen = marketStatus() === 'open'
  if (isOpen) {
    try {
      const d = await kisGet(
        '/uapi/domestic-stock/v1/quotations/inquire-price',
        'FHKST01010100',
        { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code }
      )
      if (d.rt_cd === '0') {
        const o = d.output
        return { code, status: 'open',
          name: o.hts_kor_isnm, price: n(o.stck_prpr),
          change: n(o.prdy_vrss), changeRate: n(o.prdy_ctrt),
          volume: n(o.acml_vol), per: n(o.per), pbr: n(o.pbr) }
      }
    } catch {}
  }
  // 장외 → 일봉
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
    if (d.rt_cd === '0' && d.output2?.length > 0) {
      const o = d.output2[0], o1 = d.output1 || {}
      const date = o.stck_bsop_date || today
      return { code, status: 'closed',
        name: o1.hts_kor_isnm || '', price: n(o.stck_clpr),
        change: n(o.prdy_vrss), changeRate: n(o.prdy_ctrt),
        volume: n(o.acml_vol),
        closeDate: `${date.slice(0,4)}.${date.slice(4,6)}.${date.slice(6,8)}` }
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

// ══════════════════════════════════════════════════════
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET)
    return res.status(500).json({ error: 'KIS API 키 없음' })

  const { type, code, period } = req.query
  const status = marketStatus()

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
        const SYMBOLS = {
          'SP500':  '%5EGSPC',
          'NASDAQ': '%5EIXIC',
          'DOW':    '%5EDJI',
          'US10Y':  '%5ETNX',
          'N225':   '%5EN225',
          'HSI':    '%5EHSI',
          'SSE':    '000001.SS',
          'WTI':    'CL%3DF',
        }
        const sym      = req.query.symbol || 'SP500'
        const range    = req.query.range  || '3mo' // 3mo, 6mo, 1y, 2y
        const interval = range === '1y' ? '1wk' : range === '6mo' ? '1d' : '1d'
        const yahooSym = SYMBOLS[sym] || SYMBOLS['SP500']
        const yRes = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=${interval}&range=${range}`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        )
        if (!yRes.ok) throw new Error(`Yahoo Finance 오류: ${yRes.status}`)
        const yData = await yRes.json()
        const result = yData.chart?.result?.[0]
        if (!result) throw new Error('데이터 없음')
        const meta       = result.meta
        const timestamps = result.timestamp || []
        const quotes     = result.indicators?.quote?.[0] || {}
        const candles = timestamps.map((ts, i) => ({
          date:   new Date(ts * 1000).toISOString().slice(0,10).replace(/-/g,''),
          open:   quotes.open?.[i]  ? Math.round((quotes.open[i]  || 0) * 100) / 100 : 0,
          high:   quotes.high?.[i]  ? Math.round((quotes.high[i]  || 0) * 100) / 100 : 0,
          low:    quotes.low?.[i]   ? Math.round((quotes.low[i]   || 0) * 100) / 100 : 0,
          close:  quotes.close?.[i] ? Math.round((quotes.close[i] || 0) * 100) / 100 : 0,
          volume: quotes.volume?.[i] || 0,
        })).filter(c => c.close > 0)
        const price     = meta.regularMarketPrice || 0
        const prevClose = meta.chartPreviousClose || meta.previousClose || 0
        const change    = Math.round((price - prevClose) * 100) / 100
        const changeRate = prevClose ? Math.round(change / prevClose * 10000) / 100 : 0
        return res.json({ symbol: sym, price, change, changeRate, candles })
      }

      // ── 환율 차트 (frankfurter.app) ────────────────────
      case 'forex-chart': {
        const pair = req.query.pair || 'KRW' // USD/KRW = pair=KRW
        const days = Number(req.query.days || 90)
        const to   = new Date(Date.now() + 9*60*60*1000).toISOString().slice(0,10)
        const from2 = new Date(Date.now() + 9*60*60*1000 - days*24*60*60*1000).toISOString().slice(0,10)
        const fRes = await fetch(
          `https://api.frankfurter.app/${from2}..${to}?from=USD&to=${pair}`
        )
        if (!fRes.ok) throw new Error(`환율 API 오류: ${fRes.status}`)
        const fData = await fRes.json()
        const dates   = Object.keys(fData.rates || {}).sort()
        const candles = dates.map(date => {
          const v = fData.rates[date]?.[pair] || 0
          return { date: date.replace(/-/g,''), open:v, high:v, low:v, close:v, volume:0 }
        }).filter(c => c.close > 0)
        const first = candles[0]?.close || 0
        const last  = candles[candles.length-1]?.close || 0
        return res.json({
          pair, base:'USD', candles,
          price:      last,
          change:     Math.round((last-first)*10000)/10000,
          changeRate: first ? Math.round((last-first)/first*100*100)/100 : 0,
        })
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