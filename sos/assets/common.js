/* 공동육아 SOS 공통 도구 — 모든 페이지에서 먼저 불러와요 */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const WEEK = ['일','월','화','수','목','금','토'];
const SLOTS = ['오전','점심','오후','저녁'];   // 예전 글의 시간대 (지금은 9시~20시 중에 골라요)
const HOURS = [9,10,11,12,13,14,15,16,17,18,19,20];   // 모임·SOS에서 고를 수 있는 시간
// 같은 날 모임 정렬용: '10시' → 10, 예전 시간대는 대략적인 시각으로
function slotOrder(s){ const m = /^(\d+)시$/.exec(s || ''); return m ? +m[1] : ({'오전':9.5,'점심':12.5,'오후':15.5,'저녁':18.5})[s] || 99; }

// 모임·SOS는 오늘부터 7일(1주일) 안에서만 고를 수 있어요
const BOOK_DAYS = 7;
// 오늘에서 n일 뒤 날짜를 YYYY-MM-DD로 (기기 시간 기준)
function dayStr(n){ const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
const lastBookDay = () => dayStr(BOOK_DAYS - 1);
// 지난 모임·댓글·SOS 숫자는 그 날짜가 지나고 7일 뒤 지워져요: 저장할 때 지울 날짜(expireAt)를 적어 두고,
// 방 사람이 앱을 열 때 지울 날짜가 지난 기록을 앱이 정리해요 (무료 요금제라 서버 TTL 대신, cleanupExpired)
const KEEP_DAYS = 7;
// 자동 삭제 스위치: 서버 규칙(expireAt 허용 + 지난 기록 삭제 허용)을 게시한 뒤에 true 로 켜요.
// (꺼져 있으면 expireAt 을 보내지 않고, '7일 뒤 자동 삭제' 안내 문구도 숨겨요 — 사실이 아닌 안내를 보이지 않게)
const TTL_READY = true;   // 2026-10-04 서버 규칙 게시·확인 후 켬
const ttl = ymd => TTL_READY ? {expireAt: expireAt(ymd)} : {};
document.addEventListener('DOMContentLoaded', () => { if(!TTL_READY) document.querySelectorAll('.ttl-only').forEach(el => { el.hidden = true; }); });
function expireAt(ymd){ const [y,m,d] = ymd.split('-').map(Number); return firebase.firestore.Timestamp.fromDate(new Date(y, m-1, d + 1 + KEEP_DAYS)); }

/* 서버에서 실제로 받은 데이터만 써요: 인터넷이 끊기면 Firebase가 '빈 임시 데이터(fromCache)'를 먼저 보내는데,
   그걸 그대로 그리면 'SOS 0명'처럼 보여서 오해할 수 있어요. 8초 안에 서버 답이 없으면 연결 안내를 띄워요. */
function serverOnly(onData){
  let got = false;
  const timer = setTimeout(() => { if(!got) sosTrouble({code: 'unavailable'}); }, 8000);
  return snap => {
    if(snap.metadata.fromCache && !got) return;
    if(!got){ got = true; clearTimeout(timer); const bar = document.getElementById('troubleBar'); if(bar) bar.remove(); }
    onData(snap);
  };
}

/* 서버 문제 안내 띠: 무료 사용량이 다 찼거나(resource-exhausted) 연결이 안 될 때 화면 맨 위에 알려요.
   (숫자가 0명으로 보여서 'SOS가 없네'로 오해하지 않게) */
function sosTrouble(err){
  const quota = err && err.code === 'resource-exhausted';
  let bar = document.getElementById('troubleBar');
  if(!bar){ bar = document.createElement('div'); bar.id = 'troubleBar'; bar.className = 'trouble'; bar.setAttribute('role', 'alert');
    (document.querySelector('main') || document.body).prepend(bar); }
  const code = err && err.code;
  bar.innerHTML = quota
    ? '<b>⚠️ 오늘은 쓰는 분이 많아 잠시 멈췄어요.</b><br>오후 5시쯤 다시 열려요. 저장된 기록은 그대로예요.'
    : code === 'auth' ? '<b>⚠️ 로그인 준비가 안 됐어요.</b><br>인터넷 연결을 확인하고 새로고침해 주세요.<br><small>(계속되면 운영자에게 알려 주세요: 익명 로그인 설정)</small>'
    : code === 'permission-denied' ? '<b>⚠️ 이 방 기록을 볼 수 없어요.</b><br>방장이 내보냈거나, 서버 설정이 바뀌는 중이에요. 잠시 뒤 새로고침해 주세요.'
    : '<b>⚠️ 서버에 연결하지 못했어요.</b><br>인터넷 연결을 확인하고 새로고침해 주세요.';
}

// 오늘 날짜를 YYYY-MM-DD로 (기기 시간 기준)
function todayStr(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
/* 자정이 지나면 '오늘'이 바뀌어요: 켜 둔 화면은 어제 기준이라, 날짜가 바뀌면 새로고침해요.
   글을 쓰는 중이면 방해하지 않고, 화면을 다시 볼 때(앱으로 돌아올 때) 새로고침해요. */
(function dayRollover(){
  const day0 = todayStr();
  // 글을 쓰는 중이거나 팝업(확인 창·저장 중)이 떠 있으면 기다려요
  const typing = () => { const a = document.activeElement; return !!(a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.value) || !!document.querySelector('.pop-back'); };
  const check = () => { if(todayStr() === day0) return; if(!typing() && !document.hidden) location.reload(); else setTimeout(check, 60000); };
  const midnight = () => { const d = new Date(); d.setHours(24, 0, 1, 0); setTimeout(check, Math.min(d - Date.now(), 2 ** 31 - 1)); };
  midnight();
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
})();
// 글 올린 시각 (아직 서버 시각이 안 붙었으면 '방금')
function fmtTime(ts){
  if(!ts || !ts.toDate) return '방금';
  const d = ts.toDate();
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
// 모임 카드 왼쪽 날짜 배지 (예: 10월 / 7 / 수)
function dateBadge(ymd){
  const [y,m,d] = ymd.split('-').map(Number);
  const el = document.createElement('div'); el.className = 'date-badge' + (ymd===todayStr() ? ' today' : '');
  el.innerHTML = `<small>${ymd===todayStr() ? '오늘' : m + '월'}</small><b>${d}</b><small>${WEEK[new Date(y, m-1, d).getDay()]}</small>`;
  return el;
}
function dayLabel(ymd){ const [y,m,d] = ymd.split('-').map(Number); return `${m}/${d} (${WEEK[new Date(y, m-1, d).getDay()]})`; }

/* 위쪽 메뉴: 페이지마다 <nav id="siteNav" data-page="..."> 만 두면 여기서 채워요 */
const NAV = [['index.html','home','🏠','홈'],['meet.html','meet','🆘','SOS 예약'],['terms.html','safety','📜','이용약관']];
(function renderNav(){
  const nav = document.getElementById('siteNav'); if(!nav) return;
  const cur = nav.dataset.page;
  nav.innerHTML = `<a class="brand" href="index.html">공동육아 SOS 🆘</a><div class="nav-links">` +
    NAV.map(([href,key,icon,label]) => `<a href="${href}"${key===cur ? ' aria-current="page"' : ''}><span class="ti" aria-hidden="true">${icon}</span><span>${label}</span></a>`).join('') + '</div>' +
    '<button type="button" class="intro-btn" aria-label="공동육아 SOS 소개 다시 보기">📖 소개</button>';
  // 왼쪽 위 '🏠 방 목록': 방에 들어와 있을 때만 (gate.js의 showRooms)
  if(typeof ROOM !== 'undefined' && ROOM){
    const rb = document.createElement('button'); rb.type = 'button'; rb.className = 'rooms-btn'; rb.textContent = '🏠 방 목록';
    rb.setAttribute('aria-label', '내 방 목록 보기 · 방 바꾸기 · 새 방 만들기');
    rb.addEventListener('click', () => { if(typeof showRooms === 'function') showRooms(true); });
    nav.prepend(rb);
  }
  // 첫 화면 이야기 다시 보기 (showIntro는 gate.js)
  nav.querySelector('.intro-btn').addEventListener('click', () => { if(typeof showIntro === 'function') showIntro(); });
})();

/* Firebase — 모임·SOS·놀이 추가는 지금 들어와 있는 "모임 방" 안에 저장돼요 (roomRef는 gate.js)
   필요한 Firestore 보안 규칙은 firestore.rules 참고 */
// 모임 컬렉션을 돌려줘요. 인터넷·SDK 문제로 못 쓰거나 아직 방에 안 들어왔으면 null
function copCollection(){ const r = roomRef(); return r && r.collection('opinions'); }

// 모임 요청(topic 'meet') 중 오늘 이후 것을 가까운 순으로 cb에 넘겨요. 못 불러오면 null
// 오늘 모임 중 시작 시간이 이미 지난 것 (예: 10시 40분이면 9시 모임). 그 시간 안(9시 30분)에는 아직 보여요
function meetStarted(o){ return o.date === todayStr() && slotOrder(o.slot) < new Date().getHours(); }
function watchMeets(cb){
  const col = copCollection(); if(!col){ cb(null); return; }
  let docs = null;
  const emit = () => { if(!docs) return; const today = todayStr();
    cb(docs.filter(o => o.topic==='meet' && o.date && o.date >= today && !o.cancelled && !meetStarted(o))
      .sort((a,b) => a.date.localeCompare(b.date) || slotOrder(a.slot) - slotOrder(b.slot))); };
  setInterval(emit, 60000);   // 켜 둔 채로 시간이 지나도 시작한 모임은 알아서 빠져요
  sosReady().then(ok => { if(!ok){ cb(null); return; } col.where('date', '>=', todayStr()).limit(100).onSnapshot(serverOnly(snap => {   // 오늘 이후 모임만 읽어요 (읽기 횟수 절약)
    docs = snap.docs.map(d => ({id:d.id, ...d.data()})); emit();
  }), err => { sosTrouble(err); cb(null); }); });
}
// 모임의 참석·미확정·불참: 닉네임 표(v: {uid: {s, n}}) + 예전 숫자 칸(joins/maybes/nos)
const VOTE_KINDS = [['join', 'joins', '참석'], ['maybe', 'maybes', '미확정'], ['no', 'nos', '불참']];
function meetVotes(o){
  const out = {}; VOTE_KINDS.forEach(([s, old]) => { out[s] = {names: [], old: o[old] || 0}; });
  Object.entries(o.v || {}).forEach(([uid, e]) => { if(out[e.s]) out[e.s].names.push({uid, n: e.n}); });
  VOTE_KINDS.forEach(([s]) => { out[s].count = out[s].names.length + out[s].old; });
  return out;
}
function tallyHtml(o){
  const v = meetVotes(o);
  return VOTE_KINDS.map(([s, , label]) => `<span>${label} <b>${v[s].count}</b></span>`).join('') + '<span class="tally-who">👀 누가?</span>';
}
// 누가 참석·미확정·불참했는지 + 아직 답 안 한 멤버 (팝업)
async function showVoters(o){
  const v = meetVotes(o), members = await sosMembers();
  const answered = new Set(Object.keys(o.v || {}));
  const chips = list => list.length ? list.map(x => `<span class="who-chip">${esc(x)}</span>`).join('') : '<span class="who-none">없어요</span>';
  const body = VOTE_KINDS.map(([s, , label]) => `<p class="who-h">${label} ${v[s].count}명</p><div class="who-list">${chips(v[s].names.map(x => x.n))}${v[s].old ? `<span class="who-none">+ 예전 기록 ${v[s].old}명</span>` : ''}</div>`).join('')
    + `<p class="who-h">🤷 아직 답 안 함</p><div class="who-list">${chips(members.filter(m => !answered.has(m.uid)).map(m => m.nick))}</div>`;
  sosInfo({icon: '🙌', title: `${dayLabel(o.date)} ${o.slot || ''} 모임`, body});
}

// 홈 화면 설치(웹앱)용 서비스 워커 등록 — 캐시는 하지 않아요
if('serviceWorker' in navigator){ window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); }); }

