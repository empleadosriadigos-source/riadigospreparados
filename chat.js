// Minichat de cada preparado (index.html = San Martín, sucursal.html = sucursal).
// Se carga después de comun.js y antes del <script> propio de la página.
//
// La página define:
//   CHAT_LADO = 'admin' | 'sucursal'    → quién escribe desde esta página
//   buscarPreparadoChat(id)             → devuelve el preparado (con .comentarios)
//   renderMiniChat(p)                   → el HTML del chat (cada página tiene el suyo)
// Las imágenes van al bucket privado chat-imagenes con la ruta {preparado_id}/archivo.

let draftComentarios = {};   // id preparado -> texto sin enviar (no se pierde al re-renderizar)
let editandoComentario = {}; // id comentario -> true mientras se edita su texto

function chatMensajeContenido(c){
  const partes = [];
  if(c.imagen_url) partes.push(`<img class="chat-img" data-path="${escHtml(c.imagen_url)}" data-cargada="0" onclick="if(this.dataset.cargada==='1') verImagenAmpliada(this.src)"/>`);
  if(c.texto) partes.push(escHtml(c.texto) + (c.editado ? ' <span class="chat-editado-tag">(editado)</span>' : ''));
  return partes.join('');
}
function chatEtiqueta(p, propio){
  if(CHAT_LADO==='admin') return propio ? 'San Martín' : (p.origen_sucursal||'Sucursal');
  return propio ? ((typeof SUCURSAL_NOMBRE!=='undefined' && SUCURSAL_NOMBRE)||'Vos') : 'San Martín';
}
function chatMensajesHtml(p){
  const msgs = p.comentarios||[];
  if(!msgs.length){
    if(p.mensaje_sucursal){
      // Mensaje viejo (antes del chat): siempre lo escribió San Martín.
      if(CHAT_LADO==='admin') return `<div class="chat-bubble chat-propio"><div class="chat-bubble-label">San Martín</div>${escHtml(p.mensaje_sucursal)}</div>`;
      const rechazo = p.estado==='Rechazado';
      return `<div class="chat-bubble ${rechazo?'chat-rechazo':'chat-recibido'}"><div class="chat-bubble-label">${rechazo?'Rechazado por San Martín':'San Martín'}</div>${escHtml(p.mensaje_sucursal)}</div>`;
    }
    return '<div class="minichat-empty">Sin mensajes todavía</div>';
  }
  return msgs.map(c=>{
    const propio = c.autor_tipo===CHAT_LADO;
    const label = chatEtiqueta(p, propio);
    if(propio && editandoComentario[c.id]){
      return `<div class="chat-bubble chat-propio chat-bubble-editando" onclick="event.stopPropagation()"><div class="chat-bubble-label">${escHtml(label)}</div>
        <input type="text" class="chat-edit-input" id="chatedit-${c.id}" value="${escHtml(c.texto)}" onkeydown="if(event.key==='Enter'){guardarEdicionComentario('${p.id}','${c.id}')}else if(event.key==='Escape'){cancelarEdicionComentario('${p.id}','${c.id}')}"/>
        <div class="chat-edit-acciones"><button type="button" title="Guardar" onclick="guardarEdicionComentario('${p.id}','${c.id}')">✔</button><button type="button" title="Cancelar" onclick="cancelarEdicionComentario('${p.id}','${c.id}')">✕</button></div>
      </div>`;
    }
    return `<div class="chat-bubble ${propio?'chat-propio':'chat-recibido'}"><div class="chat-bubble-label">${escHtml(label)}</div>${chatMensajeContenido(c)}${propio?chatBubbleAcciones(p.id,c):''}</div>`;
  }).join('');
}
function chatBubbleAcciones(prepId, c){
  const botones = [];
  if(!c.imagen_url) botones.push(`<button type="button" title="Editar mensaje" onclick="event.stopPropagation();iniciarEdicionComentario('${prepId}','${c.id}')">✏️</button>`);
  botones.push(`<button type="button" title="Borrar" onclick="event.stopPropagation();borrarComentarioChat('${prepId}','${c.id}')">🗑️</button>`);
  return `<div class="chat-bubble-acciones">${botones.join('')}</div>`;
}
async function refrescarChat(id){
  try{
    const coments = await sbGet(`preparado_comentarios?preparado_id=eq.${id}&order=created_at.asc`);
    const p = buscarPreparadoChat(id);
    if(p) p.comentarios = coments;
    const cont = document.getElementById('chatmsg-'+id);
    if(cont && p){ cont.innerHTML = chatMensajesHtml(p); cargarImagenesPendientes(cont); scrollChatAbajo(id); }
  }catch(err){ /* silencioso, no interrumpe al usuario */ }
}
function rerenderMensajesLocal(id){
  const p = buscarPreparadoChat(id);
  const cont = document.getElementById('chatmsg-'+id);
  if(cont && p){ cont.innerHTML = chatMensajesHtml(p); cargarImagenesPendientes(cont); }
}
async function enviarComentarioChat(id){
  const input = document.getElementById('chatinput-'+id);
  if(!input) return;
  const texto = input.value.trim();
  if(!texto) return;
  input.disabled = true;
  try{
    await sbPost('preparado_comentarios', {preparado_id:id, autor_tipo:CHAT_LADO, texto});
    delete draftComentarios[id];
    input.value = '';
    await refrescarChat(id);
  }catch(err){ mostrarToast('Error: '+err.message,'err'); }
  input.disabled = false;
}
async function borrarComentarioChat(prepId, comentarioId){
  if(!confirm('¿Borrar este mensaje? No se puede deshacer.')) return;
  try{
    const p = buscarPreparadoChat(prepId);
    const c = p && (p.comentarios||[]).find(x=>x.id===comentarioId);
    // La imagen se borra ANTES que la fila: la policy de storage valida contra el comentario.
    if(c && c.imagen_url){
      try{ await sbEliminarImagen('chat-imagenes', c.imagen_url); }catch(errImg){ /* si falla igual se intenta borrar el mensaje */ }
    }
    await sbDelete(`preparado_comentarios?id=eq.${comentarioId}`);
    delete editandoComentario[comentarioId];
    await refrescarChat(prepId);
  }catch(err){ mostrarToast('Error al borrar: '+err.message,'err'); }
}
function iniciarEdicionComentario(prepId, comentarioId){
  editandoComentario[comentarioId] = true;
  rerenderMensajesLocal(prepId);
  const input = document.getElementById('chatedit-'+comentarioId);
  if(input){ input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
}
async function guardarEdicionComentario(prepId, comentarioId){
  const input = document.getElementById('chatedit-'+comentarioId);
  if(!input) return;
  const nuevoTexto = input.value.trim();
  if(!nuevoTexto){ mostrarToast('El mensaje no puede quedar vacío. Si querés borrarlo, usá 🗑️.','err'); return; }
  input.disabled = true;
  try{
    await sbPatch('preparado_comentarios', comentarioId, {texto: nuevoTexto, editado: true});
    delete editandoComentario[comentarioId];
    await refrescarChat(prepId);
  }catch(err){ mostrarToast('Error al editar: '+err.message,'err'); input.disabled = false; }
}
function cancelarEdicionComentario(prepId, comentarioId){
  delete editandoComentario[comentarioId];
  rerenderMensajesLocal(prepId);
}

// ── Imágenes ────────────────────────────────────────────────────────────────
async function manejarImagenChat(id, file){
  if(!file.type || !file.type.startsWith('image/')){ mostrarToast('El archivo tiene que ser una imagen','err'); return; }
  mostrarToast('Subiendo imagen…','ok');
  try{
    const blob = await comprimirImagen(file);
    const nombre = `${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
    const path = `${id}/${nombre}`;
    await sbSubirImagen('chat-imagenes', path, blob);
    await sbPost('preparado_comentarios', {preparado_id:id, autor_tipo:CHAT_LADO, texto:'', imagen_url:path});
    await refrescarChat(id);
  }catch(err){ mostrarToast('Error al subir la imagen: '+err.message,'err'); }
}
function pegarImagenChat(event, id){
  const items = (event.clipboardData||{}).items || [];
  for(const item of items){
    if(item.type && item.type.startsWith('image/')){
      event.preventDefault();
      const file = item.getAsFile();
      if(file) manejarImagenChat(id, file);
      return;
    }
  }
  // si no hay imagen en el portapapeles, se deja seguir el pegado normal de texto
}
function cargarImagenesPendientes(cont){
  if(!cont) return;
  cont.querySelectorAll('img.chat-img[data-cargada="0"]').forEach(async img => {
    try{
      img.src = await sbFirmarImagen('chat-imagenes', img.dataset.path);
      img.dataset.cargada = '1';
    }catch(err){ /* silencioso: la miniatura queda atenuada si falla */ }
  });
}
function verImagenAmpliada(src){
  document.getElementById('imgAmpliadaEl').src = src;
  document.getElementById('imgAmpliadaOverlay').classList.add('open');
}
function cerrarImagenAmpliada(){
  document.getElementById('imgAmpliadaOverlay').classList.remove('open');
  document.getElementById('imgAmpliadaEl').src = '';
}
function imprimirImagenAmpliada(){
  const src = document.getElementById('imgAmpliadaEl').src;
  if(!src) return;
  const w = window.open('', '_blank');
  if(!w){ mostrarToast('El navegador bloqueó la ventana nueva. Permití pop-ups para este sitio e intentá de nuevo.','err'); return; }
  w.document.write(`<html><head><title>Imprimir imagen</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;"><img src="${src}" style="max-width:100%;" onload="print()"/></body></html>`);
  w.document.close();
}
function scrollChatAbajo(id){ const el = document.getElementById('chatmsg-'+id); if(el) el.scrollTop = el.scrollHeight; }
function scrollTodosLosChats(){ document.querySelectorAll('.minichat-messages').forEach(el => el.scrollTop = el.scrollHeight); }
