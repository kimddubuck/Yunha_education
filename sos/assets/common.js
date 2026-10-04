/* 공동육아 SOS 공통 도구 — 모든 페이지에서 먼저 불러와요 */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const WEEK = ['일','월','화','수','목','금','토'];
const SLOTS = ['오전','점심','오후','저녁'];   // 예전 글의 시간대 (지금은 9시~20시 중에 골라요)
const HOURS = [9,10,11,12,13,14,15,16,17,18,19,20];   // 모임·SOS에서 고를 수 있는 시간
// 같은 날 모임 정렬용: '10시' → 10, 예전 시간대는 대략적인 시각으로
function slotOrder(s){ const m = /^(\d+)시$/.exec(s || ''); return m ? +m[1] : ({'오전':9.5,'점심':12.5,'오후':15.5,'저녁':18.5})[s] || 99; }

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
const NAV = [['index.html','home','🏠','홈'],['meet.html','meet','🙌','모임'],['play.html','play','🧸','놀이'],['safety.html','safety','🔒','개인정보']];
(function renderNav(){
  const nav = document.getElementById('siteNav'); if(!nav) return;
  const cur = nav.dataset.page;
  nav.innerHTML = `<a class="brand" href="index.html">공동육아 SOS 🆘</a><div class="nav-links">` +
    NAV.map(([href,key,icon,label]) => `<a href="${href}"${key===cur ? ' aria-current="page"' : ''}><span class="ti" aria-hidden="true">${icon}</span><span>${label}</span></a>`).join('') + '</div>' +
    '<button type="button" class="intro-btn" aria-label="공동육아 SOS 소개 다시 보기">📖 소개</button>';
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
  col.orderBy('createdAt','desc').limit(300).onSnapshot(snap => {
    const today = todayStr();
    cb(snap.docs.map(d => ({id:d.id, ...d.data()}))
      .filter(o => o.topic==='meet' && o.date && o.date >= today && !o.cancelled)
      .sort((a,b) => a.date.localeCompare(b.date) || slotOrder(a.slot) - slotOrder(b.slot)));
  }, () => cb(null));
}

// 홈 화면 설치(웹앱)용 서비스 워커 등록 — 캐시는 하지 않아요
if('serviceWorker' in navigator){ window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); }); }

/* ---------- 공용 달력 + 시간(9~20시) 고르기 ----------
   createPicker(root, {months, multi, whenText, dayBadge, hourBadge, onChange})
   - multi: true면 시간을 여러 개 고를 수 있어요 (state.slots, state.slot은 그중 가장 이른 시간)
   - root 안에 달력과 시간 버튼을 그려요. 지난 날은 막고, 이번 달부터 months달까지 넘겨 볼 수 있어요.
   - dayBadge(날짜) / hourBadge(날짜, '10시') 가 숫자를 돌려주면 작게 표시해요 (SOS 수 등). */
