/* 모임 방 입장 (공동육아 SOS 공통 문지기)
   - 각 페이지 <head>에서 가장 먼저 불러와요. 방에 들어가기 전에는 화면 내용을 가려요.
   - 누구나 "모임 방"을 만들 수 있어요 (방 이름 + 비밀번호). 초대 링크(index.html?r=방코드)로 친구가 들어와요.
   - 비밀번호는 어디에도 저장하지 않아요. "방코드 + 비밀번호"로 만든 열쇠(SHA-256)가 서버의 방 위치 이름이에요.
     비밀번호를 모르면 열쇠를 못 만들고, 열쇠가 없으면 방을 찾을 수 없어요. (서버 규칙: firestore.rules)
   - 한 번 들어온 방은 그 기기·브라우저에 기억돼서 다음부터는 바로 열려요. */
const SOS_FIREBASE = {
  apiKey: "AIzaSyAnS-wdTTxJS-rdCopSZpDxfueZ_4TK2lU",
  authDomain: "sos-calendar-f6bf7.firebaseapp.com",
  projectId: "sos-calendar-f6bf7",
  storageBucket: "sos-calendar-f6bf7.firebasestorage.app",
  messagingSenderId: "133710590792",
  appId: "1:133710590792:web:1a4d163ac4679ed6d1397d"
};
const ROOMS_KEY = 'sosRooms', CUR_KEY = 'sosRoom';
// 📲 카톡 등 앱 안 브라우저: 저장 공간이 따로라 같은 사람이 브라우저마다 따로 생겨요(중복 멤버).
//  그래서 방에 들어가기 전에 안드로이드는 크롬, 아이폰은 사파리로 넘겨요 (sosEscapeInApp, 아래)
const SOS_UA = navigator.userAgent || '';
const SOS_IOS = /iphone|ipad|ipod/i.test(SOS_UA);
const SOS_KAKAO = /KAKAOTALK/i.test(SOS_UA);
const SOS_INAPP = (SOS_KAKAO || /NAVER\(inapp|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|BAND\/|everytimeApp/i.test(SOS_UA))
  && !document.documentElement.hasAttribute('data-public');
const SOS_CONTACT = 'ifb1321@gmail.com';   // 운영자 문의 이메일 (이용약관·개인정보 페이지에 보여요). 비어 있으면 '준비 중'
document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('[data-contact]').forEach(el => {
  if(SOS_CONTACT){ el.innerHTML = ''; const a = document.createElement('a'); a.href = 'mailto:' + SOS_CONTACT; a.textContent = SOS_CONTACT; el.appendChild(a); }
  else el.textContent = '(운영자 이메일 준비 중)';
}));

// 이 기기에 기억된 방 목록 [{roomId, key, name}]
function sosRooms(){ try{ return JSON.parse(localStorage.getItem(ROOMS_KEY) || '[]'); }catch(e){ return []; } }
function forgetRoom(roomId){
  try{
    localStorage.setItem(ROOMS_KEY, JSON.stringify(sosRooms().filter(r => r.roomId !== roomId)));
    if(localStorage.getItem(CUR_KEY) === roomId) localStorage.removeItem(CUR_KEY);
  }catch(e){}
}
function rememberRoom(room){
  try{
    localStorage.setItem(ROOMS_KEY, JSON.stringify([room, ...sosRooms().filter(r => r.roomId !== room.roomId)].slice(0, 20)));
    localStorage.setItem(CUR_KEY, room.roomId);
  }catch(e){}
}
// 지금 들어와 있는 방. 초대 링크(?r=)로 왔는데 처음 보는 방이면 null (비밀번호를 물어요)
const INVITE = new URLSearchParams(location.search).get('r');
// 초대 링크에 함께 실려 온 방 이름·초대한 사람 닉네임 (비밀번호 전에 '어느 방인지' 보여 주는 용도, 글자로만 써요)
//  짧게 i = base64url(JSON [방 이름, 닉네임]) 로 실어요 (예전 링크의 n·by 도 읽어요)
const INVITE_INFO = (() => { const q = new URLSearchParams(location.search);
  let name = q.get('n') || '', by = q.get('by') || '';
  try{ const i = q.get('i'); if(i){ const b = atob(i.replace(/-/g, '+').replace(/_/g, '/'));
    [name, by] = JSON.parse(new TextDecoder().decode(Uint8Array.from(b, c => c.charCodeAt(0)))); } }catch(e){}
  return {name: String(name || '').slice(0, 30), by: String(by || '').slice(0, 20)}; })();
const ROOM = (() => {
  const rooms = sosRooms();
  if(INVITE){
    const hit = rooms.find(r => r.roomId === INVITE);
    if(!hit) return null;
    try{ localStorage.setItem(CUR_KEY, hit.roomId); }catch(e){}
    history.replaceState(null, '', location.pathname + location.hash);   // 주소창의 ?r= 은 지워요
    return hit;
  }
  let cur = null; try{ cur = localStorage.getItem(CUR_KEY); }catch(e){}
  return rooms.find(r => r.roomId === cur) || rooms[0] || null;
})();

// Firebase · 방 문서 (인터넷·SDK 문제로 못 쓰면 null)
function sosDb(){
  try{
    if(!(window.firebase && firebase.initializeApp)) return null;
    if(!firebase.apps.length) firebase.initializeApp(SOS_FIREBASE);
    return firebase.firestore();
  }catch(e){ return null; }
}
function roomRef(){ const db = sosDb(); return db && ROOM ? db.collection('rooms').doc(ROOM.key) : null; }
async function roomKey(roomId, pw){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(roomId + ':' + pw.trim().normalize('NFC')));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
}
function randomHex(){ return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join(''); }
async function sha256Hex(t){ const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2,'0')).join(''); }
const roomGone = snap => !snap.exists || snap.data().deleted === true;

/* 👤 멤버(닉네임)
   - 휴대폰마다 Firebase 익명 로그인으로 보이지 않는 번호(uid)가 생겨요. 이름·전화번호·이메일은 없어요.
   - 방에 들어올 때 닉네임을 정하면 rooms/{방 열쇠}/members/{uid} 에 저장돼요. 방 안의 기록은 멤버만 읽고 써요.
   - 방장은 멤버를 내보낼 수 있어요(on = false). 내보내진 휴대폰은 그 방에 다시 못 들어와요. */
const NICK_MAX = 20;
const ME = { uid: '', nick: '', owner: false, ou: '', po: '' };
let sosAuthP = null;
function sosAuth(){
  if(sosAuthP) return sosAuthP;
  sosAuthP = (async () => {
    if(!sosDb() || !firebase.auth) return null;
    const a = firebase.auth();
    const u = await new Promise(res => { const off = a.onAuthStateChanged(x => { off(); res(x); }); });
    if(u) return u;
    return (await a.signInAnonymously()).user;
  })().catch(e => { console.warn('익명 로그인 실패', e); sosAuthP = null; return null; });
  return sosAuthP;
}
// 닉네임 묻기 (방에 처음 들어올 때 · 바꿀 때)
function askNick(title, sub, init){
  return new Promise(resolve => {
    const box = document.createElement('div'); box.className = 'pop-back nick-pop';
    box.innerHTML = `<form class="pop" role="dialog" aria-modal="true">
        <p class="pop-icon" aria-hidden="true">🙋</p><p class="pop-t"></p><div class="pop-b"><p></p></div>
        <input class="nick-in" maxlength="${NICK_MAX}" placeholder="예: 윤하아빠/2단지" autocomplete="off" aria-label="닉네임">
        <p class="nick-msg" aria-live="polite"></p>
        <div class="pop-btns">${init ? '<button type="button" class="btn" data-pop="0">취소</button>' : ''}<button type="submit" class="btn primary">확인</button></div>
      </form>`;
    box.querySelector('.pop-t').textContent = title; box.querySelector('.pop-b p').textContent = sub;
    const inp = box.querySelector('.nick-in'); inp.value = init || lastNick();
    box.addEventListener('click', e => { if(e.target.closest('[data-pop="0"]')){ box.remove(); resolve(null); } });
    box.querySelector('form').addEventListener('submit', e => {
      e.preventDefault(); const v = inp.value.trim();
      if(!v){ box.querySelector('.nick-msg').textContent = '닉네임을 적어 주세요.'; return; }
      box.remove(); resolve(v);
    });
    document.body.appendChild(box); inp.focus();
  });
}
const lastNick = () => { try{ return localStorage.getItem('sosLastNick') || ''; }catch(e){ return ''; } };
function saveNick(n){ try{ localStorage.setItem('sosLastNick', n); }catch(e){} if(ROOM){ ROOM.nick = n; rememberRoom(ROOM); } }

