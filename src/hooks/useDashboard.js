// src/hooks/useDashboard.js
import { useState, useEffect, useCallback, useRef } from 'react'
import { getNowTime, isMarketOpen, isUSMarketOpen, getDashTTL } from '../utils/format'
import { BATCH_SYMBOLS } from '../constants/dashboardData'

const LS_DASH   = 'db_cache_v3'
const LS_GLOBAL = 'db_global_v4'
const LS_FOREX  = 'db_forex_krw_v1'
const LS_RATES  = 'db_central_rates_v1'
const LS_FLOW   = 'db_flow_v1'
const LS_WEEK   = 'db_52week_v1'
const LS_HEATMAP = 'db_heatmap_v1'

function lsRead(key, ttl) {
  try { const r=localStorage.getItem(key); if(!r)return null; const {data,ts}=JSON.parse(r); return Date.now()-ts<ttl?data:null } catch { return null }
}
function lsWrite(key, data) {
  try { localStorage.setItem(key, JSON.stringify({data,ts:Date.now()})) } catch {}
}

export { LS_DASH, LS_GLOBAL, LS_FOREX, LS_RATES, lsRead, lsWrite }

export default function useDashboard() {
  const [dashData,      setDashData]      = useState(()=>lsRead(LS_DASH,   getDashTTL()))
  const [globalData,    setGlobalData]    = useState(()=>lsRead(LS_GLOBAL, 300000))
  const [forexData,     setForexData]     = useState(()=>lsRead(LS_FOREX,  300000))
  const [cbRates,       setCbRates]       = useState(()=>lsRead(LS_RATES,  3600000*6))
  const [flowData,      setFlowData]      = useState(()=>lsRead(LS_FLOW,   120000))  // 2분 캐시
  const [weekData,      setWeekData]      = useState(()=>lsRead(LS_WEEK,    3600000*6))
  const [heatmapData,   setHeatmapData]   = useState(()=>lsRead(LS_HEATMAP, 300000))  // 5분 캐시
  const [loading,       setLoading]       = useState(()=>!lsRead(LS_DASH,  getDashTTL()))
  const [globalLoading, setGlobalLoading] = useState(()=>!lsRead(LS_GLOBAL,300000))
  const [fetchError,    setFetchError]    = useState(false)
  const [lastFetch,     setLastFetch]     = useState('')

  const isFetching = useRef(false)
  const timerRef   = useRef(null)
  const globalRef  = useRef(null)

  const fetchDashboard = useCallback(async (force=false) => {
    if(isFetching.current) return
    if(!force&&lsRead(LS_DASH,getDashTTL())){setLoading(false);return}
    isFetching.current=true
    try {
      const res=await fetch('/api/kis?type=dashboard&codes=').then(r=>r.json())
      if(res.error) throw new Error(res.error)
      setDashData(res);lsWrite(LS_DASH,res);setLastFetch(getNowTime());setFetchError(false)
    } catch(e){console.error(e);setFetchError(true)}
    finally{setLoading(false);isFetching.current=false}
  },[])

  const fetchGlobal = useCallback(async (force=false) => {
    if(!force&&lsRead(LS_GLOBAL,300000)){setGlobalLoading(false);return}
    try{const j=await fetch(`/api/kis?type=global-batch&symbols=${BATCH_SYMBOLS.join(',')}`).then(r=>r.json());setGlobalData(j);lsWrite(LS_GLOBAL,j)}
    catch{}finally{setGlobalLoading(false)}
  },[])

  const fetchForex = useCallback(async (force=false) => {
    if(!force&&lsRead(LS_FOREX,300000)) return
    try{const j=await fetch('/api/kis?type=forex-krw&range=1mo').then(r=>r.json());setForexData(j);lsWrite(LS_FOREX,j)}
    catch{}
  },[])

  const fetchCbRates = useCallback(async () => {
    if(lsRead(LS_RATES,3600000*6)) return
    try{const j=await fetch('/api/kis?type=central-rates').then(r=>r.json());setCbRates(j);lsWrite(LS_RATES,j)}
    catch{}
  },[])

  // 장중 수급 데이터 — 장중에만 의미있고 2분 캐시
  const fetchFlow = useCallback(async (force=false) => {
    if(!force&&lsRead(LS_FLOW,120000)) return
    try{
      const j=await fetch('/api/kiwoom?type=market-flow').then(r=>r.json())
      if(j.total){setFlowData(j);lsWrite(LS_FLOW,j)}
    }catch{}
  },[])

  // 52주 고저 — 6시간 캐시
  const fetchWeek = useCallback(async () => {
    if(lsRead(LS_WEEK,3600000*6)) return
    try{
      const j=await fetch('/api/kiwoom?type=index-52week').then(r=>r.json())
      if(j.KOSPI){setWeekData(j);lsWrite(LS_WEEK,j)}
    }catch{}
  },[])

  // 업종 히트맵 등락률 — 5분 캐시
  const fetchHeatmap = useCallback(async (force=false) => {
    if(!force&&lsRead(LS_HEATMAP,300000)) return
    try{
      const j=await fetch('/api/kiwoom?type=sector-heatmap').then(r=>r.json())
      if(j.rates){setHeatmapData(j.rates);lsWrite(LS_HEATMAP,j.rates)}
    }catch{}
  },[])

  const refresh = useCallback(() => {
    localStorage.removeItem(LS_DASH)
    localStorage.removeItem(LS_GLOBAL)
    localStorage.removeItem(LS_FOREX)
    localStorage.removeItem(LS_FLOW)
    localStorage.removeItem(LS_HEATMAP)
    fetchDashboard(true);fetchGlobal(true);fetchForex(true);fetchFlow(true);fetchHeatmap(true)
  },[fetchDashboard,fetchGlobal,fetchForex,fetchFlow,fetchHeatmap])

  useEffect(()=>{
    fetchDashboard(true);fetchGlobal(true);fetchForex(true);fetchCbRates();fetchFlow(true);fetchWeek();fetchHeatmap(true)
    timerRef.current  = setInterval(()=>fetchDashboard(true), isMarketOpen()?30000:300000)
    globalRef.current = setInterval(()=>fetchGlobal(true),    isUSMarketOpen()?60000:300000)
    const flowTimer    = setInterval(()=>fetchFlow(true),    isMarketOpen()?120000:600000)
    const heatmapTimer = setInterval(()=>fetchHeatmap(true), isMarketOpen()?300000:600000)
    return()=>{clearInterval(timerRef.current);clearInterval(globalRef.current);clearInterval(flowTimer);clearInterval(heatmapTimer)}
  },[fetchDashboard,fetchGlobal,fetchForex,fetchCbRates,fetchFlow,fetchWeek,fetchHeatmap])

  return { dashData, globalData, forexData, cbRates, flowData, weekData, heatmapData, loading, globalLoading, fetchError, setFetchError, lastFetch, refresh, fetchDashboard }
}
