import { useState } from 'react'
import Dashboard   from './components/Dashboard.jsx'
import ThemeNews   from './components/ThemeNews.jsx'
import StockChart  from './components/StockChart.jsx'
import Disclosure  from './components/Disclosure.jsx'
import AiAnalysis  from './components/AiAnalysis.jsx'
import Portfolio   from './components/Portfolio.jsx'
import './App.css'

const TABS = [
  { id: 'dashboard', label: '대시보드',    icon: '▦' },
  { id: 'news',      label: '테마뉴스',    icon: '≡' },
  { id: 'chart',     label: '종목차트',    icon: '╱' },
  { id: 'dart',      label: '공시·재무',   icon: '◈' },
  { id: 'portfolio', label: '포트폴리오',  icon: '◎' },
  { id: 'ai',        label: 'AI 분석',     icon: '✦' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />
      case 'news':      return <ThemeNews />
      case 'chart':     return <StockChart />
      case 'dart':      return <Disclosure />
      case 'portfolio': return <Portfolio />
      case 'ai':        return <AiAnalysis />
      default:          return <Dashboard />
    }
  }

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-mark">K</span>
          <span className="logo-text">Stock<br/>Dash</span>
        </div>
        <div className="nav-links">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="nav-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-footer">K-Stock v0.2</div>
      </nav>

      <main className="main-content">
        <header className="top-bar">
          <span className="page-title">{TABS.find(t => t.id === activeTab)?.label}</span>
          <div className="top-bar-right">
            <span className="live-badge">● LIVE</span>
            <span className="dim mono" style={{ fontSize: 12 }}>
              {new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}
            </span>
          </div>
        </header>
        <div className="content-area">{renderTab()}</div>
      </main>

      <nav className="bottom-nav">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`bottom-nav-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="bottom-nav-icon">{tab.icon}</span>
            <span className="bottom-nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
