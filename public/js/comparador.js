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
  const d = difPixeles(cA.getContext('2d').getImageData(0, 0, W, H).data, cB.getContext('2d').getImageData(0, 0, W, H).data, W, H);
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
async function leerPDF(file, maxPag = 6) {
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
    const vp = pg.getViewport({ scale: 1.4 }), c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: g, viewport: vp }).promise;
    paginas.push({ n: p, lineas: lineas.map(l => l.t.replace(/\s+/g, ' ').trim()).filter(Boolean), img: c.toDataURL('image/png') });
  }
  return { paginas, total: pdf.numPages };
}

// ---------- estado de la vista ----------
const S = { modo: 'ejemplo', textoA: '', textoB: '', ejemploTexto: null, pdfA: null, pdfB: null, imgA: null, imgB: null, res: null, vista: 'B', corriendo: false };

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
    <div class="segmento" role="tablist" aria-label="Tipo de entrada">${modos.map(([k, t]) => `<button role="tab" aria-selected="${S.modo === k}" data-modo="${k}">${t}</button>`).join('')}</div>
    <div class="cmp-entrada panel" id="cmp-entrada"></div>
    <div class="cmp-acciones"><button class="btn prim grande" id="cmp-ir">Detectar cambios</button><span class="cmp-modo-ia">Modo de IA: <a href="#ajustes" id="cmp-modo">${esc(IA.ETIQUETA[IA.modoIA()])}</a></span></div>
    <div id="cmp-res" aria-live="polite"></div>`;
  raiz.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { S.modo = b.dataset.modo; S.res = null; vComparar(ctx); });
  pintarEntrada(ctx);
  $('#cmp-ir').onclick = () => detectar(ctx);
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
    const nom = l => (pdf ? S['pdf' + l] : S['img' + l])?.name;
    E.innerHTML = `<div class="probar">${['A', 'B'].map(l => `<label class="soltar" for="cmp-f${l}"><input type="file" id="cmp-f${l}" accept="${acc}"><b>Revisión ${l}${l === 'A' ? ' (anterior)' : ' (nueva)'}</b><span>${nom(l) ? esc(nom(l)) : pdf ? 'Elegir PDF con texto' : 'Elegir imagen de la lámina (PNG, JPG o SVG)'}</span></label>`).join('')}</div>
      <p class="pista-txt" style="margin-top:10px">${pdf ? 'Se extrae el texto de cada página (hasta 6) y se compara línea por línea; además se comparan las páginas como imagen. Los PDF escaneados no tienen texto: requieren OCR (pendiente).' : 'Las dos imágenes se escalan al mismo tamaño y se comparan píxel por píxel. Una imagen no trae texto: la cita literal y la partida requieren OCR (pendiente) o un SVG con texto.'} Los archivos se procesan en este navegador y no se suben a ningún servidor.</p>`;
    ['A', 'B'].forEach(l => $(`#cmp-f${l}`).onchange = e => { const f = e.target.files[0]; if (!f) return; if (pdf) S['pdf' + l] = f; else S['img' + l] = f; S.res = null; pintarEntrada(ctx); });
  }
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
      const [A, B] = await Promise.all([leerPDF(S.pdfA), leerPDF(S.pdfB)]);
      const lA = A.paginas.flatMap(p => [`Página ${p.n}`, ...p.lineas]), lB = B.paginas.flatMap(p => [`Página ${p.n}`, ...p.lineas]);
      if (lB.length <= B.paginas.length) return fallo('El PDF de la revisión B no tiene texto extraíble (¿es un escaneo?). Usa la entrada de imágenes o un PDF con texto.');
      const pags = [];
      for (let k = 0; k < Math.min(A.paginas.length, B.paginas.length); k++) pags.push({ n: k + 1, ...(await compararImagenes(A.paginas[k].img, B.paginas[k].img, 1000)), srcA: A.paginas[k].img, srcB: B.paginas[k].img });
      r = { tipo: 'pdf', lineasA: lA, lineasB: lB, paginas: pags, ...(pags[0] || {}), srcA: pags[0]?.srcA, srcB: pags[0]?.srcB, doc: { doc_id: 'DOC-1', tipo: 'Lámina', titulo: S.pdfB.name, especialidad: 'Por determinar', revision: 'B', revision_anterior: 'A', emisor: 'PDF cargado', texto_anterior: lA.join('\n'), texto: lB.join('\n') } };
    } else {
      if (!S.imgA || !S.imgB) return fallo('Elige las dos imágenes: la revisión A y la B.');
      const sA = URL.createObjectURL(S.imgA), sB = URL.createObjectURL(S.imgB);
      const img = await compararImagenes(sA, sB);
      r = { tipo: 'imagen', srcA: sA, srcB: sB, ...img };
      if (S.imgB.type === 'image/svg+xml' && S.imgA.type === 'image/svg+xml') {
        const [tA, tB] = await Promise.all([S.imgA.text(), S.imgB.text()]); const lA = lineasSVG(tA), lB = lineasSVG(tB);
        Object.assign(r, { tipo: 'lamina', lineasA: lA.map(l => l.texto), lineasB: lB.map(l => l.texto), cajasB: lB.map(l => l.cajas), doc: { doc_id: 'DOC-1', tipo: 'Lámina', titulo: S.imgB.name, especialidad: 'Por determinar', revision: 'B', revision_anterior: 'A', emisor: 'SVG cargado', texto_anterior: lA.map(l => l.texto).join('\n'), texto: lB.map(l => l.texto).join('\n') } });
      }
    }
    r.ops = r.lineasB ? diffLineas(r.lineasA, r.lineasB) : [];
    r.fase = 'diff'; S.res = r; S.vista = 'B';
    await pintarResultado(ctx, true);
    await procesarIA(ctx, r);
  } catch (e) {
    fallo(`No se pudo comparar: ${esc(e.message || e)}. Revisa que los archivos no estén vacíos ni dañados.`);
  } finally { S.corriendo = false; boton.disabled = false; boton.classList.remove('cargando'); }
}

