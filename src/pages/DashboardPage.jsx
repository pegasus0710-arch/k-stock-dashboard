import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import StockChartModal from '../components/StockChartModal'
import ChartModal from '../components/ChartModal'
import './DashboardPage.css'

import { ALL_THEMES, DEFAULT_ACTIVE_IDS as DEFAULT_ACTIVE } from '../constants/themes'
import { fmt, fmtRate, fmtChange, rateColor as rc, getTodayStr, getKstStatus, isMarketOpen, isUSMarketOpen, getDashTTL } from '../utils/format'
const THEME_DOC_KEY  = 'dashboard_theme_prefs'
const GLOBAL_SYMS    = ['SP500','NASDAQ','DOW','US10Y','N225','WTI']

// ── localStorage 캐시 ─────────────────────────────────
const LS_DASH   = 'db_cache_v3'
const LS_GLOBAL = 'db_global_v3'
const LS_SPARK  = 'db_spark_v3'

function lsRead(key, ttl) {
  try { const r=localStorage.getItem(key); if(!r) return null; const {data,ts}=JSON.parse(r); return Date.now()-ts<ttl?data:null } catch { return null }
}
function lsWrite(key, data) {
  try { localStorage.setItem(key,JSON.stringify({data,ts:Date.now()})) } catch {}
}

// ── 유틸 ──────────────────────────────────────────────
const fmt  = v => v!=null ? Number(v).toLocaleString('ko-KR') : '—'
const fmtR = v => { const x=Number(v||0); return `${x>0?'+':''}${x.toFixed(2)}%` }
const fmtC = v => { const x=Number(v||0); return `${x>0?'+':''}${x.toLocaleString('ko-KR')}` }
const rc   = v => { const x=Number(v||0); return x>0?'#ef4444':x<0?'#3b82f6':'#64748b' }

