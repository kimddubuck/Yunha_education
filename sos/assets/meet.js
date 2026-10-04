/* 모임 페이지 — 용기 낸 사람이 주최자 이름(별명)을 걸고 모임을 열고, '나도 갈래요'와 댓글을 남겨요.
   저장: rooms/{방 열쇠}/opinions 컬렉션의 topic 'meet' 글, 댓글은 그 글 아래 comments 컬렉션.
   common.js가 먼저 필요해요. 필요한 Firestore 규칙은 firestore.rules 참고 */
const MEET_TEMPLATE = '장소: \n놀이: ';
const meet = { col:null, items:[], comments:{}, subs:{}, open:new Set(), drafts:{}, editing:null, editDraft:''};   // drafts: 쓰는 중인 댓글, editing: 고치는 중인 내 댓글

// '참석' / '미확정' / '불참'은 이 기기에서 셋 중 하나만 (완벽한 막기는 아니에요). 다시 누르면 취소, 다른 걸 누르면 바꾸기
function choices(){ try{ return JSON.parse(localStorage.getItem('copChoice')||'{}'); }catch(e){ return {}; } }
function markChoice(id, v){ try{ const c = {...choices()}; if(v) c[id] = v; else delete c[id]; localStorage.setItem('copChoice', JSON.stringify(c)); }catch(e){} }

function meetInit(){
  meet.col = copCollection();
  if(!meet.col){
    $('#meetEmpty').textContent = '인터넷 연결을 확인해 주세요. 모임 요청을 불러오지 못했어요.';
    $('#meetSend').disabled = true; return;
  }
  // 다가오는 모임 + 지난 30일 모임만 읽어요 (읽기 횟수 절약, 지난 모임은 최근 5개만 보여 줘요)
  meet.col.where('date', '>=', dayStr(-30)).limit(300).onSnapshot(serverOnly(snap => {
    meet.items = snap.docs.map(d => ({id:d.id, ...d.data()})).filter(o => o.topic==='meet' && o.date);
    watchComments(); renderMeets();
  }), err => { sosTrouble(err); $('#meetEmpty').textContent = '모임 요청을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.'; });
}

// 다가오는 요청마다 댓글을 실시간으로 받아요 (한 번만 구독)
function watchComments(){
  const today = todayStr();
  meet.items.filter(o => o.date >= today && !meet.subs[o.id]).forEach(o => {
    meet.subs[o.id] = meet.col.doc(o.id).collection('comments').orderBy('createdAt').limit(100).onSnapshot(snap => {
      meet.comments[o.id] = snap.docs.map(d => ({id:d.id, ...d.data()}));
      renderMeets();
    }, () => {});
  });
}

// 내가 연 모임 (이 휴대폰에서 연 것만 취소할 수 있어요)
function myMeets(){ try{ return JSON.parse(localStorage.getItem('copMyMeets')||'[]'); }catch(e){ return []; } }
function addMyMeet(id){ try{ localStorage.setItem('copMyMeets', JSON.stringify([...myMeets(), id].slice(-100))); }catch(e){} }

// 내 댓글 열쇠: 댓글을 쓸 때 이 휴대폰에서 비밀값을 만들어 두고, 서버에는 그 지문(sha256)만 저장해요.
// 고치거나 지울 때 비밀값을 보내 확인하고, 매번 새 비밀값으로 바꿔요 (규칙은 의견게시판_설정.md)
function comKeys(){ try{ return JSON.parse(localStorage.getItem('copComKeys')||'{}'); }catch(e){ return {}; } }
function setComKey(cid, k){ try{ const m = comKeys(); m[cid] = k; localStorage.setItem('copComKeys', JSON.stringify(m)); }catch(e){} }
function newSecret(){ return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join(''); }
async function sha256hex(t){ const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2,'0')).join(''); }
async function changeComment(mid, cid, data){
  const k = comKeys()[cid]; if(!k) throw new Error('no key');
  const next = newSecret();
  await meet.col.doc(mid).collection('comments').doc(cid).update({...data, k, kh: await sha256hex(next), editedAt: firebase.firestore.FieldValue.serverTimestamp()});
  setComKey(cid, next);
}

