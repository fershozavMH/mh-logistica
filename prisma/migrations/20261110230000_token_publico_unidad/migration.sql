-- Link público por unidad con token aleatorio (antes era el folio consecutivo).
-- El DEFAULT es volátil, así que Postgres genera un token distinto para cada unidad existente.
-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "tokenPublico" TEXT NOT NULL DEFAULT (replace((gen_random_uuid())::text, '-'::text, ''::text) || replace((gen_random_uuid())::text, '-'::text, ''::text));

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_tokenPublico_key" ON "Shipment"("tokenPublico");

