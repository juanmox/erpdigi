import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CatalogosProductoService } from './catalogos-producto.service';
import {
  CrearCatalogoProductoDto,
  EditarCatalogoProductoDto,
} from './dto/catalogo-producto.dto';

/**
 * Catálogos que describen al producto: estilos, líneas, géneros, composiciones.
 * Ver `recetas.estilos` en la migración 20261023160000.
 *
 * Leer: `recetas.catalogo.ver` (alimenta los selectores). Dar de alta, renombrar
 * o retirar: `recetas.productos.editar`, el mismo permiso que ya edita productos
 * — no se crea uno nuevo para que nadie tenga que volver a iniciar sesión.
 */
@Controller('recetas/catalogos-producto')
export class CatalogosProductoController {
  constructor(private readonly service: CatalogosProductoService) {}

  @RequirePermissions('recetas.catalogo.ver')
  @Get(':tipo')
  listar(@Param('tipo') tipo: string) {
    return this.service.listar(tipo);
  }

  @RequirePermissions('recetas.productos.editar')
  @Post(':tipo')
  crear(
    @Param('tipo') tipo: string,
    @Body() dto: CrearCatalogoProductoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.crear(tipo, dto.nombre, usuario.sub);
  }

  @RequirePermissions('recetas.productos.editar')
  @Patch(':tipo/:id')
  editar(
    @Param('tipo') tipo: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarCatalogoProductoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.editar(tipo, id, dto, usuario.sub);
  }
}
