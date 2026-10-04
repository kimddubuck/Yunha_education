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

// 방 지우기 (방을 만든 휴대폰만)
//  1) 방이 살아 있을 때 방 안의 기록(모임·댓글·SOS·놀이) 위치를 모두 모아 두고
//  2) 방장 열쇠(owner)를 보내 '지워짐' 표시 + 방 이름 비우기 (서버의 지문 oh 와 맞아야 함)
//  3) 모아 둔 기록을 서버에서 실제로 지워요 (서버 규칙: 지워진 방의 기록만 지울 수 있음)
//  예전에 열쇠 없이 만든 방은 들어온 사람 누구나 지울 수 있어요.
async function deleteRoom(){
  const db = sosDb(); if(!db || !ROOM) throw new Error('offline');
  const room = db.collection('rooms').doc(ROOM.key), refs = [];
  const ops = await room.collection('opinions').get();
  for(const d of ops.docs){
    refs.push(d.ref);
    (await d.ref.collection('comments').get()).docs.forEach(c => refs.push(c.ref));
  }
  for(const name of ['sos', 'plays']) (await room.collection(name).get()).docs.forEach(d => refs.push(d.ref));
  await room.update({deleted: true, name: '', k: ROOM.owner || ''});
  forgetRoom(ROOM.roomId);
  for(let i = 0; i < refs.length; i += 400){
    const batch = db.batch(); refs.slice(i, i + 400).forEach(r => batch.delete(r)); await batch.commit();
  }
}

// 들어와 있는 방이 지워졌으면 이 휴대폰에서도 빼고 알려 줘요
window.addEventListener('load', async () => {
  const db = sosDb(); if(!db || !ROOM) return;
  const checked = 'sosChecked:' + ROOM.roomId;   // 브라우저를 새로 열 때 한 번만 확인해요 (읽기 횟수 절약)
  try{ if(sessionStorage.getItem(checked)) return; sessionStorage.setItem(checked, '1'); }catch(e){}
  try{
    const snap = await db.collection('rooms').doc(ROOM.key).get();
    if(roomGone(snap)){ forgetRoom(ROOM.roomId); alert(`'${ROOM.name}' 방은 방장이 지웠어요.`); location.href = 'index.html'; }
  }catch(e){ /* 인터넷 문제: 그냥 둬요 */ }
});

