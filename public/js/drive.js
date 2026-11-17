// Google Drive: elegir revisiones con Google Picker y guardar la carta. Se activa solo si el servidor entrega
// GOOGLE_CLIENT_ID y GOOGLE_API_KEY (ver netlify/functions/config.mjs). Alcance mínimo: drive.file.
let cfg = null, token = null, cargado = null;
const script = src => new Promise((ok, mal) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar Google.')); document.head.append(s); });

export async function iniciar() {
  try { const r = await fetch('/.netlify/functions/config'); if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return null; cfg = (await r.json()).drive; } catch { cfg = null; }
  return cfg;
}
export const activo = () => !!cfg;
async function preparar() {
  if (!cfg) throw new Error('Google Drive no está configurado: faltan GOOGLE_CLIENT_ID y GOOGLE_API_KEY en Netlify.');
  cargado ||= Promise.all([script('https://apis.google.com/js/api.js'), script('https://accounts.google.com/gsi/client')]).then(() => new Promise(ok => window.gapi.load('picker', ok)));
  await cargado;
  if (token) return token;
  return new Promise((ok, mal) => {
    const cliente = window.google.accounts.oauth2.initTokenClient({ client_id: cfg.clientId, scope: 'https://www.googleapis.com/auth/drive.file', callback: r => r.error ? mal(new Error(`Google no autorizó el acceso: ${r.error}`)) : ok(token = r.access_token) });
    cliente.requestAccessToken({ prompt: '' });
  });
}
// Abre el selector y devuelve los archivos elegidos como File (descargados con el token del usuario).
export async function elegir({ mime = 'application/pdf', max = 2 } = {}) {
  const t = await preparar();
  const ids = await new Promise((ok, mal) => {
    const P = window.google.picker;
    const vista = new P.DocsView(P.ViewId.DOCS).setMimeTypes(mime).setIncludeFolders(true);
    const b = new P.PickerBuilder().addView(vista).enableFeature(P.Feature.MULTISELECT_ENABLED).setOAuthToken(t).setDeveloperKey(cfg.apiKey).setLocale('es').setTitle(`Elige hasta ${max} revisiones`)
      .setCallback(d => { if (d.action === P.Action.PICKED) ok(d.docs.slice(0, max)); else if (d.action === P.Action.CANCEL) mal(new Error('Selección cancelada.')); });
    if (cfg.appId) b.setAppId(cfg.appId);
    b.build().setVisible(true);
  });
  return Promise.all(ids.map(async d => {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(d.id)}?alt=media`, { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) throw new Error(`No se pudo descargar «${d.name}» de Drive (${r.status}).`);
    return new File([await r.blob()], d.name, { type: d.mimeType });
  }));
}
// Sube un archivo a Drive (carpeta raíz del usuario) y devuelve { id, name, webViewLink }.
export async function subir(blob, nombre) {
  const t = await preparar(), lim = 'rc' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: nombre, mimeType: blob.type });
  const cuerpo = new Blob([`--${lim}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${lim}\r\nContent-Type: ${blob.type}\r\n\r\n`, blob, `\r\n--${lim}--`]);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'content-type': `multipart/related; boundary=${lim}` }, body: cuerpo });
  if (!r.ok) throw new Error(`Google Drive respondió ${r.status} al guardar el archivo.`);
  return r.json();
}
