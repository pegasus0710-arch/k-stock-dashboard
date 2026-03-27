import { useState, useEffect, useCallback } from 'react'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { doc, getDoc, setDoc, collection, getDocs, orderBy, query, limit } from 'firebase/firestore'
import ChartModal from '../components/ChartModal'
import { fmt, fmtRate, rateColor } from '../utils/format'
import './PortfolioPage.css'

// ── Firestore 수익률 히스토리 키 ─────────────────
const FS_RETURNS = 'portfolio_returns'  // Firestore collection
const LS_LAST_SAVE = 'pf_last_save_date'

function todayStr8() { return new Date().toISOString().slice(0,10).replace(/-/g,'') }

// Firestore에 오늘 수익률 저장 (하루 1회)
async function saveTodayReturn(uid, returnData, holdings) {
  if (!uid) return
  try {
    const today = todayStr8()
    const lastSave = localStorage.getItem(LS_LAST_SAVE)
    if (lastSave === today) return  // 이미 오늘 저장됨
    
    const docRef = doc(db, 'users', uid, FS_RETURNS, today)
    await setDoc(docRef, {
      date:        today,
      prft_rt:     Number(returnData.prft_rt)    || 0,   // 수익률
      evltv_prft:  Number(returnData.evltv_prft) || 0,   // 평가손익
      tot_evlt_amt:Number(returnData.tot_evlt_amt|| holdings?.tot_evlt_amt || 0),
      tot_pur_amt: Number(returnData.tot_pur_amt || holdings?.tot_pur_amt  || 0),
      invt_bsamt:  Number(returnData.invt_bsamt) || 0,
      savedAt:     new Date().toISOString(),
    })
    localStorage.setItem(LS_LAST_SAVE, today)
    console.log('[Portfolio] 수익률 저장 완료:', today)
  } catch (e) {
    console.error('[Portfolio] 수익률 저장 실패:', e)
  }
}

// Firestore에서 수익률 히스토리 불러오기
async function loadReturnHistory(uid, days = 90) {
  if (!uid) return []
  try {
    const colRef = collection(db, 'users', uid, FS_RETURNS)
    const q      = query(colRef, orderBy('date', 'asc'), limit(days))
    const snap   = await getDocs(q)
    return snap.docs.map(d => d.data())
  } catch (e) {
    console.error('[Portfolio] 히스토리 로드 실패:', e)
    return []
  }
}

// ── 유틸 ─────────────────────────────────────
function abs(n) { return Math.abs(Number(n) || 0) }
function sign(n) { return Number(n) >= 0 ? '+' : '' }

// ── 미니 막대 차트 (보유비중) ─────────────────
function PossBar({ pct, color }) {
  return (
    <div className="pf-possbar-wrap">
      <div className="pf-possbar-fill" style={{ width: `${Math.min(100, abs(pct))}%`, background: color }}/>
      <span className="pf-possbar-label">{abs(pct).toFixed(1)}%</span>
    </div>
  )
}

