# Fuentes y alcance de la mesa de mercado

Herramienta independiente, sin afiliación ni señal de inversión atribuida a César Langreo.

Se revisaron vídeos públicos y sus subtítulos automáticos, con comprobación de los conceptos en las fuentes financieras primarias. Los tiempos aproximados sirven para localizar la explicación, no para transcribirla.

| Vídeo público                               | Referencia aproximada | Métricas observadas                                                          |
| ------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| https://www.youtube.com/watch?v=H4Adk_o5nus | 1:05; 10:20           | TGA y EUR/USD                                                                |
| https://www.youtube.com/watch?v=q6A3-A3N5q4 | 1:12; 3:49; 10:40     | TLT, rendimientos largos, EUR/USD, USD/JPY, MOVE, VIX, repos, SOFR           |
| https://www.youtube.com/watch?v=Q51h01lp2i8 | 3:24–6:26; 8:14       | Tipo nominal/real y compensación de inflación a 10 años; curva 10/20/30 años |
| https://www.youtube.com/watch?v=-uerfrzoDbA | 5:36–7:43             | SOFR/IORB, TGA diario, repos y reverse repos, MOVE, VIX, petróleo, divisas   |
| https://www.youtube.com/watch?v=SCoyLU4MpJg | 6:24–6:47             | TGA y reservas bancarias                                                     |

## Fuentes de datos

- Tesoro: Daily Treasury Statement, `operating_cash_balance`. En el esquema moderno, el registro `Treasury General Account (TGA) Closing Balance` contiene el cierre en `open_today_bal` (millones USD). No confundir con el registro Opening Balance ni con la media semanal WTREGEN.
- NY Fed: API oficial de resultados Repo. Sumar `totalAmtAccepted` por día y deduplicar `operationId`. No volver a sumar detalles. Es importe aceptado, no saldo pendiente ni exclusivamente SRF.
- FRED: DGS2/10/20/30, DFII10, T10YIE, VIXCLS, DCOILWTICO y DCOILBRENTEU. Las curvas se comparan en fechas comunes. Breakeven incluye primas de riesgo; no es el IPC observado.
- TradingView: lectura pública de cotizaciones con identidad comprobada. Se declara retraso de 15 minutos cuando lo indica la fuente. `time` es sesión/barra, no la hora del último tick. No se ofrece SLA de mercado profesional.
- DeFiLlama: API gratuita documentada en https://api-docs.defillama.com/llms-free.txt. TVL agregado de Aster y Pump, productos individualizados para comisiones/ingresos/volumen spot; redes para TVL y stablecoins. Nunca sumar un agregado a sus componentes.
- Precios DeFiLlama: SOL y USDT por identificador CoinGecko; ASTER y PUMP por contrato confirmado en los registros del protocolo. PURR corresponde a `purr-2`, cuyo registro de CoinGecko enlaza al mercado PURR/USDC de Hyperliquid. El precio exige símbolo correcto, confianza ≥0,8 y antigüedad menor de 2 horas.
- STONK: StonkFun en Solana, contrato `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`, coincidente en la API oficial y DeFiLlama. El vídeo público H4Adk_o5nus (5:42–7:00) comenta recompras de aproximadamente 84.000 y 88.000 USD; se corresponden con las del 10 y 11 de octubre en el historial oficial. Precio por contrato vía DeFiLlama, ingresos/recompras/quemas por API StonkFun documentada en https://stonkfun.xyz/developers y pools por DEX Screener. El día UTC en curso se excluye del gráfico; no se rellena un día ausente con cero. No se presenta la valoración oficial como capitalización circulante auditada.

## Privacidad y semántica del portfolio

La hoja facilitada como referencia se consulta sin modificarla ni publicar su contenido. Sus datos financieros no se incluyen en el repositorio, snapshots, URLs ni API. Los pesos, medias, últimas compras y medias alternativas se guardan exclusivamente en localStorage. Un navegador nuevo inicia con una asignación de ejemplo 100% USDT, no con una cartera atribuida a nadie.

La media de seguimiento ajustada por beneficios realizados se distingue del precio de la última compra y de una media alternativa. El cambio respecto a una media no es beneficio realizado, coste fiscal ni rentabilidad total. No se reconstruye un X4 con registros parciales ni se presupone una cantidad de tokens. El escenario usa pesos de referencia, no pesos dinámicos.

## Cadencia y fallos

Copias públicas actualizadas cada dos horas en la rama data-feed mediante el código de main. Cotizaciones consultadas y cacheadas por un minuto; proyectos cinco minutos por instancia. La interfaz conserva fecha de consulta por fuente, fecha de observación y errores. Una copia antigua puede servir de contexto, pero no se presenta como cotización actual. El service worker no intercepta API.
