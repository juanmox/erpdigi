import { Injectable, Logger } from '@nestjs/common';
import { google, sheets_v4 } from 'googleapis';

// Mismo formato de texto que ya usaba Utilities.formatDate(fecha, tz,
// "dd/MM/yyyy HH:mm") en el Código.gs legacy — hay que igualarlo exacto para
// no romper el parseo de fecha que ya tienen los Dashboards de Data Studio.
const formatterFechaSheets = new Intl.DateTimeFormat('es-GT', {
  timeZone: 'America/Guatemala',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatearFechaSheets(fecha: Date): string {
  const partes = Object.fromEntries(
    formatterFechaSheets.formatToParts(fecha).map((p) => [p.type, p.value]),
  );
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}

// Espejo hacia los dos Google Sheets legacy (Forma 1, "Código.gs") que
// todavía alimentan los Dashboards de Google Data Studio mientras se migra
// del todo — ver CLAUDE.md. Postgres es la fuente de verdad: si esto falla
// (credenciales faltantes, cuota de Google, red), nunca debe bloquear ni
// revertir el guardado real, solo se registra el error (confirmado con el
// usuario).
@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private client: sheets_v4.Sheets | null | undefined;

  // GoogleAuth/google.sheets() no hacen I/O al construirse (el token recién
  // se pide en la primera llamada real) — no hace falta que esto sea async.
  private getClient(): sheets_v4.Sheets | null {
    if (this.client !== undefined) return this.client;
    const keyFile = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH;
    if (!keyFile) {
      this.logger.warn(
        'GOOGLE_SHEETS_CREDENTIALS_PATH no configurado — se omite el espejo a Google Sheets',
      );
      this.client = null;
      return this.client;
    }
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.client = google.sheets({ version: 'v4', auth });
    return this.client;
  }

  // Agrega una fila al final de la hoja indicada. Nunca lanza — cualquier
  // error queda solo en el log del servidor.
  async agregarFila(
    spreadsheetId: string | undefined,
    hoja: string,
    valores: (string | number)[],
  ): Promise<void> {
    if (!spreadsheetId) {
      this.logger.warn(
        `agregarFila("${hoja}") sin spreadsheetId — revisar GOOGLE_SHEETS_ID_* en .env y en env.validation.ts`,
      );
      return;
    }
    try {
      const client = this.getClient();
      if (!client) return;
      await client.spreadsheets.values.append({
        spreadsheetId,
        range: `${hoja}!A:A`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [valores] },
      });
    } catch (err) {
      this.logger.error(
        `Error al escribir en Google Sheets (${spreadsheetId}, hoja "${hoja}"): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
