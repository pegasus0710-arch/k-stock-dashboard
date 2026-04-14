// src/pages/ComparePage.jsx — 비교 차트 페이지
import { useState, useEffect, useRef, useCallback } from 'react'
import './ComparePage.css'

// ── 대표 지수 목록 ────────────────────────────────────
const MAJOR_INDICES = [
  // KOSPI/KOSDAQ → Yahoo Finance (KS11/KQ11) — Kiwoom index-chart 우회
  { id:'KOSPI',   label:'KOSPI',       src:'global', code:'KS11'  },
  { id:'KOSDAQ',  label:'KOSDAQ',      src:'global', code:'KQ11'  },
  { id:'KPI200',  label:'코스피 200',  src:'global', code:'KPI200' },
  { id:'SP500',   label:'S&P 500',     src:'global', code:'SP500'  },
  { id:'NASDAQ',  label:'나스닥 100',  src:'global', code:'NASDAQ' },
  { id:'DOW',     label:'다우존스',    src:'global', code:'DOW'    },
  { id:'N225',    label:'니케이 225',  src:'global', code:'N225'   },
  { id:'DAX',     label:'DAX',         src:'global', code:'DAX'    },
  { id:'HSI',     label:'항셍',        src:'global', code:'HSI'    },
  { id:'SSE',     label:'상해종합',    src:'global', code:'SSE'    },
]

// ── ETF / 업종 목록 ───────────────────────────────────
const SECTORS_ETF = [
  // 코스피 업종
  { id:'IDX_반도체', label:'[업종] 반도체·IT',    src:'kiwoom-idx', code:'011' },
  { id:'IDX_자동차', label:'[업종] 자동차',        src:'kiwoom-idx', code:'009' },
  { id:'IDX_조선',   label:'[업종] 조선',          src:'kiwoom-idx', code:'021' },
  { id:'IDX_금융',   label:'[업종] 금융',          src:'kiwoom-idx', code:'032' },
  { id:'IDX_바이오', label:'[업종] 의약품',        src:'kiwoom-idx', code:'015' },
  { id:'IDX_화학',   label:'[업종] 화학',          src:'kiwoom-idx', code:'014' },
  { id:'IDX_건설',   label:'[업종] 건설',          src:'kiwoom-idx', code:'016' },
  // ETF
  { id:'KODEX200',   label:'KODEX 200',            src:'stock', code:'069500' },
  { id:'KODEX반도체',label:'KODEX 반도체',         src:'stock', code:'091160' },
  { id:'KODEX2차전지',label:'KODEX 2차전지',       src:'stock', code:'305720' },
  { id:'KODEX바이오',label:'KODEX 바이오',         src:'stock', code:'244580' },
  { id:'KODEX방산',  label:'KODEX K-방산',         src:'stock', code:'455480' },
  { id:'KODEX자동차',label:'KODEX 자동차',         src:'stock', code:'091180' },
  { id:'KODEX조선',  label:'KODEX K-조선&방산',   src:'stock', code:'466920' },
  { id:'KODEX에너지',label:'KODEX 에너지화학',    src:'stock', code:'117460' },
  { id:'KODEX건설',  label:'KODEX 건설',           src:'stock', code:'104530' },
  { id:'TIGER200',   label:'TIGER 200',            src:'stock', code:'102110' },
  { id:'TIGER반도체',label:'TIGER 반도체',        src:'stock', code:'091230' },
  { id:'KODEXSP500', label:'KODEX S&P500',         src:'stock', code:'379800' },
  { id:'KODEXNASDAQ',label:'KODEX 미국나스닥100', src:'stock', code:'133690' },
  { id:'TIGER미국S&P',label:'TIGER 미국S&P500',  src:'stock', code:'360750' },
]

// ── 기간 설정 ─────────────────────────────────────────
const PERIODS = [
  { label:'1개월', value:'1mo', period:'day',  cnt:22,  kisRange:'1mo' },
  { label:'3개월', value:'3mo', period:'day',  cnt:65,  kisRange:'3mo' },
  { label:'6개월', value:'6mo', period:'day',  cnt:130, kisRange:'6mo' },
  { label:'1년',   value:'1y',  period:'week', cnt:52,  kisRange:'1y'  },
  { label:'3년',   value:'3y',  period:'week', cnt:156, kisRange:'5y'  },
  { label:'5년',   value:'5y',  period:'week', cnt:260, kisRange:'5y'  },
]

