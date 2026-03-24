import { useState, useEffect, useCallback, useRef } from 'react'
import './DashboardPage.css'

// ── 테마 데이터 ───────────────────────────────────────
const THEMES = [
  { id:'semi',    label:'반도체·AI',  color:'#2563eb', emoji:'💻',
    stocks:['삼성전자','SK하이닉스','한미반도체'], codes:['005930','000660','042700'] },
  { id:'defense', label:'방산',        color:'#dc2626', emoji:'🛡️',
    stocks:['한화에어로','현대로템','LIG넥스원'],   codes:['012450','064350','079550'] },
  { id:'ship',    label:'조선',        color:'#0d9488', emoji:'🚢',
    stocks:['HD현대중공업','삼성중공업','한화오션'],  codes:['329180','010140','042660'] },
  { id:'nuclear', label:'원전·전력',   color:'#d97706', emoji:'⚡',
    stocks:['두산에너빌리티','효성중공업','일진전기'], codes:['034020','298040','103590'] },
  { id:'battery', label:'2차전지',     color:'#16a34a', emoji:'🔋',
    stocks:['LG에너지솔루션','삼성SDI','POSCO홀딩스'], codes:['373220','006400','005490'] },
  { id:'bio',     label:'바이오',      color:'#7c3aed', emoji:'🧬',
    stocks:['셀트리온','삼성바이오','HLB'],          codes:['068270','207940','028300'] },
  { id:'value',   label:'밸류업·금융', color:'#ea580c', emoji:'🏦',
    stocks:['KB금융','신한지주','하나금융'],          codes:['105560','055550','086790'] },
]

const ALL_CODES = THEMES.flatMap(t => t.codes)

const QUICK_LINKS = [
  { label:'네이버 증권',  url:'https://finance.naver.com',                                                  icon:'📊' },
  { label:'KRX 시장정보', url:'https://data.krx.co.kr',                                                     icon:'🏛️' },
  { label:'DART 공시',    url:'https://dart.fss.or.kr',                                                     icon:'📋' },
  { label:'한국은행',     url:'https://www.bok.or.kr',                                                      icon:'🏦' },
  { label:'거래량 상위',  url:'https://finance.naver.com/sise/sise_quant.naver',                            icon:'🔥' },
  { label:'외국인 순매수',url:'https://finance.naver.com/sise/foreign_list.naver',                          icon:'🌐' },
]

// ── 유틸 ─────────────────────────────────────────────
const fmt  = v => v != null && v !== 0 ? Number(v).toLocaleString() : '—'
const fmtR = v => { if (!v) return '0.00%'; const x=Number(v); return `${x>0?'+':''}${x.toFixed(2)}%` }
const fmtC = v => { if (!v) return '0'; const x=Number(v); return `${x>0?'+':''}${x.toLocaleString()}` }
const rc   = v => { const x=Number(v); return x>0?'#dc2626':x<0?'#2563eb':'#64748b' }

function getTodayStr() {
  const d    = new Date()
  const days = ['일','월','화','수','목','금','토']
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}

// ── AI 브리핑 유틸 ────────────────────────────────────
const SKEY = 'kstock_briefing'
function loadBriefing() {
  try {
    const p = JSON.parse(localStorage.getItem(SKEY)||'{}')
    if (p.date !== new Date().toLocaleDateString('ko-KR')) { localStorage.removeItem(SKEY); return {} }
    return p
  } catch { return {} }
}
async function fetchBriefingAI(apiKey) {
  const today = new Date().toLocaleDateString('ko-KR')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type':'application/json','x-api-key':apiKey,
      'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1000,
      tools: [{ type:'web_search_20250305', name:'web_search' }],
      messages: [{ role:'user', content:
        `웹 검색으로 오늘(${today}) 한국 증시 최신 뉴스를 찾아보고 투자자용 AI 브리핑을 작성해줘.\n\n## 📊 오늘의 시장 한줄 요약\n## 🔥 주목 테마 TOP 3\n## ⚠️ 리스크\n## 💡 투자 포인트\n## 📅 주요 일정\n\n반드시 웹 검색 기반으로 작성.` }]
    })
  })
  if (!res.ok) throw new Error(`API 오류 ${res.status}`)
  const data = await res.json()
  return data.content.filter(b=>b.type==='text').map(b=>b.text).join('\n')
}

