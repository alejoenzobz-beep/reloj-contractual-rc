// Documentos de salida: carta de notificación, acta de reunión e informe de impacto.
// Solo usa datos confirmados por una persona; cada cifra del texto se verifica con verificarCarta (nucleo.js).
import * as N from './nucleo.js';
import * as IA from './ia.js';
import { HERRAMIENTAS } from './herramientas.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TIPOS = { carta: 'Carta de notificación', acta: 'Acta de reunión', informe: 'Informe de impacto' };

// ---------- datos confirmados y plantillas ----------
export function camposDe(ctx, a) {
  const dec = ctx.est.decisiones[a.id] || {};
  const partida = dec.partida ?? a.partida;
  const al = { ...a, cambio: a.cambio.split(/(?<=\.)\s/)[0], partida, partida_desc: partida ? ctx.partidaPorCod[partida]?.desc || a.partida_desc : '' };
  const pp = ctx.P(a);
  const base = N.camposCarta(al, pp, a.doc);
  const n = (a.criterios || []).filter(Boolean).length;
  return {
    ...base,
    proyecto: ctx.PROY[a.proyecto].nombre,
    fecha_emision: N.fmtFecha(ctx.est.hoy),
    fecha_limite: N.fmtFecha(a.limite),
    dias_restantes: String(N.diasRestantes(a.limite, ctx.est.hoy)),
    cita: a.cita,
    confianza: a.criterios ? `${a.confianza} (${n} de 4 criterios)` : String(a.confianza || 'sin propuesta'),
    decision: dec.estado ? `${dec.estado}${dec.estado === 'corregida' && partida !== a.partida ? ` (la IA propuso ${a.partida || 'ninguna'})` : ''}` : 'pendiente',
    alternativa: a.alternativa ? `${a.alternativa} ${a.alternativa_desc}` : '',
  };
}

export function plantilla(tipo, c) {
  if (tipo === 'carta') return `Lima, ${c.fecha_emision}

Señores
LA PROPIETARIA
${c.proyecto}

Asunto: Notificación de variación · documento ${c.documento}, revisión ${c.revision}
Referencia: cláusula ${c.clausula} del contrato

${N.cartaPlantilla(c)}

Sustento: el documento ${c.documento} (revisión ${c.revision}) indica literalmente: «${c.cita}».

Fecha límite para esta notificación según la cláusula ${c.clausula}: ${c.fecha_limite}.

Atentamente,

[Nombre y firma del representante del contratista]`;
  if (tipo === 'acta') return `ACTA DE REUNIÓN · REVISIÓN DE CAMBIO

Proyecto: ${c.proyecto}
Fecha: ${c.fecha_emision}
Asistentes: [completar: oficina técnica, residencia, supervisión]

Documento de origen: ${c.documento}, revisión ${c.revision}, recibido en el entorno común de datos el ${c.fecha_recepcion}.
Cambio identificado: ${c.cambio} (${c.ubicacion}).
Sustento literal: «${c.cita}».
Partida afectada: ${c.partida}. Metrado preliminar ${c.metrado_preliminar}.
Plazo para notificar: ${c.plazo} según la cláusula ${c.clausula}; vence el ${c.fecha_limite}.

Acuerdos:
– [completar]
Responsable de notificar a la propietaria: [completar]`;
  return `INFORME DE IMPACTO DEL CAMBIO

Proyecto: ${c.proyecto}
Documento de origen: ${c.documento}, revisión ${c.revision} (${c.titulo_documento}), recibido el ${c.fecha_recepcion}.

Descripción del cambio: ${c.cambio}
Ubicación: ${c.ubicacion}
Evidencia (cita literal verificada): «${c.cita}»

Partida del presupuesto: ${c.partida}. Confianza ${c.confianza}.${c.alternativa ? `\nPartida alternativa: ${c.alternativa}.` : ''}
Metrado preliminar: ${c.metrado_preliminar}. Lo calcula oficina técnica; el asistente no estima metrados ni montos.

Plazo contractual: ${c.plazo} desde la recepción (cláusula ${c.clausula}). Fecha límite: ${c.fecha_limite}. Días restantes al ${c.fecha_emision}: ${c.dias_restantes}.
Decisión registrada: ${c.decision}.`;
}

