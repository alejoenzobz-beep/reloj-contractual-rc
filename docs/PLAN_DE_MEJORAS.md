# Reloj Contractual: revisión del prototipo publicado y plan de mejoras

Revisión del código publicado en `reloj-contractual-rc.netlify.app` (16/11/2026, 19:00). Está pensado para que Claude Code lo ejecute. Los números de línea corresponden a `public/js/app.js`, `public/js/ia.js` y `netlify/functions/ia.mjs`.

---

## 0. Prompt de arranque (pegar en Claude Code)

```
Lee CLAUDE.md y docs/PLAN_DE_MEJORAS.md completos antes de tocar nada.

Ejecuta el plan por bloques, en orden: A, B, C y D. Antes de cada bloque escribe en 5 líneas qué vas a cambiar y por qué. Después de cada bloque: pruébalo (abre la app, recorre el flujo, corre las pruebas de nucleo.js), corrige lo que falle y haz un commit en español por bloque.

Reglas fijas:
- No inventes datos. Lo simulado dice "demostración".
- No modifiques js/nucleo.js ni referencia_v1/.
- Ninguna clave en el código del navegador ni en commits. Gemini va por la función de Netlify.
- Sin servicios que pidan tarjeta de crédito.
- Si algo necesita una credencial que no tienes (Google Cloud, Telegram), deja la función lista pero desactivada, indícalo en una línea y sigue con lo siguiente.
- Ningún texto visible puede decir "pendiente", "TODO" ni nombres internos (I1, R-V, corrida).

Usa los skills disponibles cuando apliquen: frontend-design, design-critique, ux-copy, dataviz y testing-strategy. Si hace falta un skill o paquete que no tengas, dímelo en una línea con el nombre exacto; no instales nada que no esté en este plan.

Al terminar cada bloque haz git push a main y dime en 5 líneas qué quedó hecho y qué falta.
```

---

## 1. Diagnóstico (lo que encontré en el código)

| # | Hallazgo | Evidencia | Consecuencia |
|---|---|---|---|
| 1 | **El asistente no usa IA.** Son respuestas por palabra clave (`FAQ`, líneas 678–707). Si no coincide, dice «Con las respuestas preparadas no tengo esa…». | `app.js:703-704`; `#asist-modo` dice «Respuestas preparadas». | Un asistente que responde «no puedo» no justifica su existencia. |
| 2 | **La función de Gemini no tiene camino para chat.** `ia.mjs` solo acepta los pasos `I1`, `I2` y `H` (herramientas). | `ia.mjs`, función `armar`. | Aunque haya clave, el asistente no puede llegar a Gemini. |
| 3 | **El modo por defecto es «demostración»** y el cambio está escondido en Ajustes. En pantalla, «IA en vivo» nunca se ve funcionando. | `ia.js:56` (`modo = 'demo'`). | No se entiende dónde usa IA la app. |
| 4 | **Se perdieron los roles de la v1.** Hoy hay un avatar fijo «OT». La v1 tenía cuatro roles (control documentario, oficina técnica, jefe y gerente) con permisos (`requiereRol`) y puntos de decisión PD1 a PD4. | `index.html:525`; `referencia_v1/public/js/app.js:10-16, 37-40`. | La trazabilidad pierde quién decide qué. Es la idea central del contrato. |
| 5 | **El Inicio muestra todo a la vez:** selector de proyecto, conexión al CDE, tres cifras, accesos, listas, gráfico y casos. No hay bienvenida. | `vInicio()`, líneas 200–235. | Demasiada información sin orden. Claude, ChatGPT y las apps de trabajo saludan primero y preguntan. |
| 6 | **Los plazos solo se ven como barra lineal.** Ya existe una función `calendario()` (línea 332), pero solo se usa en la simulación. | `barraPlazo`, `vBandeja`, `vAlerta`. | La barra muestra cuánto del plazo se consumió. No muestra qué día cae, qué son hábiles ni qué feriados cuentan. |
| 7 | **Subir archivos funciona, pero no se nota.** Es un `<input file>` dentro de una etiqueta, sin arrastrar y soltar, sin ícono y sin vista previa. | `comparador.js:184-188`. | No se entiende de un vistazo que se puede subir un PDF. |
| 8 | **Quedan textos «(pendiente)» visibles** en Comparar («requieren OCR (pendiente)»). | `comparador.js:187`. | Parece un trabajo sin terminar. |
| 9 | **La salida termina en descargar.** Hay DOCX, PDF y MD. No hay «enviar por correo», «copiar» ni «agregar al calendario». | `salidas.js`. | El flujo se corta en el último paso, donde el usuario más lo necesita. |
| 10 | **Las conexiones (Drive, ACC, Notion) son solo un cartel de demostración.** Está bien rotulado, pero no hay ninguna conexión real. | `CDE_OPS`, líneas 188 y 232. | Para mañana hay que tener al menos una real o decir claramente que no la hay. |
| 11 | **Auditoría mezcla dos cosas:** el historial de un caso y el registro sellado global. | `vAuditoria`. | Se lee como «el proceso», no como la prueba de que nadie alteró nada. |
| 12 | **Lo que sí funciona bien y se conserva:** el comparador con lámina de ejemplo, la animación de detección, la barra «sin asistente frente a con asistente», el recorrido guiado de 6 pasos, las tres herramientas (resumir, traducir, revisar), los tres modos de IA y los avisos en vivo de la carta. | Código revisado. | No se rompe nada de esto. |

