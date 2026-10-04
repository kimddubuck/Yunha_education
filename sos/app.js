// 공동육아 SOS 달력 · 화면 동작
// 흐름: 첫 화면(방 만들기) → 초대 링크(#r=방코드) → 비밀번호 입력 → 달력

const $ = id => document.getElementById(id);
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const RECENT_KEY = 'sos.rooms';

let store;
const state = {
  room: null,        // { roomId, key, name, nick }
  month: null,       // 보고 있는 달의 1일 (Date)
  marks: [],         // 보고 있는 달의 표시들
  unwatch: null,
  sheetDate: null,   // 아래 창에 열린 날짜 'YYYY-MM-DD'
  formType: null,    // 'sos' | 'can'
  myUid: null
};

/* ---------- 작은 도구들 ---------- */

// 날짜를 'YYYY-MM-DD'로. toISOString()은 한국 시간에서 하루 밀릴 수 있어 직접 만들어요.
function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function prettyDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}월 ${d}일 (${DOW[date.getDay()]})`;
}
function makeRoomId() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // 헷갈리는 글자(0,o,1,l,i) 제외
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}
function el(tag, props, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props || {});
  children.flat().forEach(c => { if (c != null) node.append(c); });
  return node;
}
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function inviteUrl(roomId) {
  return location.href.split('#')[0] + '#r=' + roomId;
}

// 서버 오류를 사람이 알아들을 수 있는 말로 바꿔요.
function explain(err) {
  const code = (err && err.code) || '';
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    return '관리자 설정 필요: Firebase에서 "익명 로그인"을 켜 주세요.';
  }
  if (code === 'permission-denied') return '권한이 없어요. 방이 지워졌거나 서버 규칙이 설정되지 않았어요.';
  if (code === 'unavailable' || code === 'auth/network-request-failed') return '인터넷 연결을 확인해 주세요.';
  return '문제가 생겼어요: ' + (err && err.message ? err.message : String(err));
}

// 공유: 휴대폰이면 공유 창, 아니면 복사.
async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('복사했어요. 단톡방에 붙여넣으세요.');
  } catch (e) {
    window.prompt('아래 글을 복사해서 단톡방에 붙여넣으세요.', text);
  }
}

/* ---------- 최근 방 목록 (이 기기에만 저장) ---------- */

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; }
  catch (e) { return []; }
}
function saveRecent(list) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* 저장 불가 환경 */ }
}
function rememberRoom(room) {
  const list = loadRecent().filter(r => r.roomId !== room.roomId);
  list.unshift(room);
  saveRecent(list.slice(0, 20));
}
function forgetRoom(roomId) {
  saveRecent(loadRecent().filter(r => r.roomId !== roomId));
}

/* ---------- 화면 전환 ---------- */

function show(viewId) {
  ['viewHome', 'viewEnter', 'viewRoom'].forEach(id => $(id).classList.toggle('active', id === viewId));
}

function route() {
  closeSheet();
  if (state.unwatch) { state.unwatch(); state.unwatch = null; }
  state.room = null;

  const m = location.hash.match(/^#r=([a-z0-9]+)$/);
  if (!m) { renderHome(); show('viewHome'); return; }

  const roomId = m[1];
  const saved = loadRecent().find(r => r.roomId === roomId);
  if (saved) { openRoom(saved); return; }

  $('enterForm').reset();
  $('enterErr').textContent = '';
  const last = loadRecent()[0];
  if (last) $('enterNick').value = last.nick;
  show('viewEnter');
}

function renderHome() {
  const list = loadRecent();
  const ul = $('recentList');
  ul.replaceChildren();
  list.forEach(r => {
    const x = el('button', { className: 'x', type: 'button', title: '목록에서 빼기', textContent: '×' });
    x.addEventListener('click', () => {
      if (confirm(`"${r.name}"을(를) 이 기기 목록에서 뺄까요?\n(방은 지워지지 않고, 링크와 비밀번호로 다시 들어올 수 있어요.)`)) {
        forgetRoom(r.roomId);
        renderHome();
      }
    });
    ul.append(el('li', {}, el('a', { href: '#r=' + r.roomId, textContent: r.name }), x));
  });
  $('recentCard').hidden = list.length === 0;
}

/* ---------- 방 만들기 / 들어가기 ---------- */

$('createForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('createName').value.trim();
  const pw = $('createPw').value;
  const nick = $('createNick').value.trim();
  $('createErr').textContent = '';
  if (!name || !nick) { $('createErr').textContent = '방 이름과 닉네임을 넣어주세요.'; return; }
  if (pw.length < 4) { $('createErr').textContent = '비밀번호는 4자 이상으로 해주세요.'; return; }

  const btn = e.submitter; btn.disabled = true;
  try {
    const roomId = makeRoomId();
    const key = await makeRoomKey(roomId, pw);
    await store.createRoom(key, name);
    const room = { roomId, key, name, nick };
    rememberRoom(room);
    $('createForm').reset();
    location.hash = '#r=' + roomId;
    toast('방을 만들었어요. "초대하기"로 링크를 보내세요.');
  } catch (err) {
    $('createErr').textContent = explain(err);
  } finally {
    btn.disabled = false;
  }
});

$('enterForm').addEventListener('submit', async e => {
  e.preventDefault();
  const m = location.hash.match(/^#r=([a-z0-9]+)$/);
  if (!m) return;
  const roomId = m[1];
  const pw = $('enterPw').value;
  const nick = $('enterNick').value.trim();
  $('enterErr').textContent = '';
  if (!nick) { $('enterErr').textContent = '닉네임을 넣어주세요.'; return; }

  const btn = e.submitter; btn.disabled = true;
  try {
    const key = await makeRoomKey(roomId, pw);
    const name = await store.getRoomName(key);
    if (name == null) { $('enterErr').textContent = '비밀번호가 맞지 않거나, 없는 방이에요.'; return; }
    const room = { roomId, key, name, nick };
    rememberRoom(room);
    openRoom(room);
  } catch (err) {
    $('enterErr').textContent = explain(err);
  } finally {
    btn.disabled = false;
  }
});

/* ---------- 방 안: 달력 ---------- */

async function openRoom(room) {
  state.room = room;
  $('roomName').textContent = room.name;
  $('myNick').textContent = room.nick;
  const now = new Date();
  state.month = new Date(now.getFullYear(), now.getMonth(), 1);
  show('viewRoom');
  try { state.myUid = await store.uid(); } catch (err) { toast(explain(err)); }
  watchMonth();
}

function watchMonth() {
  if (state.unwatch) state.unwatch();
  const y = state.month.getFullYear(), mo = state.month.getMonth();
  const from = ymd(new Date(y, mo, 1));
  const to = ymd(new Date(y, mo + 1, 0));
  state.marks = [];
  renderCalendar();
  state.unwatch = store.watchMarks(state.room.key, from, to, marks => {
    state.marks = marks;
    renderCalendar();
    if (state.sheetDate) renderSheet();
  }, err => toast(explain(err)));
}

function renderCalendar() {
  const y = state.month.getFullYear(), mo = state.month.getMonth();
  $('monthLabel').textContent = `${y}년 ${mo + 1}월`;
  const today = ymd(new Date());
  const grid = $('calendar');
  grid.replaceChildren(...DOW.map((d, i) => el('div', { className: 'dow' + (i === 0 ? ' sun' : ''), textContent: d })));

  const firstDow = new Date(y, mo, 1).getDay();
  for (let i = 0; i < firstDow; i++) grid.append(el('div', { className: 'day blank' }));

  const last = new Date(y, mo + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const date = ymd(new Date(y, mo, d));
    const dayMarks = state.marks.filter(m => m.date === date);
    const sos = dayMarks.filter(m => m.type === 'sos').length;
    const can = dayMarks.filter(m => m.type === 'can').length;
    const cls = ['day'];
    if (date === today) cls.push('today');
    if (date < today) cls.push('past');
    if (sos) cls.push('has-sos');
    const cell = el('button', { type: 'button', className: cls.join(' ') },
      el('span', { className: 'n', textContent: d }),
      sos ? el('span', { className: 'badge sos', textContent: '🆘' + sos }) : null,
      can ? el('span', { className: 'badge can', textContent: '✋' + can }) : null
    );
    cell.addEventListener('click', () => openSheet(date));
    grid.append(cell);
  }
}

$('prevMonth').addEventListener('click', () => {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
  watchMonth();
});
$('nextMonth').addEventListener('click', () => {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
  watchMonth();
});

$('inviteBtn').addEventListener('click', () => {
  const r = state.room;
  shareText(`[${r.name}] 공동육아 SOS 달력에 초대해요!\n급할 때 누가 아이를 봐줄 수 있는지 여기서 체크해요.\n${inviteUrl(r.roomId)}\n(비밀번호는 따로 알려드릴게요)`);
});

$('changeNick').addEventListener('click', () => {
  const nick = (prompt('새 닉네임을 넣어주세요. (이미 올린 표시는 예전 닉네임 그대로예요)', state.room.nick) || '').trim().slice(0, 12);
  if (!nick) return;
  state.room.nick = nick;
  rememberRoom(state.room);
  $('myNick').textContent = nick;
});

/* ---------- 날짜를 누르면 올라오는 창 ---------- */

function openSheet(date) {
  state.sheetDate = date;
  setFormType(null);
  $('markForm').reset();
  renderSheet();
  $('backdrop').classList.add('open');
  $('sheet').classList.add('open');
}
function closeSheet() {
  state.sheetDate = null;
  $('backdrop').classList.remove('open');
  $('sheet').classList.remove('open');
}
$('backdrop').addEventListener('click', closeSheet);
$('sheetClose').addEventListener('click', closeSheet);

function renderSheet() {
  const date = state.sheetDate;
  $('sheetTitle').textContent = prettyDate(date);
  const isPast = date < ymd(new Date());
  $('sheetActions').hidden = isPast;
  $('sheetPast').hidden = !isPast;

  // 🆘 먼저, 그다음 ✋
  const dayMarks = state.marks.filter(m => m.date === date)
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'sos' ? -1 : 1));
  $('sheetEmpty').hidden = dayMarks.length > 0;

  $('sheetMarks').replaceChildren(...dayMarks.map(m => {
    const mine = m.uid === state.myUid;
    const title = (m.type === 'sos' ? '🆘 ' : '✋ ') + m.nick + (m.type === 'sos' ? ' · 도움 필요' : ' · 가능');
    const sub = [m.time, m.memo].filter(Boolean).join('\n');
    const actions = [];
    if (mine && m.type === 'sos' && !isPast) {
      const share = el('button', { className: 'btn small sos', type: 'button', textContent: '📣 단톡방에 알리기' });
      share.addEventListener('click', () => shareSos(m));
      actions.push(share);
    }
    if (mine) {
      const del = el('button', { className: 'del', type: 'button', textContent: '지우기' });
      del.addEventListener('click', async () => {
        if (!confirm('이 표시를 지울까요?')) return;
        try { await store.deleteMark(state.room.key, m.id); } catch (err) { toast(explain(err)); }
      });
      actions.push(del);
    }
    return el('li', { className: m.type },
      el('div', { className: 'body' },
        el('div', { textContent: title }),
        sub ? el('div', { className: 'sub', textContent: sub }) : null,
        actions.length ? el('div', { style: 'margin-top:6px; display:flex; gap:8px; align-items:center;' }, actions) : null
      )
    );
  }));
}

function shareSos(m) {
  const lines = [`🆘 ${prettyDate(m.date)}${m.time ? ' ' + m.time : ''} 아이 봐주실 분 계실까요? - ${m.nick}`];
  if (m.memo) lines.push(m.memo);
  lines.push(`가능하시면 달력에 ✋ 눌러주세요 👉 ${inviteUrl(state.room.roomId)}`);
  shareText(lines.join('\n'));
}

function setFormType(type) {
  state.formType = type;
  $('markForm').classList.toggle('open', !!type);
  document.querySelectorAll('#sheetActions [data-type]').forEach(b => {
    b.classList.toggle('ghost', !!type && b.dataset.type !== type);
  });
  if (type) {
    $('markSubmit').textContent = type === 'sos' ? '🆘 도움 요청 올리기' : '✋ 가능하다고 올리기';
    $('markSubmit').classList.toggle('sos', type === 'sos');
    $('markMemo').placeholder = type === 'sos' ? '예: 병원 진료 때문에요' : '예: 우리 집에서 봐줄 수 있어요';
  }
}
document.querySelectorAll('#sheetActions [data-type]').forEach(b => {
  b.addEventListener('click', () => setFormType(state.formType === b.dataset.type ? null : b.dataset.type));
});

$('markForm').addEventListener('submit', async e => {
  e.preventDefault();
  const type = state.formType;
  if (!type || !state.sheetDate) return;
  const btn = $('markSubmit'); btn.disabled = true;
  try {
    await store.addMark(state.room.key, {
      date: state.sheetDate,
      type,
      nick: state.room.nick,
      time: $('markTime').value.trim(),
      memo: $('markMemo').value.trim()
    });
    $('markForm').reset();
    setFormType(null);
    toast(type === 'sos' ? '올렸어요. "📣 단톡방에 알리기"로 알려보세요.' : '올렸어요. 고마워요!');
  } catch (err) {
    toast(explain(err));
  } finally {
    btn.disabled = false;
  }
});

/* ---------- 시작 ---------- */

try {
  store = createStore();
  $('demoBanner').hidden = !store.demo;
  window.addEventListener('hashchange', route);
  route();
} catch (err) {
  document.querySelector('.wrap').append(el('div', { className: 'card' }, el('p', { className: 'error', textContent: err.message })));
}

/* ---------- 처음 열었을 때 앱 소개 ---------- */
const INTRO_KEY = 'sos.introSeen';
let installPrompt = null; // 크롬이 "설치 가능" 신호를 주면 여기에 보관

function openIntro(showInstall) {
  $('introMain').hidden = !!showInstall;
  $('introInstall').hidden = !showInstall;
  $('installNow').hidden = !installPrompt;
  $('intro').hidden = false;
  $('intro').scrollTop = 0;
}
function closeIntro() {
  $('intro').hidden = true;
  try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) { /* 저장 불가 환경: 다음에 또 보여도 괜찮아요 */ }
}
$('introStart').addEventListener('click', closeIntro);
$('introClose').addEventListener('click', closeIntro);
$('helpBtn').addEventListener('click', () => openIntro(false));
$('introHowTo').addEventListener('click', () => openIntro(true));
$('introBack').addEventListener('click', () => openIntro(false));

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  if (!$('intro').hidden) $('installNow').hidden = false;
});
$('installNow').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = null;
  $('installNow').hidden = true;
  if (outcome === 'accepted') { closeIntro(); toast('설치했어요. 홈 화면에서 열어보세요!'); }
});

(function showIntroOnce() {
  let seen = false;
  try { seen = localStorage.getItem(INTRO_KEY) === '1'; } catch (e) { /* 못 읽으면 처음으로 봐요 */ }
  // 홈 화면 앱으로 이미 설치해서 연 경우엔 소개를 건너뛰어요.
  const installed = window.matchMedia('(display-mode: standalone)').matches;
  if (!seen && !installed) openIntro(false);
})();
