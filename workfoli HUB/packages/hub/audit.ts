import type { HubDatabase } from './db.js';
import { now } from './db.js';

export type ActorType = 'user' | 'agent' | 'system' | 'ai';
export interface Actor { type: ActorType; id: string | null; }
export type AuditResult = 'ok' | 'denied' | 'error';

export interface AuditEntry {
  id: number; at: string; actorType: ActorType; actorId: string | null; actorName: string | null;
  action: string; target: string | null; detail: Record<string, unknown> | null; result: AuditResult;
}

const FORBIDDEN_KEYS = /pass(word)?|senha|secret|token|cookie|authorization|content|body/i;

/** Registro mínimo: nunca grava segredos, conteúdos completos ou senhas. */
function redact(detail: Record<string, unknown> | undefined): string | null {
  if (!detail) return null;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (FORBIDDEN_KEYS.test(key)) continue;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) clean[key] = typeof value === 'string' ? value.slice(0, 300) : value;
    else if (Array.isArray(value)) clean[key] = value.slice(0, 20).map(item => typeof item === 'string' ? item.slice(0, 120) : item);
  }
  return JSON.stringify(clean).slice(0, 4000);
}

export function audit(db: HubDatabase, actor: Actor, action: string, target: string | null, detail?: Record<string, unknown>, result: AuditResult = 'ok'): void {
  db.prepare('INSERT INTO audit(at,actor_type,actor_id,action,target,detail,result) VALUES (?,?,?,?,?,?,?)')
    .run(now(), actor.type, actor.id, action.slice(0, 80), target ? target.slice(0, 200) : null, redact(detail), result);
}

export function listAudit(db: HubDatabase, options: { limit?: number; before?: number; prefix?: string } = {}): AuditEntry[] {
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const before = Number.isSafeInteger(options.before) ? Number(options.before) : Number.MAX_SAFE_INTEGER;
  const prefix = typeof options.prefix === 'string' && /^[a-z.]{1,40}$/.test(options.prefix) ? `${options.prefix}%` : '%';
  const rows = db.prepare(`SELECT a.id,a.at,a.actor_type,a.actor_id,a.action,a.target,a.detail,a.result,u.name AS actor_name
    FROM audit a LEFT JOIN users u ON u.id=a.actor_id AND a.actor_type IN ('user','ai')
    WHERE a.id<? AND a.action LIKE ? ORDER BY a.id DESC LIMIT ?`).all(before, prefix, limit) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    id: Number(row.id), at: String(row.at), actorType: row.actor_type as ActorType, actorId: (row.actor_id as string | null) ?? null,
    actorName: (row.actor_name as string | null) ?? null, action: String(row.action), target: (row.target as string | null) ?? null,
    detail: row.detail ? JSON.parse(String(row.detail)) as Record<string, unknown> : null, result: row.result as AuditResult,
  }));
}
