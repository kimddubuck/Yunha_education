/* 모임 페이지 — 용기 낸 사람이 내 닉네임으로 모임을 열고, 참석·미확정·불참과 댓글을 남겨요 (모두 닉네임이 보여요).
   저장: rooms/{방 열쇠}/opinions 컬렉션의 topic 'meet' 글, 댓글은 그 글 아래 comments 컬렉션.
   common.js가 먼저 필요해요. 필요한 Firestore 규칙은 firestore.rules 참고 */
const MEET_TEMPLATE = '장소: \n놀이: ';
const meet = { col:null, items:[], comments:{}, subs:{}, open:new Set(), drafts:{}, editing:null, editDraft:'', reports:{}};   // drafts: 쓰는 중인 댓글, editing: 고치는 중인 내 댓글

// '참석' / '미확정' / '불참'은 한 사람(멤버)당 하나. 다시 누르면 취소, 다른 걸 누르면 바꾸기
const myVote = o => ((o.v || {})[ME.uid] || {}).s || null;

function meetInit(){
  meet.col = copCollection();
  if(!meet.col){
    $('#upSec').hidden = false; $('#meetEmpty').textContent = '인터넷 연결을 확인해 주세요. 모임 요청을 불러오지 못했어요.';
    $('#meetSend').disabled = true; return;
  }
  // 다가오는 모임 + 지난 30일 모임만 읽어요 (읽기 횟수 절약, 지난 모임은 최근 5개만 보여 줘요)
  sosReady().then(ok => {
    if(!ok){ $('#upSec').hidden = false; $('#meetEmpty').textContent = '모임을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.'; return; }
    $('#meetHost').textContent = ME.nick;
    // 방장: 받은 신고를 글마다 숫자로 보여 줘요
    if(ME.owner) roomRef().collection('reports').onSnapshot(q => {
      meet.reports = {}; q.docs.forEach(d => { const r = d.data(), k = r.cid || r.mid; meet.reports[k] = (meet.reports[k] || 0) + 1; });
      renderMeets();
    }, () => {});
    meet.col.where('date', '>=', dayStr(-30)).orderBy('date', 'desc').limit(300).onSnapshot(serverOnly(snap => {   // 많아도 최신 300개
      meet.items = snap.docs.map(d => ({id:d.id, ...d.data()})).filter(o => o.topic==='meet' && o.date);
      watchComments(); renderMeets();
    }), err => { sosTrouble(err); $('#upSec').hidden = false; $('#meetEmpty').textContent = '모임 요청을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.'; });
  });
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

// 내가 연 모임 (연 사람과 방장이 취소할 수 있어요. 예전 모임은 이 휴대폰에서 연 것)
function myMeets(){ try{ return JSON.parse(localStorage.getItem('copMyMeets')||'[]'); }catch(e){ return []; } }
function addMyMeet(id){ try{ localStorage.setItem('copMyMeets', JSON.stringify([...myMeets(), id].slice(-100))); }catch(e){} }
const isMine = o => o.uid ? o.uid === ME.uid : myMeets().includes(o.id);

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
  const live = !past && !o.cancelled;   // 홈 카드와 같은 모양 (큰 날짜·시간 + 👀 참석자). 다가오는 모임만 버튼 안에 숫자
  const w = document.createElement('span'); w.className = 'op-when';
  w.textContent = `${dayLabel(o.date)} ${o.slot || ''}${o.date===today ? ' · 오늘' : ''}`;
  const hs = document.createElement('span'); hs.className = 'host-tag'; hs.textContent = o.host ? `👑 ${o.host} 주최` : '';
  const p = document.createElement('p'); p.className = 'op-text'; p.textContent = o.text;   // 글은 textContent로만
  // 👀 참석자 — 시간 줄 오른쪽 위 (누르면 누가 참석·불참했는지 닉네임 팝업). 지난 모임도 같은 모양
  const who = document.createElement('button'); who.type = 'button'; who.className = 'who-mini'; who.dataset.voters = o.id; who.textContent = '👀 참석자';
  const top = document.createElement('div'); top.className = 'meet-top'; top.append(w, who);
  body.append(top, hs, p);
  if(!live){   // 지난·취소된 모임은 버튼 대신 숫자만
    const tally = document.createElement('button'); tally.type = 'button'; tally.className = 'tally'; tally.dataset.voters = o.id;
    tally.innerHTML = tallyHtml(o); body.append(tally);
  }
  if(o.cancelled){
    li.classList.add('op-past');
    const c = document.createElement('p'); c.className = 'cancelled'; c.textContent = '❌ 주최자가 취소한 모임이에요';
    body.appendChild(c); return li;
  }
  if(past) return li;

  const row = document.createElement('div'); row.className = 'vote-row';
  const mine = {join: 'joins', maybe: 'maybes', no: 'nos'}[myVote(o)], cnt = meetVotes(o);
  const vbtn = (k, s, label) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'join'; b.dataset.vote = k; b.dataset.id = o.id;
    b.setAttribute('aria-pressed', mine===k); b.textContent = label + ' '; const c = document.createElement('b'); c.textContent = cnt[s].count; b.appendChild(c); return b; };
  const jb = vbtn('joins', 'join', '🙋 참석'), mb = vbtn('maybes', 'maybe', '🤔 미확정'), nb = vbtn('nos', 'no', '🙅 불참');
  const cb = document.createElement('button'); cb.type = 'button'; cb.className = 'join'; cb.dataset.toggle = o.id;
  cb.setAttribute('aria-expanded', meet.open.has(o.id));
  cb.textContent = `💬 댓글${cs.length ? ' ' + cs.length : ''}`;
  cb.className = 'join comment-toggle';
  row.append(jb, mb, nb); body.append(row);
  if(mine){ const h = document.createElement('p'); h.className = 'vote-hint'; h.textContent = '다시 누르면 취소돼요'; body.append(h); }
  body.append(cb);
  if(isMine(o) || ME.owner){
    const x = document.createElement('button'); x.type = 'button'; x.className = 'cancel-meet'; x.dataset.cancelMeet = o.id;
    x.textContent = meet.cancelErr && meet.cancelErr.id===o.id ? meet.cancelErr.msg
      : meet.confirm===o.id ? '정말 취소할까요? 한 번 더 누르면 취소돼요' : isMine(o) ? '🗑 내가 연 모임 취소하기' : '🗑 모임 취소하기 (방장)';
    body.appendChild(x);
  }

  // 🚩 신고 (남의 글) · 🗑 방장 권한으로 내리기
  const mod = document.createElement('div'); mod.className = 'mod-row';
  if(ME.owner && meet.reports[o.id]) mod.insertAdjacentHTML('beforeend', `<span class="mod-flag">🚩 신고 ${meet.reports[o.id]}건</span>`);
  if(!isMine(o)) mod.insertAdjacentHTML('beforeend', `<button type="button" class="mod-btn" data-report="${o.id}">🚩 신고</button>`);
  if(ME.owner) mod.insertAdjacentHTML('beforeend', `<button type="button" class="mod-btn danger" data-owner-del="${o.id}">🗑 방장 권한으로 내리기</button>`);
  if(mod.children.length) body.appendChild(mod);

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
      if(c.n){ const cn = document.createElement('b'); cn.className = 'comment-nick'; cn.textContent = c.n; ci.appendChild(cn); }
      const ct = document.createElement('span'); ct.textContent = c.text;
      const cw = document.createElement('small'); cw.textContent = fmtTime(c.createdAt) + (c.editedAt ? ' · 수정됨' : '');
      ci.append(ct, cw);
      if((c.uid && c.uid !== ME.uid) || ME.owner){   // 남의 댓글 신고 · 방장 지우기
        const m = document.createElement('span'); m.className = 'comment-mod';
        if(ME.owner && meet.reports[c.id]) m.insertAdjacentHTML('beforeend', `<span class="mod-flag">🚩 ${meet.reports[c.id]}</span>`);
        if(c.uid && c.uid !== ME.uid) m.insertAdjacentHTML('beforeend', `<button type="button" data-report="${o.id}" data-cid="${c.id}" aria-label="댓글 신고">🚩</button>`);
        if(ME.owner) m.insertAdjacentHTML('beforeend', `<button type="button" class="danger" data-owner-del="${o.id}" data-cid="${c.id}" aria-label="방장 권한으로 댓글 지우기">🗑</button>`);
        ci.appendChild(m);
      }
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
  const focusId = focused ? (focused.dataset.comment || null) : null;   // 수정 폼은 data-comment 가 없어요
  const editSel = focused && focused.dataset.editComment ? [focused.querySelector('input').selectionStart, focused.querySelector('input').selectionEnd] : null;

  const today = todayStr();
  // 오늘 시작 시간이 지난 모임은 '지난 모임'으로 옮겨요
  const up = meet.items.filter(o => o.date >= today && !meetStarted(o))
    .sort((a,b) => a.date.localeCompare(b.date) || slotOrder(a.slot) - slotOrder(b.slot));
  const past = meet.items.filter(o => o.date < today || meetStarted(o)).sort((a,b) => b.date.localeCompare(a.date) || slotOrder(b.slot) - slotOrder(a.slot)).slice(0,5);
  const ul = $('#meetList'); ul.innerHTML = ''; up.forEach(o => ul.appendChild(meetCard(o, false)));
  $('#meetEmpty').textContent = '';
  $('#upSec').hidden = !up.length;   // 다가오는 모임이 없으면 칸째 숨겨요
  const pl = $('#pastList'); pl.innerHTML = ''; past.forEach(o => pl.appendChild(meetCard(o, true)));
  $('#pastSec').hidden = !past.length;

  document.querySelectorAll('.comment-form[data-comment]').forEach(f => { f.querySelector('input').value = meet.drafts[f.dataset.comment] || ''; });   // 수정 폼은 건드리지 않아요
  if(focusId){ const f = document.querySelector(`.comment-form[data-comment="${focusId}"]`); if(f) f.querySelector('input').focus(); }
  if(meet.editing && !focusId){ const ef = document.querySelector(`[data-edit-comment="${meet.editing}"] input`); if(ef){ ef.focus(); if(editSel) try{ ef.setSelectionRange(editSel[0], editSel[1]); }catch(e){} } }
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
  const text = $('#meetText').value.trim(), date = meetPicker.state.date, host = ME.nick;
  // 양식 칸(장소:/시간:/놀이:)만 남아 있으면 빈 글로 봐요
  if(!date || date < todayStr() || date > lastBookDay()){ $('#meetMsg').textContent = '오늘부터 1주일 안의 날짜를 골라 주세요.'; return; }
  if(!meetPicker.state.slot){ $('#meetMsg').textContent = '시간을 골라 주세요.'; return; }
  if(date === todayStr() && parseInt(meetPicker.state.slot) < new Date().getHours()){ meetPicker.render(); $('#meetMsg').textContent = '지난 시간이에요. 시간을 다시 골라 주세요.'; return; }
  if(!host){ $('#meetMsg').textContent = '닉네임을 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요.'; return; }
  if(!text.replace(/^(장소|시간|놀이):/gm, '').trim()){ $('#meetMsg').textContent = '장소나 놀이를 적어 주세요.'; return; }
  if(!meet.col) return;
  $('#meetSend').disabled = true;
  try{
    const ref = await meet.col.add({topic:'meet', text, date, slot:meetPicker.state.slot, host, uid: ME.uid, ...ttl(date), createdAt: firebase.firestore.FieldValue.serverTimestamp()});
    $('#meetText').value = MEET_TEMPLATE; $('#meetCount').textContent = `${MEET_TEMPLATE.length} / 500`;
    if(ref && ref.id) addMyMeet(ref.id);
    if(ref && ref.id && typeof pushNewMeet === 'function') pushNewMeet(ref.id, date, meetPicker.state.slot, host);   // 방에 새 모임 알림
    $('#meetMsg').textContent = '모임을 열었어요! 용기 내 줘서 고마워요 💪';
  }catch(err){ sosTrouble(err); $('#meetMsg').textContent = '저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.'; }
  finally{ $('#meetSend').disabled = false; }
});

