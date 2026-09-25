import { looksLikeSecret } from '../../contract/workfoli-contract.mjs';
import type { CrmConfig, CrmCustomField, CrmEntity } from '../../contract/workfoli-contract.mjs';
import { HttpError } from '../http.js';
import type { HubDatabase } from '../db.js';

/** Validação de entrada do CRM. Mensagens nunca repetem o valor recebido. */

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/;
const CONTROL_LINE = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/;
export const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i;
export const PHONE = /^[+()\d\s.-]{6,40}$/;
export const PRIORITIES = ['low', 'normal', 'high'] as const;
export type Priority = typeof PRIORITIES[number];

export function text(value: unknown, label: string, max: number, options: { required?: boolean; multiline?: boolean } = {}): string | null {
  if (value === undefined || value === null || value === '') { if (options.required) throw new HttpError(400, `Informe ${label}.`); return null; }
  if (typeof value !== 'string') throw new HttpError(400, `${cap(label)} inválido.`);
  const clean = value.replace(/\r\n/g, '\n').trim().normalize('NFC');
  if (!clean) { if (options.required) throw new HttpError(400, `Informe ${label}.`); return null; }
  if (clean.length > max) throw new HttpError(400, `${cap(label)} ultrapassa ${max} caracteres.`);
  if ((options.multiline ? CONTROL : CONTROL_LINE).test(clean)) throw new HttpError(400, `${cap(label)} contém caracteres inválidos.`);
  if (looksLikeSecret(clean)) throw new HttpError(400, `${cap(label)} parece conter uma credencial. Segredos não vão para o CRM.`);
  return clean;
}

function cap(value: string): string {
  return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}

export function email(value: unknown): string | null {
  const clean = text(value, 'o e-mail', 254);
  if (clean && !EMAIL.test(clean)) throw new HttpError(400, 'E-mail inválido.');
  return clean ? clean.toLowerCase() : null;
}

export function phone(value: unknown): string | null {
  const clean = text(value, 'o telefone', 40);
  if (clean && (!PHONE.test(clean) || clean.replace(/\D/g, '').length < 8)) throw new HttpError(400, 'Telefone inválido.');
  return clean;
}

export function isoDate(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new HttpError(400, `${cap(label)} precisa ser uma data (AAAA-MM-DD).`);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (date.getUTCMonth() !== month! - 1) throw new HttpError(400, `${cap(label)} precisa ser uma data válida.`);
  return value;
}

export function dateTimeInput(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) throw new HttpError(400, `${cap(label)} inválida.`);
  const parsed = new Date(value);
  if (parsed.getTime() > Date.now() + 366 * 86_400_000) throw new HttpError(400, `${cap(label)} está distante demais no futuro.`);
  return parsed.toISOString();
}

export function url(value: unknown, label = 'o link'): string | null {
  const clean = text(value, label, 2048);
  if (!clean) return null;
  let parsed: URL;
  try { parsed = new URL(clean); } catch { throw new HttpError(400, `${cap(label)} inválido.`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new HttpError(400, `${cap(label)} precisa ser http(s), sem usuário ou senha.`);
  if (/[?&](?:token|key|secret|password|access_token|api_key|code)=/i.test(clean)) throw new HttpError(400, `${cap(label)} parece conter credencial.`);
  return clean;
}

/** Valor monetário em centavos (entrada em unidades da moeda: 1500.5 → 150050). */
export function money(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'string' && /^\d{1,13}(?:[.,]\d{1,2})?$/.test(value.trim()) ? Number(value.trim().replace(',', '.')) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 1e11) throw new HttpError(400, 'Valor inválido (use um número positivo).');
  return Math.round(number * 100);
}

export function priority(value: unknown, fallback: Priority = 'normal'): Priority {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !(PRIORITIES as readonly string[]).includes(value)) throw new HttpError(400, 'Prioridade inválida.');
  return value as Priority;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw new HttpError(400, `${cap(label)} inválido.`);
  return value as T;
}

export function activeUser(db: HubDatabase, value: unknown, label = 'Responsável'): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !db.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").get(value)) throw new HttpError(400, `${label} inválido.`);
  return value;
}

export function sourceId(value: unknown, sources: ReadonlyArray<{ id: string }>): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !sources.some(source => source.id === value)) throw new HttpError(400, 'Origem desconhecida. Cadastre novas origens na configuração do CRM.');
  return value;
}

