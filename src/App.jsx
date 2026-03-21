import { useState } from 'react'
import { useAuth } from './context/AuthContext'
import DashboardPage  from './pages/DashboardPage'
import MarketPage     from './pages/MarketPage'
import ThemePage      from './pages/ThemePage'
import WatchlistPage  from './pages/WatchlistPage'
import PortfolioPage  from './pages/PortfolioPage'
import TradingLogPage from './pages/TradingLogPage'
import NewsPage       from './pages/NewsPage'
import './App.css'

const NAV_ITEMS = [
  { id: 'dashboard',  label: '대시보드',   sub: '시장 전체 현황',    icon: '📊' },
  { id: 'market',     label: '시장·업종',  sub: '지수·수급·업종',   icon: '📈' },
  { id: 'theme',      label: '테마',        sub: '7대 테마 분석',     icon: '🎯' },
  { id: 'watchlist',  label: '관심종목',   sub: '찜한 종목 모음',    icon: '⭐' },
  { id: 'portfolio',  label: '포트폴리오', sub: '보유종목·손익',     icon: '💼' },
  { id: 'tradinglog', label: '매매일지',   sub: '자동생성 일지',     icon: '📓' },
  { id: 'news',       label: '뉴스·공시',  sub: '실시간 뉴스',       icon: '📰' },
]

function getTodayStr() {
  const d = new Date()
  const days = ['일','월','화','수','목','금','토']
  return `${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}

function getMarketStatus() {
  const now = new Date()
  const total = now.getHours() * 60 + now.getMinutes()
  if (total >= 9*60 && total < 15*60+30)  return { label: 'LIVE', color: '#16a34a' }
  if (total >= 8*60  && total < 9*60)     return { label: '장 시작 전', color: '#d97706' }
  if (total >= 15*60+30 && total < 18*60) return { label: '시간외', color: '#7c3aed' }
  return { label: '장 마감', color: '#64748b' }
}

export default function App() {
  const { user, logout } = useAuth()
  const [activePage, setActivePage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const activeNav  = NAV_ITEMS.find(n => n.id === activePage)
  const marketSt   = getMarketStatus()

  const PageComponent = {
    dashboard:  DashboardPage,
    market:     MarketPage,
    theme:      ThemePage,
    watchlist:  WatchlistPage,
    portfolio:  PortfolioPage,
    tradinglog: TradingLogPage,
    news:       NewsPage,
  }[activePage] || DashboardPage

  const initials = user?.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'U'

  return (
    <div className="app-layout">

      {/* ── 사이드바 ── */}
      <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}>

        {/* 로고 */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">K</div>
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-name">K-Stock</div>
            <div className="sidebar-logo-sub">Dashboard</div>
          </div>
        </div>

        {/* 유저 */}
        {user && (
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div>
              <div className="sidebar-user-name">{user.displayName || '투자자'}</div>
              <div className="sidebar-user-email">{user.email}</div>
            </div>
          </div>
        )}

        {/* 네비 */}
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => { setActivePage(item.id); setSidebarOpen(false) }}
            >
              <span className="nav-icon">{item.icon}</span>
              <div>
                <div className="nav-label">{item.label}</div>
                <div className="nav-sub">{item.sub}</div>
              </div>
            </button>
          ))}
        </nav>

        {/* 하단 */}
        <div className="sidebar-footer">
          <div className="sidebar-version">K-Stock v0.3</div>
          {user && (
            <button className="sidebar-logout" onClick={logout}>
              <span>🚪</span> 로그아웃
            </button>
          )}
        </div>
      </aside>

      {/* 모바일 오버레이 */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── 메인 ── */}
      <div className="app-main">

        {/* 상단 바 */}
        <header className="app-topbar">
          <div className="topbar-left">
            <button className="topbar-hamburger" onClick={() => setSidebarOpen(v => !v)}>
              ☰
            </button>
            <div className="topbar-title">
              {activeNav?.icon} {activeNav?.label}
              <span className="topbar-sub">{activeNav?.sub}</span>
            </div>
          </div>
          <div className="topbar-right">
            <div className="topbar-live" style={{ color: marketSt.color }}>
              <span className="topbar-live-dot" style={{ background: marketSt.color }} />
              {marketSt.label}
            </div>
            <div className="topbar-date">{getTodayStr()}</div>
          </div>
        </header>

        {/* 컨텐츠 */}
        <main className="app-content">
          <PageComponent />
        </main>

      </div>
    </div>
  )
}
