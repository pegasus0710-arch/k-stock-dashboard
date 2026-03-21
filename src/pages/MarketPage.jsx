import { useState } from 'react'
import './MarketPage.css'

// ─── 업종 데이터 ─────────────────────────────────────────
const SECTORS = [
  { name: '반도체',     color: '#2563eb', naverCode: 'Q301' },
  { name: '자동차',     color: '#0d9488', naverCode: 'Q302' },
  { name: '조선',       color: '#0d9488', naverCode: 'Q303' },
  { name: '방산',       color: '#dc2626', naverCode: 'Q304' },
  { name: '바이오·제약',color: '#7c3aed', naverCode: 'Q305' },
  { name: '2차전지',    color: '#16a34a', naverCode: 'Q306' },
  { name: '금융·보험',  color: '#ea580c', naverCode: 'Q307' },
  { name: '건설',       color: '#64748b', naverCode: 'Q308' },
  { name: '철강·금속',  color: '#78716c', naverCode: 'Q309' },
  { name: '화학',       color: '#d97706', naverCode: 'Q310' },
  { name: '전기·전자',  color: '#2563eb', naverCode: 'Q311' },
  { name: '통신',       color: '#0891b2', naverCode: 'Q312' },
  { name: 'IT·소프트웨어', color: '#6366f1', naverCode: 'Q313' },
  { name: '유통·소비재', color: '#f59e0b', naverCode: 'Q314' },
  { name: '에너지·원전', color: '#d97706', naverCode: 'Q315' },
]

// ─── 주요 지수 링크 ──────────────────────────────────────
const INDEX_LINKS = [
  { label: 'KOSPI 전체',    sub: '코스피 종합지수',    url: 'https://finance.naver.com/sise/sise_index.naver?code=KOSPI',        color: '#2563eb' },
  { label: 'KOSDAQ 전체',   sub: '코스닥 종합지수',    url: 'https://finance.naver.com/sise/sise_index.naver?code=KOSDAQ',       color: '#16a34a' },
  { label: 'KOSPI 200',     sub: '코스피 대형주 지수', url: 'https://finance.naver.com/sise/sise_index.naver?code=KPI200',       color: '#0d9488' },
  { label: 'KRX 300',       sub: 'KRX 대표 300 종목', url: 'https://finance.naver.com/sise/sise_index.naver?code=KRX300',       color: '#7c3aed' },
  { label: '코스피 거래량', sub: '거래량 상위 종목',   url: 'https://finance.naver.com/sise/sise_quant.naver',                   color: '#d97706' },
  { label: '코스닥 거래량', sub: '코스닥 거래량 상위', url: 'https://finance.naver.com/sise/sise_quant.naver?sosok=1',           color: '#ea580c' },
]

// ─── 수급 바로가기 ───────────────────────────────────────
const SUPPLY_LINKS = [
  { label: '외국인 순매수',   icon: '🌐', url: 'https://finance.naver.com/sise/foreign_list.naver',          desc: '코스피 외국인 순매수 상위' },
  { label: '기관 순매수',     icon: '🏛️', url: 'https://finance.naver.com/sise/inst_list.naver',             desc: '코스피 기관 순매수 상위' },
  { label: '외국인 코스닥',   icon: '🌏', url: 'https://finance.naver.com/sise/foreign_list.naver?sosok=1', desc: '코스닥 외국인 순매수' },
  { label: '프로그램 매매',   icon: '💻', url: 'https://finance.naver.com/sise/program_list.naver',          desc: '프로그램 매수·매도 현황' },
  { label: '공매도 현황',     icon: '📉', url: 'https://finance.naver.com/sise/short_sell_list.naver',       desc: '공매도 상위 종목' },
  { label: '투자자별 매매',   icon: '📊', url: 'https://finance.naver.com/sise/investorDealTrendView.naver', desc: '개인·외국인·기관 매매 동향' },
]

