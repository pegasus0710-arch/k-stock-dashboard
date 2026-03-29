/**
 * StockChart.jsx — 통합 종목 차트 엔진
 * StockChartModal, ChartAnalysisPage 공통 사용
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ALL_THEMES } from '../constants/themes'
import './StockChart.css'

// ── ETF 코드 목록 (themes.js 기반) ─────────────────────
export const ETF_CODES = new Set(
  ALL_THEMES.flatMap(t => t.etf.map(e => e.code))
)
export const isEtf = code => ETF_CODES.has(code)

// ── ETF holdings 테마 매핑 (폴백용) ─────────────────────
const ETF_THEME_MAP = {}
ALL_THEMES.forEach(theme => {
  theme.etf.forEach(etf => {
    ETF_THEME_MAP[etf.code] = { theme, etf }
  })
})

// ── 상수 ─────────────────────────────────────────────────
export const PERIODS = [
  { key:'min',   label:'분봉' }, { key:'day',   label:'일봉' },
  { key:'week',  label:'주봉' }, { key:'month', label:'월봉' },
  { key:'year',  label:'년봉' },
]
export const RANGES = [
  { label:'1개월', months:1  }, { label:'3개월', months:3  },
  { label:'6개월', months:6  }, { label:'1년',   months:12 },
  { label:'3년',   months:36 }, { label:'전체',  months:0  },
]
export const MIN_SCOPES = ['1','3','5','10','15','30','60']
export const MA_SETTINGS = [
  { p:5,   color:'#f59e0b', label:'MA5'   },
  { p:10,  color:'#a78bfa', label:'MA10'  },
  { p:20,  color:'#10b981', label:'MA20'  },
  { p:60,  color:'#3b82f6', label:'MA60'  },
  { p:120, color:'#ef4444', label:'MA120' },
]
export const DRAW_TOOLS = [
  { id:'none',   label:'🖱️ 선택'    },
  { id:'hline',  label:'━ 수평선'   },
  { id:'trend',  label:'↗ 추세선'   },
  { id:'fib',    label:'🔢 피보나치' },
  { id:'text',   label:'📝 메모'    },
  { id:'split3', label:'⅓ 3분할'   },
  { id:'split4', label:'¼ 4분할'   },
]
const DATA_KEY = {
  min:'stk_min_pole_chart_qry', day:'stk_dt_pole_chart_qry',
  week:'stk_stk_pole_chart_qry', month:'stk_mth_pole_chart_qry', year:'stk_yr_pole_chart_qry',
}

// ── 유틸 ─────────────────────────────────────────────────
export function parseN(s)  { return parseInt(String(s||'').replace(/[^0-9-]/g,''))||0 }
export function fmtN(n)    { return n==null?'-':Number(n).toLocaleString('ko-KR') }
export function fmtShort(n){ if(!n)return'0'; if(n>=100000000)return(n/100000000).toFixed(1)+'억'; if(n>=10000)return(n/10000).toFixed(0)+'만'; return String(n) }
export function rateColor(r){ return Number(r)>0?'#ef4444':Number(r)<0?'#3b82f6':'#94a3b8' }

export function filterByRange(data, months) {
  if (!months) return data
  const cut = new Date(); cut.setMonth(cut.getMonth()-months)
  const cutStr = cut.toISOString().slice(0,10).replace(/-/g,'')
  return data.filter(c => (c.date||'') >= cutStr)
}

export function calcMA(data, p) {
  return data.map((_, i) => {
    if (i < p-1) return null
    return data.slice(i-p+1, i+1).reduce((s,c) => s+c.close, 0) / p
  })
}

function fmtDateLabel(s, period) {
  const d = String(s||'')
  if (period==='min') return d.length>=4 ? d.slice(0,2)+':'+d.slice(2,4) : d
  if (d.length===8) return d.slice(4,6)+'/'+d.slice(6,8)
  return d
}

export function normalizeCandles(items, period, isDataKey) {
  const raw = items.map(c => {
    const dateStr = String(c.date||c.dt||c.cntr_tm||c.time||'')
    return {
      date:   dateStr,
      label:  fmtDateLabel(dateStr, period),
      open:   Math.abs(parseN(c.open   ?? c.open_pric  ?? 0)),
      high:   Math.abs(parseN(c.high   ?? c.high_pric  ?? 0)),
      low:    Math.abs(parseN(c.low    ?? c.low_pric   ?? 0)),
      close:  Math.abs(parseN(c.close  ?? c.cur_prc    ?? 0)),
      volume: parseN(c.volume ?? c.trde_qty ?? 0),
    }
  }).filter(c => c.close > 0)
  if (isDataKey) raw.reverse()
  return raw
}

function lsGet(k,d){ try{return JSON.parse(localStorage.getItem(k))??d}catch{return d} }
export function lsSet(k,v){ try{localStorage.setItem(k,JSON.stringify(v))}catch{} }

// ── 마크다운 렌더러 ───────────────────────────────────────
export function MarkdownView({ text, className }) {
  if (!text) return null
  const bold = t => t.split(/\*\*(.*?)\*\*/g).map((p,i) => i%2===1?<strong key={i}>{p}</strong>:p)
  return (
    <div className={`sc-md ${className||''}`}>
      {text.split('\n').map((line,i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="sc-md-h3">{bold(line.slice(4))}</h4>
        if (line.startsWith('## '))  return <h3 key={i} className="sc-md-h2">{bold(line.slice(3))}</h3>
        if (line.startsWith('# '))   return <h2 key={i} className="sc-md-h1">{bold(line.slice(2))}</h2>
        if (/^[-*] /.test(line))     return <li key={i} className="sc-md-li">{bold(line.slice(2))}</li>
        if (!line.trim())             return <div key={i} className="sc-md-br"/>
        return <p key={i} className="sc-md-p">{bold(line)}</p>
      })}
    </div>
  )
}

