// Formulario de preparado: piezas compartidas por index.html, sucursal.html y
// preparados.html. Una sola versión de cada cosa, para que un cambio (por
// ejemplo, cómo se guardan los envases) se haga UNA vez.
//
// Se carga después de constantes.js, supabase-shared.js y comun.js, y antes
// del <script> propio de la página.
//
// Contiene:
//   · estado compartido (drogas, clientes, fórmulas de stock)
//   · buscadores de cliente y de droga (".ss-…")
//   · filas de componentes (con c.s.p "100" / "Total")
//   · forma farmacéutica → unidad, precio por unidad ↔ total
//   · fórmulas de stock (selector y vista previa en el modal de carga)
//   · modal de clientes (lista, alta y edición)
//   · modal "Editar preparado" (index y preparados): HTML, abrir y guardar
//   · modal "Cancelar preparado" (index y preparados): los preparados nunca se borran
//
// Ganchos opcionales que puede definir la página (si existen, se llaman):
//   alCargarFormulasStock()                 → después de traer las fórmulas
//   alActualizarCliente(id, nombre, tel)    → después de editar un cliente
//   alCancelarPreparado(id)                 → después de cancelar un preparado
// Y una constante que define la página que tiene modal de carga con stock:
//   MODAL_NUEVO_PREPARADO = 'modalPreparado' | 'modalPedido'

// ── Estado compartido ───────────────────────────────────────────────────────
let drogas = [], clientes = [];
let cbDrogaIdx = null, clienteCB = null;
let formulasStock = [], formulasStockComponentes = {}, formulaStockSeleccionada = null;
let vistaPrepModal = 'normal', vistaPicker = 'grid';

// Clientes: se piden solo cuando se usa un buscador o el modal, sin límite de filas.
let clientesCargados = false, _clientesPromesa = null;
function asegurarClientes(){
  if(clientesCargados) return Promise.resolve();
  if(!_clientesPromesa){
    _clientesPromesa = sbGet('clientes?order=nombre.asc&select=id,nombre,telefono,observaciones', true)
      .then(c=>{ clientes=c; clientesCargados=true; })
      .finally(()=>{ _clientesPromesa=null; });
  }
  return _clientesPromesa;
}
// Drogas: no cambian seguido, así que se cargan una vez por página (no en cada recarga).
let drogasCargadas = false;
async function cargarDrogasUnaVez(){
  if(drogasCargadas) return;
  try{ drogas = await sbGet('drogas?order=nombre.asc&select=id,nombre', true); drogasCargadas = true; }
  catch(err){ mostrarToast('Error al cargar drogas: '+err.message,'err'); }
}

function poblarSelect(id,opts,conBlanco){const sel=document.getElementById(id);if(!sel)return;const val=sel.value;sel.innerHTML='';if(conBlanco)sel.innerHTML='<option value="">— Sin especificar —</option>';opts.forEach(o=>{const opt=document.createElement('option');opt.value=o;opt.textContent=o;sel.appendChild(opt);});if(val)sel.value=val;}
// Saca las claves null/undefined (para no pisar en la base lo que no se cargó).
function limpiar(obj){const r={};for(const[k,v]of Object.entries(obj))if(v!==null&&v!==undefined)r[k]=v;return r;}

// ── Buscadores desplegables (cliente y droga) ───────────────────────────────
function posicionarDD(input,dd){const rect=input.getBoundingClientRect();const abajo=window.innerHeight-rect.bottom;dd.style.width=rect.width+'px';dd.style.left=rect.left+'px';if(abajo<208&&rect.top>208){dd.style.top='';dd.style.bottom=(window.innerHeight-rect.top+2)+'px';}else{dd.style.bottom='';dd.style.top=(rect.bottom+2)+'px';}}
function cerrarTodasSS(){document.querySelectorAll('.ss-dropdown').forEach(d=>d.classList.remove('open'));}
document.addEventListener('click', e => { if(!e.target.closest('.ss-wrap')) cerrarTodasSS(); });

// Cliente: los campos se llaman {pref}ClienteInput, {pref}ClienteId, {pref}Telefono
// y el desplegable ssCliente_{pref} (pref = 'p' nuevo, 'e' editar, 'c' completar…).
async function abrirSSCliente(pref){ await asegurarClientes().catch(()=>mostrarToast('Error al cargar clientes','err'));const input=document.getElementById(`${pref}ClienteInput`);const dd=document.getElementById(`ssCliente_${pref}`);renderSSCliente(dd,clientes.filter(c=>c.nombre.toLowerCase().includes(input.value.toLowerCase())),pref);posicionarDD(input,dd);dd.classList.add('open');}
function filtrarSSCliente(pref){ return abrirSSCliente(pref); }
function renderSSCliente(dd,fil,pref){
  dd.innerHTML='';
  fil.forEach(c=>{const d=document.createElement('div');d.className='ss-option';d.textContent=c.nombre;d.onmousedown=e=>{e.preventDefault();document.getElementById(`${pref}ClienteInput`).value=c.nombre;document.getElementById(`${pref}ClienteId`).value=c.id;aplicarTelefonoCliente(pref,c.telefono);aplicarSucursalDeCliente(pref,c.nombre);dd.classList.remove('open');};dd.appendChild(d);});
  if(!fil.length){const emp=document.createElement('div');emp.className='ss-empty';emp.textContent='Sin resultados';dd.appendChild(emp);}
}
// Si el cliente es el de una sucursal (ej. MRL), se marca esa sucursal en el
// selector {pref}Sucursal (si el formulario lo tiene).
function aplicarSucursalDeCliente(pref,nombre){
  const sel=document.getElementById(`${pref}Sucursal`);
  const suc=(typeof CLIENTE_DE_SUCURSAL!=='undefined') && CLIENTE_DE_SUCURSAL[nombre];
  if(sel && suc) sel.value=suc;
}
// Opciones del selector "Para sucursal".
function opcionesSucursalHtml(){
  return '<option value="">— No (San Martín) —</option>'+(typeof SUCURSALES!=='undefined'?SUCURSALES:[]).map(s=>`<option value="${escHtml(s)}">${escHtml(s)}</option>`).join('');
}
function aplicarTelefonoCliente(pref,telefono){
  const telInp=document.getElementById(`${pref}Telefono`);
  if(!telInp) return;
  telInp.value=telefono||'';
  telInp.classList.remove('field-invalid');
}

