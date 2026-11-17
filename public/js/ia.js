// Capa de IA: el modelo solo lee y propone. Toda respuesta pasa por parsearI1 / parsearI2 (nucleo.js).
// Modos: demostración (respuestas registradas o preparadas), servidor (Gemini vía Netlify Function) y manual.
import * as N from './nucleo.js';
import { HERRAMIENTAS } from './herramientas.js';
import { SISTEMA_CHAT, GEN_CHAT, mensajeChat, leerSalidaChat } from './asistente_ia.js';

export const I1 = () => N.INSTRUCCIONES.I1[N.VERSION_VIGENTE.I1].sistema;
export const I2 = () => N.INSTRUCCIONES.I2[N.VERSION_VIGENTE.I2].sistema;
export const promptI1 = doc => `${I1()}\n\n---\n\n${N.mensajeI1([doc])}`;
export const promptI2 = (hechos, partidas) => `${I2()}\n\n---\n\n${N.mensajeI2(hechos, partidas)}`;

// ---------- respuestas para el modo demostración ----------
// origen: 'preparada' = escrita para el ejemplo de la lámina E-301; 'registrada' = respuesta real guardada en la prueba del 16/11/2026.
export const DEMO = [
  {
    clave: 'E-301', origen: 'preparada',
    nota: 'Respuesta preparada para la demostración con la lámina E-301 (no generada en vivo).',
    i1: `E-301 | 1 | La viga V-1 aumenta su peralte de 0,60 m a 0,70 m (sección 0,30 × 0,70 m). Aumentan el concreto y el encofrado de la viga. | Planta de vigas del nivel típico, eje A entre 1 y 2 | Estructuras | Viga V-1 | SECCIÓN V-1 · b × h = 0,30 × 0,70 m
E-301 | 2 | El acero inferior de la viga V-3 pasa de 3 Ø 5/8" a 4 Ø 3/4". Aumenta el peso de acero de la viga. | Cuadro de vigas, nivel típico, eje C | Estructuras | Viga V-3 | V-3 · 0,30 × 0,60 · 3 Ø 5/8" · 4 Ø 3/4" · Ø 3/8" @ 0,15
E-301 | 3 | El concreto de todas las vigas del nivel típico pasa de f'c = 280 kg/cm² a f'c = 350 kg/cm². La partida contractual es de 280 kg/cm². | Notas generales, vigas del nivel típico | Estructuras | Concreto de vigas | NOTA 2: CONCRETO EN VIGAS f'c = 350 kg/cm².`,
    i2: `H1 | 03.01.03 | Concreto f'c = 280 kg/cm² en vigas | Vaciado de concreto en vigas | ✓ | ✓ | ✓ | ✓ | Alta | El mayor peralte de V-1 aumenta el volumen de concreto en vigas; también varía el encofrado de vigas (03.02.02). | —
H2 | 03.03.01 | Acero corrugado fy = 4200 kg/cm² en vigas | Habilitación y colocación de acero en vigas | ✓ | ✓ | ✓ | ✓ | Alta | Cambia la cantidad y el diámetro del acero inferior de V-3; la partida de acero en vigas aplica sin cambio de unidad. | —
H3 | 03.01.03 | Concreto f'c = 280 kg/cm² en vigas | Vaciado de concreto en vigas | ✓ | ✓ | ✓ | ✗ | Media | La partida es de concreto en vigas, pero con f'c = 280 kg/cm²; el concreto de 350 kg/cm² no tiene precio en el presupuesto y requiere precio nuevo. | Sin alternativa en la lista`,
  },
  {
    clave: 'nota', origen: 'registrada', titulo: 'Cambio dentro de una nota', tipo: 'Lámina',
    nota: 'Respuesta registrada de la IA en la prueba con documentos nuevos (16/11/2026).',
    anterior: "CUADRO DE REVISIONES: Rev. B — Emisión para construcción.\nLOSAS MACIZAS: paño E–F/5–6 e = 0,20 m · paño F–G/5–6 e = 0,20 m.\nNOTA 1: Concreto f'c = 210 kg/cm². NOTA 2: Recubrimiento inferior 2,5 cm. NOTA 3: Ver detalle de pases en lámina E-262.",
    actual: "CUADRO DE REVISIONES: Rev. C — Se actualiza la numeración de notas y la referencia a la lámina de pases.\nLOSAS MACIZAS: paño E–F/5–6 e = 0,20 m · paño F–G/5–6 e = 0,20 m.\nNOTA 1: Concreto f'c = 210 kg/cm². NOTA 2: Recubrimiento inferior 2,5 cm. NOTA 3: Ver detalle de pases en lámina E-263.\nNOTA 5: En el paño E–F/5–6 del nivel 12, por la carga del nuevo tanque elevado, la losa se ejecuta con e = 0,25 m.",
    i1: "DOC-1 | 1 | La losa maciza del paño E–F/5–6 en el nivel 12 sube de 0,20 m a 0,25 m de espesor por la carga del nuevo tanque elevado. Aumentan el concreto y el encofrado de borde, y hay que revisar el acero. | Nivel 12, paño E–F/5–6 | Estructuras | Losa maciza paño E–F/5–6 | En el paño E–F/5–6 del nivel 12, por la carga del nuevo tanque elevado, la losa se ejecuta con e = 0,25 m.",
  },
  {
    clave: 'carta', origen: 'registrada', titulo: 'Instrucción al final de una carta', tipo: 'Carta',
    nota: 'Respuesta registrada de la IA en la prueba con documentos nuevos (16/11/2026).',
    anterior: '',
    actual: 'Lima, 6 de noviembre de 2026. Señores EL CONTRATISTA. Asunto: Visita al departamento modelo del piso 12.\nAgradecemos la coordinación de la visita del 5 de noviembre y la limpieza de las áreas comunes.\nEl equipo comercial quedó conforme con la iluminación y la vista desde la terraza.\nRecordamos que el próximo comité de obra será el jueves a las 9:00 en la caseta.\nPor último, les pedimos que en los dormitorios del piso 12 el piso laminado se reemplace por porcelanato de 60 × 60 cm, igual al de la sala.\nAtentamente, La Propietaria.',
    i1: 'DOC-1 | 1 | La propietaria pide cambiar el piso laminado de 8 mm de los dormitorios del piso 12 por porcelanato de 60 × 60 cm, igual al de la sala. Es un cambio de especificación por carta que hay que formalizar como adicional. | Piso 12, dormitorios | Arquitectura | Piso de dormitorios | en los dormitorios del piso 12 el piso laminado se reemplace por porcelanato de 60 × 60 cm, igual al de la sala.',
  },
  {
    clave: 'sin', origen: 'registrada', titulo: 'Solo cambia el rótulo', tipo: 'Lámina',
    nota: 'Respuesta registrada de la IA en la prueba con documentos nuevos (16/11/2026).',
    anterior: 'CUADRO DE REVISIONES: Rev. C — Emisión para construcción.\nACABADOS: dormitorios piso laminado 8 mm · sala-comedor porcelanato 60 × 60 cm.\nTABIQUES: drywall simple e = 0,10 m entre dormitorios.',
    actual: 'CUADRO DE REVISIONES: Rev. D — Cambio de formato del rótulo al estándar del cliente y renumeración de la lámina (antes A-33).\nACABADOS: dormitorios piso laminado 8 mm · sala-comedor porcelanato 60 × 60 cm.\nTABIQUES: drywall simple e = 0,10 m entre dormitorios.',
    i1: 'DOC-1 | 1 | SIN CAMBIOS | Planta típica | Arquitectura | Rótulo | Cambio de formato del rótulo al estándar del cliente y renumeración de la lámina (antes A-33).',
  },
];