function meetCard(o, past){
  const li = document.createElement('li'); li.className = 'meet-card' + (past ? ' op-past' : '');
  const body = document.createElement('div'); body.className = 'meet-body';
  li.append(dateBadge(o.date), body);
  const today = todayStr(), cs = (meet.comments[o.id] || []).filter(c => !c.deleted);
  const meta = document.createElement('div'); meta.className = 'op-meta';
  const w = document.createElement('span'); w.className = 'op-when';
  w.textContent = `${dayLabel(o.date)} ${o.slot || ''}${o.date===today ? ' · 오늘' : ''}`;
  const t = document.createElement('span'); t.textContent = fmtTime(o.createdAt);
  meta.append(w, t);
  if(o.host){ const hs = document.createElement('span'); hs.className = 'host-tag'; hs.textContent = `👑 ${o.host} 주최`; meta.appendChild(hs); }
  const p = document.createElement('p'); p.className = 'op-text'; p.textContent = o.text;   // 글은 textContent로만
  const tally = document.createElement('p'); tally.className = 'tally';
  tally.innerHTML = `<span>참석 <b>${o.joins || 0}</b></span><span>미확정 <b>${o.maybes || 0}</b></span><span>불참 <b>${o.nos || 0}</b></span>`;
  body.append(meta, p, tally);
  if(o.cancelled){
    li.classList.add('op-past');
    const c = document.createElement('p'); c.className = 'cancelled'; c.textContent = '❌ 주최자가 취소한 모임이에요';
    body.appendChild(c); return li;
  }
  if(past) return li;

  const row = document.createElement('div'); row.className = 'vote-row';
  const mine = choices()[o.id];
  const jb = document.createElement('button'); jb.type = 'button'; jb.className = 'join'; jb.dataset.vote = 'joins'; jb.dataset.id = o.id;
  jb.setAttribute('aria-pressed', mine==='joins');
  jb.textContent = mine==='joins' ? '🙋 참석했어요' : '🙋 참석';
  const nb = document.createElement('button'); nb.type = 'button'; nb.className = 'join'; nb.dataset.vote = 'nos'; nb.dataset.id = o.id;
  nb.setAttribute('aria-pressed', mine==='nos');
  nb.textContent = mine==='nos' ? '🙅 불참했어요' : '🙅 불참';
  const mb = document.createElement('button'); mb.type = 'button'; mb.className = 'join'; mb.dataset.vote = 'maybes'; mb.dataset.id = o.id;
  mb.setAttribute('aria-pressed', mine==='maybes');
  mb.textContent = mine==='maybes' ? '🤔 미확정했어요' : '🤔 미확정';
  const cb = document.createElement('button'); cb.type = 'button'; cb.className = 'join'; cb.dataset.toggle = o.id;
  cb.setAttribute('aria-expanded', meet.open.has(o.id));
  cb.textContent = `💬 댓글${cs.length ? ' ' + cs.length : ''}`;
  cb.className = 'join comment-toggle';
  row.append(jb, mb, nb); body.append(row);
  if(mine){ const h = document.createElement('p'); h.className = 'vote-hint'; h.textContent = '다시 누르면 취소, 다른 걸 누르면 바꿀 수 있어요'; body.append(h); }
  body.append(cb);
  if(myMeets().includes(o.id)){
    const x = document.createElement('button'); x.type = 'button'; x.className = 'cancel-meet'; x.dataset.cancelMeet = o.id;
    x.textContent = meet.cancelErr && meet.cancelErr.id===o.id ? meet.cancelErr.msg
      : meet.confirm===o.id ? '정말 취소할까요? 한 번 더 누르면 취소돼요' : '🗑 내가 연 모임 취소하기';
    body.appendChild(x);
  }

  if(meet.open.has(o.id)){
    const box = document.createElement('div'); box.className = 'comments';
    const ul = document.createElement('ul'); ul.className = 'comment-list';
    const keys = comKeys();
    cs.forEach(c => {
      const ci = document.createElement('li');
      if(meet.editing === c.id){
        const ef = document.createElement('form'); ef.className = 'comment-form comment-edit'; ef.dataset.editComment = c.id; ef.dataset.meet = o.id;
        ef.innerHTML = `<input type="text" maxlength="300" aria-label="댓글 고치기"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-edit-cancel>취소</button>`;
        ef.querySelector('input').value = meet.editDraft;
        ci.appendChild(ef); ul.appendChild(ci); return;
      }
      const ct = document.createElement('span'); ct.textContent = c.text;
      const cw = document.createElement('small'); cw.textContent = fmtTime(c.createdAt) + (c.editedAt ? ' · 수정됨' : '');
      ci.append(ct, cw);
      if(keys[c.id]){   // 이 휴대폰에서 쓴 댓글만 고치기·지우기
        const act = document.createElement('span'); act.className = 'comment-act';
        act.innerHTML = `<button type="button" data-cedit="${c.id}">수정</button><button type="button" data-cdel="${c.id}" data-meet="${o.id}">삭제</button>`;
        ci.appendChild(act);
      }
      ul.appendChild(ci);
    });
    if(!cs.length){ const e = document.createElement('li'); e.className = 'hint'; e.textContent = '아직 댓글이 없어요.'; ul.appendChild(e); }
    const f = document.createElement('form'); f.className = 'comment-form'; f.dataset.comment = o.id;
    f.innerHTML = `<input type="text" maxlength="300" placeholder="예: 11시쯤 갈 수 있어요" aria-label="댓글">
      <button class="btn" type="submit">달기</button>`;
    box.append(ul, f); body.appendChild(box);
  }
  return li;
}

