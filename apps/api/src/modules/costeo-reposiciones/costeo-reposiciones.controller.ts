import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EmpresaActual } from '../auth/decorators/empresa-actual.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CosteoReposicionesService } from './costeo-reposiciones.service';
import { AnularReposicionDto } from './dto/anular-reposicion.dto';
import { GuardarCortesDto, SemaforoDto } from './dto/configuracion-cortes.dto';
import { CrearReposicionDto } from './dto/crear-reposicion.dto';
import {
  AutorizarDirectoDto,
  ConfigurarReposicionesDto,
  CorregirReposicionDto,
  DevolverReposicionesDto,
  EntregarRequisicionesDto,
  ImprimirRequisicionesDto,
  PrepararRequisicionesDto,
  ValidarReposicionesDto,
} from './dto/flujo-reposicion.dto';
import { PERMISO_IMPRIMIR, PERMISOS_COPIA_REQUISICION } from './flujo';
import { ReposicionesConfigService } from './reposiciones-config.service';
import { ReposicionesFlujoService } from './reposiciones-flujo.service';
import {
  ESTADOS_FILTRO,
  type EstadoFiltro,
  type FiltrosSeguimiento,
  ReposicionesSeguimientoService,
} from './reposiciones-seguimiento.service';

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const entero = (v?: string) => {
  const n = Number(v);
  return v && Number.isInteger(n) && n > 0 ? n : undefined;
};
const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const si = (v?: string) => v === 'true' || v === '1';

/** Los filtros del seguimiento desde la query (mismo intérprete para listado y Excel). */
function filtros(q: Record<string, string | undefined>): FiltrosSeguimiento {
  const estado = ESTADOS_FILTRO.includes(q.estado as EstadoFiltro)
    ? (q.estado as EstadoFiltro)
    : 'en_curso';
  const porPagina = Math.min(200, entero(q.porPagina) ?? 50);
  return {
    estado,
    paso: entero(q.paso),
    soloMias: si(q.soloMias),
    porValidar: si(q.porValidar),
    corteDia: q.corteDia && DIA.test(q.corteDia) ? q.corteDia : undefined,
    corteHora:
      q.corteDia && q.corteHora && HORA.test(q.corteHora)
        ? q.corteHora
        : undefined,
    ruta: q.ruta === 'con' || q.ruta === 'sin' ? q.ruta : undefined,
    codigoOp: q.codigoOp?.trim() || undefined,
    idCreador: entero(q.idCreador),
    idDefecto: entero(q.idDefecto),
    idDepartamento: entero(q.idDepartamento),
    tipo:
      q.tipo === 'REIMPRESION' || q.tipo === 'MATERIALES' ? q.tipo : undefined,
    idImpresora: entero(q.idImpresora),
    producto: q.producto?.trim() || undefined,
    texto: q.texto?.trim() || undefined,
    campoFecha: q.campoFecha === 'creacion' ? 'creacion' : 'reposicion',
    desde: q.desde && DIA.test(q.desde) ? q.desde : undefined,
    hasta: q.hasta && DIA.test(q.hasta) ? q.hasta : undefined,
    pagina: entero(q.pagina) ?? 1,
    porPagina,
  };
}

function enviarExcel(res: Response, buffer: unknown, nombre: string) {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.send(buffer);
}

@Controller('costeo/reposiciones')
export class CosteoReposicionesController {
  constructor(
    private readonly service: CosteoReposicionesService,
    private readonly flujo: ReposicionesFlujoService,
    private readonly seguimiento: ReposicionesSeguimientoService,
    private readonly config: ReposicionesConfigService,
  ) {}

  @RequirePermissions('costeo.reposicion.ver')
  @Get('siguiente-numero')
  siguienteNumero(
    @Query('codigoOp') codigoOp: string,
    @EmpresaActual() idEmpresa: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.siguienteNumero(codigoOp, idEmpresa, usuario.sub);
  }

  @RequirePermissions('costeo.reposicion.ver')
  @Get('departamentos')
  departamentos() {
    return this.service.listarDepartamentos();
  }

