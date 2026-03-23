import { useState, useEffect, useCallback } from 'react'
import './DashboardPage.css'

// ─── 상수 ────────────────────────────────────────────
const THEMES = [
  { id:'semi',    label:'반도체·AI',  color:'#2563eb', emoji:'💻', stocks:['삼성전자','SK하이닉스','한미반도체'], codes:['005930','000660','042700'] },
  { id:'defense', label:'방산',        color:'#dc2626', emoji:'🛡️', stocks:['한화에어로','현대로템','LIG넥스원'],   codes:['012450','064350','079550'] },
  { id:'ship',    label:'조선',        color:'#0d9488', emoji:'🚢', stocks:['HD현대중공업','삼성중공업','한화오션'],  codes:['329180','010140','042660'] },
  { id:'nuclear', label:'원전·전력',   color:'#d97706', emoji:'⚡', stocks:['두산에너빌리티','효성중공업','일진전기'], codes:['034020','298040','103590'] },
  { id:'battery', label:'2차전지',     color:'#16a34a', emoji:'🔋', stocks:['LG에너지솔루션','삼성SDI','POSCO홀딩스'], codes:['373220','006400','005490'] },
  { id:'bio',     label:'바이오',      color:'#7c3aed', emoji:'🧬', stocks:['셀트리온','삼성바이오','HLB'],          codes:['068270','207940','028300'] },
  { id:'value',   label:'밸류업·금융', color:'#ea580c', emoji:'🏦', stocks:['KB금융','신한지주','하나금융'],          codes:['105560','055550','086790'] },
]

const QUICK_LINKS = [
  { label:'네이버 증권',  url:'https://finance.naver.com',                                                   icon:'📊' },
  { label:'KRX 시장정보', url:'https://data.krx.co.kr',                                                      icon:'🏛️' },
  { label:'DART 공시',    url:'https://dart.fss.or.kr',                                                      icon:'📋' },
  { label:'한국은행',     url:'https://www.bok.or.kr',                                                       icon:'🏦' },
  { label:'코스피 지수',  url:'https://finance.naver.com/sise/sise_index.naver?code=KOSPI',                  icon:'📈' },
  { label:'코스닥 지수',  url:'https://finance.naver.com/sise/sise_index.naver?code=KOSDAQ',                 icon:'📉' },
]

const GLOBAL_LINKS = [
  { label:'S&P 500',     url:'https://finance.naver.com/world/sise.naver?symbol=SPX',  color:'#dc2626' },
  { label:'NASDAQ',      url:'https://finance.naver.com/world/sise.naver?symbol=COMP', color:'#0d9488' },
  { label:'DOW',         url:'https://finance.naver.com/world/sise.naver?symbol=INDU', color:'#2563eb' },
  { label:'미 국채 10Y', url:'https://finance.naver.com/marketindex/interestDetail.naver?marketindexCd=IRR_US10Y', color:'#7c3aed' },
  { label:'닛케이 225',  url:'https://finance.naver.com/world/sise.naver?symbol=NI225',  color:'#ea580c' },
  { label:'상해종합',    url:'https://finance.naver.com/world/sise.naver?symbol=SHCOMP', color:'#dc2626' },
  { label:'항셍',        url:'https://finance.naver.com/world/sise.naver?symbol=HSI',    color:'#d97706' },
  { label:'WTI 유가',    url:'https://finance.naver.com/marketindex/worldDailyQuote.naver?marketindexCd=OIL_CL&fdtc=2', color:'#16a34a' },
]

const TODAY_SCHEDULE = [
  { time:'09:00', label:'정규장 시작' },
  { time:'15:30', label:'정규장 마감' },
  { time:'종일',  label:'DART 공시 확인' },
]

