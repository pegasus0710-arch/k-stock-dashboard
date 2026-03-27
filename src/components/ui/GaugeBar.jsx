// src/components/ui/GaugeBar.jsx
import { useState } from 'react'
import { GAUGE_CONFIG, GUIDE_DATA } from '../../constants/dashboardData'

export function GaugeBar({ id, price }) {
  const cfg = GAUGE_CONFIG[id]
  if (!cfg || price == null) return null
  const { min, max, safe, caution, labels } = cfg
  const pct = Math.min(100, Math.max(0, (price - min) / (max - min) * 100))
  const color = price <= safe ? 'var(--gauge-safe)'
              : price <= caution ? 'var(--gauge-caution)'
              : 'var(--gauge-danger)'
  return (
    <div className="db-gauge-wrap">
      <div className="db-gauge-track">
        <div className="db-gauge-fill" style={{width:`${pct}%`, background:color}}/>
      </div>
      <div className="db-gauge-label">
        <span>{labels[0]}</span>
        <span>{labels[2]}</span>
      </div>
    </div>
  )
}

export function TooltipIcon({ id }) {
  const [show, setShow] = useState(false)
  const g = GUIDE_DATA[id]
  if (!g) return null
  return (
    <span className="db-tooltip-wrap"
      onMouseEnter={()=>setShow(true)}
      onMouseLeave={()=>setShow(false)}
      onClick={e=>e.stopPropagation()}>
      <span className="db-tooltip-icon">?</span>
      {show && (
        <div className="db-tooltip-box">
          <div className="db-tooltip-title">{g.title}</div>
          <div className="db-tooltip-desc">{g.desc}</div>
          {g.tip && <div className="db-tooltip-tip">{g.tip}</div>}
        </div>
      )}
    </span>
  )
}
