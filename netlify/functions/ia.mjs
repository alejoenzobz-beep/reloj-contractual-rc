// Proxy a Gemini (Google AI Studio, plan gratuito). La clave vive en la variable de entorno GEMINI_API_KEY
// de Netlify y nunca llega al navegador. La función arma el prompt con las mismas instrucciones del núcleo:
// no acepta prompts libres, así no sirve como proxy abierto.
import * as N from '../../public/js/nucleo.js';
import { HERRAMIENTAS, MAX_TEXTO_HERRAMIENTA } from '../../public/js/herramientas.js';
import { SISTEMA_CHAT, MAX_PREGUNTA, MAX_CONTEXTO, MAX_HISTORIAL, GEN_CHAT, mensajeChat, leerSalidaChat } from '../../public/js/asistente_ia.js';

const MODELO_PEDIDO = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
let MODELO = MODELO_PEDIDO; // puede cambiar si el modelo pedido ya no existe (ver elegirModelo)
const PREFERIDOS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'];
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

// Si el modelo configurado da 404, consulta ListModels y elige un modelo Flash disponible que admita generateContent.
async function elegirModelo(clave) {
  const r = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': clave } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`ListModels respondió ${r.status}: ${d?.error?.message || 'sin detalle'}`);
  const ok = (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''));
  const elegido = PREFERIDOS.find(p => ok.includes(p)) || ok.find(n => /flash/.test(n) && !/(image|tts|audio|live|thinking|exp)/.test(n)) || ok.find(n => /^gemini/.test(n));
  if (!elegido) throw new Error('La clave no tiene acceso a ningún modelo Gemini que admita generateContent.');
  return elegido;
}
async function generar(clave, p) {
  const llamar = () => fetch(`${BASE}/models/${encodeURIComponent(MODELO)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': clave },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: p.sistema }] }, contents: [{ role: 'user', parts: [{ text: p.mensaje }] }], generationConfig: p.gen || { temperature: 0 } }),
  });
  let r = await llamar();
  if (r.status === 404) { MODELO = await elegirModelo(clave); r = await llamar(); }
  return r;
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
  if (req.method === 'GET') return json({ servidor: true, clave: !!clave, modelo: MODELO, proveedor: 'Gemini' });
  if (req.method !== 'POST') return json({ error: 'metodo', mensaje: 'Usa POST.' }, 405);
  if (!clave) return json({ error: 'sin_clave', mensaje: 'Servidor sin clave: usa el modo manual o el de demostración.' }, 503);
  let e; try { e = await req.json(); } catch { return json({ error: 'entrada', mensaje: 'La solicitud no es JSON válido.' }, 400); }
  const p = armar(e.paso, e);
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
    return json({ error: 'red', mensaje: `No se pudo contactar al proveedor de IA: ${err.message}` }, 502);
  }
};
