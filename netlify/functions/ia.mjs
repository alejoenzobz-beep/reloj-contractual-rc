// Proxy a Gemini (Google AI Studio, plan gratuito). La clave vive en la variable de entorno GEMINI_API_KEY
// de Netlify y nunca llega al navegador. La función arma el prompt con las mismas instrucciones del núcleo:
// no acepta prompts libres, así no sirve como proxy abierto.
import * as N from '../../public/js/nucleo.js';
import { HERRAMIENTAS, MAX_TEXTO_HERRAMIENTA } from '../../public/js/herramientas.js';
import { SISTEMA_CHAT, MAX_PREGUNTA, MAX_CONTEXTO, MAX_HISTORIAL, GEN_CHAT, mensajeChat, leerSalidaChat } from '../../public/js/asistente_ia.js';

const BASE = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const LIMITE = Number(process.env.IA_LIMITE_POR_HORA || 30);
const usos = new Map(); // límite simple por IP (en memoria de la instancia)

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const texto = (s, max) => typeof s === 'string' && s.length <= max;

function permitido(ip) {
  const ahora = Date.now(), v = (usos.get(ip) || []).filter(t => ahora - t < 3600e3);
  if (v.length >= LIMITE) { usos.set(ip, v); return false; }
  v.push(ahora); usos.set(ip, v); return true;
}

