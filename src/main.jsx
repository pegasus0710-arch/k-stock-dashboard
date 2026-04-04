import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import App from './App.jsx'
import './index.css'

// ── Service Worker 등록 (PWA) — 항상 최신 버전 유지 ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('[SW] 등록 완료:', reg.scope)
        // 새 버전 감지 시 즉시 업데이트
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // 기존 SW에 skipWaiting 요청 → 즉시 활성화
              newWorker.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })
        // 주기적으로 업데이트 체크 (5분마다)
        setInterval(() => reg.update(), 5 * 60 * 1000)
      })
      .catch(err => console.warn('[SW] 등록 실패:', err))

    // SW 교체 완료 시 페이지 자동 새로고침
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) { refreshing = true; window.location.reload() }
    })
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
)