/* ---------- 공용 달력 + 시간(9~20시) 고르기 ----------
   createPicker(root, {months, multi, whenText, dayBadge, hourBadge, onChange})
   - multi: true면 시간을 여러 개 고를 수 있어요 (state.slots, state.slot은 그중 가장 이른 시간)
   - root 안에 달력과 시간 버튼을 그려요. 지난 날은 막고, 이번 달부터 months달까지 넘겨 볼 수 있어요.
   - dayBadge(날짜) / hourBadge(날짜, '10시') 가 숫자를 돌려주면 작게 표시해요 (SOS 수 등). */
function createPicker(root, opts = {}){
  const months = opts.months || 2;   // 1주일이 다음 달로 넘어갈 수 있어서 두 달까지 넘겨 봐요
  const st = {date: todayStr(), slot: null, slots: [], month: null};
  const ymd = (y,m,d) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  root.classList.add('picker');
  root.innerHTML = `<div class="cal-head">
      <button type="button" class="cal-nav" data-nav="-1" aria-label="이전 달">‹</button><b class="cal-title"></b>
      <button type="button" class="cal-nav" data-nav="1" aria-label="다음 달">›</button></div>
    <div class="cal-week" aria-hidden="true"><span class="sun">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span class="sat">토</span></div>
    <div class="cal-grid" role="group" aria-label="날짜"></div>
    <div class="time-grid" role="group" aria-label="시간"></div>
    <p class="picked-when"></p>`;
  function render(){
    const today = todayStr(), [ty,tm] = today.split('-').map(Number);
    if(!st.month) st.month = {y:ty, m:tm};
    const {y, m} = st.month, idx = (y - ty) * 12 + (m - tm);
    root.querySelector('.cal-title').textContent = `${y}.${String(m).padStart(2,'0')}`;
    root.querySelector('[data-nav="-1"]').disabled = idx <= 0;
    root.querySelector('[data-nav="1"]').disabled = idx >= months - 1 || lastBookDay().slice(0,7) <= `${y}-${String(m).padStart(2,'0')}`;
    // 예약할 수 있는 1주일이 들어 있는 주(1~2줄)만 보여 줘요 — 한 화면에 다 보이게
    const t0 = new Date(ty, tm-1, +today.slice(8)), start = new Date(t0); start.setDate(t0.getDate() - t0.getDay());
    const [ly, lm, ld] = lastBookDay().split('-').map(Number), end = new Date(ly, lm-1, ld); end.setDate(end.getDate() + (6 - end.getDay()));
    let html = '';
    for(const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)){
      const v = ymd(d.getFullYear(), d.getMonth()+1, d.getDate()), dow = d.getDay(), past = v < today || v > lastBookDay(), n = opts.dayBadge ? opts.dayBadge(v) : 0;
      const cls = ['cal-day', dow===0 ? 'sun' : dow===6 ? 'sat' : '', v===today ? 'today' : '', v===st.date ? 'on' : ''].join(' ');
      const label = d.getDate() === 1 ? `${d.getMonth()+1}/1` : d.getDate();
      html += `<button type="button" class="${cls}" data-date="${v}" ${past ? 'disabled' : ''} aria-pressed="${v===st.date}">${label}<small>${n ? n + '명' : v===today ? '오늘' : ''}</small></button>`;
    }
    const sm = start.getMonth()+1, em = end.getMonth()+1;
    root.querySelector('.cal-title').textContent = sm === em ? `${start.getFullYear()}.${String(sm).padStart(2,'0')}` : `${sm}월 ~ ${em}월`;
    root.querySelectorAll('.cal-nav').forEach(b => { b.hidden = true; });
    root.querySelector('.cal-grid').innerHTML = html;
    // 오늘의 지난 시간은 고를 수 없어요 (골라 뒀던 게 지나가면 자동으로 빠져요)
    if(st.date === today){
      const gone = h => parseInt(h) < new Date().getHours();
      if(opts.multi && st.slots.some(gone)){ st.slots = st.slots.filter(h => !gone(h)); st.slot = st.slots[0] || null; }
      else if(!opts.multi && st.slot && gone(st.slot)) st.slot = null;
    }
    root.querySelector('.time-grid').innerHTML = HOURS.map(h => {
      const n = opts.hourBadge ? opts.hourBadge(st.date, h + '시') : 0;
      const gone = st.date === today && h < new Date().getHours();
      return `<button type="button" class="time-btn" data-slot="${h}시" ${gone ? 'disabled' : ''} aria-pressed="${opts.multi ? st.slots.includes(h+'시') : st.slot===h+'시'}">${h}:00${n ? `<small>${n}명</small>` : ''}</button>`;
    }).join('');
    root.querySelector('.picked-when').textContent = st.date ? (opts.whenText ? opts.whenText(st) : `${dayLabel(st.date)}${st.slot ? ' ' + st.slot : ''}`) : '';
  }
  root.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if(nav && !nav.disabled){ let {y,m} = st.month; m += +nav.dataset.nav; if(m < 1){ m = 12; y--; } if(m > 12){ m = 1; y++; } st.month = {y,m}; render(); return; }
    const d = e.target.closest('[data-date]');
    if(d && !d.disabled){ st.date = d.dataset.date; if(opts.multi){ st.slots = []; st.slot = null; } render(); opts.onChange && opts.onChange(st); return; }
    const t = e.target.closest('[data-slot]');
    if(t && t.disabled) return;
    if(t && opts.multi){   // 누를 때마다 넣었다 뺐다
      const v = t.dataset.slot;
      st.slots = st.slots.includes(v) ? st.slots.filter(x => x !== v) : [...st.slots, v].sort((a,b) => parseInt(a) - parseInt(b));
      st.slot = st.slots[0] || null; render(); opts.onChange && opts.onChange(st); return;
    }
    if(t){ st.slot = t.dataset.slot; render(); opts.onChange && opts.onChange(st); }
  });
  render();
  return {state: st, render};
}