function renderMeets(){
  // 쓰는 중인 댓글과 커서 위치는 다시 그려도 지켜요
  const focused = document.activeElement && document.activeElement.closest && document.activeElement.closest('.comment-form');
  const focusId = focused ? focused.dataset.comment : null;

  const today = todayStr();
  const up = meet.items.filter(o => o.date >= today)
    .sort((a,b) => a.date.localeCompare(b.date) || slotOrder(a.slot) - slotOrder(b.slot));
  const past = meet.items.filter(o => o.date < today).sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
  const ul = $('#meetList'); ul.innerHTML = ''; up.forEach(o => ul.appendChild(meetCard(o, false)));
  $('#meetEmpty').textContent = up.length ? '' : '다가오는 모임이 없어요. 같이 놀고 싶은 날을 올려 주세요.';
  const pl = $('#pastList'); pl.innerHTML = ''; past.forEach(o => pl.appendChild(meetCard(o, true)));
  $('#pastSec').hidden = !past.length;

  document.querySelectorAll('.comment-form').forEach(f => { f.querySelector('input').value = meet.drafts[f.dataset.comment] || ''; });
  if(focusId){ const f = document.querySelector(`.comment-form[data-comment="${focusId}"]`); if(f) f.querySelector('input').focus(); }
  if(meet.editing){ const ef = document.querySelector(`[data-edit-comment="${meet.editing}"] input`); if(ef && (focusId === null)) ef.focus(); }
}

/* ---------- 달력 + 시간 고르기 (common.js의 createPicker) ---------- */
const meetPicker = createPicker($('#meetPicker'), {whenText: st => `${dayLabel(st.date)}${st.slot ? ' ' + st.slot : ''}에 모여요`});
// SOS에서 '＋ 모임 만들기'를 누르면 고른 날짜·시간을 채워서 열어요
function openMeetForm(date, slot){
  if(date && date >= todayStr() && date <= lastBookDay()){ meetPicker.state.date = date; const [y,m] = date.split('-').map(Number); meetPicker.state.month = {y,m}; }
  if(slot) meetPicker.state.slot = slot;
  meetPicker.render(); $('#meetForm').hidden = false;
  $('#meetForm').scrollIntoView({behavior:'smooth', block:'start'});
}

$('#meetText').addEventListener('input', () => { $('#meetCount').textContent = `${$('#meetText').value.length} / 500`; });
$('#meetForm').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('#meetText').value.trim(), date = meetPicker.state.date, host = $('#meetHost').value.trim();
  // 양식 칸(장소:/시간:/놀이:)만 남아 있으면 빈 글로 봐요
  if(!date || date < todayStr() || date > lastBookDay()){ $('#meetMsg').textContent = '오늘부터 1주일 안의 날짜를 골라 주세요.'; return; }
  if(!meetPicker.state.slot){ $('#meetMsg').textContent = '시간을 골라 주세요.'; return; }
  if(!host){ $('#meetMsg').textContent = '주최자 이름을 적어 주세요. (예: 하늘맘)'; $('#meetHost').focus(); return; }
  if(!text.replace(/^(장소|시간|놀이):/gm, '').trim()){ $('#meetMsg').textContent = '장소나 놀이를 적어 주세요.'; return; }
  if(!meet.col) return;
  $('#meetSend').disabled = true;
  try{
    const ref = await meet.col.add({topic:'meet', text, date, slot:meetPicker.state.slot, host, joins:0, maybes:0, nos:0, ...ttl(date), createdAt: firebase.firestore.FieldValue.serverTimestamp()});
    $('#meetText').value = MEET_TEMPLATE; $('#meetCount').textContent = `${MEET_TEMPLATE.length} / 500`;
    try{ localStorage.setItem('copHost', host); }catch(e){}
    if(ref && ref.id) addMyMeet(ref.id);
    $('#meetMsg').textContent = '모임을 열었어요! 용기 내 줘서 고마워요 💪';
  }catch(err){ sosTrouble(err); $('#meetMsg').textContent = '저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.'; }
  finally{ $('#meetSend').disabled = false; }
});

