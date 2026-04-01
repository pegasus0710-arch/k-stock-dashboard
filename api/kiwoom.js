// api/kiwoom.js — Vercel Serverless → EC2 키움 중계 서버 프록시
// Phase 2: 수급·ETF·업종·공매도·체결강도 API 추가

const KIWOOM_SERVER = process.env.KIWOOM_SERVER_URL || 'http://3.38.37.78:3001'

async function relay(endpoint, body, res) {
  try {
    const response = await fetch(`${KIWOOM_SERVER}${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(20000),
    })
    const data = await response.json()
    return res.status(200).json(data)
  } catch (err) {
    console.error(`[kiwoom proxy] ${endpoint}:`, err.message)
    return res.status(500).json({ error: err.message, endpoint })
  }
}

function today() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}
function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400000)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const q = req.query

  // ══════════════════════════════════════════════════
  // 종목 기본
  // ══════════════════════════════════════════════════

  // 현재가 — /api/kiwoom?type=price&code=005930
  if (q.type === 'price') {
    if (!q.code) return res.status(400).json({ error: 'code required' })
    return relay('/price', { stk_cd: q.code }, res)
  }

  // 호가 — /api/kiwoom?type=hoga&code=005930
  if (q.type === 'hoga') {
    if (!q.code) return res.status(400).json({ error: 'code required' })
    return relay('/hoga', { stk_cd: q.code }, res)
  }

  // 종목 차트 — /api/kiwoom?type=stock-chart&code=005930&period=day
  if (q.type === 'stock-chart') {
    if (!q.code) return res.status(400).json({ error: 'code required' })
    return relay('/chart/stock', {
      stk_cd:    q.code,
      period:    q.period   || 'day',
      tic_scope: q.tic      || '5',
      base_dt:   today(),
      min_days:  Number(q.min_days || 1),
    }, res)
  }

  // 업종 차트 — /api/kiwoom?type=index-chart&inds_cd=001&period=day
  if (q.type === 'index-chart') {
    const cd = q.inds_cd || q.code || '001'
    return relay('/chart/index', {
      inds_cd:   cd,
      period:    q.period || 'day',
      tic_scope: q.tic    || '5',
      base_dt:   today(),
      min_days:  Number(q.min_days || 1),
    }, res)
  }

  // 업종 현재가 — /api/kiwoom?type=index-price&inds_cd=001
  if (q.type === 'index-price') {
    const cd   = q.inds_cd || '001'
    const mrkt = cd.startsWith('1') ? '1' : '0'
    return relay('/index/price', { inds_cd: cd, mrkt_tp: mrkt }, res)
  }

  // 국내 지수 배치 (KOSPI + KOSDAQ 동시) — /api/kiwoom?type=index-domestic
  // 응답: { KOSPI: { price, change, changeRate, open, high, low, high52, low52, ... },
  //         KOSDAQ: { ... } }
  // - 장 운영 중: 실시간 현재가 반영
  // - 장 마감 후: 직전 마감 종가 반영
  if (q.type === 'index-domestic') {
    return relay('/index/domestic', {}, res)
  }

  // 52주 고저가 — /api/kiwoom?type=index-52week
  if (q.type === 'index-52week') {
    return relay('/index/52week', {}, res)
  }

  // ══════════════════════════════════════════════════
  // Phase 2 — 수급
  // ══════════════════════════════════════════════════

  // 외국인 종목별 매매동향 — /api/kiwoom?type=supply-foreign&code=005930
  if (q.type === 'supply-foreign') {
    if (!q.code) return res.status(400).json({ error: 'code required' })
    return relay('/supply/foreign', { stk_cd: q.code }, res)
  }

  // 장중 투자자별 매매 (외인/기관 순매수 상위)
  // /api/kiwoom?type=supply-investor&market=001&invsr=6
  // invsr: 6=외국인, 7=기관계, 1=투신, 3=연기금
  if (q.type === 'supply-investor') {
    return relay('/supply/investor', {
      mrkt_tp: q.market || '001',
      invsr:   q.invsr  || '6',
    }, res)
  }

  // 시장 전체 수급 집계 — 대시보드 플로우 바용
  // /api/kiwoom?type=market-flow
  if (q.type === 'market-flow') {
    return relay('/supply/market-flow', {}, res)
  }

  // 일별 기관 매매 종목 — /api/kiwoom?type=supply-institution&market=001&trde_tp=2
  // trde_tp: 1=순매도, 2=순매수
  if (q.type === 'supply-institution') {
    return relay('/supply/institution', {
      strt_dt: q.strt_dt || today(),
      end_dt:  q.end_dt  || today(),
      trde_tp: q.trde_tp || '2',
      mrkt_tp: q.market  || '001',
    }, res)
  }

  // 공매도 추이 — /api/kiwoom?type=supply-short&code=005930&days=30
  if (q.type === 'supply-short') {
    if (!q.code) return res.status(400).json({ error: 'code required' })
    const days = Number(q.days || 30)
    return relay('/supply/short', {
      stk_cd:  q.code,
      strt_dt: daysAgo(days),
      end_dt:  today(),
    }, res)
  }

  // 체결강도 일별 — /api/kiwoom?type=supply-strength&code=005930
  if (q.type === 'supply-strength') {
    if (!q.code) return res.status(400).json({ error: 'code required' })
    return relay('/supply/strength', { stk_cd: q.code }, res)
  }

  // ══════════════════════════════════════════════════
  // Phase 2 — 업종 배치
  // ══════════════════════════════════════════════════

  // 전업종지수 — /api/kiwoom?type=sector-all&inds_cd=001
  if (q.type === 'sector-all') {
    return relay('/index/all', { inds_cd: q.inds_cd || '001' }, res)
  }

  // 업종 히트맵 등락률 — /api/kiwoom?type=sector-heatmap
  if (q.type === 'sector-heatmap') {
    return relay('/sector/heatmap', {}, res)
  }

  // 업종별 종목 주가 — /api/kiwoom?type=sector-stocks&inds_cd=001&mrkt_tp=0
  if (q.type === 'sector-stocks') {
    return relay('/index/stocks', {
      inds_cd: q.inds_cd || '001',
      mrkt_tp: q.mrkt_tp || '0',
    }, res)
  }

  // ══════════════════════════════════════════════════
  // Phase 2 — ETF
  // ══════════════════════════════════════════════════

  // ETF 종목 정보 — /api/kiwoom?type=etf-info&code=069500
  if (q.type === 'etf-info') {
    if (!q.code) return res.status(400).json({ error: 'code required' })
    return relay('/etf/info', { stk_cd: q.code }, res)
  }


  // ── ETF 구성종목 (Naver Finance) ─────────────────────
  // /api/kiwoom?type=etf-holdings&code=069500
  if (q.type === 'etf-holdings') {
    try {
      const code = q.code
      // 네이버 모바일 ETF 포트폴리오 API
      const r = await fetch(
        `https://m.stock.naver.com/api/stock/${code}/etfHolding`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.stock.naver.com/' } }
      )
      if (!r.ok) throw new Error(`naver ${r.status}`)
      const data = await r.json()
      // 응답: { stocks: [{ stockName, itemCode, weight, holdingQuantity }] }
      const items = (data.stocks || data.holdings || [])
        .slice(0, 10)
        .map(s => ({
          name:   s.stockName || s.name,
          code:   s.itemCode  || s.code,
          weight: parseFloat(s.weight || s.ratio || 0),
          qty:    s.holdingQuantity || s.qty || 0,
        }))
      return res.json({ holdings: items })
    } catch (e1) {
      // 폴백: 네이버 PC API
      try {
        const r2 = await fetch(
          `https://finance.naver.com/api/sise/etfItemChart.nhn?code=${q.code}&timeframe=day`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        )
        const d2 = await r2.json()
        const items2 = (d2.etfItemChart?.shareWeight || []).slice(0, 10).map(s => ({
          name: s.stockName, code: s.itemCode,
          weight: parseFloat(s.weight||0), qty: 0,
        }))
        return res.json({ holdings: items2 })
      } catch (e2) {
        return res.json({ holdings: [], error: e1.message })
      }
    }
  }

  // ETF 전체시세 — /api/kiwoom?type=etf-list&mngmcomp=0000
  // mngmcomp: 0000=전체, 3020=KODEX, 3191=TIGER, 3228=KINDEX, 3023=KStar
  if (q.type === 'etf-list') {
    return relay('/etf/list', {
      mngmcomp: q.mngmcomp || '0000',
    }, res)
  }

  // ETF 수익률 — /api/kiwoom?type=etf-profit&code=069500&idx=207&dt=3
  // dt: 0=1주, 1=1달, 2=6개월, 3=1년
  if (q.type === 'etf-profit') {
    if (!q.code) return res.status(400).json({ error: 'code required' })
    return relay('/etf/profit', {
      stk_cd:          q.code,
      etfobjt_idex_cd: q.idx || '207',
      dt:              q.dt  || '3',
    }, res)
  }


  // ══════════════════════════════════════════════════
  // Phase 5 — 계좌 API
  // ══════════════════════════════════════════════════

  // 체결잔고 (예수금 + 보유종목 요약)
  // /api/kiwoom?type=account-balance
  if (q.type === 'account-balance') {
    return relay('/account/balance', {}, res)
  }

  // 계좌평가잔고 (보유종목 상세)
  // /api/kiwoom?type=account-holdings
  if (q.type === 'account-holdings') {
    return relay('/account/holdings', {}, res)
  }

  // 주문체결내역 (오늘 or 특정일)
  // /api/kiwoom?type=account-orders&date=20250326&sell_tp=0
  if (q.type === 'account-orders') {
    return relay('/account/orders', {
      ord_dt:  q.date   || '',
      sell_tp: q.sell_tp || '0',
      qry_tp:  q.qry_tp  || '4',
      stk_cd:  q.code   || '',
    }, res)
  }

  // 일별 수익률
  // /api/kiwoom?type=account-returns&fr_dt=20250101&to_dt=20250326
  if (q.type === 'account-returns') {
    return relay('/account/returns', {
      fr_dt: q.fr_dt || '',
      to_dt: q.to_dt || '',
    }, res)
  }

  return res.status(400).json({
    error: 'Invalid type',
    valid: [
      'price', 'hoga', 'stock-chart', 'index-chart', 'index-price', 'index-52week',
      'supply-foreign', 'supply-investor', 'supply-institution',
      'supply-short', 'supply-strength', 'market-flow',
      'sector-all', 'sector-stocks', 'sector-heatmap',
      'etf-info', 'etf-list', 'etf-profit', 'etf-holdings',
      'account-balance', 'account-holdings', 'account-orders', 'account-returns',
    ],
  })
}
