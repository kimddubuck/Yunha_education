/* 오늘도 독박육아 · 우리 아이 지금 (성장·식사량·검진)
   - 키·몸무게: WHO 아동 성장 기준(2006) LMS 표 (0~60개월, 남녀). 질병관리청 2017 소아청소년 성장도표는 0~35개월에 이 기준을 그대로 써요.
   - 입력한 생년월·성별·키·몸무게는 이 휴대폰(localStorage)에만 남고 서버로 보내지 않아요. */
(function(){
  const $ = s => document.querySelector(s);
  const LMS = window.WHO_LMS;   // {bw,bh,gw,gh}: [L,M,S] × 61개월
  const Z = {3: -1.8808, 50: 0, 97: 1.8808};
  const val = (lms, z) => { const [L, M, S] = lms; return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L); };
  const zOf = (lms, x) => { const [L, M, S] = lms; return L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S); };
  const cdf = z => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
  const r1 = x => Math.round(x * 10) / 10;

  // 🥄 시기별 먹는 양 (출처는 페이지 아래)
  const FEED = [
    [0, 5, '모유나 분유만 먹어요. 하루 약 500kcal (0~5개월 에너지 필요추정량).', '아기가 원할 때마다, 보통 하루 8~12번이에요. 이유식은 아직이에요.'],
    [6, 8, '이유식 하루 2~3끼 + 모유·분유. 하루 약 600kcal (6~11개월 기준).', '한 끼 2~3큰술로 시작해서 250mL 컵의 ½(약 125mL)까지 천천히 늘려요. 고기·달걀·채소를 날마다 넣어요.'],
    [9, 11, '이유식 하루 3~4끼 + 간식 1~2번 + 모유·분유. 하루 약 600kcal.', '한 끼 250mL 컵의 ½(약 125mL)쯤이에요. 손으로 집어 먹는 음식도 줘요.'],
    [12, 23, '밥 하루 3~4끼 + 간식 1~2번. 하루 약 900kcal (1~2세 기준).', '한 끼 250mL 컵의 ¾~1컵(약 190~250mL)이에요. 하루 열량을 끼니로 나누면 한 끼 250~300kcal쯤이에요. 우유는 하루 400~500mL 정도면 충분해요.'],
    [24, 35, '밥 하루 3끼 + 간식 1~2번. 하루 약 900kcal (1~2세 기준).', '한 끼 250~300kcal쯤이에요. 어른 밥그릇의 ⅓~½ 정도예요. 단 음료·과자는 간식으로 치지 않아요.'],
    [36, 71, '밥 하루 3끼 + 간식 1~2번. 하루 약 1,400kcal (3~5세 기준).', '한 끼 400~450kcal쯤이에요. 어른 밥그릇의 ½~⅔ 정도예요. 어린이집 점심은 하루의 약 45%로 짜요.'],
    [72, 95, '밥 하루 3끼 + 간식 1~2번. 하루 약 1,700kcal(남)·1,500kcal(여) (6~8세 기준).', '한 끼 500kcal 안팎이에요.']];
  // 🩺 영유아 건강검진 8차 (2021년생부터)
  const CHECK = [['1차', 0.46, 1.15, '생후 14~35일'], ['2차', 4, 6, '4~6개월'], ['3차', 9, 12, '9~12개월'], ['4차', 18, 24, '18~24개월'], ['5차', 30, 36, '30~36개월'], ['6차', 42, 48, '42~48개월'], ['7차', 54, 60, '54~60개월'], ['8차', 66, 71, '66~71개월']];

  const y = $('#gy'), m = $('#gm'), out = $('#gout');
  const now = new Date();
  for(let i = now.getFullYear(); i >= now.getFullYear() - 8; i--) y.insertAdjacentHTML('beforeend', `<option value="${i}">${i}년</option>`);
  for(let i = 1; i <= 12; i++) m.insertAdjacentHTML('beforeend', `<option value="${i}">${i}월</option>`);
  let st = {}; try{ st = JSON.parse(localStorage.getItem('dokbakKid') || '{}'); }catch(e){}
  if(st.y) y.value = st.y; if(st.m) m.value = st.m;
  document.querySelectorAll('#gsex button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === (st.s || ''))));
  if(st.w) $('#gw').value = st.w; if(st.h) $('#gh').value = st.h;

  function months(){
    const by = Number(y.value), bm = Number(m.value); if(!by || !bm) return null;
    const d = Number($('#gd').value) || 15;   // 날짜를 모르면 15일로 쳐요
    const birth = new Date(by, bm - 1, d);
    let n = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    if(now.getDate() < birth.getDate()) n--;
    return n < 0 ? null : n;
  }
  function render(){
    const n = months(), s = document.querySelector('#gsex [aria-pressed="true"]')?.dataset.v || '';
    st = {y: y.value, m: m.value, s, w: $('#gw').value, h: $('#gh').value}; try{ localStorage.setItem('dokbakKid', JSON.stringify(st)); }catch(e){}
    if(n === null){ out.innerHTML = '<p class="src">태어난 해와 달을 골라 주세요.</p>'; return; }
    const yrs = Math.floor(n / 12), rem = n % 12;
    let h = `<div class="box"><h2>👶 지금 <b>${n}개월</b> (만 ${yrs}세 ${rem}개월)</h2><p class="src">태어난 날짜를 안 적으면 15일로 계산해요. 1~2주 차이는 아래 숫자에 거의 영향이 없어요.</p></div>`;
    // 📏 키·몸무게
    h += '<div class="box"><h2>📏 이 개월의 키·몸무게 (WHO 성장 기준)</h2>';
    if(!s) h += '<p class="src">성별을 고르면 숫자가 보여요. 남녀 기준이 달라요.</p>';
    else if(n > 60) h += '<p class="src">WHO 기준은 60개월(만 5세)까지만 있어요. 그 뒤는 질병관리청 2017 성장도표를 봐 주세요 (아래 출처).</p>';
    else {
      const w = LMS[s + 'w'][n], hh = LMS[s + 'h'][n], lab = n < 24 ? '키<small>누워서 잰 길이</small>' : '키<small>서서 잰 키</small>';
      const row = (name, lms, u, d) => `<tr><th>${name}</th><td>${(d ? r1 : Math.round)(val(lms, Z[3]))}${u}</td><td><b>${(d ? r1 : Math.round)(val(lms, Z[50]))}${u}</b></td><td>${(d ? r1 : Math.round)(val(lms, Z[97]))}${u}</td></tr>`;
      h += `<table class="gt"><thead><tr><th></th><th>작은 편<br><small>3백분위</small></th><th>중간<br><small>50백분위</small></th><th>큰 편<br><small>97백분위</small></th></tr></thead><tbody>${row('몸무게', w, 'kg', true)}${row(lab, hh, 'cm', true)}</tbody></table>`;
      h += `<p class="src">${s === 'b' ? '남자' : '여자'} 아이 ${n}개월 기준이에요. 3~97백분위 사이면 100명 중 94명이 들어가는 보통 범위예요. 범위를 벗어나거나 갑자기 백분위가 크게 바뀌면 소아과에서 상의해요.</p>`;
      const mw = Number($('#gw').value), mh = Number($('#gh').value);
      if(mw > 0 || mh > 0){
        const pc = (lms, x) => Math.round(cdf(zOf(lms, x)) * 100);
        const line = (nm, lms, x, u) => { const p = Math.min(99, Math.max(1, pc(lms, x))); return `<li><b>${nm} ${x}${u}</b> → 약 <b>${p}백분위</b> (같은 개월 아이 100명 중 ${p}번째쯤)</li>`; };
        h += `<ul class="glist">${mw > 0 ? line('몸무게', w, mw, 'kg') : ''}${mh > 0 ? line('키', hh, mh, 'cm') : ''}</ul>`;
      }
      if(n >= 36) h += '<p class="src">36개월부터는 질병관리청 2017 성장도표가 우리나라 아이 자료로 따로 만들어져 있어서 WHO 숫자와 조금 달라요. 검진 결과지의 백분위가 기준이에요.</p>';
    }
    h += '</div>';
    // 🥄 먹는 양
    const f = FEED.find(x => n >= x[0] && n <= x[1]);
    if(f) h += `<div class="box"><h2>🥄 이 시기 하루 먹는 양</h2><p><b>${f[2]}</b></p><p>${f[3]}</p><p class="src">열량은 2020 한국인 영양소 섭취기준의 '에너지 필요추정량'(평균 아이 기준)이고, 끼니 수와 한 끼 양은 WHO 이유식 안내예요. 아이마다 먹는 양이 달라서 배고픔·배부름 신호가 먼저예요. 얼마나 먹을지는 아이가 정해요.</p></div>`;
    // 🩺 검진
    const cur = CHECK.find(c => n >= c[1] && n <= c[2]), next = CHECK.find(c => c[1] > n);
    h += '<div class="box"><h2>🩺 영유아 건강검진</h2>';
    if(cur) h += `<p><b>지금 ${cur[0]} 검진 시기(${cur[3]})예요.</b> 아직 안 받았으면 소아과에 예약해요. 본인 부담은 없어요.</p>`;
    else if(next) h += `<p>다음은 <b>${next[0]} 검진(${next[3]})</b>이에요. ${Math.max(0, Math.ceil(next[1] - n))}개월쯤 뒤예요.</p>`;
    else h += '<p>영유아 건강검진 8차(66~71개월)까지 모두 지났어요. 다음은 초등학교 입학 뒤 학생 건강검사예요.</p>';
    h += `<ul class="glist gck">${CHECK.map(c => `<li${cur === c ? ' class="on"' : ''}><b>${c[0]}</b> ${c[3]}${c[0] === '1차' ? ' <small>(2021년생부터)</small>' : ''}</li>`).join('')}</ul>`;
    h += '<p class="src">검진은 국민건강보험공단이 지정한 소아과·병원에서 받아요. 키·몸무게·머리둘레 백분위와 발달 선별검사(K-DST)를 해요. 자세한 건 <a href="tips.html">육아 상식</a>의 영유아 건강검진 글을 봐 주세요.</p></div>';
    out.innerHTML = h;
  }
  [y, m, $('#gd'), $('#gw'), $('#gh')].forEach(el => el.addEventListener('input', render));
  $('#gsex').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; document.querySelectorAll('#gsex button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(); });
  render();
})();
