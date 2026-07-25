import {
  Body,
  Controller,
  Delete,
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
import {
  AgregarLineaRecetaDto,
  EditarLineaRecetaDto,
} from './dto/linea-receta.dto';
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
  minutosMo?: number;
  costoMoMinuto?: number;
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

  @RequirePermissions('recetas.importar')
  @Get('recetas-plantilla')
  async plantillaRecetas(@Res() res: Response) {
    const buffer = await this.productosService.plantillaRecetas();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="plantilla_recetas.xlsx"',
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

  @RequirePermissions('recetas.catalogo.ver')
  @Get('productos/:id/insumos')
  listarLineasReceta(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.listarLineasReceta(id);
  }

  @RequirePermissions('recetas.recetas.editar')
  @Post('productos/:id/insumos')
  agregarLineaReceta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AgregarLineaRecetaDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.productosService.agregarLineaReceta(id, dto, usuario.sub);
  }

  @RequirePermissions('recetas.recetas.editar')
  @Patch('productos/:id/insumos/:idLinea')
  editarLineaReceta(
    @Param('id', ParseIntPipe) id: number,
    @Param('idLinea', ParseIntPipe) idLinea: number,
    @Body() dto: EditarLineaRecetaDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.productosService.editarLineaReceta(
      id,
      idLinea,
      dto,
      usuario.sub,
    );
  }

  @RequirePermissions('recetas.recetas.editar')
  @Delete('productos/:id/insumos/:idLinea')
  eliminarLineaReceta(
    @Param('id', ParseIntPipe) id: number,
    @Param('idLinea', ParseIntPipe) idLinea: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.productosService.eliminarLineaReceta(id, idLinea, usuario.sub);
  }

  @RequirePermissions('recetas.importar')
  @Get('productos/:id/receta/exportar-plantilla')
  async exportarPlantillaReceta(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { buffer, codigo } =
      await this.productosService.exportarPlantillaReceta(id);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receta_${codigo}.xlsx"`,
    );
    res.send(buffer);
  }

  @RequirePermissions('recetas.importar')
  @Post('importar-recetas/preview')
  previewImportarRecetas(@Req() req: Request) {
    return this.productosService.previewImportarRecetas(req.body as Buffer);
  }

  @RequirePermissions('recetas.importar')
  @Post('importar-recetas/aplicar')
  aplicarImportarRecetas(
    @Body('productos') productos: AltaProductoBody[],
    @Body('receta')
    receta: {
      productoCodigo: string;
      insumoCodigo: string;
      consumo: number;
      area?: string | null;
    }[],
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.productosService.aplicarImportarRecetas(
      productos,
      receta,
      usuario.sub,
    );
  }
}
