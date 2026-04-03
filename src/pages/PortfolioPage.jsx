// src/pages/PortfolioPage.jsx
// 포트폴리오 + 매매일지 통합 페이지

import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../firebase'
import {
  collection, addDoc, getDocs, query,
  where, orderBy, Timestamp, writeBatch, doc
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import './PortfolioPage.css'

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

// ── 유틸 ──────────────────────────────────────────────
const fmt  = n => Number(n||0).toLocaleString()
const fmtM = n => { const v=Number(n||0); return Math.abs(v)>=100000000?(v/100000000).toFixed(1)+'억':Math.abs(v)>=10000?(v/10000).toFixed(0)+'만':fmt(v) }
const fmtR = n => { const v=Number(n||0); return (v>0?'+':'')+v.toFixed(2)+'%' }
const sign = n => Number(n||0)>=0?'up':'down'
const today = () => new Date().toISOString().slice(0,10).replace(/-/g,'')
const daysAgo = d => { const dt=new Date(); dt.setDate(dt.getDate()-d); return dt.toISOString().slice(0,10).replace(/-/g,'') }
const fmtDate = s => s?`${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`:''

// trade_id 중복 방지용 해시
const makeTradeId = t => `${t.date}_${t.code}_${t.type}_${t.price}_${t.qty}`
const makeCfId    = t => `${t.date}_${t.type}_${t.amount}`

// 섹터 색상
const SECTOR_COLORS = ['#4F46E5','#0D9488','#D97706','#EF4444','#8B5CF6','#10B981','#F59E0B','#6366F1']

// ── 메뉴 목록 ──────────────────────────────────────────
const MENU = [
  { id: 'holdings', label: '보유현황' },
  { id: 'profit',   label: '손익현황' },
  { id: 'trades',   label: '매매내역' },
  { id: 'cashflow', label: '입출금' },
  { id: 'stats',    label: '기간분석' },
  { id: 'ai',       label: 'AI 진단' },
]

// ── 기간 선택 바 ───────────────────────────────────────
function PeriodBar({ frDt, toDt, onChange }) {
  const PRESETS = [
    { label: '1개월', days: 30 },
    { label: '3개월', days: 90 },
    { label: '6개월', days: 180 },
  ]
  const [active, setActive] = useState(30)

  const applyPreset = (days) => {
    setActive(days)
    onChange(daysAgo(days), today())
  }

  return (
    <div className="pp-period-bar">
      {PRESETS.map(p => (
        <button key={p.days} className={`pp-period-btn ${active===p.days?'active':''}`}
          onClick={()=>applyPreset(p.days)}>{p.label}</button>
      ))}
      <input type="text" className="pp-date-input" placeholder="YYYYMMDD" maxLength={8}
        value={frDt} onChange={e=>{setActive(null);onChange(e.target.value, toDt)}}/>
      <span className="pp-period-sep">~</span>
      <input type="text" className="pp-date-input" placeholder="YYYYMMDD" maxLength={8}
        value={toDt} onChange={e=>{setActive(null);onChange(frDt, e.target.value)}}/>
    </div>
  )
}

// ── KPI 카드 ───────────────────────────────────────────
function KpiBar({ data }) {
  if (!data) return null
  const items = [
    { label: '총 평가액',  value: fmtM(data.tot_evlt_amt), sub: '원', cls: 'neutral' },
    { label: '총 매입액',  value: fmtM(data.tot_pur_amt),  sub: '원', cls: 'neutral' },
    { label: '평가손익',   value: fmtM(data.tot_evlt_pl),  sub: (Number(data.tot_evlt_pl)>=0?'+':'')+'원', cls: sign(data.tot_evlt_pl) },
    { label: '수익률',     value: fmtR(data.tot_prft_rt),  sub: '',    cls: sign(data.tot_prft_rt) },
  ]
  return (
    <div className="pp-kpi">
      {items.map(it => (
        <div key={it.label} className="pp-kpi-card">
          <div className="pp-kpi-label">{it.label}</div>
          <div className={`pp-kpi-value ${it.cls}`}>{it.value}</div>
          <div className="pp-kpi-sub">{it.sub}</div>
        </div>
      ))}
    </div>
  )
}

// ── 보유현황 패널 ─────────────────────────────────────
function HoldingsPanel({ data, loading, onRefresh }) {
  if (loading) return <div className="pp-loading"><div className="pp-spinner"/><span>보유종목 조회 중...</span></div>
  if (!data?.holdings?.length) return (
    <div className="pp-empty">
      <div className="pp-empty-icon">📂</div>
      <div className="pp-empty-title">보유종목 없음</div>
      <div className="pp-empty-sub">키움 계좌에 보유 중인 종목이 없거나<br/>데이터를 불러오지 못했습니다.</div>
      <button className="pp-btn primary" onClick={onRefresh}>↺ 다시 불러오기</button>
    </div>
  )

  // 섹터 집계 (단순: 보유비중 기반)
  const sectors = data.holdings.reduce((acc, h) => {
    const s = h.sector || '기타'
    acc[s] = (acc[s]||0) + Math.abs(Number(h.poss_rt||0))
    return acc
  }, {})
  const sectorArr = Object.entries(sectors).sort((a,b)=>b[1]-a[1])

  return (
    <div className="pp-panel">
      <div className="pp-panel-hdr">
        <div>
          <div className="pp-panel-title">보유현황</div>
          <div className="pp-panel-sub">키움 실시간 잔고 · {data.holdings.length}종목</div>
        </div>
        <button className="pp-btn" onClick={onRefresh}>↺ 새로고침</button>
      </div>

      <div className="pp-table-wrap" style={{marginBottom:16}}>
        <table className="pp-table">
          <thead>
            <tr>
              <th style={{textAlign:'left'}}>종목</th>
              <th>현재가</th>
              <th>보유수량</th>
              <th>평균단가</th>
              <th>평가금액</th>
              <th>손익금액</th>
              <th>수익률</th>
              <th>비중</th>
            </tr>
          </thead>
          <tbody>
            {data.holdings.map(h => (
              <tr key={h.stk_cd}>
                <td>
                  <div className="pp-stock-name">{h.stk_nm}</div>
                  <div className="pp-stock-code">{h.stk_cd}</div>
                </td>
                <td>{fmt(h.cur_prc)}</td>
                <td>{fmt(h.rmnd_qty)}</td>
                <td>{fmt(h.pur_pric)}</td>
                <td>{fmt(h.evlt_amt)}</td>
                <td className={sign(h.evltv_prft)}>{(Number(h.evltv_prft)>=0?'+':'')+fmt(h.evltv_prft)}</td>
                <td className={sign(h.prft_rt)}>{fmtR(h.prft_rt)}</td>
                <td>{Number(h.poss_rt||0).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sectorArr.length > 0 && (
        <>
          <div className="pp-panel-title" style={{fontSize:13,marginBottom:10}}>섹터 비중</div>
          <div className="pp-sector-list">
            {sectorArr.map(([name, pct], i) => (
              <div key={name} className="pp-sector-row">
                <div className="pp-sector-dot" style={{background:SECTOR_COLORS[i%SECTOR_COLORS.length]}}/>
                <span className="pp-sector-name">{name}</span>
                <div className="pp-sector-bar">
                  <div className="pp-sector-fill" style={{width:`${Math.min(pct,100)}%`, background:SECTOR_COLORS[i%SECTOR_COLORS.length]}}/>
                </div>
                <span className="pp-sector-pct">{pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── 손익현황 패널 ─────────────────────────────────────
function ProfitPanel({ data }) {
  const [tab, setTab] = useState('unrealized')
  if (!data?.holdings?.length) return (
    <div className="pp-panel">
      <div className="pp-empty"><div className="pp-empty-icon">📊</div><div className="pp-empty-title">보유종목 없음</div></div>
    </div>
  )
  const maxAbs = Math.max(...data.holdings.map(h=>Math.abs(Number(h.evltv_prft||0))), 1)
  return (
    <div className="pp-panel">
      <div className="pp-panel-hdr">
        <div className="pp-panel-title">손익현황</div>
        <div style={{display:'flex',gap:6}}>
          {['unrealized','realized'].map(t=>(
            <button key={t} className={`pp-period-btn ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
              {t==='unrealized'?'미실현':'실현'}
            </button>
          ))}
        </div>
      </div>
      {tab==='unrealized' && (
        <div className="pp-bar-chart">
          {[...data.holdings].sort((a,b)=>Number(b.prft_rt||0)-Number(a.prft_rt||0)).map(h=>{
            const pct = Math.abs(Number(h.evltv_prft||0))/maxAbs*100
            const up  = Number(h.evltv_prft||0)>=0
            return (
              <div key={h.stk_cd} className="pp-bar-row">
                <div className="pp-bar-label" title={h.stk_nm}>{h.stk_nm}</div>
                <div className="pp-bar-track">
                  <div className={`pp-bar-fill ${up?'up':'down'}`} style={{width:`${pct}%`}}/>
                </div>
                <div className={`pp-bar-value ${up?'up':'down'}`}>{fmtR(h.prft_rt)}</div>
              </div>
            )
          })}
        </div>
      )}
      {tab==='realized' && (
        <div className="pp-empty">
          <div className="pp-empty-icon">📋</div>
          <div className="pp-empty-title">매매내역에서 실현손익 집계</div>
          <div className="pp-empty-sub">매매내역 탭에서 데이터를 저장하면<br/>이 곳에서 실현손익을 확인할 수 있습니다.</div>
        </div>
      )}
    </div>
  )
}

// ── 매매내역 패널 ─────────────────────────────────────
function TradesPanel({ user }) {
  const [frDt, setFrDt] = useState(daysAgo(30))
  const [toDt, setToDt] = useState(today())
  const [loading, setLoading]   = useState(false)
  const [saving,  setSaving]    = useState(false)
  const [trades,  setTrades]    = useState([])
  const [saved,   setSaved]     = useState(0)
  const [dbTrades,setDbTrades]  = useState([])
  const [viewMode,setViewMode]  = useState('api') // 'api' | 'db'

  // DB에서 저장된 내역 로드
  const loadDbTrades = useCallback(async () => {
    if (!user) return
    const q = query(
      collection(db,'users',user.uid,'portfolio','trades','records'),
      orderBy('date','desc')
    )
    const snap = await getDocs(q)
    setDbTrades(snap.docs.map(d=>d.data()))
  }, [user])

  useEffect(() => { loadDbTrades() }, [loadDbTrades])

  const fetchTrades = async () => {
    setLoading(true); setTrades([])
    try {
      const res = await fetch(`/api/kiwoom?type=account-trades&fr_dt=${frDt}&to_dt=${toDt}`)
      const data = await res.json()
      setTrades(data.trades || [])
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  const saveTrades = async () => {
    if (!user || !trades.length) return
    setSaving(true)
    let newCount = 0
    try {
      // 기존 ID 목록 조회
      const existing = new Set(dbTrades.map(t=>makeTradeId(t)))
      const batch = writeBatch(db)
      const col = collection(db,'users',user.uid,'portfolio','trades','records')
      for (const t of trades) {
        const id = makeTradeId(t)
        if (existing.has(id)) continue
        const ref = doc(col, id)
        batch.set(ref, { ...t, savedAt: Timestamp.now() })
        newCount++
      }
      if (newCount > 0) await batch.commit()
      setSaved(newCount)
      await loadDbTrades()
    } catch(e) { console.error(e) }
    setSaving(false)
  }

  const displayData = viewMode === 'db' ? dbTrades : trades

  return (
    <div className="pp-panel">
      <div className="pp-panel-hdr">
        <div className="pp-panel-title">매매내역</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {['api','db'].map(m=>(
            <button key={m} className={`pp-period-btn ${viewMode===m?'active':''}`} onClick={()=>setViewMode(m)}>
              {m==='api'?'API 조회':'저장된 내역'}
            </button>
          ))}
        </div>
      </div>

      {viewMode==='api' && (
        <>
          <PeriodBar frDt={frDt} toDt={toDt} onChange={(f,t)=>{setFrDt(f);setToDt(t)}}/>
          <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
            <button className="pp-btn primary" onClick={fetchTrades} disabled={loading}>
              {loading?'조회 중...':'조회'}
            </button>
            {trades.length>0 && (
              <button className="pp-btn" onClick={saveTrades} disabled={saving}>
                {saving?'저장 중...':'Firestore 저장'}
              </button>
            )}
            {saved>0 && <span className="pp-save-badge">✓ {saved}건 신규 저장</span>}
          </div>
        </>
      )}

      {loading && <div className="pp-loading"><div className="pp-spinner"/><span>매매내역 조회 중...</span></div>}

      {!loading && displayData.length===0 && (
        <div className="pp-empty">
          <div className="pp-empty-icon">📋</div>
          <div className="pp-empty-title">{viewMode==='api'?'조회 결과 없음':'저장된 내역 없음'}</div>
          <div className="pp-empty-sub">{viewMode==='api'?'기간을 선택 후 조회해주세요.':'API 조회 후 저장하면 이 곳에 누적됩니다.'}</div>
        </div>
      )}

      {!loading && displayData.length>0 && (
        <div className="pp-table-wrap">
          <table className="pp-table">
            <thead>
              <tr>
                <th style={{textAlign:'left'}}>날짜</th>
                <th style={{textAlign:'left'}}>종목</th>
                <th>구분</th>
                <th>수량</th>
                <th>단가</th>
                <th>금액</th>
                <th>수수료</th>
              </tr>
            </thead>
            <tbody>
              {displayData.map((t,i)=>(
                <tr key={i}>
                  <td style={{textAlign:'left',fontFamily:'monospace',fontSize:11}}>{fmtDate(t.date)}</td>
                  <td>
                    <div className="pp-stock-name">{t.name}</div>
                    <div className="pp-stock-code">{t.code}</div>
                  </td>
                  <td><span style={{color:t.type==='buy'?'#EF4444':'#3B82F6',fontWeight:700}}>{t.type==='buy'?'매수':'매도'}</span></td>
                  <td>{fmt(t.qty)}</td>
                  <td>{fmt(t.price)}</td>
                  <td>{fmt(t.amount)}</td>
                  <td>{fmt(t.fee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 입출금 패널 ───────────────────────────────────────
function CashflowPanel({ user }) {
  const [frDt, setFrDt] = useState(daysAgo(30))
  const [toDt, setToDt] = useState(today())
  const [loading, setLoading]  = useState(false)
  const [saving,  setSaving]   = useState(false)
  const [flows,   setFlows]    = useState([])
  const [saved,   setSaved]    = useState(0)
  const [dbFlows, setDbFlows]  = useState([])
  const [viewMode,setViewMode] = useState('api')

  const loadDbFlows = useCallback(async () => {
    if (!user) return
    const q = query(
      collection(db,'users',user.uid,'portfolio','cashflow','records'),
      orderBy('date','desc')
    )
    const snap = await getDocs(q)
    setDbFlows(snap.docs.map(d=>d.data()))
  }, [user])

  useEffect(() => { loadDbFlows() }, [loadDbFlows])

  const fetchFlows = async () => {
    setLoading(true); setFlows([])
    try {
      const res = await fetch(`/api/kiwoom?type=account-cashflow&fr_dt=${frDt}&to_dt=${toDt}`)
      const data = await res.json()
      setFlows(data.cashflow || [])
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  const saveFlows = async () => {
    if (!user || !flows.length) return
    setSaving(true)
    let newCount = 0
    try {
      const existing = new Set(dbFlows.map(f=>makeCfId(f)))
      const batch = writeBatch(db)
      const col = collection(db,'users',user.uid,'portfolio','cashflow','records')
      for (const f of flows) {
        const id = makeCfId(f)
        if (existing.has(id)) continue
        const ref = doc(col, id)
        batch.set(ref, { ...f, savedAt: Timestamp.now() })
        newCount++
      }
      if (newCount > 0) await batch.commit()
      setSaved(newCount)
      await loadDbFlows()
    } catch(e) { console.error(e) }
    setSaving(false)
  }

  const displayData = viewMode === 'db' ? dbFlows : flows
  const totalIn  = displayData.filter(f=>f.type==='in').reduce((s,f)=>s+Number(f.amount||0), 0)
  const totalOut = displayData.filter(f=>f.type==='out').reduce((s,f)=>s+Number(f.amount||0), 0)

  return (
    <div className="pp-panel">
      <div className="pp-panel-hdr">
        <div className="pp-panel-title">입출금 내역</div>
        <div style={{display:'flex',gap:6}}>
          {['api','db'].map(m=>(
            <button key={m} className={`pp-period-btn ${viewMode===m?'active':''}`} onClick={()=>setViewMode(m)}>
              {m==='api'?'API 조회':'저장된 내역'}
            </button>
          ))}
        </div>
      </div>

      {viewMode==='api' && (
        <>
          <PeriodBar frDt={frDt} toDt={toDt} onChange={(f,t)=>{setFrDt(f);setToDt(t)}}/>
          <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center',flexWrap:'wrap'}}>
            <button className="pp-btn primary" onClick={fetchFlows} disabled={loading}>{loading?'조회 중...':'조회'}</button>
            {flows.length>0 && <button className="pp-btn" onClick={saveFlows} disabled={saving}>{saving?'저장 중...':'저장'}</button>}
            {saved>0 && <span className="pp-save-badge">✓ {saved}건 저장</span>}
          </div>
        </>
      )}

      {displayData.length>0 && (
        <div className="pp-stat-grid" style={{marginBottom:12}}>
          <div className="pp-stat-item">
            <div className="pp-stat-label">총 입금</div>
            <div className="pp-stat-value" style={{color:'#EF4444'}}>+{fmtM(totalIn)}</div>
          </div>
          <div className="pp-stat-item">
            <div className="pp-stat-label">총 출금</div>
            <div className="pp-stat-value" style={{color:'#3B82F6'}}>-{fmtM(totalOut)}</div>
          </div>
          <div className="pp-stat-item">
            <div className="pp-stat-label">순 투자금</div>
            <div className="pp-stat-value">{fmtM(totalIn-totalOut)}</div>
          </div>
          <div className="pp-stat-item">
            <div className="pp-stat-label">거래 건수</div>
            <div className="pp-stat-value">{displayData.length}건</div>
          </div>
        </div>
      )}

      {loading && <div className="pp-loading"><div className="pp-spinner"/><span>입출금 내역 조회 중...</span></div>}

      {!loading && displayData.length===0 && (
        <div className="pp-empty">
          <div className="pp-empty-icon">💳</div>
          <div className="pp-empty-title">내역 없음</div>
          <div className="pp-empty-sub">{viewMode==='api'?'기간 선택 후 조회해주세요.':'저장된 입출금 내역이 없습니다.'}</div>
        </div>
      )}

      {!loading && displayData.length>0 && (
        <div className="pp-table-wrap">
          <table className="pp-table">
            <thead><tr>
              <th style={{textAlign:'left'}}>날짜</th>
              <th style={{textAlign:'left'}}>구분</th>
              <th>금액</th>
              <th>잔고</th>
              <th style={{textAlign:'left'}}>메모</th>
            </tr></thead>
            <tbody>
              {displayData.map((f,i)=>(
                <tr key={i}>
                  <td style={{textAlign:'left',fontFamily:'monospace',fontSize:11}}>{fmtDate(f.date)}</td>
                  <td style={{textAlign:'left'}}><span style={{color:f.type==='in'?'#EF4444':'#3B82F6',fontWeight:700}}>{f.type==='in'?'입금':'출금'}</span></td>
                  <td className={f.type==='in'?'up':'down'}>{f.type==='in'?'+':'-'}{fmt(f.amount)}</td>
                  <td>{fmt(f.balance)}</td>
                  <td style={{textAlign:'left',fontFamily:'var(--font-kr,sans-serif)',fontSize:11,color:'var(--text-dim)'}}>{f.io_tp_nm||f.memo||''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 기간분석 패널 ─────────────────────────────────────
function StatsPanel({ user }) {
  const [frDt, setFrDt]     = useState(daysAgo(180))
  const [toDt, setToDt]     = useState(today())
  const [loading, setLoading] = useState(false)
  const [stats, setStats]   = useState(null)

  const analyze = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      // Firestore에서 기간 내 매매내역 조회
      const q = query(
        collection(db,'users',user.uid,'portfolio','trades','records'),
        where('date','>=', frDt),
        where('date','<=', toDt),
        orderBy('date','asc')
      )
      const snap = await getDocs(q)
      const trades = snap.docs.map(d=>d.data())

      if (!trades.length) { setStats({ empty: true }); setLoading(false); return }

      // 집계
      const buys  = trades.filter(t=>t.type==='buy')
      const sells = trades.filter(t=>t.type==='sell')
      const totalBuy  = buys.reduce((s,t)=>s+Number(t.amount||0),0)
      const totalSell = sells.reduce((s,t)=>s+Number(t.amount||0),0)
      const totalFee  = trades.reduce((s,t)=>s+Number(t.fee||0),0)

      // 월별 집계
      const monthly = {}
      sells.forEach(t => {
        const ym = t.date.slice(0,6) // YYYYMM
        if (!monthly[ym]) monthly[ym] = { sell:0, buy:0 }
        monthly[ym].sell += Number(t.amount||0)
      })
      buys.forEach(t => {
        const ym = t.date.slice(0,6)
        if (!monthly[ym]) monthly[ym] = { sell:0, buy:0 }
        monthly[ym].buy += Number(t.amount||0)
      })
      const monthlyArr = Object.entries(monthly).sort((a,b)=>a[0].localeCompare(b[0]))
        .map(([ym,v])=>({ ym, profit: v.sell - v.buy }))

      // 종목별
      const byCode = {}
      trades.forEach(t => {
        if (!byCode[t.code]) byCode[t.code] = { name:t.name, count:0, totalAmt:0 }
        byCode[t.code].count++
        byCode[t.code].totalAmt += Number(t.amount||0)
      })
      const topCodes = Object.entries(byCode).sort((a,b)=>b[1].count-a[1].count).slice(0,5)

      setStats({ trades, buys, sells, totalBuy, totalSell, totalFee, monthlyArr, topCodes, empty:false })
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [user, frDt, toDt])

  useEffect(() => { analyze() }, [])

  const maxProfit = stats?.monthlyArr?.length ? Math.max(...stats.monthlyArr.map(m=>Math.abs(m.profit)),1) : 1

  return (
    <div className="pp-panel">
      <div className="pp-panel-hdr">
        <div className="pp-panel-title">기간분석</div>
        <button className="pp-btn" onClick={analyze} disabled={loading}>↺ 분석</button>
      </div>

      <PeriodBar frDt={frDt} toDt={toDt} onChange={(f,t)=>{setFrDt(f);setToDt(t)}}/>

      {loading && <div className="pp-loading"><div className="pp-spinner"/><span>분석 중...</span></div>}

      {stats?.empty && !loading && (
        <div className="pp-empty">
          <div className="pp-empty-icon">📈</div>
          <div className="pp-empty-title">분석할 내역 없음</div>
          <div className="pp-empty-sub">매매내역 탭에서 데이터를 저장하면<br/>기간별 분석이 가능합니다.</div>
        </div>
      )}

      {stats && !stats.empty && !loading && (
        <>
          <div className="pp-stat-grid">
            <div className="pp-stat-item">
              <div className="pp-stat-label">총 거래</div>
              <div className="pp-stat-value">{stats.trades.length}건</div>
            </div>
            <div className="pp-stat-item">
              <div className="pp-stat-label">매수금액</div>
              <div className="pp-stat-value">{fmtM(stats.totalBuy)}</div>
            </div>
            <div className="pp-stat-item">
              <div className="pp-stat-label">매도금액</div>
              <div className="pp-stat-value">{fmtM(stats.totalSell)}</div>
            </div>
            <div className="pp-stat-item">
              <div className="pp-stat-label">수수료 합계</div>
              <div className="pp-stat-value">{fmtM(stats.totalFee)}</div>
            </div>
          </div>

          {stats.monthlyArr.length>0 && (
            <>
              <div className="pp-panel-title" style={{fontSize:13,marginBottom:12}}>월별 매매 손익 추이</div>
              <div className="pp-month-chart">
                {stats.monthlyArr.map(m => {
                  const h = Math.abs(m.profit)/maxProfit*100
                  const up = m.profit>=0
                  return (
                    <div key={m.ym} className="pp-month-col">
                      <div className="pp-month-bar-wr">
                        <div className={`pp-month-bar ${up?'up':'down'}`} style={{height:`${Math.max(h,2)}%`}}/>
                      </div>
                      <div className="pp-month-lbl">{m.ym.slice(4)}월</div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {stats.topCodes.length>0 && (
            <>
              <div className="pp-panel-title" style={{fontSize:13,marginBottom:10,marginTop:20}}>거래 빈도 TOP 5</div>
              <div className="pp-bar-chart">
                {stats.topCodes.map(([code,v],i)=>(
                  <div key={code} className="pp-bar-row">
                    <div className="pp-bar-label" title={v.name}>{v.name}</div>
                    <div className="pp-bar-track">
                      <div className="pp-bar-fill up" style={{width:`${v.count/stats.topCodes[0][1].count*100}%`}}/>
                    </div>
                    <div className="pp-bar-value" style={{color:'var(--text-secondary)'}}>{v.count}건</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── AI 진단 패널 ──────────────────────────────────────
function AIPanel({ holdingsData, user }) {
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState('')
  const [error,   setError]   = useState('')
  const [saved,   setSaved]   = useState(false)

  const run = async () => {
    if (!CLAUDE_KEY) { setError('VITE_CLAUDE_API_KEY 미설정'); return }
    setLoading(true); setResult(''); setError(''); setSaved(false)

    // 컨텍스트 구성
    const holdings = holdingsData?.holdings || []
    const ctx = holdings.length
      ? `보유종목 ${holdings.length}개:\n` + holdings.map(h=>`- ${h.stk_nm}(${h.stk_cd}): 평가손익 ${Number(h.evltv_prft)>=0?'+':''}${fmt(h.evltv_prft)}원 (${fmtR(h.prft_rt)}), 비중 ${Number(h.poss_rt||0).toFixed(1)}%`).join('\n')
      : '보유종목 없음'

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: `당신은 주식 투자 전문가입니다. 아래 포트폴리오를 분석해 주세요.\n\n${ctx}\n\n다음 항목을 분석해주세요:\n## 포트폴리오 진단\n## 집중도·분산도 분석\n## 리스크 평가\n## 개선 제안\n\n한국어로 간결하게 작성해주세요.`
          }]
        })
      })
      const data = await res.json()
      if (!data.content) throw new Error(data.error?.message || 'API 오류')
      const text = data.content.filter(b=>b.type==='text').map(b=>b.text).join('\n')
      setResult(text)

      // Firestore 저장
      if (user) {
        const ts = Timestamp.now()
        const timeStr = new Date().toLocaleString('ko-KR')
        await addDoc(collection(db,'users',user.uid,'memos'), {
          title: `[포트폴리오 AI진단] ${timeStr}`,
          content: text,
          category: 'AI브리핑',
          tags: ['AI','포트폴리오','자동저장'],
          bgColor: '#EFF6FF', titleColor: '#1E40AF', textColor: '#1E293B',
          fontSize: 13, pinned: false, createdAt: ts, updatedAt: ts,
        })
        setSaved(true)
      }
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  // 간단 마크다운 렌더
  const renderMd = txt => txt.split('\n').map((line,i)=>{
    if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>
    if (line.startsWith('### ')) return <h3 key={i}>{line.slice(4)}</h3>
    if (line.startsWith('- ')) return <p key={i}>• {line.slice(2)}</p>
    if (!line.trim()) return <br key={i}/>
    return <p key={i}>{line}</p>
  })

  return (
    <div className="pp-panel">
      <div className="pp-panel-hdr">
        <div>
          <div className="pp-panel-title">AI 포트폴리오 진단</div>
          <div className="pp-panel-sub">보유종목 기반 · Claude AI 분석</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {saved && <span className="pp-save-badge">✓ 메모장 저장</span>}
          <button className="pp-btn primary" onClick={run} disabled={loading}>
            {loading?'분석 중...':'AI 분석 실행'}
          </button>
        </div>
      </div>

      {!CLAUDE_KEY && (
        <div style={{padding:'12px 14px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,fontSize:12,color:'#DC2626',marginBottom:12}}>
          ⚠️ VITE_CLAUDE_API_KEY가 설정되지 않았습니다.
        </div>
      )}

      {error && <div style={{padding:'12px 14px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,fontSize:12,color:'#DC2626',marginBottom:12}}>❌ {error}</div>}

      {loading && <div className="pp-loading"><div className="pp-spinner"/><span>AI가 포트폴리오를 분석하고 있습니다...</span></div>}

      {!loading && result && (
        <div className="pp-ai-result">{renderMd(result)}</div>
      )}

      {!loading && !result && !error && (
        <div className="pp-empty">
          <div className="pp-empty-icon">🤖</div>
          <div className="pp-empty-title">AI 분석 대기 중</div>
          <div className="pp-empty-sub">보유종목 기반으로 포트폴리오를 진단합니다.<br/>집중도, 리스크, 개선 제안을 제공합니다.</div>
        </div>
      )}
    </div>
  )
}

// ── 메인 페이지 ───────────────────────────────────────
export default function PortfolioPage() {
  const { user } = useAuth()
  const [activeMenu, setActiveMenu]     = useState('holdings')
  const [sidebarW,   setSidebarW]       = useState(() => {
    try { return Number(localStorage.getItem('pp_sidebar_w')) || 200 } catch { return 200 }
  })
  const [dragging,   setDragging]       = useState(false)
  const [holdData,   setHoldData]       = useState(null)
  const [holdLoading,setHoldLoading]    = useState(false)
  const dragRef = useRef(null)
  const pageRef = useRef(null)

  // 보유종목 로드
  const loadHoldings = useCallback(async () => {
    setHoldLoading(true)
    try {
      const res = await fetch('/api/kiwoom?type=account-holdings')
      const data = await res.json()
      setHoldData(data)
    } catch(e) { console.error(e) }
    setHoldLoading(false)
  }, [])

  useEffect(() => { loadHoldings() }, [loadHoldings])

  // 사이드바 너비 저장
  useEffect(() => {
    try { localStorage.setItem('pp_sidebar_w', sidebarW) } catch {}
  }, [sidebarW])

  // 드래그 리사이즈
  const onMouseDown = (e) => {
    e.preventDefault()
    setDragging(true)
    dragRef.current = { startX: e.clientX, startW: sidebarW }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }
  const onMouseMove = useCallback((e) => {
    if (!dragRef.current) return
    const delta = e.clientX - dragRef.current.startX
    const newW = Math.min(300, Math.max(160, dragRef.current.startW + delta))
    setSidebarW(newW)
  }, [])
  const onMouseUp = useCallback(() => {
    setDragging(false)
    dragRef.current = null
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }, [onMouseMove])

  const renderPanel = () => {
    switch(activeMenu) {
      case 'holdings': return <HoldingsPanel data={holdData} loading={holdLoading} onRefresh={loadHoldings}/>
      case 'profit':   return <ProfitPanel data={holdData}/>
      case 'trades':   return <TradesPanel user={user}/>
      case 'cashflow': return <CashflowPanel user={user}/>
      case 'stats':    return <StatsPanel user={user}/>
      case 'ai':       return <AIPanel holdingsData={holdData} user={user}/>
      default:         return null
    }
  }

  return (
    <div className="pp-page" ref={pageRef}>
      {/* 좌측 사이드바 */}
      <div className="pp-sidebar" style={{width: sidebarW}}>
        <div className="pp-sidebar-title">포트폴리오</div>
        <nav className="pp-nav">
          {MENU.map(m => (
            <button key={m.id} className={`pp-nav-item ${activeMenu===m.id?'active':''}`}
              onClick={()=>setActiveMenu(m.id)}>
              <span className="pp-nav-dot"/>
              {m.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 리사이즈 핸들 */}
      <div className={`pp-resize ${dragging?'dragging':''}`} onMouseDown={onMouseDown}/>

      {/* 메인 콘텐츠 */}
      <div className="pp-main">
        {/* KPI 상단 고정 */}
        {holdData && <KpiBar data={holdData}/>}
        {/* 패널 */}
        {renderPanel()}
      </div>
    </div>
  )
}
