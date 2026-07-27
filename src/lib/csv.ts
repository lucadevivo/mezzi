/**
 * Serializzazione CSV per l'esportazione.
 *
 * Il separatore è il punto e virgola e i decimali hanno la virgola: è quello che
 * Excel italiano si aspetta, e un export che si apre storto non serve a niente.
 */

export type CsvValue = string | number | Date | null | undefined;

function escape(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return String(value).replace('.', ',');

  const text = String(value);
  // Virgolette raddoppiate, campo tra virgolette se contiene separatori o a capo.
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: readonly CsvValue[][]): string {
  const lines = [headers.map(escape).join(';'), ...rows.map((row) => row.map(escape).join(';'))];
  // BOM: senza, Excel apre gli accenti a caso.
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

/** Gli importi in centesimi si esportano in euro: nel foglio ci si fanno i conti. */
export const centsToEuro = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? null : cents / 100;
