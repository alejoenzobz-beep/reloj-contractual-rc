# Reloj Contractual v2: revisión crítica y backlog para Claude Code

## 0. Prompt de arranque (pegar en Claude Code)

> Lee `CLAUDE.md` y `docs/REVISION_Y_BACKLOG.md`. Revisa `referencia_v1/public/js/app.js` para ver qué funciones de la v1 hay que absorber.
>
> Ejecuta las tareas P0 en el orden indicado. Antes de cada tarea, escribe en 5 líneas qué vas a cambiar. Después de cada tarea:
> - toma capturas y aplica el checklist de la sección 7;
> - corrige lo que falle;
> - haz un commit.
>
> Si una tarea necesita algo de la sección 5 (claves, carpetas), avísame y continúa con la siguiente.

---

## 1. Diagnóstico: qué falla hoy y por qué importa

| # | Problema | Por qué importa | Dirección |
|---|---|---|---|
| 1 | No queda claro **qué es**. Falta decir «asistente de trazabilidad documental y contractual». | El evaluador no sabe qué está mirando. | La identidad va en el encabezado, en el saludo, en el título de la página y en el pie. |
| 2 | La v2 **enlaza a la v1** («Operación completa ↗»). | Da a entender que la v2 está incompleta. La v2 reemplaza a la v1. | Quitar el enlace. Absorber en la v2 la ingesta, el procesamiento, los parámetros, las cartas, la auditoría y las pruebas. |
| 3 | «Panorama» es en realidad una **bandeja** sin contexto de proyecto. | No responde «¿qué tengo que atender hoy y en qué proyecto?». | Crear una «Bandeja de cambios» filtrable por proyecto, por estado y por plazo. |
| 4 | El **dial fija «1 día»** como si fuera la regla. | Cada contrato tiene su plazo. Los casos de 5 y 7 días son ejemplos, no la norma. | Mostrar un plazo parametrizado por proyecto: plazo contractual frente a tiempo para entender el cambio frente a margen. |
| 5 | El tono es casual («¿Te ha pasado esto?»). | Resta seriedad técnica. | Un tono profesional. El caso se presenta como «caso de referencia», con su dato y su fuente. |
| 6 | El interruptor de tema ocupa un lugar protagónico. | Es secundario. | Un ícono pequeño en la barra superior. |
| 7 | «Prueba tu documento» **no demuestra nada**: no hay antes ni después, no se suben archivos y no hay animación. | Es el corazón del producto y hoy no se ve. | Un comparador de revisiones: subir o pegar dos versiones, un barrido animado que detecta los cambios y tarjetas con la evidencia. |
| 8 | La pastilla «IA en vivo» **no se entiende**, y no se ve la instrucción enviada ni cómo conectar la IA. | La v1 sí ofrecía dos caminos: clave de API o modo manual con instrucciones. Se perdió. | Tres modos explícitos: demostración, clave gratuita y manual. La instrucción siempre está a la vista. |
| 9 | No hay **saludo ni contexto de trabajo**: proyecto, entorno de datos (CDE) y conexión. | No se siente como un asistente. | Una pantalla de inicio conversacional: proyecto, CDE (ACC, Drive, Notion o una carpeta) y resumen del día. |
| 10 | La **auditoría y las pruebas** no se entienden. | Son la prueba de confianza y hoy parecen tablas técnicas. | La auditoría como línea de tiempo sellada. Las pruebas como una lista de comprobación de qué garantiza cada una. |
| 11 | El flujo **no termina en un producto**. | Para quien está en obra, el valor es el documento listo para firmar. | Generar una carta, acta o informe editable y exportable (DOCX, PDF o MD), con herramientas para resumir, traducir y revisar. |
| 12 | La guía de uso explica pero no conduce. | El evaluador tiene 5 minutos. | Un recorrido guiado de 6 pasos, que se puede saltar, sobre datos de demostración. |

---

## 2. Concepto: un solo flujo y una sola herramienta

```
Conectar → Detectar → Entender → Decidir → Emitir → Auditar
  CDE        diff      partida     persona   carta    sello
```