// 실패 안내: 목록 아래 문구는 다시 그릴 때 지워져서, 잠깐 뜨는 안내로 보여 줘요
const meetSay = t => { if(typeof pushToast === 'function') pushToast('⚠️ ' + t); else $('#meetEmpty').textContent = t; };
// 방장 권한으로 글·댓글 지우기 (모임은 댓글과 신고도 함께)
async function ownerDelete(mid, cid){
  const yes = await sosConfirm({icon: '🗑', title: cid ? '이 댓글을 지울까요?' : '이 모임 글을 내릴까요?', danger: true, ok: '지우기',
    body: `<p>방장 권한으로 ${cid ? '댓글을' : '모임 글과 댓글을'} 지워요.<br><b>되돌릴 수 없어요.</b></p>`});
  if(!yes) return;
  try{
    const ref = meet.col.doc(mid), reps = roomRef().collection('reports');
    if(cid){
      await ref.collection('comments').doc(cid).delete();
      (await reps.where('cid', '==', cid).get()).docs.forEach(d => d.ref.delete().catch(() => {}));
    }else{
      for(const c of (await ref.collection('comments').get()).docs) await c.ref.delete();
      await ref.delete();
      (await reps.where('mid', '==', mid).get()).docs.forEach(d => d.ref.delete().catch(() => {}));
    }
  }catch(err){ sosTrouble(err); sosConfirm({icon: '😢', title: '지우지 못했어요.', body: '<p>잠시 뒤 다시 해 주세요.</p>', ok: '확인'}); }
}

