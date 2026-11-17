// Comparar revisiones: detección determinista (diff de píxeles y de líneas) + propuesta de la IA verificada.
// La detección de diferencias no usa IA. La IA solo describe qué cambios tienen impacto y propone la partida;
// cada cita se verifica literalmente con parsearI1 y cada partida con parsearI2.
import * as N from './nucleo.js';
import * as IA from './ia.js';
import { laminaSVG, DOC_DEMO, W as WD, H as HD } from './lamina_demo.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const espera = ms => new Promise(r => setTimeout(r, reducido() ? 0 : ms));
export const UMBRAL_EVIDENTE = 0.001; // área modificada < 0,1 % de la lámina = no evidente a simple vista

// ---------- diff de líneas (LCS) ----------
export function diffLineas(a, b) {
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = []; let i = 0, j = 0, quita = [], pone = [];
  const flush = () => {
    // Empareja cada línea quitada con la nueva más parecida (palabras en común); el resto queda como nueva o eliminada.
    const pal = t => new Set(t.toLowerCase().split(/[^\p{L}\p{N}',-]+/u).filter(Boolean));
    const sim = (x, y) => { const A = pal(x), B = pal(y); let c = 0; A.forEach(w => { if (B.has(w)) c++; }); return c / Math.max(1, Math.max(A.size, B.size)); };
    const usada = new Set(), par = new Map();
    quita.forEach((q, x) => { let mejor = -1, mv = 0.3; pone.forEach((p, y) => { if (usada.has(y)) return; const v = sim(q.t, p.t); if (v > mv) { mv = v; mejor = y; } }); if (mejor >= 0) { usada.add(mejor); par.set(x, mejor); } });
    quita.forEach((q, x) => { const y = par.get(x); ops.push(y != null ? { tipo: 'cambio', a: q.t, b: pone[y].t, ia: q.i, ib: pone[y].i } : { tipo: 'quitada', a: q.t, b: null, ia: q.i, ib: null }); });
    pone.forEach((p, y) => { if (!usada.has(y)) ops.push({ tipo: 'agregada', a: null, b: p.t, ia: null, ib: p.i }); });
    quita = []; pone = [];
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) { flush(); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { quita.push({ t: a[i], i }); i++; } else { pone.push({ t: b[j], i: j }); j++; }
  }
  while (i < n) { quita.push({ t: a[i], i }); i++; } while (j < m) { pone.push({ t: b[j], i: j }); j++; }
  flush();
  return ops;
}
// Resalta palabras que cambian dentro de una línea.
export function marcarPalabras(antes, despues) {
  const a = String(antes || '').split(/(\s+)/), b = String(despues || '').split(/(\s+)/);
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0, A = '', B = '';
  while (i < n && j < m) {
    if (a[i] === b[j]) { A += esc(a[i]); B += esc(b[j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { A += /\S/.test(a[i]) ? `<del>${esc(a[i])}</del>` : a[i]; i++; }
    else { B += /\S/.test(b[j]) ? `<ins>${esc(b[j])}</ins>` : b[j]; j++; }
  }
  while (i < n) { A += /\S/.test(a[i]) ? `<del>${esc(a[i])}</del>` : a[i]; i++; }
  while (j < m) { B += /\S/.test(b[j]) ? `<ins>${esc(b[j])}</ins>` : b[j]; j++; }
  return { A, B };
}

// ---------- diff de píxeles: agrupa las diferencias en zonas ----------
export function difPixeles(dA, dB, W, H, { umbral = 40, celda = 6, dilata = 3 } = {}) {
  const cw = Math.ceil(W / celda), ch = Math.ceil(H / celda), cnt = new Uint32Array(cw * ch);
  let total = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 4;
    const d = Math.abs(dA[k] - dB[k]) + Math.abs(dA[k + 1] - dB[k + 1]) + Math.abs(dA[k + 2] - dB[k + 2]) + Math.abs(dA[k + 3] - dB[k + 3]);
    if (d > umbral * 3) { cnt[((y / celda) | 0) * cw + ((x / celda) | 0)]++; total++; }
  }
  const dil = new Uint8Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) if (cnt[cy * cw + cx])
    for (let yy = Math.max(0, cy - dilata); yy <= Math.min(ch - 1, cy + dilata); yy++) for (let xx = Math.max(0, cx - dilata); xx <= Math.min(cw - 1, cx + dilata); xx++) dil[yy * cw + xx] = 1;
  const vis = new Uint8Array(cw * ch), regiones = [];
  for (let s = 0; s < cw * ch; s++) {
    if (!dil[s] || vis[s]) continue;
    const pila = [s]; vis[s] = 1; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, px = 0;
    while (pila.length) {
      const c = pila.pop(), cx = c % cw, cy = (c / cw) | 0;
      if (cnt[c]) { px += cnt[c]; x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy); }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
        const v = ny * cw + nx; if (dil[v] && !vis[v]) { vis[v] = 1; pila.push(v); }
      }
    }
    if (px >= 4) regiones.push({ x: x0 * celda, y: y0 * celda, w: (x1 - x0 + 1) * celda, h: (y1 - y0 + 1) * celda, px, frac: px / (W * H) });
  }
  regiones.sort((p, q) => (p.y - q.y) || (p.x - q.x));
  return { regiones, total };
}

// ---------- utilidades de imagen ----------
const cargarImagen = src => new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('No se pudo leer la imagen.')); i.src = src; });
function lienzo(img, W, H) { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H); return c; }
const urlSVG = svg => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
function recorte(c, r, pad = 14) {
  const mw = Math.min(c.width, Math.max(r.w + 2 * pad, 260)), mh = Math.min(c.height, Math.max(r.h + 2 * pad, 110));
  const x = Math.max(0, Math.min(c.width - mw, r.x + r.w / 2 - mw / 2)), y = Math.max(0, Math.min(c.height - mh, r.y + r.h / 2 - mh / 2)), w = mw, h = mh;
  const o = document.createElement('canvas'); const k = Math.min(1, 320 / w); o.width = Math.max(1, w * k); o.height = Math.max(1, h * k);
  o.getContext('2d').drawImage(c, x, y, w, h, 0, 0, o.width, o.height); return o.toDataURL('image/png');
}
async function compararImagenes(srcA, srcB, maxW = 1400) {
  const [ia, ib] = await Promise.all([cargarImagen(srcA), cargarImagen(srcB)]);
  const k = Math.min(1, maxW / (ib.naturalWidth || WD));
  const W = Math.round((ib.naturalWidth || WD) * k), H = Math.round((ib.naturalHeight || HD) * k);
  if (!W || !H) throw new Error('La imagen está vacía.');
  const cA = lienzo(ia, W, H), cB = lienzo(ib, W, H);
  // El diff se hace sobre copias suavizadas: tolera el remuestreo y la compresión (misma lámina en otra resolución o JPEG).
  const suave = img => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.filter = 'blur(1.5px)'; g.drawImage(img, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
  const reescalado = ia.naturalWidth !== ib.naturalWidth || ia.naturalHeight !== ib.naturalHeight;
  const d = reescalado ? difPixeles(suave(ia), suave(ib), W, H, { umbral: 55 }) : difPixeles(cA.getContext('2d').getImageData(0, 0, W, H).data, cB.getContext('2d').getImageData(0, 0, W, H).data, W, H);
  // Con resoluciones distintas, las zonas de ruido (pocos píxeles y dispersos) se descartan.
  if (reescalado) d.regiones = d.regiones.filter(g => g.px >= Math.max(12, W * H * 0.00002) && g.px / (g.w * g.h) >= 0.01);
  return { ...d, W, H, cA, cB };
}

// Texto de un SVG, agrupado en líneas (misma línea base y cercanía horizontal), con sus cajas.
function lineasSVG(svg) {
  const div = document.createElement('div');
  div.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden';
  div.innerHTML = svg; document.body.append(div);
  const el = [...div.querySelectorAll('text')].map(t => { const b = t.getBBox(); return { t: t.textContent.trim(), base: Number(t.getAttribute('y')), x: b.x, y: b.y, w: b.width, h: b.height }; }).filter(e => e.t);
  div.remove();
  el.sort((p, q) => (p.base - q.base) || (p.x - q.x));
  const lineas = [];
  for (const e of el) {
    const u = lineas[lineas.length - 1], f = u?.cajas[u.cajas.length - 1];
    if (u && Math.abs(u.base - e.base) < 2 && e.x - (f.x + f.w) < 150) { u.partes.push(e.t); u.cajas.push(e); }
    else lineas.push({ base: e.base, partes: [e.t], cajas: [e] });
  }
  return lineas.map(l => ({ texto: l.partes.join(' · '), cajas: l.cajas }));
}

// ---------- PDF (pdf.js local) ----------
let pdfjs = null;
async function cargarPdfjs() {
  if (!pdfjs) { pdfjs = await import('../vendor/pdfjs/pdf.min.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href; }
  return pdfjs;
}
// ---------- OCR (tesseract.js local, español) ----------
let ocrWorker = null;
function cargarScript(src) { return new Promise((ok, mal) => { if (window.Tesseract) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el lector de texto (OCR).')); document.head.append(s); }); }
let ocrProgreso = () => { };
async function obtenerOCR() {
  if (ocrWorker) return ocrWorker;
  const base = new URL('../vendor/tesseract/', import.meta.url).href;
  await cargarScript(base + 'tesseract.min.js');
  ocrWorker = await window.Tesseract.createWorker('spa', 1, { workerPath: base + 'worker.min.js', corePath: base + 'core/', langPath: base + 'lang/', workerBlobURL: false, logger: m => { if (m.status === 'recognizing text') ocrProgreso(m.progress); } });
  return ocrWorker;
}
// Devuelve las líneas leídas con su caja (en coordenadas de la imagen recibida).
export async function ocr(imagen, alAvanzar = () => { }) {
  const w = await obtenerOCR(); ocrProgreso = alAvanzar;
  const { data } = await w.recognize(imagen);
  const lineas = (data.lines || []).map(l => ({ texto: l.text.replace(/\s+/g, ' ').trim(), caja: { x: l.bbox.x0, y: l.bbox.y0, w: l.bbox.x1 - l.bbox.x0, h: l.bbox.y1 - l.bbox.y0 } })).filter(l => l.texto.length > 1);
  return lineas.length ? lineas : data.text.split('\n').map(t => ({ texto: t.trim(), caja: null })).filter(l => l.texto.length > 1);
}
async function leerPDF(file, maxPag = 6, aviso = () => { }) {
  const lib = await cargarPdfjs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const paginas = [];
  for (let p = 1; p <= Math.min(pdf.numPages, maxPag); p++) {
    const pg = await pdf.getPage(p), tc = await pg.getTextContent();
    const items = tc.items.filter(i => i.str != null).map(i => ({ s: i.str, x: i.transform[4], y: Math.round(i.transform[5]), w: i.width }));
    items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    const lineas = [];
    for (const it of items) {
      const u = lineas[lineas.length - 1];
      if (u && Math.abs(u.y - it.y) <= 2) { u.t += (it.x - u.fin > 1.5 && !/\s$/.test(u.t) && !/^\s/.test(it.s) ? ' ' : '') + it.s; u.fin = it.x + it.w; }
      else lineas.push({ y: it.y, t: it.s, fin: it.x + it.w });
    }
    const sinTexto = !lineas.some(l => l.t.trim());
    const vp = pg.getViewport({ scale: sinTexto ? 2.2 : 1.4 }), c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: g, viewport: vp }).promise;
    let texto = lineas.map(l => l.t.replace(/\s+/g, ' ').trim()).filter(Boolean), conOcr = false;
    if (sinTexto) { aviso(`Página ${p} escaneada: leyendo el texto con OCR…`); texto = (await ocr(c, x => aviso(`Página ${p} escaneada: leyendo el texto con OCR (${Math.round(x * 100)} %)…`))).map(l => l.texto); conOcr = true; }
    paginas.push({ n: p, lineas: texto, img: c.toDataURL('image/png'), ocr: conOcr });
  }
  return { paginas, total: pdf.numPages };
}

// ---------- estado de la vista ----------
const S = { pares: null, modo: 'ejemplo', textoA: '', textoB: '', ejemploTexto: null, pdfA: null, pdfB: null, imgA: null, imgB: null, res: null, vista: 'B', corriendo: false };

const zonaDe = (r, W, H) => {
  const cx = (r.x + r.w / 2) / W, cy = (r.y + r.h / 2) / H;
  return `sector ${cy < .34 ? 'superior' : cy < .67 ? 'central' : 'inferior'} ${cx < .34 ? 'izquierdo' : cx < .67 ? 'central' : 'derecho'}`.replace('central central', 'central');
};
const cruza = (r, c, pad = 8) => !(c.x > r.x + r.w + pad || c.x + c.w < r.x - pad || c.y > r.y + r.h + pad || c.y + c.h < r.y - pad);

export function vComparar(ctx) {
  const raiz = $('#v-comparar');
  const modos = [['ejemplo', 'Ejemplo: lámina E-301'], ['texto', 'Pegar texto'], ['pdf', 'Subir dos PDF'], ['imagen', 'Subir dos imágenes']];
  raiz.innerHTML = `
    <div class="tab-cab"><div><h2>Comparar revisiones</h2><p class="sub2">Elige dos revisiones de un mismo documento. El comparador marca cada diferencia sin usar IA; luego la IA indica cuáles tienen impacto y propone la partida, y la app verifica cada cita contra el texto.</p></div></div>
    <div class="origen-docs" id="origen-docs"><span class="tit2">Desde dónde traer las revisiones</span>
      <span class="chip-origen real">Archivos de este equipo</span>${ctx.drive?.activo ? '<span class="chip-origen real">Google Drive</span>' : '<span class="chip-origen demo" title="Conexión de demostración: no lee archivos reales">Google Drive · demostración</span>'}<span class="chip-origen demo" title="Conexión de demostración: no lee archivos reales">Autodesk Construction Cloud · demostración</span><span class="chip-origen demo" title="Conexión de demostración: no lee archivos reales">Notion · demostración</span></div>
    <div class="segmento" role="tablist" aria-label="Tipo de entrada">${modos.map(([k, t]) => `<button role="tab" aria-selected="${S.modo === k}" data-modo="${k}">${t}</button>`).join('')}</div>
    <div class="cmp-entrada panel" id="cmp-entrada"></div>
    <div class="cmp-acciones">${ctx.puede('comparar') ? '<button class="btn prim grande" id="cmp-ir">Detectar cambios</button>' : ctx.notaRol('comparar', 'Comparar revisiones')}<span class="cmp-modo-ia">Modo de IA: <a href="#ajustes" id="cmp-modo">${esc(IA.etiquetaModo())}</a></span></div>
    <div id="cmp-res" aria-live="polite"></div>`;
  raiz.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { S.modo = b.dataset.modo; S.res = null; vComparar(ctx); });
  pintarEntrada(ctx);
  const ir = $('#cmp-ir'); if (ir) ir.onclick = () => detectar(ctx);
  if (S.res) pintarResultado(ctx, false);
}

function pintarEntrada(ctx) {
  const E = $('#cmp-entrada');
  if (S.modo === 'ejemplo') {
    E.innerHTML = `<div class="cmp-ejemplo"><div class="mini-lamina"><span class="etq">Revisión A</span><img alt="Lámina E-301, revisión A (demostración)" src="${urlSVG(laminaSVG('A'))}"></div><div class="mini-lamina"><span class="etq">Revisión B</span><img alt="Lámina E-301, revisión B (demostración)" src="${urlSVG(laminaSVG('B'))}"></div>
      <div class="cmp-ejemplo-txt"><span class="rotulo-demo">Ejemplo · demostración</span><h3>E-301 · Vigas del nivel típico</h3><p>Lámina generada para esta demostración (proyecto ficticio R1). El cuadro de revisiones de la B solo dice «Se actualiza cuadro de vigas».</p><p class="pista-txt">Pulsa «Detectar cambios»: no hace falta escribir nada.</p></div></div>`;
  } else if (S.modo === 'texto') {
    E.innerHTML = `<div class="fila-btn" style="margin-bottom:10px"><span class="pista-txt" style="align-self:center">Cargar un ejemplo registrado:</span>${IA.DEMO.filter(d => d.actual != null).map(d => `<button class="btn peq" data-ejt="${d.clave}">${esc(d.titulo)}</button>`).join('')}</div>
      <div class="probar"><div><label class="tit" for="cmp-a">Revisión A (anterior) <span class="pista-txt">vacía si es una carta o RFI</span></label><textarea id="cmp-a" spellcheck="false">${esc(S.textoA)}</textarea></div>
      <div><label class="tit" for="cmp-b">Revisión B (nueva o texto recibido)</label><textarea id="cmp-b" spellcheck="false">${esc(S.textoB)}</textarea></div></div>`;
    $('#cmp-a').oninput = e => { S.textoA = e.target.value; }; $('#cmp-b').oninput = e => { S.textoB = e.target.value; };
    E.querySelectorAll('[data-ejt]').forEach(b => b.onclick = () => { const d = IA.DEMO.find(x => x.clave === b.dataset.ejt); S.textoA = d.anterior; S.textoB = d.actual; S.ejemploTexto = d; S.res = null; pintarEntrada(ctx); $('#cmp-res').innerHTML = ''; });
  } else {
    const pdf = S.modo === 'pdf', acc = pdf ? 'application/pdf' : 'image/png,image/jpeg,image/webp,image/svg+xml';
    const f = l => pdf ? S['pdf' + l] : S['img' + l];
    const tam = n => n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
    const ICO_SUBIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>';
    E.innerHTML = `<div class="probar">${['A', 'B'].map(l => `<label class="soltar ${f(l) ? 'lleno' : ''}" for="cmp-f${l}" data-zona="${l}"><input type="file" id="cmp-f${l}" accept="${acc}">
        <span class="sol-ico" aria-hidden="true">${f(l) ? `<img class="sol-mini" id="mini-${l}" alt="">` : ICO_SUBIR}</span>
        <span class="sol-txt"><b>Revisión ${l}${l === 'A' ? ' (anterior)' : ' (nueva)'}</b>${f(l) ? `<span>${esc(f(l).name)} · ${tam(f(l).size)}</span><small>Pulsa o suelta otro archivo para cambiarlo</small>` : `<span>Suelta aquí ${pdf ? 'el PDF' : 'la imagen de la lámina'} o pulsa para elegir</span><small>${pdf ? 'PDF con texto o escaneado' : 'PNG, JPG, WEBP o SVG'}</small>`}</span></label>`).join('')}</div>
      <div class="fila-btn carpeta">${ctx.drive?.activo ? '<button class="btn peq" id="cmp-drive">Elegir desde Google Drive</button>' : ''}<label class="btn peq" for="cmp-carpeta">Cargar una carpeta</label><input type="file" id="cmp-carpeta" webkitdirectory multiple hidden><span class="pista-txt">Empareja la revisión A y la B por nombre (por ejemplo, <code>E-301_revA.pdf</code> y <code>E-301_revB.pdf</code>).</span></div>
      <div id="cmp-pares" aria-live="polite">${S.pares ? S.pares : ''}</div>
      <p class="pista-txt" style="margin-top:10px">${pdf ? 'Se extrae el texto de cada página (hasta 6) y se compara línea por línea; además se comparan las páginas como imagen. Si una página es un escaneo, su texto se lee con OCR.' : 'Las dos imágenes se escalan al mismo tamaño y se comparan píxel por píxel; el texto se lee con OCR para citar y proponer la partida.'} Los archivos se procesan en este navegador y no se suben a ningún servidor.</p>`;
    const asignar = (l, file) => {
      const ok = pdf ? file.type === 'application/pdf' || /\.pdf$/i.test(file.name) : /^image\//.test(file.type) || /\.(png|jpe?g|webp|svg)$/i.test(file.name);
      if (!ok) { $('#cmp-pares').innerHTML = `<p class="aviso mal">«${esc(file.name)}» no es ${pdf ? 'un PDF' : 'una imagen'}. ${pdf ? 'Para imágenes usa «Subir dos imágenes».' : 'Para PDF usa «Subir dos PDF».'}</p>`; return false; }
      if (!file.size) { $('#cmp-pares').innerHTML = `<p class="aviso mal">«${esc(file.name)}» está vacío.</p>`; return false; }
      if (pdf) S['pdf' + l] = file; else S['img' + l] = file; S.res = null; return true;
    };
    ['A', 'B'].forEach(l => {
      $(`#cmp-f${l}`).onchange = e => { const x = e.target.files[0]; if (x && asignar(l, x)) { S.pares = null; pintarEntrada(ctx); } };
      const z = E.querySelector(`[data-zona="${l}"]`);
      z.ondragover = e => { e.preventDefault(); z.classList.add('encima'); }; z.ondragleave = () => z.classList.remove('encima');
      z.ondrop = e => { e.preventDefault(); z.classList.remove('encima'); const fs = [...e.dataTransfer.files]; if (!fs.length) return;
        if (fs.length >= 2) { const p = emparejar(fs, pdf); if (p.length) { asignar('A', p[0].A); asignar('B', p[0].B); } else { asignar('A', fs[0]); asignar('B', fs[1]); } } else asignar(l, fs[0]);
        S.pares = null; pintarEntrada(ctx); };
      if (f(l)) miniatura(f(l), pdf).then(src => { const im = $(`#mini-${l}`); if (im && src) im.src = src; });
    });
    const dv = $('#cmp-drive'); if (dv) dv.onclick = async () => {
      try { const fs = await ctx.drive.elegir({ mime: pdf ? 'application/pdf' : 'image/png,image/jpeg,image/webp', max: 2 }); if (fs.length < 2) throw new Error('Elige dos archivos: la revisión A y la B.'); const p = emparejar(fs, pdf); const [x, y] = p.length ? [p[0].A, p[0].B] : fs; asignar('A', x); asignar('B', y); S.pares = `<p class="aviso ok">Archivos traídos de Google Drive: ${esc(x.name)} → ${esc(y.name)}.</p>`; }
      catch (e) { S.pares = `<p class="aviso mal">${esc(e.message)}</p>`; }
      pintarEntrada(ctx);
    };
    $('#cmp-carpeta').onchange = e => {
      const p = emparejar([...e.target.files], pdf);
      if (!p.length) { S.pares = `<p class="aviso mal">No se encontraron dos revisiones del mismo documento en la carpeta. Nombra los archivos con la revisión al final, por ejemplo <code>E-301_revA</code> y <code>E-301_revB</code>.</p>`; pintarEntrada(ctx); return; }
      asignar('A', p[0].A); asignar('B', p[0].B);
      S.pares = `<p class="aviso ok">Se emparejó <b>${esc(p[0].base)}</b>: revisión ${esc(p[0].ra)} → ${esc(p[0].rb)}.${p.length > 1 ? ` Hay ${p.length - 1} documento${p.length === 2 ? '' : 's'} más en la carpeta:` : ''}</p>${p.length > 1 ? `<div class="fila-btn">${p.slice(1).map((x, k) => `<button class="btn peq" data-par="${k + 1}">${esc(x.base)} (${esc(x.ra)} → ${esc(x.rb)})</button>`).join('')}</div>` : ''}`;
      S.listaPares = p; pintarEntrada(ctx);
    };
    E.querySelectorAll('[data-par]').forEach(b => b.onclick = () => { const x = S.listaPares[Number(b.dataset.par)]; asignar('A', x.A); asignar('B', x.B); S.pares = `<p class="aviso ok">Se emparejó <b>${esc(x.base)}</b>: revisión ${esc(x.ra)} → ${esc(x.rb)}.</p>`; pintarEntrada(ctx); });
  }
}
// Agrupa archivos por nombre base y toma las dos últimas revisiones (A = anterior, B = nueva).
export function emparejar(files, pdf) {
  const ok = f => pdf ? /\.pdf$/i.test(f.name) : /\.(png|jpe?g|webp|svg)$/i.test(f.name);
  const grupos = {};
  for (const f of files.filter(ok)) {
    const stem = f.name.replace(/\.[^.]+$/, '');
    const m = /^(.*?)[\s_.-]*(?:rev(?:isi[oó]n)?[\s_.-]*)?([A-Za-z]|\d{1,2})$/i.exec(stem);
    if (!m || !m[1]) continue;
    const base = m[1].replace(/[\s_.-]+$/, ''), rev = m[2].toUpperCase();
    (grupos[base.toLowerCase()] ||= { base, revs: [] }).revs.push({ rev, f });
  }
  return Object.values(grupos).filter(g => g.revs.length >= 2).map(g => { const r = g.revs.sort((x, y) => (isNaN(x.rev) || isNaN(y.rev) ? x.rev.localeCompare(y.rev) : x.rev - y.rev)); const a = r[r.length - 2], b = r[r.length - 1]; return { base: g.base, ra: a.rev, rb: b.rev, A: a.f, B: b.f }; });
}
async function miniatura(file, pdf) {
  try {
    if (!pdf) return URL.createObjectURL(file);
    const lib = await cargarPdfjs(), doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise, pg = await doc.getPage(1);
    const vp = pg.getViewport({ scale: 0.3 }), c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: g, viewport: vp }).promise; return c.toDataURL('image/png');
  } catch { return null; }
}

// ---------- detección ----------
async function detectar(ctx) {
  if (S.corriendo) return;
  const out = $('#cmp-res'), boton = $('#cmp-ir');
  const fallo = msg => { out.innerHTML = `<div class="aviso mal">${msg}</div>`; };
  S.corriendo = true; boton.disabled = true; boton.classList.add('cargando');
  try {
    let r;
    if (S.modo === 'ejemplo') {
      const svgA = laminaSVG('A'), svgB = laminaSVG('B');
      const lA = lineasSVG(svgA), lB = lineasSVG(svgB);
      const img = await compararImagenes(urlSVG(svgA), urlSVG(svgB));
      r = { tipo: 'lamina', srcA: urlSVG(svgA), srcB: urlSVG(svgB), ...img, lineasA: lA.map(l => l.texto), lineasB: lB.map(l => l.texto), cajasB: lB.map(l => l.cajas),
        doc: { ...DOC_DEMO, demo_clave: 'E-301', texto_anterior: lA.map(l => l.texto).join('\n'), texto: lB.map(l => l.texto).join('\n') } };
    } else if (S.modo === 'texto') {
      if (!S.textoB.trim()) return fallo('Falta el texto de la revisión B. Pega el texto nuevo o carga un ejemplo.');
      const d = S.ejemploTexto && S.ejemploTexto.actual === S.textoB ? S.ejemploTexto : null;
      const lA = S.textoA.split('\n').map(s => s.trim()).filter(Boolean), lB = S.textoB.split('\n').map(s => s.trim()).filter(Boolean);
      r = { tipo: 'texto', lineasA: lA, lineasB: lB, doc: { doc_id: 'DOC-1', tipo: d?.tipo || (S.textoA.trim() ? 'Lámina' : 'Carta'), titulo: 'Documento comparado', especialidad: 'Por determinar', revision: 'B', revision_anterior: S.textoA.trim() ? 'A' : '—', emisor: 'Texto pegado', texto_anterior: S.textoA, texto: S.textoB, demo_clave: d?.clave } };
    } else if (S.modo === 'pdf') {
      if (!S.pdfA || !S.pdfB) return fallo('Elige los dos PDF: la revisión A y la B.');
      const aviso = t => { out.innerHTML = `<p class="estado-ia"><span class="spin"></span>${esc(t)}</p>`; };
      const A = await leerPDF(S.pdfA, 6, t => aviso(`Revisión A · ${t}`)), B = await leerPDF(S.pdfB, 6, t => aviso(`Revisión B · ${t}`));
      const lA = A.paginas.flatMap(p => [`Página ${p.n}`, ...p.lineas]), lB = B.paginas.flatMap(p => [`Página ${p.n}`, ...p.lineas]);
      if (lB.length <= B.paginas.length) return fallo('No se pudo leer texto en el PDF de la revisión B, ni siquiera con OCR. Revisa que el escaneo sea legible.');
      const pags = [];
      for (let k = 0; k < Math.min(A.paginas.length, B.paginas.length); k++) pags.push({ n: k + 1, ...(await compararImagenes(A.paginas[k].img, B.paginas[k].img, 1000)), srcA: A.paginas[k].img, srcB: B.paginas[k].img });
      r = { tipo: 'pdf', ocr: A.paginas.some(p => p.ocr) || B.paginas.some(p => p.ocr), lineasA: lA, lineasB: lB, paginas: pags, ...(pags[0] || {}), srcA: pags[0]?.srcA, srcB: pags[0]?.srcB, doc: { doc_id: 'DOC-1', tipo: 'Lámina', titulo: S.pdfB.name, especialidad: 'Por determinar', revision: 'B', revision_anterior: 'A', emisor: 'PDF cargado', texto_anterior: lA.join('\n'), texto: lB.join('\n') } };
    } else {
      if (!S.imgA || !S.imgB) return fallo('Elige las dos imágenes: la revisión A y la B.');
      const sA = URL.createObjectURL(S.imgA), sB = URL.createObjectURL(S.imgB);
      const img = await compararImagenes(sA, sB);
      r = { tipo: 'imagen', srcA: sA, srcB: sB, ...img };
      if (!(S.imgB.type === 'image/svg+xml' && S.imgA.type === 'image/svg+xml')) {
        // Imagen raster: se lee el texto con OCR sobre las imágenes ya escaladas (mismas coordenadas que las zonas).
        const aviso = t => { out.innerHTML = `<p class="estado-ia"><span class="spin"></span>${esc(t)}</p>`; };
        try {
          aviso('Leyendo el texto de la revisión A con OCR…'); const oA = await ocr(img.cA, x => aviso(`Leyendo el texto de la revisión A con OCR (${Math.round(x * 100)} %)…`));
          aviso('Leyendo el texto de la revisión B con OCR…'); const oB = await ocr(img.cB, x => aviso(`Leyendo el texto de la revisión B con OCR (${Math.round(x * 100)} %)…`));
          if (oB.length) Object.assign(r, { tipo: 'lamina', ocr: true, lineasA: oA.map(l => l.texto), lineasB: oB.map(l => l.texto), cajasB: oB.map(l => l.caja ? [l.caja] : []), doc: { doc_id: 'DOC-1', tipo: 'Lámina', titulo: S.imgB.name, especialidad: 'Por determinar', revision: 'B', revision_anterior: 'A', emisor: 'Imagen cargada (texto leído con OCR)', texto_anterior: oA.map(l => l.texto).join('\n'), texto: oB.map(l => l.texto).join('\n') } });
        } catch (e) { r.ocrError = e.message; }
      }
      if (S.imgB.type === 'image/svg+xml' && S.imgA.type === 'image/svg+xml') {
        const [tA, tB] = await Promise.all([S.imgA.text(), S.imgB.text()]); const lA = lineasSVG(tA), lB = lineasSVG(tB);
        Object.assign(r, { tipo: 'lamina', lineasA: lA.map(l => l.texto), lineasB: lB.map(l => l.texto), cajasB: lB.map(l => l.cajas), doc: { doc_id: 'DOC-1', tipo: 'Lámina', titulo: S.imgB.name, especialidad: 'Por determinar', revision: 'B', revision_anterior: 'A', emisor: 'SVG cargado', texto_anterior: lA.map(l => l.texto).join('\n'), texto: lB.map(l => l.texto).join('\n') } });
      }
    }
    r.ops = r.lineasB ? diffLineas(r.lineasA, r.lineasB) : [];
    r.identicos = r.huellaA && r.huellaA === r.huellaB;
    if (r.identicos) { r.regiones = []; r.ops = []; }
    const huella = async f => f ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await f.arrayBuffer()))).join(',') : null;
    if (S.modo === 'pdf') [r.huellaA, r.huellaB] = await Promise.all([huella(S.pdfA), huella(S.pdfB)]);
    else if (S.modo === 'imagen') [r.huellaA, r.huellaB] = await Promise.all([huella(S.imgA), huella(S.imgB)]);
    r.fase = 'diff'; S.res = r; S.vista = 'B';
    await pintarResultado(ctx, true);
    await procesarIA(ctx, r);
  } catch (e) {
    fallo(`No se pudo comparar: ${esc(e.message || e)}. Revisa que los archivos no estén vacíos ni dañados.`);
  } finally { S.corriendo = false; boton.disabled = false; boton.classList.remove('cargando'); }
}

