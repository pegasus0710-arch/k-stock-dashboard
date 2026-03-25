import { useState, useEffect, useCallback } from 'react'
import { db } from '../firebase'
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, orderBy, where, Timestamp
} from 'firebase/firestore'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'
import './TradingLogPage.css'

function fmt(n) { if (!n && n !== 0) return '-'; return Number(n).toLocaleString('ko-KR') }
function parseNum(s) { if (!s) return 0; return parseInt(String(s).replace(/[^0-9-]/g, '')) || 0 }
function toDateStr(d) { return d.toISOString().slice(0, 10) }
function getOffset(days) { const d = new Date(); d.setDate(d.getDate() + days); return toDateStr(d) }

const EMOTIONS = ['😊 긍정', '😐 보통', '😰 불안', '😤 조급', '🧊 냉정']
const COLL = 'trading_logs'

// ── Firebase CRUD ──
async function saveTrade(trade) {
  return addDoc(collection(db, COLL), { ...trade, createdAt: Timestamp.now() })
}
async function fetchTrades() {
  const q = query(collection(db, COLL), orderBy('date', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ ...d.data(), _id: d.id }))
}
async function removeTrade(id) {
  await deleteDoc(doc(db, COLL, id))
}
async function patchTrade(id, data) {
  await updateDoc(doc(db, COLL, id), data)
}

// ── 손익 계산 (FIFO 매칭) ──
function calcPnL(logs) {
  const byCode = {}
  const result = []

  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date))

  for (const t of sorted) {
    if (!byCode[t.code]) byCode[t.code] = []
    if (t.type === '매수') {
      byCode[t.code].push({ qty: t.qty, price: t.price, date: t.date })
    } else if (t.type === '매도') {
      let remainQty = t.qty
      let totalCost = 0
      while (remainQty > 0 && byCode[t.code]?.length > 0) {
        const buy = byCode[t.code][0]
        const matchQty = Math.min(remainQty, buy.qty)
        totalCost += matchQty * buy.price
        remainQty -= matchQty
        buy.qty -= matchQty
        if (buy.qty === 0) byCode[t.code].shift()
      }
      const revenue = t.qty * t.price
      const pl = revenue - totalCost
      result.push({ code: t.code, name: t.name, date: t.date, qty: t.qty, sellPrice: t.price, pl, plRate: totalCost > 0 ? pl / totalCost * 100 : 0 })
    }
  }
  return result
}

