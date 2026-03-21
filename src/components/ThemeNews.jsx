import { useState } from 'react'
import './ThemeNews.css'

const THEMES = [
  { id: 'semi',    label: '반도체·AI',  color: 'var(--theme-semi)',    keyword: '반도체 AI HBM SK하이닉스 삼성전자', rss: '반도체 HBM AI 반도체' },
  { id: 'defense', label: '방산',        color: 'var(--theme-defense)', keyword: '방산 한화에어로스페이스 현대로템 K방산 수출', rss: '방산 한화에어로스페이스 K방산' },
  { id: 'ship',    label: '조선',        color: 'var(--theme-ship)',    keyword: '조선 HD현대중공업 삼성중공업 LNG 수주', rss: '조선 수주 LNG 현대중공업' },
  { id: 'nuclear', label: '원전·전력',   color: 'var(--theme-nuclear)', keyword: '원전 두산에너빌리티 효성중공업 SMR 전력기기', rss: '원전 SMR 두산에너빌리티' },
  { id: 'battery', label: '2차전지',     color: 'var(--theme-battery)', keyword: '2차전지 배터리 LG에너지솔루션 ESS 전기차', rss: '2차전지 배터리 LG에너지솔루션' },
  { id: 'bio',     label: '바이오',      color: 'var(--theme-bio)',     keyword: '바이오 셀트리온 삼성바이오로직스 신약 임상', rss: '바이오 셀트리온 신약 임상' },
  { id: 'value',   label: '밸류업·금융', color: 'var(--theme-value)',   keyword: '밸류업 금융주 KB금융 신한지주 배당 저PBR', rss: '밸류업 금융주 KB금융 배당' },
]

