/* 🍚 식단: 우리 방 사람들의 이유식·유아식 사진
   - 방 사람만 봐요. 올린 사람과 방장만 지울 수 있어요. 올린 날부터 1달 뒤 자동으로 지워져요.
   - 사진은 휴대폰에서 작게 줄여(긴 쪽 360px, 한 장 약 20KB) 문서 안에 글자(data URL)로 넣어요.
   - 저장: rooms/{방 열쇠}/meals/{id} = {uid, n, img, slot, memo?, mo?, date, createdAt, expireAt} */
const MEAL_SLOTS = [['b', '🌅 아침'], ['s1', '🍪 오전 간식'], ['l', '🍚 점심'], ['s2', '🍎 오후 간식'], ['d', '🌙 저녁']];
const MEAL_DAYS = 30;          // 1달 뒤 자동 삭제 (서버 규칙은 32일까지 허용)
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
    const body = ds.length ? `<div class="meal-row">${cards}${add}</div>` : (add || '<p class="hint meal-none">아직 사진이 없어요</p>');
    return `<section class="meal-slot${ds.length ? '' : ' empty'}"><h3>${label}${ds.length ? ` <small>${ds.length}장</small>` : ''}</h3>${body}</section>`;
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
    }, err => { meal.broken = true; renderMeal(); if(typeof sosTrouble === 'function' && err && err.code !== 'permission-denied') sosTrouble(err); });
  });
}

/* 사진 올리기 창: 미리보기 · 한 줄 메모 · 아기 개월수(기억해 둬요) */
function askUpload(slot, img){
  const label = (MEAL_SLOTS.find(s => s[0] === slot) || ['', ''])[1];
  let mo = ''; try{ mo = localStorage.getItem('sosMealMo') || ''; }catch(e){}
  const box = sosInfo({icon: '', title: `${dayLabel(meal.date)} ${label}`, body: `
    <img class="meal-prev" src="${img}" alt="올릴 사진 미리보기">
    <p class="hint meal-size">${Math.round(img.length * 0.75 / 1024)}KB로 줄였어요</p>
    <input class="meal-in" id="mealMemo" maxlength="40" placeholder="메모 (선택) 예: 소고기죽">
    <label class="meal-mo">👶 아기 <select id="mealMo"><option value="">개월수 (선택)</option>${Array.from({length: 49}, (_, i) => `<option value="${i}"${String(i) === mo ? ' selected' : ''}>${i}개월</option>`).join('')}</select></label>
    <p class="hint meal-rule">📷 <b>음식만</b> 나오게 찍어 주세요 <span class="nw">(아이 얼굴·집 안 X)</span><br><span class="nw">👥 우리 방만 봐요</span> · <span class="nw">🗑 1달 뒤 자동 삭제</span></p>
    <button type="button" class="btn primary block" id="mealSend">올리기</button>`});
  box.querySelector('#mealSend').addEventListener('click', async e => {
    const b = e.currentTarget; if(b.disabled) return; b.disabled = true; b.textContent = '올리는 중…';
    const memo = box.querySelector('#mealMemo').value.trim().slice(0, 40), moV = box.querySelector('#mealMo').value;
    try{ localStorage.setItem('sosMealMo', moV); }catch(err){}
    try{
      if(!(await sosReady())) throw new Error('offline');
      const ref = roomRef().collection('meals').doc();
      const data = {uid: ME.uid, n: ME.nick, img, slot, date: meal.date,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        expireAt: firebase.firestore.Timestamp.fromMillis(Date.now() + MEAL_DAYS * 864e5)};
      if(memo) data.memo = memo;
      if(moV !== '') data.mo = Number(moV);
      await ref.set(data);
      rememberMine(ref.id);
      box.remove();
      if(typeof pushToast === 'function') pushToast('🍚 올렸어요! 우리 방 사람들이 볼 수 있어요');
    }catch(err){ b.disabled = false; b.textContent = '⚠️ 못 올렸어요 · 다시 누르기'; if(typeof sosTrouble === 'function') sosTrouble(err); }
  });
}

function openPhoto(id){
  const d = meal.docs.find(x => x.id === id); if(!d) return;
  const label = (MEAL_SLOTS.find(s => s[0] === d.slot) || ['', ''])[1];
  const box = sosInfo({icon: '', title: `${d.n} · ${label}`, body: `<img class="meal-big" src="${d.img}" alt="">
    <p class="meal-meta">${dayLabel(d.date)} ${fmtHm(d.createdAt)}${d.mo != null ? ` · 👶 ${d.mo}개월` : ''}</p>
    ${d.memo ? `<p class="meal-memo"></p>` : ''}
    ${canDel(d) ? `<button type="button" class="btn danger block" data-del="${d.id}">🗑 이 사진 지우기${d.uid !== ME.uid ? ' (방장)' : ''}</button>` : ''}`});
  if(d.memo) box.querySelector('.meal-memo').textContent = d.memo;
  box.addEventListener('click', e => { const b = e.target.closest('[data-del]'); if(b){ box.remove(); delPhoto(b.dataset.del); } });
}

async function delPhoto(id){
  const d = meal.docs.find(x => x.id === id); if(!d || !canDel(d)) return;
  if(!confirm(d.uid === ME.uid ? '이 사진을 지울까요?' : `방장으로서 ${d.n}님의 사진을 지울까요?`)) return;
  try{ await roomRef().collection('meals').doc(id).delete(); forgetMine(id); if(typeof pushToast === 'function') pushToast('🗑 지웠어요'); }
  catch(err){ if(typeof sosTrouble === 'function') sosTrouble(err); }
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
})();
