import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import StockChartModal from '../components/StockChartModal'
import GlobalChartModal from '../components/GlobalChartModal'
import { ALL_THEMES, DEFAULT_ACTIVE_IDS } from '../constants/themes'
import { fmt, fmtRate, fmtChange, rateColor, getTodayStr, getNowTime, getKstStatus, isMarketOpen, isUSMarketOpen, getDashTTL } from '../utils/format'
import './DashboardPage.css'

// ── 상수 ──────────────────────────────────────────────
const THEME_DOC_KEY = 'dashboard_theme_prefs'
const LS_DASH    = 'db_cache_v3'
const LS_BRIEFING= 'db_briefing_v1'
const LS_GLOBAL  = 'db_global_v4'
const LS_FOREX   = 'db_forex_krw_v1'
const LS_SPARK   = 'db_spark_v3'

// 배치 조회할 심볼 목록
const BATCH_SYMBOLS = [
  // 해외 지수
  'SP500','NASDAQ','DOW','N225','HSI','SSE','TWI','DAX',
  // 채권
  'US10Y','US2Y','KR10Y',
  // 원자재·기타
  'WTI','BRENT','GOLD','SILVER','COPPER','VIX','DXY',
]

// KOSPI/KOSDAQ → 키움 업종코드
function marketToInds(m) {
  if (m === 'J' || m === 'KOSPI')  return '001'
  if (m === 'Q' || m === 'KOSDAQ') return '101'
  return '001'
}

