const DART_API_KEY = process.env.VITE_DART_API_KEY
const BASE = 'https://opendart.fss.or.kr/api'

function today() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { type, corp_name, bgn_de, end_de, page } = req.query

  if (!DART_API_KEY) return res.status(500).json({ error: 'DART API 키가 없습니다.' })

  try {
    // 공시 목록 조회
    if (type === 'list') {
      const params = new URLSearchParams({
        crtfc_key: DART_API_KEY,
        bgn_de: bgn_de || daysAgo(1),
        end_de: end_de || today(),
        page_no: page || '1',
        page_count: '20',
      })
      const r = await fetch(`${BASE}/list.json?${params}`)
      const data = await r.json()
      return res.json(data)
    }

    // 종목 검색 (회사명으로)
    if (type === 'search') {
      const params = new URLSearchParams({
        crtfc_key: DART_API_KEY,
        corp_name: corp_name || '',
        page_no: '1',
        page_count: '10',
      })
      const r = await fetch(`${BASE}/company.json?${params}`)
      const data = await r.json()
      return res.json(data)
    }

    // 종목 공시 목록
    if (type === 'corp_list') {
      const params = new URLSearchParams({
        crtfc_key: DART_API_KEY,
        bgn_de: bgn_de || daysAgo(30),
        end_de: end_de || today(),
        corp_name: corp_name || '',
        page_no: page || '1',
        page_count: '20',
      })
      const r = await fetch(`${BASE}/list.json?${params}`)
      const data = await r.json()
      return res.json(data)
    }

    return res.status(400).json({ error: 'Unknown type' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
