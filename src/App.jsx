import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage         from './auth/LoginPage'
import OtpPage           from './auth/OtpPage'
import DashboardPage     from './pages/DashboardPage'
import ChartAnalysisPage from './pages/ChartAnalysisPage'
import MarketPage        from './pages/MarketPage'
import ETFPage           from './pages/ETFPage'
import PortfolioPage     from './pages/PortfolioPage'
import MemoPage          from './pages/MemoPage'
import NewsPage          from './pages/NewsPage'
import ComparePage       from './pages/ComparePage'
import './App.css'
import './index.css'
import './layout.css'

const APP_VERSION = 'v0.6'

const MENU = [
  { path: '/dashboard',   label: '대시보드',   sub: '시장 전체 현황' },
  { path: '/chart',       label: '차트 분석',  sub: '종목 검색·차트' },
  { path: '/market',      label: '시장·업종',  sub: '지수·수급·업종' },
  { path: '/etf',         label: 'ETF',        sub: 'ETF 시세·분석' },
  { path: '/portfolio',   label: '포트폴리오', sub: '보유·매매·분석' },
  { path: '/memo',        label: '메모장',     sub: '투자 아이디어·기록' },
  { path: '/compare',    label: '비교차트',   sub: '지수·ETF·종목 비교' },
  { path: '/news',        label: '뉴스·공시',  sub: '실시간 뉴스' },
]

const BOTTOM_TABS = [
  { path: '/dashboard', label: '홈',   icon: '⊞' },
  { path: '/chart',     label: '차트', icon: '↗' },
  { path: '/portfolio', label: '포폴', icon: '◈' },
  { path: '/memo',      label: '메모', icon: '≡' },
]

// ── 보호된 라우트 ─────────────────────────────────────
function RequireAuth({ children }) {
  const { user, loading, denied } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true })
  }, [user, loading])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0f1a' }}>
      <div className="app-boot-spinner"/>
    </div>
  )
  if (!user) return null
  return children
}

// ── 사이드바 ──────────────────────────────────────────

