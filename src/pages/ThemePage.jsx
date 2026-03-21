// ThemePage.jsx 의 fetchThemeAI 함수를 아래로 교체해주세요

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
      // ✅ 웹 검색 툴 추가
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `웹 검색을 사용해서 오늘(${today}) 기준 한국 증시 "${theme.label}" 테마(${theme.desc})의 최신 동향을 찾아보고 아래 형식으로 분석해줘.

검색어: ${theme.keywords.join(' ')} 주식 뉴스 ${today}

## 📌 테마 현황 한줄 요약
(오늘 이 테마의 전반적인 분위기)

## 🔑 핵심 모멘텀 (지금 움직이는 이유)
1. (요인 1)
2. (요인 2)
3. (요인 3)

## 📈 주목 종목 & 투자포인트
- 종목명: 구체적인 이유 (한줄)
- 종목명: 구체적인 이유 (한줄)
- 종목명: 구체적인 이유 (한줄)

## ⚠️ 주요 리스크
(이 테마의 리스크 2가지)

## 💡 지금 투자 전략
(지금 이 테마에 대한 비중·타이밍 전략, 2~3줄)

반드시 웹 검색으로 최신 뉴스를 찾아서 실제 데이터 기반으로 작성해줘.`,
      }],
    }),
  })
  if (!res.ok) throw new Error(`API 오류 ${res.status}`)
  const data = await res.json()
  // 텍스트 블록만 추출 (tool_use 블록 제외)
  const text = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
  if (!text.trim()) throw new Error('분석 결과를 가져오지 못했어요.')
  return text
}