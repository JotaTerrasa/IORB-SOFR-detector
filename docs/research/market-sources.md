# Fuentes de la mesa de mercado

## Fuentes de datos

- Tesoro: Daily Treasury Statement, `operating_cash_balance`. En el esquema moderno, el registro `Treasury General Account (TGA) Closing Balance` contiene el cierre en `open_today_bal` (millones USD). No confundir con el registro Opening Balance ni con la media semanal WTREGEN.
- NY Fed: API oficial de resultados Repo. Sumar `totalAmtAccepted` por día y deduplicar `operationId`. No volver a sumar detalles. Es importe aceptado, no saldo pendiente ni exclusivamente SRF.
- FRED: DGS2/10/20/30, DFII10, T10YIE, VIXCLS, DCOILWTICO y DCOILBRENTEU. Las curvas se comparan en fechas comunes. Breakeven incluye primas de riesgo; no es el IPC observado.
- TradingView: lectura pública de cotizaciones con identidad comprobada. Se declara retraso de 15 minutos cuando lo indica la fuente. `time` es sesión/barra, no la hora del último tick. No se ofrece SLA de mercado profesional.
- DeFiLlama: API gratuita documentada en https://api-docs.defillama.com/llms-free.txt. TVL agregado de Aster y Pump, productos individualizados para comisiones/ingresos/volumen spot; redes para TVL y stablecoins. Nunca sumar un agregado a sus componentes.
- Precios DeFiLlama: SOL y USDT por identificador CoinGecko; ASTER y PUMP por contrato confirmado en los registros del protocolo. PURR corresponde a `purr-2`, cuyo registro de CoinGecko enlaza al mercado PURR/USDC de Hyperliquid. El precio exige símbolo correcto, confianza ≥0,8 y antigüedad menor de 2 horas.
- STONK: StonkFun en Solana, contrato `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`, coincidente en la API oficial y DeFiLlama. Precio por contrato vía DeFiLlama, ingresos/recompras/quemas por API StonkFun documentada en https://stonkfun.xyz/developers y pools por DEX Screener. El día UTC en curso se excluye del gráfico; no se rellena un día ausente con cero. No se presenta la valoración oficial como capitalización circulante auditada.

## Cadencia y fallos

Copias públicas actualizadas cada dos horas en la rama data-feed mediante el código de main. Cotizaciones consultadas y cacheadas por un minuto; proyectos cinco minutos por instancia. La interfaz conserva fecha de consulta por fuente, fecha de observación y errores. Una copia antigua puede servir de contexto, pero no se presenta como cotización actual. El service worker no intercepta API.
