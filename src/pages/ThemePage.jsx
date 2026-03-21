import { useState } from 'react'
import './ThemePage.css'

const THEMES = [
  {
    id:'semi', label:'반도체·AI', color:'#2563eb', emoji:'💻',
    desc:'HBM·AI 서버·파운드리 중심의 반도체 산업 전반',
    keywords:['HBM','AI서버','파운드리','CoWoS','DDR5','GPU','NPU'],
    etf:[{name:'KODEX 반도체',code:'091160'},{name:'TIGER 반도체',code:'091230'}],
    stocks:[
      {name:'삼성전자',  code:'005930',desc:'HBM·파운드리 글로벌 1위'},
      {name:'SK하이닉스',code:'000660',desc:'HBM3E 최대 공급사'},
      {name:'한미반도체',code:'042700',desc:'HBM TC본더 독점 공급'},
      {name:'DB하이텍',  code:'000990',desc:'파운드리 8인치 전문'},
      {name:'리노공업',  code:'058470',desc:'AI 반도체 소켓 공급'},
      {name:'이수페타시스',code:'007660',desc:'AI서버 PCB 핵심 부품'},
    ],
  },
  {
    id:'defense', label:'방산', color:'#dc2626', emoji:'🛡️',
    desc:'K-방산 수출 확대 및 유럽·중동 수주 산업',
    keywords:['K-방산','수출수주','유럽재무장','FA-50','K2전차','K9자주포'],
    etf:[{name:'KODEX K-방산',code:'459580'},{name:'TIGER 방산',code:'453810'}],
    stocks:[
      {name:'한화에어로스페이스',code:'012450',desc:'K9·레드백 수출 선도'},
      {name:'현대로템',code:'064350',desc:'K2전차 폴란드 수출'},
      {name:'LIG넥스원',code:'079550',desc:'유도무기·레이더'},
      {name:'한화시스템',code:'272210',desc:'방산 전자·레이더'},
      {name:'KAI',code:'047810',desc:'FA-50·수리온 항공기'},
      {name:'풍산',code:'103140',desc:'탄약 전문 방산기업'},
    ],
  },
  {
    id:'ship', label:'조선', color:'#0d9488', emoji:'🚢',
    desc:'LNG·친환경 선박 중심의 고부가 선종 수주 산업',
    keywords:['LNG선','VLCC','선가상승','수주잔고','친환경선박','FLNG'],
    etf:[{name:'KODEX 조선',code:'139220'},{name:'TIGER 조선',code:'395160'}],
    stocks:[
      {name:'HD현대중공업',code:'329180',desc:'조선 글로벌 1위 수주'},
      {name:'삼성중공업',code:'010140',desc:'LNG선·FLNG 특화'},
      {name:'한화오션',code:'042660',desc:'특수선·잠수함 기술'},
      {name:'HD현대미포',code:'010620',desc:'중형 LPG·PC선 전문'},
      {name:'HD현대',code:'267250',desc:'조선 지주사'},
      {name:'동성화인텍',code:'033500',desc:'선박 단열재 1위'},
    ],
  },
  {
    id:'nuclear', label:'원전·전력', color:'#d97706', emoji:'⚡',
    desc:'AI 데이터센터 전력 수요 + 원전 르네상스 수혜',
    keywords:['SMR','원전수출','전력기기','APR1400','데이터센터','AI인프라'],
    etf:[{name:'KODEX 원자력',code:'445290'},{name:'TIGER 원자력',code:'425420'}],
    stocks:[
      {name:'두산에너빌리티',code:'034020',desc:'원전 주기기 핵심 공급'},
      {name:'효성중공업',code:'298040',desc:'변압기·GIS 수주 급증'},
      {name:'일진전기',code:'103590',desc:'변압기 AI 인프라 수혜'},
      {name:'한전기술',code:'051600',desc:'원전 설계 전문기업'},
      {name:'LS Electric',code:'010120',desc:'전력기기 종합 1위'},
      {name:'비에이치아이',code:'083650',desc:'원전 보조기기 공급'},
    ],
  },
  {
    id:'battery', label:'2차전지', color:'#16a34a', emoji:'🔋',
    desc:'ESS 수요 확대·전기차 회복 국면의 배터리 산업',
    keywords:['ESS','전기차','LFP','전고체','NCA','NCM','양극재'],
    etf:[{name:'KODEX 2차전지',code:'305720'},{name:'TIGER 2차전지',code:'364980'}],
    stocks:[
      {name:'LG에너지솔루션',code:'373220',desc:'글로벌 배터리 2위'},
      {name:'삼성SDI',code:'006400',desc:'전고체 배터리 선도'},
      {name:'POSCO홀딩스',code:'005490',desc:'양극재·리튬 수직계열'},
      {name:'LG화학',code:'051910',desc:'양극재 원소재 공급'},
      {name:'에코프로비엠',code:'247540',desc:'양극재 국내 1위'},
      {name:'엘앤에프',code:'066970',desc:'하이니켈 양극재 전문'},
    ],
  },
  {
    id:'bio', label:'바이오', color:'#7c3aed', emoji:'🧬',
    desc:'글로벌 바이오 라이선싱·CMO 수요 확대 수혜',
    keywords:['CMO','CDO','항체치료제','임상3상','기술수출','ADC'],
    etf:[{name:'KODEX 바이오',code:'244580'},{name:'TIGER 바이오',code:'143460'}],
    stocks:[
      {name:'삼성바이오로직스',code:'207940',desc:'CMO 글로벌 1위'},
      {name:'셀트리온',code:'068270',desc:'바이오시밀러 글로벌'},
      {name:'HLB',code:'028300',desc:'리보세라닙 글로벌 임상'},
      {name:'한미약품',code:'128940',desc:'비만치료제 기술수출'},
      {name:'유한양행',code:'000100',desc:'BI 기술이전 성과'},
      {name:'알테오젠',code:'196170',desc:'피하주사 플랫폼 ADC'},
    ],
  },
  {
    id:'value', label:'밸류업·금융', color:'#ea580c', emoji:'🏦',
    desc:'코리아 디스카운트 해소·배당 확대 정책 수혜',
    keywords:['밸류업','배당확대','자사주소각','저PBR','ROE개선','주주환원'],
    etf:[{name:'KODEX 밸류업',code:'473190'},{name:'TIGER 코리아밸류업',code:'474220'}],
    stocks:[
      {name:'KB금융',code:'105560',desc:'은행 밸류업 선도'},
      {name:'신한지주',code:'055550',desc:'배당·자사주 정책 강화'},
      {name:'하나금융지주',code:'086790',desc:'밸류업 적극 참여'},
      {name:'우리금융지주',code:'316140',desc:'저PBR 회복 기대'},
      {name:'메리츠금융',code:'138040',desc:'고ROE 금융지주'},
      {name:'DB손해보험',code:'005830',desc:'보험 밸류업 대표주'},
    ],
  },
]

