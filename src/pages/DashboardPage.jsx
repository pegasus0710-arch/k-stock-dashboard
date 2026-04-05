// src/pages/DashboardPage.jsx — v5 (컴포넌트 분리 후 경량화)
import { useState, useCallback, useEffect, useRef } from 'react'
import { db } from '../firebase'
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { rateColor, getTodayStr, getKstStatus, isMarketOpen, isUSMarketOpen, getSymbolMarketStatus } from '../utils/format'
import { SECTOR_GROUPS, ALL_ITEMS, GAUGE_CONFIG, HEATMAP_SECTORS, getHeatmapColor } from '../constants/dashboardData'
import { GaugeBar, TooltipIcon } from '../components/ui/GaugeBar'
import GuideModal        from '../components/dashboard/GuideModal'
import GlobalChartModal  from '../components/GlobalChartModal'
import useDashboard      from '../hooks/useDashboard'
import HeroChart         from '../components/dashboard/HeroChart'
import AiBriefing        from '../components/dashboard/AiBriefing'
import './DashboardPage.css'

function getItemData(item, dashData, globalData, forexData) {
  if (item.type==='global') return globalData?.[item.sym] || null
  if (item.type==='forex')  { const d=forexData?.[item.pair]; return d?{price:d.price,changeRate:d.changeRate,change:d.change,marketState:'CURRENCY'}:null }
  if (item.type==='spread') {
    const us10y = globalData?.['US10Y']?.price
    const us2y  = globalData?.['US2Y']?.price
    if (us10y==null || us2y==null) return null
    const spread = Math.round((us10y - us2y) * 100) / 100
    return { price: spread, changeRate: null, isSpread: true,
             us10y, us2y, inverted: spread < 0 }
  }
  return null
}

function getMarketBadge(item, data) {
  if (item.type==='cb')      return { label:'정책금리', cls:'cb'     }
  if (item.type==='forex')   return null
  if (item.type==='spread')  return null
  if (item.type==='divider') return null
  const status = getSymbolMarketStatus(item.id)
  if (status === 'live')  return { label:'LIVE',  cls:'live'  }
  if (status === 'pre')   return { label:'프리',  cls:'pre'   }
  if (status === 'after') return { label:'시간외', cls:'after' }
  return { label:'전일', cls:'closed' }
}

// 카드 경고 클래스 — VIX 40↑ 패닉 / VIX 30↑ 공포, USD/KRW 1500↑
function getWarnClass(item, d) {
  if (!d || d.price == null) return ''
  if (item.id === 'VIX'    && d.price >= 40)   return 'db-idx-card--warn-panic'
  if (item.id === 'VIX'    && d.price >= 30)   return 'db-idx-card--warn-red'
  if (item.id === 'FX_USD' && d.price >= 1500) return 'db-idx-card--warn-orange'
  return ''
}

// 원자재 도트 색상 — 등락률 기반
function getCommodityDotColor(rate) {
  if (rate == null) return '#94a3b8'
  if (rate >=  3.0) return '#16a34a'
  if (rate >=  1.0) return '#22c55e'
  if (rate >=  0.0) return '#4ade80'
  if (rate >= -1.0) return '#60a5fa'
  if (rate >= -3.0) return '#3b82f6'
  return '#1d4ed8'
}

// 지수별 기준일 레이블 — 마켓별 마감 시간이 다름
function getItemDateLabel(item, d) {
  if (!d) return null
  if (d.isCB && d.date) return `🕐 ${d.date}`  // 기준금리: API 날짜
  if (d.price == null)  return null
  const now = new Date()
  const kst = new Date(Date.now() + 9 * 3600000)
  const pad = n => String(n).padStart(2,'0')
  const kstStr = `${kst.getUTCMonth()+1}.${pad(kst.getUTCDate())} KST`
  // 미국 EST (UTC-5, 서머타임 -4 근사)
  const est = new Date(Date.now() - 4 * 3600000)
  const estStr = `${est.getUTCMonth()+1}.${pad(est.getUTCDate())} EST`
  // 유럽 CET (UTC+1)
  const cet = new Date(Date.now() + 1 * 3600000)
  const cetStr = `${cet.getUTCMonth()+1}.${pad(cet.getUTCDate())} CET`
  // 일본 JST = KST
  const jstStr = `${kst.getUTCMonth()+1}.${pad(kst.getUTCDate())} JST`
  // 중국 CST = KST-1h (근사)
  const cst = new Date(Date.now() + 8 * 3600000)
  const cstStr = `${cst.getUTCMonth()+1}.${pad(cst.getUTCDate())} CST`

  const KR_IDS  = ['KOSPI','KOSDAQ','KRX100','K200','KQ150']
  const US_IDS  = ['SP500','NASDAQ','DOW','VIX','DXY','US10Y','US2Y','WTI','BRENT','GOLD','SILVER','COPPER']
  const EU_IDS  = ['DAX']
  const JP_IDS  = ['N225']
  const CN_IDS  = ['HSI','SSE','TWI']
  const FX_IDS  = ['FX_USD','FX_JPY','FX_CNY','FX_EUR']

  if (KR_IDS.includes(item.id))  return `🕐 ${kstStr}`
  if (US_IDS.includes(item.id))  return `🕐 ${estStr}`
  if (EU_IDS.includes(item.id))  return `🕐 ${cetStr}`
  if (JP_IDS.includes(item.id))  return `🕐 ${jstStr}`
  if (CN_IDS.includes(item.id))  return `🕐 ${cstStr}`
  if (FX_IDS.includes(item.id))  return `🕐 ${kstStr}`
  if (item.type === 'spread')     return `🕐 ${estStr}`
  return null
}

function Skeleton({ w='60%', h=14 }) {
  return <div className="db-skeleton" style={{width:w,height:h,borderRadius:3}}/>
}

// 전 거래일 계산 (주말 스킵)
function getPrevTradingDay() {
  const kst = new Date(Date.now() + 9 * 3600000)
  // 장중/시간외엔 오늘이 기준
  const h = kst.getUTCHours(), m = kst.getUTCMinutes()
  const t = h * 60 + m
  const isMarket = t >= 9*60 && t < 18*60
  const d = isMarket ? kst : new Date(kst.getTime() - 86400000)
  // 일요일→금요일, 토요일→금요일
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setTime(d.getTime() - 86400000)
  }
  return `${d.getUTCMonth()+1}.${String(d.getUTCDate()).padStart(2,'0')} KST`
}

const ST_MAP = {
  open:      {label:'정규장 운영중', color:'#16a34a', dot:true},
  premarket: {label:'장 시작 전',   color:'#d97706', dot:false},
  after:     {label:'시간외 거래',  color:'#7c3aed', dot:true},
  holiday:   {label:'휴장일',       color:'#64748b', dot:false},
  closed:    {label:'장 마감',      color:'#64748b', dot:false},
}

// ── 시간대별 AI 컨텍스트 ────────────────────────────────
function getTimeContext() {
  const h = new Date().getHours()
  if (h >= 0  && h < 7)  return { mode:'dawn',     label:'새벽 · 미국장 실시간',  emoji:'🌙', focus:'미국 장 실시간 흐름과 오버나이트 이슈, 국내 장 영향 예상' }
  if (h >= 7  && h < 9)  return { mode:'preopen',  label:'개장 전 브리핑',         emoji:'🌅', focus:'전일 미국 장 마감 요약, 오늘 국내 개장 전망, 주요 이벤트 예고' }
  if (h >= 9  && h < 16) return { mode:'intraday',  label:'장중 분석',              emoji:'📊', focus:'현재 코스피/코스닥 흐름, 강약 섹터, 외국인·기관 수급' }
  if (h >= 16 && h < 18) return { mode:'close',    label:'마감 결산',              emoji:'🔔', focus:'오늘 장 결산, 특이 종목/섹터, 시간외 동향, 미국 선물 방향' }
  return                         { mode:'evening',  label:'저녁 종합 리포트',       emoji:'🌆', focus:'국내외 주요 이슈 총정리, 미국 선물 방향, 내일 주목할 이벤트' }
}

// ── 스파크라인 SVG 헬퍼 ──────────────────────────────────
function MiniSparkline({ closes, color, w=80, h=22 }) {
  if (!closes || closes.length < 2) return null
  const vals = closes.filter(v => isFinite(v))
  if (vals.length < 2) return null
  const pad = 2
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1
  const px = i => pad + (i / (vals.length - 1)) * (w - pad * 2)
  const py = v => h - pad - ((v - mn) / rng) * (h - pad * 2)
  const pts = vals.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
  const lx = px(vals.length - 1), ly = py(vals[vals.length - 1])
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{display:'block'}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round"/>
      <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r="2" fill={color} stroke="white" strokeWidth="1"/>
    </svg>
  )
}

