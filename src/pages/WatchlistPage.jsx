import { useState, useEffect, useCallback } from 'react'
import './WatchlistPage.css'

const THEME_COLORS = {
  '반도체·AI': '#2563eb', '방산': '#dc2626', '조선': '#0d9488',
  '원전·전력': '#d97706', '2차전지': '#16a34a', '바이오': '#7c3aed', '밸류업·금융': '#ea580c', '기타': '#64748b',
}

const PRESET_STOCKS = [
  { name: '삼성전자',   code: '005930', theme: '반도체·AI' },
  { name: 'SK하이닉스', code: '000660', theme: '반도체·AI' },
  { name: '한화에어로스페이스', code: '012450', theme: '방산' },
  { name: 'HD현대중공업', code: '329180', theme: '조선' },
  { name: '두산에너빌리티', code: '034020', theme: '원전·전력' },
  { name: 'LG에너지솔루션', code: '373220', theme: '2차전지' },
  { name: '셀트리온', code: '068270', theme: '바이오' },
  { name: 'KB금융', code: '105560', theme: '밸류업·금융' },
]

const STORAGE_KEY = 'kstock_watchlist'

function loadWatchlist() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveWatchlist(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch {}
}

function fmt(n) {
  if (!n && n !== 0) return '-'
  return Number(n).toLocaleString('ko-KR')
}

