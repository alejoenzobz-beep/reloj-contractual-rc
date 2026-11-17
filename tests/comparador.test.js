// Regresión del comparador: diff de píxeles, diff de líneas y emparejado de revisiones por nombre.
import test from 'node:test';
import assert from 'node:assert/strict';
import { difPixeles, diffLineas, emparejar } from '../public/js/comparador.js';

const lienzo = (W, H, pintar = () => { }) => { const d = new Uint8ClampedArray(W * H * 4).fill(255); pintar((x, y) => { const k = (y * W + x) * 4; d[k] = d[k + 1] = d[k + 2] = 0; }); return d; };
test('la misma imagen da 0 zonas', () => {
  const a = lienzo(200, 100, p => { for (let x = 20; x < 80; x++) p(x, 50); });
  assert.equal(difPixeles(a, a.slice(), 200, 100).regiones.length, 0);
});
test('un bloque nuevo da 1 zona en su lugar', () => {
  const a = lienzo(200, 100), b = lienzo(200, 100, p => { for (let x = 120; x < 140; x++) for (let y = 30; y < 40; y++) p(x, y); });
  const { regiones } = difPixeles(a, b, 200, 100);
  assert.equal(regiones.length, 1);
  assert.ok(regiones[0].x <= 120 && regiones[0].x + regiones[0].w >= 140);
});
test('dos cambios lejanos dan 2 zonas', () => {
  const a = lienzo(300, 100), b = lienzo(300, 100, p => { for (let x = 10; x < 20; x++) p(x, 10); for (let x = 250; x < 260; x++) p(x, 90); });
  assert.equal(difPixeles(a, b, 300, 100).regiones.length, 2);
});
test('diff de líneas: empareja la línea modificada aunque se intercale una nueva', () => {
  const ops = diffLineas(['V-2 · 0,25', 'V-3 · 3 Ø 5/8"'], ['V-2 · 0,25', 'REV. B: SE ACTUALIZA', 'V-3 · 4 Ø 3/4"']);
  const cambio = ops.find(o => o.tipo === 'cambio');
  assert.equal(cambio.a, 'V-3 · 3 Ø 5/8"'); assert.equal(cambio.b, 'V-3 · 4 Ø 3/4"');
  assert.ok(ops.some(o => o.tipo === 'agregada' && o.b.startsWith('REV. B')));
});
test('textos iguales no dan diferencias', () => assert.equal(diffLineas(['a', 'b'], ['a', 'b']).length, 0));
test('emparejado por nombre: toma las dos últimas revisiones', () => {
  const f = n => ({ name: n });
  const p = emparejar([f('E-301_revA.pdf'), f('E-301_revC.pdf'), f('E-301_revB.pdf'), f('nota.txt'), f('A-12 rev 1.pdf'), f('A-12 rev 2.pdf')], true);
  const e301 = p.find(x => x.base === 'E-301');
  assert.equal(e301.ra, 'B'); assert.equal(e301.rb, 'C');
  assert.ok(p.some(x => x.base === 'A-12' && x.ra === '1' && x.rb === '2'));
});
