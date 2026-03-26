import { useState, useEffect, useCallback } from 'react'
import StockChartModal from '../components/StockChartModal'
import { fmt, fmtRate, rateColor, fmtShort } from '../utils/format'
import { ALL_THEMES } from '../constants/themes'
import './ETFPage.css'

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

// 운용사 목록
const COMPANIES = [
  { code:'0000', name:'전체'       },
  { code:'3020', name:'KODEX(삼성)' },
  { code:'3191', name:'TIGER(미래)' },
  { code:'3228', name:'KINDEX(한투)' },
  { code:'3023', name:'KStar(KB)'   },
  { code:'3022', name:'아리랑(한화)' },
  { code:'3027', name:'KOSEF(키움)'  },
]

// 테마 ETF 매핑 (favorites용)
const THEME_ETFS = ALL_THEMES.map(t => ({
  theme: t.label,
  color: t.color,
  emoji: t.emoji,
  etfs:  t.etf.map(e => ({ ...e })),
}))

function EtfRow({ etf, onClick }) {
  const pc    = rateColor(etf.pre_rt)
  const sign  = etf.pre_rt > 0 ? '+' : ''
  const gapPc = etf.nav_gap_rt
  const gapColor = Math.abs(gapPc) < 0.1 ? '#64748b' : gapPc > 0 ? '#ef4444' : '#3b82f6'

  return (
    <div className="etf-row" onClick={() => onClick(etf)}>
      <div className="etf-row-name">
        <div className="etf-row-nm">{etf.stk_nm}</div>
        <div className="etf-row-cd">{etf.stk_cd}</div>
      </div>
      <div className="etf-row-price" style={{ color: pc, fontWeight: 700 }}>{fmt(etf.close_pric)}</div>
      <div className="etf-row-change" style={{ color: pc }}>{sign}{etf.pre_rt?.toFixed(2)}%</div>
      <div className="etf-row-nav">{fmt(etf.nav)}</div>
      <div className="etf-row-gap" style={{ color: gapColor }}>
        {gapPc >= 0 ? '+' : ''}{gapPc?.toFixed(2)}%
      </div>
      <div className="etf-row-vol">{fmtShort(etf.trde_qty)}</div>
    </div>
  )
}

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

