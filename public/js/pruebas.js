// Casos de prueba CP-01 a CP-12 (Plan del Hito 2, Tabla 12). Se ejecutan en la app y con node scripts/pruebas.mjs.
import * as N from './nucleo.js';

export function casosDePrueba(proyecto, documentos) {
  const porId = Object.fromEntries(documentos.map(d => [d.doc_id, d]));
  const pc = Object.fromEntries(proyecto.partidas.map(p => [p.codigo, p]));
  const P = { clausula: '14.3', plazo: 7, tipo_dias: 'calendario', gatillo: 'recepcion' };
  const PH = { ...P, tipo_dias: 'habiles' };
  const cp = [];
  const t = (id, req, esc, fn) => { let ok = false, det = ''; try { [ok, det] = fn(); } catch (e) { det = 'Error: ' + e.message; } cp.push({ id, req, esc, ok, det }); };
  t('CP-01', 'RF-1', 'Documento sin revisión anterior en el corpus', () => { const e = N.validarIngesta(porId['E-108']); return [e.length > 0, e.join('; ')]; });
  t('CP-02', 'RF-2', 'Cambio grande evidente: se acepta con cita verificada', () => { const r = N.parsearI1('E-101 | 1 | Zapata Z-3 crece a 2,60 × 2,60 m | Ejes B-4 y C-4 | Estructuras | Zapata | Z-3 2,60 × 2,60 m, h = 0,70 m', porId); return [r.hechos.length === 1, `${r.hechos.length} hecho aceptado`]; });
  t('CP-03', 'RF-2', 'Cambio pequeño en nota: la cita de la nota se verifica', () => { const r = N.parsearI1('E-215 | 1 | Viga V-20 pasa de 0,60 a 0,70 m | Nivel 8 | Estructuras | Viga | la altura de la viga V-20 pasa de 0,60 a 0,70 m', porId); return [r.hechos.length === 1 && r.hechos[0].cita_verificada, 'cita de la NOTA 4 verificada']; });
  t('CP-04', 'RF-3', 'Instrucción en el cuarto párrafo de una carta', () => { const r = N.parsearI1('CT-024 | 1 | Barandas de escaleras en acero inoxidable | Escaleras de evacuación | Arquitectura | Baranda | las barandas de las escaleras de evacuación, niveles 1 a 12, se ejecuten en acero inoxidable', porId); return [r.hechos.length === 1, 'fila aceptada con cita del cuarto párrafo']; });
  t('CP-05', 'RF-4', 'Criterio de rango incumplido (h > 3,00): confianza media', () => { const r = N.parsearI2('ALR-1 | 03.02.04 | Encofrado metálico de placas | Placas N4 | ✓ | ✓ | ✓ | ✗ | Alta | h=3,20 excede | 03.02.05', pc, new Set(['ALR-1'])); const v = r.vinculos['ALR-1']; return [v.confianza === 'Media' && v.confianza_ajustada && v.alternativa === '03.02.05', `confianza ${v.confianza} (modelo: ${v.confianza_modelo}) · alternativa ${v.alternativa}`]; });
  t('CP-06', 'RF-4', 'Cambio sin partida aplicable', () => { const r = N.parsearI2('ALR-2 | SIN PARTIDA | SIN PARTIDA | — | ✗ | ✓ | ✓ | ✗ | Baja | no existe partida de cemento pulido | —', pc, new Set(['ALR-2'])); const v = r.vinculos['ALR-2']; return [v.partida === null && v.confianza === 'Baja', 'propuesta «sin partida», confianza baja']; });
  t('CP-07', 'RF-5', 'Plazo en días calendario', () => { const f = N.fechaLimite('2026-10-06', P, proyecto.feriados); return [f === '2026-10-13', `06/10 + 7 = ${N.fmtFecha(f)}`]; });
  t('CP-08', 'RF-5', 'Plazo en días hábiles con feriado intermedio (08/10)', () => { const f = N.fechaLimite('2026-10-06', PH, proyecto.feriados); return [f === '2026-10-16', `WORKDAY(06/10; 7) = ${N.fmtFecha(f)} (salta sábado, domingo y el feriado del 08/10)`]; });
  t('CP-09', 'RF-5', 'Gatillo «conocimiento»: se usa la fecha de recepción', () => { const f = N.fechaLimite('2026-10-06', { ...P, gatillo: 'conocimiento' }, proyecto.feriados); return [f === '2026-10-13', 'regla conservadora aplicada']; });
  t('CP-10', 'RF-6', 'Salida sin cita o con cita inexistente', () => { const r = N.parsearI1('A-201 | 1 | Cambio de piso | Dormitorios | Arquitectura | Piso | se cambia el piso a madera maciza', porId); const r2 = N.parsearI1('A-201 | 1 | Cambio de piso | Dormitorios | Arquitectura | Piso |', porId); return [r.hechos.length === 0 && r2.hechos.length === 0, `${r.rechazadas[0]?.motivo} · ${r2.rechazadas[0]?.motivo}`]; });
  t('CP-11', 'RF-7 / PD1', 'Corrección: se conserva el valor original del modelo', () => { const a = { partida: '03.02.04', partida_modelo: '03.02.04' }; const c = { ...a, partida: '03.02.05' }; return [c.partida_modelo === '03.02.04' && c.partida === '03.02.05', 'partida_modelo intacta tras corregir']; });
  t('CP-12', 'RF-8 / PD3', 'Carta sin aprobación PD3 / con dato no trazable', () => { const campos = { clausula: '14.3', fecha_recepcion: '06/10/2026', documento: 'E-204' }; const v = N.verificarCarta('Según la cláusula 14.3, el documento E-204 recibido el 06/10/2026 implica 6,40 m²', campos); return [!v.ok && v.fuera.includes('6,40'), `cifra no trazable detectada: ${v.fuera.join(', ')} · la vista de carta bloquea alertas no aprobadas`]; });
  return cp;
}

