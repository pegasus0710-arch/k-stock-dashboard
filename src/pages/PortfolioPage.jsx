// src/pages/PortfolioPage.jsx
// 포트폴리오 + 매매일지 통합 페이지

import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../firebase'
import {
  collection, addDoc, getDocs, query,
  where, orderBy, Timestamp, writeBatch, doc, updateDoc
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import './PortfolioPage.css'

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

// ── 유틸 ──────────────────────────────────────────────
const fmt  = n => Number(n||0).toLocaleString()
const fmtM = n => { const v=Number(n||0); return Math.abs(v)>=100000000?(v/100000000).toFixed(1)+'억':Math.abs(v)>=10000?(v/10000).toFixed(0)+'만':fmt(v) }
const fmtR = n => { const v=Number(n||0); return (v>0?'+':'')+v.toFixed(2)+'%' }
const sign = n => Number(n||0)>=0?'up':'down'
const today     = () => new Date().toISOString().slice(0,10).replace(/-/g,'')
const daysAgo   = d  => { const dt=new Date(); dt.setDate(dt.getDate()-d); return dt.toISOString().slice(0,10).replace(/-/g,'') }
const toHtml    = s  => s ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : ''   // YYYYMMDD → YYYY-MM-DD
const fromHtml  = s  => s ? s.replace(/-/g,'') : ''                                    // YYYY-MM-DD → YYYYMMDD
const maxDate   = (fr, months=3) => {  // fr 날짜 기준 최대 조회 종료일 (3개월 제한)
  const d = new Date(`${fr.slice(0,4)}-${fr.slice(4,6)}-${fr.slice(6,8)}`)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0,10).replace(/-/g,'')
}
const fmtDate = s => s?`${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`:''

// trade_id 중복 방지용 해시
const makeTradeId = t => `${t.date}_${t.code}_${t.type}_${t.price}_${t.qty}`
const makeCfId    = t => `${t.date}_${t.type}_${t.amount}`

// 섹터 색상
const SECTOR_COLORS = ['#4F46E5','#0D9488','#D97706','#EF4444','#8B5CF6','#10B981','#F59E0B','#6366F1']

// ── 메뉴 목록 ──────────────────────────────────────────
const MENU = [
  { id: 'holdings', label: '보유현황' },
  { id: 'trades',   label: '매매내역' },
  { id: 'cashflow', label: '입출금' },
  { id: 'journal',  label: '매매일지' },
  { id: 'ai',       label: 'AI 진단' },
]

