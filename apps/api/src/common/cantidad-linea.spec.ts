import { separarCantidad } from './cantidad-linea';

describe('separarCantidad', () => {
  it('una orden de prendas no tiene yardas', () => {
    expect(
      separarCantidad([
        { talla: 'M', cantidad: 10 },
        { talla: 'L', cantidad: 5 },
      ]),
    ).toEqual({ piezas: 15, yardas: 0 });
  });

  it('las yardas de un servicio no se suman a las piezas', () => {
    expect(separarCantidad([{ talla: 'YARDAS', cantidad: 197 }])).toEqual({
      piezas: 0,
      yardas: 197,
    });
  });

  it('una línea sin tallas da cero en ambas', () => {
    expect(separarCantidad([])).toEqual({ piezas: 0, yardas: 0 });
  });
});
