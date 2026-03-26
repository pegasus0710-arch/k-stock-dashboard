import { useState, useEffect, useCallback, useRef } from 'react'
import {
  CandleSvg, DrawingToolbar, SupplySubChart, EtfHoldingsPopup, MarkdownView,
  useStockChart, handleDrawClick, filterByRange, parseN, fmtN, fmtShort, rateColor, lsSet,
  PERIODS, RANGES, MIN_SCOPES, MA_SETTINGS, DRAW_TOOLS, isEtf,
} from './StockChart'
import './StockChart.css'
import './StockChartModal.css'

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY
const DART_KEY   = import.meta.env.VITE_DART_API_KEY

// DART 종목 코드 매핑 (주요 종목)
const DART_CORP_MAP = {
  '005930':'00126380','000660':'00164779','005380':'00164742',
  '035420':'00266961','035720':'00259901','207940':'01246564',
  '000270':'00123844','068270':'00554024','051910':'00356361',
}

function lsGet(k,d){ try{return JSON.parse(localStorage.getItem(k))??d}catch{return d} }

// ── DART 공시 패널 ────────────────────────────────────
function DartPanel({ stock }) {
  const [list,setList]=useState([])
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [popup,setPopup]=useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const corpCode=DART_CORP_MAP[stock.code]
      let url
      if (corpCode) {
        const today=new Date().toISOString().slice(0,10).replace(/-/g,'')
        const from=new Date(Date.now()-180*86400000).toISOString().slice(0,10).replace(/-/g,'')
        url=`/api/dart?type=list&corp_code=${corpCode}&bgn_de=${from}&end_de=${today}`
      } else {
        url=`/api/dart?type=corp_list&corp_name=${encodeURIComponent(stock.name)}`
      }
      const data=await fetch(url).then(r=>r.json())
      const items=data.list||data.items||data.disclosures||[]
      setList(items)
      if (!items.length) setError('최근 6개월 내 공시가 없습니다')
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [stock.code, stock.name])

  useEffect(()=>{ load() },[load])

  return (
    <div className="smc-dart-panel">
      <div className="smc-news-header">
        <span className="smc-news-title">📋 {stock.name} 공시</span>
        <button className="smc-news-fetch-btn" onClick={load} disabled={loading}>{loading?'⟳ 로딩...':'↺ 새로고침'}</button>
      </div>
      {error&&<div className="smc-news-error">⚠️ {error}</div>}
      {loading&&<div className="smc-news-loading"><div className="smc-news-spinner"/>공시 조회 중...</div>}
      {!loading&&list.length>0&&(
        <div className="smc-news-list">
          {list.map((d,i)=>(
            <div key={i} className="smc-news-item">
              <div className="smc-news-item-body" onClick={()=>setPopup(d)}>
                <div className="smc-news-item-title">{d.report_nm||d.title||'공시'}</div>
                <div className="smc-news-item-meta">
                  <span className="smc-news-source">{d.corp_name||stock.name}</span>
                  <span className="smc-news-date">{d.rcept_dt||d.date||''}</span>
                </div>
              </div>
              <a href={d.rcept_no?`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d.rcept_no}`:(d.url||'#')}
                target="_blank" rel="noreferrer" className="smc-news-link-btn"
                onClick={e=>e.stopPropagation()}>원문 →</a>
            </div>
          ))}
        </div>
      )}
      {popup&&(
        <div className="smc-news-popup-overlay" onClick={()=>setPopup(null)}>
          <div className="smc-news-popup" onClick={e=>e.stopPropagation()}>
            <div className="smc-news-popup-header">
              <div><span className="smc-news-source">{popup.corp_name}</span> <span className="smc-news-date">{popup.rcept_dt}</span></div>
              <button className="smc-news-popup-close" onClick={()=>setPopup(null)}>✕</button>
            </div>
            <div className="smc-news-popup-title">{popup.report_nm}</div>
            <div className="smc-news-popup-summary">접수번호: {popup.rcept_no}</div>
            {popup.rcept_no&&(
              <a href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${popup.rcept_no}`}
                target="_blank" rel="noreferrer" className="smc-news-popup-link">📋 DART 원문 보기 →</a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 뉴스 패널 ─────────────────────────────────────────
function NewsPanel({ stock }) {
  const [news,setNews]=useState([])
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [sel,setSel]=useState(null)

  const loadNews = useCallback(async () => {
    if (!CLAUDE_KEY) { setError('Claude API 키 미설정'); return }
    setLoading(true); setError('')
    try {
      const today=new Date().toLocaleDateString('ko-KR')
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1200,
          tools:[{type:'web_search_20250305',name:'web_search'}],
          messages:[{role:'user',content:`웹 검색으로 오늘(${today}) ${stock.name}(${stock.code}) 관련 최신 뉴스 5개 JSON만:
[{"title":"제목","summary":"한줄요약","url":"https://...","source":"언론사","date":"날짜"}]`}]}),
      })
      const data=await res.json()
      const text=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||''
      const match=text.match(/\[[\s\S]*\]/)
      if (match) setNews(JSON.parse(match[0]))
      else setError('뉴스 파싱 실패')
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  },[stock.code,stock.name])

  return (
    <div className="smc-news-panel">
      <div className="smc-news-header">
        <span className="smc-news-title">📰 {stock.name} 최신 뉴스</span>
        <button className="smc-news-fetch-btn" onClick={loadNews} disabled={loading}>{loading?'⟳ 검색 중...':news.length?'↺ 갱신':'🔍 뉴스 검색'}</button>
      </div>
      {error&&<div className="smc-news-error">⚠️ {error}</div>}
      {loading&&<div className="smc-news-loading"><div className="smc-news-spinner"/>뉴스 검색 중...</div>}
      {!loading&&!news.length&&!error&&<div className="smc-news-empty">버튼을 눌러 최신 뉴스를 검색하세요</div>}
      {!loading&&news.length>0&&(
        <div className="smc-news-list">
          {news.map((n,i)=>(
            <div key={i} className="smc-news-item">
              <div className="smc-news-item-body" onClick={()=>setSel(n)}>
                <div className="smc-news-item-title">{n.title}</div>
                <div className="smc-news-item-meta"><span className="smc-news-source">{n.source}</span>{n.date&&<span className="smc-news-date">{n.date}</span>}</div>
                <div className="smc-news-item-summary">{n.summary}</div>
              </div>
              <a href={n.url} target="_blank" rel="noreferrer" className="smc-news-link-btn" onClick={e=>e.stopPropagation()}>원문 →</a>
            </div>
          ))}
        </div>
      )}
      {sel&&(
        <div className="smc-news-popup-overlay" onClick={()=>setSel(null)}>
          <div className="smc-news-popup" onClick={e=>e.stopPropagation()}>
            <div className="smc-news-popup-header">
              <div><span className="smc-news-source">{sel.source}</span>{sel.date&&<span className="smc-news-date">{sel.date}</span>}</div>
              <button className="smc-news-popup-close" onClick={()=>setSel(null)}>✕</button>
            </div>
            <div className="smc-news-popup-title">{sel.title}</div>
            <div className="smc-news-popup-summary">{sel.summary}</div>
            <a href={sel.url} target="_blank" rel="noreferrer" className="smc-news-popup-link">📰 원문 기사 보기 →</a>
          </div>
        </div>
      )}
    </div>
  )
}

// ── AI 분석 팝업 ──────────────────────────────────────
function AiPopup({ stock, onClose }) {
  const key=`smc_ai_${stock.code}`
  const [result,setResult]=useState(()=>lsGet(key,null))
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')

  const runAI=async()=>{
    if (!CLAUDE_KEY) { setError('Claude API 키 미설정'); return }
    setLoading(true); setError('')
    try {
      const today=new Date().toLocaleDateString('ko-KR')
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1200,
          tools:[{type:'web_search_20250305',name:'web_search'}],
          messages:[{role:'user',content:`오늘(${today}) ${stock.name}(${stock.code}) 주식 분석:

## 📌 현재 주가 상황
## 🔑 핵심 모멘텀 (3가지)
## 📊 기술적 분석
## 🏢 펀더멘털
## ⚠️ 주요 리스크
## 💡 단기 투자 전략`}]}),
      })
      const data=await res.json()
      const text=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||''
      if (!text.trim()) throw new Error('분석 결과 없음')
      const saved={text,date:today,code:stock.code,name:stock.name}
      setResult(saved); lsSet(key,saved)
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="smc-overlay" onClick={e=>{ if(e.target===e.currentTarget)onClose() }}>
      <div className="smc-ai-popup">
        <div className="smc-ai-popup-header">
          <div>
            <span className="smc-ai-popup-title">🤖 AI 종목 분석</span>
            <span className="smc-ai-popup-sub">{stock.name} ({stock.code})</span>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button className="smc-news-fetch-btn" onClick={runAI} disabled={loading}>{loading?'⟳ 분석 중...':result?'↺ 새로 분석':'🔍 AI 분석 시작'}</button>
            <button className="smc-close" onClick={onClose}>✕</button>
          </div>
        </div>
        {error&&<div className="smc-news-error">⚠️ {error}</div>}
        {loading&&<div className="smc-news-loading" style={{padding:'40px 20px'}}><div className="smc-news-spinner"/>AI가 웹 검색으로 분석 중...</div>}
        {!loading&&result&&(
          <div className="smc-ai-result">
            <div className="smc-ai-result-meta">📅 {result.date} 저장 · 다음 분석 시 자동 업데이트</div>
            <MarkdownView text={result.text} className="smc-ai-result-text"/>
          </div>
        )}
        {!loading&&!result&&!error&&(
          <div className="smc-news-empty" style={{padding:'60px 20px'}}>
            버튼을 눌러 AI 분석을 시작하세요<br/>
            <span style={{fontSize:'12px',color:'#94a3b8'}}>웹 검색 기반 · 결과가 자동 저장됩니다</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// 메인 컴포넌트
// ══════════════════════════════════════════════════════
export default function StockChartModal({ stock, onClose }) {
  const [period,    setPeriod]    = useState('day')
  const [scope,     setScope]     = useState('5')
  const [range,     setRange]     = useState(3)
  const [showMA,    setShowMA]    = useState(true)
  const [enabledMA, setEnabledMA] = useState(new Set([5,10,20,60,120]))
  const [activeTab, setActiveTab] = useState('chart')
  const [priceInfo, setPriceInfo] = useState(null)

  // 드로잉
  const [drawings,    setDrawings]    = useState(()=>stock?.code?lsGet(`smc_draw_${stock.code}`,[]):[])
  const [drawTool,    setDrawTool]    = useState('none')
  const [drawState,   setDrawState]   = useState(null)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [textOverlay, setTextOverlay] = useState(null)

  // 수급
  const [showSupply,    setShowSupply]    = useState(true)
  const [supplyData,    setSupplyData]    = useState(null)
  const [supplyLoading, setSupplyLoading] = useState(false)

  // ETF 구성종목
  const [showEtf, setShowEtf] = useState(false)
  const etfMode = isEtf(stock?.code)

  // 팝업
  const [showAI,   setShowAI]   = useState(false)
  const [showFull, setShowFull] = useState(false)

  const wrapRef = useRef(null)
  const [chartWidth, setChartWidth] = useState(800)

  // 차트 데이터
  const { allData, loading, error } = useStockChart({ code:stock?.code, period, scope })
  const chartData = period==='min' ? allData : filterByRange(allData, range)

  useEffect(()=>{
    const upd=()=>{ if(wrapRef.current) setChartWidth(wrapRef.current.clientWidth) }
    upd(); window.addEventListener('resize',upd)
    return ()=>window.removeEventListener('resize',upd)
  },[])

  useEffect(()=>{
    const fn=e=>{ if(e.key==='Escape'){ if(textOverlay)setTextOverlay(null); else if(showFull)setShowFull(false); else if(showAI)setShowAI(false); else if(showEtf)setShowEtf(false); else onClose() } }
    window.addEventListener('keydown',fn)
    return ()=>window.removeEventListener('keydown',fn)
  },[onClose,textOverlay,showAI,showFull,showEtf])

  // 현재가 조회
  const fetchPrice = useCallback(async()=>{
    if (!stock?.code) return
    try {
      const p=await fetch(`/api/kiwoom?type=price&code=${stock.code}`).then(r=>r.json())
      if (!p?.error) setPriceInfo({
        current:    Math.abs(parseN(p.current    ?? p.cur_prc)),
        change:     parseN(p.change     ?? p.pred_pre),
        changeRate: parseFloat(p.changeRate ?? p.flu_rt ?? 0),
        open:       Math.abs(parseN(p.open       ?? p.open_pric)),
        high:       Math.abs(parseN(p.high       ?? p.high_pric)),
        low:        Math.abs(parseN(p.low        ?? p.low_pric)),
        volume:     parseN(p.volume     ?? p.trde_qty),
      })
    } catch {}
  },[stock?.code])

  // 수급 조회
  const fetchSupply = useCallback(async()=>{
    if (!stock?.code) return
    setSupplyLoading(true)
    try {
      const [f,sh,st]=await Promise.allSettled([
        fetch(`/api/kiwoom?type=supply-foreign&code=${stock.code}`).then(r=>r.json()),
        fetch(`/api/kiwoom?type=supply-short&code=${stock.code}&days=90`).then(r=>r.json()),
        fetch(`/api/kiwoom?type=supply-strength&code=${stock.code}`).then(r=>r.json()),
      ])
      setSupplyData({
        foreign:  f.status==='fulfilled'&&!f.value?.error?f.value.data||[]:  [],
        short:    sh.status==='fulfilled'&&!sh.value?.error?sh.value.data||[]:[],
        strength: st.status==='fulfilled'&&!st.value?.error?st.value.data||[]:[],
      })
    } catch {} finally { setSupplyLoading(false) }
  },[stock?.code])

  useEffect(()=>{ fetchPrice() },[fetchPrice])
  useEffect(()=>{ if(showSupply&&!supplyData&&stock?.code) fetchSupply() },[showSupply,supplyData,stock?.code])

  const saveDrawings = next=>{ setDrawings(next); if(stock?.code) lsSet(`smc_draw_${stock.code}`,next) }
  const toggleMA = p=>setEnabledMA(prev=>{ const n=new Set(prev); n.has(p)?n.delete(p):n.add(p); return n })

  function handleSvgClick(args) {
    const result = handleDrawClick({ drawTool,setDrawTool,drawState,setDrawState,drawings,saveDrawings,...args })
    if (result?.textOverlay) setTextOverlay(result.textOverlay)
  }

  const isUp=priceInfo?.changeRate>0, isDown=priceInfo?.changeRate<0
  const pc=isUp?'#ef4444':isDown?'#3b82f6':'#94a3b8'
  const sign=priceInfo?.changeRate>0?'+':''

  const TABS = etfMode
    ? [{id:'chart',label:'📈 차트'},{id:'etf',label:'🧩 구성종목'},{id:'news',label:'📰 뉴스'},{id:'dart',label:'📋 공시'}]
    : [{id:'chart',label:'📈 차트'},{id:'news',label:'📰 뉴스'},{id:'dart',label:'📋 공시'}]

  return (
    <div className="smc-overlay" onClick={e=>{ if(e.target===e.currentTarget)onClose() }}>
      <div className="smc-modal">

        {/* 헤더 */}
        <div className="smc-header">
          <div style={{display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap'}}>
            <span className="smc-name">{stock?.name}</span>
            <span className="smc-code">{stock?.code}</span>
            {etfMode&&<span style={{fontSize:'11px',padding:'2px 6px',background:'rgba(37,99,235,0.15)',color:'#60a5fa',borderRadius:5,border:'1px solid rgba(37,99,235,0.3)'}}>ETF</span>}
            {priceInfo?.current>0&&(
              <div style={{display:'flex',alignItems:'baseline',gap:6}}>
                <span className="smc-cur-price" style={{color:pc}}>{fmtN(priceInfo.current)}원</span>
                <span className="smc-change" style={{color:pc}}>{sign}{fmtN(priceInfo.change)}원 ({sign}{Number(priceInfo.changeRate).toFixed(2)}%)</span>
              </div>
            )}
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            {/* 탭 스위처 */}
            <div className="smc-tab-sw">
              {TABS.map(t=>(
                <button key={t.id} className={`smc-tab-sw-btn ${activeTab===t.id?'active':''}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>
              ))}
            </div>
            <button className="smc-ai-btn" onClick={()=>setShowAI(true)}>🤖 AI</button>
            <button className="smc-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── 차트 탭 ── */}
        {activeTab==='chart'&&(
          <>
            {/* 컨트롤 바 */}
            <div className="smc-ctrl-bar">
              {/* 봉 종류 */}
              <div style={{display:'flex',gap:2}}>
                {PERIODS.map(p=>(
                  <button key={p.key} className={`smc-tab ${period===p.key?'active':''}`} onClick={()=>setPeriod(p.key)}>{p.label}</button>
                ))}
              </div>
              {/* 분봉 scope */}
              {period==='min'&&(
                <div style={{display:'flex',gap:2,paddingLeft:6,borderLeft:'1px solid #334155'}}>
                  {MIN_SCOPES.map(s=>(
                    <button key={s} className={`smc-scope-btn ${scope===s?'active':''}`} onClick={()=>setScope(s)}>{s}분</button>
                  ))}
                </div>
              )}
              {/* 기간 범위 */}
              {period!=='min'&&(
                <div style={{display:'flex',gap:2,paddingLeft:6,borderLeft:'1px solid #334155'}}>
                  {RANGES.map(r=>(
                    <button key={r.label} className={`smc-scope-btn ${range===r.months?'active':''}`} onClick={()=>setRange(r.months)}>{r.label}</button>
                  ))}
                </div>
              )}
              {/* MA */}
              <button className={`smc-ma-btn ${showMA?'active':''}`} onClick={()=>setShowMA(v=>!v)}>MA</button>
              {showMA&&MA_SETTINGS.map(({p,color,label})=>(
                <button key={p} className={`smc-ma-chip ${enabledMA.has(p)?'active':''}`}
                  style={enabledMA.has(p)?{color,borderColor:color,background:color+'18'}:{}}
                  onClick={()=>toggleMA(p)}>{label}</button>
              ))}
              <div style={{marginLeft:'auto',display:'flex',gap:4}}>
                <button className={`smc-scope-btn ${showSupply?'active':''}`}
                  onClick={()=>{ const n=!showSupply; setShowSupply(n); if(n&&!supplyData) fetchSupply() }}>
                  📊 수급
                </button>
                {etfMode&&(
                  <button className="smc-scope-btn" style={{color:'#60a5fa',borderColor:'rgba(37,99,235,0.4)'}}
                    onClick={()=>setShowEtf(true)}>🧩 구성종목</button>
                )}
                <button className="smc-scope-btn" onClick={()=>setShowFull(true)}>⛶ 전체화면</button>
              </div>
            </div>

            {/* 드로잉 툴바 */}
            <DrawingToolbar
              drawTool={drawTool} setDrawTool={setDrawTool}
              drawings={drawings} saveDrawings={saveDrawings}
              drawState={drawState} setDrawState={setDrawState}
              onSave={()=>lsSet(`smc_draw_${stock?.code}`,drawings)}
            />

            {/* 차트 */}
            <div className="smc-chart-wrap" ref={wrapRef}>
              {loading&&<div className="smc-loading">⟳ 차트 불러오는 중...</div>}
              {error&&<div className="smc-error">⚠️ {error}</div>}
              {!loading&&!error&&chartData.length>0&&(
                <CandleSvg
                  data={chartData} width={chartWidth} height={380}
                  showMA={showMA} enabledMA={enabledMA}
                  drawings={drawings} onSvgClick={handleSvgClick} drawTool={drawTool}
                  selectedIdx={selectedIdx} onSelectDrawing={setSelectedIdx}
                  showSupply={showSupply} supplyData={supplyData} supplyLoading={supplyLoading}
                />
              )}
              {!loading&&!error&&!chartData.length&&<div className="smc-empty">데이터가 없습니다</div>}
              {textOverlay&&(
                <div className="smc-text-overlay">
                  <input autoFocus className="smc-text-overlay-input" placeholder="메모 입력 후 Enter"
                    onKeyDown={e=>{
                      if(e.key==='Enter'&&e.target.value.trim()){
                        saveDrawings([...drawings,{type:'text',price:textOverlay.price,bxVal:textOverlay.x,text:e.target.value.trim()}])
                        setTextOverlay(null); setDrawTool('none')
                      }
                      if(e.key==='Escape') setTextOverlay(null)
                    }}/>
                  <button className="smc-text-overlay-cancel" onClick={()=>setTextOverlay(null)}>✕</button>
                </div>
              )}
            </div>

            {/* 하단 정보바 */}
            {priceInfo&&(
              <div className="smc-info-bar">
                {[
                  ['현재가', priceInfo.current?fmtN(priceInfo.current)+'원':'-', pc],
                  ['등락률', priceInfo.changeRate!=null?sign+priceInfo.changeRate.toFixed(2)+'%':'-', pc],
                  ['거래량', fmtShort(priceInfo.volume), null],
                  ['시가',   priceInfo.open ?fmtN(priceInfo.open )+'원':'-', null],
                  ['고가',   priceInfo.high ?fmtN(priceInfo.high )+'원':'-', '#ef4444'],
                  ['저가',   priceInfo.low  ?fmtN(priceInfo.low  )+'원':'-', '#3b82f6'],
                ].map(([lbl,val,col])=>(
                  <div key={lbl} className="smc-info-item">
                    <span className="smc-info-label">{lbl}</span>
                    <span className="smc-info-value" style={col?{color:col}:{}}>{val}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── ETF 구성종목 탭 ── */}
        {activeTab==='etf'&&etfMode&&(
          <div style={{flex:1,overflow:'hidden'}}>
            <EtfHoldingsPopup code={stock.code} name={stock.name} onClose={()=>setActiveTab('chart')}
              style={{position:'relative',inset:'unset',background:'transparent'}}
            />
          </div>
        )}

        {/* ── 뉴스 탭 ── */}
        {activeTab==='news'&&<NewsPanel stock={stock}/>}

        {/* ── 공시 탭 ── */}
        {activeTab==='dart'&&<DartPanel stock={stock}/>}
      </div>

      {/* ETF 구성종목 팝업 (컨트롤바에서 열기) */}
      {showEtf&&(
        <EtfHoldingsPopup code={stock.code} name={stock.name} onClose={()=>setShowEtf(false)}/>
      )}

      {/* 전체화면 */}
      {showFull&&(
        <FullScreenModal
          stock={stock} period={period} scope={scope} range={range}
          showMA={showMA} enabledMA={enabledMA}
          drawings={drawings} saveDrawings={saveDrawings}
          showSupply={showSupply} supplyData={supplyData} supplyLoading={supplyLoading}
          onClose={()=>setShowFull(false)}
        />
      )}

      {/* AI 분석 팝업 */}
      {showAI&&<AiPopup stock={stock} onClose={()=>setShowAI(false)}/>}
    </div>
  )
}

// ── 전체화면 모달 ─────────────────────────────────────
function FullScreenModal({ stock, period:initP, scope:initS, range:initR, showMA:initMA, enabledMA:initEMA, drawings:initD, saveDrawings, showSupply, supplyData, supplyLoading, onClose }) {
  const [period,    setPeriod]    = useState(initP)
  const [scope,     setScope]     = useState(initS)
  const [range,     setRange]     = useState(initR)
  const [showMA,    setShowMA]    = useState(initMA)
  const [enabledMA, setEnabledMA] = useState(initEMA)
  const [drawTool,  setDrawTool]  = useState('none')
  const [drawState, setDrawState] = useState(null)
  const [selectedIdx,setSelectedIdx]=useState(null)
  const [textOverlay,setTextOverlay]=useState(null)
  const wrapRef=useRef(null)
  const [width,setWidth]=useState(1200)

  const { allData, loading, error } = useStockChart({ code:stock?.code, period, scope })
  const chartData = period==='min' ? allData : filterByRange(allData, range)

  useEffect(()=>{
    const upd=()=>{ if(wrapRef.current) setWidth(wrapRef.current.clientWidth) }
    upd(); window.addEventListener('resize',upd); return ()=>window.removeEventListener('resize',upd)
  },[])
  useEffect(()=>{
    const fn=e=>{ if(e.key==='Escape'){ if(textOverlay)setTextOverlay(null); else onClose() } }
    window.addEventListener('keydown',fn); return ()=>window.removeEventListener('keydown',fn)
  },[onClose,textOverlay])

  const toggleMA=p=>setEnabledMA(prev=>{ const n=new Set(prev); n.has(p)?n.delete(p):n.add(p); return n })

  function handleSvgClick(args) {
    const result=handleDrawClick({drawTool,setDrawTool,drawState,setDrawState,drawings:initD,saveDrawings,...args,data:chartData})
    if (result?.textOverlay) setTextOverlay(result.textOverlay)
  }

  const chartH=Math.max(500, (typeof window!=='undefined'?window.innerHeight:800)-180)

  return (
    <div style={{position:'fixed',inset:0,zIndex:2000,background:'#0a0f1a',display:'flex',flexDirection:'column'}}>
      {/* 툴바 */}
      <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',padding:'8px 14px',background:'#0f172a',borderBottom:'1px solid #1e293b',flexShrink:0}}>
        <span style={{fontSize:'15px',fontWeight:700,color:'#f1f5f9',marginRight:4}}>{stock.name}</span>
        <span style={{fontSize:'12px',color:'#475569',fontFamily:'monospace'}}>{stock.code}</span>
        <div style={{display:'flex',gap:2,marginLeft:6}}>
          {PERIODS.map(p=>(
            <button key={p.key} className={`smc-tab ${period===p.key?'active':''}`} onClick={()=>setPeriod(p.key)}>{p.label}</button>
          ))}
        </div>
        {period==='min'?(
          <div style={{display:'flex',gap:2,paddingLeft:6,borderLeft:'1px solid #334155'}}>
            {MIN_SCOPES.map(s=><button key={s} className={`smc-scope-btn ${scope===s?'active':''}`} onClick={()=>setScope(s)}>{s}분</button>)}
          </div>
        ):(
          <div style={{display:'flex',gap:2,paddingLeft:6,borderLeft:'1px solid #334155'}}>
            {RANGES.map(r=><button key={r.label} className={`smc-scope-btn ${range===r.months?'active':''}`} onClick={()=>setRange(r.months)}>{r.label}</button>)}
          </div>
        )}
        <button className={`smc-ma-btn ${showMA?'active':''}`} onClick={()=>setShowMA(v=>!v)}>MA</button>
        {showMA&&MA_SETTINGS.map(({p,color,label})=>(
          <button key={p} className={`smc-ma-chip ${enabledMA.has(p)?'active':''}`}
            style={enabledMA.has(p)?{color,borderColor:color,background:color+'18'}:{}}
            onClick={()=>toggleMA(p)}>{label}</button>
        ))}
        <button onClick={onClose} style={{marginLeft:'auto',background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.3)',color:'#f87171',borderRadius:7,padding:'5px 14px',cursor:'pointer',fontSize:12,fontWeight:600}}>✕ 닫기</button>
      </div>

      {/* 드로잉 툴바 */}
      <DrawingToolbar
        drawTool={drawTool} setDrawTool={setDrawTool}
        drawings={initD} saveDrawings={saveDrawings}
        drawState={drawState} setDrawState={setDrawState}
        onSave={()=>lsSet(`smc_draw_${stock?.code}`,initD)}
      />

      {/* 차트 */}
      <div ref={wrapRef} style={{flex:1,overflow:'hidden',background:'#0a0f1a',padding:'6px 0 0'}}>
        {loading&&<div style={{padding:60,textAlign:'center',color:'#64748b'}}>⟳ 불러오는 중...</div>}
        {error&&<div style={{padding:40,textAlign:'center',color:'#f87171'}}>⚠️ {error}</div>}
        {!loading&&!error&&chartData.length>0&&(
          <CandleSvg
            data={chartData} width={width} height={chartH}
            showMA={showMA} enabledMA={enabledMA}
            drawings={initD} onSvgClick={handleSvgClick} drawTool={drawTool}
            selectedIdx={selectedIdx} onSelectDrawing={setSelectedIdx}
            showSupply={showSupply} supplyData={supplyData} supplyLoading={supplyLoading}
          />
        )}
        {!loading&&!error&&!chartData.length&&<div style={{padding:80,textAlign:'center',color:'#64748b'}}>데이터가 없습니다</div>}
        {textOverlay&&(
          <div className="smc-text-overlay">
            <input autoFocus className="smc-text-overlay-input" placeholder="메모 입력 후 Enter"
              onKeyDown={e=>{
                if(e.key==='Enter'&&e.target.value.trim()){
                  saveDrawings([...initD,{type:'text',price:textOverlay.price,bxVal:textOverlay.x,text:e.target.value.trim()}])
                  setTextOverlay(null); setDrawTool('none')
                }
                if(e.key==='Escape') setTextOverlay(null)
              }}/>
            <button className="smc-text-overlay-cancel" onClick={()=>setTextOverlay(null)}>✕</button>
          </div>
        )}
      </div>
    </div>
  )
}