// Modelo: GEMINI_MODEL si está definido; si no, uno liviano. Si el pedido tarda o no existe, se pasa a uno liviano
// disponible (ListModels solo como respaldo). Cada llamada se corta antes del límite de tiempo de Netlify.
const LIVIANOS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const MODELO_PEDIDO = process.env.GEMINI_MODEL || LIVIANOS[0];
let MODELO = MODELO_PEDIDO;
const TIEMPO_MS = Number(process.env.IA_TIEMPO_MS || 8000);
const MAX_SALIDA = { P: 256, C: 1024, H: 2048, I1: 3072, I2: 3072 };
let disponibles = null;
async function listarModelos(clave) {
  if (disponibles) return disponibles;
  const r = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': clave }, signal: AbortSignal.timeout(5000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`ListModels respondió ${r.status}: ${d?.error?.message || 'sin detalle'}`);
  return (disponibles = (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, '')));
}
// Configuración de generación: razonamiento mínimo (o nulo) y salida acotada.
function config(p, modelo, conPensamiento = true) {
  const g = { temperature: 0, ...(p.gen || {}), maxOutputTokens: MAX_SALIDA[p.paso] || 1024 };
  if (conPensamiento) { if (/gemini-2\.5/.test(modelo)) g.thinkingConfig = { thinkingBudget: 0 }; else if (/gemini-3/.test(modelo)) g.thinkingConfig = { thinkingLevel: 'minimal' }; }
  return g;
}
async function llamar(clave, p, modelo, ms, conPensamiento = true) {
  return fetch(`${BASE}/models/${encodeURIComponent(modelo)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': clave }, signal: AbortSignal.timeout(ms),
    body: JSON.stringify({ systemInstruction: { parts: [{ text: p.sistema }] }, contents: [{ role: 'user', parts: [{ text: p.mensaje }] }], generationConfig: config(p, modelo, conPensamiento) }),
  });
}
const PRESUPUESTO_MS = Number(process.env.IA_PRESUPUESTO_MS || 22000);
// Prueba el modelo actual y, si tarda, no existe, está saturado o responde vacío, pasa al siguiente liviano.
// Devuelve { salida, modelo } o lanza un error con el último motivo. Recuerda el modelo que respondió.
async function generar(clave, p) {
  const t0 = Date.now(), probados = new Set(); let motivo = 'sin respuesta';
  const siguiente = async () => { if (!probados.size) return MODELO; let ok = LIVIANOS; try { ok = await listarModelos(clave); } catch { } return LIVIANOS.find(m => !probados.has(m) && ok.includes(m)) || null; };
  for (let modelo = await siguiente(); modelo; modelo = await siguiente()) {
    probados.add(modelo);
    const resto = PRESUPUESTO_MS - (Date.now() - t0);
    if (resto < 2500) break;
    try {
      let r = await llamar(clave, p, modelo, Math.min(TIEMPO_MS, resto - 500));
      let d = await r.json().catch(() => ({}));
      if (r.status === 400 && /thinking/i.test(d?.error?.message || '')) { r = await llamar(clave, p, modelo, Math.min(TIEMPO_MS, resto - 500), false); d = await r.json().catch(() => ({})); }
      if ([404, 429, 500, 503].includes(r.status)) { motivo = `${modelo} respondió ${r.status}: ${d?.error?.message || ''}`.slice(0, 220); continue; }
      if (!r.ok) throw Object.assign(new Error(`El proveedor de IA (Gemini, modelo ${modelo}) respondió ${r.status}: ${d?.error?.message || 'sin detalle'}`), { proveedor: true });
      const salida = (d.candidates?.[0]?.content?.parts || []).filter(x => !x.thought).map(x => x.text || '').join('').trim();
      if (!salida) { motivo = `${modelo} devolvió una respuesta vacía (${d.candidates?.[0]?.finishReason || 'sin motivo'})`; continue; }
      MODELO = modelo; return { salida, modelo };
    } catch (e) {
      if (e.proveedor) throw e;
      if (e.name === 'TimeoutError' || e.name === 'AbortError') { motivo = `${modelo} tardó más de ${Math.round(Math.min(TIEMPO_MS, resto) / 1000)} s`; continue; }
      throw e;
    }
  }
  throw Object.assign(new Error(`La IA tardó demasiado o no está disponible (${motivo}).`), { tiempo: true });
}

function armar(paso, e) {
  if (paso === 'P') return { sistema: 'Responde solo con la palabra OK.', mensaje: 'Prueba de conexión.' };
  if (paso === 'I1') {
    const d = e.doc || {};
    if (!texto(d.doc_id, 40) || !texto(d.texto, 30000) || !(d.texto_anterior == null || texto(d.texto_anterior, 30000))) return null;
    const doc = { doc_id: d.doc_id, tipo: String(d.tipo || 'Lámina').slice(0, 30), titulo: String(d.titulo || '').slice(0, 160), especialidad: String(d.especialidad || '').slice(0, 60), revision: String(d.revision || '').slice(0, 20), revision_anterior: String(d.revision_anterior || '').slice(0, 20), texto: d.texto, texto_anterior: d.texto_anterior || '' };
    return { sistema: N.INSTRUCCIONES.I1[N.VERSION_VIGENTE.I1].sistema, mensaje: N.mensajeI1([doc]) };
  }
  if (paso === 'I2') {
    const { hechos, partidas } = e;
    if (!Array.isArray(hechos) || !Array.isArray(partidas) || hechos.length > 30 || partidas.length > 400) return null;
    const ok = o => Object.values(o).every(v => v == null || (typeof v === 'string' && v.length <= 600) || typeof v === 'number');
    if (!hechos.every(ok) || !partidas.every(ok)) return null;
    return { sistema: N.INSTRUCCIONES.I2[N.VERSION_VIGENTE.I2].sistema, mensaje: N.mensajeI2(hechos, partidas) };
  }
  if (paso === 'H') {
    const h = HERRAMIENTAS[e.herramienta];
    if (!h || !texto(e.texto, MAX_TEXTO_HERRAMIENTA) || !e.texto.trim()) return null;
    return { sistema: h.sistema, mensaje: e.texto };
  }
  if (paso === 'C') {
    // Chat: pregunta corta + resumen del proyecto que arma la app (con las fechas ya calculadas por nucleo.js).
    const { pregunta, pantalla, contexto, historial = [] } = e;
    if (!texto(pregunta, MAX_PREGUNTA) || !pregunta.trim() || !texto(contexto, MAX_CONTEXTO) || !texto(String(pantalla || ''), 60)) return null;
    try { JSON.parse(contexto); } catch { return null; }
    if (!Array.isArray(historial) || historial.length > MAX_HISTORIAL || !historial.every(x => x && ['usuario', 'asistente'].includes(x.rol) && texto(x.texto, MAX_PREGUNTA * 3))) return null;
    let ids = new Set(); try { ids = new Set((JSON.parse(contexto).cambios || []).map(c => String(c.id).toUpperCase())); } catch { }
    return { sistema: SISTEMA_CHAT, mensaje: mensajeChat({ pregunta, pantalla, contexto, historial }), gen: GEN_CHAT, chat: true, ids };
  }
  return null;
}

export default async (req, context) => {
  const clave = process.env.GEMINI_API_KEY;
  if (req.method === 'GET') {
    if (new URL(req.url).searchParams.has('modelos') && clave) { try { return json({ modelo: MODELO, disponibles: await listarModelos(clave) }); } catch (e) { return json({ error: 'lista', mensaje: e.message }, 502); } }
    return json({ servidor: true, clave: !!clave, modelo: MODELO, proveedor: 'Gemini' });
  }
  if (req.method !== 'POST') return json({ error: 'metodo', mensaje: 'Usa POST.' }, 405);
  if (!clave) return json({ error: 'sin_clave', mensaje: 'Servidor sin clave: usa el modo manual o el de demostración.' }, 503);
  let e; try { e = await req.json(); } catch { return json({ error: 'entrada', mensaje: 'La solicitud no es JSON válido.' }, 400); }
  const p = armar(e.paso, e);
  if (p) p.paso = e.paso;
  if (!p) return json({ error: 'entrada', mensaje: 'Solicitud fuera de formato o demasiado grande.' }, 400);
  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || 'local';
  if (!permitido(ip)) return json({ error: 'limite', mensaje: `Se alcanzó el límite de ${LIMITE} consultas por hora. Usa el modo manual o el de demostración.` }, 429);
  try {
    const t0 = Date.now(), { salida, modelo } = await generar(clave, p);
    if (p.chat) return json({ ...leerSalidaChat(salida, p.ids), modelo, ms: Date.now() - t0 });
    return json({ texto: salida, modelo, ms: Date.now() - t0 });
  } catch (err) {
    if (err.tiempo) return json({ error: 'tiempo', mensaje: err.message }, 504);
    if (err.proveedor) return json({ error: 'proveedor', mensaje: err.message }, 502);
    return json({ error: 'red', mensaje: `No se pudo contactar al proveedor de IA: ${err.message}` }, 502);
  }
};
