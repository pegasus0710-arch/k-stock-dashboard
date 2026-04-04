// src/components/GlobalChartModal.jsx
// 환율 / 해외지수 전용 차트 모달
// - 기간: 1개월 / 3개월 / 6개월 / 1년 / 5년
// - 차트 타입: 캔들 / 라인
// - 데이터: /api/kis?type=global (해외지수) or type=forex-chart (환율)
//   둘 다 Yahoo Finance OHLC 응답

import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from '../firebase'
import { collection, addDoc, Timestamp } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { useUserSettings } from '../hooks/useUserSettings'
import CandleSvg, { fmtNum, fmtDate, fmtDateLong } from './ui/CandleSvg'
import './GlobalChartModal.css'

// ── MA 기본 스타일 ──────────────────────────────────────
const DEFAULT_MA_STYLE = {
  5:   { color: '#f59e0b', width: 1.2 },
  20:  { color: '#a78bfa', width: 2.0 },
  60:  { color: '#22c55e', width: 1.5 },
  120: { color: '#f43f5e', width: 1.2 },
}
const MA_WIDTH_OPTIONS = [1, 1.5, 2, 2.5, 3]

// ── 기간 탭 정의 ─────────────────────────────────────
const RANGES = [
  { label: '1개월', value: '1mo'  },
  { label: '3개월', value: '3mo'  },
  { label: '6개월', value: '6mo'  },
  { label: '1년',   value: '1y'   },
  { label: '5년',   value: '5y'   },
]


