import { enguiamientoYd, TALLA_YARDAS } from './enguiamiento';

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
