// Reloj Contractual · interfaz v2 (Hito 3). La lógica es la del MVP (nucleo.js, sin cambios):
// el modelo lee y propone, la fórmula cuenta, la persona decide.
import * as N from './nucleo.js';
import * as IA from './ia.js';
import { vComparar } from './comparador.js';
import { vSalidas } from './salidas.js';
import * as AUD from './auditoria.js';
import { casosDePrueba } from './pruebas.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const fCorta = iso => { const [, m, d] = iso.split('-'); return `${Number(d)} ${MESES[Number(m) - 1]}`; };
const pct = x => (x * 100).toFixed(1).replace('.', ',').replace(',0', '') + ' %';

// ---------- datos ----------
const [docs, proyecto, reg, cifras] = await Promise.all(
  ['data/documentos.json', 'data/proyecto.json', 'data/registrado.json', 'data/cifras.json'].map(u => fetch(u).then(r => r.json())));
const docPorId = Object.fromEntries(docs.map(d => [d.doc_id, d]));
const partidaPorCod = Object.fromEntries(proyecto.partidas.map(p => [p.codigo, p]));
const clausula143 = reg.clausulas.find(c => c.clausula === '14.3');

// ---------- proyectos y parámetros de plazo (por proyecto; editables, guardados en este navegador) ----------
const PROYECTOS = [
  { id: 'R1', nombre: 'Edificio multifamiliar R1', desc: proyecto.proyecto.descripcion, demo: false, fuente: `Cláusula ${clausula143.clausula} del contrato R1, validada por administración contractual`,
    base: { ...proyecto.contrato.referencia_validacion }, feriados: [...proyecto.feriados], cde: { tipo: 'Carpeta local', ruta: '/R1/Revisiones', demo: true } },
  { id: 'C2', nombre: 'Centro comercial C2', desc: 'Proyecto de demostración · contrato con plazo en días hábiles', demo: true, fuente: 'Parámetro de demostración',
    base: { clausula: '12.4', gatillo: 'recepcion', plazo: 5, tipo_dias: 'habiles', consecuencia: 'Caducidad del derecho a reclamar la variación' }, feriados: [...proyecto.feriados], cde: { tipo: 'Google Drive', ruta: '/C2/Revisiones', demo: true } },
  { id: 'H3', nombre: 'Clínica H3', desc: 'Proyecto de demostración · contrato con plazo largo en días calendario', demo: true, fuente: 'Parámetro de demostración',
    base: { clausula: '20.1', gatillo: 'recepcion', plazo: 15, tipo_dias: 'calendario', consecuencia: 'Renuncia al reclamo correspondiente' }, feriados: [...proyecto.feriados], cde: { tipo: 'Autodesk Construction Cloud', ruta: 'H3 › Planos › Vigentes', demo: true } },
];
const PROY = Object.fromEntries(PROYECTOS.map(p => [p.id, p]));
let ajustesProy = {};
try { ajustesProy = JSON.parse(localStorage.getItem('rc-proyectos') || '{}'); } catch { }
const paramsProy = id => ({ ...PROY[id].base, ...(ajustesProy[id]?.params || {}) });
const feriadosProy = id => ajustesProy[id]?.feriados || PROY[id].feriados;
const P = a => paramsProy(a?.proyecto || 'R1');
const FER = a => feriadosProy(a?.proyecto || 'R1');
const PARAMS_R1 = () => paramsProy('R1');
function guardarProy(id, cambios) { ajustesProy[id] = { ...(ajustesProy[id] || {}), ...cambios }; try { localStorage.setItem('rc-proyectos', JSON.stringify(ajustesProy)); } catch { } recalcular(); }
let recepcionCorr = {};
try { recepcionCorr = JSON.parse(localStorage.getItem('rc-recepcion') || '{}'); } catch { }
const REF = cifras.casos_referencia.entender_sin_asistente_dias; // 2–4 días (n = 2, casos observados)
const LAT_MIN = cifras.corpus_base.v1_1.latencia_mediana_min;   // minutos de detección medidos

const alertas = reg.hechos.map(h => {
  const v = reg.vinculos[h.id] || {};
  const d = docPorId[h.doc_id];
  return { ...h, ...v, partida_modelo: v.partida ?? null, proyecto: 'R1', fecha_recepcion: d.fecha_recepcion, doc: d };
});
const alertaPorId = Object.fromEntries(alertas.map(a => [a.id, a]));
// Alertas creadas en «Comparar revisiones»: se guardan en este navegador.
let nuevas = [];
try { nuevas = JSON.parse(localStorage.getItem('rc-nuevas') || '[]'); } catch { }
function incorporar(doc, filas) {
  docPorId[doc.doc_id] = doc;
  return filas.map(f => { const a = { ...f, partida_modelo: f.partida ?? null, proyecto: doc.proyecto || 'R1', fecha_recepcion: doc.fecha_recepcion, doc, origen: 'comparador' }; alertas.push(a); alertaPorId[a.id] = a; recalcular1(a); return a; });
}
// La fórmula del núcleo calcula cada fecha límite con los parámetros del proyecto; nunca la IA.
function recalcular1(a) { a.fecha_recepcion = recepcionCorr[a.id] || a.doc.fecha_recepcion; a.limite = N.fechaLimite(a.fecha_recepcion, P(a), FER(a)); }
function recalcular() { alertas.forEach(recalcular1); }
recalcular();
nuevas.forEach(n => incorporar(n.doc, n.filas));
function crearAlertas(doc, hechos) {
  doc = { ...doc, proyecto: est.proyecto };
  // Reemplaza las alertas anteriores del mismo documento comparado.
  for (let k = alertas.length - 1; k >= 0; k--) if (alertas[k].origen === 'comparador' && alertas[k].doc_id === doc.doc_id) { delete alertaPorId[alertas[k].id]; alertas.splice(k, 1); }
  nuevas = nuevas.filter(n => n.doc.doc_id !== doc.doc_id);
  const sig = 1 + Math.max(0, ...alertas.filter(a => a.origen === 'comparador').map(a => Number(a.id.slice(5)) || 0), ...nuevas.flatMap(n => n.filas.map(f => Number(f.id.slice(5)) || 0)));
  const filas = hechos.map((h, i) => ({ ...h, id: `ALR-C${String(sig + i).padStart(3, '0')}`, confianza: h.confianza || 'Sin propuesta', criterios: h.criterios || null, partida: h.partida ?? null, partida_desc: h.partida_desc || '', sustento: h.sustento || 'Sin propuesta de partida en el modo de IA usado.' }));
  nuevas.push({ doc, filas });
  try { localStorage.setItem('rc-nuevas', JSON.stringify(nuevas)); } catch { }
  const res = incorporar(doc, filas);
  registrar('Asistente', `${doc.doc_id} · ${res.length} cambio(s) detectado(s) al comparar las revisiones ${doc.revision_anterior} y ${doc.revision}, con cita verificada`, { tipo: 'detectado', alerta: res[0]?.id });
  return res;
}
const FECHAS = docs.map(d => d.fecha_recepcion).sort();
const PRIMERA = N.sumarDias(FECHAS[0], -1), ULTIMA = N.sumarDias(FECHAS[FECHAS.length - 1], 10);

// ---------- estado (en memoria; recuerda decisiones en este navegador si se puede) ----------
const est = { hoy: '2026-10-09', proyecto: 'R1', decisiones: {}, emitidas: {}, borradores: {}, registro: [], filtro: 'pendientes', esp: 'todas', simPaso: 0, simDecision: null };
try { const pa = localStorage.getItem('rc-proyecto-activo'); if (pa && PROY[pa]) est.proyecto = pa; } catch { }
try { const g = JSON.parse(localStorage.getItem('rc-estado') || 'null'); if (g) Object.assign(est, { decisiones: g.decisiones || {}, registro: g.registro || [], emitidas: g.emitidas || {}, borradores: g.borradores || {} }); } catch { }
const guardar = () => { try { localStorage.setItem('rc-estado', JSON.stringify({ decisiones: est.decisiones, registro: est.registro, emitidas: est.emitidas, borradores: est.borradores })); } catch { } };
const registrar = (quien, que, meta = {}) => { est.registro.unshift({ t: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }), quien, que, ...meta }); guardar(); AUD.anexar({ quien, que, tipo: meta.tipo, alerta: meta.alerta, fecha_sim: est.hoy }); };

const estadoDe = a => {
  if (est.decisiones[a.id]) return 'decidido';
  return N.semaforo(N.diasRestantes(a.limite, est.hoy));
};


