// K-Stock Dashboard Service Worker
const CACHE_NAME = 'kstock-v2'
const STATIC_ASSETS = [
  '/',
  '/index.html',
]

// 설치
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// 활성화
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// fetch 전략: HTML=Network First, assets=Cache First, API=No Cache
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // API 호출은 캐시하지 않음
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{"error":"offline"}', { headers: {'Content-Type':'application/json'} })))
    return
  }

  // HTML(SPA 라우트) — Network First: 항상 서버에서 최신 index.html 가져옴
  const isHtml = e.request.headers.get('accept')?.includes('text/html')
  if (isHtml || url.pathname === '/' || url.pathname === '/index.html') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(res => res)
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // assets/(hash 포함) — Cache First (불변 파일)
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
          }
          return res
        })
      })
    )
    return
  }

  // 나머지 정적 자원 — Network First
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .catch(() => caches.match(e.request))
  )
})

// main.jsx에서 SKIP_WAITING 메시지 수신
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// 푸시 알림
self.addEventListener('push', (e) => {
  const data = e.data?.json() || {}
  e.waitUntil(
    self.registration.showNotification(data.title || 'K-Stock', {
      body:    data.body  || '',
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      tag:     data.tag   || 'kstock',
      data:    { url: data.url || '/' },
      vibrate: [200, 100, 200],
    })
  )
})

// 알림 클릭
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type:'window' }).then(list => {
      if (list.length) { list[0].focus(); list[0].navigate(e.notification.data.url) }
      else clients.openWindow(e.notification.data.url)
    })
  )
})
