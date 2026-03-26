import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { auth } from '../firebase'

// 허용된 이메일 목록 (본인 이메일로 교체)
const ALLOWED_EMAILS = [
  'pegasus0710@gmail.com',
  // 추가 허용 이메일은 여기에
]

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [denied,  setDenied]  = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        // 허용 목록 체크
        if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(u.email)) {
          setDenied(true)
          setUser(null)
          signOut(auth)
          navigate('/login', { replace: true })
        } else {
          setDenied(false)
          setUser(u)
          navigate('/dashboard', { replace: true })
        }
      } else {
        setUser(null)
        setDenied(false)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const logout = async () => {
    await signOut(auth)
    setUser(null)
    navigate('/login', { replace: true })
  }

  return (
    <AuthContext.Provider value={{ user, loading, denied, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
