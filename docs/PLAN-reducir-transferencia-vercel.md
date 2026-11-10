# Plan: reducir Fast Origin Transfer de mh-logistica en Vercel

Contexto: el 10-nov-2026 Vercel pausó el equipo (plan Hobby) por Fast Origin Transfer.
En 30 días mh-logistica generó 26.59 GB (100% del equipo), 99.7% desde iad1.
Picos: ~4.9 GB (23-oct) y ~2.6 GB (5-nov).

## Causa probable (vista en el código, rama develop)

1. **Fotos y archivos como base64 dentro de la base** (`Shipment.fotoUrl`, hasta ~1.5 MB;
   `ShipmentFile.archivoUrl`). Cada página las pinta como `<img src="data:...">`, así que
   la foto viaja **dentro del HTML de cada render** y nunca se cachea.
2. **Todas las páginas son `force-dynamic`** y varias traen todos los equipos con todas
   las columnas: `/` (`findMany` de todos los shipments), `/operaciones`, `/costos`,
   `/reportes`, `/publico/operacion`.
3. **`/reportes/pantalla`** (monitor/TV) hace `window.location.reload()` cada 5 min
   (`AutoReload`): ~288 recargas al día, cada una con todas las fotos de los equipos
   en operación. Un solo monitor prendido explica un consumo sostenido.
4. Los picos (23-oct, 5-nov) probablemente coinciden con importaciones o días con
   muchas fotos nuevas / pantallas abiertas.

## Cambios (en este orden, cada uno es un commit chico)

### Paso 1. Servir las fotos por una ruta cacheable (el cambio que más ahorra)
- Crear `src/app/api/foto/[id]/route.ts` que lea `fotoUrl` del equipo, la decodifique
  y responda el binario con `Content-Type: image/jpeg` y
  `Cache-Control: public, max-age=31536000, immutable`.
- Versionar la URL con `?v=<updatedAt en ms>` para que al cambiar la foto se refresque.
- Reemplazar `src={s.fotoUrl}` por `src={`/api/foto/${s.id}?v=...`}` en: `page.tsx`,
  `operaciones`, `costos` (`CostosEditableTable`), `reportes`, `reportes/pantalla`,
  `orden-pago/[id]`, `embarques/[id]`, `publico/*`, `EntregasHoyBanner`, `FotoEquipo`.
- En esas pantallas pasar solo `tieneFoto: boolean` + `updatedAt`, no el base64.
- Hacer lo mismo para documentos: ruta `/api/archivo/[id]` y la lista solo con
  `select: { id, nombre, tipo, createdAt }` (sin `archivoUrl`).

### Paso 2. Dejar de traer el base64 en las consultas
- En `src/lib/queries.ts` usar `omit: { fotoUrl: true }` (o `select` explícito) en todos
  los `findMany` de shipments (`getShipmentsBoard`, el dashboard, reporte diario, etc.).
  Agregar `tieneFoto` calculado con `select`/`_count` o un campo booleano nuevo.
- Quitar `include: { shipment: true }` donde solo se necesita folio/serie.

### Paso 3. Pantalla de TV sin recargar todo
- Cambiar `AutoReload` de 5 min a 15-30 min, o usar `router.refresh()` (re-trae solo el
  payload de servidor, ya sin fotos tras el paso 1) en lugar de `location.reload()`.
- Pausar la recarga cuando la pestaña está oculta (`document.visibilityState`).

### Paso 4. Cache en páginas de solo lectura
- `/publico/operacion` y `/publico/unidad/[folio]`: quitar `force-dynamic` y usar
  `revalidate` de 60-300 s; ya se llama `revalidatePath` desde las acciones y el ERP.
- Revisar `revalidatePath` en `api/erp/*` para que no invalide más de lo necesario.

### Paso 5. Verificar
- `npm run build` y revisar el tamaño del HTML de `/`, `/operaciones`, `/reportes/pantalla`
  (debe bajar de MB a decenas de KB).
- Tras desplegar, revisar Usage > Fast Origin Transfer > Projects por 2-3 días.
- Meta: < 1 GB/mes. El límite Hobby es la referencia; si no se alcanza, medir de nuevo
  con Observability por ruta.

## Fuera de alcance / decisión pendiente
- Mover las fotos a Vercel Blob o almacenamiento externo (más limpio a largo plazo,
  pero requiere migrar datos).
- Upgrade a Pro: decisión de Fernando, no se hace desde aquí.

