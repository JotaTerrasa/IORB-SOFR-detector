# Carga progresiva y control de fuentes

Cada respuesta actualiza su bloque sin esperar a que terminen las ocho consultas. El progreso muestra cuántas consultas han terminado, incluidos los fallos gestionados. Al finalizar se conserva el estado global de datos parciales.

La mesa incorpora un panel con estado, fecha de observación (cuando la fuente la proporciona) y fecha de consulta de SOFR, IORB, cotizaciones, series macro y fuentes DeFi. Las copias por fallo y las copias de más de 24 horas se identifican. Consultar una fuente no implica que la observación sea del día.

Copiar y descargar se habilitan cuando hay observaciones disponibles. Durante la carga se distinguen los bloques pendientes de las fuentes fallidas.

Validación: 31 pruebas; navegador local muestra progreso 4/8 antes de completar y copias fechadas de Aster/Pump ante fallo real de consulta, sin errores de consola.
