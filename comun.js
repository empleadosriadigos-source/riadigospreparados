// Utilidades de pantalla compartidas por todas las páginas.
// Se carga DESPUÉS de supabase-shared.js y ANTES del <script> propio de cada página.
// Si una página necesita algo distinto, puede redefinir la función en su propio
// <script> (la última definición es la que vale). Hoy lo hace clientes.html con
// mostrarToast, porque tiene otro diseño.

// ── Texto y formato ─────────────────────────────────────────────────────────
function escHtml(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtFecha(iso){ if(!iso) return '—'; const [y,m,d]=iso.slice(0,10).split('-'); return `${d}/${m}/${y}`; }
// Cupón nuevo (#N, azul) o del sistema viejo (TN, amarillo).
function fmtCupon(p){
  if(p.nro_cupon_nuevo != null) return `<span style="color:#5BA8D4;font-weight:800">#${p.nro_cupon_nuevo}</span>`;
  return `<span style="color:#B8980A;font-weight:800">T${p.nro_cupon??'—'}</span>`;
}

// ── Avisos, estado y modales ────────────────────────────────────────────────
function mostrarToast(msg,tipo=''){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className='show '+tipo;
  clearTimeout(t._t); t._t=setTimeout(()=>{ t.className=''; },3500);
}
function setStatus(html,esError=false){ const el=document.getElementById('status'); el.innerHTML=html; el.className=esError?'error':''; }
function abrirModal(id){ document.getElementById(id).classList.add('open'); }
function cerrarModal(id){ document.getElementById(id).classList.remove('open'); }

// ── Login con Google ────────────────────────────────────────────────────────
// Las páginas con pantalla de login (#loginOverlay + #appRoot) solo definen
// initApp(): se llama una vez, cuando hay sesión. iniciarSesionGoogle y
// cerrarSesion vienen de supabase-shared.js. clientes.html no usa esto
// (redirige directo a Google).
let appIniciada = false;
function mostrarLogin(){ document.getElementById('loginOverlay').style.display='flex'; document.getElementById('appRoot').style.display='none'; }
function mostrarApp(session){
  document.getElementById('loginOverlay').style.display='none';
  document.getElementById('appRoot').style.display='';
  const u=session.user;
  const nameEl=document.getElementById('userNombre');
  if(nameEl) nameEl.textContent=u.user_metadata?.full_name||u.email||'';
  if(!appIniciada && typeof initApp==='function'){ appIniciada=true; initApp(); }
}
// Se engancha recién en DOMContentLoaded, cuando ya corrieron todos los <script>
// de la página: así initApp ya existe cuando llega la sesión. onAuthStateChange
// emite INITIAL_SESSION al suscribirse, así que no hace falta getSession().
function iniciarLoginComun(){
  if(!document.getElementById('loginOverlay')) return;
  sbAuth.auth.onAuthStateChange((_event,session)=>{
    if(session){ SB_TOKEN=session.access_token; mostrarApp(session); } else { SB_TOKEN=null; appIniciada=false; mostrarLogin(); }
  });
  document.getElementById('btnGoogleLogin')?.addEventListener('click', iniciarSesionGoogle);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', iniciarLoginComun);
else iniciarLoginComun();
