import { useState, useEffect, useCallback, useRef } from 'react'
import './StockChartModal.css'

const PERIODS = [
  { label:'분봉', type:'min' }, { label:'일봉', type:'day' },
  { label:'주봉', type:'week' }, { label:'월봉', type:'month' }, { label:'년봉', type:'year' },
]
const RANGES = [
  { label:'1개월', months:1 }, { label:'3개월', months:3 }, { label:'6개월', months:6 },
  { label:'1년', months:12 }, { label:'3년', months:36 }, { label:'전체', months:0 },
]
const MIN_SCOPES = ['1','3','5','10','15','30','60']
const DATA_KEY = {
  min:'stk_min_pole_chart_qry', day:'stk_dt_pole_chart_qry',
  week:'stk_stk_pole_chart_qry', month:'stk_mth_pole_chart_qry', year:'stk_yr_pole_chart_qry',
}
const MA_SETTINGS = [
  { period:5,   color:'#f59e0b' },
  { period:10,  color:'#10b981' },
  { period:20,  color:'#3b82f6' },
  { period:60,  color:'#8b5cf6' },
  { period:120, color:'#ef4444' },
]

function parseN(s) { if (!s) return 0; return parseInt(String(s).replace(/[^0-9-]/g,''))||0 }
function fmt(n) { if (n===undefined||n===null) return '-'; return Number(n).toLocaleString('ko-KR') }
function fmtShort(n) {
  if (!n) return '0'
  if (n>=100000000) return (n/100000000).toFixed(1)+'억'
  if (n>=10000) return (n/10000).toFixed(0)+'만'
  if (n>=1000) return (n/1000).toFixed(1)+'K'
  return String(n)
}
function filterByRange(data, months) {
  if (!months) return data
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth()-months)
  const cutStr = cutoff.toISOString().slice(0,10).replace(/-/g,'')
  return data.filter(d=>d.dateRaw>=cutStr)
}
function calcMA(data, period) {
  return data.map((_,i)=>{
    if (i<period-1) return null
    return Math.round(data.slice(i-period+1,i+1).reduce((s,d)=>s+(d.close||0),0)/period)
  })
}

