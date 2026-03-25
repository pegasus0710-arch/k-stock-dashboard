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
function loadWatchlist() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] } }
function saveWatchlist(list) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch {} }
function fmt(n) { if (!n && n !== 0) return '-'; return Number(n).toLocaleString('ko-KR') }

export default function WatchlistPage() {
  const [list, setList]          = useState(() => loadWatchlist())
  const [prices, setPrices]      = useState({})
  const [loading, setLoading]    = useState(false)
  const [addMode, setAddMode]    = useState(false)
  const [form, setForm]          = useState({ name: '', code: '', theme: '기타', memo: '' })
  const [filterTheme, setFilter] = useState('전체')
  const [sortBy, setSort]        = useState('추가순')

  useEffect(() => saveWatchlist(list), [list])

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

  useEffect(() => {
    fetchPrices()
    const id = setInterval(fetchPrices, 30000)
    return () => clearInterval(id)
  }, [fetchPrices])

  const themes = ['전체', ...Object.keys(THEME_COLORS)]

  const addStock = () => {
    if (!form.name.trim() || !form.code.trim()) return
    setList(prev => [{ ...form, code: form.code.trim(), id: Date.now(), addedAt: new Date().toLocaleDateString('ko-KR') }, ...prev])
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

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">관심종목</h1>
          <p className="page-sub">찜한 종목 모음 · 테마별 분류 · 빠른 차트 이동</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-ai" onClick={fetchPrices} disabled={loading}>{loading ? '⟳ 조회중' : '⟳ 새로고침'}</button>
          <button className="btn-ai" onClick={() => setAddMode(v => !v)}>{addMode ? '✕ 닫기' : '+ 종목 추가'}</button>
        </div>
      </div>

      <div className="page-body">

        {addMode && (
          <div className="card-section">
            <span className="section-title">종목 직접 추가</span>
            <div className="add-form">
              <input className="add-input" placeholder="종목명" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              <input className="add-input mono" placeholder="종목코드 (예: 005930)" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} />
              <select className="add-select" value={form.theme} onChange={e => setForm(p => ({ ...p, theme: e.target.value }))}>
                {Object.keys(THEME_COLORS).map(t => <option key={t}>{t}</option>)}
              </select>
              <input className="add-input add-input--memo" placeholder="메모 (선택)" value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} />
              <button className="btn-ai" onClick={addStock}>추가</button>
            </div>
            <div className="preset-section">
              <div className="preset-label">빠른 추가 — 주요 종목</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
                {PRESET_STOCKS.map(s => (
                  <button key={s.code} className="preset-chip" style={{ '--tc': THEME_COLORS[s.theme] }}
                    onClick={() => addPreset(s)} disabled={!!list.find(i => i.code === s.code)}>
                    <span className="preset-dot" style={{ background: THEME_COLORS[s.theme] }} />
                    <span className="preset-name">{s.name}</span>
                    {list.find(i => i.code === s.code) && <span className="preset-added">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

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
                <div className="wt-col-actions">바로가기</div>
                <div className="wt-col-del"></div>
              </div>

              {filtered.map(s => {
                const p = prices[s.code]
                const isUp = p?.change > 0
                const isDown = p?.change < 0
                const pc = isUp ? '#ef4444' : isDown ? '#3b82f6' : 'var(--text-1)'
                const sign = isUp ? '+' : ''
                const tc = THEME_COLORS[s.theme] || '#64748b'

                return (
                  <div key={s.id} className="wt-row">
                    <div className="wt-col-name">
                      <span className="wt-dot" style={{ background: tc }} />
                      <div>
                        <div className="wt-name">{s.name}</div>
                        <div className="wt-code">{s.code}</div>
                      </div>
                    </div>
                    <div className="wt-col-price" style={{ color: pc, fontWeight: 700 }}>
                      {p ? `${fmt(p.current)}원` : <span className="wt-dash">{loading ? '...' : '-'}</span>}
                    </div>
                    <div className="wt-col-change" style={{ color: pc }}>
                      {p ? `${sign}${fmt(p.change)}` : '-'}
                    </div>
                    <div className="wt-col-rate" style={{ color: pc, fontWeight: 600 }}>
                      {p ? `${sign}${Number(p.changeRate).toFixed(2)}%` : '-'}
                    </div>
                    <div className="wt-col-volume">{p ? fmt(p.volume) : '-'}</div>
                    <div className="wt-col-theme">
                      <span className="wt-badge" style={{ background: tc + '18', color: tc }}>{s.theme}</span>
                    </div>
                    <div className="wt-col-actions">
                      <button className="wt-btn" onClick={() => window.open(`https://finance.naver.com/item/main.naver?code=${s.code}`, '_blank')}>정보</button>
                      <button className="wt-btn" onClick={() => window.open(`https://finance.naver.com/item/fchart.naver?code=${s.code}`, '_blank')}>차트</button>
                      <a className="wt-btn" href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(s.name)}`} target="_blank" rel="noreferrer">공시</a>
                    </div>
                    <div className="wt-col-del">
                      <button className="wt-remove" onClick={() => removeStock(s.id)}>✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