  @RequirePermissions('costeo.reposicion.ver')
  @Get('defectos')
  defectos() {
    return this.service.listarDefectos();
  }

  @RequirePermissions('costeo.reposicion.ver')
  @Get('piezas')
  piezas() {
    return this.service.listarPiezas();
  }

  @RequirePermissions('costeo.reposicion.ver')
  @Get('calandras')
  calandras() {
    return this.service.listarCalandras();
  }

  // ── Seguimiento y métricas (rutas fijas, antes de `:id`) ──────────────

  @RequirePermissions('costeo.reposicion.ver')
  @Get('seguimiento')
  listarSeguimiento(
    @Query() q: Record<string, string | undefined>,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.seguimiento.listar(filtros(q), usuario, idEmpresa);
  }

  // Lo consulta el navegador cada minuto para el aviso de "tenés N por validar".
  @RequirePermissions('costeo.reposicion.ver')
  @Get('seguimiento/avisos')
  avisos(
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.seguimiento.avisos(usuario, idEmpresa);
  }

  @RequirePermissions('costeo.reposicion.ver')
  @Get('seguimiento/exportar')
  async exportarSeguimiento(
    @Query() q: Record<string, string | undefined>,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
    @Res() res: Response,
  ) {
    const { buffer, nombre } = await this.seguimiento.exportarSeguimiento(
      filtros(q),
      usuario,
      idEmpresa,
    );
    enviarExcel(res, buffer, nombre);
  }

  @RequirePermissions('costeo.reposicion.metricas')
  @Get('metricas')
  metricas(
    @Query('desde') desde: string | undefined,
    @Query('hasta') hasta: string | undefined,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.seguimiento.metricas(
      idEmpresa,
      desde && DIA.test(desde) ? desde : undefined,
      hasta && DIA.test(hasta) ? hasta : undefined,
    );
  }

  @RequirePermissions('costeo.reposicion.metricas')
  @Get('metricas/exportar')
  async exportarMetricas(
    @Query('desde') desde: string | undefined,
    @Query('hasta') hasta: string | undefined,
    @EmpresaActual() idEmpresa: number,
    @Res() res: Response,
  ) {
    const { buffer, nombre } = await this.seguimiento.exportarMetricas(
      idEmpresa,
      desde && DIA.test(desde) ? desde : undefined,
      hasta && DIA.test(hasta) ? hasta : undefined,
    );
    enviarExcel(res, buffer, nombre);
  }

  // ── Flujo de validaciones ─────────────────────────────────────────────
  // El permiso de CADA paso es distinto y se elige por el cuerpo, así que no cabe
  // en @RequirePermissions (que exige todos los que lista): el servicio verifica
  // el del paso pedido. El decorador deja la puerta en `ver`.

  // Modo transitorio sin validaciones (capacitación). Leerlo lo necesita cualquiera
  // que registre o mire reposiciones; cambiarlo, solo quien tenga `configurar`.
  @RequirePermissions('costeo.reposicion.ver')
  @Get('configuracion')
  obtenerConfiguracion(@EmpresaActual() idEmpresa: number) {
    return this.service.obtenerConfiguracion(idEmpresa);
  }

  @RequirePermissions('costeo.reposicion.configurar')
  @Patch('configuracion')
  configurar(
    @Body() dto: ConfigurarReposicionesDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.configurar(dto.sinValidacion, usuario.sub, idEmpresa);
  }

  // Cortes de requisiciones: se reemplaza el conjunto completo, no un delta.
  @RequirePermissions('costeo.reposicion.configurar')
  @Put('configuracion/cortes')
  guardarCortes(
    @Body() dto: GuardarCortesDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.config.guardarCortes(dto.cortes, usuario.sub, idEmpresa);
  }

  @RequirePermissions('costeo.reposicion.configurar')
  @Patch('configuracion/semaforo')
  guardarSemaforo(
    @Body() dto: SemaforoDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.config.guardarSemaforo(dto, usuario.sub, idEmpresa);
  }