// 방 안의 기록을 읽기 전에 꼭 거쳐요: 로그인 → 내 멤버 문서 확인 → 없으면 닉네임 정하고 들어가기
let sosReadyP = null;
function sosReady(){
  if(sosReadyP) return sosReadyP;
  sosReadyP = (async () => {
    if(!ROOM) return false;
    const user = await sosAuth();
    if(!user){ if(typeof sosTrouble === 'function') sosTrouble({code: 'auth'}); return false; }
    ME.uid = user.uid;
    const room = roomRef(), mine = room.collection('members').doc(user.uid);
    let snap, rs;
    try{ [snap, rs] = await Promise.all([mine.get(), room.get()]); }catch(e){ if(typeof sosTrouble === 'function') sosTrouble(e); return false; }
    // 방장이 지운 방이면(같은 브라우저 세션에서 처음 알아챘더라도) 바로 정리해요
    if(roomGone(rs)){
      sosLeaving = true;
      try{ if(typeof pushDropRoom === 'function') await pushDropRoom(ROOM); }catch(e){}
      forgetRoom(ROOM.roomId); alert(`'${ROOM.name}' 방은 방장이 지웠어요.`); location.href = 'index.html'; return new Promise(() => {});
    }
    if(snap.exists && snap.data().on === false) return sosKickedOut();
    if(snap.exists){
      ME.nick = snap.data().nick; if(ROOM.nick !== ME.nick) saveNick(ME.nick);
      // 마지막 접속(seen): 하루에 두 번 정도만 남겨요. 방장이 오래 안 온 멤버를 알아보고, 방장이 떠났는지 판단할 때 써요
      const last = snap.data().seen || snap.data().joinedAt;
      if(!last || !last.toMillis || Date.now() - last.toMillis() > 12 * 3600e3) mine.update({seen: firebase.firestore.FieldValue.serverTimestamp()}).catch(() => {});
    }
    else{
      let nick = ROOM.nick;
      while(!nick) nick = await askNick(`'${ROOM.name}' 방에서 쓸 닉네임`, '모임·SOS·댓글에 이 닉네임이 보여요. 단톡방 닉네임과 같게 하면 알아보기 쉬워요.');
      nick = nick.slice(0, NICK_MAX);
      try{ await mine.set({nick, on: true, joinedAt: firebase.firestore.FieldValue.serverTimestamp()}); }
      catch(e){
        // 다른 탭이 같은 순간에 먼저 들어왔으면 그 문서를 그대로 써요
        let again = null; try{ again = await mine.get(); }catch(err){}
        if(!(again && again.exists && again.data().on !== false)){ if(typeof sosTrouble === 'function') sosTrouble(e); return false; }
        nick = again.data().nick;
      }
      ME.nick = nick; saveNick(nick);
      // 같은 닉네임이 이미 있으면 (다른 브라우저·앱으로 들어왔던 기록일 수 있어요) 알려 줘요
      try{
        const dup = (await room.collection('members').where('nick', '==', nick).get()).docs.filter(d => d.id !== user.uid && d.data().on !== false);
        if(dup.length) setTimeout(() => alert(`'${nick}' 닉네임이 이 방에 이미 있어요.\n\n다른 브라우저(카카오톡 안 브라우저 등)나 앱으로 들어왔던 기록일 수 있어요. 브라우저마다 따로 로그인되기 때문이에요.\n\n• 같은 사람이면: 방장에게 예전 것 '내보내기'를 부탁해 주세요 (👥 멤버)\n• 다른 사람이면: 👥 멤버 → ✏️ 내 닉네임 바꾸기`), 300);
      }catch(e){}
    }
    // 방장인지: 새 방은 ou(방장 uid). 예전 방은 이 휴대폰의 방장 열쇠로 한 번 등록해요
    try{
      const r = rs.data() || {};
      ME.ou = r.ou || ''; ME.po = r.po || '';
      if(!r.ou && r.oh && ROOM.owner){
        const b = sosDb().batch();
        b.set(room.collection('private').doc('owner'), {k: ROOM.owner, uid: user.uid});
        b.update(room, {ou: user.uid});
        await b.commit(); ME.ou = user.uid;
      }
    }catch(e){}
    ME.owner = !!ME.ou && ME.ou === user.uid;
    sosWatchMe(mine);
    return true;
  })();
  return sosReadyP;
}
// 내보내졌을 때: 이 휴대폰 목록에서 빼고 알려 줘요 (닉네임 지우기용으로 방은 기억해 둬요)
let sosLeaving = false;   // 내가 스스로 나가는 중이면 아래 감시가 끼어들지 않아요
async function sosKickedOut(){
  if(sosLeaving) return new Promise(() => {});
  sosLeaving = true;
  rememberKicked(ROOM);   // '내 정보 모두 지우기' 때 이 방의 닉네임도 지울 수 있게 기억해 둬요
  try{ if(typeof pushDropRoom === 'function') await pushDropRoom(ROOM); }catch(e){}   // 이 방 알림 채널에서 빠져요
  forgetRoom(ROOM.roomId);
  alert(`'${ROOM.name}' 방에서 방장이 내보냈어요.\n\n다시 들어가려면 방장에게 '다시 들어올 수 있게 허용'을 부탁해 주세요.\n허용되면 초대 링크로 다시 들어올 수 있어요.`);
  location.href = 'index.html'; return new Promise(() => {});
}
// 내 멤버 문서를 계속 지켜봐요: 앱을 켜 둔 사이에 내보내지거나 방이 지워지면 바로 알려 주고,
//  다른 탭·기기에서 닉네임을 바꿨으면 여기서도 맞춰요 (안 맞으면 서버가 글쓰기를 거절해요)
function sosWatchMe(mine){
  mine.onSnapshot(async s => {
    if(sosLeaving || s.metadata.fromCache) return;
    if(s.exists){
      const d = s.data();
      if(d.on === false) return sosKickedOut();
      if(d.nick && d.nick !== ME.nick){ ME.nick = d.nick; saveNick(d.nick); }
      return;
    }
    // 내 문서가 사라졌어요: 방이 지워졌거나, 방장이 멤버 목록에서 뺐어요
    sosLeaving = true;
    let gone = true; try{ gone = roomGone(await roomRef().get()); }catch(e){}
    try{ if(typeof pushDropRoom === 'function') await pushDropRoom(ROOM); }catch(e){}
    forgetRoom(ROOM.roomId);
    alert(gone ? `'${ROOM.name}' 방은 방장이 지웠어요.` : `'${ROOM.name}' 방의 멤버 목록에서 빠졌어요.\n\n초대 링크와 비밀번호로 다시 들어올 수 있어요.`);
    location.href = 'index.html';
  }, () => {});
}
// 👑 방장 되기: 지목받아 수락하거나, 방장이 떠난 방을 이어받을 때. 이 휴대폰에서 새 방장 열쇠를 만들어
//  서버엔 지문(oh)만 올리고 열쇠는 이 휴대폰에만 둬요 (방 지우기에 씀). 예전 방장 열쇠는 더 이상 안 맞아요
async function sosBecomeOwner(){
  if(!(await sosReady())) throw new Error('not ready');
  const k = randomHex();
  await roomRef().update({ou: ME.uid, oh: await sha256Hex(k), po: firebase.firestore.FieldValue.delete()});
  ROOM.owner = k; rememberRoom(ROOM);
  ME.ou = ME.uid; ME.po = ''; ME.owner = true;
  document.dispatchEvent(new Event('sos:owner'));   // 홈의 '방 지우기 / 방 빼기' 버튼이 다시 계산해요
}
// 방장이 떠났는지 (멤버에서 나갔거나 60일 넘게 안 들어옴). 서버 규칙(ownerGone)과 같은 기준
const OWNER_GONE_DAYS = 60;
function sosOwnerGone(list){
  if(!ME.ou) return false;
  const o = list.find(m => m.uid === ME.ou); if(!o) return true;
  const last = o.seen || o.joinedAt;
  return !!(last && last.toMillis && Date.now() - last.toMillis() > OWNER_GONE_DAYS * 864e5);
}
// 📤 앱 공유: 앱 첫 화면 주소를 공유해요 (방 초대가 아니라 앱 소개용). 공유가 안 되면 주소를 복사해요
async function sosShareApp(){
  const url = new URL('index.html', location.href).href;
  const text = '공동육아 SOS 🆘\n어떤 플랫폼에서 모이든, 공동육아의 모임을 도와드려요.\n가입 없이 링크 + 비밀번호 + 닉네임이면 끝.';
  if(navigator.share){ try{ await navigator.share({title: '공동육아 SOS', text, url}); return; }catch(e){ if(e.name === 'AbortError') return; } }
  try{ await navigator.clipboard.writeText(text + '\n' + url); alert('앱 주소를 복사했어요.\n단톡방에 붙여넣어 주세요.'); }
  catch(e){ prompt('이 주소를 복사해 주세요', url); }
}
// 🧪 '베타' 표시를 누르면 지금이 어떤 단계인지 알려 줘요
function sosBetaInfo(){
  if(document.querySelector('.pop-beta')) return;
  const box = document.createElement('div'); box.className = 'pop-back pop-beta-back';
  box.innerHTML = `<div class="pop-beta" role="dialog" aria-modal="true" aria-label="베타 버전 안내">
      <p class="pb-t">🧪 베타 버전이에요</p>
      <p class="pb-s">정식 출시 전,<br>실제로 써 보며 다듬는 중이에요.</p>
      <ul class="pb-l"><li>기능과 화면이 바뀔 수 있어요</li><li>방과 기록은 그대로 저장돼요</li></ul>
      ${SOS_CONTACT ? `<p class="pb-m">의견은 <a href="mailto:${SOS_CONTACT}">${SOS_CONTACT}</a></p>` : ''}
      <button type="button" class="pb-ok">확인</button>
    </div>`;
  const close = () => { box.remove(); document.removeEventListener('keydown', key); };
  const key = e => { if(e.key === 'Escape') close(); };
  box.addEventListener('click', e => { if(e.target === box || e.target.closest('.pb-ok')) close(); });
  document.addEventListener('keydown', key);
  document.body.appendChild(box); box.querySelector('.pb-ok').focus();
}
document.addEventListener('click', e => { if(e.target.closest('#gate .g-demo')){ e.preventDefault(); e.stopPropagation(); sosBetaInfo(); } }, true);
document.addEventListener('click', e => { if(e.target.closest('#gate .g-share')){ e.preventDefault(); e.stopPropagation(); sosShareApp(); } }, true);
// 🗑 내 정보 모두 지우기: 모든 방에서 내 멤버(닉네임) 빼기 → 알림 끄기 → 익명 로그인 지우기 → 이 휴대폰 기록 지우기
//  SOS 요청·참석 표시는 날짜가 지나고 7일 뒤 자동으로 지워져요
//  내보내진 방은 문서를 지울 수 없어서(다시 들어오는 걸 막으려고 남겨 둬요) 닉네임만 '(정보 지움)'으로 바꿔요
const KICKED_KEY = 'sosKicked';
function rememberKicked(room){ try{ localStorage.setItem(KICKED_KEY, JSON.stringify([{roomId: room.roomId, key: room.key}, ...sosKicked().filter(r => r.roomId !== room.roomId)].slice(0, 20))); }catch(e){} }
function sosKicked(){ try{ return JSON.parse(localStorage.getItem(KICKED_KEY) || '[]'); }catch(e){ return []; } }
async function sosDeleteMe(){
  sosLeaving = true;
  const user = await sosAuth(), db = sosDb();
  if(user && db) for(const r of [...sosRooms(), ...sosKicked()]){
    const me = db.collection('rooms').doc(r.key).collection('members').doc(user.uid);
    try{ await me.delete(); }
    catch(e){ try{ await me.update({nick: '(정보 지움)'}); }catch(err){} }
  }
  try{ if(typeof pushOff === 'function') await pushOff(); }catch(e){}
  try{ if(user) await user.delete(); }catch(e){ try{ await firebase.auth().signOut(); }catch(err){} }
  try{ localStorage.clear(); sessionStorage.clear(); }catch(e){}
}
// 이 방에서 나가기: 내 닉네임을 멤버에서 빼고 이 휴대폰 목록에서도 빼요
async function sosLeaveRoom(){
  sosLeaving = true;
  try{ if(await sosReady()) await roomRef().collection('members').doc(ME.uid).delete(); }catch(e){}
  try{ if(typeof pushDropRoom === 'function') await pushDropRoom(ROOM); }catch(e){}   // 이 방 알림 채널에서 빠져요
  forgetRoom(ROOM.roomId);
}

