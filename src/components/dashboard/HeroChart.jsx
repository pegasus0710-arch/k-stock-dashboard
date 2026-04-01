// src/components/dashboard/HeroChart.jsx
import { useState, useEffect, useCallback } from 'react'
import { rateColor } from '../../utils/format'
import CandleSvg from '../ui/CandleSvg'
import ChartPanel from '../ui/ChartPanel'
import { SECTOR_GROUPS, ALL_ITEMS } from '../../constants/dashboardData'

// 국내지수 심볼 → 키움 업종코드
const KIWOOM_IDS = { 'KOSPI': '001', 'KOSDAQ': '101' }

function getItemData(item, dashData, globalData, forexData, cbRates) {
  if (item.type==='global') return globalData?.[item.sym] || null
  if (item.type==='forex')  {
    const d = forexData?.[item.pair]
    return d ? { price:d.price, changeRate:d.changeRate, change:d.change, marketState:'CURRENCY' } : null
  }
  if (item.type==='cb') {
    const d = cbRates?.[item.cbKey]
    return d ? { price:d.rate, changeRate:null, isCB:true, date:d.date } : null
  }
  return null
}

function getMarketBadge(item, data) {
  if (!data) return null
  if (item.type==='cb')    return { label:'정책금리', color:'#0891b2' }
  if (item.type==='forex') return null
  const ms = data.marketState || data.status
  if (ms==='open'||ms==='REGULAR') return { label:'LIVE',  color:'#22c55e' }
  if (ms==='POST'||ms==='after')   return { label:'시간외', color:'#a78bfa' }
  if (ms==='PRE')                   return { label:'프리',  color:'#f59e0b' }
  return { label:'전일', color:'#64748b' }
}

