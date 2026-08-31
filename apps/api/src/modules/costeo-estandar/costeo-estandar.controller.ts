import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CosteoEstandarService } from './costeo-estandar.service';
import { AplicarImportarConsumoEstandarDto } from './dto/aplicar-importar.dto';
import { CrearConsumoEstandarDto } from './dto/crear-consumo-estandar.dto';

@Controller('costeo/estandar')
export class CosteoEstandarController {
  constructor(private readonly service: CosteoEstandarService) {}

  @RequirePermissions('costeo.estandar.ver')
  @Get()
  listar(
    @Query('producto') producto?: string,
    @Query('historial') historial?: string,
  ) {
    return this.service.listar(producto, historial === 'true');
  }

  @RequirePermissions('costeo.estandar.ver')
  @Get('plantilla-importar')
  async plantilla(@Res() res: Response) {
    const buffer = await this.service.plantillaImportar();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="plantilla_consumo_estandar.xlsx"',
    );
    res.send(buffer);
  }

  @RequirePermissions('costeo.estandar.administrar')
  @Post('importar/preview')
  previewImportar(@Req() req: Request) {
    return this.service.previewImportar(req.body as Buffer);
  }

  @RequirePermissions('costeo.estandar.administrar')
  @Post('importar/aplicar')
  // El cuerpo se tipa con una CLASE, no con la interfaz del preview: las
  // interfaces se borran al compilar, así que el ValidationPipe global no
  // validaba nada de lo que llegaba acá.
  aplicarImportar(
    @Body() dto: AplicarImportarConsumoEstandarDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.aplicarImportar(dto.filas, usuario.sub);
  }

  @RequirePermissions('costeo.estandar.administrar')
  @Post()
  crear(
    @Body() dto: CrearConsumoEstandarDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.crear(dto, usuario.sub);
  }
}
