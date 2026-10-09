/**
 * Traduce un registro de `core.auditoria` a una frase que entienda cualquiera.
 *
 * Pedido textual del usuario (2026-10-07), tras ver la consulta SQL cruda:
 * *"solo las personas técnicas lo entenderían"*. La forma que quiere es
 * *"el usuario kevin editó una orden en la fecha dd/mm/yyyy HH:mm desde la pc
 * con IP xx.xx.xx.xx"*.
 *
 * ⚠️ `id_entidad` NO es uniformemente la clave de `entidad`. Medido sobre las
 * 45 llamadas a `registrar()` el 2026-10-09:
 *   - `costeo.rollo_papel` guarda el id de la FACTURA, no del rollo
 *   - `costeo.consumo_papel` guarda a veces el consumo y a veces la línea
 *   - `consumo_estandar` y `linea_produccion` guardan el literal `'import'`
 *   - `insumos`/`productos`/`desarrollos` a veces guardan una lista de CÓDIGOS
 *   - `usuario_empresa_rol` a veces guarda `idUsuario-idEmpresa-idRol`
 * Por eso nada acá asume que el id resuelva: si no resuelve, se muestra como
 * viene. La alternativa —inventar un código— sería peor que un número.
 */

/** Cómo se nombra cada entidad en la frase. */
interface Etiqueta {
  /** "una orden de producción", "un rollo"… ya con artículo. */
  singular: string;
  /** Verbo propio para CREATE, si "creó" suena raro. */
  verboCrear?: string;
  /** Verbo propio para UPDATE. */
  verboEditar?: string;
}

/**
 * Acepta el nombre con y sin schema: el código escribe `roles` en un lado y
 * `core.roles` en otro, y ambos existen en los datos históricos.
 */
const ETIQUETAS: Record<string, Etiqueta> = {
  'costeo.orden_produccion': { singular: 'una orden de producción' },
  'costeo.linea_produccion': { singular: 'un ítem de una orden' },
  'costeo.consumo_papel': {
    singular: 'un consumo de papel',
    verboCrear: 'registró',
  },
  'costeo.montaje_rollo': {
    singular: 'un montaje de rollo',
    verboCrear: 'montó',
    verboEditar: 'desmontó',
  },
  'costeo.rollo_papel': { singular: 'rollos de papel' },
  'costeo.factura_papel': {
    singular: 'una factura de papel',
    verboCrear: 'ingresó',
  },
  'costeo.reposicion': { singular: 'una reposición', verboCrear: 'registró' },
  'costeo.consumo_estandar': { singular: 'un consumo estándar' },
  'costeo.linea_producto': { singular: 'una línea de producto' },
  usuarios: { singular: 'un usuario' },
  'core.usuarios': { singular: 'un usuario' },
  usuario_empresa_rol: {
    singular: 'un rol de usuario',
    verboCrear: 'asignó',
    verboEditar: 'cambió',
  },
  roles: { singular: 'un rol' },
  'core.roles': { singular: 'un rol' },
  empresas: { singular: 'una empresa' },
  'core.empresas': { singular: 'una empresa' },
  productos: { singular: 'un producto' },
  'recetas.productos': { singular: 'un producto' },
  insumos: { singular: 'un insumo' },
  'recetas.insumos': { singular: 'un insumo' },
  desarrollos: { singular: 'un desarrollo' },
  'recetas.desarrollos': { singular: 'un desarrollo' },
  desarrollo_insumos: { singular: 'una línea de receta' },
  producto_insumos: { singular: 'una línea de receta' },
};

const VERBOS: Record<string, string> = {
  CREATE: 'creó',
  UPDATE: 'modificó',
  DELETE: 'eliminó',
  LOGIN: 'inició sesión',
};

