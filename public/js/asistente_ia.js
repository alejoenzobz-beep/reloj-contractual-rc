// Asistente conversacional: instrucción fija, entrada acotada y acciones permitidas.
// Lo usan el navegador (clave propia) y la Netlify Function (modo servidor). La IA explica y guía;
// las fechas las calcula la app (nucleo.js) y llegan ya resueltas en el contexto.
export const MAX_PREGUNTA = 600, MAX_CONTEXTO = 6000, MAX_HISTORIAL = 6;

export const VISTAS_ACCION = ['inicio', 'bandeja', 'comparar', 'salidas', 'plazos', 'auditoria', 'calidad', 'ajustes'];

export const SISTEMA_CHAT = `Rol: asistente de la aplicación Reloj Contractual, un asistente de trazabilidad documental y contractual para obras de construcción.
Qué hace la app: compara dos revisiones de un documento del proyecto (lámina, especificación, carta o RFI), la IA propone qué cambios tienen impacto y la partida del presupuesto afectada, la app verifica que cada cita esté literal en el documento, calcula con una fórmula la fecha límite para notificar según la cláusula del contrato, y una persona decide (confirmar, corregir o descartar) antes de emitir la carta, el acta o el informe. Todo queda en un registro de auditoría sellado.
Pantallas: inicio, bandeja (cambios por plazo), comparar (revisión A frente a B), salidas (carta, acta, informe), plazos (parámetros del contrato), auditoria (registro sellado), calidad (cifras medidas y pruebas), ajustes (modo de IA).
Reglas:
1. Responde solo sobre esta app, los plazos y los documentos del contexto. Si te preguntan otra cosa, dilo en una frase y vuelve al tema.
2. Usa únicamente los datos del CONTEXTO. No calcules ni estimes fechas, plazos, montos ni metrados: copia las fechas y los días restantes tal como vienen en el contexto.
3. Si un dato no está en el contexto, dilo y sugiere la pantalla donde se obtiene.
4. Español, tono profesional y técnico, máximo 120 palabras. Sin jerga interna.
5. Puedes proponer una acción de navegación: "ir:<pantalla>" con una de las pantallas listadas, o "ir:alerta-<ID>" con un ID de cambio que aparezca en el contexto. Si no aplica, deja accion vacía.
Formato de salida: un objeto JSON {"texto": "...", "accion": "..."}.`;

// Acción válida o null (lista cerrada: nunca se ejecuta texto libre del modelo).
export function validarAccion(accion, idsValidos = null) {
  const a = String(accion || '').trim();
  if (!a.startsWith('ir:')) return null;
  const d = a.slice(3);
  if (VISTAS_ACCION.includes(d)) return a;
  const m = /^alerta-([A-Z0-9-]{3,20})$/i.exec(d);
  if (m && (!idsValidos || idsValidos.has(m[1].toUpperCase()))) return `ir:alerta-${m[1].toUpperCase()}`;
  return null;
}

export function mensajeChat({ pregunta, pantalla, contexto, historial = [] }) {
  const h = historial.slice(-MAX_HISTORIAL).map(x => `${x.rol === 'usuario' ? 'Usuario' : 'Asistente'}: ${String(x.texto).slice(0, MAX_PREGUNTA)}`).join('\n');
  return `CONTEXTO (datos de la app, en JSON):\n${contexto}\n\nPANTALLA ACTUAL: ${pantalla}\n${h ? `\nCONVERSACIÓN PREVIA:\n${h}\n` : ''}\nPREGUNTA: ${pregunta}`;
}

// Interpreta la salida del modelo: JSON {texto, accion} o texto plano como respaldo.
export function leerSalidaChat(crudo, idsValidos) {
  let t = String(crudo || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { const o = JSON.parse(t); if (o && typeof o.texto === 'string' && o.texto.trim()) return { texto: o.texto.trim().slice(0, 1500), accion: validarAccion(o.accion, idsValidos) }; } catch { }
  return { texto: t.slice(0, 1500), accion: null };
}

export const GEN_CHAT = {
  temperature: 0.2,
  responseMimeType: 'application/json',
  responseSchema: { type: 'OBJECT', properties: { texto: { type: 'STRING' }, accion: { type: 'STRING' } }, required: ['texto'] },
};
