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

/**
 * Catálogo de insumos, ahora del módulo Inventario (antes colgaba de Recetas).
 *
 * El costo es una cosa aparte del insumo: el bodeguero da de alta lo que entra
 * a bodega, pero no debe ver ni fijar cuánto cuesta. Dos permisos lo separan:
 *   · `inventario.costo.ver`    — el costo viaja en las respuestas.
 *   · `inventario.costo.editar` — se acepta un costo al crear/importar y se
 *     usan las rutas de precios.
 * Son permisos OPCIONALES dentro de rutas que exigen otro (`@RequirePermissions`
 * exige TODOS los que lista), así que se resuelven acá desde el token y se le
 * pasan al servicio como booleano. Sin ellos el costo simplemente no existe en
 * la respuesta, y uno que llegue en el cuerpo se descarta.
 */
@Controller('inventario/insumos')
export class InsumosController {
  constructor(private readonly insumosService: InsumosService) {}

  @RequirePermissions('inventario.insumo.ver')
  @Get()
  listar(
    @CurrentUser() usuario: JwtPayload,
    @Query('estado') estado?: 'activos' | 'inactivos' | 'todos',
  ) {
    return this.insumosService.listar(
      estado,
      usuario.permisos.includes('inventario.costo.ver'),
    );
  }

  // Los selectores de categoría y unidad del alta. Antes vivían en
  // `recetas/*` bajo `recetas.catalogo.ver`, que abre todo Recetas.
  @RequirePermissions('inventario.insumo.ver')
  @Get('categorias')
  categorias() {
    return this.insumosService.categorias();
  }

  @RequirePermissions('inventario.insumo.ver')
  @Get('unidades')
  unidades() {
    return this.insumosService.unidades();
  }

  // El archivo de precios es todo costo.
  @RequirePermissions('inventario.costo.ver')
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

  @RequirePermissions('inventario.insumo.importar')
  @Get('plantilla-alta')
  async plantillaAlta(
    @Res() res: Response,
    @CurrentUser() usuario: JwtPayload,
  ) {
    const buffer = await this.insumosService.plantillaAlta(
      usuario.permisos.includes('inventario.costo.editar'),
    );
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

  @RequirePermissions('inventario.costo.editar')
  @Get('plantilla-precios')
  async plantillaPrecios(@Res() res: Response) {
    const buffer = await this.insumosService.plantillaPrecios();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="plantilla_precios_insumos.xlsx"',
    );
    res.send(buffer);
  }

  @RequirePermissions('inventario.costo.editar')
  @Post('precios')
  guardarPrecios(
    @Body() dto: GuardarPreciosDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.insumosService.guardarPrecios(dto, usuario.sub);
  }

  @RequirePermissions('inventario.costo.editar')
  @Post('importar/preview')
  previewImportarPrecios(@Req() req: Request) {
    return this.insumosService.previewImportarPrecios(req.body as Buffer);
  }

  @RequirePermissions('inventario.insumo.importar')
  @Post('importar-altas/preview')
  previewImportarAltas(
    @Req() req: Request,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.insumosService.previewImportarAltas(
      req.body as Buffer,
      usuario.permisos.includes('inventario.costo.editar'),
    );
  }

  @RequirePermissions('inventario.insumo.importar')
  @Post('altas')
  altas(
    @Body('altas') altas: AltaInsumoBody[],
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.insumosService.altas(
      altas,
      usuario.sub,
      usuario.permisos.includes('inventario.costo.editar'),
    );
  }

  @RequirePermissions('inventario.insumo.crear')
  @Post()
  crear(@Body() dto: CrearInsumoDto, @CurrentUser() usuario: JwtPayload) {
    return this.insumosService.crear(
      dto,
      usuario.sub,
      usuario.permisos.includes('inventario.costo.editar'),
    );
  }

  @RequirePermissions('inventario.insumo.editar')
  @Patch(':id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarInsumoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.insumosService.editar(id, dto, usuario.sub);
  }

  @RequirePermissions('inventario.insumo.desactivar')
  @Patch(':id/activo')
  cambiarActivo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarActivoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.insumosService.cambiarActivo(id, dto, usuario.sub);
  }
}
