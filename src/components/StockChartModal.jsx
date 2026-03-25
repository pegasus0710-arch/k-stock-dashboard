import { useState, useEffect, useCallback, useRef } from 'react'
import './StockChartModal.css'

const PERIODS = [
  { label:'분봉', type:'min' },
  { label:'일봉', type:'day' },
  { label:'주봉', type:'week' },
  { label:'월봉', type:'month' },
  { label:'년봉', type:'year' },
]
const RANGES = [
  { label:'1개월', months:1 }, { label:'3개월', months:3 },
  { label:'6개월', months:6 }, { label:'1년', months:12 },
  { label:'3년', months:36 },  { label:'전체', months:0 },
]
const MIN_SCOPES = ['1','3','5','10','15','30','60']
const MA_SETTINGS = [
  { period:5,   color:'#f59e0b' },
  { period:10,  color:'#10b981' },
  { period:20,  color:'#3b82f6' },
  { period:60,  color:'#8b5cf6' },
  { period:120, color:'#ef4444' },
]
const DART_CORP_MAP = {
  '005930':'00126380','000660':'00164779','005380':'00164742',
  '035420':'00266961','051910':'00117694','006400':'00126380',
  '207940':'00401731','068270':'00105933','012450':'00129838',
  '064350':'00231467','079550':'00140593','329180':'00164876',
  '010140':'00104896','042660':'00131030','034020':'00155276',
  '298040':'00631791','373220':'01182754','005490':'00101867',
  '105560':'00402534','055550':'00378679','086790':'00178024',
}
const DART_API_KEY = import.meta.env.VITE_DART_API_KEY

function fmt(n)     { if(n===undefined||n===null||n===0) return '-'; return Number(n).toLocaleString('ko-KR') }
function fmtShort(n){ if(!n) return '0'; if(n>=100000000) return (n/100000000).toFixed(1)+'억'; if(n>=10000) return (n/10000).toFixed(0)+'만'; return String(n) }
function filterByRange(data,months){ if(!months) return data; const cutoff=new Date(); cutoff.setMonth(cutoff.getMonth()-months); const cutStr=cutoff.toISOString().slice(0,10).replace(/-/g,''); return data.filter(d=>d.dateRaw>=cutStr) }
function calcMA(data,period){ return data.map((_,i)=>{ if(i<period-1) return null; return Math.round(data.slice(i-period+1,i+1).reduce((s,d)=>s+(d.close||0),0)/period) }) }

// ── 캔들차트 (분봉 포함 전 기간) ──────────────────────
function CandleChart({ data, width, height, showMA }) {
  const [tooltip,setTooltip]=useState(null)
  const svgRef=useRef(null)
  if(!data||data.length===0) return null
  const PAD={top:12,right:8,bottom:24,left:80}
  const W=width-PAD.left-PAD.right, H=height-PAD.top-PAD.bottom
  const prices=data.flatMap(d=>[d.high,d.low]).filter(Boolean)
  const rawMin=Math.min(...prices), rawMax=Math.max(...prices)
  const margin=(rawMax-rawMin)*0.06||rawMin*0.005
  const minP=rawMin-margin, maxP=rawMax+margin, rangeP=maxP-minP
  const py=v=>PAD.top+H-((v-minP)/rangeP)*H
  const barW=Math.max(1,Math.min(12,W/data.length-1))
  const bx=i=>PAD.left+(i+0.5)*(W/data.length)
  const yTicks=Array.from({length:5},(_,i)=>minP+(rangeP/4)*i)
  const xTickStep=Math.max(1,Math.floor(data.length/7))
  const maLines=showMA?MA_SETTINGS.map(({period,color})=>{
    const maData=calcMA(data,period)
    const pts=maData.map((v,i)=>v?`${bx(i)},${py(v)}`:null).filter(Boolean)
    return pts.length>=2?{period,color,points:pts.join(' ')}:null
  }).filter(Boolean):[]
  const handleMouseMove=e=>{
    const rect=svgRef.current?.getBoundingClientRect(); if(!rect) return
    const x=e.clientX-rect.left-PAD.left
    const idx=Math.round(x/(W/data.length)-0.5)
    setTooltip({idx:Math.max(0,Math.min(data.length-1,idx)),x:e.clientX-rect.left,y:e.clientY-rect.top})
  }
  const td=tooltip?data[tooltip.idx]:null
  const maValues=showMA&&td?MA_SETTINGS.map(({period,color})=>{const v=calcMA(data,period)[tooltip.idx];return v?{period,color,v}:null}).filter(Boolean):[]
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
        {maLines.map(ma=><polyline key={ma.period} points={ma.points} fill="none" stroke={ma.color} strokeWidth={1.2} opacity={0.85}/>)}
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
          {maValues.map(({period,color,v})=><div key={period} className="smc-tt-row"><span style={{color}}>MA{period}</span><b>{fmt(v)}</b></div>)}
        </div>
      )}
    </div>
  )
}

