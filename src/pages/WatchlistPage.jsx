// src/pages/WatchlistPage.jsx
// 관심종목 — 사용자 정의 카테고리 + 실시간 주가 + Firestore 동기화
import { useState, useEffect, useCallback, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import GlobalChartModal from '../components/GlobalChartModal'
import { ALL_THEMES } from '../constants/themes'
import { fmt, fmtRate, rateColor, getKstStatus } from '../utils/format'
import './WatchlistPage.css'

// ── 전체 종목 검색 풀 (테마 종목 + 직접 입력) ──────────
const STOCK_POOL = [...new Map(
  ALL_THEMES.flatMap(t => [
    ...t.etf.map(e => ({ name: e.name, code: e.code, theme: t.label })),
    ...t.stocks.map(s => ({ name: s.name, code: s.code, theme: t.label })),
  ]).map(s => [s.code, s])
).values()]

const MAX_STOCKS   = 50
const MAX_CATS     = 10
const LS_KEY       = 'wl_v3'
const DEFAULT_CATS = [{ id: 'cat1', name: '관심종목1', stocks: [] }]

function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
function fmtShort(n) { if (!n) return '-'; if (n >= 100000000) return (n / 100000000).toFixed(1) + '억'; if (n >= 10000) return (n / 10000).toFixed(0) + '만'; return String(n) }

// ── 개별 종목 행 ────────────────────────────────────────
function StockRow({ stock, price, holding, onChart, onRemove, onMemo, catId }) {
  const [menuOpen, setMenuOpen] = useState(null) // 'news'|'disclosure'|'order'
  const menuRef = useRef(null)

  useEffect(() => {
    const fn = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(null) }
    if (menuOpen) document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [menuOpen])

  const pc = price ? rateColor(price.changeRate) : '#94a3b8'
  const sign = (price?.changeRate ?? 0) > 0 ? '+' : ''
  const isUp = (price?.changeRate ?? 0) > 0

  return (
    <div className="wl-row">
      {/* 종목명 */}
      <div className="wl-cell wl-cell-name">
        <span className="wl-dot" style={{ background: isUp ? '#ef4444' : price ? '#3b82f6' : '#475569' }}/>
        <button className="wl-name-btn" onClick={() => onChart(stock)}>{stock.name}</button>
        <span className="wl-code">{stock.code}</span>
      </div>

      {/* 현재가 */}
      <div className="wl-cell wl-cell-price" style={{ color: pc }}>
        {price?.price ? fmt(price.price) + '원' : <span className="wl-loading">…</span>}
      </div>

      {/* 등락 */}
      <div className="wl-cell wl-cell-change" style={{ color: pc }}>
        {price?.change != null ? `${sign}${fmt(price.change)}` : '-'}
      </div>

      {/* 등락률 */}
      <div className="wl-cell wl-cell-rate" style={{ color: pc }}>
        {price?.changeRate != null ? `${sign}${fmtRate(price.changeRate)}` : '-'}
      </div>

      {/* 거래량 */}
      <div className="wl-cell wl-cell-vol">
        {price?.volume ? fmtShort(price.volume) + '주' : '-'}
      </div>

      {/* 테마 */}
      <div className="wl-cell wl-cell-theme">
        <span className="wl-theme-badge">{stock.theme || '기타'}</span>
      </div>

      {/* 보유 정보 */}
      {holding ? (
        <div className="wl-cell wl-cell-hold">
          <span className="wl-hold-qty">{holding.qty}주</span>
          <span className="wl-hold-pnl" style={{ color: holding.pnl >= 0 ? '#ef4444' : '#3b82f6' }}>
            {holding.pnl >= 0 ? '+' : ''}{fmt(holding.pnl)}원 ({holding.pnl >= 0 ? '+' : ''}{holding.rate?.toFixed(2)}%)
          </span>
        </div>
      ) : (
        <div className="wl-cell wl-cell-hold wl-cell-hold-empty">-</div>
      )}

      {/* 액션 버튼들 */}
      <div className="wl-cell wl-cell-actions" ref={menuRef}>
        {/* 차트 */}
        <button className="wl-act-btn wl-act-chart" title="차트" onClick={() => onChart(stock)}>📈</button>

        {/* 공시 팝업 */}
        <div className="wl-act-wrap">
          <button className="wl-act-btn wl-act-disclosure" title="공시"
            onClick={() => setMenuOpen(menuOpen === 'disclosure' ? null : 'disclosure')}>📋</button>
          {menuOpen === 'disclosure' && (
            <div className="wl-popup-menu">
              <div className="wl-popup-title">📋 공시 바로가기</div>
              <a href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(stock.name)}`}
                target="_blank" rel="noreferrer" className="wl-popup-item" onClick={() => setMenuOpen(null)}>
                DART 전자공시 →
              </a>
              <a href={`https://kind.krx.co.kr/disclosuresearch/disclosuresearch.do?searchmode=searchCorp&searchText=${stock.code}`}
                target="_blank" rel="noreferrer" className="wl-popup-item" onClick={() => setMenuOpen(null)}>
                KRX 공시 →
              </a>
            </div>
          )}
        </div>

        {/* 뉴스 팝업 */}
        <div className="wl-act-wrap">
          <button className="wl-act-btn wl-act-news" title="뉴스"
            onClick={() => setMenuOpen(menuOpen === 'news' ? null : 'news')}>📰</button>
          {menuOpen === 'news' && (
            <div className="wl-popup-menu">
              <div className="wl-popup-title">📰 뉴스 바로가기</div>
              <a href={`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(stock.name)}&sort=1`}
                target="_blank" rel="noreferrer" className="wl-popup-item" onClick={() => setMenuOpen(null)}>
                네이버 뉴스 →
              </a>
              <a href={`https://finance.naver.com/item/main.naver?code=${stock.code}`}
                target="_blank" rel="noreferrer" className="wl-popup-item" onClick={() => setMenuOpen(null)}>
                네이버 증권 →
              </a>
              <a href={`https://finance.yahoo.com/quote/${stock.code}.KS`}
                target="_blank" rel="noreferrer" className="wl-popup-item" onClick={() => setMenuOpen(null)}>
                Yahoo Finance →
              </a>
            </div>
          )}
        </div>

        {/* 주문 팝업 */}
        <div className="wl-act-wrap">
          <button className="wl-act-btn wl-act-order" title="주문"
            onClick={() => setMenuOpen(menuOpen === 'order' ? null : 'order')}>💹</button>
          {menuOpen === 'order' && (
            <div className="wl-popup-menu wl-popup-order">
              <div className="wl-popup-title">💹 주문 — {stock.name}</div>
              <div className="wl-order-note">※ 키움 HTS/MTS에서 직접 주문</div>
              <a href="https://www.kiwoom.com/" target="_blank" rel="noreferrer" className="wl-popup-item wl-order-buy" onClick={() => setMenuOpen(null)}>
                매수 →
              </a>
              <a href="https://www.kiwoom.com/" target="_blank" rel="noreferrer" className="wl-popup-item wl-order-sell" onClick={() => setMenuOpen(null)}>
                매도 →
              </a>
              <a href="https://www.kiwoom.com/" target="_blank" rel="noreferrer" className="wl-popup-item" onClick={() => setMenuOpen(null)}>
                정정/취소 →
              </a>
            </div>
          )}
        </div>

        {/* 메모 */}
        <button className="wl-act-btn wl-act-memo" title="메모" onClick={() => onMemo(stock)}>📝</button>

        {/* 알림 (준비중) */}
        <button className="wl-act-btn wl-act-alarm" title="알림 설정 (준비중)" onClick={() => alert('알림 기능은 준비 중입니다.')}>🔔</button>

        {/* 삭제 */}
        <button className="wl-act-btn wl-act-del" title="삭제" onClick={() => onRemove(stock.code)}>✕</button>
      </div>
    </div>
  )
}

