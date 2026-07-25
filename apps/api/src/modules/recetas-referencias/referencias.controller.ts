import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ReferenciasService } from './referencias.service';

@RequirePermissions('recetas.catalogo.ver')
@Controller()
export class ReferenciasController {
  constructor(private readonly referenciasService: ReferenciasService) {}

  @Get('recetas/clientes')
  clientes() {
    return this.referenciasService.clientes();
  }

  @Get('recetas/tallas')
  tallas() {
    return this.referenciasService.tallas();
  }

  @Get('recetas/deportes')
  deportes() {
    return this.referenciasService.deportes();
  }

  @Get('recetas/areas-uso')
  areasUso() {
    return this.referenciasService.areasUso();
  }

  @Get('recetas/categorias-insumo')
  categoriasInsumo() {
    return this.referenciasService.categoriasInsumo();
  }

  @Get('recetas/unidades-medida')
  unidadesMedida() {
    return this.referenciasService.unidadesMedida();
  }
}
