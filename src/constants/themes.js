// src/constants/themes.js
// DashboardPage · ThemePage · WatchlistPage · ChartAnalysisPage · ETFPage 에서 공동 사용
// ✅ 단일 소스 — 여기서만 수정하면 전체 반영

export const ALL_THEMES = [
  {
    id:'semi', label:'반도체·AI', color:'#2563eb', emoji:'💻',
    desc:'HBM·AI 서버·파운드리 중심의 반도체 산업 전반',
    keywords:['HBM','AI서버','파운드리','CoWoS','DDR5','GPU','NPU'],
    etf:[
      {name:'KODEX 반도체', code:'091160', cap:15000},
      {name:'TIGER 반도체', code:'091230', cap:8000},
    ],
    stocks:[
      {name:'삼성전자',   code:'005930', desc:'HBM·파운드리 글로벌 1위'},
      {name:'SK하이닉스', code:'000660', desc:'HBM3E 최대 공급사'},
      {name:'한미반도체', code:'042700', desc:'HBM TC본더 독점 공급'},
      {name:'DB하이텍',   code:'000990', desc:'파운드리 8인치 전문'},
      {name:'리노공업',   code:'058470', desc:'AI 반도체 소켓 공급'},
      {name:'이수페타시스',code:'007660', desc:'AI서버 PCB 핵심 부품'},
    ],
  },
  {
    id:'defense', label:'방산', color:'#dc2626', emoji:'🛡️',
    desc:'K-방산 수출 확대 및 유럽·중동 수주 산업',
    keywords:['K-방산','수출수주','유럽재무장','FA-50','K2전차','K9자주포'],
    etf:[
      // ✅ 수정: 459580(KODEX CD금리→오류), 453810(인도Nifty50→오류)
      {name:'KODEX K방산TOP10', code:'0080G0', cap:5000},
      {name:'TIGER K방산&우주', code:'463250', cap:3000},
    ],
    stocks:[
      {name:'한화에어로스페이스', code:'012450', desc:'K9·레드백 수출 선도'},
      {name:'현대로템',           code:'064350', desc:'K2전차 폴란드 수출'},
      {name:'LIG넥스원',          code:'079550', desc:'유도무기·레이더'},
      {name:'한화시스템',          code:'272210', desc:'방산 전자·레이더'},
      {name:'KAI',                code:'047810', desc:'FA-50·수리온 항공기'},
      {name:'풍산',               code:'103140', desc:'탄약 전문 방산기업'},
    ],
  },
  {
    id:'ship', label:'조선', color:'#0d9488', emoji:'🚢',
    desc:'LNG·친환경 선박 중심의 고부가 선종 수주 산업',
    keywords:['LNG선','VLCC','선가상승','수주잔고','친환경선박','FLNG'],
    etf:[
      {name:'KODEX 조선', code:'139220', cap:3000},
      {name:'TIGER 조선', code:'395160', cap:2000},
    ],
    stocks:[
      {name:'HD현대중공업', code:'329180', desc:'조선 글로벌 1위 수주'},
      {name:'삼성중공업',   code:'010140', desc:'LNG선·FLNG 특화'},
      {name:'한화오션',     code:'042660', desc:'특수선·잠수함 기술'},
      // ✅ 수정: 010620 HD현대미포(2025.12 상장폐지) → 443060 HD현대마린솔루션
      {name:'HD현대마린솔루션', code:'443060', desc:'선박 서비스·솔루션 1위'},
      {name:'HD현대',       code:'267250', desc:'조선 지주사'},
      {name:'동성화인텍',   code:'033500', desc:'선박 단열재 1위'},
    ],
  },
  {
    id:'nuclear', label:'원전·전력', color:'#d97706', emoji:'⚡',
    desc:'AI 데이터센터 전력 수요 + 원전 르네상스 수혜',
    keywords:['SMR','원전수출','전력망','HVDC','데이터센터','APR1400'],
    etf:[
      {name:'KODEX 원자력', code:'445290', cap:4000},
      {name:'TIGER 원자력', code:'425420', cap:3500},
    ],
    stocks:[
      {name:'두산에너빌리티', code:'034020', desc:'원전 주기기 국내 독점'},
      {name:'효성중공업',     code:'298040', desc:'초고압 변압기 글로벌'},
      {name:'일진전기',       code:'103590', desc:'전력기기 수출 확대'},
      {name:'LS ELECTRIC',   code:'010120', desc:'전력 인프라 솔루션'},
      {name:'한전기술',       code:'052690', desc:'원전 설계 엔지니어링'},
      {name:'비에이치아이',   code:'083650', desc:'원전 보조기기 전문'},
    ],
  },
  {
    id:'battery', label:'2차전지', color:'#16a34a', emoji:'🔋',
    desc:'EV 성장과 ESS 수요 확대에 따른 배터리 산업',
    keywords:['전고체','LFP','원통형','에너지밀도','충전속도','ESS'],
    etf:[
      {name:'KODEX 2차전지', code:'305720', cap:6000},
      {name:'TIGER 2차전지', code:'364980', cap:4000},
    ],
    stocks:[
      {name:'LG에너지솔루션', code:'373220', desc:'글로벌 배터리 2위'},
      {name:'삼성SDI',        code:'006400', desc:'전고체 배터리 선도'},
      {name:'POSCO홀딩스',    code:'005490', desc:'리튬·니켈 소재 수직계열'},
      {name:'에코프로비엠',   code:'247540', desc:'양극재 국내 1위'},
      {name:'포스코퓨처엠',   code:'003670', desc:'양극재·음극재 통합'},
      {name:'엘앤에프',       code:'066970', desc:'삼원계 양극재 전문'},
    ],
  },
  {
    id:'bio', label:'바이오', color:'#7c3aed', emoji:'🧬',
    desc:'글로벌 바이오시밀러·신약 개발 및 CDMO 산업',
    keywords:['바이오시밀러','항체의약품','CDMO','ADC','GLP-1','mRNA'],
    etf:[
      {name:'KODEX 바이오', code:'244580', cap:5000},
      {name:'TIGER 바이오', code:'143460', cap:3000},
    ],
    stocks:[
      {name:'셀트리온',         code:'068270', desc:'바이오시밀러 글로벌 1위'},
      {name:'삼성바이오로직스', code:'207940', desc:'CDMO 글로벌 1위'},
      {name:'HLB',              code:'028300', desc:'리보세라닙 FDA 심사'},
      {name:'한미약품',         code:'128940', desc:'GLP-1 계열 신약 개발'},
      {name:'유한양행',         code:'000100', desc:'렉라자 글로벌 판권'},
      {name:'알테오젠',         code:'196170', desc:'SC 제형화 플랫폼'},
    ],
  },
  {
    id:'value', label:'밸류업·금융', color:'#ea580c', emoji:'🏦',
    desc:'기업가치 제고 정책 수혜 및 주주환원 확대 금융주',
    keywords:['밸류업','PBR','주주환원','자사주소각','배당확대','ROE'],
    etf:[
      {name:'KODEX 밸류업', code:'473190', cap:4000},
      {name:'TIGER 밸류업', code:'474220', cap:3000},
    ],
    stocks:[
      {name:'KB금융',   code:'105560', desc:'밸류업 선도 금융지주'},
      {name:'신한지주', code:'055550', desc:'배당·자사주 환원 확대'},
      {name:'하나금융', code:'086790', desc:'ROE 개선 지속'},
      {name:'우리금융', code:'316140', desc:'주주환원 강화'},
      {name:'메리츠금융',code:'138040', desc:'고ROE 유지 보험지주'},
      {name:'삼성화재', code:'000810', desc:'보험 밸류업 대표주'},
    ],
  },
  {
    id:'it', label:'IT·소프트웨어', color:'#6366f1', emoji:'💡',
    desc:'AI 전환·클라우드·SaaS 중심의 국내 IT 기업',
    keywords:['AI전환','클라우드','SaaS','AI에이전트','데이터센터','API'],
    etf:[{name:'KODEX IT', code:'266360', cap:3000}],
    stocks:[
      {name:'카카오',   code:'035720', desc:'카카오톡 AI 전환'},
      {name:'네이버',   code:'035420', desc:'하이퍼클로바X 생태계'},
      {name:'크래프톤', code:'259960', desc:'AI 게임·배틀그라운드'},
      {name:'카카오뱅크',code:'323410', desc:'인터넷은행 1위'},
      {name:'더존비즈온',code:'012510', desc:'ERP·클라우드 전환'},
    ],
  },
  {
    id:'auto', label:'자동차·모빌리티', color:'#0891b2', emoji:'🚗',
    desc:'전기차 전환과 자율주행 기술 중심의 모빌리티 산업',
    keywords:['EV','ADAS','자율주행','전동화','SDV','OTA'],
    etf:[{name:'KODEX 자동차', code:'091180', cap:2000}],
    stocks:[
      {name:'현대차',   code:'005380', desc:'EV·수소차 글로벌 확장'},
      {name:'기아',     code:'000270', desc:'EV6·EV9 수출 성장'},
      {name:'현대모비스',code:'012330', desc:'전동화 부품 핵심'},
      {name:'HL만도',   code:'204320', desc:'ADAS·전동화 부품'},
      // ✅ 수정: 000920(삼아알미늄→오류) → 005850 에스엘(자동차 램프·부품)
      {name:'에스엘',   code:'005850', desc:'자동차 램프·전동화 부품'},
    ],
  },
  {
    id:'green', label:'친환경·ESG', color:'#059669', emoji:'🌿',
    desc:'탄소중립·재생에너지·친환경 산업 전환 수혜',
    keywords:['탄소중립','태양광','풍력','수소','RE100','탄소크레딧'],
    etf:[{name:'KODEX 탄소효율그린뉴딜', code:'375770', cap:1000}],
    stocks:[
      {name:'OCI홀딩스',  code:'010060', desc:'태양광 폴리실리콘'},
      {name:'씨에스윈드', code:'112610', desc:'풍력 타워 글로벌 1위'},
      {name:'한화솔루션', code:'009830', desc:'태양광 모듈·수소'},
      {name:'SK이노베이션',code:'096770', desc:'배터리·친환경 전환'},
    ],
  },
  {
    id:'chemical', label:'화학·소재', color:'#78716c', emoji:'⚗️',
    desc:'고부가 스페셜티·반도체 소재 중심의 화학 산업',
    keywords:['스페셜티','반도체소재','전지소재','탄소소재','고기능성'],
    etf:[{name:'KODEX 화학', code:'117460', cap:2000}],
    stocks:[
      {name:'LG화학',    code:'051910', desc:'배터리 소재·석화 전환'},
      {name:'롯데케미칼', code:'011170', desc:'수소·친환경 소재'},
      {name:'금호석유',   code:'011780', desc:'합성고무 글로벌'},
      {name:'SKC',       code:'011790', desc:'반도체 소재·동박'},
    ],
  },
  {
    id:'consumer', label:'소비재·유통', color:'#f59e0b', emoji:'🛍️',
    desc:'내수 회복·K-소비재 수출 확대 수혜 기업',
    keywords:['내수회복','K-뷰티','K-푸드','온라인쇼핑','리오프닝'],
    etf:[{name:'KODEX 소비재', code:'228800', cap:2000}],
    stocks:[
      {name:'CJ제일제당', code:'097950', desc:'K-푸드 글로벌 확장'},
      {name:'BGF리테일',  code:'282330', desc:'편의점 CU 1위'},
      {name:'이마트',     code:'139480', desc:'유통 구조조정'},
      {name:'아모레퍼시픽',code:'090430', desc:'K-뷰티 글로벌'},
      {name:'LG생활건강', code:'051900', desc:'뷰티·생활용품'},
    ],
  },
]