// ─── 오늘 주목 지표 바로가기 ────────────────────────────
const MARKET_STAT_LINKS = [
  { label: '상한가 종목',  url: 'https://finance.naver.com/sise/sise_upper.naver',       icon: '🔺' },
  { label: '하한가 종목',  url: 'https://finance.naver.com/sise/sise_lower.naver',       icon: '🔻' },
  { label: '급등 종목',    url: 'https://finance.naver.com/sise/sise_rise.naver',        icon: '🚀' },
  { label: '급락 종목',    url: 'https://finance.naver.com/sise/sise_fall.naver',        icon: '📉' },
  { label: '52주 신고가',  url: 'https://finance.naver.com/sise/sise_high52.naver',      icon: '🏆' },
  { label: '52주 신저가',  url: 'https://finance.naver.com/sise/sise_low52.naver',       icon: '⚠️' },
  { label: '거래대금 상위', url: 'https://finance.naver.com/sise/sise_quant.naver',      icon: '💰' },
  { label: 'ETF 현황',     url: 'https://finance.naver.com/sise/etf.naver',              icon: '📦' },
]

// ─── AI 업종 분석 ────────────────────────────────────────
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
      messages: [{
        role: 'user',
        content: `오늘(${today}) 한국 증시 "${sector}" 업종에 대한 투자자용 분석을 아래 형식으로 작성해줘.

## 📌 업종 현황 요약
(한 문장으로 오늘 이 업종의 분위기)

## 🔑 핵심 모멘텀
(지금 이 업종을 움직이는 핵심 요인 2~3가지, 간결하게)

## 📈 주목 종목
- 종목명: 이유 (한줄)
- 종목명: 이유 (한줄)

## ⚠️ 리스크
(이 업종의 주요 리스크 1~2가지)

## 💡 투자 포인트
(지금 이 업종에 대해 투자자가 취해야 할 포지션 방향, 2~3줄)

실시간 데이터 없어도 최신 트렌드 기반으로 구체적으로 작성해줘.`,
      }],
    }),
  })
  if (!res.ok) throw new Error(`API 오류 ${res.status}`)
  const data = await res.json()
  return data.content[0].text
}

