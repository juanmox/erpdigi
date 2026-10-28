import { ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { BiService } from './bi.service';

const usuario = (permisos: string[]): JwtPayload => ({
  sub: 1,
  username: 'x',
  idEmpresa: 1,
  roles: [],
  permisos,
  minutosInactividad: 15,
});

describe('BiService: el interruptor plataforma.tableros.acceder', () => {
  const ENV = { ...process.env };

  beforeEach(() => {
    process.env.SUPERSET_URL = 'http://127.0.0.1:8088';
    process.env.SUPERSET_SERVICE_USER = 'erp_servicio';
    process.env.SUPERSET_SERVICE_PASSWORD = 'x';
    process.env.BI_TABLEROS = JSON.stringify({ produccion: 'uuid-1' });
  });
  afterEach(() => {
    process.env = { ...ENV };
  });

  it('con el permiso del tablero pero SIN el interruptor: no ve nada', () => {
    const r = new BiService().listar(usuario(['costeo.dashboard.ver']));
    expect(r.tableros).toEqual([]);
    expect(r.urlSuperset).toBeNull();
  });

  it('con el interruptor pero SIN permiso de tablero: tampoco ve nada', () => {
    const r = new BiService().listar(usuario(['plataforma.tableros.acceder']));
    expect(r.tableros).toEqual([]);
  });

  it('con las dos cosas: ve el tablero configurado', () => {
    const r = new BiService().listar(
      usuario(['plataforma.tableros.acceder', 'costeo.dashboard.ver']),
    );
    expect(r.tableros.map((t) => t.clave)).toEqual(['produccion']);
  });

  it('sin el interruptor no se emite token, aunque tenga el permiso del tablero', async () => {
    await expect(
      new BiService().emitirToken(usuario(['costeo.dashboard.ver']), 1, 'produccion'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
