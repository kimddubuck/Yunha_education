/* 놀이 고르기 페이지 — plays.js(놀이 목록)와 common.js가 먼저 필요해요 */
const HABIT = '혼자서도 할 수 있어요', TIDY = '마무리';
const DEV_CATS = ['전체', ...CATS.filter(c => c!=='전체' && c!==HABIT && c!==TIDY)];
const byId = id => PLAYS.find(p => p.id===id);
const state = {cat:'전체', fresh:true, habit:null, dev:null};
const folds = {habit:false, dev:false};   // 처음엔 카드 목록을 접어 둬요
let savedPick = null;   // 엄마 아빠가 추가한 놀이는 늦게 불러와지니, 고른 기록을 잠시 들고 있어요
try{ savedPick = JSON.parse(localStorage.getItem('playPicker2')||'null'); }catch(e){}
function restorePick(){
  if(!savedPick) return;
  ['habit','dev'].forEach(k => { if(!state[k] && savedPick[k] && byId(savedPick[k])) state[k] = savedPick[k]; });
}
restorePick();
const save = () => { savedPick = {habit:state.habit, dev:state.dev}; try{ localStorage.setItem('playPicker2', JSON.stringify({habit:state.habit, dev:state.dev})); }catch(e){} };

const tidy = PLAYS.find(p => p.cat===TIDY);
const habits = [], devs = [];
function splitPlays(){
  habits.length = 0; devs.length = 0;
  PLAYS.forEach(p => { if(p.cat===HABIT) habits.push(p); else if(p.cat!==TIDY) devs.push(p); });
}
splitPlays();
// 재료가 겹치는지: 이름이 같거나 한쪽이 다른 쪽을 포함하면 같은 재료로 봐요 (예: '양말' ↔ '어른 양말')
const sameItem = (a,b) => a===b || a.includes(b) || b.includes(a);
const shared = (p,q) => p && q ? p.items.filter(i => q.items.some(j => sameItem(i,j))) : [];

function cardHtml(p, slot){
  const on = state[slot]===p.id;
  const same = slot==='dev' ? shared(p, byId(state.habit)) : shared(p, byId(state.dev));
  const tags = [
    same.length ? `<span class="tag same">재료 같음 · ${same.map(esc).join(', ')}</span>` : '',
    `<span class="tag">${SRC_TAG[p.src]}</span>`,
    p.used ? `<span class="tag done">${p.used} 해 봄</span>` : '',
    p.water ? `<span class="tag">💧 물 · 수건 깔기</span>` : '',
    p.song ? `<span class="tag">ex) ${esc(p.song)}</span>` : ''].join('');
  return `<button class="card${on?' on':''}" data-id="${p.id}" data-slot="${slot}" aria-pressed="${on}">
    <div class="card-top"><h3>${esc(p.name)}</h3><span class="check" aria-hidden="true">✓</span></div>
    ${p.say ? `<p class="say">“${esc(p.say)}”</p>` : ''}
    <p class="how">${esc(p.how)}</p>
    ${p.orig ? `<p class="orig">${({daycare:'🏫 ', book:'📘 '})[p.src] || '원래 이름 · '}${esc(p.orig)}</p>` : ''}
    <p class="orig">준비물 · ${p.items.map(esc).join(', ')}</p>
    <div class="tags">${tags}</div></button>`;
}

function devVisible(){
  return devs.filter(p => (state.cat==='전체' || p.cat===state.cat) && (!state.fresh || !p.used));
}

function matchCount(){ const h = byId(state.habit); return h ? devVisible().filter(p => shared(p,h).length).length : 0; }

function renderFolds(){
  [['habit', habits.length], ['dev', devVisible().length]].forEach(([k, n]) => {
    const open = folds[k], btn = document.querySelector(`[data-fold="${k}"]`);
    btn.setAttribute('aria-expanded', open);
    btn.innerHTML = open ? `<span>놀이 카드 접기</span><span class="chev">접기 ▲</span>`
                         : `<span>놀이 카드 보기 · ${n}개${k==='dev' && matchCount() ? ` · 재료 겹치는 것 ${matchCount()}개` : ''}</span><span class="chev">펼치기 ▼</span>`;
    $('#'+k+'Body').hidden = !open;
    const p = byId(state[k]), line = $('#'+k+'Picked');
    line.hidden = !p;
    if(p) line.innerHTML = `고른 놀이 · <b>${esc(p.name)}</b>${p.say ? ` — “${esc(p.say)}”` : ''}`;
  });
}