// ── useStockChart 훅 ──────────────────────────────────────
export function useStockChart({ code, period, scope, minDays=1, enabled=true }) {
  const [allData, setAllData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const fetch_ = useCallback(async () => {
    if (!code || !enabled) return
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ type:'stock-chart', period, code })
      if (period==='min') {
        params.set('tic', scope||'5')
        params.set('min_days', String(minDays))  // 분봉 조회 일수
      }
      const json = await fetch(`/api/kiwoom?${params}`).then(r=>r.json())
      if (json.error) throw new Error(json.error)
      const items = json.candles || json[DATA_KEY[period]] || []
      const isKey = !json.candles && !!json[DATA_KEY[period]]
      setAllData(normalizeCandles(items, period, isKey))
    } catch(e) { setError(e.message) }
    finally   { setLoading(false) }
  }, [code, period, scope, minDays, enabled])

  useEffect(() => { fetch_() }, [fetch_])
  return { allData, loading, error, reload: fetch_ }
}

// ── 수급 서브차트 ─────────────────────────────────────────
function SupplyBar({ title, data, color }) {
  if (!data?.length) return null
  const vals = data.map(d=>d.value)
  const maxA = Math.max(...vals.map(Math.abs), 1)
  const W=900, H=110, PL=80, PR=12, PT=8, PB=18
  const cW=W-PL-PR, cH=H-PT-PB
  const bw=Math.max(2,Math.floor(cW/data.length*0.65))
  const bx=i=>PL+(i+0.5)*(cW/data.length)
  const midY=PT+cH/2

  let cum=0
  const cumVals=data.map(d=>{cum+=d.value||0;return cum})
  const cumMax=Math.max(...cumVals.map(Math.abs),1)
  const cumPy=v=>PT+cH/2-(v/cumMax)*(cH/2-2)
  const cumPts=cumVals.map((v,i)=>`${bx(i)},${cumPy(v)}`).join(' ')

  return (
    <div className="sc-sup-row">
      <svg viewBox={`0 0 ${W} ${H}`} className="sc-sup-svg">
        <text x={PL-5} y={PT+10} fontSize="9" fill="#94a3b8" textAnchor="end">{title}</text>
        <line x1={PL} x2={PL+cW} y1={midY} y2={midY} stroke="rgba(15,23,42,0.08)" strokeWidth="0.5"/>
        {data.map((d,i)=>{
          const v=d.value||0, bH=Math.abs(v/maxA)*(cH/2-2)
          return <rect key={i} x={bx(i)-bw/2} y={v>=0?midY-bH:midY} width={bw} height={Math.max(1,bH)} fill={v>=0?'#22c55e':'#ef4444'} opacity="0.75"/>
        })}
        <polyline points={cumPts} fill="none" stroke="#f59e0b" strokeWidth="1.2" opacity="0.7"/>
        <text x={PL} y={H-2} fontSize="8" fill="#94a3b8" textAnchor="middle">{(data[0]?.date||'').slice(4,8)?.replace(/(\d{2})(\d{2})/,'$1/$2')}</text>
        <text x={PL+cW} y={H-2} fontSize="8" fill="#94a3b8" textAnchor="middle">{(data[data.length-1]?.date||'').slice(4,8)?.replace(/(\d{2})(\d{2})/,'$1/$2')}</text>
        <text x={PL-5} y={PT+cH-4} fontSize="8" fill="#f59e0b" textAnchor="end">누계▶</text>
      </svg>
    </div>
  )
}

function SupplyLine({ title, data, color, baseline }) {
  if (!data?.length) return null
  const vals=data.map(d=>d.value), maxV=Math.max(...vals,1), minV=Math.min(...vals,0)
  const rng=(maxV-minV)||1
  const W=900, H=110, PL=80, PR=12, PT=8, PB=18
  const cW=W-PL-PR, cH=H-PT-PB
  const px=i=>PL+(i/(data.length-1||1))*cW
  const py=v=>PT+cH-((v-minV)/rng)*cH
  const pts=data.map((d,i)=>`${px(i)},${py(d.value||0)}`).join(' ')
  return (
    <div className="sc-sup-row">
      <svg viewBox={`0 0 ${W} ${H}`} className="sc-sup-svg">
        <text x={PL-5} y={PT+10} fontSize="9" fill="#94a3b8" textAnchor="end">{title}</text>
        {baseline!=null && <line x1={PL} x2={PL+cW} y1={py(baseline)} y2={py(baseline)} stroke="rgba(15,23,42,0.08)" strokeWidth="0.5" strokeDasharray="3,3"/>}
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.3" opacity="0.85"/>
        <text x={PL} y={H-2} fontSize="8" fill="#94a3b8" textAnchor="middle">{(data[0]?.date||'').slice(4,8)?.replace(/(\d{2})(\d{2})/,'$1/$2')}</text>
        <text x={PL+cW} y={H-2} fontSize="8" fill="#94a3b8" textAnchor="middle">{(data[data.length-1]?.date||'').slice(4,8)?.replace(/(\d{2})(\d{2})/,'$1/$2')}</text>
      </svg>
    </div>
  )
}

