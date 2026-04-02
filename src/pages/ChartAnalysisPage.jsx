import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  CandleSvg, DrawingToolbar, SupplySubChart, EtfHoldingsPopup, MarkdownView,
  useStockChart, handleDrawClick, filterByRange, parseN, fmtN, fmtShort, rateColor, lsSet,
  PERIODS, RANGES, MIN_SCOPES, MA_SETTINGS, DRAW_TOOLS, isEtf, calcMA,
} from '../components/StockChart'
import '../components/StockChart.css'
import { useStockPrices } from '../hooks/useKiwoomPrice'
import { useStockList   } from '../hooks/useStockList'
import { getKstStatus   } from '../utils/format'
import { useUserSettings } from '../hooks/useUserSettings'
import { ALL_THEMES     } from '../constants/themes'
import './ChartAnalysisPage.css'
import FinancialChart from '../components/FinancialChart'

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

// ── 테마 맵 ───────────────────────────────────────────
const THEME_MAP = {}
ALL_THEMES.forEach(t => {
  t.etf.forEach(e    => { THEME_MAP[e.code] = { theme: t.label, market: 'ETF'    } })
  t.stocks.forEach(s => { THEME_MAP[s.code] = { theme: t.label, market: 'KOSPI'  } })
})

const LS_RECENT    = 'cap_recent_v3'  // v2→v3: 중복 캐시 클리어
const LS_WATCHLIST = 'cap_watch_v2'
const LS_DRAWINGS  = 'cap_drawings_v2'

function lsGet(k,d){ try{return JSON.parse(localStorage.getItem(k))??d}catch{return d} }

// ── 보조지표 계산 ─────────────────────────────────────
function capEMA(data, p) {
  const k=2/(p+1), r=new Array(data.length).fill(null); let ema=null
  for(let i=0;i<data.length;i++){
    const raw=data[i]; if(raw==null) continue
    const v=typeof raw==='object'?raw.close:raw
    if(v==null||!isFinite(v)) continue
    if(ema===null){
      if(i>=p-1){
        const sl=data.slice(i-p+1,i+1)
        const vals=sl.map(d=>d==null?null:(typeof d==='object'?d.close:d)).filter(v=>v!=null&&isFinite(v))
        if(vals.length<Math.floor(p*0.5)) continue  // 절반 이상 유효 데이터 필요
        ema=vals.reduce((a,v)=>a+v,0)/vals.length; r[i]=ema
      }
    } else { ema=v*k+ema*(1-k); r[i]=isFinite(ema)?ema:null }
  }
  return r
}
function capRSI(data, p=14) {
  const r=new Array(data.length).fill(null); if(data.length<p+1) return r
  let g=0,l=0
  for(let i=1;i<=p;i++){ const d=(data[i]?.close??0)-(data[i-1]?.close??0); if(d>0)g+=d; else l+=Math.abs(d) }
  g/=p; l/=p
  const v0=l===0?100:100-100/(1+g/l)
  r[p]=isFinite(v0)?v0:null
  for(let i=p+1;i<data.length;i++){
    const d=(data[i]?.close??0)-(data[i-1]?.close??0)
    g=(g*(p-1)+(d>0?d:0))/p; l=(l*(p-1)+(d<0?Math.abs(d):0))/p
    const v=l===0?100:100-100/(1+g/l)
    r[i]=isFinite(v)?v:null
  }
  return r
}
function capMACD(data) {
  const e12=capEMA(data,12), e26=capEMA(data,26)
  // NaN/null 모두 null로 통일
  const macd=e12.map((v,i)=>{
    const a=v, b=e26[i]
    if(a==null||b==null||!isFinite(a)||!isFinite(b)) return null
    const r=a-b; return isFinite(r)?r:null
  })
  const sig=capEMA(macd.map(v=>(v!=null&&isFinite(v))?{close:v}:null),9)
  const hist=macd.map((v,i)=>{
    const s=sig[i]
    if(v==null||s==null||!isFinite(v)||!isFinite(s)) return null
    const r=v-s; return isFinite(r)?r:null
  })
  return {macd,sig,hist}
}
function capBoll(data,p=20,m=2) {
  const mid=new Array(data.length).fill(null),up=new Array(data.length).fill(null),lo=new Array(data.length).fill(null)
  for(let i=p-1;i<data.length;i++){
    const sl=data.slice(i-p+1,i+1).map(d=>d?.close??0)
    const avg=sl.reduce((s,v)=>s+v,0)/p
    const std=Math.sqrt(sl.reduce((s,v)=>s+(v-avg)**2,0)/p)
    mid[i]=avg; up[i]=avg+m*std; lo[i]=avg-m*std
  }
  return {mid,up,lo}
}
function capStoch(data,k=14,d=3) {
  const kl=new Array(data.length).fill(null), dl=new Array(data.length).fill(null)
  for(let i=k-1;i<data.length;i++){
    const sl=data.slice(i-k+1,i+1)
    const lo=Math.min(...sl.map(d=>d?.low??d?.close??0)), hi=Math.max(...sl.map(d=>d?.high??d?.close??0))
    kl[i]=hi===lo?50:((data[i]?.close??0)-lo)/(hi-lo)*100
  }
  for(let i=k+d-2;i<data.length;i++){
    const sl=kl.slice(i-d+1,i+1).filter(v=>v!=null)
    if(sl.length===d) dl[i]=sl.reduce((s,v)=>s+v,0)/d
  }
  return {kl,dl}
}

