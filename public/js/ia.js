// Capa de IA: el modelo solo lee y propone. Toda respuesta pasa por parsearI1 / parsearI2 (nucleo.js).
// Modos: demostración (respuestas registradas o preparadas), servidor (Gemini vía Netlify Function) y manual.
import * as N from './nucleo.js';
import { HERRAMIENTAS } from './herramientas.js';

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
export const ETIQUETA = { demo: 'IA: respuestas registradas', servidor: 'IA: Gemini (en vivo)', manual: 'IA: manual' };
let modo = 'demo';
try { modo = sessionStorage.getItem('rc-ia-modo') || 'demo'; } catch { }
export const modoIA = () => modo;
export function fijarModo(m) { modo = m; try { sessionStorage.setItem('rc-ia-modo', m); } catch { } }

export class SinRespuesta extends Error { constructor(msg, codigo) { super(msg); this.codigo = codigo; } }

// ---------- clave propia (solo en esta pestaña) ----------
export const MODELO_DIRECTO = 'gemini-2.5-flash';
export const claveUsuario = () => { try { return sessionStorage.getItem('rc-gemini-clave') || ''; } catch { return ''; } };
export function fijarClave(k) { try { if (k) sessionStorage.setItem('rc-gemini-clave', k.trim()); else sessionStorage.removeItem('rc-gemini-clave'); } catch { } }

// Estado del servidor: { servidor, clave, modelo } o { servidor:false, motivo }
export async function estadoServidor() {
  try {
    const r = await fetch('/.netlify/functions/ia', { headers: { accept: 'application/json' } });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return { servidor: false, motivo: 'La app se abrió sin Netlify Functions (por ejemplo, con un servidor estático).' };
    return await r.json();
  } catch { return { servidor: false, motivo: 'Sin conexión con el servidor.' }; }
}

async function llamarServidor(cuerpo) {
  let r;
  try { r = await fetch('/.netlify/functions/ia', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }); }
  catch { throw new SinRespuesta('Sin conexión con el servidor de IA. Revisa tu red o usa el modo manual o el de demostración.', 'red'); }
  const tipo = r.headers.get('content-type') || '';
  if (!tipo.includes('json')) throw new SinRespuesta('No se encontró el servidor de IA: la app se abrió sin Netlify Functions. Usa el modo manual o el de demostración.', 'sin_servidor');
  const d = await r.json();
  if (d.error === 'sin_clave') throw new SinRespuesta('Servidor sin clave: usa el modo manual o el de demostración, o pega tu propia clave en Ajustes.', 'sin_clave');
  if (!r.ok) throw new SinRespuesta(d.mensaje || `El servidor respondió ${r.status}.`, d.error || 'servidor');
  return { texto: d.texto, origen: `Respuesta de Gemini en vivo (${d.modelo}, vía servidor), pasada por el validador de citas.` };
}

// Llamada directa con la clave que pegó el usuario (se guarda solo en sessionStorage).
async function llamarDirecto(sistema, mensaje) {
  let r;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO_DIRECTO}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': claveUsuario() },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts: [{ text: mensaje }] }], generationConfig: { temperature: 0 } }),
    });
  } catch { throw new SinRespuesta('No se pudo contactar a Gemini desde el navegador. Revisa tu red.', 'red'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new SinRespuesta(`Gemini respondió ${r.status}: ${d?.error?.message || 'sin detalle'}. Revisa tu clave en Ajustes.`, 'gemini');
  const t = (d.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('').trim();
  if (!t) throw new SinRespuesta('Gemini devolvió una respuesta vacía.', 'vacia');
  return { texto: t, origen: `Respuesta de Gemini en vivo (${MODELO_DIRECTO}, con tu clave), pasada por el validador de citas.` };
}

const docEnvio = d => ({ doc_id: d.doc_id, tipo: d.tipo, titulo: d.titulo, especialidad: d.especialidad, revision: d.revision, revision_anterior: d.revision_anterior, texto: d.texto, texto_anterior: d.texto_anterior || '' });
const hechosEnvio = hs => hs.map(h => ({ id: h.id, cambio: h.cambio, ubicacion: h.ubicacion, especialidad: h.especialidad, elemento: h.elemento }));

// Paso I1 (detección) para un documento. Devuelve { texto, origen } o { manual: true, prompt }.
export async function detectar(doc) {
  if (modo === 'demo') {
    const d = demoPara(doc);
    if (!d) throw new SinRespuesta('No hay respuesta registrada para este texto. Para analizar documentos propios, cambia a «Gemini (en vivo)» o «Manual» en Ajustes.', 'sin_registro');
    return { texto: d.i1, origen: d.nota, demo: d };
  }
  if (modo === 'manual') return { manual: true, prompt: promptI1(doc) };
  if (claveUsuario()) return llamarDirecto(I1(), N.mensajeI1([doc]));
  return llamarServidor({ paso: 'I1', doc: docEnvio(doc) });
}

// Paso I2 (vínculo a partida). Devuelve { texto, origen }, { manual: true, prompt } o null.
export async function vincular(doc, hechos, partidas, demo) {
  if (modo === 'demo') return demo?.i2 ? { texto: demo.i2, origen: demo.nota } : null;
  const ps = partidas.map(p => ({ codigo: p.codigo, desc: p.desc, und: p.und, esp: p.esp }));
  if (modo === 'manual') return { manual: true, prompt: promptI2(hechosEnvio(hechos), ps) };
  if (claveUsuario()) return llamarDirecto(I2(), N.mensajeI2(hechosEnvio(hechos), ps));
  return llamarServidor({ paso: 'I2', hechos: hechosEnvio(hechos), partidas: ps });
}

// Herramientas de redacción (resumir, traducir, revisar). Devuelve { texto, origen } o { manual: true, prompt }.
export async function herramienta(clave, texto) {
  const h = HERRAMIENTAS[clave];
  if (modo === 'demo') throw new SinRespuesta('demo', 'demo');
  if (modo === 'manual') return { manual: true, prompt: `${h.sistema}\n\n---\n\n${texto}` };
  if (claveUsuario()) return llamarDirecto(h.sistema, texto);
  return llamarServidor({ paso: 'H', herramienta: clave, texto });
}
