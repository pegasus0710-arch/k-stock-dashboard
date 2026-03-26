import { useState, useEffect, useCallback } from 'react'
import StockChartModal from '../components/StockChartModal'
import { fmt, fmtRate, rateColor, getKstStatus } from '../utils/format'
import './MarketPage.css'

// ── 업종 목록 (키움 업종코드 포함) ──────────────
const SECTORS = [
  { name:'종합(KOSPI)',  color:'#2563eb', inds_cd:'001', mrkt_tp:'0' },
  { name:'대형주',      color:'#1d4ed8', inds_cd:'002', mrkt_tp:'0' },
  { name:'중형주',      color:'#3b82f6', inds_cd:'003', mrkt_tp:'0' },
  { name:'소형주',      color:'#60a5fa', inds_cd:'004', mrkt_tp:'0' },
  { name:'종합(KOSDAQ)',color:'#16a34a', inds_cd:'101', mrkt_tp:'1' },
]

const SECTOR_CHIPS = [
  { name:'반도체',      color:'#2563eb' }, { name:'자동차',      color:'#0d9488' },
  { name:'조선',        color:'#0d9488' }, { name:'방산',        color:'#dc2626' },
  { name:'바이오·제약', color:'#7c3aed' }, { name:'2차전지',     color:'#16a34a' },
  { name:'금융·보험',   color:'#ea580c' }, { name:'건설',        color:'#64748b' },
  { name:'철강·금속',   color:'#78716c' }, { name:'화학',        color:'#d97706' },
  { name:'전기·전자',   color:'#2563eb' }, { name:'통신',        color:'#0891b2' },
  { name:'IT·소프트웨어',color:'#6366f1'}, { name:'유통·소비재', color:'#f59e0b' },
  { name:'에너지·원전', color:'#d97706' },
]

const INDEX_LINKS = [
  { label:'KOSPI 전체',   sub:'코스피 종합지수',    url:'https://finance.naver.com/sise/sise_index.naver?code=KOSPI',      color:'#2563eb' },
  { label:'KOSDAQ 전체',  sub:'코스닥 종합지수',    url:'https://finance.naver.com/sise/sise_index.naver?code=KOSDAQ',     color:'#16a34a' },
  { label:'KOSPI 200',    sub:'코스피 대형주 지수', url:'https://finance.naver.com/sise/sise_index.naver?code=KPI200',     color:'#0d9488' },
  { label:'KRX 300',      sub:'KRX 대표 300 종목', url:'https://finance.naver.com/sise/sise_index.naver?code=KRX300',     color:'#7c3aed' },
  { label:'코스피 거래량', sub:'거래량 상위 종목',  url:'https://finance.naver.com/sise/sise_quant.naver',                 color:'#d97706' },
  { label:'코스닥 거래량', sub:'코스닥 거래량 상위',url:'https://finance.naver.com/sise/sise_quant.naver?sosok=1',         color:'#ea580c' },
]

const MARKET_STAT_LINKS = [
  { label:'상한가 종목',  url:'https://finance.naver.com/sise/sise_upper.naver',   icon:'🔺' },
  { label:'하한가 종목',  url:'https://finance.naver.com/sise/sise_lower.naver',   icon:'🔻' },
  { label:'급등 종목',    url:'https://finance.naver.com/sise/sise_rise.naver',    icon:'🚀' },
  { label:'급락 종목',    url:'https://finance.naver.com/sise/sise_fall.naver',    icon:'📉' },
  { label:'52주 신고가',  url:'https://finance.naver.com/sise/sise_high52.naver',  icon:'🏆' },
  { label:'52주 신저가',  url:'https://finance.naver.com/sise/sise_low52.naver',   icon:'⚠️' },
  { label:'거래대금 상위',url:'https://finance.naver.com/sise/sise_quant.naver',   icon:'💰' },
  { label:'ETF 현황',     url:'https://finance.naver.com/sise/etf.naver',          icon:'📦' },
]

