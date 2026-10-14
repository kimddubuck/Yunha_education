/* 🗺 육아 지도 — 내 주변 소아청소년과 · 문 연 약국 (공공데이터, /api/near 가 대신 물어봐요)
   위치는 이 휴대폰에서만 쓰고 저장하지 않아요. 서버에는 약 100m 단위로 반올림한 좌표만 보내요. */
(function(){
  const $ = s => document.querySelector(s);
  const HOME = [35.2049, 129.0838];   // 위치를 못 받으면: 부산 동래구 근처에서 시작
  const KIND = {
    peds: { icon: '🏥', name: '소아청소년과', empty: '근처에서 소아청소년과를 찾지 못했어요.' },
    pharm: { icon: '💊', name: '약국', empty: '근처에서 약국을 찾지 못했어요.' },
    care: { icon: '🤝', name: '육아 지원 시설', empty: '이 지역 자료에는 아직 육아 지원 시설이 없어요.' },
    play: { icon: '🛝', name: '놀이시설', empty: '근처에서 키즈카페·공공 놀이시설을 찾지 못했어요.' }
  };
  const NOHOURS = k => k === 'care' || k === 'play';   // 운영시간 자료가 없는 종류
  const ymd = v => v ? `${v.slice(0, 4)}.${Number(v.slice(4, 6))}.${Number(v.slice(6, 8))}` : '';
  const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
  const CARE_K = { c: ['🏫', '육아종합지원센터'], n: ['🤝', '공동육아나눔터'] };
  const st = { kind: 'peds', center: null, rows: [], layer: null, me: null, moved: false, openOnly: false };
  const map = L.map('map', { zoomControl: false, attributionControl: true }).setView(HOME, 14);
  L.control.zoom({ position: 'bottomright' }).addTo(map);   // 확대 버튼은 오른쪽 아래 (정보창을 가리지 않게)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
  st.layer = L.layerGroup().addTo(map);

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const km = d => d >= 1000 ? (d / 1000).toFixed(1) + 'km' : d + 'm';
  const hhmm = v => { if (v == null) return ''; const s = String(v).padStart(4, '0'); return s.slice(0, 2) + ':' + s.slice(2); };
  // 약국 '지금 영업 중': 오늘 시작~끝 시각 (밤샘이면 끝이 2400 넘거나 시작보다 작아요)
  // 소아과는 요일별 진료시간(h: 0=월…6=일)에서 오늘 것을 꺼내 약국과 같은 s·e 로 맞춰요
  const today = () => (new Date().getDay() + 6) % 7;
  function todayHours(r){
    if (st.kind === 'pharm' || !r.h) return r;
    const w = r.h[today()];
    return w ? { s: w[0], e: w[1] } : { s: null, e: null, off: true };
  }
  function openNow(r0) {
    const r = todayHours(r0);
    if (r.s == null || r.e == null) return r.off ? false : null;
    const d = new Date(), now = d.getHours() * 100 + d.getMinutes();
    let s = r.s, e = r.e; if (e <= s) e += 2400;
    return (now >= s && now < e) || (now + 2400 >= s && now + 2400 < e);
  }
  const icon = r => st.kind === 'care' ? (CARE_K[r.k] || CARE_K.n)[0] : st.kind === 'play' ? (r.io === '실내' ? '🧸' : '🛝') : KIND[st.kind].icon;
  const pin = (r, open) => L.divIcon({ className: 'mpin' + (open === false ? ' off' : ''), html: `<span><i>${icon(r)}</i></span>`, iconSize: [34, 34], iconAnchor: [17, 30], popupAnchor: [0, -26] });
  const telA = t => t ? `<a class="mbtn" href="tel:${esc(t.replace(/[^0-9-]/g, ''))}">📞 ${esc(t)}</a>` : '';
  const wayA = r => `<a class="mbtn" href="https://map.kakao.com/link/to/${encodeURIComponent(r.n)},${r.la},${r.lo}" target="_blank" rel="noopener">🧭 길찾기</a>`;
  function badge(r){
    if (st.kind === 'play'){
      // 안전검사: 가장 최근 검사의 유효기간이 오늘 이후고 합격이면 ✅, 지났으면 ⚠️ (가까운 15곳만 확인해요)
      const ins = !r.ins ? '' : r.ins.p && r.ins.v >= todayYmd() ? ` <span class="mtag on">✅ 안전검사 합격 · ~${ymd(r.ins.v)}</span>` : ` <span class="mtag off">⚠️ 안전검사 ${r.ins.p ? '유효기간 지남' : '불합격'} (${ymd(r.ins.v)})</span>`;
      return `<span class="mtag">${esc(r.io ? r.io + ' · ' : '')}${esc(r.k)}</span>${r.ex ? ' <span class="mtag">🏅 우수시설</span>' : ''}${ins}`;
    }
    if (st.kind === 'care') return `<span class="mtag">${(CARE_K[r.k] || CARE_K.n)[1]}</span> <span class="mtag">운영시간 자료 없음 · 전화로 확인</span>`;
    const peds = st.kind === 'peds', word = peds ? '진료' : '영업', t = todayHours(r), o = openNow(r);
    const kind = peds && r.k ? `<span class="mtag">${esc(r.k)}</span> ` : '';
    const lunch = peds && r.l ? `<br><small class="mlunch">🍱 점심 ${esc(r.l)}</small>` : '';
    if (o === null) return kind + `<span class="mtag">${word}시간 정보 없음</span>` + lunch;
    if (t.off) return kind + '<span class="mtag off">오늘 휴진 (신고 기준)</span>' + lunch;
    return kind + (o ? `<span class="mtag on">지금 ${word} 중 · ~${hhmm(t.e > 2400 ? t.e - 2400 : t.e)}</span>` : `<span class="mtag off">${word} 시간 아님 · 오늘 ${hhmm(t.s)}~${hhmm(t.e)}</span>`) + lunch;
  }

  function draw(){
    st.layer.clearLayers();
    const list = $('#mlist'); list.innerHTML = '';
    // 🟢 '지금 여는 곳만'을 켜면 진료·영업 중인 곳만 보여요 (육아 지원 시설은 시간 자료가 없어서 빼요)
    const rows = st.openOnly && !NOHOURS(st.kind) ? st.rows.filter(r => openNow(r) === true) : st.rows;
    if (!rows.length){
      // 밤·휴일에 문 연 소아과가 없으면 달빛어린이병원 안내로 바로 이어 줘요
      const moon = st.kind === 'peds' ? '<br>🌙 밤·휴일엔 <a href="https://www.e-gen.or.kr/moonlight/main.do" rel="noopener">달빛어린이병원</a>을 찾아보세요. 위급하면 <b>119</b>.' : '';
      list.innerHTML = `<li class="mnone">${st.rows.length ? '지금 문 연 곳이 근처에 없어요. 「지금 여는 곳만」을 끄면 모두 보여요.' + moon : KIND[st.kind].empty}</li>`; return;
    }
    rows.forEach((r, i) => {
      const open = NOHOURS(st.kind) ? null : openNow(r);
      const m = L.marker([r.la, r.lo], { icon: pin(r, open) }).addTo(st.layer);
      m.bindPopup(`<b>${esc(r.n)}</b><br>${badge(r)}<br><small>${esc(r.a)}</small><div class="mrow">${telA(r.t)}${wayA(r)}</div>`, { maxWidth: 260, autoPanPadding: [16, 16] });
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" class="mname" data-i="${i}">${icon(r)} ${esc(r.n)}</button> <span class="md">${km(r.d)}</span>
        <div>${badge(r)}</div><p class="ma">${esc(r.a)}</p><div class="mrow">${telA(r.t)}${wayA(r)}</div>`;
      li.querySelector('.mname').addEventListener('click', () => { map.setView([r.la, r.lo], 16); m.openPopup(); window.scrollTo({ top: $('#map').offsetTop - 70, behavior: 'smooth' }); });
      list.appendChild(li);
    });
  }

  // 버튼을 빨리 바꿔 누르면 늦게 도착한 이전 결과가 화면을 덮어써요 → 마지막 요청 결과만 써요
  let seq = 0;
  async function load(){
    const my = ++seq, kind = st.kind;
    const c = st.center || HOME;
    $('#again').hidden = true; st.moved = false;
    const say = $('#msay'); say.textContent = `${KIND[st.kind].icon} ${KIND[st.kind].name} 찾는 중… (처음엔 10초쯤 걸릴 수 있어요)`;
    $('#mlist').innerHTML = '';   // 찾는 동안 이전 목록·안내가 남지 않게
    try{
      const q = `lat=${c[0].toFixed(5)}&lon=${c[1].toFixed(5)}`;
      $('#mopen').hidden = NOHOURS(st.kind);
      const r = await fetch(NOHOURS(st.kind) ? `/api/${st.kind}?${q}` : `/api/near?v=2&kind=${st.kind}&${q}`, { signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined });
      const j = await r.json();
      if (my !== seq || kind !== st.kind) return;
      if (j.needKey){ say.textContent = '🛠 지도 준비 중이에요. 공공데이터 연결이 끝나면 바로 보여요.'; st.rows = []; draw(); return; }
      if (!j.ok) throw new Error(j.detail || j.error || 'error');
      st.rows = j.rows || [];
      const openCnt = st.rows.filter(x => openNow(x)).length;
      say.textContent = st.kind === 'play' ? `🛝 가까운 키즈카페·공공 놀이시설 ${st.rows.length}곳 (가까운 순)`
        : st.kind === 'care' ? `🤝 ${j.sido || ''} 육아 지원 시설 ${st.rows.length}곳 (가까운 순)` + (j.more ? ' · 위치를 찾는 중이라 일부만 보여요. 잠시 뒤 다시 눌러 주세요' : '')
        : st.kind === 'pharm' ? `💊 가까운 약국 ${st.rows.length}곳 · 지금 영업 중 ${openCnt}곳` : `🏥 가까운 소아청소년과 ${st.rows.length}곳 · 지금 진료 중 ${openCnt}곳`;
      if (j.hoursErr) say.textContent += ` · 진료시간을 아직 못 받았어요 (${String(j.hoursErr).slice(0, 60)})`;
      draw();
      if (st.rows.length){ const b = L.latLngBounds(st.rows.slice(0, 8).map(x => [x.la, x.lo])); if (st.me) b.extend(st.me.getLatLng()); st.fitting = true; map.fitBounds(b, { padding: [30, 30], maxZoom: 16 }); }
      else { st.anchor = map.getCenter(); }
    }catch(e){
      if (my !== seq) return;
      // 원인을 짧게 같이 보여줘요 (예: SERVICE_KEY_IS_NOT_REGISTERED_ERROR = 공공데이터 키가 아직 등록 중)
      const why = String(e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : (e && e.message) || '').slice(0, 80);
      say.textContent = '⚠️ 정보를 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.' + (why ? ` (${why})` : '');
      st.rows = []; st.layer.clearLayers(); $('#mlist').innerHTML = '';   // 이전 목록이 남아 헷갈리지 않게 비워요
    }
  }

  function locate(){
    const say = $('#msay');
    if (!navigator.geolocation){ say.textContent = '📍 이 브라우저는 위치를 지원하지 않아요. 지도를 옮겨서 찾아 주세요.'; st.center = HOME; load(); return; }
    say.textContent = '📍 내 위치를 찾는 중…';
    navigator.geolocation.getCurrentPosition(p => {
      st.center = [p.coords.latitude, p.coords.longitude];
      if (st.me) st.me.remove();
      st.me = L.circleMarker(st.center, { radius: 8, color: '#fff', weight: 3, fillColor: '#2a7de1', fillOpacity: 1 }).addTo(map).bindPopup('📍 내 위치');
      st.fitting = true; map.setView(st.center, 15); load();
    }, () => { say.textContent = '📍 위치를 쓸 수 없어서 기본 위치에서 찾았어요. 지도를 옮긴 뒤 「여기서 다시 찾기」를 눌러 주세요.'; st.center = HOME; load(); }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  }

  document.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => {
    st.kind = b.dataset.kind;
    document.querySelectorAll('[data-kind]').forEach(x => x.setAttribute('aria-pressed', x === b));
    load();
  }));
  $('#locate').addEventListener('click', locate);
  $('#mopen').addEventListener('click', () => { st.openOnly = !st.openOnly; $('#mopen').setAttribute('aria-pressed', String(st.openOnly)); draw(); });
  $('#again').addEventListener('click', () => { const c = map.getCenter(); st.center = [c.lat, c.lng]; load(); });
  // 지도를 손으로 옮기면 '여기서 다시 찾기' 버튼 (결과에 맞춰 지도가 스스로 움직인 건 빼요)
  // 정보창이 열려 있는 동안(정보창이 보이도록 지도가 살짝 움직일 때 포함)은 버튼을 띄우지 않아요
  map.on('popupopen', () => { st.pop = true; $('#again').hidden = true; });
  map.on('popupclose', () => { st.pop = false; st.anchor = map.getCenter(); });
  map.on('moveend', () => {
    const c = map.getCenter();
    if (st.fitting || !st.anchor || st.pop){ st.fitting = false; st.anchor = c; return; }
    if (map.distance(c, st.anchor) > 800) $('#again').hidden = false;
  });
  locate();
})();
