import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage    from './auth/LoginPage'
import OtpPage      from './auth/OtpPage'
import DashboardPage    from './pages/DashboardPage'
import ChartAnalysisPage from './pages/ChartAnalysisPage'
import MarketPage       from './pages/MarketPage'
import ETFPage          from './pages/ETFPage'
import WatchlistPage    from './pages/WatchlistPage'
import PortfolioPage    from './pages/PortfolioPage'
import TradingLogPage   from './pages/TradingLogPage'
import MemoPage         from './pages/MemoPage'
import NewsPage         from './pages/NewsPage'
import './App.css'
import './index.css'
import './layout.css'

// ── 앱 버전 ─────────────────────────────────────────
const APP_VERSION = 'v0.6'

// ── 사이드바 메뉴 ─────────────────────────────────────
const MENU = [
  { path: '/dashboard',  label: '대시보드',  sub: '시장 전체 현황',    icon: '📊' },
  { path: '/chart',      label: '차트 분석', sub: '종목 검색·차트',    icon: '📈' },
  { path: '/market',     label: '시장·업종', sub: '지수·수급·업종',    icon: '🏦' },
  { path: '/etf',        label: 'ETF',       sub: 'ETF 시세·분석',     icon: '🧩' },
  { path: '/watchlist',  label: '관심종목',  sub: '즐겨찾기 종목 모음', icon: '⭐' },
  { path: '/portfolio',  label: '포트폴리오', sub: '보유종목·손익',     icon: '💼' },
  { path: '/trading-log',label: '매매일지',  sub: '자동생성 일지',     icon: '📓' },
  { path: '/memo',       label: '메모장',    sub: '투자 아이디어·기록', icon: '📝' },
  { path: '/news',       label: '뉴스·공시', sub: '실시간 뉴스',       icon: '📰' },
]

// ── 모바일 하단 탭 (주요 메뉴만) ─────────────────────
const BOTTOM_TABS = [
  { path: '/dashboard',  label: '홈',     icon: '📊' },
  { path: '/chart',      label: '차트',   icon: '📈' },
  { path: '/watchlist',  label: '관심',   icon: '⭐' },
  { path: '/portfolio',  label: '포폴',   icon: '💼' },
  { path: '/memo',       label: '메모',   icon: '📝' },
]

// ── 보호된 라우트 ─────────────────────────────────────
function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0f1a' }}>
      <div className="app-boot-spinner"/>
    </div>
  )
  if (!user) return <Navigate to="/login" replace/>
  return children
}

// ── 사이드바 ──────────────────────────────────────────
function Sidebar({ collapsed, onToggle }) {
  const { user, logout } = useAuth()
  const location = useLocation()

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
        <button className="sidebar-toggle" onClick={onToggle} title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}>
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* 유저 정보 */}
      {!collapsed && user && (
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{(user.displayName||user.email||'J')[0].toUpperCase()}</div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{user.displayName || 'Trader'}</span>
            <span className="sidebar-user-email">{user.email}</span>
          </div>
        </div>
      )}

      {/* 네비게이션 */}
      <nav className="sidebar-nav">
        {MENU.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
            title={collapsed ? item.label : ''}
          >
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
      </nav>

      {/* 하단 */}
      <div className="sidebar-bottom">
        {!collapsed && (
          <span className="sidebar-version">K-Stock {APP_VERSION}</span>
        )}
        <button className="sidebar-logout" onClick={logout} title="로그아웃">
          {collapsed ? '⏻' : '⏻  로그아웃'}
        </button>
      </div>
    </aside>
  )
}

// ── 모바일 하단 탭바 ────────────────────────────────────
function BottomTabBar() {
  return (
    <nav className="bottom-tabbar">
      {BOTTOM_TABS.map(tab => (
        <NavLink
          key={tab.path}
          to={tab.path}
          className={({ isActive }) => `bottom-tab ${isActive ? 'active' : ''}`}
        >
          <span className="bottom-tab-icon">{tab.icon}</span>
          <span className="bottom-tab-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

// ── 헤더 (페이지 타이틀 + 상태) ─────────────────────────
function TopHeader() {
  const location = useLocation()
  const current = MENU.find(m => location.pathname.startsWith(m.path))
  const now = new Date()
  const dateStr = now.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'short' })

  const getMarketStatus = () => {
    const h = now.getHours(), m = now.getMinutes()
    const total = h * 60 + m
    const day = now.getDay()
    if (day === 0 || day === 6) return { label:'주말 휴장', color:'#64748b' }
    if (total >= 9*60 && total < 15*60+30) return { label:'● LIVE', color:'#22c55e' }
    if (total >= 15*60+30 && total < 18*60) return { label:'⏱ 시간외', color:'#f59e0b' }
    return { label:'● 장 마감', color:'#ef4444' }
  }
  const status = getMarketStatus()

  return (
    <header className="top-header">
      <div className="top-header-left">
        {current && (
          <>
            <span className="top-header-icon">{current.icon}</span>
            <div>
              <span className="top-header-title">{current.label}</span>
              <span className="top-header-sub">{current.sub}</span>
            </div>
          </>
        )}
      </div>
      <div className="top-header-right">
        <span className="top-header-status" style={{ color: status.color }}>{status.label}</span>
        <span className="top-header-date">{dateStr}</span>
      </div>
    </header>
  )
}

// ── 메인 레이아웃 ────────────────────────────────────────
function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sidebar_collapsed') || 'false') } catch { return false }
  })

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', JSON.stringify(collapsed))
  }, [collapsed])

  return (
    <div className={`app-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(v => !v)}/>

      <div className="app-main">
        <TopHeader/>

        <main className="app-content">
          <Routes>
            <Route path="/"             element={<Navigate to="/dashboard" replace/>}/>
            <Route path="/dashboard"    element={<DashboardPage/>}/>
            <Route path="/chart"        element={<ChartAnalysisPage/>}/>
            <Route path="/market"       element={<MarketPage/>}/>
            <Route path="/etf"          element={<ETFPage/>}/>
            <Route path="/watchlist"    element={<WatchlistPage/>}/>
            <Route path="/portfolio"    element={<PortfolioPage/>}/>
            <Route path="/trading-log"  element={<TradingLogPage/>}/>
            <Route path="/memo"         element={<MemoPage/>}/>
            <Route path="/news"         element={<NewsPage/>}/>
            <Route path="*"             element={<Navigate to="/dashboard" replace/>}/>
          </Routes>
        </main>
      </div>

      <BottomTabBar/>
    </div>
  )
}

// ── 루트 앱 ──────────────────────────────────────────────
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes/>
      </AuthProvider>
    </BrowserRouter>
  )
}
