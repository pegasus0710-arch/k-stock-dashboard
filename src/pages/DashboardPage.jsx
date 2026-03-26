import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import StockChartModal from '../components/StockChartModal'
import ChartModal from '../components/ChartModal'
import { ALL_THEMES, DEFAULT_ACTIVE_IDS } from '../constants/themes'
import { fmt, fmtRate, fmtChange, rateColor, getTodayStr, getNowTime, getKstStatus, isMarketOpen, isUSMarketOpen, getDashTTL } from '../utils/format'
import './DashboardPage.css'

// ── 상수 ──────────────────────────────────────────────
const THEME_DOC_KEY = 'dashboard_theme_prefs'
const GLOBAL_SYMS   = ['SP500', 'NASDAQ', 'DOW', 'US10Y', 'N225', 'WTI']
const LS_DASH       = 'db_cache_v3'
const LS_BRIEFING   = 'db_briefing_v1'
const LS_GLOBAL     = 'db_global_v3'
const LS_SPARK      = 'db_spark_v3'

// KOSPI/KOSDAQ → 키움 업종코드
function marketToInds(m) {
  if (m === 'J' || m === 'KOSPI')  return '001'
  if (m === 'Q' || m === 'KOSDAQ') return '101'
  return '001'
}

// ── localStorage 캐시 ─────────────────────────────────
function lsRead(key, ttl) {
  try {
    const r = localStorage.getItem(key)
    if (!r) return null
    const { data, ts } = JSON.parse(r)
    return Date.now() - ts < ttl ? data : null
  } catch { return null }
}
function lsWrite(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

// ── 공통 서브 컴포넌트 ────────────────────────────────
function Sparkline({ values, color }) {
  if (!values || values.length < 2) return null
  const W = 80, H = 28
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1) * W).toFixed(1)},${(H - ((v - min) / range) * (H - 4) - 2).toFixed(1)}`
  ).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

function Skeleton({ w = '100%', h = 20, r = 6, mb = 0 }) {
  return <div className="db-skeleton" style={{ width: w, height: h, borderRadius: r, marginBottom: mb }}/>
}

// ── 지수 카드 ─────────────────────────────────────────
function IndexCard({ data, loading, color, label, sparkData, onChartClick }) {
  const spark    = sparkData || []
  const status   = data?.status || 'closed'
  const priceClr = loading || !data ? '#94a3b8' : rateColor(data?.changeRate)

  const badgeMap = {
    open:      <span className="db-live-badge">● LIVE</span>,
    after:     <span className="db-after-badge">⏱ 시간외</span>,
    premarket: <span className="db-pre-badge">개장전</span>,
  }

  return (
    <div className="db-index-card" style={{ '--ic': color }}
      onClick={() => data && onChartClick({ type: 'index', market: data.market, label, price: data.price, changeRate: data.changeRate, status })}>
      <div className="db-index-body">
        <div>
          <div className="db-index-top">
            <span className="db-index-label">{label}</span>
            {!loading && (badgeMap[status] || <span className="db-closed-badge">전일 마감</span>)}
          </div>
          {loading ? (
            <><Skeleton h={32} r={6} mb={6}/><Skeleton w="60%" h={16} r={4}/></>
          ) : (
            <>
              <div className="db-index-price" style={{ color: priceClr }}>{fmt(data?.price)}</div>
              <div className="db-index-change" style={{ color: priceClr }}>
                {fmtChange(data?.change)} ({fmtRate(data?.changeRate)})
              </div>
              <div className="db-index-sub">
                {status === 'closed' && data?.closeDate
                  ? `📅 ${data.closeDate} 기준`
                  : status === 'after'
                    ? `시간외 · 고 ${fmt(data?.high)} · 저 ${fmt(data?.low)}`
                    : `고 ${fmt(data?.high)} · 저 ${fmt(data?.low)}`}
              </div>
            </>
          )}
        </div>
        {spark.length >= 2 && (
          <div className="db-spark-wrap">
            <Sparkline values={spark} color={data?.changeRate >= 0 ? '#ef4444' : '#3b82f6'}/>
            <span className="db-spark-hint">차트 →</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 환율 섹션 ─────────────────────────────────────────
const FOREX_PAIRS = [
  { pair: 'KRW', label: 'USD/KRW', symbol: '₩', histKey: 'krw' },
  { pair: 'JPY', label: 'USD/JPY', symbol: '¥', histKey: 'jpy' },
  { pair: 'CNY', label: 'USD/CNY', symbol: '¥', histKey: 'cny' },
]

function ForexSection({ forex, loading, onChartClick }) {
  if (loading) return (
    <div className="db-forex-row">
      {FOREX_PAIRS.map((_, i) => <div key={i} className="db-forex-card"><Skeleton h={72}/></div>)}
    </div>
  )
  if (!forex) return null
  const hist = forex.history || {}
  return (
    <div className="db-forex-row">
      {FOREX_PAIRS.map(item => {
        const value = item.pair === 'KRW' ? forex.usdKrw?.toLocaleString()
          : item.pair === 'JPY' ? forex.usdJpy : forex.usdCny
        if (!value) return null
        const vals  = (hist[item.histKey] || []).filter(v => v > 0)
        const first = vals[0] || 0, last = vals[vals.length - 1] || 0
        const pct   = first ? ((last - first) / first * 100).toFixed(2) : '0.00'
        const up    = Number(pct) >= 0
        return (
          <div key={item.label} className="db-forex-card"
            onClick={() => onChartClick({ type: 'forex', pair: item.pair, label: item.label, price: last, changeRate: Number(pct) })}>
            <div className="db-forex-left">
              <span className="db-forex-label">{item.label}</span>
              <span className="db-forex-value">{item.symbol}{value}</span>
              <span className="db-forex-change" style={{ color: up ? '#ef4444' : '#3b82f6' }}>
                {up ? '▲' : '▼'} {Math.abs(Number(pct))}%{' '}
                <span style={{ color: '#94a3b8', fontSize: '10px' }}>7일</span>
              </span>
              <span className="db-forex-hint">차트 →</span>
            </div>
            {vals.length >= 2 && <Sparkline values={vals} color={up ? '#d97706' : '#94a3b8'}/>}
          </div>
        )
      })}
    </div>
  )
}

// ── 해외지수 섹션 ─────────────────────────────────────
const GLOBAL_LIST = [
  { sym: 'SP500',  label: 'S&P 500',    color: '#ef4444' },
  { sym: 'NASDAQ', label: 'NASDAQ',     color: '#0d9488' },
  { sym: 'DOW',    label: 'DOW',        color: '#2563eb' },
  { sym: 'US10Y',  label: '미 국채 10Y', color: '#7c3aed' },
  { sym: 'N225',   label: '닛케이 225',  color: '#ea580c' },
  { sym: 'WTI',    label: 'WTI 유가',   color: '#16a34a' },
]

function GlobalSection({ globalData, loading, onChartClick }) {
  return (
    <div className="db-global-grid">
      {GLOBAL_LIST.map(g => {
        const data = globalData?.[g.sym]
        const pc   = data ? rateColor(data.changeRate) : '#94a3b8'
        return (
          <div key={g.sym} className="db-global-card" style={{ '--gc': g.color }}
            onClick={() => data && onChartClick({ type: 'global', sym: g.sym, label: g.label, color: g.color, price: data.price, changeRate: data.changeRate })}>
            <div className="db-global-label" style={{ color: g.color }}>{g.label}</div>
            {loading && <div className="db-global-loading">...</div>}
            {!loading && data && (
              <>
                <div className="db-global-price" style={{ color: pc }}>
                  {data.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
                <div className="db-global-change" style={{ color: pc }}>
                  {data.changeRate >= 0 ? '+' : ''}{data.changeRate?.toFixed(2)}%
                  {data.marketState && data.marketState !== 'REGULAR' && (
                    <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: 3 }}>
                      {data.marketState === 'POST' ? '시간외' : data.marketState === 'PRE' ? '프리' : ''}
                    </span>
                  )}
                </div>
              </>
            )}
            {!loading && !data && <div className="db-global-na">—</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── 바로가기 ──────────────────────────────────────────
const QUICK_LINKS = [
  { label: '네이버 증권',   url: 'https://finance.naver.com',                                    icon: '📊' },
  { label: 'KRX 시장정보', url: 'https://data.krx.co.kr',                                       icon: '🏛️' },
  { label: 'DART 공시',    url: 'https://dart.fss.or.kr',                                       icon: '📋' },
  { label: '한국은행',     url: 'https://www.bok.or.kr',                                        icon: '🏦' },
  { label: '거래량 상위',  url: 'https://finance.naver.com/sise/sise_quant.naver',              icon: '🔥' },
  { label: '외국인 순매수',url: 'https://finance.naver.com/sise/foreign_list.naver',            icon: '🌐' },
  { label: '증권사 리포트',url: 'https://finance.naver.com/research/invest_list.naver',         icon: '📈' },
  { label: '상한가 종목',  url: 'https://finance.naver.com/sise/sise_upper.naver',              icon: '🚀' },
]

function QuickLinks() {
  const [open, setOpen] = useState(false)
  return (
    <div className="db-quicklinks-wrap">
      <button className="db-quicklinks-toggle" onClick={() => setOpen(v => !v)}>
        <span>🔗 바로가기</span>
        <span className="db-ql-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="db-quicklinks-panel">
          {QUICK_LINKS.map(l => (
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
  const toggle = id => setSel(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  return (
    <div className="db-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="db-setting-modal">
        <div className="db-setting-header">
          <span>테마 설정</span>
          <button className="db-setting-close" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '12px' }}>노출할 테마를 선택하세요</p>
        <div className="db-theme-check-grid">
          {ALL_THEMES.map(t => (
            <label key={t.id} className={`db-theme-check-item ${sel.has(t.id) ? 'checked' : ''}`} style={{ '--tc': t.color }}>
              <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} style={{ display: 'none' }}/>
              <span className="db-theme-check-emoji">{t.emoji}</span>
              <span className="db-theme-check-label">{t.label}</span>
              {sel.has(t.id) && <span className="db-theme-check-mark">✓</span>}
            </label>
          ))}
        </div>
        <div className="db-setting-footer">
          <button className="btn-outline" onClick={onClose}>취소</button>
          <button className="btn-ai" onClick={() => { onChange([...sel]); onClose() }}>저장</button>
        </div>
      </div>
    </div>
  )
}

// ── 환율·해외지수 라인차트 모달 ───────────────────────
function LegacyChartModal({ item, onClose }) {
  const [candles, setCandles] = useState([])
  const [period,  setPeriod]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const PERIODS = item.type === 'global'
    ? [{ v: '3mo', l: '3개월' }, { v: '6mo', l: '6개월' }, { v: '1y', l: '1년' }]
    : [{ v: '90',  l: '3개월' }, { v: '365', l: '1년'   }, { v: '1825', l: '5년' }]

  const fetchChart = useCallback(async p => {
    setLoading(true); setError('')
    try {
      const url = item.type === 'global'
        ? `/api/kis?type=global&symbol=${item.sym}&range=${p}`
        : `/api/kis?type=forex-chart&pair=${item.pair}&days=${p}`
      const j = await fetch(url).then(r => r.json())
      if (j.error) throw new Error(j.error)
      setCandles(j.candles || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [item])

  useEffect(() => {
    const def = PERIODS[0]?.v
    if (def) { setPeriod(def); fetchChart(def) }
  }, [])

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const W = typeof window !== 'undefined' ? Math.min(window.innerWidth - 48, 880) : 880

  const renderChart = () => {
    if (!candles.length) return <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>데이터 없음</div>
    const H = 300, pL = 72, pR = 12, pT = 12, pB = 32
    const cW = W - pL - pR, cH = H - pT - pB
    const closes = candles.map(c => c.close).filter(Boolean)
    const min    = Math.min(...closes) * 0.997
    const max    = Math.max(...closes) * 1.003
    const range  = max - min || 1
    const py     = v => pT + cH - (v - min) / range * cH
    const px     = i => pL + (i / (candles.length - 1 || 1)) * cW
    const pts    = candles.map((c, i) => `${px(i)},${py(c.close)}`).join(' ')
    const isUp   = closes[closes.length - 1] >= closes[0]
    const lc     = isUp ? '#ef4444' : '#3b82f6'
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', background: '#0f172a', borderRadius: '8px' }}>
        {Array.from({ length: 5 }, (_, i) => {
          const v = min + (range / 5) * i, y = py(v)
          return (
            <g key={i}>
              <line x1={pL} x2={pL + cW} y1={y} y2={y} stroke="#1e293b" strokeDasharray="3,3"/>
              <text x={pL - 4} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">{Math.round(v).toLocaleString()}</text>
            </g>
          )
        })}
        <defs>
          <linearGradient id="lg2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lc} stopOpacity="0.2"/>
            <stop offset="100%" stopColor={lc} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={`${pL},${pT + cH} ${pts} ${pL + cW},${pT + cH}`} fill="url(#lg2)"/>
        <polyline points={pts} fill="none" stroke={lc} strokeWidth="1.8"/>
        {candles.filter((_, i) => i % (Math.floor(candles.length / 6) || 1) === 0).map((c, i) => (
          <text key={i} x={px(candles.indexOf(c))} y={H - 8} textAnchor="middle" fontSize="10" fill="#64748b">
            {String(c.date || '').slice(4, 8).replace(/(\d{2})(\d{2})/, '$1/$2')}
          </text>
        ))}
      </svg>
    )
  }

  return (
    <div className="chart-modal-overlay" onClick={onClose}>
      <div className="chart-modal" onClick={e => e.stopPropagation()}>
        <div className="chart-modal-header">
          <div className="chart-modal-title">
            <span className="chart-modal-name">{item.label}</span>
            <span className="chart-modal-price" style={{ color: rateColor(item.changeRate) }}>
              {item.price?.toLocaleString(undefined, { maximumFractionDigits: 4 })} ({fmtRate(item.changeRate)})
            </span>
          </div>
          <div className="chart-modal-actions">
            <div className="chart-period-tabs">
              {PERIODS.map(p => (
                <button key={p.v} className={`chart-period-btn ${period === p.v ? 'active' : ''}`}
                  onClick={() => { setPeriod(p.v); fetchChart(p.v) }}>{p.l}</button>
              ))}
            </div>
            <button className="chart-modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="chart-modal-body">
          {loading && <div className="chart-loading"><div className="spinner-lg"/>로딩 중...</div>}
          {error   && <div className="chart-error">⚠️ {error}</div>}
          {!loading && !error && renderChart()}
        </div>
      </div>
    </div>
  )
}


// ── AI 브리핑 카드 ────────────────────────────────────
function AiBriefingCard() {
  const [briefing,    setBriefing]    = useState(() => {
    try {
      const raw = localStorage.getItem(LS_BRIEFING)
      if (!raw) return null
      const { data, date } = JSON.parse(raw)
      const today = new Date().toISOString().slice(0,10)
      return date === today ? data : null
    } catch { return null }
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [open,    setOpen]    = useState(!!briefing)

  const run = async () => {
    const key = import.meta.env.VITE_CLAUDE_API_KEY
    if (!key) { setError('Claude API 키 미설정'); return }
    setLoading(true); setError('')
    try {
      const today = new Date().toLocaleDateString('ko-KR')
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 800,
          tools: [{ type:'web_search_20250305', name:'web_search' }],
          messages: [{ role:'user', content:
            `오늘(${today}) 한국 주식시장 AI 브리핑을 작성해줘. 웹 검색으로 최신 뉴스를 찾아서 작성해.

