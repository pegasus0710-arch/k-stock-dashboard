// src/components/dashboard/GuideModal.jsx
import { useState, useEffect } from 'react'
import { GUIDE_DATA } from '../../constants/dashboardData'

const GUIDE_CATS = [
  {id:'domestic',  label:'🇰🇷 국내',     ids:['KOSPI','KOSDAQ']},
  {id:'global',    label:'🌍 해외',       ids:['SP500','NASDAQ','DOW','N225','HSI','SSE','TWI','DAX']},
  {id:'bond',      label:'📈 채권',       ids:['US10Y','US2Y','KR10Y']},
  {id:'cbrate',    label:'🏦 기준금리',   ids:['CB_US','CB_KR','CB_JP','CB_CN','CB_EU']},
  {id:'commodity', label:'🛢️ 원자재',    ids:['WTI','BRENT','GOLD','SILVER','COPPER']},
  {id:'sentiment', label:'⚡ 심리·달러', ids:['VIX','DXY']},
  {id:'forex',     label:'💱 환율',       ids:['FX_USD','FX_JPY','FX_CNY','FX_EUR']},
]

export default function GuideModal({ onClose }) {
  const [cat, setCat] = useState('domestic')
  useEffect(()=>{
    const fn=e=>{if(e.key==='Escape')onClose()}
    window.addEventListener('keydown',fn); return()=>window.removeEventListener('keydown',fn)
  },[onClose])
  const ids = GUIDE_CATS.find(c=>c.id===cat)?.ids||[]
  return (
    <div className="chart-modal-overlay" onClick={onClose}>
      <div className="db-guide-modal" onClick={e=>e.stopPropagation()}>
        <div className="db-guide-header">
          <span className="db-guide-title">📖 지수 가이드</span>
          <button className="chart-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="db-guide-cats">
          {GUIDE_CATS.map(c=>(
            <button key={c.id} className={`db-guide-cat-btn ${cat===c.id?'active':''}`} onClick={()=>setCat(c.id)}>{c.label}</button>
          ))}
        </div>
        <div className="db-guide-list">
          {ids.map(id=>{
            const g=GUIDE_DATA[id]; if(!g) return null
            return (
              <div key={id} className="db-guide-item">
                <div className="db-guide-item-title">{g.title}</div>
                <div className="db-guide-item-desc">{g.desc}</div>
                <div className="db-guide-row up">📈 상승 시: {g.up}</div>
                <div className="db-guide-row down">📉 하락 시: {g.down}</div>
                <div className="db-guide-tip">{g.tip}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
