// src/hooks/useKiwoomPrice.js
// 키움 가격 조회 공통 훅
// WatchlistPage · PortfolioPage · ChartAnalysisPage 에서 재사용

import { useState, useEffect, useCallback, useRef } from 'react'
import { getKstStatus } from '../utils/format'

/**
 * 단일 종목 가격 조회
 * @param {string} code - 종목코드
 * @param {number} interval - 갱신 주기 ms (기본: 장중 30초, 장외 5분)
 */
export function useStockPrice(code, interval) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetchPrice = useCallback(async () => {
    if (!code) return
    try {
      const res  = await fetch(`/api/kiwoom?type=price&code=${code}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(normalizePrice(json))
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [code])

  useEffect(() => {
    if (!code) return
    fetchPrice()
    const ms = interval ?? (getKstStatus() === 'open' ? 30_000 : 300_000)
    const id = setInterval(fetchPrice, ms)
    return () => clearInterval(id)
  }, [fetchPrice, code, interval])

  return { data, loading, error, refetch: fetchPrice }
}

/**
 * 복수 종목 가격 일괄 조회
 * @param {string[]} codes - 종목코드 배열
 * @param {number} interval - 갱신 주기 ms
 */
export function useStockPrices(codes, interval) {
  const [prices, setPrices]   = useState({})   // { code: normalizedPrice }
  const [loading, setLoading] = useState(true)
  const codesKey = codes.join(',')

  const fetchAll = useCallback(async () => {
    if (!codes.length) return
    setLoading(true)
    const results = await Promise.allSettled(
      codes.map(code =>
        fetch(`/api/kiwoom?type=price&code=${code}`)
          .then(r => r.json())
          .then(json => ({ code, data: normalizePrice(json) }))
      )
    )
    const map = {}
    results.forEach(r => {
      if (r.status === 'fulfilled' && !r.value?.data?.error) {
        map[r.value.code] = r.value.data
      }
    })
    setPrices(map)
    setLoading(false)
  }, [codesKey])

  useEffect(() => {
    if (!codes.length) return
    fetchAll()
    const ms = interval ?? (getKstStatus() === 'open' ? 30_000 : 300_000)
    const id = setInterval(fetchAll, ms)
    return () => clearInterval(id)
  }, [fetchAll, codesKey, interval])

  return { prices, loading, refetch: fetchAll }
}

/**
 * 키움 API 응답 → 정규화된 가격 객체
 * ✅ 올바른 필드명 사용 (cur_prc, pred_pre, flu_rt, trde_qty)
 */
export function normalizePrice(json) {
  if (!json || json.error) return null
  return {
    // 현재가
    price:      Math.abs(Number(json.cur_prc  || 0)),  // 키움: 부호 포함 반환 → abs
    // 전일대비 금액 (부호 포함)
    change:     Number(json.pred_pre || 0),
    // 등락률
    changeRate: Number(json.flu_rt   || 0),
    // 거래량
    volume:     Number(json.trde_qty || 0),
    // 시가·고가·저가
    open:       Math.abs(Number(json.open_pric || 0)),
    high:       Math.abs(Number(json.high_pric || 0)),
    low:        Number(json.low_pric  || 0),
    // 재무 지표
    per:        Number(json.per  || 0),
    pbr:        Number(json.pbr  || 0),
    eps:        Number(json.eps  || 0),
    roe:        Number(json.roe  || 0),
    mac:        Number(json.mac  || 0),   // 시가총액 (억)
    forExhRt:   json.for_exh_rt || '',    // 외국인 보유비율
    dstrRt:     json.dstr_rt    || '',    // 유통비율
    // 메타
    name:       json.stk_nm || '',
    code:       json.stk_cd || '',
    status:     json.status || 'closed',
    // 원본 (필요 시 접근)
    raw:        json,
  }
}
