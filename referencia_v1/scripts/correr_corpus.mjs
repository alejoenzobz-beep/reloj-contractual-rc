// Corrida reproducible del corpus con las instrucciones versionadas (F3 · Plan del Hito 2).
// Usa Claude en modo no interactivo (claude -p) desde una carpeta vacía y sin herramientas:
// el modelo solo ve la instrucción y los documentos; no tiene acceso al conjunto de referencia.
//
// Uso: node scripts/correr_corpus.mjs --i1 v1.0 [--solo E-215,E-240,...] [--sin-i2] [--sin-i3] --salida corrida_v1.0.json
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as N from '../public/js/nucleo.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const datos = join(raiz, 'public', 'data');
const arg = (k, def) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : def; };
const flag = k => process.argv.includes(k);

const vI1 = arg('--i1', 'v1.0');
const solo = arg('--solo', '') ? arg('--solo').split(',') : null;
const salida = arg('--salida', `corrida_${vI1}.json`);
const MODELO = arg('--modelo', 'opus');
const LOTE = 10;

const proyecto = JSON.parse(readFileSync(join(datos, 'proyecto.json'), 'utf8'));
const documentos = JSON.parse(readFileSync(join(datos, 'documentos.json'), 'utf8'));
const aislada = mkdtempSync(join(tmpdir(), 'reloj-iso-'));

function llamar(sistema, mensaje, etiqueta) {
  // Igual que el modo manual de la app: la instrucción versionada va al inicio del mensaje.
  const entrada = `${sistema}\n\n---\n\n${mensaje}`;
  const t0 = new Date();
  const r = spawnSync('claude', ['-p', '--model', MODELO, '--tools', '""', '--system-prompt', '"Sigue estrictamente la instruccion y el formato indicados por el usuario."', '--output-format', 'json'],
    { input: entrada, cwd: aislada, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 });
  const t1 = new Date();
  if (r.status !== 0) throw new Error(`${etiqueta}: claude terminó con código ${r.status}\n${r.stderr}\n${r.stdout}`);
  const j = JSON.parse(r.stdout);
  if (j.is_error) throw new Error(`${etiqueta}: ${j.result}`);
  const modelo = Object.keys(j.modelUsage || {})[0] || MODELO;
  console.log(`  ${etiqueta}: ${((t1 - t0) / 1000).toFixed(0)} s · ${modelo} · ${j.usage?.output_tokens ?? '?'} tokens de salida`);
  return { etiqueta, inicio: t0.toISOString(), fin: t1.toISOString(), segundos: (t1 - t0) / 1000, modelo, stop_reason: j.stop_reason, texto: j.result };
}

const corrida = {
  generado: new Date().toISOString(),
  herramienta: 'Claude Code CLI (claude -p) · sin herramientas · carpeta aislada',
  versiones: { I1: vI1, I2: 'v1.0', I3: 'v1.0' },
  documentos_incluidos: [],
  rechazados_ingesta: [],
  llamadas: [],
  hechos: [],
  sin_cambios: [],
  rechazadas: [],
  vinculos: {},
  clausulas: [],
};

// 1 · Ingesta (RF-1): las filas sin revisión anterior se rechazan antes de llegar al modelo.
const docs = documentos.filter(d => !solo || solo.includes(d.doc_id));
const aceptados = [];
for (const d of docs) {
  const e = N.validarIngesta(d);
  if (e.length) corrida.rechazados_ingesta.push({ doc_id: d.doc_id, errores: e });
  else aceptados.push(d);
}
corrida.documentos_incluidos = aceptados.map(d => d.doc_id);
console.log(`Ingesta: ${aceptados.length} aceptados, ${corrida.rechazados_ingesta.length} rechazados`);

// 2 · I1 por lotes de 10 documentos.
const porId = Object.fromEntries(documentos.map(d => [d.doc_id, d]));
console.log(`I1 ${vI1}`);
for (let i = 0; i < aceptados.length; i += LOTE) {
  const lote = aceptados.slice(i, i + LOTE);
  const ll = llamar(N.INSTRUCCIONES.I1[vI1].sistema, N.mensajeI1(lote), `I1 lote ${i / LOTE + 1}`);
  ll.instruccion = `I1 ${vI1}`; ll.docs = lote.map(d => d.doc_id);
  corrida.llamadas.push(ll);
  const r = N.parsearI1(ll.texto, porId);
  r.hechos.forEach(h => { h.generado_en = ll.fin; });
  corrida.hechos.push(...r.hechos);
  corrida.sin_cambios.push(...r.sinCambios);
  corrida.rechazadas.push(...r.rechazadas.map(x => ({ ...x, instruccion: `I1 ${vI1}` })));
}
corrida.hechos.forEach((h, k) => { h.id = `ALR-${String(k + 1).padStart(4, '0')}`; });
console.log(`  hechos: ${corrida.hechos.length} · sin cambios: ${corrida.sin_cambios.length} · rechazadas: ${corrida.rechazadas.length}`);

// 3 · I2 (vinculación R-V) en lotes de 25 hechos.
if (!flag('--sin-i2') && corrida.hechos.length) {
  console.log('I2 v1.0');
  const pc = Object.fromEntries(proyecto.partidas.map(p => [p.codigo, p]));
  for (let i = 0; i < corrida.hechos.length; i += 25) {
    const lote = corrida.hechos.slice(i, i + 25);
    const ll = llamar(N.INSTRUCCIONES.I2['v1.0'].sistema, N.mensajeI2(lote, proyecto.partidas), `I2 lote ${i / 25 + 1}`);
    ll.instruccion = 'I2 v1.0'; ll.hechos = lote.map(h => h.id);
    corrida.llamadas.push(ll);
    const r = N.parsearI2(ll.texto, pc, new Set(lote.map(h => h.id)));
    Object.assign(corrida.vinculos, r.vinculos);
    corrida.rechazadas.push(...r.rechazadas.map(x => ({ ...x, instruccion: 'I2 v1.0' })));
  }
  console.log(`  vínculos: ${Object.keys(corrida.vinculos).length}`);
}

// 4 · I3 (cláusula de notificación).
if (!flag('--sin-i3')) {
  console.log('I3 v1.0');
  const ll = llamar(N.INSTRUCCIONES.I3['v1.0'].sistema, N.mensajeI3(proyecto.contrato), 'I3');
  ll.instruccion = 'I3 v1.0';
  corrida.llamadas.push(ll);
  const r = N.parsearI3(ll.texto);
  corrida.clausulas = r.clausulas;
  corrida.rechazadas.push(...r.rechazadas.map(x => ({ ...x, instruccion: 'I3 v1.0' })));
  console.log(`  cláusulas: ${r.clausulas.map(c => c.clausula).join(', ')}`);
}

mkdirSync(join(datos, 'corridas'), { recursive: true });
writeFileSync(join(datos, 'corridas', salida), JSON.stringify(corrida, null, 1), 'utf8');
console.log(`Guardado en public/data/corridas/${salida}`);
