import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  CandleSvg, DrawingToolbar, SupplySubChart, EtfHoldingsPopup, MarkdownView,
  useStockChart, handleDrawClick, filterByRange, parseN, fmtN, fmtShort, rateColor, lsSet,
  PERIODS, RANGES, MIN_SCOPES, MA_SETTINGS, DRAW_TOOLS, isEtf, calcMA,
} from '../components/StockChart'
import '../components/StockChart.css'
import { useStockPrices } from '../hooks/useKiwoomPrice'
import { useStockList }   from '../hooks/useStockList'
import { fmt, fmtRate, getKstStatus } from '../utils/format'
import { ALL_THEMES } from '../constants/themes'
import './ChartAnalysisPage.css'
import FinancialChart from '../components/FinancialChart'

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

// 테마 종목 맵 (market badge용)
const THEME_LABEL_MAP = {}
ALL_THEMES.forEach(t => {
  t.etf.forEach(e    => { THEME_LABEL_MAP[e.code] = { theme: t.label, market: 'ETF'    } })
  t.stocks.forEach(s => { THEME_LABEL_MAP[s.code] = { theme: t.label, market: 'KOSPI'  } })
})

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
  const [enabledMA, setEnabledMA] = useState(initEMA||new Set([5,10,20,60,120]))
  const [drawings,  setDrawings]  = useState(()=>lsGet(`${LS_DRAWINGS}_${stock.code}`,[]))
  const [drawTool,  setDrawTool]  = useState('none')
  const [drawState, setDrawState] = useState(null)
  const [textOverlay,setTextOverlay]=useState(null)
  const [selIdx,    setSelIdx]    = useState(null)
  const [wrapEl,    setWrapEl]    = useState(null)
  const [width,     setWidth]     = useState(1200)
  const [fsBasicInfo,  setFsBasicInfo]   = useState(null)
  const [fsShowSupply, setFsShowSupply]  = useState(false)
  const [fsSupplyData, setFsSupplyData]  = useState(null)
  const [fsSupplyLoad, setFsSupplyLoad]  = useState(false)

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

  // 전체화면: 기본 정보 로드
  useEffect(()=>{
    if (!stock?.code) return
    Promise.allSettled([
      fetch(`/api/kiwoom?type=stockbasic&code=${stock.code}`).then(r=>r.json()),
      fetch(`/api/kiwoom?type=stockinfo&code=${stock.code}`).then(r=>r.json()),
    ]).then(([b,s])=>{
      setFsBasicInfo({
        ...(b.status==='fulfilled'&&!b.value?.error?b.value:{}),
        ...(s.status==='fulfilled'&&!s.value?.error?s.value:{}),
      })
    }).catch(()=>{})
  },[stock?.code])

  // 전체화면: 수급 로드
  useEffect(()=>{
    if (!fsShowSupply||fsSupplyData||!stock?.code) return
    setFsSupplyLoad(true)
    Promise.all([
      fetch(`/api/kiwoom?type=supply-foreign&code=${stock.code}`).then(r=>r.json()),
      fetch(`/api/kiwoom?type=supply-short&code=${stock.code}&days=30`).then(r=>r.json()),
      fetch(`/api/kiwoom?type=supply-strength&code=${stock.code}`).then(r=>r.json()),
    ]).then(([f,sh,st])=>{
      setFsSupplyData({ foreign:f.data?.slice(0,60)||[], short:sh.data?.slice(0,60)||[], strength:st.data?.slice(0,60)||[] })
    }).catch(()=>{}).finally(()=>setFsSupplyLoad(false))
  },[fsShowSupply, stock?.code])

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
        <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
          {drawState&&<div className="cap-fs-hint">{drawTool==='trend'?'2번째 점 클릭':'끝점 클릭'}</div>}
          {fsSupplyLoad&&<span style={{fontSize:11,color:'var(--text-secondary)'}}>⟳</span>}
          <button className={`cap-fs-btn ${fsShowSupply?'active':''}`}
            onClick={()=>setFsShowSupply(v=>!v)}>📊 수급</button>
          <button className="cap-fs-close" onClick={onClose}>✕ 닫기</button>
        </div>
      </div>

      {/* 전체화면 정보 바 */}
      {fsBasicInfo&&Object.keys(fsBasicInfo).length>0&&(
        <div className="cap-fs-info-bar">
          {[
            fsBasicInfo.mac?['시가총액',(Number(String(fsBasicInfo.mac).replace(/,/g,''))/100000000).toFixed(0)+'억']:null,
            fsBasicInfo.per&&fsBasicInfo.per!=='0'?['PER',Number(fsBasicInfo.per).toFixed(1)+'배']:null,
            fsBasicInfo.pbr&&fsBasicInfo.pbr!=='0'?['PBR',Number(fsBasicInfo.pbr).toFixed(2)+'배']:null,
            fsBasicInfo.eps&&fsBasicInfo.eps!=='0'?['EPS',Number(fsBasicInfo.eps).toLocaleString('ko-KR')+'원']:null,
            fsBasicInfo.roe&&fsBasicInfo.roe!=='0'?['ROE',Number(fsBasicInfo.roe).toFixed(1)+'%']:null,
            fsBasicInfo.for_exh_rt?['외국인',fsBasicInfo.for_exh_rt+'%']:null,
            fsBasicInfo.dstr_rt?['유통비율',fsBasicInfo.dstr_rt+'%']:null,
            fsBasicInfo.upName?['업종',fsBasicInfo.upName]:null,
          ].filter(Boolean).map(([lbl,val])=>(
            <div key={lbl} className="cap-fs-info-item">
              <span className="cap-fs-info-label">{lbl}</span>
              <span className="cap-fs-info-val">{val}</span>
            </div>
          ))}
        </div>
      )}

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
        {!loading&&!candles.length&&<div style={{padding:80,textAlign:'center',color:'var(--text-secondary)'}}>데이터가 없습니다</div>}
        {/* 수급 서브차트 */}
        {fsShowSupply&&fsSupplyData&&(
          <SupplySubChart supplyData={fsSupplyData} candles={candles}/>
        )}
        {fsShowSupply&&fsSupplyLoad&&(
          <div style={{padding:12,textAlign:'center',background:'var(--bg-base)',color:'var(--text-secondary)',fontSize:12}}>
            <div className="cap-spinner" style={{display:'inline-block',marginRight:6}}/>수급 로딩 중...
          </div>
        )}
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
  const [dropIdx,   setDropIdx]   = useState(-1)   // 키보드 탐색 인덱스
  const [selected,  setSelected]  = useState(null)
  const [recent,    setRecent]    = useState(()=>lsGet(LS_RECENT,[]))
  const [watchlist, setWatchlist] = useState(()=>lsGet(LS_WATCHLIST,[]))
  const searchInputRef = useRef(null)

  // 전체 종목 리스트 (useStockList 훅)
  const { stockList, loading: stockListLoading } = useStockList()

  // 차트 컨트롤
  const [period,    setPeriod]    = useState('day')
  const [scope,     setScope]     = useState('5')
  const [range,     setRange]     = useState(3)
  const [showMA,    setShowMA]    = useState(true)
  const [enabledMA, setEnabledMA] = useState(new Set([5,10,20,60,120]))
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
  const [showSupply,    setShowSupply]    = useState(false)  // 기본 OFF
  const [foreignData,   setForeignData]   = useState(null)
  const [shortData,     setShortData]     = useState(null)
  const [strData,       setStrData]       = useState(null)
  const [supplyLoading, setSupplyLoading] = useState(false)

  // ETF
  const [showEtf, setShowEtf] = useState(false)
  const [showFinancial, setShowFinancial] = useState(false)
  const etfMode = isEtf(selected?.code)

  // 종목 기본 정보 (시가총액, EPS, 유통비율 등)
  const [basicInfo, setBasicInfo] = useState(null)

  // AI
  const [aiResult, setAiResult] = useState('')
  const [aiLoading,setAiLoading]= useState(false)
  const [aiError,  setAiError]  = useState('')

  // 관심종목 카테고리
  const [wlPanelTab, setWlPanelTab] = useState('watch') // 'watch'|'hold'
  const [wlCats,     setWlCats]     = useState(()=>{ try{return JSON.parse(localStorage.getItem('wl_v3'))||[]}catch{return []} })
  const [selCatId,   setSelCatId]   = useState('') // '' = 없음
  const [showWlPanel,setShowWlPanel]= useState(false)

  // 수급 팝업 (기본 OFF)
  const [supplyPopup, setSupplyPopup] = useState(false)

  // 공시/뉴스/종목정보 팝업
  const [infoPopup,  setInfoPopup]  = useState(null) // 'disclosure'|'news'|'stockinfo'
  const [newsData,   setNewsData]   = useState([])   // 종목 뉴스
  const [newsLoading,setNewsLoading]= useState(false)
  const infoPopupRef = useRef(null)

  // 보유 종목
  const [holdings,   setHoldings]   = useState({})

  const { allData, loading: chartLoading } = useStockChart({
    code: selected?.code, period, scope, enabled: !!selected
  })
  const candles = useMemo(()=>period==='min'?allData:filterByRange(allData,range),[allData,range,period])

  // 선택 종목 + 관심종목 패널 종목 가격 조회
  const selCatStocksForPrice = wlCats.find(cat=>cat.id===selCatId)?.stocks||[]
  const priceCodesArr = [...new Set([
    ...(selected?[selected.code]:[]),
    ...selCatStocksForPrice.map(s=>s.code)
  ])]
  const codes = priceCodesArr
  const { prices }=useStockPrices(codes, getKstStatus()==='open'?30000:300000)
  const price=selected?prices[selected.code]:null

  useEffect(()=>{
    if (!chartWrap) return
    const ro=new ResizeObserver(([e])=>setChartWidth(e.contentRect.width))
    ro.observe(chartWrap); setChartWidth(chartWrap.clientWidth); return ()=>ro.disconnect()
  },[chartWrap])

  const search = q => {
    setQuery(q)
    setDropIdx(-1)
    if (!q.trim()) { setResults([]); setShowDrop(false); return }
    const kw = q.toLowerCase().replace(/\s/g,'')

    const matched = stockList.filter(s =>
      s.name.toLowerCase().replace(/\s/g,'').includes(kw) ||
      s.code.includes(kw)
    )

    // 우선순위 정렬: 코드 정확일치 > 이름 시작 > 테마종목 > 나머지
    const scored = matched.map(s => {
      let score = 0
      if (s.code === kw)                                          score = 100
      else if (s.code.startsWith(kw))                            score = 80
      else if (s.name.toLowerCase().startsWith(kw))              score = 60
      else if (THEME_LABEL_MAP[s.code])                          score = 40
      return { ...s, _score: score }
    }).sort((a,b) => b._score - a._score).slice(0, 12)

    setResults(scored)
    setShowDrop(true)
  }

  // 키보드 탐색 핸들러
  const handleSearchKeyDown = e => {
    if (!showDrop || !results.length) {
      if (e.key === 'Escape') { setShowDrop(false); setDropIdx(-1) }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setDropIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setDropIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (dropIdx >= 0 && results[dropIdx]) select(results[dropIdx])
      else if (results.length > 0) select(results[0])
    } else if (e.key === 'Escape') {
      setShowDrop(false); setDropIdx(-1)
    }
  }

  const select = stock => {
    setSelected(stock); setQuery(stock.name)
    setShowDrop(false); setDropIdx(-1)
    setAiResult(''); setAiError(''); setForeignData(null); setBasicInfo(null); setNewsData([])
    const d=lsGet(`${LS_DRAWINGS}_${stock.code}`,[])
    setDrawings(d); setDrawTool('none'); setDrawState(null)
    const next=[stock,...recent.filter(r=>r.code!==stock.code)].slice(0,8)
    setRecent(next); lsSet(LS_RECENT,next)
    // 수급은 버튼 클릭 시만 로드 (기본 OFF)
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

  // 종목 뉴스 로드 (Claude web_search)
  const loadNews = useCallback(async(stock)=>{
    if(!stock?.code||!CLAUDE_KEY) return
    setNewsLoading(true); setNewsData([])
    try {
      const today=new Date().toLocaleDateString('ko-KR')
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1500,
          tools:[{type:'web_search_20250305',name:'web_search'}],
          messages:[{role:'user',content:`웹 검색으로 오늘(${today}) ${stock.name}(${stock.code}) 관련 최신 뉴스를 7개 찾아줘. 반드시 아래 JSON 형식으로만 응답:
[{"title":"제목","summary":"한줄요약","url":"https://...","source":"언론사","date":"날짜"}]`}]
        })
      })
      const data=await res.json()
      const text=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||''
      const match=text.match(/\[[\s\S]*\]/)
      if(match) setNewsData(JSON.parse(match[0]))
    } catch(e){console.error(e)} finally{setNewsLoading(false)}
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

  // 선택된 카테고리 종목 목록
  const selCatStocks = wlCats.find(c=>c.id===selCatId)?.stocks||[]

  return (
    <div className="cap-wrap">
      <div className="cap-layout">
      {/* ── 왼쪽 사이드: 관심종목 패널 ── */}
      <div className={`cap-wl-side ${showWlPanel?'open':''}`}>
        <div className="cap-wl-side-header">
          <div className="cap-wl-side-tabs">
            <button className={`cap-wl-side-tab ${wlPanelTab==='watch'?'active':''}`} onClick={()=>setWlPanelTab('watch')}>⭐ 관심</button>
            <button className={`cap-wl-side-tab ${wlPanelTab==='hold'?'active':''}`} onClick={()=>setWlPanelTab('hold')}>💼 보유</button>
          </div>
          <button className="cap-wl-side-close" onClick={()=>setShowWlPanel(false)}>✕</button>
        </div>
        {/* 카테고리 드롭다운 (관심종목 탭만) */}
        {wlPanelTab==='watch'&&<select className="cap-wl-cat-select" value={selCatId} onChange={e=>setSelCatId(e.target.value)}>
          <option value="">— 카테고리 선택 —</option>
          {wlCats.map(cat=><option key={cat.id} value={cat.id}>{cat.name} ({cat.stocks.length})</option>)}
        </select>}
        {/* 종목 목록 */}
        <div className="cap-wl-stock-list">
          {/* 보유종목 탭 */}
          {wlPanelTab==='hold'&&(
            Object.keys(holdings).length===0
            ? <div className="cap-wl-empty">보유종목 없음</div>
            : Object.entries(holdings).map(([code,h])=>{
                const p=prices[code]
                const pc2=p?rateColor(p.changeRate):'#64748b'
                const sign2=(p?.changeRate??0)>0?'+':''
                const isSelected=selected?.code===code
                // 종목명 찾기
                const stockName = stockList.find(s=>s.code===code)?.name||code
                return (
                  <button key={code} className={`cap-wl-stock-item ${isSelected?'active':''}`}
                    onClick={()=>select({code,name:stockName,theme:'보유종목'})}>
                    <div className="cap-wl-item-left">
                      <span className="cap-wl-item-name">{stockName}</span>
                      <span className="cap-wl-item-code" style={{color:'#4ade80'}}>{h.qty}주 {h.rate>=0?'+':''}{h.rate?.toFixed(1)}%</span>
                    </div>
                    <div className="cap-wl-item-right" style={{color:pc2}}>
                      {p?.price>0?<><span>{fmtN(p.price)}</span><span className="cap-wl-item-rate">{sign2}{p.changeRate?.toFixed(1)}%</span></>:<span>—</span>}
                    </div>
                  </button>
                )
              })
          )}
          {/* 관심종목 탭 */}
          {wlPanelTab==='watch'&&selCatStocks.length===0 && (
            <div className="cap-wl-empty">{selCatId?'종목이 없습니다':'카테고리를 선택하세요'}</div>
          )}
          {selCatStocks.map(s=>{
            const p=prices[s.code]
            const isSelected=selected?.code===s.code
            const pc2=p?rateColor(p.changeRate):'#64748b'
            const sign2=(p?.changeRate??0)>0?'+':''
            return (
              <button key={s.code} className={`cap-wl-stock-item ${isSelected?'active':''}`}
                onClick={()=>select(s)}>
                <div className="cap-wl-item-left">
                  <span className="cap-wl-item-name">{s.name}</span>
                  <span className="cap-wl-item-code">{s.code}</span>
                </div>
                <div className="cap-wl-item-right" style={{color:pc2}}>
                  {p?.price>0?<><span>{fmtN(p.price)}</span><span className="cap-wl-item-rate">{sign2}{p.changeRate?.toFixed(2)}%</span></>:<span>—</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 오른쪽 메인 ── */}
      <div className="cap-main-area">
      <div className="page-header" style={{marginBottom:8}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <button className="cap-wl-toggle-btn" onClick={()=>setShowWlPanel(v=>!v)} title="관심종목 패널">⭐ 관심종목</button>
          <h1 className="page-title" style={{fontSize:18}}>종목 분석</h1>
        </div>
      </div>

      {/* 검색 */}
      <div className="cap-search-section">
        <div className="cap-search-box">
          <span className="cap-search-icon">🔍</span>
          <input
            ref={searchInputRef}
            className="cap-search-input"
            placeholder={stockListLoading ? '종목 목록 로딩 중...' : '종목명 또는 코드 검색 (예: 삼성전자, 005930)'}
            value={query}
            onChange={e => search(e.target.value)}
            onFocus={() => query && setShowDrop(true)}
            onKeyDown={handleSearchKeyDown}
            onBlur={() => setTimeout(()=>setShowDrop(false), 150)}
          />
          {query && <button className="cap-clear" onClick={()=>{setQuery('');setResults([]);setShowDrop(false);setDropIdx(-1);searchInputRef.current?.focus()}}>✕</button>}

          {showDrop && results.length > 0 && (
            <div className="cap-dropdown">
              {/* 테마종목 그룹 */}
              {results.filter(s => THEME_LABEL_MAP[s.code]).length > 0 && (
                <>
                  <div style={{padding:'4px 12px',fontSize:10,fontWeight:700,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'.06em',background:'var(--bg-base)',borderBottom:'1px solid var(--border-dim)'}}>
                    ⭐ 테마 종목
                  </div>
                  {results.filter(s => THEME_LABEL_MAP[s.code]).map((s,i) => {
                    const idx = results.indexOf(s)
                    const info = THEME_LABEL_MAP[s.code]
                    return (
                      <button key={s.code} className={`cap-dd-item ${dropIdx===idx?'hovered':''}`}
                        style={dropIdx===idx?{background:'var(--bg-hover)'}:{}}
                        onMouseEnter={()=>setDropIdx(idx)}
                        onClick={()=>select(s)}>
                        <span className="cap-dd-name">{s.name}</span>
                        <span className="cap-dd-code">{s.code}</span>
                        <span className="cap-dd-theme">{info.theme}</span>
                        <span style={{fontSize:10,padding:'1px 6px',borderRadius:6,fontWeight:700,
                          background: info.market==='ETF'?'rgba(124,58,237,.1)':'rgba(37,99,235,.1)',
                          color: info.market==='ETF'?'#7c3aed':'var(--accent-mid)',
                          border: `1px solid ${info.market==='ETF'?'rgba(124,58,237,.3)':'rgba(37,99,235,.2)'}`,
                          marginLeft:'auto', flexShrink:0
                        }}>{info.market}</span>
                      </button>
                    )
                  })}
                </>
              )}
              {/* 전체 종목 그룹 */}
              {results.filter(s => !THEME_LABEL_MAP[s.code]).length > 0 && (
                <>
                  <div style={{padding:'4px 12px',fontSize:10,fontWeight:700,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'.06em',background:'var(--bg-base)',borderBottom:'1px solid var(--border-dim)',borderTop:'1px solid var(--border-dim)'}}>
                    📋 전체 종목
                  </div>
                  {results.filter(s => !THEME_LABEL_MAP[s.code]).map((s,i) => {
                    const idx = results.indexOf(s)
                    return (
                      <button key={s.code} className="cap-dd-item"
                        style={dropIdx===idx?{background:'var(--bg-hover)'}:{}}
                        onMouseEnter={()=>setDropIdx(idx)}
                        onClick={()=>select(s)}>
                        <span className="cap-dd-name">{s.name}</span>
                        <span className="cap-dd-code">{s.code}</span>
                        <span style={{fontSize:10,padding:'1px 6px',borderRadius:6,fontWeight:700,
                          background:'var(--bg-base)', color:'var(--text-dim)',
                          border:'1px solid var(--border)', marginLeft:'auto', flexShrink:0
                        }}>{s.market||'KRX'}</span>
                      </button>
                    )
                  })}
                </>
              )}
              {/* 키보드 안내 */}
              <div style={{padding:'5px 12px',fontSize:10,color:'var(--text-dim)',borderTop:'1px solid var(--border-dim)',background:'var(--bg-base)',display:'flex',gap:12}}>
                <span>↑↓ 탐색</span><span>Enter 선택</span><span>Esc 닫기</span>
                <span style={{marginLeft:'auto'}}>{stockList.length.toLocaleString()}개 종목</span>
              </div>
            </div>
          )}

          {/* 검색결과 없을 때 */}
          {showDrop && query && results.length === 0 && (
            <div className="cap-dropdown">
              <div style={{padding:'20px',textAlign:'center',color:'var(--text-dim)',fontSize:13}}>
                <div style={{fontSize:20,marginBottom:8}}>🔍</div>
                <div>'{query}' 검색 결과 없음</div>
                <div style={{fontSize:11,marginTop:4,color:'var(--text-dim)'}}>종목명 또는 6자리 코드로 검색해보세요</div>
              </div>
            </div>
          )}
        </div>

        {/* 최근/즐겨찾기 칩 */}
        {!selected && recent.length > 0 && (
          <div className="cap-chips-row">
            <span className="cap-chip-label">최근</span>
            {recent.map(r => <button key={r.code} className="cap-chip" onClick={()=>select(r)}>{r.name}</button>)}
          </div>
        )}
        {!selected && watchlist.length > 0 && (
          <div className="cap-chips-row">
            <span className="cap-chip-label">⭐ 즐겨찾기</span>
            {watchlist.map(w => <button key={w.code} className="cap-chip cap-chip-star" onClick={()=>select(w)}>{w.name}</button>)}
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
                <div style={{marginLeft:'auto',display:'flex',gap:4,alignItems:'center'}}>
                  {/* 수급 */}
                  <button className={`cap-period-btn ${showSupply?'active':''}`}
                    onClick={()=>{ const n=!showSupply; setShowSupply(n); if(n) { setSupplyPopup(true); if(!foreignData) loadSupply() } else { setSupplyPopup(false) } }}>
                    수급
                  </button>
                  {/* ETF 구성종목 */}
                  {etfMode&&(
                    <button className="cap-period-btn" style={{color:'#60a5fa',borderColor:'rgba(37,99,235,0.4)'}}
                      onClick={()=>setShowEtf(true)}>🧩 구성종목</button>
                  )}
                  {/* 우측 버튼 그룹 */}
                  <div style={{position:'relative',display:'flex',gap:3,alignItems:'center'}} ref={infoPopupRef}>
                    <button className="cap-icon-btn" onClick={()=>setShowFinancial(true)}>재무</button>
                    <button className={`cap-icon-btn ${infoPopup==='disclosure'?'active':''}`}
                      onClick={()=>setInfoPopup(p=>p==='disclosure'?null:'disclosure')}>공시</button>
                    <button className={`cap-icon-btn ${infoPopup==='news'?'active':''}`}
                      onClick={()=>{
                        const next=infoPopup==='news'?null:'news'
                        setInfoPopup(next)
                        if(next==='news'&&newsData.length===0&&!newsLoading) loadNews(selected)
                      }}>뉴스{newsLoading&&'⟳'}</button>
                    <button className={`cap-icon-btn ${infoPopup==='stockinfo'?'active':''}`}
                      onClick={()=>setInfoPopup(p=>p==='stockinfo'?null:'stockinfo')}>종목정보</button>
                    <a href={`https://finance.naver.com/item/main.naver?code=${selected?.code}`}
                      target="_blank" rel="noreferrer" className="cap-icon-btn" style={{textDecoration:'none',color:'#94a3b8'}}>N증권</a>
                    {/* 공시 팝업 */}
                    {infoPopup==='disclosure'&&(
                      <div className="cap-info-popup">
                        <div className="cap-info-popup-title">📋 공시 바로가기</div>
                        <a href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(selected?.name||'')}`}
                          target="_blank" rel="noreferrer" className="cap-info-popup-item" onClick={()=>setInfoPopup(null)}>DART 전자공시 →</a>
                        <a href={`https://kind.krx.co.kr/disclosuresearch/disclosuresearch.do?searchmode=searchCorp&searchText=${selected?.code}`}
                          target="_blank" rel="noreferrer" className="cap-info-popup-item" onClick={()=>setInfoPopup(null)}>KRX KIND 공시 →</a>
                      </div>
                    )}
                    {/* 뉴스 팝업 - 직접 로드 */}
                    {infoPopup==='news'&&(
                      <div className="cap-info-popup cap-news-popup">
                        <div className="cap-info-popup-title">
                          📰 {selected?.name} 최신 뉴스
                          <button className="cap-news-refresh" onClick={()=>loadNews(selected)}>↺</button>
                        </div>
                        {newsLoading&&<div className="cap-news-loading">⟳ 뉴스 검색 중...</div>}
                        {!newsLoading&&newsData.length===0&&<div className="cap-news-empty">버튼을 눌러 뉴스 검색</div>}
                        {newsData.map((n,i)=>(
                          <a key={i} href={n.url} target="_blank" rel="noreferrer" className="cap-news-item" onClick={()=>setInfoPopup(null)}>
                            <div className="cap-news-item-title">{n.title}</div>
                            <div className="cap-news-item-meta">{n.source} · {n.date}</div>
                            <div className="cap-news-item-summary">{n.summary}</div>
                          </a>
                        ))}
                      </div>
                    )}
                    {/* 종목정보 팝업 */}
                    {infoPopup==='stockinfo'&&basicInfo&&(
                      <div className="cap-info-popup cap-stockinfo-popup">
                        <div className="cap-info-popup-title">ℹ️ {selected?.name} 종목정보</div>
                        {[
                          ['종목코드',  selected?.code],
                          ['업종',      basicInfo.upName],
                          ['시가총액',  basicInfo.mac?(Number(String(basicInfo.mac).replace(/,/g,''))/100000000).toFixed(0)+'억':'-'],
                          ['PER',       basicInfo.per&&basicInfo.per!=='0'?Number(basicInfo.per).toFixed(1)+'배':'-'],
                          ['PBR',       basicInfo.pbr&&basicInfo.pbr!=='0'?Number(basicInfo.pbr).toFixed(2)+'배':'-'],
                          ['EPS',       basicInfo.eps&&basicInfo.eps!=='0'?Number(basicInfo.eps).toLocaleString('ko-KR')+'원':'-'],
                          ['ROE',       basicInfo.roe&&basicInfo.roe!=='0'?Number(basicInfo.roe).toFixed(1)+'%':'-'],
                          ['외국인비중',basicInfo.for_exh_rt?basicInfo.for_exh_rt+'%':'-'],
                          ['유통비율',  basicInfo.dstr_rt?basicInfo.dstr_rt+'%':'-'],
                          ...(holdings[selected?.code]?[
                            ['보유수량', holdings[selected.code].qty+'주'],
                            ['평균단가', Number(holdings[selected.code].buy).toLocaleString('ko-KR')+'원'],
                            ['평가손익', (holdings[selected.code].pnl>=0?'+':'')+Number(holdings[selected.code].pnl).toLocaleString('ko-KR')+'원'],
                            ['수익률',   (holdings[selected.code].rate>=0?'+':'')+holdings[selected.code].rate?.toFixed(2)+'%'],
                          ]:[]),
                        ].map(([k,v])=>v&&(
                          <div key={k} className="cap-stockinfo-row">
                            <span className="cap-stockinfo-key">{k}</span>
                            <span className="cap-stockinfo-val">{v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="cap-fullscreen-btn" onClick={()=>setShowFull(true)}>전체화면</button>
                </div>
              </div>

              {/* 정보바 */}
              {(price?.price>0||basicInfo) && (
                <div className="cap-info-bar">
                  {[
                    price?.price>0 ? ['현재가', `${fmtN(price.price)}원`, pc] : null,
                    price?.changeRate!=null ? ['등락률', `${sign}${price.changeRate?.toFixed(2)}%`, pc] : null,
                    price?.volume  ? ['거래량', `${fmtShort(price.volume)}주`, null] : null,
                    basicInfo?.mac ? ['시가총액', `${(Number(String(basicInfo.mac).replace(/,/g,''))/100000000).toFixed(0)}억`, null] : null,
                    basicInfo?.per&&basicInfo.per!=='0' ? ['PER', `${Number(basicInfo.per).toFixed(1)}배`, null] : (price?.per?['PER',`${Number(price.per).toFixed(1)}배`,null]:null),
                    basicInfo?.pbr&&basicInfo.pbr!=='0' ? ['PBR', `${Number(basicInfo.pbr).toFixed(2)}배`, null] : (price?.pbr?['PBR',`${Number(price.pbr).toFixed(2)}배`,null]:null),
                    basicInfo?.eps&&basicInfo.eps!=='0' ? ['EPS', `${Number(basicInfo.eps).toLocaleString('ko-KR')}원`, null] : null,
                    basicInfo?.roe&&basicInfo.roe!=='0' ? ['ROE', `${Number(basicInfo.roe).toFixed(1)}%`, null] : null,
                    basicInfo?.for_exh_rt ? ['외국인', `${basicInfo.for_exh_rt}%`, null] : (price?.forExhRt?['외국인',`${price.forExhRt}%`,null]:null),
                    basicInfo?.dstr_rt ? ['유통비율', `${basicInfo.dstr_rt}%`, null] : null,
                    basicInfo?.upName  ? ['업종', basicInfo.upName, null] : null,
                  ].filter(Boolean).map(([label,val,color])=>(
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
                      data={candles} width={chartWidth} height={500}
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

              {/* 수급 팝업 */}
              {supplyPopup&&(
                <div className="cap-supply-popup-overlay" onClick={e=>e.target===e.currentTarget&&setSupplyPopup(false)}>
                  <div className="cap-supply-popup">
                    <div className="cap-supply-popup-header">
                      <span>📊 {selected.name} — 수급 현황</span>
                      <button className="cap-supply-popup-close" onClick={()=>setSupplyPopup(false)}>✕</button>
                    </div>
                    {supplyLoading&&<div style={{padding:24,textAlign:'center',color:'#64748b'}}>⟳ 로딩 중...</div>}
                    {!supplyLoading&&supplyDataObj&&<SupplySubChart supplyData={supplyDataObj}/>}
                    {!supplyLoading&&!supplyDataObj&&(
                      <div style={{padding:24,textAlign:'center'}}>
                        <button className="cap-btn-primary" onClick={()=>loadSupply()}>📡 수급 데이터 불러오기</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
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
        <div className="cap-empty">
          <div className="cap-empty-icon">📈</div>
          <p style={{fontSize:15,fontWeight:700,color:'var(--text-primary)',marginBottom:6}}>종목 차트 분석</p>
          <p>종목명 또는 코드를 검색해 차트 분석을 시작하세요</p>
          <p className="cap-empty-sub">예: 삼성전자, SK하이닉스, 005930</p>
          <div style={{display:'flex',gap:8,justifyContent:'center',marginTop:16,flexWrap:'wrap'}}>
            {['삼성전자','SK하이닉스','POSCO홀딩스','현대차','LG에너지솔루션'].map(name => {
              const s = stockList.find(x => x.name === name)
              if (!s) return null
              return (
                <button key={name} className="cap-chip"
                  style={{fontSize:12,padding:'5px 14px'}}
                  onClick={()=>select(s)}>
                  {name}
                </button>
              )
            })}
          </div>
          {stockListLoading && (
            <p style={{fontSize:11,color:'var(--text-dim)',marginTop:12}}>⟳ 전체 종목 목록 로딩 중...</p>
          )}
        </div>
      )}
      {/* ETF 구성종목 팝업 */}
      {showEtf&&selected&&(
        <EtfHoldingsPopup code={selected.code} name={selected.name} onClose={()=>setShowEtf(false)}/>
      )}

      {/* 재무제표 차트 팝업 */}
      {showFinancial&&selected&&(
        <FinancialChart stock={selected} onClose={()=>setShowFinancial(false)}/>
      )}

      {/* 전체화면 */}
      {showFull&&selected&&(
        <FullscreenChart
          stock={selected} initPeriod={period} initRange={range}
          initMA={showMA} initEMA={enabledMA}
          onClose={()=>setShowFull(false)}
        />
      )}
      </div>{/* cap-main-area */}
      </div>{/* cap-layout */}
    </div>
  )
}