// ── SVG 파이차트 ─────────────────────────────
function PieChart({ holdings }) {
  if (!holdings?.length) return null
  const total = holdings.reduce((s, h) => s + abs(h.evlt_amt), 0)
  if (total <= 0) return null

  const COLORS = ['#2563eb','#ef4444','#16a34a','#d97706','#7c3aed','#0d9488','#ea580c','#0891b2','#78716c','#6366f1']
  let cum = 0
  const slices = holdings.slice(0, 10).map((h, i) => {
    const pct   = abs(h.evlt_amt) / total
    const start = cum
    cum += pct
    return { ...h, pct, start, color: COLORS[i % COLORS.length] }
  })

  const W = 200, R = 80, CX = W/2, CY = W/2
  function arc(start, end) {
    if (end - start >= 1) end = 0.9999
    const s = { x: CX + R * Math.cos(2*Math.PI*start - Math.PI/2), y: CY + R * Math.sin(2*Math.PI*start - Math.PI/2) }
    const e = { x: CX + R * Math.cos(2*Math.PI*end   - Math.PI/2), y: CY + R * Math.sin(2*Math.PI*end   - Math.PI/2) }
    const large = (end - start) > 0.5 ? 1 : 0
    return `M ${CX} ${CY} L ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${R} ${R} 0 ${large} 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)} Z`
  }

  return (
    <div className="pf-pie-wrap">
      <svg viewBox={`0 0 ${W} ${W}`} className="pf-pie-svg">
        {slices.map((s, i) => (
          <path key={i} d={arc(s.start, s.start + s.pct)} fill={s.color} stroke="white" strokeWidth="1.5" opacity="0.9">
            <title>{s.stk_nm}: {(s.pct*100).toFixed(1)}%</title>
          </path>
        ))}
        <circle cx={CX} cy={CY} r={R*0.5} fill="white"/>
        <text x={CX} y={CY-6} textAnchor="middle" fontSize="11" fill="#475569" fontWeight="600">보유</text>
        <text x={CX} y={CY+10} textAnchor="middle" fontSize="11" fill="#475569" fontWeight="600">비중</text>
      </svg>
      <div className="pf-pie-legend">
        {slices.map((s, i) => (
          <div key={i} className="pf-pie-leg-item">
            <span className="pf-pie-dot" style={{ background: s.color }}/>
            <span className="pf-pie-leg-name">{s.stk_nm}</span>
            <span className="pf-pie-leg-pct">{(s.pct*100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── SVG 수익률 라인차트 ──────────────────────
function ReturnChart({ data }) {
  if (!data?.length) return (
    <div className="pf-chart-empty">
      <p>📅 일별 수익률 데이터가 아직 없습니다</p>
      <p style={{fontSize:'12px',color:'#94a3b8',marginTop:6}}>계좌 조회 후 자동 저장됩니다 (하루 1회)</p>
    </div>
  )

  const W = 700, H = 200
  const PAD = { top:20, right:20, bottom:36, left:60 }
  const cW  = W - PAD.left - PAD.right
  const cH  = H - PAD.top  - PAD.bottom

  const vals  = data.map(d => Number(d.prft_rt) || 0)
  const maxV  = Math.max(...vals,  0.5)
  const minV  = Math.min(...vals, -0.5)
  const range = maxV - minV || 1
  const toY   = v => PAD.top + cH - ((v - minV) / range) * cH
  const toX   = i => PAD.left + (i / Math.max(data.length - 1, 1)) * cW
  const pts   = data.map((d, i) => `${toX(i).toFixed(1)},${toY(Number(d.prft_rt)||0).toFixed(1)}`).join(' ')
  const isUp  = vals[vals.length-1] >= 0
  const lc    = isUp ? '#ef4444' : '#3b82f6'
  const step  = Math.max(1, Math.ceil(data.length / 8))
  const yTicks = Array.from({length:5}, (_, i) => minV + (range / 4) * i)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="pf-return-svg">
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W-PAD.right} y1={toY(v)} y2={toY(v)} stroke="#f1f5f9" strokeWidth="1"/>
            <text x={PAD.left-6} y={toY(v)+4} textAnchor="end" fontSize="10" fill="#94a3b8">{v.toFixed(1)}%</text>
          </g>
        ))}
        {/* 0% 기준선 */}
        {minV < 0 && maxV > 0 && (
          <line x1={PAD.left} x2={W-PAD.right} y1={toY(0)} y2={toY(0)} stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="4,4"/>
        )}
        {/* X축 날짜 */}
        {data.filter((_,i) => i % step === 0).map((d, i) => {
          const idx = data.indexOf(d)
          return (
            <text key={i} x={toX(idx)} y={H-8} textAnchor="middle" fontSize="9" fill="#94a3b8">
              {String(d.date||'').slice(4,8).replace(/(\d{2})(\d{2})/,'$1/$2')}
            </text>
          )
        })}
        <defs>
          <linearGradient id="pf-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lc} stopOpacity="0.25"/>
            <stop offset="100%" stopColor={lc} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={`${PAD.left},${toY(minV)} ${pts} ${W-PAD.right},${toY(minV)}`} fill="url(#pf-grad)"/>
        <polyline points={pts} fill="none" stroke={lc} strokeWidth="2"/>
        {/* 마지막 포인트 강조 */}
        {data.length > 0 && (
          <circle cx={toX(data.length-1)} cy={toY(vals[vals.length-1])} r="4" fill={lc} stroke="white" strokeWidth="2"/>
        )}
      </svg>
      {/* 데이터 개수 표시 */}
      <div style={{fontSize:'11px',color:'#94a3b8',textAlign:'right',marginTop:4}}>
        {data.length}일 데이터 · 최근 저장: {String(data[data.length-1]?.date||'').replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3')}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════
export default function PortfolioPage() {
  const { user } = useAuth()
  const [holdings,    setHoldings]    = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [returnData,  setReturnData]  = useState(null)
  const [history,     setHistory]     = useState([])       // 일별 Firestore 히스토리
  const [histLoading, setHistLoading] = useState(false)
  const [retLoading,  setRetLoading]  = useState(false)
  const [retPeriod,   setRetPeriod]   = useState('3m')
  const [activeTab,   setActiveTab]   = useState('holdings')  // holdings | chart | returns
  const [chartStock,  setChartStock]  = useState(null)
  const [sortBy,      setSortBy]      = useState('evlt_amt')
  const [sortDir,     setSortDir]     = useState('desc')

  // 보유종목 로드
  const loadHoldings = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/kiwoom?type=account-holdings')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setHoldings(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  // 수익률 API 조회 + Firestore 저장
  const loadReturns = useCallback(async (period = retPeriod) => {
    setRetLoading(true)
    try {
      const days = { '1m':30, '3m':90, '6m':180, '1y':365 }[period] || 90
      const to   = new Date()
      const fr   = new Date(Date.now() - days * 86400000)
      const fmt8 = d => d.toISOString().slice(0,10).replace(/-/g,'')
      const res  = await fetch(`/api/kiwoom?type=account-returns&fr_dt=${fmt8(fr)}&to_dt=${fmt8(to)}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setReturnData([data])
      // 오늘 수익률 Firestore 자동 저장
      if (user?.uid) {
        await saveTodayReturn(user.uid, { ...data, tot_evlt_amt: holdings?.tot_evlt_amt, tot_pur_amt: holdings?.tot_pur_amt }, holdings)
      }
    } catch (e) { console.error(e) }
    finally { setRetLoading(false) }
  }, [retPeriod, user?.uid])

  // Firestore 일별 히스토리 로드
  const loadHistory = useCallback(async () => {
    if (!user?.uid) return
    setHistLoading(true)
    try {
      const days = { '1m':30, '3m':90, '6m':180, '1y':365 }[retPeriod] || 90
      const hist = await loadReturnHistory(user.uid, days)
      setHistory(hist)
    } catch (e) { console.error(e) }
    finally { setHistLoading(false) }
  }, [user?.uid, retPeriod])

  useEffect(() => { loadHoldings() }, [])
  useEffect(() => {
    if (activeTab === 'returns') {
      loadReturns(retPeriod)
      loadHistory()
    }
  }, [activeTab, retPeriod])

  const h = holdings  // eslint-disable-line
  const sorted = [...(h?.holdings || [])].sort((a, b) => {
    const d = sortDir === 'desc' ? -1 : 1
    return (abs(a[sortBy]) - abs(b[sortBy])) * d * -1
  })

  const toggleSort = col => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }
  const si = col => sortBy === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''

  const TABS = [
    { id:'holdings', label:'📋 보유종목' },
    { id:'chart',    label:'🥧 포트폴리오 비중' },
    { id:'returns',  label:'📈 수익률 현황' },
  ]

  const PERIODS = [
    { k:'1m', label:'1개월' }, { k:'3m', label:'3개월' },
    { k:'6m', label:'6개월' }, { k:'1y', label:'1년'   },
  ]

  return (
    <div className="pf-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">포트폴리오</h1>
          <p className="page-sub">보유종목 · 손익 현황 · 수익률 추이</p>
        </div>
        <button className="btn-outline" onClick={loadHoldings} disabled={loading}>
          {loading ? '⟳ 로딩중' : '⟳ 새로고침'}
        </button>
      </div>

      {error && (
        <div className="pf-error">
          ⚠️ {error}
          <div className="pf-error-sub">키움 EC2 서버가 실행 중인지 확인해주세요 (3.38.37.78:3001)</div>
        </div>
      )}

      {/* 요약 카드 */}
      {h && (
        <div className="pf-summary-grid">
          {[
            { label:'총 평가금액',   value:`${fmt(h.tot_evlt_amt)}원`,   color: null          },
            { label:'총 매입금액',   value:`${fmt(h.tot_pur_amt)}원`,    color: null          },
            { label:'총 평가손익',   value:`${sign(h.tot_evlt_pl)}${fmt(h.tot_evlt_pl)}원`, color: rateColor(h.tot_evlt_pl) },
            { label:'총 수익률',     value:`${sign(h.tot_prft_rt)}${Number(h.tot_prft_rt).toFixed(2)}%`, color: rateColor(h.tot_prft_rt) },
            { label:'추정예탁자산',  value:`${fmt(h.prsm_dpst_aset_amt)}원`, color: null     },
          ].map(item => (
            <div key={item.label} className="pf-summary-card">
              <div className="pf-summary-label">{item.label}</div>
              <div className="pf-summary-value" style={{ color: item.color || '#0f172a' }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 탭 */}
      <div className="pf-tabs">
        {TABS.map(t => <button key={t.id} className={`pf-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>)}
      </div>

      {/* ── 보유종목 탭 ── */}
      {activeTab === 'holdings' && (
        <div className="pf-section">
          {loading && <div className="pf-loading">⟳ 보유종목 불러오는 중...</div>}
          {!loading && !h && !error && (
            <div className="pf-empty">
              <p>보유종목 데이터를 불러와주세요</p>
              <button className="pf-btn-primary" onClick={loadHoldings}>📡 계좌 조회</button>
            </div>
          )}
          {!loading && sorted.length > 0 && (
            <div className="pf-table-wrap">
              <div className="pf-table">
                <div className="pf-th">
                  <div>종목명</div>
                  <div className="sortable" onClick={() => toggleSort('rmnd_qty')}>수량{si('rmnd_qty')}</div>
                  <div>매입가</div>
                  <div>현재가</div>
                  <div className="sortable" onClick={() => toggleSort('evltv_prft')}>평가손익{si('evltv_prft')}</div>
                  <div className="sortable" onClick={() => toggleSort('prft_rt')}>수익률{si('prft_rt')}</div>
                  <div className="sortable" onClick={() => toggleSort('evlt_amt')}>평가금액{si('evlt_amt')}</div>
                  <div>보유비중</div>
                </div>
                {sorted.map((s, i) => {
                  const pc   = rateColor(s.prft_rt)
                  const plc  = rateColor(s.evltv_prft)
                  return (
                    <div key={i} className="pf-row" onClick={() => setChartStock({ name: s.stk_nm, code: s.stk_cd })}>
                      <div className="pf-col-name">
                        <div className="pf-stock-name">{s.stk_nm}</div>
                        <div className="pf-stock-code">{s.stk_cd}</div>
                      </div>
                      <div className="pf-mono">{fmt(s.rmnd_qty)}주</div>
                      <div className="pf-mono">{fmt(s.pur_pric)}원</div>
                      <div className="pf-mono" style={{ color: rateColor(s.cur_prc - s.pur_pric) }}>{fmt(s.cur_prc)}원</div>
                      <div className="pf-mono" style={{ color: plc, fontWeight: 600 }}>
                        {sign(s.evltv_prft)}{fmt(s.evltv_prft)}원
                      </div>
                      <div className="pf-mono" style={{ color: pc, fontWeight: 700 }}>
                        {sign(s.prft_rt)}{Number(s.prft_rt).toFixed(2)}%
                      </div>
                      <div className="pf-mono">{fmt(s.evlt_amt)}원</div>
                      <div><PossBar pct={s.poss_rt} color={rateColor(s.prft_rt)}/></div>
                    </div>
                  )
                })}
              </div>
              {sorted.length === 0 && <div className="pf-empty-row">보유종목 없음</div>}
            </div>
          )}
        </div>
      )}

      {/* ── 파이차트 탭 ── */}
      {activeTab === 'chart' && (
        <div className="pf-section">
          {!h ? (
            <div className="pf-empty">
              <p>먼저 보유종목을 조회해주세요</p>
              <button className="pf-btn-primary" onClick={() => { loadHoldings(); setActiveTab('holdings') }}>📡 계좌 조회</button>
            </div>
          ) : (
            <>
              <div className="pf-chart-title">📊 보유 비중 (평가금액 기준)</div>
              <PieChart holdings={h.holdings}/>
            </>
          )}
        </div>
      )}

      {/* ── 수익률 탭 ── */}
      {activeTab === 'returns' && (
        <div className="pf-section">
          <div className="pf-period-bar">
            {PERIODS.map(p => (
              <button key={p.k} className={`pf-period-btn ${retPeriod === p.k ? 'active' : ''}`}
                onClick={() => setRetPeriod(p.k)}>{p.label}</button>
            ))}
          </div>
          {retLoading && <div className="pf-loading">⟳ 수익률 데이터 불러오는 중...</div>}
          {!retLoading && returnData?.length > 0 && (() => {
            const d = returnData[0]
            const pc = rateColor(d.prft_rt)
            return (
              <div className="pf-return-wrap">
                <div className="pf-return-summary-grid">
                  {[
                    { label:'기간 수익률',  value:`${sign(d.prft_rt)}${Number(d.prft_rt).toFixed(2)}%`, color: pc },
                    { label:'평가손익',     value:`${sign(d.evltv_prft)}${fmt(d.evltv_prft)}원`, color: pc },
                    { label:'투자원금(평잔)',value:`${fmt(d.invt_bsamt)}원` },
                    { label:'회전율',       value:`${Number(d.tern_rt).toFixed(1)}%` },
                    { label:'초기 순자산',  value:`${fmt(d.tot_amt_fr)}원` },
                    { label:'최종 순자산',  value:`${fmt(d.tot_amt_to)}원` },
                  ].map(item => (
                    <div key={item.label} className="pf-return-card">
                      <div className="pf-return-label">{item.label}</div>
                      <div className="pf-return-value" style={{ color: item.color || '#0f172a' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div className="pf-return-notice">
                  💡 계좌 조회 시 오늘 수익률이 자동 저장됩니다. 매일 조회하면 일별 추이 차트가 쌓입니다.
                </div>
              </div>
            )
          })()}
          {!retLoading && !returnData && (
            <button className="pf-btn-primary" onClick={() => loadReturns(retPeriod)}>📡 수익률 조회</button>
          )}

          {/* 일별 수익률 차트 — Firestore 히스토리 */}
          <div className="pf-hist-section">
            <div className="pf-hist-header">
              <span className="pf-hist-title">📈 일별 수익률 추이</span>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span style={{fontSize:'11px',color:'#94a3b8'}}>{history.length}일 기록됨</span>
                <button className="pf-period-btn" onClick={loadHistory} disabled={histLoading} style={{fontSize:'11px',padding:'3px 10px'}}>
                  {histLoading ? '⟳' : '↺'}
                </button>
              </div>
            </div>
            {histLoading
              ? <div className="pf-loading">히스토리 불러오는 중...</div>
              : <ReturnChart data={history}/>}
          </div>
        </div>
      )}

      {chartStock && <ChartModal code={chartStock.code} name={chartStock.name} onClose={() => setChartStock(null)}/>}
    </div>
  )
}
