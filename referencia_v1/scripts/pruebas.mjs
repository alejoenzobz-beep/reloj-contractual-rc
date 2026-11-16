// Ejecuta los casos CP-01 a CP-12 sobre el mismo código que usa la app.
// Uso: node scripts/pruebas.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { casosDePrueba } from '../public/js/pruebas.js';

const datos = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const proyecto = JSON.parse(readFileSync(join(datos, 'proyecto.json'), 'utf8'));
const docs = JSON.parse(readFileSync(join(datos, 'documentos.json'), 'utf8'));
const res = casosDePrueba(proyecto, docs);
for (const r of res) console.log(`${r.ok ? 'PASA ' : 'FALLA'}  ${r.id}  ${r.req.padEnd(10)} ${r.esc}\n        ${r.det}`);
const ok = res.filter(r => r.ok).length;
console.log(`\n${ok} de ${res.length} casos superados`);
process.exit(ok === res.length ? 0 : 1);