const mismo = (a, b) => N.normalizar(a) === N.normalizar(b);
// Busca una respuesta de demostración para este documento (por texto exacto: si se edita, ya no aplica).
export function demoPara(doc) {
  return DEMO.find(d => d.clave === doc.demo_clave && (d.actual == null || mismo(d.actual, doc.texto)))
    || DEMO.find(d => d.actual != null && mismo(d.actual, doc.texto) && mismo(d.anterior || '', doc.texto_anterior || ''));
}

// ---------- modo activo ----------
// servidor = «IA registrada» (la de la app, en su servidor; por defecto Gemini) · clave = «Mi propia clave API» · manual · demo
export const ETIQUETA = { servidor: 'IA registrada', clave: 'IA: mi clave', manual: 'IA: manual', demo: 'IA: demostración' };
export const NOMBRE_MODO = { servidor: 'IA registrada (por defecto)', clave: 'Mi propia clave API', manual: 'Manual (copiar y pegar el prompt)', demo: 'Respuestas de demostración (sin IA en vivo)' };
let modo = 'demo', elegido = false;
try { const g = sessionStorage.getItem('rc-ia-modo'); if (g && NOMBRE_MODO[g]) { modo = g; elegido = true; } } catch { }
export const modoIA = () => modo;
export function fijarModo(m) { modo = m; elegido = true; try { sessionStorage.setItem('rc-ia-modo', m); } catch { } }
export let estadoInicial = null;
// Si la persona no eligió un modo y el servidor tiene clave, arranca con la IA registrada.
// El verde y el «Disponible» reflejan la última prueba real (una llamada corta), no solo que exista la clave.
export async function iniciarModo() {
  estadoInicial = await estadoServidor();
  if (estadoInicial.servidor && estadoInicial.clave) estadoInicial.prueba = await probarConexion('servidor');
  if (!elegido) modo = estadoInicial.prueba?.ok ? 'servidor' : claveUsuario() ? 'clave' : 'demo';
  return estadoInicial;
}
export const servidorResponde = () => !!estadoInicial?.prueba?.ok;

