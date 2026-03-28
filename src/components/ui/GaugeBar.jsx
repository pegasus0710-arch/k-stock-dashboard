// src/components/ui/GaugeBar.jsx
import { useState } from 'react'
import { GAUGE_CONFIG, GUIDE_DATA } from '../../constants/dashboardData'

// ── VIX 반원 게이지 ───────────────────────────────────
function SemiGauge({ price }) {
  const min=0, max=60
  const pct  = Math.min(100, Math.max(0, (price-min)/(max-min)*100))
  // 반원: -180deg ~ 0deg → pct 기준 각도
  const angle = -180 + pct * 1.8  // -180 ~ 0
  const toRad = a => a * Math.PI / 180
  // SVG 반원 호 그리기
  const cx=80, cy=80, r=60
  const arcPath = (startDeg, endDeg, color, sw=12) => {
    const s = toRad(startDeg), e = toRad(endDeg)
    const x1=cx+r*Math.cos(s), y1=cy+r*Math.sin(s)
    const x2=cx+r*Math.cos(e), y2=cy+r*Math.sin(e)
    const large = endDeg-startDeg > 180 ? 1 : 0
    return <path d={`M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2}`}
      fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
  }
  // 바늘
  const needleAngle = toRad(angle)
  const nx = cx + (r-8) * Math.cos(needleAngle)
  const ny = cy + (r-8) * Math.sin(needleAngle)
  const level = price<=15 ? {label:'안정', color:'#22c55e'}
              : price<=30 ? {label:'주의', color:'#f59e0b'}
              : {label:'공포', color:'#ef4444'}

  return (
    <div className="db-semi-wrap">
      <div className="db-semi-badge-row">
        <span className="db-semi-badge" style={{background:level.color+'22',color:level.color,borderColor:level.color+'44'}}>
          {price>=30?'⚠ ':'●  '}{level.label}
        </span>
      </div>
      <svg viewBox="20 20 120 70" width="100%" style={{display:'block',overflow:'visible'}}>
        {/* 배경 호 */}
        {arcPath(-180, 0, '#E2E8F0', 10)}
        {/* 구간 색상 */}
        {arcPath(-180, -144, '#22c55e', 10)}
        {arcPath(-144, -72,  '#f59e0b', 10)}
        {arcPath(-72,  0,    '#ef4444', 10)}
        {/* 바늘 */}
        <line x1={cx} y1={cy} x2={nx} y2={ny}
          stroke="#1e293b" strokeWidth="3" strokeLinecap="round"/>
        <circle cx={cx} cy={cy} r="5" fill="#1e293b"/>
        {/* 값 */}
        <text x={cx} y={cy+18} textAnchor="middle" fontSize="16" fontWeight="700" fill="#1e293b">
          {price.toFixed(2)}
        </text>
      </svg>
      <div className="db-semi-labels">
        <span>안정</span><span>주의</span><span>공포</span>
      </div>
    </div>
  )
}

// ── USD/KRW 컬러 레인지 바 ────────────────────────────
function ForexRangeBar({ price }) {
  const segments = [
    { min:1200, max:1350, color:'#3b82f6', label:'강세' },
    { min:1350, max:1450, color:'#22c55e', label:'' },
    { min:1450, max:1500, color:'#f59e0b', label:'' },
    { min:1500, max:1600, color:'#f97316', label:'⚠경계' },
    { min:1600, max:1700, color:'#ef4444', label:'위기' },
  ]
  const totalMin=1200, totalMax=1700, range=totalMax-totalMin
  const thumbPct = Math.min(100, Math.max(0, (price-totalMin)/range*100))
  const level = price<=1350 ? {label:'원화 강세', color:'#3b82f6'}
              : price<=1450 ? {label:'안정',      color:'#22c55e'}
              : price<=1500 ? {label:'경계 근접',  color:'#f59e0b'}
              : price<=1600 ? {label:'⚡ 경계 근접', color:'#f97316'}
              : {label:'⚠ 위기', color:'#ef4444'}

  return (
    <div className="db-forex-range-wrap">
      <div className="db-forex-level-row">
        <span className="db-semi-badge" style={{background:level.color+'22',color:level.color,borderColor:level.color+'44'}}>
          {level.label}
        </span>
        <span style={{fontSize:9,color:'var(--text-dim)',marginLeft:'auto'}}>
          기준 {new Date().toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'}).replace('. ','.')} {new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})} KST
        </span>
      </div>
      {/* 컬러 레인지 트랙 */}
      <div className="db-forex-track">
        {segments.map((s,i)=>(
          <div key={i} style={{
            flex: s.max-s.min,
            background: s.color,
            opacity: 0.7,
            borderRadius: i===0?'4px 0 0 4px':i===segments.length-1?'0 4px 4px 0':'0',
          }}/>
        ))}
        {/* 핸들 */}
        <div className="db-forex-thumb" style={{left:`${thumbPct}%`}}/>
      </div>
      {/* 레이블 */}
      <div className="db-forex-range-labels">
        <span>1,200<br/>강세</span>
        <span style={{color:'#f59e0b'}}>1,400<br/>보통</span>
        <span style={{color:'#f97316'}}>1,500<br/>△경계</span>
        <span>1,700<br/>위기</span>
      </div>
    </div>
  )
}

export function GaugeBar({ id, price }) {
  const cfg = GAUGE_CONFIG[id]
  if (!cfg || price == null) return null

  // VIX → 반원 게이지
  if (id === 'VIX') return <SemiGauge price={price}/>

  // FX_USD → 컬러 레인지 바
  if (id === 'FX_USD') return <ForexRangeBar price={price}/>

  // 나머지 → 기존 가로 게이지
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

export function TooltipIcon({ id, tipPosition = 'left' }) {
  const [show, setShow] = useState(false)
  const g = GUIDE_DATA[id]
  if (!g) return null

  const wrapClass = `db-tooltip-wrap${tipPosition === 'right' ? ' tip-right' : ''}`

  return (
    <span className={wrapClass}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={e => e.stopPropagation()}>
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
