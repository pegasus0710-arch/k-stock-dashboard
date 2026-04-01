// src/hooks/useUserSettings.js
// Firestore 기반 사용자 설정 저장/로드 훅
// localStorage를 대체하여 크로스 디바이스 동기화 지원
//
// 사용법:
//   const { getSetting, setSetting, getDrawings, saveDrawings, ready } = useUserSettings()

import { useState, useEffect, useCallback, useRef } from 'react'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

// ── Firestore 경로 ────────────────────────────────────
// users/{uid}/settings/layout    → sidebar_collapsed 등 UI 설정
// users/{uid}/settings/chart     → MA 설정, 최근 검색
// users/{uid}/watchlist/data     → 관심종목 리스트
// users/{uid}/watchlist/cats     → 관심종목 카테고리
// users/{uid}/drawings/{key}     → 차트 드로잉 데이터

const DEBOUNCE_MS = 800  // 연속 변경 시 마지막 저장만 실행

export function useUserSettings() {
  const { user } = useAuth()
  const uid = user?.uid
  const [ready, setReady] = useState(false)
  const [cache, setCache] = useState({})  // 로컬 캐시 (Firestore 로드 결과)
  const debounceRef = useRef({})

  // ── 초기 로드 ─────────────────────────────────────
  useEffect(() => {
    if (!uid) { setReady(false); return }

    async function loadAll() {
      try {
        const [layoutSnap, chartSnap, wlSnap, wlCatsSnap] = await Promise.all([
          getDoc(doc(db, 'users', uid, 'settings', 'layout')),
          getDoc(doc(db, 'users', uid, 'settings', 'chart')),
          getDoc(doc(db, 'users', uid, 'watchlist', 'data')),
          getDoc(doc(db, 'users', uid, 'watchlist', 'cats')),
        ])
        const loaded = {
          layout:   layoutSnap.exists()  ? layoutSnap.data()  : {},
          chart:    chartSnap.exists()   ? chartSnap.data()   : {},
          watchlist: wlSnap.exists()     ? wlSnap.data()      : {},
          wlCats:   wlCatsSnap.exists()  ? wlCatsSnap.data()  : {},
        }
        setCache(loaded)
        // localStorage 병합: Firestore 없으면 localStorage 값 사용 (마이그레이션)
        if (!layoutSnap.exists()) {
          const ls = localStorage.getItem('sidebar_collapsed')
          if (ls) await setDoc(doc(db, 'users', uid, 'settings', 'layout'), { sidebar_collapsed: JSON.parse(ls) })
        }
        if (!chartSnap.exists()) {
          const maLs = localStorage.getItem('gcm_ma_settings')
          const recentLs = localStorage.getItem('cap_recent_v3')
          const watchLs  = localStorage.getItem('cap_watch_v2')
          const chartData = {}
          if (maLs)     chartData.ma_settings  = JSON.parse(maLs)
          if (recentLs) chartData.recent        = JSON.parse(recentLs)
          if (watchLs)  chartData.watchlist_old = JSON.parse(watchLs)
          if (Object.keys(chartData).length)
            await setDoc(doc(db, 'users', uid, 'settings', 'chart'), chartData)
        }
        if (!wlCatsSnap.exists()) {
          const wlCatsLs = localStorage.getItem('wl_v3')
          if (wlCatsLs) {
            const cats = JSON.parse(wlCatsLs)
            if (cats?.length) await setDoc(doc(db, 'users', uid, 'watchlist', 'cats'), { cats })
          }
        }
      } catch (e) {
        console.warn('[useUserSettings] load error:', e)
      } finally {
        setReady(true)
      }
    }
    loadAll()
  }, [uid])

  // ── 설정 읽기 ─────────────────────────────────────
  const getSetting = useCallback((docName, field, defaultVal) => {
    if (!uid) {
      // 비로그인: localStorage 폴백
      try { const v = localStorage.getItem(field); return v != null ? JSON.parse(v) : defaultVal } catch { return defaultVal }
    }
    return cache[docName]?.[field] ?? defaultVal
  }, [uid, cache])

  // ── 설정 쓰기 (디바운스) ──────────────────────────
  const setSetting = useCallback((docName, field, value) => {
    // 즉시 캐시 업데이트
    setCache(prev => ({
      ...prev,
      [docName]: { ...(prev[docName] || {}), [field]: value }
    }))
    // localStorage 동시 저장 (오프라인 폴백)
    try { localStorage.setItem(field, JSON.stringify(value)) } catch {}
    // Firestore 디바운스 저장
    if (!uid) return
    const dKey = `${docName}/${field}`
    clearTimeout(debounceRef.current[dKey])
    debounceRef.current[dKey] = setTimeout(async () => {
      try {
        const ref = doc(db, 'users', uid, 'settings', docName)
        await setDoc(ref, { [field]: value }, { merge: true })
      } catch (e) { console.warn('[useUserSettings] save error:', e) }
    }, DEBOUNCE_MS)
  }, [uid])

  // ── 드로잉 로드 ───────────────────────────────────
  const getDrawings = useCallback(async (key) => {
    // 캐시에 있으면 즉시 반환
    const cacheKey = `draw_${key}`
    if (cache[cacheKey] !== undefined) return cache[cacheKey]
    // localStorage 폴백
    if (!uid) {
      try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] }
    }
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'drawings', key.replace(/[^a-zA-Z0-9_-]/g, '_')))
      const drawings = snap.exists() ? (snap.data().drawings || []) : []
      // localStorage 마이그레이션
      if (!snap.exists()) {
        try { const ls = localStorage.getItem(key); if (ls) return JSON.parse(ls) || [] } catch {}
      }
      setCache(prev => ({ ...prev, [cacheKey]: drawings }))
      return drawings
    } catch { return [] }
  }, [uid, cache])

  // ── 드로잉 저장 (디바운스) ────────────────────────
  const saveDrawings = useCallback((key, drawings) => {
    const cacheKey = `draw_${key}`
    setCache(prev => ({ ...prev, [cacheKey]: drawings }))
    // localStorage 동시 저장
    try { localStorage.setItem(key, JSON.stringify(drawings)) } catch {}
    if (!uid) return
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_')
    clearTimeout(debounceRef.current[`draw_${safeKey}`])
    debounceRef.current[`draw_${safeKey}`] = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'users', uid, 'drawings', safeKey), { drawings, updatedAt: Date.now() })
      } catch (e) { console.warn('[useUserSettings] drawings save error:', e) }
    }, DEBOUNCE_MS)
  }, [uid])

  // ── 관심종목 저장 ─────────────────────────────────
  const saveWatchlist = useCallback((data) => {
    setCache(prev => ({ ...prev, watchlist: data }))
    try { localStorage.setItem('cap_watch_v2', JSON.stringify(data)) } catch {}
    if (!uid) return
    clearTimeout(debounceRef.current['watchlist'])
    debounceRef.current['watchlist'] = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'users', uid, 'watchlist', 'data'), { data, updatedAt: Date.now() })
      } catch (e) { console.warn('[useUserSettings] watchlist save error:', e) }
    }, DEBOUNCE_MS)
  }, [uid])

  const getWatchlist = useCallback((defaultVal = []) => {
    if (cache.watchlist?.data) return cache.watchlist.data
    try { const ls = localStorage.getItem('cap_watch_v2'); return ls ? JSON.parse(ls) : defaultVal } catch { return defaultVal }
  }, [cache])

  // ── 관심종목 카테고리 저장 ────────────────────────
  const saveWlCats = useCallback((cats) => {
    setCache(prev => ({ ...prev, wlCats: { cats } }))
    try { localStorage.setItem('wl_v3', JSON.stringify(cats)) } catch {}
    if (!uid) return
    clearTimeout(debounceRef.current['wlCats'])
    debounceRef.current['wlCats'] = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'users', uid, 'watchlist', 'cats'), { cats, updatedAt: Date.now() })
      } catch (e) { console.warn('[useUserSettings] wlCats save error:', e) }
    }, DEBOUNCE_MS)
  }, [uid])

  const getWlCats = useCallback((defaultVal = []) => {
    if (cache.wlCats?.cats) return cache.wlCats.cats
    try { const ls = localStorage.getItem('wl_v3'); return ls ? JSON.parse(ls) : defaultVal } catch { return defaultVal }
  }, [cache])

  return {
    ready,          // Firestore 로드 완료 여부
    getSetting,     // (docName, field, default) → value
    setSetting,     // (docName, field, value)
    getDrawings,    // async (key) → drawings[]
    saveDrawings,   // (key, drawings[])
    getWatchlist,   // () → []
    saveWatchlist,  // (data)
    getWlCats,      // () → []
    saveWlCats,     // (cats[])
  }
}
