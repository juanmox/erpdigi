import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CambiarActivoDto } from './dto/cambiar-activo.dto';
import { CrearInsumoDto } from './dto/crear-insumo.dto';
import { EditarInsumoDto } from './dto/editar-insumo.dto';
import { GuardarPreciosDto } from './dto/guardar-precios.dto';
import { InsumosService } from './insumos.service';

interface AltaInsumoBody {
  codigo: string;
  descripcion: string;
  idCategoria: number;
  idUnidad: number;
  costoPromedio?: number;
}

@Controller('recetas/insumos')
export class InsumosController {
  constructor(private readonly insumosService: InsumosService) {}

  @RequirePermissions('recetas.catalogo.ver')
  @Get()
  listar(@Query('estado') estado?: 'activos' | 'inactivos' | 'todos') {
    return this.insumosService.listar(estado);
  }

  @RequirePermissions('recetas.catalogo.ver')
  @Get('export')
  async exportar(@Res() res: Response) {
    const buffer = await this.insumosService.exportarExcel();
    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="insumos_${fecha}.xlsx"`,
    );
    res.send(buffer);
  }

  @RequirePermissions('recetas.insumos.crear')
  @Get('plantilla-alta')
  async plantillaAlta(@Res() res: Response) {
    const buffer = await this.insumosService.plantillaAlta();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="plantilla_alta_insumos.xlsx"',
    );
    res.send(buffer);
  }

  @RequirePermissions('recetas.insumos.editar')
  @Post('precios')
  guardarPrecios(
    @Body() dto: GuardarPreciosDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.insumosService.guardarPrecios(dto, usuario.sub);
  }

  @RequirePermissions('recetas.insumos.editar')
  @Post('importar/preview')
  previewImportarPrecios(@Req() req: Request) {
    return this.insumosService.previewImportarPrecios(req.body as Buffer);
  }

  @RequirePermissions('recetas.importar')
  @Post('importar-altas/preview')
  previewImportarAltas(@Req() req: Request) {
    return this.insumosService.previewImportarAltas(req.body as Buffer);
  }

  @RequirePermissions('recetas.importar')
  @Post('altas')
  altas(
    @Body('altas') altas: AltaInsumoBody[],
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.insumosService.altas(altas, usuario.sub);
  }

  @RequirePermissions('recetas.insumos.crear')
  @Post()
  crear(@Body() dto: CrearInsumoDto, @CurrentUser() usuario: JwtPayload) {
    return this.insumosService.crear(dto, usuario.sub);
  }

  @RequirePermissions('recetas.insumos.editar')
  @Patch(':id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarInsumoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.insumosService.editar(id, dto, usuario.sub);
  }

  @RequirePermissions('recetas.insumos.desactivar')
  @Patch(':id/activo')
  cambiarActivo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarActivoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.insumosService.cambiarActivo(id, dto, usuario.sub);
  }
}
