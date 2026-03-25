import { useState, useEffect, useCallback, useRef } from 'react'
import StockChartModal from '../components/StockChartModal'
import './DashboardPage.css'

// ── 전체 테마 데이터 (ETF 포함) ───────────────────────
const ALL_THEMES = [
  { id:'semi',    label:'반도체·AI',   color:'#2563eb', emoji:'💻',
    etf:[{name:'KODEX 반도체',code:'091160',cap:15000},{name:'TIGER 반도체',code:'091230',cap:8000}],
    stocks:[{name:'삼성전자',code:'005930'},{name:'SK하이닉스',code:'000660'},{name:'한미반도체',code:'042700'}] },
  { id:'defense', label:'방산',         color:'#dc2626', emoji:'🛡️',
    etf:[{name:'KODEX K-방산',code:'459580',cap:5000},{name:'TIGER 방산',code:'453810',cap:3000}],
    stocks:[{name:'한화에어로',code:'012450'},{name:'현대로템',code:'064350'},{name:'LIG넥스원',code:'079550'}] },
  { id:'ship',    label:'조선',         color:'#0d9488', emoji:'🚢',
    etf:[{name:'KODEX 조선',code:'139220',cap:3000},{name:'TIGER 조선',code:'395160',cap:2000}],
    stocks:[{name:'HD현대중공업',code:'329180'},{name:'삼성중공업',code:'010140'},{name:'한화오션',code:'042660'}] },
  { id:'nuclear', label:'원전·전력',    color:'#d97706', emoji:'⚡',
    etf:[{name:'KODEX 원자력',code:'445290',cap:4000},{name:'TIGER 원자력',code:'425420',cap:3500}],
    stocks:[{name:'두산에너빌리티',code:'034020'},{name:'효성중공업',code:'298040'},{name:'일진전기',code:'103590'}] },
  { id:'battery', label:'2차전지',      color:'#16a34a', emoji:'🔋',
    etf:[{name:'KODEX 2차전지',code:'305720',cap:6000},{name:'TIGER 2차전지',code:'364980',cap:4000}],
    stocks:[{name:'LG에너지솔루션',code:'373220'},{name:'삼성SDI',code:'006400'},{name:'POSCO홀딩스',code:'005490'}] },
  { id:'bio',     label:'바이오',       color:'#7c3aed', emoji:'🧬',
    etf:[{name:'KODEX 바이오',code:'244580',cap:5000},{name:'TIGER 바이오',code:'143460',cap:3000}],
    stocks:[{name:'셀트리온',code:'068270'},{name:'삼성바이오',code:'207940'},{name:'HLB',code:'028300'}] },
  { id:'value',   label:'밸류업·금융',  color:'#ea580c', emoji:'🏦',
    etf:[{name:'KODEX 밸류업',code:'473190',cap:4000},{name:'TIGER 밸류업',code:'474220',cap:3000}],
    stocks:[{name:'KB금융',code:'105560'},{name:'신한지주',code:'055550'},{name:'하나금융',code:'086790'}] },
  { id:'it',      label:'IT·소프트웨어',color:'#6366f1', emoji:'💡',
    etf:[{name:'KODEX IT',code:'266360',cap:3000}],
    stocks:[{name:'카카오',code:'035720'},{name:'네이버',code:'035420'},{name:'크래프톤',code:'259960'}] },
  { id:'consumer',label:'소비재·유통',  color:'#f59e0b', emoji:'🛍️',
    etf:[{name:'KODEX 소비재',code:'228800',cap:2000}],
    stocks:[{name:'CJ제일제당',code:'097950'},{name:'BGF리테일',code:'282330'},{name:'이마트',code:'139480'}] },
  { id:'chemical',label:'화학·소재',    color:'#78716c', emoji:'⚗️',
    etf:[{name:'KODEX 화학',code:'117460',cap:2000}],
    stocks:[{name:'LG화학',code:'051910'},{name:'롯데케미칼',code:'011170'},{name:'금호석유',code:'011780'}] },
]

