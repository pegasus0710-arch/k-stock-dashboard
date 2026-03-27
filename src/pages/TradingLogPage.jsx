import { useState, useEffect, useCallback } from 'react'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { fmt, rateColor } from '../utils/format'
import './TradingLogPage.css'

const LS_KEY  = 'kstock_tradelog_v2'
const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_API_KEY

function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

function todayStr() { return new Date().toISOString().slice(0,10).replace(/-/g,'') }
function formatDate(s) {
  if (!s) return '-'
  const str = String(s)
  if (str.length === 8) return `${str.slice(0,4)}-${str.slice(4,6)}-${str.slice(6,8)}`
  return str
}

// AI 매매 분석
async function analyzeOrders(orders) {
  if (!CLAUDE_KEY || !orders.length) return ''
  const summary = orders.slice(0, 20).map(o =>
    `${o.stk_nm}(${o.stk_cd}) ${o.io_tp_nm} ${o.cntr_qty}주 @${fmt(o.cntr_uv)}원 (${o.ord_tm})`
  ).join('\n')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body: JSON.stringify({
      model:'claude-haiku-4-5-20251001', max_tokens:600,
      tools:[{type:'web_search_20250305',name:'web_search'}],
      messages:[{role:'user',content:
        `오늘 매매 내역을 분석해줘:\n\n${summary}\n\n## 📊 매매 패턴 분석\n## 🎯 주요 매매 의도\n## ⚠️ 리스크 포인트\n## 💡 개선 제안\n\n웹 검색으로 오늘 시장 상황과 연계해서 분석해줘.`}],
    }),
  })
  const data = await res.json()
  return data.content?.filter(b => b.type==='text').map(b => b.text).join('\n') || ''
}

