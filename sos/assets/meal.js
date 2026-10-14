/* 🍚 식단: 우리 방 사람들의 이유식·유아식 사진
   - 방 사람만 봐요. 올린 사람과 방장만 지울 수 있어요. 올린 날부터 1주일 뒤 자동으로 지워져요.
   - 사진은 휴대폰에서 작게 줄여(긴 쪽 360px, 한 장 약 20KB) 문서 안에 글자(data URL)로 넣어요.
   - 저장: rooms/{방 열쇠}/meals/{id} = {uid, n, img, slot, memo?, mo?, date, createdAt, expireAt} */
// 끼니 배지: 색으로 바로 구분 (아침=주황 해돋이 · 점심=파란 하늘 해 · 저녁=남색 달)
const MEAL_IC = {
  b: '<svg class="meal-badge" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="7" fill="#ff9a3c"/><path d="M6 16a6 6 0 0 1 12 0z" fill="#fff6d6"/><path d="M12 5v2.4M6.2 8.2l1.6 1.6M17.8 8.2l-1.6 1.6" stroke="#fff6d6" stroke-width="1.8" stroke-linecap="round"/><rect x="3.5" y="16.6" width="17" height="1.8" rx=".9" fill="#fff"/></svg>',
  l: '<svg class="meal-badge" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="7" fill="#3d8bfd"/><circle cx="12" cy="12" r="4.2" fill="#ffe14d"/><path d="M12 3.6v2M12 18.4v2M3.6 12h2M18.4 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18" stroke="#ffe14d" stroke-width="1.7" stroke-linecap="round"/></svg>',
  d: '<svg class="meal-badge" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="7" fill="#3b3f8f"/><path d="M14.5 5.5a6.8 6.8 0 1 0 4 11.6A7.6 7.6 0 0 1 14.5 5.5z" fill="#ffe9a8"/><circle cx="17.5" cy="7" r="1" fill="#fff"/><circle cx="19.2" cy="11" r=".7" fill="#fff"/></svg>'
};
const MEAL_SLOTS = [['b', '🌅 아침'], ['l', '☀️ 점심'], ['d', '🌙 저녁']];   // 간식은 빼고 끼니만 (서버 규칙에는 s1·s2가 남아 있어도 괜찮아요)
const MEAL_DAYS = 7;           // 1주일치만 보고 1주일 뒤 자동 삭제 (서버 규칙은 32일까지 허용)
const MY_MEALS = 'sosMyMeals'; // 내가 올린 사진 위치 (탈퇴·방 빼기 때 지우려고 기억)
const meal = { date: todayStr(), docs: [], unsub: null, onlyMine: false, broken: false };
const $m = s => document.querySelector(s);

function addDays(ymd, n){ const [y, m, d] = ymd.split('-').map(Number), t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; }
const oldestDay = () => addDays(todayStr(), -MEAL_DAYS);
function rememberMine(id){ try{ const a = JSON.parse(localStorage.getItem(MY_MEALS) || '[]'); a.unshift({key: ROOM.key, id}); localStorage.setItem(MY_MEALS, JSON.stringify(a.slice(0, 300))); }catch(e){} }
function forgetMine(id){ try{ localStorage.setItem(MY_MEALS, JSON.stringify(JSON.parse(localStorage.getItem(MY_MEALS) || '[]').filter(x => x.id !== id))); }catch(e){} }

