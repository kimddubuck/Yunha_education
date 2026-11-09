// 🎓 부모교육 달력: data/parent_edu_busan.json 을 build.py 가 window.PEDU 로 넣어 줘요.
// 한 달 달력 + 구 필터 + 센터별 목록. 자료는 각 센터 홈페이지 부모교육 게시판에서 옮긴 것이고, 신청은 센터 홈페이지에서 해요.
(function () {
  var D = window.PEDU; if (!D) return;
  var root = document.getElementById('pedu'); if (!root) return;
  var C = {}; D.centers.forEach(function (c, i) { c.i = i; C[c.id] = c; });
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); };
  var today = new Date(); var tkey = ymd(today);
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var first = D.events.map(function (e) { return e.d[0]; }).sort()[0] || tkey;
  var last = D.events.map(function (e) { return e.d[e.d.length - 1]; }).sort().slice(-1)[0] || tkey;
  // 보여 줄 달: 오늘이 자료 범위 안이면 이번 달, 아니면 자료가 있는 첫 달
  var cur = (tkey >= first.slice(0, 7) + '-01' && tkey <= last) ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(+first.slice(0, 4), +first.slice(5, 7) - 1, 1);
  var gu = '';   // 고른 구 (센터 id)
  var onlyOpen = false;

  function openNow(e) {   // 지금 신청할 수 있어 보이는 교육: 상태 글자로만 봐요 (센터마다 말이 달라요)
    return /접수중|신청가능|대기접수|대기가능|대기신청/.test(e.st || '');
  }
  function stClass(e) {
    var s = e.st || '';
    if (/접수중|신청가능/.test(s)) return 'on';
    if (/대기/.test(s)) return 'wait';
    if (/예정/.test(s)) return 'soon';
    if (/마감|종료|끝/.test(s)) return 'off';
    return 'na';
  }
  function visible(e) { return (!gu || e.c === gu) && (!onlyOpen || openNow(e)); }
  function dayEvents(key) { return D.events.filter(function (e) { return visible(e) && e.d.indexOf(key) >= 0; }); }
  function fmtD(k) { return (+k.slice(5, 7)) + '/' + (+k.slice(8, 10)) + '(' + '일월화수목금토'[new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)).getDay()] + ')'; }

  function render() {
    var y = cur.getFullYear(), m = cur.getMonth();
    var monthKey = y + '-' + String(m + 1).padStart(2, '0');
    var startDow = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    var h = '';
    // 구 고르기 칩
    h += '<div class="pe-chips" role="group" aria-label="구 고르기"><button type="button" class="chip" data-gu="" aria-pressed="' + (!gu) + '">전체</button>';
    D.centers.forEach(function (c) {
      var n = D.events.filter(function (e) { return e.c === c.id; }).length;
      h += '<button type="button" class="chip" data-gu="' + c.id + '" aria-pressed="' + (gu === c.id) + '"><i class="pe-dot c' + c.i + '"></i>' + esc(c.gu) + (n ? ' <small>' + n + '</small>' : '') + '</button>';
    });
    h += '</div>';
    h += '<div class="pe-bar"><div class="pe-nav"><button type="button" class="pe-prev" aria-label="이전 달">‹</button><b>' + y + '년 ' + (m + 1) + '월</b><button type="button" class="pe-next" aria-label="다음 달">›</button></div>' +
      '<button type="button" class="pe-open chip" aria-pressed="' + onlyOpen + '">🟢 지금 신청 가능한 것만</button></div>';
    // 달력
    h += '<div class="pe-cal" role="grid" aria-label="' + y + '년 ' + (m + 1) + '월 부모교육 달력">';
    '일월화수목금토'.split('').forEach(function (w, i) { h += '<div class="pe-w' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') + '">' + w + '</div>'; });
    for (var i = 0; i < startDow; i++) h += '<div class="pe-d empty"></div>';
    for (var d = 1; d <= days; d++) {
      var key = monthKey + '-' + String(d).padStart(2, '0'); var ev = dayEvents(key); var dow = (startDow + d - 1) % 7;
      h += '<div class="pe-d' + (key === tkey ? ' today' : '') + (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '') + (ev.length ? ' has' : '') + '" data-day="' + key + '"><span class="pe-n">' + d + '</span>';
      ev.slice(0, 3).forEach(function (e) { var c = C[e.c]; h += '<a class="pe-ev c' + c.i + ' ' + stClass(e) + '" href="#ev-' + D.events.indexOf(e) + '" title="' + esc(c.gu + ' · ' + e.t) + '"><i></i>' + esc(c.gu) + ' ' + esc(shortT(e.t)) + '</a>'; });
      if (ev.length > 3) h += '<span class="pe-more">+' + (ev.length - 3) + '</span>';
      h += '</div>';
    }
    h += '</div>';
    // 이 달 목록 (날짜순)
    var list = [];
    D.events.forEach(function (e) { if (!visible(e)) return; e.d.forEach(function (k) { if (k.slice(0, 7) === monthKey) list.push([k, e]); }); });
    list.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : C[a[1].c].i - C[b[1].c].i; });
    var seen = {};
    h += '<h2 class="pe-h">📋 ' + (m + 1) + '월 교육 ' + (list.length ? '<small>' + Object.keys(list.reduce(function (o, x) { o[D.events.indexOf(x[1])] = 1; return o; }, {})).length + '개</small>' : '') + '</h2>';
    if (!list.length) h += '<p class="pe-empty">이 달에 올라온 교육이 없어요. ' + (gu ? '다른 구를 골라 보거나 ' : '') + '센터 홈페이지에서 다음 달 일정을 확인해 주세요.</p>';
    h += '<ul class="pe-list">';
    list.forEach(function (x) {
      var k = x[0], e = x[1], id = D.events.indexOf(e), c = C[e.c];
      if (seen[id]) return; seen[id] = 1;
      var when = e.d.length > 1 ? e.d.map(fmtD).join(' · ') : fmtD(e.d[0]);
      h += '<li class="pe-item c' + c.i + '" id="ev-' + id + '"><div class="pe-when"><b>' + esc(when) + '</b>' + (e.tm ? '<span>' + esc(e.tm) + '</span>' : '') + '</div>' +
        '<div class="pe-body"><div class="pe-meta"><i class="pe-dot c' + c.i + '"></i><a href="' + esc(c.url) + '" rel="noopener">' + esc(c.name) + '</a>' + (e.k ? ' <em>' + esc(e.k) + '</em>' : '') + '</div>' +
        '<h3>' + esc(e.t) + '</h3>' +
        '<div class="pe-foot">' + (e.st ? '<span class="pe-st ' + stClass(e) + '">' + esc(e.st) + '</span>' : '') + (e.cap ? '<span>' + esc(e.cap) + '</span>' : '') + (e.ap ? '<span>신청 ' + esc(e.ap[0]) + ' ~ ' + esc(e.ap[1] || '') + '</span>' : '') +
        '<a class="pe-go" href="' + esc(e.url || c.url) + '" rel="noopener">센터에서 보기 ›</a></div></div></li>';
    });
    h += '</ul>';
    root.innerHTML = h;
    root.querySelectorAll('.pe-chips .chip').forEach(function (b) { b.addEventListener('click', function () { gu = b.dataset.gu; render(); }); });
    root.querySelector('.pe-prev').addEventListener('click', function () { cur = new Date(y, m - 1, 1); render(); });
    root.querySelector('.pe-next').addEventListener('click', function () { cur = new Date(y, m + 1, 1); render(); });
    root.querySelector('.pe-open').addEventListener('click', function () { onlyOpen = !onlyOpen; render(); });
    root.querySelectorAll('.pe-ev').forEach(function (a) {
      a.addEventListener('click', function (ev) { ev.preventDefault(); var t = document.getElementById(a.getAttribute('href').slice(1)); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.classList.add('flash'); setTimeout(function () { t.classList.remove('flash'); }, 1600); } });
    });
  }
  function shortT(t) { return t.replace(/^\[[^\]]*\]\s*/, '').replace(/^\([^)]*\)\s*/, ''); }
  render();
})();
