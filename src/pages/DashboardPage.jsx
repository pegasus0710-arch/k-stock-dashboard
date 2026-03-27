import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import StockChartModal from '../components/StockChartModal'
import GlobalChartModal from '../components/GlobalChartModal'
import { ALL_THEMES } from '../constants/themes'
import { fmt, fmtRate, fmtChange, rateColor, getTodayStr, getNowTime, getKstStatus, isMarketOpen, isUSMarketOpen, getDashTTL } from '../utils/format'
import './DashboardPage.css'

// ── 상수 ──────────────────────────────────────────────
const LS_DASH    = 'db_cache_v3'
const LS_BRIEFING= 'db_briefing_v1'
const LS_GLOBAL  = 'db_global_v4'
const LS_FOREX   = 'db_forex_krw_v1'
const LS_SPARK   = 'db_spark_v3'

const BATCH_SYMBOLS = ['SP500','NASDAQ','DOW','N225','HSI','SSE','TWI','DAX','US10Y','US2Y','KR10Y','WTI','BRENT','GOLD','SILVER','COPPER','VIX','DXY']

const FOREX_META = [
  { key:'USD', label:'USD/KRW', desc:'원달러',    symbol:'₩', color:'#2563eb' },
  { key:'JPY', label:'JPY/KRW', desc:'원엔(100엔)', symbol:'₩', color:'#dc2626' },
  { key:'CNY', label:'CNY/KRW', desc:'원위안',    symbol:'₩', color:'#d97706' },
  { key:'EUR', label:'EUR/KRW', desc:'원유로',    symbol:'₩', color:'#7c3aed' },
]

// ── Hero 차트 심볼 목록 ────────────────────────────────
const HERO_SYMBOLS = [
  { id:'KOSPI',  label:'KOSPI',      type:'index',  market:'J',   color:'#3b82f6' },
  { id:'KOSDAQ', label:'KOSDAQ',     type:'index',  market:'Q',   color:'#22c55e' },
  { id:'SP500',  label:'S&P 500',    type:'global', sym:'SP500',  color:'#ef4444' },
  { id:'NASDAQ', label:'NASDAQ',     type:'global', sym:'NASDAQ', color:'#0d9488' },
  { id:'N225',   label:'닛케이 225', type:'global', sym:'N225',   color:'#f59e0b' },
  { id:'USD',    label:'USD/KRW',    type:'forex',  pair:'USD',   color:'#a855f7' },
]

// ── Pulse strip 심볼 ──────────────────────────────────
const PULSE_LIST = [
  { id:'kospi',  label:'KOSPI',     type:'dash',  field:'kospi'  },
  { id:'kosdaq', label:'KOSDAQ',    type:'dash',  field:'kosdaq' },
  { id:'SP500',  label:'S&P 500',   type:'global' },
  { id:'NASDAQ', label:'NASDAQ',    type:'global' },
  { id:'N225',   label:'닛케이',    type:'global' },
  { id:'VIX',    label:'VIX',       type:'global' },
  { id:'GOLD',   label:'금',        type:'global' },
  { id:'WTI',    label:'WTI',       type:'global' },
  { id:'USD',    label:'USD/KRW',   type:'forex'  },
]

// ── 히트맵 색상 ───────────────────────────────────────
function heatColor(rate) {
  if (rate === null || rate === undefined) return { bg:'#1e293b', txt:'#475569' }
  if (rate >=  3) return { bg:'#14532d', txt:'#4ade80' }
  if (rate >=  1.5) return { bg:'#166534', txt:'#86efac' }
  if (rate >=  0.3) return { bg:'#15803d', txt:'#bbf7d0' }
  if (rate >   0)   return { bg:'#1a3a24', txt:'#6ee7b7' }
  if (rate >=  -0.3) return { bg:'#1e293b', txt:'#94a3b8' }
  if (rate >= -1.5) return { bg:'#7f1d1d', txt:'#fca5a5' }
  if (rate >= -3)   return { bg:'#991b1b', txt:'#fecaca' }
  return { bg:'#450a0a', txt:'#f87171' }
}

// ── 히트맵 섹터 ───────────────────────────────────────
const HEATMAP_SECTORS = [
  // KOSPI
  { name:'반도체',    inds_cd:'004', mrkt:'0' },
  { name:'전기전자',  inds_cd:'008', mrkt:'0' },
  { name:'자동차',    inds_cd:'007', mrkt:'0' },
  { name:'2차전지',   inds_cd:'027', mrkt:'0' },
  { name:'바이오',    inds_cd:'009', mrkt:'0' },
  { name:'금융·보험', inds_cd:'005', mrkt:'0' },
  { name:'화학',      inds_cd:'006', mrkt:'0' },
  { name:'건설',      inds_cd:'010', mrkt:'0' },
  { name:'철강·금속', inds_cd:'011', mrkt:'0' },
  { name:'에너지',    inds_cd:'012', mrkt:'0' },
  { name:'유통·소비', inds_cd:'013', mrkt:'0' },
  { name:'통신',      inds_cd:'014', mrkt:'0' },
  { name:'방산',      inds_cd:'017', mrkt:'0' },
  { name:'조선·기계', inds_cd:'018', mrkt:'0' },
  // KOSDAQ
  { name:'IT소프트',  inds_cd:'105', mrkt:'1' },
  { name:'제약',      inds_cd:'107', mrkt:'1' },
  { name:'게임',      inds_cd:'106', mrkt:'1' },
  { name:'엔터',      inds_cd:'114', mrkt:'1' },
  { name:'로봇·AI',   inds_cd:'116', mrkt:'1' },
]

