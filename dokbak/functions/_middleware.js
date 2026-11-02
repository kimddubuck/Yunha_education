/* 대표 주소는 독박육아.com 하나로: 예전 주소(dokbak.pages.dev)나 www 로 들어오면 같은 페이지의 독박육아.com 으로 영구 이동(301)
   (검색엔진이 주소 여러 개를 같은 사이트로 보게 해요. 미리보기 배포 주소 *.dokbak.pages.dev 는 그대로 둬요) */
const HOME = 'xn--iq1br1ns0hr0b.com';
export async function onRequest({ request, next }) {
  const u = new URL(request.url);
  if ((u.hostname === 'dokbak.pages.dev' || u.hostname === 'www.' + HOME) && request.method === 'GET') {
    u.hostname = HOME; u.protocol = 'https:'; u.port = '';
    return Response.redirect(u.toString(), 301);
  }
  return next();
}
