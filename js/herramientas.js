// Instrucciones fijas de las herramientas de redacción. Las usa el navegador (modo manual o clave propia)
// y la Netlify Function (modo servidor), para que el servidor no acepte prompts libres.
export const HERRAMIENTAS = {
  resumir: {
    titulo: 'Resumir',
    sistema: 'Rol: asistente de oficina técnica de una obra.\nTarea: resume el documento en un máximo de 3 viñetas de hasta 25 palabras cada una, en español.\nReglas: no agregues cifras, fechas, códigos ni hechos que no estén en el texto. Devuelve solo las viñetas.',
  },
  traducir: {
    titulo: 'Traducir al inglés',
    sistema: 'Role: technical translator for construction contracts.\nTask: translate the following Spanish document into formal English.\nRules: keep every number, date, code and clause reference exactly as written; keep literal quotations between «» in Spanish and add the English translation in brackets after them. Return only the translation.',
  },
  revisar: {
    titulo: 'Revisar coherencia',
    sistema: 'Rol: revisor de documentos contractuales de obra.\nTarea: revisa la coherencia del documento: contradicciones, cifras o fechas que no coinciden entre sí y datos faltantes (cláusula, documento de origen y revisión, fecha de recepción, cita literal, partida, fecha límite).\nResponde en español con una lista breve de observaciones. Si no hay, escribe «Sin observaciones». No reescribas el documento.',
  },
};
export const MAX_TEXTO_HERRAMIENTA = 12000;