function CandleChart({ data, width, height, showMA }) {
  const [tooltip, setTooltip] = useState(null)
  const svgRef = useRef(null)
  if (!data||data.length===0) return null

  const PAD = {top:12,right:8,bottom:24,left:80}
  const W = width-PAD.left-PAD.right
  const H = height-PAD.top-PAD.bottom

  const prices = data.flatMap(d=>[d.high,d.low]).filter(Boolean)
  const rawMin = Math.min(...prices)
  const rawMax = Math.max(...prices)
  const margin = (rawMax-rawMin)*0.06||rawMin*0.005
  const minP = rawMin-margin
  const maxP = rawMax+margin
  const rangeP = maxP-minP

  const py = v=>PAD.top+H-((v-minP)/rangeP)*H
  const barW = Math.max(1,Math.min(12,W/data.length-1))
  const bx = i=>PAD.left+(i+0.5)*(W/data.length)

  const yTicks = Array.from({length:5},(_,i)=>minP+(rangeP/4)*i)
  const xTickStep = Math.max(1,Math.floor(data.length/7))

  const maLines = showMA ? MA_SETTINGS.map(({period,color})=>{
    const maData = calcMA(data,period)
    const pts = maData.map((v,i)=>v?`${bx(i)},${py(v)}`:null).filter(Boolean)
    return pts.length>=2 ? {period,color,points:pts.join(' ')} : null
  }).filter(Boolean) : []

  const handleMouseMove = e=>{
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX-rect.left-PAD.left
    const idx = Math.round(x/(W/data.length)-0.5)
    setTooltip({idx:Math.max(0,Math.min(data.length-1,idx)),x:e.clientX-rect.left,y:e.clientY-rect.top})
  }
  const td = tooltip?data[tooltip.idx]:null
  const maValues = showMA&&td ? MA_SETTINGS.map(({period,color})=>{
    const v = calcMA(data,period)[tooltip.idx]
    return v?{period,color,v}:null
  }).filter(Boolean) : []

  return (
    <div style={{position:'relative'}}>
      <svg ref={svgRef} width={width} height={height} onMouseMove={handleMouseMove} onMouseLeave={()=>setTooltip(null)} style={{display:'block',cursor:'crosshair'}}>
        {yTicks.map((v,i)=>(
          <g key={i}>
            <line x1={PAD.left} y1={py(v)} x2={PAD.left+W} y2={py(v)} stroke="#e2e8f0" strokeWidth={0.5} strokeDasharray="3,3"/>
            <text x={PAD.left-5} y={py(v)+4} textAnchor="end" fontSize={10} fill="#94a3b8">{fmt(Math.round(v))}</text>
          </g>
        ))}
        {data.filter((_,i)=>i%xTickStep===0).map((d,i)=>(
          <text key={i} x={bx(data.indexOf(d))} y={PAD.top+H+16} textAnchor="middle" fontSize={10} fill="#94a3b8">{d.dateLabel}</text>
        ))}
        {data.map((d,i)=>{
          const isUp=d.close>=d.open, color=isUp?'#ef4444':'#3b82f6', cx=bx(i)
          const bodyTop=py(Math.max(d.open,d.close)), bodyH=Math.max(1,py(Math.min(d.open,d.close))-bodyTop)
          return (
            <g key={i}>
              <line x1={cx} y1={py(d.high)} x2={cx} y2={py(d.low)} stroke={color} strokeWidth={1}/>
              <rect x={cx-barW/2} y={bodyTop} width={barW} height={bodyH} fill={color}/>
            </g>
          )
        })}
        {maLines.map(ma=>(
          <polyline key={ma.period} points={ma.points} fill="none" stroke={ma.color} strokeWidth={1.2} opacity={0.85}/>
        ))}
        {tooltip&&td&&(
          <>
            <line x1={bx(tooltip.idx)} y1={PAD.top} x2={bx(tooltip.idx)} y2={PAD.top+H} stroke="#64748b" strokeWidth={0.8} strokeDasharray="4,2"/>
            <line x1={PAD.left} y1={tooltip.y} x2={PAD.left+W} y2={tooltip.y} stroke="#64748b" strokeWidth={0.8} strokeDasharray="4,2"/>
          </>
        )}
      </svg>
      {tooltip&&td&&(
        <div className="smc-tooltip" style={{left:tooltip.x>width/2?tooltip.x-160:tooltip.x+10,top:Math.min(tooltip.y,height-180)}}>
          <div className="smc-tt-date">{td.dateLabel}</div>
          <div className="smc-tt-row"><span>시가</span><b>{fmt(td.open)}</b></div>
          <div className="smc-tt-row"><span>고가</span><b style={{color:'#ef4444'}}>{fmt(td.high)}</b></div>
          <div className="smc-tt-row"><span>저가</span><b style={{color:'#3b82f6'}}>{fmt(td.low)}</b></div>
          <div className="smc-tt-row"><span>종가</span><b style={{color:td.close>=td.open?'#ef4444':'#3b82f6'}}>{fmt(td.close)}</b></div>
          <div className="smc-tt-row"><span>거래량</span><b>{fmtShort(td.volume)}</b></div>
          {maValues.map(({period,color,v})=>(
            <div key={period} className="smc-tt-row"><span style={{color}}>MA{period}</span><b>{fmt(v)}</b></div>
          ))}
        </div>
      )}
    </div>
  )
}

function VolumeChart({ data, width, height }) {
  if (!data||data.length===0) return null
  const PAD = {top:4,right:8,bottom:4,left:80}
  const W = width-PAD.left-PAD.right, H = height-PAD.top-PAD.bottom
  const maxV = Math.max(...data.map(d=>d.volume||0))
  const barW = Math.max(1,Math.min(12,W/data.length-1))
  const bx = i=>PAD.left+(i+0.5)*(W/data.length)
  return (
    <svg width={width} height={height} style={{display:'block'}}>
      <text x={PAD.left-5} y={PAD.top+10} textAnchor="end" fontSize={9} fill="#94a3b8">거래량</text>
      {data.map((d,i)=>{
        const barH = maxV>0?(d.volume/maxV)*H:0
        return <rect key={i} x={bx(i)-barW/2} y={PAD.top+H-barH} width={barW} height={Math.max(1,barH)} fill={d.close>=d.open?'#fca5a5':'#93c5fd'} opacity={0.8}/>
      })}
    </svg>
  )
}