export default function WatchlistPage() {
  const [list, setList]          = useState(() => loadWatchlist())
  const [prices, setPrices]      = useState({})   // { code: { current, change, changeRate, volume } }
  const [loading, setLoading]    = useState(false)
  const [addMode, setAddMode]    = useState(false)
  const [form, setForm]          = useState({ name: '', code: '', theme: '기타', memo: '' })
  const [filterTheme, setFilter] = useState('전체')
  const [sortBy, setSort]        = useState('추가순')

  useEffect(() => saveWatchlist(list), [list])

  // 주가 일괄 조회
  const fetchPrices = useCallback(async () => {
    if (list.length === 0) return
    setLoading(true)
    const results = {}
    await Promise.allSettled(
      list.map(async (s) => {
        try {
          const res = await fetch(`/api/kiwoom?type=price&code=${s.code}`)
          const data = await res.json()
          if (data.current) results[s.code] = data
        } catch {}
      })
    )
    setPrices(results)
    setLoading(false)
  }, [list])

  // 최초 + 30초마다 갱신
  useEffect(() => {
    fetchPrices()
    const id = setInterval(fetchPrices, 30000)
    return () => clearInterval(id)
  }, [fetchPrices])

  const themes = ['전체', ...Object.keys(THEME_COLORS)]

  const addStock = () => {
    if (!form.name.trim() || !form.code.trim()) return
    const item = { ...form, code: form.code.trim(), id: Date.now(), addedAt: new Date().toLocaleDateString('ko-KR') }
    setList(prev => [item, ...prev])
    setForm({ name: '', code: '', theme: '기타', memo: '' })
    setAddMode(false)
  }

  const addPreset = (s) => {
    if (list.find(i => i.code === s.code)) return
    setList(prev => [{ ...s, memo: '', id: Date.now(), addedAt: new Date().toLocaleDateString('ko-KR') }, ...prev])
  }

  const removeStock = (id) => setList(prev => prev.filter(i => i.id !== id))

  const filtered = list
    .filter(i => filterTheme === '전체' || i.theme === filterTheme)
    .sort((a, b) => sortBy === '이름순' ? a.name.localeCompare(b.name) : b.id - a.id)

  const openNaver = (code) => window.open(`https://finance.naver.com/item/main.naver?code=${code}`, '_blank')
  const openChart = (code) => window.open(`https://finance.naver.com/item/fchart.naver?code=${code}`, '_blank')

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">관심종목</h1>
          <p className="page-sub">찜한 종목 모음 · 테마별 분류 · 빠른 차트 이동</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-ai" onClick={fetchPrices} disabled={loading}>
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
              <input className="add-input" placeholder="종목명" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              <input className="add-input mono" placeholder="종목코드 (예: 005930)" value={form.code}
                onChange={e => setForm(p => ({ ...p, code: e.target.value }))} />
              <select className="add-select" value={form.theme}
                onChange={e => setForm(p => ({ ...p, theme: e.target.value }))}>
                {Object.keys(THEME_COLORS).map(t => <option key={t}>{t}</option>)}
              </select>
              <input className="add-input add-input--memo" placeholder="메모 (선택)" value={form.memo}
                onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} />
              <button className="btn-ai" onClick={addStock}>추가</button>
            </div>
            <div className="preset-section">
              <div className="preset-label">빠른 추가 — 주요 종목</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
                {PRESET_STOCKS.map(s => (
                  <button key={s.code} className="preset-chip"
                    style={{ '--tc': THEME_COLORS[s.theme] }}
                    onClick={() => addPreset(s)}
                    disabled={!!list.find(i => i.code === s.code)}>
                    <span className="preset-dot" style={{ background: THEME_COLORS[s.theme] }} />
                    <span className="preset-name">{s.name}</span>
                    {list.find(i => i.code === s.code) && <span className="preset-added">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 필터 + 정렬 */}
        <div className="watch-controls">
          <div className="theme-filter-chips">
            {themes.map(t => (
              <button key={t} className={`filter-chip ${filterTheme === t ? 'active' : ''}`}
                style={filterTheme === t && t !== '전체' ? { background: THEME_COLORS[t] + '18', color: THEME_COLORS[t], borderColor: THEME_COLORS[t] } : {}}
                onClick={() => setFilter(t)}>{t}</button>
            ))}
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
          <div className="card-grid">
            {filtered.map(s => {
              const p = prices[s.code]
              const isUp = p?.change > 0
              const isDown = p?.change < 0
              const priceColor = isUp ? '#ef4444' : isDown ? '#3b82f6' : 'var(--text-2)'
              const sign = isUp ? '+' : ''

              return (
                <div key={s.id} className="watch-card" style={{ '--sc': THEME_COLORS[s.theme] || '#64748b' }}>
                  <div className="watch-card-top">
                    <div>
                      <span className="watch-theme-dot" style={{ background: THEME_COLORS[s.theme] || '#64748b' }} />
                      <span className="watch-theme-label" style={{ color: THEME_COLORS[s.theme] || '#64748b' }}>{s.theme}</span>
                    </div>
                    <button className="watch-remove" onClick={() => removeStock(s.id)}>✕</button>
                  </div>

                  <div className="watch-name">{s.name}</div>
                  <div className="watch-code">{s.code}</div>

                  {/* 주가 영역 */}
                  <div style={{ margin: '10px 0 6px', minHeight: '48px' }}>
                    {p ? (
                      <>
                        <div style={{ fontSize: '22px', fontWeight: 700, color: priceColor, letterSpacing: '-0.5px' }}>
                          {fmt(p.current)}원
                        </div>
                        <div style={{ fontSize: '13px', color: priceColor, marginTop: '2px' }}>
                          {sign}{fmt(p.change)}원 ({sign}{Number(p.changeRate).toFixed(2)}%)
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>
                          거래량 {fmt(p.volume)}주
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--text-3)', paddingTop: '8px' }}>
                        {loading ? '조회중...' : '장외 시간 또는 데이터 없음'}
                      </div>
                    )}
                  </div>

                  {s.memo && <div className="watch-memo">{s.memo}</div>}
                  <div className="watch-added">추가일 {s.addedAt}</div>
                  <div className="watch-actions">
                    <button className="watch-action-btn" onClick={() => openNaver(s.code)}>📊 정보</button>
                    <button className="watch-action-btn" onClick={() => openChart(s.code)}>📈 차트</button>
                    <a className="watch-action-btn"
                      href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(s.name)}`}
                      target="_blank" rel="noreferrer">📋 공시</a>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
