import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuditoriaService } from './auditoria.service';

@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @RequirePermissions('plataforma.auditoria.ver')
  @Get()
  listar(
    @Query('idEmpresa') idEmpresa?: string,
    @Query('entidad') entidad?: string,
  ) {
    return this.auditoriaService.listar({
      idEmpresa: idEmpresa ? Number(idEmpresa) : undefined,
      entidad,
    });
  }
}