// Llama a la IA (según el modo) y valida con los parseadores del núcleo.
async function procesarIA(ctx, r) {
  // Sin diferencias no se consulta a la IA: no hay nada que interpretar.
  if (r.identicos || (!(r.regiones || []).length && !r.ops.length)) { r.fase = 'sin-cambios'; pintarTarjetas(ctx); return; }
  if (!r.doc) { r.fase = 'sin-texto'; pintarTarjetas(ctx); return; }
  r.fase = 'ia'; pintarTarjetas(ctx);
  await espera(600);
  try {
    let d1 = await IA.detectar(r.doc);
    r.tipoIA = d1.manual ? 'manual' : IA.tipoOrigen(d1);
    if (d1.manual) { const t = await pedirManual('Paso 1 de 2 · Detección de cambios', d1.prompt, false); d1 = { texto: t, origen: 'Respuesta pegada en modo manual, pasada por el validador de citas.' }; r.fase = 'ia'; pintarTarjetas(ctx); }
    const { texto, origen, demo } = d1;
    const res = N.parsearI1(texto, { [r.doc.doc_id]: r.doc });
    r.hechos = res.hechos.map((h, i) => ({ ...h, id: `H${i + 1}` })); r.rechazadas = res.rechazadas; r.sinCambios = res.sinCambios.length > 0; r.origen = origen; r.respuestaI1 = texto;
    let v = r.hechos.length ? await IA.vincular(r.doc, r.hechos, ctx.proyecto.partidas, demo) : null;
    if (v?.manual) { const t = await pedirManual('Paso 2 de 2 · Partida del presupuesto', v.prompt, true, r.hechos.length); v = t ? { texto: t } : null; r.fase = 'ia'; pintarTarjetas(ctx); }
    if (v) { const p = N.parsearI2(v.texto, ctx.partidaPorCod, new Set(r.hechos.map(h => h.id))); r.vinculos = p.vinculos; r.rechazadasI2 = p.rechazadas; r.respuestaI2 = v.texto; }
    else r.vinculos = {};
    enlazar(r);
    r.fase = 'listo';
  } catch (e) {
    r.fase = 'error-ia'; r.errorIA = e.message || String(e);
  }
  pintarTarjetas(ctx);
}

