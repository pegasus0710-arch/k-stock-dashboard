// src/components/ImportSyncModal.jsx
// 매매내역 / 입출금 내역 비교 동기화 팝업
// 왼쪽: API 조회 결과 (미저장=체크가능, 저장됨=회색)
// 오른쪽: Firestore 저장 내역 (삭제 가능)

import { useState, useEffect, useCallback } from 'react'
import { db } from '../firebase'
import {
  collection, getDocs, writeBatch, doc, deleteDoc, Timestamp
} from 'firebase/firestore'

// ── 유틸 ──────────────────────────────────────────────
const fmt    = n => Number(n||0).toLocaleString()
const fmtD   = s => s ? `${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}` : ''
const today  = () => new Date().toISOString().slice(0,10).replace(/-/g,'')
const daysAgo = d => { const dt=new Date(); dt.setDate(dt.getDate()-d); return dt.toISOString().slice(0,10).replace(/-/g,'') }
const toHtml  = s => s ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : ''
const fromHtml = s => s ? s.replace(/-/g,'') : ''

// 매칭 키: 날짜 + 절대금액 조합
const matchKey = item => `${item.date}_${Math.abs(Number(item.amount||0))}`

// 카테고리 색상
const CAT_COLOR = {
  dividend: { label:'배당', color:'#059669', bg:'#ECFDF5' },
  interest:  { label:'이자', color:'#0891B2', bg:'#ECFEFF' },
  transfer:  { label:'이체', color:'#64748B', bg:'#F1F5F9' },
  in:        { label:'입금', color:'#EF4444', bg:'#FEF2F2' },
  out:       { label:'출금', color:'#3B82F6', bg:'#EFF6FF' },
  trade:     { label:'거래', color:'#8B5CF6', bg:'#F5F3FF' },
}
const getCat = cat => CAT_COLOR[cat] || CAT_COLOR['in']

