// Los proveedores que Logística captura por su cuenta llevan este prefijo en
// el id para distinguirlos de los del ERP (que no los conoce).
export const PREFIJO_PROVEEDOR_LOGISTICA = "LOG-";
export const esProveedorDeLogistica = (id: string | null | undefined) => !!id && id.startsWith(PREFIJO_PROVEEDOR_LOGISTICA);