$('#meetList').addEventListener('click', async e => {
  const cm = e.target.closest('[data-cancel-meet]');
  if(cm){
    const id = cm.dataset.cancelMeet;
    if(meet.confirm !== id){ meet.confirm = id; renderMeets(); return; }   // 실수 방지: 두 번 눌러야 취소
    cm.disabled = true; cm.textContent = '취소하는 중…'; meet.cancelErr = null;
    try{ await meet.col.doc(id).update({cancelled: true}); meet.confirm = null; }
    catch(err){
      // 실패 문구는 버튼 위에 바로 보여 줘요 (목록 아래 문구는 다시 그릴 때 지워져서 안 보였어요)
      meet.cancelErr = {id, msg: err && err.code === 'permission-denied'
        ? '⚠️ 취소가 막혔어요. Firestore 규칙을 새로 게시해 주세요' : '⚠️ 취소하지 못했어요. 한 번 더 눌러 주세요'};
      renderMeets();
    }
    return;
  }
  const ce = e.target.closest('[data-cedit]');
  if(ce){ const c = Object.values(meet.comments).flat().find(x => x.id === ce.dataset.cedit);
    meet.editing = ce.dataset.cedit; meet.editDraft = c ? c.text : ''; renderMeets(); return; }
  if(e.target.closest('[data-edit-cancel]')){ meet.editing = null; renderMeets(); return; }
  const cd = e.target.closest('[data-cdel]');
  if(cd){
    if(!confirm('이 댓글을 지울까요?')) return;
    cd.disabled = true;
    try{ await changeComment(cd.dataset.meet, cd.dataset.cdel, {text:'', deleted:true}); }
    catch(err){ cd.disabled = false; cd.textContent = '⚠️ 다시'; }
    return;
  }
  const tg = e.target.closest('[data-toggle]');
  if(tg){ const id = tg.dataset.toggle; meet.open.has(id) ? meet.open.delete(id) : meet.open.add(id); renderMeets(); return; }
  const b = e.target.closest('[data-vote]'); if(!b || !meet.col) return;
  const id = b.dataset.id, v = b.dataset.vote, old = choices()[id], inc = firebase.firestore.FieldValue.increment;
  // 같은 걸 다시 누르면 취소(-1), 다른 걸 누르면 바꾸기(예전 것 -1, 새 것 +1), 처음이면 +1
  const change = old === v ? {[v]: inc(-1)} : old ? {[old]: inc(-1), [v]: inc(1)} : {[v]: inc(1)};
  b.disabled = true;
  try{ await meet.col.doc(id).update(change); markChoice(id, old === v ? null : v); renderMeets(); }
  catch(err){ sosTrouble(err); b.disabled = false; $('#meetEmpty').textContent = '참석·불참을 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.'; }
});
$('#meetList').addEventListener('input', e => {
  const f = e.target.closest('[data-comment]'); if(f) meet.drafts[f.dataset.comment] = e.target.value;
  if(e.target.closest('[data-edit-comment]')) meet.editDraft = e.target.value;
});
$('#meetList').addEventListener('submit', async e => {
  const ef = e.target.closest('[data-edit-comment]');
  if(ef){
    e.preventDefault();
    const text = ef.querySelector('input').value.trim(); if(!text) return;
    const btn = ef.querySelector('[type=submit]'); btn.disabled = true;
    try{ await changeComment(ef.dataset.meet, ef.dataset.editComment, {text}); meet.editing = null; renderMeets(); }
    catch(err){ btn.disabled = false; btn.textContent = '⚠️ 다시 저장'; }
    return;
  }
  const f = e.target.closest('[data-comment]'); if(!f) return;
  e.preventDefault();
  const id = f.dataset.comment, text = f.querySelector('input').value.trim();
  if(!text || !meet.col) return;
  meet.drafts[id] = ''; f.querySelector('input').value = '';   // 먼저 비우고, 실패하면 되돌려요
  try{
    // 화면에 댓글이 먼저 뜨기 전에 열쇠부터 저장해 둬요 (그래야 바로 수정·삭제 버튼이 보여요)
    const k = newSecret(), ref = meet.col.doc(id).collection('comments').doc();
    setComKey(ref.id, k);
    const m = meet.items.find(o => o.id === id);   // 댓글도 모임과 같은 날 함께 지워져요
    await ref.set({text, kh: await sha256hex(k), ...(m ? ttl(m.date) : {}), createdAt: firebase.firestore.FieldValue.serverTimestamp()});
  }catch(err){
    meet.drafts[id] = text; renderMeets();
    $('#meetEmpty').textContent = '댓글을 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.';
  }
});

$('#meetText').value = MEET_TEMPLATE; $('#meetCount').textContent = `${MEET_TEMPLATE.length} / 500`;
try{ $('#meetHost').value = localStorage.getItem('copHost') || ''; }catch(e){}   // 지난번 주최자 이름을 기억해 둬요
$('#newToggle').addEventListener('click', () => { $('#meetForm').hidden = !$('#meetForm').hidden; if(!$('#meetForm').hidden) $('#meetText').focus(); });
if(location.hash==='#new') $('#meetForm').hidden = false;
if(location.hash==='#sos') setTimeout(() => $('[data-sos]').scrollIntoView({block:'start'}), 50);
meetInit();
sosInit();
