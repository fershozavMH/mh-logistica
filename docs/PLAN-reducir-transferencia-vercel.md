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
