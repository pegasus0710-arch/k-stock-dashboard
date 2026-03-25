const KIWOOM_SERVER_URL = process.env.KIWOOM_SERVER_URL || 'http://3.38.37.78:3001'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { type, code } = req.query

  try {
    if (type === 'price') {
      const data = await fetch(`${KIWOOM_SERVER_URL}/price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stk_cd: code })
      }).then(r => r.json())

      const info = data.atn_stk_infr?.[0] || {}
      return res.json({
        code,
        current: parseInt(info.cur_prc?.replace(/[^0-9-]/g, '') || 0),
        change: parseInt(info.pred_pre?.replace(/[^0-9-]/g, '') || 0),
        changeRate: parseFloat(info.flu_rt || 0),
        volume: parseInt(info.trde_qty?.replace(/[^0-9]/g, '') || 0),
        high: parseInt(info.high_pric?.replace(/[^0-9]/g, '') || 0),
        low: parseInt(info.low_pric?.replace(/[^0-9]/g, '') || 0),
        open: parseInt(info.open_pric?.replace(/[^0-9]/g, '') || 0),
      })
    }
if (type === 'account') {
  const data = await fetch(`${KIWOOM_SERVER_URL}/account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  }).then(r => r.json())
  return res.json(data)
}
    return res.status(400).json({ error: 'Unknown type' })

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}