---

## 2. Decisiones de diseño (con su razón)

**D1. El asistente pasa a ser real, con Gemini y con respaldo.**
- Una función nueva en `ia.mjs` con `paso: 'C'` (chat).
- Recibe la pregunta, la pantalla actual y un resumen de los datos del proyecto activo (en JSON, tomados de la app).
- Instrucción de sistema fija: responde solo sobre esta app, el plazo y los documentos; no calcula fechas (usa las que se le dan); si no sabe, lo dice y sugiere ir a la pantalla que corresponde.
- Puede devolver una acción, por ejemplo `{texto, accion: 'ir:comparar'}`, para que el asistente lleve al usuario a la pantalla.
- Si no hay servidor o clave, vuelve a las respuestas preparadas y lo dice: «Asistente básico (sin IA)».
- *Razón:* es lo que justifica tener un asistente. Respeta el principio: la IA explica y guía, la fórmula cuenta.

**D2. La IA se ve donde actúa.** Una etiqueta `IA` y el nombre del modo en cada resultado que viene de un modelo, y un indicador fijo en la barra superior. En la demostración, el modo por defecto pasa a ser «Gemini en vivo» si el servidor responde con clave, y «registradas» si no.

**D3. Bienvenida antes de la app.** Una pantalla completa de tres pasos, que se puede saltar y se recuerda: **quién eres → qué proyecto → dónde están tus documentos**. Después entra a un Inicio ya acotado.

**D4. Roles de vuelta, con permisos.** Cuatro roles tomados de la v1, con sus puntos de decisión. El avatar muestra el rol activo y se cambia desde un menú, con aviso de «modo demostración». Cada rol ve lo suyo: no aparecen botones que no le corresponden.

**D5. Plazos: barra y calendario, cada uno para lo que sirve.**
- **Barra** en la bandeja y en el Inicio, porque permite comparar muchos cambios de un vistazo (cuánto se consumió).
- **Calendario mensual** en el detalle, en Plazos y como vista alternativa en la bandeja (Lista | Calendario), porque responde qué día vence, qué días son hábiles y qué feriados cuentan.
- Marcan los mismos hitos: recepción (día 0), entender el cambio, hoy y límite contractual.
- *Razón:* el contrato habla de fechas. La barra sola oculta los hábiles y los feriados.

**D6. El Inicio se reduce, y el panorama pasa a ser una vista aparte.**
- **Inicio:** saludo, una acción principal («Comparar revisiones»), lo que vence primero (3 ítems) y el estado de conexión como un chip pequeño.
- **Panorama** (nueva vista): las cifras, el gráfico de plazos y la agenda. Es el tablero.
- Los casos de referencia (n = 2) se mueven a Calidad.
- El selector de proyecto y la conexión pasan a la barra superior.

