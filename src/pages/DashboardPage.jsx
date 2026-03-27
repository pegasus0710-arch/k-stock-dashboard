import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import GlobalChartModal from '../components/GlobalChartModal'
import { rateColor, getTodayStr, getNowTime, getKstStatus, isMarketOpen, isUSMarketOpen, getDashTTL } from '../utils/format'
import './DashboardPage.css'

// ── 캐시 키 ──────────────────────────────────────────
const LS_DASH    = 'db_cache_v3'
const LS_BRIEFING= 'db_briefing_v1'
const LS_GLOBAL  = 'db_global_v4'
const LS_FOREX   = 'db_forex_krw_v1'
const LS_RATES   = 'db_central_rates_v1'

const BATCH_SYMBOLS = ['KS11','KQ11','SP500','NASDAQ','DOW','N225','HSI','SSE','TWI','DAX','US10Y','US2Y','KR10Y','WTI','BRENT','GOLD','SILVER','COPPER','VIX','DXY']

// ══════════════════════════════════════════════════════
// 섹터 그룹 정의
// ══════════════════════════════════════════════════════
const SECTOR_GROUPS = [
  { id:'domestic',  label:'🇰🇷 국내 지수',   accent:'#2563eb', items:[
    { id:'KOSPI',  label:'KOSPI',   type:'global', sym:'KS11',   color:'#3b82f6' },
    { id:'KOSDAQ', label:'KOSDAQ',  type:'global', sym:'KQ11',   color:'#22c55e' },
  ]},
  { id:'global',    label:'🌍 해외 지수',    accent:'#64748b', items:[
    { id:'SP500',  label:'S&P 500',  type:'global', sym:'SP500',  color:'#ef4444' },
    { id:'NASDAQ', label:'NASDAQ',   type:'global', sym:'NASDAQ', color:'#0d9488' },
    { id:'DOW',    label:'DOW',      type:'global', sym:'DOW',    color:'#2563eb' },
    { id:'N225',   label:'닛케이',   type:'global', sym:'N225',   color:'#f59e0b' },
    { id:'HSI',    label:'항셍',     type:'global', sym:'HSI',    color:'#dc2626' },
    { id:'SSE',    label:'상해',     type:'global', sym:'SSE',    color:'#b91c1c' },
    { id:'TWI',    label:'대만가권', type:'global', sym:'TWI',    color:'#0891b2' },
    { id:'DAX',    label:'DAX',      type:'global', sym:'DAX',    color:'#7c3aed' },
  ]},
  { id:'bond',      label:'📈 채권·금리',    accent:'#7c3aed', items:[
    { id:'US10Y', label:'미국 10Y',  type:'global', sym:'US10Y', unit:'%', color:'#7c3aed' },
    { id:'US2Y',  label:'미국 3M',   type:'global', sym:'US2Y',  unit:'%', color:'#6d28d9' },
    { id:'KR10Y', label:'한국 10Y',  type:'global', sym:'KR10Y', unit:'%', color:'#4f46e5' },
  ]},
  { id:'cbrate',    label:'🏦 기준금리',     accent:'#0891b2', items:[
    { id:'CB_US', label:'미국 Fed',   type:'cb', cbKey:'US',  unit:'%', color:'#0ea5e9' },
    { id:'CB_KR', label:'한국 BOK',   type:'cb', cbKey:'KR',  unit:'%', color:'#2563eb' },
    { id:'CB_JP', label:'일본 BOJ',   type:'cb', cbKey:'JP',  unit:'%', color:'#dc2626' },
    { id:'CB_CN', label:'중국 PBoC',  type:'cb', cbKey:'CN',  unit:'%', color:'#b91c1c' },
    { id:'CB_EU', label:'유럽 ECB',   type:'cb', cbKey:'EU',  unit:'%', color:'#7c3aed' },
  ]},
  { id:'commodity', label:'🛢️ 원자재',       accent:'#16a34a', items:[
    { id:'WTI',    label:'WTI',      type:'global', sym:'WTI',    color:'#16a34a' },
    { id:'BRENT',  label:'브렌트',   type:'global', sym:'BRENT',  color:'#15803d' },
    { id:'GOLD',   label:'금',       type:'global', sym:'GOLD',   color:'#d97706' },
    { id:'SILVER', label:'은',       type:'global', sym:'SILVER', color:'#94a3b8' },
    { id:'COPPER', label:'구리',     type:'global', sym:'COPPER', color:'#b45309' },
  ]},
  { id:'sentiment', label:'⚡ 심리·달러',    accent:'#dc2626', items:[
    { id:'VIX',  label:'VIX 공포',   type:'global', sym:'VIX', color:'#dc2626' },
    { id:'DXY',  label:'달러인덱스', type:'global', sym:'DXY', color:'#0284c7' },
  ]},
  { id:'forex',     label:'💱 환율',         accent:'#d97706', items:[
    { id:'FX_USD', label:'USD/KRW', type:'forex', pair:'USD', color:'#3b82f6' },
    { id:'FX_JPY', label:'JPY/KRW', type:'forex', pair:'JPY', color:'#ef4444' },
    { id:'FX_CNY', label:'CNY/KRW', type:'forex', pair:'CNY', color:'#f59e0b' },
    { id:'FX_EUR', label:'EUR/KRW', type:'forex', pair:'EUR', color:'#8b5cf6' },
  ]},
]

const ALL_ITEMS = SECTOR_GROUPS.flatMap(g => g.items)