export default function DashboardPage() {
  const { dashData, globalData, forexData, flowData, weekData: apiWeekData, heatmapData, loading, globalLoading,
          fetchError, setFetchError, lastFetch, refresh, fetchDashboard } = useDashboard()

  // 52주 고저 — HeroChart candles에서 계산 (별도 API 불필요)
  const [weekData,  setWeekData]  = useState({})
  const LS_SPARK_KEY = 'ks_spark_cache'
  const [sparkData, setSparkData] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('ks_spark_cache') || '{}')
      return cached  // { KOSPI: [prices...], KOSDAQ: [prices...] }
    } catch { return {} }
  })
  const handleWeekRange = useCallback((id, high, low) => {
    if(id) setWeekData(prev => ({...prev, [id]: {high52: high, low52: low}}))
  }, [])
  const handleSparkData = useCallback((id, closes) => {
    if(id && closes?.length) setSparkData(prev => ({...prev, [id]: closes}))
  }, [])

  // ── 국내지수 스파크라인 직접 로드 ────────────────────────────────────
  useEffect(() => {
    const loadSpark = async (id, inds_cd) => {
      try {
        // index-chart 주봉 (메인차트와 동일 API — 정상 동작 확인됨)
        const j = await fetch(
          `/api/kiwoom?type=index-chart&inds_cd=${inds_cd}&period=week`
        ).then(r => r.json())
        const raw = (j.candles || [])
          .map(c => ({
            close: (c.close || 0) / 100,
            high:  (c.high  || 0) / 100,
            low:   (c.low   || 0) / 100,
          }))
          .filter(c => c.close > 0)
          .slice(-52)
        if (!raw.length) return
        const closes = raw.map(c => c.close)
        setSparkData(prev => {
          const next = { ...prev, [id]: closes }
          // localStorage에 캐시 저장 (직전 종가 보존)
          try {
            const existing = JSON.parse(localStorage.getItem('ks_spark_cache') || '{}')
            localStorage.setItem('ks_spark_cache', JSON.stringify({ ...existing, [id]: closes }))
          } catch {}
          return next
        })
        const hs = raw.map(c => c.high || c.close)
        const ls = raw.map(c => c.low  || c.close)
        setWeekData(prev => ({
          ...prev,
          [id]: { high52: Math.max(...hs), low52: Math.min(...ls) }
        }))
        console.log(`[Dashboard] ${id} spark loaded: ${raw.length}봉, 최신=${raw[raw.length-1]?.close}`)
      } catch(e) {
        console.warn(`[Dashboard] ${id} spark 실패:`, e)
      }
    }
    loadSpark('KOSPI',  '001')
    loadSpark('KOSDAQ', '101')
  }, [])

  const [selId,       setSelId]       = useState('KOSPI')
  const [showGuide,   setShowGuide]   = useState(false)
  const [showBriefing,setShowBriefing]= useState(false)
  const [chartItem,   setChartItem]   = useState(null)
  const [sectorPopup, setSectorPopup] = useState(null)   // { sector, stocks, loading }

  const openSectorPopup = useCallback(async (sector) => {
    setSectorPopup({ sector, stocks: [], loading: true })
    try {
      const codes = sector.repCodes || []
      if (!codes.length) {
        setSectorPopup({ sector, stocks: [], loading: false, error: true })
        return
      }

      // repCodes 순서대로 현재가 병렬 조회 (ka10001 개별 호출)
      const results = await Promise.allSettled(
        codes.map(code =>
          fetch(`/api/kiwoom?type=price&code=${code}`).then(r => r.json())
        )
      )

      const stocks = results
        .filter(r => r.status === 'fulfilled' && r.value?.stk_nm && !r.value?.error)
        .map(r => ({
          stk_cd:  r.value.stk_cd  || '',
          stk_nm:  r.value.stk_nm  || '',
          cur_prc: Math.abs(r.value.cur_prc || 0),
          flu_rt:  r.value.flu_rt  || 0,
        }))

      setSectorPopup({ sector, stocks, loading: false })
    } catch {
      setSectorPopup({ sector, stocks: [], loading: false, error: true })
    }
  }, [])

  const { user } = useAuth()

  // ── 포트폴리오 미니바 ─────────────────────────────
  const [themePopup, setThemePopup] = useState(null)    // {theme, aiText, loading}
  const [showPortBar, setShowPortBar] = useState(() => {
    try { return localStorage.getItem('db_portbar') === 'true' } catch { return false }
  })
  // 포트폴리오 미니바 — 포트폴리오 페이지 이동 유도만 (API 직접 호출 제거)
  const portSummary = null  // 포트폴리오 페이지에서 확인

  // ── AI 분석 센터 state ──────────────────────────────
  const [aiTab,      setAiTab]      = useState('brief') // brief|sector|risk|strategy
  const [aiContent,  setAiContent]  = useState(null)   // { brief, sector, risk, strategy, generatedAt, mode }
  const [aiLoading,  setAiLoading]  = useState(false)
  const [aiError,    setAiError]    = useState(null)
  const [expandCard, setExpandCard] = useState(null)   // 확장된 지수 카드 ID
  const [showDataPanel, setShowDataPanel] = useState(false)  // 상세 데이터 패널 접이식
  const timeCtx = getTimeContext()

  const togglePortBar = () => {
    setShowPortBar(prev => {
      try { localStorage.setItem('db_portbar', String(!prev)) } catch {}
      return !prev
    })
  }

  // Firestore 캐시 로드 (6시간 이내)
  useEffect(() => {
    if (!user) return
    const docRef = doc(db, 'users', user.uid, 'ai_dashboard', 'analysis')
    getDoc(docRef).then(snap => {
      if (!snap.exists()) return
      const d = snap.data()
      const age = Date.now() - (d.generatedAt?.toMillis?.() || 0)
      if (age < 6 * 3600000) setAiContent(d)
    }).catch(() => {})
  }, [user])

  const generateAi = async () => {
    if (aiLoading || !user) return
    setAiLoading(true); setAiError(null)
    const ctx = getTimeContext()
    // 현재 지표 요약
    const getIdxData = (key, sym) => {
      const spark = sparkData?.[key]
      const fromSpark = spark?.length >= 2 ? {
        price: spark[spark.length-1],
        changeRate: (spark[spark.length-1]-spark[spark.length-2])/spark[spark.length-2]*100
      } : null
      return (dashData?.[key]?.price > 0 ? dashData[key] : null)
          || (domesticIdx?.[key]?.price > 0 ? domesticIdx[key] : null)
          || fromSpark || globalData?.[sym] || null
    }
    const kospi  = getIdxData('KOSPI',  'KS11')
    const kosdaq = getIdxData('KOSDAQ', 'KQ11')
    const sp500  = globalData?.['SP500']
    const vix    = globalData?.['VIX']
    const usd    = forexData?.['USD/KRW']
    const marketSummary = [
      kospi  && `KOSPI ${kospi.price?.toLocaleString()} (${kospi.changeRate >= 0 ? '+' : ''}${kospi.changeRate?.toFixed(2)}%)`,
      kosdaq && `KOSDAQ ${kosdaq.price?.toLocaleString()} (${kosdaq.changeRate >= 0 ? '+' : ''}${kosdaq.changeRate?.toFixed(2)}%)`,
      sp500  && `S&P500 ${sp500.price?.toLocaleString()} (${sp500.changeRate >= 0 ? '+' : ''}${sp500.changeRate?.toFixed(2)}%)`,
      vix    && `VIX ${vix.price?.toFixed(2)}`,
      usd    && `USD/KRW ${usd.price?.toLocaleString()}`,
    ].filter(Boolean).join(', ')
    const hotSectors = effectiveHeatmap ? Object.entries(effectiveHeatmap)
      .filter(([,v]) => v != null).sort(([,a],[,b]) => b - a).slice(0,3)
      .map(([k,v]) => { const s = HEATMAP_SECTORS.find(h => h.inds_cd === k); return s ? `${s.name}(${v >= 0 ? '+' : ''}${v?.toFixed(1)}%)` : null })
      .filter(Boolean).join(', ') : '데이터 로딩 중'
    // 포트폴리오 컨텍스트
    const portContext = '보유종목 데이터 없음 (포트폴리오 페이지 참고)'

    // 수급 컨텍스트
    const flowContext = flowData?.total ? (() => {
      const f = flowData.total
      const fmt = v => Math.abs(v) >= 10000 ? `${(v/10000).toFixed(1)}조` : `${Math.round(v/1000)}천억`
      return `외국인${fmt(f.foreign)} 기관${fmt(f.institution)} 개인${fmt(f.individual)}`
    })() : '수급 데이터 없음'

    // 주요 일정 컨텍스트
    const schedCtx = scheduleEvents.slice(0,3).map(e => {
      const diff = Math.ceil((new Date(e.date+'T09:00:00+09:00') - new Date()) / 86400000)
      return `${e.label}(D-${diff})`
    }).join(', ')

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-api-key': import.meta.env.VITE_CLAUDE_API_KEY, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          tools: [{ type:'web_search_20250305', name:'web_search' }],
          system: [
            '당신은 20년 경력 한국 주식시장 전문가입니다. 실전 트레이더 관점에서 구체적이고 실용적인 인사이트를 제공합니다.',
            '뻔한 말은 절대 하지 마세요. "조심하세요", "관망하세요" 같은 무의미한 조언은 금지입니다.',
            '투자자가 오늘 실제로 취할 수 있는 구체적 액션을 중심으로 분석하세요.',
            '',
            `분석 시각: ${new Date().toLocaleString('ko-KR')} / 모드: ${ctx.label}`,
            `시장 데이터: ${marketSummary}`,
            `수급: ${flowContext}`,
            `강약 섹터: ${hotSectors}`,
            `사용자 보유종목: ${portContext}`,
            `주요 일정: ${schedCtx}`,
            '',
            '웹 검색으로 오늘 실제 뉴스를 확인 후 반드시 아래 JSON만 반환하세요.',
            '{',
            '  "headline": "핵심 한 줄 (30자 이내, 구체적 수치 포함)",',
            '  "brief": "지금 시장의 실제 상황 요약 — 왜 이렇게 됐는지 원인 중심 (150자)",',
            '  "keyLevel": {"kospi": "주목해야 할 KOSPI 레벨과 이유", "action": "이 레벨에서 할 것"},',
            '  "actions": ["오늘 반드시 할 것 1", "오늘 반드시 할 것 2", "오늘 하지 말아야 할 것"],',
            '  "portImpact": "보유종목에 오늘 영향을 줄 구체적 이슈 (보유종목 없으면 관망 추천 종목 1개)",',
            '  "bullScenario": "강세 전환 조건 — 무엇이 바뀌어야 하는가 (구체적 수치나 이벤트)",',
            '  "bearScenario": "추가 하락 조건 — 무엇이 깨지면 위험한가 (구체적 지지선)",',
            '  "sectorWatch": [',
            '    {"name":"반도체","signal":"매수관심 또는 중립 또는 주의","reason":"구체적 뉴스 이유 + 대표종목"},',
            '    {"name":"자동차","signal":"...","reason":"..."},',
            '    {"name":"조선","signal":"...","reason":"..."},',
            '    {"name":"바이오","signal":"...","reason":"..."},',
            '    {"name":"금융","signal":"...","reason":"..."}',
            '  ],',
            '  "riskFactors": ["지금 당장 주시해야 할 리스크 구체적으로", "두번째 리스크"],',
            '  "strategy": "오늘 투자자가 실제로 취할 수 있는 구체적 액션 (매수/매도/관망 + 이유 + 레벨)",',
            '  "schedule": [{"time":"HH:MM","event":"오늘 발표 예정 지표명","impact":"high 또는 medium","effect":"이 지표가 어떻게 나오면 어떻게 될지"}],',
            '  "mood": "bullish 또는 cautious 또는 bearish 또는 neutral",',
            '  "midTermView": "1~3개월 관점에서 지금이 기회인지 위기인지 구체적 판단"',
            '}',
          ].join('\n'),
          messages: [{ role:'user', content:`${ctx.focus} 관점에서 웹 검색 후 위 사용자의 포트폴리오와 시장 상황을 종합 분석해주세요.` }]
        })
      })
      const data = await res.json()
      const rawText = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
      // cite 태그 제거 (웹 검색 인용 태그)
      const cleanText = rawText.replace(/<cite[^>]*>|<\/cite>/g, '').replace(/\s+/g, ' ')
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('JSON 파싱 실패')
      const parsed = JSON.parse(jsonMatch[0])
      const now = Timestamp.fromDate(new Date())
      const toSave = { ...parsed, generatedAt: now, mode: ctx.mode, modeLabel: ctx.label }
      await setDoc(doc(db, 'users', user.uid, 'ai_dashboard', 'analysis'), toSave)
      setAiContent(toSave)
    } catch(e) {
      setAiError('분석 생성 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally { setAiLoading(false) }
  }

  // forexData 유효값 캐시 저장
  useEffect(() => {
    if (!forexData) return
    const usd = forexData['USD/KRW']
    if (usd?.price > 0) {
      const prev = loadCache()
      saveCache({ ...prev, forex: { ...(prev.forex||{}), 'USD/KRW': { price: usd.price, changeRate: usd.changeRate } } })
    }
  }, [forexData])

  // heatmapData Firestore 캐시 — 직전장 데이터 보존
  const LS_HEAT_KEY = 'ks_heatmap_cache'
  const [cachedHeatmap, setCachedHeatmap] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ks_heatmap_cache') || 'null') } catch { return null }
  })
  useEffect(() => {
    if (!heatmapData) return
    const hasData = Object.values(heatmapData).some(v => v != null && v !== 0)
    if (hasData) {
      localStorage.setItem('ks_heatmap_cache', JSON.stringify(heatmapData))
      setCachedHeatmap(heatmapData)
    }
  }, [heatmapData])
  // 유효한 히트맵 데이터 (실시간 우선, 없으면 캐시)
  const effectiveHeatmap = (heatmapData && Object.values(heatmapData).some(v => v != null && v !== 0))
    ? heatmapData : (cachedHeatmap || heatmapData)

  const kstStatus = getKstStatus()
  const isOpen    = kstStatus === 'open'
  const isAfter   = kstStatus === 'after'
  const st        = ST_MAP[kstStatus] || ST_MAP.closed
  const dataLabel = isOpen ? '장중 실시간' : isAfter ? '시간외' : '직전장 기준'

  // 지수 스트립용 아이템 추출
  const STRIP_ITEMS = [
    { id:'KOSPI',  label:'KOSPI',  type:'domestic' },
    { id:'KOSDAQ', label:'KOSDAQ', type:'domestic' },
    { id:'SP500',  label:'S&P500', sym:'SP500',  type:'global' },
    { id:'NASDAQ', label:'나스닥',  sym:'NASDAQ', type:'global' },
    { id:'N225',   label:'니케이',  sym:'N225',   type:'global' },
    { id:'VIX',    label:'VIX',    sym:'VIX',    type:'global' },
    { id:'FX_USD', label:'USD/KRW', pair:'USD/KRW', type:'forex' },
  ]

  const getStripData = (item) => {
    if (item.type === 'global')  return globalData?.[item.sym] || null
    if (item.type === 'forex') {
      // 1순위: forexData (KIS API 실시간)
      if (forexData?.[item.pair]?.price > 0) return { price: forexData[item.pair].price, changeRate: forexData[item.pair].changeRate }
      // 2순위: forexCache (직접 호출)
      if (forexCache?.price > 0) return forexCache
      // 3순위: localStorage 캐시
      const cached = loadCache()
      if (cached?.forex?.[item.pair]?.price > 0) return cached.forex[item.pair]
      return null
    }
    // 국내 지수: dashData 우선, 없으면 domesticIdx(직접 로드) fallback
    if (item.id === 'KOSPI' || item.id === 'KOSDAQ') {
      const key = item.id
      // 1순위: dashData (장중 실시간)
      const fromDash = dashData?.[key]?.price > 0 ? dashData[key] : null
      // 2순위: domesticIdx (직접 호출)
      const fromIdx  = domesticIdx?.[key]?.price > 0 ? domesticIdx[key] : null
      // 3순위: sparkData 마지막 봉 (직전 종가 — 항상 존재)
      const spark = sparkData?.[key]
      const fromSpark = spark?.length >= 2 ? {
        price:      spark[spark.length - 1],
        changeRate: ((spark[spark.length-1] - spark[spark.length-2]) / spark[spark.length-2] * 100),
      } : null
      const src = fromDash || fromIdx || fromSpark
      return src?.price > 0 ? { price: src.price, changeRate: src.changeRate } : null
    }
    return null
  }

  // 섹터 상위 5 + 하위 2 (좌측 패널 — 히트맵과 역할 분리)
  const hotSectorList = effectiveHeatmap
    ? (() => {
        const all = Object.entries(effectiveHeatmap)
          .filter(([,v]) => v != null)
          .sort(([,a],[,b]) => b - a)
          .map(([k,v]) => ({ sector: HEATMAP_SECTORS.find(h => h.inds_cd === k), rate: v }))
          .filter(r => r.sector)
        const top = all.slice(0, 5)
        const bot = all.slice(-2)
        // 중복 제거 후 합치기
        const botUniq = bot.filter(b => !top.find(t => t.sector.inds_cd === b.sector.inds_cd))
        return [...top, ...botUniq]
      })()
    : []

  // ── localStorage 캐시 유틸 ──────────────────────────
  const LS_KEY = 'ks_strip_cache'
  const loadCache = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} } }
  const saveCache = (data) => { try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {} }

  // ── 환율 캐시 (forexData 유효값 감지 시 저장) ────
  const [forexCache, setForexCache] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ks_forex_cache') || 'null') } catch { return null }
  })

  useEffect(() => {
    const usd = forexData?.['USD/KRW']
    if (usd?.price > 0) {
      const val = { price: usd.price, changeRate: usd.changeRate }
      setForexCache(val)
      try { localStorage.setItem('ks_forex_cache', JSON.stringify(val)) } catch {}
    }
  }, [forexData])

  // ── 국내 지수 직접 로드 (장외에도 직전장 데이터 표시) ───
  const [domesticIdx, setDomesticIdx] = useState(() => loadCache())

  useEffect(() => {
    const load = () => {
      fetch('/api/kiwoom?type=index-domestic')
        .then(r => r.json())
        .then(d => {
          if (d.KOSPI?.price > 0 || d.KOSDAQ?.price > 0) {
            setDomesticIdx(d)
            saveCache(d)  // 유효값이면 캐시 저장
          }
        })
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  // ── 이벤트 일정 — Firestore + AI 자동 갱신 ────────────
  const DEFAULT_EVENTS = [
    { label:'SK하이닉스 실적', date:'2026-04-24', icon:'💹', desc:'HBM 수요 가이던스 주목', effect:'어닝서프라이즈 시 반도체 섹터 강세' },
    { label:'한국 GDP (1분기)', date:'2026-04-24', icon:'🇰🇷', desc:'수출 둔화 반영 여부', effect:'예상 하회 시 원화 약세 우려' },
    { label:'삼성전자 실적', date:'2026-04-30', icon:'💹', desc:'반도체·스마트폰 실적 동시 발표', effect:'DS부문 흑자 전환 여부가 핵심' },
    { label:'미국 고용지표', date:'2026-05-02', icon:'📊', desc:'비농업 고용 예상 18만명', effect:'호조 시 금리 인하 기대 후퇴' },
    { label:'FOMC 금리 결정', date:'2026-05-07', icon:'🏦', desc:'동결 유력, 점도표 변화 주목', effect:'비둘기파 신호 시 코스피 긍정' },
    { label:'미국 CPI', date:'2026-05-13', icon:'📈', desc:'근원 CPI 둔화 여부', effect:'3% 하회 시 금리 인하 기대 강화' },
  ]
  const [scheduleEvents, setScheduleEvents] = useState(DEFAULT_EVENTS)
  const [scheduleLoading, setScheduleLoading] = useState(false)

  // Firestore에서 일정 로드
  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'users', user.uid, 'ai_dashboard', 'schedule'))
      .then(snap => {
        if (snap.exists() && snap.data().events?.length) {
          setScheduleEvents(snap.data().events)
        }
      }).catch(() => {})
  }, [user])

  const refreshSchedule = async () => {
    if (!user || scheduleLoading) return
    setScheduleLoading(true)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          system: [
            '한국 주식 투자자에게 중요한 향후 30일 이내 경제 일정을 웹 검색으로 찾아주세요.',
            '반드시 JSON 배열만 반환. 다른 텍스트 절대 금지.',
            '[{"label":"이벤트명","date":"YYYY-MM-DD","icon":"이모지"}]',
            '최대 8개, 날짜 오름차순 정렬'
          ].join("\n"),
          messages: [{ role: 'user', content: `오늘(${new Date().toISOString().slice(0,10)}) 기준 향후 30일 주요 경제/실적 일정` }]
        })
      })
      const data = await res.json()
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
      const match = text.match(/\[[\s\S]*?\]/)
      if (match) {
        const events = JSON.parse(match[0])
        setScheduleEvents(events)
        await setDoc(doc(db, 'users', user.uid, 'ai_dashboard', 'schedule'), {
          events, updatedAt: new Date().toISOString()
        })
      }
    } catch(e) { console.error('schedule refresh error', e) }
    finally { setScheduleLoading(false) }
  }

  // 핫테마 AI 상세 분석 — Firestore 24시간 캐시 (로그인 시) / 직접 호출 (비로그인)
  const openThemePopup = async (theme) => {
    // 로그인 없어도 팝업 열기 (캐시만 불가)
    if (!user) {
      setThemePopup({ theme, aiText: null, loading: true })
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'x-api-key': import.meta.env.VITE_CLAUDE_API_KEY, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514', max_tokens: 1000,
            tools: [{ type:'web_search_20250305', name:'web_search' }],
            system: '한국 주식시장 전문가. 웹 검색으로 최신 정보 확인 후 JSON만 반환. 다른 텍스트 금지.',
            messages: [{ role:'user', content: [
              `2026년 "${theme.label}" 투자 테마 분석. 대표종목: ${theme.tags.join(', ')}`,
              '{"summary":"배경(150자)","catalyst":"촉매 2~3가지","stocks":[{"name":"종목","reason":"30자"}],"risk":"리스크(80자)","timing":"진입 타이밍 판단"}'
            ].join("\n") }]
          })
        })
        const data = await res.json()
        const rawT = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('')
        const cleanT = rawT.replace(/<cite[^>]*>|<\/cite>/g, '').replace(/\s+/g, ' ')
        const match = cleanT.match(/\{[\s\S]*\}/)
        const parsed = match ? JSON.parse(match[0]) : null
        setThemePopup(prev => ({ ...prev, aiText: parsed, loading: false }))
      } catch {
        setThemePopup(prev => ({ ...prev, aiText: { summary: '분석 오류. 다시 시도해주세요.' }, loading: false }))
      }
      return
    }
    // Firestore 캐시 확인
    const cacheRef = doc(db, 'users', user.uid, 'theme_cache', theme.id)
    try {
      const snap = await getDoc(cacheRef)
      if (snap.exists()) {
        const { data: cached, cachedAt } = snap.data()
        const ageHrs = (Date.now() - new Date(cachedAt).getTime()) / 3600000
        if (ageHrs < 24 && cached) {
          // 24시간 이내 캐시 → 즉시 표시
          setThemePopup({ theme, aiText: cached, loading: false })
          return
        }
      }
    } catch {}

    // 캐시 없거나 만료 → AI 호출
    setThemePopup({ theme, aiText: null, loading: true })
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-api-key': import.meta.env.VITE_CLAUDE_API_KEY, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          tools: [{ type:'web_search_20250305', name:'web_search' }],
          system: '한국 주식시장 전문가. 웹 검색으로 최신 정보 확인 후 JSON만 반환. 다른 텍스트 금지.',
          messages: [{ role:'user', content: [
            `2026년 "${theme.label}" 투자 테마를 분석해주세요.`,
            `대표 종목: ${theme.tags.join(', ')}`,
            '반드시 아래 JSON만 반환:',
            '{"summary":"테마 배경과 2026년 왜 주목받는지 (150자)","catalyst":"핵심 촉매제 2~3가지","stocks":[{"name":"종목명","reason":"투자 포인트 30자"}],"risk":"이 테마의 핵심 리스크 (80자)","timing":"지금 진입 적절한지 타이밍 판단","cachedAt":"' + new Date().toISOString() + '"}'
          ].join("\n") }]
        })
      })
      const data = await res.json()
      const rawT = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('')
      const cleanT = rawT.replace(/<cite[^>]*>|<\/cite>/g, '').replace(/\s+/g, ' ')
      const match = cleanT.match(/\{[\s\S]*\}/)
      const parsed = match ? JSON.parse(match[0]) : null
      if (parsed) {
        // Firestore에 캐시 저장
        await setDoc(cacheRef, { data: parsed, cachedAt: new Date().toISOString() })
      }
      setThemePopup(prev => ({ ...prev, aiText: parsed, loading: false }))
    } catch(e) {
      setThemePopup(prev => ({ ...prev, aiText: { summary: '분석 오류. 다시 시도해주세요.' }, loading: false }))
    }
  }

  const moodColor = { bullish:'#16a34a', cautious:'#d97706', bearish:'#dc2626', neutral:'#64748b' }
  const moodLabel = { bullish:'강세 🟢', cautious:'주의 🟡', bearish:'약세 🔴', neutral:'중립 ⚪' }

  return (
    <div className="db-v2">
      {/* 에러 배너 */}
      {fetchError && (
        <div className="db-error-banner">⚠️ 데이터 로드 실패
          <button onClick={()=>{setFetchError(false);fetchDashboard(true)}}
            style={{marginLeft:12,fontSize:11,color:'var(--accent-mid)',background:'none',border:'none',cursor:'pointer'}}>↺ 재시도</button>
        </div>
      )}

      {/* 포트폴리오 미니바 */}
      <div className="db-portbar">
        <button className="db-portbar-toggle" onClick={togglePortBar} title={showPortBar?'수익률 숨기기':'수익률 보기'}>
          💼 {showPortBar ? '숨기기' : '내 수익률'}
        </button>
        {showPortBar && (
          <a href="/portfolio" style={{
            display:'flex', alignItems:'center', gap:8,
            fontSize:12, color:'var(--text-secondary)', textDecoration:'none'
          }}>
            <span>💼 포트폴리오 페이지에서 확인</span>
            <span style={{fontSize:10, color:'var(--accent-mid)'}}>→</span>
          </a>
        )}
      </div>

      {/* 지수 스트립 */}
      <div className="db-strip">
        {STRIP_ITEMS.map(item => {
          const d = getStripData(item)
          const up = (d?.changeRate ?? 0) >= 0
          const rc = up ? 'var(--color-up)' : 'var(--color-down)'
          const spark = sparkData?.[item.id]
          // 클릭 가능 여부: 차트 지원 항목만
          const canChart = item.type === 'global' || item.type === 'domestic'
          const handleClick = () => {
            if (!canChart || !d?.price) return
            if (item.type === 'domestic') {
              setChartItem({ type:'domestic', sym: item.id==='KOSPI'?'001':'101', label:item.label, price:d.price, changeRate:d.changeRate })
            } else {
              setChartItem({ type:'global', sym:item.sym, label:item.label, price:d.price, changeRate:d.changeRate })
            }
          }
          return (
            <div key={item.id}
              className={`db-strip-card${d?.changeRate > 0 ?' up':d?.changeRate < 0?' down':''}${canChart&&d?.price?' clickable':''}`}
              onClick={handleClick}
              title={canChart && d?.price ? `${item.label} 차트 보기` : ''}>
              <div className="db-strip-top">
                <span className="db-strip-name">{item.label}</span>
                {d?.price > 0 && d?.changeRate != null && (
                  <span className="db-strip-badge" style={{background: up?'rgba(220,38,38,.1)':'rgba(29,78,216,.1)', color: rc}}>
                    {up?'▲':'▼'}{Math.abs(d.changeRate).toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="db-strip-price" style={{color: rc}}>
                {d?.price > 0 ? (item.id==='VIX' ? d.price.toFixed(2) : Math.round(d.price).toLocaleString()) : '—'}
              </div>
              {/* 스파크 미니라인 항상 표시 */}
              {spark && spark.length > 2 && d?.price > 0 && (
                <MiniSparkline closes={spark} color={rc} w={80} h={18}/>
              )}
            </div>
          )
        })}
        {/* 우측: 상태 + 새로고침 */}
        <div className="db-strip-right">
          <div className="db-status-badge" style={{background:st.color+'15',color:st.color,borderColor:st.color+'30'}}>
            {st.dot&&<span className="db-status-dot" style={{background:st.color}}/>}{st.label}
          </div>
          <span style={{fontSize:9,color:'var(--text-dim)',textAlign:'right'}}>{dataLabel}</span>
          <button className="db-strip-refresh" disabled={loading} onClick={refresh} title="새로고침">
            {loading ? <span className="db-spinner-sm"/> : '↺'}
          </button>
        </div>
      </div>

      {/* 바디: 좌측 패널 + 메인 */}
      <div className="db-body">

        {/* 좌측 패널 */}
        <aside className="db-left">

          {/* 시장 체온계 — 5단계 배지 + 바 */}
          {((dashData?.KOSPI?.rising || dashData?.KOSPI?.fall || domesticIdx?.KOSPI?.rising || domesticIdx?.KOSPI?.fall)) && (() => {
            const src = dashData?.KOSPI?.rising > 0 ? dashData : domesticIdx
            const rising = Number(src?.KOSPI?.rising || 0) + Number(src?.KOSDAQ?.rising || 0)
            const fall   = Number(src?.KOSPI?.fall   || 0) + Number(src?.KOSDAQ?.fall   || 0)
            const total  = rising + fall || 1
            const upPct  = Math.round(rising / total * 100)
            // 5단계 배지
            const badge = upPct >= 70 ? { label:'강세 🔥', color:'#dc2626', bg:'rgba(220,38,38,.1)' }
                        : upPct >= 55 ? { label:'상승 🟢', color:'#16a34a', bg:'rgba(22,163,74,.1)' }
                        : upPct >= 45 ? { label:'중립 ⚪', color:'#64748b', bg:'rgba(100,116,139,.1)' }
                        : upPct >= 30 ? { label:'하락 🔵', color:'#2563eb', bg:'rgba(37,99,235,.1)' }
                        :               { label:'약세 ❄️', color:'#1d4ed8', bg:'rgba(29,78,216,.15)' }
            return (
              <div className="db-left-section">
                <div className="db-left-title">🌡️ 시장 체온계
                  <span className="db-left-badge">{isOpen?'장중':isAfter?'시간외':'직전장'}</span>
                </div>
                {/* 5단계 배지 */}
                <div className="db-temp-badge" style={{background: badge.bg, color: badge.color, borderColor: badge.color+'40'}}>
                  {badge.label} <span style={{fontSize:11, fontWeight:400}}>상승 {upPct}%</span>
                </div>
                {/* 바 */}
                <div className="db-breadth-bar" style={{marginTop:6}}>
                  <div className="db-breadth-up"   style={{width:`${upPct}%`}}/>
                  <div className="db-breadth-down" style={{width:`${100-upPct}%`}}/>
                </div>
                <div className="db-breadth-labels">
                  <span style={{color:'var(--color-up)'}}>↑ {rising.toLocaleString()}</span>
                  <span style={{color:'var(--text-dim)',fontSize:10}}>종목 {total.toLocaleString()}개</span>
                  <span style={{color:'var(--color-down)'}}>↓ {fall.toLocaleString()}</span>
                </div>
              </div>
            )
          })()}

          {/* 수급 동향 — 직전 장 기준 항상 표시 */}
          {flowData?.total && (() => {
            const f = flowData.total
            const items = [
              {label:'외국인', val: f.foreign     ?? 0},
              {label:'기관',   val: f.institution ?? 0},
              {label:'개인',   val: f.individual  ?? 0},
            ]
            const maxAbs = Math.max(...items.map(i => Math.abs(i.val)), 1)
            const fmt = v => Math.abs(v) >= 10000 ? `${(v/10000).toFixed(1)}조` : Math.abs(v) >= 1000 ? `${Math.round(v/1000)}천억` : `${Math.round(v)}억`
            return (
              <div className="db-left-section">
                <div className="db-left-title">💰 수급 동향
                  <span className="db-left-badge">{isOpen?'장중':isAfter?'시간외':'직전장'}</span>
                </div>
                {items.map(({label,val}) => {
                  const pct = Math.min(100, Math.abs(val)/maxAbs*100)
                  const isBuy = val >= 0
                  return (
                    <div key={label} className="db-flow-mini-row">
                      <span className="db-flow-mini-label">{label}</span>
                      <div className="db-flow-mini-bar">
                        <div className="db-flow-mini-fill" style={{width:`${pct}%`, background: isBuy?'#1d4ed8':'#dc2626', float: isBuy?'left':'right'}}/>
                      </div>
                      <span className="db-flow-mini-val" style={{color: isBuy?'#1d4ed8':'#dc2626'}}>
                        {isBuy?'+':''}{fmt(val)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* 섹터 동향 — 전체 업종 표시 */}
          <div className="db-left-section db-left-sector-full">
            <div className="db-left-title">🏭 업종 동향
              <span className="db-left-badge">↑5 ↓2</span>
            </div>
            {hotSectorList.length === 0
              ? <div className="db-sector-empty">직전장 데이터 로딩 중...</div>
              : hotSectorList.map(({sector, rate}) => {
                  const intensity = Math.min(100, Math.abs(rate) / 5 * 100)
                  const bg = rate > 0
                    ? `rgba(220,38,38,${(intensity * 0.003).toFixed(2)})`
                    : `rgba(37,99,235,${(intensity * 0.003).toFixed(2)})`
                  const isBot = hotSectorList.indexOf(hotSectorList.find(x=>x.sector.inds_cd===sector.inds_cd)) >= 5
                  return (
                    <div key={sector.inds_cd}>
                      {isBot && <div style={{borderTop:'1px dashed var(--border)',margin:'3px 0'}}/>}
                      <div className="db-sector-row"
                        style={{background: bg}}
                        onClick={()=>openSectorPopup(sector)}>
                        <span className="db-sector-name">{sector.name}</span>
                        <span className="db-sector-rate" style={{color: rate>=0?'var(--color-up)':'var(--color-down)'}}>
                          {rate>=0?'+':''}{rate.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  )
                })
            }
            <div style={{fontSize:9,color:'var(--text-dim)',textAlign:'right',marginTop:4}}>
              전체 업종 ↓ 히트맵 참고
            </div>
          </div>

          {/* 이벤트 카운트다운 — AI 자동 갱신 */}
          {(() => {
            const kst = new Date(Date.now() + 9 * 3600000)
            const upcoming = scheduleEvents
              .map(e => {
                const target = new Date(e.date + 'T09:00:00+09:00')
                const diff = Math.ceil((target - kst) / 86400000)
                return { ...e, diff }
              })
              .filter(e => e.diff >= 0 && e.diff <= 30)
              .sort((a,b) => a.diff - b.diff)
              .slice(0, 5)
            return (
              <div className="db-left-section">
                <div className="db-left-title">📅 주요 일정
                  <button className="db-sch-refresh" onClick={refreshSchedule}
                    disabled={scheduleLoading} title="AI로 일정 갱신">
                    {scheduleLoading ? '⏳' : '🔄'}
                  </button>
                </div>
                {upcoming.length === 0
                  ? <div style={{fontSize:11,color:'var(--text-dim)'}}>30일 내 일정 없음</div>
                  : upcoming.map((e, i) => (
                    <div key={i} className="db-event-row">
                      <span className="db-event-icon">{e.icon}</span>
                      <div className="db-event-info">
                        <span className="db-event-label">{e.label}</span>
                        {e.desc && <span className="db-event-desc">{e.desc}</span>}
                        {e.effect && <span className="db-event-effect">{e.effect}</span>}
                      </div>
                      <span className="db-event-dday" style={{
                        color: e.diff === 0 ? '#dc2626' : e.diff <= 3 ? '#d97706' : 'var(--text-dim)'
                      }}>
                        {e.diff === 0 ? '오늘' : `D-${e.diff}`}
                      </span>
                    </div>
                  ))
                }
              </div>
            )
          })()}


        </aside>

        {/* 메인: AI 분석 센터 */}
        <main className="db-main">
          <div className="db-ai-center">
            {/* AI 센터 헤더 */}
            <div className="db-ai-header">
              <div className="db-ai-title-row">
                <span className="db-ai-icon">🤖</span>
                <div>
                  <div className="db-ai-title">AI 시장 분석</div>
                  <div className="db-ai-subtitle">{timeCtx.emoji} {timeCtx.label}</div>
                </div>
                {aiContent?.generatedAt && (
                  <span className="db-ai-ts">
                    {new Date(aiContent.generatedAt.toMillis?.() || aiContent.generatedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})} 생성
                  </span>
                )}
                <button className="db-ai-gen-btn" onClick={generateAi} disabled={aiLoading}>
                  {aiLoading ? <><span className="db-spinner-sm"/> 분석 중...</> : aiContent ? '🔄 재분석' : '✨ 분석 시작'}
                </button>
              </div>
              <div className="db-ai-focus-label">
                집중 분석: <strong>{timeCtx.focus}</strong>
              </div>

              {/* 탭 — 콘텐츠 있을 때만 표시 */}
              {aiContent && (
                <div className="db-ai-tabs">
                  {[
                    {id:'brief',    label:'📋 브리핑'},
                    {id:'scenario', label:'📊 시나리오'},
                    {id:'sector',   label:'🏭 섹터'},
                    {id:'strategy', label:'💡 전략'},
                  ].map(t => (
                    <button key={t.id}
                      className={`db-ai-tab ${aiTab===t.id?'active':''}`}
                      onClick={()=>setAiTab(t.id)}>{t.label}</button>
                  ))}
                </div>
              )}

              <div className="db-ai-disclaimer">
                ⚠️ AI 생성 참고용 · 웹 검색 기반 · 투자 결정의 책임은 본인에게 있습니다
              </div>
            </div>

            {/* AI 콘텐츠 */}
            {aiLoading && (
              <div className="db-ai-loading">
                <div className="db-ai-spinner"/>
                <div>
                  <div style={{fontWeight:700,marginBottom:4}}>시장 데이터 분석 중...</div>
                  <div style={{fontSize:12,color:'var(--text-dim)'}}>웹 검색 → 전문가 시각 통합 → 시나리오 도출</div>
                </div>
              </div>
            )}

            {aiError && !aiLoading && (
              <div className="db-ai-error">⚠️ {aiError}</div>
            )}

            {aiContent && !aiLoading && (
              <div className="db-ai-tab-content">

                {/* 브리핑 탭 */}
                {aiTab === 'brief' && (<>
                  <div className="db-ai-headline-row">
                    <div className="db-ai-headline">"{aiContent.headline}"</div>
                    {aiContent.mood && (
                      <span className="db-ai-mood" style={{color: moodColor[aiContent.mood] || '#64748b'}}>
                        {moodLabel[aiContent.mood] || aiContent.mood}
                      </span>
                    )}
                  </div>
                  <div className="db-ai-brief">{aiContent.brief}</div>

                  {/* 핵심 레벨 */}
                  {aiContent.keyLevel && (
                    <div className="db-ai-keylevel">
                      <div className="db-ai-keylevel-title">🎯 핵심 레벨</div>
                      <div className="db-ai-keylevel-val">{aiContent.keyLevel.kospi}</div>
                      <div className="db-ai-keylevel-action">→ {aiContent.keyLevel.action}</div>
                    </div>
                  )}

                  {/* 오늘의 액션 */}
                  {aiContent.actions?.length > 0 && (
                    <div className="db-ai-section">
                      <div className="db-ai-section-title">✅ 오늘의 액션</div>
                      {aiContent.actions.map((a,i) => (
                        <div key={i} className={`db-ai-action-item ${i===aiContent.actions.length-1?'warn':''}`}>
                          <span className="db-ai-action-icon">{i===aiContent.actions.length-1?'🚫':'▶'}</span>
                          <span>{a}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 포트폴리오 영향 */}
                  {aiContent.portImpact && (
                    <div className="db-ai-portimpact">
                      <div className="db-ai-section-title">💼 내 포트폴리오 영향</div>
                      <div className="db-ai-portimpact-body">{aiContent.portImpact}</div>
                    </div>
                  )}

                  {/* 구버전 핵심 포인트 호환 */}
                  {aiContent.points?.length > 0 && !aiContent.actions && (
                    <div className="db-ai-section">
                      <div className="db-ai-section-title">📌 핵심 포인트</div>
                      {aiContent.points.map((p,i) => (
                        <div key={i} className="db-ai-point">
                          <span className="db-ai-point-num">{i+1}</span>
                          <span>{p}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {aiContent.schedule?.length > 0 && (
                    <div className="db-ai-section">
                      <div className="db-ai-section-title">📅 오늘의 주요 일정</div>
                      <div className="db-ai-schedule">
                        {aiContent.schedule.map((s,i) => (
                          <div key={i} className="db-ai-schedule-row">
                            <span className="db-ai-sch-time">{s.time}</span>
                            <div style={{flex:1}}>
                              <span className="db-ai-sch-event">{s.event}</span>
                              {s.effect && <div style={{fontSize:10,color:'var(--text-dim)',marginTop:2}}>{s.effect}</div>}
                            </div>
                            <span className={`db-ai-sch-impact impact-${s.impact}`}>{s.impact}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>)}

                {/* 시나리오 탭 */}
                {aiTab === 'scenario' && (<>
                  <div className="db-ai-scenarios" style={{padding:'16px 20px 0'}}>
                    {aiContent.bullScenario && (
                      <div className="db-ai-scenario bull">
                        <div className="db-ai-scenario-title">🟢 강세 시나리오 (단기 1~5일)</div>
                        <div className="db-ai-scenario-body">{aiContent.bullScenario}</div>
                      </div>
                    )}
                    {aiContent.bearScenario && (
                      <div className="db-ai-scenario bear">
                        <div className="db-ai-scenario-title">🔴 약세 시나리오 (단기 1~5일)</div>
                        <div className="db-ai-scenario-body">{aiContent.bearScenario}</div>
                      </div>
                    )}
                  </div>
                  {aiContent.midTermView && (
                    <div className="db-ai-section">
                      <div className="db-ai-section-title">🔭 중기 전망 (1~3개월)</div>
                      <div className="db-ai-midterm">{aiContent.midTermView}</div>
                    </div>
                  )}
                  {aiContent.riskFactors?.length > 0 && (
                    <div className="db-ai-section">
                      <div className="db-ai-section-title">⚠️ 주요 리스크</div>
                      {aiContent.riskFactors.map((r,i) => (
                        <div key={i} className="db-ai-risk-item">• {r}</div>
                      ))}
                    </div>
                  )}
                </>)}

                {/* 섹터 탭 */}
                {aiTab === 'sector' && (
                  <div className="db-ai-section">
                    <div className="db-ai-section-title">🏭 섹터 시그널</div>
                    {aiContent.sectorWatch?.length > 0 ? (
                      <div className="db-ai-sector-watch">
                        {aiContent.sectorWatch.map((s,i) => {
                          const sigColor = s.signal==='매수관심'?'#16a34a':s.signal==='주의'?'#dc2626':'#64748b'
                          return (
                            <div key={i} className="db-ai-sector-row">
                              <span className="db-ai-sector-name">{s.name}</span>
                              <span className="db-ai-sector-sig" style={{color:sigColor,borderColor:sigColor+'40'}}>
                                {s.signal}
                              </span>
                              <span className="db-ai-sector-reason">{s.reason}</span>
                            </div>
                          )
                        })}
                      </div>
                    ) : <div className="db-ai-empty-small">섹터 데이터 없음</div>}
                  </div>
                )}

                {/* 전략 탭 */}
                {aiTab === 'strategy' && (<>
                  {/* 오늘의 액션 (actions 필드) */}
                  {aiContent.actions?.length > 0 && (
                    <div className="db-ai-section">
                      <div className="db-ai-section-title">✅ 오늘의 액션</div>
                      {aiContent.actions.map((a,i) => (
                        <div key={i} className={`db-ai-action-item ${i===aiContent.actions.length-1?'warn':''}`}>
                          <span className="db-ai-action-icon">{i===aiContent.actions.length-1?'🚫':'▶'}</span>
                          <span>{a}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* 오늘의 투자 전략 */}
                  {(aiContent.strategy || aiContent.midTermView) && (
                    <div className="db-ai-section">
                      <div className="db-ai-section-title">💡 오늘의 투자 전략</div>
                      {aiContent.strategy
                        ? <div className="db-ai-strategy-body" style={{fontSize:14,lineHeight:1.8}}>{aiContent.strategy}</div>
                        : <div className="db-ai-strategy-body" style={{fontSize:13,color:'var(--text-secondary)'}}>
                            전략 데이터 없음 — 아래 중기 관점 참고
                          </div>
                      }
                    </div>
                  )}
                  {/* 핵심 레벨 */}
                  {aiContent.keyLevel && (
                    <div className="db-ai-keylevel">
                      <div className="db-ai-keylevel-title">🎯 핵심 레벨</div>
                      <div className="db-ai-keylevel-val">{aiContent.keyLevel.kospi}</div>
                      <div className="db-ai-keylevel-action">→ {aiContent.keyLevel.action}</div>
                    </div>
                  )}
                  {aiContent.midTermView && (
                    <div className="db-ai-section">
                      <div className="db-ai-section-title">🔭 중기 관점</div>
                      <div className="db-ai-midterm">{aiContent.midTermView}</div>
                    </div>
                  )}
                  {aiContent.riskFactors?.length > 0 && (
                    <div className="db-ai-section" style={{paddingBottom:16}}>
                      <div className="db-ai-section-title">⚠️ 유의 리스크</div>
                      {aiContent.riskFactors.map((r,i) => (
                        <div key={i} className="db-ai-risk-item">• {r}</div>
                      ))}
                    </div>
                  )}
                </>)}

              </div>
            )}

            {/* 초기 안내 */}
            {!aiContent && !aiLoading && !aiError && (
              <div className="db-ai-empty">
                <div className="db-ai-empty-icon">🤖</div>
                <div className="db-ai-empty-title">AI 시장 분석 준비</div>
                <div className="db-ai-empty-desc">
                  현재 시각 기준 <strong>{timeCtx.label}</strong> 모드로<br/>
                  {timeCtx.focus}에 집중하여 분석합니다.
                </div>
                <button className="db-ai-gen-btn large" onClick={generateAi} disabled={aiLoading}>
                  ✨ 지금 분석 시작하기
                </button>
              </div>
            )}
          </div>
        </main>
      </div>


      {/* ── 2026 핫 테마 섹션 ── */}
      <div className="db-theme-section">
        <div className="db-theme-header">
          <span className="db-theme-title">🔥 2026 핫 테마</span>
          <span className="db-theme-sub">AI 에이전트 시대 · 클릭하면 AI 상세 분석</span>
        </div>
        <div className="db-theme-grid">
          {[
            { id:'ai-agent',  label:'AI 에이전트',   icon:'🤖', desc:'자율 AI 소프트웨어 에이전트 확산', tags:['NAVER','카카오','크래프톤'], color:'#7c3aed' },
            { id:'robotics',  label:'로보틱스',      icon:'🦾', desc:'산업용 협동로봇 물류 자동화 가속', tags:['현대차','LS산전','레인보우로보틱스'], color:'#2563eb' },
            { id:'smr',       label:'SMR 원전',      icon:'⚛️', desc:'소형모듈원전 수주 개발 본격화',    tags:['두산에너빌','한전','비에이치아이'], color:'#16a34a' },
            { id:'defense',   label:'K-방산 수출',   icon:'🛡️', desc:'유럽 중동 방산 수출 확대',         tags:['한화에어로','LIG넥스원','현대로템'], color:'#dc2626' },
            { id:'powergrid', label:'전력망 인프라', icon:'⚡', desc:'AI 데이터센터 전력 수요 급증',     tags:['LS ELECTRIC','현대일렉트릭','일진전기'], color:'#d97706' },
            { id:'adc',       label:'바이오 ADC',    icon:'💉', desc:'항체약물접합체 글로벌 임상 활발',  tags:['레고켐바이오','알테오젠','한미약품'], color:'#ec4899' },
            { id:'lng',       label:'LNG 조선',      icon:'🚢', desc:'LNG 운반선 수주 호황',             tags:['HD한국조선','삼성중공업','한화오션'], color:'#0891b2' },
            { id:'supply',    label:'공급망 재편',   icon:'🌏', desc:'미중 디커플링 국내 제조 리쇼어링', tags:['삼성전자','SK하이닉스','포스코'], color:'#64748b' },
          ].map(theme => (
            <div key={theme.id} className="db-theme-card"
              style={{'--theme-color': theme.color}}
              onClick={()=>openThemePopup(theme)}>
              <div className="db-theme-card-top">
                <span className="db-theme-icon">{theme.icon}</span>
                <span className="db-theme-name">{theme.label}</span>
                <span className="db-theme-ai-badge">AI →</span>
              </div>
              <div className="db-theme-desc">{theme.desc}</div>
              <div className="db-theme-tags">
                {theme.tags.map(t => (
                  <span key={t} className="db-theme-tag">{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="db-theme-footer">
          📌 카드 클릭 시 AI가 최신 정보를 검색하여 상세 분석합니다
        </div>
      </div>

      {/* 히트맵 섹션 */}
      <div className="db-heatmap-section">
        <div className="db-heatmap-header">
          <span className="db-heatmap-title">📊 업종별 등락 히트맵</span>
          <TooltipIcon id="HEATMAP" tipPosition="right"/>
          <span style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:6}}>
            {isOpen && <span className="db-heatmap-live-dot"/>}
            <span className="db-date-badge" style={{
              background: isOpen ? 'rgba(34,197,94,.1)' : isAfter ? 'rgba(124,58,237,.1)' : 'var(--bg-base)',
              borderColor: isOpen ? 'rgba(34,197,94,.4)' : isAfter ? 'rgba(124,58,237,.3)' : 'var(--border)',
              color: isOpen ? '#15803d' : isAfter ? '#6d28d9' : 'var(--text-dim)',
            }}>
              {isOpen ? '실시간' : isAfter ? '시간외' : '직전 종가'} · {getPrevTradingDay()}
            </span>
          </span>
        </div>
        <div className="db-heatmap-grid">
          {HEATMAP_SECTORS.map(sector=>{
            const rate = effectiveHeatmap?.[sector.inds_cd] ?? null
            const effectiveRate = rate  // 장외에도 직전장 데이터 그대로 표시
            const { bg, neutral } = getHeatmapColor(effectiveRate)
            return (
              <div key={sector.id}
                className={`db-heatmap-cell${neutral?' neutral':''}`}
                style={{background: bg}}
                onClick={()=>openSectorPopup(sector)}>
                <span className="db-heatmap-cell-name">{sector.name}</span>
                <span className="db-heatmap-cell-rate">
                  {effectiveRate!=null ? `${effectiveRate>=0?'+':''}${effectiveRate.toFixed(2)}%` : '—'}
                </span>
                <span className="db-heatmap-cell-stocks">{sector.stocks}</span>
              </div>
            )
          })}
        </div>
        <div className="db-heatmap-legend">
          <span>약세</span>
          <div className="db-heatmap-legend-bar"/>
          <span>강세</span>
        </div>

      </div>

      <div className="dash-footer-note">
        ✅ KIS API · {isOpen?'장중 30초':isAfter?'시간외 2분':'장외 5분'} 자동 갱신 · {dataLabel}
        · 해외지수 {isUSMarketOpen()?'미장 운영중 60초':'5분'} 갱신 · 기준금리 6시간 캐시
      </div>

      {showGuide && <GuideModal onClose={()=>setShowGuide(false)}/>}

      {/* AI 브리핑 드로어 */}
      <AiBriefing
        open={showBriefing}
        onClose={()=>setShowBriefing(false)}
        marketData={{
          kospi:  globalData?.['KS11'],
          kosdaq: globalData?.['KQ11'],
          sp500:  globalData?.['SP500'],
          nasdaq: globalData?.['NASDAQ'],
          vix:    globalData?.['VIX'],
          wti:    globalData?.['WTI'],
          gold:   globalData?.['GOLD'],
          us10y:  globalData?.['US10Y'],
          usdkrw: forexData?.['USD'],
          spread: globalData?.['US10Y']?.price != null && globalData?.['US2Y']?.price != null
            ? Math.round((globalData['US10Y'].price - globalData['US2Y'].price) * 100) / 100
            : null,
        }}
      />

      {/* 핫테마 AI 상세 팝업 */}
      {themePopup && (
        <div className="db-theme-popup-overlay" onClick={()=>setThemePopup(null)}>
          <div className="db-theme-popup" onClick={e=>e.stopPropagation()}
            style={{'--theme-color': themePopup.theme.color}}>
            <div className="db-theme-popup-header">
              <span className="db-theme-popup-icon">{themePopup.theme.icon}</span>
              <div>
                <div className="db-theme-popup-title">{themePopup.theme.label}</div>
                <div className="db-theme-popup-sub">
                  2026 핫 테마 AI 분석
                  {themePopup.aiText?.cachedAt && (
                    <span style={{marginLeft:6,fontSize:9,color:'var(--text-dim)'}}>
                      캐시 {new Date(themePopup.aiText.cachedAt).toLocaleDateString('ko-KR')}
                    </span>
                  )}
                </div>
              </div>
              <button className="db-theme-popup-close" onClick={()=>setThemePopup(null)}>✕</button>
            </div>
            {themePopup.loading && (
              <div className="db-theme-popup-loading">
                <div style={{textAlign:'center', padding:'32px 20px'}}>
                  <div style={{fontSize:32, marginBottom:12}}>🔍</div>
                  <div style={{fontSize:14, fontWeight:600, color:'var(--text-primary)', marginBottom:6}}>
                    AI 분석 중...
                  </div>
                  <div style={{fontSize:12, color:'var(--text-dim)'}}>
                    웹 검색으로 최신 정보를 수집하고 있습니다
                  </div>
                </div>
              </div>
            )}
            {themePopup.aiText && !themePopup.loading && (
              <div className="db-theme-popup-body">
                {themePopup.aiText.summary && (
                  <div className="db-theme-popup-section">
                    <div className="db-theme-popup-label">📋 테마 배경</div>
                    <div className="db-theme-popup-text">{themePopup.aiText.summary}</div>
                  </div>
                )}
                {themePopup.aiText.catalyst && (
                  <div className="db-theme-popup-section">
                    <div className="db-theme-popup-label">⚡ 핵심 촉매제</div>
                    <div className="db-theme-popup-text">{themePopup.aiText.catalyst}</div>
                  </div>
                )}
                {themePopup.aiText.stocks?.length > 0 && (
                  <div className="db-theme-popup-section">
                    <div className="db-theme-popup-label">📈 관련 종목</div>
                    {themePopup.aiText.stocks.map((s,i) => (
                      <div key={i} className="db-theme-popup-stock">
                        <span className="db-theme-popup-stock-name">{s.name}</span>
                        <span className="db-theme-popup-stock-reason">{s.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
                {themePopup.aiText.timing && (
                  <div className="db-theme-popup-section">
                    <div className="db-theme-popup-label">⏰ 진입 타이밍</div>
                    <div className="db-theme-popup-text">{themePopup.aiText.timing}</div>
                  </div>
                )}
                {themePopup.aiText.risk && (
                  <div className="db-theme-popup-section risk">
                    <div className="db-theme-popup-label">⚠️ 핵심 리스크</div>
                    <div className="db-theme-popup-text">{themePopup.aiText.risk}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {chartItem && <GlobalChartModal
        type={chartItem.type==='forex'?'forex':'global'}
        symbol={chartItem.type==='forex'?chartItem.pair:chartItem.sym}
        name={chartItem.label} currentPrice={chartItem.price} changeRate={chartItem.changeRate}
        onClose={()=>setChartItem(null)}/>}

      {/* 업종별 종목 팝업 */}
      {sectorPopup && (
        <div className="db-sector-popup-overlay"
          onMouseDown={e=>{ if(e.target===e.currentTarget) setSectorPopup(null) }}>
          <div className="db-sector-popup-modal">
            {/* 헤더 */}
            <div className="db-sector-popup-header">
              <div className="db-sector-popup-title-row">
                <span className="db-sector-popup-title">{sectorPopup.sector.name}</span>
                {effectiveHeatmap?.[sectorPopup.sector.inds_cd] != null && (() => {
                  const r = effectiveHeatmap?.[sectorPopup.sector.inds_cd]
                  const up = r >= 0
                  return (
                    <span className={`db-sector-popup-rate ${up?'up':'down'}`}>
                      {up?'▲':'▼'} {Math.abs(r).toFixed(2)}%
                    </span>
                  )
                })()}
              </div>
              <button className="db-sector-popup-close"
                onClick={()=>setSectorPopup(null)}>✕</button>
            </div>

            {/* 대표 종목 리스트 */}
            <div className="db-sector-popup-body">
              {sectorPopup.loading ? (
                <div className="db-sector-popup-loading">
                  <div className="db-sector-popup-spinner"/>
                  종목 조회 중...
                </div>
              ) : sectorPopup.error || sectorPopup.stocks.length === 0 ? (
                <div className="db-sector-popup-empty">종목 데이터를 불러올 수 없습니다</div>
              ) : (
                <>
                  <div className="db-sector-popup-list-header">
                    <span>종목명</span>
                    <span>현재가</span>
                    <span>등락률</span>
                  </div>
                  <div className="db-sector-popup-list">
                    {sectorPopup.stocks.map((s, i) => {
                      const up = s.flu_rt >= 0
                      return (
                        <div key={s.stk_cd || i} className="db-sector-popup-row">
                          <div className="db-sector-popup-stock-info">
                            <span className="db-sector-popup-rank">{i+1}</span>
                            <div>
                              <div className="db-sector-popup-stock-name">{s.stk_nm}</div>
                              <div className="db-sector-popup-stock-code">{s.stk_cd}</div>
                            </div>
                          </div>
                          <span className="db-sector-popup-price">
                            {s.cur_prc?.toLocaleString()}
                          </span>
                          <span className={`db-sector-popup-flu ${up?'up':'down'}`}>
                            {up?'▲':'▼'} {Math.abs(s.flu_rt).toFixed(2)}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="db-sector-popup-note">
                    시가총액 상위 대표 종목 · 실시간 현재가
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
