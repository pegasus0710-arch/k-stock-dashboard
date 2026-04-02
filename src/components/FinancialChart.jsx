// src/components/FinancialChart.jsx
// 재무제표 팝업 — 네이버 모바일 API (연간/분기)
// 매출/영업이익/순이익 SVG 막대차트 + 수치 테이블

import { useState, useEffect } from 'react'

const METRICS = [
  { key: 'revenue',       label: '매출액',   color: '#3b82f6' },
  { key: 'operatingIncome', label: '영업이익', color: '#10b981' },
  { key: 'netIncome',     label: '순이익',   color: '#8b5cf6' },
]

function fmt(v) {
  if (v == null || v === '') return '-'
  const n = Number(String(v).replace(/,/g, ''))
  if (isNaN(n)) return '-'
  if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(1) + '조'
  if (Math.abs(n) >= 100000)   return (n / 100000).toFixed(0) + '억'
  if (Math.abs(n) >= 1000)     return (n / 1000).toFixed(0) + '천'
  return n.toLocaleString()
}

function pct(v) {
  if (v == null || v === '') return '-'
  const n = Number(String(v).replace(/,/g, ''))
  if (isNaN(n)) return '-'
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%'
}

function parseRows(data) {
  // 네이버 모바일 finance API 응답 파싱
  // 응답 구조: { financeInfo: { rowList: [ { ... } ] } } 또는 다른 구조
  try {
    const fi = data?.financeInfo || data
    const rows = fi?.rowList || fi?.list || fi?.data || []
    return rows.map(r => ({
      label:          r.label         || r.dt     || r.year || '',
      revenue:        r.revenue       || r.sales  || r.totalRevenue || null,
      operatingIncome:r.operatingIncome || r.bsop_prfi || r.operatingProfit || null,
      netIncome:      r.netIncome     || r.thtr_ntin || r.netProfit || null,
      opm:            r.operatingMargin || r.bsop_prfi_rt || null,
      npm:            r.netMargin     || r.thtr_ntin_rt || null,
      eps:            r.eps           || null,
      roe:            r.roe           || null,
    }))
  } catch { return [] }
}

// SVG 막대 차트
function BarChart({ rows, metric }) {
  if (!rows.length) return null
  const W = 480, H = 140, PAD = { l: 44, r: 12, t: 12, b: 28 }
  const cW = W - PAD.l - PAD.r
  const cH = H - PAD.t - PAD.b
  const n = rows.length
  const bW = Math.max(12, Math.floor(cW / n * 0.55))
  const vals = rows.map(r => Number(String(r[metric.key] || 0).replace(/,/g, ''))).filter(isFinite)
  if (!vals.length) return null
  const maxV = Math.max(...vals.map(Math.abs), 1)
  const minV = Math.min(...vals, 0)
  const range = maxV - minV
  const mid = minV < 0 ? PAD.t + (maxV / range) * cH : PAD.t + cH
  const toY = v => {
    const n = Number(String(v || 0).replace(/,/g, ''))
    return n >= 0 ? mid - (n / range) * cH : mid
  }
  const toH = v => {
    const n = Math.abs(Number(String(v || 0).replace(/,/g, '')))
    return Math.max(1, (n / range) * cH)
  }
  const px = i => PAD.l + (i + 0.5) * (cW / n)

  // Y축 레이블 (3단계)
  const yLabels = [maxV, maxV / 2, 0].filter((v, i, a) => a.indexOf(v) === i)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* 기준선 */}
      <line x1={PAD.l} y1={mid} x2={W - PAD.r} y2={mid}
        stroke="rgba(0,0,0,0.15)" strokeWidth="0.8" />
      {/* 그리드 */}
      {yLabels.map((v, i) => (
        <g key={i}>
          <line x1={PAD.l} y1={toY(v)} x2={W - PAD.r} y2={toY(v)}
            stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" />
          <text x={PAD.l - 3} y={toY(v) + 3} fontSize="8" fill="#94a3b8" textAnchor="end">
            {fmt(v)}
          </text>
        </g>
      ))}
      {/* 막대 */}
      {rows.map((r, i) => {
        const v = Number(String(r[metric.key] || 0).replace(/,/g, ''))
        const x = px(i)
        const isPos = v >= 0
        return (
          <g key={i}>
            <rect
              x={x - bW / 2} y={toY(r[metric.key])}
              width={bW} height={toH(r[metric.key])}
              fill={isPos ? metric.color : '#ef4444'} opacity="0.85"
              rx="2"
            />
            <text x={x} y={isPos ? toY(r[metric.key]) - 2 : mid + toH(r[metric.key]) + 9}
              fontSize="8" fill={isPos ? metric.color : '#ef4444'} textAnchor="middle" fontWeight="700">
              {fmt(r[metric.key])}
            </text>
          </g>
        )
      })}
      {/* X축 레이블 */}
      {rows.map((r, i) => (
        <text key={i} x={px(i)} y={H - 4}
          fontSize="9" fill="#64748b" textAnchor="middle">
          {String(r.label || '').slice(0, 7)}
        </text>
      ))}
    </svg>
  )
}

