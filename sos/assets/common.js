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
const NAV = [['index.html','home','🏠','홈'],['meet.html','meet','🙌','SOS·모임'],['safety.html','safety','🔒','개인정보']];
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
function watchMeets(cb){
  const col = copCollection(); if(!col){ cb(null); return; }
  sosReady().then(ok => { if(!ok){ cb(null); return; } col.where('date', '>=', todayStr()).limit(100).onSnapshot(serverOnly(snap => {   // 오늘 이후 모임만 읽어요 (읽기 횟수 절약)
    const today = todayStr();
    cb(snap.docs.map(d => ({id:d.id, ...d.data()}))
      .filter(o => o.topic==='meet' && o.date && o.date >= today && !o.cancelled)
      .sort((a,b) => a.date.localeCompare(b.date) || slotOrder(a.slot) - slotOrder(b.slot)));
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
    const first = new Date(y, m-1, 1).getDay(), days = new Date(y, m, 0).getDate();
    let html = '';
    for(let i = 0; i < first; i++) html += '<span></span>';
    for(let d = 1; d <= days; d++){
      const v = ymd(y,m,d), dow = (first + d - 1) % 7, past = v < today || v > lastBookDay(), n = opts.dayBadge ? opts.dayBadge(v) : 0;
      const cls = ['cal-day', dow===0 ? 'sun' : dow===6 ? 'sat' : '', v===today ? 'today' : '', v===st.date ? 'on' : ''].join(' ');
      html += `<button type="button" class="${cls}" data-date="${v}" ${past ? 'disabled' : ''} aria-pressed="${v===st.date}">${d}<small>${n ? n + '명' : v===today ? '오늘' : ''}</small></button>`;
    }
    root.querySelector('.cal-grid').innerHTML = html;
    root.querySelector('.time-grid').innerHTML = HOURS.map(h => {
      const n = opts.hourBadge ? opts.hourBadge(st.date, h + '시') : 0;
      return `<button type="button" class="time-btn" data-slot="${h}시" aria-pressed="${opts.multi ? st.slots.includes(h+'시') : st.slot===h+'시'}">${h}:00${n ? `<small>${n}명</small>` : ''}</button>`;
    }).join('');
    root.querySelector('.picked-when').textContent = st.date ? (opts.whenText ? opts.whenText(st) : `${dayLabel(st.date)}${st.slot ? ' ' + st.slot : ''}`) : '';
  }
  root.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if(nav && !nav.disabled){ let {y,m} = st.month; m += +nav.dataset.nav; if(m < 1){ m = 12; y--; } if(m > 12){ m = 1; y++; } st.month = {y,m}; render(); return; }
    const d = e.target.closest('[data-date]');
    if(d && !d.disabled){ st.date = d.dataset.date; if(opts.multi){ st.slots = []; st.slot = null; } render(); opts.onChange && opts.onChange(st); return; }
    const t = e.target.closest('[data-slot]');
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
  if(!col){ cb(null, null); return null; }
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
// 그 시간에 SOS 보낸 사람 팝업
function showSosNames(day, h, v){
  const names = sosHourNames(v, h), old = (v && v['h' + h]) || 0;
  const body = (names.length ? `<div class="who-list">${names.map(n => `<span class="who-chip">${esc(n)}</span>`).join('')}</div>` : '')
    + (old ? `<p class="who-none">+ 예전 기록 ${old}명 (닉네임 없음)</p>` : '')
    + (!names.length && !old ? '<p class="who-none">아직 SOS가 없어요.</p>' : '')
    + '<p class="who-tip">💪 같은 시간에 SOS가 모였다면 모임을 열어 보세요!</p>';
  sosInfo({icon: '🆘', title: `${dayLabel(day)} ${h}시 SOS ${names.length + old}명`, body});
}

function sosInit(){
  const root = document.querySelector('[data-sos]'); if(!root) return;
  let data = {}, col = null, broken = false;
  root.innerHTML = `<div class="sos-top"><p class="sos-h">🆘 SOS 달력</p><p class="sos-count"></p></div>
    <p class="sos-sub">혼자 독박하는 날,<br>미리 SOS를 요청해 두세요. <small>(오늘부터 1주일까지)</small><br>SOS가 모이면, 용기 있는 한 명이<br>모임을 만들어 보는 거예요 💪</p>
    <div class="sos-picker"></div>
    <div class="sos-who"></div>
    <button type="button" class="sos-btn"></button>
    <div class="sos-mine" hidden></div>
    <p class="sos-hint">👀 SOS가 몰린 시간을 봤다면?<br>용기 내서 <a href="#new" class="sos-make"></a></p>`;
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
    // 고른 날짜에 누가 SOS를 보냈는지 (시간을 누르면 크게)
    const v = data[st.date], rows = HOURS.filter(h => sosHourCount(v, h));
    root.querySelector('.sos-who').innerHTML = rows.length ? `<p class="sos-who-h">👀 ${dayLabel(st.date)} SOS 보낸 사람 <small>눌러서 크게</small></p>`
      + rows.map(h => `<button type="button" class="sos-who-row" data-who="${h}"><b>${h}시</b><span></span></button>`).join('') : '';
    root.querySelectorAll('.sos-who-row').forEach(r => { const h = +r.dataset.who, old = (v && v['h' + h]) || 0;
      r.querySelector('span').textContent = [...sosHourNames(v, h), ...(old ? [`예전 ${old}명`] : [])].join(', '); });   // 닉네임은 글자로만
    // 달력에서 고른 날짜·시간을 그대로 넣어 모임 만들기 (아래 큰 '＋ 모임 만들기'는 빈 양식)
    root.querySelector('.sos-make').textContent = `🙌 ${dayLabel(st.date)}${st.slot ? ' ' + st.slot : ''}로 모임 만들기`;
    const b = root.querySelector('.sos-btn');
    b.disabled = !hs.length || done || !col || broken;
    b.className = 'sos-btn' + (done ? ' done' : '');
    b.innerHTML = broken ? '⚠️ 지금은 SOS 요청을 할 수 없어요<small>위의 안내를 확인해 주세요</small>' : done ? '✅ SOS 요청했어요<small>🫂 아래 "내 SOS 요청"에서 취소할 수 있어요</small>'
      : hs.length ? `🆘 SOS 요청하기${hs.length > 1 ? ` (${hs.length}개)` : ''}<small>${dayLabel(st.date)} ${st.slots.join('·')} · ${esc(ME.nick || '내 닉네임')}(으)로</small>` : '🆘 SOS 요청하기<small>날짜와 시간을 눌러 주세요 · 여러 개 OK</small>';
    // 내 SOS 요청 (오늘 이후) — 실수로 눌렀으면 여기서 취소
    const list = Object.keys(data).filter(d => d >= todayStr()).sort().flatMap(d => sosMine(data[d]).slice().sort((x, y) => x - y).map(h => [d, h]));
    const box = root.querySelector('.sos-mine'); box.hidden = !list.length;
    box.innerHTML = '<p class="sos-mine-h">📌 내 SOS 요청</p>' + list.map(([d, h]) =>
      `<div class="sos-mine-row"><span>${dayLabel(d)} ${h}시</span><button type="button" class="sos-cancel" data-cancel="${d}|${h}">요청 취소</button></div>`).join('');
  }
  const put = (day, hours) => hours.length
    ? col.doc(day).set({p: {[ME.uid]: {h: hours, n: ME.nick}}, ...ttl(day)}, {merge: true})
    : col.doc(day).update({['p.' + ME.uid]: firebase.firestore.FieldValue.delete()});
  col = sosWatch((d, c, err) => { col = c; if(d) data = d; if(err) broken = true; picker.render(); draw(); });
  root.addEventListener('click', e => { const w = e.target.closest('[data-who]'); if(w) showSosNames(picker.state.date, +w.dataset.who, data[picker.state.date]); });
  root.querySelector('.sos-mine').addEventListener('click', async e => {
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
      if(typeof pushSosCrowd === 'function') add.forEach(h => pushSosCrowd(st.date, h + '시', sosHourCount(before, h) + 1));
    }catch(err){ sosTrouble(err); broken = true; }
    draw();
  });
  // 고른 날짜·시간을 그대로 모임 만들기에 넘겨요
  root.querySelector('.sos-make').addEventListener('click', e => {
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
      <p class="sos-note">👀 시간별로 SOS를 요청한 사람 수예요.<br><b>숫자를 누르면 누가 보냈는지 보여요.</b></p>
      <div class="sos-today">${cells}</div>
      ${upcoming.length ? `<p class="sos-sub"><b>🗓 다가오는 SOS 요청</b></p><div class="sos-days">${upcoming.join('')}</div>` : ''}
      <a class="sos-btn" href="meet.html#sos">🆘 독박 예정? SOS 요청하기<small>날짜와 시간만 누르면 끝</small></a>`;
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

/* 모임 방 이름 · 친구 초대 · 방 바꾸기 (홈 표지) */
(function roomBar(){
  if(!ROOM) return;
  document.querySelectorAll('[data-room-name]').forEach(el => { el.textContent = ROOM.name; });
  const inv = document.querySelector('[data-invite]');
  if(inv) inv.addEventListener('click', async () => {
    const text = `[${ROOM.name}] 공동육아 SOS 🆘 방에 초대해요!\n독박 예정인 날 SOS 요청하고, 같이 모여요 💪\n${inviteUrl()}\n(비밀번호는 따로 알려드릴게요)`;
    if(navigator.share){ try{ await navigator.share({text}); return; }catch(e){ if(e.name === 'AbortError') return; } }
    try{ await navigator.clipboard.writeText(text); inv.textContent = '✅ 복사했어요! 단톡방에 붙여넣으세요'; setTimeout(() => { inv.textContent = '🔗 친구 초대하기'; }, 2500); }
    catch(e){ window.prompt('아래 글을 복사해서 단톡방에 붙여넣으세요.', text); }
  });
  // 🗑 방 지우기(방장) / 이 휴대폰에서 방 빼기(초대받은 사람)
  const lv = document.querySelector('[data-leave]');
  if(lv){
    // 방장(이 휴대폰에서 만든 방)이거나, 방장 열쇠 없이 만든 예전 방이면 지울 수 있어요
    let canDelete = !!ROOM.owner;
    const label = () => { lv.textContent = canDelete ? '🗑 방 지우기' : '🚪 이 휴대폰에서 방 빼기'; };
    label();
    const r = roomRef();
    if(r && !canDelete) r.get().then(d => { if(d.exists && !d.data().oh){ canDelete = true; label(); } }).catch(() => {});
    lv.addEventListener('click', async () => {
      if(!canDelete){
        const yes = await sosConfirm({icon: '🚪', title: `이 휴대폰에서 '${ROOM.name}' 방을 뺄까요?`,
          body: '<p>내 목록에서만 사라져요. 방과 기록은 그대로 있어요.</p><p>초대 링크와 비밀번호로 언제든 다시 들어올 수 있어요.</p>', ok: '방 빼기'});
        if(!yes) return;
        forgetRoom(ROOM.roomId); location.href = 'index.html'; return;
      }
      const yes = await sosConfirm({icon: '⚠️', title: `'${ROOM.name}' 방을 지울까요?`, danger: true, ok: '네, 지울게요',
        body: '<p class="pop-warn">방을 지우면 기록도 다 사라져요.</p><ul><li>SOS 요청, 모임, 댓글이 모두 지워져요.</li><li>방 사람 모두 더 이상 이 방에 들어올 수 없어요.</li><li><b>되돌릴 수 없어요.</b></li></ul>'});
      if(!yes) return;
      lv.disabled = true; lv.textContent = '지우는 중…';
      try{ await deleteRoom(); await sosConfirm({icon: '🗑', title: '방을 지웠어요.', body: '<p>기록도 모두 지웠어요.</p>', ok: '확인'}); location.href = 'index.html'; }
      catch(e){ lv.disabled = false; lv.textContent = '🗑 방 지우기'; sosConfirm({icon: '😢', title: '지우지 못했어요.', body: '<p>인터넷 연결을 확인하고 다시 눌러 주세요.</p>', ok: '확인'}); }
    });
  }
  const sw = document.querySelector('[data-rooms]');
  if(sw) sw.addEventListener('click', () => showRooms(true));
})();

/* 👥 방 멤버 (홈 표지 오른쪽 위): 닉네임 목록 · 내 닉네임 바꾸기 · 방장은 내보내기 */
(function membersButton(){
  const btn = document.querySelector('[data-members]'); if(!btn || !ROOM) return;
  const load = fresh => sosMembers(fresh).then(list => { btn.querySelector('b').textContent = list.length || '…'; return list; });
  load(false);
  btn.addEventListener('click', async () => open(await load(false)));
  function open(list){
    const row = m => `<li data-uid="${m.uid}"><span class="mem-nick"></span>${m.uid === ME.ou ? '<span class="mem-tag own">👑 방장</span>' : ''}${m.uid === ME.uid ? '<span class="mem-tag me">나</span>' : ''}`
      + (ME.owner && m.uid !== ME.uid ? `<button type="button" class="mem-kick" data-kick="${m.uid}">내보내기</button>` : '') + '</li>';
    const box = sosInfo({icon: '👥', title: `'${ROOM.name}' 멤버 ${list.length}명`,
      body: `<p class="who-tip">초대 링크 + 비밀번호로 들어온 사람만 보여요.</p><ul class="mem-list">${list.map(row).join('')}</ul>
        <button type="button" class="btn block mem-renick" data-renick>✏️ 내 닉네임 바꾸기</button>`});
    box.querySelectorAll('.mem-list li').forEach(li => { li.querySelector('.mem-nick').textContent = (list.find(m => m.uid === li.dataset.uid) || {}).nick || ''; });   // 닉네임은 글자로만
    box.addEventListener('click', async e => {
      const k = e.target.closest('[data-kick]');
      if(k){
        const m = list.find(x => x.uid === k.dataset.kick); box.remove();
        const yes = await sosConfirm({icon: '🚫', title: `'${m.nick}' 님을 내보낼까요?`, danger: true, ok: '내보내기',
          body: '<ul><li>이 사람은 이 방의 SOS·모임을 더 이상 볼 수 없어요.</li><li>같은 휴대폰으로는 다시 들어올 수 없어요.</li><li>앱을 지우고 다시 깔면 들어올 수 있으니, 꼭 막아야 하면 <b>새 방을 만들어 새 비밀번호</b>로 옮겨 주세요.</li></ul>'});
        if(!yes){ open(list); return; }
        try{ await roomRef().collection('members').doc(m.uid).update({on: false}); open(await load(true)); }
        catch(err){ sosConfirm({icon: '😢', title: '내보내지 못했어요.', body: '<p>잠시 뒤 다시 해 주세요.</p>', ok: '확인'}); }
        return;
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
