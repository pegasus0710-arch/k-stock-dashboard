// src/constants/dashboardData.js
// DashboardPage 전용 상수 — SECTOR_GROUPS, GUIDE_DATA, GAUGE_CONFIG

export const BATCH_SYMBOLS = ['KS11','KQ11','SP500','NASDAQ','DOW','DAX','US10Y','US2Y','KR10Y','WTI','BRENT','GOLD','SILVER','COPPER','VIX','DXY']

export const SECTOR_GROUPS = [
  { id:'domestic',  label:'🇰🇷 국내 지수',   accent:'#2563eb', items:[
    { id:'KOSPI',   label:'KOSPI',  type:'global', sym:'KS11', color:'#3b82f6' },
    { id:'KOSDAQ',  label:'KOSDAQ', type:'global', sym:'KQ11', color:'#22c55e' },
  ]},
  { id:'global',    label:'🌍 해외 지수',    accent:'#64748b', items:[
    { id:'SP500',  label:'S&P 500', type:'global', sym:'SP500',  color:'#ef4444' },
    { id:'NASDAQ', label:'NASDAQ',  type:'global', sym:'NASDAQ', color:'#0d9488' },
    { id:'DOW',    label:'DOW',     type:'global', sym:'DOW',    color:'#2563eb' },
    { id:'DAX',    label:'DAX',     type:'global', sym:'DAX',    color:'#7c3aed' },
  ]},
  { id:'bond',      label:'📈 채권·금리',    accent:'#7c3aed', items:[
    { id:'US10Y',   label:'미국 10Y',  type:'global', sym:'US10Y',  unit:'%', color:'#7c3aed' },
    { id:'US2Y',    label:'미국 3M',   type:'global', sym:'US2Y',   unit:'%', color:'#6d28d9' },
    { id:'KR10Y',   label:'한국 10Y',  type:'global', sym:'KR10Y',  unit:'%', color:'#4f46e5' },
    { id:'SPREAD',  label:'10Y-3M 스프레드', type:'spread', color:'#0891b2', unit:'%' },
    { id:'DIV_CB',  label:'🏦 기준금리', type:'divider' },
    { id:'CB_US',   label:'미국 Fed',   type:'cb', cbKey:'US',  unit:'%', color:'#0ea5e9' },
    { id:'CB_KR',   label:'한국 BOK',   type:'cb', cbKey:'KR',  unit:'%', color:'#2563eb' },
    { id:'CB_JP',   label:'일본 BOJ',   type:'cb', cbKey:'JP',  unit:'%', color:'#dc2626' },
    { id:'CB_CN',   label:'중국 PBoC',  type:'cb', cbKey:'CN',  unit:'%', color:'#b91c1c' },
    { id:'CB_EU',   label:'유럽 ECB',   type:'cb', cbKey:'EU',  unit:'%', color:'#7c3aed' },
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
  KR10Y:  { min:0,    max:6,    safe:3.0, caution:4.0, labels:['저금리','보통','고금리'],   unit:'%' },
  WTI:    { min:50,   max:140,  safe:75,  caution:95,  labels:['저유가','보통','고유가'],   unit:'$' },
  BRENT:  { min:55,   max:145,  safe:80,  caution:100, labels:['저유가','보통','고유가'],   unit:'$' },
  DXY:    { min:85,   max:115,  safe:95,  caution:105, labels:['약달러','보통','강달러'],   unit:''  },
  SPREAD: { min:-2, max:3, safe:0.5, caution:-0.5, labels:['역전(위험)','중립','정상'], unit:'%' },
  FX_USD: { min:1200, max:1700, safe:1400, caution:1500, labels:['원화강세','보통','원화약세'], unit:'' },
}

export const GUIDE_DATA = {
  KOSPI:  { title:'KOSPI (코스피)', desc:'대한민국 유가증권시장 전체 시가총액 가중평균 지수. 삼성전자·SK하이닉스 등 대형주 비중이 높아 반도체·수출 경기에 민감.', up:'경기 회복·외국인 순매수 → 대형 수출주·성장주 비중 확대', down:'경기 둔화·외국인 이탈 → 방어주(통신·필수소비재)·현금 확대', tip:'📌 PBR 1배(약 4,800) = 역사적 바닥 근처. 5,500↑ 강세 / 4,500↓ 약세 경계 (2026년 기준)' },
  KOSDAQ: { title:'KOSDAQ (코스닥)', desc:'중소·벤처·기술 성장기업 지수. 바이오·게임·2차전지 비중이 높아 KOSPI보다 변동성 크고 금리에 더 민감.', up:'금리 하락·성장주 선호 → 바이오·IT·2차전지 종목 관심', down:'금리 상승·위험회피 → 변동성 크므로 비중 축소 또는 ETF로 분산', tip:'📌 1,200↑ 강세 / 900↓ 약세 / KOSPI 대비 상대강도 확인 중요 (2026년 기준)' },
  SP500:  { title:'S&P 500', desc:'미국 대형주 500개사 시가총액 가중지수. 전 세계 주식시장 40% 이상을 차지해 글로벌 위험선호의 바로미터.', up:'글로벌 위험선호 확대 → 국내 외국인 매수 유입, 성장주 긍정', down:'글로벌 위험회피 → 외국인 이탈, 원화 약세 압력. 방어주·현금 확보', tip:'📌 200일 이동평균 위=상승추세 / 아래=하락추세. 5,000↑ 강세 / 4,200↓ 약세 경계 (2026년 기준)' },
  NASDAQ: { title:'NASDAQ Composite', desc:'미국 기술주·성장주 중심. 엔비디아·애플·MS 등 AI·반도체 비중이 높아 금리 변화에 매우 민감.', up:'금리 하락·AI 투자 확대 → 국내 반도체·AI 관련주 동반 상승 기대', down:'금리 상승·성장주 밸류 부담 → 국내 IT·게임주 동반 약세 경계', tip:'📌 NASDAQ/S&P 비율 상승=성장주 선호 국면. 18,000↑ 강세 / 14,000↓ 약세 경계 (2026년 기준)' },
  DOW:    { title:'DOW Jones 산업평균', desc:'미국 30개 우량 산업주 단순평균. 전통 제조업·금융·에너지 비중이 높아 경기 민감도 대표.', up:'전통 산업·경기 회복 신호 → 원자재·소재·금융 관련 종목 긍정', down:'경기 침체 우려 → 필수소비재·헬스케어 등 방어 섹터로 이동 검토', tip:'📌 S&P500과 동반 하락 시 본격 약세장. 40,000↑ 강세 / 35,000↓ 약세 경계 (2026년 기준)' },
  DAX:    { title:'DAX 40 (독일)', desc:'독일 40개 대형주. 자동차·산업재·화학 비중이 높아 유럽 제조업 경기 대표.', up:'유럽 경기 회복·에너지 안정 → 국내 자동차·부품 수출주 긍정', down:'에너지 위기·러시아 리스크·유럽 경기 둔화 → 글로벌 제조업 전반 부정', tip:'📌 유로/달러 환율과 함께 확인. 유로 강세=DAX 수출주 부담' },
  US10Y:  { title:'미국 10년 국채 금리', desc:'전 세계 모든 자산의 기준금리. 주식 밸류에이션(PER)에 직접 영향.', up:'금리 상승 → 성장주·바이오·IT 하락 압력. 고PER 종목 매도, 금융·가치주 방어', down:'금리 하락 → 성장주 재평가. 바이오·2차전지·게임 등 고PER 섹터 긍정', tip:'📌 4.5%↑=성장주 위험 / 3.5%↓=성장주 환경 개선 / 5%↑=전면 하락 압력' },
  US2Y:   { title:'미국 단기금리 (3M T-Bill)', desc:'연방기준금리와 가장 가깝게 움직이는 단기 국채. 현재 통화정책 방향을 실시간 반영.', up:'연준 긴축 지속·금리 인하 기대 후퇴 → 주식 전반 하락 압력, 달러 강세', down:'연준 피벗(금리 인하) 기대 → 주식·신흥국·원자재 긍정', tip:'📌 10Y-3M 스프레드 역전(음수)=경기침체 확률 급상승. 현재 스프레드 주시' },
  SPREAD: { title:'장단기 금리차 (10Y - 3M)', desc:'미국 10년물 국채금리에서 3개월물을 뺀 값. 역사적으로 음수(역전) 이후 6~18개월 내 경기침체 발생률이 높아 가장 신뢰도 높은 선행지표.', up:'스프레드 확대 → 경기 회복 기대. 은행 대출 마진 증가, 금융주 긍정', down:'스프레드 축소·역전 → 경기침체 경보. 안전자산(채권·금·달러) 선호 증가', tip:'📌 +0.5%↑=정상 / 0%근처=주의 / 음수=역전(경기침체 경보). 현재 역전 해소 여부가 핵심 (2026년 기준)' },
  KR10Y:  { title:'한국 10년 국채 금리', desc:'국내 기준금리·경기 전망·외국인 채권 투자를 반영. 미국 10년물과 연동되며 원화 환율에도 영향.', up:'한미 금리차 축소·국내 인플레 우려 → 외국인 채권 이탈 가능, 원화 약세', down:'한국은행 금리 인하 기대 → 부동산·리츠·금융주 긍정', tip:'📌 한미 금리차 -1.5%p 이상 역전=외국인 이탈·원화 약세 위험 확대' },
  CB_US:  { title:'미국 기준금리 (Fed Funds Rate)', desc:'미 연준(Fed)이 결정하는 정책금리. 전 세계 금융시장의 가장 중요한 단일 변수.', up:'금리 인상 → 달러 강세, 신흥국 자금 이탈, 주식 밸류에이션 하락', down:'금리 인하 → 위험자산 선호, 신흥국 자금 유입, 성장주 강세', tip:'📌 5%↑=긴축 구간. 인하 사이클 시작=주식 강세 선행 신호' },
  CB_KR:  { title:'한국 기준금리 (BOK 기준금리)', desc:'한국은행 금융통화위원회가 결정하는 정책금리. 국내 대출금리·부동산·소비에 직접 영향.', up:'금리 인상 → 대출 부담 증가, 부동산 하락 압력, 고PER 성장주 약세', down:'금리 인하 → 내수 소비 활성화, 부동산 지지, 바이오·IT 성장주 강세', tip:'📌 미국보다 낮으면 외국인 채권 이탈 압력. 한미 금리차 관리가 핵심' },
  CB_JP:  { title:'일본 기준금리 (BOJ 정책금리)', desc:'일본은행(BOJ)의 정책금리. 오랜 제로금리에서 벗어나는 과정으로 전 세계 엔 캐리 트레이드에 영향.', up:'금리 인상 → 엔화 강세, 캐리 트레이드 청산 → 신흥국 급락 위험', down:'금리 동결/인하 → 엔 약세 지속, 일본 수출주 호재', tip:'📌 BOJ 금리 인상은 전 세계 엔 캐리 청산 → 신흥국 동반 급락 가능. 고위험 이벤트' },
  CB_CN:  { title:'중국 기준금리 (LPR 1년)', desc:'중국 인민은행(PBoC)의 대출우대금리(LPR). 중국 내수 경기와 부동산 시장에 직접 영향.', up:'금리 인상 → 중국 내수 둔화 우려, 대중 수출 비중 높은 기업 부담', down:'금리 인하 → 중국 경기 부양, 소재·화학·뷰티 등 대중 수출주 긍정', tip:'📌 PBoC는 경기 부양을 위해 선제적 인하. 인하 발표 시 중국 관련주 급등 경향' },
  CB_EU:  { title:'유럽 기준금리 (ECB 예금금리)', desc:'유럽중앙은행(ECB)의 예금 금리. 유로화 강세/약세와 유럽 경기에 영향.', up:'금리 인상 → 유로 강세, 유럽 내수 둔화', down:'금리 인하 → 유로 약세, 유럽 수출 기업 호재', tip:'📌 ECB와 Fed 금리 차이가 유로/달러 환율 방향을 결정' },
  WTI:    { title:'WTI 원유 (미국산)', desc:'서부텍사스중질유. 인플레이션 및 물류비용에 직접 영향. 연준 통화정책 변수.', up:'인플레 재부상 → 연준 금리 인하 지연 → 성장주 부담. 에너지·화학주 긍정', down:'글로벌 경기 둔화 수요 감소 신호. 인플레 완화 → 금리 인하 기대 상승', tip:'📌 $90↑=인플레 경계 / $70↓=경기 침체 우려 / $110↑=에너지 위기 (2026년 기준)' },
  BRENT:  { title:'브렌트유 (국제 기준)', desc:'북해산 원유로 국제 원유 가격의 실질적 기준. 정유사·항공·해운 비용에 직접 영향.', up:'정유·화학 마진 상승. 항공·해운 비용 증가 → 해당 업종 수익성 악화', down:'항공·해운·물류 업종 수혜. 무역수지 개선 → 원화 강세 압력', tip:'📌 WTI 대비 $3~5 프리미엄이 정상. $95↑=인플레 경계 / $75↓=경기 둔화 신호 (2026년 기준)' },
  GOLD:   { title:'금 (Gold)', desc:'대표적 안전자산. 달러 가치와 역상관. 인플레·지정학 리스크·금리 하락기에 강세.', up:'안전자산 선호·달러 약세·인플레 우려 → 리스크 자산 경계. 방어적 포지션 고려', down:'달러 강세·실질금리 상승 → 금 약세. 위험자산 선호 복귀 신호일 수 있음', tip:'📌 $2,800↑=불안 상존 / $3,200↑=위기 대비 수요 급증 / $3,500↑=극도 불안. 금/구리 비율로 심리 확인 (2026년 기준)' },
  SILVER: { title:'은 (Silver)', desc:'산업용(전기차·태양광) + 귀금속 이중 성격. 금보다 변동성 크고 경기에 더 민감.', up:'산업 수요 확대 + 안전자산 수요 → 신재생에너지 섹터 긍정', down:'산업 수요 둔화 → 경기 침체 선행. 금 대비 은 약세=경기 비관론 확대', tip:'📌 금/은 비율 80↑=은이 상대적 저평가. 비율 복귀 시 은 강세 기대' },
  COPPER: { title:'구리 (닥터 쿠퍼)', desc:'건설·전자·자동차·전력 전방위 사용. 경기 실물 수요를 가장 잘 반영.', up:'글로벌 제조업 회복·중국 인프라 투자 → 소재·산업재·신흥국 주식 긍정', down:'글로벌 제조업 둔화·중국 수요 감소 → 경기침체 선행. 방어주 비중 확대', tip:'📌 구리/금 비율 하락=안전자산 선호 확대=주식 비중 축소 신호' },
  VIX:    { title:'VIX (공포지수)', desc:'S&P500 옵션 내재변동성. 시장 공포와 불확실성의 실시간 온도계. 주가와 역상관 관계.', up:'시장 공포 확대 → VIX 30↑ 시 역발상 매수 기회 탐색', down:'시장 안정·낙관 → VIX 15↓ 시 과도한 낙관, 조정 가능성 경계', tip:'📌 15↓ 안정 / 20↑ 불안 / 30↑ 공포(역발상 매수) / 40↑ 패닉. VIX 30 돌파 후 6~12개월 수익률 플러스 확률 80%+' },
  DXY:    { title:'달러인덱스 (DXY)', desc:'유로·엔·파운드 등 6개 주요 통화 대비 달러 강세 측정 종합지수.', up:'달러 강세 → 신흥국 자금 이탈, 원화 약세, 원자재 하락 압력', down:'달러 약세 → 신흥국·원자재·금 상승. 외국인 국내 증시 유입 증가 기대', tip:'📌 100↑ 달러 강세 / 95↓ 달러 약세. DXY 하락=신흥국 강세 공식이 역사적으로 유효' },
  FX_USD: { title:'USD/KRW (원달러)', desc:'1달러를 원화로 환산한 가격. 가장 중요한 환율 지표.', up:'원화 약세·달러 강세 → 수출 기업 호재, 수입 물가 상승, 외국인 이탈 압력', down:'원화 강세 → 수출 기업 부담, 수입 물가 하락, 외국인 유입 증가 기대', tip:'📌 1,500↑=외환 위기 경계 / 1,350↓=원화 강세 구간. 외국인 순매수와 역상관 (2026년 기준)' },
  FX_JPY: { title:'JPY/KRW (원엔, 100엔 기준)', desc:'100엔을 원화로 환산. 한일 무역 경쟁력·일본 여행 비용에 영향.', up:'엔 강세(원 약세) → 일본 수출 기업 경쟁력 약화, 일본 여행 비용 증가', down:'엔 약세(원 강세) → 국내 수출 기업 대일 경쟁력 강화, 일본 여행 저렴', tip:'📌 엔/달러 150↑=BOJ 개입 경계. 한일 수출 구조 유사 → 엔 약세=원화도 약세 압력' },
  FX_CNY: { title:'CNY/KRW (원위안)', desc:'1위안을 원화로 환산. 한중 무역 비중이 크므로 위안화 동향은 국내 수출에 직접 영향.', up:'위안 강세 → 중국 수입 능력 향상, 대중 수출 유리', down:'위안 약세 → 중국 수입 감소 압력, 대중 수출 비중 높은 기업 부담', tip:'📌 위안/달러 7.2↑=위안 약세 심화. 미중 무역 갈등 시 위안 약세 가속' },
  FX_EUR: { title:'EUR/KRW (원유로)', desc:'1유로를 원화로 환산. 유럽 경기와 ECB 통화정책을 간접 반영.', up:'유로 강세 → 유럽 경기 상대적 호조, 대유럽 수출 유리', down:'유로 약세 → 유럽 경기 둔화, 에너지 위기·정치 리스크 반영 가능', tip:'📌 유로/달러 1.10↑=달러 약세 구간. DXY 하락과 함께 원화 강세 압력' },
  HEATMAP: { title:'업종별 히트맵', desc:'오늘 각 업종의 등락률을 색상으로 표시합니다. 초록=상승, 파랑=하락, 색이 진할수록 변동폭이 큽니다.', tip:'📌 특정 업종만 초록이면 테마 장세. 반도체·2차전지 동반 하락 시 외국인 이탈 신호로 해석.' },
  FLOW:    { title:'외국인·기관 수급', desc:'오늘 코스피+코스닥 합산 순매수 금액입니다. 누가 사고 파느냐가 주가 방향을 결정합니다.', tip:'📌 외국인 매도 + 개인 매수 = 위험 신호 (개미들이 받아주는 구조). 외국인 연속 매도 시 지수 하락 압력.' },
}

// ── 업종 히트맵 섹터 정의 ─────────────────────────────
// changeRate는 API에서 받아 주입. 여기서는 섹터 메타만 정의.
export const HEATMAP_SECTORS = [
  { id:'semiconductor', name:'반도체·IT',   stocks:'삼성전자, SK하이닉스', themeColor:'#1d4ed8', inds_cd:'013' },
  { id:'battery',       name:'2차전지',      stocks:'LG에너지솔루션, 삼성SDI', themeColor:'#2563eb', inds_cd:'008' },
  { id:'auto',          name:'자동차',       stocks:'현대차, 기아', themeColor:'#3b82f6', inds_cd:'015' },
  { id:'bio',           name:'바이오·제약',  stocks:'삼성바이오, 셀트리온', themeColor:'#7c3aed', inds_cd:'009' },
  { id:'game',          name:'게임·엔터',   stocks:'HYBE, 엔씨소프트', themeColor:'#8b5cf6', inds_cd:'026' },
  { id:'finance',       name:'금융·보험',   stocks:'KB금융, 신한지주', themeColor:'#0891b2', inds_cd:'021' },
  { id:'energy',        name:'에너지',       stocks:'S-Oil, GS칼텍스', themeColor:'#16a34a', inds_cd:'017' },
  { id:'chemical',      name:'화학·소재',   stocks:'LG화학, 롯데케미칼', themeColor:'#15803d', inds_cd:'008' },
  { id:'telecom',       name:'통신',         stocks:'SKT, KT', themeColor:'#64748b', inds_cd:'020' },
  { id:'retail',        name:'유통·소비재', stocks:'이마트, 롯데쇼핑', themeColor:'#94a3b8', inds_cd:'016' },
  { id:'construct',     name:'건설·부동산', stocks:'현대건설, DL이앤씨', themeColor:'#0369a1', inds_cd:'018' },
  { id:'shipyard',      name:'조선·기계',   stocks:'HD한국조선해양, 두산에너빌', themeColor:'#0e7490', inds_cd:'012' },
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
