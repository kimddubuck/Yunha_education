/* 🙈 익명게시판 — 우리 방 사람만 보는 익명 게시판 (제목·내용·댓글 모두 익명)
   저장: rooms/{방 열쇠}/ideas/{id} {t, b, kh, createdAt, expireAt}, 댓글은 그 아래 comments {b, kh, createdAt, expireAt}
   닉네임·로그인 번호(uid)는 저장하지 않아요. 내 글인지는 이 휴대폰에만 있는 비밀값(k)으로만 알아요 (서버에는 지문 kh 만).
   지우기: 쓴 휴대폰(비밀값 확인) 또는 방장. 3일 뒤 자동 삭제. */
const $i = s => document.querySelector(s);
const IDEA_DAYS = 3, IDEA_KEYS = 'sosIdeaKeys';   // v16: 3일 뒤 자동 삭제
const idea = {lkey: {},  col: null, items: [], open: new Set(), cmts: {}, subs: {}, drafts: {}, cat: 'talk', filter: '' };
// 말머리 4개 (코드는 서버 규칙 v16 목록 안에서 골랐어요: 나눔·교환=etc, 육아정보=idea). 예전 말머리(피크닉·독서)는 수다·고민으로 보여요
const IDEA_CATS = [['etc', '🎁 나눔·교환'], ['talk', '💬 수다·고민'], ['buy', '🛒 공동구매'], ['idea', '💡 육아정보']];
// 말머리 탭을 누르면 아래에 보이는 안내 (글쓰기에서 말머리를 고를 때도 같은 안내가 보여요)
const CAT_TIP = {'': '',   // 전체: 안내 없음
  etc: '🥕 남는 식재료·이유식 재료,\n🧸 작아진 옷·장난감·책을\n나누거나 서로 바꿔요.\n주고받기는 방 사람들끼리 자율로 해요.',
  talk: '💭 밤잠·떼쓰기·어린이집 적응…\n이름 없이 편하게 털어놓고\n서로 다독여요.',
  buy: '📦 코스트코·쿠팡 대용량\n기저귀·물티슈·식재료를\n같이 사서 나눠요.\n돈은 방 사람들끼리 자율로 주고받아요.',
  idea: '📌 소아과 야간진료·키즈카페·지원금처럼\n직접 겪은 육아 정보를 나눠요.\n출처를 같이 적으면 더 좋아요.'};   // \n 에서 줄바꿈 (좁은 화면에서도 어색하게 끊기지 않게)
