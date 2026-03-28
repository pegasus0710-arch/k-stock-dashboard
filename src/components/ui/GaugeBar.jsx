// src/components/ui/GaugeBar.jsx
import { useState } from 'react'
import { GAUGE_CONFIG, GUIDE_DATA } from '../../constants/dashboardData'

// ── VIX 반원 게이지 ───────────────────────────────────
function SemiGauge({ price }) {
  const min=0, max=60
  const pct   = Math.min(100, Math.max(0, (price-min)/(max-min)*100))
  const angle = -180 + pct * 1.8   // -180 ~ 0deg
  const toRad = a => a * Math.PI / 180

  // SVG 좌표: cx=60, cy=60, r=46 → viewBox "0 0 120 70"
  const cx=60, cy=60, r=46

  const arcPath = (startDeg, endDeg, color, sw=10) => {
    const s=toRad(startDeg), e=toRad(endDeg)
    const x1=cx+r*Math.cos(s), y1=cy+r*Math.sin(s)
    const x2=cx+r*Math.cos(e), y2=cy+r*Math.sin(e)
    const large = (endDeg-startDeg) > 180 ? 1 : 0
    return <path key={`${startDeg}-${endDeg}`}
      d={`M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)}`}
      fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
  }

  const needleAngle = toRad(angle)
  const nx = cx + (r-6) * Math.cos(needleAngle)
  const ny = cy + (r-6) * Math.sin(needleAngle)

  const level = price<=15 ? {label:'안정', color:'#22c55e'}
              : price<=30 ? {label:'주의', color:'#f59e0b'}
              : {label:'공포', color:'#ef4444'}

  return (
    <div className="db-semi-wrap">
      {/* 배지 — 우측 상단 */}
      <div className="db-semi-badge-row">
        <span className="db-semi-badge"
          style={{background:level.color+'22', color:level.color, borderColor:level.color+'55'}}>
          {price>=30 ? '⚠ ' : '● '}{level.label}
        </span>
      </div>
      {/* 반원 SVG — 숫자 포함 */}
      <svg viewBox="0 0 120 68" width="100%" style={{display:'block'}}>
        {/* 배경 */}
        {arcPath(-180, 0, '#E2E8F0', 10)}
        {/* 구간: 안정(녹)/주의(황)/공포(적) */}
        {arcPath(-180, -120, '#22c55e', 10)}
        {arcPath(-120, -60,  '#f59e0b', 10)}
        {arcPath(-60,  0,    '#ef4444', 10)}
        {/* 바늘 */}
        <line x1={cx} y1={cy} x2={nx.toFixed(2)} y2={ny.toFixed(2)}
          stroke="var(--text-primary,#1e293b)" strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx={cx} cy={cy} r="4" fill="var(--text-primary,#1e293b)"/>
        {/* 현재값 — 반원 중앙 하단 */}
        <text x={cx} y={cy+14} textAnchor="middle"
          fontSize="15" fontWeight="700" fill={level.color}>
          {price.toFixed(2)}
        </text>
      </svg>
      {/* 레이블 */}
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

  // SPREAD → 발산 바 (0 중심, 음수=왼쪽/빨강, 양수=오른쪽/초록)
  if (id === 'SPREAD') {
    const maxAbs = 2.5
    const pct = Math.min(100, (Math.abs(price) / maxAbs) * 50) // 최대 50%씩
    const isPos = price >= 0
    const color = isPos ? '#16a34a' : '#dc2626'
    const status = price >= 0.5 ? { label:'✅ 정상', color:'#16a34a' }
                 : price >= 0   ? { label:'⚡ 주의', color:'#f59e0b' }
                 : { label:'⚠️ 역전', color:'#dc2626' }
    return (
      <div className="db-diverge-wrap">
        <div className="db-diverge-track">
          {/* 왼쪽 절반 (역전 구간) */}
          <div className="db-diverge-half db-diverge-left">
            {!isPos && (
              <div className="db-diverge-bar"
                style={{width:`${pct}%`, background:color, marginLeft:'auto'}}/>
            )}
          </div>
          {/* 중앙 기준선 */}
          <div className="db-diverge-center"/>
          {/* 오른쪽 절반 (정상 구간) */}
          <div className="db-diverge-half db-diverge-right">
            {isPos && (
              <div className="db-diverge-bar"
                style={{width:`${pct}%`, background:color}}/>
            )}
          </div>
        </div>
        <div className="db-diverge-labels">
          <span>역전</span>
          <span style={{color: status.color, fontWeight:700}}>{status.label}</span>
          <span>정상</span>
        </div>
      </div>
    )
  }

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