/* 🆘 SOS 달력(🆘 SOS 요청): 혼자 독박하는 날짜와 시간(9~20시)을 골라 "이때 나 힘들어요"를 보내요.
   저장: rooms/{방 열쇠}/sos/YYYY-MM-DD 문서의 p 지도 — {내 uid: {h: [시간들], n: 닉네임}} (예전 숫자 칸 h9 등도 함께 세요)
   시간 숫자를 누르면 누가 보냈는지 닉네임이 보여요.
   달력에는 날짜별 SOS 수, 시간 버튼에는 그 날 시간별 SOS 수가 보여요 → 보고 눈치게임으로 모임 만들기.
   기기당 같은 날짜·시간에는 한 번만. 홈에는 요약(sosSummary)만 보여 줘요. */
function sosWatch(cb){
  const r = roomRef(), col = r && r.collection('sos');
  if(!col){ cb(null, null, {code: 'unavailable'}); return null; }
  // 예약할 수 있는 오늘~1주일치만 읽어요 (읽기 횟수 절약)
  sosReady().then(ok => { if(!ok){ cb(null, col, {code: 'auth'}); return; }
  col.where(firebase.firestore.FieldPath.documentId(), '>=', todayStr())
     .where(firebase.firestore.FieldPath.documentId(), '<=', lastBookDay()).onSnapshot(serverOnly(snap => {
    const data = {}; snap.docs.forEach(d => { data[d.id] = d.data(); }); cb(data, col);
  }), err => { sosTrouble(err); cb(null, col, err); }); });
  return col;
}
// 내 SOS 요청 시간들 (그 날 문서의 p[내 uid].h)
const sosMine = v => ((v && v.p && v.p[ME.uid]) || {}).h || [];
// 이 시간 SOS 요청 ↔ 취소 (내 칸만 바꿔요). 바뀐 뒤의 날짜 문서(화면용)를 돌려줘요
async function sosToggleHour(day, h, v){
  const col = roomRef().collection('sos'), mine = sosMine(v), on = mine.includes(h);
  const hours = on ? mine.filter(x => x !== h) : [...mine, h].sort((x, y) => x - y);
  if(hours.length) await col.doc(day).set({p: {[ME.uid]: {h: hours, n: ME.nick}}, ...ttl(day)}, {merge: true});
  else await col.doc(day).update({['p.' + ME.uid]: firebase.firestore.FieldValue.delete()});
  if(!on && typeof pushSosCrowd === 'function') pushSosCrowd(day, h + '시', sosHourCount(v, h) + 1);   // 방 사람들에게 SOS 알림 (3명부터는 '몰렸어요')
  const nv = {...(v || {}), p: {...((v && v.p) || {})}};
  if(hours.length) nv.p[ME.uid] = {h: hours, n: ME.nick}; else delete nv.p[ME.uid];
  return nv;
}
// 그 시간에 SOS 보낸 사람 팝업 + 바로 요청하기(다시 누르면 취소)
function showSosNames(day, h, v){
  h = +h;
  const names = sosHourNames(v, h), old = (v && v['h' + h]) || 0;
  const mine = ME.uid && sosMine(v).includes(h);
  const past = day < todayStr() || (day === todayStr() && h < new Date().getHours());
  const btn = !ME.uid ? '' : past && !mine ? '<p class="who-none">지난 시간이라 요청할 수 없어요.</p>'
    : `<button type="button" class="sos-pop-btn${mine ? ' on' : ''}" data-sos-toggle>${mine
      ? '✅ SOS 요청했어요<small>다시 누르면 취소돼요</small>'
      : `🆘 이 시간 SOS 요청하기<small>${esc(ME.nick)}</small>`}</button>`;
  const body = (names.length ? `<div class="who-list">${names.map(n => `<span class="who-chip sos">${esc(n)}</span>`).join('')}</div>` : '')
    + (old ? `<p class="who-none">+ 예전 기록 ${old}명 (닉네임 없음)</p>` : '')
    + (!names.length && !old ? '<p class="who-none">아직 SOS가 없어요.</p>' : '')
    + btn
    + (past ? '' : `<a class="sos-brave-btn" href="meet.html?d=${day}&s=${h}#new" data-brave>🙌 용기 내서 이 시간 모임 열기</a>`);
  const box = sosInfo({icon: '🆘', title: `${dayLabel(day)} ${h}시 SOS ${names.length + old}명`, body});
  box.addEventListener('click', async e => {
    if(e.target.closest('[data-brave]') && typeof openMeetForm === 'function'){ e.preventDefault(); box.remove(); openMeetForm(day, h + '시'); return; }
    const b = e.target.closest('[data-sos-toggle]'); if(!b || b.disabled) return;
    b.disabled = true; b.innerHTML = '저장 중…';
    try{ const nv = await sosToggleHour(day, h, v); box.remove(); showSosNames(day, h, nv); }
    catch(err){ sosTrouble(err); b.disabled = false; b.innerHTML = '⚠️ 저장하지 못했어요<small>다시 눌러 주세요</small>'; }
  });
}