const catOf = c => IDEA_CATS.some(x => x[0] === c) ? c : 'talk';
const catName = c => (IDEA_CATS.find(x => x[0] === catOf(c)) || ['', ''])[1];
// 말머리를 바꾸기 전(2026-10-28 14:35)에 올라온 글은 모두 💬 수다·고민으로 봐요 (예전 '기타'·'꿀팁'이 나눔·육아정보로 잘못 보이지 않게)
const CAT_CUT = Date.UTC(2026, 9, 28, 5, 35);
const catX = x => x.createdAt && x.createdAt.toMillis && x.createdAt.toMillis() < CAT_CUT ? 'talk' : catOf(x.c);

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
  const draft = fo ? {id: fo.dataset.idea, v: fo.querySelector('textarea, input[type="text"]').value} : null;
  ul.querySelectorAll('[data-idea] input[type="text"]').forEach(i => { if(i.value) idea.drafts[i.closest('[data-idea]').dataset.idea] = i.value; });
  const list = idea.items.filter(x => !x.deleted && (!idea.filter || catX(x) === idea.filter));   // 말머리 탭으로 걸러 보기
  if(!list.length && idea.items.some(x => !x.deleted)){ ul.innerHTML = `<li class="hint idea-empty">${catName(idea.filter)} 글이 아직 없어요. 첫 글을 남겨 보세요 🙂</li>`; return; }
  if(!list.length){ ul.innerHTML = `<li class="hint idea-empty">아직 글이 없어요. 첫 이야기를 편하게 남겨 보세요 🙂</li>`; return; }
  ul.innerHTML = '';
  list.forEach(x => {
    const li = document.createElement('li'); li.className = 'idea-card'; li.dataset.id = x.id;
    const mine = !!keys[ipath(x.id)], opened = idea.open.has(x.id);
    li.innerHTML = `<button type="button" class="idea-head" data-toggle="${x.id}" aria-expanded="${opened}"><b class="idea-t"><span class="idea-cat">${catName(catX(x))}</span></b><span class="idea-m">🙈 익명 · ${ago(x.createdAt)}${mine ? ' · 내 글' : ''}</span></button>
      <p class="idea-b cp"></p>`;
    li.querySelector('.idea-t').appendChild(document.createTextNode(x.t));
    const b = li.querySelector('.idea-b'); b.textContent = x.b; if(!opened) b.classList.add('clip');
    // 📷 사진은 인스타그램 피드처럼 카드 맨 위에 크게 (누르면 크게 보기). 링크는 펼쳤을 때 글 아래에
    //   여러 장이면 옆으로 넘기는 슬라이드 + 오른쪽 위 '1/3'
    const pics = [x.img, ...(Array.isArray(x.imgs) ? x.imgs : [])].filter(u => typeof u === 'string' && /^data:image\/(webp|jpeg);base64,/.test(u)).slice(0, 5);
    if(pics.length){ const car = document.createElement('div'); car.className = 'feed-car';
      const tr = document.createElement('div'); tr.className = 'feed-track';
      pics.forEach((u, i) => { const fi = document.createElement('img'); fi.className = 'feed-img'; fi.src = u; fi.alt = `첨부 사진 ${i + 1}`; fi.loading = 'lazy';
        fi.addEventListener('click', () => { if(typeof bigPhoto === 'function') bigPhoto(u); }); tr.appendChild(fi); });
      car.appendChild(tr);
      if(pics.length > 1){ const n = document.createElement('span'); n.className = 'feed-n'; n.textContent = `1/${pics.length}`; car.appendChild(n);
        const dots = document.createElement('div'); dots.className = 'feed-dots'; dots.innerHTML = pics.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join(''); car.appendChild(dots);
        tr.addEventListener('scroll', () => { const i = Math.round(tr.scrollLeft / tr.clientWidth); n.textContent = `${i + 1}/${pics.length}`; dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === i)); }, {passive: true}); }
      li.prepend(car); li.classList.add('has-img'); }
    if(opened && typeof attachView === 'function'){ const av = attachView({...x, img: ''}); if(av) b.insertAdjacentElement('afterend', av); }
    // ❤️ 좋아요 (v17): 누가 눌렀는지 안 남게 글마다 다른 지문(내 번호+글 번호)을 칸 이름으로 써요
    const foot = document.createElement('div'); foot.className = 'idea-foot';
    const ccount = (idea.cmts[x.id] || []).filter(c => !c.deleted).length;   // 💬 펼치기 전에도 댓글 수
    if(!opened){ const more = document.createElement('button'); more.type = 'button'; more.className = 'idea-more'; more.dataset.toggle = x.id; more.textContent = ccount ? `💬 댓글 ${ccount}개 · 펼쳐 보기` : '💬 펼쳐서 댓글 달기'; foot.appendChild(more); }
    foot.appendChild(viewTag('i' + x.id));   // 👁 펼쳐 본 사람 수
    foot.appendChild(likeBtn(x, idea.lkey[x.id] || '', idea.col.doc(x.id)));
    if(!idea.lkey[x.id] && ME.uid) sha(ME.uid + '/' + x.id).then(h => { idea.lkey[x.id] = h; const lb = li.querySelector('.idea-foot .like'); if(lb) lb.replaceWith(likeBtn(x, h, idea.col.doc(x.id))); });
    li.appendChild(foot);
    if(opened){
      const cs = (idea.cmts[x.id] || []).filter(c => !c.deleted);
      const box = document.createElement('div'); box.className = 'comments idea-cmts';
      const cl = document.createElement('ul'); cl.className = 'comment-list';
      cs.forEach(c => {
        const ci = document.createElement('li');
        const cn = document.createElement('b'); cn.className = 'comment-nick'; cn.textContent = '익명';
        const ct = document.createElement('span'); ct.className = 'cp'; ct.textContent = c.b;
        const cw = document.createElement('small'); cw.textContent = ago(c.createdAt);
        ci.append(cn, ct, cw);
        // ❤️ 댓글 좋아요 (v18): 글처럼 댓글마다 다른 지문
        const ck = 'c:' + c.id, cref = idea.col.doc(x.id).collection('comments').doc(c.id);
        ci.appendChild(likeBtn(c, idea.lkey[ck] || '', cref, {cls: 'mini'}));
        if(!idea.lkey[ck] && ME.uid) sha(ME.uid + '/' + c.id).then(h => { idea.lkey[ck] = h; const lb = ci.querySelector('.like'); if(lb) lb.replaceWith(likeBtn(c, h, cref, {cls: 'mini'})); });
        if(typeof attachView === 'function'){ const av = attachView(c); if(av) ci.appendChild(av); }
        const own = !!keys[ipath(x.id, c.id)];
        if(own || ME.owner){ const a = document.createElement('span'); a.className = 'comment-act';
          a.innerHTML = `<button type="button" data-cdel="${c.id}" data-idea="${x.id}">${own ? '삭제' : '삭제(방장)'}</button>`; ci.appendChild(a); }
        cl.appendChild(ci);
      });
      if(!cs.length) cl.innerHTML = '<li class="hint">아직 댓글이 없어요.</li>';
      const f = document.createElement('form'); f.className = 'comment-form'; f.dataset.idea = x.id;
      f.innerHTML = `<input type="text" maxlength="300" placeholder="익명으로 댓글 달기" aria-label="익명 댓글"><button class="btn" type="submit">달기</button>`;
      box.append(cl, f); li.appendChild(box);
      if(typeof attachUI === 'function'){ idea.atDrafts = idea.atDrafts || {}; f._at = attachUI(f, {compact: true, onChange: v => { idea.atDrafts[x.id] = v; }}); f._at.set(idea.atDrafts[x.id] || {}); }
      if(mine || ME.owner){ const d = document.createElement('button'); d.type = 'button'; d.className = 'idea-del'; d.dataset.del = x.id;
        d.textContent = mine ? '🗑 내 글 지우기' : '🗑 방장 권한으로 지우기'; li.appendChild(d); }
    }
    ul.appendChild(li);
  });
  ul.querySelectorAll('[data-idea] input[type="text"]').forEach(i => { const d = idea.drafts[i.closest('[data-idea]').dataset.idea]; if(d) i.value = d; });
  if(draft){ const i = ul.querySelector(`[data-idea="${draft.id}"] input`); if(i){ i.value = draft.v; i.focus(); } }
}

