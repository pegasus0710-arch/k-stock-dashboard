// K-Stock Dashboard Service Worker
const CACHE_NAME = 'kstock-v1'
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

// fetch 전략: Network First (API), Cache First (정적)
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // API 호출은 캐시하지 않음
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{"error":"offline"}', { headers: {'Content-Type':'application/json'} })))
    return
  }

  // 정적 자원: Cache First
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
        }
        return res
      }).catch(() => caches.match('/index.html'))
    })
  )
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
