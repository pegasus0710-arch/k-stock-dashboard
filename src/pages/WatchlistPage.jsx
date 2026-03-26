import { useState, useEffect, useCallback, useRef } from 'react'
import StockChartModal from '../components/StockChartModal'
import { useStockPrices } from '../hooks/useKiwoomPrice'
import { fmt, fmtRate, rateColor, getKstStatus } from '../utils/format'
import {
  requestNotificationPermission,
  loadAlerts, saveAlerts, addAlert, removeAlert, checkAlerts
} from '../hooks/usePriceAlert'
import './WatchlistPage.css'

const THEME_COLORS = {
  '반도체·AI':'#2563eb','방산':'#dc2626','조선':'#0d9488',
  '원전·전력':'#d97706','2차전지':'#16a34a','바이오':'#7c3aed',
  '밸류업·금융':'#ea580c','자동차·모빌리티':'#0891b2',
  '친환경·ESG':'#16a34a','화학·소재':'#78716c',
  'IT·소프트웨어':'#6366f1','소비재·유통':'#f59e0b','기타':'#64748b',
}

const PRESET_STOCKS = [
  { name:'삼성전자',         code:'005930', theme:'반도체·AI'    },
  { name:'SK하이닉스',       code:'000660', theme:'반도체·AI'    },
  { name:'한화에어로스페이스',code:'012450', theme:'방산'          },
  { name:'HD현대중공업',     code:'329180', theme:'조선'           },
  { name:'두산에너빌리티',   code:'034020', theme:'원전·전력'     },
  { name:'LG에너지솔루션',   code:'373220', theme:'2차전지'       },
  { name:'셀트리온',         code:'068270', theme:'바이오'         },
  { name:'KB금융',           code:'105560', theme:'밸류업·금융'   },
  { name:'현대차',           code:'005380', theme:'자동차·모빌리티'},
  { name:'카카오',           code:'035720', theme:'IT·소프트웨어' },
]

const STORAGE_KEY = 'kstock_watchlist'
function loadWatchlist() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] } }
function saveWatchlist(list) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch {} }

function getRefreshInterval() {
  const st = getKstStatus()
  if (st === 'open')  return 30000
  if (st === 'after') return 120000
  return 300000
}