export default function ImportSyncModal({ type, user, onClose, onSaved }) {
  const isTrades = type === 'trades'
  const title    = isTrades ? '매매내역' : '입출금'
  const colPath  = isTrades ? 'trades' : 'cashflow'
  const apiType  = isTrades ? 'account-trades' : 'account-cashflow'

  const [frDt,      setFrDt]      = useState(daysAgo(30))
  const [toDt,      setToDt]      = useState(today())
  const [apiItems,  setApiItems]  = useState([])   // 왼쪽: API 결과
  const [dbItems,   setDbItems]   = useState([])   // 오른쪽: Firestore 저장본
  const [checked,   setChecked]   = useState(new Set())
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(null)
  const [fetched,   setFetched]   = useState(false)

  // Firestore 저장 내역 로드 — 기간 필터링 (frDt~toDt)
  const loadDb = useCallback(async (fr, to) => {
    if (!user) return
    const snap = await getDocs(
      collection(db, 'users', user.uid, 'portfolio', colPath, 'records')
    ).catch(() => ({ docs: [] }))
    // 기간 필터: 조회한 경우만 기간 적용, 최초 로드는 전체
    const all = snap.docs.map(d => ({ ...d.data(), _id: d.id }))
      .sort((a,b) => (b.date||'').localeCompare(a.date||''))
    if (fr && to) {
      setDbItems(all.filter(it => it.date >= fr && it.date <= to))
    } else {
      setDbItems(all)
    }
  }, [user, colPath])

  useEffect(() => { loadDb() }, [loadDb])

  // 저장된 항목 matchKey Set
  const dbKeySet = new Set(dbItems.map(matchKey))

  // API 조회
  const fetchApi = async () => {
    setLoading(true); setApiItems([]); setChecked(new Set()); setFetched(false)
    try {
      const res = await fetch(
        `/api/kiwoom?type=${apiType}&fr_dt=${frDt}&to_dt=${toDt}`
      ).then(r => r.json())

      const rows = (isTrades ? res.trades : res.cashflow) || []

      // 실현손익 병합 (매매내역만)
      let realByKey = {}
      if (isTrades) {
        const sellCodes = [...new Set(rows.filter(t=>t.type==='sell').map(t=>t.code).filter(Boolean))]
        if (sellCodes.length) {
          const rr = await fetch(`/api/kiwoom?type=account-realized&fr_dt=${frDt}&to_dt=${toDt}`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ fr_dt:frDt, to_dt:toDt, codes:sellCodes })
          }).then(r=>r.json()).catch(()=>({}))
          realByKey = rr.by_key || {}
        }
      }

      const items = rows.map((r, idx) => {
        const item = { ...r, _apiIdx: idx }
        if (isTrades && r.type === 'sell') {
          const key = `${r.date}_${r.code}`
          const matches = realByKey[key] || []
          const best = matches.find(m=>Number(m.qty||0)===Number(r.qty||0)) || matches[0]
          if (best) Object.assign(item, { profit: best.profit, profit_rt: best.profit_rt })
        }
        return item
      })

      setApiItems(items)
      setFetched(true)
      // 오른쪽 패널도 동일 기간으로 갱신
      await loadDb(frDt, toDt)

      // 미저장 항목 자동 체크
      const autoCheck = new Set()
      items.forEach((it, i) => {
        if (!dbKeySet.has(matchKey(it))) autoCheck.add(i)
      })
      setChecked(autoCheck)
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  // 체크박스 토글
  const toggleCheck = (idx, isSaved) => {
    if (isSaved) return  // 이미 저장된 항목은 토글 불가
    setChecked(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  // 전체 선택 (미저장만)
  const toggleAll = () => {
    const unsaved = apiItems.map((it, i) => ({ it, i }))
      .filter(({ it }) => !dbKeySet.has(matchKey(it)))
      .map(({ i }) => i)
    const allChecked = unsaved.every(i => checked.has(i))
    setChecked(allChecked ? new Set() : new Set(unsaved))
  }

  // 선택 항목 Firestore 저장
  const saveChecked = async () => {
    if (!user || checked.size === 0) return
    setSaving(true)
    try {
      const batch = writeBatch(db)
      const col = collection(db, 'users', user.uid, 'portfolio', colPath, 'records')
      for (const idx of checked) {
        const it = apiItems[idx]
        if (!it) continue
        const id = it.trade_id || `${it.date}_${it.code||'cash'}_${it.type}_${it.amount}_${idx}`
        const ref = doc(col, id)
        const { _apiIdx, ...data } = it
        batch.set(ref, {
          ...data,
          source:   'api',
          category: data.category || (isTrades ? 'trade' : data.type || 'in'),
          savedAt:  Timestamp.now(),
        })
      }
      await batch.commit()
      await loadDb(frDt, toDt)
      setChecked(new Set())
      onSaved && onSaved()
    } catch(e) { console.error(e) }
    setSaving(false)
  }

  // Firestore 항목 삭제
  const deleteItem = async (item) => {
    if (!user) return
    if (!window.confirm(`"${item.name || item.rmrk_nm || '항목'}"을 삭제하시겠습니까?`)) return
    setDeleting(item._id)
    try {
      const ref = doc(db, 'users', user.uid, 'portfolio', colPath, 'records', item._id)
      await deleteDoc(ref)
      setDbItems(prev => prev.filter(d => d._id !== item._id))
    } catch(e) { console.error(e) }
    setDeleting(null)
  }

  const unsavedCount = apiItems.filter((it) => !dbKeySet.has(matchKey(it))).length
  const checkedCount = checked.size

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.5)',
      zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center',
      padding:'16px'
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background:'var(--bg-panel)', border:'1px solid var(--border)',
        borderRadius:14, width:'min(980px,95vw)', maxHeight:'88vh',
        display:'flex', flexDirection:'column',
        boxShadow:'0 24px 64px rgba(0,0,0,.22)', overflow:'hidden'
      }}>

        {/* 헤더 */}
        <div style={{padding:'16px 20px', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0}}>
          <div>
            <span style={{fontSize:15,fontWeight:700,color:'var(--text-primary)'}}>
              📥 {title} 비교 · 동기화
            </span>
            <span style={{fontSize:11,color:'var(--text-dim)',marginLeft:10}}>
              API 조회 후 저장 여부를 비교하고 선택 저장합니다
            </span>
          </div>
          <button onClick={onClose} style={{border:'none',background:'none',
            fontSize:20,cursor:'pointer',color:'var(--text-dim)',padding:'2px 6px'}}>✕</button>
        </div>

        {/* 기간 선택 */}
        <div style={{padding:'12px 20px', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', flexShrink:0,
          background:'var(--bg-base)'}}>
          {[{l:'1개월',d:30},{l:'3개월',d:90}].map(p => (
            <button key={p.d}
              style={{padding:'5px 12px', borderRadius:16, fontSize:12, fontWeight:600,
                border:`1px solid ${frDt===daysAgo(p.d)&&toDt===today()?'var(--accent-mid)':'var(--border)'}`,
                background:frDt===daysAgo(p.d)&&toDt===today()?'var(--accent-mid)':'var(--bg-panel)',
                color:frDt===daysAgo(p.d)&&toDt===today()?'white':'var(--text-secondary)',
                cursor:'pointer'}}
              onClick={()=>{ setFrDt(daysAgo(p.d)); setToDt(today()) }}>{p.l}</button>
          ))}
          <input type="date" value={toHtml(frDt)} onChange={e=>setFrDt(fromHtml(e.target.value))}
            max={toHtml(today())}
            style={{padding:'5px 8px',border:'1px solid var(--border)',borderRadius:7,
              fontSize:12,color:'var(--text-primary)',background:'var(--bg-panel)',outline:'none'}}/>
          <span style={{color:'var(--text-dim)',fontSize:12}}>~</span>
          <input type="date" value={toHtml(toDt)} onChange={e=>setToDt(fromHtml(e.target.value))}
            max={toHtml(today())}
            style={{padding:'5px 8px',border:'1px solid var(--border)',borderRadius:7,
              fontSize:12,color:'var(--text-primary)',background:'var(--bg-panel)',outline:'none'}}/>
          <button onClick={fetchApi} disabled={loading}
            style={{padding:'5px 16px',borderRadius:8,fontSize:12,fontWeight:700,
              border:'none',background:'var(--accent-mid)',color:'white',cursor:'pointer',
              opacity:loading?.6:1}}>
            {loading ? '조회 중…' : '조회'}
          </button>
          {fetched && (
            <span style={{fontSize:11,color:'var(--text-dim)',marginLeft:4}}>
              API {apiItems.length}건 · 미저장 {unsavedCount}건
            </span>
          )}
        </div>

        {/* 2패널 본문 */}
        <div style={{display:'flex', flex:1, overflow:'hidden', minHeight:0}}>

          {/* ── 왼쪽: API 조회 결과 ── */}
          <div style={{flex:1, display:'flex', flexDirection:'column',
            borderRight:'1px solid var(--border)', overflow:'hidden'}}>
            <div style={{padding:'10px 14px', background:'var(--bg-base)',
              borderBottom:'1px solid var(--border)', flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <span style={{fontSize:12,fontWeight:700,color:'var(--text-primary)'}}>
                API 조회 결과
                {fetched && <span style={{fontWeight:400,color:'var(--text-dim)',marginLeft:6}}>
                  ({apiItems.length}건)
                </span>}
              </span>
              {fetched && unsavedCount > 0 && (
                <button onClick={toggleAll}
                  style={{fontSize:11,color:'var(--accent-mid)',fontWeight:600,
                    border:'none',background:'none',cursor:'pointer'}}>
                  {checked.size === unsavedCount ? '전체 해제' : '미저장 전체 선택'}
                </button>
              )}
            </div>
            <div style={{flex:1, overflowY:'auto'}}>
              {!fetched && !loading && (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',
                  justifyContent:'center',height:'100%',color:'var(--text-dim)',gap:8}}>
                  <div style={{fontSize:28,opacity:.4}}>🔍</div>
                  <div style={{fontSize:12}}>기간을 선택하고 조회하세요</div>
                </div>
              )}
              {loading && (
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',
                  height:'100%',gap:10,color:'var(--text-secondary)',fontSize:12}}>
                  <div style={{width:16,height:16,border:'2px solid var(--border)',
                    borderTopColor:'var(--accent-mid)',borderRadius:'50%',
                    animation:'spin .8s linear infinite'}}/>
                  API 조회 중...
                </div>
              )}
              {fetched && apiItems.length === 0 && (
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',
                  height:'100%',color:'var(--text-dim)',fontSize:12}}>
                  해당 기간에 내역이 없습니다
                </div>
              )}
              {fetched && apiItems.map((it, idx) => {
                const isSaved = dbKeySet.has(matchKey(it))
                const isChecked = checked.has(idx)
                const isBuy  = it.type === 'buy'
                const isSell = it.type === 'sell'
                const cat    = getCat(it.category || it.type)
                return (
                  <div key={idx}
                    onClick={() => toggleCheck(idx, isSaved)}
                    style={{
                      display:'flex', alignItems:'flex-start', gap:10,
                      padding:'10px 14px', borderBottom:'1px solid var(--border-dim)',
                      background: isSaved ? 'var(--bg-base)' : isChecked ? '#EFF6FF' : 'white',
                      cursor: isSaved ? 'default' : 'pointer',
                      opacity: isSaved ? .55 : 1,
                      transition:'background .1s',
                    }}>
                    {/* 체크박스 */}
                    <div style={{
                      width:16, height:16, borderRadius:4, flexShrink:0, marginTop:2,
                      border:`2px solid ${isSaved?'var(--border)':isChecked?'var(--accent-mid)':'var(--border)'}`,
                      background: isChecked&&!isSaved ? 'var(--accent-mid)' : 'white',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>
                      {isChecked && !isSaved && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      )}
                    </div>
                    {/* 내용 */}
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:3}}>
                        <span style={{fontSize:11, color:'var(--text-dim)',
                          fontVariantNumeric:'tabular-nums'}}>{fmtD(it.date)}</span>
                        {isTrades ? (
                          <span style={{fontSize:10,padding:'0 5px',borderRadius:6,fontWeight:700,
                            color:isBuy?'#EF4444':'#3B82F6',
                            background:isBuy?'#FEF2F2':'#EFF6FF'}}>
                            {isBuy?'매수':'매도'}
                          </span>
                        ) : (
                          <span style={{fontSize:10,padding:'0 5px',borderRadius:6,fontWeight:700,
                            color:cat.color, background:cat.bg}}>{cat.label}</span>
                        )}
                        {isSaved && (
                          <span style={{fontSize:10,color:'#059669',fontWeight:600}}>✅ 저장됨</span>
                        )}
                      </div>
                      <div style={{display:'flex', alignItems:'center', gap:6}}>
                        <span style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>
                          {it.name || it.rmrk_nm || ''}
                        </span>
                        {it.code && (
                          <span style={{fontSize:10,color:'var(--text-dim)',
                            fontFamily:"'SFMono-Regular','Consolas',monospace"}}>
                            {it.code}
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2,
                        fontVariantNumeric:'tabular-nums'}}>
                        {fmt(it.amount||0)}원
                        {isTrades && it.qty && it.price &&
                          <span style={{color:'var(--text-dim)',marginLeft:6}}>
                            {fmt(it.price)}×{fmt(it.qty)}
                          </span>
                        }
                        {isSell && it.profit != null && (
                          <span style={{marginLeft:8,fontWeight:700,
                            color:Number(it.profit)>=0?'#EF4444':'#3B82F6'}}>
                            {Number(it.profit)>=0?'+':''}{fmt(it.profit)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── 오른쪽: 저장된 내역 ── */}
          <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
            <div style={{padding:'10px 14px', background:'var(--bg-base)',
              borderBottom:'1px solid var(--border)', flexShrink:0}}>
              <span style={{fontSize:12,fontWeight:700,color:'var(--text-primary)'}}>
                저장된 내역
                <span style={{fontWeight:400,color:'var(--text-dim)',marginLeft:6}}>
                  ({dbItems.length}건)
                </span>
              </span>
            </div>
            <div style={{flex:1, overflowY:'auto'}}>
              {dbItems.length === 0 && (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',
                  justifyContent:'center',height:'100%',color:'var(--text-dim)',gap:8}}>
                  <div style={{fontSize:28,opacity:.4}}>📂</div>
                  <div style={{fontSize:12}}>저장된 내역이 없습니다</div>
                </div>
              )}
              {dbItems.map((it, idx) => {
                const isBuy  = it.type === 'buy'
                const cat    = getCat(it.category || it.type)
                const isApiMatch = fetched && apiItems.some(a => matchKey(a) === matchKey(it))
                return (
                  <div key={it._id||idx}
                    style={{
                      display:'flex', alignItems:'flex-start', gap:10,
                      padding:'10px 14px', borderBottom:'1px solid var(--border-dim)',
                      background: isApiMatch ? 'white' : '#FFFBEB',  // 기간 밖 항목은 노란 배경
                      transition:'background .1s',
                    }}>
                    {/* 매칭 인디케이터 */}
                    <div style={{width:4,flexShrink:0,alignSelf:'stretch',borderRadius:2,
                      background: isApiMatch ? 'var(--accent-mid)' : 'var(--border)'}}/> 
                    {/* 내용 */}
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:3}}>
                        <span style={{fontSize:11, color:'var(--text-dim)',
                          fontVariantNumeric:'tabular-nums'}}>{fmtD(it.date)}</span>
                        {isTrades ? (
                          <span style={{fontSize:10,padding:'0 5px',borderRadius:6,fontWeight:700,
                            color:isBuy?'#EF4444':'#3B82F6',
                            background:isBuy?'#FEF2F2':'#EFF6FF'}}>
                            {isBuy?'매수':'매도'}
                          </span>
                        ) : (
                          <span style={{fontSize:10,padding:'0 5px',borderRadius:6,fontWeight:700,
                            color:cat.color, background:cat.bg}}>{cat.label}</span>
                        )}
                        <span style={{fontSize:10,padding:'0 4px',borderRadius:6,
                          color:it.source==='manual'?'#D97706':'#94A3B8',
                          background:it.source==='manual'?'#FEF3C7':'#F1F5F9'}}>
                          {it.source==='manual'?'수동':'자동'}
                        </span>
                        {!isApiMatch && fetched && (
                          <span style={{fontSize:10,color:'#D97706',fontWeight:600}}>기간 외</span>
                        )}
                      </div>
                      <div style={{display:'flex', alignItems:'center', gap:6}}>
                        <span style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>
                          {it.name || it.rmrk_nm || ''}
                        </span>
                        {it.code && (
                          <span style={{fontSize:10,color:'var(--text-dim)',
                            fontFamily:"'SFMono-Regular','Consolas',monospace"}}>
                            {it.code}
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2,
                        fontVariantNumeric:'tabular-nums'}}>
                        {fmt(it.amount||0)}원
                        {isTrades && it.qty && it.price &&
                          <span style={{color:'var(--text-dim)',marginLeft:6}}>
                            {fmt(it.price)}×{fmt(it.qty)}
                          </span>
                        }
                      </div>
                    </div>
                    {/* 삭제 버튼 */}
                    <button
                      onClick={() => deleteItem(it)}
                      disabled={deleting === it._id}
                      style={{border:'none',background:'none',cursor:'pointer',
                        color:'#CBD5E1',fontSize:15,padding:'2px 4px',flexShrink:0,
                        opacity:deleting===it._id?.5:1,
                        transition:'color .15s'}}
                      onMouseEnter={e=>e.currentTarget.style.color='#EF4444'}
                      onMouseLeave={e=>e.currentTarget.style.color='#CBD5E1'}
                      title="삭제">
                      {deleting === it._id ? '…' : '✕'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div style={{padding:'12px 20px', borderTop:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          flexShrink:0, background:'var(--bg-base)'}}>
          <div style={{fontSize:11,color:'var(--text-dim)'}}>
            {fetched
              ? <>API <strong>{apiItems.length}</strong>건 · 미저장 <strong style={{color:'var(--accent-mid)'}}>{unsavedCount}</strong>건 · 저장됨 <strong>{apiItems.length-unsavedCount}</strong>건</>
              : '조회 후 항목을 선택하세요'
            }
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={onClose}
              style={{padding:'7px 16px',borderRadius:8,fontSize:12,fontWeight:600,
                border:'1px solid var(--border)',background:'var(--bg-panel)',
                color:'var(--text-secondary)',cursor:'pointer'}}>
              닫기
            </button>
            {checkedCount > 0 && (
              <button onClick={saveChecked} disabled={saving}
                style={{padding:'7px 20px',borderRadius:8,fontSize:12,fontWeight:700,
                  border:'none',background:'var(--accent-mid)',color:'white',cursor:'pointer',
                  opacity:saving?.6:1}}>
                {saving ? '저장 중…' : `선택 ${checkedCount}건 저장`}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
