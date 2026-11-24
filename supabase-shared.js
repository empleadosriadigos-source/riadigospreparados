// Configuracion y funciones de acceso a Supabase, compartidas por todas las paginas.
// IMPORTANTE: este archivo debe cargarse (via <script src="supabase-shared.js">)
// DESPUES de la libreria supabase-js y ANTES del <script> propio de cada pagina.
//
// ⚠️ CACHE: los HTML cargan los .js y .css propios como "archivo?v=N", todos con
// el mismo N. Cada vez que se modifique un .js o .css compartido hay que correr
// "sh subir-version.sh" (sube N en todos los HTML de una vez); si no, los
// navegadores que ya tenían el archivo en caché siguen usando la versión vieja
// y aparecen errores tipo "… is not defined" hasta un Ctrl+F5.
//
// Este archivo centraliza las credenciales y el "cómo" se pide/guarda/borra un
// dato en Supabase. La pantalla de login (mostrarApp/mostrarLogin) está en
// comun.js; cada página solo define su initApp().

const SB_URL = 'https://zmxkazlpliapedsgbzhb.supabase.co/rest/v1';
const SB_URL_BASE = 'https://zmxkazlpliapedsgbzhb.supabase.co';
const SB_KEY = 'sb_publishable_7iSVOhG4YHUC9rFegjdJ4A_1GL4DTlV';

const sbAuth = supabase.createClient(SB_URL_BASE, SB_KEY);

// Token de sesion: lo actualiza el listener de comun.js (clientes.html tiene el suyo).
let SB_TOKEN = null;

// redirectTo dinamico: vuelve siempre a la MISMA pagina donde se inicio el login
// (antes, 3 de las 5 paginas tenian hardcodeado index.html y te mandaban al
// Kanban aunque hubieras iniciado sesion desde "Preparados anteriores", etc).
async function iniciarSesionGoogle(){
  await sbAuth.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});
}
async function cerrarSesion(){ await sbAuth.auth.signOut(); location.reload(); }

function getAuthHeaders(extra){
  return Object.assign({'apikey':SB_KEY,'Authorization':'Bearer '+(SB_TOKEN||SB_KEY)}, extra||{});
}

// Todas las llamadas a Supabase pasan por acá en vez de fetch() directo.
// Sin esto, si la conexión se cuelga a mitad de una petición (típico en
// wifi de sucursal), el await queda esperando para siempre: un botón que
// dice "Guardando…" se queda así sin límite, sin error, sin forma de que
// el usuario sepa que tiene que reintentar.
async function fetchConTimeout(url, options={}, ms=20000){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), ms);
  try{
    return await fetch(url, {...options, signal: controller.signal});
  }catch(err){
    if(err.name === 'AbortError') throw new Error('Se agotó el tiempo de espera. Revisá tu conexión e intentá de nuevo.');
    throw err;
  }finally{
    clearTimeout(timer);
  }
}

// Cuando la pestaña queda mucho tiempo en segundo plano (o la compu se
// suspende), el refresco automático de token de supabase-js puede no
// dispararse a tiempo. La sesión vieja en memoria queda "vencida" del lado
// del servidor, y como el JWT sigue teniendo formato válido, PostgREST no
// devuelve 401 sino que las policies de RLS simplemente no encuentran el
// email del usuario y la escritura se rechaza con un mensaje críptico tipo
// "new row violates row-level security policy". Estas dos funciones
// detectan ese caso, intentan refrescar la sesión una vez y reintentan.
function esErrorDeSesionVencida(msg){
  if(!msg) return false;
  const m = msg.toLowerCase();
  return m.includes('row-level security') || m.includes('jwt expired') || m.includes('invalid jwt') || m.includes('pgrst301');
}
async function sbConReintentoDeSesion(ejecutar){
  try{
    return await ejecutar();
  }catch(err){
    if(!esErrorDeSesionVencida(err.message)) throw err;
    try{
      const {data, error} = await sbAuth.auth.refreshSession();
      if(!error && data && data.session){
        SB_TOKEN = data.session.access_token;
        return await ejecutar();
      }
    }catch(err2){ /* sigue al mensaje de abajo */ }
    if(typeof mostrarLogin === 'function') mostrarLogin();
    throw new Error('Tu sesión expiró. Volvé a iniciar sesión e intentá de nuevo.');
  }
}

async function sbGet(path, all=false){
  return sbConReintentoDeSesion(async () => {
    const h=getAuthHeaders();
    if(!all){
      const resp=await fetchConTimeout(`${SB_URL}/${path}`,{headers:h});
      if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.message||`HTTP ${resp.status}`);}
      return resp.json();
    }
    // Supabase impone un limite de filas por request (db.max_rows) que un
    // ?limit= mas alto no puede superar; hay que paginar con el header Range.
    const pageSize=1000;
    let offset=0, out=[], page;
    do{
      const resp=await fetchConTimeout(`${SB_URL}/${path}`,{headers:{...h,'Range-Unit':'items','Range':`${offset}-${offset+pageSize-1}`}});
      if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.message||`HTTP ${resp.status}`);}
      page=await resp.json();
      out=out.concat(page);
      offset+=pageSize;
    }while(page.length===pageSize);
    return out;
  });
}