// ── 지수 가이드 ───────────────────────────────────────
const GUIDE_DATA = {
  KOSPI:  { title:'KOSPI (코스피)', desc:'대한민국 유가증권시장 전체 시가총액 가중평균 지수. 삼성전자·SK하이닉스 등 대형주 비중이 높아 반도체·수출 경기에 민감.', up:'경기 회복·외국인 순매수 → 대형 수출주·성장주 비중 확대', down:'경기 둔화·외국인 이탈 → 방어주(통신·필수소비재)·현금 확대', tip:'📌 PBR 1배(약 2,400) = 역사적 바닥 근처. 2,500↑ 강세 / 2,000↓ 약세 경계' },
  KOSDAQ: { title:'KOSDAQ (코스닥)', desc:'중소·벤처·기술 성장기업 지수. 바이오·게임·2차전지 비중이 높아 KOSPI보다 변동성 크고 금리에 더 민감.', up:'금리 하락·성장주 선호 → 바이오·IT·2차전지 종목 관심', down:'금리 상승·위험회피 → 변동성 크므로 비중 축소 또는 ETF로 분산', tip:'📌 900↑ 강세 / 700↓ 약세 / KOSPI 대비 상대강도 확인 중요' },
  SP500:  { title:'S&P 500', desc:'미국 대형주 500개사 시가총액 가중지수. 전 세계 주식시장 40% 이상을 차지해 글로벌 위험선호의 바로미터.', up:'글로벌 위험선호 확대 → 국내 외국인 매수 유입, 성장주 긍정', down:'글로벌 위험회피 → 외국인 이탈, 원화 약세 압력. 방어주·현금 확보', tip:'📌 200일 이동평균 위=상승추세 / 아래=하락추세. VIX와 함께 필수 확인' },
  NASDAQ: { title:'NASDAQ Composite', desc:'미국 기술주·성장주 중심. 엔비디아·애플·MS 등 AI·반도체 비중이 높아 금리 변화에 매우 민감.', up:'금리 하락·AI 투자 확대 → 국내 반도체·AI 관련주 동반 상승 기대', down:'금리 상승·성장주 밸류 부담 → 국내 IT·게임주 동반 약세 경계', tip:'📌 NASDAQ/S&P 비율 상승=성장주 선호 국면. 하락 시 가치주 전환 신호' },
  DOW:    { title:'DOW Jones 산업평균', desc:'미국 30개 우량 산업주 단순평균. 전통 제조업·금융·에너지 비중이 높아 경기 민감도 대표.', up:'전통 산업·경기 회복 신호 → 원자재·소재·금융 관련 종목 긍정', down:'경기 침체 우려 → 필수소비재·헬스케어 등 방어 섹터로 이동 검토', tip:'📌 S&P500과 동반 하락 시 본격 약세장. 둘의 괴리가 크면 섹터 로테이션 신호' },
  N225:   { title:'닛케이 225', desc:'일본 225개 대표 종목. 엔화 환율과 역상관 — 엔 약세 시 수출주 수혜로 상승하는 경향.', up:'엔 약세·일본 수출 호조 → 원/엔 환율 하락(원화 강세) 가능성', down:'엔 강세·일본 내수 위축 → 엔화 강세 전환 시 환전 비용 증가', tip:'📌 35,000↑ 강세장. 엔/달러 150↑ = 지나친 엔저, BOJ 개입 주의' },
  HSI:    { title:'항셍지수 (홍콩)', desc:'홍콩 대형주 지수. 알리바바·텐센트 등 중국 빅테크 비중이 높아 중국 정책·규제 리스크에 민감.', up:'중국 부양·규제 완화 → 중국 소비·IT 관련주 긍정', down:'중국 부동산 위기·규제 강화·미중 갈등 → 글로벌 신흥국 리스크 전반 부정', tip:'📌 20,000↑ 회복 시 중국 경기 반등 신호. 미중 관계 지표와 함께 관찰' },
  SSE:    { title:'상해종합지수 (중국)', desc:'중국 상하이 전체 상장종목 지수. 세계 2위 경제의 내수·제조업 경기 반영.', up:'중국 내수 확대·수출 회복 → 화학·철강·뷰티 대중 수출주 긍정', down:'중국 경기 둔화 → 대중 수출 비중 높은 섹터 전반 약세 경계', tip:'📌 3,000↑ 안정 / 2,800↓ 부양책 기대. 중국 PMI 지표와 함께 확인' },
  TWI:    { title:'대만가권지수 (TAIEX)', desc:'TSMC 비중 40% 이상으로 글로벌 반도체 수요의 선행지표. 삼성전자·SK하이닉스와 높은 상관관계.', up:'글로벌 반도체 수요 증가 → 국내 반도체·장비·소재주 강세 기대', down:'반도체 업황 둔화 → 국내 반도체 섹터 약세 선행 신호로 활용', tip:'📌 TSMC 주가와 삼성전자는 3~6개월 선행/후행 관계. 반드시 함께 확인' },
  DAX:    { title:'DAX 40 (독일)', desc:'독일 40개 대형주. 자동차·산업재·화학 비중이 높아 유럽 제조업 경기 대표.', up:'유럽 경기 회복·에너지 안정 → 국내 자동차·부품 수출주 긍정', down:'에너지 위기·러시아 리스크·유럽 경기 둔화 → 글로벌 제조업 전반 부정', tip:'📌 유로/달러 환율과 함께 확인. 유로 강세=DAX 수출주 부담' },
  US10Y:  { title:'미국 10년 국채 금리', desc:'전 세계 모든 자산의 기준금리. 주식 밸류에이션(PER)에 직접 영향.', up:'금리 상승 → 성장주·바이오·IT 하락 압력. 고PER 종목 매도, 금융·가치주 방어', down:'금리 하락 → 성장주 재평가. 바이오·2차전지·게임 등 고PER 섹터 긍정', tip:'📌 4.5%↑=성장주 위험 / 3.5%↓=성장주 환경 개선 / 5%↑=전면 하락 압력' },
  US2Y:   { title:'미국 단기금리 (3M T-Bill)', desc:'연방기준금리와 가장 가깝게 움직이는 단기 국채. 현재 통화정책 방향을 실시간 반영.', up:'연준 긴축 지속·금리 인하 기대 후퇴 → 주식 전반 하락 압력, 달러 강세', down:'연준 피벗(금리 인하) 기대 → 주식·신흥국·원자재 긍정', tip:'📌 10Y-3M 스프레드 역전(음수)=경기침체 확률 급상승. 현재 스프레드 주시' },
  KR10Y:  { title:'한국 10년 국채 금리', desc:'국내 기준금리·경기 전망·외국인 채권 투자를 반영. 미국 10년물과 연동되며 원화 환율에도 영향.', up:'한미 금리차 축소·국내 인플레 우려 → 외국인 채권 이탈 가능, 원화 약세', down:'한국은행 금리 인하 기대 → 부동산·리츠·금융주 긍정', tip:'📌 한미 금리차 -1.5%p 이상 역전=외국인 이탈·원화 약세 위험 확대' },
  CB_US:  { title:'미국 기준금리 (Fed Funds Rate)', desc:'미 연준(Fed)이 결정하는 정책금리. 전 세계 금융시장의 가장 중요한 단일 변수. FOMC에서 6~8주마다 결정.', up:'금리 인상 → 달러 강세, 신흥국 자금 이탈, 주식 밸류에이션 하락', down:'금리 인하 → 위험자산 선호, 신흥국 자금 유입, 성장주 강세', tip:'📌 5%↑=긴축 구간. 인하 사이클 시작=주식 강세 선행 신호' },
  CB_KR:  { title:'한국 기준금리 (BOK 기준금리)', desc:'한국은행 금융통화위원회가 결정하는 정책금리. 국내 대출금리·부동산·소비에 직접 영향.', up:'금리 인상 → 대출 부담 증가, 부동산 하락 압력, 고PER 성장주 약세', down:'금리 인하 → 내수 소비 활성화, 부동산 지지, 바이오·IT 성장주 강세', tip:'📌 미국보다 낮으면 외국인 채권 이탈 압력. 한미 금리차 관리가 핵심' },
  CB_JP:  { title:'일본 기준금리 (BOJ 정책금리)', desc:'일본은행(BOJ)의 정책금리. 오랜 제로금리에서 벗어나는 과정으로 전 세계 엔 캐리 트레이드에 영향.', up:'금리 인상 → 엔화 강세, 캐리 트레이드 청산 → 신흥국 급락 위험', down:'금리 동결/인하 → 엔 약세 지속, 일본 수출주 호재', tip:'📌 BOJ 금리 인상은 전 세계 엔 캐리 청산 → 신흥국 동반 급락 가능. 고위험 이벤트' },
  CB_CN:  { title:'중국 기준금리 (LPR 1년)', desc:'중국 인민은행(PBoC)의 대출우대금리(LPR). 중국 내수 경기와 부동산 시장에 직접 영향.', up:'금리 인상 → 중국 내수 둔화 우려, 대중 수출 비중 높은 기업 부담', down:'금리 인하 → 중국 경기 부양, 소재·화학·뷰티 등 대중 수출주 긍정', tip:'📌 PBoC는 경기 부양을 위해 선제적 인하. 인하 발표 시 중국 관련주 급등 경향' },
  CB_EU:  { title:'유럽 기준금리 (ECB 예금금리)', desc:'유럽중앙은행(ECB)의 예금 금리. 유로화 강세/약세와 유럽 경기에 영향.', up:'금리 인상 → 유로 강세, 유럽 내수 둔화', down:'금리 인하 → 유로 약세, 유럽 수출 기업 호재', tip:'📌 ECB와 Fed 금리 차이가 유로/달러 환율 방향을 결정' },
  WTI:    { title:'WTI 원유 (미국산)', desc:'서부텍사스중질유. 인플레이션 및 물류비용에 직접 영향. 연준 통화정책 변수.', up:'인플레 재부상 → 연준 금리 인하 지연 → 성장주 부담. 에너지·화학주 긍정', down:'글로벌 경기 둔화 수요 감소 신호. 인플레 완화 → 금리 인하 기대 상승', tip:'📌 $80↑=인플레 경계 / $60↓=경기 침체 우려 / $100↑=에너지 위기' },
  BRENT:  { title:'브렌트유 (국제 기준)', desc:'북해산 원유로 국제 원유 가격의 실질적 기준. 정유사·항공·해운 비용에 직접 영향.', up:'정유·화학 마진 상승. 항공·해운 비용 증가 → 해당 업종 수익성 악화', down:'항공·해운·물류 업종 수혜. 무역수지 개선 → 원화 강세 압력', tip:'📌 WTI 대비 $3~5 프리미엄이 정상. 괴리가 크면 공급 이슈 신호' },
  GOLD:   { title:'금 (Gold)', desc:'대표적 안전자산. 달러 가치와 역상관. 인플레·지정학 리스크·금리 하락기에 강세.', up:'안전자산 선호·달러 약세·인플레 우려 → 리스크 자산 경계. 방어적 포지션 고려', down:'달러 강세·실질금리 상승 → 금 약세. 위험자산 선호 복귀 신호일 수 있음', tip:'📌 $2,000↑=불안 상존 / $2,500↑=위기 대비 수요 급증. 금/구리 비율로 심리 확인' },
  SILVER: { title:'은 (Silver)', desc:'산업용(전기차·태양광) + 귀금속 이중 성격. 금보다 변동성 크고 경기에 더 민감.', up:'산업 수요 확대 + 안전자산 수요 → 신재생에너지 섹터 긍정', down:'산업 수요 둔화 → 경기 침체 선행. 금 대비 은 약세=경기 비관론 확대', tip:'📌 금/은 비율 80↑=은이 상대적 저평가. 비율 복귀 시 은 강세 기대' },
  COPPER: { title:'구리 (닥터 쿠퍼)', desc:'건설·전자·자동차·전력 전방위 사용. 경기 실물 수요를 가장 잘 반영.', up:'글로벌 제조업 회복·중국 인프라 투자 → 소재·산업재·신흥국 주식 긍정', down:'글로벌 제조업 둔화·중국 수요 감소 → 경기침체 선행. 방어주 비중 확대', tip:'📌 구리/금 비율 하락=안전자산 선호 확대=주식 비중 축소 신호' },
  VIX:    { title:'VIX (공포지수)', desc:'S&P500 옵션 내재변동성. 시장 공포와 불확실성의 실시간 온도계. 주가와 역상관 관계.', up:'시장 공포 확대 → VIX 30↑ 시 역발상 매수 기회 탐색', down:'시장 안정·낙관 → VIX 15↓ 시 과도한 낙관, 조정 가능성 경계', tip:'📌 15↓ 안정 / 20↑ 불안 / 30↑ 공포(역발상 매수) / 40↑ 패닉. VIX 30 돌파 후 6~12개월 수익률 플러스 확률 80%+' },
  DXY:    { title:'달러인덱스 (DXY)', desc:'유로·엔·파운드 등 6개 주요 통화 대비 달러 강세 측정 종합지수.', up:'달러 강세 → 신흥국 자금 이탈, 원화 약세, 원자재 하락 압력', down:'달러 약세 → 신흥국·원자재·금 상승. 외국인 국내 증시 유입 증가 기대', tip:'📌 100↑ 달러 강세 / 95↓ 달러 약세. DXY 하락=신흥국 강세 공식이 역사적으로 유효' },
  FX_USD: { title:'USD/KRW (원달러)', desc:'1달러를 원화로 환산한 가격. 가장 중요한 환율 지표.', up:'원화 약세·달러 강세 → 수출 기업 호재, 수입 물가 상승, 외국인 이탈 압력', down:'원화 강세 → 수출 기업 부담, 수입 물가 하락, 외국인 유입 증가 기대', tip:'📌 1,400↑=외환 위기 경계 / 1,200↓=원화 강세 구간. 외국인 순매수와 역상관' },
  FX_JPY: { title:'JPY/KRW (원엔, 100엔 기준)', desc:'100엔을 원화로 환산. 한일 무역 경쟁력·일본 여행 비용에 영향.', up:'엔 강세(원 약세) → 일본 수출 기업 경쟁력 약화, 일본 여행 비용 증가', down:'엔 약세(원 강세) → 국내 수출 기업 대일 경쟁력 강화, 일본 여행 저렴', tip:'📌 엔/달러 150↑=BOJ 개입 경계. 한일 수출 구조 유사 → 엔 약세=원화도 약세 압력' },
  FX_CNY: { title:'CNY/KRW (원위안)', desc:'1위안을 원화로 환산. 한중 무역 비중이 크므로 위안화 동향은 국내 수출에 직접 영향.', up:'위안 강세 → 중국 수입 능력 향상, 대중 수출 유리', down:'위안 약세 → 중국 수입 감소 압력, 대중 수출 비중 높은 기업 부담', tip:'📌 위안/달러 7.2↑=위안 약세 심화. 미중 무역 갈등 시 위안 약세 가속' },
  FX_EUR: { title:'EUR/KRW (원유로)', desc:'1유로를 원화로 환산. 유럽 경기와 ECB 통화정책을 간접 반영.', up:'유로 강세 → 유럽 경기 상대적 호조, 대유럽 수출 유리', down:'유로 약세 → 유럽 경기 둔화, 에너지 위기·정치 리스크 반영 가능', tip:'📌 유로/달러 1.10↑=달러 약세 구간. DXY 하락과 함께 원화 강세 압력' },
}