$('#meetList').addEventListener('click', async e => {
  const rp = e.target.closest('[data-report]');
  if(rp){ sosReport(rp.dataset.cid ? 'comment' : 'meet', rp.dataset.report, rp.dataset.cid); return; }
  const od = e.target.closest('[data-owner-del]');
  if(od){ ownerDelete(od.dataset.ownerDel, od.dataset.cid); return; }
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
  const vt = e.target.closest('[data-voters]');
  if(vt){ const o = meet.items.find(x => x.id === vt.dataset.voters); if(o) showVoters(o); return; }
  const b = e.target.closest('[data-vote]'); if(!b || !meet.col || !ME.uid) return;
  const id = b.dataset.id, v = {joins: 'join', maybes: 'maybe', nos: 'no'}[b.dataset.vote], o = meet.items.find(x => x.id === id);
  const old = o ? myVote(o) : null;
  // 같은 걸 다시 누르면 취소, 다른 걸 누르면 바꾸기
  const change = {['v.' + ME.uid]: old === v ? firebase.firestore.FieldValue.delete() : {s: v, n: ME.nick}};
  b.disabled = true;
  try{
    await meet.col.doc(id).update(change);
    // 새로 참석했으면 모임 주최자에게 알림 (내가 연 모임이면 안 보냄)
    if(v === 'join' && old !== 'join' && o && !isMine(o) && typeof pushMeetJoin === 'function') pushMeetJoin(o, meetVotes(o).join.count + 1);
  }
  catch(err){ sosTrouble(err); b.disabled = false; meetSay('참석·불참을 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.'); }
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
    await ref.set({text, kh: await sha256hex(k), uid: ME.uid, n: ME.nick, ...(m ? ttl(m.date) : {}), createdAt: firebase.firestore.FieldValue.serverTimestamp()});
    if(m && !isMine(m) && typeof pushMeetComment === 'function') pushMeetComment(m, text);   // 모임 주최자에게 댓글 알림
  }catch(err){
    meet.drafts[id] = text; renderMeets();
    meetSay('댓글을 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
  }
});