export class SinRespuesta extends Error { constructor(msg, codigo) { super(msg); this.codigo = codigo; } }

// ---------- clave propia de cualquier proveedor compatible (solo en esta pestaña) ----------
export const PROVEEDORES = {
  gemini: { n: 'Google Gemini (AI Studio)', modelo: 'gemini-2.5-flash', base: 'https://generativelanguage.googleapis.com/v1beta' },
  openai: { n: 'Compatible con OpenAI (OpenAI, Groq, OpenRouter, Mistral, DeepSeek…)', modelo: 'gpt-4o-mini', base: 'https://api.openai.com/v1' },
  anthropic: { n: 'Anthropic (Claude)', modelo: 'claude-haiku-5-5', base: 'https://api.anthropic.com/v1' },
};
const leerSS = (k, d = '') => { try { return sessionStorage.getItem(k) || d; } catch { return d; } };
const fijarSS = (k, v) => { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch { } };
export const claveUsuario = () => leerSS('rc-ia-clave') || leerSS('rc-gemini-clave');
export const configClave = () => { const prov = leerSS('rc-ia-prov', 'gemini'); const P = PROVEEDORES[prov] || PROVEEDORES.gemini; return { prov, modelo: leerSS('rc-ia-modelo') || P.modelo, base: (leerSS('rc-ia-base') || P.base).replace(/\/+$/, '') }; };
export function fijarClave(k, cfg = {}) { fijarSS('rc-ia-clave', k?.trim()); fijarSS('rc-gemini-clave', ''); if (cfg.prov) fijarSS('rc-ia-prov', cfg.prov); fijarSS('rc-ia-modelo', cfg.modelo?.trim()); fijarSS('rc-ia-base', cfg.base?.trim()); }
const nombreProv = () => { const c = configClave(); return `${c.prov === 'openai' ? new URL(c.base).hostname : PROVEEDORES[c.prov].n.split(' (')[0]} · ${c.modelo}`; };

// Estado del servidor: { servidor, clave, modelo } o { servidor:false, motivo }
export async function estadoServidor() {
  try {
    const r = await fetch('/.netlify/functions/ia', { headers: { accept: 'application/json' } });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return { servidor: false, motivo: 'La app se abrió sin Netlify Functions (por ejemplo, con un servidor estático).' };
    return await r.json();
  } catch { return { servidor: false, motivo: 'Sin conexión con el servidor.' }; }
}

async function llamarServidor(cuerpo, ms = 20000) {
  let r;
  try { r = await fetch('/.netlify/functions/ia', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(ms) }); }
  catch (e) { if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new SinRespuesta('La IA tardó demasiado en responder.', 'tiempo'); throw new SinRespuesta('Sin conexión con el servidor de IA. Revisa tu red.', 'red'); }
  if ([502, 503, 504].includes(r.status) && !(r.headers.get('content-type') || '').includes('json')) throw new SinRespuesta('La IA tardó demasiado en responder.', 'tiempo');
  const tipo = r.headers.get('content-type') || '';
  if (!tipo.includes('json')) throw new SinRespuesta('No se encontró el servidor de IA: la app se abrió sin Netlify Functions. Usa tu propia clave, el modo manual o el de demostración.', 'sin_servidor');
  const d = await r.json().catch(() => ({}));
  if (r.status === 504 || d.error === 'tiempo' || (r.status === 502 && d.errorType)) throw new SinRespuesta('La IA tardó demasiado en responder.', 'tiempo');
  if (d.error === 'sin_clave') throw new SinRespuesta('El servidor no tiene clave de IA configurada: usa tu propia clave, el modo manual o el de demostración.', 'sin_clave');
  if (!r.ok) throw new SinRespuesta(d.mensaje || `El servidor respondió ${r.status}.`, d.error || 'servidor');
  return { texto: d.texto, accion: d.accion, modelo: d.modelo, ms: d.ms, origen: `Respuesta de la IA registrada (${d.modelo}, vía servidor), pasada por el validador de citas.` };
}

