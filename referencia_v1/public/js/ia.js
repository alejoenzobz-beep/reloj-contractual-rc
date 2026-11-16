// Conector de IA de doble modo.
// · En vivo: llamada directa a la API de Claude desde el navegador con la clave del usuario
//   (la clave se guarda solo en este navegador; nunca se envía a la base de datos).
// · Manual: la app arma la instrucción; el usuario la pega en su proyecto de Claude y pega la respuesta.
import { preferencia } from './almacen.js';

export const MODELOS = [
  { id: 'claude-opus-5-5', nombre: 'Claude Opus 5.5 (recomendado)' },
  { id: 'claude-sonnet-5-5', nombre: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', nombre: 'Claude Haiku 5.5' },
];

export function ajustes() {
  return {
    modo: preferencia('ia_modo') || 'manual',
    modelo: preferencia('ia_modelo') || 'claude-opus-5-5',
    clave: preferencia('ia_clave') || '',
  };
}
export function guardarAjustes(a) {
  if (a.modo) preferencia('ia_modo', a.modo);
  if (a.modelo) preferencia('ia_modelo', a.modelo);
  if (a.clave !== undefined) preferencia('ia_clave', a.clave);
}

let sdk = null;
async function cliente(clave) {
  if (!sdk) sdk = (await import('https://esm.sh/@anthropic-ai/sdk@1.3.0')).default;
  return new sdk({ apiKey: clave, dangerouslyAllowBrowser: true });
}

// Devuelve { texto, modelo, segundos }. Lanza Error con mensaje en español si falla.
export async function llamarClaude(sistema, mensaje) {
  const { modelo, clave } = ajustes();
  if (!clave) throw new Error('Falta la clave de API. Ingrésela en «Ajustes de IA» o use el modo manual.');
  const c = await cliente(clave);
  const t0 = performance.now();
  const params = {
    model: modelo,
    max_tokens: 16000,
    system: sistema,
    messages: [{ role: 'user', content: mensaje }],
    output_config: { effort: 'medium' },
  };
  // Respaldo del servidor ante rechazos del clasificador de seguridad (modelos Opus y Sonnet).
  if (modelo !== 'claude-haiku-5-5') { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }
  let r;
  try {
    r = await c.beta.messages.create(params);
  } catch (e) {
    const s = e?.status;
    if (s === 401) throw new Error('La clave de API no es válida (401).');
    if (s === 429) throw new Error('Límite de uso alcanzado (429). Espere un momento o use el modo manual.');
    if (s >= 500) throw new Error(`El servicio de Claude no respondió (${s}). Reintente o use el modo manual.`);
    throw new Error(`No se pudo llamar a Claude: ${e?.message || e}`);
  }
  if (r.stop_reason === 'refusal') throw new Error('El modelo declinó la solicitud. Revise el contenido o use el modo manual.');
  const texto = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if (r.stop_reason === 'max_tokens') console.warn('[ia] respuesta truncada por max_tokens');
  return { texto, modelo: r.model, segundos: (performance.now() - t0) / 1000 };
}

// Texto completo para pegar en un proyecto de Claude (modo manual).
export function paqueteManual(sistema, mensaje) {
  return `${sistema}\n\n---\n\n${mensaje}`;
}
