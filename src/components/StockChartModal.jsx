import { useState, useEffect, useCallback, useRef } from 'react'
import './StockChartModal.css'

// ── 간단 마크다운 렌더러 ────────────────────────────
function renderMarkdown(text) {
  if (!text) return []
  return text.split('\n').map((line, i) => {
    // ## 제목
    if (line.startsWith('### ')) return { type:'h3', text: line.slice(4), key:i }
    if (line.startsWith('## '))  return { type:'h2', text: line.slice(3), key:i }
    if (line.startsWith('# '))   return { type:'h1', text: line.slice(2), key:i }
    // - 목록
    if (/^[-*] /.test(line))     return { type:'li', text: line.slice(2), key:i }
    // 빈 줄
    if (!line.trim())             return { type:'br', text:'', key:i }
    // 일반 텍스트 (** 볼드 처리)
    return { type:'p', text: line, key:i }
  })
}
function MarkdownView({ text, className }) {
  const nodes = renderMarkdown(text)
  return (
    <div className={className}>
      {nodes.map(n => {
        // **텍스트** 볼드 인라인 파싱
        const inlineBold = (t) => {
          const parts = t.split(/\*\*(.*?)\*\*/g)
          return parts.map((p, i) => i % 2 === 1 ? <strong key={i}>{p}</strong> : p)
        }
        if (n.type === 'h1') return <h3 key={n.key} className="smc-md-h1">{inlineBold(n.text)}</h3>
        if (n.type === 'h2') return <h3 key={n.key} className="smc-md-h2">{inlineBold(n.text)}</h3>
        if (n.type === 'h3') return <h4 key={n.key} className="smc-md-h3">{inlineBold(n.text)}</h4>
        if (n.type === 'li') return <li  key={n.key} className="smc-md-li">{inlineBold(n.text)}</li>
        if (n.type === 'br') return <div key={n.key} className="smc-md-br"/>
        return <p key={n.key} className="smc-md-p">{inlineBold(n.text)}</p>
      })}
    </div>
  )
}

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY
const DART_KEY   = import.meta.env.VITE_DART_API_KEY

const PERIODS = [
  { label:'분봉', type:'min' }, { label:'일봉', type:'day' },
  { label:'주봉', type:'week' }, { label:'월봉', type:'month' }, { label:'년봉', type:'year' },
]
const RANGES = [
  { label:'1개월', months:1 }, { label:'3개월', months:3 }, { label:'6개월', months:6 },
  { label:'1년', months:12 }, { label:'3년', months:36 }, { label:'전체', months:0 },
]
const MIN_SCOPES = ['1','3','5','10','15','30','60']
const MA_SETTINGS = [
  { period:5,  color:'#f59e0b', label:'MA5'  },
  { period:10, color:'#10b981', label:'MA10' },
  { period:20, color:'#3b82f6', label:'MA20' },
  { period:60, color:'#8b5cf6', label:'MA60' },
  { period:120,color:'#ef4444', label:'MA120'},
]
const DRAW_TOOLS = [
  { id:'none',  label:'🖱️ 선택'  },
  { id:'hline', label:'━ 수평선' },
  { id:'trend', label:'↗ 추세선' },
  { id:'fib',   label:'🔢 피보나치' },
  { id:'text',  label:'📝 메모'  },
  { id:'split3',label:'⅓ 3분할' },
  { id:'split4',label:'¼ 4분할' },
]
const DART_CORP_MAP = {
  '005930':'00126380','000660':'00164779','005380':'00164742',
  '035420':'00266961','051910':'00117694','006400':'00126380',
  '207940':'00401731','068270':'00105933','012450':'00129838',
  '064350':'00231467','079550':'00140593','329180':'00164876',
  '010140':'00104896','042660':'00131030','034020':'00155276',
  '298040':'00631791','373220':'01182754','005490':'00101867',
  '105560':'00547583','055550':'00140518','086790':'01049648',
}

// ── 유틸 ─────────────────────────────────────────────
function parseN(s)  { if (!s) return 0; return parseInt(String(s).replace(/[^0-9-]/g,''))||0 }
function fmtN(n)    { if (n===undefined||n===null) return '-'; return Number(n).toLocaleString('ko-KR') }
function fmtShort(n){ if (!n) return '0'; if (n>=100000000) return (n/100000000).toFixed(1)+'억'; if (n>=10000) return (n/10000).toFixed(0)+'만'; return String(n) }
function filterByRange(data, months) {
  if (!months) return data
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth()-months)
  const cutStr = cutoff.toISOString().slice(0,10).replace(/-/g,'')
  return data.filter(d => (d.dateRaw||'') >= cutStr)
}
function calcMA(data, period) {
  return data.map((_,i) => {
    if (i<period-1) return null
    return Math.round(data.slice(i-period+1,i+1).reduce((s,d)=>s+(d.close||0),0)/period)
  })
}
function lsGet(k,d){ try{ return JSON.parse(localStorage.getItem(k))??d }catch{return d} }
function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)) }catch{} }
function formatDateLabel(dateStr, period) {
  const s = String(dateStr||'')
  if (period==='min') return s.length>=4 ? s.slice(0,2)+':'+s.slice(2,4) : s
  if (s.length===8)   return s.slice(4,6)+'/'+s.slice(6,8)
  return s
}

