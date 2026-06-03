// ============================================================
//  Devolve config (logo, nome) e o menu/evento pedido.
//  GET /api/menu?key=...   So LE.
// ============================================================
const AT_BASE  = 'appmjXzD9c8RNSHdr';
const AT_TABLE = 'tblxgGBUtYj820rdz';
const F = { key:'fldlCfYu5nlCs0Iir', content:'fldo3JkGMLTBdQHe4' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: CORS });

async function atGetByKey(token, key){
  let offset = null;
  do {
    let url = 'https://api.airtable.com/v0/' + AT_BASE + '/' + AT_TABLE +
      '?pageSize=100&returnFieldsByFieldId=true';
    if (offset) url += '&offset=' + encodeURIComponent(offset);
    const r = await fetch(url, { headers:{ 'Authorization':'Bearer '+token } });
    if(!r.ok) return null;
    const d = await r.json();
    for (const rec of (d.records||[])) {
      if (rec.fields[F.key] === key) {
        const raw = rec.fields[F.content];
        try { return raw!=null ? JSON.parse(raw) : null; } catch(e){ return null; }
      }
    }
    offset = d.offset;
  } while (offset);
  return null;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  if (request.method !== 'GET')     return json(405, { error: 'usa GET' });

  const TOKEN = env.AIRTABLE_TOKEN;
  if (!TOKEN) return json(500, { error: 'sem token' });

  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  if(!key) return json(400, { error: 'sem chave' });
  // segurança: o formulário público só pode pedir config/menus/festas
  if(key.startsWith('res:') || key.startsWith('user:')) return json(403, { error: 'nao permitido' });

  try {
    const [config, menu] = await Promise.all([
      atGetByKey(TOKEN, 'config'),
      atGetByKey(TOKEN, key),
    ]);
    return json(200, {
      config: config ? { name: config.name||'', sub: config.sub||'', logo: config.logo||'', initial: config.initial||'' } : null,
      menu: menu || null,
    });
  } catch (e) {
    return json(502, { error: 'erro de ligacao' });
  }
}
