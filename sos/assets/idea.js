/* 💡 익명 제안함 — 우리 방 사람만 보는 익명 게시판 (제목·내용·댓글 모두 익명)
   저장: rooms/{방 열쇠}/ideas/{id} {t, b, kh, createdAt, expireAt}, 댓글은 그 아래 comments {b, kh, createdAt, expireAt}
   닉네임·로그인 번호(uid)는 저장하지 않아요. 내 글인지는 이 휴대폰에만 있는 비밀값(k)으로만 알아요 (서버에는 지문 kh 만).
   지우기: 쓴 휴대폰(비밀값 확인) 또는 방장. 30일 뒤 자동 삭제. */
const $i = s => document.querySelector(s);
const IDEA_DAYS = 30, IDEA_KEYS = 'sosIdeaKeys';
const idea = { col: null, items: [], open: new Set(), cmts: {}, subs: {}, drafts: {} };

const ideaKeys = () => { try{ return JSON.parse(localStorage.getItem(IDEA_KEYS) || '{}'); }catch(e){ return {}; } };
function setIdeaKey(path, k){ try{ const m = ideaKeys(); m[path] = k; localStorage.setItem(IDEA_KEYS, JSON.stringify(m)); }catch(e){} }
const ipath = (id, cid) => `rooms/${ROOM.key}/ideas/${id}` + (cid ? `/comments/${cid}` : '');
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
async function sha(t){ const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join(''); }
function ago(ts){
  if(!ts || !ts.toDate) return '방금';
  const m = Math.floor((Date.now() - ts.toDate().getTime()) / 60000);
  if(m < 1) return '방금'; if(m < 60) return `${m}분 전`; const h = Math.floor(m / 60); if(h < 24) return `${h}시간 전`;
  const d = ts.toDate(); return `${d.getMonth() + 1}/${d.getDate()}`;
}

function renderIdeas(){
  const ul = $i('#ideaList'), keys = ideaKeys();
  const fo = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-idea]');   // 쓰는 중인 댓글은 지켜요
  const draft = fo ? {id: fo.dataset.idea, v: fo.querySelector('input').value} : null;
  ul.querySelectorAll('[data-idea] input').forEach(i => { if(i.value) idea.drafts[i.closest('[data-idea]').dataset.idea] = i.value; });
  const list = idea.items.filter(x => !x.deleted);
  if(!list.length){ ul.innerHTML = '<li class="hint idea-empty">아직 제안이 없어요. 첫 제안을 남겨 보세요 💡</li>'; return; }
  ul.innerHTML = '';
  list.forEach(x => {
    const li = document.createElement('li'); li.className = 'idea-card'; li.dataset.id = x.id;
    const mine = !!keys[ipath(x.id)], opened = idea.open.has(x.id);
    li.innerHTML = `<button type="button" class="idea-head" data-toggle="${x.id}" aria-expanded="${opened}"><b class="idea-t"></b><span class="idea-m">🙈 익명 · ${ago(x.createdAt)}${mine ? ' · 내 글' : ''}</span></button>
      <p class="idea-b"></p>`;
    li.querySelector('.idea-t').textContent = x.t;
    const b = li.querySelector('.idea-b'); b.textContent = x.b; if(!opened) b.classList.add('clip');
    if(opened){
      const cs = (idea.cmts[x.id] || []).filter(c => !c.deleted);
      const box = document.createElement('div'); box.className = 'comments idea-cmts';
      const cl = document.createElement('ul'); cl.className = 'comment-list';
      cs.forEach(c => {
        const ci = document.createElement('li');
        const cn = document.createElement('b'); cn.className = 'comment-nick'; cn.textContent = '익명';
        const ct = document.createElement('span'); ct.textContent = c.b;
        const cw = document.createElement('small'); cw.textContent = ago(c.createdAt);
        ci.append(cn, ct, cw);
        const own = !!keys[ipath(x.id, c.id)];
        if(own || ME.owner){ const a = document.createElement('span'); a.className = 'comment-act';
          a.innerHTML = `<button type="button" data-cdel="${c.id}" data-idea="${x.id}">${own ? '삭제' : '삭제(방장)'}</button>`; ci.appendChild(a); }
        cl.appendChild(ci);
      });
      if(!cs.length) cl.innerHTML = '<li class="hint">아직 댓글이 없어요.</li>';
      const f = document.createElement('form'); f.className = 'comment-form'; f.dataset.idea = x.id;
      f.innerHTML = `<input type="text" maxlength="300" placeholder="익명으로 댓글 달기" aria-label="익명 댓글"><button class="btn" type="submit">달기</button>`;
      box.append(cl, f); li.appendChild(box);
      if(mine || ME.owner){ const d = document.createElement('button'); d.type = 'button'; d.className = 'idea-del'; d.dataset.del = x.id;
        d.textContent = mine ? '🗑 내 제안 지우기' : '🗑 방장 권한으로 지우기'; li.appendChild(d); }
    } else {
      const more = document.createElement('button'); more.type = 'button'; more.className = 'idea-more'; more.dataset.toggle = x.id; more.textContent = '💬 펼쳐서 댓글 보기';
      li.appendChild(more);
    }
    ul.appendChild(li);
  });
  ul.querySelectorAll('[data-idea] input').forEach(i => { const d = idea.drafts[i.closest('[data-idea]').dataset.idea]; if(d) i.value = d; });
  if(draft){ const i = ul.querySelector(`[data-idea="${draft.id}"] input`); if(i){ i.value = draft.v; i.focus(); } }
}

