// Reloj Contractual · interfaz (Grupo 4 · AECODE · Hito 3)
import * as N from './nucleo.js';
import * as A from './almacen.js';
import * as IA from './ia.js';
import { casosDePrueba } from './pruebas.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ROLES = {
  control: 'Control documentario',
  ot: 'Oficina técnica',
  jefe: 'Jefe/a de oficina técnica',
  contractual: 'Administración contractual',
  gerente: 'Gerente de proyecto',
};
const ESTADOS = {
  por_vincular: ['Por vincular', 'p-gris'], pendiente: ['Pendiente PD1', 'p-warn'], confirmada: ['Confirmada', 'p-info'],
  corregida: ['Corregida', 'p-info'], descartada: ['Descartada', 'p-gris'], aprobada: ['Aprobada PD3', 'p-ok'],
  archivada: ['Archivada', 'p-gris'], emitida: ['Emitida', 'p-ok'],
};

const S = {
  proyecto: null, documentos: [], alertas: [], params: null, meta: null, auditoria: [],
  rol: A.preferencia('rol') || 'ot', hoy: N.hoyIso(), filtros: { pestana: 'pendientes', esp: '', conf: '' },
  apertura: {}, corridas: null,
};

// ---------- utilidades de interfaz ----------
function toast(msg, ms = 3800) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms); }
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="modal-fondo" data-act="cerrar-modal-fondo"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`; m.hidden = false; }
function cerrarModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
const corto = (s, n = 120) => { s = String(s || ''); if (s.length <= n) return s; const c = s.slice(0, n); return c.slice(0, c.lastIndexOf(' ')) + '…'; };
const pill = (txt, cls) => `<span class="pill ${cls}">${esc(txt)}</span>`;
const estadoPill = e => { const [t, c] = ESTADOS[e] || [e, 'p-gris']; return pill(t, c); };
const confPill = c => pill(c || '—', c === 'Alta' ? 'p-ok' : c === 'Media' ? 'p-warn' : 'p-err');
function requiereRol(rol, accion) {
  if (S.rol === rol) return true;
  toast(`«${accion}» corresponde a ${ROLES[rol]}. Cambie de rol en la barra superior (modo demostración).`, 5000);
  return false;
}
async function auditar(evento, alerta = null, detalle = '') {
  const reg = await A.auditar({ evento, alerta, detalle, rol: ROLES[S.rol], quien: `${ROLES[S.rol]} (${A.info().uid.slice(0, 6)})`, corpus: S.meta?.corpus_id || null });
  S.auditoria.push(reg);
}
const docDe = id => S.documentos.find(d => d.doc_id === id);
const pcod = () => Object.fromEntries(S.proyecto.partidas.map(p => [p.codigo, p]));

// Cálculo del reloj para una alerta (la fórmula, no el modelo).
function reloj(a) {
  const validado = S.params?.validado;
  const fl = validado ? N.fechaLimite(a.fecha_recepcion, S.params, S.proyecto.feriados) : null;
  const d = N.diasRestantes(fl, S.hoy);
  const cerrada = ['emitida', 'descartada', 'archivada'].includes(a.estado);
  return { fl, d, sem: cerrada ? 'gris' : N.semaforo(d), validado };
}
function cajaDias(a, grande = false) {
  const r = reloj(a);
  if (!r.validado) return `<span class="dias s-gris" title="Parámetros contractuales no validados">—<small>no validado</small></span>`;
  if (a.estado === 'emitida') return `<span class="dias ${a.emision?.a_tiempo ? 's-verde' : 's-vencido'}">${a.emision?.a_tiempo ? '✓' : '!'}<small>${a.emision?.a_tiempo ? 'a tiempo' : 'fuera'}</small></span>`;
  const txt = r.d < 0 ? `${-r.d}` : r.d === 0 ? '0' : `${r.d}`;
  const sub = r.d < 0 ? 'días vencido' : r.d === 0 ? 'vence hoy' : r.d === 1 ? 'día' : 'días';
  return `<span class="dias s-${r.sem}" ${grande ? 'style="font-size:30px;min-width:90px;padding:10px"' : ''}>${txt}<small>${sub}</small></span>`;
}

// ---------- carga de datos ----------
async function cargarTodo() {
  const [docs, alertas, conf, aud] = await Promise.all([A.leerTodo('documentos'), A.leerTodo('alertas'), A.leerTodo('config'), A.leerTodo('auditoria')]);
  S.documentos = docs.sort((a, b) => a.doc_id.localeCompare(b.doc_id));
  S.alertas = alertas.sort((a, b) => a.id.localeCompare(b.id));
  S.params = conf.find(c => c.id === 'parametros') || null;
  S.meta = conf.find(c => c.id === 'meta') || null;
  S.auditoria = aud.sort((a, b) => (a.t || '').localeCompare(b.t || ''));
}

// ---------- navegación ----------
const VISTAS = [
  ['sep', 'Operación'],
  ['panorama', 'Panorama', 'dashboard'],
  ['bandeja', 'Bandeja de alertas', 'notifications_active'],
  ['cartas', 'Cartas y emisión', 'mail'],
  ['sep', 'Preparación'],
  ['ingesta', 'Ingesta del CDE', 'upload_file'],
  ['procesar', 'Procesar con IA', 'auto_awesome'],
  ['parametros', 'Parámetros del reloj', 'gavel'],
  ['sep', 'Control'],
  ['auditoria', 'Auditoría', 'history'],
  ['pruebas', 'Pruebas y métricas', 'fact_check'],
  ['ayuda', 'Guía de uso', 'help'],
];
function pintarNav(actual) {
  const pend = S.alertas.filter(a => a.estado === 'pendiente').length;
  $('#nav').innerHTML = VISTAS.map(v => v[0] === 'sep' ? `<div class="sep">${v[1]}</div>` :
    `<a href="#/${v[0]}" class="${actual === v[0] ? 'on' : ''}"><span class="ms">${v[2]}</span>${v[1]}${v[0] === 'bandeja' && pend ? `<span class="cuenta">${pend}</span>` : ''}</a>`).join('');
}
async function enrutar() {
  if (!S.proyecto) return; // todavía conectando
  const [vista, id] = (location.hash.replace(/^#\/?/, '') || 'panorama').split('/');
  const v = VISTAS.find(x => x[0] === vista) ? vista : vista === 'alerta' || vista === 'carta' ? vista : 'panorama';
  pintarNav(v === 'alerta' ? 'bandeja' : v === 'carta' ? 'cartas' : v);
  const titulo = { alerta: 'Detalle de alerta', carta: 'Borrador de carta' }[v] || VISTAS.find(x => x[0] === v)?.[1];
  $('#ruta').textContent = titulo;
  const c = $('#contenido');
  try {
    c.innerHTML = await ({ panorama, bandeja, alerta, ingesta, procesar, parametros, cartas, carta, auditoria, pruebas, ayuda }[v])(id);
  } catch (e) {
    console.error(e);
    c.innerHTML = `<div class="aviso err"><span class="ms">error</span><div><b>No se pudo mostrar la pantalla.</b><br>${esc(e.message)}</div></div>`;
  }
  if (v === 'alerta' && id) S.apertura[id] ||= Date.now();
  window.scrollTo(0, 0);
}

// ================= PANTALLAS =================

async function panorama() {
  const docsOk = S.documentos.filter(d => d.estado_ingesta === 'aceptado');
  const rech = S.documentos.filter(d => d.estado_ingesta === 'rechazado');
  const vivas = S.alertas.filter(a => !['emitida', 'descartada', 'archivada', 'por_vincular'].includes(a.estado));
  const rs = vivas.map(reloj);
  const venc = rs.filter(r => r.validado && r.d < 0).length;
  const urg = rs.filter(r => r.validado && r.d >= 0 && r.d <= 1).length;
  const pend = S.alertas.filter(a => a.estado === 'pendiente').length;
  const emit = S.alertas.filter(a => a.estado === 'emitida');
  const aTiempo = emit.filter(a => a.emision?.a_tiempo).length;
  const tiempos = S.alertas.map(a => a.decision?.tiempo_revision_s).filter(Boolean).map(s => s / 60);
  const med = N.mediana(tiempos);
  const lat = S.alertas.map(a => a.generado_en && a.cargado_en ? (new Date(a.generado_en) - new Date(a.cargado_en)) / 3600000 : null).filter(x => x !== null && x >= 0);
  const pasos = [
    ['Cargar el registro del CDE', docsOk.length > 0, '#/ingesta', `${docsOk.length} documentos aceptados`],
    ['Validar la cláusula y el plazo (PD2)', !!S.params?.validado, '#/parametros', S.params?.validado ? `Cláusula ${S.params.clausula} · ${S.params.plazo} días ${S.params.tipo_dias}` : 'Pendiente'],
    ['Procesar los documentos con IA (I1 + I2)', S.alertas.some(a => a.estado !== 'por_vincular'), '#/procesar', `${S.alertas.length} alertas generadas`],
    ['Revisar la bandeja y decidir (PD1)', S.alertas.some(a => a.decision), '#/bandeja', `${pend} pendientes`],
    ['Aprobar, redactar y emitir la carta (PD3–PD4)', emit.length > 0, '#/cartas', `${emit.length} emitidas`],
  ];
  const porSem = { vencido: 0, rojo: 0, ambar: 0, verde: 0 };
  rs.forEach(r => { if (r.validado && porSem[r.sem] !== undefined) porSem[r.sem]++; });
  const porEsp = {};
  vivas.forEach(a => { porEsp[a.especialidad_doc || a.especialidad] = (porEsp[a.especialidad_doc || a.especialidad] || 0) + 1; });
  const maxE = Math.max(1, ...Object.values(porEsp));
  const proximas = vivas.map(a => ({ a, r: reloj(a) })).filter(x => x.r.validado).sort((p, q) => p.r.d - q.r.d).slice(0, 6);
  const colSem = { vencido: 'var(--venc)', rojo: 'var(--err)', ambar: 'var(--sem-amb)', verde: 'var(--ok)' };
  const nomSem = { vencido: 'Vencidas sin notificar', rojo: 'Vencen hoy o mañana', ambar: 'Vencen en 2–3 días', verde: 'Con 4 días o más' };
  const maxS = Math.max(1, ...Object.values(porSem));

  return `
  <div class="cab"><div><h1>Panorama del proyecto</h1><p class="mut">${esc(S.proyecto.proyecto.nombre)} · ${esc(S.proyecto.proyecto.descripcion)}</p></div>
  <div class="acciones"><a class="btn pri" href="#/bandeja"><span class="ms">notifications_active</span> Ir a la bandeja</a></div></div>
  ${!S.params?.validado && docsOk.length ? `<div class="aviso warn" style="margin-bottom:14px"><span class="ms">warning</span><div>Los parámetros contractuales no están validados: las alertas muestran «no validado» y no se ordenan por urgencia. <a href="#/parametros">Validar ahora</a>.</div></div>` : ''}
  <div class="rejilla r4">
    <div class="kpi vencido"><div class="v">${venc}</div><div class="e">Vencidas sin notificar</div></div>
    <div class="kpi rojo"><div class="v">${urg}</div><div class="e">Vencen hoy o mañana</div></div>
    <div class="kpi ambar"><div class="v">${pend}</div><div class="e">Pendientes de revisión (PD1)</div></div>
    <div class="kpi verde"><div class="v">${emit.length ? `${aTiempo}/${emit.length}` : '—'}</div><div class="e">Cartas emitidas dentro de plazo</div></div>
  </div>
  <div class="rejilla r4" style="margin-top:16px">
    <div class="kpi azul"><div class="v">${docsOk.length}<span class="mut" style="font-size:16px"> / ${S.documentos.length}</span></div><div class="e">Documentos aceptados (${rech.length} rechazados en la ingesta)</div></div>
    <div class="kpi azul"><div class="v">${S.alertas.length}</div><div class="e">Alertas generadas por la IA</div></div>
    <div class="kpi azul"><div class="v">${lat.length ? N.horas(N.mediana(lat)) : '—'}</div><div class="e">Latencia mediana carga → alerta (umbral &lt; 24 h)</div></div>
    <div class="kpi azul"><div class="v">${med !== null ? med.toFixed(1) + ' min' : '—'}</div><div class="e">Mediana de revisión por alerta (umbral ≤ 15 min)</div></div>
  </div>
  <div class="rejilla r2" style="margin-top:16px">
    <div class="tarjeta"><h2>¿Qué vence primero?</h2><p class="mut peq">Ordenado por días restantes, no por fecha de llegada.</p>
      ${proximas.length ? `<div class="tabla-env" style="margin-top:10px"><table><tbody>${proximas.map(({ a }) => `
        <tr class="clic" data-ir="#/alerta/${a.id}"><td style="width:80px">${cajaDias(a)}</td><td><b>${esc(a.doc_id)}</b> · ${esc(corto(a.cambio))}<div class="mut peq">${esc(a.partida ? a.partida + ' ' + a.partida_desc : 'Sin partida')}</div></td><td>${estadoPill(a.estado)}</td></tr>`).join('')}</tbody></table></div>`
        : `<p class="mut" style="margin-top:10px">Sin alertas con plazo calculado.</p>`}
    </div>
    <div class="tarjeta"><h2>Alertas abiertas por urgencia</h2><p class="mut peq">Semáforo: rojo ≤ 1 día · ámbar 2–3 · verde ≥ 4.</p>
      <div style="margin-top:12px">${Object.entries(porSem).map(([k, v]) => `<div class="barra-h"><span class="et">${nomSem[k]}</span><span class="pista"><span class="rel" style="display:block;width:${v / maxS * 100}%;background:${colSem[k]}"></span></span><span class="num">${v}</span></div>`).join('')}</div>
      <h3 style="margin-top:16px">Por especialidad</h3>
      <div style="margin-top:6px">${Object.entries(porEsp).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="barra-h"><span class="et" title="${esc(k)}">${esc(k)}</span><span class="pista"><span class="rel" style="display:block;width:${v / maxE * 100}%;background:var(--info)"></span></span><span class="num">${v}</span></div>`).join('') || '<p class="mut">—</p>'}</div>
    </div>
  </div>
  <div class="tarjeta" style="margin-top:16px"><h2>Recorrido de la demostración</h2><p class="mut peq">Cada paso corresponde a un rol distinto; cambie de rol en la barra superior.</p>
    <div class="pasos" style="margin-top:12px">${pasos.map((p, i) => `<div class="paso ${p[1] ? 'hecho' : ''}"><span class="n">${p[1] ? '✓' : i + 1}</span><div class="t"><b>${p[0]}</b><div class="mut peq">${esc(p[3])}</div></div><a class="btn chico" href="${p[2]}">Abrir</a></div>`).join('')}</div>
  </div>`;
}