async function sbPost(table,body){
  return sbConReintentoDeSesion(async () => {
    const resp = await fetchConTimeout(`${SB_URL}/${table}`,{method:'POST',headers:getAuthHeaders({'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify(body)});
    if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.message||`HTTP ${resp.status}`);}
    return resp.json();
  });
}

async function sbPatch(table,id,body){
  return sbConReintentoDeSesion(async () => {
    const resp = await fetchConTimeout(`${SB_URL}/${table}?id=eq.${id}`,{method:'PATCH',headers:getAuthHeaders({'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify(body)});
    if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.message||`HTTP ${resp.status}`);}
    return resp.json();
  });
}

async function sbDelete(path){
  return sbConReintentoDeSesion(async () => {
    const resp = await fetchConTimeout(`${SB_URL}/${path}`,{method:'DELETE',headers:getAuthHeaders()});
    if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.message||`HTTP ${resp.status}`);}
  });
}

// ── Imágenes del minichat (adjuntas a preparado_comentarios) ───────────────
// Bucket privado 'chat-imagenes' en Supabase Storage. Convención de ruta:
// {preparado_id}/{nombre archivo}. Las RLS de storage.objects reusan la misma
// regla que preparado_comentarios (admin ve todo, sucursal solo lo suyo).

// Recomprime en el cliente antes de subir: la mayoría de fotos de celular
// pesan 2-4 MB, esto las deja en el orden de 100-300 KB sin perder legibilidad,
// que es lo que importa para conexiones de sucursal.
async function comprimirImagen(file, maxAncho=1100, calidad=0.72){
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, maxAncho / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', calidad));
}

async function sbSubirImagen(bucket, path, blob){
  return sbConReintentoDeSesion(async () => {
    const resp = await fetchConTimeout(`${SB_URL_BASE}/storage/v1/object/${bucket}/${path}`,{
      method:'POST',
      // Nombres únicos (nunca se pisan): el navegador puede guardarla 1 año.
      headers:getAuthHeaders({'Content-Type':blob.type||'image/jpeg','cache-control':'max-age=31536000'}),
      body:blob
    });
    if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.message||`HTTP ${resp.status}`);}
    return resp.json();
  });
}

// Borra un archivo del bucket (usado al borrar un mensaje del chat que tiene
// imagen). Hay que llamarlo ANTES de borrar la fila de preparado_comentarios:
// la policy de storage que autoriza el borrado valida contra ese comentario
// (que el autor_tipo sea el propio y que el preparado sea de la sucursal/admin
// correspondiente), así que si la fila ya no existe, el borrado del archivo
// se rechaza.
async function sbEliminarImagen(bucket, path){
  return sbConReintentoDeSesion(async () => {
    const resp = await fetchConTimeout(`${SB_URL_BASE}/storage/v1/object/${bucket}/${path}`,{method:'DELETE',headers:getAuthHeaders()});
    if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.message||`HTTP ${resp.status}`);}
  });
}

// URL firmada temporal (1h por defecto) para ver una imagen del bucket privado.
// Las URLs firmadas se reutilizan (memoria + sessionStorage) mientras les quede
// más de 1 h: así, al re-dibujar el kanban o el chat, la imagen sale de la caché
// del navegador y no se vuelve a bajar de Supabase (egress). Antes cada recarga
// por Realtime firmaba una URL nueva y la bajaba otra vez (~100 KB por imagen).
const _firmasImagen = {};
async function sbFirmarImagen(bucket, path, expiresIn=86400){
  const clave = 'firma:'+bucket+'/'+path, ahora = Date.now();
  let f = _firmasImagen[clave];
  if(!f){ try{ f = JSON.parse(sessionStorage.getItem(clave)||'null'); }catch(e){ f = null; } }
  if(f && f.vence - ahora > 3600*1000){ _firmasImagen[clave] = f; return f.url; }
  const url = await _sbFirmarImagenNueva(bucket, path, expiresIn);
  f = {url, vence: ahora + expiresIn*1000};
  _firmasImagen[clave] = f;
  try{ sessionStorage.setItem(clave, JSON.stringify(f)); }catch(e){ /* sin storage: queda solo en memoria */ }
  return url;
}
async function _sbFirmarImagenNueva(bucket, path, expiresIn){
  return sbConReintentoDeSesion(async () => {
    const resp = await fetchConTimeout(`${SB_URL_BASE}/storage/v1/object/sign/${bucket}/${path}`,{
      method:'POST',
      headers:getAuthHeaders({'Content-Type':'application/json'}),
      body:JSON.stringify({expiresIn})
    });
    if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.message||`HTTP ${resp.status}`);}
    const data = await resp.json();
    return SB_URL_BASE + '/storage/v1' + data.signedURL;
  });
}
