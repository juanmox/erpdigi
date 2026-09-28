import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EmpresaActual } from '../auth/decorators/empresa-actual.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CosteoReposicionesService } from './costeo-reposiciones.service';
import { AnularReposicionDto } from './dto/anular-reposicion.dto';
import { CrearReposicionDto } from './dto/crear-reposicion.dto';

@Controller('costeo/reposiciones')
export class CosteoReposicionesController {
  constructor(private readonly service: CosteoReposicionesService) {}

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
  @Get('calandras')
  calandras() {
    return this.service.listarCalandras();
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
    // Permiso OPCIONAL: no puede ir en @RequirePermissions, que exige TODOS
    // los que lista. Se resuelve acá y el servicio decide con él.
    return this.service.crear(
      dto,
      usuario.sub,
      idEmpresa,
      usuario.permisos.includes('costeo.reposicion.impresora_sin_rollo'),
    );
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
