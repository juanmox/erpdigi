import {
  colorDeMinutos,
  type CorteConfig,
  DIAS_HABILES,
  horaGT,
  motivoSemaforoInvalido,
  SEMAFORO_POR_DEFECTO,
  semaforoReposicion,
  siguienteCorte,
} from './cortes-reposicion';

/** Un instante a partir de la hora de pared de Guatemala. */
const gt = (iso: string) => new Date(`${iso}-06:00`);

const CORTES: CorteConfig[] = ['07:00', '09:00', '11:00', '14:00', '16:30'].map(
  (hora) => ({ hora, dias: DIAS_HABILES }),
);

describe('siguienteCorte', () => {
  it('asigna el primer corte posterior del mismo día', () => {
    // Martes 24/11/2026.
    expect(siguienteCorte(gt('2026-11-24T08:10:00'), CORTES)).toEqual(
      gt('2026-11-24T09:00:00'),
    );
    expect(siguienteCorte(gt('2026-11-24T12:00:00'), CORTES)).toEqual(
      gt('2026-11-24T14:00:00'),
    );
  });

  it('a la hora exacta del corte va al siguiente (es estricto)', () => {
    expect(siguienteCorte(gt('2026-11-24T09:00:00'), CORTES)).toEqual(
      gt('2026-11-24T11:00:00'),
    );
    // Un segundo antes, todavía entra en ese corte.
    expect(siguienteCorte(gt('2026-11-24T08:59:59'), CORTES)).toEqual(
      gt('2026-11-24T09:00:00'),
    );
  });

  it('lo creado después del último corte va al primero del día hábil siguiente', () => {
    expect(siguienteCorte(gt('2026-11-24T16:31:00'), CORTES)).toEqual(
      gt('2026-11-25T07:00:00'),
    );
    // Turno nocturno: madrugada del miércoles, antes de las 07:00.
    expect(siguienteCorte(gt('2026-11-25T02:30:00'), CORTES)).toEqual(
      gt('2026-11-25T07:00:00'),
    );
  });

  it('el viernes después del último corte, el sábado y el domingo van al lunes', () => {
    const lunes = gt('2026-11-30T07:00:00');
    expect(siguienteCorte(gt('2026-11-27T17:00:00'), CORTES)).toEqual(lunes);
    expect(siguienteCorte(gt('2026-11-28T10:00:00'), CORTES)).toEqual(lunes);
    expect(siguienteCorte(gt('2026-11-29T23:59:00'), CORTES)).toEqual(lunes);
  });

  it('cruza el cambio de año', () => {
    // Jueves 31/12/2026 tarde → viernes 1/1/2027.
    expect(siguienteCorte(gt('2026-12-31T17:00:00'), CORTES)).toEqual(
      gt('2027-01-01T07:00:00'),
    );
  });

  it('respeta los días de cada corte', () => {
    const conSabado: CorteConfig[] = [...CORTES, { hora: '08:00', dias: [6] }];
    expect(siguienteCorte(gt('2026-11-28T07:30:00'), conSabado)).toEqual(
      gt('2026-11-28T08:00:00'),
    );
    // El corte de las 08:00 solo es de sábado: el viernes no cuenta.
    expect(siguienteCorte(gt('2026-11-27T07:30:00'), conSabado)).toEqual(
      gt('2026-11-27T09:00:00'),
    );
  });

  it('sin cortes configurados no asigna ninguno', () => {
    expect(siguienteCorte(gt('2026-11-24T08:10:00'), [])).toBeNull();
    expect(
      siguienteCorte(gt('2026-11-24T08:10:00'), [{ hora: '09:00', dias: [] }]),
    ).toBeNull();
    // Una hora mal escrita se ignora en vez de romper.
    expect(
      siguienteCorte(gt('2026-11-24T08:10:00'), [
        { hora: '9:00', dias: DIAS_HABILES },
      ]),
    ).toBeNull();
  });

  it('no depende del orden en que vengan los cortes', () => {
    const al_reves = [...CORTES].reverse();
    expect(siguienteCorte(gt('2026-11-24T10:00:00'), al_reves)).toEqual(
      gt('2026-11-24T11:00:00'),
    );
  });
});

describe('horaGT', () => {
  it('da la hora de pared de Guatemala', () => {
    expect(horaGT(gt('2026-11-24T16:30:00'))).toBe('16:30');
    expect(horaGT(new Date('2026-11-24T13:05:00Z'))).toBe('07:05');
  });
});

describe('colorDeMinutos', () => {
  const cfg = { minutosVerde: 30, minutosAmarillo: 60, minutosRecoger: 15 };
  it('verde, amarillo y rojo por tramos, sin hueco entre ellos', () => {
    expect(colorDeMinutos(0, cfg)).toBe('verde');
    expect(colorDeMinutos(29, cfg)).toBe('verde');
    expect(colorDeMinutos(30, cfg)).toBe('amarillo');
    expect(colorDeMinutos(59, cfg)).toBe('amarillo');
    expect(colorDeMinutos(60, cfg)).toBe('rojo');
    expect(colorDeMinutos(500, cfg)).toBe('rojo');
  });
});

