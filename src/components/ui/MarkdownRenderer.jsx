// src/components/ui/MarkdownRenderer.jsx
// 외부 라이브러리 없이 마크다운 → JSX 렌더링
// 지원: ## 헤딩, **bold**, `code`, ---, - 리스트, | 테이블

import './MarkdownRenderer.css'

function parseInline(text) {
  // [text](url), **bold**, *italic*, `code` 인라인 파싱
  const parts = []
  const re = /(\[([^\]]+)\]\((https?:\/\/[^\)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let last = 0, m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[2] && m[3]) {
      // 링크: [text](url)
      parts.push(
        <a key={m.index} href={m[3]} target="_blank" rel="noreferrer noopener"
          className="md-link">{m[2]}</a>
      )
    } else if (m[4]) parts.push(<strong key={m.index}>{m[4]}</strong>)
    else if (m[5]) parts.push(<em key={m.index}>{m[5]}</em>)
    else if (m[6]) parts.push(<code key={m.index} className="md-inline-code">{m[6]}</code>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : text
}

function parseLine(line, idx) {
  // ### h3
  if (/^###\s+/.test(line))
    return <h3 key={idx} className="md-h3">{parseInline(line.replace(/^###\s+/, ''))}</h3>
  // ## h2
  if (/^##\s+/.test(line))
    return <h2 key={idx} className="md-h2">{parseInline(line.replace(/^##\s+/, ''))}</h2>
  // # h1
  if (/^#\s+/.test(line))
    return <h1 key={idx} className="md-h1">{parseInline(line.replace(/^#\s+/, ''))}</h1>
  // --- 구분선
  if (/^---+$/.test(line.trim()))
    return <hr key={idx} className="md-hr"/>
  // - 리스트
  if (/^[-*]\s+/.test(line))
    return <li key={idx} className="md-li">{parseInline(line.replace(/^[-*]\s+/, ''))}</li>
  // 빈 줄
  if (!line.trim())
    return <div key={idx} className="md-br"/>
  // 일반 텍스트
  return <p key={idx} className="md-p">{parseInline(line)}</p>
}

export default function MarkdownRenderer({ text, className = '' }) {
  if (!text) return null

  const lines  = text.split('\n')
  const output = []
  let   liGroup = []

  lines.forEach((line, i) => {
    const isLi = /^[-*]\s+/.test(line)
    if (isLi) {
      liGroup.push(parseLine(line, i))
    } else {
      if (liGroup.length) {
        output.push(<ul key={`ul-${i}`} className="md-ul">{liGroup}</ul>)
        liGroup = []
      }
      output.push(parseLine(line, i))
    }
  })
  if (liGroup.length) output.push(<ul key="ul-last" className="md-ul">{liGroup}</ul>)

  return <div className={`md-body ${className}`}>{output}</div>
}
