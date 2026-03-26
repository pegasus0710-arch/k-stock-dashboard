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
    // 1. redirect 로그인 결과 먼저 처리
    getRedirectResult(auth)
      .then(result => {
        // result가 있으면 onAuthStateChanged가 자동으로 처리
        if (result?.user) {
          console.log('redirect 로그인 성공:', result.user.email)
        }
      })
      .catch(err => {
        console.error('redirect 결과 처리 에러:', err)
      })

    // 2. 인증 상태 감지
    const unsub = onAuthStateChanged(auth, (u) => {
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

    return () => unsub()
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