describe('semaforoReposicion', () => {
  const cfg = SEMAFORO_POR_DEFECTO; // verde < 45, amarillo < 60, recoger 15
  const corteEn = gt('2026-11-24T09:00:00');
  const base = {
    corteEn,
    listaEn: null,
    despachadaEn: null,
    estado: 'EN_VALIDACION',
    anulada: false,
  };

  it('antes del corte es recolección y no tiene color: esperar es lo esperado', () => {
    const s = semaforoReposicion(base, cfg, gt('2026-11-24T08:35:00'))!;
    expect(s.fase).toBe('RECOLECCION');
    expect(s.faltanMin).toBe(25);
    expect(s.color).toBe('neutro');
    expect(s.procesoMin).toBeNull();
  });

  it('desde el corte corre el proceso y cambia de color por minutos', () => {
    const en = (hhmm: string) =>
      semaforoReposicion(base, cfg, gt(`2026-11-24T${hhmm}:00`))!;
    expect(en('09:00')).toMatchObject({
      fase: 'PROCESO',
      procesoMin: 0,
      color: 'verde',
    });
    expect(en('09:44').color).toBe('verde');
    expect(en('09:45').color).toBe('amarillo');
    expect(en('09:59').color).toBe('amarillo');
    expect(en('10:00')).toMatchObject({ procesoMin: 60, color: 'rojo' });
  });

  it('si bodega marca lista, el proceso se congela en lo que tardó', () => {
    const s = semaforoReposicion(
      { ...base, estado: 'POR_RECOGER', listaEn: gt('2026-11-24T09:38:00') },
      cfg,
      gt('2026-11-24T13:00:00'),
    )!;
    expect(s.procesoCerrado).toBe(true);
    expect(s.procesoMin).toBe(38);
    expect(s.procesoColor).toBe('verde');
  });

  it('la espera de quien debe recoger es aparte y roja pasada la tolerancia', () => {
    const lista = gt('2026-11-24T09:38:00');
    const dentro = semaforoReposicion(
      { ...base, estado: 'POR_RECOGER', listaEn: lista },
      cfg,
      gt('2026-11-24T09:50:00'),
    )!;
    expect(dentro).toMatchObject({
      fase: 'POR_RECOGER',
      esperaMin: 12,
      esperaColor: 'verde',
    });
    const pasada = semaforoReposicion(
      { ...base, estado: 'POR_RECOGER', listaEn: lista },
      cfg,
      gt('2026-11-24T10:00:00'),
    )!;
    expect(pasada).toMatchObject({
      esperaMin: 22,
      esperaColor: 'rojo',
      color: 'rojo',
    });
    // El proceso de bodega sigue en verde: la demora es del solicitante.
    expect(pasada.procesoColor).toBe('verde');
  });

  it('entregada: queda el cumplimiento del corte y lo que tardó el solicitante', () => {
    const s = semaforoReposicion(
      {
        ...base,
        estado: 'DESPACHADA',
        listaEn: gt('2026-11-24T10:10:00'),
        despachadaEn: gt('2026-11-24T10:20:00'),
      },
      cfg,
      gt('2026-11-24T18:00:00'),
    )!;
    expect(s.fase).toBe('ENTREGADA');
    expect(s.procesoMin).toBe(70);
    expect(s.color).toBe('rojo'); // bodega pasó de 60 min
    expect(s.esperaMin).toBe(10);
    expect(s.esperaColor).toBe('verde');
  });

  it('lista antes de la hora del corte cuenta 0 minutos y es verde', () => {
    const s = semaforoReposicion(
      { ...base, estado: 'POR_RECOGER', listaEn: gt('2026-11-24T08:50:00') },
      cfg,
      gt('2026-11-24T08:55:00'),
    )!;
    expect(s.procesoMin).toBe(0);
    expect(s.procesoColor).toBe('verde');
  });

  it('no hay semáforo para anuladas, históricas ni sin corte', () => {
    const ahora = gt('2026-11-24T10:00:00');
    expect(
      semaforoReposicion({ ...base, anulada: true }, cfg, ahora),
    ).toBeNull();
    expect(
      semaforoReposicion({ ...base, estado: 'HISTORICA' }, cfg, ahora),
    ).toBeNull();
    expect(
      semaforoReposicion({ ...base, corteEn: null }, cfg, ahora),
    ).toBeNull();
  });

  it('usa los minutos que se le configuren', () => {
    // El ejemplo del usuario: verde 30, amarillo hasta 60.
    const c = { minutosVerde: 30, minutosAmarillo: 60, minutosRecoger: 15 };
    expect(semaforoReposicion(base, c, gt('2026-11-24T09:29:00'))!.color).toBe(
      'verde',
    );
    expect(semaforoReposicion(base, c, gt('2026-11-24T09:30:00'))!.color).toBe(
      'amarillo',
    );
    expect(semaforoReposicion(base, c, gt('2026-11-24T10:00:00'))!.color).toBe(
      'rojo',
    );
  });
});

describe('motivoSemaforoInvalido', () => {
  it('acepta un juego coherente', () => {
    expect(
      motivoSemaforoInvalido({
        minutosVerde: 30,
        minutosAmarillo: 60,
        minutosRecoger: 15,
      }),
    ).toBeNull();
  });
  it('rechaza límites desordenados, fuera de rango o con decimales', () => {
    const mal = (v: number, a: number, r: number) =>
      motivoSemaforoInvalido({
        minutosVerde: v,
        minutosAmarillo: a,
        minutosRecoger: r,
      });
    expect(mal(60, 60, 15)).not.toBeNull();
    expect(mal(60, 30, 15)).not.toBeNull();
    expect(mal(0, 30, 15)).not.toBeNull();
    expect(mal(30, 2000, 15)).not.toBeNull();
    expect(mal(30, 60, 0)).not.toBeNull();
    expect(mal(30.5, 60, 15)).not.toBeNull();
  });
});
