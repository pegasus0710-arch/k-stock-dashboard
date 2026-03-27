import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../firebase'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import StockChartModal from '../components/StockChartModal'
import GlobalChartModal from '../components/GlobalChartModal'
import { fmt, fmtChange, rateColor, getTodayStr, getNowTime, getKstStatus, isMarketOpen, isUSMarketOpen, getDashTTL } from '../utils/format'
import './DashboardPage.css'

// ── 캐시 키 ──────────────────────────────────────────
const LS_DASH     = 'db_cache_v3'
const LS_BRIEFING = 'db_briefing_v1'
const LS_GLOBAL   = 'db_global_v4'
const LS_FOREX    = 'db_forex_krw_v1'

const BATCH_SYMBOLS = ['SP500','NASDAQ','DOW','N225','HSI','SSE','TWI','DAX','US10Y','US2Y','KR10Y','WTI','BRENT','GOLD','SILVER','COPPER','VIX','DXY']

// ══════════════════════════════════════════════════════
// 섹터 그룹 정의 (색상 + 지수 목록)
// ══════════════════════════════════════════════════════
const SECTOR_GROUPS = [
  {
    id: 'domestic', label: '🇰🇷 국내', accent: '#2563eb',
    items: [
      { id:'KOSPI',  label:'KOSPI',  type:'dash', field:'kospi'  },
      { id:'KOSDAQ', label:'KOSDAQ', type:'dash', field:'kosdaq' },
    ]
  },
  {
    id: 'global', label: '🌍 해외 지수', accent: '#475569',
    items: [
      { id:'SP500',  label:'S&P 500',   type:'global', sym:'SP500'  },
      { id:'NASDAQ', label:'NASDAQ',    type:'global', sym:'NASDAQ' },
      { id:'DOW',    label:'DOW',       type:'global', sym:'DOW'    },
      { id:'N225',   label:'닛케이',    type:'global', sym:'N225'   },
      { id:'HSI',    label:'항셍',      type:'global', sym:'HSI'    },
      { id:'SSE',    label:'상해',      type:'global', sym:'SSE'    },
      { id:'TWI',    label:'대만가권',  type:'global', sym:'TWI'    },
      { id:'DAX',    label:'DAX',       type:'global', sym:'DAX'    },
    ]
  },
  {
    id: 'bond', label: '📈 채권·금리', accent: '#7c3aed',
    items: [
      { id:'US10Y', label:'미국 10Y', type:'global', sym:'US10Y', unit:'%' },
      { id:'US2Y',  label:'미국 3M',  type:'global', sym:'US2Y',  unit:'%' },
      { id:'KR10Y', label:'한국 10Y', type:'global', sym:'KR10Y', unit:'%' },
    ]
  },
  {
    id: 'commodity', label: '🛢️ 원자재', accent: '#16a34a',
    items: [
      { id:'WTI',    label:'WTI',    type:'global', sym:'WTI'    },
      { id:'BRENT',  label:'브렌트', type:'global', sym:'BRENT'  },
      { id:'GOLD',   label:'금',     type:'global', sym:'GOLD'   },
      { id:'SILVER', label:'은',     type:'global', sym:'SILVER' },
      { id:'COPPER', label:'구리',   type:'global', sym:'COPPER' },
    ]
  },
  {
    id: 'sentiment', label: '⚡ 심리·달러', accent: '#dc2626',
    items: [
      { id:'VIX', label:'VIX',      type:'global', sym:'VIX' },
      { id:'DXY', label:'달러인덱스', type:'global', sym:'DXY' },
    ]
  },
  {
    id: 'forex', label: '💱 환율', accent: '#d97706',
    items: [
      { id:'USD', label:'USD/KRW', type:'forex', pair:'USD' },
      { id:'JPY', label:'JPY/KRW', type:'forex', pair:'JPY' },
      { id:'CNY', label:'CNY/KRW', type:'forex', pair:'CNY' },
      { id:'EUR', label:'EUR/KRW', type:'forex', pair:'EUR' },
    ]
  },
]

// 모든 아이템 flat 목록 (차트 fetch 시 사용)
const ALL_ITEMS = SECTOR_GROUPS.flatMap(g => g.items)

