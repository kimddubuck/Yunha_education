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

// 이 기기에 기억된 방 목록 [{roomId, key, name}]
function sosRooms(){ try{ return JSON.parse(localStorage.getItem(ROOMS_KEY) || '[]'); }catch(e){ return []; } }
function rememberRoom(room){
  try{
    localStorage.setItem(ROOMS_KEY, JSON.stringify([room, ...sosRooms().filter(r => r.roomId !== room.roomId)].slice(0, 20)));
    localStorage.setItem(CUR_KEY, room.roomId);
  }catch(e){}
}
// 지금 들어와 있는 방. 초대 링크(?r=)로 왔는데 처음 보는 방이면 null (비밀번호를 물어요)
const INVITE = new URLSearchParams(location.search).get('r');
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
function inviteUrl(){ return location.href.split(/[?#]/)[0].replace(/[^/]*$/, '') + 'index.html?r=' + ROOM.roomId; }
function newRoomId(){
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';   // 헷갈리는 글자(0,o,1,l,i) 빼고
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), b => chars[b % chars.length]).join('');
}
function roomError(err){
  const c = (err && err.code) || '';
  if(c === 'unavailable') return '인터넷 연결을 확인해 주세요.';
  if(c === 'permission-denied') return '서버가 거절했어요. 잠시 뒤 다시 해 주세요.';
  return '문제가 생겼어요. 잠시 뒤 다시 해 주세요.';
}

// 첫 화면 이야기(이 앱을 만든 이유) + 3줄 사용법 — 입장 화면과 '소개 다시 보기'가 같이 써요
const GATE_STORY = `        <div class="g-story">
          <p class="g-q">"아… 오늘은 또 어떻게 버티지?"</p>
          <p class="g-sub">아기랑 하루 종일 붙어 있는데<br>시간만 흘러가는 것 같은 날.</p>
          <p>같이 육아하면 서로 의지도 되고<br>아이에게도 좋은 에너지를<br>줄 수 있을 것 같은데…</p>
          <p class="g-sub">단톡방에 "모임 해요!" 올리긴 쑥스럽고<br>아이 컨디션 때문에<br>약속을 못 지킬까 걱정되잖아요.</p>
          <p><b>그래서 만들었어요.</b><br>부담 없이, 되는 사람끼리, 되는 날에.<br>오늘도 으쌰으쌰 같이 이겨내요 💪</p>
        </div>
        <ul class="g-how">
          <li>🆘 <b>힘든 날</b>엔 이름 없이 SOS만 꾹</li>
          <li>👀 SOS가 <b>몰린 시간</b>은 모두가 봐요</li>
          <li>🙌 <b>용기 낸 한 명</b>이 모임을 열어요</li>
          <li>📲 다운로드 없이 <b>홈 화면 바로가기</b>로 앱처럼</li>
        </ul>`;

function gateCss(){
  if(document.getElementById('gateCss')) return;
  const css = document.createElement('style');
  css.textContent = `
    html.gate-locked body > *:not(#gate){display:none!important}
    #gate{position:fixed;inset:0;display:flex;justify-content:center;overflow-y:auto;padding:24px 16px;background:var(--page,#f3f5f2);z-index:100}
    #gate .g-card{width:100%;max-width:380px;margin:auto 0;padding:24px 16px!important;display:flex;flex-direction:column;gap:12px;background:var(--bg,#fff);border:1px solid var(--line,#e2e6e1);border-radius:20px;padding:28px 22px;box-shadow:0 2px 14px rgba(20,40,30,.08);text-align:center}
    #gate .g-icon{width:72px;height:72px;margin:0 auto;border-radius:18px;display:block}
    #gate h1{margin:0;font-size:22px}
    #gate p{margin:0;color:var(--muted,#6b7570);font-size:14px}
    #gate input{font:inherit;font-size:16px;padding:12px;border-radius:12px;border:1px solid var(--line,#e2e6e1);background:var(--bg,#fff);color:var(--fg,#1f2a24);text-align:center}
    #gate button{font:inherit;font-weight:700;font-size:15px;padding:12px;border-radius:12px;border:0;background:var(--pick,#2a9095);color:var(--pick-fg,#fff);cursor:pointer}
    #gate .g-msg{color:#c0392b;min-height:1.2em}
    #gate .g-story{text-align:left;display:flex;flex-direction:column;gap:10px;padding:14px 12px;border-radius:14px;background:var(--tag,#efefef)}
    #gate .g-story p{color:var(--fg,#22282a);font-size:14px;line-height:1.7}
    #gate .g-story .g-q{font-weight:700;font-size:16px}
    #gate .g-story .g-sub{color:var(--muted,#736e75)}
    #gate .g-how{text-align:left;margin:0;padding:0 4px;list-style:none;display:flex;flex-direction:column;gap:6px;font-size:14px;line-height:1.55}
    #gate .g-how b{color:var(--accent-ink,#1c7276)}
    #gate .g-close{position:absolute;top:10px;right:10px;width:36px;height:36px;padding:0!important;border-radius:50%!important;background:var(--tag,#efefef)!important;color:var(--fg,#22282a)!important;font-size:18px!important}
    #gate .g-card{position:relative}
    #gate .g-link{color:var(--accent-ink,#1c7276);font-size:14px;font-weight:600}
    #gate .g-rooms{display:flex;flex-direction:column;gap:6px}
    #gate .g-room{background:var(--tag,#efefef)!important;color:var(--fg,#22282a)!important;font-weight:600}
    #gate .g-room[aria-current]{outline:2px solid var(--pick,#2a9095)}
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
      <img class="g-icon" src="assets/icon.svg" alt="" width="72" height="72">
      <h1>공동육아 SOS 🆘</h1>
${GATE_STORY}
      <button type="button" class="g-ok">시작하기</button>
      <a class="g-link" href="index.html#install">📲 홈 화면에 설치하는 방법 보기</a>
    </div>`;
  const close = () => { box.remove(); document.removeEventListener('keydown', esc); };
  const esc = e => { if(e.key === 'Escape') close(); };
  box.addEventListener('click', e => { if(e.target === box || e.target.closest('.g-close, .g-ok, .g-link')) close(); });
  document.addEventListener('keydown', esc);
  document.body.appendChild(box);
  box.querySelector('.g-ok').focus();
}

// 방 고르기 화면: 초대 링크로 왔으면 비밀번호, 아니면 방 만들기 (+ 이 기기에 기억된 방 목록)
function showRooms(closable){
  gateCss();
  if(document.getElementById('gate')) return;
  const rooms = sosRooms(), invite = INVITE && !ROOM;
  const box = document.createElement('div'); box.id = 'gate'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '모임 방');
  const list = rooms.length && !invite ? `<p class="g-pw">🏠 이 휴대폰에 기억된 방</p><div class="g-rooms">` +
    rooms.map(r => `<button type="button" class="g-room" data-room="${r.roomId}"${ROOM && r.roomId === ROOM.roomId ? ' aria-current="true"' : ''}></button>`).join('') + '</div>' : '';
  box.innerHTML = `<form class="g-card" autocomplete="off">
      ${closable ? '<button type="button" class="g-close" aria-label="닫기">✕</button>' : ''}
      <img class="g-icon" src="assets/icon.svg" alt="" width="72" height="72">
      <h1>공동육아 SOS 🆘</h1>
${closable ? '' : GATE_STORY}
      ${list}
      ${invite ? `<p class="g-pw">🔑 초대받은 모임 방이에요.<br>단톡방 공지의 비밀번호를 넣어 주세요.<br>한 번 들어오면 다음부터 바로 열려요.</p>
      <input type="password" id="gatePw" aria-label="입장 비밀번호" placeholder="비밀번호" maxlength="40">
      <button type="submit">들어가기</button>`
      : `<p class="g-pw">🏠 <b>새 모임 방 만들기</b><br>방을 만들고 초대 링크를 단톡방에 올리면 끝!<br>초대 링크를 받았다면 그 링크로 열어 주세요.</p>
      <input id="gateName" aria-label="방 이름" placeholder="방 이름 (예: 래미안 3단지 공동육아)" maxlength="30">
      <input type="password" id="gatePw" aria-label="방 비밀번호" placeholder="비밀번호 (4자 이상)" maxlength="40">
      <button type="submit">방 만들기</button>`}
      <p class="g-msg" id="gateMsg" aria-live="polite"></p>
    </form>`;
  box.querySelectorAll('[data-room]').forEach(b => { b.textContent = rooms.find(r => r.roomId === b.dataset.room).name; });   // 방 이름은 글자로만
  const msg = t => { box.querySelector('#gateMsg').textContent = t; };
  const enter = room => { rememberRoom(room); location.href = 'index.html'; };
  box.addEventListener('click', e => {
    const r = e.target.closest('[data-room]');
    if(r){ enter(rooms.find(x => x.roomId === r.dataset.room)); return; }
    if(closable && (e.target === box || e.target.closest('.g-close'))) box.remove();
  });
  box.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = box.querySelector('#gatePw').value, btn = box.querySelector('button[type=submit]');
    const db = sosDb(); if(!db){ msg('인터넷 연결을 확인하고 새로고침해 주세요.'); return; }
    btn.disabled = true;
    try{
      if(invite){
        const key = await roomKey(INVITE, pw), snap = await db.collection('rooms').doc(key).get();
        if(!snap.exists){ msg('비밀번호가 맞지 않아요. 단톡방 공지를 확인해 주세요.'); box.querySelector('#gatePw').select(); return; }
        enter({roomId: INVITE, key, name: snap.data().name});
      }else{
        const name = box.querySelector('#gateName').value.trim();
        if(!name){ msg('방 이름을 적어 주세요.'); return; }
        if(pw.trim().length < 4){ msg('비밀번호는 4자 이상으로 해 주세요.'); return; }
        const roomId = newRoomId(), key = await roomKey(roomId, pw);
        await db.collection('rooms').doc(key).set({name, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
        enter({roomId, key, name});
      }
    }catch(err){ msg(roomError(err)); }
    finally{ btn.disabled = false; }
  });
  document.body.appendChild(box);
}

(function gate(){
  if(ROOM) return;
  document.documentElement.classList.add('gate-locked');
  if(document.body) showRooms(false); else document.addEventListener('DOMContentLoaded', () => showRooms(false));
})();
