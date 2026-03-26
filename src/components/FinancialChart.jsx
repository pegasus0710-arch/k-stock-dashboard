// src/components/FinancialChart.jsx
// 재무제표 차트 — DART API 기반
// 매출액·영업이익·순이익·EPS·PER·PBR·배당성향·부채비율 등

import { useState, useEffect, useCallback } from 'react'
import './FinancialChart.css'

const DART_KEY = import.meta.env.VITE_DART_API_KEY

// ── 숫자 포맷 ─────────────────────────────────────────
function fmtBil(v) {  // 억원 → 조/억
  if (!v && v !== 0) return '-'
  const n = Number(v)
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1) + '조'
  return n.toLocaleString('ko-KR') + '억'
}
function fmtNum(v, digits = 1) {
  if (!v && v !== 0) return '-'
  return Number(v).toFixed(digits)
}

// ── SVG 막대+라인 서브차트 ───────────────────────────
function SubChart({ data, title, barKey, lineKey, lineKey2, barLabel, lineLabel, lineLabel2,
  barColor = '#3b82f6', lineColor = '#f59e0b', lineColor2 = '#ec4899',
  barUnit = '억원', lineUnit = '%', width = 700, height = 130 }) {

  const [tooltip, setTooltip] = useState(null)
  if (!data?.length) return (
    <div className="fc-subchart-empty">데이터 없음</div>
  )

  const PAD = { top: 18, right: 44, bottom: 22, left: 8 }
  const W   = width  - PAD.left - PAD.right
  const H   = height - PAD.top  - PAD.bottom
  const n   = data.length
  const bw  = Math.floor(W / n * 0.55)

  // 막대 스케일
  const barVals   = data.map(d => Number(d[barKey]  || 0))
  const maxBarAbs = Math.max(...barVals.map(Math.abs), 1)
  const barMin    = Math.min(...barVals, 0)
  const barMax    = Math.max(...barVals, 0)
  const barRange  = barMax - barMin || 1
  const zeroY     = PAD.top + H - ((0 - barMin) / barRange) * H

  const toBarY = v => PAD.top + H - ((v - barMin) / barRange) * H
  const bx     = i  => PAD.left + (i + 0.5) * (W / n)

  // 라인 스케일
  const lineVals  = data.map(d => Number(d[lineKey]  || 0)).filter(v => !isNaN(v))
  const lineVals2 = lineKey2 ? data.map(d => Number(d[lineKey2] || 0)).filter(v => !isNaN(v)) : []
  const allLine   = [...lineVals, ...lineVals2]
  const lMin = allLine.length ? Math.min(...allLine) * 1.1 : 0
  const lMax = allLine.length ? Math.max(...allLine) * 1.1 + 0.01 : 1
  const lRange = lMax - lMin || 1
  const toLY   = v  => PAD.top + H - ((v - lMin) / lRange) * H

  const pts1 = data.map((d, i) => {
    const v = Number(d[lineKey] || 0)
    return `${bx(i)},${toLY(v)}`
  }).join(' ')
  const pts2 = lineKey2 ? data.map((d, i) => {
    const v = Number(d[lineKey2] || 0)
    return `${bx(i)},${toLY(v)}`
  }).join(' ') : ''

  // Y 눈금 (오른쪽 - 라인 기준)
  const yTicks = Array.from({ length: 4 }, (_, i) => lMin + (lRange / 3) * i)

  return (
    <div className="fc-subchart-wrap" onMouseLeave={() => setTooltip(null)}>
      <div className="fc-subchart-title">{title}</div>
      <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          const mx   = (e.clientX - rect.left) * (width / rect.width)
          const idx  = Math.max(0, Math.min(n - 1, Math.round((mx - PAD.left) / (W / n) - 0.5)))
          setTooltip({ idx, x: bx(idx) })
        }}>

        {/* 0선 */}
        <line x1={PAD.left} x2={PAD.left + W} y1={zeroY} y2={zeroY}
          stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>

        {/* 막대 */}
        {data.map((d, i) => {
          const v    = Number(d[barKey] || 0)
          const bH   = Math.abs(toBarY(v) - zeroY)
          const barY = v >= 0 ? zeroY - bH : zeroY
          const col  = v >= 0 ? barColor : '#ef4444'
          return (
            <rect key={i}
              x={bx(i) - bw / 2} y={barY}
              width={bw} height={Math.max(1, bH)}
              fill={col} opacity={tooltip?.idx === i ? 1 : 0.75}/>
          )
        })}

        {/* 라인 1 */}
        {pts1 && (
          <polyline points={pts1} fill="none" stroke={lineColor} strokeWidth="1.8" opacity="0.9"/>
        )}
        {pts1 && data.map((d, i) => (
          <circle key={i} cx={bx(i)} cy={toLY(Number(d[lineKey] || 0))}
            r={tooltip?.idx === i ? 4 : 2.5} fill={lineColor}/>
        ))}

        {/* 라인 2 */}
        {pts2 && (
          <polyline points={pts2} fill="none" stroke={lineColor2} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.85"/>
        )}
        {pts2 && lineKey2 && data.map((d, i) => (
          <circle key={i} cx={bx(i)} cy={toLY(Number(d[lineKey2] || 0))}
            r={tooltip?.idx === i ? 4 : 2} fill={lineColor2}/>
        ))}

        {/* X 레이블 */}
        {data.map((d, i) => (
          <text key={i} x={bx(i)} y={PAD.top + H + 14}
            textAnchor="middle" fontSize="9" fill="#64748b">
            {d.year}{d.reprt === 'Q2' ? '.반' : d.reprt === 'Q1' ? '.1Q' : d.reprt === 'Q3' ? '.3Q' : ''}
          </text>
        ))}

        {/* Y 눈금 (오른쪽) */}
        {yTicks.map((v, i) => (
          <text key={i} x={PAD.left + W + 4} y={toLY(v) + 4}
            fontSize="9" fill="#64748b">{fmtNum(v, 0)}</text>
        ))}

        {/* 크로스헤어 */}
        {tooltip && (
          <line x1={tooltip.x} x2={tooltip.x} y1={PAD.top} y2={PAD.top + H}
            stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3,2"/>
        )}
      </svg>

      {/* 툴팁 */}
      {tooltip && data[tooltip.idx] && (() => {
        const d = data[tooltip.idx]
        return (
          <div className="fc-tooltip" style={{ left: `${(tooltip.x / width) * 100}%` }}>
            <div className="fc-tt-title">{d.year}{d.reprt === 'Q2' ? ' 반기' : ''}</div>
            {barKey  && <div className="fc-tt-row"><span>{barLabel}</span><b style={{ color: barColor }}>{fmtBil(d[barKey])}</b></div>}
            {lineKey && <div className="fc-tt-row"><span>{lineLabel}</span><b style={{ color: lineColor }}>{fmtNum(d[lineKey])}{lineUnit}</b></div>}
            {lineKey2 && d[lineKey2] != null && <div className="fc-tt-row"><span>{lineLabel2}</span><b style={{ color: lineColor2 }}>{fmtNum(d[lineKey2])}{lineUnit}</b></div>}
          </div>
        )
      })()}

      {/* 범례 */}
      <div className="fc-legend">
        <span style={{ color: barColor }}>■ {barLabel} ({barUnit})</span>
        {lineLabel  && <span style={{ color: lineColor  }}>— {lineLabel}{lineUnit && ` (${lineUnit})`}</span>}
        {lineLabel2 && <span style={{ color: lineColor2 }}>- {lineLabel2}{lineUnit && ` (${lineUnit})`}</span>}
      </div>
    </div>
  )
}