// Avisos en vivo sobre el texto editado.
export function revisar(texto, c, vencido) {
  const v = N.verificarCarta(texto, c), n = N.normalizar(texto), av = [];
  if (!n.includes(N.normalizar(c.cita))) av.push({ nivel: 'mal', t: 'Falta la cita literal del documento de origen.' });
  if (!texto.includes(c.fecha_limite)) av.push({ nivel: 'mal', t: `Falta la fecha límite (${c.fecha_limite}).` });
  if (!v.ok) av.push({ nivel: 'mal', t: `Cifras o fechas sin origen en los datos confirmados: ${v.fuera.join(', ')}.` });
  if (vencido) av.push({ nivel: 'mal', t: `Fecha fuera de plazo: el límite fue el ${c.fecha_limite}. La notificación sería extemporánea.` });
  const pend = (texto.match(/\[completar[^\]]*\]|\[Nombre[^\]]*\]/g) || []).length;
  if (pend) av.push({ nivel: 'info', t: `${pend} campo${pend === 1 ? '' : 's'} por completar antes de firmar.` });
  return { av, ok: !av.some(x => x.nivel === 'mal') };
}

function resaltar(texto, c) {
  const vals = [c.cita, c.fecha_limite, c.partida, c.fecha_recepcion, c.documento, c.clausula, c.plazo].filter(v => v && String(v).length > 2);
  let h = esc(texto);
  [...new Set(vals)].sort((x, y) => y.length - x.length).forEach(v => { h = h.split(esc(v)).join(`\u0001${esc(v)}\u0002`); });
  h = h.replace(/\u0001/g, '<mark class="campo">').replace(/\u0002/g, '</mark>');
  return h.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}
const leerEditor = el => el.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();

// ---------- DOCX mínimo (ZIP sin compresión) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
export function zip(archivos, tipo = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
  const enc = new TextEncoder(), partes = [], central = []; let off = 0;
  for (const [nombre, cont] of archivos) {
    const n = enc.encode(nombre), d = enc.encode(cont), crc = crc32(d);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
    partes.push(new Uint8Array(h.buffer), n, d);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), n); off += 30 + n.length + d.length;
  }
  const tam = central.reduce((s, x) => s + x.length, 0);
  const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, archivos.length, true); e.setUint16(10, archivos.length, true); e.setUint32(12, tam, true); e.setUint32(16, off, true);
  return new Blob([...partes, ...central, new Uint8Array(e.buffer)], { type: tipo });
}
const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function docx(titulo, texto) {
  const parr = texto.split(/\n/).map((l, i) => {
    const neg = i === 0 && /^[A-ZÁÉÍÓÚÑ ·]+$/.test(l.trim());
    return `<w:p><w:pPr><w:spacing w:after="${l.trim() ? 120 : 0}"/></w:pPr>${l ? `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>${neg ? '<w:b/>' : ''}<w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${xml(l)}</w:t></w:r>` : ''}</w:p>`;
  }).join('');
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parr}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(titulo)}</dc:title><dc:creator>Reloj Contractual</dc:creator></cp:coreProperties>`],
    ['word/document.xml', doc],
  ]);
}
// Correo .eml (MIME) con el DOCX adjunto; X-Unsent hace que Outlook lo abra como borrador.
const b64utf8 = t => btoa(String.fromCharCode(...new TextEncoder().encode(t)));
async function b64blob(blob) { const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }
const partir = s => s.replace(/.{1,76}/g, '$&\r\n');
export async function eml({ asunto, cuerpo, adjunto, nombreAdjunto }) {
  const lim = 'rc-' + Math.random().toString(36).slice(2);
  const enc = t => `=?UTF-8?B?${b64utf8(t)}?=`;
  const txt = ['MIME-Version: 1.0', 'X-Unsent: 1', `Subject: ${enc(asunto)}`, 'To: ', `Date: ${new Date().toUTCString()}`, `Content-Type: multipart/mixed; boundary="${lim}"`, '',
    `--${lim}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', partir(b64utf8(cuerpo)),
    `--${lim}`, `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document; name="${nombreAdjunto}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${nombreAdjunto}"`, '', partir(await b64blob(adjunto)),
    `--${lim}--`, ''].join('\r\n');
  return new Blob([txt], { type: 'message/rfc822' });
}
function descargar(blob, nombre) { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = nombre; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); }

