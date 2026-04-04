// src/pages/DashboardPage.jsx — v5 (컴포넌트 분리 후 경량화)
import { useState, useCallback, useEffect } from 'react'
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

  const kstStatus = getKstStatus()
  const isOpen    = kstStatus === 'open'
  const isAfter   = kstStatus === 'after'
  const st        = ST_MAP[kstStatus] || ST_MAP.closed

  return (
    <div className="dashboard">
      {/* 헤더 */}
      <div className="dash-header">
        <div className="dash-header-row">
          <div>
            <h1 className="dash-title">시장 대시보드</h1>
            <p className="dash-date">{getTodayStr()}{lastFetch&&<span style={{color:'var(--text-dim)'}}> · {lastFetch} 기준</span>}</p>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <button className="db-guide-btn" onClick={()=>setShowGuide(true)}>지수 가이드</button>
            <button className="db-briefing-btn" onClick={()=>setShowBriefing(true)}>AI 브리핑</button>
            <div className="db-status-badge" style={{background:st.color+'15',color:st.color,borderColor:st.color+'30'}}>
              {st.dot&&<span className="db-status-dot" style={{background:st.color}}/>}{st.label}
            </div>
            <button className="btn-outline db-refresh-btn" disabled={loading} onClick={refresh}>↺</button>
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="db-error-banner">⚠️ 데이터 로드 실패
          <button onClick={()=>{setFetchError(false);fetchDashboard(true)}}
            style={{marginLeft:12,fontSize:11,color:'var(--accent-mid)',background:'none',border:'none',cursor:'pointer'}}>↺ 재시도</button>
        </div>
      )}

      {/* 영역 1: 상단 인터랙티브 차트 */}
      <div className="db-chart-section">
        <div className="db-selector-row">
          {SECTOR_GROUPS.map((group,gi)=>(
            <div key={group.id} style={{display:'flex',alignItems:'center',gap:4}}>
              {gi>0 && <div className="db-sel-divider"/>}
              <div className="db-sel-group">
                {group.items.filter(it=>it.type==='global'||it.type==='forex').map(it=>(
                  <button key={it.id}
                    className={`db-sel-btn ${selId===it.id?'active':''}`}
                    onClick={()=>setSelId(it.id)}>{it.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <HeroChart selId={selId} onSelChange={setSelId}
          dashData={dashData} globalData={globalData} forexData={forexData}
          onWeekRange={handleWeekRange} onSparkData={handleSparkData}/>
      </div>

      {/* 영역 2: 중단 지수 카드 그리드 */}
      <div className="db-cards-section">
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

      {/* 영역 3: 업종 히트맵 */}
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
              {isOpen ? '실시간' : isAfter ? '시간외' : '전일 종가'} · {getPrevTradingDay()}
            </span>
          </span>
        </div>
        <div className="db-heatmap-grid">
          {HEATMAP_SECTORS.map(sector=>{
            // 실제 API 데이터 — 업종코드로 등락률 조회
            const rate = heatmapData?.[sector.inds_cd] ?? null
            // 장외 시간에 0% 값은 의미 없으므로 null 처리
            const effectiveRate = (!isOpen && !isAfter && rate === 0) ? null : rate
            const { bg, neutral } = getHeatmapColor(effectiveRate)
            return (
              <div key={sector.id}
                className={`db-heatmap-cell${neutral?' neutral':''}`}
                style={{background: bg, opacity: (!isOpen && effectiveRate==null) ? 0.55 : 1}}
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
        {!isOpen && !isAfter && (
          <div className="db-heatmap-footer-note">
            📌 장 마감 시간 · 다음 거래일 시작 시 업데이트됩니다
          </div>
        )}
      </div>

      <div className="dash-footer-note">
        ✅ KIS API · {isOpen?'장중 30초':isAfter?'시간외 2분':'장외 5분'} 자동 갱신
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