function render(){
  renderFolds();
  $('#habitCards').innerHTML = habits.map(p => cardHtml(p,'habit')).join('');

  const h = byId(state.habit);
  const matches = h ? devVisible().filter(p => shared(p,h).length) : [];
  $('#match').hidden = !matches.length;
  if(matches.length){
    $('#matchLabel').textContent = `'${h.name}'와 재료가 겹치는 새로운 경험`;
    $('#matchCards').innerHTML = matches.map(p => cardHtml(p,'dev')).join('');
  }

  $('#cats').innerHTML = DEV_CATS.map(c => `<button class="chip" data-cat="${c}" aria-pressed="${state.cat===c}">${c}</button>`).join('');
  const list = devVisible();
  $('#count').textContent = `${list.length}개`;
  const groups = DEV_CATS.slice(1).map(c => ({c, items:list.filter(p => p.cat===c)})).filter(g => g.items.length);
  $('#grid').innerHTML = groups.length ? groups.map(g => `<section class="group">
      <h2 class="group-h">${g.c} <span>${g.items.length}</span></h2>
      <p class="group-d">${CAT_DESC[g.c]}</p>
      <div class="cards">${g.items.map(p => cardHtml(p,'dev')).join('')}</div></section>`).join('')
    : `<p class="empty">조건에 맞는 놀이가 없어요. '안 해 본 것만'을 꺼 보세요.</p>`;
  renderTray();
}

function picked(){ return [['① 혼자서도 할 수 있어요', byId(state.habit)], ['② 새로운 경험', byId(state.dev)], ['마무리', tidy]]; }
function stuffList(){
  const out = [];
  picked().forEach(([,p]) => p && p.items.forEach(i => { if(!out.includes(i)) out.push(i); }));
  return out;
}
function renderTray(){
  $('#today').innerHTML = picked().map(([label,p]) => `<li><span><span class="slotname">${label}</span>${p ? esc(p.name)+(p.song?` — ex) ${esc(p.song)}`:'') : '<span class="hint">아직 안 골랐어요</span>'}</span>${p && label!=='마무리' ? `<button class="x" data-remove="${label[0]==='①'?'habit':'dev'}" aria-label="${esc(p.name)} 빼기">×</button>` : ''}</li>`).join('');
  const any = state.habit || state.dev;
  $('#stuffBox').hidden = !any;
  $('#stuff').textContent = stuffList().join(', ');
  const same = shared(byId(state.habit), byId(state.dev));
  $('#shared').textContent = same.length ? `①②에 같이 쓰는 재료: ${same.join(', ')}` : (state.habit && state.dev ? '①②에 겹치는 재료가 없어요.' : '');
  $('#barText').textContent = `오늘 놀이 ${[state.habit,state.dev].filter(Boolean).length}/2`;
}

function noticeText(){
  const lines = ['📌 오늘의 놀이'];
  picked().forEach(([label,p]) => { if(!p) return;
    lines.push(`${label} · ${p.say ? `"${p.say}" ` : ''}${p.name}${p.song?` — ex) ${p.song}`:''}`);
    if(p.src==='daycare' && p.orig) lines.push(`  🏫 ${p.orig}`);
  });
  lines.push('', `준비물 (없어도 괜찮아요): ${stuffList().join(', ')}`);
  return lines.join('\n');
}
function flash(msg){ $('#toast').textContent = msg; setTimeout(() => { $('#toast').textContent=''; }, 2400); }
function openTray(open){ $('#tray').classList.toggle('closed', !open); $('#bar').setAttribute('aria-expanded', open); $('#bar .hint').textContent = open ? '접기 ▼' : '펼치기 ▲'; }

