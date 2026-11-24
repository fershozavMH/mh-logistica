"use client";

import SubmitButton from "@/components/SubmitButton";

// Formulario de "Por cotizar": captura flete e importación estimados y los
// manda al ERP (log_estimacion). Antes de enviar:
//   - valida que los montos sean números válidos y que haya al menos uno
//   - pide confirmación mostrando lo que se va a mandar (con advertencia si
//     un monto parece demasiado alto, p. ej. por escribir encima de otro)
// Mientras se envía, el botón se bloquea y muestra "Enviando al ERP…".

const MONTO_ALTO_USD = 100_000;

function leerMonto(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || v.trim() === "") return 0;
  const limpio = v.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(limpio)) return null;
  return Number(limpio);
}

const usd = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export default function FormEstimacion({
  id,
  equipo,
  fleteUSA,
  importacion,
  estimada,
  accion,
}: {
  id: string;
  equipo: string;
  fleteUSA: number | null;
  importacion: number | null;
  estimada: boolean;
  accion: (formData: FormData) => Promise<void>;
}) {
  return (
    <form
      action={accion}
      className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end"
      onSubmit={(e) => {
        const fd = new FormData(e.currentTarget);
        const flete = leerMonto(fd.get("estFleteUSA"));
        const imp = leerMonto(fd.get("estImportacion"));
        if (flete === null || imp === null) {
          e.preventDefault();
          window.alert("Revisa los montos: solo números, con hasta 2 decimales (ej. 6500 o 6,500.00).");
          return;
        }
        if (flete === 0 && imp === 0) {
          e.preventDefault();
          window.alert("Captura al menos el flete o la importación.");
          return;
        }
        const alto = flete > MONTO_ALTO_USD || imp > MONTO_ALTO_USD;
        const mensaje = [
          `${estimada ? "Actualizar" : "Enviar"} al ERP el estimado de ${equipo}:`,
          "",
          `Flete USA: ${usd(flete)}`,
          `Importación: ${usd(imp)}${imp === 0 ? " (se manda como 0)" : ""}`,
          `Total: ${usd(flete + imp)}`,
          ...(alto ? ["", `⚠ Un monto pasa de ${usd(MONTO_ALTO_USD)}. Revisa que no tenga dígitos de más.`] : []),
        ].join("\n");
        if (!window.confirm(mensaje)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-secondary">Flete USA (USD)</span>
        <input
          type="text"
          inputMode="decimal"
          name="estFleteUSA"
          defaultValue={fleteUSA ?? ""}
          placeholder="0.00"
          onFocus={(e) => e.currentTarget.select()}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-secondary">Importación (USD)</span>
        <input
          type="text"
          inputMode="decimal"
          name="estImportacion"
          defaultValue={importacion ?? ""}
          placeholder="0.00"
          onFocus={(e) => e.currentTarget.select()}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
      </label>
      <SubmitButton
        pendingText="Enviando al ERP…"
        className="rounded-lg bg-brand-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-orange-600"
      >
        {estimada ? "Actualizar y enviar" : "Enviar estimado"}
      </SubmitButton>
    </form>
  );
}
