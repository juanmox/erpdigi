import { comentarioParaSheets, resumirPrendas } from './prendas-texto';

const prendas = [
  { producto: 'BSN-FB01N', talla: 'M', pieza: 'MANGA IZQ', cantidad: 1 },
  { producto: 'BSN-FB01N', talla: 'XL', pieza: 'CUELLO V', cantidad: 2 },
  { producto: 'UA-FB02MJ', talla: 'L', pieza: 'PRENDA COMPLETA', cantidad: 3 },
];

describe('resumirPrendas', () => {
  it('agrupa por producto y lleva la pieza de cada talla', () => {
    expect(resumirPrendas(prendas)).toBe(
      'BSN-FB01N M×1 MANGA IZQ, XL×2 CUELLO V · UA-FB02MJ L×3 PRENDA COMPLETA',
    );
  });

  it('sin pieza deja solo talla y cantidad', () => {
    expect(
      resumirPrendas([{ producto: 'A', talla: 'M', cantidad: 4 }]),
    ).toBe('A M×4');
  });
});

describe('comentarioParaSheets', () => {
  it('comentario y piezas van juntos, separados por " | "', () => {
    expect(comentarioParaSheets('Se rompió', prendas.slice(0, 1))).toBe(
      'Se rompió | Piezas: BSN-FB01N M×1 MANGA IZQ',
    );
  });

  it('sin comentario va solo "Piezas: …"', () => {
    expect(comentarioParaSheets('  ', prendas.slice(0, 1))).toBe(
      'Piezas: BSN-FB01N M×1 MANGA IZQ',
    );
    expect(comentarioParaSheets(null, prendas.slice(0, 1))).toBe(
      'Piezas: BSN-FB01N M×1 MANGA IZQ',
    );
  });

  it('sin prendas va solo el comentario (órdenes migradas del legacy)', () => {
    expect(comentarioParaSheets('Solo tela', [])).toBe('Solo tela');
  });

  it('sin nada devuelve vacío', () => {
    expect(comentarioParaSheets(undefined, [])).toBe('');
  });
});