// 방 멤버 목록 (한 번 읽고 기억). [{uid, nick, joinedAt}]
let sosMembersP = null;
function sosMembers(fresh){
  if(sosMembersP && !fresh) return sosMembersP;
  sosMembersP = sosReady().then(ok => ok ? roomRef().collection('members').where('on', '==', true).get() : null)
    .then(q => q ? q.docs.map(d => ({uid: d.id, ...d.data()})).sort((a, b) => ((a.joinedAt && a.joinedAt.seconds) || 0) - ((b.joinedAt && b.joinedAt.seconds) || 0)) : [])
    .catch(() => []);
  return sosMembersP;
}

// 방 지우기 (방을 만든 휴대폰만)
//  1) 방이 살아 있을 때 방 안의 기록(모임·댓글·SOS·멤버) 위치를 모두 모아 두고
//  2) 방장 열쇠(owner)를 보내 '지워짐' 표시 + 방 이름 비우기 (서버의 지문 oh 와 맞아야 함)
//  3) 모아 둔 기록을 서버에서 실제로 지워요 (서버 규칙: 지워진 방의 기록만 지울 수 있음)
//  예전에 열쇠 없이 만든 방은 들어온 사람 누구나 지울 수 있어요.
//  중간에 인터넷이 끊겨도 괜찮아요: 지울 목록을 이 휴대폰에 적어 두고, 다시 누르거나 다음에 앱을 열 때 이어서 지워요
//  ('지워짐' 표시 뒤에는 방 안을 다시 읽을 수 없어서, 목록은 표시 전에 모아 둬요)
const DEL_KEY = 'sosDelPending';
const pendingDeletes = () => { try{ return JSON.parse(localStorage.getItem(DEL_KEY) || '[]'); }catch(e){ return []; } };
function setPendingDelete(roomId, job){ try{ localStorage.setItem(DEL_KEY, JSON.stringify([...pendingDeletes().filter(j => j.roomId !== roomId), ...(job ? [job] : [])])); }catch(e){} }
async function deleteRoom(){
  const db = sosDb(); if(!db || !ROOM) throw new Error('offline');
  sosLeaving = true;
  const room = db.collection('rooms').doc(ROOM.key);
  let job = pendingDeletes().find(j => j.roomId === ROOM.roomId && j.marked);   // '지워짐' 표시 전 작업은 다시 모아요 (열쇠·목록이 바뀌었을 수 있어요)
  if(!job){
    const paths = [];
    const ops = await room.collection('opinions').get();
    for(const d of ops.docs){
      paths.push(d.ref.path);
      (await d.ref.collection('comments').get()).docs.forEach(c => paths.push(c.ref.path));
    }
    for(const name of ['sos', 'plays', 'reports', 'members']) (await room.collection(name).get()).docs.forEach(d => paths.push(d.ref.path));
    paths.push(room.collection('private').doc('owner').path);
    job = {roomId: ROOM.roomId, key: ROOM.key, k: ROOM.owner || '', paths, marked: false};
    setPendingDelete(ROOM.roomId, job);
  }
  await runPendingDelete(db, job);
  forgetRoom(ROOM.roomId);
}
async function runPendingDelete(db, job){
  const room = db.collection('rooms').doc(job.key);
  if(!job.marked){
    // 이미 '지워짐' 표시가 됐으면(지난번에 표시 직후 끊김) 건너뛰어요
    const snap = await room.get();
    try{ if(!(snap.exists && snap.data().deleted === true)) await room.update({deleted: true, name: '', k: job.k}); }
    catch(e){ if(e && e.code === 'permission-denied') setPendingDelete(job.roomId, null); throw e; }   // 방장이 아니면(바뀌었으면) 작업을 버려요
    job.marked = true; setPendingDelete(job.roomId, job);
  }
  while(job.paths.length){
    const batch = db.batch(); job.paths.slice(0, 400).forEach(p => batch.delete(db.doc(p))); await batch.commit();
    job.paths = job.paths.slice(400); setPendingDelete(job.roomId, job);
  }
  setPendingDelete(job.roomId, null);
}
// 지난번에 다 못 지운 방이 있으면, 앱을 열 때 조용히 이어서 지워요
window.addEventListener('load', () => {
  const jobs = pendingDeletes().filter(j => j.marked); if(!jobs.length) return;   // 표시까지 된 작업만 이어서 해요
  setTimeout(async () => { const db = sosDb(); if(!db) return; for(const j of jobs){ try{ await runPendingDelete(db, j); }catch(e){} } }, 5000);
});

// 들어와 있는 방이 지워졌으면 이 휴대폰에서도 빼고 알려 줘요
window.addEventListener('load', async () => {
  const db = sosDb(); if(!db || !ROOM) return;
  const checked = 'sosChecked:' + ROOM.roomId;   // 브라우저를 새로 열 때 한 번만 확인해요 (읽기 횟수 절약)
  try{ if(sessionStorage.getItem(checked)) return; sessionStorage.setItem(checked, '1'); }catch(e){}
  try{
    const snap = await db.collection('rooms').doc(ROOM.key).get();
    if(roomGone(snap)){
      try{ if(typeof pushDropRoom === 'function') await pushDropRoom(ROOM); }catch(e){}
      forgetRoom(ROOM.roomId); alert(`'${ROOM.name}' 방은 방장이 지웠어요.`); location.href = 'index.html';
    }
  }catch(e){ /* 인터넷 문제: 그냥 둬요 */ }
});

