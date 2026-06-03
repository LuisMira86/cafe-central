export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return new Response('usa GET', { status: 405 });
  if (!env.IMAGES) return new Response('KV nao configurado', { status: 500 });

  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  if (!id) return new Response('sem id', { status: 400 });

  const dataUrl = await env.IMAGES.get(id);
  if (!dataUrl) return new Response('nao encontrado', { status: 404 });

  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return new Response('formato invalido', { status: 500 });

  const mime = m[1];
  const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
