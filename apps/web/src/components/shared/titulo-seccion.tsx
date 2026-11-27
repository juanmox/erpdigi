/**
 * Título de una sección dentro de una página larga (p. ej. "Resumen por orden",
 * "Detalle de impresión" en Reportes de Costeo).
 *
 * Antes era un `h2` de texto gris-oscuro sobre fondo claro: entre tablas largas no
 * se distinguía dónde terminaba una sección y empezaba otra. Lleva la misma
 * señal que `FilaCategoria` — tinte y filo del azul de marca — para que la
 * interfaz hable un solo idioma visual.
 */
export function TituloSeccion({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex flex-wrap items-baseline gap-x-2 rounded-md border-l-4 border-l-accent-brand bg-accent-brand-soft px-3 py-2 text-[15px] font-bold text-accent-brand-strong">
      {children}
    </h2>
  )
}
