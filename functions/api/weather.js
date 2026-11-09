/* 공동육아 SOS · 우리 동네 날씨 심부름꾼 (Cloudflare Pages Functions → https://gongdong-sos.pages.dev/api/weather?lat=..&lon=..)
   앱이 '방장이 정한 구의 가운데 좌표'를 보내면 기상청 단기예보 조회서비스(공공데이터포털)에 대신 물어보고 짧게 정리해서 돌려줘요.
   - 공공데이터 인증키는 Cloudflare 설정의 비밀 변수 DATA_GO_KR_KEY 에만 있어요 (코드·저장소에는 없어요).
     공공데이터포털에서 '기상청_단기예보 ((구)_동네예보) 조회서비스' 활용 신청이 되어 있어야 해요.
   - 위경도 → 기상청 격자(nx, ny)로 바꿔서 물어봐요. 같은 격자 결과는 10분 동안 캐시해요.
   - getUltraSrtNcst(초단기실황): 지금 기온 T1H · 습도 REH · 강수형태 PTY · 1시간 강수량 RN1
   - getVilageFcst(단기예보, 그날 02시 발표): 오늘 최저 TMN · 최고 TMX · 시간별 하늘 SKY · 강수형태 PTY · 강수확률 POP */

const BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/';
const enc = k => /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k);

// 기상청 격자 변환 (Lambert Conformal Conic, 기상청 단기예보 활용 가이드의 식)
function grid(lat, lon) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136, D = Math.PI / 180;
  const re = RE / GRID, s1 = SLAT1 * D, s2 = SLAT2 * D, olon = OLON * D, olat = OLAT * D;
  let sn = Math.tan(Math.PI * 0.25 + s2 * 0.5) / Math.tan(Math.PI * 0.25 + s1 * 0.5);
  sn = Math.log(Math.cos(s1) / Math.cos(s2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + s1 * 0.5); sf = Math.pow(sf, sn) * Math.cos(s1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5); ro = re * sf / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * D * 0.5); ra = re * sf / Math.pow(ra, sn);
  let th = lon * D - olon; if (th > Math.PI) th -= 2 * Math.PI; if (th < -Math.PI) th += 2 * Math.PI; th *= sn;
  return { nx: Math.floor(ra * Math.sin(th) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(th) + YO + 0.5) };
}
// 한국 시각 (Workers 는 UTC 라서 9시간 더해서 getUTC* 로 읽어요)
const kst = (ms = Date.now()) => new Date(ms + 9 * 3600e3);
const ymd = d => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
const hh = d => String(d.getUTCHours()).padStart(2, '0');

async function call(key, op, base_date, base_time, g) {
  const r = await fetch(`${BASE}${op}?serviceKey=${enc(key)}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${g.nx}&ny=${g.ny}`, { signal: AbortSignal.timeout(8000) });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch (e) { throw new Error(((text.match(/<returnAuthMsg>([^<]+)/) || text.match(/<resultMsg>([^<]+)/) || [])[1] || `http_${r.status}`).slice(0, 80)); }
  const h = j.response && j.response.header;
  if (!h || h.resultCode !== '00') throw new Error(String((h && h.resultMsg) || 'no_header').slice(0, 80));
  return (((j.response.body || {}).items || {}).item) || [];
}

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
  if (!(lat > 33 && lat < 39) || !(lon > 124 && lon < 132)) return json({ ok: false, error: 'bad_input' }, 400);
  const key = env.DATA_GO_KR_KEY;
  if (!key) return json({ ok: false, error: 'need_key' });
  const g = grid(lat, lon), now = kst();
  const cacheKey = new Request(`${url.origin}/api/weather?v=1&nx=${g.nx}&ny=${g.ny}&t=${ymd(now)}${hh(now)}${Math.floor(now.getUTCMinutes() / 10)}`);
  const hit = await caches.default.match(cacheKey);
  if (hit) return hit;
  try {
    // 초단기실황: 매시 정각 자료가 40분쯤 뒤에 나와요 → 40분 전 시각의 정각
    const nb = kst(Date.now() - 40 * 60e3);
    // 단기예보: 그날 02시 발표(02:10쯤 나옴)에 오늘 최저·최고가 다 있어요. 그 전이면 어제 23시 발표
    const early = now.getUTCHours() < 2 || (now.getUTCHours() === 2 && now.getUTCMinutes() < 15);
    const fb = early ? kst(Date.now() - 4 * 3600e3) : now;
    const [ncst, fcst] = await Promise.all([
      call(key, 'getUltraSrtNcst', ymd(nb), hh(nb) + '00', g),
      call(key, 'getVilageFcst', ymd(fb), early ? '2300' : '0200', g)
    ]);
    const ob = {}; ncst.forEach(i => { ob[i.category] = i.obsrValue; });
    const today = ymd(now), hour = now.getUTCHours();
    const fc = fcst.filter(i => i.fcstDate === today);
    const val = c => fc.filter(i => i.category === c);
    const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
    const tmps = val('TMP').map(i => num(i.fcstValue)).filter(v => v != null);
    const max = num((val('TMX')[0] || {}).fcstValue) ?? (tmps.length ? Math.max(...tmps) : null);
    const min = num((val('TMN')[0] || {}).fcstValue) ?? (tmps.length ? Math.min(...tmps) : null);
    const pty = Number(ob.PTY || 0), rn1 = num(ob.RN1) || 0;
    const rest = c => val(c).filter(i => { const t = Number(i.fcstTime.slice(0, 2)); return t >= hour && t <= 18; });
    const rainLater = rest('PTY').some(i => ['1', '2', '4'].includes(i.fcstValue)) || rest('POP').some(i => Number(i.fcstValue) >= 60);
    const sky = Number(((val('SKY').find(i => Number(i.fcstTime.slice(0, 2)) >= hour)) || {}).fcstValue || 1);
    const rainNow = [1, 2, 5, 6].includes(pty) || rn1 > 0, snow = [3, 7].includes(pty);
    const t = num(ob.T1H), rh = num(ob.REH);
    if (t == null || max == null || min == null) throw new Error('empty');
    const icon = rainNow ? '☔' : snow ? '❄️' : sky === 1 ? '☀️' : sky === 3 ? '⛅' : '☁️';
    const res = json({ ok: true, w: { t: Math.round(t), rh: Math.round(rh ?? 0), max: Math.round(max), min: Math.round(min), rainNow, rainLater, icon } }, 200, 600);
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
