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
    let cancelled = false

    const init = async () => {
      // ① redirect 결과를 먼저 await으로 처리 완료 후 구독 시작
      //    (이걸 안 하면 onAuthStateChanged가 null로 먼저 fired → 로그인 루프)
      try {
        const result = await getRedirectResult(auth)
        if (result?.user) {
          console.log('[Auth] redirect 로그인 성공:', result.user.email)
        }
      } catch (err) {
        // redirect 에러는 무시 (첫 방문 시 result=null 정상)
        if (err.code !== 'auth/null-user') {
          console.warn('[Auth] redirect 처리:', err.code)
        }
      }

      if (cancelled) return

      // ② redirect 결과 처리 완료 후 auth 상태 구독
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
      })
    }

    init()

    return () => {
      cancelled = true
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
