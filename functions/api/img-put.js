const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: CORS });

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  if (request.method !== 'POST')    return json(405, { error: 'usa POST' });

  if (!env.IMAGES) return json(500, { error: 'KV (IMAGES) nao configurado' });

  let body;
  try { body = await request.json(); }
  catch (e) { return json(400, { error: 'pedido invalido' }); }

  const dataUrl = (body && body.dataUrl) || '';
  if (!dataUrl.startsWith('data:image/')) return json(400, { error: 'imagem invalida' });
  if (dataUrl.length > 3500000) return json(413, { error: 'imagem demasiado grande' });

  const id = 'img' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  try {
    await env.IMAGES.put(id, dataUrl);
    return json(200, { id });
  } catch (e) {
    return json(502, { error: 'falha ao guardar', detail: String(e) });
  }
}
