/* 🍚 식단: 우리 방 사람들의 이유식·유아식 사진
   - 방 사람만 봐요. 올린 사람과 방장만 지울 수 있어요. 올린 날부터 3일 뒤 자동으로 지워져요.
   - 사진은 휴대폰에서 작게 줄여(긴 쪽 360px, 한 장 약 20KB) 문서 안에 글자(data URL)로 넣어요.
   - 저장: rooms/{방 열쇠}/meals/{id} = {uid, n, img, slot, memo?, mo?, date, createdAt, expireAt} */
// 끼니 배지: 색으로 바로 구분 (아침=주황 해돋이 · 점심=파란 하늘 해 · 저녁=남색 달)
const MEAL_IC = {
  b: '<svg class="meal-badge" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="7" fill="#ff9a3c"/><path d="M6 16a6 6 0 0 1 12 0z" fill="#fff6d6"/><path d="M12 5v2.4M6.2 8.2l1.6 1.6M17.8 8.2l-1.6 1.6" stroke="#fff6d6" stroke-width="1.8" stroke-linecap="round"/><rect x="3.5" y="16.6" width="17" height="1.8" rx=".9" fill="#fff"/></svg>',
  l: '<svg class="meal-badge" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="7" fill="#3d8bfd"/><circle cx="12" cy="12" r="4.2" fill="#ffe14d"/><path d="M12 3.6v2M12 18.4v2M3.6 12h2M18.4 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18" stroke="#ffe14d" stroke-width="1.7" stroke-linecap="round"/></svg>',
  d: '<svg class="meal-badge" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="7" fill="#3b3f8f"/><path d="M14.5 5.5a6.8 6.8 0 1 0 4 11.6A7.6 7.6 0 0 1 14.5 5.5z" fill="#ffe9a8"/><circle cx="17.5" cy="7" r="1" fill="#fff"/><circle cx="19.2" cy="11" r=".7" fill="#fff"/></svg>'
};
const MEAL_SLOTS = [['b', '🌅 아침'], ['l', '☀️ 점심'], ['d', '🌙 저녁']];   // 간식은 빼고 끼니만 (서버 규칙에는 s1·s2가 남아 있어도 괜찮아요)
const MEAL_DAYS = 3;           // 3일치만 보고 3일 뒤 자동 삭제 (서버 규칙은 32일까지 허용)
const MY_MEALS = 'sosMyMeals'; // 내가 올린 사진 위치 (탈퇴·방 빼기 때 지우려고 기억)
const meal = { date: todayStr(), docs: [], unsub: null, onlyMine: false, broken: false, cc: {}, ccAt: {} };   // cc: 사진별 댓글 수 (2분마다 다시 세요)
// ❤️ 좋아요 수 · 💬 댓글 수 배지 (사진 왼쪽 위)
const mealBadges = d => `${likeCount(d) ? `<span class="meal-lk">❤️ ${likeCount(d)}</span>` : ''}${meal.cc[d.id] ? `<span class="meal-lk">💬 ${meal.cc[d.id]}</span>` : ''}`;
function mealPaintBadges(id){ const d = meal.docs.find(x => x.id === id), el = d && document.querySelector(`.meal-card[data-open="${id}"] .meal-bdg`); if(el) el.innerHTML = mealBadges(d); }
function mealCountComments(){   // 보이는 사진들의 댓글 수 (사진마다 댓글만큼 읽어요 · 3일 뒤 지워져서 적어요)
  meal.docs.forEach(d => { if(Date.now() - (meal.ccAt[d.id] || 0) < 120000) return; meal.ccAt[d.id] = Date.now();
    try{ mealCmts(d.id).get().then(q => { const n = q.size; if(meal.cc[d.id] !== n){ meal.cc[d.id] = n; mealPaintBadges(d.id); } }).catch(() => {}); }catch(e){} });
}
// 끼니 접기: 제목을 누르면 사진 줄을 접었다 폈다 해요 (이 휴대폰에 기억)
const MEAL_FOLD = 'sosMealFold';
const mealFold = (() => { try{ return new Set(JSON.parse(localStorage.getItem(MEAL_FOLD) || '[]')); }catch(e){ return new Set(); } })();
function toggleFold(slot){
  if(mealFold.has(slot)) mealFold.delete(slot); else mealFold.add(slot);
  try{ localStorage.setItem(MEAL_FOLD, JSON.stringify([...mealFold])); }catch(e){}
  renderMeal();
}
const $m = s => document.querySelector(s);

