// src/components/dashboard/HeroChart.jsx
import { useState, useEffect, useCallback } from 'react'
import { rateColor } from '../../utils/format'
import { SECTOR_GROUPS, ALL_ITEMS } from '../../constants/dashboardData'

// ── 데이터 getter ─────────────────────────────────────
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

// ── 마켓 상태 판별 ────────────────────────────────────
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
  const [range,   setRange]   = useState('3mo')
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(false)
  const PERIODS = [{v:'1mo',l:'1개월'},{v:'3mo',l:'3개월'},{v:'6mo',l:'6개월'},{v:'1y',l:'1년'}]

  const item   = ALL_ITEMS.find(x=>x.id===selId)
  const group  = SECTOR_GROUPS.find(g=>g.items.some(x=>x.id===selId))
  const accent = item?.color || group?.accent || '#2563eb'

  const fetchChart = useCallback(async (id, rng) => {
    const it = ALL_ITEMS.find(x=>x.id===id)
    if (!it || it.type==='cb') return
    setLoading(true)
    try {
      let raw = []
      if (it.type==='global') {
        const j = await fetch(`/api/kis?type=global&symbol=${it.sym}&range=${rng}`).then(r=>r.json())
        raw = j.candles||[]
      } else if (it.type==='forex') {
        const j = await fetch(`/api/kis?type=forex-krw&range=${rng}`).then(r=>r.json())
        raw = j[it.pair]?.candles||[]
      }
      setCandles(raw.filter(c=>(c.close||0)>0))
      // 52주 고저 계산해서 부모로 전달
      const valid = raw.filter(c=>(c.close||0)>0)
      if(valid.length && onWeekRange) {
        const highs = valid.map(c=>c.high||c.close||0).filter(v=>v>0)
        const lows  = valid.map(c=>c.low||c.close||0).filter(v=>v>0)
        if(highs.length && lows.length) {
          onWeekRange(it.id, Math.max(...highs), Math.min(...lows))
        }
      }
      // 스파크라인용 최근 20일 종가 전달
      if(valid.length && onSparkData) {
        const recent = valid.slice(-20).map(c=>c.close)
        onSparkData(it.id, recent)
      }
    } catch(e){console.error(e)}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{ fetchChart(selId, range) },[selId, range])

  // KOSPI/KOSDAQ 52주 데이터 초기 로드 (1년치)
  useEffect(()=>{
    if(onWeekRange) {
      fetchChart('KOSPI',  '1y')
      fetchChart('KOSDAQ', '1y')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  // 현재가
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

  const renderLine = () => {
    if (!candles.length) return <div className="db-hero-empty">데이터를 불러오는 중...</div>
    const W=800,H=190,pL=68,pR=16,pT=10,pB=28
    const cW=W-pL-pR,cH=H-pT-pB
    const closes=candles.map(c=>c.close)
    const rawMin=Math.min(...closes), rawMax=Math.max(...closes)
    const pad=(rawMax-rawMin)*0.05||rawMax*0.01

    // ── Y축: 보기 좋은 눈금 자동 계산 ──
    const niceNum=(r,round)=>{const e=Math.floor(Math.log10(r));const f=r/Math.pow(10,e);let nf;if(round){if(f<1.5)nf=1;else if(f<3)nf=2;else if(f<7)nf=5;else nf=10;}else{if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=5)nf=5;else nf=10;}return nf*Math.pow(10,e)}
    const tickInterval=niceNum((rawMax-rawMin)/4,true)
    const yMin=Math.floor((rawMin-pad)/tickInterval)*tickInterval
    const yMax=Math.ceil( (rawMax+pad)/tickInterval)*tickInterval
    const yRng=yMax-yMin||1
    const py=v=>pT+cH-(v-yMin)/yRng*cH
    const px=i=>pL+(i/(candles.length-1||1))*cW
    const pts=candles.map((c,i)=>`${px(i)},${py(c.close)}`).join(' ')

    // Y 눈금 목록
    const yTicks=[]
    for(let v=yMin;v<=yMax+tickInterval*0.01;v+=tickInterval) yTicks.push(Math.round(v*100)/100)

    // ── X축: 기간별 레이블 형식 ──
    // 1년/6개월 → 'YY년MM월' or 'MM월' 단위 / 3개월/1개월 → MM/DD
    const useMon = range==='1y' || range==='6mo'
    const useYr  = range==='1y'
    const xLabels=[]
    if (useMon) {
      // 월이 바뀌는 첫 캔들만 표시
      let lastMon=''
      candles.forEach((c,i)=>{
        const d=String(c.date||''); if(d.length<6) return
        const yr=d.slice(2,4), mo=d.slice(4,6)
        const key=`${yr}${mo}`
        if(key!==lastMon){ lastMon=key; xLabels.push({x:px(i), lbl: useYr ? `${yr}년${mo}월` : `${mo}월`}) }
      })
    } else {
      const step=Math.max(1,Math.floor(candles.length/6))
      candles.forEach((c,i)=>{
        if(i%step===0||i===candles.length-1){
          const d=String(c.date||'')
          xLabels.push({x:px(i), lbl:d.length>=8?`${d.slice(4,6)}/${d.slice(6,8)}`:d})
        }
      })
    }
    // X 레이블 최대 8개로 제한 (겹침 방지)
    const filteredX = xLabels.length>8
      ? xLabels.filter((_,i)=>i%(Math.ceil(xLabels.length/7))===0)
      : xLabels

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block'}}>
        <defs>
          <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={accent} stopOpacity="0.2"/>
            <stop offset="100%" stopColor={accent} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* Y축 그리드 + 눈금 */}
        {yTicks.map((v,i)=>{
          const y=py(v)
          if(y<pT-2||y>pT+cH+2) return null
          return <g key={i}>
            <line x1={pL} x2={pL+cW} y1={y} y2={y} stroke="rgba(15,23,42,0.06)" strokeDasharray="3,4"/>
            <text x={pL-5} y={y+4} textAnchor="end" fontSize="10" fill="#94A3B8">
              {v>=1000?Math.round(v).toLocaleString():v>=10?v.toFixed(1):v.toFixed(2)}
            </text>
          </g>
        })}
        {/* 영역 + 라인 */}
        <polygon points={`${pL},${pT+cH} ${pts} ${px(candles.length-1)},${pT+cH}`} fill="url(#hg)"/>
        <polyline points={pts} fill="none" stroke={accent} strokeWidth="1.8"/>
        <circle cx={px(candles.length-1)} cy={py(closes[closes.length-1])} r="4" fill={accent} stroke="#FFFFFF" strokeWidth="2"/>
        {/* X축 레이블 */}
        {filteredX.map((l,i)=>(
          <text key={i} x={l.x} y={H-6} textAnchor="middle" fontSize="10" fill="#94A3B8">{l.lbl}</text>
        ))}
      </svg>
    )
  }


  if (item?.type==='cb') {
    const d = null // cb has no chart
    return (
      <div className="db-hero-section">
        <div className="db-hero-top-row">
          <div className="db-hero-info">
            <span className="db-hero-sym-label" style={{color:accent}}>{item.label}</span>
            <span className="db-hero-price" style={{color:'var(--text-dim)'}}>차트 없음</span>
            <span style={{fontSize:12,color:'var(--text-secondary)'}}>기준금리는 정책 결정값으로 차트 미제공</span>
          </div>
          <div className="db-hero-periods">
            {PERIODS.map(p=>(
              <button key={p.v} className={`db-period-btn ${range===p.v?'active':''}`}
                onClick={()=>setRange(p.v)}>{p.l}</button>
            ))}
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
        <div className="db-hero-periods">
          {PERIODS.map(p=>(
            <button key={p.v} className={`db-period-btn ${range===p.v?'active':''}`}
              onClick={()=>setRange(p.v)}>{p.l}</button>
          ))}
        </div>
      </div>
      <div className="db-hero-chart">
        {loading
          ? <div className="db-hero-loading"><div className="db-hero-spinner"/></div>
          : renderLine()
        }
      </div>
    </div>
  )
}
export default HeroChart