function VolumeChart({ data, width, height }) {
  if(!data||data.length===0) return null
  const PAD={top:4,right:8,bottom:4,left:80}, W=width-PAD.left-PAD.right, H=height-PAD.top-PAD.bottom
  const maxV=Math.max(...data.map(d=>d.volume||0))
  const barW=Math.max(1,Math.min(12,W/data.length-1))
  const bx=i=>PAD.left+(i+0.5)*(W/data.length)
  return (
    <svg width={width} height={height} style={{display:'block'}}>
      <text x={PAD.left-5} y={PAD.top+10} textAnchor="end" fontSize={9} fill="#94a3b8">거래량</text>
      {data.map((d,i)=>{
        const barH=maxV>0?(d.volume/maxV)*H:0
        return <rect key={i} x={bx(i)-barW/2} y={PAD.top+H-barH} width={barW} height={Math.max(1,barH)} fill={d.close>=d.open?'#fca5a5':'#93c5fd'} opacity={0.8}/>
      })}
    </svg>
  )
}

// ── DART 공시 팝업 ────────────────────────────────────
function DartPopup({ stock, onClose }) {
  const [list,setList]=useState([])
  const [loading,setLoading]=useState(true)
  const [selected,setSelected]=useState(null)

  useEffect(()=>{
    const corpCode=DART_CORP_MAP[stock.code]
    if(!corpCode||!DART_API_KEY){setLoading(false);return}
    const today=new Date().toISOString().slice(0,10).replace(/-/g,'')
    const from=new Date(Date.now()-180*86400000).toISOString().slice(0,10).replace(/-/g,'')
    fetch(`https://opendart.fss.or.kr/api/list.json?crtfc_key=${DART_API_KEY}&corp_code=${corpCode}&bgn_de=${from}&end_de=${today}&page_count=20`)
      .then(r=>r.json()).then(d=>setList(d.list||[])).catch(()=>{}).finally(()=>setLoading(false))
  },[stock.code])

  useEffect(()=>{
    const fn=e=>{if(e.key==='Escape')onClose()}
    window.addEventListener('keydown',fn); return()=>window.removeEventListener('keydown',fn)
  },[onClose])

  return (
    <div className="smc-dart-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="smc-dart-popup">
        <div className="smc-dart-header">
          <span>📋 {stock.name} 공시 목록</span>
          <button className="smc-close" onClick={onClose}>✕</button>
        </div>
        {loading&&<div className="smc-dart-loading">공시 불러오는 중…</div>}
        {!loading&&list.length===0&&(
          <div className="smc-dart-empty">
            {DART_API_KEY?'최근 공시가 없습니다':'DART API 키가 설정되지 않았습니다'}<br/>
            <a href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(stock.name)}`}
              target="_blank" rel="noreferrer" className="smc-dart-link">DART에서 직접 확인 →</a>
          </div>
        )}
        {!loading&&list.length>0&&!selected&&(
          <div className="smc-dart-list">
            {list.map(d=>(
              <button key={d.rcept_no} className="smc-dart-item" onClick={()=>setSelected(d)}>
                <span className="smc-dart-date">{d.rcept_dt?.replace(/(\d{4})(\d{2})(\d{2})/,'$1.$2.$3')}</span>
                <span className="smc-dart-title">{d.report_nm}</span>
                <span className="smc-dart-filer">{d.flr_nm}</span>
              </button>
            ))}
          </div>
        )}
        {selected&&(
          <div className="smc-dart-detail">
            <button className="smc-dart-back" onClick={()=>setSelected(null)}>← 목록으로</button>
            <div className="smc-dart-detail-date">{selected.rcept_dt?.replace(/(\d{4})(\d{2})(\d{2})/,'$1.$2.$3')}</div>
            <h3 className="smc-dart-detail-title">{selected.report_nm}</h3>
            <div className="smc-dart-detail-meta"><span>{selected.corp_name}</span><span>제출인: {selected.flr_nm}</span></div>
            <a href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${selected.rcept_no}`} target="_blank" rel="noreferrer" className="smc-dart-link-btn">📄 DART 원문 보기 →</a>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────
export default function StockChartModal({ stock, onClose }) {
  const [period,   setPeriod]   = useState('day')
  const [scope,    setScope]    = useState('5')
  const [range,    setRange]    = useState(3)
  const [showMA,   setShowMA]   = useState(true)
  const [allData,  setAllData]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [priceInfo,setPriceInfo]= useState(null)
  const [showDart, setShowDart] = useState(false)
  const wrapRef=useRef(null)
  const [chartWidth,setChartWidth]=useState(800)

  useEffect(()=>{ const update=()=>{if(wrapRef.current)setChartWidth(wrapRef.current.clientWidth)}; update(); window.addEventListener('resize',update); return()=>window.removeEventListener('resize',update) },[])
  useEffect(()=>{ const fn=e=>{if(e.key==='Escape')onClose()}; window.addEventListener('keydown',fn); return()=>window.removeEventListener('keydown',fn) },[onClose])

  const fetchChart=useCallback(async()=>{
    if(!stock?.code) return
    setLoading(true); setError(null)
    try {
      // ✅ 올바른 API: type=stock-chart (kiwoom.js에서 처리)
      const url=`/api/kiwoom?type=stock-chart&code=${stock.code}&period=${period}`+(period==='min'?`&tic=${scope}`:'')
      const json=await fetch(url).then(r=>r.json())
      if(json.error) throw new Error(json.error)
      // server.py가 이미 정규화된 candles 반환
      const raw=(json.candles||[]).map(d=>({
        dateRaw:  d.time||'',
        dateLabel:d.label||'',
        open:  Math.abs(d.open ||0),
        high:  Math.abs(d.high ||0),
        low:   Math.abs(d.low  ||0),
        close: Math.abs(d.close||0),
        volume:Math.abs(d.volume||0),
      }))
      setAllData(raw)
    } catch(e){setError(e.message)} finally{setLoading(false)}
  },[stock?.code,period,scope])

  const fetchInfo=useCallback(async()=>{
    if(!stock?.code) return
    try {
      // ✅ ka10001 현재가 (server.py /price 엔드포인트)
      const json=await fetch(`/api/kiwoom?type=price&code=${stock.code}`).then(r=>r.json())
      if(!json.error) setPriceInfo(json)
    } catch{}
  },[stock?.code])

  useEffect(()=>{fetchChart()},[fetchChart])
  useEffect(()=>{fetchInfo()},[fetchInfo])

  if(!stock) return null

  const chartData=period==='min'?allData:filterByRange(allData,range)
  const isUp=(priceInfo?.pred_pre||0)>0, isDown=(priceInfo?.pred_pre||0)<0
  const pc=isUp?'#ef4444':isDown?'#3b82f6':'#64748b'
  const sign=isUp?'+':''

  const infoItems=[
    {label:'시가',    value:priceInfo?.open_pric?fmt(priceInfo.open_pric)+'원':'0원'},
    {label:'고가',    value:priceInfo?.high_pric?fmt(priceInfo.high_pric)+'원':'0원',color:'#ef4444'},
    {label:'저가',    value:priceInfo?.low_pric ?fmt(priceInfo.low_pric )+'원':'0원',color:'#3b82f6'},
    {label:'거래량',  value:priceInfo?.trde_qty ?fmtShort(priceInfo.trde_qty):'-'},
    {label:'시가총액', value:priceInfo?.mac       ?fmt(priceInfo.mac)+'억':'-'},
    {label:'PER',    value:priceInfo?.per&&priceInfo.per!=='0'?Number(priceInfo.per).toFixed(1)+'배':'-'},
    {label:'PBR',    value:priceInfo?.pbr&&priceInfo.pbr!=='0'?Number(priceInfo.pbr).toFixed(2)+'배':'-'},
    {label:'EPS',    value:priceInfo?.eps&&priceInfo.eps!=='0'?fmt(priceInfo.eps)+'원':'-'},
    {label:'ROE',    value:priceInfo?.roe&&priceInfo.roe!=='0'?Number(priceInfo.roe).toFixed(1)+'%':'-'},
    {label:'외국인',  value:priceInfo?.for_exh_rt?priceInfo.for_exh_rt+'%':'-'},
    {label:'유통비율', value:priceInfo?.dstr_rt?priceInfo.dstr_rt+'%':'-'},
  ]

  return (
    <>
      <div className="smc-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
        <div className="smc-modal">
          <div className="smc-header">
            <div className="smc-title-wrap">
              <span className="smc-name">{stock.name}</span>
              <span className="smc-code">{stock.code}</span>
              {priceInfo?.cur_prc>0&&(
                <div className="smc-price-wrap">
                  <span className="smc-cur-price" style={{color:pc}}>{fmt(priceInfo.cur_prc)}원</span>
                  <span className="smc-change" style={{color:pc}}>{sign}{fmt(priceInfo.pred_pre)}원 ({sign}{Number(priceInfo.flu_rt||0).toFixed(2)}%)</span>
                </div>
              )}
            </div>
            <button className="smc-close" onClick={onClose}>✕</button>
          </div>

          <div className="smc-controls">
            <div className="smc-period-tabs">
              {PERIODS.map(p=><button key={p.type} className={`smc-tab ${period===p.type?'active':''}`} onClick={()=>setPeriod(p.type)}>{p.label}</button>)}
            </div>
            {period==='min'?(
              <div className="smc-scope-wrap">
                {MIN_SCOPES.map(s=><button key={s} className={`smc-scope-btn ${scope===s?'active':''}`} onClick={()=>setScope(s)}>{s}분</button>)}
              </div>
            ):(
              <div className="smc-range-wrap">
                {RANGES.map(r=><button key={r.label} className={`smc-scope-btn ${range===r.months?'active':''}`} onClick={()=>setRange(r.months)}>{r.label}</button>)}
              </div>
            )}
            <button className={`smc-ma-btn ${showMA?'active':''}`} onClick={()=>setShowMA(v=>!v)}>MA</button>
            {showMA&&<div className="smc-ma-legend">{MA_SETTINGS.map(({period:p,color})=><span key={p} style={{color,fontSize:'11px',fontWeight:600}}>MA{p}</span>)}</div>}
          </div>

          <div className="smc-chart-wrap" ref={wrapRef}>
            {loading&&<div className="smc-loading">⟳ 차트 불러오는 중...</div>}
            {error  &&<div className="smc-error">⚠️ {error}</div>}
            {!loading&&!error&&chartData.length>0&&(
              <>
                {/* ✅ 분봉도 CandleChart 사용 */}
                <CandleChart data={chartData} width={chartWidth} height={300} showMA={showMA&&period!=='min'}/>
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
            {/* ✅ 공시: 새 탭 대신 팝업 */}
            <button className="smc-dart-btn" onClick={()=>setShowDart(true)}>📋 공시</button>
          </div>
        </div>
      </div>

      {showDart&&<DartPopup stock={stock} onClose={()=>setShowDart(false)}/>}
    </>
  )
}