function inviteUrl(){
  const base = location.href.split(/[?#]/)[0].replace(/[^/]*$/, '') + 'index.html?r=' + ROOM.roomId;
  const nick = (typeof ME !== 'undefined' && ME.nick) || ROOM.nick || '';
  const bytes = new TextEncoder().encode(JSON.stringify([ROOM.name, nick]));
  return base + '&i=' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function newRoomId(){
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';   // 헷갈리는 글자(0,o,1,l,i) 빼고
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), b => chars[b % chars.length]).join('');
}
function roomError(err){
  const c = (err && err.code) || '';
  if(c === 'resource-exhausted') return '오늘은 쓰는 분이 많아 잠시 멈췄어요. 오후 5시쯤 다시 열려요.';
  if(c === 'unavailable') return '인터넷 연결을 확인해 주세요.';
  if(c === 'permission-denied') return '서버가 거절했어요. 잠시 뒤 다시 해 주세요.';
  return '문제가 생겼어요. 잠시 뒤 다시 해 주세요.';
}

// 첫 화면 이야기(이 앱을 만든 이유) + 3줄 사용법 — 입장 화면과 '소개 다시 보기'가 같이 써요
const GATE_STORY = `        <div class="g-tool">
          <p class="g-tool-h">어떤 플랫폼에서 모이든,<br><b>🆘 공동육아의 모임을 도와드립니다.</b></p>
          <div class="g-flow" aria-label="대화는 원래 모임에서, SOS와 모임 날짜는 공동육아 SOS에서. 링크 하나로 연결">
            <div class="g-fbox">
              <p class="g-fic" aria-hidden="true">💬🥕<br>🟢👥</p>
              <p class="g-ft">우리 모임</p>
              <p class="g-fs">카톡 · 당근<br>밴드 · 소모임<br><b>대화는 여기서</b></p>
            </div>
            <div class="g-farrow" aria-hidden="true"><span>🔗</span><i></i><small>링크<br>하나로</small></div>
            <div class="g-fbox g-fapp">
              <span class="g-ding" aria-hidden="true">🔔 띵동!</span>
              <img src="assets/icon.svg" alt="" width="40" height="40">
              <p class="g-ft">공동육아 SOS</p>
              <p class="g-fs">🆘 SOS 요청<br>🙌 모임 날짜<br>🔔 새 모임 알림<br><b>약속은 여기서</b></p>
            </div>
          </div>
          <p class="g-fnick">🙋 가입 없이 <b>닉네임</b>만 정하면 끝</p>
        </div>
        <div class="g-story">
          <p class="g-kick"><span>오늘도 독박육아…</span> 😂</p>
          <p class="g-q">"아… 오늘은 또 어떻게 버티지?"</p>
          <p class="g-sub">아기랑 하루 종일 붙어 있는데<br>의미 없이 시간만 흘러가는 것 같은 날.</p>
          <p>같이 육아하면 서로 의지도 되고<br>아이에게도 좋은 에너지를<br>줄 수 있을 것 같은데…</p>
          <p class="g-shy">단톡방에 "모임 해요!"<br>글쓰긴 쑥스러울 때 🙈<br>조용히 <b>SOS</b>를 보내 보세요.</p>
          <p>SOS가 모이면,<br><b>용기 있는 누군가가<br>손을 내밀어 줄 거예요</b> 🙌<br>오늘도 으쌰으쌰 같이 이겨내요 💪</p>
        </div>
        <ul class="g-how">
          <li>🆘 <b>힘든 날</b>엔 SOS만 꾹</li>
          <li>👀 SOS가 <b>몰린 시간</b>은 모두가 봐요</li>
          <li>🙌 <b>용기 낸 한 명</b>이 모임을 열어요</li>
          <li>💬 대화는 <b>원래 단톡방·밴드</b>에서 그대로</li>
          <li>🙋 가입 없이 <b>링크 + 비밀번호 + 닉네임</b>만</li>
          <li>📲 다운로드 없이 <b>홈 화면 바로가기</b>로 앱처럼</li>
        </ul>`;

function gateCss(){
  if(document.getElementById('gateCss')) return;
  const css = document.createElement('style');
  css.textContent = `
    html.gate-locked body > *:not(#gate):not(.pop-back){display:none!important}
    #gate{position:fixed;inset:0;display:flex;justify-content:center;overflow-y:auto;padding:24px 16px;background:var(--page,#f3f5f2);z-index:100}
    #gate .g-card{width:100%;max-width:380px;margin:auto 0;padding:24px 16px!important;display:flex;flex-direction:column;gap:12px;background:var(--bg,#fff);border:1px solid var(--line,#e2e6e1);border-radius:20px;padding:28px 22px;box-shadow:0 2px 14px rgba(20,40,30,.08);text-align:center}
    #gate .g-icon{width:72px;height:72px;margin:0 auto;border-radius:18px;display:block}
    #gate h1{margin:0;font-size:22px}
    .pop-beta-back{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,12,12,.45)}
    .pop-beta{width:min(272px,100%);box-sizing:border-box;padding:16px 16px 12px;border-radius:16px;border:1px solid var(--line,#e3e3e5);background:var(--bg,#fff);color:var(--fg,#22282a);box-shadow:0 8px 28px rgba(0,0,0,.28);text-align:left;font-size:13px;line-height:1.55;word-break:keep-all}
    .pop-beta p{margin:0}
    .pop-beta .pb-t{font-size:15px;font-weight:800;margin-bottom:6px}
    .pop-beta .pb-s{color:var(--muted,#736e75);white-space:nowrap}
    .pop-beta .pb-l{margin:8px 0 0;padding-left:16px;white-space:nowrap}
    .pop-beta .pb-l li{margin:1px 0}
    .pop-beta .pb-m{margin-top:8px;font-size:12px;color:var(--muted,#736e75);white-space:nowrap}
    .pop-beta .pb-m a{color:var(--accent-ink,#1c7276)}
    .pop-beta .pb-ok{display:block;width:100%;margin-top:12px;padding:8px;border:0;border-radius:10px;background:var(--tag,#efefef);color:var(--fg,#22282a);font:inherit;font-weight:700;font-size:13px;cursor:pointer}
    #gate .g-demo{display:inline-block;vertical-align:middle;margin-left:6px;padding:2px 8px!important;border-radius:999px!important;border:1px solid var(--muted,#736e75)!important;background:transparent!important;color:var(--muted,#736e75)!important;font-size:11.5px!important;font-weight:700!important;letter-spacing:-.2px;white-space:nowrap;position:relative;top:-2px;cursor:pointer}
    #gate p{margin:0;color:var(--muted,#6b7570);font-size:14px}
    #gate input{font:inherit;font-size:16px;padding:12px;border-radius:12px;border:1px solid var(--line,#e2e6e1);background:var(--bg,#fff);color:var(--fg,#1f2a24);text-align:center}
    #gate button{font:inherit;font-weight:700;font-size:15px;padding:12px;border-radius:12px;border:0;background:var(--pick,#2a9095);color:var(--pick-fg,#fff);cursor:pointer}
    #gate .g-msg{color:#c0392b;min-height:1.2em}
    #gate .g-tool{display:flex;flex-direction:column;gap:8px;padding:14px 12px;border-radius:14px;border:2px solid var(--pick,#2a9095)}
    #gate .g-tool-h{font-size:16px!important;line-height:1.5;color:var(--fg,#22282a)!important}
    #gate .g-tool-h b{color:var(--accent-ink,#1c7276);font-size:17px;word-break:keep-all}
    #gate .g-tool-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:5px}
    #gate .g-tool-chips span{font-size:12.5px;font-weight:700;padding:3px 9px;border-radius:999px;background:var(--tag,#efefef);color:var(--fg,#22282a)}
    #gate .g-tool-sub{font-size:13px!important;line-height:1.6}
    #gate .g-flow{display:grid;grid-template-columns:1fr 44px 1fr;align-items:center;gap:4px}
    #gate .g-fbox{display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 6px;border-radius:14px;background:var(--tag,#efefef);min-height:118px;justify-content:center}
    #gate .g-fapp{background:transparent;border:2px solid var(--pick,#2a9095)}
    #gate .g-fapp{position:relative}
    #gate .g-ding{position:absolute;top:-11px;right:-6px;font-size:11.5px;font-weight:800;padding:3px 8px;border-radius:999px;background:#e8382f;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.25);transform-origin:50% 0;animation:g-ding 2.4s ease-in-out infinite}
    @keyframes g-ding{0%,60%,100%{transform:rotate(0)}66%{transform:rotate(-12deg)}74%{transform:rotate(10deg)}82%{transform:rotate(-6deg)}90%{transform:rotate(3deg)}}
    @media (prefers-reduced-motion: reduce){#gate .g-ding{animation:none}}
    #gate .g-fapp img{width:40px;height:40px;border-radius:10px}
    #gate .g-fic{font-size:19px!important;line-height:1.25;letter-spacing:2px}
    #gate .g-ft{font-weight:800;font-size:14px!important;color:var(--fg,#22282a)!important}
    #gate .g-fs{font-size:11.5px!important;line-height:1.45;word-break:keep-all}
    #gate .g-fs b{color:var(--accent-ink,#1c7276)}
    #gate .g-farrow{display:flex;flex-direction:column;align-items:center;gap:2px}
    #gate .g-farrow span{font-size:18px}
    #gate .g-farrow i{display:block;width:100%;height:3px;border-radius:2px;background:var(--pick,#2a9095);position:relative}
    #gate .g-farrow i::after{content:"";position:absolute;right:-2px;top:-5px;border:6.5px solid transparent;border-left:9px solid var(--pick,#2a9095);border-right:0}
    #gate .g-farrow small{font-size:10.5px;font-weight:700;color:var(--accent-ink,#1c7276);line-height:1.2;text-align:center}
    #gate .g-fnick{font-size:13px!important;padding:6px 10px;border-radius:999px;background:var(--tag,#efefef);align-self:center}
    #gate .g-story{text-align:left;display:flex;flex-direction:column;gap:10px;padding:14px 12px;border-radius:14px;background:var(--tag,#efefef)}
    #gate .g-story p{color:var(--fg,#22282a);font-size:14px;line-height:1.7}
    #gate .g-story .g-q{font-weight:700;font-size:16px}
    #gate .g-story .g-kick{font-weight:800;font-size:21px!important;line-height:1.35;letter-spacing:-.3px;color:#e8382f;white-space:nowrap;margin-bottom:-2px}
    @media (prefers-color-scheme: dark){ #gate .g-story .g-kick{color:#ff6b62} }
    /* 검정 글자 테두리 (이모티콘은 빼고 글자만) — 테두리를 글자 뒤에 그려서 글자가 가늘어지지 않게 */
    #gate .g-story .g-kick span{-webkit-text-stroke:3.5px #111;paint-order:stroke fill;letter-spacing:.2px}
    @supports not (paint-order:stroke fill){ #gate .g-story .g-kick span{-webkit-text-stroke:0;text-shadow:-1.5px -1.5px 0 #111,1.5px -1.5px 0 #111,-1.5px 1.5px 0 #111,1.5px 1.5px 0 #111,0 -1.5px 0 #111,0 1.5px 0 #111,-1.5px 0 0 #111,1.5px 0 0 #111} }
    @media (max-width:340px){ #gate .g-story .g-kick{font-size:19px!important}
      #gate .g-flow{grid-template-columns:1fr 34px 1fr;gap:3px}
      #gate .g-fbox{padding:10px 3px}
      #gate .g-ft{font-size:13px!important;letter-spacing:-.4px;white-space:nowrap}
      #gate .g-fs{font-size:11px!important;letter-spacing:-.4px;white-space:nowrap} }
    #gate .g-story .g-sub{color:var(--muted,#736e75)}
    #gate .g-story .g-shy{font-weight:700;font-size:15px!important;color:var(--fg,#22282a);letter-spacing:-.2px}
    #gate .g-story .g-shy b{color:#e8382f}
    @media (prefers-color-scheme: dark){ #gate .g-story .g-shy b{color:#ff6b62} }
    @media (max-width:359px){ #gate .g-how li{font-size:13px!important;white-space:nowrap;letter-spacing:-.2px} #gate .g-story p{font-size:13px!important;letter-spacing:-.2px} }
    #gate .g-how{text-align:left;margin:0;padding:0 4px;list-style:none;display:flex;flex-direction:column;gap:6px;font-size:14px;line-height:1.55}
    #gate .g-how b{color:var(--accent-ink,#1c7276)}
    #gate .g-close{position:absolute;top:10px;right:10px;width:36px;height:36px;padding:0!important;border-radius:50%!important;background:var(--tag,#efefef)!important;color:var(--fg,#22282a)!important;font-size:18px!important}
    #gate .g-card{position:relative}
    #gate .g-share{position:absolute;top:12px;right:12px;width:auto!important;padding:6px 12px!important;border-radius:999px!important;border:1.5px solid var(--accent-ink,#1c7276)!important;background:transparent!important;color:var(--accent-ink,#1c7276)!important;font-size:13px!important;font-weight:700;white-space:nowrap}
    #gate .g-share.left{right:auto;left:12px}
    #gate .g-link{color:var(--accent-ink,#1c7276);font-size:14px;font-weight:600}
    #gate .g-rooms{display:flex;flex-direction:column;gap:6px}
    #gate .g-room{background:var(--tag,#efefef)!important;color:var(--fg,#22282a)!important;font-weight:600}
    #gate .g-room[aria-current]{outline:2px solid var(--pick,#2a9095)}
    #gate .g-room{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left}
    #gate .g-rname{flex:1;overflow-wrap:anywhere}
    #gate .g-chips{display:flex;gap:4px;flex:none}
    #gate .g-chip{font-size:12.5px;font-weight:700;padding:2px 8px;border-radius:999px}
    #gate .g-chip.sos{background:#e8382f;color:#fff}
    #gate .g-chip.meet{background:var(--pick,#2a9095);color:var(--pick-fg,#fff)}
    #gate .g-chip.quiet, #gate .g-chip.gone{background:transparent;color:var(--muted,#736e75);font-weight:500}
    #gate .g-legend{font-size:12.5px!important;margin:0}
    #gate .g-listbox{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:16px;border:1.5px solid var(--line,#e3e3e5);background:var(--bg,#fff);text-align:left}
    #gate .g-list-h{margin:0;font-weight:800;font-size:15px!important;color:var(--fg,#22282a)!important}
    #gate .g-list-h small{font-weight:500;color:var(--muted,#736e75);font-size:12px;margin-left:4px}
    #gate .g-room{padding:12px!important}
    #gate .g-inv{display:flex;flex-direction:column;gap:4px;padding:12px;border-radius:12px;background:var(--bg,#fff);border:1.5px solid var(--pick,#2a9095)}
    #gate .g-inv-name{font-size:19px!important;font-weight:800;color:var(--fg,#22282a)!important;word-break:keep-all;overflow-wrap:anywhere}
    #gate .g-inv-by{font-size:14px!important}
    #gate .g-inv-by b{color:var(--accent-ink,#1c7276)}
    #gate .g-row{display:flex;gap:6px;align-items:stretch}
    #gate .g-row .g-room{flex:1;min-width:0}
    #gate .bell{flex:none;width:30px;padding:0!important;font-size:13px!important;border-radius:9px!important;background:var(--tag,#efefef)!important;color:var(--fg,#22282a)!important}
    #gate .g-listbox{padding:10px 8px!important}
    @media (max-width:370px){#gate{padding-left:10px;padding-right:10px} #gate .g-card{padding-left:12px!important;padding-right:12px!important}}
    #gate .g-row{gap:4px!important}
    #gate .g-row .g-room{padding:8px 7px 8px 9px!important;font-size:14px!important;gap:4px}
    #gate .g-row .g-rname{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;letter-spacing:-.3px}
    #gate .g-row .g-now{font-size:10px;padding:1px 5px;letter-spacing:-.3px}
    #gate .g-row .g-chips{gap:3px;margin-left:6px}
    #gate .g-row .g-chip{font-size:10.5px;padding:1px 5px;letter-spacing:-.3px}
    #gate .g-row .g-chip.quiet{padding:1px 0}
    #gate .g-row .g-go-arrow{font-size:15px}
    #gate .bell.on{background:var(--bg,#fff)!important;box-shadow:inset 0 0 0 2px var(--pick,#2a9095)}
    #gate .g-pushhelp .push-help{margin:0;text-align:left}
    #gate .g-pushhelp .push-help > summary{font-size:13px;font-weight:600;color:var(--muted,#736e75);text-align:center;padding:4px}
    #gate .g-pushhelp .push-help:not([open]){border:none!important;background:transparent!important;padding:0!important}
    #gate .g-pushhelp p, #gate .g-pushhelp small{font-size:13px}
    #gate .g-now{flex:none;font-size:11.5px;font-weight:700;padding:2px 7px;border-radius:999px;border:1px solid var(--pick,#2a9095);color:var(--accent-ink,#1c7276)}
    #gate .g-go-arrow{flex:none;font-size:20px;line-height:1;color:var(--muted,#736e75)}
    #gate .g-more > summary{padding:12px;border-radius:14px;border:2px solid var(--pick,#2a9095);color:var(--accent-ink,#1c7276);font-weight:800;text-align:center;list-style:none}
    #gate .g-more > summary::-webkit-details-marker{display:none}
    #gate .g-more[open] > summary{margin-bottom:4px}
    #gate .g-more{border:none!important;padding:0!important;background:transparent!important}
    #gate .g-more{text-align:left}
    #gate .g-more[open]{display:flex;flex-direction:column;gap:10px}
    #gate .g-extra{text-align:left;display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line,#e3e3e5);padding-top:14px}
    #gate .g-extra details p, #gate .g-extra ol, #gate .g-extra ul{font-size:13.5px;line-height:1.6;margin:6px 0}
    #gate .g-extra input{width:100%;box-sizing:border-box;margin:6px 0}
    #gate .g-extra .g-go, #gate .g-extra .g-install{width:100%}
    #gate .g-howto{display:block;margin:10px 0 0;padding:12px;border:2px solid var(--accent-ink,#1c7276);border-radius:14px;text-align:center;font-weight:700;color:var(--accent-ink,#1c7276);text-decoration:none;white-space:nowrap;font-size:15px}
    #gate .g-howto small{font-weight:500;opacity:.8}
    #gate .g-guide{text-align:left;padding:14px 12px;border-radius:14px;background:var(--tag,#efefef)}
    #gate .g-guide p, #gate .g-guide ol{font-size:13.5px;line-height:1.65;color:var(--fg,#22282a);margin:0 0 6px}
    #gate .g-guide ol{padding-left:20px}
    #gate .g-guide li{margin:3px 0}
    #gate .g-guide-h{font-weight:700;font-size:15px!important}
    #gate .g-guide-tip{color:var(--muted,#736e75)!important;font-size:12.5px!important;margin:6px 0 0!important}
    #gate .g-safety{text-align:center;margin-top:4px}
    #gate .g-card[hidden]{display:none}
    #gate .g-back{background:transparent!important;color:var(--accent-ink,#1c7276)!important;font-weight:600}
    #gate .g-box{display:flex;flex-direction:column;gap:10px;padding:16px 14px;border:2px solid var(--pick,#2a9095);border-radius:16px;background:var(--accent-soft,#e1f2f1)}
    #gate .g-box-h{font-size:16px!important;font-weight:800;color:var(--accent-ink,#1c7276)!important;margin:0}
    #gate .g-box p{margin:0}
    #gate .g-box .g-msg{margin:0;min-height:0}
    #gate input{border:1.5px solid rgba(127,127,127,.6)!important;background:var(--bg,#fff)}
    #gate input:focus{outline:2px solid var(--pick,#2a9095);border-color:var(--pick,#2a9095)!important}
    #gate .g-paste{border:2px dashed #e0a400!important;border-radius:14px}
    #gate .g-paste summary{color:#b88600;font-weight:700}
    @media (prefers-color-scheme: dark){ #gate .g-paste summary{color:#ffc83d} }
    #gate .g-pw{margin-top:4px;border-top:1px solid var(--line,#e3e3e5);padding-top:14px}`;
  css.id = 'gateCss'; document.head.appendChild(css);
}

// 메뉴의 '📖 소개' 버튼: 비밀번호 없이 첫 화면 이야기만 다시 보여 줘요
function showIntro(){
  gateCss();
  if(document.getElementById('gate')) return;
  const box = document.createElement('div'); box.id = 'gate'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '공동육아 SOS 소개');
  box.innerHTML = `<div class="g-card">
      <button type="button" class="g-close" aria-label="닫기">✕</button>
      <button type="button" class="g-share left">📤 앱 공유</button>
      <img class="g-icon" src="assets/icon.svg" alt="" width="72" height="72">
      <h1>공동육아 SOS 🆘<button type="button" class="g-demo" aria-label="베타 버전 안내">베타</button></h1>
${GATE_STORY}
      <button type="button" class="g-ok">시작하기</button>
      <a class="g-howto" href="guide.html">📖 그림으로 보는 사용법 <small>(17장)</small></a>
      <a class="g-link" href="index.html#install">📲 홈 화면에 설치하는 방법 보기</a>
    </div>`;
  const close = () => { box.remove(); document.removeEventListener('keydown', esc); };
  const esc = e => { if(e.key === 'Escape') close(); };
  box.addEventListener('click', e => { if(e.target === box || e.target.closest('.g-close, .g-ok, .g-link')) close(); });
  document.addEventListener('keydown', esc);
  document.body.appendChild(box);
  box.querySelector('.g-ok').focus();
}

