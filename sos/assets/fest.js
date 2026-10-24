/* 🎪 축제 탭: 방장이 정한 📍 우리 동네의 시·도 축제 (한국관광공사 TourAPI → 우리 서버 /api/fest)
   - 시·도(예: 부산) 전체를 보여 주고, 우리 구(동래구) 축제와 아이랑 가기 좋아 보이는 축제를 위에 올려요
   - 축제마다 '🙌 같이 갈 모임 열기'로 그 날짜 모임 만들기에 바로 가요 */
(function(){
  const $f = s => document.querySelector(s);
  const list = $f('#festList');
  // 주소(addr1) 맨 앞으로 시·도를 가려요 ('광주'는 경기도 광주시와 헷갈리지 않게 '광주광역시'로)
  const SIDO_ADDR = {서울: ['서울'], 부산: ['부산'], 대구: ['대구'], 인천: ['인천'], 광주: ['광주광역시'], 대전: ['대전'], 울산: ['울산'], 세종: ['세종'], 경기: ['경기'], 강원: ['강원'],
    충북: ['충청북도', '충북'], 충남: ['충청남도', '충남'], 전북: ['전라북도', '전북'], 전남: ['전라남도', '전남'], 경북: ['경상북도', '경북'], 경남: ['경상남도', '경남'], 제주: ['제주']};
  const KID = /어린이|아이|키즈|가족|동화|그림책|유아|체험|놀이|인형|캐릭터|과학|동물|뮤지컬/;
  const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const dash = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const md = s => `${+s.slice(4, 6)}/${+s.slice(6, 8)}`;
  const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  let range = 'wk', rows = null, area = '';

  function span(){
    const t = new Date(); t.setHours(0, 0, 0, 0); const wd = t.getDay();
    if(range === 'wk'){ const sat = wd === 0 ? plus(t, -1) : plus(t, 6 - wd); const a = wd === 0 || wd === 6 ? t : sat; return [ymd(a), ymd(plus(sat, 1))]; }
    if(range === '2w') return [ymd(t), ymd(plus(t, 13))];
    return [ymd(t), ymd(new Date(t.getFullYear(), t.getMonth() + 1, 0))];
  }
  function draw(){
    if(!rows) return;
    const [sd, gu] = area.split(' '), pre = SIDO_ADDR[sd] || [], [a, b] = span();
    const mine = rows.filter(r => pre.some(p => r.a.startsWith(p)) && r.s <= b && r.e >= a)
      .map(r => ({...r, gu: !!gu && r.a.includes(' ' + gu), kid: KID.test(r.t)}))
      .sort((x, y) => (y.gu - x.gu) || (y.kid - x.kid) || x.s.localeCompare(y.s));
    $f('#festH').textContent = `🎪 ${sd} 축제`;
    if(!mine.length){ list.innerHTML = `<li class="hint">${range === 'wk' ? '이번 주말' : range === '2w' ? '2주 안' : '이번 달'}에 ${esc(sd)}에서 열리는 축제가 아직 없어요.${range !== 'mo' ? ' 기간을 넓혀 보세요.' : ''}</li>`; return; }
    list.innerHTML = '';
    mine.forEach(r => {
      const li = document.createElement('li'); li.className = 'fest-card';
      const go = r.s > a ? r.s : a;   // 모임 날짜: 기간 안에서 축제가 열리는 첫날
      li.innerHTML = `${r.img ? `<img class="fest-img" src="${esc(r.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
        <div class="fest-body"><p class="fest-tags">${r.gu ? '<span class="fest-tag">📍 우리 동네</span>' : ''}${r.kid ? '<span class="fest-tag">👶 아이랑</span>' : ''}</p>
        <b class="fest-t"></b><p class="fest-when">🗓 ${md(r.s)}${r.e !== r.s ? ` ~ ${md(r.e)}` : ''}</p><p class="fest-addr"></p>
        <div class="fest-btns"><a class="btn" href="meet.html?d=${dash(go)}#new">🙌 같이 갈 모임 열기</a>${r.x && r.y ? `<a class="btn" href="https://map.kakao.com/link/map/${encodeURIComponent(r.t)},${r.y},${r.x}" target="_blank" rel="noopener">🗺 지도</a>` : ''}</div></div>`;
      li.querySelector('.fest-t').textContent = r.t;
      li.querySelector('.fest-addr').textContent = '📍 ' + r.a;
      const im = li.querySelector('.fest-img'); if(im) im.addEventListener('error', () => im.remove());
      list.appendChild(li);
    });
  }
  $f('#festTabs').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if(!b) return; range = b.dataset.r;
    document.querySelectorAll('#festTabs [data-r]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); });

  if(typeof sosReady !== 'function' || !roomRef()){ list.innerHTML = '<li class="hint">방에 들어가면 우리 동네 축제가 보여요.</li>'; return; }
  sosReady().then(async ok => {
    if(!ok){ list.innerHTML = '<li class="hint">불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</li>'; return; }
    try{ area = ((await roomRef().get()).data() || {}).area || ''; }catch(e){}
    if(!area){ list.innerHTML = `<li class="hint">📍 아직 우리 동네가 정해지지 않았어요.<br>${ME.owner || ROOM.owner ? '<a href="index.html">홈</a>의 <b>📍 우리 동네 정하기</b>에서 고르면 그 시·도 축제가 보여요.' : '방장이 홈에서 <b>📍 우리 동네</b>를 정하면 그 시·도 축제가 보여요.'}</li>`; return; }
    try{
      const r = await fetch('/api/fest', {signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined}), j = await r.json().catch(() => ({}));
      if(!j.ok){ list.innerHTML = `<li class="hint">${/KEY|need_key|SERVICE/i.test(j.error || '') ? '🎪 축제 정보를 준비하고 있어요. 곧 열려요.' : '축제 정보를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'}</li>`; return; }
      rows = j.rows || []; draw();
    }catch(e){ list.innerHTML = '<li class="hint">축제 정보를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</li>'; }
  });
})();