/** Nombre legible de un estado de rollo, para no mostrar el ENUM crudo. */
const ESTADO_ROLLO: Record<string, string> = {
  EN_BODEGA: 'regresó a bodega',
  AGOTADO: 'quedó agotado',
  DESCARTADO: 'se descartó',
  CONSUMIDO_FUERA: 'fuera de circulación',
  MONTADO: 'montado',
};

type Json = Record<string, unknown> | null | undefined;

const num = (v: unknown) => (typeof v === 'number' ? v : null);
const txt = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** `null` → "sin definir", para que un cambio a null se lea. */
function valor(v: unknown): string {
  if (v === null || v === undefined) return 'sin definir';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  if (Array.isArray(v)) return v.length ? `${v.length} ítem(s)` : 'ninguno';
  if (typeof v === 'object') return 'varios campos';
  // Tras las guardas de arriba solo quedan primitivos; el `switch` lo hace
  // explícito para que no dependa de que TypeScript estreche un `unknown`.
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint'
    ? String(v)
    : 'sin valor';
}

export interface EntradaNarrada {
  /** La acción en palabras: "montó un rollo en la MS 3". */
  texto: string;
  /** Lo que cambió, ya traducido. Null si no hay nada que contar. */
  detalle: string | null;
}

/**
 * Códigos legibles ya resueltos por el servicio, para no hacer una consulta
 * por fila. La clave es `<entidad>:<idEntidad>`.
 */
export type CodigosResueltos = Map<string, string>;

export function narrar(
  reg: {
    entidad: string;
    accion: string;
    idEntidad: string;
    datosAnteriores: Json;
    datosNuevos: Json;
  },
  codigos: CodigosResueltos,
): EntradaNarrada {
  const e = reg.entidad;
  const etq = ETIQUETAS[e];
  const nuevos = reg.datosNuevos ?? {};
  const antes = reg.datosAnteriores ?? {};
  const codigo = codigos.get(`${e}:${reg.idEntidad}`) ?? null;

  // ── Casos con frase propia: las entidades que de verdad se consultan ──
  if (e === 'costeo.montaje_rollo') {
    // La impresora sale del JSON si está, y si no del `idEntidad` resuelto
    // (que para un montaje es el código de su impresora). El rollo solo vive
    // en el JSON.
    const impresora =
      codigos.get(`impresora:${num(nuevos.idImpresora) ?? -1}`) ??
      txt(nuevos.impresora) ??
      codigo;
    const rollo =
      codigos.get(`rollo:${num(nuevos.idRolloPapel) ?? -1}`) ??
      txt(nuevos.rollo);
    if (reg.accion === 'CREATE')
      return {
        texto: `montó un rollo${impresora ? ` en la ${impresora}` : ''}`,
        detalle: rollo ? `rollo ${rollo}` : null,
      };
    const estado = txt(nuevos.estadoRollo);
    return {
      texto: `desmontó un rollo${impresora ? ` de la ${impresora}` : ''}`,
      detalle: estado ? (ESTADO_ROLLO[estado] ?? estado) : null,
    };
  }

  if (e === 'costeo.rollo_papel' && txt(nuevos.accion)) {
    // El `idEntidad` acá es la FACTURA, no el rollo: la acción es por rango.
    const desde = num(nuevos.desde);
    const hasta = num(nuevos.hasta);
    const rango =
      desde != null && hasta != null
        ? desde === hasta
          ? `el rollo ${desde}`
          : `los rollos ${desde} al ${hasta}`
        : 'unos rollos';
    const factura = codigo ? ` de la factura ${codigo}` : '';
    const motivo = txt(nuevos.motivo);
    return nuevos.accion === 'CONSUMIDO_FUERA'
      ? {
          texto: `sacó de circulación ${rango}${factura}`,
          detalle: motivo,
        }
      : {
          texto: `devolvió a bodega ${rango}${factura}`,
          detalle: motivo,
        };
  }

  if (e === 'costeo.consumo_papel' && reg.accion === 'CREATE') {
    const line = txt(nuevos.codigoLine);
    const creadas = num(nuevos.creadas);
    return {
      texto: `registró el consumo${line ? ` del ítem ${line}` : ''}`,
      detalle: creadas != null ? `${creadas} talla(s)` : null,
    };
  }

  if (e === 'core.roles' || e === 'roles') {
    const nombre = codigo ? ` ${codigo}` : '';
    if (reg.accion === 'CREATE')
      return { texto: `creó el rol${nombre}`, detalle: null };
    // El cambio de permisos y el de inactividad se leen distinto.
    if ('permisos' in nuevos) {
      const a = Array.isArray(antes.permisos) ? antes.permisos.length : null;
      const b = Array.isArray(nuevos.permisos) ? nuevos.permisos.length : null;
      return {
        texto: `cambió los permisos del rol${nombre}`,
        detalle: a != null && b != null ? `de ${a} a ${b} permisos` : null,
      };
    }
    if ('minutosInactividad' in nuevos)
      return {
        texto: `cambió el cierre por inactividad del rol${nombre}`,
        detalle: `de ${valor(antes.minutosInactividad)} a ${valor(nuevos.minutosInactividad)}`,
      };
  }

  // ── Caso general: sustantivo + verbo + el diff si lo hay ──
  const verbo =
    (reg.accion === 'CREATE' ? etq?.verboCrear : undefined) ??
    (reg.accion === 'UPDATE' ? etq?.verboEditar : undefined) ??
    VERBOS[reg.accion] ??
    reg.accion.toLowerCase();
  const sustantivo = etq?.singular ?? `un registro de ${e}`;
  const ref = codigo ? ` ${codigo}` : '';

  return {
    texto: `${verbo} ${sustantivo}${ref}`,
    detalle: diferencias(antes, nuevos),
  };
}

