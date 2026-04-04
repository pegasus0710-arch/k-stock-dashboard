import { useState, useEffect, useCallback, useRef } from 'react'
import GlobalChartModal from '../components/GlobalChartModal'
import { fmt, fmtRate, rateColor, getKstStatus } from '../utils/format'
import './MarketPage.css'

// ── 업종 히트맵 데이터 (KIS 업종코드) ──────────────
const HEATMAP_SECTORS = [
  // KOSPI 업종
  { name: '반도체',      inds_cd: '004', mrkt: '0', color_cat: 'tech' },
  { name: '전기전자',    inds_cd: '008', mrkt: '0', color_cat: 'tech' },
  { name: '자동차',      inds_cd: '007', mrkt: '0', color_cat: 'mfg'  },
  { name: '2차전지',     inds_cd: '027', mrkt: '0', color_cat: 'tech' },
  { name: '바이오·제약', inds_cd: '009', mrkt: '0', color_cat: 'bio'  },
  { name: '금융·보험',   inds_cd: '005', mrkt: '0', color_cat: 'fin'  },
  { name: '화학',        inds_cd: '006', mrkt: '0', color_cat: 'mfg'  },
  { name: '건설',        inds_cd: '010', mrkt: '0', color_cat: 'con'  },
  { name: '철강·금속',   inds_cd: '011', mrkt: '0', color_cat: 'mfg'  },
  { name: '에너지',      inds_cd: '012', mrkt: '0', color_cat: 'eng'  },
  { name: '유통·소비',   inds_cd: '013', mrkt: '0', color_cat: 'con'  },
  { name: '통신',        inds_cd: '014', mrkt: '0', color_cat: 'tech' },
  { name: '운수·창고',   inds_cd: '015', mrkt: '0', color_cat: 'mfg'  },
  { name: '음식료',      inds_cd: '016', mrkt: '0', color_cat: 'con'  },
  { name: '방산·우주',   inds_cd: '017', mrkt: '0', color_cat: 'mfg'  },
  { name: '조선·기계',   inds_cd: '018', mrkt: '0', color_cat: 'mfg'  },
  // KOSDAQ 업종
  { name: 'IT소프트웨어',inds_cd: '105', mrkt: '1', color_cat: 'tech' },
  { name: '제약',        inds_cd: '107', mrkt: '1', color_cat: 'bio'  },
  { name: '게임',        inds_cd: '106', mrkt: '1', color_cat: 'tech' },
  { name: '엔터·미디어', inds_cd: '114', mrkt: '1', color_cat: 'con'  },
  { name: '로봇·AI',     inds_cd: '116', mrkt: '1', color_cat: 'tech' },
  { name: '코스닥 IT',   inds_cd: '103', mrkt: '1', color_cat: 'tech' },
  { name: '코스닥 바이오',inds_cd:'108', mrkt: '1', color_cat: 'bio'  },
  { name: '코스닥 소재', inds_cd: '110', mrkt: '1', color_cat: 'mfg'  },
]

// 이슈 테마 (종목 평균으로 계산)
const ISSUE_THEMES = [
  { name: 'AI·반도체',   codes: ['000660','005930','042700'], color: '#2563eb' },
  { name: 'K-방산',      codes: ['047810','012450','006360'], color: '#dc2626' },
  { name: '원전·SMR',    codes: ['034020','298040','052690'], color: '#d97706' },
  { name: '2차전지',     codes: ['373220','247540','096770'], color: '#16a34a' },
  { name: 'HBM·고대역폭',codes: ['000660','336370','403870'], color: '#7c3aed' },
  { name: '로봇',        codes: ['215090','277810','090460'], color: '#0d9488' },
  { name: '바이오시밀러', codes: ['207940','068270','145020'], color: '#ec4899' },
  { name: '조선',        codes: ['009540','010140','042660'], color: '#0891b2' },
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
  { label:'상한가 종목',   url:'https://finance.naver.com/sise/sise_upper.naver',   icon:'🔺' },
  { label:'하한가 종목',   url:'https://finance.naver.com/sise/sise_lower.naver',   icon:'🔻' },
  { label:'급등 종목',     url:'https://finance.naver.com/sise/sise_rise.naver',    icon:'🚀' },
  { label:'급락 종목',     url:'https://finance.naver.com/sise/sise_fall.naver',    icon:'📉' },
  { label:'52주 신고가',   url:'https://finance.naver.com/sise/sise_high52.naver',  icon:'🏆' },
  { label:'52주 신저가',   url:'https://finance.naver.com/sise/sise_low52.naver',   icon:'⚠️' },
  { label:'거래대금 상위', url:'https://finance.naver.com/sise/sise_quant.naver',   icon:'💰' },
  { label:'ETF 현황',      url:'https://finance.naver.com/sise/etf.naver',          icon:'📦' },
]

