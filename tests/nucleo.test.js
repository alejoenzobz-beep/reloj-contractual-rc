// Las 12 pruebas del plan (CP-01 a CP-12) sobre la misma lógica que usa la app (public/js/nucleo.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { casosDePrueba } from '../public/js/pruebas.js';

const leer = f => JSON.parse(fs.readFileSync(new URL(`../public/data/${f}`, import.meta.url)));
const casos = casosDePrueba(leer('proyecto.json'), leer('documentos.json'));
test('hay 12 casos de prueba', () => assert.equal(casos.length, 12));
for (const c of casos) test(`${c.id} · ${c.esc}`, () => assert.ok(c.ok, c.det));
