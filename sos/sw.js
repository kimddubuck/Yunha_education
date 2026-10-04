/* 홈 화면 설치(웹앱)를 위한 서비스 워커.
   저장(캐시)은 하지 않고 그대로 인터넷에서 받아와요 — 사이트를 고치면 바로 반영되게. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
