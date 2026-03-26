import { useState, useEffect, useCallback } from 'react'
import StockChartModal from '../components/StockChartModal'
import { useStockPrices } from '../hooks/useKiwoomPrice'
import { fmt, fmtRate, rateColor, fmtShort } from '../utils/format'
import { ALL_THEMES } from '../constants/themes'
import './ETFPage.css'

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

// ── 운용사 목록 ──────────────────────────────
const COMPANIES = [
  { code:'0000', name:'전체'        },
  { code:'3020', name:'KODEX(삼성)'  },
  { code:'3191', name:'TIGER(미래)'  },
  { code:'3228', name:'KINDEX(한투)' },
  { code:'3023', name:'KStar(KB)'    },
  { code:'3022', name:'아리랑(한화)' },
  { code:'3027', name:'KOSEF(키움)'  },
]

// ── 테마 ETF 매핑 ────────────────────────────
const THEME_ETFS = ALL_THEMES.map(t => ({
  theme:  t.label,
  color:  t.color,
  emoji:  t.emoji,
  etfs:   t.etf.map(e => ({ ...e })),
  stocks: t.stocks.map(s => ({ ...s })),
}))

// 코드 → 테마 역매핑 (ETF코드 → 테마 객체)
const ETF_TO_THEME = {}
THEME_ETFS.forEach(t => { t.etfs.forEach(e => { ETF_TO_THEME[e.code] = t }) })

// 전체 테마 주가 조회 코드
const ALL_THEME_CODES = [...new Set(
  THEME_ETFS.flatMap(t => [...t.etfs.map(e => e.code), ...t.stocks.map(s => s.code)])
)]

// AI ETF 분석
async function runEtfAI(etfName, etfCode) {
  const today = new Date().toLocaleDateString('ko-KR')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content:
        `오늘(${today}) ${etfName}(${etfCode}) ETF를 분석해줘.
## 📌 ETF 개요 및 추적지수
## 📈 최근 성과 및 현황
## 🔑 편입 핵심 종목 동향
## 📊 수급 분석 (외인·기관)
## ⚠️ 리스크 요인
## 💡 투자 포인트
웹 검색으로 오늘 최신 정보를 찾아서 분석해줘.` }],
    }),
  })
  if (!res.ok) throw new Error(`API 오류 ${res.status}`)
  const data = await res.json()
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
}

// ── ETF 행 컴포넌트 ──────────────────────────
function EtfRow({ etf, onClick }) {
  const pc   = rateColor(etf.pre_rt)
  const sign = etf.pre_rt > 0 ? '+' : ''
  const gap  = etf.nav_gap_rt
  const gapColor = Math.abs(gap) < 0.1 ? '#64748b' : gap > 0 ? '#ef4444' : '#3b82f6'
  return (
    <div className="etf-row" onClick={() => onClick(etf)}>
      <div className="etf-row-name">
        <div className="etf-row-nm">{etf.stk_nm}</div>
        <div className="etf-row-cd">{etf.stk_cd}</div>
      </div>
      <div className="etf-row-price" style={{ color: pc, fontWeight: 700 }}>{fmt(etf.close_pric)}</div>
      <div className="etf-row-change" style={{ color: pc }}>{sign}{etf.pre_rt?.toFixed(2)}%</div>
      <div className="etf-row-nav">{fmt(etf.nav)}</div>
      <div className="etf-row-gap" style={{ color: gapColor }}>{gap >= 0 ? '+' : ''}{gap?.toFixed(2)}%</div>
      <div className="etf-row-vol">{fmtShort(etf.trde_qty)}</div>
    </div>
  )
}