// 대시보드 기본 표시 테마 (7개)
export const DEFAULT_ACTIVE_IDS = ['semi','defense','ship','nuclear','battery','bio','value']

// 테마 색상 맵 (빠른 조회용)
export const THEME_COLOR_MAP = Object.fromEntries(
  ALL_THEMES.map(t => [t.id, t.color])
)

// 테마 라벨 맵
export const THEME_LABEL_MAP = Object.fromEntries(
  ALL_THEMES.map(t => [t.id, t.label])
)

// 전체 종목 코드 목록 (중복 제거)
export const ALL_STOCK_CODES = [...new Set(
  ALL_THEMES.flatMap(t => [
    ...t.etf.map(e => e.code),
    ...t.stocks.map(s => s.code),
  ])
)]

// 코드 → 종목명 맵
export const CODE_TO_NAME = Object.fromEntries(
  ALL_THEMES.flatMap(t => [
    ...t.etf.map(e => [e.code, e.name]),
    ...t.stocks.map(s => [s.code, s.name]),
  ])
)

// 코드 → 테마 맵
export const CODE_TO_THEME = Object.fromEntries(
  ALL_THEMES.flatMap(t => [
    ...t.etf.map(e => [e.code, t.id]),
    ...t.stocks.map(s => [s.code, t.id]),
  ])
)