## Riesgos
- Las fotos están en data URL: la ruta debe validar el prefijo `data:image/` y fallar
  con 404 si no existe, sin romper la UI.
- No hacer deploy de esto a master sin probar `/publico/*` (se comparte con Ventas).

---

# Bloque B. Login real (usuarios individuales)

## Situación actual (código en develop)
- No hay cuentas: hay **una clave compartida** (`APP_PASSWORD` = acceso completo,
  `APP_PASSWORD_VIEW` = solo lectura). `loginAction` guarda la cookie `mh_auth`
  firmada con el rol (`full`/`view`), válida **180 días**, sin saber quién es.
- Consecuencias: cualquiera con la clave es "la misma cuenta"; no se puede cerrar la
  sesión de una persona sin cambiar la clave de todos; la auditoría (`audit.ts`) no
  puede atribuir acciones a un usuario real; y quien abre la app en el mismo navegador/
  dispositivo donde ya hay sesión entra directo con esa cuenta.
- Nota: la sesión va en cookie `httpOnly`, no en el link; compartir la URL sola no pasa
  la sesión. Lo que hay que confirmar con Fernando es el caso exacto (mismo navegador,
  pantalla compartida, o una ruta `/publico/*` que muestra de más).

## Cambios
1. **Tabla `User`** en Prisma: id, nombre, email, `passwordHash` (argon2 o bcrypt),
   rol (`admin` | `logistica` | `lectura`), activo, creado/último acceso.
   Seed con Jaime, Raúl y Dirección. Eliminar el uso de `APP_PASSWORD*` al terminar.
2. **Tabla `Session`**: token aleatorio guardado como hash, usuario, expira, IP/agente.
   Cookie `httpOnly; secure; sameSite=lax` con solo el token (no el rol). Duración
   corta (8-12 h) con renovación; botón "Cerrar sesión en todos los dispositivos".
3. **Login con correo + contraseña**, límite de intentos por IP/usuario y bloqueo
   temporal, mensajes genéricos ("credenciales incorrectas").
4. **Reemplazar `rolDesdeCookie`/`getAuthRole`** por la lectura de sesión en BD;
   `proxy.ts` solo verifica que exista cookie y la validación real va en el servidor.
5. **Atribución**: `audit.ts` y los eventos de estatus guardan el `userId` real.
6. **Rutas públicas**: `/publico/unidad/[folio]` usa un **token largo e imposible de
   adivinar** por unidad (no el folio), revocable, y nunca lee la cookie ni muestra
   costos, proveedores ni comentarios. `/publico/operacion` pasa a requerir token.
7. **Compartir links internos**: los links a pantallas internas siempre piden login;
   `next=` solo acepta rutas internas (ya se valida).
8. Opcional después: login con Google Workspace de MH (OAuth) en lugar de contraseña.

## Riesgos
- Migración: dar de alta usuarios antes de apagar la clave compartida, y coordinar con
  Jaime, Raúl y Dirección. Mantener la clave vieja solo un par de días como respaldo.
- Cambiar `AUTH_SECRET` cierra todas las sesiones actuales (es lo esperado).

---

# Bloque C. Pantallas de carga y avisos de "procesando"

## Problema
No hay `loading.tsx` en ninguna ruta, y solo 5 componentes usan `useTransition`/estado
pendiente. Al guardar, generar orden de pago o importar, el usuario no ve nada y vuelve
a hacer clic (acciones duplicadas, órdenes dobles).

## Cambios
1. **`loading.tsx`** con esqueletos en `/`, `/operaciones`, `/costos`, `/reportes`,
   `/embarques/[id]`, `/cotizaciones`, `/ventas`, `/analitica`.
2. **Barra de progreso superior** en navegación entre páginas (indicador global).
3. **Botón de envío reutilizable** `<SubmitButton>` con `useFormStatus`: deshabilitado
   mientras corre, con spinner y texto ("Guardando...", "Generando orden...").
   Reemplazar los `<button>` de formularios con server actions en todas las pantallas.
4. **Candado anti-doble clic** en acciones críticas (orden de pago, importar Excel,
   sincronizar con ERP, subir foto/documento): ignorar un segundo envío en curso.
5. **Avisos (toast)** al terminar: éxito o error con mensaje claro, para que el usuario
   sepa que terminó y no repita.
6. **Operaciones largas** (importar Excel, sync ERP): overlay con mensaje "Procesando,
   no cierres esta ventana" y resultado final.
7. **Confirmaciones** en acciones destructivas (ya existe `ConfirmSubmitButton`;
   unificarlo con el nuevo botón).

