-- CreateTable
CREATE TABLE "SolicitudEstimacion" (
    "id" TEXT NOT NULL,
    "erpEquipoId" TEXT NOT NULL,
    "equipoDescripcion" TEXT NOT NULL,
    "serie" TEXT,
    "proveedor" TEXT,
    "origenCiudad" TEXT,
    "precioCompra" DOUBLE PRECISION,
    "comprador" TEXT,
    "solicitadoPor" TEXT,
    "notas" TEXT,
    "estatus" TEXT NOT NULL DEFAULT 'Pendiente',
    "estFleteUSA" DOUBLE PRECISION,
    "estImportacion" DOUBLE PRECISION,
    "estimadoPor" TEXT,
    "estimadoAt" TIMESTAMP(3),
    "erpEnviado" BOOLEAN NOT NULL DEFAULT false,
    "erpError" TEXT,
    "erpEnviadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolicitudEstimacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SolicitudEstimacion_erpEquipoId_key" ON "SolicitudEstimacion"("erpEquipoId");

-- CreateIndex
CREATE INDEX "SolicitudEstimacion_estatus_idx" ON "SolicitudEstimacion"("estatus");
