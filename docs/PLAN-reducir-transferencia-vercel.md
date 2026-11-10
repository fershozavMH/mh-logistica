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

# Orden sugerido de ejecución
1. Bloque A pasos 1-3 (baja el consumo de Vercel; lo urgente).
2. Bloque C (rápido, mejora inmediata de uso, sin migración de datos).
3. Bloque B (login real; requiere migración de BD y coordinar usuarios).
4. Bloque A pasos 4-5 y medición.