## Verificación
- Probar cada acción con red lenta (throttling de DevTools) y confirmar que el botón
  queda bloqueado y se ve el aviso; verificar que no se crean registros duplicados.

---

# Bloque D. Imágenes: WebP + miniaturas (reemplaza el paso A1 "solo caché")

## Por qué
- Las listas muestran fotos de 36-64 px pero mandan la foto de 1100 px completa.
  **La miniatura ahorra más que el formato**: una miniatura WebP de 160 px pesa ~5-10 KB
  contra 150-400 KB del JPEG actual (o hasta 1.5 MB si vino del ERP).
- WebP baja otro 25-35% sobre JPEG a la misma calidad.
- La compresión actual es en el navegador (`FotoEquipo`, canvas a JPEG). No sirve para
  las fotos que llegan del ERP (`/api/erp/unidades`) y Safari/iPhone no genera WebP desde
  canvas de forma confiable. Por eso la conversión va **en el servidor**.

## Cambios
1. Agregar `sharp` (lo usa Next.js para imágenes; corre en funciones de Vercel).
2. Función `procesarFoto(buffer)` en `src/lib/imagenes.ts`:
   - valida tipo real por bytes mágicos (JPEG/PNG/WebP/HEIC), no por el `data:` declarado;
   - `sharp(buf, { limitInputPixels: 40e6 }).rotate()` (corrige orientación del celular
     y descarta metadatos EXIF/GPS);
   - genera **dos versiones WebP**: `thumb` 160 px (calidad 70) y `full` 1200 px (calidad 80).
3. Nueva tabla `Foto` (shipmentId, thumb Bytes, full Bytes, hash, tamaños, creada) en vez
   del string base64 en `Shipment.fotoUrl`. Lo mismo opcional para documentos de imagen
   (los PDF se dejan como están, en su tabla y servidos por ruta).
4. Ruta `/api/foto/[id]?v=<hash>&t=thumb|full` con
   `Cache-Control: private, max-age=31536000, immutable` (privada porque requiere sesión)
   y `X-Content-Type-Options: nosniff`. La CDN no la cachea, pero el navegador sí: cada
   foto viaja una vez por usuario.
5. Llamar `procesarFoto` en `guardarFotoEquipo`, `FotoInputNueva` y `/api/erp/unidades`.
6. **Script de migración** `scripts/migrar-fotos.ts` que convierte las fotos existentes y
   luego vacía `fotoUrl`. Correr primero en una rama de Neon (copia) antes que en prod.
7. Bajar `serverActions.bodySizeLimit` de 15 MB a 5 MB una vez que las fotos lleguen ya
   comprimidas desde el navegador (se mantiene la compresión en cliente como primer paso).

## Beneficio extra
La base es Neon (Postgres). Leer base64 en cada página también gasta transferencia y
cómputo de Neon; sacar las fotos de las consultas de listas reduce eso igual.

## A futuro
Si las fotos crecen mucho, moverlas a Vercel Blob o S3 con URL firmada. No es necesario
ahora: con miniaturas y caché de navegador el consumo queda muy por debajo del límite.

---

# Evaluación de seguridad y rendimiento del plan

