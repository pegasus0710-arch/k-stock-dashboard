// api/kis.js — KIS API 프록시

const KIS_BASE = 'https://openapi.koreainvestment.com:9443'

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
  if (!data.access_token) throw new Error('토큰이 없어요: ' + JSON.stringify(data))
  return data.access_token
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
  const data = await res.json()
  if (data.rt_cd !== '0') throw new Error(data.msg1 || 'KIS API 오류')
  return data
}

function safeNum(v) {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET) {
    return res.status(500).json({ error: 'KIS API 키가 설정되지 않았어요.' })
  }

  const { type, code, period } = req.query

  try {
    switch (type) {

      // ── 현재가 ────────────────────────────────────────
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
          price:      safeNum(o.stck_prpr),
          change:     safeNum(o.prdy_vrss),
          changeRate: safeNum(o.prdy_ctrt),
          open:       safeNum(o.stck_oprc),
          high:       safeNum(o.stck_hgpr),
          low:        safeNum(o.stck_lwpr),
          volume:     safeNum(o.acml_vol),
          per:        safeNum(o.per),
          pbr:        safeNum(o.pbr),
          sign:       o.prdy_vrss_sign, // 1:상한 2:상승 3:보합 4:하한 5:하락
        })
      }

      // ── 여러 종목 현재가 ──────────────────────────────
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
            price:      safeNum(o.stck_prpr),
            change:     safeNum(o.prdy_vrss),
            changeRate: safeNum(o.prdy_ctrt),
            volume:     safeNum(o.acml_vol),
            sign:       o.prdy_vrss_sign,
          }
        })
        return res.json({ prices })
      }

      // ── 차트 ─────────────────────────────────────────
      case 'chart': {
        if (!code) return res.status(400).json({ error: '종목코드가 필요해요.' })
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
          open:   safeNum(o.stck_oprc),
          high:   safeNum(o.stck_hgpr),
          low:    safeNum(o.stck_lwpr),
          close:  safeNum(o.stck_clpr),
          volume: safeNum(o.acml_vol),
        })).reverse()

        // 현재가 정보 (output1)
        const o1 = data.output1 || {}
        return res.json({
          code, period: div, candles,
          name:  o1.hts_kor_isnm,
          price: safeNum(o1.stck_prpr),
        })
      }

      // ── 지수 ─────────────────────────────────────────
      case 'index': {
        const market  = req.query.market || 'KOSPI'
        const mktDiv  = market === 'KOSDAQ' ? 'Q' : 'U'
        const iscd    = market === 'KOSDAQ' ? 'Q' : '0001'
        const data = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-index-price',
          'FHPUP02100000',
          { FID_COND_MRKT_DIV_CODE: mktDiv, FID_INPUT_ISCD: iscd }
        )
        const o = data.output
        // 장 마감 후에는 prdy_vrss 계열 필드로 fallback
        const price      = safeNum(o.bstp_nmix_prpr)
        const change     = safeNum(o.bstp_nmix_prdy_vrss)   || safeNum(o.prdy_vrss)
        const changeRate = safeNum(o.bstp_nmix_prdy_ctrt)   || safeNum(o.prdy_ctrt)
        const open       = safeNum(o.bstp_nmix_oprc)        || safeNum(o.stck_oprc)
        const high       = safeNum(o.bstp_nmix_hgpr)        || safeNum(o.stck_hgpr)
        const low        = safeNum(o.bstp_nmix_lwpr)        || safeNum(o.stck_lwpr)
        const volume     = safeNum(o.acml_vol)
        return res.json({ market, price, change, changeRate, open, high, low, volume })
      }

      // ── 수급 ─────────────────────────────────────────
      case 'supply': {
        if (!code) return res.status(400).json({ error: '종목코드가 필요해요.' })
        const data = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-investor',
          'FHKST01010900',
          { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code }
        )
        const list = (data.output || []).slice(0, 10).map(o => ({
          date:        o.stck_bsop_date,
          foreign:     safeNum(o.frgn_ntby_qty),
          institution: safeNum(o.orgn_ntby_qty),
          individual:  safeNum(o.prsn_ntby_qty),
        }))
        return res.json({ code, supply: list })
      }

      // ── 디버그 (raw 응답 확인용) ──────────────────────
      case 'debug': {
        const market  = req.query.market || 'KOSPI'
        const mktDiv  = market === 'KOSDAQ' ? 'Q' : 'U'
        const iscd    = market === 'KOSDAQ' ? 'Q' : '0001'
        const data = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-index-price',
          'FHPUP02100000',
          { FID_COND_MRKT_DIV_CODE: mktDiv, FID_INPUT_ISCD: iscd }
        )
        return res.json(data.output) // raw 전체 출력
      }

      default:
        return res.status(400).json({ error: `알 수 없는 type: ${type}` })
    }
  } catch (e) {
    console.error('KIS API Error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}