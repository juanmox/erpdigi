import { textoClienteSheets } from './cliente-sheets';

describe('textoClienteSheets', () => {
  it('sin subcliente usa el cliente y agrega el deporte', () => {
    expect(textoClienteSheets('BSN SPORTS', [{ deporte: 'Basketball' }])).toBe(
      'BSN SPORTS - Basketball',
    );
  });

  it('con subcliente usa el subcliente en lugar del cliente', () => {
    expect(
      textoClienteSheets('BSN SPORTS', [
        { subcliente: 'Under Armour', deporte: 'Lacrosse' },
      ]),
    ).toBe('Under Armour - Lacrosse');
  });

  it('sin deporte deja solo el subcliente o cliente', () => {
    expect(
      textoClienteSheets('BSN SPORTS', [{ deporte: '' }, { deporte: null }]),
    ).toBe('BSN SPORTS');
  });

  it('una OP mixta une los valores distintos, ordenados, sin repetir', () => {
    expect(
      textoClienteSheets('BSN SPORTS', [
        { deporte: 'Volleyball' },
        { deporte: 'Basketball' },
        { deporte: 'Basketball' },
      ]),
    ).toBe('BSN SPORTS - Basketball/Volleyball');
  });

  it('mezcla de productos con y sin subcliente', () => {
    expect(
      textoClienteSheets('BSN SPORTS', [
        { subcliente: 'Under Armour', deporte: 'Lacrosse' },
        { deporte: 'Lacrosse' },
      ]),
    ).toBe('BSN SPORTS/Under Armour - Lacrosse');
  });

  it('sin productos (OP sin ítems) deja solo el cliente', () => {
    expect(textoClienteSheets('BSN SPORTS', [])).toBe('BSN SPORTS');
  });

  it('sin cliente ni nada devuelve vacío, no "undefined"', () => {
    expect(textoClienteSheets(null, [])).toBe('');
  });
});