export function SupplySubChart({ supplyData }) {
  if (!supplyData) return null
  const { foreign, short, strength } = supplyData
  return (
    <div className="sc-sup-wrap">
      <SupplyBar   title="🌐 외국인 순매수" data={(foreign||[]).map(r=>({date:r.dt,value:Number(r.chg_qty||0)}))} color="#3b82f6"/>
      <SupplyLine  title="📉 공매도 비중%" data={(short||[]).map(r=>({date:r.dt,value:parseFloat(r.trde_wght||0)}))} color="#ef4444"/>
      <SupplyLine  title="⚡ 체결강도" data={(strength||[]).map(r=>({date:r.dt,value:parseFloat(r.cntr_str||50)-50}))} color="#10b981" baseline={0}/>
    </div>
  )
}

// ── ETF 구성종목 팝업 ─────────────────────────────────────
export function EtfHoldingsPopup({ code, name, onClose }) {
  const [holdings, setHoldings] = useState([])
  const [prices,   setPrices]   = useState({})
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  // 테마 기반 폴백 데이터
  const themeInfo = ETF_THEME_MAP[code]
  const fallbackHoldings = themeInfo
    ? themeInfo.theme.stocks.slice(0,10).map((s,i) => ({
        code:s.code, name:s.name, weight: null
      }))
    : []

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const r = await fetch(`/api/kiwoom?type=etf-holdings&code=${code}`)
        const d = await r.json()
        const list = d.holdings?.length ? d.holdings : fallbackHoldings
        setHoldings(list.slice(0,10))
        // 각 종목 현재가 조회
        const priceMap = {}
        await Promise.allSettled(
          list.slice(0,10).map(async h => {
            if (!h.code) return
            try {
              const pr = await fetch(`/api/kiwoom?type=price&code=${h.code}`).then(r=>r.json())
              if (!pr.error) priceMap[h.code] = pr
            } catch {}
          })
        )
        setPrices(priceMap)
      } catch(e) {
        setHoldings(fallbackHoldings)
        setError('실시간 데이터 로드 실패 - 테마 기반 표시')
      } finally { setLoading(false) }
    }
    load()
  }, [code])

  const maxW = Math.max(...holdings.map(h=>h.weight||0), 1)

  return (
    <div className="sc-etf-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="sc-etf-popup">
        <div className="sc-etf-header">
          <div>
            <span className="sc-etf-title">{name}</span>
            <span className="sc-etf-badge">ETF 구성종목</span>
          </div>
          <button className="sc-etf-close" onClick={onClose}>✕</button>
        </div>

        {error && <div className="sc-etf-warn">⚠️ {error}</div>}

        {loading ? (
          <div className="sc-etf-loading">⟳ 구성종목 불러오는 중...</div>
        ) : (
          <div className="sc-etf-list">
            {/* 헤더 */}
            <div className="sc-etf-row sc-etf-thead">
              <span>종목명</span>
              <span>비중</span>
              <span>현재가</span>
              <span>등락률</span>
            </div>
            {holdings.map((h, i) => {
              const p = prices[h.code]
              const price = p ? Math.abs(parseN(p.current??p.cur_prc??0)) : 0
              const rate  = p ? parseFloat(p.changeRate??p.flu_rt??0) : null
              const col   = rate!=null ? rateColor(rate) : '#94a3b8'
              const sign  = rate>0?'+':''
              const wPct  = h.weight ? (h.weight/maxW*100).toFixed(0) : 0

              return (
                <div key={h.code||i} className="sc-etf-row">
                  <div className="sc-etf-name-wrap">
                    <span className="sc-etf-rank">{i+1}</span>
                    <div>
                      <div className="sc-etf-sname">{h.name||'—'}</div>
                      <div className="sc-etf-code">{h.code}</div>
                    </div>
                  </div>
                  <div className="sc-etf-weight-wrap">
                    {h.weight ? (
                      <>
                        <div className="sc-etf-bar-bg">
                          <div className="sc-etf-bar-fill" style={{width:`${wPct}%`}}/>
                        </div>
                        <span className="sc-etf-wpct">{h.weight.toFixed(1)}%</span>
                      </>
                    ) : <span className="sc-etf-wpct">—</span>}
                  </div>
                  <span className="sc-etf-price" style={{color:col}}>
                    {price ? fmtN(price)+'원' : '—'}
                  </span>
                  <span className="sc-etf-rate" style={{color:col}}>
                    {rate!=null ? `${sign}${rate.toFixed(2)}%` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <div className="sc-etf-footer">
          <span>상위 {holdings.length}개 구성종목</span>
          <span>실시간 가격 기준</span>
        </div>
      </div>
    </div>
  )
}

// ── 드로잉 툴바 ───────────────────────────────────────────
export function DrawingToolbar({ drawTool, setDrawTool, drawings, saveDrawings, drawState, setDrawState, compact, onSave, stock }) {
  return (
    <div className={`sc-draw-bar ${compact?'compact':''}`}>
      {DRAW_TOOLS.map(t => (
        <button key={t.id}
          className={`sc-draw-btn ${drawTool===t.id?'active':''}`}
          onClick={() => { setDrawTool(t.id); setDrawState?.(null) }}>
          {t.label}
        </button>
      ))}
      <div style={{flex:1}}/>
      {drawings.length>0 && (
        <button className="sc-draw-btn sc-draw-del"
          onClick={() => { saveDrawings([]); setDrawTool('none'); setDrawState?.(null) }}>
          🗑 초기화
        </button>
      )}
      {drawState && (
        <span className="sc-draw-hint">
          {drawTool==='trend'?'2번째 점 클릭':drawTool==='fib'?'끝점 클릭':''}
        </span>
      )}
      {onSave && (
        <button className="sc-draw-btn sc-draw-save" onClick={onSave}>💾 저장</button>
      )}
    </div>
  )
}

// ── CandleSvg — 핵심 캔들 SVG 렌더러 ─────────────────────
export function CandleSvg({
  data, width, height=400,
  showMA=true, enabledMA=new Set([5,20,60,120]),
  drawings=[], onSvgClick, drawTool='none',
  selectedIdx, onSelectDrawing,
  showSupply=false, supplyData, supplyLoading,
  showVolume=true,
  showBollinger=false, week52=null,
}) {
  const svgRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)

  const W = width || 900
  const PAD = { top:14, right:72, bottom:32, left:72 }

  const SUPPLY_ROWS = showSupply ? 3 : 0
  const SUPPLY_H    = showSupply ? 75 : 0
  const SUPPLY_GAP  = showSupply ? 6  : 0
  const VOL_H       = showVolume ? 56 : 0
  const VOL_GAP     = showVolume ? 6  : 0
  const PRICE_H     = height - PAD.top - PAD.bottom - VOL_H - VOL_GAP - SUPPLY_ROWS*(SUPPLY_H+SUPPLY_GAP)
  const totalH      = height
  const chartW      = W - PAD.left - PAD.right

  const n = data.length
  if (!n) return (
    <svg width={W} height={totalH} style={{display:'block',background:'#F1F5F9',borderRadius:8}}>
      <text x={W/2} y={totalH/2} textAnchor="middle" fontSize="13" fill="#94a3b8">데이터가 없습니다</text>
    </svg>
  )

  const prices = data.flatMap(c=>[c.high,c.low]).filter(Boolean)
  const maxP=Math.max(...prices), minP=Math.min(...prices)
  const pad5=(maxP-minP)*0.05||1
  const yMax=maxP+pad5, yMin=minP-pad5, yRng=yMax-yMin
  const toY   = v => PAD.top + PRICE_H - ((v-yMin)/yRng)*PRICE_H
  const fromY = y => yMin + (PAD.top+PRICE_H-y)/PRICE_H*yRng
  const barW  = Math.max(2, Math.floor(chartW/n*0.72))
  const bx    = i => PAD.left + (i+0.5)*(chartW/n)
  const fromX = x => Math.round((x-PAD.left)/(chartW/n)-0.5)

  const maxVol = Math.max(...data.map(c=>c.volume||0), 1)
  const volTop = PAD.top + PRICE_H + VOL_GAP
  const toVolY = v => volTop + VOL_H - (v/maxVol)*VOL_H

  const yStep = Math.ceil(yRng/5 / Math.pow(10,Math.floor(Math.log10(yRng/5)))) * Math.pow(10,Math.floor(Math.log10(yRng/5)))
  const yTicks = []
  let ytick = Math.ceil(yMin/yStep)*yStep
  while(ytick<=yMax){yTicks.push(ytick);ytick+=yStep}

  const xStep = Math.max(1, Math.ceil(n/8))

  const maLines = showMA ? MA_SETTINGS.filter(m=>enabledMA.has(m.p)).map(({p,color})=>{
    const vals=calcMA(data,p)
    const pts=vals.map((v,i)=>v?`${bx(i)},${toY(v)}`:null).filter(Boolean).join(' ')
    return pts.length>1?{p,color,pts}:null
  }).filter(Boolean) : []

  // 볼린저밴드 계산 (20,2)
  const bollBands = showBollinger ? (() => {
    const p=20, m=2
    const mid=new Array(n).fill(null), up=new Array(n).fill(null), lo=new Array(n).fill(null)
    for(let i=p-1;i<n;i++){
      const sl=data.slice(i-p+1,i+1).map(d=>d.close||0)
      const avg=sl.reduce((s,v)=>s+v,0)/p
      const std=Math.sqrt(sl.reduce((s,v)=>s+(v-avg)**2,0)/p)
      mid[i]=avg; up[i]=avg+m*std; lo[i]=avg-m*std
    }
    const midPts=mid.map((v,i)=>v!=null?`${bx(i)},${toY(v)}`:null).filter(Boolean).join(' ')
    const upPts =up.map((v,i)=>v!=null?`${bx(i)},${toY(v)}`:null).filter(Boolean).join(' ')
    const loPts =lo.map((v,i)=>v!=null?`${bx(i)},${toY(v)}`:null).filter(Boolean).join(' ')
    const lastUp=up[n-1], lastLo=lo[n-1], lastClose=data[n-1]?.close
    const pctB=lastUp&&lastLo&&lastClose!=null?(lastClose-lastLo)/(lastUp-lastLo):null
    // BB 스퀴즈 감지: 최근 20봉 중 밴드폭이 최저 수준 → 급등락 전 신호
    const bandWidths=up.map((u,i)=>u&&lo[i]&&mid[i]?(u-lo[i])/mid[i]:null).filter(v=>v!=null)
    const recentBW=bandWidths.slice(-20)
    const minBW=recentBW.length?Math.min(...recentBW):null
    const curBW=bandWidths.at(-1)
    const isSqueeze=minBW!=null&&curBW!=null&&curBW<=minBW*1.05  // 최근 20봉 최저 밴드폭의 105% 이내
    const startIdx=p-1
    return { midPts, upPts, loPts, up, lo, pctB, startIdx, isSqueeze }
  })() : null

  // 수급 데이터 날짜 정렬
  const supplyLabels = ['외국인 순매수', '공매도 비중', '체결강도']
  const supplyColors = ['#3b82f6', '#ef4444', '#10b981']
  const supplyTypes  = ['bar', 'line', 'line']
  const supplyKeys   = ['foreign', 'short', 'strength']

  function handleMouseMove(e) {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const mx = (e.clientX-rect.left)*(W/rect.width)
    const my = (e.clientY-rect.top)*(totalH/rect.height)
    const idx = Math.round((mx-PAD.left)/(chartW/n)-0.5)
    if (idx<0||idx>=n) { setTooltip(null); return }
    setTooltip({ idx, svgX:bx(idx), svgY:my })
  }

  function handleClick(e) {
    if (!svgRef.current||!onSvgClick) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = (e.clientX-rect.left)*(W/rect.width)
    const y = (e.clientY-rect.top)*(totalH/rect.height)
    const idx = fromX(x)
    onSvgClick({ x, y, idx, price:fromY(y), bx, toY, PAD, chartW, n, data })
  }

  const td = tooltip ? data[tooltip.idx] : null

  return (
    <svg ref={svgRef} width={W} height={totalH}
      style={{display:'block',background:'#F1F5F9',borderRadius:8,cursor:drawTool!=='none'?'crosshair':'default'}}
      onMouseMove={handleMouseMove} onMouseLeave={()=>setTooltip(null)}
      onClick={handleClick}>

      <defs>
        {/* 캔들/볼린저밴드가 차트 영역 밖으로 나가지 않도록 클리핑 */}
        <clipPath id="price-area">
          <rect x={PAD.left} y={PAD.top} width={chartW} height={PRICE_H}/>
        </clipPath>
      </defs>

      {/* Y축 눈금 (좌) */}
      {yTicks.map((v,i)=>(
        <g key={i}>
          <line x1={PAD.left} x2={PAD.left+chartW} y1={toY(v)} y2={toY(v)} stroke="rgba(15,23,42,0.07)" strokeWidth={0.5} strokeDasharray="3,3"/>
          <text x={PAD.left-5} y={toY(v)+4} textAnchor="end" fontSize={10} fill="#94a3b8">{fmtN(Math.round(v))}</text>
        </g>
      ))}

      {/* Y축 우측 현재가 레이블 */}
      {data[n-1]?.close&&(()=>{
        const lastClose=data[n-1].close
        const lastOpen=data[n-1].open
        const isUp=lastClose>=lastOpen
        const y=toY(lastClose)
        if(y<PAD.top||y>PAD.top+PRICE_H) return null
        return (
          <g>
            <line x1={PAD.left+chartW} x2={PAD.left+chartW+4} y1={y} y2={y} stroke={isUp?'#ef4444':'#2563eb'} strokeWidth={1}/>
            <rect x={PAD.left+chartW+4} y={y-8} width={PAD.right-6} height={16} rx={3} fill={isUp?'#ef4444':'#2563eb'}/>
            <text x={PAD.left+chartW+7} y={y+4} fontSize={9} fill="white" fontWeight="700">{fmtN(Math.round(lastClose))}</text>
          </g>
        )
      })()}

      {/* X축 날짜 */}
      {data.filter((_,i)=>i%xStep===0).map((c,i)=>(
        <text key={i} x={bx(data.indexOf(c))} y={PAD.top+PRICE_H+VOL_GAP+VOL_H+20} textAnchor="middle" fontSize={10} fill="#94a3b8">{c.label}</text>
      ))}

      {/* ── 차트 영역 클리핑 그룹 ── */}
      <g clipPath="url(#price-area)">

      {/* MA 라인 */}
      {maLines.map(ma=>(
        <polyline key={ma.p} points={ma.pts} fill="none" stroke={ma.color} strokeWidth={1.3} opacity={0.85}/>
      ))}

      {/* 볼린저밴드 */}
      {bollBands&&(<>
        {/* 스퀴즈 감지 — 우측 끝 강조 배지 */}
        {bollBands.isSqueeze&&(
          <g>
            <rect x={PAD.left+chartW-62} y={PAD.top+20} width={60} height={16} rx={3}
              fill="rgba(217,119,6,0.12)" stroke="rgba(217,119,6,0.5)" strokeWidth={1}/>
            <text x={PAD.left+chartW-59} y={PAD.top+31} fontSize={9} fill="#d97706" fontWeight="800">
              🔥 BB스퀴즈
            </text>
          </g>
        )}
        {/* BB 계산 전 구간 구분선 */}
        {bollBands.startIdx>0&&bollBands.startIdx<n&&(
          <line
            x1={bx(bollBands.startIdx)} x2={bx(bollBands.startIdx)}
            y1={PAD.top} y2={PAD.top+PRICE_H}
            stroke="#6366f1" strokeWidth={0.8} strokeDasharray="2,4" opacity={0.35}
          />
        )}
        {bollBands.up.map((u,i)=>{
          if(u==null||bollBands.lo[i]==null||i===0) return null
          const pu=bollBands.up[i-1], pl=bollBands.lo[i-1]
          if(pu==null||pl==null) return null
          return <polygon key={i}
            points={`${bx(i-1)},${toY(pu)} ${bx(i)},${toY(u)} ${bx(i)},${toY(bollBands.lo[i])} ${bx(i-1)},${toY(pl)}`}
            fill="rgba(99,102,241,0.06)"
          />
        })}
        <polyline points={bollBands.upPts}  fill="none" stroke="#6366f1" strokeWidth={1} opacity={0.6} strokeDasharray="3,2"/>
        <polyline points={bollBands.midPts} fill="none" stroke="#6366f1" strokeWidth={0.8} opacity={0.35} strokeDasharray="2,3"/>
        <polyline points={bollBands.loPts}  fill="none" stroke="#6366f1" strokeWidth={1} opacity={0.6} strokeDasharray="3,2"/>
      </>)}

      {/* 52주 고저선 (클립 안) */}
      {week52&&(<>
        {week52.high>=yMin&&week52.high<=yMax&&(()=>{
          const y=toY(week52.high)
          const ry=Math.max(PAD.top+1, y-9)
          return (<>
            <line x1={PAD.left} x2={PAD.left+chartW} y1={y} y2={y} stroke="#dc2626" strokeWidth={1} strokeDasharray="5,4" opacity={0.55}/>
            <rect x={PAD.left+2} y={ry} width={28} height={12} rx={2} fill="#dc2626" opacity={0.85}/>
            <text x={PAD.left+6} y={ry+9} fontSize={8} fill="white" fontWeight="700">52H</text>
          </>)
        })()}
        {week52.low>=yMin&&week52.low<=yMax&&(()=>{
          const y=toY(week52.low)
          const ry=Math.min(PAD.top+PRICE_H-13, y-1)
          return (<>
            <line x1={PAD.left} x2={PAD.left+chartW} y1={y} y2={y} stroke="#2563eb" strokeWidth={1} strokeDasharray="5,4" opacity={0.55}/>
            <rect x={PAD.left+2} y={ry} width={28} height={12} rx={2} fill="#2563eb" opacity={0.85}/>
            <text x={PAD.left+6} y={ry+9} fontSize={8} fill="white" fontWeight="700">52L</text>
          </>)
        })()}
      </>)}

      {/* 캔들 */}
      {data.map((c,i)=>{
        const up=c.close>=c.open, col=up?'#ef4444':'#3b82f6'
        const x=bx(i)
        const bTop=toY(Math.max(c.open,c.close))
        const bH=Math.max(1,toY(Math.min(c.open,c.close))-bTop)
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={toY(c.high)} y2={toY(c.low)} stroke={col} strokeWidth={1}/>
            <rect x={x-barW/2} y={bTop} width={barW} height={bH} fill={col} opacity={tooltip?.idx===i?1:0.85}/>
          </g>
        )
      })}

      </g>{/* end price-area clip */}

      {/* %b 현재값 — 클립 밖 우상단 고정 */}
      {bollBands?.pctB!=null&&(()=>{
        const pctB=bollBands.pctB
        const col=pctB>=1?'#ef4444':pctB<=0?'#3b82f6':'#6366f1'
        return (
          <g>
            <rect x={PAD.left+chartW-52} y={PAD.top+2} width={50} height={16} rx={3} fill={col} opacity={0.88}/>
            <text x={PAD.left+chartW-50} y={PAD.top+13} fontSize={10} fill="white" fontWeight="700">
              {`%b ${(pctB*100).toFixed(0)}`}
            </text>
          </g>
        )
      })()}

      {/* 거래량 */}
      {showVolume && (<>
        <line x1={PAD.left} x2={PAD.left+chartW} y1={volTop} y2={volTop} stroke="rgba(15,23,42,0.08)" strokeWidth={0.5}/>
        <text x={PAD.left-5} y={volTop+12} textAnchor="end" fontSize={9} fill="#94a3b8">거래량</text>
        {(() => {
          // 거래량 MA20 계산
          const volMA20 = data.map((_,i) => {
            if(i<19) return null
            const sl=data.slice(i-19,i+1).map(d=>d.volume||0)
            return sl.reduce((s,v)=>s+v,0)/20
          })
          return (<>
            {data.map((c,i)=>{
              const up=c.close>=c.open
              const vh=Math.max(1,(c.volume/maxVol)*VOL_H)
              const y=volTop+VOL_H-vh
              const ma=volMA20[i]
              // 거래량 급등: MA20 대비 2배 이상 → 강조 표시
              const isSurge=ma&&c.volume>=ma*2
              return (
                <g key={i}>
                  <rect x={bx(i)-barW/2} y={y} width={barW} height={vh}
                    fill={isSurge?(up?'#ef4444':'#2563eb'):(up?'#fca5a5':'#93c5fd')}
                    opacity={isSurge?0.95:0.7}/>
                  {isSurge&&<rect x={bx(i)-barW/2} y={y} width={barW} height={vh}
                    fill="none" stroke={up?'#b91c1c':'#1d4ed8'} strokeWidth={1}/>}
                </g>
              )
            })}
            {/* 거래량 MA20 라인 */}
            {volMA20.some(v=>v!=null)&&(
              <polyline
                points={volMA20.map((v,i)=>v!=null?`${bx(i)},${volTop+VOL_H-(v/maxVol)*VOL_H}`:null).filter(Boolean).join(' ')}
                fill="none" stroke="#f59e0b" strokeWidth={1.5} opacity={0.9} strokeLinejoin="round"
              />
            )}
          </>)
        })()}
      </>)}

      {/* 수급 서브차트 */}
      {showSupply && supplyKeys.map((key, si) => {
        const sData = supplyData?.[key] || []
        const sTop  = volTop + VOL_H + VOL_GAP + si*(SUPPLY_H+SUPPLY_GAP)
        const midY  = sTop + SUPPLY_H/2
        const sMin  = Math.min(...sData.map(d=>parseFloat(d.chg_qty||d.trde_wght||d.cntr_str||0)), 0)
        const sMax  = Math.max(...sData.map(d=>parseFloat(d.chg_qty||d.trde_wght||d.cntr_str||0)), 1)
        const sRng  = (sMax-sMin)||1
        const sPy   = v => sTop + SUPPLY_H - ((v-sMin)/sRng)*SUPPLY_H
        const sBx   = i => PAD.left + (i+0.5)*(chartW/sData.length)
        const sBw   = Math.max(2, Math.floor(chartW/sData.length*0.7))

        return (
          <g key={key}>
            <line x1={PAD.left} x2={PAD.left+chartW} y1={sTop} y2={sTop} stroke="rgba(15,23,42,0.08)" strokeWidth={0.5}/>
            <line x1={PAD.left} x2={PAD.left+chartW} y1={midY} y2={midY} stroke="rgba(15,23,42,0.05)" strokeWidth={0.5} strokeDasharray="2,4"/>
            <text x={PAD.left-5} y={sTop+12} fontSize={9} fill="#94a3b8" textAnchor="end">{supplyLabels[si]}</text>
            {supplyLoading && (
              <text x={PAD.left+chartW/2} y={midY+4} fontSize={10} fill="#94a3b8" textAnchor="middle">로딩 중...</text>
            )}
            {!supplyLoading && supplyTypes[si]==='bar' && sData.map((d,i)=>{
              const v=parseFloat(d.chg_qty||0)
              const bH=Math.abs(v/sRng)*SUPPLY_H
              return <rect key={i} x={sBx(i)-sBw/2} y={v>=0?midY-bH:midY} width={sBw} height={Math.max(1,bH)} fill={v>=0?'#22c55e':'#ef4444'} opacity={0.7}/>
            })}
            {!supplyLoading && supplyTypes[si]==='line' && (() => {
              const pts = sData.map((d,i)=>{
                const v=parseFloat(supplyTypes[si]==='line'&&si===1?d.trde_wght||0:d.cntr_str||100)
                return `${sBx(i)},${sPy(v)}`
              }).join(' ')
              return <polyline points={pts} fill="none" stroke={supplyColors[si]} strokeWidth={1.2} opacity={0.8}/>
            })()}
          </g>
        )
      })}

      {/* 드로잉 */}
      {drawings.map((d, i) => {
        const isSelected = i === selectedIdx
        const lineColor  = d.color || '#f59e0b'
        if (d.type==='hline') {
          const y=toY(d.price)
          if(y<PAD.top||y>PAD.top+PRICE_H) return null
          return (
            <g key={i} style={{cursor:'pointer'}} onClick={e=>{e.stopPropagation();onSelectDrawing?.(i)}}>
              <line x1={PAD.left} x2={PAD.left+chartW} y1={y} y2={y} stroke={lineColor} strokeWidth={isSelected?2:1.5} strokeDasharray="6,3"/>
              <rect x={PAD.left+chartW} y={y-9} width={64} height={18} fill={isSelected?'rgba(37,99,235,0.15)':'rgba(241,245,249,0.95)'} stroke={lineColor} rx={3}/>
              <text x={PAD.left+chartW+4} y={y+4} fontSize={9} fill={lineColor}>{fmtN(Math.round(d.price))}</text>
            </g>
          )
        }
        if (d.type==='trend'&&d.x1!=null) return <line key={i} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#8b5cf6" strokeWidth={isSelected?2.5:1.5} style={{cursor:'pointer'}} onClick={e=>{e.stopPropagation();onSelectDrawing?.(i)}}/>
        if (d.type==='fib'&&d.x1!=null) {
          const levels=[0,0.236,0.382,0.5,0.618,0.786,1]
          const fibColors=['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#64748b']
          return (
            <g key={i}>
              {levels.map((l,li)=>{
                const price=d.price2-((d.price2-d.price1)*l), y=toY(price)
                if(y<PAD.top||y>PAD.top+PRICE_H) return null
                return <g key={li}>
                  <line x1={PAD.left} x2={PAD.left+chartW} y1={y} y2={y} stroke={fibColors[li]} strokeWidth={1} strokeDasharray="4,4" opacity={0.7}/>
                  <text x={PAD.left+chartW+4} y={y+4} fontSize={9} fill={fibColors[li]}>{(l*100).toFixed(1)}%</text>
                </g>
              })}
            </g>
          )
        }
        if (d.type==='text') {
          const x=d.bxVal??PAD.left+50, y=toY(d.price)
          if(y<PAD.top||y>PAD.top+PRICE_H) return null
          return <g key={i} style={{cursor:'pointer'}} onClick={e=>{e.stopPropagation();onSelectDrawing?.(i)}}>
            <rect x={x-2} y={y-13} width={d.text.length*7+8} height={16} fill="rgba(255,255,255,0.92)" stroke={isSelected?'#f59e0b':'#94a3b8'} rx={3}/>
            <text x={x+2} y={y} fontSize={11} fill="#0f172a">{d.text}</text>
          </g>
        }
        return null
      })}

      {/* 크로스헤어 */}
      {td && tooltip.svgY>=PAD.top && tooltip.svgY<=PAD.top+PRICE_H && (<>
        <line x1={tooltip.svgX} x2={tooltip.svgX} y1={PAD.top} y2={PAD.top+PRICE_H} stroke="rgba(15,23,42,0.25)" strokeWidth={0.8} strokeDasharray="4,2"/>
        <line x1={PAD.left} x2={PAD.left+chartW} y1={tooltip.svgY} y2={tooltip.svgY} stroke="rgba(15,23,42,0.18)" strokeWidth={0.8} strokeDasharray="4,2"/>
        {/* Y축 가격 레이블 */}
        <rect x={PAD.left+chartW} y={tooltip.svgY-8} width={PAD.right-2} height={16} fill="#2563eb" rx={3}/>
        <text x={PAD.left+chartW+36} y={tooltip.svgY+4} fontSize={9} fill="white" textAnchor="middle">{fmtN(Math.round(fromY(tooltip.svgY)))}</text>
        {/* 툴팁 */}
        {(() => {
          const tx = tooltip.svgX > W/2 ? tooltip.svgX-148 : tooltip.svgX+10
          return <>
            <rect x={tx} y={PAD.top+4} width={140} height={112} fill="white" stroke="#e2e8f0" rx={6} style={{filter:'drop-shadow(0 2px 8px rgba(15,23,42,0.12))'}}/>
            <text x={tx+8} y={PAD.top+18} fontSize={10} fill="#64748b" fontWeight="600">{td.label}</text>
            {[['시가',td.open,null],['고가',td.high,'#ef4444'],['저가',td.low,'#3b82f6'],['종가',td.close,rateColor(td.close-td.open)],['거래량',td.volume,null]].map(([lbl,val,col],j)=>(
              <g key={j}>
                <text x={tx+8}   y={PAD.top+34+j*15} fontSize={10} fill="#94a3b8">{lbl}</text>
                <text x={tx+134} y={PAD.top+34+j*15} textAnchor="end" fontSize={10} fill={col||'#0f172a'}>{j===4?fmtShort(val):fmtN(Math.round(val))}</text>
              </g>
            ))}
          </>
        })()}
      </>)}
    </svg>
  )
}

// ── 드로잉 핸들러 유틸 ────────────────────────────────────
export function handleDrawClick({ drawTool, setDrawTool, drawState, setDrawState, drawings, saveDrawings, x, y, price, idx, data }) {
  if (drawTool==='none') return
  if (drawTool==='hline') {
    saveDrawings([...drawings, { type:'hline', price }])
  } else if (drawTool==='split3') {
    const prices=data.map(c=>c.close).filter(Boolean)
    if (!prices.length) return
    const lo=Math.min(...prices), hi=Math.max(...prices), r=hi-lo
    saveDrawings([...drawings,
      { type:'hline', price:lo+r/3,   color:'#06b6d4' },
      { type:'hline', price:lo+r*2/3, color:'#06b6d4' },
    ]); setDrawTool('none')
  } else if (drawTool==='split4') {
    const prices=data.map(c=>c.close).filter(Boolean)
    if (!prices.length) return
    const lo=Math.min(...prices), hi=Math.max(...prices), r=hi-lo
    saveDrawings([...drawings,
      { type:'hline', price:lo+r*0.25, color:'#f472b6' },
      { type:'hline', price:lo+r*0.50, color:'#f472b6' },
      { type:'hline', price:lo+r*0.75, color:'#f472b6' },
    ]); setDrawTool('none')
  } else if (drawTool==='trend'||drawTool==='fib') {
    if (!drawState) {
      setDrawState({ x1:x, y1:y, price1:price })
    } else {
      if (drawTool==='trend') saveDrawings([...drawings, { type:'trend', x1:drawState.x1, y1:drawState.y1, x2:x, y2:y }])
      else saveDrawings([...drawings, { type:'fib', x1:drawState.x1, y1:drawState.y1, x2:x, y2:y, price1:drawState.price1, price2:price }])
      setDrawState(null)
    }
  } else if (drawTool==='text') {
    return { textOverlay: { x, y, price, idx } }
  }
}