// ── 종목 검색 컴포넌트 ──────────────────────────────────
function StockSearch({ onAdd, existing }) {
  const [query, setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [custom, setCustom]   = useState({ code: '', name: '', theme: '기타' })
  const [tab, setTab]         = useState('search') // 'search' | 'manual'
  const dropRef = useRef(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const q = query.toLowerCase()
    const found = STOCK_POOL.filter(s =>
      s.name.toLowerCase().includes(q) || s.code.includes(q)
    ).slice(0, 12)
    // 코드 직접 입력이면 커스텀 추가 옵션도
    setResults(found)
  }, [query])

  useEffect(() => {
    const fn = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setResults([]) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const handleAdd = (stock) => {
    if (existing.includes(stock.code)) { alert('이미 추가된 종목입니다.'); return }
    onAdd(stock)
    setQuery('')
    setResults([])
  }

  const handleManualAdd = () => {
    if (!custom.code.trim() || !custom.name.trim()) { alert('종목코드와 종목명을 입력하세요.'); return }
    if (!/^\d{6}$/.test(custom.code.trim())) { alert('종목코드는 6자리 숫자입니다.'); return }
    handleAdd({ code: custom.code.trim(), name: custom.name.trim(), theme: custom.theme })
    setCustom({ code: '', name: '', theme: '기타' })
  }

  const QUICK = [
    { name: '삼성전자', code: '005930', theme: '반도체·AI' },
    { name: 'SK하이닉스', code: '000660', theme: '반도체·AI' },
    { name: 'HD현대중공업', code: '329180', theme: '조선' },
    { name: '두산에너빌리티', code: '034020', theme: '원전·전력' },
    { name: 'LG에너지솔루션', code: '373220', theme: '2차전지' },
    { name: '셀트리온', code: '068270', theme: '바이오' },
    { name: 'KB금융', code: '105560', theme: '밸류업·금융' },
    { name: '현대차', code: '005380', theme: '자동차·모빌리티' },
    { name: 'KAI', code: '047810', theme: '방산' },
    { name: 'GKL', code: '114090', theme: '기타' },
  ]

  return (
    <div className="wl-add-section">
      <div className="wl-add-tabs">
        <button className={`wl-add-tab ${tab === 'search' ? 'active' : ''}`} onClick={() => setTab('search')}>🔍 종목 검색</button>
        <button className={`wl-add-tab ${tab === 'manual' ? 'active' : ''}`} onClick={() => setTab('manual')}>✏️ 직접 입력</button>
      </div>

      {tab === 'search' && (
        <div className="wl-search-wrap" ref={dropRef}>
          <input
            className="wl-search-input"
            placeholder="종목명 또는 종목코드 검색 (예: 삼성전자, 005930)"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          {results.length > 0 && (
            <div className="wl-search-drop">
              {results.map(s => (
                <button key={s.code} className="wl-search-item"
                  disabled={existing.includes(s.code)}
                  onClick={() => handleAdd(s)}>
                  <span className="wl-si-name">{s.name}</span>
                  <span className="wl-si-code">{s.code}</span>
                  <span className="wl-si-theme">{s.theme}</span>
                  {existing.includes(s.code) && <span className="wl-si-added">추가됨</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'manual' && (
        <div className="wl-manual-wrap">
          <input className="wl-manual-input" placeholder="종목코드 (6자리)" maxLength={6}
            value={custom.code} onChange={e => setCustom(p => ({...p, code: e.target.value}))}/>
          <input className="wl-manual-input" placeholder="종목명"
            value={custom.name} onChange={e => setCustom(p => ({...p, name: e.target.value}))}/>
          <select className="wl-manual-select" value={custom.theme} onChange={e => setCustom(p => ({...p, theme: e.target.value}))}>
            {ALL_THEMES.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
            <option value="기타">기타</option>
          </select>
          <button className="wl-manual-add-btn" onClick={handleManualAdd}>추가</button>
        </div>
      )}

      <div className="wl-quick-section">
        <span className="wl-quick-label">빠른 추가 — 주요 종목</span>
        <div className="wl-quick-list">
          {QUICK.map(s => (
            <button key={s.code} className="wl-quick-btn"
              disabled={existing.includes(s.code)}
              onClick={() => handleAdd(s)}>
              {existing.includes(s.code) ? '✓' : '+'} {s.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// 메인 WatchlistPage
// ══════════════════════════════════════════════════════
export default function WatchlistPage() {
  const { user } = useAuth()

  // 카테고리 상태
  const [cats,    setCats]    = useState(() => lsGet(LS_KEY, DEFAULT_CATS))
  const [activeCat, setActiveCat] = useState(null)  // null = 전체
  const [adding,  setAdding]  = useState(false)
  const [editCat, setEditCat] = useState(null)
  const [newCatName, setNewCatName] = useState('')
  const [showCatForm, setShowCatForm] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // 가격 상태
  const [prices,  setPrices]  = useState({})
  const [holdings, setHoldings] = useState({})

  // UI 상태
  const [chartStock, setChartStock] = useState(null)
  const [memoStock,  setMemoStock]  = useState(null)
  const [memoText,   setMemoText]   = useState('')
  const [memos,      setMemos]      = useState(() => lsGet('wl_memos', {}))
  const [sortKey,    setSortKey]    = useState('name')
  const [sortDir,    setSortDir]    = useState(1)

  // ── Firestore 경로 ─────────────────────────────────
  const fsDocRef = user ? doc(db, 'watchlists', user.uid) : null

  // ── Firestore → 로드 (마운트 시 1회) ──────────────
  useEffect(() => {
    if (!fsDocRef) return
    const load = async () => {
      try {
        const snap = await getDoc(fsDocRef)
        if (snap.exists()) {
          const data = snap.data()
          if (data.cats?.length) {
            setCats(data.cats)
            lsSet(LS_KEY, data.cats)
          }
          if (data.memos) {
            setMemos(data.memos)
            lsSet('wl_memos', data.memos)
          }
        }
      } catch (e) { console.error('Firestore load:', e) }
    }
    load()
  }, [user?.uid])

  // ── Firestore → 저장 ───────────────────────────────
  const saveToFirestore = useCallback(async (nextCats, nextMemos) => {
    if (!fsDocRef) return
    setSyncing(true)
    try {
      await setDoc(fsDocRef, {
        cats:      nextCats  ?? cats,
        memos:     nextMemos ?? memos,
        updatedAt: Date.now(),
      }, { merge: true })
    } catch (e) { console.error('Firestore save:', e) }
    finally { setSyncing(false) }
  }, [fsDocRef, cats, memos])

  // ── 카테고리 저장 (localStorage + Firestore) ───────
  const saveCats = useCallback((next) => {
    setCats(next)
    lsSet(LS_KEY, next)
    saveToFirestore(next, null)
  }, [saveToFirestore])

  // ── 현재 카테고리 종목 ──────────────────────────────
  const activeCatData = cats.find(c => c.id === activeCat) || null
  const allStocks = [...new Map(cats.flatMap(c => c.stocks).map(s => [s.code, s])).values()]
  const displayStocks = activeCat ? (activeCatData?.stocks || []) : allStocks

  // ── 가격 조회 ──────────────────────────────────────
  const fetchPrices = useCallback(async () => {
    const codes = [...new Set(allStocks.map(s => s.code))]
    if (!codes.length) return
    try {
      const res  = await fetch(`/api/kiwoom?type=prices&codes=${codes.join(',')}`)
      const data = await res.json()
      // /api/kiwoom?type=prices 는 { code: {price, change, changeRate} } 객체 맵 반환
      if (data && typeof data === 'object' && !data.error) {
        setPrices(data)
      }
    } catch {}
  }, [allStocks.map(s => s.code).join(',')])

  // ── 보유종목 조회 ──────────────────────────────────
  const fetchHoldings = useCallback(async () => {
    try {
      const res = await fetch('/api/kiwoom?type=account-holdings')
      const data = await res.json()
      if (data.holdings || data.list) {
        const map = {}
        ;(data.holdings || data.list || []).forEach(h => {
          const code = h.stk_cd || h.code
          if (code) map[code] = {
            qty:  Number(h.hldg_qty   || h.qty   || 0),
            buy:  Number(h.avg_buy_pric|| h.buy_price || 0),
            pnl:  Number(h.evlt_pfls  || h.pnl   || 0),
            rate: Number(h.pfls_rt    || h.rate   || 0),
          }
        })
        setHoldings(map)
      }
    } catch {}
  }, [])

  useEffect(() => {
    fetchPrices()
    fetchHoldings()
    const isOpen = getKstStatus() === 'open'
    const t = setInterval(fetchPrices, isOpen ? 30000 : 300000)
    return () => clearInterval(t)
  }, [fetchPrices])

  // ── 카테고리 추가 ──────────────────────────────────
  const addCat = () => {
    if (cats.length >= MAX_CATS) { alert(`카테고리는 최대 ${MAX_CATS}개까지 가능합니다.`); return }
    const name = newCatName.trim() || `관심종목${cats.length + 1}`
    const id   = `cat_${Date.now()}`
    saveCats([...cats, { id, name, stocks: [] }])
    setActiveCat(id)
    setNewCatName('')
    setShowCatForm(false)
  }

  const renameCat = (id, name) => {
    saveCats(cats.map(c => c.id === id ? { ...c, name } : c))
    setEditCat(null)
  }

  const deleteCat = (id) => {
    if (!confirm('카테고리를 삭제하시겠습니까?')) return
    const next = cats.filter(c => c.id !== id)
    saveCats(next.length ? next : DEFAULT_CATS)
    if (activeCat === id) setActiveCat(null)
  }

  // ── 종목 추가 ──────────────────────────────────────
  const addStock = (stock) => {
    if (!activeCat) { alert('종목을 추가할 카테고리를 선택하세요.'); return }
    const cat = cats.find(c => c.id === activeCat)
    if (!cat) return
    if (cat.stocks.length >= MAX_STOCKS) { alert(`카테고리당 최대 ${MAX_STOCKS}개까지 추가 가능합니다.`); return }
    if (cat.stocks.find(s => s.code === stock.code)) { alert('이미 추가된 종목입니다.'); return }
    saveCats(cats.map(c => c.id === activeCat ? { ...c, stocks: [...c.stocks, stock] } : c))
    fetchPrices()
  }

  const removeStock = (catId, code) => {
    saveCats(cats.map(c => c.id === catId ? { ...c, stocks: c.stocks.filter(s => s.code !== code) } : c))
  }

  // ── 정렬 ───────────────────────────────────────────
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(1) }
  }

  const sortedStocks = [...displayStocks].sort((a, b) => {
    const pa = prices[a.code], pb = prices[b.code]
    if (sortKey === 'name')   return a.name.localeCompare(b.name) * sortDir
    if (sortKey === 'price')  return ((pa?.price || 0) - (pb?.price || 0)) * sortDir
    if (sortKey === 'change') return ((pa?.change || 0) - (pb?.change || 0)) * sortDir
    if (sortKey === 'rate')   return ((pa?.changeRate || 0) - (pb?.changeRate || 0)) * sortDir
    if (sortKey === 'vol')    return ((pa?.volume || 0) - (pb?.volume || 0)) * sortDir
    return 0
  })

  // ── 메모 저장 ──────────────────────────────────────
  const saveMemo = () => {
    const next = { ...memos, [memoStock.code]: memoText }
    setMemos(next)
    lsSet('wl_memos', next)
    saveToFirestore(null, next)
    setMemoStock(null)
  }

  const SortIcon = ({ k }) => sortKey === k ? (sortDir > 0 ? ' ↑' : ' ↓') : ' ↕'

  return (
    <div className="wl-page">
      {/* ── 상단 헤더 ── */}
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <h1 className="page-title">관심종목</h1>
          <p className="page-sub">원하는 종목 모음 · 실시간 주가 · 카테고리 관리</p>
        </div>
        <div className="wl-header-actions">
          {syncing && <span className="wl-sync-badge">☁ 동기화 중...</span>}
          {user && !syncing && <span className="wl-sync-badge wl-sync-ok">☁ 동기화됨</span>}
          <button className="wl-btn-refresh" onClick={() => { fetchPrices(); fetchHoldings() }} title="새로고침">↺ 새로고침</button>
          {activeCat && (
            <button className="wl-btn-add" onClick={() => setAdding(v => !v)}>
              {adding ? '✕ 닫기' : '+ 종목 추가'}
            </button>
          )}
        </div>
      </div>

      {/* ── 카테고리 탭 ── */}
      <div className="wl-cat-bar">
        <button className={`wl-cat-tab ${!activeCat ? 'active' : ''}`} onClick={() => { setActiveCat(null); setAdding(false) }}>
          전체 <span className="wl-cat-count">{allStocks.length}</span>
        </button>

        {cats.map(c => (
          <div key={c.id} className="wl-cat-tab-wrap">
            {editCat === c.id ? (
              <input
                className="wl-cat-rename-input"
                defaultValue={c.name}
                autoFocus
                onBlur={e => renameCat(c.id, e.target.value || c.name)}
                onKeyDown={e => { if (e.key === 'Enter') renameCat(c.id, e.target.value || c.name); if (e.key === 'Escape') setEditCat(null) }}
              />
            ) : (
              <button
                className={`wl-cat-tab ${activeCat === c.id ? 'active' : ''}`}
                onClick={() => { setActiveCat(c.id); setAdding(false) }}
                onDoubleClick={() => setEditCat(c.id)}
                title="더블클릭으로 이름 변경"
              >
                {c.name}
                <span className="wl-cat-count">{c.stocks.length}</span>
              </button>
            )}
            {activeCat === c.id && (
              <button className="wl-cat-del-btn" onClick={() => deleteCat(c.id)} title="카테고리 삭제">✕</button>
            )}
          </div>
        ))}

        {/* 카테고리 추가 */}
        {cats.length < MAX_CATS && (
          <div className="wl-cat-new-wrap">
            {showCatForm ? (
              <div className="wl-cat-new-form">
                <input
                  className="wl-cat-rename-input"
                  placeholder="카테고리 이름"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCat(); if (e.key === 'Escape') { setShowCatForm(false); setNewCatName('') } }}
                  autoFocus
                />
                <button className="wl-cat-new-ok" onClick={addCat}>확인</button>
                <button className="wl-cat-new-cancel" onClick={() => { setShowCatForm(false); setNewCatName('') }}>✕</button>
              </div>
            ) : (
              <button className="wl-cat-add-btn" onClick={() => setShowCatForm(true)} title="카테고리 추가">
                + 카테고리
              </button>
            )}
          </div>
        )}

        <div className="wl-cat-hint">※ 탭 더블클릭으로 이름 변경</div>
      </div>

      {/* ── 종목 추가 패널 ── */}
      {adding && activeCat && (
        <StockSearch
          onAdd={addStock}
          existing={(activeCatData?.stocks || []).map(s => s.code)}
        />
      )}

      {/* ── 종목 리스트 ── */}
      <div className="wl-list-wrap">
        {sortedStocks.length === 0 ? (
          <div className="wl-empty">
            <div className="wl-empty-icon">⭐</div>
            <p>아직 추가한 종목이 없어요</p>
            {activeCat
              ? <p className="wl-empty-sub">위의 "＋ 종목 추가" 버튼으로 관심종목을 등록해보세요</p>
              : <p className="wl-empty-sub">카테고리를 선택한 후 종목을 추가하세요</p>
            }
          </div>
        ) : (
          <>
            {/* 테이블 헤더 */}
            <div className="wl-header-row">
              <div className="wl-cell wl-cell-name">
                <button className="wl-sort-btn" onClick={() => toggleSort('name')}>종목명<SortIcon k="name"/></button>
              </div>
              <div className="wl-cell wl-cell-price">
                <button className="wl-sort-btn" onClick={() => toggleSort('price')}>현재가<SortIcon k="price"/></button>
              </div>
              <div className="wl-cell wl-cell-change">
                <button className="wl-sort-btn" onClick={() => toggleSort('change')}>등락<SortIcon k="change"/></button>
              </div>
              <div className="wl-cell wl-cell-rate">
                <button className="wl-sort-btn" onClick={() => toggleSort('rate')}>등락률<SortIcon k="rate"/></button>
              </div>
              <div className="wl-cell wl-cell-vol">
                <button className="wl-sort-btn" onClick={() => toggleSort('vol')}>거래량<SortIcon k="vol"/></button>
              </div>
              <div className="wl-cell wl-cell-theme">테마</div>
              <div className="wl-cell wl-cell-hold">보유현황</div>
              <div className="wl-cell wl-cell-actions">액션</div>
            </div>

            {/* 종목 행들 */}
            {sortedStocks.map(stock => {
              // 어느 카테고리에서 온 종목인지 파악 (삭제용)
              const fromCat = activeCat || cats.find(c => c.stocks.find(s => s.code === stock.code))?.id
              return (
                <StockRow
                  key={stock.code}
                  stock={stock}
                  price={prices[stock.code]}
                  holding={holdings[stock.code]}
                  catId={fromCat}
                  onChart={setChartStock}
                  onRemove={(code) => removeStock(fromCat, code)}
                  onMemo={(s) => { setMemoStock(s); setMemoText(memos[s.code] || '') }}
                />
              )
            })}

            <div className="wl-list-footer">
              {sortedStocks.length}개 종목
              {activeCat && <span> · 최대 {MAX_STOCKS}개</span>}
            </div>
          </>
        )}
      </div>

      {/* ── 차트 팝업 ── */}
      {chartStock && (
        <GlobalChartModal
          type="stock"
          symbol={chartStock.code}
          name={chartStock.name}
          onClose={() => setChartStock(null)}
        />
      )}

      {/* ── 메모 팝업 ── */}
      {memoStock && (
        <div className="wl-memo-overlay" onClick={e => e.target === e.currentTarget && setMemoStock(null)}>
          <div className="wl-memo-modal">
            <div className="wl-memo-header">
              <span className="wl-memo-title">📝 {memoStock.name} 메모</span>
              <button className="wl-memo-close" onClick={() => setMemoStock(null)}>✕</button>
            </div>
            <textarea
              className="wl-memo-textarea"
              placeholder="종목에 대한 메모를 입력하세요..."
              value={memoText}
              onChange={e => setMemoText(e.target.value)}
              rows={6}
              autoFocus
            />
            <div className="wl-memo-footer">
              <button className="wl-memo-save" onClick={saveMemo}>저장</button>
              <button className="wl-memo-cancel" onClick={() => setMemoStock(null)}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
