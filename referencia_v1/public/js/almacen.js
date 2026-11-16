// Capa de datos. En línea usa Firebase (Auth anónima + Firestore); si Firebase no está configurado
// o no responde, usa el almacenamiento del navegador con la misma interfaz (modo local).
// Cada usuario trabaja en su propio espacio: ws/{uid}/{colección}/{documento}.
// La auditoría es de solo agregar: las reglas de Firestore prohíben editarla o borrarla.
import { firebaseConfig } from './config.js';

const V = '11.10.0';
let modo = 'local', uid = null, fb = null;

export async function iniciar() {
  if (firebaseConfig && firebaseConfig.apiKey) {
    try {
      const [{ initializeApp }, auth, fs] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
        import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
      ]);
      const app = initializeApp(firebaseConfig);
      const a = auth.getAuth(app);
      const user = await new Promise((res, rej) => {
        const off = auth.onAuthStateChanged(a, u => { if (u) { off(); res(u); } }, rej);
        auth.signInAnonymously(a).catch(rej);
        setTimeout(() => rej(new Error('Tiempo de espera agotado al conectar con Firebase')), 12000);
      });
      fb = { fs, db: fs.getFirestore(app), auth: a, authMod: auth };
      uid = user.uid; modo = 'firestore';
      return { modo, uid };
    } catch (e) {
      console.warn('[almacen] Firebase no disponible, se usa el modo local:', e.message);
    }
  }
  modo = 'local';
  uid = leerLocal('__uid') || ('local-' + Math.random().toString(36).slice(2, 10));
  guardarLocal('__uid', uid);
  return { modo, uid };
}

export const info = () => ({ modo, uid });

// ---------- modo local ----------
const clave = k => `reloj-g4:${k}`;
function leerLocal(k) { try { return JSON.parse(localStorage.getItem(clave(k))); } catch { return null; } }
function guardarLocal(k, v) { try { localStorage.setItem(clave(k), JSON.stringify(v)); } catch (e) { console.warn('[almacen] no se pudo guardar', e); } }
const colLocal = c => leerLocal(`col:${c}`) || {};

// ---------- interfaz común ----------
const ruta = c => `ws/${uid}/${c}`;

export async function leerTodo(c) {
  if (modo === 'firestore') {
    const s = await fb.fs.getDocs(fb.fs.collection(fb.db, ruta(c)));
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return Object.entries(colLocal(c)).map(([id, v]) => ({ id, ...v }));
}

export async function leer(c, id) {
  if (modo === 'firestore') {
    const d = await fb.fs.getDoc(fb.fs.doc(fb.db, ruta(c), id));
    return d.exists() ? { id: d.id, ...d.data() } : null;
  }
  const v = colLocal(c)[id];
  return v ? { id, ...v } : null;
}

export async function guardar(c, id, data) {
  const limpio = JSON.parse(JSON.stringify(data));
  delete limpio.id;
  if (modo === 'firestore') return fb.fs.setDoc(fb.fs.doc(fb.db, ruta(c), id), limpio, { merge: true });
  const col = colLocal(c); col[id] = { ...(col[id] || {}), ...limpio }; guardarLocal(`col:${c}`, col);
}

// ops: [{ op: 'set' | 'delete', c, id, data }]
export async function lote(ops) {
  if (modo === 'firestore') {
    for (let i = 0; i < ops.length; i += 450) {
      const b = fb.fs.writeBatch(fb.db);
      for (const o of ops.slice(i, i + 450)) {
        const ref = fb.fs.doc(fb.db, ruta(o.c), o.id);
        if (o.op === 'delete') b.delete(ref);
        else { const l = JSON.parse(JSON.stringify(o.data)); delete l.id; b.set(ref, l, { merge: !o.reemplazar }); }
      }
      await b.commit();
    }
    return;
  }
  const cache = {};
  for (const o of ops) {
    cache[o.c] ||= colLocal(o.c);
    if (o.op === 'delete') delete cache[o.c][o.id];
    else { const l = JSON.parse(JSON.stringify(o.data)); delete l.id; cache[o.c][o.id] = o.reemplazar ? l : { ...(cache[o.c][o.id] || {}), ...l }; }
  }
  for (const [c, v] of Object.entries(cache)) guardarLocal(`col:${c}`, v);
}

// Registro de auditoría de solo agregar.
export async function auditar(ev) {
  const reg = { ...ev, t: new Date().toISOString() };
  if (modo === 'firestore') { await fb.fs.addDoc(fb.fs.collection(fb.db, ruta('auditoria')), reg); return reg; }
  const col = colLocal('auditoria');
  col[`a${Date.now()}${Math.random().toString(36).slice(2, 6)}`] = reg;
  guardarLocal('col:auditoria', col);
  return reg;
}

export async function borrarColeccion(c) {
  const todos = await leerTodo(c);
  await lote(todos.map(d => ({ op: 'delete', c, id: d.id })));
}

export function preferencia(k, v) {
  if (v === undefined) return leerLocal(`pref:${k}`);
  guardarLocal(`pref:${k}`, v);
}