// Droga (dentro de una fila de componentes).
function abrirSSComp(input){const idx=input.dataset.idx;const dd=document.getElementById(`ssComp_${idx}`);if(!input.value.trim()){dd.classList.remove('open');return;}renderSSComp(dd,drogas.filter(d=>d.nombre.toLowerCase().includes(input.value.toLowerCase())).slice(0,50),idx,input.value);posicionarDD(input,dd);dd.classList.add('open');}
function filtrarSSComp(input){ abrirSSComp(input); }
function renderSSComp(dd,fil,idx,texto){
  dd.innerHTML='';
  fil.forEach(d=>{const div=document.createElement('div');div.className='ss-option';div.textContent=d.nombre;div.onmousedown=e=>{e.preventDefault();const inp=document.querySelector(`.ss-input[data-idx="${idx}"]`);const hid=document.querySelector(`.comp-drug-id[data-idx="${idx}"]`);if(inp)inp.value=d.nombre;if(hid)hid.value=d.id;dd.classList.remove('open');};dd.appendChild(div);});
  if(!fil.length){const emp=document.createElement('div');emp.className='ss-empty';emp.textContent='Sin resultados';dd.appendChild(emp);}
  const act=document.createElement('div');act.className='ss-action';act.textContent='＋ Crear droga nueva';
  act.onmousedown=e=>{e.preventDefault();dd.classList.remove('open');cbDrogaIdx=idx;document.getElementById('dNombre').value=texto;abrirModal('modalDroga');};
  dd.appendChild(act);
}
async function guardarDroga(){
  const nombre=document.getElementById('dNombre').value.trim();
  if(!nombre){mostrarToast('El nombre es obligatorio','err');return;}
  const btn=document.getElementById('btnGuardarDroga');btn.disabled=true;btn.textContent='Creando…';
  try{
    const nuevo=await sbPost('drogas',{nombre});
    drogas.push({id:nuevo[0].id,nombre});drogas.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
    if(cbDrogaIdx!==null){
      const inp=document.querySelector(`.ss-input[data-idx="${cbDrogaIdx}"]`);
      const hid=document.querySelector(`.comp-drug-id[data-idx="${cbDrogaIdx}"]`);
      if(inp) inp.value=nombre; if(hid) hid.value=nuevo[0].id; cbDrogaIdx=null;
    }
    mostrarToast('✓ Droga creada','ok');cerrarModal('modalDroga');document.getElementById('dNombre').value='';
  }catch(err){
    if(/duplicate key|unique constraint/i.test(err.message)) mostrarToast('Ya existe una droga con ese nombre','err');
    else mostrarToast('Error: '+err.message,'err');
  }
  btn.disabled=false;btn.textContent='Crear droga';
}

