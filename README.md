# Reloj Contractual

**Asistente de trazabilidad documental y contractual para obras.** Compara dos revisiones de un documento del proyecto (lámina, especificación, carta o RFI), propone qué cambios tienen impacto y a qué partida del presupuesto afectan, calcula cuánto plazo contractual queda para notificar y genera el borrador (carta, acta o informe) con la cita literal como prueba.

Principio: **el modelo lee y propone, la fórmula cuenta, la persona decide.** Cada cita se verifica literalmente contra el texto; las fechas las calcula `public/js/nucleo.js`, nunca la IA; nada se emite sin una decisión registrada en la auditoría.

Entrega final del Hito 3 · Diplomado IA en Ingeniería y Construcción (AECODE) · Grupo 4.

- **Sitio:** https://reloj-contractual-rc.netlify.app
- **Estado:** versión beta con **datos de demostración** (proyecto ficticio R1 y documentos sintéticos), rotulados así en la interfaz.

## Cómo evaluarlo en 5 minutos

1. Abre el sitio y pulsa «Entrar al proyecto de ejemplo»: se entra como oficina técnica en «Edificio multifamiliar R1». El rol se cambia arriba, en «Ver como».
2. **Comparar revisiones** → «Detectar cambios» con la lámina de ejemplo E-301: 3 cambios con impacto, 2 no evidentes a simple vista.
3. **Crear alerta con estos cambios** → «Confirmar los 3 cambios»; luego «Cambiar a Jefe/a de oficina técnica» y aprueba.
4. «Cambiar a Gerente de proyecto» → **Documentos de salida**: la carta lista los 3 cambios con su cita y su partida; descárgala en DOCX o como correo `.eml` y registra la emisión.
5. **Registro de auditoría** → «Verificar integridad». En **Calidad → Evidencia** está qué se midió, con qué n y qué no se afirma.

También hay un recorrido guiado de 6 pasos (botón «?» de la barra superior) y un paquete de **datos de prueba** descargable desde Inicio («Cómo evaluar esto en 5 minutos»).

## Correrlo localmente

Requisitos: Node 20 o superior y Python 3 (solo para el servidor estático).

```bash
git clone https://github.com/alejoenzobz-beep/reloj-contractual-rc.git
cd reloj-contractual-rc
npm test            # 22 pruebas: núcleo (CP-01 a CP-12), comparador y funciones del servidor
npm start           # sirve public/ en http://localhost:8765 (sin funciones de servidor)
npx netlify dev     # app + funciones (IA registrada, Telegram, Drive), lee variables de .env
```

Sin funciones de servidor la app funciona igual con «Respuestas de demostración», «Mi propia clave API» o «Manual».

## Variables de entorno (Netlify → Site settings → Environment variables)

| Variable | Para qué | Obligatoria |
|---|---|---|
| `GEMINI_API_KEY` | IA registrada de la app (Google AI Studio, gratis y sin tarjeta) | No: sin ella la app ofrece los otros modos |
| `GEMINI_MODEL` | Modelo a usar (por defecto `gemini-2.5-flash`). Si da 404, la función elige uno disponible con ListModels | No |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Aviso al celular con el cambio y su fecha límite | No (desactivado si faltan) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY` | Elegir revisiones en Google Drive y guardar la carta | No (desactivado si faltan) |

Las claves nunca van en el código del navegador ni en el repositorio. Quien prefiera su propio proveedor (Gemini, compatible con OpenAI o Anthropic) puede pegar su clave en Ajustes: se guarda solo en `sessionStorage`.

## Estructura

```
public/                 lo que se publica (publish = "public")
  index.html            interfaz y estilos
  js/app.js             vistas, roles, plazos, bandeja, auditoría, calidad y asistente
  js/nucleo.js          lógica medida (parseo y validación de citas, plazos, cartas); no se modifica
  js/comparador.js      diff de píxeles y de líneas, PDF (pdf.js) y OCR (tesseract.js)
  js/ia.js              modos de IA: registrada, clave propia, manual y demostración
  js/salidas.js         carta, acta e informe; DOCX, PDF, MD, .eml y .ics
  js/auditoria.js       registro encadenado con SHA-256
  js/evidencia.js       cronómetro de decisiones, opiniones y vista Evidencia
  data/                 corpus de demostración, cifras medidas y consulta a profesionales
  vendor/               pdf.js y tesseract.js locales (sin CDN)
netlify/functions/      ia.mjs, telegram.mjs, config.mjs
tests/                  pruebas de npm test
referencia_v1/          versión anterior (solo consulta; no se publica)
docs/                   backlog, plan de mejoras y rúbrica
```

## Datos de demostración

- `public/data/documentos.json` y `proyecto.json`: corpus sintético del proyecto ficticio R1 (50 documentos, presupuesto y contrato anonimizados).
- `public/data/registrado.json`: respuestas de la IA guardadas en la medición; se usan en el modo de demostración.
- `public/data/cifras.json`: cifras medidas (corpus base, prueba ciega con 10 documentos nuevos, comparador sin IA, casos de referencia).
- `public/data/consulta.json`: consulta breve a 15 profesionales de obra y oficina técnica (anonimizada, P01 a P15).
- La lámina E-301 en revisiones A y B se genera en `public/js/lamina_demo.js`.

## Límites conocidos

- Las cifras de precisión de la IA se midieron con un modelo de Claude y con instrucciones fijas; la IA registrada en vivo (Gemini) no se ha medido.
- El corpus es sintético y lo armó el equipo; la línea base de tiempos viene de una consulta breve, no de una estadística del sector.
- Datos, decisiones, cronómetro y opiniones se guardan en el navegador (localStorage); no hay usuarios reales ni servidor de base de datos.
- El límite de consultas por IP vive en la memoria de la función y se reinicia con cada instancia.
- El OCR puede confundir dígitos: la app pide revisar las cifras.
- Autodesk Construction Cloud y Notion son conexiones de demostración.
