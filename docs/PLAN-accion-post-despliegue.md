# MH Logística: resultados de pruebas y plan de acción

Fecha: 10-nov-2026. Despliegue probado: `mh-logistica-lyart.vercel.app` (Vercel de Fernando, rama `main`, commit a1e8aaa).
Pruebas de solo lectura en producción: no se crearon registros ni se mandó nada al ERP.

## 1. Resultados

### Peso de cada pantalla (HTML, con sesión)

| Pantalla | Peso | Tiempo | Antes |
|---|---|---|---|
| `/operaciones` | **896 KB** (RSC 419 KB) | 0.5 s | varios MB por fotos base64 |
| `/reportes/pantalla` (TV) | **514 KB** (RSC 262 KB por refresco) | 0.3 s | varios MB cada 5 min |
| `/reportes` | 346 KB | 0.3 s | |
| `/publico/operacion` | 265 KB | 0.3 s | |
| `/mapa` | 193 KB | 0.2 s | |
| `/` (inicio) | 145 KB | 1.7 s (arranque en frío) | |
| `/embarques/[id]` | 130-163 KB (127 revisados) | 0.25 s | MB con fotos y PDFs incrustados |
| `/costos` | 131 KB | 0.2 s | |
| `/analitica`, `/ventas`, `/cotizaciones` | 63-124 KB | 0.2-0.4 s | |

- Ninguna página contiene ya `data:image` ni documentos incrustados.
- **Estimado**: una TV con `/reportes/pantalla` prendida 24 h = 144 refrescos/día × 262 KB ≈ **1.1 GB/mes** solo esa pantalla. `/operaciones` abierta 50 veces al día ≈ 1.3 GB/mes.

### Fotos y documentos
- Miniaturas: 40 revisadas, todas 200, WebP, **promedio 4.2 KB**, máximo 9 KB, caché de navegador 1 año (se confirmó que la segunda carga sale de caché).
- Se generan al vuelo con sharp: ~130 ms por miniatura en la primera carga de cada usuario (cómputo en la función).
- Foto completa: WebP hasta 1200 px, ~10-200 KB.
- Documentos: 2 PDFs probados (1.6 MB y 787 KB), se abren en línea con su nombre original. Solo viajan cuando alguien los abre.

### Seguridad
| Prueba | Resultado |
|---|---|
| Pantallas internas sin sesión (`/`, `/operaciones`, `/costos`, `/embarques`, `/importar`, `/orden-pago`) | ✅ Redirigen a login |
| `/api/foto` y `/api/documento` sin sesión | ✅ Redirigen a login |
| `/api/erp/*` con token falso | ✅ 401 "Token inválido o ausente" |
| Cookie de sesión | ✅ httpOnly (no visible a JavaScript) |
| Encabezados | ✅ X-Frame-Options DENY, nosniff, HSTS, Referrer-Policy, Permissions-Policy · ❌ falta CSP |
| `/publico/foto` con id inválido | ✅ 404 |
| **`/publico/unidad/MH-2026-XXXX`** | ❌ **Folio secuencial: se pueden recorrer las 127 unidades sin clave** y ver cliente (ej. nombre completo de un cliente en MH-2026-0001), origen, aduana, número de serie y estatus |
| **`/publico/operacion`** | ❌ Abierta: muestra nombres de clientes y vendedores, series y **notas internas** ("Cliente de Ivan en espera de pago") |
| `/publico/foto` | ⚠️ Sirve la foto completa de cualquier unidad sin sesión |
| Login | ❌ Clave compartida, sin usuarios; selector "Jaime Zamudio" es solo una lista guardada en el navegador; sin límite de intentos |
| Credenciales | ⚠️ Jaime conoce la cadena de Neon y el token del ERP |

## 2. Plan de acción

Flujo para todo: cambio en `develop` → Preview (base de pruebas) → revisión de Fernando → `main`.
Requisito previo: agregar `APP_PASSWORD` y `APP_PASSWORD_VIEW` también en Preview.

### P0. Seguridad (esta semana)
1. **Cerrar la fuga de la vista pública** (½ día)
   - Columna `tokenPublico` aleatoria por unidad; el link pasa a `/publico/unidad/<token>`. El folio deja de funcionar.
   - `/publico/operacion`: quitar nombres de clientes, vendedores y notas internas, o exigir login de lectura.
   - `/publico/foto`: solo miniatura y solo con token válido.
   - Avisar que los links públicos ya enviados cambian.
2. **Login real con correo** (1-1.5 días)
   - Tablas `User` y `Session`, contraseñas con argon2id, sesión de 12 h revocable, límite de intentos.
   - Roles: completo / solo lectura. Quitar el selector de usuario y registrar el usuario real en bitácora y cambios de estatus.
   - Necesito: correos de cada persona y su rol.
   - Al terminar, borrar `APP_PASSWORD`, `APP_PASSWORD_VIEW`.
3. **Rotar credenciales que conoce Jaime** (Fernando, 15 min): contraseña de Neon (Roles > Reset password) y `MH_LOGISTICA_TOKEN` coordinado con Rubén.

### P1. Consumo (siguiente)
4. **`/operaciones` de 896 KB a <200 KB** (½ día): mostrar solo unidades activas; entregadas con "ver más" o filtro por mes; traer solo los campos que se pintan.
5. **Pantalla de TV de 262 KB a <60 KB por refresco** (½ día): consulta mínima, refresco cada 15 min, sin refrescar fuera de horario (por ejemplo 20:00-7:00).
6. **Miniaturas guardadas, no recalculadas** (½ día): guardar `fotoThumb` al subir la foto y migrar las existentes con un script (probado primero en la base de pruebas). Quita los ~130 ms de CPU por imagen.
7. **Vigilancia de consumo**: revisar Usage > Fast Origin Transfer a diario la primera semana. Meta < 1 GB/mes.

### P2. Endurecimiento
8. Content-Security-Policy.
9. Regla de rate limit en Firewall de Vercel para `/login` y `/api/erp/*`.
10. Alinear versiones de `@prisma/client` (6.19) y `@prisma/adapter-neon` (7.10).
11. Corregir los 4 errores de lint que ya existían.
12. Decidir plan definitivo: Hobby es para uso no comercial; para una app de empresa lo estable es Pro.

## 3. Pendiente de probar contigo (escritura)
No lo probé para no tocar datos reales. Hacerlo en Preview con la base de pruebas:
- Subir una foto nueva (celular y PC) y verificar que se guarda en WebP.
- Subir un documento.
- Generar una orden de pago y ver el botón "Generando orden…" bloqueado.
- Cambio de estatus y sincronización con el ERP de pruebas.
