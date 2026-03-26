import { useState } from 'react'
import { useAuth } from './context/AuthContext'
import './App.css'
import './mobile-cards.css'

import LoginPage           from './auth/LoginPage'
import DashboardPage       from './pages/DashboardPage'
import MarketPage          from './pages/MarketPage'
import WatchlistPage       from './pages/WatchlistPage'
import PortfolioPage       from './pages/PortfolioPage'
import TradingLogPage      from './pages/TradingLogPage'
import NewsPage            from './pages/NewsPage'
import ChartAnalysisPage   from './pages/ChartAnalysisPage'
import ETFPage             from './pages/ETFPage'
import BottomTabBar        from './components/BottomTabBar'

const NAV_ITEMS = [
  { id: 'dashboard',  label: '대시보드',   sub: '시장 전체 현황', icon: '📊' },
  { id: 'chart',      label: '차트 분석',  sub: '종목 검색·차트', icon: '📈' },
  { id: 'market',     label: '시장·업종',  sub: '지수·수급·업종', icon: '🏛️' },
  { id: 'etf',        label: 'ETF',        sub: 'ETF 시세·분석',  icon: '📦' },
  { id: 'watchlist',  label: '관심종목',   sub: '찜한 종목 모음', icon: '⭐' },
  { id: 'portfolio',  label: '포트폴리오', sub: '보유종목·손익',  icon: '💼' },
  { id: 'tradinglog', label: '매매일지',   sub: '자동생성 일지',  icon: '📓' },
  { id: 'news',       label: '뉴스·공시',  sub: '실시간 뉴스',    icon: '📰' },
]

const PAGES = {
  dashboard:  DashboardPage,
  chart:      ChartAnalysisPage,
  market:     MarketPage,
  etf:        ETFPage,
  watchlist:  WatchlistPage,
  portfolio:  PortfolioPage,
  tradinglog: TradingLogPage,
  news:       NewsPage,
}

function getTodayStr() {
  const d = new Date()
  const days = ['일','월','화','수','목','금','토']
  return `${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}

function getMarketStatus() {
  const t = new Date().getHours() * 60 + new Date().getMinutes()
  if (t >= 540 && t < 930)  return { label: '정규장 운영중', color: '#16a34a' }
  if (t >= 480 && t < 540)  return { label: '장 시작 전',   color: '#d97706' }
  if (t >= 930 && t < 1080) return { label: '시간외',        color: '#7c3aed' }
  return { label: '장 마감', color: '#64748b' }
}

export default function App() {
  const { user, authLoading, denied, logout } = useAuth()
  const [activePage, setPage]     = useState('dashboard')
  const [sidebarOpen, setSidebar] = useState(false)

  if (authLoading) {
    return (
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'center',
        height:'100vh', flexDirection:'column', gap:'16px',
        background:'#f8fafc', color:'#64748b',
      }}>
        <div style={{fontSize:'32px',fontWeight:800,color:'#2563eb'}}>K</div>
        <div style={{fontSize:'14px'}}>로딩 중...</div>
      </div>
    )
  }

  if (!user) return <LoginPage denied={denied} />

  const PageComp  = PAGES[activePage] || DashboardPage
  const activeNav = NAV_ITEMS.find(n => n.id === activePage)
  const market    = getMarketStatus()
  const initials  = user?.displayName
    ? user.displayName.slice(0, 2).toUpperCase()
    : (user?.email?.[0] || 'U').toUpperCase()

  const goTo = (id) => { setPage(id); setSidebar(false) }

  return (
    <div className="app-layout">

      <aside className={`app-sidebar${sidebarOpen ? ' open' : ''} app-sidebar--desktop`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">K</div>
          <div>
            <div className="sidebar-logo-name">K-Stock</div>
            <div className="sidebar-logo-sub">Dashboard</div>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div style={{minWidth:0}}>
            <div className="sidebar-user-name">{user.displayName || '투자자'}</div>
            <div className="sidebar-user-email">{user.email}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button key={item.id}
              className={`nav-item${activePage === item.id ? ' active' : ''}`}
              onClick={() => goTo(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              <div>
                <div className="nav-label">{item.label}</div>
                <div className="nav-sub">{item.sub}</div>
              </div>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-version">K-Stock v0.5</div>
          <button className="sidebar-logout" onClick={logout}>🚪 로그아웃</button>
        </div>
      </aside>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebar(false)}/>}

      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-left">
            <button className="topbar-hamburger" onClick={() => setSidebar(v => !v)}>☰</button>
            <div className="topbar-title">
              {activeNav?.icon}&nbsp;{activeNav?.label}
              <span className="topbar-sub">{activeNav?.sub}</span>
            </div>
          </div>
          <div className="topbar-right">
            <span className="topbar-live" style={{color: market.color}}>
              <span className="topbar-live-dot" style={{background: market.color}}/>
              {market.label}
            </span>
            <span className="topbar-date">{getTodayStr()}</span>
          </div>
        </header>
        <main className="app-content">
          <PageComp />
        </main>
      </div>

      <BottomTabBar page={activePage} onNavigate={goTo}/>
    </div>
  )
}
