import { CosteoReposicionesService } from './costeo-reposiciones.service';

/**
 * La fila que el espejo manda a los Google Sheets legacy. Lo que importa acá es
 * la columna P ("Comentario") de "Registro": el comentario del ERP y las piezas
 * repuestas. "Datos" no lleva comentario.
 */
function armar(comentario: string | null, conPrendas: boolean) {
  const filas: Record<string, unknown[]> = {};
  const sheets = {
    agregarFila: (_id: string, hoja: string, fila: unknown[]) => {
      filas[hoja] = fila;
      return Promise.resolve();
    },
  };
  const prisma = {
    ordenProduccion: {
      findUnique: () =>
        Promise.resolve({
          cliente: { nombre: 'BSN SPORTS' },
          lineasProduccion: [],
        }),
    },
  };
  const servicio = new CosteoReposicionesService(
    prisma as never,
    {} as never,
    sheets as never,
  );
  const detalle = {
    fecha: new Date('2026-10-27T15:00:00Z'),
    idOrdenProduccion: 1,
    ordenProduccion: { codigo: '26OP000001' },
    codigoRepo: '26OP000001R01',
    departamento: { nombre: 'CORTE' },
    empleado: null,
    defecto: { nombre: 'MANCHA' },
    bodegaSac: null,
    yardasPapel: '2',
    yardasTela: '0',
    tipoPapel: { nombre: 'TEXTPRINT' },
    insumoTela: null,
    impresora: { codigo: 'MS 1' },
    calandra: null,
    comentario,
    prendas: conPrendas
      ? [
          {
            producto: { codigo: 'BSN-FB01N' },
            talla: { nombre: 'L' },
            pieza: { nombre: 'MANGA DER' },
            cantidad: 3,
          },
          {
            producto: { codigo: 'BSN-FB01N' },
            talla: { nombre: 'XL' },
            pieza: { nombre: 'CUELLO V' },
            cantidad: 1,
          },
        ]
      : [],
  };
  return {
    filas,
    correr: () =>
      (
        servicio as unknown as {
          espejarEnGoogleSheets: (d: unknown, n: string) => Promise<void>;
        }
      ).espejarEnGoogleSheets(detalle, '777-10-3'),
  };
}

describe('espejo de reposiciones a Google Sheets: columna Comentario', () => {
  it('comentario del ERP + piezas, en "Registro" (col. P)', async () => {
    const t = armar('Se rompió en el calandrado', true);
    await t.correr();
    expect(t.filas['Registro']).toHaveLength(16);
    expect(t.filas['Registro'][15]).toBe(
      'Se rompió en el calandrado | Piezas: BSN-FB01N L×3 MANGA DER, XL×1 CUELLO V',
    );
  });

  it('sin comentario manda solo las piezas', async () => {
    const t = armar(null, true);
    await t.correr();
    expect(t.filas['Registro'][15]).toBe(
      'Piezas: BSN-FB01N L×3 MANGA DER, XL×1 CUELLO V',
    );
  });

  it('sin prendas (OP migrada) manda solo el comentario, como antes', async () => {
    const t = armar('Solo comentario', false);
    await t.correr();
    expect(t.filas['Registro'][15]).toBe('Solo comentario');
  });

  it('"Datos" mantiene sus 15 columnas, sin comentario ni piezas', async () => {
    const t = armar('algo', true);
    await t.correr();
    expect(t.filas['Datos']).toHaveLength(15);
    expect(t.filas['Datos'].join('|')).not.toContain('Piezas');
  });
});
