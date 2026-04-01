// src/components/dashboard/HeroChart.jsx
import { useState, useEffect, useCallback } from 'react'
import { rateColor } from '../../utils/format'
import { SECTOR_GROUPS, ALL_ITEMS } from '../../constants/dashboardData'

// 국내지수 심볼 → 키움 업종코드
const KIWOOM_IDS = { 'KOSPI': '001', 'KOSDAQ': '101' }

function getItemData(item, dashData, globalData, forexData, cbRates) {
  if (item.type==='global') return globalData?.[item.sym] || null
  if (item.type==='forex')  {
    const d = forexData?.[item.pair]
    return d ? { price:d.price, changeRate:d.changeRate, change:d.change, marketState:'CURRENCY' } : null
  }
  if (item.type==='cb') {
    const d = cbRates?.[item.cbKey]
    return d ? { price:d.rate, changeRate:null, isCB:true, date:d.date } : null
  }
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

function HeroChart({ selId, onSelChange, dashData, globalData, forexData, onWeekRange, onSparkData }) {
  const [range,     setRange]     = useState('6mo')
  const [chartType, setChartType] = useState('line') // 'line' | 'candle'
  const [candles,   setCandles]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const PERIODS = [{v:'1mo',l:'1M'},{v:'3mo',l:'3M'},{v:'6mo',l:'6M'},{v:'1y',l:'1Y'}]

  const item   = ALL_ITEMS.find(x=>x.id===selId)
  const group  = SECTOR_GROUPS.find(g=>g.items.some(x=>x.id===selId))
  const accent = item?.color || group?.accent || '#2563eb'

  // ── range → 키움 period 매핑 ────────────────────
  const toKiwoomPeriod = rng => rng==='1y' ? 'week' : 'day'
  const toKiwoomSlice  = rng => ({ '1mo':22, '3mo':65, '6mo':130, '1y':52 }[rng] || 130)

  const fetchChart = useCallback(async (id, rng, isSparkLoad=false) => {
    const it = ALL_ITEMS.find(x=>x.id===id)
    if (!it || it.type==='cb') return
    if (!isSparkLoad) setLoading(true)
    try {
      let raw = []
      const inds = KIWOOM_IDS[id]
      if (inds) {
        // 국내지수 → 키움 index-chart (실시간, 당일 반영)
        const period = toKiwoomPeriod(rng)
        const j = await fetch(`/api/kiwoom?type=index-chart&inds_cd=${inds}&period=${period}`).then(r=>r.json())
        raw = (j.candles || []).slice(-toKiwoomSlice(rng)).map(c => ({
          date:  c.time || c.label || '',
          open:  c.open,
          high:  c.high,
          low:   c.low,
          close: c.close,
        }))
      } else if (it.type==='global') {
        const j = await fetch(`/api/kis?type=global&symbol=${it.sym}&range=${rng}`).then(r=>r.json())
        raw = j.candles||[]
      } else if (it.type==='forex') {
        const j = await fetch(`/api/kis?type=forex-krw&range=${rng}`).then(r=>r.json())
        raw = j[it.pair]?.candles||[]
      }
      const valid = raw.filter(c=>(c.close||0)>0)
      if (!isSparkLoad) setCandles(valid)
      if (isSparkLoad && valid.length && onWeekRange) {
        const highs = valid.map(c=>c.high||c.close||0).filter(v=>v>0)
        const lows  = valid.map(c=>c.low||c.close||0).filter(v=>v>0)
        if (highs.length && lows.length) onWeekRange(it.id, Math.max(...highs), Math.min(...lows))
      }
      if (isSparkLoad && valid.length && onSparkData) {
        onSparkData(it.id, valid.map(c=>c.close))
      }
    } catch(e){ console.error(e) }
    finally{ if (!isSparkLoad) setLoading(false) }
  }, [])

  const loadDomesticSpark = useCallback(async () => {
    try {
      const j = await fetch('/api/kiwoom?type=index-spark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then(r => r.json())
      for (const [id, payload] of Object.entries(j)) {
        const candles = (payload?.candles || []).filter(c => (c.close || 0) > 0)
        if (!candles.length) continue
        if (onSparkData) onSparkData(id, candles.map(c => c.close))
        if (onWeekRange) {
          const highs = candles.map(c => c.high || c.close || 0).filter(v => v > 0)
          const lows  = candles.map(c => c.low  || c.close || 0).filter(v => v > 0)
          if (highs.length && lows.length) onWeekRange(id, Math.max(...highs), Math.min(...lows))
        }
      }
    } catch(e) {
      fetchChart('KOSPI',  '1y', true)
      fetchChart('KOSDAQ', '1y', true)
    }
  }, [fetchChart])

  useEffect(()=>{ fetchChart(selId, range) },[selId, range])

  useEffect(()=>{
    loadDomesticSpark()
    fetchChart('SP500',  '1y', true)
    fetchChart('NASDAQ', '1y', true)
    fetchChart('DOW',    '1y', true)
    fetchChart('N225',   '1y', true)
    fetchChart('WTI',    '1y', true)
    fetchChart('GOLD',   '1y', true)
    fetchChart('BRENT',  '1y', true)
    fetchChart('SILVER', '1y', true)
    fetchChart('COPPER', '1y', true)
  }, [])

  const getCur = () => {
    if (!item) return null
    if (item.type==='global') return globalData?.[item.sym]||null
    if (item.type==='forex')  {
      const d=forexData?.[item.pair]; return d?{price:d.price,changeRate:d.changeRate,change:d.change}:null
    }
    return null
  }
  const cur = getCur()
  const pc  = cur ? rateColor(cur.changeRate) : '#94a3b8'

  // ── 공통 SVG 축 계산 ────────────────────────────
  const buildAxis = () => {
    const W=800,H=190,pL=68,pR=16,pT=10,pB=28
    const cW=W-pL-pR, cH=H-pT-pB
    const closes = candles.map(c=>c.close)
    const highs  = candles.map(c=>c.high||c.close)
    const lows   = candles.map(c=>c.low||c.close)
    const rawMin = Math.min(...lows),  rawMax = Math.max(...highs)
    const pad    = (rawMax-rawMin)*0.05||rawMax*0.01
    const niceNum=(r,round)=>{const e=Math.floor(Math.log10(r));const f=r/Math.pow(10,e);let nf;if(round){if(f<1.5)nf=1;else if(f<3)nf=2;else if(f<7)nf=5;else nf=10;}else{if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=5)nf=5;else nf=10;}return nf*Math.pow(10,e)}
    const tickInterval=niceNum((rawMax-rawMin)/4,true)||1
    const yMin=Math.floor((rawMin-pad)/tickInterval)*tickInterval
    const yMax=Math.ceil( (rawMax+pad)/tickInterval)*tickInterval
    const yRng=yMax-yMin||1
    const py=v=>pT+cH-(v-yMin)/yRng*cH
    const px=i=>pL+(i/(candles.length-1||1))*cW
    // Y 눈금
    const yTicks=[]
    for(let v=yMin;v<=yMax+tickInterval*0.01;v+=tickInterval) yTicks.push(Math.round(v*100)/100)
    // X 레이블
    const useMon=range==='1y'||range==='6mo'
    const useYr=range==='1y'
    const xLabels=[]
    if(useMon){
      let lastMon=''
      candles.forEach((c,i)=>{
        const d=String(c.date||c.time||''); if(d.length<6) return
        const yr=d.slice(2,4)||d.slice(0,4), mo=d.slice(d.length>=8?4:4,d.length>=8?6:6)
        const moStr=d.length>=8?d.slice(4,6):d.slice(4,6)
        const yrStr=d.length>=8?d.slice(2,4):d.slice(2,4)
        const key=`${yrStr}${moStr}`
        if(key!==lastMon){lastMon=key;xLabels.push({x:px(i),lbl:useYr?`${yrStr}/${moStr}`:`${moStr}월`})}
      })
    } else {
      const step=Math.max(1,Math.floor(candles.length/6))
      candles.forEach((c,i)=>{
        if(i%step===0||i===candles.length-1){
          const d=String(c.date||c.time||'')
          xLabels.push({x:px(i),lbl:d.length>=8?`${d.slice(4,6)}/${d.slice(6,8)}`:d})
        }
      })
    }
    const filteredX=xLabels.length>8?xLabels.filter((_,i)=>i%(Math.ceil(xLabels.length/7))===0):xLabels
    return { W,H,pL,pR,pT,pB,cW,cH,py,px,yTicks,filteredX,closes }
  }

  // ── 선형 차트 렌더링 ─────────────────────────────
  const renderLine = () => {
    if (!candles.length) return <div className="db-hero-empty">데이터를 불러오는 중...</div>
    const { W,H,pL,pT,cH,py,px,yTicks,filteredX,closes } = buildAxis()
    const pts=candles.map((c,i)=>`${px(i).toFixed(1)},${py(c.close).toFixed(1)}`).join(' ')
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block'}}>
        <defs>
          <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={accent} stopOpacity="0.18"/>
            <stop offset="100%" stopColor={accent} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {yTicks.map((v,i)=>{
          const y=py(v); if(y<pT-2||y>pT+cH+2) return null
          return <g key={i}>
            <line x1={pL} x2={pL+(W-pL-16)} y1={y} y2={y} stroke="rgba(15,23,42,0.06)" strokeDasharray="3,4"/>
            <text x={pL-5} y={y+4} textAnchor="end" fontSize="10" fill="#94A3B8">
              {v>=1000?Math.round(v).toLocaleString():v>=10?v.toFixed(1):v.toFixed(2)}
            </text>
          </g>
        })}
        <polygon points={`${pL},${pT+cH} ${pts} ${px(candles.length-1).toFixed(1)},${pT+cH}`} fill="url(#hg)"/>
        <polyline points={pts} fill="none" stroke={accent} strokeWidth="1.8"/>
        <circle cx={px(candles.length-1).toFixed(1)} cy={py(closes[closes.length-1]).toFixed(1)}
          r="4" fill={accent} stroke="#FFFFFF" strokeWidth="2"/>
        {filteredX.map((l,i)=>(
          <text key={i} x={l.x} y={H-6} textAnchor="middle" fontSize="10" fill="#94A3B8">{l.lbl}</text>
        ))}
      </svg>
    )
  }

  // ── 캔들 차트 렌더링 ─────────────────────────────
  const renderCandle = () => {
    if (!candles.length) return <div className="db-hero-empty">데이터를 불러오는 중...</div>
    const { W,H,pL,pT,cH,py,px,yTicks,filteredX } = buildAxis()
    const barW = Math.max(2, Math.floor((W-pL-16) / candles.length * 0.65))
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block'}}>
        {yTicks.map((v,i)=>{
          const y=py(v); if(y<pT-2||y>pT+cH+2) return null
          return <g key={i}>
            <line x1={pL} x2={pL+(W-pL-16)} y1={y} y2={y} stroke="rgba(15,23,42,0.06)" strokeDasharray="3,4"/>
            <text x={pL-5} y={y+4} textAnchor="end" fontSize="10" fill="#94A3B8">
              {v>=1000?Math.round(v).toLocaleString():v>=10?v.toFixed(1):v.toFixed(2)}
            </text>
          </g>
        })}
        {candles.map((c,i)=>{
          const x    = px(i)
          const o    = py(c.open  || c.close)
          const cl   = py(c.close)
          const hi   = py(c.high  || c.close)
          const lo   = py(c.low   || c.close)
          const up   = c.close >= (c.open || c.close)
          const col  = up ? '#ef4444' : '#2563eb'
          const top  = Math.min(o, cl)
          const bot  = Math.max(o, cl)
          const bodyH= Math.max(1, bot - top)
          if (!isFinite(x)||!isFinite(top)||!isFinite(hi)||!isFinite(lo)) return null
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={hi} y2={lo} stroke={col} strokeWidth="1"/>
              <rect x={x-barW/2} y={top} width={barW} height={bodyH}
                fill={up ? col : 'white'} stroke={col} strokeWidth="0.8"/>
            </g>
          )
        })}
        {filteredX.map((l,i)=>(
          <text key={i} x={l.x} y={H-6} textAnchor="middle" fontSize="10" fill="#94A3B8">{l.lbl}</text>
        ))}
      </svg>
    )
  }

  if (item?.type==='cb') {
    return (
      <div className="db-hero-section">
        <div className="db-hero-top-row">
          <div className="db-hero-info">
            <span className="db-hero-sym-label" style={{color:accent}}>{item.label}</span>
            <span className="db-hero-price" style={{color:'var(--text-dim)'}}>차트 없음</span>
            <span style={{fontSize:12,color:'var(--text-secondary)'}}>기준금리는 정책 결정값으로 차트 미제공</span>
          </div>
        </div>
        <div className="db-hero-chart db-hero-empty">📌 기준금리는 정책 결정 시 업데이트됩니다</div>
      </div>
    )
  }

  return (
    <div className="db-hero-section">
      <div className="db-hero-top-row">
        <div className="db-hero-info">
          <span className="db-hero-sym-label" style={{color:accent}}>{item?.label}</span>
          {cur ? (
            <>
              <span className="db-hero-price">{cur.price?.toLocaleString(undefined,{maximumFractionDigits:2})}{item?.unit||''}</span>
              {cur.changeRate!=null && (
                <span className="db-hero-badge" style={{background:cur.changeRate>=0?'rgba(34,197,94,.12)':'rgba(239,68,68,.12)',color:pc}}>
                  {cur.changeRate>=0?'▲':'▼'}{Math.abs(cur.changeRate).toFixed(2)}%
                </span>
              )}
            </>
          ) : (
            <span className="db-hero-price" style={{color:'var(--text-dim)'}}>—</span>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {/* 차트 타입 토글 */}
          <div className="db-chart-type-tabs">
            <button className={`db-chart-type-btn ${chartType==='line'?'active':''}`}
              onClick={()=>setChartType('line')} title="선형 차트">📈 선형</button>
            <button className={`db-chart-type-btn ${chartType==='candle'?'active':''}`}
              onClick={()=>setChartType('candle')} title="캔들 차트">🕯 캔들</button>
          </div>
          {/* 기간 탭 */}
          <div className="db-hero-periods">
            {PERIODS.map(p=>(
              <button key={p.v} className={`db-period-btn ${range===p.v?'active':''}`}
                onClick={()=>setRange(p.v)}>{p.l}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="db-hero-chart">
        {loading
          ? <div className="db-hero-loading"><div className="db-hero-spinner"/></div>
          : chartType==='candle' ? renderCandle() : renderLine()
        }
      </div>
    </div>
  )
}
export default HeroChart