// ── 보조지표 서브차트 컴포넌트 ────────────────────────
function SubRSI({data, width, height=80}) {
  const H=height, PAD={t:14,r:36,b:4,l:8}, W=width-PAD.l-PAD.r, iH=H-PAD.t-PAD.b
  const rsi=capRSI(data)
  const bx=i=>PAD.l+(i+0.5)*(W/data.length)
  // 클리핑: RSI 0~100 범위로 제한
  const py=v=>PAD.t+iH*(1-Math.max(0,Math.min(100,v))/100)
  const h70=py(70),h50=py(50),h30=py(30)
  const cur=rsi.filter(v=>v!=null).at(-1)
  // 연속 세그먼트로 분리 (null 구간 건너뜀)
  const segs=[], cur_seg=[]
  rsi.forEach((v,i)=>{
    if(v!=null) cur_seg.push(`${bx(i)},${py(v)}`)
    else if(cur_seg.length){ segs.push([...cur_seg]); cur_seg.length=0 }
  })
  if(cur_seg.length) segs.push(cur_seg)
  const clipId=`rsi-clip-${width}`
  return (
    <svg width={width} height={H} style={{display:'block',background:'#F8FAFF',borderTop:'1px solid #E2E8F0'}}>
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD.l} y={PAD.t} width={W} height={iH}/>
        </clipPath>
      </defs>
      <rect x={PAD.l} y={PAD.t} width={W} height={h70-PAD.t} fill="rgba(239,68,68,0.04)"/>
      <rect x={PAD.l} y={h30}   width={W} height={PAD.t+iH-h30} fill="rgba(59,130,246,0.04)"/>
      <line x1={PAD.l} x2={PAD.l+W} y1={h70} y2={h70} stroke="#ef4444" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.5}/>
      <line x1={PAD.l} x2={PAD.l+W} y1={h50} y2={h50} stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="2,4" opacity={0.25}/>
      <line x1={PAD.l} x2={PAD.l+W} y1={h30} y2={h30} stroke="#3b82f6" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.5}/>
      <g clipPath={`url(#${clipId})`}>
        {segs.map((seg,i)=><polyline key={i} points={seg.join(' ')} fill="none" stroke="#8b5cf6" strokeWidth={1.5}/>)}
      </g>
      <text x={6} y={PAD.t-2} fontSize={9} fill="#94a3b8" fontWeight="700">RSI(14)</text>
      {/* 기준선 숫자 — 차트 우측 끝에 고정 */}
      <text x={PAD.l+W+2} y={h70+3} fontSize={7} fill="#ef4444" opacity={0.7}>70</text>
      <text x={PAD.l+W+2} y={h50+3} fontSize={7} fill="#94a3b8" opacity={0.5}>50</text>
      <text x={PAD.l+W+2} y={h30+3} fontSize={7} fill="#3b82f6" opacity={0.7}>30</text>
      {/* 현재값 박스 — 클램핑으로 경계 안에 유지 */}
      {cur!=null&&(()=>{
        const cy=Math.max(PAD.t+6, Math.min(PAD.t+iH-6, py(cur)))
        const col=cur>=70?'#ef4444':cur<=30?'#3b82f6':'#8b5cf6'
        return (
          <g>
            <rect x={PAD.l+W+1} y={cy-6} width={34} height={13} rx={3} fill={col} opacity={0.9}/>
            <text x={PAD.l+W+4} y={cy+4} fontSize={9} fill="white" fontWeight="700">{cur.toFixed(1)}</text>
          </g>
        )
      })()}
    </svg>
  )
}
function SubMACD({data, width, height=96}) {
  const H=height, PAD={t:14,r:36,b:4,l:8}, W=width-PAD.l-PAD.r, iH=H-PAD.t-PAD.b
  const {macd,sig,hist}=capMACD(data)
  const bx=i=>PAD.l+(i+0.5)*(W/data.length)
  const bW=Math.max(1.5, Math.min(8, W/data.length*0.7))
  const isVal=v=>v!=null&&isFinite(v)

  // ★ 히스토그램과 선을 별도 스케일로 분리
  const histVals=hist.filter(isVal)
  const lineVals=[...macd,...sig].filter(isVal)
  if(!histVals.length&&!lineVals.length) return null

  // 히스토그램 스케일 (hist 값만)
  const hMax=histVals.length?Math.max(...histVals.map(Math.abs),0.01)*1.15:1
  // 선 스케일 (MACD/Signal)
  const lMax=lineVals.length?Math.max(...lineVals.map(Math.abs),0.01)*1.15:1

  const midY=PAD.t+iH/2

  // 히스토그램용 py
  const pyH=v=>{
    if(!isFinite(v)) return midY
    return Math.max(PAD.t, Math.min(PAD.t+iH, midY-(v/hMax)*(iH/2-2)))
  }
  // 선용 py (MACD/Signal)
  const pyL=v=>{
    if(!isFinite(v)) return midY
    return Math.max(PAD.t, Math.min(PAD.t+iH, midY-(v/lMax)*(iH/2-2)))
  }

  const clipId=`macd-clip-${width}`
  const buildSegs=(arr,pyFn)=>{
    const segs=[]; let cur=[]
    arr.forEach((v,i)=>{
      if(isVal(v)) cur.push(`${bx(i)},${pyFn(v)}`)
      else if(cur.length){segs.push([...cur]);cur=[]}
    })
    if(cur.length) segs.push(cur)
    return segs
  }
  const mSegs=buildSegs(macd,pyL)
  const sSegs=buildSegs(sig,pyL)
  const curMacd=macd.filter(isVal).at(-1)
  const curHist=hist.filter(isVal).at(-1)
  const prevHist=hist.filter(isVal).at(-2)

  return (
    <svg width={width} height={H} style={{display:'block',background:'#F8FAFF',borderTop:'1px solid #E2E8F0'}}>
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD.l} y={PAD.t} width={W} height={iH}/>
        </clipPath>
      </defs>
      <line x1={PAD.l} x2={PAD.l+W} y1={midY} y2={midY} stroke="#94a3b8" strokeWidth={0.5} opacity={0.3}/>
      <g clipPath={`url(#${clipId})`}>
        {/* 히스토그램 — 별도 스케일 */}
        {hist.map((v,i)=>{
          if(!isVal(v)) return null
          const bH=Math.max(1.5, Math.abs(v/hMax)*(iH/2-2))
          const isUp=v>=0
          // 이전 봉 대비 증가/감소로 색상 구분
          const prev=hist[i-1]
          const grow=isVal(prev)?(isUp?v>prev:v<prev):true
          return <rect key={i} x={bx(i)-bW/2}
            y={isUp?midY-bH:midY} width={bW}
            height={Math.min(bH, iH/2-1)}
            fill={isUp?(grow?'#ef4444':'#fca5a5'):(grow?'#2563eb':'#93c5fd')}
            opacity={0.85}/>
        })}
        {/* MACD/Signal 선 — 별도 스케일 */}
        {mSegs.map((seg,i)=>seg.length>1&&<polyline key={`m${i}`} points={seg.join(' ')} fill="none" stroke="#ef4444" strokeWidth={1.4} opacity={0.8}/>)}
        {sSegs.map((seg,i)=>seg.length>1&&<polyline key={`s${i}`} points={seg.join(' ')} fill="none" stroke="#3b82f6" strokeWidth={1.4} opacity={0.8}/>)}
      </g>
      <text x={6} y={PAD.t-2} fontSize={9} fill="#94a3b8" fontWeight="700">MACD(12,26,9)</text>
      <text x={60} y={PAD.t-2} fontSize={8} fill="#ef4444">— MACD</text>
      <text x={98} y={PAD.t-2} fontSize={8} fill="#3b82f6">— Signal</text>
      {/* 골든크로스/데드크로스 표시 */}
      {curMacd!=null&&isFinite(curMacd)&&(()=>{
        const cy=Math.max(PAD.t+6, Math.min(PAD.t+iH-6, pyL(curMacd)))
        const col=curMacd>=0?'#ef4444':'#3b82f6'
        const cross=isVal(curHist)&&isVal(prevHist)&&((prevHist<0&&curHist>=0)||(prevHist>=0&&curHist<0))
        return (
          <g>
            {cross&&<text x={PAD.l+W-40} y={PAD.t+iH-2} fontSize={9} fill={curHist>=0?'#ef4444':'#3b82f6'} fontWeight="800">
              {curHist>=0?'▲GC':'▼DC'}
            </text>}
            <rect x={PAD.l+W+1} y={cy-6} width={34} height={13} rx={3} fill={col} opacity={0.9}/>
            <text x={PAD.l+W+4} y={cy+4} fontSize={8} fill="white" fontWeight="700">
              {curMacd>0?'+':''}{Math.abs(curMacd)>=1000?Math.round(curMacd/100)/10+'k':curMacd.toFixed(1)}
            </text>
          </g>
        )
      })()}
    </svg>
  )
}
function SubStoch({data, width, height=74}) {
  const H=height, PAD={t:14,r:36,b:4,l:8}, W=width-PAD.l-PAD.r, iH=H-PAD.t-PAD.b
  const {kl,dl}=capStoch(data)
  const bx=i=>PAD.l+(i+0.5)*(W/data.length)
  const py=v=>PAD.t+iH*(1-Math.max(0,Math.min(100,v))/100)
  const h80=py(80),h20=py(20)
  const clipId=`stoch-clip-${width}`
  const kSegs=[], dSegs=[], ks=[], ds=[]
  kl.forEach((v,i)=>{ if(v!=null) ks.push(`${bx(i)},${py(v)}`); else if(ks.length){kSegs.push([...ks]);ks.length=0} })
  if(ks.length) kSegs.push(ks)
  dl.forEach((v,i)=>{ if(v!=null) ds.push(`${bx(i)},${py(v)}`); else if(ds.length){dSegs.push([...ds]);ds.length=0} })
  if(ds.length) dSegs.push(ds)
  const curK=kl.filter(v=>v!=null).at(-1)
  return (
    <svg width={width} height={H} style={{display:'block',background:'#F8FAFF',borderTop:'1px solid #E2E8F0'}}>
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD.l} y={PAD.t} width={W} height={iH}/>
        </clipPath>
      </defs>
      <rect x={PAD.l} y={PAD.t} width={W} height={h80-PAD.t} fill="rgba(239,68,68,0.04)"/>
      <rect x={PAD.l} y={h20}   width={W} height={PAD.t+iH-h20} fill="rgba(59,130,246,0.04)"/>
      <line x1={PAD.l} x2={PAD.l+W} y1={h80} y2={h80} stroke="#ef4444" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.5}/>
      <line x1={PAD.l} x2={PAD.l+W} y1={h20} y2={h20} stroke="#3b82f6" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.5}/>
      <g clipPath={`url(#${clipId})`}>
        {kSegs.map((seg,i)=><polyline key={`k${i}`} points={seg.join(' ')} fill="none" stroke="#f59e0b" strokeWidth={1.4}/>)}
        {dSegs.map((seg,i)=><polyline key={`d${i}`} points={seg.join(' ')} fill="none" stroke="#8b5cf6" strokeWidth={1.4}/>)}
      </g>
      <text x={6} y={PAD.t-2} fontSize={9} fill="#94a3b8" fontWeight="700">Stoch(14,3)</text>
      <text x={58} y={PAD.t-2} fontSize={8} fill="#f59e0b">— %K</text>
      <text x={80} y={PAD.t-2} fontSize={8} fill="#8b5cf6">— %D</text>
      <text x={PAD.l+W+3} y={h80+3} fontSize={8} fill="#ef4444">80</text>
      <text x={PAD.l+W+3} y={h20+3} fontSize={8} fill="#3b82f6">20</text>
      {curK!=null&&(
        <g>
          <rect x={PAD.l+W+1} y={py(curK)-6} width={33} height={12} rx={3}
            fill={curK>=80?'#ef4444':curK<=20?'#3b82f6':'#f59e0b'} opacity={0.9}/>
          <text x={PAD.l+W+4} y={py(curK)+3} fontSize={9} fill="white" fontWeight="700">{curK.toFixed(1)}</text>
        </g>
      )}
    </svg>
  )
}

// ── 드래그 리사이즈 핸들 ──────────────────────────────
function ResizeDivider({ onDrag, label }) {
  const [dragging, setDragging] = useState(false)

  const handleMouseDown = e => {
    e.preventDefault()
    setDragging(true)
    const startY = e.clientY
    let lastY = startY

    const onMove = e => {
      const delta = e.clientY - lastY
      lastY = e.clientY
      onDrag(delta)
    }
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }

  return (
    <div
      className={`cap-resize-handle ${dragging?'dragging':''}`}
      onMouseDown={handleMouseDown}
      title={label||'드래그하여 높이 조절'}
    />
  )
}

