import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { estilosDeOrden } from '../../common/estilos-orden';
import { resumirPrendas } from '../../common/prendas-texto';
import { parsearCodigoOp } from '../../common/op-codigo';
import { mensajeOpNoEncontrada } from '../../common/op-otra-empresa';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { nombreParaHistorial } from '../costeo-materiales/materiales-historial';
import { AnularReposicionDto } from './dto/anular-reposicion.dto';
import { CrearReposicionDto } from './dto/crear-reposicion.dto';
import { CorregirReposicionDto } from './dto/flujo-reposicion.dto';
import {
  type CambioReposicion,
  crearEventosReposicion,
  pasoActual,
} from './flujo';
import { INCLUDE_REPOSICION } from './reposiciones-include';

type TxCliente = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/** Los datos del formulario ya validados contra la orden y los catálogos. */
interface DatosValidados {
  tipo: 'REIMPRESION' | 'MATERIALES';
  materiales: { idInsumo: number; cantidad: number }[];
  prendas: {
    idProducto: number;
    idTalla: number;
    idPieza: number;
    cantidad: number;
  }[];
  yardasPapel: number;
  yardasTela: number;
  disponibles: PrendaDisponible[];
  piezas: { idPieza: number; nombre: string }[];
}

type ReposicionCompleta = Awaited<
  ReturnType<CosteoReposicionesService['obtener']>
>;