// ── 주가 미니차트 (캔들 최상단) ───────────────────────
function PriceSubChart({ data, width = 700, height = 90 }) {
  if (!data?.length) return null
  const PAD  = { top: 8, right: 44, bottom: 16, left: 8 }
  const W    = width - PAD.left - PAD.right
  const H    = height - PAD.top  - PAD.bottom
  const n    = data.length
  const prices = data.flatMap(d => [d.high || d.close, d.low || d.close]).filter(Boolean)
  if (!prices.length) return null
  const mn   = Math.min(...prices), mx = Math.max(...prices)
  const rng  = mx - mn || 1
  const py   = v => PAD.top + H - ((v - mn) / rng) * H
  const bx   = i => PAD.left + (i + 0.5) * (W / n)
  const bw   = Math.max(2, Math.floor(W / n * 0.6))

  return (
    <div className="fc-subchart-wrap">
      <div className="fc-subchart-title">주가</div>
      <svg width={width} height={height} style={{ display: 'block' }}>
        {data.map((d, i) => {
          const isUp  = d.close >= d.open
          const col   = isUp ? '#ef4444' : '#3b82f6'
          const cx    = bx(i)
          const bTop  = py(Math.max(d.open, d.close))
          const bH    = Math.max(1, py(Math.min(d.open, d.close)) - bTop)
          return (
            <g key={i}>
              {d.high && d.low && <line x1={cx} x2={cx} y1={py(d.high)} y2={py(d.low)} stroke={col} strokeWidth="1"/>}
              <rect x={cx - bw / 2} y={bTop} width={bw} height={bH} fill={col} opacity="0.85"/>
            </g>
          )
        })}
        {data.map((d, i) => (
          <text key={i} x={bx(i)} y={PAD.top + H + 12}
            textAnchor="middle" fontSize="9" fill="#64748b">
            {d.year}{d.reprt === 'Q2' ? '.반' : ''}
          </text>
        ))}
        {/* 현재가 라인 */}
        {data[n - 1] && (
          <text x={PAD.left + W + 4} y={py(data[n - 1].close) + 3}
            fontSize="9" fill="#94a3b8">{Math.round(data[n - 1].close / 1000)}K</text>
        )}
      </svg>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// FinancialChart 메인
// ══════════════════════════════════════════════════════
export default function FinancialChart({ stock, onClose }) {
  const [data,       setData]       = useState(null)   // 가공된 연도별 데이터
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [reportType, setReportType] = useState('annual') // annual | half
  const [years,      setYears]      = useState(5)         // 5 | 10 | all

  // ESC 닫기
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  // ── DART API 호출 ─────────────────────────────────
  const loadData = useCallback(async () => {
    if (!stock?.code || !DART_KEY) {
      setError(DART_KEY ? '종목 정보 없음' : 'DART API 키 미설정 (VITE_DART_API_KEY)')
      return
    }
    setLoading(true); setError('')

    try {
      // 1. 종목코드 → DART 기업코드 변환
      const corpRes = await fetch(
        `https://opendart.fss.or.kr/api/company.json?crtfc_key=${DART_KEY}&stock_code=${stock.code}`
      )
      const corpData = await corpRes.json()
      if (corpData.status !== '000' || !corpData.corp_code) {
        throw new Error(`기업코드 조회 실패: ${corpData.message || stock.code}`)
      }
      const corpCode = corpData.corp_code

      // 2. 최근 N년 재무데이터 수집
      const currentYear = new Date().getFullYear()
      const targetYears = Array.from({ length: years === 'all' ? 10 : years },
        (_, i) => currentYear - 1 - i)

      const reprtCode = reportType === 'half' ? '11012' : '11011'
      const fetches   = targetYears.map(yr =>
        fetch(`https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json` +
          `?crtfc_key=${DART_KEY}&corp_code=${corpCode}` +
          `&bsns_year=${yr}&reprt_code=${reprtCode}&fs_div=CFS`
        ).then(r => r.json()).catch(() => null)
      )

      const results = await Promise.allSettled(fetches)

      // 3. 데이터 파싱
      const parsed = results
        .map((r, i) => {
          if (r.status !== 'fulfilled' || r.value?.status !== '000') return null
          const items = r.value.list || []
          const year  = targetYears[i]

          const get = (acntNm, ...aliases) => {
            const item = items.find(it =>
              [acntNm, ...aliases].some(nm =>
                it.account_nm?.includes(nm) &&
                (it.sj_div === 'IS' || it.sj_div === 'CIS' || it.sj_div === 'BS')
              )
            )
            const val = item?.thstrm_amount?.replace(/,/g, '') || item?.thstrm_add_amount?.replace(/,/g, '')
            return val ? Math.round(Number(val) / 100000000) : null // 원 → 억원
          }

          const getBS = nm => {
            const item = items.find(it => it.account_nm?.includes(nm) && it.sj_div === 'BS')
            const val  = item?.thstrm_amount?.replace(/,/g, '')
            return val ? Math.round(Number(val) / 100000000) : null
          }

          const rev   = get('매출액', '수익(매출액)')
          const op    = get('영업이익')
          const ni    = get('당기순이익', '분기순이익')
          const asset = getBS('자산총계')
          const eq    = getBS('자본총계', '자기자본')
          const liab  = getBS('부채총계')

          if (!rev && !op && !ni) return null

          const opMargin = rev && op     ? (op / rev * 100)      : null
          const niMargin = rev && ni     ? (ni / rev * 100)      : null
          const debtRatio = eq && liab   ? (liab / eq * 100)     : null
          const equRatio  = asset && eq  ? (eq / asset * 100)    : null
          const roa       = asset && ni  ? (ni / asset * 100)    : null
          const roe       = eq && ni     ? (ni / eq * 100)       : null

          return {
            year,
            reprt: reportType === 'half' ? 'Q2' : 'A',
            rev, op, ni,
            opMargin, niMargin,
            debtRatio, equRatio,
            roa, roe,
            asset, eq, liab,
          }
        })
        .filter(Boolean)
        .reverse()   // 오래된 연도 → 최근 순

      if (!parsed.length) throw new Error('재무데이터 없음 (DART 미공시 종목일 수 있습니다)')
      setData(parsed)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [stock?.code, reportType, years])

  useEffect(() => { loadData() }, [loadData])

  // ── 최신 재무 요약 ──────────────────────────────────
  const latest = data?.[data.length - 1]
  const prev   = data?.[data.length - 2]

  const summaryItems = latest ? [
    { label: '매출액',    val: fmtBil(latest.rev),                 sub: prev?.rev ? `전년 ${fmtBil(prev.rev)}` : '',  color: '#3b82f6' },
    { label: '영업이익',  val: fmtBil(latest.op),                  sub: latest.opMargin ? `이익률 ${fmtNum(latest.opMargin)}%` : '', color: '#f59e0b' },
    { label: '순이익',    val: fmtBil(latest.ni),                  sub: latest.niMargin ? `이익률 ${fmtNum(latest.niMargin)}%` : '', color: '#10b981' },
    { label: '부채비율',  val: latest.debtRatio ? `${fmtNum(latest.debtRatio)}%` : '-', sub: '', color: latest.debtRatio > 200 ? '#ef4444' : '#94a3b8' },
    { label: '자기자본비율', val: latest.equRatio ? `${fmtNum(latest.equRatio)}%` : '-', sub: '', color: '#8b5cf6' },
    { label: 'ROE',      val: latest.roe  ? `${fmtNum(latest.roe)}%`  : '-',  sub: '', color: '#06b6d4' },
    { label: 'ROA',      val: latest.roa  ? `${fmtNum(latest.roa)}%`  : '-',  sub: '', color: '#ec4899' },
  ] : []

  return (
    <div className="fc-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="fc-modal">

        {/* ── 헤더 ── */}
        <div className="fc-header">
          <div className="fc-header-left">
            <span className="fc-title">📊 {stock?.name}</span>
            <span className="fc-code">{stock?.code}</span>
            <span className="fc-subtitle">재무제표 분석</span>
          </div>
          <div className="fc-header-ctrl">
            {/* 연간/반기 */}
            <div className="fc-tab-group">
              <button className={`fc-tab ${reportType === 'annual' ? 'active' : ''}`}
                onClick={() => setReportType('annual')}>연간</button>
              <button className={`fc-tab ${reportType === 'half' ? 'active' : ''}`}
                onClick={() => setReportType('half')}>반기</button>
            </div>
            {/* 기간 */}
            <div className="fc-tab-group">
              {[3, 5, 7, 10].map(y => (
                <button key={y} className={`fc-tab ${years === y ? 'active' : ''}`}
                  onClick={() => setYears(y)}>{y}년</button>
              ))}
            </div>
            <button className="fc-refresh-btn" onClick={loadData} disabled={loading} title="새로고침">
              {loading ? '⟳' : '↺'}
            </button>
            <button className="fc-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── 요약 카드 ── */}
        {latest && (
          <div className="fc-summary-bar">
            <span className="fc-summary-year">{latest.year}년 기준</span>
            {summaryItems.map(item => (
              <div key={item.label} className="fc-summary-item">
                <span className="fc-summary-label">{item.label}</span>
                <span className="fc-summary-val" style={{ color: item.color }}>{item.val}</span>
                {item.sub && <span className="fc-summary-sub">{item.sub}</span>}
              </div>
            ))}
          </div>
        )}

        {/* ── 본문 ── */}
        <div className="fc-body">
          {loading && (
            <div className="fc-loading">
              <div className="fc-spinner"/>
              <span>DART 재무데이터 불러오는 중...</span>
            </div>
          )}

          {error && !loading && (
            <div className="fc-error">
              <div>⚠️ {error}</div>
              {!DART_KEY && (
                <div className="fc-error-hint">
                  Vercel 환경변수에 <code>VITE_DART_API_KEY</code>를 등록하세요
                </div>
              )}
              <button className="fc-tab active" style={{ marginTop: 12 }} onClick={loadData}>
                ↺ 다시 시도
              </button>
            </div>
          )}

          {!loading && !error && data && (
            <div className="fc-charts">

              {/* ① 매출액 + 영업이익률 */}
              <SubChart
                data={data} title="매출액 · 영업이익률"
                barKey="rev"  lineKey="opMargin" lineKey2="niMargin"
                barLabel="매출액"  lineLabel="영업이익률" lineLabel2="순이익률"
                barColor="#3b82f6" lineColor="#f59e0b" lineColor2="#10b981"
                barUnit="억원" lineUnit="%"
              />

              {/* ② 영업이익 + 순이익 */}
              <SubChart
                data={data} title="영업이익 · 당기순이익"
                barKey="op"  lineKey="ni"
                barLabel="영업이익" lineLabel="당기순이익"
                barColor="#f59e0b" lineColor="#10b981"
                barUnit="억원" lineUnit="억원"
              />

              {/* ③ 자기자본비율 + 부채비율 */}
              <SubChart
                data={data} title="자기자본비율 · 부채비율"
                barKey="equRatio" lineKey="debtRatio"
                barLabel="자기자본비율" lineLabel="부채비율"
                barColor="#8b5cf6" lineColor="#ef4444"
                barUnit="%" lineUnit="%"
              />

              {/* ④ ROE + ROA */}
              <SubChart
                data={data} title="ROE · ROA"
                barKey="roe" lineKey="roa"
                barLabel="ROE" lineLabel="ROA"
                barColor="#06b6d4" lineColor="#ec4899"
                barUnit="%" lineUnit="%"
              />

              {/* ⑤ 자산·부채 규모 */}
              <SubChart
                data={data} title="자산 · 부채 · 자본 규모"
                barKey="asset" lineKey="eq" lineKey2="liab"
                barLabel="자산총계" lineLabel="자본총계" lineLabel2="부채총계"
                barColor="#334155" lineColor="#3b82f6" lineColor2="#ef4444"
                barUnit="억원" lineUnit="억원"
              />

              {/* 데이터 출처 */}
              <div className="fc-source">
                출처: DART 전자공시시스템 (opendart.fss.or.kr) · {reportType === 'annual' ? '사업보고서' : '반기보고서'}
                <a href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(stock.name)}`}
                  target="_blank" rel="noreferrer" className="fc-dart-link">
                  공시 원문 →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
