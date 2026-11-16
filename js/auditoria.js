// Registro de auditoría encadenado: cada evento guarda el hash SHA-256 del anterior.
// Si alguien altera un evento, su hash deja de coincidir y la cadena se rompe desde ahí.
// Se guarda en este navegador (localStorage); en producción iría en un servidor de solo anexado.
const CLAVE = 'rc-auditoria';
export const TIPOS = {
  detectado: { t: 'Detectado', c: 'azul' }, revisado: { t: 'Revisado', c: 'verde' }, corregido: { t: 'Corregido', c: 'ambar' },
  emitido: { t: 'Emitido', c: 'naranja' }, parametro: { t: 'Parámetro', c: 'gris' }, registro: { t: 'Registro', c: 'gris' },
};
let eventos = [];
try { eventos = JSON.parse(localStorage.getItem(CLAVE) || '[]'); } catch { }
let cola = Promise.resolve();

const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const contenido = e => JSON.stringify([e.n, e.ts, e.quien, e.tipo, e.que, e.alerta || null, e.fecha_sim, e.prev]);
export async function sha256(txt) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt))); }
const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(eventos)); } catch { } };

export const lista = () => eventos;
export function anexar({ quien, tipo = 'registro', que, alerta = null, fecha_sim }) {
  cola = cola.then(async () => {
    const prev = eventos.length ? eventos[eventos.length - 1].hash : '0'.repeat(64);
    const e = { n: eventos.length + 1, ts: new Date().toISOString(), quien, tipo: TIPOS[tipo] ? tipo : 'registro', que, alerta, fecha_sim, prev };
    e.hash = await sha256(contenido(e));
    eventos.push(e); guardar();
  });
  return cola;
}
export const listo = () => cola;

// Recalcula toda la cadena. Devuelve un estado por evento: 'ok' o el motivo de la ruptura.
export async function verificar() {
  const res = []; let prev = '0'.repeat(64), roto = false;
  for (const e of eventos) {
    const h = await sha256(contenido(e));
    if (roto) res.push('arrastra');
    else if (e.prev !== prev) { roto = true; res.push('enlace'); }
    else if (h !== e.hash) { roto = true; res.push('contenido'); }
    else res.push('ok');
    prev = e.hash;
  }
  return res;
}

// Solo para la demostración: altera el texto de un evento sin recalcular su hash.
let respaldo = null;
export function alterar(i) { if (!eventos[i] || respaldo) return false; respaldo = { i, que: eventos[i].que }; eventos[i].que = eventos[i].que.replace(/confirmad[oa]|emitid[oa]|detectad[oa]/, 'descartado') + ' (texto alterado)'; return true; }
export function restaurar() { if (!respaldo) return; eventos[respaldo.i].que = respaldo.que; respaldo = null; }
export const alterado = () => respaldo;
export function borrarTodo() { eventos = []; respaldo = null; guardar(); }
