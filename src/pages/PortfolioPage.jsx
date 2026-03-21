import { useState, useEffect } from 'react'
import './PortfolioPage.css'

const STORAGE_KEY = 'kstock_portfolio'
function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] } }
function save(d) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) } catch {} }

const THEME_COLORS = {
  '반도체·AI':'#2563eb','방산':'#dc2626','조선':'#0d9488',
  '원전·전력':'#d97706','2차전지':'#16a34a','바이오':'#7c3aed','밸류업·금융':'#ea580c','기타':'#64748b',
}

export default function PortfolioPage() {
  const [items, setItems]   = useState(() => load())
  const [form, setForm]     = useState({ name:'', code:'', qty:'', avgPrice:'', theme:'기타' })
  const [addMode, setAdd]   = useState(false)

  useEffect(() => save(items), [items])

  const addItem = () => {
    if (!form.name || !form.code || !form.qty || !form.avgPrice) return
    setItems(p => [{ ...form, qty: Number(form.qty), avgPrice: Number(form.avgPrice), id: Date.now() }, ...p])
    setForm({ name:'', code:'', qty:'', avgPrice:'', theme:'기타' })
    setAdd(false)
  }
  const remove = (id) => setItems(p => p.filter(i => i.id !== id))

  const totalInvest = items.reduce((s, i) => s + i.qty * i.avgPrice, 0)

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">포트폴리오</h1>
          <p className="page-sub">보유종목 · 평가손익 · 비중 관리</p>
        </div>
        <button className="btn-ai" onClick={() => setAdd(v => !v)}>
          {addMode ? '✕ 닫기' : '+ 종목 추가'}
        </button>
      </div>
      <div className="page-body">

        {/* 추가 폼 */}
        {addMode && (
          <div className="card-section">
            <span className="section-title">종목 추가</span>
            <div className="add-form">
              <input className="add-input" placeholder="종목명" value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} />
              <input className="add-input mono" placeholder="종목코드" value={form.code} onChange={e => setForm(p=>({...p,code:e.target.value}))} />
              <input className="add-input" type="number" placeholder="보유수량" value={form.qty} onChange={e => setForm(p=>({...p,qty:e.target.value}))} />
              <input className="add-input" type="number" placeholder="평균단가 (원)" value={form.avgPrice} onChange={e => setForm(p=>({...p,avgPrice:e.target.value}))} />
              <select className="add-select" value={form.theme} onChange={e => setForm(p=>({...p,theme:e.target.value}))}>
                {Object.keys(THEME_COLORS).map(t=><option key={t}>{t}</option>)}
              </select>
              <button className="btn-ai" onClick={addItem}>추가</button>
            </div>
          </div>
        )}

        {/* 요약 카드 */}
        {items.length > 0 && (
          <div className="card-grid--fixed-3" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:'12px' }}>
            <div className="card-section pf-summary-card">
              <div className="pf-summary-label">총 투자금액</div>
              <div className="pf-summary-value">{totalInvest.toLocaleString()}원</div>
            </div>
            <div className="card-section pf-summary-card">
              <div className="pf-summary-label">보유 종목 수</div>
              <div className="pf-summary-value">{items.length}종목</div>
            </div>
            <div className="card-section pf-summary-card">
              <div className="pf-summary-label">실시간 평가손익</div>
              <div className="pf-summary-value pf-pending">키움 API 연동 후</div>
            </div>
          </div>
        )}

        {/* 종목 리스트 */}
        {items.length === 0 ? (
          <div className="card-section pf-empty">
            <div className="empty-icon">💼</div>
            <p>보유 종목을 추가해보세요</p>
            <p className="sub-text">키움 REST API 연동 후 실시간 평가손익이 자동 계산됩니다</p>
          </div>
        ) : (
          <div className="card-grid">
            {items.map(s => {
              const invest = s.qty * s.avgPrice
              const weight = totalInvest > 0 ? (invest / totalInvest * 100).toFixed(1) : 0
              const color = THEME_COLORS[s.theme] || '#64748b'
              return (
                <div key={s.id} className="pf-card" style={{ '--sc': color }}>
                  <div className="pf-card-top">
                    <span className="pf-theme-badge" style={{ background: color+'18', color }}>{s.theme}</span>
                    <button className="pf-remove" onClick={() => remove(s.id)}>✕</button>
                  </div>
                  <div className="pf-name">{s.name}</div>
                  <div className="pf-code">{s.code}</div>
                  <div className="pf-divider" />
                  <div className="pf-row"><span>보유수량</span><span className="pf-val">{s.qty.toLocaleString()}주</span></div>
                  <div className="pf-row"><span>평균단가</span><span className="pf-val">{s.avgPrice.toLocaleString()}원</span></div>
                  <div className="pf-row"><span>투자금액</span><span className="pf-val">{invest.toLocaleString()}원</span></div>
                  <div className="pf-row"><span>비중</span><span className="pf-val pf-weight">{weight}%</span></div>
                  <div className="pf-weight-bar"><div className="pf-weight-fill" style={{ width: weight+'%', background: color }} /></div>
                  <div className="pf-pending-row">📡 실시간 손익 — API 연동 후</div>
                  <div className="pf-actions">
                    <button className="pf-action" onClick={() => window.open(`https://finance.naver.com/item/main.naver?code=${s.code}`,'_blank')}>정보 →</button>
                    <button className="pf-action" onClick={() => window.open(`https://finance.naver.com/item/fchart.naver?code=${s.code}`,'_blank')}>차트 →</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="info-note"><span>💡</span><span>키움 REST API 연동 후 실시간 현재가·평가손익·수익률이 자동 표시됩니다</span></div>
      </div>
    </div>
  )
}
