import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  formatearFechaSheets,
  GoogleSheetsService,
} from '../../common/google-sheets/google-sheets.service';
import { textoClienteSheetsDeOrden } from '../../common/cliente-sheets';
import { estilosDeOrden } from '../../common/estilos-orden';
import { comentarioParaSheets } from '../../common/prendas-texto';
import { parsearCodigoOp } from '../../common/op-codigo';
import { mensajeOpNoEncontrada } from '../../common/op-otra-empresa';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AnularReposicionDto } from './dto/anular-reposicion.dto';
import { CrearReposicionDto } from './dto/crear-reposicion.dto';

const INCLUDE_REPOSICION = {
  departamento: true,
  defecto: true,
  empleado: true,
  impresora: true,
  calandra: true,
  tipoPapel: true,
  insumoTela: true,
  // Las lineas de material, con su insumo y unidad resueltos: la pantalla y
  // el impreso los necesitan, y la unidad NO se guarda en la linea — se lee
  // del catalogo, para que no se desincronice.
  reposicionInsumos: {
    include: {
      insumo: {
        select: {
          idInsumo: true,
          codigo: true,
          descripcion: true,
          unidad: { select: { nombre: true } },
        },
      },
    },
    orderBy: { idReposicionInsumo: 'asc' },
  },
  // Las prendas repuestas, con producto (y su estilo) y talla resueltos.
  prendas: {
    include: {
      producto: {
        select: {
          idProducto: true,
          codigo: true,
          descripcion: true,
          estilo: { select: { nombre: true } },
        },
      },
      talla: { select: { idTalla: true, nombre: true, orden: true } },
      pieza: { select: { idPieza: true, nombre: true } },
    },
    orderBy: { idReposicionPrenda: 'asc' },
  },
  ordenProduccion: { include: { cliente: true } },
} as const;

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
    private readonly googleSheets: GoogleSheetsService,
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

  // Corrección #1 de §6.1: el NRollo/tipo de papel nunca se buscan a mano ni
  // se teclean — se resuelven en el servidor vía fn_rollo_en(impresora,
  // fecha), la misma función corregida antes de F2. Si la impresora no
  // tiene rollo montado en ese instante, se rechaza — nunca se guarda una
  // reposición con el rollo indeterminado (reemplaza el "Buscando..." del
  // legacy por "se resuelve exacto, o se rechaza").
  async crear(
    dto: CrearReposicionDto,
    idUsuarioActor: number,
    idEmpresa: number,
    puedeImpresoraSinRollo: boolean,
  ) {
    const orden = await this.resolverOrden(
      dto.codigoOp,
      idEmpresa,
      idUsuarioActor,
    );
    const fecha = new Date(dto.fecha);
    const tipo = dto.tipo ?? 'REIMPRESION';
    const materiales = dto.materiales ?? [];

    // ── Coherencia ───────────────────────────────────────────────────
    // Las reglas se verifican contra LO QUE LLEGO, no contra el tipo que
    // manda el cliente: si no, se esquivarian cambiando el tipo. El CHECK de
    // la base las respalda, pero aca el mensaje puede decir que falta.
    //
    // Por que hacen falta: el formulario dejaba crear reposiciones sin
    // impresora, sin papel o sin tela, y eso ya produjo datos malos — 17 con
    // yardas de papel y sin impresora (29.16 yd que salieron y no se
    // descontaron de ningun rollo, porque sin montaje no se escribe
    // consumo_papel). El legacy si lo exigia: 0 de 3,612 migradas sin
    // impresora o sin tela.
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
      // usaron retazos) — lo que falta es que no se haya mandado el campo,
      // no que valga 0. `dto.yardasTela` queda `undefined` solo cuando el
      // DTO lo omite; `@Min(0)` del DTO ya rechazó cualquier negativo antes
      // de llegar acá.
      if (dto.yardasTela == null) faltan.push('faltan las yardas de tela');
    }
    if (faltan.length > 0)
      throw new BadRequestException(
        `No se puede registrar: ${faltan.join('; ')}.`,
      );

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
    // porque lo que llega pasa por el navegador y un POST armado a mano podría
    // mandar cualquier producto.
    const prendas = dto.prendas ?? [];
    const disponibles = await this.prendasDisponiblesDeOrden(
      orden.idOrdenProduccion,
    );
    if (disponibles.length > 0 && prendas.length === 0)
      throw new BadRequestException(
        'Indicá qué prendas se repusieron: la orden tiene ítems cargados.',
      );
    if (disponibles.length === 0 && prendas.length > 0)
      throw new BadRequestException(
        'Esta orden no tiene ítems cargados, así que no se pueden indicar prendas.',
      );
    // Las piezas se validan contra el catálogo: llegan del navegador.
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

    const yardasPapel = tipo === 'MATERIALES' ? 0 : (dto.yardasPapel ?? 0);

    const { idReposicion, nrolloTexto } = await this.prisma.$transaction(
      async (tx) => {
        let idMontajeRollo: number | null = null;
        let idTipoPapel: number | null = null;
        let nrolloTexto = '';

        if (dto.idImpresora != null) {
          // Sin el permiso de excepción la impresora tiene que tener rollo
          // montado AHORA, no solo en la fecha que se mandó. La pantalla ya
          // filtra el selector a esas impresoras, pero sin este chequeo la
          // regla se esquivaría con solo retroceder la fecha del formulario.
          if (!puedeImpresoraSinRollo) {
            const ahora = await tx.$queryRaw<{ id_montaje: number | null }[]>`
          SELECT costeo.fn_rollo_en(${dto.idImpresora}, now()) AS id_montaje
        `;
            if ((ahora[0]?.id_montaje ?? null) == null) {
              throw new ConflictException(
                'Esa impresora no tiene ningún rollo montado. Elegí una que sí lo tenga, o pedile a un administrador el permiso para registrar sobre una impresora sin rollo.',
              );
            }
          }

          const resultado = await tx.$queryRaw<{ id_montaje: number | null }[]>`
          SELECT costeo.fn_rollo_en(${dto.idImpresora}, ${fecha}::timestamptz) AS id_montaje
        `;
          idMontajeRollo = resultado[0]?.id_montaje ?? null;
          if (idMontajeRollo == null) {
            throw new ConflictException(
              'Esta impresora no tiene ningún rollo montado en ese momento',
            );
          }
          const montaje = await tx.montajeRollo.findUniqueOrThrow({
            where: { idMontajeRollo },
            include: { rolloPapel: { include: { facturaPapel: true } } },
          });
          idTipoPapel = montaje.rolloPapel.idTipoPapel;
          // Mismo formato que costeo.v_rollo_codigo — el NRollo que el ERP ya
          // resolvió (no la búsqueda heurística del Código.gs legacy, que a
          // veces se queda en "Buscando..." sin resolver nada).
          nrolloTexto = `${montaje.rolloPapel.facturaPapel.numeroFactura}-${montaje.rolloPapel.facturaPapel.totalRollos}-${montaje.rolloPapel.secuencia}`;
        }

        // MAX+1 calculado dentro de la misma transacción — el UNIQUE
        // (id_orden_produccion, numero_repo) es la garantía real ante
        // concurrencia, esto solo evita colisiones en el caso común.
        const agg = await tx.reposicion.aggregate({
          where: { idOrdenProduccion: orden.idOrdenProduccion },
          _max: { numeroRepo: true },
        });
        const numeroRepo = (agg._max.numeroRepo ?? 0) + 1;

        const reposicion = await tx.reposicion.create({
          data: {
            fecha,
            idOrdenProduccion: orden.idOrdenProduccion,
            numeroRepo,
            idDepartamento: dto.idDepartamento,
            idEmpleado: dto.idEmpleado ?? null,
            idDefecto: dto.idDefecto,
            bodegaSac: dto.bodegaSac ?? null,
            idImpresora: dto.idImpresora ?? null,
            idCalandra: dto.idCalandra ?? null,
            idMontajeRollo,
            idTipoPapel,
            yardasPapel,
            idInsumoTela:
              tipo === 'MATERIALES' ? null : (dto.idInsumoTela ?? null),
            yardasTela: tipo === 'MATERIALES' ? 0 : (dto.yardasTela ?? 0),
            tipo,
            comentario: dto.comentario ?? null,
            creadoPor: idUsuarioActor,
          },
        });

        // Las lineas de material van en la misma transaccion: una reposicion
        // MATERIALES sin lineas no tiene sentido, y el CHECK de la base no
        // puede imponerlo porque es entre tablas.
        if (materiales.length > 0) {
          await tx.reposicionInsumo.createMany({
            data: materiales.map((m) => ({
              idReposicion: reposicion.idReposicion,
              idInsumo: m.idInsumo,
              cantidad: m.cantidad,
            })),
          });
        }

        // Las prendas van en la misma transacción que la reposición.
        if (prendas.length > 0) {
          await tx.reposicionPrenda.createMany({
            data: prendas.map((pr) => ({
              idReposicion: reposicion.idReposicion,
              idProducto: pr.idProducto,
              idTalla: pr.idTalla,
              idPieza: pr.idPieza,
              cantidad: pr.cantidad,
            })),
          });
        }

        // Si la reposición sí consumió papel de un rollo resuelto, queda
        // registrada también como hecho de consumo — es lo que permite que
        // el panel de Gestión de Rollos (F2) refleje el papel usado por
        // reposiciones, no solo por producción.
        if (idMontajeRollo != null && yardasPapel > 0) {
          await tx.consumoPapel.create({
            data: {
              fecha,
              origen: 'REPOSICION',
              idOrdenProduccion: orden.idOrdenProduccion,
              idReposicion: reposicion.idReposicion,
              idImpresora: dto.idImpresora!,
              idMontajeRollo,
              idTipoPapel: idTipoPapel!,
              consumoYd: yardasPapel,
              creadoPor: idUsuarioActor,
            },
          });
        }

        return { idReposicion: reposicion.idReposicion, nrolloTexto };
      },
    );

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.reposicion',
      idEntidad: String(idReposicion),
      accion: 'CREATE',
      datosNuevos: {
        codigoOp: dto.codigoOp,
        idDefecto: dto.idDefecto,
        yardasPapel,
        yardasTela: dto.yardasTela ?? 0,
        // Resumen legible: "BSN-FB01N M×1 MANGA IZQ".
        prendas: prendas.map((pr) => {
          const prod = disponibles.find((d) => d.idProducto === pr.idProducto);
          const talla = prod?.tallas.find((t) => t.idTalla === pr.idTalla);
          const pieza = piezas.find((x) => x.idPieza === pr.idPieza);
          return `${prod?.codigo ?? pr.idProducto} ${talla?.nombre ?? pr.idTalla}×${pr.cantidad} ${pieza?.nombre ?? pr.idPieza}`;
        }),
      },
    });

    const detalle = await this.obtener(idReposicion, idEmpresa);

    // Espejo hacia los dos Google Sheets legacy que todavía alimentan Data
    // Studio — en segundo plano, nunca bloquea ni puede fallar el guardado
    // (que ya quedó confirmado en Postgres arriba).
    //
    // Solo para las empresas que espejan. El usuario lo pidió para Impresión de
    // OPs, pero Reposiciones escribe a los MISMOS libros de Digitexsa, así que
    // dejarlo abierto acá habría filtrado por la otra puerta lo que se estaba
    // cerrando por la primera.
    const empresa = await this.prisma.empresa.findUnique({
      where: { idEmpresa },
      select: { espejaSheets: true },
    });
    // ⚠️ Las de MATERIALES NO se espejan, por decision explicita del usuario
    // (2026-10-19): solo PostgreSQL. La hoja "Registro" del libro legacy son
    // 16 columnas fijas sin ninguna de material, y la mas parecida (J/K, TELA
    // y YARDAS TELA) la leen los Dashboards como tela — mandar bolsas y
    // etiquetas ahi las contaria como yardas de tela.
    //
    // Consecuencia a tener presente: las requisiciones de material NO
    // aparecen en los Dashboards de Data Studio.
    if (empresa?.espejaSheets && tipo !== 'MATERIALES')
      void this.espejarEnGoogleSheets(detalle, nrolloTexto);

    return detalle;
  }

  private async espejarEnGoogleSheets(
    detalle: Awaited<ReturnType<CosteoReposicionesService['obtener']>>,
    nrolloTexto: string,
  ) {
    const fechaTexto = formatearFechaSheets(detalle.fecha);
    const responsable = detalle.empleado?.nombres ?? 'Sin responsable';
    // "<subcliente o cliente> - <deporte>" de los productos de la ORDEN: la
    // reposición todavía es de toda la OP. Ver common/cliente-sheets.ts.
    const cliente = await textoClienteSheetsDeOrden(
      this.prisma,
      detalle.idOrdenProduccion,
    );
    const yardasPapel = Number(detalle.yardasPapel);
    const yardasTela = Number(detalle.yardasTela);
    const tipoPapel = detalle.tipoPapel?.nombre ?? '';
    const impresora = detalle.impresora?.codigo ?? '';

    // Hoja "Registro" (libro Repos) — una fila por reposición, réplica
    // exacta de guardarRepo()/hojasRepos.appendRow() del Código.gs legacy,
    // más la columna P "Comentario" (agregada a pedido del usuario, solo en
    // este libro — el campo comentario del ERP no existía en el legacy y no
    // tiene equivalente en "Datos"/ConsumosFinal). Lleva el comentario del ERP
    // y, a continuación, las piezas repuestas ("Piezas: BSN-FB01N M×1 MANGA IZQ").
    const filaRegistro = [
      fechaTexto,
      detalle.ordenProduccion.codigo,
      detalle.codigoRepo,
      detalle.departamento.nombre,
      responsable,
      detalle.defecto.nombre,
      detalle.bodegaSac ?? '',
      yardasPapel,
      tipoPapel,
      detalle.insumoTela?.descripcion ?? '',
      yardasTela,
      cliente,
      impresora,
      detalle.calandra?.codigo ?? '',
      nrolloTexto,
      comentarioParaSheets(
        detalle.comentario,
        detalle.prendas.map((p) => ({
          producto: p.producto.codigo,
          talla: p.talla.nombre,
          pieza: p.pieza.nombre,
          cantidad: p.cantidad,
        })),
      ),
    ];

    // Hoja "Datos" (libro ConsumosFinal DIGITEXSA, compartido con Forma 2) —
    // mismas columnas que hojaCostos.appendRow() del Código.gs legacy; una
    // reposición solo llena las de papel, el resto queda en blanco (nunca
    // se manda tela ahí, igual que el legacy).
    const filaDatos = [
      fechaTexto,
      '',
      detalle.ordenProduccion.codigo,
      detalle.codigoRepo,
      cliente,
      impresora,
      '',
      tipoPapel,
      '',
      '',
      '',
      '',
      yardasPapel,
      '',
      nrolloTexto,
    ];

    await Promise.all([
      this.googleSheets.agregarFila(
        process.env.GOOGLE_SHEETS_ID_REGISTRO,
        'Registro',
        filaRegistro,
      ),
      this.googleSheets.agregarFila(
        process.env.GOOGLE_SHEETS_ID_CONSUMOS,
        'Datos',
        filaDatos,
      ),
    ]);
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

    const ahora = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.reposicion.update({
        where: { idReposicion },
        data: {
          anuladoEn: ahora,
          anuladoPor: idUsuarioActor,
          motivoAnulacion: dto.motivo,
        },
      });
      // El consumo de papel asociado también se anula — si no, seguiría
      // restando del rollo aunque la reposición que lo originó ya no cuente.
      await tx.consumoPapel.updateMany({
        where: { idReposicion, anuladoEn: null },
        data: {
          anuladoEn: ahora,
          anuladoPor: idUsuarioActor,
          motivoAnulacion: dto.motivo,
        },
      });
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
