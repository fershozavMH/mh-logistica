// "(EQUI-002545) - 1998 NATIONAL 600C…" → "EQUI-002545". Sourcing renombra el
// documento del equipo en el ERP, así que la llave es solo el código. Si no
// trae un código con ese formato, se usa el texto tal cual (sin espacios de más).
export function codigoEquipo(texto: string): string {
  const m = /EQUI-\d+/i.exec(texto);
  return m ? m[0].toUpperCase() : texto.trim();
}