| Módulo de la v2 (menú) | Qué absorbe de la v1 | Qué responde |
|---|---|---|
| **Inicio (asistente)** | Panorama | «Buenos días. Proyecto: Edificio multifamiliar R1. 3 cambios nuevos, 1 urgente.» |
| **Bandeja de cambios** | `#/bandeja` | Qué hay que atender, ordenado por plazo restante |
| **Comparar revisiones** | `#/ingesta` + `#/procesar` | Qué cambió entre la revisión A y la B, y dónde |
| **Detalle del cambio** | `alerta(id)` | Evidencia, partida, plazo y decisión |
| **Plazos y parámetros** | `#/parametros` | Las reglas de cada contrato: días, hábiles o calendario, feriados |
| **Documentos de salida** | `#/cartas` | El borrador listo para editar y exportar |
| **Auditoría** | `#/auditoria` | Quién decidió qué y cuándo, sin posibilidad de borrarlo |
| **Calidad** | `#/pruebas` + Resultados | Qué tan bien detecta (cifras reales) y qué pruebas pasa |
| **Ajustes** | Ajustes de IA | El modo de IA, las conexiones y el proyecto |

El menú se agrupa en **Trabajo** (Inicio, Bandeja, Comparar, Salidas) y **Control** (Plazos, Auditoría, Calidad, Ajustes).

---

## 3. Arquitectura propuesta (gratuita y sin tarjeta)

```
Navegador (HTML + JS sin framework, o Vite si hace falta)
 ├─ nucleo.js           fórmulas y validación (sin cambios)
 ├─ comparador.js       diff de texto (jsdiff), de PDF (pdf.js) e imagen (pixelmatch) + OCR opcional (tesseract.js)
 ├─ ia.js               3 modos: demostración | servidor (Gemini) | manual (copiar y pegar)
 ├─ salidas.js          carta, acta e informe → DOCX (librería docx) / PDF (CSS de impresión) / MD
 ├─ auditoria.js        eventos encadenados con SHA-256 (SubtleCrypto) en IndexedDB
 └─ conectores.js       Drive (Google Picker), carpeta local (File System Access), ACC y Notion (demostración)
Netlify Functions
 ├─ ia.mjs              proxy a Gemini; clave en GEMINI_API_KEY; límite simple por IP
 └─ telegram.mjs        envía una alerta a un chat (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)
```

**Decisiones y sus razones**
- **Se usa Gemini (Google AI Studio) en lugar de la API de Anthropic que tenía la v1.** La de Anthropic exige pago con tarjeta; la clave de AI Studio es gratuita y no la pide.
  - Advertencia: en el plan gratuito, Google puede usar los datos enviados. Por eso se usan solo documentos de demostración, y la interfaz lo dice.
  - Verificar el modelo Flash gratuito vigente en el momento de crear la clave.
- **La clave va en una Netlify Function y no en el navegador.** La v1 usaba `dangerouslyAllowBrowser`, que expone la clave en un repositorio público.
- **El almacenamiento es local (IndexedDB).** Firestore de la v1 sumaba usuarios reales, pero no hace falta para la demostración. Se declara «datos locales de este navegador».
- **ACC y Notion quedan como conexiones de demostración, rotuladas.** Integrarlos de verdad requiere una app en Autodesk Platform Services o una integración de Notion: queda para la ruta P2.

**Modos de IA, siempre visibles en la barra superior**

| Modo | Etiqueta en la interfaz | Qué hace |
|---|---|---|
| Demostración | `IA: respuestas registradas` | Usa `registrado.json`, medido en la prueba ciega |
| Servidor | `IA: Gemini (en vivo)` | Llama a `/.netlify/functions/ia` |
| Manual | `IA: manual` | Muestra la instrucción completa, botón «Copiar» y campo «Pegar respuesta» |

En los tres modos hay un panel plegable **«Ver instrucción enviada»** con el prompt exacto (`INSTRUCCIONES` de `nucleo.js`). Así se ve que la IA no es una caja negra.

---

## 4. Backlog

### P0: para la entrega (en este orden)

**T0. Identidad y limpieza** (30 min)
- Quitar «Operación completa ↗» y cualquier mención a la v1.
- El título de la app, el `<title>`, el saludo y el pie dicen «Asistente de trazabilidad documental y contractual».
- El tema claro y oscuro pasa a ser un ícono de 32 px en la barra superior.
- Reescribir los textos de tono casual: «¿Te ha pasado esto?» pasa a ser «Caso de referencia», con cifra y fuente.
- *Aceptación:* `grep -ri "v1\|operación completa\|te ha pasado"` en la interfaz no devuelve nada.