function getKstStatus() {
  const kst=new Date(Date.now()+9*3600000), day=kst.getUTCDay(), m=kst.getUTCHours()*60+kst.getUTCMinutes()
  if(day===0||day===6) return 'holiday'
  if(m<540)  return 'premarket'
  if(m<930)  return 'open'
  if(m<1080) return 'after'   // 15:30~18:00 시간외 단일가
  return 'closed'
}
function isMarketOpen()   { return getKstStatus()==='open' }
function isUSMarketOpen() { const d=new Date(),m=d.getHours()*60+d.getMinutes(),w=d.getDay(); return w>=1&&w<=6&&(m>=1410||m<360) }
function getTodayStr()    { const d=new Date(),days=['일','월','화','수','목','금','토']; return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})` }
function marketToInds(m)  { if(m==='J'||m==='KOSPI') return '001'; if(m==='Q'||m==='KOSDAQ') return '101'; return '001' }
function getDashTTL()     { const s=getKstStatus(); if(s==='open') return 30000; if(s==='after') return 120000; return 600000 }

// ── 서브 컴포넌트 ─────────────────────────────────────
function Sparkline({ values, color }) {
  if(!values||values.length<2) return null
  const W=80,H=28,min=Math.min(...values),max=Math.max(...values),range=max-min||1
  const pts=values.map((v,i)=>`${(i/(values.length-1)*W).toFixed(1)},${(H-((v-min)/range)*(H-4)-2).toFixed(1)}`).join(' ')
  return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{display:'block',flexShrink:0}}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/></svg>
}
function Skeleton({ w='100%', h=20, r=6, mb=0 }) {
  return <div className="db-skeleton" style={{width:w,height:h,borderRadius:r,marginBottom:mb}}/>
}

function IndexCard({ data, loading, color, label, sparkData, onChartClick }) {
  const spark=sparkData||[], status=data?.status||'closed', priceClr=loading||!data?'#94a3b8':rc(data?.changeRate)
  const badgeMap={open:<span className="db-live-badge">● LIVE</span>,after:<span className="db-after-badge">⏱ 시간외</span>,premarket:<span className="db-pre-badge">개장전</span>}
  return (
    <div className="db-index-card" style={{'--ic':color}} onClick={()=>data&&onChartClick({type:'index',market:data.market,label,price:data.price,changeRate:data.changeRate,status})}>
      <div className="db-index-body">
        <div>
          <div className="db-index-top">
            <span className="db-index-label">{label}</span>
            {!loading&&(badgeMap[status]||<span className="db-closed-badge">전일 마감</span>)}
          </div>
          {loading?<><Skeleton h={32} r={6} mb={6}/><Skeleton w="60%" h={16} r={4}/></>:(
            <>
              <div className="db-index-price" style={{color:priceClr}}>{fmt(data?.price)}</div>
              <div className="db-index-change" style={{color:priceClr}}>{fmtC(data?.change)} ({fmtR(data?.changeRate)})</div>
              <div className="db-index-sub">
                {status==='closed'&&data?.closeDate?`📅 ${data.closeDate} 기준`
                  :status==='after'?`시간외 · 고 ${fmt(data?.high)} · 저 ${fmt(data?.low)}`
                  :`고 ${fmt(data?.high)} · 저 ${fmt(data?.low)}`}
              </div>
            </>
          )}
        </div>
        {spark.length>=2&&<div className="db-spark-wrap"><Sparkline values={spark} color={data?.changeRate>=0?'#ef4444':'#3b82f6'}/><span className="db-spark-hint">차트 →</span></div>}
      </div>
    </div>
  )
}

const FOREX_PAIRS=[{pair:'KRW',label:'USD/KRW',symbol:'₩',histKey:'krw'},{pair:'JPY',label:'USD/JPY',symbol:'¥',histKey:'jpy'},{pair:'CNY',label:'USD/CNY',symbol:'¥',histKey:'cny'}]
function ForexSection({ forex, loading, onChartClick }) {
  if(loading) return <div className="db-forex-row">{FOREX_PAIRS.map((_,i)=><div key={i} className="db-forex-card"><Skeleton h={72}/></div>)}</div>
  if(!forex) return null
  const hist=forex.history||{}
  return (
    <div className="db-forex-row">
      {FOREX_PAIRS.map(item=>{
        const value=item.pair==='KRW'?forex.usdKrw?.toLocaleString():item.pair==='JPY'?forex.usdJpy:forex.usdCny
        if(!value) return null
        const vals=(hist[item.histKey]||[]).filter(v=>v>0),first=vals[0]||0,last=vals[vals.length-1]||0
        const pct=first?((last-first)/first*100).toFixed(2):'0.00',up=Number(pct)>=0
        return (
          <div key={item.label} className="db-forex-card" onClick={()=>onChartClick({type:'forex',pair:item.pair,label:item.label,price:last,changeRate:Number(pct)})}>
            <div className="db-forex-left">
              <span className="db-forex-label">{item.label}</span>
              <span className="db-forex-value">{item.symbol}{value}</span>
              <span className="db-forex-change" style={{color:up?'#ef4444':'#3b82f6'}}>{up?'▲':'▼'} {Math.abs(Number(pct))}% <span style={{color:'#94a3b8',fontSize:'10px'}}>7일</span></span>
              <span className="db-forex-hint">차트 →</span>
            </div>
            {vals.length>=2&&<Sparkline values={vals} color={up?'#d97706':'#94a3b8'}/>}
          </div>
        )
      })}
    </div>
  )
}

const GLOBAL_LIST=[{sym:'SP500',label:'S&P 500',color:'#ef4444'},{sym:'NASDAQ',label:'NASDAQ',color:'#0d9488'},{sym:'DOW',label:'DOW',color:'#2563eb'},{sym:'US10Y',label:'미 국채 10Y',color:'#7c3aed'},{sym:'N225',label:'닛케이 225',color:'#ea580c'},{sym:'WTI',label:'WTI 유가',color:'#16a34a'}]
function GlobalSection({ globalData, loading, onChartClick }) {
  return (
    <div className="db-global-grid">
      {GLOBAL_LIST.map(g=>{
        const data=globalData?.[g.sym],pc=data?rc(data.changeRate):'#94a3b8'
        return (
          <div key={g.sym} className="db-global-card" style={{'--gc':g.color}} onClick={()=>data&&onChartClick({type:'global',sym:g.sym,label:g.label,color:g.color,price:data.price,changeRate:data.changeRate})}>
            <div className="db-global-label" style={{color:g.color}}>{g.label}</div>
            {loading&&<div className="db-global-loading">...</div>}
            {!loading&&data&&(
              <>
                <div className="db-global-price" style={{color:pc}}>{data.price?.toLocaleString(undefined,{maximumFractionDigits:2})}</div>
                <div className="db-global-change" style={{color:pc}}>
                  {data.changeRate>=0?'+':''}{data.changeRate?.toFixed(2)}%
                  {data.marketState&&data.marketState!=='REGULAR'&&<span style={{fontSize:'9px',color:'#94a3b8',marginLeft:3}}>{data.marketState==='POST'?'시간외':data.marketState==='PRE'?'프리':''}</span>}
                </div>
              </>
            )}
            {!loading&&!data&&<div className="db-global-na">—</div>}
          </div>
        )
      })}
    </div>
  )
}

const QUICK_LINKS=[{label:'네이버 증권',url:'https://finance.naver.com',icon:'📊'},{label:'KRX 시장정보',url:'https://data.krx.co.kr',icon:'🏛️'},{label:'DART 공시',url:'https://dart.fss.or.kr',icon:'📋'},{label:'한국은행',url:'https://www.bok.or.kr',icon:'🏦'},{label:'거래량 상위',url:'https://finance.naver.com/sise/sise_quant.naver',icon:'🔥'},{label:'외국인 순매수',url:'https://finance.naver.com/sise/foreign_list.naver',icon:'🌐'},{label:'증권사 리포트',url:'https://finance.naver.com/research/invest_list.naver',icon:'📈'},{label:'상한가 종목',url:'https://finance.naver.com/sise/sise_upper.naver',icon:'🚀'}]
function QuickLinks() {
  const [open,setOpen]=useState(false)
  return (
    <div className="db-quicklinks-wrap">
      <button className="db-quicklinks-toggle" onClick={()=>setOpen(v=>!v)}><span>🔗 바로가기</span><span className="db-ql-arrow">{open?'▲':'▼'}</span></button>
      {open&&<div className="db-quicklinks-panel">{QUICK_LINKS.map(l=><a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="db-ql-item"><span className="db-ql-icon">{l.icon}</span><span className="db-ql-label">{l.label}</span><span className="db-ql-arrow-sm">→</span></a>)}</div>}
    </div>
  )
}

function ThemeSettingModal({ activeIds, onChange, onClose }) {
  const [sel,setSel]=useState(new Set(activeIds))
  const toggle=id=>setSel(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })
  return (
    <div className="db-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="db-setting-modal">
        <div className="db-setting-header"><span>테마 설정</span><button className="db-setting-close" onClick={onClose}>✕</button></div>
        <p style={{fontSize:'12px',color:'#94a3b8',marginBottom:'12px'}}>노출할 테마를 선택하세요</p>
        <div className="db-theme-check-grid">
          {ALL_THEMES.map(t=>(
            <label key={t.id} className={`db-theme-check-item ${sel.has(t.id)?'checked':''}`} style={{'--tc':t.color}}>
              <input type="checkbox" checked={sel.has(t.id)} onChange={()=>toggle(t.id)} style={{display:'none'}}/>
              <span className="db-theme-check-emoji">{t.emoji}</span><span className="db-theme-check-label">{t.label}</span>
              {sel.has(t.id)&&<span className="db-theme-check-mark">✓</span>}
            </label>
          ))}
        </div>
        <div className="db-setting-footer">
          <button className="btn-outline" onClick={onClose}>취소</button>
          <button className="btn-ai" onClick={()=>{onChange([...sel]);onClose()}}>저장</button>
        </div>
      </div>
    </div>
  )
}

function LegacyChartModal({ item, onClose }) {
  const [candles,setCandles]=useState([]),  [period,setPeriod]=useState(null), [loading,setLoading]=useState(true), [error,setError]=useState('')
  const PERIODS=item.type==='global'?[{v:'3mo',l:'3개월'},{v:'6mo',l:'6개월'},{v:'1y',l:'1년'}]:[{v:'90',l:'3개월'},{v:'365',l:'1년'},{v:'1825',l:'5년'}]
  const fetch_=useCallback(async p=>{setLoading(true);setError('');try{const url=item.type==='global'?`/api/kis?type=global&symbol=${item.sym}&range=${p}`:`/api/kis?type=forex-chart&pair=${item.pair}&days=${p}`;const j=await fetch(url).then(r=>r.json());if(j.error) throw new Error(j.error);setCandles(j.candles||[])}catch(e){setError(e.message)}finally{setLoading(false)}},[item])
  useEffect(()=>{const def=PERIODS[0]?.v; if(def){setPeriod(def);fetch_(def)}},[])
  useEffect(()=>{const fn=e=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn)},[onClose])
  const W=typeof window!=='undefined'?Math.min(window.innerWidth-48,880):880
  const renderChart=()=>{
    if(!candles.length) return <div style={{padding:'60px',textAlign:'center',color:'#94a3b8'}}>데이터 없음</div>
    const H=300,pL=72,pR=12,pT=12,pB=32,cW=W-pL-pR,cH=H-pT-pB
    const closes=candles.map(c=>c.close).filter(Boolean)
    const min=Math.min(...closes)*0.997,max=Math.max(...closes)*1.003,range=max-min||1
    const py=v=>pT+cH-(v-min)/range*cH,px=i=>pL+(i/(candles.length-1||1))*cW
    const pts=candles.map((c,i)=>`${px(i)},${py(c.close)}`).join(' ')
    const isUp=closes[closes.length-1]>=closes[0],lc=isUp?'#ef4444':'#3b82f6'
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block',background:'#0f172a',borderRadius:'8px'}}>
        {Array.from({length:5},(_,i)=>{const v=min+(range/5)*i,y=py(v);return <g key={i}><line x1={pL} x2={pL+cW} y1={y} y2={y} stroke="#1e293b" strokeDasharray="3,3"/><text x={pL-4} y={y+4} textAnchor="end" fontSize="10" fill="#64748b">{Math.round(v).toLocaleString()}</text></g>})}
        <defs><linearGradient id="lg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={lc} stopOpacity="0.2"/><stop offset="100%" stopColor={lc} stopOpacity="0"/></linearGradient></defs>
        <polygon points={`${pL},${pT+cH} ${pts} ${pL+cW},${pT+cH}`} fill="url(#lg2)"/>
        <polyline points={pts} fill="none" stroke={lc} strokeWidth="1.8"/>
        {candles.filter((_,i)=>i%(Math.floor(candles.length/6)||1)===0).map((c,i)=>(<text key={i} x={px(candles.indexOf(c))} y={H-8} textAnchor="middle" fontSize="10" fill="#64748b">{String(c.date||'').slice(4,8).replace(/(\d{2})(\d{2})/,'$1/$2')}</text>))}
      </svg>
    )
  }
  return (
    <div className="chart-modal-overlay" onClick={onClose}>
      <div className="chart-modal" onClick={e=>e.stopPropagation()}>
        <div className="chart-modal-header">
          <div className="chart-modal-title"><span className="chart-modal-name">{item.label}</span><span className="chart-modal-price" style={{color:rc(item.changeRate)}}>{item.price?.toLocaleString(undefined,{maximumFractionDigits:4})} ({fmtR(item.changeRate)})</span></div>
          <div className="chart-modal-actions"><div className="chart-period-tabs">{PERIODS.map(p=>(<button key={p.v} className={`chart-period-btn ${period===p.v?'active':''}`} onClick={()=>{setPeriod(p.v);fetch_(p.v)}}>{p.l}</button>))}</div><button className="chart-modal-close" onClick={onClose}>✕</button></div>
        </div>
        <div className="chart-modal-body">{loading&&<div className="chart-loading"><div className="spinner-lg"/>로딩 중...</div>}{error&&<div className="chart-error">⚠️ {error}</div>}{!loading&&!error&&renderChart()}</div>
      </div>
    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth()
  const [dashData,       setDashData]       = useState(()=>lsRead(LS_DASH, getDashTTL()))
  const [globalData,     setGlobalData]     = useState(()=>lsRead(LS_GLOBAL, 300000))
  const [sparkData,      setSparkData]      = useState(()=>lsRead(LS_SPARK, 3600000)||{})
  const [loading,        setLoading]        = useState(()=>!lsRead(LS_DASH, getDashTTL()))
  const [globalLoading,  setGlobalLoading]  = useState(()=>!lsRead(LS_GLOBAL, 300000))
  const [lastFetch,      setLastFetch]      = useState('')
  const [chartItem,      setChartItem]      = useState(null)
  const [activeIds,      setActiveIds]      = useState(DEFAULT_ACTIVE)
  const [activeIdsReady, setActiveIdsReady] = useState(false)  // ✅ Firebase 준비 플래그
  const [showSetting,    setShowSetting]    = useState(false)

  const timerRef   = useRef(null)
  const globalTimer= useRef(null)
  const stateCheck = useRef(null)
  const isFetching = useRef(false)

  // ✅ Firebase 로드 완료 후 activeIdsReady = true
  useEffect(()=>{
    if (!user?.uid) { setActiveIdsReady(true); return }
    getDoc(doc(db,'user_prefs',user.uid))
      .then(snap=>{ if(snap.exists()&&snap.data()[THEME_DOC_KEY]) setActiveIds(snap.data()[THEME_DOC_KEY]) })
      .catch(()=>{})
      .finally(()=>setActiveIdsReady(true))
  },[user?.uid])

  const visibleThemes = ALL_THEMES.filter(t=>activeIds.includes(t.id))
  const getNeededCodes = useCallback(()=>visibleThemes.flatMap(t=>[...t.etf.slice(0,1).map(e=>e.code),...t.stocks.map(s=>s.code)]),[visibleThemes.map(t=>t.id).join(',')])

  // ✅ stale-while-revalidate + localStorage
  const fetchDashboard = useCallback(async(force=false)=>{
    if(isFetching.current) return
    if(!force && lsRead(LS_DASH, getDashTTL())) { setLoading(false); return }
    isFetching.current=true
    const codes=getNeededCodes(); if(!codes.length){ isFetching.current=false; return }
    try {
      const res=await fetch(`/api/kis?type=dashboard&codes=${codes.join(',')}`).then(r=>r.json())
      if(res.error) throw new Error(res.error)
      setDashData(res); lsWrite(LS_DASH, res)
      const now=new Date(); setLastFetch(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`)
    } catch(e){ console.error('[dashboard]',e) }
    finally { setLoading(false); isFetching.current=false }
  },[getNeededCodes])

  // ✅ 스파크라인 1시간 캐시 (별도 fetch, 블로킹 안 함)
  const fetchSpark = useCallback(async()=>{
    if(lsRead(LS_SPARK, 3600000)) return
    try {
      const [k,q]=await Promise.all([
        fetch('/api/kis?type=index-chart&market=J&days=20').then(r=>r.json()).catch(()=>({})),
        fetch('/api/kis?type=index-chart&market=Q&days=20').then(r=>r.json()).catch(()=>({})),
      ])
      const s={KOSPI:(k.candles||[]).map(c=>c.close),KOSDAQ:(q.candles||[]).map(c=>c.close)}
      setSparkData(s); lsWrite(LS_SPARK,s)
    } catch{}
  },[])

  // ✅ 글로벌 5분 캐시
  const fetchGlobal = useCallback(async(force=false)=>{
    if(!force && lsRead(LS_GLOBAL, 300000)) { setGlobalLoading(false); return }
    try {
      const results=await Promise.allSettled(GLOBAL_SYMS.map(sym=>fetch(`/api/kis?type=global&symbol=${sym}`).then(r=>r.json())))
      const map={}; results.forEach((r,i)=>{ if(r.status==='fulfilled'&&!r.value.error) map[GLOBAL_SYMS[i]]=r.value })
      setGlobalData(map); lsWrite(LS_GLOBAL,map)
    } catch(e){ console.error('[global]',e) }
    finally { setGlobalLoading(false) }
  },[])

  // ✅ Firebase 준비 완료 후 fetch 시작 (추가 업종 반영 보장)
  useEffect(()=>{
    if(!activeIdsReady) return
    fetchDashboard(true); fetchGlobal(true); fetchSpark()
    const setupTimers=()=>{
      clearInterval(timerRef.current); clearInterval(globalTimer.current)
      timerRef.current    = setInterval(()=>fetchDashboard(true), isMarketOpen()?30000:300000)
      globalTimer.current = setInterval(()=>fetchGlobal(true),    isUSMarketOpen()?60000:300000)
    }
    setupTimers()
    stateCheck.current=setInterval(setupTimers,60000)
    return()=>{ clearInterval(timerRef.current); clearInterval(globalTimer.current); clearInterval(stateCheck.current) }
  },[activeIdsReady,fetchDashboard,fetchGlobal,fetchSpark])

  const handleThemeChange=async ids=>{
    setActiveIds(ids)
    if(user?.uid) setDoc(doc(db,'user_prefs',user.uid),{[THEME_DOC_KEY]:ids},{merge:true}).catch(()=>{})
    localStorage.removeItem(LS_DASH)
    setTimeout(()=>fetchDashboard(true),100)
  }

  const kstStatus=getKstStatus(), isOpen=kstStatus==='open', isAfter=kstStatus==='after'
  const stMap={open:{label:'정규장 운영중',color:'#16a34a',dot:true},premarket:{label:'장 시작 전',color:'#d97706',dot:false},after:{label:'시간외 거래',color:'#7c3aed',dot:true},holiday:{label:'휴장일',color:'#64748b',dot:false},closed:{label:'장 마감',color:'#64748b',dot:false}}
  const st=stMap[kstStatus]||stMap.closed
  const priceMap={}; dashData?.prices?.forEach(p=>{ if(p?.code) priceMap[p.code]=p })

  const renderChartModal=()=>{
    if(!chartItem) return null
    if(chartItem.isStock) return <StockChartModal stock={{name:chartItem.label,code:chartItem.code}} onClose={()=>setChartItem(null)}/>
    if(chartItem.type==='index') return <ChartModal isIndex inds_cd={marketToInds(chartItem.market)} name={chartItem.label} initialPeriod="day" onClose={()=>setChartItem(null)}/>
    return <LegacyChartModal item={chartItem} onClose={()=>setChartItem(null)}/>
  }

  return (
    <div className="dashboard">
      <div className="dash-header">
        <div className="dash-header-row">
          <div>
            <h1 className="dash-title">시장 대시보드</h1>
            <p className="dash-date">{getTodayStr()}{lastFetch&&<span style={{color:'#94a3b8'}}> · {lastFetch} 기준</span>}</p>
          </div>
          <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
            <QuickLinks/>
            <div className="db-status-badge" style={{background:st.color+'18',color:st.color,borderColor:st.color+'40'}}>
              {st.dot&&<span className="db-status-dot" style={{background:st.color}}/>}{st.label}
            </div>
            <button className="btn-outline db-refresh-btn"
              onClick={()=>{localStorage.removeItem(LS_DASH);localStorage.removeItem(LS_GLOBAL);fetchDashboard(true);fetchGlobal(true)}}
              disabled={loading}>⟳</button>
          </div>
        </div>
      </div>

      {!isOpen&&!isAfter&&dashData&&<div className="db-closed-banner">📅 현재 장 마감 상태 · 표시된 데이터는 <b>전일 종가 기준</b></div>}
      {isAfter&&<div className="db-after-banner">⏱ 시간외 단일가 거래 중 (15:30~18:00) · 시간외 거래 종목은 실시간 가격 표시</div>}

      <section className="dash-section">
        <div className="db-section-header">
          <span className="db-section-label">실시간 지수 · 환율{isOpen&&<span className="db-live-badge"> ● LIVE</span>}{isAfter&&<span className="db-after-badge"> ⏱ 시간외</span>}{!isOpen&&!isAfter&&<span className="db-closed-note"> 전일 마감 기준</span>}</span>
          <span className="db-section-note">{isOpen?'KIS · 30초 갱신':isAfter?'KIS · 2분 갱신':'KIS · 5분 갱신'}</span>
        </div>
        <div className="db-index-grid">
          <IndexCard data={dashData?.kospi}  loading={loading} color="#2563eb" label="KOSPI"  sparkData={sparkData.KOSPI}  onChartClick={setChartItem}/>
          <IndexCard data={dashData?.kosdaq} loading={loading} color="#16a34a" label="KOSDAQ" sparkData={sparkData.KOSDAQ} onChartClick={setChartItem}/>
        </div>
        <ForexSection forex={dashData?.forex} loading={loading} onChartClick={setChartItem}/>
        <GlobalSection globalData={globalData} loading={globalLoading} onChartClick={setChartItem}/>
        {isUSMarketOpen()&&<div className="db-us-live">🇺🇸 미국 시장 운영중 · 해외지수 60초 자동 갱신</div>}
      </section>

      <section className="dash-section">
        <div className="db-section-header">
          <span className="db-section-label">테마 현황{isOpen&&<span className="db-live-badge"> ● LIVE</span>}{isAfter&&<span className="db-after-badge"> ⏱ 시간외</span>}{!isOpen&&!isAfter&&<span className="db-closed-note"> 전일 마감 기준</span>}</span>
          <button className="btn-outline db-theme-setting-btn" onClick={()=>setShowSetting(true)}>⚙️ 테마 설정</button>
        </div>
        {loading?(
          <div className="db-theme-grid">
            {visibleThemes.map(t=>(
              <div key={t.id} className="db-theme-card" style={{'--tc':t.color}}>
                <div className="db-theme-card-header"><span className="db-theme-emoji">{t.emoji}</span><span className="db-theme-label" style={{color:t.color}}>{t.label}</span></div>
                <Skeleton h={32} r={6} mb={8}/>{[1,2,3].map(i=><Skeleton key={i} h={24} r={4} mb={4}/>)}
              </div>
            ))}
          </div>
        ):(
          <div className="db-theme-grid">
            {visibleThemes.map(t=>{
              const topEtf=t.etf.sort((a,b)=>b.cap-a.cap)[0],ep=priceMap[topEtf?.code]
              return (
                <div key={t.id} className="db-theme-card" style={{'--tc':t.color}}>
                  <div className="db-theme-card-header"><span className="db-theme-emoji">{t.emoji}</span><span className="db-theme-label" style={{color:t.color}}>{t.label}</span></div>
                  {topEtf&&(
                    <button className="db-etf-chip" onClick={()=>setChartItem({isStock:true,code:topEtf.code,label:topEtf.name})}>
                      <span className="db-etf-badge">ETF</span><span className="db-etf-name">{topEtf.name}</span>
                      {ep?.price>0
                        ?<span className="db-etf-price" style={{color:rc(ep.changeRate)}}>{fmt(ep.price)} <span style={{fontSize:'10px'}}>({fmtR(ep.changeRate)})</span>{ep.status==='after'&&<span style={{fontSize:'9px',color:'#7c3aed',marginLeft:2}}>시간외</span>}</span>
                        :<span className="db-etf-price" style={{color:'#94a3b8'}}>—</span>}
                    </button>
                  )}
                  <div className="db-theme-stocks">
                    {t.stocks.map(s=>{
                      const p=priceMap[s.code]
                      return (
                        <button key={s.code} className="db-stock-chip" onClick={()=>setChartItem({isStock:true,code:s.code,label:s.name})}>
                          <span className="db-stock-name">{s.name}</span>
                          {p?.price>0
                            ?<span className="db-stock-price" style={{color:rc(p.changeRate)}}>{fmt(p.price)} <span style={{fontSize:'10px'}}>({fmtR(p.changeRate)})</span>{p.status==='after'&&<span style={{fontSize:'9px',color:'#7c3aed',marginLeft:2}}>시간외</span>}</span>
                            :<span style={{color:'#94a3b8',fontSize:'11px'}}>—</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="dash-footer-note">✅ KIS API · {isOpen?'장중 30초':isAfter?'시간외 2분':'장외 5분'} 자동 갱신 · 해외지수 {isUSMarketOpen()?'미장 운영중 60초':'5분'} 갱신</div>
      {showSetting&&<ThemeSettingModal activeIds={activeIds} onChange={handleThemeChange} onClose={()=>setShowSetting(false)}/>}
      {renderChartModal()}
    </div>
  )
}
