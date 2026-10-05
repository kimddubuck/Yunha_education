/* 공동육아 SOS · 알림 (gate.js, common.js 다음에 불러와요)
   - 알림 켜기: 브라우저 알림 허용 → Firebase 알림 주소(토큰) 받기 → 내 방들의 알림 채널에 가입 (/api/push)
   - 알림 보내기: 새 모임 → 방 채널, SOS 요청(1명부터, 3명이면 '몰렸어요') → 방 채널, 내 모임에 참석·댓글 → 모임 주최자 채널
   - 채널 이름은 방 열쇠로 만든 해시라 방 사람만 알아요. 이름·전화번호는 다루지 않아요.
   - 잠금화면에 보일 수 있어서 알림 글은 간단히(방 이름만). 날짜·장소·별명·댓글 내용은 앱을 열어야 보여요.
   - PUSH_VAPID 가 비어 있으면 알림 기능 전체가 숨겨져요 (Firebase 설정 전). */
const PUSH_VAPID = 'BHXQsGT-8useRm_C08QgfQHbBlRVBErZpnz3ayOc84FV2lQZYn9p3kEE_EQ5qvycccEiaL7C385S30ffZlpdtpk';   // Firebase 웹 푸시 인증서(공개 키)
const PUSH_API = 'api/push';
const SOS_CROWD_AT = 3;   // 같은 날짜·시간에 SOS가 이만큼 모이면 '몰렸어요'로 알려요 (1명부터 알림은 가요)

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

let pushLastError = '';
async function pushApi(body){
  const r = await fetch(PUSH_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if(!r.ok){ pushLastError = `${r.status} ${j.error || ''} ${j.detail || ''}`.trim(); return null; }
  return j;
}

// 단계별 진행 표시 + 시간 제한: 어디서 멈췄는지 화면에 보이게 해요
let pushStepFn = () => {};
function pushStep(t){ pushStepFn(t); }
function withTimeout(p, ms, what){
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' 시간 초과')), ms))]);
}

// 알림 주소(토큰) 받기. ask=true 면 허용 창을 띄워요
async function pushToken(ask){
  if(!pushSupported()) return null;
  if(Notification.permission === 'denied'){ pushLastError = '크롬에서 이 사이트 알림이 차단돼 있어요. 크롬에서 gongdong-sos.pages.dev 열기 → 주소창 왼쪽 자물쇠 → 권한 → 알림 → 허용'; return null; }
  if(Notification.permission !== 'granted'){
    if(!ask) return null;
    pushStep('① 알림 허용 창을 기다리는 중…');
    const perm = await withTimeout(Notification.requestPermission(), 60000, '알림 허용 창');
    if(perm !== 'granted'){ pushLastError = perm === 'denied' ? '크롬에서 이 사이트 알림이 차단돼 있어요. 크롬에서 gongdong-sos.pages.dev 열기 → 주소창 왼쪽 자물쇠 → 권한 → 알림 → 허용' : '알림 허용을 누르지 않았어요'; return null; }
  }
  sosDb();   // Firebase 앱 준비
  pushStep('② 알림 준비 중…');
  const reg = await withTimeout(navigator.serviceWorker.register('sw.js'), 20000, '서비스 워커 등록');
  await withTimeout(navigator.serviceWorker.ready, 20000, '서비스 워커 준비');
  pushStep('③ 알림 주소 받는 중…');
  const token = await withTimeout(firebase.messaging().getToken({ vapidKey: PUSH_VAPID, serviceWorkerRegistration: reg }), 30000, 'Firebase 알림 주소 받기');
  if(!token) return null;
  pushLS.set('sosPushToken', token);
  // 내가 보낸 알림을 내 화면에 또 띄우지 않으려고, 내 표시(토큰 해시)를 서비스 워커가 읽을 수 있게 둬요
  const me = (await sha256Hex(token)).slice(0, 16);
  try{ await (await caches.open('sos-self')).put('/me', new Response(me)); }catch(e){}
  return token;
}
async function pushMe(){ const t = pushLS.get('sosPushToken', ''); return t ? (await sha256Hex(t)).slice(0, 16) : ''; }

