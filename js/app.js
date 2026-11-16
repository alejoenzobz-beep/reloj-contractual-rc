// Reloj Contractual · interfaz v2 (Hito 3). La lógica es la del MVP (nucleo.js, sin cambios):
// el modelo lee y propone, la fórmula cuenta, la persona decide.
import * as N from './nucleo.js';
import * as IA from './ia.js';
import { vComparar } from './comparador.js';

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
const PARAMS = { ...proyecto.contrato.referencia_validacion }; // cláusula validada por administración contractual (PD2)
const FERIADOS = proyecto.feriados;
const clausula143 = reg.clausulas.find(c => c.clausula === '14.3');

const alertas = reg.hechos.map(h => {
  const v = reg.vinculos[h.id] || {};
  const d = docPorId[h.doc_id];
  const fecha_recepcion = d.fecha_recepcion;
  return { ...h, ...v, partida_modelo: v.partida ?? null, fecha_recepcion, limite: N.fechaLimite(fecha_recepcion, PARAMS, FERIADOS), doc: d };
});
const alertaPorId = Object.fromEntries(alertas.map(a => [a.id, a]));
// Alertas creadas en «Comparar revisiones»: se guardan en este navegador.
let nuevas = [];
try { nuevas = JSON.parse(localStorage.getItem('rc-nuevas') || '[]'); } catch { }
function incorporar(doc, filas) {
  docPorId[doc.doc_id] = doc;
  return filas.map(f => { const a = { ...f, partida_modelo: f.partida ?? null, fecha_recepcion: doc.fecha_recepcion, limite: N.fechaLimite(doc.fecha_recepcion, PARAMS, FERIADOS), doc, origen: 'comparador' }; alertas.push(a); alertaPorId[a.id] = a; return a; });
}
nuevas.forEach(n => incorporar(n.doc, n.filas));
function crearAlertas(doc, hechos) {
  // Reemplaza las alertas anteriores del mismo documento comparado.
  for (let k = alertas.length - 1; k >= 0; k--) if (alertas[k].origen === 'comparador' && alertas[k].doc_id === doc.doc_id) { delete alertaPorId[alertas[k].id]; alertas.splice(k, 1); }
  nuevas = nuevas.filter(n => n.doc.doc_id !== doc.doc_id);
  const sig = 1 + Math.max(0, ...alertas.filter(a => a.origen === 'comparador').map(a => Number(a.id.slice(5)) || 0), ...nuevas.flatMap(n => n.filas.map(f => Number(f.id.slice(5)) || 0)));
  const filas = hechos.map((h, i) => ({ ...h, id: `ALR-C${String(sig + i).padStart(3, '0')}`, confianza: h.confianza || 'Sin propuesta', criterios: h.criterios || null, partida: h.partida ?? null, partida_desc: h.partida_desc || '', sustento: h.sustento || 'Sin propuesta de partida en el modo de IA usado.' }));
  nuevas.push({ doc, filas });
  try { localStorage.setItem('rc-nuevas', JSON.stringify(nuevas)); } catch { }
  const res = incorporar(doc, filas);
  registrar('Asistente', `${doc.doc_id} · ${res.length} cambio(s) detectado(s) al comparar revisiones ${doc.revision_anterior} y ${doc.revision}`);
  return res;
}
const FECHAS = docs.map(d => d.fecha_recepcion).sort();
const PRIMERA = N.sumarDias(FECHAS[0], -1), ULTIMA = N.sumarDias(FECHAS[FECHAS.length - 1], 10);

// ---------- estado (en memoria; recuerda decisiones en este navegador si se puede) ----------
const est = { hoy: '2026-10-09', decisiones: {}, registro: [], filtro: 'pendientes', esp: 'todas', simPaso: 0, simDecision: null };
try { const g = JSON.parse(localStorage.getItem('rc-estado') || 'null'); if (g) Object.assign(est, { decisiones: g.decisiones || {}, registro: g.registro || [] }); } catch { }
const guardar = () => { try { localStorage.setItem('rc-estado', JSON.stringify({ decisiones: est.decisiones, registro: est.registro })); } catch { } };
const registrar = (quien, que) => { est.registro.unshift({ t: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }), quien, que }); guardar(); };

const estadoDe = a => {
  if (est.decisiones[a.id]) return 'decidido';
  return N.semaforo(N.diasRestantes(a.limite, est.hoy));
};

let sample = null;
async function preguntarIA(texto, onText, tier = 'default') {
  if (!sample) throw new Error('La IA en vivo no está disponible en esta vista.');
  const r = await sample(texto, { modelTier: tier, cache: false, onText: onText ? ({ text }) => onText(text) : undefined });
  return r.text;
}

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
function pista(a, ancho = 220) {
  const ini = a.fecha_recepcion, dias = 16, x = d => 6 + (d / dias) * (ancho - 12);
  const lim = N.difDias(a.limite, ini), hoy = N.difDias(est.hoy, ini);
  const hx = Math.max(0, Math.min(dias, hoy));
  return `<svg viewBox="0 0 ${ancho} 34" role="img" aria-label="Recibido el ${fCorta(ini)}, vence el ${fCorta(a.limite)}">
    <line x1="${x(0)}" x2="${x(dias)}" y1="17" y2="17" stroke="var(--linea)" stroke-width="2"/>
    <rect x="${x(0)}" y="11" width="${x(lim) - x(0)}" height="12" rx="3" fill="var(--plano-suave)" stroke="var(--plano)"/>
    <line x1="${x(4)}" x2="${x(4)}" y1="6" y2="28" stroke="var(--texto-2)" stroke-dasharray="2 2"/>
    <text x="${x(4) + 3}" y="33" font-size="8" fill="var(--texto-2)">sin sistema</text>
    <circle cx="${x(lim)}" cy="17" r="4" fill="var(--nube)"/>
    ${hoy >= 0 ? `<line x1="${x(hx)}" x2="${x(hx)}" y1="3" y2="31" stroke="var(--tinta)" stroke-width="2"/>` : ''}
  </svg>`;
}
function diasBadge(a, cls = '') {
  const e = estadoDe(a);
  if (e === 'decidido') return `<div class="dias s-decidido ${cls}"><b>✓</b><small>${esc(est.decisiones[a.id].estado)}</small></div>`;
  const d = N.diasRestantes(a.limite, est.hoy);
  return `<div class="dias s-${e} ${cls}"><b class="num">${Math.abs(d)}</b><small>${d < 0 ? (d === -1 ? 'día vencido' : 'días vencido') : d === 0 ? 'último día' : d === 1 ? 'día queda' : 'días quedan'}</small></div>`;
}
function fraseDias(a) {
  const d = N.diasRestantes(a.limite, est.hoy);
  const base = `Cláusula ${PARAMS.clausula}: ${PARAMS.plazo} días ${PARAMS.tipo_dias} desde la recepción (${N.fmtFecha(a.fecha_recepcion)}).`;
  if (est.decisiones[a.id]) return `Ya se decidió: ${est.decisiones[a.id].estado}. ${base}`;
  if (d < 0) return `El plazo para notificar venció el ${N.fmtFecha(a.limite)}. ${base}`;
  if (d === 0) return `Hoy es el último día para notificar. ${base}`;
  return `Notifica antes del ${N.fmtFecha(a.limite)}: te quedan ${d} día${d === 1 ? '' : 's'}. ${base}`;
}

