/* 공동육아 SOS · 알림 (gate.js, common.js 다음에 불러와요)
   - 알림 켜기: 브라우저 알림 허용 → Firebase 알림 주소(토큰) 받기 → 내 방들의 알림 채널에 가입 (/api/push)
   - 알림 보내기: 새 모임 → 방 채널, SOS 몰림(같은 시간 3명) → 방 채널, 내 모임에 참석·댓글 → 모임 주최자 채널
   - 채널 이름은 방 열쇠로 만든 해시라 방 사람만 알아요. 이름·전화번호는 다루지 않아요.
   - PUSH_VAPID 가 비어 있으면 알림 기능 전체가 숨겨져요 (Firebase 설정 전). */
const PUSH_VAPID = '';
const PUSH_API = 'api/push';
const SOS_ALERT_AT = 3;   // 같은 날짜·시간에 SOS가 이만큼 모이면 방 사람들에게 알려요

const pushLS = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
function pushSupported(){
  return !!(PUSH_VAPID && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.firebase && firebase.messaging);
}
const pushIsIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const pushStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;

// 채널 이름: r = 방 전체, m = 모임 주최자
async function roomTopic(room){ return 'r' + (await sha256Hex('push:' + room.key)).slice(0, 40); }
async function meetTopic(meetId){ return 'm' + (await sha256Hex('push:' + ROOM.key + ':' + meetId)).slice(0, 40); }