## 📊 오늘의 시장 요약
## 🔑 핵심 이슈 (3가지)
## 🌏 글로벌 변수
## 🎯 오늘 주목할 섹터
## ⚠️ 리스크 요인

간결하게 핵심만 작성해줘.` }],
        }),
      })
      const data = await res.json()
      const text = data.content?.filter(b => b.type==='text').map(b => b.text).join('\n') || ''
      if (!text) throw new Error('응답 없음')
      setBriefing(text); setOpen(true)
      const today2 = new Date().toISOString().slice(0,10)
      localStorage.setItem(LS_BRIEFING, JSON.stringify({ data:text, date:today2 }))
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <section className="dash-section db-briefing-section">
      <div className="db-section-header">
        <span className="db-section-label">🤖 AI 시장 브리핑<span className="db-briefing-badge">web_search</span></span>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {briefing && <button className="db-briefing-toggle" onClick={() => setOpen(v=>!v)}>{open?'▲ 접기':'▼ 펼치기'}</button>}
          <button className="btn-outline db-briefing-btn" onClick={run} disabled={loading}>
            {loading ? '⟳ 검색 중...' : briefing ? '↺ 다시 분석' : '🔍 오늘 브리핑 생성'}
          </button>
        </div>
      </div>
      {error && <div className="db-briefing-error">⚠️ {error}</div>}
      {loading && (
        <div className="db-briefing-loading">
          <div className="db-briefing-spinner"/>
          <span>웹에서 오늘 시장 정보 검색 중...</span>
        </div>
      )}
      {briefing && open && !loading && (
        <div className="db-briefing-content">
          <pre className="db-briefing-text">{briefing}</pre>
          <div className="db-briefing-meta">오늘({new Date().toLocaleDateString('ko-KR')}) 자동 저장 · 내일 새로 생성</div>
        </div>
      )}
      {!briefing && !loading && !error && (
        <div className="db-briefing-placeholder">
          🔍 버튼을 눌러 오늘 시장 브리핑을 생성하세요 · 하루 1회 자동 저장
        </div>
      )}
    </section>
  )
}

// ── 메인 ─────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth()

  const [dashData,       setDashData]       = useState(() => lsRead(LS_DASH,   getDashTTL()))
  const [fetchError,     setFetchError]     = useState(false)
  const [globalData,     setGlobalData]     = useState(() => lsRead(LS_GLOBAL, 300000))
  const [sparkData,      setSparkData]      = useState(() => lsRead(LS_SPARK,  3600000) || {})
  const [loading,        setLoading]        = useState(() => !lsRead(LS_DASH,  getDashTTL()))
  const [globalLoading,  setGlobalLoading]  = useState(() => !lsRead(LS_GLOBAL, 300000))
  const [lastFetch,      setLastFetch]      = useState('')
  const [chartItem,      setChartItem]      = useState(null)
  const [activeIds,      setActiveIds]      = useState(DEFAULT_ACTIVE_IDS)
  const [activeIdsReady, setActiveIdsReady] = useState(false)
  const [showSetting,    setShowSetting]    = useState(false)

  const timerRef    = useRef(null)
  const globalTimer = useRef(null)
  const stateCheck  = useRef(null)
  const isFetching  = useRef(false)

  // Firebase에서 테마 설정 로드
  useEffect(() => {
    if (!user?.uid) { setActiveIdsReady(true); return }
    getDoc(doc(db, 'user_prefs', user.uid))
      .then(snap => {
        if (snap.exists() && snap.data()[THEME_DOC_KEY]) {
          setActiveIds(snap.data()[THEME_DOC_KEY])
        }
      })
      .catch(() => {})
      .finally(() => setActiveIdsReady(true))
  }, [user?.uid])

  const visibleThemes = ALL_THEMES.filter(t => activeIds.includes(t.id))

  const getNeededCodes = useCallback(() =>
    visibleThemes.flatMap(t => [
      ...t.etf.slice(0, 1).map(e => e.code),
      ...t.stocks.map(s => s.code),
    ])
  , [visibleThemes.map(t => t.id).join(',')])

  // 대시보드 데이터 fetch
  const fetchDashboard = useCallback(async (force = false) => {
    if (isFetching.current) return
    if (!force && lsRead(LS_DASH, getDashTTL())) { setLoading(false); return }
    isFetching.current = true
    const codes = getNeededCodes()
    if (!codes.length) { isFetching.current = false; return }
    try {
      const res = await fetch(`/api/kis?type=dashboard&codes=${codes.join(',')}`).then(r => r.json())
      if (res.error) throw new Error(res.error)
      setDashData(res)
      lsWrite(LS_DASH, res)
      setLastFetch(getNowTime())
    } catch (e) {
      console.error('[dashboard]', e)
      setFetchError(true)
    }
    finally { setLoading(false); isFetching.current = false }
  }, [getNeededCodes])

  // 스파크라인 (1시간 캐시, 비블로킹)
  const fetchSpark = useCallback(async () => {
    if (lsRead(LS_SPARK, 3600000)) return
    try {
      const [k, q] = await Promise.all([
        fetch('/api/kis?type=index-chart&market=J&days=20').then(r => r.json()).catch(() => ({})),
        fetch('/api/kis?type=index-chart&market=Q&days=20').then(r => r.json()).catch(() => ({})),
      ])
      const s = { KOSPI: (k.candles || []).map(c => c.close), KOSDAQ: (q.candles || []).map(c => c.close) }
      setSparkData(s)
      lsWrite(LS_SPARK, s)
    } catch {}
  }, [])

  // 글로벌 데이터 (5분 캐시)
  const fetchGlobal = useCallback(async (force = false) => {
    if (!force && lsRead(LS_GLOBAL, 300000)) { setGlobalLoading(false); return }
    try {
      const results = await Promise.allSettled(
        GLOBAL_SYMS.map(sym => fetch(`/api/kis?type=global&symbol=${sym}`).then(r => r.json()))
      )
      const map = {}
      results.forEach((r, i) => { if (r.status === 'fulfilled' && !r.value.error) map[GLOBAL_SYMS[i]] = r.value })
      setGlobalData(map)
      lsWrite(LS_GLOBAL, map)
    } catch (e) { console.error('[global]', e) }
    finally { setGlobalLoading(false) }
  }, [])

  // 글로벌/스파크는 즉시 시작 (Firebase 대기 불필요)
  useEffect(() => {
    fetchGlobal(true)
    fetchSpark()
    globalTimer.current = setInterval(() => fetchGlobal(true), isUSMarketOpen() ? 60000 : 300000)
    return () => clearInterval(globalTimer.current)
  }, [fetchGlobal, fetchSpark])

  // 대시보드는 activeIdsReady 후 시작
  useEffect(() => {
    if (!activeIdsReady) return
    fetchDashboard(true)
    const setupTimer = () => {
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => fetchDashboard(true), isMarketOpen() ? 30000 : 300000)
    }
    setupTimer()
    stateCheck.current = setInterval(setupTimer, 60000)
    return () => {
      clearInterval(timerRef.current)
      clearInterval(stateCheck.current)
    }
  }, [activeIdsReady, fetchDashboard])

  const handleThemeChange = async ids => {
    setActiveIds(ids)
    if (user?.uid) setDoc(doc(db, 'user_prefs', user.uid), { [THEME_DOC_KEY]: ids }, { merge: true }).catch(() => {})
    localStorage.removeItem(LS_DASH)
    setTimeout(() => fetchDashboard(true), 100)
  }

  const kstStatus = getKstStatus()
  const isOpen    = kstStatus === 'open'
  const isAfter   = kstStatus === 'after'

  const stMap = {
    open:      { label: '정규장 운영중', color: '#16a34a', dot: true  },
    premarket: { label: '장 시작 전',   color: '#d97706', dot: false },
    after:     { label: '시간외 거래',  color: '#7c3aed', dot: true  },
    holiday:   { label: '휴장일',       color: '#64748b', dot: false },
    closed:    { label: '장 마감',      color: '#64748b', dot: false },
  }
  const st = stMap[kstStatus] || stMap.closed

  const priceMap = {}
  dashData?.prices?.forEach(p => { if (p?.code) priceMap[p.code] = p })

  const renderChartModal = () => {
    if (!chartItem) return null
    if (chartItem.isStock) return (
      <StockChartModal stock={{ name: chartItem.label, code: chartItem.code }} onClose={() => setChartItem(null)}/>
    )
    if (chartItem.type === 'index') return (
      <ChartModal isIndex inds_cd={marketToInds(chartItem.market)} name={chartItem.label} initialPeriod="day" onClose={() => setChartItem(null)}/>
    )
    return <LegacyChartModal item={chartItem} onClose={() => setChartItem(null)}/>
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
              {lastFetch && <span style={{ color: '#94a3b8' }}> · {lastFetch} 기준</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <QuickLinks/>
            <div className="db-status-badge" style={{ background: st.color + '18', color: st.color, borderColor: st.color + '40' }}>
              {st.dot && <span className="db-status-dot" style={{ background: st.color }}/>}
              {st.label}
            </div>
            <button className="btn-outline db-refresh-btn"
              onClick={() => { localStorage.removeItem(LS_DASH); localStorage.removeItem(LS_GLOBAL); fetchDashboard(true); fetchGlobal(true) }}
              disabled={loading}>⟳</button>
          </div>
        </div>
      </div>

      {/* 장 상태 배너 */}
      {!isOpen && !isAfter && dashData && (
        <div className="db-closed-banner">
          📅 현재 장 마감 상태 · 표시된 데이터는 <b>전일 종가 기준</b>
        </div>
      )}
      {isAfter && (
        <div className="db-after-banner">
          ⏱ 시간외 단일가 거래 중 (15:30~18:00) · 시간외 거래 종목은 실시간 가격 표시
        </div>
      )}
      {fetchError && !loading && (
        <div className="db-fetch-error">
          ⚠️ 데이터 로드 실패 (KIS API 응답 없음)
          <button className="db-fetch-retry-btn" onClick={() => {
            setFetchError(false)
            localStorage.removeItem(LS_DASH)
            fetchDashboard(true)
          }}>
            ↺ 재시도
          </button>
        </div>
      )}

      {/* 지수·환율·해외 */}
      <section className="dash-section">
        <div className="db-section-header">
          <span className="db-section-label">
            실시간 지수 · 환율
            {isOpen  && <span className="db-live-badge"> ● LIVE</span>}
            {isAfter && <span className="db-after-badge"> ⏱ 시간외</span>}
            {!isOpen && !isAfter && <span className="db-closed-note"> 전일 마감 기준</span>}
          </span>
          <span className="db-section-note">
            {isOpen ? 'KIS · 30초 갱신' : isAfter ? 'KIS · 2분 갱신' : 'KIS · 5분 갱신'}
          </span>
        </div>
        <div className="db-index-grid">
          <IndexCard data={dashData?.kospi}  loading={loading} color="#2563eb" label="KOSPI"  sparkData={sparkData.KOSPI}  onChartClick={setChartItem}/>
          <IndexCard data={dashData?.kosdaq} loading={loading} color="#16a34a" label="KOSDAQ" sparkData={sparkData.KOSDAQ} onChartClick={setChartItem}/>
        </div>
        <ForexSection forex={dashData?.forex} loading={loading} onChartClick={setChartItem}/>
        <GlobalSection globalData={globalData} loading={globalLoading} onChartClick={setChartItem}/>
        {isUSMarketOpen() && <div className="db-us-live">🇺🇸 미국 시장 운영중 · 해외지수 60초 자동 갱신</div>}
      </section>

      {/* 테마 현황 */}
      <section className="dash-section">
        <div className="db-section-header">
          <span className="db-section-label">
            테마 현황
            {isOpen  && <span className="db-live-badge"> ● LIVE</span>}
            {isAfter && <span className="db-after-badge"> ⏱ 시간외</span>}
            {!isOpen && !isAfter && <span className="db-closed-note"> 전일 마감 기준</span>}
          </span>
          <button className="btn-outline db-theme-setting-btn" onClick={() => setShowSetting(true)}>⚙️ 테마 설정</button>
        </div>

        {loading ? (
          <div className="db-theme-grid">
            {visibleThemes.map(t => (
              <div key={t.id} className="db-theme-card" style={{ '--tc': t.color }}>
                <div className="db-theme-card-header">
                  <span className="db-theme-emoji">{t.emoji}</span>
                  <span className="db-theme-label" style={{ color: t.color }}>{t.label}</span>
                </div>
                <Skeleton h={32} r={6} mb={8}/>
                {[1, 2, 3].map(i => <Skeleton key={i} h={24} r={4} mb={4}/>)}
              </div>
            ))}
          </div>
        ) : (
          <div className="db-theme-grid">
            {visibleThemes.map(t => {
              const topEtf = t.etf.sort((a, b) => b.cap - a.cap)[0]
              const ep     = priceMap[topEtf?.code]
              return (
                <div key={t.id} className="db-theme-card" style={{ '--tc': t.color }}>
                  <div className="db-theme-card-header">
                    <span className="db-theme-emoji">{t.emoji}</span>
                    <span className="db-theme-label" style={{ color: t.color }}>{t.label}</span>
                  </div>

                  {topEtf && (
                    <button className="db-etf-chip" onClick={() => setChartItem({ isStock: true, code: topEtf.code, label: topEtf.name })}>
                      <span className="db-etf-badge">ETF</span>
                      <span className="db-etf-name">{topEtf.name}</span>
                      {ep?.price > 0
                        ? <span className="db-etf-price" style={{ color: rateColor(ep.changeRate) }}>
                            {fmt(ep.price)}{' '}
                            <span style={{ fontSize: '10px' }}>({fmtRate(ep.changeRate)})</span>
                            {ep.status === 'after' && <span style={{ fontSize: '9px', color: '#7c3aed', marginLeft: 2 }}>시간외</span>}
                          </span>
                        : <span className="db-etf-price" style={{ color: '#94a3b8' }}>—</span>}
                    </button>
                  )}

                  <div className="db-theme-stocks">
                    {t.stocks.map(s => {
                      const p = priceMap[s.code]
                      return (
                        <button key={s.code} className="db-stock-chip"
                          onClick={() => setChartItem({ isStock: true, code: s.code, label: s.name })}>
                          <span className="db-stock-name">{s.name}</span>
                          {p?.price > 0
                            ? <span className="db-stock-price" style={{ color: rateColor(p.changeRate) }}>
                                {fmt(p.price)}{' '}
                                <span style={{ fontSize: '10px' }}>({fmtRate(p.changeRate)})</span>
                                {p.status === 'after' && <span style={{ fontSize: '9px', color: '#7c3aed', marginLeft: 2 }}>시간외</span>}
                              </span>
                            : <span style={{ color: '#94a3b8', fontSize: '11px' }}>—</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <AiBriefingCard/>

      <div className="dash-footer-note">
        ✅ KIS API · {isOpen ? '장중 30초' : isAfter ? '시간외 2분' : '장외 5분'} 자동 갱신
        · 해외지수 {isUSMarketOpen() ? '미장 운영중 60초' : '5분'} 갱신
      </div>

      {showSetting && <ThemeSettingModal activeIds={activeIds} onChange={handleThemeChange} onClose={() => setShowSetting(false)}/>}
      {renderChartModal()}
    </div>
  )
}
