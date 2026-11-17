# Reloj Contractual: rúbrica (solo MVP) y estrategia de datos

Revisado: el código de `main` en GitHub (commit `cffae2`). No pude abrir el sitio desde aquí, así que lo que dice la interfaz lo tomo de tus capturas. Entrega: martes 17/11, 23:59 (Lima).

---

## 1. Rúbrica, criterio por criterio, solo lo que depende del MVP

| Criterio (pts) | Qué hay hoy | Qué falta y cómo se resuelve |
|---|---|---|
| **MVP funcional (16)** | Flujo completo: comparar → alerta → decisión → carta → salida → auditoría, con roles, plazo por proyecto y tres modos de IA. | (a) La IA en vivo falla (modelo de Gemini): ajustes P0-1. (b) Regresión del comparador con la misma imagen: P0-2. (c) El nivel alto pide datos «reales o representativos»: ver sección 2. |
| **Calidad técnica y robustez (10)** | Claves solo en el servidor, validación de tamaños en `ia.mjs`, límite por IP, citas verificadas contra el texto, auditoría con hash, mensajes de error. | **No hay README en la raíz del repositorio** y la rúbrica pide «reproducible». No hay `package.json` ni ejecutor de pruebas: las 12 pruebas solo corren dentro del navegador. El modelo de Gemini está fijo y sin respaldo, y por eso se rompió. El límite por IP vive en memoria y se reinicia. |
| **Validación y resultados (9)** | Vista Calidad con cifras de la prueba ciega, comparador sin IA y casos de referencia (n = 2). | Es el punto débil. Ver sección 2. Dentro del MVP: cronometrar decisiones, un formulario de opinión y una vista de evidencia ordenada por capas. |
| **Valor AEC y escala (8)** | Plazo parametrizable por contrato, roles, conexiones con estado (Drive y Telegram sin credenciales). | Mostrar la ruta de escala dentro de la app (qué es real hoy, qué es demostración, qué sigue). Activar al menos una conexión real. El sustento del impacto se hace fuera del MVP (presentación). |
| **Documentación, demo y sustentación (7)** | Recorrido guiado de 6 pasos. | El Hito 3 pide «enlace con flujo principal, **instrucciones y datos de prueba**». Falta un paquete de datos de prueba descargable y un panel «cómo evaluar esto en 5 minutos». El video, la ficha y la presentación están fuera del MVP (ver sección 3). |

### Qué cambiar en el MVP (se suma a `AJUSTES_Y_RUBRICA.md`)

**M1. README del repositorio.** Qué es, cómo abrirlo (la URL), cómo correrlo localmente, variables de entorno (`GEMINI_API_KEY`, `GEMINI_MODEL`, Telegram y Google), estructura de carpetas, datos de demostración, límites conocidos y cómo ejecutar las pruebas. Es lo más barato que mueve «reproducible».

**M2. Pruebas ejecutables fuera del navegador.** `package.json` con `npm test` que corre las 12 pruebas de `nucleo.js` y las de regresión del comparador y de la función de IA. Un solo comando.

**M3. Datos de prueba dentro de la app.** Un botón «Descargar datos de prueba» (lámina E-301 A y B, el corpus de demostración y la hoja de resultados esperados) y un panel «Cómo evaluar esto en 5 minutos» con 5 pasos.

**M4. Cronómetro de decisión.** Medir, por cada alerta, el tiempo desde que se abre el detalle hasta que se decide, y si se aceptó la partida propuesta. Se guarda en el navegador y se exporta a CSV. La app hoy dice que la revisión humana no se ha cronometrado: esto lo corrige.

**M5. «Dar mi opinión».** Al terminar una decisión o el recorrido: tres preguntas de 1 a 5 y un comentario libre (¿fue claro qué cambió?, ¿confiarías en la partida propuesta?, ¿usarías esto en tu obra?), exportables a CSV. Sin servidor y sin datos personales. Es la «retroalimentación recogida» que la rúbrica pide.

**M6. Vista «Evidencia» (dentro de Calidad).** Cuatro capas, cada una con su n, su fuente y su fecha, y un bloque «Lo que no afirmamos»:
1. Línea base: casos observados.
2. Comparador con documentos reales de revisión.
3. Prueba ciega y corpus de demostración (sintético).
4. Pruebas con usuarios: tiempos y opinión.

---

## 2. Datos: el punto débil, y una estrategia para cubrirlo

### Dónde está expuesto el sustento hoy
- La línea base real son **2 casos** (WhatsApp).
- El corpus de 41 documentos es **sintético** y lo armó quien construyó la app.
- La prueba ciega (10 documentos nuevos) la corrieron modelos, no personas.
- **Nadie ha usado la app con un cronómetro.**
- Las cifras de precisión son de Claude. El modo en vivo usa Gemini y no se ha medido.

### Principio
No hay tiempo ni forma de hacer una encuesta grande, y no hace falta. El jurado valora la honestidad y las capas de evidencia: pocos datos, reales, bien rotulados, y una frase clara de qué se afirma y qué no. Nada se infla, no se inventan porcentajes con n pequeño y no se reutiliza una encuesta que no existió.

### Las cuatro capas

