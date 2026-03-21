import { createContext, useContext, useState, useEffect } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

/* 기기 고유 ID 생성/조회 */
function getDeviceId() {
  let id = localStorage.getItem('k_stock_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('k_stock_device_id', id)
  }
  return id
}

/* 기기 등록 여부 확인 (90일 유효) */
async function isDeviceRegistered(uid) {
  try {
    const deviceId  = getDeviceId()
    const ref       = doc(db, 'users', uid, 'devices', deviceId)
    const snap      = await getDoc(ref)
    if (!snap.exists()) return false

    const { registeredAt } = snap.data()
    const diffDays = (Date.now() - registeredAt.toMillis()) / (1000 * 60 * 60 * 24)
    return diffDays < 90
  } catch {
    return false
  }
}

/* 기기 등록 */
async function registerDevice(uid) {
  const deviceId = getDeviceId()
  const ref      = doc(db, 'users', uid, 'devices', deviceId)
  await setDoc(ref, {
    registeredAt: serverTimestamp(),
    userAgent: navigator.userAgent.slice(0, 200),
  })
}

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [needsOtp,    setNeedsOtp]    = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const registered = await isDeviceRegistered(firebaseUser.uid)
        if (registered) {
          setUser(firebaseUser)
          setNeedsOtp(false)
        } else {
          setUser(null)
          setNeedsOtp(true)
          /* pendingUser 임시 저장 */
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
  }

  return (
    <AuthContext.Provider value={{ user, authLoading, needsOtp, completeOtp, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
