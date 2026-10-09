import { Controller, Get, Query } from '@nestjs/common';
import { EmpresaActual } from '../auth/decorators/empresa-actual.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuditoriaService } from './auditoria.service';
import { ListarAuditoriaDto } from './dto/listar-auditoria.dto';

@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  /**
   * La empresa sale del token y NO del query, a diferencia de antes: la
   * bitácora de una empresa no se mira desde otra. Es el mismo criterio que
   * el resto de Costeo desde la separación por empresa.
   */
  @RequirePermissions('plataforma.auditoria.ver')
  @Get()
  listar(@Query() dto: ListarAuditoriaDto, @EmpresaActual() idEmpresa: number) {
    return this.auditoriaService.listar({ ...dto, idEmpresa });
  }

  @RequirePermissions('plataforma.auditoria.ver')
  @Get('filtros')
  filtros(@EmpresaActual() idEmpresa: number) {
    return this.auditoriaService.filtros(idEmpresa);
  }
}
