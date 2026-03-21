import { useState, useEffect } from 'react'
import './TradingLogPage.css'

const STORAGE_KEY = 'kstock_trading_log'
function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]') } catch { return [] } }
function save(d) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) } catch {} }

export default function TradingLogPage() {
  const [logs, setLogs]     = useState(() => load())
  const [addMode, setAdd]   = useState(false)
  const [filterType, setFt] = useState('전체')
  const [form, setForm]     = useState({ date:new Date().toISOString().slice(0,10), type:'매수', name:'', code:'', qty:'', price:'', reason:'', emotion:'😐 보통', lesson:'' })
  const [aiLoading, setAiL] = useState(false)
  const [aiResult, setAiR]  = useState('')
  const [aiError, setAiE]   = useState('')

  useEffect(() => save(logs), [logs])

  const addLog = () => {
    if (!form.name||!form.qty||!form.price) return
    setLogs(p => [{ ...form, qty:Number(form.qty), price:Number(form.price), id:Date.now() }, ...p])
    setForm({ date:new Date().toISOString().slice(0,10), type:'매수', name:'', code:'', qty:'', price:'', reason:'', emotion:'😐 보통', lesson:'' })
    setAdd(false)
  }
  const remove = (id) => setLogs(p => p.filter(i => i.id !== id))

  const filtered = filterType==='전체' ? logs : logs.filter(l => l.type===filterType)
  const totalBuy  = logs.filter(l=>l.type==='매수').reduce((s,l)=>s+l.qty*l.price,0)
  const totalSell = logs.filter(l=>l.type==='매도').reduce((s,l)=>s+l.qty*l.price,0)

  // ✅ 웹 검색 포함 AI 매매 리뷰
  const handleAIReview = async () => {
    if (logs.length===0) return
    setAiL(true); setAiR(''); setAiE('')
    try {
      const key = import.meta.env.VITE_CLAUDE_API_KEY
      if (!key) throw new Error('Claude API 키가 없어요.')
      const today = new Date().toLocaleDateString('ko-KR')
      const summary = logs.slice(0,10).map(l =>
        `${l.date} ${l.type} ${l.name} ${l.qty}주 @${l.price.toLocaleString()}원 | 이유:${l.reason||'없음'} | 심리:${l.emotion}`
      ).join('\n')
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{ 'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
        body: JSON.stringify({
          model:'claude-haiku-4-5-20251001',
          max_tokens:900,
          tools:[{ type:'web_search_20250305', name:'web_search' }],
          messages:[{ role:'user', content:
            `아래는 최근 매매 내역이에요. 웹 검색으로 오늘(${today}) 시장 상황도 참고해서 매매 패턴을 분석해줘.\n\n${summary}\n\n## 📊 매매 패턴 분석\n## ✅ 잘한 점\n## ⚠️ 개선 필요한 점\n## 💡 오늘 시장 상황 기반 다음 전략 제안\n\n구체적이고 실용적으로 작성해줘.`
          }]
        })
      })
      if (!res.ok) throw new Error(`API 오류 ${res.status}`)
      const data = await res.json()
      const text = data.content.filter(b=>b.type==='text').map(b=>b.text).join('\n')
      setAiR(text || '분석 결과를 가져오지 못했어요.')
    } catch(e) { setAiE(e.message) }
    finally { setAiL(false) }
  }

  const EMOTIONS = ['😊 긍정','😐 보통','😰 불안','😤 조급','🧊 냉정']

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">매매일지</h1>
          <p className="page-sub">매매 기록 · 패턴 분석 · AI 매매 리뷰</p>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          {logs.length>0 && (
            <button className="btn-ai" style={{background:'#7c3aed'}} onClick={handleAIReview} disabled={aiLoading}>
              {aiLoading?<><span className="btn-spinner"/>검색 중...</>:<>🔍 AI 매매 리뷰</>}
            </button>
          )}
          <button className="btn-ai" onClick={()=>setAdd(v=>!v)}>
            {addMode?'✕ 닫기':'+ 기록 추가'}
          </button>
        </div>
      </div>
      <div className="page-body">

        {addMode && (
          <div className="card-section">
            <span className="section-title">매매 기록 추가</span>
            <div className="tlog-form">
              <input type="date" className="add-input" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))}/>
              <select className="add-select tlog-type-sel" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                {['매수','매도','정정'].map(t=><option key={t}>{t}</option>)}
              </select>
              <input className="add-input" placeholder="종목명" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
              <input className="add-input mono" placeholder="종목코드" value={form.code} onChange={e=>setForm(p=>({...p,code:e.target.value}))}/>
              <input className="add-input" type="number" placeholder="수량" value={form.qty} onChange={e=>setForm(p=>({...p,qty:e.target.value}))}/>
              <input className="add-input" type="number" placeholder="체결가 (원)" value={form.price} onChange={e=>setForm(p=>({...p,price:e.target.value}))}/>
              <input className="add-input tlog-wide" placeholder="매매 이유" value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))}/>
              <select className="add-select" value={form.emotion} onChange={e=>setForm(p=>({...p,emotion:e.target.value}))}>
                {EMOTIONS.map(e=><option key={e}>{e}</option>)}
              </select>
              <input className="add-input tlog-wide" placeholder="교훈 메모" value={form.lesson} onChange={e=>setForm(p=>({...p,lesson:e.target.value}))}/>
              <button className="btn-ai" onClick={addLog}>기록</button>
            </div>
          </div>
        )}

        {(aiResult||aiError) && (
          <div className="card-section">
            <span className="section-title">🔍 AI 매매 리뷰 (웹 검색 기반)</span>
            {aiError && <div className="ai-error">{aiError}</div>}
            {aiResult && <div className="ai-result"><pre>{aiResult}</pre></div>}
          </div>
        )}

        {logs.length>0 && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:'10px'}}>
            {[
              {label:'총 매수금액', value:totalBuy.toLocaleString()+'원',  color:'#dc2626'},
              {label:'총 매도금액', value:totalSell.toLocaleString()+'원', color:'#16a34a'},
              {label:'총 거래건수', value:logs.length+'건',                color:'#2563eb'},
              {label:'매수 / 매도', value:`${logs.filter(l=>l.type==='매수').length} / ${logs.filter(l=>l.type==='매도').length}건`, color:'#7c3aed'},
            ].map(s=>(
              <div key={s.label} className="card-section tlog-stat">
                <div className="tlog-stat-label">{s.label}</div>
                <div className="tlog-stat-value" style={{color:s.color}}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="tlog-filter">
          {['전체','매수','매도','정정'].map(t=>(
            <button key={t} className={`filter-chip ${filterType===t?'active':''}`} onClick={()=>setFt(t)}>{t}</button>
          ))}
        </div>

        {filtered.length===0 ? (
          <div className="card-section pf-empty">
            <div className="empty-icon">📓</div>
            <p>기록된 매매내역이 없어요</p>
            <p className="sub-text">"+ 기록 추가" 버튼으로 매매를 기록해보세요</p>
          </div>
        ) : (
          <div className="card-grid">
            {filtered.map(l=>(
              <div key={l.id} className={`tlog-card tlog-${l.type==='매수'?'buy':l.type==='매도'?'sell':'edit'}`}>
                <div className="tlog-card-top">
                  <span className={`tlog-type-badge tlog-badge-${l.type==='매수'?'buy':l.type==='매도'?'sell':'edit'}`}>{l.type}</span>
                  <span className="tlog-date">{l.date}</span>
                  <button className="pf-remove" onClick={()=>remove(l.id)}>✕</button>
                </div>
                <div className="tlog-name">{l.name}</div>
                {l.code && <div className="tlog-code">{l.code}</div>}
                <div className="tlog-amounts">
                  <span>{l.qty.toLocaleString()}주</span>
                  <span className="tlog-at">@</span>
                  <span>{l.price.toLocaleString()}원</span>
                  <span className="tlog-total">= {(l.qty*l.price).toLocaleString()}원</span>
                </div>
                {l.reason  && <div className="tlog-reason">💬 {l.reason}</div>}
                {l.emotion && <div className="tlog-emotion">{l.emotion}</div>}
                {l.lesson  && <div className="tlog-lesson">📝 {l.lesson}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
