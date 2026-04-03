// src/pages/PortfolioPage.jsx
// 포트폴리오 + 매매분석 통합 페이지

import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../firebase'
import {
  collection, addDoc, getDocs, query, setDoc,
  where, orderBy, Timestamp, writeBatch, doc, updateDoc, deleteDoc
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
const makeTradeId = t => t.trade_id || `${t.date}_${t.code}_${t.type}_${t.price}_${t.qty}`
// 입출금 doc ID: 서버 trade_id 우선, 없으면 날짜+구분+금액
const makeCfId    = t => t.trade_id || `${t.date}_${t.type}_${t.amount}`
// 내용 기반 중복 감지 키: date + type + 절대금액 + 적요 앞 6자
// → ID 포맷이 달라도 실질적으로 같은 거래 탐지
const makeCfContentKey = t =>
  `${t.date}_${t.type==='out'?'out':'in'}_${Math.round(Math.abs(Number(t.amount||0)))}_${(t.rmrk_nm||'').slice(0,6)}`
// 중복 탐지용 내용 기반 키 (날짜+금액으로 동일 거래 판별)
// (makeCfContentKey는 위에서 정의됨)

// 섹터 색상
const SECTOR_COLORS = ['#4F46E5','#0D9488','#D97706','#EF4444','#8B5CF6','#10B981','#F59E0B','#6366F1']

// ── 메뉴 목록 ──────────────────────────────────────────
const MENU = [
  { id: 'holdings', label: '보유현황' },
  { id: 'journal',  label: '매매분석' },
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

// ── 가져오기 패널 (매매분석 내장) ─────────────────────
// 거래내역 + 입출금 내역을 기간별로 API에서 가져와
// Firestore 저장 여부를 실시간 비교해 동기화 상태 표시
function ImportPanel({ user, onImported }) {
  const [frDt,    setFrDt]    = useState(daysAgo(30))
  const [toDt,    setToDt]    = useState(today())
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [items,   setItems]   = useState([])      // API에서 가져온 전체 (trades+cashflow)
  const [dbIds,   setDbIds]   = useState(new Set()) // Firestore에 이미 있는 ID Set
  const [dbContentKeys, setDbContentKeys] = useState(new Set()) // 내용 기반 중복 체크
  const [saved,   setSaved]   = useState(0)
  const [warn,    setWarn]    = useState('')

  // 최초 마운트 시 Firestore 기존 ID 로드
  const loadDbIds = useCallback(async () => {
    if (!user) return
    try {
      const [tSnap, cSnap] = await Promise.all([
        getDocs(collection(db,'users',user.uid,'portfolio','trades','records')).catch(()=>({docs:[]})),
        getDocs(collection(db,'users',user.uid,'portfolio','cashflow','records')).catch(()=>({docs:[]})),
      ])
      const ids = new Set()
      const cts = new Set()
      tSnap.docs.forEach(d=>{ ids.add(d.id); const v=d.data(); cts.add(`${v.date}_${v.code}_${v.type}_${v.price}_${v.qty}`) })
      cSnap.docs.forEach(d=>{ ids.add(d.id); const v=d.data(); cts.add(makeCfContentKey(v)) })
      setDbIds(ids)
      setDbContentKeys(cts)
    } catch(e){ console.error(e) }
  }, [user])

  useEffect(()=>{ loadDbIds() }, [loadDbIds])

  // 동기화 상태 계산
  const syncStatus = (item) => {
    if (dbIds.has(item._id)) return 'synced'      // ID 완전 일치
    if (item._col === 'cashflow' && dbContentKeys.has(makeCfContentKey(item))) return 'synced' // 내용 일치
    return 'new'
  }

  // API 가져오기
  const fetchAll = async () => {
    setLoading(true); setItems([]); setSaved(0); setWarn('')
    try {
      // 거래내역 + 실현손익 동시 조회
      const [tradeRes, cfRes] = await Promise.all([
        fetch(`/api/kiwoom?type=account-trades&fr_dt=${frDt}&to_dt=${toDt}`).then(r=>r.json()),
        fetch(`/api/kiwoom?type=account-cashflow&fr_dt=${frDt}&to_dt=${toDt}`).then(r=>r.json()),
      ])
      const rawTrades  = (tradeRes.trades   || []).map(t=>({...t, _col:'trades',   _id: makeTradeId(t)}))
      const rawFlows   = (cfRes.cashflow    || []).map(f=>({...f, _col:'cashflow', _id: makeCfId(f)}))

      // 매도 건 실현손익 병합
      const sellCodes = [...new Set(rawTrades.filter(t=>t.type==='sell').map(t=>t.code).filter(Boolean))]
      if (sellCodes.length) {
        const realRes = await fetch(`/api/kiwoom?type=account-realized&fr_dt=${frDt}&to_dt=${toDt}`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ fr_dt:frDt, to_dt:toDt, codes:sellCodes })
        }).then(r=>r.json()).catch(()=>({}))
        const byKey  = realRes.by_key  || {}
        const byCode = realRes.by_code || {}
        rawTrades.forEach((t,i)=>{
          if (t.type!=='sell') return
          const key = `${t.date}_${t.code}`
          let matches = byKey[key] || byCode[t.code] || []
          const best = matches.find(m=>Number(m.qty||0)===Number(t.qty||0)) || matches[0]
          if (best) { rawTrades[i] = {...t, profit:best.profit, profit_rt:best.profit_rt, buy_price:best.buy_price} }
        })
      }

      const merged = [...rawTrades, ...rawFlows].sort((a,b)=>b.date.localeCompare(a.date))
      setItems(merged)
    } catch(e){ console.error(e); setWarn('조회 중 오류가 발생했습니다.') }
    setLoading(false)
  }

  // 신규 항목만 Firestore 저장
  const saveNew = async () => {
    if (!user || !items.length) return
    setSaving(true)
    let cnt = 0
    try {
      const newItems = items.filter(it=>syncStatus(it)==='new')
      const batch = writeBatch(db)
      for (const it of newItems) {
        const { _col, _id, ...data } = it
        const col = collection(db,'users',user.uid,'portfolio',_col,'records')
        const ref = doc(col, _id)
        batch.set(ref, { ...data, source: data.source||'api',
          category: data.category||(data._col==='cashflow'?data.type:'trade'),
          savedAt: Timestamp.now() })
        cnt++
      }
      if (cnt > 0) {
        await batch.commit()
        setSaved(cnt)
        await loadDbIds()            // 동기화 상태 갱신
        onImported && onImported()   // JournalPanel 새로고침
      }
    } catch(e){ console.error(e) }
    setSaving(false)
  }

  const newCount    = items.filter(it=>syncStatus(it)==='new').length
  const syncedCount = items.filter(it=>syncStatus(it)==='synced').length

  return (
    <div style={{background:'var(--bg-panel)',border:'1px solid var(--border)',
      borderRadius:10,padding:14,marginBottom:16}}>
      {/* 헤더 */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:13,fontWeight:800,color:'var(--text-primary)'}}>📥 가져오기</span>
          <span style={{fontSize:11,color:'var(--text-dim)'}}>거래·입출금 내역을 API에서 불러와 동기화합니다</span>
        </div>
      </div>

      {/* 기간 선택 */}
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10,flexWrap:'wrap'}}>
        {[{l:'1개월',d:30},{l:'3개월',d:90}].map(p=>(
          <button key={p.d} className="pp-period-btn"
            style={{background:frDt===daysAgo(p.d)&&toDt===today()?'var(--accent-mid)':'var(--bg-panel)',
              color:frDt===daysAgo(p.d)&&toDt===today()?'white':'var(--text-secondary)',
              borderColor:frDt===daysAgo(p.d)&&toDt===today()?'var(--accent-mid)':'var(--border)'}}
            onClick={()=>{ setFrDt(daysAgo(p.d)); setToDt(today()); setWarn('') }}>
            {p.l}
          </button>
        ))}
        <input type="date" className="pp-date-input" value={toHtml(frDt)}
          onChange={e=>{ const f=fromHtml(e.target.value); setFrDt(f);
            const lim=maxDate(f,3); if(toDt>lim){setToDt(lim);setWarn('최대 3개월')} }}
          max={toHtml(today())}/>
        <span style={{color:'var(--text-dim)',fontSize:12}}>~</span>
        <input type="date" className="pp-date-input" value={toHtml(toDt)}
          onChange={e=>{ const t=fromHtml(e.target.value); const lim=maxDate(frDt,3);
            setToDt(t>lim?lim:t); setWarn(t>lim?'최대 3개월':'') }}
          max={toHtml(today())}/>
        <button className="pp-btn primary" onClick={fetchAll} disabled={loading} style={{minWidth:70}}>
          {loading ? '조회 중…' : '조회'}
        </button>
        {warn && <span style={{fontSize:11,color:'#D97706'}}>⚠️ {warn}</span>}
      </div>

      {/* 조회 결과 요약 */}
      {items.length > 0 && !loading && (
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',
          background:'var(--bg-base)',borderRadius:7,marginBottom:10,flexWrap:'wrap'}}>
          <span style={{fontSize:12,color:'var(--text-secondary)'}}>
            총 <strong>{items.length}건</strong>
          </span>
          <span style={{fontSize:12}}>
            <span style={{color:'#059669',fontWeight:700}}>✅ 저장됨 {syncedCount}건</span>
            {' · '}
            <span style={{color:'var(--accent-mid)',fontWeight:700}}>🆕 신규 {newCount}건</span>
          </span>
          {newCount > 0 && (
            <button className="pp-btn primary" onClick={saveNew} disabled={saving} style={{marginLeft:'auto'}}>
              {saving ? '저장 중…' : `신규 ${newCount}건 저장`}
            </button>
          )}
          {saved > 0 && (
            <span style={{fontSize:11,color:'#059669',fontWeight:700}}>✓ {saved}건 저장 완료</span>
          )}
        </div>
      )}

      {/* 가져온 목록 미리보기 (최대 20건) */}
      {items.length > 0 && !loading && (
        <div style={{maxHeight:260,overflowY:'auto',borderRadius:7,border:'1px solid var(--border)'}}>
          <table className="pp-table" style={{fontSize:11}}>
            <thead><tr>
              <th style={{textAlign:'left',width:20}}>상태</th>
              <th style={{textAlign:'left'}}>날짜</th>
              <th style={{textAlign:'left'}}>구분</th>
              <th style={{textAlign:'left'}}>종목/항목</th>
              <th>금액</th>
              <th>수량</th>
            </tr></thead>
            <tbody>
              {items.slice(0, 50).map((it,i)=>{
                const status = syncStatus(it)
                const isCash = it._col==='cashflow'
                const cat    = isCash ? getCfCat(it.category||it.type) : null
                return (
                  <tr key={i} style={{opacity: status==='synced'?.55:1,
                    background: status==='synced'?'var(--bg-base)':'white'}}>
                    <td>
                      <span style={{fontSize:10,padding:'1px 5px',borderRadius:8,
                        background:status==='synced'?'#ECFDF5':'#EEF2FF',
                        color:status==='synced'?'#059669':'var(--accent-mid)',fontWeight:700}}>
                        {status==='synced'?'✅':'🆕'}
                      </span>
                    </td>
                    <td style={{textAlign:'left',fontFamily:'monospace'}}>{fmtDate(it.date)}</td>
                    <td style={{textAlign:'left'}}>
                      {isCash
                        ? <span style={{fontSize:10,padding:'1px 5px',borderRadius:8,color:cat.color,background:cat.bg}}>{cat.label}</span>
                        : <span style={{fontWeight:700,color:it.type==='buy'?'#EF4444':'#3B82F6'}}>{it.type==='buy'?'매수':'매도'}</span>
                      }
                    </td>
                    <td style={{textAlign:'left'}}>
                      {it.name||<span style={{color:'var(--text-dim)'}}>{it.rmrk_nm||it.io_tp_nm||'-'}</span>}
                    </td>
                    <td>{fmt(it.amount||0)}</td>
                    <td>{it.qty?fmt(it.qty):'-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {items.length > 50 && (
            <div style={{textAlign:'center',padding:8,fontSize:11,color:'var(--text-dim)'}}>
              +{items.length-50}건 더 있음 (저장하면 전체 반영)
            </div>
          )}
        </div>
      )}

      {loading && <div className="pp-loading"><div className="pp-spinner"/><span>API 조회 중...</span></div>}
    </div>
  )
}


// ── 기간분석 패널 ─────────────────────────────────────
// ── 성과분석 SVG 막대차트 ─────────────────────────────
function BarChart({ data, height=140 }) {
  if (!data?.length) return null
  const VW = 600, VH = height + 40
  const PAD = { t:20, b:30, l:8, r:8 }
  const innerW = VW - PAD.l - PAD.r
  const innerH = VH - PAD.t - PAD.b
  const colW   = innerW / data.length
  const barW   = Math.max(4, Math.min(20, colW * 0.35))
  const gap    = barW * 0.4
  const max    = Math.max(...data.map(d=>Math.max(d.buy||0, d.sell||0)), 1)

  return (
    <div style={{width:'100%',overflowX:'auto'}}>
      <svg viewBox={`0 0 ${VW} ${VH}`} style={{width:'100%',minWidth:300,display:'block'}}>
        {/* 범례 */}
        <rect x={PAD.l} y={4} width={10} height={10} fill="#EF4444" rx="2"/>
        <text x={PAD.l+14} y={13} fontSize="11" fill="#94A3B8">매수</text>
        <rect x={PAD.l+52} y={4} width={10} height={10} fill="#3B82F6" rx="2"/>
        <text x={PAD.l+66} y={13} fontSize="11" fill="#94A3B8">매도</text>

        {/* 기준선 */}
        <line x1={PAD.l} y1={PAD.t+innerH} x2={VW-PAD.r} y2={PAD.t+innerH}
          stroke="#E2E8F0" strokeWidth="1"/>

        {data.map((d,i)=>{
          const cx  = PAD.l + (i + 0.5) * colW
          const bh  = (d.buy||0)  / max * innerH
          const sh  = (d.sell||0) / max * innerH
          const by  = PAD.t + innerH - bh
          const sy  = PAD.t + innerH - sh
          return (
            <g key={d.label}>
              {bh>0 && <rect x={cx-gap-barW} y={by}   width={barW} height={bh} fill="#EF4444" rx="2" opacity=".85"/>}
              {sh>0 && <rect x={cx+gap}       y={sy}   width={barW} height={sh} fill="#3B82F6" rx="2" opacity=".85"/>}
              <text x={cx} y={PAD.t+innerH+16} textAnchor="middle" fontSize="11" fill="#94A3B8">{d.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── 성과분석 탭 ───────────────────────────────────────
function AnalysisView({ allTrades, allCashflow }) {
  const [period, setPeriod] = useState('month') // all|year|month|custom
  const [customFr, setCustomFr] = useState(daysAgo(90))
  const [customTo, setCustomTo] = useState(today())

  const now = new Date()
  const curYear  = now.getFullYear().toString()
  const curMonth = `${curYear}${String(now.getMonth()+1).padStart(2,'0')}`

  // 기간 필터
  const filterItems = (items) => {
    if (period==='year')   return items.filter(it=>it.date?.startsWith(curYear))
    if (period==='month')  return items.filter(it=>it.date?.startsWith(curMonth))
    if (period==='custom') return items.filter(it=>it.date>=customFr && it.date<=customTo)
    return items  // all
  }

  const trades   = filterItems(allTrades)
  const cashflow = filterItems(allCashflow)
  const buys     = trades.filter(t=>t.type==='buy')
  const sells    = trades.filter(t=>t.type==='sell')
  const inflows  = cashflow.filter(c=>c.type==='in')
  const outflows = cashflow.filter(c=>c.type==='out')

  const totalBuy    = buys.reduce((s,t)=>s+Number(t.amount||0),0)
  const totalSell   = sells.reduce((s,t)=>s+Number(t.amount||0),0)
  const totalFee    = trades.reduce((s,t)=>s+Number(t.fee||0),0)
  const totalIn     = inflows.reduce((s,c)=>s+Number(c.amount||0),0)
  const totalOut    = outflows.reduce((s,c)=>s+Number(c.amount||0),0)
  const tradeCount  = trades.length
  const buyCount    = buys.length
  const sellCount   = sells.length

  // ── 실현손익 기반 성과 계산 ──────────────────────────
  const sellsWithProfit = sells.filter(t => t.profit != null)
  const totalProfit     = sellsWithProfit.reduce((s,t)=>s+Number(t.profit||0), 0)
  const winners         = sellsWithProfit.filter(t=>Number(t.profit)>0)
  const losers          = sellsWithProfit.filter(t=>Number(t.profit)<=0)
  const winRate         = sellsWithProfit.length > 0
    ? (winners.length / sellsWithProfit.length * 100) : null
  const avgWin  = winners.length > 0
    ? winners.reduce((s,t)=>s+Number(t.profit),0) / winners.length : 0
  const avgLoss = losers.length  > 0
    ? Math.abs(losers.reduce((s,t)=>s+Number(t.profit),0) / losers.length) : 0
  const rrRatio = avgLoss > 0 ? (avgWin / avgLoss) : null
  const hasProfitData = sellsWithProfit.length > 0

  // 월별 집계 (최근 12개월)
  const monthly = {}
  const allItems = [...allTrades, ...allCashflow]
  allItems.forEach(it=>{
    if(!it.date) return
    const ym = it.date.slice(0,6)
    if(!monthly[ym]) monthly[ym]={ label:ym.slice(4)+'월', buy:0, sell:0, ym }
    if(it.type==='buy')  monthly[ym].buy  += Number(it.amount||0)
    if(it.type==='sell') monthly[ym].sell += Number(it.amount||0)
  })
  const monthlyArr = Object.values(monthly)
    .sort((a,b)=>a.ym.localeCompare(b.ym))
    .slice(-12)

  // 종목별 집계
  const byCode = {}
  trades.forEach(t=>{
    if(!t.code) return
    if(!byCode[t.code]) byCode[t.code]={ name:t.name, code:t.code, buyAmt:0, sellAmt:0, buyQty:0, sellQty:0, fee:0, profit:0, hasProfit:false }
    if(t.type==='buy')  { byCode[t.code].buyAmt  += Number(t.amount||0); byCode[t.code].buyQty  += Number(t.qty||0) }
    if(t.type==='sell') {
      byCode[t.code].sellAmt += Number(t.amount||0); byCode[t.code].sellQty += Number(t.qty||0)
      if(t.profit!=null) { byCode[t.code].profit += Number(t.profit||0); byCode[t.code].hasProfit = true }
    }
    byCode[t.code].fee += Number(t.fee||0)
  })
  const byCodeArr = Object.values(byCode)
    .sort((a,b)=>(b.buyAmt+b.sellAmt)-(a.buyAmt+a.sellAmt))

  // 연도 목록 (데이터 있는 연도)
  const years = [...new Set(allItems.map(it=>it.date?.slice(0,4)).filter(Boolean))].sort().reverse()

  const PERIODS = [
    { id:'all',    label:'전체' },
    { id:'year',   label:'올해' },
    { id:'month',  label:'이번달' },
    { id:'custom', label:'직접입력' },
  ]

  return (
    <div>
      {/* 기간 선택 */}
      <div className="pp-period-bar" style={{marginBottom:16}}>
        {PERIODS.map(p=>(
          <button key={p.id} className={`pp-period-btn ${period===p.id?'active':''}`}
            onClick={()=>setPeriod(p.id)}>{p.label}</button>
        ))}
        {period==='custom' && (
          <>
            <input type="date" className="pp-date-input"
              value={toHtml(customFr)} onChange={e=>setCustomFr(fromHtml(e.target.value))} max={toHtml(today())}/>
            <span className="pp-period-sep">~</span>
            <input type="date" className="pp-date-input"
              value={toHtml(customTo)} onChange={e=>setCustomTo(fromHtml(e.target.value))} max={toHtml(today())}/>
          </>
        )}
      </div>

      {/* 요약 카드 — 1행: 거래금액 */}
      <div className="pp-stat-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:10}}>
        {[
          { label:'총 매수금액', value: fmtM(totalBuy),          sub:`${buyCount}건`,          color:'#EF4444' },
          { label:'총 매도금액', value: fmtM(totalSell),         sub:`${sellCount}건`,          color:'#3B82F6' },
          { label:'총 수수료',   value: fmtM(totalFee),           sub:'매수+매도 합산',          color:'var(--text-dim)' },
          { label:'순 입금',     value: fmtM(totalIn-totalOut),   sub:`입금${inflows.length}건`, color:'var(--text-primary)' },
        ].map(c=>(
          <div key={c.label} className="pp-stat-item">
            <div className="pp-stat-label">{c.label}</div>
            <div className="pp-stat-value" style={{fontSize:15,color:c.color}}>{c.value}</div>
            <div style={{fontSize:10,color:'var(--text-dim)',marginTop:2}}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* 요약 카드 — 2행: 실현손익 성과 (데이터 있을 때만) */}
      {hasProfitData && (
        <div className="pp-stat-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:20}}>
          <div className="pp-stat-item">
            <div className="pp-stat-label">총 실현손익</div>
            <div className="pp-stat-value" style={{fontSize:15,color:totalProfit>=0?'#EF4444':'#3B82F6'}}>
              {totalProfit>=0?'+':''}{fmtM(totalProfit)}
            </div>
            <div style={{fontSize:10,color:'var(--text-dim)',marginTop:2}}>
              {sellsWithProfit.length}건 매도 기준
            </div>
          </div>
          <div className="pp-stat-item">
            <div className="pp-stat-label">승률</div>
            <div className="pp-stat-value" style={{fontSize:15,color:winRate>=50?'#EF4444':'#3B82F6'}}>
              {winRate!=null ? winRate.toFixed(1)+'%' : '-'}
            </div>
            <div style={{fontSize:10,color:'var(--text-dim)',marginTop:2}}>
              {winners.length}승 {losers.length}패
            </div>
          </div>
          <div className="pp-stat-item">
            <div className="pp-stat-label">손익비 (R:R)</div>
            <div className="pp-stat-value" style={{fontSize:15,color:rrRatio>=1?'#EF4444':'#3B82F6'}}>
              {rrRatio!=null ? rrRatio.toFixed(2) : '-'}
            </div>
            <div style={{fontSize:10,color:'var(--text-dim)',marginTop:2}}>
              평균이익 / 평균손실
            </div>
          </div>
          <div className="pp-stat-item">
            <div className="pp-stat-label">평균 수익률</div>
            <div className="pp-stat-value" style={{fontSize:15}}>
              {sellsWithProfit.length>0
                ? ((sellsWithProfit.reduce((s,t)=>s+Number(t.profit_rt||0),0)/sellsWithProfit.length).toFixed(2)+'%')
                : '-'}
            </div>
            <div style={{fontSize:10,color:'var(--text-dim)',marginTop:2}}>매도 건 평균</div>
          </div>
        </div>
      )}

      {!hasProfitData && (
        <div style={{padding:'8px 12px',background:'#FFFBEB',border:'1px solid #FCD34D',borderRadius:7,fontSize:11,color:'#92400E',marginBottom:16}}>
          ℹ️ 실현손익 데이터는 매매내역 탭에서 <strong>조회 후 저장</strong>하면 승률·R:R이 계산됩니다.
        </div>
      )}

      {/* 월별 거래 차트 */}
      {monthlyArr.length>0 && (
        <div style={{marginBottom:24}}>
          <div className="pp-panel-title" style={{fontSize:13,marginBottom:10}}>
            월별 매수·매도 금액
          </div>
          <BarChart data={monthlyArr} height={120}/>
        </div>
      )}

      {/* 종목별 집계 */}
      {byCodeArr.length>0 && (
        <>
          <div className="pp-panel-title" style={{fontSize:13,marginBottom:10}}>종목별 거래 집계</div>
          <div className="pp-table-wrap">
            <table className="pp-table">
              <thead><tr>
                <th style={{textAlign:'left'}}>종목</th>
                <th>매수금액</th>
                <th>매수수량</th>
                <th>매도금액</th>
                <th>매도수량</th>
                <th>실현손익</th>
                <th>수수료</th>
              </tr></thead>
              <tbody>
                {byCodeArr.map(s=>(
                  <tr key={s.code}>
                    <td>
                      <div className="pp-stock-name">{s.name}</div>
                      <div className="pp-stock-code">{s.code}</div>
                    </td>
                    <td style={{color:'#EF4444'}}>{fmtM(s.buyAmt)}</td>
                    <td>{fmt(s.buyQty)}</td>
                    <td style={{color:'#3B82F6'}}>{fmtM(s.sellAmt)}</td>
                    <td>{fmt(s.sellQty)}</td>
                    <td>
                      {s.hasProfit
                        ? <span style={{fontWeight:700,color:s.profit>=0?'#EF4444':'#3B82F6'}}>
                            {s.profit>=0?'+':''}{fmtM(s.profit)}
                          </span>
                        : <span style={{color:'var(--text-dim)',fontSize:10}}>미저장</span>
                      }
                    </td>
                    <td style={{color:'var(--text-dim)'}}>{fmt(s.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tradeCount===0 && (
        <div className="pp-empty">
          <div className="pp-empty-icon">📊</div>
          <div className="pp-empty-title">분석할 데이터 없음</div>
          <div className="pp-empty-sub">매매내역 탭에서 저장 후 확인하세요.</div>
        </div>
      )}
    </div>
  )
}

// ── 매매분석 패널 (일지 + 성과분석 탭) ──────────────
// ── 카테고리 설정 (입출금 분류) ──────────────────────
const CF_CATEGORIES = [
  { id:'in',       label:'입금',  color:'#EF4444', bg:'#FEF2F2' },
  { id:'transfer', label:'이체',  color:'#64748B', bg:'#F1F5F9' },
  { id:'dividend', label:'배당',  color:'#059669', bg:'#ECFDF5' },
  { id:'interest', label:'이자',  color:'#0891B2', bg:'#ECFEFF' },
  { id:'profit',   label:'수익',  color:'#D97706', bg:'#FFFBEB' },
  { id:'out',      label:'출금',  color:'#3B82F6', bg:'#EFF6FF' },
]
const cfCatMap = Object.fromEntries(CF_CATEGORIES.map(c=>[c.id,c]))
const getCfCat = cat => cfCatMap[cat] || cfCatMap['in']

// 진입근거 태그
const REASON_TAGS = ['기술적분석','실적기대','테마','분할매수','손절','익절','배당수익','기타']

// ── 수동 추가 모달 (JournalPanel 내장) ───────────────
function AddEntryModal({ user, onClose, onSaved }) {
  const [type,    setType]    = useState('buy')
  const [date,    setDate]    = useState(toHtml(today()))
  const [code,    setCode]    = useState('')
  const [name,    setName]    = useState('')
  const [price,   setPrice]   = useState('')
  const [qty,     setQty]     = useState('')
  const [amount,  setAmount]  = useState('')
  const [cat,     setCat]     = useState('in')
  const [memo,    setMemo]    = useState('')
  const [reason,  setReason]  = useState('')
  const [saving,  setSaving]  = useState(false)

  const isTrade = type==='buy'||type==='sell'
  const tradeId = `manual_${Date.now()}_${Math.random().toString(36).slice(2,7)}`

  const save = async () => {
    if (!user) return
    setSaving(true)
    try {
      const dt = fromHtml(date)
      if (isTrade) {
        const amt = Number(price||0)*Number(qty||0) || Number(amount||0)
        const ref = doc(
          collection(db,'users',user.uid,'portfolio','trades','records'), tradeId
        )
        await setDoc(ref, {
          trade_id: tradeId, date: dt, code, name,
          type, qty: Number(qty||0), price: Number(price||0),
          amount: amt, fee: 0, source: 'manual', category: 'trade',
          memo, reason_tag: reason, savedAt: Timestamp.now(),
        })
      } else {
        const cfId = `manual_${Date.now()}_${Math.random().toString(36).slice(2,7)}`
        const ref = doc(
          collection(db,'users',user.uid,'portfolio','cashflow','records'), cfId
        )
        const flowType = cat==='out' ? 'out' : 'in'
        await setDoc(ref, {
          trade_id: cfId, date: dt, type: flowType,
          category: cat, source: 'manual',
          amount: Number(amount||0), balance: 0,
          rmrk_nm: name||memo, memo, savedAt: Timestamp.now(),
        })
      }
      onSaved()
      onClose()
    } catch(e){ console.error(e) }
    setSaving(false)
  }

  return (
    <div className="pp-modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="pp-modal">
        <div className="pp-modal-hdr">
          <span className="pp-modal-title">수동 내역 추가</span>
          <button className="pp-btn" onClick={onClose}>✕</button>
        </div>
        {/* 구분 선택 */}
        <div className="pp-modal-row">
          <label className="pp-modal-label">구분</label>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {[{v:'buy',l:'매수'},{v:'sell',l:'매도'},{v:'cashflow',l:'입출금'}].map(t=>(
              <button key={t.v} className={`pp-period-btn ${type===t.v?'active':''}`}
                onClick={()=>setType(t.v)}>{t.l}</button>
            ))}
          </div>
        </div>
        {/* 날짜 */}
        <div className="pp-modal-row">
          <label className="pp-modal-label">날짜</label>
          <input type="date" className="pp-date-input" value={date}
            onChange={e=>setDate(e.target.value)} max={toHtml(today())}/>
        </div>
        {/* 종목 (거래) */}
        {isTrade && (<>
          <div className="pp-modal-row">
            <label className="pp-modal-label">종목코드</label>
            <input className="pp-modal-input" value={code} onChange={e=>setCode(e.target.value)} placeholder="예: 005930"/>
          </div>
          <div className="pp-modal-row">
            <label className="pp-modal-label">종목명</label>
            <input className="pp-modal-input" value={name} onChange={e=>setName(e.target.value)} placeholder="예: 삼성전자"/>
          </div>
          <div className="pp-modal-row">
            <label className="pp-modal-label">단가</label>
            <input className="pp-modal-input" type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0"/>
          </div>
          <div className="pp-modal-row">
            <label className="pp-modal-label">수량</label>
            <input className="pp-modal-input" type="number" value={qty} onChange={e=>setQty(e.target.value)} placeholder="0"/>
          </div>
          {price&&qty&&<div style={{fontSize:11,color:'var(--text-dim)',marginBottom:8,paddingLeft:90}}>
            ≈ {fmt(Number(price)*Number(qty))}원
          </div>}
          {/* 진입근거 태그 */}
          <div className="pp-modal-row">
            <label className="pp-modal-label">진입근거</label>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              {REASON_TAGS.map(r=>(
                <button key={r}
                  style={{padding:'3px 8px',borderRadius:12,fontSize:11,border:'1px solid',cursor:'pointer',
                    borderColor:reason===r?'var(--accent-mid)':'var(--border)',
                    background:reason===r?'var(--accent-light)':'var(--bg-panel)',
                    color:reason===r?'var(--accent-mid)':'var(--text-secondary)'}}
                  onClick={()=>setReason(prev=>prev===r?'':r)}>{r}</button>
              ))}
            </div>
          </div>
        </>)}
        {/* 입출금 */}
        {!isTrade && (<>
          <div className="pp-modal-row">
            <label className="pp-modal-label">카테고리</label>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              {CF_CATEGORIES.map(c=>(
                <button key={c.id}
                  style={{padding:'3px 10px',borderRadius:12,fontSize:11,border:`1px solid ${cat===c.id?c.color:' var(--border)'}`,
                    background:cat===c.id?c.bg:'var(--bg-panel)',color:cat===c.id?c.color:'var(--text-secondary)',
                    cursor:'pointer',fontWeight:cat===c.id?700:400}}
                  onClick={()=>setCat(c.id)}>{c.label}</button>
              ))}
            </div>
          </div>
          <div className="pp-modal-row">
            <label className="pp-modal-label">항목명</label>
            <input className="pp-modal-input" value={name} onChange={e=>setName(e.target.value)} placeholder="예: 삼성전자 배당금"/>
          </div>
          <div className="pp-modal-row">
            <label className="pp-modal-label">금액</label>
            <input className="pp-modal-input" type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"/>
          </div>
        </>)}
        {/* 메모 공통 */}
        <div className="pp-modal-row">
          <label className="pp-modal-label">메모</label>
          <input className="pp-modal-input" value={memo} onChange={e=>setMemo(e.target.value)} placeholder="매매 이유, 기억할 내용..."/>
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:16}}>
          <button className="pp-btn" onClick={onClose}>취소</button>
          <button className="pp-btn primary" onClick={save} disabled={saving}>
            {saving?'저장 중...':'저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 매매분석 패널 ─────────────────────────────────────
function JournalPanel({ user }) {
  const [view,       setView]       = useState('log')
  const [frDt,       setFrDt]       = useState(daysAgo(30))
  const [toDt,       setToDt]       = useState(today())
  const [tab,        setTab]        = useState('all')
  const [items,      setItems]      = useState([])
  const [allTrades,  setAllTrades]  = useState([])
  const [allCashflow,setAllCashflow]= useState([])
  const [loading,    setLoading]    = useState(true)
  const [editId,     setEditId]     = useState(null)
  const [editText,   setEditText]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [showAdd,    setShowAdd]    = useState(false)
  const [catEdit,    setCatEdit]    = useState(null)  // 카테고리 인라인 편집 중인 _id
  const [deleting,   setDeleting]   = useState(null)

  const TABS = [
    { id:'all',      label:'전체' },
    { id:'buy',      label:'매수' },
    { id:'sell',     label:'매도' },
    { id:'dividend', label:'배당' },
    { id:'transfer', label:'이체' },
    { id:'manual',   label:'수동입력' },
  ]

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [tSnap, cSnap] = await Promise.all([
        getDocs(query(
          collection(db,'users',user.uid,'portfolio','trades','records'),
          where('date','>=',frDt), where('date','<=',toDt), orderBy('date','desc')
        )).catch(()=>({docs:[]})),
        getDocs(query(
          collection(db,'users',user.uid,'portfolio','cashflow','records'),
          where('date','>=',frDt), where('date','<=',toDt), orderBy('date','desc')
        )).catch(()=>({docs:[]})),
      ])
      const trades   = tSnap.docs.map(d=>({...d.data(), _id:d.id, _col:'trades'}))
      const cashflow = cSnap.docs.map(d=>({...d.data(), _id:d.id, _col:'cashflow'}))
      setItems([...trades,...cashflow].sort((a,b)=>b.date.localeCompare(a.date)))
    } catch(e){ console.error(e) }
    setLoading(false)
  }, [user, frDt, toDt])

  const loadAll = useCallback(async () => {
    if (!user) return
    try {
      const [tSnap, cSnap] = await Promise.all([
        getDocs(query(collection(db,'users',user.uid,'portfolio','trades','records'), orderBy('date','desc'))).catch(()=>({docs:[]})),
        getDocs(query(collection(db,'users',user.uid,'portfolio','cashflow','records'), orderBy('date','desc'))).catch(()=>({docs:[]})),
      ])
      setAllTrades(tSnap.docs.map(d=>d.data()))
      setAllCashflow(cSnap.docs.map(d=>d.data()))
    } catch(e){ console.error(e) }
  }, [user])

  useEffect(()=>{ load() }, [load])
  useEffect(()=>{ if(view==='analysis') loadAll() }, [view, loadAll])

  // 탭 필터
  const filtered = items.filter(it => {
    if (tab==='all')      return true
    if (tab==='buy')      return it.type==='buy'
    if (tab==='sell')     return it.type==='sell'
    if (tab==='dividend') return it.category==='dividend'
    if (tab==='transfer') return it.category==='transfer'||it.category==='in'||it.category==='out'
    if (tab==='manual')   return it.source==='manual'
    return true
  })

  // 메모 저장
  const saveMemo = async (it) => {
    if (!user) return
    setSaving(true)
    try {
      const col = it._col==='trades' ? 'trades' : 'cashflow'
      const ref = doc(db,'users',user.uid,'portfolio',col,'records',it._id)
      await updateDoc(ref, { memo: editText })
      setItems(prev=>prev.map(x=>x._id===it._id?{...x,memo:editText}:x))
      setEditId(null)
    } catch(e){ console.error(e) }
    setSaving(false)
  }

  // 카테고리 업데이트 (입출금 재분류)
  const updateCat = async (it, newCat) => {
    if (!user) return
    try {
      const col = it._col==='cashflow' ? 'cashflow' : 'trades'
      const ref = doc(db,'users',user.uid,'portfolio',col,'records',it._id)
      const flowType = newCat==='out' ? 'out' : 'in'
      await updateDoc(ref, { category: newCat, type: flowType, category_updated_at: Timestamp.now() })
      setItems(prev=>prev.map(x=>x._id===it._id?{...x,category:newCat,type:flowType}:x))
      setCatEdit(null)
    } catch(e){ console.error(e) }
  }

  // 항목 삭제
  // - 수동(manual): 바로 삭제
  // - 입출금 자동(cashflow api): 재조회 가능하므로 삭제 허용 (확인 메시지)
  // - 거래 자동(trades api): 실현손익 계산 데이터 보호 → 삭제 금지
  const deleteItem = async (it) => {
    if (!user) return
    const isManual   = it.source === 'manual'
    const isCashflow = it._col  === 'cashflow'
    // 자동 trades는 삭제 불가
    if (!isManual && !isCashflow) return

    const label = it.name || it.rmrk_nm || '항목'
    const msg = isManual
      ? `수동 입력 항목 "${label}"을 삭제하시겠습니까?`
      : `자동 입출금 "${label}"을 삭제하시겠습니까?\n(입출금 탭에서 재조회·저장할 수 있습니다)`
    if (!window.confirm(msg)) return

    setDeleting(it._id)
    try {
      const col = isCashflow ? 'cashflow' : 'trades'
      const ref = doc(db,'users',user.uid,'portfolio',col,'records',it._id)
      await deleteDoc(ref)
      setItems(prev=>prev.filter(x=>x._id!==it._id))
    } catch(e){ console.error(e) }
    setDeleting(null)
  }

  // 중복 입출금 탐지 및 일괄 제거
  // 같은 날짜+금액 중복 건 → 최신 savedAt 외 삭제
  const deduplicateFlows = async () => {
    if (!user) return
    const cfItems = items.filter(it=>it._col==='cashflow')
    // contentKey로 그룹핑
    const groups = {}
    cfItems.forEach(it=>{
      const key = makeCfContentKey(it)
      if (!groups[key]) groups[key] = []
      groups[key].push(it)
    })
    const duplicates = Object.values(groups).filter(g=>g.length>1)
    if (!duplicates.length) { alert('중복 항목이 없습니다.'); return }

    const totalDup = duplicates.reduce((s,g)=>s+(g.length-1), 0)
    if (!window.confirm(`중복 입출금 ${totalDup}건을 삭제하시겠습니까?\n(날짜+금액이 동일한 항목 중 오래된 것 삭제)`)) return

    try {
      const idsToDelete = []
      for (const group of duplicates) {
        const sorted = [...group].sort((a,b)=>{
          const at = a.savedAt?.seconds || 0
          const bt = b.savedAt?.seconds || 0
          return bt - at
        })
        sorted.slice(1).forEach(it=>idsToDelete.push(it._id))
      }
      await Promise.all(idsToDelete.map(id=>{
        const ref = doc(db,'users',user.uid,'portfolio','cashflow','records',id)
        return deleteDoc(ref)
      }))
      setItems(prev=>prev.filter(it=>!idsToDelete.includes(it._id)))
      alert(`${idsToDelete.length}건 중복 제거 완료`)
    } catch(e){ console.error(e) }
  }

  // 배당 미분류 건 (입금이지만 category가 'in'인 것 — 수동 재분류 대상)
  const unclassifiedCount = items.filter(it=>it._col==='cashflow'&&it.category==='in').length

  // 중복 입출금 건수
  const dupCount = (() => {
    const cfItems = items.filter(it=>it._col==='cashflow')
    const seen = {}
    let cnt = 0
    cfItems.forEach(it=>{
      const key = makeCfContentKey(it)
      seen[key] = (seen[key]||0)+1
      if (seen[key]===2) cnt++ // 2번째부터 카운트
    })
    return cnt
  })()

  // 입출금 중복 항목 Map (날짜+금액 기준) — tbody에서 중복 표시용
  const dupMap = {}
  items.filter(x=>x._col==='cashflow').forEach(x=>{
    const k = makeCfContentKey(x)
    dupMap[k] = (dupMap[k]||0)+1
  })

  const typeColor = (it) => {
    if (it.type==='buy')  return '#EF4444'
    if (it.type==='sell') return '#3B82F6'
    if (it.type==='in')   return '#059669'
    return '#94A3B8'
  }

  return (
    <div className="pp-panel">
      {/* 상단 헤더 */}
      <div className="pp-panel-hdr">
        <div style={{display:'flex',gap:4}}>
          {[{id:'log',label:'📓 내역'},{id:'analysis',label:'📊 성과분석'}].map(v=>(
            <button key={v.id} className={`pp-period-btn ${view===v.id?'active':''}`}
              style={{fontWeight:view===v.id?700:500}} onClick={()=>setView(v.id)}>{v.label}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:6}}>
          {view==='log' && dupCount>0 && (
            <button className="pp-btn" onClick={deduplicateFlows}
              style={{color:'#D97706',borderColor:'#D97706',fontSize:11}}>
              ⚠️ 중복 {dupCount}건 제거
            </button>
          )}
          {view==='log' && (
            <button className="pp-btn primary" onClick={()=>setShowAdd(true)}>+ 수동 추가</button>
          )}
          <button className="pp-btn" onClick={view==='log'?load:loadAll} disabled={loading}>↺</button>
        </div>
      </div>

      {/* 수동 추가 모달 */}
      {showAdd && (
        <AddEntryModal user={user} onClose={()=>setShowAdd(false)} onSaved={load}/>
      )}

      {/* ── 가져오기 패널 (토글) ── */}
      {view==='log' && (
        <ImportPanel user={user} onImported={load}/>
      )}

      {/* ── 내역 탭 ── */}
      {view==='log' && (<>
        <PeriodBar frDt={frDt} toDt={toDt} onChange={(f,t)=>{setFrDt(f);setToDt(t)}}/>

        {/* 미분류 입금 안내 */}
        {unclassifiedCount > 0 && (
          <div style={{padding:'8px 12px',background:'#FFFBEB',border:'1px solid #FCD34D',borderRadius:7,
            fontSize:11,color:'#92400E',marginBottom:10,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span>⚠️ 미분류 입금 {unclassifiedCount}건 — 배당/이자/이체로 재분류하세요 (카테고리 셀 클릭)</span>
            <button className="pp-period-btn" onClick={()=>setTab('transfer')} style={{fontSize:10}}>확인</button>
          </div>
        )}

        {/* 탭 필터 */}
        <div style={{display:'flex',gap:5,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
          {TABS.map(t=>{
            const cnt = t.id==='all' ? items.length
              : t.id==='buy'      ? items.filter(x=>x.type==='buy').length
              : t.id==='sell'     ? items.filter(x=>x.type==='sell').length
              : t.id==='dividend' ? items.filter(x=>x.category==='dividend').length
              : t.id==='transfer' ? items.filter(x=>['in','out','transfer'].includes(x.category)).length
              : items.filter(x=>x.source==='manual').length
            return (
              <button key={t.id} className={`pp-period-btn ${tab===t.id?'active':''}`}
                onClick={()=>setTab(t.id)}>
                {t.label}
                <span style={{marginLeft:4,fontSize:10,opacity:.7}}>{cnt}</span>
              </button>
            )
          })}
        </div>

        {loading && <div className="pp-loading"><div className="pp-spinner"/><span>불러오는 중...</span></div>}

        {!loading && filtered.length===0 && (
          <div className="pp-empty">
            <div className="pp-empty-icon">📓</div>
            <div className="pp-empty-title">저장된 내역 없음</div>
            <div className="pp-empty-sub">매매내역·입출금 탭에서 조회 후 저장하거나<br/>"+ 수동 추가" 버튼으로 직접 입력하세요.</div>
          </div>
        )}

        {!loading && filtered.length>0 && (
          <div className="pp-table-wrap" style={{overflowX:'auto'}}>
            <table className="pp-table" style={{minWidth:820}}>
              <thead><tr>
                <th style={{textAlign:'left',width:16}}></th>  {/* 출처 바 */}
                <th style={{textAlign:'left'}}>날짜</th>
                <th style={{textAlign:'left'}}>구분·출처</th>
                <th style={{textAlign:'left'}}>종목/항목</th>
                <th>매수금액(단가×수량)</th>
                <th>매도금액(단가×수량)</th>
                <th>실현손익</th>
                <th style={{textAlign:'left',minWidth:150}}>메모·진입근거</th>
                <th></th>  {/* 삭제 */}
              </tr></thead>
              <tbody>
                {filtered.map((it,i)=>{
                  const isManual = it.source==='manual'
                  const isSell   = it.type==='sell'
                  const isBuy    = it.type==='buy'
                  const isCash   = it._col==='cashflow'
                  const cat      = isCash ? getCfCat(it.category||it.type) : null
                  const isDup    = isCash && (dupMap[makeCfContentKey(it)]||0) > 1
                  const barColor = isDup ? '#EF4444' : isManual ? '#D97706' : '#E2E8F0'

                  return (
                    <tr key={`${it._id}_${i}`}
                      style={{background: isDup?'#FFF5F5': isManual?'#FFFDF7':'white'}}
                      className="pp-journal-row">
                      {/* 출처 컬러 바 */}
                      <td style={{padding:0,width:4}}>
                        <div style={{width:3,height:'100%',minHeight:36,background:barColor,borderRadius:2}}/>
                      </td>

                      {/* 날짜 */}
                      <td style={{textAlign:'left',fontFamily:'monospace',fontSize:11,whiteSpace:'nowrap'}}>
                        {fmtDate(it.date)}
                        {isDup && <div style={{fontSize:9,color:'#EF4444',fontWeight:700,marginTop:1}}>⚠ 중복</div>}
                      </td>

                      {/* 구분 + 출처 뱃지 */}
                      <td style={{textAlign:'left'}}>
                        <div style={{display:'flex',flexDirection:'column',gap:2}}>
                          {isCash ? (
                            /* 카테고리 인라인 드롭다운 */
                            catEdit===it._id ? (
                              <div style={{display:'flex',flexWrap:'wrap',gap:3,background:'white',
                                border:'1px solid var(--border)',borderRadius:6,padding:4,position:'relative',zIndex:10}}>
                                {CF_CATEGORIES.map(c=>(
                                  <button key={c.id}
                                    style={{padding:'2px 8px',borderRadius:10,fontSize:10,border:`1px solid ${c.color}`,
                                      background:c.bg,color:c.color,cursor:'pointer',fontWeight:700}}
                                    onClick={()=>updateCat(it,c.id)}>{c.label}</button>
                                ))}
                                <button style={{padding:'2px 6px',fontSize:10,border:'1px solid var(--border)',
                                  borderRadius:10,cursor:'pointer',color:'var(--text-dim)'}}
                                  onClick={()=>setCatEdit(null)}>✕</button>
                              </div>
                            ) : (
                              <span style={{display:'inline-flex',alignItems:'center',gap:4,cursor:'pointer'}}
                                onClick={()=>setCatEdit(it._id)} title="클릭해서 카테고리 변경">
                                <span style={{padding:'2px 7px',borderRadius:10,fontSize:10,fontWeight:700,
                                  color:cat.color,background:cat.bg,border:`1px solid ${cat.color}33`}}>
                                  {cat.label}
                                </span>
                                <span style={{fontSize:9,color:'var(--text-dim)'}}>▼</span>
                              </span>
                            )
                          ) : (
                            <span style={{color:typeColor(it),fontWeight:700,fontSize:12}}>
                              {isBuy?'매수':isSell?'매도':it.type==='in'?'입금':'출금'}
                            </span>
                          )}
                          <span style={{fontSize:9,padding:'1px 5px',borderRadius:8,
                            color:isManual?'#D97706':'#94A3B8',
                            background:isManual?'#FEF3C7':'#F1F5F9',
                            display:'inline-block',width:'fit-content'}}>
                            {isManual?'✏ 수동':'🔗 자동'}
                          </span>
                        </div>
                      </td>

                      {/* 종목/항목 */}
                      <td style={{textAlign:'left'}}>
                        {it.name
                          ? <><div className="pp-stock-name">{it.name}</div>
                              <div className="pp-stock-code">{it.code}</div></>
                          : <span style={{fontSize:11,color:'var(--text-dim)'}}>{it.rmrk_nm||it.io_tp_nm||'-'}</span>
                        }
                      </td>

                      {/* 매수 금액·단가·수량 */}
                      <td>
                        {isBuy||isCash ? (
                          <div style={{textAlign:'right'}}>
                            <div style={{fontWeight:700,fontSize:12}}>{fmt(it.amount||0)}</div>
                            {isBuy && it.price && it.qty &&
                              <div style={{fontSize:10,color:'var(--text-dim)'}}>
                                {fmt(it.price)}×{fmt(it.qty)}
                              </div>
                            }
                          </div>
                        ) : <span style={{color:'var(--text-dim)'}}>-</span>}
                      </td>

                      {/* 매도 금액·단가·수량 */}
                      <td>
                        {isSell ? (
                          <div style={{textAlign:'right'}}>
                            <div style={{fontWeight:700,fontSize:12}}>{fmt(it.amount||0)}</div>
                            {it.price && it.qty &&
                              <div style={{fontSize:10,color:'var(--text-dim)'}}>
                                {fmt(it.price)}×{fmt(it.qty)}
                              </div>
                            }
                          </div>
                        ) : <span style={{color:'var(--text-dim)'}}>-</span>}
                      </td>

                      {/* 실현손익 */}
                      <td>
                        {isSell && it.profit!=null ? (
                          <div style={{textAlign:'right'}}>
                            <div className={Number(it.profit)>=0?'up':'down'} style={{fontWeight:700,fontSize:12}}>
                              {Number(it.profit)>=0?'+':''}{fmt(it.profit)}
                            </div>
                            {it.profit_rt!=null &&
                              <div style={{fontSize:10,color:Number(it.profit_rt)>=0?'#EF4444':'#3B82F6'}}>
                                {Number(it.profit_rt)>=0?'+':''}{Number(it.profit_rt||0).toFixed(2)}%
                              </div>
                            }
                          </div>
                        ) : <span style={{color:'var(--text-dim)',fontSize:11}}>-</span>}
                      </td>

                      {/* 메모 + 진입근거 */}
                      <td style={{textAlign:'left'}}>
                        {editId===it._id ? (
                          <div style={{display:'flex',gap:4,alignItems:'center'}}>
                            <input autoFocus value={editText} onChange={e=>setEditText(e.target.value)}
                              onKeyDown={e=>{ if(e.key==='Enter') saveMemo(it); if(e.key==='Escape') setEditId(null) }}
                              style={{flex:1,padding:'3px 6px',fontSize:11,border:'1px solid var(--accent-mid)',
                                borderRadius:4,outline:'none',minWidth:80}}
                              placeholder="메모 입력 후 Enter"/>
                            <button className="pp-btn" style={{padding:'2px 5px',fontSize:10}}
                              onClick={()=>saveMemo(it)} disabled={saving}>{saving?'…':'✓'}</button>
                            <button className="pp-btn" style={{padding:'2px 5px',fontSize:10}}
                              onClick={()=>setEditId(null)}>✕</button>
                          </div>
                        ) : (
                          <div onClick={()=>{setEditId(it._id);setEditText(it.memo||'')}}
                            style={{cursor:'pointer',minHeight:20}}>
                            {it.reason_tag && (
                              <span style={{fontSize:9,padding:'1px 5px',borderRadius:8,
                                background:'var(--accent-light)',color:'var(--accent-mid)',
                                fontWeight:700,marginRight:4}}>{it.reason_tag}</span>
                            )}
                            <span style={{fontSize:11,
                              color:it.memo?'var(--text-primary)':'var(--text-dim)',
                              fontStyle:it.memo?'normal':'italic'}}>
                              {it.memo||'+ 메모'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 삭제: 수동 전체 + 입출금 자동 허용 / 거래 자동은 금지 */}
                      <td style={{width:32}}>
                        {(isManual || isCash) && (
                          <button
                            style={{border:'none',background:'none',cursor:'pointer',
                              color: isDup?'#EF4444': isManual?'#EF4444':'#CBD5E1',
                              fontSize:14,padding:'2px 4px',
                              opacity:deleting===it._id?.5:1,
                              fontWeight: isDup?700:400}}
                            onClick={()=>deleteItem(it)}
                            disabled={deleting===it._id}
                            title={isDup?'중복 항목 삭제':isManual?'수동 항목 삭제':'입출금 삭제 (재조회 가능)'}>
                            {deleting===it._id ? '…' : '✕'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </>)}

      {/* ── 성과분석 탭 ── */}
      {view==='analysis' && (
        <AnalysisView allTrades={allTrades} allCashflow={allCashflow}/>
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
