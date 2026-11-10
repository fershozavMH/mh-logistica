"use client";

// Lista que se desplaza sola en bucle (la usa /reportes/pantalla). Dibuja el
// contenido DOS veces seguidas y se anima con translateY de 0% a -50%; como
// la segunda copia es idéntica, el regreso al inicio no se nota.
//
// La copia se hace AQUÍ, en el navegador: así el servidor manda las filas una
// sola vez (la mitad de datos en cada refresco de la TV) en lugar de armar
// cada fila dos veces.
export default function ScrollInfinito({
  children,
  duracionSegundos,
}: {
  children: React.ReactNode;
  duracionSegundos: number;
}) {
  return (
    <div className="mh-scroll-list" style={{ animationDuration: `${duracionSegundos}s` }}>
      <div>{children}</div>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}