// ---------- utilidades visuales ----------
function diffPalabras(antes, despues) {
  const a = antes.split(/(\s+)/), b = despues.split(/(\s+)/);
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0, out = '', nube = '', quita = '';
  const flush = () => { if (quita.trim()) out += `<del class="quita">${esc(quita.trim())}</del> `; if (nube.trim()) out += `<mark class="nube">${esc(nube.trim())}</mark>${/\s$/.test(nube) ? ' ' : ''}`; nube = ''; quita = ''; };
  while (i < n && j < m) {
    if (a[i] === b[j]) { flush(); out += esc(b[j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { quita += a[i]; i++; } else { nube += b[j]; j++; }
  }
  while (i < n) quita += a[i++]; while (j < m) nube += b[j++]; flush();
  return { html: out, comun: L[0][0] / Math.max(1, Math.max(n, m)) };
}
// Compara por línea; dentro de una línea parecida marca solo las palabras que cambian.
function diffHTML(antes, despues) {
  const la = antes.split('\n'), lb = despues.split('\n'), usadas = new Set();
  return lb.map(l => {
    if (la.includes(l)) { usadas.add(la.indexOf(l)); return esc(l); }
    const clave = l.split(':')[0];
    const k = la.findIndex((x, i) => !usadas.has(i) && x.split(':')[0] === clave);
    if (k >= 0) { usadas.add(k); const d = diffPalabras(la[k], l); if (d.comun > 0.75) return d.html; }
    return `<mark class="nube">${esc(l)}</mark>`;
  }).join('\n');
}
function conCita(texto, cita) {
  const k = texto.indexOf(cita);
  if (!cita || k < 0) return esc(texto);
  return esc(texto.slice(0, k)) + `<mark class="cita">${esc(cita)}</mark>` + esc(texto.slice(k + cita.length));
}
// Barra de tiempo de un cambio: de la recepción (día 0) al límite contractual.
function barraPlazo(a, compacta = false) {
  const tot = Math.max(1, N.difDias(a.limite, a.fecha_recepcion)), hoy = N.difDias(est.hoy, a.fecha_recepcion);
  const x = d => Math.max(0, Math.min(100, d / tot * 100));
  const pp = P(a), lim = `Límite ${fCorta(a.limite)}`;
  const margenCon = tot, margenSinMin = tot - REF.max, margenSinMax = tot - REF.min;
  const hoyM = hoy >= 0 && hoy <= tot + 0 ? `<span class="pb-hoy" style="left:${x(hoy)}%"><b>Hoy</b></span>` : '';
  const aria = `Recibido el ${N.fmtFecha(a.fecha_recepcion)}; vence el ${N.fmtFecha(a.limite)} (${tot} días en el calendario). Sin asistente, entender el cambio toma ${REF.min} a ${REF.max} días según los casos de referencia.`;
  if (compacta) return `<div class="pb pb-c" role="img" aria-label="${esc(aria)}"><div class="pb-pista"><span class="pb-ref" style="width:${x(REF.max)}%"></span><span class="pb-ref2" style="left:${x(REF.min)}%;width:${x(REF.max) - x(REF.min)}%"></span><span class="pb-fin"></span>${hoyM}</div>
    <div class="pb-escala"><span>Recibido ${fCorta(a.fecha_recepcion)}</span><span>${lim}</span></div></div>`;
  const frase = margenSinMin >= 0 ? `sin asistente quedarían entre ${margenSinMin} y ${margenSinMax} días` : margenSinMax < 0 ? 'sin asistente, el plazo vencería antes de entender el cambio' : `sin asistente quedarían entre 0 y ${margenSinMax} días (o vencería antes)`;
  return `<div class="pb pb-g" role="img" aria-label="${esc(aria)}">
    <div class="pb-fila"><span class="pb-et">Para entender el cambio</span><div class="pb-pista"><span class="pb-ref" style="width:${x(REF.max)}%"><i>Sin asistente: ${REF.min}–${REF.max} días</i></span><span class="pb-ref2" style="left:${x(REF.min)}%;width:${x(REF.max) - x(REF.min)}%"></span><span class="pb-asist"><i>Con asistente: día 0</i></span>${hoyM}</div></div>
    <div class="pb-fila"><span class="pb-et">Para sustentar</span><div class="pb-pista"><span class="pb-margen" style="left:1.5%;width:98.5%"><i>Margen con asistente: ${margenCon} día${margenCon === 1 ? '' : 's'}</i></span><span class="pb-fin"></span>${hoyM.replace(/<b>Hoy<\/b>/, '')}</div></div>
    <div class="pb-escala pb-et-pad"><span>Día 0 · recibido ${fCorta(a.fecha_recepcion)}</span><span>${lim} · ${pp.plazo} días ${pp.tipo_dias === 'habiles' ? 'hábiles' : 'calendario'}</span></div>
    <p class="pb-nota">Con el asistente, el cambio se detecta el mismo día (mediana de ${String(LAT_MIN).replace('.', ',')} min por documento, medida) y quedan ${margenCon} días para sustentar; ${frase}. Referencia «sin asistente»: ${REF.min} a ${REF.max} días, casos observados (n = 2), ver <a href="#calidad">Calidad → Casos de referencia</a>. La revisión humana de una alerta todavía no se ha cronometrado.</p></div>`;
}
function diasBadge(a, cls = '') {
  const e = estadoDe(a);
  if (e === 'decidido') return `<div class="dias s-decidido ${cls}"><b>✓</b><small>${esc(est.decisiones[a.id].estado)}</small></div>`;
  const d = N.diasRestantes(a.limite, est.hoy);
  return `<div class="dias s-${e} ${cls}"><b class="num">${Math.abs(d)}</b><small>${d < 0 ? (d === -1 ? 'día vencido' : 'días vencido') : d === 0 ? 'último día' : d === 1 ? 'día queda' : 'días quedan'}</small></div>`;
}
function fraseDias(a) {
  const d = N.diasRestantes(a.limite, est.hoy);
  const pp = P(a), base = `Cláusula ${pp.clausula}: ${pp.plazo} días ${pp.tipo_dias === 'habiles' ? 'hábiles' : 'calendario'} desde la recepción (${N.fmtFecha(a.fecha_recepcion)}).`;
  if (est.decisiones[a.id]) return `Ya se decidió: ${est.decisiones[a.id].estado}. ${base}`;
  if (d < 0) return `El plazo para notificar venció el ${N.fmtFecha(a.limite)}. ${base}`;
  if (d === 0) return `Hoy es el último día para notificar. ${base}`;
  return `Notifica antes del ${N.fmtFecha(a.limite)}: te quedan ${d} día${d === 1 ? '' : 's'}. ${base}`;
}

// ---------- router ----------
const VISTAS = ['inicio', 'simulacion', 'bandeja', 'comparar', 'salidas', 'auditoria', 'calidad', 'plazos', 'resultados', 'ajustes'];
function ruta() {
  let h = location.hash.slice(1) || 'inicio';
  if (h === 'probar') h = 'comparar'; if (h === 'tablero') h = 'bandeja'; if (h === 'resultados') h = 'calidad';
  if (location.hash && location.hash.slice(1) !== h && VISTAS.includes(h)) history.replaceState(null, '', '#' + h);
  if (h.startsWith('alerta-')) return { vista: 'alerta', id: h.slice(7).toUpperCase() };
  if (h.startsWith('salidas-')) return { vista: 'salidas', id: h.slice(8).toUpperCase() };
  return { vista: VISTAS.includes(h) ? h : 'inicio' };
}
function render() {
  const r = ruta();
  document.querySelectorAll('.vista').forEach(v => v.hidden = v.id !== `v-${r.vista}`);
  document.querySelectorAll('#menu a').forEach(a => { if (a.getAttribute('href') === `#${r.vista === 'alerta' ? 'bandeja' : r.vista}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('#ruta-proy').textContent = PROY[est.proyecto].nombre;
  $('#ruta-vista').textContent = { inicio: 'Inicio', simulacion: 'Cómo funciona', bandeja: 'Bandeja de cambios', salidas: 'Documentos de salida', alerta: 'Detalle del cambio', comparar: 'Comparar revisiones', calidad: 'Calidad', auditoria: 'Auditoría', ajustes: 'Ajustes', plazos: 'Plazos y parámetros' }[r.vista];
  pintarFecha();
  ({ inicio: vInicio, simulacion: vSim, bandeja: vBandeja, salidas: () => vSalidas({ est, alertas, alertaPorId, partidaPorCod, P, PROY, registrar, guardar }, r.id), alerta: () => vAlerta(r.id), comparar: () => vComparar({ est, proyecto, partidaPorCod, crearAlertas }), calidad: () => { vCalidad(); correrPruebas(); $('#pr-correr').onclick = correrPruebas; }, auditoria: vAuditoria, ajustes: vAjustes, plazos: vPlazos })[r.vista]();
  pintarModoIA();
  ultimaVista = r;
}
let ultimaVista = null;
addEventListener('hashchange', () => { render(); scrollTo(0, 0); });

// ---------- INICIO ----------
const ICO = {
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
  cita: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12l4 4 10-10"/></svg>',
  flecha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17L17 7M9 7h8v8"/></svg>',
  reloj: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};
const primeraFrase = t => t.split(/(?<=\.)\s/)[0];
const CDE_OPS = ['Google Drive', 'Autodesk Construction Cloud', 'Notion', 'Carpeta local'];
let cdeConex = {};
try { cdeConex = JSON.parse(localStorage.getItem('rc-cde') || '{}'); } catch { }
const cdeDe = id => cdeConex[id] === null ? null : cdeConex[id] || (id === 'H3' ? null : PROY[id].cde);
const abiertasDe = id => alertas.filter(a => a.proyecto === id && a.fecha_recepcion <= est.hoy && !est.decisiones[a.id]).sort((x, y) => N.diasRestantes(x.limite, est.hoy) - N.diasRestantes(y.limite, est.hoy));
const porEmitirDe = id => alertas.filter(a => a.proyecto === id && ['confirmada', 'corregida'].includes(est.decisiones[a.id]?.estado) && !est.emitidas?.[a.id]);
function saludoHora() { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; }
const ICO_ACC = {
  comparar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M12 2v20"/></svg>',
  bandeja: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 13l2.5-7h11L20 13v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/></svg>',
  salidas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3h9l4 4v14H6z"/><path d="M9 13l2 2 4-4"/></svg>',
};
function vInicio() {
  const id = est.proyecto, pr = PROY[id], pp = paramsProy(id), cde = cdeDe(id);
  const abiertas = abiertasDe(id);
  const nuevos = abiertas.filter(a => N.difDias(est.hoy, a.fecha_recepcion) <= 1).length;
  const urg = abiertas.filter(a => ['rojo', 'ambar', 'vencido'].includes(estadoDe(a))).length;
  const emitir = porEmitirDe(id).length;
  const frase = !abiertas.length ? 'No hay cambios abiertos en este proyecto.' : `${abiertas.length} cambio${abiertas.length === 1 ? '' : 's'} abierto${abiertas.length === 1 ? '' : 's'}${urg ? `, ${urg} con el plazo por vencer` : ''}. Lo más urgente vence el ${N.fmtFecha(abiertas[0].limite)}.`;
  $('#v-inicio').innerHTML = `
    <div class="saludo anim"><div><span class="sup-id">Asistente de trazabilidad documental y contractual</span><h1>${saludoHora()}. ¿En qué proyecto trabajamos hoy?</h1>
      <p>${esc(frase)} Fecha simulada de la demostración: ${N.fmtFecha(est.hoy)}.</p></div></div>
    ${guiaVista() ? '' : `<div class="invita" id="invita-guia"><p><b>¿Primera vez?</b> Recorrido guiado de 6 pasos con la lámina de ejemplo: de la revisión nueva a la carta. <small>Unos 2 minutos.</small></p><div class="fila-btn"><button class="btn prim peq" id="guia-ini">Empezar el recorrido</button><button class="btn peq" id="guia-saltar">Saltar</button></div></div>`}
    <div class="proy-sel" role="group" aria-label="Proyecto">${PROYECTOS.map(p => { const pa = paramsProy(p.id), n = abiertasDe(p.id).length;
      return `<button class="proy-op" data-proy="${p.id}" aria-pressed="${p.id === id}"><b>${esc(p.nombre)}</b><small>${pa.plazo} días ${pa.tipo_dias === 'habiles' ? 'hábiles' : 'calendario'} para notificar · ${n} abierto${n === 1 ? '' : 's'}</small>${p.demo ? '<span class="etq ambar" style="align-self:flex-start">Demostración</span>' : '<span class="etq" style="align-self:flex-start">Corpus de prueba sintético</span>'}</button>`; }).join('')}</div>
    <div class="cde ${cde ? '' : 'off'}" id="cde"><span class="punto-cde" aria-hidden="true"></span>${cde ? `<span>Conectado a: <b>${esc(cde.tipo)}</b> · ${esc(cde.ruta)} <span class="etq ambar">demostración</span></span><button class="btn peq" id="cde-cambiar">Cambiar conexión</button>` : '<span><b>Sin conexión</b> con el entorno común de datos (CDE).</span><button class="btn peq prim" id="cde-cambiar">Conectar</button>'}
      <div class="cde-ops" id="cde-ops" hidden><span class="pista-txt" style="width:100%">Elige el CDE del proyecto. En esta versión las conexiones son de demostración: no leen archivos reales. Para comparar archivos propios, usa «Comparar revisiones».</span>${CDE_OPS.map(c => `<button class="btn peq" data-cde="${esc(c)}">${esc(c)}</button>`).join('')}${cde ? '<button class="btn peq" data-cde="">Desconectar</button>' : ''}</div></div>
    <div class="resumen-dia" role="group" aria-label="Resumen del proyecto">
      <a class="kpi nuevo" href="#bandeja" data-ir="nuevos"><b class="num">${nuevos}</b>cambios nuevos (últimas 48 h)</a>
      <a class="kpi urg" href="#bandeja" data-ir="urgentes"><b class="num">${urg}</b>urgentes: vencen en 3 días o menos</a>
      <a class="kpi emitir" href="#salidas"><b class="num">${emitir}</b>decididos, por emitir</a></div>
    <div class="accesos">
      <a class="acceso" href="#comparar"><span class="ico">${ICO_ACC.comparar}</span><span>Comparar revisiones<small>Detecta qué cambió entre la A y la B</small></span></a>
      <a class="acceso" href="#bandeja"><span class="ico">${ICO_ACC.bandeja}</span><span>Bandeja de cambios<small>Lo que hay que atender, por plazo</small></span></a>
      <a class="acceso" href="#salidas"><span class="ico">${ICO_ACC.salidas}</span><span>Documentos de salida<small>Cartas listas para revisar y emitir</small></span></a></div>
    <div class="inicio-grid">
      <div class="panel"><h3>Lo que vence primero</h3>${abiertas.length ? `<ul class="lista-urg">${abiertas.slice(0, 4).map(a => `<li><a href="#alerta-${a.id.toLowerCase()}">${diasBadge(a)}<div><h4>${esc(a.doc_id)} · ${esc(a.elemento)}</h4><p>${esc(primeraFrase(a.cambio))}</p><p>${a.partida ? `Partida ${esc(a.partida)}` : 'Sin partida en el presupuesto'} · notificar hasta el ${fCorta(a.limite)}</p></div></a></li>`).join('')}</ul>${abiertas.length > 4 ? `<p class="pista-txt" style="margin-top:10px"><a href="#bandeja">Ver los ${abiertas.length} en la bandeja</a></p>` : ''}`
        : `<p class="vacio">Sin cambios abiertos en ${esc(pr.nombre)}. Compara dos revisiones para empezar: los cambios que confirmes llegan aquí con su plazo.</p><a class="btn prim" href="#comparar">Comparar revisiones</a>`}</div>
      <div class="panel"><h3>Plazo restante de los cambios abiertos</h3><p class="pista-txt" style="margin:2px 0 12px">Cláusula ${esc(pp.clausula)}: ${pp.plazo} días ${pp.tipo_dias === 'habiles' ? 'hábiles' : 'calendario'} desde la recepción. <a href="#plazos">Cambiar</a></p>${miniPlazos(abiertas)}</div>
    </div>
    ${id === 'R1' ? casosR1() : ''}`;
  document.querySelectorAll('[data-proy]').forEach(b => b.onclick = () => { est.proyecto = b.dataset.proy; guardarActivo(); est.bproy = est.proyecto; vInicio(); pintarFecha(); });
  document.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => { est.filtro = b.dataset.ir; est.bproy = id; });
  $('#cde-cambiar').onclick = () => { $('#cde-ops').hidden = !$('#cde-ops').hidden; };
  document.querySelectorAll('[data-cde]').forEach(b => b.onclick = () => { const t = b.dataset.cde; cdeConex[id] = t ? { tipo: t, ruta: `/${id}/Revisiones`, demo: true } : null; try { localStorage.setItem('rc-cde', JSON.stringify(cdeConex)); } catch { } registrar('Oficina técnica', `${pr.nombre} · ${t ? `CDE conectado: ${t} (demostración)` : 'CDE desconectado'}`, { tipo: 'parametro' }); vInicio(); });
  const gi = $('#guia-ini'); if (gi) gi.onclick = () => iniciarGuia();
  const gs = $('#guia-saltar'); if (gs) gs.onclick = () => { marcarGuia(); $('#invita-guia').remove(); };
}
function casosR1() {
  const casos = [['ALR-0002', 'E-204', 'Cambio dentro de una nota de lámina'], [alertas.find(a => a.doc_id === 'CT-024')?.id, 'CT-024', 'Instrucción en el cuarto párrafo de una carta'], [alertas.find(a => a.doc_id === 'RFI-155')?.id, 'RFI-155', 'Absolución de RFI sin partida en el presupuesto']];
  return `<section class="seccion-pano"><h2>Casos del proyecto de demostración</h2><p class="sub" style="margin-top:6px">Tres documentos del proyecto R1 (sintético) en los que el cambio relevante no está en el cuadro de revisiones. Cada tarjeta muestra la cita literal verificada y la partida vinculada.</p>
    <div class="casos3">${casos.map(([cid, dId, q]) => { const d = docPorId[dId], a = alertaPorId[cid];
      return `<a class="vidrio caso3" href="#alerta-${cid.toLowerCase()}"><span class="q">${esc(q)}</span><div class="frag">${conCita(d.texto.split('\n').find(l => l.includes(a.cita.slice(0, 18))) || d.texto.slice(0, 160), a.cita).replace('mark class="cita"', 'mark')}</div><span class="etq">${esc(dId)} · ${a.partida ? esc(a.partida) : 'sin partida'}</span></a>`; }).join('')}</div></section>`;
}
// Mini gráfico: un renglón por cambio abierto, ordenado por días restantes; la barra es la fracción del plazo que queda.
function miniPlazos(lista) {
  if (!lista.length) return '<p class="vacio">Sin cambios abiertos a esta fecha.</p>';
  const col = { verde: 'var(--verde)', ambar: 'var(--ambar)', rojo: 'var(--naranja)', vencido: 'var(--naranja)' };
  return `<ul class="mini-plazos">${lista.slice(0, 8).map(a => { const tot = Math.max(1, N.difDias(a.limite, a.fecha_recepcion)), d = N.diasRestantes(a.limite, est.hoy), e = estadoDe(a);
    return `<li><a href="#alerta-${a.id.toLowerCase()}"><span class="mp-n">${esc(a.doc_id)} · ${esc(a.elemento)}</span><span class="mp-b"><span style="width:${Math.max(2, Math.min(100, d / tot * 100))}%;background:${col[e] || 'var(--azul-2)'}"></span></span><span class="mp-d num" style="color:${col[e]}">${d < 0 ? `vencido ${-d} d` : `${d} d`}</span></a></li>`; }).join('')}</ul>
    ${lista.length > 8 ? `<p class="pista-txt" style="margin-top:6px">y ${lista.length - 8} más en la <a href="#bandeja">bandeja</a>.</p>` : ''}`;
}
// ---------- SIMULACIÓN ----------
const SIM_ALERTA = 'ALR-0002';
const PASOS = ['Llega el documento', 'La IA compara', 'La app verifica la cita', 'Se propone la partida', 'Se calcula el plazo', 'Tú decides', 'Carta y registro'];
function vSim() {
  const a = alertaPorId[SIM_ALERTA], d = a.doc, p = est.simPaso;
  $('#v-simulacion').innerHTML = `
    <div class="tab-cab"><div><h2>Cómo funciona, con un caso real del proyecto</h2><p class="sub" style="color:var(--texto-2)">La lámina E-204 rev. C llega al CDE. Sigue los 7 pasos; en cada uno puedes abrir el detalle técnico.</p></div></div>
    <div class="sim">
      <ol class="pasos">${PASOS.map((t, i) => `<li><button data-n="${i + 1}" data-paso="${i}" ${i === p ? 'aria-current="step"' : ''} class="${i < p ? 'hecho' : ''}">${t}</button></li>`).join('')}</ol>
      <div class="escena" id="escena"></div>
    </div>`;
  document.querySelectorAll('[data-paso]').forEach(b => b.onclick = () => { est.simPaso = Number(b.dataset.paso); vSim(); });
  const E = $('#escena');
  const pie = `<div class="escena-pie"><button class="btn" id="s-ant" ${p === 0 ? 'disabled' : ''}>Paso anterior</button>${p < 6 ? `<button class="btn prim" id="s-sig">Siguiente: ${PASOS[p + 1]}</button>` : `<a class="btn prim" href="#bandeja">Ver todos los cambios en la bandeja</a>`}</div>`;
  const filaI1 = `${a.doc_id} | 1 | ${a.cambio} | ${a.ubicacion} | ${a.especialidad} | ${a.elemento} | ${a.cita}`;
  const escenas = [
    () => `<span class="quien">Control documentario</span><h2>Llega la lámina E-204, revisión C</h2>
      <p class="explica">Se registra en el CDE el ${N.fmtFecha(d.fecha_recepcion)}. En ese momento empieza a correr el plazo para notificar, aunque nadie haya abierto todavía el plano. El cuadro de revisiones dice «${esc(d.texto.split('\n')[0].replace('CUADRO DE REVISIONES: ', ''))}», que suena a algo menor.</p>
      <div class="dos"><div class="doc"><div class="cab"><span>Revisión ${esc(d.revision_anterior)} (anterior)</span></div>${esc(d.texto_anterior)}</div><div class="doc"><div class="cab"><span>Revisión ${esc(d.revision)} (nueva)</span><span>${N.fmtFecha(d.fecha_recepcion)}</span></div>${esc(d.texto)}</div></div>
      <details class="tec"><summary>Detalle técnico</summary><p>La ingesta valida que exista la revisión anterior y la fecha de recepción. En el corpus, 2 de 50 documentos se rechazan aquí porque no tienen revisión anterior: sin ella no hay nada que comparar.</p></details>`,
    () => `<span class="quien">Modelo de lenguaje</span><h2>La IA compara las dos revisiones</h2>
      <p class="explica">Recibe la revisión anterior, la nueva y una instrucción con formato fijo. Debe describir cada cambio que afecte costo, plazo o alcance y copiar literalmente el fragmento que lo sustenta.</p>
      <div class="dos"><div class="doc"><div class="cab"><span>Lo que cambió, marcado con nube de revisión</span></div>${diffHTML(d.texto_anterior, d.texto)}</div>
      <div><div class="salida" id="s-salida" aria-live="polite"></div><dl class="campos" id="s-campos"></dl><div class="fila-btn" style="margin-top:10px"><button class="btn peq" id="s-repro">Ver la respuesta registrada</button>${IA.modoIA() === 'servidor' ? '<button class="btn peq prim" id="s-vivo">Procesar con Gemini en vivo</button>' : ''}</div></div></div>
      <details class="tec"><summary>Ver instrucción enviada a la IA</summary><pre>${esc(IA.I1())}</pre><p>Respuesta registrada en la medición:</p><pre>${esc(filaI1)}</pre></details>`,
    () => `<span class="quien">Validador de la app</span><h2>La app comprueba que la cita exista</h2>
      <p class="explica">Busca, letra por letra, el fragmento que citó la IA dentro del documento. Si no lo encuentra, la alerta se rechaza: así una respuesta inventada no llega a la bandeja.</p>
      <div class="doc"><div class="cab"><span>E-204 rev. C · cita encontrada</span></div>${conCita(d.texto, a.cita)}</div>
      <div class="check"><span class="ico si">✓</span><div><b>Cita verificada.</b> «${esc(a.cita)}» aparece tal cual en la revisión C.</div></div>
      <div class="fila-btn"><button class="btn peq" id="s-inventa">Probar con una cita inventada</button></div><div id="s-inventa-r" aria-live="polite"></div>
      <details class="tec"><summary>Detalle técnico</summary><p>Es la misma función de validación usada en las mediciones. Las filas sin cita, con cita inexistente o fuera de formato se rechazan. En las mediciones, el 100 % de las alertas tuvo una cita verificable.</p></details>`,
    () => `<span class="quien">Modelo de lenguaje + regla de la app</span><h2>Se propone la partida afectada</h2>
      <p class="explica">La IA busca en el presupuesto la partida que corresponde al cambio. La app no confía en la etiqueta de confianza del modelo: la recalcula con cuatro criterios.</p>
      <div class="panel"><p class="partida"><code>${esc(a.partida)}</code> ${esc(a.partida_desc)} <span class="conf ${a.confianza}">Confianza ${a.confianza}</span></p>
      <div class="criterios">${['Mismo tipo de elemento', 'Misma especialidad', 'Ubicación compatible', 'Rango o unidad compatible'].map((t, i) => `<div class="check"><span class="ico ${a.criterios[i] ? 'si' : 'no'}">${a.criterios[i] ? '✓' : '✗'}</span>${t}</div>`).join('')}</div>
      <p style="font-size:.92rem;color:var(--texto-2)">${esc(a.sustento)}</p></div>
      <div class="aviso info" style="margin-top:12px">La placa pasa de 2,80 a 3,20 m, así que sale de la partida «${esc(partidaPorCod['03.02.04'].desc)}» y entra en la de más de 3 m. Ese es justo el detalle que se pierde cuando el cuadro de revisiones dice «se corrige una cota».</div>
      <details class="tec"><summary>Detalle técnico: regla de confianza</summary><p>4 de 4 criterios: confianza Alta · 3: Media · 2 o menos: Baja, con partida alternativa obligatoria.</p></details>`,
    () => simPlazo(a),
    () => `<span class="quien">Oficina técnica</span><h2>Tú decides qué hacer con la alerta</h2>
      <p class="explica">Nada sale del sistema sin una persona. Elige una opción: si corriges la partida, la app guarda también lo que propuso la IA, para medir sus errores.</p>
      <div class="panel"><p><b>${esc(a.elemento)}</b>: ${esc(a.cambio)}</p><p class="partida" style="margin-top:8px">Partida propuesta: <code>${esc(a.partida)}</code> ${esc(a.partida_desc)}</p>
      <div class="acciones"><button class="btn prim" data-dec="confirmada">Confirmar</button><button class="btn" data-dec="corregida">Corregir partida</button><button class="btn" data-dec="descartada">Descartar</button></div>
      <div id="s-corr" hidden style="margin-top:10px"><label class="tit" for="s-corr-sel">Partida correcta</label><select id="s-corr-sel">${proyecto.partidas.filter(x => x.esp === 'Estructuras').map(x => `<option value="${x.codigo}" ${x.codigo === a.partida ? 'selected' : ''}>${x.codigo} ${esc(x.desc)}</option>`).join('')}</select> <button class="btn peq prim" id="s-corr-ok">Guardar corrección</button></div>
      <div id="s-dec-r" aria-live="polite" style="margin-top:12px">${est.simDecision ? `<div class="aviso ok">Decisión registrada: ${esc(est.simDecision)}.</div>` : ''}</div></div>`,
    () => simCarta(a),
  ];
  E.innerHTML = escenas[p]() + pie;
  $('#s-ant').onclick = () => { est.simPaso--; vSim(); };
  const sig = $('#s-sig'); if (sig) sig.onclick = () => { est.simPaso++; vSim(); };
  if (p === 1) {
    const S = $('#s-salida');
    const campos = () => { $('#s-campos').innerHTML = [['Elemento', a.elemento], ['Ubicación', a.ubicacion], ['Especialidad', a.especialidad], ['Cita literal', '«' + a.cita + '»']].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join(''); };
    const escribir = () => { $('#s-campos').innerHTML = ''; const txt = 'Cambio: ' + a.cambio; if (reducido) { S.textContent = txt; campos(); return; } let k = 0; const t = setInterval(() => { k += 5; S.textContent = txt.slice(0, k); if (k >= txt.length) { clearInterval(t); campos(); } }, 16); };
    escribir(); $('#s-repro').onclick = escribir;
    const v = $('#s-vivo'); if (v) v.onclick = async () => {
      v.disabled = true; v.classList.add('cargando'); S.textContent = 'Consultando a Gemini…';
      try {
        const txt = (await IA.detectar(d)).texto; S.textContent = txt;
        const r = N.parsearI1(txt, docPorId);
        S.insertAdjacentHTML('afterend', `<div class="aviso ${r.hechos.length ? 'ok' : 'mal'}" style="margin-top:8px">${r.hechos.length ? `${r.hechos.length} cambio(s) con cita verificada.` : 'La respuesta no pasó el validador.'} ${r.rechazadas.length ? `${r.rechazadas.length} fila(s) rechazada(s): ${esc(r.rechazadas[0].motivo)}` : ''}</div>`);
      } catch (e) { S.textContent = `No se pudo consultar a la IA: ${e.message || e.codigo}. La respuesta registrada sigue disponible.`; }
      v.classList.remove('cargando'); v.disabled = false;
    };
  }
  if (p === 2) $('#s-inventa').onclick = () => {
    const falsa = `${a.doc_id} | 1 | La placa P-7 sube a 3,50 m | Eje 7 | Estructuras | Placa P-7 | La altura de la placa P-7 pasa de 2,80 a 3,50 m.`;
    const r = N.parsearI1(falsa, docPorId);
    $('#s-inventa-r').innerHTML = `<div class="check"><span class="ico no">✗</span><div><b>Rechazada.</b> ${esc(r.rechazadas[0]?.motivo)}. Fila de prueba: «La altura de la placa P-7 pasa de 2,80 a 3,50 m.»</div></div>`;
  };
  if (p === 4) wirePlazo(a);
  if (p === 5) {
    const fin = (estado, partida) => {
      est.simDecision = estado === 'corregida' ? `partida corregida a ${partida} (se conserva ${a.partida} como propuesta del modelo)` : estado;
      registrar('Oficina técnica', `E-204 · alerta ${estado}${estado === 'corregida' ? ` a ${partida}` : ''} (simulación)`);
      $('#s-dec-r').innerHTML = `<div class="aviso ok">Decisión registrada: ${esc(est.simDecision)}. Sigue al último paso.</div>`;
    };
    E.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => { if (b.dataset.dec === 'corregida') { $('#s-corr').hidden = false; return; } fin(b.dataset.dec); });
    $('#s-corr-ok').onclick = () => fin('corregida', $('#s-corr-sel').value);
  }
  if (p === 6) wireCarta(a);
}
function calendario(desde, limite, inicio, feriados, cuentaFeriado = false) {
  const f0 = N.isoAFecha(desde); const lunes = N.sumarDias(desde, -((f0.getUTCDay() + 6) % 7));
  let html = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map(x => `<div class="dn">${x}</div>`).join('');
  for (let k = 0; k < 21; k++) {
    const iso = N.sumarDias(lunes, k), dentro = iso > inicio && iso <= limite, dow = N.isoAFecha(iso).getUTCDay();
    const cls = iso === inicio ? 'inicio' : iso === limite ? 'limite' : feriados.includes(iso) && !cuentaFeriado ? 'feriado' : feriados.includes(iso) && dentro ? 'cuenta' : dentro ? 'cuenta' : (iso < inicio || iso > limite) ? 'fuera' : '';
    const etq = iso === inicio ? 'recibido' : iso === limite ? 'vence' : feriados.includes(iso) ? (cuentaFeriado ? 'feriado (cuenta)' : 'feriado') : (dentro && (dow === 0 || dow === 6) ? '' : '');
    html += `<div class="d ${cls}"><span class="num">${Number(iso.slice(8))}</span><small>${etq}</small></div>`;
  }
  return `<div class="cal" role="img" aria-label="Del ${N.fmtFecha(inicio)} al ${N.fmtFecha(limite)}">${html}</div>`;
}
let tipoSim = 'calendario';
function simPlazo(a) {
  const p = { ...PARAMS_R1(), tipo_dias: tipoSim }, lim = N.fechaLimite(a.fecha_recepcion, p, FER(a));
  return `<span class="quien">Fórmula de la app</span><h2>Se calcula la fecha límite</h2>
    <p class="explica">La IA leyó la cláusula 14.3 y administración contractual la validó una sola vez para todo el contrato. Desde entonces la fecha la calcula una fórmula, no el modelo. El plazo se ajusta en <a href="#plazos">Plazos y parámetros</a>.</p>
    <blockquote class="aviso info" style="margin:0 0 14px">«${esc(clausula143.texto_literal)}»</blockquote>
    <div class="fila-btn" role="group" aria-label="Tipo de días" style="margin-bottom:12px"><button class="btn peq ${tipoSim === 'calendario' ? 'prim' : ''}" data-tipo="calendario">${PARAMS_R1().plazo} días calendario</button><button class="btn peq ${tipoSim === 'habiles' ? 'prim' : ''}" data-tipo="habiles">${PARAMS_R1().plazo} días hábiles</button></div>
    ${calendario(a.fecha_recepcion, lim, a.fecha_recepcion, FER(a), tipoSim === 'calendario')}
    <p style="margin-top:12px;font-size:1.05rem">Recibido el <b>${N.fmtFecha(a.fecha_recepcion)}</b> + ${p.plazo} días ${tipoSim === 'habiles' ? 'hábiles (sin fines de semana ni el feriado del 8 de octubre)' : 'calendario'} = vence el <b style="color:var(--nube)">${N.fmtFecha(lim)}</b>.</p>
    <details class="tec"><summary>Detalle técnico</summary><p>Funciones <code>fechaLimite</code>, <code>sumarDias</code> y <code>sumarHabiles</code> de nucleo.js. Si la cláusula dijera «desde el conocimiento», la app usa igual la fecha de recepción (regla conservadora).</p></details>`;
}
function wirePlazo(a) { document.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => { tipoSim = b.dataset.tipo; vSim(); }); }
function cartaDe(a) {
  const dec = est.decisiones[a.id];
  const al = { ...a, cambio: a.cambio.split(/(?<=\.)\s/)[0], partida: dec?.partida ?? a.partida, partida_desc: dec?.partida ? partidaPorCod[dec.partida]?.desc : a.partida_desc };
  const campos = N.camposCarta(al, P(a), a.doc);
  const texto = N.cartaPlantilla(campos);
  const ver = N.verificarCarta(texto, campos);
  let html = esc(texto);
  Object.values(campos).filter(v => v && String(v).length > 2).sort((x, y) => String(y).length - String(x).length).forEach(v => { html = html.split(esc(String(v))).join(`<mark>${esc(String(v))}</mark>`); });
  return { html, ver };
}
function simCarta(a) {
  const { html, ver } = cartaDe(a);
  return `<span class="quien">Jefatura aprueba · gerencia emite</span><h2>Borrador de carta y registro</h2>
    <p class="explica">El borrador usa solo datos confirmados, resaltados en azul. La app revisa que cada cifra y fecha del texto venga de esos datos. La carta la firma y emite gerencia, fuera del sistema.</p>
    <div class="carta">${html}</div>
    <div class="check"><span class="ico ${ver.ok ? 'si' : 'no'}">${ver.ok ? '✓' : '✗'}</span><div>${ver.ok ? 'Control superado: todas las cifras y fechas vienen de los datos confirmados.' : `Cifras sin origen: ${esc(ver.fuera.join(', '))}`}</div></div>
    <h3 style="margin-top:18px">Registro de la simulación</h3><ul class="registro">${est.registro.slice(0, 6).map(r => `<li><time>${esc(r.t)}</time><span><b>${esc(r.quien)}:</b> ${esc(r.que)}</span></li>`).join('') || '<li><time>—</time><span>Toma una decisión en el paso 6 para verla aquí.</span></li>'}</ul>`;
}
function wireCarta() { }

// ---------- TABLERO ----------
function vBandeja() {
  const proyF = est.bproy || 'todos';
  const base = alertas.filter(a => a.fecha_recepcion <= est.hoy && (proyF === 'todos' || a.proyecto === proyF));
  const cuenta = f => base.filter(f).length;
  const filtros = { pendientes: a => estadoDe(a) !== 'decidido', nuevos: a => estadoDe(a) !== 'decidido' && N.difDias(est.hoy, a.fecha_recepcion) <= 1, vencidas: a => estadoDe(a) === 'vencido', urgentes: a => ['rojo', 'ambar', 'vencido'].includes(estadoDe(a)), decididas: a => estadoDe(a) === 'decidido', todas: () => true };
  const DIAS = { todos: () => true, 1: d => d <= 1, 3: d => d <= 3, 7: d => d <= 7 };
  const esps = [...new Set(alertas.map(a => a.especialidad))].sort();
  let lista = base.filter(filtros[est.filtro] || filtros.pendientes).filter(a => est.esp === 'todas' || a.especialidad === est.esp).filter(a => DIAS[est.bdias || 'todos'](N.diasRestantes(a.limite, est.hoy)));
  lista.sort((x, y) => (estadoDe(x) === 'decidido') - (estadoDe(y) === 'decidido') || N.diasRestantes(x.limite, est.hoy) - N.diasRestantes(y.limite, est.hoy));
  const porLlegar = alertas.filter(a => a.fecha_recepcion > est.hoy && (proyF === 'todos' || a.proyecto === proyF)).length;
  const idx = N.difDias(est.hoy, PRIMERA), max = N.difDias(ULTIMA, PRIMERA);
  $('#v-bandeja').innerHTML = `
    <div class="tab-cab"><div><h2>Bandeja de cambios</h2><p class="sub2">Cada cambio detectado, con su partida y el plazo que queda para notificarlo. Lo que vence primero va arriba.</p></div></div>
    <div class="resumen" role="group" aria-label="Filtrar por estado">
      ${[['pendientes', 'Por decidir', cuenta(filtros.pendientes), 'p-gris'], ['nuevos', 'Nuevos (48 h)', cuenta(filtros.nuevos), 'p-gris'], ['urgentes', 'Vencen en 3 días o menos', cuenta(filtros.urgentes), 'p-ambar'], ['vencidas', 'Vencidos sin decidir', cuenta(filtros.vencidas), 'p-vencido'], ['decididas', 'Decididos', cuenta(filtros.decididas), 'p-decidido'], ['todas', 'Todos', base.length, 'p-gris']].map(([k, t, n, c]) => `<button class="chip" data-f="${k}" aria-pressed="${est.filtro === k}"><span class="punto ${c}"></span>${t} <b>${n}</b></button>`).join('')}
    </div>
    <div class="filtros-b">
      <label>Proyecto<select id="f-proy"><option value="todos">Todos los proyectos</option>${PROYECTOS.map(p => `<option value="${p.id}" ${proyF === p.id ? 'selected' : ''}>${esc(p.nombre)}${p.demo ? ' (demostración)' : ''}</option>`).join('')}</select></label>
      <label>Días restantes<select id="f-dias">${[['todos', 'Cualquier plazo'], ['1', '1 día o menos'], ['3', '3 días o menos'], ['7', '7 días o menos']].map(([k, t]) => `<option value="${k}" ${(est.bdias || 'todos') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Especialidad<select id="f-esp"><option value="todas">Todas</option>${esps.map(e => `<option ${est.esp === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></label>
    </div>
    <p class="pista-txt" style="margin:-4px 0 12px">Cada barra va de la recepción al límite contractual del proyecto. El tramo rayado es lo que tarda entender un cambio sin asistente (${REF.min} a ${REF.max} días, casos de referencia).</p>
    <div class="lista">${lista.length ? lista.map(a => `<a class="alerta-fila" href="#alerta-${a.id.toLowerCase()}">
        ${diasBadge(a)}
        <div><div class="doc-id">${esc(a.doc_id)} <span>· ${esc(a.doc.titulo)}${proyF === 'todos' ? ` · ${esc(PROY[a.proyecto].nombre)}` : ''}</span></div><div class="resumen-cambio">${esc(a.cambio)}</div></div>
        <div class="partida">${a.partida ? `<code>${esc(a.partida)}</code> ${esc(a.partida_desc)}` : '<b>Sin partida en el presupuesto</b>'}<span class="conf ${a.confianza}">Confianza ${esc(String(a.confianza).toLowerCase())}</span></div>
        <div class="pista">${barraPlazo(a, true)}</div></a>`).join('') : `<div class="vacio">No hay cambios con estos filtros al ${N.fmtFecha(est.hoy)}. ${proyF !== 'todos' && !alertas.some(a => a.proyecto === proyF) ? '<a href="#comparar">Compara dos revisiones</a> para registrar cambios en este proyecto.' : 'Prueba con «Todos» o mueve la fecha simulada.'}</div>`}</div>
    <div class="hoy"><label for="hoy-r">Fecha simulada <span class="etq ambar">demostración</span></label><div><input type="range" id="hoy-r" min="0" max="${max}" value="${idx}" aria-valuetext="${N.fmtFecha(est.hoy)}"><div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--texto-2)"><span>${N.fmtFecha(PRIMERA)}</span><span>Mueve la fecha y mira cómo corren los plazos${porLlegar ? ` · ${porLlegar} cambios llegan después` : ''}</span><span>${N.fmtFecha(ULTIMA)}</span></div></div><div class="fecha num" id="hoy-f">${N.fmtFecha(est.hoy)}</div></div>
    <section class="seccion"><h3>Registro de decisiones</h3><p style="color:var(--texto-2);font-size:.9rem;margin:4px 0 10px">Cada decisión queda anotada con quién la tomó. En esta demostración el registro se guarda en este navegador.</p>
    <div class="panel"><ul class="registro">${est.registro.slice(0, 10).map(r => `<li><time>${esc(r.t)}</time><span><b>${esc(r.quien)}:</b> ${esc(r.que)}</span></li>`).join('') || '<li><time>—</time><span>Todavía no hay decisiones. Abre un cambio y confírmalo, corrígelo o descártalo.</span></li>'}</ul></div></section>`;
  const r = $('#hoy-r');
  r.oninput = () => { est.hoy = N.sumarDias(PRIMERA, Number(r.value)); vBandeja(); pintarFecha(); $('#hoy-r').focus(); };
  document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { est.filtro = b.dataset.f; vBandeja(); });
  $('#f-esp').onchange = e => { est.esp = e.target.value; vBandeja(); };
  $('#f-proy').onchange = e => { est.bproy = e.target.value; vBandeja(); };
  $('#f-dias').onchange = e => { est.bdias = e.target.value; vBandeja(); };
}

// ---------- DETALLE ----------
function vAlerta(id) {
  const a = alertaPorId[id];
  if (!a) { $('#v-alerta').innerHTML = `<p class="vacio">No existe el cambio ${esc(id)}. <a href="#bandeja">Volver a la bandeja</a></p>`; return; }
  const d = a.doc, dec = est.decisiones[a.id], e = estadoDe(a);
  const cuerpoNuevo = d.tipo === 'Lámina' ? conCita(d.texto, a.cita) : conCita(d.texto, a.cita);
  $('#v-alerta').innerHTML = `
    <a class="volver" href="#bandeja">← Bandeja de cambios</a>
    <div class="det-cab">${diasBadge(a)}<div><h2>${esc(a.doc_id)} rev. ${esc(d.revision)} · ${esc(a.elemento)}</h2><p class="frase">${esc(fraseDias(a))}</p></div></div>
    <div class="panel plazo-panel"><div class="plazo-cab"><h3>Plazo contractual</h3><span class="pista-txt">${esc(PROY[a.proyecto].nombre)} · <a href="#plazos">parámetros</a></span></div>${barraPlazo(a)}
      <div class="fecha-rec"><label class="tit" for="d-rec">Fecha de recepción en el CDE</label><input type="date" id="d-rec" value="${a.fecha_recepcion}"><button class="btn peq" id="d-rec-ok">Corregir fecha</button>${recepcionCorr[a.id] ? `<button class="btn peq" id="d-rec-reset">Volver a ${N.fmtFecha(d.fecha_recepcion)}</button><span class="pista-txt">Corregida a mano; el documento registra ${N.fmtFecha(d.fecha_recepcion)}.</span>` : ''}</div></div>
    <div class="det-cuerpo">
      <div>
        <div class="panel"><h3>${d.tipo === 'Lámina' ? 'Qué cambió entre revisiones' : 'Qué dice el documento'}</h3>
          ${d.tipo === 'Lámina' ? `<div class="dos"><div class="doc"><div class="cab"><span>Rev. ${esc(d.revision_anterior)}</span></div>${esc(d.texto_anterior)}</div><div class="doc"><div class="cab"><span>Rev. ${esc(d.revision)} · cambios en nube</span><span>${N.fmtFecha(d.fecha_recepcion)}</span></div>${diffHTML(d.texto_anterior, d.texto)}</div></div>`
          : `${d.texto_anterior ? `<div class="doc" style="margin-bottom:10px"><div class="cab"><span>${esc(d.revision_anterior)}</span></div>${esc(d.texto_anterior)}</div>` : ''}<div class="doc"><div class="cab"><span>${esc(d.tipo)} · ${esc(d.emisor)}</span><span>${N.fmtFecha(d.fecha_recepcion)}</span></div>${cuerpoNuevo}</div>`}
          <div class="check"><span class="ico si">✓</span><div><b>Cita verificada en el documento:</b> «${esc(a.cita)}»</div></div>
        </div>
        <div class="panel"><h3>Registro de esta alerta</h3><ul class="registro">${est.registro.filter(r => r.que.includes(a.doc_id)).map(r => `<li><time>${esc(r.t)}</time><span><b>${esc(r.quien)}:</b> ${esc(r.que)}</span></li>`).join('') || `<li><time>${N.fmtFecha(d.fecha_recepcion)}</time><span><b>Sistema:</b> alerta generada por la IA (detección y vínculo a partida) con cita verificada.</span></li>`}</ul></div>
      </div>
      <div>
        <div class="panel"><h3>${dec ? 'Decisión tomada' : 'Tu decisión'}</h3>
          ${dec ? `<div class="aviso ok">Alerta ${esc(dec.estado)}${dec.partida && dec.partida !== a.partida ? `: partida ${esc(dec.partida)} (la IA propuso ${esc(a.partida)})` : ''}.</div><div class="acciones">${dec.estado !== 'descartada' ? `<a class="btn prim" id="d-carta" href="#salidas-${a.id.toLowerCase()}">Redactar carta, acta o informe</a>` : ''}<button class="btn" id="d-deshacer">Deshacer</button></div>`
          : `<div class="acciones"><button class="btn prim" data-d="confirmada">Confirmar</button><button class="btn" data-d="corregida">Corregir partida</button><button class="btn" data-d="descartada">Descartar</button></div>
            <div id="d-corr" hidden style="margin-top:10px"><label class="tit" for="d-sel">Partida correcta</label><select id="d-sel" style="max-width:100%">${proyecto.partidas.map(x => `<option value="${x.codigo}" ${x.codigo === a.partida ? 'selected' : ''}>${x.codigo} ${esc(x.desc)}</option>`).join('')}</select> <button class="btn peq prim" id="d-corr-ok">Guardar corrección</button></div>`}
          <div id="d-carta-box"></div>
        </div>
        <div class="panel"><h3>Lo que propone la IA</h3><p>${esc(a.cambio)}</p><p style="font-size:.88rem;color:var(--texto-2);margin-top:6px">Ubicación: ${esc(a.ubicacion)}</p></div>
        <div class="panel"><h3>Partida del presupuesto</h3>
          <p class="partida">${a.partida ? `<code>${esc(a.partida)}</code> ${esc(a.partida_desc)}` : '<b>Sin partida en el presupuesto contractual</b>'} <span class="conf ${a.confianza}">Confianza ${a.confianza}</span></p>
          ${a.criterios ? `<div class="criterios">${['Mismo elemento', 'Misma especialidad', 'Ubicación compatible', 'Rango o unidad'].map((t, i) => `<div class="check"><span class="ico ${a.criterios[i] ? 'si' : 'no'}">${a.criterios[i] ? '✓' : '✗'}</span>${t}</div>`).join('')}</div>` : ''}
          ${a.alternativa ? `<p style="font-size:.88rem">Alternativa: <code>${esc(a.alternativa)}</code> ${esc(a.alternativa_desc)}</p>` : ''}
          <details class="tec"><summary>Por qué esta partida</summary><p>${esc(a.sustento)}</p></details>
        </div>
      </div>
    </div>`;
  const decidir = (estado, partida) => { est.decisiones[a.id] = { estado, partida: partida ?? a.partida }; registrar('Oficina técnica', `${a.doc_id} · cambio ${({ confirmada: 'confirmado', corregida: 'corregido', descartada: 'descartado' })[estado]}${estado === 'corregida' ? `: partida ${partida} (la IA propuso ${a.partida || 'ninguna'})` : ''}`, { tipo: estado === 'corregida' ? 'corregido' : 'revisado', alerta: a.id }); vAlerta(id); };
  document.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { if (b.dataset.d === 'corregida') { $('#d-corr').hidden = false; $('#d-sel').focus(); return; } decidir(b.dataset.d); });
  const ok = $('#d-corr-ok'); if (ok) ok.onclick = () => decidir('corregida', $('#d-sel').value);
  const des = $('#d-deshacer'); if (des) des.onclick = () => { delete est.decisiones[a.id]; registrar('Oficina técnica', `${a.doc_id} · decisión deshecha`, { tipo: 'corregido', alerta: a.id }); vAlerta(id); };
  const fijarRec = v => { if (v) recepcionCorr[a.id] = v; else delete recepcionCorr[a.id]; try { localStorage.setItem('rc-recepcion', JSON.stringify(recepcionCorr)); } catch { } recalcular1(a); registrar('Oficina técnica', `${a.doc_id} · fecha de recepción ${v ? `corregida a ${N.fmtFecha(v)}` : 'restablecida'}`, { tipo: 'corregido', alerta: a.id }); vAlerta(id); pintarFecha(); };
  $('#d-rec-ok').onclick = () => { const v = $('#d-rec').value; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return; fijarRec(v === d.fecha_recepcion ? null : v); };
  const rr = $('#d-rec-reset'); if (rr) rr.onclick = () => fijarRec(null);
}

// ---------- RESULTADOS ----------
function vCalidad() {
  const b = cifras.corpus_base, pn = cifras.prueba_nueva, s = cifras.linea_base_sin_ia;
  const series = [
    { n: 'Con IA · corpus base (instrucción vigente)', c: 'var(--plano)', v: [b.v1_1.cobertura, b.v1_1.precision, b.v1_1.vinculacion] },
    { n: 'Con IA · documentos nuevos (medición más baja)', c: 'var(--tinta)', v: [pn.corrida_1.cobertura, pn.corrida_1.precision, pn.corrida_1.vinculacion] },
    { n: 'Sin IA · comparador de texto (corpus base)', c: 'var(--linea)', v: [s.corpus_base.cobertura, s.corpus_base.precision, null] },
  ];
  const umbral = [0.8, 0.7, 0.7], cats = ['Cobertura', 'Precisión', 'Vinculación a partida'];
  const W = 600, H = 300, x0 = 46, y = v => 250 - v * 210, gw = (W - x0 - 10) / 3, bw = 40;
  let svg = [0, .25, .5, .75, 1].map(t => `<line x1="${x0}" x2="${W}" y1="${y(t)}" y2="${y(t)}" stroke="var(--linea)" stroke-width="${t ? 1 : 1.5}"/><text x="${x0 - 8}" y="${y(t) + 4}" text-anchor="end">${t * 100} %</text>`).join('');
  cats.forEach((c, i) => {
    const cx = x0 + gw * i + gw / 2;
    series.forEach((sr, k) => { const v = sr.v[i], x = cx + (k - 1) * (bw + 6) - bw / 2;
      svg += v == null ? `<text x="${x + bw / 2}" y="${y(0) - 8}" text-anchor="middle" font-size="10">—</text>` : `<rect x="${x}" y="${y(v)}" width="${bw}" height="${y(0) - y(v)}" rx="3" fill="${sr.c}"/><text x="${x + bw / 2}" y="${y(v) - 6}" text-anchor="middle" font-size="11" style="fill:var(--texto)">${pct(v)}</text>`; });
    svg += `<line x1="${cx - 70}" x2="${cx + 70}" y1="${y(umbral[i])}" y2="${y(umbral[i])}" stroke="var(--nube)" stroke-width="2" stroke-dasharray="5 3"/><text x="${cx + 72}" y="${y(umbral[i]) + 4}" font-size="10" style="fill:var(--nube)">mín. ${umbral[i] * 100} %</text><text x="${cx}" y="276" text-anchor="middle" style="fill:var(--tinta);font-weight:700">${c}</text>`;
  });
  $('#v-calidad').innerHTML = `
    <div class="tab-cab"><div><h2>Calidad: qué tan bien funciona</h2><p style="color:var(--texto-2);max-width:48em">Medido contra respuestas correctas escritas y congeladas antes de correr la IA. Dos conjuntos: el corpus con el que se construyó el prototipo y 10 documentos nuevos que el sistema no conocía.</p></div></div>
    <div class="metricas">
      <div class="panel grafico"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cobertura, precisión y vinculación por conjunto">${svg}</svg>
        <div class="leyenda">${series.map(s => `<span><i style="background:${s.c}"></i>${esc(s.n)}</span>`).join('')}<span><i style="background:var(--nube);height:3px"></i>Umbral mínimo</span></div></div>
      <div class="panel lectura"><h3>Cómo leerlo</h3><p style="font-size:.9rem;color:var(--texto-2);margin-bottom:10px"><b>Cobertura:</b> de los cambios reales, cuántos encontró. <b>Precisión:</b> de las alertas que dio, cuántas eran cambios reales. <b>Vinculación:</b> de los cambios encontrados, en cuántos acertó la partida.</p><ul>
        <li><b>Corpus base:</b> ${b.v1_1.detectados} de ${b.v1_1.cambios_referencia} cambios detectados, sin falsas alarmas. La instrucción vigente se afinó con este corpus, por eso importa la prueba nueva.</li>
        <li><b>Documentos nuevos:</b> ${pn.corrida_1.detectados} y ${pn.corrida_2.detectados} de ${pn.cambios_referencia} en dos mediciones. En una, la IA juntó tabique y puerta del cuarto de máquinas en una sola alerta y la puerta quedó sin partida.</li>
        <li><b>Sin IA:</b> un comparador de texto encuentra ${s.corpus_base.detectados} de ${s.corpus_base.cambios} cambios, pero marca ${s.corpus_base.falsas_alarmas} líneas que no importan (rótulos, redacción), no lee cartas ni RFI y no propone partida.</li>
        <li><b>Repetibilidad:</b> con la misma entrada, la primera instrucción cambió su respuesta en ${b.docs_con_diferencias_entre_corridas.v1_0} de 40 documentos y la vigente en ${b.docs_con_diferencias_entre_corridas.v1_1}; con documentos nuevos, en 1 de 10.</li>
      </ul></div>
    </div>
    <section class="seccion"><h3>Todas las mediciones</h3><div class="panel scroll-x" style="margin-top:10px"><table class="t"><thead><tr><th>Medición</th><th>Cobertura</th><th>Precisión</th><th>Vinculación</th><th>Documentos sin cambios bien reconocidos</th></tr></thead><tbody>
      ${[['Corpus base · primera instrucción', b.v1_0], ['Corpus base · primera instrucción, repetición', b.v1_0_rep], ['Corpus base · instrucción vigente', b.v1_1], ['Corpus base · instrucción vigente, repetición', b.v1_1_rep], ['Documentos nuevos · medición 1', pn.corrida_1], ['Documentos nuevos · medición 2', pn.corrida_2]].map(([n, m]) => `<tr><td>${n}</td><td>${pct(m.cobertura)}</td><td>${pct(m.precision)}</td><td>${pct(m.vinculacion)}</td><td>${m.docs_sin_cambio_ok}</td></tr>`).join('')}
      <tr><td>Sin IA · corpus base</td><td>${pct(s.corpus_base.cobertura)}</td><td>${pct(s.corpus_base.precision)}</td><td>no vincula</td><td>—</td></tr>
      <tr><td>Sin IA · documentos nuevos</td><td>${pct(s.prueba_nueva.cobertura)}</td><td>${pct(s.prueba_nueva.precision)}</td><td>no vincula</td><td>—</td></tr></tbody></table></div>
      <p style="color:var(--texto-2);font-size:.88rem;margin-top:8px">Pruebas del plan: ${esc(cifras.pruebas_cp)} superadas en la medición (se vuelven a ejecutar abajo).</p></section>
    <section class="seccion" id="pruebas"><h3>Pruebas automatizadas</h3><p class="pista-txt" style="margin:4px 0 10px">Se ejecutan ahora, en este navegador, sobre la misma lógica que usa la app (nucleo.js). Cada una dice qué garantiza.</p>
      <div class="panel"><div class="fila-btn" style="justify-content:space-between;align-items:center;margin-bottom:8px"><b id="pr-total"></b><button class="btn peq" id="pr-correr">Ejecutar de nuevo</button></div><ul class="pruebas" id="pr-lista"></ul></div></section>
    <section class="seccion" id="casos-referencia"><h3>Casos de referencia</h3><p class="pista-txt" style="margin:4px 0 10px">${esc(cifras.casos_referencia.nota)} Fuente: ${esc(cifras.casos_referencia.fuente)}.</p>
      <div class="casos3" style="grid-template-columns:repeat(2,minmax(0,1fr))">${cifras.casos_referencia.casos.map(c => `<div class="vidrio caso3"><span class="etq">${esc(c.rol)} · plazo de ${c.plazo_dias} días</span><p style="font-size:1.05rem;margin:6px 0">Entender el cambio tomó <b>${c.entender_dias_min} a ${c.entender_dias_max} días</b>: quedaron ${c.plazo_dias - c.entender_dias_max} a ${c.plazo_dias - c.entender_dias_min} para preparar el sustento.</p></div>`).join('')}</div>
      <div class="casos3" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:12px">
      <div class="vidrio caso3"><span class="etq">Lo que dijo el residente</span><p>«Me sirve que permita comparar documentos y reconocer cambios sin tener que revisar manualmente todas las páginas.»</p><p style="font-size:.86rem;color:var(--texto-2)">Pidió: código, nombre de la partida y página donde se origina el cambio. La comparación de PDF ya indica la página.</p></div>
      <div class="vidrio caso3"><span class="etq">Lo que dijo oficina técnica</span><p>«Agregaría una alerta que indique qué cambios pueden afectar costos, metrados o partidas y cuánto plazo queda para notificarlos.»</p><p style="font-size:.86rem;color:var(--texto-2)">Es la función central: cada cambio trae la partida y los días que quedan.</p></div></div>
      <p class="pista-txt" style="margin-top:8px"><a href="#simulacion">Ver el caso E-204 paso a paso</a></p></section>
    <section class="seccion"><h3>Lo que todavía no medimos</h3><div class="panel lectura" style="margin-top:10px"><ul>
      <li>La línea base del proceso actual viene de 2 casos del equipo (2 a 4 días para entender el cambio, con plazos de 5 y 7): sirve para dimensionar, no es una estadística.</li>
      <li>La probaron 2 profesionales del equipo; falta un usuario externo y cronometrar la revisión de una alerta.</li>
      <li>Los documentos de prueba son sintéticos y en texto limpio: faltan planos DWG, PDF escaneados y ruido real.</li>
      <li>Las respuestas correctas se escribieron con apoyo de IA y sin un revisor humano independiente.</li></ul></div></section>`;
}

// Qué garantiza cada prueba, en una frase.
const GARANTIZA = {
  'CP-01': 'Un plano sin revisión anterior no se compara: se rechaza con el motivo.',
  'CP-02': 'Un cambio evidente se acepta solo si su cita está en el documento.',
  'CP-03': 'Un cambio escondido en una nota se detecta y su cita se verifica.',
  'CP-04': 'Una instrucción en medio de una carta se acepta con su cita literal.',
  'CP-05': 'Si la partida no cumple el rango, la app baja la confianza aunque la IA diga «Alta».',
  'CP-06': 'Un cambio sin partida en el presupuesto se marca «sin partida», con confianza baja.',
  'CP-07': 'El plazo en días calendario lo calcula la fórmula, no la IA.',
  'CP-08': 'El plazo en días hábiles salta fines de semana y feriados.',
  'CP-09': 'Si el contrato dice «desde el conocimiento», se cuenta desde la recepción (regla conservadora).',
  'CP-10': 'Una cita que no está en el texto se rechaza.',
  'CP-11': 'Al corregir una partida se conserva la propuesta original de la IA.',
  'CP-12': 'Una carta con una cifra que no viene de los datos confirmados se marca.',
};
function correrPruebas() {
  const cp = casosDePrueba(proyecto, docs), ok = cp.filter(c => c.ok).length;
  $('#pr-total').textContent = `${ok} de ${cp.length} pruebas superadas ahora`;
  $('#pr-lista').innerHTML = cp.map(c => `<li class="${c.ok ? 'si' : 'no'}"><span class="ico ${c.ok ? 'si' : 'no'}" aria-label="${c.ok ? 'Superada' : 'Fallida'}">${c.ok ? '✓' : '✗'}</span><div><b>${esc(GARANTIZA[c.id] || c.esc)}</b><small>${esc(c.esc)} · resultado: ${esc(c.det)}</small></div></li>`).join('');
}

// ---------- AUDITORÍA ----------
const fHora = iso => { const d = new Date(iso); return `${d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`; };
async function vAuditoria(estados = null) {
  await AUD.listo();
  const ev = [...AUD.lista()].map((e, i) => ({ ...e, i })).reverse(), alt = AUD.alterado();
  const roto = estados && estados.some(x => x !== 'ok');
  $('#v-auditoria').innerHTML = `
    <div class="tab-cab"><div><h2>Auditoría</h2><p class="sub2">Quién decidió qué y cuándo. Cada evento queda sellado con el hash SHA-256 del anterior: si alguien altera uno, la cadena se rompe desde ese punto y se nota al verificar.</p></div></div>
    <div class="aud-barra"><button class="btn prim" id="aud-verificar" ${ev.length ? '' : 'disabled'}>Verificar integridad</button>
      ${ev.length ? (alt ? '<button class="btn" id="aud-restaurar">Restaurar el evento alterado</button>' : '<button class="btn" id="aud-alterar">Alterar un evento (demostración)</button>') : ''}
      <span id="aud-res" aria-live="polite">${estados ? (roto ? `<span class="aud-mal">✗ Cadena rota en el evento ${estados.findIndex(x => x !== 'ok') + 1}: su contenido ya no coincide con el sello.</span>` : `<span class="aud-ok">✓ Cadena íntegra: ${ev.length} evento${ev.length === 1 ? '' : 's'} verificado${ev.length === 1 ? '' : 's'}.</span>`) : ''}</span></div>
    <p class="pista-txt">Datos locales de este navegador. «Alterar» cambia el texto de un evento solo en memoria, para mostrar que la verificación lo detecta.</p>
    ${ev.length ? `<ol class="linea-tiempo">${ev.map(e => { const st = estados?.[e.i], T = AUD.TIPOS[e.tipo];
      return `<li class="ev ${st && st !== 'ok' ? 'roto' : st === 'ok' ? 'sellado' : ''}"><span class="ev-punto t-${T.c}" aria-hidden="true"></span>
        <div class="ev-cuerpo"><div class="ev-cab"><span class="etq t-${T.c}">${T.t}</span><b>${esc(e.quien)}</b><time datetime="${e.ts}">${fHora(e.ts)}</time>${e.fecha_sim ? `<span class="pista-txt">fecha simulada ${N.fmtFecha(e.fecha_sim)}</span>` : ''}</div>
        <p>${esc(e.que)}${e.alerta && alertaPorId[e.alerta] ? ` · <a href="#alerta-${e.alerta.toLowerCase()}">ver cambio</a>` : ''}</p>
        <code class="hash" title="Sello: ${e.hash}">#${e.n} · sello ${e.hash.slice(0, 10)}… ← ${e.prev.slice(0, 10)}…</code>${st && st !== 'ok' ? `<span class="aud-mal">${st === 'contenido' ? '✗ Contenido alterado' : st === 'enlace' ? '✗ Enlace roto' : '✗ Arrastra la ruptura anterior'}</span>` : st === 'ok' ? '<span class="aud-ok">✓</span>' : ''}</div></li>`; }).join('')}</ol>`
      : `<div class="vacio">Todavía no hay eventos. Haz el recorrido guiado o compara dos revisiones y decide un cambio: cada paso queda aquí.<div class="fila-btn" style="justify-content:center;margin-top:10px"><button class="btn prim" id="aud-guia">Hacer el recorrido guiado</button></div></div>`}`;
  const v = $('#aud-verificar'); if (v) v.onclick = async () => { v.disabled = true; const r = await AUD.verificar(); await vAuditoria(r); };
  const al = $('#aud-alterar'); if (al) al.onclick = async () => { const evs = AUD.lista(); const k = Math.max(0, evs.findIndex(e => e.tipo === 'revisado' || e.tipo === 'emitido')); AUD.alterar(k); await vAuditoria(await AUD.verificar()); };
  const rs = $('#aud-restaurar'); if (rs) rs.onclick = async () => { AUD.restaurar(); await vAuditoria(await AUD.verificar()); };
  const g = $('#aud-guia'); if (g) g.onclick = () => iniciarGuia();
}

// ---------- PLAZOS Y PARÁMETROS ----------
function vPlazos() {
  const id = est.proyecto, pr = PROY[id], pp = paramsProy(id), fer = feriadosProy(id), mod = !!ajustesProy[id];
  const ej = N.fechaLimite(est.hoy, pp, fer);
  const abiertos = alertas.filter(a => a.proyecto === id && a.fecha_recepcion <= est.hoy && !est.decisiones[a.id]).length;
  $('#v-plazos').innerHTML = `
    <div class="tab-cab"><div><h2>Plazos y parámetros</h2><p class="sub2">Cada contrato fija su propio plazo para notificar variaciones. La fecha límite de cada cambio la calcula una fórmula con estos parámetros; la IA nunca calcula fechas.</p></div></div>
    <div class="segmento" role="tablist" aria-label="Proyecto">${PROYECTOS.map(p => `<button role="tab" aria-selected="${p.id === id}" data-proy="${p.id}">${esc(p.nombre)}${p.demo ? ' · demostración' : ''}</button>`).join('')}</div>
    <div class="plazos-grid">
      <form class="panel" id="f-plazo" onsubmit="return false">
        <h3>${esc(pr.nombre)}</h3><p class="pista-txt">${esc(pr.desc)} · Fuente del parámetro: ${esc(pr.fuente)}${mod ? ' (modificado en este navegador)' : ''}.</p>
        <div class="campos-plazo">
          <div><label class="tit" for="pz-cl">Cláusula</label><input id="pz-cl" value="${esc(pp.clausula)}" maxlength="12"></div>
          <div><label class="tit" for="pz-n">Plazo para notificar (días)</label><input id="pz-n" type="number" min="1" max="120" value="${pp.plazo}"></div>
          <fieldset class="tipo-dias"><legend class="tit">Tipo de días</legend><label><input type="radio" name="pz-t" value="calendario" ${pp.tipo_dias !== 'habiles' ? 'checked' : ''}> Calendario</label><label><input type="radio" name="pz-t" value="habiles" ${pp.tipo_dias === 'habiles' ? 'checked' : ''}> Hábiles (sin sábados, domingos ni feriados)</label></fieldset>
          <div><span class="tit">El plazo empieza</span><p style="margin:4px 0 0">Desde la recepción del documento en el CDE. Si el contrato dice «desde el conocimiento», se usa igual la recepción (regla conservadora).</p></div>
        </div>
        <div class="fila-btn" style="margin-top:14px"><button class="btn prim" id="pz-ok">Guardar y recalcular</button>${mod ? '<button class="btn" id="pz-reset">Restablecer valores del contrato</button>' : ''}</div>
        <div id="pz-msg" aria-live="polite"></div>
      </form>
      <div class="panel"><h3>Vista previa</h3><p>Un documento recibido hoy (${N.fmtFecha(est.hoy)}) vence el <b style="color:var(--naranja)">${N.fmtFecha(ej)}</b>.</p>
        ${calendario(est.hoy, ej, est.hoy, fer, pp.tipo_dias !== 'habiles')}
        <p class="pista-txt" style="margin-top:10px">${abiertos} cambio${abiertos === 1 ? '' : 's'} abierto${abiertos === 1 ? '' : 's'} de este proyecto se recalculan al guardar.</p>
        ${id === 'R1' ? `<details class="tec"><summary>Texto de la cláusula ${esc(clausula143.clausula)}</summary><blockquote class="aviso info" style="margin:8px 0 0">«${esc(clausula143.texto_literal)}»</blockquote></details>` : ''}</div>
      <div class="panel"><h3>Feriados</h3><p class="pista-txt">Se descuentan solo cuando el plazo es en días hábiles.</p>
        <ul class="feriados">${fer.map(f => `<li><span class="num">${N.fmtFecha(f)}</span><button class="btn peq" data-quita="${f}" aria-label="Quitar feriado ${N.fmtFecha(f)}">Quitar</button></li>`).join('')}</ul>
        <div class="fila-btn"><label class="sr" for="pz-f">Nuevo feriado</label><input type="date" id="pz-f"><button class="btn peq" id="pz-fadd">Agregar feriado</button></div></div>
    </div>`;
  document.querySelectorAll('[data-proy]').forEach(b => b.onclick = () => { est.proyecto = b.dataset.proy; guardarActivo(); vPlazos(); });
  $('#pz-ok').onclick = () => {
    const n = Number($('#pz-n').value), t = document.querySelector('[name="pz-t"]:checked').value, cl = $('#pz-cl').value.trim() || pp.clausula;
    if (!Number.isInteger(n) || n < 1 || n > 120) { $('#pz-msg').innerHTML = '<p class="aviso mal" style="margin-top:8px">El plazo debe ser un número entero entre 1 y 120 días.</p>'; return; }
    guardarProy(id, { params: { ...pp, plazo: n, tipo_dias: t, clausula: cl } });
    registrar('Administración contractual', `${pr.nombre} · plazo fijado en ${n} días ${t === 'habiles' ? 'hábiles' : 'calendario'} (cláusula ${cl})`, { tipo: 'parametro' });
    vPlazos(); pintarFecha(); $('#pz-msg').innerHTML = '<p class="aviso ok" style="margin-top:8px">Parámetros guardados. Todas las fechas límite y semáforos se recalcularon.</p>';
  };
  const rs = $('#pz-reset'); if (rs) rs.onclick = () => { delete ajustesProy[id]; try { localStorage.setItem('rc-proyectos', JSON.stringify(ajustesProy)); } catch { } recalcular(); registrar('Administración contractual', `${pr.nombre} · parámetros restablecidos a los del contrato`, { tipo: 'parametro' }); vPlazos(); pintarFecha(); };
  document.querySelectorAll('[data-quita]').forEach(b => b.onclick = () => { guardarProy(id, { feriados: fer.filter(f => f !== b.dataset.quita) }); vPlazos(); pintarFecha(); });
  $('#pz-fadd').onclick = () => { const v = $('#pz-f').value; if (!v || fer.includes(v)) return; guardarProy(id, { feriados: [...fer, v].sort() }); vPlazos(); pintarFecha(); };
}
function guardarActivo() { try { localStorage.setItem('rc-proyecto-activo', est.proyecto); } catch { } }

// ---------- RECORRIDO GUIADO (6 pasos, se puede saltar) ----------
const guiaVista = () => { try { return localStorage.getItem('rc-guia') === 'vista'; } catch { return false; } };
const marcarGuia = () => { try { localStorage.setItem('rc-guia', 'vista'); } catch { } };
const GUIA = [
  { t: 'Conectar', h: 'El proyecto y su entorno de datos', p: 'Elige el proyecto y su CDE (en esta demostración, las conexiones son simuladas). Cada documento nuevo que llega al CDE arranca un plazo contractual.', ir: '#inicio', foco: '#cde' },
  { t: 'Detectar', h: 'Compara la revisión A con la B', p: 'Con la lámina de ejemplo E-301 cargada, pulsa «Detectar cambios». El comparador marca cada zona que cambió sin usar IA.', ir: '#comparar', foco: '#cmp-ir' },
  { t: 'Entender', h: 'Qué cambió, dónde y con qué prueba', p: 'La IA indica qué diferencias tienen impacto y propone la partida. Cada tarjeta trae la cita literal, verificada contra el texto de la revisión B.', ir: '#comparar', foco: '#cmp-tarjetas', antes: async () => { if (!document.querySelector('#cmp-alerta')) { $('#cmp-ir')?.click(); await esperarSel('#cmp-alerta', 15000); } } },
  { t: 'Decidir', h: 'La persona decide', p: 'El cambio ya está en la bandeja con su plazo. Revisa la evidencia y pulsa «Confirmar» (o corrige la partida). Nada se emite sin esta decisión: el recorrido sigue cuando la tomes.', ir: null, foco: '.acciones',
    antes: async () => { if (location.hash.startsWith('#comparar')) { if (!document.querySelector('#cmp-alerta')) { $('#cmp-ir')?.click(); await esperarSel('#cmp-alerta', 15000); } $('#cmp-alerta')?.click(); await new Promise(r => setTimeout(r, 350)); } },
    espera: () => { const r = ruta(); return r.vista === 'alerta' && !!est.decisiones[r.id]; } },
  { t: 'Emitir', h: 'El borrador, listo para firmar', p: 'La carta usa solo datos confirmados: cita, partida y fecha límite, resaltados. Edítala, revisa los avisos, descárgala en DOCX, PDF o MD y registra la emisión cuando se firme.', ir: null, foco: '.sal-acciones',
    antes: async () => { const r = ruta(); if (r.vista === 'alerta') { location.hash = `#salidas-${r.id.toLowerCase()}`; await new Promise(x => setTimeout(x, 300)); } } },
  { t: 'Auditar', h: 'Quién decidió qué y cuándo', p: 'Cada paso quedó en una línea de tiempo sellada: detección, decisión y emisión, cada uno con el hash del anterior. Pulsa «Verificar integridad»: si alguien altera un evento, la cadena se rompe.', ir: '#auditoria', foco: '#aud-verificar' },
];
let guiaPaso = -1;
const esperarSel = (sel, ms = 8000) => new Promise(ok => { const t0 = Date.now(); const f = () => { if (document.querySelector(sel) || Date.now() - t0 > ms) ok(); else setTimeout(f, 150); }; f(); });
function iniciarGuia() { marcarGuia(); $('#invita-guia')?.remove(); guiaPaso = 0; pasoGuia(); }
function cerrarGuia() { guiaPaso = -1; $('#guia')?.remove(); document.querySelectorAll('.foco-guia').forEach(e => e.classList.remove('foco-guia')); $('#guia-abrir').focus(); }
async function pasoGuia() {
  const g = GUIA[guiaPaso];
  document.querySelectorAll('.foco-guia').forEach(e => e.classList.remove('foco-guia'));
  if (g.ir && location.hash !== g.ir) { location.hash = g.ir; await new Promise(r => setTimeout(r, 250)); }
  let caja = $('#guia');
  if (!caja) { caja = document.createElement('aside'); caja.id = 'guia'; caja.className = 'guia'; caja.setAttribute('aria-label', 'Recorrido guiado'); caja.setAttribute('aria-live', 'polite'); document.body.append(caja); }
  caja.innerHTML = `<div class="pasos-g" aria-hidden="true">${GUIA.map((_, k) => `<span class="${k <= guiaPaso ? 'on' : ''}"></span>`).join('')}</div><small>Paso ${guiaPaso + 1} de 6 · ${g.t}</small><h3>${g.h}</h3><p>${g.p}</p>
    <div class="fila-btn"><button class="btn peq" id="g-saltar">Salir del recorrido</button><span style="display:flex;gap:8px">${guiaPaso ? '<button class="btn peq" id="g-ant">Anterior</button>' : ''}<button class="btn peq prim" id="g-sig">${guiaPaso === 5 ? 'Terminar' : 'Siguiente'}</button></span></div>`;
  $('#g-saltar').onclick = cerrarGuia;
  const ant = $('#g-ant'); if (ant) ant.onclick = () => { guiaPaso--; pasoGuia(); };
  $('#g-sig').onclick = async () => {
    if (guiaPaso === 5) return cerrarGuia();
    guiaPaso++; pasoGuia();
  };
  if (g.antes) { $('#g-sig').disabled = true; await g.antes(); $('#g-sig').disabled = false; }
  if (g.espera && !g.espera()) {
    const b = $('#g-sig'); b.disabled = true; b.title = 'Toma la decisión para seguir';
    const t = setInterval(() => { if (guiaPaso < 0 || !document.body.contains(b)) return clearInterval(t); if (g.espera()) { clearInterval(t); b.disabled = false; b.title = ''; document.querySelectorAll('.foco-guia').forEach(e => e.classList.remove('foco-guia')); const f2 = document.querySelector('#d-carta'); if (f2) f2.classList.add('foco-guia'); b.focus({ preventScroll: true }); } }, 300);
  }
  const f = document.querySelector(g.foco);
  if (f) { f.classList.add('foco-guia'); f.scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: innerWidth < 700 ? 'start' : 'center' }); }
  if (!$('#g-sig').disabled) $('#g-sig').focus({ preventScroll: true });
}
$('#guia-abrir').onclick = () => { if (guiaPaso >= 0) cerrarGuia(); else iniciarGuia(); };
addEventListener('keydown', e => { if (e.key === 'Escape' && guiaPaso >= 0) cerrarGuia(); });

// ---------- AJUSTES ----------
function pintarModoIA() {
  const m = IA.modoIA(), b = $('#estado-ia');
  b.innerHTML = `<i></i>${esc(IA.ETIQUETA[m])}`; b.classList.toggle('vivo', m === 'servidor'); b.classList.toggle('manual', m === 'manual');
  b.title = 'Cambiar el modo de IA';
}
function vAjustes() {
  const m = IA.modoIA(), clave = IA.claveUsuario();
  const op = [
    ['demo', 'Demostración', 'IA: respuestas registradas', 'Usa respuestas guardadas: las de la prueba con documentos nuevos (16/11/2026) y la preparada para la lámina E-301. No envía datos a ningún servicio. Solo procesa los ejemplos.'],
    ['servidor', 'Gemini en vivo', 'IA: Gemini (en vivo)', 'Envía el documento a Gemini (Google AI Studio, plan gratuito) a través del servidor de la app. La clave está en el servidor, nunca en el navegador.'],
    ['manual', 'Manual', 'IA: manual', 'Muestra la instrucción completa para que la copies en el asistente de IA que prefieras. Pegas su respuesta y la app la valida igual que en los otros modos.'],
  ];
  $('#v-ajustes').innerHTML = `
    <div class="tab-cab"><div><h2>Ajustes de IA</h2><p class="sub2">El modelo solo lee y propone. En los tres modos, la app verifica cada cita contra el texto, recalcula la confianza de la partida y calcula los plazos con fórmulas, nunca con la IA.</p></div></div>
    <fieldset class="modos"><legend class="sr">Modo de IA</legend>${op.map(([k, t, e, d]) => `<label class="modo ${m === k ? 'activo' : ''}"><input type="radio" name="modo-ia" value="${k}" ${m === k ? 'checked' : ''}><span class="modo-t">${t}</span><span class="etq">${e}</span><span class="modo-d">${d}</span></label>`).join('')}</fieldset>
    <div class="ajustes-grid">
      <div class="panel"><h3>Servidor de IA</h3><p class="pista-txt">Comprueba si el servidor de la app tiene configurada la clave de Gemini (<code>GEMINI_API_KEY</code> en las variables de entorno de Netlify).</p>
        <div class="fila-btn"><button class="btn" id="aj-probar">Probar conexión con el servidor</button></div><div id="aj-estado" aria-live="polite"></div></div>
      <div class="panel"><h3>Usar mi propia clave de Gemini</h3><p class="pista-txt">Opcional. Se guarda solo en esta pestaña (sessionStorage) y se borra al cerrarla. Se obtiene gratis y sin tarjeta en aistudio.google.com.</p>
        <label class="tit" for="aj-clave">Clave de API de Google AI Studio</label><input type="password" id="aj-clave" autocomplete="off" spellcheck="false" placeholder="${clave ? 'Clave guardada en esta pestaña' : 'Pega aquí tu clave'}">
        <div class="fila-btn" style="margin-top:10px"><button class="btn prim" id="aj-guardar">Guardar en esta pestaña</button>${clave ? '<button class="btn" id="aj-olvidar">Olvidar clave</button>' : ''}</div><div id="aj-clave-msg" aria-live="polite">${clave ? '<p class="aviso ok" style="margin-top:8px">Con el modo «Gemini en vivo», las consultas usan tu clave directamente desde este navegador.</p>' : ''}</div></div>
    </div>
    <div class="aviso info" style="margin-top:16px"><b>Privacidad.</b> En el plan gratuito de Google AI Studio, Google puede usar los datos enviados para mejorar sus productos. Usa solo documentos de demostración o sin información sensible.</div>
    <section class="seccion"><h3>Instrucciones que recibe la IA</h3><p class="pista-txt">Son las mismas en los tres modos y las mismas con las que se midieron los resultados.</p>
      <details class="tec"><summary>Paso 1 · Detectar cambios con impacto</summary><pre class="crudo">${esc(IA.I1())}</pre></details>
      <details class="tec"><summary>Paso 2 · Proponer la partida del presupuesto</summary><pre class="crudo">${esc(IA.I2())}</pre></details></section>`;
  document.querySelectorAll('[name="modo-ia"]').forEach(r => r.onchange = () => { IA.fijarModo(r.value); vAjustes(); pintarModoIA(); });
  $('#aj-probar').onclick = async () => {
    const b = $('#aj-probar'); b.disabled = true; $('#aj-estado').innerHTML = '<p class="estado-ia"><span class="spin"></span>Consultando…</p>';
    const e = await IA.estadoServidor(); b.disabled = false;
    $('#aj-estado').innerHTML = !e.servidor ? `<p class="aviso mal" style="margin-top:8px">${esc(e.motivo)} Usa el modo manual o el de demostración${IA.claveUsuario() ? '' : ', o pega tu propia clave'}.</p>`
      : e.clave ? `<p class="aviso ok" style="margin-top:8px">Servidor listo. Modelo: ${esc(e.modelo)}.</p>` : '<p class="aviso mal" style="margin-top:8px">Servidor sin clave: usa el modo manual o el de demostración.</p>';
  };
  $('#aj-guardar').onclick = () => { const v = $('#aj-clave').value.trim(); if (!v) { $('#aj-clave-msg').innerHTML = '<p class="aviso mal" style="margin-top:8px">Pega primero la clave.</p>'; return; } IA.fijarClave(v); IA.fijarModo('servidor'); vAjustes(); pintarModoIA(); };
  const o = $('#aj-olvidar'); if (o) o.onclick = () => { IA.fijarClave(''); vAjustes(); };
}

// ---------- ASISTENTE ----------
const FAQ = [
  [/qu[eé] (es|hace)|para qu[eé]|sirve/i, 'Reloj Contractual te avisa, el mismo día en que llega un documento al CDE, qué cambió, a qué partida afecta y cuántos días te quedan para notificar el adicional. La IA lee y propone; la fecha la calcula una fórmula; tú decides.'],
  [/empez|c[oó]mo (lo )?uso|primero/i, 'Empieza por el recorrido guiado (botón «?» de la barra superior): son 6 pasos con la lámina de ejemplo, de la revisión nueva a la carta. Luego abre la «Bandeja de cambios» y el cambio que vence primero.'],
  [/hoy|fecha|desliz|mover|simulad/i, 'La fecha simulada (chip «Hoy» y la barra de la bandeja) hace correr los días de la demostración. Al moverla verás cómo cada cambio pasa de verde a ámbar y a vencido.'],
  [/confianza|criterio|r-?v|partida/i, 'La partida la propone la IA, pero la confianza la calcula la app con 4 criterios: mismo elemento, misma especialidad, ubicación compatible y rango o unidad. 4 de 4 es Alta, 3 Media y 2 o menos Baja.'],
  [/cita|invent|alucin/i, 'Cada alerta trae un fragmento copiado literalmente del documento. La app lo busca en el texto: si no aparece, la alerta se rechaza. En el paso 3 de «Cómo funciona» puedes probarlo con una cita inventada.'],
  [/plazo|d[ií]as|vence|cl[aá]usula/i, 'Cada proyecto tiene su plazo, en «Plazos y parámetros». En R1, la cláusula 14.3 da 7 días calendario desde la recepción. Administración contractual la valida una vez; luego la fecha límite sale de una fórmula, con feriados si son días hábiles. El modelo nunca calcula fechas.'],
  [/resultado|funciona bien|precisi|cobertura/i, 'En el corpus base detectó 41 de 41 cambios. Con 10 documentos nuevos, 7 y 8 de 8 en dos corridas. Un comparador de texto sin IA encontró 33 de 41 con 22 falsas alarmas y no lee cartas ni RFI.'],
  [/detecta|bluebeam|procore|comparador|por qu[eé] ia/i, 'Primero un comparador sin IA marca cada zona y línea que cambió, incluido el rótulo. Luego la IA indica cuáles tienen impacto y propone la partida; la app verifica cada cita contra el texto y la confianza con 4 criterios.'],
  [/modo|gemini|clave|manual|ia en vivo/i, 'Hay tres modos de IA, en Ajustes: demostración (respuestas registradas o preparadas), Gemini en vivo (vía el servidor, sin exponer la clave) y manual (copias la instrucción, la pegas en tu asistente de IA y pegas su respuesta). En los tres, la app verifica cada cita.'],
  [/hash|sello|borra|audit|integridad/i, 'Cada evento guarda el sello SHA-256 del anterior. Si alguien cambia o borra un evento, los sellos dejan de coincidir y «Verificar integridad» marca en rojo desde ese punto. En esta demostración el registro vive en el navegador; en producción iría en un servidor de solo anexado.'],
  [/l[ií]mit|no (hace|mide)|falta/i, 'Limitaciones: documentos sintéticos en texto, sin DWG ni PDF escaneados; la línea base viene de solo 2 casos; falta un usuario externo; no se integra con el CDE.'],
];
const SUG = { inicio: ['¿Qué hace este asistente?', '¿Por dónde empiezo?'], simulacion: ['¿Cómo evita que la IA invente?', '¿Cómo se calcula el plazo?'], bandeja: ['¿Qué hace la fecha simulada?', '¿Qué significan las barras?'], alerta: ['¿Por qué esta partida?', '¿Qué pasa si corrijo?'], comparar: ['¿Cómo detecta los cambios?', '¿Por qué no basta un comparador?'], calidad: ['¿Qué tan bien funciona?', '¿Qué limitaciones tiene?'], auditoria: ['¿Para qué sirve el hash?', '¿Qué pasa si alguien borra un evento?'] };
const chat = [];
function pintarChat() {
  $('#asist-msgs').innerHTML = (chat.length ? '' : '<div class="msg ia">Hola. Puedo explicarte cualquier pantalla o decisión de la app. Elige una pregunta o escribe la tuya.</div>') + chat.map(m => `<div class="msg ${m.role === 'user' ? 'yo' : 'ia'}">${esc(m.content)}</div>`).join('');
  $('#asist-msgs').scrollTop = 1e6;
  $('#asist-sug').innerHTML = (SUG[ruta().vista] || SUG.inicio).map(s => `<button type="button">${esc(s)}</button>`).join('');
  $('#asist-sug').querySelectorAll('button').forEach(b => b.onclick = () => enviar(b.textContent));
}
async function enviar(texto) {
  if (!texto.trim()) return;
  chat.push({ role: 'user', content: texto }); pintarChat();
  const m = { role: 'assistant', content: '…' }; chat.push(m); pintarChat();
  const f = FAQ.find(([re]) => re.test(texto));
  m.content = f ? f[1] : 'Con las respuestas preparadas no tengo esa. Prueba con «¿Por dónde empiezo?», «¿Cómo evita que la IA invente?» o «¿Qué limitaciones tiene?». ';
  if (ruta().vista === 'alerta' && /partida|por qu/i.test(texto) && alertaPorId[ruta().id]) m.content = `Partida ${alertaPorId[ruta().id].partida || 'ninguna'}: ${alertaPorId[ruta().id].sustento}`;
  if (/corrij/i.test(texto)) m.content = 'Si corriges, la alerta guarda tu partida y también la que propuso la IA. Así se puede medir cuántas veces se equivoca el modelo sin perder el dato original.';
  if (/barra/i.test(texto)) m.content = `Cada barra va de la recepción (día 0) al límite contractual del proyecto. El tramo rayado es lo que tarda entender un cambio sin asistente (${REF.min} a ${REF.max} días, 2 casos de referencia); la línea vertical es hoy y el punto naranja, el límite.`;
  pintarChat();
}
$('#asist-abrir').onclick = () => { const p = $('#asist'); p.hidden = !p.hidden; $('#asist-abrir').setAttribute('aria-expanded', String(!p.hidden)); if (!p.hidden) { pintarChat(); $('#asist-in').focus(); } };
$('#asist-cerrar').onclick = () => { $('#asist').hidden = true; $('#asist-abrir').setAttribute('aria-expanded', 'false'); $('#asist-abrir').focus(); };
$('#asist-form').onsubmit = e => { e.preventDefault(); const i = $('#asist-in'); enviar(i.value); i.value = ''; };

// ---------- tema claro / oscuro ----------
const SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const LUNA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>';
function aplicarTema(t) { document.documentElement.dataset.theme = t; const osc = t === 'dark'; $('#tema-ico').innerHTML = osc ? SOL : LUNA; $('#tema').title = osc ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'; $('#tema').setAttribute('aria-label', osc ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'); try { localStorage.setItem('rc-tema', t); } catch { } }
let temaIni = 'dark'; try { temaIni = localStorage.getItem('rc-tema') || 'dark'; } catch { }
aplicarTema(temaIni);
$('#tema').onclick = () => { aplicarTema(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); };
// ---------- fecha simulada global ----------
function pintarFecha() {
  $('#chip-fecha-t').textContent = `Hoy · ${fCorta(est.hoy)}`;
  const r = $('#pop-r'); r.min = 0; r.max = N.difDias(ULTIMA, PRIMERA); r.value = N.difDias(est.hoy, PRIMERA); r.setAttribute('aria-valuetext', N.fmtFecha(est.hoy));
  const urg = abiertasDe(est.proyecto).filter(a => ['rojo', 'ambar', 'vencido'].includes(estadoDe(a))).length;
  $('#campana').querySelector('.badge')?.remove(); if (urg) $('#campana').insertAdjacentHTML('beforeend', `<span class="badge">${urg}</span>`);
}
$('#chip-fecha').onclick = () => { const p = $('#pop-fecha'); p.hidden = !p.hidden; $('#chip-fecha').setAttribute('aria-expanded', String(!p.hidden)); };
$('#pop-r').oninput = e => { est.hoy = N.sumarDias(PRIMERA, Number(e.target.value)); const v = ruta().vista; if (v === 'inicio') { vInicio(); } else if (v === 'bandeja') vBandeja(); pintarFecha(); };
document.addEventListener('click', e => { if (!e.target.closest('#pop-fecha, #chip-fecha')) { $('#pop-fecha').hidden = true; $('#chip-fecha').setAttribute('aria-expanded', 'false'); } });
$('#asist-modo').textContent = 'Respuestas preparadas sobre cada pantalla';
render();