// Modo manual: muestra la instrucción completa, permite copiarla y espera la respuesta pegada.
function pedirManual(titulo, prompt, omitible, n = 0) {
  return new Promise(ok => {
    const T = $('#cmp-tarjetas'), R = $('#cmp-resumen');
    if (R) R.innerHTML = `<p class="estado-ia">Modo manual: esperando la respuesta de la IA que uses.</p>`;
    T.innerHTML = `<div class="panel manual"><span class="rotulo-demo" style="color:var(--azul-2);border-color:var(--azul-2)">IA: manual</span><h3>${esc(titulo)}</h3>
      <ol class="pasos-manual"><li>Copia la instrucción completa.</li><li>Pégala en el asistente de IA que prefieras (Gemini, ChatGPT, Claude u otra).</li><li>Pega aquí su respuesta y pulsa «Validar respuesta». La app verifica ${omitible ? 'cada código de partida contra el presupuesto' : 'cada cita contra el texto de la revisión B'}.</li></ol>
      <div class="fila-btn"><button class="btn" id="man-copiar">Copiar instrucción</button>${omitible ? '<button class="btn" id="man-omitir">Omitir: asignar partida después</button>' : ''}</div>
      <details class="tec" open><summary>Ver instrucción completa (${prompt.length} caracteres)</summary><pre class="crudo" id="man-prompt">${esc(prompt)}</pre></details>
      <label class="tit" for="man-resp">Respuesta de la IA${omitible ? ` (una fila por cambio: ${n})` : ''}</label><textarea id="man-resp" spellcheck="false" placeholder="${omitible ? 'H1 | código | descripción | …' : 'DOC | 1 | cambio | ubicación | especialidad | elemento | cita'}"></textarea>
      <div class="fila-btn" style="margin-top:10px"><button class="btn prim" id="man-ok">Validar respuesta</button></div><div id="man-msg" aria-live="polite"></div></div>`;
    $('#man-copiar').onclick = async () => { try { await navigator.clipboard.writeText(prompt); $('#man-copiar').textContent = 'Instrucción copiada'; } catch { const sel = getSelection(), rg = document.createRange(); rg.selectNodeContents($('#man-prompt')); sel.removeAllRanges(); sel.addRange(rg); $('#man-copiar').textContent = 'Selecciónala y cópiala con Ctrl+C'; } };
    $('#man-ok').onclick = () => { const t = $('#man-resp').value.trim(); if (!t) { $('#man-msg').innerHTML = '<p class="aviso mal" style="margin-top:8px">Pega primero la respuesta de la IA.</p>'; return; } ok(t); };
    const om = $('#man-omitir'); if (om) om.onclick = () => ok(null);
    $('#man-resp').focus({ preventScroll: true });
  });
}