// ---------- vista ----------
const S = { tipo: 'carta', res: null };
export function vSalidas(ctx, idSel) {
  const { est } = ctx;
  const esperan = ctx.alertas.filter(a => ['confirmada', 'corregida'].includes(est.decisiones[a.id]?.estado) && !est.aprobaciones[a.id]);
  const decididas = ctx.alertas.filter(a => est.aprobaciones[a.id]?.estado === 'aprobada').sort((x, y) => N.diasRestantes(x.limite, est.hoy) - N.diasRestantes(y.limite, est.hoy));
  const a = ctx.alertaPorId[idSel] && est.aprobaciones[idSel]?.estado === 'aprobada' ? ctx.alertaPorId[idSel] : decididas[0];
  const raiz = $('#v-salidas');
  const lista = decididas.length ? `<ul class="sal-lista">${decididas.map(x => { const e = est.emitidas[x.id]; return `<li><a href="#salidas-${x.id.toLowerCase()}" ${a && x.id === a.id ? 'aria-current="true"' : ''}><b>${esc(x.doc_id)} · ${esc(x.elemento)}</b><small>${esc(ctx.PROY[x.proyecto].nombre)} · ${e ? `<span class="ok-t">${esc(TIPOS[e.tipo])} emitida el ${N.fmtFecha(e.fecha)}</span>` : `notificar hasta el ${N.fmtFecha(x.limite)}`}</small></a></li>`; }).join('')}</ul>`
    : `<p class="vacio">Todavía no hay variaciones aprobadas. Un cambio llega aquí cuando oficina técnica lo confirma y el jefe/a de oficina técnica aprueba notificarlo.</p>`;
  const espera = esperan.length ? `<p class="pista-txt" style="margin-top:10px">${esperan.length} cambio${esperan.length === 1 ? '' : 's'} confirmado${esperan.length === 1 ? '' : 's'} espera${esperan.length === 1 ? '' : 'n'} la aprobación del jefe/a de oficina técnica: ${esperan.map(x => `<a href="#alerta-${x.id.toLowerCase()}">${esc(x.doc_id)}</a>`).join(', ')}.</p>` : '';
  if (!a) { raiz.innerHTML = cab() + `<div class="sal-grid"><div class="panel">${lista}${espera}</div></div>`; return; }
  const c = camposDe(ctx, a), clave = `${a.id}:${S.tipo}`, texto = est.borradores[clave] ?? plantilla(S.tipo, c);
  const vencido = N.diasRestantes(a.limite, est.hoy) < 0, emi = est.emitidas[a.id];
  raiz.innerHTML = cab() + `
    <div class="sal-grid">
      <aside class="panel"><h3>Variaciones aprobadas</h3>${lista}${espera}</aside>
      <section class="sal-editor">
        <div class="sal-barra"><div class="segmento" role="tablist" aria-label="Tipo de documento">${Object.entries(TIPOS).map(([k, t]) => `<button role="tab" aria-selected="${S.tipo === k}" data-tipo="${k}">${t}</button>`).join('')}</div>
          <span class="pista-txt">${esc(a.doc_id)} rev. ${esc(a.doc.revision)} · decisión: ${esc(c.decision)}</span></div>
        <div class="hoja" id="doc-imprimir"><div class="hoja-txt" id="sal-ed" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="${esc(TIPOS[S.tipo])}, editable">${resaltar(texto, c)}</div></div>
        <p class="pista-txt">Texto editable. Resaltado: datos confirmados que la app verifica (cita, partida, fechas, cláusula). <button class="enlace" id="sal-reset" ${est.borradores[clave] != null ? '' : 'hidden'}>Volver a la plantilla</button></p>
        <div id="sal-avisos" aria-live="polite"></div>
        <div class="sal-acciones">
          <div class="fila-btn"><span class="tit2">Exportar</span><button class="btn peq" data-exp="docx">Descargar DOCX</button><button class="btn peq" data-exp="pdf">Imprimir o guardar PDF</button><button class="btn peq" data-exp="md">Descargar MD</button><button class="btn peq" data-exp="ics">Agregar fecha límite al calendario</button>${ctx.drive?.activo ? '<button class="btn peq" data-exp="drive">Guardar DOCX en Google Drive</button>' : ''}</div>
          <div class="fila-btn"><span class="tit2">Enviar</span><button class="btn peq prim" data-env="eml">Correo con el DOCX adjunto (.eml)</button><button class="btn peq" data-env="mailto">Abrir en mi correo</button><button class="btn peq" data-env="copiar">Copiar texto de la carta</button>${ctx.telegram?.activo ? '<button class="btn peq" data-env="telegram">Enviar aviso por Telegram</button>' : ''}</div>
          <div class="fila-btn"><span class="tit2">Redactar con mi IA</span><button class="btn peq" data-env="instruccion">Copiar instrucción para mi IA</button><span class="pista-txt">La instrucción usa solo los datos confirmados; si pegas aquí la respuesta, la app la verifica igual.</span></div>
          <div class="fila-btn"><span class="tit2">Herramientas · ${esc(IA.etiquetaModo())}</span>${Object.entries(HERRAMIENTAS).map(([k, h]) => `<button class="btn peq" data-her="${k}">${h.titulo}</button>`).join('')}</div>
        </div>
        <div id="sal-env" aria-live="polite"></div>
        <div id="sal-her" aria-live="polite"></div>
        <div class="sal-emitir ${emi ? 'hecho' : ''}">${emi ? `<p><b>✓ ${esc(TIPOS[emi.tipo])} emitida</b> el ${N.fmtFecha(emi.fecha)} por ${esc(emi.quien)}. Queda en el registro de auditoría.</p><button class="btn peq" id="sal-anular">Anular registro de emisión</button>`
          : ctx.puede('emitir') ? `<p><b>¿Listo para firmar?</b> Exportar no es emitir. Registra la emisión cuando el documento se firme y envíe: queda en el registro con fecha y responsable.</p><button class="btn prim" id="sal-emitir">Registrar emisión</button>` : `<div><p><b>Exportar no es emitir.</b> La firma y el registro de la emisión los hace el gerente de proyecto.</p>${ctx.notaRol('emitir', 'Registrar la emisión')}</div>`}</div>
      </section>
    </div>`;
  function cab() { return `<div class="tab-cab"><div><h2>Documentos de salida</h2><p class="sub2">El borrador usa solo datos confirmados por una persona: la cita literal, la partida y la fecha límite calculada por la fórmula. La app avisa si una cifra no tiene origen.</p></div></div>`; }
  const ed = $('#sal-ed');
  const pintarAvisos = () => {
    const r = revisar(leerEditor(ed), c, vencido);
    $('#sal-avisos').innerHTML = r.av.length ? r.av.map(x => `<div class="check"><span class="ico ${x.nivel === 'mal' ? 'no' : 'info'}">${x.nivel === 'mal' ? '✗' : '!'}</span><div>${esc(x.t)}</div></div>`).join('')
      : '<div class="check"><span class="ico si">✓</span><div>Control superado: la cita, la fecha límite y todas las cifras vienen de los datos confirmados.</div></div>';
    return r;
  };
  pintarAvisos();
  ed.oninput = () => { est.borradores[clave] = leerEditor(ed); ctx.guardar(); pintarAvisos(); $('#sal-reset').hidden = false; };
  ed.onblur = () => { if (est.borradores[clave] != null) ed.innerHTML = resaltar(est.borradores[clave], c); };
  raiz.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => { S.tipo = b.dataset.tipo; vSalidas(ctx, a.id); });
  $('#sal-reset').onclick = () => { delete est.borradores[clave]; ctx.guardar(); vSalidas(ctx, a.id); };
  const nombre = `${S.tipo}_${a.doc_id}_${a.id}`.replace(/[^\w.-]+/g, '_');
  raiz.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => {
    const t = leerEditor(ed);
    if (b.dataset.exp === 'ics') { const u = URL.createObjectURL(new Blob([ctx.icsDe(a)], { type: 'text/calendar;charset=utf-8' })); const l = document.createElement('a'); l.href = u; l.download = `plazo_${a.doc_id}_${a.id}.ics`.replace(/[^\w.-]+/g, '_'); document.body.append(l); l.click(); l.remove(); ctx.registrar(ctx.rolN(), `${a.doc_id} · fecha límite agregada al calendario (.ics)`); return; }
    if (b.dataset.exp === 'drive') { msg('<span class="spin"></span> Guardando en Google Drive…', 'info'); ctx.drive.subir(docx(`${TIPOS[S.tipo]} · ${a.doc_id}`, t), `${nombre}.docx`).then(r => { msg(`Guardado en Google Drive: <a href="${esc(r.webViewLink || '#')}" target="_blank" rel="noopener">${esc(r.name || nombre)}</a>.`); ctx.registrar(ctx.rolN(), `${a.doc_id} · DOCX guardado en Google Drive`); }).catch(e => msg(esc(e.message), 'mal')); return; }
    if (b.dataset.exp === 'docx') descargar(docx(`${TIPOS[S.tipo]} · ${a.doc_id}`, t), `${nombre}.docx`);
    else if (b.dataset.exp === 'md') descargar(new Blob([`# ${TIPOS[S.tipo]} · ${a.doc_id}\n\n${t.replace(/\n(?!\n)/g, '  \n')}\n`], { type: 'text/markdown' }), `${nombre}.md`);
    else { ed.blur(); window.print(); }
    ctx.registrar(ctx.rolN(), `${a.doc_id} · ${TIPOS[S.tipo].toLowerCase()} exportada (${b.dataset.exp.toUpperCase()})`);
  });
  const asunto = `Notificación de variación · ${a.doc_id}, revisión ${a.doc.revision} · ${c.proyecto}`;
  const cortesia = `Señores:\n\nAdjuntamos la notificación de variación correspondiente al documento ${c.documento} (revisión ${c.revision}), recibido en el entorno común de datos el ${c.fecha_recepcion}, conforme a la cláusula ${c.clausula} del contrato.\n\nQuedamos atentos a sus comentarios.\n\nAtentamente,`;
  const msg = (html, cls = 'ok') => { $('#sal-env').innerHTML = `<p class="aviso ${cls}" style="margin-top:8px">${html}</p>`; };
  raiz.querySelectorAll('[data-env]').forEach(b => b.onclick = async () => {
    const t = leerEditor(ed), k = b.dataset.env;
    if (k === 'eml') {
      const blob = docx(`${TIPOS[S.tipo]} · ${a.doc_id}`, t);
      descargar(await eml({ asunto, cuerpo: `${cortesia}\n\n---\n\n${t}`, adjunto: blob, nombreAdjunto: `${nombre}.docx` }), `${nombre}.eml`);
      msg('Se descargó el correo con la carta en DOCX adjunta. Ábrelo con Outlook, Apple Mail o Thunderbird: se abre como borrador, listo para poner el destinatario y enviar. En Gmail, usa «Abrir en mi correo» y adjunta el DOCX.');
      ctx.registrar(ctx.rolN(), `${a.doc_id} · correo preparado con el DOCX adjunto (.eml)`);
    } else if (k === 'mailto') {
      location.href = `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cortesia + '\n\n[Adjunta aquí el DOCX descargado]')}`;
      msg('Se abrió tu programa de correo con el asunto y un texto de cortesía. Adjunta el DOCX descargado: un enlace «mailto» no puede adjuntar archivos.', 'info');
    } else if (k === 'copiar') {
      try { await navigator.clipboard.writeText(t); msg('Texto de la carta copiado al portapapeles.'); } catch { msg('No se pudo copiar automáticamente: selecciona el texto de la hoja y cópialo con Ctrl+C.', 'mal'); }
    } else if (k === 'telegram') {
      msg('<span class="spin"></span> Enviando aviso por Telegram…', 'info');
      try { await ctx.telegram.enviar(a); msg('Aviso enviado por Telegram con el cambio y su fecha límite.'); ctx.registrar(ctx.rolN(), `${a.doc_id} · aviso enviado por Telegram`); } catch (e) { msg(esc(e.message), 'mal'); }
    } else if (k === 'instruccion') {
      const ins = `${N.INSTRUCCIONES.I4[N.VERSION_VIGENTE.I4].sistema}\n\n---\n\n${N.mensajeI4(c)}`;
      let copiado = true; try { await navigator.clipboard.writeText(ins); } catch { copiado = false; }
      $('#sal-env').innerHTML = `<div class="panel manual"><span class="rotulo-demo" style="color:var(--azul-2);border-color:var(--azul-2)">IA: manual</span><h3>Redactar la carta con tu IA</h3><p class="pista-txt">${copiado ? 'Instrucción copiada.' : 'No se pudo copiar automáticamente: ábrela abajo y cópiala.'} Pégala en la IA que prefieras y pega aquí el texto que devuelva: reemplazará el borrador y la app verificará que cada cifra venga de los datos confirmados.</p>
        <details class="tec"><summary>Ver instrucción completa</summary><pre class="crudo">${esc(ins)}</pre></details>
        <label class="tit" for="ins-resp">Texto redactado por tu IA</label><textarea id="ins-resp"></textarea><div class="fila-btn" style="margin-top:8px"><button class="btn prim peq" id="ins-ok">Usar este texto en el borrador</button></div></div>`;
      $('#ins-ok').onclick = () => { const v = $('#ins-resp').value.trim(); if (!v) return; est.borradores[clave] = v; ctx.guardar(); ctx.registrar(ctx.rolN(), `${a.doc_id} · borrador redactado con IA externa (modo manual)`); vSalidas(ctx, a.id); };
    }
  });
  raiz.querySelectorAll('[data-her]').forEach(b => b.onclick = () => usarHerramienta(b.dataset.her, leerEditor(ed), c, vencido));
  const em = $('#sal-emitir');
  if (em) em.onclick = () => {
    const r = pintarAvisos();
    if (!r.ok && !confirm('El documento tiene avisos sin resolver. ¿Registrar la emisión de todos modos?')) return;
    est.emitidas[a.id] = { tipo: S.tipo, fecha: est.hoy, quien: ctx.rolN(), fuera_de_plazo: vencido };
    ctx.registrar(ctx.rolN(), `${a.doc_id} · ${TIPOS[S.tipo].toLowerCase()} emitida${vencido ? ' fuera de plazo' : ''}${r.ok ? '' : ' con avisos sin resolver'}`, { tipo: 'emitido', alerta: a.id });
    vSalidas(ctx, a.id);
  };
  const an = ctx.puede('emitir') ? $('#sal-anular') : ($('#sal-anular')?.remove(), null); if (an) an.onclick = () => { delete est.emitidas[a.id]; ctx.registrar(ctx.rolN(), `${a.doc_id} · registro de emisión anulado`, { tipo: 'corregido', alerta: a.id }); vSalidas(ctx, a.id); };
}

