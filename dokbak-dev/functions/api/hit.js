/* 오늘도 독박육아 · 자체 방문 통계 기록 (POST /api/hit, D1 바인딩 이름 STATS)
   저장하는 것: 날짜(한국 시간) · 페이지 주소 · 들어온 곳(사이트 이름만) · 기기 종류(휴대폰/태블릿/PC) · 주소에 들어 있는 검색어.
   IP 주소 · 쿠키 · 브라우저 정보처럼 사람을 알아볼 수 있는 값은 저장하지 않아요. */
const SRC = [
  [/^blog\.naver\.com$|^m\.blog\.naver\.com$/, '네이버 블로그'], [/^cafe\.naver\.com$|^m\.cafe\.naver\.com$/, '네이버 카페'],
  [/(^|\.)naver\.com$/, '네이버'], [/(^|\.)google\.[a-z.]+$/, '구글'], [/(^|\.)daum\.net$/, '다음'],
  [/(^|\.)kakao\.com$|(^|\.)kakaocdn\.net$/, '카카오'], [/(^|\.)instagram\.com$/, '인스타그램'], [/(^|\.)facebook\.com$/, '페이스북'],
  [/(^|\.)threads\.(net|com)$/, '스레드'], [/(^|\.)youtube\.com$/, '유튜브'], [/(^|\.)bing\.com$/, '빙'], [/(^|\.)zum\.com$/, '줌'],
  [/^gongdong-sos\.pages\.dev$/, '공동육아 SOS']];
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|facebookexternalhit|kakaotalk-scrap|yeti/i;
let ready = false;
async function init(db) {
  if (ready) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS hits (d TEXT, p TEXT, s TEXT, dev TEXT, pv INTEGER DEFAULT 0, uv INTEGER DEFAULT 0, se INTEGER DEFAULT 0, PRIMARY KEY (d, p, s, dev))'),
    db.prepare('CREATE TABLE IF NOT EXISTS kw (d TEXT, s TEXT, q TEXT, n INTEGER DEFAULT 0, PRIMARY KEY (d, s, q))')]);
  ready = true;
}
export const kst = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

export async function onRequestPost({ request, env }) {
  const done = new Response(null, { status: 204 });
  const db = env.STATS;
  if (!db || BOT.test(request.headers.get('user-agent') || '')) return done;
  let b; try { b = JSON.parse(await request.text()); } catch { return done; }
  // 페이지 주소: /a.html → /a, /x/index.html → /x/
  let p = String(b.p || '/').split('?')[0].replace(/index\.html$/, '').replace(/\.html$/, '');
  if (!/^\/[\w\-./]{0,120}$/.test(p) || p.startsWith('/api/') || p.startsWith('/admin')) return done;
  const me = new URL(request.url).host;
  let s = '직접·앱', q = '';
  try {
    if (b.r) {
      const r = new URL(String(b.r)), h = r.hostname.toLowerCase();
      if (h === me || h === 'dokbak.pages.dev' || h.endsWith('.dokbak.pages.dev')) s = '사이트 안';
      else {
        s = (SRC.find(([re]) => re.test(h)) || [, h.replace(/^(www|m)\./, '').slice(0, 60)])[1];
        q = (r.searchParams.get('query') || r.searchParams.get('q') || r.searchParams.get('keyword') || '').trim().slice(0, 40);
      }
    }
  } catch { }
  // 광고·공유 링크에 붙은 utm_source 가 있으면 그걸 들어온 곳으로 써요
  try { const u = new URLSearchParams(String(b.q || '')).get('utm_source'); if (u && s !== '사이트 안') s = u.replace(/[^\w가-힣·\-]/g, '').slice(0, 30) || s; } catch { }
  const ua = request.headers.get('user-agent') || '';
  const dev = /iPad|Tablet/i.test(ua) ? '태블릿' : /Mobi|Android|iPhone/i.test(ua) ? '휴대폰' : 'PC';
  const d = kst(), uv = b.v ? 1 : 0, se = b.s ? 1 : 0;
  try {
    await init(db);
    const st = [db.prepare('INSERT INTO hits (d, p, s, dev, pv, uv, se) VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT (d, p, s, dev) DO UPDATE SET pv = pv + 1, uv = uv + excluded.uv, se = se + excluded.se').bind(d, p, s, dev, uv, se)];
    if (q && se) st.push(db.prepare('INSERT INTO kw (d, s, q, n) VALUES (?, ?, ?, 1) ON CONFLICT (d, s, q) DO UPDATE SET n = n + 1').bind(d, s, q));
    await db.batch(st);
  } catch { }
  return done;
}
