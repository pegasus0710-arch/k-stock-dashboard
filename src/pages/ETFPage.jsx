import { useState, useEffect, useCallback } from 'react'
import StockChartModal from '../components/StockChartModal'
import { useStockPrices } from '../hooks/useKiwoomPrice'
import { fmt, fmtRate, rateColor, fmtShort } from '../utils/format'
import { ALL_THEMES } from '../constants/themes'
import './ETFPage.css'

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

const COMPANIES = [
  { code:'0000', name:'전체'        },
  { code:'3020', name:'KODEX(삼성)'  },
  { code:'3191', name:'TIGER(미래)'  },
  { code:'3228', name:'KINDEX(한투)' },
  { code:'3023', name:'KStar(KB)'    },
  { code:'3022', name:'아리랑(한화)' },
  { code:'3027', name:'KOSEF(키움)'  },
]

// 테마 ETF 매핑
const THEME_ETFS = ALL_THEMES.map(t => ({
  id: t.id, theme: t.label, color: t.color, emoji: t.emoji,
  etfs:   t.etf.map(e => ({ ...e })),
  stocks: t.stocks.map(s => ({ ...s })),
}))

// ── ETF 자산군 카테고리 ──────────────────────
const CATEGORIES = [
  { id:'all',      label:'전체'       },
  { id:'domestic', label:'국내주식'   },
  { id:'overseas', label:'해외주식'   },
  { id:'bond',     label:'채권'       },
  { id:'leverage', label:'레버리지'   },
  { id:'inverse',  label:'인버스'     },
  { id:'dividend', label:'배당'       },
  { id:'sector',   label:'섹터·테마'  },
  { id:'commodity',label:'원자재·금'  },
]

function getCategory(etf) {
  const nm = (etf.stk_nm || '').toLowerCase()
  const cl = (etf.stk_cls || '').toLowerCase()
  if (nm.includes('인버스') || nm.includes('inverse') || nm.includes('-1x') || nm.includes('bear')) return 'inverse'
  if (nm.includes('레버리지') || nm.includes('2x') || nm.includes('3x') || nm.includes('bull')) return 'leverage'
  if (nm.includes('배당') || nm.includes('dividend') || nm.includes('월배당')) return 'dividend'
  if (nm.includes('미국') || nm.includes('중국') || nm.includes('일본') || nm.includes('글로벌') || nm.includes('nasdaq') || nm.includes('s&p') || nm.includes('sp500') || nm.includes('해외') || nm.includes('선진') || nm.includes('신흥')) return 'overseas'
  if (nm.includes('국채') || nm.includes('회사채') || nm.includes('채권') || nm.includes('bond') || nm.includes('tdf') || nm.includes('단기')) return 'bond'
  if (nm.includes('금') || nm.includes('원유') || nm.includes('wti') || nm.includes('원자재') || nm.includes('구리') || nm.includes('은 ') || nm.includes('실버')) return 'commodity'
  if (nm.includes('반도체') || nm.includes('2차전지') || nm.includes('바이오') || nm.includes('방산') || nm.includes('조선') || nm.includes('원전') || nm.includes('it') || nm.includes('ai') || nm.includes('전기차') || nm.includes('수소') || nm.includes('게임') || nm.includes('핀테크') || nm.includes('클라우드') || nm.includes('메타') || nm.includes('소비') || nm.includes('헬스') || nm.includes('건설') || nm.includes('금융') || nm.includes('은행') || nm.includes('보험') || nm.includes('자동차') || nm.includes('화학') || nm.includes('철강') || nm.includes('유통') || nm.includes('통신') || cl.includes('sector')) return 'sector'
  return 'domestic'
}

// 코드 → 테마 맵
const ETF_TO_THEME = {}
THEME_ETFS.forEach(t => t.etfs.forEach(e => { ETF_TO_THEME[e.code] = t }))

// 전체 코드
const ALL_CODES = [...new Set(THEME_ETFS.flatMap(t => [...t.etfs.map(e => e.code), ...t.stocks.map(s => s.code)]))]

async function runEtfAI(name, code) {
  const today = new Date().toLocaleDateString('ko-KR')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body: JSON.stringify({
      model:'claude-haiku-4-5-20251001', max_tokens:800,
      tools:[{type:'web_search_20250305',name:'web_search'}],
      messages:[{role:'user',content:`오늘(${today}) ${name}(${code}) ETF 분석:\n## 📌 ETF 개요\n## 📈 최근 성과\n## 🔑 핵심 종목 동향\n## ⚠️ 리스크\n## 💡 투자 포인트\n웹 검색으로 최신 정보 기반으로 작성해줘.`}],
    }),
  })
  if (!res.ok) throw new Error(`API 오류 ${res.status}`)
  const data = await res.json()
  return data.content.filter(b => b.type==='text').map(b => b.text).join('\n')
}

