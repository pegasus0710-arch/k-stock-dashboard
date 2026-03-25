import { createContext, useContext, useState, useEffect } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../firebase'

const AuthContext = createContext(null)

// 허용 이메일 화이트리스트 (Vercel 환경변수)
// VITE_ALLOWED_EMAILS=email1@gmail.com,email2@gmail.com
const ALLOWED_EMAILS = (import.meta.env.VITE_ALLOWED_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

function isAllowed(email) {
  if (ALLOWED_EMAILS.length === 0) return false
  return ALLOWED_EMAILS.includes((email || '').toLowerCase())
}

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [denied,      setDenied]      = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        if (!isAllowed(firebaseUser.email)) {
          // 허용 안 된 이메일 → 즉시 로그아웃
          await signOut(auth)
          setUser(null)
          setDenied(true)
        } else {
          setUser(firebaseUser)
          setDenied(false)
        }
      } else {
        setUser(null)
      }
      setAuthLoading(false)
    })
    return unsubscribe
  }, [])

  const logout = async () => {
    await signOut(auth)
    setUser(null)
    setDenied(false)
  }

  return (
    <AuthContext.Provider value={{ user, authLoading, denied, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
