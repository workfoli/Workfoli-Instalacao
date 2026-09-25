import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  /** `details` vai para o cliente junto com a mensagem: nunca coloque segredos ou dados de terceiros aqui. */
  constructor(readonly status: number, message: string, readonly code?: string, readonly details?: Record<string, unknown>) { super(message); }
}

export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
});

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export interface RawResponse { raw: true; status?: number; headers: Record<string, string>; body: Buffer | string; }
export const raw = (body: Buffer | string, headers: Record<string, string>, status = 200): RawResponse => ({ raw: true, status, headers, body });

export interface RouteDefinition<C> {
  method: Method; pattern: RegExp; keys: string[];
  handler: (context: C, params: Record<string, string>) => unknown | Promise<unknown>;
  options: RouteOptions;
}
export interface RouteOptions {
  /** public: sem sessão. session: usuário logado. device: Local Agent pareado. */
  auth: 'public' | 'session' | 'device';
  permission?: string;
  /** Corpo bruto (upload), com limite próprio. */
  rawBody?: boolean;
  bodyLimit?: number;
}

export function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const source = path.split('/').map(part => {
    if (part.startsWith(':')) { keys.push(part.slice(1)); return '([A-Za-z0-9_-]{1,80})'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return { pattern: new RegExp(`^${source}$`), keys };
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(name)) continue;
    try { cookies[name] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* malformed */ }
  }
  return cookies;
}

/**
 * Nome do cookie de sessão desta instalação. Navegadores não separam cookies por porta: dois Hubs na mesma
 * máquina (127.0.0.1:4870 e :4871) com o mesmo nome derrubariam a sessão um do outro a cada login.
 */
export function sessionCookieName(instanceId: string): string {
  return `wf_session_${createHash('sha256').update(instanceId).digest('hex').slice(0, 12)}`;
}

export function sessionCookie(name: string, value: string, options: { maxAgeSeconds: number; secure: boolean }): string {
  return [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${Math.max(0, Math.trunc(options.maxAgeSeconds))}`, ...(options.secure ? ['Secure'] : [])].join('; ');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > limit) throw new HttpError(413, 'Conteúdo maior que o permitido.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Conteúdo maior que o permitido.');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export function parseJson(buffer: Buffer): unknown {
  if (!buffer.length) return {};
  try { return JSON.parse(buffer.toString('utf8')) as unknown; } catch { throw new HttpError(400, 'JSON inválido.'); }
}

export function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  if (res.headersSent) return;
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  if (body && typeof body === 'object' && (body as RawResponse).raw === true) {
    const rawBody = body as RawResponse;
    res.statusCode = rawBody.status ?? status;
    for (const [key, value] of Object.entries(rawBody.headers)) res.setHeader(key, value);
    res.end(rawBody.body);
    return;
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body === undefined ? '{}' : JSON.stringify(body));
}

/**
 * Proteção contra DNS rebinding: o Hub local só atende nomes de host esperados.
 * Sem isso, uma página maliciosa poderia apontar um domínio para 127.0.0.1 e falar com o Hub.
 */
export function hostAllowed(hostHeader: string | undefined, allowed: ReadonlySet<string>): boolean {
  if (!hostHeader) return false;
  return allowed.has(hostHeader.toLowerCase());
}
