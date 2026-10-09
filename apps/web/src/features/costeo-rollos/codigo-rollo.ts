import type { RolloPapel } from './types'

/**
 * El código visible de un rollo: `<factura>-<total de rollos>-<secuencia>`.
 *
 * Tiene que coincidir con la vista `costeo.v_rollo_codigo` del backend, que es
 * lo que viaja a los Google Sheets como NRollo. Vive acá y no repetido en cada
 * pantalla para que un cambio de formato sea un solo lugar.
 */
export function codigoRollo(r: {
  secuencia: number
  facturaPapel: { numeroFactura: string; totalRollos: number }
}): string {
  return `${r.facturaPapel.numeroFactura}-${r.facturaPapel.totalRollos}-${r.secuencia}`
}

export type RolloConCodigo = Pick<RolloPapel, 'secuencia' | 'facturaPapel'>