// AI 업종 분석
async function fetchSectorAnalysis(apiKey, sector) {
  const today = new Date().toLocaleDateString('ko-KR')
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
      max_tokens: 800,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content:
        `웹 검색으로 오늘(${today}) 한국 증시 "${sector}" 업종 최신 뉴스를 찾아보고 분석해줘.

## 📌 업종 현황 요약
## 🔑 핵심 모멘텀
## 📈 주목 종목
## ⚠️ 리스크
## 💡 투자 포인트

반드시 웹 검색으로 오늘 최신 뉴스 기반으로 작성해줘.` }],
    }),
  })
  if (!res.ok) throw new Error(`API 오류 ${res.status}`)
  const data = await res.json()
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
}

// ── 업종지수 카드 ────────────────────────────────
function SectorIndexCard({ item }) {
  const pc = rateColor(item.flu_rt)
  const sign = item.flu_rt > 0 ? '+' : ''
  return (
    <div className="mp-sector-idx-card">
      <div className="mp-sector-idx-name" style={{ color: item.color }}>{item.stk_nm}</div>
      <div className="mp-sector-idx-price">{fmt(item.cur_prc)}</div>
      <div className="mp-sector-idx-change" style={{ color: pc }}>
        {sign}{item.flu_rt?.toFixed(2)}%
      </div>
      <div className="mp-sector-idx-flow">
        <span className="mp-up">▲{item.rising}</span>
        <span className="mp-flat">━{item.stdns}</span>
        <span className="mp-down">▼{item.fall}</span>
      </div>
    </div>
  )
}