function LineChart({ data, width, height }) {
  const [tooltip, setTooltip] = useState(null)
  const svgRef = useRef(null)
  if (!data||data.length===0) return null

  const PAD = {top:12,right:8,bottom:24,left:80}
  const W = width-PAD.left-PAD.right, H = height-PAD.top-PAD.bottom
  const prices = data.map(d=>d.close).filter(Boolean)
  const rawMin = Math.min(...prices), rawMax = Math.max(...prices)
  const margin = (rawMax-rawMin)*0.1||rawMin*0.005
  const minP = rawMin-margin, maxP = rawMax+margin, rangeP = maxP-minP
  const py = v=>PAD.top+H-((v-minP)/rangeP)*H
  const px = i=>PAD.left+(i/(data.length-1))*W
  const yTicks = Array.from({length:5},(_,i)=>minP+(rangeP/4)*i)
  const xTickStep = Math.max(1,Math.floor(data.length/7))
  const isUp = prices[prices.length-1]>=prices[0]
  const lc = isUp?'#ef4444':'#3b82f6'
  const points = data.map((d,i)=>`${px(i)},${py(d.close)}`).join(' ')
  const fillPath = `M${PAD.left},${PAD.top+H} `+data.map((d,i)=>`L${px(i)},${py(d.close)}`).join(' ')+` L${PAD.left+W},${PAD.top+H} Z`
  const handleMouseMove = e=>{
    const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return
    const x = e.clientX-rect.left-PAD.left
    setTooltip({idx:Math.max(0,Math.min(data.length-1,Math.round(x/W*(data.length-1)))),x:e.clientX-rect.left,y:e.clientY-rect.top})
  }
  const td = tooltip?data[tooltip.idx]:null
  return (
    <div style={{position:'relative'}}>
      <svg ref={svgRef} width={width} height={height} onMouseMove={handleMouseMove} onMouseLeave={()=>setTooltip(null)} style={{display:'block',cursor:'crosshair'}}>
        {yTicks.map((v,i)=>(
          <g key={i}>
            <line x1={PAD.left} y1={py(v)} x2={PAD.left+W} y2={py(v)} stroke="#e2e8f0" strokeWidth={0.5} strokeDasharray="3,3"/>
            <text x={PAD.left-5} y={py(v)+4} textAnchor="end" fontSize={10} fill="#94a3b8">{fmt(Math.round(v))}</text>
          </g>
        ))}
        {data.filter((_,i)=>i%xTickStep===0).map((d,i)=>(
          <text key={i} x={px(i*xTickStep)} y={PAD.top+H+16} textAnchor="middle" fontSize={10} fill="#94a3b8">{d.dateLabel}</text>
        ))}
        <path d={fillPath} fill={isUp?'#fef2f2':'#eff6ff'} opacity={0.4}/>
        <polyline points={points} fill="none" stroke={lc} strokeWidth={1.5}/>
        {tooltip&&td&&(
          <>
            <line x1={px(tooltip.idx)} y1={PAD.top} x2={px(tooltip.idx)} y2={PAD.top+H} stroke="#64748b" strokeWidth={0.8} strokeDasharray="4,2"/>
            <circle cx={px(tooltip.idx)} cy={py(td.close)} r={3} fill={lc}/>
          </>
        )}
      </svg>
      {tooltip&&td&&(
        <div className="smc-tooltip" style={{left:tooltip.x>width/2?tooltip.x-145:tooltip.x+10,top:Math.min(tooltip.y,height-100)}}>
          <div className="smc-tt-date">{td.dateLabel}</div>
          <div className="smc-tt-row"><span>가격</span><b style={{color:lc}}>{fmt(td.close)}</b></div>
          <div className="smc-tt-row"><span>거래량</span><b>{fmtShort(td.volume)}</b></div>
        </div>
      )}
    </div>
  )
}

