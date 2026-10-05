/* 공동육아 SOS · 알림 심부름꾼 (Cloudflare Pages Functions → https://gongdong-sos.pages.dev/api/push)
   앱이 "알림 채널 가입/탈퇴", "이 채널에 알림 보내기"를 부탁하면 Google 알림 서버(FCM)에 대신 전해 줘요.
   - 채널(topic) 이름은 방 열쇠로 만든 해시라서, 방 비밀번호를 아는 사람만 알 수 있어요.
     r + 40자 = 방 전체 채널, m + 40자 = 모임 주최자 채널
   - 비밀 열쇠(서비스 계정 JSON)는 Cloudflare 설정의 비밀 변수 GOOGLE_SA 에만 있어요. 코드·저장소에는 없어요.
   - 이름·전화번호는 받지도 보내지도 않아요. 알림 문구와 휴대폰 알림 주소(토큰)만 다뤄요.
   - 알림 보내기(notify)는 그 방의 멤버만: 앱이 보낸 로그인 증표로 Firestore 멤버 문서를 확인해요 (isMember). */

const TOPIC = /^[rm][0-9a-f]{40}$/;
const TOKEN = /^[A-Za-z0-9_:\-.]{100,4096}$/;
const LINK = /^(index|meet)\.html\?r=[a-z0-9]{6,20}$/;
const KEY = /^[0-9a-f]{64}$/, UID = /^[A-Za-z0-9]{10,128}$/, IDTOKEN = /^[A-Za-z0-9_\-.]{100,4096}$/, MEET_ID = /^[A-Za-z0-9]{1,40}$/;
const LIMIT = 6, WINDOW_MIN = 10;   // 채널마다 10분에 6번까지만 (알림 폭탄 방지)

let cached = null;   // Google 출입증(access token)은 50분 동안 다시 써요

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ error: 'origin' }, 403);
  if (!env.GOOGLE_SA) return json({ error: 'not_configured' }, 503);

  let b; try { b = await request.json(); } catch (e) { return json({ error: 'bad_json' }, 400); }
  const sa = JSON.parse(env.GOOGLE_SA);

  try {
    if (b.action === 'subscribe' || b.action === 'unsubscribe') {
      if (!TOKEN.test(b.token || '') || !Array.isArray(b.topics) || b.topics.length > 20 || !b.topics.every(t => TOPIC.test(t)))
        return json({ error: 'bad_input' }, 400);
      const at = await accessToken(sa);
      const op = b.action === 'subscribe' ? 'batchAdd' : 'batchRemove';
      const out = {};
      for (const t of b.topics) {
        const r = await fetch(`https://iid.googleapis.com/iid/v1:${op}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${at}`, access_token_auth: 'true', 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: `/topics/${t}`, registration_tokens: [b.token] })
        });
        const j = await r.json().catch(() => ({}));
        const err = !r.ok ? `iid_${r.status}` : (j.results && j.results[0] && j.results[0].error) || '';
        if(err) return json({ error: 'subscribe_failed', detail: `${err} ${JSON.stringify(j.error || '').slice(0, 120)}` }, 502);
        out[t] = true;
      }
      return json({ ok: true, topics: out });
    }

    // 🔔 테스트 알림: 이 휴대폰 한 대에만 보내요 (휴대폰마다 10분에 6번까지)
    if (b.action === 'test') {
      if (!TOKEN.test(b.token || '')) return json({ error: 'bad_input' }, 400);
      const id = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(b.token)))].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('');
      if (!(await allow('t' + id))) return json({ error: 'rate_limited' }, 429);
      const at = await accessToken(sa);
      const data = { title: '🔔 공동육아 SOS 테스트 알림', body: '알림이 잘 와요! 이렇게 새 모임·SOS 소식을 알려 드려요', link: 'index.html', tag: 'test', sender: '' };
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token: b.token, webpush: { headers: { Urgency: 'high', TTL: '600' }, data } } })
      });
      if(!r.ok){ const j = await r.json().catch(() => ({})); return json({ error: 'send_failed', detail: `fcm_${r.status} ${JSON.stringify(j.error && j.error.message || '').slice(0, 120)}` }, 502); }
      return json({ ok: true });
    }

    // 📣 방 사람들에게 알림: 보내는 사람이 '그 방의 멤버'인지 먼저 확인해요
    //  - 앱이 보낸 로그인 증표(idToken)로 Firestore 에서 rooms/{방 열쇠}/members/{uid} 를 읽어 봐요 (보안 규칙이 본인 것만 허용)
    //  - 문서가 있고 on == true 여야 멤버. 내보내진 사람(on == false)이나 방 열쇠만 아는 사람은 보낼 수 없어요
    //  - 채널 이름은 서버가 방 열쇠로 만들어요 (앱이 아무 채널이나 고를 수 없게)
    if (b.action === 'notify') {
      const title = String(b.title || '').slice(0, 40), body = String(b.body || '').slice(0, 120);
      const kind = b.kind === 'meet' ? 'meet' : b.kind === 'room' ? 'room' : '';
      if (!KEY.test(b.key || '') || !UID.test(b.uid || '') || !IDTOKEN.test(b.idToken || '') || !kind
        || (kind === 'meet' && !MEET_ID.test(b.meetId || '')) || !title || !LINK.test(b.link || '')) return json({ error: 'bad_input' }, 400);
      if (!(await isMember(sa.project_id, b.key, b.uid, b.idToken))) return json({ error: 'not_member' }, 403);
      const topic = kind === 'room' ? 'r' + (await sha256(`push:${b.key}`)).slice(0, 40) : 'm' + (await sha256(`push:${b.key}:${b.meetId}`)).slice(0, 40);
      const tag = String(b.tag || 'sos').slice(0, 60);
      // SOS 요청 알림과 그 밖의 알림(새 모임 등)은 횟수를 따로 세요 — SOS를 여러 번 눌러도 '새 모임' 알림이 밀리지 않게
      if (!(await allow(topic + (tag.startsWith('sos-') ? ':sos' : '')))) return json({ error: 'rate_limited' }, 429);
      const at = await accessToken(sa);
      const data = { title, body, link: b.link, tag, sender: String(b.from || '').slice(0, 32) };
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { topic, webpush: { headers: { Urgency: 'high', TTL: '86400' }, data } } })
      });
      if(!r.ok){ const j = await r.json().catch(() => ({})); return json({ error: 'send_failed', detail: `fcm_${r.status} ${JSON.stringify(j.error && j.error.message || '').slice(0, 120)}` }, 502); }
      return json({ ok: true });
    }
    return json({ error: 'bad_action' }, 400);
  } catch (e) {
    return json({ error: 'server', detail: String(e && e.message || e).slice(0, 200) }, 500);
  }
}

