-- Unidades que nacen de una estimación del ERP ("Por cotizar"): se guarda el
-- código EQUI-###### del equipo para no duplicarlas y ligarlas al Trato.
ALTER TABLE "Shipment" ADD COLUMN "erpEquipoId" TEXT;

CREATE UNIQUE INDEX "Shipment_erpEquipoId_key" ON "Shipment"("erpEquipoId");
