/**
 * Cortes de requisiciones y semáforo de las reposiciones (2026-11-25).
 *
 * La planta trabaja por CORTES (07:00, 09:00, 11:00, 14:00, 16:30 de lunes a
 * viernes): lo que se crea entre un corte y el siguiente se recopila, se valida
 * durante esa recolección y a la hora del corte se autoriza, se imprime y bodega lo
 * deja listo. Lo creado después del último corte —incluido el turno nocturno— va al
 * primero del siguiente día hábil.
 *
 * El semáforo mide el PROCESO DEL CORTE: de la hora del corte a que bodega marca
 * "lista". Medir desde la creación castigaría a todos por esperar el corte, que es
 * lo esperado; medir "desde el último paso" no dice nada con cortes cada dos horas.
 *
 * Hora de Guatemala = UTC-6 fijo y sin horario de verano (ver `dia-guatemala.ts`).
 * La regla de asignación existe también en SQL, en la migración
 * 20261125120000_reposicion_cortes_semaforo (para rellenar lo ya creado): las dos
 * tienen que decir lo mismo.
 */

const MS_MINUTO = 60_000;
const OFFSET_GT_MS = 6 * 3_600_000;

export interface CorteConfig {
  /** `HH:MM`, hora de Guatemala. */
  hora: string;
  /** ISO: 1 = lunes … 7 = domingo. */
  dias: number[];
}

export interface SemaforoConfig {
  /** Verde mientras el proceso lleve MENOS de estos minutos. */
  minutosVerde: number;
  /** Amarillo hasta estos minutos; de ahí en adelante, rojo. */
  minutosAmarillo: number;
  /** Tolerancia: minutos que el solicitante tiene para recoger lo que bodega dejó listo. */
  minutosRecoger: number;
}

export const SEMAFORO_POR_DEFECTO: SemaforoConfig = {
  minutosVerde: 45,
  minutosAmarillo: 60,
  minutosRecoger: 15,
};

export const DIAS_HABILES: number[] = [1, 2, 3, 4, 5];

const HORA_VALIDA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
export const esHoraDeCorte = (hora: string) => HORA_VALIDA.test(hora);

/** Día ISO (1 = lunes … 7 = domingo) de un día ya expresado en campos UTC. */
const isoDia = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1;

/**
 * Primer corte POSTERIOR a `instante` (estrictamente: a las 09:00:00 en punto va al
 * de las 11:00) en un día que ese corte atienda. `null` si no hay ninguno.
 */
export function siguienteCorte(
  instante: Date,
  cortes: CorteConfig[],
): Date | null {
  const validos = cortes.filter((c) => esHoraDeCorte(c.hora) && c.dias.length);
  if (validos.length === 0) return null;
  // El "reloj de pared" de Guatemala, leído con los getters UTC.
  const local = new Date(instante.getTime() - OFFSET_GT_MS);
  let mejor: Date | null = null;
  // Una semana completa más hoy: alcanza para cualquier combinación de días.
  for (let n = 0; n <= 8; n++) {
    const dia = new Date(
      Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate() + n,
      ),
    );
    const iso = isoDia(dia);
    for (const c of validos) {
      if (!c.dias.includes(iso)) continue;
      const [hh, mm] = c.hora.split(':').map(Number);
      const candidato = new Date(
        Date.UTC(
          dia.getUTCFullYear(),
          dia.getUTCMonth(),
          dia.getUTCDate(),
          hh,
          mm,
        ) + OFFSET_GT_MS,
      );
      if (candidato.getTime() > instante.getTime())
        if (!mejor || candidato.getTime() < mejor.getTime()) mejor = candidato;
    }
    // Ya hay uno hoy o un día antes del que sigue: más adelante solo hay más tarde.
    if (mejor) break;
  }
  return mejor;
}

