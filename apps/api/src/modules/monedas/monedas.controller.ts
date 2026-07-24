import { Controller, Get, Query } from '@nestjs/common';
import { MonedasService } from './monedas.service';

@Controller('monedas')
export class MonedasController {
  constructor(private readonly monedasService: MonedasService) {}

  @Get()
  listar() {
    return this.monedasService.listar();
  }

  @Get('tasas-cambio')
  listarTasasCambio(
    @Query('idMonedaOrigen') idMonedaOrigen?: string,
    @Query('idMonedaDestino') idMonedaDestino?: string,
  ) {
    return this.monedasService.listarTasasCambio({
      idMonedaOrigen: idMonedaOrigen ? Number(idMonedaOrigen) : undefined,
      idMonedaDestino: idMonedaDestino ? Number(idMonedaDestino) : undefined,
    });
  }
}