// ── 시리즈 색상 ───────────────────────────────────────
const COLORS = ['#2563eb', '#ef4444', '#16a34a']
const COLORS_BG = [
  'rgba(37,99,235,.1)',
  'rgba(239,68,68,.1)',
  'rgba(22,163,74,.1)',
]
const COLORS_LIGHT = ['#93c5fd', '#fca5a5', '#86efac']

// ── 기간별 키움 업종 cnt (day 고정) ──────────────────
const IDX_DAY_CNT = {
  '1mo': 22, '3mo': 65, '6mo': 130,
  '1y': 250, '3y': 500, '5y': 700,
}

// ── 데이터 로드 함수 ──────────────────────────────────
async function loadSeriesData(item, pCfg) {
  if (!item) return null
  try {
    let raw = []
    if (item.src === 'kiwoom-idx') {
      // 업종 지수: 주봉(week) 미지원 → 항상 일봉(day)으로 고정
      const cnt = IDX_DAY_CNT[pCfg.value] || 130
      const res = await fetch(
        `/api/kiwoom?type=index-chart&inds_cd=${item.code}&period=day`
      )
      const j = await res.json()
      const candles = j.candles || j.data || []
      raw = candles.slice(-cnt).map(c => ({
        date:  String(c.time || c.date || ''),
        close: Math.abs(Number(c.close || c.cls_prc || 0)),
      }))
      console.log(`[ComparePage] ${item.id} index-chart: ${candles.length}봉→${cnt}봉 사용`)
    } else if (item.src === 'global') {
      // 해외/국내 Yahoo Finance: 1y 이상은 5y range로 요청 후 slice
      const range = ['3y','5y'].includes(pCfg.value) ? '5y'
                  : pCfg.value === '1y' ? '2y'
                  : pCfg.kisRange
      const res = await fetch(
        `/api/kis?type=global&symbol=${item.code}&range=${range}`
      )
      const j = await res.json()
      const candles = j.candles || j.data || []
      raw = candles.slice(-pCfg.cnt).map(c => ({
        date:  String(c.date || c.time || ''),
        close: Math.abs(Number(c.close || c.cls_prc || 0)),
      }))
      console.log(`[ComparePage] ${item.id} global(${range}): ${candles.length}봉→${pCfg.cnt}봉 사용`)
    } else if (item.src === 'stock') {
      const res = await fetch(
        `/api/kiwoom?type=stock-chart&code=${item.code}&period=${pCfg.period}`
      )
      const j = await res.json()
      const candles = j.candles || j.data || []
      raw = candles.slice(-pCfg.cnt).map(c => ({
        date:  String(c.time || c.date || ''),
        close: Math.abs(Number(c.close || c.cls_prc || 0)),
      }))
      console.log(`[ComparePage] ${item.id} stock: ${candles.length}봉→${pCfg.cnt}봉 사용`)
    }
    const valid = raw.filter(c => c.close > 0)
    console.log(`[ComparePage] ${item.id} valid: ${valid.length}봉`)
    if (valid.length < 2) return null
    const base = valid[0].close
    return valid.map(c => ({
      date:    c.date,
      close:   c.close,
      indexed: (c.close / base) * 100,
      ret:     (c.close / base - 1) * 100,
    }))
  } catch(e) {
    console.error(`[ComparePage] ${item?.id} 로드 실패:`, e)
    return null
  }
}

// ── SVG 차트 ──────────────────────────────────────────
const W = 1400, H = 560
const PAD = { top: 30, right: 80, bottom: 46, left: 68 }