**D7. La salida llega hasta el destinatario, con lo que es gratis y real:**
- **Archivo `.eml`** con la carta en DOCX adjunta: se abre en Outlook o Gmail listo para enviar. No necesita API.
- **«Abrir en mi correo»** (`mailto:`, con asunto y texto de cortesía).
- **«Copiar texto de la carta»** y **«Copiar instrucción para mi IA»**.
- **«Agregar al calendario»**: un archivo `.ics` con la fecha límite y un aviso dos días antes. Sirve con Google Calendar, Outlook y Apple.
- **Opcionales con credencial:** subir la carta a Drive y enviar la alerta por Telegram.

**D8. Los dos caminos de IA se explican al conectar:** *usar el servidor de la app (Gemini)*, *usar mi propia clave* o *modo manual (copiar y pegar la instrucción)*. Una tarjeta de tres columnas en Ajustes y en el primer uso, con una línea sobre cuándo conviene cada una.

**D9. Zona de carga clara** en Comparar: recuadro con ícono, «Suelta aquí tu PDF o imagen», arrastrar y soltar, nombre del archivo, tamaño y miniatura de la primera página. Y una carga de carpeta (`webkitdirectory`) que empareja revisiones A y B por nombre.

**D10. Auditoría separada en dos:** *Trazabilidad del caso* (línea de tiempo dentro del detalle) y *Registro de auditoría* (la cadena sellada global, con «Verificar integridad»).

**D11. Etiqueta «Versión beta · datos de demostración»** visible pero discreta en la barra superior. Es la excepción a la regla de no mostrar «pendiente»: es un rótulo de estado, no una tarea sin hacer.

---

## 3. Qué hay que conseguir (todo gratuito y sin tarjeta)

| Qué | Para qué | Estado | Cómo |
|---|---|---|---|
| Clave de Gemini | Asistente y herramientas en vivo | **Ya está en Netlify** | Nada que hacer |
| Cliente OAuth de Google Cloud | Elegir archivos de Drive (Picker) y subir la carta | **Falta** | console.cloud.google.com → proyecto nuevo → activar «Google Drive API» y «Google Picker API» → pantalla de consentimiento (externo, en pruebas, añadir tu correo como usuario de prueba) → credenciales: ID de cliente OAuth «aplicación web» con el origen autorizado `https://reloj-contractual-rc.netlify.app`, y una clave de API restringida a esos dos servicios. Pasa a Claude Code solo el **ID de cliente** y la **clave de API**; ambos son públicos por diseño. No se necesita facturación. |
| Bot de Telegram | Alertas al celular | **Falta** | En Telegram, @BotFather → `/newbot` → guarda el token. Escríbele cualquier mensaje a tu bot y abre `https://api.telegram.org/bot<TOKEN>/getUpdates` para ver tu `chat_id`. Se cargan en Netlify como `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`. |
| OCR (tesseract.js) | Leer imágenes y PDF escaneados | Se vendora en el repositorio | Sin cuenta |
| Skills de Claude Code | Calidad visual y pruebas | Ya disponibles en esta cuenta: frontend-design, design-critique, ux-copy, dataviz, testing-strategy | Si alguno no aparece, instálalo desde el menú `/plugin` de Claude Code |

Notas:
- **Privacidad:** en el plan gratuito de Google AI Studio, Google puede usar los datos enviados. Por eso al asistente solo se le envía el resumen del proyecto de demostración, nunca documentos del usuario, y la app lo dice.
- **Límites del plan gratuito:** `ia.mjs` ya limita por IP (30 por hora, en memoria de la instancia). Es suficiente para una demostración; no es seguridad fuerte.
- **Notion y ACC:** quedan como demostración rotulada. Integrarlos de verdad es trabajo posterior al diplomado.

---

## 4. Plan de ejecución

