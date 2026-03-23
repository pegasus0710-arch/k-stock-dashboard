// src/hooks/useKisData.js
// KIS API 데이터 훅 — 실시간 주가·지수·수급 조회

import { useState, useEffect, useCallback } from 'react'

const API_BASE = '/api/kis'

// ── 단일 종목 현재가 ──────────────────────────────────
export function useStockPrice(code, autoRefresh = false) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const fetch_ = useCallback(async () => {
    if (!code) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API_BASE}?type=price&code=${code}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [code])

  useEffect(() => {
    fetch_()
    if (!autoRefresh) return
    const timer = setInterval(fetch_, 10000) // 10초 자동 갱신
    return () => clearInterval(timer)
  }, [fetch_, autoRefresh])

  return { data, loading, error, refresh: fetch_ }
}

// ── 여러 종목 현재가 일괄 ─────────────────────────────
export function useStockPrices(codes, autoRefresh = false) {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const fetch_ = useCallback(async () => {
    if (!codes?.length) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API_BASE}?type=prices&codes=${codes.join(',')}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json.prices || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [codes?.join(',')])

  useEffect(() => {
    fetch_()
    if (!autoRefresh) return
    const timer = setInterval(fetch_, 15000) // 15초 자동 갱신
    return () => clearInterval(timer)
  }, [fetch_, autoRefresh])

  return { data, loading, error, refresh: fetch_ }
}

// ── 지수 (KOSPI/KOSDAQ) ───────────────────────────────
export function useIndex(market = 'KOSPI', autoRefresh = false) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const fetch_ = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API_BASE}?type=index&market=${market}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [market])

  useEffect(() => {
    fetch_()
    if (!autoRefresh) return
    const timer = setInterval(fetch_, 10000)
    return () => clearInterval(timer)
  }, [fetch_, autoRefresh])

  return { data, loading, error, refresh: fetch_ }
}

// ── 차트 데이터 ───────────────────────────────────────
export function useChart(code, period = 'D') {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const fetch_ = useCallback(async () => {
    if (!code) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API_BASE}?type=chart&code=${code}&period=${period}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json.candles || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [code, period])

  useEffect(() => { fetch_() }, [fetch_])

  return { data, loading, error, refresh: fetch_ }
}

// ── 수급 데이터 ───────────────────────────────────────
export function useSupply(code) {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const fetch_ = useCallback(async () => {
    if (!code) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API_BASE}?type=supply&code=${code}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json.supply || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [code])

  useEffect(() => { fetch_() }, [fetch_])

  return { data, loading, error, refresh: fetch_ }
}

// ── 유틸 ─────────────────────────────────────────────
// 등락률 색상
export function getRateColor(rate) {
  if (rate > 0) return '#dc2626'  // 빨간색 (상승)
  if (rate < 0) return '#2563eb'  // 파란색 (하락)
  return '#64748b'                 // 보합
}

// 숫자 포맷
export function formatPrice(n) {
  if (!n && n !== 0) return '—'
  return Number(n).toLocaleString()
}

export function formatRate(n) {
  if (!n && n !== 0) return '—'
  const v = Number(n)
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

export function formatChange(n) {
  if (!n && n !== 0) return '—'
  const v = Number(n)
  return `${v > 0 ? '+' : ''}${v.toLocaleString()}`
}
