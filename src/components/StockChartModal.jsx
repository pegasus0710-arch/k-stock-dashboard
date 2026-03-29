import { useState, useEffect, useCallback, useRef } from 'react'
import './StockChartModal.css'
import FinancialChart from './FinancialChart'

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

const PERIODS = [
  { label:'분봉', type:'min'   },
  { label:'일봉', type:'day'   },
  { label:'주봉', type:'week'  },
  { label:'월봉', type:'month' },
  { label:'년봉', type:'year'  },
]
const RANGES = [
  { label:'1개월', months:1  }, { label:'3개월', months:3  },
  { label:'6개월', months:6  }, { label:'1년',   months:12 },
  { label:'3년',   months:36 }, { label:'전체',  months:0  },
]
const MIN_SCOPES = ['1','3','5','10','15','30','60']
const DATA_KEY = {
  min:'stk_min_pole_chart_qry', day:'stk_dt_pole_chart_qry',
  week:'stk_stk_pole_chart_qry', month:'stk_mth_pole_chart_qry', year:'stk_yr_pole_chart_qry',
}
const MA_SETTINGS = [
  { period:5,   color:'#f59e0b', label:'MA5'   },
  { period:10,  color:'#10b981', label:'MA10'  },
  { period:20,  color:'#3b82f6', label:'MA20'  },
  { period:60,  color:'#8b5cf6', label:'MA60'  },
  { period:120, color:'#ef4444', label:'MA120' },
]
const DRAW_TOOLS = [
  { id:'none',   label:'🖱️ 선택'    },
  { id:'hline',  label:'━ 수평선'   },
  { id:'trend',  label:'↗ 추세선'   },
  { id:'fib',    label:'🔢 피보나치' },
  { id:'split3', label:'⅓ 3분할'   },
  { id:'split4', label:'¼ 4분할'   },
  { id:'text',   label:'📝 메모'    },
]

function parseN(s){ return parseInt(String(s||'').replace(/[^0-9-]/g,''))||0 }
function fmt(n)   { if(n==null) return '-'; return Number(n).toLocaleString('ko-KR') }
function fmtShort(n){ if(!n)return'0'; if(n>=100000000)return(n/100000000).toFixed(1)+'억'; if(n>=10000)return(n/10000).toFixed(0)+'만'; return String(n) }
function calcMA(data,p){ return data.map((_,i)=>{ if(i<p-1)return null; return Math.round(data.slice(i-p+1,i+1).reduce((s,d)=>s+(d.close||0),0)/p) }) }
function filterByRange(data,months){ if(!months)return data; const cut=new Date(); cut.setMonth(cut.getMonth()-months); const cutStr=cut.toISOString().slice(0,10).replace(/-/g,''); return data.filter(c=>(c.dateLabel||'')>=cutStr||(c.date||'')>=cutStr) }
function lsGet(k,d){ try{ return JSON.parse(localStorage.getItem(k))??d }catch{return d} }
function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)) }catch{} }
function rateColor(r){ return r>0?'#ef4444':r<0?'#3b82f6':'#94a3b8' }

// ── 보조지표 계산 함수 ────────────────────────────────────

// EMA (지수이동평균)
function calcEMA(data, period) {
  const k = 2 / (period + 1)
  const result = new Array(data.length).fill(null)
  let ema = null
  for (let i = 0; i < data.length; i++) {
    const v = data[i]?.close ?? data[i]
    if (v == null) continue
    if (ema === null) {
      // 초기값: SMA
      if (i >= period - 1) {
        const sum = data.slice(i - period + 1, i + 1).reduce((s, d) => s + (d?.close ?? d ?? 0), 0)
        ema = sum / period
        result[i] = ema
      }
    } else {
      ema = v * k + ema * (1 - k)
      result[i] = ema
    }
  }
  return result
}

// RSI(14) — 과매수(70↑)/과매도(30↓) 판단
function calcRSI(data, period = 14) {
  const result = new Array(data.length).fill(null)
  if (data.length < period + 1) return result
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = (data[i]?.close ?? 0) - (data[i-1]?.close ?? 0)
    if (d > 0) avgGain += d; else avgLoss += Math.abs(d)
  }
  avgGain /= period; avgLoss /= period
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < data.length; i++) {
    const d = (data[i]?.close ?? 0) - (data[i-1]?.close ?? 0)
    const gain = d > 0 ? d : 0
    const loss = d < 0 ? Math.abs(d) : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return result
}

// MACD(12,26,9) — 추세 전환 시그널
function calcMACD(data) {
  const ema12  = calcEMA(data, 12)
  const ema26  = calcEMA(data, 26)
  const macd   = ema12.map((v,i) => v != null && ema26[i] != null ? v - ema26[i] : null)
  // 시그널: MACD의 9일 EMA
  const macdObjs = macd.map(v => ({ close: v }))
  const signal = calcEMA(macdObjs, 9)
  const hist   = macd.map((v,i) => v != null && signal[i] != null ? v - signal[i] : null)
  return { macd, signal, hist }
}

// 볼린저밴드(20,2) — 변동성·돌파 판단
function calcBollinger(data, period = 20, mult = 2) {
  const mid  = new Array(data.length).fill(null)
  const upper = new Array(data.length).fill(null)
  const lower = new Array(data.length).fill(null)
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1).map(d => d?.close ?? 0)
    const avg   = slice.reduce((s,v) => s + v, 0) / period
    const std   = Math.sqrt(slice.reduce((s,v) => s + (v-avg)**2, 0) / period)
    mid[i]   = avg
    upper[i] = avg + mult * std
    lower[i] = avg - mult * std
  }
  return { mid, upper, lower }
}

// 스토캐스틱(14,3)
function calcStochastic(data, kPeriod = 14, dPeriod = 3) {
  const kLine = new Array(data.length).fill(null)
  const dLine = new Array(data.length).fill(null)
  for (let i = kPeriod - 1; i < data.length; i++) {
    const slice = data.slice(i - kPeriod + 1, i + 1)
    const low   = Math.min(...slice.map(d => d?.low  ?? d?.close ?? 0))
    const high  = Math.max(...slice.map(d => d?.high ?? d?.close ?? 0))
    const close = data[i]?.close ?? 0
    kLine[i] = high === low ? 50 : ((close - low) / (high - low)) * 100
  }
  // %D = %K의 dPeriod 단순이동평균
  for (let i = kPeriod + dPeriod - 2; i < data.length; i++) {
    const slice = kLine.slice(i - dPeriod + 1, i + 1).filter(v => v != null)
    if (slice.length === dPeriod) dLine[i] = slice.reduce((s,v) => s+v, 0) / dPeriod
  }
  return { kLine, dLine }
}

// 거래량 MA
function calcVolumeMA(data, period = 20) {
  return data.map((_, i) => {
    if (i < period - 1) return null
    return data.slice(i - period + 1, i + 1).reduce((s, d) => s + (d.volume || 0), 0) / period
  })
}