export function tags(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 20) throw new HttpError(400, 'Etiquetas inválidas (até 20).');
  const out: string[] = [];
  for (const item of value) {
    const tag = text(item, 'a etiqueta', 40, { required: true })!;
    if (!out.some(existing => existing.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out;
}

const ATTRIBUTION_KEYS = ['provider', 'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm', 'gclid', 'fbclid',
  'campaignRef', 'campaignName', 'adSetRef', 'adSetName', 'adRef', 'adName', 'formRef', 'formName', 'landingPage', 'referrer'] as const;
export type Attribution = Partial<Record<typeof ATTRIBUTION_KEYS[number], string>>;

/** Atribuição (campanha → anúncio → lead). Metadado: chaves fora da lista são descartadas, valores curtos e sem controle. */
export function attribution(value: unknown): Attribution {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Atribuição inválida.');
  const out: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const item = (value as Record<string, unknown>)[key];
    if (item === undefined || item === null || item === '') continue;
    const clean = typeof item === 'number' ? String(item) : item;
    if (typeof clean !== 'string' || clean.length > 300 || CONTROL_LINE.test(clean) || looksLikeSecret(clean)) continue;
    out[key] = clean.trim();
  }
  return out;
}

function coerce(field: CrmCustomField, value: unknown): unknown {
  const label = `o campo "${field.label}"`;
  switch (field.type) {
    case 'text': return text(value, label, 500, { required: true });
    case 'textarea': return text(value, label, 5000, { required: true, multiline: true });
    case 'number': case 'currency': {
      const number = typeof value === 'string' && /^-?\d{1,13}(?:[.,]\d{1,6})?$/.test(value.trim()) ? Number(value.trim().replace(',', '.')) : value;
      if (typeof number !== 'number' || !Number.isFinite(number) || Math.abs(number) > 1e13) throw new HttpError(400, `${cap(label)} precisa ser um número.`);
      return field.type === 'currency' ? Math.round(number * 100) / 100 : number;
    }
    case 'date': return isoDate(value, label);
    case 'select': {
      if (typeof value !== 'string' || !field.options?.includes(value)) throw new HttpError(400, `Escolha uma opção válida para ${label}.`);
      return value;
    }
    case 'multiselect': {
      if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !field.options?.includes(item))) throw new HttpError(400, `Escolha opções válidas para ${label}.`);
      return [...new Set(value as string[])];
    }
    case 'checkbox': {
      if (typeof value !== 'boolean') throw new HttpError(400, `${cap(label)} precisa ser sim ou não.`);
      return value;
    }
    case 'email': {
      const clean = text(value, label, 254, { required: true })!;
      if (!EMAIL.test(clean)) throw new HttpError(400, `${cap(label)} precisa ser um e-mail.`);
      return clean.toLowerCase();
    }
    case 'phone': {
      const clean = text(value, label, 40, { required: true })!;
      if (!PHONE.test(clean)) throw new HttpError(400, `${cap(label)} precisa ser um telefone.`);
      return clean;
    }
    case 'url': return url(value, label);
    default: throw new HttpError(400, 'Tipo de campo desconhecido.');
  }
}

const isEmpty = (value: unknown) => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

/**
 * Campos personalizados definidos na Base. Valores de campos que saíram da configuração continuam
 * guardados (nada some), mas só campos configurados aceitam escrita.
 */
export function customValues(config: CrmConfig, entity: CrmEntity, input: unknown, current: Record<string, unknown>, options: { creating: boolean; enforceRequired?: boolean }): Record<string, unknown> {
  const fields = config.customFields.filter(field => field.entity === entity);
  const out: Record<string, unknown> = { ...current };
  if (input !== undefined && input !== null) {
    if (typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Campos personalizados inválidos.');
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const field = fields.find(item => item.id === key);
      if (!field) throw new HttpError(400, 'Campo personalizado desconhecido: use os campos configurados no CRM.');
      if (isEmpty(value)) delete out[key];
      else out[key] = coerce(field, value);
    }
  }
  const enforce = options.enforceRequired ?? true;
  if (enforce && (options.creating || (input !== undefined && input !== null))) {
    const missing = fields.filter(field => field.required && isEmpty(out[field.id]));
    if (missing.length) throw new HttpError(400, `Preencha: ${missing.map(field => field.label).join(', ')}.`, 'required-fields', { fields: missing.map(field => `custom.${field.id}`) });
  }
  return out;
}

export function parseJsonColumn(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

export function likePattern(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return `%${value.trim().slice(0, 80).replace(/[%_\\]/g, '\\$&')}%`;
}
