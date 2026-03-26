import { useState, useEffect, useCallback, useRef } from 'react'
import StockChartModal from '../components/StockChartModal'
import { ALL_THEMES } from '../constants/themes'
import { fmt, fmtRate, rateColor } from '../utils/format'
import './ChartAnalysisPage.css'

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

// ── 저장소 키 ─────────────────────────────────────
const LS_RECENT    = 'chart_recent_v1'    // 최근 검색 종목
const LS_WATCHLIST = 'chart_watchlist_v1' // 즐겨찾기
const LS_SETTINGS  = 'chart_settings_v1'  // 차트 설정 저장

function lsGet(key, def) { try { return JSON.parse(localStorage.getItem(key)) ?? def } catch { return def } }
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }

// ── 전체 종목 검색 목록 (테마 종목 + 주요 종목) ────
const SEARCH_POOL = [
  // 테마 종목
  ...ALL_THEMES.flatMap(t => [
    ...t.etf.map(e => ({ name: e.name, code: e.code, theme: t.label })),
    ...t.stocks.map(s => ({ name: s.name, code: s.code, theme: t.label })),
  ]),
  // 추가 주요 종목
  { name: 'KOSPI200 ETF(KODEX)', code: '069500', theme: 'ETF' },
  { name: 'KODEX 레버리지',       code: '122630', theme: 'ETF' },
  { name: 'KODEX 인버스',         code: '114800', theme: 'ETF' },
  { name: '삼성전자우',            code: '005935', theme: '반도체·AI' },
  { name: '카카오페이',            code: '377300', theme: 'IT' },
]

// 중복 제거
const STOCK_LIST = [...new Map(SEARCH_POOL.map(s => [s.code, s])).values()]

// AI 차트 분석
async function runAiAnalysis(stock, period, priceInfo) {
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
      max_tokens: 1000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content:
        `오늘(${today}) ${stock.name}(${stock.code}) 주식을 분석해줘.

현재 정보:
- 현재가: ${fmt(priceInfo?.price)}원
- 등락률: ${fmtRate(priceInfo?.changeRate)}
- 차트 기간: ${period}

웹에서 최신 뉴스와 정보를 검색해서 아래 형식으로 분석해줘:

## 📌 종목 현황
## 📈 기술적 분석 (${period} 기준)
## 🔑 핵심 뉴스·모멘텀
## 🎯 지지·저항 레벨
## ⚠️ 리스크 요인
## 💡 투자 의견` }],
    }),
  })
  if (!res.ok) throw new Error(`API 오류 ${res.status}`)
  const data = await res.json()
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
}