**T1. Comparar revisiones con animación** (la tarea de mayor impacto)
- **Tres entradas:**
  - pegar texto A y B;
  - subir dos PDF (se extrae el texto con pdf.js);
  - subir dos imágenes de lámina (se compara con pixelmatch y se superpone el resultado).
- **Par de demostración precargado:** una lámina SVG en revisión A y B, generada por ti. Por ejemplo, la viga V-1 pasa de 0,30 × 0,60 a 0,30 × 0,70, y cambia una nota de concreto f'c. Va rotulada «ejemplo».
- **Animación:**
  1. Una línea de barrido recorre el documento.
  2. Las zonas que cambiaron se iluminan una por una.
  3. Un contador muestra «3 cambios detectados».
  4. Un mensaje dice «2 no eran evidentes a simple vista».
- **Cada cambio es una tarjeta** con: dónde (página o zona), antes y después, la cita literal verificada y la partida propuesta por la IA, con su confianza.
- Botón **«Crear alerta con estos cambios»**: pasa el resultado a la Bandeja y abre el detalle.
- *Aceptación:* con el ejemplo, se pasa del archivo a la tarjeta en menos de 10 segundos y sin escribir nada. Con dos PDF reales de texto, detecta los cambios de cifras.

**T2. Modos de IA honestos** (sección 3)
- La pastilla de modo se puede pulsar y abre Ajustes.
- El modo manual reproduce el `bloqueManual` de la v1: instrucción, «Copiar», campo de pegado y validación con `parsearI1` / `parsearI2`.
- La función `ia.mjs` responde con el mismo formato que esperan los parseadores.
- *Aceptación:* los tres modos procesan el par de demostración. Si la función no tiene clave, la interfaz dice «Servidor sin clave: usa el modo manual o el de demostración».

**T3. Plazo generalizado**
- **Parámetros por proyecto:** plazo contractual en días, hábiles o calendario, feriados y fecha de recepción. Ya existen `fechaLimite`, `sumarHabiles` y `semaforo`.
- **Visual por cambio:** una barra horizontal de tiempo, desde la recepción (día 0) hasta el límite contractual. Tiene tres tramos:
  - *Para entender el cambio:* lo estimado sin asistente frente a lo que toma con el asistente.
  - *Para sustentar:* el margen que queda.
  - *Hoy:* un marcador de la fecha actual.
- **En Inicio:** un mini gráfico con todos los cambios abiertos ordenados por días restantes, en lugar del dial fijo.
- Los casos de 5 y 7 días aparecen solo en «Calidad → Casos de referencia».
- *Aceptación:* al cambiar el plazo del proyecto de 5 a 15 días, todas las barras y semáforos se recalculan. No queda ningún «1 día» fijo en el código.

**T4. Inicio como asistente y Bandeja**
- **Inicio:**
  - El saludo: «Buenos días. ¿En qué proyecto trabajamos hoy?», con un selector de proyecto (2 o 3 proyectos de demostración con plazos distintos).
  - El estado del entorno de datos: «Conectado a: Google Drive · carpeta /Revisiones», o «Sin conexión: conectar».
  - El resumen: cambios nuevos, urgentes y por emitir.
  - Los accesos: Comparar, Bandeja y Salidas.
- **Bandeja:** una tabla o tarjetas con filtros (proyecto, estado, días restantes, especialidad) y orden por urgencia.
- **Recorrido guiado** de 6 pasos (Conectar → … → Auditar), que se puede saltar.
- *Aceptación:* un evaluador sin instrucciones llega a emitir una carta del ejemplo en menos de 2 minutos.

**T5. Documentos de salida**
- **Tres plantillas:**
  - carta de notificación (`camposCarta` y `cartaPlantilla`);
  - acta de reunión por cambio;
  - informe de impacto (partida, metrado y plazo).
- Un editor en la misma página, con los campos verificables resaltados.
- `verificarCarta` muestra en vivo los avisos («falta la cita», «fecha fuera de plazo»).
- **Herramientas:** resumir, traducir al inglés y revisar coherencia. Usan el modo de IA activo; en modo demostración muestran salidas registradas.
- **Exportar:** DOCX, PDF y MD, más el botón «Enviar a Telegram» si es P1.
- *Aceptación:* el archivo DOCX abre en Word con la cita, la partida y la fecha límite correctas.

