import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type CorteConfig,
  esHoraDeCorte,
  motivoSemaforoInvalido,
  SEMAFORO_POR_DEFECTO,
  type SemaforoConfig,
  siguienteCorte,
} from '../../common/cortes-reposicion';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { CorteDto, SemaforoDto } from './dto/configuracion-cortes.dto';

type DbCortes = Pick<PrismaService, 'reposicionCorte'>;

/**
 * Cortes de requisiciones y minutos del semáforo, por empresa (2026-11-25).
 *
 * Los cortes y el semáforo viven en tablas propias de `costeo` y no en
 * `core.empresas`: son reglas del proceso de reposiciones, no de la empresa.
 */
@Injectable()
export class ReposicionesConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Los cortes de la empresa, ordenados por hora. */
  async cortes(
    idEmpresa: number,
    db: DbCortes = this.prisma,
  ): Promise<CorteConfig[]> {
    const filas = await db.reposicionCorte.findMany({
      where: { idEmpresa },
      orderBy: { hora: 'asc' },
    });
    return filas.map((c) => ({ hora: c.hora, dias: [...c.dias].sort() }));
  }

  /** Los minutos del semáforo; sin fila, los valores por defecto. */
  async semaforo(idEmpresa: number): Promise<SemaforoConfig> {
    const c = await this.prisma.reposicionConfiguracion.findUnique({
      where: { idEmpresa },
    });
    return c
      ? {
          minutosVerde: c.minutosVerde,
          minutosAmarillo: c.minutosAmarillo,
          minutosRecoger: c.minutosRecoger,
        }
      : { ...SEMAFORO_POR_DEFECTO };
  }

  async obtener(idEmpresa: number) {
    const [cortes, semaforo] = await Promise.all([
      this.cortes(idEmpresa),
      this.semaforo(idEmpresa),
    ]);
    return { cortes, semaforo };
  }

  /**
   * El corte al que va una reposición creada en `instante`. `null` si la empresa
   * no tiene cortes configurados (no se inventa uno).
   */
  async corteParaCreacion(
    idEmpresa: number,
    instante: Date,
    db: DbCortes = this.prisma,
  ): Promise<Date | null> {
    return siguienteCorte(instante, await this.cortes(idEmpresa, db));
  }

  /**
   * Reemplaza el CONJUNTO COMPLETO de cortes (no un delta: mandar un delta obliga a
   * distinguir "no lo mandé" de "lo quité", que es donde se cuelan los errores).
   * Aplica a las reposiciones que se creen de ahora en adelante: las ya creadas
   * conservan el corte que se les asignó.
   */
  async guardarCortes(
    cortes: CorteDto[],
    idUsuario: number,
    idEmpresa: number,
  ) {
    if (cortes.length === 0)
      throw new BadRequestException('Tiene que quedar al menos un corte.');
    const vistos = new Set<string>();
    const limpios = cortes.map((c) => {
      const hora = c.hora.trim();
      if (!esHoraDeCorte(hora))
        throw new BadRequestException(
          `"${c.hora}" no es una hora válida: usá el formato HH:MM, de 00:00 a 23:59.`,
        );
      if (vistos.has(hora))
        throw new BadRequestException(`El corte de las ${hora} está repetido.`);
      vistos.add(hora);
      const dias = [...new Set(c.dias)].sort();
      if (dias.length === 0)
        throw new BadRequestException(
          `El corte de las ${hora} tiene que atender al menos un día.`,
        );
      return { hora, dias };
    });

    const antes = await this.cortes(idEmpresa);
    await this.prisma.$transaction(async (tx) => {
      await tx.reposicionCorte.deleteMany({ where: { idEmpresa } });
      await tx.reposicionCorte.createMany({
        data: limpios.map((c) => ({ idEmpresa, ...c })),
      });
    });
    const despues = await this.cortes(idEmpresa);
    await this.auditoria.registrar({
      idUsuario,
      entidad: 'costeo.reposicion_corte',
      idEntidad: String(idEmpresa),
      accion: 'UPDATE',
      datosAnteriores: { cortes: antes },
      datosNuevos: { cortes: despues },
    });
    return this.obtener(idEmpresa);
  }

  async guardarSemaforo(
    dto: SemaforoDto,
    idUsuario: number,
    idEmpresa: number,
  ) {
    const nuevo: SemaforoConfig = {
      minutosVerde: dto.minutosVerde,
      minutosAmarillo: dto.minutosAmarillo,
      minutosRecoger: dto.minutosRecoger,
    };
    const motivo = motivoSemaforoInvalido(nuevo);
    if (motivo) throw new BadRequestException(motivo);

    const antes = await this.semaforo(idEmpresa);
    await this.prisma.reposicionConfiguracion.upsert({
      where: { idEmpresa },
      create: { idEmpresa, ...nuevo, actualizadoPor: idUsuario },
      update: {
        ...nuevo,
        actualizadoPor: idUsuario,
        actualizadoEn: new Date(),
      },
    });
    await this.auditoria.registrar({
      idUsuario,
      entidad: 'costeo.reposicion_configuracion',
      idEntidad: String(idEmpresa),
      accion: 'UPDATE',
      datosAnteriores: { ...antes },
      datosNuevos: { ...nuevo },
    });
    return this.obtener(idEmpresa);
  }
}
