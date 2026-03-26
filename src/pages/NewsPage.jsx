import { useState, useEffect, useCallback } from 'react'
import './NewsPage.css'

const THEMES = [
  { id:'all',     label:'전체',        keyword:'한국 증시 오늘 주요 뉴스' },
  { id:'semi',    label:'반도체·AI',   keyword:'반도체 AI HBM SK하이닉스 삼성전자 주식 뉴스' },
  { id:'defense', label:'방산',        keyword:'방산 한화에어로 현대로템 K방산 수출 뉴스' },
  { id:'ship',    label:'조선',        keyword:'조선 HD현대중공업 삼성중공업 수주 뉴스' },
  { id:'nuclear', label:'원전·전력',   keyword:'원전 두산에너빌리티 효성중공업 SMR 전력 뉴스' },
  { id:'battery', label:'2차전지',     keyword:'2차전지 배터리 LG에너지솔루션 ESS 뉴스' },
  { id:'bio',     label:'바이오',      keyword:'바이오 셀트리온 삼성바이오 임상 뉴스' },
  { id:'value',   label:'밸류업·금융', keyword:'밸류업 KB금융 신한지주 배당 금융 뉴스' },
]

const REPORT_LINKS = [
  { label:'증권사 투자분석 리포트', url:'https://finance.naver.com/research/invest_list.naver',    icon:'📈' },
  { label:'산업 분석 리포트',       url:'https://finance.naver.com/research/industry_list.naver',  icon:'🏭' },
  { label:'경제 분석 리포트',       url:'https://finance.naver.com/research/economy_list.naver',   icon:'🌐' },
  { label:'채권 분석 리포트',       url:'https://finance.naver.com/research/debenture_list.naver', icon:'📑' },
]

const REPORT_COLORS = {
  '사업보고서': '#2563eb', '분기보고서': '#2563eb', '반기보고서': '#2563eb',
  '주요사항보고서': '#dc2626', '증권신고서': '#d97706',
  '임원·주요주주': '#7c3aed', '주식대량보유': '#0d9488',
}
function getReportColor(name) {
  for (const [key, color] of Object.entries(REPORT_COLORS)) {
    if (name?.includes(key.slice(0, 4))) return color
  }
  return '#64748b'
}
function formatDate(str) {
  if (!str || str.length < 8) return str
  return `${str.slice(0,4)}.${str.slice(4,6)}.${str.slice(6,8)}`
}
function today() { return new Date().toISOString().slice(0,10).replace(/-/g,'') }
function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate()-n)
  return d.toISOString().slice(0,10).replace(/-/g,'')
}
function parseNum(s) { if (!s) return 0; return parseInt(String(s).replace(/[^0-9-]/g,''))||0 }

// AI 뉴스 검색
async function fetchNewsAI(apiKey, theme) {
  const todayStr = new Date().toLocaleDateString('ko-KR')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content:
        `웹 검색을 사용해서 오늘(${todayStr}) 한국 증시 "${theme.label}" 테마의 최신 뉴스를 찾아보고, 아래 형식으로 요약해줘.\n\n검색 키워드: ${theme.keyword}\n\n## 📰 오늘의 주요 뉴스 (3~5개)\n1. [뉴스 제목] — 핵심 내용 한줄\n2. ...\n\n## 💡 투자자 관점 요약\n(이 뉴스들이 주가에 미치는 영향 2~3줄)\n\n## ⚠️ 주의 뉴스\n(리스크 관련 뉴스가 있으면 언급, 없으면 생략)\n\n반드시 웹 검색으로 실제 최신 뉴스를 찾아서 작성해줘.`
      }],
    }),
  })
  if (!res.ok) throw new Error(`API 오류 ${res.status}`)
  const data = await res.json()
  const text = data.content.filter(b=>b.type==='text').map(b=>b.text).join('\n')
  if (!text.trim()) throw new Error('뉴스 검색 결과를 가져오지 못했어요.')
  return text
}

const STORAGE_KEY = 'kstock_news_ai'
function loadNewsAI() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const { date, data } = JSON.parse(raw)
    if (date !== new Date().toLocaleDateString('ko-KR')) { localStorage.removeItem(STORAGE_KEY); return {} }
    return data || {}
  } catch { return {} }
}
function saveNewsAI(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: new Date().toLocaleDateString('ko-KR'), data })) } catch {}
}

