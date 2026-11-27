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

  @Get('recetas/subclientes')
  subclientes() {
    return this.referenciasService.subclientes();
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
  // Categorías de insumo y unidades de medida ya no están acá: son del
  // catálogo de insumos de Inventario (`inventario/insumos/categorias` y
  // `/unidades`, bajo `inventario.insumo.ver`).
}
