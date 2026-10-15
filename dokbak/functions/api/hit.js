/* 오늘도 독박육아 · 자체 방문 통계 기록 (POST /api/hit, D1 바인딩 이름 STATS)
   저장하는 것: 날짜(한국 시간) · 페이지 주소 · 들어온 곳(사이트 이름만) · 기기 종류(휴대폰/태블릿/PC) · 주소에 들어 있는 검색어.
   바깥 링크(공동육아 SOS 등)를 누르면 어느 사이트로 나갔는지만 세요. 운영자 기기에서 본 건 따로 세요.
   IP 주소 · 쿠키 · 브라우저 정보처럼 사람을 알아볼 수 있는 값은 저장하지 않아요. */
const SRC = [
  [/^blog\.naver\.com$|^m\.blog\.naver\.com$/, '네이버 블로그'], [/^cafe\.naver\.com$|^m\.cafe\.naver\.com$/, '네이버 카페'],
  [/(^|\.)naver\.com$/, '네이버'], [/(^|\.)google\.[a-z.]+$/, '구글'], [/(^|\.)daum\.net$/, '다음'],
  [/(^|\.)kakao\.com$|(^|\.)kakaocdn\.net$/, '카카오'], [/(^|\.)instagram\.com$/, '인스타그램'], [/(^|\.)facebook\.com$/, '페이스북'],
  [/(^|\.)threads\.(net|com)$/, '스레드'], [/(^|\.)youtube\.com$/, '유튜브'], [/(^|\.)bing\.com$/, '빙'], [/(^|\.)zum\.com$/, '줌'],
  [/^gongdong-sos\.pages\.dev$/, '공동육아 SOS']];
// 들어온 주소(referrer)가 없을 때: 어느 앱 안에서 열었는지 (브라우저 정보에 앱 이름이 들어 있어요)
const APPS = [[/KAKAOTALK/i, '카카오톡'], [/NAVER\(inapp|NAVER\/|NaverMatome/i, '네이버 앱'], [/Instagram/i, '인스타그램'], [/FBAN|FBAV|FB_IAB/i, '페이스북'],
  [/\bBAND\//i, '밴드'], [/DaumApps|DaumDevice/i, '다음 앱'], [/\bLine\//i, '라인'], [/Threads|Barcelona/i, '스레드'], [/everytimeApp/i, '에브리타임']];
// 링크에 붙인 utm_source 짧은 이름 → 보기 좋은 이름
const UTM = { sos: '공동육아 SOS', kakao: '카카오톡', insta: '인스타그램', blog: '네이버 블로그', cafe: '네이버 카페', band: '밴드' };
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|facebookexternalhit|kakaotalk-scrap|yeti/i;
let ready = false;
async function init(db) {
  if (ready) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS hits (d TEXT, p TEXT, s TEXT, dev TEXT, pv INTEGER DEFAULT 0, uv INTEGER DEFAULT 0, se INTEGER DEFAULT 0, PRIMARY KEY (d, p, s, dev))'),
    db.prepare('CREATE TABLE IF NOT EXISTS kw (d TEXT, s TEXT, q TEXT, n INTEGER DEFAULT 0, PRIMARY KEY (d, s, q))'),
    db.prepare('CREATE TABLE IF NOT EXISTS outs (d TEXT, p TEXT, h TEXT, me INTEGER, n INTEGER DEFAULT 0, PRIMARY KEY (d, p, h, me))'),
    db.prepare('CREATE TABLE IF NOT EXISTS mine (d TEXT, p TEXT, pv INTEGER DEFAULT 0, PRIMARY KEY (d, p))')]);
  ready = true;
}
export const kst = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

export async function onRequestPost({ request, env }) {
  const done = new Response(null, { status: 204 });
  const db = env.STATS;
  if (!db || BOT.test(request.headers.get('user-agent') || '')) return done;
  let b; try { b = JSON.parse(await request.text()); } catch { return done; }
  // 페이지 주소: /a.html → /a, /x/index.html → /x/
  const d = kst(), me = b.m ? 1 : 0;
  let p = String(b.p || '/').split('?')[0].replace(/index\.html$/, '').replace(/\.html$/, '');
  if (!/^\/[\w\-./]{0,120}$/.test(p) || p.startsWith('/api/') || p.startsWith('/admin')) return done;
  const host = new URL(request.url).host;
  // 바깥 링크를 누른 기록: 어느 페이지에서 어느 사이트로 나갔는지만
  if (b.o) {
    let h = ''; try { h = new URL(String(b.o)).hostname.toLowerCase(); } catch { return done; }
    if (!h || h === host) return done;
    h = h === 'gongdong-sos.pages.dev' ? '공동육아 SOS' : h.replace(/^(www|m)\./, '').slice(0, 60);
    try { await init(db); await db.prepare('INSERT INTO outs (d, p, h, me, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT (d, p, h, me) DO UPDATE SET n = n + 1').bind(d, p, h, me).run(); } catch { }
    return done;
  }
  // 운영자 기기에서 본 건 방문 통계에 섞지 않고 따로 세요
  if (me) {
    try { await init(db); await db.prepare('INSERT INTO mine (d, p, pv) VALUES (?, ?, 1) ON CONFLICT (d, p) DO UPDATE SET pv = pv + 1').bind(d, p).run(); } catch { }
    return done;
  }
  const ua = request.headers.get('user-agent') || '';
  let s = (APPS.find(([re]) => re.test(ua)) || [, '직접 (주소·즐겨찾기·문자)'])[1], q = '';
  try {
    if (b.r) {
      const r = new URL(String(b.r)), h = r.hostname.toLowerCase();
      if (h === host || h === 'dokbak.pages.dev' || h.endsWith('.dokbak.pages.dev')) s = '사이트 안';
      else {
        s = (SRC.find(([re]) => re.test(h)) || [, h.replace(/^(www|m)\./, '').slice(0, 60)])[1];
        q = (r.searchParams.get('query') || r.searchParams.get('q') || r.searchParams.get('keyword') || '').trim().slice(0, 40);
      }
    }
  } catch { }
  // 광고·공유 링크에 붙은 utm_source 가 있으면 그걸 들어온 곳으로 써요
  try { const u = new URLSearchParams(String(b.q || '')).get('utm_source'); if (u && s !== '사이트 안') s = UTM[u.toLowerCase()] || u.replace(/[^\w가-힣·\-]/g, '').slice(0, 30) || s; } catch { }
  const dev = /iPad|Tablet/i.test(ua) ? '태블릿' : /Mobi|Android|iPhone/i.test(ua) ? '휴대폰' : 'PC';
  const uv = b.v ? 1 : 0, se = b.s ? 1 : 0;
  try {
    await init(db);
    const st = [db.prepare('INSERT INTO hits (d, p, s, dev, pv, uv, se) VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT (d, p, s, dev) DO UPDATE SET pv = pv + 1, uv = uv + excluded.uv, se = se + excluded.se').bind(d, p, s, dev, uv, se)];
    if (q && se) st.push(db.prepare('INSERT INTO kw (d, s, q, n) VALUES (?, ?, ?, 1) ON CONFLICT (d, s, q) DO UPDATE SET n = n + 1').bind(d, s, q));
    await db.batch(st);
  } catch { }
  return done;
}
