// api/kis.js — KIS API 프록시 (토큰 캐싱 + 장외시간 전일종가 처리)

const KIS_BASE = 'https://openapi.koreainvestment.com:9443'

// ── 토큰 캐시 ──────────────────────────────────────────
let _tokenCache = null
let _tokenExpiry = 0

async function getToken() {
  const now = Date.now()
  if (_tokenCache && now < _tokenExpiry - 5 * 60 * 1000) return _tokenCache
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
  _tokenCache = data.access_token
  _tokenExpiry = now + (data.expires_in || 86400) * 1000
  return _tokenCache
}

async function kisGet(path, trId, params) {
  const token = await getToken()
  const url = new URL(`${KIS_BASE}${path}`)
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
  if (!res.ok) throw new Error(`KIS API 오류: ${res.status}`)
  return await res.json()
}

function safeNum(v) { const n = Number(v); return isNaN(n) ? 0 : n }

// KST 기준 장중 여부
function isMarketOpen() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const day  = kst.getUTCDay()
  const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes()
  if (day === 0 || day === 6) return false
  return mins >= 540 && mins < 930
}

// 최근 영업일 날짜 (YYYYMMDD)
function getRecentBizDate() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  // 장 시작 전(09:00 이전)이면 하루 전 날짜 사용
  const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes()
  if (mins < 540) kst.setUTCDate(kst.getUTCDate() - 1)
  // 주말이면 금요일로
  const day = kst.getUTCDay()
  if (day === 0) kst.setUTCDate(kst.getUTCDate() - 2)
  if (day === 6) kst.setUTCDate(kst.getUTCDate() - 1)
  return kst.toISOString().slice(0,10).replace(/-/g,'')
}

// ── 지수 전일종가 조회 (일봉 차트 1일치) ──────────────
async function getIndexPrevClose(market) {
  const bizDate = getRecentBizDate()
  const mktDiv  = market === 'KOSDAQ' ? 'Q' : 'U'
  const iscd    = market === 'KOSDAQ' ? 'Q' : '0001'

  // 지수 일봉 조회
  const data = await kisGet(
    '/uapi/domestic-stock/v1/quotations/inquire-index-daily-price',
    'FHPUP02120000',
    {
      FID_COND_MRKT_DIV_CODE: mktDiv,
      FID_INPUT_ISCD:         iscd,
      FID_INPUT_DATE_1:       bizDate,
      FID_INPUT_DATE_2:       bizDate,
      FID_PERIOD_DIV_CODE:    'D',
    }
  )

  if (data.rt_cd === '0' && data.output2?.length > 0) {
    const o = data.output2[0]
    return {
      price:      safeNum(o.bstp_nmix_prpr || o.stck_clpr),
      change:     safeNum(o.bstp_nmix_prdy_vrss || o.prdy_vrss),
      changeRate: safeNum(o.bstp_nmix_prdy_ctrt || o.prdy_ctrt),
      open:       safeNum(o.bstp_nmix_oprc  || o.stck_oprc),
      high:       safeNum(o.bstp_nmix_hgpr  || o.stck_hgpr),
      low:        safeNum(o.bstp_nmix_lwpr  || o.stck_lwpr),
      volume:     safeNum(o.acml_vol),
      date:       o.stck_bsop_date || bizDate,
    }
  }
  return null
}

