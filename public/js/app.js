// Reloj Contractual · interfaz v2 (Hito 3). La lógica es la del MVP (nucleo.js, sin cambios):
// el modelo lee y propone, la fórmula cuenta, la persona decide.
import * as N from './nucleo.js';
import * as IA from './ia.js';
import { SISTEMA_CHAT } from './asistente_ia.js';
import { vComparar } from './comparador.js';
import { vSalidas, zip } from './salidas.js';
import { laminaSVG } from './lamina_demo.js';
import * as AUD from './auditoria.js';
import * as CAL from './calendario.js';
import * as DRIVE from './drive.js';
import { casosDePrueba } from './pruebas.js';
import * as EV from './evidencia.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const fCorta = iso => { const [, m, d] = iso.split('-'); return `${Number(d)} ${MESES[Number(m) - 1]}`; };
const pct = x => (x * 100).toFixed(1).replace('.', ',').replace(',0', '') + ' %';

// ---------- datos ----------
const [docs, proyecto, reg, cifras] = await Promise.all(
  ['data/documentos.json', 'data/proyecto.json', 'data/registrado.json', 'data/cifras.json'].map(u => fetch(u).then(r => r.json())));
// Consulta a profesionales (opcional): si falta, la vista Evidencia muestra «sin medir todavía».
const consulta = await fetch('data/consulta.json').then(r => r.ok ? r.json() : null).catch(() => null);
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
// Referencia «sin asistente»: rango de días para entender un cambio en la consulta (n = 15); si falta, los 2 casos iniciales.
const REF = consulta?.respuestas?.length ? { min: Math.min(...consulta.respuestas.map(r => r.entender_dias)), max: Math.max(...consulta.respuestas.map(r => r.entender_dias)), n: consulta.respuestas.length } : { ...cifras.casos_referencia.entender_sin_asistente_dias, n: cifras.casos_referencia.casos.length };
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
const est = { hoy: '2026-10-09', proyecto: 'R1', rol: 'ot', decisiones: {}, aprobaciones: {}, emitidas: {}, borradores: {}, registro: [], filtro: 'pendientes', esp: 'todas', simPaso: 0, simDecision: null };
try { const pa = localStorage.getItem('rc-proyecto-activo'); if (pa && PROY[pa]) est.proyecto = pa; } catch { }
try { const g = JSON.parse(localStorage.getItem('rc-estado') || 'null'); if (g) Object.assign(est, { decisiones: g.decisiones || {}, aprobaciones: g.aprobaciones || {}, registro: g.registro || [], emitidas: g.emitidas || {}, borradores: g.borradores || {} }); } catch { }
try { const r = localStorage.getItem('rc-rol'); if (r) est.rol = r; } catch { }
const guardar = () => { try { localStorage.setItem('rc-estado', JSON.stringify({ decisiones: est.decisiones, aprobaciones: est.aprobaciones, registro: est.registro, emitidas: est.emitidas, borradores: est.borradores })); } catch { } };
const registrar = (quien, que, meta = {}) => { est.registro.unshift({ t: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }), quien, que, ...meta }); guardar(); AUD.anexar({ quien, que, tipo: meta.tipo, alerta: meta.alerta, fecha_sim: est.hoy }); };