// ── localStorage ──────────────────────────────────────
function lsRead(key, ttl) {
  try { const r=localStorage.getItem(key); if(!r)return null; const {data,ts}=JSON.parse(r); return Date.now()-ts<ttl?data:null } catch { return null }
}
function lsWrite(key, data) {
  try { localStorage.setItem(key, JSON.stringify({data,ts:Date.now()})) } catch {}
}

function Skeleton({ w='60%', h=14, r=3 }) {
  return <div className="db-skeleton" style={{width:w,height:h,borderRadius:r}}/>
}

// ── 데이터 getter ─────────────────────────────────────
function getItemData(item, dashData, globalData, forexData, cbRates) {
  if (item.type==='global') return globalData?.[item.sym] || null
  if (item.type==='forex')  {
    const d = forexData?.[item.pair]
    return d ? { price:d.price, changeRate:d.changeRate, change:d.change, marketState:'CURRENCY' } : null
  }
  if (item.type==='cb') {
    const d = cbRates?.[item.cbKey]
    return d ? { price:d.rate, changeRate:null, isCB:true, date:d.date, note:d.note } : null
  }
  return null
}

// ── 마켓 상태 판별 ────────────────────────────────────
function getMarketBadge(item, data) {
  if (!data) return null
  if (item.type==='cb') return { label:'정책금리', color:'#0891b2' }
  if (item.type==='forex') return null // 24시간
  const ms = data.marketState || data.status
  if (ms==='open' || ms==='REGULAR') return { label:'LIVE', color:'#22c55e' }
  if (ms==='POST'  || ms==='after')  return { label:'시간외', color:'#a78bfa' }
  if (ms==='PRE')  return { label:'프리', color:'#f59e0b' }
  return { label:'전일', color:'#64748b' } // closed
}