async function bandeja() {
  const f = S.filtros;
  const grupos = {
    pendientes: a => a.estado === 'pendiente',
    confirmadas: a => ['confirmada', 'corregida', 'aprobada'].includes(a.estado),
    cerradas: a => ['emitida', 'descartada', 'archivada'].includes(a.estado),
    todas: () => true,
  };
  let lista = S.alertas.filter(a => a.estado !== 'por_vincular').filter(grupos[f.pestana]);
  if (f.esp) lista = lista.filter(a => (a.especialidad_doc || a.especialidad) === f.esp);
  if (f.conf) lista = lista.filter(a => a.confianza === f.conf);
  const val = S.params?.validado;
  lista.sort((a, b) => val ? (reloj(a).d - reloj(b).d) || a.id.localeCompare(b.id) : a.fecha_recepcion.localeCompare(b.fecha_recepcion));
  const esps = [...new Set(S.alertas.map(a => a.especialidad_doc || a.especialidad))].sort();
  const cnt = k => S.alertas.filter(a => a.estado !== 'por_vincular').filter(grupos[k]).length;
  const vivas = S.alertas.filter(grupos.pendientes).map(reloj).filter(r => r.validado);
  const tiempos = S.alertas.map(a => a.decision?.tiempo_revision_s).filter(Boolean).map(s => s / 60);
  return `
  <div class="cab"><div><h1>Bandeja de alertas</h1><p class="mut">Ordenadas por días restantes para notificar. Ninguna alerta sale del sistema sin aprobación registrada.</p></div></div>
  ${!val ? `<div class="aviso warn" style="margin-bottom:14px"><span class="ms">warning</span><div>Plazo no validado: la bandeja se ordena por fecha de recepción. <a href="#/parametros">Validar parámetros (PD2)</a>.</div></div>` : ''}
  <div class="rejilla r4" style="margin-bottom:16px">
    <div class="kpi vencido"><div class="v">${vivas.filter(r => r.d < 0).length}</div><div class="e">Vencidas</div></div>
    <div class="kpi rojo"><div class="v">${vivas.filter(r => r.d >= 0 && r.d <= 1).length}</div><div class="e">Vencen en ≤ 1 día</div></div>
    <div class="kpi ambar"><div class="v">${vivas.filter(r => r.d >= 2 && r.d <= 3).length}</div><div class="e">Vencen en 2–3 días</div></div>
    <div class="kpi azul"><div class="v">${N.mediana(tiempos) !== null ? N.mediana(tiempos).toFixed(1) + ' min' : '—'}</div><div class="e">Mediana de revisión por alerta</div></div>
  </div>
  <div class="tarjeta">
    <div class="pestanas">${[['pendientes', 'Pendientes'], ['confirmadas', 'Confirmadas'], ['cerradas', 'Cerradas'], ['todas', 'Todas']].map(([k, t]) => `<button data-act="pestana" data-v="${k}" class="${f.pestana === k ? 'on' : ''}">${t} (${cnt(k)})</button>`).join('')}</div>
    <div class="acciones" style="margin-bottom:12px">
      <select data-act="filtro" data-k="esp" style="width:auto"><option value="">Especialidad: todas</option>${esps.map(e => `<option ${f.esp === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>
      <select data-act="filtro" data-k="conf" style="width:auto"><option value="">Confianza: todas</option>${['Alta', 'Media', 'Baja'].map(e => `<option ${f.conf === e ? 'selected' : ''}>${e}</option>`).join('')}</select>
    </div>
    ${lista.length ? `<div class="tabla-env"><table><thead><tr><th>Plazo</th><th>Documento</th><th>Cambio detectado</th><th>Partida vinculada</th><th>Confianza</th><th>Recepción</th><th>Estado</th></tr></thead><tbody>
      ${lista.map(a => `<tr class="clic" data-ir="#/alerta/${a.id}"><td>${cajaDias(a)}</td><td><b>${esc(a.doc_id)}</b><div class="mut peq">${esc(docDe(a.doc_id)?.tipo || '')} · rev. ${esc(docDe(a.doc_id)?.revision || '')}</div></td><td>${esc(corto(a.cambio, 160))}<div class="mut peq">${esc(a.ubicacion)}</div></td><td>${a.partida ? `<span class="mono">${esc(a.partida)}</span> ${esc(a.partida_desc)}` : '<span class="mut">Sin partida aplicable</span>'}</td><td>${confPill(a.confianza)}</td><td>${N.fmtFecha(a.fecha_recepcion)}</td><td>${estadoPill(a.estado)}</td></tr>`).join('')}
    </tbody></table></div>` : `<p class="mut">No hay alertas en esta vista. ${S.alertas.length ? '' : 'Cargue el corpus y procéselo con IA para generarlas.'}</p>`}
    <p class="mut peq" style="margin-top:10px">Los días restantes los calcula una fórmula a partir de la fecha de recepción en el CDE y los parámetros validados, no el modelo.</p>
  </div>`;
}

function resaltar(texto, cita) {
  const t = esc(texto);
  if (!cita) return t;
  const c = esc(cita);
  const i = t.indexOf(c);
  return i >= 0 ? t.slice(0, i) + `<mark>${c}</mark>` + t.slice(i + c.length) : t;
}

async function alerta(id) {
  const a = S.alertas.find(x => x.id === id);
  if (!a) return `<div class="aviso err">No existe la alerta ${esc(id)}.</div>`;
  const d = docDe(a.doc_id) || {};
  const r = reloj(a);
  const traza = S.auditoria.filter(x => x.alerta === id);
  const crits = ['Elemento', 'Especialidad', 'Ubicación', 'Rango o unidad'];
  const pc = pcod();
  const decidida = !!a.decision;
  return `
  <div class="cab"><div><a href="#/bandeja" class="peq">← Bandeja</a><h1 style="margin-top:4px">${esc(a.doc_id)} rev. ${esc(d.revision)} · ${esc(a.elemento || a.cambio)}</h1>
    <p class="mut"><span class="mono">${esc(a.id)}</span> · Recibido en el CDE el ${N.fmtFecha(a.fecha_recepcion)}${r.fl ? ` · fecha límite de notificación ${N.fmtFecha(r.fl)}` : ''}</p></div>
    <div>${estadoPill(a.estado)}</div></div>
  <div class="cuadro-reloj s-${r.sem}" style="margin-bottom:16px">
    ${cajaDias(a, true)}
    <div>${r.validado ? (a.estado === 'emitida' ? `Carta emitida el ${N.fmtFecha(a.emision.fecha)} (${a.emision.a_tiempo ? 'dentro de plazo' : 'fuera de plazo'}).` : r.d < 0 ? `<b>Plazo vencido hace ${-r.d} día(s).</b> Según la cláusula ${esc(S.params.clausula)}, vencido el plazo se entiende renunciado el reclamo.` : `<b>Quedan ${r.d} día(s) para notificar.</b> El plazo corre desde la recepción documentada (cláusula ${esc(S.params.clausula)}, ${S.params.plazo} días ${S.params.tipo_dias === 'habiles' ? 'hábiles' : 'calendario'}).`) : 'Plazo no validado: la administración contractual debe validar los parámetros (PD2).'}</div>
  </div>
  <div class="rejilla r2">
    <div class="tarjeta"><h2>Documentos enfrentados</h2><p class="mut peq">El fragmento resaltado es la cita literal que sustenta el cambio.</p>
      <div class="rejilla" style="margin-top:10px">
        <div class="lamina"><h4>${d.tipo === 'Lámina' ? `Revisión anterior · ${esc(d.revision_anterior)}` : 'Antecedente'}</h4>${esc(d.texto_anterior || '(no aplica)')}</div>
        <div class="lamina"><h4>${d.tipo === 'Lámina' ? `Revisión actual · ${esc(d.revision)}` : esc(d.tipo)} · recibida ${N.fmtFecha(a.fecha_recepcion)}</h4>${resaltar(d.texto, a.cita)}</div>
      </div>
    </div>
    <div class="tarjeta"><h2>Cambio detectado <span class="mut peq">(I1 ${esc(a.version_I1 || '')})</span></h2>
      <p style="margin-top:8px">${esc(a.cambio)}</p>
      <div class="rejilla r2" style="margin-top:8px;gap:8px">
        <div><div class="mut peq">Ubicación</div>${esc(a.ubicacion)}</div>
        <div><div class="mut peq">Especialidad</div>${esc(a.especialidad)}</div>
      </div>
      <div style="margin-top:8px"><div class="mut peq">Fuente</div>${esc(a.doc_id)} rev. ${esc(d.revision)} · «${esc(a.cita)}» ${a.cita_verificada ? '<span class="cita-ok">✓ cita verificada en el documento</span>' : '<span class="pill p-err">cita no verificada</span>'}</div>
      <h2 style="margin-top:18px">Partida vinculada ${confPill(a.confianza)} <span class="mut peq">(I2 ${esc(a.version_I2 || '')})</span></h2>
      <div style="margin-top:8px"><span class="mono">${esc(a.partida || '—')}</span> ${esc(a.partida_desc || '')}</div>
      ${a.partida_modelo !== undefined && a.partida_modelo !== a.partida ? `<div class="mut peq">Propuesta original del modelo: <span class="mono">${esc(a.partida_modelo || 'SIN PARTIDA')}</span> ${esc(a.partida_modelo ? pc[a.partida_modelo]?.desc : '')}</div>` : ''}
      ${a.alternativa ? `<div class="mut peq" style="margin-top:4px">Alternativa: <span class="mono">${esc(a.alternativa)}</span> ${esc(a.alternativa_desc)}</div>` : ''}
      <div style="margin-top:10px">${(a.criterios || []).map((c, i) => `<div class="crit"><span class="${c ? 'si' : 'no'}">${c ? '✓' : '✗'}</span><span><b>${crits[i]}</b></span></div>`).join('')}</div>
      <p class="mut peq" style="margin-top:6px">${esc(a.sustento || '')}</p>
      ${a.confianza_ajustada ? `<div class="aviso info" style="margin-top:8px"><span class="ms">rule</span><div>La confianza declarada por el modelo (${esc(a.confianza_modelo)}) no coincidía con los criterios: se recalculó con la regla R-V.</div></div>` : ''}
      <p class="mut peq" style="margin-top:6px">Regla R-V: confianza alta con 4/4 criterios, media con 3/4, baja con ≤ 2/4.</p>
      ${a.estado === 'pendiente' ? `
      <div class="acciones" style="margin-top:14px">
        <button class="btn ok" data-act="pd1-confirmar" data-id="${a.id}"><span class="ms">check</span> Confirmar</button>
        <button class="btn" data-act="pd1-corregir" data-id="${a.id}"><span class="ms">edit</span> Corregir partida</button>
        <button class="btn peligro" data-act="pd1-descartar" data-id="${a.id}"><span class="ms">close</span> Descartar</button>
      </div>
      <p class="mut peq" style="margin-top:6px">PD1 · Oficina técnica. Se registra usuario, fecha, hora, tiempo de revisión y el valor original propuesto por el modelo.</p>` : ''}
      ${['confirmada', 'corregida'].includes(a.estado) ? `
      <div class="aviso info" style="margin-top:14px"><span class="ms">approval</span><div>PD3 · El jefe/a de oficina técnica decide si se presenta la variación y aprueba la valorización.</div></div>
      <div class="acciones" style="margin-top:10px">
        <button class="btn ok" data-act="pd3-aprobar" data-id="${a.id}"><span class="ms">task_alt</span> Aprobar y habilitar carta</button>
        <button class="btn" data-act="pd3-archivar" data-id="${a.id}"><span class="ms">archive</span> Archivar con justificación</button>
      </div>` : ''}
      ${['aprobada', 'emitida'].includes(a.estado) ? `<div class="acciones" style="margin-top:14px"><a class="btn pri" href="#/carta/${a.id}"><span class="ms">mail</span> Ver borrador de carta</a></div>` : ''}
      ${decidida ? `<div class="mut peq" style="margin-top:12px">Decisión PD1: <b>${esc(a.decision.tipo)}</b> por ${esc(a.decision.rol)} el ${new Date(a.decision.t).toLocaleString('es-PE')} · revisión ${(a.decision.tiempo_revision_s / 60).toFixed(1)} min${a.decision.motivo ? ` · motivo: ${esc(a.decision.motivo)}` : ''}</div>` : ''}
    </div>
  </div>
  <div class="tarjeta" style="margin-top:16px"><h2>Traza de auditoría · ${esc(a.id)}</h2>
    <div class="tabla-env" style="margin-top:10px"><table><thead><tr><th>Momento</th><th>Evento</th><th>Quién</th><th>Detalle</th></tr></thead><tbody>
    <tr><td>${N.fmtFecha(a.fecha_recepcion)}</td><td>Documento registrado en el CDE (inicia el reloj)</td><td>Control documentario</td><td>${esc(a.doc_id)}</td></tr>
    ${traza.map(t => `<tr><td>${new Date(t.t).toLocaleString('es-PE')}</td><td>${esc(t.evento)}</td><td>${esc(t.rol)}</td><td>${esc(t.detalle)}</td></tr>`).join('')}
    </tbody></table></div><p class="mut peq" style="margin-top:6px">Registro de solo agregar: los eventos no se editan ni se borran.</p></div>`;
}

async function ingesta() {
  const docs = S.documentos;
  const ok = docs.filter(d => d.estado_ingesta === 'aceptado').length;
  return `
  <div class="cab"><div><h1>Ingesta del registro del CDE</h1><p class="mut">U1 · Control documentario exporta el registro y los documentos nuevos. La fecha de recepción inicia el reloj y no se edita después de la carga.</p></div></div>
  <div class="rejilla r2">
    <div class="tarjeta"><h2>Corpus de demostración</h2>
      <p class="mut">50 documentos anonimizados del proyecto R1 (38 láminas, 6 respuestas de RFI y 6 cartas), lista de 58 partidas y extracto contractual. Corpus sintético representativo construido por el equipo.</p>
      <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="desplazar" checked> Desplazar las fechas para que el corpus sea actual (conserva los intervalos, como en la anonimización)</label>
      <div class="acciones" style="margin-top:12px"><button class="btn pri" data-act="cargar-corpus"><span class="ms">database</span> Cargar corpus de demostración</button></div>
    </div>
    <div class="tarjeta"><h2>Importar registro propio</h2>
      <p class="mut">Archivo CSV o JSON con las columnas: doc_id, tipo, titulo, especialidad, revision, revision_anterior, fecha_recepcion (AAAA-MM-DD), emisor, texto_anterior, texto.</p>
      <div class="zona-arrastre" id="zona" style="margin-top:10px"><span class="ms" style="font-size:30px">upload</span><br>Arrastre aquí el archivo o <label style="color:var(--info);cursor:pointer;text-decoration:underline">elíjalo<input type="file" id="archivo" accept=".csv,.json" hidden></label></div>
      <div class="acciones" style="margin-top:10px"><button class="btn chico" data-act="plantilla-csv"><span class="ms">download</span> Descargar plantilla CSV</button></div>
    </div>
  </div>
  <div class="tarjeta" style="margin-top:16px">
    <div class="cab" style="margin-bottom:8px"><div><h2>Documentos registrados (${docs.length})</h2><p class="mut peq">${ok} aceptados · ${docs.length - ok} rechazados por reglas de calidad (CP-01).${S.meta?.desplazamiento ? ` Fechas desplazadas ${S.meta.desplazamiento} días.` : ''}</p></div>
      ${docs.length ? `<button class="btn chico peligro" data-act="reiniciar"><span class="ms">restart_alt</span> Reiniciar espacio</button>` : ''}</div>
    ${docs.length ? `<div class="tabla-env"><table><thead><tr><th>Documento</th><th>Tipo</th><th>Título</th><th>Rev.</th><th>Recepción</th><th>Ingesta</th><th>IA</th></tr></thead><tbody>
    ${docs.map(d => `<tr><td><b>${esc(d.doc_id)}</b></td><td>${esc(d.tipo)}</td><td>${esc(d.titulo)}<div class="mut peq">${esc(d.especialidad)}</div></td><td>${esc(d.revision_anterior)} → ${esc(d.revision)}</td><td>${N.fmtFecha(d.fecha_recepcion)}</td>
      <td>${d.estado_ingesta === 'aceptado' ? pill('Aceptado', 'p-ok') : `${pill('Rechazado', 'p-err')}<div class="peq" style="color:var(--err)">${esc((d.errores || []).join('; '))}</div>`}</td>
      <td>${d.estado_ia === 'procesado' ? pill(`${S.alertas.filter(a => a.doc_id === d.doc_id).length} cambio(s)`, 'p-info') : d.estado_ia === 'sin_cambios' ? pill('Sin cambios', 'p-gris') : d.estado_ingesta === 'aceptado' ? pill('Pendiente', 'p-warn') : '—'}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="mut">Aún no hay documentos. Cargue el corpus de demostración o importe un registro.</p>'}
  </div>`;
}

function bloqueManual(clave, sistema, mensaje) {
  return `<details style="margin-top:10px" open><summary>Modo manual: instrucción para pegar en Claude</summary>
    <p class="mut peq">1) Copie el texto. 2) Péguelo en su proyecto de Claude. 3) Pegue abajo la respuesta completa y regístrela.</p>
    <textarea readonly id="inst-${clave}" style="min-height:140px">${esc(IA.paqueteManual(sistema, mensaje))}</textarea>
    <div class="acciones" style="margin:6px 0 10px"><button class="btn chico" data-act="copiar" data-src="inst-${clave}"><span class="ms">content_copy</span> Copiar instrucción</button></div>
    <textarea id="resp-${clave}" placeholder="Pegue aquí la respuesta de Claude (filas separadas por « | »)"></textarea>
    <div class="acciones" style="margin-top:6px"><button class="btn pri" data-act="registrar-${clave}"><span class="ms">input</span> Registrar respuesta</button></div></details>`;
}

async function procesar() {
  const aj = IA.ajustes();
  const pend = S.documentos.filter(d => d.estado_ingesta === 'aceptado' && !d.estado_ia);
  const porV = S.alertas.filter(a => a.estado === 'por_vincular');
  const ult = S.meta?.ultima_corrida;
  const v1 = N.VERSION_VIGENTE.I1, v2 = N.VERSION_VIGENTE.I2;
  return `
  <div class="cab"><div><h1>Procesar con IA</h1><p class="mut">U2–U3 · El modelo describe el cambio con cita (I1) y propone la partida con la regla R-V (I2). Las filas sin cita verificable o fuera de formato se rechazan.</p></div></div>
  <div class="tarjeta"><h2>Ajustes de IA</h2>
    <div class="rejilla r3" style="margin-top:10px">
      <label class="campo">Modo<select data-act="ia-modo"><option value="manual" ${aj.modo === 'manual' ? 'selected' : ''}>Manual (copiar y pegar en Claude)</option><option value="vivo" ${aj.modo === 'vivo' ? 'selected' : ''}>En vivo (API de Claude)</option></select></label>
      <label class="campo">Modelo<select data-act="ia-modelo" ${aj.modo !== 'vivo' ? 'disabled' : ''}>${IA.MODELOS.map(m => `<option value="${m.id}" ${aj.modelo === m.id ? 'selected' : ''}>${m.nombre}</option>`).join('')}</select></label>
      <label class="campo">Clave de API (solo en este navegador)<input type="password" id="ia-clave" value="${esc(aj.clave)}" placeholder="sk-ant-…" ${aj.modo !== 'vivo' ? 'disabled' : ''}></label>
    </div>
    <div class="acciones" style="margin-top:10px">${aj.modo === 'vivo' ? `<button class="btn chico" data-act="ia-guardar-clave"><span class="ms">key</span> Guardar clave</button><button class="btn chico" data-act="ia-probar"><span class="ms">network_check</span> Probar conexión</button>` : ''}
      <span class="mut peq">La clave nunca se guarda en la base de datos. Sin clave, use el modo manual o las salidas registradas.</span></div>
  </div>
  <div class="tarjeta"><div class="cab" style="margin-bottom:6px"><div><h2>Paso 1 · I1 Detección del cambio <span class="pill p-gris">${v1}</span></h2><p class="mut">${pend.length} documento(s) aceptado(s) pendientes de análisis.</p></div>
      ${aj.modo === 'vivo' ? `<button class="btn pri" data-act="vivo-i1" ${pend.length ? '' : 'disabled'}><span class="ms">play_arrow</span> Ejecutar I1 con Claude</button>` : ''}</div>
    <details><summary>Ver la instrucción ${v1}</summary><pre class="lamina mono" style="margin-top:8px">${esc(N.INSTRUCCIONES.I1[v1].sistema)}</pre></details>
    ${aj.modo === 'manual' && pend.length ? bloqueManual('i1', N.INSTRUCCIONES.I1[v1].sistema, N.mensajeI1(pend.slice(0, 25))) + (pend.length > 25 ? `<p class="mut peq">Se envían los primeros 25 documentos; repita para el resto.</p>` : '') : ''}
  </div>
  <div class="tarjeta"><div class="cab" style="margin-bottom:6px"><div><h2>Paso 2 · I2 Vinculación con partida <span class="pill p-gris">${v2}</span></h2><p class="mut">${porV.length} hecho(s) de cambio por vincular.</p></div>
      ${aj.modo === 'vivo' ? `<button class="btn pri" data-act="vivo-i2" ${porV.length ? '' : 'disabled'}><span class="ms">play_arrow</span> Ejecutar I2 con Claude</button>` : ''}</div>
    <details><summary>Ver la instrucción ${v2}</summary><pre class="lamina mono" style="margin-top:8px">${esc(N.INSTRUCCIONES.I2[v2].sistema)}</pre></details>
    ${aj.modo === 'manual' && porV.length ? bloqueManual('i2', N.INSTRUCCIONES.I2[v2].sistema, N.mensajeI2(porV.map(a => ({ ...a })), S.proyecto.partidas)) : ''}
  </div>
  <div class="tarjeta"><h2>Alternativa · salidas registradas de la corrida medida</h2>
    <p class="mut">Aplica las respuestas crudas que Claude produjo en la corrida de pruebas (archivo versionado). Se vuelven a validar con las mismas reglas, de modo que la demostración es reproducible sin clave de API.</p>
    <div class="acciones" style="margin-top:10px">${(await corridasDisponibles()).map(c => `<button class="btn" data-act="aplicar-corrida" data-f="${esc(c.archivo)}" ${pend.length ? '' : 'disabled'}><span class="ms">history</span> ${esc(c.nombre)}</button>`).join('')}</div>
  </div>
  ${ult ? `<div class="tarjeta"><h2>Resultado del último procesamiento</h2><p class="mut peq">${esc(ult.etiqueta)} · ${new Date(ult.t).toLocaleString('es-PE')}</p>
    <div class="rejilla r4" style="margin-top:10px">
      <div class="kpi azul"><div class="v">${ult.hechos ?? 0}</div><div class="e">Hechos de cambio aceptados</div></div>
      <div class="kpi"><div class="v">${ult.sin_cambios ?? 0}</div><div class="e">Documentos sin cambios</div></div>
      <div class="kpi azul"><div class="v">${ult.vinculos ?? 0}</div><div class="e">Vínculos con partida</div></div>
      <div class="kpi rojo"><div class="v">${(ult.rechazadas || []).length}</div><div class="e">Filas rechazadas por validación</div></div>
    </div>
    ${(ult.rechazadas || []).length ? `<div class="tabla-env" style="margin-top:10px"><table><thead><tr><th>Instrucción</th><th>Motivo</th><th>Fila</th></tr></thead><tbody>${ult.rechazadas.map(x => `<tr><td>${esc(x.instruccion || '')}</td><td>${esc(x.motivo)}</td><td class="mono peq">${esc(x.linea)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </div>` : ''}`;
}

async function corridasDisponibles() {
  if (!S.corridas) {
    try { S.corridas = await (await fetch('data/corridas/indice.json', { cache: 'no-cache' })).json(); } catch { S.corridas = []; }
  }
  return S.corridas.filter(c => c.aplicable);
}

async function parametros() {
  const p = S.params || {};
  const c = S.proyecto.contrato;
  const prop = S.meta?.propuesta_I3 || [];
  const form = { clausula: p.clausula || '', gatillo: p.gatillo || 'recepcion', plazo: p.plazo || '', tipo_dias: p.tipo_dias || 'calendario', consecuencia: p.consecuencia || '', texto: p.texto || '' };
  const aj = IA.ajustes();
  return `
  <div class="cab"><div><h1>Parámetros contractuales del reloj</h1><p class="mut">PD2 · Se validan una sola vez por contrato. Mientras no estén validados, las alertas muestran «plazo no validado» y no se ordenan por urgencia.</p></div>
    <div>${p.validado ? pill(`Validado por ${p.validado_por} · ${new Date(p.validado_en).toLocaleDateString('es-PE')}`, 'p-ok') : pill('No validado', 'p-warn')}</div></div>
  <div class="rejilla r2">
    <div class="tarjeta"><h2>Extracto contractual</h2><p class="mut peq">${esc(c.titulo)}</p><div class="lamina" style="margin-top:10px;max-height:420px;overflow:auto">${esc(c.texto)}</div>
      <div class="acciones" style="margin-top:12px">
        ${aj.modo === 'vivo' ? `<button class="btn pri" data-act="vivo-i3"><span class="ms">auto_awesome</span> Proponer cláusula con IA (I3)</button>` : ''}
        <button class="btn" data-act="i3-registrada"><span class="ms">history</span> Usar propuesta registrada (corrida)</button>
      </div>
      ${aj.modo === 'manual' ? bloqueManual('i3', N.INSTRUCCIONES.I3['v1.0'].sistema, N.mensajeI3(c)) : ''}
    </div>
    <div class="tarjeta"><h2>Cláusulas propuestas por el modelo (I3)</h2>
      ${prop.length ? prop.map((x, i) => `<div class="lamina" style="margin-top:10px"><b>Cláusula ${esc(x.clausula)}</b> · gatillo ${esc(x.gatillo)} · ${esc(x.plazo ?? '—')} días ${esc(x.tipo_dias)}<div class="peq" style="margin-top:4px">«${esc(x.texto_literal)}»</div><div class="peq mut">Consecuencia: ${esc(x.consecuencia)}</div><button class="btn chico" style="margin-top:6px" data-act="usar-clausula" data-i="${i}">Usar esta cláusula</button></div>`).join('') : '<p class="mut" style="margin-top:8px">Aún no hay propuesta. Use I3 o la propuesta registrada.</p>'}
      <h2 style="margin-top:18px">Parámetros estructurados</h2>
      <div class="rejilla r2" style="margin-top:10px">
        <label class="campo">Cláusula<input type="text" id="p-clausula" value="${esc(form.clausula)}"></label>
        <label class="campo">Plazo (número)<input type="number" min="1" id="p-plazo" value="${esc(form.plazo)}"></label>
        <label class="campo">Gatillo<select id="p-gatillo">${[['recepcion', 'Recepción documentada en el CDE'], ['conocimiento', 'Conocimiento del hecho'], ['instruccion', 'Instrucción escrita']].map(([v, t]) => `<option value="${v}" ${form.gatillo === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="campo">Tipo de días<select id="p-tipo">${[['calendario', 'Calendario'], ['habiles', 'Hábiles (con feriados)']].map(([v, t]) => `<option value="${v}" ${form.tipo_dias === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <label class="campo" style="margin-top:10px">Consecuencia<input type="text" id="p-consecuencia" value="${esc(form.consecuencia)}"></label>
      <input type="hidden" id="p-texto" value="${esc(form.texto)}">
      <div class="aviso info" style="margin-top:12px"><span class="ms">function</span><div class="mono peq" id="formula">${formulaTexto(form)}</div></div>
      <p class="mut peq" style="margin-top:6px">Regla conservadora: si el gatillo es «conocimiento», el sistema usa la fecha de recepción como conocimiento imputado y nunca una fecha posterior. Feriados: ${S.proyecto.feriados.map(N.fmtFecha).join(', ')}.</p>
      <div class="acciones" style="margin-top:12px"><button class="btn ok" data-act="validar-params"><span class="ms">verified</span> Validar parámetros</button>${p.validado ? `<button class="btn" data-act="revocar-params">Revocar validación</button>` : ''}</div>
    </div>
  </div>`;
}
function formulaTexto(f) {
  if (!f.plazo) return 'Complete el plazo para ver la fórmula.';
  return f.tipo_dias === 'habiles' ? `fecha_límite = WORKDAY(fecha_recepción; ${f.plazo}; feriados) · días_restantes = fecha_límite − HOY()` : `fecha_límite = fecha_recepción + ${f.plazo} · días_restantes = fecha_límite − HOY()`;
}

async function cartas() {
  const lista = S.alertas.filter(a => ['aprobada', 'emitida'].includes(a.estado)).sort((a, b) => (reloj(a).d ?? 0) - (reloj(b).d ?? 0));
  const espera = S.alertas.filter(a => ['confirmada', 'corregida'].includes(a.estado));
  return `
  <div class="cab"><div><h1>Cartas y emisión</h1><p class="mut">U6–U9 · Solo las alertas aprobadas en PD3 generan borrador. La firma y la emisión ocurren fuera del sistema; aquí solo se registra la fecha de emisión.</p></div></div>
  ${espera.length ? `<div class="aviso info" style="margin-bottom:14px"><span class="ms">hourglass_top</span><div>${espera.length} alerta(s) confirmada(s) esperan la aprobación del jefe/a de oficina técnica (PD3). Ábralas desde la bandeja, pestaña «Confirmadas».</div></div>` : ''}
  <div class="tarjeta">${lista.length ? `<div class="tabla-env"><table><thead><tr><th>Plazo</th><th>Alerta</th><th>Cambio</th><th>Borrador</th><th>Emisión</th><th></th></tr></thead><tbody>
    ${lista.map(a => `<tr><td>${cajaDias(a)}</td><td><b>${esc(a.doc_id)}</b><div class="mono peq">${esc(a.id)}</div></td><td>${esc(corto(a.cambio, 160))}</td><td>${a.carta ? pill(`v${a.carta.version} · ${a.carta.origen}`, a.carta.verificacion?.ok ? 'p-ok' : 'p-warn') : pill('Sin generar', 'p-gris')}</td><td>${a.emision ? `${N.fmtFecha(a.emision.fecha)} ${a.emision.a_tiempo ? pill('a tiempo', 'p-ok') : pill('fuera de plazo', 'p-err')}` : '—'}</td><td><a class="btn chico" href="#/carta/${a.id}">Abrir</a></td></tr>`).join('')}
  </tbody></table></div>` : '<p class="mut">Aún no hay alertas aprobadas.</p>'}</div>`;
}

function cartaHtml(a, campos, texto) {
  let cuerpo = esc(texto);
  const vals = Object.values(campos).filter(v => v && String(v).length > 2).sort((x, y) => String(y).length - String(x).length);
  for (const v of vals) { const e = esc(v); cuerpo = cuerpo.split(e).join(`\u0000${e}\u0001`); }
  cuerpo = cuerpo.replace(/\u0000/g, '<mark>').replace(/\u0001/g, '</mark>');
  return `<div class="carta"><div class="cab-carta"><b>EL CONTRATISTA</b><span>Carta N.° ____-2026 · Proyecto ${esc(S.proyecto.proyecto.codigo)}</span></div>
    <p>Lima, ____ de __________ de 2026</p><p>Señores<br><b>LA PROPIETARIA</b><br>Presente.-</p>
    <p><b>Asunto:</b> Notificación de variación — ${esc(campos.documento)} rev. ${esc(campos.revision)}</p>
    <p>De nuestra consideración:</p><p style="text-align:justify">${cuerpo}</p>
    <p>Atentamente,</p><p style="margin-top:36px">______________________<br>Gerente de proyecto<br>EL CONTRATISTA</p></div>`;
}

async function carta(id) {
  const a = S.alertas.find(x => x.id === id);
  if (!a) return `<div class="aviso err">No existe la alerta ${esc(id)}.</div>`;
  if (!['aprobada', 'emitida'].includes(a.estado)) return `<div class="aviso warn"><span class="ms">block</span><div>La alerta ${esc(id)} no está aprobada en PD3: no se genera borrador (CP-12). <a href="#/alerta/${id}">Ver alerta</a></div></div>`;
  const campos = N.camposCarta(a, S.params, docDe(a.doc_id));
  const r = reloj(a);
  const aj = IA.ajustes();
  return `
  <div class="cab"><div><a href="#/cartas" class="peq">← Cartas</a><h1 style="margin-top:4px">Borrador de carta · ${esc(a.doc_id)}</h1><p class="mut"><span class="mono">${esc(a.id)}</span> · fecha límite ${N.fmtFecha(r.fl)}</p></div><div>${cajaDias(a)}</div></div>
  <div class="rejilla r2">
    <div class="tarjeta"><h2>Campos confirmados (base de hechos)</h2><div class="tabla-env" style="margin-top:10px"><table><tbody>${Object.entries(campos).map(([k, v]) => `<tr><th>${esc(k.replace(/_/g, ' '))}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div>
      <div class="acciones" style="margin-top:12px">
        ${aj.modo === 'vivo' ? `<button class="btn pri" data-act="carta-ia" data-id="${a.id}"><span class="ms">auto_awesome</span> Redactar con IA (I4)</button>` : ''}
        <button class="btn" data-act="carta-plantilla" data-id="${a.id}"><span class="ms">description</span> Usar plantilla sin IA</button>
      </div>
      ${aj.modo === 'manual' && a.estado !== 'emitida' ? bloqueManual('i4', N.INSTRUCCIONES.I4['v1.0'].sistema, N.mensajeI4(campos)) : ''}
      ${a.estado === 'aprobada' && a.carta ? `
      <h2 style="margin-top:18px">PD4 · Registro de emisión</h2><p class="mut peq">El gerente de proyecto revisa, firma y emite fuera del sistema. Registre la fecha de emisión para cerrar la alerta.</p>
      <div class="acciones" style="margin-top:8px"><input type="date" id="f-emision" value="${S.hoy}" style="width:auto"><button class="btn ok" data-act="pd4-emitir" data-id="${a.id}"><span class="ms">send</span> Registrar emisión</button></div>` : ''}
      ${a.emision ? `<div class="aviso ${a.emision.a_tiempo ? 'ok' : 'err'}" style="margin-top:14px"><span class="ms">${a.emision.a_tiempo ? 'check_circle' : 'error'}</span><div>Emitida el ${N.fmtFecha(a.emision.fecha)} · fecha límite ${N.fmtFecha(a.emision.fecha_limite)} · <b>${a.emision.a_tiempo ? 'dentro de plazo' : `fuera de plazo por ${a.emision.dias_fuera} día(s)`}</b>.</div></div>` : ''}
    </div>
    <div class="tarjeta"><h2>Borrador ${a.carta ? `v${a.carta.version} <span class="mut peq">(${esc(a.carta.origen)})</span>` : ''}</h2>
      ${a.carta ? `
        <div class="aviso ${a.carta.verificacion.ok ? 'ok' : 'warn'}" style="margin:10px 0"><span class="ms">${a.carta.verificacion.ok ? 'verified' : 'report'}</span><div>${a.carta.verificacion.ok ? 'Control superado: toda cifra o fecha del borrador está en los campos confirmados.' : `Cifras o fechas no trazables a la base de hechos: <b>${esc(a.carta.verificacion.fuera.join(', '))}</b>. Corrija antes de firmar.`}</div></div>
        <div style="overflow-x:auto">${cartaHtml(a, campos, a.carta.texto)}</div>
        <p class="mut peq" style="margin-top:6px">Resaltado: datos que provienen de los campos confirmados. Sin botón de envío al cliente: la emisión es un acto humano.</p>
        <details style="margin-top:8px"><summary>Editar texto</summary><textarea id="carta-texto" style="font-family:inherit;font-size:13.5px">${esc(a.carta.texto)}</textarea><button class="btn chico" style="margin-top:6px" data-act="carta-guardar" data-id="${a.id}">Guardar versión editada</button></details>
        <div class="acciones no-imprimir" style="margin-top:10px"><button class="btn chico" data-act="carta-copiar" data-id="${a.id}"><span class="ms">content_copy</span> Copiar</button><button class="btn chico" data-act="carta-doc" data-id="${a.id}"><span class="ms">download</span> Descargar .doc</button><button class="btn chico" onclick="window.print()"><span class="ms">print</span> Imprimir</button></div>`
      : '<p class="mut" style="margin-top:8px">Genere el borrador con IA, con el modo manual o con la plantilla.</p>'}
    </div>
  </div>`;
}

async function auditoria() {
  const solo = S.filtros.audTodo ? S.auditoria : S.auditoria.filter(x => !S.meta?.corpus_id || x.corpus === S.meta.corpus_id);
  const l = [...solo].reverse();
  return `
  <div class="cab"><div><h1>Auditoría</h1><p class="mut">Registro de solo agregar: cada decisión guarda quién, cuándo, qué y el valor original del modelo. Las reglas de la base de datos impiden editar o borrar eventos.</p></div>
    <div class="acciones"><label class="peq"><input type="checkbox" data-act="aud-todo" ${S.filtros.audTodo ? 'checked' : ''}> Incluir cargas anteriores</label><button class="btn chico" data-act="exportar-auditoria"><span class="ms">download</span> Exportar CSV</button></div></div>
  <div class="tarjeta">${l.length ? `<div class="tabla-env"><table><thead><tr><th>Momento</th><th>Evento</th><th>Alerta</th><th>Quién</th><th>Detalle</th></tr></thead><tbody>
  ${l.map(t => `<tr><td class="peq">${new Date(t.t).toLocaleString('es-PE')}</td><td>${esc(t.evento)}</td><td>${t.alerta ? `<a href="#/alerta/${esc(t.alerta)}" class="mono">${esc(t.alerta)}</a>` : '—'}</td><td class="peq">${esc(t.quien)}</td><td class="peq">${esc(t.detalle)}</td></tr>`).join('')}
  </tbody></table></div>` : '<p class="mut">Sin eventos registrados.</p>'}</div>`;
}

// ---------- pruebas y métricas ----------
async function datosEvaluacion() {
  const [ref, docs] = await Promise.all([
    fetch('data/referencia.json', { cache: 'no-cache' }).then(r => r.json()),
    fetch('data/documentos.json', { cache: 'no-cache' }).then(r => r.json()),
  ]);
  return { ref, docs };
}
function alertasDeCorrida(c) {
  return c.hechos.map(h => { const v = c.vinculos[h.id] || {}; return { ...h, partida: v.partida ?? null, partida_modelo: v.partida ?? null, confianza: v.confianza }; });
}
function filtrarRef(ref, docsIds) {
  const r = { ...ref, documentos: {} };
  for (const id of docsIds) if (ref.documentos[id] !== undefined) r.documentos[id] = ref.documentos[id];
  return r;
}
function tablaMetricas(m, extra = {}) {
  const fila = (nombre, valor, umbral, ok, nota = '') => `<tr><td><b>${nombre}</b><div class="mut peq">${umbral}</div></td><td class="mono" style="font-size:15px;white-space:nowrap">${valor}</td><td>${ok === null ? pill('por medir', 'p-gris') : ok ? pill('Cumple', 'p-ok') : pill('No cumple', 'p-err')}</td><td class="peq mut">${nota}</td></tr>`;
  return `<div class="tabla-env"><table><thead><tr><th>Criterio de aceptación</th><th>Resultado</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>
    ${fila('Cobertura (recall)', N.pct(m.recall, 1), N.UMBRALES.recall.texto, m.recall >= 0.8, `${m.verdaderos_positivos} de ${m.total_referencia} cambios · grandes ${N.pct(m.recall_grandes)} · pequeños ${N.pct(m.recall_pequenos)}`)}
    ${fila('Precisión', N.pct(m.precision, 1), N.UMBRALES.precision.texto, m.precision >= 0.7, `${m.total_alertas - m.falsos_positivos} de ${m.total_alertas} con la referencia congelada${m.arbitrados ? ` · tras arbitraje ${N.pct(m.precision_arbitrada, 1)} (${m.arbitrados} alertas eran cambios reales omitidos por la referencia)` : ''}`)}
    ${fila('Trazabilidad', N.pct(m.trazabilidad, 0), N.UMBRALES.trazabilidad.texto, m.trazabilidad >= 1, 'Cita literal verificada por la app en el texto del documento')}
    ${fila('Vinculación con partida', N.pct(m.vinculacion, 1), 'Referencia del Plan: precisión de I2 ≥ 70 %', m.vinculacion >= 0.7, 'Partida propuesta por el modelo dentro de las aceptables, sobre los cambios detectados')}
    ${extra.reloj !== undefined ? fila('Exactitud del reloj', N.pct(extra.reloj, 0), N.UMBRALES.reloj.texto, extra.reloj >= 1, extra.relojNota || '') : ''}
    ${extra.latencia !== undefined ? fila('Latencia', N.horas(extra.latencia), N.UMBRALES.latencia.texto, extra.latencia !== null ? extra.latencia < 24 : null, extra.latNota || '') : ''}
    ${extra.utilidad !== undefined ? fila('Utilidad', extra.utilidad !== null ? extra.utilidad.toFixed(1) + ' min' : '—', N.UMBRALES.utilidad.texto, extra.utilidad !== null ? extra.utilidad <= 15 : null, extra.utNota || '') : ''}
    ${fila('Rechazo en la ingesta (CP-01)', m.rechazos_ingesta_ok, 'Documentos sin revisión anterior se rechazan antes de llegar al modelo', m.rechazos_ingesta_ok.split('/')[0] === m.rechazos_ingesta_ok.split('/')[1])}
  </tbody></table></div>`;
}
function matriz(m) {
  return `<div class="rejilla r4" style="margin-top:12px">
    <div class="kpi verde"><div class="v">${m.verdaderos_positivos}</div><div class="e">Verdaderos positivos (cambios detectados)</div></div>
    <div class="kpi rojo"><div class="v">${m.falsos_negativos}</div><div class="e">Falsos negativos (omisiones)</div></div>
    <div class="kpi ambar"><div class="v">${m.falsos_positivos}</div><div class="e">Falsos positivos (alertas sin cambio real)</div></div>
    <div class="kpi azul"><div class="v">${m.verdaderos_negativos_docs}/${m.docs_sin_cambio}</div><div class="e">Documentos sin cambio reconocidos como tales</div></div></div>`;
}
function relojIndependiente(fechaIso, params, feriados) {
  // Recálculo independiente (otra implementación): avanza día a día con Date local.
  const [y, m, d] = fechaIso.split('-').map(Number);
  const f = new Date(y, m - 1, d, 12);
  let n = 0;
  while (n < params.plazo) {
    f.setDate(f.getDate() + 1);
    const iso = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
    if (params.tipo_dias !== 'habiles' || (f.getDay() % 6 !== 0 && !feriados.includes(iso))) n++;
  }
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

async function pruebas() {
  const corr = (S.corridas ||= await fetch('data/corridas/indice.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => []));
  const { ref, docs } = await datosEvaluacion();
  const sel = S.filtros.corrida || corr[0]?.archivo;
  let bloqueCorrida = '<p class="mut">No hay corridas registradas.</p>';
  if (sel) {
    const info = corr.find(c => c.archivo === sel);
    const c = await fetch(`data/corridas/${sel}`, { cache: 'no-cache' }).then(r => r.json());
    const idsDocs = [...c.documentos_incluidos, ...c.rechazados_ingesta.map(x => x.doc_id)];
    const r2 = filtrarRef(ref, idsDocs);
    const al = alertasDeCorrida(c);
    const m = N.evaluar({ alertas: al, referencia: r2, documentos: docs });
    const ini = c.llamadas.length ? new Date(c.llamadas[0].inicio) : null;
    const lat = N.mediana(c.hechos.map(h => ini ? (new Date(h.generado_en) - ini) / 3600000 : null));
    const pv = c.clausulas.find(x => x.clausula === ref && false);
    const cl = c.clausulas.find(x => x.clausula.startsWith('14.3'));
    const vr = S.proyecto.contrato.referencia_validacion;
    const i3ok = cl && cl.plazo === vr.plazo && cl.tipo_dias === vr.tipo_dias && cl.gatillo === vr.gatillo;
    bloqueCorrida = `
      <div class="acciones" style="margin:8px 0 12px">${corr.map(x => `<button class="btn chico ${x.archivo === sel ? 'pri' : ''}" data-act="sel-corrida" data-f="${esc(x.archivo)}">${esc(x.nombre)}</button>`).join('')}</div>
      <p class="mut peq">${esc(info?.descripcion || '')}<br>Generada el ${new Date(c.generado).toLocaleString('es-PE')} · ${esc(c.herramienta)} · modelo ${esc(c.llamadas[0]?.modelo || '')} · ${c.llamadas.length} llamadas · ${c.documentos_incluidos.length} documentos procesados.</p>
      ${tablaMetricas(m, { latencia: lat, latNota: 'Tiempo desde el inicio de la corrida hasta que la fila queda registrada', reloj: undefined })}
      ${matriz(m)}
      ${c.clausulas.length ? `<div class="aviso ${i3ok ? 'ok' : 'warn'}" style="margin-top:12px"><span class="ms">gavel</span><div><b>I3 · lectura de cláusula:</b> ${cl ? `cláusula ${esc(cl.clausula)}, gatillo ${esc(cl.gatillo)}, ${cl.plazo} días ${esc(cl.tipo_dias)}` : 'no identificó la 14.3'} — ${i3ok ? 'coincide con la validación manual del contrato.' : 'no coincide con la validación manual.'} Cláusulas listadas: ${c.clausulas.map(x => esc(x.clausula)).join(', ')}.</div></div>` : `<div class="aviso info" style="margin-top:12px"><span class="ms">gavel</span><div>I3 no se ejecutó en esta corrida: la lectura de la cláusula se mide en la corrida v1.0.</div></div>`}
      <details style="margin-top:12px"><summary>Detalle por cambio de referencia (${m.filas.length})</summary><div class="tabla-env" style="margin-top:8px"><table><thead><tr><th>Ref.</th><th>Cambio de referencia</th><th>Tamaño</th><th>¿Detectado?</th><th>Partida esperada</th><th>Propuesta</th><th>Confianza</th></tr></thead><tbody>
        ${m.filas.map(f => `<tr><td class="mono peq">${esc(f.ref_id)}</td><td>${esc(f.cambio_ref)}</td><td>${esc(f.tamano)}</td><td>${f.detectado ? pill('Sí', 'p-ok') : pill('Omitido', 'p-err')}</td><td class="mono">${esc(f.partida_esperada || 'SIN PARTIDA')}</td><td class="mono">${f.detectado ? `${esc(f.partida_propuesta || 'SIN PARTIDA')} ${f.partida_ok ? '✓' : '✗'}` : '—'}</td><td>${f.confianza ? confPill(f.confianza) : '—'}</td></tr>`).join('')}
      </tbody></table></div></details>
      <details style="margin-top:8px"><summary>Falsos positivos (${m.falsos.length}) y filas rechazadas (${c.rechazadas.length})</summary>
        <div class="tabla-env" style="margin-top:8px"><table><thead><tr><th>Tipo</th><th>Documento</th><th>Detalle</th></tr></thead><tbody>
        ${m.falsos.map(f => `<tr><td>${f.arbitraje ? pill('Arbitrado: cambio real', 'p-info') : pill('Falso positivo', 'p-warn')}</td><td>${esc(f.doc_id)}</td><td>${esc(f.cambio)}${f.arbitraje ? `<div class="peq mut">${esc(f.arbitraje)}</div>` : ''}</td></tr>`).join('')}
        ${c.rechazadas.map(x => `<tr><td>${pill('Rechazada', 'p-err')}</td><td>${esc(x.instruccion)}</td><td>${esc(x.motivo)}<div class="mono peq">${esc(x.linea)}</div></td></tr>`).join('')}
        </tbody></table></div></details>`;
  }

  // Espacio actual
  let bloqueEspacio = '<p class="mut">Cargue y procese el corpus para medir su espacio de trabajo.</p>';
  const al = S.alertas.filter(a => a.estado !== 'por_vincular');
  if (al.length) {
    const idsDocs = S.documentos.map(d => d.doc_id);
    const m = N.evaluar({ alertas: al, referencia: filtrarRef(ref, idsDocs), documentos: docs });
    let iguales = 0, total = 0;
    if (S.params?.validado) for (const a of al) { total++; if (N.fechaLimite(a.fecha_recepcion, S.params, S.proyecto.feriados) === relojIndependiente(a.fecha_recepcion, S.params, S.proyecto.feriados)) iguales++; }
    const tiempos = al.map(a => a.decision?.tiempo_revision_s).filter(Boolean).map(s => s / 60);
    const lat = N.mediana(al.map(a => a.generado_en && a.cargado_en ? (new Date(a.generado_en) - new Date(a.cargado_en)) / 3600000 : null));
    const dec = al.filter(a => a.decision);
    const corr2 = dec.filter(a => a.decision.tipo === 'Corregida').length;
    bloqueEspacio = `
      <p class="mut peq">Incluye las correcciones humanas: la vinculación se mide con la propuesta original del modelo, conservada en cada alerta.</p>
      ${tablaMetricas(m, { reloj: total ? iguales / total : 0, relojNota: total ? `${iguales} de ${total} fechas límite iguales al recálculo independiente` : 'Valide los parámetros (PD2)', latencia: lat, latNota: 'Desde la carga del documento hasta la alerta', utilidad: N.mediana(tiempos), utNota: tiempos.length ? `${tiempos.length} decisiones cronometradas · rango ${Math.min(...tiempos).toFixed(1)}–${Math.max(...tiempos).toFixed(1)} min` : 'Se mide cuando oficina técnica decide en la bandeja' })}
      ${matriz(m)}
      <p class="mut peq" style="margin-top:8px">Decisiones PD1 registradas: ${dec.length} · corregidas: ${corr2} · descartadas: ${dec.filter(a => a.decision.tipo === 'Descartada').length}.</p>`;
  }

  return `
  <div class="cab"><div><h1>Pruebas y métricas</h1><p class="mut">Criterios de aceptación del MVP (umbrales del Hito 1) medidos contra el conjunto de referencia congelado antes de la corrida.</p></div>
    <div class="acciones"><button class="btn" data-act="exportar-alertas"><span class="ms">download</span> Exportar alertas CSV</button></div></div>
  <div class="tarjeta"><h2>1 · Corridas registradas (evidencia)</h2>${bloqueCorrida}</div>
  <div class="tarjeta"><h2>2 · Su espacio de trabajo</h2>${bloqueEspacio}</div>
  <div class="tarjeta"><div class="cab" style="margin-bottom:6px"><div><h2>3 · Pruebas automáticas CP-01 a CP-12</h2><p class="mut">Casos de prueba del Plan (Tabla 12) ejecutados sobre el código de la app.</p></div><button class="btn pri" data-act="correr-pruebas"><span class="ms">play_arrow</span> Ejecutar pruebas</button></div><div id="res-pruebas"></div></div>`;
}

async function ayuda() {
  return `
  <div class="cab"><div><h1>Guía de uso</h1><p class="mut">Recorrido completo en unos 10 minutos. La app asigna a cada visitante un espacio propio: puede probar sin afectar a otros.</p></div></div>
  <div class="rejilla r2">
    <div class="tarjeta"><h2>Recorrido de la demostración</h2><ol style="padding-left:18px;line-height:1.7">
      <li><b>Control documentario</b> → <a href="#/ingesta">Ingesta</a>: «Cargar corpus de demostración». Los 2 documentos sin revisión anterior se rechazan.</li>
      <li><b>Administración contractual</b> → <a href="#/parametros">Parámetros</a>: «Usar propuesta registrada», elegir la cláusula 14.3 y «Validar parámetros».</li>
      <li><b>Oficina técnica</b> → <a href="#/procesar">Procesar con IA</a>: modo en vivo con su clave, modo manual o «salidas registradas».</li>
      <li><b>Oficina técnica</b> → <a href="#/bandeja">Bandeja</a>: abrir la alerta más urgente; confirmar, corregir o descartar (PD1).</li>
      <li><b>Jefe/a de OT</b> → en la alerta confirmada: «Aprobar y habilitar carta» (PD3).</li>
      <li><b>Cualquier rol</b> → <a href="#/cartas">Cartas</a>: redactar el borrador (I4 o plantilla) y revisar el control de cifras.</li>
      <li><b>Gerente</b> → registrar la fecha de emisión (PD4): la alerta se cierra y se compara con la fecha límite.</li>
      <li><a href="#/pruebas">Pruebas y métricas</a> y <a href="#/auditoria">Auditoría</a>: evidencias.</li></ol></div>
    <div class="tarjeta"><h2>Qué hace la IA y qué no</h2>
      <div class="tabla-env" style="margin-top:8px"><table><thead><tr><th>Componente</th><th>Quién lo hace</th></tr></thead><tbody>
      <tr><td>Describir el cambio con cita literal (I1)</td><td>Modelo de lenguaje (Claude)</td></tr>
      <tr><td>Proponer la partida con la regla R-V (I2)</td><td>Modelo + regla recalculada por la app</td></tr>
      <tr><td>Leer la cláusula, gatillo y plazo (I3)</td><td>Modelo; valida administración contractual (PD2)</td></tr>
      <tr><td>Calcular fecha límite y días restantes</td><td>Fórmula de la app (nunca el modelo)</td></tr>
      <tr><td>Verificar que la cita exista en el documento</td><td>App (rechaza la fila si no)</td></tr>
      <tr><td>Redactar el borrador (I4)</td><td>Modelo con campos confirmados; la app controla cifras</td></tr>
      <tr><td>Confirmar, aprobar, firmar y emitir</td><td>Personas (PD1, PD3, PD4)</td></tr></tbody></table></div>
      <h3 style="margin-top:14px">Datos</h3><p class="mut">${esc(S.proyecto?.proyecto.nota || '')}</p>
      <h3 style="margin-top:10px">Privacidad</h3><p class="mut">La clave de API se guarda solo en su navegador. Los documentos se guardan en su espacio de Firestore, accesible solo con su sesión anónima.</p>
    </div>
  </div>`;
}

// ================= ACCIONES =================

async function cargarCorpus() {
  if (!requiereRol('control', 'Cargar el registro del CDE')) return;
  const desplazar = $('#desplazar')?.checked;
  const docs = await fetch('data/documentos.json', { cache: 'no-cache' }).then(r => r.json());
  await importarDocumentos(docs, desplazar, 'Corpus de demostración R1');
}

async function importarDocumentos(docs, desplazar, origen) {
  if (S.documentos.length && !confirm('Ya hay documentos cargados. ¿Reemplazar el espacio de trabajo? La auditoría anterior se conserva.')) return;
  toast('Cargando documentos…');
  await reiniciarEspacio(false);
  const maxF = docs.map(d => d.fecha_recepcion).filter(Boolean).sort().pop();
  const desp = desplazar && maxF ? N.difDias(N.sumarDias(N.hoyIso(), -1), maxF) : 0;
  const ahora = new Date().toISOString();
  const corpus_id = `C${Date.now()}`;
  const ops = docs.map(d => {
    const errores = N.validarIngesta(d);
    return { op: 'set', c: 'documentos', id: d.doc_id, reemplazar: true, data: { ...d, fecha_recepcion_original: d.fecha_recepcion, fecha_recepcion: d.fecha_recepcion && desp ? N.sumarDias(d.fecha_recepcion, desp) : d.fecha_recepcion, estado_ingesta: errores.length ? 'rechazado' : 'aceptado', errores, cargado_en: ahora } };
  });
  ops.push({ op: 'set', c: 'config', id: 'meta', reemplazar: true, data: { corpus_id, origen, desplazamiento: desp, cargado_en: ahora } });
  await A.lote(ops);
  await cargarTodo();
  const rech = S.documentos.filter(d => d.estado_ingesta === 'rechazado');
  await auditar('Registro del CDE cargado', null, `${origen}: ${docs.length} documentos, ${rech.length} rechazados (${rech.map(d => d.doc_id).join(', ')}); fechas desplazadas ${desp} días`);
  toast(`${docs.length - rech.length} documentos aceptados · ${rech.length} rechazados por no tener revisión anterior.`);
  enrutar();
}

async function reiniciarEspacio(conAviso = true) {
  if (conAviso && !confirm('¿Borrar documentos, alertas y parámetros de su espacio? La auditoría se conserva.')) return;
  for (const c of ['documentos', 'alertas', 'config']) await A.borrarColeccion(c);
  if (conAviso) { await auditar('Espacio reiniciado'); await cargarTodo(); enrutar(); toast('Espacio reiniciado.'); }
}

function parsearCSV(txt) {
  const filas = []; let f = [], c = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"' && txt[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';') { f.push(c); c = ''; }
    else if (ch === '\n') { f.push(c); filas.push(f); f = []; c = ''; }
    else if (ch !== '\r') c += ch;
  }
  if (c || f.length) { f.push(c); filas.push(f); }
  const [cab, ...resto] = filas.filter(r => r.some(x => x.trim()));
  return resto.map(r => Object.fromEntries(cab.map((k, i) => [k.trim(), (r[i] || '').trim()])));
}
async function importarArchivo(file) {
  if (!requiereRol('control', 'Cargar el registro del CDE')) return;
  const txt = await file.text();
  let docs;
  try { docs = file.name.toLowerCase().endsWith('.json') ? JSON.parse(txt) : parsearCSV(txt); }
  catch (e) { toast('No se pudo leer el archivo: ' + e.message); return; }
  if (!Array.isArray(docs) || !docs.length || !('doc_id' in docs[0])) { toast('El archivo no tiene la columna doc_id. Use la plantilla CSV.'); return; }
  await importarDocumentos(docs, false, `Archivo ${file.name}`);
}
function descargar(nombre, contenido, tipo = 'text/csv;charset=utf-8') {
  const b = new Blob(['﻿' + contenido], { type: tipo });
  const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
}
const csv = (cols, filas) => [cols.join(','), ...filas.map(f => cols.map(k => `"${String(f[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

// --- aplicar salidas de IA ---
async function aplicarI1(texto, etiqueta, docsLote, generadoEn = null) {
  const porId = Object.fromEntries(S.documentos.map(d => [d.doc_id, d]));
  const r = N.parsearI1(texto, porId);
  const base = S.alertas.length;
  const ops = [];
  const t = generadoEn || new Date().toISOString();
  r.hechos.forEach((h, k) => {
    const d = porId[h.doc_id];
    const id = `ALR-${String(base + k + 1).padStart(4, '0')}`;
    ops.push({ op: 'set', c: 'alertas', id, reemplazar: true, data: { ...h, id, estado: 'por_vincular', fecha_recepcion: d.fecha_recepcion, especialidad_doc: d.especialidad, version_I1: etiqueta.version, generado_en: t, cargado_en: d.cargado_en } });
  });
  const conCambios = new Set(r.hechos.map(h => h.doc_id));
  for (const d of docsLote) ops.push({ op: 'set', c: 'documentos', id: d.doc_id, data: { estado_ia: conCambios.has(d.doc_id) ? 'procesado' : r.sinCambios.includes(d.doc_id) ? 'sin_cambios' : 'procesado' } });
  await A.lote(ops);
  return r;
}
async function aplicarI2(texto, etiqueta) {
  const ids = new Set(S.alertas.filter(a => a.estado === 'por_vincular').map(a => a.id));
  const r = N.parsearI2(texto, pcod(), ids);
  const ops = Object.entries(r.vinculos).map(([id, v]) => ({ op: 'set', c: 'alertas', id, data: { ...v, partida_modelo: v.partida, estado: 'pendiente', version_I2: etiqueta.version } }));
  await A.lote(ops);
  return r;
}
async function guardarUltima(u) { await A.guardar('config', 'meta', { ultima_corrida: { ...u, t: new Date().toISOString() } }); }

async function procesarVivo(paso) {
  const btn = document.querySelector(`[data-act="vivo-${paso}"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="carga"></span> Procesando…'; }
  try {
    if (paso === 'i1') {
      const pend = S.documentos.filter(d => d.estado_ingesta === 'aceptado' && !d.estado_ia);
      const v = N.VERSION_VIGENTE.I1; let tot = { hechos: 0, sin_cambios: 0, rechazadas: [] };
      for (let i = 0; i < pend.length; i += 10) {
        const lote = pend.slice(i, i + 10);
        toast(`I1: lote ${i / 10 + 1} de ${Math.ceil(pend.length / 10)}…`, 60000);
        const r0 = await IA.llamarClaude(N.INSTRUCCIONES.I1[v].sistema, N.mensajeI1(lote));
        await cargarTodo();
        const r = await aplicarI1(r0.texto, { version: v }, lote);
        tot.hechos += r.hechos.length; tot.sin_cambios += r.sinCambios.length; tot.rechazadas.push(...r.rechazadas.map(x => ({ ...x, instruccion: `I1 ${v}` })));
        await auditar(`IA · I1 ${v} ejecutada (en vivo)`, null, `${lote.length} documentos · ${r.hechos.length} hechos · ${r.rechazadas.length} filas rechazadas · ${r0.modelo} · ${r0.segundos.toFixed(0)} s`);
      }
      await guardarUltima({ etiqueta: `I1 ${v} en vivo`, ...tot, vinculos: 0 });
    } else if (paso === 'i2') {
      const porV = S.alertas.filter(a => a.estado === 'por_vincular');
      const r0 = await IA.llamarClaude(N.INSTRUCCIONES.I2['v1.0'].sistema, N.mensajeI2(porV, S.proyecto.partidas));
      const r = await aplicarI2(r0.texto, { version: 'v1.0' });
      await auditar('IA · I2 v1.0 ejecutada (en vivo)', null, `${Object.keys(r.vinculos).length} vínculos · ${r.rechazadas.length} filas rechazadas · ${r0.modelo}`);
      await guardarUltima({ etiqueta: 'I2 v1.0 en vivo', hechos: porV.length, vinculos: Object.keys(r.vinculos).length, rechazadas: r.rechazadas.map(x => ({ ...x, instruccion: 'I2 v1.0' })) });
    }
    await cargarTodo(); toast('Procesamiento terminado.'); enrutar();
  } catch (e) { toast(e.message, 7000); if (btn) { btn.disabled = false; btn.textContent = 'Reintentar'; } }
}

async function registrarManual(paso) {
  const texto = $(`#resp-${paso}`)?.value || '';
  if (!texto.trim()) { toast('Pegue primero la respuesta de Claude.'); return; }
  if (paso === 'i1') {
    const pend = S.documentos.filter(d => d.estado_ingesta === 'aceptado' && !d.estado_ia).slice(0, 25);
    const v = N.VERSION_VIGENTE.I1;
    const r = await aplicarI1(texto, { version: v }, pend);
    await auditar(`IA · I1 ${v} registrada (modo manual)`, null, `${r.hechos.length} hechos · ${r.sinCambios.length} sin cambios · ${r.rechazadas.length} filas rechazadas`);
    await guardarUltima({ etiqueta: `I1 ${v} manual`, hechos: r.hechos.length, sin_cambios: r.sinCambios.length, vinculos: 0, rechazadas: r.rechazadas.map(x => ({ ...x, instruccion: `I1 ${v}` })) });
  } else if (paso === 'i2') {
    const r = await aplicarI2(texto, { version: 'v1.0' });
    await auditar('IA · I2 v1.0 registrada (modo manual)', null, `${Object.keys(r.vinculos).length} vínculos · ${r.rechazadas.length} filas rechazadas`);
    await guardarUltima({ etiqueta: 'I2 v1.0 manual', vinculos: Object.keys(r.vinculos).length, rechazadas: r.rechazadas.map(x => ({ ...x, instruccion: 'I2 v1.0' })) });
  } else if (paso === 'i3') {
    const r = N.parsearI3(texto);
    await A.guardar('config', 'meta', { propuesta_I3: r.clausulas });
    await auditar('IA · I3 v1.0 registrada (modo manual)', null, `Cláusulas: ${r.clausulas.map(c => c.clausula).join(', ')}`);
  } else if (paso === 'i4') {
    const id = location.hash.split('/')[2];
    await guardarCarta(id, texto.trim(), 'I4 manual');
  }
  await cargarTodo(); toast('Respuesta registrada y validada.'); enrutar();
}

async function aplicarCorrida(archivo) {
  if (!requiereRol('ot', 'Procesar con IA') && S.rol !== 'control') return;
  const c = await fetch(`data/corridas/${archivo}`, { cache: 'no-cache' }).then(r => r.json());
  const pend = S.documentos.filter(d => d.estado_ingesta === 'aceptado' && !d.estado_ia);
  const idsPend = new Set(pend.map(d => d.doc_id));
  let tot = { hechos: 0, sin_cambios: 0, rechazadas: [], vinculos: 0 };
  const vI1 = c.versiones.I1;
  for (const ll of c.llamadas.filter(x => x.instruccion.startsWith('I1'))) {
    await cargarTodo();
    const lote = pend.filter(d => ll.docs.includes(d.doc_id));
    if (!lote.length) continue;
    const texto = ll.texto.split('\n').filter(l => idsPend.has(l.split('|')[0].trim().replace(/^[-*•]\s*/, ''))).join('\n');
    const r = await aplicarI1(texto, { version: vI1 }, lote);
    tot.hechos += r.hechos.length; tot.sin_cambios += r.sinCambios.length; tot.rechazadas.push(...r.rechazadas.map(x => ({ ...x, instruccion: `I1 ${vI1}` })));
  }
  await cargarTodo();
  // I2: las salidas registradas usan los id de la corrida; se traducen por documento y orden.
  const mapa = {};
  for (const h of c.hechos) {
    const a = S.alertas.find(x => x.estado === 'por_vincular' && x.doc_id === h.doc_id && x.n === h.n && !Object.values(mapa).includes(x.id));
    if (a) mapa[h.id] = a.id;
  }
  const textoI2 = c.llamadas.filter(x => x.instruccion.startsWith('I2')).map(x => x.texto).join('\n').split('\n')
    .map(l => { const id = l.split('|')[0].trim(); return mapa[id] ? l.replace(id, mapa[id]) : null; }).filter(Boolean).join('\n');
  const r2 = await aplicarI2(textoI2, { version: c.versiones.I2 });
  tot.vinculos = Object.keys(r2.vinculos).length; tot.rechazadas.push(...r2.rechazadas.map(x => ({ ...x, instruccion: 'I2 v1.0' })));
  if (c.clausulas?.length) await A.guardar('config', 'meta', { propuesta_I3: c.clausulas });
  await auditar(`IA · salidas registradas aplicadas (${archivo})`, null, `${tot.hechos} hechos · ${tot.vinculos} vínculos · ${tot.rechazadas.length} filas rechazadas · I1 ${vI1}`);
  await guardarUltima({ etiqueta: `Salidas registradas · ${archivo}`, ...tot });
  await cargarTodo(); toast(`${tot.hechos} alertas generadas desde la corrida registrada.`); enrutar();
}

async function vivoI3() {
  try {
    toast('I3: leyendo el contrato…', 60000);
    const r0 = await IA.llamarClaude(N.INSTRUCCIONES.I3['v1.0'].sistema, N.mensajeI3(S.proyecto.contrato));
    const r = N.parsearI3(r0.texto);
    await A.guardar('config', 'meta', { propuesta_I3: r.clausulas });
    await auditar('IA · I3 v1.0 ejecutada (en vivo)', null, `Cláusulas: ${r.clausulas.map(c => c.clausula).join(', ')} · ${r0.modelo}`);
    await cargarTodo(); toast('Propuesta de cláusulas lista.'); enrutar();
  } catch (e) { toast(e.message, 7000); }
}
async function i3Registrada() {
  const corr = await fetch('data/corridas/indice.json', { cache: 'no-cache' }).then(r => r.json());
  let c = null;
  for (const x of corr) { c = await fetch(`data/corridas/${x.archivo}`, { cache: 'no-cache' }).then(r => r.json()); if (c.clausulas?.length) break; }
  await A.guardar('config', 'meta', { propuesta_I3: c.clausulas });
  await auditar('IA · propuesta I3 registrada aplicada', null, `Cláusulas: ${c.clausulas.map(x => x.clausula).join(', ')}`);
  await cargarTodo(); enrutar();
}
function leerFormParams() {
  return { clausula: $('#p-clausula').value.trim(), plazo: Number($('#p-plazo').value), gatillo: $('#p-gatillo').value, tipo_dias: $('#p-tipo').value, consecuencia: $('#p-consecuencia').value.trim(), texto: $('#p-texto').value };
}
async function validarParams() {
  if (!requiereRol('contractual', 'Validar parámetros (PD2)')) return;
  const p = leerFormParams();
  if (!p.clausula || !p.plazo || p.plazo < 1) { toast('Complete la cláusula y un plazo numérico.'); return; }
  await A.guardar('config', 'parametros', { ...p, validado: true, validado_por: ROLES[S.rol], validado_en: new Date().toISOString() });
  await auditar('Parámetros contractuales validados (PD2)', null, `Cláusula ${p.clausula} · gatillo ${p.gatillo} · ${p.plazo} días ${p.tipo_dias}`);
  await cargarTodo(); toast('Parámetros validados: el reloj ya ordena por urgencia.'); enrutar();
}

// --- decisiones ---
function tiempoRevision(id) { const t0 = S.apertura[id] || Date.now(); return Math.max(1, Math.round((Date.now() - t0) / 1000)); }
async function decidir(id, tipo, extra = {}) {
  const a = S.alertas.find(x => x.id === id);
  const estado = { Confirmada: 'confirmada', Corregida: 'corregida', Descartada: 'descartada' }[tipo];
  const decision = { tipo, rol: ROLES[S.rol], uid: A.info().uid, t: new Date().toISOString(), tiempo_revision_s: tiempoRevision(id), valor_original: { partida: a.partida_modelo ?? a.partida, confianza: a.confianza }, ...extra };
  const patch = { estado, decision };
  if (extra.partida !== undefined) { patch.partida = extra.partida; patch.partida_desc = extra.partida ? pcod()[extra.partida].desc : 'Sin partida aplicable'; }
  if (extra.metrado) patch.metrado = extra.metrado;
  await A.guardar('alertas', id, patch);
  await auditar(`Cambio ${{ Confirmada: 'confirmado', Corregida: 'corregido', Descartada: 'descartado' }[tipo]} (PD1)`, id, `${extra.partida !== undefined ? `Partida ${a.partida || 'SIN PARTIDA'} → ${extra.partida || 'SIN PARTIDA'}. ` : ''}${extra.metrado ? `Metrado ${extra.metrado}. ` : ''}${extra.motivo ? `Motivo: ${extra.motivo}. ` : ''}Revisión ${(decision.tiempo_revision_s / 60).toFixed(1)} min.`);
  delete S.apertura[id];
  cerrarModal(); await cargarTodo(); enrutar();
}
function modalCorregir(id) {
  const a = S.alertas.find(x => x.id === id);
  modal(`<h2>Corregir partida · ${esc(a.doc_id)}</h2><p class="mut peq">Se conservará la propuesta original del modelo (${esc(a.partida || 'SIN PARTIDA')}).</p>
    <label class="campo" style="margin-top:10px">Partida correcta<select id="m-partida"><option value="">Sin partida aplicable</option>${S.proyecto.partidas.map(p => `<option value="${p.codigo}" ${p.codigo === (a.alternativa || a.partida) ? 'selected' : ''}>${p.codigo} · ${esc(p.desc)} (${p.und})</option>`).join('')}</select></label>
    <label class="campo" style="margin-top:10px">Metrado preliminar (opcional)<input type="text" id="m-metrado" placeholder="p. ej., 6,40 m²"></label>
    <label class="campo" style="margin-top:10px">Comentario<input type="text" id="m-motivo"></label>
    <div class="acciones" style="margin-top:14px"><button class="btn pri" data-act="m-corregir" data-id="${id}">Guardar corrección</button><button class="btn" data-act="cerrar-modal">Cancelar</button></div>`);
}
function modalMotivo(id, accion) {
  const titulo = accion === 'descartar' ? 'Descartar alerta' : 'Archivar con justificación';
  modal(`<h2>${titulo}</h2><p class="mut peq">El motivo es obligatorio y queda en la auditoría.</p>
    <label class="campo" style="margin-top:10px">Motivo<input type="text" id="m-motivo" placeholder="${accion === 'descartar' ? 'p. ej., no hay cambio real: solo se actualizó el rótulo' : 'p. ej., el cambio se absorbe en el margen de la partida'}"></label>
    <div class="acciones" style="margin-top:14px"><button class="btn pri" data-act="m-${accion}" data-id="${id}">Confirmar</button><button class="btn" data-act="cerrar-modal">Cancelar</button></div>`);
}

async function guardarCarta(id, texto, origen) {
  const a = S.alertas.find(x => x.id === id);
  const campos = N.camposCarta(a, S.params, docDe(a.doc_id));
  const verificacion = N.verificarCarta(texto, campos);
  const version = (a.carta?.version || 0) + 1;
  await A.guardar('alertas', id, { carta: { texto, origen, version, verificacion, t: new Date().toISOString() } });
  await auditar(`Borrador de carta v${version} generado (${origen})`, id, verificacion.ok ? 'Control de cifras superado' : `Cifras no trazables: ${verificacion.fuera.join(', ')}`);
}

// ================= EVENTOS =================
document.addEventListener('click', async e => {
  const ir = e.target.closest('[data-ir]');
  if (ir && !e.target.closest('a,button')) { location.hash = ir.dataset.ir; return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (b.tagName === 'SELECT' || (b.tagName === 'INPUT' && b.type !== 'checkbox')) return;
  try {
    switch (act) {
      case 'cerrar-modal': cerrarModal(); break;
      case 'cerrar-modal-fondo': if (e.target === b) cerrarModal(); break;
      case 'pestana': S.filtros.pestana = b.dataset.v; enrutar(); break;
      case 'cargar-corpus': await cargarCorpus(); break;
      case 'reiniciar': await reiniciarEspacio(); break;
      case 'plantilla-csv': descargar('plantilla_registro_cde.csv', csv(['doc_id', 'tipo', 'titulo', 'especialidad', 'revision', 'revision_anterior', 'fecha_recepcion', 'emisor', 'texto_anterior', 'texto'], [{ doc_id: 'E-999', tipo: 'Lámina', titulo: 'Ejemplo', especialidad: 'Estructuras', revision: 'B', revision_anterior: 'A', fecha_recepcion: N.hoyIso(), emisor: 'Proyectista', texto_anterior: 'Viga V-1 0,30 × 0,60 m', texto: 'Viga V-1 0,30 × 0,70 m' }])); break;
      case 'copiar': { const t = $('#' + b.dataset.src); await navigator.clipboard.writeText(t.value); toast('Instrucción copiada.'); break; }
      case 'registrar-i1': await registrarManual('i1'); break;
      case 'registrar-i2': await registrarManual('i2'); break;
      case 'registrar-i3': await registrarManual('i3'); break;
      case 'registrar-i4': if (!requiereRol('jefe', 'Generar el borrador de carta') && S.rol !== 'ot') return; await registrarManual('i4'); break;
      case 'vivo-i1': if (S.rol !== 'ot' && !requiereRol('control', 'Procesar con IA')) return; await procesarVivo('i1'); break;
      case 'vivo-i2': if (S.rol !== 'ot' && !requiereRol('control', 'Procesar con IA')) return; await procesarVivo('i2'); break;
      case 'aplicar-corrida': await aplicarCorrida(b.dataset.f); break;
      case 'ia-guardar-clave': IA.guardarAjustes({ clave: $('#ia-clave').value.trim() }); toast('Clave guardada en este navegador.'); break;
      case 'ia-probar': {
        IA.guardarAjustes({ clave: $('#ia-clave').value.trim() });
        b.disabled = true;
        try { const r = await IA.llamarClaude('Responde solo con la palabra OK.', 'Prueba de conexión'); toast(`Conexión correcta con ${r.modelo} (${r.segundos.toFixed(1)} s).`); }
        catch (err) { toast(err.message, 7000); }
        b.disabled = false; break;
      }
      case 'vivo-i3': if (!requiereRol('contractual', 'Proponer la cláusula')) return; await vivoI3(); break;
      case 'i3-registrada': await i3Registrada(); break;
      case 'usar-clausula': {
        const x = S.meta.propuesta_I3[Number(b.dataset.i)];
        $('#p-clausula').value = x.clausula; $('#p-plazo').value = x.plazo || '';
        if (['recepcion', 'conocimiento', 'instruccion'].includes(x.gatillo)) $('#p-gatillo').value = x.gatillo;
        if (['calendario', 'habiles'].includes(x.tipo_dias)) $('#p-tipo').value = x.tipo_dias;
        $('#p-consecuencia').value = x.consecuencia; $('#p-texto').value = x.texto_literal;
        $('#formula').textContent = formulaTexto(leerFormParams());
        toast(`Cláusula ${x.clausula} cargada. Revísela y valide.`); break;
      }
      case 'validar-params': await validarParams(); break;
      case 'revocar-params': if (!requiereRol('contractual', 'Revocar la validación')) return; await A.guardar('config', 'parametros', { validado: false }); await auditar('Validación de parámetros revocada'); await cargarTodo(); enrutar(); break;
      case 'pd1-confirmar': if (!requiereRol('ot', 'Confirmar (PD1)')) return; await decidir(id, 'Confirmada'); toast('Cambio confirmado. Pasa a aprobación del jefe/a de OT (PD3).'); break;
      case 'pd1-corregir': if (!requiereRol('ot', 'Corregir (PD1)')) return; modalCorregir(id); break;
      case 'pd1-descartar': if (!requiereRol('ot', 'Descartar (PD1)')) return; modalMotivo(id, 'descartar'); break;
      case 'm-corregir': await decidir(id, 'Corregida', { partida: $('#m-partida').value || null, metrado: $('#m-metrado').value.trim(), motivo: $('#m-motivo').value.trim() }); toast('Corrección registrada con el valor original del modelo.'); break;
      case 'm-descartar': { const m = $('#m-motivo').value.trim(); if (!m) { toast('Escriba el motivo.'); return; } await decidir(id, 'Descartada', { motivo: m }); break; }
      case 'pd3-aprobar': if (!requiereRol('jefe', 'Aprobar la valorización (PD3)')) return; await A.guardar('alertas', id, { estado: 'aprobada', aprobacion: { rol: ROLES[S.rol], t: new Date().toISOString() } }); await auditar('Valorización aprobada; carta habilitada (PD3)', id); await cargarTodo(); location.hash = `#/carta/${id}`; break;
      case 'pd3-archivar': if (!requiereRol('jefe', 'Archivar (PD3)')) return; modalMotivo(id, 'archivar'); break;
      case 'm-archivar': { const m = $('#m-motivo').value.trim(); if (!m) { toast('Escriba el motivo.'); return; } await A.guardar('alertas', id, { estado: 'archivada', archivo: { motivo: m, rol: ROLES[S.rol], t: new Date().toISOString() } }); await auditar('Alerta archivada con justificación (PD3)', id, m); cerrarModal(); await cargarTodo(); enrutar(); break; }
      case 'carta-ia': {
        const a = S.alertas.find(x => x.id === id); b.disabled = true; b.innerHTML = '<span class="carga"></span> Redactando…';
        try { const r = await IA.llamarClaude(N.INSTRUCCIONES.I4['v1.0'].sistema, N.mensajeI4(N.camposCarta(a, S.params, docDe(a.doc_id)))); await guardarCarta(id, r.texto, `I4 v1.0 · ${r.modelo}`); }
        catch (err) { toast(err.message, 7000); }
        await cargarTodo(); enrutar(); break;
      }
      case 'carta-plantilla': { const a = S.alertas.find(x => x.id === id); await guardarCarta(id, N.cartaPlantilla(N.camposCarta(a, S.params, docDe(a.doc_id))), 'plantilla'); await cargarTodo(); enrutar(); break; }
      case 'carta-guardar': await guardarCarta(id, $('#carta-texto').value.trim(), 'edición humana'); await cargarTodo(); enrutar(); break;
      case 'carta-copiar': { const a = S.alertas.find(x => x.id === id); await navigator.clipboard.writeText(a.carta.texto); toast('Texto copiado.'); break; }
      case 'carta-doc': {
        const a = S.alertas.find(x => x.id === id); const campos = N.camposCarta(a, S.params, docDe(a.doc_id));
        descargar(`Carta_${a.doc_id}_${a.id}.doc`, `<html><head><meta charset="utf-8"></head><body>${cartaHtml(a, campos, a.carta.texto).replace(/<\/?mark>/g, '')}</body></html>`, 'application/msword'); break;
      }
      case 'pd4-emitir': {
        if (!requiereRol('gerente', 'Registrar la emisión (PD4)')) return;
        const a = S.alertas.find(x => x.id === id); const f = $('#f-emision').value; const fl = reloj(a).fl;
        const dif = N.difDias(f, fl);
        await A.guardar('alertas', id, { estado: 'emitida', emision: { fecha: f, fecha_limite: fl, a_tiempo: dif <= 0, dias_fuera: Math.max(0, dif), rol: ROLES[S.rol], t: new Date().toISOString() } });
        await auditar('Emisión registrada; alerta cerrada (PD4)', id, `Emitida ${N.fmtFecha(f)} · límite ${N.fmtFecha(fl)} · ${dif <= 0 ? 'dentro de plazo' : `fuera de plazo por ${dif} día(s)`}`);
        await cargarTodo(); enrutar(); break;
      }
      case 'aud-todo': S.filtros.audTodo = b.checked; enrutar(); break;
      case 'exportar-auditoria': descargar('auditoria_reloj_contractual.csv', csv(['t', 'evento', 'alerta', 'quien', 'rol', 'detalle', 'corpus'], S.auditoria)); break;
      case 'exportar-alertas': descargar('alertas_reloj_contractual.csv', csv(['id', 'doc_id', 'fecha_recepcion', 'cambio', 'ubicacion', 'especialidad', 'cita', 'partida_modelo', 'partida', 'confianza', 'estado', 'version_I1', 'version_I2', 'generado_en'], S.alertas)); break;
      case 'sel-corrida': S.filtros.corrida = b.dataset.f; enrutar(); break;
      case 'correr-pruebas': {
        const docs = await fetch('data/documentos.json').then(r => r.json());
        const res = casosDePrueba(S.proyecto, docs);
        $('#res-pruebas').innerHTML = `<p style="margin:8px 0"><b>${res.filter(r => r.ok).length} de ${res.length} casos superados</b> · ${new Date().toLocaleString('es-PE')}</p><div class="tabla-env"><table><thead><tr><th>Caso</th><th>Requisito</th><th>Escenario</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>${res.map(r => `<tr><td class="mono">${r.id}</td><td>${r.req}</td><td>${esc(r.esc)}</td><td>${r.ok ? pill('Pasa', 'p-ok') : pill('Falla', 'p-err')}</td><td class="peq">${esc(r.det)}</td></tr>`).join('')}</tbody></table></div>`;
        await auditar('Pruebas automáticas ejecutadas', null, `${res.filter(r => r.ok).length}/${res.length} casos superados`);
        break;
      }
    }
  } catch (err) { console.error(err); toast('Error: ' + err.message, 7000); }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'rol') { S.rol = t.value; A.preferencia('rol', S.rol); toast(`Ahora actúa como ${ROLES[S.rol]}.`); enrutar(); }
  else if (t.id === 'fecha-ref') { S.hoy = t.value || N.hoyIso(); enrutar(); }
  else if (t.id === 'archivo' && t.files[0]) await importarArchivo(t.files[0]);
  else if (t.dataset.act === 'filtro') { S.filtros[t.dataset.k] = t.value; enrutar(); }
  else if (t.dataset.act === 'ia-modo') { IA.guardarAjustes({ modo: t.value }); enrutar(); }
  else if (t.dataset.act === 'ia-modelo') { IA.guardarAjustes({ modelo: t.value }); }
  else if (['p-plazo', 'p-tipo'].includes(t.id)) $('#formula').textContent = formulaTexto(leerFormParams());
});
document.addEventListener('dragover', e => { const z = e.target.closest('#zona'); if (z) { e.preventDefault(); z.classList.add('sobre'); } });
document.addEventListener('dragleave', e => { const z = e.target.closest('#zona'); if (z) z.classList.remove('sobre'); });
document.addEventListener('drop', async e => { const z = e.target.closest('#zona'); if (z) { e.preventDefault(); z.classList.remove('sobre'); if (e.dataTransfer.files[0]) await importarArchivo(e.dataTransfer.files[0]); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarModal(); });

// ================= ARRANQUE =================
function aplicarTema(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
aplicarTema(A.preferencia('tema'));
$('#btn-tema').onclick = () => {
  const oscuro = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const n = oscuro ? 'light' : 'dark'; aplicarTema(n); A.preferencia('tema', n);
};

async function entrar() {
  const btn = $('#btn-entrar');
  btn.disabled = true; btn.innerHTML = '<span class="carga"></span> Conectando…';
  try {
    const [inf, proyecto] = await Promise.all([A.iniciar(), fetch('data/proyecto.json').then(r => r.json())]);
    S.proyecto = proyecto;
    await cargarTodo();
    $('#rol').innerHTML = Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${S.rol === k ? 'selected' : ''}>${v}</option>`).join('');
    $('#fecha-ref').value = S.hoy;
    $('#modo-datos').innerHTML = inf.modo === 'firestore' ? pill('En la nube · Firestore', 'p-ok') : pill('Modo local · este navegador', 'p-warn');
    $('#portada').hidden = true; $('#app').hidden = false;
    sessionStorage.setItem('reloj-dentro', '1');
    if (!location.hash || location.hash === '#') location.hash = S.documentos.length ? '#/panorama' : '#/ingesta';
    else enrutar();
  } catch (e) {
    console.error(e);
    $('#estado-entrada').textContent = 'No se pudo iniciar: ' + e.message;
    btn.disabled = false; btn.textContent = 'Reintentar';
  }
}
$('#btn-entrar').onclick = entrar;
$('#btn-guia').onclick = e => { e.preventDefault(); location.hash = '#/ayuda'; entrar(); };
window.addEventListener('hashchange', () => { if (!$('#app').hidden) enrutar(); });
if (sessionStorage.getItem('reloj-dentro')) entrar();