// ── Filas de componentes ────────────────────────────────────────────────────
// Los valores son POR ENVASE, tal cual se cargan (nunca se multiplican ni dividen).
function agregarCompRow(contId,recId='',dNom='',dId='',cant='',unid=''){
  const cont=document.getElementById(contId);
  const idx=Date.now()+Math.random();
  const div=document.createElement('div');
  div.className='comp-row';div.dataset.recid=recId;
  const unidOpts=['<option value="">—</option>',...UNID_COMP.map(o=>`<option value="${o}" ${o===unid?'selected':''}>${o}</option>`)].join('');
  div.innerHTML=`
    <div class="ss-wrap">
      <input type="text" class="ss-input" data-idx="${idx}" placeholder="Buscar droga…" value="${escHtml(dNom)}" oninput="filtrarSSComp(this)" onfocus="abrirSSComp(this)" autocomplete="off"/>
      <div class="ss-dropdown" id="ssComp_${idx}"></div>
      <input type="hidden" class="comp-drug-id" data-idx="${idx}" value="${dId}"/>
    </div>
    <div class="comp-cant-cell">
      <input type="number" class="comp-cant" value="${cant}" placeholder="Cant." step="any" min="0"/>
      <div class="csp-opts">
        <button type="button" class="csp-btn" onclick="elegirCsp(this,'100')">100</button>
        <button type="button" class="csp-btn" onclick="elegirCsp(this,'total')">Total</button>
      </div>
    </div>
    <select class="comp-unid" onchange="actualizarVisualUnidadComp(this)">${unidOpts}</select>
    <button class="btn-del-comp" onclick="this.closest('.comp-row').remove()">×</button>`;
  cont.appendChild(div);
  if(unid==='c.s.p'){
    const cantInput=div.querySelector('.comp-cant');
    const opts=div.querySelector('.csp-opts');
    opts.style.display='flex';
    cantInput.readOnly=true;cantInput.style.opacity='0.6';
    const cantTotal=obtenerCantTotalDeContenedor(contId);
    const valNum=parseFloat(cant);
    const btn100=opts.children[0],btnTotal=opts.children[1];
    if(cantTotal!=='' && valNum===cantTotal){btnTotal.classList.add('active');}
    else if(valNum===100){btn100.classList.add('active');}
  }
}
// c.s.p: la cantidad se elige con "100" o "Total" (la cantidad total del envase).
function elegirCsp(btn, tipo){
  const row = btn.closest('.comp-row');
  const cantInput = row.querySelector('.comp-cant');
  const opts = row.querySelector('.csp-opts');
  const contId = row.closest('[id]').id;
  cantInput.value = tipo === '100' ? 100 : obtenerCantTotalDeContenedor(contId);
  Array.from(opts.children).forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
function actualizarVisualUnidadComp(sel){
  const row = sel.closest('.comp-row');
  const cantInput = row.querySelector('.comp-cant');
  const opts = row.querySelector('.csp-opts');
  Array.from(opts.children).forEach(b=>b.classList.remove('active'));
  if(sel.value === 'c.s.p'){
    opts.style.display = 'flex';
    cantInput.value = '';
    cantInput.readOnly = true;
    cantInput.style.opacity = '0.6';
  } else {
    opts.style.display = 'none';
    cantInput.readOnly = false;
    cantInput.style.opacity = '';
  }
}
// La cantidad total que corresponde a cada contenedor de componentes.
const CANT_TOTAL_DE_CONTENEDOR = {compRowsNuevo:'pCantTotal', compRowsEditar:'eCantTotal', compRowsCompletar:'cCantTotal', compRowsFormula:'fsCantBase', compRowsPNF:'pnfCantBase'};
function obtenerCantTotalDeContenedor(contId){
  const el=document.getElementById(CANT_TOTAL_DE_CONTENEDOR[contId] || (contId.includes('Nuevo')?'pCantTotal':'eCantTotal'));
  const v=el?parseFloat(el.value):NaN;
  return isNaN(v)?'':v;
}
function poblarUnidadGlobal(id){
  const sel=document.getElementById(id);if(!sel)return;
  sel.innerHTML='<option value="">Unidad</option>'+UNID_COMP.map(o=>`<option value="${o}">${o}</option>`).join('');
}
function aplicarUnidadGlobal(contId,sel){
  const valor=sel.value;if(!valor)return;
  const cont=document.getElementById(contId);
  if(cont) cont.querySelectorAll('.comp-unid').forEach(otro=>{ otro.value=valor; actualizarVisualUnidadComp(otro); });
}
// Componentes de un preparado (bajo demanda; quedan en p.componentes).
async function cargarComponentes(p){
  if(p.componentes && p.componentes.length > 0) return;
  try{
    p.componentes = await sbGet('componentes_con_droga?preparado_id=eq.'+p.id);
  }catch(e){
    // No cachear como [] acá: eso impediría reintentar la próxima vez
    // que se pida (ej. al imprimir), quedando "cacheado" como si el
    // preparado no tuviera droga por un fallo de red transitorio.
    mostrarToast('No se pudieron cargar los componentes: '+e.message,'err');
  }
}

// ── Forma farmacéutica, unidad y precio ─────────────────────────────────────
function onFormaChange(pref){
  const forma=document.getElementById(`${pref}Forma`).value;
  const sel=document.getElementById(`${pref}Unidad`);
  const hint=document.getElementById(`${pref}UnidadHint`);
  if(!sel) return;
  const bloqueada = FORMA_UNIDAD_BLOQUEADA.includes(forma);
  const opcionesRestr = FORMA_UNIDAD_OPCIONES[forma];
  const uniAuto = FORMA_UNIDAD[forma];
  if(bloqueada){
    sel.innerHTML=`<option value="${uniAuto}">${uniAuto}</option>`;
    sel.disabled=true;
    sel.value=uniAuto;
  } else {
    const opciones = opcionesRestr || UNIDADES;
    sel.innerHTML='<option value="">— Sin especificar —</option>'+opciones.map(o=>`<option value="${o}">${o}</option>`).join('');
    sel.disabled=false;
  }
  if(hint) hint.textContent='';
}
// Precio por unidad y precio total, vinculados por la cantidad de envases
// ({prefix}Envases). En la base solo se guarda precio_venta = TOTAL.
function envasesActualesPara(prefix){
  return parseInt(document.getElementById(prefix+'Envases').value)||1;
}
function syncPrecioDesdeUnidad(prefix){
  const envases = envasesActualesPara(prefix);
  const v = parseFloat(document.getElementById(prefix+'PrecioUnidad').value);
  if(!isNaN(v)) document.getElementById(prefix+'PrecioTotal').value = +(v*envases).toFixed(2);
}
function syncPrecioDesdeTotal(prefix){
  const envases = envasesActualesPara(prefix);
  const v = parseFloat(document.getElementById(prefix+'PrecioTotal').value);
  if(!isNaN(v)) document.getElementById(prefix+'PrecioUnidad').value = envases>0 ? +(v/envases).toFixed(2) : v;
}

// ── Fórmulas de stock ───────────────────────────────────────────────────────
// formulas_stock.cantidad_base y sus componentes son de UN envase.
async function cargarFormulasStock(){
  try{
    const [formulas, comps] = await Promise.all([
      sbGet('formulas_stock?order=nombre.asc'),
      sbGet('formula_stock_componentes?select=*,drogas(nombre)&order=id.asc'),
    ]);
    formulasStock = formulas;
    formulasStockComponentes = {};
    comps.forEach(c=>{
      if(!formulasStockComponentes[c.formula_stock_id]) formulasStockComponentes[c.formula_stock_id]=[];
      formulasStockComponentes[c.formula_stock_id].push({droga_id:c.droga_id, droga_nombre:c.drogas?.nombre||'', cantidad:c.cantidad, unidad:c.unidad});
    });
    renderStockPickerGrid();
    if(typeof alCargarFormulasStock==='function') alCargarFormulasStock();
  }catch(err){ mostrarToast('Error al cargar fórmulas de stock: '+err.message,'err'); }
}
function abrirStockPicker(){
  cerrarModal(MODAL_NUEVO_PREPARADO);
  renderStockPickerGrid();
  mostrarVistaPicker('grid');
  abrirModal('modalStockPicker');
}
function cerrarStockPicker(){
  cerrarModal('modalStockPicker');
  abrirModal(MODAL_NUEVO_PREPARADO);
}
function renderStockPickerGrid(){
  const grid=document.getElementById('stockPickerGrid');
  if(!grid) return;
  const activas = formulasStock.filter(f=>f.activo);
  // "Agregar fórmula" solo donde existe el formulario de fórmula nueva (index).
  const puedeAgregar = !!document.getElementById('stockPickerNuevaFormula');
  grid.innerHTML = activas.map(f=>
    `<button type="button" class="stock-picker-btn" onclick="seleccionarFormulaStock('${f.id}')">${escHtml(f.nombre)}</button>`
  ).join('') + (puedeAgregar ? `<button type="button" class="stock-picker-btn stock-picker-btn-add" onclick="mostrarNuevaFormulaInline()">＋ Agregar fórmula</button>` : '');
  const vacio=document.getElementById('stockPickerVacio');
  if(vacio) vacio.style.display = activas.length ? 'none' : '';
}
function mostrarVistaPicker(v){
  vistaPicker = v;
  const grid=document.getElementById('stockPickerGridWrap'), nueva=document.getElementById('stockPickerNuevaFormula');
  if(grid) grid.style.display = v==='grid' ? '' : 'none';
  if(nueva) nueva.style.display = v==='nuevaFormula' ? '' : 'none';
}
function seleccionarFormulaStock(id){
  formulaStockSeleccionada = formulasStock.find(f=>f.id===id) || null;
  if(!formulaStockSeleccionada) return;
  document.getElementById('btnFormulaSeleccionadaNombre').textContent = formulaStockSeleccionada.nombre;
  document.getElementById('pEnvases').value='1';
  regenerarPreviewStock();
  cerrarModal('modalStockPicker');
  abrirModal(MODAL_NUEVO_PREPARADO);
  mostrarVistaPrep('seleccionada');
}
function togglePreparadosStock(){
  if(vistaPrepModal==='normal') abrirStockPicker();
  else volverANormalPrep();
}
function volverAPickerStock(){ abrirStockPicker(); }
function volverANormalPrep(){
  formulaStockSeleccionada=null;
  document.getElementById('compRowsNuevo').innerHTML='';
  document.getElementById('pForma').value='';
  document.getElementById('pUnidad').value='';
  document.getElementById('pCantTotal').value='';
  onFormaChange('p');
  mostrarVistaPrep('normal');
}
// Muestra la receta de la fórmula elegida (por envase, sin escalar).
function regenerarPreviewStock(){
  if(!formulaStockSeleccionada) return;
  document.getElementById('compRowsNuevo').innerHTML='';
  document.getElementById('pForma').value = formulaStockSeleccionada.forma_farmaceutica||'';
  onFormaChange('p');
  document.getElementById('pUnidad').value = formulaStockSeleccionada.unidad||'';
  document.getElementById('pCantTotal').value = formulaStockSeleccionada.cantidad_base??'';
  (formulasStockComponentes[formulaStockSeleccionada.id]||[]).forEach(c=>{
    agregarCompRow('compRowsNuevo','', c.droga_nombre, c.droga_id, c.cantidad??'', c.unidad);
  });
}
function mostrarVistaPrep(v){
  vistaPrepModal = v;
  document.getElementById('seccionPrepNormal').style.display        = v==='normal' ? '' : 'none';
  document.getElementById('seccionStockSeleccionada').style.display = v==='seleccionada' ? '' : 'none';
  document.getElementById('btnTogglePreparadosStockLabel').textContent = v==='normal' ? 'Preparados de stock' : 'Preparado normal';
  // En index, cliente y teléfono no son obligatorios para un preparado de stock.
  ['pClienteReq','pTelefonoReq'].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display = v==='normal' ? '' : 'none'; });
}

