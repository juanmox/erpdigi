import { enguiamientoYd, TALLA_YARDAS, yardasQueCaben } from './enguiamiento';

describe('enguiamientoYd', () => {
  it('en prendas es cantidad × factor de la línea', () => {
    expect(enguiamientoYd('M', 10, 0.084375)).toBe(0.8438);
    expect(enguiamientoYd('XL', 8, 0.1)).toBe(0.8);
  });

  it('en yardas es el 3 % hacia arriba, con mínimo de 1 yd', () => {
    // Casos del mensaje del usuario (197, 1000 y 3 yd) y los bordes de la regla.
    expect(enguiamientoYd(TALLA_YARDAS, 197, 0.084375)).toBe(6);
    expect(enguiamientoYd(TALLA_YARDAS, 1000, 0.084375)).toBe(30);
    expect(enguiamientoYd(TALLA_YARDAS, 3, 0.084375)).toBe(1);
    expect(enguiamientoYd(TALLA_YARDAS, 2, 0.084375)).toBe(1);
    expect(enguiamientoYd(TALLA_YARDAS, 50, 0.084375)).toBe(2);
  });

  it('un múltiplo exacto no sube una yarda por punto flotante', () => {
    // 100 × 0.03 = 3.0000000000000004 en coma flotante.
    expect(enguiamientoYd(TALLA_YARDAS, 100, 0.084375)).toBe(3);
    expect(enguiamientoYd(TALLA_YARDAS, 200, 0.084375)).toBe(6);
  });

  it('ignora el factor de la línea cuando la talla es YARDAS', () => {
    expect(enguiamientoYd(TALLA_YARDAS, 197, 0.5)).toBe(6);
  });
});

describe('yardasQueCaben', () => {
  it('descuenta el enguiamiento de la tanda del saldo del rollo', () => {
    // 1,158 + ceil(3 %) = 1,158 + 35 = 1,193; con 1,159 ya serían 1,194.
    expect(yardasQueCaben(1193)).toBe(1158);
    expect(yardasQueCaben(1100)).toBe(1067); // 1,067 + 33 = 1,100; con 1,068 ya serían 1,101
  });

  it('lo que propone siempre cabe y una yarda más ya no', () => {
    for (const r of [2, 3, 10, 34, 35, 100, 500, 1000, 1193, 1208]) {
      const x = yardasQueCaben(r);
      const gasto = (n: number) => n + enguiamientoYd(TALLA_YARDAS, n, 0);
      if (x > 0) expect(gasto(x)).toBeLessThanOrEqual(r);
      expect(gasto(x + 1)).toBeGreaterThan(r);
    }
  });

  it('un rollo sin saldo no admite nada', () => {
    expect(yardasQueCaben(0)).toBe(0);
    expect(yardasQueCaben(-300)).toBe(0);
    expect(yardasQueCaben(1)).toBe(0);
  });
});
