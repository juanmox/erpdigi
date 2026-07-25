import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BANGUAT_URL = 'https://www.banguat.gob.gt/variables/ws/TipoCambio.asmx';
const TC_CACHE_MS = 6 * 60 * 60 * 1000; // refrescar como máximo cada 6 horas

interface TipoCambioCache {
  tasa: number | null;
  fecha: string | null;
  fuente: 'Banguat' | 'cache' | 'respaldo' | null;
  obtenido: number;
}

@Injectable()
export class TipoCambioService {
  private readonly logger = new Logger(TipoCambioService.name);
  private cache: TipoCambioCache = {
    tasa: null,
    fecha: null,
    fuente: null,
    obtenido: 0,
  };
  private readonly fallback: number;

  constructor(config: ConfigService) {
    this.fallback = Number(config.get('TC_FALLBACK') ?? '7.61812');
  }

  private async consultarBanguat(): Promise<{
    tasa: number;
    fecha: string | null;
  }> {
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <TipoCambioDia xmlns="http://www.banguat.gob.gt/variables/ws/" />
  </soap12:Body>
</soap12:Envelope>`;

    const r = await fetch(BANGUAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
      body: soapBody,
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error('Banguat HTTP ' + r.status);
    const xml = await r.text();
    const mTasa = xml.match(/<referencia>([\d.]+)<\/referencia>/i);
    const mFecha = xml.match(/<fecha>([^<]+)<\/fecha>/i);
    if (!mTasa) throw new Error('No se encontró <referencia> en la respuesta');
    return { tasa: parseFloat(mTasa[1]), fecha: mFecha ? mFecha[1] : null };
  }

  async obtenerTipoCambio(): Promise<TipoCambioCache> {
    const ahora = Date.now();
    if (this.cache.tasa && ahora - this.cache.obtenido < TC_CACHE_MS) {
      return this.cache;
    }
    try {
      const { tasa, fecha } = await this.consultarBanguat();
      this.cache = { tasa, fecha, fuente: 'Banguat', obtenido: ahora };
      return this.cache;
    } catch (e) {
      this.logger.error(
        `Tipo de cambio: fallo al consultar Banguat: ${(e as Error).message}`,
      );
      if (this.cache.tasa) {
        return { ...this.cache, fuente: 'cache' };
      }
      return {
        tasa: this.fallback,
        fecha: null,
        fuente: 'respaldo',
        obtenido: ahora,
      };
    }
  }
}
