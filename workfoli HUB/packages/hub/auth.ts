import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';
import type { HubDatabase } from './db.js';
import { now, transaction } from './db.js';

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 } as const;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCallback(password, salt, keylen, options, (error, key) => error ? reject(error) : resolve(key)));
}

export function validatePassword(password: unknown): string {
  if (typeof password !== 'string') throw new AuthError('Informe uma senha.');
  if (password.length < 10) throw new AuthError('Use uma senha com pelo menos 10 caracteres.');
  if (password.length > 256) throw new AuthError('Use uma senha com até 256 caracteres.');
  if (/^(.)\1+$/u.test(password)) throw new AuthError('Escolha uma senha menos previsível.');
  return password;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFC'), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem });
  return `scrypt$${Math.log2(SCRYPT.N)}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  // Mesmo sem usuário, gastar o custo do scrypt reduz a diferença de tempo entre contas existentes e inexistentes.
  const parts = (stored ?? '').split('$');
  const valid = parts.length === 6 && parts[0] === 'scrypt';
  const logN = valid ? Number(parts[1]) : 15, r = valid ? Number(parts[2]) : 8, p = valid ? Number(parts[3]) : 1;
  if (!Number.isInteger(logN) || logN < 10 || logN > 20 || !Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 16) return false;
  const salt = valid ? Buffer.from(parts[4]!, 'base64') : randomBytes(16);
  const expected = valid ? Buffer.from(parts[5]!, 'base64') : randomBytes(32);
  const key = await scrypt(password.normalize('NFC'), salt, expected.length || 32, { N: 2 ** logN, r, p, maxmem: SCRYPT.maxmem });
  return valid && key.length === expected.length && timingSafeEqual(key, expected);
}

export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export interface SessionUser { id: string; name: string; email: string | null; roleId: string; permissions: string[]; }
export interface Session { tokenHash: string; csrf: string; user: SessionUser; expiresAt: string; }

interface SessionRow { token_hash: string; csrf: string; user_id: string; expires_at: string; last_seen_at: string; }
interface UserRow { id: string; name: string; email: string | null; role_id: string; status: string; permissions: string; }

export function createSession(db: HubDatabase, userId: string, userAgent: string | undefined, hours: number): { token: string; csrf: string; expiresAt: string } {
  const token = newToken();
  const csrf = newToken();
  const created = now();
  const expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();
  db.prepare('INSERT INTO sessions(token_hash,user_id,csrf,created_at,expires_at,last_seen_at,user_agent) VALUES (?,?,?,?,?,?,?)')
    .run(hashToken(token), userId, csrf, created, expiresAt, created, (userAgent ?? '').slice(0, 200));
  db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(created, userId);
  return { token, csrf, expiresAt };
}

/** Sessão válida e usuário ativo, ou null. Expira por tempo absoluto e por inatividade. */
export function readSession(db: HubDatabase, token: string | undefined, idleMinutes: number): Session | null {
  if (!token || token.length > 200) return null;
  const tokenHash = hashToken(token);
  const row = db.prepare('SELECT token_hash,csrf,user_id,expires_at,last_seen_at FROM sessions WHERE token_hash=?').get(tokenHash) as SessionRow | undefined;
  if (!row) return null;
  const current = Date.now();
  if (Date.parse(row.expires_at) <= current || Date.parse(row.last_seen_at) + idleMinutes * 60_000 <= current) {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);
    return null;
  }
  const user = db.prepare(`SELECT u.id,u.name,u.email,u.role_id,u.status,r.permissions FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?`).get(row.user_id) as UserRow | undefined;
  if (!user || user.status !== 'active') { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash); return null; }
  if (current - Date.parse(row.last_seen_at) > 60_000) db.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').run(new Date(current).toISOString(), tokenHash);
  return {
    tokenHash, csrf: row.csrf, expiresAt: row.expires_at,
    user: { id: user.id, name: user.name, email: user.email, roleId: user.role_id, permissions: JSON.parse(user.permissions) as string[] },
  };
}

export function revokeSession(db: HubDatabase, tokenHash: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);
}

export function revokeUserSessions(db: HubDatabase, userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
}

export function pruneSessions(db: HubDatabase): void {
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
  db.prepare("DELETE FROM tokens WHERE expires_at<=? OR (used_at IS NOT NULL AND used_at<=?)").run(now(), new Date(Date.now() - 30 * 86_400_000).toISOString());
}

/** Token de uso único (ativação de conta ou pareamento do Local Agent). Só o hash é guardado. */
export function issueToken(db: HubDatabase, kind: 'activation' | 'pairing', options: { userId?: string; createdBy?: string; hours: number; meta?: object }): string {
  const token = newToken();
  if (kind === 'activation' && options.userId) db.prepare("UPDATE tokens SET used_at=? WHERE kind='activation' AND user_id=? AND used_at IS NULL").run(now(), options.userId);
  db.prepare('INSERT INTO tokens(token_hash,kind,user_id,created_by,created_at,expires_at,meta) VALUES (?,?,?,?,?,?,?)')
    .run(hashToken(token), kind, options.userId ?? null, options.createdBy ?? null, now(), new Date(Date.now() + options.hours * 3_600_000).toISOString(), options.meta ? JSON.stringify(options.meta) : null);
  return token;
}

/** Consulta um link de ativação sem consumi-lo (para a tela saudar pelo nome). */
export function peekToken(db: HubDatabase, token: unknown): { name: string; recovery: boolean; needsEmail: boolean } {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw new AuthError('Link inválido ou expirado.', 400);
  const row = db.prepare(`SELECT t.expires_at,t.used_at,t.meta,u.name,u.email,u.status FROM tokens t JOIN users u ON u.id=t.user_id
    WHERE t.token_hash=? AND t.kind='activation'`).get(hashToken(token)) as { expires_at: string; used_at: string | null; meta: string | null; name: string; email: string | null; status: string } | undefined;
  if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now() || row.status === 'disabled') throw new AuthError('Link inválido ou expirado.', 400);
  const recovery = !!row.meta && (JSON.parse(row.meta) as { purpose?: string }).purpose === 'recovery';
  return { name: row.name, recovery, needsEmail: !(recovery && row.email) };
}

/** Consome o token uma única vez; devolve o registro ou lança erro genérico. */
export function consumeToken(db: HubDatabase, kind: 'activation' | 'pairing', token: unknown): { userId: string | null; meta: Record<string, unknown> | null } {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw new AuthError('Link inválido ou expirado.', 400);
  return transaction(db, () => {
    const row = db.prepare('SELECT token_hash,user_id,expires_at,used_at,meta FROM tokens WHERE token_hash=? AND kind=?').get(hashToken(token), kind) as
      { token_hash: string; user_id: string | null; expires_at: string; used_at: string | null; meta: string | null } | undefined;
    if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now()) throw new AuthError(kind === 'pairing' ? 'Código de pareamento inválido ou expirado.' : 'Link inválido ou expirado.', 400);
    db.prepare('UPDATE tokens SET used_at=? WHERE token_hash=?').run(now(), row.token_hash);
    return { userId: row.user_id, meta: row.meta ? JSON.parse(row.meta) as Record<string, unknown> : null };
  });
}

/** Limite simples de tentativas de login por IP+e-mail (memória do processo). */
export class LoginLimiter {
  private attempts = new Map<string, { count: number; until: number; first: number }>();
  constructor(private readonly max = 8, private readonly windowMs = 10 * 60_000) {}
  check(key: string): void {
    const entry = this.attempts.get(key);
    if (entry && entry.until > Date.now()) throw new AuthError('Muitas tentativas. Aguarde alguns minutos e tente novamente.', 429);
  }
  fail(key: string): void {
    const current = Date.now();
    const entry = this.attempts.get(key);
    const fresh = !entry || current - entry.first > this.windowMs;
    const next = fresh ? { count: 1, until: 0, first: current } : { ...entry, count: entry.count + 1 };
    if (next.count >= this.max) next.until = current + this.windowMs;
    this.attempts.set(key, next);
    if (this.attempts.size > 10_000) this.attempts.delete(this.attempts.keys().next().value!);
  }
  succeed(key: string): void { this.attempts.delete(key); }
}

export const newId = () => randomUUID();
