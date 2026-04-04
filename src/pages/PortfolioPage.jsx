// src/pages/PortfolioPage.jsx
// 포트폴리오 + 매매분석 통합 페이지

import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../firebase'
import {
  collection, addDoc, getDocs, query, setDoc,
  where, orderBy, Timestamp, writeBatch, doc, updateDoc, deleteDoc
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import ImportSyncModal from '../components/ImportSyncModal'
import './PortfolioPage.css'

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

// ── 유틸 ──────────────────────────────────────────────
const fmt  = n => Number(n||0).toLocaleString()
const fmtM = n => { const v=Number(n||0); return Math.abs(v)>=100000000?(v/100000000).toFixed(1)+'억':Math.abs(v)>=10000?(v/10000).toFixed(0)+'만':fmt(v) }
const fmtR = n => { const v=Number(n||0); return (v>0?'+':'')+v.toFixed(2)+'%' }
const sign = n => Number(n||0)>=0?'up':'down'
// 로컬 날짜 YYYYMMDD 변환 (UTC 시간대 오류 방지)
const yyyymmdd = d => {
  const y  = d.getFullYear()
  const m  = String(d.getMonth()+1).padStart(2,'0')
  const dd = String(d.getDate()).padStart(2,'0')
  return `${y}${m}${dd}`
}
const today     = () => yyyymmdd(new Date())
const daysAgo   = d  => { const dt=new Date(); dt.setDate(dt.getDate()-d); return yyyymmdd(dt) }
const toHtml    = s  => s ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : ''
const fromHtml  = s  => s ? s.replace(/-/g,'') : ''
const maxDate   = (fr, months=3) => {
  const d = new Date(`${fr.slice(0,4)}-${fr.slice(4,6)}-${fr.slice(6,8)}`)
  d.setMonth(d.getMonth() + months)
  return yyyymmdd(d)
}
const fmtDate = s => s?`${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`:''

// 요일 포함 날짜 포맷: 20260404 → 2026.04.04(토)
const DOW = ['일','월','화','수','목','금','토']
const fmtDateWithDay = s => {
  if (!s) return ''
  const d = new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`)
  return `${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}(${DOW[d.getDay()]})`
}

// 기간 프리셋 헬퍼 — 로컬 시간 기반
const thisMonthStart = () => { const d=new Date(); d.setDate(1); return yyyymmdd(d) }
const thisMonthEnd   = () => { const d=new Date(); d.setMonth(d.getMonth()+1); d.setDate(0); return yyyymmdd(d) }
const prevMonthStart = () => { const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); return yyyymmdd(d) }
const prevMonthEnd   = () => { const d=new Date(); d.setDate(0); return yyyymmdd(d) }
const thisYearStart  = () => { const d=new Date(); d.setMonth(0); d.setDate(1); return yyyymmdd(d) }
const thisYearEnd    = () => { const d=new Date(); d.setMonth(11); d.setDate(31); return yyyymmdd(d) }
const prevYearStart  = () => { const d=new Date(); d.setFullYear(d.getFullYear()-1); d.setMonth(0); d.setDate(1); return yyyymmdd(d) }
const prevYearEnd    = () => { const d=new Date(); d.setFullYear(d.getFullYear()-1); d.setMonth(11); d.setDate(31); return yyyymmdd(d) }
const allTimeStart   = () => '20200101'

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
    { label: '총 평가액', value: fmt(data.tot_evlt_amt),  sub: '원', cls: 'neutral' },
    { label: '총 매입액', value: fmt(data.tot_pur_amt),   sub: '원', cls: 'neutral' },
    { label: '평가손익',  value: (Number(data.tot_evlt_pl)>=0?'+':'')+fmt(data.tot_evlt_pl),
      sub: '원', cls: sign(data.tot_evlt_pl) },
    { label: '수익률',    value: fmtR(data.tot_prft_rt),  sub: '',   cls: sign(data.tot_prft_rt) },
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
function HoldingsPanel({ data, loading, onRefresh, user }) {
  const [firstBuyMap, setFirstBuyMap] = useState({})
  const [market,      setMarket]      = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [chartItem,   setChartItem]   = useState(null)  // 차트 팝업

  // 장 상태 조회
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const r = await fetch('/api/kiwoom?type=market-status')
        const d = await r.json()
        setMarket(d)
      } catch {}
    }
    fetchStatus()
    const t = setInterval(fetchStatus, 60000)  // 1분마다 갱신
    return () => clearInterval(t)
  }, [])

  // 장중 라이브: 30초마다 자동 새로고침
  useEffect(() => {
    if (!market?.is_live) return
    const t = setInterval(() => {
      setRefreshTick(n => n + 1)
    }, 30000)
    return () => clearInterval(t)
  }, [market?.is_live])

  useEffect(() => {
    if (refreshTick > 0) onRefresh()
  }, [refreshTick])

  // 최초 매수일 조회
  useEffect(() => {
    if (!user || !data?.holdings?.length) return
    ;(async () => {
      try {
        const snap = await getDocs(
          collection(db,'users',user.uid,'portfolio','trades','records')
        ).catch(()=>({docs:[]}))
        const map = {}
        snap.docs.forEach(d => {
          const { code, date, type } = d.data()
          if (type === 'buy' && code) {
            if (!map[code] || date < map[code]) map[code] = date
          }
        })
        setFirstBuyMap(map)
      } catch{}
    })()
  }, [user, data])

  // 보유일수 계산
  const calcDays = (stk_cd) => {
    const firstDate = firstBuyMap[stk_cd]
    if (!firstDate) return null
    const d1 = new Date(`${firstDate.slice(0,4)}-${firstDate.slice(4,6)}-${firstDate.slice(6,8)}`)
    const d2 = new Date()
    return Math.floor((d2 - d1) / 86400000)
  }

  // 보유일수 → 색상 + 경고 레벨
  const dayStyle = (days) => {
    if (days === null) return { color:'var(--text-dim)', bg:'transparent', label:'-' }
    if (days < 30)  return { color:'#059669', bg:'#ECFDF5', label:`${days}일` }   // 초록: 정상
    if (days < 90)  return { color:'#D97706', bg:'#FFFBEB', label:`${days}일` }   // 노랑: 주의
    if (days < 180) return { color:'#EA580C', bg:'#FFF7ED', label:`${days}일` }   // 주황: 경고
    return             { color:'#DC2626', bg:'#FEF2F2', label:`${days}일 ⚠` }    // 빨강: 위험
  }

  if (loading) return <div className="pp-loading"><div className="pp-spinner"/><span>보유종목 조회 중...</span></div>
  if (!data?.holdings?.length) return (
    <div className="pp-empty">
      <div className="pp-empty-icon">📂</div>
      <div className="pp-empty-title">보유종목 없음</div>
      <div className="pp-empty-sub">키움 계좌에 보유 중인 종목이 없거나<br/>데이터를 불러오지 못했습니다.</div>
      <button className="pp-btn primary" onClick={onRefresh}>↺ 다시 불러오기</button>
    </div>
  )

  const maxPoss = Math.max(...data.holdings.map(h => Number(h.poss_rt||0)), 1)

  return (
    <div className="pp-panel">
      {chartItem && (
        <StockChartPopup code={chartItem.code} name={chartItem.name}
          onClose={()=>setChartItem(null)}/>
      )}
      <div className="pp-panel-hdr">
        <div>
          <div className="pp-panel-title" style={{display:'flex',alignItems:'center',gap:8}}>
            보유현황
            {/* 장 상태 배지 */}
            {market && (
              <span style={{
                fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:8,
                color: market.is_live ? '#059669' : '#64748B',
                background: market.is_live ? '#ECFDF5' : '#F1F5F9',
                border: `1px solid ${market.is_live ? '#6EE7B7' : '#CBD5E1'}`,
                display:'inline-flex', alignItems:'center', gap:4,
              }}>
                {market.is_live && (
                  <span style={{width:6,height:6,borderRadius:'50%',background:'#059669',
                    animation:'pp-pulse 1.5s ease-in-out infinite',display:'inline-block'}}/>
                )}
                {market.label}
              </span>
            )}
          </div>
          <div className="pp-panel-sub">
            키움 실시간 잔고 · {data.holdings.length}종목
            {market?.is_live && <span style={{color:'#059669',marginLeft:6}}>· 30초마다 자동 갱신</span>}
            {market && !market.is_live && <span style={{color:'var(--text-dim)',marginLeft:6}}>· 전일 종가 기준</span>}
          </div>
        </div>
        <button className="pp-btn" onClick={onRefresh}>↺ 새로고침</button>
      </div>

      <div className="pp-table-wrap">
        <table className="pp-table">
          <thead>
            <tr>
              <th style={{textAlign:'left'}}>종목</th>
              <th>현재가</th>
              <th>{market?.is_live ? '당일 등락 🔴' : '전일 등락'}</th>
              <th>보유수량</th>
              <th>평균단가</th>
              <th>평가금액</th>
              <th>손익금액</th>
              <th>수익률</th>
              <th style={{minWidth:100}}>비중</th>
              <th>보유일</th>
            </tr>
          </thead>
          <tbody>
            {data.holdings.map(h => {
              // flu_rt: 서버가 직접 계산한 전일대비 등락률 우선 사용
              const fluRt  = Number(h.flu_rt  || 0)
              const fluPrc = Number(h.pred_pre || 0) ||
                             (Number(h.cur_prc||0) - Number(h.pred_close_pric||0))
              const poss   = Number(h.poss_rt||0)
              const barW   = Math.round((poss / maxPoss) * 100)
              const days   = calcDays(h.stk_cd)
              const ds     = dayStyle(days)
              return (
                <tr key={h.stk_cd}>
                  <td>
                    <div className="pp-stock-name"
                      onClick={()=>setChartItem({code:h.stk_cd.replace(/^A/,''),name:h.stk_nm})}
                      style={{cursor:'pointer',color:'var(--accent-mid)'}}
                      onMouseEnter={e=>e.currentTarget.style.textDecoration='underline'}
                      onMouseLeave={e=>e.currentTarget.style.textDecoration='none'}
                      title={`${h.stk_nm} 차트 보기`}>
                      {h.stk_nm}
                    </div>
                    <div className="pp-stock-code">{h.stk_cd}</div>
                  </td>
                  <td style={{fontVariantNumeric:'tabular-nums'}}>{fmt(h.cur_prc)}</td>
                  <td className={fluPrc>=0?'up':'down'}>
                    <div style={{fontWeight:700,fontVariantNumeric:'tabular-nums'}}>
                      {fluPrc>=0?'+':''}{fmt(fluPrc)}
                    </div>
                    <div style={{fontSize:10,fontVariantNumeric:'tabular-nums'}}>
                      {fluRt>=0?'+':''}{fluRt.toFixed(2)}%
                    </div>
                  </td>
                  <td style={{fontVariantNumeric:'tabular-nums'}}>{fmt(h.rmnd_qty)}</td>
                  <td style={{fontVariantNumeric:'tabular-nums'}}>{fmt(h.pur_pric)}</td>
                  <td style={{fontVariantNumeric:'tabular-nums'}}>{fmt(h.evlt_amt)}</td>
                  <td className={sign(h.evltv_prft)} style={{fontVariantNumeric:'tabular-nums'}}>
                    {(Number(h.evltv_prft)>=0?'+':'')+fmt(h.evltv_prft)}
                  </td>
                  <td className={sign(h.prft_rt)}>{fmtR(h.prft_rt)}</td>
                  {/* 비중 + 데이터 바 */}
                  <td style={{textAlign:'right'}}>
                    <div style={{fontSize:11,fontWeight:700,fontVariantNumeric:'tabular-nums',
                      marginBottom:3}}>{poss.toFixed(1)}%</div>
                    <div style={{height:5,background:'var(--border)',borderRadius:3,overflow:'hidden'}}>
                      <div style={{
                        height:'100%', width:`${barW}%`,
                        background: poss >= 30 ? '#EF4444' : poss >= 15 ? '#F59E0B' : 'var(--accent-mid)',
                        borderRadius:3, transition:'width .4s'
                      }}/>
                    </div>
                  </td>
                  {/* 보유일자 */}
                  <td>
                    <span style={{
                      fontSize:11, fontWeight:600, padding:'2px 7px',
                      borderRadius:8, color:ds.color, background:ds.bg,
                      fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap'
                    }}>
                      {ds.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
                    <td style={{textAlign:'left',}}>{fmtDate(it.date)}</td>
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

// ── 누적 수익 라인차트 ────────────────────────────────
function LineChart({ series, height=160 }) {
  // series: [{date, value, label}]
  if (!series?.length) return null
  const VW=700, VH=height+50, PAD={t:16,b:28,l:60,r:16}
  const iW=VW-PAD.l-PAD.r, iH=VH-PAD.t-PAD.b
  const vals = series.map(s=>s.value)
  const minV = Math.min(0,...vals), maxV = Math.max(0,...vals)
  const rng  = maxV-minV || 1
  const px = (_,i) => PAD.l + i/(series.length-1||1)*iW
  const py = v => PAD.t + iH - ((v-minV)/rng*iH)
  const zero = py(0)
  const pts  = series.map((s,i)=>`${px(s,i).toFixed(1)},${py(s.value).toFixed(1)}`).join(' ')
  const area = `M${px(series[0],0)},${zero} ` +
    series.map((s,i)=>`L${px(s,i).toFixed(1)},${py(s.value).toFixed(1)}`).join(' ') +
    ` L${px(series[series.length-1],series.length-1)},${zero} Z`

  // Y축 레이블 3개
  const yTicks = [minV, (minV+maxV)/2, maxV]
  // X축 최대 6개
  const xStep  = Math.max(1, Math.ceil(series.length/6))
  const xTicks = series.filter((_,i)=>i%xStep===0||i===series.length-1)

  return (
    <div style={{width:'100%',overflowX:'auto'}}>
      <svg viewBox={`0 0 ${VW} ${VH}`} style={{width:'100%',minWidth:300,display:'block'}}>
        <defs>
          <linearGradient id="lg-up" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1D9E75" stopOpacity=".25"/>
            <stop offset="100%" stopColor="#1D9E75" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="lg-dn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E24B4A" stopOpacity="0"/>
            <stop offset="100%" stopColor="#E24B4A" stopOpacity=".2"/>
          </linearGradient>
        </defs>
        {/* 그리드 */}
        {yTicks.map((v,i)=>(
          <g key={i}>
            <line x1={PAD.l} y1={py(v)} x2={VW-PAD.r} y2={py(v)}
              stroke="#E2E8F0" strokeWidth="0.5" strokeDasharray="3,3"/>
            <text x={PAD.l-6} y={py(v)+4} textAnchor="end" fontSize="10" fill="#94A3B8">
              {v>=0?'':'-'}{Math.abs(Math.round(v/10000))}만
            </text>
          </g>
        ))}
        {/* 기준선 */}
        {minV<0&&maxV>0&&<line x1={PAD.l} y1={zero} x2={VW-PAD.r} y2={zero}
          stroke="#94A3B8" strokeWidth="1" strokeDasharray="4,2"/>}
        {/* 영역 채우기 */}
        <path d={area} fill={maxV>=0?"url(#lg-up)":"url(#lg-dn)"}/>
        {/* 라인 */}
        <polyline points={pts} fill="none"
          stroke={vals[vals.length-1]>=0?"#1D9E75":"#E24B4A"} strokeWidth="2"/>
        {/* 포인트 (10개 이하일 때) */}
        {series.length<=20&&series.map((s,i)=>(
          <circle key={i} cx={px(s,i)} cy={py(s.value)} r="3"
            fill={s.value>=0?"#1D9E75":"#E24B4A"}/>
        ))}
        {/* X축 */}
        {xTicks.map((s,i)=>(
          <text key={i} x={px(s,series.indexOf(s))} y={VH-8}
            textAnchor="middle" fontSize="10" fill="#94A3B8">
            {`${s.date.slice(4,6)}/${s.date.slice(6,8)}`}
          </text>
        ))}
      </svg>
    </div>
  )
}

// ── 성과분석 탭 ───────────────────────────────────────
function AnalysisView({ allTrades, allCashflow }) {
  const [period,   setPeriod]   = useState('thismonth')
  const [customFr, setCustomFr] = useState(thisMonthStart())
  const [customTo, setCustomTo] = useState(thisMonthEnd())

  const PERIODS = [
    { id:'thismonth', fr:thisMonthStart(), to:thisMonthEnd()  },
    { id:'prevmonth', fr:prevMonthStart(), to:prevMonthEnd()  },
    { id:'thisyear',  fr:thisYearStart(),  to:thisYearEnd()   },
    { id:'prevyear',  fr:prevYearStart(),  to:prevYearEnd()   },
    { id:'all',       fr:allTimeStart(),   to:today()         },
    { id:'custom',    fr:customFr,         to:customTo        },
  ]
  const PERIOD_LABELS = { thismonth:'당월', prevmonth:'전월', thisyear:'올해', prevyear:'전년', all:'전체', custom:'직접입력' }
  const { fr, to } = PERIODS.find(p=>p.id===period) || PERIODS[0]

  const filterItems = items => items.filter(it=>it.date>=fr&&it.date<=to)
  const trades   = filterItems(allTrades)
  const cashflow = filterItems(allCashflow)

  // ── 기본 집계 ──
  const buys  = trades.filter(t=>t.type==='buy')
  const sells = trades.filter(t=>t.type==='sell')
  const calcNet = x => Math.round(Number(x.profit||0)-Number(x.fee||0)-Number(x.tax||0))

  const totalBuyAmt  = buys.reduce((s,x)=>s+Math.abs(Number(x.amount||0)),0)
  const totalSellAmt = sells.reduce((s,x)=>s+Math.abs(Number(x.amount||0)),0)

  const sellsWithProfit = sells.filter(s=>s.profit!=null)
  const winners = sellsWithProfit.filter(s=>calcNet(s)>0)
  const losers  = sellsWithProfit.filter(s=>calcNet(s)<=0)

  const netPL      = sellsWithProfit.reduce((s,x)=>s+calcNet(x),0)
  const plSellAmt  = sellsWithProfit.reduce((s,x)=>s+Math.abs(Number(x.amount||0)),0)
  const plRt       = plSellAmt>0 ? netPL/plSellAmt*100 : null
  const winRate    = sellsWithProfit.length>0 ? winners.length/sellsWithProfit.length*100 : null
  const avgWin     = winners.length>0 ? winners.reduce((s,x)=>s+calcNet(x),0)/winners.length : 0
  const avgLoss    = losers.length>0  ? Math.abs(losers.reduce((s,x)=>s+calcNet(x),0)/losers.length) : 0
  const rrRatio    = avgLoss>0 ? avgWin/avgLoss : null
  const ev         = winRate!=null ? ((winRate/100*avgWin)-((1-winRate/100)*avgLoss)) : null

  // ── 배당 집계 ──
  const divItems = cashflow.filter(c=>['dividend','profit'].includes(c.category))
  const totalDiv = divItems.reduce((s,x)=>s+Math.abs(Number(x.amount||0))-Number(x.tax||0),0)
  const divRt    = totalBuyAmt>0 ? totalDiv/totalBuyAmt*100 : null

  // ── 복합 수익 ──
  const totalProfit = netPL+totalDiv
  const totalRt     = totalBuyAmt>0 ? totalProfit/totalBuyAmt*100 : null

  // ── MDD ──
  const sortedSells = [...sellsWithProfit].sort((a,b)=>a.date.localeCompare(b.date))
  let cumul=0,peak=0,mdd=0
  sortedSells.forEach(s=>{ cumul+=calcNet(s); if(cumul>peak)peak=cumul; const dd=peak-cumul; if(dd>mdd)mdd=dd })

  // ── 누적 라인차트 데이터 ──
  let running=0
  const cumulSeries = sortedSells.map(s=>{ running+=calcNet(s); return { date:s.date, value:running, name:s.name } })

  // ── 베스트 / 워스트 ──
  const sortedByNet = [...sellsWithProfit].sort((a,b)=>calcNet(b)-calcNet(a))
  const best3  = sortedByNet.slice(0,3)
  const worst3 = [...sortedByNet].reverse().slice(0,3)

  // ── 월별 성과 테이블 ──
  const monthMap = {}
  sellsWithProfit.forEach(s=>{
    const ym=s.date.slice(0,6)
    if(!monthMap[ym]) monthMap[ym]={ym,sells:0,wins:0,losses:0,profit:0,maxWin:0,maxLoss:0,div:0}
    const n=calcNet(s); monthMap[ym].sells++; monthMap[ym].profit+=n
    if(n>0){monthMap[ym].wins++;if(n>monthMap[ym].maxWin)monthMap[ym].maxWin=n}
    else{monthMap[ym].losses++;if(n<monthMap[ym].maxLoss)monthMap[ym].maxLoss=n}
  })
  divItems.forEach(d=>{
    const ym=d.date.slice(0,6)
    if(!monthMap[ym]) monthMap[ym]={ym,sells:0,wins:0,losses:0,profit:0,maxWin:0,maxLoss:0,div:0}
    monthMap[ym].div+=Math.abs(Number(d.amount||0))-Number(d.tax||0)
  })
  const monthArr = Object.values(monthMap).sort((a,b)=>a.ym.localeCompare(b.ym))
  let cumProfit=0
  monthArr.forEach(m=>{cumProfit+=m.profit+m.div;m.cumul=cumProfit})

  // ── 종목별 성과 ──
  const byCode={}
  trades.forEach(t=>{
    if(!t.code) return
    if(!byCode[t.code]) byCode[t.code]={name:t.name,code:t.code,buyCnt:0,sellCnt:0,buyAmt:0,sellAmt:0,profit:0,fee:0,wins:0,hasProfit:false}
    if(t.type==='buy'){byCode[t.code].buyCnt++;byCode[t.code].buyAmt+=Number(t.amount||0)}
    if(t.type==='sell'){
      byCode[t.code].sellCnt++;byCode[t.code].sellAmt+=Math.abs(Number(t.amount||0))
      byCode[t.code].fee+=Number(t.fee||0)+Number(t.tax||0)
      if(t.profit!=null){const n=calcNet(t);byCode[t.code].profit+=n;byCode[t.code].hasProfit=true;if(n>0)byCode[t.code].wins++}
    }
  })
  const byCodeArr=Object.values(byCode).filter(s=>s.hasProfit).sort((a,b)=>b.profit-a.profit)

  const hasProfitData=sellsWithProfit.length>0
  const nc = v=>v>=0?'#B91C1C':'#1D4ED8'
  const gc = v=>v>=0?'#085041':'#791F1F'   // 초록/빨강 (성과용)
  const totalBuyAmt = buys.reduce((s,x)=>s+Math.abs(Number(x.amount||0)),0)

  return (
    <div>
      {/* 기간 선택 */}
      <div className="pp-jrn-period" style={{marginBottom:14}}>
        {Object.entries(PERIOD_LABELS).map(([id,label])=>(
          <button key={id} className={`pp-period-btn ${period===id?'active':''}`}
            onClick={()=>setPeriod(id)}>{label}</button>
        ))}
        {period==='custom' && (<>
          <div className="pp-datepick-wrap">
            <span className="pp-datepick-label">{fmtDateWithDay(customFr)}</span>
            <input type="date" className="pp-datepick-input" value={toHtml(customFr)}
              onChange={e=>setCustomFr(fromHtml(e.target.value))} max={toHtml(today())}/>
          </div>
          <span className="pp-period-sep">~</span>
          <div className="pp-datepick-wrap">
            <span className="pp-datepick-label">{fmtDateWithDay(customTo)}</span>
            <input type="date" className="pp-datepick-input" value={toHtml(customTo)}
              onChange={e=>setCustomTo(fromHtml(e.target.value))} max={toHtml(today())}/>
          </div>
        </>)}
      </div>

      {trades.length===0 && cashflow.length===0 ? (
        <div className="pp-empty">
          <div className="pp-empty-icon">📊</div>
          <div className="pp-empty-title">해당 기간 데이터 없음</div>
          <div className="pp-empty-sub">매매내역 탭에서 API 동기화 후 확인하세요.</div>
        </div>
      ) : (<>

        {/* ── KPI 1행 — 핵심 6카드 ── */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:10}}>

          {/* 매도건수 + 승률 바 */}
          <div style={{background:'var(--bg-panel)',border:'.5px solid var(--border)',borderRadius:10,padding:'13px 15px'}}>
            <div style={{fontSize:10,color:'var(--text-dim)',fontWeight:600,marginBottom:6}}>매도 · 승률</div>
            <div style={{fontSize:20,fontWeight:700,color:'var(--text-primary)',marginBottom:2}}>{sells.length}건</div>
            <div style={{fontSize:10,color:'var(--text-dim)',marginBottom:8}}>
              수익 {winners.length}건 · 손실 {losers.length}건
            </div>
            {sellsWithProfit.length>0&&(<>
              <div style={{display:'flex',height:4,borderRadius:3,overflow:'hidden',gap:1}}>
                <div style={{flex:winners.length,background:'#1D9E75',borderRadius:'3px 0 0 3px'}}/>
                <div style={{flex:losers.length,background:'#E24B4A',borderRadius:'0 3px 3px 0'}}/>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                <span style={{fontSize:11,fontWeight:700,color:'#085041'}}>{winRate?.toFixed(1)}%</span>
                <span style={{fontSize:10,color:'var(--text-dim)'}}>승률</span>
              </div>
            </>)}
          </div>

          {/* 매매 실현손익 */}
          <div style={{background:'var(--bg-panel)',border:`.5px solid ${hasProfitData&&netPL>=0?'#9FE1CB':'var(--border)'}`,borderRadius:10,padding:'13px 15px'}}>
            <div style={{fontSize:10,color:'var(--text-dim)',fontWeight:600,marginBottom:6}}>매매 실현손익</div>
            <div style={{fontSize:18,fontWeight:700,fontVariantNumeric:'tabular-nums',color:hasProfitData?gc(netPL):'var(--text-dim)',marginBottom:2}}>
              {hasProfitData?(netPL>=0?'+':'')+netPL.toLocaleString():'-'}
            </div>
            <div style={{fontSize:10,color:hasProfitData?gc(netPL):'var(--text-dim)'}}>
              {plRt!=null?(plRt>=0?'+':'')+plRt.toFixed(2)+'%':''} {sellsWithProfit.length>0?`· 확정 ${sellsWithProfit.length}건`:''}
            </div>
          </div>

          {/* 배당 */}
          <div style={{background:'var(--bg-panel)',border:'.5px solid var(--border)',borderRadius:10,padding:'13px 15px'}}>
            <div style={{fontSize:10,color:'var(--text-dim)',fontWeight:600,marginBottom:6}}>배당 (세후)</div>
            <div style={{fontSize:18,fontWeight:700,fontVariantNumeric:'tabular-nums',color:totalDiv>0?'#085041':'var(--text-dim)',marginBottom:2}}>
              {totalDiv>0?'+'+Math.round(totalDiv).toLocaleString():'-'}
            </div>
            <div style={{fontSize:10,color:totalDiv>0?'#1D9E75':'var(--text-dim)'}}>
              {divRt!=null?'+'+divRt.toFixed(2)+'%':''}  {divItems.length>0?`· ${divItems.length}건`:'데이터 없음'}
            </div>
          </div>

          {/* 총수익 */}
          <div style={{background:'var(--bg-panel)',border:`.5px solid ${totalProfit>=0?'#9FE1CB':'#F7C1C1'}`,borderRadius:10,padding:'13px 15px'}}>
            <div style={{fontSize:10,color:'var(--text-dim)',fontWeight:600,marginBottom:6}}>총수익 (매매+배당)</div>
            <div style={{fontSize:18,fontWeight:700,fontVariantNumeric:'tabular-nums',color:gc(totalProfit),marginBottom:2}}>
              {hasProfitData||totalDiv>0?(totalProfit>=0?'+':'')+Math.round(totalProfit).toLocaleString():'-'}
            </div>
            <div style={{fontSize:10,color:gc(totalProfit)}}>
              {totalRt!=null?(totalRt>=0?'+':'')+totalRt.toFixed(2)+'%':''}
            </div>
          </div>

          {/* MDD */}
          <div style={{background:'var(--bg-panel)',border:`.5px solid ${mdd>0?'#F7C1C1':'var(--border)'}`,borderRadius:10,padding:'13px 15px'}}>
            <div style={{fontSize:10,color:'var(--text-dim)',fontWeight:600,marginBottom:6}}>MDD</div>
            <div style={{fontSize:18,fontWeight:700,fontVariantNumeric:'tabular-nums',color:mdd>0?'#791F1F':'var(--text-dim)',marginBottom:2}}>
              {mdd>0?'-'+mdd.toLocaleString():'0'}
            </div>
            <div style={{fontSize:10,color:'var(--text-dim)'}}>최대 낙폭</div>
          </div>

          {/* 손익비 */}
          <div style={{background:'var(--bg-panel)',border:`.5px solid ${rrRatio>=1?'#B5D4F4':'var(--border)'}`,borderRadius:10,padding:'13px 15px'}}>
            <div style={{fontSize:10,color:'var(--text-dim)',fontWeight:600,marginBottom:6}}>손익비 · 기대값</div>
            <div style={{fontSize:18,fontWeight:700,color:rrRatio!=null?(rrRatio>=1?'#0C447C':'#791F1F'):'var(--text-dim)',marginBottom:2}}>
              {rrRatio!=null?rrRatio.toFixed(2):'-'}
            </div>
            <div style={{fontSize:10,color:'#378ADD'}}>
              {ev!=null?`기대값 ${ev>=0?'+':''}${Math.round(ev).toLocaleString()}원/건`:''}
            </div>
          </div>
        </div>

        {/* ── KPI 2행 — 보조 6카드 ── */}
        {hasProfitData && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:8,marginBottom:14}}>
            {[
              {l:'손익비(R:R)',  v:rrRatio!=null?rrRatio.toFixed(2):'-',        c:rrRatio>=1?'#085041':'#791F1F'},
              {l:'기대값',      v:ev!=null?(ev>=0?'+':'')+Math.round(ev).toLocaleString():'-', c:ev>=0?'#085041':'#791F1F'},
              {l:'평균 수익',   v:'+'+Math.round(avgWin).toLocaleString(),       c:'#085041'},
              {l:'평균 손실',   v:'-'+Math.round(avgLoss).toLocaleString(),      c:'#791F1F'},
              {l:'최대 수익',   v:best3[0]?'+'+calcNet(best3[0]).toLocaleString():'-', c:'#085041'},
              {l:'최대 손실',   v:worst3[0]?calcNet(worst3[0]).toLocaleString():'-',   c:'#791F1F'},
            ].map(c=>(
              <div key={c.l} style={{background:'var(--bg-base)',border:'.5px solid var(--border)',borderRadius:8,padding:'9px 11px'}}>
                <div style={{fontSize:9,color:'var(--text-dim)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.04em',marginBottom:4}}>{c.l}</div>
                <div style={{fontSize:13,fontWeight:700,fontVariantNumeric:'tabular-nums',color:c.c}}>{c.v}</div>
              </div>
            ))}
          </div>
        )}

        {!hasProfitData && (
          <div style={{padding:'8px 12px',background:'#FFFBEB',border:'1px solid #FCD34D',borderRadius:7,fontSize:11,color:'#92400E',marginBottom:14}}>
            ℹ️ 실현손익 데이터는 매매내역 탭 → 📥 API 동기화 또는 ✏ 수동입력 후 표시됩니다.
          </div>
        )}

        {/* ── 누적 라인차트 ── */}
        {cumulSeries.length>1 && (
          <div style={{background:'var(--bg-panel)',border:'.5px solid var(--border)',borderRadius:10,padding:'14px 16px',marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:600,color:'var(--text-secondary)',marginBottom:10}}>누적 실현손익 추이</div>
            <LineChart series={cumulSeries}/>
          </div>
        )}

        {/* ── 베스트 / 워스트 ── */}
        {hasProfitData && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
            {[
              {title:'베스트 TOP 3',items:best3,isWin:true},
              {title:'워스트 TOP 3',items:worst3,isWin:false},
            ].map(({title,items,isWin})=>(
              <div key={title} style={{background:'var(--bg-panel)',
                border:`.5px solid ${isWin?'#9FE1CB':'#F7C1C1'}`,borderRadius:10,padding:'13px 15px'}}>
                <div style={{fontSize:11,fontWeight:700,color:isWin?'#0F6E56':'#A32D2D',
                  display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:isWin?'#1D9E75':'#E24B4A'}}/>
                  {title}
                </div>
                {items.map((s,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:8,
                    padding:'7px 0',borderBottom:i<2?'.5px solid var(--border-dim)':'none'}}>
                    <div style={{width:18,height:18,borderRadius:'50%',flexShrink:0,
                      background:isWin?'#E1F5EE':'#FCEBEB',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:10,fontWeight:700,color:isWin?'#085041':'#791F1F'}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:600,color:'var(--text-primary)',
                        overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
                      <div style={{fontSize:10,color:'var(--text-dim)'}}>{fmtDate(s.date)}</div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontSize:12,fontWeight:700,fontVariantNumeric:'tabular-nums',
                        color:isWin?'#085041':'#791F1F'}}>
                        {isWin?'+':''}{calcNet(s).toLocaleString()}
                      </div>
                      {s.profit_rt!=null&&(
                        <div style={{fontSize:10,color:isWin?'#1D9E75':'#E24B4A'}}>
                          {isWin?'+':''}{Number(s.profit_rt).toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── 월별 성과 ── */}
        {monthArr.length>0 && (
          <div style={{background:'var(--bg-panel)',border:'.5px solid var(--border)',borderRadius:10,overflow:'hidden',marginBottom:12}}>
            <div style={{padding:'11px 15px',borderBottom:'.5px solid var(--border)'}}>
              <span style={{fontSize:12,fontWeight:600,color:'var(--text-secondary)'}}>월별 성과</span>
            </div>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead><tr>
                  <th style={{textAlign:'left'}}>월</th>
                  <th>매도</th><th>수익</th><th>손실</th><th>승률</th>
                  <th>매매손익</th><th>배당</th><th>월합계</th><th>누적</th>
                </tr></thead>
                <tbody>
                  {monthArr.map(m=>{
                    const wr=m.sells>0?(m.wins/m.sells*100):null
                    const total=m.profit+m.div
                    return (
                      <tr key={m.ym}>
                        <td style={{textAlign:'left',fontVariantNumeric:'tabular-nums',color:'var(--text-secondary)'}}>
                          {m.ym.slice(0,4)}.{m.ym.slice(4,6)}
                        </td>
                        <td>{m.sells}건</td>
                        <td style={{color:'#085041'}}>{m.wins}건</td>
                        <td style={{color:'#791F1F'}}>{m.losses}건</td>
                        <td style={{color:wr>=50?'#085041':'#791F1F'}}>{wr!=null?wr.toFixed(0)+'%':'-'}</td>
                        <td style={{fontVariantNumeric:'tabular-nums',fontWeight:600,color:gc(m.profit)}}>
                          {m.profit>=0?'+':''}{m.profit.toLocaleString()}
                        </td>
                        <td style={{fontVariantNumeric:'tabular-nums',color:'#085041'}}>
                          {m.div>0?'+'+Math.round(m.div).toLocaleString():'-'}
                        </td>
                        <td style={{fontVariantNumeric:'tabular-nums',fontWeight:600,color:gc(total)}}>
                          {total>=0?'+':''}{Math.round(total).toLocaleString()}
                        </td>
                        <td style={{fontVariantNumeric:'tabular-nums',fontWeight:700,color:gc(m.cumul)}}>
                          {m.cumul>=0?'+':''}{Math.round(m.cumul).toLocaleString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 종목별 성과 ── */}
        {byCodeArr.length>0 && (
          <div style={{background:'var(--bg-panel)',border:'.5px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
            <div style={{padding:'11px 15px',borderBottom:'.5px solid var(--border)'}}>
              <span style={{fontSize:12,fontWeight:600,color:'var(--text-secondary)'}}>종목별 성과</span>
            </div>
            {/* 헤더 */}
            <div style={{display:'flex',alignItems:'center',padding:'7px 15px',
              background:'var(--bg-base)',borderBottom:'.5px solid var(--border)',gap:8}}>
              <div style={{flex:3,fontSize:9,color:'var(--text-dim)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.04em'}}>종목</div>
              <div style={{flex:1,textAlign:'center',fontSize:9,color:'var(--text-dim)',fontWeight:600}}>매수/매도</div>
              <div style={{flex:1.4,textAlign:'right',fontSize:9,color:'var(--text-dim)',fontWeight:600}}>실현손익</div>
              <div style={{flex:.9,textAlign:'right',fontSize:9,color:'var(--text-dim)',fontWeight:600}}>수익률</div>
              <div style={{flex:.7,textAlign:'right',fontSize:9,color:'var(--text-dim)',fontWeight:600}}>승률</div>
              <div style={{flex:1.2,fontSize:9,color:'var(--text-dim)',fontWeight:600}}>손익바</div>
            </div>
            {byCodeArr.map((s,i)=>{
              const rt = s.sellAmt>0?(s.profit/s.sellAmt*100):null
              const wr = s.sellCnt>0?(s.wins/s.sellCnt*100):null
              const maxAbs = Math.max(...byCodeArr.map(x=>Math.abs(x.profit)),1)
              const barW = Math.abs(s.profit)/maxAbs*100
              return (
                <div key={s.code} style={{display:'flex',alignItems:'center',padding:'9px 15px',
                  gap:8,borderBottom:i<byCodeArr.length-1?'.5px solid var(--border-dim)':'none',
                  background:i%2===0?'transparent':'var(--bg-base)'}}>
                  <div style={{flex:3,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:'var(--text-primary)',
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
                    <div style={{fontSize:9,color:'var(--text-dim)',fontFamily:"'SFMono-Regular',monospace"}}>{s.code}</div>
                  </div>
                  <div style={{flex:1,textAlign:'center',fontSize:11,color:'var(--text-dim)'}}>
                    {s.buyCnt}매/{s.sellCnt}매
                  </div>
                  <div style={{flex:1.4,textAlign:'right',fontVariantNumeric:'tabular-nums',
                    fontWeight:700,fontSize:12,color:gc(s.profit)}}>
                    {s.profit>=0?'+':''}{s.profit.toLocaleString()}
                  </div>
                  <div style={{flex:.9,textAlign:'right',fontSize:11,fontVariantNumeric:'tabular-nums',
                    color:rt>=0?'#1D9E75':'#E24B4A'}}>
                    {rt!=null?(rt>=0?'+':'')+rt.toFixed(2)+'%':'-'}
                  </div>
                  <div style={{flex:.7,textAlign:'right',fontSize:11,
                    color:wr>=50?'#085041':'#791F1F'}}>
                    {wr!=null?wr.toFixed(0)+'%':'-'}
                  </div>
                  <div style={{flex:1.2,height:4,background:'var(--bg-base)',borderRadius:2,overflow:'hidden',
                    border:'.5px solid var(--border-dim)'}}>
                    <div style={{width:`${barW}%`,height:'100%',borderRadius:2,
                      background:s.profit>=0?'#1D9E75':'#E24B4A'}}/>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </>)}
    </div>
  )
}

// ── 종목 차트 팝업 ────────────────────────────────────
function StockChartPopup({ code, name, onClose }) {
  const [range,   setRange]   = useState('3mo')
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const RANGES = [
    { label:'1개월', val:'1mo',  period:'day',  cnt:22  },
    { label:'3개월', val:'3mo',  period:'day',  cnt:65  },
    { label:'6개월', val:'6mo',  period:'day',  cnt:130 },
    { label:'1년',   val:'1y',   period:'week', cnt:52  },
  ]

  useEffect(() => {
    if (!code) return
    setLoading(true); setError(''); setCandles([])
    const r = RANGES.find(r=>r.val===range) || RANGES[1]
    fetch(`/api/kiwoom?type=stock-chart&code=${code}&period=${r.period}`)
      .then(res=>res.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        const raw = (data.candles||[]).slice(-r.cnt).map(c=>({
          date:  c.time||c.date||'',
          open:  Number(c.open||0),
          high:  Number(c.high||0),
          low:   Number(c.low||0),
          close: Number(c.close||0),
          vol:   Number(c.volume||c.vol||0),
        })).filter(c=>c.close>0)
        setCandles(raw)
      })
      .catch(e=>setError(e.message))
      .finally(()=>setLoading(false))
  }, [code, range])

  // SVG 캔들차트 간단 렌더
  const renderChart = () => {
    if (!candles.length) return null
    const VW=700, VH=280, PL=8, PR=8, PT=20, PB=40
    const iW=VW-PL-PR, iH=VH-PT-PB
    const n = candles.length
    const barW = Math.max(2, Math.floor(iW/n*0.65))
    const colW = iW/n
    const prices = candles.flatMap(c=>[c.high,c.low]).filter(v=>v>0)
    const minP = Math.min(...prices), maxP = Math.max(...prices)
    const rng = maxP - minP || 1
    const py = v => PT + iH - ((v-minP)/rng*iH)
    const px = i => PL + (i+0.5)*colW
    const last = candles[n-1]
    const prev = candles[n-2]
    const change = prev ? ((last.close-prev.close)/prev.close*100) : 0

    // X축 날짜 — 최대 6개
    const step = Math.max(1, Math.ceil(n/6))
    const xTicks = candles.filter((_,i)=>i%step===0||i===n-1)

    return (
      <svg viewBox={`0 0 ${VW} ${VH}`} style={{width:'100%',display:'block'}}>
        {/* 그리드 3줄 */}
        {[0.25,0.5,0.75].map((t,i)=>{
          const y=PT+iH*t
          const v=maxP-(rng*t)
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={VW-PR} y2={y} stroke="#E2E8F0" strokeWidth=".5" strokeDasharray="3,3"/>
              <text x={VW-PR+2} y={y+3} fontSize="9" fill="#94A3B8" textAnchor="start">
                {v>=10000?`${Math.round(v/1000)}k`:Math.round(v)}
              </text>
            </g>
          )
        })}
        {/* 캔들 */}
        {candles.map((c,i)=>{
          const x=px(i), isUp=c.close>=c.open
          const col=isUp?'#E24B4A':'#1D4ED8'
          const top=py(Math.max(c.open,c.close))
          const bot=py(Math.min(c.open,c.close))
          const bh=Math.max(1,bot-top)
          return (
            <g key={i}>
              <line x1={x} y1={py(c.high)} x2={x} y2={py(c.low)} stroke={col} strokeWidth="1"/>
              <rect x={x-barW/2} y={top} width={barW} height={bh} fill={col} opacity=".9"/>
            </g>
          )
        })}
        {/* X축 */}
        {xTicks.map((c,i)=>(
          <text key={i} x={px(candles.indexOf(c))} y={VH-6}
            textAnchor="middle" fontSize="9" fill="#94A3B8">
            {c.date?.slice(4,6)}/{c.date?.slice(6,8)}
          </text>
        ))}
        {/* 현재가 라인 */}
        <line x1={PL} y1={py(last.close)} x2={VW-PR} y2={py(last.close)}
          stroke={change>=0?'#E24B4A':'#1D4ED8'} strokeWidth="1" strokeDasharray="4,2" opacity=".6"/>
      </svg>
    )
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:1200,
      display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'var(--bg-panel)',border:'1px solid var(--border)',
        borderRadius:14,width:'min(780px,95vw)',maxHeight:'85vh',
        display:'flex',flexDirection:'column',boxShadow:'0 24px 64px rgba(0,0,0,.22)',overflow:'hidden'}}>

        {/* 헤더 */}
        <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',
          display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
          <div>
            <span style={{fontSize:15,fontWeight:700,color:'var(--text-primary)'}}>{name}</span>
            <span style={{fontSize:12,color:'var(--text-dim)',marginLeft:8,
              fontFamily:"'SFMono-Regular',monospace"}}>{code}</span>
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            {RANGES.map(r=>(
              <button key={r.val}
                style={{padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:600,
                  border:'1px solid',cursor:'pointer',
                  borderColor:range===r.val?'var(--accent-mid)':'var(--border)',
                  background:range===r.val?'var(--accent-light)':'transparent',
                  color:range===r.val?'var(--accent-mid)':'var(--text-secondary)'}}
                onClick={()=>setRange(r.val)}>{r.label}</button>
            ))}
            <button onClick={onClose}
              style={{border:'none',background:'none',fontSize:18,cursor:'pointer',
                color:'var(--text-dim)',marginLeft:4,padding:'2px 6px'}}>✕</button>
          </div>
        </div>

        {/* 차트 */}
        <div style={{flex:1,padding:'16px 18px',overflow:'hidden'}}>
          {loading && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:200,
              gap:8,color:'var(--text-dim)',fontSize:12}}>
              <div className="pp-spinner"/> 차트 불러오는 중...
            </div>
          )}
          {error && (
            <div style={{color:'#E24B4A',fontSize:12,textAlign:'center',padding:40}}>
              ⚠ {error}
            </div>
          )}
          {!loading && !error && (
            <>
              {candles.length>0 && (() => {
                const last=candles[candles.length-1]
                const prev=candles[candles.length-2]
                const chg=prev?((last.close-prev.close)/prev.close*100):0
                return (
                  <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:12}}>
                    <span style={{fontSize:20,fontWeight:700,fontVariantNumeric:'tabular-nums',
                      color:chg>=0?'#B91C1C':'#1D4ED8'}}>
                      {last.close.toLocaleString()}
                    </span>
                    <span style={{fontSize:13,fontWeight:600,
                      color:chg>=0?'#B91C1C':'#1D4ED8'}}>
                      {chg>=0?'+':''}{chg.toFixed(2)}%
                    </span>
                    <span style={{fontSize:11,color:'var(--text-dim)',marginLeft:4}}>
                      {range} · {candles.length}봉
                    </span>
                  </div>
                )
              })()}
              {renderChart()}
              {candles.length===0 && (
                <div style={{textAlign:'center',color:'var(--text-dim)',fontSize:12,padding:60}}>
                  차트 데이터 없음
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 기존 내역 수정 모달 ───────────────────────────────
function EditEntryModal({ user, item, onClose, onSaved }) {
  const isTrade = item._col === 'trades'
  const isCash  = item._col === 'cashflow'

  const [date,    setDate]    = useState(toHtml(item.date||today()))
  const [code,    setCode]    = useState(item.code||'')
  const [name,    setName]    = useState(item.name||item.rmrk_nm||'')
  const [type,    setType]    = useState(item.type||'buy')
  const [price,   setPrice]   = useState(String(item.price||''))
  const [qty,     setQty]     = useState(String(item.qty||''))
  const [amount,  setAmount]  = useState(String(Math.abs(Number(item.amount||0))))
  const [fee,     setFee]     = useState(String(Number(item.fee||0)+Number(item.tax||0)))
  const [profit,  setProfit]  = useState(
    item.profit!=null
      ? String(Math.round(Number(item.profit)-Number(item.fee||0)-Number(item.tax||0)))
      : ''
  )
  const [cat,     setCat]     = useState(item.category||'in')
  const [memo,    setMemo]    = useState(item.memo||'')
  const [saving,  setSaving]  = useState(false)

  // 단가×수량 자동 계산
  const calcAmt = price && qty ? Number(price)*Number(qty) : null

  const save = async () => {
    if (!user) return
    setSaving(true)
    try {
      const dt  = fromHtml(date)
      const colPath = isTrade ? 'trades' : 'cashflow'
      const ref = doc(db,'users',user.uid,'portfolio',colPath,'records',item._id)

      if (isTrade) {
        const totalFee = Number(fee||0)
        const netProfit = profit !== '' ? Number(profit) : null
        // profit 역산: 입력값(순손익) + 부대비용
        const rawProfit = netProfit != null ? netProfit + totalFee : null
        const amt = calcAmt || Number(amount||0)
        const updates = {
          date, code, name, type,
          price:  Number(price||0),
          qty:    Number(qty||0),
          amount: amt,
          fee:    totalFee,
          tax:    0,
          memo,
          ...(rawProfit != null ? { profit: rawProfit } : {}),
        }
        // date는 YYYYMMDD 형식으로
        updates.date = dt
        await updateDoc(ref, updates)
      } else {
        const flowType = cat==='out' ? 'out' : 'in'
        await updateDoc(ref, {
          date: dt, category: cat, type: flowType,
          amount: Number(amount||0),
          rmrk_nm: name, memo,
        })
      }
      onSaved()
      onClose()
    } catch(e){ console.error(e) }
    setSaving(false)
  }

  const labelStyle = { fontSize:11, color:'var(--text-dim)', fontWeight:600, width:72, flexShrink:0 }
  const rowStyle   = { display:'flex', alignItems:'center', gap:10, marginBottom:12 }

  return (
    <div className="pp-modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="pp-modal" style={{maxWidth:440}}>
        <div className="pp-modal-hdr">
          <span className="pp-modal-title">
            ✏ 내역 수정
            <span style={{fontSize:10,color:'var(--text-dim)',fontWeight:400,marginLeft:8}}>
              {isTrade ? (item.name||item.code) : (item.rmrk_nm||'입출금')}
            </span>
          </span>
          <button className="pp-btn" onClick={onClose}>✕</button>
        </div>

        {/* 날짜 */}
        <div style={rowStyle}>
          <label style={labelStyle}>체결일</label>
          <input type="date" className="pp-date-input" value={date}
            onChange={e=>setDate(e.target.value)} max={toHtml(today())}
            style={{flex:1}}/>
        </div>

        {isTrade && (<>
          {/* 구분 */}
          <div style={rowStyle}>
            <label style={labelStyle}>구분</label>
            <div style={{display:'flex',gap:6}}>
              {[{v:'buy',l:'매수',c:'#B91C1C',bg:'#FEF2F2'},{v:'sell',l:'매도',c:'#1D4ED8',bg:'#EFF6FF'}].map(t=>(
                <button key={t.v}
                  style={{padding:'4px 14px',borderRadius:6,fontSize:12,fontWeight:600,border:'1px solid',cursor:'pointer',
                    borderColor:type===t.v?t.c:'var(--border)',
                    background:type===t.v?t.bg:'var(--bg-panel)',
                    color:type===t.v?t.c:'var(--text-secondary)'}}
                  onClick={()=>setType(t.v)}>{t.l}</button>
              ))}
            </div>
          </div>
          {/* 종목코드 */}
          <div style={rowStyle}>
            <label style={labelStyle}>종목코드</label>
            <input className="pp-modal-input" value={code}
              onChange={e=>setCode(e.target.value)} placeholder="예: 005930"/>
          </div>
          {/* 종목명 */}
          <div style={rowStyle}>
            <label style={labelStyle}>종목명</label>
            <input className="pp-modal-input" value={name}
              onChange={e=>setName(e.target.value)} placeholder="예: 삼성전자"/>
          </div>
          {/* 단가 */}
          <div style={rowStyle}>
            <label style={labelStyle}>단가</label>
            <input className="pp-modal-input" type="number" value={price}
              onChange={e=>setPrice(e.target.value)} placeholder="0"/>
          </div>
          {/* 수량 */}
          <div style={rowStyle}>
            <label style={labelStyle}>수량</label>
            <input className="pp-modal-input" type="number" value={qty}
              onChange={e=>setQty(e.target.value)} placeholder="0"/>
          </div>
          {/* 금액 (자동계산 표시) */}
          <div style={rowStyle}>
            <label style={labelStyle}>금액</label>
            <div style={{flex:1}}>
              <input className="pp-modal-input" type="number"
                value={calcAmt!=null ? calcAmt : amount}
                onChange={e=>setAmount(e.target.value)}
                placeholder="단가×수량 자동계산"
                style={{width:'100%'}}
                readOnly={!!(price&&qty)}/>
              {calcAmt!=null&&<div style={{fontSize:10,color:'var(--text-dim)',marginTop:2}}>
                {fmt(Number(price))} × {fmt(Number(qty))}주 = {fmt(calcAmt)}원
              </div>}
            </div>
          </div>
          {/* 부대비용 */}
          <div style={rowStyle}>
            <label style={labelStyle}>부대비용</label>
            <input className="pp-modal-input" type="number" value={fee}
              onChange={e=>setFee(e.target.value)} placeholder="수수료+세금"/>
          </div>
          {/* 실현손익 (매도만) */}
          {type==='sell' && (
            <div style={rowStyle}>
              <label style={labelStyle}>순손익</label>
              <div style={{flex:1}}>
                <input className="pp-modal-input" type="number" value={profit}
                  onChange={e=>setProfit(e.target.value)}
                  placeholder="세후 순손익 (부대비용 제외 후 금액)"/>
                <div style={{fontSize:10,color:'var(--text-dim)',marginTop:2}}>
                  부대비용({fmt(Number(fee||0))}원) 차감 후 실수령 기준
                </div>
              </div>
            </div>
          )}
        </>)}

        {isCash && (<>
          {/* 카테고리 */}
          <div style={rowStyle}>
            <label style={labelStyle}>카테고리</label>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              {CF_CATEGORIES.map(c=>(
                <button key={c.id}
                  style={{padding:'3px 10px',borderRadius:10,fontSize:11,
                    border:`1px solid ${cat===c.id?c.color:'var(--border)'}`,
                    background:cat===c.id?c.bg:'var(--bg-panel)',
                    color:cat===c.id?c.color:'var(--text-secondary)',
                    cursor:'pointer',fontWeight:cat===c.id?700:400}}
                  onClick={()=>setCat(c.id)}>{c.label}</button>
              ))}
            </div>
          </div>
          {/* 항목명 */}
          <div style={rowStyle}>
            <label style={labelStyle}>항목명</label>
            <input className="pp-modal-input" value={name}
              onChange={e=>setName(e.target.value)} placeholder="예: 삼성전자 배당금"/>
          </div>
          {/* 금액 */}
          <div style={rowStyle}>
            <label style={labelStyle}>금액</label>
            <input className="pp-modal-input" type="number" value={amount}
              onChange={e=>setAmount(e.target.value)} placeholder="0"/>
          </div>
        </>)}

        {/* 메모 */}
        <div style={rowStyle}>
          <label style={labelStyle}>메모</label>
          <input className="pp-modal-input" value={memo}
            onChange={e=>setMemo(e.target.value)} placeholder="매매 이유, 기억할 내용..."/>
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
const CF_CATEGORIES = [
  { id:'in',       label:'입금',  color:'#EF4444', bg:'#FEF2F2' },
  { id:'out',      label:'출금',  color:'#3B82F6', bg:'#EFF6FF' },
  { id:'dividend', label:'배당',  color:'#059669', bg:'#ECFDF5' },
  { id:'interest', label:'이자',  color:'#0891B2', bg:'#ECFEFF' },
  { id:'other',    label:'기타',  color:'#8B5CF6', bg:'#F5F3FF' },
]
const cfCatMap = Object.fromEntries(CF_CATEGORIES.map(c=>[c.id,c]))
const getCfCat = cat => {
  if (cat === 'profit')   return cfCatMap['dividend']  // 구 수익 → 배당
  if (cat === 'transfer') return cfCatMap['in']         // 이체 → 입금
  return cfCatMap[cat] || cfCatMap['other']
}

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
  const [mainTab,    setMainTab]    = useState('trades')  // 'trades' | 'cashflow'
  const [frDt,       setFrDt]       = useState(daysAgo(30))
  const [toDt,       setToDt]       = useState(today())
  const [tab,        setTab]        = useState('all')
  const [cfTab,      setCfTab]      = useState('all')
  const [items,      setItems]      = useState([])
  const [allTrades,  setAllTrades]  = useState([])
  const [allCashflow,setAllCashflow]= useState([])
  const [loading,    setLoading]    = useState(true)
  const [editId,     setEditId]     = useState(null)
  const [editText,   setEditText]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [showAdd,    setShowAdd]    = useState(false)
  const [catEdit,    setCatEdit]    = useState(null)
  const [deleting,   setDeleting]   = useState(null)
  const [syncModal,  setSyncModal]  = useState(null)
  const [profitEdit, setProfitEdit] = useState(null)
  const [profitVal,  setProfitVal]  = useState('')
  const [costEdit,   setCostEdit]   = useState(null)
  const [costVal,    setCostVal]    = useState('')
  const [dateEdit,   setDateEdit]   = useState(null)
  const [dateVal,    setDateVal]    = useState('')
  const [editItem,   setEditItem]   = useState(null)
  const [chartItem,  setChartItem]  = useState(null)  // 차트 팝업 대상 {code, name}

  const TRADE_TABS = [
    { id:'all',  label:'전체' },
    { id:'buy',  label:'매수' },
    { id:'sell', label:'매도' },
    { id:'manual', label:'수동' },
  ]
  const CF_TABS = [
    { id:'all',      label:'전체' },
    { id:'in',       label:'입금' },
    { id:'out',      label:'출금' },
    { id:'dividend', label:'배당' },
    { id:'interest', label:'이자' },
    { id:'other',    label:'기타' },
    { id:'manual',   label:'수동' },
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

  // 매매 탭 필터
  const trades   = items.filter(x => x._col === 'trades')
  const cashflow = items.filter(x => x._col === 'cashflow')

  const filteredTrades = trades.filter(it => {
    if (tab==='all')    return true
    if (tab==='buy')    return it.type==='buy'
    if (tab==='sell')   return it.type==='sell'
    if (tab==='manual') return it.source==='manual'
    return true
  })
  const filteredCf = cashflow.filter(it => {
    if (cfTab==='all')      return true
    if (cfTab==='in')       return it.type==='in' && !['dividend','interest','other'].includes(it.category)
    if (cfTab==='out')      return it.type==='out'
    if (cfTab==='dividend') return it.category==='dividend' || it.category==='profit'
    if (cfTab==='interest') return it.category==='interest'
    if (cfTab==='other')    return it.category==='other'
    if (cfTab==='manual')   return it.source==='manual'
    return true
  })

  // 구형 filtered (성과분석용)
  const filtered = items

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

  // 실현손익 수동 저장 (API 조회 불가 건 직접 입력)
  const saveProfitManual = async (it) => {
    if (!user) return
    const val = Number(profitVal)
    if (isNaN(val)) return
    setSaving(true)
    try {
      const ref = doc(db,'users',user.uid,'portfolio','trades','records',it._id)
      const fee = Number(it.fee||0)
      const tax = Number(it.tax||0)
      const profit = val + fee + tax
      await updateDoc(ref, { profit, source: it.source||'auto' })
      setItems(prev=>prev.map(x=>x._id===it._id?{...x,profit}:x))
      setProfitEdit(null)
      setProfitVal('')
    } catch(e){ console.error(e) }
    setSaving(false)
  }

  // 부대비용 수동 수정
  const saveCostManual = async (it) => {
    if (!user) return
    const val = Number(costVal)
    if (isNaN(val) || val < 0) return
    setSaving(true)
    try {
      const ref = doc(db,'users',user.uid,'portfolio','trades','records',it._id)
      await updateDoc(ref, { fee: val, tax: 0 })
      setItems(prev=>prev.map(x=>x._id===it._id?{...x,fee:val,tax:0}:x))
      setCostEdit(null)
      setCostVal('')
    } catch(e){ console.error(e) }
    setSaving(false)
  }

  // 날짜 수동 수정 (결제일→체결일 보정)
  const saveDateManual = async (it) => {
    if (!user) return
    const val = fromHtml(dateVal)
    if (!val || val.length !== 8) return
    setSaving(true)
    try {
      const col = it._col==='trades' ? 'trades' : 'cashflow'
      const ref = doc(db,'users',user.uid,'portfolio',col,'records',it._id)
      await updateDoc(ref, { date: val })
      setItems(prev=>prev.map(x=>x._id===it._id?{...x,date:val}:x))
      setDateEdit(null)
      setDateVal('')
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

  // 입출금 중복 Map
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
      {/* ── 헤더 ── */}
      <div className="pp-panel-hdr">
        {/* 내역/성과분석 뷰 전환 */}
        <div style={{display:'flex',gap:4}}>
          {[{id:'log',label:'📓 내역'},{id:'analysis',label:'📊 성과분석'}].map(v=>(
            <button key={v.id} className={`pp-period-btn ${view===v.id?'active':''}`}
              style={{fontWeight:view===v.id?700:500}} onClick={()=>setView(v.id)}>{v.label}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:6}}>
          {view==='log' && (<>
            <button className="pp-btn" onClick={()=>setSyncModal('trades')} style={{fontSize:11}}>📥 매매내역</button>
            <button className="pp-btn" onClick={()=>setSyncModal('cashflow')} style={{fontSize:11}}>📥 입출금</button>
            <button className="pp-btn primary" onClick={()=>setShowAdd(true)}>+ 수동 추가</button>
          </>)}
          <button className="pp-btn" onClick={view==='log'?load:loadAll} disabled={loading}>↺</button>
        </div>
      </div>

      {showAdd && <AddEntryModal user={user} onClose={()=>setShowAdd(false)} onSaved={load}/>}
      {editItem && (
        <EditEntryModal user={user} item={editItem}
          onClose={()=>setEditItem(null)}
          onSaved={()=>{ load(); setEditItem(null) }}/>
      )}
      {chartItem && (
        <StockChartPopup code={chartItem.code} name={chartItem.name}
          onClose={()=>setChartItem(null)}/>
      )}
      {syncModal && (
        <ImportSyncModal type={syncModal} user={user}
          onClose={()=>setSyncModal(null)}
          onSaved={()=>{ load(); setSyncModal(null) }}/>
      )}

      {/* ── 내역 탭 ── */}
      {view==='log' && (<>

        {/* 기간 선택 */}
        <div className="pp-jrn-period">
          {/* 프리셋 버튼 */}
          {[
            { l:'당월', fr:thisMonthStart(), to:thisMonthEnd() },
            { l:'전월', fr:prevMonthStart(), to:prevMonthEnd() },
            { l:'올해', fr:thisYearStart(),  to:thisYearEnd()  },
            { l:'전년', fr:prevYearStart(),  to:prevYearEnd()  },
            { l:'전체', fr:allTimeStart(),   to:today()        },
          ].map(p=>(
            <button key={p.l}
              className={`pp-period-btn ${frDt===p.fr&&toDt===p.to?'active':''}`}
              onClick={()=>{ setFrDt(p.fr); setToDt(p.to) }}>{p.l}</button>
          ))}
          {/* 커스텀 날짜 입력 — 달력 아이콘 + 요일 표시 */}
          <div className="pp-datepick-wrap">
            <span className="pp-datepick-label">{fmtDateWithDay(frDt)}</span>
            <input type="date" className="pp-datepick-input" value={toHtml(frDt)}
              onChange={e=>setFrDt(fromHtml(e.target.value))} max={toHtml(today())}/>
          </div>
          <span className="pp-period-sep">~</span>
          <div className="pp-datepick-wrap">
            <span className="pp-datepick-label">{fmtDateWithDay(toDt)}</span>
            <input type="date" className="pp-datepick-input" value={toHtml(toDt)}
              onChange={e=>setToDt(fromHtml(e.target.value))} max={toHtml(today())}/>
          </div>
          <span style={{marginLeft:'auto',fontSize:11,color:'var(--text-dim)'}}>
            {items.length}건
          </span>
        </div>

        {/* 메인 탭 — 매매 / 입출금 */}
        <div className="pp-main-tab-bar">
          <button className={`pp-main-tab ${mainTab==='trades'?'active':''}`}
            onClick={()=>{ setMainTab('trades'); setTab('all') }}>
            매매내역 <span>{trades.length}</span>
          </button>
          <button className={`pp-main-tab ${mainTab==='cashflow'?'active':''}`}
            onClick={()=>{ setMainTab('cashflow'); setCfTab('all') }}>
            입출금 <span>{cashflow.length}</span>
          </button>
        </div>

        {loading && <div className="pp-loading"><div className="pp-spinner"/><span>불러오는 중...</span></div>}

        {/* ══ 매매내역 패널 ══ */}
        {!loading && mainTab==='trades' && (<>

          {/* 매매 요약 카드 */}
          {trades.length > 0 && (() => {
            const buys  = trades.filter(x=>x.type==='buy')
            const sells = trades.filter(x=>x.type==='sell')
            const buyAmt  = buys.reduce((s,x)=>s+Math.abs(Number(x.amount||0)),0)
            const sellAmt = sells.reduce((s,x)=>s+Math.abs(Number(x.amount||0)),0)

            // 건별 세후 순손익 계산 헬퍼
            const calcNet = x => Math.round(Number(x.profit||0) - Number(x.fee||0) - Number(x.tax||0))

            // 실현손익 (profit 있는 매도 건만)
            const sellsWithProfit = sells.filter(x=>x.profit!=null)
            const winners = sellsWithProfit.filter(x=>calcNet(x)>0)
            const losers  = sellsWithProfit.filter(x=>calcNet(x)<=0)

            const winAmt  = winners.reduce((s,x)=>s+calcNet(x),0)
            const lossAmt = losers.reduce((s,x)=>s+calcNet(x),0)
            const netPL   = winAmt + lossAmt

            // 확정 건 매도금액 기준 수익률 (정확한 기준)
            const winSellAmt  = winners.reduce((s,x)=>s+Math.abs(Number(x.amount||0)),0)
            const lossSellAmt = losers.reduce((s,x)=>s+Math.abs(Number(x.amount||0)),0)
            const plSellAmt   = winSellAmt + lossSellAmt  // 확정 건 매도금액
            const winRt   = winSellAmt  > 0 ? (winAmt /winSellAmt *100) : null
            const lossRt  = lossSellAmt > 0 ? (lossAmt/lossSellAmt*100) : null
            const totalRt = plSellAmt   > 0 ? (netPL  /plSellAmt  *100) : null

            const winRate = sellsWithProfit.length > 0 ? (winners.length/sellsWithProfit.length*100) : null
            const totalCost = trades.reduce((s,x)=>s+Number(x.fee||0)+Number(x.tax||0),0)

            return (
              <div style={{background:'var(--bg-base)',border:'1px solid var(--border)',
                borderRadius:10,padding:'12px 14px',marginBottom:10}}>
                <div style={{display:'grid',
                  gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:8}}>

                  {/* 매수 */}
                  <div style={{background:'var(--bg-panel)',borderRadius:8,border:'.5px solid #F7C1C1',padding:'10px 12px'}}>
                    <div style={{fontSize:10,color:'#A32D2D',fontWeight:600,marginBottom:5,display:'flex',alignItems:'center',gap:4}}>
                      <div style={{width:5,height:5,borderRadius:'50%',background:'#E24B4A'}}/>매수
                    </div>
                    <div style={{fontSize:14,fontWeight:700,fontVariantNumeric:'tabular-nums',color:'#791F1F',marginBottom:3}}>
                      {Number(buyAmt).toLocaleString()}
                    </div>
                    <div style={{fontSize:10,color:'#E24B4A'}}>{buys.length}건</div>
                  </div>

                  {/* 매도 */}
                  <div style={{background:'var(--bg-panel)',borderRadius:8,border:'.5px solid #B5D4F4',padding:'10px 12px'}}>
                    <div style={{fontSize:10,color:'#185FA5',fontWeight:600,marginBottom:5,display:'flex',alignItems:'center',gap:4}}>
                      <div style={{width:5,height:5,borderRadius:'50%',background:'#378ADD'}}/>매도
                    </div>
                    <div style={{fontSize:14,fontWeight:700,fontVariantNumeric:'tabular-nums',color:'#0C447C',marginBottom:3}}>
                      {Number(sellAmt).toLocaleString()}
                    </div>
                    <div style={{fontSize:10,color:'#378ADD'}}>{sells.length}건</div>
                  </div>

                  {/* 부대비용 */}
                  <div style={{background:'var(--bg-panel)',borderRadius:8,border:'.5px solid #D3D1C7',padding:'10px 12px'}}>
                    <div style={{fontSize:10,color:'#5F5E5A',fontWeight:600,marginBottom:5,display:'flex',alignItems:'center',gap:4}}>
                      <div style={{width:5,height:5,borderRadius:'50%',background:'#888780'}}/>부대비용
                    </div>
                    <div style={{fontSize:14,fontWeight:700,fontVariantNumeric:'tabular-nums',color:'#444441',marginBottom:3}}>
                      {Math.round(totalCost).toLocaleString()}
                    </div>
                    <div style={{fontSize:10,color:'#888780'}}>수수료+세금</div>
                  </div>

                  {/* 실현손익 — 수익/손실 분리 + 합계 (span 2) */}
                  <div style={{background:'var(--bg-panel)',borderRadius:8,
                    border:`1.5px solid ${sellsWithProfit.length===0?'var(--border)':netPL>=0?'#9FE1CB':'#F7C1C1'}`,
                    padding:'10px 12px',gridColumn:'span 2'}}>
                    <div style={{fontSize:10,fontWeight:600,marginBottom:8,color:'var(--text-secondary)'}}>
                      실현손익 · {sellsWithProfit.length}건 확정
                    </div>
                    {sellsWithProfit.length===0 ? (
                      <div style={{fontSize:12,color:'var(--text-dim)'}}>📥 매매내역 재동기화 필요</div>
                    ) : (
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                        {/* 수익 */}
                        <div>
                          <div style={{fontSize:10,color:'#0F6E56',marginBottom:3}}>수익 {winners.length}건</div>
                          <div style={{fontSize:13,fontWeight:700,fontVariantNumeric:'tabular-nums',color:'#085041'}}>
                            +{winAmt.toLocaleString()}
                          </div>
                          {winRt!=null && (
                            <div style={{fontSize:10,color:'#1D9E75',fontVariantNumeric:'tabular-nums'}}>
                              +{winRt.toFixed(2)}%
                            </div>
                          )}
                        </div>
                        {/* 손실 */}
                        <div>
                          <div style={{fontSize:10,color:'#A32D2D',marginBottom:3}}>손실 {losers.length}건</div>
                          <div style={{fontSize:13,fontWeight:700,fontVariantNumeric:'tabular-nums',color:'#791F1F'}}>
                            {lossAmt.toLocaleString()}
                          </div>
                          {lossRt!=null && (
                            <div style={{fontSize:10,color:'#E24B4A',fontVariantNumeric:'tabular-nums'}}>
                              {lossRt.toFixed(2)}%
                            </div>
                          )}
                        </div>
                        {/* 합계 */}
                        <div style={{borderLeft:'1px solid var(--border)',paddingLeft:8}}>
                          <div style={{fontSize:10,color:'var(--text-dim)',marginBottom:3}}>합계</div>
                          <div style={{fontSize:14,fontWeight:700,fontVariantNumeric:'tabular-nums',
                            color:netPL>=0?'#085041':'#791F1F'}}>
                            {netPL>=0?'+':''}{netPL.toLocaleString()}
                          </div>
                          {totalRt!=null && (
                            <div style={{fontSize:10,fontVariantNumeric:'tabular-nums',
                              color:totalRt>=0?'#1D9E75':'#E24B4A'}}>
                              {totalRt>=0?'+':''}{totalRt.toFixed(2)}%
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 승률 */}
                  <div style={{background:'var(--bg-panel)',borderRadius:8,border:'1.5px solid var(--border)',padding:'10px 12px',gridColumn:'span 2'}}>
                    <div style={{fontSize:10,color:'var(--text-dim)',fontWeight:600,marginBottom:5}}>승률</div>
                    {winRate===null ? (
                      <div style={{fontSize:12,color:'var(--text-dim)'}}>재동기화 필요</div>
                    ) : (<>
                      <div style={{display:'flex',alignItems:'baseline',gap:6,marginBottom:6}}>
                        <div style={{fontSize:20,fontWeight:700,color:winRate>=50?'#085041':'#791F1F'}}>
                          {winRate.toFixed(1)}%
                        </div>
                        <div style={{fontSize:10,color:'var(--text-dim)'}}>
                          수익 {winners.length}건 / 손실 {losers.length}건
                        </div>
                      </div>
                      <div style={{display:'flex',height:5,borderRadius:2,overflow:'hidden',gap:1}}>
                        <div style={{flex:winners.length,background:'#1D9E75',borderRadius:'2px 0 0 2px'}}/>
                        {losers.length>0&&<div style={{flex:losers.length,background:'#E24B4A',borderRadius:'0 2px 2px 0'}}/>}
                      </div>
                    </>)}
                  </div>

                </div>
              </div>
            )
          })()}

          {/* 서브 탭 */}
          <div className="pp-sub-tab-bar">
            {TRADE_TABS.map(t=>{
              const cnt = t.id==='all' ? trades.length
                : t.id==='buy'    ? trades.filter(x=>x.type==='buy').length
                : t.id==='sell'   ? trades.filter(x=>x.type==='sell').length
                : trades.filter(x=>x.source==='manual').length
              return (
                <button key={t.id} className={`pp-period-btn ${tab===t.id?'active':''}`}
                  onClick={()=>setTab(t.id)}>
                  {t.label} <span style={{opacity:.7,fontSize:10}}>{cnt}</span>
                </button>
              )
            })}
          </div>

          {filteredTrades.length===0 ? (
            <div className="pp-empty">
              <div className="pp-empty-icon">📊</div>
              <div className="pp-empty-title">매매내역 없음</div>
              <div className="pp-empty-sub">📥 매매내역 버튼으로 API에서 불러오거나<br/>+ 수동 추가 버튼으로 직접 입력하세요.</div>
            </div>
          ) : (
            <>
              {/* 데스크탑 테이블 */}
              <div className="pp-table-wrap pp-jrn-desktop">
                <table className="pp-table pp-jrn-table">
                  <thead><tr>
                    <th style={{width:5,padding:0}}></th>
                    <th style={{textAlign:'left',width:80}}>날짜</th>
                    <th style={{textAlign:'left',width:52}}>구분</th>
                    <th style={{textAlign:'left'}}>종목</th>
                    <th style={{width:88}}>단가</th>
                    <th style={{width:60}}>수량</th>
                    <th style={{width:100}}>금액</th>
                    <th style={{width:84}}>부대비용</th>
                    <th style={{width:96}}>실현손익</th>
                    <th style={{width:64}}>수익률</th>
                    <th style={{textAlign:'left',minWidth:110}}>메모</th>
                    <th style={{width:24}}></th>
                  </tr></thead>
                  <tbody>
                    {filteredTrades.map((it,i)=>{
                      const isManual  = it.source==='manual'
                      const isSell    = it.type==='sell'
                      const isBuy     = it.type==='buy'
                      const fee       = Number(it.fee||0)
                      const tax       = Number(it.tax||0)
                      const totalCost = fee + tax
                      const rawProfit = it.profit != null ? Number(it.profit) : null
                      // profit 있으면 세후 계산 + 반올림 (소수점 제거)
                      const netProfit = (isSell && rawProfit != null) ? Math.round(rawProfit - totalCost) : null
                      const amount    = Number(it.amount||0)
                      // 수익률: API의 profit_rt(매입가 기준) 우선 사용
                      // profit_rt 없으면 buy_price×qty로 매입금액 계산 후 사용
                      const buyAmt    = it.buy_price && it.qty ? Number(it.buy_price) * Number(it.qty) : 0
                      const netRt = isSell && it.profit_rt != null
                        ? Number(it.profit_rt).toFixed(2)           // API 값 그대로 (HTS와 동일)
                        : netProfit != null && buyAmt > 0
                          ? (netProfit/buyAmt*100).toFixed(2)       // 매입금액 기준 계산
                          : netProfit != null && amount > 0
                            ? (netProfit/amount*100).toFixed(2)     // 폴백: 매도금액 기준
                            : null
                      const needsSync = isSell && rawProfit == null
                      const barColor  = isManual?'#F59E0B':isBuy?'#EF4444':'#3B82F6'
                      return (
                        <tr key={`${it._id}_${i}`}
                          className="pp-journal-row"
                          style={{background:isManual?'#FFFDF7':'white'}}>
                          <td style={{padding:0}}>
                            <div style={{width:4,minHeight:34,height:'100%',background:barColor,borderRadius:2}}/>
                          </td>
                          {/* 날짜 — 클릭 수정 가능 */}
                          <td style={{textAlign:'left',position:'relative'}}>
                            {dateEdit===it._id ? (
                              <div style={{position:'absolute',top:0,left:0,zIndex:30,
                                background:'var(--bg-panel)',border:'1px solid var(--accent-mid)',
                                borderRadius:8,padding:'10px 12px',boxShadow:'0 6px 20px rgba(0,0,0,.15)',
                                minWidth:210,whiteSpace:'nowrap'}}>
                                <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:6,fontWeight:600}}>
                                  체결일 수정
                                </div>
                                <div style={{fontSize:10,color:'var(--text-dim)',marginBottom:6}}>
                                  결제일(T+2)이 잘못 표시된 경우 실제 체결일로 수정
                                </div>
                                <div style={{display:'flex',gap:4,alignItems:'center'}}>
                                  <input
                                    autoFocus
                                    type="date"
                                    value={dateVal}
                                    onChange={e=>setDateVal(e.target.value)}
                                    onKeyDown={e=>{
                                      if(e.key==='Enter') saveDateManual(it)
                                      if(e.key==='Escape'){ setDateEdit(null); setDateVal('') }
                                    }}
                                    max={toHtml(today())}
                                    style={{flex:1,padding:'4px 7px',fontSize:12,
                                      border:'1px solid var(--accent-mid)',borderRadius:5,outline:'none'}}
                                  />
                                  <button className="pp-btn primary"
                                    style={{padding:'4px 8px',fontSize:11}}
                                    onClick={()=>saveDateManual(it)}
                                    disabled={saving}>{saving?'…':'✓'}</button>
                                  <button className="pp-btn"
                                    style={{padding:'4px 6px',fontSize:11}}
                                    onClick={()=>{ setDateEdit(null); setDateVal('') }}>✕</button>
                                </div>
                              </div>
                            ) : (
                              <div onClick={()=>{ setDateEdit(it._id); setDateVal(toHtml(it.date)) }}
                                title="클릭하여 체결일 수정"
                                style={{fontSize:11,color:'var(--text-secondary)',fontVariantNumeric:'tabular-nums',
                                  cursor:'pointer',borderBottom:'1px dashed transparent'}}
                                onMouseEnter={e=>e.currentTarget.style.borderBottomColor='var(--text-dim)'}
                                onMouseLeave={e=>e.currentTarget.style.borderBottomColor='transparent'}>
                                {fmtDate(it.date)}
                              </div>
                            )}
                          </td>
                          {/* 구분 뱃지 */}
                          <td style={{textAlign:'left'}}>
                            <div style={{display:'flex',flexDirection:'column',gap:2}}>
                              <span style={{padding:'1px 6px',borderRadius:5,fontSize:10,fontWeight:700,
                                color:isBuy?'#B91C1C':'#1D4ED8',
                                background:isBuy?'#FEF2F2':'#EFF6FF',display:'inline-block'}}>
                                {isBuy?'매수':'매도'}
                              </span>
                              <span style={{padding:'1px 4px',borderRadius:4,fontSize:9,
                                color:isManual?'#B45309':'#94A3B8',
                                background:isManual?'#FEF3C7':'#F1F5F9',display:'inline-block'}}>
                                {isManual?'✏ 수동':'자동'}
                              </span>
                            </div>
                          </td>
                          {/* 종목 */}
                          <td style={{textAlign:'left'}}>
                            <div
                              onClick={()=>it.code&&setChartItem({code:it.code,name:it.name||it.stk_nm||it.code})}
                              style={{fontWeight:600,fontSize:12,
                                color:it.code?'var(--accent-mid)':'var(--text-primary)',
                                cursor:it.code?'pointer':'default',
                                textDecoration:it.code?'none':'none'}}
                              onMouseEnter={e=>{if(it.code)e.currentTarget.style.textDecoration='underline'}}
                              onMouseLeave={e=>e.currentTarget.style.textDecoration='none'}
                              title={it.code?`${it.name} 차트 보기`:''}>
                              {it.name||it.stk_nm||'-'}
                            </div>
                            {it.code && (
                              <div style={{fontSize:10,color:'var(--text-dim)',fontFamily:"'SFMono-Regular',monospace"}}>
                                {it.code}
                              </div>
                            )}
                          </td>
                          {/* 단가 */}
                          <td>
                            <div style={{fontSize:12,fontVariantNumeric:'tabular-nums'}}>
                              {it.price ? fmt(it.price) : '-'}
                            </div>
                          </td>
                          {/* 수량 */}
                          <td>
                            <div style={{fontSize:12,fontVariantNumeric:'tabular-nums'}}>
                              {it.qty ? `${fmt(it.qty)}주` : '-'}
                            </div>
                          </td>
                          {/* 금액 */}
                          <td>
                            <div style={{fontWeight:700,fontSize:13,fontVariantNumeric:'tabular-nums'}}>
                              {fmt(amount)}
                            </div>
                          </td>
                          {/* 부대비용 — 클릭 시 수정 가능 */}
                          <td style={{position:'relative'}}>
                            {costEdit===it._id ? (
                              <div style={{position:'absolute',top:0,left:0,zIndex:30,
                                background:'var(--bg-panel)',border:'1px solid var(--accent-mid)',
                                borderRadius:8,padding:'10px 12px',boxShadow:'0 6px 20px rgba(0,0,0,.15)',
                                minWidth:190,whiteSpace:'nowrap'}}>
                                <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:6,fontWeight:600}}>
                                  부대비용 수정 (수수료+세금)
                                </div>
                                <div style={{display:'flex',gap:4,alignItems:'center'}}>
                                  <input
                                    autoFocus
                                    type="number"
                                    value={costVal}
                                    onChange={e=>setCostVal(e.target.value)}
                                    onKeyDown={e=>{
                                      if(e.key==='Enter') saveCostManual(it)
                                      if(e.key==='Escape'){ setCostEdit(null); setCostVal('') }
                                    }}
                                    placeholder="예: 762"
                                    style={{flex:1,padding:'4px 7px',fontSize:12,
                                      border:'1px solid var(--accent-mid)',borderRadius:5,outline:'none',
                                      fontVariantNumeric:'tabular-nums',minWidth:90}}
                                  />
                                  <button className="pp-btn primary"
                                    style={{padding:'4px 8px',fontSize:11}}
                                    onClick={()=>saveCostManual(it)}
                                    disabled={saving}>{saving?'…':'✓'}</button>
                                  <button className="pp-btn"
                                    style={{padding:'4px 6px',fontSize:11}}
                                    onClick={()=>{ setCostEdit(null); setCostVal('') }}>✕</button>
                                </div>
                              </div>
                            ) : (
                              <div
                                onClick={()=>{ setCostEdit(it._id); setCostVal(String(totalCost||0)) }}
                                title="클릭하여 부대비용 수정"
                                style={{cursor:'pointer',fontSize:11,color:'var(--text-dim)',
                                  fontVariantNumeric:'tabular-nums',
                                  borderBottom: totalCost>0 ? '1px dashed var(--border)' : 'none',
                                  display:'inline-block'}}>
                                {totalCost > 0 ? fmt(totalCost) : '-'}
                              </div>
                            )}
                          </td>
                          {/* 실현손익 (세후) */}
                          <td style={{position:'relative'}}>
                            {netProfit!=null ? (
                              <div style={{fontWeight:700,fontSize:13,fontVariantNumeric:'tabular-nums',
                                color:netProfit>=0?'#B91C1C':'#1D4ED8'}}>
                                {netProfit>=0?'+':''}{fmt(netProfit)}
                              </div>
                            ) : needsSync ? (
                              profitEdit===it._id ? (
                                /* 인라인 입력 팝업 */
                                <div style={{position:'absolute',top:0,left:0,zIndex:30,
                                  background:'var(--bg-panel)',border:'1px solid var(--accent-mid)',
                                  borderRadius:8,padding:'10px 12px',boxShadow:'0 6px 20px rgba(0,0,0,.15)',
                                  minWidth:220,whiteSpace:'nowrap'}}>
                                  <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:6,fontWeight:600}}>
                                    순손익 직접 입력 (세후)
                                  </div>
                                  <div style={{fontSize:10,color:'var(--text-dim)',marginBottom:6}}>
                                    부대비용({fmt(Number(it.fee||0)+Number(it.tax||0))}원) 제외한 순손익
                                  </div>
                                  <div style={{display:'flex',gap:4,alignItems:'center'}}>
                                    <input
                                      autoFocus
                                      type="number"
                                      value={profitVal}
                                      onChange={e=>setProfitVal(e.target.value)}
                                      onKeyDown={e=>{
                                        if(e.key==='Enter') saveProfitManual(it)
                                        if(e.key==='Escape'){ setProfitEdit(null); setProfitVal('') }
                                      }}
                                      placeholder="예: -64828 또는 +12000"
                                      style={{flex:1,padding:'4px 7px',fontSize:12,
                                        border:'1px solid var(--accent-mid)',borderRadius:5,outline:'none',
                                        fontVariantNumeric:'tabular-nums',minWidth:120}}
                                    />
                                    <button className="pp-btn primary"
                                      style={{padding:'4px 8px',fontSize:11}}
                                      onClick={()=>saveProfitManual(it)}
                                      disabled={saving}>
                                      {saving?'…':'✓'}
                                    </button>
                                    <button className="pp-btn"
                                      style={{padding:'4px 6px',fontSize:11}}
                                      onClick={()=>{ setProfitEdit(null); setProfitVal('') }}>
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{fontSize:10,color:'#D97706',cursor:'pointer',
                                  padding:'2px 5px',borderRadius:4,border:'1px dashed #D97706',
                                  display:'inline-block'}}
                                  onClick={()=>{ setProfitEdit(it._id); setProfitVal('') }}
                                  title="클릭하여 순손익 직접 입력">
                                  ✏ 수동입력
                                </div>
                              )
                            ) : (
                              <div style={{color:'var(--text-dim)',fontSize:11}}>-</div>
                            )}
                          </td>
                          {/* 수익률 (세후 or fallback) */}
                          <td>
                            {netRt!=null ? (
                              <div style={{fontSize:12,fontWeight:600,fontVariantNumeric:'tabular-nums',
                                color:Number(netRt)>=0?'#B91C1C':'#1D4ED8'}}>
                                {Number(netRt)>=0?'+':''}{netRt}%
                                {/* profit_rt fallback 시 보조 표시 */}
                                {netProfit==null && it.profit_rt!=null && (
                                  <div style={{fontSize:9,color:'var(--text-dim)',fontWeight:400}}>세전</div>
                                )}
                              </div>
                            ) : (
                              <div style={{color:'var(--text-dim)',fontSize:11}}>-</div>
                            )}
                          </td>
                          {/* 메모 */}
                          <td style={{textAlign:'left',maxWidth:160}}>
                            {editId===it._id ? (
                              <div style={{display:'flex',gap:4,alignItems:'center'}}>
                                <input autoFocus value={editText} onChange={e=>setEditText(e.target.value)}
                                  onKeyDown={e=>{ if(e.key==='Enter')saveMemo(it); if(e.key==='Escape')setEditId(null) }}
                                  style={{flex:1,padding:'3px 6px',fontSize:11,border:'1px solid var(--accent-mid)',
                                    borderRadius:4,outline:'none',minWidth:60}}
                                  placeholder="메모 입력 후 Enter"/>
                                <button className="pp-btn" style={{padding:'2px 5px',fontSize:10}}
                                  onClick={()=>saveMemo(it)} disabled={saving}>{saving?'…':'✓'}</button>
                                <button className="pp-btn" style={{padding:'2px 5px',fontSize:10}}
                                  onClick={()=>setEditId(null)}>✕</button>
                              </div>
                            ) : (
                              <div onClick={()=>{setEditId(it._id);setEditText(it.memo||'')}}
                                title={it.memo||''}
                                style={{cursor:'pointer',minHeight:20,fontSize:11,
                                  color:it.memo?'var(--text-primary)':'var(--text-dim)',
                                  fontStyle:it.memo?'normal':'italic',
                                  overflow:'hidden',textOverflow:'ellipsis',
                                  whiteSpace:'nowrap',maxWidth:155}}>
                                {it.memo||'+ 메모'}
                              </div>
                            )}
                          </td>
                          {/* ✏ 전체 편집 + 삭제 */}
                          <td style={{width:52,textAlign:'right',whiteSpace:'nowrap'}}>
                            <button
                              style={{border:'none',background:'none',cursor:'pointer',
                                color:'var(--text-dim)',fontSize:12,padding:'2px 3px'}}
                              onClick={()=>setEditItem(it)}
                              title="전체 수정">✏</button>
                            <button
                              style={{border:'none',background:'none',cursor:'pointer',
                                color: isManual?'#EF4444':'#CBD5E1',
                                fontSize:13,padding:'2px 4px',
                                opacity:deleting===it._id?.5:1}}
                              onClick={()=>deleteItem(it)} disabled={deleting===it._id}
                              title={isManual?'수동 항목 삭제':'삭제 (📥 재동기화로 복구 가능)'}>
                              {deleting===it._id?'…':'✕'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* 모바일 카드 (768px 이하) */}
              <div className="pp-jrn-mobile">
                {filteredTrades.map((it,i)=>{
                  const isManual  = it.source==='manual'
                  const isBuy     = it.type==='buy'
                  const isSell    = it.type==='sell'
                  const fee       = Number(it.fee||0)
                  const tax       = Number(it.tax||0)
                  const totalCost = fee + tax
                  const rawProfit = it.profit!=null ? Number(it.profit) : null
                  const netProfit = (isSell&&rawProfit!=null) ? Math.round(rawProfit-totalCost) : null
                  const amount    = Number(it.amount||0)
                  const buyAmt    = it.buy_price && it.qty ? Number(it.buy_price)*Number(it.qty) : 0
                  const netRt = isSell && it.profit_rt != null
                    ? Number(it.profit_rt).toFixed(2)
                    : netProfit!=null && buyAmt>0
                      ? (netProfit/buyAmt*100).toFixed(2)
                      : netProfit!=null && amount>0
                        ? (netProfit/amount*100).toFixed(2) : null
                  const barColor  = isManual?'#F59E0B':isBuy?'#EF4444':'#3B82F6'
                  return (
                    <div key={`m-${it._id}_${i}`} className="pp-jrn-card"
                      style={{background:isManual?'#FFFDF7':'white'}}>
                      <div style={{width:4,background:barColor,borderRadius:2,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        {/* 1줄 */}
                        <div className="pp-jrn-card-top">
                          <span style={{fontSize:11,color:'var(--text-secondary)',fontVariantNumeric:'tabular-nums'}}>
                            {fmtDate(it.date)}
                          </span>
                          <span style={{padding:'1px 6px',borderRadius:5,fontSize:10,fontWeight:700,
                            color:isBuy?'#B91C1C':'#1D4ED8',background:isBuy?'#FEF2F2':'#EFF6FF'}}>
                            {isBuy?'매수':'매도'}
                          </span>
                          <span style={{fontWeight:600,fontSize:12,color:'var(--text-primary)',flex:1,
                            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {it.name||it.stk_nm||'-'}
                          </span>
                          {it.code && (
                            <span style={{fontSize:10,color:'var(--text-dim)',fontFamily:"'SFMono-Regular',monospace"}}>
                              {it.code}
                            </span>
                          )}
                        </div>
                        {/* 2줄 */}
                        <div className="pp-jrn-card-bot">
                          {it.price&&it.qty&&<span className="pp-jrn-chip">{fmt(it.price)}원×{fmt(it.qty)}주</span>}
                          <span className="pp-jrn-chip" style={{fontWeight:700}}>{fmt(amount)}원</span>
                          {totalCost>0&&<span className="pp-jrn-chip" style={{color:'var(--text-dim)'}}>비용 {fmt(totalCost)}</span>}
                          {netProfit!=null&&(
                            <span className="pp-jrn-chip" style={{fontWeight:700,
                              color:netProfit>=0?'#B91C1C':'#1D4ED8'}}>
                              {netProfit>=0?'+':''}{fmt(netProfit)}원
                            </span>
                          )}
                          {netRt!=null&&(
                            <span className="pp-jrn-chip" style={{color:Number(netRt)>=0?'#B91C1C':'#1D4ED8'}}>
                              {Number(netRt)>=0?'+':''}{netRt}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>)}

        {/* ══ 입출금 패널 ══ */}
        {!loading && mainTab==='cashflow' && (<>

          {/* 카테고리별 합산 카드 + 비율 바 */}
          {cashflow.length > 0 && (() => {
            const sumAmt = f => cashflow.filter(f).reduce((s,x)=>s+Math.abs(Number(x.amount||0)),0)
            const sumCnt = f => cashflow.filter(f).length

            const isIn  = x => x.type==='in' && !['dividend','interest','other','profit'].includes(x.category)
            const isDiv = x => ['dividend','profit'].includes(x.category)
            const isInt = x => x.category==='interest'
            const isOut = x => x.type==='out'
            const isOth = x => x.category==='other'

            const divAmt=sumAmt(isDiv), divCnt=sumCnt(isDiv)
            const intAmt=sumAmt(isInt), intCnt=sumCnt(isInt)
            const inAmt =sumAmt(isIn),  inCnt =sumCnt(isIn)
            const outAmt=sumAmt(isOut), outCnt=sumCnt(isOut)
            const othAmt=sumAmt(isOth), othCnt=sumCnt(isOth)

            const netIn    = divAmt+intAmt+inAmt+othAmt  // 출금 제외 수입 합계
            const netTotal = netIn - outAmt               // 순합산

            // 비율바용 (출금 제외)
            const barTotal = divAmt+intAmt+inAmt+othAmt || 1

            const cards = [
              { label:'배당', amt:divAmt, cnt:divCnt, neg:false, bc:'#9FE1CB', lc:'#0F6E56', vc:'#085041', dot:'#1D9E75', bar:'#1D9E75', show:divCnt>0 },
              { label:'이자', amt:intAmt, cnt:intCnt, neg:false, bc:'#B5D4F4', lc:'#185FA5', vc:'#0C447C', dot:'#378ADD', bar:'#378ADD', show:intCnt>0 },
              { label:'입금', amt:inAmt,  cnt:inCnt,  neg:false, bc:'#F7C1C1', lc:'#A32D2D', vc:'#791F1F', dot:'#E24B4A', bar:'#E24B4A', show:inCnt>0  },
              { label:'출금', amt:outAmt, cnt:outCnt, neg:true,  bc:'#B5D4F4', lc:'#185FA5', vc:'#0C447C', dot:'#378ADD', bar:null,      show:outCnt>0 },
              { label:'기타', amt:othAmt, cnt:othCnt, neg:false, bc:'#D3D1C7', lc:'#5F5E5A', vc:'#444441', dot:'#888780', bar:'#B4B2A9', show:othCnt>0 },
            ].filter(c=>c.show)

            return (
              <div style={{background:'var(--bg-base)',border:'1px solid var(--border)',
                borderRadius:10,padding:'12px 14px',marginBottom:10}}>
                {/* 카드 그리드 */}
                <div style={{display:'grid',
                  gridTemplateColumns:`repeat(auto-fit,minmax(110px,1fr))`,
                  gap:8,marginBottom:12}}>
                  {cards.map(c=>(
                    <div key={c.label} style={{background:'var(--bg-panel)',borderRadius:8,
                      border:`0.5px solid ${c.bc}`,padding:'10px 12px'}}>
                      <div style={{fontSize:10,color:c.lc,fontWeight:600,marginBottom:5,
                        display:'flex',alignItems:'center',gap:4}}>
                        <div style={{width:5,height:5,borderRadius:'50%',background:c.dot,flexShrink:0}}/>
                        {c.label}
                      </div>
                      <div style={{fontSize:14,fontWeight:700,fontVariantNumeric:'tabular-nums',
                        color:c.vc,marginBottom:3}}>
                        {c.neg?'-':'+'}{Number(c.amt).toLocaleString()}
                      </div>
                      <div style={{fontSize:10,color:c.dot}}>{c.cnt}건</div>
                    </div>
                  ))}
                  {/* 순합산 카드 */}
                  <div style={{background:'var(--bg-panel)',borderRadius:8,
                    border:'1.5px solid var(--border)',padding:'10px 12px'}}>
                    <div style={{fontSize:10,color:'var(--text-dim)',fontWeight:600,marginBottom:5}}>
                      순합산
                    </div>
                    <div style={{fontSize:15,fontWeight:700,fontVariantNumeric:'tabular-nums',
                      color:netTotal>=0?'#B91C1C':'#1D4ED8',marginBottom:3}}>
                      {netTotal>=0?'+':''}{Number(netTotal).toLocaleString()}
                    </div>
                    <div style={{fontSize:10,color:'var(--text-dim)'}}>{cashflow.length}건 전체</div>
                  </div>
                </div>

                {/* 비율 바 — 출금 제외, 수입 구성 */}
                <div>
                  <div style={{fontSize:10,color:'var(--text-dim)',marginBottom:5}}>
                    수입 구성 비율
                  </div>
                  <div style={{display:'flex',height:6,borderRadius:3,overflow:'hidden',gap:1}}>
                    {[
                      { amt:divAmt, color:'#1D9E75' },
                      { amt:intAmt, color:'#378ADD' },
                      { amt:inAmt,  color:'#E24B4A' },
                      { amt:othAmt, color:'#B4B2A9' },
                    ].filter(b=>b.amt>0).map((b,i,arr)=>(
                      <div key={i} style={{
                        flex:b.amt, background:b.color,
                        borderRadius: i===0?'3px 0 0 3px': i===arr.length-1?'0 3px 3px 0':'0'
                      }}/>
                    ))}
                  </div>
                  <div style={{display:'flex',gap:12,marginTop:6,flexWrap:'wrap'}}>
                    {[
                      { label:'배당', amt:divAmt, color:'#1D9E75', show:divAmt>0 },
                      { label:'이자', amt:intAmt, color:'#378ADD', show:intAmt>0 },
                      { label:'입금', amt:inAmt,  color:'#E24B4A', show:inAmt>0  },
                      { label:'기타', amt:othAmt, color:'#B4B2A9', show:othAmt>0 },
                    ].filter(l=>l.show).map(l=>(
                      <span key={l.label} style={{fontSize:10,color:'var(--text-dim)',
                        display:'flex',alignItems:'center',gap:3}}>
                        <span style={{display:'inline-block',width:8,height:8,
                          borderRadius:1,background:l.color}}/>
                        {l.label} {(l.amt/barTotal*100).toFixed(1)}%
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* 미분류 안내 */}
          {cashflow.filter(x=>x.type==='in'&&!['dividend','interest','other','profit'].includes(x.category)===false && x.category==='other').length > 0 && (
            <div style={{padding:'8px 12px',background:'#FFFBEB',border:'1px solid #FCD34D',
              borderRadius:7,fontSize:11,color:'#92400E',marginBottom:10}}>
              ⚠️ 미분류 항목이 있습니다 — 카테고리 뱃지를 클릭해 분류하세요
            </div>
          )}
          {/* 서브 탭 */}
          <div className="pp-sub-tab-bar">
            {CF_TABS.map(t=>{
              const cnt = t.id==='all'      ? cashflow.length
                : t.id==='in'       ? cashflow.filter(x=>x.type==='in'&&!['dividend','interest','other','profit'].includes(x.category)).length
                : t.id==='out'      ? cashflow.filter(x=>x.type==='out').length
                : t.id==='dividend' ? cashflow.filter(x=>['dividend','profit'].includes(x.category)).length
                : t.id==='interest' ? cashflow.filter(x=>x.category==='interest').length
                : t.id==='other'    ? cashflow.filter(x=>x.category==='other').length
                : cashflow.filter(x=>x.source==='manual').length
              return (
                <button key={t.id} className={`pp-period-btn ${cfTab===t.id?'active':''}`}
                  onClick={()=>setCfTab(t.id)}>
                  {t.label} <span style={{opacity:.7,fontSize:10}}>{cnt}</span>
                </button>
              )
            })}
          </div>

          {filteredCf.length===0 ? (
            <div className="pp-empty">
              <div className="pp-empty-icon">💰</div>
              <div className="pp-empty-title">입출금 내역 없음</div>
              <div className="pp-empty-sub">📥 입출금 버튼으로 API에서 불러오거나<br/>+ 수동 추가 버튼으로 직접 입력하세요.</div>
            </div>
          ) : (
            <>
              {/* 데스크탑 */}
              <div className="pp-table-wrap pp-jrn-desktop">
                <table className="pp-table pp-jrn-table">
                  <thead><tr>
                    <th style={{width:5,padding:0}}></th>
                    <th style={{textAlign:'left',width:80}}>날짜</th>
                    <th style={{textAlign:'left',width:64}}>구분</th>
                    <th style={{textAlign:'left'}}>항목</th>
                    <th style={{width:110}}>금액</th>
                    <th style={{width:90}}>부대비용(세금)</th>
                    <th style={{width:110}}>실수령액</th>
                    <th style={{textAlign:'left',minWidth:110}}>메모</th>
                    <th style={{width:24}}></th>
                  </tr></thead>
                  <tbody>
                    {filteredCf.map((it,i)=>{
                      const isManual = it.source==='manual'
                      const isDup    = (dupMap[makeCfContentKey(it)]||0)>1
                      const cat      = getCfCat(it.category||it.type)
                      const amount   = Number(it.amount||0)
                      const tax      = Number(it.tax||0)
                      const net      = amount - tax
                      const isOut    = it.type==='out' || amount < 0
                      const barColor = isManual?'#F59E0B':'#10B981'
                      return (
                        <tr key={`cf-${it._id}_${i}`} className="pp-journal-row"
                          style={{background:isDup?'#FFF5F5':isManual?'#FFFDF7':'white'}}>
                          <td style={{padding:0}}>
                            <div style={{width:4,minHeight:34,height:'100%',background:barColor,borderRadius:2}}/>
                          </td>
                          <td style={{textAlign:'left'}}>
                            <div style={{fontSize:11,color:'var(--text-secondary)',fontVariantNumeric:'tabular-nums'}}>
                              {fmtDate(it.date)}
                            </div>
                          </td>
                          {/* 카테고리 뱃지 (클릭 편집) */}
                          <td style={{textAlign:'left', position:'relative'}}>
                            {catEdit===it._id ? (
                              <div style={{display:'flex',flexWrap:'wrap',gap:3,background:'var(--bg-panel)',
                                border:'1px solid var(--border)',borderRadius:8,padding:6,
                                position:'absolute',top:'100%',left:0,zIndex:20,
                                boxShadow:'0 6px 16px rgba(0,0,0,.12)',minWidth:180}}>
                                {CF_CATEGORIES.map(c=>(
                                  <button key={c.id}
                                    style={{padding:'3px 10px',borderRadius:8,fontSize:11,
                                      border:`1px solid ${c.color}`,background:c.bg,
                                      color:c.color,cursor:'pointer',fontWeight:700}}
                                    onClick={()=>updateCat(it,c.id)}>{c.label}</button>
                                ))}
                                <button style={{padding:'3px 8px',fontSize:11,
                                  border:'1px solid var(--border)',borderRadius:8,
                                  cursor:'pointer',color:'var(--text-dim)',background:'var(--bg-panel)'}}
                                  onClick={()=>setCatEdit(null)}>✕</button>
                              </div>
                            ) : (
                              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                                <span style={{padding:'1px 6px',borderRadius:5,fontSize:10,fontWeight:700,
                                  color:cat.color,background:cat.bg,border:`1px solid ${cat.color}33`,
                                  cursor:'pointer',display:'inline-block'}}
                                  onClick={()=>setCatEdit(it._id)} title="클릭 → 카테고리 변경">
                                  {cat.label} ▾
                                </span>
                                <span style={{padding:'1px 4px',borderRadius:4,fontSize:9,
                                  color:isManual?'#B45309':'#94A3B8',
                                  background:isManual?'#FEF3C7':'#F1F5F9',display:'inline-block'}}>
                                  {isManual?'✏ 수동':'자동'}
                                </span>
                              </div>
                            )}
                          </td>
                          <td style={{textAlign:'left'}}>
                            <div
                              onClick={()=>it.code&&setChartItem({code:it.code,name:it.name||it.code})}
                              style={{fontSize:12,color:it.code?'var(--accent-mid)':'var(--text-secondary)',
                                cursor:it.code?'pointer':'default'}}
                              title={it.code?`${it.name} 차트 보기`:''}>
                              {it.name||it.rmrk_nm||it.io_tp_nm||'-'}
                            </div>
                            {isDup && <div style={{fontSize:10,color:'#EF4444',fontWeight:700}}>⚠ 중복</div>}
                          </td>
                          <td>
                            <div style={{fontWeight:700,fontSize:13,fontVariantNumeric:'tabular-nums',
                              color:isOut?'#1D4ED8':amount>=0?'#B91C1C':'var(--text-primary)'}}>
                              {amount>=0&&!isOut?'+':''}{fmt(amount)}
                            </div>
                          </td>
                          <td>
                            {tax>0
                              ? <div style={{fontSize:11,color:'var(--text-dim)',fontVariantNumeric:'tabular-nums'}}>
                                  {fmt(tax)}
                                  <div style={{fontSize:9,color:'var(--text-dim)',marginTop:1}}>소득세</div>
                                </div>
                              : <div style={{color:'var(--text-dim)',fontSize:11}}>-</div>
                            }
                          </td>
                          <td>
                            <div style={{fontWeight:700,fontSize:13,fontVariantNumeric:'tabular-nums',
                              color:isOut?'#1D4ED8':net>=0?'#B91C1C':'var(--text-primary)'}}>
                              {net>=0&&!isOut?'+':''}{fmt(net)}
                            </div>
                          </td>
                          {/* 메모 */}
                          <td style={{textAlign:'left',maxWidth:160}}>
                            {editId===it._id ? (
                              <div style={{display:'flex',gap:4,alignItems:'center'}}>
                                <input autoFocus value={editText} onChange={e=>setEditText(e.target.value)}
                                  onKeyDown={e=>{ if(e.key==='Enter')saveMemo(it); if(e.key==='Escape')setEditId(null) }}
                                  style={{flex:1,padding:'3px 6px',fontSize:11,border:'1px solid var(--accent-mid)',
                                    borderRadius:4,outline:'none',minWidth:60}}
                                  placeholder="메모 입력 후 Enter"/>
                                <button className="pp-btn" style={{padding:'2px 5px',fontSize:10}}
                                  onClick={()=>saveMemo(it)} disabled={saving}>{saving?'…':'✓'}</button>
                                <button className="pp-btn" style={{padding:'2px 5px',fontSize:10}}
                                  onClick={()=>setEditId(null)}>✕</button>
                              </div>
                            ) : (
                              <div onClick={()=>{setEditId(it._id);setEditText(it.memo||'')}}
                                title={it.memo||''}
                                style={{cursor:'pointer',minHeight:20,fontSize:11,
                                  color:it.memo?'var(--text-primary)':'var(--text-dim)',
                                  fontStyle:it.memo?'normal':'italic',
                                  overflow:'hidden',textOverflow:'ellipsis',
                                  whiteSpace:'nowrap',maxWidth:155}}>
                                {it.memo||'+ 메모'}
                              </div>
                            )}
                          </td>
                          <td style={{width:52,textAlign:'right',whiteSpace:'nowrap'}}>
                            <button
                              style={{border:'none',background:'none',cursor:'pointer',
                                color:'var(--text-dim)',fontSize:12,padding:'2px 3px'}}
                              onClick={()=>setEditItem(it)}
                              title="전체 수정">✏</button>
                            <button style={{border:'none',background:'none',cursor:'pointer',
                              color:isDup?'#EF4444':'#CBD5E1',fontSize:13,padding:'2px 4px',
                              opacity:deleting===it._id?.5:1}}
                              onClick={()=>deleteItem(it)} disabled={deleting===it._id}
                              title="삭제">
                              {deleting===it._id?'…':'✕'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* 모바일 카드 */}
              <div className="pp-jrn-mobile">
                {filteredCf.map((it,i)=>{
                  const isManual = it.source==='manual'
                  const cat      = getCfCat(it.category||it.type)
                  const amount   = Number(it.amount||0)
                  const tax      = Number(it.tax||0)
                  const net      = amount - tax
                  const isOut    = it.type==='out'||amount<0
                  return (
                    <div key={`mcf-${it._id}_${i}`} className="pp-jrn-card"
                      style={{background:isManual?'#FFFDF7':'white'}}>
                      <div style={{width:4,background:isManual?'#F59E0B':'#10B981',borderRadius:2,flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div className="pp-jrn-card-top">
                          <span style={{fontSize:11,color:'var(--text-secondary)'}}>{fmtDate(it.date)}</span>
                          <span style={{padding:'1px 6px',borderRadius:5,fontSize:10,fontWeight:700,
                            color:cat.color,background:cat.bg}}>{cat.label}</span>
                          <span style={{fontSize:12,color:'var(--text-secondary)',flex:1}}>
                            {it.name||it.rmrk_nm||'-'}
                          </span>
                        </div>
                        <div className="pp-jrn-card-bot">
                          <span className="pp-jrn-chip" style={{fontWeight:700,
                            color:isOut?'#1D4ED8':amount>=0?'#B91C1C':'inherit'}}>
                            {amount>=0&&!isOut?'+':''}{fmt(amount)}원
                          </span>
                          {tax>0&&<span className="pp-jrn-chip" style={{color:'var(--text-dim)'}}>세금 {fmt(tax)}</span>}
                          {tax>0&&<span className="pp-jrn-chip" style={{fontWeight:700,
                            color:isOut?'#1D4ED8':net>=0?'#B91C1C':'inherit'}}>
                            실수령 {net>=0&&!isOut?'+':''}{fmt(net)}원
                          </span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>)}
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
      case 'holdings': return <HoldingsPanel data={holdData} loading={holdLoading} onRefresh={loadHoldings} user={user}/>
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