// ══════════════════════════════════════════════════════
// ① 섹터 아코디언 + 카드
// ══════════════════════════════════════════════════════
function SectorAccordion({ selId, onSelChange, dashData, globalData, forexData, cbRates, globalLoading }) {
  const [openGroups, setOpenGroups] = useState(['domestic','global'])

  const toggleGroup = id => {
    setOpenGroups(prev =>
      prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]
    )
  }

  // 아코디언에서 환율/원자재/심리는 하단 카드로 이동 → 제외
  const ACCORDION_GROUPS = SECTOR_GROUPS.filter(g => !['commodity','sentiment','forex'].includes(g.id))

  return (
    <div className="db-accordion">
      {ACCORDION_GROUPS.map(group => {
        const isOpen = openGroups.includes(group.id)
        return (
          <div key={group.id} className="db-accordion-group"
            style={{'--ga': group.accent}}>
            {/* 타이틀 (클릭으로 펼치기) */}
            <button className="db-accordion-title" onClick={()=>toggleGroup(group.id)}>
              <span className="db-accordion-label">{group.label}</span>
              <span className={`db-accordion-arrow ${isOpen?'open':''}`}>▾</span>
            </button>

            {/* 카드 목록 */}
            {isOpen && (
              <div className="db-accordion-cards">
                {group.items.map(item => {
                  const d      = getItemData(item, dashData, globalData, forexData, cbRates)
                  const rate   = d?.changeRate
                  const pc     = rate != null ? rateColor(rate) : '#64748b'
                  const up     = rate > 0
                  const active = selId === item.id
                  const badge  = getMarketBadge(item, d)
                  const isClosed = badge?.label === '전일'

                  return (
                    <button key={item.id}
                      className={`db-idx-card ${active?'active':''} ${isClosed?'closed':''}`}
                      style={active ? {'--ga':group.accent} : {}}
                      onClick={()=> item.type!=='cb' && onSelChange(item.id)}>

                      {/* 이름 + 마켓 배지 */}
                      <div className="db-idx-top-row">
                        <span className="db-idx-name">{item.label}</span>
                        {badge && (
                          <span className="db-idx-badge" style={{color:badge.color}}>
                            {badge.label==='LIVE' && <span className="db-idx-live-dot"/>}
                            {badge.label}
                          </span>
                        )}
                      </div>

                      {/* 가격 */}
                      {globalLoading && !d ? (
                        <Skeleton w="70%" h={13}/>
                      ) : d?.price != null ? (
                        <>
                          <div className="db-idx-price" style={{color: isClosed ? 'var(--text-dim)' : 'var(--text-primary)'}}>
                            {d.price.toLocaleString(undefined,{maximumFractionDigits:2})}{item.unit||''}
                          </div>
                          {d.isCB ? (
                            <div className="db-idx-cb-date">{d.date}</div>
                          ) : rate != null ? (
                            <div className="db-idx-rate" style={{color:pc}}>
                              {up?'▲':'▼'}{Math.abs(rate).toFixed(2)}%
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="db-idx-na">—</div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// ② HERO 차트
// ══════════════════════════════════════════════════════
function HeroChart({ selId, onSelChange, dashData, globalData, forexData }) {
  const [range,   setRange]   = useState('3mo')
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(false)
  const PERIODS = [{v:'1mo',l:'1개월'},{v:'3mo',l:'3개월'},{v:'6mo',l:'6개월'},{v:'1y',l:'1년'}]

  const item   = ALL_ITEMS.find(x=>x.id===selId)
  const group  = SECTOR_GROUPS.find(g=>g.items.some(x=>x.id===selId))
  const accent = item?.color || group?.accent || '#2563eb'

  const fetchChart = useCallback(async (id, rng) => {
    const it = ALL_ITEMS.find(x=>x.id===id)
    if (!it || it.type==='cb') return
    setLoading(true)
    try {
      let raw = []
      if (it.type==='global') {
        const j = await fetch(`/api/kis?type=global&symbol=${it.sym}&range=${rng}`).then(r=>r.json())
        raw = j.candles||[]
      } else if (it.type==='forex') {
        const j = await fetch(`/api/kis?type=forex-krw&range=${rng}`).then(r=>r.json())
        raw = j[it.pair]?.candles||[]
      }
      setCandles(raw.filter(c=>(c.close||0)>0))
    } catch(e){console.error(e)}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{ fetchChart(selId, range) },[selId, range])

  // 현재가
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

  const renderLine = () => {
    if (!candles.length) return <div className="db-hero-empty">데이터를 불러오는 중...</div>
    const W=800,H=190,pL=68,pR=16,pT=10,pB=28
    const cW=W-pL-pR,cH=H-pT-pB
    const closes=candles.map(c=>c.close)
    const rawMin=Math.min(...closes), rawMax=Math.max(...closes)
    const pad=(rawMax-rawMin)*0.05||rawMax*0.01

    // ── Y축: 보기 좋은 눈금 자동 계산 ──
    const niceNum=(r,round)=>{const e=Math.floor(Math.log10(r));const f=r/Math.pow(10,e);let nf;if(round){if(f<1.5)nf=1;else if(f<3)nf=2;else if(f<7)nf=5;else nf=10;}else{if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=5)nf=5;else nf=10;}return nf*Math.pow(10,e)}
    const tickInterval=niceNum((rawMax-rawMin)/4,true)
    const yMin=Math.floor((rawMin-pad)/tickInterval)*tickInterval
    const yMax=Math.ceil( (rawMax+pad)/tickInterval)*tickInterval
    const yRng=yMax-yMin||1
    const py=v=>pT+cH-(v-yMin)/yRng*cH
    const px=i=>pL+(i/(candles.length-1||1))*cW
    const pts=candles.map((c,i)=>`${px(i)},${py(c.close)}`).join(' ')

    // Y 눈금 목록
    const yTicks=[]
    for(let v=yMin;v<=yMax+tickInterval*0.01;v+=tickInterval) yTicks.push(Math.round(v*100)/100)

    // ── X축: 기간별 레이블 형식 ──
    // 1년/6개월 → 'YY년MM월' or 'MM월' 단위 / 3개월/1개월 → MM/DD
    const useMon = range==='1y' || range==='6mo'
    const useYr  = range==='1y'
    const xLabels=[]
    if (useMon) {
      // 월이 바뀌는 첫 캔들만 표시
      let lastMon=''
      candles.forEach((c,i)=>{
        const d=String(c.date||''); if(d.length<6) return
        const yr=d.slice(2,4), mo=d.slice(4,6)
        const key=`${yr}${mo}`
        if(key!==lastMon){ lastMon=key; xLabels.push({x:px(i), lbl: useYr ? `${yr}년${mo}월` : `${mo}월`}) }
      })
    } else {
      const step=Math.max(1,Math.floor(candles.length/6))
      candles.forEach((c,i)=>{
        if(i%step===0||i===candles.length-1){
          const d=String(c.date||'')
          xLabels.push({x:px(i), lbl:d.length>=8?`${d.slice(4,6)}/${d.slice(6,8)}`:d})
        }
      })
    }
    // X 레이블 최대 8개로 제한 (겹침 방지)
    const filteredX = xLabels.length>8
      ? xLabels.filter((_,i)=>i%(Math.ceil(xLabels.length/7))===0)
      : xLabels

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block'}}>
        <defs>
          <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={accent} stopOpacity="0.2"/>
            <stop offset="100%" stopColor={accent} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* Y축 그리드 + 눈금 */}
        {yTicks.map((v,i)=>{
          const y=py(v)
          if(y<pT-2||y>pT+cH+2) return null
          return <g key={i}>
            <line x1={pL} x2={pL+cW} y1={y} y2={y} stroke="rgba(15,23,42,0.06)" strokeDasharray="3,4"/>
            <text x={pL-5} y={y+4} textAnchor="end" fontSize="10" fill="#94A3B8">
              {v>=1000?Math.round(v).toLocaleString():v>=10?v.toFixed(1):v.toFixed(2)}
            </text>
          </g>
        })}
        {/* 영역 + 라인 */}
        <polygon points={`${pL},${pT+cH} ${pts} ${px(candles.length-1)},${pT+cH}`} fill="url(#hg)"/>
        <polyline points={pts} fill="none" stroke={accent} strokeWidth="1.8"/>
        <circle cx={px(candles.length-1)} cy={py(closes[closes.length-1])} r="4" fill={accent} stroke="#FFFFFF" strokeWidth="2"/>
        {/* X축 레이블 */}
        {filteredX.map((l,i)=>(
          <text key={i} x={l.x} y={H-6} textAnchor="middle" fontSize="10" fill="#94A3B8">{l.lbl}</text>
        ))}
      </svg>
    )
  }

  // ── 차트 하단 소형 카드 렌더러 ─────────────────────────
  const BOTTOM_GROUPS = SECTOR_GROUPS.filter(g => ['forex','commodity','sentiment'].includes(g.id))

  const renderBottomCards = () => (
    <div className="db-bottom-cards">
      {BOTTOM_GROUPS.map(grp => (
        <div key={grp.id} className="db-bottom-group">
          <div className="db-bottom-group-label" style={{color:grp.accent}}>{grp.label}</div>
          <div className="db-bottom-group-items">
            {grp.items.map(it => {
              const d    = grp.id==='forex' ? forexData?.[it.pair]
                         : globalData?.[it.sym]
              const rate = d?.changeRate
              const up   = rate > 0
              const pc   = rate != null ? rateColor(rate) : '#64748b'
              const badge = getMarketBadge(it, d)
              const isClosed = badge?.label === '전일'
              const active = selId === it.id
              return (
                <button key={it.id}
                  className={`db-bottom-card ${active?'active':''}`}
                  style={active?{'--bc':it.color||grp.accent}:{}}
                  onClick={()=>onSelChange(it.id)}>
                  <div className="db-bottom-name">{it.label}</div>
                  {d?.price != null ? (
                    <>
                      <div className="db-bottom-price" style={{color: isClosed?'var(--text-dim)':'var(--text-primary)'}}>
                        {d.price.toLocaleString(undefined,{maximumFractionDigits:2})}{it.unit||''}
                      </div>
                      {rate != null && (
                        <div className="db-bottom-rate" style={{color:pc}}>
                          {up?'▲':'▼'}{Math.abs(rate).toFixed(2)}%
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{fontSize:10,color:'var(--text-dim)'}}>—</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )

  if (item?.type==='cb') {
    const d = null // cb has no chart
    return (
      <div className="db-hero-section">
        <div className="db-hero-top-row">
          <div className="db-hero-info">
            <span className="db-hero-sym-label" style={{color:accent}}>{item.label}</span>
            <span className="db-hero-price" style={{color:'var(--text-dim)'}}>차트 없음</span>
            <span style={{fontSize:12,color:'var(--text-secondary)'}}>기준금리는 정책 결정값으로 차트 미제공</span>
          </div>
          <div className="db-hero-periods">
            {PERIODS.map(p=>(
              <button key={p.v} className={`db-period-btn ${range===p.v?'active':''}`}
                onClick={()=>setRange(p.v)}>{p.l}</button>
            ))}
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
        <div className="db-hero-periods">
          {PERIODS.map(p=>(
            <button key={p.v} className={`db-period-btn ${range===p.v?'active':''}`}
              onClick={()=>setRange(p.v)}>{p.l}</button>
          ))}
        </div>
      </div>
      <div className="db-hero-chart">
        {loading
          ? <div className="db-hero-loading"><div className="db-hero-spinner"/></div>
          : renderLine()
        }
      </div>
      {/* 차트 하단: 환율 + 원자재 + 심리·달러 소형 카드 */}
      {renderBottomCards()}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// ③ 지수 가이드 팝업
// ══════════════════════════════════════════════════════
const GUIDE_CATS = [
  {id:'domestic',  label:'🇰🇷 국내',     ids:['KOSPI','KOSDAQ']},
  {id:'global',    label:'🌍 해외',       ids:['SP500','NASDAQ','DOW','N225','HSI','SSE','TWI','DAX']},
  {id:'bond',      label:'📈 채권',       ids:['US10Y','US2Y','KR10Y']},
  {id:'cbrate',    label:'🏦 기준금리',   ids:['CB_US','CB_KR','CB_JP','CB_CN','CB_EU']},
  {id:'commodity', label:'🛢️ 원자재',    ids:['WTI','BRENT','GOLD','SILVER','COPPER']},
  {id:'sentiment', label:'⚡ 심리·달러', ids:['VIX','DXY']},
  {id:'forex',     label:'💱 환율',       ids:['FX_USD','FX_JPY','FX_CNY','FX_EUR']},
]

function GuideModal({ onClose }) {
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

// ══════════════════════════════════════════════════════
// ④ AI 브리핑
// ══════════════════════════════════════════════════════
function AiBriefing() {
  const [briefing,setBriefing]=useState(()=>{try{const r=localStorage.getItem(LS_BRIEFING);if(!r)return null;const{data,date}=JSON.parse(r);return date===new Date().toISOString().slice(0,10)?data:null}catch{return null}})
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(!!briefing)
  const run=async()=>{const key=import.meta.env.VITE_CLAUDE_API_KEY;if(!key){setError('Claude API 키 미설정');return}
    setLoading(true);setError('')
    try{const today=new Date().toLocaleDateString('ko-KR')
      const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:800,tools:[{type:'web_search_20250305',name:'web_search'}],messages:[{role:'user',content:`오늘(${today}) 한국 주식시장 AI 브리핑. 웹 검색으로 최신 뉴스 찾아 작성.\n## 📊 오늘의 시장 요약 ## 🔑 핵심 이슈 ## 🌏 글로벌 변수 ## 🎯 주목 섹터 ## ⚠️ 리스크 요인`}]})})
      const data=await res.json(); const text=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')||''
      if(!text) throw new Error('응답 없음')
      setBriefing(text);setOpen(true);localStorage.setItem(LS_BRIEFING,JSON.stringify({data:text,date:new Date().toISOString().slice(0,10)}))
    }catch(e){setError(e.message)}finally{setLoading(false)}
  }
  return (
    <section className="dash-section">
      <div className="db-section-header">
        <span className="db-section-label">🤖 AI 시장 브리핑 <span className="db-briefing-badge">web_search</span></span>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {briefing&&<button className="db-briefing-toggle" onClick={()=>setOpen(v=>!v)}>{open?'▲ 접기':'▼ 펼치기'}</button>}
          <button className="btn-outline" onClick={run} disabled={loading}>{loading?'⟳ 검색 중...':briefing?'↺ 다시 분석':'🔍 오늘 브리핑 생성'}</button>
        </div>
      </div>
      {error&&<div className="db-briefing-error">⚠️ {error}</div>}
      {loading&&<div className="db-briefing-loading"><div className="db-briefing-spinner"/><span>웹에서 오늘 시장 정보 검색 중...</span></div>}
      {briefing&&open&&!loading&&<div><pre className="db-briefing-text">{briefing}</pre><div className="db-briefing-meta">오늘({new Date().toLocaleDateString('ko-KR')}) 자동 저장</div></div>}
      {!briefing&&!loading&&!error&&<div className="db-briefing-placeholder">🔍 버튼을 눌러 오늘 시장 브리핑을 생성하세요</div>}
    </section>
  )
}

// ══════════════════════════════════════════════════════
// 메인
// ══════════════════════════════════════════════════════
export default function DashboardPage() {
  const [dashData,      setDashData]      = useState(()=>lsRead(LS_DASH,   getDashTTL()))
  const [globalData,    setGlobalData]    = useState(()=>lsRead(LS_GLOBAL, 300000))
  const [forexData,     setForexData]     = useState(()=>lsRead(LS_FOREX,  300000))
  const [cbRates,       setCbRates]       = useState(()=>lsRead(LS_RATES,  3600000*6)) // 6시간 캐시
  const [loading,       setLoading]       = useState(()=>!lsRead(LS_DASH,  getDashTTL()))
  const [globalLoading, setGlobalLoading] = useState(()=>!lsRead(LS_GLOBAL,300000))
  const [fetchError,    setFetchError]    = useState(false)
  const [lastFetch,     setLastFetch]     = useState('')
  const [selId,         setSelId]         = useState('KOSPI')
  const [showGuide,     setShowGuide]     = useState(false)
  const [chartItem,     setChartItem]     = useState(null)

  const isFetching = useRef(false)
  const timerRef   = useRef(null)
  const globalRef  = useRef(null)

  const fetchDashboard = useCallback(async (force=false) => {
    if(isFetching.current) return
    if(!force&&lsRead(LS_DASH,getDashTTL())){setLoading(false);return}
    isFetching.current=true
    try {
      const res=await fetch('/api/kis?type=dashboard&codes=').then(r=>r.json())
      if(res.error) throw new Error(res.error)
      setDashData(res);lsWrite(LS_DASH,res);setLastFetch(getNowTime());setFetchError(false)
    } catch(e){console.error(e);setFetchError(true)}
    finally{setLoading(false);isFetching.current=false}
  },[])

  const fetchGlobal = useCallback(async (force=false) => {
    if(!force&&lsRead(LS_GLOBAL,300000)){setGlobalLoading(false);return}
    try{const j=await fetch(`/api/kis?type=global-batch&symbols=${BATCH_SYMBOLS.join(',')}`).then(r=>r.json());setGlobalData(j);lsWrite(LS_GLOBAL,j)}
    catch{}finally{setGlobalLoading(false)}
  },[])

  const fetchForex = useCallback(async (force=false) => {
    if(!force&&lsRead(LS_FOREX,300000)) return
    try{const j=await fetch('/api/kis?type=forex-krw&range=1mo').then(r=>r.json());setForexData(j);lsWrite(LS_FOREX,j)}
    catch{}
  },[])

  const fetchCbRates = useCallback(async () => {
    if(lsRead(LS_RATES,3600000*6)) return
    try{const j=await fetch('/api/kis?type=central-rates').then(r=>r.json());setCbRates(j);lsWrite(LS_RATES,j)}
    catch{}
  },[])

  useEffect(()=>{
    fetchDashboard(true);fetchGlobal(true);fetchForex(true);fetchCbRates()
    timerRef.current  = setInterval(()=>fetchDashboard(true), isMarketOpen()?30000:300000)
    globalRef.current = setInterval(()=>fetchGlobal(true),    isUSMarketOpen()?60000:300000)
    return()=>{clearInterval(timerRef.current);clearInterval(globalRef.current)}
  },[fetchDashboard,fetchGlobal,fetchForex,fetchCbRates])

  const kstStatus=getKstStatus()
  const isOpen =kstStatus==='open', isAfter=kstStatus==='after'
  const stMap={
    open:      {label:'정규장 운영중',color:'#16a34a',dot:true},
    premarket: {label:'장 시작 전',  color:'#d97706',dot:false},
    after:     {label:'시간외 거래', color:'#7c3aed',dot:true},
    holiday:   {label:'휴장일',      color:'#64748b',dot:false},
    closed:    {label:'장 마감',     color:'#64748b',dot:false},
  }
  const st=stMap[kstStatus]||stMap.closed

  return (
    <div className="dashboard">
      {/* 헤더 */}
      <div className="dash-header">
        <div className="dash-header-row">
          <div>
            <h1 className="dash-title">시장 대시보드</h1>
            <p className="dash-date">{getTodayStr()}{lastFetch&&<span style={{color:'var(--text-dim)'}}> · {lastFetch} 기준</span>}</p>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <button className="db-guide-btn" onClick={()=>setShowGuide(true)}>📖 지수 가이드</button>
            <div className="db-status-badge" style={{background:st.color+'15',color:st.color,borderColor:st.color+'30'}}>
              {st.dot&&<span className="db-status-dot" style={{background:st.color}}/>}{st.label}
            </div>
            <button className="btn-outline db-refresh-btn" disabled={loading}
              onClick={()=>{localStorage.removeItem(LS_DASH);localStorage.removeItem(LS_GLOBAL);localStorage.removeItem(LS_FOREX);fetchDashboard(true);fetchGlobal(true);fetchForex(true)}}>⟳</button>
          </div>
        </div>
      </div>

      {fetchError&&<div className="db-error-banner">⚠️ 데이터 로드 실패 <button onClick={()=>{setFetchError(false);fetchDashboard(true)}} style={{marginLeft:12,fontSize:11,color:'var(--accent-mid)',background:'none',border:'none',cursor:'pointer'}}>↺ 재시도</button></div>}

      {/* ── 영역 1: 상단 인터랙티브 차트 ── */}
      <div className="db-chart-section">
        {/* 지수 선택 버튼 행 */}
        <div className="db-selector-row">
          {SECTOR_GROUPS.filter(g=>!['cbrate'].includes(g.id)).map((group, gi) => (
            <div key={group.id} style={{display:'flex',alignItems:'center',gap:4}}>
              {gi>0 && <div className="db-sel-divider"/>}
              <div className="db-sel-group">
                {group.items.filter(it=>it.type!=='cb').map(it=>(
                  <button key={it.id}
                    className={`db-sel-btn ${selId===it.id?'active':''}`}
                    onClick={()=>setSelId(it.id)}>
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* 차트 */}
        <HeroChart
          selId={selId} onSelChange={setSelId}
          dashData={dashData} globalData={globalData} forexData={forexData}
        />
      </div>

      {/* ── 영역 2: 중단 지수 카드 그리드 ── */}
      <div className="db-cards-section">
        {SECTOR_GROUPS.map(group => (
          <div key={group.id} className="db-card-group">
            <div className="db-card-group-label" style={{color:group.accent}}>{group.label}</div>
            <div className="db-card-group-items">
              {group.items.map(item => {
                const d     = getItemData(item, dashData, globalData, forexData, cbRates)
                const rate  = d?.changeRate
                const pc    = rate!=null ? rateColor(rate) : 'var(--text-dim)'
                const up    = rate > 0
                const badge = getMarketBadge(item, d)
                const isClosed = badge?.label === '전일'
                const active = selId === item.id
                return (
                  <button key={item.id}
                    className={`db-idx-card ${active?'active':''} ${isClosed?'closed':''}`}
                    onClick={()=>item.type!=='cb' && setSelId(item.id)}>
                    <div className="db-idx-top-row">
                      <span className="db-idx-name">{item.label}</span>
                      {badge&&(
                        <span className="db-idx-badge" style={{color:badge.color}}>
                          {badge.label==='LIVE'&&<span className="db-idx-live-dot"/>}
                          {badge.label}
                        </span>
                      )}
                    </div>
                    {globalLoading&&!d ? <Skeleton w="70%" h={14}/> :
                     d?.price!=null ? (
                      <>
                        <div className="db-idx-price">{d.price.toLocaleString(undefined,{maximumFractionDigits:2})}{item.unit||''}</div>
                        {d.isCB ? <div className="db-idx-cb-date">{d.date}</div>
                          : rate!=null ? <div className="db-idx-rate" style={{color:pc}}>{up?'▲':'▼'}{Math.abs(rate).toFixed(2)}%</div>
                          : null}
                      </>
                    ) : <div className="db-idx-na">—</div>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── 영역 3: 하단 업종 히트맵 (Step 3-3에서 구현) ── */}

      <AiBriefing/>

      <div className="dash-footer-note">
        ✅ KIS API · {isOpen?'장중 30초':isAfter?'시간외 2분':'장외 5분'} 자동 갱신
        · 해외지수 {isUSMarketOpen()?'미장 운영중 60초':'5분'} 갱신
        · 기준금리 6시간 캐시
      </div>

      {showGuide && <GuideModal onClose={()=>setShowGuide(false)}/>}
      {chartItem && <GlobalChartModal type={chartItem.type==='forex'?'forex':'global'} symbol={chartItem.type==='forex'?chartItem.pair:chartItem.sym} name={chartItem.label} currentPrice={chartItem.price} changeRate={chartItem.changeRate} onClose={()=>setChartItem(null)}/>}
    </div>
  )
}
