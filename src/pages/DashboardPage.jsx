// src/pages/DashboardPage.jsx — v5 (컴포넌트 분리 후 경량화)
import { useState, useCallback } from 'react'
import { rateColor, getTodayStr, getKstStatus, isMarketOpen, isUSMarketOpen, getSymbolMarketStatus } from '../utils/format'
import { SECTOR_GROUPS, ALL_ITEMS, GAUGE_CONFIG, HEATMAP_SECTORS, getHeatmapColor } from '../constants/dashboardData'
import { GaugeBar, TooltipIcon } from '../components/ui/GaugeBar'
import GuideModal        from '../components/dashboard/GuideModal'
import GlobalChartModal  from '../components/GlobalChartModal'
import useDashboard      from '../hooks/useDashboard'
import HeroChart         from '../components/dashboard/HeroChart'
import AiBriefing        from '../components/dashboard/AiBriefing'
import './DashboardPage.css'

function getItemData(item, dashData, globalData, forexData, cbRates) {
  if (item.type==='global') return globalData?.[item.sym] || null
  if (item.type==='forex')  { const d=forexData?.[item.pair]; return d?{price:d.price,changeRate:d.changeRate,change:d.change,marketState:'CURRENCY'}:null }
  if (item.type==='cb')     { const d=cbRates?.[item.cbKey]; return d?{price:d.rate,changeRate:null,isCB:true,date:d.date}:null }
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

// 카드 경고 클래스 — VIX 30↑, USD/KRW 1500↑
function getWarnClass(item, d) {
  if (!d || d.price == null) return ''
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
  if (d.isCB && d.date) return d.date          // 기준금리: API 날짜
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

  if (KR_IDS.includes(item.id))  return kstStr
  if (US_IDS.includes(item.id))  return estStr
  if (EU_IDS.includes(item.id))  return cetStr
  if (JP_IDS.includes(item.id))  return jstStr
  if (CN_IDS.includes(item.id))  return cstStr
  if (FX_IDS.includes(item.id))  return kstStr
  if (item.type === 'spread')     return estStr
  return null
}

function Skeleton({ w='60%', h=14 }) {
  return <div className="db-skeleton" style={{width:w,height:h,borderRadius:3}}/>
}

const ST_MAP = {
  open:      {label:'정규장 운영중', color:'#16a34a', dot:true},
  premarket: {label:'장 시작 전',   color:'#d97706', dot:false},
  after:     {label:'시간외 거래',  color:'#7c3aed', dot:true},
  holiday:   {label:'휴장일',       color:'#64748b', dot:false},
  closed:    {label:'장 마감',      color:'#64748b', dot:false},
}

export default function DashboardPage() {
  const { dashData, globalData, forexData, cbRates, flowData, weekData: apiWeekData, loading, globalLoading,
          fetchError, setFetchError, lastFetch, refresh, fetchDashboard } = useDashboard()

  // 52주 고저 — HeroChart candles에서 계산 (별도 API 불필요)
  const [weekData,  setWeekData]  = useState({})
  const [sparkData, setSparkData] = useState({})
  const handleWeekRange = useCallback((id, high, low) => {
    const key = id === 'KOSPI' ? 'KOSPI' : id === 'KOSDAQ' ? 'KOSDAQ' : null
    if(key) setWeekData(prev => ({...prev, [key]: {high52: high, low52: low}}))
  }, [])
  const handleSparkData = useCallback((id, closes) => {
    const key = id === 'KOSPI' ? 'KOSPI' : id === 'KOSDAQ' ? 'KOSDAQ' : null
    if(key) setSparkData(prev => ({...prev, [key]: closes}))
  }, [])

  const [selId,       setSelId]       = useState('KOSPI')
  const [showGuide,   setShowGuide]   = useState(false)
  const [showBriefing,setShowBriefing]= useState(false)
  const [chartItem,   setChartItem]   = useState(null)

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
            <button className="db-guide-btn" onClick={()=>setShowGuide(true)}>📖 지수 가이드</button>
            <button className="db-briefing-btn" onClick={()=>setShowBriefing(true)}>🤖 AI 브리핑</button>
            <div className="db-status-badge" style={{background:st.color+'15',color:st.color,borderColor:st.color+'30'}}>
              {st.dot&&<span className="db-status-dot" style={{background:st.color}}/>}{st.label}
            </div>
            <button className="btn-outline db-refresh-btn" disabled={loading} onClick={refresh}>⟳</button>
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

          // ── 해외지수 그룹: 콤팩트 리스트 렌더링 ──
          if (group.id === 'global') return (
            <div key={group.id} className="db-card-group" style={{'--group-accent':group.accent}}>
              <div className="db-card-group-label" style={{color:group.accent}}>{group.label}</div>
              <div className="db-compact-list">
                {group.items.filter(it=>it.type!=='divider').map(item=>{
                  const d    = getItemData(item, dashData, globalData, forexData, cbRates)
                  const rate = d?.changeRate
                  const up   = (rate ?? 0) > 0
                  const badge = getMarketBadge(item, d)
                  const dateLabel = getItemDateLabel(item, d)
                  const active = selId === item.id
                  return (
                    <div key={item.id}
                      className={`db-compact-row ${active?'active':''}`}
                      onClick={()=>item.type==='global'&&setSelId(item.id)}>
                      <div className="db-compact-left">
                        <span className="db-compact-name">{item.label}</span>
                        {badge && (
                          <span className={`db-idx-badge db-idx-badge--${badge.cls}`} style={{fontSize:8,padding:'1px 4px'}}>
                            {badge.cls==='live'&&<span className="db-idx-live-dot"/>}{badge.label}
                          </span>
                        )}
                      </div>
                      <div className="db-compact-right">
                        {d?.price!=null ? (
                          <>
                            <span className="db-compact-price">
                              {d.price.toLocaleString(undefined,{maximumFractionDigits:2})}{item.unit||''}
                            </span>
                            {rate!=null && (
                              <span className="db-compact-rate" style={{color:up?'#DC2626':'#1D4ED8'}}>
                                {up?'▲':'▼'}{Math.abs(rate).toFixed(2)}%
                              </span>
                            )}
                          </>
                        ) : <span className="db-compact-na">—</span>}
                        {dateLabel && <span className="db-date-badge">{dateLabel}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )

          // ── 원자재 그룹: 도트 히트맵 렌더링 ──
          if (group.id === 'commodity') return (
            <div key={group.id} className="db-card-group" style={{'--group-accent':group.accent}}>
              <div className="db-card-group-label" style={{color:group.accent}}>{group.label}</div>
              <div className="db-commodity-grid">
                {group.items.map(item=>{
                  const d    = getItemData(item, dashData, globalData, forexData, cbRates)
                  const rate = d?.changeRate
                  const up   = (rate ?? 0) > 0
                  const dotColor = getCommodityDotColor(rate)
                  const dateLabel = getItemDateLabel(item, d)
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
                                {item.unit==='$'||['WTI','BRENT','GOLD','SILVER','COPPER'].includes(item.id)
                                  ? `$${d.price.toLocaleString(undefined,{maximumFractionDigits:2})}`
                                  : `${d.price.toLocaleString(undefined,{maximumFractionDigits:2})}${item.unit||''}`
                                }
                              </span>
                              {rate!=null && (
                                <span className="db-commodity-rate" style={{color: up?'#DC2626':'#1D4ED8'}}>
                                  {up?'▲':'▼'}{Math.abs(rate).toFixed(2)}%
                                </span>
                              )}
                              {dateLabel && <span className="db-date-badge">{dateLabel}</span>}
                            </>
                          : <span style={{fontSize:10,color:'var(--text-dim)'}}>—</span>
                      }
                    </div>
                  )
                })}
              </div>
            </div>
          )

          // ── 나머지 그룹: 기존 카드 렌더링 ──
          return (
          <div key={group.id} className="db-card-group" style={{'--group-accent':group.accent}}>
            <div className="db-card-group-label" style={{color:group.accent}}>{group.label}</div>
            <div className="db-card-group-items">
              {group.items.map(item=>{
                if (item.type==='divider') return (
                  <div key={item.id} className="db-card-group-divider">{item.label}</div>
                )
                const d        = getItemData(item, dashData, globalData, forexData, cbRates)
                const rate     = d?.changeRate
                const up       = (rate ?? 0) > 0
                const badge    = getMarketBadge(item, d)
                const isClosed = badge?.cls === 'closed'
                const active   = selId === item.id
                const dateLabel = getItemDateLabel(item, d)
                const warnClass = getWarnClass(item, d)
                return (
                  <button key={item.id}
                    className={`db-idx-card ${active?'active':''} ${isClosed?'closed':''} ${item.type==='spread'?'spread-card':''} ${item.type==='cb'?'cb-card':''} ${warnClass}`}
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
                      </span>
                    </div>
                    {globalLoading&&!d ? <Skeleton w="70%" h={14}/> :
                     d?.price!=null ? (
                      <>
                        <div className="db-idx-price" style={d.isSpread?{color:d.inverted?'var(--color-down)':d.price<0.5?'#d97706':'var(--color-up)'}:{}}>
                          {d.isSpread
                            ? `${d.price>=0?'+':''}${d.price.toFixed(2)}%`
                            : `${d.price.toLocaleString(undefined,{maximumFractionDigits:2})}${item.unit||''}`
                          }
                        </div>
                        {d.isSpread
                          ? <div className="db-idx-spread-label" style={{color:d.inverted?'var(--color-down)':d.price<0.5?'#d97706':'#16a34a'}}>
                              {d.inverted?'⚠️ 역전 (경기침체 경보)':d.price<0.5?'⚡ 주의 구간':'✅ 정상'}
                            </div>
                          : d.isCB ? <div className="db-idx-cb-date">{d.date}</div>
                          : rate!=null
                            ? <div className={`db-idx-rate-badge ${up?'up':'down'}`}>
                                {up?'▲':'▼'} {Math.abs(rate).toFixed(2)}%
                              </div>
                            : null
                        }
                        {GAUGE_CONFIG[item.id] && <GaugeBar id={item.id} price={d.price}/>}
                        {/* 스파크라인 미니차트 — KOSPI/KOSDAQ만 */}
                        {(item.id==='KOSPI'||item.id==='KOSDAQ') && sparkData?.[item.id]?.length > 1 && (() => {
                          const closes = sparkData[item.id]
                          const W=120, H=28, pad=2
                          const mn = Math.min(...closes), mx = Math.max(...closes)
                          const rng = mx - mn || 1
                          const px = i => pad + (i/(closes.length-1))*(W-pad*2)
                          const py = v => H-pad-(v-mn)/rng*(H-pad*2)
                          const pts = closes.map((v,i)=>`${px(i)},${py(v)}`).join(' ')
                          const color = closes[closes.length-1] >= closes[0] ? '#22c55e' : '#ef4444'
                          return (
                            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block',margin:'4px 0 2px'}}>
                              <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
                              <circle cx={px(closes.length-1)} cy={py(closes[closes.length-1])} r="2.5" fill={color}/>
                            </svg>
                          )
                        })()}
                        {/* 52주 고저 게이지 — KOSPI/KOSDAQ만 */}
                        {(item.id==='KOSPI'||item.id==='KOSDAQ') && weekData?.[item.id] && d?.price!=null && (() => {
                          const w    = weekData[item.id]
                          const low  = w.low52
                          const high = w.high52
                          if (!low||!high||high<=low) return null
                          const pct  = Math.min(100, Math.max(0, (d.price-low)/(high-low)*100))
                          return (
                            <div className="db-52w-wrap">
                              <div className="db-52w-track">
                                <div className="db-52w-fill" style={{width:`${pct}%`}}/>
                                <div className="db-52w-thumb" style={{left:`${pct}%`}}/>
                              </div>
                              <div className="db-52w-labels">
                                <span>{low.toLocaleString()}</span>
                                <span style={{fontSize:9,color:'var(--accent-mid)'}}>52주 {Math.round(pct)}%</span>
                                <span>{high.toLocaleString()}</span>
                              </div>
                            </div>
                          )
                        })()}
                        {dateLabel && <span className="db-date-badge">{dateLabel}</span>}
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
                  {flowData && <span className="db-date-badge" style={{marginLeft:'auto'}}>장중 기준</span>}
                </div>
                {flowData ? (
                  <div className="db-flow-rows">
                    {[
                      {label:'외국인', val:flowData.total?.foreign  ?? 0, color:'#2563eb'},
                      {label:'기관',   val:flowData.total?.institution ?? 0, color:'#7c3aed'},
                      {label:'개인',   val:flowData.total?.individual ?? 0, color:'#f59e0b'},
                    ].map(({label, val, color})=>{
                      const abs    = Math.abs(val)
                      const maxAbs = Math.max(
                        Math.abs(flowData.total?.foreign     ?? 0),
                        Math.abs(flowData.total?.institution ?? 0),
                        Math.abs(flowData.total?.individual  ?? 0),
                        1
                      )
                      const pct  = Math.min(100, (abs / maxAbs) * 100)
                      const isUp = val >= 0
                      return (
                        <div key={label} className="db-flow-row">
                          <span className="db-flow-label">{label}</span>
                          <div className="db-flow-bar-wrap">
                            {isUp
                              ? <div className="db-flow-bar" style={{width:`${pct}%`,background:'#DC2626',marginLeft:'auto'}}/>
                              : <div className="db-flow-bar" style={{width:`${pct}%`,background:'#1D4ED8',marginLeft:'0'}}/>
                            }
                          </div>
                          <span className="db-flow-val" style={{color:isUp?'#DC2626':'#1D4ED8'}}>
                            {isUp?'+':''}{Math.abs(val)>=100
                              ? `${(val/100).toFixed(0)}백억`
                              : `${val.toFixed(0)}억`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="db-flow-empty">
                    {isOpen ? '수급 데이터 로딩 중...' : '장 시작 후 표시됩니다'}
                  </div>
                )}
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
          <span style={{marginLeft:'auto'}} className="db-date-badge">
            {(()=>{ const k=new Date(Date.now()+9*3600000); return `${k.getUTCMonth()+1}.${String(k.getUTCDate()).padStart(2,'0')} KST` })()}
          </span>
        </div>
        <div className="db-heatmap-grid">
          {HEATMAP_SECTORS.map(sector=>{
            // 실제 API 연동 전 임시 — globalData에서 섹터 등락률 주입 예정
            const mockRates = {
              semiconductor:-1.42, battery:-2.18, auto:-1.76,
              bio:-3.21, game:-3.86, construct:-4.12,
              finance:1.23, energy:3.82, chemical:2.41,
              telecom:-0.08, retail:0.54, shipyard:0.92,
            }
            const rate = mockRates[sector.id] ?? null
            const { bg, neutral } = getHeatmapColor(rate)
            return (
              <div key={sector.id}
                className={`db-heatmap-cell${neutral?' neutral':''}`}
                style={{background: bg}}>
                <span className="db-heatmap-cell-name">{sector.name}</span>
                <span className="db-heatmap-cell-rate">
                  {rate!=null ? `${rate>=0?'+':''}${rate.toFixed(2)}%` : '—'}
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
    </div>
  )
}
