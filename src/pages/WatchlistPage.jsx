// src/pages/WatchlistPage.jsx
import { useState, useEffect } from 'react'
import StockChartModal from '../components/StockChartModal'
import { useStockPrices } from '../hooks/useKiwoomPrice'
import { fmt, fmtRate, fmtChange, rateColor, fmtShort, getKstStatus } from '../utils/format'
import { ALL_THEMES, THEME_COLOR_MAP } from '../constants/themes'
import './WatchlistPage.css'

// 테마 색상 (관심종목 자체 테마 라벨용)
const THEME_COLORS = Object.fromEntries(
  ALL_THEMES.map(t => [t.label, t.color])
)
THEME_COLORS['기타'] = '#64748b'

// 프리셋: 테마에서 자동 생성
const PRESET_STOCKS = ALL_THEMES.slice(0, 7).flatMap(t =>
  t.stocks.slice(0, 1).map(s => ({ ...s, theme: t.label }))
)

const STORAGE_KEY = 'kstock_watchlist'
function loadWatchlist() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] } }
function saveWatchlist(list) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch {} }

export default function WatchlistPage() {
  const [list, setList]             = useState(() => loadWatchlist())
  const [addMode, setAddMode]       = useState(false)
  const [form, setForm]             = useState({ name: '', code: '', theme: '기타', memo: '' })
  const [filterTheme, setFilter]    = useState('전체')
  const [sortBy, setSort]           = useState('추가순')
  const [chartStock, setChartStock] = useState(null)

  // ✅ 공통 훅 사용 — 올바른 필드명 자동 처리
  const codes = list.map(s => s.code)
  const interval = getKstStatus() === 'open' ? 30_000 : 300_000
  const { prices, loading, refetch } = useStockPrices(codes, interval)

  useEffect(() => saveWatchlist(list), [list])

  const themes = ['전체', ...Object.keys(THEME_COLORS)]

  const addStock = () => {
    if (!form.name.trim() || !form.code.trim()) return
    const code = form.code.trim().padStart(6, '0')
    if (list.find(i => i.code === code)) return
    setList(prev => [{
      ...form, code,
      id: Date.now(),
      addedAt: new Date().toLocaleDateString('ko-KR'),
    }, ...prev])
    setForm({ name: '', code: '', theme: '기타', memo: '' })
    setAddMode(false)
  }

  const addPreset = (s) => {
    if (list.find(i => i.code === s.code)) return
    setList(prev => [{
      ...s, memo: '',
      id: Date.now(),
      addedAt: new Date().toLocaleDateString('ko-KR'),
    }, ...prev])
  }

  const removeStock = (id) => setList(prev => prev.filter(i => i.id !== id))

  const filtered = list
    .filter(i => filterTheme === '전체' || i.theme === filterTheme)
    .sort((a, b) => sortBy === '이름순' ? a.name.localeCompare(b.name) : b.id - a.id)

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">관심종목</h1>
          <p className="page-sub">찜한 종목 모음 · 테마별 분류 · 30초 자동갱신</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-ai" onClick={refetch} disabled={loading}>
            {loading ? '⟳ 조회중' : '⟳ 새로고침'}
          </button>
          <button className="btn-ai" onClick={() => setAddMode(v => !v)}>
            {addMode ? '✕ 닫기' : '+ 종목 추가'}
          </button>
        </div>
      </div>

      <div className="page-body">

        {/* 종목 추가 폼 */}
        {addMode && (
          <div className="card-section">
            <span className="section-title">종목 직접 추가</span>
            <div className="add-form">
              <input className="add-input" placeholder="종목명"
                value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}/>
              <input className="add-input mono" placeholder="종목코드 (예: 005930)"
                value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))}/>
              <select className="add-select" value={form.theme}
                onChange={e => setForm(p => ({ ...p, theme: e.target.value }))}>
                {Object.keys(THEME_COLORS).map(t => <option key={t}>{t}</option>)}
              </select>
              <input className="add-input add-input--memo" placeholder="메모 (선택)"
                value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))}/>
              <button className="btn-ai" onClick={addStock}>추가</button>
            </div>
            <div className="preset-section">
              <div className="preset-label">빠른 추가 — 테마 대표 종목</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
                {PRESET_STOCKS.map(s => (
                  <button key={s.code} className="preset-chip"
                    style={{ '--tc': THEME_COLOR_MAP[ALL_THEMES.find(t => t.label === s.theme)?.id] || '#64748b' }}
                    onClick={() => addPreset(s)}
                    disabled={!!list.find(i => i.code === s.code)}>
                    <span className="preset-dot" style={{ background: THEME_COLORS[s.theme] || '#64748b' }}/>
                    <span className="preset-name">{s.name}</span>
                    {list.find(i => i.code === s.code) && <span className="preset-added">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 필터 & 정렬 */}
        <div className="watch-controls">
          <div className="theme-filter-chips">
            {themes.map(t => {
              const tc = THEME_COLORS[t]
              const isActive = filterTheme === t
              return (
                <button key={t}
                  className={`filter-chip ${isActive ? 'active' : ''}`}
                  style={isActive && t !== '전체' ? { background: tc + '18', color: tc, borderColor: tc } : {}}
                  onClick={() => setFilter(t)}>{t}</button>
              )
            })}
          </div>
          <select className="sort-select" value={sortBy} onChange={e => setSort(e.target.value)}>
            <option>추가순</option>
            <option>이름순</option>
          </select>
        </div>

        {/* 종목 리스트 */}
        {filtered.length === 0 ? (
          <div className="card-section watch-empty">
            <div className="empty-icon">⭐</div>
            <p>{list.length === 0 ? '아직 추가한 종목이 없어요' : '해당 테마의 종목이 없어요'}</p>
            <p className="sub-text">위의 "+ 종목 추가" 버튼으로 관심종목을 등록해보세요</p>
          </div>
        ) : (
          <div className="watch-table-wrap">
            <div className="watch-table">
              <div className="wt-header">
                <div className="wt-col-name">종목명</div>
                <div className="wt-col-price">현재가</div>
                <div className="wt-col-change">등락</div>
                <div className="wt-col-rate">등락률</div>
                <div className="wt-col-volume">거래량</div>
                <div className="wt-col-theme">테마</div>
                <div className="wt-col-actions">공시</div>
                <div className="wt-col-del"></div>
              </div>

              {filtered.map(s => {
                // ✅ normalizePrice() 통해 정규화된 데이터 사용
                const p   = prices[s.code]
                const pc  = p ? rateColor(p.changeRate) : 'var(--text-1)'
                const tc  = THEME_COLORS[s.theme] || '#64748b'
                const sign = p?.change > 0 ? '+' : ''

                return (
                  <div key={s.id} className="wt-row wt-row-clickable"
                    onClick={() => setChartStock({ name: s.name, code: s.code })}>

                    <div className="wt-col-name">
                      <span className="wt-dot" style={{ background: tc }}/>
                      <div>
                        <div className="wt-name">{s.name}</div>
                        <div className="wt-code">{s.code}</div>
                      </div>
                    </div>

                    {/* ✅ p.price (cur_prc 정규화됨) */}
                    <div className="wt-col-price" style={{ color: pc, fontWeight: 700 }}>
                      {p ? `${fmt(p.price)}원` : <span className="wt-dash">{loading ? '...' : '—'}</span>}
                    </div>

                    {/* ✅ p.change (pred_pre 정규화됨) */}
                    <div className="wt-col-change" style={{ color: pc }}>
                      {p ? `${sign}${fmt(p.change)}` : '—'}
                    </div>

                    {/* ✅ p.changeRate (flu_rt 정규화됨) */}
                    <div className="wt-col-rate" style={{ color: pc, fontWeight: 600 }}>
                      {p ? fmtRate(p.changeRate) : '—'}
                    </div>

                    {/* ✅ p.volume (trde_qty 정규화됨) */}
                    <div className="wt-col-volume">
                      {p ? fmtShort(p.volume) : '—'}
                    </div>

                    <div className="wt-col-theme">
                      <span className="wt-badge" style={{ background: tc + '18', color: tc }}>
                        {s.theme}
                      </span>
                    </div>

                    <div className="wt-col-actions" onClick={e => e.stopPropagation()}>
                      <a className="wt-btn"
                        href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(s.name)}`}
                        target="_blank" rel="noreferrer">공시</a>
                    </div>

                    <div className="wt-col-del" onClick={e => e.stopPropagation()}>
                      <button className="wt-remove" onClick={() => removeStock(s.id)}>✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {chartStock && (
        <StockChartModal stock={chartStock} onClose={() => setChartStock(null)}/>
      )}
    </div>
  )
}
