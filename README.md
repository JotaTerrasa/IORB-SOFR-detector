# IORB × SOFR × BTC — Monitor de liquidez

Monitor público de financiación repo y Bitcoin, con fuentes fechadas, contexto macro y herramientas de análisis. V2 separa **datos observados**, **lectura de financiación**, **hipótesis experimentales** y **escenarios personales**.

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

- **Resumen:** cotización BTC-USD spot, IORB, SOFR, diferencial en puntos básicos calculado con tasas de la misma fecha, tendencia y gráficos. Banda orientativa configurable, nunca “permiso para operar”.
- **Liquidez macro:** TGA, reservas bancarias y ON RRP con fuentes, unidades, frecuencia y fechas propias. No se mezclan en un supuesto indicador exacto de liquidez.
- **Laboratorio BTC:** Pearson de retornos diarios frente al diferencial en 7/30/90 observaciones reales de SOFR; correlación móvil; hipótesis de variación del diferencial y simulación histórica.
- **Riesgo y diario:** dirección elegida explícitamente por el usuario, dimensionamiento que incluye comisiones dentro del presupuesto, avisos de margen y liquidación, diario local y exportaciones CSV.
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
- Hipótesis experimental: dentro de la banda, caída en siete intervalos de observación → LONG, subida → SHORT; variación <0,5 pb → neutral. **Sin confianza predictiva estimada.**
- Simulación: usa calendario habitual de publicación SOFR (incluidos festivos de títulos públicos), señal al cierre UTC, entrada en la siguiente apertura, stop 1,5×ATR14 (media simple), objetivo 2R y máximo siete velas. No hay operaciones simultáneas ni velas inventadas. Las posiciones todavía abiertas no cuentan como cerradas. Si stop y objetivo se tocan, se asume stop primero; gaps se ejecutan a apertura. Comisiones incluidas. No incluye funding, slippage intradía ni versiones históricas de revisiones. No es una validación fuera de muestra.
- Liquidación: aproximación a margen aislado de contrato lineal; no sustituye reglas, mark price y tramos de mantenimiento del exchange. Comisiones estimadas al stop se incluyen en el presupuesto de riesgo.

Referencias: [metodología SOFR](https://www.newyorkfed.org/markets/reference-rates/additional-information-about-reference-rates), [TGA y reservas](https://www.federalreserve.gov/econres/notes/feds-notes/fluctuations-in-the-treasury-general-account-and-their-effect-on-the-feds-balance-sheet-20250806.html), [repo y presión de financiación](https://www.newyorkfed.org/newsevents/speeches/2024/per240926).

## Privacidad, migración y seguridad

Preferencias, escenarios y diario viven solo en `localStorage`; no se envían al backend. El diario de v1 se migra automáticamente y los registros originales se conservan. No se importan automáticamente señales antiguas ni una dirección implícita. Exporta tu diario para conservar una copia fuera del navegador.

Chart.js 4.4.1 se sirve localmente con su licencia. No hay dependencias CDN, fuentes remotas ni analítica de terceros. CSP restringe scripts/estilos al origen y WebSocket al proveedor de precio. No hay credenciales en Git. El proxy CoinGecko antiguo devuelve 410; los endpoints están acotados a fuentes y productos concretos.

## Release y recuperación

Los cambios se revisan por PR y CI (`npm test`). Vercel mantiene despliegues versionados. Antes de publicar, comprobar escritorio/móvil, las cinco pantallas, gráficos, fuentes, escenarios, cálculo, diario y CSV. Ver `docs/releases/2026-10-13.md` para la evidencia de esta actualización. La versión anterior es el commit `437d052`; se puede restaurar con un revert del PR o promoviendo su despliegue anterior en Vercel.

## Mesa de mercado y proyectos

La mesa añade rendimientos 2/10/20/30 años, TLT, EUR/USD, USD/JPY, MOVE, VIX, curva FRED, tipos nominales/reales, petróleo spot, TGA diario y repos aceptados. Conserva las vistas de SOFR/IORB, reservas y ON RRP. Permite copiar un parte fechado, exportar observaciones y usar modo presentación.

`Proyectos y spot` incorpora TVL y actividad de Aster/Pump y liquidez de Solana/Hyperliquid mediante la API gratuita de DeFiLlama. Las métricas de protocolo, red y token se distinguen. STONK se identifica por el contrato verificado de StonkFun en Solana: precio DeFiLlama, actividad del protocolo, ingresos/recompras/quemas oficiales en días UTC cerrados y liquidez por pool de DEX Screener.

La cartera se configura y guarda **solo en el navegador**. JSON de importación/exportación local, sin subida al servidor. Medias de seguimiento, compras y medias alternativas son campos separados. No se calcula beneficio total sin un libro completo de operaciones. El estado inicial 100% USDT es un ejemplo, no una cartera publicada de César.

Fuentes y criterios: [documentación de la mesa](docs/research/cesar-market-desk.md). `node scripts/update-desk.mjs` actualiza snapshots públicos. El workflow usa el código de main y publica únicamente archivos de datos en data-feed.
