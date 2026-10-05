/* 홈 화면 설치(웹앱) + 알림을 위한 서비스 워커.
   - 저장(캐시)은 하지 않고 그대로 인터넷에서 받아와요 — 사이트를 고치면 바로 반영되게.
   - 알림(push): 앱이 꺼져 있어도, 잠금화면에서도 알림을 띄워요. 누르면 그 방(?r=방코드) 화면으로 열려요. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

self.addEventListener('push', e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = {}; }
  const d = p.data || p;   // FCM 데이터 알림은 { data: {...} } 모양으로 와요
  e.waitUntil((async () => {
    // 내가 올린 것(내 SOS·내가 연 모임 등)의 알림은 나에게 띄우지 않아요
    const from = d.sender || d.from;   // 'from' 은 FCM 예약어라 sender 로 받아요
    if (from) {
      const me = await caches.open('sos-self').then(c => c.match('/me')).then(r => (r ? r.text() : '')).catch(() => '');
      if (me && me === from) {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (wins.some(w => w.visibilityState === 'visible')) return;
        // 앱이 꺼져 있을 때는 크롬 규칙상 알림을 하나 띄워야 해서, 소리 없이 띄우고 바로 닫아요
        await self.registration.showNotification(d.title || '공동육아 SOS', { tag: 'self-quiet', silent: true, badge: 'assets/badge-96.png' });
        (await self.registration.getNotifications({ tag: 'self-quiet' })).forEach(n => n.close());
        return;
      }
    }
    await self.registration.showNotification(d.title || '공동육아 SOS', {
      body: d.body || '',
      icon: 'assets/icon-sos-192.png',
      badge: 'assets/badge-96.png',   // 상태표시줄 아이콘: 흰 실루엣 + 투명 배경이어야 해요
      tag: d.tag || 'sos',
      renotify: true,
      data: { link: d.link || 'index.html' }
    });
    if (self.navigator && self.navigator.setAppBadge) { try { await self.navigator.setAppBadge(); } catch (err) { /* 지원 안 하는 기기 */ } }
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.link || 'index.html', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if ('focus' in w) { await w.navigate(url).catch(() => {}); return w.focus(); } }
    return self.clients.openWindow(url);
  })());
});