// ---------- roles y puntos de decisión (tomados de la v1; cambio de rol solo en demostración) ----------
const ROLES = {
  control: { n: 'Control documentario', ini: 'CD', hace: 'Registra las revisiones que llegan al CDE y lanza la comparación.' },
  ot: { n: 'Oficina técnica', ini: 'OT', hace: 'Revisa cada cambio y decide: confirmar, corregir la partida o descartar (punto de decisión 1).' },
  contractual: { n: 'Administración contractual', ini: 'AC', hace: 'Valida la cláusula, el plazo y los feriados de cada contrato (punto de decisión 2).' },
  jefe: { n: 'Jefe/a de oficina técnica', ini: 'JO', hace: 'Aprueba que la variación se notifique y habilita la carta (punto de decisión 3).' },
  gerente: { n: 'Gerente de proyecto', ini: 'GP', hace: 'Firma, emite y registra la emisión de la carta (punto de decisión 4).' },
};
const PERMISOS = { comparar: ['control', 'ot'], cde: ['control'], decidir: ['ot'], plazos: ['contractual'], aprobar: ['jefe'], redactar: ['ot', 'jefe', 'gerente'], emitir: ['gerente'] };
const PD = { decidir: 'punto de decisión 1', plazos: 'punto de decisión 2', aprobar: 'punto de decisión 3', emitir: 'punto de decisión 4' };
const puede = acc => PERMISOS[acc].includes(est.rol);
const rolN = () => ROLES[est.rol].n;
const quienPuede = acc => PERMISOS[acc].map(r => ROLES[r].n).join(' o ');
const notaRol = (acc, que) => `<p class="nota-rol"><span aria-hidden="true">🔒</span> ${que} corresponde a <b>${esc(quienPuede(acc))}</b>${PD[acc] ? ` (${PD[acc]})` : ''}. Estás como ${esc(rolN())}. <button class="enlace" data-rol-a="${PERMISOS[acc][0]}">Cambiar a ${esc(ROLES[PERMISOS[acc][0]].n)}</button> <small>(demostración)</small></p>`;
function fijarRol(r, motivo = '') { if (!ROLES[r] || r === est.rol) return; const ant = rolN(); est.rol = r; try { localStorage.setItem('rc-rol', r); } catch { } registrar(rolN(), `cambio de rol: de ${ant} a ${rolN()}${motivo ? ` (${motivo})` : ''} · demostración`, { tipo: 'registro' }); pintarRol(); render(); }
document.addEventListener('click', e => { const b = e.target.closest('[data-rol-a]'); if (b) { e.preventDefault(); fijarRol(b.dataset.rolA); } });
const estadoAprob = a => est.aprobaciones[a.id]?.estado; // 'aprobada' | 'archivada'
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
    <p class="pb-nota">Con el asistente, el cambio se detecta el mismo día (mediana de ${String(LAT_MIN).replace('.', ',')} min por documento, medida) y quedan ${margenCon} días para sustentar; ${frase}. Referencia «sin asistente»: ${REF.min} a ${REF.max} días, casos observados (n = ${REF.n}), ver <a href="#calidad">Calidad</a>. El tiempo de revisión humana se cronometra en este navegador (Calidad → Evidencia).</p></div>`;
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
const VISTAS = ['inicio', 'proyectos', 'panorama', 'simulacion', 'bandeja', 'comparar', 'salidas', 'auditoria', 'calidad', 'plazos', 'resultados', 'ajustes'];
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
  pintarProyecto();
  $('#ruta-vista').textContent = { inicio: 'Inicio', simulacion: 'Cómo funciona', proyectos: 'Proyectos', panorama: 'Panorama', bandeja: 'Bandeja de cambios', salidas: 'Documentos de salida', alerta: 'Detalle del cambio', comparar: 'Comparar revisiones', calidad: 'Calidad', auditoria: 'Registro de auditoría', ajustes: 'Ajustes', plazos: 'Plazos y parámetros' }[r.vista];
  if (r.vista === 'alerta' && !(ultimaVista?.vista === 'alerta' && ultimaVista.id === r.id) && !est.decisiones[r.id]) EV.abrirDetalle(r.id);
  pintarFecha();
  ({ inicio: vInicio, proyectos: vProyectos, panorama: vPanorama, simulacion: vSim, bandeja: vBandeja, salidas: () => vSalidas({ est, alertas, alertaPorId, partidaPorCod, P, PROY, registrar, guardar, puede, notaRol, rolN, icsDe, telegram: TG, drive: DRV }, r.id), alerta: () => vAlerta(r.id), comparar: () => vComparar({ est, proyecto, partidaPorCod, crearAlertas, puede, notaRol, drive: DRV }), calidad: () => { vCalidad(); EV.conectarEvidencia(); correrPruebas(); $('#pr-correr').onclick = correrPruebas; }, auditoria: vAuditoria, ajustes: vAjustes, plazos: vPlazos })[r.vista]();
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
const porAprobarDe = id => alertas.filter(a => a.proyecto === id && ['confirmada', 'corregida'].includes(est.decisiones[a.id]?.estado) && !estadoAprob(a));
const porEmitirDe = id => alertas.filter(a => a.proyecto === id && estadoAprob(a) === 'aprobada' && !est.emitidas?.[a.id]);
function saludoHora() { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; }
const ICO_ACC = {
  comparar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M12 2v20"/></svg>',
  bandeja: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 13l2.5-7h11L20 13v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/></svg>',
  salidas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3h9l4 4v14H6z"/><path d="M9 13l2 2 4-4"/></svg>',
};
// Acción principal del Inicio según el rol activo.
function accionPrincipal(id) {
  const ab = abiertasDe(id), pa = porAprobarDe(id), pe = porEmitirDe(id);
  if (est.rol === 'jefe') return pa.length ? { t: `Aprobar ${pa.length} variación${pa.length === 1 ? '' : 'es'}`, d: 'Oficina técnica ya confirmó estos cambios. Decide si se notifican a la propietaria.', h: `#alerta-${pa[0].id.toLowerCase()}`, b: 'Revisar y aprobar' } : { t: 'No hay variaciones por aprobar', d: 'Cuando oficina técnica confirme un cambio, aparecerá aquí para tu aprobación.', h: '#bandeja', b: 'Ver la bandeja' };
  if (est.rol === 'gerente') return pe.length ? { t: `Emitir ${pe.length} carta${pe.length === 1 ? '' : 's'}`, d: 'Variaciones aprobadas con su borrador listo. Revisa, firma fuera del sistema y registra la emisión.', h: `#salidas-${pe[0].id.toLowerCase()}`, b: 'Revisar y emitir' } : { t: 'No hay cartas por emitir', d: 'Las cartas aparecen aquí cuando el jefe/a de oficina técnica aprueba una variación.', h: '#salidas', b: 'Ver documentos de salida' };
  if (est.rol === 'contractual') return { t: 'Validar los plazos del contrato', d: `Cláusula ${paramsProy(id).clausula}: ${paramsProy(id).plazo} días ${paramsProy(id).tipo_dias === 'habiles' ? 'hábiles' : 'calendario'}. Toda fecha límite se calcula con estos parámetros.`, h: '#plazos', b: 'Revisar parámetros' };
  if (est.rol === 'ot' && ab.length) return { t: 'Comparar revisiones', d: `Detecta qué cambió entre dos revisiones. Tienes además ${ab.length} cambio${ab.length === 1 ? '' : 's'} por decidir: el primero vence el ${N.fmtFecha(ab[0].limite)}.`, h: '#comparar', b: 'Comparar revisiones' };
  return { t: 'Comparar revisiones', d: 'Sube o elige dos revisiones de un documento: el asistente marca qué cambió, propone la partida y calcula el plazo.', h: '#comparar', b: 'Comparar revisiones' };
}
// ---------- datos de prueba (M3) ----------
async function descargarDatosPrueba() {
  const leer = async f => (await fetch(`data/${f}`)).text();
  const [refCorpus, consulta] = await Promise.all([leer('referencia_corpus.json'), leer('consulta.json').catch(() => '')]);
  const csv = ['elemento;antes (rev. A);después (rev. B);¿tiene impacto?;partida esperada;nota',
    'Viga V-1;sección 0,30 × 0,60 m;sección 0,30 × 0,70 m;sí;03.01.03 Concreto en vigas (también varía 03.02.02 Encofrado de vigas);visible en el dibujo y en el cuadro de vigas',
    'Viga V-3;acero inferior 3 Ø 5/8";acero inferior 4 Ø 3/4";sí;03.03.01 Acero en vigas;solo en el cuadro de vigas: no evidente a simple vista',
    "Concreto de vigas;NOTA 2: f'c = 280 kg/cm²;NOTA 2: f'c = 350 kg/cm²;sí;03.01.03 con confianza media (la partida es de 280 kg/cm²: requiere precio nuevo);solo en las notas: no evidente a simple vista",
    'Rótulo y cuadro de revisiones;REVISIÓN A · 02/10/2026;REVISIÓN B · 07/10/2026 y nueva línea «REV. B: SE ACTUALIZA CUADRO DE VIGAS»;no;—;cambio administrativo'].join('\r\n');
  const ejemplos = IA.DEMO.filter(d => d.actual != null).flatMap(d => [[`textos/${d.clave}_revA.txt`, d.anterior || '(carta: sin revisión anterior)'], [`textos/${d.clave}_revB.txt`, d.actual]]);
  const leeme = `DATOS DE PRUEBA · RELOJ CONTRACTUAL (demostración)

Todo es de demostración: proyecto ficticio R1 y documentos sintéticos, salvo consulta.json (respuestas reales anonimizadas).

1. E-301_revA.svg y E-301_revB.svg: lámina de ejemplo. En «Comparar revisiones» → «Subir dos imágenes», súbelas (o usa «Ejemplo: lámina E-301»).
   E-301_resultado_esperado.csv: los cambios que se introdujeron a propósito entre A y B y la partida esperada.
2. textos/: pares de revisiones en texto para «Pegar texto» (nota escondida, instrucción en una carta y un cambio solo de rótulo).
3. corpus/documentos.json y corpus/proyecto.json: corpus sintético R1 (50 documentos, partidas y contrato).
   corpus/referencia.json: respuestas correctas escritas antes de correr la IA (etiquetado ciego), con las que se midieron las cifras de Calidad.
4. consulta.json: consulta a profesionales de obra y oficina técnica (anonimizada).

Cómo evaluar en 5 minutos: ver el panel «Cómo evaluar esto en 5 minutos» en Inicio o el README del repositorio.
`;
  const blob = zip([['LEEME.txt', leeme], ['E-301_revA.svg', laminaSVG('A')], ['E-301_revB.svg', laminaSVG('B')], ['E-301_resultado_esperado.csv', '\ufeff' + csv], ...ejemplos,
    ['corpus/documentos.json', JSON.stringify(docs, null, 1)], ['corpus/proyecto.json', JSON.stringify(proyecto, null, 1)], ['corpus/referencia.json', refCorpus], ...(consulta ? [['consulta.json', consulta]] : [])], 'application/zip');
  const u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = 'reloj-contractual_datos-de-prueba.zip'; document.body.append(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
}
const EVALUAR = [
  ['Elige un rol y el proyecto', 'En la bienvenida (o desde el avatar). Empieza como oficina técnica en «Edificio multifamiliar R1».'],
  ['Compara la lámina de ejemplo', '«Comparar revisiones» → «Detectar cambios»: 3 cambios con impacto, 2 no evidentes a simple vista, cada uno con su cita verificada.'],
  ['Decide', '«Crear alerta con estos cambios» → Confirmar. Cambia a jefe/a de oficina técnica desde el avatar y aprueba la variación.'],
  ['Emite', 'Como gerente, en «Documentos de salida»: revisa los avisos, descarga el DOCX o el correo .eml y registra la emisión.'],
  ['Audita y revisa la evidencia', '«Registro de auditoría» → «Verificar integridad». En «Calidad» está qué se midió, con qué n y qué no se afirma.'],
];
function vInicio() {
  const id = est.proyecto, pr = PROY[id];
  const abiertas = abiertasDe(id);
  const urg = abiertas.filter(a => ['rojo', 'ambar', 'vencido'].includes(estadoDe(a))).length;
  const acc = accionPrincipal(id);
  $('#v-inicio').innerHTML = `
    <div class="saludo anim"><div><span class="sup-id">Asistente de trazabilidad documental y contractual</span><h1>${saludoHora()}<span class="chip-rol">${esc(rolN())}</span></h1>
      <p>${esc(pr.nombre)}${pr.demo ? ' (demostración)' : ''} · ${abiertas.length ? `${abiertas.length} cambio${abiertas.length === 1 ? '' : 's'} abierto${abiertas.length === 1 ? '' : 's'}${urg ? `, ${urg} urgente${urg === 1 ? '' : 's'}` : ''}` : 'sin cambios abiertos'} · fecha simulada ${N.fmtFecha(est.hoy)}.</p>
      <p class="rol-hoy">${esc(ROLES[est.rol].hace)}</p></div></div>
    <div class="inicio-hero">
      <div class="accion-principal anim"><div><h2>${esc(acc.t)}</h2><p>${esc(acc.d)}</p></div><a class="btn prim grande" href="${acc.h}" id="accion-principal">${esc(acc.b)}</a></div>
      <div class="panel" style="margin:0"><h3>Lo que vence primero</h3>${abiertas.length ? `<ul class="lista-urg">${abiertas.slice(0, 3).map(a => `<li><a href="#alerta-${a.id.toLowerCase()}">${diasBadge(a)}<div><h4>${esc(a.doc_id)} · ${esc(a.elemento)}</h4><p>Notificar hasta el ${fCorta(a.limite)}</p></div></a></li>`).join('')}</ul>` : `<p class="vacio">Sin cambios abiertos en este proyecto.</p>`}
        <p class="pista-txt" style="margin-top:10px"><a href="#bandeja">Bandeja de cambios</a> · <a href="#panorama">Panorama del proyecto</a></p></div>
    </div>
    <details class="panel evaluar" ${guiaVista() ? '' : 'open'}><summary><b>Cómo evaluar esto en 5 minutos</b></summary><ol class="pasos-evaluar">${EVALUAR.map(([t, d]) => `<li><b>${t}.</b> ${d}</li>`).join('')}</ol>
      <div class="fila-btn"><button class="btn peq" id="datos-prueba">Descargar datos de prueba (.zip)</button><span class="pista-txt">Lámina E-301 A y B, resultado esperado, textos de ejemplo, corpus de demostración y su referencia.</span></div></details>
    ${guiaVista() ? '' : `<div class="invita" id="invita-guia"><p><b>¿Primera vez?</b> Recorrido guiado de 6 pasos con la lámina de ejemplo: de la revisión nueva a la carta emitida. <small>Unos 2 minutos.</small></p><div class="fila-btn"><button class="btn prim peq" id="guia-ini">Empezar el recorrido</button><button class="btn peq" id="guia-saltar">Ahora no</button></div></div>`}`;
  const gi = $('#guia-ini'); if (gi) gi.onclick = () => iniciarGuia();
  const gs = $('#guia-saltar'); if (gs) gs.onclick = () => { marcarGuia(); $('#invita-guia').remove(); };
  $('#datos-prueba').onclick = () => descargarDatosPrueba();
}
function vPanorama() {
  const id = est.proyecto, pr = PROY[id], pp = paramsProy(id), abiertas = abiertasDe(id);
  const nuevos = abiertas.filter(a => N.difDias(est.hoy, a.fecha_recepcion) <= 1).length, urg = abiertas.filter(a => ['rojo', 'ambar', 'vencido'].includes(estadoDe(a))).length;
  const proximos = alertas.filter(a => a.proyecto === id && a.fecha_recepcion <= est.hoy && !est.emitidas[a.id] && est.decisiones[a.id]?.estado !== 'descartada' && estadoAprob(a) !== 'archivada' && N.diasRestantes(a.limite, est.hoy) >= -3).sort((x, y) => x.limite.localeCompare(y.limite));
  const porFecha = [...new Set(proximos.map(a => a.limite))].slice(0, 8);
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  $('#v-panorama').innerHTML = `
    <div class="tab-cab"><div><h2>Panorama · ${esc(pr.nombre)}</h2><p class="sub2">Las cifras, los plazos y la agenda de vencimientos del proyecto. Cláusula ${esc(pp.clausula)}: ${pp.plazo} días ${pp.tipo_dias === 'habiles' ? 'hábiles' : 'calendario'} desde la recepción.</p></div></div>
    <div class="resumen-dia cuatro" role="group" aria-label="Resumen del proyecto">
      <a class="kpi nuevo" href="#bandeja" data-ir="nuevos"><b class="num">${nuevos}</b>cambios nuevos (48 h)</a>
      <a class="kpi urg" href="#bandeja" data-ir="urgentes"><b class="num">${urg}</b>urgentes: vencen en 3 días o menos</a>
      <a class="kpi" href="#bandeja" data-ir="decididas"><b class="num">${porAprobarDe(id).length}</b>confirmados, por aprobar</a>
      <a class="kpi emitir" href="#salidas"><b class="num">${porEmitirDe(id).length}</b>aprobados, por emitir</a></div>
    <div class="panorama-grid">
      <div class="panel"><h3>Plazo restante de los cambios abiertos</h3><p class="pista-txt" style="margin:2px 0 12px">Cada barra es la fracción del plazo que queda. <a href="#plazos">Parámetros</a></p>${miniPlazos(abiertas)}</div>
      <div class="panel"><h3>Agenda de vencimientos</h3>${porFecha.length ? `<ul class="agenda">${porFecha.map(f => { const d = N.difDias(f, est.hoy); return `<li><time datetime="${f}">${fCorta(f)}<small>${DIAS[N.isoAFecha(f).getUTCDay()]} · ${d < 0 ? `hace ${-d} d` : d === 0 ? 'hoy' : `en ${d} d`}</small></time><ul>${proximos.filter(a => a.limite === f).map(a => `<li><a href="#alerta-${a.id.toLowerCase()}">${esc(a.doc_id)} · ${esc(a.elemento)}</a> <small class="pista-txt">${est.decisiones[a.id] ? (estadoAprob(a) ? 'por emitir' : 'por aprobar') : 'por decidir'}</small></li>`).join('')}</ul></li>`; }).join('')}</ul>` : '<p class="vacio">Sin vencimientos próximos.</p>'}</div>
    </div>
    ${id === 'R1' ? casosR1() : ''}`;
  document.querySelectorAll('#v-panorama [data-ir]').forEach(b => b.onclick = () => { est.filtro = b.dataset.ir; est.bproy = id; });
}
// ---------- barra superior: proyecto, CDE y rol ----------
function abrirPop(btn, pop, pintar) {
  const abierto = !pop.hidden;
  document.querySelectorAll('.pop').forEach(x => { x.hidden = true; }); document.querySelectorAll('[aria-controls^="pop-"]').forEach(x => x.setAttribute('aria-expanded', 'false'));
  if (abierto) return;
  pintar(); pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); pop.querySelector('button, a')?.focus();
}
document.addEventListener('click', e => { if (!e.target.closest('.pop-ancla')) { document.querySelectorAll('.pop').forEach(x => { x.hidden = true; }); document.querySelectorAll('.pop-ancla > [aria-expanded]').forEach(x => x.setAttribute('aria-expanded', 'false')); } });
addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.pop').forEach(x => { if (!x.hidden) { x.hidden = true; x.previousElementSibling?.focus(); } }); });
function pintarProyecto() { $('#ruta-proy').textContent = PROY[est.proyecto].nombre; }
function pintarRol() { const b = $('#rol-btn'); b.innerHTML = `<span class="rol-largo">Ver como: <b>${esc(rolN())}</b></span><span class="rol-corto">${ROLES[est.rol].ini}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`; b.title = `Ver como: ${rolN()}. ${ROLES[est.rol].hace}`; b.setAttribute('aria-label', `Ver como: ${rolN()}. Cambiar de rol`); }
const ETQ_PROY = p => p.demo ? '<span class="etq ambar">Demostración</span>' : '<span class="etq">Corpus de prueba</span>';
$('#proy-btn').onclick = () => abrirPop($('#proy-btn'), $('#pop-proy'), () => {
  $('#pop-proy').innerHTML = `<h4>Proyecto</h4>${PROYECTOS.map(p => { const pa = paramsProy(p.id); return `<button class="pop-op" role="menuitemradio" aria-checked="${p.id === est.proyecto}" data-p="${p.id}"><b>${esc(p.nombre)}</b><small>${pa.plazo} días ${pa.tipo_dias === 'habiles' ? 'hábiles' : 'calendario'} para notificar · ${abiertasDe(p.id).length} abiertos · ${p.demo ? 'demostración' : 'corpus de prueba'}</small></button>`; }).join('')}<a class="pop-op" href="#proyectos"><b>Ver todos los proyectos</b></a>`;
  $('#pop-proy').querySelectorAll('[data-p]').forEach(b => b.onclick = () => { abrirProyecto(b.dataset.p, false); $('#pop-proy').hidden = true; });
});
function abrirProyecto(id, irInicio = true) { est.proyecto = id; est.bproy = id; guardarActivo(); pintarProyecto(); pintarFecha(); if (irInicio && location.hash !== '#inicio') location.hash = '#inicio'; else render(); }
$('#rol-btn').onclick = () => abrirPop($('#rol-btn'), $('#pop-rol'), () => {
  $('#pop-rol').innerHTML = `<h4>Ver como · demostración</h4>${Object.entries(ROLES).map(([k, r]) => `<button class="pop-op" role="menuitemradio" aria-checked="${k === est.rol}" data-r="${k}"><b>${esc(r.n)}</b><small>${esc(r.hace)}</small></button>`).join('')}<p>En la versión real, cada persona entra con su usuario y su rol.</p><button class="pop-op" id="ver-entrada"><b>Ver la presentación de la app</b></button>`;
  $('#pop-rol').querySelectorAll('[data-r]').forEach(b => b.onclick = () => { $('#pop-rol').hidden = true; fijarRol(b.dataset.r); });
  $('#ver-entrada').onclick = () => { $('#pop-rol').hidden = true; abrirEntrada(); };
});
// ---------- proyectos: tarjetas ----------
function vProyectos() {
  $('#v-proyectos').innerHTML = `<div class="tab-cab"><div><h2>Proyectos</h2><p class="sub2">Elige en qué contrato trabajar. Cada uno tiene su propio plazo para notificar variaciones.</p></div></div>
    <div class="proy-cards">${PROYECTOS.map(p => { const pa = paramsProy(p.id), ab = abiertasDe(p.id), u = ab.filter(a => ['rojo', 'ambar', 'vencido'].includes(estadoDe(a))).length;
      return `<article class="proy-card ${p.id === est.proyecto ? 'actual' : ''}">${ETQ_PROY(p)}<h3>${esc(p.nombre)}</h3><p>${esc(p.desc)}</p>
        <dl><dt>Plazo para notificar</dt><dd>${pa.plazo} días ${pa.tipo_dias === 'habiles' ? 'hábiles' : 'calendario'} · cláusula ${esc(pa.clausula)}</dd><dt>Estado</dt><dd>${ab.length ? `${ab.length} cambio${ab.length === 1 ? '' : 's'} abierto${ab.length === 1 ? '' : 's'}${u ? `, ${u} urgente${u === 1 ? '' : 's'}` : ''}` : 'Sin cambios abiertos'}</dd></dl>
        <button class="btn ${p.id === est.proyecto ? '' : 'prim'}" data-abrir="${p.id}">${p.id === est.proyecto ? 'Seguir en este proyecto' : 'Abrir proyecto'}</button></article>`; }).join('')}</div>`;
  document.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => abrirProyecto(b.dataset.abrir));
}
// ---------- entrada: primero se entiende qué hace la app ----------
function abrirEntrada() {
  const pp = paramsProy('R1');
  const pasos = [
    ['Revisión A → B', 'Llega la lámina E-301 rev. B', `<span class="en-lam"><img alt="" src="${URL.createObjectURL(new Blob([laminaSVG('A')], { type: 'image/svg+xml' }))}"><img alt="" src="${URL.createObjectURL(new Blob([laminaSVG('B')], { type: 'image/svg+xml' }))}"></span>`],
    ['Cambio detectado', '3 cambios con impacto; 2 no se veían a simple vista', '<b class="en-num">3</b>'],
    ['Partida', 'Viga V-1 → 03.01.03 Concreto en vigas, con su cita literal', '<b class="en-cod">03.01.03</b>'],
    ['Días que quedan', `Cláusula ${pp.clausula}: ${pp.plazo} días ${pp.tipo_dias === 'habiles' ? 'hábiles' : 'calendario'} desde la recepción`, `<b class="en-num naranja">${pp.plazo}</b>`],
    ['Carta lista', 'Borrador con la cita, la partida y la fecha límite, para firmar', '<b class="en-ok">✓</b>'],
  ];
  $('#bienvenida').innerHTML = `<div class="entrada">
    <div class="bv-marca"><svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12.5" fill="none" stroke="#8FB0FF" stroke-width="3"/><path d="M16 3.5a12.5 12.5 0 0 1 10.8 6.25" fill="none" stroke="#FF8A4C" stroke-width="3" stroke-linecap="round"/><path d="M16 9v7l4.5 3" fill="none" stroke="#8FB0FF" stroke-width="3" stroke-linecap="round"/></svg><span>Reloj Contractual</span></div>
    <h1 id="bv-titulo">Detecta qué cambió entre revisiones, propone la partida y te dice cuántos días quedan para notificar.</h1>
    <ol class="franja" aria-label="Recorrido del ejemplo E-301">${pasos.map(([t, d, v], k) => `<li style="--k:${k}"><div class="fr-vis">${v}</div><b>${t}</b><small>${d}</small></li>`).join('')}</ol>
    <p class="en-demo">Ejemplo E-301 del proyecto R1 · datos de demostración</p>
    <div class="en-acciones"><button class="btn prim grande" id="en-entrar">Entrar al proyecto de ejemplo</button><button class="btn" id="en-evaluar">Ver cómo evaluarla en 5 minutos</button></div>
    <p class="en-principio">El modelo lee y propone. La fórmula cuenta. La persona decide.</p></div>`;
  $('#bienvenida').hidden = false;
  const cerrar = () => { try { localStorage.setItem('rc-bienvenida', 'vista'); } catch { } $('#bienvenida').hidden = true; est.proyecto = 'R1'; guardarActivo(); pintarProyecto(); pintarRol(); };
  $('#en-entrar').onclick = () => { cerrar(); if (location.hash !== '#inicio') location.hash = '#inicio'; else render(); $('#accion-principal')?.focus(); };
  $('#en-evaluar').onclick = () => { cerrar(); if (location.hash !== '#inicio') location.hash = '#inicio'; else render(); setTimeout(() => { const e = $('.evaluar'); if (e) { e.open = true; e.scrollIntoView({ block: 'start' }); e.querySelector('summary').focus(); } }, 120); };
  $('#en-entrar').focus();
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
    <div class="tab-cab"><div><h2>Cómo funciona, paso a paso con un caso del proyecto de demostración</h2><p class="sub" style="color:var(--texto-2)">La lámina E-204 rev. C llega al CDE. Sigue los 7 pasos; en cada uno puedes abrir el detalle técnico.</p></div></div>
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
      <div><div class="salida" id="s-salida" aria-live="polite"></div><dl class="campos" id="s-campos"></dl><div class="fila-btn" style="margin-top:10px"><button class="btn peq" id="s-repro">Ver la respuesta registrada</button>${IA.chatEnVivo() ? '<button class="btn peq prim" id="s-vivo">Procesar con la IA en vivo</button>' : ''}</div></div></div>
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
      v.disabled = true; v.classList.add('cargando'); S.textContent = 'Consultando a la IA…';
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
      registrar(rolN(), `E-204 · alerta ${estado}${estado === 'corregida' ? ` a ${partida}` : ''} (simulación)`);
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
    <div class="segmento peq" role="tablist" aria-label="Vista de la bandeja" style="margin:0 0 12px">${[['lista', 'Lista'], ['calendario', 'Calendario']].map(([k, t]) => `<button role="tab" aria-selected="${(est.bvista || 'lista') === k}" data-bv="${k}">${t}</button>`).join('')}</div>
    ${est.bvista === 'calendario' ? (() => { const mes = est.bmes || est.hoy.slice(0, 8) + '01'; const items = lista.map(a => ({ fecha: a.limite, href: `#alerta-${a.id.toLowerCase()}`, texto: `${a.doc_id} · ${a.elemento}`, titulo: `${a.doc_id} · ${a.elemento}: vence el ${N.fmtFecha(a.limite)}`, estado: estadoDe(a) })); const fuera = items.filter(i => i.fecha.slice(0, 7) !== mes.slice(0, 7)).length;
      return `<div class="panel cal-bandeja"><div class="plazo-cab"><div class="fila-btn"><button class="btn peq" id="bm-ant" aria-label="Mes anterior">←</button><button class="btn peq" id="bm-sig" aria-label="Mes siguiente">→</button></div><span class="pista-txt">Vencimientos de los cambios filtrados. ${fuera ? `${fuera} vence${fuera === 1 ? '' : 'n'} en otros meses.` : ''}</span></div>${CAL.calendarioVencimientos({ mes, hoy: est.hoy, items, feriados: proyF === 'todos' ? FER() : feriadosProy(proyF) })}<div class="cm-ley"><span><i class="l-verde"></i>En plazo</span><span><i class="l-ambar"></i>Vence pronto</span><span><i class="l-lim"></i>Vencido o último día</span><span><i class="l-ok"></i>Decidido</span></div></div>`; })() : ''}
    <p class="pista-txt" style="margin:-4px 0 12px">Cada barra va de la recepción al límite contractual del proyecto. El tramo rayado es lo que tarda entender un cambio sin asistente (${REF.min} a ${REF.max} días, casos de referencia).</p>
    <div class="lista" ${est.bvista === 'calendario' ? 'hidden' : ''}>${lista.length ? lista.map(a => `<a class="alerta-fila" href="#alerta-${a.id.toLowerCase()}">
        ${diasBadge(a)}
        <div><div class="doc-id">${esc(a.doc_id)} <span>· ${esc(a.doc.titulo)}${proyF === 'todos' ? ` · ${esc(PROY[a.proyecto].nombre)}` : ''}</span></div><div class="resumen-cambio">${esc(a.cambio)}</div></div>
        <div class="partida">${a.partida ? `<code>${esc(a.partida)}</code> ${esc(a.partida_desc)}` : '<b>Sin partida en el presupuesto</b>'}<span class="conf ${a.confianza}">Confianza ${esc(String(a.confianza).toLowerCase())}</span></div>
        <div class="pista">${barraPlazo(a, true)}</div></a>`).join('') : `<div class="vacio">No hay cambios con estos filtros al ${N.fmtFecha(est.hoy)}. ${proyF !== 'todos' && !alertas.some(a => a.proyecto === proyF) ? '<a href="#comparar">Compara dos revisiones</a> para registrar cambios en este proyecto.' : 'Prueba con «Todos» o mueve la fecha simulada.'}</div>`}</div>
    <div class="hoy"><label for="hoy-r">Fecha simulada <span class="etq ambar">demostración</span></label><div><input type="range" id="hoy-r" min="0" max="${max}" value="${idx}" aria-valuetext="${N.fmtFecha(est.hoy)}"><div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--texto-2)"><span>${N.fmtFecha(PRIMERA)}</span><span>Mueve la fecha y mira cómo corren los plazos${porLlegar ? ` · ${porLlegar} cambios llegan después` : ''}</span><span>${N.fmtFecha(ULTIMA)}</span></div></div><div class="fecha num" id="hoy-f">${N.fmtFecha(est.hoy)}</div></div>
    <section class="seccion"><h3>Últimas decisiones</h3><p style="color:var(--texto-2);font-size:.9rem;margin:4px 0 10px">Cada decisión queda anotada con el rol que la tomó; la cadena completa y sellada está en el <a href="#auditoria">registro de auditoría</a>. En esta demostración se guarda en este navegador.</p>
    <div class="panel"><ul class="registro">${est.registro.slice(0, 10).map(r => `<li><time>${esc(r.t)}</time><span><b>${esc(r.quien)}:</b> ${esc(r.que)}</span></li>`).join('') || '<li><time>—</time><span>Todavía no hay decisiones. Abre un cambio y confírmalo, corrígelo o descártalo.</span></li>'}</ul></div></section>`;
  const r = $('#hoy-r');
  r.oninput = () => { est.hoy = N.sumarDias(PRIMERA, Number(r.value)); vBandeja(); pintarFecha(); $('#hoy-r').focus(); };
  document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { est.filtro = b.dataset.f; vBandeja(); });
  $('#f-esp').onchange = e => { est.esp = e.target.value; vBandeja(); };
  $('#f-proy').onchange = e => { est.bproy = e.target.value; vBandeja(); };
  $('#f-dias').onchange = e => { est.bdias = e.target.value; vBandeja(); };
  document.querySelectorAll('[data-bv]').forEach(b => b.onclick = () => { est.bvista = b.dataset.bv; vBandeja(); });
  const ba = $('#bm-ant'), bs = $('#bm-sig'); const mesAct = est.bmes || est.hoy.slice(0, 8) + '01';
  if (ba) ba.onclick = () => { est.bmes = CAL.mesAnterior(mesAct); vBandeja(); }; if (bs) bs.onclick = () => { est.bmes = CAL.mesSiguiente(mesAct); vBandeja(); };
}

// ---------- DETALLE ----------
// Trazabilidad del caso: lo que pasó con este cambio, de la recepción a la emisión (eventos del registro sellado).
function trazaCaso(a) {
  const ev = AUD.lista().filter(e => e.alerta === a.id || (e.que.startsWith(`${a.doc_id} ·`) && (!e.alerta || e.alerta === a.id)));
  const items = [{ tipo: 'detectado', quien: 'Entorno común de datos', que: `Documento ${a.doc_id} rev. ${a.doc.revision} recibido: empieza a correr el plazo`, cuando: N.fmtFecha(a.fecha_recepcion), base: true },
    ...(a.origen !== 'comparador' ? [{ tipo: 'detectado', quien: 'Asistente', que: `Cambio detectado por la IA con cita verificada; partida propuesta ${a.partida || 'ninguna'}`, cuando: N.fmtFecha(a.fecha_recepcion), base: true }] : []),
    ...ev.map(e => ({ tipo: e.tipo, quien: e.quien, que: e.que.replace(`${a.doc_id} · `, ''), cuando: `${N.fmtFecha(e.fecha_sim || est.hoy)} · ${new Date(e.ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`, sello: e.hash }))];
  return `<ol class="traza">${items.map(i => { const T = AUD.TIPOS[i.tipo] || AUD.TIPOS.registro; return `<li><span class="ev-punto t-${T.c}" aria-hidden="true"></span><div><span class="etq t-${T.c}">${T.t}</span> <b>${esc(i.quien)}</b> <time>${esc(i.cuando)}</time><p>${esc(i.que)}</p>${i.sello ? `<code class="hash">sello ${i.sello.slice(0, 10)}…</code>` : i.base ? '<small class="pista-txt">Dato del documento</small>' : ''}</div></li>`; }).join('')}</ol>`;
}
// Telegram: se activa solo si el servidor tiene TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID.
const TG = { activo: false,
  async enviar(a) {
    const d = N.diasRestantes(a.limite, est.hoy);
    let r; try { r = await fetch('/.netlify/functions/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proyecto: PROY[a.proyecto].nombre, documento: `${a.doc_id} rev. ${a.doc.revision}`, elemento: a.elemento, cambio: primeraFrase(a.cambio), fecha_limite: N.fmtFecha(a.limite), dias: d < 0 ? `venció hace ${-d} días` : `quedan ${d} días`, estado: est.decisiones[a.id] ? `Decisión: ${est.decisiones[a.id].estado}` : 'Por decidir' }) }); }
    catch { throw new Error('Sin conexión con el servidor para enviar el aviso.'); }
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.mensaje || `El servidor respondió ${r.status}.`); return j;
  } };
const DRV = { get activo() { return DRIVE.activo(); }, subir: (b, n) => DRIVE.subir(b, n), elegir: o => DRIVE.elegir(o) };
async function iniciarConexiones() {
  try { const r = await fetch('/.netlify/functions/telegram'); if (r.ok && (r.headers.get('content-type') || '').includes('json')) TG.activo = !!(await r.json()).configurado; } catch { }
  await DRIVE.iniciar();
  if (TG.activo || DRIVE.activo()) render();
}
function icsDe(a) {
  const pp = P(a);
  return CAL.ics({ id: a.id, limite: a.limite, resumen: `Vence plazo para notificar · ${a.doc_id} · ${a.elemento}`,
    descripcion: `${PROY[a.proyecto].nombre}. Cláusula ${pp.clausula}: ${pp.plazo} días ${pp.tipo_dias === 'habiles' ? 'hábiles' : 'calendario'} desde la recepción (${N.fmtFecha(a.fecha_recepcion)}). Cambio: ${primeraFrase(a.cambio)} Cita: «${a.cita}». Fecha calculada por Reloj Contractual (demostración).` });
}
// Panel de decisiones del cambio: cada rol ve solo los botones de su punto de decisión.
function panelDecision(a) {
  const dec = est.decisiones[a.id], ap = est.aprobaciones[a.id], emi = est.emitidas[a.id];
  const pasos = [
    ['Decidir el cambio', 'Oficina técnica', dec ? `${{ confirmada: 'Confirmado', corregida: 'Partida corregida', descartada: 'Descartado' }[dec.estado]}${dec.partida && dec.partida !== a.partida ? ` a ${dec.partida}` : ''}` : null],
    ['Aprobar la variación', 'Jefe/a de OT', ap ? (ap.estado === 'aprobada' ? 'Aprobada' : 'Archivada sin notificar') : dec?.estado === 'descartada' ? 'No aplica' : null],
    ['Emitir la carta', 'Gerente', emi ? `Emitida el ${N.fmtFecha(emi.fecha)}` : ap?.estado === 'archivada' || dec?.estado === 'descartada' ? 'No aplica' : null],
  ];
  const actual = pasos.findIndex(p => !p[2]);
  let accion = '';
  if (!dec) accion = puede('decidir') ? `<div class="acciones"><button class="btn prim" data-d="confirmada">Confirmar</button><button class="btn" data-d="corregida">Corregir partida</button><button class="btn" data-d="descartada">Descartar</button></div>
      <div id="d-corr" hidden style="margin-top:10px"><label class="tit" for="d-sel">Partida correcta</label><select id="d-sel" style="max-width:100%">${proyecto.partidas.map(x => `<option value="${x.codigo}" ${x.codigo === a.partida ? 'selected' : ''}>${x.codigo} ${esc(x.desc)}</option>`).join('')}</select> <button class="btn peq prim" id="d-corr-ok">Guardar corrección</button></div>` : notaRol('decidir', 'Decidir este cambio');
  else if (dec.estado !== 'descartada' && !ap) accion = puede('aprobar') ? `<div class="acciones"><button class="btn prim" id="d-aprobar">Aprobar y habilitar la carta</button><button class="btn" id="d-archivar">Archivar sin notificar</button></div>` : notaRol('aprobar', 'Aprobar la variación');
  else if (ap?.estado === 'aprobada' && !emi) accion = puede('redactar') ? `<div class="acciones"><a class="btn prim" id="d-carta" href="#salidas-${a.id.toLowerCase()}">${puede('emitir') ? 'Revisar y registrar la emisión' : 'Redactar carta, acta o informe'}</a></div>` : notaRol('redactar', 'Redactar el documento');
  else if (emi) accion = `<div class="acciones"><a class="btn" href="#salidas-${a.id.toLowerCase()}">Ver el documento emitido</a></div>`;
  const deshacer = dec && !ap && !emi && puede('decidir') ? '<button class="btn peq" id="d-deshacer">Deshacer la decisión</button>' : '';
  return `<div class="panel" id="panel-decision"><h3>Decisiones</h3>
    <ol class="pasos-dec">${pasos.map(([t, q, r], k) => `<li class="${r ? 'hecho' : k === actual ? 'actual' : ''}"><b>${t}</b><small>${q}${r ? ` · ${esc(r)}` : k === actual ? ' · le toca ahora' : ''}</small></li>`).join('')}</ol>
    ${accion}${deshacer ? `<div class="fila-btn" style="margin-top:8px">${deshacer}</div>` : ''}</div>`;
}
function vAlerta(id) {
  const a = alertaPorId[id];
  if (!a) { $('#v-alerta').innerHTML = `<p class="vacio">No existe el cambio ${esc(id)}. <a href="#bandeja">Volver a la bandeja</a></p>`; return; }
  const d = a.doc, dec = est.decisiones[a.id], e = estadoDe(a);
  const cuerpoNuevo = d.tipo === 'Lámina' ? conCita(d.texto, a.cita) : conCita(d.texto, a.cita);
  $('#v-alerta').innerHTML = `
    <a class="volver" href="#bandeja">← Bandeja de cambios</a>
    <div class="det-cab">${diasBadge(a)}<div><h2>${esc(a.doc_id)} rev. ${esc(d.revision)} · ${esc(a.elemento)}</h2><p class="frase">${esc(fraseDias(a))}</p></div></div>
    <div class="panel plazo-panel"><div class="plazo-cab"><h3>Plazo contractual</h3><span class="pista-txt">${esc(PROY[a.proyecto].nombre)} · <a href="#plazos">parámetros</a></span></div>${barraPlazo(a)}
      <details class="tec cal-det" open><summary>Ver el plazo en el calendario</summary>${CAL.calendarioPlazo({ inicio: a.fecha_recepcion, limite: a.limite, feriados: FER(a), tipo: P(a).tipo_dias, hoy: est.hoy, refMax: REF.max, titulo: `${a.doc_id} · ${a.elemento}` })}</details>
      <div class="fila-btn" style="margin-top:10px"><button class="btn peq" id="d-ics">Agregar al calendario (.ics)</button>${TG.activo ? '<button class="btn peq" id="d-tg">Enviar aviso por Telegram</button>' : ''}<span class="pista-txt" style="align-self:center">Evento el ${N.fmtFecha(a.limite)} con aviso dos días antes. Sirve con Google Calendar, Outlook y Apple.</span></div><div id="d-tg-msg" aria-live="polite"></div>
      <div class="fecha-rec"><label class="tit" for="d-rec">Fecha de recepción en el CDE</label><input type="date" id="d-rec" value="${a.fecha_recepcion}"><button class="btn peq" id="d-rec-ok">Corregir fecha</button>${recepcionCorr[a.id] ? `<button class="btn peq" id="d-rec-reset">Volver a ${N.fmtFecha(d.fecha_recepcion)}</button><span class="pista-txt">Corregida a mano; el documento registra ${N.fmtFecha(d.fecha_recepcion)}.</span>` : ''}</div></div>
    <div class="det-cuerpo">
      <div>
        <div class="panel"><h3>${d.tipo === 'Lámina' ? 'Qué cambió entre revisiones' : 'Qué dice el documento'}</h3>
          ${d.tipo === 'Lámina' ? `<div class="dos"><div class="doc"><div class="cab"><span>Rev. ${esc(d.revision_anterior)}</span></div>${esc(d.texto_anterior)}</div><div class="doc"><div class="cab"><span>Rev. ${esc(d.revision)} · cambios en nube</span><span>${N.fmtFecha(d.fecha_recepcion)}</span></div>${diffHTML(d.texto_anterior, d.texto)}</div></div>`
          : `${d.texto_anterior ? `<div class="doc" style="margin-bottom:10px"><div class="cab"><span>${esc(d.revision_anterior)}</span></div>${esc(d.texto_anterior)}</div>` : ''}<div class="doc"><div class="cab"><span>${esc(d.tipo)} · ${esc(d.emisor)}</span><span>${N.fmtFecha(d.fecha_recepcion)}</span></div>${cuerpoNuevo}</div>`}
          <div class="check"><span class="ico si">✓</span><div><b>Cita verificada en el documento:</b> «${esc(a.cita)}»</div></div>
        </div>
        <div class="panel"><div class="plazo-cab"><h3>Trazabilidad del caso</h3><a class="pista-txt" href="#auditoria">Registro de auditoría sellado</a></div>${trazaCaso(a)}</div>
      </div>
      <div>
        ${panelDecision(a)}<div id="opinion-slot"></div>
        <div class="panel"><h3>Lo que propone la IA ${IA.chipIA(a.origen_ia || 'registrada')}</h3><p>${esc(a.cambio)}</p><p style="font-size:.88rem;color:var(--texto-2);margin-top:6px">Ubicación: ${esc(a.ubicacion)}</p></div>
        <div class="panel"><h3>Partida del presupuesto</h3>
          <p class="partida">${a.partida ? `<code>${esc(a.partida)}</code> ${esc(a.partida_desc)}` : '<b>Sin partida en el presupuesto contractual</b>'} <span class="conf ${a.confianza}">Confianza ${a.confianza}</span></p>
          ${a.criterios ? `<div class="criterios">${['Mismo elemento', 'Misma especialidad', 'Ubicación compatible', 'Rango o unidad'].map((t, i) => `<div class="check"><span class="ico ${a.criterios[i] ? 'si' : 'no'}">${a.criterios[i] ? '✓' : '✗'}</span>${t}</div>`).join('')}</div>` : ''}
          ${a.alternativa ? `<p style="font-size:.88rem">Alternativa: <code>${esc(a.alternativa)}</code> ${esc(a.alternativa_desc)}</p>` : ''}
          <details class="tec"><summary>Por qué esta partida</summary><p>${esc(a.sustento)}</p></details>
        </div>
      </div>
    </div>`;
  const decidir = (estado, partida) => { EV.registrarDecision({ id: a.id, doc: a.doc_id, rol: rolN(), estado, partida_propuesta: a.partida, partida_final: partida ?? a.partida, demo: true }); est.decisiones[a.id] = { estado, partida: partida ?? a.partida }; registrar(rolN(), `${a.doc_id} · cambio ${({ confirmada: 'confirmado', corregida: 'corregido', descartada: 'descartado' })[estado]}${estado === 'corregida' ? `: partida ${partida} (la IA propuso ${a.partida || 'ninguna'})` : ''}`, { tipo: estado === 'corregida' ? 'corregido' : 'revisado', alerta: a.id }); vAlerta(id); EV.ofrecerOpinion($('#opinion-slot'), `decision:${a.id}`, rolN()); };
  document.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { if (b.dataset.d === 'corregida') { $('#d-corr').hidden = false; $('#d-sel').focus(); return; } decidir(b.dataset.d); });
  const ok = $('#d-corr-ok'); if (ok) ok.onclick = () => decidir('corregida', $('#d-sel').value);
  $('#d-ics').onclick = () => { CAL.descargarIcs(icsDe(a), `plazo_${a.doc_id}_${a.id}.ics`.replace(/[^\w.-]+/g, '_')); registrar(rolN(), `${a.doc_id} · fecha límite agregada al calendario (.ics)`, { tipo: 'registro', alerta: a.id }); };
  const tg = $('#d-tg'); if (tg) tg.onclick = async () => { tg.disabled = true; $('#d-tg-msg').innerHTML = '<p class="estado-ia"><span class="spin"></span>Enviando aviso…</p>'; try { await TG.enviar(a); $('#d-tg-msg').innerHTML = '<p class="aviso ok" style="margin-top:8px">Aviso enviado por Telegram.</p>'; registrar(rolN(), `${a.doc_id} · aviso enviado por Telegram`, { tipo: 'registro', alerta: a.id }); } catch (e) { $('#d-tg-msg').innerHTML = `<p class="aviso mal" style="margin-top:8px">${esc(e.message)}</p>`; } tg.disabled = false; };
  const apr = $('#d-aprobar'); if (apr) apr.onclick = () => { est.aprobaciones[a.id] = { estado: 'aprobada', fecha: est.hoy }; registrar(rolN(), `${a.doc_id} · variación aprobada: se habilita la carta`, { tipo: 'revisado', alerta: a.id }); vAlerta(id); };
  const arc = $('#d-archivar'); if (arc) arc.onclick = () => { est.aprobaciones[a.id] = { estado: 'archivada', fecha: est.hoy }; registrar(rolN(), `${a.doc_id} · archivado sin notificar`, { tipo: 'revisado', alerta: a.id }); vAlerta(id); };
  const des = $('#d-deshacer'); if (des) des.onclick = () => { delete est.decisiones[a.id]; registrar(rolN(), `${a.doc_id} · decisión deshecha`, { tipo: 'corregido', alerta: a.id }); vAlerta(id); };
  const fijarRec = v => { if (v) recepcionCorr[a.id] = v; else delete recepcionCorr[a.id]; try { localStorage.setItem('rc-recepcion', JSON.stringify(recepcionCorr)); } catch { } recalcular1(a); registrar(rolN(), `${a.doc_id} · fecha de recepción ${v ? `corregida a ${N.fmtFecha(v)}` : 'restablecida'}`, { tipo: 'corregido', alerta: a.id }); vAlerta(id); pintarFecha(); };
  $('#d-rec-ok').onclick = () => { const v = $('#d-rec').value; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return; fijarRec(v === d.fecha_recepcion ? null : v); };
  const rr = $('#d-rec-reset'); if (rr) rr.onclick = () => fijarRec(null);
}

// ---------- RESULTADOS ----------
function vCalidad() {
  const b = cifras.corpus_base, pn = cifras.prueba_nueva, s = cifras.linea_base_sin_ia;
  const de = (x, n) => `${x} de ${n}`;
  const okPartida = m => Math.round(m.vinculacion * m.detectados);
  const R = consulta?.respuestas || [];
  const filasModelo = (cifras.precision_por_modelo || []).map(f => `<tr><td>${esc(f.modelo)} <small class="pista-txt">· IA registrada en vivo</small></td><td>${N.fmtFecha(f.fecha)}</td><td>${f.documentos}</td><td>${de(f.detectados, f.cambios_referencia)}</td><td>${f.falsas_alarmas}</td><td>${de(f.partida_correcta, f.detectados)}</td></tr>`).join('');
  $('#v-calidad').innerHTML = `
    <div class="tab-cab"><div><h2>Calidad</h2><p class="sub2">Qué se midió, con qué tamaño de muestra y qué no se afirma.</p></div></div>
    <div class="resumen-dia" role="group" aria-label="Cifras clave">
      <div class="kpi"><b class="num">${R.length ? `${EV.mediana(R.map(r => r.entender_dias))} días` : '—'}</b>tarda hoy entender un cambio (mediana${R.length ? `, n = ${R.length} profesionales` : ', sin medir todavía'})</div>
      <div class="kpi nuevo"><b class="num">${pn.corrida_1.detectados} y ${pn.corrida_2.detectados} de ${pn.cambios_referencia}</b>cambios detectados en ${pn.documentos} documentos nuevos (prueba ciega, medición de desarrollo)</div>
      <div class="kpi emitir"><b class="num" id="pr-kpi">—</b>pruebas automatizadas superadas ahora, en este navegador</div></div>
    <p class="frase-seguridad">La seguridad no depende del modelo: cada cita se verifica contra el documento y los plazos los calcula una fórmula.</p>
    <section class="seccion"><h3>Precisión por modelo</h3><p class="pista-txt" style="margin:4px 0 10px">Prueba ciega congelada: ${pn.documentos} documentos nuevos con ${pn.cambios_referencia} cambios, respuestas correctas escritas antes de correr la IA y el mismo cálculo para cada modelo.</p>
      <div class="panel scroll-x"><table class="t"><thead><tr><th>Modelo</th><th>Fecha</th><th>Documentos</th><th>Cambios detectados</th><th>Falsas alarmas</th><th>Partida correcta</th></tr></thead><tbody>
        <tr><td>Claude <small class="pista-txt">· medición de desarrollo</small></td><td>${N.fmtFecha(cifras.generado.slice(0, 10))}</td><td>${pn.documentos}</td><td>${de(pn.corrida_1.detectados, pn.cambios_referencia)} y ${de(pn.corrida_2.detectados, pn.cambios_referencia)}</td><td>${pn.corrida_1.falsos_positivos} y ${pn.corrida_2.falsos_positivos}</td><td>${de(okPartida(pn.corrida_1), pn.corrida_1.detectados)} y ${de(okPartida(pn.corrida_2), pn.corrida_2.detectados)}</td></tr>
        ${filasModelo || `<tr><td>IA registrada <small class="pista-txt">· por defecto: Gemini</small></td><td colspan="5"><span class="aud-mal">Sin medir todavía.</span> <span class="pista-txt">Se mide con <code>npm run medir-ia</code> contra la función publicada, con la misma referencia.</span></td></tr>`}
      </tbody></table></div></section>
    ${EV.vistaEvidencia({ cifras, consulta })}
    <details class="panel detalle-tec"><summary><b>Detalle técnico de las mediciones</b></summary>
      <div class="lectura" style="margin-top:10px"><ul>
        <li><b>Corpus base (sintético):</b> ${de(b.v1_1.detectados, b.v1_1.cambios_referencia)} cambios detectados, ${b.v1_1.falsos_positivos} falsas alarmas. La instrucción vigente se afinó con este corpus; por eso pesa más la prueba ciega.</li>
        <li><b>Documentos nuevos:</b> ${de(pn.corrida_1.detectados, pn.cambios_referencia)} y ${de(pn.corrida_2.detectados, pn.cambios_referencia)} en dos mediciones. En una, la IA juntó tabique y puerta del cuarto de máquinas en una sola alerta y la puerta quedó sin partida.</li>
        <li><b>Sin IA:</b> un comparador de texto encuentra ${de(s.corpus_base.detectados, s.corpus_base.cambios)} cambios, pero marca ${s.corpus_base.falsas_alarmas} líneas que no importan (rótulos, redacción), no lee cartas ni RFI y no propone partida.</li>
        <li><b>Repetibilidad:</b> con la misma entrada, la primera instrucción cambió su respuesta en ${de(b.docs_con_diferencias_entre_corridas.v1_0, 40)} documentos y la vigente en ${de(b.docs_con_diferencias_entre_corridas.v1_1, 40)}; con documentos nuevos, en 1 de 10.</li></ul></div>
      <div class="scroll-x" style="margin-top:10px"><table class="t"><thead><tr><th>Medición</th><th>Cambios detectados</th><th>Alertas sin cambio real</th><th>Partida correcta</th><th>Documentos sin cambios bien reconocidos</th></tr></thead><tbody>
        ${[['Corpus base · primera instrucción', b.v1_0], ['Corpus base · primera instrucción, repetición', b.v1_0_rep], ['Corpus base · instrucción vigente', b.v1_1], ['Corpus base · instrucción vigente, repetición', b.v1_1_rep], ['Documentos nuevos · medición 1', pn.corrida_1], ['Documentos nuevos · medición 2', pn.corrida_2]].map(([n, m]) => `<tr><td>${n}</td><td>${de(m.detectados, m.cambios_referencia)}</td><td>${de(m.falsos_positivos, m.alertas)}</td><td>${de(okPartida(m), m.detectados)}</td><td>${m.docs_sin_cambio_ok.replace('/', ' de ')}</td></tr>`).join('')}
        <tr><td>Sin IA · corpus base</td><td>${de(s.corpus_base.detectados, s.corpus_base.cambios)}</td><td>${de(s.corpus_base.falsas_alarmas, s.corpus_base.lineas_marcadas)} líneas</td><td>no vincula</td><td>—</td></tr>
        <tr><td>Sin IA · documentos nuevos</td><td>${de(s.prueba_nueva.detectados, s.prueba_nueva.cambios)}</td><td>${de(s.prueba_nueva.falsas_alarmas, s.prueba_nueva.lineas_marcadas)} líneas</td><td>no vincula</td><td>—</td></tr></tbody></table></div>
      <section class="seccion" id="pruebas"><h3>Pruebas automatizadas</h3><p class="pista-txt" style="margin:4px 0 10px">Se ejecutan ahora, en este navegador, sobre la misma lógica que usa la app (nucleo.js). Cada una dice qué garantiza.</p>
        <div class="fila-btn" style="justify-content:space-between;align-items:center;margin-bottom:8px"><b id="pr-total"></b><button class="btn peq" id="pr-correr">Volver a ejecutar las pruebas</button></div><ul class="pruebas" id="pr-lista"></ul></section>
      <section class="seccion"><h3>Lo que dijeron al probarlo</h3><div class="casos3" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <div class="vidrio caso3"><span class="etq">Residente de obra</span><p>«Me sirve que permita comparar documentos y reconocer cambios sin tener que revisar manualmente todas las páginas.»</p></div>
        <div class="vidrio caso3"><span class="etq">Oficina técnica</span><p>«Agregaría una alerta que indique qué cambios pueden afectar costos, metrados o partidas y cuánto plazo queda para notificarlos.»</p></div></div>
        <p class="pista-txt" style="margin-top:8px"><a href="#simulacion">Ver el caso E-204 paso a paso</a></p></section>
    </details>`;
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
  $('#pr-total').textContent = `${ok} de ${cp.length} pruebas superadas ahora`; const k = $('#pr-kpi'); if (k) k.textContent = `${ok} de ${cp.length}`;
  $('#pr-lista').innerHTML = cp.map(c => `<li class="${c.ok ? 'si' : 'no'}"><span class="ico ${c.ok ? 'si' : 'no'}" aria-label="${c.ok ? 'Superada' : 'Fallida'}">${c.ok ? '✓' : '✗'}</span><div><b>${esc(GARANTIZA[c.id] || c.esc)}</b><small>${esc(c.esc)} · resultado: ${esc(c.det)}</small></div></li>`).join('');
}

// ---------- AUDITORÍA ----------
const fHora = iso => { const d = new Date(iso); return `${d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`; };
async function vAuditoria(estados = null) {
  await AUD.listo();
  const ev = [...AUD.lista()].map((e, i) => ({ ...e, i })).reverse(), alt = AUD.alterado();
  const roto = estados && estados.some(x => x !== 'ok');
  $('#v-auditoria').innerHTML = `
    <div class="tab-cab"><div><h2>Registro de auditoría</h2><p class="sub2">La prueba de que nadie alteró nada: todos los eventos de todos los casos, en orden, cada uno sellado con el hash SHA-256 del anterior. Si alguien cambia o borra un evento, la cadena se rompe desde ese punto y se nota al verificar. La historia de un caso concreto está en su detalle, en «Trazabilidad del caso».</p></div></div>
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
        ${puede('plazos') ? `<div class="fila-btn" style="margin-top:14px"><button class="btn prim" id="pz-ok">Validar y recalcular</button>${mod ? '<button class="btn" id="pz-reset">Restablecer valores del contrato</button>' : ''}</div>` : notaRol('plazos', 'Validar los parámetros del contrato')}
        <div id="pz-msg" aria-live="polite"></div>
      </form>
      <div class="panel"><h3>Vista previa</h3><p>Un documento recibido hoy (${N.fmtFecha(est.hoy)}) vence el <b style="color:var(--naranja)">${N.fmtFecha(ej)}</b>.</p>
        ${CAL.calendarioPlazo({ inicio: est.hoy, limite: ej, feriados: fer, tipo: pp.tipo_dias, hoy: est.hoy, titulo: 'Documento recibido hoy' })}
        <p class="pista-txt" style="margin-top:10px">${abiertos} cambio${abiertos === 1 ? '' : 's'} abierto${abiertos === 1 ? '' : 's'} de este proyecto se recalculan al guardar.</p>
        ${id === 'R1' ? `<details class="tec"><summary>Texto de la cláusula ${esc(clausula143.clausula)}</summary><blockquote class="aviso info" style="margin:8px 0 0">«${esc(clausula143.texto_literal)}»</blockquote></details>` : ''}</div>
      <div class="panel"><h3>Feriados</h3><p class="pista-txt">Se descuentan solo cuando el plazo es en días hábiles.</p>
        <ul class="feriados">${fer.map(f => `<li><span class="num">${N.fmtFecha(f)}</span>${puede('plazos') ? `<button class="btn peq" data-quita="${f}" aria-label="Quitar feriado ${N.fmtFecha(f)}">Quitar</button>` : ''}</li>`).join('')}</ul>
        ${puede('plazos') ? '<div class="fila-btn"><label class="sr" for="pz-f">Nuevo feriado</label><input type="date" id="pz-f"><button class="btn peq" id="pz-fadd">Agregar feriado</button></div>' : ''}</div>
    </div>`;
  document.querySelectorAll('[data-proy]').forEach(b => b.onclick = () => { est.proyecto = b.dataset.proy; guardarActivo(); vPlazos(); });
  if (puede('plazos')) document.querySelectorAll('#f-plazo input').forEach(i => i.disabled = false); else document.querySelectorAll('#f-plazo input').forEach(i => i.disabled = true);
  if (!puede('plazos')) { document.querySelectorAll('[data-proy]').forEach(b => b.onclick = () => { est.proyecto = b.dataset.proy; guardarActivo(); vPlazos(); pintarProyecto(); }); return; }
  $('#pz-ok').onclick = () => {
    const n = Number($('#pz-n').value), t = document.querySelector('[name="pz-t"]:checked').value, cl = $('#pz-cl').value.trim() || pp.clausula;
    if (!Number.isInteger(n) || n < 1 || n > 120) { $('#pz-msg').innerHTML = '<p class="aviso mal" style="margin-top:8px">El plazo debe ser un número entero entre 1 y 120 días.</p>'; return; }
    guardarProy(id, { params: { ...pp, plazo: n, tipo_dias: t, clausula: cl } });
    registrar(rolN(), `${pr.nombre} · plazo fijado en ${n} días ${t === 'habiles' ? 'hábiles' : 'calendario'} (cláusula ${cl})`, { tipo: 'parametro' });
    vPlazos(); pintarFecha(); $('#pz-msg').innerHTML = '<p class="aviso ok" style="margin-top:8px">Parámetros guardados. Todas las fechas límite y semáforos se recalcularon.</p>';
  };
  const rs = $('#pz-reset'); if (rs) rs.onclick = () => { delete ajustesProy[id]; try { localStorage.setItem('rc-proyectos', JSON.stringify(ajustesProy)); } catch { } recalcular(); registrar(rolN(), `${pr.nombre} · parámetros restablecidos a los del contrato`, { tipo: 'parametro' }); vPlazos(); pintarFecha(); };
  document.querySelectorAll('[data-quita]').forEach(b => !puede('plazos') ? b.remove() : null);
  document.querySelectorAll('[data-quita]').forEach(b => b.onclick = () => { guardarProy(id, { feriados: fer.filter(f => f !== b.dataset.quita) }); vPlazos(); pintarFecha(); });
  $('#pz-fadd').onclick = () => { const v = $('#pz-f').value; if (!v || fer.includes(v)) return; guardarProy(id, { feriados: [...fer, v].sort() }); vPlazos(); pintarFecha(); };
}
function guardarActivo() { try { localStorage.setItem('rc-proyecto-activo', est.proyecto); } catch { } }

// ---------- RECORRIDO GUIADO (6 pasos, se puede saltar) ----------
const guiaVista = () => { try { return localStorage.getItem('rc-guia') === 'vista'; } catch { return false; } };
const marcarGuia = () => { try { localStorage.setItem('rc-guia', 'vista'); } catch { } };
const GUIA = [
  { t: 'Conectar', h: 'El proyecto y su entorno de datos', p: 'Arriba eliges el proyecto: cada contrato tiene su plazo para notificar. Cada revisión nueva que llega arranca ese plazo.', ir: '#inicio', foco: '#proy-btn', rol: 'control' },
  { t: 'Detectar', h: 'Compara la revisión A con la B', p: 'Con la lámina de ejemplo E-301 cargada, pulsa «Detectar cambios». El comparador marca cada zona que cambió sin usar IA.', ir: '#comparar', foco: '#cmp-ir', rol: 'control' },
  { t: 'Entender', h: 'Qué cambió, dónde y con qué prueba', p: 'La IA indica qué diferencias tienen impacto y propone la partida. Cada tarjeta trae la cita literal, verificada contra el texto de la revisión B.', ir: '#comparar', foco: '#cmp-tarjetas', antes: async () => { if (!document.querySelector('#cmp-alerta')) { $('#cmp-ir')?.click(); await esperarSel('#cmp-alerta', 15000); } } },
  { t: 'Decidir', h: 'Oficina técnica decide', p: 'El cambio ya está en la bandeja con su plazo. Como oficina técnica, revisa la evidencia y pulsa «Confirmar» (o corrige la partida). Nada se emite sin esta decisión: el recorrido sigue cuando la tomes.', ir: null, foco: '#panel-decision .acciones', rol: 'ot',
    antes: async () => { if (location.hash.startsWith('#comparar')) { if (!document.querySelector('#cmp-alerta')) { $('#cmp-ir')?.click(); await esperarSel('#cmp-alerta', 15000); } $('#cmp-alerta')?.click(); await new Promise(r => setTimeout(r, 350)); } },
    espera: () => { const r = ruta(); return r.vista === 'alerta' && !!est.decisiones[r.id]; } },
  { t: 'Emitir', h: 'Aprobar y emitir', p: 'Ahora como jefe/a de oficina técnica: pulsa «Aprobar y habilitar la carta». Luego, como gerente, verás la carta con la cita, la partida y la fecha límite resaltadas, lista para exportar y registrar su emisión.', ir: null, foco: '#panel-decision .acciones', rol: 'jefe',
    espera: () => { const r = ruta(); return (r.vista === 'alerta' && !!est.aprobaciones[r.id]) || r.vista === 'salidas'; },
    alListo: async () => { const r = ruta(); if (r.vista === 'alerta') { fijarRol('gerente', 'recorrido guiado'); location.hash = `#salidas-${r.id.toLowerCase()}`; await new Promise(x => setTimeout(x, 300)); } const f = document.querySelector('.sal-emitir'); if (f) { f.classList.add('foco-guia'); f.scrollIntoView({ block: 'center' }); reubicarGuia(f); }
      const caja = $('#guia'); if (caja) { caja.querySelector('h3').textContent = 'El gerente emite'; caja.querySelector('p').textContent = 'Variación aprobada. Como gerente: la carta trae la cita, la partida y la fecha límite resaltadas. Expórtala en DOCX, PDF o MD y pulsa «Registrar emisión» cuando se firme.'; } } },
  { t: 'Auditar', h: 'Quién decidió qué y cuándo', p: 'Cada paso quedó en una línea de tiempo sellada: detección, decisión y emisión, cada uno con el hash del anterior. Pulsa «Verificar integridad»: si alguien altera un evento, la cadena se rompe.', ir: '#auditoria', foco: '#aud-verificar' },
];
let guiaPaso = -1;
const esperarSel = (sel, ms = 8000) => new Promise(ok => { const t0 = Date.now(); const f = () => { if (document.querySelector(sel) || Date.now() - t0 > ms) ok(); else setTimeout(f, 150); }; f(); });
// Si la tarjeta del recorrido tapa el elemento resaltado, se mueve arriba.
function reubicarGuia(el) {
  const g = $('#guia'); if (!g || !el) return;
  g.classList.remove('arriba');
  const a = g.getBoundingClientRect(), b = el.getBoundingClientRect();
  if (!(b.right < a.left || b.left > a.right || b.bottom < a.top || b.top > a.bottom)) g.classList.add('arriba');
}
function iniciarGuia() { marcarGuia(); $('#invita-guia')?.remove(); guiaPaso = 0; pasoGuia(); }
function cerrarGuia() { guiaPaso = -1; $('#guia')?.remove(); document.querySelectorAll('.foco-guia').forEach(e => e.classList.remove('foco-guia')); $('#guia-abrir').focus(); }
async function pasoGuia() {
  const g = GUIA[guiaPaso];
  document.querySelectorAll('.foco-guia').forEach(e => e.classList.remove('foco-guia'));
  if (g.rol && est.rol !== g.rol) fijarRol(g.rol, 'recorrido guiado');
  if (g.ir && location.hash !== g.ir) { location.hash = g.ir; await new Promise(r => setTimeout(r, 250)); }
  let caja = $('#guia');
  if (!caja) { caja = document.createElement('aside'); caja.id = 'guia'; caja.className = 'guia'; caja.setAttribute('aria-label', 'Recorrido guiado'); caja.setAttribute('aria-live', 'polite'); document.body.append(caja); }
  caja.innerHTML = `<div class="pasos-g" aria-hidden="true">${GUIA.map((_, k) => `<span class="${k <= guiaPaso ? 'on' : ''}"></span>`).join('')}</div><small>Paso ${guiaPaso + 1} de 6 · ${g.t} · rol: ${esc(rolN())}</small><h3>${g.h}</h3><p>${g.p}</p>${g.rol ? '<p class="pista-txt" style="margin-top:-6px">Durante el recorrido, el rol cambia solo (demostración).</p>' : ''}
    <div class="fila-btn"><button class="btn peq" id="g-saltar">Salir del recorrido</button><span style="display:flex;gap:8px">${guiaPaso ? '<button class="btn peq" id="g-ant">Anterior</button>' : ''}<button class="btn peq prim" id="g-sig">${guiaPaso === 5 ? 'Terminar' : 'Siguiente'}</button></span></div>`;
  $('#g-saltar').onclick = cerrarGuia;
  const ant = $('#g-ant'); if (ant) ant.onclick = () => { guiaPaso--; pasoGuia(); };
  $('#g-sig').onclick = async () => {
    if (guiaPaso === 5) { cerrarGuia(); const f = $('#opinion-flotante'); EV.ofrecerOpinion(f, 'recorrido', rolN()); return; }
    guiaPaso++; pasoGuia();
  };
  if (g.antes) { $('#g-sig').disabled = true; await g.antes(); $('#g-sig').disabled = false; }
  if (g.espera && !g.espera()) {
    const b = $('#g-sig'); b.disabled = true; b.title = 'Toma la decisión para seguir';
    const t = setInterval(() => { if (guiaPaso < 0 || !document.body.contains(b)) return clearInterval(t); if (g.espera()) { clearInterval(t); document.querySelectorAll('.foco-guia').forEach(e => e.classList.remove('foco-guia')); const fin = () => { b.disabled = false; b.title = ''; const p = document.querySelector('#guia small'); if (p) p.textContent = `Paso ${guiaPaso + 1} de 6 · ${g.t} · rol: ${rolN()}`; b.focus({ preventScroll: true }); }; if (g.alListo) g.alListo().then(fin); else { const f2 = document.querySelector('#panel-decision'); if (f2) f2.classList.add('foco-guia'); fin(); } } }, 300);
  }
  const f = document.querySelector(g.foco);
  if (f) { f.classList.add('foco-guia'); f.scrollIntoView({ behavior: 'auto', block: innerWidth < 700 ? 'start' : 'center' }); reubicarGuia(f); }
  if (!$('#g-sig').disabled) $('#g-sig').focus({ preventScroll: true });
}
$('#guia-abrir').onclick = () => { if (guiaPaso >= 0) cerrarGuia(); else iniciarGuia(); };
addEventListener('keydown', e => { if (e.key === 'Escape' && guiaPaso >= 0) cerrarGuia(); });