/** Foto legible de lo editable, para registrar qué cambió al corregir. */
function fotoParaCambios(r: ReposicionCompleta): Record<string, string | null> {
  const n = (v: string | number | null | undefined) =>
    v == null || v === '' ? null : String(v);
  return {
    Fecha: r.fecha.toLocaleString('es-GT', {
      timeZone: 'America/Guatemala',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    Tipo: r.tipo,
    Departamento: n(r.departamento?.nombre),
    Defecto: n(r.defecto?.nombre),
    Responsable: n(r.empleado?.nombres),
    'Bodega SAC': n(r.bodegaSac),
    Impresora: n(r.impresora?.codigo),
    Calandra: n(r.calandra?.codigo),
    'Yardas papel': Number(r.yardasPapel).toString(),
    Tela: n(r.insumoTela?.codigo),
    'Yardas tela': Number(r.yardasTela).toString(),
    Comentario: n(r.comentario),
    Prendas: n(
      resumirPrendas(
        r.prendas.map((p) => ({
          producto: p.producto.codigo,
          talla: p.talla.nombre,
          pieza: p.pieza.nombre,
          cantidad: p.cantidad,
        })),
      ),
    ),
    Materiales: n(
      r.reposicionInsumos
        .map((m) => `${m.insumo.codigo} × ${Number(m.cantidad)}`)
        .join(' · '),
    ),
  };
}

/** Un producto de la orden con sus tallas, tal como se ofrece al elegir prendas. */
export interface PrendaDisponible {
  idProducto: number;
  codigo: string;
  descripcion: string | null;
  estilo: string | null;
  tallas: { idTalla: number; nombre: string; cantidadPedida: number }[];
}

@Injectable()
export class CosteoReposicionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  listarDepartamentos() {
    return this.prisma.departamento.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  listarDefectos() {
    return this.prisma.defecto.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  /** Las piezas que se pueden elegir al registrar (las retiradas no se ofrecen). */
  listarPiezas() {
    return this.prisma.pieza.findMany({
      where: { activo: true },
      select: { idPieza: true, nombre: true },
      orderBy: { nombre: 'asc' },
    });
  }

  listarCalandras() {
    return this.prisma.calandra.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
    });
  }

  private async resolverOrden(
    codigoOp: string,
    idEmpresa: number,
    idUsuario: number,
  ) {
    const parsed = parsearCodigoOp(codigoOp);
    if (!parsed)
      throw new BadRequestException(
        'Código de OP inválido (formato esperado: 26OP014154)',
      );
    const orden = await this.prisma.ordenProduccion.findUnique({
      where: {
        idEmpresa_anio_correlativo: {
          idEmpresa,
          anio: parsed.anio,
          correlativo: parsed.correlativo,
        },
      },
      include: { cliente: true, estilo: { select: { nombre: true } } },
    });
    if (!orden)
      throw new NotFoundException(
        await mensajeOpNoEncontrada(this.prisma, {
          codigo: codigoOp,
          anio: parsed.anio,
          correlativo: parsed.correlativo,
          idUsuario,
          idEmpresaActual: idEmpresa,
        }),
      );
    return orden;
  }

  /**
   * Los productos de los ÍTEMS de la orden, con sus tallas: es lo único que se
   * puede elegir como prenda repuesta.
   *
   * Agrupa por PRODUCTO y no por ítem: el mismo producto aparece en varios
   * ítems de una orden (la misma prenda pedida tres veces entra como tres
   * ítems), y es el producto el que trae estilo, línea, género y deporte. Las
   * cantidades pedidas se suman por talla entre esos ítems.
   */
  private async prendasDisponiblesDeOrden(
    idOrdenProduccion: number,
  ): Promise<PrendaDisponible[]> {
    const lineas = await this.prisma.lineaProduccion.findMany({
      where: { idOrdenProduccion },
      select: {
        producto: {
          select: {
            idProducto: true,
            codigo: true,
            descripcion: true,
            estilo: { select: { nombre: true } },
          },
        },
        tallas: {
          select: {
            cantidad: true,
            talla: { select: { idTalla: true, nombre: true, orden: true } },
          },
        },
      },
    });
    type TallaAcum = {
      idTalla: number;
      nombre: string;
      cantidadPedida: number;
      orden: number;
    };
    const porProducto = new Map<
      number,
      {
        idProducto: number;
        codigo: string;
        descripcion: string | null;
        estilo: string | null;
        tallas: Map<number, TallaAcum>;
      }
    >();
    for (const l of lineas) {
      let p = porProducto.get(l.producto.idProducto);
      if (!p) {
        p = {
          idProducto: l.producto.idProducto,
          codigo: l.producto.codigo,
          descripcion: l.producto.descripcion ?? null,
          estilo: l.producto.estilo?.nombre ?? null,
          tallas: new Map(),
        };
        porProducto.set(l.producto.idProducto, p);
      }
      for (const t of l.tallas) {
        const previa = p.tallas.get(t.talla.idTalla);
        if (previa) previa.cantidadPedida += t.cantidad;
        else
          p.tallas.set(t.talla.idTalla, {
            idTalla: t.talla.idTalla,
            nombre: t.talla.nombre,
            cantidadPedida: t.cantidad,
            orden: t.talla.orden,
          });
      }
    }
    return [...porProducto.values()]
      .map((p) => ({
        idProducto: p.idProducto,
        codigo: p.codigo,
        descripcion: p.descripcion,
        estilo: p.estilo,
        tallas: [...p.tallas.values()]
          .sort((x, y) => x.orden - y.orden)
          .map((t) => ({
            idTalla: t.idTalla,
            nombre: t.nombre,
            cantidadPedida: t.cantidadPedida,
          })),
      }))
      .sort((x, y) => x.codigo.localeCompare(y.codigo));
  }

  async siguienteNumero(
    codigoOp: string,
    idEmpresa: number,
    idUsuario: number,
  ) {
    const orden = await this.resolverOrden(codigoOp, idEmpresa, idUsuario);
    const prendasDisponibles = await this.prendasDisponiblesDeOrden(
      orden.idOrdenProduccion,
    );
    const agg = await this.prisma.reposicion.aggregate({
      where: { idOrdenProduccion: orden.idOrdenProduccion },
      _max: { numeroRepo: true },
    });
    return {
      siguienteNumero: (agg._max.numeroRepo ?? 0) + 1,
      cliente: orden.cliente?.nombre ?? null,
      estilos: await estilosDeOrden(
        this.prisma,
        orden.idOrdenProduccion,
        orden.estilo?.nombre,
      ),
      // Lo que la pantalla ofrece como prendas. Va acá y no en el endpoint de
      // órdenes: aquél pide `costeo.orden.ver`, que el operario de
      // reposiciones no necesariamente tiene.
      tieneItems: prendasDisponibles.length > 0,
      prendasDisponibles,
    };
  }

  listar(idEmpresa: number, idOrdenProduccion?: number) {
    return this.prisma.reposicion.findMany({
      // Sin `idOrdenProduccion` esto listaba TODAS las reposiciones, de las dos
      // empresas. El filtro va por la OP porque la reposición no lleva empresa
      // propia: la hereda de su orden.
      where: { idOrdenProduccion, ordenProduccion: { idEmpresa } },
      include: INCLUDE_REPOSICION,
      orderBy: { fecha: 'desc' },
    });
  }

  async obtener(idReposicion: number, idEmpresa: number) {
    // findFirst y no findUnique: una reposición de otra empresa debe verse
    // como inexistente, no como existente-pero-prohibida.
    const reposicion = await this.prisma.reposicion.findFirst({
      where: { idReposicion, ordenProduccion: { idEmpresa } },
      include: INCLUDE_REPOSICION,
    });
    if (!reposicion) throw new NotFoundException('Reposición no encontrada');
    return reposicion;
  }

  /**
   * Valida el formulario contra la orden y los catálogos. La usan la creación y la
   * corrección: las dos tienen que exigir exactamente lo mismo.
   */
  private async validarDatos(
    dto: Omit<CrearReposicionDto, 'codigoOp'>,
    idOrdenProduccion: number,
  ): Promise<DatosValidados> {
    const tipo = dto.tipo ?? 'REIMPRESION';
    const materiales = dto.materiales ?? [];

    // ── Coherencia ───────────────────────────────────────────────────
    // Las reglas se verifican contra LO QUE LLEGO, no contra el tipo que
    // manda el cliente: si no, se esquivarian cambiando el tipo. El CHECK de
    // la base las respalda, pero aca el mensaje puede decir que falta.
    //
    // Por que hacen falta: el formulario dejaba crear reposiciones sin
    // impresora, sin papel o sin tela, y eso ya produjo datos malos — 17 con
    // yardas de papel y sin impresora. El legacy si lo exigia.
    const faltan: string[] = [];
    if (tipo === 'MATERIALES') {
      if (materiales.length === 0)
        faltan.push(
          'una reposición de materiales necesita al menos un material',
        );
      if (dto.idImpresora != null) faltan.push('no lleva impresora');
      if ((dto.yardasPapel ?? 0) > 0) faltan.push('no lleva yardas de papel');
      if (dto.idInsumoTela != null) faltan.push('no lleva tela');
      if ((dto.yardasTela ?? 0) > 0) faltan.push('no lleva yardas de tela');
    } else {
      if (materiales.length > 0)
        faltan.push('una reimpresión no lleva materiales: son excluyentes');
      if (dto.idImpresora == null) faltan.push('falta la impresora');
      if ((dto.yardasPapel ?? 0) <= 0)
        faltan.push('faltan las yardas de papel');
      if (dto.idInsumoTela == null) faltan.push('falta la tela');
      // A diferencia del papel, 0 es un consumo real y válido de tela (se
      // usaron retazos) — lo que falta es que no se haya mandado el campo.
      if (dto.yardasTela == null) faltan.push('faltan las yardas de tela');
    }
    if (faltan.length > 0)
      throw new BadRequestException(
        `No se puede registrar: ${faltan.join('; ')}.`,
      );

    // La impresora se valida acá: el rollo ya NO se resuelve al crear (se
    // resuelve al autorizar), pero una impresora retirada no tiene sentido.
    if (dto.idImpresora != null) {
      const imp = await this.prisma.impresora.findUnique({
        where: { idImpresora: dto.idImpresora },
        select: { activo: true },
      });
      if (!imp || !imp.activo)
        throw new BadRequestException(
          'Esa impresora no existe o está retirada.',
        );
    }

    // Los materiales se resuelven contra el catalogo: un insumo inexistente o
    // inactivo se rechaza aca con un mensaje legible, en vez de dejar que
    // reviente la FK.
    if (materiales.length > 0) {
      const ids = [...new Set(materiales.map((m) => m.idInsumo))];
      if (ids.length !== materiales.length)
        throw new BadRequestException(
          'Hay un material repetido en la lista: sumá las cantidades en una sola línea.',
        );
      const encontrados = await this.prisma.insumo.findMany({
        where: { idInsumo: { in: ids } },
        select: { idInsumo: true, codigo: true, activo: true },
      });
      const faltantes = ids.filter(
        (id) => !encontrados.some((e) => e.idInsumo === id),
      );
      if (faltantes.length > 0)
        throw new BadRequestException(
          `Hay ${faltantes.length} material(es) que ya no existen en el catálogo.`,
        );
      const inactivos = encontrados.filter((e) => !e.activo);
      if (inactivos.length > 0)
        throw new BadRequestException(
          `Material(es) retirado(s) del catálogo: ${inactivos.map((i) => i.codigo).join(', ')}.`,
        );
    }

    // ── Prendas ──────────────────────────────────────────────────────
    // Qué se repuso: producto + talla + piezas. Obligatorio si la orden tiene
    // ítems; las órdenes migradas del legacy no los tienen y se registran sin
    // prendas. Se valida contra los ÍTEMS de la orden —no contra el catálogo—
    // porque lo que llega pasa por el navegador.
    const prendas = dto.prendas ?? [];
    const disponibles = await this.prendasDisponiblesDeOrden(idOrdenProduccion);
    if (disponibles.length > 0 && prendas.length === 0)
      throw new BadRequestException(
        'Indicá qué prendas se repusieron: la orden tiene ítems cargados.',
      );
    if (disponibles.length === 0 && prendas.length > 0)
      throw new BadRequestException(
        'Esta orden no tiene ítems cargados, así que no se pueden indicar prendas.',
      );
    const idsPieza = [...new Set(prendas.map((p) => p.idPieza))];
    const piezas = await this.prisma.pieza.findMany({
      where: { idPieza: { in: idsPieza } },
      select: { idPieza: true, nombre: true, activo: true },
    });
    if (piezas.length !== idsPieza.length)
      throw new BadRequestException(
        'Una de las piezas ya no existe en el catálogo.',
      );
    const retiradas = piezas.filter((p) => !p.activo);
    if (retiradas.length > 0)
      throw new BadRequestException(
        `Pieza(s) retirada(s) del catálogo: ${retiradas.map((p) => p.nombre).join(', ')}.`,
      );
    const vistas = new Set<string>();
    for (const pr of prendas) {
      const producto = disponibles.find((d) => d.idProducto === pr.idProducto);
      if (!producto)
        throw new BadRequestException(
          'Una de las prendas es de un producto que no está en esta orden.',
        );
      if (!producto.tallas.some((t) => t.idTalla === pr.idTalla))
        throw new BadRequestException(
          `${producto.codigo} no tiene esa talla en esta orden.`,
        );
      const clave = `${pr.idProducto}:${pr.idTalla}:${pr.idPieza}`;
      if (vistas.has(clave))
        throw new BadRequestException(
          'Hay una prenda repetida (mismo producto, talla y pieza): sumá las piezas en una sola línea.',
        );
      vistas.add(clave);
    }

    return {
      tipo,
      materiales,
      prendas,
      yardasPapel: tipo === 'MATERIALES' ? 0 : (dto.yardasPapel ?? 0),
      yardasTela: tipo === 'MATERIALES' ? 0 : (dto.yardasTela ?? 0),
      disponibles,
      piezas,
    };
  }

  /** Los campos de la reposición que salen del formulario (crear y corregir). */
  private camposFormulario(
    dto: Omit<CrearReposicionDto, 'codigoOp'>,
    v: DatosValidados,
  ) {
    return {
      fecha: new Date(dto.fecha),
      idDepartamento: dto.idDepartamento,
      idEmpleado: dto.idEmpleado ?? null,
      idDefecto: dto.idDefecto,
      bodegaSac: dto.bodegaSac?.trim() || null,
      idImpresora: v.tipo === 'MATERIALES' ? null : (dto.idImpresora ?? null),
      idCalandra: v.tipo === 'MATERIALES' ? null : (dto.idCalandra ?? null),
      yardasPapel: v.yardasPapel,
      idInsumoTela: v.tipo === 'MATERIALES' ? null : (dto.idInsumoTela ?? null),
      yardasTela: v.yardasTela,
      tipo: v.tipo,
      comentario: dto.comentario?.trim() || null,
    };
  }

  private async escribirLineas(
    tx: TxCliente,
    idReposicion: number,
    v: DatosValidados,
  ) {
    if (v.materiales.length > 0)
      await tx.reposicionInsumo.createMany({
        data: v.materiales.map((m) => ({
          idReposicion,
          idInsumo: m.idInsumo,
          cantidad: m.cantidad,
        })),
      });
    if (v.prendas.length > 0)
      await tx.reposicionPrenda.createMany({
        data: v.prendas.map((pr) => ({
          idReposicion,
          idProducto: pr.idProducto,
          idTalla: pr.idTalla,
          idPieza: pr.idPieza,
          cantidad: pr.cantidad,
        })),
      });
  }

  /**
   * Registra una reposición y la deja esperando el paso 2 del flujo.
   *
   * Desde el flujo de validaciones (2026-11-17) crear NO descuenta papel ni
   * escribe en Google Sheets: eso pasa al autorizar (paso 6), cuando se resuelve
   * el rollo montado en ese momento. Por eso tampoco se exige acá que la
   * impresora tenga rollo.
   */
  async crear(
    dto: CrearReposicionDto,
    idUsuarioActor: number,
    idEmpresa: number,
  ) {
    const orden = await this.resolverOrden(
      dto.codigoOp,
      idEmpresa,
      idUsuarioActor,
    );
    const v = await this.validarDatos(dto, orden.idOrdenProduccion);
    const usuarioNombre = await nombreParaHistorial(
      this.prisma,
      idUsuarioActor,
    );

    const idReposicion = await this.prisma.$transaction(async (tx) => {
      // MAX+1 calculado dentro de la misma transacción — el UNIQUE
      // (id_orden_produccion, numero_repo) es la garantía real ante
      // concurrencia, esto solo evita colisiones en el caso común.
      const agg = await tx.reposicion.aggregate({
        where: { idOrdenProduccion: orden.idOrdenProduccion },
        _max: { numeroRepo: true },
      });
      const numeroRepo = (agg._max.numeroRepo ?? 0) + 1;
      const ahora = new Date();

      const reposicion = await tx.reposicion.create({
        data: {
          ...this.camposFormulario(dto, v),
          idOrdenProduccion: orden.idOrdenProduccion,
          numeroRepo,
          creadoPor: idUsuarioActor,
          creadoEn: ahora,
          estado: 'EN_VALIDACION',
          pasoPendiente: 2,
          estadoDesde: ahora,
        },
      });
      await this.escribirLineas(tx, reposicion.idReposicion, v);
      await crearEventosReposicion(tx, [
        {
          idEmpresa,
          idReposicion: reposicion.idReposicion,
          accion: 'CREAR',
          paso: 1,
          desde: ahora,
          ahora,
          idUsuario: idUsuarioActor,
          usuarioNombre,
        },
      ]);
      return reposicion.idReposicion;
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.reposicion',
      idEntidad: String(idReposicion),
      accion: 'CREATE',
      datosNuevos: {
        codigoOp: dto.codigoOp,
        idDefecto: dto.idDefecto,
        yardasPapel: v.yardasPapel,
        yardasTela: v.yardasTela,
        // Resumen legible: "BSN-FB01N M×1 MANGA IZQ".
        prendas: v.prendas.map((pr) => {
          const prod = v.disponibles.find(
            (d) => d.idProducto === pr.idProducto,
          );
          const talla = prod?.tallas.find((t) => t.idTalla === pr.idTalla);
          const pieza = v.piezas.find((x) => x.idPieza === pr.idPieza);
          return `${prod?.codigo ?? pr.idProducto} ${talla?.nombre ?? pr.idTalla}×${pr.cantidad} ${pieza?.nombre ?? pr.idPieza}`;
        }),
      },
    });

    return this.obtener(idReposicion, idEmpresa);
  }

  /**
   * Corrige una reposición DEVUELTA (o que todavía nadie validó) y la reenvía al
   * paso 2. Las validaciones previas dejan de contar: los datos cambiaron.
   *
   * La puede corregir cualquiera con `costeo.reposicion.crear`, no solo quien la
   * creó, para que el equipo cubra ausencias; queda en la línea de tiempo quién fue.
   */
  async corregir(
    idReposicion: number,
    dto: CorregirReposicionDto,
    idUsuarioActor: number,
    idEmpresa: number,
  ) {
    const actual = await this.obtener(idReposicion, idEmpresa);
    if (actual.anuladoEn)
      throw new ConflictException('La reposición está anulada.');
    const corregible =
      actual.estado === 'DEVUELTA' ||
      (actual.estado === 'EN_VALIDACION' && actual.pasoPendiente === 2);
    if (!corregible)
      throw new ConflictException(
        'Solo se corrige una reposición devuelta, o una que todavía nadie validó.',
      );

    const v = await this.validarDatos(dto, actual.idOrdenProduccion);
    const usuarioNombre = await nombreParaHistorial(
      this.prisma,
      idUsuarioActor,
    );

    await this.prisma.$transaction(async (tx) => {
      // Bloqueo de la fila: un validador que actúa al mismo tiempo no puede
      // validar algo que se está corrigiendo.
      await tx.$queryRaw`SELECT 1 FROM costeo.reposicion WHERE id_reposicion = ${idReposicion} FOR UPDATE`;
      const fila = await tx.reposicion.findUniqueOrThrow({
        where: { idReposicion },
        select: {
          estado: true,
          pasoPendiente: true,
          estadoDesde: true,
          anuladoEn: true,
        },
      });
      const sigue =
        !fila.anuladoEn &&
        (fila.estado === 'DEVUELTA' ||
          (fila.estado === 'EN_VALIDACION' && fila.pasoPendiente === 2));
      if (!sigue)
        throw new ConflictException(
          'La reposición cambió mientras se corregía: recargá y volvé a intentar.',
        );

      const ahora = new Date();
      await tx.reposicion.update({
        where: { idReposicion },
        data: {
          ...this.camposFormulario(dto, v),
          estado: 'EN_VALIDACION',
          pasoPendiente: 2,
          estadoDesde: ahora,
        },
      });
      await tx.reposicionInsumo.deleteMany({ where: { idReposicion } });
      await tx.reposicionPrenda.deleteMany({ where: { idReposicion } });
      await this.escribirLineas(tx, idReposicion, v);

      const despues = await tx.reposicion.findUniqueOrThrow({
        where: { idReposicion },
        include: INCLUDE_REPOSICION,
      });
      const a = fotoParaCambios(actual);
      const d = fotoParaCambios(despues);
      const cambios: CambioReposicion[] = Object.keys(d)
        .filter((k) => a[k] !== d[k])
        .map((k) => ({ campo: k, antes: a[k], despues: d[k] }));

      await crearEventosReposicion(tx, [
        {
          idEmpresa,
          idReposicion,
          accion: 'CORREGIR',
          paso: 1,
          // Cuánto tardó en corregir: desde que se la devolvieron (o desde que
          // la creó, si la corrige antes de que nadie la valide).
          desde: fila.estadoDesde ?? ahora,
          ahora,
          motivo: dto.nota,
          cambios,
          idUsuario: idUsuarioActor,
          usuarioNombre,
        },
      ]);
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.reposicion',
      idEntidad: String(idReposicion),
      accion: 'UPDATE',
      datosNuevos: { corregida: true, reenviadaAlPaso: 2 },
    });

    return this.obtener(idReposicion, idEmpresa);
  }

  async anular(
    idReposicion: number,
    dto: AnularReposicionDto,
    idUsuarioActor: number,
    idEmpresa: number,
  ) {
    const reposicion = await this.prisma.reposicion.findFirst({
      where: { idReposicion, ordenProduccion: { idEmpresa } },
    });
    if (!reposicion) throw new NotFoundException('Reposición no encontrada');
    if (reposicion.anuladoEn)
      throw new ConflictException('Esta reposición ya fue anulada');
    // Lo despachado ya salió de bodega: anularlo dejaría los materiales sin
    // explicación. Las HISTORICA sí se pueden anular, como siempre (son las
    // anteriores al flujo y la salida para corregir datos migrados).
    if (reposicion.estado === 'DESPACHADA')
      throw new ConflictException(
        'Los materiales de esta reposición ya se despacharon: no se puede anular.',
      );
    const usuarioNombre = await nombreParaHistorial(
      this.prisma,
      idUsuarioActor,
    );

    const ahora = new Date();
    await this.prisma.$transaction(async (tx) => {
      // `anuladoEn: null` en el where: dos anulaciones simultáneas no pasan las dos.
      const r = await tx.reposicion.updateMany({
        where: { idReposicion, anuladoEn: null },
        data: {
          anuladoEn: ahora,
          anuladoPor: idUsuarioActor,
          motivoAnulacion: dto.motivo,
        },
      });
      if (r.count === 0)
        throw new ConflictException('Esta reposición ya fue anulada');
      // El consumo de papel asociado también se anula — si no, seguiría
      // restando del rollo aunque la reposición que lo originó ya no cuente.
      // Solo existe si ya se había autorizado (o si es HISTORICA).
      await tx.consumoPapel.updateMany({
        where: { idReposicion, anuladoEn: null },
        data: {
          anuladoEn: ahora,
          anuladoPor: idUsuarioActor,
          motivoAnulacion: dto.motivo,
        },
      });
      await crearEventosReposicion(tx, [
        {
          idEmpresa,
          idReposicion,
          accion: 'ANULAR',
          paso: pasoActual(reposicion.estado, reposicion.pasoPendiente),
          desde: reposicion.estadoDesde ?? reposicion.creadoEn,
          ahora,
          motivo: dto.motivo,
          idUsuario: idUsuarioActor,
          usuarioNombre,
        },
      ]);
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.reposicion',
      idEntidad: String(idReposicion),
      accion: 'UPDATE',
      datosNuevos: { anuladoEn: ahora, motivo: dto.motivo },
    });

    return this.obtener(idReposicion, idEmpresa);
  }
}