// ── 지수 카드 ─────────────────────────────────────────
// ── SVG 캔들스틱 차트 ────────────────────────────────
// ── 차트 컴포넌트 (캔들 + 라인) ─────────────────────
function CandleChart({ candles, width = 860, height = 320, lineMode = false }) {
  if (!candles || candles.length === 0) return (
    <div className="chart-empty">데이터 없음</div>
  )

  const pad = { top: 20, bottom: 40, left: 68, right: 12 }
  const W   = width  - pad.left - pad.right
  const H   = height - pad.top  - pad.bottom

  // 가격 범위
  const closes = candles.map(c => c.close).filter(v => v > 0)
  const highs  = candles.map(c => c.high  || c.close).filter(v => v > 0)
  const lows   = candles.map(c => c.low   || c.close).filter(v => v > 0)
  const minP   = Math.min(...lows)
  const maxP   = Math.max(...highs)
  const range  = maxP - minP || 1
  // 5% 여백
  const minV   = minP - range * 0.05
  const maxV   = maxP + range * 0.05
  const rng    = maxV - minV

  const xOf = i => pad.left + (i + 0.5) * (W / candles.length)
  const yOf = v => pad.top  + H * (1 - (v - minV) / rng)

  // Y축 눈금 (5개, 보기 좋게 반올림)
  const magnitude = Math.pow(10, Math.floor(Math.log10(range / 4)))
  const step      = Math.ceil((range / 4) / magnitude) * magnitude
  const startTick = Math.ceil(minV / step) * step
  const yTicks    = []
  for (let v = startTick; v <= maxV + step * 0.1; v += step) {
    if (v >= minV && v <= maxV) yTicks.push(Math.round(v * 100) / 100)
  }

  // X축 눈금 (월 또는 주 변경점, 최대 10개)
  const xLabels = []
  candles.forEach((c, i) => {
    const prev = candles[i - 1]
    const month = c.date?.slice(4, 6)
    const prevMonth = prev?.date?.slice(4, 6)
    if (i === 0 || month !== prevMonth) {
      const mm = c.date?.slice(4, 6) || ''
      const dd = c.date?.slice(6, 8) || ''
      xLabels.push({ i, label: `${mm}/${dd}` })
    }
  })
  // 너무 많으면 균등 간격
  const maxLabels = Math.floor(W / 60)
  const filteredX = xLabels.length > maxLabels
    ? xLabels.filter((_, i) => i % Math.ceil(xLabels.length / maxLabels) === 0)
    : xLabels

  // 캔들 너비
  const cw = Math.max(1.5, Math.min(12, W / candles.length - 1))

  // 라인차트용 polyline
  const linePoints = candles.map((c, i) => `${xOf(i)},${yOf(c.close)}`).join(' ')

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`}
         style={{ display: 'block', background: '#0f172a', borderRadius: '8px' }}>

      {/* 그리드 + Y축 레이블 */}
      {yTicks.map((v, i) => {
        const y = yOf(v)
        const label = v >= 10000
          ? (v / 1).toLocaleString('ko-KR', { maximumFractionDigits: 0 })
          : v >= 100
            ? v.toLocaleString('ko-KR', { maximumFractionDigits: 1 })
            : v.toFixed(4)
        return (
          <g key={i}>
            <line x1={pad.left} x2={pad.left + W} y1={y} y2={y}
              stroke="#1e293b" strokeWidth="1" strokeDasharray="4,3"/>
            <text x={pad.left - 6} y={y + 4} textAnchor="end"
              fontSize="10" fill="#64748b" fontFamily="monospace">
              {label}
            </text>
          </g>
        )
      })}

      {/* X축 레이블 */}
      {filteredX.map(({ i, label }) => (
        <text key={i} x={xOf(i)} y={height - 8} textAnchor="middle"
          fontSize="10" fill="#64748b">{label}</text>
      ))}

      {/* 축 테두리 */}
      <line x1={pad.left} x2={pad.left} y1={pad.top} y2={pad.top + H}
        stroke="#334155" strokeWidth="1"/>
      <line x1={pad.left} x2={pad.left + W} y1={pad.top + H} y2={pad.top + H}
        stroke="#334155" strokeWidth="1"/>

      {/* 라인 차트 (환율·외국지수) */}
      {lineMode && (
        <>
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3"/>
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <polygon
            points={`${pad.left},${pad.top + H} ${linePoints} ${pad.left + W},${pad.top + H}`}
            fill="url(#lineGrad)"/>
          <polyline points={linePoints} fill="none"
            stroke="#3b82f6" strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round"/>
          {/* 현재가 수평선 */}
          {closes.length > 0 && (() => {
            const last = closes[closes.length - 1]
            const ly   = yOf(last)
            return (
              <line x1={pad.left} x2={pad.left + W} y1={ly} y2={ly}
                stroke="#f59e0b" strokeWidth="1" strokeDasharray="6,3" opacity="0.6"/>
            )
          })()}
        </>
      )}

      {/* 캔들 차트 */}
      {!lineMode && candles.map((c, i) => {
        if (!c.close || c.close <= 0) return null
        const up  = c.close >= c.open
        const clr = up ? '#ef4444' : '#3b82f6'
        const x   = xOf(i)
        const yH  = yOf(c.high  || Math.max(c.open, c.close))
        const yL  = yOf(c.low   || Math.min(c.open, c.close))
        const yO  = yOf(Math.max(c.open || c.close, c.close))
        const yC  = yOf(Math.min(c.open || c.close, c.close))
        const bH  = Math.max(1.5, Math.abs(yL - yO))
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={yH} y2={yL} stroke={clr} strokeWidth="1"/>
            <rect x={x - cw / 2} y={yO} width={cw} height={bH}
              fill={clr} rx="0.5" opacity="0.9"/>
          </g>
        )
      })}
    </svg>
  )
}

// ── 차트 팝업 모달 ────────────────────────────────────
function ChartModal({ item, onClose }) {
  const [candles, setCandles] = useState([])
  const [period,  setPeriod]  = useState('D')
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  // 타입별 기간 옵션
  const PERIODS = item.type === 'stock'
    ? [{ v:'D', l:'일봉' }, { v:'W', l:'주봉' }, { v:'M', l:'월봉' }]
    : item.type === 'index'
      ? [{ v:'D', l:'일봉(3개월)' }, { v:'W', l:'주봉(1년)' }]
      : item.type === 'global'
        ? [{ v:'3mo', l:'3개월' }, { v:'6mo', l:'6개월' }, { v:'1y', l:'1년' }]
        : item.type === 'forex'
          ? [{ v:'90', l:'3개월' }, { v:'365', l:'1년' }, { v:'1825', l:'5년' }]
          : [{ v:'D', l:'일봉' }]

  const isLineMode = item.type === 'forex' || item.type === 'global'

  const fetchChart = useCallback(async (p) => {
    setLoading(true); setError('')
    try {
      let url = ''
      if (item.type === 'stock') {
        url = `/api/kis?type=chart&code=${item.code}&period=${p}`
      } else if (item.type === 'index') {
        const days = p === 'D' ? 65 : 260
        url = `/api/kis?type=index-chart&market=${item.market}&days=${days}`
      } else if (item.type === 'global') {
        url = `/api/kis?type=global&symbol=${item.sym}&range=${p}`
      } else if (item.type === 'forex') {
        url = `/api/kis?type=forex-chart&pair=${item.pair}&days=${p}`
      }
      const res  = await fetch(url)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setCandles(json.candles || [])
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [item])

  useEffect(() => { fetchChart(PERIODS[0].v) }, [fetchChart])
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const priceStr = item.type === 'forex' || item.type === 'global'
    ? (item.price || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })
    : fmt(item.price)

  const chartW = typeof window !== 'undefined'
    ? Math.min(window.innerWidth - 48, 880) : 880

  return (
    <div className="chart-modal-overlay" onClick={onClose}>
      <div className="chart-modal" onClick={e=>e.stopPropagation()}>
        <div className="chart-modal-header">
          <div className="chart-modal-title">
            <span className="chart-modal-name">{item.label}</span>
            {item.code && <span className="chart-modal-code">{item.code}</span>}
            <span className="chart-modal-price" style={{color: rc(item.changeRate)}}>
              {priceStr} ({fmtR(item.changeRate)})
            </span>
          </div>
          <div className="chart-modal-actions">
            <div className="chart-period-tabs">
              {PERIODS.map(p=>(
                <button key={p.v}
                  className={`chart-period-btn ${period===p.v?'active':''}`}
                  onClick={()=>{ setPeriod(p.v); fetchChart(p.v) }}>{p.l}</button>
              ))}
            </div>
            {item.naverUrl && (
              <a href={item.naverUrl} target="_blank" rel="noreferrer"
                 className="chart-naver-btn">네이버 →</a>
            )}
            <button className="chart-modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="chart-modal-body">
          {loading && <div className="chart-loading"><div className="spinner-lg"/>차트 로딩 중...</div>}
          {error && !loading && <div className="chart-error">⚠️ {error}</div>}
          {!loading && !error && (
            <CandleChart
              candles={candles}
              width={chartW}
              height={360}
              lineMode={isLineMode}
            />
          )}
        </div>
        <div className="chart-modal-footer">
          <span>
            {item.type==='global' ? '📊 Yahoo Finance'
            :item.type==='forex'  ? '💱 Frankfurter API'
            :'📈 KIS API'}
          </span>
          {isLineMode && <span style={{color:'#64748b',fontSize:'11px'}}>라인 차트</span>}
          {item.status==='closed' && <span className="chart-closed-note">📅 장 마감 기준</span>}
        </div>
      </div>
    </div>
  )
}

// ── 지수 카드 (스파크라인 + 클릭 차트) ───────────────
function IndexCard({ data, loading, color, label, onChartClick }) {
  const [sparkline, setSparkline] = useState([])

  useEffect(() => {
    if (!data) return
    const market = data.market
    fetch(`/api/kis?type=index-chart&market=${market}&days=20`)
      .then(r=>r.json())
      .then(j=>{ if (j.candles) setSparkline(j.candles.map(c=>c.close)) })
      .catch(()=>{})
  }, [data?.market, data?.price])

  if (loading) return (
    <div className="kis-index-card" style={{'--ic':color}}>
      <div className="kis-index-top"><span className="kis-index-label">{label}</span></div>
      <div className="kis-loading">로딩 중...</div>
    </div>
  )
  if (!data) return (
    <div className="kis-index-card" style={{'--ic':color}}>
      <div className="kis-index-top"><span className="kis-index-label">{label}</span></div>
      <div className="kis-error-small">데이터 없음</div>
    </div>
  )
  const closed   = data.status === 'closed'
  const priceClr = closed ? '#64748b' : rc(data.changeRate)

  return (
    <div className="kis-index-card kis-index-card--clickable"
         style={{'--ic':color}}
         onClick={()=>onChartClick && onChartClick({
           type:'index', market:data.market, label,
           price:data.price, changeRate:data.changeRate, status:data.status
         })}>
      <div className="kis-index-main">
        <div>
          <div className="kis-index-top">
            <span className="kis-index-label">{label}</span>
            {closed
              ? <span className="kis-closed-badge">장 마감</span>
              : <span className="kis-live-badge">● LIVE</span>}
          </div>
          <div className="kis-index-price" style={{color:priceClr}}>{fmt(data.price)}</div>
          <div className="kis-index-change" style={{color:priceClr}}>
            {fmtC(data.change)} ({fmtR(data.changeRate)})
          </div>
          <div className="kis-index-sub">
            {closed
              ? `📅 ${data.closeDate||'최근 종가'} · 고 ${fmt(data.high)} · 저 ${fmt(data.low)}`
              : `고 ${fmt(data.high)} · 저 ${fmt(data.low)}`}
          </div>
        </div>
        {sparkline.length >= 2 && (
          <div className="kis-index-sparkline">
            <Sparkline values={sparkline}
              color={data.changeRate >= 0 ? '#ef4444' : '#3b82f6'}/>
            <span className="kis-chart-hint">차트 보기</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 환율 카드 ─────────────────────────────────────────
// ── 스파크라인 SVG ────────────────────────────────────
function Sparkline({ values, color }) {
  if (!values || values.length < 2) return null
  const W = 80, H = 28
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W
    const y = H - ((v - min) / range) * (H - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
         style={{display:'block',flexShrink:0}}>
      <polyline points={pts} fill="none"
        stroke={color} strokeWidth="1.8"
        strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

// ── 환율 카드 (스파크라인 포함) ───────────────────────
// ── 해외지수 카드 ─────────────────────────────────────
const GLOBAL_INDICES = [
  { sym:'SP500',  label:'S&P 500',    color:'#dc2626' },
  { sym:'NASDAQ', label:'NASDAQ',     color:'#0d9488' },
  { sym:'DOW',    label:'DOW',        color:'#2563eb' },
  { sym:'US10Y',  label:'미 국채 10Y', color:'#7c3aed' },
  { sym:'N225',   label:'닛케이 225', color:'#ea580c' },
  { sym:'WTI',    label:'WTI 유가',   color:'#16a34a' },
]

function GlobalCard({ sym, label, color, onChartClick }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/kis?type=global&symbol=${sym}`)
      .then(r => r.json())
      .then(j => { if (!j.error) setData(j) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [sym])

  const priceClr = data ? rc(data.changeRate) : color

  return (
    <div className="global-live-card"
         style={{'--gc': color}}
         onClick={() => data && onChartClick({
           type: 'global', sym, label, color,
           price: data.price, changeRate: data.changeRate,
         })}>
      <div className="global-card-label" style={{color}}>{label}</div>
      {loading && <div className="global-card-loading">로딩 중...</div>}
      {!loading && data && (
        <>
          <div className="global-card-price" style={{color: priceClr}}>
            {data.price?.toLocaleString(undefined, {maximumFractionDigits:2})}
          </div>
          <div className="global-card-change" style={{color: priceClr}}>
            {data.changeRate >= 0 ? '+' : ''}{data.changeRate?.toFixed(2)}%
          </div>
        </>
      )}
      {!loading && !data && (
        <div className="global-card-link">확인 →</div>
      )}
    </div>
  )
}