// ══════════════════════════════════════════════════════
// 지수 가이드 (툴팁 대체 팝업)
// ══════════════════════════════════════════════════════
const GUIDE_DATA = {
  KOSPI:  { title:'KOSPI (코스피)', desc:'대한민국 유가증권시장 전체 시가총액 가중평균 지수. 삼성전자·SK하이닉스 등 대형주 비중이 높아 반도체·수출 경기에 민감.', up:'경기 회복·외국인 순매수 → 대형 수출주·성장주 비중 확대', down:'경기 둔화·외국인 이탈 → 방어주(통신·필수소비재)·현금 확대', tip:'📌 PBR 1배(약 2,400) = 역사적 바닥 근처. 2,500↑ 강세 / 2,000↓ 약세 경계' },
  KOSDAQ: { title:'KOSDAQ (코스닥)', desc:'중소·벤처·기술 성장기업 지수. 바이오·게임·2차전지 비중이 높아 KOSPI보다 변동성 크고 금리에 더 민감.', up:'금리 하락·성장주 선호 → 바이오·IT·2차전지 종목 관심', down:'금리 상승·위험회피 → 변동성 크므로 비중 축소 또는 ETF로 분산', tip:'📌 900↑ 강세 / 700↓ 약세 / KOSPI 대비 상대강도 확인 중요' },
  SP500:  { title:'S&P 500', desc:'미국 대형주 500개사 시가총액 가중지수. 전 세계 주식시장 40% 이상을 차지해 글로벌 위험선호의 바로미터.', up:'글로벌 위험선호 확대 → 국내 외국인 매수 유입, 성장주 긍정', down:'글로벌 위험회피 → 외국인 이탈, 원화 약세 압력. 방어주·현금 확보', tip:'📌 200일 이동평균 위=상승추세 / 아래=하락추세. VIX와 함께 필수 확인' },
  NASDAQ: { title:'NASDAQ Composite', desc:'미국 기술주·성장주 중심. 엔비디아·애플·MS·구글 등 AI·반도체 비중이 높아 금리 변화에 매우 민감.', up:'금리 하락·AI 투자 확대 → 국내 반도체·AI 관련주 동반 상승 기대', down:'금리 상승·성장주 밸류 부담 → 국내 IT·게임주 동반 약세 경계', tip:'📌 NASDAQ/S&P 비율 상승=성장주 선호 국면. 하락 시 가치주 전환 신호' },
  DOW:    { title:'DOW Jones 산업평균', desc:'미국 30개 우량 산업주 단순평균. 전통 제조업·금융·에너지 비중이 높아 경기 민감도 대표.', up:'전통 산업·경기 회복 신호 → 원자재·소재·금융 관련 종목 긍정', down:'경기 침체 우려 → 필수소비재·헬스케어 등 방어 섹터로 이동 검토', tip:'📌 S&P500과 동반 하락 시 본격 약세장. 둘의 괴리가 크면 섹터 로테이션 신호' },
  N225:   { title:'닛케이 225', desc:'일본 225개 대표 종목. 엔화 환율과 역상관 — 엔 약세 시 수출주 수혜로 상승하는 경향.', up:'엔 약세·일본 수출 호조 → 원/엔 환율 하락(원화 강세) 가능성', down:'엔 강세·일본 내수 위축 → 엔화 강세 전환 시 환전 비용 증가', tip:'📌 35,000↑ 강세장. 엔/달러 150↑ = 지나친 엔저, BOJ 개입 주의' },
  HSI:    { title:'항셍지수 (홍콩)', desc:'홍콩 대형주 지수. 알리바바·텐센트 등 중국 빅테크 비중이 높아 중국 정책·규제 리스크에 민감.', up:'중국 부양·규제 완화 → 중국 소비·IT 관련주 긍정', down:'중국 부동산 위기·규제 강화·미중 갈등 → 글로벌 신흥국 리스크 전반 부정', tip:'📌 20,000↑ 회복 시 중국 경기 반등 신호. 미중 관계 지표와 함께 관찰' },
  SSE:    { title:'상해종합지수 (중국)', desc:'중국 상하이 전체 상장종목 지수. 세계 2위 경제의 내수·제조업 경기 반영.', up:'중국 내수 확대·수출 회복 → 화학·철강·뷰티 대중 수출주 긍정', down:'중국 경기 둔화 → 대중 수출 비중 높은 섹터 전반 약세 경계', tip:'📌 3,000↑ 안정 / 2,800↓ 부양책 기대. 중국 PMI 지표와 함께 확인' },
  TWI:    { title:'대만가권지수 (TAIEX)', desc:'TSMC 비중 40% 이상으로 글로벌 반도체 수요의 선행지표. 삼성전자·SK하이닉스와 높은 상관관계.', up:'글로벌 반도체 수요 증가·AI 투자 확대 → 국내 반도체·장비·소재주 강세 기대', down:'반도체 업황 둔화 → 국내 반도체 섹터 약세 선행 신호로 활용', tip:'📌 TSMC 주가와 삼성전자는 3~6개월 선행/후행 관계. 반드시 함께 확인' },
  DAX:    { title:'DAX 40 (독일)', desc:'독일 40개 대형주. 자동차(BMW·폴크스바겐)·산업재·화학 비중이 높아 유럽 제조업 경기 대표.', up:'유럽 경기 회복·에너지 안정 → 국내 자동차·부품 수출주 긍정', down:'에너지 위기·러시아 리스크·유럽 경기 둔화 → 글로벌 제조업 전반 부정', tip:'📌 유로/달러 환율과 함께 확인. 유로 강세=DAX 수출주 부담' },
  US10Y:  { title:'미국 10년 국채 금리', desc:'전 세계 모든 자산의 기준금리. 주식 밸류에이션(PER)에 직접 영향. "무위험 수익률"이 높아지면 주식 매력 감소.', up:'금리 상승 → 성장주·바이오·IT 하락 압력. 고PER 종목 매도, 금융·가치주 방어', down:'금리 하락 → 성장주 재평가. 바이오·2차전지·게임 등 고PER 섹터 긍정', tip:'📌 4.5%↑=성장주 위험 / 3.5%↓=성장주 환경 개선 / 5%↑=전면 하락 압력' },
  US2Y:   { title:'미국 단기금리 (3M)', desc:'연방기준금리와 가장 가깝게 움직이는 단기 국채. 현재 통화정책 방향을 실시간 반영.', up:'연준 긴축 지속·금리 인하 기대 후퇴 → 주식 전반 하락 압력, 달러 강세', down:'연준 피벗(금리 인하) 기대 → 주식·신흥국·원자재 긍정', tip:'📌 10Y-3M 스프레드 역전(음수)=경기침체 확률 급상승. 현재 스프레드 주시' },
  KR10Y:  { title:'한국 10년 국채 금리', desc:'국내 기준금리·경기 전망·외국인 채권 투자를 반영. 미국 10년물과 연동되며 원화 환율에도 영향.', up:'한미 금리차 축소·국내 인플레 우려 → 외국인 채권 이탈 가능, 원화 약세', down:'한국은행 금리 인하 기대 → 부동산·리츠·금융주 긍정', tip:'📌 한미 금리차 -1.5%p 이상 역전=외국인 이탈·원화 약세 위험 확대' },
  WTI:    { title:'WTI 원유 (미국산)', desc:'서부텍사스중질유. 인플레이션 및 물류비용에 직접 영향. 연준 통화정책 변수.', up:'인플레 재부상 → 연준 금리 인하 지연 → 성장주 부담. 에너지·화학주 긍정', down:'글로벌 경기 둔화 수요 감소 신호. 인플레 완화 → 금리 인하 기대 상승', tip:'📌 $80↑=인플레 경계 / $60↓=경기 침체 우려 / $100↑=에너지 위기' },
  BRENT:  { title:'브렌트유 (국제 기준)', desc:'북해산 원유로 국제 원유 가격의 실질적 기준(전 세계 거래량의 60% 기준). 정유사·항공·해운 비용에 직접 영향.', up:'정유·화학 마진 상승. 항공·해운 비용 증가 → 해당 업종 수익성 악화', down:'항공·해운·물류 업종 수혜. 무역수지 개선 → 원화 강세 압력', tip:'📌 WTI 대비 $3~5 프리미엄이 정상. 괴리가 크면 공급 이슈 신호' },
  GOLD:   { title:'금 (Gold)', desc:'대표적 안전자산. 달러 가치와 역상관. 인플레·지정학 리스크·금리 하락기에 강세.', up:'안전자산 선호·달러 약세·인플레 우려 → 리스크 자산 경계. 방어적 포지션 고려', down:'달러 강세·실질금리 상승 → 금 약세. 위험자산 선호 복귀 신호일 수 있음', tip:'📌 $2,000↑=불안 상존 / $2,500↑=위기 대비 수요 급증. 금/구리 비율로 심리 확인' },
  SILVER: { title:'은 (Silver)', desc:'산업용(전기차·태양광·전자) + 귀금속 이중 성격. 금보다 변동성 크고 경기에 더 민감.', up:'산업 수요 확대(전기차·태양광) + 안전자산 수요 → 신재생에너지 섹터 긍정', down:'산업 수요 둔화 → 경기 침체 선행. 금 대비 은 약세=경기 비관론 확대', tip:'📌 금/은 비율 80↑=은이 상대적 저평가. 비율 복귀 시 은 강세 기대' },
  COPPER: { title:'구리 (닥터 쿠퍼)', desc:'건설·전자·자동차·전력 전방위 사용. 경기 실물 수요를 가장 잘 반영해 "닥터 쿠퍼"라 불림.', up:'글로벌 제조업 회복·중국 인프라 투자 → 소재·산업재·신흥국 주식 긍정', down:'글로벌 제조업 둔화·중국 수요 감소 → 경기침체 선행. 방어주 비중 확대', tip:'📌 구리/금 비율 하락=안전자산 선호 확대=주식 비중 축소 신호로 활용' },
  VIX:    { title:'VIX (공포지수)', desc:'S&P500 옵션 내재변동성. 시장 공포와 불확실성의 실시간 온도계. 주가와 역상관 관계.', up:'시장 공포 확대 → VIX 30↑ 시 역발상 매수 기회 탐색. 단기 하락 피크 근처 가능', down:'시장 안정·낙관 → VIX 15↓ 시 과도한 낙관, 조정 가능성 경계', tip:'📌 15↓ 안정 / 20↑ 불안 / 30↑ 공포(역발상 매수 검토) / 40↑ 패닉. 역사적으로 VIX 30 돌파 후 6~12개월 수익률 플러스 확률 80%+' },
  DXY:    { title:'달러인덱스 (DXY)', desc:'유로·엔·파운드 등 6개 주요 통화 대비 달러 강세 측정 종합지수. 글로벌 자금 흐름의 핵심 변수.', up:'달러 강세 → 신흥국 자금 이탈, 원화 약세, 원자재 하락 압력. 국내 수입물가 상승', down:'달러 약세 → 신흥국·원자재·금 상승. 외국인 국내 증시 유입 증가 기대', tip:'📌 100↑ 달러 강세 / 95↓ 달러 약세. DXY 하락=신흥국 강세 공식이 역사적으로 유효' },
  USD:    { title:'USD/KRW (원달러)', desc:'1달러를 원화로 환산한 가격. 가장 중요한 환율 지표. 수출·수입·외국인 투자에 직접 영향.', up:'원화 약세·달러 강세 → 수출 기업 호재, 수입 물가 상승, 외국인 이탈 압력', down:'원화 강세 → 수출 기업 부담, 수입 물가 하락, 외국인 유입 증가 기대', tip:'📌 1,400↑=외환 위기 경계 / 1,200↓=원화 강세 구간. 외국인 순매수와 역상관' },
  JPY:    { title:'JPY/KRW (원엔, 100엔)', desc:'100엔을 원화로 환산. 한일 무역 경쟁력·일본 여행 비용에 영향. 엔화 동향을 원화로 직관적으로 파악.', up:'엔 강세(원 약세) → 일본 수출 기업 경쟁력 약화, 일본 여행 비용 증가', down:'엔 약세(원 강세) → 국내 수출 기업 대일 경쟁력 강화, 일본 여행 저렴', tip:'📌 엔/달러 150↑=BOJ 개입 경계. 한일 수출 구조 유사 → 엔 약세=원화도 약세 압력' },
  CNY:    { title:'CNY/KRW (원위안)', desc:'1위안을 원화로 환산. 한중 무역 비중이 크므로 위안화 동향은 국내 수출에 직접 영향.', up:'위안 강세 → 중국 수입 능력 향상, 대중 수출 유리', down:'위안 약세 → 중국 수입 감소 압력, 대중 수출 비중 높은 기업 부담', tip:'📌 위안/달러 7.2↑=위안 약세 심화. 미중 무역 갈등 시 위안 약세 가속 경향' },
  EUR:    { title:'EUR/KRW (원유로)', desc:'1유로를 원화로 환산. 유럽 경기와 ECB 통화정책을 간접 반영.', up:'유로 강세 → 유럽 경기 상대적 호조, 대유럽 수출 유리', down:'유로 약세 → 유럽 경기 둔화, 에너지 위기·정치 리스크 반영 가능', tip:'📌 유로/달러 1.10↑=달러 약세 구간. DXY 하락과 함께 원화 강세 압력' },
}