export default function StockChartModal({ stock, onClose }) {
  const [period, setPeriod]       = useState('day')
  const [scope, setScope]         = useState('5')
  const [range, setRange]         = useState(3)
  const [showMA, setShowMA]       = useState(true)
  const [allData, setAllData]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [priceInfo, setPriceInfo] = useState(null)
  const [basicInfo, setBasicInfo] = useState(null)
  const [stockInfo, setStockInfo] = useState(null)
  const wrapRef = useRef(null)
  const [chartWidth, setChartWidth] = useState(800)

  useEffect(()=>{
    const update = ()=>{ if(wrapRef.current) setChartWidth(wrapRef.current.clientWidth) }
    update(); window.addEventListener('resize',update)
    return ()=>window.removeEventListener('resize',update)
  },[])

  useEffect(()=>{
    const fn = e=>{ if(e.key==='Escape') onClose() }
    window.addEventListener('keydown',fn); return ()=>window.removeEventListener('keydown',fn)
  },[onClose])

  const fetchChart = useCallback(async ()=>{
    if (!stock?.code) return
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({type:'chart',chartType:period,code:stock.code})
      if (period==='min') params.set('scope',scope)
      const json = await fetch(`/api/kiwoom?${params}`).then(r=>r.json())
      if (json.error) throw new Error(json.error)
      const raw = (json[DATA_KEY[period]]||[]).map(d=>{
        const s = String(d.dt||d.cntr_tm||'')
        let dateLabel = period==='min' ? (s.length>=4?s.slice(0,2)+':'+s.slice(2,4):s)
          : s.length===8 ? s.slice(4,6)+'/'+s.slice(6,8) : s
        return {dateRaw:s,dateLabel,open:parseN(d.open_pric),high:parseN(d.high_pric),low:parseN(d.low_pric),close:parseN(d.cur_prc),volume:parseN(d.trde_qty)}
      }).reverse()
      setAllData(raw)
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  },[stock?.code,period,scope])

  const fetchInfos = useCallback(async ()=>{
    if (!stock?.code) return
    const [p,b,s] = await Promise.allSettled([
      fetch(`/api/kiwoom?type=price&code=${stock.code}`).then(r=>r.json()),
      fetch(`/api/kiwoom?type=stockbasic&code=${stock.code}`).then(r=>r.json()),
      fetch(`/api/kiwoom?type=stockinfo&code=${stock.code}`).then(r=>r.json()),
    ])
    if (p.status==='fulfilled'&&!p.value?.error) setPriceInfo(p.value)
    if (b.status==='fulfilled'&&!b.value?.error) setBasicInfo(b.value)
    if (s.status==='fulfilled'&&!s.value?.error) setStockInfo(s.value)
  },[stock?.code])

  useEffect(()=>{ fetchChart() },[fetchChart])
  useEffect(()=>{ fetchInfos() },[fetchInfos])

  if (!stock) return null

  const chartData = period==='min' ? allData : filterByRange(allData,range)
  const isUp = priceInfo?.change>0, isDown = priceInfo?.change<0
  const pc = isUp?'#ef4444':isDown?'#3b82f6':'#1e293b'
  const sign = isUp?'+':''
  const bi = basicInfo||{}, si = stockInfo||{}

  const infoItems = [
    {label:'시가',    value:priceInfo?fmt(priceInfo.open)+'원':'-'},
    {label:'고가',    value:priceInfo?fmt(priceInfo.high)+'원':'-',  color:'#ef4444'},
    {label:'저가',    value:priceInfo?fmt(priceInfo.low)+'원':'-',   color:'#3b82f6'},
    {label:'거래량',  value:priceInfo?fmtShort(priceInfo.volume):'-'},
    {label:'시가총액', value:bi.mac?fmt(parseN(bi.mac))+'억':'-'},
    {label:'PER',    value:bi.per&&bi.per!=='0'?Number(bi.per).toFixed(1)+'배':'-'},
    {label:'PBR',    value:bi.pbr&&bi.pbr!=='0'?Number(bi.pbr).toFixed(2)+'배':'-'},
    {label:'EPS',    value:bi.eps&&bi.eps!=='0'?fmt(parseN(bi.eps))+'원':'-'},
    {label:'ROE',    value:bi.roe&&bi.roe!=='0'?Number(bi.roe).toFixed(1)+'%':'-'},
    {label:'외국인',  value:bi.for_exh_rt?bi.for_exh_rt+'%':'-'},
    {label:'유통비율', value:bi.dstr_rt?bi.dstr_rt+'%':'-'},
    {label:'업종',    value:si.upName||'-'},
  ]

  return (
    <div className="smc-overlay" onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
      <div className="smc-modal">

        <div className="smc-header">
          <div className="smc-title-wrap">
            <span className="smc-name">{stock.name}</span>
            <span className="smc-code">{stock.code}</span>
            {priceInfo?.current&&(
              <div className="smc-price-wrap">
                <span className="smc-cur-price" style={{color:pc}}>{fmt(priceInfo.current)}원</span>
                <span className="smc-change" style={{color:pc}}>{sign}{fmt(priceInfo.change)}원 ({sign}{Number(priceInfo.changeRate).toFixed(2)}%)</span>
              </div>
            )}
          </div>
          <button className="smc-close" onClick={onClose}>✕</button>
        </div>

        <div className="smc-controls">
          <div className="smc-period-tabs">
            {PERIODS.map(p=>(
              <button key={p.type} className={`smc-tab ${period===p.type?'active':''}`} onClick={()=>setPeriod(p.type)}>{p.label}</button>
            ))}
          </div>
          {period==='min' ? (
            <div className="smc-scope-wrap">
              {MIN_SCOPES.map(s=>(
                <button key={s} className={`smc-scope-btn ${scope===s?'active':''}`} onClick={()=>setScope(s)}>{s}분</button>
              ))}
            </div>
          ) : (
            <div className="smc-range-wrap">
              {RANGES.map(r=>(
                <button key={r.label} className={`smc-scope-btn ${range===r.months?'active':''}`} onClick={()=>setRange(r.months)}>{r.label}</button>
              ))}
            </div>
          )}
          <button className={`smc-ma-btn ${showMA?'active':''}`} onClick={()=>setShowMA(v=>!v)}>MA</button>
          {showMA&&period!=='min'&&(
            <div className="smc-ma-legend">
              {MA_SETTINGS.map(({period:p,color})=>(
                <span key={p} style={{color,fontSize:'11px',fontWeight:600}}>MA{p}</span>
              ))}
            </div>
          )}
        </div>

        <div className="smc-chart-wrap" ref={wrapRef}>
          {loading&&<div className="smc-loading">⟳ 차트 불러오는 중...</div>}
          {error  &&<div className="smc-error">⚠️ {error}</div>}
          {!loading&&!error&&chartData.length>0&&(
            <>
              {period==='min'
                ? <LineChart data={chartData} width={chartWidth} height={300}/>
                : <CandleChart data={chartData} width={chartWidth} height={300} showMA={showMA}/>
              }
              <VolumeChart data={chartData} width={chartWidth} height={70}/>
            </>
          )}
          {!loading&&!error&&chartData.length===0&&<div className="smc-empty">데이터가 없습니다</div>}
        </div>

        <div className="smc-info-bar">
          {infoItems.map(item=>(
            <div key={item.label} className="smc-info-item">
              <span className="smc-info-label">{item.label}</span>
              <span className="smc-info-value" style={{color:item.color}}>{item.value}</span>
            </div>
          ))}
          <a className="smc-dart-btn"
            href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(stock.name)}`}
            target="_blank" rel="noreferrer">📋 공시</a>
        </div>
      </div>
    </div>
  )
}