// Llamada directa desde el navegador con la clave del usuario (proveedor elegido en Ajustes).
async function llamarDirecto(sistema, mensaje, { json = false } = {}) {
  const c = configClave(), k = claveUsuario();
  if (!k) throw new SinRespuesta('No hay una clave guardada en esta pestaña. Pégala en Ajustes.', 'sin_clave');
  let url, opts, leer;
  if (c.prov === 'gemini') {
    url = `${c.base}/models/${encodeURIComponent(c.modelo)}:generateContent`;
    opts = { headers: { 'content-type': 'application/json', 'x-goog-api-key': k }, body: { systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts: [{ text: mensaje }] }], generationConfig: json ? GEN_CHAT : { temperature: 0 } } };
    leer = d => (d.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('');
  } else if (c.prov === 'anthropic') {
    url = `${c.base}/messages`;
    opts = { headers: { 'content-type': 'application/json', 'x-api-key': k, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: { model: c.modelo, max_tokens: 2048, temperature: 0, system: sistema, messages: [{ role: 'user', content: mensaje }] } };
    leer = d => (d.content || []).map(x => x.text || '').join('');
  } else {
    url = `${c.base}/chat/completions`;
    opts = { headers: { 'content-type': 'application/json', authorization: `Bearer ${k}` }, body: { model: c.modelo, temperature: 0, messages: [{ role: 'system', content: sistema }, { role: 'user', content: mensaje }] } };
    leer = d => d.choices?.[0]?.message?.content || '';
  }
  let r;
  try { r = await fetch(url, { method: 'POST', headers: opts.headers, body: JSON.stringify(opts.body) }); }
  catch { throw new SinRespuesta(`No se pudo contactar a ${new URL(url).hostname} desde el navegador (red o CORS). Revisa la dirección del proveedor o usa el modo manual.`, 'red'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new SinRespuesta(`${new URL(url).hostname} respondió ${r.status}: ${d?.error?.message || d?.error?.type || d?.message || 'sin detalle'}`, 'proveedor');
  const t = String(leer(d) || '').trim();
  if (!t) throw new SinRespuesta('El proveedor devolvió una respuesta vacía.', 'vacia');
  return { texto: t, origen: `Respuesta de tu IA (${nombreProv()}, con tu clave), pasada por el validador de citas.` };
}

// «Probar conexión»: llamada real y mínima; devuelve { ok, detalle } con el error real si falla.
export async function probarConexion(cual) {
  const t0 = performance.now();
  try {
    if (cual === 'clave') { const r = await llamarDirecto('Responde solo con la palabra OK.', 'Prueba de conexión.'); return { ok: true, detalle: `Respondió «${r.texto.slice(0, 40)}» en ${Math.round(performance.now() - t0)} ms (${nombreProv()}).` }; }
    const r = await llamarServidor({ paso: 'P' }, 15000); const res = { ok: true, ms: Math.round(performance.now() - t0), detalle: `Respondió «${String(r.texto).slice(0, 40)}» en ${Math.round(performance.now() - t0)} ms (modelo ${r.modelo}).` }; if (estadoInicial) estadoInicial.prueba = res; return res;
  } catch (e) { const res = { ok: false, detalle: e.message }; if (cual !== 'clave' && estadoInicial) estadoInicial.prueba = res; return res; }
}

const docEnvio = d => ({ doc_id: d.doc_id, tipo: d.tipo, titulo: d.titulo, especialidad: d.especialidad, revision: d.revision, revision_anterior: d.revision_anterior, texto: d.texto, texto_anterior: d.texto_anterior || '' });
const hechosEnvio = hs => hs.map(h => ({ id: h.id, cambio: h.cambio, ubicacion: h.ubicacion, especialidad: h.especialidad, elemento: h.elemento }));

// Paso I1 (detección) para un documento. Devuelve { texto, origen } o { manual: true, prompt }.
export async function detectar(doc) {
  if (modo === 'demo') {
    const d = demoPara(doc);
    if (!d) throw new SinRespuesta('No hay respuesta registrada para este texto. Para analizar documentos propios, elige «IA registrada», «Mi propia clave API» o «Manual» en Ajustes.', 'sin_registro');
    return { texto: d.i1, origen: d.nota, demo: d };
  }
  if (modo === 'manual') return { manual: true, prompt: promptI1(doc) };
  try { return await (modo === 'clave' ? llamarDirecto(I1(), N.mensajeI1([doc])) : llamarServidor({ paso: 'I1', doc: docEnvio(doc) })); }
  catch (e) { const d = demoPara(doc); if (d && e.codigo !== 'sin_clave') return { texto: d.i1, origen: `${e.codigo === 'tiempo' ? 'La IA tardó demasiado' : 'La IA en vivo no respondió'}; se usó la respuesta registrada. ${d.nota}`, demo: d, respaldo: true }; throw e; }
}

// Paso I2 (vínculo a partida). Devuelve { texto, origen }, { manual: true, prompt } o null.
export async function vincular(doc, hechos, partidas, demo) {
  if (modo === 'demo') return demo?.i2 ? { texto: demo.i2, origen: demo.nota } : null;
  const ps = partidas.map(p => ({ codigo: p.codigo, desc: p.desc, und: p.und, esp: p.esp }));
  if (modo === 'manual') return { manual: true, prompt: promptI2(hechosEnvio(hechos), ps) };
  // Si la detección ya pasó a la respuesta registrada, la partida también (sin otra llamada lenta).
  if (demo?.i2) return { texto: demo.i2, origen: demo.nota };
  try { return await (modo === 'clave' ? llamarDirecto(I2(), N.mensajeI2(hechosEnvio(hechos), ps)) : llamarServidor({ paso: 'I2', hechos: hechosEnvio(hechos), partidas: ps })); }
  catch (e) { if (demo?.i2) return { texto: demo.i2, origen: demo.nota }; throw e; }
}

// Herramientas de redacción (resumir, traducir, revisar). Devuelve { texto, origen } o { manual: true, prompt }.
export async function herramienta(clave, texto) {
  const h = HERRAMIENTAS[clave];
  if (modo === 'demo') throw new SinRespuesta('demo', 'demo');
  if (modo === 'manual') return { manual: true, prompt: `${h.sistema}\n\n---\n\n${texto}` };
  if (modo === 'clave') return llamarDirecto(h.sistema, texto);
  return llamarServidor({ paso: 'H', herramienta: clave, texto });
}

// Asistente conversacional: usa la IA en vivo (registrada o con tu clave). Envía la pregunta, la pantalla y un resumen
// del proyecto; nunca documentos del usuario.
export const chatEnVivo = () => modo === 'servidor' || modo === 'clave';
export async function chat({ pregunta, pantalla, contexto, historial, ids }) {
  if (!chatEnVivo()) throw new SinRespuesta('El asistente con IA usa la IA registrada o tu propia clave.', 'modo');
  if (modo === 'clave') {
    const r = await llamarDirecto(SISTEMA_CHAT, mensajeChat({ pregunta, pantalla, contexto, historial }), { json: true });
    return { ...leerSalidaChat(r.texto, ids), origen: `Tu IA (${nombreProv()})` };
  }
  const r = await llamarServidor({ paso: 'C', pregunta, pantalla, contexto, historial }, 12000);
  const accion = r.accion && (!ids || !r.accion.startsWith('ir:alerta-') || ids.has(r.accion.slice(10))) ? r.accion : null;
  return { texto: r.texto, accion, origen: `IA registrada (${r.modelo}, vía servidor)` };
}

// Etiqueta visible de origen para todo resultado de un modelo (o preparado para la demostración).
const CHIP = {
  vivo: ['vivo', 'IA en vivo'], registrada: ['reg', 'IA · respuesta guardada en la medición'], manual: ['man', 'IA · respuesta pegada (manual)'],
  preparada: ['prep', 'Demostración · respuesta preparada, sin IA'],
};
export const chipIA = t => { const [c, x] = CHIP[t] || CHIP.registrada; return `<span class="chip-ia ${c}">${x}</span>`; };
export const tipoOrigen = r => r?.demo ? (r.demo.origen === 'preparada' ? 'preparada' : 'registrada') : r?.manual ? 'manual' : 'vivo';
export const etiquetaModo = () => modo === 'clave' ? `IA: mi clave · ${nombreProv()}` : ETIQUETA[modo];
