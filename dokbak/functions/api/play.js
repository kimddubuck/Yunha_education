/* 오늘도 독박육아 · 육아 지도 '놀이' 심부름꾼 (https://dokbak.pages.dev/api/play?lat=..&lon=..)
   - 행정안전부 전국어린이놀이시설정보서비스 getPfctInfo3: 시설 이름·주소·좌표·실내외·운영 여부
     → 설치장소 종류별로 전국 목록을 받아 하루 캐시하고, 내 위치에서 가까운 곳만 골라요 (요청에 지역 조건이 없어서)
   - 행정안전부 전국어린이놀이시설안전검사정보서비스 getSftyInsp4: 가까운 15곳만 최근 안전검사 합격·유효기간 (7일 캐시)
     검사자 이름 같은 개인 정보는 받아도 쓰지 않아요.
   - 운영시간은 이 자료에 없어요. */
const INFO = 'https://apis.data.go.kr/1741000/pfc3/getPfctInfo3';
const INSP = 'https://apis.data.go.kr/1741000/sfty4/getSftyInsp4';
// 누구나 갈 수 있는 곳만: 놀이제공영업소(키즈카페 등)·공공도서관·육아종합지원센터·박물관
// (아파트·어린이집·유치원·학교 놀이터는 그곳 사람만 쓰는 곳이라 빼요.
//  도시공원(A003)은 수가 많아 요청마다 받기엔 무거워서, 미리 받아 두는 방식으로 나중에 넣어요)
const PLACES = ['A013', 'A033', 'A092', 'A022'];
const PER = 1000, MAX_PAGES = 25;

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
  if (!(lat > 33 && lat < 39) || !(lon > 124 && lon < 132)) return json({ ok: false, error: 'bad_input' }, 400);
  const key = env.DATA_GO_KR_KEY;
  if (!key) return json({ ok: false, needKey: true });
  try {
    const lists = await Promise.all(PLACES.map(c => placeList(key, c, waitUntil)));
    let rows = [];
    for (const radius of [3000, 6000, 12000]) {
      rows = lists.flat().map(x => ({ ...x, d: dist(lat, lon, x.la, x.lo) })).filter(x => x.d <= radius);
      if (rows.length >= 15) break;
    }
    rows.sort((a, b) => a.d - b.d); rows = rows.slice(0, 60);
    // 가까운 15곳만 안전검사 결과를 붙여요 (최대 6초 기다리고, 늦으면 목록부터)
    const near = rows.slice(0, 15);
    const all = Promise.all(near.map(async r => { try { const v = await inspection(key, r.id); if (v) r.ins = v; } catch (e) {} }));
    await Promise.race([all, new Promise(ok => setTimeout(ok, 6000))]);
    return json({ ok: true, rows: rows.map(({ id, ...r }) => r) }, 200, 3600);
  } catch (e) {
    return json({ ok: false, error: 'upstream', detail: String(e && e.message || e).slice(0, 160) }, 502);
  }
}

const enc = k => /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k);
async function call(base, key, params, ms = 9000) {
  const q = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const url = `${base}?serviceKey=${enc(key)}&${q}`;
  let r;
  try { r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(ms) }); }
  catch (e) { r = await fetch(url.replace(/^https:/, 'http:'), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(ms) }); }
  const t = await r.text();
  if (!r.ok) throw new Error(`http_${r.status}`);
  let j; try { j = JSON.parse(t); } catch (e) {
    const m = t.match(/<returnAuthMsg>([^<]+)</) || t.match(/<resultMsg>([^<]+)</);
    throw new Error(m ? m[1] : 'not_json');
  }
  const h = j.response && j.response.header;
  if (h && h.resultCode && !/^0+$/.test(String(h.resultCode))) throw new Error(`${h.resultCode} ${h.resultMsg || ''}`.trim());
  const b = (j.response && j.response.body) || {};
  return { items: Array.isArray(b.items) ? b.items : b.items ? [b.items] : [], pages: Number(b.totalPageCnt) || 1 };
}

// 설치장소 종류 하나의 전국 목록 (운영 중이고 좌표가 있는 곳만, 하루 캐시)
async function placeList(key, code, waitUntil) {
  const ck = new Request(`https://cache.local/play/v1/${code}`), cache = caches.default;
  const hit = await cache.match(ck); if (hit) return hit.json();
  const out = [];
  let pages = 1;
  for (let p = 1; p <= Math.min(pages, MAX_PAGES); p++) {
    const r = await call(INFO, key, { pageIndex: p, recordCountPerPage: PER, instlPlaceCd: code });
    pages = r.pages;
    for (const x of r.items) {
      const la = Number(x.latCrtsVl), lo = Number(x.lotCrtsVl);
      if (x.operYnCd !== 'B001' || x.clsgYmd || !(la > 33 && la < 39) || !(lo > 124 && lo < 132)) continue;   // 운영 중인 곳만
      out.push({ id: x.pfctSn, n: x.pfctNm, a: [x.ronaAddr || x.lotnoAddr, x.ronaDaddr || x.lotnoDaddr].filter(Boolean).join(' '),
        k: x.instlPlaceCdNm || '', io: x.idrodrCdNm || '', ex: x.exfcYn === 'Y' ? 1 : 0, la, lo });
    }
  }
  waitUntil(cache.put(ck, new Response(JSON.stringify(out), { headers: { 'Cache-Control': 'public, max-age=86400', 'Content-Type': 'application/json' } })));
  return out;
}

// 가장 최근 안전검사: 유효기간(vldYmd)이 가장 늦은 기록의 합격 여부
async function inspection(key, id) {
  const ck = new Request(`https://cache.local/play-insp/v1/${encodeURIComponent(id)}`), cache = caches.default;
  const hit = await cache.match(ck); if (hit) return hit.json();
  const r = await call(INSP, key, { pageIndex: 1, recordCountPerPage: 50, pfctSn: id }, 5000);
  const last = r.items.filter(x => /^\d{8}$/.test(x.vldYmd || '')).sort((a, b) => b.vldYmd.localeCompare(a.vldYmd))[0];
  const out = last ? { p: last.passYn === 'Y' ? 1 : 0, v: last.vldYmd } : null;
  await cache.put(ck, new Response(JSON.stringify(out), { headers: { 'Cache-Control': 'public, max-age=604800', 'Content-Type': 'application/json' } }));
  return out;
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