$('#meetText').value = MEET_TEMPLATE; $('#meetCount').textContent = `${MEET_TEMPLATE.length} / 500`;
// SOS 팝업의 '용기 내서 이 시간 모임 열기'로 왔으면 그 날짜·시간을 채워 둬요 (meet.html?d=YYYY-MM-DD&s=9#new)
{ const q = new URLSearchParams(location.search), d = q.get('d'), h = parseInt(q.get('s'), 10);
  if(d && /^\d{4}-\d{2}-\d{2}$/.test(d)){ openMeetForm(d, HOURS.includes(h) ? h + '시' : null);
    history.replaceState(null, '', location.pathname + location.hash); } }
if(location.hash==='#new'){   // 홈의 '모임 열기'로 왔으면 모임 만들기 칸까지 바로 내려가요
  $('#meetForm').hidden = false;
  const go = () => $('.sos-brave').scrollIntoView({block: 'start', behavior: 'smooth'});
  setTimeout(go, 150); setTimeout(() => { if(window.scrollY < 50) go(); }, 900);
}
if(location.hash==='#sos') setTimeout(() => $('[data-sos]').scrollIntoView({block:'start'}), 50);
meetInit();
sosInit();
setInterval(() => { if(meet.items.length && !document.activeElement.closest('.comment-form')) renderMeets(); }, 60000);   // 시작한 모임을 '지난 모임'으로 옮겨요