// ── localStorage 헬퍼 ─────────────────────────────────
function lsRead(key, ttl) {
  try { const r=localStorage.getItem(key); if(!r) return null; const {data,ts}=JSON.parse(r); return Date.now()-ts<ttl?data:null } catch { return null }
}
function lsWrite(key, data) {
  try { localStorage.setItem(key, JSON.stringify({data,ts:Date.now()})) } catch {}
}

// ── Skeleton ──────────────────────────────────────────
function Skeleton({ w='100%', h=16, r=4 }) {
  return <div className="db-skeleton" style={{width:w,height:h,borderRadius:r}}/>
}

// ══════════════════════════════════════════════════════
// ① HERO 차트
// ══════════════════════════════════════════════════════
function HeroChart({ selId, onSelChange, dashData, globalData, forexData }) {
  const [range,   setRange]   = useState('3mo')
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(false)

  const PERIODS = [{v:'1mo',l:'1개월'},{v:'3mo',l:'3개월'},{v:'6mo',l:'6개월'},{v:'1y',l:'1년'}]

  const getItem = id => ALL_ITEMS.find(x => x.id === id)

  const fetchChart = useCallback(async (id, rng) => {
    const item = getItem(id)
    if (!item) return
    setLoading(true)
    try {
      let url, raw = []
      if (item.type === 'dash') {
        const days = rng==='1y'?365:rng==='6mo'?180:rng==='3mo'?90:30
        const mkt  = id==='KOSPI'?'J':'Q'
        url = `/api/kis?type=index-chart&market=${mkt}&days=${days}`
        const j = await fetch(url).then(r=>r.json())
        raw = j.candles||[]
      } else if (item.type === 'global') {
        url = `/api/kis?type=global&symbol=${item.sym}&range=${rng}`
        const j = await fetch(url).then(r=>r.json())
        raw = j.candles||[]
      } else {
        url = `/api/kis?type=forex-krw&range=${rng}`
        const j = await fetch(url).then(r=>r.json())
        raw = j[item.pair]?.candles||[]
      }
      setCandles(raw.filter(c=>(c.close||0)>0))
    } catch(e){ console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchChart(selId, range) }, [selId, range])

  // 현재가
  const getCurrent = () => {
    const item = getItem(selId)
    if (!item) return null
    if (item.type==='dash') return dashData?.[item.field]||null
    if (item.type==='global') return globalData?.[item.sym]||null
    if (item.type==='forex') {
      const d = forexData?.[item.pair]
      return d ? {price:d.price, changeRate:d.changeRate, change:d.change} : null
    }
    return null
  }

  const cur    = getCurrent()
  const item   = getItem(selId)
  const group  = SECTOR_GROUPS.find(g=>g.items.some(x=>x.id===selId))
  const accent = group?.accent||'#2563eb'
  const pc     = cur ? rateColor(cur.changeRate) : '#94a3b8'

  // SVG 차트
  const renderLine = () => {
    if (!candles.length) return <div className="db-hero-empty">데이터를 불러오는 중...</div>
    const W=800, H=190, pL=62, pR=16, pT=10, pB=28
    const cW=W-pL-pR, cH=H-pT-pB
    const closes=candles.map(c=>c.close)
    const min=Math.min(...closes)*0.998, max=Math.max(...closes)*1.002, rng=max-min||1
    const py=v=>pT+cH-(v-min)/rng*cH
    const px=i=>pL+(i/(candles.length-1||1))*cW
    const pts=candles.map((c,i)=>`${px(i)},${py(c.close)}`).join(' ')
    const isUp=closes[closes.length-1]>=closes[0]
    const lc=accent
    const step=Math.max(1,Math.floor(candles.length/6))
    const xLabels=candles.filter((_,i)=>i%step===0||i===candles.length-1).slice(0,7).map((c,_i)=>{
      const idx=candles.indexOf(c)
      const d=String(c.date||'')
      return {x:px(idx), lbl:d.length>=8?`${d.slice(4,6)}/${d.slice(6,8)}`:d}
    })
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block'}}>
        <defs>
          <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lc} stopOpacity="0.2"/>
            <stop offset="100%" stopColor={lc} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[0,1,2,3].map(i=>{
          const v=min+rng/(3)*i; const y=py(v)
          return <g key={i}>
            <line x1={pL} x2={pL+cW} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3,4"/>
            <text x={pL-5} y={y+4} textAnchor="end" fontSize="10" fill="#475569">
              {v>1000?Math.round(v).toLocaleString():v.toFixed(2)}
            </text>
          </g>
        })}
        <polygon points={`${pL},${pT+cH} ${pts} ${px(candles.length-1)},${pT+cH}`} fill="url(#hg)"/>
        <polyline points={pts} fill="none" stroke={lc} strokeWidth="1.8"/>
        <circle cx={px(candles.length-1)} cy={py(closes[closes.length-1])} r="4" fill={lc} stroke="#0a0f1a" strokeWidth="2"/>
        {xLabels.map((l,i)=>(
          <text key={i} x={l.x} y={H-6} textAnchor="middle" fontSize="10" fill="#475569">{l.lbl}</text>
        ))}
      </svg>
    )
  }

  return (
    <div className="db-hero-section">
      {/* 상단: 현재가 + 기간 탭 */}
      <div className="db-hero-top-row">
        <div className="db-hero-info">
          <span className="db-hero-sym-label" style={{color:accent}}>{item?.label}</span>
          {cur ? (
            <>
              <span className="db-hero-price">
                {cur.price?.toLocaleString(undefined,{maximumFractionDigits:2})}
                {item?.unit||''}
              </span>
              <span className="db-hero-change" style={{color:pc}}>
                {cur.changeRate>=0?'+':''}{cur.changeRate?.toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="db-hero-price" style={{color:'#475569'}}>—</span>
          )}
        </div>
        <div className="db-hero-periods">
          {PERIODS.map(p=>(
            <button key={p.v} className={`db-period-btn ${range===p.v?'active':''}`}
              onClick={()=>setRange(p.v)}>{p.l}</button>
          ))}
        </div>
      </div>

      {/* 차트 */}
      <div className="db-hero-chart">
        {loading
          ? <div className="db-hero-loading"><div className="db-hero-spinner"/></div>
          : renderLine()
        }
      </div>

      {/* 하단: 섹터 그룹 카드 (클릭으로 차트 변경) */}
      <div className="db-sector-groups">
        {SECTOR_GROUPS.map(group => (
          <div key={group.id} className="db-sector-group"
            style={{'--ga': group.accent}}>
            <div className="db-sector-group-label">{group.label}</div>
            <div className="db-sector-group-cards">
              {group.items.map(item => {
                const d   = item.type==='dash'   ? dashData?.[item.field]
                           : item.type==='global' ? globalData?.[item.sym]
                           : forexData?.[item.pair]
                const rate = d?.changeRate
                const up   = rate > 0
                const pc2  = rate != null ? rateColor(rate) : '#64748b'
                const active = selId === item.id
                return (
                  <button key={item.id}
                    className={`db-idx-card ${active?'active':''}`}
                    onClick={() => onSelChange(item.id)}>
                    <div className="db-idx-name">{item.label}</div>
                    {d?.price != null ? (
                      <>
                        <div className="db-idx-price">
                          {d.price.toLocaleString(undefined,{maximumFractionDigits:2})}{item.unit||''}
                        </div>
                        <div className="db-idx-rate" style={{color:pc2}}>
                          {up?'▲':'▼'}{Math.abs(rate).toFixed(2)}%
                        </div>
                      </>
                    ) : (
                      <div className="db-idx-na">—</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// ② 지수 가이드 팝업
// ══════════════════════════════════════════════════════
const GUIDE_CATS = [
  {id:'domestic',  label:'🇰🇷 국내',    ids:['KOSPI','KOSDAQ']},
  {id:'global',    label:'🌍 해외',      ids:['SP500','NASDAQ','DOW','N225','HSI','SSE','TWI','DAX']},
  {id:'bond',      label:'📈 채권',      ids:['US10Y','US2Y','KR10Y']},
  {id:'commodity', label:'🛢️ 원자재',   ids:['WTI','BRENT','GOLD','SILVER','COPPER']},
  {id:'sentiment', label:'⚡ 심리·달러', ids:['VIX','DXY']},
  {id:'forex',     label:'💱 환율',      ids:['USD','JPY','CNY','EUR']},
]

function GuideModal({ onClose }) {
  const [cat, setCat] = useState('domestic')
  useEffect(()=>{
    const fn=e=>{if(e.key==='Escape')onClose()}
    window.addEventListener('keydown',fn); return()=>window.removeEventListener('keydown',fn)
  },[onClose])

  const ids = GUIDE_CATS.find(c=>c.id===cat)?.ids || []
  return (
    <div className="chart-modal-overlay" onClick={onClose}>
      <div className="db-guide-modal" onClick={e=>e.stopPropagation()}>
        <div className="db-guide-header">
          <span className="db-guide-title">📖 지수 가이드</span>
          <button className="chart-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="db-guide-cats">
          {GUIDE_CATS.map(c=>(
            <button key={c.id} className={`db-guide-cat-btn ${cat===c.id?'active':''}`}
              onClick={()=>setCat(c.id)}>{c.label}</button>
          ))}
        </div>
        <div className="db-guide-list">
          {ids.map(id=>{
            const g = GUIDE_DATA[id]
            if (!g) return null
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

// ══════════════════════════════════════════════════════
// ③ 환율 다중 차트 모달
// ══════════════════════════════════════════════════════
const FOREX_COLORS = {USD:'#3b82f6',JPY:'#ef4444',CNY:'#f59e0b',EUR:'#8b5cf6'}
const FOREX_LABELS = {USD:'USD/KRW',JPY:'JPY/KRW',CNY:'CNY/KRW',EUR:'EUR/KRW'}

function ForexMultiModal({ forexData, onClose }) {
  const [range, setRange] = useState('3mo')
  const [data,  setData]  = useState(forexData||{})
  const [loading, setLoading] = useState(false)
  const PERIODS=[{v:'1mo',l:'1개월'},{v:'3mo',l:'3개월'},{v:'6mo',l:'6개월'},{v:'1y',l:'1년'},{v:'5y',l:'5년'}]
  const fetch_=async r=>{setLoading(true);try{const j=await fetch(`/api/kis?type=forex-krw&range=${r}`).then(res=>res.json());setData(j)}catch{}finally{setLoading(false)}}
  useEffect(()=>{fetch_(range)},[range])
  useEffect(()=>{const fn=e=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn)},[onClose])

  const renderChart=()=>{
    const keys=Object.keys(data).filter(k=>data[k]?.candles?.length>1)
    if(!keys.length) return <div style={{padding:60,textAlign:'center',color:'#64748b'}}>데이터 없음</div>
    const W=Math.min(window.innerWidth-64,900),H=280,pL=60,pR=16,pT=16,pB=28
    const cW=W-pL-pR,cH=H-pT-pB
    const norm={}; keys.forEach(k=>{const v=data[k].candles.map(c=>c.close).filter(x=>x>0);const b=v[0]||1;norm[k]=v.map(x=>(x/b)*100)})
    const allDates=[...new Set(keys.flatMap(k=>data[k].candles.map(c=>c.date)))].sort()
    const n=allDates.length
    const py=v=>pT+cH-((v-90)/20)*cH
    const px=i=>pL+(i/(n-1||1))*cW
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block',background:'#0f172a',borderRadius:8}}>
        {[90,95,100,105,110].map(v=><g key={v}><line x1={pL} x2={pL+cW} y1={py(v)} y2={py(v)} stroke="#1e293b" strokeDasharray="3,3"/><text x={pL-4} y={py(v)+4} textAnchor="end" fontSize="9" fill="#475569">{v}%</text></g>)}
        <line x1={pL} x2={pL+cW} y1={py(100)} y2={py(100)} stroke="#334155" strokeWidth="1"/>
        {keys.map(k=>{const vals=norm[k];const dates=data[k].candles.map(c=>c.date);const pts=dates.map((d,i)=>{const xi=allDates.indexOf(d);return`${px(xi)},${py(Math.max(85,Math.min(115,vals[i])))}`}).join(' ');return<polyline key={k} points={pts} fill="none" stroke={FOREX_COLORS[k]} strokeWidth="2" strokeLinejoin="round"/>})}
        {allDates.filter((_,i)=>i%Math.max(1,Math.floor(n/6))===0).map((d,i)=><text key={i} x={px(allDates.indexOf(d))} y={H-8} textAnchor="middle" fontSize="9" fill="#475569">{d.slice(0,4)}/{d.slice(4,6)}</text>)}
      </svg>
    )
  }
  return (
    <div className="chart-modal-overlay" onClick={onClose}>
      <div className="chart-modal" onClick={e=>e.stopPropagation()} style={{maxWidth:960}}>
        <div className="chart-modal-header">
          <span className="chart-modal-name">📊 원화 환율 비교</span>
          <div className="chart-modal-actions">
            <div className="chart-period-tabs">{PERIODS.map(p=><button key={p.v} className={`chart-period-btn ${range===p.v?'active':''}`} onClick={()=>setRange(p.v)}>{p.l}</button>)}</div>
            <button className="chart-modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="chart-modal-body">{loading?<div className="chart-loading"><div className="spinner-lg"/>로딩 중...</div>:renderChart()}</div>
        <div style={{display:'flex',gap:16,padding:'10px 20px',borderTop:'1px solid #1e293b',flexWrap:'wrap'}}>
          {Object.keys(FOREX_COLORS).map(k=>(
            <div key={k} style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{width:20,height:3,background:FOREX_COLORS[k],borderRadius:2}}/>
              <span style={{fontSize:11,color:'#94a3b8'}}>{FOREX_LABELS[k]}</span>
              {data[k]&&<span style={{fontSize:11,color:data[k].changeRate>=0?'#ef4444':'#3b82f6'}}>{data[k].changeRate>=0?'+':''}{data[k].changeRate?.toFixed(2)}%</span>}
            </div>
          ))}
          <span style={{fontSize:10,color:'#475569',marginLeft:'auto'}}>* 기간 시작=100 정규화</span>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// ④ AI 브리핑
// ══════════════════════════════════════════════════════
function AiBriefing() {
  const [briefing,setBriefing]=useState(()=>{try{const r=localStorage.getItem(LS_BRIEFING);if(!r)return null;const{data,date}=JSON.parse(r);return date===new Date().toISOString().slice(0,10)?data:null}catch{return null}})
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [open,setOpen]=useState(!!briefing)
  const run=async()=>{const key=import.meta.env.VITE_CLAUDE_API_KEY;if(!key){setError('Claude API 키 미설정');return}
    setLoading(true);setError('')
    try{const today=new Date().toLocaleDateString('ko-KR')
      const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:800,tools:[{type:'web_search_20250305',name:'web_search'}],messages:[{role:'user',content:`오늘(${today}) 한국 주식시장 AI 브리핑. 웹 검색으로 최신 뉴스 찾아 작성해.\n## 📊 오늘의 시장 요약 ## 🔑 핵심 이슈 ## 🌏 글로벌 변수 ## 🎯 주목 섹터 ## ⚠️ 리스크 요인`}]})})
      const data=await res.json()
      const text=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')||''
      if(!text) throw new Error('응답 없음')
      setBriefing(text);setOpen(true);localStorage.setItem(LS_BRIEFING,JSON.stringify({data:text,date:new Date().toISOString().slice(0,10)}))
    }catch(e){setError(e.message)}finally{setLoading(false)}
  }
  return (
    <section className="dash-section db-briefing-section">
      <div className="db-section-header">
        <span className="db-section-label">🤖 AI 시장 브리핑 <span className="db-briefing-badge">web_search</span></span>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {briefing&&<button className="db-briefing-toggle" onClick={()=>setOpen(v=>!v)}>{open?'▲ 접기':'▼ 펼치기'}</button>}
          <button className="btn-outline" onClick={run} disabled={loading}>{loading?'⟳ 검색 중...':briefing?'↺ 다시 분석':'🔍 오늘 브리핑 생성'}</button>
        </div>
      </div>
      {error&&<div className="db-briefing-error">⚠️ {error}</div>}
      {loading&&<div className="db-briefing-loading"><div className="db-briefing-spinner"/><span>웹에서 오늘 시장 정보 검색 중...</span></div>}
      {briefing&&open&&!loading&&<div className="db-briefing-content"><pre className="db-briefing-text">{briefing}</pre><div className="db-briefing-meta">오늘({new Date().toLocaleDateString('ko-KR')}) 자동 저장</div></div>}
      {!briefing&&!loading&&!error&&<div className="db-briefing-placeholder">🔍 버튼을 눌러 오늘 시장 브리핑을 생성하세요</div>}
    </section>
  )
}

// ══════════════════════════════════════════════════════
// 메인
// ══════════════════════════════════════════════════════
export default function DashboardPage() {
  const { user } = useAuth()

  const [dashData,       setDashData]       = useState(()=>lsRead(LS_DASH,   getDashTTL()))
  const [globalData,     setGlobalData]     = useState(()=>lsRead(LS_GLOBAL, 300000))
  const [forexData,      setForexData]      = useState(()=>lsRead(LS_FOREX,  300000))
  const [loading,        setLoading]        = useState(()=>!lsRead(LS_DASH,  getDashTTL()))
  const [globalLoading,  setGlobalLoading]  = useState(()=>!lsRead(LS_GLOBAL,300000))
  const [fetchError,     setFetchError]     = useState(false)
  const [lastFetch,      setLastFetch]      = useState('')
  const [selId,          setSelId]          = useState('KOSPI')      // Hero 차트 선택
  const [showGuide,      setShowGuide]      = useState(false)
  const [showForexMulti, setShowForexMulti] = useState(false)
  const [chartItem,      setChartItem]      = useState(null)

  const isFetching = useRef(false)
  const timerRef   = useRef(null)
  const globalRef  = useRef(null)

  const fetchDashboard = useCallback(async (force=false) => {
    if (isFetching.current) return
    if (!force && lsRead(LS_DASH,getDashTTL())) { setLoading(false); return }
    isFetching.current = true
    try {
      const res = await fetch('/api/kis?type=dashboard&codes=').then(r=>r.json())
      if (res.error) throw new Error(res.error)
      setDashData(res); lsWrite(LS_DASH,res)
      setLastFetch(getNowTime()); setFetchError(false)
    } catch(e) { console.error(e); setFetchError(true) }
    finally { setLoading(false); isFetching.current=false }
  }, [])

  const fetchGlobal = useCallback(async (force=false) => {
    if (!force && lsRead(LS_GLOBAL,300000)) { setGlobalLoading(false); return }
    try {
      const j = await fetch(`/api/kis?type=global-batch&symbols=${BATCH_SYMBOLS.join(',')}`).then(r=>r.json())
      setGlobalData(j); lsWrite(LS_GLOBAL,j)
    } catch {} finally { setGlobalLoading(false) }
  }, [])

  const fetchForex = useCallback(async (force=false) => {
    if (!force && lsRead(LS_FOREX,300000)) return
    try {
      const j = await fetch('/api/kis?type=forex-krw&range=1mo').then(r=>r.json())
      setForexData(j); lsWrite(LS_FOREX,j)
    } catch {}
  }, [])

  useEffect(() => {
    fetchDashboard(true); fetchGlobal(true); fetchForex(true)
    timerRef.current  = setInterval(()=>fetchDashboard(true), isMarketOpen()?30000:300000)
    globalRef.current = setInterval(()=>fetchGlobal(true),    isUSMarketOpen()?60000:300000)
    return () => { clearInterval(timerRef.current); clearInterval(globalRef.current) }
  }, [fetchDashboard,fetchGlobal,fetchForex])

  const kstStatus = getKstStatus()
  const isOpen  = kstStatus==='open'
  const isAfter = kstStatus==='after'
  const stMap = {
    open:      {label:'정규장 운영중',color:'#16a34a',dot:true},
    premarket: {label:'장 시작 전',  color:'#d97706',dot:false},
    after:     {label:'시간외 거래', color:'#7c3aed',dot:true},
    holiday:   {label:'휴장일',      color:'#64748b',dot:false},
    closed:    {label:'장 마감',     color:'#64748b',dot:false},
  }
  const st = stMap[kstStatus]||stMap.closed

  return (
    <div className="dashboard">
      {/* 헤더 */}
      <div className="dash-header">
        <div className="dash-header-row">
          <div>
            <h1 className="dash-title">시장 대시보드</h1>
            <p className="dash-date">{getTodayStr()}{lastFetch&&<span style={{color:'#64748b'}}> · {lastFetch} 기준</span>}</p>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <button className="db-guide-btn" onClick={()=>setShowGuide(true)}>📖 지수 가이드</button>
            <div className="db-status-badge" style={{background:st.color+'18',color:st.color,borderColor:st.color+'40'}}>
              {st.dot&&<span className="db-status-dot" style={{background:st.color}}/>}{st.label}
            </div>
            <button className="btn-outline db-refresh-btn"
              onClick={()=>{localStorage.removeItem(LS_DASH);localStorage.removeItem(LS_GLOBAL);localStorage.removeItem(LS_FOREX);fetchDashboard(true);fetchGlobal(true);fetchForex(true)}}
              disabled={loading}>⟳</button>
          </div>
        </div>
      </div>

      {fetchError&&(
        <div className="db-error-banner">⚠️ 데이터 로드 실패
          <button onClick={()=>{setFetchError(false);fetchDashboard(true)}} style={{marginLeft:12,fontSize:11,color:'#3b82f6',background:'none',border:'none',cursor:'pointer'}}>↺ 재시도</button>
        </div>
      )}

      {/* Hero 차트 + 섹터 카드 */}
      <div style={{padding:'16px 24px 0'}}>
        <HeroChart
          selId={selId}
          onSelChange={setSelId}
          dashData={dashData}
          globalData={globalData}
          forexData={forexData}
        />
      </div>

      {/* AI 브리핑 */}
      <AiBriefing/>

      <div className="dash-footer-note">
        ✅ KIS API · {isOpen?'장중 30초':isAfter?'시간외 2분':'장외 5분'} 자동 갱신
        · 해외지수 {isUSMarketOpen()?'미장 운영중 60초':'5분'} 갱신
      </div>

      {/* 모달들 */}
      {showGuide      && <GuideModal onClose={()=>setShowGuide(false)}/>}
      {showForexMulti && <ForexMultiModal forexData={forexData} onClose={()=>setShowForexMulti(false)}/>}
      {chartItem      && <GlobalChartModal type={chartItem.type==='forex'?'forex':'global'} symbol={chartItem.type==='forex'?chartItem.pair:chartItem.sym} name={chartItem.label} currentPrice={chartItem.price} changeRate={chartItem.changeRate} onClose={()=>setChartItem(null)}/>}
    </div>
  )
}