// ── localStorage 캐시 ─────────────────────────────────
function lsRead(key, ttl) {
  try {
    const r = localStorage.getItem(key)
    if (!r) return null
    const { data, ts } = JSON.parse(r)
    return Date.now() - ts < ttl ? data : null
  } catch { return null }
}
function lsWrite(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

// ── 공통 컴포넌트 ─────────────────────────────────────
function Sparkline({ values, color }) {
  if (!values || values.length < 2) return null
  const W = 80, H = 28
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1) * W).toFixed(1)},${(H - ((v - min) / range) * (H - 4) - 2).toFixed(1)}`
  ).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

function Skeleton({ w = '100%', h = 20, r = 6, mb = 0 }) {
  return <div className="db-skeleton" style={{ width: w, height: h, borderRadius: r, marginBottom: mb }}/>
}

// ── 지수 툴팁 데이터 ──────────────────────────────────
const TOOLTIPS = {
  KOSPI: {
    title: 'KOSPI (코스피)',
    desc: '대한민국 유가증권시장 전체 종목 시가총액 가중평균 지수. 삼성전자·SK하이닉스 등 대형주 비중이 높아 반도체·수출 경기에 민감.',
    up:   '경기 회복·외국인 순매수·원화 강세 → 성장주·대형 수출주 비중 확대 고려',
    down: '경기 둔화·외국인 이탈·환율 급등 → 방어주(통신·필수소비재)·현금 비중 확대',
    tip:  '📌 2,500↑ 강세 / 2,000↓ 약세 경계 / PBR 1배(약 2,400) = 역사적 바닥 근처',
  },
  KOSDAQ: {
    title: 'KOSDAQ (코스닥)',
    desc: '중소·벤처·기술 성장기업 위주 지수. 바이오·게임·2차전지 비중이 높아 KOSPI보다 변동성이 크고 금리에 더 민감.',
    up:   '금리 하락·성장주 선호·유동성 확대 → 바이오·IT·게임·2차전지 종목 관심',
    down: '금리 상승·위험회피 심리 → 변동성 크므로 비중 축소 또는 ETF로 분산',
    tip:  '📌 900↑ 강세 / 700↓ 약세 / KOSPI 대비 상대강도 확인이 중요',
  },
  SP500: {
    title: 'S&P 500',
    desc: '미국 대형주 500개사 시가총액 가중 지수. 전 세계 주식시장의 40% 이상을 차지해 글로벌 위험선호의 바로미터.',
    up:   '글로벌 위험선호 확대·달러 강세 완화 → 국내 외국인 매수 유입 기대, 성장주 긍정',
    down: '글로벌 위험회피 → 외국인 이탈, 원화 약세 압력. 방어주·현금 확보.',
    tip:  '📌 200일 이동평균 위 = 상승추세 / 아래 = 하락추세. VIX와 함께 확인 필수',
  },
  NASDAQ: {
    title: 'NASDAQ Composite',
    desc: '미국 기술주·성장주 중심 지수. 엔비디아·애플·MS·구글 등 AI·반도체 비중이 높아 금리 변화에 매우 민감.',
    up:   '금리 하락 기대·AI 투자 확대 → 국내 반도체(삼성·SK하이닉스)·AI 관련주 동반 상승 기대',
    down: '금리 상승·성장주 밸류에이션 부담 → 국내 IT·게임주도 동반 약세 경계',
    tip:  '📌 NASDAQ/S&P500 비율 상승 = 성장주 선호 국면. 하락 시 가치주 전환 신호',
  },
  DOW: {
    title: 'DOW Jones 산업평균',
    desc: '미국 30개 우량 산업주 단순평균 지수. 전통 제조업·금융·에너지 비중이 높아 경기 민감도를 대표.',
    up:   '전통 산업·경기 회복 신호. 원자재·소재·금융 관련 국내 종목 긍정.',
    down: '경기 침체 우려. 필수소비재·헬스케어 등 방어 섹터로 이동 검토.',
    tip:  '📌 S&P500과 동반 하락 시 본격 약세장. 둘의 괴리가 크면 섹터 로테이션 신호.',
  },
  N225: {
    title: '닛케이 225',
    desc: '일본 도쿄증권거래소 대표 225개 종목 지수. 엔화 환율과 역상관 관계 — 엔 약세 시 수출주 수혜로 상승하는 경향.',
    up:   '엔 약세·일본 수출 경기 호조. 원/엔 환율 하락(원화 강세) 가능성 동반.',
    down: '엔 강세·일본 내수 위축. 원화 대비 엔화 강세 전환 시 환전 비용 증가.',
    tip:  '📌 35,000↑ = 강세장. 엔/달러 150↑ = 지나친 엔저, BOJ 개입 주의',
  },
  HSI: {
    title: '항셍지수 (홍콩)',
    desc: '홍콩 증시 대형주 지수. 중국 빅테크(알리바바·텐센트 등) 비중이 높아 중국 정책·규제 리스크에 민감.',
    up:   '중국 경기 부양·규제 완화 신호 → 중국 소비·IT 관련주 긍정.',
    down: '중국 부동산 위기·규제 강화·미중 갈등 심화 → 글로벌 신흥국 위험 전반 부정.',
    tip:  '📌 20,000↑ 회복 시 중국 경기 반등 신호. 미중 관계 지표와 함께 관찰.',
  },
  SSE: {
    title: '상해종합지수 (중국)',
    desc: '중국 상하이거래소 전체 상장 종목 지수. 세계 2위 경제대국의 내수·제조업 경기를 반영. 국내 화학·소재·화장품주와 연동.',
    up:   '중국 내수 확대·수출 회복 → 대중 수출 비중 높은 화학·철강·뷰티 종목 긍정.',
    down: '중국 경기 둔화 → 국내 중국 관련 수출주 전반 약세 경계.',
    tip:  '📌 3,000↑ 안정 / 2,800↓ 부양책 기대감. 중국 PMI 지표와 함께 확인.',
  },
  TWI: {
    title: '대만가권지수 (TAIEX)',
    desc: '대만 증시 전체 지수. TSMC 비중이 40% 이상으로 글로벌 반도체 수요의 선행지표. 국내 삼성전자·SK하이닉스와 높은 상관관계.',
    up:   '글로벌 반도체 수요 증가·AI 투자 확대 → 국내 반도체·장비·소재주 동반 강세 기대.',
    down: '반도체 업황 둔화 → 국내 반도체 섹터 약세 선행 신호로 활용.',
    tip:  '📌 TSMC 주가와 삼성전자 주가는 3~6개월 선행/후행 관계. 반드시 같이 확인.',
  },
  DAX: {
    title: 'DAX 40 (독일)',
    desc: '독일 프랑크푸르트 40개 대형주 지수. 자동차(BMW·폴크스바겐)·산업재·화학 비중이 높아 유럽 제조업 경기 대표.',
    up:   '유럽 경기 회복·에너지 가격 안정 → 국내 자동차·부품 수출주 긍정.',
    down: '에너지 위기·러시아 리스크·유럽 경기 둔화 → 글로벌 제조업 전반 부정.',
    tip:  '📌 유로/달러 환율과 함께 확인. 유로 강세 = DAX 수출주 부담.',
  },
  US10Y: {
    title: '미국 10년 국채 금리',
    desc: '전 세계 모든 자산의 기준금리. 주식 밸류에이션(PER)에 직접 영향. "무위험 수익률"이 높아지면 주식 매력 감소.',
    up:   '금리 상승 → 주식(특히 성장주·바이오·IT) 하락 압력. 고PER 종목 매도, 금융주·가치주 방어.',
    down: '금리 하락 → 성장주 재평가 상승. 바이오·2차전지·게임 등 고PER 섹터 긍정.',
    tip:  '📌 4.5%↑ = 성장주 위험 / 3.5%↓ = 성장주 환경 개선 / 5%↑ = 전면 하락 압력',
  },
  US2Y: {
    title: '미국 단기금리 (3M)',
    desc: '연방기금금리(Fed 기준금리)와 가장 가깝게 움직이는 단기 국채 수익률. 현재 통화정책 방향을 실시간 반영.',
    up:   '연준 긴축 지속·금리 인하 기대 후퇴 → 주식 전반 하락 압력, 달러 강세.',
    down: '연준 피벗(금리 인하) 기대 상승 → 주식·신흥국·원자재 긍정.',
    tip:  '📌 10Y-3M 스프레드가 역전(음수)되면 경기침체 확률 급상승. 현재 스프레드 주시.',
  },
  KR10Y: {
    title: '한국 10년 국채 금리',
    desc: '국내 기준금리·경기 전망·외국인 채권 투자를 반영. 미국 10년물과 연동되며 원화 환율에도 영향.',
    up:   '한미 금리차 축소·국내 인플레 우려 → 외국인 채권 자금 이탈 가능, 원화 약세.',
    down: '한국은행 금리 인하 기대 → 부동산·리츠·금융주 긍정.',
    tip:  '📌 한미 금리차 -1.5%p 이상 역전 = 외국인 이탈·원화 약세 위험 확대.',
  },
  WTI: {
    title: 'WTI 원유 (미국산)',
    desc: '서부텍사스중질유. 미국 에너지 가격의 기준. 인플레이션 및 물류비용에 직접 영향. 연준 통화정책 변수.',
    up:   '인플레 압력 재부상 → 연준 금리 인하 지연 → 성장주 부담. 에너지주·화학주 긍정.',
    down: '글로벌 경기 둔화 수요 감소 신호. 인플레 완화 → 금리 인하 기대 상승.',
    tip:  '📌 $80↑ = 인플레 경계 / $60↓ = 경기 침체 우려 / $100↑ = 에너지 위기',
  },
  BRENT: {
    title: '브렌트유 (국제 기준)',
    desc: '북해산 원유로 국제 원유 가격의 실질적 기준(전 세계 거래량의 60% 기준). 국내 정유사·항공·해운사 비용에 직접 영향.',
    up:   '정유·화학 마진 상승. 항공·해운 비용 증가 → 해당 업종 수익성 악화.',
    down: '항공·해운·물류 업종 수혜. 무역수지 개선 → 원화 강세 압력.',
    tip:  '📌 WTI 대비 $3~5 프리미엄이 정상. 괴리가 크면 공급 이슈 신호.',
  },
  GOLD: {
    title: '금 (Gold)',
    desc: '대표적 안전자산. 달러 가치와 역상관 관계. 인플레·지정학 리스크·금리 하락기에 강세.',
    up:   '안전자산 선호·달러 약세·인플레 우려 → 리스크 자산 경계 신호. 방어적 포지션 고려.',
    down: '달러 강세·실질금리 상승 → 금 약세. 위험자산 선호 복귀 신호일 수 있음.',
    tip:  '📌 $2,000↑ = 불안심리 상존 / $2,500↑ = 위기 대비 수요 급증. 금/구리 비율로 심리 확인.',
  },
  SILVER: {
    title: '은 (Silver)',
    desc: '산업용(전기차 배터리·태양광·전자) + 귀금속 이중 성격. 금보다 변동성이 크고 경기에 더 민감.',
    up:   '산업 수요 확대(특히 전기차·태양광) + 안전자산 수요 → 신재생에너지 섹터 긍정.',
    down: '산업 수요 둔화 → 경기 침체 선행. 금 대비 은 약세 = 경기 비관론 확대.',
    tip:  '📌 금/은 비율(Gold/Silver Ratio) 80↑ = 은이 상대적 저평가 → 비율 복귀 시 은 강세 기대.',
  },
  COPPER: {
    title: '구리 (닥터 쿠퍼)',
    desc: '건설·전자·자동차·전력 등 전방위 산업 사용. 경기 실물 수요를 가장 잘 반영해 "닥터 쿠퍼"라 불림.',
    up:   '글로벌 제조업 회복·중국 인프라 투자 → 소재·산업재·신흥국 주식 긍정.',
    down: '글로벌 제조업 둔화·중국 수요 감소 → 경기침체 선행. 방어주 비중 확대.',
    tip:  '📌 구리/금 비율 하락 = 안전자산 선호 확대 = 주식 비중 축소 신호로 활용.',
  },
  VIX: {
    title: 'VIX (공포지수)',
    desc: 'S&P500 옵션 내재변동성으로 계산. 시장 공포와 불확실성의 실시간 온도계. 주가와 역상관 관계.',
    up:   '시장 공포 확대 → VIX 30↑ 시 역발상 매수 기회 탐색. 단기 하락 피크 근처 가능.',
    down: '시장 안정·낙관 → VIX 15↓ 시 과도한 낙관, 조정 가능성 경계.',
    tip:  '📌 15↓ 안정 / 20↑ 불안 / 30↑ 공포(역발상 매수 검토) / 40↑ 패닉(극단적 저점 근처) / 역사적으로 VIX 30 돌파 후 6~12개월 수익률 플러스 확률 80%+',
  },
  DXY: {
    title: '달러인덱스 (DXY)',
    desc: '유로·엔·파운드 등 6개 주요 통화 대비 달러 강세를 측정하는 종합지수. 글로벌 자금 흐름의 핵심 변수.',
    up:   '달러 강세 → 신흥국 자금 이탈, 원화 약세, 원자재 하락 압력. 국내 수입물가 상승.',
    down: '달러 약세 → 신흥국·원자재·금 상승. 외국인 국내 증시 유입 증가 기대.',
    tip:  '📌 100↑ 달러 강세 / 95↓ 달러 약세. DXY 하락 = 신흥국 강세 공식이 역사적으로 유효.',
  },
}

// ── 툴팁 컴포넌트 ─────────────────────────────────────
function InfoTooltip({ sym }) {
  const [show, setShow] = useState(false)
  const info = TOOLTIPS[sym]
  if (!info) return null
  return (
    <span className="db-info-wrap">
      <span className="db-info-btn"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={e => { e.stopPropagation(); setShow(v => !v) }}>?</span>
      {show && (
        <div className="db-tooltip-box" onClick={e => e.stopPropagation()}>
          <div className="db-tooltip-title">{info.title}</div>
          <div className="db-tooltip-desc">{info.desc}</div>
          <div className="db-tooltip-row up">📈 상승 시: {info.up}</div>
          <div className="db-tooltip-row down">📉 하락 시: {info.down}</div>
          <div className="db-tooltip-tip">{info.tip}</div>
        </div>
      )}
    </span>
  )
}

// ── KOSPI/KOSDAQ 카드 ─────────────────────────────────
function IndexCard({ data, loading, color, label, sym, sparkData, onChartClick }) {
  const spark    = sparkData || []
  const status   = data?.status || 'closed'
  const priceClr = loading || !data ? '#94a3b8' : rateColor(data?.changeRate)

  return (
    <div className="db-index-card" style={{ '--ic': color }}
      onClick={() => data && onChartClick({ type: 'index', market: data.market, label, price: data.price, changeRate: data.changeRate, status })}>
      <div className="db-index-body">
        <div style={{ flex: 1 }}>
          <div className="db-index-top">
            <span className="db-index-label">{label}</span>
            <InfoTooltip sym={sym}/>
            {!loading && (
              status === 'open' ? <span className="db-live-badge">● LIVE</span>
              : status === 'after' ? <span className="db-after-badge">⏱ 시간외</span>
              : <span className="db-closed-badge">전일</span>
            )}
          </div>
          {loading ? (
            <><Skeleton h={32} r={6} mb={6}/><Skeleton w="60%" h={16} r={4}/></>
          ) : data?.price > 0 ? (
            <>
              <div className="db-index-price" style={{ color: priceClr }}>{fmt(data.price)}</div>
              <div className="db-index-change" style={{ color: priceClr }}>
                {fmtChange(data.change)} ({fmtRate(data.changeRate)})
              </div>
              <div className="db-index-sub">고 {fmt(data.high)} · 저 {fmt(data.low)}</div>
            </>
          ) : (
            <div className="db-global-na">데이터 없음</div>
          )}
        </div>
        {spark.length >= 2 && (
          <div className="db-spark-wrap">
            <Sparkline values={spark} color={data?.changeRate >= 0 ? '#ef4444' : '#3b82f6'}/>
            <span className="db-spark-hint">차트 →</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 해외지수 미니 카드 ────────────────────────────────
const GLOBAL_GROUPS = [
  {
    label: '🌍 해외 주요 지수',
    items: [
      { sym: 'SP500',  label: 'S&P 500',    color: '#ef4444' },
      { sym: 'NASDAQ', label: 'NASDAQ',     color: '#0d9488' },
      { sym: 'DOW',    label: 'DOW',        color: '#2563eb' },
      { sym: 'N225',   label: '닛케이 225',  color: '#ea580c' },
      { sym: 'HSI',    label: '항셍',        color: '#dc2626' },
      { sym: 'SSE',    label: '상해종합',    color: '#b91c1c' },
      { sym: 'TWI',    label: '대만가권',    color: '#0891b2' },
      { sym: 'DAX',    label: 'DAX',        color: '#7c3aed' },
    ],
  },
  {
    label: '📈 채권 · 금리',
    items: [
      { sym: 'US10Y',  label: '미국 10Y',   color: '#7c3aed', unit: '%' },
      { sym: 'US2Y',   label: '미국 3M',    color: '#6d28d9', unit: '%' },
      { sym: 'KR10Y',  label: '한국 10Y',   color: '#4f46e5', unit: '%' },
    ],
  },
  {
    label: '🛢️ 원자재 · 공포 · 달러',
    items: [
      { sym: 'WTI',    label: 'WTI 유가',   color: '#16a34a' },
      { sym: 'BRENT',  label: '브렌트유',    color: '#15803d' },
      { sym: 'GOLD',   label: '금',         color: '#d97706' },
      { sym: 'SILVER', label: '은',         color: '#94a3b8' },
      { sym: 'COPPER', label: '구리',        color: '#b45309' },
      { sym: 'VIX',    label: 'VIX 공포',   color: '#dc2626' },
      { sym: 'DXY',    label: '달러인덱스',  color: '#0284c7' },
    ],
  },
]

function GlobalGroup({ group, globalData, loading, onChartClick }) {
  return (
    <div className="db-global-group">
      <div className="db-global-group-label">{group.label}</div>
      <div className="db-global-grid">
        {group.items.map(g => {
          const data = globalData?.[g.sym]
          const pc   = data ? rateColor(data.changeRate) : '#94a3b8'
          return (
            <div key={g.sym} className="db-global-card" style={{ '--gc': g.color }}
              onClick={() => data && onChartClick({ type: 'global', sym: g.sym, label: g.label, color: g.color, price: data.price, changeRate: data.changeRate })}>
              <div className="db-global-label-row">
                <span className="db-global-label" style={{ color: g.color }}>{g.label}</span>
                <InfoTooltip sym={g.sym}/>
              </div>
              {loading && <Skeleton h={20} r={4} mb={4}/>}
              {!loading && data && (
                <>
                  <div className="db-global-price" style={{ color: pc }}>
                    {data.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}{g.unit || ''}
                  </div>
                  <div className="db-global-change" style={{ color: pc }}>
                    {data.changeRate >= 0 ? '+' : ''}{data.changeRate?.toFixed(2)}%
                    {data.marketState && data.marketState !== 'REGULAR' && (
                      <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: 3 }}>
                        {data.marketState === 'POST' ? '시간외' : data.marketState === 'PRE' ? '프리' : ''}
                      </span>
                    )}
                  </div>
                </>
              )}
              {!loading && !data && <div className="db-global-na">—</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 환율 섹션 ─────────────────────────────────────────
const FOREX_META = [
  { key: 'USD', label: 'USD/KRW', desc: '원달러',   symbol: '₩', color: '#2563eb' },
  { key: 'JPY', label: 'JPY/KRW', desc: '원엔(100엔)', symbol: '₩', color: '#dc2626' },
  { key: 'CNY', label: 'CNY/KRW', desc: '원위안',   symbol: '₩', color: '#d97706' },
  { key: 'EUR', label: 'EUR/KRW', desc: '원유로',   symbol: '₩', color: '#7c3aed' },
]

function ForexSection({ forexData, loading, onForexMultiClick, onChartClick }) {
  if (loading) return (
    <div className="db-forex-row">
      {FOREX_META.map((_, i) => <div key={i} className="db-forex-card"><Skeleton h={72}/></div>)}
    </div>
  )
  return (
    <div className="db-forex-row">
      {FOREX_META.map(item => {
        const d = forexData?.[item.key]
        if (!d) return (
          <div key={item.key} className="db-forex-card">
            <span className="db-forex-label">{item.label}</span>
            <span className="db-global-na">—</span>
          </div>
        )
        const up = d.changeRate >= 0
        const vals = (d.candles || []).map(c => c.close).filter(Boolean).slice(-20)
        return (
          <div key={item.key} className="db-forex-card"
            onClick={() => onChartClick({ type: 'forex', pair: item.key, label: item.label, price: d.price, changeRate: d.changeRate })}>
            <div className="db-forex-left">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="db-forex-label">{item.label}</span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>({item.desc})</span>
              </div>
              <span className="db-forex-value">{item.symbol}{d.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              <span className="db-forex-change" style={{ color: up ? '#ef4444' : '#3b82f6' }}>
                {up ? '▲' : '▼'} {Math.abs(d.changeRate).toFixed(2)}%
              </span>
              <span className="db-forex-hint">차트 →</span>
            </div>
            {vals.length >= 2 && <Sparkline values={vals} color={up ? '#d97706' : '#94a3b8'}/>}
          </div>
        )
      })}
      <div className="db-forex-card db-forex-multi" onClick={onForexMultiClick}
        style={{ cursor: 'pointer', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: '20px' }}>📊</span>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>환율 비교</span>
        <span style={{ fontSize: '10px', color: '#64748b' }}>한국은행 스타일</span>
      </div>
    </div>
  )
}

// ── 환율 다중 라인 차트 모달 ─────────────────────────
const FOREX_COLORS = { USD: '#3b82f6', JPY: '#ef4444', CNY: '#f59e0b', EUR: '#8b5cf6' }

function ForexMultiChartModal({ forexData, onClose }) {
  const [range, setRange] = useState('3mo')
  const [data,  setData]  = useState(forexData || {})
  const [loading, setLoading] = useState(false)

  const fetchData = async (r) => {
    setLoading(true)
    try {
      const j = await fetch(`/api/kis?type=forex-krw&range=${r}`).then(res => res.json())
      setData(j)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData(range) }, [range])
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const PERIODS = [
    { v: '1mo', l: '1개월' }, { v: '3mo', l: '3개월' },
    { v: '6mo', l: '6개월' }, { v: '1y', l: '1년' }, { v: '5y', l: '5년' },
  ]

  const renderChart = () => {
    const keys = Object.keys(data).filter(k => data[k]?.candles?.length > 1)
    if (!keys.length) return <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>데이터 없음</div>

    const W = Math.min(window.innerWidth - 64, 900)
    const H = 320, pL = 72, pR = 16, pT = 16, pB = 36
    const cW = W - pL - pR, cH = H - pT - pB

    // 각 통화별 정규화 (첫 값 = 100 기준) for multi-line
    const normalized = {}
    keys.forEach(k => {
      const vals = data[k].candles.map(c => c.close).filter(v => v > 0)
      const base = vals[0] || 1
      normalized[k] = vals.map(v => (v / base) * 100)
    })

    // 모든 날짜 합집합
    const allDates = [...new Set(keys.flatMap(k => data[k].candles.map(c => c.date)))].sort()
    const n = allDates.length

    const py = v => pT + cH - ((v - 90) / 20) * cH  // 90~110 범위
    const px = i => pL + (i / (n - 1 || 1)) * cW

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', background: '#0f172a', borderRadius: 8 }}>
        {/* 그리드 */}
        {[90, 95, 100, 105, 110].map(v => (
          <g key={v}>
            <line x1={pL} x2={pL+cW} y1={py(v)} y2={py(v)} stroke="#1e293b" strokeDasharray="3,3"/>
            <text x={pL-4} y={py(v)+4} textAnchor="end" fontSize="9" fill="#475569">{v}%</text>
          </g>
        ))}
        {/* 기준선 */}
        <line x1={pL} x2={pL+cW} y1={py(100)} y2={py(100)} stroke="#334155" strokeWidth="1"/>
        {/* 라인 */}
        {keys.map(k => {
          const vals  = normalized[k]
          const dates = data[k].candles.map(c => c.date)
          const pts   = dates.map((d, i) => {
            const xi = allDates.indexOf(d)
            return `${px(xi)},${py(Math.max(85, Math.min(115, vals[i])))}`
          }).join(' ')
          return <polyline key={k} points={pts} fill="none" stroke={FOREX_COLORS[k]} strokeWidth="1.8" strokeLinejoin="round"/>
        })}
        {/* X축 날짜 */}
        {allDates.filter((_, i) => i % Math.max(1, Math.floor(n/6)) === 0).map((d, i) => (
          <text key={i} x={px(allDates.indexOf(d))} y={H-8} textAnchor="middle" fontSize="9" fill="#475569">
            {d.slice(0,4)}/{d.slice(4,6)}
          </text>
        ))}
        {/* 실제 가격 레이블 (우측) */}
        {keys.map((k, i) => {
          const last = data[k].candles[data[k].candles.length-1]?.close
          const meta = FOREX_META.find(m => m.key === k)
          return (
            <text key={k} x={pL+cW+4} y={pT + 14 + i*16} fontSize="9" fill={FOREX_COLORS[k]}>
              {meta?.label}: {last?.toLocaleString(undefined, {maximumFractionDigits:2})}
            </text>
          )
        })}
      </svg>
    )
  }

  return (
    <div className="chart-modal-overlay" onClick={onClose}>
      <div className="chart-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 960 }}>
        <div className="chart-modal-header">
          <div className="chart-modal-title">
            <span className="chart-modal-name">📊 원화 환율 비교 (정규화 100 기준)</span>
          </div>
          <div className="chart-modal-actions">
            <div className="chart-period-tabs">
              {PERIODS.map(p => (
                <button key={p.v} className={`chart-period-btn ${range === p.v ? 'active' : ''}`}
                  onClick={() => setRange(p.v)}>{p.l}</button>
              ))}
            </div>
            <button className="chart-modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="chart-modal-body">
          {loading
            ? <div className="chart-loading"><div className="spinner-lg"/>로딩 중...</div>
            : renderChart()
          }
        </div>
        {/* 범례 */}
        <div style={{ display:'flex', gap:16, padding:'12px 20px', borderTop:'1px solid #1e293b' }}>
          {FOREX_META.map(m => (
            <div key={m.key} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:24, height:3, background: FOREX_COLORS[m.key], borderRadius:2 }}/>
              <span style={{ fontSize:11, color:'#94a3b8' }}>{m.label}</span>
              {forexData?.[m.key] && (
                <span style={{ fontSize:11, color: forexData[m.key].changeRate >= 0 ? '#ef4444' : '#3b82f6' }}>
                  {forexData[m.key].changeRate >= 0 ? '+' : ''}{forexData[m.key].changeRate?.toFixed(2)}%
                </span>
              )}
            </div>
          ))}
          <span style={{ fontSize:10, color:'#475569', marginLeft:'auto' }}>* 기간 시작 = 100 정규화</span>
        </div>
      </div>
    </div>
  )
}

// ── 테마 설정 모달 ────────────────────────────────────
function ThemeSettingModal({ activeIds, onChange, onClose }) {
  const [sel, setSel] = useState(new Set(activeIds))
  const toggle = id => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  return (
    <div className="db-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="db-setting-modal">
        <div className="db-setting-header">
          <span>테마 설정</span>
          <button className="db-setting-close" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '12px' }}>노출할 테마를 선택하세요</p>
        <div className="db-theme-check-grid">
          {ALL_THEMES.map(t => (
            <label key={t.id} className={`db-theme-check-item ${sel.has(t.id) ? 'checked' : ''}`} style={{ '--tc': t.color }}>
              <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} style={{ display: 'none' }}/>
              <span className="db-theme-check-emoji">{t.emoji}</span>
              <span className="db-theme-check-label">{t.label}</span>
              {sel.has(t.id) && <span className="db-theme-check-mark">✓</span>}
            </label>
          ))}
        </div>
        <div className="db-setting-footer">
          <button className="btn-outline" onClick={onClose}>취소</button>
          <button className="btn-ai" onClick={() => { onChange([...sel]); onClose() }}>저장</button>
        </div>
      </div>
    </div>
  )
}

// ── AI 브리핑 카드 ────────────────────────────────────
function AiBriefingCard() {
  const [briefing, setBriefing] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_BRIEFING)
      if (!raw) return null
      const { data, date } = JSON.parse(raw)
      return date === new Date().toISOString().slice(0,10) ? data : null
    } catch { return null }
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [open,    setOpen]    = useState(!!briefing)

  const run = async () => {
    const key = import.meta.env.VITE_CLAUDE_API_KEY
    if (!key) { setError('Claude API 키 미설정'); return }
    setLoading(true); setError('')
    try {
      const today = new Date().toLocaleDateString('ko-KR')
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 800,
          tools: [{ type:'web_search_20250305', name:'web_search' }],
          messages: [{ role:'user', content:
            `오늘(${today}) 한국 주식시장 AI 브리핑. 웹 검색으로 최신 뉴스를 찾아서 작성해.
