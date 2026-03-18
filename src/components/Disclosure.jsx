import './Disclosure.css'

export default function Disclosure() {
  return (
    <div className="disclosure">
      <div className="coming-soon-panel">
        <div className="cs-icon">◈</div>
        <h2>공시·재무 분석</h2>
        <p>DART OpenAPI 연동 후 활성화됩니다</p>
        <ul className="coming-list">
          <li>✓ 종목별 최신 공시 목록</li>
          <li>✓ 사업보고서·분기보고서 링크</li>
          <li>✓ PER·PBR·ROE 자동 계산</li>
          <li>✓ 재무제표 시각화</li>
        </ul>
        <a
          href="https://dart.fss.or.kr/"
          target="_blank"
          rel="noreferrer"
          className="dart-btn"
        >
          지금 바로 DART 바로가기 →
        </a>
        <p className="dim" style={{ fontSize: 12, marginTop: 16 }}>
          2단계: DART API 키 발급 후 연동 예정
        </p>
      </div>
    </div>
  )
}