### Bloque A: el asistente y la IA visibles (lo más importante)
1. `ia.mjs`: agregar `paso: 'C'`. Instrucción fija, entrada acotada (pregunta de hasta 600 caracteres y resumen del proyecto en JSON de hasta 6000), salida `{texto, accion?}`, límite por IP compartido.
2. `app.js`: el chat del asistente llama a `C`. Muestra el indicador «Gemini» o «Asistente básico (sin IA)». Un botón «Ir» cuando la respuesta trae acción. El historial se guarda por sesión.
3. Modo por defecto: si `GET /ia` informa `clave: true`, arrancar en `servidor`.
4. Etiqueta `IA` en cada resultado generado por un modelo, y la tarjeta de tres caminos (D8) en Ajustes.
- *Aceptación:* preguntar «¿qué plazo tiene la lámina E-301 y qué hago hoy?» devuelve una respuesta con las fechas de la app, sin inventarlas. Sin clave, el asistente básico lo dice.

### Bloque B: bienvenida, roles y un Inicio limpio
1. Pantalla de bienvenida de tres pasos (D3), que se recuerda y se puede saltar.
2. Roles (D4): leer `referencia_v1/public/js/app.js:10-16` y `requiereRol`, y llevar los permisos y los puntos PD1 a PD4 a la app. Menú del avatar con el rol y la opción de cambiarlo.
3. Inicio reducido y vista Panorama aparte (D6). El selector de proyecto y el chip de conexión pasan a la barra superior.
4. Etiqueta «Versión beta · datos de demostración» (D11).
- *Aceptación:* un evaluador nuevo llega, elige rol y proyecto y ve un Inicio de una sola pantalla con una acción clara. Cambiar de rol cambia lo que puede hacer.

### Bloque C: plazos en calendario y carga de archivos
1. Calendario mensual (D5), reutilizando `calendario()`. En detalle, en Plazos y como vista de la bandeja. Hitos y feriados marcados; los hábiles se distinguen de los no hábiles.
2. Botón «Agregar al calendario» (`.ics` con aviso previo).
3. Zona de carga (D9) con arrastrar y soltar, miniatura y carga de carpeta. OCR con tesseract.js para imágenes y PDF escaneados; quitar los textos «(pendiente)».
- *Aceptación:* cambiar el plazo del proyecto recalcula barra y calendario. Soltar dos PDF en la zona los compara. Un PDF escaneado de una página se lee con OCR.

### Bloque D: salidas, auditoría y cierre
1. Salidas (D7): `.eml` con DOCX adjunto, `mailto:`, copiar carta, copiar instrucción.
2. Auditoría separada en dos (D10).
3. Si ya hay credencial: Drive (Picker, y subir la carta) y Telegram (`telegram.mjs`). Si no, dejarlos listos y desactivados, con el aviso correspondiente.
4. Pasada de textos con el skill de ux-copy: tono profesional, sin jerga interna, botones que dicen lo que hacen.
5. Pasada de crítica con el skill de design-critique sobre las pantallas principales. Corregir lo que salga.
6. Correr las pruebas de `nucleo.js` y recorrer el flujo completo: Bienvenida → Comparar → Alerta → Salidas → Auditoría.
- *Aceptación:* desde la bienvenida hasta tener el `.eml` abierto en el correo, sin atascos. Ningún texto visible dice «pendiente».

---

## 5. Autocrítica obligatoria después de cada bloque

1. **Cinco segundos:** ¿se entiende qué es y qué hacer ahora?
2. **IA honesta:** ¿se ve dónde interviene un modelo y dónde no?
3. **Verdad:** ¿todo número sale de `cifras.json` o de `nucleo.js`? ¿Lo simulado dice «demostración»?
4. **Producto:** ¿la pantalla termina en una acción o en un archivo útil?
5. **Tono:** ¿profesional y técnico, sin jerga interna?
6. **Robustez:** sin clave, sin red o con un archivo vacío, ¿el mensaje dice qué pasó y cómo seguir?

---

## 6. Después de la web (no lo hace Claude Code en este plan)

- Actualizar la presentación, la ficha técnica, `Cambios_para_Kevin.md` y el guion del video al flujo nuevo, con el enlace de Netlify.
- Grabar el video: es lo último.