## Seguridad (lo que se agrega o se garantiza)
| Riesgo | Medida |
|---|---|
| Sesión sin dueño / clave compartida | Bloque B: usuarios, contraseñas con argon2id, sesiones en BD revocables, 8-12 h |
| Cookie falsificable (existió hasta 30-oct) | Ya corregido con HMAC; Bloque B lo reemplaza por token aleatorio en BD |
| Clave compartida pudo circular | **Rotar `APP_PASSWORD`, `APP_PASSWORD_VIEW` y fijar `AUTH_SECRET` propio ya**, antes del Bloque B |
| Fuerza bruta al login | Límite de intentos por IP y por usuario + regla de rate limit en Firewall de Vercel para `/login` |
| `/publico/*` abierto y adivinable por folio | Token aleatorio por unidad, revocable; `/publico/operacion` con token o login de lectura |
| Ruta de fotos expone imágenes | `/api/foto` exige sesión, salvo foto ligada a un token público válido |
| Archivos maliciosos | Validar bytes mágicos, re-codificar con sharp (elimina contenido extra y EXIF/GPS), `nosniff`, PDF con `Content-Disposition: attachment` |
| Imágenes gigantes que tumban la función | `limitInputPixels`, límite de body 5 MB, límite ERP 4 MB (ya existe) |
| Clickjacking / inyección | Headers en `next.config.ts`: `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, CSP básica (`img-src 'self' data:` mientras dure la migración) |
| Endpoints ERP | Ya usan Bearer en tiempo constante + rate limit; añadir regla de Firewall de Vercel para `/api/erp/*` |
| Auditoría | `userId` real en bitácora y eventos de estatus |

## Rendimiento (metas medibles)
| Página | Hoy (estimado) | Meta |
|---|---|---|
| `/` y `/operaciones` | varios MB de HTML (fotos base64) | < 150 KB HTML + miniaturas cacheadas |
| `/reportes/pantalla` | ~288 recargas/día con todas las fotos | `router.refresh` cada 15-30 min, sin fotos en el payload |
| Fast Origin Transfer | 26.6 GB/30 días | < 1 GB/30 días |

Además: `select` explícito en listas (no traer `documentos`, `incidencias` ni base64), índices
ya existentes en `estatus` y `shipmentId` son suficientes; revisar `@prisma/client` 6.19 vs
`@prisma/adapter-neon` 7.10 (versiones distintas: alinear para evitar errores raros).

## Pruebas antes de pasar a master
- `npm run build` + `npm run lint` sin errores.
- Medir tamaño de respuesta de `/`, `/operaciones`, `/reportes/pantalla` con `curl -s | wc -c`.
- Probar en iPhone (Safari) y Android: subir foto, ver miniatura y foto completa.
- Probar con red lenta: botones bloqueados, sin duplicados.
- Probar sin sesión: `/`, `/api/foto/*`, `/embarques/*` redirigen a login; `/publico` solo con token.

---

# Bloque E. Mudanza a GitHub y Vercel de Fernando (despliegue hoy)

Objetivo: tener la app activa hoy en un proyecto de Vercel fuera del equipo pausado,
ya con las correcciones de consumo.

## Alcance para hoy (lo que entra en el primer despliegue)
- Bloque A pasos 2-3 (consultas sin base64, pantalla de TV) + Bloque D (fotos WebP con
  miniatura y ruta cacheable, con migración de fotos existentes).
- Bloque C básico: botón de envío con estado "Guardando..." y bloqueo de doble clic,
  `loading.tsx` en las rutas principales.
- Headers de seguridad y `AUTH_SECRET` nuevo.
- **No entra hoy:** login con usuarios (Bloque B), porque requiere migración de BD y dar
  de alta usuarios; va en un segundo despliegue.

## Pasos
1. Fernando crea el repo vacío `fershozavMH/mh-logistica` (privado) en GitHub.
2. Se sube la rama `develop` corregida a ese repo (como `main`) conservando historial.
3. Fernando importa el repo en su Vercel (Add New > Project, framework Next.js).
4. Variables de entorno (copiar del proyecto actual, con valores nuevos donde se indica):
   - `DATABASE_URL` (Neon; misma base, ver nota)
   - `APP_PASSWORD`, `APP_PASSWORD_VIEW` → **valores nuevos**
   - `AUTH_SECRET` → **nuevo**, 32+ caracteres aleatorios
   - `MH_LOGISTICA_TOKEN` (el que usa el ERP para llamar a esta app)
   - `ERP_API_SECRET` y la URL del ERP que use `erp-client.ts`
5. Antes del primer deploy: respaldo de Neon (branch) y correr la migración de fotos.
6. Deploy, pruebas de la lista de "Pruebas antes de pasar a master".
7. **Avisar a Rubén la nueva URL** para que el ERP apunte a `/api/erp/*` del proyecto nuevo.
8. Revisar Usage del proyecto nuevo al día siguiente.

## Notas
- Base de datos: se reutiliza la misma Neon; el proyecto viejo está pausado, así que no
  hay dos apps escribiendo a la vez. Si se reactiva el viejo el 10-dic, apagarlo o
  eliminar su dominio para no tener dos versiones.
- Plan Hobby: uso no comercial según términos de Vercel; sirve de puente. Lo estable es
  Pro en el equipo de MH.
- Los links públicos que ya se mandaron a clientes cambian de dominio.

# Orden sugerido de ejecución
0. Rotar claves compartidas y fijar `AUTH_SECRET` (Jaime, en Vercel; 5 minutos).
1. Bloque A pasos 2-3 + Bloque D (miniaturas WebP y ruta de fotos): baja el consumo.
2. Bloque C (rápido, mejora inmediata de uso, sin migración de datos).
3. Bloque B (login real; requiere migración de BD y coordinar usuarios).
4. Bloque A pasos 4-5 y medición.
