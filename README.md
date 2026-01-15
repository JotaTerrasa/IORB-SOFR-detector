# IORB × SOFR × BTC — Signal Dashboard (SPA)

Web single-page estática que:
- descarga **Bitcoin** desde **CoinGecko** (gratis, sin API key)
- usa **SOFR** desde el **New York Fed Markets API** (sin API key)
- usa **IORB** desde un **CSV público de FRED** (sin API key). Si quieres, puedes override con manual o por tramos.
- calcula correlación **Pearson** entre **retornos diarios de BTC** y el **spread (SOFR − IORB)**
- emite una señal **LONG / SHORT / NEUTRAL** y guarda un historial local

## Cómo correrla

### Opción A: abrir directo
Abre `index.html` en el navegador.

> Nota: algunos navegadores pueden bloquear `fetch()` si abres como `file://`. Si te pasa, usa la opción B.

### Opción B: servir con un server local

Con Python (si lo tienes):

```bash
python -m http.server 5173
```

Luego abre `http://localhost:5173`.

## Subir a producción (recomendado)

### Requisitos
- **HTTPS** (necesario para PWA/service worker y notificaciones).
- Hosting estático (Vercel / Netlify / GitHub Pages).

### Opción A: Vercel (1 minuto)
- Importa el repo en Vercel
- Framework preset: **Other**
- Output: root
- Ya incluye `vercel.json` con headers (CSP + caché).

### Opción B: Netlify
- Deploy del repo
- Publish directory: `.`
- Ya incluye `netlify.toml` con headers (CSP + caché).

### Opción C: GitHub Pages
- Sube los archivos al repo y activa Pages
- Nota: los headers de seguridad/caché no siempre son configurables en Pages.

## Checklist “production-ready”
- **Cache busting**: ya usamos `?v=` en `app.js`/`styles.css` para evitar UI vieja por PWA cache.
- **Observabilidad**: si quieres, se puede añadir Sentry/LogRocket (opcional).
- **Rate limits**: CoinGecko puede limitar; por eso guardamos último estado bueno (“stale”) para no romper UX.
- **CORS**: IORB usa fallback vía `api.allorigins.win` si el CSV directo no permite CORS.

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
- **refresca 1 vez al día a las 00:05 (hora local)** si la pestaña queda abierta
- refresca al volver a enfocar la pestaña si detecta que está “stale”

## Señales (reglas)
- Si **SOFR > IORB** y la **corr30 > 0** → **LONG**
- Si **SOFR < IORB** y la **corr30 < 0** → **SHORT**
- Si no → **NEUTRAL**

Disclaimer: demo educativa, no asesoría financiera.

