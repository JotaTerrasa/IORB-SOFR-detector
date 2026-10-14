# IORB × SOFR × BTC — Monitor de liquidez

Monitor público de financiación repo y Bitcoin, con fuentes fechadas, contexto macro y herramientas de análisis. V3 reúne mercado, liquidez y proyectos.

## Desarrollo y comprobaciones

Requiere Node 22 o posterior. No requiere claves de APIs.

```bash
npm ci
npm run dev
# http://127.0.0.1:4173
npm test
```

El servidor local ejecuta las mismas funciones `api/*` que Vercel. Un servidor de archivos o GitHub Pages no ejecutan estas rutas. Netlify no está configurado para ejecutar estas funciones: este proyecto se despliega en **Vercel**, preset Other, raíz del repositorio, sin comando de build.

## Pantallas

- **Mesa de mercado:** bonos, divisas, volatilidad, TGA diario, repos y fuentes fechadas.
- **Proyectos DeFi:** métricas DeFiLlama, precios públicos y actividad de STONK.

- **Resumen:** cotización BTC-USD spot, IORB, SOFR, diferencial en puntos básicos calculado con tasas de la misma fecha, tendencia y gráficos. Banda orientativa configurable, nunca “permiso para operar”.
- **Liquidez macro:** TGA, reservas bancarias y ON RRP con fuentes, unidades, frecuencia y fechas propias. No se mezclan en un supuesto indicador exacto de liquidez.
- **Fuentes y ajustes:** consultas correctas/fallidas, copias antiguas, fechas, preferencias y escenarios manuales. Las entradas manuales solo modifican la lectura actual, no reescriben el histórico oficial.

## Fuentes y frecuencias

| Serie    | Fuente                    | Frecuencia / tratamiento                                                                                              |
| -------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| SOFR     | NY Fed Markets API        | Observación del día de operaciones; se publica el siguiente día hábil aproximadamente a las 08:00 NY.                 |
| IORB     | FRED CSV, IORB            | Tipo administrado. Se compara con SOFR usando el tipo vigente en la fecha observada.                                  |
| BTC      | Coinbase Exchange BTC-USD | Spot USD; ticker WebSocket, fallback por consulta cada minuto. Histórico OHLC diario UTC; se excluye la vela abierta. |
| TGA      | FRED WTREGEN              | **Media semanal**, millones USD convertidos a miles de millones. No es saldo diario.                                  |
| Reservas | FRED WRESBAL              | **Media semanal**, millones USD convertidos a miles de millones.                                                      |
| ON RRP   | FRED RRPONTSYD            | Diario, miles de millones USD.                                                                                        |

Consulta general configurable cada 5, 15 o 30 minutos. La frecuencia de consulta no convierte una serie diaria/semanal en tiempo real. Las rutas tienen caché de servidor breve, validación de parámetros, timeout de fuente y limitación por IP **por instancia**, no global. Las APIs jamás entran en la caché del service worker. El shell usa red primero y copia local solo sin conexión. Los errores upstream no se cachean como respuestas correctas. Cada fuente falla independientemente; las copias del navegador se muestran como antiguas.

### Respaldo verificable de FRED

Si Vercel no puede acceder directamente al CSV de FRED, se usa una copia de las mismas series, con fecha de descarga visible. `scripts/update-fred.mjs` descarga las cuatro series oficiales; el workflow `fred-data.yml` las actualiza cada dos horas en la rama `data-feed`, que no genera despliegues de Vercel. Solo publica cuando cambian las observaciones. La API consulta esa copia y conserva una copia empaquetada para el arranque. Rechaza copias de más de 72 horas: nunca sustituye tasas por constantes inventadas. Los datos son públicos; el workflow solo escribe su snapshot de datos. La frecuencia de descarga y las fechas de observación permanecen visibles.

## Metodología y límites

`lib/analytics.js` contiene funciones puras compartidas y comprobadas:

- `spread = (SOFR − IORB) × 100` en pb. Banda ±5 pb por defecto, **parámetro exploratorio**, no umbral oficial de la Fed.
- No se rellenan observaciones anteriores con tipos futuros. La correlación usa días con SOFR real y retorno BTC entre dos cierres UTC consecutivos. No duplica fines de semana ni usa la vela abierta. La asociación es contemporánea y no acredita causalidad.

Referencias: [metodología SOFR](https://www.newyorkfed.org/markets/reference-rates/additional-information-about-reference-rates), [TGA y reservas](https://www.federalreserve.gov/econres/notes/feds-notes/fluctuations-in-the-treasury-general-account-and-their-effect-on-the-feds-balance-sheet-20250806.html), [repo y presión de financiación](https://www.newyorkfed.org/newsevents/speeches/2024/per240926).

## Privacidad, migración y seguridad

Las preferencias de visualización se guardan en `localStorage`.

Chart.js 4.4.1 se sirve localmente con su licencia. No hay dependencias CDN, fuentes remotas ni analítica de terceros. CSP restringe scripts/estilos al origen y WebSocket al proveedor de precio. No hay credenciales en Git. El proxy CoinGecko antiguo devuelve 410; los endpoints están acotados a fuentes y productos concretos.

## Release y recuperación

Los cambios se revisan por PR y CI (`npm test`). Vercel mantiene despliegues versionados. Antes de publicar, comprobar escritorio/móvil, las cinco pantallas, gráficos, fuentes y CSV. Ver `docs/releases/2026-10-13.md` para la evidencia de esta actualización. La versión anterior es el commit `437d052`; se puede restaurar con un revert del PR o promoviendo su despliegue anterior en Vercel.

## Mesa de mercado y proyectos

La mesa añade rendimientos 2/10/20/30 años, TLT, EUR/USD, USD/JPY, MOVE, VIX, curva FRED, tipos nominales/reales, petróleo spot, TGA diario y repos aceptados. Conserva las vistas de SOFR/IORB, reservas y ON RRP. Permite copiar un parte fechado, exportar observaciones y usar modo presentación.

`Proyectos DeFi` incorpora TVL y actividad de Aster/Pump y liquidez de Solana/Hyperliquid mediante la API gratuita de DeFiLlama. Las métricas de protocolo, red y token se distinguen. STONK se identifica por el contrato verificado de StonkFun en Solana: precio DeFiLlama, actividad del protocolo, ingresos/recompras/quemas oficiales en días UTC cerrados y liquidez por pool de DEX Screener.

Fuentes y criterios: [documentación de la mesa](docs/research/market-sources.md). `node scripts/update-desk.mjs` actualiza snapshots públicos. El workflow usa el código de main y publica únicamente archivos de datos en data-feed.