// 비밀번호 화면의 사용 방법: 이미 쓰는 모임 앱(단톡방·밴드 등) 옆에 붙여 쓰는 도구라는 것
const GATE_HOW_CREATE = `      <div class="g-guide">
        <p class="g-guide-h">📖 이렇게 써요</p>
        <p>우리가 모임하던 플랫폼은 <b>그대로 이용해요.</b><br><b>카톡 오픈채팅 · 당근 모임 · 밴드 · 소모임</b><br>어디든 <b>링크 하나로 붙여 쓰는 도구</b>예요.<br>대화는 거기서, <b>SOS와 모임 날짜만 여기서.</b></p>
        <ol>
          <li>여기서 <b>방 이름 · 비밀번호 · 내 닉네임</b>을 정해 방을 만들어요.</li>
          <li>홈의 <b>🔗 친구 초대하기</b>를 눌러 나온 링크를<br>단톡방·밴드 공지에 올리고, <b>비밀번호도 알려 주세요.</b></li>
          <li>독박 예정인 날엔 <b>🆘 SOS 요청</b>만 꾹</li>
          <li>SOS가 몰린 시간을 보고, 용기 낸 한 명이 <b>🙌 모임</b>을 열어요.</li>
        </ol>
        <p class="g-guide-tip">💡 비밀번호는 1234처럼 쉬운 것보다 우리끼리 아는 말로 정해 주세요.<br>비밀번호를 잊으면 되찾을 수 없어요.</p>
      </div>`;