export default function ChartAnalysisPage() {
  const [query,        setQuery]        = useState('')
  const [searchResults,setSearchResults]= useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selected,     setSelected]     = useState(null)    // 선택된 종목
  const [priceInfo,    setPriceInfo]    = useState(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [showChart,    setShowChart]    = useState(false)   // StockChartModal 표시
  const [recent,       setRecent]       = useState(() => lsGet(LS_RECENT, []))
  const [watchlist,    setWatchlist]    = useState(() => lsGet(LS_WATCHLIST, []))
  const [settings,     setSettings]     = useState(() => lsGet(LS_SETTINGS, {}))
  const [aiResult,     setAiResult]     = useState('')
  const [aiLoading,    setAiLoading]    = useState(false)
  const [aiError,      setAiError]      = useState('')
  const [activeTab,    setActiveTab]    = useState('chart')  // chart | supply | ai
  const [period,       setPeriod]       = useState('day')
  // 수급 데이터
  const [foreignData,  setForeignData]  = useState(null)
  const [shortData,    setShortData]    = useState(null)
  const [strengthData, setStrengthData] = useState(null)
  const [supplyLoading,setSupplyLoading]= useState(false)
  const inputRef = useRef(null)

  // ── 검색 ───────────────────────────────────────
  const handleSearch = (q) => {
    setQuery(q)
    if (!q.trim()) { setSearchResults([]); setShowDropdown(false); return }
    const kw = q.trim().toLowerCase()
    const results = STOCK_LIST.filter(s =>
      s.name.toLowerCase().includes(kw) || s.code.includes(kw)
    ).slice(0, 10)
    setSearchResults(results)
    setShowDropdown(true)
  }

  const selectStock = (stock) => {
    setSelected(stock)
    setQuery(stock.name)
    setShowDropdown(false)
    setAiResult(''); setAiError('')
    setForeignData(null); setShortData(null); setStrengthData(null)
    // 최근 검색 저장
    const next = [stock, ...recent.filter(r => r.code !== stock.code)].slice(0, 8)
    setRecent(next); lsSet(LS_RECENT, next)
  }

  // ── 현재가 로드 ─────────────────────────────────
  useEffect(() => {
    if (!selected) return
    setPriceLoading(true)
    fetch(`/api/kiwoom?type=price&code=${selected.code}`)
      .then(r => r.json())
      .then(d => setPriceInfo({ price: d.cur_prc, change: d.pred_pre, changeRate: d.flu_rt, volume: d.trde_qty, per: d.per, pbr: d.pbr, forExhRt: d.for_exh_rt }))
      .catch(() => {})
      .finally(() => setPriceLoading(false))
  }, [selected])

  // ── 즐겨찾기 토글 ───────────────────────────────
  const toggleWatchlist = () => {
    if (!selected) return
    const exists = watchlist.find(w => w.code === selected.code)
    const next = exists ? watchlist.filter(w => w.code !== selected.code) : [selected, ...watchlist].slice(0, 20)
    setWatchlist(next); lsSet(LS_WATCHLIST, next)
  }
  const isWatched = selected && watchlist.find(w => w.code === selected.code)

  // ── 수급 데이터 로드 ────────────────────────────
  const loadSupply = useCallback(async () => {
    if (!selected) return
    setSupplyLoading(true)
    try {
      const [foreign, short, strength] = await Promise.all([
        fetch(`/api/kiwoom?type=supply-foreign&code=${selected.code}`).then(r => r.json()),
        fetch(`/api/kiwoom?type=supply-short&code=${selected.code}&days=30`).then(r => r.json()),
        fetch(`/api/kiwoom?type=supply-strength&code=${selected.code}`).then(r => r.json()),
      ])
      setForeignData(foreign.data?.slice(0, 20) || [])
      setShortData(short.data?.slice(0, 20)     || [])
      setStrengthData(strength.data?.slice(0, 20) || [])
    } catch {}
    finally { setSupplyLoading(false) }
  }, [selected])

  useEffect(() => {
    if (activeTab === 'supply' && selected && !foreignData) loadSupply()
  }, [activeTab, selected])

  // ── AI 분석 ─────────────────────────────────────
  const runAI = async () => {
    if (!selected || !CLAUDE_KEY) return
    setAiLoading(true); setAiError('')
    try {
      const text = await runAiAnalysis(selected, period, priceInfo)
      setAiResult(text)
    } catch (e) { setAiError(e.message) }
    finally { setAiLoading(false) }
  }

  const PERIODS = [
    { key:'min', label:'분봉' }, { key:'day', label:'일봉' },
    { key:'week', label:'주봉' }, { key:'month', label:'월봉' }, { key:'year', label:'년봉' },
  ]

  return (
    <div className="cap-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">차트 분석</h1>
          <p className="page-sub">종목 검색 · 캔들차트 · 수급 · AI 분석</p>
        </div>
      </div>

      {/* ── 검색 영역 ── */}
      <div className="cap-search-section">
        <div className="cap-search-wrap">
          <div className="cap-search-box" ref={inputRef}>
            <span className="cap-search-icon">🔍</span>
            <input
              className="cap-search-input"
              placeholder="종목명 또는 코드 검색 (예: 삼성전자, 005930)"
              value={query}
              onChange={e => handleSearch(e.target.value)}
              onFocus={() => query && setShowDropdown(true)}
              onKeyDown={e => { if (e.key === 'Escape') setShowDropdown(false) }}
            />
            {query && <button className="cap-search-clear" onClick={() => { setQuery(''); setSearchResults([]); setShowDropdown(false) }}>✕</button>}
            {showDropdown && searchResults.length > 0 && (
              <div className="cap-dropdown">
                {searchResults.map(s => (
                  <button key={s.code} className="cap-dropdown-item" onClick={() => selectStock(s)}>
                    <span className="cap-dd-name">{s.name}</span>
                    <span className="cap-dd-code">{s.code}</span>
                    <span className="cap-dd-theme">{s.theme}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 최근 검색 */}
        {recent.length > 0 && !selected && (
          <div className="cap-recent">
            <span className="cap-recent-label">최근</span>
            {recent.map(r => (
              <button key={r.code} className="cap-chip" onClick={() => selectStock(r)}>
                {r.name}
              </button>
            ))}
          </div>
        )}

        {/* 즐겨찾기 */}
        {watchlist.length > 0 && !selected && (
          <div className="cap-recent">
            <span className="cap-recent-label">⭐ 즐겨찾기</span>
            {watchlist.map(w => (
              <button key={w.code} className="cap-chip cap-chip-star" onClick={() => selectStock(w)}>
                {w.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 종목 선택 후 표시 ── */}
      {selected && (
        <div className="cap-body">
          {/* 종목 헤더 */}
          <div className="cap-stock-header">
            <div className="cap-stock-info">
              <span className="cap-stock-name">{selected.name}</span>
              <span className="cap-stock-code">{selected.code}</span>
              <span className="cap-stock-theme">{selected.theme}</span>
              {priceLoading
                ? <span className="cap-price-loading">로딩 중...</span>
                : priceInfo && (
                  <>
                    <span className="cap-price" style={{ color: rateColor(priceInfo.changeRate) }}>
                      {fmt(priceInfo.price)}원
                    </span>
                    <span className="cap-change" style={{ color: rateColor(priceInfo.changeRate) }}>
                      {priceInfo.changeRate > 0 ? '+' : ''}{priceInfo.changeRate?.toFixed(2)}%
                    </span>
                  </>
                )}
            </div>
            <div className="cap-stock-actions">
              <button
                className={`cap-btn-watch ${isWatched ? 'active' : ''}`}
                onClick={toggleWatchlist}
                title={isWatched ? '즐겨찾기 해제' : '즐겨찾기 추가'}>
                {isWatched ? '⭐' : '☆'} {isWatched ? '즐겨찾기' : '추가'}
              </button>
              <button className="cap-btn-close" onClick={() => { setSelected(null); setQuery('') }}>✕</button>
            </div>
          </div>

          {/* 탭 */}
          <div className="cap-tabs">
            {[{ id:'chart', label:'📈 차트' }, { id:'supply', label:'💰 수급' }, { id:'ai', label:'🤖 AI 분석' }].map(t => (
              <button key={t.id} className={`cap-tab ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}>{t.label}</button>
            ))}
          </div>

          {/* ── 차트 탭 ── */}
          {activeTab === 'chart' && (
            <div className="cap-chart-section">
              {/* 기간 선택 */}
              <div className="cap-period-bar">
                {PERIODS.map(p => (
                  <button key={p.key} className={`cap-period-btn ${period === p.key ? 'active' : ''}`}
                    onClick={() => setPeriod(p.key)}>{p.label}</button>
                ))}
                <button className="cap-btn-open-chart" onClick={() => setShowChart(true)}>
                  📊 차트 전체화면 열기
                </button>
              </div>

              {/* 종목 기본정보 */}
              {priceInfo && (
                <div className="cap-info-grid">
                  {[
                    { label:'현재가', value: `${fmt(priceInfo.price)}원`, color: rateColor(priceInfo.changeRate) },
                    { label:'등락률', value: fmtRate(priceInfo.changeRate), color: rateColor(priceInfo.changeRate) },
                    { label:'거래량', value: `${fmt(priceInfo.volume)}주` },
                    { label:'PER',   value: priceInfo.per ? `${Number(priceInfo.per).toFixed(1)}배` : '-' },
                    { label:'PBR',   value: priceInfo.pbr ? `${Number(priceInfo.pbr).toFixed(2)}배` : '-' },
                    { label:'외국인', value: priceInfo.forExhRt ? `${priceInfo.forExhRt}%` : '-' },
                  ].map(item => (
                    <div key={item.label} className="cap-info-card">
                      <div className="cap-info-label">{item.label}</div>
                      <div className="cap-info-value" style={{ color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 차트 열기 안내 */}
              <div className="cap-chart-placeholder" onClick={() => setShowChart(true)}>
                <div className="cap-chart-placeholder-inner">
                  <span className="cap-chart-placeholder-icon">📊</span>
                  <p className="cap-chart-placeholder-text">{selected.name} 차트 보기</p>
                  <p className="cap-chart-placeholder-sub">클릭하면 분봉/일봉/주봉/월봉/년봉 · MA · 거래량 · DART 공시 마커 포함 차트가 열립니다</p>
                  <button className="cap-btn-primary">차트 열기 →</button>
                </div>
              </div>

              {/* DART 공시 바로가기 */}
              <div className="cap-dart-section">
                <a href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(selected.name)}`}
                  target="_blank" rel="noreferrer" className="cap-dart-link">
                  📋 DART 공시 바로가기 →
                </a>
                <a href={`https://finance.naver.com/item/main.naver?code=${selected.code}`}
                  target="_blank" rel="noreferrer" className="cap-dart-link">
                  📊 네이버 증권 →
                </a>
              </div>
            </div>
          )}

          {/* ── 수급 탭 ── */}
          {activeTab === 'supply' && (
            <div className="cap-supply-section">
              {supplyLoading && <div className="cap-loading">수급 데이터 불러오는 중...</div>}

              {!supplyLoading && foreignData && (
                <>
                  {/* 외국인 보유 추이 */}
                  <div className="cap-supply-card">
                    <div className="cap-supply-card-title">🌐 외국인 보유 추이 (최근 20일)</div>
                    {foreignData.length === 0
                      ? <div className="cap-no-data">데이터 없음 (장중에만 조회 가능)</div>
                      : (
                        <div className="cap-supply-table">
                          <div className="cap-supply-th">
                            <div>일자</div><div>종가</div><div>변동수량</div><div>보유비중</div>
                          </div>
                          {foreignData.map((r, i) => {
                            const chg = Number(r.chg_qty)
                            const chgColor = chg > 0 ? '#ef4444' : chg < 0 ? '#3b82f6' : '#94a3b8'
                            return (
                              <div key={i} className="cap-supply-tr">
                                <div className="cap-supply-date">{r.dt?.replace(/(\d{4})(\d{2})(\d{2})/, '$2/$3')}</div>
                                <div>{fmt(r.close_pric)}</div>
                                <div style={{ color: chgColor }}>{chg > 0 ? '+' : ''}{fmt(chg)}</div>
                                <div>{r.wght}%</div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                  </div>

                  {/* 공매도 추이 */}
                  <div className="cap-supply-card">
                    <div className="cap-supply-card-title">📉 공매도 추이 (최근 30일)</div>
                    {shortData?.length === 0
                      ? <div className="cap-no-data">데이터 없음</div>
                      : (
                        <div className="cap-supply-table">
                          <div className="cap-supply-th">
                            <div>일자</div><div>종가</div><div>공매도량</div><div>매매비중</div>
                          </div>
                          {shortData?.map((r, i) => (
                            <div key={i} className="cap-supply-tr">
                              <div className="cap-supply-date">{r.dt?.replace(/(\d{4})(\d{2})(\d{2})/, '$2/$3')}</div>
                              <div>{fmt(r.close_pric)}</div>
                              <div style={{ color: '#7c3aed' }}>{fmt(r.shrts_qty)}</div>
                              <div>{r.trde_wght?.toFixed(2)}%</div>
                            </div>
                          ))}
                        </div>
                      )}
                  </div>

                  {/* 체결강도 */}
                  <div className="cap-supply-card">
                    <div className="cap-supply-card-title">⚡ 체결강도 추이</div>
                    {strengthData?.length === 0
                      ? <div className="cap-no-data">데이터 없음</div>
                      : (
                        <div className="cap-supply-table">
                          <div className="cap-supply-th">
                            <div>일자</div><div>등락률</div><div>체결강도</div><div>5일</div><div>20일</div>
                          </div>
                          {strengthData?.map((r, i) => {
                            const str = r.cntr_str
                            const strColor = str > 100 ? '#ef4444' : str < 100 ? '#3b82f6' : '#94a3b8'
                            return (
                              <div key={i} className="cap-supply-tr">
                                <div className="cap-supply-date">{r.dt?.replace(/(\d{4})(\d{2})(\d{2})/, '$2/$3')}</div>
                                <div style={{ color: rateColor(r.flu_rt) }}>{r.flu_rt?.toFixed(2)}%</div>
                                <div style={{ color: strColor, fontWeight: 600 }}>{str?.toFixed(1)}</div>
                                <div>{r.cntr_str_5?.toFixed(1)}</div>
                                <div>{r.cntr_str_20?.toFixed(1)}</div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                  </div>
                </>
              )}

              {!supplyLoading && !foreignData && (
                <button className="cap-btn-primary" onClick={loadSupply}>📡 수급 데이터 불러오기</button>
              )}
            </div>
          )}

          {/* ── AI 분석 탭 ── */}
          {activeTab === 'ai' && (
            <div className="cap-ai-section">
              <div className="cap-ai-header">
                <div className="cap-ai-desc">
                  🤖 웹 검색 기반으로 <strong>{selected.name}</strong> 최신 뉴스와 기술적 분석을 종합합니다
                </div>
                <div className="cap-ai-controls">
                  {PERIODS.map(p => (
                    <button key={p.key} className={`cap-period-btn ${period === p.key ? 'active' : ''}`}
                      onClick={() => setPeriod(p.key)}>{p.label}</button>
                  ))}
                  <button className="cap-btn-primary" onClick={runAI} disabled={aiLoading || !CLAUDE_KEY}>
                    {aiLoading ? '⟳ 분석 중...' : aiResult ? '↺ 다시 분석' : '🔍 AI 분석 시작'}
                  </button>
                </div>
              </div>

              {!CLAUDE_KEY && <div className="cap-ai-warn">⚠️ VITE_CLAUDE_API_KEY가 설정되지 않았습니다</div>}
              {aiError && <div className="cap-ai-error">⚠️ {aiError}</div>}
              {aiLoading && (
                <div className="cap-ai-loading">
                  <div className="cap-spinner"/>
                  <p>웹에서 {selected.name} 최신 정보 검색 중...</p>
                </div>
              )}
              {aiResult && !aiLoading && (
                <div className="cap-ai-result">
                  <div className="cap-ai-badge">🔍 웹 검색 기반 · {new Date().toLocaleTimeString('ko-KR')}</div>
                  <pre className="cap-ai-text">{aiResult}</pre>
                </div>
              )}
              {!aiResult && !aiLoading && !aiError && (
                <div className="cap-ai-placeholder">
                  <p>위의 <strong>AI 분석 시작</strong> 버튼을 눌러보세요</p>
                  <p className="cap-ai-placeholder-sub">웹을 실시간 검색해서 오늘 뉴스 + 기술적 분석을 종합해드립니다</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 검색 안 했을 때 — 즐겨찾기 + 최근 그리드 */}
      {!selected && watchlist.length === 0 && recent.length === 0 && (
        <div className="cap-empty">
          <div className="cap-empty-icon">📈</div>
          <p>종목명 또는 코드를 검색해 차트 분석을 시작하세요</p>
          <p className="cap-empty-sub">삼성전자, SK하이닉스, 005930 등으로 검색</p>
        </div>
      )}

      {/* StockChartModal */}
      {showChart && selected && (
        <StockChartModal
          stock={{ name: selected.name, code: selected.code }}
          onClose={() => setShowChart(false)}
        />
      )}
    </div>
  )
}
