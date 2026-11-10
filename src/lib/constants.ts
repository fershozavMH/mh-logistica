// Catálogo central de estatus, usuarios y colores de la app.
// Cambiar aquí se refleja en todo el sistema (tablero, mapa, reportes).

export type EstatusKey =
  | "Pendiente"
  | "Flete USA"
  | "Importación / Aduana"
  | "Flete México"
  | "Parking / Patio"
  | "Agencia"
  | "Listo para entregar"
  | "Entregado"
  | "Cancelado";

export interface EstatusInfo {
  key: EstatusKey;
  label: string;
  orden: number;
  /** Color de fondo suave para tarjetas/pastillas */
  bg: string;
  /** Color de texto/acento */
  text: string;
  /** Color sólido para puntos de mapa y barras */
  solid: string;
  descripcion: string;
}

export const ESTATUS_FLOW: EstatusInfo[] = [
  {
    key: "Pendiente",
    label: "Pendiente",
    orden: 0,
    bg: "bg-gray-100",
    text: "text-gray-700",
    solid: "#64748b",
    descripcion: "Aún no se confirma la compra del equipo.",
  },
  {
    key: "Flete USA",
    label: "Flete USA",
    orden: 1,
    bg: "bg-brand-blue-50",
    text: "text-brand-blue-700",
    solid: "#3b82f6",
    descripcion: "En camino hacia la aduana dentro de Estados Unidos.",
  },
  {
    key: "Parking / Patio",
    label: "Parking / Patio",
    orden: 2,
    bg: "bg-gray-200",
    text: "text-gray-900",
    solid: "#334155",
    descripcion: "En patio/parking en espera de siguiente movimiento.",
  },
  {
    key: "Importación / Aduana",
    label: "Importación / Aduana",
    orden: 3,
    bg: "bg-brand-orange-50",
    text: "text-brand-orange-700",
    solid: "#f97316",
    descripcion: "En trámite de importación en la aduana.",
  },
  {
    key: "Agencia",
    label: "Agencia",
    orden: 4,
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    solid: "#10b981",
    descripcion: "Ya está en México, en agencia (reparación o pago pendiente del cliente). Desde aquí ya no corre el ciclo logístico.",
  },
  {
    key: "Listo para entregar",
    label: "Listo para entregar",
    orden: 5,
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    solid: "#059669",
    descripcion: "Ya resuelto en agencia (reparación o pago) — listo para la entrega final.",
  },
  {
    key: "Flete México",
    label: "Flete México",
    orden: 6,
    bg: "bg-brand-blue-100",
    text: "text-brand-blue-900",
    solid: "#1d4ed8",
    descripcion: "Ya cruzó, en camino dentro de México.",
  },
  {
    key: "Entregado",
    label: "Entregado",
    orden: 7,
    bg: "bg-brand-navy",
    text: "text-white",
    solid: "#0f2440",
    descripcion: "Entregado al cliente. Ciclo cerrado.",
  },
  {
    key: "Cancelado",
    label: "Cancelado",
    orden: 8,
    bg: "bg-gray-100",
    text: "text-gray-500",
    solid: "#94a3b8",
    descripcion: "Venta cancelada.",
  },
];

export function estatusInfo(key: string): EstatusInfo {
  return (
    ESTATUS_FLOW.find((e) => e.key === key) ?? {
      key: key as EstatusKey,
      label: key,
      orden: 99,
      bg: "bg-gray-100",
      text: "text-gray-700",
      solid: "#64748b",
      descripcion: "",
    }
  );
}

/** Estatus que cuentan como "en movimiento" para el dashboard en tiempo real */
export const ESTATUS_ACTIVOS: EstatusKey[] = [
  "Pendiente",
  "Flete USA",
  "Parking / Patio",
  "Importación / Aduana",
  "Agencia",
  "Listo para entregar",
  "Flete México",
];