// ── 종목 전일종가 조회 ────────────────────────────────
async function getStockPrevClose(code) {
  const bizDate = getRecentBizDate()
  const data = await kisGet(
    '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
    'FHKST03010100',
    {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD:         code,
      FID_INPUT_DATE_1:       bizDate,
      FID_INPUT_DATE_2:       bizDate,
      FID_PERIOD_DIV_CODE:    'D',
      FID_ORG_ADJ_PRC:        '0',
    }
  )
  if (data.rt_cd === '0' && data.output2?.length > 0) {
    const o  = data.output2[0]
    const o1 = data.output1 || {}
    return {
      name:       o1.hts_kor_isnm || '',
      price:      safeNum(o.stck_clpr),
      change:     safeNum(o.prdy_vrss),
      changeRate: safeNum(o.prdy_ctrt),
      open:       safeNum(o.stck_oprc),
      high:       safeNum(o.stck_hgpr),
      low:        safeNum(o.stck_lwpr),
      volume:     safeNum(o.acml_vol),
      date:       o.stck_bsop_date || bizDate,
    }
  }
  return null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=60') // 장외시간 60초 캐시
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET) {
    return res.status(500).json({ error: 'KIS API 키가 없어요.' })
  }

  const { type, code, period } = req.query
  const marketOpen = isMarketOpen()

  try {
    switch (type) {

      // ── 지수 ────────────────────────────────────────
      case 'index': {
        const market = req.query.market || 'KOSPI'
        const mktDiv = market === 'KOSDAQ' ? 'Q' : 'U'
        const iscd   = market === 'KOSDAQ' ? 'Q' : '0001'

        // 장중이면 실시간 조회
        if (marketOpen) {
          const data = await kisGet(
            '/uapi/domestic-stock/v1/quotations/inquire-index-price',
            'FHPUP02100000',
            { FID_COND_MRKT_DIV_CODE: mktDiv, FID_INPUT_ISCD: iscd }
          )
          const o = data.output || {}
          if (data.rt_cd === '0') {
            return res.json({
              market, marketOpen: true, status: 'open',
              price:      safeNum(o.bstp_nmix_prpr),
              change:     safeNum(o.bstp_nmix_prdy_vrss),
              changeRate: safeNum(o.bstp_nmix_prdy_ctrt),
              open:       safeNum(o.bstp_nmix_oprc),
              high:       safeNum(o.bstp_nmix_hgpr),
              low:        safeNum(o.bstp_nmix_lwpr),
              volume:     safeNum(o.acml_vol),
            })
          }
        }

        // 장외시간 → 전일/당일 종가 조회
        const prev = await getIndexPrevClose(market)
        if (prev) {
          return res.json({
            market, marketOpen: false, status: 'closed',
            ...prev,
            label: `${prev.date.slice(0,4)}.${prev.date.slice(4,6)}.${prev.date.slice(6,8)} 종가`,
          })
        }

        // fallback
        return res.json({ market, marketOpen: false, status: 'closed', price: 0, change: 0, changeRate: 0 })
      }

      // ── 현재가 ──────────────────────────────────────
      case 'price': {
        if (!code) return res.status(400).json({ error: '종목코드 필요' })

        // 장중이면 실시간
        if (marketOpen) {
          const data = await kisGet(
            '/uapi/domestic-stock/v1/quotations/inquire-price',
            'FHKST01010100',
            { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code }
          )
          const o = data.output || {}
          if (data.rt_cd === '0') {
            return res.json({
              code, marketOpen: true, status: 'open',
              name:       o.hts_kor_isnm,
              price:      safeNum(o.stck_prpr),
              change:     safeNum(o.prdy_vrss),
              changeRate: safeNum(o.prdy_ctrt),
              open:       safeNum(o.stck_oprc),
              high:       safeNum(o.stck_hgpr),
              low:        safeNum(o.stck_lwpr),
              volume:     safeNum(o.acml_vol),
              per:        safeNum(o.per),
              pbr:        safeNum(o.pbr),
              sign:       o.prdy_vrss_sign,
            })
          }
        }

        // 장외시간 → 전일종가
        const prev = await getStockPrevClose(code)
        if (prev) {
          return res.json({
            code, marketOpen: false, status: 'closed',
            ...prev,
            label: `${prev.date.slice(0,4)}.${prev.date.slice(4,6)}.${prev.date.slice(6,8)} 종가`,
          })
        }
        return res.json({ code, marketOpen: false, status: 'closed', price: 0, change: 0, changeRate: 0 })
      }

      // ── 여러 종목 현재가 ────────────────────────────
      case 'prices': {
        const codes = (req.query.codes || '').split(',').filter(Boolean).slice(0, 20)
        if (!codes.length) return res.status(400).json({ error: '종목코드 필요' })

        const fetchOne = async (c) => {
          if (marketOpen) {
            const data = await kisGet(
              '/uapi/domestic-stock/v1/quotations/inquire-price',
              'FHKST01010100',
              { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: c }
            )
            const o = data.output || {}
            if (data.rt_cd === '0') {
              return { code: c, marketOpen: true, status: 'open',
                name: o.hts_kor_isnm, price: safeNum(o.stck_prpr),
                change: safeNum(o.prdy_vrss), changeRate: safeNum(o.prdy_ctrt),
                volume: safeNum(o.acml_vol), sign: o.prdy_vrss_sign }
            }
          }
          // 장외 → 전일종가
          const prev = await getStockPrevClose(c)
          if (prev) return { code: c, marketOpen: false, status: 'closed', ...prev }
          return { code: c, error: true }
        }

        const results = await Promise.allSettled(codes.map(fetchOne))
        const prices  = results.map((r, i) =>
          r.status === 'fulfilled' ? r.value : { code: codes[i], error: true }
        )
        return res.json({ prices, marketOpen })
      }

      // ── 차트 ────────────────────────────────────────
      case 'chart': {
        if (!code) return res.status(400).json({ error: '종목코드 필요' })
        const div = period === 'W' ? 'W' : period === 'M' ? 'M' : 'D'
        const today = new Date().toISOString().slice(0,10).replace(/-/g,'')
        const d = new Date()
        if (div==='M') d.setFullYear(d.getFullYear()-5)
        else if (div==='W') d.setFullYear(d.getFullYear()-2)
        else d.setFullYear(d.getFullYear()-1)
        const startDate = d.toISOString().slice(0,10).replace(/-/g,'')
        const data = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
          'FHKST03010100',
          { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code,
            FID_INPUT_DATE_1: startDate, FID_INPUT_DATE_2: today,
            FID_PERIOD_DIV_CODE: div, FID_ORG_ADJ_PRC: '0' }
        )
        const o1 = data.output1 || {}
        const candles = (data.output2 || []).map(o => ({
          date: o.stck_bsop_date, open: safeNum(o.stck_oprc),
          high: safeNum(o.stck_hgpr), low: safeNum(o.stck_lwpr),
          close: safeNum(o.stck_clpr), volume: safeNum(o.acml_vol),
        })).reverse()
        return res.json({ code, period: div, candles, name: o1.hts_kor_isnm, price: safeNum(o1.stck_prpr) })
      }

      // ── 수급 ────────────────────────────────────────
      case 'supply': {
        if (!code) return res.status(400).json({ error: '종목코드 필요' })
        const data = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-investor',
          'FHKST01010900',
          { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code }
        )
        const list = (data.output || []).slice(0,10).map(o => ({
          date: o.stck_bsop_date, foreign: safeNum(o.frgn_ntby_qty),
          institution: safeNum(o.orgn_ntby_qty), individual: safeNum(o.prsn_ntby_qty),
        }))
        return res.json({ code, supply: list })
      }

      default:
        return res.status(400).json({ error: `알 수 없는 type: ${type}` })
    }
  } catch (e) {
    if (e.message.includes('토큰') || e.message.includes('401')) {
      _tokenCache = null; _tokenExpiry = 0
    }
    console.error('KIS API Error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}