function sosInit(){
  const root = document.querySelector('[data-sos]'); if(!root) return;
  let data = {}, col = null, broken = false;
  root.innerHTML = `<div class="sos-top"><p class="sos-h">🆘 SOS 달력</p><p class="sos-count"></p></div>
    <p class="sos-sub sos-sub-s">독박하는 날, 미리 SOS를 요청해 두세요.<br>SOS가 모이면 용기 있는 한 명이 모임을 열어요 💪</p>
    <div class="sos-picker"></div>
    <button type="button" class="sos-btn"></button>
    <div class="sos-mine" hidden></div>
    <div class="sos-brave">
      <span class="brave-star s1" aria-hidden="true">✦</span><span class="brave-star s2" aria-hidden="true">✦</span>
      <p class="brave-h">💪 용기 한 번 내 볼까요?</p>
      <p class="brave-sub">SOS가 몰린 시간에 내가 먼저 모임을 열면<br><b>누군가의 독박이 끝나요</b> 🫶</p>
      <a href="#new" class="sos-make brave-btn"></a>
    </div>`;
  // 💪 용기 상자는 SOS 달력 카드 아래, 모임 만들기 양식 바로 위로 옮겨요 (버튼을 누르면 양식이 그 아래 펼쳐져요)
  const brave = root.querySelector('.sos-brave'), anchor = document.getElementById('meetForm');
  if(anchor) anchor.before(brave);
  const picker = createPicker(root.querySelector('.sos-picker'), {
    dayBadge: d => sosDayTotal(data[d]),
    hourBadge: (d, slot) => sosHourCount(data[d], parseInt(slot)),
    multi: true,
    whenText: st => st.slots.length ? `${dayLabel(st.date)} ${st.slots.join('·')} 골랐어요` : `${dayLabel(st.date)} · 시간을 골라 주세요`,
    onChange: draw
  });
  function draw(){
    const st = picker.state, mine = sosMine(data[st.date]), hs = st.slots.map(v => parseInt(v));
    const done = hs.length > 0 && hs.every(h => mine.includes(h));
    root.querySelector('.sos-count').innerHTML = `오늘 SOS <b>${sosDayTotal(data[todayStr()])}</b>명`;
    // 달력에서 고른 날짜·시간을 그대로 넣어 모임 만들기 (아래 큰 '＋ 모임 만들기'는 빈 양식)
    brave.querySelector('.sos-make').textContent = `🙌 ${dayLabel(st.date)}${st.slot ? ' ' + st.slot : ''} 모임 열기`;
    const b = root.querySelector('.sos-btn');
    b.disabled = !hs.length || done || !col || broken;
    b.className = 'sos-btn' + (done ? ' done' : '');
    b.innerHTML = broken ? '⚠️ 지금은 SOS 요청을 할 수 없어요<small>위의 안내를 확인해 주세요</small>' : done ? '✅ SOS 요청했어요<small>🫂 아래 "내가 요청한 SOS"에서 취소할 수 있어요</small>'
      : hs.length ? `🆘 SOS 요청하기${hs.length > 1 ? ` (${hs.length}개)` : ''}<small>${dayLabel(st.date)} ${st.slots.join('·')} · ${esc(ME.nick || '내 닉네임')}(으)로</small>` : '🆘 SOS 요청하기<small>날짜와 시간을 눌러 주세요 · 여러 개 OK</small>';
    // 내 SOS 요청 (오늘 이후) — 실수로 눌렀으면 여기서 취소
    const today = todayStr(), nowH = new Date().getHours();   // 오늘 이미 지난 시간은 빼요 (6시 반이면 오늘 9·10·11시는 안 보여요)
    const list = Object.keys(data).filter(d => d >= today).sort().flatMap(d => sosMine(data[d]).slice().sort((x, y) => x - y).filter(h => d > today || h >= nowH).map(h => [d, h]));
    const box = root.querySelector('.sos-mine'); box.hidden = !list.length;
    // 제목을 누르면 접고 펴요 (이 휴대폰에 기억)
    let open = false; try{ open = localStorage.getItem('sosMineOpen') === '1'; }catch(e){}   // 처음엔 접혀 있어요
    box.classList.toggle('closed', !open);
    box.innerHTML = `<button type="button" class="sos-mine-h" data-mine-toggle aria-expanded="${open}">📌 내가 요청한 SOS <small>${list.length}개</small><span class="sos-mine-arrow" aria-hidden="true">${open ? '접기 ▲' : '펼치기 ▼'}</span></button>` + (open ? list.map(([d, h]) =>
      `<div class="sos-mine-row"><span>${dayLabel(d)} ${h}시</span><button type="button" class="sos-cancel" data-cancel="${d}|${h}">요청 취소</button></div>`).join('') : '');
  }
  const put = (day, hours) => hours.length
    ? col.doc(day).set({p: {[ME.uid]: {h: hours, n: ME.nick}}, ...ttl(day)}, {merge: true})
    : col.doc(day).update({['p.' + ME.uid]: firebase.firestore.FieldValue.delete()});
  col = sosWatch((d, c, err) => { col = c; if(d) data = d; if(err) broken = true; picker.render(); draw(); });
  setInterval(draw, 60000);   // 켜 둔 채로 시간이 지나도 지난 SOS는 알아서 빠져요
  root.querySelector('.sos-mine').addEventListener('click', async e => {
    if(e.target.closest('[data-mine-toggle]')){
      try{ localStorage.setItem('sosMineOpen', localStorage.getItem('sosMineOpen') === '1' ? '0' : '1'); }catch(err){}
      draw(); return;
    }
    const c = e.target.closest('[data-cancel]'); if(!c || !col) return;
    const [day, h] = c.dataset.cancel.split('|');
    c.disabled = true; c.textContent = '취소 중…';
    try{ await put(day, sosMine(data[day]).filter(x => x !== +h)); }
    catch(err){ sosTrouble(err); c.disabled = false; c.textContent = '다시 눌러 주세요'; }
  });
  draw();
  root.querySelector('.sos-btn').addEventListener('click', async () => {
    const st = picker.state; if(!st.slots.length || !col || !ME.uid) return;
    const before = data[st.date], mine = sosMine(before), add = st.slots.map(v => parseInt(v)).filter(h => !mine.includes(h));
    if(!add.length) return;
    root.querySelector('.sos-btn').disabled = true;
    try{
      await put(st.date, [...mine, ...add].sort((x, y) => x - y));
      // 같은 시간 SOS가 3명이 되는 순간 방에 알림
      if(typeof pushSosCrowd === 'function' && add.length){ const h = add.reduce((m, x) => sosHourCount(before, x) > sosHourCount(before, m) ? x : m, add[0]); pushSosCrowd(st.date, h + '시', sosHourCount(before, h) + 1); }   // 여러 시간을 골라도 알림은 한 번
    }catch(err){ sosTrouble(err); if(typeof pushToast === 'function') pushToast('⚠️ 저장하지 못했어요. 다시 눌러 주세요'); }   // 쓰기 실패는 다시 누를 수 있게 둬요
    draw();
  });
  // 고른 날짜·시간을 그대로 모임 만들기에 넘겨요
  brave.querySelector('.sos-make').addEventListener('click', e => {
    if(typeof openMeetForm === 'function'){ e.preventDefault(); openMeetForm(picker.state.date, picker.state.slot); }
  });
}