function createPicker(root, opts = {}){
  const months = opts.months || 3;
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
    root.querySelector('[data-nav="1"]').disabled = idx >= months - 1;
    const first = new Date(y, m-1, 1).getDay(), days = new Date(y, m, 0).getDate();
    let html = '';
    for(let i = 0; i < first; i++) html += '<span></span>';
    for(let d = 1; d <= days; d++){
      const v = ymd(y,m,d), dow = (first + d - 1) % 7, past = v < today, n = opts.dayBadge ? opts.dayBadge(v) : 0;
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

/* 🆘 공동육아 예약 도우미(🆘 SOS 예약): 혼자 독박하는 날짜와 시간(9~20시)을 골라 "이때 나 힘들어요"를 익명으로 보내요.
   저장: rooms/{방 열쇠}/sos/YYYY-MM-DD 문서의 h9 ~ h20 (그 날 그 시간에 SOS 보낸 사람 수).
   달력에는 날짜별 SOS 수, 시간 버튼에는 그 날 시간별 SOS 수가 보여요 → 보고 눈치게임으로 모임 만들기.
   기기당 같은 날짜·시간에는 한 번만. 홈에는 요약(sosSummary)만 보여 줘요. */
function sosWatch(cb){
  const r = roomRef(), col = r && r.collection('sos');
  if(!col){ cb(null, null); return null; }
  const start = new Date(); start.setDate(start.getDate() - 29);
  const startStr = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
  col.where(firebase.firestore.FieldPath.documentId(), '>=', startStr).onSnapshot(snap => {
    const data = {}; snap.docs.forEach(d => { data[d.id] = d.data(); }); cb(data, col);
  }, () => cb(null, col));
  return col;
}
const sosSentKey = () => 'copSosSent:' + (ROOM ? ROOM.roomId : '');   // 내 SOS 예약은 방마다 따로 기억
const sosDayTotal = v => v ? Object.keys(v).filter(k => /^h\d+$/.test(k)).reduce((a,k) => a + (v[k] || 0), 0) + (v.count || 0) : 0;

function sosInit(){
  const root = document.querySelector('[data-sos]'); if(!root) return;
  let data = {}, col = null, sent = [];
  try{ sent = JSON.parse(localStorage.getItem(sosSentKey()) || '[]'); }catch(e){}
  root.innerHTML = `<div class="sos-top"><p class="sos-h">🆘 공동육아 예약 도우미</p><p class="sos-count"></p></div>
    <p class="sos-sub">혼자 독박하는 날,<br>미용실 예약하듯 SOS를 예약해 두세요.<br><b>누가 예약했는지는 아무도 몰라요.</b><br>예약이 모이면, 용기 있는 한 명이<br>모임을 만들어 보는 거예요 💪</p>
    <div class="sos-picker"></div>
    <button type="button" class="sos-btn"></button>
    <div class="sos-mine" hidden></div>
    <p class="sos-hint">👀 SOS가 몰린 시간을 봤다면?<br>용기 내서 <a href="#new" class="sos-make">＋ 모임 만들기</a></p>`;
  const picker = createPicker(root.querySelector('.sos-picker'), {
    dayBadge: d => sosDayTotal(data[d]),
    hourBadge: (d, slot) => (data[d] || {})['h' + parseInt(slot)] || 0,
    multi: true,
    whenText: st => st.slots.length ? `${dayLabel(st.date)} ${st.slots.join('·')} 골랐어요` : `${dayLabel(st.date)} · 시간을 골라 주세요`,
    onChange: draw
  });
  function draw(){
    const st = picker.state, keys = st.slots.map(v => st.date + '-' + v), done = keys.length > 0 && keys.every(k => sent.includes(k));
    root.querySelector('.sos-count').innerHTML = `오늘 SOS <b>${sosDayTotal(data[todayStr()])}</b>명`;
    const b = root.querySelector('.sos-btn');
    b.disabled = !keys.length || done || !col;
    b.className = 'sos-btn' + (done ? ' done' : '');
    b.innerHTML = done ? '✅ SOS 예약했어요<small>🫂 아래 "내 SOS 예약"에서 취소할 수 있어요</small>'
      : keys.length ? `🆘 SOS 예약하기${keys.length > 1 ? ` (${keys.length}개)` : ''}<small>${dayLabel(st.date)} ${st.slots.join('·')}</small>` : '🆘 SOS 예약하기<small>날짜와 시간을 눌러 주세요 · 여러 개 OK</small>';
    // 내 SOS 예약 (이 휴대폰에서 한 것, 오늘 이후만) — 실수로 눌렀으면 여기서 취소
    const mine = sent.filter(k => k.slice(0,10) >= todayStr()).sort();
    const box = root.querySelector('.sos-mine'); box.hidden = !mine.length;
    box.innerHTML = '<p class="sos-mine-h">📌 내 SOS 예약 <small>(이 휴대폰에서만 보여요)</small></p>' + mine.map(k =>
      `<div class="sos-mine-row"><span>${dayLabel(k.slice(0,10))} ${k.slice(11)}</span><button type="button" class="sos-cancel" data-cancel="${k}">예약 취소</button></div>`).join('');
  }
  col = sosWatch((d, c) => { col = c; if(d) data = d; picker.render(); draw(); });
  root.querySelector('.sos-mine').addEventListener('click', async e => {
    const c = e.target.closest('[data-cancel]'); if(!c || !col) return;
    const key = c.dataset.cancel, date = key.slice(0,10), hk = 'h' + parseInt(key.slice(11));
    c.disabled = true; c.textContent = '취소 중…';
    try{
      if(((data[date] || {})[hk] || 0) > 0) await col.doc(date).update({[hk]: firebase.firestore.FieldValue.increment(-1)});
      sent = sent.filter(k => k !== key); try{ localStorage.setItem(sosSentKey(), JSON.stringify(sent)); }catch(err){}
      draw();
    }catch(err){ c.disabled = false; c.textContent = '다시 눌러 주세요'; }
  });
  draw();
  root.querySelector('.sos-btn').addEventListener('click', async () => {
    const st = picker.state; if(!st.slots.length || !col) return;
    root.querySelector('.sos-btn').disabled = true;
    // 고른 시간마다 하나씩 올려요 (규칙상 한 번에 한 시간씩), 이미 예약한 시간은 건너뛰어요
    for(const v of st.slots){
      const key = st.date + '-' + v; if(sent.includes(key)) continue;
      try{
        await col.doc(st.date).set({['h' + parseInt(v)]: firebase.firestore.FieldValue.increment(1)}, {merge:true});
        sent = [...sent, key].slice(-200); try{ localStorage.setItem(sosSentKey(), JSON.stringify(sent)); }catch(e){}
      }catch(err){ break; }
    }
    draw();
  });
  // 고른 날짜·시간을 그대로 모임 만들기에 넘겨요
  root.querySelector('.sos-make').addEventListener('click', e => {
    if(typeof openMeetForm === 'function'){ e.preventDefault(); openMeetForm(picker.state.date, picker.state.slot); }
  });
}

// 홈: 오늘의 SOS 예약 시간표(9~20시) + 다가오는 날의 예약 목록 + SOS 예약하러 가기
function sosSummary(){
  const box = document.querySelector('[data-sos-summary]'); if(!box) return;
  // 오늘부터 7일 중 하루를 골라 그날 시간표를 봐요
  const days = Array.from({length:7}, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  const name = i => i === 0 ? '오늘' : i === 1 ? '내일' : null;
  let sel = 0, last = null;
  const draw = data => {
    last = data;
    const keep = box.querySelector('.sos-tabs'), sx = keep ? keep.scrollLeft : 0;   // 다시 그려도 날짜 줄 스크롤 위치는 그대로
    const today = todayStr(), day = days[sel], t = (data && data[day]) || {};
    const label = name(sel) || dayLabel(day);
    const tabs = days.map((d, i) => { const n = data ? sosDayTotal(data[d]) : 0;
      return `<button type="button" class="sos-tab" data-sos-day="${i}" aria-pressed="${i===sel}">${name(i) || dayLabel(d).replace(' (', ' ').replace(')', '')}${n ? `<small>${n}</small>` : ''}</button>`; }).join('');
    const cells = HOURS.map(h => { const n = t['h'+h] || 0;
      return `<div class="sos-cell${n ? ' on' : ''}"><b>${h}시</b><span>${n}명</span></div>`; }).join('');
    const upcoming = data ? Object.keys(data).filter(d => d > today).sort().map(d => {
      const hs = HOURS.filter(h => data[d]['h'+h]).map(h => `<span class="sos-chip">${h}시 ${data[d]['h'+h]}명</span>`);
      return hs.length ? `<div class="sos-day"><b>${dayLabel(d)}</b><div>${hs.join('')}</div></div>` : '';
    }).filter(Boolean).slice(0,5) : [];
    box.innerHTML = `<div class="sos-top"><p class="sos-h">🆘 공동육아 예약 도우미</p><p class="sos-count">${label} SOS <b>${data ? sosDayTotal(t) : 0}</b>명</p></div>
      <div class="sos-tabs" role="group" aria-label="날짜 고르기">${tabs}</div>
      <p class="sos-sub"><b>📅 ${name(sel) ? label + '의' : label} SOS 예약</b>${name(sel) ? ` (${dayLabel(day)})` : ''}</p>
      <p class="sos-note">👀 시간별로 SOS를 예약한 사람 수예요.<br>예약은 아래 빨간 버튼에서 해요.</p>
      <div class="sos-today">${cells}</div>
      ${upcoming.length ? `<p class="sos-sub"><b>🗓 다가오는 SOS 예약</b></p><div class="sos-days">${upcoming.join('')}</div>` : ''}
      <a class="sos-btn" href="meet.html#sos">🆘 독박 예정? SOS 예약하기<small>날짜와 시간만 누르면 끝</small></a>`;
    box.querySelector('.sos-tabs').scrollLeft = sx;
  };
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-sos-day]'); if(!b) return;
    sel = +b.dataset.sosDay; draw(last);
  });
  draw(null);
  sosWatch(d => draw(d));
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

/* 모임 방 이름 · 친구 초대 · 방 바꾸기 (홈 표지) */
(function roomBar(){
  if(!ROOM) return;
  document.querySelectorAll('[data-room-name]').forEach(el => { el.textContent = ROOM.name; });
  const inv = document.querySelector('[data-invite]');
  if(inv) inv.addEventListener('click', async () => {
    const text = `[${ROOM.name}] 공동육아 SOS 🆘 방에 초대해요!\n독박 예정인 날 SOS 예약하고, 같이 모여요 💪\n${inviteUrl()}\n(비밀번호는 따로 알려드릴게요)`;
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
        body: '<p class="pop-warn">방을 지우면 기록도 다 사라져요.</p><ul><li>SOS 예약, 모임, 댓글, 추가한 놀이가 모두 지워져요.</li><li>방 사람 모두 더 이상 이 방에 들어올 수 없어요.</li><li><b>되돌릴 수 없어요.</b></li></ul>'});
      if(!yes) return;
      lv.disabled = true; lv.textContent = '지우는 중…';
      try{ await deleteRoom(); await sosConfirm({icon: '🗑', title: '방을 지웠어요.', body: '<p>기록도 모두 지웠어요.</p>', ok: '확인'}); location.href = 'index.html'; }
      catch(e){ lv.disabled = false; lv.textContent = '🗑 방 지우기'; sosConfirm({icon: '😢', title: '지우지 못했어요.', body: '<p>인터넷 연결을 확인하고 다시 눌러 주세요.</p>', ok: '확인'}); }
    });
  }
  const sw = document.querySelector('[data-rooms]');
  if(sw) sw.addEventListener('click', () => showRooms(true));
})();