// Une cada hecho con su línea de diff y con las zonas de la lámina.
function enlazar(r) {
  for (const h of r.hechos) {
    const c = N.normalizar(h.cita);
    const ib = r.lineasB.findIndex(l => { const n = N.normalizar(l); return n.includes(c) || (c.includes(n) && n.length > 6); });
    const op = r.ops.find(o => o.ib === ib);
    h.antes = op ? op.a : null; h.despues = ib >= 0 ? r.lineasB[ib] : h.cita; h.linea = ib;
    h.regiones = [];
    if (r.regiones && r.cajasB && ib >= 0) {
      // Zonas de la línea citada y de las otras líneas modificadas que nombran el mismo elemento (p. ej., V-1 en el cuadro de vigas).
      const cod = (h.elemento.match(/\b[A-Z]{1,3}-\d+[A-Z]?\b/) || [])[0];
      const lineas = new Set([ib, ...r.ops.filter(o => o.ib != null && cod && new RegExp(`(^|[^\\w-])${cod}([^\\w]|$)`).test(r.lineasB[o.ib])).map(o => o.ib)]);
      h.regiones = r.regiones.map((g, k) => ({ g, k })).filter(({ g }) => [...lineas].some(l => r.cajasB[l].some(cj => cruza(g, cj)))).map(x => x.k);
      h.lineas = [...lineas];
    }
    h.evidente = h.regiones.length ? h.regiones.some(k => r.regiones[k].frac >= UMBRAL_EVIDENTE) : null;
    if (ib >= 0 && r.tipo === 'pdf') { let pg = 0; for (let k = 0; k <= ib; k++) { const m = /^Página (\d+)$/.exec(r.lineasB[k]); if (m) pg = Number(m[1]); } h.pagina = pg; }
  }
}