// (la lista USUARIOS se quitó: el nombre ahora sale de la sesión con correo)

export const VENDEDORES = [
  "No vendida",
  "Antonio Montes",
  "Martin Gonzalez",
  "Javier Lopez Molino",
  "Ivan Lopez",
  "David Olivas",
  "Jaime Zamudio",
  "Raul Favela",
  "Carlos Campillo",
] as const;

// Estatus de una orden de pago. Internamente se guarda "Pagado" (así están
// las órdenes existentes y la base es compartida con producción); el ERP
// manda "Pagada" en /api/erp/ordenes-pago/estatus y ahí se traduce.
export const ESTATUS_PAGO = {
  PENDIENTE: "Pendiente",
  PAGADO: "Pagado",
  CANCELADA: "Cancelada",
} as const;

// Conceptos comunes que componen el costo de Flete USA (no es un solo viaje,
// son varios gastos que se van sumando) — sugerencia, no lista cerrada.
export const CONCEPTOS_GASTO_FLETE_USA = ["Viáticos", "Vuelos", "Gastos generales", "Comisión"] as const;

// Bancos comunes para los datos bancarios de la orden de pago — sugerencia,
// no lista cerrada (se puede agregar uno nuevo con el botón "+"). La lista
// que se muestra depende de en qué moneda está la cuenta a pagar.
export const BANCOS_MEXICO = [
  "BBVA",
  "Banorte",
  "Santander",
  "Citibanamex",
  "HSBC",
  "Scotiabank",
  "Inbursa",
  "Banco Azteca",
  "Banregio",
  "BanBajío",
] as const;

export const BANCOS_USA = [
  "Chase",
  "Bank of America",
  "Wells Fargo",
  "Citibank",
  "U.S. Bank",
  "PNC Bank",
  "Truist Bank",
  "Capital One",
  "TD Bank",
  "Goldman Sachs",
] as const;

// Datos de contacto de la empresa para la cotización impresa/PDF que se le
// manda al cliente (tomados de la plantilla de cotización real de Jaime).
export const CONTACTO_EMPRESA = {
  nombre: "Machinery Hunters",
  direccion: "Av. Obregón, Calle 32 y 33, San Luis Río Colorado, Sonora",
  correo: "jaime@machineryhunters.com",
  telefono: "653-114-5262",
};

export const ADUANAS = [
  "Calexico Ca",
  "Laredo Tx",
  "El Paso Tx",
  "San Luis Az",
  "San Diego Ca",
  "No Importación",
] as const;

export const TIPOS_UNIDAD = ["CAMION", "AMARILLO"] as const;

// Categorías fijas de equipo, según el tipo de unidad (Camión o Amarilla).
// Se seleccionan de una lista (ya no se escriben a mano) para evitar variaciones
// de escritura del mismo tipo de equipo (ej. "Camion" vs "Camión").
export const CATEGORIAS_CAMION = [
  "Grúa Titán",
  "Grúa Articulada",
  "Grúa Canastilla",
  "Grúa RT",
  "Grúa Todo Terreno",
  "Bomba de Concreto",
  "Trompo Revolvedor",
  "Camión de Volteo",
  "Camión Plataforma",
  "Roll Off",
  "Camión (otro)",
  "Otros / Accesorios",
] as const;

export const CATEGORIAS_AMARILLO = [
  "Retroexcavadora",
  "Excavadora",
  "Cargador Frontal",
  "Minicargador",
  "Montacargas",
  "Elevador / Plataforma",
  "Vibrocompactador",
  "Tractor Agrícola",
  "Otros / Accesorios",
] as const;

// Categorías que por su tamaño/forma se tienen que levantar en cama baja
// (no se pueden manejar/remolcar como un camión normal) — van siempre en
// índice de complejidad 3, sin importar las millas. Confirmado con Jaime:
// "Topador" ya se captura como "Cargador Frontal" en el sistema.
export const CATEGORIAS_CAMA_BAJA = ["Excavadora", "Cargador Frontal", "Otros / Accesorios"] as const;