// ── 공시 패널 ────────────────────────────────────────
function DartPanel({ stock }) {
  const [list,    setList]    = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [popup,   setPopup]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // 항상 /api/dart 프록시 사용 (브라우저 직접 호출 시 DART CORS 차단)
      const corpCode = DART_CORP_MAP[stock.code]
      let url
      if (corpCode) {
        const today = new Date().toISOString().slice(0,10).replace(/-/g,'')
        const from  = new Date(Date.now()-180*86400000).toISOString().slice(0,10).replace(/-/g,'')
        url = `/api/dart?type=list&corp_code=${corpCode}&bgn_de=${from}&end_de=${today}`
      } else {
        url = `/api/dart?type=corp_list&corp_name=${encodeURIComponent(stock.name)}`
      }
      const res  = await fetch(url)
      const data = await res.json()
      const items = data.list || data.items || data.disclosures || []
      setList(items)
      if (!items.length) setError('최근 6개월 내 공시가 없습니다')
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [stock.code, stock.name])

  useEffect(() => { load() }, [load])

  return (
    <div className="smc-dart-panel">
      <div className="smc-news-header">
        <span className="smc-news-title">📋 {stock.name} 공시</span>
        <button className="smc-news-fetch-btn" onClick={load} disabled={loading}>
          {loading ? '⟳ 로딩...' : '↺ 새로고침'}
        </button>
      </div>
      {error && <div className="smc-news-error">⚠️ {error}</div>}
      {loading && <div className="smc-news-loading"><div className="smc-news-spinner"/>공시 조회 중...</div>}
      {!loading && list.length > 0 && (
        <div className="smc-news-list">
          {list.map((d, i) => (
            <div key={i} className="smc-news-item">
              <div className="smc-news-item-body" onClick={() => setPopup(d)}>
                <div className="smc-news-item-title">{d.report_nm || d.title || '공시'}</div>
                <div className="smc-news-item-meta">
                  <span className="smc-news-source">{d.corp_name || stock.name}</span>
                  <span className="smc-news-date">{d.rcept_dt || d.date || ''}</span>
                </div>
              </div>
              <a
                href={d.rcept_no ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d.rcept_no}` : (d.url || '#')}
                target="_blank" rel="noreferrer" className="smc-news-link-btn"
                onClick={e => e.stopPropagation()}>원문 →</a>
            </div>
          ))}
        </div>
      )}
      {popup && (
        <div className="smc-news-popup-overlay" onClick={() => setPopup(null)}>
          <div className="smc-news-popup" onClick={e => e.stopPropagation()}>
            <div className="smc-news-popup-header">
              <div><span className="smc-news-source">{popup.corp_name}</span> <span className="smc-news-date">{popup.rcept_dt}</span></div>
              <button className="smc-news-popup-close" onClick={() => setPopup(null)}>✕</button>
            </div>
            <div className="smc-news-popup-title">{popup.report_nm}</div>
            <div className="smc-news-popup-summary">접수번호: {popup.rcept_no}</div>
            {popup.rcept_no && (
              <a href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${popup.rcept_no}`}
                target="_blank" rel="noreferrer" className="smc-news-popup-link">
                📋 DART 원문 보기 →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 뉴스 패널 ────────────────────────────────────────
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
        headers:{
          'Content-Type':'application/json',
          'x-api-key': CLAUDE_KEY,
          'anthropic-version':'2023-06-01',
          'anthropic-dangerous-direct-browser-access':'true',
        },
        body: JSON.stringify({
          model:'claude-haiku-4-5-20251001',
          max_tokens:1200,
          tools:[{type:'web_search_20250305',name:'web_search'}],
          messages:[{role:'user',content:
            `웹 검색으로 오늘(${today}) ${stock.name}(${stock.code}) 관련 최신 뉴스를 5개 찾아줘.
반드시 JSON 배열 형식으로만 응답해줘 (앞뒤 텍스트 없이):
[{"title":"제목","summary":"한줄요약","url":"https://...","source":"언론사","date":"날짜"}]`
          }],
        }),
      })
      const data = await res.json()
      const text = data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||''
      const match = text.match(/\[[\s\S]*\]/)
      if (match) {
        setNews(JSON.parse(match[0]))
      } else {
        setError('뉴스 파싱 실패 - 잠시 후 다시 시도해주세요')
      }
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [stock.code, stock.name])

  return (
    <div className="smc-news-panel">
      <div className="smc-news-header">
        <span className="smc-news-title">📰 {stock.name} 최신 뉴스</span>
        <button className="smc-news-fetch-btn" onClick={loadNews} disabled={loading}>
          {loading ? '⟳ 검색 중...' : news.length ? '↺ 갱신' : '🔍 뉴스 검색'}
        </button>
      </div>
      {error && <div className="smc-news-error">⚠️ {error}</div>}
      {loading && <div className="smc-news-loading"><div className="smc-news-spinner"/>뉴스 검색 중...</div>}
      {!loading && news.length === 0 && !error && (
        <div className="smc-news-empty">버튼을 눌러 최신 뉴스를 검색하세요</div>
      )}
      {!loading && news.length > 0 && (
        <div className="smc-news-list">
          {news.map((n, i) => (
            <div key={i} className="smc-news-item">
              <div className="smc-news-item-body" onClick={() => setSelNews(n)}>
                <div className="smc-news-item-title">{n.title}</div>
                <div className="smc-news-item-meta">
                  <span className="smc-news-source">{n.source}</span>
                  {n.date && <span className="smc-news-date">{n.date}</span>}
                </div>
                <div className="smc-news-item-summary">{n.summary}</div>
              </div>
              <a href={n.url} target="_blank" rel="noreferrer" className="smc-news-link-btn"
                onClick={e => e.stopPropagation()}>원문 →</a>
            </div>
          ))}
        </div>
      )}
      {selNews && (
        <div className="smc-news-popup-overlay" onClick={() => setSelNews(null)}>
          <div className="smc-news-popup" onClick={e => e.stopPropagation()}>
            <div className="smc-news-popup-header">
              <div><span className="smc-news-source">{selNews.source}</span> {selNews.date && <span className="smc-news-date">{selNews.date}</span>}</div>
              <button className="smc-news-popup-close" onClick={() => setSelNews(null)}>✕</button>
            </div>
            <div className="smc-news-popup-title">{selNews.title}</div>
            <div className="smc-news-popup-summary">{selNews.summary}</div>
            <a href={selNews.url} target="_blank" rel="noreferrer" className="smc-news-popup-link">
              📰 원문 기사 새창으로 보기 →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ── AI 분석 팝업 ──────────────────────────────────────
function AiPopup({ stock, onClose }) {
  const key = `smc_ai_${stock.code}`
  const [result,  setResult]  = useState(() => lsGet(key, null))
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const runAI = async () => {
    if (!CLAUDE_KEY) { setError('Claude API 키 미설정'); return }
    setLoading(true); setError('')
    try {
      const today = new Date().toLocaleDateString('ko-KR')
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-api-key': CLAUDE_KEY,
          'anthropic-version':'2023-06-01',
          'anthropic-dangerous-direct-browser-access':'true',
        },
        body: JSON.stringify({
          model:'claude-haiku-4-5-20251001',
          max_tokens:1200,
          tools:[{type:'web_search_20250305',name:'web_search'}],
          messages:[{role:'user',content:
            `오늘(${today}) ${stock.name}(${stock.code}) 주식에 대해 웹 검색으로 최신 정보를 찾아서 분석해줘.

## 📌 현재 주가 상황
## 🔑 핵심 모멘텀 (3가지)
## 📊 기술적 분석
- 추세:
- 지지/저항:
## 🏢 펀더멘털
## ⚠️ 주요 리스크
## 💡 단기 투자 전략

실제 최신 데이터 기반으로 작성해줘.`
          }],
        }),
      })
      const data = await res.json()
      const text = data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||''
      if (!text.trim()) throw new Error('분석 결과 없음')
      const saved = { text, date: today, code: stock.code, name: stock.name }
      setResult(saved)
      lsSet(key, saved)
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="smc-overlay" onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
      <div className="smc-ai-popup">
        <div className="smc-ai-popup-header">
          <div>
            <span className="smc-ai-popup-title">🤖 AI 종목 분석</span>
            <span className="smc-ai-popup-sub">{stock.name} ({stock.code})</span>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button className="smc-news-fetch-btn" onClick={runAI} disabled={loading}>
              {loading ? '⟳ 분석 중...' : result ? '↺ 새로 분석' : '🔍 AI 분석 시작'}
            </button>
            <button className="smc-close" onClick={onClose}>✕</button>
          </div>
        </div>
        {error && <div className="smc-news-error">⚠️ {error}</div>}
        {loading && (
          <div className="smc-news-loading" style={{padding:'40px 20px'}}>
            <div className="smc-news-spinner"/>AI가 웹 검색으로 분석 중...
          </div>
        )}
        {!loading && result && (
          <div className="smc-ai-result">
            <div className="smc-ai-result-meta">📅 {result.date} 저장 · 다음 분석 시 자동 업데이트</div>
            <MarkdownView text={result.text} className="smc-ai-result-text"/>
          </div>
        )}
        {!loading && !result && !error && (
          <div className="smc-news-empty" style={{padding:'60px 20px'}}>
            버튼을 눌러 AI 분석을 시작하세요<br/>
            <span style={{fontSize:'12px',color:'#94a3b8'}}>웹 검색 기반 · 결과가 자동 저장됩니다</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 수급 미니 차트 ───────────────────────────────────
function SupplyMiniChart({ label, data, color, width, type = 'bar' }) {
  if (!data || data.length === 0) return (
    <div style={{padding:'8px',color:'#94a3b8',fontSize:'12px',textAlign:'center'}}>{label}: 데이터 없음</div>
  )
  const W = width || 200, H = 70
  const PAD = {left:50,right:8,top:6,bottom:20}
  const cW = W - PAD.left - PAD.right
  const cH = H - PAD.top - PAD.bottom
  const vals = data.map(d => d.value).filter(v => v !== null && v !== undefined)
  const maxV = Math.max(...vals.map(Math.abs), 1)
  const bx   = i => PAD.left + (i / (data.length - 1 || 1)) * cW
  const py   = v => PAD.top + cH/2 - (v / maxV) * (cH/2)
  const barW = Math.max(1, Math.floor(cW / data.length * 0.7))

  return (
    <svg width={W} height={H} style={{display:'block'}}>
      <line x1={PAD.left} x2={PAD.left+cW} y1={PAD.top+cH/2} y2={PAD.top+cH/2} stroke="rgba(255,255,255,0.08)" strokeWidth={0.5}/>
      <text x={PAD.left-4} y={PAD.top+4} fontSize={9} fill="#94a3b8" textAnchor="end">{label}</text>
      {type === 'bar' && data.map((d, i) => {
        const v = d.value || 0
        const barH = Math.abs(v / maxV) * (cH/2)
        const isPos = v >= 0
        return <rect key={i}
          x={bx(i)-barW/2}
          y={isPos ? PAD.top+cH/2-barH : PAD.top+cH/2}
          width={barW} height={Math.max(1,barH)}
          fill={isPos ? '#22c55e' : '#ef4444'} opacity={0.8}/>
      })}
      {type === 'line' && (() => {
        const pts = data.map((d,i) => `${bx(i)},${py(d.value||0)}`).join(' ')
        return <polyline points={pts} fill="none" stroke={color||'#3b82f6'} strokeWidth={1.2}/>
      })()}
      {/* X축 레이블 (첫/마지막) */}
      {data[0] && <text x={PAD.left} y={H-4} fontSize={9} fill="#94a3b8" textAnchor="middle">{(data[0].date||'').slice(4,8)?.replace(/(\d{2})(\d{2})/,'$1/$2')}</text>}
      {data[data.length-1] && <text x={PAD.left+cW} y={H-4} fontSize={9} fill="#94a3b8" textAnchor="middle">{(data[data.length-1].date||'').slice(4,8)?.replace(/(\d{2})(\d{2})/,'$1/$2')}</text>}
    </svg>
  )
}

// ── 메인 캔들차트 컴포넌트 ────────────────────────────
function CandleChart({
  data, width, height = 320,
  showMA, enabledMA,
  drawings, onSvgClick, drawTool,
  selectedIdx, onSelectDrawing,
  showSupply, supplyData, supplyLoading,
  yMin: yMinProp, yMax: yMaxProp,
}) {
  const [tooltip, setTooltip] = useState(null)
  const svgRef = useRef(null)
  if (!data || data.length === 0) return null

  const SUPPLY_H    = showSupply ? 75 : 0
  const SUPPLY_GAP  = showSupply ? 8  : 0
  const SUPPLY_ROWS = showSupply ? 3  : 0
  const totalH = height + (SUPPLY_H + SUPPLY_GAP) * SUPPLY_ROWS

  const PAD  = {top:12,right:8,bottom:24,left:80}
  const W    = width - PAD.left - PAD.right
  const H    = height - PAD.top - PAD.bottom

  const prices   = data.flatMap(d=>[d.high,d.low]).filter(Boolean)
  const rawMin   = yMinProp ?? Math.min(...prices)
  const rawMax   = yMaxProp ?? Math.max(...prices)
  const margin   = (rawMax - rawMin) * 0.06 || rawMin * 0.005
  const minP = rawMin - margin, maxP = rawMax + margin, rangeP = maxP - minP || 1

  const py    = v  => PAD.top + H - ((v - minP) / rangeP) * H
  const fromY = y  => minP + (PAD.top + H - y) / H * rangeP
  const barW  = Math.max(1, Math.min(12, W / data.length - 1))
  const bx    = i  => PAD.left + (i + 0.5) * (W / data.length)
  const fromX = x  => Math.round((x - PAD.left) / (W / data.length) - 0.5)

  const yTicks    = Array.from({length:5},(_,i) => minP + (rangeP/4)*i)
  const xTickStep = Math.max(1, Math.floor(data.length / 7))

  const maLines = showMA ? MA_SETTINGS.filter(m => enabledMA?.has(m.period)).map(({period,color}) => {
    const maData = calcMA(data, period)
    const pts    = maData.map((v,i) => v ? `${bx(i)},${py(v)}` : null).filter(Boolean)
    return pts.length >= 2 ? {period, color, points: pts.join(' ')} : null
  }).filter(Boolean) : []

  function handleMouseMove(e) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = (e.clientX - rect.left) * (width  / rect.width)
    const my = (e.clientY - rect.top)  * (totalH / rect.height)
    const idx = Math.round((mx - PAD.left) / (W / data.length) - 0.5)
    setTooltip({
      idx: Math.max(0, Math.min(data.length - 1, idx)),
      x: mx, y: my,
      svgY: my,
    })
  }

  function handleClick(e) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = (e.clientX - rect.left) * (width  / rect.width)
    const my = (e.clientY - rect.top)  * (totalH / rect.height)

    // 선택 모드: 드로잉 클릭 감지
    if (drawTool === 'none' && onSelectDrawing) {
      const CLICK_THRESH = 8
      for (let i = drawings.length - 1; i >= 0; i--) {
        const d = drawings[i]
        if (d.type === 'hline' || d.type === 'split3_a' || d.type === 'split3_b' ||
            d.type === 'split4_a' || d.type === 'split4_b' || d.type === 'split4_c') {
          if (Math.abs(py(d.price) - my) < CLICK_THRESH) {
            onSelectDrawing(i); return
          }
        }
        if (d.type === 'trend' && d.x2 !== undefined) {
          // 선분과 클릭 점 거리
          const dx = d.x2 - d.x1, dy = d.y2 - d.y1
          const len = Math.sqrt(dx*dx + dy*dy) || 1
          const dist = Math.abs((dy*(mx - d.x1) - dx*(my - d.y1)) / len)
          if (dist < CLICK_THRESH) { onSelectDrawing(i); return }
        }
        if (d.type === 'text') {
          if (Math.abs(bx(d.idxVal||0) - mx) < 20 && Math.abs(py(d.price) - my) < 14) {
            onSelectDrawing(i); return
          }
        }
      }
      onSelectDrawing(null)
      return
    }

    if (!onSvgClick || drawTool === 'none') return
    const idx = fromX(mx)
    onSvgClick({ x:mx, y:my, idx, price:fromY(my), bx, toY:py, PAD, W, H })
  }

  const td      = tooltip ? data[Math.max(0, Math.min(data.length-1, tooltip.idx))] : null
  const maValues = showMA && td ? MA_SETTINGS.filter(m=>enabledMA?.has(m.period)).map(({period,color})=>{
    const v = calcMA(data, period)[Math.max(0, Math.min(data.length-1, tooltip?.idx??0))]
    return v ? {period, color, v} : null
  }).filter(Boolean) : []

  // 수급 데이터를 날짜 기준으로 캔들과 정렬
  const supplyLabels = ['외국인 순매수', '공매도 비율', '체결강도']
  const supplyColors = ['#3b82f6', '#ef4444', '#10b981']
  const supplyTypes  = ['bar', 'line', 'line']
  const supplyKeys   = ['foreign', 'short', 'strength']

  return (
    <div style={{position:'relative'}}>
      <svg
        ref={svgRef}
        width={width}
        height={totalH}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        onClick={handleClick}
        style={{display:'block', cursor: drawTool !== 'none' ? 'crosshair' : 'default', background:'#0f172a', borderRadius:'8px'}}
      >
        {/* Y축 눈금 */}
        {yTicks.map((v,i) => (
          <g key={i}>
            <line x1={PAD.left} y1={py(v)} x2={PAD.left+W} y2={py(v)} stroke="rgba(255,255,255,0.07)" strokeWidth={0.5} strokeDasharray="3,3"/>
            <text x={PAD.left-5} y={py(v)+4} textAnchor="end" fontSize={10} fill="#64748b">{fmtN(Math.round(v))}</text>
          </g>
        ))}

        {/* X축 날짜 */}
        {data.filter((_,i) => i % xTickStep === 0).map((d,i) => (
          <text key={i} x={bx(data.indexOf(d))} y={PAD.top+H+16} textAnchor="middle" fontSize={10} fill="#64748b">{d.dateLabel}</text>
        ))}

        {/* 캔들 */}
        {data.map((d,i) => {
          const isUp = d.close >= d.open
          const color = isUp ? '#ef4444' : '#3b82f6'
          const cx = bx(i)
          const bodyTop = py(Math.max(d.open, d.close))
          const bodyH   = Math.max(1, py(Math.min(d.open, d.close)) - bodyTop)
          return (
            <g key={i}>
              <line x1={cx} y1={py(d.high)} x2={cx} y2={py(d.low)} stroke={color} strokeWidth={1}/>
              <rect x={cx - barW/2} y={bodyTop} width={barW} height={bodyH} fill={color}/>
            </g>
          )
        })}

        {/* MA 라인 */}
        {maLines.map(ma => (
          <polyline key={ma.period} points={ma.points} fill="none" stroke={ma.color} strokeWidth={1.2} opacity={0.85}/>
        ))}

        {/* 드로잉 렌더 */}
        {drawings?.map((d, i) => {
          const isSelected = selectedIdx === i
          const selStyle   = isSelected ? {strokeWidth:2.5, opacity:1} : {}

          if (d.type==='hline' || d.type?.startsWith('split')) {
            const y = py(d.price)
            if (y < PAD.top || y > PAD.top+H) return null
            const lineColor = isSelected ? '#fbbf24' : (d.color||'#f59e0b')
            return <g key={i} style={{cursor:'pointer'}}>
              <line x1={PAD.left} x2={PAD.left+W} y1={y} y2={y}
                stroke={lineColor} strokeWidth={isSelected?2:1.5} strokeDasharray="6,3"
                {...selStyle}/>
              <text x={PAD.left+W+4} y={y+4} fontSize={10} fill={lineColor}>{Math.round(d.price).toLocaleString()}</text>
              {isSelected && <rect x={PAD.left-2} y={y-4} width={8} height={8} fill={lineColor} rx={2}/>}
            </g>
          }
          if (d.type==='trend' && d.x2!==undefined) {
            const lineColor = isSelected ? '#fbbf24' : '#8b5cf6'
            return <line key={i} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2}
              stroke={lineColor} strokeWidth={isSelected?2.5:1.5} style={{cursor:'pointer'}}/>
          }
          if (d.type==='fib' && d.x2!==undefined) {
            const levels = [0,0.236,0.382,0.5,0.618,0.786,1]
            const range2 = d.price2 - d.price1
            const colors2 = ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#64748b']
            return <g key={i}>
              {levels.map((l,li) => {
                const price2 = d.price2 - range2*l
                const y2 = py(price2)
                if (y2 < PAD.top || y2 > PAD.top+H) return null
                return <g key={li}>
                  <line x1={PAD.left} x2={PAD.left+W} y1={y2} y2={y2}
                    stroke={colors2[li]} strokeWidth={1} strokeDasharray="4,4" opacity={0.7}/>
                  <text x={PAD.left+W+4} y={y2+4} fontSize={9} fill={colors2[li]}>{(l*100).toFixed(1)}%</text>
                </g>
              })}
            </g>
          }
          if (d.type==='text') {
            const y2 = py(d.price)
            if (y2 < PAD.top || y2 > PAD.top+H) return null
            const cx2 = bx(d.idxVal ?? 0)
            const lineColor = isSelected ? '#fbbf24' : '#334155'
            return <g key={i} style={{cursor:'pointer'}}>
              <rect x={cx2-2} y={y2-13} width={d.text.length*7+8} height={16}
                fill={isSelected?'rgba(251,191,36,0.15)':'rgba(30,41,59,0.9)'} stroke={lineColor} rx={3} opacity={0.9}/>
              <text x={cx2+2} y={y2} fontSize={11} fill={lineColor}>{d.text}</text>
            </g>
          }
          return null
        })}

        {/* 십자선 (가로+세로) */}
        {tooltip && td && tooltip.svgY >= PAD.top && tooltip.svgY <= PAD.top+H && (
          <>
            <line x1={bx(tooltip.idx)} y1={PAD.top}
              x2={bx(tooltip.idx)} y2={PAD.top+H}
              stroke="rgba(255,255,255,0.3)" strokeWidth={0.8} strokeDasharray="4,2"/>
            <line x1={PAD.left} y1={tooltip.svgY}
              x2={PAD.left+W}   y2={tooltip.svgY}
              stroke="rgba(255,255,255,0.25)" strokeWidth={0.8} strokeDasharray="4,2"/>
            {/* 가격 레이블 (오른쪽) */}
            <rect x={PAD.left+W} y={tooltip.svgY-8} width={76} height={16}
              fill="#1e293b" rx={3}/>
            <text x={PAD.left+W+38} y={tooltip.svgY+4}
              fontSize={10} fill="#e2e8f0" textAnchor="middle">
              {fmtN(Math.round(fromY(tooltip.svgY)))}
            </text>
          </>
        )}

        {/* 수급 서브차트 */}
        {showSupply && supplyKeys.map((key, si) => {
          const sData  = supplyData?.[key] || []
          const sTop   = height + (SUPPLY_H + SUPPLY_GAP) * si
          const midY   = sTop + SUPPLY_H / 2
          const sVals  = sData.map(d => d.value || 0)
          const sMax   = Math.max(...sVals.map(Math.abs), 1)
          const sbx    = (idx) => PAD.left + (idx + 0.5) * (W / Math.max(sData.length, 1))
          const spy    = (v)   => midY - (v / sMax) * (SUPPLY_H/2 - 4)
          return (
            <g key={key}>
              <line x1={PAD.left} x2={PAD.left+W} y1={sTop} y2={sTop} stroke="rgba(255,255,255,0.08)" strokeWidth={0.5}/>
              <line x1={PAD.left} x2={PAD.left+W} y1={midY} y2={midY} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} strokeDasharray="2,4"/>
              <text x={PAD.left-5} y={sTop+14} fontSize={9} fill="#94a3b8" textAnchor="end">{supplyLabels[si]}</text>
              {supplyLoading && (
                <text x={PAD.left + W/2} y={midY+4} fontSize={10} fill="#94a3b8" textAnchor="middle">로딩 중...</text>
              )}
              {!supplyLoading && sData.length > 0 && supplyTypes[si] === 'bar' && sData.map((d,i) => {
                const v = d.value || 0
                const barH = Math.abs(v / sMax) * (SUPPLY_H/2 - 4)
                const isPos = v >= 0
                const bw2 = Math.max(1, Math.min(8, W / sData.length * 0.6))
                return <rect key={i}
                  x={sbx(i) - bw2/2}
                  y={isPos ? midY - barH : midY}
                  width={bw2} height={Math.max(1, barH)}
                  fill={isPos ? '#22c55e' : '#ef4444'} opacity={0.7}/>
              })}
              {!supplyLoading && sData.length > 0 && supplyTypes[si] === 'line' && (() => {
                const pts = sData.map((d,i) => `${sbx(i)},${spy(d.value||0)}`).join(' ')
                return <polyline points={pts} fill="none" stroke={supplyColors[si]} strokeWidth={1.2} opacity={0.85}/>
              })()}
            </g>
          )
        })}
      </svg>

      {/* 툴팁 */}
      {tooltip && td && (
        <div className="smc-tooltip" style={{
          left: tooltip.x > width/2 ? tooltip.x - 165 : tooltip.x + 12,
          top:  Math.min(tooltip.svgY, height - 180)
        }}>
          <div className="smc-tt-date">{td.dateLabel}</div>
          <div className="smc-tt-row"><span>시가</span><b>{fmtN(td.open)}</b></div>
          <div className="smc-tt-row"><span>고가</span><b style={{color:'#ef4444'}}>{fmtN(td.high)}</b></div>
          <div className="smc-tt-row"><span>저가</span><b style={{color:'#3b82f6'}}>{fmtN(td.low)}</b></div>
          <div className="smc-tt-row"><span>종가</span><b style={{color:td.close>=td.open?'#ef4444':'#3b82f6'}}>{fmtN(td.close)}</b></div>
          <div className="smc-tt-row"><span>거래량</span><b>{fmtShort(td.volume)}</b></div>
          {maValues.map(({period,color,v}) => (
            <div key={period} className="smc-tt-row">
              <span style={{color}}>MA{period}</span><b>{fmtN(v)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 거래량 차트 ──────────────────────────────────────
function VolumeChart({ data, width, height = 60 }) {
  if (!data || data.length === 0) return null
  const PAD  = {top:4,right:8,bottom:4,left:80}
  const W    = width - PAD.left - PAD.right
  const H    = height - PAD.top - PAD.bottom
  const maxV = Math.max(...data.map(d => d.volume||0))
  const barW = Math.max(1, Math.min(12, W/data.length - 1))
  const bx   = i => PAD.left + (i + 0.5) * (W/data.length)
  return (
    <svg width={width} height={height} style={{display:'block', background:'#0f172a'}}>
      <text x={PAD.left-5} y={PAD.top+10} textAnchor="end" fontSize={9} fill="#94a3b8">거래량</text>
      {data.map((d,i) => {
        const barH = maxV > 0 ? (d.volume/maxV)*H : 0
        return <rect key={i} x={bx(i)-barW/2} y={PAD.top+H-barH} width={barW} height={Math.max(1,barH)}
          fill={d.close>=d.open ? '#fca5a5' : '#93c5fd'} opacity={0.8}/>
      })}
    </svg>
  )
}

// ── 전체화면 차트 컴포넌트 ──────────────────────────────
function FullScreenChart({
  stock, period: initPeriod, scope: initScope, range: initRange,
  showMA: initShowMA, enabledMA: initEnabledMA,
  drawings, saveDrawings,
  showSupply, supplyData, supplyLoading,
  onClose,
}) {
  const [period,    setPeriod]    = useState(initPeriod || 'day')
  const [scope,     setScope]     = useState(initScope  || '5')
  const [range,     setRange]     = useState(initRange  || 3)
  const [showMA,    setShowMA]    = useState(initShowMA ?? true)
  const [enabledMA, setEnabledMA] = useState(initEnabledMA || new Set([5,10,20,60,120]))
  const [allData,   setAllData]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [drawTool,  setDrawTool]  = useState('none')
  const [drawState, setDrawState] = useState(null)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [textOverlay, setTextOverlay] = useState(null)
  const wrapRef = useRef(null)
  const [chartWidth, setChartWidth] = useState(1200)

  const DATA_KEY = {
    min:'stk_min_pole_chart_qry', day:'stk_dt_pole_chart_qry',
    week:'stk_stk_pole_chart_qry', month:'stk_mth_pole_chart_qry', year:'stk_yr_pole_chart_qry',
  }

  useEffect(() => {
    const update = () => { if (wrapRef.current) setChartWidth(wrapRef.current.clientWidth) }
    update(); window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const fetchChart = useCallback(async () => {
    if (!stock?.code) return
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ type:'stock-chart', period, code: stock.code })
      if (period === 'min') params.set('tic', scope)
      const json = await fetch(`/api/kiwoom?${params}`).then(r => r.json())
      if (json.error) throw new Error(json.error)
      let items = json.candles || json[DATA_KEY[period]] || []
      const raw = items.map(c => {
        const dateStr = String(c.date || c.dt || c.cntr_tm || '')
        return {
          dateRaw:   dateStr,
          dateLabel: formatDateLabel(dateStr, period),
          open:   Math.abs(parseN(c.open   ?? c.open_pric)),
          high:   Math.abs(parseN(c.high   ?? c.high_pric)),
          low:    Math.abs(parseN(c.low    ?? c.low_pric)),
          close:  Math.abs(parseN(c.close  ?? c.cur_prc)),
          volume: parseN(c.volume ?? c.trde_qty),
        }
      }).filter(c => c.close > 0)
      if (!json.candles && json[DATA_KEY[period]]) raw.reverse()
      setAllData(raw)
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [stock?.code, period, scope])

  useEffect(() => { fetchChart() }, [fetchChart])

  const toggleMA = p => setEnabledMA(prev => {
    const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n
  })

  const chartData = period === 'min' ? allData : filterByRange(allData, range)

  function handleSvgClick({ x, y, price: clickPrice, idx }) {
    if (drawTool === 'none') return
    if (drawTool === 'hline') {
      saveDrawings([...drawings, { type:'hline', price: clickPrice }])
    } else if (drawTool === 'split3') {
      const prices = allData.map(d => d.close).filter(Boolean)
      const lo = Math.min(...prices), hi = Math.max(...prices), r = hi - lo
      saveDrawings([...drawings,
        { type:'split3_a', price: lo + r/3, color:'#06b6d4' },
        { type:'split3_b', price: lo + r*2/3, color:'#06b6d4' },
      ]); setDrawTool('none')
    } else if (drawTool === 'split4') {
      const prices = allData.map(d => d.close).filter(Boolean)
      const lo = Math.min(...prices), hi = Math.max(...prices), r = hi - lo
      saveDrawings([...drawings,
        { type:'split4_a', price: lo + r*0.25, color:'#f472b6' },
        { type:'split4_b', price: lo + r*0.50, color:'#f472b6' },
        { type:'split4_c', price: lo + r*0.75, color:'#f472b6' },
      ]); setDrawTool('none')
    } else if (drawTool === 'trend' || drawTool === 'fib') {
      if (!drawState) {
        setDrawState({ x1:x, y1:y, price1: clickPrice })
      } else {
        if (drawTool === 'trend') saveDrawings([...drawings, { type:'trend', x1:drawState.x1, y1:drawState.y1, x2:x, y2:y }])
        else saveDrawings([...drawings, { type:'fib', x1:drawState.x1, y1:drawState.y1, x2:x, y2:y, price1:drawState.price1, price2:clickPrice }])
        setDrawState(null)
      }
    } else if (drawTool === 'text') {
      const rect = wrapRef.current?.getBoundingClientRect()
      setTextOverlay({ svgX: x, svgY: y, price: clickPrice, idx })
    }
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:2000,
      background:'#0a0f1a', display:'flex', flexDirection:'column',
    }}>
      {/* 상단 헤더 바 */}
      <div style={{
        display:'flex', alignItems:'center', gap:8, flexWrap:'wrap',
        padding:'8px 16px', background:'#0f172a', borderBottom:'1px solid #1e293b', flexShrink:0,
      }}>
        <span style={{fontSize:'15px',fontWeight:700,color:'#f1f5f9',marginRight:4}}>{stock.name}</span>
        <span style={{fontSize:'12px',color:'#475569',fontFamily:'monospace'}}>{stock.code}</span>

        {/* 봉 탭 */}
        <div style={{display:'flex',gap:2,marginLeft:8}}>
          {PERIODS.map(p => (
            <button key={p.type}
              className={`smc-tab ${period===p.type?'active':''}`}
              onClick={() => setPeriod(p.type)}>{p.label}</button>
          ))}
        </div>

        {/* 범위/분봉 탭 */}
        {period === 'min' ? (
          <div style={{display:'flex',gap:2,paddingLeft:8,borderLeft:'1px solid #334155'}}>
            {MIN_SCOPES.map(s => (
              <button key={s} className={`smc-scope-btn ${scope===s?'active':''}`}
                onClick={() => setScope(s)}>{s}분</button>
            ))}
          </div>
        ) : (
          <div style={{display:'flex',gap:2,paddingLeft:8,borderLeft:'1px solid #334155'}}>
            {RANGES.map(r => (
              <button key={r.label} className={`smc-scope-btn ${range===r.months?'active':''}`}
                onClick={() => setRange(r.months)}>{r.label}</button>
            ))}
          </div>
        )}

        {/* MA 토글 */}
        <button className={`smc-ma-btn ${showMA?'active':''}`} onClick={() => setShowMA(v=>!v)}>MA</button>
        {showMA && (
          <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
            {MA_SETTINGS.map(({period:p,color,label}) => (
              <button key={p}
                className={`smc-ma-chip ${enabledMA.has(p)?'active':''}`}
                style={enabledMA.has(p)?{color,borderColor:color,background:color+'18'}:{}}
                onClick={() => toggleMA(p)}>{label}</button>
            ))}
          </div>
        )}

        <button onClick={onClose}
          style={{marginLeft:'auto',background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.3)',
            color:'#f87171',borderRadius:7,padding:'5px 12px',cursor:'pointer',fontSize:12,fontWeight:600}}>
          ✕ 닫기
        </button>
      </div>

      {/* 드로잉 툴바 */}
      <div className="smc-draw-bar">
        {DRAW_TOOLS.map(t => (
          <button key={t.id}
            className={`smc-draw-btn ${drawTool===t.id?'active':''}`}
            onClick={() => { setDrawTool(t.id); setDrawState(null); setSelectedIdx(null) }}>
            {t.label}
          </button>
        ))}
        <div style={{flex:1}}/>
        {selectedIdx !== null && (
          <button className="smc-draw-btn smc-draw-del"
            onClick={() => { saveDrawings(drawings.filter((_,i) => i !== selectedIdx)); setSelectedIdx(null) }}>
            ✕ 선택 삭제
          </button>
        )}
        <button className="smc-draw-btn" style={{color:'#4ade80',borderColor:'#4ade80'}}
          onClick={() => { lsSet(`smc_draw_${stock.code}`, drawings) }} title="저장">💾 저장</button>
        {drawings.length > 0 && (
          <button className="smc-draw-btn smc-draw-del"
            onClick={() => { saveDrawings([]); setDrawState(null); setSelectedIdx(null) }}>🗑 전체삭제</button>
        )}
        {drawState && <span className="smc-draw-hint">{drawTool==='trend'?'2번째 점 클릭':drawTool==='fib'?'끝점 클릭':''}</span>}
      </div>

      {/* 차트 영역 */}
      <div ref={wrapRef} style={{flex:1, overflow:'hidden', position:'relative', background:'#0a0f1a', padding:'8px 0 0'}}>
        {loading && <div className="smc-loading">⟳ 차트 불러오는 중...</div>}
        {error   && <div className="smc-error">⚠️ {error}</div>}
        {!loading && !error && chartData.length > 0 && (<>
          <CandleChart
            data={chartData} width={chartWidth} height={Math.max(400, window.innerHeight - 230)}
            showMA={showMA} enabledMA={enabledMA}
            drawings={drawings} onSvgClick={handleSvgClick} drawTool={drawTool}
            selectedIdx={selectedIdx} onSelectDrawing={setSelectedIdx}
            showSupply={showSupply} supplyData={supplyData} supplyLoading={supplyLoading}
          />
          <VolumeChart data={chartData} width={chartWidth} height={60}/>
          {textOverlay && (
            <div className="smc-text-overlay" style={{
              left: Math.min((textOverlay.svgX / chartWidth)*100, 65) + '%',
              top:  (textOverlay.svgY / (window.innerHeight-230))*100 + '%',
            }}>
              <input autoFocus className="smc-text-overlay-input" placeholder="메모 입력 후 Enter"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (e.target.value.trim()) saveDrawings([...drawings,{type:'text',price:textOverlay.price,idxVal:textOverlay.idx,text:e.target.value.trim()}])
                    setTextOverlay(null); setDrawTool('none')
                  }
                  if (e.key === 'Escape') setTextOverlay(null)
                }}/>
              <button className="smc-text-overlay-cancel" onClick={() => setTextOverlay(null)}>✕</button>
            </div>
          )}
        </>)}
        {!loading && !error && chartData.length === 0 && <div className="smc-empty">데이터가 없습니다</div>}
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
  const [allData,   setAllData]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [priceInfo, setPriceInfo] = useState(null)
  const [activeTab, setActiveTab] = useState('chart') // chart | news | dart

  // 드로잉
  const [drawings,    setDrawings]    = useState(() => stock?.code ? lsGet(`smc_draw_${stock.code}`,[]) : [])
  const [drawTool,    setDrawTool]    = useState('none')
  const [drawState,   setDrawState]   = useState(null)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [textOverlay, setTextOverlay] = useState(null) // {x, y, price, idx}

  // 수급
  const [showSupply,   setShowSupply]   = useState(true)
  const [supplyData,   setSupplyData]   = useState(null)
  const [supplyLoading,setSupplyLoading]= useState(false)

  // AI 팝업
  const [showAI, setShowAI] = useState(false)
  // 전체화면
  const [showFull, setShowFull] = useState(false)

  const wrapRef     = useRef(null)
  const textInputRef= useRef(null)
  const [chartWidth, setChartWidth] = useState(800)

  useEffect(() => {
    const update = () => { if (wrapRef.current) setChartWidth(wrapRef.current.clientWidth) }
    update(); window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') { if (textOverlay) setTextOverlay(null); else if (showFull) setShowFull(false); else if (showAI) setShowAI(false); else onClose() } }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose, textOverlay, showAI])

  // ── 차트 데이터 로드 (타입 수정) ──
  // EC2 server.py 응답 키 매핑
  const DATA_KEY = {
    min:'stk_min_pole_chart_qry', day:'stk_dt_pole_chart_qry',
    week:'stk_stk_pole_chart_qry', month:'stk_mth_pole_chart_qry', year:'stk_yr_pole_chart_qry',
  }

  const fetchChart = useCallback(async () => {
    if (!stock?.code) return
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ type:'stock-chart', period, code: stock.code })
      if (period === 'min') params.set('tic', scope)
      const json = await fetch(`/api/kiwoom?${params}`).then(r => r.json())
      if (json.error) throw new Error(json.error)

      // server.py는 { candles:[...] } 또는 { stk_dt_pole_chart_qry:[...] } 형태로 반환
      let items = json.candles || json[DATA_KEY[period]] || []

      const raw = items.map(c => {
        // candles 형태: { date, open, high, low, close, volume }
        // DATA_KEY 형태: { dt, open_pric, high_pric, low_pric, cur_prc, trde_qty }
        const dateStr = String(c.date || c.dt || c.cntr_tm || '')
        return {
          dateRaw:   dateStr,
          dateLabel: formatDateLabel(dateStr, period),
          open:   Math.abs(parseN(c.open   ?? c.open_pric)),
          high:   Math.abs(parseN(c.high   ?? c.high_pric)),
          low:    Math.abs(parseN(c.low    ?? c.low_pric)),
          close:  Math.abs(parseN(c.close  ?? c.cur_prc)),
          volume: parseN(c.volume ?? c.trde_qty),
        }
      }).filter(c => c.close > 0)

      // DATA_KEY 형태는 최신→과거 순이므로 reverse
      if (!json.candles && json[DATA_KEY[period]]) raw.reverse()

      setAllData(raw)
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [stock?.code, period, scope])

  // ── 현재가 조회 (cur_prc / pred_pre / flu_rt 정규화) ──
  const fetchInfos = useCallback(async () => {
    if (!stock?.code) return
    try {
      const p = await fetch(`/api/kiwoom?type=price&code=${stock.code}`).then(r => r.json())
      if (!p?.error) {
        // EC2는 cur_prc, pred_pre, flu_rt, open_pric, high_pric, low_pric, trde_qty 반환
        // 또는 이미 current, change, changeRate로 정규화된 경우도 처리
        setPriceInfo({
          current:    Math.abs(parseN(p.current    ?? p.cur_prc)),
          change:     parseN(p.change     ?? p.pred_pre),
          changeRate: parseFloat(p.changeRate ?? p.flu_rt ?? 0),
          open:       Math.abs(parseN(p.open       ?? p.open_pric)),
          high:       Math.abs(parseN(p.high       ?? p.high_pric)),
          low:        Math.abs(parseN(p.low        ?? p.low_pric)),
          volume:     parseN(p.volume     ?? p.trde_qty),
        })
      }
    } catch {}
  }, [stock?.code])

  // ── 수급 데이터 로드 ──
  const fetchSupply = useCallback(async () => {
    if (!stock?.code) return
    setSupplyLoading(true)
    try {
      const [foreign, short, strength] = await Promise.allSettled([
        fetch(`/api/kiwoom?type=supply-foreign&code=${stock.code}`).then(r => r.json()),
        fetch(`/api/kiwoom?type=supply-short&code=${stock.code}&days=90`).then(r => r.json()),
        fetch(`/api/kiwoom?type=supply-strength&code=${stock.code}`).then(r => r.json()),
      ])
      const parseSupply = (res, getVal) => {
        if (res.status !== 'fulfilled') return []
        const items = res.value?.items || res.value?.list || res.value?.data || []
        return items.map(d => ({ date: d.dt || d.date || '', value: getVal(d) })).filter(d => d.date).slice(-90)
      }
      setSupplyData({
        foreign:  parseSupply(foreign,  d => parseN(d.for_net_buy_qty || d.for_buy_qty || 0)),
        short:    parseSupply(short,    d => parseFloat(d.shrt_sella_rto || d.shrt_rto || 0)),
        strength: parseSupply(strength, d => parseFloat(d.cntr_str || d.str || 50) - 50),
      })
    } catch(e) { console.warn('supply fetch error', e) }
    finally { setSupplyLoading(false) }
  }, [stock?.code])

  useEffect(() => { fetchChart() }, [fetchChart])
  useEffect(() => { fetchInfos() }, [fetchInfos])
  useEffect(() => { if (showSupply && !supplyData && stock?.code) fetchSupply() }, [showSupply, supplyData, fetchSupply, stock?.code])

  // ── 드로잉 저장 ──
  const saveDrawings = (next) => {
    setDrawings(next)
    if (stock?.code) lsSet(`smc_draw_${stock.code}`, next)
  }

  // ── SVG 클릭 핸들러 ──
  function handleSvgClick({ x, y, price: clickPrice, idx, bx: bxFn }) {
    if (drawTool === 'none') return

    if (drawTool === 'hline') {
      saveDrawings([...drawings, { type:'hline', price: clickPrice }])
    }
    else if (drawTool === 'split3') {
      const prices = allData.map(d => d.close).filter(Boolean)
      if (!prices.length) return
      const lo = Math.min(...prices), hi = Math.max(...prices)
      const r  = hi - lo
      saveDrawings([...drawings,
        { type:'split3_a', price: lo + r/3, color:'#06b6d4' },
        { type:'split3_b', price: lo + r*2/3, color:'#06b6d4' },
      ])
      setDrawTool('none')
    }
    else if (drawTool === 'split4') {
      const prices = allData.map(d => d.close).filter(Boolean)
      if (!prices.length) return
      const lo = Math.min(...prices), hi = Math.max(...prices)
      const r  = hi - lo
      saveDrawings([...drawings,
        { type:'split4_a', price: lo + r*0.25, color:'#f472b6' },
        { type:'split4_b', price: lo + r*0.50, color:'#f472b6' },
        { type:'split4_c', price: lo + r*0.75, color:'#f472b6' },
      ])
      setDrawTool('none')
    }
    else if (drawTool === 'trend' || drawTool === 'fib') {
      if (!drawState) {
        setDrawState({ x1:x, y1:y, price1: clickPrice })
      } else {
        if (drawTool === 'trend') {
          saveDrawings([...drawings, { type:'trend', x1:drawState.x1, y1:drawState.y1, x2:x, y2:y }])
        } else {
          saveDrawings([...drawings, { type:'fib', x1:drawState.x1, y1:drawState.y1, x2:x, y2:y, price1:drawState.price1, price2:clickPrice }])
        }
        setDrawState(null)
      }
    }
    else if (drawTool === 'text') {
      // 차트 위에 입력창 오버레이
      const rect = wrapRef.current?.getBoundingClientRect()
      setTextOverlay({
        svgX: x, svgY: y, price: clickPrice, idx,
        screenX: rect ? (x / chartWidth) * rect.width + rect.left : 0,
        screenY: rect ? (y / 380)  * rect.height + rect.top  : 0,
      })
    }
  }

  function submitText(text) {
    if (text.trim() && textOverlay) {
      saveDrawings([...drawings, {
        type:'text', price: textOverlay.price, idxVal: textOverlay.idx, text: text.trim()
      }])
    }
    setTextOverlay(null)
    setDrawTool('none')
  }

  const toggleMA = p => setEnabledMA(prev => {
    const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n
  })

  if (!stock) return null

  const chartData = period === 'min' ? allData : filterByRange(allData, range)
  const isUp = (priceInfo?.change ?? 0) > 0
  const isDown = (priceInfo?.change ?? 0) < 0
  const pc   = isUp ? '#ef4444' : isDown ? '#3b82f6' : '#1e293b'
  const sign = isUp ? '+' : ''

  // 정보 바 아이템
  const infoItems = [
    {label:'현재가',  value: priceInfo?.current ? fmtN(priceInfo.current)+'원' : '-', color: pc},
    {label:'등락률',  value: priceInfo?.changeRate ? sign+Number(priceInfo.changeRate).toFixed(2)+'%' : '-', color: pc},
    {label:'거래량',  value: priceInfo?.volume ? fmtShort(priceInfo.volume) : '-'},
    {label:'시가',    value: priceInfo?.open   ? fmtN(priceInfo.open)+'원'  : '-'},
    {label:'고가',    value: priceInfo?.high   ? fmtN(priceInfo.high)+'원'  : '-', color:'#ef4444'},
    {label:'저가',    value: priceInfo?.low    ? fmtN(priceInfo.low)+'원'   : '-', color:'#3b82f6'},
  ]

  return (
    <div className="smc-overlay" onClick={e => { if (e.target===e.currentTarget) onClose() }}>
      <div className="smc-modal">

        {/* ── 헤더 ── */}
        <div className="smc-header">
          <div className="smc-title-wrap">
            <span className="smc-name">{stock.name}</span>
            <span className="smc-code">{stock.code}</span>
            {priceInfo?.current && (
              <div className="smc-price-wrap">
                <span className="smc-cur-price" style={{color:pc}}>{fmtN(priceInfo.current)}원</span>
                <span className="smc-change" style={{color:pc}}>
                  {sign}{fmtN(priceInfo.change)}원 ({sign}{Number(priceInfo.changeRate||0).toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
            {/* 탭 스위치 */}
            <div className="smc-tab-switch">
              <button className={`smc-tab-sw-btn ${activeTab==='chart'?'active':''}`} onClick={()=>setActiveTab('chart')}>📈 차트</button>
              <button className={`smc-tab-sw-btn ${activeTab==='news'?'active':''}`}  onClick={()=>setActiveTab('news')}>📰 뉴스</button>
              <button className={`smc-tab-sw-btn ${activeTab==='dart'?'active':''}`}  onClick={()=>setActiveTab('dart')}>📋 공시</button>
            </div>
            {/* AI 분석 버튼 */}
            <button className="smc-tab-sw-btn smc-ai-btn" onClick={() => setShowAI(true)} title="AI 분석">🤖 AI</button>
            <button className="smc-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── 차트 탭 ── */}
        {activeTab === 'chart' && (<>
          {/* 컨트롤 바 */}
          <div className="smc-controls">
            <div className="smc-period-tabs">
              {PERIODS.map(p => (
                <button key={p.type} className={`smc-tab ${period===p.type?'active':''}`}
                  onClick={() => setPeriod(p.type)}>{p.label}</button>
              ))}
            </div>
            {period === 'min' ? (
              <div className="smc-scope-wrap">
                {MIN_SCOPES.map(s => (
                  <button key={s} className={`smc-scope-btn ${scope===s?'active':''}`}
                    onClick={() => setScope(s)}>{s}분</button>
                ))}
              </div>
            ) : (
              <div className="smc-range-wrap">
                {RANGES.map(r => (
                  <button key={r.label} className={`smc-scope-btn ${range===r.months?'active':''}`}
                    onClick={() => setRange(r.months)}>{r.label}</button>
                ))}
              </div>
            )}
            <button className={`smc-ma-btn ${showMA?'active':''}`} onClick={() => setShowMA(v=>!v)}>MA</button>
            {showMA && (
              <div className="smc-ma-legend">
                {MA_SETTINGS.map(({period:p,color,label}) => (
                  <button key={p}
                    className={`smc-ma-chip ${enabledMA.has(p)?'active':''}`}
                    style={enabledMA.has(p) ? {color,borderColor:color,background:color+'18'} : {}}
                    onClick={() => toggleMA(p)}>{label}</button>
                ))}
              </div>
            )}
            <button
              className={`smc-scope-btn ${showSupply?'active':''}`}
              style={{marginLeft:'auto'}}
              onClick={() => setShowSupply(v => !v)}
            >📊 수급</button>
            <button
              className="smc-scope-btn"
              onClick={() => setShowFull(true)}
              title="전체화면 차트"
            >⛶ 전체화면</button>
          </div>

          {/* 드로잉 툴바 */}
          <div className="smc-draw-bar">
            {DRAW_TOOLS.map(t => (
              <button key={t.id}
                className={`smc-draw-btn ${drawTool===t.id?'active':''}`}
                onClick={() => { setDrawTool(t.id); setDrawState(null); setSelectedIdx(null) }}>
                {t.label}
              </button>
            ))}

            <div style={{flex:1}}/>

            {/* 선택된 드로잉 개별 삭제 */}
            {selectedIdx !== null && (
              <button className="smc-draw-btn smc-draw-del"
                onClick={() => {
                  saveDrawings(drawings.filter((_,i) => i !== selectedIdx))
                  setSelectedIdx(null)
                }}>✕ 선택 삭제</button>
            )}

            {/* 저장/전체삭제 */}
            <button className="smc-draw-btn"
              style={{color:'#4ade80', borderColor:'#4ade80'}}
              onClick={() => { lsSet(`smc_draw_${stock.code}`, drawings) }}
              title="현재 드로잉 저장">💾 저장</button>

            {drawings.length > 0 && (
              <button className="smc-draw-btn smc-draw-del"
                onClick={() => { saveDrawings([]); setDrawState(null); setSelectedIdx(null) }}>
                🗑 전체삭제
              </button>
            )}

            {drawState && (
              <span className="smc-draw-hint">
                {drawTool==='trend'?'2번째 점 클릭':drawTool==='fib'?'끝점 클릭':''}
              </span>
            )}
            {drawings.length > 0 && (
              <span className="smc-draw-saved">{drawings.length}개</span>
            )}
          </div>

          {/* 차트 영역 */}
          <div className="smc-chart-wrap" ref={wrapRef} style={{position:'relative'}}>
            {loading && <div className="smc-loading">⟳ 차트 불러오는 중...</div>}
            {error   && <div className="smc-error">⚠️ {error}</div>}
            {!loading && !error && chartData.length > 0 && (<>
              <CandleChart
                data={chartData} width={chartWidth} height={320}
                showMA={showMA} enabledMA={enabledMA}
                drawings={drawings} onSvgClick={handleSvgClick} drawTool={drawTool}
                selectedIdx={selectedIdx} onSelectDrawing={setSelectedIdx}
                showSupply={showSupply} supplyData={supplyData} supplyLoading={supplyLoading}
              />
              <VolumeChart data={chartData} width={chartWidth} height={60}/>

              {/* 텍스트 입력 오버레이 (차트 위 floating) */}
              {textOverlay && (
                <div className="smc-text-overlay" style={{
                  left: Math.min((textOverlay.svgX / chartWidth)*100, 65) + '%',
                  top:  (textOverlay.svgY / 380)*100 + '%',
                }}>
                  <input
                    ref={textInputRef}
                    autoFocus
                    className="smc-text-overlay-input"
                    placeholder="메모 입력 후 Enter"
                    onKeyDown={e => {
                      if (e.key === 'Enter') submitText(e.target.value)
                      if (e.key === 'Escape') setTextOverlay(null)
                    }}
                  />
                  <button className="smc-text-overlay-cancel" onClick={() => setTextOverlay(null)}>✕</button>
                </div>
              )}
            </>)}
            {!loading && !error && chartData.length === 0 && (
              <div className="smc-empty">데이터가 없습니다</div>
            )}
          </div>
        </>)}

        {/* ── 뉴스 탭 ── */}
        {activeTab === 'news' && <NewsPanel stock={stock}/>}

        {/* ── 공시 탭 ── */}
        {activeTab === 'dart' && <DartPanel stock={stock}/>}

        {/* ── 정보 바 (공시/뉴스 버튼 제거) ── */}
        <div className="smc-info-bar">
          {infoItems.map(item => (
            <div key={item.label} className="smc-info-item">
              <span className="smc-info-label">{item.label}</span>
              <span className="smc-info-value" style={{color:item.color}}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 전체화면 차트 */}
      {showFull && (
        <FullScreenChart
          stock={stock}
          period={period} scope={scope} range={range}
          showMA={showMA} enabledMA={enabledMA}
          drawings={drawings} saveDrawings={saveDrawings}
          showSupply={showSupply} supplyData={supplyData} supplyLoading={supplyLoading}
          onClose={() => setShowFull(false)}
        />
      )}

      {/* AI 분석 팝업 */}
      {showAI && <AiPopup stock={stock} onClose={() => setShowAI(false)}/>}
    </div>
  )
}