async function usarHerramienta(k, texto, c, vencido) {
  const out = $('#sal-her'), h = HERRAMIENTAS[k];
  const caja = (titulo, cuerpo, nota, chip = '') => `<div class="panel her-res"><div class="plazo-cab"><h3>${esc(titulo)} ${chip}</h3><button class="btn peq" id="her-copiar">Copiar</button></div><pre class="crudo" id="her-txt">${esc(cuerpo)}</pre><p class="origen">${esc(nota)}</p></div>`;
  const copiar = () => { const b = $('#her-copiar'); if (b) b.onclick = async () => { try { await navigator.clipboard.writeText($('#her-txt').textContent); b.textContent = 'Copiado'; } catch { b.textContent = 'Selecciona y copia con Ctrl+C'; } }; };
  if (IA.modoIA() === 'demo') {
    if (k === 'resumir') out.innerHTML = caja(h.titulo, `• Cambio: ${c.cambio} (${c.ubicacion}).\n• Partida afectada: ${c.partida}.\n• Notificar según la cláusula ${c.clausula} hasta el ${c.fecha_limite}.`, 'Resumen armado por la app con los datos confirmados (modo demostración, sin IA).', '<span class="chip-ia basico">Sin IA · armado por la app</span>');
    else if (k === 'revisar') { const r = revisar(texto, c, vencido); out.innerHTML = caja(h.titulo, r.av.length ? r.av.map(x => `• ${x.t}`).join('\n') : 'Sin observaciones: la cita, la fecha límite y las cifras coinciden con los datos confirmados.', 'Revisión automática de la app (modo demostración, sin IA). Con IA en vivo o el modo manual, la IA revisa además la redacción.', '<span class="chip-ia basico">Sin IA · armado por la app</span>'); }
    else out.innerHTML = `<div class="aviso info">En modo demostración no hay una traducción registrada para este texto. Elige «IA registrada», «Mi propia clave API» o «Manual» en <a href="#ajustes">Ajustes</a> para traducirlo.</div>`;
    copiar(); return;
  }
  out.innerHTML = `<p class="estado-ia"><span class="spin"></span>${esc(h.titulo)}…</p>`;
  try {
    const r = await IA.herramienta(k, texto);
    if (r.manual) {
      out.innerHTML = `<div class="panel manual"><span class="rotulo-demo" style="color:var(--azul-2);border-color:var(--azul-2)">IA: manual</span><h3>${esc(h.titulo)}</h3><p class="pista-txt">Copia la instrucción, pégala en el asistente de IA que prefieras y pega aquí su respuesta.</p>
        <div class="fila-btn"><button class="btn peq" id="hm-copiar">Copiar instrucción</button></div><details class="tec"><summary>Ver instrucción completa</summary><pre class="crudo">${esc(r.prompt)}</pre></details>
        <label class="tit" for="hm-resp">Respuesta</label><textarea id="hm-resp"></textarea><div class="fila-btn" style="margin-top:8px"><button class="btn prim peq" id="hm-ok">Mostrar respuesta</button></div></div>`;
      $('#hm-copiar').onclick = async () => { try { await navigator.clipboard.writeText(r.prompt); $('#hm-copiar').textContent = 'Instrucción copiada'; } catch { $('#hm-copiar').textContent = 'No se pudo copiar: ábrela abajo'; } };
      $('#hm-ok').onclick = () => { const t = $('#hm-resp').value.trim(); if (!t) return; out.innerHTML = caja(h.titulo, t, 'Respuesta pegada en modo manual. Revísala antes de usarla: la app no verifica este texto.', IA.chipIA('manual')); copiar(); };
      return;
    }
    out.innerHTML = caja(h.titulo, r.texto, `${r.origen.replace(', pasada por el validador de citas', '')}. Revísala antes de usarla: la app no verifica este texto.`, IA.chipIA('vivo')); copiar();
  } catch (e) { out.innerHTML = `<div class="aviso mal">${esc(e.message)} <a href="#ajustes">Abrir Ajustes de IA</a></div>`; }
}
