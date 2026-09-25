import { randomUUID } from 'node:crypto';
import { now } from '../db.js';
import type { HubDatabase } from '../db.js';
import { parseJsonColumn } from './fields.js';

export type CrmEntityType = 'contact' | 'organization' | 'lead' | 'opportunity';
export const ACTIVITY_KINDS = ['note', 'call', 'meeting', 'email', 'message', 'whatsapp', 'event'] as const;
export type ActivityKind = typeof ACTIVITY_KINDS[number] | 'history';

/** Quem fez: pessoa, IA (confirmada por uma pessoa), integração, sistema (automação/migração) ou Local Agent. */
export interface CrmActor { type: 'user' | 'ai' | 'integration' | 'system' | 'agent'; id: string | null; origin?: string; }

export const userActor = (id: string): CrmActor => ({ type: 'user', id, origin: 'hub' });
export const SYSTEM_ACTOR: CrmActor = Object.freeze({ type: 'system', id: null, origin: 'automation' });

export function originOf(actor: CrmActor): string {
  return actor.origin ?? (actor.type === 'ai' ? 'ai' : actor.type === 'user' ? 'hub' : actor.type);
}

export interface ActivityInput {
  entityType: CrmEntityType; entityId: string; kind: ActivityKind; action?: string | null; body?: string | null;
  data?: Record<string, unknown>; occurredAt?: string | null;
}

export function addActivity(db: HubDatabase, actor: CrmActor, input: ActivityInput): string {
  const id = randomUUID();
  const stamp = now();
  db.prepare(`INSERT INTO crm_activities(id,entity_type,entity_id,kind,action,body,data,occurred_at,actor_type,actor_id,origin,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, input.entityType, input.entityId, input.kind, input.action ?? null, input.body ?? null,
    JSON.stringify(input.data ?? {}), input.occurredAt ?? stamp, actor.type, actor.id, originOf(actor), stamp);
  return id;
}

export interface TimelineEntry {
  id: string; entityType: CrmEntityType; entityId: string; entityLabel: string | null; kind: ActivityKind; action: string | null;
  body: string | null; data: Record<string, unknown>; occurredAt: string; origin: string;
  actor: { type: CrmActor['type']; id: string | null; name: string | null };
}

/** Entidades cujo histórico aparece junto (ex.: o contato mostra também as oportunidades e leads dele). */
function relatedEntities(db: HubDatabase, type: CrmEntityType, id: string): Array<[CrmEntityType, string]> {
  const list: Array<[CrmEntityType, string]> = [[type, id]];
  const ids = (sql: string) => (db.prepare(sql).all(id) as Array<{ id: string }>).map(row => row.id);
  if (type === 'contact') {
    for (const item of ids('SELECT id FROM crm_opportunities WHERE contact_id=? LIMIT 50')) list.push(['opportunity', item]);
    for (const item of ids('SELECT id FROM crm_leads WHERE contact_id=? LIMIT 20')) list.push(['lead', item]);
  } else if (type === 'organization') {
    for (const item of ids('SELECT id FROM crm_opportunities WHERE organization_id=? LIMIT 50')) list.push(['opportunity', item]);
    for (const item of ids('SELECT id FROM crm_contacts WHERE organization_id=? LIMIT 50')) list.push(['contact', item]);
  } else if (type === 'opportunity') {
    for (const item of ids('SELECT lead_id AS id FROM crm_opportunities WHERE id=? AND lead_id IS NOT NULL')) list.push(['lead', item]);
  } else if (type === 'lead') {
    for (const item of ids('SELECT opportunity_id AS id FROM crm_leads WHERE id=? AND opportunity_id IS NOT NULL')) list.push(['opportunity', item]);
  }
  return list;
}

export function timeline(db: HubDatabase, type: CrmEntityType, id: string, limit = 300): TimelineEntry[] {
  const entities = relatedEntities(db, type, id);
  const placeholders = entities.map(() => '(?,?)').join(',');
  const rows = db.prepare(`SELECT a.*, u.name AS actor_name,
      CASE a.entity_type WHEN 'contact' THEN (SELECT name FROM crm_contacts WHERE id=a.entity_id)
        WHEN 'organization' THEN (SELECT name FROM crm_organizations WHERE id=a.entity_id)
        WHEN 'lead' THEN (SELECT name FROM crm_leads WHERE id=a.entity_id)
        ELSE (SELECT title FROM crm_opportunities WHERE id=a.entity_id) END AS entity_label
    FROM crm_activities a LEFT JOIN users u ON u.id=a.actor_id AND a.actor_type IN ('user','ai')
    WHERE (a.entity_type, a.entity_id) IN (VALUES ${placeholders})
    ORDER BY a.occurred_at DESC, a.created_at DESC LIMIT ?`).all(...entities.flat(), limit) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    id: String(row.id), entityType: row.entity_type as CrmEntityType, entityId: String(row.entity_id), entityLabel: (row.entity_label as string | null) ?? null,
    kind: row.kind as ActivityKind, action: (row.action as string | null) ?? null, body: (row.body as string | null) ?? null, data: parseJsonColumn(row.data),
    occurredAt: String(row.occurred_at), origin: String(row.origin),
    actor: { type: row.actor_type as CrmActor['type'], id: (row.actor_id as string | null) ?? null, name: (row.actor_name as string | null) ?? null },
  }));
}