function watchCmts(id){
  if(idea.subs[id]) return;
  idea.subs[id] = idea.col.doc(id).collection('comments').orderBy('createdAt').limit(200).onSnapshot(q => {
    idea.cmts[id] = q.docs.map(d => ({id: d.id, ...d.data()})); renderIdeas();
  }, () => {});
}

// 내 글·댓글 지우기: 비밀값으로 '지움' 표시 (서버가 지문으로 확인) · 방장은 그냥 지워요
async function removeDoc(ref, path){
  const k = ideaKeys()[path];
  const isPost = !path.includes('/comments/');
  if(k){ await ref.update({...(isPost ? {t: ''} : {}), b: '', deleted: true, k}); return; }
  if(ME.owner){
    if(isPost){ const cs = await ref.collection('comments').get(); await Promise.all(cs.docs.map(c => c.ref.delete().catch(() => {}))); }
    await ref.delete();
  }
}

(function initIdea(){
  if(!$i('#ideaList')) return;
  const form = $i('#ideaForm'), title = $i('#ideaTitle'), body = $i('#ideaBody');
  $i('#ideaOpen').addEventListener('click', () => { form.hidden = false; $i('#ideaOpen').hidden = true; title.focus(); });
  $i('#ideaCancel').addEventListener('click', () => { form.hidden = true; $i('#ideaOpen').hidden = false; });
  body.addEventListener('input', () => { $i('#ideaCount').textContent = `${body.value.length} / 1000`; });
  sosReady().then(ok => {
    if(!ok){ $i('#ideaList').innerHTML = '<li class="hint">제안함을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</li>'; return; }
    idea.col = roomRef().collection('ideas');
    idea.col.orderBy('createdAt', 'desc').limit(100).onSnapshot(q => {
      const now = Date.now();
      idea.items = q.docs.map(d => ({id: d.id, ...d.data()})).filter(x => !x.expireAt || x.expireAt.toMillis() > now);
      renderIdeas();
    }, () => { $i('#ideaList').innerHTML = '<li class="hint">💡 제안함을 준비하고 있어요. 잠시 뒤 다시 열어 주세요.</li>'; });
    document.addEventListener('sos:owner', renderIdeas);
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const t = title.value.trim(), b = body.value.trim();
    if(!t || !b){ (t ? body : title).focus(); return; }
    const btn = $i('#ideaSend'); btn.disabled = true; btn.textContent = '올리는 중…';
    try{
      const ref = idea.col.doc(), k = secret();
      setIdeaKey(ipath(ref.id), k);
      await ref.set({t, b, kh: await sha(k), createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        expireAt: firebase.firestore.Timestamp.fromMillis(Date.now() + IDEA_DAYS * 864e5)});
      title.value = ''; body.value = ''; $i('#ideaCount').textContent = '0 / 1000';
      form.hidden = true; $i('#ideaOpen').hidden = false;
      if(typeof pushToast === 'function') pushToast('💡 익명으로 올렸어요');
    }catch(err){ if(typeof sosTrouble === 'function') sosTrouble(err); else alert('올리지 못했어요. 잠시 뒤 다시 해 주세요.'); }
    btn.disabled = false; btn.textContent = '익명으로 올리기';
  });
  $i('#ideaList').addEventListener('click', async e => {
    const tg = e.target.closest('[data-toggle]');
    if(tg){ const id = tg.dataset.toggle; if(idea.open.has(id)) idea.open.delete(id); else { idea.open.add(id); watchCmts(id); } renderIdeas(); return; }
    const del = e.target.closest('[data-del]');
    if(del){ if(!confirm('이 제안을 지울까요? 댓글도 함께 안 보이게 돼요.')) return; del.disabled = true;
      try{ await removeDoc(idea.col.doc(del.dataset.del), ipath(del.dataset.del)); }catch(err){ del.disabled = false; if(typeof sosTrouble === 'function') sosTrouble(err); } return; }
    const cd = e.target.closest('[data-cdel]');
    if(cd){ if(!confirm('이 댓글을 지울까요?')) return; cd.disabled = true;
      try{ await removeDoc(idea.col.doc(cd.dataset.idea).collection('comments').doc(cd.dataset.cdel), ipath(cd.dataset.idea, cd.dataset.cdel)); }catch(err){ cd.disabled = false; if(typeof sosTrouble === 'function') sosTrouble(err); } }
  });
  $i('#ideaList').addEventListener('submit', async e => {
    const f = e.target.closest('[data-idea]'); if(!f) return; e.preventDefault();
    const inp = f.querySelector('input'), b = inp.value.trim(); if(!b) return;
    const x = idea.items.find(y => y.id === f.dataset.idea); if(!x) return;
    inp.value = ''; delete idea.drafts[x.id];
    try{
      const ref = idea.col.doc(x.id).collection('comments').doc(), k = secret();
      setIdeaKey(ipath(x.id, ref.id), k);
      await ref.set({b, kh: await sha(k), createdAt: firebase.firestore.FieldValue.serverTimestamp(), expireAt: x.expireAt});
    }catch(err){ inp.value = b; if(typeof sosTrouble === 'function') sosTrouble(err); }
  });
})();