function CompareChart({ series, logScale, onHover }) {
  const svgRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const toLogY = v => v > 0 ? Math.log10(v) : 0

  // 전체 y범위 계산
  const allYRaw = series.flatMap(s =>
    s?.data?.map(d => logScale ? toLogY(d.indexed) : d.indexed) ?? []
  )
  const yMin = allYRaw.length ? Math.min(...allYRaw) : 90
  const yMax = allYRaw.length ? Math.max(...allYRaw) : 110
  const yRange = yMax - yMin || 0.01
  const yPadV = yRange * 0.06
  const yLo = yMin - yPadV, yHi = yMax + yPadV

  const toSvgY = v => PAD.top + ((yHi - v) / (yHi - yLo)) * chartH
  const toSvgX = (i, total) => PAD.left + (i / Math.max(total - 1, 1)) * chartW

  // y축 눈금
  const yTicks = []
  const N = 6
  for (let i = 0; i <= N; i++) {
    const raw = yLo + (i / N) * (yHi - yLo)
    const actual = logScale ? Math.pow(10, raw) : raw
    yTicks.push({ raw, label: actual < 10 ? actual.toFixed(2) : actual.toFixed(1) })
  }

  // x축 날짜 샘플링
  const refData = series.find(s => s?.data?.length)?.data || []
  const xIdxs = refData.length > 1
    ? Array.from({ length: 7 }, (_, i) => Math.round(i * (refData.length - 1) / 6))
    : []

  const fmtDate = d => {
    const s = String(d).replace(/\D/g, '')
    if (s.length >= 8) return `${s.slice(2,4)}.${s.slice(4,6)}.${s.slice(6,8)}`
    if (s.length >= 6) return `${s.slice(0,4)}.${s.slice(4,6)}`
    return d
  }
  const fmtDateShort = d => {
    const s = String(d).replace(/\D/g, '')
    if (s.length >= 8) return `${s.slice(4,6)}/${s.slice(6,8)}`
    if (s.length >= 6) return `${s.slice(0,4)}.${s.slice(4,6)}`
    return d
  }

  const handleMouseMove = useCallback(e => {
    const svg = svgRef.current
    if (!svg || !refData.length) return
    const rect = svg.getBoundingClientRect()
    const svgX = (e.clientX - rect.left) * (W / rect.width)
    const rawI = ((svgX - PAD.left) / chartW) * (refData.length - 1)
    const idx = Math.max(0, Math.min(refData.length - 1, Math.round(rawI)))
    const x = toSvgX(idx, refData.length)
    setTooltip({ idx, x })
    if (onHover) onHover(idx)
  }, [refData.length, chartW, onHover])

  const handleLeave = () => { setTooltip(null); if (onHover) onHover(null) }

  // 기준선 y (indexed=100)
  const base100Y = toSvgY(logScale ? toLogY(100) : 100)

  return (
    <div className="cmp-chart-wrap">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
        className="cmp-svg"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleLeave}>

        {/* 그리드 */}
        {yTicks.map((t, i) => (
          <line key={i}
            x1={PAD.left} x2={W - PAD.right}
            y1={toSvgY(t.raw)} y2={toSvgY(t.raw)}
            stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 6"/>
        ))}

        {/* 기준선 100 */}
        {isFinite(base100Y) && (
          <line x1={PAD.left} x2={W - PAD.right}
            y1={base100Y} y2={base100Y}
            stroke="var(--text-secondary)" strokeWidth="0.8"
            strokeDasharray="4 4" opacity="0.4"/>
        )}

        {/* 영역 채우기 (1번 시리즈만) */}
        {series[0]?.data?.length > 0 && (() => {
          const pts = series[0].data.map((d, i) => {
            const yV = logScale ? toLogY(d.indexed) : d.indexed
            return `${toSvgX(i, series[0].data.length).toFixed(1)},${toSvgY(yV).toFixed(1)}`
          })
          const lastX = toSvgX(series[0].data.length - 1, series[0].data.length)
          const b100 = Math.min(base100Y, PAD.top + chartH)
          return (
            <polygon
              points={`${PAD.left},${b100} ${pts.join(' ')} ${lastX},${b100}`}
              fill={COLORS_BG[0]} stroke="none"/>
          )
        })()}

        {/* 라인 */}
        {series.map((s, si) => {
          if (!s?.data?.length) return null
          const pts = s.data.map((d, i) => {
            const yV = logScale ? toLogY(d.indexed) : d.indexed
            return `${toSvgX(i, s.data.length).toFixed(1)},${toSvgY(yV).toFixed(1)}`
          }).join(' ')
          return (
            <polyline key={si} points={pts} fill="none"
              stroke={COLORS[si]}
              strokeWidth={si === 0 ? 2.2 : 1.8}
              strokeLinejoin="round" opacity="0.95"/>
          )
        })}

        {/* 크로스헤어 */}
        {tooltip && (
          <>
            <line x1={tooltip.x} x2={tooltip.x}
              y1={PAD.top} y2={PAD.top + chartH}
              stroke="var(--text-secondary)" strokeWidth="0.7"
              strokeDasharray="3 4"/>
            {series.map((s, si) => {
              const d = s?.data?.[tooltip.idx]
              if (!d) return null
              const yV = logScale ? toLogY(d.indexed) : d.indexed
              const cy = toSvgY(yV)
              return isFinite(cy) ? (
                <circle key={si} cx={tooltip.x} cy={cy} r="4.5"
                  fill={COLORS[si]} stroke="white" strokeWidth="1.5"/>
              ) : null
            })}
          </>
        )}

        {/* y축 레이블 */}
        {yTicks.map((t, i) => (
          <text key={i} x={PAD.left - 7} y={toSvgY(t.raw) + 4}
            textAnchor="end" fontSize="9.5" fill="var(--text-dim)">{t.label}</text>
        ))}

        {/* x축 레이블 */}
        {xIdxs.map(idx => {
          if (!refData[idx]) return null
          const x = toSvgX(idx, refData.length)
          return (
            <text key={idx} x={x} y={H - 8}
              textAnchor="middle" fontSize="9" fill="var(--text-dim)">
              {fmtDateShort(refData[idx].date)}
            </text>
          )
        })}

        {/* 축 */}
        <line x1={PAD.left} x2={PAD.left}
          y1={PAD.top} y2={PAD.top + chartH}
          stroke="var(--border)" strokeWidth="1"/>
        <line x1={PAD.left} x2={W - PAD.right}
          y1={PAD.top + chartH} y2={PAD.top + chartH}
          stroke="var(--border)" strokeWidth="1"/>

        {/* 우측 y레이블 (현재값) */}
        {series.map((s, si) => {
          if (!s?.data?.length) return null
          const last = s.data[s.data.length - 1]
          const yV = logScale ? toLogY(last.indexed) : last.indexed
          const cy = toSvgY(yV)
          return isFinite(cy) ? (
            <g key={si}>
              <rect x={W - PAD.right + 4} y={cy - 9} width={58} height={15}
                rx="3" fill={COLORS[si]} opacity="0.12"/>
              <text x={W - PAD.right + 7} y={cy + 3}
                fontSize="9.5" fontWeight="600" fill={COLORS[si]}>
                {last.ret >= 0 ? '+' : ''}{last.ret.toFixed(2)}%
              </text>
            </g>
          ) : null
        })}
      </svg>

      {/* 툴팁 박스 */}
      {tooltip && series.some(s => s?.data?.[tooltip.idx]) && (
        <div className="cmp-tooltip">
          <div className="cmp-tt-date">
            {fmtDate(series.find(s => s?.data?.[tooltip.idx])?.data[tooltip.idx]?.date || '')}
          </div>
          {series.map((s, si) => {
            const d = s?.data?.[tooltip.idx]
            if (!d || !s.item) return null
            return (
              <div key={si} className="cmp-tt-row">
                <span className="cmp-tt-dot" style={{background: COLORS[si]}}/>
                <span className="cmp-tt-name">{s.item.label}</span>
                <span className="cmp-tt-idx">{d.indexed.toFixed(2)}</span>
                <span className="cmp-tt-ret" style={{
                  color: d.ret >= 0 ? 'var(--color-up)' : 'var(--color-down)'
                }}>
                  {d.ret >= 0 ? '+' : ''}{d.ret.toFixed(2)}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── 시리즈 선택기 컴포넌트 ───────────────────────────
function SeriesSelector({ idx, value, onChange, type, stockList }) {
  const [searchQ, setSearchQ] = useState('')
  const [showDrop, setShowDrop] = useState(false)
  const [localSearch, setLocalSearch] = useState('')
  const dropRef = useRef(null)
  const color = COLORS[idx]

  const LABEL = ['① 지수',  '② ETF · 업종', '③ 종목 · ETF']
  const OPTIONS = [
    MAJOR_INDICES,
    SECTORS_ETF,
    null,  // 검색
  ]

  const opts = OPTIONS[idx]

  // 외부 클릭 닫기
  useEffect(() => {
    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = opts
    ? opts.filter(o => !localSearch || o.label.toLowerCase().includes(localSearch.toLowerCase()))
    : (stockList || []).filter(s => {
        if (!localSearch) return false
        const q = localSearch.trim()
        if (!q) return false
        return (s.name || s.stk_nm || '').includes(q) ||
               (s.code || s.stk_cd || '').includes(q)
      }).slice(0, 40)

  const handleSelect = item => {
    onChange(item)
    setShowDrop(false)
    setLocalSearch('')
  }

  const handleClear = e => {
    e.stopPropagation()
    onChange(null)
    setLocalSearch('')
  }

  return (
    <div className="cmp-selector" ref={dropRef}
      style={{'--s-color': color}}>
      <div className="cmp-sel-label"
        style={{color}}>
        {LABEL[idx]}
      </div>
      <div className={`cmp-sel-trigger${showDrop ? ' open' : ''}`}
        onClick={() => setShowDrop(v => !v)}>
        {value ? (
          <>
            <span className="cmp-sel-chosen">{value.label}</span>
            <button className="cmp-sel-clear" onClick={handleClear}>✕</button>
          </>
        ) : (
          <span className="cmp-sel-placeholder">
            {idx === 2 ? '종목명 또는 코드 검색' : '선택하세요'}
          </span>
        )}
        <span className="cmp-sel-arrow">{showDrop ? '▲' : '▼'}</span>
      </div>

      {showDrop && (
        <div className="cmp-sel-drop">
          <div className="cmp-sel-search-wrap">
            <input
              className="cmp-sel-search"
              placeholder={idx === 2 ? '종목명/코드 입력...' : '필터...'}
              value={localSearch}
              onChange={e => setLocalSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="cmp-sel-list">
            {filtered.length === 0 ? (
              <div className="cmp-sel-empty">
                {idx === 2 && !localSearch ? '종목명 또는 코드를 입력하세요' : '결과 없음'}
              </div>
            ) : (
              filtered.map(item => (
                <button key={item.id || item.code} className="cmp-sel-item"
                  onClick={() => handleSelect(
                    item.id ? item : {
                      id: item.code || item.stk_cd,
                      label: item.name || item.stk_nm,
                      src: 'stock',
                      code: item.code || item.stk_cd
                    }
                  )}>
                  <span className="cmp-sel-item-label">{item.label || item.name || item.stk_nm}</span>
                  {(item.code || item.stk_cd) && <span className="cmp-sel-item-code">{item.code || item.stk_cd}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 인기 종목 fallback (stockList 로드 전 검색용) ─────
const POPULAR_STOCKS = [
  {code:'005930',name:'삼성전자'},{code:'000660',name:'SK하이닉스'},
  {code:'005490',name:'포스코홀딩스'},{code:'005380',name:'현대차'},
  {code:'000270',name:'기아'},{code:'068270',name:'셀트리온'},
  {code:'207940',name:'삼성바이오로직스'},{code:'051910',name:'LG화학'},
  {code:'006400',name:'삼성SDI'},{code:'035420',name:'NAVER'},
  {code:'035720',name:'카카오'},{code:'012330',name:'현대모비스'},
  {code:'009540',name:'HD한국조선해양'},{code:'329180',name:'HD현대중공업'},
  {code:'042660',name:'한화오션'},{code:'010140',name:'삼성중공업'},
  {code:'012450',name:'한화에어로스페이스'},{code:'079550',name:'LIG넥스원'},
  {code:'064350',name:'현대로템'},{code:'047810',name:'한국항공우주'},
  {code:'373220',name:'LG에너지솔루션'},{code:'003670',name:'포스코퓨처엠'},
  {code:'247540',name:'에코프로비엠'},{code:'086520',name:'에코프로'},
  {code:'105560',name:'KB금융'},{code:'055550',name:'신한지주'},
  {code:'086790',name:'하나금융지주'},{code:'066570',name:'LG전자'},
  {code:'034020',name:'두산에너빌리티'},{code:'267260',name:'현대일렉트릭'},
  {code:'259960',name:'크래프톤'},{code:'352820',name:'하이브'},
  {code:'000100',name:'유한양행'},{code:'128940',name:'한미약품'},
  {code:'196170',name:'알테오젠'},{code:'141080',name:'레인보우로보틱스'},
  {code:'069500',name:'KODEX 200'},{code:'091160',name:'KODEX 반도체'},
  {code:'305720',name:'KODEX 2차전지'},{code:'379800',name:'KODEX S&P500'},
  {code:'133690',name:'KODEX 미국나스닥100'},{code:'102110',name:'TIGER 200'},
]

// ── 메인 페이지 ───────────────────────────────────────
export default function ComparePage() {
  const [period,   setPeriod]   = useState(PERIODS[2])   // 기본 6개월
  const [logScale, setLogScale] = useState(true)
  const [items,    setItems]    = useState([null, null, null])
  const [series,   setSeries]   = useState([null, null, null])
  const [errors,   setErrors]   = useState([null, null, null])
  const [loading,  setLoading]  = useState([false, false, false])
  const [stockList, setStockList] = useState(POPULAR_STOCKS) // fallback으로 시작

  // 전종목 목록 로드 (시리즈 3용) — 실패해도 인기종목 fallback 유지
  useEffect(() => {
    fetch('/api/kiwoom?type=stocks-list')
      .then(r => r.json())
      .then(d => {
        const list = d.stocks || d.data || d.items || d.list || []
        const normalized = list.map(s => ({
          code: s.code || s.stk_cd || '',
          name: s.name || s.stk_nm || s.label || '',
        })).filter(s => s.code && s.name)
        if (normalized.length > 0) {
          setStockList(normalized)
          console.log(`[ComparePage] 전종목 ${normalized.length}개 로드`)
        }
      })
      .catch(e => console.warn('[ComparePage] stocks-list 실패, 인기종목 사용:', e))
  }, [])

  // 아이템 또는 기간 변경 시 데이터 로드
  const loadSeries = useCallback(async (i, item) => {
    if (!item) {
      setSeries(prev => { const n=[...prev]; n[i]=null; return n })
      setErrors(prev => { const n=[...prev]; n[i]=null; return n })
      return
    }
    setLoading(prev => { const n=[...prev]; n[i]=true; return n })
    setErrors(prev => { const n=[...prev]; n[i]=null; return n })
    const data = await loadSeriesData(item, period)
    setSeries(prev => {
      const n = [...prev]
      n[i] = data ? { item, data } : null
      return n
    })
    if (!data) {
      setErrors(prev => { const n=[...prev]; n[i]='데이터 없음'; return n })
    }
    setLoading(prev => { const n=[...prev]; n[i]=false; return n })
  }, [period])

  useEffect(() => {
    items.forEach((item, i) => { if (item) loadSeries(i, item) })
  }, [period])

  const handleItemChange = (i, item) => {
    setItems(prev => { const n=[...prev]; n[i]=item; return n })
    loadSeries(i, item)
  }

  // 성과 요약 계산
  const getPerf = (s) => {
    if (!s?.data?.length) return null
    const last = s.data[s.data.length - 1]
    return { ret: last.ret, indexed: last.indexed }
  }

  // 하나라도 선택됐거나 로딩 중이면 차트 영역 표시
  const hasItems = items.some(Boolean)
  const hasAny   = series.some(Boolean)

  return (
    <div className="cmp-page">
      {/* 헤더 */}
      <div className="cmp-header">
        <div className="cmp-header-title">
          <span className="cmp-header-icon">📊</span>
          <h1>비교 차트</h1>
          <span className="cmp-header-sub">지수 · ETF · 종목 상대 성과 비교</span>
        </div>

        {/* 기간 + 차트 옵션 */}
        <div className="cmp-header-controls">
          <div className="cmp-period-tabs">
            {PERIODS.map(p => (
              <button key={p.value}
                className={`cmp-period-btn${period.value === p.value ? ' active' : ''}`}
                onClick={() => setPeriod(p)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="cmp-chart-opts">
            <button
              className={`cmp-opt-btn${!logScale ? ' active' : ''}`}
              onClick={() => setLogScale(false)}>
              일반
            </button>
            <button
              className={`cmp-opt-btn${logScale ? ' active' : ''}`}
              onClick={() => setLogScale(true)}>
              로그
            </button>
          </div>
        </div>
      </div>

      {/* 시리즈 선택기 3개 */}
      <div className="cmp-selectors">
        {[0, 1, 2].map(i => (
          <SeriesSelector key={i} idx={i}
            value={items[i]}
            onChange={item => handleItemChange(i, item)}
            stockList={stockList}
          />
        ))}
      </div>

      {/* 범례 + 성과 요약 */}
      {hasItems && (
        <div className="cmp-legend">
          {items.map((item, i) => {
            if (!item) return null
            const s = series[i]
            const perf = s ? getPerf(s) : null
            return (
              <div key={i} className="cmp-legend-item"
                style={{'--lc': COLORS[i]}}>
                <span className="cmp-legend-line"
                  style={{background: COLORS[i]}}/>
                <span className="cmp-legend-name">{item.label}</span>
                {loading[i] && <span className="cmp-legend-loading">↻</span>}
                {errors[i] && !loading[i] && (
                  <span style={{fontSize:10,color:'#ef4444'}}>데이터 없음</span>
                )}
                {perf && !loading[i] && (
                  <span className="cmp-legend-ret"
                    style={{color: perf.ret >= 0 ? 'var(--color-up)' : 'var(--color-down)'}}>
                    {perf.ret >= 0 ? '▲' : '▼'} {Math.abs(perf.ret).toFixed(2)}%
                  </span>
                )}
              </div>
            )
          })}
          <div className="cmp-legend-note">
            첫 거래일 = 100 기준 상대 성과
            {logScale && ' · 로그 스케일'}
          </div>
        </div>
      )}

      {/* 차트 */}
      <div className="cmp-chart-area">
        {!hasItems ? (
          <div className="cmp-empty">
            <div className="cmp-empty-icon">📈</div>
            <div className="cmp-empty-title">비교할 항목을 선택하세요</div>
            <div className="cmp-empty-desc">
              위 3개 선택기에서 지수, ETF/업종, 종목을 선택하면<br/>
              기간 대비 상대 성과를 한눈에 비교합니다
            </div>
          </div>
        ) : loading.some(Boolean) && !hasAny ? (
          <div className="cmp-loading">
            <div className="cmp-spinner"/>
            <span>데이터 로딩 중...</span>
          </div>
        ) : hasAny ? (
          <CompareChart
            series={series}
            logScale={logScale}
          />
        ) : (
          <div className="cmp-empty">
            <div className="cmp-empty-icon">⚠️</div>
            <div className="cmp-empty-title">데이터를 불러오지 못했습니다</div>
            <div className="cmp-empty-desc">
              EC2 서버 또는 API 연결을 확인하세요<br/>
              <small style={{fontSize:10,color:'var(--text-dim)'}}>DevTools Console에서 [ComparePage] 로그 확인</small>
            </div>
          </div>
        )}
      </div>

      {/* 하단 성과 테이블 */}
      {hasAny && (
        <div className="cmp-perf-table">
          <div className="cmp-perf-header">
            <span>항목</span>
            <span>시작가</span>
            <span>현재가</span>
            <span>등락</span>
            <span>기간 수익률</span>
          </div>
          {series.map((s, i) => {
            if (!s?.data?.length) return null
            const first = s.data[0]
            const last  = s.data[s.data.length - 1]
            const ret   = last.ret
            const up    = ret >= 0
            return (
              <div key={i} className="cmp-perf-row">
                <span className="cmp-perf-name">
                  <span className="cmp-perf-dot" style={{background: COLORS[i]}}/>
                  {s.item.label}
                </span>
                <span className="cmp-perf-val">
                  {first.close >= 1000
                    ? Math.round(first.close).toLocaleString()
                    : first.close.toFixed(2)}
                </span>
                <span className="cmp-perf-val">
                  {last.close >= 1000
                    ? Math.round(last.close).toLocaleString()
                    : last.close.toFixed(2)}
                </span>
                <span className="cmp-perf-change"
                  style={{color: up ? 'var(--color-up)' : 'var(--color-down)'}}>
                  {up ? '+' : ''}
                  {(last.close - first.close) >= 1000
                    ? Math.round(last.close - first.close).toLocaleString()
                    : (last.close - first.close).toFixed(2)}
                </span>
                <span className="cmp-perf-ret"
                  style={{
                    color:      up ? 'var(--color-up)' : 'var(--color-down)',
                    background: up ? 'rgba(220,38,38,.08)' : 'rgba(37,99,235,.08)',
                  }}>
                  {up ? '+' : ''}{ret.toFixed(2)}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
