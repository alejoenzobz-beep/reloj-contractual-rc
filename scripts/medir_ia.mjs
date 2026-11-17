// npm run medir-ia [-- --url https://… --datos data/prueba_ciega]
// Corre la prueba ciega congelada con la IA en vivo, a través de la función publicada (misma instrucción, misma
// referencia y mismo cálculo que la medición de desarrollo: evaluar() de nucleo.js) y agrega una fila a
// public/data/cifras.json → precision_por_modelo. No guarda claves: llama a la función, que tiene la suya.
import fs from 'node:fs';
import path from 'node:path';
import * as N from '../public/js/nucleo.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const URL_FN = arg('url', 'https://reloj-contractual-rc.netlify.app/.netlify/functions/ia');
const DIR = arg('datos', 'data/prueba_ciega');
const primero = (...n) => n.map(x => path.join(DIR, x)).find(f => fs.existsSync(f)) || path.join(DIR, n[0]);
const docsF = primero('documentos_nuevos.json', 'documentos.json'), refF = primero('referencia_nueva.json', 'referencia.json');
if (!fs.existsSync(docsF) || !fs.existsSync(refF)) {
  console.error(`Faltan ${docsF} y/o ${refF} (o documentos_nuevos.json y referencia_nueva.json).\nCopia ahí los 10 documentos nuevos de la prueba ciega (mismo formato que public/data/documentos.json)\ny su referencia congelada (mismo formato que public/data/referencia_corpus.json) y vuelve a correr «npm run medir-ia».`);
  process.exit(2);
}
// Huella: si existe CONGELADO.txt (líneas «sha256  archivo»), cada archivo debe coincidir o no se mide.
const congF = path.join(DIR, 'CONGELADO.txt');
if (fs.existsSync(congF)) {
  const { createHash } = await import('node:crypto');
  const lineas = [...fs.readFileSync(congF, 'utf8').matchAll(/([0-9a-fA-F]{64})\s+\*?([^\s]+)/g)];
  if (!lineas.length) { console.error('CONGELADO.txt no tiene líneas «sha256  archivo».'); process.exit(3); }
  for (const [, h, f] of lineas) {
    const ruta = path.join(DIR, path.basename(f));
    const real = fs.existsSync(ruta) ? createHash('sha256').update(fs.readFileSync(ruta)).digest('hex') : 'archivo ausente';
    console.log(`${path.basename(f)}: ${real === h.toLowerCase() ? 'huella correcta' : `NO COINCIDE (esperada ${h.slice(0, 12)}…, real ${real.slice(0, 12)}…)`}`);
    if (real !== h.toLowerCase()) { console.error('La prueba ciega no coincide con la versión congelada: no se mide.'); process.exit(3); }
  }
} else console.log('Aviso: no hay CONGELADO.txt; se mide sin verificar la huella.');
const docs = JSON.parse(fs.readFileSync(docsF, 'utf8')), referencia = JSON.parse(fs.readFileSync(refF, 'utf8'));
const proyecto = JSON.parse(fs.readFileSync('public/data/proyecto.json', 'utf8'));
const porId = Object.fromEntries(docs.map(d => [d.doc_id, d])), partidas = Object.fromEntries(proyecto.partidas.map(p => [p.codigo, p]));
// Reintenta hasta 2 veces ante fallas de transporte (429/503/504), con pausa; no cambia instrucciones ni respuestas.
const post = async (cuerpo, intento = 0) => {
  const t0 = Date.now(); const r = await fetch(URL_FN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(30000) });
  const d = await r.json().catch(() => ({}));
  if ([429, 502, 503, 504].includes(r.status) && intento < 2) { reintentos++; await new Promise(x => setTimeout(x, 4000 * (intento + 1))); return post(cuerpo, intento + 1); }
  if (!r.ok) throw new Error(`${r.status} ${d.mensaje || d.errorMessage || ''}`); return { ...d, ms: Date.now() - t0 };
};
let reintentos = 0;

const alertas = [], tiempos = [], errores = []; let modelo = null, n = 0;
for (const d of docs) {
  if (N.validarIngesta(d).length) continue; // los rechazos de ingesta se evalúan aparte, igual que en desarrollo
  try {
    const r1 = await post({ paso: 'I1', doc: d }); tiempos.push(r1.ms); modelo = r1.modelo;
    const hechos = N.parsearI1(r1.texto, porId).hechos.map(h => ({ ...h, id: `H${++n}` }));
    let vinc = {};
    if (hechos.length) { const r2 = await post({ paso: 'I2', hechos: hechos.map(({ id, cambio, ubicacion, especialidad, elemento }) => ({ id, cambio, ubicacion, especialidad, elemento })), partidas: proyecto.partidas }); tiempos.push(r2.ms); vinc = N.parsearI2(r2.texto, partidas, new Set(hechos.map(h => h.id))).vinculos; }
    for (const h of hechos) { const v = vinc[h.id] || {}; alertas.push({ ...h, partida: v.partida ?? null, partida_modelo: v.partida ?? null, confianza: v.confianza }); }
    console.log(`${d.doc_id}: ${hechos.length} cambio(s) · ${r1.ms} ms`);
  } catch (e) { errores.push(`${d.doc_id}: ${e.message}`); console.log(`${d.doc_id}: ERROR ${e.message}`); }
}
const m = N.evaluar({ alertas, referencia, documentos: docs });
const fila = { modelo: modelo || 'desconocido', via: 'función publicada (IA registrada)', fecha: new Date().toISOString().slice(0, 10), documentos: docs.length,
  cambios_referencia: m.total_referencia, detectados: m.verdaderos_positivos, falsas_alarmas: m.falsos_positivos,
  partida_correcta: Math.round(m.vinculacion * m.verdaderos_positivos), alertas: alertas.length, docs_sin_cambio_ok: `${m.verdaderos_negativos_docs} de ${m.docs_sin_cambio}`, rechazos_ingesta_ok: m.rechazos_ingesta_ok.replace('/', ' de '), latencia_mediana_ms: N.mediana(tiempos), reintentos, errores: errores.length };
console.log(fila);
for (const f of (m.filas || m.detalle || [])) console.log(`  ${f.ref_id}: ${f.detectado ? 'detectado' : 'NO detectado'} · partida esperada ${f.partida_esperada ?? 'sin partida'} · propuesta ${f.partida_propuesta === undefined ? '—' : f.partida_propuesta ?? 'sin partida'}${f.detectado ? (f.partida_ok ? ' (correcta)' : ' (INCORRECTA)') : ''}`);
for (const f of (m.falsos || [])) console.log(`  falsa alarma ${f.doc_id}: ${f.cambio}`);
if (errores.length) console.log('Errores:', errores);
if (errores.length) { console.error(`Hubo ${errores.length} error(es): no se guarda la fila. Revisa la conexión (en Node detrás de un proxy: NODE_USE_ENV_PROXY=1) y vuelve a correr.`); process.exit(4); }
const cF = 'public/data/cifras.json', c = JSON.parse(fs.readFileSync(cF, 'utf8'));
c.precision_por_modelo = [...(c.precision_por_modelo || []).filter(x => !(x.modelo === fila.modelo && x.fecha === fila.fecha)), fila];
fs.writeFileSync(cF, JSON.stringify(c, null, 1));
console.log(`Fila agregada a ${cF} → precision_por_modelo.`);