const DEFAULT_ACTIVE = ['semi','defense','ship','nuclear','battery','bio','value']
const THEME_PREFS_KEY = 'kstock_theme_prefs'
const CACHE_KEY       = 'kstock_dash_cache'

function loadThemePrefs() {
  try { return JSON.parse(localStorage.getItem(THEME_PREFS_KEY) || 'null') || DEFAULT_ACTIVE } catch { return DEFAULT_ACTIVE }
}
function saveThemePrefs(ids) {
  try { localStorage.setItem(THEME_PREFS_KEY, JSON.stringify(ids)) } catch {}
}

// 캐시: 장중 30초, 장외 5분
function loadCache() {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null')
    if (!c) return null
    const now = Date.now()
    const isOpen = isMarketOpen()
    const ttl = isOpen ? 30000 : 300000
    if (now - c.ts < ttl) return c.data
    return null
  } catch { return null }
}
function saveCache(data) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })) } catch {}
}

function isMarketOpen() {
  const now  = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  const day  = now.getDay()
  return day >= 1 && day <= 5 && mins >= 540 && mins < 930
}

// ── 유틸 ─────────────────────────────────────────────
const fmt  = v => v != null && v !== 0 ? Number(v).toLocaleString() : '—'
const fmtR = v => { if (!v) return '0.00%'; const x=Number(v); return `${x>0?'+':''}${x.toFixed(2)}%` }
const fmtC = v => { if (!v) return '0'; const x=Number(v); return `${x>0?'+':''}${x.toLocaleString()}` }
const rc   = v => { const x=Number(v); return x>0?'#ef4444':x<0?'#3b82f6':'#64748b' }

function getTodayStr() {
  const d = new Date()
  const days = ['일','월','화','수','목','금','토']
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}

