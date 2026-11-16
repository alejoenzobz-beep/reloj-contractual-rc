// Núcleo lógico del Reloj Contractual (Grupo 4 · AECODE).
// Funciones puras: se usan en el navegador (app) y en Node (scripts de corrida y pruebas).
// Principio del diseño: el modelo lee y propone; la fórmula cuenta; la persona decide.

export const SEP = ' | ';

// ---------- utilidades de texto ----------
export function normalizar(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[“”«»"]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- fechas (cadenas ISO AAAA-MM-DD, sin zona horaria) ----------
export function isoAFecha(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function fechaAIso(f) { return f.toISOString().slice(0, 10); }
export function sumarDias(iso, n) { const f = isoAFecha(iso); f.setUTCDate(f.getUTCDate() + n); return fechaAIso(f); }
export function difDias(isoA, isoB) { return Math.round((isoAFecha(isoA) - isoAFecha(isoB)) / 86400000); }
export function hoyIso(d = new Date()) { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }
export function fmtFecha(iso) { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

// WORKDAY: suma n días hábiles (lunes a viernes, sin feriados).
export function sumarHabiles(iso, n, feriados = []) {
  const fer = new Set(feriados);
  let f = iso, c = 0;
  while (c < n) {
    f = sumarDias(f, 1);
    const dow = isoAFecha(f).getUTCDay();
    if (dow !== 0 && dow !== 6 && !fer.has(f)) c++;
  }
  return f;
}

// ---------- reloj contractual (RF-5) ----------
// Regla conservadora: con gatillo «conocimiento» o «instrucción» se imputa la fecha de recepción en el CDE.
export function fechaLimite(fechaRecepcion, params, feriados = []) {
  if (!fechaRecepcion || !params || !params.plazo) return null;
  const inicio = fechaRecepcion; // gatillo recepción, conocimiento imputado o instrucción documentada
  return params.tipo_dias === 'habiles'
    ? sumarHabiles(inicio, Number(params.plazo), feriados)
    : sumarDias(inicio, Number(params.plazo));
}
export function diasRestantes(fLimite, hoy) { return fLimite ? difDias(fLimite, hoy) : null; }
export function semaforo(d) {
  if (d === null || d === undefined) return 'gris';
  if (d < 0) return 'vencido';
  if (d <= 1) return 'rojo';
  if (d <= 3) return 'ambar';
  return 'verde';
}

// ---------- ingesta (RF-1) ----------
export function validarIngesta(doc) {
  const errores = [];
  if (!doc.doc_id) errores.push('Falta el código del documento');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.fecha_recepcion || '')) errores.push('Falta la fecha de recepción en el CDE o no tiene formato AAAA-MM-DD');
  if (!String(doc.texto || '').trim()) errores.push('El documento no tiene contenido legible');
  if (doc.tipo === 'Lámina' && !String(doc.texto_anterior || '').trim())
    errores.push(`La revisión anterior (${doc.revision_anterior || '¿?'}) no está en el corpus: no se puede comparar`);
  return errores;
}

// ---------- regla de vinculación R-V ----------
export function confianzaRV(criterios) {
  const n = criterios.filter(Boolean).length;
  return n >= 4 ? 'Alta' : n === 3 ? 'Media' : 'Baja';
}

// ---------- instrucciones versionadas ----------
export const INSTRUCCIONES = {
  I1: {
    'v1.0': {
      fecha: '2026-11-02',
      cambio: 'Versión inicial (Plan del Hito 2, recuadro 1).',
      sistema:
`Rol: asistente de oficina técnica de una obra privada de edificación.
Tarea: para cada documento, compara la revisión anterior con la revisión actual y describe en lenguaje de obra cada cambio que pueda afectar el costo, el plazo o el alcance del contrato. En cartas y respuestas de RFI no hay revisión anterior que comparar: identifica las instrucciones o respuestas que modifican el alcance, las especificaciones o el plazo.
Reglas:
1. Una fila por cambio. Si un documento no tiene cambios con impacto (solo rótulo, ortografía, reemisión o confirmación de lo ya indicado), escribe una sola fila con cambio = SIN CAMBIOS.
2. cita_textual: copia literal y exacta de un fragmento de la revisión actual (máximo 25 palabras) que sustente el cambio. No parafrasees ni corrijas el texto citado.
3. No estimes montos, metrados ni fechas.
4. No uses el carácter | dentro de los campos.
Formato obligatorio: sin encabezado, sin texto adicional, sin viñetas. Una fila por cambio con los campos separados por " | ":
doc_id | n | cambio | ubicacion | especialidad | elemento | cita_textual`,
    },
    'v1.1': {
      fecha: '2026-11-02',
      cambio: 'Tras la corrida v1.0 y su repetición: el modelo partía de forma variable los cambios de un mismo elemento (sección y refuerzo de C-5, fases y tierra de TG–TD3, piso y zócalo, baranda y murete). Se fija la regla «una fila por elemento modificado».',
      sistema:
`Rol: asistente de oficina técnica de una obra privada de edificación.
Tarea: para cada documento, compara la revisión anterior con la revisión actual y describe en lenguaje de obra cada cambio que pueda afectar el costo, el plazo o el alcance del contrato. En cartas y respuestas de RFI no hay revisión anterior que comparar: identifica las instrucciones o respuestas que modifican el alcance, las especificaciones o el plazo.
Reglas:
1. Una fila por elemento modificado. Si un mismo elemento cambia en varios aspectos (dimensiones, refuerzo, material, accesorios, base o soporte, conductor de tierra), descríbelos todos en la misma fila. Usa filas separadas solo para elementos distintos (por ejemplo, una placa que crece y una viga que se elimina).
2. Si un documento no tiene cambios con impacto (solo rótulo, ortografía, reemisión o confirmación de lo ya indicado), escribe una sola fila con cambio = SIN CAMBIOS.
3. cita_textual: copia literal y exacta de un fragmento de la revisión actual (máximo 25 palabras) que sustente el cambio. No parafrasees ni corrijas el texto citado.
4. No estimes montos, metrados ni fechas.
5. No uses el carácter | dentro de los campos.
Formato obligatorio: sin encabezado, sin texto adicional, sin viñetas. Una fila por elemento modificado con los campos separados por " | ":
doc_id | n | cambio | ubicacion | especialidad | elemento | cita_textual`,
    },
  },
  I2: {
    'v1.0': {
      fecha: '2026-11-02',
      cambio: 'Versión inicial (Plan del Hito 2, recuadro 1).',
      sistema:
`Rol: asistente de oficina técnica.
Entrada: hechos de cambio (id, descripción, ubicación, especialidad, elemento) y la lista de partidas del presupuesto contractual.
Tarea: para cada hecho, propone la partida más probable aplicando únicamente la regla R-V. Evalúa cuatro criterios entre el cambio y la partida candidata y marca cada uno con ✓ o ✗:
C1 mismo tipo de elemento (placa, viga, losa, tabique, puerta, salida…);
C2 misma especialidad;
C3 ubicación compatible (nivel, sector o ambiente al que aplica la partida);
C4 rango o unidad compatible (espesor, altura, diámetro, sección, unidad de medida).
Confianza: Alta con 4 ✓, Media con 3 ✓, Baja con 2 ✓ o menos. Con confianza Media o Baja indica siempre una partida alternativa.
Si ninguna partida cumple al menos dos criterios, escribe SIN PARTIDA en partida_codigo y partida_desc.
No inventes códigos: usa solo los de la lista. No estimes montos ni metrados. No uses el carácter | dentro de los campos.
Formato obligatorio: sin encabezado ni texto adicional. Una fila por hecho con los campos separados por " | ":
id_cambio | partida_codigo | partida_desc | actividad | C1 | C2 | C3 | C4 | confianza | sustento | partida_alternativa`,
    },
  },
  I3: {
    'v1.0': {
      fecha: '2026-11-02',
      cambio: 'Versión inicial (Plan del Hito 2, recuadro 1).',
      sistema:
`Rol: asistente de administración contractual.
Entrada: extracto del contrato.
Tarea: identifica las cláusulas que obligan al contratista a notificar variaciones de precio o de plazo. Para cada una transcribe literalmente el fragmento e indica el gatillo (recepcion, conocimiento o instruccion), el plazo numérico, el tipo de días (calendario o habiles) y la consecuencia del incumplimiento. Si hay más de una cláusula aplicable, lístalas todas. Si un parámetro no está explícito, escribe «no explícito»; nunca lo supongas. No calcules fechas. No uses el carácter | dentro de los campos.
Formato obligatorio: sin encabezado ni texto adicional. Una fila por cláusula con los campos separados por " | ":
clausula | texto_literal | gatillo | plazo | tipo_dias | consecuencia`,
    },
  },
  I4: {
    'v1.0': {
      fecha: '2026-11-02',
      cambio: 'Versión inicial (Plan del Hito 2, componente 14).',
      sistema:
`Rol: asistente de oficina técnica que redacta borradores de cartas contractuales.
Tarea: redacta el cuerpo de una carta de notificación de variación dirigida a LA PROPIETARIA usando únicamente los campos confirmados que se entregan en formato JSON.
Reglas: no agregues cifras, fechas, códigos ni hechos que no estén en los campos; cita la cláusula, el documento de origen con su revisión y la fecha de recepción; indica que la valorización se presentará según el procedimiento contractual. Entre 90 y 160 palabras, en español formal, sin saludo ni firma (los pone la plantilla). Devuelve solo el texto.`,
    },
  },
};

export const VERSION_VIGENTE = { I1: 'v1.1', I2: 'v1.0', I3: 'v1.0', I4: 'v1.0' };

// ---------- construcción de mensajes ----------
export function mensajeI1(docs) {
  const bloques = docs.map(d => {
    const ant = d.tipo === 'Lámina'
      ? `Revisión anterior (${d.revision_anterior}):\n${d.texto_anterior}`
      : `Antecedente (${d.revision_anterior || '—'}):\n${d.texto_anterior || '(no aplica)'}`;
    return `=== Documento ${d.doc_id} · ${d.tipo} · ${d.titulo} · ${d.especialidad} ===\n${ant}\nRevisión actual (${d.revision}):\n${d.texto}`;
  });
  return `Documentos a analizar (${docs.length}):\n\n${bloques.join('\n\n')}`;
}

export function mensajeI2(hechos, partidas) {
  const lp = partidas.map(p => `${p.codigo} | ${p.desc} | ${p.und} | ${p.esp}`).join('\n');
  const lh = hechos.map(h => `${h.id} | ${h.cambio} | ${h.ubicacion} | ${h.especialidad} | ${h.elemento}`).join('\n');
  return `Lista de partidas (código | descripción | unidad | especialidad):\n${lp}\n\nHechos de cambio (id | cambio | ubicación | especialidad | elemento):\n${lh}`;
}

export function mensajeI3(contrato) { return `Extracto contractual:\n\n${contrato.texto}`; }

export function camposCarta(alerta, params, doc) {
  return {
    clausula: params.clausula,
    plazo: `${params.plazo} días ${params.tipo_dias === 'habiles' ? 'hábiles' : 'calendario'}`,
    documento: alerta.doc_id,
    revision: doc ? doc.revision : '',
    titulo_documento: doc ? doc.titulo : '',
    fecha_recepcion: fmtFecha(alerta.fecha_recepcion),
    cambio: alerta.cambio,
    ubicacion: alerta.ubicacion,
    partida: alerta.partida ? `${alerta.partida} ${alerta.partida_desc}` : 'Sin partida en el presupuesto contractual',
    metrado_preliminar: alerta.metrado ? `${alerta.metrado}` : 'por determinar',
  };
}
export function mensajeI4(campos) { return `Campos confirmados (JSON):\n${JSON.stringify(campos, null, 2)}`; }

// Plantilla sin IA (contingencia y modo sin conexión).
export function cartaPlantilla(c) {
  return `De acuerdo con la cláusula ${c.clausula} del contrato, que establece un plazo de ${c.plazo} para notificar variaciones, por medio de la presente notificamos que el documento ${c.documento} (revisión ${c.revision}), recibido en el entorno común de datos el ${c.fecha_recepcion}, introduce el siguiente cambio: ${c.cambio} (${c.ubicacion}). Este cambio afecta la partida ${c.partida}, con un metrado preliminar ${c.metrado_preliminar}. La valorización correspondiente se presentará conforme al procedimiento contractual, con el sustento de metrados y análisis de precios unitarios.`;
}

// ---------- parseo y validación de salidas ----------
function filas(texto) {
  return String(texto || '')
    .split(/\r?\n/)
    .map(l => l.trim().replace(/^[-*•]\s*/, ''))
    .filter(l => l && l.includes('|') && !/^[-|\s:]+$/.test(l));
}
function partes(l) {
  let p = l.split('|').map(s => s.replace(/\*\*/g, '').replace(/`/g, '').trim());
  if (p[0] === '') p = p.slice(1);
  if (p[p.length - 1] === '') p = p.slice(0, -1);
  return p;
}
const esEncabezado = (p, k) => normalizar(p[0]) === k;

// I1 → hechos de cambio. Rechaza filas fuera de formato o sin cita verificable (CP-10).
export function parsearI1(texto, docsPorId) {
  const hechos = [], sinCambios = [], rechazadas = [];
  for (const l of filas(texto)) {
    const p = partes(l);
    if (esEncabezado(p, 'doc_id')) continue;
    if (p.length < 7) {
      if (p.length >= 3 && /sin cambios/i.test(p[2] || '')) { sinCambios.push(p[0]); continue; }
      rechazadas.push({ linea: l, motivo: 'Fuera de formato (se esperaban 7 campos)' }); continue;
    }
    const [doc_id, n, cambio, ubicacion, especialidad, elemento] = p;
    const cita = p.slice(6).join(' | ');
    const doc = docsPorId[doc_id];
    if (!doc) { rechazadas.push({ linea: l, motivo: `Documento ${doc_id} no existe en el corpus` }); continue; }
    if (/^sin cambios/i.test(cambio)) { sinCambios.push(doc_id); continue; }
    const citaLimpia = cita.replace(/^["«“]|["»”]$/g, '').replace(/\.\.\.|…/g, '').trim();
    const verificada = citaLimpia.length >= 8 && normalizar(doc.texto).includes(normalizar(citaLimpia));
    if (!citaLimpia) { rechazadas.push({ linea: l, motivo: 'Sin cita: la fila se rechaza (RF-6)' }); continue; }
    if (!verificada) { rechazadas.push({ linea: l, motivo: 'La cita no aparece literalmente en el documento (RF-6)' }); continue; }
    hechos.push({ doc_id, n: Number(n) || 1, cambio, ubicacion, especialidad, elemento, cita: citaLimpia, cita_verificada: true });
  }
  return { hechos, sinCambios, rechazadas };
}

const marca = s => /✓|si|sí|ok|true|cumple|^v$/i.test(String(s).trim()) && !/✗|no|x/i.test(String(s).trim());

// I2 → vínculo con partida. Valida código contra la lista y recalcula la confianza con R-V.
export function parsearI2(texto, partidasPorCodigo, idsValidos) {
  const vinculos = {}, rechazadas = [];
  for (const l of filas(texto)) {
    const p = partes(l);
    if (esEncabezado(p, 'id_cambio')) continue;
    if (p.length < 11) { rechazadas.push({ linea: l, motivo: 'Fuera de formato (se esperaban 11 campos)' }); continue; }
    const [id, codigo, desc, actividad, c1, c2, c3, c4, confModelo, sustento, alt] = p;
    if (idsValidos && !idsValidos.has(id)) { rechazadas.push({ linea: l, motivo: `Hecho ${id} desconocido` }); continue; }
    const sinPartida = /sin partida/i.test(codigo);
    if (!sinPartida && !partidasPorCodigo[codigo]) { rechazadas.push({ linea: l, motivo: `Código ${codigo} no existe en la lista de partidas` }); continue; }
    const criterios = [c1, c2, c3, c4].map(marca);
    const confRegla = confianzaRV(criterios);
    const altCodigo = (alt.match(/\d{2}\.\d{2}\.\d{2}/) || [null])[0];
    vinculos[id] = {
      partida: sinPartida ? null : codigo,
      partida_desc: sinPartida ? 'Sin partida aplicable' : partidasPorCodigo[codigo].desc,
      actividad, criterios, confianza: sinPartida ? 'Baja' : confRegla,
      confianza_modelo: confModelo,
      confianza_ajustada: !sinPartida && normalizar(confModelo) !== normalizar(confRegla),
      sustento,
      alternativa: altCodigo && partidasPorCodigo[altCodigo] ? altCodigo : null,
      alternativa_desc: altCodigo && partidasPorCodigo[altCodigo] ? partidasPorCodigo[altCodigo].desc : '',
    };
  }
  return { vinculos, rechazadas };
}

export function parsearI3(texto) {
  const clausulas = [], rechazadas = [];
  for (const l of filas(texto)) {
    const p = partes(l);
    if (esEncabezado(p, 'clausula')) continue;
    if (p.length < 6) { rechazadas.push({ linea: l, motivo: 'Fuera de formato (se esperaban 6 campos)' }); continue; }
    const [clausula, texto_literal, gatillo, plazo, tipo_dias, consecuencia] = p;
    const g = normalizar(gatillo);
    const t = normalizar(tipo_dias);
    clausulas.push({
      clausula: clausula.replace(/^cl(a|á)usula\s*/i, ''),
      texto_literal, consecuencia,
      gatillo: g.startsWith('recep') ? 'recepcion' : g.startsWith('conoc') ? 'conocimiento' : g.startsWith('instr') ? 'instruccion' : 'no explícito',
      plazo: Number((plazo.match(/\d+/) || [null])[0]) || null,
      tipo_dias: t.startsWith('hab') ? 'habiles' : t.startsWith('cal') ? 'calendario' : 'no explícito',
    });
  }
  return { clausulas, rechazadas };
}

// Control de la carta: toda cifra o fecha del borrador debe estar en los campos confirmados.
export function verificarCarta(texto, campos) {
  const fuente = normalizar(Object.values(campos).join(' '));
  const tokens = (String(texto).match(/\d+(?:[.,/]\d+)*/g) || []);
  const fuera = [...new Set(tokens.filter(t => !fuente.includes(normalizar(t))))];
  return { ok: fuera.length === 0, fuera };
}

// ---------- evaluación contra el conjunto de referencia ----------
export function evaluar({ alertas, referencia, documentos, sinCambiosPorDoc = {} }) {
  const ref = referencia.documentos;
  const filasRef = [];
  const usadas = new Set();
  const porDoc = {};
  for (const a of alertas) (porDoc[a.doc_id] ||= []).push(a);

  for (const [docId, cambios] of Object.entries(ref)) {
    if (!Array.isArray(cambios)) continue;
    for (const c of cambios) {
      const cand = (porDoc[docId] || []).filter(a => !usadas.has(a.id));
      const claves = c.claves.map(normalizar);
      const m = cand.find(a => claves.some(k => normalizar(`${a.cambio} ${a.elemento} ${a.cita}`).includes(k)));
      if (m) usadas.add(m.id);
      const partidaFinal = m ? (m.partida ?? null) : undefined;
      filasRef.push({
        ref_id: c.id, doc_id: docId, cambio_ref: c.cambio, tamano: c.tamano,
        partida_esperada: c.partida, detectado: !!m, alerta_id: m?.id || null,
        partida_propuesta: m ? (m.partida_modelo !== undefined ? m.partida_modelo : partidaFinal) : null,
        partida_ok: m ? c.aceptables.includes(m.partida_modelo !== undefined ? m.partida_modelo : partidaFinal) : false,
        confianza: m?.confianza || null,
      });
    }
  }
  const evaluables = alertas.filter(a => Array.isArray(ref[a.doc_id]) || ref[a.doc_id] === undefined);
  const fp = evaluables.filter(a => !usadas.has(a.id));
  const arb = (referencia.arbitraje?.casos || []);
  const fpArb = fp.filter(a => arb.some(x => x.doc_id === a.doc_id && x.claves.some(k => normalizar(a.cambio).includes(normalizar(k)))));
  const tp = filasRef.filter(f => f.detectado).length;
  const totalRef = filasRef.length;
  const docsSinCambio = Object.entries(ref).filter(([, v]) => Array.isArray(v) && v.length === 0).map(([k]) => k);
  const tn = docsSinCambio.filter(d => !(porDoc[d] || []).length).length;
  const vinculadas = filasRef.filter(f => f.detectado);
  const peq = filasRef.filter(f => f.tamano === 'pequeño');
  const gra = filasRef.filter(f => f.tamano === 'grande');
  const rechazosEsperados = Object.entries(ref).filter(([, v]) => v === 'rechazo').map(([k]) => k);
  const rechazosOk = rechazosEsperados.filter(id => {
    const d = documentos.find(x => x.doc_id === id);
    return d && validarIngesta(d).length > 0;
  }).length;
  return {
    total_referencia: totalRef,
    verdaderos_positivos: tp,
    falsos_positivos: fp.length,
    falsos_negativos: totalRef - tp,
    verdaderos_negativos_docs: tn,
    docs_sin_cambio: docsSinCambio.length,
    recall: totalRef ? tp / totalRef : 0,
    precision: alertas.length ? (alertas.length - fp.length) / alertas.length : 0,
    precision_arbitrada: alertas.length ? (alertas.length - fp.length + fpArb.length) / alertas.length : 0,
    arbitrados: fpArb.length,
    recall_pequenos: peq.length ? peq.filter(f => f.detectado).length / peq.length : 0,
    recall_grandes: gra.length ? gra.filter(f => f.detectado).length / gra.length : 0,
    vinculacion: vinculadas.length ? vinculadas.filter(f => f.partida_ok).length / vinculadas.length : 0,
    trazabilidad: alertas.length ? alertas.filter(a => a.cita_verificada).length / alertas.length : 0,
    rechazos_ingesta_ok: `${rechazosOk}/${rechazosEsperados.length}`,
    total_alertas: alertas.length,
    filas: filasRef,
    falsos: fp.map(a => ({ alerta_id: a.id, doc_id: a.doc_id, cambio: a.cambio, arbitraje: arb.find(x => x.doc_id === a.doc_id && fpArb.includes(a))?.dictamen || null })),
  };
}

export const UMBRALES = {
  recall: { umbral: 0.80, texto: '≥ 80 % de los cambios del conjunto de referencia' },
  precision: { umbral: 0.70, texto: '≥ 70 % de las alertas corresponden a un cambio real' },
  trazabilidad: { umbral: 1.00, texto: '100 % de salidas con fuente citada y verificada' },
  reloj: { umbral: 1.00, texto: '100 % de fechas límite iguales al cálculo manual' },
  latencia: { umbral: 24, texto: 'Alerta disponible < 24 h desde la carga' },
  utilidad: { umbral: 15, texto: 'Mediana de revisión ≤ 15 min por alerta' },
};

export function mediana(xs) {
  const a = xs.filter(x => typeof x === 'number' && !isNaN(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function pct(x, dec = 0) { return x === null || x === undefined ? '—' : `${(x * 100).toFixed(dec).replace('.', ',')} %`; }
export function horas(h) { if (h === null || h === undefined) return '—'; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h.toFixed(1).replace('.', ',')} h`; }