// Índice de complejidad de carga (1 a 3), según categoría y millas recorridas:
// 3 = necesita cama baja (ver CATEGORIAS_CAMA_BAJA), sin importar las millas.
// 2 = más de 1500 millas (cualquier equipo que no necesite cama baja).
// 1 = 1500 millas o menos (cualquier equipo que no necesite cama baja).
// Regresa null si no hay categoría capturada (no se puede clasificar).
export function indiceComplejidad(categoria: string | null | undefined, millas: number): 1 | 2 | 3 | null {
  if (!categoria) return null;
  if ((CATEGORIAS_CAMA_BAJA as readonly string[]).includes(categoria)) return 3;
  return millas > 1500 ? 2 : 1;
}

// Conceptos fijos en los que se desglosa Flete USA (viáticos, vuelos,
// seguro/permiso/placas, gastos generales, reparación, pago operador) — se
// capturan juntos en un solo formulario y cada uno se puede incluir o no,
// por separado, al generar una orden de pago.
export const FLETE_USA_SLOTS = [
  { key: "viaticos", label: "Viáticos efectivo" },
  { key: "vuelos", label: "Vuelos" },
  { key: "seguro", label: "Seguro/Permiso/Placas" },
  { key: "generales", label: "Gastos generales" },
  { key: "reparacion", label: "Reparación/Refacción" },
  { key: "operador", label: "Pago operador" },
] as const;
export type FleteUSASlotKey = (typeof FLETE_USA_SLOTS)[number]["key"];

// "Pago operador" guarda el nombre pegado al concepto ("Pago operador: Juan"),
// así que para saber a qué concepto fijo pertenece un gasto ya guardado hay
// que comparar por prefijo en ese caso, no por igualdad exacta.
export function gastoFleteUSAPerteneceASlot(concepto: string, slotKey: FleteUSASlotKey): boolean {
  if (slotKey === "operador") return concepto === "Pago operador" || concepto.startsWith("Pago operador:");
  const slot = FLETE_USA_SLOTS.find((s) => s.key === slotKey);
  return slot ? concepto === slot.label : false;
}

export const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/** Paleta categórica para gráficas con varias series (proveedores, tipos, etc.) */
export const PALETA_CATEGORICA = [
  "#2563eb", // azul
  "#f97316", // naranja
  "#64748b", // gris
  "#0284c7", // azul cielo
  "#d97706", // ámbar
  "#94a3b8", // gris claro ("Otros")
];

export function formatMXN(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

/** Pesos mexicanos reales (para el total convertido con el tipo de cambio del día) */
export function formatPesos(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

/**
 * "Reloj" de la unidad: días desde que se dio de alta (fechaInicio) hasta
 * que se entregó (fechaEntrega), o hasta hoy si todavía sigue en proceso.
 */
export function diasEnProceso(
  fechaInicio: Date | string | null | undefined,
  fechaEntrega: Date | string | null | undefined
): number | null {
  if (!fechaInicio) return null;
  const inicio = typeof fechaInicio === "string" ? new Date(fechaInicio) : fechaInicio;
  const fin = fechaEntrega
    ? typeof fechaEntrega === "string"
      ? new Date(fechaEntrega)
      : fechaEntrega
    : new Date();
  const ms = fin.getTime() - inicio.getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

export function formatHora(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(d);
}

export function formatFecha(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

// Buscador genérico (serie, cliente, equipo...): compara sin mayúsculas ni
// acentos para que encuentre "mexico" aunque esté guardado "México".
function normalizarBusqueda(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function coincideBusqueda(texto: string, campos: (string | null | undefined)[]): boolean {
  const buscado = normalizarBusqueda(texto);
  if (!buscado) return true;
  return campos.some((c) => c && normalizarBusqueda(c).includes(buscado));
}
