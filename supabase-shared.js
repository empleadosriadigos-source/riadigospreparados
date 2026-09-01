// Configuracion y funciones de acceso a Supabase, compartidas por todas las paginas.
// IMPORTANTE: este archivo debe cargarse (via <script src="supabase-shared.js">)
// DESPUES de la libreria supabase-js y ANTES del <script> propio de cada pagina.
//
// ⚠️ CACHE: los 6 HTML que lo cargan lo hacen como "supabase-shared.js?v=N".
// Cada vez que se modifique este archivo hay que subir ese "N" en los 6
// lugares (clientes.html, etiquetas.html, index.html, preparados.html,
// reporte.html, sucursal.html) — si no, los navegadores que ya lo tenían en
// caché van a seguir usando la versión vieja del archivo (aunque el HTML que
// lo referencia sí se actualice), y funciones nuevas como
// sbConReintentoDeSesion van a tirar "is not defined" hasta que el usuario
// haga un hard refresh. grep -rn "supabase-shared.js?v=" *.html para
// encontrar todos los lugares a actualizar.
//
// El login con Google (iniciarSesionGoogle/cerrarSesion), mostrar/ocultar la
// pantalla de login (mostrarApp/mostrarLogin) y el arranque de cada pagina
// (initApp) se mantienen en cada HTML por separado, porque dependen de los
// elementos propios de cada pantalla. Este archivo solo centraliza las
// credenciales y el "como" se pide/guarda/borra un dato en Supabase.

const SB_URL = 'https://zmxkazlpliapedsgbzhb.supabase.co/rest/v1';
const SB_URL_BASE = 'https://zmxkazlpliapedsgbzhb.supabase.co';
const SB_KEY = 'sb_publishable_7iSVOhG4YHUC9rFegjdJ4A_1GL4DTlV';

const sbAuth = supabase.createClient(SB_URL_BASE, SB_KEY);

// Token de sesion: cada pagina lo actualiza en su propio listener
// sbAuth.auth.onAuthStateChange(...) tal como lo hacia antes.
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
  const h=getAuthHeaders();
  if(!all){
    const resp=await fetch(`${SB_URL}/${path}`,{headers:h});
    if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.message||`HTTP ${resp.status}`);}
    return resp.json();
  }
  // Supabase impone un limite de filas por request (db.max_rows) que un
  // ?limit= mas alto no puede superar; hay que paginar con el header Range.
  const pageSize=1000;
  let offset=0, out=[], page;
  do{
    const resp=await fetch(`${SB_URL}/${path}`,{headers:{...h,'Range-Unit':'items','Range':`${offset}-${offset+pageSize-1}`}});
    if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.message||`HTTP ${resp.status}`);}
    page=await resp.json();
    out=out.concat(page);
    offset+=pageSize;
  }while(page.length===pageSize);
  return out;
}

async function sbPost(table,body){
  return sbConReintentoDeSesion(async () => {
    const resp = await fetch(`${SB_URL}/${table}`,{method:'POST',headers:getAuthHeaders({'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify(body)});
    if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.message||`HTTP ${resp.status}`);}
    return resp.json();
  });
}

async function sbPatch(table,id,body){
  return sbConReintentoDeSesion(async () => {
    const resp = await fetch(`${SB_URL}/${table}?id=eq.${id}`,{method:'PATCH',headers:getAuthHeaders({'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify(body)});
    if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.message||`HTTP ${resp.status}`);}
    return resp.json();
  });
}

async function sbDelete(path){
  return sbConReintentoDeSesion(async () => {
    const resp = await fetch(`${SB_URL}/${path}`,{method:'DELETE',headers:getAuthHeaders()});
    if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.message||`HTTP ${resp.status}`);}
  });
}
