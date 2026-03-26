import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  CandleSvg, DrawingToolbar, SupplySubChart, EtfHoldingsPopup, MarkdownView,
  useStockChart, handleDrawClick, filterByRange, parseN, fmtN, fmtShort, rateColor, lsSet,
  PERIODS, RANGES, MIN_SCOPES, MA_SETTINGS, DRAW_TOOLS, isEtf, calcMA,
} from '../components/StockChart'
import '../components/StockChart.css'
import { useStockPrices } from '../hooks/useKiwoomPrice'
import { fmt, fmtRate, getKstStatus } from '../utils/format'
import { ALL_THEMES } from '../constants/themes'
import './ChartAnalysisPage.css'

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

const STOCK_LIST = [...new Map(
  ALL_THEMES.flatMap(t => [
    ...t.etf.map(e   => ({ name:e.name, code:e.code, theme:t.label })),
    ...t.stocks.map(s => ({ name:s.name, code:s.code, theme:t.label })),
  ]).map(s => [s.code, s])
).values()]

const LS_RECENT    = 'cap_recent_v2'
const LS_WATCHLIST = 'cap_watch_v2'
const LS_DRAWINGS  = 'cap_drawings_v2'

function lsGet(k,d){ try{return JSON.parse(localStorage.getItem(k))??d}catch{return d} }