// ETF 행
function EtfRow({ etf, onClick }) {
  const pc = rateColor(etf.pre_rt), sign = etf.pre_rt > 0 ? '+' : ''
  const gap = etf.nav_gap_rt
  const gapColor = Math.abs(gap) < 0.1 ? '#64748b' : gap > 0 ? '#ef4444' : '#3b82f6'
  return (
    <div className="etf-row" onClick={() => onClick(etf)}>
      <div className="etf-row-name"><div className="etf-row-nm">{etf.stk_nm}</div><div className="etf-row-cd">{etf.stk_cd}</div></div>
      <div className="etf-row-price" style={{color:pc,fontWeight:700}}>{fmt(etf.close_pric)}</div>
      <div className="etf-row-change" style={{color:pc}}>{sign}{etf.pre_rt?.toFixed(2)}%</div>
      <div className="etf-row-nav">{fmt(etf.nav)}</div>
      <div className="etf-row-gap" style={{color:gapColor}}>{gap>=0?'+':''}{gap?.toFixed(2)}%</div>
      <div className="etf-row-vol">{fmtShort(etf.trde_qty)}</div>
    </div>
  )
}

export default function ETFPage() {
  const [activeTab,   setActiveTab]   = useState('theme') // theme | all
  const [company,     setCompany]     = useState('0000')
  const [etfList,     setEtfList]     = useState([])
  const [etfLoading,  setEtfLoading]  = useState(false)
  const [etfError,    setEtfError]    = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy,      setSortBy]      = useState('volume')
  const [sortDir,     setSortDir]     = useState('desc')
  const [themeFilter, setThemeFilter] = useState('전체')
  const [category,    setCategory]    = useState('all')
  // 선택된 ETF (테마탭에서)
  const [selEtf,      setSelEtf]      = useState(null)   // { code, name }
  const [chartStock,  setChartStock]  = useState(null)
  // AI
  const [aiResult,    setAiResult]    = useState('')
  const [aiLoading,   setAiLoading]   = useState(false)
  const [aiError,     setAiError]     = useState('')

  // 전체 가격 조회
  const { prices } = useStockPrices(ALL_CODES)

  // 전체 ETF
  const loadEtfList = useCallback(async (co = company) => {
    setEtfLoading(true); setEtfError('')
    try {
      const res  = await fetch(`/api/kiwoom?type=etf-list&mngmcomp=${co}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const list = data.data || []
      if (!list.length) throw new Error('장 마감 후 ETF 전체 시세는 제공되지 않습니다 (9:00~15:30만 가능)')
      setEtfList(list)
    } catch (e) { setEtfError(e.message) }
    finally { setEtfLoading(false) }
  }, [company])

  useEffect(() => { if (activeTab === 'all' && !etfList.length && !etfError) loadEtfList() }, [activeTab])

  const filtered = etfList
    .filter(e => !searchQuery || e.stk_nm.includes(searchQuery) || e.stk_cd.includes(searchQuery))
    .filter(e => category === 'all' || getCategory(e) === category)
    .sort((a, b) => {
      const d = sortDir === 'desc' ? -1 : 1
      if (sortBy === 'volume') return (a.trde_qty - b.trde_qty) * d
      if (sortBy === 'change') return (a.pre_rt   - b.pre_rt)   * d
      if (sortBy === 'gap')    return (Math.abs(a.nav_gap_rt) - Math.abs(b.nav_gap_rt)) * d
      return 0
    })

  const toggleSort = col => { if (sortBy===col) setSortDir(d=>d==='desc'?'asc':'desc'); else { setSortBy(col); setSortDir('desc') } }
  const sortIcon = col => sortBy===col ? (sortDir==='desc'?' ↓':' ↑') : ''

  // ETF 클릭 (테마탭)
  const handleEtfClick = (code, name) => {
    if (selEtf?.code === code) { setSelEtf(null); return }
    setSelEtf({ code, name }); setAiResult(''); setAiError('')
  }

  const doAI = async () => {
    if (!selEtf || !CLAUDE_KEY) return
    setAiLoading(true); setAiError('')
    try { setAiResult(await runEtfAI(selEtf.name, selEtf.code)) }
    catch (e) { setAiError(e.message) }
    finally { setAiLoading(false) }
  }

  // 선택 ETF의 테마 정보
  const selTheme = selEtf ? ETF_TO_THEME[selEtf.code] : null

  return (
    <div className="etf-wrap">
      <div className="page-header">
        <div><h1 className="page-title">ETF</h1><p className="page-sub">국내 ETF 시세 · NAV · 괴리율 · 테마별 분류 · AI 분석</p></div>
      </div>

      <div className="etf-tabs-row">
        {[{ id:'theme', label:'🎯 테마별 ETF' }, { id:'all', label:'📦 전체 ETF' }].map(t => (
          <button key={t.id} className={`etf-tab ${activeTab===t.id?'active':''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ══ 테마별 ETF — 2열 레이아웃 ══ */}
      {activeTab === 'theme' && (
        <div className="etf-theme-layout">
          {/* 왼쪽: 테마 목록 */}
          <div className="etf-theme-left">
            <div className="etf-theme-filter">
              {['전체', ...THEME_ETFS.map(t => t.theme)].map(name => (
                <button key={name} className={`etf-chip ${themeFilter===name?'active':''}`} onClick={() => setThemeFilter(name)}>{name}</button>
              ))}
            </div>
            <div className="etf-theme-list">
              {THEME_ETFS.filter(t => themeFilter==='전체' || t.theme===themeFilter).map(t => (
                <div key={t.id} className="etf-theme-card" style={{'--tc':t.color}}>
                  <div className="etf-theme-header">
                    <span className="etf-theme-emoji">{t.emoji}</span>
                    <span className="etf-theme-label" style={{color:t.color}}>{t.theme}</span>
                  </div>
                  {t.etfs.map(e => {
                    const p  = prices[e.code]
                    const pc = p ? rateColor(p.changeRate) : '#94a3b8'
                    const sign = p?.changeRate > 0 ? '+' : ''
                    const isActive = selEtf?.code === e.code
                    return (
                      <button key={e.code} className={`etf-etf-btn ${isActive?'active':''}`} style={isActive?{'--tc':t.color}:{}} onClick={() => handleEtfClick(e.code, e.name)}>
                        <span className="etf-etf-name">{e.name}</span>
                        {p?.price > 0
                          ? <span className="etf-etf-price" style={{color:pc}}>
                              {fmt(p.price)}<span className="etf-etf-rate">({sign}{p.changeRate?.toFixed(2)}%)</span>
                            </span>
                          : <span className="etf-etf-code">{e.code}</span>}
                        <span className="etf-expand-icon">{isActive ? '▼' : '▶'}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* 오른쪽: 선택된 ETF 상세 */}
          <div className="etf-theme-right">
            {!selEtf ? (
              <div className="etf-right-empty">
                <div className="etf-right-empty-icon">📊</div>
                <p>왼쪽에서 ETF를 선택하면<br/>구성종목과 실시간 가격이 표시됩니다</p>
              </div>
            ) : (
              <div className="etf-detail-panel">
                {/* ETF 헤더 */}
                <div className="etf-detail-header">
                  <div>
                    <div className="etf-detail-name">{selEtf.name}</div>
                    <div className="etf-detail-code">{selEtf.code}</div>
                  </div>
                  <div className="etf-detail-actions">
                    {prices[selEtf.code]?.price > 0 && (() => {
                      const p = prices[selEtf.code], pc = rateColor(p.changeRate)
                      return <div className="etf-detail-price" style={{color:pc}}>{fmt(p.price)}원 <span className="etf-detail-rate">{p.changeRate>0?'+':''}{p.changeRate?.toFixed(2)}%</span></div>
                    })()}
                    <button className="etf-btn-chart" onClick={() => setChartStock({ name:selEtf.name, code:selEtf.code })}>📊 차트</button>
                  </div>
                </div>

                {/* 구성종목 */}
                {selTheme && (
                  <div className="etf-stocks-section">
                    <div className="etf-stocks-title">📋 주요 구성종목 ({selTheme.theme})</div>
                    <div className="etf-stocks-list">
                      {selTheme.stocks.map(s => {
                        const p  = prices[s.code]
                        const pc = p ? rateColor(p.changeRate) : '#94a3b8'
                        const sign = p?.changeRate > 0 ? '+' : ''
                        return (
                          <button key={s.code} className="etf-stock-item" onClick={() => setChartStock({ name:s.name, code:s.code })}>
                            <span className="etf-stock-name">{s.name}</span>
                            {p?.price > 0
                              ? <>
                                  <span className="etf-stock-price" style={{color:pc}}>{fmt(p.price)}원</span>
                                  <span className="etf-stock-rate"  style={{color:pc}}>{sign}{p.changeRate?.toFixed(2)}%</span>
                                </>
                              : <span className="etf-stock-code">{s.code}</span>}
                            <span className="etf-stock-arrow">→</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* AI 분석 */}
                <div className="etf-ai-section">
                  <div className="etf-ai-header">
                    <span className="etf-ai-title">🤖 AI 분석</span>
                    <button className="etf-ai-btn" onClick={doAI} disabled={aiLoading || !CLAUDE_KEY}>
                      {aiLoading ? '⟳ 분석 중...' : aiResult ? '↺ 다시' : '🔍 AI 분석'}
                    </button>
                  </div>
                  {!CLAUDE_KEY && <div className="etf-ai-warn">⚠️ Claude API 키 미설정</div>}
                  {aiError    && <div className="etf-ai-error">⚠️ {aiError}</div>}
                  {aiLoading  && <div className="etf-ai-loading"><div className="etf-spinner"/>{selEtf.name} 분석 중...</div>}
                  {aiResult && !aiLoading && (
                    <div className="etf-ai-result"><div className="etf-ai-badge">🔍 웹 검색 기반</div><pre className="etf-ai-text">{aiResult}</pre></div>
                  )}
                  {!aiResult && !aiLoading && !aiError && (
                    <div className="etf-ai-placeholder">AI 분석 버튼을 눌러 {selEtf.name} 상세 분석을 받아보세요</div>
                  )}
                </div>

                {/* 외부 링크 */}
                <div className="etf-ext-links">
                  <a href={`https://finance.naver.com/item/main.naver?code=${selEtf.code}`} target="_blank" rel="noreferrer" className="etf-ext-link">📊 네이버 증권 →</a>
                  <a href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(selEtf.name)}`} target="_blank" rel="noreferrer" className="etf-ext-link">📋 DART →</a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ 전체 ETF ══ */}
      {activeTab === 'all' && (
        <div className="etf-section">
          <div className="etf-filter-bar">
            <div className="etf-company-chips">
              {COMPANIES.map(c => (
                <button key={c.code} className={`etf-chip ${company===c.code?'active':''}`}
                  onClick={() => { setCompany(c.code); loadEtfList(c.code) }}>{c.name}</button>
              ))}
            </div>
            <div className="etf-search-wrap">
              <input className="etf-search-input" placeholder="ETF명 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}/>
              <button className="etf-refresh-btn" onClick={() => { setEtfError(''); setEtfList([]); loadEtfList() }} disabled={etfLoading}>{etfLoading ? '⟳' : '↺ 갱신'}</button>
            </div>
          </div>

          {/* 자산군 카테고리 탭 */}
          <div className="etf-category-bar">
            {CATEGORIES.map(c => (
              <button key={c.id}
                className={`etf-category-btn ${category === c.id ? 'active' : ''}`}
                onClick={() => setCategory(c.id)}>
                {c.label}
                {category === c.id && etfList.length > 0 && (
                  <span className="etf-category-cnt">
                    {c.id === 'all' ? etfList.length : etfList.filter(e => getCategory(e) === c.id).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {etfLoading && <div className="etf-loading">⟳ ETF 시세 불러오는 중...</div>}
          {etfError && (
            <div className="etf-error-box">
              <div>⚠️ {etfError}</div>
              <a href="https://finance.naver.com/sise/etf.naver" target="_blank" rel="noreferrer" className="etf-naver-link">📊 네이버 ETF 전체 보기 →</a>
            </div>
          )}
          {!etfLoading && !etfError && filtered.length > 0 && (
            <div className="etf-table-wrap">
              <div className="etf-count">{filtered.length}개 ETF {category !== "all" ? `(${CATEGORIES.find(c=>c.id===category)?.label})` : ""}</div>
              <div className="etf-table">
                <div className="etf-th">
                  <div>종목명</div><div>현재가</div>
                  <div className="sortable" onClick={() => toggleSort('change')}>등락률{sortIcon('change')}</div>
                  <div>NAV</div>
                  <div className="sortable" onClick={() => toggleSort('gap')}>괴리율{sortIcon('gap')}</div>
                  <div className="sortable" onClick={() => toggleSort('volume')}>거래량{sortIcon('volume')}</div>
                </div>
                {filtered.slice(0, 100).map(e => (
                  <EtfRow key={e.stk_cd} etf={e} onClick={etf => setChartStock({ name:etf.stk_nm, code:etf.stk_cd })}/>
                ))}
              </div>
            </div>
          )}
          {!etfLoading && !etfError && !filtered.length && etfList.length > 0 && <div className="etf-empty">검색 결과 없음</div>}
        </div>
      )}

      {chartStock && <StockChartModal stock={chartStock} onClose={() => setChartStock(null)}/>}
    </div>
  )
}