// ── 스파크라인 ────────────────────────────────────────
function Sparkline({ values, color }) {
  if (!values || values.length < 2) return null
  const W = 80, H = 28
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W
    const y = H - ((v - min) / range) * (H - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{display:'block',flexShrink:0}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8"
        strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

// ── 지수 카드 ─────────────────────────────────────────
function IndexCard({ data, loading, color, label, onChartClick }) {
  const [spark, setSpark] = useState([])
  useEffect(() => {
    if (!data?.market) return
    fetch(`/api/kis?type=index-chart&market=${data.market}&days=20`)
      .then(r=>r.json()).then(j=>{ if(j.candles) setSpark(j.candles.map(c=>c.close)) }).catch(()=>{})
  }, [data?.market])

  const closed   = data?.status === 'closed'
  const priceClr = loading || closed ? '#94a3b8' : rc(data?.changeRate)

  return (
    <div className="db-index-card" style={{'--ic':color}}
      onClick={()=>data&&onChartClick({type:'index',market:data.market,label,price:data.price,changeRate:data.changeRate,status:data.status})}>
      <div className="db-index-body">
        <div>
          <div className="db-index-top">
            <span className="db-index-label">{label}</span>
            {loading ? null : closed
              ? <span className="db-closed-badge">장 마감</span>
              : <span className="db-live-badge">● LIVE</span>}
          </div>
          {loading ? (
            <div className="db-skeleton db-skeleton--price"/>
          ) : (
            <>
              <div className="db-index-price" style={{color:priceClr}}>{fmt(data?.price)}</div>
              <div className="db-index-change" style={{color:priceClr}}>
                {fmtC(data?.change)} ({fmtR(data?.changeRate)})
              </div>
              {closed && data?.closeDate && (
                <div className="db-index-sub">📅 {data.closeDate} 종가</div>
              )}
              {!closed && (
                <div className="db-index-sub">고 {fmt(data?.high)} · 저 {fmt(data?.low)}</div>
              )}
            </>
          )}
        </div>
        {spark.length >= 2 && (
          <div className="db-spark-wrap">
            <Sparkline values={spark} color={data?.changeRate>=0?'#ef4444':'#3b82f6'}/>
            <span className="db-spark-hint">차트 →</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 환율 카드 ─────────────────────────────────────────
const FOREX_PAIRS = [
  { pair:'KRW', label:'USD/KRW', symbol:'₩', histKey:'krw' },
  { pair:'JPY', label:'USD/JPY', symbol:'¥', histKey:'jpy' },
  { pair:'CNY', label:'USD/CNY', symbol:'¥', histKey:'cny' },
]

function ForexSection({ forex, onChartClick }) {
  if (!forex) return null
  const hist = forex.history || {}
  return (
    <div className="db-forex-row">
      {FOREX_PAIRS.map(item => {
        const value = item.pair==='KRW' ? forex.usdKrw?.toLocaleString()
                    : item.pair==='JPY' ? forex.usdJpy : forex.usdCny
        if (!value) return null
        const vals = (hist[item.histKey]||[]).filter(v=>v>0)
        const first = vals[0]||0, last = vals[vals.length-1]||0
        const pct = first ? ((last-first)/first*100).toFixed(2) : '0.00'
        const up = Number(pct)>=0
        return (
          <div key={item.label} className="db-forex-card"
            onClick={()=>onChartClick({type:'forex',pair:item.pair,label:item.label,price:last,changeRate:Number(pct)})}>
            <div className="db-forex-left">
              <span className="db-forex-label">{item.label}</span>
              <span className="db-forex-value">{item.symbol}{value}</span>
              <span className="db-forex-change" style={{color:up?'#ef4444':'#3b82f6'}}>
                {up?'▲':'▼'} {Math.abs(Number(pct))}% <span style={{color:'#94a3b8',fontSize:'10px'}}>7일</span>
              </span>
              <span className="db-forex-hint">차트 →</span>
            </div>
            {vals.length>=2 && <Sparkline values={vals} color={up?'#d97706':'#94a3b8'}/>}
          </div>
        )
      })}
    </div>
  )
}

// ── 해외지수 ──────────────────────────────────────────
const GLOBAL_LIST = [
  {sym:'SP500',label:'S&P 500',color:'#ef4444'},
  {sym:'NASDAQ',label:'NASDAQ',color:'#0d9488'},
  {sym:'DOW',label:'DOW',color:'#2563eb'},
  {sym:'US10Y',label:'미 국채 10Y',color:'#7c3aed'},
  {sym:'N225',label:'닛케이 225',color:'#ea580c'},
  {sym:'WTI',label:'WTI 유가',color:'#16a34a'},
]

function GlobalCard({ sym, label, color, onChartClick }) {
  const [data,setData] = useState(null)
  const [loading,setLoading] = useState(true)
  useEffect(()=>{
    fetch(`/api/kis?type=global&symbol=${sym}`).then(r=>r.json()).then(j=>{if(!j.error)setData(j)}).catch(()=>{}).finally(()=>setLoading(false))
  },[sym])
  const pc = data ? rc(data.changeRate) : '#94a3b8'
  return (
    <div className="db-global-card" style={{'--gc':color}}
      onClick={()=>data&&onChartClick({type:'global',sym,label,color,price:data.price,changeRate:data.changeRate})}>
      <div className="db-global-label" style={{color}}>{label}</div>
      {loading && <div className="db-global-loading">...</div>}
      {!loading && data && (
        <>
          <div className="db-global-price" style={{color:pc}}>{data.price?.toLocaleString(undefined,{maximumFractionDigits:2})}</div>
          <div className="db-global-change" style={{color:pc}}>{data.changeRate>=0?'+':''}{data.changeRate?.toFixed(2)}%</div>
        </>
      )}
      {!loading && !data && <div className="db-global-na">—</div>}
    </div>
  )
}

// ── 빠른 바로가기 (접이식) ────────────────────────────
const QUICK_LINKS = [
  {label:'네이버 증권',  url:'https://finance.naver.com',                            icon:'📊'},
  {label:'KRX 시장정보', url:'https://data.krx.co.kr',                               icon:'🏛️'},
  {label:'DART 공시',    url:'https://dart.fss.or.kr',                               icon:'📋'},
  {label:'한국은행',     url:'https://www.bok.or.kr',                                icon:'🏦'},
  {label:'거래량 상위',  url:'https://finance.naver.com/sise/sise_quant.naver',      icon:'🔥'},
  {label:'외국인 순매수',url:'https://finance.naver.com/sise/foreign_list.naver',    icon:'🌐'},
  {label:'증권사 리포트',url:'https://finance.naver.com/research/invest_list.naver', icon:'📈'},
  {label:'상한가 종목',  url:'https://finance.naver.com/sise/sise_upper.naver',      icon:'🚀'},
]

function QuickLinks() {
  const [open, setOpen] = useState(false)
  return (
    <div className="db-quicklinks-wrap">
      <button className="db-quicklinks-toggle" onClick={()=>setOpen(v=>!v)}>
        <span>🔗 바로가기</span>
        <span className="db-ql-arrow">{open?'▲':'▼'}</span>
      </button>
      {open && (
        <div className="db-quicklinks-panel">
          {QUICK_LINKS.map(l=>(
            <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="db-ql-item">
              <span className="db-ql-icon">{l.icon}</span>
              <span className="db-ql-label">{l.label}</span>
              <span className="db-ql-arrow-sm">→</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 테마 설정 모달 ────────────────────────────────────
function ThemeSettingModal({ activeIds, onChange, onClose }) {
  const [sel, setSel] = useState(new Set(activeIds))
  const toggle = (id) => setSel(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  return (
    <div className="db-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="db-setting-modal">
        <div className="db-setting-header">
          <span>테마 설정</span>
          <button className="db-setting-close" onClick={onClose}>✕</button>
        </div>
        <p style={{fontSize:'12px',color:'#94a3b8',marginBottom:'12px'}}>노출할 테마를 선택하세요</p>
        <div className="db-theme-check-grid">
          {ALL_THEMES.map(t=>(
            <label key={t.id} className={`db-theme-check-item ${sel.has(t.id)?'checked':''}`}
              style={{'--tc':t.color}}>
              <input type="checkbox" checked={sel.has(t.id)} onChange={()=>toggle(t.id)} style={{display:'none'}}/>
              <span className="db-theme-check-emoji">{t.emoji}</span>
              <span className="db-theme-check-label">{t.label}</span>
              {sel.has(t.id) && <span className="db-theme-check-mark">✓</span>}
            </label>
          ))}
        </div>
        <div className="db-setting-footer">
          <button className="btn-outline" onClick={onClose}>취소</button>
          <button className="btn-ai" onClick={()=>{onChange([...sel]);onClose()}}>저장</button>
        </div>
      </div>
    </div>
  )
}

// ── 메인 대시보드 ─────────────────────────────────────
export default function DashboardPage() {
  const [dashData,   setDashData]   = useState(() => loadCache())
  const [loading,    setLoading]    = useState(!loadCache())
  const [lastFetch,  setLastFetch]  = useState('')
  const [chartItem,  setChartItem]  = useState(null)
  const [activeIds,  setActiveIds]  = useState(() => loadThemePrefs())
  const [showSetting,setShowSetting]= useState(false)
  const timerRef = useRef(null)

  // 주가 데이터에 필요한 모든 코드
  const visibleThemes = ALL_THEMES.filter(t => activeIds.includes(t.id))
  const allCodes = visibleThemes.flatMap(t => [
    ...t.etf.slice(0,1).map(e=>e.code),
    ...t.stocks.map(s=>s.code)
  ])

  const fetchDashboard = useCallback(async (force=false) => {
    if (!force) {
      const cached = loadCache()
      if (cached) { setDashData(cached); setLoading(false); return }
    }
    try {
      const codes = allCodes.join(',')
      const res   = await fetch(`/api/kis?type=dashboard&codes=${codes}`)
      const json  = await res.json()
      if (json.error) throw new Error(json.error)
      setDashData(json)
      saveCache(json)
      const now = new Date()
      setLastFetch(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`)
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }, [allCodes.join(',')])

  useEffect(() => {
    fetchDashboard()
    const isOpen = isMarketOpen()
    const interval = isOpen ? 30000 : 300000
    timerRef.current = setInterval(() => fetchDashboard(true), interval)
    return () => clearInterval(timerRef.current)
  }, [fetchDashboard])

  const handleThemeChange = (ids) => {
    setActiveIds(ids)
    saveThemePrefs(ids)
    setTimeout(() => fetchDashboard(true), 100)
  }

  const marketStatus = dashData?.marketStatus || 'closed'
  const isOpen = marketStatus === 'open'
  const statusMap = {
    open:      { label:'정규장 운영중', color:'#16a34a', dot:true },
    premarket: { label:'장 시작 전',    color:'#d97706', dot:false },
    after:     { label:'시간외 거래',   color:'#7c3aed', dot:false },
    holiday:   { label:'휴장일',        color:'#64748b', dot:false },
    closed:    { label:'장 마감',       color:'#64748b', dot:false },
  }
  const st = statusMap[marketStatus] || statusMap.closed

  const priceMap = {}
  dashData?.prices?.forEach(p => { if(p?.code) priceMap[p.code] = p })

  // 차트 팝업 (종목은 StockChartModal, 나머지는 기존)
  const handleChartClick = (item) => {
    if (item.type === 'stock') {
      setChartItem({ ...item, isStock: true })
    } else {
      setChartItem({ ...item, isStock: false })
    }
  }

  return (
    <div className="dashboard">

      {/* 헤더 */}
      <div className="dash-header">
        <div className="dash-header-row">
          <div>
            <h1 className="dash-title">시장 대시보드</h1>
            <p className="dash-date">
              {getTodayStr()}
              {lastFetch && <span style={{color:'#94a3b8'}}> · {lastFetch} 기준</span>}
            </p>
          </div>
          <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
            <QuickLinks />
            <div className="db-status-badge" style={{background:st.color+'18',color:st.color,borderColor:st.color+'40'}}>
              {st.dot && <span className="db-status-dot" style={{background:st.color}}/>}
              {st.label}
            </div>
            <button className="btn-outline db-refresh-btn" onClick={()=>fetchDashboard(true)} disabled={loading}>
              {loading ? '⟳' : '⟳ 새로고침'}
            </button>
          </div>
        </div>
      </div>

      {/* 장마감 안내 배너 */}
      {!isOpen && dashData && (
        <div className="db-closed-banner">
          📅 현재 장 마감 상태입니다. 표시된 데이터는 <b>전일 종가 기준</b>이며 {isMarketOpen() ? '' : '다음 장 시작 시 자동 갱신됩니다.'}
        </div>
      )}

      {/* 지수 + 환율 */}
      <section className="dash-section">
        <div className="db-section-header">
          <span className="db-section-label">
            실시간 지수 · 환율
            {isOpen && <span className="db-live-badge"> ● LIVE</span>}
            {!isOpen && <span className="db-closed-note"> 전일 마감 기준</span>}
          </span>
          <span className="db-section-note">{isOpen ? 'KIS API · 30초 자동 갱신' : 'KIS API · 5분 자동 갱신'}</span>
        </div>

        <div className="db-index-grid">
          <IndexCard data={dashData?.kospi}  loading={loading} color="#2563eb" label="KOSPI"  onChartClick={handleChartClick}/>
          <IndexCard data={dashData?.kosdaq} loading={loading} color="#16a34a" label="KOSDAQ" onChartClick={handleChartClick}/>
        </div>

        <ForexSection forex={dashData?.forex} onChartClick={handleChartClick}/>

        <div className="db-global-grid">
          {GLOBAL_LIST.map(g=>(
            <GlobalCard key={g.sym} {...g} onChartClick={handleChartClick}/>
          ))}
        </div>
      </section>

      {/* 테마 섹션 */}
      <section className="dash-section">
        <div className="db-section-header">
          <span className="db-section-label">
            테마 현황
            {isOpen && <span className="db-live-badge"> ● LIVE</span>}
            {!isOpen && <span className="db-closed-note"> 전일 마감 기준</span>}
          </span>
          <button className="btn-outline db-theme-setting-btn" onClick={()=>setShowSetting(true)}>
            ⚙️ 테마 설정
          </button>
        </div>

        <div className="db-theme-grid">
          {visibleThemes.map(t => {
            // ETF 최우선 (시총 가장 큰 것 1개)
            const topEtf = t.etf.sort((a,b)=>b.cap-a.cap)[0]
            const etfPrice = priceMap[topEtf?.code]

            return (
              <div key={t.id} className="db-theme-card" style={{'--tc':t.color}}>
                <div className="db-theme-card-header">
                  <span className="db-theme-emoji">{t.emoji}</span>
                  <span className="db-theme-label" style={{color:t.color}}>{t.label}</span>
                </div>

                {/* ETF 우선 */}
                {topEtf && (
                  <button className="db-etf-chip"
                    onClick={()=>handleChartClick({type:'stock',code:topEtf.code,label:topEtf.name,price:etfPrice?.price,changeRate:etfPrice?.changeRate,isStock:true})}>
                    <span className="db-etf-badge">ETF</span>
                    <span className="db-etf-name">{topEtf.name}</span>
                    {loading ? (
                      <span className="db-etf-price" style={{color:'#94a3b8'}}>...</span>
                    ) : etfPrice?.price > 0 ? (
                      <span className="db-etf-price" style={{color:rc(etfPrice?.changeRate)}}>
                        {fmt(etfPrice.price)} <span style={{fontSize:'11px'}}>({fmtR(etfPrice?.changeRate)})</span>
                      </span>
                    ) : (
                      <span className="db-etf-price" style={{color:'#94a3b8'}}>—</span>
                    )}
                  </button>
                )}

                {/* 종목 리스트 */}
                <div className="db-theme-stocks">
                  {t.stocks.map(s => {
                    const p = priceMap[s.code]
                    return (
                      <button key={s.code} className="db-stock-chip"
                        onClick={()=>handleChartClick({type:'stock',code:s.code,label:s.name,price:p?.price,changeRate:p?.changeRate,isStock:true})}>
                        <span className="db-stock-name">{s.name}</span>
                        {loading ? (
                          <span style={{color:'#94a3b8',fontSize:'11px'}}>...</span>
                        ) : p?.price > 0 ? (
                          <span className="db-stock-price" style={{color:rc(p.changeRate)}}>
                            {fmt(p.price)} <span style={{fontSize:'10px'}}>({fmtR(p.changeRate)})</span>
                          </span>
                        ) : (
                          <span style={{color:'#94a3b8',fontSize:'11px'}}>—</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <div className="dash-footer-note">
        ✅ KIS API 연동 · {isOpen?'장중 30초':'장외 5분'} 자동 갱신 · 접속 시 캐시 즉시 표시
      </div>

      {/* 테마 설정 모달 */}
      {showSetting && (
        <ThemeSettingModal
          activeIds={activeIds}
          onChange={handleThemeChange}
          onClose={()=>setShowSetting(false)}
        />
      )}

      {/* 차트 팝업 */}
      {chartItem && chartItem.isStock && (
        <StockChartModal
          stock={{ name: chartItem.label, code: chartItem.code }}
          onClose={()=>setChartItem(null)}
        />
      )}
      {chartItem && !chartItem.isStock && (
        <LegacyChartModal item={chartItem} onClose={()=>setChartItem(null)}/>
      )}
    </div>
  )
}

// ── 기존 KIS 차트 모달 (지수/환율/해외) ──────────────
function LegacyChartModal({ item, onClose }) {
  const [candles,setCandles] = useState([])
  const [period,setPeriod]   = useState(null)
  const [loading,setLoading] = useState(true)
  const [error,setError]     = useState('')

  const PERIODS = item.type==='index'  ? [{v:'D',l:'3개월'},{v:'W',l:'1년'}]
                : item.type==='global' ? [{v:'3mo',l:'3개월'},{v:'6mo',l:'6개월'},{v:'1y',l:'1년'}]
                : item.type==='forex'  ? [{v:'90',l:'3개월'},{v:'365',l:'1년'},{v:'1825',l:'5년'}]
                : []

  const fetch_ = useCallback(async (p) => {
    setLoading(true); setError('')
    try {
      let url = ''
      if (item.type==='index')  url=`/api/kis?type=index-chart&market=${item.market}&days=${p==='D'?65:260}`
      if (item.type==='global') url=`/api/kis?type=global&symbol=${item.sym}&range=${p}`
      if (item.type==='forex')  url=`/api/kis?type=forex-chart&pair=${item.pair}&days=${p}`
      const res=await fetch(url); const j=await res.json()
      if(j.error) throw new Error(j.error)
      setCandles(j.candles||[])
    } catch(e){setError(e.message)}
    finally{setLoading(false)}
  },[item])

  useEffect(()=>{
    const def=PERIODS[0]?.v
    if(def){setPeriod(def);fetch_(def)}
  },[])
  useEffect(()=>{ const fn=e=>{if(e.key==='Escape')onClose()}; window.addEventListener('keydown',fn); return()=>window.removeEventListener('keydown',fn)},[onClose])

  const W = typeof window!=='undefined' ? Math.min(window.innerWidth-48,880) : 880
  const isLine = item.type==='forex'||item.type==='global'

  // 간단한 SVG 라인/캔들
  const renderChart = () => {
    if(!candles.length) return <div style={{padding:'60px',textAlign:'center',color:'#94a3b8'}}>데이터 없음</div>
    const H=300, padL=72, padR=12, padT=12, padB=32
    const cW=W-padL-padR, cH=H-padT-padB
    const closes=candles.map(c=>c.close).filter(Boolean)
    const min=Math.min(...closes)*0.997, max=Math.max(...closes)*1.003, range=max-min||1
    const py=v=>padT+cH-(v-min)/range*cH
    const px=i=>padL+(i/(candles.length-1||1))*cW
    const pts=candles.map((c,i)=>`${px(i)},${py(c.close)}`).join(' ')
    const isUp=closes[closes.length-1]>=closes[0]
    const lc=isUp?'#ef4444':'#3b82f6'
    const ticks=5
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block',background:'#0f172a',borderRadius:'8px'}}>
        {Array.from({length:ticks},(_,i)=>{
          const v=min+(range/ticks)*i
          const y=py(v)
          return <g key={i}>
            <line x1={padL} x2={padL+cW} y1={y} y2={y} stroke="#1e293b" strokeDasharray="3,3"/>
            <text x={padL-4} y={y+4} textAnchor="end" fontSize="10" fill="#64748b">{Math.round(v).toLocaleString()}</text>
          </g>
        })}
        <defs>
          <linearGradient id="lg2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lc} stopOpacity="0.2"/>
            <stop offset="100%" stopColor={lc} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={`${padL},${padT+cH} ${pts} ${padL+cW},${padT+cH}`} fill="url(#lg2)"/>
        <polyline points={pts} fill="none" stroke={lc} strokeWidth="1.8"/>
        {candles.filter((_,i)=>i%(Math.floor(candles.length/6)||1)===0).map((c,i)=>(
          <text key={i} x={px(candles.indexOf(c))} y={H-8} textAnchor="middle" fontSize="10" fill="#64748b">
            {String(c.date||'').slice(4,8).replace(/(\d{2})(\d{2})/,'$1/$2')}
          </text>
        ))}
      </svg>
    )
  }

  return (
    <div className="chart-modal-overlay" onClick={onClose}>
      <div className="chart-modal" onClick={e=>e.stopPropagation()}>
        <div className="chart-modal-header">
          <div className="chart-modal-title">
            <span className="chart-modal-name">{item.label}</span>
            <span className="chart-modal-price" style={{color:rc(item.changeRate)}}>
              {item.price?.toLocaleString(undefined,{maximumFractionDigits:4})} ({fmtR(item.changeRate)})
            </span>
          </div>
          <div className="chart-modal-actions">
            <div className="chart-period-tabs">
              {PERIODS.map(p=>(
                <button key={p.v} className={`chart-period-btn ${period===p.v?'active':''}`}
                  onClick={()=>{setPeriod(p.v);fetch_(p.v)}}>{p.l}</button>
              ))}
            </div>
            <button className="chart-modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="chart-modal-body">
          {loading && <div className="chart-loading"><div className="spinner-lg"/>로딩 중...</div>}
          {error && <div className="chart-error">⚠️ {error}</div>}
          {!loading && !error && renderChart()}
        </div>
      </div>
    </div>
  )
}