// ── CandleChart ────────────────────────────────────────
function CandleChart({ data, width, height, showMA, enabledMA, drawings, onSvgClick, drawTool, splitState, showBollinger }) {
  const [tooltip, setTooltip] = useState(null)
  const svgRef = useRef(null)
  if (!data||data.length===0) return null

  const PAD = {top:12,right:72,bottom:24,left:8}
  const W = width-PAD.left-PAD.right
  const H = height-PAD.top-PAD.bottom

  // 볼린저밴드 포함해서 Y범위 계산
  const bb = showBollinger ? calcBollinger(data) : null
  const bbUpper = bb ? bb.upper.filter(Boolean) : []
  const bbLower = bb ? bb.lower.filter(Boolean) : []

  const prices = [
    ...data.flatMap(d=>[d.high,d.low]).filter(Boolean),
    ...bbUpper, ...bbLower
  ]
  const rawMin = Math.min(...prices), rawMax = Math.max(...prices)
  const margin = (rawMax-rawMin)*0.06||rawMin*0.005
  const minP = rawMin-margin, maxP = rawMax+margin, rangeP = maxP-minP||1

  const py     = v  => PAD.top + H - ((v-minP)/rangeP)*H
  const fromY  = y  => minP + (PAD.top+H-y)/H*rangeP
  const barW   = Math.max(1,Math.min(12,W/data.length-1))
  const bx     = i  => PAD.left+(i+0.5)*(W/data.length)
  const fromX  = x  => Math.round((x-PAD.left)/(W/data.length)-0.5)

  const yTicks   = Array.from({length:6},(_,i)=>minP+(rangeP/5)*i)
  const xStep    = Math.max(1,Math.floor(data.length/7))
  const maLines  = showMA ? MA_SETTINGS.filter(m=>enabledMA?.has(m.period)).map(({period,color})=>{
    const pts = calcMA(data,period).map((v,i)=>v?`${bx(i)},${py(v)}`:null).filter(Boolean)
    return pts.length>=2 ? {period,color,pts:pts.join(' ')} : null
  }).filter(Boolean) : []

  // 볼린저밴드 포인트
  const bbPts = bb ? {
    upper: bb.upper.map((v,i)=>v!=null?`${bx(i)},${py(v)}`:null).filter(Boolean).join(' '),
    mid:   bb.mid.map((v,i)=>v!=null?`${bx(i)},${py(v)}`:null).filter(Boolean).join(' '),
    lower: bb.lower.map((v,i)=>v!=null?`${bx(i)},${py(v)}`:null).filter(Boolean).join(' '),
    // fill polygon: upper → (reverse) lower
    fill:  (() => {
      const up = bb.upper.map((v,i)=>v!=null?[bx(i),py(v)]:null).filter(Boolean)
      const lo = bb.lower.map((v,i)=>v!=null?[bx(i),py(v)]:null).filter(Boolean).reverse()
      return [...up,...lo].map(p=>p.join(',')).join(' ')
    })()
  } : null

  function handleMouseMove(e){
    const rect=svgRef.current?.getBoundingClientRect(); if(!rect) return
    const mx=(e.clientX-rect.left)*(width/rect.width)
    const my=(e.clientY-rect.top)*(height/rect.height)
    const idx=Math.max(0,Math.min(data.length-1,Math.round((mx-PAD.left)/(W/data.length)-0.5)))
    setTooltip({idx,x:mx,y:my})
  }
  function handleClick(e){
    if(!onSvgClick||drawTool==='none') return
    const rect=svgRef.current?.getBoundingClientRect(); if(!rect) return
    const mx=(e.clientX-rect.left)*(width/rect.width)
    const my=(e.clientY-rect.top)*(height/rect.height)
    onSvgClick({x:mx, y:my, idx:fromX(mx), price:fromY(my), bx, toY:py, PAD, W, H, minP, maxP, rangeP})
  }

  const td = tooltip ? data[tooltip.idx] : null
  const maValues = showMA&&td ? MA_SETTINGS.filter(m=>enabledMA?.has(m.period)).map(({period,color})=>{
    const v=calcMA(data,period)[Math.max(0,Math.min(data.length-1,tooltip?.idx??0))]
    return v?{period,color,v}:null
  }).filter(Boolean) : []

  // 3/4분할 렌더 (price1~price2 범위 내에서 분할선 + 가격 + 등락률)
  const renderSplitLines = (d) => {
    if (!d.price1||!d.price2) return null
    const lo=Math.min(d.price1,d.price2), hi=Math.max(d.price1,d.price2)
    const n = d.type==='split3' ? 3 : 4
    const levels = Array.from({length:n+1},(_,i)=>lo+(hi-lo)*(i/n))
    const basePrice = levels[0]
    return <g key={d._id||Math.random()}>
      {levels.map((price,li)=>{
        const y2=py(price); if(y2<PAD.top-2||y2>PAD.top+H+2) return null
        const rate=basePrice>0?((price-basePrice)/basePrice*100).toFixed(2):0
        const col = li===0?'#94a3b8':li===n?'#94a3b8':'#06b6d4'
        return <g key={li}>
          <line x1={PAD.left} x2={PAD.left+W} y1={y2} y2={y2} stroke={col} strokeWidth={li===0||li===n?1.2:1} strokeDasharray={li===0||li===n?'':'6,3'} opacity={0.85}/>
          <rect x={PAD.left+W+2} y={y2-9} width={68} height={18} fill="white" stroke={col} rx={3}/>
          <text x={PAD.left+W+6} y={y2+3} fontSize={9} fill={col}>{fmt(Math.round(price))}</text>
          {li>0&&<text x={PAD.left+W+38} y={y2+3} fontSize={9} fill={rate>0?'#ef4444':rate<0?'#3b82f6':'#94a3b8'}>{rate>0?'+':''}{rate}%</text>}
        </g>
      })}
    </g>
  }

  return (
    <div style={{position:'relative'}}>
      <svg ref={svgRef} width={width} height={height}
        onMouseMove={handleMouseMove} onMouseLeave={()=>setTooltip(null)}
        onClick={handleClick}
        style={{display:'block', background:'#F8FAFF', cursor:drawTool!=='none'?'crosshair':'default'}}>

        {/* 그리드 */}
        {yTicks.map((v,i)=>(
          <g key={i}>
            <line x1={PAD.left} y1={py(v)} x2={PAD.left+W} y2={py(v)} stroke="rgba(15,23,42,0.06)" strokeWidth={0.5} strokeDasharray="3,3"/>
            <text x={PAD.left+W+5} y={py(v)+4} fontSize={10} fill="#94a3b8">{fmt(Math.round(v))}</text>
          </g>
        ))}
        {data.filter((_,i)=>i%xStep===0).map((d,i)=>(
          <text key={i} x={bx(data.indexOf(d))} y={PAD.top+H+16} textAnchor="middle" fontSize={10} fill="#94a3b8">{d.dateLabel}</text>
        ))}

        {/* 볼린저밴드 */}
        {bbPts && (<>
          <polygon points={bbPts.fill} fill="rgba(99,102,241,0.07)"/>
          <polyline points={bbPts.upper} fill="none" stroke="#6366f1" strokeWidth={1} strokeDasharray="4,3" opacity={0.6}/>
          <polyline points={bbPts.mid}   fill="none" stroke="#6366f1" strokeWidth={1} opacity={0.45}/>
          <polyline points={bbPts.lower} fill="none" stroke="#6366f1" strokeWidth={1} strokeDasharray="4,3" opacity={0.6}/>
        </>)}

        {/* MA 라인 */}
        {maLines.map(ma=>(
          <polyline key={ma.period} points={ma.pts} fill="none" stroke={ma.color} strokeWidth={1.2} opacity={0.85}/>
        ))}

        {/* 캔들 */}
        {data.map((d,i)=>{
          const isUp=d.close>=d.open
          const upCol='#EF4444', dnCol='#1D4ED8'
          const color=isUp?upCol:dnCol
          const cx=bx(i)
          const bodyTop=py(Math.max(d.open,d.close)), bodyH=Math.max(1,py(Math.min(d.open,d.close))-bodyTop)
          return <g key={i}>
            <line x1={cx} y1={py(d.high)} x2={cx} y2={py(d.low)} stroke={color} strokeWidth={1}/>
            <rect x={cx-barW/2} y={bodyTop} width={barW} height={bodyH}
              fill={isUp?color:'none'} stroke={color} strokeWidth={0.8} opacity={0.9}/>
          </g>
        })}

        {/* 드로잉 */}
        {drawings?.map((d,i)=>{
          if (d.type==='hline') {
            const y2=py(d.price); if(y2<PAD.top||y2>PAD.top+H) return null
            return <g key={i}>
              <line x1={PAD.left} x2={PAD.left+W} y1={y2} y2={y2} stroke={d.color||'#f59e0b'} strokeWidth={1.5} strokeDasharray="6,3"/>
              <rect x={PAD.left+W+2} y={y2-9} width={68} height={18} fill="white" stroke={d.color||'#f59e0b'} rx={3}/>
              <text x={PAD.left+W+6} y={y2+3} fontSize={10} fill={d.color||'#f59e0b'}>{Math.round(d.price).toLocaleString()}</text>
            </g>
          }
          if (d.type==='trend'&&d.x2!==undefined)
            return <line key={i} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#8b5cf6" strokeWidth={1.5}/>
          if (d.type==='fib'&&d.x2!==undefined) {
            const levels=[0,0.236,0.382,0.5,0.618,0.786,1]
            const r2=d.price2-d.price1
            const fc=['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#64748b']
            return <g key={i}>{levels.map((l,li)=>{
              const p2=d.price2-r2*l, y2=py(p2)
              if(y2<PAD.top||y2>PAD.top+H) return null
              return <g key={li}>
                <line x1={PAD.left} x2={PAD.left+W} y1={y2} y2={y2} stroke={fc[li]} strokeWidth={1} strokeDasharray="4,4" opacity={0.7}/>
                <text x={PAD.left+W+5} y={y2+4} fontSize={9} fill={fc[li]}>{(l*100).toFixed(1)}%  {fmt(Math.round(p2))}</text>
              </g>
            })}</g>
          }
          if (d.type==='split3'||d.type==='split4') return renderSplitLines(d)
          if (d.type==='text') {
            const y2=py(d.price); if(y2<PAD.top||y2>PAD.top+H) return null
            return <g key={i}>
              <rect x={d.bxVal-2} y={y2-13} width={d.text.length*7+8} height={16} fill="rgba(255,255,255,0.92)" stroke="#94a3b8" rx={3}/>
              <text x={d.bxVal+2} y={y2} fontSize={11} fill="#0f172a">{d.text}</text>
            </g>
          }
          return null
        })}

        {/* 진행 중인 split */}
        {splitState?.price1 && (() => {
          const y2=py(splitState.price1)
          return <line x1={PAD.left} x2={PAD.left+W} y1={y2} y2={y2} stroke="#06b6d4" strokeWidth={1} strokeDasharray="4,3" opacity={0.6}/>
        })()}

        {/* 크로스헤어 */}
        {tooltip&&td&&(
          <>
            <line x1={bx(tooltip.idx)} y1={PAD.top} x2={bx(tooltip.idx)} y2={PAD.top+H} stroke="rgba(15,23,42,0.2)" strokeWidth={0.8} strokeDasharray="4,2"/>
            <line x1={PAD.left} y1={tooltip.y} x2={PAD.left+W} y2={tooltip.y} stroke="rgba(15,23,42,0.15)" strokeWidth={0.8} strokeDasharray="4,2"/>
            {/* Y축 가격 레이블 */}
            <rect x={PAD.left+W+2} y={tooltip.y-8} width={68} height={16} fill="#2563eb" rx={3}/>
            <text x={PAD.left+W+36} y={tooltip.y+4} fontSize={9} fill="white" textAnchor="middle">{fmt(Math.round(fromY(tooltip.y)))}</text>
          </>
        )}
      </svg>

      {/* 툴팁 */}
      {tooltip&&td&&(
        <div className="smc-tooltip" style={{left:tooltip.x>width/2?tooltip.x-165:tooltip.x+12,top:Math.min(tooltip.y,height-200)}}>
          <div className="smc-tt-date">{td.dateLabel}</div>
          <div className="smc-tt-row"><span>시가</span><b>{fmt(td.open)}</b></div>
          <div className="smc-tt-row"><span>고가</span><b style={{color:'#ef4444'}}>{fmt(td.high)}</b></div>
          <div className="smc-tt-row"><span>저가</span><b style={{color:'#1d4ed8'}}>{fmt(td.low)}</b></div>
          <div className="smc-tt-row"><span>종가</span><b style={{color:td.close>=td.open?'#ef4444':'#1d4ed8'}}>{fmt(td.close)}</b></div>
          <div className="smc-tt-row"><span>거래량</span><b>{fmtShort(td.volume)}</b></div>
          {maValues.map(({period,color,v})=>(
            <div key={period} className="smc-tt-row"><span style={{color}}>MA{period}</span><b>{fmt(v)}</b></div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── VolumeChart ────────────────────────────────────────
function VolumeChart({ data, width, height }) {
  if (!data||data.length===0) return null
  const PAD={top:4,right:72,bottom:4,left:8}
  const W=width-PAD.left-PAD.right, H=height-PAD.top-PAD.bottom
  const maxV=Math.max(...data.map(d=>d.volume||0),1)
  const barW=Math.max(1,Math.min(12,W/data.length-1))
  const bx=i=>PAD.left+(i+0.5)*(W/data.length)
  const py=v=>PAD.top+H-(v/maxV)*H
  // 거래량 MA20
  const vma = calcVolumeMA(data, 20)
  const vmaPts = vma.map((v,i)=>v!=null?`${bx(i)},${py(v)}`:null).filter(Boolean).join(' ')
  return (
    <svg width={width} height={height} style={{display:'block',background:'#F8FAFF'}}>
      <text x={PAD.left+W+5} y={PAD.top+10} fontSize={9} fill="#94a3b8">거래량</text>
      {data.map((d,i)=>{
        const barH=maxV>0?(d.volume/maxV)*H:0
        const isUp=d.close>=d.open
        return <rect key={i} x={bx(i)-barW/2} y={PAD.top+H-barH} width={barW} height={Math.max(1,barH)}
          fill={isUp?'#FCA5A5':'#93C5FD'} opacity={0.8}/>
      })}
      {/* 거래량 MA20 (노란선) */}
      {vmaPts&&<polyline points={vmaPts} fill="none" stroke="#f59e0b" strokeWidth={1.2} opacity={0.85}/>}
    </svg>
  )
}

// ── LineChart ──────────────────────────────────────────
function LineChart({ data, width, height }) {
  const [tooltip, setTooltip] = useState(null)
  const svgRef = useRef(null)
  if (!data||data.length===0) return null
  const PAD={top:12,right:72,bottom:24,left:8}
  const W=width-PAD.left-PAD.right, H=height-PAD.top-PAD.bottom
  const prices=data.map(d=>d.close).filter(Boolean)
  const rawMin=Math.min(...prices), rawMax=Math.max(...prices)
  const margin=(rawMax-rawMin)*0.1||rawMin*0.005
  const minP=rawMin-margin, maxP=rawMax+margin, rangeP=maxP-minP||1
  const py=v=>PAD.top+H-((v-minP)/rangeP)*H
  const px=i=>PAD.left+(i/(data.length-1||1))*W
  const yTicks=Array.from({length:5},(_,i)=>minP+(rangeP/4)*i)
  const xStep=Math.max(1,Math.floor(data.length/7))
  const isUp=prices[prices.length-1]>=prices[0], lc=isUp?'#ef4444':'#1d4ed8'
  const points=data.map((d,i)=>`${px(i)},${py(d.close)}`).join(' ')
  const handleMouseMove=e=>{
    const rect=svgRef.current?.getBoundingClientRect(); if(!rect) return
    const x=e.clientX-rect.left-PAD.left
    const idx=Math.max(0,Math.min(data.length-1,Math.round(x/W*(data.length-1))))
    setTooltip({idx,x:e.clientX-rect.left,y:e.clientY-rect.top})
  }
  const td=tooltip?data[tooltip.idx]:null
  return (
    <div style={{position:'relative'}}>
      <svg ref={svgRef} width={width} height={height} onMouseMove={handleMouseMove}
        onMouseLeave={()=>setTooltip(null)} style={{display:'block',background:'#F8FAFF',cursor:'crosshair'}}>
        {yTicks.map((v,i)=>(
          <g key={i}>
            <line x1={PAD.left} y1={py(v)} x2={PAD.left+W} y2={py(v)} stroke="rgba(15,23,42,0.06)" strokeWidth={0.5} strokeDasharray="3,3"/>
            <text x={PAD.left+W+5} y={py(v)+4} fontSize={10} fill="#94a3b8">{fmt(Math.round(v))}</text>
          </g>
        ))}
        {data.filter((_,i)=>i%xStep===0).map((d,i)=>(
          <text key={i} x={px(data.indexOf(d))} y={PAD.top+H+16} textAnchor="middle" fontSize={10} fill="#94a3b8">{d.dateLabel}</text>
        ))}
        <defs>
          <linearGradient id="lg-smc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lc} stopOpacity="0.2"/>
            <stop offset="100%" stopColor={lc} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={`${PAD.left},${PAD.top+H} ${points} ${PAD.left+W},${PAD.top+H}`} fill="url(#lg-smc)"/>
        <polyline points={points} fill="none" stroke={lc} strokeWidth={1.8}/>
        {tooltip&&td&&(
          <>
            <line x1={px(tooltip.idx)} y1={PAD.top} x2={px(tooltip.idx)} y2={PAD.top+H} stroke="rgba(15,23,42,0.2)" strokeWidth={0.8} strokeDasharray="4,2"/>
            <circle cx={px(tooltip.idx)} cy={py(td.close)} r={3} fill={lc}/>
          </>
        )}
      </svg>
      {tooltip&&td&&(
        <div className="smc-tooltip" style={{left:tooltip.x>width/2?tooltip.x-145:tooltip.x+10,top:Math.min(tooltip.y,height-80)}}>
          <div className="smc-tt-date">{td.dateLabel}</div>
          <div className="smc-tt-row"><span>가격</span><b style={{color:lc}}>{fmt(td.close)}</b></div>
          <div className="smc-tt-row"><span>거래량</span><b>{fmtShort(td.volume)}</b></div>
        </div>
      )}
    </div>
  )
}

// ── RSI 서브차트 ───────────────────────────────────────
function RSIChart({ data, width }) {
  const H=80, PAD={top:14,right:72,bottom:4,left:8}
  const W=width-PAD.left-PAD.right
  const rsi = calcRSI(data)
  const bx  = i => PAD.left+(i+0.5)*(W/data.length)
  const py  = v => PAD.top+(H-PAD.top-PAD.bottom)*(1-v/100)
  const pts = rsi.map((v,i)=>v!=null?`${bx(i)},${py(v)}`:null).filter(Boolean).join(' ')
  const midH = py(50), h70 = py(70), h30 = py(30)
  const innerH = H-PAD.top-PAD.bottom
  return (
    <svg width={width} height={H} style={{display:'block',background:'#F8FAFF',borderTop:'1px solid #E2E8F0'}}>
      {/* 기준선 */}
      <line x1={PAD.left} x2={PAD.left+W} y1={h70} y2={h70} stroke="#ef4444" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.6}/>
      <line x1={PAD.left} x2={PAD.left+W} y1={midH} y2={midH} stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.4}/>
      <line x1={PAD.left} x2={PAD.left+W} y1={h30} y2={h30} stroke="#3b82f6" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.6}/>
      {/* 70/30 영역 채우기 */}
      <rect x={PAD.left} y={PAD.top} width={W} height={h70-PAD.top} fill="rgba(239,68,68,0.04)"/>
      <rect x={PAD.left} y={h30} width={W} height={PAD.top+innerH-h30} fill="rgba(59,130,246,0.04)"/>
      {/* RSI 선 */}
      {pts&&<polyline points={pts} fill="none" stroke="#8b5cf6" strokeWidth={1.4}/>}
      {/* 레이블 */}
      <text x={4} y={PAD.top+8} fontSize={9} fill="#94a3b8" fontWeight="700">RSI(14)</text>
      <text x={PAD.left+W+5} y={h70+3} fontSize={8} fill="#ef4444">70</text>
      <text x={PAD.left+W+5} y={midH+3} fontSize={8} fill="#94a3b8">50</text>
      <text x={PAD.left+W+5} y={h30+3} fontSize={8} fill="#3b82f6">30</text>
      {/* 현재값 */}
      {(() => { const v=rsi[rsi.length-1]; if(!v) return null
        const col = v>=70?'#ef4444':v<=30?'#3b82f6':'#8b5cf6'
        return <text x={PAD.left+W+5} y={py(v)+4} fontSize={9} fill={col} fontWeight="700">{v.toFixed(1)}</text>
      })()}
    </svg>
  )
}

// ── MACD 서브차트 ──────────────────────────────────────
function MACDChart({ data, width }) {
  const H=85, PAD={top:14,right:72,bottom:4,left:8}
  const W=width-PAD.left-PAD.right
  const innerH = H-PAD.top-PAD.bottom
  const { macd, signal, hist } = calcMACD(data)
  const bx = i => PAD.left+(i+0.5)*(W/data.length)
  const barW = Math.max(1,Math.min(8,W/data.length*0.6))
  const vals = [...macd,...signal,...hist].filter(v=>v!=null)
  if (!vals.length) return null
  const absMax = Math.max(...vals.map(Math.abs),0.01)
  const midY = PAD.top+innerH/2
  const py = v => midY - (v/absMax)*(innerH/2-2)
  const macdPts   = macd.map((v,i)=>v!=null?`${bx(i)},${py(v)}`:null).filter(Boolean).join(' ')
  const signalPts = signal.map((v,i)=>v!=null?`${bx(i)},${py(v)}`:null).filter(Boolean).join(' ')
  return (
    <svg width={width} height={H} style={{display:'block',background:'#F8FAFF',borderTop:'1px solid #E2E8F0'}}>
      {/* 기준선(0) */}
      <line x1={PAD.left} x2={PAD.left+W} y1={midY} y2={midY} stroke="#94a3b8" strokeWidth={0.5} opacity={0.5}/>
      {/* 히스토그램 */}
      {hist.map((v,i)=>{ if(v==null) return null
        const bH=Math.abs(v/absMax)*(innerH/2-2)
        return <rect key={i} x={bx(i)-barW/2} y={v>=0?midY-bH:midY} width={barW} height={Math.max(1,bH)}
          fill={v>=0?'#fca5a5':'#93c5fd'} opacity={0.8}/>
      })}
      {/* MACD 선 */}
      {macdPts&&<polyline points={macdPts} fill="none" stroke="#ef4444" strokeWidth={1.3} opacity={0.9}/>}
      {/* 시그널 선 */}
      {signalPts&&<polyline points={signalPts} fill="none" stroke="#3b82f6" strokeWidth={1.3} opacity={0.9}/>}
      {/* 레이블 */}
      <text x={4} y={PAD.top+8} fontSize={9} fill="#94a3b8" fontWeight="700">MACD(12,26,9)</text>
      <text x={PAD.left+12} y={PAD.top+8} fontSize={8} fill="#ef4444">— MACD</text>
      <text x={PAD.left+56} y={PAD.top+8} fontSize={8} fill="#3b82f6">— Signal</text>
      {/* 현재값 */}
      {(() => {
        const mv=macd[macd.length-1], sv=signal[signal.length-1], hv=hist[hist.length-1]
        if(mv==null) return null
        const col=hv>=0?'#ef4444':'#3b82f6'
        return <text x={PAD.left+W+5} y={midY+4} fontSize={9} fill={col} fontWeight="700">{hv?.toFixed(2)}</text>
      })()}
    </svg>
  )
}

// ── 스토캐스틱 서브차트 ────────────────────────────────
function StochasticChart({ data, width }) {
  const H=75, PAD={top:14,right:72,bottom:4,left:8}
  const W=width-PAD.left-PAD.right
  const innerH=H-PAD.top-PAD.bottom
  const { kLine, dLine } = calcStochastic(data)
  const bx = i => PAD.left+(i+0.5)*(W/data.length)
  const py = v => PAD.top+innerH*(1-v/100)
  const kPts = kLine.map((v,i)=>v!=null?`${bx(i)},${py(v)}`:null).filter(Boolean).join(' ')
  const dPts = dLine.map((v,i)=>v!=null?`${bx(i)},${py(v)}`:null).filter(Boolean).join(' ')
  const h80=py(80), h20=py(20)
  return (
    <svg width={width} height={H} style={{display:'block',background:'#F8FAFF',borderTop:'1px solid #E2E8F0'}}>
      <rect x={PAD.left} y={PAD.top} width={W} height={h80-PAD.top} fill="rgba(239,68,68,0.04)"/>
      <rect x={PAD.left} y={h20} width={W} height={PAD.top+innerH-h20} fill="rgba(59,130,246,0.04)"/>
      <line x1={PAD.left} x2={PAD.left+W} y1={h80} y2={h80} stroke="#ef4444" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.6}/>
      <line x1={PAD.left} x2={PAD.left+W} y1={h20} y2={h20} stroke="#3b82f6" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.6}/>
      {kPts&&<polyline points={kPts} fill="none" stroke="#f59e0b" strokeWidth={1.3}/>}
      {dPts&&<polyline points={dPts} fill="none" stroke="#8b5cf6" strokeWidth={1.3} opacity={0.8}/>}
      <text x={4} y={PAD.top+8} fontSize={9} fill="#94a3b8" fontWeight="700">Stoch(14,3)</text>
      <text x={PAD.left+12} y={PAD.top+8} fontSize={8} fill="#f59e0b">— %K</text>
      <text x={PAD.left+40} y={PAD.top+8} fontSize={8} fill="#8b5cf6">— %D</text>
      <text x={PAD.left+W+5} y={h80+3} fontSize={8} fill="#ef4444">80</text>
      <text x={PAD.left+W+5} y={h20+3} fontSize={8} fill="#3b82f6">20</text>
      {(() => {
        const kv=kLine[kLine.length-1]
        if(kv==null) return null
        const col=kv>=80?'#ef4444':kv<=20?'#3b82f6':'#f59e0b'
        return <text x={PAD.left+W+5} y={py(kv)+4} fontSize={9} fill={col} fontWeight="700">{kv.toFixed(1)}</text>
      })()}
    </svg>
  )
}

// ── NewsPanel ──────────────────────────────────────────
function NewsPanel({ stock }) {
  const [news,    setNews]    = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [selNews, setSelNews] = useState(null)

  const loadNews = useCallback(async () => {
    if (!CLAUDE_KEY) { setError('Claude API 키 미설정'); return }
    setLoading(true); setError('')
    try {
      const today = new Date().toLocaleDateString('ko-KR')
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body: JSON.stringify({
          model:'claude-haiku-4-5-20251001', max_tokens:1000,
          tools:[{type:'web_search_20250305',name:'web_search'}],
          messages:[{role:'user',content:`웹 검색으로 오늘(${today}) ${stock.name}(${stock.code}) 관련 최신 뉴스를 5개 찾아줘.\n반드시 아래 JSON 형식으로만 응답해줘:\n[{"title":"제목","summary":"한줄 요약","url":"https://...","source":"언론사","date":"날짜"}]`}],
        }),
      })
      const data = await res.json()
      const text = data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||''
      const match = text.match(/\[[\s\S]*\]/)
      if (match) setNews(JSON.parse(match[0]))
      else setError('뉴스를 파싱하지 못했습니다')
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [stock.code, stock.name])

  return (
    <div className="smc-news-panel">
      <div className="smc-news-header">
        <span className="smc-news-title">📰 {stock.name} 최신 뉴스</span>
        <button className="smc-news-fetch-btn" onClick={loadNews} disabled={loading}>
          {loading?'⟳ 검색 중...':news.length?'↺ 갱신':'🔍 뉴스 검색'}
        </button>
      </div>
      {error&&<div className="smc-news-error">⚠️ {error}</div>}
      {loading&&<div className="smc-news-loading"><div className="smc-news-spinner"/>뉴스 검색 중...</div>}
      {!loading&&!news.length&&!error&&<div className="smc-news-empty">버튼을 눌러 최신 뉴스를 검색하세요</div>}
      {!loading&&news.length>0&&(
        <div className="smc-news-list">
          {news.map((n,i)=>(
            <div key={i} className="smc-news-item">
              <div className="smc-news-item-body" onClick={()=>setSelNews(n)}>
                <div className="smc-news-item-title">{n.title}</div>
                <div className="smc-news-item-meta">
                  <span className="smc-news-source">{n.source}</span>
                  {n.date&&<span className="smc-news-date">{n.date}</span>}
                </div>
                <div className="smc-news-item-summary">{n.summary}</div>
              </div>
              <a href={n.url} target="_blank" rel="noreferrer" className="smc-news-link-btn" onClick={e=>e.stopPropagation()}>원문 →</a>
            </div>
          ))}
        </div>
      )}
      {selNews&&(
        <div className="smc-news-popup-overlay" onClick={()=>setSelNews(null)}>
          <div className="smc-news-popup" onClick={e=>e.stopPropagation()}>
            <div className="smc-news-popup-header">
              <div><span className="smc-news-source">{selNews.source}</span>{selNews.date&&<span className="smc-news-date"> {selNews.date}</span>}</div>
              <button className="smc-news-popup-close" onClick={()=>setSelNews(null)}>✕</button>
            </div>
            <div className="smc-news-popup-title">{selNews.title}</div>
            <div className="smc-news-popup-summary">{selNews.summary}</div>
            <a href={selNews.url} target="_blank" rel="noreferrer" className="smc-news-popup-link">📰 원문 기사 보기 →</a>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
export default function StockChartModal({ stock, onClose }) {
  const [period,     setPeriod]    = useState('day')
  const [scope,      setScope]     = useState('5')
  const [range,      setRange]     = useState(3)
  const [showMA,     setShowMA]    = useState(true)
  const [enabledMA,  setEnabledMA] = useState(new Set([5,10,20,60,120]))
  const [allData,    setAllData]   = useState([])
  const [loading,    setLoading]   = useState(false)
  const [error,      setError]     = useState(null)
  const [priceInfo,  setPriceInfo] = useState(null)
  const [basicInfo,  setBasicInfo] = useState(null)
  const [stockInfo,  setStockInfo] = useState(null)
  const [activeTab,  setActiveTab] = useState('chart')
  const [showSupply,    setShowSupply]    = useState(false)  // ← 기본 OFF
  const [supplyData,    setSupplyData]    = useState(null)
  const [supplyLoading, setSupplyLoading] = useState(false)
  const [showBollinger,  setShowBollinger]  = useState(true)   // 볼린저밴드 기본 ON
  const [showRSI,        setShowRSI]        = useState(true)   // RSI 기본 ON
  const [showMACD,       setShowMACD]       = useState(false)  // MACD 기본 OFF
  const [showStochastic, setShowStochastic] = useState(false)  // 스토캐스틱 기본 OFF
  const [showFinancial, setShowFinancial] = useState(false) // 재무제표 팝업
  // 드로잉
  const [drawings,   setDrawings]  = useState(()=>stock?.code?lsGet(`smc_draw_${stock.code}`,[]):[])
  const [drawTool,   setDrawTool]  = useState('none')
  const [drawState,  setDrawState] = useState(null)
  const [textInput,  setTextInput] = useState(null)
  const [splitState, setSplitState]= useState(null)  // split3/4 중간 상태
  // 리사이즈
  const wrapRef    = useRef(null)
  const modalRef   = useRef(null)
  const resizeRef  = useRef(null)
  const [modalSize, setModalSize]  = useState({ w: null, h: null })
  const [chartWidth,setChartWidth] = useState(800)

  // 모달 크기 감지
  useEffect(()=>{
    const update=()=>{ if(wrapRef.current) setChartWidth(wrapRef.current.clientWidth) }
    update(); window.addEventListener('resize',update)
    return ()=>window.removeEventListener('resize',update)
  },[modalSize])

  useEffect(()=>{
    const fn=e=>{ if(e.key==='Escape') onClose() }
    window.addEventListener('keydown',fn); return ()=>window.removeEventListener('keydown',fn)
  },[onClose])

  // ── 리사이즈 드래그 ──────────────────────────────────
  function startResize(e) {
    e.preventDefault()
    const startX=e.clientX, startY=e.clientY
    const startW=modalRef.current?.offsetWidth||900
    const startH=modalRef.current?.offsetHeight||650
    resizeRef.current = { startX, startY, startW, startH }
    function onMove(ev) {
      const dw=ev.clientX-resizeRef.current.startX
      const dh=ev.clientY-resizeRef.current.startY
      setModalSize({ w:Math.max(600,resizeRef.current.startW+dw), h:Math.max(400,resizeRef.current.startH+dh) })
    }
    function onUp() { document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp) }
    document.addEventListener('mousemove',onMove)
    document.addEventListener('mouseup',onUp)
  }

  // ── 데이터 페치 ──────────────────────────────────────
  const fetchChart = useCallback(async ()=>{
    if (!stock?.code) return
    setLoading(true); setError(null)
    try {
      const params=new URLSearchParams({type:'stock-chart',period,code:stock.code})
      if (period==='min') params.set('tic',scope)
      const json=await fetch(`/api/kiwoom?${params}`).then(r=>r.json())
      if (json.error) throw new Error(json.error)
      const raw=(json.candles||json[DATA_KEY[period]]||[])
      const items=raw.map(c=>({
        date:      c.date||c.dt||c.cntr_tm||'',
        dateLabel: c.date||c.dt||c.cntr_tm||'',
        open:      Math.abs(parseN(c.open  ??c.open_pric??0)),
        high:      Math.abs(parseN(c.high  ??c.high_pric??0)),
        low:       Math.abs(parseN(c.low   ??c.low_pric ??0)),
        close:     Math.abs(parseN(c.close ??c.cur_prc  ??0)),
        volume:    parseN(c.volume??c.trde_qty??0),
      })).filter(c=>c.close>0)
      const ordered = json.candles ? items : [...items].reverse()
      setAllData(ordered)
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  },[stock?.code,period,scope])

  const fetchInfos = useCallback(async ()=>{
    if (!stock?.code) return
    const [p,b,s]=await Promise.allSettled([
      fetch(`/api/kiwoom?type=price&code=${stock.code}`).then(r=>r.json()),
      fetch(`/api/kiwoom?type=stockbasic&code=${stock.code}`).then(r=>r.json()),
      fetch(`/api/kiwoom?type=stockinfo&code=${stock.code}`).then(r=>r.json()),
    ])
    if (p.status==='fulfilled'&&!p.value?.error) setPriceInfo(p.value)
    if (b.status==='fulfilled'&&!b.value?.error) setBasicInfo(b.value)
    if (s.status==='fulfilled'&&!s.value?.error) setStockInfo(s.value)
  },[stock?.code])

  const fetchSupply = useCallback(async ()=>{
    if (!stock?.code||supplyData) return
    setSupplyLoading(true)
    try {
      const [f,sh,st]=await Promise.allSettled([
        fetch(`/api/kiwoom?type=supply-foreign&code=${stock.code}`).then(r=>r.json()),
        fetch(`/api/kiwoom?type=supply-short&code=${stock.code}&days=30`).then(r=>r.json()),
        fetch(`/api/kiwoom?type=supply-strength&code=${stock.code}`).then(r=>r.json()),
      ])
      setSupplyData({
        foreign:  f.status==='fulfilled'&&!f.value?.error  ? f.value.data||[]  : [],
        short:    sh.status==='fulfilled'&&!sh.value?.error ? sh.value.data||[] : [],
        strength: st.status==='fulfilled'&&!st.value?.error ? st.value.data||[] : [],
      })
    } catch {} finally { setSupplyLoading(false) }
  },[stock?.code, supplyData])

  useEffect(()=>{ fetchChart() },[fetchChart])
  useEffect(()=>{ fetchInfos() },[fetchInfos])
  useEffect(()=>{ if(showSupply) fetchSupply() },[showSupply])

  const saveDrawings = next=>{ setDrawings(next); if(stock?.code) lsSet(`smc_draw_${stock.code}`,next) }
  const toggleMA = p=>setEnabledMA(prev=>{ const n=new Set(prev); n.has(p)?n.delete(p):n.add(p); return n })

  // SVG 클릭 핸들러
  function handleSvgClick({ x, y, price, bx, toY, PAD, W, H, minP, maxP }) {
    if (drawTool==='none') return
    if (drawTool==='hline') {
      saveDrawings([...drawings, { type:'hline', price }])
    } else if (drawTool==='trend'||drawTool==='fib') {
      if (!drawState) {
        setDrawState({ x1:x, y1:y, price1:price })
      } else {
        if (drawTool==='trend') {
          saveDrawings([...drawings, { type:'trend', x1:drawState.x1, y1:drawState.y1, x2:x, y2:y }])
        } else {
          saveDrawings([...drawings, { type:'fib', x1:drawState.x1, y1:drawState.y1, x2:x, y2:y, price1:drawState.price1, price2:price }])
        }
        setDrawState(null)
      }
    } else if (drawTool==='split3'||drawTool==='split4') {
      // 1번째 클릭: 시작 가격, 2번째 클릭: 끝 가격 → 분할선 생성
      if (!splitState) {
        setSplitState({ price1:price })
      } else {
        saveDrawings([...drawings, { type:drawTool, price1:splitState.price1, price2:price, _id:Date.now() }])
        setSplitState(null)
        setDrawTool('none')
      }
    } else if (drawTool==='text') {
      setTextInput({ x, y, price })
    }
  }

  if (!stock) return null
  const chartData  = period==='min' ? allData : filterByRange(allData, range)
  const isUp=priceInfo?.change>0, isDown=priceInfo?.change<0
  const pc=isUp?'#ef4444':isDown?'#3b82f6':'#94a3b8'
  const sign=isUp?'+':''
  const bi=basicInfo||{}, si=stockInfo||{}

  const infoItems=[
    {label:'현재가', value:priceInfo?.current?fmt(priceInfo.current)+'원':'-', color:pc},
    {label:'등락률', value:priceInfo?.changeRate!=null?sign+Number(priceInfo.changeRate).toFixed(2)+'%':'-', color:pc},
    {label:'거래량', value:priceInfo?.volume?fmtShort(priceInfo.volume)+'주':'-'},
    {label:'시가',   value:priceInfo?.open?fmt(priceInfo.open)+'원':'-'},
    {label:'고가',   value:priceInfo?.high?fmt(priceInfo.high)+'원':'-', color:'#ef4444'},
    {label:'저가',   value:priceInfo?.low?fmt(priceInfo.low)+'원':'-',  color:'#3b82f6'},
    {label:'시가총액',value:bi.mac?fmt(parseN(bi.mac))+'억':'-'},
    {label:'PER',   value:bi.per&&bi.per!=='0'?Number(bi.per).toFixed(1)+'배':'-'},
    {label:'PBR',   value:bi.pbr&&bi.pbr!=='0'?Number(bi.pbr).toFixed(2)+'배':'-'},
    {label:'EPS',   value:bi.eps&&bi.eps!=='0'?fmt(parseN(bi.eps))+'원':'-'},
    {label:'ROE',   value:bi.roe&&bi.roe!=='0'?Number(bi.roe).toFixed(1)+'%':'-'},
    {label:'외국인', value:bi.for_exh_rt?bi.for_exh_rt+'%':'-'},
    {label:'유통비율',value:bi.dstr_rt?bi.dstr_rt+'%':'-'},
    {label:'업종',   value:si.upName||'-'},
  ]

  const CHART_H = 340
  const VOL_H   = 70
  const chartTotalH = showSupply ? CHART_H+VOL_H+160 : CHART_H+VOL_H

  return (
    <>
    <div className="smc-overlay" onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
      <div className="smc-modal" ref={modalRef}
        style={{ width:modalSize.w||undefined, height:modalSize.h||undefined }}>

        {/* ── 헤더 ── */}
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
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <div className="smc-tab-switch">
              <button className={`smc-tab-sw-btn ${activeTab==='chart'?'active':''}`} onClick={()=>setActiveTab('chart')}>📈 차트</button>
              <button className={`smc-tab-sw-btn ${activeTab==='news'?'active':''}`}  onClick={()=>setActiveTab('news')}>📰 뉴스</button>
              <button className="smc-tab-sw-btn" onClick={()=>setShowFinancial(true)}>📊 재무</button>
            </div>
            <button className="smc-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── 차트 탭 ── */}
        {activeTab==='chart'&&(<>

          {/* 컨트롤 바 1행: 봉종류 + 기간/분봉범위 + MA */}
          <div className="smc-ctrl-row1">
            {/* 봉 종류 */}
            <div className="smc-period-tabs">
              {PERIODS.map(p=>(
                <button key={p.type} className={`smc-tab ${period===p.type?'active':''}`}
                  onClick={()=>{ setPeriod(p.type); setDrawState(null); setSplitState(null) }}>
                  {p.label}
                </button>
              ))}
            </div>

            <div className="smc-ctrl-sep"/>

            {/* 기간 or 분봉 범위 */}
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

            <div className="smc-ctrl-sep"/>

            {/* MA 토글 */}
            <button className={`smc-ma-btn ${showMA?'active':''}`} onClick={()=>setShowMA(v=>!v)}>MA</button>
            {showMA&&(
              <div className="smc-ma-chips">
                {MA_SETTINGS.map(({period:p,color,label})=>(
                  <button key={p} className={`smc-ma-chip ${enabledMA.has(p)?'active':''}`}
                    style={enabledMA.has(p)?{color,borderColor:color,background:color+'18'}:{}}
                    onClick={()=>toggleMA(p)}>{label}</button>
                ))}
              </div>
            )}

            <div style={{marginLeft:'auto',display:'flex',gap:4}}>
              {/* 지표 토글 */}
              <button className={`smc-scope-btn ${showBollinger?'active':''}`}
                onClick={()=>setShowBollinger(v=>!v)} title="볼린저밴드(20,2)">
                BB
              </button>
              <button className={`smc-scope-btn ${showRSI?'active':''}`}
                onClick={()=>setShowRSI(v=>!v)} title="RSI(14)">
                RSI
              </button>
              <button className={`smc-scope-btn ${showMACD?'active':''}`}
                onClick={()=>setShowMACD(v=>!v)} title="MACD(12,26,9)">
                MACD
              </button>
              <button className={`smc-scope-btn ${showStochastic?'active':''}`}
                onClick={()=>setShowStochastic(v=>!v)} title="스토캐스틱(14,3)">
                Stoch
              </button>
              {/* 수급 버튼 */}
              <button className={`smc-scope-btn ${showSupply?'active':''}`}
                onClick={()=>setShowSupply(v=>!v)}>
                📊 수급
              </button>
            </div>
          </div>

          {/* 컨트롤 바 2행: 드로잉 툴바 */}
          <div className="smc-ctrl-row2">
            {DRAW_TOOLS.map(t=>(
              <button key={t.id}
                className={`smc-draw-btn ${drawTool===t.id?'active':''}`}
                onClick={()=>{ setDrawTool(t.id); setDrawState(null); setSplitState(null) }}>
                {t.label}
              </button>
            ))}
            <div style={{flex:1}}/>
            {drawings.length>0&&(
              <button className="smc-draw-btn smc-draw-del"
                onClick={()=>{ saveDrawings([]); setDrawState(null); setSplitState(null) }}>
                🗑 초기화
              </button>
            )}
            {(drawState||splitState)&&(
              <span className="smc-draw-hint">
                {drawTool==='trend'?'2번째 점 클릭':drawTool==='fib'?'끝점 클릭':(drawTool==='split3'||drawTool==='split4')?'끝 가격 클릭':''}
              </span>
            )}
          </div>

          {/* 차트 영역 */}
          <div className="smc-chart-wrap" ref={wrapRef}>
            {loading&&<div className="smc-loading">⟳ 차트 불러오는 중...</div>}
            {error  &&<div className="smc-error">⚠️ {error}</div>}
            {!loading&&!error&&chartData.length>0&&(<>
              {period==='min'
                ? <LineChart  data={chartData} width={chartWidth} height={CHART_H}/>
                : <CandleChart data={chartData} width={chartWidth} height={CHART_H}
                    showMA={showMA} enabledMA={enabledMA}
                    drawings={drawings} onSvgClick={handleSvgClick}
                    drawTool={drawTool} splitState={splitState}
                    showBollinger={showBollinger}/>
              }
              <VolumeChart data={chartData} width={chartWidth} height={VOL_H}/>

              {/* 보조지표 서브차트 */}
              {showRSI        && <RSIChart        data={chartData} width={chartWidth}/>}
              {showMACD       && <MACDChart       data={chartData} width={chartWidth}/>}
              {showStochastic && <StochasticChart data={chartData} width={chartWidth}/>}

              {/* 수급 서브차트 */}
              {showSupply&&(
                <div className="smc-supply-section">
                  {supplyLoading&&<div className="smc-supply-loading">⟳ 수급 데이터 불러오는 중...</div>}
                  {!supplyLoading&&supplyData&&(<>
                    <SupplyMiniChart title="🌐 외국인 순매수" data={(supplyData.foreign||[]).map(r=>({date:r.dt,value:Number(r.chg_qty||0)}))} color="#3b82f6" type="bar" width={chartWidth}/>
                    <SupplyMiniChart title="📉 공매도 비중" data={(supplyData.short||[]).map(r=>({date:r.dt,value:parseFloat(r.trde_wght||0)}))} color="#7c3aed" type="line" width={chartWidth}/>
                    <SupplyMiniChart title="⚡ 체결강도" data={(supplyData.strength||[]).map(r=>({date:r.dt,value:parseFloat(r.cntr_str||100)-100}))} color="#10b981" type="line" width={chartWidth}/>
                  </>)}
                </div>
              )}
            </>)}
            {!loading&&!error&&!chartData.length&&<div className="smc-empty">데이터가 없습니다</div>}
          </div>

          {/* 텍스트 입력 */}
          {textInput&&(
            <div className="smc-text-popup">
              <input autoFocus className="smc-text-input" placeholder="메모 입력 후 Enter"
                onKeyDown={e=>{
                  if(e.key==='Enter'&&e.target.value.trim()){ saveDrawings([...drawings,{type:'text',price:textInput.price,bxVal:textInput.x,text:e.target.value.trim()}]); setTextInput(null); setDrawTool('none') }
                  if(e.key==='Escape') setTextInput(null)
                }}/>
              <button onClick={()=>setTextInput(null)}>✕</button>
            </div>
          )}
        </>)}

        {/* ── 뉴스 탭 ── */}
        {activeTab==='news'&&<NewsPanel stock={stock}/>}

        {/* ── 종목 정보 바 ── */}
        <div className="smc-info-bar">
          {infoItems.map(item=>(
            <div key={item.label} className="smc-info-item">
              <span className="smc-info-label">{item.label}</span>
              <span className="smc-info-value" style={{color:item.color}}>{item.value}</span>
            </div>
          ))}
          <button className="smc-dart-btn" style={{cursor:'pointer',border:'1px solid #e2e8f0'}}
            onClick={()=>setShowFinancial(true)}>📊 재무제표</button>
          <a className="smc-dart-btn" href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(stock.name)}`} target="_blank" rel="noreferrer">📋 공시</a>
          <a className="smc-news-quick-btn" href={`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(stock.name)}&sort=1`} target="_blank" rel="noreferrer">📰 뉴스</a>
        </div>

        {/* ── 리사이즈 핸들 ── */}
        <div className="smc-resize-handle" onMouseDown={startResize} title="드래그로 크기 조절">⤡</div>
      </div>
    </div>

    {/* ── 재무제표 차트 팝업 ── */}
    {showFinancial && (
      <FinancialChart stock={stock} onClose={()=>setShowFinancial(false)}/>
    )}
    </>
  )
}

// ── 수급 미니차트 ──────────────────────────────────────
function SupplyMiniChart({ title, data, color, type, width }) {
  if (!data?.length) return null
  const PAD={top:18,right:8,bottom:4,left:72}
  const W=width-PAD.left-PAD.right, H=70
  const vals=data.map(d=>d.value), maxV=Math.max(...vals.map(Math.abs),1)
  const bx=i=>PAD.left+(i+0.5)*(W/data.length)
  const py=v=>PAD.top+H/2-(v/maxV)*(H/2-2)
  const barW=Math.max(1,Math.floor(W/data.length*0.7))
  const pts=data.map((d,i)=>`${bx(i)},${py(d.value)}`).join(' ')
  return (
    <svg width={width} height={PAD.top+H+4} style={{display:'block',background:'#F8FAFF',borderTop:'1px solid #E2E8F0'}}>
      <text x={4} y={PAD.top+H/2+4} fontSize={9} fill="#94a3b8">{title}</text>
      <line x1={PAD.left} x2={PAD.left+W} y1={PAD.top+H/2} y2={PAD.top+H/2} stroke="rgba(15,23,42,0.06)" strokeWidth={0.5}/>
      {type==='bar'&&data.map((d,i)=>{
        const v=d.value, bH=Math.abs(v/maxV)*(H/2-2)
        return <rect key={i} x={bx(i)-barW/2} y={v>=0?PAD.top+H/2-bH:PAD.top+H/2} width={barW} height={Math.max(1,bH)} fill={v>=0?'#22c55e':'#ef4444'} opacity={0.75}/>
      })}
      {type==='line'&&<polyline points={pts} fill="none" stroke={color} strokeWidth={1.2} opacity={0.85}/>}
    </svg>
  )
}
