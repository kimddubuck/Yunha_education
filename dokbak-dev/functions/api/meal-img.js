/* 오늘도 독박육아 · 🥣 유아식 모음 사진 (GET /api/meal-img?id=)
   Firestore mealpub 문서의 img(작게 줄인 data URL)를 그림 파일로 돌려줘요. 공개된 식단만 있어요. 하루 캐시. */
const P = 'sos-calendar-f6bf7';
export async function onRequestGet(ctx) {
  const { request } = ctx;
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return new Response('bad id', { status: 400 });
  const cache = caches.default, key = new Request(new URL('/api/meal-img?id=' + id, request.url).toString());
  const hit = await cache.match(key); if (hit) return hit;
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents/mealpub/${id}?mask.fieldPaths=img`);
  if (!r.ok) return new Response('not found', { status: 404, headers: { 'cache-control': 'public, max-age=300' } });
  const img = ((await r.json()).fields || {}).img?.stringValue || '';
  const m = /^data:(image\/(?:webp|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(img);
  if (!m) return new Response('not found', { status: 404 });
  const bin = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  const res = new Response(bin, { headers: { 'content-type': m[1], 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