// ---------- AJUSTES ----------
function pintarModoIA() {
  const m = IA.modoIA(), b = $('#estado-ia');
  b.innerHTML = `<i></i>${esc(IA.ETIQUETA[m])}`; b.title = m === 'servidor' && !IA.servidorResponde() ? 'IA registrada: no respondió en la última prueba' : IA.etiquetaModo(); b.classList.toggle('falla', m === 'servidor' && !IA.servidorResponde()); b.classList.toggle('vivo', m === 'servidor' || m === 'clave'); b.classList.toggle('manual', m === 'manual');

}
function vAjustes() {
  const m = IA.modoIA(), clave = IA.claveUsuario(), e = IA.estadoInicial, cfg = IA.configClave();
  const srv = !e ? '' : e.prueba?.ok ? `<span class="aud-ok">✓ Respondió en la última prueba (${e.prueba.ms} ms)</span>` : e.prueba ? `<span class="aud-mal">No respondió en la última prueba: ${esc(e.prueba.detalle)}</span>` : e.servidor && e.clave ? '<span class="aud-mal">Sin probar</span>' : e.servidor ? '<span class="aud-mal">El servidor no tiene clave configurada</span>' : '<span class="aud-mal">Servidor no disponible en esta versión</span>';
  const caminos = [
    ['servidor', IA.NOMBRE_MODO.servidor, 'La app consulta la IA configurada en su servidor. La clave vive en el servidor y nunca llega al navegador.', 'Conviene para evaluar la app: no necesitas configurar nada.', `${srv}<small class="pista-txt">Por defecto: Gemini${e?.modelo ? ` (${esc(e.modelo)})` : ''}.</small>`],
    ['clave', IA.NOMBRE_MODO.clave, 'Usa tu propia clave de un proveedor compatible: Gemini, cualquier API compatible con OpenAI (OpenAI, Groq, OpenRouter, Mistral, DeepSeek…) o Anthropic. Las consultas salen desde este navegador.', 'Conviene si prefieres tu proveedor o tu cuota, o si la IA registrada alcanzó su límite.', clave ? `<span class="aud-ok">✓ Clave guardada en esta pestaña</span><small class="pista-txt">${esc(IA.PROVEEDORES[cfg.prov].n.split(' (')[0])} · ${esc(cfg.modelo)}</small>` : ''],
    ['manual', IA.NOMBRE_MODO.manual, 'La app te muestra el prompt completo; lo pegas en la IA que prefieras y pegas su respuesta. Se valida igual.', 'Conviene si no quieres que la app envíe datos o usas una IA sin API.', ''],
  ];
  $('#v-ajustes').innerHTML = `
    <div class="tab-cab"><div><h2>Ajustes de IA</h2><p class="sub2">El modelo solo lee y propone. En todos los caminos, la app verifica cada cita contra el texto, recalcula la confianza de la partida y calcula los plazos con fórmulas, nunca con la IA.</p></div></div>
    <h3 style="margin:6px 0 10px">Cómo conectar la IA</h3>
    <fieldset class="modos"><legend class="sr">Camino de IA</legend>${caminos.map(([k, t, d, c, st]) => `<label class="modo ${m === k ? 'activo' : ''}"><input type="radio" name="modo-ia" value="${k}" ${m === k ? 'checked' : ''}><span class="modo-t">${t}</span><span class="modo-d">${d}</span><span class="modo-c"><b>Cuándo conviene:</b> ${c}</span>${st ? `<span class="modo-st">${st}</span>` : ''}</label>`).join('')}</fieldset>
    <label class="modo modo-sin ${m === 'demo' ? 'activo' : ''}"><input type="radio" name="modo-ia" value="demo" ${m === 'demo' ? 'checked' : ''}><span class="modo-t">${IA.NOMBRE_MODO.demo} <span class="etq ambar">demostración</span></span><span class="modo-d">Usa las respuestas guardadas en la medición con documentos nuevos (16/11/2026) y la preparada para la lámina E-301. No envía datos. Solo procesa los ejemplos; el asistente responde con preguntas preparadas.</span></label>
    <div class="ajustes-grid" style="margin-top:16px">
      <div class="panel"><h3>IA registrada</h3><p class="pista-txt">Hace una consulta real y corta a la IA del servidor y muestra la respuesta o el error tal como llega.</p>
        <div class="fila-btn"><button class="btn" id="aj-probar">Probar conexión</button></div><div id="aj-estado" aria-live="polite"></div></div>
      <form class="panel" id="aj-panel-clave" onsubmit="return false"><h3>Mi propia clave API</h3><p class="pista-txt">Se guarda solo en esta pestaña (sessionStorage) y se borra al cerrarla. Nunca se envía al servidor de la app.</p>
        <label class="tit" for="aj-prov">Proveedor</label><select id="aj-prov">${Object.entries(IA.PROVEEDORES).map(([k, P]) => `<option value="${k}" ${cfg.prov === k ? 'selected' : ''}>${esc(P.n)}</option>`).join('')}</select>
        <div class="campos-plazo"><div><label class="tit" for="aj-modelo">Modelo</label><input id="aj-modelo" value="${esc(cfg.modelo)}" spellcheck="false"></div><div><label class="tit" for="aj-base">Dirección de la API</label><input id="aj-base" value="${esc(cfg.base)}" spellcheck="false"></div></div>
        <label class="tit" for="aj-clave">Clave API</label><input type="password" id="aj-clave" autocomplete="off" spellcheck="false" placeholder="${clave ? 'Clave guardada en esta pestaña' : 'Pega aquí tu clave'}">
        <div class="fila-btn" style="margin-top:10px"><button class="btn prim" id="aj-guardar">Guardar y usar mi clave</button>${clave ? '<button class="btn" id="aj-probar-clave">Probar conexión</button><button class="btn" id="aj-olvidar">Olvidar clave</button>' : ''}</div><div id="aj-clave-msg" aria-live="polite"></div></form>
    </div>
    <section class="seccion"><h3>Conexiones</h3><div class="conexiones">
      <div class="conex"><b>IA registrada</b><span>${e?.prueba?.ok ? '<span class="aud-ok">✓ Respondió en la última prueba</span>' : e?.servidor && e?.clave ? '<span class="aud-mal">Con clave, sin respuesta en la última prueba</span>' : '<span class="aud-mal">Sin clave en el servidor</span>'}</span><small>Por defecto: Gemini. Variables de Netlify: <code>GEMINI_API_KEY</code> y, opcional, <code>GEMINI_MODEL</code>.</small></div>
      <div class="conex"><b>Google Drive</b><span>${DRIVE.activo() ? '<span class="aud-ok">✓ Activo</span>' : '<span class="aud-mal">Desactivado</span>'}</span><small>Elegir revisiones en Comparar y guardar la carta. Requiere <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_API_KEY</code> en Netlify.</small></div>
      <div class="conex"><b>Telegram</b><span>${TG.activo ? '<span class="aud-ok">✓ Activo</span>' : '<span class="aud-mal">Desactivado</span>'}</span><small>Aviso al celular con el cambio y su fecha límite. Requiere <code>TELEGRAM_BOT_TOKEN</code> y <code>TELEGRAM_CHAT_ID</code> en Netlify.</small></div>
      <div class="conex"><b>Autodesk Construction Cloud y Notion</b><span><span class="etq ambar">demostración</span></span><small>Se muestran como conexión de demostración: no leen archivos reales.</small></div></div></section>
    <div class="aviso info" style="margin-top:16px"><b>Privacidad.</b> En los planes gratuitos, algunos proveedores (como Google AI Studio) pueden usar los datos enviados para mejorar sus productos. Por eso al asistente solo se le envía tu pregunta y un resumen del proyecto de demostración, nunca documentos; y en Comparar conviene usar solo documentos de demostración o sin información sensible.</div>
    <section class="seccion"><h3>Instrucciones que recibe la IA</h3><p class="pista-txt">Son las mismas en todos los caminos y las mismas con las que se midieron los resultados.</p>
      <details class="tec"><summary>Detectar cambios con impacto</summary><pre class="crudo">${esc(IA.I1())}</pre></details>
      <details class="tec"><summary>Proponer la partida del presupuesto</summary><pre class="crudo">${esc(IA.I2())}</pre></details>
      <details class="tec"><summary>Asistente conversacional</summary><pre class="crudo">${esc(SISTEMA_CHAT)}</pre></details></section>`;
  document.querySelectorAll('[name="modo-ia"]').forEach(r => r.onchange = () => {
    if (r.value === 'clave' && !IA.claveUsuario()) { vAjustes(); $('#aj-clave').focus(); $('#aj-clave-msg').innerHTML = '<p class="aviso info" style="margin-top:8px">Elige el proveedor, pega tu clave y pulsa «Guardar y usar mi clave».</p>'; return; }
    IA.fijarModo(r.value); vAjustes(); pintarModoIA();
  });
  $('#aj-prov').onchange = () => { const P = IA.PROVEEDORES[$('#aj-prov').value]; $('#aj-modelo').value = P.modelo; $('#aj-base').value = P.base; };
  const probar = async (btn, dest, cual) => { btn.disabled = true; dest.innerHTML = '<p class="estado-ia"><span class="spin"></span>Consultando…</p>'; const r = await IA.probarConexion(cual); btn.disabled = false; dest.innerHTML = `<p class="aviso ${r.ok ? 'ok' : 'mal'}" style="margin-top:8px">${r.ok ? '✓ Conexión correcta. ' : 'La conexión falló. '}${esc(r.detalle)}</p>`; };
  $('#aj-probar').onclick = async () => { await probar($('#aj-probar'), $('#aj-estado'), 'servidor'); const m = $('#aj-estado').innerHTML; vAjustes(); $('#aj-estado').innerHTML = m; pintarModoIA(); };
  const pc = $('#aj-probar-clave'); if (pc) pc.onclick = () => probar(pc, $('#aj-clave-msg'), 'clave');
  $('#aj-guardar').onclick = async () => {
    const v = $('#aj-clave').value.trim(); if (!v && !IA.claveUsuario()) { $('#aj-clave-msg').innerHTML = '<p class="aviso mal" style="margin-top:8px">Pega primero la clave.</p>'; return; }
    IA.fijarClave(v || IA.claveUsuario(), { prov: $('#aj-prov').value, modelo: $('#aj-modelo').value, base: $('#aj-base').value }); IA.fijarModo('clave'); vAjustes(); pintarModoIA();
    probar($('#aj-probar-clave'), $('#aj-clave-msg'), 'clave');
  };
  const o = $('#aj-olvidar'); if (o) o.onclick = () => { IA.fijarClave(''); if (IA.modoIA() === 'clave') IA.fijarModo('demo'); vAjustes(); pintarModoIA(); };
}