  @RequirePermissions('costeo.reposicion.crear')
  @Post('autorizar-directo')
  autorizarDirecto(
    @Body() dto: AutorizarDirectoDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.flujo.autorizarDirectoLote(dto.ids, usuario, idEmpresa);
  }

  @RequirePermissions('costeo.reposicion.ver')
  @Post('validar')
  validar(
    @Body() dto: ValidarReposicionesDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.flujo.validarLote(dto, usuario, idEmpresa);
  }

  @RequirePermissions('costeo.reposicion.ver')
  @Post('devolver')
  devolver(
    @Body() dto: DevolverReposicionesDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.flujo.devolverLote(dto, usuario, idEmpresa);
  }

  // Numerar por primera vez es de quien imprime; sacar COPIAS también de quien
  // autoriza o audita. Es una regla O entre permisos, así que se resuelve acá.
  @RequirePermissions('costeo.reposicion.ver')
  @Post('requisiciones/imprimir')
  imprimirRequisiciones(
    @Body() dto: ImprimirRequisicionesDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    if (!PERMISOS_COPIA_REQUISICION.some((p) => usuario.permisos.includes(p)))
      throw new ForbiddenException(
        'No tenés permiso para imprimir requisiciones.',
      );
    return this.flujo.imprimirRequisiciones(
      dto.ids,
      usuario.sub,
      idEmpresa,
      !usuario.permisos.includes(PERMISO_IMPRIMIR),
    );
  }

  // Bodega deja lista la requisición y avisa a quien la pidió (paso 8).
  @RequirePermissions('costeo.reposicion.despachar')
  @Post('requisiciones/preparar')
  preparar(
    @Body() dto: PrepararRequisicionesDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.flujo.prepararLote(dto.ids, usuario.sub, idEmpresa);
  }

  // El solicitante recogió: bodega marca la entrega (paso 9).
  @RequirePermissions('costeo.reposicion.despachar')
  @Post('requisiciones/entregar')
  entregar(
    @Body() dto: EntregarRequisicionesDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.flujo.entregarLote(dto, usuario.sub, idEmpresa);
  }

  @RequirePermissions('costeo.reposicion.ver')
  @Get()
  listar(
    @EmpresaActual() idEmpresa: number,
    @Query('idOrdenProduccion') idOrdenProduccion?: string,
  ) {
    return this.service.listar(
      idEmpresa,
      idOrdenProduccion ? Number(idOrdenProduccion) : undefined,
    );
  }

  @RequirePermissions('costeo.reposicion.ver')
  @Get(':id/eventos')
  eventos(
    @Param('id', ParseIntPipe) id: number,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.seguimiento.eventos(id, idEmpresa);
  }

  /**
   * Una reposición con su cadena de validaciones, para reimprimir la requisición
   * o ver el detalle. Imprimir de verdad (asignar número) es POST requisiciones/imprimir.
   */
  @RequirePermissions('costeo.reposicion.ver')
  @Get(':id/para-imprimir')
  async paraImprimir(
    @Param('id', ParseIntPipe) id: number,
    @EmpresaActual() idEmpresa: number,
  ) {
    const [r] = await this.flujo.paraImprimir([id], idEmpresa);
    if (!r) throw new ForbiddenException('Reposición no encontrada');
    return r;
  }

  @RequirePermissions('costeo.reposicion.ver')
  @Get(':id')
  obtener(
    @Param('id', ParseIntPipe) id: number,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.obtener(id, idEmpresa);
  }

  @RequirePermissions('costeo.reposicion.crear')
  @Post()
  crear(
    @Body() dto: CrearReposicionDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.crear(dto, usuario.sub, idEmpresa, usuario.permisos);
  }

  @RequirePermissions('costeo.reposicion.crear')
  @Patch(':id')
  corregir(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CorregirReposicionDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.corregir(id, dto, usuario.sub, idEmpresa);
  }

  @RequirePermissions('costeo.reposicion.anular')
  @Patch(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularReposicionDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.anular(id, dto, usuario.sub, idEmpresa);
  }
}