// ── 테마 ETF 카드 ────────────────────────────
function ThemeEtfCard({ theme, prices, onChartClick, onAnalyzeClick }) {
  const [expanded, setExpanded] = useState(null) // null | 'etf코드'

  return (
    <div className="etf-theme-card" style={{ '--tc': theme.color }}>
      {/* 헤더 */}
      <div className="etf-theme-header">
        <span className="etf-theme-emoji">{theme.emoji}</span>
        <span className="etf-theme-label" style={{ color: theme.color }}>{theme.theme}</span>
      </div>

      {/* ETF 목록 */}
      {theme.etfs.map(e => {
        const p    = prices[e.code]
        const pc   = p ? rateColor(p.changeRate) : '#94a3b8'
        const sign = p?.changeRate > 0 ? '+' : ''
        const isOpen = expanded === e.code

        return (
          <div key={e.code} className="etf-theme-etf-wrap">
            {/* ETF 행 */}
            <button
              className={`etf-theme-item ${isOpen ? 'open' : ''}`}
              onClick={() => setExpanded(isOpen ? null : e.code)}>
              <span className="etf-theme-item-name">{e.name}</span>
              {p?.price > 0
                ? <span className="etf-theme-item-price" style={{ color: pc }}>
                    {fmt(p.price)}
                    <span className="etf-theme-item-rate">({sign}{p.changeRate?.toFixed(2)}%)</span>
                  </span>
                : <span className="etf-theme-item-code">{e.code}</span>}
              <span className="etf-theme-expand">{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* 구성종목 펼치기 */}
            {isOpen && (
              <div className="etf-stocks-expanded">
                <div className="etf-stocks-label">📋 주요 구성종목</div>
                {theme.stocks.map(s => {
                  const sp   = prices[s.code]
                  const spc  = sp ? rateColor(sp.changeRate) : '#94a3b8'
                  const ssign = sp?.changeRate > 0 ? '+' : ''
                  return (
                    <button key={s.code} className="etf-stock-row"
                      onClick={() => onChartClick({ name: s.name, code: s.code })}>
                      <span className="etf-stock-name">{s.name}</span>
                      {sp?.price > 0
                        ? <>
                            <span className="etf-stock-price" style={{ color: spc }}>{fmt(sp.price)}원</span>
                            <span className="etf-stock-rate"  style={{ color: spc }}>{ssign}{sp.changeRate?.toFixed(2)}%</span>
                          </>
                        : <span className="etf-stock-code">{s.code}</span>}
                    </button>
                  )
                })}
                <div className="etf-stocks-actions">
                  <button className="etf-chart-btn"
                    onClick={() => onChartClick({ name: e.name, code: e.code })}>
                    📊 ETF 차트
                  </button>
                  <button className="etf-analyze-btn"
                    onClick={() => onAnalyzeClick({ stk_nm: e.name, stk_cd: e.code })}>
                    🤖 AI 분석
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════
export default function ETFPage() {
  const [activeTab,    setActiveTab]    = useState('theme') // theme | all | analysis
  const [company,      setCompany]      = useState('0000')
  const [etfList,      setEtfList]      = useState([])
  const [etfLoading,   setEtfLoading]   = useState(false)
  const [etfError,     setEtfError]     = useState('')
  const [searchQuery,  setSearchQuery]  = useState('')
  const [sortBy,       setSortBy]       = useState('volume')
  const [sortDir,      setSortDir]      = useState('desc')
  const [selectedEtf,  setSelectedEtf]  = useState(null)
  const [chartEtf,     setChartEtf]     = useState(null)
  const [aiResult,     setAiResult]     = useState('')
  const [aiLoading,    setAiLoading]    = useState(false)
  const [aiError,      setAiError]      = useState('')
  const [themeFilter,  setThemeFilter]  = useState('전체')

  // ── 테마 종목 실시간 가격 (전체) ─────────────
  const { prices } = useStockPrices(ALL_THEME_CODES)

  // ── 전체 ETF 로드 ─────────────────────────────
  const loadEtfList = useCallback(async (co = company) => {
    setEtfLoading(true); setEtfError('')
    try {
      const res  = await fetch(`/api/kiwoom?type=etf-list&mngmcomp=${co}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const list = data.data || []
      if (list.length === 0) throw new Error('데이터 없음 — 장 마감 후 ETF 시세가 제공되지 않을 수 있습니다')
      setEtfList(list)
    } catch (e) {
      setEtfError(e.message)
    } finally {
      setEtfLoading(false)
    }
  }, [company])

  // 전체 ETF 탭 진입 시 자동 로드
  useEffect(() => {
    if (activeTab === 'all' && etfList.length === 0 && !etfError) {
      loadEtfList()
    }
  }, [activeTab])

  // ── 필터·정렬 ─────────────────────────────────
  const filtered = etfList
    .filter(e => !searchQuery || e.stk_nm.includes(searchQuery) || e.stk_cd.includes(searchQuery))
    .sort((a, b) => {
      const dir = sortDir === 'desc' ? -1 : 1
      if (sortBy === 'volume') return (a.trde_qty   - b.trde_qty)   * dir
      if (sortBy === 'change') return (a.pre_rt     - b.pre_rt)     * dir
      if (sortBy === 'gap')    return (Math.abs(a.nav_gap_rt) - Math.abs(b.nav_gap_rt)) * dir
      return 0
    })

  const toggleSort = col => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }
  const sortIcon = col => sortBy === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''

  // ── AI 분석 ───────────────────────────────────
  const runAI = async () => {
    if (!selectedEtf || !CLAUDE_KEY) return
    setAiLoading(true); setAiError(''); setAiResult('')
    try {
      const text = await runEtfAI(selectedEtf.stk_nm, selectedEtf.stk_cd)
      setAiResult(text)
    } catch (e) { setAiError(e.message) }
    finally { setAiLoading(false) }
  }

  const handleAnalyzeClick = (etf) => {
    setSelectedEtf(etf)
    setActiveTab('analysis')
    setAiResult(''); setAiError('')
  }

  const TABS = [
    { id:'theme',    label:'🎯 테마별 ETF' },
    { id:'all',      label:'📦 전체 ETF'   },
    { id:'analysis', label:'🔍 ETF 분석'   },
  ]

  return (
    <div className="etf-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">ETF</h1>
          <p className="page-sub">국내 ETF 시세 · NAV · 괴리율 · 테마별 분류 · AI 분석</p>
        </div>
      </div>

      <div className="etf-tabs-row">
        {TABS.map(t => (
          <button key={t.id}
            className={`etf-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ══ 테마별 ETF ══ */}
      {activeTab === 'theme' && (
        <div className="etf-section">
          {/* 테마 필터 */}
          <div className="etf-theme-filter">
            {['전체', ...THEME_ETFS.map(t => t.theme)].map(name => (
              <button key={name}
                className={`etf-chip ${themeFilter === name ? 'active' : ''}`}
                onClick={() => setThemeFilter(name)}>
                {name}
              </button>
            ))}
          </div>

          <div className="etf-theme-notice">
            💡 ETF를 클릭하면 <strong>구성종목과 실시간 가격</strong>이 펼쳐집니다
          </div>

          <div className="etf-theme-grid">
            {THEME_ETFS
              .filter(t => themeFilter === '전체' || t.theme === themeFilter)
              .map(t => (
                <ThemeEtfCard
                  key={t.theme}
                  theme={t}
                  prices={prices}
                  onChartClick={setChartEtf}
                  onAnalyzeClick={handleAnalyzeClick}
                />
              ))}
          </div>
        </div>
      )}

      {/* ══ 전체 ETF ══ */}
      {activeTab === 'all' && (
        <div className="etf-section">
          <div className="etf-filter-bar">
            <div className="etf-company-chips">
              {COMPANIES.map(c => (
                <button key={c.code}
                  className={`etf-chip ${company === c.code ? 'active' : ''}`}
                  onClick={() => { setCompany(c.code); loadEtfList(c.code) }}>
                  {c.name}
                </button>
              ))}
            </div>
            <div className="etf-search-wrap">
              <input className="etf-search-input" placeholder="ETF명 검색..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}/>
              <button className="etf-refresh-btn" onClick={() => { setEtfError(''); loadEtfList() }} disabled={etfLoading}>
                {etfLoading ? '⟳' : '↺ 갱신'}
              </button>
            </div>
          </div>

          {etfLoading && <div className="etf-loading">⟳ ETF 시세 불러오는 중...</div>}

          {etfError && (
            <div className="etf-error-box">
              <div>⚠️ {etfError}</div>
              <div className="etf-error-sub">키움 API는 장중(9:00~15:30)에만 ETF 전체 시세를 제공합니다.</div>
              <a href="https://finance.naver.com/sise/etf.naver" target="_blank" rel="noreferrer" className="etf-naver-link">
                📊 네이버 ETF 전체 보기 →
              </a>
            </div>
          )}

          {!etfLoading && !etfError && filtered.length > 0 && (
            <div className="etf-table-wrap">
              <div className="etf-count">{filtered.length}개 ETF</div>
              <div className="etf-table">
                <div className="etf-th">
                  <div>종목명</div>
                  <div>현재가</div>
                  <div className="sortable" onClick={() => toggleSort('change')}>등락률{sortIcon('change')}</div>
                  <div>NAV</div>
                  <div className="sortable" onClick={() => toggleSort('gap')}>괴리율{sortIcon('gap')}</div>
                  <div className="sortable" onClick={() => toggleSort('volume')}>거래량{sortIcon('volume')}</div>
                </div>
                {filtered.slice(0, 100).map(e => (
                  <EtfRow key={e.stk_cd} etf={e}
                    onClick={etf => { setSelectedEtf(etf); setActiveTab('analysis') }}/>
                ))}
              </div>
            </div>
          )}

          {!etfLoading && !etfError && filtered.length === 0 && etfList.length > 0 && (
            <div className="etf-empty">검색 결과가 없습니다</div>
          )}
        </div>
      )}

      {/* ══ ETF 분석 ══ */}
      {activeTab === 'analysis' && (
        <div className="etf-section">
          {!selectedEtf ? (
            <div className="etf-select-guide">
              <p>분석할 ETF를 선택해주세요</p>
              <button className="etf-tab active" onClick={() => setActiveTab('theme')}>
                테마별 ETF에서 선택 →
              </button>
            </div>
          ) : (
            <div className="etf-analysis-wrap">
              <div className="etf-analysis-header">
                <div>
                  <div className="etf-analysis-name">{selectedEtf.stk_nm}</div>
                  <div className="etf-analysis-code">{selectedEtf.stk_cd}</div>
                  {selectedEtf.trace_idex_nm && (
                    <div className="etf-analysis-idx">추적지수: {selectedEtf.trace_idex_nm}</div>
                  )}
                </div>
                <div className="etf-analysis-actions">
                  {/* 실시간 가격 표시 */}
                  {prices[selectedEtf.stk_cd]?.price > 0 && (() => {
                    const p = prices[selectedEtf.stk_cd]
                    const pc = rateColor(p.changeRate)
                    return (
                      <div className="etf-analysis-price" style={{ color: pc }}>
                        {fmt(p.price)}원
                        <span className="etf-analysis-change">
                          {p.changeRate > 0 ? '+' : ''}{p.changeRate?.toFixed(2)}%
                        </span>
                      </div>
                    )
                  })()}
                  <button className="etf-btn-chart"
                    onClick={() => setChartEtf({ name: selectedEtf.stk_nm, code: selectedEtf.stk_cd })}>
                    📊 차트
                  </button>
                  <button className="etf-btn-clear"
                    onClick={() => { setSelectedEtf(null); setAiResult(''); setAiError('') }}>✕</button>
                </div>
              </div>

              {/* 구성종목 (테마 매핑) */}
              {ETF_TO_THEME[selectedEtf.stk_cd] && (
                <div className="etf-comp-section">
                  <div className="etf-comp-title">📋 주요 구성종목 ({ETF_TO_THEME[selectedEtf.stk_cd].theme})</div>
                  <div className="etf-comp-grid">
                    {ETF_TO_THEME[selectedEtf.stk_cd].stocks.map(s => {
                      const p    = prices[s.code]
                      const pc   = p ? rateColor(p.changeRate) : '#94a3b8'
                      const sign = p?.changeRate > 0 ? '+' : ''
                      return (
                        <button key={s.code} className="etf-comp-item"
                          onClick={() => setChartEtf({ name: s.name, code: s.code })}>
                          <span className="etf-comp-name">{s.name}</span>
                          {p?.price > 0
                            ? <>
                                <span className="etf-comp-price" style={{ color: pc }}>{fmt(p.price)}원</span>
                                <span className="etf-comp-rate"  style={{ color: pc }}>{sign}{p.changeRate?.toFixed(2)}%</span>
                              </>
                            : <span className="etf-comp-code">{s.code}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* AI 분석 */}
              <div className="etf-ai-section">
                <div className="etf-ai-header">
                  <span className="etf-ai-title">🤖 AI ETF 분석</span>
                  <button className="etf-ai-btn" onClick={runAI} disabled={aiLoading || !CLAUDE_KEY}>
                    {aiLoading ? '⟳ 분석 중...' : aiResult ? '↺ 다시 분석' : '🔍 AI 분석 시작'}
                  </button>
                </div>
                {!CLAUDE_KEY && <div className="etf-ai-warn">⚠️ Claude API 키 미설정</div>}
                {aiError    && <div className="etf-ai-error">⚠️ {aiError}</div>}
                {aiLoading  && (
                  <div className="etf-ai-loading">
                    <div className="etf-spinner"/><span>{selectedEtf.stk_nm} 분석 중...</span>
                  </div>
                )}
                {aiResult && !aiLoading && (
                  <div className="etf-ai-result">
                    <div className="etf-ai-badge">🔍 웹 검색 기반</div>
                    <pre className="etf-ai-text">{aiResult}</pre>
                  </div>
                )}
                {!aiResult && !aiLoading && !aiError && (
                  <div className="etf-ai-placeholder">
                    AI 분석 버튼을 눌러 {selectedEtf.stk_nm}의 상세 분석을 받아보세요
                  </div>
                )}
              </div>

              <div className="etf-ext-links">
                <a href={`https://finance.naver.com/item/main.naver?code=${selectedEtf.stk_cd}`}
                  target="_blank" rel="noreferrer" className="etf-ext-link">📊 네이버 증권 →</a>
                <a href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(selectedEtf.stk_nm)}`}
                  target="_blank" rel="noreferrer" className="etf-ext-link">📋 DART 공시 →</a>
              </div>
            </div>
          )}
        </div>
      )}

      {chartEtf && <StockChartModal stock={chartEtf} onClose={() => setChartEtf(null)}/>}
    </div>
  )
}
