# GanaHoy — rifas diarias

Dos sitios estáticos (HTML + JS, sin compilación) en el mismo repositorio, cada uno con su proyecto de Vercel:

| Carpeta    | Proyecto Vercel | Para qué |
|------------|-----------------|----------|
| `publico/` | `rifa-diaria` (ganahoy-rifas.vercel.app) | Página que se manda al grupo: `/2cifras`, `/3cifras` (y `/r/<slug>`). Ver números y separarlos. |
| `admin/`   | `winday-admin` (ganahoy-admin.vercel.app) | Panel: clientes, abonos, registrar boletas, crear rifas, cerrar y reiniciar, historial. |

Cada push a `main` publica los dos.

## Datos (Supabase)

- Tablas: `rifas`, `boletas`, `abonos` (por cliente = WhatsApp dentro de una rifa), `admins`.
- La página pública solo usa `rifas_abiertas`, `rifa_publica` y `separar_numeros`; no puede leer las tablas.
- El panel entra con Supabase Auth (correo y contraseña). Solo ven y cambian datos los correos que estén en `admins`.
- «Cerrar y reiniciar» (`admin_reiniciar_rifa`) deja la rifa en el historial con su número ganador y abre una igual para el día siguiente.