// ── FullscreenChart ───────────────────────────────────
function FullscreenChart({ stock, initPeriod, initRange, initMA, initEMA, onClose }) {
  const [period,    setPeriod]  = useState(initPeriod||'day')
  const [scope,     setScope]   = useState('5')
  const [range,     setRange]   = useState(initRange||3)
  const [minDays,   setMinDays] = useState(1)
  const [showMA,    setShowMA]  = useState(initMA??true)
  const [enabledMA, setEnabledMA] = useState(initEMA||new Set([5,10,20,60,120]))
  const [drawTool, setDrawTool] = useState('none')
  const [drawState, setDrawState] = useState(null)
  const [drawings, setDrawings] = useState(()=>lsGet(`${LS_DRAWINGS}_${stock.code}`,[]))
  const [selIdx, setSelIdx] = useState(null)
  const [textOverlay, setTextOverlay] = useState(null)
  const [wrapEl, setWrapEl] = useState(null)
  const [width, setWidth] = useState(1200)
  const [fsShowSupply, setFsShowSupply] = useState(false)
  const [fsSupplyData, setFsSupplyData] = useState(null)
  const [fsSupplyLoad, setFsSupplyLoad] = useState(false)
  const [fsBasicInfo, setFsBasicInfo]   = useState(null)
  const toggleMA = p => setEnabledMA(prev=>{ const n=new Set(prev); n.has(p)?n.delete(p):n.add(p); return n })
  const candles = useMemo(()=>{
    if(period!=='min') return filterByRange(allData,range)
    // 분봉: dayKey 기준으로 최근 minDays 영업일만 필터
    const days=[...new Set(allData.map(c=>c.dayKey).filter(Boolean))].sort()
    if(!days.length) return allData
    const cutDay=days.at(-minDays)||days[0]
    return allData.filter(c=>!c.dayKey||(c.dayKey>=cutDay))
  },[allData,range,period,minDays])

  useEffect(()=>{ if(!wrapEl) return; const ro=new ResizeObserver(([e])=>setWidth(e.contentRect.width)); ro.observe(wrapEl); setWidth(wrapEl.clientWidth); return()=>ro.disconnect() },[wrapEl])
  useEffect(()=>{ const fn=e=>e.key==='Escape'&&onClose(); window.addEventListener('keydown',fn); return()=>window.removeEventListener('keydown',fn) },[onClose])
  useEffect(()=>{
    fetch(`/api/kiwoom?type=stockbasic&code=${stock.code}`).then(r=>r.json()).then(d=>{ if(!d.error) setFsBasicInfo(d) }).catch(()=>{})
  },[stock.code])

  const saveD = next => { setDrawings(next); lsSet(`${LS_DRAWINGS}_${stock.code}`, next) }
  function handleSvgClick(args) {
    const r=handleDrawClick({ drawTool,setDrawTool,drawState,setDrawState,drawings,saveDrawings:saveD,...args,data:candles })
    if(r?.textOverlay) setTextOverlay(r.textOverlay)
  }

  return (
    <div className="cap-fs">
      <div className="cap-fs-tb">
        <span className="cap-fs-title">{stock.name}</span>
        <span className="cap-fs-code">{stock.code}</span>
        <div className="cap-fs-sep"/>
        <div className="cap-fs-group">{PERIODS.map(p=><button key={p.key} className={`cap-fs-btn ${period===p.key?'active':''}`} onClick={()=>setPeriod(p.key)}>{p.label}</button>)}</div>
        {period==='min'&&(<>
          <div className="cap-fs-sep"/>
          <div className="cap-fs-group">{MIN_SCOPES.map(s=><button key={s} className={`cap-fs-btn ${scope===s?'active':''}`} onClick={()=>setScope(s)}>{s}분</button>)}</div>
          <div className="cap-fs-sep"/>
          <div className="cap-fs-group">
            {[{label:'당일',days:1},{label:'3일',days:3},{label:'5일',days:5},{label:'10일',days:10},{label:'20일',days:20},{label:'30일',days:30}]
              .map(r=><button key={r.days} className={`cap-fs-btn ${minDays===r.days?'active':''}`} onClick={()=>setMinDays(r.days)}>{r.label}</button>)}
          </div>
        </>)}
        {period!=='min'&&<><div className="cap-fs-sep"/><div className="cap-fs-group">{RANGES.map(r=><button key={r.label} className={`cap-fs-btn ${range===r.months?'active':''}`} onClick={()=>{setRange(r.months)}}>{r.label}</button>)}</div></>}
        <div className="cap-fs-sep"/>
        <div className="cap-fs-group">
          <button className={`cap-fs-btn ${showMA?'active':''}`} onClick={()=>setShowMA(v=>!v)}>MA</button>
          {showMA&&MA_SETTINGS.map(m=><button key={m.p} className={`cap-fs-btn cap-fs-ma ${enabledMA.has(m.p)?'active':''}`} style={enabledMA.has(m.p)?{color:m.color,borderColor:m.color}:{}} onClick={()=>toggleMA(m.p)}>{m.label}</button>)}
        </div>
        <div className="cap-fs-sep"/>
        <div className="cap-fs-group">
          {DRAW_TOOLS.map(t=><button key={t.id} className={`cap-fs-btn ${drawTool===t.id?'active':''}`} onClick={()=>{setDrawTool(t.id);setDrawState(null)}}>{t.label}</button>)}
          {drawings.length>0&&<button className="cap-fs-btn cap-fs-del" onClick={()=>{saveD([]);setDrawState(null)}}>🗑 초기화</button>}
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:5,alignItems:'center'}}>
          {drawState&&<div className="cap-fs-hint">{drawTool==='trend'?'2번째 점 클릭':'끝점 클릭'}</div>}
          {fsSupplyLoad&&<span style={{fontSize:11,color:'var(--text-secondary)'}}>⟳</span>}
          <button className={`cap-fs-btn ${fsShowSupply?'active':''}`} onClick={()=>setFsShowSupply(v=>!v)}>📊 수급</button>
          <button className="cap-fs-close" onClick={onClose}>✕ 닫기</button>
        </div>
      </div>
      {fsBasicInfo&&Object.keys(fsBasicInfo).length>0&&(
        <div className="cap-fs-info">
          {[
            fsBasicInfo.mac?['시가총액',(Number(String(fsBasicInfo.mac).replace(/,/g,''))/100000000).toFixed(0)+'억']:null,
            fsBasicInfo.per&&fsBasicInfo.per!=='0'?['PER',Number(fsBasicInfo.per).toFixed(1)+'배']:null,
            fsBasicInfo.pbr&&fsBasicInfo.pbr!=='0'?['PBR',Number(fsBasicInfo.pbr).toFixed(2)+'배']:null,
            fsBasicInfo.eps&&fsBasicInfo.eps!=='0'?['EPS',Number(fsBasicInfo.eps).toLocaleString('ko-KR')+'원']:null,
            fsBasicInfo.roe&&fsBasicInfo.roe!=='0'?['ROE',Number(fsBasicInfo.roe).toFixed(1)+'%']:null,
            fsBasicInfo.for_exh_rt?['외국인',fsBasicInfo.for_exh_rt+'%']:null,
          ].filter(Boolean).map(([l,v])=>(
            <div key={l} className="cap-fs-info-item"><span className="cap-fs-info-label">{l}</span><span className="cap-fs-info-val">{v}</span></div>
          ))}
        </div>
      )}
      <div className="cap-fs-body" ref={setWrapEl}>
        {loading&&<div className="cap-fs-loading"><div className="cap-spinner"/>불러오는 중...</div>}
        {!loading&&candles.length>0&&<CandleSvg data={candles} width={width} height={chartH} showMA={showMA} enabledMA={enabledMA} drawings={drawings} onSvgClick={handleSvgClick} drawTool={drawTool} selectedIdx={selIdx} onSelectDrawing={setSelIdx} period={period}/>}
        {!loading&&!candles.length&&<div style={{padding:80,textAlign:'center',color:'var(--text-secondary)'}}>데이터가 없습니다</div>}
        {fsShowSupply&&fsSupplyData&&<SupplySubChart supplyData={fsSupplyData} candles={candles}/>}
        {fsShowSupply&&fsSupplyLoad&&<div style={{padding:12,textAlign:'center',background:'var(--bg-base)',color:'var(--text-secondary)',fontSize:12}}><div className="cap-spinner" style={{display:'inline-block',marginRight:6}}/>수급 로딩 중...</div>}
      </div>
      {textOverlay&&(
        <div className="cap-text-popup-fs" style={{display:'flex',gap:6,alignItems:'center',padding:'8px 14px',background:'var(--bg-panel)',borderTop:'1px solid var(--border)',flexShrink:0}}>
          <input autoFocus style={{flex:1,padding:'6px 10px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:6,fontSize:12,color:'var(--text-primary)',outline:'none',fontFamily:'inherit'}} placeholder="메모 입력 후 Enter"
            onKeyDown={e=>{
              if(e.key==='Enter'&&e.target.value.trim()){saveD([...drawings,{type:'text',price:textOverlay.price,bxVal:textOverlay.x,text:e.target.value.trim()}]);setTextOverlay(null);setDrawTool('none')}
              if(e.key==='Escape') setTextOverlay(null)
            }}/>
          <button style={{background:'none',border:'1px solid var(--border)',borderRadius:6,color:'var(--text-secondary)',cursor:'pointer',padding:'5px 9px',fontSize:11}} onClick={()=>setTextOverlay(null)}>✕</button>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// 메인 ChartAnalysisPage
// ══════════════════════════════════════════════════════
export default function ChartAnalysisPage() {
  // ── 검색 ──────────────────────────────────────────
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState([])
  const [showDrop, setShowDrop] = useState(false)
  const [dropIdx,  setDropIdx]  = useState(-1)
  const [selected, setSelected] = useState(null)
  // Firestore 설정 훅
  const { getSetting, setSetting, getDrawings, saveDrawings: fbSaveDrawings, getWatchlist, saveWatchlist, getWlCats, saveWlCats } = useUserSettings()

  const [recent,   setRecent]   = useState(()=>lsGet(LS_RECENT,[]))
  const [watchlist,setWatchlist]= useState(()=>getWatchlist([]))

  // Firestore에서 최근검색/관심종목 로드 + 마지막 종목 자동 복원
  useEffect(() => {
    const fbRecent = getSetting('chart', LS_RECENT, null)
    const recentList = fbRecent?.length ? fbRecent : lsGet(LS_RECENT, [])
    if (recentList?.length) {
      setRecent(recentList)
      // 마지막 검색 종목 자동 선택 (stockList 로드 후)
      const last = recentList[0]
      if (last) {
        setSelected(last)
        setQuery(last.name)
        fetch(`/api/kiwoom?type=stockbasic&code=${last.code}`)
          .then(r=>r.json()).then(d=>{ if(!d.error) setBasicInfo(d) }).catch(()=>{})
        getDrawings(`${LS_DRAWINGS}_${last.code}`).then(d=>{ if(d?.length) setDrawings(d) })
      }
    }
    const fbWatch = getWatchlist([])
    if (fbWatch?.length) setWatchlist(fbWatch)
  }, []) // 마운트 1회만

  // 보유종목 로드 (계좌 API)
  useEffect(() => {
    fetch('/api/kiwoom?type=account-holdings')
      .then(r => r.json())
      .then(data => {
        if (data.error) return
        const map = {}
        ;(data.holdings || data.list || []).forEach(h => {
          const code = h.stk_cd || h.code
          if (!code) return
          map[code] = {
            qty:  Number(h.rmnd_qty || h.qty || 0),
            rate: Number(h.evlt_pfls_rt || h.rate || 0),
            avg:  Number(h.pch_avg_pric || h.avg || 0),
          }
        })
        setHoldings(map)
      })
      .catch(() => {})
  }, [])
  const searchRef = useRef(null)
  const { stockList, loading: slLoading } = useStockList()

  // ── UI 상태 ───────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [wlTab, setWlTab] = useState('watch')
  const [wlCats, setWlCats] = useState(()=>getWlCats([]))
  const [selCatId, setSelCatId] = useState('')
  const [activeView, setActiveView] = useState('chart') // 'chart'|'ai'
  const [showFull, setShowFull] = useState(false)
  const [drawMenuOpen, setDrawMenuOpen] = useState(false)
  const [infoPopup, setInfoPopup] = useState(null) // 'disc'|'news'|'si'
  // 우측 정보 패널
  const [rightPanel, setRightPanel] = useState(false)  // 패널 열림 여부
  const [panelTab, setPanelTab]     = useState('sup')  // 'sup'|'fin'|'news'|'disc'|'si'|'ai'

  const openPanel = (tab) => {
    setPanelTab(tab)
    setRightPanel(true)
    if(tab==='sup' && !supplyData && !supplyLoad) loadSupply()
    if(tab==='news' && !newsData.length) loadNews()
  }
  const infoRef = useRef(null)

  // ── 차트 컨트롤 (Firestore 설정 저장) ────────────────
  const _cfg = getSetting('chart', 'cap_chart_config', {})
  const [period,    setPeriod]    = useState(_cfg.period  || 'day')
  const [scope,     setScope]     = useState(_cfg.scope   || '5')
  const [range,     setRange]     = useState(_cfg.range   ?? 3)
  const [minDays,   setMinDays]   = useState(1)
  const [showMA,    setShowMA]    = useState(_cfg.showMA  ?? true)
  const [enabledMA, setEnabledMA] = useState(new Set(_cfg.enabledMA || [5,10,20,60,120]))
  const [drawTool,  setDrawTool]  = useState('none')
  const [drawState, setDrawState] = useState(null)
  const [drawings,  setDrawings]  = useState([])
  const [selIdx,    setSelIdx]    = useState(null)
  const [textInput, setTextInput] = useState(null)
  const [chartWrap, setChartWrap] = useState(null)
  const [chartW,    setChartW]    = useState(900)
  const [chartH,    setChartH]    = useState(500)

  // ── 지표 토글 (Firestore 설정 저장) ─────────────────
  const [showBB,    setShowBB]    = useState(_cfg.showBB    ?? true)
  const [showRSI,   setShowRSI]   = useState(_cfg.showRSI   ?? true)
  const [showMACD,  setShowMACD]  = useState(_cfg.showMACD  ?? false)
  const [showStoch, setShowStoch] = useState(_cfg.showStoch ?? false)
  const [showSup,   setShowSup]   = useState(false)

  // 설정 변경 저장 헬퍼
  const saveChartCfg = (patch) => {
    const prev = getSetting('chart', 'cap_chart_config', {})
    setSetting('chart', 'cap_chart_config', { ...prev, ...patch })
  }

  // ── 서브차트 높이 (드래그 리사이즈) ──────────────
  const [subHeights, setSubHeights] = useState({ rsi:80, macd:96, stoch:74 })
  const [volH, setVolH] = useState(56)  // 거래량 바 높이

  const updateSubH = (key, delta) => setSubHeights(prev => ({
    ...prev,
    [key]: Math.max(50, Math.min(200, prev[key] + delta))
  }))
  const updateVolH = delta => setVolH(prev => Math.max(30, Math.min(150, prev + delta)))

  // ── 데이터 ────────────────────────────────────────
  const [basicInfo,   setBasicInfo]   = useState(null)
  const [supplyData,  setSupplyData]  = useState(null)
  const [supplyLoad,  setSupplyLoad]  = useState(false)
  const [newsData,    setNewsData]    = useState([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [aiResult,    setAiResult]    = useState('')
  const [aiLoading,   setAiLoading]   = useState(false)
  const [aiError,     setAiError]     = useState('')
  const [holdings,    setHoldings]    = useState({})
  const [showEtf,     setShowEtf]     = useState(false)
  const [showFin,     setShowFin]     = useState(false)

  const etfMode = isEtf(selected?.code)

  // ── 차트 데이터 ───────────────────────────────────
  const { allData, loading: chartLoading } = useStockChart({ code:selected?.code, period, scope, minDays, enabled:!!selected })
  const candles = useMemo(()=>{
    if(period!=='min') return filterByRange(allData,range)
    const days=[...new Set(allData.map(c=>c.dayKey).filter(Boolean))].sort()
    if(!days.length) return allData
    const cutDay=days.at(-minDays)||days[0]
    return allData.filter(c=>!c.dayKey||(c.dayKey>=cutDay))
  },[allData,range,period,minDays])

  // 52주 고저
  // 차트 표시 구간 기준 고저가 (allData 전체가 아닌 현재 candles 기준)
  const chartHighLow = useMemo(()=>{
    if(!candles.length) return null
    const hi=candles.map(c=>c.high).filter(v=>v>0)
    const lo=candles.map(c=>c.low).filter(v=>v>0)
    return hi.length&&lo.length?{high:Math.max(...hi),low:Math.min(...lo)}:null
  },[candles])

  // 진짜 52주 고저 — 날짜 기준 1년 필터 (period 무관)
  const week52 = useMemo(()=>{
    if(!allData.length) return null
    const oneYearAgo=new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear()-1)
    const cutStr=oneYearAgo.toISOString().slice(0,10).replace(/-/g,'')
    // date 필드 기준 최근 1년치 봉만
    const recent=allData.filter(c=>{
      const d=String(c.date||'').slice(0,8)
      return d.length===8&&d>=cutStr
    })
    const src=recent.length>=10?recent:allData  // 1년치 없으면 전체 사용
    const hi=src.map(c=>c.high).filter(v=>v>0)
    const lo=src.map(c=>c.low).filter(v=>v>0)
    return hi.length&&lo.length?{high:Math.max(...hi),low:Math.min(...lo)}:null
  },[allData])

  // 가격 조회
  const selCatStocks = wlCats.find(c=>c.id===selCatId)?.stocks||[]
  const priceCodes   = [...new Set([...(selected?[selected.code]:[]),...selCatStocks.map(s=>s.code)])]
  const { prices }   = useStockPrices(priceCodes, getKstStatus()==='open'?30000:300000)
  const price        = selected?prices[selected.code]:null

  // ResizeObserver — 너비 + 높이 동시 (cap-chart-wrap 기준)
  useEffect(()=>{
    if(!chartWrap) return
    const calc=()=>{
      setChartW(chartWrap.clientWidth)
      // 부모 캔버스 높이에서 서브차트 높이 빼서 메인 차트 높이 계산
      const parent=chartWrap.parentElement
      if(!parent) return
      const totalH=parent.clientHeight
      const subH=(showRSI?subHeights.rsi:0)+(showMACD?subHeights.macd:0)+(showStoch?subHeights.stoch:0)+(showSup?200:0)
      setChartH(Math.max(300, totalH-subH-2))    }
    calc()
    const ro=new ResizeObserver(calc)
    ro.observe(chartWrap.parentElement||chartWrap)
    return()=>ro.disconnect()
  },[chartWrap, showRSI, showMACD, showStoch, showSup, subHeights])

  // 팝업 외부 클릭 닫기
  useEffect(()=>{
    const fn=e=>{ if(infoRef.current&&!infoRef.current.contains(e.target)) setInfoPopup(null) }
    document.addEventListener('mousedown',fn); return()=>document.removeEventListener('mousedown',fn)
  },[])

  // ── 검색 ──────────────────────────────────────────
  const search = q => {
    setQuery(q); setDropIdx(-1)
    if(!q.trim()){setResults([]);setShowDrop(false);return}
    const kw=q.toLowerCase().replace(/\s/g,'')
    const scored=stockList.filter(s=>s.name.toLowerCase().replace(/\s/g,'').includes(kw)||s.code.includes(kw))
      .map(s=>({ ...s, _s: s.code===kw?100:s.code.startsWith(kw)?80:s.name.toLowerCase().startsWith(kw)?60:THEME_MAP[s.code]?40:0 }))
      .sort((a,b)=>b._s-a._s).slice(0,14)
    setResults(scored); setShowDrop(true)
  }
  const handleKey = e => {
    if(!showDrop||!results.length){if(e.key==='Escape'){setShowDrop(false);setDropIdx(-1)};return}
    if(e.key==='ArrowDown'){e.preventDefault();setDropIdx(i=>Math.min(i+1,results.length-1))}
    else if(e.key==='ArrowUp'){e.preventDefault();setDropIdx(i=>Math.max(i-1,-1))}
    else if(e.key==='Enter'){e.preventDefault();select(dropIdx>=0?results[dropIdx]:results[0])}
    else if(e.key==='Escape'){setShowDrop(false);setDropIdx(-1)}
  }
  const select = stock => {
    setSelected(stock); setQuery(stock.name); setShowDrop(false); setDropIdx(-1)
    setAiResult(''); setAiError(''); setBasicInfo(null); setNewsData([]); setSupplyData(null)
    // 드로잉 로드 — Firestore 우선, localStorage 폴백
    getDrawings(`${LS_DRAWINGS}_${stock.code}`).then(d=>{ setDrawings(d||[]) })
    setDrawTool('none'); setDrawState(null)
    const next=[stock,...recent.filter(r=>r.code!==stock.code)].slice(0,8)
    setRecent(next)
    setSetting('chart', LS_RECENT, next)  // Firestore 저장
    // basicInfo 로드
    fetch(`/api/kiwoom?type=stockbasic&code=${stock.code}`).then(r=>r.json()).then(d=>{if(!d.error)setBasicInfo(d)}).catch(()=>{})
  }

  const saveDrawings = next => {
    setDrawings(next)
    if(selected) fbSaveDrawings(`${LS_DRAWINGS}_${selected.code}`, next)
  }
  const toggleMA = p => setEnabledMA(prev=>{ const n=new Set(prev); n.has(p)?n.delete(p):n.add(p); saveChartCfg({enabledMA:[...n]}); return n })
  const handleInlineClick = args => { const r=handleDrawClick({drawTool,setDrawTool,drawState,setDrawState,drawings,saveDrawings,...args,data:candles}); if(r?.textOverlay) setTextInput(r.textOverlay) }

  const toggleWatch = () => {
    if(!selected) return
    const exists=watchlist.find(w=>w.code===selected.code)
    const next=exists?watchlist.filter(w=>w.code!==selected.code):[selected,...watchlist].slice(0,20)
    setWatchlist(next); saveWatchlist(next)  // Firestore + localStorage 동기화
  }
  const isWatched = selected&&watchlist.find(w=>w.code===selected.code)

  const loadSupply = useCallback(async()=>{
    if(!selected?.code||supplyData) return
    setSupplyLoad(true)
    try {
      const iv = await fetch(`/api/kiwoom?type=supply-invsr-chart&code=${selected.code}`).then(r=>r.json())
      setSupplyData({
        invsr: iv.data?.slice(0,30)||[],
      })
    } catch(e){ console.error('[loadSupply]', e) }
    finally { setSupplyLoad(false) }
  },[selected?.code,supplyData])

  const loadNews = useCallback(async()=>{
    if(!selected?.code||!CLAUDE_KEY) return
    setNewsLoading(true); setNewsData([])
    try {
      const today=new Date().toLocaleDateString('ko-KR')
      const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1500,tools:[{type:'web_search_20250305',name:'web_search'}],messages:[{role:'user',content:`오늘(${today}) ${selected.name}(${selected.code}) 최신 뉴스 7개 JSON으로만:[{"title":"","summary":"","url":"","source":"","date":""}]`}]})})
      const data=await res.json()
      const text=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||''
      const m=text.match(/\[[\s\S]*\]/); if(m) setNewsData(JSON.parse(m[0]))
    } catch(e){console.error(e)} finally{setNewsLoading(false)}
  },[selected?.code])

  const doAI = async() => {
    if(!selected||!CLAUDE_KEY) return
    setAiLoading(true); setAiError('')
    try {
      const today=new Date().toLocaleDateString('ko-KR')
      const now=new Date()
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1500,
          tools:[{type:'web_search_20250305',name:'web_search'}],
          messages:[{role:'user',content:`오늘(${today}) ${selected.name}(${selected.code}) 웹검색 기반 분석:\n## 📌 현재 주가 상황\n## 📈 기술적 분석\n## 🔑 핵심 뉴스\n## 🎯 지지·저항 레벨\n## ⚠️ 리스크\n## 💡 투자 의견`}]})
      })
      const data=await res.json()
      const result=data.content.filter(b=>b.type==='text').map(b=>b.text).join('\n')
      setAiResult(result)

      // ── AI 분석 결과 메모 자동저장 (MemoPage ai_briefing_memos 방식) ──
      try {
        const timeStr=now.toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
        const title=`[AI분석] ${selected.name}(${selected.code}) — ${timeStr}`
        const CHUNK=800
        const entries=[]
        if(result.length<=CHUNK){
          entries.push({title,content:result})
        } else {
          const parts=Math.ceil(result.length/CHUNK)
          for(let i=0;i<parts;i++){
            entries.push({
              title:`${title} (${i+1}/${parts})`,
              content:result.slice(i*CHUNK,(i+1)*CHUNK),
            })
          }
        }
        const LS_AI='ai_briefing_memos'
        const prev=JSON.parse(localStorage.getItem(LS_AI)||'[]')
        localStorage.setItem(LS_AI,JSON.stringify([...prev,...entries]))
        console.log(`[AI] 메모 ${entries.length}개 저장 → 메모장 페이지 방문 시 Firestore 동기화`)
      } catch(e){ console.warn('[AI] 메모 저장 실패:', e) }

    } catch(e){setAiError(e.message)} finally{setAiLoading(false)}
  }

  const pc   = price?rateColor(price.changeRate):'var(--text-secondary)'
  const sign = (price?.changeRate??0)>0?'+':''
  const isNearH52 = week52?.high&&price?.price&&(price.price/week52.high)>=0.98

  // ══════════════════════════════════════════════════
  // 렌더
  // ══════════════════════════════════════════════════
  return (
    <>
    <div className="cap-page">

      {/* ── 사이드바 ── */}
      <div className={`cap-sidebar ${sidebarOpen?'':'collapsed'}`}>
        {/* 검색 */}
        <div className="cap-sb-search">
          <div className="cap-sb-search-box">
            <span className="cap-sb-search-icon">🔍</span>
            <input ref={searchRef} className="cap-sb-search-input"
              placeholder={slLoading?'로딩 중...':'종목명·코드 검색'}
              value={query} onChange={e=>search(e.target.value)}
              onFocus={()=>query&&setShowDrop(true)}
              onKeyDown={handleKey}
              onBlur={()=>setTimeout(()=>setShowDrop(false),150)}/>
            {query&&<button className="cap-sb-clear" onClick={()=>{setQuery('');setResults([]);setShowDrop(false);searchRef.current?.focus()}}>✕</button>}
          </div>

          {/* 드롭다운 */}
          {showDrop&&results.length>0&&(
            <div className="cap-sb-dropdown">
              {/* 테마 그룹 */}
              {results.filter(s=>THEME_MAP[s.code]).length>0&&(<>
                <div className="cap-sb-dd-glabel">⭐ 테마종목</div>
                {results.filter(s=>THEME_MAP[s.code]).map(s=>{
                  const idx=results.indexOf(s), info=THEME_MAP[s.code]
                  return (
                    <button key={s.code} className={`cap-sb-dd-item ${dropIdx===idx?'hi':''}`}
                      onMouseEnter={()=>setDropIdx(idx)} onClick={()=>select(s)}>
                      <span className="cap-sb-dd-name">{s.name}</span>
                      <span className="cap-sb-dd-code">{s.code}</span>
                      <span className={`cap-sb-dd-mkt ${info.market.toLowerCase()}`}>{info.market}</span>
                    </button>
                  )
                })}
              </>)}
              {/* 전체 그룹 */}
              {results.filter(s=>!THEME_MAP[s.code]).length>0&&(<>
                <div className="cap-sb-dd-glabel">📋 전체종목</div>
                {results.filter(s=>!THEME_MAP[s.code]).map(s=>{
                  const idx=results.indexOf(s)
                  return (
                    <button key={s.code} className={`cap-sb-dd-item ${dropIdx===idx?'hi':''}`}
                      onMouseEnter={()=>setDropIdx(idx)} onClick={()=>select(s)}>
                      <span className="cap-sb-dd-name">{s.name}</span>
                      <span className="cap-sb-dd-code">{s.code}</span>
                      <span className={`cap-sb-dd-mkt ${(s.market||'').toLowerCase()}`}>{s.market||'KRX'}</span>
                    </button>
                  )
                })}
              </>)}
              <div className="cap-sb-dd-footer"><span>↑↓ Enter</span><span style={{marginLeft:'auto'}}>{stockList.length.toLocaleString()}종목</span></div>
            </div>
          )}
          {showDrop&&query&&results.length===0&&(
            <div className="cap-sb-dropdown"><div className="cap-sb-dd-empty">'{query}' 검색 결과 없음</div></div>
          )}
        </div>

        {/* 최근 검색 — 현재가 + 등락률 표시 */}
        {recent.length>0&&(
          <div className="cap-sb-recent">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
              <span className="cap-sb-recent-label">최근 검색</span>
              <button style={{fontSize:10,color:'var(--text-dim)',background:'none',border:'none',cursor:'pointer',padding:'0 2px'}}
                onClick={()=>setRecent([])}>지우기</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              {recent.slice(0,6).map(r=>{
                const p=prices[r.code]
                const rc=p?rateColor(p.changeRate):'var(--text-secondary)'
                const rs=(p?.changeRate??0)>0?'+':''
                return (
                  <button key={r.code} className="cap-sb-chip"
                    style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 8px',borderRadius:6,background:'var(--bg-base)',border:'1px solid var(--border)',cursor:'pointer',width:'100%',textAlign:'left'}}
                    onClick={()=>select(r)}>
                    <span style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{r.name}</span>
                    {p?.price>0&&(
                      <span style={{fontSize:11,color:rc,fontWeight:700}}>
                        {p.price.toLocaleString()}
                        <span style={{fontSize:10,marginLeft:3}}>{rs}{p.changeRate?.toFixed(1)}%</span>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 관심종목 탭 */}
        <div className="cap-sb-tabs">
          <button className={`cap-sb-tab ${wlTab==='watch'?'active':''}`} onClick={()=>setWlTab('watch')}>⭐ 관심</button>
          <button className={`cap-sb-tab ${wlTab==='hold'?'active':''}`}  onClick={()=>setWlTab('hold')}>💼 보유</button>
        </div>

        {wlTab==='watch'&&(
          <select className="cap-sb-cat" value={selCatId} onChange={e=>setSelCatId(e.target.value)}>
            <option value="">— 카테고리 선택 —</option>
            {wlCats.map(cat=><option key={cat.id} value={cat.id}>{cat.name} ({cat.stocks.length})</option>)}
          </select>
        )}

        <div className="cap-sb-list">
          {wlTab==='hold'&&(
            Object.keys(holdings).length===0
            ? <div className="cap-sb-empty">보유종목 없음</div>
            : Object.entries(holdings).map(([code,h])=>{
                const p=prices[code], pc2=p?rateColor(p.changeRate):'var(--text-secondary)', s2=(p?.changeRate??0)>0?'+':''
                const sname=stockList.find(s=>s.code===code)?.name||code
                return (
                  <button key={code} className={`cap-sb-stock ${selected?.code===code?'active':''}`} onClick={()=>select({code,name:sname,theme:'보유종목'})}>
                    <div><span className="cap-sb-sname">{sname}</span><span className="cap-sb-scode" style={{color:'#16a34a'}}>{h.qty}주 {h.rate>=0?'+':''}{h.rate?.toFixed(1)}%</span></div>
                    <div>{p?.price>0?<><span className="cap-sb-sprice">{(p.price).toLocaleString()}</span><span className="cap-sb-srate" style={{color:pc2}}>{s2}{p.changeRate?.toFixed(1)}%</span></>:<span className="cap-sb-sprice">—</span>}</div>
                  </button>
                )
              })
          )}
          {wlTab==='watch'&&selCatStocks.length===0&&<div className="cap-sb-empty">{selCatId?'종목 없음':'카테고리 선택'}</div>}
          {wlTab==='watch'&&selCatStocks.map(s=>{
            const p=prices[s.code], pc2=p?rateColor(p.changeRate):'var(--text-secondary)', s2=(p?.changeRate??0)>0?'+':''
            return (
              <button key={s.code} className={`cap-sb-stock ${selected?.code===s.code?'active':''}`} onClick={()=>select(s)}>
                <div><span className="cap-sb-sname">{s.name}</span><span className="cap-sb-scode">{s.code}</span></div>
                <div>{p?.price>0?<><span className="cap-sb-sprice">{p.price.toLocaleString()}</span><span className="cap-sb-srate" style={{color:pc2}}>{s2}{p.changeRate?.toFixed(2)}%</span></>:<span className="cap-sb-sprice">—</span>}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 사이드바 토글 */}
      <button className={`cap-sb-toggle ${sidebarOpen?'':'collapsed'}`} onClick={()=>setSidebarOpen(v=>!v)}>
        {sidebarOpen?'◀':'▶'}
      </button>

      {/* ── 메인 ── */}
      <div className="cap-main">

        {/* 빈 상태 */}
        {!selected&&(
          <div className="cap-empty">
            <div className="cap-empty-icon">📈</div>
            <div className="cap-empty-title">종목 차트 분석</div>
            <div className="cap-empty-sub">좌측 검색창에서 종목을 선택하세요</div>
            <div className="cap-empty-chips">
              {['삼성전자','SK하이닉스','POSCO홀딩스','현대차','LG에너지솔루션'].map(name=>{
                const s=stockList.find(x=>x.name===name); if(!s) return null
                return <button key={name} className="cap-empty-chip" onClick={()=>select(s)}>{name}</button>
              })}
            </div>
          </div>
        )}

        {selected&&(<>

          {/* ── 헤더 카드 ── */}
          {/* ══ 헤더 2단 ══ */}
          <div className="cap-hdr" style={{borderBottom:'1px solid var(--border)',background:'var(--bg-panel)'}}>
            {/* 1행: 종목명 + 가격 + 액션 */}
            <div className="cap-hdr-r1" style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',flexWrap:'wrap'}}>
              <span className="cap-hdr-name" style={{fontSize:16,fontWeight:800}}>{selected.name}</span>
              <span className="cap-hdr-code" style={{fontSize:12,color:'var(--text-dim)'}}>{selected.code}</span>
              {etfMode&&<span className="cap-hdr-badge etf">ETF</span>}
              {isNearH52&&<span className="cap-hdr-badge h52">🚀 52주 신고가</span>}
              {getKstStatus()==='open'&&<span className="cap-hdr-badge live" style={{color:'#22c55e',fontSize:11,fontWeight:700}}>● LIVE</span>}
              {price?.price>0&&(<>
                <span className="cap-hdr-price" style={{color:pc,fontSize:20,fontWeight:800,marginLeft:4}}>{price.price.toLocaleString()}원</span>
                <span className="cap-hdr-change" style={{color:pc,fontSize:13,fontWeight:600}}>{sign}{price.change?.toLocaleString()}원 ({sign}{price.changeRate?.toFixed(2)}%)</span>
              </>)}
              <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
                <button className={`cap-hdr-btn ${isWatched?'starred':'star'}`} onClick={toggleWatch}>{isWatched?'⭐':'☆'}</button>
                {etfMode&&<button className="cap-hdr-btn" onClick={()=>setShowEtf(true)}>🧩</button>}
                <button className="cap-hdr-btn" onClick={()=>setShowFull(true)}>⛶</button>
                <button className="cap-hdr-btn x" onClick={()=>{setSelected(null);setQuery('')}}>✕</button>
              </div>
            </div>
            {/* 2행: 메트릭 칩 (스크롤) */}
            <div style={{display:'flex',gap:0,overflowX:'auto',padding:'0 12px 6px',scrollbarWidth:'none'}}>
              {[
                price?.volume && {l:'거래량', v:fmtShort(price.volume)+'주'},
                price?.open   && {l:'시가',   v:price.open.toLocaleString()},
                price?.high   && {l:'고가',   v:price.high.toLocaleString(), c:'#dc2626'},
                price?.low    && {l:'저가',   v:price.low.toLocaleString(),  c:'#2563eb'},
                basicInfo?.mac && {l:'시총', v:(Number(String(basicInfo.mac).replace(/,/g,''))/100000000).toFixed(0)+'억'},
                basicInfo?.per&&basicInfo.per!=='0' && {l:'PER', v:Number(basicInfo.per).toFixed(1)+'배'},
                basicInfo?.pbr&&basicInfo.pbr!=='0' && {l:'PBR', v:Number(basicInfo.pbr).toFixed(2)+'배'},
                basicInfo?.eps&&basicInfo.eps!=='0' && {l:'EPS', v:Number(basicInfo.eps).toLocaleString()+'원'},
                basicInfo?.roe&&basicInfo.roe!=='0' && {l:'ROE', v:Number(basicInfo.roe).toFixed(1)+'%'},
                basicInfo?.for_exh_rt && {l:'외국인', v:basicInfo.for_exh_rt+'%'},
                basicInfo?.lsnr_exh_rt && {l:'유통비중', v:basicInfo.lsnr_exh_rt+'%'},
                week52?.high && {l:'52주高', v:Math.round(week52.high).toLocaleString(), c:'#dc2626'},
                week52?.low  && {l:'52주低', v:Math.round(week52.low).toLocaleString(),  c:'#2563eb'},
                basicInfo?.upName && {l:'업종', v:basicInfo.upName, small:true},
              ].filter(Boolean).map((m,i)=>(
                <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'3px 10px',borderRight:'1px solid var(--border)',whiteSpace:'nowrap',flexShrink:0}}>
                  <span style={{fontSize:9,color:'var(--text-dim)',marginBottom:1}}>{m.l}</span>
                  <span style={{fontSize:m.small?10:12,fontWeight:700,color:m.c||'var(--text-primary)'}}>{m.v}</span>
                </div>
              ))}
              {/* 재무 버튼 */}
              <button className="cap-hdr-btn" style={{marginLeft:'auto',alignSelf:'center',flexShrink:0}} onClick={()=>setShowFin(true)}>📊 재무</button>
            </div>
          </div>

          {/* ══ 툴바 통합 (1줄) ══ */}
          <div className="cap-tb" style={{borderBottom:'1px solid var(--border)',background:'var(--bg-panel)'}}>
            <div className="cap-tb-row" style={{display:'flex',alignItems:'center',gap:4,padding:'5px 10px',flexWrap:'wrap'}}>
              {/* 봉종류 */}
              <div className="cap-tg">
                {PERIODS.map(p=><button key={p.key} className={`cap-tg-btn ${period===p.key?'active':''}`}
                  onClick={()=>{
                    setPeriod(p.key); saveChartCfg({period:p.key})
                    setDrawState(null)
                    if(p.key==='month'){setRange(12);saveChartCfg({period:p.key,range:12})}
                    if(p.key==='week') {setRange(6); saveChartCfg({period:p.key,range:6})}
                    if(p.key==='day')  {setRange(3); saveChartCfg({period:p.key,range:3})}
                    if(p.key==='year') {setRange(0); saveChartCfg({period:p.key,range:0})}
                  }}>{p.label}</button>)}
              </div>
              <div className="cap-tb-sep"/>
              {/* 기간 */}
              {period==='min' ? (<>
                <div className="cap-tg">
                  {MIN_SCOPES.map(s=><button key={s} className={`cap-tg-btn ${scope===s?'active':''}`}
                    onClick={()=>setScope(s)}>{s}분</button>)}
                </div>
                <div className="cap-tb-sep"/>
                <div className="cap-tg">
                  {[{label:'당일',days:1},{label:'3일',days:3},{label:'5일',days:5},{label:'10일',days:10},{label:'20일',days:20},{label:'30일',days:30}]
                    .map(r=><button key={r.days} className={`cap-tg-btn ${minDays===r.days?'active':''}`}
                      onClick={()=>setMinDays(r.days)}>{r.label}</button>)}
                </div>
              </>) : (
                <div className="cap-tg">
                  {RANGES.map(r=><button key={r.label} className={`cap-tg-btn ${range===r.months?'active':''}`}
                    onClick={()=>{setRange(r.months);saveChartCfg({range:r.months})}}>{r.label}</button>)}
                </div>
              )}
              <div className="cap-tb-sep"/>
              {/* MA */}
              <button className={`cap-ma-tog ${showMA?'on':''}`} onClick={()=>{setShowMA(v=>{saveChartCfg({showMA:!v});return !v})}}>MA</button>
              {showMA&&<div className="cap-ma-chips">
                {MA_SETTINGS.map(({p,color,label})=>(
                  <button key={p} className={`cap-ma-chip ${enabledMA.has(p)?'on':'off'}`}
                    style={enabledMA.has(p)?{color,borderColor:color,background:color+'18'}:{}}
                    onClick={()=>toggleMA(p)}>{label}</button>
                ))}
              </div>}
              <div className="cap-tb-sep"/>
              {/* 지표 */}
              <div className="cap-ind">
                <button className={`cap-ind-btn bb ${showBB?'on':''}`}     onClick={()=>{setShowBB(v=>{saveChartCfg({showBB:!v});return !v})}}>BB</button>
                <button className={`cap-ind-btn rsi ${showRSI?'on':''}`}   onClick={()=>{setShowRSI(v=>{saveChartCfg({showRSI:!v});return !v})}}>RSI</button>
                <button className={`cap-ind-btn macd ${showMACD?'on':''}`}  onClick={()=>{setShowMACD(v=>{saveChartCfg({showMACD:!v});return !v})}}>MACD</button>
                <button className={`cap-ind-btn stoch ${showStoch?'on':''}`} onClick={()=>{setShowStoch(v=>{saveChartCfg({showStoch:!v});return !v})}}>Stoch</button>
              </div>
              <div className="cap-tb-sep"/>
              {/* 드로잉 */}
              <div className="cap-draw-wr">
                <button className={`cap-draw-tog ${drawTool!=='none'?'on':''}`} onClick={()=>setDrawMenuOpen(v=>!v)}>
                  ✏️ ▾
                </button>
                {drawMenuOpen&&(
                  <div className="cap-draw-menu">
                    {DRAW_TOOLS.map(t=>(
                      <button key={t.id} className={`cap-draw-item ${drawTool===t.id?'on':''}`}
                        onClick={()=>{setDrawTool(t.id);setDrawState(null);setDrawMenuOpen(false)}}>{t.label}</button>
                    ))}
                    {drawings.length>0&&<button className="cap-draw-item del" onClick={()=>{saveDrawings([]);setDrawState(null);setDrawMenuOpen(false)}}>🗑 초기화</button>}
                  </div>
                )}
              </div>
              {drawState&&<span className="cap-draw-hint" style={{fontSize:10,color:'var(--text-dim)'}}>{drawTool==='trend'?'2번째 점 클릭':'끝점 클릭'}</span>}
              <div className="cap-tb-sp"/>
              {/* 우측 패널 탭 버튼 */}
              {[
                {id:'sup',  label:'📊 수급'},
                {id:'news', label:'📰 뉴스'},
                {id:'disc', label:'📋 공시'},
                {id:'si',   label:'ℹ️ 종목'},
                {id:'ai',   label:'🤖 AI'},
              ].map(t=>(
                <button key={t.id}
                  className={`cap-tb-btn ${rightPanel&&panelTab===t.id?'active':''}`}
                  onClick={()=>{
                    if(rightPanel&&panelTab===t.id) setRightPanel(false)
                    else openPanel(t.id)
                  }}>
                  {t.label}
                </button>
              ))}
              <button className="cap-tb-btn" onClick={()=>setShowFull(true)}>⛶</button>
            </div>
          </div>

          {/* ══ 차트 + 우측 패널 ══ */}
          <div style={{display:'flex',flex:1,overflow:'hidden',minHeight:0}}>

            {/* 차트 영역 */}
            <div className="cap-canvas" style={{flex:1,overflow:'auto',minWidth:0}}>
              {chartLoading
                ? <div className="cap-chart-loading"><div className="cap-spinner"/>차트 불러오는 중...</div>
                : (<>
                    <div className="cap-chart-wrap" ref={setChartWrap} style={{position:'relative'}}>
                      <CandleSvg
                        data={candles} width={chartW} height={chartH}
                        showMA={showMA} enabledMA={enabledMA}
                        drawings={drawings} onSvgClick={handleInlineClick}
                        drawTool={drawTool} selectedIdx={selIdx} onSelectDrawing={setSelIdx}
                        showBollinger={showBB} week52={chartHighLow} period={period}
                        volHeight={volH}
                      />
                      <div
                        style={{position:'absolute',left:72,right:72,bottom:32+volH-3,height:6,cursor:'row-resize',zIndex:20,display:'flex',alignItems:'center',justifyContent:'center'}}
                        title="거래량 높이 조절"
                        onMouseDown={e=>{
                          e.preventDefault()
                          let lastY=e.clientY
                          const onMove=e=>{const delta=e.clientY-lastY;lastY=e.clientY;updateVolH(delta)}
                          const onUp=()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp)}
                          window.addEventListener('mousemove',onMove);window.addEventListener('mouseup',onUp)
                        }}
                      >
                        <div style={{width:60,height:2,borderRadius:2,background:'rgba(100,116,139,0.35)',transition:'all .15s'}}
                          onMouseEnter={e=>{e.currentTarget.style.width='120px';e.currentTarget.style.background='#2563eb'}}
                          onMouseLeave={e=>{e.currentTarget.style.width='60px';e.currentTarget.style.background='rgba(100,116,139,0.35)'}}
                        />
                      </div>
                    </div>
                    {candles.length>0&&(<>
                      {showRSI&&(<>
                        <ResizeDivider label="RSI 패널 높이 조절" onDrag={delta=>updateSubH('rsi',delta)}/>
                        <div className="cap-sub"><SubRSI data={candles} width={chartW} height={subHeights.rsi}/></div>
                      </>)}
                      {showMACD&&(<>
                        <ResizeDivider label="MACD 패널 높이 조절" onDrag={delta=>updateSubH('macd',delta)}/>
                        <div className="cap-sub"><SubMACD data={candles} width={chartW} height={subHeights.macd}/></div>
                      </>)}
                      {showStoch&&(<>
                        <ResizeDivider label="Stoch 패널 높이 조절" onDrag={delta=>updateSubH('stoch',delta)}/>
                        <div className="cap-sub"><SubStoch data={candles} width={chartW} height={subHeights.stoch}/></div>
                      </>)}
                    </>)}
                    {textInput&&(
                      <div className="cap-text-bar">
                        <input autoFocus className="cap-text-input" placeholder="메모 입력 후 Enter"
                          onKeyDown={e=>{
                            if(e.key==='Enter'&&e.target.value.trim()){saveDrawings([...drawings,{type:'text',price:textInput.price,bxVal:textInput.x,text:e.target.value.trim()}]);setTextInput(null);setDrawTool('none')}
                            if(e.key==='Escape') setTextInput(null)
                          }}/>
                        <button className="cap-text-cancel" onClick={()=>setTextInput(null)}>✕</button>
                      </div>
                    )}
                  </>)
              }
            </div>

            {/* ══ 우측 정보 패널 ══ */}
            {rightPanel&&(
              <div style={{width:300,borderLeft:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden',background:'var(--bg-panel)',flexShrink:0}}>
                {/* 패널 탭 */}
                <div style={{display:'flex',borderBottom:'1px solid var(--border)',background:'var(--bg-base)'}}>
                  {[
                    {id:'sup',  label:'📊 수급'},
                    {id:'news', label:'📰 뉴스'},
                    {id:'disc', label:'📋 공시'},
                    {id:'si',   label:'ℹ️ 종목'},
                    {id:'ai',   label:'🤖 AI'},
                  ].map(t=>(
                    <button key={t.id}
                      onClick={()=>{setPanelTab(t.id);if(t.id==='sup'&&!supplyData&&!supplyLoad)loadSupply();if(t.id==='news'&&!newsData.length)loadNews()}}
                      style={{flex:1,padding:'6px 2px',fontSize:10,fontWeight:panelTab===t.id?700:400,
                        color:panelTab===t.id?'var(--accent-mid)':'var(--text-dim)',
                        borderBottom:panelTab===t.id?'2px solid var(--accent-mid)':'2px solid transparent',
                        background:'none',border:'none',cursor:'pointer',whiteSpace:'nowrap'}}>
                      {t.label}
                    </button>
                  ))}
                  <button onClick={()=>setRightPanel(false)}
                    style={{padding:'6px 8px',background:'none',border:'none',cursor:'pointer',color:'var(--text-dim)',fontSize:14}}>✕</button>
                </div>

                {/* 패널 컨텐츠 */}
                <div style={{flex:1,overflow:'auto'}}>

                  {/* ── 수급 탭 ── */}
                  {panelTab==='sup'&&(<>
                    <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:12,fontWeight:700}}>📊 {selected.name} 수급</span>
                      <button style={{fontSize:10,padding:'2px 6px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:4,cursor:'pointer'}}
                        onClick={()=>{setSupplyData(null);loadSupply()}}>↺ 새로고침</button>
                    </div>
                    {supplyLoad&&<div style={{padding:20,textAlign:'center',fontSize:12,color:'var(--text-dim)'}}>⟳ 로딩 중...</div>}
                    {!supplyLoad&&!supplyData&&(
                      <div style={{padding:20,textAlign:'center'}}>
                        <button style={{padding:'6px 14px',background:'var(--accent-mid)',color:'white',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600}} onClick={loadSupply}>📡 데이터 불러오기</button>
                      </div>
                    )}
                    {!supplyLoad&&supplyData&&(()=>{
                      const allRows=supplyData.invsr||[]
                      if(!allRows.length) return <div style={{padding:16,textAlign:'center',color:'var(--text-dim)',fontSize:12}}>데이터 없음</div>
                      const rows=[...allRows].reverse().slice(-20)
                      const W=280,H=100,PAD={l:32,r:6,t:6,b:18}
                      const cW=W-PAD.l-PAD.r,cH=H-PAD.t-PAD.b
                      const n=rows.length,bW=Math.max(2,Math.floor(cW/n*0.5))
                      const allV=rows.flatMap(r=>[r.foreign||0,r.orgn||0,r.ind||0])
                      const maxV=Math.max(...allV.map(Math.abs),1)
                      const mid=PAD.t+cH/2
                      const toY=v=>v>=0?mid-(v/maxV)*(cH/2):mid
                      const toH=v=>Math.max(1,Math.abs(v)/maxV*(cH/2))
                      const px=i=>PAD.l+(i+0.5)*(cW/n)
                      let cumFor=0,cumOrg=0
                      return (
                        <>
                          <div style={{padding:'6px 8px 0',borderBottom:'1px solid var(--border)'}}>
                            <div style={{fontSize:9,color:'var(--text-dim)',marginBottom:2,display:'flex',gap:8}}>
                              <span style={{color:'#2563eb'}}>■외국인</span><span style={{color:'#059669'}}>■기관</span><span style={{color:'#94a3b8'}}>■개인</span>
                            </div>
                            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block'}}>
                              <line x1={PAD.l} y1={mid} x2={W-PAD.r} y2={mid} stroke="rgba(0,0,0,0.12)" strokeWidth="0.8"/>
                              {rows.map((r,i)=>{
                                const x=px(i),fv=r.foreign||0,ov=r.orgn||0,iv2=r.ind||0
                                return <g key={i}>
                                  <rect x={x-bW*1.5} y={toY(fv)} width={bW} height={toH(fv)} fill={fv>=0?'#ef4444':'#2563eb'} opacity="0.85"/>
                                  <rect x={x-bW*0.5} y={toY(ov)} width={bW} height={toH(ov)} fill={ov>=0?'#ef4444':'#059669'} opacity="0.85"/>
                                  <rect x={x+bW*0.5} y={toY(iv2)} width={bW} height={toH(iv2)} fill="#94a3b8" opacity="0.7"/>
                                </g>
                              })}
                              {rows.filter((_,i)=>i%(Math.floor(n/3)||1)===0).map((r,i)=>{
                                const idx=rows.indexOf(r),d=String(r.dt||'')
                                return <text key={i} x={px(idx)} y={H-3} fontSize="7" fill="#94a3b8" textAnchor="middle">
                                  {d.length>=8?`${d.slice(4,6)}/${d.slice(6,8)}`:d}
                                </text>
                              })}
                            </svg>
                          </div>
                          <div style={{overflow:'auto',maxHeight:280}}>
                            <div style={{display:'grid',gridTemplateColumns:'44px repeat(3,1fr)',fontSize:10,fontWeight:700,color:'var(--text-dim)',background:'var(--bg-base)',padding:'3px 8px',borderBottom:'1px solid var(--border)',position:'sticky',top:0}}>
                              <span>날짜</span>
                              <span style={{textAlign:'right',color:'#2563eb'}}>외국인</span>
                              <span style={{textAlign:'right',color:'#059669'}}>기관</span>
                              <span style={{textAlign:'right',color:'#94a3b8'}}>개인</span>
                            </div>
                            {rows.map((r,i)=>{
                              cumFor+=r.foreign||0; cumOrg+=r.orgn||0
                              const d=String(r.dt||''),dl=d.length>=8?`${d.slice(4,6)}/${d.slice(6,8)}`:d
                              return (
                                <div key={i} style={{display:'grid',gridTemplateColumns:'44px repeat(3,1fr)',fontSize:10,padding:'3px 8px',borderBottom:'1px solid var(--border-dim)'}}>
                                  <span style={{color:'var(--text-dim)'}}>{dl}</span>
                                  <span style={{textAlign:'right',color:r.foreign>0?'#ef4444':r.foreign<0?'#2563eb':'inherit',fontWeight:600}}>{r.foreign>0?'+':''}{(r.foreign||0).toLocaleString()}</span>
                                  <span style={{textAlign:'right',color:r.orgn>0?'#ef4444':r.orgn<0?'#059669':'inherit',fontWeight:600}}>{r.orgn>0?'+':''}{(r.orgn||0).toLocaleString()}</span>
                                  <span style={{textAlign:'right',color:r.ind>0?'#ef4444':r.ind<0?'#2563eb':'inherit'}}>{r.ind>0?'+':''}{(r.ind||0).toLocaleString()}</span>
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )
                    })()}
                  </>)}

                  {/* ── 뉴스 탭 ── */}
                  {panelTab==='news'&&(<>
                    <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:12,fontWeight:700}}>📰 {selected.name} 뉴스</span>
                      <button style={{fontSize:10,padding:'2px 6px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:4,cursor:'pointer'}} onClick={loadNews}>↺</button>
                    </div>
                    {newsLoading&&<div style={{padding:16,textAlign:'center',fontSize:12,color:'var(--text-dim)'}}>⟳ 검색 중...</div>}
                    {!newsLoading&&!newsData.length&&(
                      <div style={{padding:20,textAlign:'center'}}>
                        <button style={{padding:'6px 14px',background:'var(--accent-mid)',color:'white',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600}} onClick={loadNews}>🔍 뉴스 검색</button>
                      </div>
                    )}
                    {newsData.map((n,i)=>(
                      <a key={i} href={n.url} target="_blank" rel="noreferrer"
                        style={{display:'block',padding:'10px 12px',borderBottom:'1px solid var(--border-dim)',textDecoration:'none'}}>
                        <div style={{fontSize:12,fontWeight:600,color:'var(--text-primary)',marginBottom:3,lineHeight:1.4}}>{n.title}</div>
                        <div style={{fontSize:10,color:'var(--text-dim)'}}>{n.source} · {n.date}</div>
                      </a>
                    ))}
                  </>)}

                  {/* ── 공시 탭 ── */}
                  {panelTab==='disc'&&(<>
                    <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)'}}>
                      <span style={{fontSize:12,fontWeight:700}}>📋 공시 바로가기</span>
                    </div>
                    <div style={{padding:12,display:'flex',flexDirection:'column',gap:8}}>
                      <a href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(selected.name)}`}
                        target="_blank" rel="noreferrer"
                        style={{display:'block',padding:'10px 14px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:8,textDecoration:'none',color:'var(--text-primary)',fontSize:13,fontWeight:600}}>
                        DART 전자공시 →
                      </a>
                      <a href={`https://kind.krx.co.kr/disclosuresearch/disclosuresearch.do?searchmode=searchCorp&searchText=${selected.code}`}
                        target="_blank" rel="noreferrer"
                        style={{display:'block',padding:'10px 14px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:8,textDecoration:'none',color:'var(--text-primary)',fontSize:13,fontWeight:600}}>
                        KRX KIND 공시 →
                      </a>
                      <a href={`https://finance.naver.com/item/news.naver?code=${selected.code}`}
                        target="_blank" rel="noreferrer"
                        style={{display:'block',padding:'10px 14px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:8,textDecoration:'none',color:'var(--text-primary)',fontSize:13,fontWeight:600}}>
                        네이버 종목뉴스 →
                      </a>
                    </div>
                  </>)}

                  {/* ── 종목정보 탭 ── */}
                  {panelTab==='si'&&basicInfo&&(<>
                    <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)'}}>
                      <span style={{fontSize:12,fontWeight:700}}>ℹ️ {selected.name} 종목정보</span>
                    </div>
                    <div style={{padding:'6px 0'}}>
                      {[
                        ['코드',selected.code],
                        ['업종',basicInfo.upName],
                        ['시가총액',basicInfo.mac?(Number(String(basicInfo.mac).replace(/,/g,''))/100000000).toFixed(0)+'억':'-'],
                        ['PER',basicInfo.per&&basicInfo.per!=='0'?Number(basicInfo.per).toFixed(1)+'배':'-'],
                        ['PBR',basicInfo.pbr&&basicInfo.pbr!=='0'?Number(basicInfo.pbr).toFixed(2)+'배':'-'],
                        ['EPS',basicInfo.eps&&basicInfo.eps!=='0'?Number(basicInfo.eps).toLocaleString()+'원':'-'],
                        ['ROE',basicInfo.roe&&basicInfo.roe!=='0'?Number(basicInfo.roe).toFixed(1)+'%':'-'],
                        ['외국인비중',basicInfo.for_exh_rt?basicInfo.for_exh_rt+'%':'-'],
                        ['유통비중',basicInfo.lsnr_exh_rt?basicInfo.lsnr_exh_rt+'%':'-'],
                        ['매출액',basicInfo.sale_amt?Number(String(basicInfo.sale_amt).replace(/,/g,'')).toLocaleString()+'억':'-'],
                        ['영업이익',basicInfo.bus_pro?Number(String(basicInfo.bus_pro).replace(/,/g,'')).toLocaleString()+'억':'-'],
                      ].filter(([,v])=>v&&v!=='-').map(([k,v])=>(
                        <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 14px',borderBottom:'1px solid var(--border-dim)'}}>
                          <span style={{fontSize:11,color:'var(--text-dim)'}}>{k}</span>
                          <span style={{fontSize:12,fontWeight:700,color:'var(--text-primary)'}}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </>)}

                  {/* ── AI 분석 탭 ── */}
                  {panelTab==='ai'&&(<>
                    <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:12,fontWeight:700}}>🤖 AI 분석</span>
                      <button style={{padding:'4px 10px',background:'var(--accent-mid)',color:'white',border:'none',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:600,opacity:aiLoading||!CLAUDE_KEY?0.5:1}}
                        onClick={doAI} disabled={aiLoading||!CLAUDE_KEY}>
                        {aiLoading?'⟳ 분석 중...':aiResult?'↺ 재분석':'🔍 AI 분석'}
                      </button>
                    </div>
                    {!CLAUDE_KEY&&<div style={{padding:12,fontSize:11,color:'#dc2626',background:'#fef2f2',margin:8,borderRadius:6}}>⚠️ VITE_CLAUDE_API_KEY 미설정</div>}
                    {aiError&&<div style={{padding:10,fontSize:11,color:'#dc2626'}}>{aiError}</div>}
                    {aiResult&&!aiLoading&&(
                      <div style={{padding:'8px 12px'}}>
                        <div style={{fontSize:10,color:'var(--text-dim)',marginBottom:6}}>🔍 웹 검색 기반 · {new Date().toLocaleTimeString('ko-KR')} · 메모 자동저장 완료</div>
                        <MarkdownView text={aiResult}/>
                      </div>
                    )}
                    {!aiResult&&!aiLoading&&!aiError&&(
                      <div style={{padding:32,textAlign:'center',color:'var(--text-dim)'}}>
                        <div style={{fontSize:28,marginBottom:8}}>🤖</div>
                        <div style={{fontSize:12,fontWeight:700,marginBottom:4}}>AI 기술적 분석</div>
                        <div style={{fontSize:11}}>{selected.name} 웹 검색 기반<br/>AI 분석을 시작하세요</div>
                      </div>
                    )}
                  </>)}

                </div>
              </div>
            )}
          </div>

        </>)}
      </div>
    </div>

    {/* 전체화면 */}
    {showFull&&selected&&<FullscreenChart stock={selected} initPeriod={period} initRange={range} initMA={showMA} initEMA={enabledMA} onClose={()=>setShowFull(false)}/>}
    {/* ETF 구성종목 */}
    {showEtf&&selected&&<EtfHoldingsPopup code={selected.code} name={selected.name} onClose={()=>setShowEtf(false)}/>}
    {/* 재무제표 */}
    {showFin&&selected&&<FinancialChart stock={selected} onClose={()=>setShowFin(false)}/>}
    </>
  )
}
