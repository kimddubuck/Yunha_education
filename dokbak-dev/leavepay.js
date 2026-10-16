/* 오늘도 독박육아 · 육아휴직 급여 계산기
   - 기준: 고용24 육아휴직급여 제도안내, 고용노동부 6+6 부모육아휴직제 안내, 고용보험법 시행령 제95조·제95조의3 (출처는 페이지 아래)
   - 일반: 1~3개월 통상임금 100%(상한 250만), 4~6개월 100%(상한 200만), 7개월부터 80%(상한 160만), 하한 70만
   - 한부모: 1~3개월 상한 300만, 그 뒤는 일반과 같아요
   - 6+6: 부모 각자 첫 6개월 100%, 상한 250·250·300·350·400·450만, 7개월부터 일반
   - 입력한 값은 이 휴대폰(localStorage)에만 남고 서버로 보내지 않아요. */
(function(){
  const $ = s => document.querySelector(s);
  const MAN = 10000;
  const CAP66 = [250, 250, 300, 350, 400, 450];
  const FLOOR = 70;
  // i: 몇 번째 달(1부터), w: 통상임금(만 원), mode: g 일반 · s 6+6 · h 한부모
  function cap(i, mode){
    if(mode === 's' && i <= 6) return {rate: 100, cap: CAP66[i - 1]};
    if(i <= 3) return {rate: 100, cap: mode === 'h' ? 300 : 250};
    if(i <= 6) return {rate: 100, cap: 200};
    return {rate: 80, cap: 160};
  }
  function pay(i, w, mode){
    const c = cap(i, mode);
    const raw = w * c.rate / 100;
    const v = Math.max(Math.min(raw, c.cap), FLOOR);
    return {v, c, why: raw < FLOOR ? 'floor' : raw > c.cap ? 'cap' : 'rate'};
  }
  const won = v => Math.round(v * MAN).toLocaleString('ko-KR') + '원';
  const man = v => (Math.round(v * 10) / 10).toLocaleString('ko-KR') + '만 원';

  const st = {mode: 'g', w: '', n: 12, w2: '', n2: 6, d: '', d2: ''};
  // 휴직 시작일 기준 i번째 달의 기간 (예: 11/10 시작 → 1개월째 11/10~12/9). 날짜가 없으면 null
  const pad = n => String(n).padStart(2, '0');
  const addM = (d, k) => { const x = new Date(d.getFullYear(), d.getMonth() + k, 1); const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(d.getDate(), last)); return x; };
  const parseD = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const fmt = (d, year) => (year ? d.getFullYear() + '.' : '') + (d.getMonth() + 1) + '.' + d.getDate();
  function span(start, i){
    if(!start) return null;
    const a = addM(start, i - 1), b = new Date(addM(start, i).getTime() - 86400000);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return {a, b, now: a <= today && today <= b, past: b < today};
  }
  try{ Object.assign(st, JSON.parse(localStorage.getItem('dokbakLeave') || '{}')); }catch(e){}
  const save = () => { try{ localStorage.setItem('dokbakLeave', JSON.stringify(st)); }catch(e){} };

  const maxN = () => st.mode === 's' ? 18 : 12;
  function fillMonths(sel, max, val){
    sel.innerHTML = Array.from({length: max}, (_, k) => `<option value="${k + 1}">${k + 1}개월</option>`).join('');
    sel.value = String(Math.min(val, max));
  }

  function table(w, n, mode, start){
    let sum = 0, end = null;
    const rows = [];
    for(let i = 1; i <= n; i++){
      const p = pay(i, w, mode); sum += p.v;
      const note = p.why === 'cap' ? `상한 ${p.c.cap}만 원` : p.why === 'floor' ? '하한 70만 원' : `통상임금 ${p.c.rate}%`;
      const sp = span(start, i); if(sp) end = sp.b;
      const when = sp ? `<small>${fmt(sp.a, i === 1 || sp.a.getMonth() === 0)}~${fmt(sp.b)}</small>` : '';
      rows.push(`<tr${sp && sp.now ? ' class="lp-now"' : sp && sp.past ? ' class="lp-past"' : ''}><td>${i}개월째${sp && sp.now ? ' <b>← 이번 달</b>' : ''}${when}</td><td>${note}</td><td class="num">${won(p.v)}</td></tr>`);
    }
    return {sum, end, html: `<div class="lp-tw"><table class="lp-t"><thead><tr><th>달</th><th>계산</th><th class="num">받는 돈</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`};
  }

  function render(){
    document.querySelectorAll('#lpMode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === st.mode)));
    $('#lpPartner').hidden = st.mode !== 's';
    fillMonths($('#lpN'), maxN(), st.n);
    fillMonths($('#lpN2'), 18, st.n2);
    st.n = Number($('#lpN').value);
    const w = Number(st.w), out = $('#lpOut');
    if(!(w > 0)){ out.innerHTML = '<p class="lp-empty">👆 통상임금을 넣으면 달마다 받는 돈을 계산해 드려요.</p>'; return; }
    const start = parseD(st.d), start2 = parseD(st.d2);
    const me = table(w, st.n, st.mode, start);
    let html = `<div class="lp-sum"><span>${st.mode === 's' ? '나' : '육아휴직'} ${st.n}개월 동안</span><b>${won(me.sum)}</b><small>한 달 평균 ${man(me.sum / st.n)}${start ? ` · ${fmt(start, true)}부터 ${fmt(me.end, true)}까지` : ''}</small></div>`;
        if(st.mode === 's'){
      const w2 = Number(st.w2);
      if(w2 > 0){
        const you = table(w2, st.n2, 's', start2);
        html += `<div class="lp-sum lp-sum2"><span>배우자 ${st.n2}개월 동안</span><b>${won(you.sum)}</b><small>부부 합계 ${won(me.sum + you.sum)}${start2 ? ` · ${fmt(start2, true)}부터 ${fmt(you.end, true)}까지` : ''}</small></div>`;
        const alone = table(w, st.n, 'g', null).sum;
        html += `<p class="lp-cmp">같은 조건에서 나만 쓰면(일반 육아휴직 급여) <b>${won(alone)}</b>이에요. 6+6으로 나는 <b>${won(me.sum - alone)}</b> 더 받아요.</p>`;
        html += `<details class="lp-d" open><summary>📋 나 · 달마다</summary>${me.html}</details><details class="lp-d"><summary>📋 배우자 · 달마다</summary>${you.html}</details>`;
      } else {
        html += `<p class="lp-cmp">배우자 통상임금도 넣으면 부부 합계와 일반 급여와의 차이를 보여 드려요.</p><details class="lp-d" open><summary>📋 달마다</summary>${me.html}</details>`;
      }
      if(st.n > 12) html += '<p class="lp-warn">12개월이 넘는 휴직(최대 1년 6개월)은 부모가 각각 3개월 이상 육아휴직을 쓸 때 가능해요.</p>';
    } else {
      html += `<details class="lp-d" open><summary>📋 달마다</summary>${me.html}</details>`;
    }
    out.innerHTML = html;
  }

  $('#lpMode').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; st.mode = b.dataset.v; save(); render(); });
  const bind = (id, k, num) => { const el = $(id); el.value = st[k]; el.addEventListener('input', () => { st[k] = num ? el.value.replace(/[^\d.]/g, '') : el.value; save(); render(); }); };
  bind('#lpW', 'w', true); bind('#lpW2', 'w2', true); bind('#lpD', 'd'); bind('#lpD2', 'd2');
  $('#lpN').addEventListener('change', e => { st.n = Number(e.target.value); save(); render(); });
  $('#lpN2').addEventListener('change', e => { st.n2 = Number(e.target.value); save(); render(); });
  render();
})();