const GATE_HOW_INVITE = `      <div class="g-guide">
        <p class="g-guide-h">📖 들어오면 이렇게 써요</p>
        <ol>
          <li>독박 예정인 날엔 <b>🆘 SOS 요청</b>만 꾹</li>
          <li>SOS가 몰린 시간을 보고, 용기 낸 한 명이 <b>🙌 모임</b>을 열어요.</li>
          <li>모임 이야기는 원래 쓰던 단톡방·밴드에서 편하게 해요.</li>
        </ol>
        <a class="g-howto" href="guide.html">📖 그림으로 보는 사용법 <small>(17장)</small></a>
      </div>`;

// 방에 들어가기 전에도 볼 수 있는 것: 초대 링크 붙여넣기, 홈 화면 설치 안내(홈의 설치 안내와 같은 글), 개인정보 안내
const GATE_EXTRA = `      <div class="g-extra">
        <details class="how-to">
          <summary>📲 홈 화면에 앱으로 설치하기</summary>
          <p>설치하면 홈 화면에 SOS 깃발 든 가족<br>아이콘이 생겨서 앱처럼 바로 열려요.</p>
          <div class="webapp-note">
            <p class="webapp-h">💡 웹앱이 뭐예요? 다운로드 아니에요!</p>
            <p>이 웹사이트를<br><b>홈 화면에 바로가기로 추가</b>하는 거예요.<br>컴퓨터 바탕화면 바로가기와 같아요.</p>
            <ul>
              <li>앱스토어에서 받지 않아요</li>
              <li>용량도 거의 차지하지 않아요</li>
              <li>필요 없으면 아이콘만 지우면 끝이에요</li>
            </ul>
          </div>
          <button type="button" class="g-install" hidden>📲 지금 설치하기</button>
          <p><b>🤖 안드로이드 (크롬)</b></p>
          <ol>
            <li>크롬으로 이 사이트를 열어요.</li>
            <li>오른쪽 위 <b>⋮ (점 세 개)</b>를 눌러요.</li>
            <li><b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 눌러요.</li>
            <li><b>설치</b>를 누르면 끝! 홈 화면에 공동육아 SOS 아이콘이 생겨요.</li>
          </ol>
          <p><b>🍎 아이폰 (사파리)</b></p>
          <ol>
            <li><b>사파리</b>로 이 사이트를 열어요.</li>
            <li>아래쪽 가운데 <b>공유 버튼 (⬆︎ 네모에 화살표)</b>을 눌러요.</li>
            <li>목록을 아래로 내려 <b>홈 화면에 추가</b>를 눌러요.</li>
            <li>오른쪽 위 <b>추가</b>를 누르면 끝! 홈 화면에 공동육아 SOS 아이콘이 생겨요.</li>
          </ol>
          <p>아이폰은 설치한 앱을 처음 열 때 방을 한 번 더 물어봐요. <b>시작하기</b>를 누르고 <b>🔗 초대 링크를 받았어요</b>에 링크를 붙여넣고 비밀번호를 넣어 주세요.</p>
          <p>카카오톡에서 링크를 누르면 안드로이드는 크롬, 아이폰은 사파리로 자동으로 열려요.</p>
        </details>
        <a class="g-link g-safety" href="safety.html">🔒 무엇을 저장하나요? 개인정보 안내 보기</a>
        <a class="g-link g-safety" href="terms.html">📜 이용약관 · 이용 규칙 보기</a>
      </div>`;
const GATE_PASTE = `      <div class="g-extra">
        <details class="how-to g-paste">
          <summary>🔗 초대 링크를 받았어요</summary>
          <p>단톡방의 <b>초대 글을 통째로</b> 복사해서 붙여넣어도 돼요.<br>링크만 알아서 골라 바로 그 방으로 가요.<br>(아이폰에서 홈 화면 앱으로 처음 열었을 때도 여기서 들어가요)</p>
          <input id="gateLink" aria-label="초대 링크" placeholder="초대 글이나 링크 붙여넣기" autocomplete="off">
          <button type="button" class="g-go">이 방으로 가기</button>
        </details>
      </div>`;

// 안드로이드 크롬이 "바로 설치할 수 있어요" 신호를 주면 입장 화면의 '지금 설치하기' 버튼을 보여 줘요
let gateInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  gateInstall = e;
  const b = document.querySelector('#gate .g-install'); if(b) b.hidden = false;
});

// 초대 링크(또는 방 코드만)에서 방 코드를 꺼내요. 카톡 초대 글을 통째로 붙여넣어도 링크만 골라내요
function inviteCode(text){
  const t = String(text || '').trim();
  const m = /[?&]r=([a-z0-9]{6,20})/i.exec(t) || /^([a-z0-9]{6,20})$/i.exec(t);
  return m ? m[1].toLowerCase() : null;
}
// 방 코드 + (있으면) 방 이름·초대한 사람 i= 까지 → 이동할 주소
function inviteHref(text){
  const t = String(text || ''), code = inviteCode(t); if(!code) return null;
  const i = /[?&]i=([A-Za-z0-9_-]{4,400})/.exec(t);
  return 'index.html?r=' + code + (i ? '&i=' + i[1] : '');
}