function inviteUrl(){ return location.href.split(/[?#]/)[0].replace(/[^/]*$/, '') + 'index.html?r=' + ROOM.roomId; }
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
    #gate .g-extra{text-align:left;display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line,#e3e3e5);padding-top:14px}
    #gate .g-extra details p, #gate .g-extra ol, #gate .g-extra ul{font-size:13.5px;line-height:1.6;margin:6px 0}
    #gate .g-extra input{width:100%;box-sizing:border-box;margin:6px 0}
    #gate .g-extra .g-go, #gate .g-extra .g-install{width:100%}
    #gate .g-guide{text-align:left;padding:14px 12px;border-radius:14px;background:var(--tag,#efefef)}
    #gate .g-guide p, #gate .g-guide ol{font-size:13.5px;line-height:1.65;color:var(--fg,#22282a);margin:0 0 6px}
    #gate .g-guide ol{padding-left:20px}
    #gate .g-guide li{margin:3px 0}
    #gate .g-guide-h{font-weight:700;font-size:15px!important}
    #gate .g-guide-tip{color:var(--muted,#736e75)!important;font-size:12.5px!important;margin:6px 0 0!important}
    #gate .g-safety{text-align:center;margin-top:4px}
    #gate .g-card[hidden]{display:none}
    #gate .g-back{background:transparent!important;color:var(--accent-ink,#1c7276)!important;font-weight:600}
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

// 비밀번호 화면의 사용 방법: 이미 쓰는 모임 앱(단톡방·밴드 등) 옆에 붙여 쓰는 도구라는 것
const GATE_HOW_CREATE = `      <div class="g-guide">
        <p class="g-guide-h">📖 이렇게 써요</p>
        <p>우리 모임이 있는 곳은 그대로 두세요.<br><b>카카오톡 오픈채팅 · 네이버 밴드</b><br><b>당근 모임 · 소모임</b> 등 어디든 괜찮아요.<br>이 앱은 그 모임에서 <b>공동육아 모임을<br>쉽게 추진할 수 있게 돕는 도구</b>라고 생각하면 돼요.</p>
        <ol>
          <li>여기서 <b>방 이름과 비밀번호</b>를 정해 방을 만들어요.</li>
          <li>홈의 <b>🔗 친구 초대하기</b>를 눌러 나온 링크를<br>단톡방·밴드 공지에 올리고, <b>비밀번호도 알려 주세요.</b></li>
          <li>독박 예정인 날엔 <b>🆘 SOS 예약</b>만 꾹 (누가 눌렀는지 몰라요)</li>
          <li>SOS가 몰린 시간을 보고, 용기 낸 한 명이 <b>🙌 모임</b>을 열어요.</li>
        </ol>
        <p class="g-guide-tip">💡 비밀번호는 1234처럼 쉬운 것보다 우리끼리 아는 말로 정해 주세요.<br>비밀번호를 잊으면 되찾을 수 없어요.</p>
      </div>`;
const GATE_HOW_INVITE = `      <div class="g-guide">
        <p class="g-guide-h">📖 들어오면 이렇게 써요</p>
        <ol>
          <li>독박 예정인 날엔 <b>🆘 SOS 예약</b>만 꾹 (누가 눌렀는지 몰라요)</li>
          <li>SOS가 몰린 시간을 보고, 용기 낸 한 명이 <b>🙌 모임</b>을 열어요.</li>
          <li>모임 이야기는 원래 쓰던 단톡방·밴드에서 편하게 해요.</li>
        </ol>
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
          <p><b>🍎 아이폰 (크롬 · 사파리)</b></p>
          <ol>
            <li><b>크롬</b>: 주소창 오른쪽의 <b>공유 버튼 (⬆︎ 네모에 화살표)</b>을 눌러요.<br><b>사파리</b>: 아래쪽 가운데 <b>공유 버튼</b>을 눌러요.</li>
            <li>목록을 아래로 내려 <b>홈 화면에 추가</b>를 눌러요.</li>
            <li>오른쪽 위 <b>추가</b>를 누르면 끝! 홈 화면에 공동육아 SOS 아이콘이 생겨요.</li>
          </ol>
          <p>아이폰은 설치한 앱을 처음 열 때 방을 한 번 더 물어봐요. <b>시작하기</b>를 누르고 <b>🔗 초대 링크를 받았어요</b>에 링크를 붙여넣고 비밀번호를 넣어 주세요.</p>
          <p>카카오톡에서 링크를 열었다면, 오른쪽 위 메뉴에서 <b>다른 브라우저로 열기</b>를 먼저 눌러 주세요.</p>
        </details>
        <a class="g-link g-safety" href="safety.html">🔒 무엇을 저장하나요? 개인정보 안내 보기</a>
      </div>`;
const GATE_PASTE = `      <div class="g-extra">
        <details class="how-to">
          <summary>🔗 초대 링크를 받았어요</summary>
          <p>단톡방에서 받은 초대 링크를 길게 눌러 복사한 뒤 여기에 붙여넣어 주세요.<br>(아이폰에서 홈 화면 앱으로 처음 열었을 때도 여기서 들어가요)</p>
          <input id="gateLink" aria-label="초대 링크" placeholder="초대 링크 붙여넣기" autocomplete="off">
          <button type="button" class="g-go">이 방으로 가기</button>
        </details>
      </div>`;

// 안드로이드 크롬이 "바로 설치할 수 있어요" 신호를 주면 입장 화면의 '지금 설치하기' 버튼을 보여 줘요
let gateInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  gateInstall = e;
  const b = document.querySelector('#gate .g-install'); if(b) b.hidden = false;
});

// 초대 링크(또는 방 코드만)에서 방 코드를 꺼내요
function inviteCode(text){
  const t = String(text || '').trim();
  const m = /[?&]r=([a-z0-9]{6,20})/i.exec(t) || /^([a-z0-9]{6,20})$/i.exec(t);
  return m ? m[1].toLowerCase() : null;
}

// 방 고르기 화면: 초대 링크로 왔으면 비밀번호, 아니면 방 만들기 (+ 이 기기에 기억된 방 목록)
function showRooms(closable){
  gateCss();
  if(document.getElementById('gate')) return;
  const rooms = sosRooms(), invite = INVITE && !ROOM;
  const box = document.createElement('div'); box.id = 'gate'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '모임 방');
  const list = rooms.length && !invite ? `<p class="g-pw">🏠 이 휴대폰에 기억된 방</p><div class="g-rooms">` +
    rooms.map(r => `<button type="button" class="g-room" data-room="${r.roomId}"${ROOM && r.roomId === ROOM.roomId ? ' aria-current="true"' : ''}></button>`).join('') + '</div>' : '';
  const formHtml = `
${closable ? '' : (invite ? GATE_HOW_INVITE : GATE_HOW_CREATE)}
      ${list}
      ${invite ? `<p class="g-pw">🔑 초대받은 모임 방이에요.<br>단톡방 공지의 비밀번호를 넣어 주세요.<br>한 번 들어오면 다음부터 바로 열려요.</p>
      <input type="password" id="gatePw" aria-label="입장 비밀번호" placeholder="비밀번호" maxlength="40">
      <button type="submit">들어가기</button>`
      : `<p class="g-pw">🏠 <b>새 모임 방 만들기</b><br>방을 만들고 초대 링크를 단톡방에 올리면 끝!</p>
      <input id="gateName" aria-label="방 이름" placeholder="방 이름 (예: 래미안 3단지 공동육아)" maxlength="30">
      <input type="password" id="gatePw" aria-label="방 비밀번호" placeholder="비밀번호 (4자 이상)" maxlength="40">
      <button type="submit">방 만들기</button>`}
      <p class="g-msg" id="gateMsg" aria-live="polite"></p>`;
  // 처음 열 때: ① 앱 소개(이야기 · 설치 안내 · 개인정보) → [시작하기] → ② 비밀번호 / 방 만들기
  box.innerHTML = closable ? `<form class="g-card" autocomplete="off">
      <button type="button" class="g-close" aria-label="닫기">✕</button>
      <img class="g-icon" src="assets/icon.svg" alt="" width="72" height="72">
      <h1>공동육아 SOS 🆘</h1>
${formHtml}
    </form>` : `<div class="g-card g-step1">
      <img class="g-icon" src="assets/icon.svg" alt="" width="72" height="72">
      <h1>공동육아 SOS 🆘</h1>
${GATE_STORY}
      <button type="button" class="g-start">시작하기</button>
${GATE_EXTRA}
    </div>
    <form class="g-card g-step2" autocomplete="off" hidden>
      <img class="g-icon" src="assets/icon.svg" alt="" width="72" height="72">
      <h1>공동육아 SOS 🆘</h1>
${formHtml}
${invite ? '' : GATE_PASTE}
      <button type="button" class="g-back">← 앱 소개 다시 보기</button>
    </form>`;
  box.querySelectorAll('[data-room]').forEach(b => { b.textContent = rooms.find(r => r.roomId === b.dataset.room).name; });   // 방 이름은 글자로만
  const msg = t => { box.querySelector('#gateMsg').textContent = t; };
  if(gateInstall && box.querySelector('.g-install')) box.querySelector('.g-install').hidden = false;
  const enter = room => { rememberRoom(room); location.href = 'index.html'; };
  box.addEventListener('click', async e => {
    const step = n => { box.querySelector('.g-step1').hidden = n !== 1; box.querySelector('.g-step2').hidden = n !== 2; box.scrollTop = 0; };
    if(e.target.closest('.g-start')){ step(2); return; }
    if(e.target.closest('.g-back')){ step(1); return; }
    if(e.target.closest('.g-go')){
      const code = inviteCode(box.querySelector('#gateLink').value);
      if(!code){ msg('초대 링크를 확인해 주세요. 링크 전체를 붙여넣어 주세요.'); return; }
      location.href = 'index.html?r=' + code; return;
    }
    if(e.target.closest('.g-install') && gateInstall){
      gateInstall.prompt(); await gateInstall.userChoice.catch(() => {}); gateInstall = null; e.target.closest('.g-install').hidden = true; return;
    }
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
        if(roomGone(snap)){ msg('비밀번호가 맞지 않거나, 방장이 지운 방이에요.'); box.querySelector('#gatePw').select(); return; }
        enter({roomId: INVITE, key, name: snap.data().name});
      }else{
        const name = box.querySelector('#gateName').value.trim();
        if(!name){ msg('방 이름을 적어 주세요.'); return; }
        if(pw.trim().length < 4){ msg('비밀번호는 4자 이상으로 해 주세요.'); return; }
        const roomId = newRoomId(), key = await roomKey(roomId, pw);
        const owner = randomHex();   // 방장 열쇠: 이 휴대폰에만 두고, 서버에는 지문만
        await db.collection('rooms').doc(key).set({name, oh: await sha256Hex(owner), createdAt: firebase.firestore.FieldValue.serverTimestamp()});
        enter({roomId, key, name, owner});
      }
    }catch(err){ msg(roomError(err)); }
    finally{ btn.disabled = false; }
  });
  document.body.appendChild(box);
}

(function gate(){
  if(ROOM || document.documentElement.hasAttribute('data-public')) return;
  document.documentElement.classList.add('gate-locked');
  if(document.body) showRooms(false); else document.addEventListener('DOMContentLoaded', () => showRooms(false));
})();