// ✅ 웹 검색 기능 포함된 AI 분석 함수
async function fetchThemeAI(apiKey, theme) {
  const today = new Date().toLocaleDateString('ko-KR')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `웹 검색을 사용해서 오늘(${today}) 기준 한국 증시 "${theme.label}" 테마의 최신 뉴스와 동향을 찾아보고 아래 형식으로 분석해줘.

검색어: ${theme.keywords.slice(0,4).join(' ')} 주식 뉴스

## 📌 테마 현황 한줄 요약
## 🔑 핵심 모멘텀
1.
2.
3.
## 📈 주목 종목 & 투자포인트
- 종목명: 이유
- 종목명: 이유
## ⚠️ 주요 리스크
## 💡 지금 투자 전략

반드시 웹 검색으로 최신 뉴스를 찾아서 실제 데이터 기반으로 작성해줘.`,
      }],
    }),
  })
  if (!res.ok) throw new Error(`API 오류 ${res.status}`)
  const data = await res.json()
  const text = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
  if (!text.trim()) throw new Error('분석 결과를 가져오지 못했어요.')
  return text
}

const STORAGE_KEY = 'kstock_theme_ai'
function loadThemeAI() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const { date, data } = JSON.parse(raw)
    if (date !== new Date().toLocaleDateString('ko-KR')) { localStorage.removeItem(STORAGE_KEY); return {} }
    return data || {}
  } catch { return {} }
}
function saveThemeAI(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: new Date().toLocaleDateString('ko-KR'), data })) } catch {}
}

