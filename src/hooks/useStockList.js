// src/hooks/useStockList.js
// 전체 상장 종목 리스트 훅 (코스피 + 코스닥)
// - 서버에서 1회 로드 후 localStorage에 24시간 캐시
// - 테마 종목(STOCK_LIST)과 병합하여 반환

import { useState, useEffect } from 'react'
import { ALL_THEMES } from '../constants/themes'

const CACHE_KEY = 'kiwoom_stock_list_v1'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24시간

// 테마 기반 종목 맵 (코드 → theme 레이블)
const THEME_MAP = {}
ALL_THEMES.forEach(t => {
  t.etf.forEach(e    => { THEME_MAP[e.code] = t.label })
  t.stocks.forEach(s => { THEME_MAP[s.code] = t.label })
})

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return data
  } catch { return null }
}

function saveCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
  } catch {}
}

export function useStockList() {
  const [stockList, setStockList] = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    const cached = loadCache()
    if (cached) {
      setStockList(cached)
      setLoading(false)
      return
    }

    // 서버에서 코스피 + 코스닥 병렬 로드
    const EC2_URL = import.meta.env.VITE_RELAY_URL || 'http://3.38.37.78:3001'

    Promise.allSettled([
      fetch(`${EC2_URL}/stocks/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market: 'kospi' }),
      }).then(r => r.json()),
      fetch(`${EC2_URL}/stocks/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market: 'kosdaq' }),
      }).then(r => r.json()),
    ]).then(([kospi, kosdaq]) => {
      const merged = new Map()

      // 테마 종목 먼저 (우선순위)
      ALL_THEMES.forEach(t => {
        t.etf.forEach(e    => merged.set(e.code, { code: e.code, name: e.name, theme: t.label, market: 'ETF' }))
        t.stocks.forEach(s => merged.set(s.code, { code: s.code, name: s.name, theme: t.label, market: 'KOSPI' }))
      })

      // API 결과 병합 (테마에 없는 종목 추가)
      const addStocks = (result, market) => {
        if (result.status !== 'fulfilled') return
        const list = result.value?.stocks || []
        list.forEach(s => {
          if (!merged.has(s.code)) {
            merged.set(s.code, {
              code:   s.code,
              name:   s.name,
              theme:  THEME_MAP[s.code] || null,
              market,
            })
          }
        })
      }
      addStocks(kospi,  'KOSPI')
      addStocks(kosdaq, 'KOSDAQ')

      const final = [...merged.values()]
      saveCache(final)
      setStockList(final)
    }).catch(() => {
      // 실패 시 테마 종목만 폴백
      const fallback = [...new Map(
        ALL_THEMES.flatMap(t => [
          ...t.etf.map(e    => [e.code, { code: e.code, name: e.name, theme: t.label, market: 'ETF' }]),
          ...t.stocks.map(s => [s.code, { code: s.code, name: s.name, theme: t.label, market: 'KOSPI' }]),
        ])
      ).values()]
      setStockList(fallback)
    }).finally(() => setLoading(false))
  }, [])

  return { stockList, loading }
}