function watchCmts(id){
  if(idea.subs[id]) return;
  idea.subs[id] = idea.col.doc(id).collection('comments').orderBy('createdAt').limit(200).onSnapshot(q => {
    idea.cmts[id] = q.docs.map(d => ({id: d.id, ...d.data()}));
    clearTimeout(idea.rt); idea.rt = setTimeout(renderIdeas, 30);   // 여러 글 댓글이 한꺼번에 와도 한 번만 그려요
  }, () => {});
}

// 내 글·댓글 지우기: 비밀값으로 '지움' 표시 (서버가 지문으로 확인) · 방장은 그냥 지워요
async function removeDoc(ref, path){
  const k = ideaKeys()[path];
  const isPost = !path.includes('/comments/');
  if(k){ const base = {...(isPost ? {t: ''} : {}), b: '', img: '', url: '', deleted: true, k};
    try{ await ref.update(isPost ? {...base, imgs: []} : base); }   // 📷 여러 장 사진(imgs)도 비워요
    catch(e){ if(!isPost || e.code !== 'permission-denied') throw e; await ref.update(base); }   // 규칙 v25 전이면 예전 방식
    return; }
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
  if(typeof attachUI === 'function') idea.attach = attachUI(form, {before: $i('#ideaAttach'), multi: true});   // 📷 글 사진은 여러 장
  // 🏷 말머리 고르기 (글쓰기) · 말머리로 보기 (목록)
  const cats = $i('#ideaCats'); cats.innerHTML = IDEA_CATS.map(([k, n]) => `<button type="button" data-cat="${k}" aria-pressed="${k === idea.cat}">${n}</button>`).join('');
  cats.addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if(!b) return; idea.cat = b.dataset.cat; cats.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $i('#ideaCatTip').textContent = CAT_TIP[idea.cat] || '';
    title.placeholder = {etc: '제목 (예: 남는 단호박 나눠요)', talk: '제목 (예: 요즘 밤잠 어떻게 재우세요?)', buy: '제목 (예: 코스트코 기저귀 같이 사실 분?)', idea: '제목 (예: 소아과 야간진료 정보 공유해요)'}[idea.cat] || '제목'; });
  // 🗂 말머리 탭: 전체 · 나눔·교환 · 수다·고민 · 공동구매 · 육아정보
  const ft = $i('#ideaFilter');
  if(ft){ ft.innerHTML = [['', '전체'], ...IDEA_CATS].map(([k, n]) => `<button type="button" data-f="${k}" aria-pressed="${k === idea.filter}">${n}</button>`).join('');
    ft.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if(!b) return; idea.filter = b.dataset.f; ft.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); tip(); renderIdeas(); });
    const tip = () => { $i('#ideaFilterTip').textContent = CAT_TIP[idea.filter] || ''; }; tip(); }
  $i('#ideaCatTip').textContent = CAT_TIP[idea.cat] || '';
  sosReady().then(ok => {
    if(!ok){ $i('#ideaList').innerHTML = '<li class="hint">익명게시판을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</li>'; return; }
    idea.col = roomRef().collection('ideas');
    idea.col.orderBy('createdAt', 'desc').limit(100).onSnapshot(q => {
      const now = Date.now();
      idea.items = q.docs.map(d => ({id: d.id, ...d.data()})).filter(x => !x.expireAt || x.expireAt.toMillis() > now);
      // 🔔 새 글 알림을 눌러 왔으면(?go=i글) 그 글을 펼쳐서 보여 줘요
      if(/^i[A-Za-z0-9]{1,40}$/.test(SOS_GO || '')){ const gid = SOS_GO.slice(1); if(idea.items.some(x => x.id === gid && !x.deleted)){ SOS_GO = ''; idea.open.add(gid); watchCmts(gid); viewHit('i' + gid);
        setTimeout(() => { const li = document.querySelector(`.idea-card[data-id="${gid}"]`); if(li) li.scrollIntoView({block: 'start', behavior: 'smooth'}); }, 300); } }
      renderIdeas();
      idea.items.filter(x => !x.deleted).forEach(x => watchCmts(x.id));   // 💬 펼치기 전에도 댓글 수를 보여 주려고 미리 들어요
    }, () => { $i('#ideaList').innerHTML = '<li class="hint">🙈 익명게시판을 준비하고 있어요. 잠시 뒤 다시 열어 주세요.</li>'; });
    document.addEventListener('sos:owner', renderIdeas);
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const t = title.value.trim(), b = body.value.trim();
    if(!t || !b){ (t ? body : title).focus(); return; }
    let at = {}; try{ at = idea.attach ? idea.attach.get() : {}; }catch(err){ if(err.code === 'bad-url'){ if(typeof pushToast === 'function') pushToast('🔗 링크는 https://로 시작하는 주소만 넣을 수 있어요'); return; } throw err; }
    const btn = $i('#ideaSend'); btn.disabled = true; btn.textContent = '올리는 중…';
    try{
      const ref = idea.col.doc(), k = secret();
      setIdeaKey(ipath(ref.id), k);
      const doc = {t, b, c: idea.cat, ...at, kh: await sha(k), createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        expireAt: firebase.firestore.Timestamp.fromMillis(Date.now() + IDEA_DAYS * 864e5)};
      try{ await ref.set(doc); }
      catch(err){ if(!doc.imgs || err.code !== 'permission-denied') throw err;   // 서버 규칙 v25 전이면 첫 장만 올려요
        delete doc.imgs; await ref.set(doc); if(typeof pushToast === 'function') pushToast('📷 지금은 첫 장만 올라갔어요 (여러 장은 준비 중)'); }
      title.value = ''; body.value = ''; $i('#ideaCount').textContent = '0 / 1000'; if(idea.attach) idea.attach.clear();
      form.hidden = true; $i('#ideaOpen').hidden = false;
      if(typeof pushToast === 'function') pushToast('🙈 익명으로 올렸어요');
      if(typeof pushNewIdea === 'function') pushNewIdea(ref.id, catName(doc.c), t);   // 🔔 방 사람들에게 새 글 알림 (쓴 사람 정보 없이)
    }catch(err){ if(typeof sosTrouble === 'function') sosTrouble(err); else alert('올리지 못했어요. 잠시 뒤 다시 해 주세요.'); }
    btn.disabled = false; btn.textContent = '익명으로 올리기';
  });
  $i('#ideaList').addEventListener('click', async e => {
    const tg = e.target.closest('[data-toggle]');
    if(tg){ const id = tg.dataset.toggle; if(idea.open.has(id)) idea.open.delete(id); else { idea.open.add(id); watchCmts(id); viewHit('i' + id); } renderIdeas(); return; }
    const del = e.target.closest('[data-del]');
    if(del){ if(!confirm('이 글을 지울까요? 댓글도 함께 안 보이게 돼요.')) return; del.disabled = true;
      try{ await removeDoc(idea.col.doc(del.dataset.del), ipath(del.dataset.del)); }catch(err){ del.disabled = false; if(typeof sosTrouble === 'function') sosTrouble(err); } return; }
    const cd = e.target.closest('[data-cdel]');
    if(cd){ if(!confirm('이 댓글을 지울까요?')) return; cd.disabled = true;
      try{ await removeDoc(idea.col.doc(cd.dataset.idea).collection('comments').doc(cd.dataset.cdel), ipath(cd.dataset.idea, cd.dataset.cdel)); }catch(err){ cd.disabled = false; if(typeof sosTrouble === 'function') sosTrouble(err); } }
  });
  $i('#ideaList').addEventListener('submit', async e => {
    const f = e.target.closest('[data-idea]'); if(!f) return; e.preventDefault();
    const inp = f.querySelector('textarea, input[type="text"]'), b = inp.value.trim();
    const x = idea.items.find(y => y.id === f.dataset.idea); if(!x) return;
    let at = {}; try{ at = f._at ? f._at.get() : {}; }catch(err){ if(err.code === 'bad-url'){ if(typeof pushToast === 'function') pushToast('🔗 링크는 https://로 시작하는 주소만 넣을 수 있어요'); return; } throw err; }
    if(!b && !at.img) return;   // 글이 없어도 사진만 있으면 올라가요 (v19)
    inp.value = ''; delete idea.drafts[x.id]; if(idea.atDrafts) delete idea.atDrafts[x.id]; if(f._at) f._at.clear();
    try{
      const ref = idea.col.doc(x.id).collection('comments').doc(), k = secret();
      setIdeaKey(ipath(x.id, ref.id), k);
      await ref.set({b, ...at, kh: await sha(k), createdAt: firebase.firestore.FieldValue.serverTimestamp(), expireAt: x.expireAt});
    }catch(err){ inp.value = b; if(idea.atDrafts) idea.atDrafts[x.id] = at; if(typeof sosTrouble === 'function') sosTrouble(err); }
  });
})();