// ─── 유틸 ────────────────────────────────────────────
function getTodayStr() {
  const d = new Date()
  const days = ['일','월','화','수','목','금','토']
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}
function getMarketStatus() {
  const t = new Date().getHours()*60 + new Date().getMinutes()
  if (t>=540&&t<930)  return { label:'정규장 운영중', color:'#16a34a', dot:true }
  if (t>=480&&t<540)  return { label:'장 시작 전',    color:'#d97706', dot:false }
  if (t>=930&&t<1080) return { label:'시간외 거래',   color:'#7c3aed', dot:false }
  return { label:'장 마감', color:'#64748b', dot:false }
}
function fmt(n)     { return n != null ? Number(n).toLocaleString() : '—' }
function fmtR(n)    { if (n == null) return '—'; const v=Number(n); return `${v>0?'+':''}${v.toFixed(2)}%` }
function fmtC(n)    { if (n == null) return '—'; const v=Number(n); return `${v>0?'+':''}${v.toLocaleString()}` }
function rateColor(n) { const v=Number(n); return v>0?'#dc2626':v<0?'#2563eb':'#64748b' }

// ─── AI 브리핑 ───────────────────────────────────────
const SKEY = 'kstock_briefing'
function loadBriefing() {
  try {
    const raw = localStorage.getItem(SKEY); if(!raw) return {text:'',savedAt:''}
    const p = JSON.parse(raw)
    if(p.date !== new Date().toLocaleDateString('ko-KR')) { localStorage.removeItem(SKEY); return {text:'',savedAt:''} }
    return { text:p.text||'', savedAt:p.savedAt||'' }
  } catch { return {text:'',savedAt:''} }
}
function saveBriefing(text) {
  try {
    const now = new Date()
    const hm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    localStorage.setItem(SKEY, JSON.stringify({ date:new Date().toLocaleDateString('ko-KR'), text, savedAt:hm }))
    return hm
  } catch { return '' }
}
async function fetchBriefing(apiKey) {
  const today = new Date().toLocaleDateString('ko-KR')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
    body:JSON.stringify({
      model:'claude-haiku-4-5-20251001', max_tokens:1000,
      tools:[{ type:'web_search_20250305', name:'web_search' }],
      messages:[{ role:'user', content:
        `웹 검색으로 오늘(${today}) 한국 증시 최신 뉴스를 찾아보고 아래 형식으로 투자자용 AI 브리핑을 작성해줘.\n\n## 📊 오늘의 시장 한줄 요약\n## 🔥 오늘 주목할 테마 TOP 3\n1. 테마명 — 이유\n2. 테마명 — 이유\n3. 테마명 — 이유\n## ⚠️ 오늘의 리스크 요인\n## 💡 오늘 투자 포인트\n## 📅 오늘 주요 일정\n\n반드시 웹 검색으로 오늘 뉴스 기반으로 작성해줘.`
      }]
    })
  })
  if(!res.ok) throw new Error(`API 오류 ${res.status}`)
  const data = await res.json()
  const text = data.content.filter(b=>b.type==='text').map(b=>b.text).join('\n')
  if(!text.trim()) throw new Error('브리핑을 가져오지 못했어요.')
  return text
}

