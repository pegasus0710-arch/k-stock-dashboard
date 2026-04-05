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
  const [sparkData, setSparkData] = useState({})
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
        setSparkData(prev => ({ ...prev, [id]: raw.map(c => c.close) }))
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

  // ── AI 분석 센터 state ──────────────────────────────
  const [aiTab,      setAiTab]      = useState('brief') // brief|sector|risk|strategy
  const [aiContent,  setAiContent]  = useState(null)   // { brief, sector, risk, strategy, generatedAt, mode }
  const [aiLoading,  setAiLoading]  = useState(false)
  const [aiError,    setAiError]    = useState(null)
  const [expandCard, setExpandCard] = useState(null)   // 확장된 지수 카드 ID
  const [showDataPanel, setShowDataPanel] = useState(false)  // 상세 데이터 패널 접이식
  const timeCtx = getTimeContext()

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
    const kospi  = dashData?.KOSPI  || globalData?.['KS11']
    const kosdaq = dashData?.KOSDAQ || globalData?.['KQ11']
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
    const hotSectors = heatmapData ? Object.entries(heatmapData)
      .filter(([,v]) => v != null).sort(([,a],[,b]) => b - a).slice(0,3)
      .map(([k,v]) => { const s = HEATMAP_SECTORS.find(h => h.inds_cd === k); return s ? `${s.name}(${v >= 0 ? '+' : ''}${v?.toFixed(1)}%)` : null })
      .filter(Boolean).join(', ') : '데이터 로딩 중'
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-api-key': import.meta.env.VITE_CLAUDE_API_KEY, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          tools: [{ type:'web_search_20250305', name:'web_search' }],
          system: `당신은 20년 경력의 한국 주식시장 전문가입니다. 펀더멘털 분석과 기술적 분석을 모두 활용하며, 매크로 환경과 수급 흐름을 종합해 투자자에게 실질적인 통찰을 제공합니다.

현재 시각: ${new Date().toLocaleString('ko-KR')}
분석 모드: ${ctx.label}
집중 영역: ${ctx.focus}

현재 시장 데이터: ${marketSummary}
강세 섹터: ${hotSectors}

웹 검색으로 최신 뉴스와 이슈를 확인한 후, 반드시 아래 JSON 형식으로만 응답하세요. JSON 외 다른 텍스트 절대 금지.
{
  "headline": "오늘의 핵심 한 줄 (30자 이내)",
  "brief": "시장 현황 요약 (150자)",
  "points": ["핵심 포인트1", "핵심 포인트2", "핵심 포인트3"],
  "bullScenario": "강세 시나리오 (단기 1~5일 관점, 100자)",
  "bearScenario": "약세 시나리오 (단기 1~5일 관점, 100자)",
  "midTermView": "중기 1~3개월 전망 (100자)",
  "sectorWatch": [{"name":"섹터명","signal":"매수관심|중립|주의","reason":"이유 50자"}],
  "riskFactors": ["리스크1", "리스크2"],
  "strategy": "오늘 투자 전략 핵심 (100자)",
  "schedule": [{"time":"HH:MM","event":"이벤트명","impact":"high|medium|low"}],
  "mood": "bullish|cautious|bearish|neutral",
  "disclaimer": "이 분석은 AI 생성 참고용입니다. 투자 결정의 책임은 본인에게 있습니다."
}`,
          messages: [{ role:'user', content:`${ctx.focus} 관점에서 웹 검색 후 분석해주세요.` }]
        })
      })
      const data = await res.json()
      const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
      const jsonMatch = textBlocks.match(/\{[\s\S]*\}/)
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
    if (item.type === 'forex')   return forexData?.[item.pair] ? { price: forexData[item.pair].price, changeRate: forexData[item.pair].changeRate } : null
    if (item.id === 'KOSPI')     return dashData?.KOSPI  ? { price: dashData.KOSPI.price,  changeRate: dashData.KOSPI.changeRate  } : null
    if (item.id === 'KOSDAQ')    return dashData?.KOSDAQ ? { price: dashData.KOSDAQ.price, changeRate: dashData.KOSDAQ.changeRate } : null
    return null
  }

  // 핫 섹터 TOP3 계산
  const hotSectorList = heatmapData
    ? Object.entries(heatmapData)
        .filter(([,v]) => v != null)
        .sort(([,a],[,b]) => b - a)
        .slice(0,5)
        .map(([k,v]) => ({ sector: HEATMAP_SECTORS.find(h => h.inds_cd === k), rate: v }))
        .filter(r => r.sector)
    : []

  const moodColor = { bullish:'#16a34a', cautious:'#d97706', bearish:'#dc2626', neutral:'#64748b' }
  const moodLabel = { bullish:'강세 🟢', cautious:'주의 🟡', bearish:'약세 🔴', neutral:'중립 ⚪' }

  return (
    <div className="db-v2">
      {/* ── 에러 배너 ── */}
      {fetchError && (
        <div className="db-error-banner">⚠️ 데이터 로드 실패
          <button onClick={()=>{setFetchError(false);fetchDashboard(true)}}
            style={{marginLeft:12,fontSize:11,color:'var(--accent-mid)',background:'none',border:'none',cursor:'pointer'}}>↺ 재시도</button>
        </div>
      )}

      {/* ── 지수 스트립 ── */}
      <div className="db-strip">
        {STRIP_ITEMS.map(item => {
          const d = getStripData(item)
          const up = (d?.changeRate ?? 0) >= 0
          const rc = up ? 'var(--color-up)' : 'var(--color-down)'
          const isExpanded = expandCard === item.id
          const spark = sparkData?.[item.id]
          return (
            <div key={item.id}
              className={`db-strip-card${isExpanded?' expanded':''}${d?.changeRate > 0 ?' up':d?.changeRate < 0?' down':''}`}
              onClick={()=>setExpandCard(isExpanded ? null : item.id)}>
              <div className="db-strip-top">
                <span className="db-strip-name">{item.label}</span>
                {d?.changeRate != null && (
                  <span className="db-strip-badge" style={{background: up?'rgba(220,38,38,.1)':'rgba(29,78,216,.1)', color: rc}}>
                    {up?'▲':'▼'}{Math.abs(d.changeRate).toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="db-strip-price" style={{color: rc}}>
                {d?.price != null ? (item.id==='VIX' ? d.price.toFixed(2) : Math.round(d.price).toLocaleString()) : '—'}
              </div>
              {isExpanded && spark && (
                <div className="db-strip-expand">
                  <MiniSparkline closes={spark} color={up?'#dc2626':'#2563eb'} w={120} h={32}/>
                  {weekData?.[item.id] && d?.price && (() => {
                    const {high52, low52} = weekData[item.id]
                    if (high52 <= low52) return null
                    const pct = Math.min(100, Math.max(0, (d.price - low52)/(high52 - low52)*100))
                    return (
                      <div className="db-strip-gauge">
                        <div className="db-strip-gauge-track">
                          <div className="db-strip-gauge-fill" style={{width:`${pct}%`}}/>
                        </div>
                        <span className="db-strip-gauge-label">52주 {Math.round(pct)}%</span>
                      </div>
                    )
                  })()}
                </div>
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

      {/* ── 바디: 좌측 패널 + 메인 ── */}
      <div className="db-body">

        {/* 좌측 패널 */}
        <aside className="db-left">

          {/* 시장 체온계 — 항상 표시 (직전 장 기준) */}
          {(dashData?.KOSPI?.rising || dashData?.KOSPI?.fall) && (() => {
            const rising = Number(dashData.KOSPI.rising || 0) + Number(dashData.KOSDAQ?.rising || 0)
            const fall   = Number(dashData.KOSPI.fall   || 0) + Number(dashData.KOSDAQ?.fall   || 0)
            const total  = rising + fall || 1
            const upPct  = Math.round(rising / total * 100)
            return (
              <div className="db-left-section">
                <div className="db-left-title">🌡️ 시장 체온계
                  <span className="db-left-badge">{isOpen?'장중':isAfter?'시간외':'직전장'}</span>
                </div>
                <div className="db-breadth-bar">
                  <div className="db-breadth-up"   style={{width:`${upPct}%`}}/>
                  <div className="db-breadth-down" style={{width:`${100-upPct}%`}}/>
                </div>
                <div className="db-breadth-labels">
                  <span style={{color:'var(--color-up)'}}>↑ {rising.toLocaleString()}</span>
                  <span style={{color:'var(--text-dim)',fontSize:10}}>{upPct}% 상승</span>
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

          {/* 핫 섹터 */}
          {hotSectorList.length > 0 && (
            <div className="db-left-section">
              <div className="db-left-title">🔥 섹터 동향</div>
              {hotSectorList.map(({sector, rate}) => (
                <div key={sector.id} className="db-hot-sector-row" onClick={()=>openSectorPopup(sector)}>
                  <span className="db-hot-sector-name">{sector.name}</span>
                  <span className="db-hot-sector-rate" style={{color: rate>=0?'var(--color-up)':'var(--color-down)'}}>
                    {rate>=0?'+':''}{rate.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 히어로 차트 (접이식) */}
          <div className="db-left-section db-left-hero">
            <div className="db-left-title">📈 차트
              <select className="db-left-sel" value={selId} onChange={e=>setSelId(e.target.value)}>
                {SECTOR_GROUPS.flatMap(g => g.items.filter(i=>i.type==='global'||i.type==='forex')).map(it=>(
                  <option key={it.id} value={it.id}>{it.label}</option>
                ))}
              </select>
            </div>
            <HeroChart selId={selId} onSelChange={setSelId}
              dashData={dashData} globalData={globalData} forexData={forexData}
              onWeekRange={handleWeekRange} onSparkData={handleSparkData}/>
          </div>

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

                {/* ── 브리핑 탭 ── */}
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
                  {aiContent.points?.length > 0 && (
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
                            <span className="db-ai-sch-event">{s.event}</span>
                            <span className={`db-ai-sch-impact impact-${s.impact}`}>{s.impact}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>)}

                {/* ── 시나리오 탭 ── */}
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

                {/* ── 섹터 탭 ── */}
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

                {/* ── 전략 탭 ── */}
                {aiTab === 'strategy' && (<>
                  {aiContent.strategy && (
                    <div className="db-ai-section">
                      <div className="db-ai-section-title">💡 오늘의 투자 전략</div>
                      <div className="db-ai-strategy-body" style={{fontSize:14,lineHeight:1.8}}>
                        {aiContent.strategy}
                      </div>
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


      {/* ── 데이터 패널 (접이식) ── */}
      <div className="db-data-wrap">
        <button className="db-data-toggle" onClick={()=>setShowDataPanel(v=>!v)}>
          <span>📋 상세 지수 데이터 <span style={{fontSize:10,color:'var(--text-dim)',fontWeight:400}}>· {dataLabel}</span></span>
          <span className="db-data-toggle-arr">{showDataPanel ? '▲' : '▼'}</span>
        </button>
        {showDataPanel && (
          <div className="db-data-panel">
        {SECTOR_GROUPS.map((group, gi)=>{
          const tipPos = gi % 3 === 0 ? 'right' : 'left'

          // ── 해외지수 그룹: 2×2 메인 카드(52주 게이지) + 미니 아이콘 행 ──
          if (group.id === 'global') {
            const makeSparkSvg = (id, color) => {
              const raw = sparkData?.[id]
              if (!raw || raw.length < 2) return null
              const closes = raw.filter(v => typeof v === 'number' && isFinite(v))
              if (closes.length < 2) return null
              const W=120, H=28, pad=2
              const mn=Math.min(...closes), mx=Math.max(...closes), rng=mx-mn||1
              const px=i => pad + (i/(closes.length-1))*(W-pad*2)
              const py=v  => H-pad-(v-mn)/rng*(H-pad*2)
              const validPts = closes
                .map((v,i) => { const x=px(i), y=py(v); return isFinite(x)&&isFinite(y)?`${x.toFixed(1)},${y.toFixed(1)}`:null })
                .filter(Boolean)
              if (validPts.length < 2) return null
              const pts  = validPts.join(' ')
              const apts = `${pad},${H-pad} ${pts} ${W-pad},${H-pad}`
              const lastX = px(closes.length-1), lastY = py(closes[closes.length-1])
              if (!isFinite(lastX) || !isFinite(lastY)) return null
              return (
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block',margin:'4px 0 2px'}}>
                  <defs>
                    <linearGradient id={`gsg-${id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity="0.15"/>
                      <stop offset="100%" stopColor={color} stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  <polygon points={apts} fill={`url(#gsg-${id})`}/>
                  <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
                  <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="2.5" fill={color} stroke="white" strokeWidth="1.5"/>
                </svg>
              )
            }
            return (
              <div key={group.id} className="db-card-group" style={{'--group-accent':group.accent}}>
                <div className="db-card-group-label" style={{color:group.accent}}>{group.label}</div>
                {/* 메인 2×2 카드 */}
                <div className="db-global-grid">
                  {group.items.map(item=>{
                    const d         = getItemData(item, dashData, globalData, forexData)
                    const rate      = d?.changeRate
                    const up        = (rate??0) > 0
                    const badge     = getMarketBadge(item, d)
                    const isClosed  = badge?.cls === 'closed'
                    const dateLabel = getItemDateLabel(item, d)
                    const active    = selId === item.id
                    const spark     = makeSparkSvg(item.id, up ? '#DC2626' : '#1D4ED8')
                    // 52주 고저 게이지
                    const wk = weekData?.[item.id]
                    const week52 = wk && d?.price && wk.high52 > wk.low52 ? (() => {
                      const pct = Math.min(100, Math.max(0, (d.price - wk.low52) / (wk.high52 - wk.low52) * 100))
                      return (
                        <div className="db-52w-wrap">
                          <div className="db-52w-track">
                            <div className="db-52w-fill" style={{width:`${pct}%`}}/>
                            <div className="db-52w-thumb" style={{left:`${pct}%`}}/>
                          </div>
                          <div className="db-52w-labels">
                            <span>저 {Math.round(wk.low52).toLocaleString()}</span>
                            <span style={{color:'var(--accent-mid)'}}>▲ 52주 {Math.round(pct)}%</span>
                            <span>고 {Math.round(wk.high52).toLocaleString()}</span>
                          </div>
                        </div>
                      )
                    })() : null
                    return (
                      <button key={item.id}
                        className={`db-idx-card ${active?'active':''} ${isClosed?'closed':''}`}
                        onClick={()=>setSelId(item.id)}>
                        <div className="db-idx-top-row">
                          <span className="db-idx-name">{item.label}</span>
                          <span style={{display:'flex',alignItems:'center',gap:3}}>
                            <TooltipIcon id={item.id} tipPosition="left"/>
                            {badge&&<span className={`db-idx-badge db-idx-badge--${badge.cls}`}>
                              {badge.cls==='live'&&<span className="db-idx-live-dot"/>}{badge.label}
                            </span>}
                          </span>
                        </div>
                        {globalLoading&&!d ? <Skeleton w="70%" h={14}/> :
                         d?.price!=null ? (
                          <>
                            <div className="db-idx-price">{Math.round(d.price).toLocaleString()}</div>
                            {rate!=null&&<div className={`db-idx-rate-badge ${up?'up':'down'}`}>
                              {up?'▲':'▼'} {Math.abs(rate).toFixed(2)}%
                            </div>}
                            {spark}
                            {week52}
                            {dateLabel&&<div style={{textAlign:'right',marginTop:4}}><span className="db-date-badge">{dateLabel}</span></div>}
                          </>
                        ) : <div className="db-idx-na">—</div>}
                      </button>
                    )
                  })}
                </div>
                {/* 미니 아이콘 행 — 상해/대만/DAX */}
                {group.miniItems && (
                  <div className="db-global-mini-row">
                    {group.miniItems.map(mini=>{
                      const d    = globalData?.[mini.sym]
                      const rate = d?.changeRate
                      const up   = (rate??0) > 0
                      return (
                        <div key={mini.id} className="db-global-mini-item">
                          <span className="db-global-mini-label" style={{color: mini.color}}>{mini.label}</span>
                          {d?.price!=null ? (
                            <>
                              <span className="db-global-mini-price">{Math.round(d.price).toLocaleString()}</span>
                              {rate!=null&&<span className="db-global-mini-rate" style={{color: up?'var(--color-up)':'var(--color-down)'}}>
                                {up?'▲':'▼'}{Math.abs(rate).toFixed(2)}%
                              </span>}
                            </>
                          ) : <span className="db-global-mini-na">—</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }
          // ── 환율 그룹: USD 와이드 + 나머지 3개 소형 ──
          if (group.id === 'forex') {
            const usdItem = group.items.find(it=>it.id==='FX_USD')
            const otherItems = group.items.filter(it=>it.id!=='FX_USD')
            const usdData = usdItem ? getItemData(usdItem, dashData, globalData, forexData) : null
            return (
              <div key={group.id} className="db-card-group" style={{'--group-accent':group.accent}}>
                <div className="db-card-group-label" style={{color:group.accent}}>{group.label}</div>
                {/* USD/KRW — 와이드 카드 */}
                {usdItem && (
                  <button
                    className={`db-idx-card db-forex-wide ${selId===usdItem.id?'active':''} ${usdData?.price>=1500?'db-idx-card--warn-orange':''}`}
                    onClick={()=>setSelId(usdItem.id)}>
                    <div className="db-idx-top-row">
                      <span className="db-idx-name">{usdItem.label}</span>
                      <span style={{display:'flex',alignItems:'center',gap:3}}>
                        <TooltipIcon id={usdItem.id} tipPosition="left"/>
                      </span>
                    </div>
                    {usdData?.price!=null ? (
                      <>
                        <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:2}}>
                          <div className="db-idx-price">{Math.round(usdData.price).toLocaleString()}</div>
                          {usdData.changeRate!=null && (
                            <div className={`db-idx-rate-badge ${usdData.changeRate>=0?'up':'down'}`}>
                              {usdData.changeRate>=0?'▲':'▼'} {Math.abs(usdData.changeRate).toFixed(2)}%
                            </div>
                          )}
                        </div>
                        <GaugeBar id={usdItem.id} price={usdData.price}/>
                        {getItemDateLabel(usdItem, usdData) && (
                          <div style={{textAlign:'right',marginTop:4}}>
                            <span className="db-date-badge">{getItemDateLabel(usdItem, usdData)}</span>
                          </div>
                        )}
                      </>
                    ) : <div className="db-idx-na">—</div>}
                  </button>
                )}
                {/* JPY/CNY/EUR — 소형 카드 3개 */}
                <div className="db-forex-small-grid">
                  {otherItems.map(item=>{
                    const d    = getItemData(item, dashData, globalData, forexData)
                    const rate = d?.changeRate
                    const up   = (rate ?? 0) > 0
                    const dateLabel = getItemDateLabel(item, d)
                    return (
                      <button key={item.id}
                        className={`db-idx-card db-forex-small ${selId===item.id?'active':''}`}
                        style={{display:'flex',flexDirection:'column',alignItems:'center'}}
                        onClick={()=>setSelId(item.id)}>
                        <div className="db-idx-top-row">
                          <span className="db-idx-name" style={{fontSize:10}}>{item.label}</span>
                          <TooltipIcon id={item.id} tipPosition="left"/>
                        </div>
                        {d?.price!=null ? (
                          <>
                            <div className="db-idx-price" style={{fontSize:14}}>
                              {Math.round(d.price).toLocaleString()}
                            </div>
                            {rate!=null && (
                              <div className={`db-idx-rate-badge ${up?'up':'down'}`}>
                                {up?'▲':'▼'} {Math.abs(rate).toFixed(2)}%
                              </div>
                            )}
                            {dateLabel && <div style={{textAlign:'right',marginTop:4}}><span className="db-date-badge">{dateLabel}</span></div>}
                          </>
                        ) : <div className="db-idx-na">—</div>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          }

          // ── 원자재 그룹: 도트 히트맵 렌더링 ──
          if (group.id === 'commodity') return (
            <div key={group.id} className="db-card-group" style={{'--group-accent':group.accent}}>
              <div className="db-card-group-label" style={{color:group.accent}}>{group.label}</div>
              <div className="db-commodity-grid">
                {group.items.map(item=>{
                  const d    = getItemData(item, dashData, globalData, forexData)
                  const rate = d?.changeRate
                  const up   = (rate ?? 0) > 0
                  const dotColor = getCommodityDotColor(rate)
                  const dateLabel = getItemDateLabel(item, d)
                  // 스파크라인
                  const makeCommoditySpark = () => {
                    const raw = sparkData?.[item.id]
                    if (!raw || raw.length < 2) return null
                    const closes = raw.filter(v => typeof v === 'number' && isFinite(v))
                    if (closes.length < 2) return null
                    const W=80, H=20, pad=1
                    const mn=Math.min(...closes), mx=Math.max(...closes), rng=mx-mn||1
                    const px=i => pad+(i/(closes.length-1))*(W-pad*2)
                    const py=v  => H-pad-(v-mn)/rng*(H-pad*2)
                    const validPts = closes.map((v,i)=>{const x=px(i),y=py(v);return isFinite(x)&&isFinite(y)?`${x.toFixed(1)},${y.toFixed(1)}`:null}).filter(Boolean)
                    if (validPts.length < 2) return null
                    const color = up ? '#DC2626' : '#1D4ED8'
                    return (
                      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block',marginTop:4}}>
                        <polyline points={validPts.join(' ')} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" opacity="0.8"/>
                      </svg>
                    )
                  }
                  return (
                    <div key={item.id} className="db-commodity-dot-card"
                      onClick={()=>setSelId(item.id)} style={{cursor:'pointer'}}>
                      <div className="db-commodity-tip">
                        <TooltipIcon id={item.id} tipPosition="right"/>
                      </div>
                      <div className="db-commodity-circle" style={{background: dotColor}}>
                        {item.label.slice(0,3).toUpperCase()}
                      </div>
                      <span className="db-commodity-name">{item.label}</span>
                      {globalLoading&&!d
                        ? <Skeleton w="50%" h={11}/>
                        : d?.price!=null
                          ? <>
                              <span className="db-commodity-price">
                                {['WTI','BRENT','GOLD','SILVER','COPPER'].includes(item.id)
                                  ? `$${Math.round(d.price).toLocaleString()}`
                                  : `${Math.round(d.price).toLocaleString()}${item.unit||''}`
                                }
                              </span>
                              {rate!=null && (
                                <span className="db-commodity-rate" style={{color: up?'var(--color-up)':'var(--color-down)'}}>
                                  {up?'▲':'▼'}{Math.abs(rate).toFixed(2)}%
                                </span>
                              )}
                              {makeCommoditySpark()}
                              {dateLabel && <div style={{textAlign:'right',marginTop:4}}><span className="db-date-badge">{dateLabel}</span></div>}
                            </>
                          : <span style={{fontSize:10,color:'var(--text-dim)'}}>—</span>
                      }
                    </div>
                  )
                })}
              </div>
            </div>
          )

          // ── 심리·달러 그룹: VIX(넓게) + DXY(게이지 포함) ──
          if (group.id === 'sentiment') return (
            <div key={group.id} className="db-card-group" style={{'--group-accent':group.accent}}>
              <div className="db-card-group-label" style={{color:group.accent}}>{group.label}</div>
              <div className="db-sentiment-grid">
                {group.items.map(item=>{
                  const d        = getItemData(item, dashData, globalData, forexData)
                  const rate     = d?.changeRate
                  const up       = (rate??0) > 0
                  const badge    = getMarketBadge(item, d)
                  const isClosed = badge?.cls === 'closed'
                  const active   = selId === item.id
                  const dateLabel = getItemDateLabel(item, d)
                  const warnClass = getWarnClass(item, d)
                  return (
                    <button key={item.id}
                      className={`db-idx-card ${item.id==='VIX'?'db-sentiment-vix':'db-sentiment-dxy'} ${active?'active':''} ${isClosed?'closed':''} ${warnClass}`}
                      onClick={()=>setSelId(item.id)}>
                      <div className="db-idx-top-row">
                        <span className="db-idx-name">{item.label}</span>
                        <span style={{display:'flex',alignItems:'center',gap:3}}>
                          <TooltipIcon id={item.id} tipPosition="left"/>
                          {badge&&<span className={`db-idx-badge db-idx-badge--${badge.cls}`}>
                            {badge.cls==='live'&&<span className="db-idx-live-dot"/>}{badge.label}
                          </span>}
                        </span>
                      </div>
                      {globalLoading&&!d ? <Skeleton w="70%" h={14}/> :
                       d?.price!=null ? (
                        <>
                          <div className="db-idx-price">
                            {d.price.toFixed(2)}{item.unit||''}
                          </div>
                          {rate!=null&&<div className={`db-idx-rate-badge ${up?'up':'down'}`}>
                            {up?'▲':'▼'} {Math.abs(rate).toFixed(2)}%
                          </div>}
                          {GAUGE_CONFIG[item.id] && <GaugeBar id={item.id} price={d.price}/>}
                          {dateLabel&&<div style={{textAlign:'right',marginTop:4}}><span className="db-date-badge">{dateLabel}</span></div>}
                        </>
                      ) : <div className="db-idx-na">—</div>}
                    </button>
                  )
                })}
              </div>
            </div>
          )

          // ── 나머지 그룹: 기존 카드 렌더링 ──
          return (
          <div key={group.id}
            className="db-card-group"
            style={{'--group-accent':group.accent, ...(group.id==='domestic'?{alignSelf:'start'}:{})}}>
            <div className="db-card-group-label" style={{color:group.accent}}>{group.label}</div>
            <div className={`db-card-group-items ${group.id==='domestic'?'domestic-items':group.id==='bond'?'bond-items':''}`}>
              {group.items.map(item=>{
                if (item.type==='divider') return (
                  <div key={item.id} className="db-card-group-divider">{item.label}</div>
                )
                const d        = getItemData(item, dashData, globalData, forexData)
                // KOSPI/KOSDAQ: sparkData 마지막 2봉으로 등락률 직접 계산
                // (globalData.changeRate는 스파크 기간 전체 수익률이 섞일 수 있음)
                const displayRate = (() => {
                  if (item.id === 'KOSPI' || item.id === 'KOSDAQ') {
                    const spark = sparkData?.[item.id]
                    if (spark && spark.length >= 2) {
                      const prev = spark[spark.length - 2]
                      const cur  = spark[spark.length - 1]
                      if (prev > 0 && cur > 0) return (cur - prev) / prev * 100
                    }
                  }
                  return d?.changeRate ?? null
                })()
                const rate     = displayRate
                const up       = (rate ?? 0) > 0
                const badge    = getMarketBadge(item, d)
                const isClosed = badge?.cls === 'closed'
                const active   = selId === item.id
                const dateLabel = getItemDateLabel(item, d)
                const warnClass = getWarnClass(item, d)
                return (
                  <button key={item.id}
                    className={`db-idx-card ${active?'active':''} ${isClosed?'closed':''} ${item.type==='spread'?'spread-card':''} ${warnClass}`}
                    onClick={()=>(item.type==='global'||item.type==='forex') && setSelId(item.id)}>
                <div className="db-idx-top-row">
                      <span className="db-idx-name">{item.label}</span>
                      <span style={{display:'flex',alignItems:'center',gap:3}}>
                        <TooltipIcon id={item.id} tipPosition={tipPos}/>
                        {badge && (
                          <span className={`db-idx-badge db-idx-badge--${badge.cls}`}>
                            {badge.cls==='live' && <span className="db-idx-live-dot"/>}
                            {badge.label}
                          </span>
                        )}
                        {/* 차트 분석 아이콘 — KOSPI/KOSDAQ 전용 */}
                        {(item.id==='KOSPI'||item.id==='KOSDAQ') && d?.price!=null && (
                          <span
                            className="db-idx-chart-icon"
                            title="차트 분석"
                            onClick={e=>{
                              e.stopPropagation()
                              setChartItem({type:'global', sym:item.sym, label:item.label, price:d.price, changeRate:rate})
                            }}>
                            📈
                          </span>
                        )}
                      </span>
                    </div>
                    {globalLoading&&!d ? <Skeleton w="70%" h={14}/> :
                     d?.price!=null ? (
                      <>
                        <div className="db-idx-price" style={d.isSpread?{color:d.inverted?'var(--color-down)':d.price<0.5?'#d97706':'var(--color-up)'}:{}}>
                          {d.isSpread
                            ? `${d.price>=0?'+':''}${d.price.toFixed(2)}%`
                            : item.unit==='%'
                              ? `${d.price.toFixed(2)}${item.unit}`
                              : `${Math.round(d.price).toLocaleString()}${item.unit||''}`
                          }
                        </div>
                        {d.isSpread
                          ? <div className="db-idx-spread-label" style={{color:d.inverted?'var(--color-down)':d.price<0.5?'#d97706':'#16a34a'}}>
                              {d.inverted?'⚠️ 역전 (경기침체 경보)':d.price<0.5?'⚡ 주의 구간':'✅ 정상'}
                            </div>
                          : rate!=null
                            ? <div className={`db-idx-rate-badge ${up?'up':'down'}`}>
                                {up?'▲':'▼'} {Math.abs(rate).toFixed(2)}%
                              </div>
                            : null
                        }
                        {GAUGE_CONFIG[item.id] && <GaugeBar id={item.id} price={d.price}/>}
                        {/* KOSPI/KOSDAQ 전용 — 스파크라인 + 52주 게이지 */}
                        {(item.id==='KOSPI'||item.id==='KOSDAQ') && (
                          <div className="db-kospi-extra">
                            {/* 스파크라인 */}
                            {sparkData?.[item.id]?.length > 1 && (() => {
                              const raw = sparkData[item.id]
                              const closes = raw.filter(v => typeof v === 'number' && isFinite(v))
                              if (closes.length < 2) return null
                              const W=160, H=32, pad=2
                              const mn = Math.min(...closes), mx = Math.max(...closes)
                              const rng = mx - mn || 1
                              const px = i => pad + (i/(closes.length-1))*(W-pad*2)
                              const py = v => H-pad-(v-mn)/rng*(H-pad*2)
                              const validPts = closes.map((v,i)=>{const x=px(i),y=py(v);return isFinite(x)&&isFinite(y)?`${x.toFixed(1)},${y.toFixed(1)}`:null}).filter(Boolean)
                              if (validPts.length < 2) return null
                              const pts = validPts.join(' ')
                              const color = closes[closes.length-1] >= closes[0] ? '#22c55e' : '#ef4444'
                              const apts = `${pad},${H-pad} ${pts} ${W-pad},${H-pad}`
                              const lastX = px(closes.length-1), lastY = py(closes[closes.length-1])
                              if (!isFinite(lastX)||!isFinite(lastY)) return null
                              return (
                                <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block',margin:'6px 0 2px'}}>
                                  <defs>
                                    <linearGradient id={`sg-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor={color} stopOpacity="0.15"/>
                                      <stop offset="100%" stopColor={color} stopOpacity="0"/>
                                    </linearGradient>
                                  </defs>
                                  <polygon points={apts} fill={`url(#sg-${item.id})`}/>
                                  <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
                                  <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="2.5" fill={color} stroke="white" strokeWidth="1.5"/>
                                </svg>
                              )
                            })()}
                            {/* 52주 고저 게이지 */}
                            {weekData?.[item.id] && (() => {
                              const w = weekData[item.id]
                              const low = w.low52, high = w.high52
                              if (!low||!high||high<=low) return null
                              const pct = Math.min(100, Math.max(0, (d.price-low)/(high-low)*100))
                              return (
                                <div className="db-52w-wrap">
                                  <div className="db-52w-track">
                                    <div className="db-52w-fill" style={{width:`${pct}%`}}/>
                                    <div className="db-52w-thumb" style={{left:`${pct}%`}}/>
                                  </div>
                                  <div className="db-52w-labels">
                                    <span>저 {Math.round(low).toLocaleString()}</span>
                                    <span style={{color:'var(--accent-mid)'}}>▲ 52주 {Math.round(pct)}%</span>
                                    <span>고 {Math.round(high).toLocaleString()}</span>
                                  </div>
                                </div>
                              )
                            })()}
                            {/* 기준일 */}
                            {dateLabel && <div style={{textAlign:'right',marginTop:4}}><span className="db-date-badge">{dateLabel}</span></div>}
                          </div>
                        )}
                        {/* 일반 카드 기준일 */}
                        {item.id!=='KOSPI' && item.id!=='KOSDAQ' && dateLabel &&
                          <div style={{textAlign:'right',marginTop:4}}><span className="db-date-badge">{dateLabel}</span></div>
                        }
                      </>
                    ) : <div className="db-idx-na">—</div>}
                  </button>
                )
              })}
            </div>
            {/* 국내지수 그룹 하단 — 외인/기관 수급 플로우 바 */}
            {group.id === 'domestic' && (
              <div className="db-flow-section">
                <div className="db-flow-header">
                  <span className="db-flow-title">수급 (코스피+코스닥 합산)</span>
                  <div className="tip-wrap" style={{position:'relative',display:'inline-flex'}}>
                    <TooltipIcon id="FLOW" tipPosition="right"/>
                  </div>
                  {flowData && <span className="db-date-badge" style={{marginLeft:'auto'}}>{isOpen ? '장중 기준' : isAfter ? '장마감 기준' : '전일 기준'}</span>}
                </div>
                {(()=>{
                  const f = flowData?.total
                  // 장중에만 allZero 체크 — 장 마감 후엔 마지막 수급값 그대로 표시
                  const allZero = f && isOpen && f.foreign===0 && f.institution===0 && f.individual===0
                  if (!flowData || allZero) return (
                    <div className="db-flow-empty">
                      {isOpen ? '수급 데이터 로딩 중...' : isAfter ? '수급 데이터 로딩 중...' : '장 시작 후 표시됩니다'}
                    </div>
                  )
                  return (
                    <div className="db-flow-rows">
                      {[
                        {label:'외국인', val:f?.foreign     ?? 0},
                        {label:'기관',   val:f?.institution ?? 0},
                        {label:'개인',   val:f?.individual  ?? 0},
                      ].map(({label, val})=>{
                        const abs    = Math.abs(val)
                        const maxAbs = Math.max(
                          Math.abs(f?.foreign     ?? 0),
                          Math.abs(f?.institution ?? 0),
                          Math.abs(f?.individual  ?? 0),
                          1
                        )
                        const pct   = Math.min(100, (abs / maxAbs) * 100)
                        const isBuy = val >= 0
                        return (
                          <div key={label} className="db-flow-row">
                            <span className="db-flow-label">{label}</span>
                            <div className="db-flow-bar-wrap">
                              {/* 좌측 절반: 매도(빨강) — 오른쪽에서 채워짐 */}
                              <div className="db-flow-half db-flow-half-left">
                                {!isBuy && (
                                  <div className="db-flow-fill"
                                    style={{width:`${pct}%`, background:'#DC2626'}}/>
                                )}
                              </div>
                              {/* 중앙 0 기준선 */}
                              <div className="db-flow-center-line"/>
                              {/* 우측 절반: 매수(파랑) — 왼쪽에서 채워짐 */}
                              <div className="db-flow-half db-flow-half-right">
                                {isBuy && (
                                  <div className="db-flow-fill"
                                    style={{width:`${pct}%`, background:'#1D4ED8'}}/>
                                )}
                              </div>
                            </div>
                            <span className="db-flow-val" style={{color:isBuy?'#1D4ED8':'#DC2626'}}>
                              {isBuy?'+':''}{Math.abs(val)>=10000
                                ? `${(val/10000).toFixed(1)}조`
                                : Math.abs(val)>=1000
                                ? `${Math.round(val/1000).toLocaleString()}천억`
                                : `${Math.round(val).toLocaleString()}억`}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
          )
        })}
      </div>
          </div>
        )}
      </div>

      {/* ── 히트맵 섹션 (기존 유지) ── */
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
            const rate = heatmapData?.[sector.inds_cd] ?? null
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
                {heatmapData?.[sectorPopup.sector.inds_cd] != null && (() => {
                  const r = heatmapData[sectorPopup.sector.inds_cd]
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