/* 사진 줄이기: 긴 쪽 360px · WebP(안 되면 JPEG) · 60KB 넘으면 더 줄여요 */
async function shrinkPhoto(file){
  let src = null;
  try{ src = await createImageBitmap(file); }
  catch(e){ src = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); }); }
  let max = 360, q = 0.6;
  for(let k = 0; k < 6; k++){
    const w = src.width, h = src.height, s = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    let u = c.toDataURL('image/webp', q);
    if(!u.startsWith('data:image/webp')) u = c.toDataURL('image/jpeg', q);   // 아이폰 사파리 일부는 WebP로 못 만들어요
    if(u.length <= 60000) return u;
    max = Math.round(max * 0.85); q = Math.max(0.4, q - 0.08);
  }
  throw new Error('too-big');
}

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
        <figcaption><b>${esc(d.n)}</b><span>${[d.mo != null ? `${d.mo}개월` : '', d.memo ? esc(d.memo) : ''].filter(Boolean).join(' · ') || '&nbsp;'}</span></figcaption></figure>`).join('');
    const add = !canAdd ? '' : ds.length ? `<button type="button" class="meal-add" data-add="${slot}" aria-label="${esc(label.slice(3))} 사진 더 올리기">＋<small>사진</small></button>`
      : `<button type="button" class="meal-add1" data-add="${slot}">＋ 사진 올리기</button>`;
    const body = ds.length ? `<div class="meal-row">${add}${cards}</div>` : (add || '<p class="hint meal-none">아직 사진이 없어요</p>');
    return `<section class="meal-slot${ds.length ? '' : ' empty'}"><h3>${MEAL_IC[slot]}<span>${label.slice(3)}</span>${ds.length ? ` <small>${ds.length}장</small>` : ''}</h3>${body}</section>`;
  }).join('');
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
    <p class="hint meal-rule">📷 <b>음식만</b> 나오게 찍어 주세요 <span class="nw">(아이 얼굴·집 안 X)</span><br><span class="nw">👥 우리 방만 봐요</span> · <span class="nw">🗑 1주일 뒤 자동 삭제</span></p>
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
      box.remove();
      if(typeof pushToast === 'function') pushToast('🍚 올렸어요! 우리 방 사람들이 볼 수 있어요');
    }catch(err){ b.disabled = false; b.textContent = '⚠️ 못 올렸어요 · 다시 누르기'; if(typeof sosTrouble === 'function') sosTrouble(err); }
  });
}

// 💬 사진 댓글: rooms/{방}/meals/{사진}/comments — 올린 사람에게 알림, 답글은 그 댓글 쓴 사람에게 알림
//   사진이 지워지면(1주일 뒤 포함) 댓글도 함께 지워져요. 내 댓글은 탈퇴할 때 지우려고 이 휴대폰에 위치를 기억해요
const MY_MCMTS = 'sosMyMealCmts';
function rememberMyCmt(mid, cid){ try{ const a = JSON.parse(localStorage.getItem(MY_MCMTS) || '[]'); a.push({key: ROOM.key, mid, cid}); localStorage.setItem(MY_MCMTS, JSON.stringify(a.slice(-300))); }catch(e){} }
const mealCmts = id => roomRef().collection('meals').doc(id).collection('comments');

function openPhoto(id){
  const d = meal.docs.find(x => x.id === id); if(!d) return;
  const label = (MEAL_SLOTS.find(s => s[0] === d.slot) || ['', ''])[1];
  const box = sosInfo({icon: '', title: `${d.n} · ${label}`, body: `<img class="meal-big" src="${d.img}" alt="">
    <p class="meal-meta">${dayLabel(d.date)} ${fmtHm(d.createdAt)}${d.mo != null ? ` · 👶 ${d.mo}개월` : ''}</p>
    ${d.memo ? `<p class="meal-memo"></p>` : ''}
    <div class="comments meal-cmts"><ul class="comment-list"><li class="hint">댓글을 불러오는 중…</li></ul>
      <p class="reply-chip" hidden><span></span><button type="button" data-mc-cancel>취소</button></p>
      <form class="comment-form"><input type="text" maxlength="300" placeholder="댓글 달기 (예: 레시피 궁금해요!)" aria-label="댓글"><button class="btn" type="submit">달기</button></form></div>
    ${canDel(d) ? `<button type="button" class="btn danger block" data-del="${d.id}">🗑 이 사진 지우기${d.uid !== ME.uid ? ' (방장)' : ''}</button>` : ''}`});
  if(d.memo) box.querySelector('.meal-memo').textContent = d.memo;
  const ul = box.querySelector('.comment-list'), chip = box.querySelector('.reply-chip'), form = box.querySelector('.comment-form'), inp = form.querySelector('input');
  let list = [], replyTo = null;
  const draw = () => {
    ul.innerHTML = '';
    const isRoot = c => !c.to || !list.some(x => x.id === c.to);
    const ordered = []; list.filter(isRoot).forEach(r => { ordered.push(r); list.filter(x => x.to === r.id).forEach(x => ordered.push(x)); });
    ordered.forEach(c => {
      const li = document.createElement('li'); if(!isRoot(c)) li.className = 'reply';
      const n = document.createElement('b'); n.className = 'comment-nick'; n.textContent = c.n || '';
      const t = document.createElement('span'); t.textContent = c.text;
      const w = document.createElement('small'); w.textContent = fmtHm(c.createdAt);
      const rb = document.createElement('button'); rb.type = 'button'; rb.className = 'reply-btn'; rb.dataset.mcReply = c.id; rb.textContent = '↪ 답글';
      li.append(n, t, w, rb);
      if(c.uid === ME.uid || ME.owner){ const x = document.createElement('span'); x.className = 'comment-act';
        x.innerHTML = `<button type="button" data-mc-del="${c.id}">${c.uid === ME.uid ? '삭제' : '삭제(방장)'}</button>`; li.appendChild(x); }
      ul.appendChild(li);
    });
    if(!list.length){ const e = document.createElement('li'); e.className = 'hint'; e.textContent = '첫 댓글을 남겨 보세요 💬'; ul.appendChild(e); }
    chip.hidden = !replyTo; if(replyTo) chip.querySelector('span').textContent = `↪ ${replyTo.n || '이웃'}님에게 답글`;
    inp.placeholder = replyTo ? '답글 달기' : '댓글 달기 (예: 레시피 궁금해요!)';
  };
  const unsub = mealCmts(id).orderBy('createdAt').limit(100).onSnapshot(q => {
    if(!box.isConnected){ unsub(); return; }
    list = q.docs.map(x => ({id: x.id, ...x.data()})); draw();
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
    const text = inp.value.trim(); if(!text) return;
    const rt = replyTo, btn = form.querySelector('button'); btn.disabled = true;
    try{
      const ref = mealCmts(id).doc();
      await ref.set({text, uid: ME.uid, n: ME.nick, ...(rt ? {to: rt.root} : {}), expireAt: d.expireAt, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
      rememberMyCmt(id, ref.id); inp.value = ''; replyTo = null; draw();
      // 🔔 알림: 사진 올린 사람에게 + 답글이면 그 댓글 쓴 사람에게 (같은 사람이면 한 번만)
      if(typeof pushMealComment === 'function'){
        if(rt) pushMealComment(d, rt.uid, text, true);
        if(!rt || rt.uid !== d.uid) pushMealComment(d, d.uid, text, false);
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
  const file = $m('#mealFile'); let pendingSlot = 'l';
  $m('#mealSlots').addEventListener('click', e => {
    const del = e.target.closest('.meal-del'); if(del){ e.stopPropagation(); delPhoto(del.dataset.del); return; }
    const add = e.target.closest('[data-add]'); if(add){ pendingSlot = add.dataset.add; file.value = ''; file.click(); return; }
    const card = e.target.closest('[data-open]'); if(card) openPhoto(card.dataset.open);
  });
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0]; if(!f) return;
    try{ askUpload(pendingSlot, await shrinkPhoto(f)); }
    catch(e){ if(typeof pushToast === 'function') pushToast('⚠️ 이 사진은 읽지 못했어요. 다른 사진으로 해 주세요'); }
  });
  $m('#mealPrev').addEventListener('click', () => { if(meal.date > oldestDay()){ meal.date = addDays(meal.date, -1); watchDay(); } });
  $m('#mealNext').addEventListener('click', () => { if(meal.date < todayStr()){ meal.date = addDays(meal.date, 1); watchDay(); } });
  document.querySelectorAll('[data-mine]').forEach(b => b.addEventListener('click', () => { meal.onlyMine = b.dataset.mine === '1'; renderMeal(); }));
  watchDay();
  mealGoPhoto();
})();
