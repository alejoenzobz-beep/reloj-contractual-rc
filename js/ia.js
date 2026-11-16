// Capa de IA: el modelo solo lee y propone. Toda respuesta pasa por parsearI1 / parsearI2 (nucleo.js).
// Modos: demostración (respuestas registradas o preparadas), servidor (Gemini vía Netlify Function) y manual.
import * as N from './nucleo.js';

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

// Paso I1 (detección) para un documento. Devuelve { texto, origen }.
export async function detectar(doc) {
  if (modo === 'demo') {
    const d = demoPara(doc);
    if (!d) throw new SinRespuesta('No hay respuesta registrada para este texto. Para analizar documentos propios, cambia a «Gemini (en vivo)» o «Manual» en Ajustes.', 'sin_registro');
    return { texto: d.i1, origen: d.nota, demo: d };
  }
  throw new SinRespuesta('Este modo de IA todavía no está disponible.', 'no_disponible');
}

// Paso I2 (vínculo a partida). Devuelve { texto, origen } o null si no hay respuesta.
export async function vincular(doc, hechos, partidas, demo) {
  if (modo === 'demo') {
    if (demo?.i2) return { texto: demo.i2, origen: demo.nota };
    return null;
  }
  return null;
}
