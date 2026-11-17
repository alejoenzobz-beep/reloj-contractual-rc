// Funciones del servidor (Netlify) contra APIs simuladas: sin claves reales y sin red externa.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let respuesta = { text: 'OK' }, peticiones = [];
const srv = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
  peticiones.push(q.method + ' ' + q.url); s.setHeader('content-type', 'application/json');
  if (q.url.startsWith('/v1beta/models?')) return s.end(JSON.stringify({ models: [{ name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] }] }));
  if (q.url.includes('modelo-retirado')) { s.statusCode = 404; return s.end('{"error":{"message":"not found"}}'); }
  if (q.url.includes('/sendMessage')) return s.end('{"ok":true}');
  s.end(JSON.stringify({ candidates: [{ content: { parts: [respuesta] } }] })); }); });
await new Promise(r => srv.listen(0, r));
const base = `http://localhost:${srv.address().port}`;
test.after(() => srv.close());
const post = (f, b) => f(new Request('http://x/', { method: 'POST', body: JSON.stringify(b) }), { ip: String(Math.random()) });

test('IA sin clave: 503 «sin_clave»', async () => {
  delete process.env.GEMINI_API_KEY;
  const { default: f } = await import('../netlify/functions/ia.mjs?sin');
  const r = await post(f, { paso: 'P' }); assert.equal(r.status, 503); assert.equal((await r.json()).error, 'sin_clave');
});
test('IA con clave: detección, rechazo de prompts libres, chat con acción validada y respaldo de modelo', async () => {
  Object.assign(process.env, { GEMINI_API_KEY: 'falsa', GEMINI_API_BASE: `${base}/v1beta`, GEMINI_MODEL: 'modelo-retirado' });
  const { default: f } = await import('../netlify/functions/ia.mjs?con');
  let r = await post(f, { paso: 'I1', doc: { doc_id: 'E-301', tipo: 'Lámina', texto: 'B', texto_anterior: 'A' } });
  assert.equal(r.status, 200); assert.equal((await r.json()).modelo, 'gemini-2.0-flash', 'si el modelo da 404, elige uno disponible con ListModels');
  assert.ok(peticiones.some(p => p.startsWith('GET /v1beta/models?')));
  r = await post(f, { paso: 'libre', prompt: 'hola' }); assert.equal(r.status, 400);
  respuesta = { text: '{"texto":"Vence el 16/10/2026","accion":"ir:http://malo"}' };
  r = await post(f, { paso: 'C', pregunta: '¿Plazo?', pantalla: 'Inicio', contexto: JSON.stringify({ cambios: [{ id: 'ALR-C001' }] }) });
  const j = await r.json(); assert.equal(j.texto, 'Vence el 16/10/2026'); assert.equal(j.accion, null, 'acciones fuera de la lista se descartan');
  r = await post(f, { paso: 'C', pregunta: 'x'.repeat(601), pantalla: 'Inicio', contexto: '{}' }); assert.equal(r.status, 400);
});
test('Telegram: desactivado sin credenciales y mensaje armado en el servidor', async () => {
  delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID;
  const { default: f } = await import('../netlify/functions/telegram.mjs?sin');
  assert.equal((await (await f(new Request('http://x/'), {})).json()).configurado, false);
  Object.assign(process.env, { TELEGRAM_BOT_TOKEN: 'falso', TELEGRAM_CHAT_ID: '1', TELEGRAM_API_BASE: base });
  const { default: g } = await import('../netlify/functions/telegram.mjs?con');
  const ok = await post(g, { documento: 'E-301', elemento: 'Viga V-1', fecha_limite: '16/10/2026' }); assert.equal(ok.status, 200);
  const mal = await post(g, { documento: 'E-301', fecha_limite: 'mañana' }); assert.equal(mal.status, 400);
});
