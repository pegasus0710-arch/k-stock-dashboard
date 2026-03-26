// api/dart.js — DART API 프록시 (CORS 우회)
// Vercel 서버리스에서 DART API 호출 → 브라우저 CORS 문제 해결

const DART_BASE = 'https://opendart.fss.or.kr/api'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const key = process.env.VITE_DART_API_KEY || process.env.DART_API_KEY
  if (!key) return res.status(500).json({ error: 'DART API 키 미설정', status: 'error' })

  const { endpoint, ...params } = req.query
  if (!endpoint) return res.status(400).json({ error: 'endpoint 필요' })

  const allowedEndpoints = ['company', 'fnlttSinglAcntAll', 'list', 'document']
  if (!allowedEndpoints.includes(endpoint)) {
    return res.status(400).json({ error: '허용되지 않는 endpoint' })
  }

  try {
    const qs = new URLSearchParams({ crtfc_key: key, ...params }).toString()
    const url = `${DART_BASE}/${endpoint}.json?${qs}`
    const r   = await fetch(url)
    const data = await r.json()
    return res.json(data)
  } catch (e) {
    return res.status(500).json({ error: e.message, status: 'error' })
  }
}
