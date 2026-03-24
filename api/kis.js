// api/kis.js — KIS API 프록시
// 핵심: 배치 요청으로 토큰 발급 최소화

const KIS_BASE = 'https://openapi.koreainvestment.com:9443'

// ── 토큰 캐시 (인스턴스 메모리) ───────────────────────
let _token   = null
let _tokenAt = 0

async function getToken() {
  const now = Date.now()
  if (_token && now < _tokenAt + 23 * 60 * 60 * 1000) return _token // 23시간 캐시
  const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey:     process.env.KIS_APP_KEY,
      appsecret:  process.env.KIS_APP_SECRET,
    }),
  })
  if (!res.ok) throw new Error(`토큰 발급 실패: ${res.status}`)
  const data = await res.json()
  if (!data.access_token) throw new Error('토큰 없음')
  _token   = data.access_token
  _tokenAt = now
  return _token
}

async function kisGet(path, trId, params) {
  const token = await getToken()
  const url   = new URL(`${KIS_BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: {
      'Content-Type':  'application/json',
      'authorization': `Bearer ${token}`,
      'appkey':        process.env.KIS_APP_KEY,
      'appsecret':     process.env.KIS_APP_SECRET,
      'tr_id':         trId,
      'custtype':      'P',
    },
  })
  if (!res.ok) throw new Error(`KIS 오류: ${res.status}`)
  return res.json()
}

const n = v => { const x = Number(v); return isNaN(x) ? 0 : x }

// KST 장중 여부
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

// 최근 영업일 YYYYMMDD
function bizDate(offsetDays = 0) {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  kst.setUTCDate(kst.getUTCDate() + offsetDays)
  const day = kst.getUTCDay()
  if (day === 0) kst.setUTCDate(kst.getUTCDate() - 2)
  if (day === 6) kst.setUTCDate(kst.getUTCDate() - 1)
  return kst.toISOString().slice(0, 10).replace(/-/g, '')
}

// ── 지수 조회 ────────────────────────────────────────
async function fetchIndex(market) {
  const isOpen = marketStatus() === 'open'
  const mktDiv = market === 'KOSDAQ' ? 'Q' : 'U'
  // ✅ KOSDAQ 코드 수정: 'Q' → '1001', KOSPI: '0001'
  const iscd   = market === 'KOSDAQ' ? '1001' : '0001'

  if (isOpen) {
    const d = await kisGet(
      '/uapi/domestic-stock/v1/quotations/inquire-index-price',
      'FHPUP02100000',
      { FID_COND_MRKT_DIV_CODE: mktDiv, FID_INPUT_ISCD: iscd }
    )
    if (d.rt_cd === '0') {
      const o = d.output
      return {
        market, status: 'open',
        price:      n(o.bstp_nmix_prpr),
        change:     n(o.bstp_nmix_prdy_vrss),
        changeRate: n(o.bstp_nmix_prdy_ctrt),
        open:       n(o.bstp_nmix_oprc),
        high:       n(o.bstp_nmix_hgpr),
        low:        n(o.bstp_nmix_lwpr),
        volume:     n(o.acml_vol),
      }
    }
  }

  // 장외시간 → 일봉으로 종가 조회
  const today  = bizDate(0)
  const before = bizDate(-5) // 5일 전까지 조회
  const d = await kisGet(
    '/uapi/domestic-stock/v1/quotations/inquire-index-daily-price',
    'FHPUP02120000',
    {
      FID_COND_MRKT_DIV_CODE: mktDiv,
      FID_INPUT_ISCD:         iscd,
      FID_INPUT_DATE_1:       before,
      FID_INPUT_DATE_2:       today,
      FID_PERIOD_DIV_CODE:    'D',
    }
  )
  if (d.rt_cd === '0' && d.output2?.length > 0) {
    const o    = d.output2[0]
    const date = o.stck_bsop_date || today
    return {
      market, status: 'closed',
      price:      n(o.bstp_nmix_prpr || o.stck_clpr),
      change:     n(o.bstp_nmix_prdy_vrss || o.prdy_vrss),
      changeRate: n(o.bstp_nmix_prdy_ctrt || o.prdy_ctrt),
      high:       n(o.bstp_nmix_hgpr || o.stck_hgpr),
      low:        n(o.bstp_nmix_lwpr || o.stck_lwpr),
      volume:     n(o.acml_vol),
      closeDate:  `${date.slice(0,4)}.${date.slice(4,6)}.${date.slice(6,8)}`,
    }
  }
  return { market, status: 'closed', price: 0, change: 0, changeRate: 0 }
}

// ── 종목 현재가 조회 ─────────────────────────────────
async function fetchPrice(code) {
  const isOpen = marketStatus() === 'open'
  if (isOpen) {
    const d = await kisGet(
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      'FHKST01010100',
      { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code }
    )
    if (d.rt_cd === '0') {
      const o = d.output
      return {
        code, status: 'open',
        name:       o.hts_kor_isnm,
        price:      n(o.stck_prpr),
        change:     n(o.prdy_vrss),
        changeRate: n(o.prdy_ctrt),
        volume:     n(o.acml_vol),
        per:        n(o.per),
        pbr:        n(o.pbr),
      }
    }
  }

  // 장외 → 전일종가 (차트 1일치)
  const today  = bizDate(0)
  const before = bizDate(-5)
  const d = await kisGet(
    '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
    'FHKST03010100',
    {
      FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: before, FID_INPUT_DATE_2: today,
      FID_PERIOD_DIV_CODE: 'D', FID_ORG_ADJ_PRC: '0',
    }
  )
  if (d.rt_cd === '0' && d.output2?.length > 0) {
    const o    = d.output2[0]
    const o1   = d.output1 || {}
    const date = o.stck_bsop_date || today
    return {
      code, status: 'closed',
      name:       o1.hts_kor_isnm || '',
      price:      n(o.stck_clpr),
      change:     n(o.prdy_vrss),
      changeRate: n(o.prdy_ctrt),
      volume:     n(o.acml_vol),
      closeDate:  `${date.slice(0,4)}.${date.slice(4,6)}.${date.slice(6,8)}`,
    }
  }
  return { code, status: 'closed', price: 0, change: 0, changeRate: 0 }
}

// ── 환율 조회 (무료 API, 토큰 불필요) ─────────────────
async function fetchExchangeRate() {
  try {
    const res  = await fetch('https://open.er-api.com/v6/latest/USD')
    const data = await res.json()
    if (data.result === 'success') {
      return {
        usdKrw: Math.round(data.rates.KRW),
        usdJpy: data.rates.JPY?.toFixed(2),
        usdCny: data.rates.CNY?.toFixed(4),
        updatedAt: data.time_last_update_utc,
      }
    }
  } catch {}
  return null
}

// ══════════════════════════════════════════════════════
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET) {
    return res.status(500).json({ error: 'KIS API 키 없음' })
  }

  const { type, code, period } = req.query
  const status = marketStatus()

  try {
    switch (type) {

      // ══ 대시보드 배치 — 한 번에 모든 데이터 ══════════
      // 이 하나의 엔드포인트로 대시보드 전체 데이터를 가져옴
      // → 토큰 발급 1회, Vercel 인스턴스 1개
      case 'dashboard': {
        const themeCodes = (req.query.codes || '').split(',').filter(Boolean)

        // 병렬로 모든 데이터 조회
        const [kospi, kosdaq, forex, ...stockPrices] = await Promise.allSettled([
          fetchIndex('KOSPI'),
          fetchIndex('KOSDAQ'),
          fetchExchangeRate(),
          ...themeCodes.map(c => fetchPrice(c)),
        ])

        return res.json({
          marketStatus: status,
          kospi:   kospi.status  === 'fulfilled' ? kospi.value  : null,
          kosdaq:  kosdaq.status === 'fulfilled' ? kosdaq.value : null,
          forex:   forex.status  === 'fulfilled' ? forex.value  : null,
          prices:  stockPrices.map((r, i) =>
            r.status === 'fulfilled' ? r.value : { code: themeCodes[i], error: true }
          ),
        })
      }

      // ══ 지수 단독 ═════════════════════════════════════
      case 'index': {
        const market = req.query.market || 'KOSPI'
        const data   = await fetchIndex(market)
        return res.json(data)
      }

      // ══ 종목 현재가 ═══════════════════════════════════
      case 'price': {
        if (!code) return res.status(400).json({ error: '종목코드 필요' })
        return res.json(await fetchPrice(code))
      }

      // ══ 여러 종목 현재가 ══════════════════════════════
      case 'prices': {
        const codes   = (req.query.codes || '').split(',').filter(Boolean).slice(0, 20)
        if (!codes.length) return res.status(400).json({ error: '종목코드 필요' })
        const results = await Promise.allSettled(codes.map(fetchPrice))
        return res.json({
          marketStatus: status,
          prices: results.map((r, i) =>
            r.status === 'fulfilled' ? r.value : { code: codes[i], error: true }
          ),
        })
      }

      // ══ 환율 ══════════════════════════════════════════
      case 'forex': {
        const data = await fetchExchangeRate()
        return res.json(data || { error: '환율 조회 실패' })
      }

      // ══ 차트 ══════════════════════════════════════════
      case 'chart': {
        if (!code) return res.status(400).json({ error: '종목코드 필요' })
        const div    = period === 'W' ? 'W' : period === 'M' ? 'M' : 'D'
        const today  = new Date().toISOString().slice(0,10).replace(/-/g,'')
        const d      = new Date()
        if (div==='M') d.setFullYear(d.getFullYear()-5)
        else if (div==='W') d.setFullYear(d.getFullYear()-2)
        else d.setFullYear(d.getFullYear()-1)
        const start  = d.toISOString().slice(0,10).replace(/-/g,'')
        const data   = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
          'FHKST03010100',
          { FID_COND_MRKT_DIV_CODE:'J', FID_INPUT_ISCD:code,
            FID_INPUT_DATE_1:start, FID_INPUT_DATE_2:today,
            FID_PERIOD_DIV_CODE:div, FID_ORG_ADJ_PRC:'0' }
        )
        return res.json({
          code, period: div,
          name:    data.output1?.hts_kor_isnm,
          candles: (data.output2||[]).map(o=>({
            date:   o.stck_bsop_date,
            open:   n(o.stck_oprc), high:  n(o.stck_hgpr),
            low:    n(o.stck_lwpr), close: n(o.stck_clpr),
            volume: n(o.acml_vol),
          })).reverse(),
        })
      }

      // ══ 수급 ══════════════════════════════════════════
      case 'supply': {
        if (!code) return res.status(400).json({ error: '종목코드 필요' })
        const data = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-investor',
          'FHKST01010900',
          { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code }
        )
        return res.json({
          code,
          supply: (data.output||[]).slice(0,10).map(o=>({
            date:        o.stck_bsop_date,
            foreign:     n(o.frgn_ntby_qty),
            institution: n(o.orgn_ntby_qty),
            individual:  n(o.prsn_ntby_qty),
          })),
        })
      }

      default:
        return res.status(400).json({ error: `알 수 없는 type: ${type}` })
    }
  } catch (e) {
    if (e.message.includes('401') || e.message.includes('토큰')) {
      _token = null; _tokenAt = 0
    }
    console.error('KIS Error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
