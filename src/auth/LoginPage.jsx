import { useState } from 'react'
import { signInWithPopup } from 'firebase/auth'
import { auth, googleProvider } from '../firebase'
import { useAuth } from '../context/AuthContext'
import './LoginPage.css'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const { denied } = useAuth()

  const loginWithGoogle = async () => {
    setLoading(true)
    setError('')
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      console.error('Login error:', e.code, e.message)
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
        // 팝업 닫음 - 에러 표시 안함
      } else if (e.code === 'auth/popup-blocked') {
        setError('팝업이 차단됐습니다. 브라우저에서 팝업 허용 후 다시 시도해주세요.')
      } else {
        setError(`로그인 오류 (${e.code}): 다시 시도해주세요.`)
      }
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">

        <div className="login-logo">
          <div className="login-logo-mark">K</div>
          <div>
            <h1 className="login-title">K-Stock Dashboard</h1>
            <p className="login-sub">한국 주식 테마별 통합 분석 플랫폼</p>
          </div>
        </div>

        <div className="login-features">
          <div className="feature-item"><span className="feature-icon">📊</span><span>7대 테마 실시간 시장 분석</span></div>
          <div className="feature-item"><span className="feature-icon">✦</span><span>AI 기반 종목·업종 분석</span></div>
          <div className="feature-item"><span className="feature-icon">💼</span><span>포트폴리오 · 매매일지 관리</span></div>
          <div className="feature-item"><span className="feature-icon">🔔</span><span>실시간 뉴스 · 공시 알림</span></div>
        </div>

        {denied && (
          <div className="login-denied">
            ⛔ 접근 권한이 없는 계정입니다.<br/>허용된 계정으로 로그인해주세요.
          </div>
        )}

        {error && <div className="login-error">{error}</div>}

        <div className="login-btns">
          <button className="login-btn google-btn" onClick={loginWithGoogle} disabled={loading}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? '로그인 중...' : 'Google로 로그인'}
          </button>
        </div>

        <p className="login-notice">허용된 구글 계정으로만 접속 가능합니다</p>
      </div>
    </div>
  )
}
