import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut, getRedirectResult } from 'firebase/auth'
import { auth } from '../firebase'

const ALLOWED_EMAILS = [
  'pegasus0710@gmail.com',
]

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [denied,  setDenied]  = useState(false)

  useEffect(() => {
    let unsubAuth = null
    let done = false

    const startAuthListener = () => {
      if (done) return
      unsubAuth = onAuthStateChanged(auth, (u) => {
        if (u) {
          if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(u.email)) {
            setDenied(true)
            setUser(null)
            signOut(auth)
          } else {
            setDenied(false)
            setUser(u)
          }
        } else {
          setUser(null)
        }
        setLoading(false)
        sessionStorage.removeItem('pendingRedirect')
      })
    }

    // redirect 복귀 처리: finally로 항상 리스너 시작 보장
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          console.log('[Auth] redirect 성공:', result.user.email)
        }
      })
      .catch((err) => {
        console.warn('[Auth] getRedirectResult 에러:', err?.code)
      })
      .finally(() => {
        startAuthListener()
      })

    return () => {
      done = true
      if (unsubAuth) unsubAuth()
    }
  }, [])

  const logout = async () => {
    await signOut(auth)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, denied, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