/**
 * "de X a Y" para los campos que cambiaron.
 *
 * ⚠️ Solo 17 de 221 UPDATE traían el estado anterior cuando se midió
 * (2026-10-09): el resto guarda el JSON `null`. Sin "antes" se muestra el
 * valor nuevo a secas, que es lo único que de verdad se sabe.
 */
function diferencias(
  antes: Record<string, unknown>,
  nuevos: Record<string, unknown>,
): string | null {
  const claves = Object.keys(nuevos).filter((k) => k !== 'accion');
  if (claves.length === 0) return null;

  const hayAntes = Object.keys(antes).length > 0;
  const partes = claves
    .slice(0, 4) // más de 4 campos deja de leerse como una frase
    .map((k) => {
      const etiqueta = humanizarCampo(k);
      return hayAntes && k in antes
        ? `${etiqueta}: de ${valor(antes[k])} a ${valor(nuevos[k])}`
        : `${etiqueta}: ${valor(nuevos[k])}`;
    });
  const resto = claves.length - partes.length;
  return partes.join(' · ') + (resto > 0 ? ` · y ${resto} campo(s) más` : '');
}

/** `consumoEnBlanco` → "consumo en blanco". */
function humanizarCampo(k: string): string {
  const especiales: Record<string, string> = {
    enBlancoYd: 'papel en blanco (yd)',
    minutosInactividad: 'cierre por inactividad (min)',
    yardasFinales: 'yardas finales',
    estadoRollo: 'estado del rollo',
    codigoLine: 'ítem',
    totalRollos: 'total de rollos',
    numeroFactura: 'número de factura',
  };
  if (especiales[k]) return especiales[k];
  return k
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

/** Las entidades cuyo `id_entidad` SÍ es una clave que se puede resolver. */
export const ENTIDADES_RESOLUBLES = [
  'costeo.orden_produccion',
  'costeo.factura_papel',
  'costeo.rollo_papel', // guarda el id de la factura — ver la nota de arriba
  'costeo.montaje_rollo',
  'costeo.reposicion',
  'costeo.linea_producto',
  'usuarios',
  'core.usuarios',
  'roles',
  'core.roles',
  'productos',
  'insumos',
  'desarrollos',
] as const;