export default function TradingLogPage() {
  const { user } = useAuth()
  const [logs,        setLogs]        = useState(() => lsGet(LS_KEY, []))
  const [autoOrders,  setAutoOrders]  = useState(null)
  const [autoLoading, setAutoLoading] = useState(false)
  const [autoError,   setAutoError]   = useState('')
  const [selDate,     setSelDate]     = useState(todayStr())
  const [activeTab,   setActiveTab]   = useState('auto')
  const [showForm,    setShowForm]    = useState(false)

  // Firestore 초기 로드
  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const ref  = doc(db, 'users', user.uid, 'data', 'tradelog')
        const snap = await getDoc(ref)
        if (snap.exists()) {
          const data = snap.data()
          if (data?.logs?.length > (lsGet(LS_KEY, []).length || 0)) {
            setLogs(data.logs)
            lsSet(LS_KEY, data.logs)
          }
        }
      } catch {}
    }
    load()
  }, [user])
  const [form,        setForm]        = useState({ date:'', code:'', name:'', trde_tp:'매수', qty:0, price:0, memo:'' })
  const [aiResult,    setAiResult]    = useState('')
  const [aiLoading,   setAiLoading]   = useState(false)
  const [aiError,     setAiError]     = useState('')
  const [filter,      setFilter]      = useState('전체')  // 전체|매수|매도

  // localStorage + Firestore 동기화
  useEffect(() => {
    lsSet(LS_KEY, logs)
    if (!user) return
    const ref = doc(db, 'users', user.uid, 'data', 'tradelog')
    setDoc(ref, { logs, updatedAt: Date.now() }, { merge: true }).catch(() => {})
  }, [logs, user])

  // 체결내역 자동 조회
  const loadOrders = useCallback(async (date = selDate) => {
    setAutoLoading(true); setAutoError('')
    try {
      const url = date === todayStr()
        ? '/api/kiwoom?type=account-orders'
        : `/api/kiwoom?type=account-orders&date=${date}`
      const res  = await fetch(url)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAutoOrders(data)
    } catch (e) { setAutoError(e.message); setAutoOrders(null) }
    finally { setAutoLoading(false) }
  }, [selDate])

  // 체결내역 → 매매일지로 저장
  const importToLog = (order) => {
    const existing = logs.find(l => l.ord_no === order.ord_no)
    if (existing) return
    const entry = {
      id:       Date.now(),
      ord_no:   order.ord_no,
      date:     selDate,
      code:     order.stk_cd,
      name:     order.stk_nm,
      trde_tp:  order.io_tp_nm?.includes('매도') ? '매도' : '매수',
      qty:      order.cntr_qty,
      price:    order.cntr_uv,
      amt:      order.cntr_amt,
      ord_tm:   order.ord_tm,
      memo:     '',
      source:   'auto',
    }
    setLogs(prev => [entry, ...prev])
  }

  const importAll = () => {
    autoOrders?.orders?.forEach(o => importToLog(o))
  }

  // 수동 추가
  const addManual = () => {
    if (!form.name || !form.qty || !form.price) return
    setLogs(prev => [{
      id:     Date.now(),
      date:   form.date || todayStr(),
      code:   form.code,
      name:   form.name,
      trde_tp:form.trde_tp,
      qty:    Number(form.qty),
      price:  Number(form.price),
      amt:    Number(form.qty) * Number(form.price),
      memo:   form.memo,
      source: 'manual',
    }, ...prev])
    setForm({ date:'', code:'', name:'', trde_tp:'매수', qty:0, price:0, memo:'' })
    setShowForm(false)
  }

  const removeLog = id => setLogs(prev => prev.filter(l => l.id !== id))

  const doAI = async () => {
    if (!autoOrders?.orders?.length && !logs.length) return
    setAiLoading(true); setAiError('')
    try {
      const orders = autoOrders?.orders?.length ? autoOrders.orders : logs.slice(0, 20).map(l => ({
        stk_nm: l.name, stk_cd: l.code,
        io_tp_nm: l.trde_tp, cntr_qty: l.qty, cntr_uv: l.price, ord_tm: l.date,
      }))
      setAiResult(await analyzeOrders(orders))
    } catch (e) { setAiError(e.message) }
    finally { setAiLoading(false) }
  }

  const filteredLogs = logs.filter(l => filter === '전체' || l.trde_tp === filter)
  const todayLogs    = filteredLogs.filter(l => l.date === todayStr())
  const pastLogs     = filteredLogs.filter(l => l.date !== todayStr())

  // 통계
  const buyTotal  = logs.filter(l => l.trde_tp === '매수').reduce((s, l) => s + l.amt, 0)
  const sellTotal = logs.filter(l => l.trde_tp === '매도').reduce((s, l) => s + l.amt, 0)

  const TABS = [
    { id:'auto',   label:'📡 체결내역 자동 임포트' },
    { id:'manual', label:'📝 수동 기록'           },
    { id:'ai',     label:'🤖 AI 매매 분석'        },
  ]

  return (
    <div className="tl-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">매매일지</h1>
          <p className="page-sub">체결내역 자동 가져오기 · 수동 기록 · AI 패턴 분석</p>
        </div>
      </div>

      {/* 통계 바 */}
      {logs.length > 0 && (
        <div className="tl-stats">
          <div className="tl-stat"><div className="tl-stat-label">전체 기록</div><div className="tl-stat-val">{logs.length}건</div></div>
          <div className="tl-stat"><div className="tl-stat-label">총 매수금액</div><div className="tl-stat-val" style={{color:'#ef4444'}}>{fmt(buyTotal)}원</div></div>
          <div className="tl-stat"><div className="tl-stat-label">총 매도금액</div><div className="tl-stat-val" style={{color:'#3b82f6'}}>{fmt(sellTotal)}원</div></div>
          <div className="tl-stat"><div className="tl-stat-label">순매수</div><div className="tl-stat-val" style={{color:rateColor(buyTotal-sellTotal)}}>{fmt(buyTotal-sellTotal)}원</div></div>
        </div>
      )}

      {/* 탭 */}
      <div className="tl-tabs">
        {TABS.map(t => <button key={t.id} className={`tl-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>)}
      </div>

      {/* ── 자동 임포트 탭 ── */}
      {activeTab === 'auto' && (
        <div className="tl-section">
          <div className="tl-auto-ctrl">
            <div className="tl-date-wrap">
              <label className="tl-date-label">조회 날짜</label>
              <input type="date" className="tl-date-input"
                value={`${selDate.slice(0,4)}-${selDate.slice(4,6)}-${selDate.slice(6,8)}`}
                onChange={e => setSelDate(e.target.value.replace(/-/g,''))}/>
            </div>
            <button className="tl-btn-primary" onClick={() => loadOrders(selDate)} disabled={autoLoading}>
              {autoLoading ? '⟳ 조회중...' : '📡 체결내역 불러오기'}
            </button>
            {autoOrders?.orders?.length > 0 && (
              <button className="tl-btn-import" onClick={importAll}>
                ⬇️ 전체 일지에 저장 ({autoOrders.orders.length}건)
              </button>
            )}
          </div>

          {autoError && (
            <div className="tl-error">
              ⚠️ {autoError}
              <div className="tl-error-sub">키움 계좌 API는 장중(9:00~15:30)에만 정상 동작합니다. EC2 서버 상태를 확인해주세요.</div>
            </div>
          )}

          {autoLoading && <div className="tl-loading">체결내역 불러오는 중...</div>}

          {!autoLoading && autoOrders && (
            <>
              <div className="tl-auto-summary">
                📋 {formatDate(selDate)} 체결 내역 — <strong>{autoOrders.count}건</strong>
              </div>
              {autoOrders.orders?.length === 0 ? (
                <div className="tl-empty">해당 날짜의 체결 내역이 없습니다</div>
              ) : (
                <div className="tl-auto-table">
                  <div className="tl-auto-th">
                    <div>종목명</div><div>구분</div><div>체결수량</div><div>체결단가</div><div>체결금액</div><div>시간</div><div>저장</div>
                  </div>
                  {autoOrders.orders.map((o, i) => {
                    const isBuy    = o.io_tp_nm?.includes('매수')
                    const imported = !!logs.find(l => l.ord_no === o.ord_no)
                    return (
                      <div key={i} className="tl-auto-row">
                        <div>
                          <div className="tl-stock-nm">{o.stk_nm}</div>
                          <div className="tl-stock-cd">{o.stk_cd}</div>
                        </div>
                        <div>
                          <span className={`tl-type-badge ${isBuy ? 'buy' : 'sell'}`}>{o.io_tp_nm || (isBuy ? '매수' : '매도')}</span>
                        </div>
                        <div className="tl-mono">{fmt(o.cntr_qty)}주</div>
                        <div className="tl-mono">{fmt(o.cntr_uv)}원</div>
                        <div className="tl-mono">{fmt(o.cntr_amt)}원</div>
                        <div className="tl-mono" style={{fontSize:'11px'}}>{o.ord_tm}</div>
                        <div>
                          {imported
                            ? <span className="tl-imported">✓ 저장됨</span>
                            : <button className="tl-import-btn" onClick={() => importToLog(o)}>⬇ 저장</button>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {!autoLoading && !autoOrders && !autoError && (
            <div className="tl-guide">
              <div className="tl-guide-icon">📡</div>
              <p><strong>체결내역 자동 가져오기</strong></p>
              <p className="tl-guide-sub">키움 계좌 API(kt00007)로 오늘 체결된 주문을 자동으로 불러옵니다.<br/>불러온 내역을 일지에 저장하면 수동 기록 탭에서 확인할 수 있습니다.</p>
              <button className="tl-btn-primary" onClick={() => loadOrders(selDate)}>📡 오늘 체결내역 불러오기</button>
            </div>
          )}
        </div>
      )}

      {/* ── 수동 기록 탭 ── */}
      {activeTab === 'manual' && (
        <div className="tl-section">
          <div className="tl-manual-header">
            <div className="tl-filter-group">
              {['전체','매수','매도'].map(f => (
                <button key={f} className={`tl-filter-btn ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}>{f}</button>
              ))}
            </div>
            <button className="tl-btn-primary" onClick={() => setShowForm(v => !v)}>
              {showForm ? '✕ 닫기' : '+ 직접 추가'}
            </button>
          </div>

          {showForm && (
            <div className="tl-form">
              <div className="tl-form-row">
                <div className="tl-form-group">
                  <label>날짜</label>
                  <input type="date" className="tl-input" value={form.date ? `${form.date.slice(0,4)}-${form.date.slice(4,6)}-${form.date.slice(6,8)}` : ''}
                    onChange={e => setForm(p => ({...p, date: e.target.value.replace(/-/g,'')}))}/>
                </div>
                <div className="tl-form-group">
                  <label>종목코드</label>
                  <input className="tl-input mono" placeholder="005930" value={form.code}
                    onChange={e => setForm(p => ({...p, code: e.target.value}))}/>
                </div>
                <div className="tl-form-group">
                  <label>종목명</label>
                  <input className="tl-input" placeholder="삼성전자" value={form.name}
                    onChange={e => setForm(p => ({...p, name: e.target.value}))}/>
                </div>
                <div className="tl-form-group">
                  <label>매매구분</label>
                  <select className="tl-input" value={form.trde_tp} onChange={e => setForm(p => ({...p, trde_tp: e.target.value}))}>
                    <option>매수</option><option>매도</option>
                  </select>
                </div>
                <div className="tl-form-group">
                  <label>수량</label>
                  <input type="number" className="tl-input mono" placeholder="0" value={form.qty || ''}
                    onChange={e => setForm(p => ({...p, qty: e.target.value}))}/>
                </div>
                <div className="tl-form-group">
                  <label>단가</label>
                  <input type="number" className="tl-input mono" placeholder="0" value={form.price || ''}
                    onChange={e => setForm(p => ({...p, price: e.target.value}))}/>
                </div>
                <div className="tl-form-group tl-form-group--memo">
                  <label>메모</label>
                  <input className="tl-input" placeholder="매매 이유, 전략 등" value={form.memo}
                    onChange={e => setForm(p => ({...p, memo: e.target.value}))}/>
                </div>
              </div>
              {form.qty && form.price && (
                <div className="tl-form-preview">
                  예상 금액: <strong>{fmt(Number(form.qty) * Number(form.price))}원</strong>
                </div>
              )}
              <button className="tl-btn-primary" onClick={addManual}>추가</button>
            </div>
          )}

          {filteredLogs.length === 0 ? (
            <div className="tl-empty">
              {logs.length === 0 ? '아직 기록된 매매일지가 없습니다' : '해당 조건의 기록이 없습니다'}
            </div>
          ) : (
            <>
              {todayLogs.length > 0 && (
                <div className="tl-log-group">
                  <div className="tl-log-group-label">📅 오늘</div>
                  <LogTable logs={todayLogs} onDelete={removeLog}/>
                </div>
              )}
              {pastLogs.length > 0 && (
                <div className="tl-log-group">
                  <div className="tl-log-group-label">📂 이전 기록</div>
                  <LogTable logs={pastLogs} onDelete={removeLog}/>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── AI 분석 탭 ── */}
      {activeTab === 'ai' && (
        <div className="tl-section">
          <div className="tl-ai-header">
            <div>🤖 오늘 매매 패턴을 AI가 분석합니다</div>
            <button className="tl-btn-primary" onClick={doAI} disabled={aiLoading || !CLAUDE_KEY}>
              {aiLoading ? '⟳ 분석 중...' : aiResult ? '↺ 다시 분석' : '🔍 AI 분석 시작'}
            </button>
          </div>
          {!CLAUDE_KEY && <div className="tl-ai-warn">⚠️ Claude API 키 미설정</div>}
          {aiError    && <div className="tl-ai-error">⚠️ {aiError}</div>}
          {aiLoading  && <div className="tl-loading">웹 검색 + 매매 패턴 분석 중...</div>}
          {aiResult && !aiLoading && (
            <div className="tl-ai-result">
              <div className="tl-ai-badge">🔍 웹 검색 기반 · {new Date().toLocaleTimeString('ko-KR')}</div>
              <pre className="tl-ai-text">{aiResult}</pre>
            </div>
          )}
          {!aiResult && !aiLoading && !aiError && (
            <div className="tl-guide">
              <div className="tl-guide-icon">🤖</div>
              <p>자동 임포트 또는 수동 기록 후 AI 분석을 실행하세요</p>
              <p className="tl-guide-sub">웹 검색으로 오늘 시장 상황과 연계해 매매 패턴을 분석해드립니다</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 로그 테이블 서브 컴포넌트
function LogTable({ logs, onDelete }) {
  return (
    <div className="tl-log-table">
      <div className="tl-log-th">
        <div>날짜</div><div>종목명</div><div>구분</div><div>수량</div><div>단가</div><div>금액</div><div>출처</div><div>메모</div><div></div>
      </div>
      {logs.map(l => {
        const isBuy = l.trde_tp === '매수'
        return (
          <div key={l.id} className="tl-log-row">
            <div className="tl-mono" style={{fontSize:'11px'}}>{formatDate(l.date)}</div>
            <div>
              <div className="tl-stock-nm">{l.name}</div>
              <div className="tl-stock-cd">{l.code}</div>
            </div>
            <div><span className={`tl-type-badge ${isBuy ? 'buy' : 'sell'}`}>{l.trde_tp}</span></div>
            <div className="tl-mono">{fmt(l.qty)}주</div>
            <div className="tl-mono">{fmt(l.price)}원</div>
            <div className="tl-mono" style={{color: isBuy ? '#ef4444' : '#3b82f6', fontWeight:600}}>{fmt(l.amt)}원</div>
            <div><span className={`tl-src-badge ${l.source}`}>{l.source === 'auto' ? '자동' : '수동'}</span></div>
            <div className="tl-log-memo">{l.memo || '—'}</div>
            <div><button className="tl-del-btn" onClick={() => onDelete(l.id)}>✕</button></div>
          </div>
        )
      })}
    </div>
  )
}
