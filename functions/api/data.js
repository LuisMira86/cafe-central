// ============================================================
//  Ponte segura para a app ler/escrever no Airtable.
//  O token do Airtable vive em env.AIRTABLE_TOKEN (servidor) — nunca no cliente.
//
//  Login: utilizadores guardados no Airtable em linhas com chave "user:<nome>"
//  e a password no campo Conteudo. A app envia o nome+password nos cabeçalhos
//  X-Auth-User / X-Auth-Pass e o servidor valida-os aqui.
//
//  GET  /api/data            -> devolve todos os registos {chave: valor}
//  POST /api/data            -> grava/atualiza  body: {key, value}
//  POST /api/data?del=1      -> apaga           body: {key}
// ============================================================
const AT_BASE  = 'appmjXzD9c8RNSHdr';
const AT_TABLE = 'tblxgGBUtYj820rdz';
const F = {
  key:'fldlCfYu5nlCs0Iir', type:'fldS7CwfZw8MzG0oU', content:'fldo3JkGMLTBdQHe4',
  summary:'fld4lQ4hZQdmoeYP0', updated:'fldVZVFHlpcEwQrms',
};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Auth-User, X-Auth-Pass, X-App-Password',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (s,o)=> new Response(JSON.stringify(o), { status:s, headers:CORS });

function keyType(k){
  if(k==='config') return 'config';
  if(k.startsWith('daily:')) return 'daily';
  if(k.startsWith('party:')) return 'party';
  if(k.startsWith('res:')) return 'reservation';
  if(k.startsWith('user:')) return 'user';
  return 'other';
}

// mapa chave -> recordId (para saber se atualiza ou cria)
async function pullAll(token){
  const out = {}; const ids = {};
  let offset = null;
  do {
    let url = 'https://api.airtable.com/v0/'+AT_BASE+'/'+AT_TABLE+'?pageSize=100&returnFieldsByFieldId=true';
    if(offset) url += '&offset='+encodeURIComponent(offset);
    const r = await fetch(url, { headers:{ 'Authorization':'Bearer '+token } });
    if(!r.ok) throw new Error('pull '+r.status);
    const d = await r.json();
    for(const rec of (d.records||[])){
      const k = rec.fields[F.key]; if(!k) continue;
      ids[k] = rec.id;
      const raw = rec.fields[F.content];
      try{ out[k] = raw!=null ? JSON.parse(raw) : null; }catch(e){ out[k]=raw; }
    }
    offset = d.offset;
  } while(offset);
  return { out, ids };
}

// extrai os utilizadores das linhas "user:<nome>". A password pode estar
// em texto simples no Conteudo, ou em JSON {"pass":"..."}.
function extractUsers(out){
  const users = {};
  for(const k in out){
    if(!k.startsWith('user:')) continue;
    const nome = k.slice(5);
    const v = out[k];
    let pass = '';
    if(v && typeof v==='object') pass = String(v.pass!=null ? v.pass : (v.password!=null ? v.password : ''));
    else pass = String(v==null ? '' : v);
    if(nome) users[nome] = pass;
  }
  return users;
}

export async function onRequest(context){
  const { request, env } = context;
  if(request.method==='OPTIONS') return new Response('', { status:204, headers:CORS });

  const TOKEN = env.AIRTABLE_TOKEN;
  if(!TOKEN) return json(500, { error:'sem token' });

  // lê tudo uma vez (serve para dados, ids e lista de utilizadores)
  let out, ids;
  try{ ({ out, ids } = await pullAll(TOKEN)); }
  catch(e){ return json(502, { error:'falha a ler', detail:String(e) }); }

  // ---- autenticação (validada no servidor) ----
  const users = extractUsers(out);
  const temLogin = Object.keys(users).length > 0;
  if(temLogin){
    const u = request.headers.get('X-Auth-User') || '';
    const p = request.headers.get('X-Auth-Pass') || '';
    if(!u || users[u]==null || String(users[u]) !== String(p)){
      return json(401, { error:'nao autorizado' });
    }
  } else if(env.APP_PASSWORD){
    if((request.headers.get('X-App-Password')||'') !== env.APP_PASSWORD){
      return json(401, { error:'nao autorizado' });
    }
  }

  // ---- GET: devolve os dados (sem expor as linhas de utilizadores) ----
  if(request.method==='GET'){
    const limpo = {};
    for(const k in out){ if(!k.startsWith('user:')) limpo[k] = out[k]; }
    return json(200, { data: limpo });
  }

  // ---- POST: gravar / apagar ----
  if(request.method==='POST'){
    const url = new URL(request.url);
    const isDelete = url.searchParams.get('del')==='1';
    let body;
    try{ body = await request.json(); }catch(e){ return json(400,{error:'pedido invalido'}); }
    const key = (body && body.key||'').toString();
    if(!key) return json(400, { error:'sem chave' });
    // a app nunca mexe nas linhas de utilizadores (geridas só no Airtable)
    if(key.startsWith('user:')) return json(403, { error:'nao permitido' });
    const rid = ids[key];

    if(isDelete){
      if(rid){
        const r = await fetch('https://api.airtable.com/v0/'+AT_BASE+'/'+AT_TABLE+'/'+rid, {
          method:'DELETE', headers:{ 'Authorization':'Bearer '+TOKEN }
        });
        if(!r.ok) return json(502, { error:'falha a apagar' });
      }
      return json(200, { ok:true });
    }

    const val = body.value;
    const fields = {};
    fields[F.key] = key;
    fields[F.type] = keyType(key);
    fields[F.content] = JSON.stringify(val);
    fields[F.summary] = (typeof val==='object' && val && val.name) ? String(val.name).slice(0,80) : key;
    fields[F.updated] = new Date().toISOString();

    let r;
    if(rid){
      r = await fetch('https://api.airtable.com/v0/'+AT_BASE+'/'+AT_TABLE+'/'+rid, {
        method:'PATCH', headers:{ 'Authorization':'Bearer '+TOKEN, 'Content-Type':'application/json' },
        body: JSON.stringify({ fields, typecast:true })
      });
    } else {
      r = await fetch('https://api.airtable.com/v0/'+AT_BASE+'/'+AT_TABLE, {
        method:'POST', headers:{ 'Authorization':'Bearer '+TOKEN, 'Content-Type':'application/json' },
        body: JSON.stringify({ records:[{ fields }], typecast:true })
      });
    }
    if(!r.ok){ const t = await r.text(); return json(502, { error:'falha a gravar', detail:t }); }
    return json(200, { ok:true });
  }

  return json(405, { error:'metodo nao suportado' });
}