// 방별 알림 끄기: 끈 방의 방 코드 목록 (이 휴대폰에만 저장)
const pushMuted = () => pushLS.get('sosPushMuted', []);
const pushRoomOn = roomId => !pushMuted().includes(roomId);
function pushSetRoom(roomId, on){
  const m = pushMuted().filter(x => x !== roomId);
  pushLS.set('sosPushMuted', on ? m : [...m, roomId]);
}

// 내 방들(+ 내가 연 모임)의 채널에 가입 상태를 맞춰요. 알림을 끈 방은 빼요
async function pushSync(ask){
  const token = await pushToken(ask); if(!token) return false;
  const rooms = sosRooms().filter(r => pushRoomOn(r.roomId));
  const want = await Promise.all(rooms.map(roomTopic));
  // 내가 연 모임 채널: 예전엔 글자만, 지금은 {t, room} — 끈 방의 모임은 빼요
  const mine = pushLS.get('sosPushMeetTopics', []).map(x => typeof x === 'string' ? {t: x, room: ''} : x)
    .filter(x => !x.room || pushRoomOn(x.room)).map(x => x.t);
  const all = [...new Set([...want, ...mine])];
  const done = pushLS.get('sosPushTopics:' + token.slice(-12), []);
  const add = all.filter(t => !done.includes(t)), remove = done.filter(t => !all.includes(t));
  if(add.length){ pushStep('④ 우리 방 알림 채널에 가입 중…'); const r = await withTimeout(pushApi({ action: 'subscribe', token, topics: add.slice(0, 20) }), 30000, '알림 채널 가입'); if(!r) return false; }
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
// 보내는 쪽은 알림 지원이 없어도 돼요 (카카오톡 안 브라우저 등에서도 방 사람들에게는 보내요)
async function pushNotify(topic, title, body, link, tag){
  if(!PUSH_VAPID) return;
  try{
    const r = await pushApi({ action: 'notify', topic, title, body, link, tag, from: await pushMe() });
    if(!r && pushLastError && !/429/.test(pushLastError)) pushToast('⚠️ 방 사람들에게 알림을 보내지 못했어요 (' + pushLastError.slice(0, 60) + ')');   // 베타: 원인을 화면에 보여 줘요
  }catch(e){ pushToast('⚠️ 알림을 보내지 못했어요 (인터넷 연결 확인)'); }
}
const pushLink = page => `${page}?r=${ROOM.roomId}`;

// --- 앱 곳곳에서 부르는 알림 ---
async function pushNewMeet(meetId, date, slot, host){
  if(!PUSH_VAPID || !ROOM) return;
  // 내가 연 모임의 참석·댓글 알림을 받으려고 주최자 채널에 가입
  if(pushLS.get('sosPushOn', false)){
    const t = await meetTopic(meetId);
    pushLS.set('sosPushMeetTopics', [...pushLS.get('sosPushMeetTopics', []), {t, room: ROOM.roomId}].slice(-30));
    pushSync(false).catch(() => {});
  }
  pushNotify(await roomTopic(ROOM), '🙌 새 모임이 열렸어요', `${ROOM.name} · 눌러서 확인해 보세요`, pushLink('meet.html'), 'meet-' + meetId);
}
// 🆘 SOS 요청이 들어오면 방 사람들에게 알려요 (보낸 사람 빼고). 같은 날짜·시간은 알림 하나로 바뀌어요
async function pushSosCrowd(date, slot, count){
  if(!PUSH_VAPID || !ROOM || !(count >= 1)) return;
  const crowd = count >= SOS_CROWD_AT;
  pushNotify(await roomTopic(ROOM), crowd ? `🆘 SOS가 몰렸어요 (${count}명)` : '🆘 SOS 요청이 왔어요',
    `${ROOM.name} · ${crowd ? '용기 내서 모임을 열어 볼까요?' : '누가 도움이 필요해요. 눌러서 확인해 보세요'}`, pushLink('meet.html'), 'sos-' + date + slot);
}
async function pushMeetJoin(o, joins){
  if(!PUSH_VAPID || !ROOM) return;
  pushNotify(await meetTopic(o.id), '🙋 내 모임에 참석이 늘었어요', `${ROOM.name} · 참석 ${joins}명`, pushLink('meet.html'), 'join-' + o.id);
}
async function pushMeetComment(o, text){
  if(!PUSH_VAPID || !ROOM) return;
  pushNotify(await meetTopic(o.id), '💬 내 모임에 댓글이 달렸어요', `${ROOM.name} · 눌러서 확인해 보세요`, pushLink('meet.html'), 'cmt-' + o.id);
}

// 🔔 테스트 알림: 이 휴대폰에만 서버를 거쳐 알림을 보내 봐요 (휴대폰 → 우리 서버 → Google → 휴대폰, 전체 길 확인)
async function pushTest(btn){
  const say = t => { if(btn) btn.textContent = t; };
  pushLastError = '';
  if(!pushSupported()){ alert('이 브라우저는 알림을 지원하지 않아요. 아래 「알림 설정 방법」을 봐 주세요.'); return; }
  say('보내는 중…');
  try{
    const token = await pushToken(true);
    if(!token){ alert('알림이 꺼져 있어요.' + (pushLastError ? `\n(원인: ${pushLastError})` : '') + '\n\n방 이름 옆 🔕를 눌러 먼저 알림을 켜 주세요.'); say('🔔 테스트 알림 받기'); return; }
    const r = await pushApi({ action: 'test', token });
    if(r){ say('✅ 보냈어요! 몇 초 안에 와요'); pushToast('📨 보냈어요. 화면을 꺼 두면 잠금화면에서도 확인할 수 있어요'); }
    else{ alert('테스트 알림을 보내지 못했어요.\n(원인: ' + (pushLastError || '알 수 없음') + ')\n\n이 화면을 캡처해서 운영자에게 보내 주세요.'); say('🔔 테스트 알림 받기'); }
  }catch(err){ alert('테스트 알림을 보내지 못했어요.\n(원인: ' + String(err && err.message || err).slice(0, 150) + ')'); say('🔔 테스트 알림 받기'); }
  setTimeout(() => say('🔔 테스트 알림 받기'), 8000);
}
document.addEventListener('click', e => { const b = e.target.closest('[data-push-test]'); if(b) pushTest(b); });

// 알림 설정 안내: 내 휴대폰 종류를 알아서 골라 먼저 펼쳐 보여 줘요. 한 단계 = 한 동작
const pushIsAndroid = () => /android/i.test(navigator.userAgent);
const step = (n, icon, title, sub) => `<li class="ph-step"><span class="ph-num">${n}</span><span class="ph-icon" aria-hidden="true">${icon}</span><span class="ph-text"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span></li>`;
function pushHelp(){
  const android = `<details class="ph-os"${pushIsIOS() ? '' : ' open'}>
      <summary>🤖 안드로이드 (갤럭시)</summary>
      <ol class="ph-steps">
        ${step(1, '🌐', '크롬으로 열기', '카카오톡 안에서 열었다면 오른쪽 위 ⋮ → <b>다른 브라우저로 열기</b>')}
        ${step(2, '📲', '홈 화면에 설치', '크롬 오른쪽 위 ⋮ → <b>홈 화면에 추가</b> (또는 <b>앱 설치</b>)')}
        ${step(3, '👆', '설치된 아이콘으로 열기', '홈 화면의 공동육아 SOS 아이콘')}
        ${step(4, '🔔', '알림 켜기 → 허용', '방 목록에서 방 이름 옆 <b>🔕</b>를 누르고, 뜨는 창에서 <b>허용</b>')}
      </ol>
      <div class="ph-stuck">
        <p class="ph-stuck-h">😥 허용 창이 안 뜨거나 '막혀 있어요'가 나오면</p>
        <ol class="ph-steps">
          ${step('A', '✋', '앱 아이콘 꾹 누르기', '홈 화면의 공동육아 SOS 아이콘을 길게')}
          ${step('B', 'ⓘ', '앱 정보 → 알림 → 켜기', '<b>알림 허용</b> 스위치를 파랗게')}
          ${step('C', '🔄', '앱 완전히 닫고 다시 열기', '최근 앱 버튼(|||) → 위로 밀어서 닫기')}
          ${step('D', '🔔', '다시 알림 켜기', '이번엔 바로 켜져요')}
        </ol>
        <p class="ph-tip">💡 그래도 안 되면 아이콘을 지우고 2번부터 다시 설치해 주세요. 방과 기록은 그대로예요.</p>
      </div>
      <p class="ph-tip">⏰ 알림이 늦게 오면: 설정 → 애플리케이션 → Chrome → 배터리 → <b>제한 없음</b></p>
    </details>`;
  const ios = `<details class="ph-os"${pushIsIOS() ? ' open' : ''}>
      <summary>🍎 아이폰</summary>
      <ol class="ph-steps">
        ${step(1, '🧭', '사파리로 열기', 'iOS 16.4 이상이어야 해요 (설정 → 일반 → 정보)')}
        ${step(2, '⬆️', '공유 → 홈 화면에 추가', '아래 가운데 <b>공유 버튼(□↑)</b> → 목록에서 <b>홈 화면에 추가</b>')}
        ${step(3, '👆', '설치된 아이콘으로 열기', '처음엔 방을 다시 물어봐요 → <b>초대 링크 붙여넣기</b> + 비밀번호')}
        ${step(4, '🔔', '알림 켜기 → 허용', '방 목록에서 방 이름 옆 <b>🔕</b>를 누르고 <b>허용</b>')}
      </ol>
      <div class="ph-stuck">
        <p class="ph-stuck-h">😥 알림이 안 오면</p>
        <ol class="ph-steps">
          ${step('A', '⚙️', '설정 → 알림 → 공동육아 SOS', '<b>알림 허용</b> 켜고 <b>잠금 화면</b>에 체크')}
          ${step('B', '🌙', '집중 모드(방해 금지) 끄기', '켜져 있으면 알림이 조용히 와요')}
        </ol>
      </div>
    </details>`;
  return `<details class="how-to push-help">
    <summary>📖 알림 설정 방법 · 안 될 때</summary>
    <button type="button" class="btn primary block ph-test" data-push-test>🔔 테스트 알림 받기</button>
    <p class="ph-tip">이 휴대폰에만 알림이 와요. 안 오면 아래 순서대로 확인해 주세요.</p>
    <p class="ph-lead">방 이름 옆 <b>🔔 = 알림 켜짐</b>, <b>🔕 = 꺼짐</b>. 눌러서 방마다 켜고 꺼요.<br>딱 4단계예요. <b>홈 화면에 설치한 앱</b>에서 켜야 잘 와요.</p>
    ${pushIsIOS() ? ios + android : android + ios}
  </details>`;
}

// --- 방 이름 옆 🔔 종: 눌러서 그 방 알림 켜기/끄기 ---
// 켜짐 = 알림 허용 + 이 휴대폰 알림 켜짐 + 이 방을 끄지 않음
function pushBellOn(roomId){
  return pushSupported() && Notification.permission === 'granted' && pushLS.get('sosPushOn', false) && pushRoomOn(roomId);
}
function pushBell(roomId){
  if(!PUSH_VAPID) return '';
  const on = pushBellOn(roomId);
  return `<button type="button" class="bell${on ? ' on' : ''}" data-bell="${roomId}" aria-pressed="${on}" aria-label="${on ? '이 방 알림 켜짐 (누르면 끄기)' : '이 방 알림 꺼짐 (누르면 켜기)'}">${on ? '🔔' : '🔕'}</button>`;
}
function pushBellsRedraw(){
  document.querySelectorAll('[data-bell]').forEach(b => { b.outerHTML = pushBell(b.dataset.bell); });
}
// 잠깐 떠 있다 사라지는 안내 글
function pushToast(t){
  let el = document.getElementById('pushToast');
  if(!el){ el = document.createElement('p'); el.id = 'pushToast'; el.className = 'push-toast'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.textContent = t; el.hidden = false;
  clearTimeout(pushToast.t); pushToast.t = setTimeout(() => { el.hidden = true; }, 2600);
}
// 안 될 때: 가까운 「📖 알림 설정 방법」을 펼쳐서 보여 줘요
function pushOpenHelp(from){
  let h = (from && from.closest('#gate') || document).querySelector('.push-help');
  if(!h && typeof showRooms === 'function'){ showRooms(true); h = document.querySelector('#gate .push-help'); }   // 홈 제목 종이면 방 목록의 안내를 열어요
  if(h){ h.open = true; const more = h.closest('details.g-more'); if(more) more.open = true; h.scrollIntoView({block: 'center'}); }
}
async function pushBellClick(btn){
  const id = btn.dataset.bell;
  if(!pushSupported()){
    alert(pushIsIOS() && !pushStandalone()
      ? '아이폰은 사파리 → 공유 → 「홈 화면에 추가」로 설치한 앱에서 알림을 켤 수 있어요.'
      : '이 브라우저는 알림을 지원하지 않아요. 카카오톡에서 열었다면 「다른 브라우저(크롬)로 열기」를 눌러 주세요.');
    pushOpenHelp(btn); return;
  }
  const wasOn = pushBellOn(id), allOff = !(pushLS.get('sosPushOn', false) && Notification.permission === 'granted');
  btn.disabled = true; btn.classList.add('busy');
  pushStepFn = t => pushToast(t);
  pushLastError = '';
  try{
    if(wasOn){
      pushSetRoom(id, false);
      pushToast((await pushSync(false)) ? '🔕 이 방 알림을 껐어요' : '저장하지 못했어요. 잠시 뒤 다시 해 주세요.');
    }else{
      // 처음 켤 때는 누른 방만 켜요 (다른 방은 각자 🔕 를 눌러 켜요)
      if(allOff) pushLS.set('sosPushMuted', sosRooms().map(r => r.roomId).filter(x => x !== id));
      else pushSetRoom(id, true);
      if(await pushSync(true)) pushToast('🔔 이 방 알림을 켰어요');
      else{
        if(allOff) pushLS.set('sosPushOn', false);
        alert('알림을 켜지 못했어요. 알림 허용을 눌렀는지 확인하고 다시 해 주세요.' + (pushLastError ? `\n(원인: ${pushLastError})` : '') + '\n\n「📖 알림 설정 방법 · 안 될 때」를 확인해 주세요.');
        pushOpenHelp(btn);
      }
    }
  }catch(err){
    const why = String(err && (err.code ? err.code + ' ' + (err.message || '') : err.message) || err);
    alert('알림을 켜지 못했어요.\n(원인: ' + why.slice(0, 200) + ')' + (/허용 창/.test(why) ? '\n\n알림 허용 창이 안 보였다면: 크롬 주소창 왼쪽 자물쇠(또는 앱 정보) → 권한 → 알림 → 허용으로 바꾼 뒤 다시 눌러 주세요.' : ''));
    pushOpenHelp(btn);
  }
  pushStepFn = () => {};
  pushBellsRedraw();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-bell]'); if(b && !b.disabled) pushBellClick(b);
});

// 홈 제목 옆 종 + 앱을 열 때 할 일
(function pushOnLoad(){
  if(!ROOM) return;
  if(navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});   // 앱을 열면 아이콘 숫자 지우기
  const slot = document.getElementById('titleBell'); if(slot) slot.innerHTML = pushBell(ROOM.roomId);
  if(pushLS.get('sosPushOn', false)) pushSync(false).catch(() => {});   // 새로 들어간 방이 있으면 채널 맞추기
})();
