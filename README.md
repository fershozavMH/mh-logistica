# MH Logística

Panel de operaciones de importación y transporte de Machinery Hunters (Next.js + Prisma + Neon).

## Desarrollo

```bash
npm install
cp .env.example .env.local   # y llena los valores
npm run dev
```

Las migraciones se aplican solas en cada despliegue de Vercel (`vercel-build` → `scripts/migrar.mjs`): Preview contra la base de pruebas y Production contra la real. En local: `npx prisma migrate deploy`.

## Usuarios

Cada persona entra con su correo y contraseña. Roles: Solo lectura, Operación (captura) y Administrador (además administra usuarios en `/usuarios`). No se mandan correos: el administrador genera un link de activación (72 h, un solo uso) y se lo comparte. La primera vez, la cuenta de administrador se activa en `/login` → "Primera vez: activar administrador" con la clave `APP_PASSWORD`.

## Integración con el ERP

El ERP de Machinery Hunters y MH Logística se comunican en las dos direcciones.

**Lo que llama el ERP** (requieren `Authorization: Bearer <MH_LOGISTICA_TOKEN>`; sin token o con token incorrecto responden 401):

| Endpoint | Para qué |
| --- | --- |
| `POST /api/erp/unidades` | Compras envía una unidad a Logística. Upsert por `erpId`; responde `{ ok, id, folio, creado }`. Un reenvío actualiza solo los campos que llegan y nunca cambia el estatus. |
| `POST /api/erp/ordenes-pago/estatus` | Finanzas confirma (`"Pagada"`) o revierte (`"Pendiente"`) el pago de una orden. Folio inexistente → 404; mismo estatus → 200 sin cambios. |

**Lo que MH Logística llama del ERP** (`src/lib/erp.ts`, con `ERP_URL`, `ERP_API_KEY`, `ERP_API_SECRET`):

| Método | Cuándo |
| --- | --- |
| `mh.api.log_orden_pago` | Al generar una orden, al reintentar y al cancelarla (se reenvía con `estatusPago: "Cancelada"`). |
| `mh.api.log_unidad` | Al dar de alta o cambiar una unidad capturada aquí; el `trato` que regresa se guarda como `erpId`. |
| `mh.api.log_proveedores` | Al abrir un formulario de orden (si pasaron 15 min) o con "Actualizar catálogo". |

Reglas que aplica la app:

- Proveedor y cuenta bancaria de cada orden salen del catálogo del ERP; no se captura CLABE a mano.
- El pago solo lo confirma Finanzas desde el ERP (ya no hay "Marcar como pagada").
- Una orden pagada no se cancela ni se elimina. Solo se eliminan órdenes canceladas, con borrado lógico; el folio nunca se reutiliza.
- Si el ERP no responde, la orden queda como "no sincronizada", se reintenta (hasta 3 veces con espera creciente y luego en segundo plano desde Costos) y se muestra en pantalla.
- Cada orden creada, cancelada o eliminada y cada llamada con el ERP queda en la tabla `AuditLog`, sin tokens, llaves ni CLABE completas.