function HeroChart({ selId, onSelChange, dashData, globalData, forexData, onWeekRange, onSparkData }) {
  const [range,     setRange]     = useState('6mo')
  const [chartType, setChartType] = useState('line') // 'line' | 'candle'
  const [candles,   setCandles]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const PERIODS = [{v:'1mo',l:'1M'},{v:'3mo',l:'3M'},{v:'6mo',l:'6M'},{v:'1y',l:'1Y'}]

  const item   = ALL_ITEMS.find(x=>x.id===selId)
  const group  = SECTOR_GROUPS.find(g=>g.items.some(x=>x.id===selId))
  const accent = item?.color || group?.accent || '#2563eb'

  // ── range → 키움 period 매핑 ────────────────────
  const toKiwoomPeriod = rng => rng==='1y' ? 'week' : 'day'
  const toKiwoomSlice  = rng => ({ '1mo':22, '3mo':65, '6mo':130, '1y':52 }[rng] || 130)

  const fetchChart = useCallback(async (id, rng, isSparkLoad=false) => {
    const it = ALL_ITEMS.find(x=>x.id===id)
    if (!it || it.type==='cb') return
    if (!isSparkLoad) setLoading(true)
    try {
      let raw = []
      const inds = KIWOOM_IDS[id]
      if (inds) {
        // 국내지수 → 키움 index-chart (실시간, 당일 반영)
        // ka20006/ka20007 응답값은 소수점 제거 후 100배 → /100 필요
        const period = toKiwoomPeriod(rng)
        const j = await fetch(`/api/kiwoom?type=index-chart&inds_cd=${inds}&period=${period}`).then(r=>r.json())
        raw = (j.candles || []).slice(-toKiwoomSlice(rng)).map(c => ({
          date:  c.time || c.label || '',
          open:  (c.open  || 0) / 100,
          high:  (c.high  || 0) / 100,
          low:   (c.low   || 0) / 100,
          close: (c.close || 0) / 100,
        }))
      } else if (it.type==='global') {
        const j = await fetch(`/api/kis?type=global&symbol=${it.sym}&range=${rng}`).then(r=>r.json())
        raw = j.candles||[]
      } else if (it.type==='forex') {
        const j = await fetch(`/api/kis?type=forex-krw&range=${rng}`).then(r=>r.json())
        raw = j[it.pair]?.candles||[]
      }
      const valid = raw.filter(c=>(c.close||0)>0)
      if (!isSparkLoad) setCandles(valid)
      if (isSparkLoad && valid.length && onWeekRange) {
        const highs = valid.map(c=>c.high||c.close||0).filter(v=>v>0)
        const lows  = valid.map(c=>c.low||c.close||0).filter(v=>v>0)
        if (highs.length && lows.length) onWeekRange(it.id, Math.max(...highs), Math.min(...lows))
      }
      if (isSparkLoad && valid.length && onSparkData) {
        onSparkData(it.id, valid.map(c=>c.close))
      }
    } catch(e){ console.error(e) }
    finally{ if (!isSparkLoad) setLoading(false) }
  }, [])

  const loadDomesticSpark = useCallback(async () => {
    // 1차: /index/spark (ka20007 주봉 배치)
    try {
      const j = await fetch('/api/kiwoom?type=index-spark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then(r => r.json())

      let gotData = false
      for (const [id, payload] of Object.entries(j)) {
        // ka20007 응답은 100배 → /100 처리
        const raw = (payload?.candles || []).map(c => ({
          close: (c.close || 0) / 100,
          high:  (c.high  || 0) / 100,
          low:   (c.low   || 0) / 100,
        }))
        const candles = raw.filter(c => c.close > 0)
        if (!candles.length) continue
        gotData = true
        if (onSparkData) onSparkData(id, candles.map(c => c.close))
        if (onWeekRange) {
          const highs = candles.map(c => c.high || c.close).filter(v => v > 0)
          const lows  = candles.map(c => c.low  || c.close).filter(v => v > 0)
          if (highs.length && lows.length) onWeekRange(id, Math.max(...highs), Math.min(...lows))
        }
      }
      if (gotData) return
    } catch(e) {
      console.warn('[HeroChart] index-spark 실패:', e)
    }

    // 2차 폴백: index-chart 주봉 직접 호출
    const fallback = async (id, inds_cd) => {
      try {
        const j = await fetch(`/api/kiwoom?type=index-chart&inds_cd=${inds_cd}&period=week`).then(r=>r.json())
        // ka20007 응답은 100배 → /100 처리
        const candles = (j.candles||[])
          .map(c => ({ close:(c.close||0)/100, high:(c.high||0)/100, low:(c.low||0)/100 }))
          .filter(c => c.close > 0)
        if (!candles.length) return
        if (onSparkData) onSparkData(id, candles.map(c=>c.close))
        if (onWeekRange) {
          const highs = candles.map(c=>c.high||c.close).filter(v=>v>0)
          const lows  = candles.map(c=>c.low||c.close).filter(v=>v>0)
          if (highs.length&&lows.length) onWeekRange(id, Math.max(...highs), Math.min(...lows))
        }
      } catch(e2) { console.warn(`[HeroChart] ${id} fallback 실패:`, e2) }
    }
    await Promise.all([fallback('KOSPI','001'), fallback('KOSDAQ','101')])
  }, [onSparkData, onWeekRange])

  useEffect(()=>{ fetchChart(selId, range) },[selId, range])

  useEffect(()=>{
    loadDomesticSpark()
    fetchChart('SP500',  '1y', true)
    fetchChart('NASDAQ', '1y', true)
    fetchChart('DOW',    '1y', true)
    fetchChart('N225',   '1y', true)
    fetchChart('WTI',    '1y', true)
    fetchChart('GOLD',   '1y', true)
    fetchChart('BRENT',  '1y', true)
    fetchChart('SILVER', '1y', true)
    fetchChart('COPPER', '1y', true)
  }, [])

  const getCur = () => {
    if (!item) return null
    if (item.type==='global') return globalData?.[item.sym]||null
    if (item.type==='forex')  {
      const d=forexData?.[item.pair]; return d?{price:d.price,changeRate:d.changeRate,change:d.change}:null
    }
    return null
  }
  const cur = getCur()
  const pc  = cur ? rateColor(cur.changeRate) : '#94a3b8'


  if (item?.type==='cb') {
    return (
      <div className="db-hero-section">
        <div className="db-hero-top-row">
          <div className="db-hero-info">
            <span className="db-hero-sym-label" style={{color:accent}}>{item.label}</span>
            <span className="db-hero-price" style={{color:'var(--text-dim)'}}>차트 없음</span>
            <span style={{fontSize:12,color:'var(--text-secondary)'}}>기준금리는 정책 결정값으로 차트 미제공</span>
          </div>
        </div>
        <div className="db-hero-chart db-hero-empty">📌 기준금리는 정책 결정 시 업데이트됩니다</div>
      </div>
    )
  }

  return (
    <div className="db-hero-section">
      <div className="db-hero-top-row">
        <div className="db-hero-info">
          <span className="db-hero-sym-label" style={{color:accent}}>{item?.label}</span>
          {cur ? (
            <>
              <span className="db-hero-price">{cur.price?.toLocaleString(undefined,{maximumFractionDigits:2})}{item?.unit||''}</span>
              {cur.changeRate!=null && (
                <span className="db-hero-badge" style={{background:cur.changeRate>=0?'rgba(34,197,94,.12)':'rgba(239,68,68,.12)',color:pc}}>
                  {cur.changeRate>=0?'▲':'▼'}{Math.abs(cur.changeRate).toFixed(2)}%
                </span>
              )}
            </>
          ) : (
            <span className="db-hero-price" style={{color:'var(--text-dim)'}}>—</span>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {/* 차트 타입 토글 */}
          <div className="db-chart-type-tabs">
            <button className={`db-chart-type-btn ${chartType==='line'?'active':''}`}
              onClick={()=>setChartType('line')} title="선형 차트">📈 선형</button>
            <button className={`db-chart-type-btn ${chartType==='candle'?'active':''}`}
              onClick={()=>setChartType('candle')} title="캔들 차트">🕯 캔들</button>
          </div>
          {/* 기간 탭 */}
          <div className="db-hero-periods">
            {PERIODS.map(p=>(
              <button key={p.v} className={`db-period-btn ${range===p.v?'active':''}`}
                onClick={()=>setRange(p.v)}>{p.l}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="db-hero-chart">
        {loading
          ? <div className="db-hero-loading"><div className="db-hero-spinner"/></div>
          : <ChartPanel
              candles={candles}
              range={range}
              chartType={chartType}
              accent={accent}
              drawKey={`hero_${selId}`}
              showToolbar={chartType === 'candle'}
              forceHideMA={chartType === 'line'}
              W={820} H={210}
              PAD={{ top:14, right:72, bottom:28, left:8 }}
            />
        }
      </div>
    </div>
  )
}
export default HeroChart
