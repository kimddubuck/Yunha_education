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
  const won = v => Math.round(v * MAN).toLocaleString('ko-KR') + '원';   // v: 만 원
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

  // 6+6 특례는 부모가 "공통으로 쓴 개월"에만 붙어요 (고용노동부 안내).
  //  - 내 k개월째 상향분은 배우자도 k개월째를 다 써야 붙어요. 그 전에 받는 달은 일반 급여로 먼저 받고, 배우자의 k개월째가 끝나면 차액을 받아요(달마다 따로).
  //  - 배우자가 3개월만 쓰면 나도 3개월째까지만 특례예요.
  // w 통상임금, n 내 개월수, mode g/s/h, start 내 시작일, other = {start, n} 배우자 (6+6일 때만)
  function table(w, n, mode, start, other){
    let sum = 0, end = null, diff = 0;
    const common = mode === 's' ? Math.min(6, n, other && other.n ? other.n : 6) : 0;
    const rows = [];      // 내 휴직 달 (달마다 한 줄)
    const extra = {};     // 휴직이 끝난 뒤에 들어오는 차액 {'2027-1': [{i, d}]}
    const late = [];      // [due 날짜, i, d] 차액 (배우자 i개월째가 끝난 다음 날 기준)
    for(let i = 1; i <= n; i++){
      const sp = span(start, i); if(sp) end = sp.b;
      let m = mode, later = null;
      if(mode === 's' && i <= 6){
        if(i > common) m = 'g';
        else if(sp && other && other.start){ const o = span(other.start, i); if(o.b > sp.b){ m = 'g'; later = o.b; } }
      }
      const p = pay(i, w, m); sum += p.v;
      const base = p.why === 'cap' ? `상한 ${p.c.cap}만 원` : p.why === 'floor' ? '하한 70만 원' : `통상임금 ${p.c.rate}%`;
      const note = later ? `${base} <small>차액은 배우자 ${i}개월째 뒤에</small>` : (mode === 's' && i <= 6 && i > common) ? `${base} <small>배우자 ${common}개월만 써서 6+6 아님</small>` : base;
      rows.push({i, sp, v: p.v, note, add: []});
      if(later){ const full = pay(i, w, 's').v, d = full - p.v; if(d > 0){ diff += d; late.push([new Date(later.getTime() + 86400000), i, d, full, p.v]); } }
    }
    // 차액을 실제로 들어오는 달 줄에 더해요
    for(const [due, i, d, full, got] of late){
      const r = rows.find(x => x.sp && x.sp.a <= due && due <= x.sp.b);
      if(r){ r.add.push([i, d, full, got]); continue; }
      const k = due.getFullYear() + '-' + (due.getMonth() + 1); (extra[k] = extra[k] || {due, list: []}).list.push([i, d, full, got]);
    }
    // "3개월째 차액 50만 (6+6 300만 − 받은 250만)" 처럼 뺄셈을 같이 적어요
    const addTxt = add => add.map(([i, d, full, got]) => `${i}개월째 차액 ${man(d)} <small>${full}만 − ${got}만</small>`).join('<br>');
    const settleBox = late.length ? `<p class="lp-total">💸 6+6 정산 모두: ${late.map(x => man(x[2])).join(' + ')} = <b>${man(diff)}</b> <small>(${won(diff)}, ${late.length}번에 나눠서)</small></p>` : '';
    const html = rows.map(r => { const sp = r.sp, tot = r.v + r.add.reduce((a, [, d]) => a + d, 0);
      const when = sp ? `<small>${fmt(sp.a, r.i === 1 || sp.a.getMonth() === 0)}~${fmt(sp.b)}</small>` : '';
      return `<tr${sp && sp.now ? ' class="lp-now"' : sp && sp.past ? ' class="lp-past"' : ''}${r.add.length ? ' data-add="1"' : ''}><td>${r.i}개월째${sp && sp.now ? ' <b>← 이번 달</b>' : ''}${when}</td><td>${r.note}${r.add.length ? `<br><b>+ ${addTxt(r.add)}</b>` : ''}</td><td class="num">${man(tot)}</td></tr>`; })
      .concat(Object.values(extra).sort((a, b) => a.due - b.due).map(x => { const tot = x.list.reduce((a, [, d]) => a + d, 0);
        return `<tr data-add="1"><td>휴직 끝난 뒤<small>${x.due.getFullYear()}.${x.due.getMonth() + 1}</small></td><td><b>${addTxt(x.list)}</b></td><td class="num">${man(tot)}</td></tr>`; })).join('') + (late.length ? `<tr class="lp-tot"><td colspan="2">6+6 정산 합계 <small>${late.map(x => man(x[2])).join(' + ')}</small></td><td class="num">${man(diff)}</td></tr>` : '');
    sum += diff;
    return {sum, end, diff, common, html: `<div class="lp-tw"><table class="lp-t"><thead><tr><th>달</th><th>계산</th><th class="num">받는 돈</th></tr></thead><tbody>${html}</tbody></table></div>${settleBox}`};
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
    const me = table(w, st.n, st.mode, start, st.mode === 's' ? {start: start2, n: Number(st.w2) > 0 ? st.n2 : 6} : null);
    let html = `<div class="lp-sum"><span>${st.mode === 's' ? '나' : '육아휴직'} ${st.n}개월 동안</span><b>${won(me.sum)}</b><small>${me.diff > 0 ? `6+6 정산 ${man(me.diff)} 포함 · ` : ''}한 달 평균 ${man(me.sum / st.n)}${start ? ` · ${fmt(start, true)}부터 ${fmt(me.end, true)}까지` : ''}</small></div>`;
        if(st.mode === 's'){
      const w2 = Number(st.w2);
      if(w2 > 0){
        const you = table(w2, st.n2, 's', start2, {start, n: st.n});
        html += `<div class="lp-sum lp-sum2"><span>배우자 ${st.n2}개월 동안</span><b>${won(you.sum)}</b><small>${you.diff > 0 ? `6+6 정산 ${man(you.diff)} 포함 · ` : ''}부부 합계 ${won(me.sum + you.sum)}${start2 ? ` · ${fmt(start2, true)}부터 ${fmt(you.end, true)}까지` : ''}</small></div>`;
        const alone = table(w, st.n, 'g', null, null).sum;
        html += `<p class="lp-cmp">같은 조건에서 나만 쓰면(일반 육아휴직 급여) <b>${won(alone)}</b>이에요. 6+6으로 나는 <b>${won(me.sum - alone)}</b> 더 받아요.</p>`;
        if(me.common < Math.min(6, st.n) || you.common < Math.min(6, st.n2)) html += `<p class="lp-cmp">6+6 상향은 두 사람이 <b>공통으로 쓴 ${me.common}개월</b>에만 붙어요. 한 사람이 ${me.common}개월만 쓰면 다른 사람도 ${me.common}개월째까지만 올라가요.</p>`;
        if(me.diff > 0 || you.diff > 0) html += `<p class="lp-cmp">${me.diff > 0 ? '내가' : '배우자가'} 먼저 시작했어요. 내 k개월째 상향분은 배우자도 k개월째를 다 써야 붙어요. 그래서 먼저 쓴 사람은 보통 급여로 받다가, 배우자의 1개월째·2개월째…가 끝날 때마다 그달 차액이 더해져 들어와요(모두 <b>${won(me.diff || you.diff)}</b>). 아래 표의 굵은 줄이 그 달이에요.</p>`;
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