// ── 알림 설정 팝업 ──────────────────────────────
function AlertModal({ stock, currentPrice, onClose }) {
  const [alerts,    setAlerts]    = useState(() => loadAlerts().filter(a => a.code === stock.code))
  const [condition, setCondition] = useState('above')
  const [targetVal, setTargetVal] = useState('')
  const [notifPerm, setNotifPerm] = useState(Notification?.permission || 'default')
  const [saving,    setSaving]    = useState(false)

  const CONDITIONS = [
    { k:'above',       label:`목표가 도달 (현재 ${fmt(currentPrice)}원)`, unit:'원' },
    { k:'below',       label:`하한가 터치`,                              unit:'원' },
    { k:'change_up',   label:`등락률 상승 돌파`,                         unit:'%'  },
    { k:'change_down', label:`등락률 하락 이탈`,                         unit:'%'  },
  ]

  const requestPerm = async () => {
    const result = await requestNotificationPermission()
    setNotifPerm(result)
  }

  const handleAdd = () => {
    if (!targetVal) return
    setSaving(true)
    const next = addAlert(stock.code, stock.name, targetVal, condition)
    setAlerts(next.filter(a => a.code === stock.code))
    setTargetVal('')
    setSaving(false)
  }

  const handleRemove = id => {
    removeAlert(id)
    setAlerts(loadAlerts().filter(a => a.code === stock.code))
  }

  const condLabel = { above:'목표가↑', below:'하한가↓', change_up:'등락%↑', change_down:'등락%↓' }
  const unitMap   = { above:'원', below:'원', change_up:'%', change_down:'%' }

  return (
    <div className="wl-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="wl-modal">
        <div className="wl-modal-header">
          <div>
            <div className="wl-modal-title">🔔 {stock.name} 알림 설정</div>
            <div className="wl-modal-sub">{stock.code} · 현재가 {fmt(currentPrice)}원</div>
          </div>
          <button className="wl-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* 알림 권한 */}
        {notifPerm !== 'granted' && (
          <div className="wl-notif-warn">
            <span>🔕 브라우저 알림 권한이 필요합니다</span>
            <button className="wl-notif-btn" onClick={requestPerm}>
              {notifPerm === 'denied' ? '권한 차단됨 (브라우저 설정에서 해제)' : '알림 허용'}
            </button>
          </div>
        )}

        {notifPerm === 'granted' && (
          <div className="wl-notif-ok">✅ 알림 권한 허용됨</div>
        )}

        {/* 알림 추가 */}
        <div className="wl-alert-form">
          <div className="wl-alert-form-title">새 알림 추가</div>
          <div className="wl-alert-row">
            <select className="wl-alert-select"
              value={condition} onChange={e => setCondition(e.target.value)}>
              {CONDITIONS.map(c => <option key={c.k} value={c.k}>{c.label}</option>)}
            </select>
            <div className="wl-alert-input-wrap">
              <input type="number" className="wl-alert-input"
                placeholder={condition.includes('change') ? '예: 3' : `예: ${Math.round((currentPrice || 0) * 1.05).toLocaleString()}`}
                value={targetVal} onChange={e => setTargetVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}/>
              <span className="wl-alert-unit">{unitMap[condition]}</span>
            </div>
            <button className="wl-alert-add-btn" onClick={handleAdd} disabled={!targetVal || saving}>
              + 추가
            </button>
          </div>
        </div>

        {/* 기존 알림 목록 */}
        <div className="wl-alert-list-title">설정된 알림 ({alerts.length}개)</div>
        {alerts.length === 0
          ? <div className="wl-alert-empty">설정된 알림이 없습니다</div>
          : (
            <div className="wl-alert-list">
              {alerts.map(a => (
                <div key={a.id} className={`wl-alert-item ${a.triggered ? 'triggered' : ''}`}>
                  <div className="wl-alert-item-left">
                    <span className={`wl-alert-cond-badge cond-${a.condition}`}>
                      {condLabel[a.condition]}
                    </span>
                    <span className="wl-alert-item-val">
                      {a.condition.includes('change')
                        ? `${a.targetPrice}%`
                        : `${a.targetPrice?.toLocaleString()}원`}
                    </span>
                    {a.triggered && (
                      <span className="wl-alert-triggered">
                        ✅ 발동됨 ({new Date(a.triggeredAt).toLocaleTimeString('ko-KR')})
                      </span>
                    )}
                  </div>
                  <button className="wl-alert-del" onClick={() => handleRemove(a.id)}>✕</button>
                </div>
              ))}
            </div>
          )}

        <div className="wl-alert-footer-note">
          💡 알림은 이 탭이 열려있는 동안 30초마다 가격을 체크합니다
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════
export default function WatchlistPage() {
  const [list,        setList]        = useState(() => loadWatchlist())
  const [addMode,     setAddMode]     = useState(false)
  const [form,        setForm]        = useState({ name:'', code:'', theme:'기타', memo:'' })
  const [filterTheme, setFilter]      = useState('전체')
  const [sortBy,      setSort]        = useState('추가순')
  const [chartStock,  setChartStock]  = useState(null)
  const [alertStock,  setAlertStock]  = useState(null)  // 알림 설정 대상
  const [alerts,      setAlerts]      = useState(() => loadAlerts())
  const [status,      setStatus]      = useState(getKstStatus())

  useEffect(() => saveWatchlist(list), [list])

  // 장 상태 갱신
  useEffect(() => {
    const id = setInterval(() => setStatus(getKstStatus()), 60000)
    return () => clearInterval(id)
  }, [])

  const codes    = list.map(s => s.code)
  const interval = getRefreshInterval()
  const { prices, loading, refresh } = useStockPrices(codes, interval)

  // 가격 갱신 시 알림 체크
  useEffect(() => {
    if (!Object.keys(prices).length) return
    const next = checkAlerts(prices)
    setAlerts(next)
  }, [prices])

  const themes = ['전체', ...Object.keys(THEME_COLORS)]

  const addStock = () => {
    if (!form.name.trim() || !form.code.trim()) return
    setList(prev => [{
      ...form,
      code: form.code.trim().padStart(6,'0'),
      id: Date.now(),
      addedAt: new Date().toLocaleDateString('ko-KR'),
    }, ...prev])
    setForm({ name:'', code:'', theme:'기타', memo:'' })
    setAddMode(false)
  }

  const addPreset = s => {
    if (list.find(i => i.code === s.code)) return
    setList(prev => [{ ...s, memo:'', id:Date.now(), addedAt:new Date().toLocaleDateString('ko-KR') }, ...prev])
  }

  const removeStock = id => {
    const stock = list.find(i => i.id === id)
    // 해당 종목 알림도 제거
    if (stock) {
      const next = loadAlerts().filter(a => a.code !== stock.code)
      saveAlerts(next); setAlerts(next)
    }
    setList(prev => prev.filter(i => i.id !== id))
  }

  const filtered = list
    .filter(i => filterTheme === '전체' || i.theme === filterTheme)
    .sort((a, b) => sortBy === '이름순' ? a.name.localeCompare(b.name) : b.id - a.id)

  // 알림 설정된 종목 수
  const activeAlertCount = alerts.filter(a => !a.triggered).length
  const triggeredCount   = alerts.filter(a =>  a.triggered).length

  const si = statusInfo[status] || statusInfo.closed

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">관심종목</h1>
          <p className="page-sub">
            찜한 종목 모음 · 테마별 분류
            <span className="wl-status-badge" style={{ color:si.color, borderColor:si.color+'40', background:si.color+'12' }}>
              {si.label}
            </span>
            {activeAlertCount > 0 && (
              <span className="wl-alert-count-badge">🔔 {activeAlertCount}개 알림 대기</span>
            )}
            {triggeredCount > 0 && (
              <span className="wl-triggered-badge">✅ {triggeredCount}개 발동</span>
            )}
          </p>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button className="btn-outline" onClick={refresh} disabled={loading}>
            {loading ? '⟳ 조회중' : '⟳ 새로고침'}
          </button>
          <button className="btn-ai" onClick={() => setAddMode(v => !v)}>
            {addMode ? '✕ 닫기' : '+ 종목 추가'}
          </button>
        </div>
      </div>

      <div className="page-body">

        {/* 종목 추가 */}
        {addMode && (
          <div className="card-section">
            <span className="section-title">종목 직접 추가</span>
            <div className="add-form">
              <input className="add-input" placeholder="종목명" value={form.name}
                onChange={e => setForm(p => ({...p, name:e.target.value}))}/>
              <input className="add-input mono" placeholder="종목코드 (예: 005930)" value={form.code}
                onChange={e => setForm(p => ({...p, code:e.target.value}))}/>
              <select className="add-select" value={form.theme}
                onChange={e => setForm(p => ({...p, theme:e.target.value}))}>
                {Object.keys(THEME_COLORS).map(t => <option key={t}>{t}</option>)}
              </select>
              <input className="add-input add-input--memo" placeholder="메모 (선택)" value={form.memo}
                onChange={e => setForm(p => ({...p, memo:e.target.value}))}/>
              <button className="btn-ai" onClick={addStock}>추가</button>
            </div>
            <div className="preset-section">
              <div className="preset-label">빠른 추가 — 주요 종목</div>
              <div className="preset-grid">
                {PRESET_STOCKS.map(s => (
                  <button key={s.code} className="preset-chip" style={{'--tc':THEME_COLORS[s.theme]}}
                    onClick={() => addPreset(s)} disabled={!!list.find(i => i.code === s.code)}>
                    <span className="preset-dot" style={{background:THEME_COLORS[s.theme]}}/>
                    <span className="preset-name">{s.name}</span>
                    {list.find(i => i.code === s.code) && <span className="preset-added">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 필터 */}
        <div className="watch-controls">
          <div className="theme-filter-chips">
            {themes.map(t => (
              <button key={t} className={`filter-chip ${filterTheme === t ? 'active' : ''}`}
                style={filterTheme===t&&t!=='전체'?{background:THEME_COLORS[t]+'18',color:THEME_COLORS[t],borderColor:THEME_COLORS[t]}:{}}
                onClick={() => setFilter(t)}>{t}</button>
            ))}
          </div>
          <select className="sort-select" value={sortBy} onChange={e => setSort(e.target.value)}>
            <option>추가순</option><option>이름순</option>
          </select>
        </div>

        {/* 목록 */}
        {filtered.length === 0 ? (
          <div className="card-section watch-empty">
            <div className="empty-icon">⭐</div>
            <p>{list.length === 0 ? '아직 추가한 종목이 없어요' : '해당 테마의 종목이 없어요'}</p>
            <p className="sub-text">위의 "+ 종목 추가" 버튼으로 관심종목을 등록해보세요</p>
          </div>
        ) : (
          <div className="watch-table-wrap">
            <div className="watch-table">
              <div className="wt-header">
                <div className="wt-col-name">종목명</div>
                <div className="wt-col-price">현재가</div>
                <div className="wt-col-change">등락</div>
                <div className="wt-col-rate">등락률</div>
                <div className="wt-col-volume">거래량</div>
                <div className="wt-col-theme">테마</div>
                <div className="wt-col-actions">링크</div>
                <div className="wt-col-alert">알림</div>
                <div className="wt-col-del"></div>
              </div>

              {filtered.map(s => {
                const p       = prices[s.code]
                const pc      = p ? rateColor(p.changeRate) : '#94a3b8'
                const sign    = p?.changeRate > 0 ? '+' : ''
                const tc      = THEME_COLORS[s.theme] || '#64748b'
                const myAlerts = alerts.filter(a => a.code === s.code && !a.triggered)
                const triggered = alerts.filter(a => a.code === s.code && a.triggered)

                return (
                  <div key={s.id} className="wt-row wt-row-clickable"
                    onClick={() => setChartStock({ name:s.name, code:s.code })}>

                    <div className="wt-col-name">
                      <span className="wt-dot" style={{background:tc}}/>
                      <div>
                        <div className="wt-name">{s.name}</div>
                        <div className="wt-code">{s.code}
                          {s.memo && <span className="wt-memo"> · {s.memo}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="wt-col-price" style={{color:pc, fontWeight:700}}>
                      {p?.price > 0 ? `${fmt(p.price)}원` : <span className="wt-dash">{loading ? '...' : '—'}</span>}
                    </div>
                    <div className="wt-col-change" style={{color:pc}}>
                      {p?.price > 0 ? `${sign}${fmt(p.change)}` : '—'}
                    </div>
                    <div className="wt-col-rate" style={{color:pc, fontWeight:600}}>
                      {p?.price > 0 ? `${sign}${p.changeRate?.toFixed(2)}%` : '—'}
                    </div>
                    <div className="wt-col-volume">
                      {p?.price > 0 ? fmt(p.volume) : '—'}
                    </div>
                    <div className="wt-col-theme">
                      <span className="wt-badge" style={{background:tc+'18', color:tc}}>{s.theme}</span>
                    </div>
                    <div className="wt-col-actions" onClick={e => e.stopPropagation()}>
                      <a className="wt-btn" href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(s.name)}`}
                        target="_blank" rel="noreferrer">공시</a>
                    </div>

                    {/* 알림 버튼 */}
                    <div className="wt-col-alert" onClick={e => e.stopPropagation()}>
                      <button className={`wt-alert-btn ${myAlerts.length ? 'has-alert' : ''} ${triggered.length ? 'triggered' : ''}`}
                        onClick={() => setAlertStock(s)}
                        title={myAlerts.length ? `${myAlerts.length}개 알림 설정됨` : '알림 설정'}>
                        {triggered.length ? '✅' : myAlerts.length ? `🔔${myAlerts.length}` : '🔕'}
                      </button>
                    </div>

                    <div className="wt-col-del" onClick={e => e.stopPropagation()}>
                      <button className="wt-remove" onClick={() => removeStock(s.id)}>✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* 알림 모달 */}
      {alertStock && (
        <AlertModal
          stock={alertStock}
          currentPrice={prices[alertStock.code]?.price || 0}
          onClose={() => { setAlertStock(null); setAlerts(loadAlerts()) }}
        />
      )}

      {chartStock && <StockChartModal stock={chartStock} onClose={() => setChartStock(null)}/>}
    </div>
  )
}

// 상태 정보 (컴포넌트 밖으로 이동)
const statusInfo = {
  open:      { label:'정규장 · 30초 갱신',  color:'#16a34a' },
  after:     { label:'시간외 · 2분 갱신',   color:'#7c3aed' },
  premarket: { label:'장 시작 전 · 5분 갱신',color:'#d97706' },
  holiday:   { label:'휴장일 · 5분 갱신',   color:'#64748b' },
  closed:    { label:'장 마감 · 5분 갱신',  color:'#64748b' },
}
