// Aviso por Telegram. Requiere TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en las variables de entorno de Netlify.
// El mensaje lo arma el servidor con campos acotados: no reenvía texto libre del navegador.
const BASE = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
const LIMITE = 20, usos = new Map();
const json = (c, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const campo = (v, max) => String(v ?? '').replace(/[<>&]/g, '').slice(0, max);

export default async (req, context) => {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (req.method === 'GET') return json({ configurado: !!(token && chat) });
  if (req.method !== 'POST') return json({ error: 'metodo', mensaje: 'Usa POST.' }, 405);
  if (!token || !chat) return json({ error: 'sin_configurar', mensaje: 'Telegram no está configurado: faltan TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en Netlify.' }, 503);
  const ip = context?.ip || 'local', ahora = Date.now(), v = (usos.get(ip) || []).filter(t => ahora - t < 3600e3);
  if (v.length >= LIMITE) return json({ error: 'limite', mensaje: `Se alcanzó el límite de ${LIMITE} avisos por hora.` }, 429);
  v.push(ahora); usos.set(ip, v);
  let e; try { e = await req.json(); } catch { return json({ error: 'entrada', mensaje: 'La solicitud no es JSON válido.' }, 400); }
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(e.fecha_limite || '') || !e.documento) return json({ error: 'entrada', mensaje: 'Faltan el documento o la fecha límite.' }, 400);
  const texto = [`⏰ Reloj Contractual · ${campo(e.proyecto, 80)}`, `${campo(e.documento, 40)} · ${campo(e.elemento, 80)}`, campo(e.cambio, 300),
    `Fecha límite para notificar: ${e.fecha_limite} (${campo(e.dias, 30)})`, campo(e.estado, 80), '(Datos de demostración)'].filter(Boolean).join('\n');
  try {
    const r = await fetch(`${BASE}/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: texto, disable_web_page_preview: true }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) return json({ error: 'telegram', mensaje: `Telegram respondió ${r.status}: ${d.description || 'sin detalle'}` }, 502);
    return json({ ok: true });
  } catch (err) { return json({ error: 'red', mensaje: `No se pudo contactar a Telegram: ${err.message}` }, 502); }
};