// ── 환율 카드 (클릭 → 차트 팝업) ─────────────────────
const FOREX_PAIRS = [
  { pair:'KRW', label:'USD/KRW', symbol:'₩', color:'#d97706', histKey:'krw' },
  { pair:'JPY', label:'USD/JPY', symbol:'¥', color:'#2563eb', histKey:'jpy' },
  { pair:'CNY', label:'USD/CNY', symbol:'¥', color:'#dc2626', histKey:'cny' },
]

function ForexCard({ forex, onChartClick }) {
  if (!forex) return null
  const hist = forex.history || {}

  return (
    <div className="forex-section">
      {FOREX_PAIRS.map(item => {
        const value = item.pair==='KRW' ? forex.usdKrw?.toLocaleString()
                    : item.pair==='JPY' ? forex.usdJpy
                    : forex.usdCny
        if (!value || value === 'undefined') return null
        const vals  = (hist[item.histKey] || []).filter(v => v > 0)
        const first = vals[0] || 0
        const last  = vals[vals.length-1] || 0
        const diff  = last - first
        const pct   = first ? ((diff/first)*100).toFixed(2) : '0.00'
        const up    = diff >= 0
        return (
          <div key={item.label} className="forex-card forex-card--clickable"
               onClick={() => onChartClick({
                 type:'forex', pair:item.pair, label:item.label,
                 price:last, changeRate:Number(pct),
               })}>
            <div className="forex-card-left">
              <span className="forex-label">{item.label}</span>
              <span className="forex-value">{item.symbol}{value}</span>
              <span className="forex-change" style={{color: up?'#dc2626':'#2563eb'}}>
                {up?'▲':'▼'} {Math.abs(Number(pct))}%
                <span className="forex-period"> 7일</span>
              </span>
              <span className="forex-chart-hint">차트 보기 →</span>
            </div>
            {vals.length >= 2 && <Sparkline values={vals} color={up?item.color:'#94a3b8'}/>}
          </div>
        )
      })}
    </div>
  )
}

