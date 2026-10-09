import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Catálogo GLOBAL de líneas de producto (tipos de prenda: Jersey, Short…).
 *
 * Llevaba `idCliente` hasta el 2026-10-09, heredado del legacy donde el campo
 * CLIENTE traía cliente y línea pegados. Se quitó porque son tipos de prenda y
 * no algo de un cliente: por cliente, una estadística por línea tendría que
 * agrupar por texto entre clientes.
 */
export class CrearLineaProductoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nombre!: string;
}
