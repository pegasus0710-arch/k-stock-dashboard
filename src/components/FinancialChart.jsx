// src/components/FinancialChart.jsx
// 재무 차트 팝업 — 3탭 구성
//  종합탭: 연봉 캔들 + 손익 요약 + DART Placeholder
//  손익탭: 매출/영업이익/순이익 상세
//  밸류탭: PER/PBR/ROE/EPS + 시장현황
import { useState, useEffect, useRef } from 'react'
import './FinancialChart.css'

// ── 유틸 ─────────────────────────────────────────────
const parseN = v => { const n=Number(String(v||'').replace(/[^0-9.-]/g,'')); return isFinite(n)?n:0 }
const fmt = v => {
  const n=parseN(v); if(!n) return '-'
  if(Math.abs(n)>=10000) return (n/10000).toFixed(1)+'조'
  return n.toLocaleString()+'억'
}
const fmtNum = (v,s='') => { const n=parseN(v); return n?n.toLocaleString()+s:'-' }
const fmtPct = v => { const n=parseN(v); return n?(n>0?'+':'')+n.toFixed(1)+'%':'-' }

// ── 연봉 캔들 SVG ─────────────────────────────────────
function YearCandleChart({ candles, width }) {
  const H=180, PAD={top:24,right:64,bottom:20,left:8}
  const W=width-PAD.left-PAD.right, IH=H-PAD.top-PAD.bottom
  const n=candles.length; if(!n) return null
  const prices=[...candles.flatMap(c=>[c.high,c.low])].filter(Boolean)
  const minP=Math.min(...prices), maxP=Math.max(...prices), rng=maxP-minP||1
  const py=v=>PAD.top+IH-((v-minP)/rng)*IH
  const bx=i=>PAD.left+(i+0.5)*(W/n)
  const barW=Math.max(4,Math.min(22,W/n-4))
  const yTicks=Array.from({length:5},(_,i)=>minP+(rng/4)*i)
  return (
    <svg width={width} height={H} style={{display:'block'}}>
      {yTicks.map((v,i)=>(
        <g key={i}>
          <line x1={PAD.left} x2={PAD.left+W} y1={py(v)} y2={py(v)} stroke="#E2E8F0" strokeWidth={0.5}/>
          <text x={PAD.left+W+4} y={py(v)+4} fontSize={9} fill="#94a3b8">
            {v>=10000?(v/10000).toFixed(0)+'만':v>=1000?(v/1000).toFixed(0)+'K':Math.round(v).toLocaleString()}
          </text>
        </g>
      ))}
      {candles.map((c,i)=>{
        const isUp=c.close>=c.open, col=isUp?'#ef4444':'#3b82f6'
        const x=bx(i), top=Math.min(py(c.open),py(c.close))
        const bodyH=Math.max(2,Math.abs(py(c.open)-py(c.close)))
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={py(c.high)} y2={py(c.low)} stroke={col} strokeWidth={1.2}/>
            <rect x={x-barW/2} y={top} width={barW} height={bodyH} fill={col} opacity={0.85}/>
            <text x={x} y={H-4} fontSize={9} fill="#94a3b8" textAnchor="middle">
              {String(c.date||'').slice(0,4)}
            </text>
          </g>
        )
      })}
      {candles.length>0&&(()=>{
        const last=candles[candles.length-1]
        const col=last.close>=last.open?'#ef4444':'#3b82f6'
        return <text x={PAD.left+W+4} y={py(last.close)+4} fontSize={9} fill={col} fontWeight="700">
          {last.close>=10000?(last.close/10000).toFixed(1)+'만':last.close.toLocaleString()}
        </text>
      })()}
    </svg>
  )
}

