import { randomUUID } from 'node:crypto';
import { now, transaction } from '../db.js';
import type { HubDatabase } from '../db.js';
import { HttpError } from '../http.js';
import type { HubRuntime } from '../runtime.js';
import { PROVIDERS } from './catalog.js';
import type { ConnectionProvider } from './catalog.js';
import { VaultError } from './vault.js';

/** Conteúdo cifrado no cofre. Nunca sai do servidor, nunca vai para log, auditoria ou resposta da API. */
export interface TokenBundle {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  expiresAt?: string | null;
}

export interface ConnectionRow {
  id: string; provider: ConnectionProvider; status: 'connected' | 'error' | 'expired' | 'disconnected';
  account_label: string | null; account_ref: string | null; scopes: string; settings: string;
  connected_by: string | null; connected_at: string | null; updated_at: string; last_sync_at: string | null; last_error: string | null;
}

export function liveConnection(db: HubDatabase, provider: ConnectionProvider): ConnectionRow | undefined {
  return db.prepare("SELECT * FROM integration_connections WHERE provider=? AND status<>'disconnected'").get(provider) as ConnectionRow | undefined;
}

export function requireConnection(db: HubDatabase, provider: ConnectionProvider): ConnectionRow {
  const row = liveConnection(db, provider);
  if (!row) throw new HttpError(409, `${PROVIDERS[provider].label} não está conectado nesta instância.`, 'not-connected');
  return row;
}

export function connectionSettings(row: ConnectionRow): Record<string, unknown> {
  try { const parsed = JSON.parse(row.settings) as unknown; return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; }
}

export function connectionScopes(row: ConnectionRow): string[] {
  try { const parsed = JSON.parse(row.scopes) as unknown; return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []; } catch { return []; }
}

const tokenContext = (connectionId: string) => `integration-token:${connectionId}`;

/**
 * Grava (ou reconecta) a conexão do provedor. Uma conexão viva por provedor e por instância:
 * reconectar substitui os tokens e mantém as escolhas de contas já feitas.
 */
export function saveConnection(runtime: HubRuntime, provider: ConnectionProvider, input: {
  accountLabel: string | null; accountRef: string | null; scopes: string[]; connectedBy: string | null; bundle: TokenBundle;
}): string {
  const vault = runtime.integrations.vault();
  return transaction(runtime.db, () => {
    const existing = liveConnection(runtime.db, provider);
    const id = existing?.id ?? randomUUID();
    const stamp = now();
    if (existing) {
      runtime.db.prepare(`UPDATE integration_connections SET status='connected', account_label=?, account_ref=?, scopes=?, connected_by=?, connected_at=?, updated_at=?, last_error=NULL WHERE id=?`)
        .run(input.accountLabel, input.accountRef, JSON.stringify(input.scopes), input.connectedBy, stamp, stamp, id);
    } else {
      runtime.db.prepare(`INSERT INTO integration_connections(id,provider,status,account_label,account_ref,scopes,settings,connected_by,connected_at,updated_at) VALUES (?,?,'connected',?,?,?,'{}',?,?,?)`)
        .run(id, provider, input.accountLabel, input.accountRef, JSON.stringify(input.scopes), input.connectedBy, stamp, stamp);
    }
    runtime.db.prepare('INSERT INTO integration_tokens(connection_id,ciphertext,expires_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(connection_id) DO UPDATE SET ciphertext=excluded.ciphertext, expires_at=excluded.expires_at, updated_at=excluded.updated_at')
      .run(id, vault.encrypt(JSON.stringify(input.bundle), tokenContext(id)), input.bundle.expiresAt ?? null, stamp);
    return id;
  });
}

export function readBundle(runtime: HubRuntime, row: ConnectionRow): TokenBundle {
  const stored = runtime.db.prepare('SELECT ciphertext FROM integration_tokens WHERE connection_id=?').get(row.id) as { ciphertext: string } | undefined;
  if (!stored) throw new HttpError(409, `${PROVIDERS[row.provider].label}: credencial ausente. Reconecte.`, 'reconnect');
  try {
    return JSON.parse(runtime.integrations.vault().decrypt(stored.ciphertext, tokenContext(row.id))) as TokenBundle;
  } catch (error) {
    markError(runtime.db, row.id, 'error', error instanceof VaultError ? error.message : 'Credencial ilegível. Reconecte.');
    throw new HttpError(409, `${PROVIDERS[row.provider].label}: ${error instanceof VaultError ? error.message : 'credencial ilegível'}`, 'reconnect');
  }
}

export function writeBundle(runtime: HubRuntime, row: ConnectionRow, bundle: TokenBundle): void {
  runtime.db.prepare('UPDATE integration_tokens SET ciphertext=?, expires_at=?, updated_at=? WHERE connection_id=?')
    .run(runtime.integrations.vault().encrypt(JSON.stringify(bundle), tokenContext(row.id)), bundle.expiresAt ?? null, now(), row.id);
}

export function markError(db: HubDatabase, id: string, status: 'error' | 'expired', message: string): void {
  db.prepare('UPDATE integration_connections SET status=?, last_error=?, updated_at=? WHERE id=?').run(status, message.slice(0, 300), now(), id);
}

export function updateSettings(db: HubDatabase, row: ConnectionRow, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...connectionSettings(row), ...patch };
  for (const [key, value] of Object.entries(next)) if (value === null || value === undefined) delete next[key];
  db.prepare('UPDATE integration_connections SET settings=?, updated_at=? WHERE id=?').run(JSON.stringify(next), now(), row.id);
  return next;
}

/** Desliga localmente: apaga os tokens do cofre e guarda só o registro (quem, quando) para o histórico. */
export function forgetConnection(db: HubDatabase, row: ConnectionRow): void {
  transaction(db, () => {
    db.prepare('DELETE FROM integration_tokens WHERE connection_id=?').run(row.id);
    db.prepare("UPDATE integration_connections SET status='disconnected', disconnected_at=?, updated_at=? WHERE id=?").run(now(), now(), row.id);
  });
}
