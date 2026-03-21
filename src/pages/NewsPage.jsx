import { useState } from 'react'
import './NewsPage.css'

const THEMES = [
  { id:'all',     label:'전체',       keyword:'주식 증시' },
  { id:'semi',    label:'반도체·AI',  keyword:'반도체 AI HBM SK하이닉스 삼성전자' },
  { id:'defense', label:'방산',       keyword:'방산 한화에어로 현대로템 K방산' },
  { id:'ship',    label:'조선',       keyword:'조선 HD현대중공업 삼성중공업 수주' },
  { id:'nuclear', label:'원전·전력',  keyword:'원전 두산에너빌리티 효성중공업 SMR' },
  { id:'battery', label:'2차전지',    keyword:'2차전지 배터리 LG에너지솔루션 ESS' },
  { id:'bio',     label:'바이오',     keyword:'바이오 셀트리온 삼성바이오 임상' },
  { id:'value',   label:'밸류업·금융',keyword:'밸류업 KB금융 신한지주 배당 저PBR' },
]

const DART_LINKS = [
  { label:'오늘 전체 공시',    url:'https://dart.fss.or.kr/dsac999/mainY.do',                                icon:'📋' },
  { label:'주요사항 보고서',   url:'https://dart.fss.or.kr/dsab007/detailSearch.ax?reportNm=주요사항보고서', icon:'⚠️' },
  { label:'분기·반기·사업보고',url:'https://dart.fss.or.kr/dsab007/detailSearch.ax?reportNm=분기보고서',    icon:'📊' },
  { label:'대량보유 보고',     url:'https://dart.fss.or.kr/dsab007/detailSearch.ax?reportNm=주식대량보유',  icon:'📦' },
  { label:'임원 주식변동',     url:'https://dart.fss.or.kr/dsab007/detailSearch.ax?reportNm=임원주요주주',  icon:'👔' },
  { label:'유상증자 공시',     url:'https://dart.fss.or.kr/dsab007/detailSearch.ax?reportNm=증권신고서',    icon:'💰' },
]

const REPORT_LINKS = [
  { label:'증권사 투자분석 리포트', url:'https://finance.naver.com/research/invest_list.naver',    icon:'📈' },
  { label:'산업 분석 리포트',       url:'https://finance.naver.com/research/industry_list.naver',  icon:'🏭' },
  { label:'경제 분석 리포트',       url:'https://finance.naver.com/research/economy_list.naver',   icon:'🌐' },
  { label:'채권 분석 리포트',       url:'https://finance.naver.com/research/debenture_list.naver', icon:'📑' },
]

async function fetchNewsAI(apiKey, theme) {
  const today = new Date().toLocaleDateString('ko-KR')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:700, messages:[{ role:'user', content:
      `오늘(${today}) 한국 증시 "${theme.label}" 관련 주요 뉴스를 아래 형식으로 정리해줘.\n\n📰 오늘의 주요 뉴스 헤드라인 (3~5개)\n1. [뉴스 제목 요약] — 핵심 내용 한줄\n2. ...\n\n💡 투자자 관점 요약\n(이 뉴스들이 주가에 미치는 영향 2~3줄)\n\n⚠️ 주의 뉴스\n(리스크 관련 뉴스가 있으면 언급)\n\n최신 시장 흐름 기반으로 구체적으로 작성해줘. "실시간 데이터 없음" 같은 말은 하지 마.`
    }]})
  })
  if (!res.ok) throw new Error(`API 오류 ${res.status}`)
  const data = await res.json()
  return data.content[0].text
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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ date:new Date().toLocaleDateString('ko-KR'), data })) } catch {}
}

export default function NewsPage() {
  const [activeTheme, setAt] = useState('all')
  const [aiCache, setCache]  = useState(() => loadNewsAI())
  const [aiLoading, setAiL]  = useState(false)
  const [aiError, setAiE]    = useState('')
  const [activeTab, setTab]  = useState('news')

  const theme = THEMES.find(t => t.id === activeTheme)

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

  const analysis = aiCache[theme.id]

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">뉴스 · 공시</h1>
          <p className="page-sub">실시간 뉴스 · DART 공시 · 증권사 리포트</p>
        </div>
      </div>
      <div className="page-body">

        {/* 탭 */}
        <div className="tab-bar">
          {[{id:'news',label:'📰 뉴스'},{id:'dart',label:'📋 DART 공시'},{id:'report',label:'📊 리포트'}].map(t=>(
            <button key={t.id} className={`tab-btn ${activeTab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* 뉴스 탭 */}
        {activeTab === 'news' && (
          <>
            {/* 테마 선택 */}
            <div className="card-section">
              <div className="section-title-row">
                <span className="section-title">테마 선택</span>
                <button className="btn-ai btn-ai--sm" onClick={handleAI} disabled={aiLoading}>
                  {aiLoading?<><span className="btn-spinner"/>분석중</>:analysis?'↺ 다시받기':'✦ AI 뉴스요약'}
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

            {/* AI 뉴스 요약 */}
            <div className="card-section">
              <div className="section-title">{theme.label} — AI 뉴스 요약</div>
              {aiError && <div className="ai-error">{aiError}</div>}
              {aiLoading && <div className="ai-loading"><div className="spinner-lg"/><p>뉴스 분석 중...</p></div>}
              {analysis && !aiLoading && <div className="ai-result"><pre>{analysis}</pre></div>}
              {!analysis && !aiLoading && !aiError && (
                <div className="ai-placeholder">
                  <div className="ai-placeholder-icon">📰</div>
                  <p>AI 뉴스요약 버튼을 눌러 {theme.label} 관련 뉴스를 정리받아보세요</p>
                  <p className="sub">오늘 분석은 저장되어 새로고침해도 유지됩니다</p>
                </div>
              )}
            </div>

            {/* 네이버 뉴스 바로가기 */}
            <div className="card-section">
              <div className="section-title">네이버 뉴스 바로가기</div>
              <div className="card-grid--sm" style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:'8px'}}>
                {THEMES.map(t=>(
                  <a key={t.id}
                    href={`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(t.keyword)}&sort=1`}
                    target="_blank" rel="noreferrer"
                    className="news-link-chip">
                    {t.label} →
                  </a>
                ))}
              </div>
            </div>
          </>
        )}

        {/* DART 공시 탭 */}
        {activeTab === 'dart' && (
          <>
            <div className="card-section">
              <div className="section-title">DART 공시 바로가기</div>
              <div className="card-grid">
                {DART_LINKS.map(l=>(
                  <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="dart-card">
                    <span className="dart-icon">{l.icon}</span>
                    <span className="dart-label">{l.label}</span>
                    <span className="dart-arrow">→</span>
                  </a>
                ))}
              </div>
            </div>
            <div className="card-section">
              <div className="section-title">종목 공시 검색</div>
              <NewsSearch />
            </div>
          </>
        )}

        {/* 리포트 탭 */}
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

function NewsSearch() {
  const [q, setQ] = useState('')
  const search = () => {
    if (!q.trim()) return
    window.open(`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(q)}`, '_blank')
  }
  return (
    <div className="news-search">
      <input className="news-search-input" placeholder="회사명 또는 종목코드 입력" value={q}
        onChange={e=>setQ(e.target.value)}
        onKeyDown={e=>e.key==='Enter'&&search()} />
      <button className="btn-ai" onClick={search}>DART 검색 →</button>
    </div>
  )
}
