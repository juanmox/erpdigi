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
import { CambiarActivoProductoDto } from './dto/cambiar-activo-producto.dto';
import { CrearProductoDto } from './dto/crear-producto.dto';
import { EditarProductoDto } from './dto/editar-producto.dto';
import { ListarProductosDto } from './dto/listar-productos.dto';
import { ProductosService } from './productos.service';

interface AltaProductoBody {
  codigo: string;
  descripcion: string;
  idCliente?: number | null;
  desarrollo?: string | null;
  patron?: string | null;
  tamano?: string | null;
  deporte?: string | null;
  precioVenta?: number;
}

@Controller('recetas')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @RequirePermissions('recetas.catalogo.ver')
  @Get('productos')
  listar(@Query() dto: ListarProductosDto) {
    return this.productosService.listar(dto);
  }

  @RequirePermissions('recetas.catalogo.ver')
  @Get('filtros')
  filtros(@Query() dto: ListarProductosDto) {
    return this.productosService.filtros(dto);
  }

  @RequirePermissions('recetas.catalogo.ver')
  @Get('productos/export')
  async exportar(@Query() dto: ListarProductosDto, @Res() res: Response) {
    const buffer = await this.productosService.exportarExcel(dto);
    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="productos_${fecha}.xlsx"`,
    );
    res.send(buffer);
  }

  @RequirePermissions('recetas.productos.crear')
  @Get('productos/plantilla-alta')
  async plantillaAlta(@Res() res: Response) {
    const buffer = await this.productosService.plantillaAlta();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="plantilla_alta_productos.xlsx"',
    );
    res.send(buffer);
  }

  @RequirePermissions('recetas.catalogo.ver')
  @Get('productos/:codigo/receta')
  receta(@Param('codigo') codigo: string) {
    return this.productosService.recetaPublica(codigo);
  }

  @RequirePermissions('recetas.productos.crear')
  @Post('productos')
  crear(@Body() dto: CrearProductoDto, @CurrentUser() usuario: JwtPayload) {
    return this.productosService.crear(dto, usuario.sub);
  }

  @RequirePermissions('recetas.productos.editar')
  @Patch('productos/:id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarProductoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.productosService.editar(id, dto, usuario.sub);
  }

  @RequirePermissions('recetas.productos.desactivar')
  @Patch('productos/:id/activo')
  cambiarActivo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarActivoProductoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.productosService.cambiarActivo(id, dto, usuario.sub);
  }

  @RequirePermissions('recetas.importar')
  @Post('productos/importar-altas/preview')
  previewImportarAltas(@Req() req: Request) {
    return this.productosService.previewImportarAltas(req.body as Buffer);
  }

  @RequirePermissions('recetas.importar')
  @Post('productos/altas')
  altas(
    @Body('altas') altas: AltaProductoBody[],
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.productosService.altas(altas, usuario.sub);
  }

  // ---------- Líneas de receta ----------
  //
  // ELIMINADAS (2026-08-26). La receta ya no pertenece al Producto sino a su
  // Desarrollo: ver recetas-desarrollos/desarrollos.controller.ts
  // (GET/POST/PATCH/DELETE /recetas/desarrollos/:id/insumos).
  // Dejarlas vivas habría sido peor que borrarlas: seguirían escribiendo en
  // recetas.producto_insumos, que quedó congelada y que ya nadie lee para
  // calcular costos — pérdida silenciosa de datos.

  // ELIMINADA (2026-08-26): exportar-plantilla armaba su hoja "Receta" desde
  // recetas.producto_insumos, congelada al mudar el BOM al Desarrollo —
  // entregaba la receta VIEJA y al re-importarse escribía en la tabla muerta.
  // Vuelve como "exportar desarrollo" al convertir el flujo (plan, sección F).
}
