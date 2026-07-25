const formatterGTQ = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: 'GTQ',
})

const formatterUSD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

export function formatGTQ(monto: number): string {
  return formatterGTQ.format(monto)
}

export function formatUSD(monto: number): string {
  return formatterUSD.format(monto)
}

export type CodigoMoneda = 'GTQ' | 'USD'

/** Costos son nativos en GTQ; esto los convierte para PRESENTACIÓN según la moneda activa. */
export function convertirMonto(gtq: number, moneda: CodigoMoneda, tasa: number | null): number {
  if (moneda === 'USD') return tasa ? gtq / tasa : gtq
  return gtq
}

/** El precio de venta es nativo en USD (al revés que los costos) — esto lo convierte para PRESENTACIÓN. */
export function convertirPrecioVenta(usd: number, moneda: CodigoMoneda, tasa: number | null): number {
  if (moneda === 'GTQ') return tasa ? usd * tasa : usd
  return usd
}

export function simboloMoneda(moneda: CodigoMoneda): string {
  return moneda === 'USD' ? '$' : 'Q'
}

export function formatMonto(gtq: number, moneda: CodigoMoneda, tasa: number | null, decimales = 2): string {
  const valor = convertirMonto(gtq, moneda, tasa)
  return `${simboloMoneda(moneda)} ${valor.toLocaleString('es-GT', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })}`
}

/** Igual que formatMonto pero para valores nativos en USD (ej. precio_venta). */
export function formatPrecioVenta(usd: number, moneda: CodigoMoneda, tasa: number | null, decimales = 2): string {
  const valor = convertirPrecioVenta(usd, moneda, tasa)
  return `${simboloMoneda(moneda)} ${valor.toLocaleString('es-GT', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })}`
}

/** % costo y % margen SIEMPRE comparados en USD, sin importar la moneda activa de la UI. */
export function porcentajesCostoMargen(
  costoGtq: number,
  precioVentaUsd: number,
  tasa: number | null,
): { pctCosto: number; pctMargen: number } | null {
  const costoUsd = tasa ? costoGtq / tasa : costoGtq
  if (!(precioVentaUsd > 0)) return null
  const pctCosto = (costoUsd / precioVentaUsd) * 100
  return { pctCosto, pctMargen: 100 - pctCosto }
}

export function textoPctCostoMargen(costoGtq: number, precioVentaUsd: number, tasa: number | null): string {
  const p = porcentajesCostoMargen(costoGtq, precioVentaUsd, tasa)
  if (!p) return ''
  const fmt = (n: number) => n.toLocaleString('es-GT', { maximumFractionDigits: 1 })
  return `Costo ${fmt(p.pctCosto)}% · Margen ${fmt(p.pctMargen)}%`
}

export function formatearHoras(minutosTotales: number): string {
  const total = Math.round(minutosTotales)
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}:${String(m).padStart(2, '0')} h`
}
