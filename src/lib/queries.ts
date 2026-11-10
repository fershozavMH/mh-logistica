import { prisma } from "@/lib/prisma";
import { ESTATUS_ACTIVOS, MESES, diasEnProceso, indiceComplejidad } from "@/lib/constants";

// Las fechas "solo día" (ej. fechaSalidaProgramada) se guardan como
// medianoche UTC al venir de strings "YYYY-MM-DD". Por eso aquí también
// se usa UTC para definir "hoy": evita que un servidor en otra zona
// horaria (ej. México, UTC-6) deje fuera el rango por unas horas.
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

// "Hoy" en hora de Baja California (Tijuana/Mexicali, donde está Jaime) — a
// diferencia de startOfDay/endOfDay de arriba (UTC, para fechas "solo día"),
// esto es para comparar contra timestamps REALES (fechaGenerada de una
// orden, fecha de un StatusEvent/Comment, fechaRecordatorio).
//
// OJO: `new Date().setHours(0,0,0,0)` NO sirve para esto en producción —
// usa la zona horaria del SERVIDOR, y Vercel corre sus funciones en UTC sin
// importar dónde esté Jaime. Con eso, la "medianoche" quedaba 7-8 horas
// corrida de la medianoche real de Baja California, así que cosas que
// pasaban en la tarde/noche de Jaime parecían "ya del día siguiente" (o
// viceversa) para el sistema. Por eso aquí se calcula la medianoche real en
// la zona horaria del negocio con Intl.DateTimeFormat (sin necesitar ninguna
// librería de fechas), sin importar en qué zona corra el servidor.
const ZONA_HORARIA_NEGOCIO = "America/Tijuana"; // Baja California

function zonaHorariaAUtc(y: number, mes: number, dia: number, hora: number, min: number, seg: number, zona: string) {
  // Interpreta Y-M-D H:M:S como si fuera hora de `zona` y regresa el Date UTC
  // equivalente. Método de "adivinar y corregir": se arma un Date asumiendo
  // UTC, se ve qué hora de pared le corresponde en `zona`, y se corrige la
  // diferencia (así se obtiene el offset real de esa zona en esa fecha,
  // incluyendo horario de verano, sin tener que calcularlo a mano).
  const intento = new Date(Date.UTC(y, mes - 1, dia, hora, min, seg));
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(intento);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)!.value);
  const horaPared = valor("hour") === 24 ? 0 : valor("hour");
  const comoSiFueraUtc = Date.UTC(valor("year"), valor("month") - 1, valor("day"), horaPared, valor("minute"), valor("second"));
  const diferencia = comoSiFueraUtc - intento.getTime();
  return new Date(intento.getTime() - diferencia);
}

function startOfLocalDay(d: Date) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA_NEGOCIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)!.value);
  return zonaHorariaAUtc(valor("year"), valor("month"), valor("day"), 0, 0, 0, ZONA_HORARIA_NEGOCIO);
}
function endOfLocalDay(d: Date) {
  return new Date(startOfLocalDay(d).getTime() + 24 * 60 * 60 * 1000 - 1);
}

type ConCostos = {
  costoFleteUSA: number;
  costoImportacion: number;
  // Bond/Canadá: trámite para cruzar de Canadá a USA, solo aplica a esas
  // unidades (en las demás queda en 0). Se suma junto con Importación para
  // el desglose de "costo de importación" en los reportes. Opcional porque
  // las órdenes de pago viejas no tienen este campo (ese monto quedó
  // pre-sumado dentro de su costoImportacion al generarse, antes de que
  // Bond/Canadá fuera un concepto aparte); las nuevas sí lo traen.
  costoBondCanada?: number;
  costoManiobras: number;
  costoFleteMx: number;
  costoPermiso: number;
  costoSeguro: number;
  costoPlacas: number;
  costoRepuveTitulo: number;
};

function costosPorConceptoDe(unidades: ConCostos[]) {
  return unidades.reduce(
    (acc, s) => {
      acc.fleteUSA += s.costoFleteUSA;
      acc.importacion += s.costoImportacion + (s.costoBondCanada ?? 0);
      acc.maniobras += s.costoManiobras;
      acc.fleteMx += s.costoFleteMx;
      acc.permiso += s.costoPermiso;
      acc.seguro += s.costoSeguro;
      acc.placas += s.costoPlacas;
      acc.repuveTitulo += s.costoRepuveTitulo;
      return acc;
    },
    { fleteUSA: 0, importacion: 0, maniobras: 0, fleteMx: 0, permiso: 0, seguro: 0, placas: 0, repuveTitulo: 0 }
  );
}

