// api/dart.js — DART 공시 API 프록시 (Vercel Serverless)
// opendart.fss.or.kr 인증키 필요 → VITE_DART_API_KEY 환경변수

const DART_BASE = 'https://opendart.fss.or.kr/api'

function getDartKey(req) {
  // Vercel 서버사이드 환경변수 (VITE_ 없이도 사용 가능)
  return process.env.DART_API_KEY || process.env.VITE_DART_API_KEY || ''
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const apiKey = getDartKey(req)
  if (!apiKey) {
    return res.status(500).json({ status: '900', message: 'DART API 키 미설정 (DART_API_KEY 환경변수 필요)' })
  }

  const q = req.query
  const type = q.type || 'list'

  try {
    // ── 전체 공시 목록 ─────────────────────────────────
    // /api/dart?type=list&bgn_de=20250101&end_de=20250326&page=1
    if (type === 'list') {
      const params = new URLSearchParams({
        crtfc_key: apiKey,
        bgn_de:    q.bgn_de || '',
        end_de:    q.end_de || '',
        page_no:   q.page   || '1',
        page_count:'20',
      })
      const r    = await fetch(`${DART_BASE}/list.json?${params}`)
      const data = await r.json()
      return res.status(200).json({
        status:      data.status,
        total_count: data.total_count || 0,
        list:        (data.list || []).map(normalizeDisc),
      })
    }

    // ── 종목명으로 공시 검색 ────────────────────────────
    // /api/dart?type=corp_list&corp_name=삼성전자&bgn_de=...&end_de=...&page=1
    if (type === 'corp_list') {
      // 1. 기업 코드 조회
      const corpRes  = await fetch(`${DART_BASE}/company.json?crtfc_key=${apiKey}&corp_name=${encodeURIComponent(q.corp_name || '')}`)
      const corpData = await corpRes.json()
      const corps    = corpData.list || []

      if (!corps.length) {
        return res.status(200).json({ status:'000', total_count:0, list:[] })
      }

      // 상장사 우선 (stock_code 있는 것)
      const target = corps.find(c => c.stock_code?.trim()) || corps[0]

      // 2. 해당 기업 공시 조회
      const params = new URLSearchParams({
        crtfc_key: apiKey,
        corp_code: target.corp_code,
        bgn_de:    q.bgn_de || '',
        end_de:    q.end_de || '',
        page_no:   q.page   || '1',
        page_count:'20',
      })
      const r    = await fetch(`${DART_BASE}/list.json?${params}`)
      const data = await r.json()
      return res.status(200).json({
        status:      data.status,
        total_count: data.total_count || 0,
        corp_name:   target.corp_name,
        corp_code:   target.corp_code,
        list:        (data.list || []).map(normalizeDisc),
      })
    }

    // ── 주요 공시만 (type별 필터) ──────────────────────
    // /api/dart?type=major&bgn_de=...&end_de=...&pblntf_ty=A
    // pblntf_ty: A=정기공시, B=주요사항, C=발행공시, D=지분공시
    if (type === 'major') {
      const params = new URLSearchParams({
        crtfc_key:  apiKey,
        bgn_de:     q.bgn_de    || '',
        end_de:     q.end_de    || '',
        pblntf_ty:  q.pblntf_ty || 'B',  // B=주요사항 기본
        page_no:    q.page      || '1',
        page_count: '20',
      })
      const r    = await fetch(`${DART_BASE}/list.json?${params}`)
      const data = await r.json()
      return res.status(200).json({
        status:      data.status,
        total_count: data.total_count || 0,
        list:        (data.list || []).map(normalizeDisc),
      })
    }

    // ── 기업 기본정보 ──────────────────────────────────
    // /api/dart?type=company&corp_code=00126380
    if (type === 'company') {
      const r    = await fetch(`${DART_BASE}/company.json?crtfc_key=${apiKey}&corp_code=${q.corp_code}`)
      const data = await r.json()
      return res.status(200).json(data)
    }

    return res.status(400).json({ status:'400', message:'Invalid type', valid:['list','corp_list','major','company'] })

  } catch (err) {
    console.error('[dart proxy]', err.message)
    return res.status(500).json({ status:'900', message: err.message })
  }
}

// 공시 항목 정규화
function normalizeDisc(d) {
  return {
    rcept_no:  d.rcept_no  || '',
    corp_name: d.corp_name || '',
    corp_code: d.corp_code || '',
    stock_code:d.stock_code|| '',
    report_nm: d.report_nm || '',
    flr_nm:    d.flr_nm    || '',
    rcept_dt:  d.rcept_dt  || '',
    rm:        d.rm        || '',
  }
}