**Capa 1. Casos observados, subir de 2 a 6 o 8** (30 minutos tuyos, hoy)
- Enviar por WhatsApp a 5 o 6 conocidos de obra u oficina técnica. Mensaje sugerido:

  > Hola, estoy cerrando un trabajo del diplomado y te pido 2 minutos. Piensa en un adicional o cambio de diseño reciente de una obra tuya. 1) ¿Cuál es tu cargo? 2) ¿Qué tipo de obra? 3) ¿Cuántos días tenías en el contrato para notificar el adicional? 4) ¿Cuántos días pasaron hasta que entendieron qué cambió y en qué partida? 5) ¿Se complicó o se perdió algún adicional por el plazo? Respóndeme solo con números y una frase.

- Se reportan **conteos** («4 de 6 tardaron entre 2 y 4 días»), nunca porcentajes. Se rotula «casos observados, n = …». Si hay 6 u 8, es suficiente.

**Capa 2. Comparador con documentos reales de revisión** (1 a 2 horas, tú o Kevin)
- Tú coordinas BIM y tienes pares de láminas en revisión A y B de proyectos propios o académicos. Elige **3 a 5 pares** donde el cuadro de revisiones diga qué cambió.
- El comparador corre en el navegador y **no sube nada**, así que no hay problema de confidencialidad. Si algún par es sensible, se anonimiza o se descarta.
- Se mide: cambios conocidos (los que dice el cuadro de revisiones) frente a zonas detectadas, y zonas falsas. Se anota en una tabla.
- Esto es dato real, medido por una persona que no construyó la app, sobre una pieza que ya funciona.

**Capa 3. Pruebas con usuarios, 3 a 5 personas** (15 minutos cada una, mañana por la mañana)
- Quiénes: Kevin, Shirley, Aldo y 1 o 2 colegas de oficina técnica.
- Tarea: abrir el sitio, entrar con su perfil, cargar la lámina E-301 más dos alertas del proyecto y decidir. La app mide el tiempo (M4) y recoge la opinión (M5).
- Son entre 15 y 25 decisiones cronometradas, con las que se puede decir «tiempo mediano de revisión por alerta: X minutos (n personas, m decisiones)».

**Capa 4. Validación de la referencia de la prueba ciega** (10 minutos de Aldo o Shirley)
- Que revise el archivo de referencia de los 10 documentos nuevos sin ver las respuestas del modelo. Con eso la capa deja de ser «se evaluó solo».

### Qué se afirma y qué no (esto va en la app y en la presentación)

| Se afirma | No se afirma |
|---|---|
| Entender un cambio tomó entre 2 y 4 días en los casos observados (n = …). | Que ese rango sea el del sector. |
| El comparador detectó X de Y cambios conocidos en pares de láminas reales. | Una precisión general. |
| Con la app, la revisión de una alerta tomó una mediana de X minutos (n personas). | Que ahorre Z días en obra. |
| Las cifras de precisión de la IA son de Claude, con instrucciones fijas, sobre un corpus de demostración y uno ciego. | Que valgan para Gemini en vivo, que no se ha medido. |

### Calendario
- **Hoy, 20:30 a 22:00:** enviar el mensaje de la capa 1; elegir los pares de láminas de la capa 2; pegar el prompt de M1 a M6 en Claude Code.
- **Mañana, 8:00 a 11:00:** pruebas con usuarios (capa 3), revisión de Aldo o Shirley (capa 4), medición de los pares reales.
- **Mañana, 12:00:** **congelar el MVP.** Después, solo se corrigen errores graves.
- **Mañana, tarde:** cargar los números en `cifras.json`, actualizar presentación, ficha y guion, grabar el video.

---

## 3. Lo que queda fuera del MVP y cómo se resuelve

| Pieza | Cómo se resuelve |
|---|---|
| **Congelar la entrega** | Etiqueta de git `entrega-hito3` en el commit final. En Netlify, bloquear la publicación (Deploys → Lock publishing) para que nada cambie después. Todas las piezas citan esa versión. |
| **Presentación** | Capturas nuevas del sitio ya congelado. Reemplazar la diapositiva de «un núcleo, dos capas» por el flujo único. La diapositiva de resultados usa las cuatro capas con su n. Enlace de Netlify en la portada y el cierre. |
| **Ficha técnica** | Enlace de Netlify, arquitectura (función de Netlify, modelo de IA, almacenamiento local), el README del repositorio como anexo de reproducción y la tabla «se afirma / no se afirma». |
| **Cambios para Kevin** | «La v2 absorbe la operación de la v1, rediseñada. Se conserva intacta su lógica (`nucleo.js`)». |
| **Video** | Se graba al final, sobre la versión congelada, siguiendo el recorrido guiado. |

---

## 4. Prompt adicional para Claude Code (después de los P0 de `AJUSTES_Y_RUBRICA.md`)

```
Lee docs/RUBRICA_MVP_Y_DATOS.md. Implementa M1 a M6. Define tú el cómo.

Reglas: no inventes datos ni cifras; la vista Evidencia muestra solo lo que esté en data/cifras.json (con su n, fuente y fecha) y deja las capas sin datos como "sin medir todavía" con un recuadro de cómo se mide. No agregues pasos al flujo principal: el cronómetro y "Dar mi opinión" no deben bloquear nada.

Haz commit por punto y git push a main (estás autorizado). Al final dime en 5 líneas qué quedó hecho.
```
