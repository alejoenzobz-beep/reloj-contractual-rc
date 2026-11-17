// Evidencia: cronómetro de decisiones (M4), opiniones (M5) y vista por capas (M6).
// Todo se guarda en este navegador; nada bloquea el flujo principal. Sin nombres ni datos personales.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const leer = k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
export const mediana = xs => { const v = xs.filter(x => Number.isFinite(x)).sort((a, b) => a - b); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const num = x => x == null ? '—' : String(Math.round(x * 10) / 10).replace('.', ',');
const durTxt = s => s == null ? '—' : s < 90 ? `${Math.round(s)} s` : `${num(s / 60)} min`;

// ---------- M4: cronómetro (desde que se abre el detalle hasta la decisión) ----------
const abiertos = {};
export function abrirDetalle(id) { abiertos[id] = Date.now(); }
export function registrarDecision({ id, doc, rol, estado, partida_propuesta, partida_final, demo }) {
  const t0 = abiertos[id]; delete abiertos[id];
  if (!t0) return null;
  const reg = { fecha: new Date().toISOString(), id, documento: doc, rol, decision: estado, segundos: Math.round((Date.now() - t0) / 1000), partida_propuesta: partida_propuesta || '', partida_final: partida_final || '', partida_aceptada: estado === 'confirmada' ? 'sí' : estado === 'corregida' ? 'no' : 'no aplica', datos: demo ? 'demostración' : 'propios' };
  const t = leer('rc-tiempos'); t.push(reg); escribir('rc-tiempos', t); return reg;
}
export const tiempos = () => leer('rc-tiempos');

// ---------- M5: «Dar mi opinión» ----------
const PREGUNTAS = [['claro', '¿Fue claro qué cambió?'], ['confia', '¿Confiarías en la partida propuesta?'], ['usaria', '¿Usarías esto en tu obra?']];
export const opiniones = () => leer('rc-opiniones');
const yaOpino = ctx => opiniones().some(o => o.contexto === ctx) || leer('rc-opinion-omitida').includes(ctx);
// Tarjeta no bloqueante: se puede ignorar o cerrar; se ofrece una sola vez por contexto.
export function ofrecerOpinion(destino, contexto, rol) {
  if (!destino || yaOpino(contexto)) return;
  destino.innerHTML = `<form class="opinion panel" aria-label="Dar mi opinión" onsubmit="return false">
    <div class="plazo-cab"><h3>Dar mi opinión <small class="pista-txt">· 3 preguntas, opcional</small></h3><button type="button" class="btn peq" data-op="cerrar">Ahora no</button></div>
    ${PREGUNTAS.map(([k, t]) => `<fieldset class="op-p"><legend>${t}</legend><div class="op-escala">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="op-${k}" value="${n}"><span>${n}</span></label>`).join('')}</div><small class="pista-txt">1 = nada · 5 = totalmente</small></fieldset>`).join('')}
    <label class="tit" for="op-com">Comentario (opcional)</label><textarea id="op-com" maxlength="500" placeholder="Sin nombres ni datos personales"></textarea>
    <div class="fila-btn" style="margin-top:8px"><button class="btn prim peq" data-op="enviar">Guardar mi opinión</button><span class="pista-txt">Se guarda en este navegador, sin datos personales, y se exporta en Calidad → Evidencia.</span></div><div class="op-msg" aria-live="polite"></div></form>`;
  const f = destino.querySelector('form');
  f.querySelector('[data-op="cerrar"]').onclick = () => { const o = leer('rc-opinion-omitida'); o.push(contexto); escribir('rc-opinion-omitida', o); destino.innerHTML = ''; };
  f.querySelector('[data-op="enviar"]').onclick = () => {
    const v = Object.fromEntries(PREGUNTAS.map(([k]) => [k, Number(f.querySelector(`[name="op-${k}"]:checked`)?.value) || null]));
    if (!Object.values(v).some(Boolean)) { f.querySelector('.op-msg').innerHTML = '<p class="aviso mal" style="margin-top:8px">Marca al menos una respuesta, o pulsa «Ahora no».</p>'; return; }
    const o = opiniones(); o.push({ fecha: new Date().toISOString(), contexto, rol, ...v, comentario: f.querySelector('#op-com').value.trim().slice(0, 500) }); escribir('rc-opiniones', o);
    destino.innerHTML = '<p class="aviso ok">Gracias. Tu opinión quedó guardada en este navegador.</p>';
  };
}

// ---------- exportación CSV ----------
export function csv(filas, nombre) {
  if (!filas.length) return false;
  const cols = Object.keys(filas.reduce((a, f) => Object.assign(a, f), {}));
  const c = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const txt = '﻿' + [cols.join(';'), ...filas.map(f => cols.map(k => c(f[k])).join(';'))].join('\r\n');
  const u = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
  a.href = u; a.download = nombre; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); return true;
}

// ---------- M6: vista Evidencia ----------
const sinMedir = (como) => `<div class="sin-medir"><b>Sin medir todavía.</b> <span>Cómo se mide: ${como}</span></div>`;
const etiquetaOrigen = o => o === 'real' ? '<span class="etq verde">datos reales</span>' : o === 'ejemplo' ? '<span class="etq ambar">muestra de ejemplo</span>' : `<span class="etq">${esc(o || 'origen no indicado')}</span>`;
const fFecha = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
const capa = (n, t, meta, cuerpo) => `<article class="capa"><header><span class="capa-n">${n}</span><div><h4>${t}</h4>${meta ? `<p class="capa-meta">${meta}</p>` : ''}</div></header>${cuerpo}</article>`;

export function vistaEvidencia({ cifras, consulta }) {
  // Capa 1: línea base, casos observados.
  let c1;
  if (consulta?.respuestas?.length) {
    const R = consulta.respuestas, r = consulta.resumen || {};
    const cuenta = k => R.reduce((m, x) => (m[x[k]] = (m[x[k]] || 0) + 1, m), {});
    const comp = cuenta('se_complico'), tipos = cuenta('tipo_dias');
    const mitad = R.filter(x => 2 * x.entender_dias >= x.plazo_dias).length;
    c1 = capa(1, 'Línea base: cuánto tarda hoy entender un cambio', `${etiquetaOrigen(consulta.origen)} n = ${R.length} · ${esc(consulta.fuente)} · ${fFecha(consulta.fecha)}`,
      `<div class="capa-cifras"><div><b>${num(mediana(R.map(x => x.entender_dias)))}</b><span>días, mediana para entender el cambio (rango ${Math.min(...R.map(x => x.entender_dias))} a ${Math.max(...R.map(x => x.entender_dias))})</span></div>
        <div><b>${num(mediana(R.map(x => x.plazo_dias)))}</b><span>días, mediana del plazo contractual para notificar</span></div>
        <div><b>${num(mediana(R.map(x => x.plazo_dias - x.entender_dias)))}</b><span>días, mediana de lo que queda para sustentar</span></div>
        <div><b>${mitad} de ${R.length}</b><span>gastaron la mitad del plazo o más solo en entender el cambio</span></div></div>
      <p>¿Se complicó o se perdió un adicional por el plazo? ${Object.entries(comp).map(([k, v]) => `<b>${esc(k)}</b>: ${v}`).join(' · ')}. Tipo de plazo: ${Object.entries(tipos).map(([k, v]) => `${v} en días ${k === 'habiles' ? 'hábiles' : 'calendario'}`).join(', ')}.</p>
      ${r.nota ? `<p class="pista-txt">${esc(r.nota)}</p>` : ''}
      <details class="tec"><summary>Ver las ${R.length} respuestas (anonimizadas)</summary><div class="scroll-x"><table class="t"><thead><tr><th>Id</th><th>Cargo</th><th>Obra</th><th>Plazo</th><th>Entender</th><th>Margen</th><th>¿Se complicó?</th></tr></thead><tbody>${R.map(x => `<tr><td>${esc(x.id)}</td><td>${esc(x.cargo)}</td><td>${esc(x.obra)}</td><td>${x.plazo_dias} ${x.tipo_dias === 'habiles' ? 'háb.' : 'cal.'}</td><td>${x.entender_dias}</td><td>${x.plazo_dias - x.entender_dias}</td><td>${esc(x.se_complico)}</td></tr>`).join('')}</tbody></table></div></details>
      <p class="pista-txt">Las barras de plazo usan este rango como referencia «sin asistente».</p>`);
  } else c1 = capa(1, 'Línea base: cuánto tarda hoy entender un cambio', '', sinMedir('preguntar a profesionales de obra y oficina técnica cuántos días tenían para notificar y cuántos tardaron en entender el cambio; se reportan conteos y medianas, sin porcentajes.'));

  // Capa 2: comparador con documentos reales de revisión.
  const cr = cifras?.comparador_real;
  const c2 = capa(2, 'Comparador con láminas reales de revisión', cr ? `${etiquetaOrigen(cr.origen || 'real')} n = ${cr.pares} pares · ${esc(cr.fuente || '')} · ${fFecha(cr.fecha)}` : '',
    cr ? `<div class="capa-cifras"><div><b>${cr.detectados} de ${cr.cambios_conocidos}</b><span>cambios conocidos (según el cuadro de revisiones) detectados</span></div><div><b>${cr.zonas_falsas ?? '—'}</b><span>zonas marcadas sin cambio real</span></div></div>`
      : sinMedir('elegir 3 a 5 pares de láminas reales en revisión A y B, anotar los cambios que declara el cuadro de revisiones y compararlos con las zonas que marca la app (detectados y zonas falsas). El comparador corre en el navegador y no sube archivos.'));

  // Capa 3: prueba ciega y corpus sintético.
  const b = cifras?.corpus_base, pn = cifras?.prueba_nueva;
  const c3 = capa(3, 'Prueba ciega y corpus de demostración', b ? `<span class="etq ambar">datos sintéticos</span> Medición del equipo contra respuestas correctas escritas antes de correr la IA · ${fFecha(cifras.generado)}` : '',
    b ? `<div class="capa-cifras"><div><b>${b.v1_1.detectados} de ${b.v1_1.cambios_referencia}</b><span>cambios detectados en el corpus base (n = ${b.documentos} documentos), ${b.v1_1.falsos_positivos} alertas sin cambio real</span></div>
      ${pn ? `<div><b>${pn.corrida_1.detectados} y ${pn.corrida_2.detectados} de ${pn.cambios_referencia}</b><span>cambios en ${pn.documentos} documentos nuevos (prueba ciega), en dos mediciones</span></div>` : ''}
      ${cifras.linea_base_sin_ia ? `<div><b>${cifras.linea_base_sin_ia.corpus_base.detectados} de ${cifras.linea_base_sin_ia.corpus_base.cambios}</b><span>con un comparador de texto sin IA, con ${cifras.linea_base_sin_ia.corpus_base.falsas_alarmas} falsas alarmas</span></div>` : ''}</div>
      <p class="pista-txt">Medido con un modelo de Claude e instrucciones fijas. El corpus lo armó el equipo y la instrucción vigente se afinó con él; por eso pesa más la prueba ciega.</p>` : sinMedir('correr las instrucciones sobre un corpus con respuestas correctas escritas antes de la IA.'));

  // Capa 4: pruebas con usuarios (consolidado en cifras.json) + registros de este navegador.
  const pu = cifras?.pruebas_usuarios, T = tiempos(), O = opiniones();
  const local = `<div class="capa-local"><b>Registros de este navegador</b> <span class="etq">no consolidados</span><p>${T.length ? `${T.length} ${T.length === 1 ? 'decisión cronometrada' : 'decisiones cronometradas'}: mediana ${durTxt(mediana(T.map(t => t.segundos)))} desde abrir el detalle hasta decidir; partida propuesta aceptada en ${T.filter(t => t.partida_aceptada === 'sí').length} de ${T.filter(t => t.partida_aceptada !== 'no aplica').length}.` : 'Todavía no hay decisiones cronometradas en este navegador.'} ${O.length ? `${O.length} ${O.length === 1 ? 'opinión' : 'opiniones'}: medianas (1 a 5) claridad ${num(mediana(O.map(o => o.claro)))}, confianza en la partida ${num(mediana(O.map(o => o.confia)))}, la usaría ${num(mediana(O.map(o => o.usaria)))}.` : 'Sin opiniones guardadas.'}</p>
    <div class="fila-btn"><button class="btn peq" id="ev-csv-t" ${T.length ? '' : 'disabled'}>Exportar tiempos (CSV)</button><button class="btn peq" id="ev-csv-o" ${O.length ? '' : 'disabled'}>Exportar opiniones (CSV)</button></div></div>`;
  const c4 = capa(4, 'Pruebas con usuarios: tiempos y opinión', pu ? `${etiquetaOrigen(pu.origen || 'real')} n = ${pu.personas} personas, ${pu.decisiones} decisiones · ${esc(pu.fuente || '')} · ${fFecha(pu.fecha)}` : '',
    (pu ? `<div class="capa-cifras"><div><b>${esc(pu.mediana_min ?? '—')} min</b><span>mediana de revisión por alerta</span></div>${pu.opinion ? `<div><b>${esc(pu.opinion)}</b><span>opinión (medianas 1 a 5)</span></div>` : ''}</div>`
      : sinMedir('cada persona entra con su rol, revisa la lámina E-301 y dos cambios del proyecto y decide; la app cronometra cada decisión y ofrece 3 preguntas de opinión. Luego se exportan los CSV y se consolidan en cifras.json.')) + local);

  const noAfirmamos = `<div class="no-afirmamos"><h4>Qué se afirma y qué no</h4><table class="t"><thead><tr><th>Se afirma</th><th>No se afirma</th></tr></thead><tbody>
    <tr><td>Entender un cambio tomó entre los días indicados en los casos observados (con su n).</td><td>Que ese rango sea el del sector.</td></tr>
    <tr><td>El comparador detectó los cambios conocidos que se indiquen en los pares de láminas medidos.</td><td>Una precisión general del comparador.</td></tr>
    <tr><td>Con la app, la revisión de una alerta tomó la mediana medida (con n personas y decisiones).</td><td>Que ahorre una cantidad de días en obra.</td></tr>
    <tr><td>Con la prueba ciega congelada (n = 8 cambios), Claude en desarrollo y la IA registrada en vivo dieron resultados comparables, con instrucciones fijas.</td><td>Que un modelo sea mejor que otro: es una sola corrida en vivo con n pequeño.</td></tr></tbody></table></div>`;
  return `<section class="seccion" id="evidencia"><h3>Evidencia, por capas</h3><p class="pista-txt" style="margin:4px 0 12px">Cada capa dice de dónde sale, con qué n y en qué fecha. Lo que no se ha medido figura como «sin medir todavía». Sin porcentajes con n pequeño.</p>
    <div class="capas">${c1}${c2}${c3}${c4}</div>${noAfirmamos}</section>`;
}
export function conectarEvidencia() {
  const t = document.querySelector('#ev-csv-t'), o = document.querySelector('#ev-csv-o');
  if (t) t.onclick = () => csv(tiempos(), 'reloj-contractual_tiempos-de-decision.csv');
  if (o) o.onclick = () => csv(opiniones(), 'reloj-contractual_opiniones.csv');
}