// Llama a la IA (según el modo) y valida con los parseadores del núcleo.
async function procesarIA(ctx, r) {
  if (!r.doc) { r.fase = 'sin-texto'; pintarTarjetas(ctx); return; }
  r.fase = 'ia'; pintarTarjetas(ctx);
  await espera(600);
  try {
    let d1 = await IA.detectar(r.doc);
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
      <ol class="pasos-manual"><li>Copia la instrucción completa.</li><li>Pégala en el asistente de IA que prefieras (Gemini, ChatGPT, Claude u otro).</li><li>Pega aquí su respuesta y pulsa «Validar respuesta». La app verifica ${omitible ? 'cada código de partida contra el presupuesto' : 'cada cita contra el texto de la revisión B'}.</li></ol>
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
  if (r.fase === 'ia') { R.innerHTML = `<p class="estado-ia"><span class="spin" aria-hidden="true"></span>La IA revisa qué diferencias tienen impacto (${esc(IA.ETIQUETA[IA.modoIA()])})…</p>`; T.innerHTML = ''; return; }
  if (r.fase === 'sin-texto') {
    R.innerHTML = `<p class="aviso info">La imagen no trae texto: sin OCR no hay cita literal que verificar ni partida que proponer. Las zonas sirven para ubicar el cambio en la lámina.</p>`;
    T.innerHTML = `<h3 class="cmp-h">Zonas detectadas</h3><div class="tarjetas-cmp">${r.regiones.map((g, k) => `<article class="tarj-cmp" data-tz="${k}"><header><span class="n">${k + 1}</span><div><h4>Zona ${k + 1}</h4><small>${zonaDe(g, r.W, r.H)} · ${(g.frac * 100).toFixed(2).replace('.', ',')} % del área</small></div>${g.frac < UMBRAL_EVIDENTE ? '<span class="etq ambar">No evidente a simple vista</span>' : ''}</header>
      <div class="ab"><figure><figcaption>Antes</figcaption><img alt="Zona ${k + 1} en la revisión A" src="${recorte(r.cA, g)}"></figure><figure><figcaption>Después</figcaption><img alt="Zona ${k + 1} en la revisión B" src="${recorte(r.cB, g)}"></figure></div></article>`).join('')}</div>`;
    return;
  }
  if (r.fase === 'error-ia') {
    R.innerHTML = `<div class="aviso mal">${esc(r.errorIA)} <a href="#ajustes">Abrir Ajustes de IA</a></div>`;
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
    <p class="origen">${esc(r.origen || '')}</p>`;
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
    const nuevas = ctx.crearAlertas(doc, hs.map(h => ({ ...h, ...(r.vinculos[h.id] || {}) })));
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
    <header><span class="n">${k + 1}</span><div><h4>${esc(h.elemento)}</h4><small>${esc(donde)} · ${esc(h.especialidad)}</small></div>${h.evidente === false ? '<span class="etq ambar">No evidente a simple vista</span>' : ''}</header>
    <p class="cambio">${esc(h.cambio)}</p>
    ${crops}
    ${h.antes != null || h.despues ? `<div class="ab txt">${h.antes != null ? `<div><small>Antes</small><p class="antes">${m.A}</p></div>` : ''}<div><small>Después</small><p class="despues">${h.antes != null ? m.B : esc(h.despues)}</p></div></div>` : ''}
    <div class="check"><span class="ico si">✓</span><div><b>Cita literal verificada en la revisión B:</b> «${esc(h.cita)}»</div></div>
    <div class="partida-prop">${v ? `<span class="tit2">Partida propuesta por la IA</span><p><code>${esc(v.partida || '—')}</code> ${esc(v.partida_desc)} <span class="etq ${conf}">Confianza ${esc(v.confianza.toLowerCase())}</span></p>${v.confianza_ajustada ? `<small class="pista-txt">La IA dijo «${esc(v.confianza_modelo)}»; la app la recalcula con los 4 criterios.</small>` : ''}<details class="tec"><summary>Por qué esta partida</summary><p>${esc(v.sustento)}</p></details>`
      : `<span class="tit2">Partida</span><p class="pista-txt">Sin propuesta de partida en este modo. Se puede asignar en el detalle de la alerta.</p>`}</div>
  </article>`;
}
