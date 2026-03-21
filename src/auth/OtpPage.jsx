import { useState, useEffect, useRef } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../firebase'
import { useAuth } from '../context/AuthContext'
import './OtpPage.css'

export default function OtpPage() {
  const { completeOtp } = useAuth()
  const [otp,      setOtp]      = useState(['', '', '', '', '', ''])
  const [loading,  setLoading]  = useState(false)
  const [sending,  setSending]  = useState(false)
  const [error,    setError]    = useState('')
  const [sent,     setSent]     = useState(false)
  const [countdown,setCountdown]= useState(0)
  const inputRefs = useRef([])

  const pendingUser = window.__pendingUser
  const email       = pendingUser?.email || ''

  /* 자동 OTP 발송 */
  useEffect(() => { if (pendingUser) sendOtp() }, [])

  /* 카운트다운 */
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const sendOtp = async () => {
    if (!pendingUser) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingUser.email, uid: pendingUser.uid }),
      })
      if (!res.ok) throw new Error('발송 실패')
      setSent(true)
      setCountdown(60)
    } catch {
      setError('인증 코드 발송에 실패했어요. 다시 시도해주세요.')
    } finally {
      setSending(false)
    }
  }

  /* 입력 처리 */
  const handleInput = (idx, val) => {
    if (!/^\d*$/.test(val)) return
    const next = [...otp]
    next[idx] = val.slice(-1)
    setOtp(next)
    if (val && idx < 5) inputRefs.current[idx + 1]?.focus()
    if (next.every(d => d !== '') && next.join('').length === 6) {
      verifyOtp(next.join(''))
    }
  }

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus()
    }
  }

  /* OTP 검증 */
  const verifyOtp = async (code) => {
    setLoading(true)
    setError('')
    try {
      const uid  = pendingUser.uid
      const ref  = doc(db, 'users', uid, 'otp', 'current')
      const snap = await getDoc(ref)

      if (!snap.exists()) throw new Error('인증 코드가 없어요. 재발송해주세요.')

      const { otp: savedOtp, expires } = snap.data()

      if (Date.now() > parseInt(expires)) throw new Error('인증 코드가 만료됐어요. 재발송해주세요.')
      if (code !== savedOtp)              throw new Error('인증 코드가 올바르지 않아요.')

      await completeOtp()
    } catch (e) {
      setError(e.message)
      setOtp(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    await signOut(auth)
    window.__pendingUser = null
  }

  return (
    <div className="otp-page">
      <div className="otp-card">

        <div className="otp-logo">
          <div className="otp-logo-mark">K</div>
        </div>

        <h2 className="otp-title">새 기기 인증</h2>
        <p className="otp-desc">
          처음 접속하는 기기예요.<br />
          <strong>{email}</strong>로 발송된<br />
          6자리 인증 코드를 입력해주세요.
        </p>

        {error && <div className="otp-error">{error}</div>}

        {/* OTP 입력 */}
        <div className="otp-inputs">
          {otp.map((digit, idx) => (
            <input
              key={idx}
              ref={el => inputRefs.current[idx] = el}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              className={`otp-input ${digit ? 'filled' : ''}`}
              onChange={e => handleInput(idx, e.target.value)}
              onKeyDown={e => handleKeyDown(idx, e)}
              disabled={loading}
              autoFocus={idx === 0}
            />
          ))}
        </div>

        {loading && (
          <div className="otp-loading">
            <div className="otp-spinner" />
            <span>확인 중...</span>
          </div>
        )}

        {/* 재발송 */}
        <div className="otp-resend">
          {countdown > 0 ? (
            <span className="otp-countdown">{countdown}초 후 재발송 가능</span>
          ) : (
            <button
              className="otp-resend-btn"
              onClick={sendOtp}
              disabled={sending}
            >
              {sending ? '발송 중...' : '인증 코드 재발송'}
            </button>
          )}
        </div>

        <button className="otp-cancel" onClick={handleCancel}>
          다른 계정으로 로그인
        </button>

        <p className="otp-note">
          이 기기는 90일간 인증 없이 사용할 수 있어요
        </p>
      </div>
    </div>
  )
}
