import './Dashboard.css'

/* 7대 테마 정의 */
const THEMES = [
  { id: 'semi',    label: '반도체·AI',  color: 'var(--theme-semi)',    stocks: ['삼성전자', 'SK하이닉스', 'DB하이텍'] },
  { id: 'defense', label: '방산',        color: 'var(--theme-defense)', stocks: ['한화에어로스페이스', '현대로템', 'LIG넥스원'] },
  { id: 'ship',    label: '조선',        color: 'var(--theme-ship)',    stocks: ['HD현대중공업', '삼성중공업', '한화오션'] },
  { id: 'nuclear', label: '원전·전력',   color: 'var(--theme-nuclear)', stocks: ['두산에너빌리티', '효성중공업', '일진전기'] },
  { id: 'battery', label: '2차전지',     color: 'var(--theme-battery)', stocks: ['LG에너지솔루션', '삼성SDI', '에코프로비엠'] },
  { id: 'bio',     label: '바이오',      color: 'var(--theme-bio)',     stocks: ['셀트리온', '삼성바이오로직스', 'HLB'] },
  { id: 'value',   label: '밸류업·금융', color: 'var(--theme-value)',   stocks: ['KB금융', '신한지주', '하나금융지주'] },
]

/* 매크로 지표 (추후 API 연동) */
const MACRO = [
  { label: 'USD/KRW', value: '—', sub: '로딩 중' },
  { label: 'KOSPI',   value: '—', sub: '로딩 중' },
  { label: 'KOSDAQ',  value: '—', sub: '로딩 중' },
  { label: '기준금리', value: '3.00%', sub: '한국은행' },
]

export default function Dashboard() {
  return (
    <div className="dashboard">

      {/* ── 매크로 바 ── */}
      <section className="macro-row">
        {MACRO.map(m => (
          <div key={m.label} className="macro-card">
            <span className="macro-label">{m.label}</span>
            <span className="macro-value mono">{m.value}</span>
            <span className="macro-sub dim">{m.sub}</span>
          </div>
        ))}
      </section>

      {/* ── 2열 그리드 ── */}
      <div className="dash-grid">

        {/* 테마 현황 */}
        <section className="panel theme-panel">
          <div className="panel-header">
            <span className="panel-title">테마별 현황</span>
            <span className="panel-badge">7대 테마</span>
          </div>
          <div className="theme-list">
            {THEMES.map(t => (
              <div key={t.id} className="theme-row">
                <div className="theme-dot" style={{ background: t.color }} />
                <span className="theme-name">{t.label}</span>
                <div className="theme-stocks">
                  {t.stocks.map(s => (
                    <span key={s} className="stock-chip">{s}</span>
                  ))}
                </div>
                <span className="theme-pct dim mono">—</span>
              </div>
            ))}
          </div>
          <p className="panel-note dim">※ 등락률은 KIS API 연동 후 표시됩니다</p>
        </section>

        {/* 뉴스 요약 */}
        <section className="panel news-panel">
          <div className="panel-header">
            <span className="panel-title">오늘의 핵심 뉴스</span>
            <span className="panel-badge">AI 요약</span>
          </div>
          <div className="news-placeholder">
            <div className="placeholder-icon">≡</div>
            <p>뉴스 탭에서 테마를 선택하면<br/>AI 요약 뉴스를 볼 수 있어요</p>
            <p className="dim" style={{ fontSize: 12, marginTop: 6 }}>Claude API 연동 후 자동 요약 제공</p>
          </div>
        </section>

        {/* 오늘의 체크포인트 */}
        <section className="panel checklist-panel">
          <div className="panel-header">
            <span className="panel-title">오늘의 체크포인트</span>
          </div>
          <ul className="checklist">
            <li><span className="check-dot" style={{ background: 'var(--accent-blue)' }} />미국 FOMC 일정 확인</li>
            <li><span className="check-dot" style={{ background: 'var(--accent-amber)' }} />원/달러 환율 방향</li>
            <li><span className="check-dot" style={{ background: 'var(--accent-teal)' }} />삼성전자·SK하이닉스 수급</li>
            <li><span className="check-dot" style={{ background: 'var(--accent-purple)' }} />방산 수출 뉴스</li>
            <li><span className="check-dot" style={{ background: 'var(--accent-green)' }} />조선 수주 공시</li>
          </ul>
        </section>

        {/* 주목 일정 */}
        <section className="panel schedule-panel">
          <div className="panel-header">
            <span className="panel-title">주목 일정</span>
          </div>
          <ul className="schedule-list">
            <li className="schedule-item">
              <span className="schedule-date mono dim">—</span>
              <span className="schedule-content">일정 데이터 로딩 예정</span>
            </li>
            <li className="schedule-item">
              <span className="schedule-date mono dim">—</span>
              <span className="schedule-content">DART 공시 연동 후 표시</span>
            </li>
          </ul>
        </section>

      </div>
    </div>
  )
}