// ── localStorage 헬퍼 ─────────────────────────────────
function lsRead(key, ttl) {
  try { const r=localStorage.getItem(key); if(!r) return null; const {data,ts}=JSON.parse(r); return Date.now()-ts<ttl?data:null } catch { return null }
}
function lsWrite(key, data) {
  try { localStorage.setItem(key, JSON.stringify({data,ts:Date.now()})) } catch {}
}

// ── Sparkline ─────────────────────────────────────────
function Sparkline({ values, color, w=80, h=28 }) {
  if (!values || values.length < 2) return null
  const min=Math.min(...values), max=Math.max(...values), range=max-min||1
  const pts=values.map((v,i)=>
    `${(i/(values.length-1)*w).toFixed(1)},${(h-((v-min)/range)*(h-4)-2).toFixed(1)}`
  ).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:'block',flexShrink:0}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

function Skeleton({ w='100%', h=20, r=6, mb=0 }) {
  return <div className="db-skeleton" style={{width:w,height:h,borderRadius:r,marginBottom:mb}}/>
}

// ══════════════════════════════════════════════════════
// ① HERO 차트
// ══════════════════════════════════════════════════════
function HeroChart({ dashData, globalData, forexData, sparkData }) {
  const [sel, setSel]   = useState('KOSPI')
  const [range, setRange] = useState('3mo')
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(false)

  const PERIODS = [
    {v:'1mo',l:'1개월'},{v:'3mo',l:'3개월'},{v:'6mo',l:'6개월'},{v:'1y',l:'1년'}
  ]

  const fetchHeroChart = useCallback(async (symId, rng) => {
    setLoading(true)
    try {
      const sym = HERO_SYMBOLS.find(s => s.id === symId)
      if (!sym) return
      let url
      if (sym.type === 'index') {
        const days = rng==='1y'?365:rng==='6mo'?180:rng==='3mo'?90:30
        url = `/api/kis?type=index-chart&market=${sym.market}&days=${days}`
      } else if (sym.type === 'global') {
        url = `/api/kis?type=global&symbol=${sym.sym}&range=${rng}`
      } else {
        url = `/api/kis?type=forex-krw&range=${rng}`
      }
      const j = await fetch(url).then(r=>r.json())
      const raw = j.candles || (sym.type==='forex' ? j[sym.pair||'USD']?.candles : []) || []
      setCandles(raw.filter(c => (c.close||0) > 0))
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchHeroChart(sel, range) }, [sel, range])

  // 현재가 / 등락률
  const getCurrent = () => {
    const sym = HERO_SYMBOLS.find(s => s.id === sel)
    if (!sym) return null
    if (sym.type==='index') {
      const d = sel==='KOSPI' ? dashData?.kospi : dashData?.kosdaq
      return d ? { price: d.price, changeRate: d.changeRate, change: d.change } : null
    }
    if (sym.type==='global') return globalData?.[sym.sym] || null
    if (sym.type==='forex') {
      const d = forexData?.[sym.pair]
      return d ? { price: d.price, changeRate: d.changeRate, change: d.change } : null
    }
    return null
  }
  const cur    = getCurrent()
  const symObj = HERO_SYMBOLS.find(s => s.id === sel)
  const pc     = cur ? rateColor(cur.changeRate) : '#94a3b8'

  // SVG 라인차트
  const renderChart = () => {
    if (!candles.length) return null
    const W=800, H=200, pL=60, pR=16, pT=12, pB=28
    const cW=W-pL-pR, cH=H-pT-pB
    const closes = candles.map(c=>c.close)
    const min    = Math.min(...closes)*0.997
    const max    = Math.max(...closes)*1.003
    const range  = max-min||1
    const py = v => pT+cH-(v-min)/range*cH
    const px = i => pL+(i/(candles.length-1||1))*cW
    const pts = candles.map((c,i)=>`${px(i)},${py(c.close)}`).join(' ')
    const isUp = closes[closes.length-1] >= closes[0]
    const lc   = symObj?.color || (isUp ? '#22c55e' : '#ef4444')
    // X축 레이블 (6개)
    const step = Math.max(1, Math.floor(candles.length/6))
    const xLabels = candles
      .filter((_,i)=>i===0||i===candles.length-1||(i%step===0))
      .slice(0,6)
      .map((c,_i)=>{
        const idx = candles.indexOf(c)
        const d   = String(c.date||'')
        const lbl = d.length>=8 ? `${d.slice(4,6)}/${d.slice(6,8)}` : d
        return { x: px(idx), lbl }
      })
    const gridCount = 4
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block'}}>
        <defs>
          <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lc} stopOpacity="0.25"/>
            <stop offset="100%" stopColor={lc} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* 그리드 */}
        {Array.from({length:gridCount},(_,i)=>{
          const v=min+range/(gridCount)*i; const y=py(v)
          return (
            <g key={i}>
              <line x1={pL} x2={pL+cW} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3,4"/>
              <text x={pL-6} y={y+4} textAnchor="end" fontSize="10" fill="#475569">
                {v>1000 ? Math.round(v).toLocaleString() : v.toFixed(2)}
              </text>
            </g>
          )
        })}
        {/* 영역 */}
        <polygon
          points={`${pL},${pT+cH} ${pts} ${px(candles.length-1)},${pT+cH}`}
          fill="url(#heroGrad)"
        />
        {/* 라인 */}
        <polyline points={pts} fill="none" stroke={lc} strokeWidth="2"/>
        {/* 현재 점 */}
        {candles.length>0 && (
          <circle cx={px(candles.length-1)} cy={py(candles[candles.length-1].close)}
            r="4" fill={lc} stroke="#0a0f1a" strokeWidth="2"/>
        )}
        {/* X축 */}
        {xLabels.map((l,i)=>(
          <text key={i} x={l.x} y={H-6} textAnchor="middle" fontSize="10" fill="#475569">{l.lbl}</text>
        ))}
      </svg>
    )
  }

  return (
    <section className="db-hero-section">
      {/* 심볼 탭 */}
      <div className="db-hero-tabs">
        {HERO_SYMBOLS.map(s => (
          <button key={s.id}
            className={`db-hero-tab ${sel===s.id?'active':''}`}
            style={sel===s.id ? {'--htc':s.color} : {}}
            onClick={()=>setSel(s.id)}>
            {s.label}
          </button>
        ))}
        <div className="db-hero-period-tabs">
          {PERIODS.map(p=>(
            <button key={p.v}
              className={`db-hero-period-btn ${range===p.v?'active':''}`}
              onClick={()=>setRange(p.v)}>{p.l}</button>
          ))}
        </div>
      </div>

      {/* 현재가 오버레이 */}
      <div className="db-hero-info">
        <div className="db-hero-label">{symObj?.label}</div>
        {cur ? (
          <>
            <div className="db-hero-price" style={{color:pc}}>
              {cur.price?.toLocaleString(undefined,{maximumFractionDigits:2})}
            </div>
            <div className="db-hero-change" style={{color:pc}}>
              {fmtChange(cur.change)} ({cur.changeRate>=0?'+':''}{cur.changeRate?.toFixed(2)}%)
            </div>
          </>
        ) : (
          <div className="db-hero-price" style={{color:'#475569'}}>—</div>
        )}
      </div>

      {/* 차트 */}
      <div className="db-hero-chart">
        {loading
          ? <div className="db-hero-loading"><div className="db-hero-spinner"/></div>
          : candles.length ? renderChart()
          : <div className="db-hero-empty">데이터를 불러오는 중...</div>
        }
      </div>
    </section>
  )
}

