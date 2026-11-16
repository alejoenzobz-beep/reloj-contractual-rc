// Medición de una corrida contra el conjunto de referencia (F3 · protocolo de pruebas).
// Uso: node scripts/medir.mjs corrida_v1.0.json [--subconjunto reservados|desarrollo|todos] [--json]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as N from '../public/js/nucleo.js';

const datos = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const archivo = process.argv[2];
const sub = process.argv.includes('--subconjunto') ? process.argv[process.argv.indexOf('--subconjunto') + 1] : 'todos';
const ref = JSON.parse(readFileSync(join(datos, 'referencia.json'), 'utf8'));
const docs = JSON.parse(readFileSync(join(datos, 'documentos.json'), 'utf8'));
const proyecto = JSON.parse(readFileSync(join(datos, 'proyecto.json'), 'utf8'));
const c = JSON.parse(readFileSync(join(datos, 'corridas', archivo), 'utf8'));

const reservados = new Set(ref.reservados.docs);
const incluidos = [...c.documentos_incluidos, ...c.rechazados_ingesta.map(x => x.doc_id)]
  .filter(id => sub === 'todos' || (sub === 'reservados' ? reservados.has(id) : !reservados.has(id)));
const r2 = { ...ref, documentos: Object.fromEntries(incluidos.filter(id => ref.documentos[id] !== undefined).map(id => [id, ref.documentos[id]])) };
const set = new Set(incluidos);
const alertas = c.hechos.filter(h => set.has(h.doc_id)).map(h => { const v = c.vinculos[h.id] || {}; return { ...h, partida: v.partida ?? null, partida_modelo: v.partida ?? null, confianza: v.confianza }; });
const m = N.evaluar({ alertas, referencia: r2, documentos: docs });

const ini = new Date(c.llamadas[0].inicio);
const lat = N.mediana(c.hechos.filter(h => set.has(h.doc_id)).map(h => (new Date(h.generado_en) - ini) / 3600000));
const cl = c.clausulas.find(x => x.clausula.startsWith('14.3'));
const vr = proyecto.contrato.referencia_validacion;

if (process.argv.includes('--json')) { console.log(JSON.stringify({ archivo, sub, ...m, latencia_h: lat, i3: cl }, null, 1)); process.exit(0); }
console.log(`\n${archivo} · subconjunto: ${sub} · ${incluidos.length} documentos · I1 ${c.versiones.I1}`);
console.log(`Cobertura (recall) ........ ${N.pct(m.recall, 1)}  (${m.verdaderos_positivos}/${m.total_referencia}; grandes ${N.pct(m.recall_grandes)}, pequeños ${N.pct(m.recall_pequenos)})`);
console.log(`Precisión ................. ${N.pct(m.precision, 1)}  (${m.total_alertas - m.falsos_positivos}/${m.total_alertas})`);
console.log(`Trazabilidad .............. ${N.pct(m.trazabilidad)}  (filas rechazadas por cita o formato: ${c.rechazadas.length})`);
console.log(`Vinculación con partida ... ${N.pct(m.vinculacion, 1)}`);
console.log(`Docs sin cambio OK ........ ${m.verdaderos_negativos_docs}/${m.docs_sin_cambio}`);
console.log(`Rechazo en ingesta ........ ${m.rechazos_ingesta_ok}`);
console.log(`Latencia mediana .......... ${lat?.toFixed(3)} h`);
console.log(`I3 ........................ ${cl ? `${cl.clausula} · ${cl.gatillo} · ${cl.plazo} ${cl.tipo_dias}` : 'sin 14.3'} → ${cl && cl.plazo === vr.plazo && cl.tipo_dias === vr.tipo_dias && cl.gatillo === vr.gatillo ? 'coincide' : 'NO coincide'}`);
console.log('\nOmisiones:'); m.filas.filter(f => !f.detectado).forEach(f => console.log(`  ${f.ref_id}  ${f.cambio_ref}`));
console.log('\nVinculación errónea:'); m.filas.filter(f => f.detectado && !f.partida_ok).forEach(f => console.log(`  ${f.ref_id}  esperada ${f.partida_esperada} · propuesta ${f.partida_propuesta}  (${f.cambio_ref})`));
console.log('\nFalsos positivos:'); m.falsos.forEach(f => console.log(`  ${f.alerta_id} ${f.doc_id}  ${f.cambio}`));
console.log('\nFilas rechazadas:'); c.rechazadas.forEach(x => console.log(`  [${x.instruccion}] ${x.motivo} :: ${x.linea.slice(0, 140)}`));
