/* 오늘도 독박육아 · 예방접종·영유아검진 날짜 계산기
   - 기준: 질병관리청 표준예방접종일정표(어린이, 0~6세)와 국민건강보험공단 영유아 건강검진(8차). 출처는 페이지 아래
   - 날짜는 '권장 시기'의 시작~끝을 생일에서 더해 계산해요. 실제 접종일은 소아과·예방접종도우미에서 확인해요
   - 입력한 생일은 이 휴대폰(localStorage)에만 남아요 */
(function(){
  const $ = s => document.querySelector(s);
  // [이름, 차수, 시작(개월), 끝(개월), 메모]  · 개월은 생일 기준 (0.03 ≈ 1일, 0.93 ≈ 4주)
  const VAC = [
    ['B형간염', '1차', 0, 0.03, '태어나서 바로'],
    ['결핵(BCG)', '1차', 0, 0.93, '생후 4주 안'],
    ['B형간염', '2차', 1, 2],
    ['디프테리아·파상풍·백일해(DTaP)', '1차', 2, 3], ['폴리오(IPV)', '1차', 2, 3], ['b형 헤모필루스(Hib)', '1차', 2, 3], ['폐렴구균(PCV)', '1차', 2, 3], ['로타바이러스', '1차', 2, 3, '먹는 백신'],
    ['디프테리아·파상풍·백일해(DTaP)', '2차', 4, 5], ['폴리오(IPV)', '2차', 4, 5], ['b형 헤모필루스(Hib)', '2차', 4, 5], ['폐렴구균(PCV)', '2차', 4, 5], ['로타바이러스', '2차', 4, 5],
    ['B형간염', '3차', 6, 7],
    ['디프테리아·파상풍·백일해(DTaP)', '3차', 6, 7], ['폴리오(IPV)', '3차', 6, 18, '6~18개월 사이'], ['b형 헤모필루스(Hib)', '3차', 6, 7], ['폐렴구균(PCV)', '3차', 6, 7], ['로타바이러스', '3차', 6, 7, '3회 맞는 백신만'],
    ['인플루엔자(독감)', '첫해 1·2차', 6, 7, '6개월부터 매년 가을. 처음 맞는 해는 4주 간격 2번'],
    ['홍역·유행성이하선염·풍진(MMR)', '1차', 12, 15], ['수두', '1차', 12, 15], ['b형 헤모필루스(Hib)', '4차', 12, 15], ['폐렴구균(PCV)', '4차', 12, 15],
    ['A형간염', '1차', 12, 23, '2차는 1차 6개월 뒤'],
    ['일본뇌염(불활성화)', '1·2차', 12, 23, '1차 1개월 뒤 2차 · 생백신은 일정이 달라요'],
    ['디프테리아·파상풍·백일해(DTaP)', '4차', 15, 18],
    ['일본뇌염(불활성화)', '3차', 24, 35, '2차 11개월 뒤'],
    ['디프테리아·파상풍·백일해(DTaP)', '5차', 48, 83, '만 4~6세'], ['폴리오(IPV)', '4차', 48, 83, '만 4~6세'], ['홍역·유행성이하선염·풍진(MMR)', '2차', 48, 83, '만 4~6세'],
    ['일본뇌염(불활성화)', '4차', 72, 83, '만 6세']];
  const CHK = [['영유아 건강검진', '1차', 0.46, 1.15, '생후 14~35일'], ['영유아 건강검진', '2차', 4, 6], ['영유아 건강검진', '3차', 9, 12], ['영유아 건강검진', '4차', 18, 24],
    ['영유아 건강검진', '5차', 30, 36], ['영유아 건강검진', '6차', 42, 48], ['영유아 건강검진', '7차', 54, 60], ['영유아 건강검진', '8차', 66, 71]];

  const addM = (d, m) => { const whole = Math.floor(m), days = Math.round((m - whole) * 30.4);
    const x = new Date(d.getFullYear(), d.getMonth() + whole, 1); const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(d.getDate(), last)); x.setDate(x.getDate() + days); return x; };
  const fmt = (d, y) => (y ? d.getFullYear() + '.' : '') + (d.getMonth() + 1) + '.' + d.getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  let st = {}; try{ st = JSON.parse(localStorage.getItem('dokbakKid') || '{}'); }catch(e){}
  const inp = $('#vxBirth');
  if(st.birth) inp.value = st.birth;
  const kind = {v: true, c: true};

  function render(){
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(inp.value || ''), out = $('#vxOut');
    if(!m){ out.innerHTML = '<p class="lp-empty">👆 태어난 날을 넣으면 접종·검진 날짜를 순서대로 보여 드려요.</p>'; return; }
    const birth = new Date(+m[1], +m[2] - 1, +m[3]);
    try{ st.birth = inp.value; localStorage.setItem('dokbakKid', JSON.stringify(st)); }catch(e){}
    const rows = [...(kind.v ? VAC.map(x => ({x, k: 'v'})) : []), ...(kind.c ? CHK.map(x => ({x, k: 'c'})) : [])]
      .map(({x: [n, ord, a, b, memo], k}) => { const s = addM(birth, a), e = addM(birth, b); return {n, ord, s, e, memo: memo || '', k}; })
      .sort((p, q) => p.s - q.s || (p.k === 'c') - (q.k === 'c'));
    let html = '', lastKey = '', nowDone = false;
    for(const r of rows){
      const key = r.s.getFullYear() + '-' + r.s.getMonth();
      if(key !== lastKey){ html += `<tr class="vx-mon"><td colspan="2">${r.s.getFullYear()}년 ${r.s.getMonth() + 1}월</td></tr>`; lastKey = key; }
      const state = r.e < today ? 'past' : r.s <= today ? 'now' : 'next';
      const tag = state === 'now' ? '<b class="vx-now">지금 맞을 때</b>' : '';
      html += `<tr class="vx-${state}${r.k === 'c' ? ' vx-chk' : ''}"><td>${r.k === 'c' ? '🩺' : '💉'} <b>${r.n}</b> ${r.ord} ${tag}${r.memo ? `<small>${r.memo}</small>` : ''}</td><td class="num">${fmt(r.s, true)}${+r.e - +r.s > 2 * 864e5 ? `<small>~ ${fmt(r.e, r.e.getFullYear() !== r.s.getFullYear())}</small>` : ''}</td></tr>`;
    }
    const soon = rows.filter(r => r.e >= today).slice(0, 3);
    out.innerHTML = (soon.length ? `<div class="lp-sum"><span>다음에 챙길 것</span>${soon.map(r => `<b style="font-size:16.5px;line-height:1.5">${r.k === 'c' ? '🩺' : '💉'} ${r.n} ${r.ord} · ${r.s <= today ? `지금 ~ ${fmt(r.e, true)}` : fmt(r.s, true)}</b>`).join('')}</div>` : '')
      + `<div class="lp-tw"><table class="lp-t vx-t"><thead><tr><th>접종·검진</th><th class="num">권장 날짜</th></tr></thead><tbody>${html}</tbody></table></div>`;
  }
  inp.addEventListener('input', render);
  document.querySelectorAll('#vxKind button').forEach(b => b.addEventListener('click', () => { kind[b.dataset.k] = !kind[b.dataset.k]; b.setAttribute('aria-pressed', String(kind[b.dataset.k])); render(); }));
  render();
})();