export default function ETFPage() {
  const [activeTab,    setActiveTab]    = useState('all')    // all | theme | analysis
  const [company,      setCompany]      = useState('0000')
  const [etfList,      setEtfList]      = useState([])
  const [etfLoading,   setEtfLoading]   = useState(false)
  const [searchQuery,  setSearchQuery]  = useState('')
  const [sortBy,       setSortBy]       = useState('volume') // volume | change | gap
  const [sortDir,      setSortDir]      = useState('desc')
  const [selectedEtf,  setSelectedEtf]  = useState(null)
  const [chartEtf,     setChartEtf]     = useState(null)
  const [aiResult,     setAiResult]     = useState('')
  const [aiLoading,    setAiLoading]    = useState(false)
  const [aiError,      setAiError]      = useState('')
  const [themeFilter,  setThemeFilter]  = useState('전체')

  // ETF 전체시세 로드
  const loadEtfList = useCallback(async (co = company) => {
    setEtfLoading(true)
    try {
      const res  = await fetch(`/api/kiwoom?type=etf-list&mngmcomp=${co}`)
      const data = await res.json()
      setEtfList(data.data || [])
    } catch (e) { console.error(e) }
    finally { setEtfLoading(false) }
  }, [company])

  useEffect(() => { if (activeTab === 'all') loadEtfList() }, [activeTab])

  // 필터 + 정렬
  const filtered = etfList
    .filter(e => !searchQuery || e.stk_nm.includes(searchQuery) || e.stk_cd.includes(searchQuery))
    .sort((a, b) => {
      const dir = sortDir === 'desc' ? -1 : 1
      if (sortBy === 'volume') return (a.trde_qty - b.trde_qty) * dir
      if (sortBy === 'change') return (a.pre_rt - b.pre_rt) * dir
      if (sortBy === 'gap')    return (Math.abs(a.nav_gap_rt) - Math.abs(b.nav_gap_rt)) * dir
      return 0
    })

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const sortIcon = (col) => sortBy === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''

  // AI 분석
  const runAI = async () => {
    if (!selectedEtf || !CLAUDE_KEY) return
    setAiLoading(true); setAiError(''); setAiResult('')
    try {
      const text = await runEtfAI(selectedEtf.stk_nm, selectedEtf.stk_cd)
      setAiResult(text)
    } catch (e) { setAiError(e.message) }
    finally { setAiLoading(false) }
  }

  const TABS = [
    { id:'all',      label:'📦 전체 ETF'  },
    { id:'theme',    label:'🎯 테마별 ETF' },
    { id:'analysis', label:'🔍 ETF 분석'  },
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
          <button key={t.id} className={`etf-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ── 전체 ETF ── */}
      {activeTab === 'all' && (
        <div className="etf-section">
          {/* 필터 바 */}
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
              <button className="etf-refresh-btn" onClick={() => loadEtfList()} disabled={etfLoading}>
                {etfLoading ? '⟳' : '↺ 갱신'}
              </button>
            </div>
          </div>

          {etfLoading && <div className="etf-loading">ETF 시세 불러오는 중...</div>}

          {!etfLoading && filtered.length === 0 && (
            <button className="etf-load-btn" onClick={() => loadEtfList()}>📡 ETF 데이터 불러오기</button>
          )}

          {!etfLoading && filtered.length > 0 && (
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
                  <EtfRow key={e.stk_cd} etf={e} onClick={etf => { setSelectedEtf(etf); setActiveTab('analysis') }}/>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 테마별 ETF ── */}
      {activeTab === 'theme' && (
        <div className="etf-section">
          <div className="etf-theme-filter">
            {['전체', ...THEME_ETFS.map(t => t.theme)].map(name => (
              <button key={name}
                className={`etf-chip ${themeFilter === name ? 'active' : ''}`}
                onClick={() => setThemeFilter(name)}>
                {name}
              </button>
            ))}
          </div>
          <div className="etf-theme-grid">
            {THEME_ETFS.filter(t => themeFilter === '전체' || t.theme === themeFilter).map(t => (
              <div key={t.theme} className="etf-theme-card" style={{ '--tc': t.color }}>
                <div className="etf-theme-header">
                  <span className="etf-theme-emoji">{t.emoji}</span>
                  <span className="etf-theme-label" style={{ color: t.color }}>{t.theme}</span>
                </div>
                {t.etfs.map(e => (
                  <button key={e.code} className="etf-theme-item"
                    onClick={() => { setSelectedEtf({ stk_nm: e.name, stk_cd: e.code }); setActiveTab('analysis') }}>
                    <span className="etf-theme-item-name">{e.name}</span>
                    <span className="etf-theme-item-code">{e.code}</span>
                    <span className="etf-theme-arrow">→</span>
                  </button>
                ))}
                <button className="etf-chart-btn"
                  onClick={() => setChartEtf({ name: t.etfs[0]?.name, code: t.etfs[0]?.code })}>
                  📊 차트
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ETF 분석 ── */}
      {activeTab === 'analysis' && (
        <div className="etf-section">
          {/* ETF 선택 */}
          {!selectedEtf ? (
            <div className="etf-select-guide">
              <p>분석할 ETF를 선택해주세요</p>
              <button className="etf-tab active" onClick={() => setActiveTab('all')}>전체 ETF에서 선택 →</button>
            </div>
          ) : (
            <div className="etf-analysis-wrap">
              {/* 선택 ETF 헤더 */}
              <div className="etf-analysis-header">
                <div>
                  <div className="etf-analysis-name">{selectedEtf.stk_nm}</div>
                  <div className="etf-analysis-code">{selectedEtf.stk_cd}</div>
                  {selectedEtf.trace_idex_nm && <div className="etf-analysis-idx">추적지수: {selectedEtf.trace_idex_nm}</div>}
                </div>
                <div className="etf-analysis-actions">
                  {selectedEtf.close_pric && (
                    <div className="etf-analysis-price" style={{ color: rateColor(selectedEtf.pre_rt) }}>
                      {fmt(selectedEtf.close_pric)}원
                      <span className="etf-analysis-change">{selectedEtf.pre_rt > 0 ? '+' : ''}{selectedEtf.pre_rt?.toFixed(2)}%</span>
                    </div>
                  )}
                  <button className="etf-btn-chart" onClick={() => setChartEtf({ name: selectedEtf.stk_nm, code: selectedEtf.stk_cd })}>
                    📊 차트 보기
                  </button>
                  <button className="etf-btn-clear" onClick={() => { setSelectedEtf(null); setAiResult(''); setAiError('') }}>✕</button>
                </div>
              </div>

              {/* 시세 정보 */}
              {selectedEtf.nav && (
                <div className="etf-analysis-grid">
                  {[
                    { label:'현재가',    value:`${fmt(selectedEtf.close_pric)}원`, color: rateColor(selectedEtf.pre_rt) },
                    { label:'NAV',       value:`${fmt(selectedEtf.nav)}원` },
                    { label:'괴리율',    value:`${selectedEtf.nav_gap_rt >= 0 ? '+' : ''}${selectedEtf.nav_gap_rt?.toFixed(2)}%`, color: Math.abs(selectedEtf.nav_gap_rt) < 0.1 ? '#64748b' : selectedEtf.nav_gap_rt > 0 ? '#ef4444' : '#3b82f6' },
                    { label:'거래량',    value:fmtShort(selectedEtf.trde_qty) },
                    { label:'추적지수',  value:selectedEtf.trace_idex_nm || '-' },
                    { label:'추적오차율',value:selectedEtf.trace_eor_rt ? `${selectedEtf.trace_eor_rt?.toFixed(2)}%` : '-' },
                  ].map(item => (
                    <div key={item.label} className="etf-analysis-card">
                      <div className="etf-analysis-card-label">{item.label}</div>
                      <div className="etf-analysis-card-value" style={{ color: item.color }}>{item.value}</div>
                    </div>
                  ))}
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
                {aiError   && <div className="etf-ai-error">⚠️ {aiError}</div>}
                {aiLoading && (
                  <div className="etf-ai-loading">
                    <div className="etf-spinner"/>
                    <span>{selectedEtf.stk_nm} 분석 중...</span>
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

              {/* 외부 링크 */}
              <div className="etf-ext-links">
                <a href={`https://finance.naver.com/item/main.naver?code=${selectedEtf.stk_cd}`}
                  target="_blank" rel="noreferrer" className="etf-ext-link">📊 네이버 증권 →</a>
                <a href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(selectedEtf.stk_nm)}`}
                  target="_blank" rel="noreferrer" className="etf-ext-link">📋 DART 공시 →</a>
                <a href="https://finance.naver.com/sise/etf.naver"
                  target="_blank" rel="noreferrer" className="etf-ext-link">📦 네이버 ETF 전체 →</a>
              </div>
            </div>
          )}
        </div>
      )}

      {chartEtf && <StockChartModal stock={chartEtf} onClose={() => setChartEtf(null)}/>}
    </div>
  )
}
