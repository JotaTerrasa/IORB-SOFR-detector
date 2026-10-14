# Zoom y fechas · 2026-10-14

- Acceso público existente: https://iorb-sofr-detector.vercel.app
- Controles plegables por gráfica temporal: fechas inclusivas, zoom, desplazamiento y restablecer.
- La curva por vencimiento no recibe controles de fechas porque no es una serie temporal.
- Trabaja sobre el histórico cargado; no altera valores ni la base original de la comparación TVL.
- Exportación PNG conserva el tramo seleccionado.
- Pruebas unitarias de límites, fechas sin observaciones y series pequeñas; validación local de fechas, zoom y restablecer.
- Reversión mediante el commit anterior e8f618b.