export default function NewsPage() {
  const [activeTheme, setAt] = useState('all')
  const [aiCache, setCache]  = useState(() => loadNewsAI())
  const [aiLoading, setAiL]  = useState(false)
  const [aiError, setAiE]    = useState('')
  const [activeTab, setTab]  = useState('news')

  const theme    = THEMES.find(t => t.id === activeTheme)
  const analysis = aiCache[theme.id]

  const handleAI = async () => {
    if (aiLoading) return
    setAiL(true); setAiE('')
    try {
      const key = import.meta.env.VITE_CLAUDE_API_KEY
      if (!key) throw new Error('Claude API 키가 없어요.')
      const text = await fetchNewsAI(key, theme)
      const next = { ...aiCache, [theme.id]: text }
      setCache(next); saveNewsAI(next)
    } catch(e) { setAiE(e.message) }
    finally { setAiL(false) }
  }

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">뉴스 · 공시</h1>
          <p className="page-sub">실시간 뉴스 · DART 공시 · 증권사 리포트</p>
        </div>
      </div>
      <div className="page-body">

        <div className="tab-bar">
          {[{id:'news',label:'📰 뉴스'},{id:'dart',label:'📋 DART 공시'},{id:'report',label:'📊 리포트'}].map(t=>(
            <button key={t.id} className={`tab-btn ${activeTab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {activeTab === 'news' && (
          <>
            <div className="card-section">
              <div className="section-title-row">
                <span className="section-title">테마 선택</span>
                <button className="btn-ai btn-ai--sm" onClick={handleAI} disabled={aiLoading}>
                  {aiLoading ? <><span className="btn-spinner"/>검색 중...</> : analysis ? '↺ 다시받기' : '🔍 AI 뉴스검색'}
                </button>
              </div>
              <div className="news-theme-chips">
                {THEMES.map(t=>(
                  <button key={t.id} className={`news-theme-chip ${activeTheme===t.id?'active':''}`}
                    onClick={()=>{setAt(t.id);setAiE('')}}>
                    {t.label}
                    {aiCache[t.id] && <span className="news-cached-dot"/>}
                  </button>
                ))}
              </div>
            </div>

            <div className="card-section">
              <div className="section-title">{theme.label} — AI 웹검색 뉴스요약</div>
              {aiError && <div className="ai-error">{aiError}</div>}
              {aiLoading && <div className="ai-loading"><div className="spinner-lg"/><p>🔍 웹에서 {theme.label} 최신 뉴스 검색 중...</p></div>}
              {analysis && !aiLoading && (
                <div className="ai-result">
                  <div className="news-ai-badge">🔍 웹 검색 기반 · 오늘 저장됨</div>
                  <pre>{analysis}</pre>
                </div>
              )}
              {!analysis && !aiLoading && !aiError && (
                <div className="ai-placeholder">
                  <div className="ai-placeholder-icon">🔍</div>
                  <p><strong>AI 뉴스검색</strong> 버튼을 눌러보세요</p>
                  <p className="sub">웹을 실시간으로 검색해서 {theme.label} 최신 뉴스를 요약해드려요<br/>오늘 검색 결과는 자동 저장됩니다</p>
                </div>
              )}
            </div>

            <div className="card-section">
              <div className="section-title">네이버 뉴스 직접 보기</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:'8px'}}>
                {THEMES.map(t=>(
                  <a key={t.id}
                    href={`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(t.keyword)}&sort=1`}
                    target="_blank" rel="noreferrer" className="news-link-chip">
                    {t.label} →
                  </a>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'dart' && <DartTab />}

        {activeTab === 'report' && (
          <div className="card-section">
            <div className="section-title">증권사 리포트</div>
            <div className="card-grid">
              {REPORT_LINKS.map(l=>(
                <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="dart-card">
                  <span className="dart-icon">{l.icon}</span>
                  <span className="dart-label">{l.label}</span>
                  <span className="dart-arrow">→</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── DART 탭 ──
function DartTab() {
  const [portfolioStocks, setPortfolioStocks] = useState([])  // 보유종목
  const [selectedStock, setSelectedStock]     = useState(null) // 선택된 종목
  const [disclosures, setDisclosures]         = useState([])
  const [loading, setLoading]                 = useState(false)
  const [error, setError]                     = useState(null)
  const [searchQ, setSearchQ]                 = useState('')
  const [bgn, setBgn]                         = useState(daysAgo(30))
  const [end, setEnd]                         = useState(today())
  const [page, setPage]                       = useState(1)
  const [total, setTotal]                     = useState(0)
  const [mode, setMode]                       = useState('all') // portfolio | search | all

  // 보유종목 불러오기
  useEffect(() => {
    const fetchPortfolio = async () => {
      try {
        const res  = await fetch('/api/kiwoom?type=account-holdings')
        const data = await res.json()
        if (!data.error) {
          const stocks = (data.holdings || []).map(s => ({
            code: s.stk_cd,
            name: s.stk_nm,
          }))
          setPortfolioStocks(stocks)
          if (stocks.length > 0) {
            setSelectedStock(stocks[0])
          }
        }
      } catch {}
    }
    fetchPortfolio()
  }, [])

  // 선택 종목 공시 불러오기
  const fetchByStock = useCallback(async (stock) => {
    if (!stock) return
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({
        type: 'corp_list',
        corp_name: stock.name,
        bgn_de: bgn,
        end_de: end,
        page,
      })
      const res  = await fetch(`/api/dart?${params}`)
      const data = await res.json()
      if (data.status === '000') {
        setDisclosures(data.list || [])
        setTotal(data.total_count || 0)
      } else {
        setDisclosures([]); setTotal(0)
      }
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [bgn, end, page])

  // 전체 공시 불러오기
  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ type: 'list', bgn_de: bgn, end_de: end, page })
      const res  = await fetch(`/api/dart?${params}`)
      const data = await res.json()
      if (data.status === '000') {
        setDisclosures(data.list || [])
        setTotal(data.total_count || 0)
      } else {
        setDisclosures([]); setTotal(0)
      }
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [bgn, end, page])

  // 모드/선택 변경 시 자동 조회
  useEffect(() => {
    if (mode === 'portfolio' && selectedStock) fetchByStock(selectedStock)
    else if (mode === 'all') fetchAll()
  }, [mode, selectedStock, fetchByStock, fetchAll])

  // 종목명 검색
  const handleSearch = async () => {
    if (!searchQ.trim()) return
    setMode('search'); setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({
        type: 'corp_list',
        corp_name: searchQ,
        bgn_de: daysAgo(90),
        end_de: today(),
        page: '1',
      })
      const res  = await fetch(`/api/dart?${params}`)
      const data = await res.json()
      if (data.status === '000') {
        setDisclosures(data.list || [])
        setTotal(data.total_count || 0)
      } else {
        setDisclosures([]); setTotal(0)
      }
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const selectStock = (stock) => {
    setSelectedStock(stock)
    setMode('portfolio')
    setPage(1)
  }

  const title = mode === 'portfolio' && selectedStock
    ? `${selectedStock.name} 공시`
    : mode === 'search'
    ? `"${searchQ}" 검색 결과`
    : '전체 공시'

  return (
    <>
      {/* 보유종목 탭 + 검색 */}
      <div className="card-section">
        <div className="dart-top-bar">
          {/* 보유종목 칩 */}
          {portfolioStocks.length > 0 && (
            <div className="dart-stock-chips">
              <span className="dart-chips-label">보유종목</span>
              {portfolioStocks.map(s => (
                <button key={s.code}
                  className={`dart-stock-chip ${mode === 'portfolio' && selectedStock?.code === s.code ? 'active' : ''}`}
                  onClick={() => selectStock(s)}>
                  {s.name}
                </button>
              ))}
              <button
                className={`dart-stock-chip ${mode === 'all' ? 'active' : ''}`}
                onClick={() => { setMode('all'); setPage(1) }}>
                전체 공시
              </button>
            </div>
          )}

          {/* 검색 */}
          <div className="dart-search-wrap">
            <input
              className="dart-search-input"
              placeholder="다른 종목 공시 검색..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <button className="btn-ai btn-ai--sm" onClick={handleSearch} disabled={loading}>검색</button>
          </div>
        </div>

        {/* 날짜 필터 (portfolio/all 모드) */}
        {mode !== 'search' && (
          <div className="dart-date-bar">
            <span style={{fontSize:'12px',color:'var(--text-secondary)'}}>기간</span>
            <input type="date" className="dart-date-input"
              value={bgn.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3')}
              onChange={e => { setBgn(e.target.value.replace(/-/g,'')); setPage(1) }} />
            <span style={{color:'var(--text-dim)'}}>~</span>
            <input type="date" className="dart-date-input"
              value={end.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3')}
              onChange={e => { setEnd(e.target.value.replace(/-/g,'')); setPage(1) }} />
          </div>
        )}
      </div>

      {/* 공시 리스트 */}
      <div className="card-section">
        <div className="section-title-row">
          <span className="section-title">{title}</span>
          <span style={{fontSize:'12px',color:'var(--text-secondary)'}}>총 {total.toLocaleString()}건</span>
        </div>

        {error && <div className="ai-error">⚠️ {error}</div>}
        {loading && <div className="ai-loading"><div className="spinner-lg"/><p>공시 조회 중...</p></div>}

        {!loading && disclosures.length === 0 && !error && (
          <div className="ai-placeholder">
            <div className="ai-placeholder-icon">📋</div>
            <p>공시 내역이 없습니다</p>
            <p className="sub">날짜 범위를 조정하거나 다른 종목을 검색해보세요</p>
          </div>
        )}

        {!loading && disclosures.length > 0 && (
          <div className="dart-list">
            {disclosures.map((d, i) => {
              const color = getReportColor(d.report_nm)
              const dartUrl = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d.rcept_no}`
              return (
                <a key={i} href={dartUrl} target="_blank" rel="noreferrer" className="dart-item">
                  <div className="dart-item-left">
                    <span className="dart-report-badge" style={{background:color+'18',color}}>
                      {d.report_nm?.length > 15 ? d.report_nm.slice(0,15)+'…' : d.report_nm}
                    </span>
                    <div className="dart-corp-name">{d.corp_name}</div>
                    <div className="dart-submitter">{d.flr_nm}</div>
                  </div>
                  <div className="dart-item-right">
                    <span className="dart-date">{formatDate(d.rcept_dt)}</span>
                    <span className="dart-arrow">→</span>
                  </div>
                </a>
              )
            })}
          </div>
        )}

        {/* 페이지네이션 */}
        {total > 20 && (
          <div className="dart-pagination">
            <button className="dart-page-btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← 이전</button>
            <span style={{fontSize:'13px',color:'var(--text-secondary)'}}>{page} / {Math.ceil(total/20)}페이지</span>
            <button className="dart-page-btn" disabled={page>=Math.ceil(total/20)} onClick={()=>setPage(p=>p+1)}>다음 →</button>
          </div>
        )}
      </div>

      {/* DART 바로가기 */}
      <div className="card-section">
        <div className="section-title">DART 바로가기</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'8px'}}>
          {[
            {label:'오늘 전체 공시',     url:'https://dart.fss.or.kr/dsac999/mainY.do',icon:'📋'},
            {label:'주요사항 보고서',    url:'https://dart.fss.or.kr/dsab007/detailSearch.ax?reportNm=주요사항보고서',icon:'⚠️'},
            {label:'분기·반기·사업보고', url:'https://dart.fss.or.kr/dsab007/detailSearch.ax?reportNm=분기보고서',icon:'📊'},
            {label:'대량보유 보고',      url:'https://dart.fss.or.kr/dsab007/detailSearch.ax?reportNm=주식대량보유',icon:'📦'},
            {label:'임원 주식변동',      url:'https://dart.fss.or.kr/dsab007/detailSearch.ax?reportNm=임원주요주주',icon:'👔'},
            {label:'유상증자 공시',      url:'https://dart.fss.or.kr/dsab007/detailSearch.ax?reportNm=증권신고서',icon:'💰'},
          ].map(l=>(
            <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="dart-card">
              <span className="dart-icon">{l.icon}</span>
              <span className="dart-label">{l.label}</span>
              <span className="dart-arrow">→</span>
            </a>
          ))}
        </div>
      </div>
    </>
  )
}
