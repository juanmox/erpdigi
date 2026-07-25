import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { TipoCambioService } from './tipo-cambio.service';

@Controller('recetas/tipo-cambio')
export class TipoCambioController {
  constructor(private readonly tipoCambioService: TipoCambioService) {}

  @RequirePermissions('recetas.catalogo.ver')
  @Get()
  async obtener() {
    const tc = await this.tipoCambioService.obtenerTipoCambio();
    return { tasa: tc.tasa, fecha: tc.fecha, fuente: tc.fuente };
  }
}
