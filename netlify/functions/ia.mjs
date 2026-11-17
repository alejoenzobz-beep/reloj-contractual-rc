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
const LIVIANOS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const MODELO_PEDIDO = process.env.GEMINI_MODEL || LIVIANOS[0];
let MODELO = MODELO_PEDIDO;
const TIEMPO_MS = Number(process.env.IA_TIEMPO_MS || 8000);
const MAX_SALIDA = { P: 16, C: 700, H: 1500, I1: 2048, I2: 2048 };
let disponibles = null;
async function listarModelos(clave) {
  if (disponibles) return disponibles;
  const r = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': clave }, signal: AbortSignal.timeout(5000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`ListModels respondió ${r.status}: ${d?.error?.message || 'sin detalle'}`);
  return (disponibles = (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, '')));
}
async function elegirLiviano(clave, evitar) {
  const ok = await listarModelos(clave);
  const m = LIVIANOS.find(x => x !== evitar && ok.includes(x)) || ok.find(n => /flash-lite/.test(n) && n !== evitar) || ok.find(n => /flash/.test(n) && !/(image|tts|audio|live|exp)/.test(n) && n !== evitar);
  if (!m) throw new Error('La clave no tiene acceso a un modelo liviano que admita generateContent.');
  return m;
}
// Configuración de generación: sin razonamiento (o el mínimo) y salida acotada.
function config(p, modelo, conPensamiento = true) {
  const g = { temperature: 0, ...(p.gen || {}), maxOutputTokens: MAX_SALIDA[p.paso] || 1024 };
  if (conPensamiento) g.thinkingConfig = /gemini-2\.5/.test(modelo) ? { thinkingBudget: 0 } : /gemini-3/.test(modelo) ? { thinkingLevel: 'low' } : undefined;
  if (!g.thinkingConfig) delete g.thinkingConfig;
  return g;
}
async function llamar(clave, p, modelo, ms, conPensamiento = true) {
  return fetch(`${BASE}/models/${encodeURIComponent(modelo)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': clave }, signal: AbortSignal.timeout(ms),
    body: JSON.stringify({ systemInstruction: { parts: [{ text: p.sistema }] }, contents: [{ role: 'user', parts: [{ text: p.mensaje }] }], generationConfig: config(p, modelo, conPensamiento) }),
  });
}
async function generar(clave, p) {
  const t0 = Date.now();
  try {
    let r = await llamar(clave, p, MODELO, TIEMPO_MS);
    if (r.status === 400) { const d = await r.clone().json().catch(() => ({})); if (/thinking/i.test(d?.error?.message || '')) r = await llamar(clave, p, MODELO, TIEMPO_MS, false); }
    if (r.status !== 404) return r;
  } catch (e) { if (e.name !== 'TimeoutError' && e.name !== 'AbortError') throw e; }
  // El modelo pedido no existe o tardó demasiado: se usa uno liviano con el tiempo que queda.
  const resto = 22000 - (Date.now() - t0);
  if (resto < 3000) throw Object.assign(new Error('La IA tardó demasiado.'), { tiempo: true });
  MODELO = await elegirLiviano(clave, MODELO);
  try { return await llamar(clave, p, MODELO, Math.min(TIEMPO_MS, resto - 1000)); }
  catch (e) { if (e.name === 'TimeoutError' || e.name === 'AbortError') throw Object.assign(new Error('La IA tardó demasiado.'), { tiempo: true }); throw e; }
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
    const t0 = Date.now(), r = await generar(clave, p);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: 'proveedor', mensaje: `El proveedor de IA (Gemini, modelo ${MODELO}) respondió ${r.status}: ${d?.error?.message || 'sin detalle'}` }, 502);
    const salida = (d.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('').trim();
    if (!salida) return json({ error: 'vacia', mensaje: 'Gemini devolvió una respuesta vacía.' }, 502);
    if (p.chat) return json({ ...leerSalidaChat(salida, p.ids), modelo: MODELO });
    return json({ texto: salida, modelo: MODELO, ms: Date.now() - t0 });
  } catch (err) {
    if (err.tiempo) return json({ error: 'tiempo', mensaje: 'La IA tardó demasiado en responder.' }, 504);
    return json({ error: 'red', mensaje: `No se pudo contactar al proveedor de IA: ${err.message}` }, 502);
  }
};