document.addEventListener('click', e => {
  const cat = e.target.closest('[data-cat]');
  if(cat){ state.cat = cat.dataset.cat; render(); return; }
  const card = e.target.closest('.card');
  if(card){
    const k = card.dataset.slot, picking = state[k]!==card.dataset.id;
    state[k] = picking ? card.dataset.id : null; save();
    if(picking){ folds[k] = false; }   // 고르면 접어서 스크롤을 줄여요
    render();
    if(picking) document.getElementById(k==='habit' ? 'habitSlot' : 'devSlot').scrollIntoView({behavior:'smooth', block:'start'});
    return; }
  const fold = e.target.closest('[data-fold]');
  if(fold){ folds[fold.dataset.fold] = !folds[fold.dataset.fold]; render(); return; }
  const rm = e.target.closest('[data-remove]');
  if(rm){ state[rm.dataset.remove] = null; save(); render(); }
});
$('#fresh').onclick = e => { state.fresh = !state.fresh; e.currentTarget.setAttribute('aria-pressed', state.fresh); render(); };
$('#clear').onclick = () => { state.habit = null; state.dev = null; save(); render(); };
$('#copy').onclick = async () => {
  if(!state.habit && !state.dev){ flash('먼저 놀이를 골라 주세요.'); return; }
  const text = noticeText();
  try{ await navigator.clipboard.writeText(text); flash('복사했어요. 단톡방에 붙여 넣으면 돼요.'); }
  catch(err){ const ta = $('#copyArea'); ta.value = text; ta.select(); try{ document.execCommand('copy'); flash('복사했어요.'); }catch(e2){ flash('복사가 막혀 있어요. 길게 눌러 직접 복사해 주세요.'); } }
};
$('#bar').onclick = () => openTray($('#tray').classList.contains('closed'));
openTray(false);
render();

/* ---------- 놀이 추가: 누구나 이름 없이 (Firestore rooms/{방 열쇠}/plays) ---------- */
const addState = {kind:'habit'};
const ADD_CATS = DEV_CATS.slice(1);

// 올라온 놀이를 PLAYS에 섞어 넣고 다시 그려요
function mergeUserPlays(list){
  for(let i = PLAYS.length - 1; i >= 0; i--) if(PLAYS[i].src==='user') PLAYS.splice(i, 1);
  list.forEach(u => PLAYS.splice(PLAYS.length - 1, 0, {   // 마무리(맨 끝) 앞에 넣어요
    id:'u-'+u.id, name:u.name, cat:u.kind==='habit' ? HABIT : (ADD_CATS.includes(u.cat) ? u.cat : ADD_CATS[0]),
    say:u.say || '', how:u.how, items:Array.isArray(u.items) && u.items.length ? u.items : ['없음'], src:'user'}));
  splitPlays(); restorePick(); render();
}

function renderAddForm(){
  document.querySelectorAll('#addKind [data-kind]').forEach(b => b.setAttribute('aria-pressed', b.dataset.kind===addState.kind));
  $('#addSayRow').hidden = addState.kind!=='habit';
  $('#addCatRow').hidden = addState.kind!=='dev';
}

(function addInit(){
  $('#addCat').innerHTML = ADD_CATS.map(c => `<option>${esc(c)}</option>`).join('');
  renderAddForm();
  $('#addOpen').addEventListener('click', () => { $('#addPanel').hidden = !$('#addPanel').hidden; if(!$('#addPanel').hidden) $('#addName').focus(); });
  $('#addKind').addEventListener('click', e => { const b = e.target.closest('[data-kind]'); if(!b) return; addState.kind = b.dataset.kind; renderAddForm(); });
  const room = roomRef(), col = room && room.collection('plays');
  if(!col){ $('#addOpen').disabled = true; $('#addOpen').title = '인터넷 연결이 없어 놀이를 추가할 수 없어요'; return; }
  col.orderBy('createdAt').limit(200).onSnapshot(snap => mergeUserPlays(snap.docs.map(d => ({id:d.id, ...d.data()}))), sosTrouble);

  $('#addForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#addName').value.trim(), how = $('#addHow').value.trim();
    const items = $('#addItems').value.split(/[,、·]/).map(x => x.trim()).filter(Boolean).slice(0, 10);
    if(!name || !how){ $('#addMsg').textContent = '놀이 이름과 하는 방법을 적어 주세요.'; return; }
    const doc = {name, kind:addState.kind, how, items, createdAt: firebase.firestore.FieldValue.serverTimestamp()};
    if(addState.kind==='habit' && $('#addSay').value.trim()) doc.say = $('#addSay').value.trim();
    if(addState.kind==='dev') doc.cat = $('#addCat').value;
    $('#addSend').disabled = true;
    try{
      await col.add(doc);
      $('#addForm').reset(); renderAddForm();
      $('#addMsg').textContent = '놀이를 추가했어요! 카드 목록에서 볼 수 있어요. 🙌';
    }catch(err){ sosTrouble(err); $('#addMsg').textContent = '저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.'; }
    finally{ $('#addSend').disabled = false; }
  });
})();
