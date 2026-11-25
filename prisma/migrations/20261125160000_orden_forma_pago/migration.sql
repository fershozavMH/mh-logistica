-- Forma de pago de la orden: Transferencia (todas las existentes) o Efectivo.
ALTER TABLE "PaymentOrder" ADD COLUMN "formaPago" TEXT NOT NULL DEFAULT 'Transferencia';
