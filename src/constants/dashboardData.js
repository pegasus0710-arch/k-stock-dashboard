// src/constants/dashboardData.js
// DashboardPage 전용 상수 — SECTOR_GROUPS, GUIDE_DATA, GAUGE_CONFIG

// KS11(KOSPI), KQ11(KOSDAQ)은 키움 API (ka20001)로 별도 조회 — Yahoo Finance 사용 안 함
export const BATCH_SYMBOLS = ['SP500','NASDAQ','DOW','N225','SSE','TWI','DAX','US10Y','US2Y','WTI','BRENT','GOLD','SILVER','COPPER','VIX','DXY']

export const SECTOR_GROUPS = [
  { id:'domestic',  label:'🇰🇷 국내 지수',   accent:'#2563eb', items:[
    { id:'KOSPI',   label:'KOSPI',  type:'global', sym:'KS11', color:'#3b82f6' },
    { id:'KOSDAQ',  label:'KOSDAQ', type:'global', sym:'KQ11', color:'#22c55e' },
  ]},
  { id:'global',    label:'🌍 해외 지수',    accent:'#64748b',
    items:[
      { id:'SP500',  label:'S&P 500', type:'global', sym:'SP500',  color:'#ef4444' },
      { id:'NASDAQ', label:'NASDAQ',  type:'global', sym:'NASDAQ', color:'#0d9488' },
      { id:'DOW',    label:'DOW',     type:'global', sym:'DOW',    color:'#2563eb' },
      { id:'N225',   label:'닛케이',  type:'global', sym:'N225',   color:'#f59e0b' },
    ],
    miniItems:[
      { id:'SSE',  label:'상해',    sym:'SSE',  color:'#dc2626' },
      { id:'TWI',  label:'대만가권', sym:'TWI',  color:'#0891b2' },
      { id:'DAX',  label:'DAX',     sym:'DAX',  color:'#7c3aed' },
    ]
  },
  { id:'bond',      label:'📈 채권·금리',    accent:'#7c3aed', items:[
    { id:'US10Y',  label:'미국 10Y',       type:'global', sym:'US10Y', unit:'%', color:'#7c3aed' },
    { id:'US2Y',   label:'미국 2Y',        type:'global', sym:'US2Y',  unit:'%', color:'#6d28d9' },
    { id:'SPREAD', label:'10Y-2Y 스프레드', type:'spread', color:'#0891b2', unit:'%' },
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

export const ALL_ITEMS = SECTOR_GROUPS.flatMap(g => g.items)

export const GAUGE_CONFIG = {
  VIX:    { min:0,    max:80,   safe:15,  caution:30,  labels:['안전','주의','공포'],       unit:''  },
  US10Y:  { min:0,    max:7,    safe:3.5, caution:4.5, labels:['저금리','보통','고금리'],   unit:'%' },
  US2Y:   { min:0,    max:7,    safe:3.5, caution:4.5, labels:['저금리','보통','고금리'],   unit:'%' },
  WTI:    { min:50,   max:140,  safe:75,  caution:95,  labels:['저유가','보통','고유가'],   unit:'$' },
  BRENT:  { min:55,   max:145,  safe:80,  caution:100, labels:['저유가','보통','고유가'],   unit:'$' },
  DXY:    { min:85,   max:115,  safe:95,  caution:105, labels:['약달러','보통','강달러'], unit:''  },
  SPREAD: { min:-2, max:3, safe:0.5, caution:-0.5, labels:['역전(위험)','중립','정상'], unit:'%' },
  FX_USD: { min:1200, max:1700, safe:1400, caution:1500, labels:['원화강세','보통','원화약세'], unit:'' },
}

export const GUIDE_DATA = {
  N225:   { title:'닛케이 225 (일본)', desc:'일본 225개 대표 종목. 엔화 환율과 역상관 — 엔 약세 시 수출주 수혜로 상승. BOJ 금리 정책이 글로벌 엔 캐리 트레이드에 직접 영향.', up:'엔 약세·일본 수출 호조 → 원/엔 환율 하락(원화 강세) 가능성', down:'엔 강세·BOJ 긴축 → 엔 캐리 청산 → 신흥국 동반 하락 위험', tip:'📌 BOJ 금리 인상 = 엔 캐리 청산 신호. 한국 시장 동반 급락 가능. 40,000↑ 강세 (2026년 기준)' },
  DAX:    { title:'DAX 40 (독일)', desc:'독일 40개 대형주. 자동차·산업재·화학 비중이 높아 유럽 제조업 경기 대표.', up:'유럽 경기 회복·에너지 안정 → 국내 자동차·부품 수출주 긍정', down:'에너지 위기·러시아 리스크·유럽 경기 둔화 → 글로벌 제조업 전반 부정', tip:'📌 유로/달러 환율과 함께 확인. 유로 강세=DAX 수출주 부담' },
  US10Y:  { title:'미국 10년 국채 금리', desc:'전 세계 모든 자산의 기준금리. 주식 밸류에이션(PER)에 직접 영향.', up:'금리 상승 → 성장주·바이오·IT 하락 압력. 고PER 종목 매도, 금융·가치주 방어', down:'금리 하락 → 성장주 재평가. 바이오·2차전지·게임 등 고PER 섹터 긍정', tip:'📌 4.5%↑=성장주 위험 / 3.5%↓=성장주 환경 개선 / 5%↑=전면 하락 압력' },
  US2Y:   { title:'미국 단기금리 (2Y)', desc:'미국 2년물 국채. 연준 금리 정책 방향을 가장 빠르게 반영. 10Y-2Y 스프레드의 기준선.', up:'연준 긴축 지속 → 주식 하락 압력, 달러 강세', down:'연준 피벗 기대 → 위험자산 선호, 성장주 긍정', tip:'📌 10Y-2Y 역전(음수) = 경기침체 경보. 현재 스프레드와 함께 확인' },
  SPREAD: { title:'장단기 금리차 (10Y - 2Y)', desc:'미국 10년물 국채금리에서 2년물을 뺀 값. 역사적으로 음수(역전) 이후 경기침체 발생률이 높은 선행지표.', up:'스프레드 확대 → 경기 회복 기대. 은행 대출 마진 증가, 금융주 긍정', down:'스프레드 축소·역전 → 경기침체 경보. 안전자산(채권·금·달러) 선호 증가', tip:'📌 +0.5%↑=정상 / 0%근처=주의 / 음수=역전(경기침체 경보)' },
  WTI:    { title:'WTI 원유 (미국산)', desc:'서부텍사스중질유. 인플레이션 및 물류비용에 직접 영향. 연준 통화정책 변수.', up:'인플레 재부상 → 연준 금리 인하 지연 → 성장주 부담. 에너지·화학주 긍정', down:'글로벌 경기 둔화 수요 감소 신호. 인플레 완화 → 금리 인하 기대 상승', tip:'📌 $90↑=인플레 경계 / $70↓=경기 침체 우려 / $110↑=에너지 위기 (2026년 기준)' },
  GOLD:   { title:'금 (Gold)', desc:'대표적 안전자산. 달러 가치와 역상관. 인플레·지정학 리스크·금리 하락기에 강세.', up:'안전자산 선호·달러 약세·인플레 우려 → 리스크 자산 경계. 방어적 포지션 고려', down:'달러 강세·실질금리 상승 → 금 약세. 위험자산 선호 복귀 신호일 수 있음', tip:'📌 $2,800↑=불안 상존 / $3,200↑=위기 대비 수요 급증 / $3,500↑=극도 불안 (2026년 기준)' },
  COPPER: { title:'구리 (닥터 쿠퍼)', desc:'건설·전자·자동차·전력 전방위 사용. 경기 실물 수요를 가장 잘 반영.', up:'글로벌 제조업 회복·중국 인프라 투자 → 소재·산업재·신흥국 주식 긍정', down:'글로벌 제조업 둔화·중국 수요 감소 → 경기침체 선행. 방어주 비중 확대', tip:'📌 구리/금 비율 하락=안전자산 선호 확대=주식 비중 축소 신호' },
  VIX:    { title:'VIX (공포지수)', desc:'S&P500 옵션 내재변동성. 시장 공포와 불확실성의 실시간 온도계. 주가와 역상관 관계.', up:'시장 공포 확대 → VIX 30↑ 시 역발상 매수 기회 탐색', down:'시장 안정·낙관 → VIX 15↓ 시 과도한 낙관, 조정 가능성 경계', tip:'📌 15↓ 안정 / 20↑ 불안 / 30↑ 공포(역발상 매수) / 40↑ 패닉' },
  DXY:    { title:'달러인덱스 (DXY)', desc:'유로·엔·파운드 등 6개 주요 통화 대비 달러 강세 측정 종합지수.', up:'달러 강세 → 신흥국 자금 이탈, 원화 약세, 원자재 하락 압력', down:'달러 약세 → 신흥국·원자재·금 상승. 외국인 국내 증시 유입 증가 기대', tip:'📌 100↑ 달러 강세 / 95↓ 달러 약세. DXY 하락=신흥국 강세 공식이 역사적으로 유효' },
  FX_USD: { title:'USD/KRW (원달러)', desc:'1달러를 원화로 환산한 가격. 가장 중요한 환율 지표.', up:'원화 약세·달러 강세 → 수출 기업 호재, 수입 물가 상승, 외국인 이탈 압력', down:'원화 강세 → 수출 기업 부담, 수입 물가 하락, 외국인 유입 증가 기대', tip:'📌 1,500↑=외환 위기 경계 / 1,350↓=원화 강세 구간. 외국인 순매수와 역상관 (2026년 기준)' },
  HEATMAP: { title:'업종별 히트맵', desc:'오늘 각 업종의 등락률을 색상으로 표시합니다. 초록=상승, 파랑=하락, 색이 진할수록 변동폭이 큽니다.', tip:'📌 특정 업종만 초록이면 테마 장세. 반도체·2차전지 동반 하락 시 외국인 이탈 신호로 해석.' },
  FLOW:    { title:'외국인·기관 수급', desc:'오늘 코스피+코스닥 합산 순매수 금액입니다. 누가 사고 파느냐가 주가 방향을 결정합니다.', tip:'📌 외국인 매도 + 개인 매수 = 위험 신호 (개미들이 받아주는 구조). 외국인 연속 매도 시 지수 하락 압력.' },
}

// ── 업종 히트맵 섹터 정의 ─────────────────────────────
// changeRate는 API에서 받아 주입. 여기서는 섹터 메타만 정의.
export const HEATMAP_SECTORS = [
  { id:'semiconductor', name:'반도체·IT',   stocks:'삼성전자, SK하이닉스', themeColor:'#1d4ed8', inds_cd:'010',
    repCodes:['005930','000660','042700','009150','066970'] },  // 삼성전자, SK하이닉스, 한미반도체, 삼성전기, DB하이텍
  { id:'battery',       name:'2차전지',      stocks:'LG에너지솔루션, 삼성SDI', themeColor:'#2563eb', inds_cd:'010',
    repCodes:['373220','006400','003670','247540','086520'] },  // LG에너지솔루션, 삼성SDI, 포스코퓨처엠, 에코프로비엠, 에코프로
  { id:'auto',          name:'자동차',       stocks:'현대차, 기아', themeColor:'#3b82f6', inds_cd:'012',
    repCodes:['005380','000270','012330','011210','064350'] },  // 현대차, 기아, 현대모비스, 현대위아, 현대로템
  { id:'bio',           name:'바이오·제약',  stocks:'삼성바이오, 셀트리온', themeColor:'#7c3aed', inds_cd:'006',
    repCodes:['207940','068270','000100','128940','326030'] },  // 삼성바이오로직스, 셀트리온, 유한양행, 한미약품, SK바이오팜
  { id:'game',          name:'게임·엔터',   stocks:'HYBE, 엔씨소프트', themeColor:'#8b5cf6', inds_cd:'024',
    repCodes:['259960','036570','251270','352820','035420'] },  // 크래프톤, 엔씨소프트, 넷마블, HYBE, NAVER
  { id:'finance',       name:'금융·보험',   stocks:'KB금융, 신한지주', themeColor:'#0891b2', inds_cd:'018',
    repCodes:['105560','055550','086790','316140','138040'] },  // KB금융, 신한지주, 하나금융지주, 우리금융지주, 메리츠금융지주
  { id:'energy',        name:'에너지',       stocks:'S-Oil, GS칼텍스', themeColor:'#16a34a', inds_cd:'014',
    repCodes:['015760','036460','034020','117000','267260'] },  // 한국전력, 한국가스공사, 두산에너빌리티, 한전기술, HD현대일렉트릭
  { id:'chemical',      name:'화학·소재',   stocks:'LG화학, 롯데케미칼', themeColor:'#15803d', inds_cd:'005',
    repCodes:['051910','011170','009830','010950','285130'] },  // LG화학, 롯데케미칼, 한화솔루션, S-Oil, SK케미칼
  { id:'telecom',       name:'통신',         stocks:'SKT, KT', themeColor:'#64748b', inds_cd:'017',
    repCodes:['017670','030200','032640','035420','035720'] },  // SK텔레콤, KT, LG유플러스, NAVER, 카카오
  { id:'retail',        name:'유통·소비재', stocks:'이마트, 롯데쇼핑', themeColor:'#94a3b8', inds_cd:'013',
    repCodes:['139480','023530','004170','069960','005440'] },  // 이마트, 롯데쇼핑, 신세계, 현대백화점, 현대그린푸드
  { id:'construct',     name:'건설·부동산', stocks:'현대건설, DL이앤씨', themeColor:'#0369a1', inds_cd:'015',
    repCodes:['000720','006360','047040','375500','028260'] },  // 현대건설, GS건설, 대우건설, DL이앤씨, 삼성물산
  { id:'shipyard',      name:'조선·기계',   stocks:'HD한국조선해양, 두산에너빌', themeColor:'#0e7490', inds_cd:'009',
    repCodes:['009540','010140','042660','329180','034020'] },  // HD한국조선해양, 삼성중공업, 한화오션, HD현대중공업, 두산에너빌리티
]

// 등락률 → 히트맵 배경색 계산
// 상승: 초록 계열 / 하락: 파랑 계열 / 보합(-0.3~+0.3): 회색
export function getHeatmapColor(rate) {
  if (rate == null) return { bg: '#F1F5F9', neutral: true }
  if (rate >=  3.0) return { bg: '#16a34a', neutral: false }
  if (rate >=  1.5) return { bg: '#22c55e', neutral: false }
  if (rate >=  0.3) return { bg: '#4ade80', neutral: false }
  if (rate >= -0.3) return { bg: '#F1F5F9', neutral: true  }
  if (rate >= -1.5) return { bg: '#93c5fd', neutral: false }
  if (rate >= -3.0) return { bg: '#3b82f6', neutral: false }
  return               { bg: '#1d4ed8', neutral: false }
}
