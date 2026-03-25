const KIWOOM_SERVER_URL = process.env.KIWOOM_SERVER_URL || 'http://3.38.37.78:3001'
const KIWOOM_API_SECRET = process.env.KIWOOM_API_SECRET || ''

async function kiwoomPost(path, body = {}) {
  const res = await fetch(`${KIWOOM_SERVER_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-secret': KIWOOM_API_SECRET
    },
    body: JSON.stringify(body)
  })
  return res.json()
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { type, code, date, chartType, scope } = req.query

  try {
    // 현재가 (ka10095)
    if (type === 'price') {
      const data = await kiwoomPost('/price', { stk_cd: code })
      const info = data.atn_stk_infr?.[0] || {}
      return res.json({
        code,
        current:    parseInt(info.cur_prc?.replace(/[^0-9-]/g, '') || 0),
        change:     parseInt(info.pred_pre?.replace(/[^0-9-]/g, '') || 0),
        changeRate: parseFloat(info.flu_rt || 0),
        volume:     parseInt(info.trde_qty?.replace(/[^0-9]/g, '') || 0),
        high:       parseInt(info.high_pric?.replace(/[^0-9]/g, '') || 0),
        low:        parseInt(info.low_pric?.replace(/[^0-9]/g, '') || 0),
        open:       parseInt(info.open_pric?.replace(/[^0-9]/g, '') || 0),
      })
    }

    // 주식기본정보 (ka10001) - PER, PBR, EPS, ROE, 시가총액, 유통주식, 외국인비중
    if (type === 'stockbasic') {
      const data = await kiwoomPost('/stockbasic', { stk_cd: code })
      return res.json(data)
    }

    // 종목정보 (ka10100) - 업종, 시장
    if (type === 'stockinfo') {
      const data = await kiwoomPost('/stockinfo', { stk_cd: code })
      return res.json(data)
    }

    // 계좌평가잔고 (kt00018)
    if (type === 'account') {
      const data = await kiwoomPost('/account')
      return res.json(data)
    }

    // 체결내역 (kt00007)
    if (type === 'trades') {
      const data = await kiwoomPost('/trades', { ord_dt: date || '' })
      return res.json(data)
    }

    // 차트 (분봉/일봉/주봉/월봉/년봉)
    if (type === 'chart') {
      const pathMap = {
        min:   '/chart/min',
        day:   '/chart/day',
        week:  '/chart/week',
        month: '/chart/month',
        year:  '/chart/year',
      }
      const path = pathMap[chartType]
      if (!path) return res.status(400).json({ error: 'Unknown chartType' })
      const body = { stk_cd: code }
      if (chartType === 'min') body.tic_scope = scope || '5'
      const data = await kiwoomPost(path, body)
      return res.json(data)
    }

    return res.status(400).json({ error: 'Unknown type' })

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
