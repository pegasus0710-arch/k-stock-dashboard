// src/components/BottomTabBar.jsx
// 모바일(640px 이하)에서 표시되는 하단 탭바
import './BottomTabBar.css'

const TABS = [
  { id:'dashboard',  icon:'📊', label:'대시보드' },
  { id:'chart',      icon:'📈', label:'차트'     },
  { id:'etf',        icon:'📦', label:'ETF'      },
  { id:'watchlist',  icon:'⭐', label:'관심종목' },
  { id:'more',       icon:'☰',  label:'더보기'   },
]

export default function BottomTabBar({ page, onNavigate }) {
  return (
    <nav className="bottom-tab-bar">
      {TABS.map(t => (
        <button
          key={t.id}
          className={`btb-item ${page === t.id ? 'active' : ''}`}
          onClick={() => onNavigate(t.id)}>
          <span className="btb-icon">{t.icon}</span>
          <span className="btb-label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
