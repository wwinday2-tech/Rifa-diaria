# Rifa Diaria

Página para ver los números disponibles de las rifas (2 cifras: 00–99, 3 cifras: 000–999) y separarlos.

- Sitio estático (HTML + JS, sin compilación) publicado en Vercel; cada push a `main` sale a producción.
- Datos en Supabase. La página solo usa tres funciones: `rifas_abiertas`, `rifa_publica` y `separar_numeros`.
  Las tablas (`rifas`, `boletas`, `abonos`) no se pueden leer desde la página, así que nadie ve nombres ni teléfonos ajenos.
- Enlace de una rifa para mandar al grupo: `/r/<slug-de-la-rifa>`.
