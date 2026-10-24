/* 공동육아 SOS · 축제 심부름꾼 (Cloudflare Pages Functions → https://gongdong-sos.pages.dev/api/fest)
   한국관광공사 국문 관광정보 서비스(TourAPI, 공공데이터포털)의 '행사·축제 검색'(searchFestival2)으로
   오늘 이후 끝나는 전국 축제를 한 번에 받아 짧게 정리해서 돌려줘요. 시·도로 거르는 건 앱이 주소(addr1)로 해요.
   - 공공데이터 인증키는 Cloudflare 설정의 비밀 변수 DATA_GO_KR_KEY 에만 있어요 (코드·저장소에는 없어요).
     공공데이터포털에서 '한국관광공사_국문 관광정보 서비스_GW' 활용 신청이 되어 있어야 해요.
   - 사진은 저작권 유형(cpyrhtDivCd)이 공공누리 1유형·3유형(출처 표시, 상업적 이용 가능)인 것만 써요. 그 밖은 사진 없이 글만
   - 전국 결과를 6시간 동안 캐시해서 공공 API 호출을 줄여요 (방·동네와 상관없이 같은 결과) */

const API = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
const enc = k => /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k);
const kstYmd = () => { const d = new Date(Date.now() + 9 * 3600e3); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
const https = u => String(u || '').replace(/^http:\/\//, 'https://');

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const key = env.DATA_GO_KR_KEY;
  if (!key) return json({ ok: false, error: 'need_key' });
  const day = kstYmd();
  const cacheKey = new Request(`${url.origin}/api/fest?v=1&d=${day}&h=${Math.floor(new Date(Date.now() + 9 * 3600e3).getUTCHours() / 6)}`);
  const hit = await caches.default.match(cacheKey);
  if (hit) return hit;
  try {
    const r = await fetch(`${API}?serviceKey=${enc(key)}&numOfRows=1000&pageNo=1&MobileOS=ETC&MobileApp=gongdongSOS&_type=json&arrange=A&eventStartDate=${day}`, { signal: AbortSignal.timeout(12000) });
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch (e) { throw new Error(((text.match(/<returnAuthMsg>([^<]+)/) || text.match(/<resultMsg>([^<]+)/) || [])[1] || `http_${r.status}`).slice(0, 80)); }
    const h = j.response && j.response.header;
    if (!h || !['0000', '00'].includes(h.resultCode)) throw new Error(String((h && h.resultMsg) || j.resultMsg || 'no_header').slice(0, 80));
    let items = (((j.response.body || {}).items || {}).item) || [];
    if (!Array.isArray(items)) items = [items];
    const rows = items.filter(i => i && i.title && i.eventenddate >= day).map(i => ({
      id: String(i.contentid || ''), t: String(i.title).slice(0, 80), a: String(i.addr1 || '').slice(0, 80),
      s: String(i.eventstartdate || ''), e: String(i.eventenddate || ''),
      img: /^Type[13]$/.test(i.cpyrhtDivCd || '') ? https(i.firstimage2 || i.firstimage) : '', tel:   // 사진은 공공누리 1·3유형(상업적 이용 가능)만 String(i.tel || '').slice(0, 40),
      x: Number(i.mapx) || 0, y: Number(i.mapy) || 0
    }));
    const res = json({ ok: true, day, rows }, 200, 6 * 3600);
    waitUntil(caches.default.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    return json({ ok: false, error: String(e && e.message || e).slice(0, 100) }, 502);
  }
}

function json(obj, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store' }
  });
}
