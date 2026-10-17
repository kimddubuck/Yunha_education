/* 오늘도 독박육아 · 🥣 유아식 모음 (GET /food/meals)
   공동육아 SOS 식단공유에서 운영자가 '공개'를 누른 식단(Firestore mealpub)을 읽어 정적 페이지(food/meals.html)의 <!--MEALS--> 자리에 넣어요.
   닉네임·uid·방 이름은 처음부터 없어요. 사진은 /api/meal-img?id= 로 따로 받아요. 2분 캐시(비어 있으면 캐시 안 함). 12개 이상 모이면 검색엔진에 열어요. */
const P = 'sos-calendar-f6bf7';
const RUNQ = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents:runQuery`;
const SLOT = { b: '🌅 아침', s1: '🍪 오전 간식', l: '☀️ 점심', s2: '🍪 오후 간식', d: '🌙 저녁' };
const BANDS = [[6, 8, '6~8개월'], [9, 11, '9~11개월'], [12, 17, '12~17개월'], [18, 23, '18~23개월'], [24, 72, '24개월 이상']];
const OPEN_AT = Infinity;   // 애드센스 승인 전까지는 검색엔진에 안 내보내요. 승인 뒤 12로 바꿔요
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const val = f => f ? (f.stringValue ?? (f.integerValue != null ? Number(f.integerValue) : f.timestampValue)) : undefined;

async function meals() {
  const body = { structuredQuery: { from: [{ collectionId: 'mealpub' }], select: { fields: ['slot', 'memo', 'mo', 'date'].map(fieldPath => ({ fieldPath })) },
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 400 } };
  const r = await fetch(RUNQ, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('firestore ' + r.status);
  return (await r.json()).filter(x => x.document).map(x => { const f = x.document.fields || {};
    return { id: x.document.name.split('/').pop(), slot: val(f.slot), memo: val(f.memo) || '', mo: val(f.mo), date: val(f.date) || '' }; });
}

function render(list) {
  if (!list.length) return '<p class="mm-empty">아직 모인 식단이 없어요. 공동육아 SOS 식단공유에 올라온 식단 가운데 확인한 것부터 하나씩 쌓아요.</p>';
  const card = m => { const alt = `${m.mo != null ? m.mo + '개월 ' : ''}${(SLOT[m.slot] || '').replace(/^\S+\s/, '')} 유아식${m.memo ? ': ' + m.memo : ''}`;
    return `<figure class="mm-card"><img src="/api/meal-img?id=${encodeURIComponent(m.id)}" alt="${esc(alt)}" loading="lazy" width="320" height="320"><figcaption><span class="mm-meta">${m.mo != null ? `<b>${m.mo}개월</b> · ` : ''}${SLOT[m.slot] || ''}</span>${m.memo ? `<span class="mm-memo">${esc(m.memo)}</span>` : ''}</figcaption></figure>`; };
  const groups = BANDS.map(([a, b, name]) => [name, list.filter(m => m.mo != null && m.mo >= a && m.mo <= b)]).concat([['개월 모름', list.filter(m => m.mo == null || m.mo < 6)]]).filter(g => g[1].length);
  const nav = `<p class="mm-nav">${groups.map(([n, l], i) => `<a href="#mm${i}">${esc(n)} <small>${l.length}</small></a>`).join('')}</p>`;
  return `<p class="mm-count">지금까지 모인 식단 <b>${list.length}개</b></p>${nav}` + groups.map(([n, l], i) => `<h2 id="mm${i}">${esc(n)} <small>${l.length}개</small></h2><div class="mm-grid">${l.map(card).join('')}</div>`).join('');
}

export async function onRequestGet(ctx) {
  const { request, env } = ctx;
  const cache = caches.default, key = new Request(new URL('/food/meals?v=c2', request.url).toString());
  const hit = await cache.match(key); if (hit) return hit;
  const page = await env.ASSETS.fetch(new URL('/food/meals', request.url));
  let html = await page.text(), list = [];
  try { list = await meals(); } catch (e) { html = html.replace('<!--MEALS-->', '<p class="mm-empty">식단을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>'); return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }); }
  html = html.replace('<!--MEALS-->', render(list));
  // 충분히 모이면 검색엔진에 열어요 (얇은 페이지로 보이지 않게)
  if (list.length >= OPEN_AT) html = html.replace('<meta name="robots" content="noindex,follow">', '<link rel="canonical" href="https://xn--iq1br1ns0hr0b.com/food/meals">');
  const res = new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': list.length ? 'public, max-age=120' : 'no-store' } });
  if (list.length) ctx.waitUntil(cache.put(key, res.clone()));   // 비어 있을 땐 캐시하지 않아요 (공개하자마자 보이게)
  return res;
}
