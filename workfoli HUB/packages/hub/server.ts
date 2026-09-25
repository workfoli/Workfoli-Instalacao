import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { InstanceError } from '../instance/fsutil.js';
import { HUB_ROOT } from '../instance/templates.js';
import { matchRoute, permissionFor } from './api.js';
import type { ApiContext } from './api.js';
import { audit } from './audit.js';
import { AuthError, hashToken, readSession } from './auth.js';
import { BaseUnavailableError } from './base-access.js';
import { now } from './db.js';
import { HttpError, SECURITY_HEADERS, hostAllowed, parseCookies, parseJson, readBody, safeEqual, send, sessionCookie, sessionCookieName } from './http.js';
import { can } from './permissions.js';
import { openRuntime } from './runtime.js';
import type { IntegrationOptions } from './integrations/env.js';
import { autoSync } from './integrations/sync.js';
import { VAULT_KEY_FILE } from './integrations/vault.js';
import type { Actor, HubRuntime } from './runtime.js';

export interface HubServer { url: string; port: number; runtime: HubRuntime; close(): Promise<void>; }
export interface StartOptions {
  instanceDir: string; port?: number; host?: string; webDir?: string; quiet?: boolean;
  /** Somente desenvolvimento: origem do servidor Vite (ex.: http://127.0.0.1:5174) autorizada a enviar mutações. */
  devOrigins?: string[];
  /** Somente testes: endereços falsos de provedores, fetch próprio, cofre em memória. */
  integrations?: IntegrationOptions;
}

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const STATIC_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

function statusFor(error: unknown): number {
  if (error instanceof HttpError || error instanceof AuthError) return error.status;
  if (error instanceof BaseUnavailableError) return 503;
  if (error instanceof InstanceError) return 400;
  if (error instanceof TypeError || error instanceof RangeError || error instanceof ReferenceError || error instanceof SyntaxError) return 500;
  if (error instanceof Error && 'code' in error) return 500;
  return error instanceof Error ? 400 : 500;
}

