// Uso completo con el teclado, compartido por todas las páginas.
// Se carga DESPUÉS de comun.js (y de form-preparado.js / chat.js si la página
// los usa) y ANTES del <script> propio de la página, que registra sus atajos con:
//
//   Teclado.atajo({teclas:'n', desc:'Cargar preparado', accion:()=>abrirModalPreparado()})
//   Teclado.ayuda('En una tarjeta', 'P', 'Imprimir cupón')      // solo para la ayuda (?)
//   Teclado.navegacion({k:['index.html','Kanban'], p:['preparados.html','Preparados anteriores']})
//   Teclado.alMover = (item, dir) => { … }   // Shift + flechas sobre una tarjeta del kanban
//
// Dentro de una tarjeta o fila, un botón con data-tecla="p" (o "enter", "supr",
// "espacio"; varias separadas por espacio) se aprieta con esa tecla.
//
// Teclas: ver Teclado.mostrarAyuda() (tecla ?).

const Teclado = (() => {
  // ── Selectores ────────────────────────────────────────────────────────────
  const SEL_OVERLAY = '.modal-overlay, .side-overlay, .drawer-overlay, .img-ampliada-overlay, .atajos-overlay';
  // Elementos de una lista por los que se navega con las flechas.
  const SEL_ITEM = [
    '.kanban-cols .col-body > .card',
    '#tbody > tr', '#tablaClientes > tr.clickable', '#tablaOS > tr.clickable',
    '.fijados-grid > .fijado-card', '#fijarResultados > div[onclick]',
    '.hist-item', '.cli-item',
    '.drawer-body .drawer-card', '.drawer-body .drawer-cancel-card',
    '#historialRechazadosLista > div',
  ].join(',');
  // Otros elementos con onclick que no son botones: se vuelven enfocables.
  const SEL_CLICK = 'th[onclick], .minichat-header, img[onclick], .stock-chip-seleccionada';
  const SEL_ENFOCABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const SEL_BUSCADOR = '.buscador-input, [data-buscador]';
  const SEL_OPCION = '.ss-option, .ss-action';

  const atajos = [];       // {combo, etiqueta, desc, grupo, accion, enCampo, conVentana, cuando}
  const extrasAyuda = [];  // {grupo, etiqueta, desc}
  let nav = {};            // letra → [url, descripción]
  let esperandoG = 0;
  const pila = [];         // ventanas abiertas, la última arriba
  let ultimoItemId = null; // para devolver el foco a una tarjeta que se volvió a dibujar

  // ── Utilidades ────────────────────────────────────────────────────────────
  const visible = el => !!el && el.isConnected && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const enfocables = raiz => [...raiz.querySelectorAll(SEL_ENFOCABLE)].filter(el => visible(el) && !el.closest('[inert]'));
  function esCampo(el){
    if(!el || el === document.body) return false;
    if(el.isContentEditable) return true;
    if(el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    if(el.tagName === 'INPUT') return !['checkbox','radio','button','submit','reset','file','range','color'].includes(el.type);
    return false;
  }
  function combo(e){
    let k = e.key;
    if(k === ' ' || k === 'Spacebar') k = 'espacio';
    else if(k === 'Delete' || k === 'Del') k = 'supr';
    else if(k.length === 1) k = k.toLowerCase();
    else k = k.toLowerCase();
    const p = [];
    if(e.ctrlKey || e.metaKey) p.push('ctrl');
    if(e.altKey) p.push('alt');
    // Shift solo cuenta en letras y teclas especiales ("?" o "/" ya lo traen incluido).
    if(e.shiftKey && (k.length > 1 || /[a-zñ]/.test(k))) p.push('shift');
    p.push(k);
    return p.join('+');
  }
  function fakeEv(){ return {stopPropagation(){}, preventDefault(){}, target:document.activeElement}; }
  function enfocar(el, opts={}){
    if(!el) return;
    try{ el.focus({preventScroll:!!opts.sinScroll}); }catch(_){ el.focus(); }
    if(!opts.sinScroll && el.scrollIntoView) el.scrollIntoView({block:'nearest', inline:'nearest'});
    if(opts.seleccionar && el.select) el.select();
  }
  function avisar(msg){ if(typeof mostrarToast === 'function') mostrarToast(msg); }

  // ── Ventanas (modales, cajones, menú lateral, visor de imágenes) ─────────
  function ventanaArriba(){
    for(let i = pila.length - 1; i >= 0; i--){
      if(pila[i].classList.contains('open') && visible(pila[i])) return pila[i];
    }
    // Por si alguna se abrió antes de que empezara a observar.
    const abiertas = [...document.querySelectorAll(SEL_OVERLAY)].filter(o => o.classList.contains('open') && visible(o));
    return abiertas[abiertas.length - 1] || null;
  }
  function alAbrir(ov){
    if(!pila.includes(ov)) pila.push(ov);
    const act = document.activeElement;
    ov._focoPrevio = (act && act !== document.body && !ov.contains(act)) ? act : (ov._focoPrevio || null);
    ov._focoPrevioId = ov._focoPrevio?.closest?.('[data-id]')?.dataset.id || null;
    ov._sucio = false; ov._avisoEsc = 0;
    // La página puede enfocar algo por su cuenta (ej. un buscador con setTimeout).
    setTimeout(() => {
      if(!ov.classList.contains('open') || ov.contains(document.activeElement)) return;
      enfocar(primerFoco(ov), {sinScroll:true});
    }, 60);
  }
  function alCerrar(ov){
    const i = pila.indexOf(ov); if(i >= 0) pila.splice(i, 1);
    setTimeout(() => {
      const arriba = ventanaArriba();
      if(arriba){
        if(arriba.contains(document.activeElement)) return;
        const u = arriba._ultimoFoco;
        enfocar(visible(u) && arriba.contains(u) ? u : primerFoco(arriba), {sinScroll:true});
        return;
      }
      if(document.activeElement && document.activeElement !== document.body) return;
      let dest = ov._focoPrevio;
      if(!visible(dest) && ov._focoPrevioId) dest = document.querySelector(`[data-id="${CSS.escape(ov._focoPrevioId)}"]`);
      if(visible(dest)) enfocar(dest, {sinScroll:true});
    }, 30);
  }
  function primerFoco(ov){
    const auto = ov.querySelector('[data-autofoco]');
    if(visible(auto)) return auto;
    const todos = enfocables(ov);
    // Primer campo para escribir. Los buscadores de cliente abren su lista al enfocarse:
    // se eligen solo si están vacíos (cargar), no si ya tienen un cliente (editar).
    const campo = todos.find(el => esCampo(el) && !el.readOnly && !(el.hasAttribute('onfocus') && el.value) && !el.closest('.modal-header'));
    if(campo) return campo;
    const acciones = todos.filter(el => el.closest('.modal-footer, .popup-acciones, .popup'));
    if(acciones.length) return acciones[0];
    return todos.find(el => !el.classList.contains('modal-close')) || todos[0] || ov;
  }
  function cerrarVentana(ov){
    const x = [...ov.querySelectorAll('.modal-close, .img-ampliada-cerrar, [data-cerrar]')].find(visible);
    if(x){ x.click(); return; }
    const b = [...ov.querySelectorAll('button[onclick]')].find(b => visible(b) && /cerrar(Modal|Popup|Drawer|SideMenu|Imagen)|cerrarAyuda/.test(b.getAttribute('onclick')));
    if(b){ b.click(); return; }
    ov.classList.remove('open');
  }
  function botonPrincipal(ov){
    const cands = [...ov.querySelectorAll('.modal-footer .btn-primary, .modal-footer .btn-danger, .popup-acciones .btn-primary, .popup-acciones .btn-danger, .popup .btn-primary')]
      .filter(b => visible(b) && !b.disabled);
    return cands[cands.length - 1] || null;
  }

  // ── Listas: tarjetas y filas ──────────────────────────────────────────────
  const itemDe = el => el?.closest?.(SEL_ITEM) || null;
  function itemsHermanos(item){
    return [...item.parentElement.children].filter(n => n.matches(SEL_ITEM) && visible(n));
  }
  function itemsDe(raiz){ return [...raiz.querySelectorAll(SEL_ITEM)].filter(visible); }
  function primerItemDePagina(){
    const ov = ventanaArriba();
    return itemsDe(ov || document).find(n => !(!ov && n.closest(SEL_OVERLAY))) || null;
  }
  function columnaVecina(item, dir){
    const col = item.closest('.col'); if(!col) return null;
    const cols = [...col.parentElement.querySelectorAll(':scope > .col')];
    let i = cols.indexOf(col);
    const top = item.getBoundingClientRect().top;
    while(true){
      i += dir; if(i < 0 || i >= cols.length) return null;
      const cards = itemsDe(cols[i]);
      if(cards.length){
        return cards.reduce((m, c) => Math.abs(c.getBoundingClientRect().top - top) < Math.abs(m.getBoundingClientRect().top - top) ? c : m);
      }
    }
  }
  function botonTecla(item, tecla){
    return [...item.querySelectorAll('[data-tecla]')].find(b =>
      b.dataset.tecla.split(/\s+/).includes(tecla) && visible(b) && !b.disabled && itemDe(b) === item);
  }
  function abrirChat(item){
    const chat = item.querySelector('.minichat'); if(!chat) return false;
    if(chat.classList.contains('minichat-collapsed')) chat.querySelector('.minichat-header')?.click();
    const inp = chat.querySelector('.minichat-input-row input[type=text]');
    if(inp){ setTimeout(() => enfocar(inp), 0); return true; }
    return false;
  }
  function teclaEnItem(e, item, c){
    const kanban = !!item.closest('.kanban-cols');
    const mover = d => { e.preventDefault(); if(typeof Teclado.alMover === 'function') Teclado.alMover(item, d); };
    switch(c){
      case 'arrowdown': case 'arrowup': {
        e.preventDefault();
        const h = itemsHermanos(item), i = h.indexOf(item);
        const sig = h[i + (c === 'arrowdown' ? 1 : -1)];
        if(sig) enfocar(sig);
        else if(c === 'arrowup') enfocarBuscador(false);
        return true;
      }
      case 'arrowright': case 'arrowleft': {
        e.preventDefault();
        const d = c === 'arrowright' ? 1 : -1;
        if(kanban){ const v = columnaVecina(item, d); if(v) enfocar(v); }
        else { const h = itemsHermanos(item); const v = h[h.indexOf(item) + d]; if(v) enfocar(v); }
        return true;
      }
      case 'home': case 'end': {
        e.preventDefault();
        const h = itemsHermanos(item);
        enfocar(c === 'home' ? h[0] : h[h.length - 1]);
        return true;
      }
      case 'shift+arrowright': if(kanban){ mover('der'); return true; } break;
      case 'shift+arrowleft':  if(kanban){ mover('izq'); return true; } break;
      case 'shift+arrowup':    if(kanban){ mover('arriba'); return true; } break;
      case 'shift+arrowdown':  if(kanban){ mover('abajo'); return true; } break;
      case 'enter': {
        e.preventDefault();
        const b = botonTecla(item, 'enter');
        if(b) b.click(); else item.click();
        return true;
      }
      case 'espacio': {
        e.preventDefault();
        const b = botonTecla(item, 'espacio');
        if(b) b.click();
        else if(!kanban) item.click();
        return true;
      }
      case 'm': if(abrirChat(item)){ e.preventDefault(); return true; } break;
    }
    if(!/^(ctrl|alt)/.test(c)){
      const b = botonTecla(item, c);
      if(b){ e.preventDefault(); b.click(); return true; }
    }
    return false;
  }

  // ── Buscadores ────────────────────────────────────────────────────────────
  function buscadorPrincipal(){
    const ov = ventanaArriba();
    const lista = [...(ov || document).querySelectorAll(SEL_BUSCADOR)].filter(el => visible(el) && (ov || !el.closest(SEL_OVERLAY)));
    return lista[0] || null;
  }
  function enfocarBuscador(seleccionar = true){
    const b = buscadorPrincipal();
    if(b){ enfocar(b, {seleccionar}); return true; }
    return false;
  }
  function alternarFiltros(){
    const b = buscadorPrincipal();
    const wrap = b?.closest('.con-filtros'); if(!wrap) return false;
    const btn = wrap.querySelector('.btn-filtros'); if(!btn || typeof toggleFiltros !== 'function') return false;
    toggleFiltros(btn);
    const menu = wrap.querySelector('.filtros-menu');
    if(menu?.classList.contains('abierto')) enfocar(enfocables(menu)[0], {sinScroll:true});
    else enfocar(b);
    return true;
  }

  // ── Desplegables de cliente y droga (.ss-dropdown) ────────────────────────
  function desplegableDe(input){
    const w = input.closest('.ss-wrap');
    const dd = w ? w.querySelector('.ss-dropdown') : (input.nextElementSibling?.classList.contains('ss-dropdown') ? input.nextElementSibling : null);
    return dd;
  }
  function moverOpcion(dd, d, sinVuelta = false){
    const ops = [...dd.querySelectorAll(SEL_OPCION)];
    if(!ops.length) return;
    let i = ops.findIndex(o => o.classList.contains('ss-activa'));
    ops.forEach(o => o.classList.remove('ss-activa'));
    if(i < 0) i = d > 0 ? 0 : ops.length - 1;
    else if(sinVuelta) i = Math.max(0, Math.min(ops.length - 1, i + d));
    else i = (i + d + ops.length) % ops.length;
    ops[i].classList.add('ss-activa');
    ops[i].scrollIntoView({block:'nearest'});
  }
  function elegirOpcion(op){
    if(op.onmousedown) op.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true}));
    else op.click();
  }
  function siguienteCampo(desde){
    const raiz = desde.closest('.modal, .popup, .drawer, form') || document.body;
    const lista = enfocables(raiz).filter(el => !el.classList.contains('modal-close'));
    const resto = lista.slice(lista.indexOf(desde) + 1);
    return resto.find(el => esCampo(el) && !el.readOnly) || resto[0] || null;
  }
  function teclaEnDesplegable(e, input, c){
    const dd = desplegableDe(input); if(!dd) return false;
    const abierto = dd.classList.contains('open');
    if(c === 'arrowdown' || c === 'arrowup'){
      e.preventDefault();
      if(!abierto){
        // La droga vacía no abre la lista al escribir; con ↓ muestra las primeras.
        if(input.classList.contains('ss-input') && !input.value.trim() && typeof abrirSSComp === 'function') abrirSSComp(input, true);
        else input.dispatchEvent(new Event('input', {bubbles:true}));
        return true;
      }
      moverOpcion(dd, c === 'arrowdown' ? 1 : -1);
      return true;
    }
    if(abierto && (c === 'pagedown' || c === 'pageup')){
      e.preventDefault();
      for(let i = 0; i < 5; i++) moverOpcion(dd, c === 'pagedown' ? 1 : -1, true);
      return true;
    }
    if(!abierto) return false;
    if(c === 'escape'){
      e.preventDefault(); e.stopPropagation();
      dd.classList.remove('open');
      return true;
    }
    if(c === 'shift+tab'){ dd.classList.remove('open'); return false; }
    if(c === 'enter' || c === 'tab'){
      const act = dd.querySelector('.ss-activa') || (c === 'enter' ? dd.querySelector('.ss-option') : null);
      if(!act){
        if(c === 'enter'){ e.preventDefault(); return true; }
        dd.classList.remove('open'); return false; // Tab sin opción marcada: cierra la lista y sigue
      }
      e.preventDefault();
      const antes = pila.length, esAccion = act.classList.contains('ss-action');
      elegirOpcion(act);
      dd.classList.remove('open');
      if(!esAccion && pila.length === antes){
        const sig = siguienteCampo(input);
        // En una fila de componentes, la droga elegida pasa a la cantidad.
        const cant = input.closest('.comp-row')?.querySelector('.comp-cant');
        setTimeout(() => enfocar(cant && !cant.readOnly ? cant : sig, {seleccionar:true, sinScroll:false}), 0);
      }
      return true;
    }
    return false;
  }
  // Enter dentro de una fila de componentes: cantidad → unidad → droga siguiente (o una fila nueva).
  function teclaEnComponente(e, el, c){
    if(c !== 'enter') return false;
    const fila = el.closest('.comp-row'); if(!fila) return false;
    e.preventDefault();
    if(el.classList.contains('comp-cant')){ enfocar(fila.querySelector('.comp-unid')); return true; }
    const sigFila = [...fila.parentElement.querySelectorAll(':scope > .comp-row')][[...fila.parentElement.querySelectorAll(':scope > .comp-row')].indexOf(fila) + 1];
    if(sigFila){ enfocar(sigFila.querySelector('.ss-input')); return true; }
    if(typeof agregarCompRow === 'function' && fila.parentElement.id){
      agregarCompRow(fila.parentElement.id);
      const nueva = fila.parentElement.lastElementChild;
      enfocar(nueva?.querySelector('.ss-input'));
    }
    return true;
  }

  // ── Ayuda (tecla ?) ───────────────────────────────────────────────────────
  const GRUPOS_FIJOS = [
    ['General', [
      ['?', 'Ver estos atajos'],
      ['/', 'Ir al buscador'],
      ['F', 'Abrir o cerrar los filtros del buscador'],
      ['Esc', 'Cerrar la ventana, el menú o la lista; en el buscador, borrar lo escrito'],
      ['Tab · Shift+Tab', 'Pasar al campo o botón siguiente / anterior'],
      ['Shift+R', 'Actualizar los datos'],
    ]],
    ['Listas, tarjetas y filas', [
      ['↓ · Enter', 'Desde el buscador, ir al primer resultado'],
      ['↑ ↓ ← →', 'Moverse entre tarjetas o filas'],
      ['Inicio · Fin', 'Primera / última de la columna o lista'],
      ['Enter', 'Abrir o elegir'],
      ['M', 'Escribir en el chat de la tarjeta'],
      ['Esc', 'Desde el chat, volver a la tarjeta'],
    ]],
    ['Ventanas y formularios', [
      ['Ctrl+Enter · Ctrl+S', 'Guardar o confirmar la ventana abierta'],
      ['Esc', 'Cerrar (si hay cambios, pide apretar Esc otra vez)'],
      ['↑ ↓ y Enter', 'Elegir en una lista desplegable (clientes, drogas…); Tab o Esc la cierran'],
      ['← →', 'Moverse entre botones de un mismo grupo (fórmulas de stock, uso, vencimiento)'],
      ['Enter', 'En un componente: cantidad → unidad → droga siguiente (agrega una fila al final)'],
    ]],
  ];
  function etiquetaHtml(et){
    return String(et).split(' · ').map(parte =>
      parte.split(/(\s+luego\s+|\+)/).map(t => /^(\s+luego\s+|\+)$/.test(t) ? (t === '+' ? '+' : ' luego ') : `<kbd>${escHtml(t)}</kbd>`).join('')
    ).join(' <span class="atajos-o">o</span> ');
  }
  function mostrarAyuda(){
    let ov = document.getElementById('atajosOverlay');
    if(!ov){
      ov = document.createElement('div');
      ov.id = 'atajosOverlay'; ov.className = 'atajos-overlay';
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Atajos de teclado');
      ov.addEventListener('click', e => { if(e.target === ov) cerrarAyuda(); });
      document.body.appendChild(ov);
    }
    const grupos = new Map(GRUPOS_FIJOS.map(([g, filas]) => [g, filas.slice()]));
    const agregar = (g, et, d) => { if(!grupos.has(g)) grupos.set(g, []); grupos.get(g).push([et, d]); };
    const navKeys = Object.entries(nav);
    if(navKeys.length) navKeys.forEach(([k, [, d]]) => agregar('Ir a otra página', `G luego ${k.toUpperCase()}`, d));
    atajos.filter(a => a.desc).forEach(a => agregar(a.grupo, a.etiqueta, a.desc));
    extrasAyuda.forEach(x => agregar(x.grupo, x.etiqueta, x.desc));
    ov.innerHTML = `<div class="atajos-caja">
      <div class="atajos-cab"><h2>Atajos de teclado</h2><button type="button" class="modal-close atajos-cerrar" onclick="Teclado.cerrarAyuda()" aria-label="Cerrar">✕</button></div>
      <div class="atajos-cuerpo">${[...grupos].map(([g, filas]) => `<section><h3>${escHtml(g)}</h3><table>${filas.map(([et, d]) => `<tr><td>${etiquetaHtml(et)}</td><td>${escHtml(d)}</td></tr>`).join('')}</table></section>`).join('')}</div>
    </div>`;
    ov.classList.add('open');
  }
  function cerrarAyuda(){ document.getElementById('atajosOverlay')?.classList.remove('open'); }
  function agregarBotonAyuda(){
    if(document.querySelector('.btn-atajos')) return;
    const ref = document.querySelector('.btn-logout, .navbar-btn');
    if(!ref) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn-atajos'; b.title = 'Atajos de teclado (?)'; b.setAttribute('aria-label', 'Atajos de teclado');
    b.textContent = '⌨';
    b.onclick = mostrarAyuda;
    ref.parentElement.insertBefore(b, ref);
  }

  // ── Indicador de "G luego…" ───────────────────────────────────────────────
  function indicador(txt){
    let el = document.getElementById('teclaIndicador');
    if(!el){ el = document.createElement('div'); el.id = 'teclaIndicador'; el.className = 'tecla-indicador'; document.body.appendChild(el); }
    el.textContent = txt || '';
    el.classList.toggle('visible', !!txt);
  }

  // ── Manejador principal ───────────────────────────────────────────────────
  function alTeclear(e){
    if(e.defaultPrevented || e.isComposing) return;
    const c = combo(e);
    const t = e.target instanceof Element ? e.target : document.body;
    const campo = esCampo(t);
    const ov = ventanaArriba();

    // Segunda tecla de "G luego…"
    if(esperandoG){
      const vigente = Date.now() - esperandoG < 1500;
      esperandoG = 0; indicador('');
      if(vigente && nav[c]){ e.preventDefault(); location.href = nav[c][0]; return; }
      if(vigente && c === 'escape'){ e.preventDefault(); return; }
    }

    // Esc: lo más cercano primero
    if(c === 'escape'){
      // Los campos que manejan su propio Esc (ej. editar un mensaje del chat).
      if(/Escape/.test(t.getAttribute?.('onkeydown') || '')) return;
      const dd = campo && t.tagName === 'INPUT' ? desplegableDe(t) : null;
      if(dd && dd.classList.contains('open')){ teclaEnDesplegable(e, t, c); return; }
      const menu = document.querySelector('.filtros-menu.abierto');
      if(menu){
        e.preventDefault(); e.stopPropagation();
        const wrap = menu.closest('.con-filtros');
        if(typeof cerrarFiltros === 'function') cerrarFiltros(); else menu.classList.remove('abierto');
        enfocar(wrap?.querySelector(SEL_BUSCADOR) || wrap?.querySelector('.btn-filtros'), {sinScroll:true});
        return;
      }
      if(t.matches?.(SEL_BUSCADOR) && t.value){
        e.preventDefault();
        t.value = ''; t.dispatchEvent(new Event('input', {bubbles:true}));
        return;
      }
      // Desde un campo o botón dentro de una tarjeta, volver a la tarjeta.
      const item = itemDe(t);
      if(item && item !== t && (campo || !ov) && (!ov || ov.contains(item))){ e.preventDefault(); enfocar(item); return; }
      if(ov){
        e.preventDefault(); e.stopPropagation();
        if(ov._sucio && Date.now() - (ov._avisoEsc || 0) > 2500){
          ov._avisoEsc = Date.now();
          avisar('Hay cambios sin guardar: apretá Esc otra vez para cerrar');
          return;
        }
        cerrarVentana(ov);
        return;
      }
      if(campo || t.matches?.(SEL_BUSCADOR)){ t.blur(); return; }
      if(typeof Teclado.alEscape === 'function' && Teclado.alEscape(e) !== false){ e.preventDefault(); }
      return;
    }

    // Tab: no salir de la ventana abierta
    if(ov && (c === 'tab' || c === 'shift+tab')){
      const lista = enfocables(ov);
      if(!lista.length){ e.preventDefault(); return; }
      const i = lista.indexOf(document.activeElement);
      if(i < 0){ e.preventDefault(); enfocar(lista[c === 'tab' ? 0 : lista.length - 1], {sinScroll:true}); return; }
      if(c === 'tab' && i === lista.length - 1){ e.preventDefault(); enfocar(lista[0], {sinScroll:true}); return; }
      if(c === 'shift+tab' && i === 0){ e.preventDefault(); enfocar(lista[lista.length - 1], {sinScroll:true}); return; }
    }

    // Desplegables de cliente y droga
    if(campo && t.tagName === 'INPUT' && ['arrowdown','arrowup','pagedown','pageup','enter','tab','shift+tab'].includes(c)){
      if(teclaEnDesplegable(e, t, c)) return;
    }
    // Componentes del formulario
    if(campo && t.closest('.comp-row') && teclaEnComponente(e, t, c)) return;

    // Guardar / confirmar la ventana abierta
    if(ov && (c === 'ctrl+enter' || c === 'ctrl+s')){
      const b = botonPrincipal(ov);
      e.preventDefault();
      if(b) b.click();
      return;
    }

    // Buscador: ↓ o Enter van al primer resultado
    if(t.matches?.(SEL_BUSCADOR) && (c === 'arrowdown' || c === 'enter')){
      const wrap = t.closest('.con-filtros');
      if(!(wrap && wrap.querySelector('.filtros-menu.abierto'))){
        const raiz = ov || document;
        const prim = itemsDe(raiz).find(n => ov || !n.closest(SEL_OVERLAY));
        if(prim){ e.preventDefault(); enfocar(prim); return; }
      }
    }

    // Sobre una tarjeta o fila
    const item = itemDe(t);
    if(item && t === item && (!ov || ov.contains(item))){
      if(teclaEnItem(e, item, c)) return;
    }
    // Enter en un campo dentro de una tarjeta (ej. el precio en el cajón de solicitudes)
    if(item && campo && c === 'enter' && t.tagName === 'INPUT' && !t.hasAttribute('onkeydown')){
      const b = botonTecla(item, 'enter');
      if(b){ e.preventDefault(); b.click(); return; }
    }
    // Elementos clicables que no son botones
    if(!campo && (c === 'enter' || c === 'espacio') && t.matches?.(SEL_CLICK)){
      e.preventDefault(); t.click(); return;
    }

    // Grupos de botones (fórmulas de stock, uso, vencimiento, vista…): ← → (y ↑ ↓) entre ellos
    if(t.tagName === 'BUTTON' && !item && /^arrow(left|right|up|down)$/.test(c)){
      const grupo = [...t.parentElement.children].filter(n => n.tagName === 'BUTTON' && visible(n) && !n.disabled);
      const vertical = c === 'arrowup' || c === 'arrowdown';
      if(grupo.length >= 2 && (!vertical || t.parentElement.matches('.stock-picker-grid'))){
        e.preventDefault();
        const i = grupo.indexOf(t), d = (c === 'arrowright' || c === 'arrowdown') ? 1 : -1;
        let j = i + d;
        if(vertical){ // misma columna de la grilla
          const x = t.getBoundingClientRect().left;
          const cand = grupo.filter(n => Math.abs(n.getBoundingClientRect().left - x) < 4);
          j = grupo.indexOf(cand[cand.indexOf(t) + d]);
        }
        if(j >= 0 && grupo[j]) enfocar(grupo[j]);
        return;
      }
    }

    // Atajos de la página
    for(const a of atajos){
      if(a.combo !== c) continue;
      if(campo && !a.enCampo) continue;
      if(ov && !a.conVentana) continue;
      if(a.cuando && !a.cuando()) continue;
      if(!a.accion) continue;
      e.preventDefault();
      a.accion(e);
      return;
    }

    if(campo) return;

    // Generales
    if(c === '?'){ e.preventDefault(); const o = document.getElementById('atajosOverlay'); if(o?.classList.contains('open')) cerrarAyuda(); else mostrarAyuda(); return; }
    if(ov) return;
    if(c === '/' || c === 'ctrl+k'){ if(enfocarBuscador()) e.preventDefault(); return; }
    if(c === 'f'){ if(alternarFiltros()) e.preventDefault(); return; }
    if(c === 'shift+r'){
      const b = [...document.querySelectorAll('#btnActualizar, button[onclick^="cargarTodo"]')].find(visible);
      if(b){ e.preventDefault(); b.click(); avisar('Actualizando…'); }
      return;
    }
    if(c === 'g' && Object.keys(nav).length){ e.preventDefault(); esperandoG = Date.now(); indicador('G…'); setTimeout(() => { if(esperandoG && Date.now() - esperandoG >= 1500){ esperandoG = 0; indicador(''); } }, 1600); return; }
    // 1, 2, 3…: primera tarjeta de esa columna del kanban
    if(/^[1-9]$/.test(c)){
      const cols = [...document.querySelectorAll('.kanban-cols > .col')].filter(visible);
      const col = cols[Number(c) - 1];
      if(col){ e.preventDefault(); const p = itemsDe(col)[0]; if(p) enfocar(p); else avisar('No hay tarjetas en esa columna'); }
      return;
    }
    // Una flecha sin nada enfocado: arrancar por el primer resultado
    if((c === 'arrowdown' || c === 'arrowright') && t === document.body){
      const p = primerItemDePagina();
      if(p){ e.preventDefault(); enfocar(p); }
    }
  }

  // ── Preparar el DOM: hacer enfocables las tarjetas, filas y clicables ─────
  let pendiente = false;
  function preparar(){
    pendiente = false;
    document.querySelectorAll(SEL_ITEM).forEach(el => {
      if(!el.hasAttribute('tabindex')) el.tabIndex = 0;
      el.classList.add('nav-item');
    });
    document.querySelectorAll(SEL_CLICK).forEach(el => {
      if(!el.hasAttribute('tabindex')) el.tabIndex = 0;
      if(!el.hasAttribute('role')) el.setAttribute('role', 'button');
    });
    // Devolver el foco a la tarjeta que se volvió a dibujar (recarga por tiempo real, mover, etc.)
    if(ultimoItemId && (document.activeElement === document.body || !document.activeElement) && !ventanaArriba()){
      const el = document.querySelector(`[data-id="${CSS.escape(ultimoItemId)}"]`);
      const it = el && (el.matches(SEL_ITEM) ? el : itemDe(el));
      if(visible(it)) enfocar(it, {sinScroll:false});
    }
  }
  function programar(){ if(!pendiente){ pendiente = true; requestAnimationFrame(preparar); } }

  function iniciar(){
    preparar();
    agregarBotonAyuda();
    document.querySelectorAll(SEL_OVERLAY).forEach(o => { if(o.classList.contains('open')) alAbrir(o); });
    new MutationObserver(muts => {
      let hijos = false;
      for(const m of muts){
        if(m.type === 'childList'){ hijos = true; continue; }
        const el = m.target;
        if(!(el instanceof Element) || !el.matches(SEL_OVERLAY)) continue;
        const antes = (m.oldValue || '').split(/\s+/).includes('open');
        const ahora = el.classList.contains('open');
        if(ahora && !antes) alAbrir(el);
        else if(!ahora && antes) alCerrar(el);
      }
      if(hijos) programar();
    }).observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['class'], attributeOldValue:true});
  }

  window.addEventListener('keydown', alTeclear, true);
  document.addEventListener('focusin', e => {
    const ov = e.target.closest?.(SEL_OVERLAY);
    if(ov) ov._ultimoFoco = e.target;
    const it = itemDe(e.target);
    ultimoItemId = it?.dataset?.id || (it ? null : (e.target === document.body ? ultimoItemId : null));
  });
  document.addEventListener('mousedown', e => { if(!itemDe(e.target)) ultimoItemId = null; }, true);
  document.addEventListener('input', e => { const ov = e.target.closest?.(SEL_OVERLAY); if(ov && ov !== document.getElementById('atajosOverlay') && !e.target.matches(SEL_BUSCADOR)) ov._sucio = true; }, true);
  // Pasar el mouse por una opción del desplegable la marca, para que Enter elija la misma.
  document.addEventListener('mousemove', e => {
    const op = e.target.closest?.(SEL_OPCION); if(!op) return;
    op.parentElement.querySelectorAll('.ss-activa').forEach(o => o.classList.remove('ss-activa'));
    op.classList.add('ss-activa');
  });
  // Una lista desplegable o el menú de filtros se cierran cuando el foco se va a otro lado
  // (Tab, Shift+Tab, clic, o un atajo que enfoca otra cosa).
  document.addEventListener('focusout', e => {
    const el = e.target;
    setTimeout(() => {
      const ahora = document.activeElement;
      if(el.tagName === 'INPUT'){
        const dd = desplegableDe(el);
        if(dd && dd.classList.contains('open') && ahora !== el && !dd.contains(ahora)) dd.classList.remove('open');
      }
      const wrap = el.closest?.('.con-filtros');
      const menu = wrap?.querySelector('.filtros-menu.abierto');
      if(menu && ahora && ahora !== document.body && !wrap.contains(ahora)){
        if(typeof cerrarFiltros === 'function') cerrarFiltros(); else menu.classList.remove('abierto');
      }
    }, 0);
  });
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  // ── API para las páginas ──────────────────────────────────────────────────
  return {
    alMover: null,
    alEscape: null,
    atajo({teclas, etiqueta, desc, grupo = 'En esta página', accion, enCampo = false, conVentana = false, cuando = null}){
      [].concat(teclas).forEach((t, i) => atajos.push({combo:t.toLowerCase(), etiqueta: i === 0 ? (etiqueta || t.toUpperCase()) : null, desc: i === 0 ? desc : null, grupo, accion, enCampo, conVentana, cuando}));
    },
    ayuda(grupo, etiqueta, desc){ extrasAyuda.push({grupo, etiqueta, desc}); },
    navegacion(mapa){ nav = mapa; },
    mostrarAyuda, cerrarAyuda, enfocar, enfocarBuscador,
  };
})();