function addDays(ymd, n){ const [y, m, d] = ymd.split('-').map(Number), t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; }
const oldestDay = () => addDays(todayStr(), -MEAL_DAYS);
function rememberMine(id){ try{ const a = JSON.parse(localStorage.getItem(MY_MEALS) || '[]'); a.unshift({key: ROOM.key, id}); localStorage.setItem(MY_MEALS, JSON.stringify(a.slice(0, 300))); }catch(e){} }
function forgetMine(id){ try{ localStorage.setItem(MY_MEALS, JSON.stringify(JSON.parse(localStorage.getItem(MY_MEALS) || '[]').filter(x => x.id !== id))); }catch(e){} }


function fmtHm(ts){ if(!ts || !ts.toDate) return ''; const d = ts.toDate(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
const canDel = d => d.uid === ME.uid || ME.owner;

function renderMeal(){
  const t = todayStr();
  $m('#mealDay').textContent = meal.date === t ? `${dayLabel(meal.date)} · 오늘` : dayLabel(meal.date);
  $m('#mealPrev').disabled = meal.date <= oldestDay();
  $m('#mealNext').disabled = meal.date >= t;
  document.querySelectorAll('[data-mine]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mine === (meal.onlyMine ? '1' : '0'))));
  const box = $m('#mealSlots');
  if(meal.broken){ box.innerHTML = '<p class="hint meal-wait">🍚 식단 기능을 준비하고 있어요.<br>잠시 뒤 다시 열어 주세요.</p>'; return; }
  const list = meal.docs.filter(d => !meal.onlyMine || d.uid === ME.uid);
  const canAdd = meal.date >= oldestDay() && meal.date <= t;
  box.innerHTML = MEAL_SLOTS.map(([slot, label]) => {
    const ds = list.filter(d => d.slot === slot).sort((a, b) => ((a.createdAt && a.createdAt.seconds) || 9e9) - ((b.createdAt && b.createdAt.seconds) || 9e9));
    const cards = ds.map(d => `<figure class="meal-card" data-open="${d.id}">
        <img src="${d.img}" alt="${esc(d.n)}님의 ${esc(label.slice(3))} 사진" loading="lazy">
        ${canDel(d) ? `<button type="button" class="meal-del" data-del="${d.id}" aria-label="사진 지우기">✕</button>` : ''}
        <span class="meal-bdg">${mealBadges(d)}</span>
        <figcaption><b>${esc(d.n)}</b><span>${[d.mo != null ? `${d.mo}개월` : '', d.memo ? esc(d.memo) : ''].filter(Boolean).join(' · ') || '&nbsp;'}</span></figcaption></figure>`).join('');
    // ＋ 는 바로 카메라로 찍기, 🖼 앨범은 휴대폰 사진에서 고르기
    const add = !canAdd ? '' : ds.length ? `<button type="button" class="meal-add" data-add="${slot}" aria-label="${esc(label.slice(3))} 사진 찍어 올리기">📷<small>찍기</small></button>`
      : `<span class="meal-add2"><button type="button" class="meal-add1" data-add="${slot}">📷 찍기</button><button type="button" class="meal-add1 alb" data-alb="${slot}">🖼 앨범</button></span>`;
    const alb = canAdd && ds.length ? `<button type="button" class="meal-alb" data-alb="${slot}">🖼 앨범에서</button>` : '';
    const body = ds.length ? `<div class="meal-row">${add}${cards}</div>` : (add || '<p class="hint meal-none">아직 사진이 없어요</p>');
    if(!ds.length) return `<section class="meal-slot empty"><h3>${MEAL_IC[slot]}<span>${label.slice(3)}</span></h3>${body}</section>`;
    const shut = mealFold.has(slot);
    return `<section class="meal-slot${shut ? ' shut' : ''}"><h3><button type="button" class="meal-fold" data-fold="${slot}" aria-expanded="${!shut}">${MEAL_IC[slot]}<span>${label.slice(3)}</span> <small>${ds.length}장</small><i aria-hidden="true">${shut ? '▸ 펼치기' : '▾'}</i></button>${shut ? '' : alb}</h3>${shut ? '' : body}</section>`;
  }).join('');
  setTimeout(mealCountComments, 0);   // 💬 댓글 수
}

function watchDay(){
  if(meal.unsub){ meal.unsub(); meal.unsub = null; }
  meal.docs = []; renderMeal();
  sosReady().then(ok => {
    if(!ok){ meal.broken = true; renderMeal(); return; }
    meal.unsub = roomRef().collection('meals').where('date', '==', meal.date).onSnapshot(q => {
      meal.broken = false;
      const now = Date.now();
      meal.docs = q.docs.map(d => ({id: d.id, ...d.data()})).filter(d => !d.expireAt || d.expireAt.toMillis() > now);
      renderMeal();
      if(meal.goOpen && meal.docs.some(d => d.id === meal.goOpen)){ const g = meal.goOpen; meal.goOpen = null; openPhoto(g); }
    }, err => { meal.broken = true; renderMeal(); if(typeof sosTrouble === 'function' && err && err.code !== 'permission-denied') sosTrouble(err); });
  });
}

/* 사진 올리기 창: 미리보기 · 한 줄 메모 · 아기 개월수(기억해 둬요) */
function askUpload(slot, img){
  const label = (MEAL_SLOTS.find(s => s[0] === slot) || ['', ''])[1];
  let birth = ''; try{ birth = localStorage.getItem('sosBabyBirth') || ''; }catch(e){}   // 'YYYY-MM' 한 번 정하면 계속 써요
  const [by, bm] = birth ? birth.split('-').map(Number) : [0, 0], thisY = new Date().getFullYear();
  const yOpts = Array.from({length: 7}, (_, i) => thisY - i).map(y => `<option value="${y}"${y === by ? ' selected' : ''}>${y}년</option>`).join('');
  const mOpts = Array.from({length: 12}, (_, i) => i + 1).map(m => `<option value="${m}"${m === bm ? ' selected' : ''}>${m}월생</option>`).join('');
  const box = sosInfo({icon: '', title: `${dayLabel(meal.date)} ${label}`, body: `
    <img class="meal-prev" src="${img}" alt="올릴 사진 미리보기">
    <p class="hint meal-size">${Math.round(img.length * 0.75 / 1024)}KB로 줄였어요</p>
    <input class="meal-in" id="mealMemo" maxlength="40" placeholder="메모 (선택) 예: 소고기죽">
    <div class="meal-mo">👶 <select id="mealBy"><option value="">생년 (선택)</option>${yOpts}</select><select id="mealBm"><option value="">월</option>${mOpts}</select></div>
    <p class="hint meal-age" id="mealAge"></p>
    <p class="hint meal-rule">📷 <b>음식만</b> 나오게 찍어 주세요 <span class="nw">(아이 얼굴·손·집 안 X)</span><br><span class="nw">👥 우리 방 사진은</span> <span class="nw">🗑 3일 뒤 자동 삭제</span></p>
    <p class="hint meal-pool">🥣 이 식단(사진·메뉴·개월수)은 <b>닉네임 없이</b> <span class="nw">독박육아.com 유아식 모음에</span> <span class="nw">쌓여요.</span> <span class="nw">운영자가 확인한 것만 올라가요.</span></p>
    <label class="meal-pool-off"><input type="checkbox" id="mealPoolOff"> 이번 식단은 모음에 넣지 않기</label>
    <button type="button" class="btn primary block" id="mealSend">올리기</button>`});
  const ageOf = () => {
    const y = +box.querySelector('#mealBy').value, m = +box.querySelector('#mealBm').value;
    if(!y || !m) return null;
    const [dy, dm] = meal.date.split('-').map(Number), mo = (dy - y) * 12 + (dm - m);
    return mo >= 0 && mo <= 72 ? mo : null;
  };
  const showAge = () => { const a = ageOf(); box.querySelector("#mealAge").innerHTML = a == null ? '한 번 정하면 다음부터 자동으로 들어가요' : `→ ${dayLabel(meal.date)} 기준 <b>${a}개월</b> · 다음부터 자동`; };
  box.querySelectorAll('#mealBy,#mealBm').forEach(el => el.addEventListener('change', showAge)); showAge();
  box.querySelector('#mealSend').addEventListener('click', async e => {
    const b = e.currentTarget; if(b.disabled) return; b.disabled = true; b.textContent = '올리는 중…';
    const memo = box.querySelector('#mealMemo').value.trim().slice(0, 40), age = ageOf();
    const yv = box.querySelector('#mealBy').value, mv = box.querySelector('#mealBm').value;
    try{ if(yv && mv) localStorage.setItem('sosBabyBirth', `${yv}-${String(mv).padStart(2, '0')}`); }catch(err){}
    try{
      if(!(await sosReady())) throw new Error('offline');
      const ref = roomRef().collection('meals').doc();
      const data = {uid: ME.uid, n: ME.nick, img, slot, date: meal.date,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        expireAt: firebase.firestore.Timestamp.fromMillis(Date.now() + MEAL_DAYS * 864e5)};
      if(memo) data.memo = memo;
      if(age != null) data.mo = age;   // 생년월로 계산한 그날 개월수
      await ref.set(data);
      rememberMine(ref.id);
      // 🥣 유아식 모음: 닉네임·uid 없이 사진·메뉴·개월수만 사본으로 (운영자가 확인한 것만 독박육아.com 에 올라가요). 실패해도 식단 올리기는 그대로
      if(!box.querySelector('#mealPoolOff').checked){
        const pool = {img, slot, date: meal.date, createdAt: firebase.firestore.FieldValue.serverTimestamp()};
        if(memo) pool.memo = memo; if(age != null) pool.mo = age;
        sosDb().collection('mealpool').doc(ref.id).set(pool).then(() => markPoolSent(ref.id)).catch(() => {});
      }
      box.remove();
      if(typeof pushMealNew === 'function') pushMealNew(ref.id, (MEAL_SLOTS.find(s => s[0] === slot) || ['', '식단'])[1].replace(/^\S+\s/, ''), memo);   // 🔔 방 사람들에게
      if(typeof pushToast === 'function') pushToast('🍚 올렸어요! 우리 방 사람들이 볼 수 있어요');
    }catch(err){ b.disabled = false; b.textContent = '⚠️ 못 올렸어요 · 다시 누르기'; if(typeof sosTrouble === 'function') sosTrouble(err); }
  });
}

// 💬 사진 댓글: rooms/{방}/meals/{사진}/comments — 올린 사람에게 알림, 답글은 그 댓글 쓴 사람에게 알림
//   사진이 지워지면(3일 뒤 포함) 댓글도 함께 지워져요. 내 댓글은 탈퇴할 때 지우려고 이 휴대폰에 위치를 기억해요
const MY_MCMTS = 'sosMyMealCmts';
function rememberMyCmt(mid, cid){ try{ const a = JSON.parse(localStorage.getItem(MY_MCMTS) || '[]'); a.push({key: ROOM.key, mid, cid}); localStorage.setItem(MY_MCMTS, JSON.stringify(a.slice(-300))); }catch(e){} }
const mealCmts = id => roomRef().collection('meals').doc(id).collection('comments');

const POOL_SENT = 'sosPoolSent';
const poolSent = id => { try{ return JSON.parse(localStorage.getItem(POOL_SENT) || '[]').includes(id); }catch(e){ return false; } };
const markPoolSent = id => { try{ const a = JSON.parse(localStorage.getItem(POOL_SENT) || '[]'); a.push(id); localStorage.setItem(POOL_SENT, JSON.stringify(a.slice(-300))); }catch(e){} };
function openPhoto(id){
  const d = meal.docs.find(x => x.id === id); if(!d) return;
  const label = (MEAL_SLOTS.find(s => s[0] === d.slot) || ['', ''])[1];
  const box = sosInfo({icon: '', title: `${d.n} · ${label}`, body: `<img class="meal-big" src="${d.img}" alt="">
    <p class="meal-meta">${dayLabel(d.date)} ${fmtHm(d.createdAt)}${d.mo != null ? ` · 👶 ${d.mo}개월` : ''}</p>
    <div class="meal-line"><p class="meal-memo cp"></p><span class="meal-like"></span></div>
    <div class="comments meal-cmts"><ul class="comment-list"><li class="hint">댓글을 불러오는 중…</li></ul>
      <p class="reply-chip" hidden><span></span><button type="button" data-mc-cancel>취소</button></p>
      <form class="comment-form"><input type="text" maxlength="300" placeholder="댓글 달기 (예: 레시피 궁금해요!)" aria-label="댓글"><button class="btn" type="submit">달기</button></form></div>
    ${d.uid === ME.uid ? `<button type="button" class="btn block meal-pool-send" data-pool-send>${poolSent(d.id) ? '✅ 유아식 모음에 보냈어요' : '🥣 이 식단 유아식 모음에 보내기'}</button>` : ''}
    ${canDel(d) ? `<button type="button" class="btn danger block" data-del="${d.id}">🗑 이 사진 지우기${d.uid !== ME.uid ? ' (방장)' : ''}</button>` : ''}`});
  if(d.memo) box.querySelector('.meal-memo').textContent = d.memo;
  // 🥣 내가 올린 식단을 직접 유아식 모음에 보내요 (모음 안내가 생기기 전에 올린 식단도 이렇게 보낼 수 있어요)
  const ps = box.querySelector('[data-pool-send]');
  if(ps) ps.addEventListener('click', async () => {
    if(poolSent(d.id)) return; ps.disabled = true; ps.textContent = '보내는 중…';
    const pool = {img: d.img, slot: d.slot, date: d.date, createdAt: firebase.firestore.FieldValue.serverTimestamp()};
    if(d.memo) pool.memo = d.memo; if(d.mo != null) pool.mo = d.mo;
    try{ await sosDb().collection('mealpool').doc(d.id).set(pool); markPoolSent(d.id); ps.textContent = '✅ 유아식 모음에 보냈어요'; }
    catch(err){ if(err && err.code === 'permission-denied'){ markPoolSent(d.id); ps.textContent = '✅ 이미 보낸 식단이에요'; } else { ps.disabled = false; ps.textContent = '⚠️ 못 보냈어요 · 다시 누르기'; } }
  });
  // ❤️ 좋아요 (v17) + 누가 눌렀는지 ('가영맘님 외 2명이 좋아해요'). 누를 때마다 그 줄도 다시 그려요
  const who = () => { box.querySelector('.like-who')?.remove(); const lw = likeWho(d); if(lw) box.querySelector('.meal-line').insertAdjacentElement('afterend', lw); };
  box.querySelector('.meal-like').appendChild(likeBtn(d, ME.uid, roomRef().collection('meals').doc(d.id), {val: ME.nick, after: who})); who();
  const ul = box.querySelector('.comment-list'), chip = box.querySelector('.reply-chip'), form = box.querySelector('.comment-form');
  const at = typeof attachUI === 'function' ? attachUI(form, {compact: true}) : null;
  const inp = form.querySelector('textarea, input[type="text"]');   // attachUI가 여러 줄 칸으로 바꾼 뒤에 잡아요
  let list = [], replyTo = null;
  const draw = () => {
    ul.innerHTML = '';
    const isRoot = c => !c.to || !list.some(x => x.id === c.to);
    const ordered = []; list.filter(isRoot).forEach(r => { ordered.push(r); list.filter(x => x.to === r.id).forEach(x => ordered.push(x)); });
    ordered.forEach(c => {
      const li = document.createElement('li'); if(!isRoot(c)) li.className = 'reply';
      const n = document.createElement('b'); n.className = 'comment-nick'; n.textContent = c.n || '';
      const t = document.createElement('span'); t.className = 'cp'; t.textContent = c.text;
      const w = document.createElement('small'); w.textContent = fmtHm(c.createdAt);
      const rb = document.createElement('button'); rb.type = 'button'; rb.className = 'reply-btn'; rb.dataset.mcReply = c.id; rb.textContent = '↪ 답글';
      li.append(n, t, w, likeBtn(c, ME.uid, mealCmts(d.id).doc(c.id), {val: ME.nick, cls: 'mini'}));   // ❤️ 댓글 좋아요 (v18)
      const lw = likeWhoMini(c); if(lw) li.appendChild(lw); li.appendChild(rb);   // 누가 눌렀는지
      if(typeof attachView === 'function'){ const av = attachView(c); if(av) li.appendChild(av); }
      if(c.uid === ME.uid || ME.owner){ const x = document.createElement('span'); x.className = 'comment-act';
        x.innerHTML = `<button type="button" data-mc-del="${c.id}">${c.uid === ME.uid ? '삭제' : '삭제(방장)'}</button>`; li.appendChild(x); }
      ul.appendChild(li);
    });
    if(!list.length){ const e = document.createElement('li'); e.className = 'hint'; e.textContent = '첫 댓글을 남겨 보세요 💬'; ul.appendChild(e); }
    chip.hidden = !replyTo; if(replyTo) chip.querySelector('span').textContent = `↪ ${replyTo.n || '이웃'}님에게 답글`;
    inp.placeholder = replyTo ? '답글 달기' : '댓글 달기…';
  };
  const unsub = mealCmts(id).orderBy('createdAt').limit(100).onSnapshot(q => {
    if(!box.isConnected){ unsub(); return; }
    list = q.docs.map(x => ({id: x.id, ...x.data()})); draw();
    meal.cc[id] = list.length; meal.ccAt[id] = Date.now(); mealPaintBadges(id);   // 💬 배지도 바로 맞춰요
  }, () => { ul.innerHTML = '<li class="hint">댓글을 불러오지 못했어요.</li>'; });
  const watch = setInterval(() => { if(!box.isConnected){ unsub(); clearInterval(watch); } }, 1000);
  box.addEventListener('click', async e => {
    const b = e.target.closest('[data-del]'); if(b){ box.remove(); delPhoto(b.dataset.del); return; }
    const r = e.target.closest('[data-mc-reply]');
    if(r){ const c = list.find(x => x.id === r.dataset.mcReply);
      if(c){ const root = c.to && list.some(x => x.id === c.to) ? c.to : c.id; replyTo = {root, uid: c.uid, n: c.n}; draw(); inp.focus(); } return; }
    if(e.target.closest('[data-mc-cancel]')){ replyTo = null; draw(); return; }
    const del = e.target.closest('[data-mc-del]');
    if(del && confirm('이 댓글을 지울까요?')){ del.disabled = true; try{ await mealCmts(id).doc(del.dataset.mcDel).delete(); }catch(err){ del.disabled = false; if(typeof sosTrouble === 'function') sosTrouble(err); } }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = inp.value.trim();
    let atv = {}; try{ atv = at ? at.get() : {}; }catch(err){ if(err.code === 'bad-url'){ if(typeof pushToast === 'function') pushToast('🔗 링크는 https://로 시작하는 주소만 넣을 수 있어요'); return; } throw err; }
    if(!text && !atv.img) return;   // 글이 없어도 사진만 있으면 올라가요 (v19)
    const rt = replyTo, btn = form.querySelector('button[type="submit"]'); btn.disabled = true;
    try{
      const ref = mealCmts(id).doc();
      await ref.set({text, ...atv, uid: ME.uid, n: ME.nick, ...(rt ? {to: rt.root} : {}), expireAt: d.expireAt, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
      rememberMyCmt(id, ref.id); inp.value = ''; if(inp._grow) inp._grow(); replyTo = null; if(at) at.clear(); draw();
      // 🔔 알림: 사진 올린 사람에게 + 답글이면 그 댓글 쓴 사람에게 (같은 사람이면 한 번만)
      if(typeof pushMealComment === 'function'){
        if(rt) pushMealComment(d, rt.uid, text || '📷 사진', true);
        if(!rt || rt.uid !== d.uid) pushMealComment(d, d.uid, text || '📷 사진', false);
      }
    }catch(err){ if(typeof sosTrouble === 'function') sosTrouble(err); else alert('댓글을 저장하지 못했어요'); }
    btn.disabled = false;
  });
}

// 사진 지우기: 댓글부터 지우고 사진을 지워요
async function delPhotoNow(id){
  const cs = await mealCmts(id).get().catch(() => ({docs: []}));
  await Promise.all(cs.docs.map(c => c.ref.delete().catch(() => {})));
  await roomRef().collection('meals').doc(id).delete();
}
async function delPhoto(id){
  const d = meal.docs.find(x => x.id === id); if(!d || !canDel(d)) return;
  if(!confirm(d.uid === ME.uid ? '이 사진을 지울까요? 댓글도 함께 지워져요.' : `방장으로서 ${d.n}님의 사진을 지울까요? 댓글도 함께 지워져요.`)) return;
  try{ await delPhotoNow(id); forgetMine(id); if(typeof pushToast === 'function') pushToast('🗑 지웠어요'); }
  catch(err){ if(typeof sosTrouble === 'function') sosTrouble(err); }
}

// 🔔 댓글 알림을 눌러 왔으면 (meal.html?go=p사진아이디) 그 날짜로 가서 사진을 열어요
async function mealGoPhoto(){
  if(typeof SOS_GO === 'undefined' || !/^p[A-Za-z0-9]{1,40}$/.test(SOS_GO)) return;
  const id = SOS_GO.slice(1); SOS_GO = '';
  try{
    if(!(await sosReady())) return;
    const snap = await roomRef().collection('meals').doc(id).get(); if(!snap.exists) { if(typeof pushToast === 'function') pushToast('사진이 지워졌어요'); return; }
    const dt = snap.data().date; if(dt && dt !== meal.date){ meal.date = dt; watchDay(); }
    meal.goOpen = id;
    if(meal.docs.some(d => d.id === id)){ meal.goOpen = null; openPhoto(id); }
  }catch(e){}
}

(function initMeal(){
  if(!$m('#mealSlots')) return;
  const file = $m('#mealFile'), album = $m('#mealAlbum'); let pendingSlot = 'l';
  $m('#mealSlots').addEventListener('click', e => {
    const fd = e.target.closest('[data-fold]'); if(fd){ toggleFold(fd.dataset.fold); return; }
    const del = e.target.closest('.meal-del'); if(del){ e.stopPropagation(); delPhoto(del.dataset.del); return; }
    const add = e.target.closest('[data-add]'); if(add){ pendingSlot = add.dataset.add; file.value = ''; file.click(); return; }
    const al = e.target.closest('[data-alb]'); if(al){ pendingSlot = al.dataset.alb; album.value = ''; album.click(); return; }
    const card = e.target.closest('[data-open]'); if(card) openPhoto(card.dataset.open);
  });
  const picked = async inp => {
    const f = inp.files && inp.files[0]; if(!f) return;
    try{ askUpload(pendingSlot, await shrinkPhoto(f)); }
    catch(e){ if(typeof pushToast === 'function') pushToast('⚠️ 이 사진은 읽지 못했어요. 다른 사진으로 해 주세요'); }
  };
  file.addEventListener('change', () => picked(file));
  album.addEventListener('change', () => picked(album));
  $m('#mealPrev').addEventListener('click', () => { if(meal.date > oldestDay()){ meal.date = addDays(meal.date, -1); watchDay(); } });
  $m('#mealNext').addEventListener('click', () => { if(meal.date < todayStr()){ meal.date = addDays(meal.date, 1); watchDay(); } });
  document.querySelectorAll('[data-mine]').forEach(b => b.addEventListener('click', () => { meal.onlyMine = b.dataset.mine === '1'; renderMeal(); }));
  watchDay();
  mealGoPhoto();
})();
