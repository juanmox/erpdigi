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
  siguienteNumero(@Query('codigoOp') codigoOp: string) {
    return this.service.siguienteNumero(codigoOp);
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
  listar(@Query('idOrdenProduccion') idOrdenProduccion?: string) {
    return this.service.listar(
      idOrdenProduccion ? Number(idOrdenProduccion) : undefined,
    );
  }

  @RequirePermissions('costeo.reposicion.ver')
  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtener(id);
  }

  @RequirePermissions('costeo.reposicion.crear')
  @Post()
  crear(@Body() dto: CrearReposicionDto, @CurrentUser() usuario: JwtPayload) {
    return this.service.crear(dto, usuario.sub);
  }

  @RequirePermissions('costeo.reposicion.anular')
  @Patch(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularReposicionDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.anular(id, dto, usuario.sub);
  }
}
