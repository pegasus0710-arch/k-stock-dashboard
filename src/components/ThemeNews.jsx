import { useState } from 'react'
import './ThemeNews.css'

const THEMES = [
  { id: 'semi',    label: '반도체·AI',  color: 'var(--theme-semi)',    keyword: '반도체 AI HBM SK하이닉스 삼성전자' },
  { id: 'defense', label: '방산',        color: 'var(--theme-defense)', keyword: '방산 한화에어로스페이스 현대로템 K방산 수출' },
  { id: 'ship',    label: '조선',        color: 'var(--theme-ship)',    keyword: '조선 HD현대중공업 삼성중공업 LNG 수주' },
  { id: 'nuclear', label: '원전·전력',   color: 'var(--theme-nuclear)', keyword: '원전 두산에너빌리티 효성중공업 SMR 전력기기' },
  { id: 'battery', label: '2차전지',     color: 'var(--theme-battery)', keyword: '2차전지 배터리 LG에너지솔루션 ESS 전기차' },
  { id: 'bio',     label: '바이오',      color: 'var(--theme-bio)',     keyword: '바이오 셀트리온 삼성바이오로직스 신약 임상' },
  { id: 'value',   label: '밸류업·금융', color: 'var(--theme-value)',   keyword: '밸류업 금융주 KB금융 신한지주 배당 저PBR' },
]

export default function ThemeNews() {
  const [activeTheme, setActiveTheme] = useState('semi')
  const [summary,     setSummary]     = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  const theme = THEMES.find(t => t.id === activeTheme)

  const handleTheme = (id) => {
    setActiveTheme(id)
    setSummary('')
    setError('')
  }

  const fetchSummary = async () => {
    setLoading(true)
    setSummary('')
    setError('')

    const apiKey = import.meta.env.VITE_CLAUDE_API_KEY
    if (!apiKey) {
      setError('API 키가 설정되지 않았어요. Vercel 환경변수를 확인해주세요.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `오늘 날짜 기준(${new Date().toLocaleDateString('ko-KR')}) 한국 증시에서 "${theme.label}" 테마(키워드: ${theme.keyword})의 주요 동향을 아래 형식으로 정리해줘.

형식:
📌 오늘의 핵심 이슈 (2~3줄)
📈 주목 종목 & 포인트 (종목명과 이유 2~3개)
⚠️ 리스크 요인 (1~2줄)
💡 내일 체크포인트 (1~2줄)

간결하고 투자자 관점에서 실용적으로 작성해줘.`,
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
          <span className="news-theme-label" style={{ color: theme.color }}>
            {theme.label} 분석
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            
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
              {loading ? '분석 중...' : '✦ AI 분석'}
            </button>
          </div>
        </div>

        {error && (
          <div className="error-box">{error}</div>
        )}

        {!summary && !loading && !error && (
          <div className="news-guide">
            <div className="guide-step">
              <div className="step-num">✦</div>
              <div className="step-body">
                <strong>AI 분석 버튼을 눌러보세요</strong>
                <p>Claude가 {theme.label} 테마의 오늘 동향, 주목 종목, 리스크 요인을 실시간으로 분석해드려요.</p>
              </div>
            </div>
            <div className="keyword-section">
              <span className="dim" style={{ fontSize: 12 }}>관련 키워드:</span>
              <div className="keyword-tags">
                {theme.keyword.split(' ').map(kw => (
                  
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
            <p>Claude가 {theme.label} 테마를 분석하고 있어요...</p>
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