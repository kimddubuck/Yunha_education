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
  const FEED = [   // [시작개월, 끝개월, (안 씀), 설명, 하루kcal, 끼니[최소,최대]|null, 간식, 컵[최소,최대]|null, 한 끼 양 글, 열량 기준]
    [0, 5, '', '모유나 분유만 먹어요. 아기가 원할 때마다 먹이고, 이유식은 아직이에요.', 500, null, '', null, '모유·분유', '0~5개월 기준'],
    [6, 8, '', '한 끼 2~3큰술로 시작해서 250mL 컵의 ½(약 125mL)까지 천천히 늘려요. 고기·달걀·채소를 날마다 넣고, 모유·분유는 그대로 먹여요.', 600, [2, 3], '', [0.1, 0.5], '2~3큰술 → ½컵', '6~11개월 기준'],
    [9, 11, '', '한 끼 250mL 컵의 ½(약 125mL)쯤이에요. 손으로 집어 먹는 음식도 주고, 모유·분유는 그대로 먹여요.', 600, [3, 4], '1~2', [0.5, 0.5], '½컵 (약 125mL)', '6~11개월 기준'],
    [12, 23, '', '한 끼 250mL 컵의 ¾~1컵(약 190~250mL)이에요. 하루 열량을 끼니로 나누면 한 끼 250~300kcal쯤이에요. 우유는 하루 400~500mL면 충분해요.', 900, [3, 4], '1~2', [0.75, 1], '¾~1컵 (190~250mL)', '1~2세 기준'],
    [24, 35, '', '한 끼 250~300kcal쯤, 어른 밥그릇의 ⅓~½ 정도예요. 단 음료·과자는 간식으로 치지 않아요.', 900, [3, 3], '1~2', null, '어른 밥그릇 ⅓~½', '1~2세 기준'],
    [36, 71, '', '한 끼 400~450kcal쯤, 어른 밥그릇의 ½~⅔ 정도예요. 어린이집 점심은 하루의 약 45%로 짜요.', 1400, [3, 3], '1~2', null, '어른 밥그릇 ½~⅔', '3~5세 기준'],
    [72, 95, '', '한 끼 500kcal 안팎이에요.', 1600, [3, 3], '1~2', null, '어른 밥그릇 ⅔ 정도', '6~8세 기준 (남 1,700·여 1,500)']];
  // 🩺 영유아 건강검진 8차 (2021년생부터)
  const CHECK = [['1차', 0.46, 1.15, '생후 14~35일'], ['2차', 4, 6, '4~6개월'], ['3차', 9, 12, '9~12개월'], ['4차', 18, 24, '18~24개월'], ['5차', 30, 36, '30~36개월'], ['6차', 42, 48, '42~48개월'], ['7차', 54, 60, '54~60개월'], ['8차', 66, 71, '66~71개월']];

  const y = $('#gy'), m = $('#gm'), out = $('#gout');
  const now = new Date();
  for(let i = now.getFullYear(); i >= now.getFullYear() - 8; i--) y.insertAdjacentHTML('beforeend', `<option value="${i}">${i}년</option>`);
  for(let i = 1; i <= 12; i++) m.insertAdjacentHTML('beforeend', `<option value="${i}">${i}월</option>`);
  let st = {}; try{ st = JSON.parse(localStorage.getItem('dokbakKid') || '{}'); }catch(e){}
  if(st.y) y.value = st.y; if(st.m) m.value = st.m;
  document.querySelectorAll('#gsex button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === (st.s || ''))));
  if(st.w) $('#gw').value = st.w; if(st.h) $('#gh').value = st.h; if(st.pre) $('#gpre').value = st.pre;

  function months(){
    const by = Number(y.value), bm = Number(m.value); if(!by || !bm) return null;
    const d = Number($('#gd').value) || 15;   // 날짜를 모르면 15일로 쳐요
    const birth = new Date(by, bm - 1, d);
    let n = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    if(now.getDate() < birth.getDate()) n--;
    return n < 0 ? null : n;
  }
  function render(){
    const n0 = months(), s = document.querySelector('#gsex [aria-pressed="true"]')?.dataset.v || '';
    // 37주 미만 출생은 두 돌까지 '교정 개월'(예정일 기준)로 키·몸무게를 봐요 (영유아 검진과 같은 방식)
    const pre = Number($('#gpre').value) || 0;
    const corr = n0 !== null && pre >= 3 && n0 < 24;
    const n = corr ? Math.max(0, Math.floor(n0 - pre * 7 / 30.44)) : n0;
    st = {y: y.value, m: m.value, s, w: $('#gw').value, h: $('#gh').value, pre: $('#gpre').value}; try{ localStorage.setItem('dokbakKid', JSON.stringify(st)); }catch(e){}
    if(n === null){ out.innerHTML = '<p class="src">태어난 해와 달을 골라 주세요.</p>'; return; }
    const yrs = Math.floor(n0 / 12), rem = n0 % 12;
    const pct = Math.min(100, Math.round(n0 / 72 * 100));
    let h = `<div class="box ghero"><div class="gage"><span class="gnum">${n0}</span><span class="gunit">개월</span></div><div class="gage-r"><b>만 ${yrs}세 ${rem}개월</b>${corr ? `<br><small style="color:var(--g-main);font-weight:700">교정 개월 ${n}개월 (예정일 기준, 키·몸무게는 이걸로 봐요)</small>` : ''}<div class="gbar"><i style="width:${pct}%"></i></div><small>0개월 ───────── 만 6세(72개월)</small></div>
      <p class="src" style="flex-basis:100%;margin:6px 0 0">태어난 날짜를 안 적으면 15일로 계산해요. 1~2주 차이는 아래 숫자에 거의 영향이 없어요.</p></div>`;
    // 📏 키·몸무게: 3~97백분위 범위 막대 + 내 아이 표시
    h += `<div class="box"><h2>📏 이 개월의 키·몸무게</h2>${corr ? `<p class="gck-now">${pre}주 일찍 태어나서 두 돌까지는 <b>교정 개월 ${n}개월</b> 기준으로 봐요. 영유아 검진도 같은 방식이에요.</p>` : ''}<p class="src" style="margin:-4px 0 6px">${n < 36 ? '대한민국 2017 소아청소년 성장도표 기준이에요 (영유아 검진 결과지와 같은 숫자).' : '36개월부터는 우리나라 성장도표 표를 아직 못 구해서 WHO 기준으로 대신 계산해요. 검진 결과지의 숫자가 기준이에요.'}</p>`;
    if(!s) h += '<p class="src">성별을 고르면 숫자가 보여요. 남녀 기준이 달라요.</p>';
    else if(n > 60) h += '<p class="src">WHO 기준은 60개월(만 5세)까지만 있어요. 그 뒤는 질병관리청 2017 성장도표를 봐 주세요 (아래 출처).</p>';
    else {
      const w = LMS[s + 'w'][n], hh = LMS[s + 'h'][n];
      const mw = Number($('#gw').value), mh = Number($('#gh').value);
      const band = (name, icon, lms, u, mine, dec) => {
        const lo = val(lms, Z[3]), mid = val(lms, Z[50]), hi = val(lms, Z[97]);
        const f = x => dec ? r1(x) : Math.round(x);
        // 막대는 1~99백분위(z ±2.33)를 전체 폭으로, 3~97 구간을 진하게
        const L0 = val(lms, -2.326), L1 = val(lms, 2.326), px = x => Math.max(0, Math.min(100, (x - L0) / (L1 - L0) * 100));
        let me = '';
        if(mine > 0){ const z = zOf(lms, mine), pc = Math.min(99, Math.max(1, Math.round(cdf(z) * 100))), rank = 101 - pc;   // 큰 순서로 몇 등 (1등 = 제일 큼)
          const tag = pc > 97 || pc < 3 ? '보통 범위 밖' : pc >= 85 ? '큰 편' : pc <= 15 ? '작은 편' : '보통';
          me = `<span class="gme" style="left:${px(mine).toFixed(1)}%"><i></i></span><p class="gme-t">${icon} 우리 아이 <b>${mine}${u}</b> → 같은 개월 ${s === 'b' ? '남' : '여'}아 100명 중 <b class="grank">${rank}등</b> <b>(${tag})</b> <small>· 검진 결과지의 백분위수로는 <b>${pc}</b></small>${pc > 97 || pc < 3 ? '<br><small>큰 순서로 센 등수예요. 보통 범위를 벗어나면 소아과에서 상의해요.</small>' : '<br><small>큰 순서로 센 등수예요. 1등이 제일 크고 100등이 제일 작아요.</small>'}</p>`; }
        return `<div class="gband"><div class="gband-h"><b>${icon} ${name}</b><span>${s === 'b' ? '남아' : '여아'} ${n}개월 100명 중${name === '키' && n < 24 ? ' · 누워서 잰 길이' : ''}</span></div>
          <div class="gtrack"><i class="grng" style="left:${px(lo).toFixed(1)}%;width:${(px(hi) - px(lo)).toFixed(1)}%"></i><i class="gmid" style="left:${px(mid).toFixed(1)}%"></i>${me ? me.split('</span>')[0] + '</span>' : ''}</div>
          <div class="glab"><span style="left:${px(lo).toFixed(1)}%">작은 편<br><b>${f(lo)}${u}</b><small>97등</small></span><span class="c" style="left:${px(mid).toFixed(1)}%">중간<br><b>${f(mid)}${u}</b><small>50등</small></span><span class="r" style="left:${px(hi).toFixed(1)}%">큰 편<br><b>${f(hi)}${u}</b><small>3등</small></span></div>${me ? me.split('</span>')[1] : ''}</div>`;
      };
      h += band('몸무게', '⚖️', w, 'kg', mw, true) + band('키', '📏', hh, 'cm', mh, true);
      h += `<p class="src">진한 막대가 보통 범위(100명 중 3등~97등)예요. ${n < 36 ? '우리나라 2017 성장도표는 0~35개월에 세계보건기구(WHO) 성장 기준을 그대로 쓰기 때문에 영유아 검진 결과와 같은 숫자예요.' : '36개월부터 우리나라 2017 성장도표는 한국 아이 자료로 따로 만들어져 있는데, 이 사이트는 그 표를 아직 못 구해서 세계보건기구(WHO) 기준으로 계산해요. 등수가 조금 다를 수 있으니 검진 결과지의 숫자가 기준이에요.'} 범위를 벗어나거나 등수가 갑자기 크게 바뀌면 소아과에서 상의해요.</p>`;
    }
    h += '</div>';
    // 🥄 먹는 양: 타일 3개 (끼니 · 한 끼 양 · 하루 열량)
    const f = FEED.find(x => n0 >= x[0] && x[1] >= n0);
    if(f){
      const kcal = n0 >= 72 ? (s === 'g' ? 1500 : 1700) : f[4], meals = f[5], snack = f[6], cup = f[7];
      const bowls = meals ? '🍚'.repeat(meals[0]) + (meals[1] > meals[0] ? '<span class="dim">🍚</span>' : '') : '🍼';
      const cupsvg = cup != null ? `<svg viewBox="0 0 40 48" class="gcup" aria-hidden="true"><path d="M6 6h28l-3 36H9z" fill="none" stroke="currentColor" stroke-width="2.5"/><clipPath id="cc"><path d="M6 6h28l-3 36H9z"/></clipPath><rect clip-path="url(#cc)" x="0" y="${(42 - 36 * cup[1] + 1).toFixed(1)}" width="40" height="${(36 * cup[1] + 6).toFixed(1)}" fill="currentColor" opacity=".35"/><rect clip-path="url(#cc)" x="0" y="${(42 - 36 * cup[0] + 1).toFixed(1)}" width="40" height="${(36 * cup[0] + 6).toFixed(1)}" fill="currentColor" opacity=".55"/></svg>` : '';
      h += `<div class="box"><h2>🥄 이 시기 하루 먹는 양</h2><div class="gtiles">
        <div class="gtile"><small>하루 끼니</small><b class="gbig">${meals ? `${meals[0]}${meals[1] > meals[0] ? '~' + meals[1] : ''}끼` : '수유만'}</b><span class="gic">${bowls}</span>${snack ? `<small>+ 간식 ${snack}번 🍎</small>` : '<small>원할 때마다, 하루 8~12번</small>'}</div>
        <div class="gtile"><small>한 끼 양</small>${cupsvg}<b>${f[8]}</b><small>${cup != null ? '250mL 컵 기준' : ''}</small></div>
        <div class="gtile"><small>하루 열량</small><b class="gbig">${kcal.toLocaleString()}<em>kcal</em></b><div class="gkbar"><i style="width:${Math.round(kcal / 1700 * 100)}%"></i></div><small>${f[9]}</small></div>
      </div><p class="gfeed">${f[3]}</p>
      <p class="src">열량은 2020 한국인 영양소 섭취기준의 '에너지 필요추정량'(평균 체격·보통 활동 기준)이고, 끼니 수와 한 끼 양은 WHO 이유식 안내예요. 아이마다 달라서 배고픔·배부름 신호가 먼저예요. 얼마나 먹을지는 아이가 정해요.</p></div>`;
    }
    // 🩺 검진: 8단계 타임라인
    const cur = CHECK.find(c => n0 >= c[1] && n0 <= c[2]), next = CHECK.find(c => c[1] > n0);
    h += '<div class="box"><h2>🩺 영유아 건강검진</h2>';
    if(cur) h += `<p class="gck-now">지금 <b>${cur[0]} 검진 시기</b>예요 (${cur[3]}). 아직 안 받았으면 소아과에 예약해요. 본인 부담은 없어요.</p>`;
    else if(next) h += `<p class="gck-now">다음은 <b>${next[0]} 검진</b>(${next[3]})이에요. <b>${Math.max(0, Math.ceil(next[1] - n0))}개월</b>쯤 뒤예요.</p>`;
    else h += '<p class="gck-now">8차(66~71개월)까지 모두 지났어요. 다음은 초등학교 입학 뒤 학생 건강검사예요.</p>';
    h += `<ol class="gtl">${CHECK.map(c => { const st = cur === c ? 'now' : n0 > c[2] ? 'done' : ''; return `<li class="${st}"><i>${st === 'done' ? '✓' : c[0].replace('차', '')}</i><b>${c[0]}</b><span>${c[3]}</span></li>`; }).join('')}</ol>`;
    h += '<p class="src">1차(생후 14~35일)는 2021년생부터예요. 검진은 국민건강보험공단이 지정한 소아과·병원에서 받고, 키·몸무게·머리둘레 백분위와 발달 선별검사(K-DST)를 해요. 자세한 건 <a href="tips.html">육아 상식</a>의 영유아 건강검진 글을 봐 주세요.</p></div>';
    out.innerHTML = h;
  }
  [y, m, $('#gd'), $('#gw'), $('#gh'), $('#gpre')].forEach(el => el.addEventListener('input', render));
  $('#gsex').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; document.querySelectorAll('#gsex button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(); });
  render();
})();
