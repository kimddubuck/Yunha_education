/* 서버 함수 코드(/functions/...)가 그대로 내려받아지지 않게 막아요 (🧪 AI 놀이 데이터는 운영자만 /api/aiplays 로) */
export const onRequest = () => new Response('Not found', { status: 404, headers: { 'x-robots-tag': 'noindex' } });
