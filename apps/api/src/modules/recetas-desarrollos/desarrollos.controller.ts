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
import {
  AgregarLineaRecetaDto,
  EditarLineaRecetaDto,
} from '../recetas-productos/dto/linea-receta.dto';
import {
  DesarrollosImportService,
  FilaPreviewDesarrollo,
  FilaPreviewInsumoDesarrollo,
} from './desarrollos-import.service';
import { DesarrollosService } from './desarrollos.service';
import { CrearDesarrolloDto } from './dto/crear-desarrollo.dto';
import { EditarDesarrolloDto } from './dto/editar-desarrollo.dto';
import { ListarDesarrollosDto } from './dto/listar-desarrollos.dto';

@Controller('recetas/desarrollos')
export class DesarrollosController {
  constructor(
    private readonly desarrollos: DesarrollosService,
    private readonly importar: DesarrollosImportService,
  ) {}

  @RequirePermissions('recetas.catalogo.ver')
  @Get()
  listar(@Query() dto: ListarDesarrollosDto) {
    return this.desarrollos.listar(dto);
  }

  @RequirePermissions('recetas.desarrollos.crear')
  @Post()
  crear(@Body() dto: CrearDesarrolloDto, @CurrentUser() usuario: JwtPayload) {
    return this.desarrollos.crear(dto, usuario.sub);
  }

  // ---------- Import masivo ----------
  // Antes de @Get(':id') a propósito: Nest resuelve por orden de declaración,
  // y 'plantilla-importar' caería en el parámetro :id.

  @RequirePermissions('recetas.importar')
  @Get('plantilla-importar')
  async plantillaImportar(@Res() res: Response) {
    const buffer = await this.importar.plantilla();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="plantilla_desarrollos.xlsx"',
    );
    res.send(buffer);
  }

  @RequirePermissions('recetas.importar')
  @Post('importar/preview')
  previewImportar(@Req() req: Request) {
    return this.importar.preview(req.body as Buffer);
  }

  @RequirePermissions('recetas.importar')
  @Post('importar/aplicar')
  aplicarImportar(
    @Body('desarrollos') desarrollos: FilaPreviewDesarrollo[],
    @Body('lineas') lineas: FilaPreviewInsumoDesarrollo[],
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.importar.aplicar(
      (desarrollos ?? []).map((d) => ({
        codigo: d.codigo,
        descripcion: d.descripcion,
        idCliente: d.idCliente,
        idTallaBase: d.idTallaBase,
        minutosMo: d.minutosMo,
        costoMoMinuto: d.costoMoMinuto,
        notas: d.notas,
      })),
      (lineas ?? []).map((l) => ({
        desarrolloCodigo: l.desarrolloCodigo,
        insumoCodigo: l.insumoCodigo,
        consumo: l.consumo as number,
        area: l.area,
      })),
      usuario.sub,
    );
  }

  @RequirePermissions('recetas.catalogo.ver')
  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.desarrollos.obtener(id);
  }

  @RequirePermissions('recetas.desarrollos.editar')
  @Patch(':id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarDesarrolloDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.desarrollos.editar(id, dto, usuario.sub);
  }

  @RequirePermissions('recetas.desarrollos.aprobar')
  @Post(':id/aprobar')
  aprobar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.desarrollos.aprobar(id, usuario.sub);
  }

  @RequirePermissions('recetas.desarrollos.aprobar')
  @Post(':id/reabrir')
  reabrir(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.desarrollos.reabrir(id, usuario.sub);
  }

  // ---------- Líneas de receta (BOM) ----------

  @RequirePermissions('recetas.catalogo.ver')
  @Get(':id/insumos')
  listarLineas(@Param('id', ParseIntPipe) id: number) {
    return this.desarrollos.listarLineas(id);
  }

  @RequirePermissions('recetas.recetas.editar')
  @Post(':id/insumos')
  agregarLinea(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AgregarLineaRecetaDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.desarrollos.agregarLinea(id, dto, usuario.sub);
  }

  @RequirePermissions('recetas.recetas.editar')
  @Patch(':id/insumos/:idLinea')
  editarLinea(
    @Param('id', ParseIntPipe) id: number,
    @Param('idLinea', ParseIntPipe) idLinea: number,
    @Body() dto: EditarLineaRecetaDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.desarrollos.editarLinea(id, idLinea, dto, usuario.sub);
  }

  @RequirePermissions('recetas.recetas.editar')
  @Delete(':id/insumos/:idLinea')
  eliminarLinea(
    @Param('id', ParseIntPipe) id: number,
    @Param('idLinea', ParseIntPipe) idLinea: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.desarrollos.eliminarLinea(id, idLinea, usuario.sub);
  }
}
