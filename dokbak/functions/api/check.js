/* 오늘도 독박육아 · 공공데이터 연결 점검 (https://dokbak.pages.dev/api/check)
   지도에 쓰는 API마다 한 건씩 물어보고 '키가 통하는지'만 보여줘요. 키 값은 화면에 나오지 않아요. */
const TESTS = [
  ['🏥 병원정보서비스 (소아과 목록)', 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList', { xPos: 129.0838, yPos: 35.2049, radius: 1000, dgsbjtCd: '11', numOfRows: 1, pageNo: 1 }],
  ['🕘 의료기관별상세정보서비스 (진료시간)', 'https://apis.data.go.kr/B551182/MadmDtlInfoService2.8/getDtlInfo2.8', { ykiho: '', numOfRows: 1, pageNo: 1 }],
  ['💊 전국 약국 정보 조회 서비스', 'https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyLcinfoInqire', { WGS84_LON: 129.0838, WGS84_LAT: 35.2049, pageNo: 1, numOfRows: 1 }]
];
const enc = k => /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k);

export async function onRequestGet({ env }) {
  const key = env.DATA_GO_KR_KEY, out = [];
  out.push(`공공데이터 키(DATA_GO_KR_KEY): ${key ? '✅ 들어 있어요' : '❌ 없어요'}`);
  out.push(`카카오 키(KAKAO_REST_KEY): ${env.KAKAO_REST_KEY ? '✅ 들어 있어요' : '❌ 없어요'}`);
  if (key) {
    // 진료시간 점검용 병원 번호(ykiho)는 소아과 목록에서 하나 꺼내 써요
    let ykiho = '';
    for (const [name, base, p0] of TESTS) {
      const p = { ...p0 }; if ('ykiho' in p) { if (!ykiho) { out.push(`${name}: ⏭ 소아과 목록을 먼저 받아야 점검할 수 있어요`); continue; } p.ykiho = ykiho; }
      const q = Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      try {
        const r = await fetch(`${base}?serviceKey=${enc(key)}&${q}&_type=json`, { signal: AbortSignal.timeout(8000) });
        const t = await r.text();
        let msg;
        try {
          const j = JSON.parse(t), h = j.response && j.response.header, b = j.response && j.response.body;
          const ok = h && /^0+$/.test(String(h.resultCode));
          let it = b && b.items; it = it && it.item !== undefined ? it.item : it; it = Array.isArray(it) ? it : it ? [it] : [];
          if (ok && !ykiho && it[0] && it[0].ykiho) ykiho = it[0].ykiho;
          const extra = ok && 'ykiho' in p0 ? (it[0] && it[0].trmtMonStart != null ? ' · 진료시간 칸 있음' : ' · 진료시간 칸이 비어 있어요') : '';
          msg = ok ? `✅ 연결됨 (결과 ${b && b.totalCount != null ? b.totalCount : it.length}건)${extra}` : `⚠️ ${h ? `${h.resultCode} ${h.resultMsg || ''}` : '응답 형식이 달라요'}`;
        } catch (e) {
          const m = t.match(/<returnAuthMsg>([^<]+)</) || t.match(/<resultMsg>([^<]+)</);
          msg = `❌ ${m ? m[1] : `HTTP ${r.status}`}${m && /NOT_REGISTERED/.test(m[1]) ? ' (아직 신청 안 됐거나 키 등록 중이에요)' : ''}`;
        }
        out.push(`${name}: ${msg}`);
      } catch (e) { out.push(`${name}: ❌ ${/timeout|abort/i.test(String(e && e.name)) ? '응답 없음(시간 초과)' : '연결 실패'}`); }
    }
  }
  out.push('', `점검 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
  return new Response(out.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
