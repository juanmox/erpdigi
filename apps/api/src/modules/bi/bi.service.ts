import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { PERMISO_EXPORTAR, TABLEROS, type DefinicionTablero } from './tableros';

export interface TableroVisible {
  clave: string;
  titulo: string;
  descripcion: string;
  /** UUID embebido en Superset: lo necesita el SDK del navegador para montar el iframe. */
  uuid: string;
  /** ¿Mostrar el menú de descarga en este tablero? Control de pantalla, ver `tableros.ts`. */
  permiteDescarga: boolean;
}

export interface ListadoTableros {
  /** ¿Está configurado Superset? Sin eso el menú "Dashboards" no se muestra. */
  configurado: boolean;
  /** Dirección de Superset tal como la ve el NAVEGADOR (puede diferir de la de la API). */
  urlSuperset: string | null;
  tableros: TableroVisible[];
}

const TIMEOUT_MS = 10_000;
/** El token de servicio de Superset dura 15 min por defecto; se renueva antes. */
const VIDA_TOKEN_SERVICIO_MS = 10 * 60 * 1000;

/**
 * Puente entre los permisos del ERP y los tableros de Superset.
 *
 * El navegador NUNCA recibe credenciales de Superset: solo un "guest token" de
 * corta vida, emitido acá, que (1) habilita un único tablero y (2) lleva una
 * regla por fila con la empresa de la sesión. Así quien no tiene el permiso no
 * obtiene token, y quien lo tiene no puede ver datos de otra empresa aunque
 * manipule el iframe.
 */
@Injectable()
export class BiService {
  private readonly logger = new Logger(BiService.name);
  private tokenServicio: { valor: string; vence: number } | null = null;

  /** Lee el entorno en cada llamada: es barato y evita arrastrar un valor viejo. */
  private config() {
    const url = process.env.SUPERSET_URL?.replace(/\/+$/, '');
    const urlPublica = (process.env.SUPERSET_PUBLIC_URL ?? url)?.replace(
      /\/+$/,
      '',
    );
    const usuario = process.env.SUPERSET_SERVICE_USER;
    const clave = process.env.SUPERSET_SERVICE_PASSWORD;
    let uuids: Record<string, string> = {};
    try {
      if (process.env.BI_TABLEROS) {
        const parsed: unknown = JSON.parse(process.env.BI_TABLEROS);
        if (parsed && typeof parsed === 'object') {
          uuids = Object.fromEntries(
            Object.entries(parsed).filter(
              (e): e is [string, string] => typeof e[1] === 'string' && !!e[1],
            ),
          );
        }
      }
    } catch {
      this.logger.warn('BI_TABLEROS no es un JSON válido — se ignora');
    }
    return { url, urlPublica, usuario, clave, uuids };
  }

  listar(usuario: JwtPayload): ListadoTableros {
    const c = this.config();
    const configurado = !!(c.url && c.usuario && c.clave);
    if (!configurado) {
      return {
        configurado: false,
        urlSuperset: null,
        tableros: [],
      };
    }
    const puedeExportar = usuario.permisos.includes(PERMISO_EXPORTAR);
    const tableros = TABLEROS.filter(
      (t) => usuario.permisos.includes(t.permiso) && c.uuids[t.clave],
    ).map((t) => ({
      clave: t.clave,
      titulo: t.titulo,
      descripcion: t.descripcion,
      uuid: c.uuids[t.clave],
      permiteDescarga: puedeExportar && !t.sinDescarga,
    }));
    return {
      configurado: true,
      urlSuperset: c.urlPublica ?? null,
      tableros,
    };
  }

