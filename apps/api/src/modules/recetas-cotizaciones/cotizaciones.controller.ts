import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CotizacionesService } from './cotizaciones.service';
import { CrearCotizacionDto } from './dto/crear-cotizacion.dto';
import { ResumenMaterialDto } from './dto/resumen-material.dto';

@Controller('recetas')
export class CotizacionesController {
  constructor(private readonly cotizacionesService: CotizacionesService) {}

  @RequirePermissions('recetas.cotizaciones.crear')
  @Post('cotizaciones')
  @HttpCode(201)
  crear(@Body() dto: CrearCotizacionDto) {
    return this.cotizacionesService.crear(dto);
  }

  @RequirePermissions('recetas.cotizaciones.ver')
  @Get('cotizaciones')
  listar() {
    return this.cotizacionesService.listar();
  }

  @RequirePermissions('recetas.cotizaciones.ver')
  @Get('cotizaciones/:id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.cotizacionesService.obtener(id);
  }

  @RequirePermissions('recetas.catalogo.ver')
  @Post('resumen-material')
  @HttpCode(200)
  resumenMaterial(@Body() dto: ResumenMaterialDto) {
    return this.cotizacionesService.resumenMaterial(dto);
  }
}
