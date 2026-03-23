// api/kis.js — KIS API 프록시 서버리스 함수
// 토큰 발급 + 주가 조회 + 차트 조회

const KIS_BASE = 'https://openapi.koreainvestment.com:9443'

// ── 토큰 발급 ─────────────────────────────────────────
async function getToken() {
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
  return data.access_token
}

// ── 공통 KIS API 호출 ────────────────────────────────
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
  const data = await res.json()
  if (data.rt_cd !== '0') throw new Error(data.msg1 || 'KIS API 오류')
  return data
}

// ── 핸들러 ────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const APP_KEY    = process.env.KIS_APP_KEY
  const APP_SECRET = process.env.KIS_APP_SECRET
  if (!APP_KEY || !APP_SECRET) {
    return res.status(500).json({ error: 'KIS API 키가 설정되지 않았어요.' })
  }

  const { type, code, period } = req.query

  try {
    switch (type) {

      // ── 현재가 조회 ──────────────────────────────────
      case 'price': {
        if (!code) return res.status(400).json({ error: '종목코드가 필요해요.' })
        const data = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-price',
          'FHKST01010100',
          { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code }
        )
        const o = data.output
        return res.json({
          code,
          name:       o.hts_kor_isnm,
          price:      Number(o.stck_prpr),
          change:     Number(o.prdy_vrss),
          changeRate: Number(o.prdy_ctrt),
          open:       Number(o.stck_oprc),
          high:       Number(o.stck_hgpr),
          low:        Number(o.stck_lwpr),
          volume:     Number(o.acml_vol),
          marketCap:  Number(o.hts_avls),
          per:        Number(o.per),
          pbr:        Number(o.pbr),
        })
      }

      // ── 여러 종목 현재가 일괄 조회 ───────────────────
      case 'prices': {
        const codes = (req.query.codes || '').split(',').filter(Boolean).slice(0, 20)
        if (!codes.length) return res.status(400).json({ error: '종목코드가 필요해요.' })
        const results = await Promise.allSettled(
          codes.map(c => kisGet(
            '/uapi/domestic-stock/v1/quotations/inquire-price',
            'FHKST01010100',
            { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: c }
          ))
        )
        const prices = results.map((r, i) => {
          if (r.status === 'rejected') return { code: codes[i], error: true }
          const o = r.value.output
          return {
            code:       codes[i],
            name:       o.hts_kor_isnm,
            price:      Number(o.stck_prpr),
            change:     Number(o.prdy_vrss),
            changeRate: Number(o.prdy_ctrt),
            volume:     Number(o.acml_vol),
          }
        })
        return res.json({ prices })
      }

      // ── 일봉/주봉/월봉 차트 ──────────────────────────
      case 'chart': {
        if (!code) return res.status(400).json({ error: '종목코드가 필요해요.' })
        const div = period === 'W' ? 'W' : period === 'M' ? 'M' : 'D'
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const startDate = (() => {
          const d = new Date()
          if (div === 'M') d.setFullYear(d.getFullYear() - 5)
          else if (div === 'W') d.setFullYear(d.getFullYear() - 2)
          else d.setFullYear(d.getFullYear() - 1)
          return d.toISOString().slice(0, 10).replace(/-/g, '')
        })()

        const data = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
          'FHKST03010100',
          {
            FID_COND_MRKT_DIV_CODE: 'J',
            FID_INPUT_ISCD:         code,
            FID_INPUT_DATE_1:       startDate,
            FID_INPUT_DATE_2:       today,
            FID_PERIOD_DIV_CODE:    div,
            FID_ORG_ADJ_PRC:        '0',
          }
        )

        const candles = (data.output2 || []).map(o => ({
          date:   o.stck_bsop_date,
          open:   Number(o.stck_oprc),
          high:   Number(o.stck_hgpr),
          low:    Number(o.stck_lwpr),
          close:  Number(o.stck_clpr),
          volume: Number(o.acml_vol),
        })).reverse()

        return res.json({ code, period: div, candles })
      }

      // ── 코스피/코스닥 지수 ───────────────────────────
      case 'index': {
        const mktDiv = req.query.market === 'KOSDAQ' ? 'Q' : 'U'
        const iscd   = req.query.market === 'KOSDAQ' ? 'Q' : '0001'
        const data = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-index-price',
          'FHPUP02100000',
          { FID_COND_MRKT_DIV_CODE: mktDiv, FID_INPUT_ISCD: iscd }
        )
        const o = data.output
        return res.json({
          market:     req.query.market || 'KOSPI',
          price:      Number(o.bstp_nmix_prpr),
          change:     Number(o.bstp_nmix_prdy_vrss),
          changeRate: Number(o.bstp_nmix_prdy_ctrt),
          open:       Number(o.bstp_nmix_oprc),
          high:       Number(o.bstp_nmix_hgpr),
          low:        Number(o.bstp_nmix_lwpr),
          volume:     Number(o.acml_vol),
        })
      }

      // ── 외국인/기관 수급 ─────────────────────────────
      case 'supply': {
        if (!code) return res.status(400).json({ error: '종목코드가 필요해요.' })
        const data = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-investor',
          'FHKST01010900',
          { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code }
        )
        const list = (data.output || []).slice(0, 10).map(o => ({
          date:         o.stck_bsop_date,
          foreign:      Number(o.frgn_ntby_qty),
          institution:  Number(o.orgn_ntby_qty),
          individual:   Number(o.prsn_ntby_qty),
        }))
        return res.json({ code, supply: list })
      }

      default:
        return res.status(400).json({ error: `알 수 없는 type: ${type}` })
    }
  } catch (e) {
    console.error('KIS API Error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
