// ============================================================
//  Regista uma reserva no Airtable.   POST /api/reservar
//  O token vive em env.AIRTABLE_TOKEN (nunca no formulario).
// ============================================================
const AT_BASE  = 'appmjXzD9c8RNSHdr';
const AT_TABLE = 'tblxgGBUtYj820rdz';
const F = {
  key:'fldlCfYu5nlCs0Iir', type:'fldS7CwfZw8MzG0oU', content:'fldo3JkGMLTBdQHe4',
  summary:'fld4lQ4hZQdmoeYP0', updated:'fldVZVFHlpcEwQrms',
};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: CORS });

// Notifica por WhatsApp (via CallMeBot, grátis) quando entra uma reserva.
// Suporta VÁRIOS destinatários. Cada número tem a sua própria apikey no CallMeBot.
// Configuração nas variáveis do Cloudflare (uma destas formas):
//   1) Vários: WHATSAPP_DEST = "351911111111:11111,351922222222:22222"
//      (pares numero:apikey separados por vírgula)
//   2) Um só (formato antigo): WHATSAPP_PHONE + CALLMEBOT_APIKEY
async function notifyWhatsApp(env, reserva, eventLabel) {
  // monta a lista de destinatários {phone, apikey}
  const dests = [];
  if (env.WHATSAPP_DEST) {
    for (const par of env.WHATSAPP_DEST.split(',')) {
      const [phone, apikey] = par.split(':').map(s => (s || '').trim());
      if (phone && apikey) dests.push({ phone, apikey });
    }
  } else if (env.WHATSAPP_PHONE && env.CALLMEBOT_APIKEY) {
    dests.push({ phone: env.WHATSAPP_PHONE.trim(), apikey: env.CALLMEBOT_APIKEY.trim() });
  }
  if (!dests.length) return;                 // não configurado -> não faz nada

  const linhas = [
    '*Nova reserva* 🍽️',
    'Nome: ' + reserva.name,
    'Data: ' + reserva.date,
    'Pessoas: ' + reserva.people,
  ];
  if (reserva.phone) linhas.push('Tel: ' + reserva.phone);
  if (eventLabel) linhas.push('Evento: ' + eventLabel);
  if (reserva.notes) linhas.push('Notas: ' + reserva.notes);
  const texto = linhas.join('\n');

  // envia para todos (em paralelo); falhas são silenciosas
  await Promise.all(dests.map(d => {
    const url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(d.phone) +
                '&text=' + encodeURIComponent(texto) +
                '&apikey=' + encodeURIComponent(d.apikey);
    return fetch(url).catch(() => {});
  }));
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  if (request.method !== 'POST')    return json(405, { error: 'usa POST' });

  const TOKEN = env.AIRTABLE_TOKEN;
  if (!TOKEN) return json(500, { error: 'Servidor sem token configurado' });

  let data;
  try { data = await request.json(); }
  catch (e) { return json(400, { error: 'Pedido invalido' }); }

  const name = (data.name || '').toString().trim().slice(0, 120);
  const phone = (data.phone || '').toString().trim().slice(0, 40);
  const people = parseInt(data.people, 10) || 0;
  const notes = (data.notes || '').toString().trim().slice(0, 500);
  const date = (data.date || '').toString().trim();
  const type = data.type === 'festa' ? 'festa' : 'diario';
  const eventLabel = (data.eventLabel || '').toString().trim().slice(0, 160);
  const sourceKey = (data.sourceKey || '').toString().trim().slice(0, 80);

  if (!name)  return json(400, { error: 'Falta o nome' });
  if (!date)  return json(400, { error: 'Falta a data' });
  if (people < 1) return json(400, { error: 'Indica o numero de pessoas' });

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const reserva = {
    id, name, phone, date, time: '',
    people: String(people), type,
    notes: notes + (eventLabel ? (notes ? ' . ' : '') + 'Reserva via QR: ' + eventLabel : ''),
    status: 'ok', source: sourceKey || '', via: 'formulario',
  };

  const fields = {};
  fields[F.key] = 'res:' + id;
  fields[F.type] = 'reservation';
  fields[F.content] = JSON.stringify(reserva);
  fields[F.summary] = 'Reserva (QR): ' + name + (eventLabel ? ' - ' + eventLabel : '');
  fields[F.updated] = new Date().toISOString();

  try {
    const r = await fetch('https://api.airtable.com/v0/' + AT_BASE + '/' + AT_TABLE, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    if (!r.ok) {
      const t = await r.text();
      return json(502, { error: 'Falha ao registar', detail: t });
    }
    // notifica o dono por WhatsApp (não bloqueia a resposta ao cliente)
    if (context.waitUntil) context.waitUntil(notifyWhatsApp(env, reserva, eventLabel));
    else { try { await notifyWhatsApp(env, reserva, eventLabel); } catch (e) {} }
    return json(200, { ok: true });
  } catch (e) {
    return json(502, { error: 'Erro de ligacao', detail: String(e) });
  }
}