// ─── 컴포넌트 ────────────────────────────────────────────
export default function MarketPage() {
  const [activeTab, setActiveTab]       = useState('overview')
  const [selectedSector, setSelectedSector] = useState(null)
  const [aiAnalysis, setAiAnalysis]     = useState({})   // { 업종명: text }
  const [aiLoading, setAiLoading]       = useState('')   // 로딩 중인 업종명
  const [aiError, setAiError]           = useState('')

  const TABS = [
    { id: 'overview', label: '시장 개요' },
    { id: 'sector',   label: '업종별 동향' },
    { id: 'supply',   label: '수급 분석' },
    { id: 'stats',    label: '오늘의 통계' },
  ]

  const handleSectorAI = async (sectorName) => {
    if (aiLoading) return
    setAiLoading(sectorName)
    setAiError('')
    try {
      const key = import.meta.env.VITE_CLAUDE_API_KEY
      if (!key) throw new Error('Claude API 키가 없어요.')
      // 이미 분석된 업종이면 재사용
      if (aiAnalysis[sectorName]) {
        setAiAnalysis(prev => ({ ...prev }))
        setAiLoading('')
        return
      }
      const text = await fetchSectorAnalysis(key, sectorName)
      setAiAnalysis(prev => ({ ...prev, [sectorName]: text }))
    } catch (e) {
      setAiError(e.message)
    } finally {
      setAiLoading('')
    }
  }

  const handleSectorClick = (sector) => {
    setSelectedSector(prev => prev?.name === sector.name ? null : sector)
    setAiError('')
  }

  return (
    <div className="market-page">

      {/* ── 페이지 헤더 ── */}
      <div className="page-header">
        <h1 className="page-title">시장 · 업종</h1>
        <p className="page-sub">지수 동향 · 업종별 분석 · 수급 현황</p>
      </div>

      {/* ── 탭 ── */}
      <div className="market-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`market-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ 시장 개요 탭 ══ */}
      {activeTab === 'overview' && (
        <div className="tab-content">

          {/* 주요 지수 */}
          <section className="market-section">
            <div className="section-label">주요 지수</div>
            <div className="index-grid">
              {INDEX_LINKS.map(idx => (
                <a key={idx.label} href={idx.url} target="_blank" rel="noreferrer"
                   className="index-card" style={{ '--idx-color': idx.color }}>
                  <div className="index-dot" style={{ background: idx.color }} />
                  <div>
                    <div className="index-name">{idx.label}</div>
                    <div className="index-sub">{idx.sub}</div>
                  </div>
                  <span className="index-arrow">→</span>
                </a>
              ))}
            </div>
          </section>

          {/* 시장 전체 흐름 바로가기 */}
          <section className="market-section">
            <div className="section-label">시장 전체 흐름</div>
            <div className="flow-grid">
              <a href="https://finance.naver.com/sise/sise_market_sum.naver?sosok=0"
                 target="_blank" rel="noreferrer" className="flow-card blue">
                <div className="flow-title">📊 코스피 전 종목</div>
                <div className="flow-desc">시가총액·등락률 전체 현황</div>
              </a>
              <a href="https://finance.naver.com/sise/sise_market_sum.naver?sosok=1"
                 target="_blank" rel="noreferrer" className="flow-card green">
                <div className="flow-title">📊 코스닥 전 종목</div>
                <div className="flow-desc">코스닥 전 종목 현황</div>
              </a>
              <a href="https://finance.naver.com/sise/sise_index_group.naver?type=0"
                 target="_blank" rel="noreferrer" className="flow-card purple">
                <div className="flow-title">🏭 업종별 지수</div>
                <div className="flow-desc">코스피 업종별 등락률 전체</div>
              </a>
              <a href="https://finance.naver.com/sise/sise_index_group.naver?type=1"
                 target="_blank" rel="noreferrer" className="flow-card orange">
                <div className="flow-title">🏭 코스닥 업종지수</div>
                <div className="flow-desc">코스닥 업종별 등락률 전체</div>
              </a>
              <a href="https://finance.naver.com/sise/etf.naver"
                 target="_blank" rel="noreferrer" className="flow-card teal">
                <div className="flow-title">📦 ETF 전체</div>
                <div className="flow-desc">테마·레버리지·인버스 ETF</div>
              </a>
              <a href="https://finance.naver.com/sise/sise_index.naver?code=KPI200"
                 target="_blank" rel="noreferrer" className="flow-card gray">
                <div className="flow-title">📈 KOSPI 200</div>
                <div className="flow-desc">대형주 200 지수 흐름</div>
              </a>
            </div>
          </section>

          {/* 오늘 주목 통계 미리보기 */}
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

      {/* ══ 업종별 동향 탭 ══ */}
      {activeTab === 'sector' && (
        <div className="tab-content">
          <section className="market-section">
            <div className="section-label">업종 선택 → AI 분석 받기</div>
            <div className="sector-grid">
              {SECTORS.map(s => (
                <button
                  key={s.name}
                  className={`sector-chip ${selectedSector?.name === s.name ? 'active' : ''}`}
                  style={{ '--s-color': s.color }}
                  onClick={() => handleSectorClick(s)}
                >
                  <span className="sector-dot" style={{ background: s.color }} />
                  {s.name}
                </button>
              ))}
            </div>
          </section>

          {/* 선택된 업종 상세 */}
          {selectedSector && (
            <section className="market-section sector-detail">
              <div className="sector-detail-header">
                <div>
                  <span className="sector-detail-name" style={{ color: selectedSector.color }}>
                    {selectedSector.name} 업종
                  </span>
                  <div className="sector-detail-links">
                    <a href={`https://finance.naver.com/sise/sise_index_group.naver?type=0`}
                       target="_blank" rel="noreferrer" className="sector-link-btn">
                      업종 지수 →
                    </a>
                    <a href={`https://finance.naver.com/sise/sise_group.naver?type=0`}
                       target="_blank" rel="noreferrer" className="sector-link-btn">
                      업종 종목 →
                    </a>
                  </div>
                </div>
                <button
                  className={`ai-sector-btn ${aiLoading === selectedSector.name ? 'loading' : ''}`}
                  style={{ '--s-color': selectedSector.color }}
                  onClick={() => handleSectorAI(selectedSector.name)}
                  disabled={!!aiLoading}
                >
                  {aiLoading === selectedSector.name
                    ? <><span className="btn-spinner-sm" /> 분석 중...</>
                    : aiAnalysis[selectedSector.name]
                      ? <><span>✦</span> 다시 분석</>
                      : <><span>✦</span> AI 분석</>}
                </button>
              </div>

              {aiError && <div className="sector-ai-error">{aiError}</div>}

              {!aiAnalysis[selectedSector.name] && !aiLoading && !aiError && (
                <div className="sector-ai-placeholder">
                  <p>AI 분석 버튼을 눌러 <strong>{selectedSector.name}</strong> 업종 분석을 받아보세요</p>
                  <p className="dim-text">핵심 모멘텀 · 주목 종목 · 리스크 · 투자 포인트를 정리해드려요</p>
                </div>
              )}

              {aiLoading === selectedSector.name && (
                <div className="sector-ai-loading">
                  <div className="loading-spinner-lg" style={{ borderTopColor: selectedSector.color }} />
                  <p>{selectedSector.name} 업종 분석 중...</p>
                </div>
              )}

              {aiAnalysis[selectedSector.name] && (
                <div className="sector-ai-result">
                  <pre className="sector-ai-text">{aiAnalysis[selectedSector.name]}</pre>
                </div>
              )}
            </section>
          )}

          {!selectedSector && (
            <div className="sector-guide">
              <p>위에서 업종을 선택하면 AI 분석과 관련 링크를 바로 확인할 수 있어요</p>
            </div>
          )}
        </div>
      )}

      {/* ══ 수급 분석 탭 ══ */}
      {activeTab === 'supply' && (
        <div className="tab-content">
          <section className="market-section">
            <div className="section-label">투자자별 수급 현황</div>
            <div className="supply-grid">
              {SUPPLY_LINKS.map(l => (
                <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="supply-card">
                  <div className="supply-icon">{l.icon}</div>
                  <div>
                    <div className="supply-label">{l.label}</div>
                    <div className="supply-desc">{l.desc}</div>
                  </div>
                  <span className="supply-arrow">→</span>
                </a>
              ))}
            </div>
          </section>

          <section className="market-section">
            <div className="section-label">수급 분석 참고 지표</div>
            <div className="supply-ref-grid">
              <a href="https://finance.naver.com/sise/sise_index.naver?code=KOSPI"
                 target="_blank" rel="noreferrer" className="supply-ref-card">
                <div className="supply-ref-title">📈 시장 전체 수급 흐름</div>
                <div className="supply-ref-desc">코스피 투자자별 매매 동향 확인</div>
              </a>
              <a href="https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC020202"
                 target="_blank" rel="noreferrer" className="supply-ref-card">
                <div className="supply-ref-title">🏛️ KRX 공식 수급 데이터</div>
                <div className="supply-ref-desc">거래소 공식 투자자별 매매 통계</div>
              </a>
              <a href="https://finance.naver.com/sise/program_list.naver"
                 target="_blank" rel="noreferrer" className="supply-ref-card">
                <div className="supply-ref-title">💻 프로그램 매매 현황</div>
                <div className="supply-ref-desc">차익·비차익 프로그램 매수·매도</div>
              </a>
            </div>
          </section>

          <div className="supply-notice">
            <span>💡</span>
            <span>키움 REST API 연동 후 외국인·기관 실시간 수급 데이터가 앱 내에 직접 표시됩니다</span>
          </div>
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
                { label: '테마주 전체',      url: 'https://finance.naver.com/sise/theme.naver',             icon: '🎯' },
                { label: 'AI·반도체 테마',   url: 'https://finance.naver.com/sise/theme.naver',             icon: '💻' },
                { label: '방산 테마',         url: 'https://finance.naver.com/sise/theme.naver',             icon: '🛡️' },
                { label: '원전·에너지 테마',  url: 'https://finance.naver.com/sise/theme.naver',             icon: '⚡' },
                { label: '배당주',            url: 'https://finance.naver.com/sise/sise_dividend_total.naver', icon: '💵' },
                { label: 'PBR 낮은 종목',    url: 'https://finance.naver.com/sise/sise_market_sum.naver',   icon: '📊' },
              ].map(s => (
                <a key={s.label} href={s.url} target="_blank" rel="noreferrer" className="theme-stat-card">
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                  <span className="stat-arrow">→</span>
                </a>
              ))}
            </div>
          </section>
        </div>
      )}

    </div>
  )
}