**T6. Auditoría y calidad legibles**
- **Auditoría:** una línea de tiempo vertical. Cada evento (detectado, revisado, corregido, emitido) muestra quién, cuándo y el hash encadenado (abreviado).
  - El botón «Verificar integridad» recalcula la cadena y marca ✓.
  - Si un evento se altera en la demostración, la cadena se marca en rojo.
- **Calidad:** las cifras de `cifras.json` en el gráfico actual, más la lista de pruebas automatizadas. Cada prueba dice qué garantiza, por ejemplo «Una cita que no está en el texto se rechaza», y lleva ✓/✗ ejecutado en vivo (portar `pruebas.js` de la v1).
- *Aceptación:* se puede explicar en una frase qué prueba cada elemento.

### P1: si queda tiempo
- **T7. Google Drive real:** Google Picker para elegir dos revisiones de una carpeta y llevarlas al comparador.
- **T8. Alerta por Telegram:** `telegram.mjs` envía el resumen del cambio y su plazo.
- **T9. OCR** con tesseract.js para láminas escaneadas.
- **T10.** Una versión móvil cuidada de la Bandeja y el Detalle.

### P2: ruta después del diplomado
- ACC real (Autodesk Platform Services) y Notion real.
- Varios usuarios con roles (Firestore o Supabase en plan gratuito).
- Lectura de metrados (XLSX) y comparación con el presupuesto.

---

## 5. Lo que tienes que facilitar (todo gratuito y sin tarjeta)

| Para | Qué | Cómo |
|---|---|---|
| T2 (IA en vivo) | Clave de Gemini | aistudio.google.com → Get API key → pegarla en Netlify → Site settings → Environment variables como `GEMINI_API_KEY` |
| Publicación | Repositorio en GitHub vinculado a Netlify | Ya lo tienes en curso. Build: ninguno; carpeta de publicación: `/`; funciones: `netlify/functions` |
| T1 (demostración con archivos reales, opcional) | 2 PDF o 2 imágenes de una misma lámina en revisiones A y B | Sin datos sensibles; pueden ser de un proyecto académico |
| T7 (Drive) | ID de cliente OAuth y clave de API de Google Cloud | console.cloud.google.com → nuevo proyecto → activar Drive API y Picker API → credenciales (no exige facturación) |
| T8 (Telegram) | Token del bot y tu chat_id | @BotFather → /newbot. Para el chat_id: escribirle al bot y abrir `getUpdates` |

---

## 6. Coherencia con los demás entregables (hacer después del P0)

- **Presentación:**
  - Diapositiva 8: pasar de «un núcleo, dos capas (v1/v2)» a «una herramienta, un flujo: Conectar → … → Auditar».
  - Diapositivas 5 a 7: tomar capturas nuevas (Comparar con la animación, Detalle con la barra de plazo, Salidas).
  - Diapositivas 1 y 15: poner el enlace de Netlify.
- **Ficha técnica, §2 y §4:** el enlace de Netlify, la arquitectura de la sección 3 y los modos de IA.
- **`Cambios_para_Kevin.md`:** cambiar el punto «se enlaza la operación completa» por «la v2 absorbe la operación de la v1, rediseñada». La razón: un solo producto entendible en 5 minutos, y la lógica de Kevin (`nucleo.js`) se mantiene intacta.
- **Guion del video:** el recorrido sigue el flujo de la sección 2, con el par de demostración.

---

## 7. Checklist de autocrítica (aplicar después de cada tarea)

1. **Prueba de los 5 segundos:** solo con la pantalla, ¿se entiende qué es y qué hacer ahora?
2. **Verdad:** ¿todo número viene de `cifras.json` o de un cálculo de `nucleo.js`? ¿Lo simulado dice «demostración»?
3. **Producto:** ¿la vista termina en una acción o en un archivo útil?
4. **Tono:** ¿profesional y técnico, sin jerga interna?
5. **Visual:** ¿jerarquía clara? ¿El movimiento explica algo? ¿Hay texto partido, desbordes o contraste bajo? Revisar en 1440 px y en 390 px.
6. **Robustez:** ¿hay errores en la consola? ¿Qué pasa sin clave, sin red o con un archivo vacío? El mensaje debe decir qué pasó y cómo seguir.