// Cuánto dinero/trabajo se le dio a cada proveedor en un periodo, y qué % del
// total de ese concepto representa — solo cuenta unidades con monto > 0 (no
// tiene caso listar "proveedor sin costo"). Si el monto existe pero no hay
// proveedor capturado, se agrupa bajo "Sin proveedor capturado" para que se
// note el hueco de datos en vez de perderse silenciosamente.
function agruparPorProveedor<T extends Record<string, unknown>>(
  unidades: T[],
  campoProveedor: keyof T,
  campoCosto: keyof T
) {
  const mapa = new Map<string, { monto: number; n: number }>();
  let total = 0;
  for (const s of unidades) {
    const monto = (s[campoCosto] as number) ?? 0;
    if (monto <= 0) continue;
    const proveedor = ((s[campoProveedor] as string | null)?.trim()) || "Sin proveedor capturado";
    const entry = mapa.get(proveedor) ?? { monto: 0, n: 0 };
    entry.monto += monto;
    entry.n += 1;
    mapa.set(proveedor, entry);
    total += monto;
  }
  return Array.from(mapa.entries())
    .map(([proveedor, { monto, n }]) => ({
      proveedor,
      monto,
      n,
      pct: total > 0 ? Math.round((monto / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.monto - a.monto);
}

export async function getAgendaHoy() {
  const today = new Date();
  const todayStart = startOfLocalDay(today);
  const todayEnd = endOfLocalDay(today);

  const reuniones = await prisma.comment.findMany({
    where: {
      tipo: "reunion",
      resuelto: false,
      fechaRecordatorio: { gte: todayStart, lte: todayEnd },
    },
    orderBy: { fechaRecordatorio: "asc" },
  });

  return {
    jaime: reuniones.filter((r) => r.autor === "Jaime Zamudio"),
    raul: reuniones.filter((r) => r.autor === "Raúl Favela"),
    otros: reuniones.filter((r) => r.autor !== "Jaime Zamudio" && r.autor !== "Raúl Favela"),
  };
}

export async function getDashboardData() {
  const today = new Date();
  // fechaSalidaProgramada es "solo día" (UTC); fechaRecordatorio es un
  // timestamp real (hora local) — cada uno necesita su propio "hoy".
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const todayStartLocal = startOfLocalDay(today);
  const todayEndLocal = endOfLocalDay(today);

  const [shipments, salidasHoy, recordatoriosHoy, comentariosAbiertos, ordenesPendientes] =
    await Promise.all([
      prisma.shipment.findMany({ orderBy: { updatedAt: "desc" } }),
      prisma.shipment.findMany({
        where: { fechaSalidaProgramada: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.comment.findMany({
        where: {
          tipo: "recordatorio",
          resuelto: false,
          fechaRecordatorio: { gte: todayStartLocal, lte: todayEndLocal },
        },
        include: { shipment: true },
        orderBy: { fechaRecordatorio: "asc" },
      }),
      prisma.comment.findMany({
        where: { resuelto: false },
        include: { shipment: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.paymentOrder.findMany({
        where: { estatusPago: "Pendiente", eliminadaAt: null },
        include: { shipment: true },
        orderBy: { fechaGenerada: "desc" },
      }),
    ]);

  const activos = shipments.filter((s) => ESTATUS_ACTIVOS.includes(s.estatus as never));
  const entregadosMes = shipments.filter(
    (s) =>
      s.estatus === "Entregado" &&
      s.fechaEntrega &&
      s.fechaEntrega.getMonth() === today.getMonth() &&
      s.fechaEntrega.getFullYear() === today.getFullYear()
  );

  const porEstatus: Record<string, number> = {};
  for (const s of shipments) {
    porEstatus[s.estatus] = (porEstatus[s.estatus] ?? 0) + 1;
  }

  const totalCostosActivos = activos.reduce(
    (acc, s) =>
      acc +
      s.costoFleteUSA +
      s.costoImportacion +
      s.costoBondCanada +
      s.costoManiobras +
      s.costoFleteMx +
      s.costoPermiso +
      s.costoSeguro +
      s.costoPlacas +
      s.costoRepuveTitulo,
    0
  );

  // Desglose por concepto, solo de operaciones que AÚN NO se han entregado.
  const costosPorConcepto = costosPorConceptoDe(activos);

  return {
    totalActivos: activos.length,
    totalEntregadosMes: entregadosMes.length,
    totalUnidades: shipments.length,
    porEstatus,
    activos,
    salidasHoy,
    recordatoriosHoy,
    comentariosAbiertos,
    ordenesPendientes,
    totalCostosActivos,
    costosPorConcepto,
    enAgencia: activos.filter((s) => s.estatus === "Agencia"),
    enListoParaEntregar: activos.filter((s) => s.estatus === "Listo para entregar"),
    enFleteMexico: activos.filter((s) => s.estatus === "Flete México"),
    recientes: shipments.slice(0, 8),
  };
}

// Tablero de /operaciones: solo los campos que pinta cada tarjeta (antes
// traía las ~80 columnas de cada unidad, con costos y precios, que no se usan).
export async function getShipmentsBoard() {
  return prisma.shipment.findMany({
    select: {
      id: true,
      folio: true,
      estatus: true,
      equipoDescripcion: true,
      cliente: true,
      vendedor: true,
      serie: true,
      aduana: true,
      fechaInicio: true,
      fechaEntrega: true,
      fechaSalidaProgramada: true,
      tiempoCicloDias: true,
      updatedAt: true,
    },
    orderBy: [{ estatus: "asc" }, { updatedAt: "desc" }],
  });
}

export async function getShipment(id: string) {
  return prisma.shipment.findUnique({
    where: { id },
    include: {
      statusEvents: { orderBy: { fecha: "desc" } },
      comments: { orderBy: { createdAt: "desc" } },
      paymentOrders: { where: { eliminadaAt: null }, orderBy: { fechaGenerada: "desc" } },
      _count: { select: { paymentOrders: true } },
      sales: true,
      gastosFleteUSA: { orderBy: { fecha: "desc" } },
      archivos: { orderBy: { createdAt: "desc" } },
    },
  });
}

// Para la ficha pública de seguimiento por cliente (/publico/unidad/[token]):
// solo los campos que un cliente externo debería ver — nada de costos,
// proveedores, datos bancarios ni comentarios internos de Logística.
export async function getShipmentPublicoByToken(tokenPublico: string) {
  return prisma.shipment.findUnique({
    where: { tokenPublico },
    select: {
      folio: true,
      equipoDescripcion: true,
      serie: true,
      cliente: true,
      categoria: true,
      estatus: true,
      tokenPublico: true,
      updatedAt: true,
      origenCiudad: true,
      aduana: true,
      destinoCiudad: true,
      fechaInicio: true,
      fechaEntrega: true,
      fechaSalidaProgramada: true,
      tiempoCicloDias: true,
      createdAt: true,
      statusEvents: { select: { estatusNuevo: true, fecha: true }, orderBy: { fecha: "asc" } },
    },
  });
}

export async function getCotizaciones() {
  return prisma.cotizacion.findMany({
    orderBy: { fecha: "desc" },
    include: { shipment: { select: { id: true, folio: true } } },
  });
}

// Incluye fotoUrl (se omite por defecto): la página de detalle solo la usa para
// saber si hay foto y el formulario de edición la necesita para no borrarla.
export async function getCotizacion(id: string) {
  return prisma.cotizacion.findUnique({ where: { id }, omit: { fotoUrl: false } });
}

// Nombres de proveedores/agentes ya usados en el sistema (unidades reales +
// histórico del PDF), para ofrecerlos como sugerencia en vez de escribirlos
// de nuevo cada vez. No es una lista cerrada (se puede seguir escribiendo
// uno nuevo), solo evita repetir texto para los que ya se usan seguido.
export async function getProveedores() {
  const [shipments, historico] = await Promise.all([
    prisma.shipment.findMany({
      select: { proveedorCompra: true, provFleteUSA: true, provAgenteAduanal: true },
    }),
    prisma.costoHistorico.findMany({
      select: { proveedorCompra: true, provFleteUSA: true, provAgenteAduanal: true },
    }),
  ]);

  const todos = [...shipments, ...historico];
  const unico = (campo: "proveedorCompra" | "provFleteUSA" | "provAgenteAduanal") =>
    Array.from(
      new Set(
        todos
          .map((r) => r[campo]?.trim())
          .filter((v): v is string => !!v)
      )
    ).sort((a, b) => a.localeCompare(b, "es"));

  return {
    proveedorCompra: unico("proveedorCompra"),
    provFleteUSA: unico("provFleteUSA"),
    provAgenteAduanal: unico("provAgenteAduanal"),
  };
}

export async function getOrigenPorEstado() {
  const shipments = await prisma.shipment.findMany({
    select: { origenCiudad: true, estatus: true },
  });

  const { estadoDesdeOrigen } = await import("@/lib/usaCanadaMap");
  const conteo = new Map<string, number>();
  for (const s of shipments) {
    const code = estadoDesdeOrigen(s.origenCiudad);
    if (!code) continue;
    conteo.set(code, (conteo.get(code) ?? 0) + 1);
  }
  return conteo;
}

export interface OrigenDetalleUnidad {
  id: string;
  folio: string;
  equipoDescripcion: string;
  cliente: string;
  serie: string;
  estatus: string;
  origenCiudad: string | null;
}

/** Detalle de qué unidades salieron de cada estado/provincia (para el panel del mapa). */
export async function getOrigenDetalle() {
  const shipments = await prisma.shipment.findMany({
    select: {
      id: true,
      folio: true,
      equipoDescripcion: true,
      cliente: true,
      serie: true,
      estatus: true,
      origenCiudad: true,
    },
    orderBy: { equipoDescripcion: "asc" },
  });

  const { estadoDesdeOrigen } = await import("@/lib/usaCanadaMap");
  const porEstado = new Map<string, OrigenDetalleUnidad[]>();
  for (const s of shipments) {
    const code = estadoDesdeOrigen(s.origenCiudad);
    if (!code) continue;
    const lista = porEstado.get(code) ?? [];
    lista.push(s);
    porEstado.set(code, lista);
  }
  return porEstado;
}

export async function getMapShipments() {
  const shipments = await prisma.shipment.findMany({
    where: { estatus: { not: "Entregado" } },
    orderBy: { updatedAt: "desc" },
  });
  return shipments;
}

// ---------------------------------------------------------------------------
// Analítica
// ---------------------------------------------------------------------------

export async function getTiempoPromedioPorEtapa() {
  const { calcularDuracionPorEtapaUnica } = await import("@/lib/ciclo");
  const shipments = await prisma.shipment.findMany({
    select: { fechaEntrega: true, statusEvents: { select: { id: true, estatusNuevo: true, fecha: true } } },
  });

  // "n" (movimientos) solo cuenta los pasos por una etapa que YA TERMINARON
  // (la unidad avanzó a la siguiente etapa) — de ahí sale el promedio de
  // días, porque ya se sabe cuánto duró completo. Las unidades que SIGUEN
  // ahí mismo en este momento (enCurso) no se pueden promediar todavía (no
  // se sabe cuánto van a durar en total), pero se cuentan aparte en
  // "enCurso" para que no parezca que "faltan" unidades. Se usa la versión
  // "única" para que una unidad con movimientos duplicados (error de
  // captura) no aporte dos veces a la misma etapa.
  const porEtapa = new Map<string, { suma: number; n: number; enCurso: number }>();
  for (const s of shipments) {
    const duraciones = calcularDuracionPorEtapaUnica(s.statusEvents, s.fechaEntrega);
    for (const d of duraciones) {
      if (d.estatus === "Entregado") continue; // etapa final: no "dura", ya se cerró el ciclo
      const entry = porEtapa.get(d.estatus) ?? { suma: 0, n: 0, enCurso: 0 };
      if (d.enCurso) {
        entry.enCurso += 1;
      } else {
        entry.suma += d.dias;
        entry.n += 1;
      }
      porEtapa.set(d.estatus, entry);
    }
  }

  return Array.from(porEtapa.entries())
    .map(([estatus, { suma, n, enCurso }]) => ({
      estatus,
      promedioDias: n > 0 ? Math.round((suma / n) * 10) / 10 : null,
      n,
      enCurso,
    }))
    .sort((a, b) => (b.promedioDias ?? 0) - (a.promedioDias ?? 0));
}

export async function getCicloPromedioPorMes() {
  const sales = await prisma.sale.findMany({
    where: { tiempoCicloDias: { not: null } },
  });

  const porMes = new Map<string, { suma: number; n: number }>();
  for (const m of MESES) porMes.set(m, { suma: 0, n: 0 });

  for (const s of sales) {
    if (!s.mes || s.tiempoCicloDias == null) continue;
    const entry = porMes.get(s.mes) ?? { suma: 0, n: 0 };
    entry.suma += s.tiempoCicloDias;
    entry.n += 1;
    porMes.set(s.mes, entry);
  }

  return MESES.map((mes) => {
    const e = porMes.get(mes)!;
    return {
      mes,
      promedioDias: e.n ? Math.round((e.suma / e.n) * 10) / 10 : null,
      cantidad: e.n,
    };
  }).filter((m) => m.cantidad > 0);
}

export async function getRendimientoProveedores() {
  const [shipments, historico] = await Promise.all([
    prisma.shipment.findMany({
      where: {
        OR: [
          { costoFleteUSA: { gt: 0 } },
          { costoImportacion: { gt: 0 } },
          { costoFleteMx: { gt: 0 } },
        ],
      },
    }),
    prisma.costoHistorico.findMany(),
  ]);

  type Row = {
    proveedor: string;
    rol: "Compra" | "Flete USA" | "Agente Aduanal";
    fleteUSA: number;
    importacion: number;
    fleteMx: number;
    n: number;
  };

  const map = new Map<string, Row>();

  function add(proveedor: string | null | undefined, rol: Row["rol"], fleteUSA: number, importacion: number, fleteMx: number) {
    if (!proveedor || proveedor === "N/A" || proveedor.toLowerCase().includes("sin documentos")) return;
    const key = `${rol}::${proveedor}`;
    const row = map.get(key) ?? { proveedor, rol, fleteUSA: 0, importacion: 0, fleteMx: 0, n: 0 };
    row.fleteUSA += fleteUSA;
    row.importacion += importacion;
    row.fleteMx += fleteMx;
    row.n += 1;
    map.set(key, row);
  }

  for (const s of shipments) {
    add(s.provFleteUSA, "Flete USA", s.costoFleteUSA, 0, 0);
    add(s.provAgenteAduanal, "Agente Aduanal", 0, s.costoImportacion, 0);
  }
  for (const h of historico) {
    add(h.provFleteUSA, "Flete USA", h.costoFleteUSA, 0, 0);
    add(h.provAgenteAduanal, "Agente Aduanal", 0, h.costoImportacion, 0);
  }

  const rows = Array.from(map.values()).map((r) => ({
    ...r,
    promedio:
      r.rol === "Flete USA" ? r.fleteUSA / r.n : r.rol === "Agente Aduanal" ? r.importacion / r.n : r.fleteMx / r.n,
  }));

  rows.sort((a, b) => b.n - a.n);
  return rows;
}

export async function getCostosPromedio2026() {
  const [shipments, historico] = await Promise.all([
    prisma.shipment.findMany(),
    prisma.costoHistorico.findMany(),
  ]);

  const fleteUSA = [
    ...shipments.map((s) => s.costoFleteUSA).filter((v) => v > 0),
    ...historico.map((h) => h.costoFleteUSA).filter((v) => v > 0),
  ];
  const importacion = [
    ...shipments.map((s) => s.costoImportacion + s.costoBondCanada).filter((v) => v > 0),
    ...historico.map((h) => h.costoImportacion).filter((v) => v > 0),
  ];
  const fleteMx = [
    ...shipments.map((s) => s.costoFleteMx).filter((v) => v > 0),
    ...historico.map((h) => h.costoFleteMx).filter((v) => v > 0),
  ];
  const maniobras = shipments.map((s) => s.costoManiobras).filter((v) => v > 0);
  const permiso = shipments.map((s) => s.costoPermiso).filter((v) => v > 0);
  const seguro = shipments.map((s) => s.costoSeguro).filter((v) => v > 0);
  const placas = shipments.map((s) => s.costoPlacas).filter((v) => v > 0);
  const repuveTitulo = shipments.map((s) => s.costoRepuveTitulo).filter((v) => v > 0);

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  return {
    fleteUSA: { promedio: avg(fleteUSA), n: fleteUSA.length },
    importacion: { promedio: avg(importacion), n: importacion.length },
    fleteMx: { promedio: avg(fleteMx), n: fleteMx.length },
    maniobras: { promedio: avg(maniobras), n: maniobras.length },
    permiso: { promedio: avg(permiso), n: permiso.length },
    seguro: { promedio: avg(seguro), n: seguro.length },
    placas: { promedio: avg(placas), n: placas.length },
    repuveTitulo: { promedio: avg(repuveTitulo), n: repuveTitulo.length },
  };
}

// Costo promedio por concepto, agrupado por categoría de equipo (Grúa
// Titán, Grúa Articulada, Retroexcavadora, etc.) — para comparar, por
// ejemplo, si el flete de una grúa articulada sale en promedio más caro
// que el de una grúa Titán. Cada promedio se calcula solo sobre los
// registros de esa categoría con costo capturado (> 0), igual que
// getCostosPromedio2026(). Factorizado en una función compartida para
// poder usarse tanto con TODAS las unidades (Analítica) como con solo las
// entregadas de un periodo (Reportes → mensual, reporte para dirección).
type ShipmentConCategoria = {
  categoria: string | null;
  tipoUnidad: string | null;
  costoFleteUSA: number;
  costoImportacion: number;
  costoBondCanada?: number;
  costoFleteMx: number;
  costoManiobras: number;
  costoPermiso: number;
  costoSeguro: number;
  costoPlacas: number;
  costoRepuveTitulo: number;
};

function costosPromedioPorCategoriaDe(shipments: ShipmentConCategoria[]) {
  type Grupo = {
    categoria: string;
    tipoUnidad: string | null;
    n: number;
    fleteUSA: number[];
    importacion: number[];
    fleteMx: number[];
    maniobras: number[];
    total: number[];
  };

  const map = new Map<string, Grupo>();

  for (const s of shipments) {
    if (!s.categoria) continue;
    const g = map.get(s.categoria) ?? {
      categoria: s.categoria,
      tipoUnidad: s.tipoUnidad,
      n: 0,
      fleteUSA: [],
      importacion: [],
      fleteMx: [],
      maniobras: [],
      total: [],
    };
    g.n += 1;
    if (s.costoFleteUSA > 0) g.fleteUSA.push(s.costoFleteUSA);
    const importacionTotal = s.costoImportacion + (s.costoBondCanada ?? 0);
    if (importacionTotal > 0) g.importacion.push(importacionTotal);
    if (s.costoFleteMx > 0) g.fleteMx.push(s.costoFleteMx);
    if (s.costoManiobras > 0) g.maniobras.push(s.costoManiobras);
    const totalCostos =
      s.costoFleteUSA + importacionTotal + s.costoFleteMx + s.costoManiobras +
      s.costoPermiso + s.costoSeguro + s.costoPlacas + s.costoRepuveTitulo;
    if (totalCostos > 0) g.total.push(totalCostos);
    map.set(s.categoria, g);
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const filas = Array.from(map.values()).map((g) => ({
    categoria: g.categoria,
    tipoUnidad: g.tipoUnidad,
    n: g.n,
    fleteUSA: { promedio: avg(g.fleteUSA), n: g.fleteUSA.length },
    importacion: { promedio: avg(g.importacion), n: g.importacion.length },
    fleteMx: { promedio: avg(g.fleteMx), n: g.fleteMx.length },
    maniobras: { promedio: avg(g.maniobras), n: g.maniobras.length },
    costoTotalPromedio: avg(g.total),
  }));

  filas.sort((a, b) => b.n - a.n);
  return filas;
}

export async function getCostosPromedioPorCategoria() {
  const shipments = await prisma.shipment.findMany({
    where: { categoria: { not: null } },
  });
  return costosPromedioPorCategoriaDe(shipments);
}

// Tiempo promedio de ciclo (cuánto tardó en cruzar/entregarse), agrupado
// por categoría de equipo — mismo patrón que costosPromedioPorCategoriaDe()
// pero con días en vez de dinero. El tiempo en Agencia se resta igual que
// en el "Ciclo logístico promedio" general (no es responsabilidad de
// Logística), y se reporta aparte.
type ShipmentConCiclo = {
  categoria: string | null;
  tiempoCicloDias: number | null;
  fechaInicio: Date | null;
  fechaEntrega: Date | null;
  statusEvents: { id: string; estatusNuevo: string; fecha: Date }[];
};

async function tiempoCicloPromedioPorCategoriaDe(shipments: ShipmentConCiclo[]) {
  const { calcularDuracionPorEtapaUnica } = await import("@/lib/ciclo");

  type Grupo = { categoria: string; n: number; ciclo: number[]; agencia: number[] };
  const map = new Map<string, Grupo>();

  for (const s of shipments) {
    if (!s.categoria) continue;
    const duraciones = calcularDuracionPorEtapaUnica(s.statusEvents, s.fechaEntrega);
    const diasAgencia = duraciones.filter((d) => d.estatus === "Agencia").reduce((a, d) => a + d.dias, 0);
    const totalDias = s.tiempoCicloDias ?? diasEnProceso(s.fechaInicio, s.fechaEntrega);

    const g = map.get(s.categoria) ?? { categoria: s.categoria, n: 0, ciclo: [], agencia: [] };
    g.n += 1;
    if (totalDias != null) g.ciclo.push(Math.max(0, totalDias - diasAgencia));
    if (diasAgencia > 0) g.agencia.push(diasAgencia);
    map.set(s.categoria, g);
  }

  const avg = (arr: number[]) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);

  const filas = Array.from(map.values()).map((g) => ({
    categoria: g.categoria,
    n: g.n,
    cicloPromedioDias: avg(g.ciclo),
    diasEnAgenciaPromedio: avg(g.agencia),
  }));

  filas.sort((a, b) => b.n - a.n);
  return filas;
}

export async function getTiempoCicloPromedioPorCategoria() {
  const shipments = await prisma.shipment.findMany({
    where: { categoria: { not: null }, estatus: "Entregado" },
    select: { categoria: true, tiempoCicloDias: true, fechaInicio: true, fechaEntrega: true, statusEvents: { select: { id: true, estatusNuevo: true, fecha: true } } },
  });
  return tiempoCicloPromedioPorCategoriaDe(shipments);
}

// Índice de complejidad de carga (1 a 3) — ver indiceComplejidad() en
// constants.ts para las reglas. Agrupa por categoría + complejidad (una
// misma categoría puede caer en más de un nivel si no es de cama baja,
// según las millas de cada unidad) y da también el resumen total por nivel.
type ShipmentConComplejidad = { categoria: string | null; millas: number };

function indiceComplejidadDe(shipments: ShipmentConComplejidad[]) {
  type Fila = { categoria: string; complejidad: 1 | 2 | 3; n: number };
  const map = new Map<string, Fila>();
  const resumen = { 1: 0, 2: 0, 3: 0 };

  for (const s of shipments) {
    const nivel = indiceComplejidad(s.categoria, s.millas);
    if (nivel == null || !s.categoria) continue;
    const key = `${s.categoria}::${nivel}`;
    const fila = map.get(key) ?? { categoria: s.categoria, complejidad: nivel, n: 0 };
    fila.n += 1;
    map.set(key, fila);
    resumen[nivel] += 1;
  }

  const porCategoria = Array.from(map.values()).sort((a, b) =>
    a.complejidad !== b.complejidad ? a.complejidad - b.complejidad : b.n - a.n
  );

  return { porCategoria, resumen };
}

export async function getIndiceComplejidad() {
  const shipments = await prisma.shipment.findMany({
    where: { categoria: { not: null } },
    select: { categoria: true, millas: true },
  });
  return indiceComplejidadDe(shipments);
}

export async function getVentasPorVendedor() {
  const sales = await prisma.sale.findMany({ where: { origenDato: "app" } });
  const map = new Map<string, number>();
  for (const s of sales) {
    map.set(s.vendedor, (map.get(s.vendedor) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([vendedor, cantidad]) => ({ vendedor, cantidad }));
}

export async function getVentas() {
  return prisma.sale.findMany({
    where: { origenDato: "app" },
    orderBy: { createdAt: "desc" },
    include: { shipment: true },
  });
}

// ---------------------------------------------------------------------------
// Servicios logísticos vendidos a clientes externos (no equipo propio de MH)
// ---------------------------------------------------------------------------

export async function getVentasServicioLogistico() {
  const shipments = await prisma.shipment.findMany({
    where: { tipoVenta: "Servicio Logístico" },
    orderBy: { createdAt: "desc" },
  });

  return shipments.map((s) => {
    const conceptos = [
      { label: "Flete USA", costo: s.costoFleteUSA, precio: s.precioFleteUSA },
      { label: "Importación / Aduana", costo: s.costoImportacion, precio: s.precioImportacion },
      { label: "Flete México", costo: s.costoFleteMx, precio: s.precioFleteMx },
      { label: "Permiso", costo: s.costoPermiso, precio: s.precioPermiso },
      { label: "Seguro", costo: s.costoSeguro, precio: s.precioSeguro },
      { label: "Placas", costo: s.costoPlacas, precio: s.precioPlacas },
    ].map((c) => ({ ...c, utilidad: c.precio - c.costo }));

    const totalCosto = conceptos.reduce((a, c) => a + c.costo, 0);
    const totalPrecio = conceptos.reduce((a, c) => a + c.precio, 0);
    const utilidadTotal = totalPrecio - totalCosto;

    return { shipment: s, conceptos, totalCosto, totalPrecio, utilidadTotal };
  });
}

// ---------------------------------------------------------------------------
// Reportes diario / semanal / mensual
// ---------------------------------------------------------------------------

export async function getReporteDiario(fecha: Date = new Date()) {
  // eventos/ordenesGeneradas/comentarios son timestamps reales (no fechas
  // "solo día"), así que "hoy" se calcula en hora local, no UTC.
  const from = startOfLocalDay(fecha);
  const to = endOfLocalDay(fecha);

  const [eventos, ordenesGeneradas, comentarios, unidadesEnOperacion] = await Promise.all([
    prisma.statusEvent.findMany({
      where: { fecha: { gte: from, lte: to } },
      include: { shipment: true },
      orderBy: { fecha: "asc" },
    }),
    prisma.paymentOrder.findMany({
      where: { fechaGenerada: { gte: from, lte: to }, eliminadaAt: null },
      include: { shipment: true },
    }),
    prisma.comment.findMany({
      where: { fecha: { gte: from, lte: to } },
      include: { shipment: true },
    }),
    prisma.shipment.findMany({
      where: { estatus: { not: "Entregado" } },
      // Orden fijo por fecha de ingreso a operación (más reciente arriba) —
      // antes se ordenaba por updatedAt, que cambiaba el acomodo cada vez que
      // se tocaba algo de la unidad (comentario, estatus, etc.). Jaime pidió
      // que el orden no se mueva.
      orderBy: [{ fechaInicio: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      include: {
        // Los comentarios por unidad en el cierre diario NO se filtran por
        // hoy a propósito: Jaime los usa como notas que se quedan puestas
        // hasta que él mismo las cambie, no que se borren de la vista al
        // día siguiente. Se traen los últimos 3 (mismo tope que ya existía).
        comments: {
          where: { tipo: "comentario" },
          orderBy: { createdAt: "desc" },
          take: 3,
        },
        statusEvents: { select: { estatusNuevo: true, fecha: true } },
      },
    }),
  ]);

  const entregasHoy = eventos.filter((e) => e.estatusNuevo === "Entregado");
  const totalPagado = ordenesGeneradas.reduce((a, o) => a + o.total, 0);
  const costoTotalUSD = entregasHoy.reduce(
    (a, e) =>
      a +
      e.shipment.costoFleteUSA +
      e.shipment.costoImportacion +
      e.shipment.costoBondCanada +
      e.shipment.costoManiobras +
      e.shipment.costoFleteMx +
      e.shipment.costoPermiso +
      e.shipment.costoSeguro +
      e.shipment.costoPlacas +
      e.shipment.costoRepuveTitulo,
    0
  );
  // "Costo por concepto" se saca de las ÓRDENES DE PAGO generadas hoy (no de
  // las unidades entregadas hoy) — así coincide con "Monto solicitado hoy" de
  // arriba, que también es dinero de órdenes. PaymentOrder ya guarda el monto
  // de cada concepto incluido en esa orden, así que se puede sumar directo.
  const costosPorConcepto = costosPorConceptoDe(ordenesGeneradas);

  return {
    fecha,
    eventos,
    ordenesGeneradas,
    comentarios,
    entregasHoy,
    totalPagado,
    costoTotalUSD,
    costosPorConcepto,
    unidadesEnOperacion,
  };
}

export async function getReporteRango(from: Date, to: Date) {
  const { calcularDuracionPorEtapaUnica } = await import("@/lib/ciclo");

  const [eventos, ordenes, entregas] = await Promise.all([
    prisma.statusEvent.findMany({
      where: { fecha: { gte: from, lte: to } },
      include: { shipment: true },
      orderBy: { fecha: "asc" },
    }),
    prisma.paymentOrder.findMany({
      where: { fechaGenerada: { gte: from, lte: to }, eliminadaAt: null },
      include: { shipment: true },
    }),
    prisma.shipment.findMany({
      where: { estatus: "Entregado", fechaEntrega: { gte: from, lte: to } },
      include: { statusEvents: { select: { id: true, estatusNuevo: true, fecha: true } } },
    }),
  ]);

  const totalPagado = ordenes.reduce((a, o) => a + o.total, 0);
  const costoTotalUSD = entregas.reduce(
    (a, s) =>
      a + s.costoFleteUSA + s.costoImportacion + s.costoBondCanada + s.costoManiobras + s.costoFleteMx + s.costoPermiso + s.costoSeguro + s.costoPlacas + s.costoRepuveTitulo,
    0
  );

  // Costo promedio por unidad ENTREGADA en el periodo, por concepto — este sí
  // se queda basado en las unidades (no en las órdenes), es un dato distinto.
  const costosPorConceptoEntregas = costosPorConceptoDe(entregas);

  // "Costo por concepto" se saca de las ÓRDENES DE PAGO generadas en el
  // periodo (no de las unidades entregadas) — así coincide con "Monto total
  // solicitado" de arriba, que también es dinero de órdenes. PERO los meses
  // históricos (sembrados del PDF) nunca generaron una orden de pago dentro
  // de la app — solo tienen los 5 campos de costo directo en el Shipment —
  // así que si el periodo no tiene NINGUNA orden, se usa el costo de las
  // unidades entregadas como respaldo para no mostrar todo en $0.
  const costosPorConcepto = ordenes.length > 0 ? costosPorConceptoDe(ordenes) : costosPorConceptoEntregas;
  const costosPorConceptoFuente: "ordenes" | "entregas" = ordenes.length > 0 ? "ordenes" : "entregas";

  // Pagos por proveedor — solo de los 2 conceptos que sí tienen proveedor
  // capturado en el sistema (Flete USA y el agente que hace la importación).
  // Flete México y Maniobras/Permiso todavía no tienen un campo de
  // proveedor propio en el modelo de datos, por eso no se desglosan aquí.
  const proveedoresFleteUSA = agruparPorProveedor(entregas, "provFleteUSA", "costoFleteUSA");
  const proveedoresAgenteAduanal = agruparPorProveedor(entregas, "provAgenteAduanal", "costoImportacion");
  const n = entregas.length || 1;
  const costoPromedioPorConcepto = {
    fleteUSA: costosPorConceptoEntregas.fleteUSA / n,
    importacion: costosPorConceptoEntregas.importacion / n,
    maniobras: costosPorConceptoEntregas.maniobras / n,
    fleteMx: costosPorConceptoEntregas.fleteMx / n,
    permiso: costosPorConceptoEntregas.permiso / n,
    seguro: costosPorConceptoEntregas.seguro / n,
    placas: costosPorConceptoEntregas.placas / n,
    repuveTitulo: costosPorConceptoEntregas.repuveTitulo / n,
  };

  // Ciclo promedio "logístico" (días) de las unidades entregadas en este
  // periodo: el tiempo en Agencia (reparación o pago pendiente del cliente,
  // ya con la unidad en México) NO se cuenta aquí a propósito — no es
  // responsabilidad de Logística y antes inflaba el promedio. Ese tiempo se
  // reporta aparte en diasEnAgenciaPromedio. También se arma aquí el
  // desglose por etapa (en qué proceso se atoran más).
  const ciclosLogisticos: number[] = [];
  const diasEnAgenciaPorUnidad: number[] = [];
  const porEtapa = new Map<string, { suma: number; n: number }>();
  for (const s of entregas) {
    const duraciones = calcularDuracionPorEtapaUnica(s.statusEvents, s.fechaEntrega);
    const diasAgencia = duraciones
      .filter((d) => d.estatus === "Agencia")
      .reduce((a, d) => a + d.dias, 0);
    if (diasAgencia > 0) diasEnAgenciaPorUnidad.push(diasAgencia);

    const totalDias = s.tiempoCicloDias ?? diasEnProceso(s.fechaInicio, s.fechaEntrega);
    if (totalDias != null) ciclosLogisticos.push(Math.max(0, totalDias - diasAgencia));

    for (const d of duraciones) {
      if (d.enCurso || d.estatus === "Entregado") continue;
      const entry = porEtapa.get(d.estatus) ?? { suma: 0, n: 0 };
      entry.suma += d.dias;
      entry.n += 1;
      porEtapa.set(d.estatus, entry);
    }
  }
  const cicloPromedioDias = ciclosLogisticos.length
    ? Math.round((ciclosLogisticos.reduce((a, d) => a + d, 0) / ciclosLogisticos.length) * 10) / 10
    : null;
  const diasEnAgenciaPromedio = diasEnAgenciaPorUnidad.length
    ? Math.round((diasEnAgenciaPorUnidad.reduce((a, d) => a + d, 0) / diasEnAgenciaPorUnidad.length) * 10) / 10
    : null;
  const etapasPromedio = Array.from(porEtapa.entries())
    .map(([estatus, { suma, n }]) => ({ estatus, promedioDias: Math.round((suma / n) * 10) / 10, n }))
    .sort((a, b) => b.promedioDias - a.promedioDias);

  // Mismo desglose de "Costo promedio por categoría de equipo" que ya existe
  // en Analítica (todo el histórico), pero acotado a las unidades entregadas
  // de este periodo — pedido por Jaime para el reporte mensual que va a
  // dirección.
  const costosPorCategoria = costosPromedioPorCategoriaDe(entregas);
  const indiceComplejidadResumen = indiceComplejidadDe(entregas);
  const tiempoPorCategoria = await tiempoCicloPromedioPorCategoriaDe(entregas);

  return {
    from,
    to,
    eventos,
    ordenes,
    entregas,
    totalPagado,
    costoTotalUSD,
    costosPorConcepto,
    costosPorConceptoFuente,
    proveedoresFleteUSA,
    proveedoresAgenteAduanal,
    costoPromedioPorConcepto,
    cicloPromedioDias,
    diasEnAgenciaPromedio,
    etapasPromedio,
    costosPorCategoria,
    indiceComplejidad: indiceComplejidadResumen,
    tiempoPorCategoria,
  };
}