// ── Modal de clientes (lista, alta y edición) ───────────────────────────────
function abrirModalClientes(){
  document.getElementById('cliBuscarInput').value='';
  filtrarClientesModal();
  document.getElementById('cliVistaLista').style.display='';
  document.getElementById('cliVistaForm').style.display='none';
  document.getElementById('btnGuardarCliente').style.display='none';
  abrirModal('modalClientes');
  setTimeout(()=>document.getElementById('cliBuscarInput').focus(),100);
}
function abrirFormCliente(id){
  document.getElementById('cliVistaLista').style.display='none';
  document.getElementById('cliVistaForm').style.display='';
  document.getElementById('btnGuardarCliente').style.display='';
  document.getElementById('cClienteId').value=id||'';
  if(id){
    const cli=clientes.find(c=>c.id===id);
    document.getElementById('cNombre').value=cli?.nombre||'';
    document.getElementById('cTelefono').value=cli?.telefono||'';
    document.getElementById('cObs').value=cli?.observaciones||'';
    document.getElementById('modalClientesTitulo').textContent='Editar cliente';
  } else {
    ['cNombre','cTelefono','cObs'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('modalClientesTitulo').textContent='Nuevo cliente';
  }
  setTimeout(()=>document.getElementById('cNombre').focus(),100);
}
async function guardarClienteModal(){
  const nombre=document.getElementById('cNombre').value.trim();
  if(!nombre){mostrarToast('El nombre es obligatorio','err');return;}
  const btn=document.getElementById('btnGuardarCliente');btn.disabled=true;btn.textContent='Guardando…';
  const id=document.getElementById('cClienteId').value;
  try{
    const datos=limpiar({nombre,telefono:document.getElementById('cTelefono').value||null,observaciones:document.getElementById('cObs').value||null});
    if(id){
      await sbPatch('clientes',id,datos);
      const idx=clientes.findIndex(c=>c.id===id);
      if(idx>=0) clientes[idx]={...clientes[idx],...datos};
      clientes.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
      if(typeof alActualizarCliente==='function') alActualizarCliente(id, nombre, datos.telefono);
      mostrarToast('✓ Cliente actualizado','ok');
    } else {
      const nuevo=await sbPost('clientes',{...datos,fecha_alta:new Date().toISOString().slice(0,10)});
      const cli={id:nuevo[0].id,nombre,telefono:datos.telefono||null,observaciones:datos.observaciones||null};
      clientes.push(cli);clientes.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
      if(clienteCB){clienteCB(cli);clienteCB=null;cerrarModal('modalClientes');btn.disabled=false;btn.textContent='Guardar';return;}
      mostrarToast('✓ Cliente creado','ok');
    }
    volverListaClientes();
  }catch(err){mostrarToast('Error: '+err.message,'err');}
  btn.disabled=false;btn.textContent='Guardar';
}
function volverListaClientes(){
  document.getElementById('cliVistaLista').style.display='';
  document.getElementById('cliVistaForm').style.display='none';
  document.getElementById('btnGuardarCliente').style.display='none';
  document.getElementById('modalClientesTitulo').textContent='Clientes';
  filtrarClientesModal();
}
// "＋ Nuevo" al lado del buscador de cliente de un formulario: crea el cliente
// y lo deja elegido en ese formulario.
function abrirNuevoClienteDesdePrep(pref){
  document.getElementById('cNombre').value='';
  clienteCB=cli=>{
    document.getElementById(`${pref}ClienteInput`).value=cli.nombre;
    document.getElementById(`${pref}ClienteId`).value=cli.id;
    aplicarTelefonoCliente(pref,cli.telefono);
    aplicarSucursalDeCliente(pref,cli.nombre);
  };
  abrirFormCliente(null);
  abrirModal('modalClientes');
}
async function filtrarClientesModal(){
  await asegurarClientes().catch(()=>mostrarToast('Error al cargar clientes','err'));
  const q=document.getElementById('cliBuscarInput').value.toLowerCase();
  const fil = q ? clientes.filter(c=>c.nombre.toLowerCase().includes(q)) : clientes;
  const cont=document.getElementById('cliResultados');
  if(!fil.length){cont.innerHTML='<div style="color:var(--muted);font-size:13px;padding:8px;">Sin resultados</div>';return;}
  cont.innerHTML=fil.map(c=>`<div class="cli-item" onclick="abrirFormCliente('${c.id}')">
    <span>${escHtml(c.nombre)}</span>
    <span style="color:var(--muted);font-size:12px;">${c.telefono||''}</span>
  </div>`).join('');
}

// ── Modal "Editar preparado" (index y preparados) ───────────────────────────
// La página pone <div id="modalEditarSlot"></div> donde va el modal. Con
// data-nuevo-cliente="1" se muestra el botón "＋ Nuevo" (requiere modalClientes).
let prepActual = null;
(function insertarModalEditar(){
  const slot=document.getElementById('modalEditarSlot');
  if(!slot) return;
  const btnNuevo = slot.dataset.nuevoCliente==='1'
    ? `<button type="button" class="btn btn-ghost btn-sm" style="white-space:nowrap;" onclick="abrirNuevoClienteDesdePrep('e')">＋ Nuevo</button>` : '';
  slot.outerHTML = `
<div class="modal-overlay" id="modalEditar">
  <div class="modal">
    <div class="modal-header">
      <h2 id="editarTitulo">Editar preparado</h2>
      <button class="modal-close" onclick="cerrarModal('modalEditar')">✕</button>
    </div>
    <div class="modal-body">
      <div class="cupon-box" id="eCuponBox">
        <div class="field-group" id="eCuponWrap" style="margin-bottom:0;"><label>Nro Cupón (talonario)</label><input type="number" id="eCupon" class="cupon-input"/></div>
      </div>
      <div class="modal-sep" id="eCuponSep"></div>
      <div class="field-row">
        <div class="field-group">
          <label>Cliente</label>
          <div style="display:flex;gap:6px;">
            <div class="ss-wrap" style="flex:1;">
              <input type="text" id="eClienteInput" placeholder="Buscar cliente…" oninput="filtrarSSCliente('e')" onfocus="abrirSSCliente('e')" autocomplete="off"/>
              <div class="ss-dropdown" id="ssCliente_e"></div>
              <input type="hidden" id="eClienteId"/>
            </div>
            ${btnNuevo}
          </div>
        </div>
        <div class="field-group">
          <label>Teléfono <span style="color:var(--danger)">*</span></label>
          <input type="text" id="eTelefono" placeholder="Teléfono del cliente" oninput="this.classList.remove('field-invalid')"/>
        </div>
      </div>
      <div class="field-row">
        <div class="field-group"><label>Fecha de recepción</label><input type="date" id="eFecha"/></div>
        <div class="field-group"><label>Estado</label><select id="eEstado"></select></div>
      </div>
      <div class="field-row">
        <div class="field-group"><label>Precio por unidad (ARS)</label><input type="number" id="ePrecioUnidad" min="0" step="any" oninput="syncPrecioDesdeUnidad('e')"/></div>
        <div class="field-group"><label>Precio total (ARS)</label><input type="number" id="ePrecioTotal" min="0" step="any" oninput="syncPrecioDesdeTotal('e')"/></div>
      </div>
      <div class="field-row">
        <div class="field-group"><label>Para sucursal</label><select id="eSucursal">${opcionesSucursalHtml()}</select></div>
        <div></div>
      </div>
      <div class="field-group"><label>Observaciones</label><textarea id="eObs" rows="2"></textarea></div>

      <div class="modal-sep"></div>
      <div id="eSeccionNormal">
        <div class="field-group"><label>Nro Receta</label><input type="number" id="eReceta"/></div>
        <div class="sec-title">Componentes</div>
        <div class="comp-editor"><div class="comp-editor-header"><div>Droga</div><div>Cantidad</div><div class="comp-unidad-global-row">Unidad<select id="unidadGlobalEditar" onchange="aplicarUnidadGlobal('compRowsEditar',this)"></select></div><div></div></div><div id="compRowsEditar"></div></div>
        <button class="btn btn-ghost btn-sm" onclick="agregarCompRow('compRowsEditar')">+ Agregar componente</button>
        <div class="field-row-3" style="margin-top:14px;">
          <div class="field-group"><label>Forma farmacéutica</label><select id="eForma" onchange="onFormaChange('e')"><option value="">— Sin especificar —</option></select></div>
          <div class="field-group"><label>Cantidad total</label><input type="number" id="eCantTotal" step="any" min="0"/><div class="unidad-hint" id="eUnidadHint"></div></div>
          <div class="field-group"><label>Unidad</label><select id="eUnidad"><option value="">— Sin especificar —</option></select></div>
        </div>
      </div>
      <div id="eSeccionStock" style="display:none;">
        <div class="sec-title">Fórmula de stock</div>
        <div class="stock-chip-seleccionada" id="eFormulaStockNombre" style="cursor:default;pointer-events:none;"></div>
      </div>
      <!-- Cantidad de envases: campo único, compartido entre preparado normal y de stock -->
      <div class="field-group" style="max-width:220px;">
        <label>Cantidad de envases</label>
        <input type="number" id="eEnvases" min="1" step="1" value="1"/>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="cerrarModal('modalEditar')">Cancelar</button>
      <button class="btn btn-primary" id="btnGuardarEditar" onclick="guardarEdicion()">Guardar cambios</button>
    </div>
  </div>
</div>`;
})();

async function abrirEditarPreparado(p){
  prepActual=p;
  // La búsqueda de Preparados anteriores (buscar_preparados) no trae estos campos:
  // se piden acá para no tratar un stock como normal ni perder la sucursal al guardar.
  if(!('formula_stock_id' in p) || !('origen_sucursal' in p)){
    try{
      const r = await sbGet('preparados_completos?id=eq.'+p.id+'&select=formula_stock_id,formula_stock_nombre,origen_sucursal');
      if(r.length) Object.assign(p, r[0]);
    }catch(err){ mostrarToast('No se pudo abrir el preparado: '+err.message,'err'); return; }
  }
  const esStock = !!p.formula_stock_id;
  document.getElementById('editarTitulo').textContent=`Editar preparado ${p.nro_cupon_nuevo!=null?'#'+p.nro_cupon_nuevo:'T'+p.nro_cupon}`;
  document.getElementById('eCupon').value=p.nro_cupon??'';
  const esCuponNuevo = p.nro_cupon_nuevo != null;
  document.getElementById('eCuponBox').style.display = esCuponNuevo ? 'none' : '';
  document.getElementById('eCuponSep').style.display = esCuponNuevo ? 'none' : '';
  document.getElementById('eCupon').readOnly = esCuponNuevo;
  document.getElementById('eFecha').value=p.fecha_recepcion??'';
  // El combo tiene los estados internos; si el preparado está en otro (ej. Cancelado),
  // se agrega como opción para no perderlo. Elegir otro estado lo "descancela".
  const selEstado=document.getElementById('eEstado');
  selEstado.querySelectorAll('option[data-extra]').forEach(o=>o.remove());
  if(p.estado && ![...selEstado.options].some(o=>o.value===p.estado)){
    const o=document.createElement('option'); o.value=p.estado; o.textContent=p.estado; o.dataset.extra='1'; selEstado.appendChild(o);
  }
  selEstado.value=p.estado??'';
  const envasesEdit = p.cantidad_envases || 1;
  document.getElementById('ePrecioTotal').value = p.precio_venta??'';
  document.getElementById('ePrecioUnidad').value = p.precio_venta!=null ? +(p.precio_venta/envasesEdit).toFixed(2) : '';
  document.getElementById('eObs').value=p.observaciones??'';
  const selSuc=document.getElementById('eSucursal');
  if(p.origen_sucursal && ![...selSuc.options].some(o=>o.value===p.origen_sucursal)){
    const o=document.createElement('option'); o.value=o.textContent=p.origen_sucursal; selSuc.appendChild(o);
  }
  selSuc.value=p.origen_sucursal??'';
  document.getElementById('eClienteInput').value=p.cliente_nombre??'';
  document.getElementById('eClienteId').value=p.cliente_id??'';
  document.getElementById('eTelefono').value=p.cliente_telefono??'';
  document.getElementById('eTelefono').classList.remove('field-invalid');
  document.getElementById('eSeccionNormal').style.display = esStock ? 'none' : '';
  document.getElementById('eSeccionStock').style.display = esStock ? '' : 'none';
  if(esStock){
    document.getElementById('eFormulaStockNombre').textContent = p.formula_stock_nombre || '(fórmula eliminada)';
    document.getElementById('eEnvases').value = p.cantidad_envases ?? '';
    abrirModal('modalEditar');
    return;
  }
  document.getElementById('eReceta').value=p.nro_receta??'';
  document.getElementById('eEnvases').value=p.cantidad_envases||1;
  document.getElementById('eForma').value=p.forma_farmaceutica??'';
  document.getElementById('eCantTotal').value=p.cantidad_total??'';
  document.getElementById('eUnidad').value=p.unidad??'';
  document.getElementById('eUnidadHint').textContent='';
  document.getElementById('unidadGlobalEditar').value='';
  const cont=document.getElementById('compRowsEditar');cont.innerHTML='<div style="color:var(--muted);padding:8px;font-size:13px;">Cargando componentes…</div>';
  abrirModal('modalEditar');
  await cargarComponentes(p);
  cont.innerHTML='';
  (p.componentes||[]).forEach(c=>{
    agregarCompRow('compRowsEditar',c.id,c.droga_nombre||'',c.droga_id,c.cantidad??'',c.unidad??'');
  });
}

async function guardarEdicion(){
  const cliId=document.getElementById('eClienteId').value;
  const telInput=document.getElementById('eTelefono');
  const telVal=telInput.value.trim();
  if(cliId && !telVal){telInput.classList.add('field-invalid');mostrarToast('Completá el teléfono del cliente','err');return;}
  telInput.classList.remove('field-invalid');
  // Chequeo de concurrencia: si sucursal cambió el estado mientras este
  // modal seguía abierto (ej. confirmó o canceló el pedido), el
  // formulario todavía tiene el valor viejo en el combo de Estado.
  // Guardar así lo pisaría en silencio. Se compara contra el estado
  // actual en la base antes de mandar el PATCH.
  try{
    const actual = await sbGet('preparados?id=eq.'+prepActual.id+'&select=estado');
    if(actual.length && actual[0].estado !== prepActual.estado){
      mostrarToast(`El estado cambió a "${actual[0].estado}" mientras editabas (probablemente desde sucursal). Cerrá y volvé a abrir para ver los datos actuales.`,'err');
      return;
    }
  }catch(errCheck){ /* si falla el chequeo, se sigue igual: no vale la pena bloquear la edición por esto */ }
  const esStock = !!prepActual.formula_stock_id;
  if(esStock){
    const envases=parseInt(document.getElementById('eEnvases').value);
    if(!envases||envases<1){mostrarToast('Ingresá una cantidad de envases válida','err');return;}
  }
  const btn=document.getElementById('btnGuardarEditar');btn.disabled=true;btn.textContent='Guardando…';
  try{
    if(cliId){
      await asegurarClientes();
      const cliActual=clientes.find(c=>c.id===cliId);
      if(cliActual && (cliActual.telefono||'')!==telVal){
        await sbPatch('clientes',cliId,{telefono:telVal});
        cliActual.telefono=telVal;
      }
    }
    const patch = limpiar({
      nro_cupon:prepActual.nro_cupon_nuevo==null?(parseInt(document.getElementById('eCupon').value)||null):prepActual.nro_cupon,
      cliente_id:cliId||null,
      fecha_recepcion:document.getElementById('eFecha').value||null,
      estado:document.getElementById('eEstado').value||null,
    });
    // Sucursal: se puede poner o sacar (null = de San Martín).
    patch.origen_sucursal = document.getElementById('eSucursal').value||null;
    if(esStock){
      // En stock siempre se guarda cantidad_envases (aun si es 1) y la cantidad
      // total de UN envase de la fórmula.
      const envases=parseInt(document.getElementById('eEnvases').value);
      if(!formulasStock.length) await cargarFormulasStock();
      const f=formulasStock.find(x=>x.id===prepActual.formula_stock_id);
      // Campos opcionales que el usuario puede vaciar a propósito (ej. borrar todas las
      // observaciones): se mandan aparte de limpiar(), que descarta las claves null.
      Object.assign(patch, {
        cantidad_envases:envases,
        cantidad_total:f ? f.cantidad_base : prepActual.cantidad_total,
        precio_venta:parseFloat(document.getElementById('ePrecioTotal').value)||null,
        observaciones:document.getElementById('eObs').value||null,
      });
      await sbPatch('preparados',prepActual.id,patch);
      // Si cambió la cantidad de envases, los componentes se regeneran desde la receta
      // original (por envase, sin multiplicar). Primero se insertan los nuevos y después
      // se borran los viejos por id: si algo falla a mitad de camino, el preparado
      // queda con los componentes anteriores y no con menos droga.
      if(envases !== prepActual.cantidad_envases && f){
        await cargarComponentes(prepActual);
        const idsViejos = (prepActual.componentes||[]).map(c=>c.id);
        for(const c of (formulasStockComponentes[f.id]||[])){
          if(!c.droga_id) continue;
          await sbPost('componentes',limpiar({preparado_id:prepActual.id,droga_id:c.droga_id,cantidad:c.cantidad,unidad:c.unidad}));
        }
        if(idsViejos.length) await sbDelete('componentes?id=in.('+idsViejos.join(',')+')');
      }
    } else {
      // Cantidad total y componentes se guardan tal cual se cargan (por envase).
      const envases = parseInt(document.getElementById('eEnvases').value)||1;
      Object.assign(patch, {
        nro_receta:parseInt(document.getElementById('eReceta').value)||null,
        forma_farmaceutica:document.getElementById('eForma').value||null,
        cantidad_total:parseFloat(document.getElementById('eCantTotal').value)||null,
        cantidad_envases:envases>1?envases:null,
        unidad:document.getElementById('eUnidad').value||null,
        precio_venta:parseFloat(document.getElementById('ePrecioTotal').value)||null,
        observaciones:document.getElementById('eObs').value||null,
      });
      await sbPatch('preparados',prepActual.id,patch);
      const rows=document.querySelectorAll('#compRowsEditar .comp-row');
      const viejosIds=(prepActual.componentes||[]).map(c=>c.id);
      const nuevosIds=[];
      for(const row of rows){
        const recId=row.dataset.recid||'';
        const drugId=row.querySelector('.comp-drug-id').value;
        const unid=row.querySelector('.comp-unid').value||null;
        const cant=parseFloat(row.querySelector('.comp-cant').value)||null;
        if(!drugId) continue;
        // Sin limpiar(): cantidad/unidad se pueden vaciar a propósito al editar.
        const cf={droga_id:drugId,cantidad:cant,unidad:unid};
        if(recId){await sbPatch('componentes',recId,cf);nuevosIds.push(recId);}
        else{const n=await sbPost('componentes',{...cf,preparado_id:prepActual.id});nuevosIds.push(n[0].id);}
      }
      for(const id of viejosIds.filter(id=>!nuevosIds.includes(id))){await sbDelete('componentes?id=eq.'+id);}
    }
    mostrarToast('✓ Guardado','ok');cerrarModal('modalEditar');await cargarTodo();
  }catch(err){mostrarToast('Error: '+err.message,'err');}
  btn.disabled=false;btn.textContent='Guardar cambios';
}

// ── Cancelar preparado (index y preparados) ─────────────────────────────────
// Los preparados nunca se borran: se cancelan (estado 'Cancelado') y quedan en
// Preparados anteriores. La razón es opcional y se agrega a las observaciones,
// que se imprimen en los cupones. La página pone <div id="modalCancelarSlot"></div>
// y define alCancelarPreparado(id) para refrescar su lista.
const ESTADOS_CANCELADOS = ['Cancelado','Cancelado por sucursal'];
let prepACancelar = null;
(function insertarModalCancelar(){
  const slot=document.getElementById('modalCancelarSlot');
  if(!slot) return;
  slot.outerHTML = `
<div class="modal-overlay" id="modalCancelar">
  <div class="modal modal-sm">
    <div class="modal-header"><h2>Cancelar preparado</h2><button class="modal-close" onclick="cerrarModal('modalCancelar')">✕</button></div>
    <div class="modal-body">
      <p style="font-size:14px;margin-bottom:6px;">¿Cancelar el cupón <strong id="cancelarCupon"></strong>?</p>
      <p style="font-size:12px;color:var(--muted);margin-bottom:14px;">No se borra: queda en Preparados anteriores con estado <strong>Cancelado</strong>.</p>
      <div class="field-group" style="margin-bottom:0;">
        <label>Razón de la cancelación (opcional)</label>
        <textarea id="cancelarRazon" rows="3" placeholder="Ej.: el cliente ya no lo necesita"></textarea>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;">Se agrega a las observaciones del preparado.</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="cerrarModal('modalCancelar')">Volver</button>
      <button class="btn btn-danger" id="btnConfirmarCancelar" onclick="confirmarCancelarPreparado()">Cancelar preparado</button>
    </div>
  </div>
</div>`;
})();
function abrirCancelarPreparado(p){
  prepACancelar = p;
  document.getElementById('cancelarCupon').innerHTML = fmtCupon(p);
  document.getElementById('cancelarRazon').value = '';
  abrirModal('modalCancelar');
  setTimeout(()=>document.getElementById('cancelarRazon').focus(),100);
}
async function confirmarCancelarPreparado(){
  const p = prepACancelar; if(!p) return;
  const razon = document.getElementById('cancelarRazon').value.trim();
  const btn = document.getElementById('btnConfirmarCancelar');
  btn.disabled=true; btn.textContent='Cancelando…';
  try{
    // Se leen las observaciones actuales de la base para no pisar un cambio reciente.
    const actual = await sbGet('preparados?id=eq.'+p.id+'&select=observaciones,estado');
    const obsActual = actual.length ? (actual[0].observaciones||'') : (p.observaciones||'');
    const patch = {estado:'Cancelado'};
    if(razon) patch.observaciones = (obsActual ? obsActual+'\n' : '') + 'CANCELADO: ' + razon;
    await sbPatch('preparados', p.id, patch);
    mostrarToast('✓ Preparado cancelado (queda en Preparados anteriores)','ok');
    cerrarModal('modalCancelar');
    prepACancelar = null;
    if(typeof alCancelarPreparado==='function') await alCancelarPreparado(p.id);
  }catch(err){ mostrarToast('Error: '+err.message,'err'); }
  btn.disabled=false; btn.textContent='Cancelar preparado';
}
