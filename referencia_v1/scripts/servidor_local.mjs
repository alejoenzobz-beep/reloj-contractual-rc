// Servidor estático mínimo para probar la app sin Firebase (modo local): node scripts/servidor_local.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css' };
const puerto = Number(process.env.PORT || 5055);
createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const archivo = join(raiz, ruta === '/' ? 'index.html' : ruta);
  if (!archivo.startsWith(raiz)) { res.writeHead(403); return res.end(); }
  try { const b = await readFile(archivo); res.writeHead(200, { 'Content-Type': tipos[extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(b); }
  catch { res.writeHead(404); res.end('No encontrado'); }
}).listen(puerto, () => console.log(`Reloj Contractual en http://localhost:${puerto}`));