// 홈: 오늘의 SOS 요청 시간표(9~20시) + 다가오는 날의 예약 목록 + SOS 요청하러 가기
function sosSummary(){
  const box = document.querySelector('[data-sos-summary]'); if(!box) return;
  // 오늘부터 7일 중 하루를 골라 그날 시간표를 봐요
  const days = Array.from({length:7}, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  const name = i => i === 0 ? '오늘' : i === 1 ? '내일' : null;
  let sel = 0, last = null;
  let failed = false;
  const draw = data => {
    last = data;
    const keep = box.querySelector('.sos-tabs'), sx = keep ? keep.scrollLeft : 0;   // 다시 그려도 날짜 줄 스크롤 위치는 그대로
    const today = todayStr(), day = days[sel], t = (data && data[day]) || {};
    const label = name(sel) || dayLabel(day);
    const tabs = days.map((d, i) => { const n = data ? sosDayTotal(data[d]) : 0;
      return `<button type="button" class="sos-tab" data-sos-day="${i}" aria-pressed="${i===sel}">${name(i) || dayLabel(d).replace(' (', ' ').replace(')', '')}${n ? `<small>${n}</small>` : ''}</button>`; }).join('');
    const cells = HOURS.map(h => { const n = sosHourCount(t, h);
      return `<button type="button" class="sos-cell${n ? ' on' : ''}" data-sos-hour="${h}"${data ? '' : ' disabled'}><b>${h}시</b><span>${data ? n + '명' : failed ? '–' : '…'}</span></button>`; }).join('');
    const upcoming = data ? Object.keys(data).filter(d => d > today).sort().map(d => {
      const hs = HOURS.filter(h => sosHourCount(data[d], h)).map(h => `<button type="button" class="sos-chip" data-sos-hour="${h}" data-sos-date="${d}">${h}시 ${sosHourCount(data[d], h)}명</button>`);
      return hs.length ? `<div class="sos-day"><b>${dayLabel(d)}</b><div>${hs.join('')}</div></div>` : '';
    }).filter(Boolean).slice(0,5) : [];
    box.innerHTML = `<div class="sos-top"><p class="sos-h">🆘 SOS 달력</p><p class="sos-count">${label} SOS <b>${data ? sosDayTotal(t) : failed ? '?' : '…'}</b>명</p></div>
      <div class="sos-tabs" role="group" aria-label="날짜 고르기">${tabs}</div>
      <p class="sos-sub"><b>📅 ${name(sel) ? label + '의' : label} SOS 요청</b>${name(sel) ? ` (${dayLabel(day)})` : ''}</p>
      <p class="sos-note">👀 시간별로 SOS를 요청한 사람 수예요.<br><b>시간을 누르면 누가 보냈는지 보이고,<br>바로 요청할 수 있어요.</b></p>
      <div class="sos-today">${cells}</div>
      ${upcoming.length ? `<p class="sos-sub"><b>🗓 다가오는 SOS 요청</b></p><div class="sos-days">${upcoming.join('')}</div>` : ''}`;
    box.querySelector('.sos-tabs').scrollLeft = sx;
  };
  box.addEventListener('click', e => {
    const hb = e.target.closest('[data-sos-hour]');
    if(hb && last){ const d = hb.dataset.sosDate || days[sel]; showSosNames(d, +hb.dataset.sosHour, last[d]); return; }
    const b = e.target.closest('[data-sos-day]'); if(!b) return;
    sel = +b.dataset.sosDay; draw(last);
  });
  draw(null);
  sosWatch((d, c, err) => { if(err) failed = true; draw(d); });
}

/* 확인 팝업: sosConfirm({icon, title, body(HTML), ok, danger}) → 누르면 true, 취소면 false */
function sosConfirm({icon = '', title, body = '', ok = '확인', danger = false}){
  return new Promise(resolve => {
    const box = document.createElement('div'); box.className = 'pop-back';
    box.innerHTML = `<div class="pop" role="alertdialog" aria-modal="true" aria-labelledby="popT">
        ${icon ? `<p class="pop-icon" aria-hidden="true">${icon}</p>` : ''}
        <p class="pop-t" id="popT"></p>
        <div class="pop-b">${body}</div>
        <div class="pop-btns"><button type="button" class="btn" data-pop="0">취소</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-pop="1">${ok}</button></div>
      </div>`;
    box.querySelector('#popT').textContent = title;   // 방 이름이 들어가니 글자로만
    const done = v => { box.remove(); document.removeEventListener('keydown', esc); resolve(v); };
    const esc = e => { if(e.key === 'Escape') done(false); };
    box.addEventListener('click', e => { const b = e.target.closest('[data-pop]'); if(b) done(b.dataset.pop === '1'); else if(e.target === box) done(false); });
    document.addEventListener('keydown', esc);
    document.body.appendChild(box); box.querySelector('[data-pop="0"]').focus();
  });
}

/* 보기 팝업: sosInfo({icon, title, body(HTML)}) — 오른쪽 위 ✕ 로 닫기 (바깥을 눌러도 닫혀요) */
function sosInfo({icon = '', title, body = ''}){
  const box = document.createElement('div'); box.className = 'pop-back';
  box.innerHTML = `<div class="pop pop-info" role="dialog" aria-modal="true" aria-labelledby="popT">
      <button type="button" class="pop-x" data-pop="1" aria-label="닫기">✕</button>
      ${icon ? `<p class="pop-icon" aria-hidden="true">${icon}</p>` : ''}<p class="pop-t" id="popT"></p>
      <div class="pop-b">${body}</div></div>`;
  box.querySelector('#popT').textContent = title;
  const done = () => { box.remove(); document.removeEventListener('keydown', key); };
  const key = e => { if(e.key === 'Escape') done(); };
  box.addEventListener('click', e => { if(e.target === box || e.target.closest('[data-pop]')) done(); });
  document.addEventListener('keydown', key);
  document.body.appendChild(box); box.querySelector('[data-pop]').focus();
  return box;
}

/* 🚩 신고: 모임 글·댓글을 방장에게 알려요 (rooms/{방 열쇠}/reports, 방장만 볼 수 있어요) */
const REPORT_REASONS = ['욕설·비하', '광고·홍보', '개인정보 노출', '불쾌한 내용', '기타'];
function sosReport(kind, mid, cid){
  const box = sosInfo({icon: '🚩', title: kind === 'meet' ? '이 모임 글을 신고할까요?' : '이 댓글을 신고할까요?',
    body: `<p class="who-tip">이유를 고르면 방장에게 전달돼요.<br>신고한 사람은 방장만 볼 수 있어요.</p><div class="report-list">${REPORT_REASONS.map(r => `<button type="button" class="report-btn" data-reason="${r}">${r}</button>`).join('')}</div>`});
  box.addEventListener('click', async e => {
    const b = e.target.closest('[data-reason]'); if(!b || b.disabled) return;
    b.disabled = true;
    try{
      await roomRef().collection('reports').add({kind, mid, ...(cid ? {cid} : {}), reason: b.dataset.reason, uid: ME.uid, n: ME.nick, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
      box.remove();
      sosInfo({icon: '✅', title: '신고했어요', body: '<p>방장이 확인하고 필요하면 글을 내려요.<br>심각한 문제(아이 안전, 불법 내용)는<br>이용약관의 운영자 이메일로도 알려 주세요.</p>'});
    }catch(err){ sosTrouble(err); b.disabled = false; }
  });
}

/* 모임 방 이름 · 친구 초대 · 방 바꾸기 (홈 표지) */
(function roomBar(){
  if(!ROOM) return;
  document.querySelectorAll('[data-room-name]').forEach(el => { el.textContent = ROOM.name; });
  const inv = document.querySelector('[data-invite]');
  if(inv) inv.addEventListener('click', async () => {
    const text = `혹시 이런 거 같이 써 볼래요? 😊\n[${ROOM.name}] 공동육아 SOS 🆘\n\n독박인 날 시간만 눌러두면\n같은 시간에 힘든 사람이 몇 명인지 보여서\n모이자는 말 꺼내기가 훨씬 편해요.\n\n부담 없이 SOS만 눌러 놔도 돼요 🙌\n\n👇 누르면 크롬(아이폰은 사파리)으로 열려요\n${inviteUrl()}\n\n🔑 비밀번호는 따로 알려드릴게요`;
    if(navigator.share){ try{ await navigator.share({text}); return; }catch(e){ if(e.name === 'AbortError') return; } }
    try{ await navigator.clipboard.writeText(text); inv.textContent = '✅ 복사했어요! 단톡방에 붙여넣으세요'; setTimeout(() => { inv.textContent = '🔗 친구 초대하기'; }, 2500); }
    catch(e){ window.prompt('아래 글을 복사해서 단톡방에 붙여넣으세요.', text); }
  });
  // 🗑 방 지우기(방장) / 이 휴대폰에서 방 빼기(초대받은 사람)
  const lv = document.querySelector('[data-leave]');
  if(lv){
    // 서버가 아는 방장(ME.owner)만 지울 수 있어요. 방장 열쇠 없이 만든 예전 방은 들어온 사람 누구나.
    //  (이 휴대폰에 방장 열쇠가 남아 있어도, 방장을 넘겼으면 더 이상 못 지워요 → '방 빼기'로 바뀌어요)
    let canDelete = !!ROOM.owner, noKey = false;
    const label = () => { lv.textContent = canDelete ? '🗑 방 지우기' : '🚪 이 휴대폰에서 방 빼기'; };
    const decide = async () => {
      // 방장인데 이 휴대폰에 방장 열쇠가 없으면(기록이 지워졌을 때) 새 열쇠를 만들어 서버 지문(oh)을 바꿔요
      if(ME.owner && !ROOM.owner && !noKey){
        try{ const k = randomHex(); await roomRef().update({oh: await sha256Hex(k)}); ROOM.owner = k; rememberRoom(ROOM); }catch(e){}
      }
      canDelete = noKey || (ME.owner && !!ROOM.owner); label();
    };
    label();
    const r = roomRef();
    if(r) r.get().then(d => { noKey = d.exists && !d.data().oh; }).catch(() => {}).then(() => sosReady()).then(decide).catch(() => {});
    document.addEventListener('sos:owner', decide);   // 방장을 넘겨받은 직후
    lv.addEventListener('click', async () => {
      if(!canDelete){
        const yes = await sosConfirm({icon: '🚪', title: `이 휴대폰에서 '${ROOM.name}' 방을 뺄까요?`,
          body: '<p>멤버 목록에서 내 닉네임이 빠지고, 내 목록에서도 사라져요.</p><p>초대 링크와 비밀번호로 언제든 다시 들어올 수 있어요.</p>'
            + (ME.owner ? '<p class="pop-warn">지금 방장이에요. 나가면 멤버 누구나 방장을 이어받을 수 있어요.<br>먼저 👥 멤버에서 방장을 넘기는 게 좋아요.</p>' : ''), ok: '방 빼기'});
        if(!yes) return;
        await sosLeaveRoom(); location.href = 'index.html'; return;
      }
      const yes = await sosConfirm({icon: '⚠️', title: `'${ROOM.name}' 방을 지울까요?`, danger: true, ok: '네, 지울게요',
        body: '<p class="pop-warn">방을 지우면 기록도 다 사라져요.</p><ul><li>SOS 요청, 모임, 댓글이 모두 지워져요.</li><li>방 사람 모두 더 이상 이 방에 들어올 수 없어요.</li><li><b>되돌릴 수 없어요.</b></li></ul>'});
      if(!yes) return;
      lv.disabled = true; lv.textContent = '지우는 중…';
      try{ await deleteRoom(); await sosConfirm({icon: '🗑', title: '방을 지웠어요.', body: '<p>기록도 모두 지웠어요.</p>', ok: '확인'}); location.href = 'index.html'; }
      catch(e){
        lv.disabled = false; label();
        // 서버가 거절했으면 그 사이 방장이 바뀐 것: 이 휴대폰의 방장 열쇠는 더 이상 안 맞아요
        if(e && e.code === 'permission-denied'){
          try{ const d = await roomRef().get(); if(d.exists && d.data().ou && d.data().ou !== ME.uid){ ROOM.owner = ''; rememberRoom(ROOM); ME.owner = false; decide(); } }catch(err){}
          sosConfirm({icon: '👑', title: '방장이 바뀌어서 지울 수 없어요.', body: '<p>방장을 다른 멤버에게 넘겼어요. 지우려면 새 방장에게 부탁해 주세요.</p>', ok: '확인'});
        }
        else sosConfirm({icon: '😢', title: '지우지 못했어요.', body: '<p>인터넷 연결을 확인하고 다시 눌러 주세요.<br>다시 누르면 지우던 데서 이어서 지워요.</p>', ok: '확인'});
      }
    });
  }
  const sw = document.querySelector('[data-rooms]');
  if(sw) sw.addEventListener('click', () => showRooms(true));
})();

/* 👥 방 멤버 (홈 표지 오른쪽 위): 닉네임 목록 · 내 닉네임 바꾸기 · 방장은 내보내기 */
(function membersButton(){
  const btn = document.querySelector('[data-members]'); if(!btn || !ROOM) return;
  const load = fresh => sosMembers(fresh).then(list => { btn.querySelector('b').textContent = list.length || '…'; return list; });
  // 방장이 나를 지목했으면, 앱을 열 때 한 번 물어봐요
  load(false).then(list => { if(ME.po && ME.po === ME.uid) askAccept(list); });
  btn.addEventListener('click', async () => open(await load(false)));
  const nickOf = (list, uid) => (list.find(m => m.uid === uid) || {}).nick || '';
  const esc = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ago = m => {
    const t = m.seen || m.joinedAt; if(!t || !t.toMillis) return '';
    const d = Math.floor((Date.now() - t.toMillis()) / 864e5);
    return d < 1 ? '오늘' : d < 2 ? '어제' : d < 30 ? `${d}일 전` : d < 365 ? `${Math.floor(d / 30)}달 전` : '1년 넘게 전';
  };
  const sleepy = m => { const t = m.seen || m.joinedAt; return !!(t && t.toMillis && Date.now() - t.toMillis() > OWNER_GONE_DAYS * 864e5); };
  async function becomeOwner(list, how){
    try{
      await sosBecomeOwner();
      typeof pushToast === 'function' && pushToast('👑 이제 내가 방장이에요');
      open(await load(true));
    }catch(err){ sosConfirm({icon: '😢', title: '방장이 되지 못했어요.', body: `<p>${how === 'take' ? '방장이 그 사이 다시 들어왔을 수 있어요. ' : ''}보안 규칙을 새로 게시했는지도 확인해 주세요.</p>`, ok: '확인'}); }
  }
  // 확인 창 안의 <b class="mem-n"> 에 닉네임을 글자로만 넣어요
  const confirmNick = (opts, nick) => { const p = sosConfirm(opts); document.querySelectorAll('.pop-back .mem-n').forEach(el => { el.textContent = nick; }); return p; };
  async function askAccept(list){
    const yes = await confirmNick({icon: '👑', title: '방장을 넘겨받을까요?', ok: '받기',
      body: '<p><b class="mem-n"></b> 님이<br>나에게 방장을 넘기려고 해요.</p><ul><li>멤버 관리·방 지우기를 내가 해요.</li><li>다른 멤버에게 다시 넘길 수 있어요.</li></ul>'}, nickOf(list, ME.ou) || '방장');
    if(yes) return becomeOwner(list, 'accept');
    const no = await sosConfirm({icon: '🙅', title: '거절할까요?', body: '<p>거절하면 방장은 그대로예요. 나중에 다시 받으려면 방장에게 다시 넘겨 달라고 해 주세요.</p>', ok: '거절하기'});
    if(no){ try{ await roomRef().update({po: firebase.firestore.FieldValue.delete()}); ME.po = ''; }catch(e){ await refreshOwner(); } }
  }
  // 넘기기 취소·거절이 거부되면(그 사이 수락됐거나 방장이 바뀜) 서버 기준으로 다시 맞춰요
  async function refreshOwner(){
    try{ const r = (await roomRef().get()).data() || {}; ME.ou = r.ou || ''; ME.po = r.po || ''; ME.owner = !!ME.ou && ME.ou === ME.uid; document.dispatchEvent(new Event('sos:owner')); }catch(e){}
    sosConfirm({icon: '👑', title: '방장 정보가 바뀌었어요.', body: '<p>그 사이 방장이 바뀌었거나 이미 처리됐어요. 멤버 목록을 다시 열어 확인해 주세요.</p>', ok: '확인'});
  }
  // 👑 방장 칸: 방장은 넘기기(또는 넘기는 중 취소), 지목받은 사람은 받기, 방장이 떠난 방이면 이어받기
  function ownerBox(list){
    if(ME.owner){
      if(ME.po) return `<div class="mem-own-box"><p><b>👑 방장 넘기는 중</b><br><small>${list.some(m => m.uid === ME.po) ? '<b class="mem-n" data-n="' + ME.po + '"></b> 님이 앱을 열면 받을지 물어봐요.<br>받기 전까지는 내가 방장이에요.' : '넘기려던 사람이 방에서 나갔어요.<br>취소하고 다른 사람에게 넘겨 주세요.'}</small></p><button type="button" class="mem-kick" data-po-cancel>넘기기 취소</button></div>`;
      return list.length > 1 ? '<button type="button" class="btn block mem-renick" data-handoff>👑 방장 넘기기</button>' : '';
    }
    if(ME.po && ME.po === ME.uid) return '<div class="mem-own-box"><p><b>👑 방장을 넘겨받을 차례예요</b><br><small>방장이 나를 다음 방장으로 골랐어요.</small></p><button type="button" class="mem-kick mem-allow" data-accept>방장 받기</button></div>';
    if(sosOwnerGone(list)) return `<div class="mem-own-box"><p>${list.some(m => m.uid === ME.ou) ? `<b>👑 방장이 오래 안 들어왔어요</b><br><small>${OWNER_GONE_DAYS}일 넘게 접속이 없어서<br>멤버 누구나 방장을 이어받을 수 있어요.</small>` : '<b>👑 방장이 방에서 나갔어요</b><br><small>멤버 누구나 방장을 이어받을 수 있어요.</small>'}</p><button type="button" class="mem-kick mem-allow" data-take>내가 방장 이어받기</button></div>`;
    return '';
  }
  function open(list){
    const cnt = {}; list.forEach(m => { cnt[m.nick] = (cnt[m.nick] || 0) + 1; });
    const joined = m => { const t = m.joinedAt && m.joinedAt.toDate ? m.joinedAt.toDate() : null; return t ? `${t.getMonth()+1}/${t.getDate()} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')} 들어옴` : ''; };
    const seenLine = m => ME.owner && m.uid !== ME.uid && ago(m) ? `<small class="mem-seen${sleepy(m) ? ' old' : ''}">${sleepy(m) ? '😴 ' : ''}마지막 접속 ${ago(m)}</small>` : '';
    const row = m => `<li data-uid="${m.uid}"><span class="mem-who"><span class="mem-nick"></span>${cnt[m.nick] > 1 ? `<small class="mem-dup">⚠️ 중복 · ${joined(m)}</small>` : ''}${seenLine(m)}</span>${m.uid === ME.ou ? '<span class="mem-tag own">👑 방장</span>' : ''}${m.uid === ME.po ? '<span class="mem-tag po">👑 넘기는 중</span>' : ''}${m.uid === ME.uid ? '<span class="mem-tag me">나</span>' : ''}`
      + (ME.owner && m.uid !== ME.uid ? `<button type="button" class="mem-kick" data-kick="${m.uid}">내보내기</button>` : '') + '</li>';
    const box = sosInfo({icon: '👥', title: `'${ROOM.name}' 멤버 ${list.length}명`,
      body: `<p class="who-tip">초대 링크 + 비밀번호로 들어온 사람만 보여요.</p>${Object.values(cnt).some(n => n > 1) ? `<p class="who-tip mem-dup-tip">⚠️ <b>중복</b>은 같은 사람이 다른 브라우저·앱으로 다시 들어온 기록일 수 있어요.${ME.owner ? ' 안 쓰는 쪽(보통 먼저 들어온 쪽)을 내보내기 해 주세요.' : ' 방장에게 정리를 부탁해 주세요.'}</p>` : ''}
        ${ownerBox(list)}
        <button type="button" class="btn block mem-renick" data-renick>✏️ 내 닉네임 바꾸기</button>
        <ul class="mem-list">${list.map(row).join('')}</ul>
        ${ME.owner ? '<div class="mem-out"></div>' : ''}`});
    // 방장: 내보낸 사람 목록 + 다시 들어올 수 있게 허용
    if(ME.owner) roomRef().collection('members').where('on', '==', false).get().then(q => {
      const out = box.querySelector('.mem-out'); if(!out || !q.size) return;
      out.innerHTML = '<p class="who-h">🚫 내보낸 사람 <small>(허용하면 초대 링크로 다시 들어올 수 있어요)</small></p><ul class="mem-list"></ul>';
      q.docs.forEach(d => { const li = document.createElement('li'); li.dataset.uid = d.id;
        const n = document.createElement('span'); n.className = 'mem-nick'; n.textContent = d.data().nick;   // 글자로만
        const b = document.createElement('button'); b.type = 'button'; b.className = 'mem-kick mem-allow'; b.dataset.allow = d.id; b.textContent = '다시 허용';
        li.append(n, b); out.querySelector('ul').appendChild(li); });
    }).catch(() => {});
    box.querySelectorAll('.mem-list li').forEach(li => { li.querySelector('.mem-nick').textContent = (list.find(m => m.uid === li.dataset.uid) || {}).nick || ''; });   // 닉네임은 글자로만
    box.querySelectorAll('.mem-n[data-n]').forEach(el => { el.textContent = nickOf(list, el.dataset.n); });
    box.addEventListener('click', async e => {
      const al = e.target.closest('[data-allow]');
      if(al){
        al.disabled = true;
        try{ await roomRef().collection('members').doc(al.dataset.allow).delete(); al.closest('li').remove(); pushToast && typeof pushToast === 'function' && pushToast('✅ 다시 들어올 수 있게 했어요. 초대 링크를 보내 주세요'); }
        catch(err){ al.disabled = false; sosConfirm({icon: '😢', title: '허용하지 못했어요.', body: '<p>보안 규칙을 새로 게시했는지 확인해 주세요.</p>', ok: '확인'}); }
        return;
      }
      const k = e.target.closest('[data-kick]');
      if(k){
        const m = list.find(x => x.uid === k.dataset.kick); box.remove();
        const yes = await sosConfirm({icon: '🚫', title: `'${m.nick}' 님을 내보낼까요?`, danger: true, ok: '내보내기',
          body: '<ul><li>이 사람은 이 방의 SOS·모임을 더 이상 볼 수 없어요.</li><li>방장이 <b>다시 허용</b>하기 전까지는 같은 휴대폰으로 다시 들어올 수 없어요.</li><li>앱을 지우고 다시 깔면 들어올 수 있으니, 꼭 막아야 하면 <b>새 방을 만들어 새 비밀번호</b>로 옮겨 주세요.</li></ul>'});
        if(!yes){ open(list); return; }
        try{
          await roomRef().collection('members').doc(m.uid).update({on: false});
          if(ME.po === m.uid){ try{ await roomRef().update({po: firebase.firestore.FieldValue.delete()}); ME.po = ''; }catch(err){} }   // 넘기려던 사람을 내보냈으면 넘기기도 취소
          open(await load(true));
        }
        catch(err){ sosConfirm({icon: '😢', title: '내보내지 못했어요.', body: '<p>잠시 뒤 다시 해 주세요.</p>', ok: '확인'}); }
        return;
      }
      if(e.target.closest('[data-handoff]')){
        box.remove();
        const others = list.filter(m => m.uid !== ME.uid);
        const pick = sosInfo({icon: '👑', title: '누구에게 넘길까요?',
          body: `<p class="who-tip">고른 사람이 앱에서 <b>받기</b>를 누르면 넘어가요.<br>공동육아를 졸업하기 전에 꼭 넘겨 주세요.</p><ul class="mem-list">${others.map(m => `<li data-uid="${m.uid}"><span class="mem-who"><span class="mem-nick"></span>${ago(m) ? `<small class="mem-seen">마지막 접속 ${ago(m)}</small>` : ''}</span><button type="button" class="mem-kick mem-allow" data-pick="${m.uid}">넘기기</button></li>`).join('')}</ul>`});
        pick.querySelectorAll('.mem-list li').forEach(li => { li.querySelector('.mem-nick').textContent = nickOf(list, li.dataset.uid); });
        pick.addEventListener('click', async ev => {
          const p = ev.target.closest('[data-pick]'); if(!p) return;
          const m = others.find(x => x.uid === p.dataset.pick); pick.remove();
          const yes = await confirmNick({icon: '👑', title: '방장을 넘길까요?', ok: '넘기기',
            body: '<p><b class="mem-n"></b> 님이<br>앱을 열면 받을지 물어봐요.</p><ul><li>받으면 그때부터 그 사람이 방장이에요.</li><li>받기 전에는 언제든 취소할 수 있어요.</li></ul>'}, m.nick);
          if(!yes){ open(list); return; }
          try{ await roomRef().update({po: m.uid}); ME.po = m.uid; open(await load(true)); }
          catch(err){ sosConfirm({icon: '😢', title: '넘기지 못했어요.', body: '<p>보안 규칙을 새로 게시했는지 확인해 주세요.</p>', ok: '확인'}); }
        });
        return;
      }
      if(e.target.closest('[data-po-cancel]')){
        try{ await roomRef().update({po: firebase.firestore.FieldValue.delete()}); ME.po = ''; box.remove(); open(list); }
        catch(err){ box.remove(); await refreshOwner(); }
        return;
      }
      if(e.target.closest('[data-accept]')){ box.remove(); return becomeOwner(list, 'accept'); }
      if(e.target.closest('[data-take]')){
        box.remove();
        const yes = await sosConfirm({icon: '👑', title: '내가 방장을 이어받을까요?', ok: '이어받기',
          body: '<ul><li>멤버 관리·방 지우기를 내가 해요.</li><li>예전 방장이 돌아와도 방장은 나예요.</li><li>필요하면 다시 넘겨 줄 수 있어요.</li></ul>'});
        if(yes) return becomeOwner(list, 'take');
        open(list); return;
      }
      if(e.target.closest('[data-renick]')){
        box.remove();
        const nick = await askNick('내 닉네임 바꾸기', '앞으로 SOS·모임·댓글에 새 닉네임이 보여요.', ME.nick);
        if(!nick || nick === ME.nick){ open(list); return; }
        try{
          await roomRef().collection('members').doc(ME.uid).update({nick: nick.slice(0, NICK_MAX)});
          ME.nick = nick.slice(0, NICK_MAX); saveNick(ME.nick); open(await load(true));
        }catch(err){ sosConfirm({icon: '😢', title: '바꾸지 못했어요.', body: '<p>잠시 뒤 다시 해 주세요.</p>', ok: '확인'}); }
      }
    });
  }
})();

/* 지난 기록 정리: 지울 날짜(expireAt)가 지난 모임(+댓글)·SOS를 지워요. 브라우저를 열 때 방마다 한 번만.
   지울 날짜가 없는 예전 기록은 서버 규칙상 지울 수 없어서 건너뛰어요. */
async function cleanupExpired(){
  const r = roomRef(); if(!r) return;
  const now = firebase.firestore.Timestamp.now(), del = ref => ref.delete().catch(() => {});
  const ops = await r.collection('opinions').where('expireAt', '<', now).limit(50).get();
  for(const d of ops.docs){
    const cs = await d.ref.collection('comments').get();
    await Promise.all(cs.docs.map(c => del(c.ref)));
    await del(d.ref);
  }
  const sos = await r.collection('sos').where('expireAt', '<', now).limit(50).get();
  await Promise.all(sos.docs.map(d => del(d.ref)));
}
if(TTL_READY && typeof ROOM !== 'undefined' && ROOM) window.addEventListener('load', () => {
  const k = 'sosCleaned:' + ROOM.roomId;
  try{ if(sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); }catch(e){}
  setTimeout(() => sosReady().then(ok => ok && cleanupExpired()).catch(() => {}), 3000);   // 화면을 먼저 그리고 나서 천천히
});