// ─── 실시간 지수 카드 컴포넌트 ───────────────────────
function IndexCard({ market, label, color }) {
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchIndex = useCallback(async () => {
    try {
      const res = await fetch(`/api/kis?type=index&market=${market}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
      setError(false)
    } catch { setError(true) }
    finally { setLoading(false) }
  }, [market])

  useEffect(() => {
    fetchIndex()
    // 장중에만 10초마다 갱신
    const t = new Date().getHours()*60 + new Date().getMinutes()
    if (t >= 540 && t < 930) {
      const timer = setInterval(fetchIndex, 10000)
      return () => clearInterval(timer)
    }
  }, [fetchIndex])

  const rc = data ? rateColor(data.changeRate) : color

  return (
    <div className="kis-index-card" style={{'--ic': color}}>
      <div className="kis-index-label">{label}</div>
      {loading && <div className="kis-loading">로딩 중...</div>}
      {error && !loading && (
        <div className="kis-error-small">
          <span>데이터 오류</span>
          <button onClick={fetchIndex} className="kis-retry">↺</button>
        </div>
      )}
      {data && !loading && (
        <>
          <div className="kis-index-price" style={{color: rc}}>
            {fmt(data.price)}
          </div>
          <div className="kis-index-change" style={{color: rc}}>
            {fmtC(data.change)} ({fmtR(data.changeRate)})
          </div>
          <div className="kis-index-sub">
            고 {fmt(data.high)} · 저 {fmt(data.low)}
          </div>
        </>
      )}
    </div>
  )
}

// ─── 테마 종목 실시간 가격 ───────────────────────────
function ThemeStockPrices({ codes, stocks, color }) {
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch(`/api/kis?type=prices&codes=${codes.join(',')}`)
        const json = await res.json()
        if (!json.error) setPrices(json.prices || [])
      } catch {}
      finally { setLoading(false) }
    }
    fetchPrices()
  }, [codes.join(',')])

  if (loading) return <div className="theme-stocks-loading">로딩 중...</div>

  return (
    <div className="theme-stocks-list">
      {stocks.map((name, i) => {
        const p = prices.find(x => x.code === codes[i])
        return (
          <button
            key={name}
            className="theme-stock-chip-price"
            style={{'--theme-color': color}}
            onClick={() => window.open(`https://finance.naver.com/item/main.naver?code=${codes[i]}`,'_blank')}
          >
            <span className="tsc-name">{name}</span>
            {p && !p.error ? (
              <span className="tsc-price" style={{color: rateColor(p.changeRate)}}>
                {fmt(p.price)} ({fmtR(p.changeRate)})
              </span>
            ) : (
              <span className="tsc-price" style={{color:'#94a3b8'}}>— →</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── 메인 컴포넌트 ───────────────────────────────────
export default function DashboardPage() {
  const saved = loadBriefing()
  const [briefing, setBriefing]   = useState(saved.text)
  const [savedAt, setSavedAt]     = useState(saved.savedAt)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError]     = useState('')
  const [marketStatus]            = useState(getMarketStatus())
  const [todayStr]                = useState(getTodayStr())
  const [activeTheme, setActive]  = useState(null)
  const [lastUpdated, setLastUpdated] = useState('')

  useEffect(() => {
    const now = new Date()
    setLastUpdated(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} 기준`)
  }, [])

  const handleAI = async () => {
    setAiLoading(true); setAiError('')
    try {
      const key = import.meta.env.VITE_CLAUDE_API_KEY
      if(!key) throw new Error('Claude API 키가 없어요.')
      const text = await fetchBriefing(key)
      const hm = saveBriefing(text)
      setBriefing(text); setSavedAt(hm)
    } catch(e) { setAiError(e.message) }
    finally { setAiLoading(false) }
  }

  return (
    <div className="dashboard">

      {/* 헤더 */}
      <div className="dash-header">
        <div className="dash-title-row">
          <div>
            <h1 className="dash-title">시장 대시보드</h1>
            <p className="dash-date">{todayStr} · {lastUpdated}</p>
          </div>
          <div className="market-status-badge" style={{background:marketStatus.color+'18',color:marketStatus.color,borderColor:marketStatus.color+'40'}}>
            {marketStatus.dot && <span className="status-dot" style={{background:marketStatus.color}}/>}
            {marketStatus.label}
          </div>
        </div>
      </div>

      {/* ✅ 실시간 KIS 지수 */}
      <section className="dash-section">
        <div className="section-header">
          <div className="section-label">실시간 지수 <span className="live-badge">● LIVE</span></div>
          <span className="section-note">KIS API · 장중 10초 갱신</span>
        </div>
        <div className="kis-index-grid">
          <IndexCard market="KOSPI"  label="KOSPI"  color="#2563eb" />
          <IndexCard market="KOSDAQ" label="KOSDAQ" color="#16a34a" />
        </div>
      </section>

      {/* 글로벌 지표 (링크) */}
      <section className="dash-section">
        <div className="section-label">글로벌 지표</div>
        <div className="global-grid">
          {GLOBAL_LINKS.map(m => (
            <a key={m.label} href={m.url} target="_blank" rel="noreferrer"
               className="macro-card" style={{'--accent': m.color}}>
              <span className="macro-label">{m.label}</span>
              <span className="macro-live">확인 →</span>
            </a>
          ))}
        </div>
      </section>

      {/* AI 브리핑 */}
      <section className="dash-section">
        <div className="section-header">
          <div>
            <div className="section-label" style={{marginBottom:0}}>🔍 AI 시장 브리핑 (웹검색 기반)</div>
            {savedAt && <span className="briefing-saved-time">오늘 {savedAt} 저장됨 · 새로고침 유지</span>}
          </div>
          <div className="briefing-btn-group">
            {briefing && <button className="briefing-clear-btn" onClick={()=>{localStorage.removeItem(SKEY);setBriefing('');setSavedAt('')}}>초기화</button>}
            <button className={`ai-briefing-btn${aiLoading?' loading':''}`} onClick={handleAI} disabled={aiLoading}>
              {aiLoading?<><span className="btn-spinner"/>검색 중...</>
                :briefing?'↺ 다시 받기'
                :<>🔍 AI 브리핑 받기</>}
            </button>
          </div>
        </div>
        {!briefing&&!aiLoading&&!aiError&&(
          <div className="briefing-placeholder">
            <div className="placeholder-icon">🔍</div>
            <p>AI 브리핑 버튼을 눌러 오늘의 시장 분석을 받아보세요</p>
            <p className="placeholder-sub">웹을 실시간 검색해서 오늘 뉴스 기반으로 분석해드려요</p>
          </div>
        )}
        {aiError && <div className="briefing-error">{aiError}</div>}
        {briefing && (
          <div className="briefing-result">
            <div className="briefing-web-badge">🔍 웹 검색 기반 · 오늘 저장됨</div>
            <pre className="briefing-text">{briefing}</pre>
          </div>
        )}
      </section>

      {/* ✅ 7대 테마 현황 (실시간 주가 포함) */}
      <section className="dash-section">
        <div className="section-label">7대 테마 현황 <span className="live-badge">● LIVE</span></div>
        <div className="theme-grid">
          {THEMES.map(t => (
            <div key={t.id} className={`theme-card${activeTheme===t.id?' active':''}`}
                 style={{'--theme-color':t.color}} onClick={()=>setActive(activeTheme===t.id?null:t.id)}>
              <div className="theme-card-top">
                <span className="theme-emoji">{t.emoji}</span>
                <span className="theme-name" style={{color:t.color}}>{t.label}</span>
              </div>
              <ThemeStockPrices codes={t.codes} stocks={t.stocks} color={t.color} />
            </div>
          ))}
        </div>
      </section>

      {/* 2컬럼 */}
      <div className="dash-two-col">
        <section className="dash-section col-card">
          <div className="section-label">빠른 바로가기</div>
          <div className="quick-links">
            {QUICK_LINKS.map(l=>(
              <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="quick-link-item">
                <span className="quick-icon">{l.icon}</span>
                <span className="quick-label">{l.label}</span>
                <span className="quick-arrow">→</span>
              </a>
            ))}
          </div>
        </section>
        <section className="dash-section col-card">
          <div className="section-label">오늘 주요 일정</div>
          <div className="schedule-list">
            {TODAY_SCHEDULE.map(s=>(
              <div key={s.time} className="schedule-item">
                <span className="schedule-time">{s.time}</span>
                <span className="schedule-label">{s.label}</span>
              </div>
            ))}
            <div className="schedule-divider"/>
            <a href="https://finance.naver.com/research/invest_list.naver" target="_blank" rel="noreferrer" className="schedule-link">📋 오늘 증권사 리포트 →</a>
            <a href="https://dart.fss.or.kr/dsac999/mainY.do" target="_blank" rel="noreferrer" className="schedule-link">📣 오늘 DART 공시 →</a>
            <a href="https://finance.naver.com/sise/sise_quant.naver" target="_blank" rel="noreferrer" className="schedule-link">🔥 거래량 상위 →</a>
          </div>
        </section>
      </div>

      <div className="dash-footer-note">✅ KIS API 연동 완료 · 실시간 KOSPI·KOSDAQ 지수 및 종목 주가 표시 중</div>
    </div>
  )
}