// ---------- router ----------
const VISTAS = ['inicio', 'simulacion', 'tablero', 'comparar', 'resultados'];
function ruta() {
  let h = location.hash.slice(1) || 'inicio';
  if (h === 'probar') h = 'comparar';
  if (h.startsWith('alerta-')) return { vista: 'alerta', id: h.slice(7).toUpperCase() };
  return { vista: VISTAS.includes(h) ? h : 'inicio' };
}
function render() {
  const r = ruta();
  document.querySelectorAll('.vista').forEach(v => v.hidden = v.id !== `v-${r.vista}`);
  document.querySelectorAll('#menu a').forEach(a => { if (a.getAttribute('href') === `#${r.vista === 'alerta' ? 'tablero' : r.vista}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('#ruta-vista').textContent = { inicio: 'Inicio', simulacion: 'Cómo funciona', tablero: 'Alertas', alerta: 'Detalle de alerta', comparar: 'Comparar revisiones', resultados: 'Resultados' }[r.vista];
  pintarFecha();
  ({ inicio: vInicio, simulacion: vSim, tablero: vTablero, alerta: () => vAlerta(r.id), comparar: () => vComparar({ est, proyecto, partidaPorCod, crearAlertas }), resultados: vResultados })[r.vista]();
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
function vInicio() {
  const visibles = alertas.filter(a => a.fecha_recepcion <= est.hoy && !est.decisiones[a.id]);
  visibles.sort((x, y) => N.diasRestantes(x.limite, est.hoy) - N.diasRestantes(y.limite, est.hoy));
  const urg = visibles.filter(a => ['rojo', 'ambar'].includes(estadoDe(a))).length, venc = visibles.filter(a => estadoDe(a) === 'vencido').length;
  const top = visibles.slice(0, 4), d0 = top[0];
  const chipCls = a => ({ verde: 'verde', ambar: 'ambar', rojo: 'naranja', vencido: 'naranja' })[estadoDe(a)] || '';
  const diasTxt = a => { const d = N.diasRestantes(a.limite, est.hoy); return d < 0 ? ['' + -d, 'días vencido'] : d === 0 ? ['0', 'último día'] : ['' + d, d === 1 ? 'día queda' : 'días quedan']; };
  const tarjeta = (a, i) => {
    const [n, t] = diasTxt(a), dest = i === 0, usado = Math.min(7, Math.max(0, N.difDias(est.hoy, a.fecha_recepcion)));
    return `<a class="tarj ${dest ? 'destacada' : ''} anim" style="animation-delay:${.08 * i + .1}s" href="#alerta-${a.id.toLowerCase()}">
      <div style="display:flex;gap:16px;align-items:flex-start;min-width:0">
        ${dest ? `<span class="icono-doc">${ICO.doc}</span>` : ''}
        <div style="min-width:0">
          <span class="sup"><span class="anillo"></span>Recibido ${fCorta(a.fecha_recepcion)} · ${esc(a.doc_id)} ${a.doc.tipo === 'Lámina' ? 'rev. ' + esc(a.doc.revision) : esc(a.doc.tipo)}</span>
          <h3>${esc(a.elemento)}</h3>
          <p class="desc"><b>Cambio:</b> ${esc(primeraFrase(a.cambio))}</p>
          <div class="pie"><span class="hora">${ICO.reloj} Notificar hasta el ${fCorta(a.limite)}</span>
            ${a.partida ? `<span class="etq">${esc(a.partida)} · ${esc(a.partida_desc.length > 34 ? a.partida_desc.slice(0, 33) + '…' : a.partida_desc)}</span>` : '<span class="etq ambar">Sin partida en el presupuesto</span>'}
            <span class="etq ${a.confianza === 'Alta' ? 'verde' : a.confianza === 'Media' ? 'ambar' : 'naranja'}">Confianza ${a.confianza.toLowerCase()}</span></div>
          ${dest ? `<div class="pie" style="margin-top:14px"><span>Plazo usado</span><span class="prog"><span class="barra"><span class="lleno ${usado >= 5 ? 'urg' : ''}" style="width:${usado / 7 * 100}%"></span></span><span class="val num">${usado}/7 días</span></span></div>` : ''}
        </div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:10px"><span class="dias-chip ${chipCls(a)}"><b class="num">${n}</b><small>${t}</small></span><span class="acc-red"><span title="Cita verificada">${ICO.cita}</span><span title="Abrir">${ICO.flecha}</span></span></div></a>`;
  };
  // documentos recibidos por día, 10 días hasta hoy
  const dias = Array.from({ length: 10 }, (_, k) => N.sumarDias(est.hoy, k - 9));
  const cuenta = dias.map(f => docs.filter(d => d.fecha_recepcion === f).length);
  const semana = cuenta.slice(-7).reduce((s, x) => s + x, 0);
  const casos = [['ALR-0002', 'E-204', 'Cambio dentro de una nota de lámina'], [alertas.find(a => a.doc_id === 'CT-024')?.id, 'CT-024', 'Instrucción en el cuarto párrafo de una carta'], [alertas.find(a => a.doc_id === 'RFI-155')?.id, 'RFI-155', 'Absolución de RFI sin partida en el presupuesto']];
  $('#v-inicio').innerHTML = `
  <div class="pano">
    <div>
      <div class="hero anim"><span class="sup-id">Asistente de trazabilidad documental y contractual</span><h1>Notifica <span class="grad">a tiempo</span>, con la prueba en la mano.</h1>
        <p>Reloj Contractual compara cada revisión que llega al entorno común de datos (CDE), identifica qué cambió, propone la partida del presupuesto y calcula el plazo contractual que queda para notificar.</p></div>
      <div class="filtros-hero anim" style="animation-delay:.05s">
        <a class="pill" href="#tablero" data-ir="pendientes"><span class="dot" style="background:var(--verde)"></span>Por decidir <b class="num">${visibles.length}</b></a>
        <a class="pill" href="#tablero" data-ir="urgentes"><span class="dot" style="background:var(--ambar)"></span>Vencen en 3 días <b class="num">${urg}</b></a>
        <a class="pill" href="#tablero" data-ir="vencidas"><span class="dot" style="background:var(--naranja)"></span>Vencidas <b class="num">${venc}</b></a>
        <a class="btn prim" href="#simulacion">Ver cómo funciona</a>
      </div>
      <div class="tarjetas">${top.length ? top.map(tarjeta).join('') : '<p class="vacio">No hay alertas pendientes a esta fecha. Cambia la fecha en el chip «Hoy».</p>'}</div>
      <p class="ruta5">Mostrando las ${top.length} que vencen primero de ${visibles.length} pendientes al ${N.fmtFecha(est.hoy)}. <a href="#tablero">Ver todas las alertas</a></p>
    </div>
    <aside class="lado">
      ${d0 ? `<div class="nota anim" style="animation-delay:.15s"><h3>Alerta del día <span class="redondo" style="width:34px;height:34px">${ICO.doc}</span></h3>
        <p class="cuerpo">Notifica antes del <b>${N.fmtFecha(d0.limite)}</b>: ${esc(primeraFrase(d0.cambio))}</p>
        <div class="acciones-n"><span>${ICO.reloj} ${esc(diasTxt(d0).join(' '))}</span><a class="btn peq prim" href="#alerta-${d0.id.toLowerCase()}">Revisar ahora</a></div></div>` : ''}
      <div class="vidrio reloj-card anim" style="animation-delay:.25s"><h3>Caso de referencia: el plazo se consume en entender el cambio</h3>
        <svg id="dial" viewBox="0 0 300 262" role="img" aria-label="Caso real: plazo de 5 días; entender el cambio tomó 3 a 4 días; queda 1 día para el sustento"></svg>
        <div class="ley"><span><i style="background:var(--naranja)"></i>Plazo del contrato · 5 días</span><span><i style="background:var(--azul-2)"></i>Entender el cambio · 3–4 días</span></div>
        <p style="font-size:.78rem;color:var(--texto-3);margin-top:8px">Fuente: consulta a residente de obra, 16/11/2026 (n = 2). En el otro caso consultado, oficina técnica: 2–3 días de un plazo de 7. Son casos observados, no la regla del contrato.</p></div>
      <div class="vidrio act-card anim" style="animation-delay:.35s"><div class="cab"><div><h3>Documentos que llegan</h3><small>${semana} en los últimos 7 días · cada uno arranca un plazo</small></div><a class="btn peq" href="#resultados">Resultados</a></div>
        <svg viewBox="0 0 300 130" role="img" aria-label="Documentos recibidos por día">${cuenta.map((c, k) => {
          const x = 14 + k * 28, h = c ? 14 + c * 16 : 4, y = 104 - h, hoy = k === 9;
          return `<rect x="${x}" y="${y}" width="18" height="${h}" rx="5" fill="${hoy ? 'url(#rayaHoy)' : 'url(#raya)'}"/>${hoy ? `<g><rect x="${x - 9}" y="${y - 26}" width="36" height="20" rx="10" fill="var(--azul)"/><text x="${x + 9}" y="${y - 12}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${c}</text></g>` : ''}<text x="${x + 9}" y="122" text-anchor="middle" font-size="9.5" fill="${hoy ? 'var(--tinta)' : 'var(--texto-3)'}" font-weight="${hoy ? 700 : 400}">${Number(dias[k].slice(8))}</text>`;
        }).join('')}<defs><pattern id="raya" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-50)"><rect width="6" height="6" fill="rgba(143,176,255,.18)"/><rect width="2.5" height="6" fill="rgba(143,176,255,.55)"/></pattern><pattern id="rayaHoy" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-50)"><rect width="6" height="6" fill="rgba(143,176,255,.5)"/><rect width="3" height="6" fill="#fff"/></pattern></defs></svg></div>
    </aside>
  </div>
  <section class="seccion-pano"><h2>Casos del proyecto de demostración</h2><p class="sub" style="margin-top:6px">Tres documentos del proyecto R1 (sintético) en los que el cambio relevante no está en el cuadro de revisiones. Cada tarjeta muestra la cita literal verificada y la partida vinculada.</p>
    <div class="casos3">${casos.map(([id, dId, q]) => { const d = docPorId[dId], a = alertaPorId[id];
      return `<a class="vidrio caso3" href="#alerta-${id.toLowerCase()}"><span class="q">${esc(q)}</span><div class="frag">${conCita(d.texto.split('\n').find(l => l.includes(a.cita.slice(0, 18))) || d.texto.slice(0, 160), a.cita).replace('mark class="cita"', 'mark')}</div><span class="etq">${esc(dId)} · ${a.partida ? esc(a.partida) : 'sin partida'}</span></a>`; }).join('')}</div>
  </section>`;
  document.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => { est.filtro = b.dataset.ir; });
  dibujarDial();
}
let animId = 0;
function dibujarDial() {
  const svg = $('#dial'); if (!svg) return;
  const cx = 150, cy = 132, R1 = 92, R2 = 70, T = 7, id = ++animId; // escala: 7 días
  const ang = d => (-90 + d * 360 / T) * Math.PI / 180;
  const arco = (r, d) => `M ${cx} ${cy - r} A ${r} ${r} 0 ${d > T / 2 ? 1 : 0} 1 ${cx + r * Math.cos(ang(d))} ${cy + r * Math.sin(ang(d))}`;
  const ticks = Array.from({ length: T * 4 }, (_, k) => { const a = ang(k / 4), m = k % 4 === 0; return `<line x1="${cx + 104 * Math.cos(a)}" y1="${cy + 104 * Math.sin(a)}" x2="${cx + (m ? 114 : 108) * Math.cos(a)}" y2="${cy + (m ? 114 : 108) * Math.sin(a)}" stroke="${m ? 'var(--tinta)' : 'var(--texto-3)'}" stroke-width="${m ? 2 : 1}"/>`; }).join('');
  const et = (d, txt, col) => { const a = ang(d), x = cx + 124 * Math.cos(a), y = cy + 124 * Math.sin(a) + 4; return `<text x="${x}" y="${y}" text-anchor="${Math.cos(a) > .2 ? 'start' : Math.cos(a) < -.2 ? 'end' : 'middle'}" font-size="10" font-weight="700" fill="${col}">${txt}</text>`; };
  svg.innerHTML = `<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <circle cx="${cx}" cy="${cy}" r="${R1}" fill="none" stroke="var(--borde)" stroke-width="10"/><circle cx="${cx}" cy="${cy}" r="${R2}" fill="none" stroke="var(--borde)" stroke-width="10"/>${ticks}
    <path id="aE" d="${arco(R2, 4)}" fill="none" stroke="var(--azul-2)" stroke-width="10" stroke-linecap="round" filter="url(#glow)"/>
    <path id="aP" d="${arco(R1, 5)}" fill="none" stroke="var(--naranja)" stroke-width="10" stroke-linecap="round" filter="url(#glow)"/>
    <text x="${cx}" y="${cy + 2}" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="30" fill="var(--tinta)">1 día</text>
    <text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="11" fill="var(--texto-2)">queda para el sustento</text>
    ${et(0, 'día 0', 'var(--texto-2)')}${et(4, 'día 4', 'var(--azul-2)')}${et(5, 'día 5', 'var(--naranja)')}`;
  const aP = $('#aP'), aE = $('#aE'), LP = aP.getTotalLength(), LE = aE.getTotalLength();
  [[aP, LP], [aE, LE]].forEach(([p, L]) => { p.style.strokeDasharray = L; p.style.strokeDashoffset = reducido ? 0 : L; });
  if (reducido) return;
  const t0 = performance.now();
  const paso = t => { if (id !== animId) return; const k = Math.max(0, Math.min(1, (t - t0) / 2400)), e = 1 - Math.pow(1 - k, 3);
    aP.style.strokeDashoffset = LP * (1 - e); aE.style.strokeDashoffset = LE * (1 - e); if (k < 1) requestAnimationFrame(paso); };
  requestAnimationFrame(paso);
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
  const pie = `<div class="escena-pie"><button class="btn" id="s-ant" ${p === 0 ? 'disabled' : ''}>Paso anterior</button>${p < 6 ? `<button class="btn prim" id="s-sig">Siguiente: ${PASOS[p + 1]}</button>` : `<a class="btn prim" href="#tablero">Ver todas las alertas en el tablero</a>`}</div>`;
  const filaI1 = `${a.doc_id} | 1 | ${a.cambio} | ${a.ubicacion} | ${a.especialidad} | ${a.elemento} | ${a.cita}`;
  const escenas = [
    () => `<span class="quien">Control documentario</span><h2>Llega la lámina E-204, revisión C</h2>
      <p class="explica">Se registra en el CDE el ${N.fmtFecha(d.fecha_recepcion)}. En ese momento empieza a correr el plazo para notificar, aunque nadie haya abierto todavía el plano. El cuadro de revisiones dice «${esc(d.texto.split('\n')[0].replace('CUADRO DE REVISIONES: ', ''))}», que suena a algo menor.</p>
      <div class="dos"><div class="doc"><div class="cab"><span>Revisión ${esc(d.revision_anterior)} (anterior)</span></div>${esc(d.texto_anterior)}</div><div class="doc"><div class="cab"><span>Revisión ${esc(d.revision)} (nueva)</span><span>${N.fmtFecha(d.fecha_recepcion)}</span></div>${esc(d.texto)}</div></div>
      <details class="tec"><summary>Detalle técnico</summary><p>La ingesta valida que exista la revisión anterior y la fecha de recepción. En el corpus, 2 de 50 documentos se rechazan aquí porque no tienen revisión anterior: sin ella no hay nada que comparar.</p></details>`,
    () => `<span class="quien">Modelo de lenguaje</span><h2>La IA compara las dos revisiones</h2>
      <p class="explica">Recibe la revisión anterior, la nueva y una instrucción con formato fijo. Debe describir cada cambio que afecte costo, plazo o alcance y copiar literalmente el fragmento que lo sustenta.</p>
      <div class="dos"><div class="doc"><div class="cab"><span>Lo que cambió, marcado con nube de revisión</span></div>${diffHTML(d.texto_anterior, d.texto)}</div>
      <div><div class="salida" id="s-salida" aria-live="polite"></div><dl class="campos" id="s-campos"></dl><div class="fila-btn" style="margin-top:10px"><button class="btn peq" id="s-repro">Ver la respuesta registrada</button>${sample ? '<button class="btn peq prim" id="s-vivo">Pedírselo a la IA en vivo</button>' : ''}</div></div></div>
      <details class="tec"><summary>Ver instrucción enviada a la IA</summary><pre>${esc(N.INSTRUCCIONES.I1['v1.1'].sistema)}</pre><p>Respuesta registrada en la medición:</p><pre>${esc(filaI1)}</pre></details>`,
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
      v.disabled = true; v.classList.add('cargando'); S.textContent = 'Pensando…';
      try {
        const txt = await preguntarIA(`${N.INSTRUCCIONES.I1['v1.1'].sistema}\n\n---\n\n${N.mensajeI1([d])}`, t => S.textContent = t);
        const r = N.parsearI1(txt, docPorId);
        S.insertAdjacentHTML('afterend', `<div class="aviso ${r.hechos.length ? 'ok' : 'mal'}" style="margin-top:8px">${r.hechos.length ? `${r.hechos.length} cambio(s) con cita verificada.` : 'La respuesta no pasó el validador.'} ${r.rechazadas.length ? `${r.rechazadas.length} fila(s) rechazada(s): ${esc(r.rechazadas[0].motivo)}` : ''}</div>`);
      } catch (e) { S.textContent = `No se pudo consultar a la IA: ${e.message || e.code}. La respuesta registrada sigue disponible.`; }
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
  const p = { ...PARAMS, tipo_dias: tipoSim }, lim = N.fechaLimite(a.fecha_recepcion, p, FERIADOS);
  return `<span class="quien">Fórmula de la app</span><h2>Se calcula la fecha límite</h2>
    <p class="explica">La IA leyó la cláusula 14.3 y administración contractual la validó una sola vez para todo el contrato. Desde entonces la fecha la calcula una fórmula, no el modelo.</p>
    <blockquote class="aviso info" style="margin:0 0 14px">«${esc(clausula143.texto_literal)}»</blockquote>
    <div class="fila-btn" role="group" aria-label="Tipo de días" style="margin-bottom:12px"><button class="btn peq ${tipoSim === 'calendario' ? 'prim' : ''}" data-tipo="calendario">7 días calendario (contrato R1)</button><button class="btn peq ${tipoSim === 'habiles' ? 'prim' : ''}" data-tipo="habiles">¿Y si fueran 7 días hábiles?</button></div>
    ${calendario(a.fecha_recepcion, lim, a.fecha_recepcion, FERIADOS, tipoSim === 'calendario')}
    <p style="margin-top:12px;font-size:1.05rem">Recibido el <b>${N.fmtFecha(a.fecha_recepcion)}</b> + ${p.plazo} días ${tipoSim === 'habiles' ? 'hábiles (sin fines de semana ni el feriado del 8 de octubre)' : 'calendario'} = vence el <b style="color:var(--nube)">${N.fmtFecha(lim)}</b>.</p>
    <details class="tec"><summary>Detalle técnico</summary><p>Funciones <code>fechaLimite</code>, <code>sumarDias</code> y <code>sumarHabiles</code> de nucleo.js. Si la cláusula dijera «desde el conocimiento», la app usa igual la fecha de recepción (regla conservadora).</p></details>`;
}
function wirePlazo(a) { document.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => { tipoSim = b.dataset.tipo; vSim(); }); }
function cartaDe(a) {
  const dec = est.decisiones[a.id];
  const al = { ...a, cambio: a.cambio.split(/(?<=\.)\s/)[0], partida: dec?.partida ?? a.partida, partida_desc: dec?.partida ? partidaPorCod[dec.partida]?.desc : a.partida_desc };
  const campos = N.camposCarta(al, PARAMS, a.doc);
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
function vTablero() {
  const visibles = alertas.filter(a => a.fecha_recepcion <= est.hoy);
  const cuenta = k => visibles.filter(a => estadoDe(a) === k).length;
  const porLlegar = alertas.length - visibles.length;
  const esps = [...new Set(alertas.map(a => a.especialidad))].sort();
  const filtros = { pendientes: a => estadoDe(a) !== 'decidido', vencidas: a => estadoDe(a) === 'vencido', urgentes: a => ['rojo', 'ambar'].includes(estadoDe(a)), decididas: a => estadoDe(a) === 'decidido', todas: () => true };
  let lista = visibles.filter(filtros[est.filtro]).filter(a => est.esp === 'todas' || a.especialidad === est.esp);
  lista.sort((x, y) => N.diasRestantes(x.limite, est.hoy) - N.diasRestantes(y.limite, est.hoy));
  const urg = visibles.filter(a => ['rojo', 'ambar'].includes(estadoDe(a))).length;
  const idx = N.difDias(est.hoy, PRIMERA), max = N.difDias(ULTIMA, PRIMERA);
  $('#v-tablero').innerHTML = `
    <div class="tab-cab"><div><h2>Tablero de alertas</h2><p style="color:var(--texto-2)">Proyecto R1 · edificio multifamiliar de 12 pisos y 2 sótanos · ${alertas.length} cambios detectados en ${docs.length} documentos. Lo que vence primero va arriba.</p></div></div>
    <div class="hoy"><label for="hoy-r">Hoy es</label><div><input type="range" id="hoy-r" min="0" max="${max}" value="${idx}" aria-valuetext="${N.fmtFecha(est.hoy)}"><div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--texto-2)"><span>${N.fmtFecha(PRIMERA)}</span><span>Mueve la fecha y mira cómo corren los plazos</span><span>${N.fmtFecha(ULTIMA)}</span></div></div><div class="fecha num" id="hoy-f">${N.fmtFecha(est.hoy)}</div></div>
    <div class="resumen" role="group" aria-label="Filtrar por estado">
      ${[['pendientes', 'Por decidir', visibles.length - cuenta('decidido'), 'p-gris'], ['urgentes', 'Vencen en 3 días o menos', urg, 'p-ambar'], ['vencidas', 'Vencidas sin decidir', cuenta('vencido'), 'p-vencido'], ['decididas', 'Decididas', cuenta('decidido'), 'p-decidido'], ['todas', 'Recibidas hasta hoy', visibles.length, 'p-gris']].map(([k, t, n, c]) => `<button class="chip" data-f="${k}" aria-pressed="${est.filtro === k}"><span class="punto ${c}"></span>${t} <b>${n}</b></button>`).join('')}
    </div>
    <div class="filtros"><label class="sr" for="f-esp">Especialidad</label><select id="f-esp"><option value="todas">Todas las especialidades</option>${esps.map(e => `<option ${est.esp === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>
      <span style="color:var(--texto-2);font-size:.88rem;align-self:center">${porLlegar ? `${porLlegar} cambios llegan después de esta fecha.` : ''} En cada fila: la barra azul es el plazo, el punto rojo el vencimiento, la línea punteada el día 4, cuando sin el sistema recién se entiende el cambio (casos consultados: 2 a 4 días) y la línea oscura, hoy.</span></div>
    <div class="lista">${lista.length ? lista.map(a => `<a class="alerta-fila" href="#alerta-${a.id.toLowerCase()}">
        ${diasBadge(a)}
        <div><div class="doc-id">${esc(a.doc_id)} <span>· ${esc(a.doc.titulo)}</span></div><div class="resumen-cambio">${esc(a.cambio)}</div></div>
        <div class="partida">${a.partida ? `<code>${esc(a.partida)}</code> ${esc(a.partida_desc)}` : '<b>Sin partida en el presupuesto</b>'}<span class="conf ${a.confianza}">Confianza ${a.confianza.toLowerCase()}</span></div>
        <div class="pista">${pista(a)}</div></a>`).join('') : `<div class="vacio">No hay alertas en este filtro para el ${N.fmtFecha(est.hoy)}. Mueve la fecha o elige «Todas».</div>`}</div>
    <section class="seccion"><h3>Registro de decisiones</h3><p style="color:var(--texto-2);font-size:.9rem;margin:4px 0 10px">Cada decisión queda anotada con quién la tomó. En esta demostración el registro se guarda en este navegador.</p>
    <div class="panel"><ul class="registro">${est.registro.slice(0, 10).map(r => `<li><time>${esc(r.t)}</time><span><b>${esc(r.quien)}:</b> ${esc(r.que)}</span></li>`).join('') || '<li><time>—</time><span>Todavía no hay decisiones. Abre una alerta y confírmala, corrígela o descártala.</span></li>'}</ul></div></section>`;
  const r = $('#hoy-r');
  r.oninput = () => { est.hoy = N.sumarDias(PRIMERA, Number(r.value)); vTablero(); pintarFecha(); $('#hoy-r').focus(); };
  document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { est.filtro = b.dataset.f; vTablero(); });
  $('#f-esp').onchange = e => { est.esp = e.target.value; vTablero(); };
}

// ---------- DETALLE ----------
function vAlerta(id) {
  const a = alertaPorId[id];
  if (!a) { $('#v-alerta').innerHTML = `<p class="vacio">No existe la alerta ${esc(id)}. <a href="#tablero">Volver al tablero</a></p>`; return; }
  const d = a.doc, dec = est.decisiones[a.id], e = estadoDe(a);
  const cuerpoNuevo = d.tipo === 'Lámina' ? conCita(d.texto, a.cita) : conCita(d.texto, a.cita);
  $('#v-alerta').innerHTML = `
    <a class="volver" href="#tablero">← Tablero de alertas</a>
    <div class="det-cab">${diasBadge(a)}<div><h2>${esc(a.doc_id)} rev. ${esc(d.revision)} · ${esc(a.elemento)}</h2><p class="frase">${esc(fraseDias(a))}</p></div></div>
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
          ${dec ? `<div class="aviso ok">Alerta ${esc(dec.estado)}${dec.partida && dec.partida !== a.partida ? `: partida ${esc(dec.partida)} (la IA propuso ${esc(a.partida)})` : ''}.</div><div class="acciones"><button class="btn" id="d-carta">Ver borrador de carta</button><button class="btn" id="d-deshacer">Deshacer</button></div>`
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
  const decidir = (estado, partida) => { est.decisiones[a.id] = { estado, partida: partida ?? a.partida }; registrar('Oficina técnica', `${a.doc_id} · alerta ${estado}${estado === 'corregida' ? ` a ${partida}` : ''}`); vAlerta(id); };
  document.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { if (b.dataset.d === 'corregida') { $('#d-corr').hidden = false; $('#d-sel').focus(); return; } decidir(b.dataset.d); });
  const ok = $('#d-corr-ok'); if (ok) ok.onclick = () => decidir('corregida', $('#d-sel').value);
  const des = $('#d-deshacer'); if (des) des.onclick = () => { delete est.decisiones[a.id]; registrar('Oficina técnica', `${a.doc_id} · decisión deshecha`); vAlerta(id); };
  const c = $('#d-carta'); if (c) c.onclick = () => { const { html, ver } = cartaDe(a); $('#d-carta-box').innerHTML = `<div class="carta" style="margin-top:12px">${html}</div><div class="check"><span class="ico ${ver.ok ? 'si' : 'no'}">${ver.ok ? '✓' : '✗'}</span><div>${ver.ok ? 'Todas las cifras y fechas vienen de los datos confirmados.' : `Cifras sin origen: ${esc(ver.fuera.join(', '))}`}</div></div>`; };
}

// ---------- RESULTADOS ----------
function vResultados() {
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
  $('#v-resultados').innerHTML = `
    <div class="tab-cab"><div><h2>Qué tan bien funciona</h2><p style="color:var(--texto-2);max-width:48em">Medido contra respuestas correctas escritas y congeladas antes de correr la IA. Dos conjuntos: el corpus con el que se construyó el prototipo y 10 documentos nuevos que el sistema no conocía.</p></div></div>
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
      <p style="color:var(--texto-2);font-size:.88rem;margin-top:8px">Además: 12 de 12 casos de prueba del plan superados y 3 de 3 accesos indebidos bloqueados por las reglas del servidor.</p></section>
    <section class="seccion"><h3>Lo que dijeron al probarlo</h3><div class="casos3" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="vidrio caso3"><span class="etq">Residente de obra · plazo de 5 días</span><p>«Me sirve que permita comparar documentos y reconocer cambios sin tener que revisar manualmente todas las páginas.»</p><p style="font-size:.86rem;color:var(--texto-2)">Pide: código, nombre de la partida y página donde se origina el cambio. La app ya muestra código y nombre; la página entra en la versión 2.</p></div>
      <div class="vidrio caso3"><span class="etq">Oficina técnica · plazo de 7 días</span><p>«Agregaría una alerta que indique qué cambios pueden afectar costos, metrados o partidas y cuánto plazo queda para notificarlos.»</p><p style="font-size:.86rem;color:var(--texto-2)">Es la función central del asistente: cada alerta trae la partida y los días que quedan.</p></div></div>
      <p style="font-size:.84rem;color:var(--texto-3);margin-top:8px">Consulta por WhatsApp a 2 integrantes del equipo con experiencia en obra, 16/11/2026. Ambos reportaron adicionales que se complicaron por plazo o por detectar tarde el cambio.</p></section>
    <section class="seccion"><h3>Lo que todavía no medimos</h3><div class="panel lectura" style="margin-top:10px"><ul>
      <li>La línea base del proceso actual viene de 2 casos del equipo (2 a 4 días para entender el cambio, con plazos de 5 y 7): sirve para dimensionar, no es una estadística.</li>
      <li>La probaron 2 profesionales del equipo; falta un usuario externo y cronometrar la revisión de una alerta.</li>
      <li>Los documentos de prueba son sintéticos y en texto limpio: faltan planos DWG, PDF escaneados y ruido real.</li>
      <li>Las respuestas correctas se escribieron con apoyo de IA y sin un revisor humano independiente.</li></ul></div></section>`;
}

// ---------- ASISTENTE ----------
const GUIA = `Eres el asistente del MVP Reloj Contractual (Grupo 4, Diplomado IA en Ingeniería y Construcción, AECODE). Responde en español, breve (máximo 120 palabras), concreto y sin jerga innecesaria. Si algo no está en este contexto, dilo.
Qué es: app que lee cada revisión de documento (lámina, RFI, carta) que llega al CDE de una obra privada, describe con IA qué cambió citando el texto literal, propone la partida del presupuesto afectada y calcula con una fórmula la fecha límite para notificar el adicional según la cláusula del contrato. Una persona confirma, corrige o descarta. Principio: el modelo lee y propone; la fórmula cuenta; la persona decide.
Problema: el plazo para notificar (7 días calendario desde la recepción en la cláusula 14.3 del proyecto R1) vence antes de que oficina técnica entienda el cambio (2 a 4 días según 2 casos del equipo, con plazos de 5 y 7 días: en un caso quedó 1 día para preparar el sustento).
Secciones (barra lateral): Panorama (alertas que vencen primero, alerta del día, dial del plazo); Cómo funciona (simulación de 7 pasos con la lámina E-204); Alertas (lista ordenada por días restantes; el chip «Hoy» de la barra superior mueve la fecha simulada; filas con barra de plazo, punto rojo de vencimiento, línea punteada del día 4, cuando sin sistema recién se entiende el cambio y línea de hoy); detalle de alerta (cambio marcado con nube de revisión, cita verificada, partida con 4 criterios R-V: elemento, especialidad, ubicación, rango o unidad; confianza Alta 4/4, Media 3, Baja ≤2; botones Confirmar, Corregir partida, Descartar; borrador de carta); Prueba con tu documento (pegar dos versiones; IA en vivo, respuesta registrada o modo manual); Resultados.
Controles: la cita debe aparecer literal en el documento o la fila se rechaza; la confianza la recalcula la app; el modelo no calcula fechas; toda cifra de la carta debe venir de datos confirmados.
Validación con usuarios: 2 integrantes con experiencia en obra la probaron; les sirvió comparar versiones sin revisar todas las páginas y pidieron mostrar la página de origen del cambio. Resultados: corpus base de 50 documentos sintéticos: 41/41 cambios, precisión 100 % (v1.1, afinada con ese corpus). 10 documentos nuevos: 7/8 y 8/8 en dos corridas. Sin IA (comparador de texto): 33/41 con 22 falsas alarmas, sin cartas ni RFI. Limitaciones: datos sintéticos, línea base estimada, sin usuarios externos, sin integración con el CDE, sin DWG ni PDF escaneado.`;
const FAQ = [
  [/qu[eé] es|para qu[eé]|sirve/i, 'Reloj Contractual te avisa, el mismo día en que llega un documento al CDE, qué cambió, a qué partida afecta y cuántos días te quedan para notificar el adicional. La IA lee y propone; la fecha la calcula una fórmula; tú decides.'],
  [/empez|c[oó]mo (lo )?uso|primero/i, 'Empieza por «Cómo funciona»: son 7 pasos con un caso real (la placa P-7). Luego abre el «Tablero de alertas», mueve la fecha de «Hoy es» y abre la alerta que vence primero.'],
  [/hoy|fecha|desliz|mover/i, 'El control «Hoy es» simula el paso de los días. Al moverlo verás cómo cada alerta pasa de verde a ámbar y a vencida. Así se ve por qué el plazo vence antes de entender el cambio.'],
  [/confianza|criterio|r-?v|partida/i, 'La partida la propone la IA, pero la confianza la calcula la app con 4 criterios: mismo elemento, misma especialidad, ubicación compatible y rango o unidad. 4 de 4 es Alta, 3 Media y 2 o menos Baja.'],
  [/cita|invent|alucin/i, 'Cada alerta trae un fragmento copiado literalmente del documento. La app lo busca en el texto: si no aparece, la alerta se rechaza. En el paso 3 de «Cómo funciona» puedes probarlo con una cita inventada.'],
  [/plazo|d[ií]as|vence|cl[aá]usula/i, 'La cláusula 14.3 del proyecto da 7 días calendario desde la recepción. Administración contractual la valida una vez; luego la fecha límite sale de una fórmula, con feriados si son días hábiles. El modelo nunca calcula fechas.'],
  [/resultado|funciona bien|precisi|cobertura/i, 'En el corpus base detectó 41 de 41 cambios. Con 10 documentos nuevos, 7 y 8 de 8 en dos corridas. Un comparador de texto sin IA encontró 33 de 41 con 22 falsas alarmas y no lee cartas ni RFI.'],
  [/detecta|bluebeam|procore|comparador|por qu[eé] ia/i, 'Primero un comparador sin IA marca cada zona y línea que cambió, incluido el rótulo. Luego la IA indica cuáles tienen impacto y propone la partida; la app verifica cada cita contra el texto y la confianza con 4 criterios.'],
  [/l[ií]mit|no (hace|mide)|falta/i, 'Limitaciones: documentos sintéticos en texto, sin DWG ni PDF escaneados; la línea base viene de solo 2 casos; falta un usuario externo; no se integra con el CDE.'],
];
const SUG = { inicio: ['¿Qué hace este asistente?', '¿Por dónde empiezo?'], simulacion: ['¿Cómo evita que la IA invente?', '¿Cómo se calcula el plazo?'], tablero: ['¿Qué hace el control «Hoy es»?', '¿Qué significan las barras?'], alerta: ['¿Por qué esta partida?', '¿Qué pasa si corrijo?'], comparar: ['¿Cómo detecta los cambios?', '¿Por qué no basta un comparador?'], resultados: ['¿Qué tan bien funciona?', '¿Qué limitaciones tiene?'] };
const chat = [];
function pintarChat() {
  $('#asist-msgs').innerHTML = (chat.length ? '' : '<div class="msg ia">Hola. Puedo explicarte cualquier pantalla o decisión de la app. Elige una pregunta o escribe la tuya.</div>') + chat.map(m => `<div class="msg ${m.role === 'user' ? 'yo' : 'ia'}">${esc(m.content)}</div>`).join('');
  $('#asist-msgs').scrollTop = 1e6;
  $('#asist-sug').innerHTML = (SUG[ruta().vista] || SUG.inicio).map(s => `<button type="button">${esc(s)}</button>`).join('');
  $('#asist-sug').querySelectorAll('button').forEach(b => b.onclick = () => enviar(b.textContent));
}
function contextoPantalla() {
  const r = ruta();
  if (r.vista === 'alerta' && alertaPorId[r.id]) { const a = alertaPorId[r.id]; return `El usuario mira la alerta ${a.id} del documento ${a.doc_id}: cambio «${a.cambio}»; cita «${a.cita}»; partida ${a.partida} ${a.partida_desc}; confianza ${a.confianza}; criterios ${JSON.stringify(a.criterios)}; sustento: ${a.sustento}; ${fraseDias(a)}`; }
  if (r.vista === 'simulacion') return `El usuario está en el paso ${est.simPaso + 1} de la simulación: ${PASOS[est.simPaso]}.`;
  if (r.vista === 'tablero') return `El usuario está en el tablero con la fecha simulada ${N.fmtFecha(est.hoy)}.`;
  return `El usuario está en la sección ${r.vista}.`;
}
async function enviar(texto) {
  if (!texto.trim()) return;
  chat.push({ role: 'user', content: texto }); pintarChat();
  const m = { role: 'assistant', content: '…' }; chat.push(m); pintarChat();
  if (sample) {
    try {
      const hist = chat.slice(0, -1).slice(-8).map(x => ({ role: x.role, content: x.content }));
      hist[0] = { role: 'user', content: `${GUIA}\n\nContexto de pantalla: ${contextoPantalla()}\n\nPregunta: ${hist[0].content}` };
      if (hist.length > 1) hist[hist.length - 1] = { role: 'user', content: `${hist[hist.length - 1].content}\n\n(Contexto de pantalla: ${contextoPantalla()})` };
      await sample(hist, { modelTier: 'quick', cache: false, onText: ({ text }) => { m.content = text; pintarChat(); } });
      return;
    } catch (e) { if (e?.code !== 'rate_limited') sample = sample; }
  }
  const f = FAQ.find(([re]) => re.test(texto));
  m.content = f ? f[1] : 'Con las respuestas preparadas no tengo esa. Prueba con «¿Por dónde empiezo?», «¿Cómo evita que la IA invente?» o «¿Qué limitaciones tiene?». ';
  if (ruta().vista === 'alerta' && /partida|por qu/i.test(texto) && alertaPorId[ruta().id]) m.content = `Partida ${alertaPorId[ruta().id].partida || 'ninguna'}: ${alertaPorId[ruta().id].sustento}`;
  if (/corrij/i.test(texto)) m.content = 'Si corriges, la alerta guarda tu partida y también la que propuso la IA. Así se puede medir cuántas veces se equivoca el modelo sin perder el dato original.';
  if (/manual/i.test(texto)) m.content = 'El modo manual sirve sin IA en vivo: copias la instrucción, la pegas en el asistente de IA que uses y pegas aquí su respuesta. La app aplica el mismo validador de citas.';
  if (/barra/i.test(texto)) m.content = 'En cada fila: la barra azul es el plazo desde la recepción, el punto rojo el vencimiento, la línea punteada el día 4, cuando sin el sistema recién se entiende el cambio (casos consultados: 2 a 4 días) y la línea oscura la fecha de hoy.';
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
$('#tema').onclick = () => { aplicarTema(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); if (ruta().vista === 'inicio') dibujarDial(); };
// ---------- fecha simulada global ----------
function pintarFecha() {
  $('#chip-fecha-t').textContent = `Hoy · ${fCorta(est.hoy)}`;
  const r = $('#pop-r'); r.min = 0; r.max = N.difDias(ULTIMA, PRIMERA); r.value = N.difDias(est.hoy, PRIMERA); r.setAttribute('aria-valuetext', N.fmtFecha(est.hoy));
  const urg = alertas.filter(a => a.fecha_recepcion <= est.hoy && ['rojo', 'ambar', 'vencido'].includes(estadoDe(a))).length;
  $('#campana').querySelector('.badge')?.remove(); if (urg) $('#campana').insertAdjacentHTML('beforeend', `<span class="badge">${urg}</span>`);
}
$('#chip-fecha').onclick = () => { const p = $('#pop-fecha'); p.hidden = !p.hidden; $('#chip-fecha').setAttribute('aria-expanded', String(!p.hidden)); };
$('#pop-r').oninput = e => { est.hoy = N.sumarDias(PRIMERA, Number(e.target.value)); const v = ruta().vista; if (v === 'inicio') { vInicio(); } else if (v === 'tablero') vTablero(); pintarFecha(); };
document.addEventListener('click', e => { if (!e.target.closest('#pop-fecha, #chip-fecha')) { $('#pop-fecha').hidden = true; $('#chip-fecha').setAttribute('aria-expanded', 'false'); } });
(async () => {
  try { sample = window.claude?.use ? await window.claude.use('sample') : null; } catch { sample = null; }
  $('#estado-ia').innerHTML = sample ? '<i></i>IA en vivo' : '<i></i>IA: respuestas registradas'; $('#estado-ia').classList.toggle('vivo', !!sample);
  $('#asist-modo').textContent = sample ? 'Responde Claude con el contexto de esta pantalla' : 'Respuestas preparadas';
  render();
})();
render();
