import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ActualizarEmpresaDto } from './dto/actualizar-empresa.dto';
import { CrearEmpresaDto } from './dto/crear-empresa.dto';

@Injectable()
export class EmpresasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  listar() {
    return this.prisma.empresa.findMany({ orderBy: { razonSocial: 'asc' } });
  }

  async obtener(idEmpresa: number) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { idEmpresa },
    });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    return empresa;
  }

  async crear(dto: CrearEmpresaDto, idUsuarioActor: number) {
    const empresa = await this.prisma.empresa.create({ data: dto });
    await this.auditoria.registrar({
      idEmpresa: empresa.idEmpresa,
      idUsuario: idUsuarioActor,
      entidad: 'empresas',
      idEntidad: String(empresa.idEmpresa),
      accion: 'CREATE',
      datosNuevos: empresa,
    });
    return empresa;
  }

  async actualizar(
    idEmpresa: number,
    dto: ActualizarEmpresaDto,
    idUsuarioActor: number,
  ) {
    const anterior = await this.obtener(idEmpresa);
    const empresa = await this.prisma.empresa.update({
      where: { idEmpresa },
      data: dto,
    });
    await this.auditoria.registrar({
      idEmpresa,
      idUsuario: idUsuarioActor,
      entidad: 'empresas',
      idEntidad: String(idEmpresa),
      accion: 'UPDATE',
      datosAnteriores: anterior,
      datosNuevos: empresa,
    });
    return empresa;
  }

  async desactivar(idEmpresa: number, idUsuarioActor: number) {
    const anterior = await this.obtener(idEmpresa);
    const empresa = await this.prisma.empresa.update({
      where: { idEmpresa },
      data: { activo: false },
    });
    await this.auditoria.registrar({
      idEmpresa,
      idUsuario: idUsuarioActor,
      entidad: 'empresas',
      idEntidad: String(idEmpresa),
      accion: 'UPDATE',
      datosAnteriores: anterior,
      datosNuevos: empresa,
    });
    return empresa;
  }
}
