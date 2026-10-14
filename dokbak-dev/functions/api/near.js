/* 오늘도 독박육아 · 육아 지도 심부름꾼 (Cloudflare Pages Functions → https://dokbak.pages.dev/api/near)
   앱이 '이 좌표 근처 소아과/문 연 약국'을 물으면 공공데이터 API에 대신 물어보고 간단히 정리해서 돌려줘요.
   - 공공데이터 인증키는 Cloudflare 설정의 비밀 변수 DATA_GO_KR_KEY 에만 있어요 (코드·저장소에는 없어요).
   - 위치는 저장하지 않아요. 같은 동네(약 100m 단위) 결과는 잠깐 캐시해서 공공 API 호출을 줄여요.
   - peds  = 건강보험심사평가원 병원정보서비스 getHospBasisList (진료과 11 소아청소년과, 좌표 반경)
   - pharm = 국립중앙의료원 전국 약국 정보 조회 getParmacyLcinfoInqire (거리순 + 오늘 영업시간) */

const HOSP = 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList';
const PHARM = 'https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyLcinfoInqire';
const TTL = { peds: 6 * 3600, pharm: 600 };   // 소아과 목록은 6시간, 약국(오늘 영업시간)은 10분

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
  if (!['peds', 'pharm'].includes(kind) || !(lat > 33 && lat < 39) || !(lon > 124 && lon < 132)) return json({ ok: false, error: 'bad_input' }, 400);
  const key = env.DATA_GO_KR_KEY;
  if (!key) return json({ ok: false, needKey: true });

  // 약 100m 단위로 반올림한 좌표로 캐시 (정확한 위치를 남기지 않아요)
  const la = lat.toFixed(3), lo = lon.toFixed(3);
  const cacheKey = new Request(`${url.origin}/api/near?kind=${kind}&lat=${la}&lon=${lo}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  try {
    const rows = kind === 'peds' ? await peds(key, +la, +lo) : await pharm(key, +la, +lo);
    const res = json({ ok: true, rows, at: Date.now() }, 200, TTL[kind]);
    waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    return json({ ok: false, error: 'upstream', detail: String(e && e.message || e).slice(0, 160) }, 502);
  }
}

// 공공데이터포털은 '인코딩 키'와 '디코딩 키'를 둘 다 줘요. 어느 쪽을 넣어도 되게 해요
const enc = k => /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k);

async function call(base, key, params) {
  const q = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const r = await fetch(`${base}?serviceKey=${enc(key)}&${q}&_type=json`, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 0 } });
  const t = await r.text();
  if (!r.ok) throw new Error(`http_${r.status}`);
  let j; try { j = JSON.parse(t); } catch (e) {
    // 인증키 문제 등은 XML 로 와요: <returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>
    const m = t.match(/<returnAuthMsg>([^<]+)</) || t.match(/<resultMsg>([^<]+)</);
    throw new Error(m ? m[1] : 'not_json');
  }
  const head = j && j.response && j.response.header;
  if (head && head.resultCode && !/^0+$/.test(String(head.resultCode))) throw new Error(`${head.resultCode} ${head.resultMsg || ''}`.trim());
  let items = j && j.response && j.response.body && j.response.body.items;
  items = items && items.item !== undefined ? items.item : items;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

const num = v => { const n = Number(String(v == null ? '' : v).trim()); return Number.isFinite(n) && String(v).trim() !== '' ? n : null; };
function dist(a, b, c, d) {
  const R = 6371000, r = x => x * Math.PI / 180, dLa = r(c - a), dLo = r(d - b);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLo / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

// 🏥 소아청소년과 (진료과 코드 11). 가까운 곳이 적으면 반경을 넓혀요
async function peds(key, lat, lon) {
  let items = [];
  for (const radius of [3000, 8000]) {
    items = await call(HOSP, key, { xPos: lon, yPos: lat, radius, dgsbjtCd: '11', numOfRows: 60, pageNo: 1 });
    if (items.length >= 5) break;
  }
  return items.map(h => ({ n: h.yadmNm, a: h.addr, t: h.telno || '', k: h.clCdNm || '', la: num(h.YPos), lo: num(h.XPos) }))
    .filter(h => h.n && h.la != null && h.lo != null)
    .map(h => ({ ...h, d: dist(lat, lon, h.la, h.lo) }))
    .sort((x, y) => x.d - y.d).slice(0, 50);
}

// 💊 약국: 거리순 + 오늘 영업 시작·끝 (HHMM). '지금 영업 중'은 화면에서 현재 시각으로 계산해요
async function pharm(key, lat, lon) {
  const items = await call(PHARM, key, { WGS84_LON: lon, WGS84_LAT: lat, pageNo: 1, numOfRows: 50 });
  return items.map(p => ({ n: p.dutyName, a: p.dutyAddr, t: p.dutyTel1 || '', la: num(p.latitude), lo: num(p.longitude), s: num(p.startTime), e: num(p.endTime) }))
    .filter(p => p.n && p.la != null && p.lo != null)
    .map(p => ({ ...p, d: dist(lat, lon, p.la, p.lo) }))
    .sort((x, y) => x.d - y.d).slice(0, 50);
}

function json(obj, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store' }
  });
}