// ---------- ASISTENTE ----------
const FAQ = [
  [/qu[eé] (es|hace)|para qu[eé]|sirve/i, 'Reloj Contractual te avisa, el mismo día en que llega un documento al CDE, qué cambió, a qué partida afecta y cuántos días te quedan para notificar el adicional. La IA lee y propone; la fecha la calcula una fórmula; tú decides.'],
  [/empez|c[oó]mo (lo )?uso|primero/i, 'Empieza por el recorrido guiado (botón «?» de la barra superior): son 6 pasos con la lámina de ejemplo, de la revisión nueva a la carta. Luego abre la «Bandeja de cambios» y el cambio que vence primero.'],
  [/hoy|fecha|desliz|mover|simulad/i, 'La fecha simulada (chip «Hoy» y la barra de la bandeja) hace correr los días de la demostración. Al moverla verás cómo cada cambio pasa de verde a ámbar y a vencido.'],
  [/confianza|criterio|r-?v|partida/i, 'La partida la propone la IA, pero la confianza la calcula la app con 4 criterios: mismo elemento, misma especialidad, ubicación compatible y rango o unidad. 4 de 4 es Alta, 3 Media y 2 o menos Baja.'],
  [/cita|invent|alucin/i, 'Cada alerta trae un fragmento copiado literalmente del documento. La app lo busca en el texto: si no aparece, la alerta se rechaza. Puedes probarlo con una cita inventada en «Calidad → Ver el caso E-204 paso a paso», paso 3.'],
  [/plazo|d[ií]as|vence|cl[aá]usula/i, 'Cada proyecto tiene su plazo, en «Plazos y parámetros». En R1, la cláusula 14.3 da 7 días calendario desde la recepción. Administración contractual la valida una vez; luego la fecha límite sale de una fórmula, con feriados si son días hábiles. El modelo nunca calcula fechas.'],
  [/resultado|funciona bien|precisi|cobertura/i, 'En el corpus base detectó 41 de 41 cambios. Con 10 documentos nuevos, 7 y 8 de 8 en dos mediciones. Un comparador de texto sin IA encontró 33 de 41 con 22 falsas alarmas y no lee cartas ni RFI.'],
  [/detecta|bluebeam|procore|comparador|por qu[eé] ia/i, 'Primero un comparador sin IA marca cada zona y línea que cambió, incluido el rótulo. Luego la IA indica cuáles tienen impacto y propone la partida; la app verifica cada cita contra el texto y la confianza con 4 criterios.'],
  [/modo|gemini|clave|manual|ia en vivo/i, 'En Ajustes eliges cómo conectar la IA: la IA registrada de la app (por defecto, Gemini, con la clave en el servidor), tu propia clave API de un proveedor compatible, o el modo manual (copias el prompt, lo pegas en tu IA y pegas su respuesta). También hay respuestas de demostración sin IA en vivo. En todos los casos la app verifica cada cita.'],
  [/hash|sello|borra|audit|integridad/i, 'Cada evento guarda el sello SHA-256 del anterior. Si alguien cambia o borra un evento, los sellos dejan de coincidir y «Verificar integridad» marca en rojo desde ese punto. En esta demostración el registro vive en el navegador; en producción iría en un servidor de solo anexado.'],
  [/l[ií]mit|no (hace|mide)|falta/i, 'Limitaciones: documentos sintéticos en texto, sin DWG ni PDF escaneados; la línea base viene de solo 2 casos; falta un usuario externo; no se integra con el CDE.'],
];
const SUG = { inicio: ['¿Qué vence primero y qué hago hoy?', '¿Qué hace este asistente?'], salidas: ['¿Qué falta para emitir esta carta?', '¿Exportar es lo mismo que emitir?'], plazos: ['¿Cómo se calcula la fecha límite?', '¿Qué pasa si son días hábiles?'], ajustes: ['¿Qué modo de IA me conviene?', '¿Qué datos se envían a la IA?'], simulacion: ['¿Cómo evita que la IA invente?', '¿Cómo se calcula el plazo?'], bandeja: ['¿Qué hace la fecha simulada?', '¿Qué significan las barras?'], alerta: ['¿Qué hago hoy con este cambio?', '¿Por qué esta partida?'], comparar: ['¿Cómo detecta los cambios?', '¿Por qué no basta un comparador?'], calidad: ['¿Qué tan bien funciona?', '¿Qué limitaciones tiene?'], auditoria: ['¿Para qué sirve el hash?', '¿Qué pasa si alguien borra un evento?'] };
// Resumen del proyecto activo para el asistente: las fechas y los días ya vienen calculados por nucleo.js.
function contextoChat() {
  const r = ruta(), id = est.proyecto, pp = paramsProy(id);
  const estadoTxt = a => { const dec = est.decisiones[a.id]; if (dec) return `decidido (${dec.estado})${est.emitidas[a.id] ? ', documento emitido' : ', falta emitir el documento'}`; const e = estadoDe(a); return { vencido: 'vencido sin notificar', rojo: 'urgente', ambar: 'urgente', verde: 'en plazo' }[e] || e; };
  const lista = alertas.filter(a => a.proyecto === id && a.fecha_recepcion <= est.hoy).sort((x, y) => (!!est.decisiones[x.id]) - (!!est.decisiones[y.id]) || N.diasRestantes(x.limite, est.hoy) - N.diasRestantes(y.limite, est.hoy));
  const item = a => ({ id: a.id, documento: `${a.doc_id} rev. ${a.doc.revision}`, elemento: a.elemento, cambio: primeraFrase(a.cambio).slice(0, 160), recibido: N.fmtFecha(a.fecha_recepcion), fecha_limite: N.fmtFecha(a.limite), dias_restantes: N.diasRestantes(a.limite, est.hoy), estado: estadoTxt(a), partida: a.partida ? `${a.partida} ${a.partida_desc}` : 'sin partida' });
  const abiertos = abiertasDe(id);
  const base = {
    nota: 'Datos de demostración. Fechas en formato día/mes/año, calculadas por la app.',
    hoy: N.fmtFecha(est.hoy) + ' (fecha simulada de la demostración)',
    proyecto: { nombre: PROY[id].nombre, demostracion: PROY[id].demo, clausula: pp.clausula, plazo: `${pp.plazo} días ${pp.tipo_dias === 'habiles' ? 'hábiles' : 'calendario'} desde la recepción` },
    totales: { abiertos: abiertos.length, urgentes: abiertos.filter(a => ['rojo', 'ambar', 'vencido'].includes(estadoDe(a))).length, por_emitir: porEmitirDe(id).length },
    detalle_en_pantalla: r.vista === 'alerta' && alertaPorId[r.id] ? { ...item(alertaPorId[r.id]), cita_verificada: alertaPorId[r.id].cita } : undefined,
    cambios: lista.map(item),
  };
  let txt = JSON.stringify(base);
  while (txt.length > 5800 && base.cambios.length) { base.cambios.pop(); base.cambios_omitidos = (base.cambios_omitidos || 0) + 1; txt = JSON.stringify(base); }
  return { txt, ids: new Set(lista.map(a => a.id)) };
}
const NOMBRE_VISTA = { inicio: 'Inicio', bandeja: 'Bandeja de cambios', comparar: 'Comparar revisiones', salidas: 'Documentos de salida', plazos: 'Plazos y parámetros', auditoria: 'Auditoría', calidad: 'Calidad', ajustes: 'Ajustes' };
const textoAccion = a => a.startsWith('ir:alerta-') ? `Abrir el cambio ${a.slice(10)}` : `Ir a ${NOMBRE_VISTA[a.slice(3)] || a.slice(3)}`;
let chat = [];
try { chat = JSON.parse(sessionStorage.getItem('rc-chat') || '[]'); } catch { }
const guardarChat = () => { try { sessionStorage.setItem('rc-chat', JSON.stringify(chat.slice(-30))); } catch { } };
function pintarModoChat() {
  $('#asist-modo').innerHTML = IA.chatEnVivo() ? `${IA.chipIA('vivo')} Solo se envía tu pregunta y un resumen del proyecto de demostración, nunca tus documentos.` : `<span class="chip-ia basico">Asistente básico (sin IA)</span> Respuestas preparadas. Para usar IA en vivo, elige «IA registrada» o «Mi propia clave API» en <a href="#ajustes">Ajustes</a>.`;
}
function pintarChat() {
  pintarModoChat();
  $('#asist-msgs').innerHTML = (chat.length ? '' : `<div class="msg ia">Hola. Puedo decirte qué vence primero, explicar cualquier pantalla y llevarte a donde tienes que actuar. Elige una pregunta o escribe la tuya.</div>`) + chat.map((m, k) => m.role === 'user' ? `<div class="msg yo">${esc(m.content)}</div>`
    : `<div class="msg ia">${m.pendiente ? '<span class="spin" aria-hidden="true"></span> Pensando…' : esc(m.content)}${m.pendiente ? '' : `<div class="msg-pie">${m.basico ? '<span class="chip-ia basico">Asistente básico (sin IA)</span>' : `${IA.chipIA('vivo')}<small>${esc(m.origen || '')}</small>`}${m.accion ? `<button class="btn peq prim" data-acc="${k}">${esc(textoAccion(m.accion))}</button>` : ''}</div>${m.aviso ? `<small class="msg-aviso">${esc(m.aviso)}</small>` : ''}`}</div>`).join('');
  $('#asist-msgs').scrollTop = 1e6;
  $('#asist-msgs').querySelectorAll('[data-acc]').forEach(b => b.onclick = () => { const a = chat[Number(b.dataset.acc)].accion; location.hash = '#' + a.slice(3).toLowerCase(); });
  $('#asist-sug').innerHTML = (SUG[ruta().vista] || SUG.inicio).map(s => `<button type="button">${esc(s)}</button>`).join('');
  $('#asist-sug').querySelectorAll('button').forEach(b => b.onclick = () => enviar(b.textContent));
}
// Respuesta básica sin IA: preguntas frecuentes y, si se nombra un documento, sus fechas calculadas por la app.
function respuestaBasica(texto) {
  const doc = alertas.filter(a => a.fecha_recepcion <= est.hoy).find(a => new RegExp(`\\b${a.doc_id.replace('-', '[- ]?')}\\b`, 'i').test(texto));
  if (doc) {
    const d = N.diasRestantes(doc.limite, est.hoy), dec = est.decisiones[doc.id];
    const paso = !dec ? 'Revisa la evidencia y decide en el detalle: confirmar, corregir la partida o descartar.' : !est.emitidas[doc.id] && dec.estado !== 'descartada' ? 'Ya está decidido: redacta la carta y registra la emisión en Documentos de salida.' : 'No tiene acciones pendientes.';
    return { texto: `${doc.doc_id} · ${doc.elemento}: recibido el ${N.fmtFecha(doc.fecha_recepcion)}, la fecha límite para notificar es el ${N.fmtFecha(doc.limite)} (${d < 0 ? `venció hace ${-d} día${d === -1 ? '' : 's'}` : d === 0 ? 'vence hoy' : `quedan ${d} día${d === 1 ? '' : 's'}`}, ${P(doc).plazo} días ${P(doc).tipo_dias === 'habiles' ? 'hábiles' : 'calendario'}). ${paso}`, accion: dec && !est.emitidas[doc.id] && dec.estado !== 'descartada' ? `ir:salidas` : `ir:alerta-${doc.id}` };
  }
  if (/hoy|urgente|vence primero|qu[eé] hago/i.test(texto)) {
    const ab = abiertasDe(est.proyecto);
    if (!ab.length) return { texto: `No hay cambios abiertos en ${PROY[est.proyecto].nombre}. Compara dos revisiones para empezar.`, accion: 'ir:comparar' };
    const a = ab[0]; return { texto: `Lo que vence primero en ${PROY[est.proyecto].nombre}: ${a.doc_id} · ${a.elemento}, con fecha límite el ${N.fmtFecha(a.limite)} (${N.diasRestantes(a.limite, est.hoy)} días). Hay ${ab.length} cambio${ab.length === 1 ? '' : 's'} abierto${ab.length === 1 ? '' : 's'}.`, accion: `ir:alerta-${a.id}` };
  }
  if (ruta().vista === 'alerta' && /partida|por qu/i.test(texto) && alertaPorId[ruta().id]) return { texto: `Partida ${alertaPorId[ruta().id].partida || 'ninguna'}: ${alertaPorId[ruta().id].sustento}` };
  if (/corrij/i.test(texto)) return { texto: 'Si corriges, el cambio guarda tu partida y también la que propuso la IA. Así se puede medir cuántas veces se equivoca el modelo sin perder el dato original.' };
  if (/barra/i.test(texto)) return { texto: `Cada barra va de la recepción (día 0) al límite contractual del proyecto. El tramo rayado es lo que tarda entender un cambio sin asistente (${REF.min} a ${REF.max} días según la consulta, n = ${REF.n}); la línea vertical es hoy y el punto naranja, el límite.` };
  const f = FAQ.find(([re]) => re.test(texto));
  return { texto: f ? f[1] : 'No tengo una respuesta preparada para eso. Prueba con «¿Qué vence primero?», «¿Qué plazo tiene E-204?» o «¿Cómo evita que la IA invente?». Con la IA en vivo puedo responder preguntas abiertas sobre el proyecto.' };
}
async function enviar(texto) {
  texto = texto.trim().slice(0, 600);
  if (!texto) return;
  const historial = chat.filter(m => !m.pendiente).slice(-6).map(m => ({ rol: m.role === 'user' ? 'usuario' : 'asistente', texto: String(m.content).slice(0, 1800) }));
  chat.push({ role: 'user', content: texto });
  const m = { role: 'assistant', content: '', pendiente: true }; chat.push(m); pintarChat();
  if (IA.chatEnVivo()) {
    const { txt, ids } = contextoChat();
    try { const r = await IA.chat({ pregunta: texto, pantalla: NOMBRE_VISTA[ruta().vista] || ruta().vista, contexto: txt, historial, ids }); Object.assign(m, { content: r.texto, accion: r.accion, origen: r.origen, pendiente: false }); }
    catch (e) { Object.assign(m, respuestaBasica(texto), { basico: true, pendiente: false, aviso: e.codigo === 'tiempo' ? 'La IA tardó demasiado; se usó la respuesta del asistente básico.' : `La IA no respondió: ${e.message.replace(/\.?$/, '.')} Se usó la respuesta del asistente básico.` }); m.content = m.texto; }
  } else { const r = respuestaBasica(texto); Object.assign(m, { content: r.texto, accion: r.accion, basico: true, pendiente: false }); }
  delete m.texto; guardarChat(); pintarChat();
}
$('#asist-abrir').onclick = () => { const p = $('#asist'); p.hidden = !p.hidden; $('#asist-abrir').setAttribute('aria-expanded', String(!p.hidden)); if (!p.hidden) { pintarChat(); $('#asist-in').focus(); } };
$('#asist-cerrar').onclick = () => { $('#asist').hidden = true; $('#asist-abrir').setAttribute('aria-expanded', 'false'); $('#asist-abrir').focus(); };
$('#asist-form').onsubmit = e => { e.preventDefault(); const i = $('#asist-in'); enviar(i.value); i.value = ''; };
$('#asist-borrar').onclick = () => { chat = []; guardarChat(); pintarChat(); };

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
$('#pop-r').oninput = e => { est.hoy = N.sumarDias(PRIMERA, Number(e.target.value)); const v = ruta().vista; if (v === 'inicio') { vInicio(); } else if (v === 'bandeja') vBandeja(); else if (v === 'panorama') vPanorama(); pintarFecha(); };
document.addEventListener('click', e => { if (!e.target.closest('#pop-fecha, #chip-fecha')) { $('#pop-fecha').hidden = true; $('#chip-fecha').setAttribute('aria-expanded', 'false'); } });
pintarRol();
render();
iniciarConexiones();
try { if (!localStorage.getItem('rc-bienvenida')) abrirEntrada(); } catch { }
IA.iniciarModo().then(() => { pintarModoIA(); if (!$('#asist').hidden) pintarChat(); if (['comparar', 'ajustes', 'salidas'].includes(ruta().vista)) render(); });