// ── 기간 선택 바 (달력 UI) ─────────────────────────────
function PeriodBar({ frDt, toDt, onChange, onSearch }) {
  const PRESETS = [
    { label: '1개월', days: 30  },
    { label: '3개월', days: 90  },
    { label: '6개월', days: 180 },
  ]
  const [active, setActive] = useState(30)
  const [warn, setWarn]     = useState('')

  const applyPreset = (days) => {
    setActive(days); setWarn('')
    const fr = daysAgo(days), to = today()
    onChange(fr, to)
    onSearch && onSearch(fr, to)   // 프리셋 클릭 시 자동 조회
  }

  const handleFr = (e) => {
    const fr = fromHtml(e.target.value)
    setActive(null)
    // 3개월 초과 시 경고
    const limit = maxDate(fr, 3)
    if (toDt > limit) {
      setWarn('최대 3개월 조회 가능 (키움 API 제한)')
      onChange(fr, limit)
    } else {
      setWarn('')
      onChange(fr, toDt)
    }
  }
  const handleTo = (e) => {
    const to = fromHtml(e.target.value)
    setActive(null)
    const limit = maxDate(frDt, 3)
    if (to > limit) {
      setWarn('최대 3개월 조회 가능 (키움 API 제한)')
      onChange(frDt, limit)
    } else {
      setWarn('')
      onChange(frDt, to)
    }
  }

  return (
    <div>
      <div className="pp-period-bar">
        {PRESETS.map(p => (
          <button key={p.days} className={`pp-period-btn ${active===p.days?'active':''}`}
            onClick={()=>applyPreset(p.days)}>{p.label}</button>
        ))}
        <input type="date" className="pp-date-input"
          value={toHtml(frDt)} onChange={handleFr}
          max={toHtml(today())}/>
        <span className="pp-period-sep">~</span>
        <input type="date" className="pp-date-input"
          value={toHtml(toDt)} onChange={handleTo}
          max={toHtml(today())}/>
      </div>
      {warn && <div style={{fontSize:11,color:'#d97706',marginBottom:8}}>⚠️ {warn}</div>}
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

  const best  = [...data.holdings].sort((a,b)=>Number(b.prft_rt)-Number(a.prft_rt))[0]
  const worst = [...data.holdings].sort((a,b)=>Number(a.prft_rt)-Number(b.prft_rt))[0]
  const avgRt = data.holdings.reduce((s,h)=>s+Number(h.prft_rt||0),0)/data.holdings.length

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
              <th>당일 등락</th>
              <th>보유수량</th>
              <th>평균단가</th>
              <th>평가금액</th>
              <th>손익금액</th>
              <th>수익률</th>
              <th>비중</th>
            </tr>
          </thead>
          <tbody>
            {data.holdings.map(h => {
              const fluPrc = Number(h.cur_prc||0) - Number(h.pred_close_pric||0)
              const fluRt  = Number(h.pred_close_pric||0) > 0 ? (fluPrc / Number(h.pred_close_pric) * 100) : 0
              return (
                <tr key={h.stk_cd}>
                  <td>
                    <div className="pp-stock-name">{h.stk_nm}</div>
                    <div className="pp-stock-code">{h.stk_cd}</div>
                  </td>
                  <td>{fmt(h.cur_prc)}</td>
                  <td className={fluPrc>=0?'up':'down'}>
                    <div style={{fontWeight:700}}>{fluPrc>=0?'+':''}{fmt(fluPrc)}</div>
                    <div style={{fontSize:10}}>{fluRt>=0?'+':''}{fluRt.toFixed(2)}%</div>
                  </td>
                  <td>{fmt(h.rmnd_qty)}</td>
                  <td>{fmt(h.pur_pric)}</td>
                  <td>{fmt(h.evlt_amt)}</td>
                  <td className={sign(h.evltv_prft)}>{(Number(h.evltv_prft)>=0?'+':'')+fmt(h.evltv_prft)}</td>
                  <td className={sign(h.prft_rt)}>{fmtR(h.prft_rt)}</td>
                  <td>{Number(h.poss_rt||0).toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 요약 */}
      <div className="pp-stat-grid">
        <div className="pp-stat-item">
          <div className="pp-stat-label">평균 수익률</div>
          <div className="pp-stat-value" style={{fontSize:14,color:avgRt>=0?'#EF4444':'#3B82F6'}}>{avgRt>=0?'+':''}{avgRt.toFixed(2)}%</div>
        </div>
        <div className="pp-stat-item">
          <div className="pp-stat-label">보유 종목수</div>
          <div className="pp-stat-value" style={{fontSize:14}}>{data.holdings.length}종목</div>
        </div>
        <div className="pp-stat-item">
          <div className="pp-stat-label">최고 수익</div>
          <div style={{fontSize:12,fontWeight:700,color:'#EF4444'}}>{best?.stk_nm}</div>
          <div style={{fontSize:11,color:'var(--text-dim)'}}>{fmtR(best?.prft_rt)}</div>
        </div>
        <div className="pp-stat-item">
          <div className="pp-stat-label">최저 수익</div>
          <div style={{fontSize:12,fontWeight:700,color:'#3B82F6'}}>{worst?.stk_nm}</div>
          <div style={{fontSize:11,color:'var(--text-dim)'}}>{fmtR(worst?.prft_rt)}</div>
        </div>
      </div>
    </div>
  )
}

// ── 손익현황 패널 ─────────────────────────────────────
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

  const fetchTrades = async (fr=frDt, to=toDt) => {
    setLoading(true); setTrades([]); setSaved(0)
    try {
      const res = await fetch(`/api/kiwoom?type=account-trades&fr_dt=${fr}&to_dt=${to}`)
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
          <PeriodBar frDt={frDt} toDt={toDt}
            onChange={(f,t)=>{setFrDt(f);setToDt(t)}}
            onSearch={(f,t)=>{ setFrDt(f); setToDt(t); fetchTrades(f,t) }}/>
          <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
            <button className="pp-btn primary" onClick={()=>fetchTrades()} disabled={loading}>
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

  const fetchFlows = async (fr=frDt, to=toDt) => {
    setLoading(true); setFlows([]); setSaved(0)
    try {
      const res = await fetch(`/api/kiwoom?type=account-cashflow&fr_dt=${fr}&to_dt=${to}`)
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
          <PeriodBar frDt={frDt} toDt={toDt}
            onChange={(f,t)=>{setFrDt(f);setToDt(t)}}
            onSearch={(f,t)=>{ setFrDt(f); setToDt(t); fetchFlows(f,t) }}/>
          <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center',flexWrap:'wrap'}}>
            <button className="pp-btn primary" onClick={()=>fetchFlows()} disabled={loading}>{loading?'조회 중...':'조회'}</button>
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
function JournalPanel({ user }) {
  const [frDt, setFrDt]       = useState(daysAgo(30))
  const [toDt, setToDt]       = useState(today())
  const [tab,  setTab]        = useState('all')   // all|buy|sell|cashflow
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId]   = useState(null)
  const [editText, setEditText]= useState('')
  const [saving, setSaving]   = useState(false)

  const TABS = [
    { id:'all',      label:'전체' },
    { id:'buy',      label:'매수' },
    { id:'sell',     label:'매도' },
    { id:'cashflow', label:'입출금' },
  ]

  // Firestore에서 trades + cashflow 병합 로드
  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [tSnap, cSnap] = await Promise.all([
        getDocs(query(
          collection(db,'users',user.uid,'portfolio','trades','records'),
          where('date','>=', frDt), where('date','<=', toDt), orderBy('date','desc')
        )).catch(()=>({ docs:[] })),
        getDocs(query(
          collection(db,'users',user.uid,'portfolio','cashflow','records'),
          where('date','>=', frDt), where('date','<=', toDt), orderBy('date','desc')
        )).catch(()=>({ docs:[] })),
      ])
      const trades   = tSnap.docs.map(d=>({ ...d.data(), _id:d.id, _col:'trades' }))
      const cashflow = cSnap.docs.map(d=>({ ...d.data(), _id:d.id, _col:'cashflow' }))
      const merged   = [...trades, ...cashflow].sort((a,b)=>b.date.localeCompare(a.date))
      setItems(merged)
    } catch(e){ console.error(e) }
    setLoading(false)
  }, [user, frDt, toDt])

  useEffect(()=>{ load() }, [load])

  const filtered = items.filter(it => {
    if (tab==='all')      return true
    if (tab==='buy')      return it.type==='buy'
    if (tab==='sell')     return it.type==='sell'
    if (tab==='cashflow') return it._col==='cashflow'
    return true
  })

  // 메모 저장
  const saveMemo = async (it) => {
    if (!user) return
    setSaving(true)
    try {
      const colPath = it._col==='trades' ? 'trades' : 'cashflow'
      const ref = doc(db,'users',user.uid,'portfolio',colPath,'records',it._id)
      await updateDoc(ref, { memo: editText })
      setItems(prev=>prev.map(x=>x._id===it._id?{...x,memo:editText}:x))
      setEditId(null)
    } catch(e){ console.error(e) }
    setSaving(false)
  }

  const typeLabel = (it) => {
    if (it._col==='cashflow') return it.type==='in' ? '입금' : '출금'
    return it.type==='buy' ? '매수' : '매도'
  }
  const typeColor = (it) => {
    if (it._col==='cashflow') return it.type==='in' ? '#EF4444' : '#3B82F6'
    return it.type==='buy' ? '#EF4444' : '#3B82F6'
  }

  return (
    <div className="pp-panel">
      <div className="pp-panel-hdr">
        <div className="pp-panel-title">매매일지</div>
        <button className="pp-btn" onClick={load} disabled={loading}>↺ 새로고침</button>
      </div>

      <PeriodBar frDt={frDt} toDt={toDt} onChange={(f,t)=>{setFrDt(f);setToDt(t)}}/>

      {/* 카테고리 탭 */}
      <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
        {TABS.map(t=>(
          <button key={t.id} className={`pp-period-btn ${tab===t.id?'active':''}`}
            onClick={()=>setTab(t.id)}>{t.label}
            {t.id!=='all'&&<span style={{marginLeft:4,fontSize:10,opacity:.7}}>
              {items.filter(x=>t.id==='cashflow'?x._col==='cashflow':x.type===t.id).length}
            </span>}
          </button>
        ))}
      </div>

      {loading && <div className="pp-loading"><div className="pp-spinner"/><span>내역 불러오는 중...</span></div>}

      {!loading && filtered.length===0 && (
        <div className="pp-empty">
          <div className="pp-empty-icon">📓</div>
          <div className="pp-empty-title">저장된 내역 없음</div>
          <div className="pp-empty-sub">매매내역·입출금 탭에서 조회 후<br/>Firestore에 저장하면 여기에 표시됩니다.</div>
        </div>
      )}

      {!loading && filtered.length>0 && (
        <div className="pp-table-wrap">
          <table className="pp-table">
            <thead><tr>
              <th style={{textAlign:'left'}}>날짜</th>
              <th style={{textAlign:'left'}}>구분</th>
              <th style={{textAlign:'left'}}>종목/항목</th>
              <th>금액</th>
              <th>수량</th>
              <th>단가</th>
              <th style={{textAlign:'left',minWidth:140}}>메모</th>
            </tr></thead>
            <tbody>
              {filtered.map((it,i)=>(
                <tr key={`${it._id}_${i}`}>
                  <td style={{textAlign:'left',fontFamily:'monospace',fontSize:11}}>{fmtDate(it.date)}</td>
                  <td style={{textAlign:'left'}}>
                    <span style={{color:typeColor(it),fontWeight:700,fontSize:12}}>{typeLabel(it)}</span>
                  </td>
                  <td style={{textAlign:'left'}}>
                    {it.name
                      ? <><div className="pp-stock-name">{it.name}</div><div className="pp-stock-code">{it.code}</div></>
                      : <span style={{fontSize:11,color:'var(--text-dim)'}}>{it.rmrk_nm||it.io_tp_nm||'-'}</span>
                    }
                  </td>
                  <td>{fmt(it.amount||it.exct_amt||0)}</td>
                  <td>{it.qty ? fmt(it.qty) : '-'}</td>
                  <td>{it.price ? fmt(it.price) : '-'}</td>
                  <td style={{textAlign:'left'}}>
                    {editId===it._id ? (
                      <div style={{display:'flex',gap:4,alignItems:'center'}}>
                        <input autoFocus value={editText} onChange={e=>setEditText(e.target.value)}
                          onKeyDown={e=>{ if(e.key==='Enter') saveMemo(it); if(e.key==='Escape') setEditId(null) }}
                          style={{flex:1,padding:'3px 6px',fontSize:11,border:'1px solid var(--accent-mid)',borderRadius:4,outline:'none'}}
                          placeholder="매매 이유 입력 후 Enter"/>
                        <button className="pp-btn" style={{padding:'2px 6px',fontSize:10}} onClick={()=>saveMemo(it)} disabled={saving}>
                          {saving?'…':'저장'}
                        </button>
                        <button className="pp-btn" style={{padding:'2px 6px',fontSize:10}} onClick={()=>setEditId(null)}>✕</button>
                      </div>
                    ) : (
                      <div style={{display:'flex',gap:4,alignItems:'center',cursor:'pointer'}} onClick={()=>{setEditId(it._id);setEditText(it.memo||'')}}>
                        <span style={{
                          fontSize:11, color: it.memo ? 'var(--text-primary)' : 'var(--text-dim)',
                          fontStyle: it.memo ? 'normal' : 'italic',
                        }}>
                          {it.memo || '+ 메모 추가'}
                        </span>
                        {it.memo && <span style={{color:'var(--accent-mid)',fontSize:10}}>✎</span>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      case 'trades':   return <TradesPanel user={user}/>
      case 'cashflow': return <CashflowPanel user={user}/>
      case 'journal':  return <JournalPanel user={user}/>
      case 'ai':       return <AIPanel holdingsData={holdData} user={user}/>
      default:         return <HoldingsPanel data={holdData} loading={holdLoading} onRefresh={loadHoldings}/>
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
        {/* KPI — 보유현황에서만 표시 */}
        {activeMenu==='holdings' && holdData && <KpiBar data={holdData}/>}
        {/* 패널 */}
        {renderPanel()}
      </div>
    </div>
  )
}
