/* 오늘도 독박육아 · AI가 만든 놀이(아직 직접 해 보기 전) 보기 — 운영자만 (GET /api/aiplays, x-key = ADMIN_KEY)
   공개 페이지·검색·사이트맵에는 없어요. 직접 해 보고 '해봄'으로 바꾼 놀이만 사이트에 올라가요. */
import PLAYS from '../_lib/aiplays.js';
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
function same(a, b) { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }
export async function onRequestGet({ request, env }) {
  if (!env.ADMIN_KEY) return J({ error: 'ADMIN_KEY 설정이 없어요' }, 503);
  if (!same(request.headers.get('x-key') || '', env.ADMIN_KEY)) { await new Promise(r => setTimeout(r, 800)); return J({ error: '비밀번호가 달라요' }, 401); }
  return J({ plays: PLAYS });
}