// 방 고르기 화면: 초대 링크로 왔으면 비밀번호, 아니면 방 만들기 (+ 이 기기에 기억된 방 목록)
function showRooms(closable){
  gateCss();
  if(document.getElementById('gate')) return;
  const pick = closable === 'pick';
  const rooms = sosRooms(), invite = INVITE && !ROOM;
  const bells = typeof pushBell === 'function' && !!PUSH_VAPID;   // 🔔 방별 알림 (push.js 있는 화면에서만)
  const box = document.createElement('div'); box.id = 'gate'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '모임 방');
  const list = rooms.length && !invite ? `<div class="g-listbox"><p class="g-list-h">${pick ? '🏠 어느 방으로 갈까요?' : '🏠 내 방 목록'} <small>눌러서 이동</small></p><div class="g-rooms">` +
    rooms.map(r => `<div class="g-row"><button type="button" class="g-room" data-room="${r.roomId}"${ROOM && r.roomId === ROOM.roomId ? ' aria-current="true"' : ''}><span class="g-rname"></span>${ROOM && r.roomId === ROOM.roomId ? '<span class="g-now">지금 방</span>' : ''}<span class="g-chips"></span><span class="g-go-arrow" aria-hidden="true">›</span></button>${bells ? pushBell(r.roomId) : ''}</div>`).join('') + '</div></div>' : '';
  const formHtml = `
${closable || invite ? '' : GATE_HOW_CREATE}
      ${list}
      <div class="g-box">
      ${invite ? `<p class="g-box-h">🔑 초대받은 모임 방이에요</p>
      ${INVITE_INFO.name ? '<div class="g-inv"><p class="g-inv-name"></p>' + (INVITE_INFO.by ? '<p class="g-inv-by">👑 <b></b> 님이 초대했어요</p>' : '') + '</div>' : ''}
      <p>단톡방 공지의 비밀번호를 넣어 주세요.<br>한 번 들어오면 다음부터 바로 열려요.</p>
      <input type="password" id="gatePw" aria-label="입장 비밀번호" placeholder="비밀번호" maxlength="40">
      <input id="gateNick" aria-label="닉네임" placeholder="닉네임 (예: 윤하아빠/2단지)" maxlength="${NICK_MAX}" autocomplete="off">
      <button type="submit">들어가기</button>`
      : `<p class="g-box-h">🏠 새 모임 방 만들기</p>
      <p>방을 만들고 초대 링크를 단톡방에 올리면 끝!</p>
      <input id="gateName" aria-label="방 이름" placeholder="방 이름 (예: 래미안 3단지 공동육아)" maxlength="30">
      <input type="password" id="gatePw" aria-label="방 비밀번호" placeholder="비밀번호 (4자 이상)" maxlength="40">
      <input id="gateNick" aria-label="내 닉네임" placeholder="내 닉네임 (예: 윤하아빠/2단지)" maxlength="${NICK_MAX}" autocomplete="off">
      <button type="submit">방 만들기</button>`}
      <p class="g-msg" id="gateMsg" aria-live="polite"></p>
      </div>
${invite && !closable ? GATE_HOW_INVITE : ''}`;
  // 처음 열 때: ① 앱 소개(이야기 · 설치 안내 · 개인정보) → [시작하기] → ② 비밀번호 / 방 만들기
  box.innerHTML = (pick || (closable && rooms.length)) ? `<form class="g-card" autocomplete="off">
      <button type="button" class="g-close" aria-label="닫기">✕</button>
      <img class="g-icon" src="assets/icon.svg" alt="" width="72" height="72">
      <h1>공동육아 SOS 🆘<button type="button" class="g-demo" aria-label="베타 버전 안내">베타</button></h1>
      ${list}
      <p class="g-legend">🆘 = 1주일 안에 SOS 보낸 사람 · 🙌 = 다가오는 모임${bells ? '<br>🔔 = 알림 켜짐 · 🔕 = 꺼짐 (눌러서 방마다 켜고 끄기)' : ''}</p>
      <details class="how-to g-more"><summary>＋ 새 방 만들기 · 🔗 초대 링크</summary>
${formHtml.replace(list, '')}
${GATE_PASTE}
      </details>
      ${bells ? `<div class="g-pushhelp">${pushHelp()}</div>` : ''}
    </form>` : closable ? `<form class="g-card" autocomplete="off">
      <button type="button" class="g-close" aria-label="닫기">✕</button>
      <img class="g-icon" src="assets/icon.svg" alt="" width="72" height="72">
      <h1>공동육아 SOS 🆘<button type="button" class="g-demo" aria-label="베타 버전 안내">베타</button></h1>
${formHtml}
${GATE_PASTE}
    </form>` : `<div class="g-card g-step1"${invite ? ' hidden' : ''}>
      <button type="button" class="g-share">📤 앱 공유</button>
      <img class="g-icon" src="assets/icon.svg" alt="" width="72" height="72">
      <h1>공동육아 SOS 🆘<button type="button" class="g-demo" aria-label="베타 버전 안내">베타</button></h1>
${GATE_STORY}
      <button type="button" class="g-start">시작하기</button>
      <a class="g-howto" href="guide.html">📖 그림으로 보는 사용법 <small>(17장)</small></a>
${GATE_EXTRA}
    </div>
    <form class="g-card g-step2" autocomplete="off"${invite ? '' : ' hidden'}>
      <img class="g-icon" src="assets/icon.svg" alt="" width="72" height="72">
      <h1>공동육아 SOS 🆘<button type="button" class="g-demo" aria-label="베타 버전 안내">베타</button></h1>
${formHtml}
${invite ? '' : GATE_PASTE}
      <button type="button" class="g-back">← 앱 소개 다시 보기</button>
    </form>`;
  box.querySelectorAll('[data-room]').forEach(b => {
    const room = rooms.find(r => r.roomId === b.dataset.room);
    b.querySelector('.g-rname').textContent = room.name;   // 방 이름은 글자로만
    roomCounts(room).then(c => {
      const chips = b.querySelector('.g-chips');
      if(!c) return;
      if(c.gone){ chips.innerHTML = '<span class="g-chip gone">지워진 방</span>'; forgetRoom(room.roomId); b.disabled = true; if(typeof pushDropRoom === 'function') pushDropRoom(room).catch(() => {}); return; }
      chips.innerHTML = (c.sos ? `<span class="g-chip sos">🆘 ${c.sos}</span>` : '') + (c.meet ? `<span class="g-chip meet">🙌 ${c.meet}</span>` : '')
        || '<span class="g-chip quiet">조용해요</span>';
    });
  });
  const msg = t => { box.querySelector('#gateMsg').textContent = t; };
  const ni = box.querySelector('#gateNick'); if(ni) ni.value = lastNick();
  // 붙여넣으면 링크를 찾아 바로 그 방으로 가요 (키보드의 클립보드 칩으로 넣어도 input 이벤트로 잡아요)
  //  엔터(이동 키)를 누르면 '방 만들기'가 아니라 '이 방으로 가기'예요
  const gl = box.querySelector('#gateLink');
  if(gl){
    const jump = () => { const href = inviteHref(gl.value); if(href) location.href = href; };
    gl.addEventListener('paste', () => setTimeout(jump, 50));
    gl.addEventListener('input', () => { if(/[?&]r=/.test(gl.value)) jump(); });
    gl.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); box.querySelector('.g-go').click(); } });
  }
  const iv = box.querySelector('.g-inv');   // 방 이름·초대한 사람은 글자로만
  if(iv){ iv.querySelector('.g-inv-name').textContent = '🏠 ' + INVITE_INFO.name; const by = iv.querySelector('.g-inv-by b'); if(by) by.textContent = INVITE_INFO.by; }
  if(gateInstall && box.querySelector('.g-install')) box.querySelector('.g-install').hidden = false;
  const enter = room => { rememberRoom(room); markPicked(); location.href = 'index.html'; };
  box.addEventListener('click', async e => {
    const step = n => { box.querySelector('.g-step1').hidden = n !== 1; box.querySelector('.g-step2').hidden = n !== 2; box.scrollTop = 0; };
    if(e.target.closest('.g-start')){ step(2); return; }
    if(e.target.closest('.g-back')){ step(1); return; }
    if(e.target.closest('.g-go')){
      const href = inviteHref(box.querySelector('#gateLink').value);
      if(!href){ msg('초대 링크를 찾지 못했어요. 카톡 초대 글을 통째로 붙여넣어도 돼요.'); return; }
      location.href = href; return;
    }
    if(e.target.closest('.g-install') && gateInstall){
      gateInstall.prompt(); await gateInstall.userChoice.catch(() => {}); gateInstall = null; e.target.closest('.g-install').hidden = true; return;
    }
    const r = e.target.closest('[data-room]');
    if(r){ enter(rooms.find(x => x.roomId === r.dataset.room)); return; }
    if(closable && (e.target === box || e.target.closest('.g-close'))){ markPicked(); box.remove(); }
  });
  box.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = box.querySelector('#gatePw').value, btn = box.querySelector('button[type=submit]');
    const nick = box.querySelector('#gateNick').value.trim();
    const db = sosDb(); if(!db){ msg('인터넷 연결을 확인하고 새로고침해 주세요.'); return; }
    btn.disabled = true;
    try{
      if(invite){
        const key = await roomKey(INVITE, pw), snap = await db.collection('rooms').doc(key).get();
        if(roomGone(snap)){ msg('비밀번호가 맞지 않거나, 방장이 지운 방이에요.'); box.querySelector('#gatePw').select(); return; }
        if(!nick){ msg('닉네임을 적어 주세요. 방 사람들에게 보여요.'); box.querySelector('#gateNick').focus(); return; }
        enter({roomId: INVITE, key, name: snap.data().name, nick});
      }else{
        const name = box.querySelector('#gateName').value.trim();
        if(!name){ msg('방 이름을 적어 주세요.'); return; }
        if(pw.trim().length < 4){ msg('비밀번호는 4자 이상으로 해 주세요.'); return; }
        if(!nick){ msg('내 닉네임을 적어 주세요. 방 사람들에게 보여요.'); box.querySelector('#gateNick').focus(); return; }
        const user = await sosAuth();
        if(!user){ msg('로그인 준비가 안 됐어요. 잠시 뒤 다시 눌러 주세요.'); return; }
        const roomId = newRoomId(), key = await roomKey(roomId, pw);
        const owner = randomHex();   // 방장 열쇠: 이 휴대폰에만 두고, 서버에는 지문만
        await db.collection('rooms').doc(key).set({name, oh: await sha256Hex(owner), ou: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
        // 방장을 바로 멤버로 넣어요 (홈으로 넘어가기 전에 닫아도 '멤버 없는 빈 방'이 남지 않게)
        try{ await db.collection('rooms').doc(key).collection('members').doc(user.uid).set({nick: nick.slice(0, NICK_MAX), on: true, joinedAt: firebase.firestore.FieldValue.serverTimestamp()}); }catch(e){}
        enter({roomId, key, name, owner, nick});
      }
    }catch(err){ msg(roomError(err)); }
    finally{ btn.disabled = false; }
  });
  document.body.appendChild(box);
}

