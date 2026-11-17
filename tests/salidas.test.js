// La carta de una alerta con varios cambios los notifica todos, cada uno con su cita y su partida.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { camposGrupo, plantilla, revisar, SIN_PARTIDA } from '../public/js/salidas.js';

const proyecto = JSON.parse(fs.readFileSync(new URL('../public/data/proyecto.json', import.meta.url)));
const partidaPorCod = Object.fromEntries(proyecto.partidas.map(p => [p.codigo, p]));
const doc = { doc_id: 'E-301', revision: 'B', titulo: 'Vigas del nivel típico', fecha_recepcion: '2026-10-09' };
const base = { doc_id: 'E-301', doc, fecha_recepcion: '2026-10-09', limite: '2026-10-16', criterios: [true, true, true, true], confianza: 'Alta' };
const items = [
  { a: { ...base, id: 'ALR-C001', elemento: 'Viga V-1', cambio: 'La viga V-1 aumenta su peralte de 0,60 m a 0,70 m.', ubicacion: 'Eje A', cita: 'SECCIÓN V-1 · b × h = 0,30 × 0,70 m', partida: '03.01.03' }, dec: { estado: 'confirmada', partida: '03.01.03' } },
  { a: { ...base, id: 'ALR-C002', elemento: 'Viga V-3', cambio: 'El acero inferior de V-3 pasa de 3 Ø 5/8" a 4 Ø 3/4".', ubicacion: 'Cuadro de vigas', cita: 'V-3 · 0,30 × 0,60 · 3 Ø 5/8" · 4 Ø 3/4" · Ø 3/8" @ 0,15', partida: '03.03.01' }, dec: { estado: 'confirmada', partida: '03.03.01' } },
  { a: { ...base, id: 'ALR-C003', elemento: 'Concreto de vigas', cambio: "El concreto de vigas pasa de f'c = 280 a 350 kg/cm².", ubicacion: 'Notas generales', cita: "NOTA 2: CONCRETO EN VIGAS f'c = 350 kg/cm².", partida: null }, dec: { estado: 'confirmada', partida: null } },
];
const c = camposGrupo({ items, params: proyecto.contrato.referencia_validacion, proyecto: 'Edificio R1', hoy: '2026-10-09', partidaPorCod });

for (const tipo of ['carta', 'acta', 'informe']) test(`alerta con 3 cambios → ${tipo} con 3 cambios`, () => {
  const t = plantilla(tipo, c);
  for (const x of items) assert.ok(t.includes(x.a.cita), `falta la cita de ${x.a.elemento}`);
  assert.ok(t.includes('03.01.03') && t.includes('03.03.01'), 'faltan partidas');
  assert.ok(t.includes(SIN_PARTIDA), 'el cambio sin partida se notifica como partida por definir');
  assert.ok(t.includes('16/10/2026'), 'falta la fecha límite');
  const r = revisar(t, c, false);
  assert.ok(r.ok, r.av.map(x => x.t).join(' · '));
});
test('el verificador cubre todos los cambios: una cifra inventada o una cita borrada se marcan', () => {
  const t = plantilla('carta', c);
  assert.ok(!revisar(t.replace('Atentamente', 'Monto: 999 999. Atentamente'), c, false).ok);
  const sinCita = revisar(t.replace(items[2].a.cita, '«texto»'), c, false);
  assert.ok(sinCita.av.some(x => /cambio 3/.test(x.t)), 'debe avisar que falta la cita del cambio 3');
});
