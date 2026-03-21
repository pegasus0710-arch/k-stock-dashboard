import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage   from './auth/LoginPage'
import OtpPage     from './auth/OtpPage'

import DashboardPage  from './pages/DashboardPage'
import MarketPage     from './pages/MarketPage'
import ThemePage      from './pages/ThemePage'
import WatchlistPage  from './pages/WatchlistPage'
import PortfolioPage  from './pages/PortfolioPage'
import TradingLogPage from './pages/TradingLogPage'
import NewsPage       from './pages/NewsPage'

import './App.css'

const MENU = [
  { id: 'dashboard',  label: '대시보드',   icon: '▦',  desc: '시장 전체 현황' },
  { id: 'market',     label: '시장·업종',  icon: '📈', desc: '지수·수급·업종' },
  { id: 'theme',      label: '테마',        icon: '🎯', desc: '7대 테마 분석' },
  { id: 'watchlist',  label: '관심종목',   icon: '⭐', desc: '찜한 종목 모음' },
  { id: 'portfolio',  label: '포트폴리오', icon: '💼', desc: '보유종목·손익' },
  { id: 'tradinglog', label: '매매일지',   icon: '📓', desc: '자동생성 일지' },
  { id: 'news',       label: '뉴스·공시',  icon: '📰', desc: '실시간 뉴스' },
]

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-logo-mark">K</div>
      <div className="loading-spinner" />
      <p className="loading-text">K-Stock Dashboard</p>
    </div>
  )
}

function AppLayout() {
  const { user, needsOtp, authLoading, logout } = useAuth()
  const [activeTab,   setActiveTab]   = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (authLoading)            return <LoadingScreen />
  if (!user && !needsOtp)     return <LoginPage />
  if (needsOtp)               return <OtpPage />

  const renderPage = () => {
    switch (activeTab) {
      case 'dashboard':  return <DashboardPage />
      case 'market':     return <MarketPage />
      case 'theme':      return <ThemePage />
      case 'watchlist':  return <WatchlistPage />
      case 'portfolio':  return <PortfolioPage />
      case 'tradinglog': return <TradingLogPage />
      case 'news':       return <NewsPage />
      default:           return <DashboardPage />
    }
  }

  const currentMenu = MENU.find(m => m.id === activeTab)
  const avatarUrl   = user.photoURL ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=2563eb&color=fff&size=64`

  return (
    <div className="app-shell">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ── 사이드바 ── */}
      <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-mark">K</div>
          <div>
            <div className="logo-text">K-Stock</div>
            <div className="logo-sub">Dashboard</div>
          </div>
        </div>

        <div className="sidebar-user">
          <img src={avatarUrl} alt="avatar" className="user-avatar" />
          <div className="user-info">
            <span className="user-name">{user.displayName || '사용자'}</span>
            <span className="user-email">{user.email}</span>
          </div>
        </div>

        <div className="nav-links">
          {MENU.map(m => (
            <button
              key={m.id}
              className={`nav-item ${activeTab === m.id ? 'active' : ''}`}
              onClick={() => { setActiveTab(m.id); setSidebarOpen(false) }}
            >
              <span className="nav-icon">{m.icon}</span>
              <div className="nav-texts">
                <span className="nav-label">{m.label}</span>
                <span className="nav-desc">{m.desc}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={logout}>⎋ 로그아웃</button>
          <span className="version-text">K-Stock v0.3</span>
        </div>
      </nav>

      {/* ── 메인 ── */}
      <main className="main-content">
        <header className="top-bar">
          <div className="top-bar-left">
            <button className="menu-toggle" onClick={() => setSidebarOpen(v => !v)}>☰</button>
            <div className="top-title-wrap">
              <span className="page-title">{currentMenu?.label}</span>
              <span className="page-desc dim">{currentMenu?.desc}</span>
            </div>
          </div>
          <div className="top-bar-right">
            <span className="live-badge">● LIVE</span>
            <span className="top-date mono dim">
              {new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}
            </span>
            <img src={avatarUrl} alt="avatar" className="top-avatar" />
          </div>
        </header>

        <div className="content-area">{renderPage()}</div>
      </main>

      {/* ── 모바일 하단 탭바 ── */}
      <nav className="bottom-nav">
        {MENU.map(m => (
          <button
            key={m.id}
            className={`bottom-nav-item ${activeTab === m.id ? 'active' : ''}`}
            onClick={() => setActiveTab(m.id)}
          >
            <span className="bottom-nav-icon">{m.icon}</span>
            <span className="bottom-nav-label">{m.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppLayout />
    </AuthProvider>
  )
}