export default function ThemePage() {
  const [activeId, setActiveId] = useState(THEMES[0].id)
  const [aiCache, setAiCache]   = useState(() => loadThemeAI())
  const [aiLoading, setLoading] = useState(false)
  const [aiError, setError]     = useState('')

  const theme    = THEMES.find(t => t.id === activeId)
  const analysis = aiCache[theme.id]

  const handleTheme = (id) => { setActiveId(id); setError('') }

  const handleAI = async () => {
    if (aiLoading) return
    setLoading(true); setError('')
    try {
      const key = import.meta.env.VITE_CLAUDE_API_KEY
      if (!key) throw new Error('Claude API 키가 없어요.')
      const text = await fetchThemeAI(key, theme)
      const next = { ...aiCache, [theme.id]: text }
      setAiCache(next); saveThemeAI(next)
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const openNaver = (code) => window.open(`https://finance.naver.com/item/main.naver?code=${code}`, '_blank')

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">테마 분석</h1>
          <p className="page-sub">7대 핵심 테마 · 대표종목 · ETF · AI 분석</p>
        </div>
      </div>

      <div className="page-body">

        {/* 테마 선택 */}
        <div className="theme-selector-wrap">
          {THEMES.map(t => (
            <button key={t.id}
              className={`theme-sel-btn ${activeId === t.id ? 'active' : ''}`}
              style={{'--tc': t.color}}
              onClick={() => handleTheme(t.id)}>
              <span className="theme-sel-emoji">{t.emoji}</span>
              <span className="theme-sel-label">{t.label}</span>
              {aiCache[t.id] && <span className="theme-sel-dot"/>}
            </button>
          ))}
        </div>

        <div className="layout-main-aside">

          {/* 메인 */}
          <div className="theme-main">

            {/* 테마 헤더 */}
            <div className="card-section theme-hero" style={{borderLeft: `4px solid ${theme.color}`}}>
              <div className="theme-hero-top">
                <div className="theme-hero-title">
                  <span className="theme-hero-emoji">{theme.emoji}</span>
                  <span className="theme-hero-name" style={{color: theme.color}}>{theme.label}</span>
                </div>
                <button
                  className="btn-ai"
                  style={{background: theme.color}}
                  onClick={handleAI}
                  disabled={aiLoading}>
                  {aiLoading
                    ? <><span className="btn-spinner"/>검색 중...</>
                    : analysis
                      ? '↺ 다시 분석'
                      : <><span>🔍</span> AI 분석</>}
                </button>
              </div>
              <p className="theme-hero-desc">{theme.desc}</p>
              <div className="theme-keywords">
                {theme.keywords.map(k => (
                  <span key={k} className="keyword-chip"
                    style={{background: theme.color+'14', color: theme.color}}>
                    {k}
                  </span>
                ))}
              </div>
            </div>

            {/* AI 결과 */}
            {aiError && <div className="ai-error">{aiError}</div>}

            {aiLoading && (
              <div className="card-section ai-loading">
                <div className="spinner-lg" style={{borderTopColor: theme.color}}/>
                <p>🔍 웹에서 {theme.label} 최신 뉴스 검색 중...</p>
              </div>
            )}

            {analysis && !aiLoading && (
              <div className="card-section ai-result">
                <div className="ai-result-header">
                  <span className="section-title" style={{marginBottom:0}}>AI 분석 결과</span>
                  <span className="ai-result-badge" style={{background: theme.color+'18', color: theme.color}}>
                    🔍 웹 검색 기반 · 오늘 저장됨
                  </span>
                </div>
                <pre className="ai-result-text">{analysis}</pre>
              </div>
            )}

            {!analysis && !aiLoading && !aiError && (
              <div className="ai-placeholder">
                <div className="ai-placeholder-icon">{theme.emoji}</div>
                <p><strong>AI 분석</strong> 버튼을 눌러보세요</p>
                <p className="sub">웹을 실시간 검색해서 {theme.label} 최신 뉴스·동향을 분석해드려요<br/>오늘 분석은 자동 저장됩니다</p>
              </div>
            )}

            {/* 대표 종목 */}
            <div className="card-section">
              <div className="section-title-row">
                <span className="section-title">대표 종목</span>
                <a href="https://finance.naver.com/sise/theme.naver"
                   target="_blank" rel="noreferrer" className="section-more-link">
                  테마 전체 →
                </a>
              </div>
              <div className="card-grid">
                {theme.stocks.map(s => (
                  <button key={s.code} className="stock-card"
                    style={{'--sc': theme.color}}
                    onClick={() => openNaver(s.code)}>
                    <div className="stock-card-top">
                      <span className="stock-card-name">{s.name}</span>
                      <span className="stock-card-code">{s.code}</span>
                    </div>
                    <p className="stock-card-desc">{s.desc}</p>
                    <div className="stock-card-links">
                      <span className="stock-link-chip">네이버 →</span>
                      <span className="stock-link-chip">차트 →</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* 사이드바 */}
          <div className="theme-aside">

            <div className="card-section">
              <div className="section-title">관련 ETF</div>
              <div className="etf-list">
                {theme.etf.map(e => (
                  <a key={e.code}
                    href={`https://finance.naver.com/item/main.naver?code=${e.code}`}
                    target="_blank" rel="noreferrer"
                    className="etf-card" style={{'--tc': theme.color}}>
                    <div className="etf-dot" style={{background: theme.color}}/>
                    <div>
                      <div className="etf-name">{e.name}</div>
                      <div className="etf-code">{e.code}</div>
                    </div>
                    <span className="etf-arrow">→</span>
                  </a>
                ))}
              </div>
            </div>

            <div className="card-section">
              <div className="section-title">뉴스 · 공시</div>
              <div className="aside-links">
                <a href={`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(theme.label+' 주식')}&sort=1`}
                   target="_blank" rel="noreferrer" className="aside-link-item">
                  <span>📰</span><span>{theme.label} 최신 뉴스</span><span className="aside-link-arrow">→</span>
                </a>
                <a href="https://dart.fss.or.kr/dsab007/detailSearch.ax"
                   target="_blank" rel="noreferrer" className="aside-link-item">
                  <span>📋</span><span>관련 공시 검색</span><span className="aside-link-arrow">→</span>
                </a>
                <a href="https://finance.naver.com/research/industry_list.naver"
                   target="_blank" rel="noreferrer" className="aside-link-item">
                  <span>📊</span><span>증권사 리포트</span><span className="aside-link-arrow">→</span>
                </a>
              </div>
            </div>

            <div className="card-section">
              <div className="section-title">다른 테마</div>
              <div className="other-themes">
                {THEMES.filter(t => t.id !== activeId).map(t => (
                  <button key={t.id} className="other-theme-btn"
                    onClick={() => handleTheme(t.id)}>
                    <span>{t.emoji}</span>
                    <span className="other-theme-label">{t.label}</span>
                    {aiCache[t.id] && <span className="other-theme-cached">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="info-note">
              <span>💡</span>
              <span>키움 REST API 연동 후 실시간 주가·등락률·수급이 표시됩니다</span>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
