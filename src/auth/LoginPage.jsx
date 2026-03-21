import { useState } from 'react'
import { signInWithPopup } from 'firebase/auth'
import { auth, googleProvider } from '../firebase'
import './LoginPage.css'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  /* 구글 로그인 */
  const loginWithGoogle = async () => {
    setLoading(true)
    setError('')
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') {
        setError('구글 로그인 중 오류가 발생했어요. 다시 시도해주세요.')
      }
    } finally {
      setLoading(false)
    }
  }

  /* 카카오 로그인 */
  const loginWithKakao = () => {
    const kakaoKey    = import.meta.env.VITE_KAKAO_JS_KEY
    const redirectUri = `${window.location.origin}/auth/kakao/callback`
    const kakaoUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${kakaoKey}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`
    window.location.href = kakaoUrl
  }

  return (
    <div className="login-page">
      <div className="login-card">

        {/* 로고 */}
        <div className="login-logo">
          <div className="login-logo-mark">K</div>
          <div>
            <h1 className="login-title">K-Stock Dashboard</h1>
            <p className="login-sub">한국 주식 테마별 통합 분석 플랫폼</p>
          </div>
        </div>

        {/* 설명 */}
        <div className="login-features">
          <div className="feature-item">
            <span className="feature-icon">📊</span>
            <span>7대 테마 실시간 시장 분석</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">✦</span>
            <span>AI 기반 종목·업종 분석</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">💼</span>
            <span>포트폴리오 · 매매일지 관리</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🔔</span>
            <span>실시간 뉴스 · 공시 알림</span>
          </div>
        </div>

        {/* 에러 */}
        {error && <div className="login-error">{error}</div>}

        {/* 로그인 버튼 */}
        <div className="login-btns">
          <button
            className="login-btn google-btn"
            onClick={loginWithGoogle}
            disabled={loading}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? '로그인 중...' : 'Google로 로그인'}
          </button>

          <button
            className="login-btn kakao-btn"
            onClick={loginWithKakao}
            disabled={loading}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#3C1E1E">
              <path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.76 1.68 5.19 4.2 6.6l-1.08 3.96L9.6 19.2c.78.18 1.56.3 2.4.3 5.52 0 10-3.48 10-7.8S17.52 3 12 3z"/>
            </svg>
            카카오로 로그인
          </button>
        </div>

        <p className="login-notice">
          로그인 시 새로운 기기는 이메일 인증이 필요해요
        </p>
      </div>
    </div>
  )
}