async function pushApi(body){
  const r = await fetch(PUSH_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.ok ? r.json() : null;
}

// 알림 주소(토큰) 받기. ask=true 면 허용 창을 띄워요
async function pushToken(ask){
  if(!pushSupported()) return null;
  if(Notification.permission === 'denied') return null;
  if(Notification.permission !== 'granted'){
    if(!ask) return null;
    if(await Notification.requestPermission() !== 'granted') return null;
  }
  sosDb();   // Firebase 앱 준비
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  const token = await firebase.messaging().getToken({ vapidKey: PUSH_VAPID, serviceWorkerRegistration: reg });
  if(!token) return null;
  pushLS.set('sosPushToken', token);
  // 내가 보낸 알림을 내 화면에 또 띄우지 않으려고, 내 표시(토큰 해시)를 서비스 워커가 읽을 수 있게 둬요
  const me = (await sha256Hex(token)).slice(0, 16);
  try{ await (await caches.open('sos-self')).put('/me', new Response(me)); }catch(e){}
  return token;
}
async function pushMe(){ const t = pushLS.get('sosPushToken', ''); return t ? (await sha256Hex(t)).slice(0, 16) : ''; }

// 내 방들(+ 내가 연 모임)의 채널에 가입 상태를 맞춰요
async function pushSync(ask){
  const token = await pushToken(ask); if(!token) return false;
  const want = await Promise.all(sosRooms().map(roomTopic));
  const mine = pushLS.get('sosPushMeetTopics', []);
  const all = [...new Set([...want, ...mine])];
  const done = pushLS.get('sosPushTopics:' + token.slice(-12), []);
  const add = all.filter(t => !done.includes(t)), remove = done.filter(t => !all.includes(t));
  if(add.length){ const r = await pushApi({ action: 'subscribe', token, topics: add.slice(0, 20) }); if(!r) return false; }
  if(remove.length) await pushApi({ action: 'unsubscribe', token, topics: remove.slice(0, 20) });
  pushLS.set('sosPushTopics:' + token.slice(-12), all);
  pushLS.set('sosPushOn', true);
  return true;
}
async function pushOff(){
  const token = pushLS.get('sosPushToken', '');
  if(token){
    const done = pushLS.get('sosPushTopics:' + token.slice(-12), []);
    if(done.length) await pushApi({ action: 'unsubscribe', token, topics: done.slice(0, 20) }).catch(() => {});
    try{ sosDb(); await firebase.messaging().deleteToken(); }catch(e){}
    pushLS.set('sosPushTopics:' + token.slice(-12), []);
  }
  pushLS.set('sosPushToken', ''); pushLS.set('sosPushOn', false);
}

// 알림 보내기 (실패해도 앱 동작에는 영향 없음)
async function pushNotify(topic, title, body, link, tag){
  if(!pushSupported()) return;
  try{ await pushApi({ action: 'notify', topic, title, body, link, tag, from: await pushMe() }); }catch(e){}
}
const pushLink = page => `${page}?r=${ROOM.roomId}`;

// --- 앱 곳곳에서 부르는 알림 ---
async function pushNewMeet(meetId, date, slot, host){
  if(!pushSupported() || !ROOM) return;
  // 내가 연 모임의 참석·댓글 알림을 받으려고 주최자 채널에 가입
  if(pushLS.get('sosPushOn', false)){
    const t = await meetTopic(meetId);
    pushLS.set('sosPushMeetTopics', [...pushLS.get('sosPushMeetTopics', []), t].slice(-30));
    pushSync(false).catch(() => {});
  }
  pushNotify(await roomTopic(ROOM), '🙌 새 모임이 열렸어요', `[${ROOM.name}] ${dayLabel(date)} ${slot || ''} · ${host} 주최`, pushLink('meet.html'), 'meet-' + meetId);
}
async function pushSosCrowd(date, slot, count){
  if(!pushSupported() || !ROOM || count !== SOS_ALERT_AT) return;
  pushNotify(await roomTopic(ROOM), '🆘 SOS가 몰렸어요', `[${ROOM.name}] ${dayLabel(date)} ${slot}에 ${count}명이 SOS를 보냈어요. 용기 내서 모임을 열어 볼까요?`, pushLink('meet.html'), 'sos-' + date + slot);
}
async function pushMeetJoin(o, joins){
  if(!pushSupported() || !ROOM) return;
  pushNotify(await meetTopic(o.id), '🙋 내 모임에 참석이 늘었어요', `${dayLabel(o.date)} ${o.slot || ''} 모임 · 참석 ${joins}명`, pushLink('meet.html'), 'join-' + o.id);
}
async function pushMeetComment(o, text){
  if(!pushSupported() || !ROOM) return;
  pushNotify(await meetTopic(o.id), '💬 내 모임에 댓글이 달렸어요', `${dayLabel(o.date)} ${o.slot || ''} 모임 · "${text.slice(0, 40)}"`, pushLink('meet.html'), 'cmt-' + o.id);
}

// --- 홈의 🔔 알림 카드 ---
(function pushCard(){
  const box = document.getElementById('pushCard'); if(!box || !ROOM) return;
  if(navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});   // 앱을 열면 아이콘 숫자 지우기
  if(!PUSH_VAPID){ box.hidden = true; return; }
  const draw = () => {
    const on = pushLS.get('sosPushOn', false) && 'Notification' in window && Notification.permission === 'granted';
    let html;
    if(!pushSupported()){
      html = pushIsIOS() && !pushStandalone()
        ? '<p class="push-h">🔔 알림 받기</p><p class="push-sub">아이폰은 <b>사파리 → 공유 → 홈 화면에 추가</b>한 앱에서 알림을 켤 수 있어요.</p>'
        : '<p class="push-h">🔔 알림 받기</p><p class="push-sub">이 브라우저는 알림을 지원하지 않아요. 카카오톡에서 열었다면 <b>다른 브라우저(크롬)로 열기</b>를 눌러 주세요.</p>';
    }else if('Notification' in window && Notification.permission === 'denied'){
      html = '<p class="push-h">🔕 알림이 막혀 있어요</p><p class="push-sub">휴대폰 설정 → 애플리케이션 → 크롬(또는 이 앱) → 알림에서 허용해 주세요.</p>';
    }else if(on){
      html = '<p class="push-h">🔔 알림이 켜져 있어요</p><p class="push-sub">새 모임 · SOS 몰림 · 내 모임에 참석/댓글이 생기면 알려 드려요.</p><button type="button" class="btn block" data-push="off">알림 끄기</button>';
    }else{
      html = '<p class="push-h">🔔 알림 받기</p><p class="push-sub">카카오톡처럼 잠금화면에서도 알려 드려요.<br>🙌 새 모임 · 🆘 SOS 몰림 · 💬 내 모임 참석/댓글</p><button type="button" class="btn primary block" data-push="on">🔔 알림 켜기</button>';
    }
    box.innerHTML = html; box.hidden = false;
  };
  box.addEventListener('click', async e => {
    const b = e.target.closest('[data-push]'); if(!b) return;
    b.disabled = true; b.textContent = '잠시만요…';
    try{
      if(b.dataset.push === 'on'){ if(!(await pushSync(true))) alert('알림을 켜지 못했어요. 알림 허용을 눌렀는지 확인하고 다시 해 주세요.'); }
      else await pushOff();
    }catch(err){ alert('알림을 켜지 못했어요. 잠시 뒤 다시 해 주세요.'); }
    draw();
  });
  draw();
  if(pushLS.get('sosPushOn', false)) pushSync(false).catch(() => {});   // 새로 들어간 방이 있으면 채널 맞추기
})();