// ── 손익 막대 ─────────────────────────────────────────
function IncomeBar({ label, value, max, color, pct }) {
  const n=parseN(value); if(!n && n!==0) return null
  const w=Math.min(100,(Math.abs(n)/Math.max(Math.abs(max),1))*100)
  const isNeg=n<0
  return (
    <div style={{marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3,alignItems:'baseline'}}>
        <span style={{fontSize:11,color:'var(--text-dim)',minWidth:60}}>{label}</span>
        <div style={{display:'flex',gap:8,alignItems:'baseline'}}>
          {pct!=null&&<span style={{fontSize:10,color:pct>=0?'#10b981':'#ef4444'}}>{pct>=0?'+':''}{pct.toFixed(1)}%</span>}
          <span style={{fontSize:13,fontWeight:700,color:isNeg?'#ef4444':color}}>{fmt(Math.abs(n))}</span>
        </div>
      </div>
      <div style={{height:7,background:'var(--border)',borderRadius:4,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${w}%`,background:isNeg?'rgba(239,68,68,.6)':color,borderRadius:4,transition:'width .5s'}}/>
      </div>
    </div>
  )
}

// ── 밸류 카드 ─────────────────────────────────────────
function ValCard({ label, value, sub, highlight }) {
  return (
    <div style={{background:'var(--bg-base)',borderRadius:8,padding:'9px 12px',flex:'1',minWidth:72}}>
      <div style={{fontSize:10,color:'var(--text-dim)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.04em'}}>{label}</div>
      <div style={{fontSize:15,fontWeight:800,color:highlight||'var(--text-primary)',lineHeight:1.2}}>{value}</div>
      {sub&&<div style={{fontSize:9,color:'var(--text-dim)',marginTop:2}}>{sub}</div>}
    </div>
  )
}

// ── DART Placeholder ──────────────────────────────────
function DartPlaceholder({ items }) {
  return (
    <div style={{border:'1px dashed var(--border)',borderRadius:8,padding:'14px 16px',
      textAlign:'center',background:'rgba(37,99,235,.03)',marginTop:12}}>
      <div style={{fontSize:12,fontWeight:600,color:'var(--text-dim)',marginBottom:5}}>
        📋 연도별 시계열 — DART 연동 후 활성화
      </div>
      <div style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.8}}>
        {items.join(' · ')}
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────
export default function FinancialChart({ stock, onClose }) {
  const [yearCandles, setYearCandles] = useState([])
  const [loading,     setLoading]     = useState(false)
  const [tab,         setTab]         = useState('overview')
  const wrapRef   = useRef(null)
  const [chartW,  setChartW]  = useState(540)

  const info=stock?.basicInfo||{}, code=stock?.code, name=stock?.name

  // 컨테이너 너비 감지
  useEffect(()=>{
    const obs=new ResizeObserver(entries=>{
      const w=entries[0]?.contentRect?.width
      if(w) setChartW(Math.floor(w-32))
    })
    if(wrapRef.current) obs.observe(wrapRef.current)
    return ()=>obs.disconnect()
  },[])

  // 연봉 fetch
  useEffect(()=>{
    if(!code) return
    setLoading(true)
    fetch(`/api/kiwoom?type=stock-chart&code=${code}&period=year`)
      .then(r=>r.json())
      .then(data=>{
        const raw=(data.candles||[]).slice(-12).map(c=>({
          date: c.time||c.date||'',
          open: Number(c.open||0), high: Number(c.high||0),
          low:  Number(c.low||0),  close:Number(c.close||0),
        })).filter(c=>c.close>0)
        setYearCandles(raw)
      })
      .catch(()=>{})
      .finally(()=>setLoading(false))
  },[code])

  // 재무 수치
  const sale=parseN(info.sale_amt), busPro=parseN(info.bus_pro), cupNga=parseN(info.cup_nga)
  const mac=parseN(info.mac), per=parseN(info.per), pbr=parseN(info.pbr)
  const roe=parseN(info.roe), eps=parseN(info.eps), bps=parseN(info.bps), ev=parseN(info.ev)
  const opm=sale>0?busPro/sale*100:null
  const npm=sale>0?cupNga/sale*100:null
  const incMax=Math.max(Math.abs(sale),Math.abs(busPro),Math.abs(cupNga),1)

  const TABS=[{id:'overview',label:'종합'},{id:'income',label:'손익'},{id:'valuation',label:'밸류'}]

  return (
    <div style={{position:'fixed',inset:0,zIndex:9000,background:'rgba(0,0,0,.48)',
      display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
      onClick={onClose}>
      <div style={{width:'min(640px,96vw)',maxHeight:'90vh',borderRadius:14,
        background:'var(--bg-panel)',boxShadow:'0 24px 64px rgba(0,0,0,.28)',
        display:'flex',flexDirection:'column',overflow:'hidden',border:'1px solid var(--border)'}}
        onClick={e=>e.stopPropagation()}>

        {/* 헤더 */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'14px 18px 12px',borderBottom:'1px solid var(--border)',
          background:'var(--bg-base)',gap:10,flexShrink:0}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap'}}>
              <span style={{fontSize:17,fontWeight:800,color:'var(--text-primary)'}}>{name}</span>
              <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:'monospace'}}>{code}</span>
              {info.setl_mm&&<span style={{fontSize:10,color:'var(--text-dim)',padding:'2px 7px',
                background:'var(--bg-panel)',border:'1px solid var(--border)',borderRadius:5}}>
                {info.setl_mm}월 결산
              </span>}
            </div>
            {mac>0&&<div style={{fontSize:12,color:'var(--text-secondary)',marginTop:3}}>
              시가총액 <b style={{color:'var(--text-primary)'}}>{fmt(mac)}</b>
              {info.for_exh_rt&&<span style={{marginLeft:10}}>외국인 <b>{info.for_exh_rt}%</b></span>}
            </div>}
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
            <a href={`https://finance.naver.com/item/coinfo.naver?code=${code}`}
              target="_blank" rel="noreferrer"
              style={{fontSize:11,color:'var(--accent-mid)',textDecoration:'none',
                padding:'4px 10px',border:'1px solid var(--accent-mid)',borderRadius:6,whiteSpace:'nowrap'}}>
              네이버 재무 →
            </a>
            <button onClick={onClose} style={{width:28,height:28,border:'1px solid var(--border)',
              background:'var(--bg-panel)',cursor:'pointer',fontSize:14,color:'var(--text-dim)',
              borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
          </div>
        </div>

        {/* 탭 */}
        <div style={{display:'flex',gap:0,padding:'0 18px',
          borderBottom:'1px solid var(--border)',background:'var(--bg-panel)',flexShrink:0}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{padding:'9px 18px',border:'none',fontSize:13,fontWeight:tab===t.id?700:500,
                cursor:'pointer',background:'transparent',
                color:tab===t.id?'var(--accent-mid)':'var(--text-secondary)',
                borderBottom:tab===t.id?'2.5px solid var(--accent-mid)':'2.5px solid transparent',
                transition:'all .12s'}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 본문 */}
        <div ref={wrapRef} style={{flex:1,overflowY:'auto',padding:'16px 18px 20px'}}>

          {/* ===== 종합 탭 ===== */}
          {tab==='overview'&&<>
            {/* 연봉 차트 */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text-dim)',marginBottom:6,
                textTransform:'uppercase',letterSpacing:'.04em'}}>📈 연봉 차트</div>
              <div style={{border:'1px solid var(--border)',borderRadius:8,overflow:'hidden',background:'var(--bg-base)'}}>
                {loading
                  ?<div style={{height:180,display:'flex',alignItems:'center',justifyContent:'center',
                    color:'var(--text-dim)',fontSize:13}}>⟳ 불러오는 중...</div>
                  :yearCandles.length>0
                    ?<YearCandleChart candles={yearCandles} width={chartW}/>
                    :<div style={{height:100,display:'flex',alignItems:'center',justifyContent:'center',
                      color:'var(--text-dim)',fontSize:12}}>연봉 데이터 없음</div>}
              </div>
            </div>

            {/* 주요지표 카드 */}
            <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
              <ValCard label="PER" value={per?per.toFixed(1)+'배':'-'} sub="주가수익비율"
                highlight={per>0&&per<15?'#10b981':per>30?'#ef4444':undefined}/>
              <ValCard label="PBR" value={pbr?pbr.toFixed(2)+'배':'-'} sub="주가순자산"
                highlight={pbr>0&&pbr<1?'#10b981':undefined}/>
              <ValCard label="ROE" value={roe?fmtPct(roe):'-'} sub="자기자본이익률"
                highlight={roe>15?'#10b981':undefined}/>
              <ValCard label="EPS" value={eps?eps.toLocaleString()+'원':'-'} sub="주당순이익"/>
            </div>

            {/* 손익 요약 */}
            {(sale||busPro||cupNga)?<div style={{background:'var(--bg-base)',borderRadius:8,padding:'12px 14px',marginBottom:0}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text-dim)',marginBottom:10,
                textTransform:'uppercase',letterSpacing:'.04em'}}>📊 최근 결산 손익</div>
              <IncomeBar label="매출액"    value={info.sale_amt} max={incMax} color="#3b82f6"/>
              <IncomeBar label="영업이익"  value={info.bus_pro}  max={incMax} color="#10b981" pct={opm}/>
              <IncomeBar label="당기순이익" value={info.cup_nga}  max={incMax} color="#8b5cf6" pct={npm}/>
            </div>:null}

            <DartPlaceholder items={['매출 추이','영업이익률 추이','순이익 추이','부채비율','배당성향','PER/PBR 밴드']}/>
          </>}

          {/* ===== 손익 탭 ===== */}
          {tab==='income'&&<>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text-dim)',marginBottom:10,
                textTransform:'uppercase',letterSpacing:'.04em'}}>
                최근 결산 손익 ({info.setl_mm&&`${info.setl_mm}월 결산`})
              </div>
              <IncomeBar label="매출액"    value={info.sale_amt} max={incMax} color="#3b82f6"/>
              <IncomeBar label="영업이익"  value={info.bus_pro}  max={incMax} color="#10b981" pct={opm}/>
              <IncomeBar label="당기순이익" value={info.cup_nga}  max={incMax} color="#8b5cf6" pct={npm}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
              {[
                ['영업이익률', opm!=null?opm.toFixed(1)+'%':'-', opm>=15?'#10b981':opm>=5?'#f59e0b':'#ef4444'],
                ['순이익률',   npm!=null?npm.toFixed(1)+'%':'-', npm>=10?'#10b981':npm>=3?'#f59e0b':'#ef4444'],
                ['ROE',       roe?fmtPct(roe):'-',               roe>=15?'#10b981':undefined],
                ['EV/EBITDA', ev?fmtNum(ev)+'배':'-',           undefined],
              ].map(([l,v,c])=>(
                <div key={l} style={{background:'var(--bg-base)',borderRadius:8,padding:'10px 14px'}}>
                  <div style={{fontSize:10,color:'var(--text-dim)',marginBottom:4,textTransform:'uppercase'}}>{l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:c||'var(--text-primary)'}}>{v}</div>
                </div>
              ))}
            </div>
            <DartPlaceholder items={['연간 매출 추이','영업이익 추이','순이익 추이','분기별 실적']}/>
          </>}

          {/* ===== 밸류에이션 탭 ===== */}
          {tab==='valuation'&&<>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
              <ValCard label="PER"  value={per?per.toFixed(1)+'배':'-'}  sub="주가수익비율"
                highlight={per>0&&per<15?'#10b981':per>30?'#ef4444':undefined}/>
              <ValCard label="PBR"  value={pbr?pbr.toFixed(2)+'배':'-'} sub="주가순자산"
                highlight={pbr>0&&pbr<1?'#10b981':undefined}/>
              <ValCard label="ROE"  value={roe?fmtPct(roe):'-'}         sub="자기자본이익률"
                highlight={roe>15?'#10b981':undefined}/>
              <ValCard label="EPS"  value={eps?eps.toLocaleString()+'원':'-'} sub="주당순이익"/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
              {[
                ['BPS',    bps?bps.toLocaleString()+'원':'-'],
                ['액면가', info.fav?fmtNum(info.fav,'원'):'-'],
                ['결산월', info.setl_mm?info.setl_mm+'월':'-'],
                ['자본금', info.cap?fmt(info.cap):'-'],
                ['유통비율',info.dstr_rt?info.dstr_rt+'%':'-'],
                ['외인소진',info.for_exh_rt?info.for_exh_rt+'%':'-'],
              ].map(([l,v])=>(
                <div key={l} style={{background:'var(--bg-base)',borderRadius:8,padding:'9px 12px'}}>
                  <div style={{fontSize:10,color:'var(--text-dim)',marginBottom:3}}>{l}</div>
                  <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{v}</div>
                </div>
              ))}
            </div>
            {(mac>0||info.oyr_hgst||info.oyr_lwst)&&(
              <div style={{background:'var(--bg-base)',borderRadius:8,padding:'12px 14px',marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-dim)',marginBottom:8}}>시장 현황</div>
                {mac>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border-dim)'}}>
                  <span style={{fontSize:11,color:'var(--text-dim)'}}>시가총액</span>
                  <span style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{fmt(mac)}</span>
                </div>}
                {info.oyr_hgst>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border-dim)'}}>
                  <span style={{fontSize:11,color:'var(--text-dim)'}}>52주 최고</span>
                  <span style={{fontSize:12,fontWeight:700,color:'#ef4444'}}>{info.oyr_hgst?.toLocaleString()}원</span>
                </div>}
                {info.oyr_lwst>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'5px 0'}}>
                  <span style={{fontSize:11,color:'var(--text-dim)'}}>52주 최저</span>
                  <span style={{fontSize:12,fontWeight:700,color:'#3b82f6'}}>{info.oyr_lwst?.toLocaleString()}원</span>
                </div>}
              </div>
            )}
            <DartPlaceholder items={['PER 역사적 밴드','PBR 추이','배당성향/수익률','자기자본비율/부채비율']}/>
          </>}

          <div style={{fontSize:10,color:'var(--text-dim)',marginTop:14,textAlign:'right'}}>
            출처: 키움증권 REST API · ka10001 · ka10094 · 최근 결산 기준
          </div>
        </div>
      </div>
    </div>
  )
}
