import { useState, useEffect, useCallback } from 'react'
import './TradingLogPage.css'

const STORAGE_KEY = 'kstock_trading_log'
function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] } }
function save(d) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) } catch {} }
function fmt(n) { if (!n && n !== 0) return '-'; return Number(n).toLocaleString('ko-KR') }
function parseNum(s) { if (!s) return 0; return parseInt(String(s).replace(/[^0-9-]/g, '')) || 0 }

const EMOTIONS = ['😊 긍정', '😐 보통', '😰 불안', '😤 조급', '🧊 냉정']

function getTodayStr() { return new Date().toISOString().slice(0, 10) }
function getDateStr(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

export default function TradingLogPage() {
  const [logs, setLogs]       = useState(() => load())
  const [addMode, setAdd]     = useState(false)
  const [filterType, setFt]   = useState('전체')
  const [filterDate, setFd]   = useState('전체')
  const [importing, setImp]   = useState(false)
  const [importMsg, setImMsg] = useState('')
  const [form, setForm]       = useState({
    date: getTodayStr(), type: '매수', name: '', code: '',
    qty: '', price: '', reason: '', emotion: '😐 보통', lesson: ''
  })
  const [aiLoading, setAiL]   = useState(false)
  const [aiResult, setAiR]    = useState('')
  const [aiError, setAiE]     = useState('')

  useEffect(() => save(logs), [logs])

  // 키움 체결내역 자동 불러오기
  const importTrades = useCallback(async (dateStr) => {
    setImp(true)
    setImMsg('')
    try {
      const res = await fetch('/api/kiwoom?type=trades&date=' + dateStr)
      const data = await res.json()

      if (data.return_code !== 0) throw new Error(data.return_msg || '조회 실패')

      const orders = data.acnt_ord_cntr_prps_dtl || []
      const newLogs = []

      for (const o of orders) {
        // 체결된 것만 (체결수량 > 0)
        const cntrQty = parseNum(o.cntr_qty)
        if (cntrQty === 0) continue

        const isBuy  = o.sell_tp === '2' || o.sell_tp_nm?.includes('매수')
        const isSell = o.sell_tp === '1' || o.sell_tp_nm?.includes('매도')
        if (!isBuy && !isSell) continue

        const id = `${o.ord_no}_${dateStr}`
        // 중복 체크
        if (logs.find(l => l.importId === id)) continue

        newLogs.push({
          id: Date.now() + Math.random(),
          importId: id,
          date: dateStr.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
          type: isBuy ? '매수' : '매도',
          name: o.stk_nm || '',
          code: o.stk_cd?.replace(/^A/, '') || '',
          qty: cntrQty,
          price: parseNum(o.cntr_pric),
          reason: '',
          emotion: '😐 보통',
          lesson: '',
          auto: true,
        })
      }

      if (newLogs.length === 0) {
        setImMsg('새로 불러올 체결 내역이 없습니다.')
      } else {
        setLogs(prev => [...newLogs, ...prev])
        setImMsg(`✅ ${newLogs.length}건 불러왔습니다.`)
      }
    } catch (e) {
      setImMsg('⚠️ ' + e.message)
    } finally {
      setImp(false)
    }
  }, [logs])

  const addLog = () => {
    if (!form.name || !form.qty || !form.price) return
    setLogs(p => [{ ...form, qty: Number(form.qty), price: Number(form.price), id: Date.now() }, ...p])
    setForm({ date: getTodayStr(), type: '매수', name: '', code: '', qty: '', price: '', reason: '', emotion: '😐 보통', lesson: '' })
    setAdd(false)
  }
  const remove = (id) => setLogs(p => p.filter(i => i.id !== id))
  const updateLog = (id, field, value) => setLogs(p => p.map(l => l.id === id ? { ...l, [field]: value } : l))

  // 날짜 필터
  const today = getTodayStr()
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30)

  const filtered = logs
    .filter(l => filterType === '전체' || l.type === filterType)
    .filter(l => {
      if (filterDate === '전체') return true
      const d = new Date(l.date)
      if (filterDate === '오늘') return l.date === today
      if (filterDate === '7일') return d >= weekAgo
      if (filterDate === '30일') return d >= monthAgo
      return true
    })

  const totalBuy  = logs.filter(l => l.type === '매수').reduce((s, l) => s + l.qty * l.price, 0)
  const totalSell = logs.filter(l => l.type === '매도').reduce((s, l) => s + l.qty * l.price, 0)

  // AI 매매 리뷰
  const handleAIReview = async () => {
    if (logs.length === 0) return
    setAiL(true); setAiR(''); setAiE('')
    try {
      const key = import.meta.env.VITE_CLAUDE_API_KEY
      if (!key) throw new Error('Claude API 키가 없어요.')
      const todayStr = new Date().toLocaleDateString('ko-KR')
      const summary = logs.slice(0, 15).map(l =>
        `${l.date} ${l.type} ${l.name} ${l.qty}주 @${fmt(l.price)}원 | 이유:${l.reason || '없음'} | 심리:${l.emotion}`
      ).join('\n')
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 900,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content:
            `아래는 최근 매매 내역이에요. 웹 검색으로 오늘(${todayStr}) 시장 상황도 참고해서 매매 패턴을 분석해줘.\n\n${summary}\n\n## 📊 매매 패턴 분석\n## ✅ 잘한 점\n## ⚠️ 개선 필요한 점\n## 💡 오늘 시장 상황 기반 다음 전략 제안\n\n구체적이고 실용적으로 작성해줘.`
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

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">매매일지</h1>
          <p className="page-sub">매매 기록 · 키움 자동 불러오기 · AI 패턴 분석</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {logs.length > 0 && (
            <button className="btn-ai" style={{ background: '#7c3aed' }} onClick={handleAIReview} disabled={aiLoading}>
              {aiLoading ? '🔍 분석중...' : '🔍 AI 매매 리뷰'}
            </button>
          )}
          <button className="btn-ai" style={{ background: '#0d9488' }} onClick={() => importTrades(getDateStr(0))} disabled={importing}>
            {importing ? '⟳ 불러오는중...' : '⬇ 오늘 체결 불러오기'}
          </button>
          <button className="btn-ai" onClick={() => setAdd(v => !v)}>
            {addMode ? '✕ 닫기' : '+ 직접 추가'}
          </button>
        </div>
      </div>

      <div className="page-body">

        {/* 직접 추가 폼 */}
        {addMode && (
          <div className="card-section">
            <span className="section-title">매매 기록 직접 추가</span>
            <div className="tlog-form">
              <input type="date" className="add-input" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              <select className="add-select tlog-type-sel" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                {['매수', '매도', '정정'].map(t => <option key={t}>{t}</option>)}
              </select>
              <input className="add-input" placeholder="종목명" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              <input className="add-input mono" placeholder="종목코드" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} />
              <input className="add-input" type="number" placeholder="수량" value={form.qty} onChange={e => setForm(p => ({ ...p, qty: e.target.value }))} />
              <input className="add-input" type="number" placeholder="체결가 (원)" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
              <input className="add-input tlog-wide" placeholder="매매 이유" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
              <select className="add-select" value={form.emotion} onChange={e => setForm(p => ({ ...p, emotion: e.target.value }))}>
                {EMOTIONS.map(e => <option key={e}>{e}</option>)}
              </select>
              <input className="add-input tlog-wide" placeholder="교훈 메모" value={form.lesson} onChange={e => setForm(p => ({ ...p, lesson: e.target.value }))} />
              <button className="btn-ai" onClick={addLog}>기록</button>
            </div>
          </div>
        )}

        {/* 불러오기 메시지 */}
        {importMsg && (
          <div className={`tlog-import-msg ${importMsg.startsWith('✅') ? 'success' : 'warn'}`}>
            {importMsg}
          </div>
        )}

        {/* AI 결과 */}
        {(aiResult || aiError) && (
          <div className="card-section">
            <span className="section-title">🔍 AI 매매 리뷰</span>
            {aiError && <div className="ai-error">{aiError}</div>}
            {aiResult && <div className="ai-result"><pre>{aiResult}</pre></div>}
          </div>
        )}

        {/* 통계 */}
        {logs.length > 0 && (
          <div className="tlog-stats">
            {[
              { label: '총 매수금액', value: fmt(totalBuy) + '원', color: '#dc2626' },
              { label: '총 매도금액', value: fmt(totalSell) + '원', color: '#16a34a' },
              { label: '총 거래건수', value: logs.length + '건', color: '#2563eb' },
              { label: '매수 / 매도', value: `${logs.filter(l => l.type === '매수').length} / ${logs.filter(l => l.type === '매도').length}건`, color: '#7c3aed' },
            ].map(s => (
              <div key={s.label} className="card-section tlog-stat">
                <div className="tlog-stat-label">{s.label}</div>
                <div className="tlog-stat-value" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* 필터 */}
        <div className="tlog-filters">
          <div className="tlog-filter-group">
            {['전체', '매수', '매도', '정정'].map(t => (
              <button key={t} className={`filter-chip ${filterType === t ? 'active' : ''}`} onClick={() => setFt(t)}>{t}</button>
            ))}
          </div>
          <div className="tlog-filter-group">
            {['전체', '오늘', '7일', '30일'].map(t => (
              <button key={t} className={`filter-chip ${filterDate === t ? 'active' : ''}`} onClick={() => setFd(t)}>{t}</button>
            ))}
          </div>
        </div>

        {/* 리스트 테이블 */}
        {filtered.length === 0 ? (
          <div className="card-section pf-empty">
            <div className="empty-icon">📓</div>
            <p>기록된 매매내역이 없어요</p>
            <p className="sub-text">"⬇ 오늘 체결 불러오기" 버튼으로 자동으로 가져올 수 있어요</p>
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
                <div key={l.id} className="tlt-row">
                  <div className="tlt-col-date">{l.date}</div>
                  <div className="tlt-col-type">
                    <span className={`tlog-badge tlog-badge-${l.type === '매수' ? 'buy' : l.type === '매도' ? 'sell' : 'edit'}`}>{l.type}</span>
                    {l.auto && <span className="tlog-auto-badge">자동</span>}
                  </div>
                  <div className="tlt-col-name">
                    <div className="tlt-name">{l.name}</div>
                    {l.code && <div className="tlt-code">{l.code}</div>}
                  </div>
                  <div className="tlt-col-qty">{fmt(l.qty)}주</div>
                  <div className="tlt-col-price">{fmt(l.price)}원</div>
                  <div className="tlt-col-total tlt-total">{fmt(l.qty * l.price)}원</div>
                  <div className="tlt-col-reason">
                    <input
                      className="tlt-edit-input"
                      placeholder="이유 입력..."
                      value={l.reason || ''}
                      onChange={e => updateLog(l.id, 'reason', e.target.value)}
                    />
                  </div>
                  <div className="tlt-col-emotion">
                    <select className="tlt-edit-select" value={l.emotion || '😐 보통'} onChange={e => updateLog(l.id, 'emotion', e.target.value)}>
                      {EMOTIONS.map(e => <option key={e}>{e}</option>)}
                    </select>
                  </div>
                  <div className="tlt-col-lesson">
                    <input
                      className="tlt-edit-input"
                      placeholder="교훈..."
                      value={l.lesson || ''}
                      onChange={e => updateLog(l.id, 'lesson', e.target.value)}
                    />
                  </div>
                  <div className="tlt-col-del">
                    <button className="tlt-remove" onClick={() => remove(l.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