// ── 수급 테이블 ──────────────────────────────────
function SupplyTable({ title, data, loading, onStockClick }) {
  if (loading) return <div className="mp-supply-loading">불러오는 중...</div>
  if (!data?.length) return <div className="mp-supply-empty">데이터 없음</div>
  return (
    <div className="mp-supply-table-wrap">
      <div className="mp-supply-title">{title}</div>
      <div className="mp-supply-table">
        <div className="mp-supply-header">
          <div>종목명</div><div>현재가</div><div>등락률</div><div>순매수금액</div>
        </div>
        {data.slice(0, 10).map((r, i) => {
          const pc = rateColor(r.flu_rt)
          return (
            <div key={i} className="mp-supply-row" onClick={() => onStockClick({ name: r.stk_nm, code: r.stk_cd })}>
              <div className="mp-supply-name">{r.stk_nm}</div>
              <div style={{ color: pc, fontWeight: 600 }}>{fmt(r.cur_prc)}원</div>
              <div style={{ color: pc }}>{r.flu_rt > 0 ? '+' : ''}{r.flu_rt?.toFixed(2)}%</div>
              <div className="mp-supply-amt" style={{ color: r.netprps_amt > 0 ? '#ef4444' : '#3b82f6' }}>
                {r.netprps_amt > 0 ? '+' : ''}{Math.round(r.netprps_amt / 100000000)}억
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function MarketPage() {
  const [activeTab,       setActiveTab]       = useState('overview')
  const [selectedSector,  setSelectedSector]  = useState(null)
  const [aiAnalysis,      setAiAnalysis]      = useState({})
  const [aiLoading,       setAiLoading]       = useState('')
  const [aiError,         setAiError]         = useState('')
  const [sectorData,      setSectorData]      = useState([])    // 전업종지수
  const [sectorLoading,   setSectorLoading]   = useState(false)
  const [foreignData,     setForeignData]     = useState([])    // 외인 순매수
  const [institutionData, setInstitutionData] = useState([])    // 기관 순매수
  const [supplyLoading,   setSupplyLoading]   = useState(false)
  const [chartStock,      setChartStock]      = useState(null)

  const TABS = [
    { id:'overview', label:'시장 개요'  },
    { id:'sector',   label:'업종별 동향' },
    { id:'supply',   label:'수급 분석'  },
    { id:'stats',    label:'오늘의 통계' },
  ]

  // 전업종지수 로드
  const loadSectorData = useCallback(async () => {
    if (sectorData.length > 0) return
    setSectorLoading(true)
    try {
      const [kospi, kosdaq] = await Promise.all([
        fetch('/api/kiwoom?type=sector-all&inds_cd=001').then(r => r.json()),
        fetch('/api/kiwoom?type=sector-all&inds_cd=101').then(r => r.json()),
      ])
      const combined = [
        ...(kospi.data  || []).slice(0, 12),
        ...(kosdaq.data || []).slice(0, 6),
      ]
      setSectorData(combined)
    } catch (e) { console.error(e) }
    finally { setSectorLoading(false) }
  }, [sectorData.length])

  // 수급 데이터 로드
  const loadSupplyData = useCallback(async () => {
    if (foreignData.length > 0) return
    setSupplyLoading(true)
    try {
      const today = getKstStatus() === 'open' ? '' : ''
      const [foreign, institution] = await Promise.all([
        fetch('/api/kiwoom?type=supply-investor&market=001&invsr=6').then(r => r.json()),
        fetch('/api/kiwoom?type=supply-investor&market=001&invsr=7').then(r => r.json()),
      ])
      setForeignData(foreign.data     || [])
      setInstitutionData(institution.data || [])
    } catch (e) { console.error(e) }
    finally { setSupplyLoading(false) }
  }, [foreignData.length])

  useEffect(() => {
    if (activeTab === 'sector') loadSectorData()
    if (activeTab === 'supply') loadSupplyData()
  }, [activeTab])

  const handleSectorAI = async (sectorName) => {
    if (aiLoading) return
    setAiLoading(sectorName); setAiError('')
    try {
      const key = import.meta.env.VITE_CLAUDE_API_KEY
      if (!key) throw new Error('Claude API 키가 없어요.')
      if (aiAnalysis[sectorName]) { setAiLoading(''); return }
      const text = await fetchSectorAnalysis(key, sectorName)
      setAiAnalysis(prev => ({ ...prev, [sectorName]: text }))
    } catch (e) { setAiError(e.message) }
    finally { setAiLoading('') }
  }

  return (
    <div className="market-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">시장 · 업종</h1>
          <p className="page-sub">지수 동향 · 업종별 분석 · 수급 현황</p>
        </div>
      </div>

      <div className="market-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`market-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ── 시장 개요 ── */}
      {activeTab === 'overview' && (
        <div className="tab-content">
          <section className="market-section">
            <div className="section-label">주요 지수</div>
            <div className="index-grid">
              {INDEX_LINKS.map(idx => (
                <a key={idx.label} href={idx.url} target="_blank" rel="noreferrer"
                  className="index-card" style={{ '--idx-color': idx.color }}>
                  <div className="index-dot" style={{ background: idx.color }}/>
                  <div>
                    <div className="index-name">{idx.label}</div>
                    <div className="index-sub">{idx.sub}</div>
                  </div>
                  <span className="index-arrow">→</span>
                </a>
              ))}
            </div>
          </section>
          <section className="market-section">
            <div className="section-label">시장 전체 흐름</div>
            <div className="flow-grid">
              {[
                { label:'📊 코스피 전 종목',  desc:'시가총액·등락률 전체 현황', url:'https://finance.naver.com/sise/sise_market_sum.naver?sosok=0', cls:'blue' },
                { label:'📊 코스닥 전 종목',  desc:'코스닥 전 종목 현황',       url:'https://finance.naver.com/sise/sise_market_sum.naver?sosok=1', cls:'green' },
                { label:'🏭 업종별 지수',     desc:'코스피 업종별 등락률 전체', url:'https://finance.naver.com/sise/sise_index_group.naver?type=0',  cls:'purple' },
                { label:'🏭 코스닥 업종지수', desc:'코스닥 업종별 등락률',      url:'https://finance.naver.com/sise/sise_index_group.naver?type=1',  cls:'orange' },
                { label:'📦 ETF 전체',        desc:'테마·레버리지·인버스 ETF', url:'https://finance.naver.com/sise/etf.naver',                       cls:'teal' },
                { label:'📈 KOSPI 200',       desc:'대형주 200 지수 흐름',      url:'https://finance.naver.com/sise/sise_index.naver?code=KPI200',   cls:'gray' },
              ].map(f => (
                <a key={f.label} href={f.url} target="_blank" rel="noreferrer" className={`flow-card ${f.cls}`}>
                  <div className="flow-title">{f.label}</div>
                  <div className="flow-desc">{f.desc}</div>
                </a>
              ))}
            </div>
          </section>
          <section className="market-section">
            <div className="section-label-row">
              <div className="section-label">빠른 통계 바로가기</div>
              <button className="tab-link-btn" onClick={() => setActiveTab('stats')}>전체 보기 →</button>
            </div>
            <div className="stat-mini-grid">
              {MARKET_STAT_LINKS.slice(0, 4).map(s => (
                <a key={s.label} href={s.url} target="_blank" rel="noreferrer" className="stat-mini-card">
                  <span className="stat-mini-icon">{s.icon}</span>
                  <span className="stat-mini-label">{s.label}</span>
                </a>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ── 업종별 동향 ── */}
      {activeTab === 'sector' && (
        <div className="tab-content">
          {/* 실시간 업종지수 */}
          <section className="market-section">
            <div className="section-label-row">
              <div className="section-label">전업종 지수 실시간</div>
              <button className="tab-link-btn" onClick={loadSectorData}>↺ 갱신</button>
            </div>
            {sectorLoading && <div className="mp-loading-bar">업종 데이터 로딩 중...</div>}
            {!sectorLoading && sectorData.length > 0 && (
              <div className="mp-sector-idx-grid">
                {sectorData.map((s, i) => <SectorIndexCard key={i} item={s}/>)}
              </div>
            )}
            {!sectorLoading && sectorData.length === 0 && (
              <button className="mp-load-btn" onClick={loadSectorData}>📡 업종 데이터 불러오기</button>
            )}
          </section>

          {/* AI 업종 분석 */}
          <section className="market-section">
            <div className="section-label">업종 선택 → AI 웹검색 분석</div>
            <div className="sector-grid">
              {SECTOR_CHIPS.map(s => (
                <button key={s.name}
                  className={`sector-chip ${selectedSector?.name === s.name ? 'active' : ''}`}
                  style={{ '--s-color': s.color }}
                  onClick={() => setSelectedSector(prev => prev?.name === s.name ? null : s)}>
                  <span className="sector-dot" style={{ background: s.color }}/>
                  {s.name}
                </button>
              ))}
            </div>
          </section>

          {selectedSector && (
            <section className="market-section sector-detail">
              <div className="sector-detail-header">
                <div>
                  <span className="sector-detail-name" style={{ color: selectedSector.color }}>
                    {selectedSector.name} 업종
                  </span>
                  <div className="sector-detail-links">
                    <a href="https://finance.naver.com/sise/sise_index_group.naver?type=0"
                      target="_blank" rel="noreferrer" className="sector-link-btn">업종 지수 →</a>
                  </div>
                </div>
                <button className="ai-sector-btn" style={{ '--s-color': selectedSector.color }}
                  onClick={() => handleSectorAI(selectedSector.name)} disabled={!!aiLoading}>
                  {aiLoading === selectedSector.name
                    ? <><span className="btn-spinner-sm"/>검색 중...</>
                    : aiAnalysis[selectedSector.name] ? '↺ 다시 분석' : <><span>🔍</span> AI 분석</>}
                </button>
              </div>
              {aiError && <div className="sector-ai-error">{aiError}</div>}
              {!aiAnalysis[selectedSector.name] && !aiLoading && !aiError && (
                <div className="sector-ai-placeholder">
                  <p>🔍 AI 분석 버튼을 눌러 <strong>{selectedSector.name}</strong> 업종 최신 분석을 받아보세요</p>
                  <p className="dim-text">웹을 실시간 검색해서 오늘 뉴스 기반으로 분석해드려요</p>
                </div>
              )}
              {aiLoading === selectedSector.name && (
                <div className="sector-ai-loading">
                  <div className="loading-spinner-lg" style={{ borderTopColor: selectedSector.color }}/>
                  <p>🔍 웹에서 {selectedSector.name} 최신 뉴스 검색 중...</p>
                </div>
              )}
              {aiAnalysis[selectedSector.name] && (
                <div className="sector-ai-result">
                  <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600, marginBottom: '10px' }}>🔍 웹 검색 기반</div>
                  <pre className="sector-ai-text">{aiAnalysis[selectedSector.name]}</pre>
                </div>
              )}
            </section>
          )}
          {!selectedSector && <div className="sector-guide">위에서 업종을 선택하면 AI 분석을 확인할 수 있어요</div>}
        </div>
      )}

      {/* ── 수급 분석 ── */}
      {activeTab === 'supply' && (
        <div className="tab-content">
          <section className="market-section">
            <div className="section-label-row">
              <div className="section-label">🌐 외국인 순매수 상위 (장중 실시간)</div>
              <button className="tab-link-btn" onClick={() => { setForeignData([]); setInstitutionData([]); loadSupplyData() }}>↺ 갱신</button>
            </div>
            <div className="mp-supply-grid">
              <SupplyTable title="🌐 외국인 순매수 상위" data={foreignData}     loading={supplyLoading} onStockClick={setChartStock}/>
              <SupplyTable title="🏛️ 기관 순매수 상위"  data={institutionData} loading={supplyLoading} onStockClick={setChartStock}/>
            </div>
            {!supplyLoading && foreignData.length === 0 && (
              <button className="mp-load-btn" onClick={loadSupplyData}>📡 수급 데이터 불러오기</button>
            )}
            <div className="supply-notice" style={{ marginTop: 12 }}>
              <span>💡</span><span>장중(9:00~15:30)에만 실시간 데이터가 조회됩니다. 장 외 시간에는 최근 데이터가 표시됩니다.</span>
            </div>
          </section>
          <section className="market-section">
            <div className="section-label">수급 바로가기</div>
            <div className="supply-grid">
              {[
                { label:'외국인 순매수', icon:'🌐', url:'https://finance.naver.com/sise/foreign_list.naver',         desc:'코스피 외국인 순매수 상위' },
                { label:'기관 순매수',   icon:'🏛️', url:'https://finance.naver.com/sise/inst_list.naver',            desc:'코스피 기관 순매수 상위' },
                { label:'프로그램 매매', icon:'💻', url:'https://finance.naver.com/sise/program_list.naver',         desc:'프로그램 매수·매도 현황' },
                { label:'공매도 현황',   icon:'📉', url:'https://finance.naver.com/sise/short_sell_list.naver',      desc:'공매도 상위 종목' },
                { label:'투자자별 매매', icon:'📊', url:'https://finance.naver.com/sise/investorDealTrendView.naver',desc:'개인·외국인·기관 매매 동향' },
              ].map(l => (
                <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="supply-card">
                  <div className="supply-icon">{l.icon}</div>
                  <div><div className="supply-label">{l.label}</div><div className="supply-desc">{l.desc}</div></div>
                  <span className="supply-arrow">→</span>
                </a>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ── 오늘의 통계 ── */}
      {activeTab === 'stats' && (
        <div className="tab-content">
          <section className="market-section">
            <div className="section-label">오늘의 시장 통계</div>
            <div className="stats-grid">
              {MARKET_STAT_LINKS.map(s => (
                <a key={s.label} href={s.url} target="_blank" rel="noreferrer" className="stat-card">
                  <span className="stat-icon">{s.icon}</span>
                  <span className="stat-label">{s.label}</span>
                  <span className="stat-arrow">→</span>
                </a>
              ))}
            </div>
          </section>
          <section className="market-section">
            <div className="section-label">테마별 종목 현황</div>
            <div className="theme-stat-grid">
              {[
                { label:'테마주 전체',    url:'https://finance.naver.com/sise/theme.naver',                icon:'🎯' },
                { label:'배당주',         url:'https://finance.naver.com/sise/sise_dividend_total.naver', icon:'💵' },
                { label:'신고가 종목',    url:'https://finance.naver.com/sise/sise_high52.naver',         icon:'🏆' },
                { label:'외국인 순매수',  url:'https://finance.naver.com/sise/foreign_list.naver',        icon:'🌐' },
                { label:'기관 순매수',    url:'https://finance.naver.com/sise/inst_list.naver',           icon:'🏛️' },
                { label:'공매도 순위',    url:'https://finance.naver.com/sise/short_sell_list.naver',     icon:'📉' },
              ].map(s => (
                <a key={s.label} href={s.url} target="_blank" rel="noreferrer" className="theme-stat-card">
                  <span>{s.icon}</span><span>{s.label}</span><span className="stat-arrow">→</span>
                </a>
              ))}
            </div>
          </section>
        </div>
      )}

      {chartStock && <StockChartModal stock={chartStock} onClose={() => setChartStock(null)}/>}
    </div>
  )
}
