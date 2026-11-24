-- Sourcing renombra los equipos en el ERP; la llave de la solicitud pasa a ser
-- solo el código EQUI-###### y el nombre completo se guarda aparte.
ALTER TABLE "SolicitudEstimacion" ADD COLUMN "erpEquipoNombre" TEXT;

UPDATE "SolicitudEstimacion" SET "erpEquipoNombre" = "erpEquipoId";

-- Normaliza las existentes al código, solo si no choca con otra solicitud.
UPDATE "SolicitudEstimacion" s
SET "erpEquipoId" = upper(substring(s."erpEquipoId" from '(?i)EQUI-[0-9]+'))
WHERE s."erpEquipoId" ~* 'EQUI-[0-9]+'
  AND s."erpEquipoId" <> upper(substring(s."erpEquipoId" from '(?i)EQUI-[0-9]+'))
  AND NOT EXISTS (
    SELECT 1 FROM "SolicitudEstimacion" o
    WHERE o.id <> s.id
      AND upper(substring(o."erpEquipoId" from '(?i)EQUI-[0-9]+')) = upper(substring(s."erpEquipoId" from '(?i)EQUI-[0-9]+'))
  );