  async emitirToken(
    usuario: JwtPayload,
    idEmpresa: number,
    clave: string,
  ): Promise<{ token: string }> {
    const def = TABLEROS.find((t) => t.clave === clave);
    const c = this.config();
    // Tablero desconocido o sin UUID configurado: para el cliente es lo mismo,
    // "no existe". No se revela cuáles hay.
    if (!def || !c.uuids[clave] || !c.url) {
      throw new NotFoundException('Ese dashboard no existe');
    }
    if (!usuario.permisos.includes(def.permiso)) {
      throw new ForbiddenException('No tenés permiso para ver este dashboard');
    }
    // La regla por fila es SQL que se concatena: solo entra un entero verificado.
    if (!Number.isInteger(idEmpresa) || idEmpresa <= 0) {
      throw new ForbiddenException('Empresa de la sesión inválida');
    }
    try {
      return {
        token: await this.pedirGuestToken(
          def,
          c.uuids[clave],
          usuario,
          idEmpresa,
        ),
      };
    } catch (e) {
      // Un 401 de Superset es el token de servicio vencido: se renueva y se
      // reintenta una sola vez. Cualquier otra falla no se reintenta.
      if (e instanceof ErrorSuperset && e.estado === 401) {
        this.tokenServicio = null;
        try {
          return {
            token: await this.pedirGuestToken(
              def,
              c.uuids[clave],
              usuario,
              idEmpresa,
            ),
          };
        } catch (e2) {
          return this.fallar(e2);
        }
      }
      return this.fallar(e);
    }
  }

  private fallar(e: unknown): never {
    // El detalle va al log; al navegador solo un mensaje genérico.
    this.logger.error(
      `No se pudo emitir el acceso al tablero: ${e instanceof Error ? e.message : String(e)}`,
    );
    throw new ServiceUnavailableException(
      'Los dashboards no están disponibles en este momento. Intentá de nuevo en unos minutos.',
    );
  }

  private async pedirGuestToken(
    def: DefinicionTablero,
    uuid: string,
    usuario: JwtPayload,
    idEmpresa: number,
  ): Promise<string> {
    const c = this.config();
    const base = c.url!;
    const bearer = await this.loginServicio(base);

    // El POST a guest_token exige CSRF: se pide el token y se reenvía junto con
    // la cookie de sesión que Superset asocia a él.
    const csrfResp = await this.http(`${base}/api/v1/security/csrf_token/`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    const csrf = ((await csrfResp.json()) as { result?: string }).result;
    const cookies = csrfResp.headers
      .getSetCookie()
      .map((x) => x.split(';')[0])
      .join('; ');
    if (!csrf) throw new Error('Superset no devolvió token CSRF');

    const cuerpo = {
      user: {
        username: usuario.username,
        first_name: usuario.username,
        last_name: `empresa-${idEmpresa}`,
      },
      resources: [{ type: 'dashboard', id: uuid }],
      rls: def.filtraPorEmpresa
        ? [{ clause: `id_empresa = ${idEmpresa}` }]
        : [],
    };
    const resp = await this.http(`${base}/api/v1/security/guest_token/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        'X-CSRFToken': csrf,
        Cookie: cookies,
        Referer: base,
      },
      body: JSON.stringify(cuerpo),
    });
    const token = ((await resp.json()) as { token?: string }).token;
    if (!token) throw new Error('Superset no devolvió el guest token');
    return token;
  }

  private async loginServicio(base: string): Promise<string> {
    const ahora = Date.now();
    if (this.tokenServicio && this.tokenServicio.vence > ahora) {
      return this.tokenServicio.valor;
    }
    const c = this.config();
    const resp = await this.http(`${base}/api/v1/security/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: c.usuario,
        password: c.clave,
        provider: 'db',
        refresh: false,
      }),
    });
    const valor = ((await resp.json()) as { access_token?: string })
      .access_token;
    if (!valor) throw new Error('Superset no devolvió access_token');
    this.tokenServicio = { valor, vence: ahora + VIDA_TOKEN_SERVICIO_MS };
    return valor;
  }

  private async http(url: string, init: RequestInit): Promise<Response> {
    const resp = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) {
      throw new ErrorSuperset(
        resp.status,
        `${init.method ?? 'GET'} ${url} → ${resp.status}`,
      );
    }
    return resp;
  }
}

class ErrorSuperset extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}