// 방마다 1주일 안의 SOS 요청 수와 다가오는 모임 수를 세요 (방 목록 옆 표시용). 못 세면 null
function ymdAfter(n){ const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
async function roomCounts(room){
  const db = sosDb(); if(!db) return null;
  try{
    const r = db.collection('rooms').doc(room.key);
    if(roomGone(await r.get())) return {gone: true};
    if(!(await sosAuth())) return null;
    const id = firebase.firestore.FieldPath.documentId(), today = ymdAfter(0);
    const [sos, ops] = await Promise.all([
      r.collection('sos').where(id, '>=', today).where(id, '<=', ymdAfter(6)).get(),
      r.collection('opinions').where('date', '>=', today).limit(50).get()]);
    // 1주일 동안 SOS를 보낸 '사람 수' (여러 날·여러 시간을 골라도 1명). 닉네임 없는 예전 기록은 날마다 가장 큰 값
    const people = new Set(); let old = 0;
    sos.forEach(d => { const v = d.data(); Object.entries(v.p || {}).forEach(([uid, e]) => { if((e.h || []).length) people.add(uid); });
      old = Math.max(old, sosDayTotal({...v, p: {}})); });
    const n = people.size + old;
    return {sos: n, meet: ops.docs.filter(d => { const o = d.data(); return o.topic === 'meet' && !o.cancelled; }).length};
  }catch(e){ return null; }   // 아직 멤버가 아닌 방(닉네임 정하기 전)은 못 세요
}
// SOS 날짜 문서 v 의 숫자: 예전 숫자 칸(h9 등) + 닉네임 예약(p: {uid: {h:[시간], n}})
function sosHourCount(v, h){ return v ? (v['h' + h] || 0) + Object.values(v.p || {}).filter(e => (e.h || []).includes(+h)).length : 0; }
function sosHourNames(v, h){ return v ? Object.values(v.p || {}).filter(e => (e.h || []).includes(+h)).map(e => e.n) : []; }
// 그 날 SOS를 보낸 '사람 수' (한 사람이 여러 시간을 골라도 1명). 닉네임 없는 예전 기록은 시간별 숫자 중 가장 큰 값으로 세요
function sosDayTotal(v){
  if(!v) return 0;
  const old = Math.max(0, ...Object.keys(v).filter(k => /^h\d+$/.test(k)).map(k => v[k] || 0)) + (v.count || 0);
  return Object.values(v.p || {}).filter(e => (e.h || []).length).length + old;
}

// 앱을 열 때 첫 화면은 '내 방 목록'이에요
//  - 홈 화면 아이콘으로 열면(시작 주소 index.html?pick=1) 항상 목록부터
//  - 브라우저로 열어도 새로 열 때(세션당 1번)는 목록부터. 앱 안에서 홈으로 돌아올 땐 다시 묻지 않아요
function markPicked(){ try{ sessionStorage.setItem('sosPicked', '1'); }catch(e){} }
(function pickOnOpen(){
  const q = new URLSearchParams(location.search), forced = q.has('pick');
  if(forced){ q.delete('pick'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); }
  if(SOS_INAPP || !ROOM || INVITE || !sosRooms().length) return;
  if(!/(^|\/)(index\.html)?$/.test(location.pathname)) return;   // 홈에서만
  if(!forced){ try{ if(sessionStorage.getItem('sosPicked')) return; }catch(e){ return; } }
  const go = () => showRooms('pick');
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();

(function gate(){
  if(SOS_INAPP || ROOM || document.documentElement.hasAttribute('data-public')) return;
  document.documentElement.classList.add('gate-locked');
  if(document.body) showRooms(false); else document.addEventListener('DOMContentLoaded', () => showRooms(false));
})();

// 📲 앱 안 브라우저 → 크롬(안드로이드) / 사파리(아이폰)로 넘기기. 자동으로 한 번 시도하고, 안 되면 버튼으로
function sosEscapeTarget(){
  // 이미 방이 있는 사람은 그 방 초대 링크로 넘겨요 (크롬·사파리에서 방 이름이 보이고 비밀번호만 넣으면 돼요)
  let url = location.href;
  if(ROOM){ try{ url = inviteUrl(); }catch(e){} }   // (주소창의 ?r= 은 이미 지워졌을 수 있어서 초대 링크를 새로 만들어요)
  return url;
}
function sosEscapeLinks(url){
  const u = new URL(url);
  return {
    chrome: `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=https;package=com.android.chrome;end`,
    safari: 'x-safari-' + url,
    kakaoOut: 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url)
  };
}
const sosGo = u => (window.__sosGo || (x => { location.href = x; }))(u);
function sosEscapeInApp(){
  const url = sosEscapeTarget(), L = sosEscapeLinks(url);
  const main = SOS_IOS ? L.safari : L.chrome, name = SOS_IOS ? '사파리' : '크롬';
  const ro = SOS_IOS ? '사파리로' : '크롬으로', ga = SOS_IOS ? '사파리가' : '크롬이';
  const css = document.createElement('style');
  css.textContent = `
    html.sos-inapp body > *:not(#inappEsc){display:none!important}
    #inappEsc{position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--page,#f3f5f2);font-family:inherit;word-break:keep-all}
    #inappEsc .ie{width:min(300px,100%);text-align:center}
    #inappEsc img{width:64px;height:64px;border-radius:16px}
    #inappEsc h1{margin:12px 0 6px;font-size:19px;color:var(--fg,#22282a);white-space:nowrap}
    #inappEsc p{margin:0;font-size:14px;line-height:1.6;color:var(--muted,#736e75);white-space:nowrap}
    #inappEsc .ie-go{display:block;width:100%;margin-top:18px;padding:14px;border:0;border-radius:14px;background:var(--pick,#2a9095);color:var(--pick-fg,#fff);font:inherit;font-size:16px;font-weight:800;cursor:pointer}
    #inappEsc .ie-sub{display:block;width:100%;margin-top:8px;padding:10px;border:1px solid var(--line,#e3e3e5);border-radius:12px;background:transparent;color:var(--fg,#22282a);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer}
    #inappEsc .ie-stay{margin-top:14px;background:none;border:0;color:var(--muted,#736e75);font:inherit;font-size:12.5px;text-decoration:underline;cursor:pointer}
    #inappEsc .ie-msg{min-height:1.4em;margin-top:8px;font-size:12.5px;color:var(--accent-ink,#1c7276)}`;
  document.head.appendChild(css);
  document.documentElement.classList.add('sos-inapp');
  const box = document.createElement('div'); box.id = 'inappEsc'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', name + '에서 열기');
  box.innerHTML = `<div class="ie">
      <img src="assets/icon.svg" alt="" width="64" height="64">
      <h1>📲 ${name}에서 열어 주세요</h1>
      <p>카톡 안에서는</p><p>앱 설치·알림이 안 돼요.</p>
      <button type="button" class="ie-go">${ro} 열기</button>
      ${SOS_KAKAO ? '<button type="button" class="ie-sub" data-out>다른 브라우저로 열기</button>' : ''}
      <button type="button" class="ie-sub" data-copy>주소 복사하기</button>
      <p class="ie-msg" aria-live="polite"></p>
      ${ROOM ? '<button type="button" class="ie-stay">이번만 카톡 안에서 계속하기</button>' : ''}
    </div>`;
  const msg = t => { box.querySelector('.ie-msg').textContent = t; };
  box.addEventListener('click', async e => {
    if(e.target.closest('.ie-go')){ sosGo(main); msg(`${ga} 열리면 이 창은 닫아도 돼요.`); return; }
    if(e.target.closest('[data-out]')){ sosGo(L.kakaoOut); return; }
    if(e.target.closest('[data-copy]')){
      try{ await navigator.clipboard.writeText(url); msg(`복사했어요. ${name} 주소창에 붙여넣어 주세요.`); }
      catch(err){ prompt('이 주소를 복사해 주세요', url); }
      return;
    }
    if(e.target.closest('.ie-stay')){ document.documentElement.classList.remove('sos-inapp'); box.remove(); }
  });
  document.body.appendChild(box);
  // 처음 한 번은 자동으로 넘겨 봐요 (아이폰은 '사파리에서 열까요?'를 한 번 물을 수 있어요)
  let tried = false; try{ tried = !!sessionStorage.getItem('sosEscTried'); sessionStorage.setItem('sosEscTried', '1'); }catch(e){}
  if(!tried) setTimeout(() => sosGo(SOS_KAKAO && SOS_IOS ? L.kakaoOut : main), 300);
}
if(SOS_INAPP){ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sosEscapeInApp); else sosEscapeInApp(); }