// ── 바로가기 링크 ─────────────────────────────────────
const QUICK_LINKS = [
  { label: '네이버 증권',    url: 'https://finance.naver.com',                          icon: '📊' },
  { label: 'KRX 시장정보',  url: 'https://data.krx.co.kr',                            icon: '🏛️' },
  { label: 'DART 공시',     url: 'https://dart.fss.or.kr',                            icon: '📋' },
  { label: '한국은행',      url: 'https://www.bok.or.kr',                             icon: '🏦' },
  { label: '거래량 상위',   url: 'https://finance.naver.com/sise/sise_quant.naver',   icon: '🔥' },
  { label: '외국인 순매수', url: 'https://finance.naver.com/sise/foreign_list.naver', icon: '🌐' },
  { label: '증권사 리포트', url: 'https://finance.naver.com/research/invest_list.naver', icon: '📈' },
  { label: '상한가 종목',   url: 'https://finance.naver.com/sise/sise_upper.naver',   icon: '🚀' },
]
function Sidebar({ collapsed, onToggle }) {
  const { user, logout } = useAuth()
  const [qlOpen, setQlOpen] = useState(false)

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* 로고 */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">K</div>
        {!collapsed && (
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-name">K-Stock</span>
            <span className="sidebar-logo-sub">Dashboard</span>
          </div>
        )}
        <button className="sidebar-toggle" onClick={onToggle}>
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* 메뉴 */}
      <nav className="sidebar-nav">
        {MENU.map(item => (
          <NavLink key={item.path} to={item.path}
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
            title={collapsed ? item.label : ''}>
            <span className="sidebar-item-icon">{item.icon}</span>
            {!collapsed && (
              <div className="sidebar-item-text">
                <span className="sidebar-item-label">{item.label}</span>
                <span className="sidebar-item-sub">{item.sub}</span>
              </div>
            )}
            {item.path === '/memo' && !collapsed && (
              <span className="sidebar-item-badge new">NEW</span>
            )}
          </NavLink>
        ))}

        {/* 바로가기 */}
        {!collapsed && (
          <div className="sidebar-quicklinks">
            <button className="sidebar-ql-toggle" onClick={() => setQlOpen(v => !v)}>
              <span className="sidebar-item-icon">🔗</span>
              <span className="sidebar-ql-label">바로가기</span>
              <span className="sidebar-ql-arrow">{qlOpen ? '▲' : '▼'}</span>
            </button>
            {qlOpen && (
              <div className="sidebar-ql-panel">
                {QUICK_LINKS.map(l => (
                  <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="sidebar-ql-item">
                    <span>{l.icon}</span>
                    <span>{l.label}</span>
                    <span className="sidebar-ql-arrow-sm">→</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* 하단: 유저 정보 + 로그아웃 */}
      <div className="sidebar-bottom">
        {!collapsed && user && (
          <div className="sidebar-user-bottom">
            <div className="sidebar-user-avatar-sm">
              {(user.displayName || user.email || 'J')[0].toUpperCase()}
            </div>
            <div className="sidebar-user-info-sm">
              <span className="sidebar-user-name-sm">{user.displayName || 'Trader'}</span>
              <span className="sidebar-user-email-sm">{user.email}</span>
            </div>
          </div>
        )}
        <button className="sidebar-logout" onClick={logout} title="로그아웃">
          {collapsed ? '⏻' : '⏻'}
        </button>
      </div>
    </aside>
  )
}

// ── 모바일 하단 탭 ────────────────────────────────────
function BottomTabBar() {
  return (
    <nav className="bottom-tabbar">
      {BOTTOM_TABS.map(tab => (
        <NavLink key={tab.path} to={tab.path}
          className={({ isActive }) => `bottom-tab ${isActive ? 'active' : ''}`}>
          <span className="bottom-tab-icon">{tab.icon}</span>
          <span className="bottom-tab-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

// ── 시장 상태 ─────────────────────────────────────────
function getMarketStatus() {
  const now = new Date()
  const h = now.getHours(), m = now.getMinutes(), day = now.getDay()
  const t = h * 60 + m
  if (day === 0 || day === 6)     return { label:'주말', color:'#64748b' }
  if (t >= 9*60 && t < 15*60+30) return { label:'LIVE', color:'#22c55e' }
  if (t >= 15*60+30 && t < 18*60)return { label:'시간외', color:'#f59e0b' }
  return { label:'장마감', color:'#ef4444' }
}

// ── 티커 띠 ───────────────────────────────────────────
function TickerBanner() {
  const [tickers, setTickers] = useState([
    { label:'KOSPI',  value:'-', change:0 },
    { label:'KOSDAQ', value:'-', change:0 },
    { label:'S&P500', value:'-', change:0 },
    { label:'나스닥',  value:'-', change:0 },
    { label:'니케이',  value:'-', change:0 },
    { label:'VIX',    value:'-', change:0 },
    { label:'DXY',    value:'-', change:0 },
    { label:'환율',   value:'-', change:0 },
  ])

  useEffect(() => {
    // 국내 지수
    fetch('/api/kiwoom?type=index-domestic')
      .then(r=>r.json())
      .then(d=>{
        setTickers(prev => prev.map(t => {
          if(t.label==='KOSPI'  && d.KOSPI)  return {...t, value: d.KOSPI.price?.toLocaleString(),  change: d.KOSPI.changeRate}
          if(t.label==='KOSDAQ' && d.KOSDAQ) return {...t, value: d.KOSDAQ.price?.toLocaleString(), change: d.KOSDAQ.changeRate}
          return t
        }))
      }).catch(()=>{})

    // 해외 지수 — 기존 global-batch 타입 활용 (kis.js에서 Yahoo Finance 프록시)
    fetch('/api/kis?type=global-batch&symbols=SP500,NASDAQ,N225,VIX,DXY,USD')
      .then(r=>r.json())
      .then(d=>{
        const MAP = {
          'SP500':  'S&P500',
          'NASDAQ': '나스닥',
          'N225':   '니케이',
          'VIX':    'VIX',
          'DXY':    'DXY',
          'USD':    '환율',
        }
        setTickers(prev => prev.map(t => {
          const key = Object.keys(MAP).find(k => MAP[k] === t.label)
          const item = key && d[key]
          if(!item || !item.price) return t
          return {
            ...t,
            value: Number(item.price).toLocaleString(undefined, {maximumFractionDigits:2}),
            change: item.changeRate || 0,
          }
        }))
      }).catch(()=>{})
  }, [])

  // 티커 아이템
  const items = [...tickers, ...tickers] // 무한 스크롤용 복제
  return (
    <div className="ticker-banner">
      <div className="ticker-track">
        {items.map((t, i) => {
          const c = t.change > 0 ? '#ef4444' : t.change < 0 ? '#2563eb' : '#94a3b8'
          const s = t.change > 0 ? '▲' : t.change < 0 ? '▼' : ''
          return (
            <span key={i} className="ticker-item">
              <span className="ticker-label">{t.label}</span>
              <span className="ticker-value" style={{color:c}}>
                {t.value} {s}{t.change!==0?Math.abs(t.change).toFixed(2)+'%':''}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── GNB (상단 네비게이션) ──────────────────────────────
function GNB() {
  const { user, logout } = useAuth()
  const status = getMarketStatus()
  const now = new Date()
  const timeStr = now.toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})

  return (
    <nav className="gnb">
      {/* 로고 */}
      <div className="gnb-logo">
        <span className="gnb-logo-icon">K</span>
        <span className="gnb-logo-text">Stock</span>
      </div>

      {/* 메뉴 탭 — 텍스트 전용, 활성 탭은 하단 라인만 */}
      <div className="gnb-menu">
        {MENU.map(item => (
          <NavLink key={item.path} to={item.path}
            className={({ isActive }) => `gnb-item ${isActive ? 'active' : ''}`}>
            <span className="gnb-item-label">{item.label}</span>
            {item.path === '/memo' && <span className="gnb-item-badge">N</span>}
          </NavLink>
        ))}
      </div>

      {/* 우측 */}
      <div className="gnb-right">
        <span className="gnb-status" style={{color: status.color}}>● {status.label}</span>
        <span className="gnb-time">{timeStr}</span>
        {user && (
          <button className="gnb-user" onClick={logout} title="로그아웃">
            <span className="gnb-avatar">{(user.displayName||user.email||'J')[0].toUpperCase()}</span>
          </button>
        )}
      </div>
    </nav>
  )
}

// ── 페이지별 테마 (3그룹) ──────────────────────────────
// 그룹A 데이터·분석 → 틸
// 그룹B 관리·기록   → 인디고
// 그룹C 정보·커뮤니케이션 → 슬레이트
const PAGE_THEMES = {
  '/dashboard':   'theme-slate',
  '/chart':       'theme-teal',
  '/market':      'theme-teal',
  '/etf':         'theme-teal',
  '/portfolio':   'theme-indigo',
  '/memo':        'theme-slate',
  '/compare':    'theme-teal',
  '/news':        'theme-slate',
}

// ── 메인 레이아웃 ─────────────────────────────────────
function AppLayout() {
  const location = useLocation()
  const themeKey = Object.keys(PAGE_THEMES).find(k => location.pathname.startsWith(k))
  const themeClass = PAGE_THEMES[themeKey] || 'theme-slate'

  return (
    <div className={`app-layout ${themeClass}`}>
      {/* 상단 티커 띠 */}
      <TickerBanner/>
      {/* GNB */}
      <GNB/>
      {/* 메인 콘텐츠 */}
      <main className="app-content">
        <Routes>
          <Route path="/"              element={<Navigate to="/dashboard" replace/>}/>
          <Route path="/dashboard"     element={<DashboardPage/>}/>
          <Route path="/chart"         element={<ChartAnalysisPage/>}/>
          <Route path="/market"        element={<MarketPage/>}/>
          <Route path="/etf"           element={<ETFPage/>}/>
          <Route path="/portfolio"     element={<PortfolioPage/>}/>
          <Route path="/trading-log"   element={<Navigate to="/portfolio" replace/>}/>
          <Route path="/memo"          element={<MemoPage/>}/>
          <Route path="/compare"      element={<ComparePage/>}/>
          <Route path="/news"          element={<NewsPage/>}/>
          <Route path="*"             element={<Navigate to="/dashboard" replace/>}/>
        </Routes>
      </main>
      {/* 모바일 하단 탭 */}
      <BottomTabBar/>
    </div>
  )
}

// ── 루트 ─────────────────────────────────────────────
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage/>}/>
      <Route path="/otp"   element={<OtpPage/>}/>
      <Route path="/*"     element={
        <RequireAuth>
          <AppLayout/>
        </RequireAuth>
      }/>
    </Routes>
  )
}

// ── BrowserRouter → AuthProvider 순서 중요 ───────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes/>
      </AuthProvider>
    </BrowserRouter>
  )
}
