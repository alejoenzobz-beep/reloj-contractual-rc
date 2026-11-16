# CLAUDE.md — Reloj Contractual v2

## Qué es
**Reloj Contractual: asistente de trazabilidad documental y contractual para obras.**
Detecta qué cambió entre dos revisiones de un documento del proyecto (lámina, especificación, metrado), lo vincula a la partida del presupuesto, calcula cuánto plazo contractual queda para notificar y genera el borrador (carta, acta o informe) con la cita literal como prueba.

Principio que no se rompe: **el modelo lee y propone, la fórmula cuenta, la persona decide.**
- La IA solo propone cambios y partidas. Toda cita se verifica de forma literal contra el texto (`parsearI1`).
- Las fechas y plazos los calcula `js/nucleo.js`, nunca la IA.
- Nada se emite sin una decisión humana registrada en la auditoría.

Es la entrega final del Hito 3 del Diplomado IA de AECODE (eje Desarrollo, Grupo 4). Plazo: martes 17/11/2026 a las 23:59, hora de Lima. Quien la revise la entenderá en unos 5 minutos.

## Reglas del repo
1. **La v2 reemplaza a la v1.** No enlaces la v1 desde la interfaz. Lo útil de la v1 (ingesta, procesar con IA, parámetros, cartas, auditoría, pruebas) se reimplementa aquí, rediseñado. El código de la v1 está en `referencia_v1/` solo para consulta.
2. **No modifiques la lógica de `js/nucleo.js`.** Es la misma de la v1 y sobre ella se calcularon todas las cifras publicadas. Puedes agregarle funciones nuevas, pero no cambiar las existentes.
3. **No inventes datos.**
   - Las cifras salen de `data/cifras.json`.
   - Los casos reales son dos: n = 2 (Kevin, residente, con plazo de 5 días; Shirley, oficina técnica, con plazo de 7). Son casos observados, no la regla.
   - Todo lo que sea simulado se rotula como «demostración» en la interfaz.
4. **Usa solo servicios gratuitos que no pidan tarjeta de crédito:** Netlify Free, la clave de Google AI Studio (Gemini), un bot de Telegram (BotFather), la API de Google Drive y Notion.
5. **Las claves nunca van en el código del navegador ni en el repositorio.** Van en variables de entorno de Netlify y se usan desde Netlify Functions (`netlify/functions/`). Como alternativa, el usuario puede pegar su propia clave y se guarda solo en `sessionStorage`.
6. **El texto de la interfaz va en español, con tono profesional y técnico.** Nada de «¿Te ha pasado esto?», nada de jerga interna («I1», «R-V», «corrida»). Los botones dicen exactamente lo que hacen.

## Estructura actual
```
index.html          shell + tokens CSS (tema oscuro por defecto; claro opcional)
js/app.js           vistas y estado (hash router simple)
js/nucleo.js        lógica compartida: validarIngesta, INSTRUCCIONES, parsearI1/I2,
                    fechaLimite, sumarHabiles, semaforo, camposCarta, verificarCarta, evaluar
data/*.json         documentos, proyecto, salidas registradas, cifras medidas
referencia_v1/      app de Kevin (Firebase): solo lectura
docs/REVISION_Y_BACKLOG.md   ← qué hacer, en qué orden y con qué criterio de aceptación
```

## Diseño
- **Paleta oscura:** fondo `#0A1230`, vidrio `rgba(22,33,74,.62)`, azul `#4F7BFF` y `#8FB0FF`, naranja `#FF8A4C` (plazo), verde `#3DDC97` (ok).
- **Tipografía:** Manrope para títulos y DM Sans para el texto.
- **Movimiento solo cuando explica algo:** el barrido que detecta cambios, el avance del plazo, el sellado de la auditoría. Respeta `prefers-reduced-motion`.
- **Accesibilidad mínima:** foco visible, contraste AA y uso con teclado.

## Cómo probar
- `npx netlify dev` levanta la app y las funciones.
- `python3 -m http.server` sirve solo la parte estática.
- Después de cada tarea:
  1. Toma una captura de cada vista afectada (Playwright, a 1440 y 390 px).
  2. Revísala con el checklist de la sección 7 del backlog.
  3. Corrige lo que falle antes de seguir.
- Haz un commit por tarea, con mensajes en español.