function serveStatic(req: IncomingMessage, res: ServerResponse, webDir: string, pathname: string) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Método não permitido.' });
  const index = path.join(webDir, 'index.html');
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { decoded = '/'; }
  const target = path.resolve(webDir, `.${decoded}`);
  const inside = target === webDir || target.startsWith(`${webDir}${path.sep}`);
  let file = index;
  if (inside && decoded !== '/' && fs.existsSync(target) && fs.lstatSync(target).isFile()) file = target;
  const ext = path.extname(file).toLowerCase();
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
  res.setHeader('Content-Type', STATIC_TYPES[ext] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.statusCode = 200;
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

const MISSING_BUILD = '<!doctype html><meta charset="utf-8"><title>Workfoli Hub</title><body style="font-family:sans-serif;background:#151716;color:#F5F5F1;padding:48px"><h1>Interface ainda não compilada</h1><p>Rode <code>npm run build:hub</code> na pasta do Workfoli Hub e recarregue.</p></body>';

function allowedHosts(host: string, port: number, publicUrl: string | null): Set<string> {
  const hosts = new Set<string>([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  if (host !== '0.0.0.0' && host !== '::') hosts.add(`${host.includes(':') ? `[${host}]` : host}:${port}`);
  else for (const addresses of Object.values(os.networkInterfaces())) for (const address of addresses ?? []) if (address.family === 'IPv4') hosts.add(`${address.address}:${port}`);
  if (publicUrl) { try { hosts.add(new URL(publicUrl).host.toLowerCase()); } catch { /* validado no contrato */ } }
  return hosts;
}

export async function startHubServer(options: StartOptions): Promise<HubServer> {
  const runtime = openRuntime(options.instanceDir, { integrations: options.integrations });
  const webDir = path.resolve(options.webDir ?? path.join(HUB_ROOT, 'dist-hub'));
  const host = options.host ?? runtime.config.server.host;
  const secureCookies = runtime.config.server.publicUrl?.startsWith('https://') ?? false;
  const cookieName = sessionCookieName(runtime.instance.file.instanceId);
  const devOrigins = new Set((options.devOrigins ?? []).filter(origin => /^http:\/\/(?:127\.0\.0\.1|localhost):\d{2,5}$/.test(origin)));
  let hosts = new Set<string>();

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (!hostAllowed(req.headers.host, hosts)) return send(res, 421, { error: 'Host não reconhecido por este Hub.' });
    const url = new URL(req.url ?? '/', 'http://hub.local');
    if (!url.pathname.startsWith('/api/')) {
      if (!fs.existsSync(path.join(webDir, 'index.html'))) { res.statusCode = 503; res.setHeader('Content-Type', 'text/html; charset=utf-8'); for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v); return res.end(MISSING_BUILD); }
      return serveStatic(req, res, webDir, url.pathname);
    }
    const found = matchRoute(req.method ?? 'GET', url.pathname);
    if (found === null) return send(res, 404, { error: 'Rota não encontrada.' });
    if (found === 'method') return send(res, 405, { error: 'Método não permitido.' });
    const { route, params } = found;
    const cookies: string[] = [];
    try {
      const mutating = MUTATING.has(req.method ?? 'GET');
      const origin = req.headers.origin;
      if (mutating && origin) {
        let originHost = '';
        try { originHost = new URL(origin).host.toLowerCase(); } catch { /* inválida */ }
        if (!hosts.has(originHost) && !devOrigins.has(origin)) throw new HttpError(403, 'Origem não permitida.');
      }
      const context: ApiContext = {
        runtime, actor: null, session: null, device: null, query: url.searchParams, body: {}, rawBody: null, headers: req.headers,
        ip: req.socket.remoteAddress ?? 'desconhecido',
        setCookie: (value, maxAge) => { cookies.push(sessionCookie(cookieName, value, { maxAgeSeconds: maxAge, secure: secureCookies })); },
        clearCookie: () => { cookies.push(sessionCookie(cookieName, '', { maxAgeSeconds: 0, secure: secureCookies })); },
      };
      if (route.options.auth === 'session') {
        const session = readSession(runtime.db, parseCookies(req.headers.cookie)[cookieName], runtime.config.security.idleMinutes);
        if (!session) throw new HttpError(401, 'Sua sessão terminou. Entre novamente.');
        if (mutating) {
          const csrf = req.headers['x-workfoli-csrf'];
          if (typeof csrf !== 'string' || !safeEqual(csrf, session.csrf)) throw new HttpError(403, 'Requisição sem verificação de segurança. Recarregue a página.');
        }
        const actor: Actor = { id: session.user.id, name: session.user.name, roleId: session.user.roleId, permissions: session.user.permissions };
        context.actor = actor;
        context.session = { tokenHash: session.tokenHash, csrf: session.csrf };
        const needed = permissionFor(route, params);
        if (needed && !can(actor.permissions, needed)) {
          audit(runtime.db, { type: 'user', id: actor.id }, 'access.denied', `${req.method} ${url.pathname}`.slice(0, 200), { permission: needed }, 'denied');
          throw new HttpError(403, 'Seu acesso não permite esta ação.');
        }
      } else if (route.options.auth === 'device') {
        const header = req.headers.authorization ?? '';
        const token = /^Bearer\s+([A-Za-z0-9_-]{40,200})$/.exec(header)?.[1];
        const device = token ? runtime.db.prepare('SELECT id,name FROM devices WHERE token_hash=? AND revoked_at IS NULL').get(hashToken(token)) as { id: string; name: string } | undefined : undefined;
        if (!device) throw new HttpError(401, 'Dispositivo não pareado ou revogado.');
        runtime.db.prepare('UPDATE devices SET last_seen_at=? WHERE id=?').run(now(), device.id);
        context.device = device;
      }
      if (mutating || req.method === 'PUT') {
        const limit = route.options.bodyLimit ?? 1024 * 1024;
        const body = await readBody(req, limit);
        if (route.options.rawBody) context.rawBody = body;
        else {
          if (body.length && !/^application\/json\b/i.test(String(req.headers['content-type'] ?? ''))) throw new HttpError(415, 'Envie JSON.');
          context.body = parseJson(body);
        }
      }
      const result = await route.handler(context, params);
      if (cookies.length) res.setHeader('Set-Cookie', cookies);
      send(res, 200, result);
    } catch (error) {
      const status = statusFor(error);
      // HttpError tem mensagem escrita pelo Core (inclusive 502 de provedor externo); o resto vira "erro interno".
      const controlled = error instanceof HttpError || error instanceof AuthError;
      if (status >= 500 && !controlled && !options.quiet) console.error('[workfoli-hub]', req.method, url.pathname, error);
      const message = status >= 500 && status !== 503 && !controlled ? 'Erro interno. Consulte o registro do Hub.' : (error as Error).message;
      const headers: Record<string, string> = {};
      if (status === 401 && route.options.auth === 'session') headers['Set-Cookie'] = sessionCookie(cookieName, '', { maxAgeSeconds: 0, secure: secureCookies });
      const extra = error instanceof HttpError ? { ...(error.code ? { code: error.code } : {}), ...(error.details ? { details: error.details } : {}) } : {};
      send(res, status, { error: message, ...extra }, headers);
    }
  };

  const server: Server = createServer((req, res) => { void handle(req, res); });
  server.headersTimeout = 30_000;
  server.requestTimeout = 120_000;
  const port = options.port ?? runtime.config.server.port;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });
  const actualPort = (server.address() as { port: number }).port;
  hosts = allowedHosts(host, actualPort, runtime.config.server.publicUrl);
  const displayHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  const url = runtime.config.server.publicUrl?.replace(/\/$/, '') ?? `http://${displayHost}:${actualPort}`;
  runtime.setOrigin(url);
  audit(runtime.db, { type: 'system', id: null }, 'hub.started', runtime.instance.file.instanceId, { port: actualPort, mode: runtime.config.mode });
  // Abre o cofre logo depois de subir (no Windows o DPAPI leva alguns segundos), para não travar o primeiro uso.
  if (fs.existsSync(path.join(runtime.instance.paths.secrets, VAULT_KEY_FILE)) || process.env.WORKFOLI_VAULT_KEY) {
    setImmediate(() => { try { runtime.integrations.vault(); } catch { /* o erro aparece ao usar a integração */ } });
  }
  // Sincronização periódica das integrações conectadas (somente o que está há mais de 6 h sem atualizar).
  let syncing = false;
  const timer = runtime.integrations.autoSync ? setInterval(() => {
    if (syncing) return;
    syncing = true;
    void autoSync(runtime).finally(() => { syncing = false; });
  }, 30 * 60_000) : null;
  timer?.unref();
  return {
    url, port: actualPort, runtime,
    close: () => new Promise<void>(resolve => {
      if (timer) clearInterval(timer);
      server.close(() => { runtime.close(); resolve(); });
      server.closeAllConnections();
    }),
  };
}
