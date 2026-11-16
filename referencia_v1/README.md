# Reloj Contractual · MVP (Grupo 4 · AECODE · Hito 3)

Asistente de trazabilidad documental y contractual en obra: del documento recibido en el CDE a la notificación dentro de plazo.

> El modelo lee y propone. La fórmula cuenta. La persona decide.

## Acceso

- App publicada: ver `ENLACES.txt` (Firebase Hosting). No pide cuenta: cada visitante recibe un espacio propio (sesión anónima).
- Sin internet: `npm run local` y abrir `http://localhost:5055` (modo local, datos en el navegador).

## Estructura

| Ruta | Contenido |
|---|---|
| `public/index.html` | Interfaz y estilos |
| `public/js/nucleo.js` | Lógica pura: instrucciones versionadas I1–I4, validadores, regla R-V, reloj, métricas |
| `public/js/app.js` | Pantallas: panorama, bandeja, detalle, ingesta, procesar IA, parámetros, cartas, auditoría, pruebas, guía |
| `public/js/almacen.js` | Datos: Firestore (auth anónima) con respaldo local |
| `public/js/ia.js` | IA en doble modo: API de Claude desde el navegador o modo manual (copiar y pegar) |
| `public/js/pruebas.js` | Casos CP-01 a CP-12 |
| `public/data/` | Corpus sintético (50 documentos), partidas, contrato, conjunto de referencia y corridas |
| `scripts/` | Corrida del corpus, medición, pruebas y servidor local |
| `firestore.rules` | Aislamiento por usuario y auditoría de solo agregar |

## Reproducir los resultados

Requisitos: Node 20+ y Claude Code CLI con sesión iniciada (para la corrida).

```bash
npm run pruebas                                                   # 12 casos CP
node scripts/correr_corpus.mjs --i1 v1.0 --salida corrida_v1.0.json   # corrida completa (≈ 6 min)
node scripts/medir.mjs corrida_v1.0.json --subconjunto todos
node scripts/medir.mjs corrida_v1.0.json --subconjunto reservados
```

La corrida se ejecuta desde una carpeta vacía y sin herramientas: el modelo solo ve la instrucción y los documentos, nunca el conjunto de referencia.

## Desplegar

```bash
firebase login
firebase deploy --only hosting,firestore:rules
```

## Datos y restricciones

- Corpus sintético representativo del proyecto ficticio R1: no contiene datos de proyectos reales.
- La clave de API de Claude se guarda solo en el navegador del usuario; nunca en Firestore.
- Firestore en plan gratuito (Spark). Sin integración por API con el CDE (fuera de alcance, RF-9).