// ── 메인 대시보드 ─────────────────────────────────────
export default function DashboardPage() {
  const saved = loadBriefing()
  const [dashData, setDashData]   = useState(null)
  const [loading, setLoading]     = useState(true)
  const [lastFetch, setLastFetch] = useState('')
  const [briefing, setBriefing]   = useState(saved.text || '')
  const [savedAt, setSavedAt]     = useState(saved.savedAt || '')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError]     = useState('')
  const [activeTheme, setActive]  = useState(null)
  const [chartItem,   setChart]   = useState(null) // 차트 팝업
  const timerRef = useRef(null)

  // ── 배치 데이터 fetch ─────────────────────────────
  const fetchDashboard = useCallback(async () => {
    try {
      const codes = ALL_CODES.join(',')
      const res   = await fetch(`/api/kis?type=dashboard&codes=${codes}`)
      const json  = await res.json()
      if (json.error) throw new Error(json.error)
      setDashData(json)
      const now = new Date()
      setLastFetch(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} 기준`)
    } catch (e) {
      console.error('Dashboard fetch error:', e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── 자동 갱신 타이머 ────────────────────────────────
  const setupTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    const now  = new Date()
    const mins = now.getHours() * 60 + now.getMinutes()
    const isOpen = mins >= 540 && mins < 930
    // 장중: 30초, 장외: 5분
    const interval = isOpen ? 30 * 1000 : 5 * 60 * 1000
    timerRef.current = setInterval(fetchDashboard, interval)
  }, [fetchDashboard])

  useEffect(() => {
    fetchDashboard()
    setupTimer()
    // 1시간마다 타이머 재설정 (장중/장외 전환 대응)
    const hourTimer = setInterval(setupTimer, 60 * 60 * 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      clearInterval(hourTimer)
    }
  }, [fetchDashboard, setupTimer])

  // ── AI 브리핑 ─────────────────────────────────────
  const handleAI = async () => {
    setAiLoading(true); setAiError('')
    try {
      const key = import.meta.env.VITE_CLAUDE_API_KEY
      if (!key) throw new Error('Claude API 키 없음')
      const text = await fetchBriefingAI(key)
      const now  = new Date()
      const hm   = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
      localStorage.setItem(SKEY, JSON.stringify({
        date: new Date().toLocaleDateString('ko-KR'), text, savedAt: hm
      }))
      setBriefing(text); setSavedAt(hm)
    } catch(e) { setAiError(e.message) }
    finally { setAiLoading(false) }
  }

  const marketStatus = dashData?.marketStatus || 'closed'
  const statusLabel  = {
    open:      { label:'정규장 운영중', color:'#16a34a', dot:true },
    premarket: { label:'장 시작 전',    color:'#d97706', dot:false },
    after:     { label:'시간외 거래',   color:'#7c3aed', dot:false },
    holiday:   { label:'휴장일',        color:'#64748b', dot:false },
    closed:    { label:'장 마감',       color:'#64748b', dot:false },
  }[marketStatus] || { label:'장 마감', color:'#64748b', dot:false }

  const priceMap = {}
  dashData?.prices?.forEach(p => { if (p?.code) priceMap[p.code] = p })

  return (
    <div className="dashboard">
      {/* 헤더 */}
      <div className="dash-header">
        <div className="dash-title-row">
          <div>
            <h1 className="dash-title">시장 대시보드</h1>
            <p className="dash-date">{getTodayStr()} · {lastFetch}</p>
          </div>
          <div className="market-status-badge"
               style={{background:statusLabel.color+'18',color:statusLabel.color,borderColor:statusLabel.color+'40'}}>
            {statusLabel.dot && <span className="status-dot" style={{background:statusLabel.color}}/>}
            {statusLabel.label}
          </div>
        </div>
      </div>

      {/* ✅ 실시간 지수 + 환율 */}
      <section className="dash-section">
        <div className="section-header">
          <div className="section-label">
            실시간 지수 · 환율
            {marketStatus === 'open' && <span className="live-badge"> ● LIVE</span>}
            {marketStatus !== 'open' && <span className="closed-badge"> 마감 기준</span>}
          </div>
          <span className="section-note">
            {marketStatus === 'open' ? 'KIS API · 30초 자동 갱신' : 'KIS API · 5분 자동 갱신'}
          </span>
        </div>

        <div className="kis-index-grid">
          <IndexCard data={dashData?.kospi}  loading={loading} color="#2563eb" label="KOSPI"  onChartClick={setChart}/>
          <IndexCard data={dashData?.kosdaq} loading={loading} color="#16a34a" label="KOSDAQ" onChartClick={setChart}/>
        </div>

        <ForexCard forex={dashData?.forex} onChartClick={setChart}/>

        {/* 해외 지수 실시간 */}
        <div className="global-grid" style={{marginTop:'12px'}}>
          {GLOBAL_INDICES.map(g => (
            <GlobalCard key={g.sym} {...g} onChartClick={setChart}/>
          ))}
        </div>
      </section>

      {/* AI 브리핑 */}
      <section className="dash-section">
        <div className="section-header">
          <div>
            <div className="section-label" style={{marginBottom:0}}>🔍 AI 시장 브리핑</div>
            {savedAt && <span className="briefing-saved-time">오늘 {savedAt} 저장됨</span>}
          </div>
          <div className="briefing-btn-group">
            {briefing && (
              <button className="briefing-clear-btn"
                onClick={()=>{localStorage.removeItem(SKEY);setBriefing('');setSavedAt('')}}>초기화</button>
            )}
            <button className={`ai-briefing-btn${aiLoading?' loading':''}`}
              onClick={handleAI} disabled={aiLoading}>
              {aiLoading ? <><span className="btn-spinner"/>검색 중...</> : briefing ? '↺ 다시 받기' : '🔍 AI 브리핑'}
            </button>
          </div>
        </div>
        {!briefing && !aiLoading && !aiError && (
          <div className="briefing-placeholder">
            <div className="placeholder-icon">🔍</div>
            <p>AI 브리핑 버튼을 눌러 오늘의 시장 분석을 받아보세요</p>
            <p className="placeholder-sub">웹 실시간 검색 기반 · 오늘 자동 저장</p>
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

      {/* ✅ 7대 테마 — 실시간 주가 포함 */}
      <section className="dash-section">
        <div className="section-label">
          7대 테마 현황
          {marketStatus === 'open' && <span className="live-badge"> ● LIVE</span>}
          {marketStatus !== 'open' && <span className="closed-badge"> 마감 기준</span>}
        </div>
        <div className="theme-grid">
          {THEMES.map(t => (
            <div key={t.id}
              className={`theme-card${activeTheme===t.id?' active':''}`}
              style={{'--theme-color':t.color}}
              onClick={()=>setActive(activeTheme===t.id?null:t.id)}>
              <div className="theme-card-top">
                <span className="theme-emoji">{t.emoji}</span>
                <span className="theme-name" style={{color:t.color}}>{t.label}</span>
              </div>
              <div className="theme-stocks-list">
                {t.stocks.map((name, i) => {
                  const p = priceMap[t.codes[i]]
                  return (
                    <button key={name} className="theme-stock-chip-price"
                      style={{'--theme-color':t.color}}
                      onClick={e=>{
                        e.stopPropagation()
                        setChart({
                          type: 'stock',
                          code: t.codes[i],
                          label: name,
                          price: p?.price,
                          changeRate: p?.changeRate,
                          status: p?.status,
                          naverUrl: `https://finance.naver.com/item/main.naver?code=${t.codes[i]}`
                        })
                      }}>
                      <span className="tsc-name">{name}</span>
                      {loading
                        ? <span className="tsc-price" style={{color:'#94a3b8'}}>로딩...</span>
                        : p && !p.error && p.price > 0
                          ? <span className="tsc-price" style={{color: rc(p.changeRate)}}>
                              {fmt(p.price)} ({fmtR(p.changeRate)})
                            </span>
                          : <span className="tsc-price tsc-chart-hint">차트 →</span>
                      }
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 하단 2컬럼 */}
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
            {[{time:'09:00',label:'정규장 시작'},{time:'15:30',label:'정규장 마감'},{time:'종일',label:'DART 공시 확인'}].map(s=>(
              <div key={s.time} className="schedule-item">
                <span className="schedule-time">{s.time}</span>
                <span className="schedule-label">{s.label}</span>
              </div>
            ))}
            <div className="schedule-divider"/>
            <a href="https://finance.naver.com/research/invest_list.naver" target="_blank" rel="noreferrer" className="schedule-link">📋 증권사 리포트 →</a>
            <a href="https://dart.fss.or.kr/dsac999/mainY.do" target="_blank" rel="noreferrer" className="schedule-link">📣 DART 공시 →</a>
            <a href="https://finance.naver.com/sise/sise_quant.naver" target="_blank" rel="noreferrer" className="schedule-link">🔥 거래량 상위 →</a>
          </div>
        </section>
      </div>

      <div className="dash-footer-note">
        ✅ KIS API 연동 · {marketStatus==='open'?'장중 30초':'장외 5분'} 자동 갱신 · 환율 ExchangeRate-API
      </div>

      {/* 차트 팝업 */}
      {chartItem && (
        <ChartModal item={chartItem} onClose={()=>setChart(null)}/>
      )}
    </div>
  )
}
