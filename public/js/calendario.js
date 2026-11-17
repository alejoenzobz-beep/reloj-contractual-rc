// Calendario mensual del plazo y archivo .ics. Las fechas vienen calculadas por nucleo.js; aquí solo se dibujan.
import * as N from './nucleo.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const primeroDeMes = iso => iso.slice(0, 8) + '01';
const mesSig = iso => { const [y, m] = iso.split('-').map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; };
const esFinde = iso => [0, 6].includes(N.isoAFecha(iso).getUTCDay());

// Plazo de un cambio: recepción (día 0), días que cuentan (numerados), tramo «entender sin asistente», hoy y límite.
export function calendarioPlazo({ inicio, limite, feriados = [], tipo = 'calendario', hoy, refMax = null, titulo = '' }) {
  const fer = new Set(feriados), habiles = tipo === 'habiles';
  const cuenta = iso => iso > inicio && iso <= limite && (!habiles || (!esFinde(iso) && !fer.has(iso)));
  let n = 0; const numero = {};
  for (let d = N.sumarDias(inicio, 1); d <= limite; d = N.sumarDias(d, 1)) if (cuenta(d)) numero[d] = ++n;
  const finEntender = refMax ? N.sumarDias(inicio, refMax) : null;
  const meses = [];
  for (let m = primeroDeMes(inicio); m <= primeroDeMes(limite) && meses.length < 3; m = mesSig(m)) meses.push(m);
  const mes = m1 => {
    const desfase = (N.isoAFecha(m1).getUTCDay() + 6) % 7, ini = N.sumarDias(m1, -desfase);
    let celdas = '';
    for (let k = 0; k < 42; k++) {
      const d = N.sumarDias(ini, k), dentro = d.slice(0, 7) === m1.slice(0, 7);
      if (!dentro && k >= 35) break;
      const cls = [dentro ? '' : 'fuera', esFinde(d) ? 'finde' : '', fer.has(d) ? 'feriado' : '', numero[d] ? 'cuenta' : '', d === inicio ? 'recepcion' : '', d === limite ? 'limite' : '', d === hoy ? 'hoy' : '', finEntender && d > inicio && d <= finEntender ? 'entender' : ''].filter(Boolean).join(' ');
      const etq = d === inicio ? 'recibido · día 0' : d === limite ? `vence · día ${numero[d] ?? n}` : fer.has(d) ? (numero[d] ? `día ${numero[d]} · feriado` : d > inicio && d < limite && habiles ? 'feriado · no cuenta' : 'feriado') : numero[d] ? `día ${numero[d]}` : (habiles && d > inicio && d < limite && esFinde(d) ? 'no hábil' : '');
      celdas += `<div class="cm-d ${cls}" ${dentro ? '' : 'aria-hidden="true"'}><span class="cm-n">${Number(d.slice(8))}</span>${dentro && etq ? `<small>${etq}</small>` : ''}${d === hoy && dentro ? '<i class="cm-hoy">hoy</i>' : ''}</div>`;
    }
    return `<div class="cm-mes"><div class="cm-tit">${MESES[Number(m1.slice(5, 7)) - 1]} ${m1.slice(0, 4)}</div><div class="cm-grid">${DS.map(x => `<div class="cm-dn">${x}</div>`).join('')}${celdas}</div></div>`;
  };
  const aria = `${titulo ? titulo + '. ' : ''}Recibido el ${N.fmtFecha(inicio)}; vence el ${N.fmtFecha(limite)} tras ${n} días ${habiles ? 'hábiles' : 'calendario'}.`;
  return `<div class="cal-mes" role="img" aria-label="${esc(aria)}"><div class="cm-meses">${meses.map(mes).join('')}</div>
    <div class="cm-ley"><span><i class="l-rec"></i>Recepción (día 0)</span><span><i class="l-cuenta"></i>Día que cuenta</span>${refMax ? `<span><i class="l-ent"></i>Entender sin asistente (referencia)</span>` : ''}<span><i class="l-fer"></i>Feriado</span>${habiles ? '<span><i class="l-finde"></i>No hábil</span>' : ''}<span><i class="l-lim"></i>Límite</span><span><i class="l-hoy"></i>Hoy</span></div></div>`;
}

// Vista de la bandeja: vencimientos por día en el mes de una fecha.
export function calendarioVencimientos({ mes, hoy, items, feriados = [] }) {
  const fer = new Set(feriados), m1 = primeroDeMes(mes), desfase = (N.isoAFecha(m1).getUTCDay() + 6) % 7, ini = N.sumarDias(m1, -desfase);
  let celdas = '';
  for (let k = 0; k < 42; k++) {
    const d = N.sumarDias(ini, k), dentro = d.slice(0, 7) === m1.slice(0, 7);
    if (!dentro && k >= 35) break;
    const del = items.filter(i => i.fecha === d);
    celdas += `<div class="cm-d grande ${dentro ? '' : 'fuera'} ${esFinde(d) ? 'finde' : ''} ${fer.has(d) ? 'feriado' : ''} ${d === hoy ? 'hoy' : ''}"><span class="cm-n">${Number(d.slice(8))}</span>${fer.has(d) && dentro ? '<small>feriado</small>' : ''}${del.map(i => `<a class="cm-item s-${i.estado}" href="${i.href}" title="${esc(i.titulo)}">${esc(i.texto)}</a>`).join('')}</div>`;
  }
  return `<div class="cm-mes"><div class="cm-tit">${MESES[Number(m1.slice(5, 7)) - 1]} ${m1.slice(0, 4)}</div><div class="cm-grid">${DS.map(x => `<div class="cm-dn">${x}</div>`).join('')}${celdas}</div></div>`;
}
export const mesSiguiente = mesSig, mesAnterior = iso => { const [y, m] = iso.split('-').map(Number); return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`; };

// Archivo .ics con la fecha límite (todo el día) y un aviso dos días antes.
export function ics({ id, limite, resumen, descripcion, avisoDias = 2 }) {
  const e = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const plegar = l => { const out = []; let x = l; while (new TextEncoder().encode(x).length > 74) { let k = 74; while (new TextEncoder().encode(x.slice(0, k)).length > 74) k--; out.push(x.slice(0, k)); x = ' ' + x.slice(k); } out.push(x); return out.join('\r\n'); };
  const f = iso => iso.replace(/-/g, ''), ahora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Reloj Contractual//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${id}-${f(limite)}@reloj-contractual`, `DTSTAMP:${ahora}`, `DTSTART;VALUE=DATE:${f(limite)}`, `DTEND;VALUE=DATE:${f(N.sumarDias(limite, 1))}`,
    `SUMMARY:${e(resumen)}`, `DESCRIPTION:${e(descripcion)}`, 'TRANSP:TRANSPARENT',
    'BEGIN:VALARM', `TRIGGER:-P${avisoDias}D`, 'ACTION:DISPLAY', `DESCRIPTION:${e(`Faltan ${avisoDias} días: ${resumen}`)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].map(plegar).join('\r\n') + '\r\n';
}
export function descargarIcs(texto, nombre) {
  const u = URL.createObjectURL(new Blob([texto], { type: 'text/calendar;charset=utf-8' })), a = document.createElement('a');
  a.href = u; a.download = nombre; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
}