// ---------- pintado del resultado ----------
async function pintarResultado(ctx, animar) {
  const r = S.res, out = $('#cmp-res');
  const conImagen = !!r.srcB;
  const nDif = r.regiones ? r.regiones.length : r.ops.length;
  out.innerHTML = `
    <div class="cmp-grid">
      ${conImagen ? `<div class="panel visor-panel"><div class="visor-cab"><h3>${r.tipo === 'pdf' ? 'Página 1 · ' : ''}Zonas con diferencias</h3><div class="segmento peq" role="group" aria-label="Revisión mostrada">${[['A', 'Rev. A'], ['B', 'Rev. B']].map(([k, t]) => `<button data-ver="${k}" aria-pressed="${S.vista === k}">${t}</button>`).join('')}</div></div>
        <div class="visor" id="visor" style="aspect-ratio:${r.W} / ${r.H}"><img id="visor-img" alt="Revisión ${S.vista} del documento comparado" src="${S.vista === 'A' ? r.srcA : r.srcB}">
          ${(r.regiones || []).map((g, k) => `<button class="zona ${animar ? '' : 'on'} ${g.frac < UMBRAL_EVIDENTE ? 'sutil' : ''}" data-z="${k}" style="left:${g.x / r.W * 100}%;top:${g.y / r.H * 100}%;width:${g.w / r.W * 100}%;height:${g.h / r.H * 100}%" aria-label="Zona ${k + 1}: ${zonaDe(g, r.W, r.H)}"><span>${k + 1}</span></button>`).join('')}
          <div class="barrido" id="barrido" ${animar && !reducido() ? '' : 'hidden'}></div></div>
        <p class="pista-txt" style="margin-top:8px">Recuadro naranja: zona modificada. Punteado: área menor al 0,1 % de la lámina, difícil de ver a simple vista.</p></div>` : ''}
      <div class="panel contador-panel"><div class="contador"><b class="num" id="cmp-n">${animar ? 0 : nDif}</b><span>${r.regiones ? 'zonas con diferencias en el dibujo' : 'líneas con diferencias en el texto'}</span></div>
        ${r.regiones && r.ops.length ? `<p class="pista-txt">${r.ops.length} línea${r.ops.length === 1 ? '' : 's'} de texto cambiaron entre la revisión A y la B.</p>` : ''}
        <div id="cmp-resumen"></div>
        ${r.ops.length ? `<details class="tec"><summary>Ver diferencias de texto sin interpretar</summary><ul class="ops">${r.ops.map(o => { const m = marcarPalabras(o.a, o.b); return `<li><span class="etq">${o.tipo === 'cambio' ? 'Cambia' : o.tipo === 'agregada' ? 'Nueva' : 'Se quita'}</span>${o.a != null ? `<div class="antes">${m.A}</div>` : ''}${o.b != null ? `<div class="despues">${m.B}</div>` : ''}</li>`; }).join('')}</ul><p class="pista-txt">Un comparador marca todo lo que cambió, incluido el rótulo. No dice qué importa ni a qué partida afecta: eso lo propone la IA.</p></details>` : ''}
      </div>
    </div>
    <div id="cmp-tarjetas"></div>`;
  out.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => { S.vista = b.dataset.ver; $('#visor-img').src = S.vista === 'A' ? r.srcA : r.srcB; out.querySelectorAll('[data-ver]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  out.querySelectorAll('[data-z]').forEach(z => z.onclick = () => { const t = document.querySelector(`[data-tz~="${z.dataset.z}"]`); if (t) { t.scrollIntoView({ behavior: reducido() ? 'auto' : 'smooth', block: 'center' }); t.classList.add('pulso'); setTimeout(() => t.classList.remove('pulso'), 1200); } });
  if (!animar) { pintarTarjetas(ctx); return; }
  if (conImagen && !reducido()) await espera(1500);
  const bar = $('#barrido'); if (bar) bar.hidden = true;
  const zonas = [...out.querySelectorAll('.zona')];
  const n = $('#cmp-n');
  if (zonas.length) for (let k = 0; k < zonas.length; k++) { zonas[k].classList.add('on'); n.textContent = k + 1; await espera(320); }
  else n.textContent = nDif;
}

function pintarTarjetas(ctx) {
  const r = S.res, T = $('#cmp-tarjetas'), R = $('#cmp-resumen');
  if (!T) return;
  if (r.fase === 'ia') { R.innerHTML = `<p class="estado-ia"><span class="spin" aria-hidden="true"></span>La IA revisa qué diferencias tienen impacto (${esc(IA.etiquetaModo())})…</p>`; T.innerHTML = ''; return; }
  if (r.fase === 'sin-cambios') { R.innerHTML = `<div class="resumen-ia neutro"><b class="num">0</b><span>cambios</span></div><p class="aviso ok">${r.identicos ? 'Los dos archivos son idénticos.' : 'No hay diferencias de texto ni zonas modificadas entre la revisión A y la B (se toleran diferencias de resolución y compresión).'} No se generan alertas ni se consulta a la IA.</p>`; T.innerHTML = ''; return; }
  if (r.fase === 'sin-texto') {
    R.innerHTML = `<p class="aviso info">${r.ocrError ? `No se pudo leer el texto con OCR (${esc(r.ocrError)}).` : 'El OCR no encontró texto legible en la imagen.'} Sin texto no hay cita literal que verificar ni partida que proponer; las zonas sirven para ubicar el cambio en la lámina.</p>`;
    T.innerHTML = `<h3 class="cmp-h">Zonas detectadas</h3><div class="tarjetas-cmp">${r.regiones.map((g, k) => `<article class="tarj-cmp" data-tz="${k}"><header><span class="n">${k + 1}</span><div><h4>Zona ${k + 1}</h4><small>${zonaDe(g, r.W, r.H)} · ${(g.frac * 100).toFixed(2).replace('.', ',')} % del área</small></div>${g.frac < UMBRAL_EVIDENTE ? '<span class="etq ambar">No evidente a simple vista</span>' : ''}</header>
      <div class="ab"><figure><figcaption>Antes</figcaption><img alt="Zona ${k + 1} en la revisión A" src="${recorte(r.cA, g)}"></figure><figure><figcaption>Después</figcaption><img alt="Zona ${k + 1} en la revisión B" src="${recorte(r.cB, g)}"></figure></div></article>`).join('')}</div>`;
    return;
  }
  if (r.fase === 'error-ia') {
    R.innerHTML = `<div class="aviso mal">${esc(r.errorIA)} <a href="#ajustes">Abrir Ajustes de IA</a></div>${r.ocr ? '<p class="pista-txt">Texto leído con OCR: revisa cifras y unidades; el reconocimiento puede confundir dígitos.</p>' : ''}`;
    T.innerHTML = r.ops.length ? `<h3 class="cmp-h">Diferencias encontradas (sin interpretar)</h3><div class="tarjetas-cmp">${r.ops.map((o, k) => tarjetaDiff(o, k)).join('')}</div>` : '';
    return;
  }
  const hs = r.hechos || [], noEv = hs.filter(h => h.evidente === false).length;
  R.innerHTML = `<div class="resumen-ia ${hs.length ? '' : 'neutro'}"><b class="num">${hs.length}</b><span>${hs.length === 1 ? 'cambio con impacto detectado' : 'cambios con impacto detectados'}</span></div>
    ${noEv ? `<p class="destacado-naranja"><b>${noEv}</b> ${noEv === 1 ? 'no era evidente' : 'no eran evidentes'} a simple vista (área menor al 0,1 % de la lámina).</p>` : ''}
    ${r.sinCambios && !hs.length ? '<p class="aviso ok">La IA no encontró cambios con impacto (solo rótulo o forma). No se genera alerta.</p>' : ''}
    ${(() => { if (!r.regiones || !hs.length) return ''; const usadas = new Set(hs.flatMap(h => h.regiones)); const resto = r.regiones.map((g, k) => k).filter(k => !usadas.has(k)); if (!resto.length) return '';
      const cambiadas = r.ops.filter(o => o.ib != null).map(o => o.ib); const textos = resto.map(k => cambiadas.find(i => (r.cajasB?.[i] || []).some(cj => cruza(r.regiones[k], cj, 2)))).filter(i => i != null).map(i => `«${r.lineasB[i]}»`);
      return `<p class="pista-txt">${resto.length === 1 ? 'La zona' : 'Las zonas'} ${resto.map(k => k + 1).join(', ')} no ${resto.length === 1 ? 'tiene' : 'tienen'} impacto según la IA${textos.length ? `: ${esc([...new Set(textos)].join(', '))}` : ''}.</p>`; })()}
    <p class="origen">${IA.chipIA(r.tipoIA)} ${esc(r.origen || '')}</p>${r.ocr ? '<p class="pista-txt">Texto leído con OCR: revisa cifras y unidades antes de decidir. La cita se verifica contra el texto leído.</p>' : ''}`;
  const cards = hs.map((h, k) => tarjetaHecho(ctx, r, h, k)).join('');
  const rech = [...(r.rechazadas || []), ...(r.rechazadasI2 || [])];
  T.innerHTML = `${hs.length ? `<h3 class="cmp-h">Cambios con impacto</h3><div class="tarjetas-cmp">${cards}</div>` : ''}
    ${rech.length ? `<div class="panel"><h3>Filas rechazadas por el validador</h3>${rech.map(x => `<div class="check"><span class="ico no">✗</span><div><b>${esc(x.motivo)}</b><pre class="crudo">${esc(x.linea)}</pre></div></div>`).join('')}</div>` : ''}
    ${hs.length ? `<div class="cmp-final"><button class="btn prim grande" id="cmp-alerta">Crear alerta con estos cambios</button><span class="pista-txt">Pasa ${hs.length === 1 ? 'el cambio' : `los ${hs.length} cambios`} a la bandeja con su plazo y abre el detalle. Ninguna alerta se emite sin tu decisión.</span></div>` : ''}
    <details class="tec"><summary>Ver instrucción enviada a la IA</summary><pre class="crudo">${esc(IA.promptI1(r.doc))}</pre>${r.respuestaI1 ? `<p>Respuesta recibida:</p><pre class="crudo">${esc(r.respuestaI1)}</pre>` : ''}${r.respuestaI2 ? `<p>Instrucción para la partida (paso 2):</p><pre class="crudo">${esc(IA.I2())}</pre><p>Respuesta recibida:</p><pre class="crudo">${esc(r.respuestaI2)}</pre>` : ''}</details>`;
  const b = $('#cmp-alerta');
  if (b) b.onclick = () => {
    const doc = { ...r.doc, fecha_recepcion: ctx.est.hoy };
    delete doc.demo_clave;
    const nuevas = ctx.crearAlertas(doc, hs.map(h => ({ ...h, ...(r.vinculos[h.id] || {}), origen_ia: r.tipoIA })));
    location.hash = `#alerta-${nuevas[0].id.toLowerCase()}`;
  };
}

function tarjetaDiff(o, k) {
  const m = marcarPalabras(o.a, o.b);
  return `<article class="tarj-cmp"><header><span class="n">${k + 1}</span><div><h4>${o.tipo === 'cambio' ? 'Línea modificada' : o.tipo === 'agregada' ? 'Línea nueva' : 'Línea eliminada'}</h4><small>Línea ${(o.ib ?? o.ia) + 1}</small></div></header>
    <div class="ab txt">${o.a != null ? `<div><small>Antes</small><p class="antes">${m.A}</p></div>` : ''}${o.b != null ? `<div><small>Después</small><p class="despues">${m.B}</p></div>` : ''}</div></article>`;
}

function tarjetaHecho(ctx, r, h, k) {
  const v = r.vinculos?.[h.id];
  const g = h.regiones.length ? h.regiones.map(i => r.regiones[i]).sort((a, b) => b.px - a.px)[0] : null;
  const donde = r.tipo === 'pdf' ? `Página ${h.pagina || 1}` : g ? `Lámina, ${zonaDe(g, r.W, r.H)}` : h.linea >= 0 ? `Línea ${h.linea + 1}` : 'Documento';
  const m = marcarPalabras(h.antes, h.despues);
  const crops = g && r.cA ? `<div class="ab"><figure><figcaption>Antes · rev. A</figcaption><img alt="Zona antes del cambio" src="${recorte(r.cA, g)}"></figure><figure><figcaption>Después · rev. B</figcaption><img alt="Zona después del cambio" src="${recorte(r.cB, g)}"></figure></div>` : '';
  const conf = v ? (v.confianza === 'Alta' ? 'verde' : v.confianza === 'Media' ? 'ambar' : 'naranja') : '';
  return `<article class="tarj-cmp anim" style="animation-delay:${k * .12}s" data-tz="${h.regiones.join(' ')}">
    <header><span class="n">${k + 1}</span><div><h4>${esc(h.elemento)}</h4><span class="chip-fila">${IA.chipIA(r.tipoIA)}</span><small>${esc(donde)} · ${esc(h.especialidad)}</small></div>${h.evidente === false ? '<span class="etq ambar">No evidente a simple vista</span>' : ''}</header>
    <p class="cambio">${esc(h.cambio)}</p>
    ${crops}
    ${h.antes != null || h.despues ? `<div class="ab txt">${h.antes != null ? `<div><small>Antes</small><p class="antes">${m.A}</p></div>` : ''}<div><small>Después</small><p class="despues">${h.antes != null ? m.B : esc(h.despues)}</p></div></div>` : ''}
    <div class="check"><span class="ico si">✓</span><div><b>Cita literal verificada en la revisión B:</b> «${esc(h.cita)}»</div></div>
    <div class="partida-prop">${v ? `<span class="tit2">Partida propuesta${r.tipoIA === 'preparada' ? ' (demostración)' : ' por la IA'}</span><p><code>${esc(v.partida || '—')}</code> ${esc(v.partida_desc)} <span class="etq ${conf}">Confianza ${esc(v.confianza.toLowerCase())}</span></p>${v.confianza_ajustada ? `<small class="pista-txt">La IA dijo «${esc(v.confianza_modelo)}»; la app la recalcula con los 4 criterios.</small>` : ''}<details class="tec"><summary>Por qué esta partida</summary><p>${esc(v.sustento)}</p></details>`
      : `<span class="tit2">Partida</span><p class="pista-txt">Sin propuesta de partida en este modo. Se puede asignar en el detalle de la alerta.</p>`}</div>
  </article>`;
}