// ── 히트맵 색상 계산 ─────────────────────────────────
function heatmapColor(rate) {
  if (rate === null || rate === undefined) return { bg: '#F1F5F9', text: '#64748B' }
  if (rate >=  3.0) return { bg: '#7F1D1D', text: '#FEE2E2' }
  if (rate >=  1.5) return { bg: '#DC2626', text: '#FEF2F2' }
  if (rate >=  0.3) return { bg: '#EF4444', text: '#FFFFFF' }
  if (rate >=  0.0) return { bg: '#F8FAFC', text: '#475569' }
  if (rate >= -1.5) return { bg: '#2563EB', text: '#DBEAFE' }
  if (rate >= -3.0) return { bg: '#1D4ED8', text: '#EFF6FF' }
  return { bg: '#1E3A8A', text: '#BFDBFE' }
}

// ── 섹터 히트맵 셀 ───────────────────────────────────
function HeatmapCell({ sector, rate, onClick }) {
  const { bg, text } = heatmapColor(rate)
  const sign = rate > 0 ? '+' : ''
  return (
    <div className="mp-heatmap-cell" style={{ background: bg, color: text }}
      onClick={onClick} title={`${sector.name}: ${rate !== null ? sign + rate?.toFixed(2) + '%' : '—'}`}>
      <div className="mp-heatmap-name">{sector.name}</div>
      <div className="mp-heatmap-rate">
        {rate !== null ? `${sign}${rate?.toFixed(2)}%` : '—'}
      </div>
    </div>
  )
}

// ── 마켓 브레스 ──────────────────────────────────────
function MarketBreath({ sectorRates }) {
  const rates  = Object.values(sectorRates).filter(r => r !== null)
  const up     = rates.filter(r => r > 0).length
  const flat   = rates.filter(r => r === 0).length
  const down   = rates.filter(r => r < 0).length
  const total  = rates.length || 1
  const upPct  = Math.round(up   / total * 100)
  const downPct= Math.round(down / total * 100)

  if (!rates.length) return null
  return (
    <div className="mp-breath-bar">
      <span className="mp-breath-label">업종 브레스</span>
      <div className="mp-breath-track">
        <div className="mp-breath-up"   style={{ width: `${upPct}%` }}>{up}▲</div>
        <div className="mp-breath-flat" style={{ width: `${flat/total*100}%` }}>{flat > 0 ? flat : ''}</div>
        <div className="mp-breath-down" style={{ width: `${downPct}%` }}>{down}▼</div>
      </div>
      <span className="mp-breath-summary" style={{ color: upPct >= 50 ? '#22c55e' : '#ef4444' }}>
        {upPct >= 50 ? '상승 우세' : '하락 우세'}
      </span>
    </div>
  )
}

// ── AI 업종 분석 ─────────────────────────────────────
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