export default function FinancialChart({ stock, onClose }) {
  const [period,  setPeriod]  = useState('annual')   // annual | quarter
  const [metric,  setMetric]  = useState(METRICS[0])
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (!stock?.code) return
    setLoading(true); setError(''); setRows([])
    fetch(`/api/kiwoom?type=finance&code=${stock.code}&period=${period}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        const parsed = parseRows(data)
        setRows(parsed)
        if (!parsed.length) setError('데이터를 불러올 수 없습니다')
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [stock?.code, period])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: 560, maxHeight: '85vh', borderRadius: 12,
        background: 'var(--bg-panel)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>📈 {stock.name}</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 8 }}>{stock.code} 재무제표</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* 연간/분기 탭 */}
            {['annual', 'quarter'].map(p => (
              <button key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: period === p ? 'var(--accent-mid)' : 'var(--bg-base)',
                  color:      period === p ? 'white' : 'var(--text-dim)',
                  border:     period === p ? 'none' : '1px solid var(--border)',
                }}>
                {p === 'annual' ? '연간' : '분기'}
              </button>
            ))}
            <button onClick={onClose}
              style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-dim)' }}>
              ✕
            </button>
          </div>
        </div>

        {/* 지표 탭 */}
        <div style={{ display: 'flex', gap: 0, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
          {METRICS.map(m => (
            <button key={m.key}
              onClick={() => setMetric(m)}
              style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginRight: 6,
                background: metric.key === m.key ? m.color + '18' : 'var(--bg-base)',
                color:      metric.key === m.key ? m.color : 'var(--text-dim)',
                border:     metric.key === m.key ? `1.5px solid ${m.color}` : '1px solid var(--border)',
              }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* 컨텐츠 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>
              ⟳ 재무 데이터 로딩 중...
            </div>
          )}
          {error && !loading && (
            <div style={{ textAlign: 'center', padding: 32, color: '#dc2626' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
              <div style={{ fontSize: 13 }}>{error}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                네이버 금융에서 해당 종목의 재무 데이터를 찾을 수 없습니다.
              </div>
            </div>
          )}
          {!loading && !error && rows.length > 0 && (
            <>
              {/* SVG 차트 */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: metric.color, marginBottom: 4 }}>
                  {metric.label} 추이 (단위: 억원)
                </div>
                <BarChart rows={rows} metric={metric} />
              </div>

              {/* 수치 테이블 */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-base)' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {period === 'annual' ? '연도' : '분기'}
                      </th>
                      {rows.map((r, i) => (
                        <th key={i} style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                          {String(r.label || '').slice(0, 7)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: '매출액',   key: 'revenue',        fmt: fmt },
                      { label: '영업이익', key: 'operatingIncome', fmt: fmt },
                      { label: '순이익',   key: 'netIncome',       fmt: fmt },
                      { label: '영업이익률', key: 'opm',            fmt: pct },
                      { label: '순이익률',  key: 'npm',            fmt: pct },
                      { label: 'EPS',      key: 'eps',             fmt: fmt },
                      { label: 'ROE',      key: 'roe',             fmt: pct },
                    ].map(({ label, key, fmt: f }) => (
                      <tr key={key} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                        <td style={{ padding: '5px 8px', color: 'var(--text-dim)', fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</td>
                        {rows.map((r, i) => {
                          const v = r[key]
                          const n = Number(String(v || '0').replace(/,/g, ''))
                          const isNeg = isFinite(n) && n < 0
                          return (
                            <td key={i} style={{
                              padding: '5px 8px', textAlign: 'right', fontWeight: 700,
                              color: isNeg ? '#ef4444' : 'var(--text-primary)',
                            }}>
                              {f(v)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 10, textAlign: 'right' }}>
                출처: 네이버 금융 · 단위: 억원
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
