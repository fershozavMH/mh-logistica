"use server";

import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth-server";
import { llamarERP, ErpError } from "@/lib/erp-client";
import { registrarAuditoria } from "@/lib/audit";
import { sincronizarProveedores } from "@/lib/erp";

// Prueba de conexión con el ERP (solo administrador). Llama un método de
// Frappe que no cambia nada: pregunta con qué usuario entró. No muestra ni
// guarda llaves; solo el usuario que contesta el ERP o el mensaje de error.
export async function probarConexionERP() {
  const sesion = await getSesion();
  if (!sesion || sesion.rol !== "total") redirect("/");

  const inicio = Date.now();
  let destino: string;
  try {
    const usuario = await llamarERP<string>({
      metodo: "GET",
      endpoint: "frappe.auth.get_logged_user",
      reintentos: 0,
      timeoutMs: 8000,
      referencia: "prueba-conexion",
    });
    const ms = Date.now() - inicio;
    destino = `/integracion?r=ok&u=${encodeURIComponent(String(usuario).slice(0, 80))}&ms=${ms}`;
  } catch (err) {
    const msg = err instanceof ErpError ? err.message : "Error inesperado";
    const status = err instanceof ErpError && err.status ? `&s=${err.status}` : "";
    destino = `/integracion?r=error&m=${encodeURIComponent(msg.slice(0, 300))}${status}`;
  }
  await registrarAuditoria({
    accion: "erp.prueba_conexion",
    entidad: "ERP",
    usuario: sesion.nombre,
    detalle: destino.includes("r=ok") ? "ok" : "error",
  });
  redirect(destino);
}

// Fuerza la descarga completa del catálogo de proveedores y dice cuántos
// llegaron (solo administrador). Sirve para saber si el ERP manda proveedores.
export async function sincronizarProveedoresAhora() {
  const sesion = await getSesion();
  if (!sesion || sesion.rol !== "total") redirect("/");
  const r = await sincronizarProveedores({ forzar: true });
  await registrarAuditoria({
    accion: "erp.sincronizar_proveedores_manual",
    entidad: "ERP",
    usuario: sesion.nombre,
    detalle: r.ok ? `${r.actualizados ?? 0} proveedores recibidos` : (r.error ?? "error").slice(0, 300),
  });
  redirect(
    r.ok
      ? `/integracion?p=ok&n=${r.actualizados ?? 0}`
      : `/integracion?p=error&m=${encodeURIComponent((r.error ?? "Error").slice(0, 300))}`
  );
}
