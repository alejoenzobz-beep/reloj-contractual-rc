// Configuración pública de integraciones. El ID de cliente OAuth y la clave de API de Google son públicos por diseño
// (se usan en el navegador), pero se cargan desde variables de entorno de Netlify para no fijarlos en el repositorio.
export default async () => {
  const id = process.env.GOOGLE_CLIENT_ID, key = process.env.GOOGLE_API_KEY;
  return new Response(JSON.stringify({ drive: id && key ? { clientId: id, apiKey: key, appId: process.env.GOOGLE_APP_ID || '' } : null }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
};
