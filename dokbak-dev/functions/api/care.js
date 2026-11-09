/* 오늘도 독박육아 · 육아 지도 '육아 지원' 심부름꾼 (https://dokbak.pages.dev/api/care?lat=..&lon=..)
   - 목록: 공공데이터 파일 2개 (build.py 가 functions/_lib/care.js 로 만들어 넣어요)
       · 한국건강가정진흥원 전국 공동육아나눔터 기관현황 (2025-11-10)
       · 부산광역시 육아종합지원센터 현황 (2026-05-22)
   - 파일에는 주소만 있어서, 카카오 로컬 API로 좌표를 찾아 시도별로 30일 캐시해요.
     카카오 키는 Cloudflare 비밀 변수 KAKAO_REST_KEY 에만 있어요 (코드·저장소에는 없어요).
   - 내 위치는 저장하지 않아요. 어느 시도인지 알아낼 때만 카카오에 물어봐요. */
import CARE from '../_lib/care.js';

const KAKAO = 'https://dapi.kakao.com/v2/local';
const BUDGET = 35;   // 한 번에 새로 좌표를 찾는 곳 수 (Cloudflare 무료 요금제의 요청 수 제한 안쪽으로)
const SIDO = { '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구', '인천광역시': '인천', '광주광역시': '광주', '대전광역시': '대전', '울산광역시': '울산',
  '세종특별자치시': '세종', '경기도': '경기', '강원특별자치도': '강원', '강원도': '강원', '충청북도': '충북', '충청남도': '충남', '전북특별자치도': '전북', '전라북도': '전북',
  '전라남도': '전남', '경상북도': '경북', '경상남도': '경남', '제주특별자치도': '제주' };

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
  if (!(lat > 33 && lat < 39) || !(lon > 124 && lon < 132)) return json({ ok: false, error: 'bad_input' }, 400);
  const key = env.KAKAO_REST_KEY;
  if (!key) return json({ ok: false, needKey: true });
  try {
    const sido = await whichSido(key, lat, lon);
    const list = CARE.filter(x => x.s === sido);
    if (!list.length) return json({ ok: true, rows: [], sido });
    // 시도별 좌표 캐시: { 주소: [위도, 경도] 또는 0(못 찾음) }
    const ck = new Request(`https://cache.local/care/v1/${encodeURIComponent(sido)}`), cache = caches.default;
    const hit = await cache.match(ck);
    const geo = hit ? await hit.json() : {};
    const todo = list.filter(x => !(x.q in geo)).slice(0, BUDGET);
    if (todo.length) {
      for (let i = 0; i < todo.length; i += 7) await Promise.all(todo.slice(i, i + 7).map(async x => {
        try { geo[x.q] = await locate(key, x); } catch (e) { if (e.fatal) throw e; }
      }));
      waitUntil(cache.put(ck, new Response(JSON.stringify(geo), { headers: { 'Cache-Control': 'public, max-age=2592000', 'Content-Type': 'application/json' } })));
    }
    const more = list.some(x => !(x.q in geo));
    const rows = list.filter(x => Array.isArray(geo[x.q]))
      .map(x => ({ n: x.n, a: x.a, t: x.t, k: x.k, la: geo[x.q][0], lo: geo[x.q][1], d: dist(lat, lon, geo[x.q][0], geo[x.q][1]) }))
      .sort((a, b) => a.d - b.d).slice(0, 50);
    return json({ ok: true, rows, sido, more }, 200, more ? 0 : 3600);
  } catch (e) {
    return json({ ok: false, error: 'upstream', detail: String(e && e.message || e).slice(0, 160) }, 502);
  }
}

async function kakao(key, path, params) {
  const q = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const r = await fetch(`${KAKAO}${path}?${q}`, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(6000) });
  const t = await r.text();
  if (!r.ok) {
    // 키·설정 문제는 화면에 원인을 알려 줘요
    const err = new Error(/OPEN_MAP_AND_LOCAL|disabled/i.test(t) ? 'kakao_map_off (카카오맵 사용 설정을 켜 주세요)' : r.status === 401 ? 'kakao_key_wrong (카카오 REST API 키를 확인해 주세요)' : `kakao_http_${r.status}`);
    err.fatal = r.status === 401 || r.status === 403;
    throw err;
  }
  return JSON.parse(t);
}

async function whichSido(key, lat, lon) {
  const j = await kakao(key, '/geo/coord2regioncode.json', { x: lon, y: lat });
  const d = (j.documents || [])[0];
  return d ? (SIDO[d.region_1depth_name] || d.region_1depth_name) : '';
}

// 주소로 먼저 찾고, 없으면 기관 이름으로 한 번 더 찾아요
async function locate(key, x) {
  const a = await kakao(key, '/search/address.json', { query: x.q, size: 1 });
  let d = (a.documents || [])[0];
  if (!d) {
    const name = x.k === 'c' ? x.n : x.n.replace(/ 공동육아나눔터$/, '');
    const k = await kakao(key, '/search/keyword.json', { query: `${x.a.split(' ').slice(0, 2).join(' ')} ${name}`, size: 1 });
    d = (k.documents || [])[0];
  }
  return d ? [Number(Number(d.y).toFixed(6)), Number(Number(d.x).toFixed(6))] : 0;
}

function dist(a, b, c, d) {
  const R = 6371000, r = x => x * Math.PI / 180, dLa = r(c - a), dLo = r(d - b);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLo / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function json(obj, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store' }
  });
}