/** `HH:MM` en hora de Guatemala. */
export function horaGT(instante: Date): string {
  const l = new Date(instante.getTime() - OFFSET_GT_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(l.getUTCHours())}:${p(l.getUTCMinutes())}`;
}

export type ColorSemaforo = 'verde' | 'amarillo' | 'rojo' | 'neutro';

/** Verde por debajo del primer límite, amarillo por debajo del segundo, rojo desde ahí. */
export function colorDeMinutos(
  minutos: number,
  cfg: SemaforoConfig,
): Exclude<ColorSemaforo, 'neutro'> {
  if (minutos < cfg.minutosVerde) return 'verde';
  if (minutos < cfg.minutosAmarillo) return 'amarillo';
  return 'rojo';
}

export interface EntradaSemaforo {
  corteEn: Date | null;
  /** Bodega dejó lista la requisición y avisó. */
  listaEn: Date | null;
  /** El solicitante recogió. */
  despachadaEn: Date | null;
  estado: string;
  anulada: boolean;
}

export type FaseSemaforo =
  'RECOLECCION' | 'PROCESO' | 'POR_RECOGER' | 'ENTREGADA';

export interface SemaforoReposicion {
  corteEn: string;
  fase: FaseSemaforo;
  /** Minutos que faltan para el corte (solo en RECOLECCION). */
  faltanMin: number | null;
  /** Minutos del corte a "lista" (o hasta ahora, si todavía corre). */
  procesoMin: number | null;
  procesoColor: ColorSemaforo | null;
  /** El reloj del proceso ya se detuvo (bodega marcó "lista"). */
  procesoCerrado: boolean;
  /** Minutos de "lista" a "entregada" (o hasta ahora): le toca al solicitante. */
  esperaMin: number | null;
  esperaColor: ColorSemaforo | null;
  /** El color que resume la fila hoy. */
  color: ColorSemaforo;
}

const minutosEntre = (desde: Date, hasta: Date) =>
  Math.max(0, Math.floor((hasta.getTime() - desde.getTime()) / MS_MINUTO));

/**
 * El semáforo de una reposición. `null` si no corresponde: anulada, histórica
 * (anterior al flujo o registrada sin validaciones) o sin corte asignado.
 */
export function semaforoReposicion(
  e: EntradaSemaforo,
  cfg: SemaforoConfig,
  ahora: Date,
): SemaforoReposicion | null {
  if (e.anulada || e.estado === 'HISTORICA' || !e.corteEn) return null;
  const corteEn = e.corteEn;
  const base = { corteEn: corteEn.toISOString() };

  if (e.listaEn) {
    // El reloj de bodega ya se detuvo: se congela en lo que tardó.
    const procesoMin = minutosEntre(corteEn, e.listaEn);
    const procesoColor = colorDeMinutos(procesoMin, cfg);
    const fin = e.despachadaEn ?? ahora;
    const esperaMin = minutosEntre(e.listaEn, fin);
    // Pasada la tolerancia, la demora ya no es de bodega: es de quien no recoge.
    const esperaColor: ColorSemaforo =
      esperaMin > cfg.minutosRecoger ? 'rojo' : 'verde';
    return {
      ...base,
      fase: e.despachadaEn ? 'ENTREGADA' : 'POR_RECOGER',
      faltanMin: null,
      procesoMin,
      procesoColor,
      procesoCerrado: true,
      esperaMin,
      esperaColor,
      color: e.despachadaEn ? procesoColor : esperaColor,
    };
  }

  if (ahora.getTime() < corteEn.getTime())
    return {
      ...base,
      fase: 'RECOLECCION',
      faltanMin: Math.ceil((corteEn.getTime() - ahora.getTime()) / MS_MINUTO),
      procesoMin: null,
      procesoColor: null,
      procesoCerrado: false,
      esperaMin: null,
      esperaColor: null,
      color: 'neutro',
    };

  const procesoMin = minutosEntre(corteEn, ahora);
  const procesoColor = colorDeMinutos(procesoMin, cfg);
  return {
    ...base,
    fase: 'PROCESO',
    faltanMin: null,
    procesoMin,
    procesoColor,
    procesoCerrado: false,
    esperaMin: null,
    esperaColor: null,
    color: procesoColor,
  };
}

/** Valida el juego de minutos del semáforo; devuelve el motivo o `null`. */
export function motivoSemaforoInvalido(c: SemaforoConfig): string | null {
  const { minutosVerde: v, minutosAmarillo: a, minutosRecoger: r } = c;
  if (![v, a, r].every((n) => Number.isInteger(n)))
    return 'Los minutos tienen que ser números enteros.';
  if (v <= 0) return 'El verde tiene que durar al menos 1 minuto.';
  if (v >= a)
    return 'El límite del verde tiene que ser menor que el del amarillo.';
  if (a > 1440) return 'El amarillo no puede pasar de 1,440 minutos (24 h).';
  if (r < 1 || r > 1440)
    return 'La tolerancia para recoger va entre 1 y 1,440 minutos.';
  return null;
}