export default function TradingLogPage() {
  const [tab, setTab]           = useState('거래내역')
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [importing, setImp]     = useState(false)
  const [importMsg, setImMsg]   = useState('')
  const [filterType, setFt]     = useState('전체')
  const [startDate, setStart]   = useState(getOffset(-30))
  const [endDate, setEnd]       = useState(toDateStr(new Date()))
  const [importStart, setIS]    = useState(toDateStr(new Date()))
  const [importEnd, setIE]      = useState(toDateStr(new Date()))
  const [editId, setEditId]     = useState(null)
  const [aiLoading, setAiL]     = useState(false)
  const [aiResult, setAiR]      = useState('')
  const [aiError, setAiE]       = useState('')

  // Firestore 불러오기
  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchTrades()
      setLogs(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadLogs() }, [loadLogs])

  // 키움 체결내역 불러오기
  const importFromKiwoom = async () => {
    setImp(true); setImMsg('')
    try {
      // 날짜 범위 순회 (하루씩)
      const start = new Date(importStart)
      const end   = new Date(importEnd)
      let newCount = 0

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = toDateStr(d).replace(/-/g, '')
        const res  = await fetch(`/api/kiwoom?type=trades&date=${dateStr}`)
        const data = await res.json()

        if (data.return_code !== 0) continue

        const orders = data.acnt_ord_cntr_prps_dtl || []
        for (const o of orders) {
          const cntrQty = parseNum(o.cntr_qty)
          if (cntrQty === 0) continue

          const isBuy  = o.sell_tp === '2' || o.sell_tp_nm?.includes('매수')
          const isSell = o.sell_tp === '1' || o.sell_tp_nm?.includes('매도')
          if (!isBuy && !isSell) continue

          const importId = `${o.ord_no}_${dateStr}`
          if (logs.find(l => l.importId === importId)) continue

          const trade = {
            importId,
            date:    toDateStr(d),
            type:    isBuy ? '매수' : '매도',
            name:    o.stk_nm || '',
            code:    o.stk_cd?.replace(/^A/, '') || '',
            qty:     cntrQty,
            price:   parseNum(o.cntr_pric),
            amount:  cntrQty * parseNum(o.cntr_pric),
            reason:  '',
            emotion: '😐 보통',
            lesson:  '',
            auto:    true,
          }
          await saveTrade(trade)
          newCount++
        }
      }

      setImMsg(newCount > 0 ? `✅ ${newCount}건 저장됐습니다.` : '새로운 체결 내역이 없습니다.')
      await loadLogs()
    } catch (e) {
      setImMsg('⚠️ ' + e.message)
    } finally {
      setImp(false)
    }
  }

  const handleDelete = async (id) => {
    await removeTrade(id)
    setLogs(p => p.filter(l => l._id !== id))
  }

  const handlePatch = async (id, field, value) => {
    setLogs(p => p.map(l => l._id === id ? { ...l, [field]: value } : l))
    await patchTrade(id, { [field]: value })
  }

  // 필터
  const filtered = logs.filter(l => {
    if (filterType !== '전체' && l.type !== filterType) return false
    if (l.date < startDate || l.date > endDate) return false
    return true
  })

  // 통계
  const totalBuy    = logs.filter(l => l.type === '매수').reduce((s, l) => s + l.amount, 0)
  const totalSell   = logs.filter(l => l.type === '매도').reduce((s, l) => s + l.amount, 0)
  const pnlList     = calcPnL(logs)
  const totalPl     = pnlList.reduce((s, t) => s + t.pl, 0)
  const winCount    = pnlList.filter(t => t.pl > 0).length
  const loseCount   = pnlList.filter(t => t.pl < 0).length
  const winRate     = pnlList.length > 0 ? (winCount / pnlList.length * 100).toFixed(1) : 0

  // 종목별 손익 (차트용)
  const byCode = {}
  for (const t of pnlList) {
    if (!byCode[t.code]) byCode[t.code] = { name: t.name, code: t.code, pl: 0, count: 0 }
    byCode[t.code].pl += t.pl
    byCode[t.code].count++
  }
  const stockPnl = Object.values(byCode).sort((a, b) => b.pl - a.pl)

  // 일별 누적 손익 (차트용)
  const dailyPnl = []
  const dailyMap = {}
  for (const t of pnlList) {
    if (!dailyMap[t.date]) dailyMap[t.date] = 0
    dailyMap[t.date] += t.pl
  }
  let cumPl = 0
  for (const date of Object.keys(dailyMap).sort()) {
    cumPl += dailyMap[date]
    dailyPnl.push({ date: date.slice(5), pl: Math.round(cumPl) })
  }

  // AI 리뷰
  const handleAI = async () => {
    if (logs.length === 0) return
    setAiL(true); setAiR(''); setAiE('')
    try {
      const key = import.meta.env.VITE_CLAUDE_API_KEY
      if (!key) throw new Error('Claude API 키가 없어요.')
      const todayStr = new Date().toLocaleDateString('ko-KR')
      const recentLogs = filtered.slice(0, 20).map(l =>
        `${l.date} ${l.type} ${l.name}(${l.code}) ${l.qty}주 @${fmt(l.price)}원 | 이유:${l.reason || '없음'} | 심리:${l.emotion}`
      ).join('\n')
      const pnlSummary = stockPnl.map(s => `${s.name}: ${s.pl > 0 ? '+' : ''}${fmt(Math.round(s.pl))}원 (${s.count}회)`).join(', ')

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1200,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content:
            `아래는 나의 최근 주식 매매 내역과 손익 분석이에요. 웹 검색으로 오늘(${todayStr}) 시장 상황도 참고해서 분석해줘.\n\n## 매매 내역\n${recentLogs}\n\n## 종목별 손익\n${pnlSummary}\n\n## 전체 통계\n- 총 거래: ${logs.length}건\n- 승률: ${winRate}% (${winCount}승 ${loseCount}패)\n- 누적 손익: ${fmt(Math.round(totalPl))}원\n\n아래 형식으로 분석해줘:\n\n## 📊 매매 패턴 분석\n## ✅ 잘한 점\n## ⚠️ 개선이 필요한 점\n## 💡 오늘 시장 상황 기반 다음 전략 제안\n\n구체적이고 실용적으로 작성해줘.`
          }]
        })
      })
      if (!res.ok) throw new Error(`API 오류 ${res.status}`)
      const data = await res.json()
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
      setAiR(text || '분석 결과를 가져오지 못했어요.')
    } catch (e) { setAiE(e.message) }
    finally { setAiL(false) }
  }

  const plColor = totalPl > 0 ? '#ef4444' : totalPl < 0 ? '#3b82f6' : 'var(--text-2)'
  const plSign  = totalPl > 0 ? '+' : ''

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">매매일지</h1>
          <p className="page-sub">키움 자동 연동 · Firebase 저장 · 손익 분석 · AI 리뷰</p>
        </div>
      </div>

      <div className="page-body">

        {/* 탭 */}
        <div className="tlog-tabs">
          {['거래내역', '손익분석', 'AI 리뷰'].map(t => (
            <button key={t} className={`tlog-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {/* ── 거래내역 탭 ── */}
        {tab === '거래내역' && (
          <>
            {/* 키움 불러오기 */}
            <div className="card-section">
              <span className="section-title">키움 체결내역 불러오기</span>
              <div className="tlog-import-bar">
                <input type="date" className="add-input" value={importStart} onChange={e => setIS(e.target.value)} />
                <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>~</span>
                <input type="date" className="add-input" value={importEnd} onChange={e => setIE(e.target.value)} />
                <button className="btn-ai" style={{ background: '#0d9488', flexShrink: 0 }} onClick={importFromKiwoom} disabled={importing}>
                  {importing ? '⟳ 불러오는중...' : '⬇ 불러오기'}
                </button>
              </div>
              {importMsg && (
                <div className={`tlog-msg ${importMsg.startsWith('✅') ? 'success' : 'warn'}`}>{importMsg}</div>
              )}
            </div>

            {/* 필터 */}
            <div className="tlog-filter-bar">
              <div className="tlog-filter-group">
                {['전체', '매수', '매도'].map(t => (
                  <button key={t} className={`filter-chip ${filterType === t ? 'active' : ''}`} onClick={() => setFt(t)}>{t}</button>
                ))}
              </div>
              <div className="tlog-filter-group">
                <input type="date" className="add-input" style={{ flex: 'none', width: '130px' }} value={startDate} onChange={e => setStart(e.target.value)} />
                <span style={{ color: 'var(--text-3)' }}>~</span>
                <input type="date" className="add-input" style={{ flex: 'none', width: '130px' }} value={endDate} onChange={e => setEnd(e.target.value)} />
              </div>
            </div>

            {/* 요약 */}
            {logs.length > 0 && (
              <div className="tlog-stats">
                {[
                  { label: '총 매수금액', value: fmt(totalBuy) + '원', color: '#dc2626' },
                  { label: '총 매도금액', value: fmt(totalSell) + '원', color: '#16a34a' },
                  { label: '총 거래건수', value: logs.length + '건', color: '#2563eb' },
                  { label: '누적 손익', value: plSign + fmt(Math.round(totalPl)) + '원', color: plColor },
                ].map(s => (
                  <div key={s.label} className="card-section tlog-stat">
                    <div className="tlog-stat-label">{s.label}</div>
                    <div className="tlog-stat-value" style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 거래 리스트 */}
            {loading ? (
              <div className="card-section pf-empty"><div className="empty-icon">⟳</div><p>불러오는 중...</p></div>
            ) : filtered.length === 0 ? (
              <div className="card-section pf-empty">
                <div className="empty-icon">📓</div>
                <p>거래 내역이 없어요</p>
                <p className="sub-text">위에서 키움 체결내역을 불러오세요</p>
              </div>
            ) : (
              <div className="tlog-table-wrap">
                <div className="tlog-table">
                  <div className="tlt-header">
                    <div className="tlt-col-date">날짜</div>
                    <div className="tlt-col-type">구분</div>
                    <div className="tlt-col-name">종목명</div>
                    <div className="tlt-col-qty">수량</div>
                    <div className="tlt-col-price">체결가</div>
                    <div className="tlt-col-total">거래금액</div>
                    <div className="tlt-col-reason">매매 이유</div>
                    <div className="tlt-col-emotion">심리</div>
                    <div className="tlt-col-lesson">교훈</div>
                    <div className="tlt-col-del"></div>
                  </div>
                  {filtered.map(l => (
                    <div key={l._id} className="tlt-row">
                      <div className="tlt-col-date">{l.date}</div>
                      <div className="tlt-col-type">
                        <span className={`tlog-badge tlog-badge-${l.type === '매수' ? 'buy' : 'sell'}`}>{l.type}</span>
                        {l.auto && <span className="tlog-auto-badge">자동</span>}
                      </div>
                      <div className="tlt-col-name">
                        <div className="tlt-name">{l.name}</div>
                        <div className="tlt-code">{l.code}</div>
                      </div>
                      <div className="tlt-col-qty">{fmt(l.qty)}주</div>
                      <div className="tlt-col-price">{fmt(l.price)}원</div>
                      <div className="tlt-col-total tlt-total">{fmt(l.qty * l.price)}원</div>
                      <div className="tlt-col-reason">
                        <input className="tlt-input" placeholder="이유..." value={l.reason || ''}
                          onChange={e => handlePatch(l._id, 'reason', e.target.value)} />
                      </div>
                      <div className="tlt-col-emotion">
                        <select className="tlt-select" value={l.emotion || '😐 보통'}
                          onChange={e => handlePatch(l._id, 'emotion', e.target.value)}>
                          {EMOTIONS.map(e => <option key={e}>{e}</option>)}
                        </select>
                      </div>
                      <div className="tlt-col-lesson">
                        <input className="tlt-input" placeholder="교훈..." value={l.lesson || ''}
                          onChange={e => handlePatch(l._id, 'lesson', e.target.value)} />
                      </div>
                      <div className="tlt-col-del">
                        <button className="tlt-remove" onClick={() => handleDelete(l._id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── 손익분석 탭 ── */}
        {tab === '손익분석' && (
          <>
            {/* 요약 카드 */}
            <div className="tlog-stats">
              {[
                { label: '누적 손익', value: plSign + fmt(Math.round(totalPl)) + '원', color: plColor },
                { label: '승률', value: winRate + '%', color: '#7c3aed' },
                { label: '수익 거래', value: winCount + '건', color: '#16a34a' },
                { label: '손실 거래', value: loseCount + '건', color: '#dc2626' },
              ].map(s => (
                <div key={s.label} className="card-section tlog-stat">
                  <div className="tlog-stat-label">{s.label}</div>
                  <div className="tlog-stat-value" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* 누적 손익 차트 */}
            {dailyPnl.length > 1 && (
              <div className="card-section">
                <span className="section-title">누적 손익 추이</span>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={dailyPnl}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} width={80} />
                    <Tooltip formatter={v => fmt(v) + '원'} />
                    <Line type="monotone" dataKey="pl" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* 종목별 손익 차트 */}
            {stockPnl.length > 0 && (
              <div className="card-section">
                <span className="section-title">종목별 손익</span>
                <ResponsiveContainer width="100%" height={Math.max(160, stockPnl.length * 40)}>
                  <BarChart data={stockPnl} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={100} />
                    <Tooltip formatter={v => fmt(Math.round(v)) + '원'} />
                    <Bar dataKey="pl" radius={[0, 4, 4, 0]}>
                      {stockPnl.map((s, i) => (
                        <Cell key={i} fill={s.pl >= 0 ? '#ef4444' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* 종목별 손익 테이블 */}
            {stockPnl.length > 0 && (
              <div className="card-section">
                <span className="section-title">종목별 상세</span>
                <div className="pnl-table-wrap">
                  <div className="pnl-table">
                    <div className="pnl-header">
                      <div>종목명</div>
                      <div>거래횟수</div>
                      <div>손익</div>
                      <div>수익률</div>
                    </div>
                    {stockPnl.map(s => (
                      <div key={s.code} className="pnl-row">
                        <div>
                          <div className="tlt-name">{s.name}</div>
                          <div className="tlt-code">{s.code}</div>
                        </div>
                        <div>{s.count}회</div>
                        <div style={{ color: s.pl >= 0 ? '#ef4444' : '#3b82f6', fontWeight: 700 }}>
                          {s.pl >= 0 ? '+' : ''}{fmt(Math.round(s.pl))}원
                        </div>
                        <div style={{ color: s.pl >= 0 ? '#ef4444' : '#3b82f6' }}>
                          {s.pl >= 0 ? '+' : ''}{Number(s.plRate).toFixed(2)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {pnlList.length === 0 && (
              <div className="card-section pf-empty">
                <div className="empty-icon">📊</div>
                <p>분석할 데이터가 없어요</p>
                <p className="sub-text">매수/매도 거래가 모두 있어야 손익이 계산됩니다</p>
              </div>
            )}
          </>
        )}

        {/* ── AI 리뷰 탭 ── */}
        {tab === 'AI 리뷰' && (
          <>
            <div className="card-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span className="section-title">🔍 AI 매매 패턴 분석</span>
                <button className="btn-ai" style={{ background: '#7c3aed' }} onClick={handleAI} disabled={aiLoading || logs.length === 0}>
                  {aiLoading ? '🔍 분석중...' : '분석 시작'}
                </button>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-3)', lineHeight: 1.6 }}>
                전체 매매 내역 + 종목별 손익 + 오늘 시장 상황(웹 검색)을 종합해서 패턴을 분석하고 다음 전략을 제안합니다.
              </p>
            </div>

            {aiError && (
              <div className="card-section">
                <div className="ai-error">⚠️ {aiError}</div>
              </div>
            )}
            {aiResult && (
              <div className="card-section">
                <div className="ai-result"><pre>{aiResult}</pre></div>
              </div>
            )}
            {!aiResult && !aiError && !aiLoading && (
              <div className="card-section pf-empty">
                <div className="empty-icon">🤖</div>
                <p>위 "분석 시작" 버튼을 눌러주세요</p>
                <p className="sub-text">매매 기록이 많을수록 정확한 분석이 됩니다</p>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