// ── 업종지수 카드 ─────────────────────────────────────
function SectorIndexCard({ item }) {
  const pc   = rateColor(item.flu_rt)
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

// ── 수급 테이블 ──────────────────────────────────────
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

// ── 메인 ─────────────────────────────────────────────
export default function MarketPage() {
  const [activeTab,       setActiveTab]       = useState('heatmap')
  const [selectedSector,  setSelectedSector]  = useState(null)
  const [aiAnalysis,      setAiAnalysis]      = useState({})
  const [aiLoading,       setAiLoading]       = useState('')
  const [aiError,         setAiError]         = useState('')

  // 히트맵 데이터
  const [heatRates,       setHeatRates]       = useState({})  // { inds_cd: rate }
  const [heatLoading,     setHeatLoading]     = useState(false)
  const [heatLastFetch,   setHeatLastFetch]   = useState('')

  // 이슈 테마 가격
  const [themePrices,     setThemePrices]     = useState({})

  // 전업종지수
  const [sectorData,      setSectorData]      = useState([])
  const [sectorLoading,   setSectorLoading]   = useState(false)

  // 수급
  const [foreignData,     setForeignData]     = useState([])
  const [institutionData, setInstitutionData] = useState([])
  const [supplyLoading,   setSupplyLoading]   = useState(false)
  const [chartStock,      setChartStock]      = useState(null)

  const timerRef = useRef(null)

  const TABS = [
    { id: 'heatmap',  label: '📊 섹터 히트맵' },
    { id: 'overview', label: '시장 개요'       },
    { id: 'sector',   label: '업종별 분석'     },
    { id: 'supply',   label: '수급 분석'       },
    { id: 'stats',    label: '오늘의 통계'     },
  ]

  // ── 히트맵 데이터 로드 ───────────────────────────────
  const loadHeatmap = useCallback(async () => {
    setHeatLoading(true)
    try {
      // 키움 API로 업종별 현재 등락률 조회
      const results = await Promise.allSettled(
        HEATMAP_SECTORS.map(s =>
          fetch(`/api/kiwoom?type=index-price&inds_cd=${s.inds_cd}&mrkt_tp=${s.mrkt}`)
            .then(r => r.json())
            .catch(() => null)
        )
      )
      const rates = {}
      results.forEach((r, i) => {
        const s   = HEATMAP_SECTORS[i]
        const val = r.status === 'fulfilled' && r.value?.flu_rt
        rates[s.inds_cd] = val !== undefined && val !== false ? Number(val) : null
      })
      setHeatRates(rates)
      setHeatLastFetch(new Date().toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }))
    } catch (e) { console.error('[heatmap]', e) }
    finally { setHeatLoading(false) }
  }, [])

  // ── 이슈 테마 가격 ───────────────────────────────────
  const loadThemePrices = useCallback(async () => {
    try {
      const allCodes = [...new Set(ISSUE_THEMES.flatMap(t => t.codes))]
      const map = await fetch(`/api/kiwoom?type=prices&codes=${allCodes.join(',')}`).then(r => r.json())
      // 새 API: { code: { price, changeRate } } 객체 형식
      const themeRates = {}
      ISSUE_THEMES.forEach(t => {
        const rates = t.codes.map(c => map[c]?.changeRate).filter(r => r !== undefined && r !== null)
        themeRates[t.name] = rates.length
          ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length * 100) / 100
          : null
      })
      setThemePrices(themeRates)
    } catch (e) { console.error('[theme prices]', e) }
  }, [])

  // ── 전업종지수 ───────────────────────────────────────
  const loadSectorData = useCallback(async () => {
    if (sectorData.length > 0) return
    setSectorLoading(true)
    try {
      const [kospi, kosdaq] = await Promise.all([
        fetch('/api/kiwoom?type=sector-all&inds_cd=001').then(r => r.json()),
        fetch('/api/kiwoom?type=sector-all&inds_cd=101').then(r => r.json()),
      ])
      setSectorData([...(kospi.data||[]).slice(0,12), ...(kosdaq.data||[]).slice(0,6)])
    } catch (e) { console.error(e) }
    finally { setSectorLoading(false) }
  }, [sectorData.length])

  // ── 수급 ─────────────────────────────────────────────
  const loadSupplyData = useCallback(async () => {
    if (foreignData.length > 0) return
    setSupplyLoading(true)
    try {
      const [foreign, institution] = await Promise.all([
        fetch('/api/kiwoom?type=supply-investor&market=001&invsr=6').then(r => r.json()),
        fetch('/api/kiwoom?type=supply-investor&market=001&invsr=7').then(r => r.json()),
      ])
      setForeignData(foreign.data || [])
      setInstitutionData(institution.data || [])
    } catch (e) { console.error(e) }
    finally { setSupplyLoading(false) }
  }, [foreignData.length])

  useEffect(() => {
    if (activeTab === 'heatmap') {
      loadHeatmap()
      loadThemePrices()
      timerRef.current = setInterval(() => {
        if (getKstStatus() === 'open') { loadHeatmap(); loadThemePrices() }
      }, 60000)
    }
    if (activeTab === 'sector') loadSectorData()
    if (activeTab === 'supply') loadSupplyData()
    return () => clearInterval(timerRef.current)
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

  const isOpen = getKstStatus() === 'open'

  return (
    <div className="market-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">시장 · 업종</h1>
          <p className="page-sub">섹터 히트맵 · 지수 동향 · 업종별 분석 · 수급 현황</p>
        </div>
      </div>

      <div className="market-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`market-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ══ 섹터 히트맵 탭 ══ */}
      {activeTab === 'heatmap' && (
        <div className="tab-content">

          {/* 마켓 브레스 */}
          <MarketBreath sectorRates={heatRates}/>

          {/* 업종 히트맵 */}
          <section className="market-section">
            <div className="section-label-row">
              <div className="section-label">
                📊 업종 히트맵
                {isOpen && <span className="mp-live-badge"> ● LIVE</span>}
                {!isOpen && <span className="mp-closed-note"> 전일 기준</span>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {heatLastFetch && <span className="mp-fetch-time">{heatLastFetch} 기준</span>}
                <button className="mp-reload-btn" onClick={loadHeatmap} disabled={heatLoading}>
                  {heatLoading ? '⟳' : '↺ 갱신'}
                </button>
              </div>
            </div>

            {heatLoading && !Object.keys(heatRates).length ? (
              <div className="mp-heatmap-loading">업종 데이터 로딩 중...</div>
            ) : (
              <>
                {/* KOSPI 업종 */}
                <div className="mp-heatmap-group-label">KOSPI 업종</div>
                <div className="mp-heatmap-grid">
                  {HEATMAP_SECTORS.filter(s => s.mrkt === '0').map(s => (
                    <HeatmapCell
                      key={s.inds_cd}
                      sector={s}
                      rate={heatRates[s.inds_cd] ?? null}
                      onClick={() => setSelectedSector(s)}
                    />
                  ))}
                </div>

                {/* KOSDAQ 업종 */}
                <div className="mp-heatmap-group-label" style={{ marginTop: 12 }}>KOSDAQ 업종</div>
                <div className="mp-heatmap-grid">
                  {HEATMAP_SECTORS.filter(s => s.mrkt === '1').map(s => (
                    <HeatmapCell
                      key={s.inds_cd}
                      sector={s}
                      rate={heatRates[s.inds_cd] ?? null}
                      onClick={() => setSelectedSector(s)}
                    />
                  ))}
                </div>

                {/* 컬러 범례 */}
                <div className="mp-heatmap-legend">
                  {[[-4,'#1E3A8A'],[-2,'#1D4ED8'],[-0.3,'#2563EB'],[0,'#F1F5F9'],[0.3,'#EF4444'],[2,'#DC2626'],[4,'#7F1D1D']].map(([v,bg]) => (
                    <div key={v} className="mp-legend-item">
                      <div className="mp-legend-dot" style={{ background: bg }}/>
                      <span>{v > 0 ? '+' : ''}{v}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* 이슈 테마 */}
          <section className="market-section">
            <div className="section-label">🔥 이슈 테마 등락</div>
            <div className="mp-theme-heatmap">
              {ISSUE_THEMES.map(t => {
                const rate  = themePrices[t.name]
                const { bg, text } = heatmapColor(rate)
                const sign  = rate > 0 ? '+' : ''
                return (
                  <div key={t.name} className="mp-theme-cell"
                    style={{ background: bg, color: text, borderColor: t.color + '40' }}>
                    <div className="mp-theme-cell-name">{t.name}</div>
                    <div className="mp-theme-cell-rate">
                      {rate !== null && rate !== undefined ? `${sign}${rate?.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* AI 업종 분석 패널 (히트맵 셀 클릭 시) */}
          {selectedSector && (
            <section className="market-section sector-detail">
              <div className="sector-detail-header">
                <div>
                  <span className="sector-detail-name">{selectedSector.name} 업종</span>
                  {heatRates[selectedSector.inds_cd] !== undefined && (
                    <span className="mp-heatmap-rate-badge"
                      style={{ color: rateColor(heatRates[selectedSector.inds_cd]) }}>
                      {heatRates[selectedSector.inds_cd] > 0 ? '+' : ''}
                      {heatRates[selectedSector.inds_cd]?.toFixed(2)}%
                    </span>
                  )}
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <button className="ai-sector-btn"
                    onClick={() => handleSectorAI(selectedSector.name)} disabled={!!aiLoading}>
                    {aiLoading === selectedSector.name
                      ? <><span className="btn-spinner-sm"/>검색 중...</>
                      : aiAnalysis[selectedSector.name] ? '↺ 다시 분석' : '🔍 AI 분석'}
                  </button>
                  <button className="mp-close-detail" onClick={() => setSelectedSector(null)}>✕</button>
                </div>
              </div>
              {aiError && <div className="sector-ai-error">{aiError}</div>}
              {!aiAnalysis[selectedSector.name] && !aiLoading && (
                <div className="sector-ai-placeholder">
                  🔍 AI 분석 버튼을 눌러 <strong>{selectedSector.name}</strong> 업종 최신 분석을 받아보세요
                </div>
              )}
              {aiLoading === selectedSector.name && (
                <div className="sector-ai-loading">
                  <div className="loading-spinner-lg"/><p>🔍 웹에서 {selectedSector.name} 최신 뉴스 검색 중...</p>
                </div>
              )}
              {aiAnalysis[selectedSector.name] && (
                <div className="sector-ai-result">
                  <pre className="sector-ai-text">{aiAnalysis[selectedSector.name]}</pre>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* ══ 시장 개요 탭 ══ */}
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
                { label:'📊 코스피 전 종목',   desc:'시가총액·등락률 전체', url:'https://finance.naver.com/sise/sise_market_sum.naver?sosok=0', cls:'blue'  },
                { label:'📊 코스닥 전 종목',   desc:'코스닥 전 종목 현황',  url:'https://finance.naver.com/sise/sise_market_sum.naver?sosok=1', cls:'green' },
                { label:'🏭 업종별 지수',       desc:'코스피 업종별 등락률', url:'https://finance.naver.com/sise/sise_index_group.naver?type=0',  cls:'purple'},
                { label:'🏭 코스닥 업종지수',   desc:'코스닥 업종별 등락률', url:'https://finance.naver.com/sise/sise_index_group.naver?type=1',  cls:'orange'},
                { label:'📦 ETF 전체',          desc:'테마·레버리지·인버스', url:'https://finance.naver.com/sise/etf.naver',                       cls:'teal'  },
                { label:'📈 KOSPI 200',         desc:'대형주 200 지수 흐름', url:'https://finance.naver.com/sise/sise_index.naver?code=KPI200',    cls:'gray'  },
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

      {/* ══ 업종별 분석 탭 ══ */}
      {activeTab === 'sector' && (
        <div className="tab-content">
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

          <section className="market-section">
            <div className="section-label">업종 선택 → AI 웹검색 분석</div>
            <div className="sector-grid">
              {HEATMAP_SECTORS.map(s => (
                <button key={s.inds_cd}
                  className={`sector-chip ${selectedSector?.inds_cd === s.inds_cd ? 'active' : ''}`}
                  onClick={() => setSelectedSector(prev => prev?.inds_cd === s.inds_cd ? null : s)}>
                  <span className="sector-dot"/>
                  {s.name}
                  {heatRates[s.inds_cd] !== null && heatRates[s.inds_cd] !== undefined && (
                    <span style={{ fontSize: 10, color: rateColor(heatRates[s.inds_cd]), marginLeft: 4 }}>
                      {heatRates[s.inds_cd] > 0 ? '+' : ''}{heatRates[s.inds_cd]?.toFixed(1)}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {selectedSector && (
            <section className="market-section sector-detail">
              <div className="sector-detail-header">
                <span className="sector-detail-name">{selectedSector.name} 업종</span>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="ai-sector-btn"
                    onClick={() => handleSectorAI(selectedSector.name)} disabled={!!aiLoading}>
                    {aiLoading === selectedSector.name
                      ? <><span className="btn-spinner-sm"/>검색 중...</>
                      : aiAnalysis[selectedSector.name] ? '↺ 다시 분석' : '🔍 AI 분석'}
                  </button>
                  <button className="mp-close-detail" onClick={() => setSelectedSector(null)}>✕</button>
                </div>
              </div>
              {aiError && <div className="sector-ai-error">{aiError}</div>}
              {!aiAnalysis[selectedSector.name] && !aiLoading && !aiError && (
                <div className="sector-ai-placeholder">
                  🔍 AI 분석 버튼을 눌러 <strong>{selectedSector.name}</strong> 업종 최신 분석을 받아보세요
                </div>
              )}
              {aiLoading === selectedSector.name && (
                <div className="sector-ai-loading">
                  <div className="loading-spinner-lg"/>
                  <p>🔍 웹에서 {selectedSector.name} 최신 뉴스 검색 중...</p>
                </div>
              )}
              {aiAnalysis[selectedSector.name] && (
                <div className="sector-ai-result">
                  <pre className="sector-ai-text">{aiAnalysis[selectedSector.name]}</pre>
                </div>
              )}
            </section>
          )}
          {!selectedSector && <div className="sector-guide">업종을 선택하면 AI 분석을 확인할 수 있어요</div>}
        </div>
      )}

      {/* ══ 수급 분석 탭 ══ */}
      {activeTab === 'supply' && (
        <div className="tab-content">
          <section className="market-section">
            <div className="section-label-row">
              <div className="section-label">🌐 외국인 · 기관 순매수 (장중 실시간)</div>
              <button className="tab-link-btn" onClick={() => { setForeignData([]); setInstitutionData([]); loadSupplyData() }}>↺ 갱신</button>
            </div>
            <div className="mp-supply-grid">
              <SupplyTable title="🌐 외국인 순매수 상위" data={foreignData}     loading={supplyLoading} onStockClick={setChartStock}/>
              <SupplyTable title="🏛️ 기관 순매수 상위"   data={institutionData} loading={supplyLoading} onStockClick={setChartStock}/>
            </div>
            {!supplyLoading && foreignData.length === 0 && (
              <button className="mp-load-btn" onClick={loadSupplyData}>📡 수급 데이터 불러오기</button>
            )}
            <div className="supply-notice" style={{ marginTop: 12 }}>
              <span>💡</span><span>장중(9:00~15:30)에만 실시간 데이터가 조회됩니다.</span>
            </div>
          </section>
          <section className="market-section">
            <div className="section-label">수급 바로가기</div>
            <div className="supply-grid">
              {[
                { label:'외국인 순매수', icon:'🌐', url:'https://finance.naver.com/sise/foreign_list.naver',          desc:'코스피 외국인 순매수 상위' },
                { label:'기관 순매수',   icon:'🏛️', url:'https://finance.naver.com/sise/inst_list.naver',             desc:'코스피 기관 순매수 상위'   },
                { label:'프로그램 매매', icon:'💻', url:'https://finance.naver.com/sise/program_list.naver',          desc:'프로그램 매수·매도 현황'   },
                { label:'공매도 현황',   icon:'📉', url:'https://finance.naver.com/sise/short_sell_list.naver',       desc:'공매도 상위 종목'          },
                { label:'투자자별 매매', icon:'📊', url:'https://finance.naver.com/sise/investorDealTrendView.naver', desc:'개인·외국인·기관 매매 동향'},
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

      {/* ══ 오늘의 통계 탭 ══ */}
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
                { label:'테마주 전체',   url:'https://finance.naver.com/sise/theme.naver',                icon:'🎯' },
                { label:'배당주',        url:'https://finance.naver.com/sise/sise_dividend_total.naver', icon:'💵' },
                { label:'신고가 종목',   url:'https://finance.naver.com/sise/sise_high52.naver',         icon:'🏆' },
                { label:'외국인 순매수', url:'https://finance.naver.com/sise/foreign_list.naver',        icon:'🌐' },
                { label:'기관 순매수',   url:'https://finance.naver.com/sise/inst_list.naver',           icon:'🏛️' },
                { label:'공매도 순위',   url:'https://finance.naver.com/sise/short_sell_list.naver',     icon:'📉' },
              ].map(s => (
                <a key={s.label} href={s.url} target="_blank" rel="noreferrer" className="theme-stat-card">
                  <span>{s.icon}</span><span>{s.label}</span><span className="stat-arrow">→</span>
                </a>
              ))}
            </div>
          </section>
        </div>
      )}

      {chartStock && (
        <GlobalChartModal
          type="stock"
          symbol={chartStock.code}
          name={chartStock.name}
          onClose={() => setChartStock(null)}
        />
      )}
    </div>
  )
}