async function fetchNaverNews(keyword) {
  try {
    const query = encodeURIComponent(keyword)
    const rssUrl = `https://news.naver.com/rss/search.nhn?query=${query}`
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`
    const res = await fetch(proxyUrl)
    const data = await res.json()
    const xml = data.contents

    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')
    const items = doc.querySelectorAll('item')

    const headlines = []
    items.forEach((item, i) => {
      if (i >= 8) return
      const title = item.querySelector('title')?.textContent?.replace(/<[^>]*>/g, '').trim()
      const desc  = item.querySelector('description')?.textContent?.replace(/<[^>]*>/g, '').trim()
      const pubDate = item.querySelector('pubDate')?.textContent?.trim()
      if (title) headlines.push({ title, desc: desc?.slice(0, 100), pubDate })
    })
    return headlines
  } catch (e) {
    return []
  }
}

export default function ThemeNews() {
  const [activeTheme, setActiveTheme] = useState('semi')
  const [summary,     setSummary]     = useState('')
  const [loading,     setLoading]     = useState(false)
  const [loadingMsg,  setLoadingMsg]  = useState('')
  const [error,       setError]       = useState('')
  const [newsCount,   setNewsCount]   = useState(0)

  const theme = THEMES.find(t => t.id === activeTheme)

  const handleTheme = (id) => {
    setActiveTheme(id)
    setSummary('')
    setError('')
    setNewsCount(0)
  }

  const fetchSummary = async () => {
    setLoading(true)
    setSummary('')
    setError('')
    setNewsCount(0)

    const apiKey = import.meta.env.VITE_CLAUDE_API_KEY
    if (!apiKey) {
      setError('API 키가 설정되지 않았어요.')
      setLoading(false)
      return
    }

    try {
      // 1. 뉴스 수집
      setLoadingMsg('최신 뉴스 수집 중...')
      const headlines = await fetchNaverNews(theme.rss)
      setNewsCount(headlines.length)

      const newsText = headlines.length > 0
        ? headlines.map((h, i) => `${i+1}. ${h.title}${h.desc ? ' — ' + h.desc : ''}`).join('\n')
        : '(뉴스 수집 실패 — 일반 지식 기반으로 분석)'

      // 2. Claude 분석
      setLoadingMsg('Claude가 분석 중...')

      const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

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
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: `당신은 10년 경력의 한국 주식 전문 애널리스트입니다.
오늘 날짜: ${today}
분석 테마: ${theme.label} (키워드: ${theme.keyword})

[오늘 수집된 실제 뉴스 헤드라인]
${newsText}

위 뉴스를 바탕으로 아래 형식으로 분석해주세요. 반드시 구체적인 종목명, 수치, 근거를 포함해야 합니다.

📌 **오늘의 핵심 이슈**
(오늘 뉴스에서 가장 중요한 이슈 2~3가지, 구체적으로)

📈 **주목 종목 & 투자 포인트**
• 종목명 (코드): 투자 포인트와 근거 (수치 포함)
• 종목명 (코드): 투자 포인트와 근거 (수치 포함)
• 종목명 (코드): 투자 포인트와 근거 (수치 포함)

📊 **수급 & 모멘텀 판단**
(현재 이 테마의 모멘텀이 강한지 약한지, 외국인/기관 관심도)

⚠️ **리스크 요인**
(단기 리스크 1~2가지, 구체적으로)

💡 **오늘 체크포인트**
(투자자가 오늘 반드시 확인해야 할 것 2가지)

※ 뉴스가 없거나 부족한 경우 최근 업계 트렌드와 구조적 특성 기반으로 분석`,
          }],
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error?.message || `API 오류 ${res.status}`)
      }

      const data = await res.json()
      setSummary(data.content[0].text)
    } catch (e) {
      setError(`오류: ${e.message}`)
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  return (
    <div className="theme-news">
      <div className="theme-tabs">
        {THEMES.map(t => (
          <button
            key={t.id}
            className={`theme-tab ${activeTheme === t.id ? 'active' : ''}`}
            style={activeTheme === t.id ? { borderColor: t.color, color: t.color } : {}}
            onClick={() => handleTheme(t.id)}
          >
            <span className="tab-dot" style={{ background: t.color }} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="news-content">
        <div className="news-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="news-theme-label" style={{ color: theme.color }}>
              {theme.label} 분석
            </span>
            {newsCount > 0 && (
              <span className="news-count-badge">뉴스 {newsCount}건 반영</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href={`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(theme.keyword)}&sort=1`}
              target="_blank"
              rel="noreferrer"
              className="news-link-btn"
            >
              뉴스 보기 →
            </a>
            <button
              className="ai-btn"
              onClick={fetchSummary}
              disabled={loading}
              style={{ borderColor: theme.color + '88', color: theme.color }}
            >
              {loading ? loadingMsg || '분석 중...' : '✦ AI 분석'}
            </button>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        {!summary && !loading && !error && (
          <div className="news-guide">
            <div className="guide-step">
              <div className="step-num" style={{ background: `rgba(59,130,246,0.2)`, color: theme.color }}>✦</div>
              <div className="step-body">
                <strong>실시간 뉴스 기반 AI 분석</strong>
                <p>버튼을 누르면 오늘 최신 뉴스를 수집해서 Claude가 분석해드려요.<br/>
                종목별 투자 포인트, 리스크, 체크포인트를 구체적으로 제공해요.</p>
              </div>
            </div>
            <div className="keyword-section">
              <span className="dim" style={{ fontSize: 12 }}>관련 키워드:</span>
              <div className="keyword-tags">
                {theme.keyword.split(' ').map(kw => (
                  <a
                    key={kw}
                    href={`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(kw)}&sort=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="keyword-tag"
                    style={{ borderColor: theme.color + '44', color: theme.color }}
                  >
                    {kw}
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="loading-box">
            <div className="loading-spinner" />
            <p>{loadingMsg || '분석 중...'}</p>
          </div>
        )}

        {summary && (
          <div className="summary-box">
            <pre className="summary-text">{summary}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