// ══════════════════════════════════════════════════════
// ② PULSE STRIP
// ══════════════════════════════════════════════════════
function PulseStrip({ dashData, globalData, forexData }) {
  const getItem = (p) => {
    if (p.type==='dash') return dashData?.[p.field]
    if (p.type==='global') return globalData?.[p.id]
    if (p.type==='forex') return forexData?.[p.id.replace('USD','USD').replace('JPY','JPY').replace('CNY','CNY').replace('EUR','EUR')]
    return null
  }
  return (
    <div className="db-pulse-strip">
      {PULSE_LIST.map(p => {
        const d   = getItem(p)
        const rate= d?.changeRate
        const pc  = rate != null ? rateColor(rate) : '#64748b'
        const up  = rate > 0
        return (
          <div key={p.id} className="db-pulse-item">
            <div className="db-pulse-label">{p.label}</div>
            {d?.price != null ? (
              <>
                <div className="db-pulse-price">
                  {d.price.toLocaleString(undefined,{maximumFractionDigits:2})}
                </div>
                <div className="db-pulse-rate" style={{color:pc}}>
                  <span className="db-pulse-arrow">{up?'▲':'▼'}</span>
                  {Math.abs(rate).toFixed(2)}%
                </div>
              </>
            ) : (
              <div className="db-pulse-na">—</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// ③ 섹터 히트맵 (소형 카드)
// ══════════════════════════════════════════════════════
function SectorHeatmap({ onSectorClick }) {
  const [rates,   setRates]   = useState({})
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  const load = useCallback(async () => {
    if (fetched) return
    setLoading(true)
    try {
      const results = await Promise.allSettled(
        HEATMAP_SECTORS.map(s =>
          fetch(`/api/kiwoom?type=sector-price&inds_cd=${s.inds_cd}&mrkt=${s.mrkt}`)
            .then(r=>r.json()).catch(()=>null)
        )
      )
      const map = {}
      results.forEach((r,i) => {
        const s = HEATMAP_SECTORS[i]
        map[s.inds_cd] = r.status==='fulfilled' && r.value?.flu_rt != null
          ? Number(r.value.flu_rt) : null
      })
      setRates(map); setFetched(true)
    } catch {}
    finally { setLoading(false) }
  }, [fetched])

  useEffect(() => { load() }, [load])

  const kospi  = HEATMAP_SECTORS.filter(s=>s.mrkt==='0')
  const kosdaq = HEATMAP_SECTORS.filter(s=>s.mrkt==='1')

  return (
    <section className="dash-section">
      <div className="db-section-header">
        <span className="db-section-label">
          🗂 섹터 히트맵
          {loading && <span className="db-section-loading"> 로딩 중...</span>}
        </span>
        <button className="btn-outline" style={{fontSize:10}} onClick={()=>{setFetched(false); load()}}>↺</button>
      </div>

      <div className="db-heatmap-group-label">KOSPI</div>
      <div className="db-heatmap-grid">
        {kospi.map(s => {
          const rate = rates[s.inds_cd] ?? null
          const {bg,txt} = heatColor(rate)
          const sign = rate > 0 ? '+' : ''
          return (
            <div key={s.inds_cd} className="db-heat-cell" style={{background:bg}}
              onClick={() => onSectorClick && onSectorClick(s)}>
              <div className="db-heat-name" style={{color:txt+'cc'}}>{s.name}</div>
              <div className="db-heat-rate" style={{color:txt}}>
                {rate !== null ? `${sign}${rate.toFixed(2)}%` : '—'}
              </div>
            </div>
          )
        })}
      </div>

      <div className="db-heatmap-group-label" style={{marginTop:10}}>KOSDAQ</div>
      <div className="db-heatmap-grid">
        {kosdaq.map(s => {
          const rate = rates[s.inds_cd] ?? null
          const {bg,txt} = heatColor(rate)
          const sign = rate > 0 ? '+' : ''
          return (
            <div key={s.inds_cd} className="db-heat-cell" style={{background:bg}}
              onClick={() => onSectorClick && onSectorClick(s)}>
              <div className="db-heat-name" style={{color:txt+'cc'}}>{s.name}</div>
              <div className="db-heat-rate" style={{color:txt}}>
                {rate !== null ? `${sign}${rate.toFixed(2)}%` : '—'}
              </div>
            </div>
          )
        })}
      </div>

      {/* 범례 */}
      <div className="db-heat-legend">
        {[[-3,'#450a0a'],[-1.5,'#991b1b'],[-0.3,'#7f1d1d'],[0,'#1e293b'],[0.3,'#1a3a24'],[1.5,'#166534'],[3,'#14532d']].map(([v,bg])=>(
          <div key={v} className="db-heat-legend-item">
            <div style={{width:10,height:10,borderRadius:2,background:bg,flexShrink:0}}/>
            <span>{v>0?'+':''}{v}%</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ══════════════════════════════════════════════════════
// ④ 환율 카드 행
// ══════════════════════════════════════════════════════
function ForexRow({ forexData, loading, onChartClick, onMultiClick }) {
  return (
    <div className="db-forex-row">
      {FOREX_META.map(item => {
        const d = forexData?.[item.key]
        const up = d?.changeRate >= 0
        const vals = (d?.candles||[]).map(c=>c.close).filter(Boolean).slice(-20)
        return (
          <div key={item.key} className="db-forex-card"
            onClick={()=>d && onChartClick({type:'forex',pair:item.key,label:item.label,price:d.price,changeRate:d.changeRate})}>
            {loading || !d ? (
              <><Skeleton h={14} r={4} mb={4}/><Skeleton h={22} r={4} mb={4}/><Skeleton w="50%" h={12} r={4}/></>
            ) : (
              <>
                <div className="db-forex-left">
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    <span className="db-forex-label">{item.label}</span>
                    <span style={{fontSize:9,color:'#475569'}}>({item.desc})</span>
                  </div>
                  <span className="db-forex-value">{item.symbol}{d.price?.toLocaleString(undefined,{maximumFractionDigits:2})}</span>
                  <span className="db-forex-badge" style={{background: up?'rgba(239,68,68,.15)':'rgba(59,130,246,.15)', color: up?'#ef4444':'#60a5fa'}}>
                    {up?'▲':'▼'} {Math.abs(d.changeRate).toFixed(2)}%
                  </span>
                </div>
                {vals.length>=2 && <Sparkline values={vals} color={up?'#d97706':'#94a3b8'}/>}
              </>
            )}
          </div>
        )
      })}
      <div className="db-forex-card db-forex-multi" onClick={onMultiClick}>
        <span style={{fontSize:22}}>📊</span>
        <span style={{fontSize:11,color:'#94a3b8'}}>환율 비교</span>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// ⑤ 글로벌 지수 그룹
// ══════════════════════════════════════════════════════
const GLOBAL_GROUPS = [
  { label:'🌍 해외 지수', items:[
    {sym:'SP500', label:'S&P 500',  color:'#ef4444'},
    {sym:'NASDAQ',label:'NASDAQ',   color:'#0d9488'},
    {sym:'DOW',   label:'DOW',      color:'#2563eb'},
    {sym:'N225',  label:'닛케이',   color:'#ea580c'},
    {sym:'HSI',   label:'항셍',     color:'#dc2626'},
    {sym:'SSE',   label:'상해',     color:'#b91c1c'},
    {sym:'TWI',   label:'대만가권', color:'#0891b2'},
    {sym:'DAX',   label:'DAX',      color:'#7c3aed'},
  ]},
  { label:'📈 채권·금리', items:[
    {sym:'US10Y', label:'미국 10Y', color:'#7c3aed', unit:'%'},
    {sym:'US2Y',  label:'미국 3M',  color:'#6d28d9', unit:'%'},
    {sym:'KR10Y', label:'한국 10Y', color:'#4f46e5', unit:'%'},
  ]},
  { label:'🛢️ 원자재·기타', items:[
    {sym:'WTI',    label:'WTI',      color:'#16a34a'},
    {sym:'BRENT',  label:'브렌트',   color:'#15803d'},
    {sym:'GOLD',   label:'금',       color:'#d97706'},
    {sym:'SILVER', label:'은',       color:'#94a3b8'},
    {sym:'COPPER', label:'구리',     color:'#b45309'},
    {sym:'VIX',    label:'VIX',      color:'#dc2626'},
    {sym:'DXY',    label:'달러인덱스',color:'#0284c7'},
  ]},
]

function GlobalCard({ g, data, loading, onChartClick }) {
  const pc = data ? rateColor(data.changeRate) : '#64748b'
  const up = data?.changeRate > 0
  return (
    <div className="db-global-card" style={{'--gc':g.color}}
      onClick={()=>data && onChartClick({type:'global',sym:g.sym,label:g.label,color:g.color,price:data.price,changeRate:data.changeRate})}>
      <div className="db-global-name" style={{color:g.color}}>{g.label}</div>
      {loading && <Skeleton h={16} r={4} mb={4}/>}
      {!loading && data && (
        <>
          <div className="db-global-price" style={{color:'#f1f5f9'}}>
            {data.price?.toLocaleString(undefined,{maximumFractionDigits:2})}{g.unit||''}
          </div>
          <div className="db-global-badge" style={{
            background: up?'rgba(34,197,94,.12)':'rgba(239,68,68,.12)',
            color: pc
          }}>
            {up?'▲':'▼'} {Math.abs(data.changeRate).toFixed(2)}%
          </div>
        </>
      )}
      {!loading && !data && <div className="db-global-na">—</div>}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// ⑥ 환율 다중 차트 모달
// ══════════════════════════════════════════════════════
const FOREX_COLORS = {USD:'#3b82f6',JPY:'#ef4444',CNY:'#f59e0b',EUR:'#8b5cf6'}

function ForexMultiModal({ forexData, onClose }) {
  const [range, setRange] = useState('3mo')
  const [data,  setData]  = useState(forexData||{})
  const [loading, setLoading] = useState(false)

  const fetch_ = async r => {
    setLoading(true)
    try { const j=await fetch(`/api/kis?type=forex-krw&range=${r}`).then(res=>res.json()); setData(j) }
    catch{} finally { setLoading(false) }
  }
  useEffect(()=>{fetch_(range)},[range])
  useEffect(()=>{
    const fn=e=>{if(e.key==='Escape')onClose()}
    window.addEventListener('keydown',fn); return()=>window.removeEventListener('keydown',fn)
  },[onClose])

  const PERIODS=[{v:'1mo',l:'1개월'},{v:'3mo',l:'3개월'},{v:'6mo',l:'6개월'},{v:'1y',l:'1년'},{v:'5y',l:'5년'}]

  const renderChart=()=>{
    const keys=Object.keys(data).filter(k=>data[k]?.candles?.length>1)
    if(!keys.length) return <div style={{padding:60,textAlign:'center',color:'#64748b'}}>데이터 없음</div>
    const W=Math.min(window.innerWidth-64,900),H=300,pL=64,pR=16,pT=16,pB=32
    const cW=W-pL-pR,cH=H-pT-pB
    const normalized={}
    keys.forEach(k=>{
      const vals=data[k].candles.map(c=>c.close).filter(v=>v>0)
      const base=vals[0]||1
      normalized[k]=vals.map(v=>(v/base)*100)
    })
    const allDates=[...new Set(keys.flatMap(k=>data[k].candles.map(c=>c.date)))].sort()
    const n=allDates.length
    const py=v=>pT+cH-((v-90)/20)*cH
    const px=i=>pL+(i/(n-1||1))*cW
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block',background:'#0f172a',borderRadius:8}}>
        {[90,95,100,105,110].map(v=>(
          <g key={v}>
            <line x1={pL} x2={pL+cW} y1={py(v)} y2={py(v)} stroke="#1e293b" strokeDasharray="3,3"/>
            <text x={pL-4} y={py(v)+4} textAnchor="end" fontSize="9" fill="#475569">{v}%</text>
          </g>
        ))}
        <line x1={pL} x2={pL+cW} y1={py(100)} y2={py(100)} stroke="#334155" strokeWidth="1"/>
        {keys.map(k=>{
          const vals=normalized[k]
          const dates=data[k].candles.map(c=>c.date)
          const pts=dates.map((d,i)=>{
            const xi=allDates.indexOf(d)
            return `${px(xi)},${py(Math.max(85,Math.min(115,vals[i])))}`
          }).join(' ')
          return <polyline key={k} points={pts} fill="none" stroke={FOREX_COLORS[k]} strokeWidth="2" strokeLinejoin="round"/>
        })}
        {allDates.filter((_,i)=>i%Math.max(1,Math.floor(n/6))===0).map((d,i)=>(
          <text key={i} x={px(allDates.indexOf(d))} y={H-8} textAnchor="middle" fontSize="9" fill="#475569">
            {d.slice(0,4)}/{d.slice(4,6)}
          </text>
        ))}
      </svg>
    )
  }

  return (
    <div className="chart-modal-overlay" onClick={onClose}>
      <div className="chart-modal" onClick={e=>e.stopPropagation()} style={{maxWidth:960}}>
        <div className="chart-modal-header">
          <span className="chart-modal-name">📊 원화 환율 비교</span>
          <div className="chart-modal-actions">
            <div className="chart-period-tabs">
              {PERIODS.map(p=>(
                <button key={p.v} className={`chart-period-btn ${range===p.v?'active':''}`}
                  onClick={()=>setRange(p.v)}>{p.l}</button>
              ))}
            </div>
            <button className="chart-modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="chart-modal-body">
          {loading?<div className="chart-loading"><div className="spinner-lg"/>로딩 중...</div>:renderChart()}
        </div>
        <div style={{display:'flex',gap:16,padding:'10px 20px',borderTop:'1px solid #1e293b',flexWrap:'wrap'}}>
          {FOREX_META.map(m=>(
            <div key={m.key} style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{width:20,height:3,background:FOREX_COLORS[m.key],borderRadius:2}}/>
              <span style={{fontSize:11,color:'#94a3b8'}}>{m.label}</span>
              {data[m.key] && (
                <span style={{fontSize:11,color:data[m.key].changeRate>=0?'#ef4444':'#3b82f6'}}>
                  {data[m.key].changeRate>=0?'+':''}{data[m.key].changeRate?.toFixed(2)}%
                </span>
              )}
            </div>
          ))}
          <span style={{fontSize:10,color:'#475569',marginLeft:'auto'}}>* 기간 시작=100 정규화</span>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// ⑦ AI 브리핑
// ══════════════════════════════════════════════════════
function AiBriefing() {
  const [briefing,setBriefing]=useState(()=>{
    try{const r=localStorage.getItem(LS_BRIEFING);if(!r)return null;const{data,date}=JSON.parse(r);return date===new Date().toISOString().slice(0,10)?data:null}catch{return null}
  })
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [open,setOpen]=useState(!!briefing)

  const run=async()=>{
    const key=import.meta.env.VITE_CLAUDE_API_KEY
    if(!key){setError('Claude API 키 미설정');return}
    setLoading(true);setError('')
    try{
      const today=new Date().toLocaleDateString('ko-KR')
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({
          model:'claude-haiku-4-5-20251001',max_tokens:800,
          tools:[{type:'web_search_20250305',name:'web_search'}],
          messages:[{role:'user',content:`오늘(${today}) 한국 주식시장 AI 브리핑. 웹 검색으로 최신 뉴스 찾아 작성해.
## 📊 오늘의 시장 요약 ## 🔑 핵심 이슈 ## 🌏 글로벌 변수 ## 🎯 주목 섹터 ## ⚠️ 리스크 요인`}],
        }),
      })
      const data=await res.json()
      const text=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')||''
      if(!text) throw new Error('응답 없음')
      setBriefing(text);setOpen(true)
      localStorage.setItem(LS_BRIEFING,JSON.stringify({data:text,date:new Date().toISOString().slice(0,10)}))
    }catch(e){setError(e.message)}finally{setLoading(false)}
  }

  return (
    <section className="dash-section db-briefing-section">
      <div className="db-section-header">
        <span className="db-section-label">🤖 AI 시장 브리핑 <span className="db-briefing-badge">web_search</span></span>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {briefing&&<button className="db-briefing-toggle" onClick={()=>setOpen(v=>!v)}>{open?'▲ 접기':'▼ 펼치기'}</button>}
          <button className="btn-outline db-briefing-btn" onClick={run} disabled={loading}>
            {loading?'⟳ 검색 중...':briefing?'↺ 다시 분석':'🔍 오늘 브리핑 생성'}
          </button>
        </div>
      </div>
      {error&&<div className="db-briefing-error">⚠️ {error}</div>}
      {loading&&<div className="db-briefing-loading"><div className="db-briefing-spinner"/><span>웹에서 오늘 시장 정보 검색 중...</span></div>}
      {briefing&&open&&!loading&&(
        <div className="db-briefing-content">
          <pre className="db-briefing-text">{briefing}</pre>
          <div className="db-briefing-meta">오늘({new Date().toLocaleDateString('ko-KR')}) 자동 저장</div>
        </div>
      )}
      {!briefing&&!loading&&!error&&(
        <div className="db-briefing-placeholder">🔍 버튼을 눌러 오늘 시장 브리핑을 생성하세요</div>
      )}
    </section>
  )
}

// ══════════════════════════════════════════════════════
// 메인
// ══════════════════════════════════════════════════════
export default function DashboardPage() {
  const { user } = useAuth()

  const [dashData,      setDashData]      = useState(()=>lsRead(LS_DASH,   getDashTTL()))
  const [globalData,    setGlobalData]    = useState(()=>lsRead(LS_GLOBAL, 300000))
  const [forexData,     setForexData]     = useState(()=>lsRead(LS_FOREX,  300000))
  const [sparkData,     setSparkData]     = useState(()=>lsRead(LS_SPARK,  3600000)||{})
  const [loading,       setLoading]       = useState(()=>!lsRead(LS_DASH,  getDashTTL()))
  const [globalLoading, setGlobalLoading] = useState(()=>!lsRead(LS_GLOBAL,300000))
  const [forexLoading,  setForexLoading]  = useState(()=>!lsRead(LS_FOREX, 300000))
  const [fetchError,    setFetchError]    = useState(false)
  const [lastFetch,     setLastFetch]     = useState('')
  const [chartItem,     setChartItem]     = useState(null)
  const [showForexMulti,setShowForexMulti]= useState(false)

  const timerRef = useRef(null)
  const globalTimer = useRef(null)
  const isFetching = useRef(false)

  // 최소 코드만 fetch (테마 섹션 제거됐으므로 codes 불필요)
  const fetchDashboard = useCallback(async (force=false) => {
    if (isFetching.current) return
    if (!force && lsRead(LS_DASH,getDashTTL())) { setLoading(false); return }
    isFetching.current = true
    try {
      const res = await fetch('/api/kis?type=dashboard&codes=').then(r=>r.json())
      if (res.error) throw new Error(res.error)
      setDashData(res); lsWrite(LS_DASH,res)
      setLastFetch(getNowTime()); setFetchError(false)
    } catch(e) { console.error(e); setFetchError(true) }
    finally { setLoading(false); isFetching.current=false }
  }, [])

  const fetchGlobal = useCallback(async (force=false) => {
    if (!force && lsRead(LS_GLOBAL,300000)) { setGlobalLoading(false); return }
    try {
      const j = await fetch(`/api/kis?type=global-batch&symbols=${BATCH_SYMBOLS.join(',')}`).then(r=>r.json())
      setGlobalData(j); lsWrite(LS_GLOBAL,j)
    } catch {} finally { setGlobalLoading(false) }
  }, [])

  const fetchForex = useCallback(async (force=false) => {
    if (!force && lsRead(LS_FOREX,300000)) { setForexLoading(false); return }
    try {
      const j = await fetch('/api/kis?type=forex-krw&range=1mo').then(r=>r.json())
      setForexData(j); lsWrite(LS_FOREX,j)
    } catch {} finally { setForexLoading(false) }
  }, [])

  useEffect(() => {
    fetchDashboard(true); fetchGlobal(true); fetchForex(true)
    timerRef.current    = setInterval(()=>fetchDashboard(true), isMarketOpen()?30000:300000)
    globalTimer.current = setInterval(()=>fetchGlobal(true),    isUSMarketOpen()?60000:300000)
    return () => { clearInterval(timerRef.current); clearInterval(globalTimer.current) }
  }, [fetchDashboard,fetchGlobal,fetchForex])

  const kstStatus = getKstStatus()
  const isOpen  = kstStatus==='open'
  const isAfter = kstStatus==='after'
  const stMap = {
    open:      {label:'정규장 운영중',color:'#16a34a',dot:true},
    premarket: {label:'장 시작 전',  color:'#d97706',dot:false},
    after:     {label:'시간외 거래', color:'#7c3aed',dot:true},
    holiday:   {label:'휴장일',      color:'#64748b',dot:false},
    closed:    {label:'장 마감',     color:'#64748b',dot:false},
  }
  const st = stMap[kstStatus]||stMap.closed

  // 장단기 스프레드
  const us10y = globalData?.US10Y?.price||0
  const us2y  = globalData?.US2Y?.price||0
  const spread = us10y && us2y ? Math.round((us10y-us2y)*100)/100 : null

  const renderChartModal = () => {
    if (!chartItem) return null
    if (chartItem.isStock) return <StockChartModal stock={{name:chartItem.label,code:chartItem.code}} onClose={()=>setChartItem(null)}/>
    return (
      <GlobalChartModal
        type={chartItem.type==='forex'?'forex':'global'}
        symbol={chartItem.type==='forex'?chartItem.pair:chartItem.sym}
        name={chartItem.label} currentPrice={chartItem.price} changeRate={chartItem.changeRate}
        onClose={()=>setChartItem(null)}
      />
    )
  }

  return (
    <div className="dashboard">
      {/* 헤더 */}
      <div className="dash-header">
        <div className="dash-header-row">
          <div>
            <h1 className="dash-title">시장 대시보드</h1>
            <p className="dash-date">{getTodayStr()}{lastFetch&&<span style={{color:'#64748b'}}> · {lastFetch} 기준</span>}</p>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <div className="db-status-badge" style={{background:st.color+'18',color:st.color,borderColor:st.color+'40'}}>
              {st.dot&&<span className="db-status-dot" style={{background:st.color}}/>}{st.label}
            </div>
            <button className="btn-outline db-refresh-btn"
              onClick={()=>{localStorage.removeItem(LS_DASH);localStorage.removeItem(LS_GLOBAL);localStorage.removeItem(LS_FOREX);fetchDashboard(true);fetchGlobal(true);fetchForex(true)}}
              disabled={loading}>⟳</button>
          </div>
        </div>
      </div>

      {fetchError&&<div className="db-error-banner">⚠️ 데이터 로드 실패 <button onClick={()=>{setFetchError(false);fetchDashboard(true)}} style={{marginLeft:12,fontSize:11,color:'#3b82f6',background:'none',border:'none',cursor:'pointer'}}>↺ 재시도</button></div>}

      {/* ① Hero 차트 */}
      <div style={{padding:'16px 24px 0'}}>
        <HeroChart dashData={dashData} globalData={globalData} forexData={forexData} sparkData={sparkData}/>
      </div>

      {/* ② Pulse strip */}
      <div style={{padding:'10px 24px 0'}}>
        <PulseStrip dashData={dashData} globalData={globalData} forexData={forexData}/>
      </div>

      {/* ③ 섹터 히트맵 */}
      <div style={{padding:'0 24px'}}>
        <SectorHeatmap onSectorClick={null}/>
      </div>

      {/* ④ 환율 */}
      <section className="dash-section">
        <div className="db-section-header">
          <span className="db-section-label">💱 환율 (원화 기준)</span>
          <span className="db-section-note">Yahoo Finance · 5분 갱신</span>
        </div>
        <ForexRow forexData={forexData} loading={forexLoading} onChartClick={setChartItem} onMultiClick={()=>setShowForexMulti(true)}/>
      </section>

      {/* ⑤ 글로벌 지수 */}
      <section className="dash-section">
        <div className="db-section-header">
          <span className="db-section-label">🌐 글로벌 시장</span>
          <span className="db-section-note">{isUSMarketOpen()?'미장 운영중 · 60초 갱신':'Yahoo Finance · 5분 갱신'}</span>
        </div>

        {/* 장단기 스프레드 */}
        {spread!==null&&(
          <div className="db-spread-banner" style={{borderColor:spread<0?'#ef4444':'#16a34a'}}>
            <span>📊 장단기 스프레드 (10Y-3M):</span>
            <span style={{fontWeight:700,color:spread<0?'#ef4444':'#22c55e'}}>{spread>0?'+':''}{spread}%</span>
            <span style={{fontSize:11,color:'#94a3b8',marginLeft:6}}>
              {spread<0?'⚠️ 역전 — 경기침체 선행 신호':spread<0.5?'⚡ 역전 해소 중':'✅ 정상'}
            </span>
          </div>
        )}

        {GLOBAL_GROUPS.map(group=>(
          <div key={group.label} className="db-global-group">
            <div className="db-global-group-label">{group.label}</div>
            <div className="db-global-grid">
              {group.items.map(g=>(
                <GlobalCard key={g.sym} g={g} data={globalData?.[g.sym]} loading={globalLoading} onChartClick={setChartItem}/>
              ))}
            </div>
          </div>
        ))}
        {isUSMarketOpen()&&<div className="db-us-live">🇺🇸 미국 시장 운영중 · 60초 자동 갱신</div>}
      </section>

      <AiBriefing/>

      <div className="dash-footer-note">
        ✅ KIS API · {isOpen?'장중 30초':isAfter?'시간외 2분':'장외 5분'} 자동 갱신
        · 해외지수 {isUSMarketOpen()?'미장 운영중 60초':'5분'} 갱신
      </div>

      {showForexMulti&&<ForexMultiModal forexData={forexData} onClose={()=>setShowForexMulti(false)}/>}
      {renderChartModal()}
    </div>
  )
}
