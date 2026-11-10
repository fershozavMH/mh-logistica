-- Miniatura de la foto de cada unidad, guardada para no recalcularla en cada petición.
-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "fotoThumb" TEXT;

