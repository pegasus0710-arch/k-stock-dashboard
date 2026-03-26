// src/hooks/usePriceAlert.js
// 관심종목 목표가 알림 훅

const LS_ALERTS = 'kstock_alerts_v1'

function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

// 알림 권한 요청
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  const result = await Notification.requestPermission()
  return result
}

// 브라우저 알림 전송
function sendNotification(title, body, code) {
  if (Notification.permission !== 'granted') return
  const n = new Notification(title, {
    body,
    icon: '/icon-192.png',
    tag:  `kstock-${code}`,
  })
  n.onclick = () => { window.focus(); n.close() }
}

// 알림 설정 CRUD
export function loadAlerts() { return lsGet(LS_ALERTS, []) }
export function saveAlerts(alerts) { lsSet(LS_ALERTS, alerts) }

export function addAlert(code, name, targetPrice, condition) {
  const alerts = loadAlerts()
  const exists = alerts.find(a => a.code === code && a.condition === condition)
  if (exists) return alerts
  const next = [...alerts, { id: Date.now(), code, name, targetPrice: Number(targetPrice), condition, triggered: false }]
  saveAlerts(next)
  return next
}

export function removeAlert(id) {
  const next = loadAlerts().filter(a => a.id !== id)
  saveAlerts(next)
  return next
}

// 가격 체크 (prices 맵 받아서 알림 트리거)
export function checkAlerts(prices) {
  const alerts = loadAlerts()
  let updated  = false
  const next   = alerts.map(a => {
    if (a.triggered) return a
    const p = prices[a.code]?.price
    if (!p) return a

    let trigger = false
    if (a.condition === 'above' && p >= a.targetPrice) trigger = true
    if (a.condition === 'below' && p <= a.targetPrice) trigger = true
    if (a.condition === 'change_up'   && (prices[a.code]?.changeRate || 0) >= a.targetPrice) trigger = true
    if (a.condition === 'change_down' && (prices[a.code]?.changeRate || 0) <= -Math.abs(a.targetPrice)) trigger = true

    if (trigger) {
      updated = true
      const condLabel = {
        above:      `목표가 ${a.targetPrice?.toLocaleString()}원 도달`,
        below:      `하한가 ${a.targetPrice?.toLocaleString()}원 터치`,
        change_up:  `등락률 +${a.targetPrice}% 돌파`,
        change_down:`등락률 -${Math.abs(a.targetPrice)}% 하락`,
      }[a.condition]
      sendNotification(
        `🔔 ${a.name} 알림`,
        `${condLabel} (현재가: ${p?.toLocaleString()}원)`,
        a.code
      )
      return { ...a, triggered: true, triggeredAt: Date.now(), triggeredPrice: p }
    }
    return a
  })
  if (updated) saveAlerts(next)
  return next
}
