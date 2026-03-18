import './AiAnalysis.css'

export default function AiAnalysis() {
  return (
    <div className="ai-analysis">
      <div className="coming-soon-panel">
        <div className="cs-icon">✦</div>
        <h2>AI 종목 분석</h2>
        <p>Claude API 연동 후 활성화됩니다</p>
        <ul className="coming-list">
          <li>✓ 종목명 입력 → 종합 분석 리포트 자동 생성</li>
          <li>✓ 뉴스·공시·재무 통합 인사이트</li>
          <li>✓ 테마 브리핑 자동 작성</li>
          <li>✓ 매일 오전 브리핑 자동화</li>
        </ul>
        <p className="dim" style={{ fontSize: 12 }}>
          3단계: Claude API 키 설정 후 연동 예정
        </p>
      </div>
    </div>
  )
}