// ── 메인 모달 ────────────────────────────────────────
export default function GlobalChartModal({
  // 해외지수: type='global', symbol='SP500', name='S&P 500'
  // 환율:     type='forex',  symbol='KRW',   name='USD/KRW'
  // 국내종목: type='stock',  symbol='005930', name='삼성전자'  ← NEW
  // 국내지수: type='global', symbol='KS11'/'KQ11'  (기존 유지)
  type = 'global',
  symbol,
  name,
  currentPrice,
  changeRate,
  onClose,
}) {
  const { user } = useAuth()
  const [range,         setRange]         = useState('6mo')
  const [candles,       setCandles]       = useState([])
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  // 리사이즈
  const [modalSize,     setModalSize]     = useState({ w: 900, h: null })
  const resizeRef       = useRef(null)
  const startRef        = useRef(null)
  // Firestore 설정 훅
  const { getSetting, setSetting, getDrawings, saveDrawings } = useUserSettings()

  // 드로잉 상태 — Firestore 로드 (비동기, 초기값은 localStorage 폴백)
  const [drawings,      setDrawings]      = useState(() => { try { return JSON.parse(localStorage.getItem(`gcm_draw_${symbol}`)) || [] } catch { return [] } })
  const [drawTool,      setDrawTool]      = useState('none')
  const [drawPhase,     setDrawPhase]     = useState(0)
  const [drawPoint1,    setDrawPoint1]    = useState(null)
  const [mousePos,      setMousePos]      = useState(null)
  const [selectedColor, setSelectedColor] = useState('#f59e0b')

  // MA ON/OFF — 전체 기본 ON
  const [showMA, setShowMA] = useState(
    () => getSetting('chart', 'gcm_ma_show', { 5:true, 20:true, 60:true, 120:true })
  )
  // MA 스타일 (색상/두께) — Firestore 저장
  const [maStyle, setMaStyle] = useState(
    () => getSetting('chart', 'gcm_ma_style', DEFAULT_MA_STYLE)
  )
  // MA 스타일 팝오버 (어느 MA가 열려 있는지)
  const [maPopover, setMaPopover] = useState(null) // 5 | 20 | 60 | 120 | null

  // 메모 상태
  const [memoText,   setMemoText]   = useState('')
  const [memoSaving, setMemoSaving] = useState(false)
  const [memoSaved,  setMemoSaved]  = useState(false)
  const memoRef = useRef(null)

  // Firestore에서 드로잉 비동기 로드
  useEffect(() => {
    getDrawings(`gcm_draw_${symbol}`).then(d => { if (d?.length) setDrawings(d) })
  }, [symbol])

  const onToggleMA = useCallback((period) => {
    setShowMA(prev => {
      const next = { ...prev, [period]: !prev[period] }
      setSetting('chart', 'gcm_ma_show', next)
      return next
    })
  }, [setSetting])

  // MA 스타일 변경 (색상 or 두께) — 즉시 Firestore 저장
  const onMaStyleChange = useCallback((period, key, val) => {
    setMaStyle(prev => {
      const next = { ...prev, [period]: { ...prev[period], [key]: val } }
      setSetting('chart', 'gcm_ma_style', next)
      return next
    })
  }, [setSetting])

  // MA 기본값 초기화
  const onMaStyleReset = useCallback(() => {
    setMaStyle(DEFAULT_MA_STYLE)
    setSetting('chart', 'gcm_ma_style', DEFAULT_MA_STYLE)
  }, [setSetting])

  // 메모 저장 — MemoPage 동일 컬렉션 (users/{uid}/memos)
  const saveMemo = useCallback(async () => {
    const text = memoText.trim()
    if (!text || !user) return
    setMemoSaving(true)
    try {
      const now = Timestamp.fromDate(new Date())
      await addDoc(collection(db, 'users', user.uid, 'memos'), {
        title:      `[차트메모] ${name || symbol}`,
        content:    text,
        category:   '차트메모',
        tags:       ['차트메모', symbol, name].filter(Boolean),
        bgColor:    '#F0FDF4',
        titleColor: '#14532D',
        textColor:  '#1e293b',
        fontSize:   13,
        pinned:     false,
        createdAt:  now,
        updatedAt:  now,
      })
      setMemoText('')
      setMemoSaved(true)
      setTimeout(() => setMemoSaved(false), 2000)
    } catch(e) {
      console.error('[gcm] memo save error:', e)
    } finally {
      setMemoSaving(false)
    }
  }, [memoText, user, symbol, name])

  // ESC 키
  useEffect(() => {
    const h = e => {
      if (e.key !== 'Escape') return
      if (drawPhase > 0) { setDrawPhase(0); setDrawPoint1(null) }
      else if (drawTool !== 'none') setDrawTool('none')
      else onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, drawTool, drawPhase])

  // 스크롤 막기
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // 데이터 로드
  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    setError('')

    // KOSPI(KS11)/KOSDAQ(KQ11) → 키움 index-chart API (실시간, 당일 반영)
    // 국내종목(stock) → 키움 stock-chart API
    // 그 외 → Yahoo Finance (/api/kis)
    const isKiwoom = symbol === 'KS11' || symbol === 'KQ11'
    const isStock  = type === 'stock'
    const inds_cd  = symbol === 'KS11' ? '001' : '101'

    // 키움 기간 매핑 (지수/종목 공용)
    const kiwoomPeriodMap = {
      '1mo': { period:'day',  cnt:22  },
      '3mo': { period:'day',  cnt:65  },
      '6mo': { period:'day',  cnt:130 },
      '1y':  { period:'week', cnt:52  },
      '5y':  { period:'week', cnt:260 },
    }

    let url, kiwoomBody = null
    if (isKiwoom) {
      const { period } = kiwoomPeriodMap[range] || kiwoomPeriodMap['6mo']
      url = `/api/kiwoom?type=index-chart&inds_cd=${inds_cd}&period=${period}`
    } else if (isStock) {
      // 국내 개별종목 — stock-chart API
      const { period } = kiwoomPeriodMap[range] || kiwoomPeriodMap['6mo']
      url = `/api/kiwoom?type=stock-chart&code=${symbol}&period=${period}`
    } else if (type === 'forex') {
      url = `/api/kis?type=forex-chart&pair=${symbol}&range=${range}`
    } else {
      url = `/api/kis?type=global&symbol=${symbol}&range=${range}`
    }

    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        let candles = data.candles || []
        // 키움 응답(지수/종목) — time → date 정규화
        if (isKiwoom || isStock) {
          const { cnt } = kiwoomPeriodMap[range] || kiwoomPeriodMap['6mo']
          candles = candles.slice(-cnt).map(c => ({
            ...c,
            date:  c.time || c.date || '',
            open:  Number(c.open  || 0),
            high:  Number(c.high  || 0),
            low:   Number(c.low   || 0),
            close: Number(c.close || 0),
            volume: Number(c.volume || c.vol || 0),
          })).filter(c => c.close > 0)
        }
        setCandles(candles)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [type, symbol, range])

  // 드로잉 저장 — Firestore + localStorage 동기화
  useEffect(() => {
    saveDrawings(`gcm_draw_${symbol}`, drawings)
  }, [symbol, drawings])

  // 등락율 — prop 대신 로드된 캔들 마지막 2봉으로 계산
  const computedRate = candles.length >= 2
    ? (candles[candles.length-1].close - candles[candles.length-2].close)
      / candles[candles.length-2].close * 100
    : null
  const rateColor = computedRate == null ? '#94a3b8' : computedRate > 0 ? '#DC2626' : computedRate < 0 ? '#1D4ED8' : '#94a3b8'

  // 드로잉 클릭 핸들러
  const handleChartClick = useCallback((coords) => {
    if (drawTool === 'none') return
    const maxBars = range==='5y'?60:range==='1y'?52:range==='6mo'?130:range==='3mo'?65:30
    const data = candles.slice(-maxBars)
    if (drawTool === 'hline') {
      setDrawings(p => [...p, { type:'hline', price:coords.price, color:selectedColor }])
      return
    }
    if (drawTool === 'vline') {
      setDrawings(p => [...p, { type:'vline', idx:coords.idx, date:data[coords.idx]?.date, color:selectedColor }])
      return
    }
    if (drawPhase === 0) { setDrawPoint1(coords); setDrawPhase(1) }
    else {
      const d = drawTool === 'trendline'
        ? { type:'trendline', idx1:drawPoint1.idx, price1:drawPoint1.price, idx2:coords.idx, price2:coords.price, color:selectedColor }
        : { type:'rect',      idx1:drawPoint1.idx, price1:drawPoint1.price, idx2:coords.idx, price2:coords.price, color:selectedColor }
      setDrawings(p => [...p, d])
      setDrawPhase(0); setDrawPoint1(null)
    }
  }, [drawTool, drawPhase, drawPoint1, candles, range, selectedColor])

  const handleMouseMove = useCallback((c) => setMousePos(c), [])
  const handleLeave     = useCallback(() => setMousePos(null), [])

  // 리사이즈 핸들러 (우하단 모서리 드래그)
  const onResizeMouseDown = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const startW = resizeRef.current?.offsetWidth  || 900
    const startH = resizeRef.current?.offsetHeight || 600
    const onMove = (ev) => {
      setModalSize({
        w: Math.max(600, Math.min(window.innerWidth  - 32, startW + ev.clientX - startX)),
        h: Math.max(420, Math.min(window.innerHeight - 32, startH + ev.clientY - startY)),
      })
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [])

  return (
    <div className="gcm-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="gcm-modal" ref={resizeRef}
        style={{ width: modalSize.w, ...(modalSize.h ? { height: modalSize.h } : {}) }}>

        {/* 헤더 */}
        <div className="gcm-header">
          <div className="gcm-title-row">
            <span className="gcm-name">{name}</span>
            <span className="gcm-price">
              {fmtNum(currentPrice, currentPrice > 100 ? 2 : 4)}
            </span>
            {computedRate != null && (
              <span className="gcm-rate" style={{ color: rateColor }}>
                ({computedRate >= 0 ? '+' : ''}{fmtNum(computedRate, 2)}%)
              </span>
            )}
          </div>

          <div className="gcm-controls">
            {/* 기간 탭 */}
            <div className="gcm-range-tabs">
              {RANGES.map(r => (
                <button
                  key={r.value}
                  className={`gcm-range-btn ${range === r.value ? 'active' : ''}`}
                  onClick={() => setRange(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* 메모 인풋 — 기간 탭 옆 */}
            <div className="gcm-memo-bar">
              <input
                ref={memoRef}
                className="gcm-memo-input"
                placeholder="📝 차트 메모 입력 후 Enter..."
                value={memoText}
                onChange={e => setMemoText(e.target.value)}
                onKeyDown={e => { if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); saveMemo() }}}
                disabled={memoSaving}
              />
              {memoSaved && <span className="gcm-memo-ok">✓ 저장됨</span>}
            </div>

            <button className="gcm-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* 드로잉 툴바 */}
        <div className="gcm-draw-toolbar">
          <div className="gcm-draw-tools">
            {[
              { id:'none',      label:'🖱️ 선택',  title:'기본 모드' },
              { id:'trendline', label:'📏 추세선', title:'두 점 클릭 → 추세선' },
              { id:'hline',     label:'━ 수평선', title:'클릭한 가격에 수평선' },
              { id:'vline',     label:'┃ 수직선', title:'클릭한 날짜에 수직선' },
              { id:'rect',      label:'▭ 사각형', title:'두 점 클릭 → 사각형' },
            ].map(t => (
              <button key={t.id}
                className={`gcm-draw-btn ${drawTool === t.id ? 'active' : ''}`}
                title={t.title}
                onClick={() => { setDrawTool(t.id); setDrawPhase(0); setDrawPoint1(null) }}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="gcm-color-picks">
            {['#f59e0b','#3b82f6','#22c55e','#ef4444','#a78bfa'].map(c => (
              <button key={c}
                className={`gcm-color-dot ${selectedColor === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => setSelectedColor(c)}/>
            ))}
          </div>
          <div className="gcm-draw-actions">
            {/* MA 이동평균선 토글 + 스타일 커스터마이징 */}
            <div className="gcm-ma-toggles" style={{position:'relative'}}>
              {[
                { p:5,   label:'MA5'   },
                { p:20,  label:'MA20'  },
                { p:60,  label:'MA60'  },
                { p:120, label:'MA120' },
              ].map(({ p, label }) => {
                const style = maStyle[p] || DEFAULT_MA_STYLE[p]
                return (
                  <div key={p} style={{position:'relative'}}>
                    <button
                      className={`gcm-ma-toggle ${showMA[p] ? 'active' : ''}`}
                      style={{ '--ma-color': style.color, borderWidth: showMA[p] ? style.width+'px' : '1.5px' }}
                      title={`${label} 클릭=ON/OFF | 우클릭=스타일 설정`}
                      onClick={() => onToggleMA(p)}
                      onContextMenu={e => { e.preventDefault(); setMaPopover(maPopover===p?null:p) }}
                    >
                      ● {label}
                    </button>
                    {/* 스타일 팝오버 */}
                    {maPopover === p && (
                      <div className="gcm-ma-popover" onMouseLeave={() => setMaPopover(null)}>
                        <div className="gcm-ma-pop-row">
                          <span>색상</span>
                          <input type="color" value={style.color}
                            onChange={e => onMaStyleChange(p, 'color', e.target.value)}
                            style={{width:32,height:22,border:'none',cursor:'pointer',borderRadius:4}}/>
                        </div>
                        <div className="gcm-ma-pop-row">
                          <span>두께</span>
                          <div style={{display:'flex',gap:3}}>
                            {MA_WIDTH_OPTIONS.map(w => (
                              <button key={w}
                                className={`gcm-ma-pop-w ${style.width===w?'active':''}`}
                                onClick={() => onMaStyleChange(p, 'width', w)}>
                                {w}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <button className="gcm-draw-act-btn" onClick={onMaStyleReset}
                title="MA 색상/두께 초기화" style={{fontSize:10,padding:'3px 7px'}}>
                초기화
              </button>
            </div>
            <button className="gcm-draw-act-btn"
              disabled={drawings.length === 0}
              title="마지막 드로잉 삭제"
              onClick={() => { setDrawings(p => p.slice(0,-1)); setDrawPhase(0); setDrawPoint1(null) }}>
              ↩ 실행취소
            </button>
            <button className="gcm-draw-act-btn gcm-draw-clear"
              disabled={drawings.length === 0}
              title="전체 초기화"
              onClick={() => { setDrawings([]); setDrawPhase(0); setDrawPoint1(null) }}>
              🗑 초기화
            </button>
            {drawings.length > 0 && (
              <span className="gcm-draw-count">{drawings.length}개 저장됨</span>
            )}
          </div>
        </div>

        {/* 차트 영역 */}
        <div className="gcm-body">
          {loading && (
            <div className="gcm-loading">
              <div className="gcm-spinner"/>
              <span>데이터 로딩 중...</span>
            </div>
          )}
          {error && !loading && (
            <div className="gcm-error">⚠️ {error}</div>
          )}
          {!loading && !error && (
            <CandleSvg candles={candles} chartType="candle" range={range}
              drawings={drawings} drawTool={drawTool}
              drawPhase={drawPhase} drawPoint1={drawPoint1}
              mousePos={mousePos} selectedColor={selectedColor}
              showMA={showMA} onToggleMA={onToggleMA}
              maStyle={maStyle}
              onChartClick={handleChartClick}
              onChartMouseMove={handleMouseMove}
              onChartMouseLeave={handleLeave}
            />
          )}
        </div>

        <div className="gcm-footer">
          <span>
            데이터: {
              (symbol==='KS11'||symbol==='KQ11'||type==='stock')
                ? '키움증권 REST API'
                : 'Yahoo Finance'
            } · {candles.length}개 봉 · 캔들 차트
            {drawings.length > 0 && ` · ✏️ 드로잉 ${drawings.length}개 저장됨`}
          </span>
          <span className="gcm-resize-handle" onMouseDown={onResizeMouseDown} title="드래그해서 크기 조절">⤡</span>
        </div>
      </div>
    </div>
  )
}
