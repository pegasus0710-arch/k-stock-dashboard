import { useState, useEffect, useCallback } from 'react'
import StockChartModal from '../components/StockChartModal'
import { fmt, fmtRate, rateColor } from '../utils/format'
import './PortfolioPage.css'

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
  if (!data?.length) return <div className="pf-chart-empty">수익률 데이터 없음</div>
  const W = 600, H = 160
  const PAD = { top:16, right:16, bottom:28, left:52 }
  const cW  = W - PAD.left - PAD.right
  const cH  = H - PAD.top  - PAD.bottom

  const vals   = data.map(d => d.prft_rt || 0)
  const maxV   = Math.max(...vals,  1)
  const minV   = Math.min(...vals, -1)
  const range  = maxV - minV || 1
  const toY    = v => PAD.top + cH - ((v - minV) / range) * cH
  const toX    = i => PAD.left + (i / (data.length - 1 || 1)) * cW
  const pts    = data.map((d, i) => `${toX(i)},${toY(d.prft_rt||0)}`).join(' ')
  const isUp   = (vals[vals.length-1] || 0) >= 0
  const lc     = isUp ? '#ef4444' : '#3b82f6'
  const yTicks = [minV, (minV+maxV)/2, maxV]
  const step   = Math.max(1, Math.floor(data.length / 6))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pf-return-svg">
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W-PAD.right} y1={toY(v)} y2={toY(v)} stroke="#f1f5f9" strokeWidth="1"/>
          <text x={PAD.left-4} y={toY(v)+4} textAnchor="end" fontSize="10" fill="#94a3b8">{v.toFixed(1)}%</text>
        </g>
      ))}
      <line x1={PAD.left} x2={W-PAD.right} y1={toY(0)} y2={toY(0)} stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="4,4"/>
      {data.filter((_,i) => i % step === 0).map((d, i) => (
        <text key={i} x={toX(data.indexOf(d))} y={H-8} textAnchor="middle" fontSize="9" fill="#94a3b8">
          {String(d.to_dt||'').slice(4,8).replace(/(\d{2})(\d{2})/, '$1/$2')}
        </text>
      ))}
      <defs>
        <linearGradient id="pf-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lc} stopOpacity="0.2"/>
          <stop offset="100%" stopColor={lc} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`${PAD.left},${H-PAD.bottom} ${pts} ${W-PAD.right},${H-PAD.bottom}`} fill="url(#pf-grad)"/>
      <polyline points={pts} fill="none" stroke={lc} strokeWidth="1.8"/>
    </svg>
  )
}

// ══════════════════════════════════════════════
export default function PortfolioPage() {
  const [holdings,    setHoldings]    = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [returnData,  setReturnData]  = useState(null)
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

  // 수익률 히스토리 로드
  const loadReturns = useCallback(async (period = retPeriod) => {
    setRetLoading(true)
    try {
      const days = { '1m':30, '3m':90, '6m':180, '1y':365 }[period] || 90
      const to   = new Date()
      const fr   = new Date(Date.now() - days * 86400000)
      const fmt8 = d => d.toISOString().slice(0,10).replace(/-/g,'')
      // 매주 데이터 포인트 생성 (API 1회 호출 = 기간 전체 요약)
      const res  = await fetch(`/api/kiwoom?type=account-returns&fr_dt=${fmt8(fr)}&to_dt=${fmt8(to)}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      // 단일 기간 요약 데이터 → 단순 표시
      setReturnData([data])
    } catch (e) { console.error(e) }
    finally { setRetLoading(false) }
  }, [retPeriod])

  useEffect(() => { loadHoldings() }, [])
  useEffect(() => { if (activeTab === 'returns') loadReturns(retPeriod) }, [activeTab, retPeriod])

  const h = holdings
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
                  💡 키움 API (kt00016)는 기간 전체 수익률 요약을 제공합니다. 일별 추이는 매일 조회 후 Firestore에 저장하는 방식으로 구현 예정입니다.
                </div>
              </div>
            )
          })()}
          {!retLoading && !returnData && (
            <button className="pf-btn-primary" onClick={() => loadReturns(retPeriod)}>📡 수익률 조회</button>
          )}
        </div>
      )}

      {chartStock && <StockChartModal stock={chartStock} onClose={() => setChartStock(null)}/>}
    </div>
  )
}
