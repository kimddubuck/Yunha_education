/* 오늘도 독박육아 · 방문 통계 보기 (GET /api/stats?days=7, 관리자 비밀번호는 x-key 머리글)
   비밀번호는 Cloudflare 비밀 환경 변수 ADMIN_KEY 에만 둬요. 코드·저장소에는 없어요. */
import { kst } from './hit.js';
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
function same(a, b) { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }

export async function onRequestGet({ request, env }) {
  if (!env.ADMIN_KEY || !env.STATS) return J({ setup: { key: !!env.ADMIN_KEY, db: !!env.STATS } }, 503);
  if (!same(request.headers.get('x-key') || '', env.ADMIN_KEY)) { await new Promise(r => setTimeout(r, 800)); return J({ error: '비밀번호가 달라요' }, 401); }
  const days = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get('days')) || 7, 1), 365);
  const to = kst(), from = kst(Date.now() - (days - 1) * 864e5), db = env.STATS;
  const all = (sql, ...a) => db.prepare(sql).bind(...a).all().then(r => r.results).catch(() => []);
  const [daily, pages, srcs, devs, kws] = await Promise.all([
    all('SELECT d, SUM(pv) pv, SUM(uv) uv, SUM(se) se FROM hits WHERE d >= ? GROUP BY d ORDER BY d', from),
    all('SELECT p, SUM(pv) pv, SUM(se) se FROM hits WHERE d >= ? GROUP BY p ORDER BY SUM(pv) DESC LIMIT 40', from),
    all("SELECT s, SUM(se) se FROM hits WHERE d >= ? AND s != '사이트 안' GROUP BY s HAVING SUM(se) > 0 ORDER BY SUM(se) DESC LIMIT 30", from),
    all('SELECT dev, SUM(uv) uv, SUM(pv) pv FROM hits WHERE d >= ? GROUP BY dev ORDER BY SUM(pv) DESC', from),
    all('SELECT s, q, SUM(n) n FROM kw WHERE d >= ? GROUP BY s, q ORDER BY SUM(n) DESC LIMIT 40', from)]);
  return J({ from, to, days, daily, pages, srcs, devs, kws });
}