// 보내는 사람이 그 방의 멤버인지: 본인의 로그인 증표로 본인 멤버 문서를 읽어요 (Firestore 보안 규칙이 남의 증표·남의 문서는 막아요)
async function isMember(project, key, uid, idToken) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/rooms/${key}/members/${uid}`, {
    headers: { Authorization: `Bearer ${idToken}` }
  });
  if (!r.ok) return false;
  const j = await r.json().catch(() => ({}));
  return !!(j.fields && j.fields.on && j.fields.on.booleanValue === true);
}
async function sha256(t) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(x => x.toString(16).padStart(2, '0')).join('');
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

// 채널마다 10분에 6번까지 (Cloudflare 캐시에 횟수를 적어 두는 간단한 방식 — 완벽하진 않지만 폭탄은 막아요)
async function allow(topic) {
  const bucket = Math.floor(Date.now() / (WINDOW_MIN * 60000));
  const key = new Request(`https://rate.limit/${topic}/${bucket}`);
  const cache = caches.default;
  const hit = await cache.match(key);
  const n = hit ? parseInt(await hit.text(), 10) || 0 : 0;
  if (n >= LIMIT) return false;
  await cache.put(key, new Response(String(n + 1), { headers: { 'Cache-Control': `max-age=${WINDOW_MIN * 60}` } }));
  return true;
}

// 서비스 계정으로 Google 출입증 받기 (RS256 서명한 JWT → OAuth 토큰)
async function accessToken(sa) {
  if (cached && cached.exp > Date.now()) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const enc = o => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ alg: 'RS256', typ: 'JWT' });
  const claim = enc({
    iss: sa.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/cloud-platform'
  });
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`));
  const jwt = `${head}.${claim}.${b64url(new Uint8Array(sig))}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('google_auth_failed');
  cached = { token: j.access_token, exp: Date.now() + 50 * 60000 };
  return cached.token;
}
function b64url(bytes) {
  let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
