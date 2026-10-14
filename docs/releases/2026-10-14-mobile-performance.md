# Carga móvil · 14/10/2026

- Gráficas dibujadas al acercarse a la zona visible, con margen de 200 px.
- Peticiones de dibujo agrupadas por fotograma, conservando los datos más recientes.
- Resolución de lienzo limitada a dos píxeles por píxel visual para reducir memoria.
- Biblioteca de gráficas con versión fija reutilizada desde la copia local.
- Lista de archivos locales corregida y ampliada con módulos actuales.
- Consulta de datos financieros sin cambios, sin recortar series ni métricas.

## Comprobaciones

- Navegador a 390 px, pantalla inicial sin gráficas creadas frente a las diez anteriores.
- Las gráficas aparecen al bajar y al abrir Proyectos, Resumen y Liquidez macro.
- Sin errores de consola, 42 pruebas correctas.
- Medición de red desde este ordenador, no desde un móvil ni una red móvil.
- Página 145 ms, biblioteca 239 ms, API de mesa 784 ms y proyectos 159 ms en una muestra.
- Estas medidas no representan tiempos garantizados ni una comparación controlada de velocidad total.
- Reversión mediante el commit anterior 591465f.
