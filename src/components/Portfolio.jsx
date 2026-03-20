import { useState } from 'react'
import './Portfolio.css'

const SAMPLE_STOCKS = [
  { name: '삼성전자',   code: '005930', qty: 10, avgPrice: 58000, currentPrice: 62400, theme: '반도체·AI',  color: 'var(--theme-semi)'    },
  { name: 'SK하이닉스', code: '000660', qty: 5,  avgPrice: 180000,currentPrice: 195000,theme: '반도체·AI',  color: 'var(--theme-semi)'    },
  { name: '한화에어로스페이스',code:'012450',qty:3,avgPrice:320000,currentPrice:380000,theme:'방산',         color:'var(--theme-defense)'  },
  { name: 'HD현대중공업',code:'329180', qty: 8,  avgPrice: 145000,currentPrice: 138000,theme: '조선',        color: 'var(--theme-ship)'    },
  { name: 'KB금융',     code: '105560', qty: 15, avgPrice: 72000, currentPrice: 78500, theme: '밸류업·금융', color: 'var(--theme-value)'   },
]

export default function Portfolio() {
  const [stocks, setStocks] = useState(SAMPLE_STOCKS)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', qty: '', avgPrice: '', theme: '반도체·AI' })

  const totalInvest  = stocks.reduce((s, st) => s + st.qty * st.avgPrice, 0)
  const totalCurrent = stocks.reduce((s, st) => s + st.qty * st.currentPrice, 0)
  const totalPnl     = totalCurrent - totalInvest
  const totalPnlPct  = totalInvest > 0 ? ((totalPnl / totalInvest) * 100).toFixed(2) : '0.00'
  const isUp         = totalPnl >= 0

  const handleAdd = () => {
    if (!form.name || !form.qty || !form.avgPrice) return
    setStocks([...stocks, {
      name: form.name,
      code: form.code,
      qty: parseInt(form.qty),
      avgPrice: parseInt(form.avgPrice),
      currentPrice: parseInt(form.avgPrice),
      theme: form.theme,
      color: 'var(--accent-blue)',
    }])
    setForm({ name: '', code: '', qty: '', avgPrice: '', theme: '반도체·AI' })
    setShowAddForm(false)
  }

  const handleDelete = (code) => setStocks(stocks.filter(s => s.code !== code))

  return (
    <div className="portfolio">

      {/* 요약 카드 */}
      <div className="port-summary">
        <div className="sum-card">
          <span className="sum-label">총 투자금액</span>
          <span className="sum-value mono">{totalInvest.toLocaleString()}원</span>
        </div>
        <div className="sum-card">
          <span className="sum-label">평가금액</span>
          <span className="sum-value mono">{totalCurrent.toLocaleString()}원</span>
        </div>
        <div className="sum-card">
          <span className="sum-label">평가손익</span>
          <span className={`sum-value mono ${isUp ? 'up' : 'down'}`}>
            {isUp ? '+' : ''}{totalPnl.toLocaleString()}원
          </span>
        </div>
        <div className="sum-card">
          <span className="sum-label">수익률</span>
          <span className={`sum-value mono ${isUp ? 'up' : 'down'}`}>
            {isUp ? '+' : ''}{totalPnlPct}%
          </span>
        </div>
      </div>

      {/* 종목 헤더 */}
      <div className="port-header">
        <h3 className="port-title">보유 종목</h3>
        <button className="add-btn" onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? '✕ 취소' : '+ 종목 추가'}
        </button>
      </div>

      {/* 추가 폼 */}
      {showAddForm && (
        <div className="add-form">
          <input placeholder="종목명" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          <input placeholder="종목코드 (예: 005930)" value={form.code} onChange={e => setForm({...form, code: e.target.value})} />
          <input placeholder="보유수량" type="number" value={form.qty} onChange={e => setForm({...form, qty: e.target.value})} />
          <input placeholder="평균단가" type="number" value={form.avgPrice} onChange={e => setForm({...form, avgPrice: e.target.value})} />
          <select value={form.theme} onChange={e => setForm({...form, theme: e.target.value})}>
            {['반도체·AI','방산','조선','원전·전력','2차전지','바이오','밸류업·금융'].map(t => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <button className="submit-btn" onClick={handleAdd}>추가</button>
        </div>
      )}

      {/* 종목 테이블 */}
      <div className="port-table-wrap">
        <table className="port-table">
          <thead>
            <tr>
              <th>종목명</th>
              <th>테마</th>
              <th>보유수량</th>
              <th>평균단가</th>
              <th>현재가</th>
              <th>평가손익</th>
              <th>수익률</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stocks.map(s => {
              const pnl    = (s.currentPrice - s.avgPrice) * s.qty
              const pnlPct = (((s.currentPrice - s.avgPrice) / s.avgPrice) * 100).toFixed(2)
              const up     = pnl >= 0
              return (
                <tr key={s.code}>
                  <td>
                    <a href={`https://finance.naver.com/item/main.naver?code=${s.code}`} target="_blank" rel="noreferrer" className="stock-link">
                      <strong>{s.name}</strong>
                      <span className="dim mono" style={{ fontSize: 11 }}>{s.code}</span>
                    </a>
                  </td>
                  <td><span className="theme-badge" style={{ color: s.color, borderColor: s.color + '44', background: s.color + '11' }}>{s.theme}</span></td>
                  <td className="mono">{s.qty.toLocaleString()}주</td>
                  <td className="mono">{s.avgPrice.toLocaleString()}</td>
                  <td className="mono">{s.currentPrice.toLocaleString()}</td>
                  <td className={`mono ${up ? 'up' : 'down'}`}>{up?'+':''}{pnl.toLocaleString()}</td>
                  <td className={`mono ${up ? 'up' : 'down'}`}>{up?'+':''}{pnlPct}%</td>
                  <td><button className="del-btn" onClick={() => handleDelete(s.code)}>✕</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="port-note dim">※ 현재가는 키움 REST API 연동 후 실시간으로 자동 업데이트돼요. 지금은 샘플 데이터예요.</p>
    </div>
  )
}
