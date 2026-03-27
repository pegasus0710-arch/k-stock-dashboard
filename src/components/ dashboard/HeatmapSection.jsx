// src/components/dashboard/HeatmapSection.jsx
import { useState, useEffect, useCallback } from 'react'
import { ALL_THEMES } from '../../constants/themes'
import { rateColor } from '../../utils/format'

const LS_HEATMAP = 'db_heatmap_v1'

function heatColor(rate) {
  if (rate == null) return { bg:'#F1F5F9', text:'#64748B' }
  if (rate >=  3)   return { bg:'#7F1D1D', text:'#FEE2E2' }
  if (rate >=  1.5) return { bg:'#DC2626', text:'#FEF2F2' }
  if (rate >=  0.3) return { bg:'#EF4444', text:'#FFFFFF' }
  if (rate >= -0.3) return { bg:'#F8FAFC', text:'#475569' }
  if (rate >= -1.5) return { bg:'#2563EB', text:'#DBEAFE' }
  if (rate >= -3)   return { bg:'#1D4ED8', text:'#EFF6FF' }
  return             { bg:'#1E3A8A', text:'#BFDBFE' }
}

function SectorPopup({ theme, prices, onClose }) {
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const StockRow = ({ item, isEtf }) => {
    const p    = prices?.[item.code]
    const rate = p?.changeRate
    const up   = rate > 0
    const pc   = rate != null ? rateColor(rate) : '#94A3B8'
    return (
      <div className="db-sector-stock-row">
        <div className="db-sector-stock-info">
          <span className="db-sector-stock-name">{item.name}</span>
          {isEtf
            ? <span className="db-sector-stock-code">{item.code}</span>
            : <span className="db-sector-stock-desc">{item.desc}</span>}
        </div>
        {p?.price != null ? (
          <div className="db-sector-stock-price">
            <span className="db-sector-stock-val">{p.price.toLocaleString()}원</span>
            <span className="db-sector-stock-rate" style={{color:pc}}>
              {rate!=null ? `${up?'▲':'▼'}${Math.abs(rate).toFixed(2)}%` : '—'}
            </span>
          </div>
        ) : <span className="db-sector-stock-na">—</span>}
      </div>
    )
  }

  return (
    <div className="chart-modal-overlay" onClick={onClose}>
      <div className="db-sector-popup" onClick={e=>e.stopPropagation()}>
        <div className="db-sector-popup-header">
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <span style={{fontSize:20}}>{theme.emoji}</span>
            <div>
              <div className="db-sector-popup-title">{theme.label}</div>
              <div className="db-sector-popup-desc">{theme.desc}</div>
            </div>
          </div>
          <button className="chart-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="db-sector-popup-keywords">
          {theme.keywords.map(k=>(<span key={k} className="db-sector-kw">{k}</span>))}
        </div>
        {theme.etf?.length > 0 && (
          <div className="db-sector-popup-section">
            <div className="db-sector-popup-section-label">📦 대표 ETF</div>
            <div className="db-sector-stock-list">
              {theme.etf.map(e=><StockRow key={e.code} item={e} isEtf/>)}
            </div>
          </div>
        )}
        <div className="db-sector-popup-section">
          <div className="db-sector-popup-section-label">📊 구성 종목</div>
          <div className="db-sector-stock-list">
            {theme.stocks.map(s=><StockRow key={s.code} item={s}/>)}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HeatmapSection() {
  const [prices,     setPrices]     = useState(() => {
    try { const r=localStorage.getItem(LS_HEATMAP); if(!r) return {}
          const {data,ts}=JSON.parse(r); return Date.now()-ts<300000?data:{} } catch { return {} }
  })
  const [loading,    setLoading]    = useState(false)
  const [popupTheme, setPopupTheme] = useState(null)

  const allCodes = ALL_THEMES.flatMap(t=>[...t.etf.map(e=>e.code), ...t.stocks.map(s=>s.code)])

  const fetchPrices = useCallback(async () => {
    setLoading(true)
    try {
      const chunks = []
      for (let i=0; i<allCodes.length; i+=20) chunks.push(allCodes.slice(i,i+20))
      const results = {}
      await Promise.all(chunks.map(async chunk => {
        try {
          const data = await fetch(`/api/kiwoom?type=prices&codes=${chunk.join(',')}`).then(r=>r.json())
          if (data && typeof data==='object') Object.assign(results, data)
        } catch {}
      }))
      setPrices(results)
      localStorage.setItem(LS_HEATMAP, JSON.stringify({data:results, ts:Date.now()}))
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(()=>{ fetchPrices() }, [fetchPrices])

  const getThemeRate = theme => {
    const rates = theme.stocks.map(s=>prices?.[s.code]?.changeRate).filter(r=>r!=null)
    if (!rates.length) return null
    return rates.reduce((a,b)=>a+b,0) / rates.length
  }

  return (
    <div className="db-heatmap-section">
      <div className="db-section-header">
        <span className="db-section-label">🏷️ 업종·테마 히트맵</span>
        <button className="btn-outline" style={{fontSize:10,padding:'3px 8px'}}
          onClick={fetchPrices} disabled={loading}>
          {loading ? '로딩...' : '⟳ 새로고침'}
        </button>
      </div>
      <div className="db-heatmap-grid">
        {ALL_THEMES.map(theme => {
          const rate = getThemeRate(theme)
          const { bg, text } = heatColor(rate)
          return (
            <button key={theme.id} className="db-heatmap-cell"
              style={{background:bg, color:text}}
              onClick={()=>setPopupTheme(theme)}>
              <span className="db-heatmap-emoji">{theme.emoji}</span>
              <span className="db-heatmap-name">{theme.label}</span>
              <span className="db-heatmap-rate">
                {rate!=null ? `${rate>=0?'▲':'▼'}${Math.abs(rate).toFixed(2)}%` : '—'}
              </span>
            </button>
          )
        })}
      </div>
      <div style={{fontSize:10, color:'var(--text-dim)', marginTop:8}}>
        * 구성 종목 평균 등락률 기준 · 클릭 시 종목 상세
      </div>
      {popupTheme && <SectorPopup theme={popupTheme} prices={prices} onClose={()=>setPopupTheme(null)}/>}
    </div>
  )
}
