// src/components/ui/ChartPanel.jsx
// 메인차트(HeroChart) + 팝업차트(GlobalChartModal) 공용 차트 패널
// 드로잉 툴바 + MA 토글 + 기간 탭 + CandleSvg 통합
import { useState, useCallback, useEffect } from 'react'
import CandleSvg from './CandleSvg'
import { useUserSettings } from '../../hooks/useUserSettings'

const DRAW_TOOLS = [
  { id:'none',      label:'🖱️',  title:'선택 모드' },
  { id:'trendline', label:'📏',  title:'추세선' },
  { id:'hline',     label:'━',   title:'수평선' },
  { id:'vline',     label:'┃',   title:'수직선' },
  { id:'rect',      label:'▭',   title:'사각형' },
]
const COLORS = ['#f59e0b','#3b82f6','#22c55e','#ef4444','#a78bfa']
const MA_LIST = [
  { p:5,   color:'#f59e0b', label:'MA5'   },
  { p:20,  color:'#a78bfa', label:'MA20'  },
  { p:60,  color:'#22c55e', label:'MA60'  },
  { p:120, color:'#f43f5e', label:'MA120' },
]

export default function ChartPanel({
  candles = [],
  range,
  chartType = 'line',
  accent = '#2563eb',
  drawKey = 'default',       // 드로잉 저장 키 (종목코드/심볼)
  showToolbar = true,        // 툴바 표시 여부
  W = 820, H = 300,
  PAD,
}) {
  const { getSetting, setSetting, getDrawings, saveDrawings } = useUserSettings()

  // ── MA 설정 (Firestore/localStorage) ────────────
  const [showMA, setShowMA] = useState(
    () => getSetting('chart', 'gcm_ma_settings', { 5:true, 20:true, 60:true, 120:true })
  )
  const toggleMA = useCallback((p) => {
    setShowMA(prev => {
      const next = { ...prev, [p]: !prev[p] }
      setSetting('chart', 'gcm_ma_settings', next)
      return next
    })
  }, [setSetting])

  // ── 드로잉 상태 ─────────────────────────────────
  const [drawings,   setDrawings]   = useState([])
  const [drawTool,   setDrawTool]   = useState('none')
  const [drawPhase,  setDrawPhase]  = useState(0)
  const [drawPoint1, setDrawPoint1] = useState(null)
  const [mousePos,   setMousePos]   = useState(null)
  const [selColor,   setSelColor]   = useState('#f59e0b')

  // Firestore에서 드로잉 로드
  useEffect(() => {
    getDrawings(`panel_draw_${drawKey}`).then(d => { if (d?.length) setDrawings(d) })
  }, [drawKey])

  const saveD = useCallback((next) => {
    setDrawings(next)
    saveDrawings(`panel_draw_${drawKey}`, next)
  }, [drawKey, saveDrawings])

  // ── 차트 이벤트 핸들러 ──────────────────────────
  const handleChartClick = useCallback((coords) => {
    if (drawTool === 'none') return
    if (drawTool === 'hline') {
      saveD([...drawings, { type:'hline', price: coords.price, color: selColor }])
      return
    }
    if (drawTool === 'vline') {
      saveD([...drawings, { type:'vline', idx: coords.idx, color: selColor }])
      return
    }
    if (drawTool === 'trendline' || drawTool === 'rect') {
      if (drawPhase === 0) {
        setDrawPoint1(coords); setDrawPhase(1)
      } else {
        saveD([...drawings, {
          type: drawTool,
          idx1: drawPoint1.idx, price1: drawPoint1.price,
          idx2: coords.idx,     price2: coords.price,
          color: selColor
        }])
        setDrawPhase(0); setDrawPoint1(null)
      }
    }
  }, [drawTool, drawPhase, drawPoint1, drawings, selColor, saveD])

  const handleMouseMove = useCallback((coords) => setMousePos(coords), [])
  const handleLeave     = useCallback(() => setMousePos(null), [])

  // ESC 취소
  useEffect(() => {
    const h = e => {
      if (e.key !== 'Escape') return
      if (drawPhase > 0) { setDrawPhase(0); setDrawPoint1(null) }
      else setDrawTool('none')
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [drawPhase])

  const hint = drawTool !== 'none'
    ? (drawPhase === 0 ? '1번째 점 클릭' : '2번째 점 클릭')
    : null

  return (
    <div className="chart-panel">
      {showToolbar && (
        <div className="chart-panel-toolbar">
          {/* MA 토글 */}
          <div className="chart-panel-ma">
            {MA_LIST.map(({ p, color, label }) => (
              <button key={p}
                className={`cp-ma-btn ${showMA[p] ? 'active' : ''}`}
                style={{ '--ma-color': color }}
                title={label}
                onClick={() => toggleMA(p)}>
                ● {label}
              </button>
            ))}
          </div>

          {/* 구분선 */}
          <div className="chart-panel-sep"/>

          {/* 드로잉 툴 */}
          <div className="chart-panel-draw-tools">
            {DRAW_TOOLS.map(t => (
              <button key={t.id}
                className={`cp-draw-btn ${drawTool === t.id ? 'active' : ''}`}
                title={t.title}
                onClick={() => { setDrawTool(t.id); setDrawPhase(0); setDrawPoint1(null) }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* 색상 선택 */}
          <div className="chart-panel-colors">
            {COLORS.map(c => (
              <button key={c}
                className={`cp-color-dot ${selColor === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => setSelColor(c)}/>
            ))}
          </div>

          {/* 실행취소 / 초기화 */}
          <div className="chart-panel-actions">
            <button className="cp-act-btn"
              disabled={!drawings.length}
              title="실행취소"
              onClick={() => { saveD(drawings.slice(0,-1)); setDrawPhase(0); setDrawPoint1(null) }}>
              ↩
            </button>
            <button className="cp-act-btn cp-act-clear"
              disabled={!drawings.length}
              title="초기화"
              onClick={() => { saveD([]); setDrawPhase(0); setDrawPoint1(null) }}>
              🗑
            </button>
            {drawings.length > 0 && (
              <span className="cp-draw-count">{drawings.length}개</span>
            )}
          </div>

          {/* 힌트 */}
          {hint && <span className="cp-hint">{hint}</span>}
        </div>
      )}

      <CandleSvg
        candles={candles}
        range={range}
        chartType={chartType}
        accent={accent}
        showMA={showMA}
        drawings={drawings}
        drawTool={drawTool}
        drawPhase={drawPhase}
        drawPoint1={drawPoint1}
        mousePos={mousePos}
        selectedColor={selColor}
        onChartClick={handleChartClick}
        onChartMouseMove={handleMouseMove}
        onChartMouseLeave={handleLeave}
        W={W} H={H}
        PAD={PAD}
      />
    </div>
  )
}
