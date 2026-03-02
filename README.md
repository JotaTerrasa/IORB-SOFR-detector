# IORB × SOFR × BTC — Signal Dashboard (SPA)

Web single-page estática que:
- descarga snapshot de **Bitcoin** desde **CoinGecko** y actualiza en vivo por **WebSocket público de BingX** (sin API key)
- usa **SOFR** desde el **New York Fed Markets API** (sin API key)
- usa **IORB** desde un **CSV público de FRED** (sin API key). Si quieres, puedes override con manual o por tramos.
- calcula correlación **Pearson** entre **retornos diarios de BTC** y el **spread (SOFR − IORB)**
- emite una señal **LONG / SHORT / NEUTRAL** y guarda un historial local

## Cómo correrla

### Opción recomendada (local con API routes)
Esta app usa rutas serverless locales (`/api/cg`, `/api/nyfed`, `/api/iorb`), así que para desarrollo local usa Vercel:

```bash
npm i -g vercel
vercel dev
```

Luego abre `http://localhost:3000`.

> Nota: abrir `index.html` directo o con servidor estático simple no ejecuta `api/*`.

## Subir a producción (recomendado)

### Requisitos
- **HTTPS** (necesario para PWA/service worker y notificaciones).
- Hosting con funciones serverless para `api/*` (Vercel recomendado).

### Opción A: Vercel (1 minuto)
- Importa el repo en Vercel
- Framework preset: **Other**
- Output: root
- Ya incluye `vercel.json` con headers de seguridad + caché.

### Opción B: Netlify
- Deploy del repo
- Publish directory: `.`
- Ya incluye `netlify.toml` con headers de seguridad + caché.

### Opción C: GitHub Pages
- **No recomendado para esta versión**: GitHub Pages no ejecuta `api/*` serverless.

## Checklist “production-ready”
- **Cache busting**: ya usamos `?v=` en `app.js`/`styles.css` para evitar UI vieja por PWA cache.
- **Observabilidad**: si quieres, se puede añadir Sentry/LogRocket (opcional).
- **Rate limits backend**: `api/*` aplica límite por IP y devuelve `429` para abuso.
- **Métodos permitidos**: `api/*` solo acepta `GET` (`405` para el resto).
- **Headers de seguridad**: CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`.
- **Dependencia CDN**: Chart.js carga con `integrity` (SRI) + `crossorigin`.
- **Secrets**: no hay claves privadas en repo; `.gitignore` reforzado para `.env` y certificados.

## Estado de despliegue (go-live)

Antes de abrir al público:
1. Haz commit/push de los cambios pendientes.
2. Despliega en Vercel/Netlify.
3. Verifica en producción:
   - carga normal de la home
   - respuestas `200` en `/api/cg`, `/api/nyfed`, `/api/iorb`
   - `429` si haces flood (rate limit funcionando)
   - encabezados de seguridad presentes

## SOFR (NY Fed Markets API)

SOFR se descarga desde endpoints públicos (sin key), por ejemplo:
- `https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json`
- `https://markets.newyorkfed.org/api/rates/secured/sofr/search.json?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

Si la descarga falla, puedes setear SOFR manualmente como override.

## IORB

IORB se descarga automáticamente desde CSV público:
- `https://fred.stlouisfed.org/graph/fredgraph.csv?id=IORB`

Puedes override con:
- **IORB manual (%)**
- **IORB por tramos (fecha → valor)** (forward-fill)

## Auto-refresh diario

La web:
- **refresca al cargar**
- **refresca automáticamente cada X segundos** (configurable en Ajustes avanzados, default 1800s con BTC live)
- **refresca 1 vez al día a las 00:05 (hora local)** si la pestaña queda abierta
- refresca al volver a enfocar la pestaña si detecta que está “stale”

## Señales (reglas)
- Si **SOFR > IORB** y la **corr30 > 0** → **LONG**
- Si **SOFR < IORB** y la **corr30 < 0** → **SHORT**
- Si no → **NEUTRAL**

Disclaimer: demo educativa, no asesoría financiera.