// ── 전체화면 FullscreenChart ─────────────────────────
function FullscreenChart({ stock, initPeriod, initRange, initMA, initEMA, onClose }) {
  const [period,    setPeriod]    = useState(initPeriod||'day')
  const [scope,     setScope]     = useState('5')
  const [range,     setRange]     = useState(initRange||3)
  const [showMA,    setShowMA]    = useState(initMA??true)
  const [enabledMA, setEnabledMA] = useState(initEMA||new Set([5,20,60,120]))
  const [drawings,  setDrawings]  = useState(()=>lsGet(`${LS_DRAWINGS}_${stock.code}`,[]))
  const [drawTool,  setDrawTool]  = useState('none')
  const [drawState, setDrawState] = useState(null)
  const [textOverlay,setTextOverlay]=useState(null)
  const [selIdx,    setSelIdx]    = useState(null)
  const [wrapEl,    setWrapEl]    = useState(null)
  const [width,     setWidth]     = useState(1200)

  const { allData, loading, error } = useStockChart({ code:stock.code, period, scope })
  const candles = period==='min' ? allData : filterByRange(allData, range)

  useEffect(()=>{
    if (!wrapEl) return
    const ro=new ResizeObserver(([e])=>setWidth(e.contentRect.width))
    ro.observe(wrapEl); setWidth(wrapEl.clientWidth); return ()=>ro.disconnect()
  },[wrapEl])

  useEffect(()=>{
    const fn=e=>{ if(e.key==='Escape'){ if(textOverlay)setTextOverlay(null); else onClose() } }
    window.addEventListener('keydown',fn); return ()=>window.removeEventListener('keydown',fn)
  },[onClose,textOverlay])

  const saveD=next=>{ setDrawings(next); lsSet(`${LS_DRAWINGS}_${stock.code}`,next) }
  const toggleMA=p=>setEnabledMA(prev=>{ const n=new Set(prev); n.has(p)?n.delete(p):n.add(p); return n })

  function handleSvgClick(args) {
    const r=handleDrawClick({drawTool,setDrawTool,drawState,setDrawState,drawings,saveDrawings:saveD,...args,data:candles})
    if(r?.textOverlay) setTextOverlay(r.textOverlay)
  }

  const chartH=Math.max(500,(typeof window!=='undefined'?window.innerHeight:800)-170)

  return (
    <div className="cap-fullscreen-overlay">
      <div className="cap-fs-toolbar">
        <span className="cap-fs-title">{stock.name} <span className="cap-fs-code">{stock.code}</span></span>
        <div className="cap-fs-group">
          {PERIODS.map(p=><button key={p.key} className={`cap-fs-btn ${period===p.key?'active':''}`} onClick={()=>setPeriod(p.key)}>{p.label}</button>)}
        </div>
        {period==='min'&&(
          <><div className="cap-fs-sep"/><div className="cap-fs-group">
            {MIN_SCOPES.map(s=><button key={s} className={`cap-fs-btn ${scope===s?'active':''}`} onClick={()=>setScope(s)}>{s}분</button>)}
          </div></>
        )}
        {period!=='min'&&(
          <><div className="cap-fs-sep"/><div className="cap-fs-group">
            {RANGES.map(r=><button key={r.label} className={`cap-fs-btn ${range===r.months?'active':''}`} onClick={()=>setRange(r.months)}>{r.label}</button>)}
          </div></>
        )}
        <div className="cap-fs-sep"/>
        <div className="cap-fs-group">
          <button className={`cap-fs-btn ${showMA?'active':''}`} onClick={()=>setShowMA(v=>!v)}>MA</button>
          {showMA&&MA_SETTINGS.map(m=>(
            <button key={m.p} className={`cap-fs-btn cap-fs-ma ${enabledMA.has(m.p)?'active':''}`}
              style={enabledMA.has(m.p)?{color:m.color,borderColor:m.color}:{}}
              onClick={()=>toggleMA(m.p)}>{m.label}</button>
          ))}
        </div>
        <div className="cap-fs-sep"/>
        {/* 드로잉 툴 */}
        <div className="cap-fs-group">
          {DRAW_TOOLS.map(t=>(
            <button key={t.id} className={`cap-fs-btn ${drawTool===t.id?'active':''}`}
              onClick={()=>{ setDrawTool(t.id); setDrawState(null) }}>{t.label}</button>
          ))}
          {drawings.length>0&&<button className="cap-fs-btn cap-fs-del" onClick={()=>{ saveD([]); setDrawState(null) }}>🗑 초기화</button>}
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          {drawState&&<div className="cap-fs-hint">{drawTool==='trend'?'2번째 점 클릭':'끝점 클릭'}</div>}
          <button className="cap-fs-close" onClick={onClose}>✕ 닫기</button>
        </div>
      </div>

      <div className="cap-fs-body" ref={setWrapEl}>
        {loading&&<div className="cap-fs-loading"><div className="cap-spinner"/>불러오는 중...</div>}
        {!loading&&candles.length>0&&(
          <CandleSvg
            data={candles} width={width} height={chartH}
            showMA={showMA} enabledMA={enabledMA}
            drawings={drawings} onSvgClick={handleSvgClick} drawTool={drawTool}
            selectedIdx={selIdx} onSelectDrawing={setSelIdx}
          />
        )}
        {!loading&&!candles.length&&<div style={{padding:80,textAlign:'center',color:'#475569'}}>데이터가 없습니다</div>}
      </div>

      {textOverlay&&(
        <div className="cap-text-popup">
          <input autoFocus className="cap-text-input" placeholder="메모 입력 후 Enter"
            onKeyDown={e=>{
              if(e.key==='Enter'&&e.target.value.trim()){
                saveD([...drawings,{type:'text',price:textOverlay.price,bxVal:textOverlay.x,text:e.target.value.trim()}])
                setTextOverlay(null); setDrawTool('none')
              }
              if(e.key==='Escape') setTextOverlay(null)
            }}/>
          <button className="cap-text-cancel" onClick={()=>setTextOverlay(null)}>✕</button>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// 메인 ChartAnalysisPage
// ══════════════════════════════════════════════════════
export default function ChartAnalysisPage() {
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState([])
  const [showDrop,  setShowDrop]  = useState(false)
  const [selected,  setSelected]  = useState(null)
  const [recent,    setRecent]    = useState(()=>lsGet(LS_RECENT,[]))
  const [watchlist, setWatchlist] = useState(()=>lsGet(LS_WATCHLIST,[]))

  // 차트 컨트롤
  const [period,    setPeriod]    = useState('day')
  const [scope,     setScope]     = useState('5')
  const [range,     setRange]     = useState(3)
  const [showMA,    setShowMA]    = useState(true)
  const [enabledMA, setEnabledMA] = useState(new Set([5,20,60,120]))
  const [activeTab, setActiveTab] = useState('chart')
  const [showFull,  setShowFull]  = useState(false)

  // 드로잉
  const [drawings,    setDrawings]    = useState([])
  const [drawTool,    setDrawTool]    = useState('none')
  const [drawState,   setDrawState]   = useState(null)
  const [textInput,   setTextInput]   = useState(null)
  const [selIdx,      setSelIdx]      = useState(null)
  const [chartWrap,   setChartWrap]   = useState(null)
  const [chartWidth,  setChartWidth]  = useState(900)

  // 수급
  const [showSupply,    setShowSupply]    = useState(true)
  const [foreignData,   setForeignData]   = useState(null)
  const [shortData,     setShortData]     = useState(null)
  const [strData,       setStrData]       = useState(null)
  const [supplyLoading, setSupplyLoading] = useState(false)

  // ETF
  const [showEtf, setShowEtf] = useState(false)
  const etfMode = isEtf(selected?.code)

  // AI
  const [aiResult, setAiResult] = useState('')
  const [aiLoading,setAiLoading]= useState(false)
  const [aiError,  setAiError]  = useState('')

  const { allData, loading: chartLoading } = useStockChart({
    code: selected?.code, period, scope, enabled: !!selected
  })
  const candles = useMemo(()=>period==='min'?allData:filterByRange(allData,range),[allData,range,period])

  const codes=selected?[selected.code]:[]
  const { prices }=useStockPrices(codes, getKstStatus()==='open'?30000:300000)
  const price=selected?prices[selected.code]:null

  useEffect(()=>{
    if (!chartWrap) return
    const ro=new ResizeObserver(([e])=>setChartWidth(e.contentRect.width))
    ro.observe(chartWrap); setChartWidth(chartWrap.clientWidth); return ()=>ro.disconnect()
  },[chartWrap])

  const search=q=>{
    setQuery(q)
    if (!q.trim()){setResults([]);setShowDrop(false);return}
    const kw=q.toLowerCase()
    setResults(STOCK_LIST.filter(s=>s.name.toLowerCase().includes(kw)||s.code.includes(kw)).slice(0,10))
    setShowDrop(true)
  }

  const select=stock=>{
    setSelected(stock); setQuery(stock.name); setShowDrop(false)
    setAiResult(''); setAiError(''); setForeignData(null)
    const d=lsGet(`${LS_DRAWINGS}_${stock.code}`,[])
    setDrawings(d); setDrawTool('none'); setDrawState(null)
    const next=[stock,...recent.filter(r=>r.code!==stock.code)].slice(0,8)
    setRecent(next); lsSet(LS_RECENT,next)
    // 수급 자동 로드
    setTimeout(()=>loadSupply(stock.code),200)
  }

  const saveDrawings=next=>{
    setDrawings(next)
    if(selected) lsSet(`${LS_DRAWINGS}_${selected.code}`,next)
  }

  const loadSupply=useCallback(async(code)=>{
    const c=code||selected?.code
    if (!c) return
    setSupplyLoading(true)
    try {
      const [f,sh,st]=await Promise.all([
        fetch(`/api/kiwoom?type=supply-foreign&code=${c}`).then(r=>r.json()),
        fetch(`/api/kiwoom?type=supply-short&code=${c}&days=30`).then(r=>r.json()),
        fetch(`/api/kiwoom?type=supply-strength&code=${c}`).then(r=>r.json()),
      ])
      setForeignData(f.data?.slice(0,30)||[])
      setShortData(sh.data?.slice(0,30)||[])
      setStrData(st.data?.slice(0,30)||[])
    } catch {} finally { setSupplyLoading(false) }
  },[selected?.code])

  const doAI=async()=>{
    if (!selected||!CLAUDE_KEY) return
    setAiLoading(true); setAiError('')
    try {
      const today=new Date().toLocaleDateString('ko-KR')
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1000,
          tools:[{type:'web_search_20250305',name:'web_search'}],
          messages:[{role:'user',content:`오늘(${today}) ${selected.name}(${selected.code}) 분석.

## 📌 현재 주가 상황
## 📈 기술적 분석
## 🔑 핵심 뉴스
## 🎯 지지·저항 레벨
## ⚠️ 리스크
## 💡 투자 의견`}]}),
      })
      const data=await res.json()
      setAiResult(data.content.filter(b=>b.type==='text').map(b=>b.text).join('\n'))
    } catch(e) { setAiError(e.message) }
    finally { setAiLoading(false) }
  }

  const toggleWatch=()=>{
    if (!selected) return
    const exists=watchlist.find(w=>w.code===selected.code)
    const next=exists?watchlist.filter(w=>w.code!==selected.code):[selected,...watchlist].slice(0,20)
    setWatchlist(next); lsSet(LS_WATCHLIST,next)
  }
  const isWatched=selected&&watchlist.find(w=>w.code===selected.code)
  const toggleMA=p=>setEnabledMA(prev=>{ const n=new Set(prev); n.has(p)?n.delete(p):n.add(p); return n })

  function handleInlineClick(args) {
    const r=handleDrawClick({drawTool,setDrawTool,drawState,setDrawState,drawings,saveDrawings,...args,data:candles})
    if(r?.textOverlay) setTextInput(r.textOverlay)
  }

  const pc=price?rateColor(price.changeRate):'#94a3b8'
  const sign=(price?.changeRate??0)>0?'+':''

  const supplyDataObj = foreignData ? { foreign:foreignData, short:shortData, strength:strData } : null

  const TABS=etfMode
    ? [{id:'chart',label:'📈 차트'},{id:'ai',label:'🤖 AI 분석'}]
    : [{id:'chart',label:'📈 차트'},{id:'ai',label:'🤖 AI 분석'}]

  return (
    <div className="cap-wrap">
      <div className="page-header">
        <div><h1 className="page-title">차트 분석</h1><p className="page-sub">종목 검색 · 캔들차트 · 보조지표 · 수급 · AI 분석</p></div>
      </div>

      {/* 검색 */}
      <div className="cap-search-section">
        <div className="cap-search-box">
          <span className="cap-search-icon">🔍</span>
          <input className="cap-search-input" placeholder="종목명 또는 코드 검색 (예: 삼성전자, 005930)"
            value={query} onChange={e=>search(e.target.value)}
            onFocus={()=>query&&setShowDrop(true)}
            onKeyDown={e=>e.key==='Escape'&&setShowDrop(false)}/>
          {query&&<button className="cap-clear" onClick={()=>{setQuery('');setResults([]);setShowDrop(false)}}>✕</button>}
          {showDrop&&results.length>0&&(
            <div className="cap-dropdown">
              {results.map(s=>(
                <button key={s.code} className="cap-dd-item" onClick={()=>select(s)}>
                  <span className="cap-dd-name">{s.name}</span>
                  <span className="cap-dd-code">{s.code}</span>
                  <span className="cap-dd-theme">{s.theme}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {!selected&&recent.length>0&&(
          <div className="cap-chips-row"><span className="cap-chip-label">최근</span>
            {recent.map(r=><button key={r.code} className="cap-chip" onClick={()=>select(r)}>{r.name}</button>)}
          </div>
        )}
        {!selected&&watchlist.length>0&&(
          <div className="cap-chips-row"><span className="cap-chip-label">⭐ 즐겨찾기</span>
            {watchlist.map(w=><button key={w.code} className="cap-chip cap-chip-star" onClick={()=>select(w)}>{w.name}</button>)}
          </div>
        )}
      </div>

      {selected&&(
        <div className="cap-body">
          {/* 헤더 */}
          <div className="cap-stock-header">
            <div className="cap-stock-left">
              <span className="cap-stock-name">{selected.name}</span>
              <span className="cap-stock-code">{selected.code}</span>
              <span className="cap-stock-theme">{selected.theme}</span>
              {etfMode&&<span style={{fontSize:'11px',padding:'2px 6px',background:'rgba(37,99,235,0.15)',color:'#60a5fa',borderRadius:5,border:'1px solid rgba(37,99,235,0.3)'}}>ETF</span>}
              {price?.price>0&&<>
                <span className="cap-price" style={{color:pc}}>{fmtN(price.price)}원</span>
                <span className="cap-change" style={{color:pc}}>{sign}{price.changeRate?.toFixed(2)}%</span>
              </>}
            </div>
            <div className="cap-stock-right">
              <button className={`cap-btn-watch ${isWatched?'active':''}`} onClick={toggleWatch}>{isWatched?'⭐':'☆'} {isWatched?'해제':'즐겨찾기'}</button>
              <button className="cap-btn-close" onClick={()=>{setSelected(null);setQuery('')}}>✕</button>
            </div>
          </div>

          {/* 탭 */}
          <div className="cap-tabs">
            {TABS.map(t=><button key={t.id} className={`cap-tab ${activeTab===t.id?'active':''}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>)}
          </div>

          {/* ── 차트 탭 ── */}
          {activeTab==='chart'&&(
            <div className="cap-chart-section">
              {/* 컨트롤 바 */}
              <div className="cap-ctrl-bar">
                <div className="cap-period-group">
                  {PERIODS.map(p=><button key={p.key} className={`cap-period-btn ${period===p.key?'active':''}`} onClick={()=>setPeriod(p.key)}>{p.label}</button>)}
                </div>
                {period==='min'&&<>
                  <div className="cap-sep"/>
                  <div className="cap-period-group">
                    {['1','3','5','10','15','30','60'].map(s=><button key={s} className={`cap-period-btn ${scope===s?'active':''}`} onClick={()=>setScope(s)}>{s}분</button>)}
                  </div>
                </>}
                {period!=='min'&&<>
                  <div className="cap-sep"/>
                  <div className="cap-period-group">
                    {RANGES.map(r=><button key={r.label} className={`cap-period-btn ${range===r.months?'active':''}`} onClick={()=>setRange(r.months)}>{r.label}</button>)}
                  </div>
                </>}
                <div className="cap-sep"/>
                <button className={`cap-ma-btn ${showMA?'active':''}`} onClick={()=>setShowMA(v=>!v)}>MA</button>
                {showMA&&MA_SETTINGS.map(m=>(
                  <button key={m.p} className={`cap-ma-chip ${enabledMA.has(m.p)?'active':''}`}
                    style={enabledMA.has(m.p)?{color:m.color,borderColor:m.color,background:m.color+'18'}:{}}
                    onClick={()=>toggleMA(m.p)}>{m.label}</button>
                ))}
                <div style={{marginLeft:'auto',display:'flex',gap:4}}>
                  <button className={`cap-period-btn ${showSupply?'active':''}`}
                    onClick={()=>{ const n=!showSupply; setShowSupply(n); if(n&&!foreignData) loadSupply() }}>
                    📊 수급
                  </button>
                  {etfMode&&(
                    <button className="cap-period-btn" style={{color:'#60a5fa',borderColor:'rgba(37,99,235,0.4)'}}
                      onClick={()=>setShowEtf(true)}>🧩 구성종목</button>
                  )}
                  <button className="cap-fullscreen-btn" onClick={()=>setShowFull(true)}>⛶ 전체화면</button>
                </div>
              </div>

              {/* 정보바 */}
              {price?.price>0&&(
                <div className="cap-info-bar">
                  {[
                    ['현재가', `${fmtN(price.price)}원`,                          pc],
                    ['등락률', `${sign}${price.changeRate?.toFixed(2)}%`,         pc],
                    ['거래량', `${fmtShort(price.volume)}주`,                     null],
                    ['PER',    price.per?`${Number(price.per).toFixed(1)}배`:'-', null],
                    ['PBR',    price.pbr?`${Number(price.pbr).toFixed(2)}배`:'-', null],
                    ['외국인', price.forExhRt?`${price.forExhRt}%`:'-',           null],
                  ].map(([label,val,color])=>(
                    <div key={label} className="cap-info-item">
                      <div className="cap-info-label">{label}</div>
                      <div className="cap-info-val" style={{color:color||undefined}}>{val}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 드로잉 툴바 */}
              <DrawingToolbar
                drawTool={drawTool} setDrawTool={setDrawTool}
                drawings={drawings} saveDrawings={saveDrawings}
                drawState={drawState} setDrawState={setDrawState}
              />

              {/* 차트 */}
              <div className="cap-chart-area" ref={setChartWrap}>
                {chartLoading
                  ? <div className="cap-chart-loading"><div className="cap-spinner"/>차트 불러오는 중...</div>
                  : <CandleSvg
                      data={candles} width={chartWidth} height={360}
                      showMA={showMA} enabledMA={enabledMA}
                      drawings={drawings} onSvgClick={handleInlineClick} drawTool={drawTool}
                      selectedIdx={selIdx} onSelectDrawing={setSelIdx}
                    />
                }
              </div>

              {/* 텍스트 메모 */}
              {textInput&&(
                <div className="cap-text-popup-inline">
                  <input autoFocus className="cap-text-input" placeholder="메모 입력 후 Enter"
                    onKeyDown={e=>{
                      if(e.key==='Enter'&&e.target.value.trim()){
                        saveDrawings([...drawings,{type:'text',price:textInput.price,bxVal:textInput.x,text:e.target.value.trim()}])
                        setTextInput(null); setDrawTool('none')
                      }
                      if(e.key==='Escape') setTextInput(null)
                    }}/>
                  <button className="cap-text-cancel" onClick={()=>setTextInput(null)}>✕</button>
                </div>
              )}

              {/* 수급 서브차트 */}
              {showSupply&&supplyDataObj&&(
                <SupplySubChart supplyData={supplyDataObj}/>
              )}
              {showSupply&&supplyLoading&&(
                <div style={{padding:'12px',textAlign:'center',background:'#0a0f1a',color:'#475569',fontSize:12}}>
                  <div className="cap-spinner" style={{display:'inline-block',marginRight:6}}/>수급 데이터 로딩 중...
                </div>
              )}

              {/* 링크 */}
              <div className="cap-links-row">
                <a href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(selected.name)}`} target="_blank" rel="noreferrer" className="cap-ext-link">📋 DART 공시 →</a>
                <a href={`https://finance.naver.com/item/main.naver?code=${selected.code}`} target="_blank" rel="noreferrer" className="cap-ext-link">📊 네이버 증권 →</a>
              </div>
            </div>
          )}

          {/* ── AI 분석 탭 ── */}
          {activeTab==='ai'&&(
            <div className="cap-ai-section">
              <div className="cap-ai-header">
                <div>🤖 <strong>{selected.name}</strong> 웹 검색 기반 AI 분석</div>
                <div className="cap-ai-controls">
                  <button className="cap-btn-primary" onClick={doAI} disabled={aiLoading||!CLAUDE_KEY}>
                    {aiLoading?'⟳ 분석 중...':aiResult?'↺ 다시 분석':'🔍 AI 분석 시작'}
                  </button>
                </div>
              </div>
              {!CLAUDE_KEY&&<div className="cap-ai-warn">⚠️ VITE_CLAUDE_API_KEY 미설정</div>}
              {aiError&&<div className="cap-ai-error">⚠️ {aiError}</div>}
              {aiLoading&&<div className="cap-loading"><div className="cap-spinner"/>{selected.name} 분석 중...</div>}
              {aiResult&&!aiLoading&&(
                <div className="cap-ai-result">
                  <div className="cap-ai-badge">🔍 웹 검색 기반 · {new Date().toLocaleTimeString('ko-KR')}</div>
                  <MarkdownView text={aiResult}/>
                </div>
              )}
              {!aiResult&&!aiLoading&&!aiError&&(
                <div className="cap-ai-placeholder"><p><strong>AI 분석 시작</strong> 버튼을 눌러보세요</p><p className="cap-ai-sub">웹 검색 + 기술적 분석 종합</p></div>
              )}
            </div>
          )}
        </div>
      )}

      {!selected&&watchlist.length===0&&recent.length===0&&(
        <div className="cap-empty"><div className="cap-empty-icon">📈</div><p>종목명 또는 코드를 검색해 차트 분석을 시작하세요</p><p className="cap-empty-sub">예: 삼성전자, SK하이닉스, 005930</p></div>
      )}

      {/* ETF 구성종목 팝업 */}
      {showEtf&&selected&&(
        <EtfHoldingsPopup code={selected.code} name={selected.name} onClose={()=>setShowEtf(false)}/>
      )}

      {/* 전체화면 */}
      {showFull&&selected&&(
        <FullscreenChart
          stock={selected} initPeriod={period} initRange={range}
          initMA={showMA} initEMA={enabledMA}
          onClose={()=>setShowFull(false)}
        />
      )}
    </div>
  )
}
