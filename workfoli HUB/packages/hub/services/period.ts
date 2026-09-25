import { HttpError } from '../http.js';
import type { HubRuntime } from '../runtime.js';

/** Período de relatório em dias do fuso da empresa (datas inclusivas), com os limites em UTC para consultas. */
export interface Period { from: string; to: string; days: number; startUtc: string; endUtc: string; timeZone: string; }

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function companyTimeZone(runtime: HubRuntime): string {
  try { return runtime.base.snapshot().manifest.company.timezone; } catch { return 'America/Sao_Paulo'; }
}

function offsetMinutes(timeZone: string, instant: Date): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant).map(part => [part.type, part.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** Início do dia `day` no fuso indicado, como instante UTC ISO. */
export function dayStartUtc(day: string, timeZone: string): string {
  const guess = new Date(`${day}T00:00:00Z`);
  return new Date(guess.getTime() - offsetMinutes(timeZone, guess) * 60_000).toISOString();
}

export function today(timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function resolvePeriod(runtime: HubRuntime, input: { from?: unknown; to?: unknown }, defaultDays = 30): Period {
  const timeZone = companyTimeZone(runtime);
  const valid = (value: unknown): value is string => typeof value === 'string' && DAY.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
  const to = valid(input.to) ? input.to : today(timeZone);
  const from = valid(input.from) ? input.from : addDays(to, -(defaultDays - 1));
  if (from > to) throw new HttpError(400, 'O início do período precisa ser antes do fim.');
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > 731) throw new HttpError(400, 'Período máximo: 2 anos.');
  return { from, to, days, startUtc: dayStartUtc(from, timeZone), endUtc: dayStartUtc(addDays(to, 1), timeZone), timeZone };
}
