import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { slugify } from '../contract/workfoli-contract.mjs';

/** Versão do esquema do banco operacional de UMA instância. Cada instância tem o seu arquivo. */
export const HUB_DB_VERSION = 2;

/** `sql` roda primeiro; `run` (opcional) migra dados na MESMA transação. */
interface Migration { version: number; sql: string; run?: (db: DatabaseSync) => void; }

/**
 * v1 → v2: o CRM de "contato com etapa" vira contatos, empresas, leads e oportunidades separados.
 * Nada é descartado: a tabela antiga fica como `legacy_contacts_v1` e cada registro ganha histórico.
 */
function migrateLegacyContacts(db: DatabaseSync): void {
  const rows = db.prepare('SELECT * FROM contacts ORDER BY created_at').all() as Array<Record<string, string | null>>;
  if (!rows.length) { db.exec('DROP TABLE contacts'); return; }
  const organizations = new Map<string, string>();
  const relationship: Record<string, string> = { lead: 'prospect', client: 'customer', partner: 'partner', supplier: 'supplier', other: 'other' };
  const history = db.prepare(`INSERT INTO crm_activities(id,entity_type,entity_id,kind,action,body,data,occurred_at,actor_type,actor_id,origin,created_at)
    VALUES (?,?,?,'history','migrated',?,?,?,'system',NULL,'migration',?)`);
  for (const row of rows) {
    let organizationId: string | null = null;
    const organization = row.organization?.trim();
    if (organization) {
      const key = organization.toLowerCase();
      if (!organizations.has(key)) {
        const id = randomUUID();
        db.prepare("INSERT INTO crm_organizations(id,name,created_by,created_at,updated_at,origin) VALUES (?,?,?,?,?,'migration')").run(id, organization, row.created_by, row.created_at!, row.updated_at!);
        organizations.set(key, id);
      }
      organizationId = organizations.get(key)!;
    }
    db.prepare(`INSERT INTO crm_contacts(id,name,email,phone,organization_id,relationship,owner_id,notes,created_by,created_at,updated_at,origin)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(row.id!, row.name!, row.email, row.phone, organizationId, relationship[row.kind ?? ''] ?? 'other', row.owner_id,
      row.notes, row.created_by, row.created_at!, row.updated_at!, row.source === 'ai' ? 'ai' : 'hub');
    history.run(randomUUID(), 'contact', row.id!, `Importado do CRM anterior${row.stage ? ` (etapa: ${row.stage})` : ''}.`, JSON.stringify({ legacyStage: row.stage, legacyKind: row.kind }), row.updated_at!, row.updated_at!);
    if (!row.stage) continue;
    // A etapa antiga vira uma oportunidade aberta no funil convertido (mesmos identificadores da migração do manifesto).
    const opportunityId = randomUUID();
    db.prepare(`INSERT INTO crm_opportunities(id,title,pipeline_id,stage_id,status,contact_id,organization_id,owner_id,stage_entered_at,created_by,created_at,updated_at,origin)
      VALUES (?,?,'vendas',?,'open',?,?,?,?,?,?,?,'migration')`).run(opportunityId, organization ? `${row.name} — ${organization}` : row.name!, slugify(row.stage, 36) || 'etapa',
      row.id!, organizationId, row.owner_id, row.updated_at!, row.created_by, row.created_at!, row.updated_at!);
    history.run(randomUUID(), 'opportunity', opportunityId, `Criada a partir do CRM anterior (etapa: ${row.stage}).`, JSON.stringify({ legacyStage: row.stage }), row.updated_at!, row.updated_at!);
  }
  db.exec('ALTER TABLE contacts RENAME TO legacy_contacts_v1');
}

/** Exportado para testes de migração; a ordem é a história do esquema e nunca muda. */
export const MIGRATIONS: ReadonlyArray<Migration> = [
  {
    version: 1,
    sql: `
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE roles (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, permissions TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('core','base','custom')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE COLLATE NOCASE, role_id TEXT NOT NULL REFERENCES roles(id),
        status TEXT NOT NULL CHECK (status IN ('pending','active','disabled')), password_hash TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT);
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL,
        created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, user_agent TEXT);
      CREATE TABLE tokens (
        token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('activation','pairing')),
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE, created_by TEXT, created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL, used_at TEXT, meta TEXT);
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT, status TEXT NOT NULL CHECK (status IN ('open','doing','done')),
        due_date TEXT, assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL, project_id TEXT,
        created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'hub');
      CREATE TABLE contacts (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('lead','client','partner','supplier','other')),
        email TEXT, phone TEXT, organization TEXT, stage TEXT, notes TEXT, owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'hub');
      CREATE TABLE records (
        id TEXT PRIMARY KEY, module_id TEXT NOT NULL, data TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX records_module ON records(module_id, created_at);
      CREATE TABLE audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor_type TEXT NOT NULL CHECK (actor_type IN ('user','agent','system','ai')),
        actor_id TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, result TEXT NOT NULL CHECK (result IN ('ok','denied','error')));
      CREATE TABLE ai_messages (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('user','assistant')),
        text TEXT NOT NULL, proposals TEXT, created_at TEXT NOT NULL);
      CREATE TABLE proposals (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL, payload TEXT NOT NULL,
        summary TEXT NOT NULL, hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending','executed','rejected','expired','failed')),
        created_at TEXT NOT NULL, expires_at TEXT NOT NULL, decided_at TEXT, result TEXT);
      CREATE TABLE devices (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_by TEXT, created_at TEXT NOT NULL,
        last_seen_at TEXT, revoked_at TEXT);
      CREATE TABLE snapshot_files (
        path TEXT PRIMARY KEY, hash TEXT NOT NULL, size INTEGER NOT NULL, kind TEXT NOT NULL, restricted INTEGER NOT NULL DEFAULT 0,
        content TEXT, modified_at TEXT, updated_at TEXT NOT NULL);
      CREATE TABLE base_commands (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL, expected_revision TEXT,
        status TEXT NOT NULL CHECK (status IN ('queued','delivered','applied','failed','cancelled','expired')),
        created_by TEXT, created_at TEXT NOT NULL, delivered_at TEXT, completed_at TEXT, receipt TEXT);
      CREATE TABLE private_files (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL,
        visibility TEXT NOT NULL CHECK (visibility IN ('internal','restricted')), note TEXT, created_by TEXT, created_at TEXT NOT NULL);
    `,
  },
  {
    // CRM nativo (estrutura na Base, dados vivos aqui), integrações por instância e dados de marketing normalizados.
    version: 2,
    sql: `
      CREATE TABLE crm_organizations (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, website TEXT, email TEXT, phone TEXT, notes TEXT,
        owner_id TEXT REFERENCES users(id) ON DELETE SET NULL, source_id TEXT, custom TEXT NOT NULL DEFAULT '{}',
        created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT, origin TEXT NOT NULL DEFAULT 'hub');
      CREATE INDEX crm_organizations_name ON crm_organizations(name COLLATE NOCASE);
      CREATE TABLE crm_contacts (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT, job_title TEXT,
        organization_id TEXT REFERENCES crm_organizations(id) ON DELETE SET NULL,
        relationship TEXT NOT NULL CHECK (relationship IN ('prospect','customer','partner','supplier','other')),
        source_id TEXT, owner_id TEXT REFERENCES users(id) ON DELETE SET NULL, notes TEXT, custom TEXT NOT NULL DEFAULT '{}',
        created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT, origin TEXT NOT NULL DEFAULT 'hub');
      CREATE INDEX crm_contacts_name ON crm_contacts(name COLLATE NOCASE);
      CREATE INDEX crm_contacts_email ON crm_contacts(email COLLATE NOCASE);
      CREATE INDEX crm_contacts_organization ON crm_contacts(organization_id);
      CREATE TABLE crm_opportunities (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, pipeline_id TEXT NOT NULL, stage_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open','won','lost')),
        value_cents INTEGER, currency TEXT NOT NULL DEFAULT 'BRL',
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')), expected_close_date TEXT,
        contact_id TEXT REFERENCES crm_contacts(id) ON DELETE SET NULL, organization_id TEXT REFERENCES crm_organizations(id) ON DELETE SET NULL,
        lead_id TEXT, source_id TEXT, owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        lost_reason TEXT, lost_note TEXT, closed_at TEXT, stage_entered_at TEXT NOT NULL, position REAL NOT NULL DEFAULT 0,
        notes TEXT, attribution TEXT NOT NULL DEFAULT '{}', custom TEXT NOT NULL DEFAULT '{}',
        created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT, origin TEXT NOT NULL DEFAULT 'hub');
      CREATE INDEX crm_opportunities_board ON crm_opportunities(pipeline_id, status, stage_id, position);
      CREATE INDEX crm_opportunities_contact ON crm_opportunities(contact_id);
      CREATE INDEX crm_opportunities_organization ON crm_opportunities(organization_id);
      CREATE TABLE crm_leads (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT, company TEXT, message TEXT,
        status TEXT NOT NULL CHECK (status IN ('new','working','qualified','disqualified','converted')),
        source_id TEXT, owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
        attribution TEXT NOT NULL DEFAULT '{}', custom TEXT NOT NULL DEFAULT '{}',
        contact_id TEXT REFERENCES crm_contacts(id) ON DELETE SET NULL, opportunity_id TEXT REFERENCES crm_opportunities(id) ON DELETE SET NULL,
        integration_id TEXT, external_ref TEXT, disqualify_reason TEXT, converted_at TEXT,
        created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT, origin TEXT NOT NULL DEFAULT 'hub');
      CREATE INDEX crm_leads_status ON crm_leads(status, created_at);
      CREATE UNIQUE INDEX crm_leads_external ON crm_leads(integration_id, external_ref) WHERE external_ref IS NOT NULL;
      CREATE TABLE crm_activities (
        id TEXT PRIMARY KEY, entity_type TEXT NOT NULL CHECK (entity_type IN ('contact','organization','lead','opportunity')), entity_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('note','call','meeting','email','message','whatsapp','event','history')),
        action TEXT, body TEXT, data TEXT NOT NULL DEFAULT '{}', occurred_at TEXT NOT NULL,
        actor_type TEXT NOT NULL CHECK (actor_type IN ('user','ai','integration','system','agent')), actor_id TEXT,
        origin TEXT NOT NULL DEFAULT 'hub', created_at TEXT NOT NULL);
      CREATE INDEX crm_activities_entity ON crm_activities(entity_type, entity_id, occurred_at);
      CREATE TABLE crm_tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at TEXT NOT NULL);
      CREATE TABLE crm_entity_tags (
        tag_id TEXT NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY (tag_id, entity_type, entity_id));
      CREATE INDEX crm_entity_tags_entity ON crm_entity_tags(entity_type, entity_id);
      CREATE TABLE crm_attachments (
        id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('private-file','base-file','url')), ref TEXT NOT NULL, label TEXT,
        created_by TEXT, created_at TEXT NOT NULL);
      CREATE INDEX crm_attachments_entity ON crm_attachments(entity_type, entity_id);
      ALTER TABLE tasks ADD COLUMN related_type TEXT;
      ALTER TABLE tasks ADD COLUMN related_id TEXT;
      CREATE INDEX tasks_related ON tasks(related_type, related_id);

      CREATE TABLE integration_connections (
        id TEXT PRIMARY KEY, provider TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('connected','error','expired','disconnected')),
        account_label TEXT, account_ref TEXT, scopes TEXT NOT NULL DEFAULT '[]', settings TEXT NOT NULL DEFAULT '{}',
        connected_by TEXT, connected_at TEXT, updated_at TEXT NOT NULL, last_sync_at TEXT, last_error TEXT, disconnected_at TEXT);
      CREATE UNIQUE INDEX integration_connections_live ON integration_connections(provider) WHERE status <> 'disconnected';
      CREATE TABLE integration_tokens (
        connection_id TEXT PRIMARY KEY REFERENCES integration_connections(id) ON DELETE CASCADE,
        ciphertext TEXT NOT NULL, expires_at TEXT, updated_at TEXT NOT NULL);
      CREATE TABLE oauth_states (
        state_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        verifier TEXT NOT NULL, redirect_uri TEXT NOT NULL, scopes TEXT NOT NULL, capabilities TEXT NOT NULL,
        created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT);
      CREATE TABLE integration_sync_runs (
        id TEXT PRIMARY KEY, connection_id TEXT NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE, kind TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running','ok','error')), started_at TEXT NOT NULL, finished_at TEXT,
        stats TEXT NOT NULL DEFAULT '{}', error TEXT);
      CREATE INDEX integration_sync_runs_connection ON integration_sync_runs(connection_id, started_at);
      CREATE TABLE mkt_campaigns (
        provider TEXT NOT NULL, external_id TEXT NOT NULL, account_ref TEXT, name TEXT NOT NULL, status TEXT, objective TEXT,
        updated_at TEXT NOT NULL, PRIMARY KEY (provider, external_id));
      CREATE TABLE mkt_metrics_daily (
        provider TEXT NOT NULL, scope TEXT NOT NULL CHECK (scope IN ('account','campaign','property','site')), scope_id TEXT NOT NULL,
        date TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('count','micros','ratio','position')), currency TEXT, fetched_at TEXT NOT NULL,
        PRIMARY KEY (provider, scope, scope_id, date, metric));
      CREATE INDEX mkt_metrics_daily_date ON mkt_metrics_daily(date);
    `,
    run: migrateLegacyContacts,
  },
];

export type HubDatabase = DatabaseSync;

export interface MigrationPlan { current: number; target: number; pending: number[]; newer: boolean; }

function userVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  return Number(row?.user_version ?? 0);
}

/** Leitura somente: quais migrações faltam (para `doctor` e `update --dry-run`). */
export function planMigrations(file: string): MigrationPlan {
  if (!fs.existsSync(file)) return { current: 0, target: HUB_DB_VERSION, pending: MIGRATIONS.map(item => item.version), newer: false };
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const current = userVersion(db);
    return { current, target: HUB_DB_VERSION, pending: MIGRATIONS.filter(item => item.version > current).map(item => item.version), newer: current > HUB_DB_VERSION };
  } finally { db.close(); }
}

/**
 * Abre o banco de uma instância aplicando migrações pendentes.
 * Antes de migrar um banco existente, grava cópia consistente em `<data>/backups/`.
 */
export function openHubDatabase(file: string, options: { create?: boolean; migrate?: boolean } = {}): HubDatabase {
  const exists = fs.existsSync(file);
  if (!exists && !options.create) throw new Error('Banco da instância não encontrado. Rode `workfoli hub install` primeiro.');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const current = userVersion(db);
    if (current > HUB_DB_VERSION) throw new Error('Este banco foi criado por uma versão mais nova do Workfoli. Atualize o Core antes de abrir.');
    const pending = MIGRATIONS.filter(item => item.version > current);
    if (pending.length && exists && current > 0) {
      if (options.migrate === false) throw new Error('O banco precisa de migração. Rode `workfoli update --apply`.');
      const backups = path.join(path.dirname(file), 'backups');
      fs.mkdirSync(backups, { recursive: true });
      db.prepare('VACUUM INTO ?').run(path.join(backups, `hub-v${current}-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`));
    }
    for (const migration of pending) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(migration.sql);
        migration.run?.(db);
        db.exec(`PRAGMA user_version = ${migration.version}`);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function transaction<T>(db: HubDatabase, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = work();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* no active transaction */ }
    throw error;
  }
}

export function getMeta(db: HubDatabase, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key=?').get(key) as { value?: string } | undefined;
  return row?.value;
}

export function setMeta(db: HubDatabase, key: string, value: string): void {
  db.prepare('INSERT INTO meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}

export const now = () => new Date().toISOString();
