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
  if(!appIniciada && typeof initApp==='function'){
    appIniciada=true;
    // Un error al arrancar la página no tiene que salir de acá: supabase-js toma
    // cualquier error del callback de onAuthStateChange como "sin sesión" y
    // volvía a pedir el login (pasaba al cambiar de página con la sesión guardada).
    try{
      const r=initApp();
      if(r && typeof r.catch==='function') r.catch(err=>{ console.error(err); mostrarToast('Error al cargar la página: '+err.message,'err'); });
    }catch(err){ console.error(err); mostrarToast('Error al cargar la página: '+err.message,'err'); }
  }
}
// Se engancha recién en DOMContentLoaded, cuando ya corrieron todos los <script>
// de la página: así initApp ya existe cuando llega la sesión. onAuthStateChange
// emite INITIAL_SESSION al suscribirse, así que no hace falta getSession().
function iniciarLoginComun(){
  if(!document.getElementById('loginOverlay')) return;
  completarBotonesFiltros(); // antes de initApp, que marca los filtros activos
  sbAuth.auth.onAuthStateChange((_event,session)=>{
    if(session){ SB_TOKEN=session.access_token; mostrarApp(session); } else { SB_TOKEN=null; appIniciada=false; mostrarLogin(); }
  });
  document.getElementById('btnGoogleLogin')?.addEventListener('click', iniciarSesionGoogle);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', iniciarLoginComun);
else iniciarLoginComun();

// ── Buscador con menú de filtros (buscador-filtros.css) ─────────────────────
// Estructura: <div class="con-filtros" id="X"> input.buscador-input + button.btn-filtros + div.filtros-menu </div>
// Un campo del menú cuenta como filtro activo si su valor es distinto de data-defecto (o de '').
function botonFiltrosHtml(){
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg> Filtros<span class="filtros-badge"></span>';
}
function completarBotonesFiltros(){
  document.querySelectorAll('.btn-filtros').forEach(b=>{ if(!b.innerHTML.trim()) b.innerHTML=botonFiltrosHtml(); });
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',completarBotonesFiltros); else completarBotonesFiltros();
function toggleFiltros(btn,ev){
  if(ev) ev.stopPropagation();
  const menu=btn.parentElement.querySelector('.filtros-menu');
  const abrir=!menu.classList.contains('abierto');
  cerrarFiltros();
  menu.classList.toggle('abierto',abrir);
  btn.classList.toggle('abierto',abrir);
}
function cerrarFiltros(){
  document.querySelectorAll('.filtros-menu.abierto,.btn-filtros.abierto').forEach(el=>el.classList.remove('abierto'));
}
document.addEventListener('click',e=>{ if(!e.target.closest('.con-filtros')) cerrarFiltros(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') cerrarFiltros(); });
function camposFiltro(wrapId){
  return [...document.querySelectorAll(`#${wrapId} .filtros-menu select, #${wrapId} .filtros-menu input`)];
}
function marcarFiltrosActivos(wrapId){
  const n=camposFiltro(wrapId).filter(el=>el.value!==(el.dataset.defecto??'')).length;
  const btn=document.querySelector(`#${wrapId} .btn-filtros`);
  if(!btn) return;
  btn.classList.toggle('activo',n>0);
  if(!btn.querySelector('.filtros-badge')) btn.innerHTML=botonFiltrosHtml();
  btn.querySelector('.filtros-badge').textContent=n||'';
}
function limpiarFiltros(wrapId){
  camposFiltro(wrapId).forEach(el=>{ el.value=el.dataset.defecto??''; });
}

// ── Búsqueda por palabras (igual que buscar_preparados en la base) ──────────
// Cada palabra tiene que aparecer; "-palabra" excluye; sin distinguir acentos ni mayúsculas.
function normalizarTexto(t){
  return String(t??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
}
function palabrasBusqueda(q){
  const incluir=[], excluir=[];
  normalizarTexto(q).split(/\s+/).map(w=>w.replace(/^[+,;]+|[+,;]+$/g,'')).filter(w=>/[a-z0-9]/.test(w))
    .forEach(w=>{ if(w[0]==='-') excluir.push(w.slice(1)); else incluir.push(w); });
  return {incluir, excluir};
}
