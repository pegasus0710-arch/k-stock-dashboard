// api/kis.js — KIS API 프록시 (토큰 캐싱 포함)

const KIS_BASE = 'https://openapi.koreainvestment.com:9443'

// ── 토큰 캐시 (서버리스 함수 인스턴스 내 메모리 캐시) ──
// Vercel 서버리스는 인스턴스가 일정 시간 유지되므로
// 같은 인스턴스에서 재요청 시 토큰 재사용
let _tokenCache = null
let _tokenExpiry = 0

async function getToken() {
  const now = Date.now()

  // 캐시된 토큰이 유효하면 재사용 (만료 5분 전까지)
  if (_tokenCache && now < _tokenExpiry - 5 * 60 * 1000) {
    return _tokenCache
  }

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
  if (!data.access_token) throw new Error('토큰 없음: ' + JSON.stringify(data))

  // 토큰 캐시 저장 (만료시간: access_token_token_expired 필드 or 기본 24시간)
  _tokenCache = data.access_token
  const expiresSec = data.expires_in || 86400 // 기본 24시간
  _tokenExpiry = now + expiresSec * 1000

  console.log('KIS 토큰 새로 발급됨 (다음 발급까지', Math.round(expiresSec/3600), '시간)')
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
  const data = await res.json()
  if (data.rt_cd !== '0') throw new Error(data.msg1 || `KIS 오류 (rt_cd: ${data.rt_cd})`)
  return data
}

function safeNum(v) {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=10') // Vercel Edge Cache 10초
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET) {
    return res.status(500).json({ error: 'KIS API 키가 없어요.' })
  }

  const { type, code, period } = req.query

  try {
    switch (type) {

      // ── 현재가 ──────────────────────────────────────
      case 'price': {
        if (!code) return res.status(400).json({ error: '종목코드 필요' })
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
          sign:       o.prdy_vrss_sign,
        })
      }

      // ── 여러 종목 현재가 ────────────────────────────
      case 'prices': {
        const codes = (req.query.codes || '').split(',').filter(Boolean).slice(0, 20)
        if (!codes.length) return res.status(400).json({ error: '종목코드 필요' })
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

      // ── 지수 ────────────────────────────────────────
      case 'index': {
        const market = req.query.market || 'KOSPI'
        const mktDiv = market === 'KOSDAQ' ? 'Q' : 'U'
        const iscd   = market === 'KOSDAQ' ? 'Q' : '0001'
        const data = await kisGet(
          '/uapi/domestic-stock/v1/quotations/inquire-index-price',
          'FHPUP02100000',
          { FID_COND_MRKT_DIV_CODE: mktDiv, FID_INPUT_ISCD: iscd }
        )
        const o = data.output
        return res.json({
          market,
          price:      safeNum(o.bstp_nmix_prpr),
          change:     safeNum(o.bstp_nmix_prdy_vrss),
          changeRate: safeNum(o.bstp_nmix_prdy_ctrt),
          open:       safeNum(o.bstp_nmix_oprc),
          high:       safeNum(o.bstp_nmix_hgpr),
          low:        safeNum(o.bstp_nmix_lwpr),
          volume:     safeNum(o.acml_vol),
        })
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
          {
            FID_COND_MRKT_DIV_CODE: 'J',
            FID_INPUT_ISCD:         code,
            FID_INPUT_DATE_1:       startDate,
            FID_INPUT_DATE_2:       today,
            FID_PERIOD_DIV_CODE:    div,
            FID_ORG_ADJ_PRC:        '0',
          }
        )
        const o1 = data.output1 || {}
        const candles = (data.output2 || []).map(o => ({
          date:   o.stck_bsop_date,
          open:   safeNum(o.stck_oprc),
          high:   safeNum(o.stck_hgpr),
          low:    safeNum(o.stck_lwpr),
          close:  safeNum(o.stck_clpr),
          volume: safeNum(o.acml_vol),
        })).reverse()

        return res.json({
          code, period: div, candles,
          name:  o1.hts_kor_isnm,
          price: safeNum(o1.stck_prpr),
        })
      }

      // ── 수급 ────────────────────────────────────────
      case 'supply': {
        if (!code) return res.status(400).json({ error: '종목코드 필요' })
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

      // ── 토큰 상태 확인 (디버그용) ────────────────────
      case 'token-status': {
        const now = Date.now()
        return res.json({
          cached: !!_tokenCache,
          expiresIn: _tokenExpiry ? Math.round((_tokenExpiry - now) / 1000 / 60) + '분 후 만료' : '캐시 없음',
        })
      }

      default:
        return res.status(400).json({ error: `알 수 없는 type: ${type}` })
    }
  } catch (e) {
    // 토큰 오류면 캐시 초기화
    if (e.message.includes('토큰') || e.message.includes('401')) {
      _tokenCache = null
      _tokenExpiry = 0
    }
    console.error('KIS API Error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}