## 📊 오늘의 시장 요약 ## 🔑 핵심 이슈 (3가지) ## 🌏 글로벌 변수 ## 🎯 오늘 주목할 섹터 ## ⚠️ 리스크
간결하게 핵심만.` }],
        }),
      })
      const data = await res.json()
      const text = data.content?.filter(b => b.type==='text').map(b => b.text).join('\n') || ''
      if (!text) throw new Error('응답 없음')
      setBriefing(text); setOpen(true)
      localStorage.setItem(LS_BRIEFING, JSON.stringify({ data:text, date:new Date().toISOString().slice(0,10) }))
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <section className="dash-section db-briefing-section">
      <div className="db-section-header">
        <span className="db-section-label">🤖 AI 시장 브리핑<span className="db-briefing-badge">web_search</span></span>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {briefing && <button className="db-briefing-toggle" onClick={() => setOpen(v=>!v)}>{open?'▲ 접기':'▼ 펼치기'}</button>}
          <button className="btn-outline db-briefing-btn" onClick={run} disabled={loading}>
            {loading ? '⟳ 검색 중...' : briefing ? '↺ 다시 분석' : '🔍 오늘 브리핑 생성'}
          </button>
        </div>
      </div>
      {error && <div className="db-briefing-error">⚠️ {error}</div>}
      {loading && <div className="db-briefing-loading"><div className="db-briefing-spinner"/><span>웹에서 오늘 시장 정보 검색 중...</span></div>}
      {briefing && open && !loading && (
        <div className="db-briefing-content">
          <pre className="db-briefing-text">{briefing}</pre>
          <div className="db-briefing-meta">오늘({new Date().toLocaleDateString('ko-KR')}) 자동 저장</div>
        </div>
      )}
      {!briefing && !loading && !error && (
        <div className="db-briefing-placeholder">🔍 버튼을 눌러 오늘 시장 브리핑을 생성하세요</div>
      )}
    </section>
  )
}

// ── 메인 ─────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth()

  const [dashData,       setDashData]       = useState(() => lsRead(LS_DASH,   getDashTTL()))
  const [globalData,     setGlobalData]     = useState(() => lsRead(LS_GLOBAL, 300000))
  const [forexData,      setForexData]      = useState(() => lsRead(LS_FOREX,  300000))
  const [sparkData,      setSparkData]      = useState(() => lsRead(LS_SPARK,  3600000) || {})
  const [fetchError,     setFetchError]     = useState(false)
  const [loading,        setLoading]        = useState(() => !lsRead(LS_DASH,  getDashTTL()))
  const [globalLoading,  setGlobalLoading]  = useState(() => !lsRead(LS_GLOBAL, 300000))
  const [forexLoading,   setForexLoading]   = useState(() => !lsRead(LS_FOREX, 300000))
  const [lastFetch,      setLastFetch]      = useState('')
  const [chartItem,      setChartItem]      = useState(null)
  const [showForexMulti, setShowForexMulti] = useState(false)
  const [activeIds,      setActiveIds]      = useState(DEFAULT_ACTIVE_IDS)
  const [activeIdsReady, setActiveIdsReady] = useState(false)
  const [showSetting,    setShowSetting]    = useState(false)

  const timerRef    = useRef(null)
  const globalTimer = useRef(null)
  const forexTimer  = useRef(null)
  const stateCheck  = useRef(null)
  const isFetching  = useRef(false)

  useEffect(() => {
    if (!user?.uid) { setActiveIdsReady(true); return }
    getDoc(doc(db, 'user_prefs', user.uid))
      .then(snap => { if (snap.exists() && snap.data()[THEME_DOC_KEY]) setActiveIds(snap.data()[THEME_DOC_KEY]) })
      .catch(() => {})
      .finally(() => setActiveIdsReady(true))
  }, [user?.uid])

  const visibleThemes = ALL_THEMES.filter(t => activeIds.includes(t.id))

  const getNeededCodes = useCallback(() =>
    visibleThemes.flatMap(t => [
      ...t.etf.slice(0,1).map(e => e.code),
      ...t.stocks.map(s => s.code),
    ])
  , [visibleThemes.map(t => t.id).join(',')])

  const fetchDashboard = useCallback(async (force = false) => {
    if (isFetching.current) return
    if (!force && lsRead(LS_DASH, getDashTTL())) { setLoading(false); return }
    isFetching.current = true
    const codes = getNeededCodes()
    if (!codes.length) { setLoading(false); isFetching.current = false; return }
    try {
      const res = await fetch(`/api/kis?type=dashboard&codes=${codes.join(',')}`).then(r => r.json())
      if (res.error) throw new Error(res.error)
      setDashData(res); lsWrite(LS_DASH, res)
      setLastFetch(getNowTime()); setFetchError(false)
    } catch (e) { console.error('[dashboard]', e); setFetchError(true) }
    finally { setLoading(false); isFetching.current = false }
  }, [getNeededCodes])

  const fetchSpark = useCallback(async () => {
    if (lsRead(LS_SPARK, 3600000)) return
    try {
      const [k, q] = await Promise.all([
        fetch('/api/kis?type=index-chart&market=J&days=20').then(r => r.json()).catch(() => ({})),
        fetch('/api/kis?type=index-chart&market=Q&days=20').then(r => r.json()).catch(() => ({})),
      ])
      const s = { KOSPI: (k.candles||[]).map(c=>c.close), KOSDAQ: (q.candles||[]).map(c=>c.close) }
      setSparkData(s); lsWrite(LS_SPARK, s)
    } catch {}
  }, [])

  const fetchGlobal = useCallback(async (force = false) => {
    if (!force && lsRead(LS_GLOBAL, 300000)) { setGlobalLoading(false); return }
    try {
      const j = await fetch(`/api/kis?type=global-batch&symbols=${BATCH_SYMBOLS.join(',')}`).then(r => r.json())
      setGlobalData(j); lsWrite(LS_GLOBAL, j)
    } catch (e) { console.error('[global]', e) }
    finally { setGlobalLoading(false) }
  }, [])

  const fetchForex = useCallback(async (force = false) => {
    if (!force && lsRead(LS_FOREX, 300000)) { setForexLoading(false); return }
    try {
      const j = await fetch('/api/kis?type=forex-krw&range=1mo').then(r => r.json())
      setForexData(j); lsWrite(LS_FOREX, j)
    } catch (e) { console.error('[forex]', e) }
    finally { setForexLoading(false) }
  }, [])

  useEffect(() => {
    if (!activeIdsReady) return
    fetchDashboard(true); fetchGlobal(true); fetchForex(true); fetchSpark()
    const setupTimers = () => {
      clearInterval(timerRef.current); clearInterval(globalTimer.current); clearInterval(forexTimer.current)
      timerRef.current    = setInterval(() => fetchDashboard(true), isMarketOpen() ? 30000 : 300000)
      globalTimer.current = setInterval(() => fetchGlobal(true),    isUSMarketOpen() ? 60000 : 300000)
      forexTimer.current  = setInterval(() => fetchForex(true),     300000)
    }
    setupTimers()
    stateCheck.current = setInterval(setupTimers, 60000)
    return () => {
      clearInterval(timerRef.current); clearInterval(globalTimer.current)
      clearInterval(forexTimer.current); clearInterval(stateCheck.current)
    }
  }, [activeIdsReady, fetchDashboard, fetchGlobal, fetchForex, fetchSpark])

  const handleThemeChange = async ids => {
    setActiveIds(ids)
    if (user?.uid) setDoc(doc(db, 'user_prefs', user.uid), { [THEME_DOC_KEY]: ids }, { merge: true }).catch(() => {})
    localStorage.removeItem(LS_DASH)
    setTimeout(() => fetchDashboard(true), 100)
  }

  const kstStatus = getKstStatus()
  const isOpen    = kstStatus === 'open'
  const isAfter   = kstStatus === 'after'

  const stMap = {
    open:      { label: '정규장 운영중', color: '#16a34a', dot: true  },
    premarket: { label: '장 시작 전',   color: '#d97706', dot: false },
    after:     { label: '시간외 거래',  color: '#7c3aed', dot: true  },
    holiday:   { label: '휴장일',       color: '#64748b', dot: false },
    closed:    { label: '장 마감',      color: '#64748b', dot: false },
  }
  const st = stMap[kstStatus] || stMap.closed
  const priceMap = {}
  dashData?.prices?.forEach(p => { if (p?.code) priceMap[p.code] = p })

  // 장단기 스프레드 계산 (US10Y - US2Y)
  const us10y = globalData?.US10Y?.price || 0
  const us2y  = globalData?.US2Y?.price  || 0
  const spread = us10y && us2y ? Math.round((us10y - us2y) * 100) / 100 : null

  const renderChartModal = () => {
    if (!chartItem) return null
    if (chartItem.isStock) return (
      <StockChartModal stock={{ name: chartItem.label, code: chartItem.code }} onClose={() => setChartItem(null)}/>
    )
    if (chartItem.type === 'index') return (
      <GlobalChartModal type="global" symbol={chartItem.sym || 'SP500'} name={chartItem.label}
        currentPrice={chartItem.price} changeRate={chartItem.changeRate} onClose={() => setChartItem(null)}/>
    )
    return (
      <GlobalChartModal
        type={chartItem.type === 'forex' ? 'forex' : 'global'}
        symbol={chartItem.type === 'forex' ? chartItem.pair : chartItem.sym}
        name={chartItem.label} currentPrice={chartItem.price} changeRate={chartItem.changeRate}
        onClose={() => setChartItem(null)}
      />
    )
  }

  return (
    <div className="dashboard">
      {/* 헤더 */}
      <div className="dash-header">
        <div className="dash-header-row">
          <div>
            <h1 className="dash-title">시장 대시보드</h1>
            <p className="dash-date">
              {getTodayStr()}
              {lastFetch && <span style={{ color: '#94a3b8' }}> · {lastFetch} 기준</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="db-status-badge" style={{ background: st.color + '18', color: st.color, borderColor: st.color + '40' }}>
              {st.dot && <span className="db-status-dot" style={{ background: st.color }}/>}
              {st.label}
            </div>
            <button className="btn-outline db-refresh-btn"
              onClick={() => {
                localStorage.removeItem(LS_DASH); localStorage.removeItem(LS_GLOBAL); localStorage.removeItem(LS_FOREX)
                fetchDashboard(true); fetchGlobal(true); fetchForex(true)
              }} disabled={loading}>⟳</button>
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="db-error-banner">
          ⚠️ 데이터 로드 실패
          <button onClick={() => { setFetchError(false); fetchDashboard(true) }} style={{ marginLeft:12, fontSize:11, color:'#3b82f6', background:'none', border:'none', cursor:'pointer' }}>↺ 재시도</button>
        </div>
      )}

      {/* ① 국내 시장 */}
      <section className="dash-section">
        <div className="db-section-header">
          <span className="db-section-label">
            🇰🇷 국내 시장
            {isOpen && <span className="db-live-badge"> ● LIVE</span>}
            {isAfter && <span className="db-after-badge"> ⏱ 시간외</span>}
            {!isOpen && !isAfter && <span className="db-closed-note"> 전일 마감 기준</span>}
          </span>
          <span className="db-section-note">{isOpen ? 'KIS · 30초 갱신' : 'KIS · 5분 갱신'}</span>
        </div>
        <div className="db-index-grid">
          <IndexCard data={dashData?.kospi}  loading={loading} color="#2563eb" label="KOSPI"  sym="KOSPI"  sparkData={sparkData.KOSPI}  onChartClick={setChartItem}/>
          <IndexCard data={dashData?.kosdaq} loading={loading} color="#16a34a" label="KOSDAQ" sym="KOSDAQ" sparkData={sparkData.KOSDAQ} onChartClick={setChartItem}/>
        </div>
      </section>

      {/* ② 환율 */}
      <section className="dash-section">
        <div className="db-section-header">
          <span className="db-section-label">💱 환율 (원화 기준)</span>
          <span className="db-section-note">Yahoo Finance · 5분 갱신</span>
        </div>
        <ForexSection
          forexData={forexData}
          loading={forexLoading}
          onForexMultiClick={() => setShowForexMulti(true)}
          onChartClick={setChartItem}
        />
      </section>

      {/* ③ 해외 지수 + 채권 + 원자재 */}
      <section className="dash-section">
        <div className="db-section-header">
          <span className="db-section-label">🌐 글로벌 시장</span>
          <span className="db-section-note">
            {isUSMarketOpen() ? '미장 운영중 · 60초 갱신' : 'Yahoo Finance · 5분 갱신'}
          </span>
        </div>

        {/* 장단기 스프레드 배너 */}
        {spread !== null && (
          <div className="db-spread-banner" style={{ borderColor: spread < 0 ? '#ef4444' : '#16a34a' }}>
            <span>📊 장단기 스프레드 (10Y-3M): </span>
            <span style={{ fontWeight: 700, color: spread < 0 ? '#ef4444' : '#22c55e' }}>
              {spread > 0 ? '+' : ''}{spread}%
            </span>
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>
              {spread < 0 ? '⚠️ 역전 — 경기침체 선행 신호' : spread < 0.5 ? '⚡ 역전 해소 중' : '✅ 정상'}
            </span>
            <InfoTooltip sym="US2Y"/>
          </div>
        )}

        {GLOBAL_GROUPS.map(group => (
          <GlobalGroup key={group.label} group={group} globalData={globalData} loading={globalLoading} onChartClick={setChartItem}/>
        ))}
        {isUSMarketOpen() && <div className="db-us-live">🇺🇸 미국 시장 운영중 · 해외지수 60초 자동 갱신</div>}
      </section>

      {/* ④ 테마 현황 */}
      <section className="dash-section">
        <div className="db-section-header">
          <span className="db-section-label">
            📌 테마 현황
            {isOpen && <span className="db-live-badge"> ● LIVE</span>}
            {isAfter && <span className="db-after-badge"> ⏱ 시간외</span>}
            {!isOpen && !isAfter && <span className="db-closed-note"> 전일 마감 기준</span>}
          </span>
          <button className="btn-outline db-theme-setting-btn" onClick={() => setShowSetting(true)}>⚙️ 테마 설정</button>
        </div>
        {loading ? (
          <div className="db-theme-grid">
            {visibleThemes.map(t => (
              <div key={t.id} className="db-theme-card" style={{ '--tc': t.color }}>
                <div className="db-theme-card-header">
                  <span className="db-theme-emoji">{t.emoji}</span>
                  <span className="db-theme-label" style={{ color: t.color }}>{t.label}</span>
                </div>
                <Skeleton h={32} r={6} mb={8}/>
                {[1,2,3].map(i => <Skeleton key={i} h={24} r={4} mb={4}/>)}
              </div>
            ))}
          </div>
        ) : (
          <div className="db-theme-grid">
            {visibleThemes.map(t => {
              const topEtf = t.etf.sort((a,b) => b.cap - a.cap)[0]
              const ep = priceMap[topEtf?.code]
              return (
                <div key={t.id} className="db-theme-card" style={{ '--tc': t.color }}>
                  <div className="db-theme-card-header">
                    <span className="db-theme-emoji">{t.emoji}</span>
                    <span className="db-theme-label" style={{ color: t.color }}>{t.label}</span>
                  </div>
                  {topEtf && (
                    <button className="db-etf-chip" onClick={() => setChartItem({ isStock: true, code: topEtf.code, label: topEtf.name })}>
                      <span className="db-etf-badge">ETF</span>
                      <span className="db-etf-name">{topEtf.name}</span>
                      {ep?.price > 0
                        ? <span className="db-etf-price" style={{ color: rateColor(ep.changeRate) }}>
                            {fmt(ep.price)} <span style={{ fontSize:'10px' }}>({fmtRate(ep.changeRate)})</span>
                          </span>
                        : <span className="db-etf-price" style={{ color: '#94a3b8' }}>—</span>}
                    </button>
                  )}
                  <div className="db-theme-stocks">
                    {t.stocks.map(s => {
                      const p = priceMap[s.code]
                      return (
                        <button key={s.code} className="db-stock-chip"
                          style={p?.price>0 ? { borderLeftColor: rateColor(p.changeRate) } : {}}
                          onClick={() => setChartItem({ isStock: true, code: s.code, label: s.name })}>
                          <span className="db-stock-name">{s.name}</span>
                          {p?.price > 0
                            ? <span className="db-stock-price">
                                <span style={{ color: rateColor(p.changeRate), fontWeight:700 }}>{fmt(p.price)}</span>
                                <span style={{ color: rateColor(p.changeRate), fontSize:'10px', marginLeft:3 }}>
                                  {(p.changeRate>=0?'+':'')}{fmtRate(p.changeRate)}
                                </span>
                              </span>
                            : <span style={{ color:'#94a3b8', fontSize:'11px' }}>—</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <AiBriefingCard/>

      <div className="dash-footer-note">
        ✅ KIS API · {isOpen ? '장중 30초' : isAfter ? '시간외 2분' : '장외 5분'} 자동 갱신
        · 해외지수 {isUSMarketOpen() ? '미장 운영중 60초' : '5분'} 갱신
      </div>

      {showSetting && <ThemeSettingModal activeIds={activeIds} onChange={handleThemeChange} onClose={() => setShowSetting(false)}/>}
      {showForexMulti && <ForexMultiChartModal forexData={forexData} onClose={() => setShowForexMulti(false)}/>}
      {renderChartModal()}
    </div>
  )
}
