// src/pages/DashboardPage.jsx — v5 (컴포넌트 분리 후 경량화)
import { useState } from 'react'
import { rateColor, getTodayStr, getKstStatus, isMarketOpen, isUSMarketOpen } from '../utils/format'
import { SECTOR_GROUPS, ALL_ITEMS, GAUGE_CONFIG } from '../constants/dashboardData'
import { GaugeBar, TooltipIcon } from '../components/ui/GaugeBar'
import GuideModal        from '../components/dashboard/GuideModal'
import HeatmapSection    from '../components/dashboard/HeatmapSection'
import GlobalChartModal  from '../components/GlobalChartModal'
import useDashboard      from '../hooks/useDashboard'
import HeroChart         from '../components/dashboard/HeroChart'
import AiBriefing        from '../components/dashboard/AiBriefing'
import './DashboardPage.css'

function getItemData(item, dashData, globalData, forexData, cbRates) {
  if (item.type==='global') return globalData?.[item.sym] || null
  if (item.type==='forex')  { const d=forexData?.[item.pair]; return d?{price:d.price,changeRate:d.changeRate,change:d.change,marketState:'CURRENCY'}:null }
  if (item.type==='cb')     { const d=cbRates?.[item.cbKey]; return d?{price:d.rate,changeRate:null,isCB:true,date:d.date}:null }
  return null
}

function getMarketBadge(item, data) {
  if (!data) return null
  if (item.type==='cb')    return { label:'정책금리', color:'#0891b2' }
  if (item.type==='forex') return null
  const ms = data.marketState || data.status
  if (ms==='open'||ms==='REGULAR') return { label:'LIVE',  color:'#22c55e' }
  if (ms==='POST'||ms==='after')   return { label:'시간외', color:'#a78bfa' }
  if (ms==='PRE')                   return { label:'프리',  color:'#f59e0b' }
  return { label:'전일', color:'#64748b' }
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
  const { dashData, globalData, forexData, cbRates, loading, globalLoading,
          fetchError, setFetchError, lastFetch, refresh, fetchDashboard } = useDashboard()

  const [selId,      setSelId]      = useState('KOSPI')
  const [showGuide,  setShowGuide]  = useState(false)
  const [chartItem,  setChartItem]  = useState(null)

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
          {SECTOR_GROUPS.filter(g=>g.id!=='cbrate').map((group,gi)=>(
            <div key={group.id} style={{display:'flex',alignItems:'center',gap:4}}>
              {gi>0 && <div className="db-sel-divider"/>}
              <div className="db-sel-group">
                {group.items.filter(it=>it.type!=='cb').map(it=>(
                  <button key={it.id}
                    className={`db-sel-btn ${selId===it.id?'active':''}`}
                    onClick={()=>setSelId(it.id)}>{it.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <HeroChart selId={selId} onSelChange={setSelId}
          dashData={dashData} globalData={globalData} forexData={forexData}/>
      </div>

      {/* 영역 2: 중단 지수 카드 그리드 */}
      <div className="db-cards-section">
        {SECTOR_GROUPS.map(group=>(
          <div key={group.id} className="db-card-group">
            <div className="db-card-group-label" style={{color:group.accent}}>{group.label}</div>
            <div className="db-card-group-items">
              {group.items.map(item=>{
                const d        = getItemData(item, dashData, globalData, forexData, cbRates)
                const rate     = d?.changeRate
                const pc       = rate!=null ? rateColor(rate) : 'var(--text-dim)'
                const up       = rate > 0
                const badge    = getMarketBadge(item, d)
                const isClosed = badge?.label === '전일'
                const active   = selId === item.id
                return (
                  <button key={item.id}
                    className={`db-idx-card ${active?'active':''} ${isClosed?'closed':''}`}
                    onClick={()=>item.type!=='cb' && setSelId(item.id)}>
                    <div className="db-idx-top-row">
                      <span className="db-idx-name">{item.label}</span>
                      <span style={{display:'flex',alignItems:'center',gap:4}}>
                        <TooltipIcon id={item.id}/>
                        {badge&&<span className="db-idx-badge" style={{color:badge.color}}>
                          {badge.label==='LIVE'&&<span className="db-idx-live-dot"/>}{badge.label}
                        </span>}
                      </span>
                    </div>
                    {globalLoading&&!d ? <Skeleton w="70%" h={14}/> :
                     d?.price!=null ? (
                      <>
                        <div className="db-idx-price">{d.price.toLocaleString(undefined,{maximumFractionDigits:2})}{item.unit||''}</div>
                        {d.isCB ? <div className="db-idx-cb-date">{d.date}</div>
                          : rate!=null ? <div className="db-idx-rate" style={{color:pc}}>{up?'▲':'▼'}{Math.abs(rate).toFixed(2)}%</div>
                          : null}
                        {GAUGE_CONFIG[item.id] && <GaugeBar id={item.id} price={d.price}/>}
                      </>
                    ) : <div className="db-idx-na">—</div>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 영역 3: 하단 업종 히트맵 */}
      <HeatmapSection/>

      <AiBriefing/>

      <div className="dash-footer-note">
        ✅ KIS API · {isOpen?'장중 30초':isAfter?'시간외 2분':'장외 5분'} 자동 갱신
        · 해외지수 {isUSMarketOpen()?'미장 운영중 60초':'5분'} 갱신 · 기준금리 6시간 캐시
      </div>

      {showGuide && <GuideModal onClose={()=>setShowGuide(false)}/>}
      {chartItem && <GlobalChartModal
        type={chartItem.type==='forex'?'forex':'global'}
        symbol={chartItem.type==='forex'?chartItem.pair:chartItem.sym}
        name={chartItem.label} currentPrice={chartItem.price} changeRate={chartItem.changeRate}
        onClose={()=>setChartItem(null)}/>}
    </div>
  )
}
