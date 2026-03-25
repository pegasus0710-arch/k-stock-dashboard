import { createContext, useContext, useState, useEffect } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

// ── 허용 이메일 화이트리스트 ──────────────────────────
// Vercel 환경변수 VITE_ALLOWED_EMAILS 에 쉼표 구분으로 입력
// 예: goraebubu@gmail.com,family@gmail.com
const ALLOWED_EMAILS = (import.meta.env.VITE_ALLOWED_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

function isAllowedEmail(email) {
  if (ALLOWED_EMAILS.length === 0) return false // 환경변수 없으면 전부 차단
  return ALLOWED_EMAILS.includes((email || '').toLowerCase())
}

// ── 기기 ID ──────────────────────────────────────────
function getDeviceId() {
  let id = localStorage.getItem('k_stock_device_id')
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('k_stock_device_id', id) }
  return id
}

async function isDeviceRegistered(uid) {
  try {
    const ref  = doc(db, 'users', uid, 'devices', getDeviceId())
    const snap = await getDoc(ref)
    if (!snap.exists()) return false
    const diff = (Date.now() - snap.data().registeredAt.toMillis()) / (1000*60*60*24)
    return diff < 90
  } catch { return false }
}

async function registerDevice(uid) {
  const ref = doc(db, 'users', uid, 'devices', getDeviceId())
  await setDoc(ref, { registeredAt: serverTimestamp(), userAgent: navigator.userAgent.slice(0, 200) })
}

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [needsOtp,    setNeedsOtp]    = useState(false)
  const [denied,      setDenied]      = useState(false) // 허용되지 않은 계정

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // 이메일 화이트리스트 체크
        console.log('로그인 이메일:', firebaseUser.email, '허용목록:', ALLOWED_EMAILS)
        if (!isAllowedEmail(firebaseUser.email)) {
          await signOut(auth)
          setUser(null)
          setNeedsOtp(false)
          setDenied(true)
          setAuthLoading(false)
          return
        }

        setDenied(false)
        const registered = await isDeviceRegistered(firebaseUser.uid)
        if (registered) {
          setUser(firebaseUser)
          setNeedsOtp(false)
        } else {
          setUser(null)
          setNeedsOtp(true)
          window.__pendingUser = firebaseUser
        }
      } else {
        setUser(null)
        setNeedsOtp(false)
        window.__pendingUser = null
      }
      setAuthLoading(false)
    })
    return unsubscribe
  }, [])

  const completeOtp = async () => {
    const pendingUser = window.__pendingUser
    if (!pendingUser) return
    await registerDevice(pendingUser.uid)
    setUser(pendingUser)
    setNeedsOtp(false)
    window.__pendingUser = null
  }

  const logout = async () => {
    await signOut(auth)
    setUser(null)
    setNeedsOtp(false)
    setDenied(false)
  }

  return (
    <AuthContext.Provider value={{ user, authLoading, needsOtp, denied, completeOtp, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
