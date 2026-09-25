import { randomUUID } from 'node:crypto';
import { isSafeRelativePath } from '../../contract/workfoli-contract.mjs';
import type { BaseManifest, CrmConfig, CrmPipeline, CrmStage } from '../../contract/workfoli-contract.mjs';
import { now, transaction } from '../db.js';
import type { HubDatabase } from '../db.js';
import { HttpError } from '../http.js';
import { can } from '../permissions.js';
import type { Actor, HubRuntime } from '../runtime.js';
import { baseFileVisible } from '../services/content.js';
import { runAutomations } from './automations.js';
import { REQUIRED_FIELD_LABELS, crmConfig, crmLabels, crmSources, defaultPipeline, findStage, firstOpenStage, pipelineOf, sourceLabel, stageOf } from './config.js';
import * as f from './fields.js';
import { ACTIVITY_KINDS, addActivity, originOf, timeline } from './history.js';
import type { CrmActor, CrmEntityType, TimelineEntry } from './history.js';
import { setTags, tagsOf } from './tags.js';

/**
 * CRM nativo e genérico. Estrutura e regras vêm da Base (config.ts); aqui ficam os dados vivos:
 * empresas, contatos, leads, oportunidades, atividades, etiquetas e anexos. Toda mudança relevante
 * vira histórico (quem, quando, o quê, origem) e as automações declaradas rodam na mesma transação.
 */

export const RELATIONSHIPS = ['prospect', 'customer', 'partner', 'supplier', 'other'] as const;
export type Relationship = typeof RELATIONSHIPS[number];
export const LEAD_STATUSES = ['new', 'working', 'qualified', 'disqualified', 'converted'] as const;
export type LeadStatus = typeof LEAD_STATUSES[number];
export type OpportunityStatus = 'open' | 'won' | 'lost';

type Row = Record<string, unknown>;
type Ref = { id: string; name: string } | null;
const str = (value: unknown): string | null => (value as string | null | undefined) ?? null;
const ref = (id: unknown, name: unknown): Ref => (id ? { id: String(id), name: String(name ?? '') } : null);
const jsonList = (value: unknown): string[] => {
  if (typeof value !== 'string') return [];
  try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').sort((a, b) => a.localeCompare(b, 'pt-BR')) : []; } catch { return []; }
};
const tagsSql = (type: CrmEntityType, alias: string) => `(SELECT json_group_array(t.name) FROM crm_entity_tags et JOIN crm_tags t ON t.id=et.tag_id WHERE et.entity_type='${type}' AND et.entity_id=${alias}.id) AS tags_json`;

function sourceRef(config: CrmConfig, id: unknown) {
  return id ? { id: String(id), label: sourceLabel(config, String(id)) ?? String(id) } : null;
}

// ————————————————————————— Visões —————————————————————————

export interface OrganizationView {
  id: string; name: string; website: string | null; email: string | null; phone: string | null; notes: string | null;
  owner: Ref; source: { id: string; label: string } | null; custom: Record<string, unknown>; tags: string[];
  contacts: number; openOpportunities: number; createdAt: string; updatedAt: string; archivedAt: string | null; origin: string;
}
export interface ContactView {
  id: string; name: string; email: string | null; phone: string | null; jobTitle: string | null; relationship: Relationship;
  organization: Ref; owner: Ref; source: { id: string; label: string } | null; notes: string | null; custom: Record<string, unknown>;
  tags: string[]; openOpportunities: number; createdAt: string; updatedAt: string; archivedAt: string | null; origin: string;
}
export interface LeadView {
  id: string; name: string; email: string | null; phone: string | null; company: string | null; message: string | null; status: LeadStatus;
  source: { id: string; label: string } | null; owner: Ref; priority: f.Priority; attribution: f.Attribution; custom: Record<string, unknown>;
  tags: string[]; contact: Ref; opportunity: Ref; disqualifyReason: string | null; convertedAt: string | null;
  integration: { id: string; provider: string } | null; createdAt: string; updatedAt: string; archivedAt: string | null; origin: string;
}
export interface OpportunityView {
  id: string; title: string; pipelineId: string; stageId: string; stage: { id: string; name: string; kind: CrmStage['kind']; probability: number | null } | null;
  pipelineName: string | null; status: OpportunityStatus; valueCents: number | null; currency: string; priority: f.Priority; expectedCloseDate: string | null;
  contact: Ref; organization: Ref; leadId: string | null; source: { id: string; label: string } | null; owner: Ref;
  lostReason: string | null; lostNote: string | null; closedAt: string | null; stageEnteredAt: string; position: number; notes: string | null;
  attribution: f.Attribution; custom: Record<string, unknown>; tags: string[]; createdAt: string; updatedAt: string; archivedAt: string | null; origin: string;
}

function organizationView(config: CrmConfig, row: Row): OrganizationView {
  return {
    id: String(row.id), name: String(row.name), website: str(row.website), email: str(row.email), phone: str(row.phone), notes: str(row.notes),
    owner: ref(row.owner_id, row.owner_name), source: sourceRef(config, row.source_id), custom: f.parseJsonColumn(row.custom), tags: jsonList(row.tags_json),
    contacts: Number(row.contacts ?? 0), openOpportunities: Number(row.open_opportunities ?? 0),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), archivedAt: str(row.archived_at), origin: String(row.origin),
  };
}

function contactView(config: CrmConfig, row: Row): ContactView {
  return {
    id: String(row.id), name: String(row.name), email: str(row.email), phone: str(row.phone), jobTitle: str(row.job_title), relationship: row.relationship as Relationship,
    organization: ref(row.organization_id, row.organization_name), owner: ref(row.owner_id, row.owner_name), source: sourceRef(config, row.source_id),
    notes: str(row.notes), custom: f.parseJsonColumn(row.custom), tags: jsonList(row.tags_json), openOpportunities: Number(row.open_opportunities ?? 0),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), archivedAt: str(row.archived_at), origin: String(row.origin),
  };
}

function leadView(config: CrmConfig, row: Row): LeadView {
  return {
    id: String(row.id), name: String(row.name), email: str(row.email), phone: str(row.phone), company: str(row.company), message: str(row.message),
    status: row.status as LeadStatus, source: sourceRef(config, row.source_id), owner: ref(row.owner_id, row.owner_name), priority: row.priority as f.Priority,
    attribution: f.attribution(f.parseJsonColumn(row.attribution)), custom: f.parseJsonColumn(row.custom), tags: jsonList(row.tags_json),
    contact: ref(row.contact_id, row.contact_name), opportunity: ref(row.opportunity_id, row.opportunity_title), disqualifyReason: str(row.disqualify_reason),
    convertedAt: str(row.converted_at), integration: row.integration_id ? { id: String(row.integration_id), provider: String(row.integration_provider ?? '') } : null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), archivedAt: str(row.archived_at), origin: String(row.origin),
  };
}

function opportunityView(config: CrmConfig, row: Row): OpportunityView {
  const found = findStage(config, String(row.pipeline_id), String(row.stage_id));
  return {
    id: String(row.id), title: String(row.title), pipelineId: String(row.pipeline_id), stageId: String(row.stage_id),
    stage: found ? { id: found.stage.id, name: found.stage.name, kind: found.stage.kind, probability: found.stage.probability ?? null } : null,
    pipelineName: config.pipelines.find(pipeline => pipeline.id === row.pipeline_id)?.name ?? null,
    status: row.status as OpportunityStatus, valueCents: row.value_cents === null || row.value_cents === undefined ? null : Number(row.value_cents), currency: String(row.currency),
    priority: row.priority as f.Priority, expectedCloseDate: str(row.expected_close_date), contact: ref(row.contact_id, row.contact_name),
    organization: ref(row.organization_id, row.organization_name), leadId: str(row.lead_id), source: sourceRef(config, row.source_id), owner: ref(row.owner_id, row.owner_name),
    lostReason: str(row.lost_reason), lostNote: str(row.lost_note), closedAt: str(row.closed_at), stageEnteredAt: String(row.stage_entered_at), position: Number(row.position),
    notes: str(row.notes), attribution: f.attribution(f.parseJsonColumn(row.attribution)), custom: f.parseJsonColumn(row.custom), tags: jsonList(row.tags_json),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), archivedAt: str(row.archived_at), origin: String(row.origin),
  };
}

const ORGANIZATION_SELECT = `SELECT o.*, u.name AS owner_name, ${tagsSql('organization', 'o')},
  (SELECT COUNT(*) FROM crm_contacts c WHERE c.organization_id=o.id AND c.archived_at IS NULL) AS contacts,
  (SELECT COUNT(*) FROM crm_opportunities p WHERE p.organization_id=o.id AND p.status='open' AND p.archived_at IS NULL) AS open_opportunities
  FROM crm_organizations o LEFT JOIN users u ON u.id=o.owner_id`;
const CONTACT_SELECT = `SELECT c.*, o.name AS organization_name, u.name AS owner_name, ${tagsSql('contact', 'c')},
  (SELECT COUNT(*) FROM crm_opportunities p WHERE p.contact_id=c.id AND p.status='open' AND p.archived_at IS NULL) AS open_opportunities
  FROM crm_contacts c LEFT JOIN crm_organizations o ON o.id=c.organization_id LEFT JOIN users u ON u.id=c.owner_id`;
const LEAD_SELECT = `SELECT l.*, u.name AS owner_name, c.name AS contact_name, p.title AS opportunity_title, ic.provider AS integration_provider, ${tagsSql('lead', 'l')}
  FROM crm_leads l LEFT JOIN users u ON u.id=l.owner_id LEFT JOIN crm_contacts c ON c.id=l.contact_id
  LEFT JOIN crm_opportunities p ON p.id=l.opportunity_id LEFT JOIN integration_connections ic ON ic.id=l.integration_id`;
const OPPORTUNITY_SELECT = `SELECT p.*, u.name AS owner_name, c.name AS contact_name, o.name AS organization_name, ${tagsSql('opportunity', 'p')}
  FROM crm_opportunities p LEFT JOIN users u ON u.id=p.owner_id LEFT JOIN crm_contacts c ON c.id=p.contact_id LEFT JOIN crm_organizations o ON o.id=p.organization_id`;

/** Monta WHERE só com os filtros informados. */
class Filters {
  readonly clauses: string[] = [];
  readonly params: Array<string | number | null> = [];
  add(clause: string, ...params: Array<string | number | null>) { this.clauses.push(clause); this.params.push(...params); return this; }
  sql() { return this.clauses.length ? `WHERE ${this.clauses.join(' AND ')}` : ''; }
}

export interface ListOptions { q?: unknown; ownerId?: unknown; sourceId?: unknown; tag?: unknown; archived?: unknown; limit?: unknown; offset?: unknown; }
function paging(options: ListOptions): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(options.limit) || 200, 1), 500);
  const offset = Math.min(Math.max(Number(options.offset) || 0, 0), 1_000_000);
  return { limit, offset };
}
function commonFilters(filters: Filters, alias: string, type: CrmEntityType, options: ListOptions) {
  filters.add(options.archived === '1' || options.archived === true ? `${alias}.archived_at IS NOT NULL` : `${alias}.archived_at IS NULL`);
  if (typeof options.ownerId === 'string' && options.ownerId) filters.add(`${alias}.owner_id=?`, options.ownerId);
  if (typeof options.sourceId === 'string' && options.sourceId) filters.add(`${alias}.source_id=?`, options.sourceId);
  if (typeof options.tag === 'string' && options.tag.trim()) {
    filters.add(`EXISTS (SELECT 1 FROM crm_entity_tags et JOIN crm_tags t ON t.id=et.tag_id WHERE et.entity_type='${type}' AND et.entity_id=${alias}.id AND t.name=? COLLATE NOCASE)`, options.tag.trim().slice(0, 40));
  }
}

// ————————————————————————— Utilidades —————————————————————————

function exists(db: HubDatabase, table: string, id: unknown, label: string, allowArchived = false): string {
  if (typeof id !== 'string' || !id || !db.prepare(`SELECT 1 FROM ${table} WHERE id=?${allowArchived ? '' : ' AND archived_at IS NULL'}`).get(id)) throw new HttpError(400, `${label} não encontrado.`);
  return id;
}

function record(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

const defaultOwner = (actor: CrmActor) => (actor.type === 'user' || actor.type === 'ai' ? actor.id : null);

/** Empresa por id, ou por nome (reaproveita a existente, sem diferenciar maiúsculas) criando se preciso. */
function resolveOrganization(runtime: HubRuntime, actor: CrmActor, input: Record<string, unknown>, current: string | null): string | null {
  if (Object.hasOwn(input, 'organizationId')) {
    if (input.organizationId === null || input.organizationId === '') return null;
    return exists(runtime.db, 'crm_organizations', input.organizationId, 'Empresa');
  }
  const name = f.text(input.organizationName, 'o nome da empresa', 160);
  if (!name) return current;
  const found = runtime.db.prepare('SELECT id FROM crm_organizations WHERE name=? COLLATE NOCASE AND archived_at IS NULL').get(name) as { id: string } | undefined;
  if (found) return found.id;
  return insertOrganization(runtime, crmConfig(runtime), actor, { name });
}

// ————————————————————————— Empresas —————————————————————————

function organizationFields(runtime: HubRuntime, config: CrmConfig, input: Record<string, unknown>, current?: Row) {
  const has = (key: string) => !current || Object.hasOwn(input, key);
  return {
    name: has('name') ? f.text(input.name, 'o nome da empresa', 160, { required: true })! : String(current!.name),
    website: has('website') ? f.url(input.website, 'o site') : str(current!.website),
    email: has('email') ? f.email(input.email) : str(current!.email),
    phone: has('phone') ? f.phone(input.phone) : str(current!.phone),
    notes: has('notes') ? f.text(input.notes, 'as observações', 5000, { multiline: true }) : str(current!.notes),
    ownerId: has('ownerId') ? f.activeUser(runtime.db, input.ownerId) : str(current!.owner_id),
    sourceId: has('sourceId') ? f.sourceId(input.sourceId, crmSources(config)) : str(current!.source_id),
    custom: f.customValues(config, 'organization', input.custom, current ? f.parseJsonColumn(current.custom) : {}, { creating: !current }),
  };
}

function insertOrganization(runtime: HubRuntime, config: CrmConfig, actor: CrmActor, input: Record<string, unknown>): string {
  const fields = organizationFields(runtime, config, input);
  if (input.allowDuplicate !== true) {
    const clash = runtime.db.prepare('SELECT id,name FROM crm_organizations WHERE name=? COLLATE NOCASE AND archived_at IS NULL').get(fields.name) as { id: string; name: string } | undefined;
    if (clash) throw new HttpError(409, 'Já existe uma empresa com este nome.', 'duplicate', { id: clash.id, name: clash.name });
  }
  const id = randomUUID();
  const stamp = now();
  runtime.db.prepare(`INSERT INTO crm_organizations(id,name,website,email,phone,notes,owner_id,source_id,custom,created_by,created_at,updated_at,origin) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, fields.name, fields.website, fields.email, fields.phone, fields.notes, Object.hasOwn(input, 'ownerId') ? fields.ownerId : defaultOwner(actor), fields.sourceId, JSON.stringify(fields.custom), actor.id, stamp, stamp, originOf(actor));
  const tags = f.tags(input.tags);
  if (tags) setTags(runtime.db, 'organization', id, tags);
  addActivity(runtime.db, actor, { entityType: 'organization', entityId: id, kind: 'history', action: 'created', body: 'Empresa cadastrada.' });
  return id;
}

export function listOrganizations(runtime: HubRuntime, options: ListOptions = {}): OrganizationView[] {
  const config = crmConfig(runtime);
  const filters = new Filters();
  commonFilters(filters, 'o', 'organization', options);
  const q = f.likePattern(options.q);
  if (q) filters.add("(o.name LIKE ? ESCAPE '\\' OR o.email LIKE ? ESCAPE '\\' OR o.website LIKE ? ESCAPE '\\')", q, q, q);
  const { limit, offset } = paging(options);
  return (runtime.db.prepare(`${ORGANIZATION_SELECT} ${filters.sql()} ORDER BY o.name COLLATE NOCASE LIMIT ? OFFSET ?`).all(...filters.params, limit, offset) as Row[]).map(row => organizationView(config, row));
}

export function getOrganization(runtime: HubRuntime, id: string): OrganizationView {
  const row = runtime.db.prepare(`${ORGANIZATION_SELECT} WHERE o.id=?`).get(id) as Row | undefined;
  if (!row) throw new HttpError(404, 'Empresa não encontrada.');
  return organizationView(crmConfig(runtime), row);
}

export function createOrganization(runtime: HubRuntime, actor: CrmActor, input: unknown): OrganizationView {
  const config = crmConfig(runtime);
  const id = transaction(runtime.db, () => insertOrganization(runtime, config, actor, record(input)));
  return getOrganization(runtime, id);
}

export function updateOrganization(runtime: HubRuntime, actor: CrmActor, id: string, input: unknown): OrganizationView {
  const body = record(input);
  const config = crmConfig(runtime);
  transaction(runtime.db, () => {
    const current = runtime.db.prepare('SELECT * FROM crm_organizations WHERE id=?').get(id) as Row | undefined;
    if (!current) throw new HttpError(404, 'Empresa não encontrada.');
    const fields = organizationFields(runtime, config, body, current);
    runtime.db.prepare('UPDATE crm_organizations SET name=?,website=?,email=?,phone=?,notes=?,owner_id=?,source_id=?,custom=?,updated_at=? WHERE id=?')
      .run(fields.name, fields.website, fields.email, fields.phone, fields.notes, fields.ownerId, fields.sourceId, JSON.stringify(fields.custom), now(), id);
    recordChanges(runtime.db, actor, 'organization', id, current, { name: fields.name, website: fields.website, email: fields.email, phone: fields.phone, notes: fields.notes, owner_id: fields.ownerId, source_id: fields.sourceId, custom: JSON.stringify(fields.custom) });
    applyTags(runtime.db, actor, 'organization', id, body.tags);
  });
  return getOrganization(runtime, id);
}

// ————————————————————————— Contatos —————————————————————————

function contactFields(runtime: HubRuntime, config: CrmConfig, actor: CrmActor, input: Record<string, unknown>, current?: Row) {
  const has = (key: string) => !current || Object.hasOwn(input, key);
  return {
    name: has('name') ? f.text(input.name, 'o nome', 160, { required: true })! : String(current!.name),
    email: has('email') ? f.email(input.email) : str(current!.email),
    phone: has('phone') ? f.phone(input.phone) : str(current!.phone),
    jobTitle: has('jobTitle') ? f.text(input.jobTitle, 'o cargo', 120) : str(current!.job_title),
    relationship: has('relationship') ? (input.relationship === undefined || input.relationship === null || input.relationship === '' ? 'prospect' : f.oneOf(input.relationship, RELATIONSHIPS, 'tipo de relação')) : current!.relationship as Relationship,
    organizationId: resolveOrganization(runtime, actor, input, current ? str(current.organization_id) : null),
    ownerId: has('ownerId') ? f.activeUser(runtime.db, input.ownerId) : str(current!.owner_id),
    sourceId: has('sourceId') ? f.sourceId(input.sourceId, crmSources(config)) : str(current!.source_id),
    notes: has('notes') ? f.text(input.notes, 'as observações', 5000, { multiline: true }) : str(current!.notes),
    custom: f.customValues(config, 'contact', input.custom, current ? f.parseJsonColumn(current.custom) : {}, { creating: !current }),
  };
}

function insertContact(runtime: HubRuntime, config: CrmConfig, actor: CrmActor, input: Record<string, unknown>, history = 'Contato cadastrado.'): string {
  const fields = contactFields(runtime, config, actor, input);
  if (fields.email && input.allowDuplicate !== true) {
    const clash = runtime.db.prepare('SELECT id,name FROM crm_contacts WHERE email=? COLLATE NOCASE AND archived_at IS NULL').get(fields.email) as { id: string; name: string } | undefined;
    if (clash) throw new HttpError(409, 'Já existe um contato com este e-mail.', 'duplicate', { id: clash.id, name: clash.name });
  }
  const id = randomUUID();
  const stamp = now();
  runtime.db.prepare(`INSERT INTO crm_contacts(id,name,email,phone,job_title,organization_id,relationship,source_id,owner_id,notes,custom,created_by,created_at,updated_at,origin)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, fields.name, fields.email, fields.phone, fields.jobTitle, fields.organizationId, fields.relationship, fields.sourceId,
    Object.hasOwn(input, 'ownerId') ? fields.ownerId : defaultOwner(actor), fields.notes, JSON.stringify(fields.custom), actor.id, stamp, stamp, originOf(actor));
  const tags = f.tags(input.tags);
  if (tags) setTags(runtime.db, 'contact', id, tags);
  addActivity(runtime.db, actor, { entityType: 'contact', entityId: id, kind: 'history', action: 'created', body: history, data: fields.sourceId ? { sourceId: fields.sourceId } : {} });
  return id;
}

export function listContacts(runtime: HubRuntime, options: ListOptions & { relationship?: unknown; organizationId?: unknown } = {}): ContactView[] {
  const config = crmConfig(runtime);
  const filters = new Filters();
  commonFilters(filters, 'c', 'contact', options);
  const q = f.likePattern(options.q);
  if (q) filters.add("(c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\')", q, q, q, q);
  if (typeof options.relationship === 'string' && (RELATIONSHIPS as readonly string[]).includes(options.relationship)) filters.add('c.relationship=?', options.relationship);
  if (typeof options.organizationId === 'string' && options.organizationId) filters.add('c.organization_id=?', options.organizationId);
  const { limit, offset } = paging(options);
  return (runtime.db.prepare(`${CONTACT_SELECT} ${filters.sql()} ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`).all(...filters.params, limit, offset) as Row[]).map(row => contactView(config, row));
}

export function getContact(runtime: HubRuntime, id: string): ContactView {
  const row = runtime.db.prepare(`${CONTACT_SELECT} WHERE c.id=?`).get(id) as Row | undefined;
  if (!row) throw new HttpError(404, 'Contato não encontrado.');
  return contactView(crmConfig(runtime), row);
}

export function createContact(runtime: HubRuntime, actor: CrmActor, input: unknown): ContactView {
  const config = crmConfig(runtime);
  const id = transaction(runtime.db, () => insertContact(runtime, config, actor, record(input)));
  return getContact(runtime, id);
}

export function updateContact(runtime: HubRuntime, actor: CrmActor, id: string, input: unknown): ContactView {
  const body = record(input);
  const config = crmConfig(runtime);
  transaction(runtime.db, () => {
    const current = runtime.db.prepare('SELECT * FROM crm_contacts WHERE id=?').get(id) as Row | undefined;
    if (!current) throw new HttpError(404, 'Contato não encontrado.');
    const fields = contactFields(runtime, config, actor, body, current);
    if (fields.email && fields.email !== current.email && body.allowDuplicate !== true) {
      const clash = runtime.db.prepare('SELECT id,name FROM crm_contacts WHERE email=? COLLATE NOCASE AND id<>? AND archived_at IS NULL').get(fields.email, id) as { id: string; name: string } | undefined;
      if (clash) throw new HttpError(409, 'Já existe um contato com este e-mail.', 'duplicate', { id: clash.id, name: clash.name });
    }
    runtime.db.prepare('UPDATE crm_contacts SET name=?,email=?,phone=?,job_title=?,organization_id=?,relationship=?,source_id=?,owner_id=?,notes=?,custom=?,updated_at=? WHERE id=?')
      .run(fields.name, fields.email, fields.phone, fields.jobTitle, fields.organizationId, fields.relationship, fields.sourceId, fields.ownerId, fields.notes, JSON.stringify(fields.custom), now(), id);
    recordChanges(runtime.db, actor, 'contact', id, current, { name: fields.name, email: fields.email, phone: fields.phone, job_title: fields.jobTitle, organization_id: fields.organizationId, relationship: fields.relationship, source_id: fields.sourceId, owner_id: fields.ownerId, notes: fields.notes, custom: JSON.stringify(fields.custom) });
    applyTags(runtime.db, actor, 'contact', id, body.tags);
  });
  return getContact(runtime, id);
}

const FIELD_NAMES: Record<string, string> = {
  name: 'nome', email: 'e-mail', phone: 'telefone', job_title: 'cargo', organization_id: 'empresa', relationship: 'relação', source_id: 'origem',
  owner_id: 'responsável', notes: 'observações', custom: 'campos personalizados', website: 'site', company: 'empresa', message: 'mensagem',
  priority: 'prioridade', title: 'título', value_cents: 'valor', expected_close_date: 'previsão de fechamento', contact_id: 'contato',
};

/** Histórico de edição: registra QUAIS campos mudaram (sem copiar dados pessoais para o histórico). */
function recordChanges(db: HubDatabase, actor: CrmActor, type: CrmEntityType, id: string, current: Row, next: Record<string, unknown>) {
  const changed = Object.entries(next).filter(([key, value]) => (current[key] ?? null) !== (value ?? null)).map(([key]) => key);
  if (!changed.length) return;
  if (changed.includes('owner_id')) {
    const name = next.owner_id ? (db.prepare('SELECT name FROM users WHERE id=?').get(String(next.owner_id)) as { name: string } | undefined)?.name ?? null : null;
    addActivity(db, actor, { entityType: type, entityId: id, kind: 'history', action: 'owner_changed', body: name ? `Responsável: ${name}.` : 'Sem responsável.', data: { from: current.owner_id ?? null, to: next.owner_id ?? null } });
  }
  if (changed.includes('value_cents')) {
    addActivity(db, actor, { entityType: type, entityId: id, kind: 'history', action: 'value_changed', body: 'Valor atualizado.', data: { from: current.value_cents ?? null, to: next.value_cents ?? null } });
  }
  const rest = changed.filter(key => key !== 'owner_id' && key !== 'value_cents');
  if (rest.length) addActivity(db, actor, { entityType: type, entityId: id, kind: 'history', action: 'updated', body: `Atualizou: ${rest.map(key => FIELD_NAMES[key] ?? key).join(', ')}.`, data: { fields: rest } });
}

function applyTags(db: HubDatabase, actor: CrmActor, type: CrmEntityType, id: string, raw: unknown) {
  const next = f.tags(raw);
  if (!next) return;
  const { added, removed } = setTags(db, type, id, next);
  if (added.length || removed.length) addActivity(db, actor, { entityType: type, entityId: id, kind: 'history', action: 'tags_changed', body: [added.length ? `+ ${added.join(', ')}` : '', removed.length ? `− ${removed.join(', ')}` : ''].filter(Boolean).join(' '), data: { added, removed } });
}

// ————————————————————————— Leads —————————————————————————

function leadFields(runtime: HubRuntime, config: CrmConfig, input: Record<string, unknown>, current?: Row, enforceRequired = true) {
  const has = (key: string) => !current || Object.hasOwn(input, key);
  return {
    name: has('name') ? f.text(input.name, 'o nome', 160, { required: true })! : String(current!.name),
    email: has('email') ? f.email(input.email) : str(current!.email),
    phone: has('phone') ? f.phone(input.phone) : str(current!.phone),
    company: has('company') ? f.text(input.company, 'a empresa', 160) : str(current!.company),
    message: has('message') ? f.text(input.message, 'a mensagem', 5000, { multiline: true }) : str(current!.message),
    sourceId: has('sourceId') ? f.sourceId(input.sourceId, crmSources(config)) : str(current!.source_id),
    ownerId: has('ownerId') ? f.activeUser(runtime.db, input.ownerId) : str(current!.owner_id),
    priority: has('priority') ? f.priority(input.priority) : current!.priority as f.Priority,
    custom: f.customValues(config, 'lead', input.custom, current ? f.parseJsonColumn(current.custom) : {}, { creating: !current, enforceRequired }),
  };
}

export interface LeadIntake { integrationId: string; externalRef: string; provider: string; occurredAt?: string | null; }

/** Cria um lead. Pela integração, o par (conexão, id externo) garante que o mesmo lead nunca entra duas vezes. */
export function insertLead(runtime: HubRuntime, config: CrmConfig, actor: CrmActor, input: Record<string, unknown>, intake?: LeadIntake): { id: string; duplicate: boolean } {
  if (intake) {
    const existing = runtime.db.prepare('SELECT id FROM crm_leads WHERE integration_id=? AND external_ref=?').get(intake.integrationId, intake.externalRef) as { id: string } | undefined;
    if (existing) return { id: existing.id, duplicate: true };
  }
  const fields = leadFields(runtime, config, input, undefined, !intake);
  const status = input.status === undefined || input.status === null || input.status === '' ? 'new' : f.oneOf(input.status, ['new', 'working', 'qualified'] as const, 'situação do lead');
  const id = randomUUID();
  const stamp = now();
  runtime.db.prepare(`INSERT INTO crm_leads(id,name,email,phone,company,message,status,source_id,owner_id,priority,attribution,custom,integration_id,external_ref,created_by,created_at,updated_at,origin)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, fields.name, fields.email, fields.phone, fields.company, fields.message, status,
    fields.sourceId ?? (intake ? null : 'manual'), Object.hasOwn(input, 'ownerId') ? fields.ownerId : defaultOwner(actor), fields.priority,
    JSON.stringify(f.attribution(input.attribution)), JSON.stringify(fields.custom), intake?.integrationId ?? null, intake?.externalRef ?? null,
    actor.type === 'integration' ? null : actor.id, intake?.occurredAt ?? stamp, stamp, originOf(actor));
  const tags = f.tags(input.tags);
  if (tags) setTags(runtime.db, 'lead', id, tags);
  const source = sourceLabel(config, fields.sourceId ?? (intake ? null : 'manual'));
  addActivity(runtime.db, actor, {
    entityType: 'lead', entityId: id, kind: 'history', action: 'created', occurredAt: intake?.occurredAt ?? null,
    body: intake ? `Lead recebido pela integração ${intake.provider}${source ? ` (origem: ${source})` : ''}.` : `Lead cadastrado${source ? ` (origem: ${source})` : ''}.`,
    data: { sourceId: fields.sourceId, ...(intake ? { provider: intake.provider } : {}) },
  });
  runAutomations(runtime.db, config, 'lead_created', { entityType: 'lead', entityId: id, name: fields.name, ownerId: Object.hasOwn(input, 'ownerId') ? fields.ownerId : defaultOwner(actor) });
  return { id, duplicate: false };
}

export function listLeads(runtime: HubRuntime, options: ListOptions & { status?: unknown; contactId?: unknown } = {}): LeadView[] {
  const config = crmConfig(runtime);
  const filters = new Filters();
  commonFilters(filters, 'l', 'lead', options);
  if (typeof options.contactId === 'string' && options.contactId) filters.add('l.contact_id=?', options.contactId);
  const q = f.likePattern(options.q);
  if (q) filters.add("(l.name LIKE ? ESCAPE '\\' OR l.email LIKE ? ESCAPE '\\' OR l.phone LIKE ? ESCAPE '\\' OR l.company LIKE ? ESCAPE '\\')", q, q, q, q);
  if (options.status === 'active') filters.add("l.status IN ('new','working','qualified')");
  else if (typeof options.status === 'string' && (LEAD_STATUSES as readonly string[]).includes(options.status)) filters.add('l.status=?', options.status);
  const { limit, offset } = paging(options);
  return (runtime.db.prepare(`${LEAD_SELECT} ${filters.sql()} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`).all(...filters.params, limit, offset) as Row[]).map(row => leadView(config, row));
}

export function getLead(runtime: HubRuntime, id: string): LeadView {
  const row = runtime.db.prepare(`${LEAD_SELECT} WHERE l.id=?`).get(id) as Row | undefined;
  if (!row) throw new HttpError(404, 'Lead não encontrado.');
  return leadView(crmConfig(runtime), row);
}

/** Contatos já cadastrados com o mesmo e-mail ou telefone (sugestão; nada é unido sozinho). */
export function leadMatches(runtime: HubRuntime, lead: LeadView): Array<{ id: string; name: string }> {
  const found = new Map<string, string>();
  if (lead.email) {
    for (const row of runtime.db.prepare('SELECT id,name FROM crm_contacts WHERE archived_at IS NULL AND email=? COLLATE NOCASE LIMIT 5').all(lead.email) as Array<{ id: string; name: string }>) found.set(row.id, row.name);
  }
  const digits = lead.phone?.replace(/\D/g, '') ?? '';
  if (digits.length >= 8) {
    const tail = digits.slice(-8);
    for (const row of runtime.db.prepare('SELECT id,name,phone FROM crm_contacts WHERE archived_at IS NULL AND phone IS NOT NULL ORDER BY updated_at DESC LIMIT 5000').all() as Array<{ id: string; name: string; phone: string }>) {
      if (row.phone.replace(/\D/g, '').endsWith(tail)) found.set(row.id, row.name);
    }
  }
  return [...found].slice(0, 5).map(([id, name]) => ({ id, name }));
}

export function createLead(runtime: HubRuntime, actor: CrmActor, input: unknown): LeadView {
  const config = crmConfig(runtime);
  const { id } = transaction(runtime.db, () => insertLead(runtime, config, actor, record(input)));
  return getLead(runtime, id);
}

export function updateLead(runtime: HubRuntime, actor: CrmActor, id: string, input: unknown): LeadView {
  const body = record(input);
  const config = crmConfig(runtime);
  transaction(runtime.db, () => {
    const current = runtime.db.prepare('SELECT * FROM crm_leads WHERE id=?').get(id) as Row | undefined;
    if (!current) throw new HttpError(404, 'Lead não encontrado.');
    const fields = leadFields(runtime, config, body, current);
    let status = current.status as LeadStatus;
    if (Object.hasOwn(body, 'status') && body.status !== current.status) {
      if (current.status === 'converted' || current.status === 'disqualified') throw new HttpError(409, 'Este lead já foi encerrado; reabra pela ação "Reativar".');
      status = f.oneOf(body.status, ['new', 'working', 'qualified'] as const, 'situação do lead');
    }
    runtime.db.prepare('UPDATE crm_leads SET name=?,email=?,phone=?,company=?,message=?,status=?,source_id=?,owner_id=?,priority=?,custom=?,updated_at=? WHERE id=?')
      .run(fields.name, fields.email, fields.phone, fields.company, fields.message, status, fields.sourceId, fields.ownerId, fields.priority, JSON.stringify(fields.custom), now(), id);
    if (status !== current.status) addActivity(runtime.db, actor, { entityType: 'lead', entityId: id, kind: 'history', action: 'status_changed', body: `Situação: ${LEAD_STATUS_LABELS[status]}.`, data: { from: current.status, to: status } });
    recordChanges(runtime.db, actor, 'lead', id, current, { name: fields.name, email: fields.email, phone: fields.phone, company: fields.company, message: fields.message, source_id: fields.sourceId, owner_id: fields.ownerId, priority: fields.priority, custom: JSON.stringify(fields.custom) });
    applyTags(runtime.db, actor, 'lead', id, body.tags);
  });
  return getLead(runtime, id);
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = { new: 'Novo', working: 'Em atendimento', qualified: 'Qualificado', disqualified: 'Descartado', converted: 'Convertido' };

export function disqualifyLead(runtime: HubRuntime, actor: CrmActor, id: string, input: unknown): LeadView {
  const reason = f.text(record(input).reason, 'o motivo', 200, { required: true })!;
  transaction(runtime.db, () => {
    const current = runtime.db.prepare('SELECT status FROM crm_leads WHERE id=? AND archived_at IS NULL').get(id) as { status: string } | undefined;
    if (!current) throw new HttpError(404, 'Lead não encontrado.');
    if (current.status === 'converted') throw new HttpError(409, 'Lead já convertido.');
    runtime.db.prepare("UPDATE crm_leads SET status='disqualified', disqualify_reason=?, updated_at=? WHERE id=?").run(reason, now(), id);
    addActivity(runtime.db, actor, { entityType: 'lead', entityId: id, kind: 'history', action: 'disqualified', body: `Descartado: ${reason}.`, data: { reason } });
  });
  return getLead(runtime, id);
}

export function reopenLead(runtime: HubRuntime, actor: CrmActor, id: string): LeadView {
  transaction(runtime.db, () => {
    const current = runtime.db.prepare('SELECT status FROM crm_leads WHERE id=? AND archived_at IS NULL').get(id) as { status: string } | undefined;
    if (!current) throw new HttpError(404, 'Lead não encontrado.');
    if (current.status !== 'disqualified') throw new HttpError(409, 'Somente leads descartados podem ser reativados.');
    runtime.db.prepare("UPDATE crm_leads SET status='working', disqualify_reason=NULL, updated_at=? WHERE id=?").run(now(), id);
    addActivity(runtime.db, actor, { entityType: 'lead', entityId: id, kind: 'history', action: 'reopened', body: 'Lead reativado.' });
  });
  return getLead(runtime, id);
}

/**
 * Converte o lead: liga a um contato (existente, escolhido ou encontrado pelo e-mail) ou cria um,
 * resolve a empresa e, se pedido, abre a oportunidade no funil. Tudo numa transação, com histórico.
 */
export function convertLeadTx(runtime: HubRuntime, config: CrmConfig, actor: CrmActor, id: string, input: Record<string, unknown>): { contactId: string; opportunityId: string | null } {
  const lead = runtime.db.prepare('SELECT * FROM crm_leads WHERE id=? AND archived_at IS NULL').get(id) as Row | undefined;
  if (!lead) throw new HttpError(404, 'Lead não encontrado.');
  if (lead.status === 'converted' || lead.status === 'disqualified') throw new HttpError(409, 'Este lead já foi encerrado.');
  const organizationInput: Record<string, unknown> = Object.hasOwn(input, 'organizationId') ? { organizationId: input.organizationId }
    : { organizationName: input.organizationName ?? lead.company ?? undefined };
  const organizationId = resolveOrganization(runtime, actor, organizationInput, null);
  let contactId: string;
  let linked = false;
  if (typeof input.contactId === 'string' && input.contactId) {
    contactId = exists(runtime.db, 'crm_contacts', input.contactId, 'Contato');
    linked = true;
  } else {
    const byEmail = lead.email ? runtime.db.prepare('SELECT id FROM crm_contacts WHERE email=? COLLATE NOCASE AND archived_at IS NULL').get(String(lead.email)) as { id: string } | undefined : undefined;
    if (byEmail) { contactId = byEmail.id; linked = true; }
    else {
      contactId = insertContact(runtime, config, actor, {
        name: lead.name, email: lead.email, phone: lead.phone, relationship: 'prospect', sourceId: lead.source_id, ownerId: lead.owner_id ?? defaultOwner(actor),
        ...(organizationId ? { organizationId } : {}), allowDuplicate: true,
      }, 'Contato criado a partir de um lead.');
    }
  }
  if (linked) {
    if (organizationId) runtime.db.prepare('UPDATE crm_contacts SET organization_id=COALESCE(organization_id, ?), updated_at=? WHERE id=?').run(organizationId, now(), contactId);
    addActivity(runtime.db, actor, { entityType: 'contact', entityId: contactId, kind: 'history', action: 'lead_linked', body: 'Lead vinculado a este contato.', data: { leadId: id } });
  }
  let opportunityId: string | null = null;
  if (input.createOpportunity !== false) {
    opportunityId = insertOpportunity(runtime, config, actor, {
      title: input.title ?? (lead.company ? String(lead.company) : String(lead.name)), pipelineId: input.pipelineId, stageId: input.stageId, value: input.value,
      contactId, ...(organizationId ? { organizationId } : {}), ownerId: input.ownerId ?? lead.owner_id ?? defaultOwner(actor), sourceId: lead.source_id,
      priority: lead.priority, attribution: f.parseJsonColumn(lead.attribution),
    }, { leadId: id });
  }
  runtime.db.prepare("UPDATE crm_leads SET status='converted', contact_id=?, opportunity_id=?, converted_at=?, updated_at=? WHERE id=?").run(contactId, opportunityId, now(), now(), id);
  addActivity(runtime.db, actor, { entityType: 'lead', entityId: id, kind: 'history', action: 'converted', body: opportunityId ? 'Lead convertido em contato e oportunidade.' : 'Lead convertido em contato.', data: { contactId, opportunityId } });
  return { contactId, opportunityId };
}

export function convertLead(runtime: HubRuntime, actor: CrmActor, id: string, input: unknown) {
  const config = crmConfig(runtime);
  const result = transaction(runtime.db, () => convertLeadTx(runtime, config, actor, id, record(input)));
  return { lead: getLead(runtime, id), contact: getContact(runtime, result.contactId), opportunity: result.opportunityId ? getOpportunity(runtime, result.opportunityId) : null };
}

// ————————————————————————— Oportunidades —————————————————————————

function opportunityFields(runtime: HubRuntime, config: CrmConfig, input: Record<string, unknown>, current?: Row) {
  const has = (key: string) => !current || Object.hasOwn(input, key);
  const contactId = has('contactId') ? (input.contactId ? exists(runtime.db, 'crm_contacts', input.contactId, 'Contato') : null) : str(current!.contact_id);
  let organizationId = has('organizationId') ? (input.organizationId ? exists(runtime.db, 'crm_organizations', input.organizationId, 'Empresa') : null) : str(current!.organization_id);
  if (!current && !organizationId && contactId) organizationId = (runtime.db.prepare('SELECT organization_id FROM crm_contacts WHERE id=?').get(contactId) as { organization_id: string | null }).organization_id;
  return {
    title: has('title') ? f.text(input.title, 'o título', 160, { required: true })! : String(current!.title),
    valueCents: has('value') ? f.money(input.value) : (current!.value_cents as number | null),
    priority: has('priority') ? f.priority(input.priority) : current!.priority as f.Priority,
    expectedCloseDate: has('expectedCloseDate') ? f.isoDate(input.expectedCloseDate, 'a previsão de fechamento') : str(current!.expected_close_date),
    contactId, organizationId,
    ownerId: has('ownerId') ? f.activeUser(runtime.db, input.ownerId) : str(current!.owner_id),
    sourceId: has('sourceId') ? f.sourceId(input.sourceId, crmSources(config)) : str(current!.source_id),
    notes: has('notes') ? f.text(input.notes, 'as observações', 5000, { multiline: true }) : str(current!.notes),
    custom: f.customValues(config, 'opportunity', input.custom, current ? f.parseJsonColumn(current.custom) : {}, { creating: !current }),
  };
}

type OpportunityState = { valueCents: number | null; expectedCloseDate: string | null; ownerId: string | null; contactId: string | null; organizationId: string | null; priority: string; sourceId: string | null; custom: Record<string, unknown> };

/** Regras da etapa (definidas na Base): campos que precisam estar preenchidos para entrar nela. */
export function missingForStage(config: CrmConfig, stage: CrmStage, state: OpportunityState): string[] {
  const labels = crmLabels(config);
  const missing: string[] = [];
  for (const key of stage.requiredFields ?? []) {
    const empty = key === 'value' ? !state.valueCents
      : key === 'expectedCloseDate' ? !state.expectedCloseDate
        : key === 'ownerId' ? !state.ownerId
          : key === 'contactId' ? !state.contactId
            : key === 'organizationId' ? !state.organizationId
              : key === 'priority' ? !state.priority
                : key === 'sourceId' ? !state.sourceId
                  : key.startsWith('custom.') ? [undefined, null, ''].includes(state.custom[key.slice(7)] as never) || (Array.isArray(state.custom[key.slice(7)]) && !(state.custom[key.slice(7)] as unknown[]).length)
                    : false;
    if (!empty) continue;
    missing.push(key === 'contactId' ? labels.contact : key === 'organizationId' ? labels.organization
      : key.startsWith('custom.') ? config.customFields.find(field => field.entity === 'opportunity' && field.id === key.slice(7))?.label ?? key : REQUIRED_FIELD_LABELS[key] ?? key);
  }
  return missing;
}

function assertStageRules(config: CrmConfig, stage: CrmStage, state: OpportunityState) {
  const missing = missingForStage(config, stage, state);
  if (missing.length) throw new HttpError(422, `Para ficar em "${stage.name}", preencha: ${missing.join(', ')}.`, 'stage-requirements', { stage: stage.id, missing, fields: stage.requiredFields ?? [] });
}

function lostReason(config: CrmConfig, input: Record<string, unknown>): { reason: string; note: string | null } {
  const reason = f.text(input.lostReason, 'o motivo da perda', 80, { required: true })!;
  if (!config.lostReasons.includes(reason)) throw new HttpError(400, 'Escolha um dos motivos de perda configurados no CRM.');
  return { reason, note: f.text(input.lostNote, 'a observação da perda', 1000, { multiline: true }) };
}

function nextPosition(db: HubDatabase, pipelineId: string, stageId: string): number {
  return Number((db.prepare('SELECT COALESCE(MAX(position),0)+1 AS p FROM crm_opportunities WHERE pipeline_id=? AND stage_id=? AND archived_at IS NULL').get(pipelineId, stageId) as { p: number }).p);
}

function statusFor(stage: CrmStage): OpportunityStatus {
  return stage.kind === 'open' ? 'open' : stage.kind;
}

function afterEntering(runtime: HubRuntime, config: CrmConfig, actor: CrmActor, id: string, pipeline: CrmPipeline, stage: CrmStage, statusChanged: boolean) {
  const row = runtime.db.prepare('SELECT title, owner_id, contact_id FROM crm_opportunities WHERE id=?').get(id) as { title: string; owner_id: string | null; contact_id: string | null };
  const target = { entityType: 'opportunity' as const, entityId: id, name: row.title, pipelineId: pipeline.id, stageId: stage.id, ownerId: row.owner_id };
  runAutomations(runtime.db, config, 'stage_entered', target);
  if (!statusChanged) return;
  if (stage.kind === 'won') {
    runAutomations(runtime.db, config, 'deal_won', target);
    // Negócio ganho: o contato deixa de ser prospecção e passa a cliente.
    if (row.contact_id && runtime.db.prepare("UPDATE crm_contacts SET relationship='customer', updated_at=? WHERE id=? AND relationship='prospect'").run(now(), row.contact_id).changes) {
      addActivity(runtime.db, actor, { entityType: 'contact', entityId: row.contact_id, kind: 'history', action: 'relationship_changed', body: `Passou a cliente (negócio ganho: ${row.title}).`, data: { from: 'prospect', to: 'customer', opportunityId: id } });
    }
  } else if (stage.kind === 'lost') runAutomations(runtime.db, config, 'deal_lost', target);
}

export function insertOpportunity(runtime: HubRuntime, config: CrmConfig, actor: CrmActor, input: Record<string, unknown>, extra: { leadId?: string } = {}): string {
  const pipeline = pipelineOf(config, input.pipelineId);
  const stage = input.stageId ? stageOf(pipeline, input.stageId) : firstOpenStage(pipeline);
  const fields = opportunityFields(runtime, config, input);
  const ownerId = Object.hasOwn(input, 'ownerId') ? fields.ownerId : defaultOwner(actor);
  assertStageRules(config, stage, { ...fields, ownerId });
  const lost = stage.kind === 'lost' ? lostReason(config, input) : null;
  const id = randomUUID();
  const stamp = now();
  runtime.db.prepare(`INSERT INTO crm_opportunities(id,title,pipeline_id,stage_id,status,value_cents,currency,priority,expected_close_date,contact_id,organization_id,lead_id,source_id,owner_id,
      lost_reason,lost_note,closed_at,stage_entered_at,position,notes,attribution,custom,created_by,created_at,updated_at,origin)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, fields.title, pipeline.id, stage.id, statusFor(stage), fields.valueCents, config.currency, fields.priority,
    fields.expectedCloseDate, fields.contactId, fields.organizationId, extra.leadId ?? null, fields.sourceId, ownerId, lost?.reason ?? null, lost?.note ?? null,
    stage.kind === 'open' ? null : stamp, stamp, nextPosition(runtime.db, pipeline.id, stage.id), fields.notes, JSON.stringify(f.attribution(input.attribution)),
    JSON.stringify(fields.custom), actor.type === 'integration' ? null : actor.id, stamp, stamp, originOf(actor));
  const tags = f.tags(input.tags);
  if (tags) setTags(runtime.db, 'opportunity', id, tags);
  addActivity(runtime.db, actor, { entityType: 'opportunity', entityId: id, kind: 'history', action: 'created', body: `${crmLabels(config).opportunity} criada em "${stage.name}" (${pipeline.name}).`, data: { pipelineId: pipeline.id, stageId: stage.id, leadId: extra.leadId ?? null } });
  afterEntering(runtime, config, actor, id, pipeline, stage, stage.kind !== 'open');
  return id;
}

export interface OpportunityFilters extends ListOptions { status?: unknown; pipelineId?: unknown; contactId?: unknown; organizationId?: unknown; }

export function listOpportunities(runtime: HubRuntime, options: OpportunityFilters = {}): OpportunityView[] {
  const config = crmConfig(runtime);
  const filters = new Filters();
  commonFilters(filters, 'p', 'opportunity', options);
  const q = f.likePattern(options.q);
  if (q) filters.add("(p.title LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\')", q, q, q);
  if (typeof options.status === 'string' && ['open', 'won', 'lost'].includes(options.status)) filters.add('p.status=?', options.status);
  if (typeof options.pipelineId === 'string' && options.pipelineId) filters.add('p.pipeline_id=?', options.pipelineId);
  if (typeof options.contactId === 'string' && options.contactId) filters.add('p.contact_id=?', options.contactId);
  if (typeof options.organizationId === 'string' && options.organizationId) filters.add('p.organization_id=?', options.organizationId);
  const { limit, offset } = paging(options);
  return (runtime.db.prepare(`${OPPORTUNITY_SELECT} ${filters.sql()} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`).all(...filters.params, limit, offset) as Row[]).map(row => opportunityView(config, row));
}

export function getOpportunity(runtime: HubRuntime, id: string): OpportunityView {
  const row = runtime.db.prepare(`${OPPORTUNITY_SELECT} WHERE p.id=?`).get(id) as Row | undefined;
  if (!row) throw new HttpError(404, 'Oportunidade não encontrada.');
  return opportunityView(crmConfig(runtime), row);
}

export function createOpportunity(runtime: HubRuntime, actor: CrmActor, input: unknown): OpportunityView {
  const config = crmConfig(runtime);
  const id = transaction(runtime.db, () => insertOpportunity(runtime, config, actor, record(input)));
  return getOpportunity(runtime, id);
}

export function updateOpportunity(runtime: HubRuntime, actor: CrmActor, id: string, input: unknown): OpportunityView {
  const body = record(input);
  const config = crmConfig(runtime);
  transaction(runtime.db, () => updateOpportunityTx(runtime, config, actor, id, body));
  return getOpportunity(runtime, id);
}

function updateOpportunityTx(runtime: HubRuntime, config: CrmConfig, actor: CrmActor, id: string, body: Record<string, unknown>) {
  const current = runtime.db.prepare('SELECT * FROM crm_opportunities WHERE id=?').get(id) as Row | undefined;
  if (!current) throw new HttpError(404, 'Oportunidade não encontrada.');
  const fields = opportunityFields(runtime, config, body, current);
  // Editar não pode deixar a oportunidade fora da regra da etapa em que ela está.
  const found = findStage(config, String(current.pipeline_id), String(current.stage_id));
  if (found) assertStageRules(config, found.stage, fields);
  runtime.db.prepare('UPDATE crm_opportunities SET title=?,value_cents=?,priority=?,expected_close_date=?,contact_id=?,organization_id=?,owner_id=?,source_id=?,notes=?,custom=?,updated_at=? WHERE id=?')
    .run(fields.title, fields.valueCents, fields.priority, fields.expectedCloseDate, fields.contactId, fields.organizationId, fields.ownerId, fields.sourceId, fields.notes, JSON.stringify(fields.custom), now(), id);
  recordChanges(runtime.db, actor, 'opportunity', id, current, { title: fields.title, value_cents: fields.valueCents, priority: fields.priority, expected_close_date: fields.expectedCloseDate, contact_id: fields.contactId, organization_id: fields.organizationId, owner_id: fields.ownerId, source_id: fields.sourceId, notes: fields.notes, custom: JSON.stringify(fields.custom) });
  applyTags(runtime.db, actor, 'opportunity', id, body.tags);
}

/**
 * Move no funil (inclusive entre funis). Aplica as regras da etapa de destino, exige motivo ao
 * perder, registra histórico e roda as automações de entrada, ganho e perda.
 */
export function moveOpportunity(runtime: HubRuntime, actor: CrmActor, id: string, input: unknown): OpportunityView {
  const body = record(input);
  const config = crmConfig(runtime);
  transaction(runtime.db, () => {
    if (body.patch !== undefined) updateOpportunityTxForMove(runtime, config, actor, id, record(body.patch));
    const current = runtime.db.prepare('SELECT * FROM crm_opportunities WHERE id=? AND archived_at IS NULL').get(id) as Row | undefined;
    if (!current) throw new HttpError(404, 'Oportunidade não encontrada.');
    const currentPipelineExists = config.pipelines.some(pipeline => pipeline.id === current.pipeline_id);
    if (!body.pipelineId && !currentPipelineExists) throw new HttpError(400, 'O funil desta oportunidade saiu da configuração; escolha o funil de destino.');
    const pipeline = pipelineOf(config, body.pipelineId ?? current.pipeline_id);
    const stage = stageOf(pipeline, body.stageId);
    const state: OpportunityState = {
      valueCents: current.value_cents as number | null, expectedCloseDate: str(current.expected_close_date), ownerId: str(current.owner_id), contactId: str(current.contact_id),
      organizationId: str(current.organization_id), priority: String(current.priority), sourceId: str(current.source_id), custom: f.parseJsonColumn(current.custom),
    };
    assertStageRules(config, stage, state);
    const status = statusFor(stage);
    const stageChanged = stage.id !== current.stage_id || pipeline.id !== current.pipeline_id;
    const statusChanged = status !== current.status;
    const lost = stage.kind === 'lost' && (statusChanged || body.lostReason !== undefined) ? lostReason(config, body) : null;
    let position = nextPosition(runtime.db, pipeline.id, stage.id);
    if (typeof body.beforeId === 'string' && body.beforeId && body.beforeId !== id) {
      const before = runtime.db.prepare('SELECT position FROM crm_opportunities WHERE id=? AND pipeline_id=? AND stage_id=?').get(body.beforeId, pipeline.id, stage.id) as { position: number } | undefined;
      if (before) {
        const previous = runtime.db.prepare('SELECT MAX(position) AS p FROM crm_opportunities WHERE pipeline_id=? AND stage_id=? AND position<? AND id<>?').get(pipeline.id, stage.id, before.position, id) as { p: number | null };
        position = ((previous.p ?? before.position - 1) + Number(before.position)) / 2;
      }
    } else if (!stageChanged) position = Number(current.position);
    const stamp = now();
    runtime.db.prepare(`UPDATE crm_opportunities SET pipeline_id=?, stage_id=?, status=?, stage_entered_at=?, closed_at=?, lost_reason=?, lost_note=?, position=?, updated_at=? WHERE id=?`)
      .run(pipeline.id, stage.id, status, stageChanged ? stamp : String(current.stage_entered_at), status === 'open' ? null : statusChanged ? stamp : str(current.closed_at),
        status === 'lost' ? (lost?.reason ?? str(current.lost_reason)) : null, status === 'lost' ? (lost ? lost.note : str(current.lost_note)) : null, position, stamp, id);
    if (stageChanged) {
      const from = findStage(config, String(current.pipeline_id), String(current.stage_id));
      addActivity(runtime.db, actor, {
        entityType: 'opportunity', entityId: id, kind: 'history', action: 'stage_changed',
        body: `${from ? `"${from.stage.name}"` : 'Etapa anterior'} → "${stage.name}"${pipeline.id !== current.pipeline_id ? ` (${pipeline.name})` : ''}.`,
        data: { fromPipeline: current.pipeline_id, fromStage: current.stage_id, toPipeline: pipeline.id, toStage: stage.id },
      });
    }
    if (statusChanged) {
      const labels: Record<OpportunityStatus, string> = { open: 'Reaberta', won: 'Ganha', lost: 'Perdida' };
      addActivity(runtime.db, actor, { entityType: 'opportunity', entityId: id, kind: 'history', action: `status.${status}`, body: `${labels[status]}${lost ? `: ${lost.reason}` : ''}.`, data: { from: current.status, to: status, ...(lost ? { lostReason: lost.reason } : {}) } });
    }
    if (stageChanged) afterEntering(runtime, config, actor, id, pipeline, stage, statusChanged);
  });
  return getOpportunity(runtime, id);
}

/** O patch enviado junto com a mudança de etapa é validado pela regra da etapa de DESTINO, não da atual. */
function updateOpportunityTxForMove(runtime: HubRuntime, config: CrmConfig, actor: CrmActor, id: string, patch: Record<string, unknown>) {
  const current = runtime.db.prepare('SELECT * FROM crm_opportunities WHERE id=?').get(id) as Row | undefined;
  if (!current) throw new HttpError(404, 'Oportunidade não encontrada.');
  const fields = opportunityFields(runtime, config, patch, current);
  runtime.db.prepare('UPDATE crm_opportunities SET title=?,value_cents=?,priority=?,expected_close_date=?,contact_id=?,organization_id=?,owner_id=?,source_id=?,notes=?,custom=?,updated_at=? WHERE id=?')
    .run(fields.title, fields.valueCents, fields.priority, fields.expectedCloseDate, fields.contactId, fields.organizationId, fields.ownerId, fields.sourceId, fields.notes, JSON.stringify(fields.custom), now(), id);
  recordChanges(runtime.db, actor, 'opportunity', id, current, { title: fields.title, value_cents: fields.valueCents, priority: fields.priority, expected_close_date: fields.expectedCloseDate, contact_id: fields.contactId, organization_id: fields.organizationId, owner_id: fields.ownerId, source_id: fields.sourceId, notes: fields.notes, custom: JSON.stringify(fields.custom) });
}

// ————————————————————————— Funil (quadro) —————————————————————————

export interface BoardStage {
  id: string; name: string; kind: CrmStage['kind']; probability: number | null; requiredFields: Array<{ key: string; label: string }>;
  count: number; valueCents: number; items: OpportunityView[];
}

export function board(runtime: HubRuntime, options: { pipelineId?: unknown; q?: unknown; ownerId?: unknown; sourceId?: unknown; tag?: unknown; closedDays?: unknown } = {}) {
  const config = crmConfig(runtime);
  const pipeline = pipelineOf(config, options.pipelineId);
  const closedDays = Math.min(Math.max(Number(options.closedDays) || 30, 1), 365);
  const since = new Date(Date.now() - closedDays * 86_400_000).toISOString();
  const filters = new Filters();
  commonFilters(filters, 'p', 'opportunity', { ownerId: options.ownerId, sourceId: options.sourceId, tag: options.tag });
  const q = f.likePattern(options.q);
  if (q) filters.add("(p.title LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\')", q, q, q);
  // O funil padrão também recolhe oportunidades de funis que saíram da configuração (para serem movidas).
  const knownPipelines = config.pipelines.map(item => item.id);
  const isDefault = pipeline.id === defaultPipeline(config).id;
  filters.add(isDefault ? `(p.pipeline_id=? OR p.pipeline_id NOT IN (${knownPipelines.map(() => '?').join(',')}))` : 'p.pipeline_id=?', pipeline.id, ...(isDefault ? knownPipelines : []));
  filters.add("(p.status='open' OR p.closed_at>=?)", since);
  const rows = (runtime.db.prepare(`${OPPORTUNITY_SELECT} ${filters.sql()} ORDER BY p.position, p.created_at LIMIT 2000`).all(...filters.params) as Row[]).map(row => opportunityView(config, row));
  const labels = crmLabels(config);
  const stages: BoardStage[] = pipeline.stages.map(stage => {
    const items = rows.filter(item => item.pipelineId === pipeline.id && item.stageId === stage.id);
    return {
      id: stage.id, name: stage.name, kind: stage.kind, probability: stage.probability ?? null,
      requiredFields: (stage.requiredFields ?? []).map(key => ({ key, label: key === 'contactId' ? labels.contact : key === 'organizationId' ? labels.organization : key.startsWith('custom.') ? config.customFields.find(field => field.entity === 'opportunity' && field.id === key.slice(7))?.label ?? key : REQUIRED_FIELD_LABELS[key] ?? key })),
      count: items.length, valueCents: items.reduce((sum, item) => sum + (item.valueCents ?? 0), 0), items,
    };
  });
  const orphans = rows.filter(item => !item.stage);
  const open = rows.filter(item => item.status === 'open');
  const weighted = open.reduce((sum, item) => sum + (item.valueCents && item.stage?.probability !== null && item.stage?.probability !== undefined ? Math.round(item.valueCents * item.stage.probability / 100) : 0), 0);
  return {
    pipeline: { id: pipeline.id, name: pipeline.name, description: pipeline.description ?? null },
    pipelines: config.pipelines.map(item => ({ id: item.id, name: item.name, default: item.default })),
    stages, orphans, closedDays, currency: config.currency, lostReasons: config.lostReasons,
    totals: { openCount: open.length, openValueCents: open.reduce((sum, item) => sum + (item.valueCents ?? 0), 0), weightedValueCents: weighted },
  };
}

// ————————————————————————— Atividades, anexos, arquivo —————————————————————————

const TABLES: Record<CrmEntityType, string> = { contact: 'crm_contacts', organization: 'crm_organizations', lead: 'crm_leads', opportunity: 'crm_opportunities' };
export const ENTITY_PATHS: Record<string, CrmEntityType> = { contacts: 'contact', organizations: 'organization', leads: 'lead', opportunities: 'opportunity' };

export function entityType(segment: string): CrmEntityType {
  const type = ENTITY_PATHS[segment];
  if (!type) throw new HttpError(404, 'Tipo de registro desconhecido.');
  return type;
}

function assertEntity(db: HubDatabase, type: CrmEntityType, id: string): void {
  if (!db.prepare(`SELECT 1 FROM ${TABLES[type]} WHERE id=?`).get(id)) throw new HttpError(404, 'Registro não encontrado.');
}

export function addEntityActivity(runtime: HubRuntime, actor: CrmActor, type: CrmEntityType, id: string, input: unknown): TimelineEntry[] {
  const body = record(input);
  assertEntity(runtime.db, type, id);
  const kind = f.oneOf(body.kind ?? 'note', ACTIVITY_KINDS, 'tipo de atividade');
  const text = f.text(body.body, 'o registro', 5000, { required: true, multiline: true })!;
  const occurredAt = f.dateTimeInput(body.occurredAt, 'a data da atividade');
  transaction(runtime.db, () => {
    addActivity(runtime.db, actor, { entityType: type, entityId: id, kind, action: kind, body: text, occurredAt });
    runtime.db.prepare(`UPDATE ${TABLES[type]} SET updated_at=? WHERE id=?`).run(now(), id);
  });
  return timeline(runtime.db, type, id, 50);
}

export interface AttachmentView {
  id: string; kind: 'private-file' | 'base-file' | 'url'; label: string | null; ref: string | null;
  file: { id: string; name: string; size: number; mime: string } | null; available: boolean; createdAt: string;
}

export function listAttachments(runtime: HubRuntime, viewer: Actor, type: CrmEntityType, id: string): AttachmentView[] {
  const rows = runtime.db.prepare('SELECT * FROM crm_attachments WHERE entity_type=? AND entity_id=? ORDER BY created_at DESC').all(type, id) as Row[];
  const canPrivate = can(viewer.permissions, 'files:private');
  const canRestricted = can(viewer.permissions, 'restricted:read');
  let manifest: BaseManifest | null = null;
  try { manifest = runtime.base.snapshot().manifest; } catch { manifest = null; }
  return rows.map(row => {
    const kind = row.kind as AttachmentView['kind'];
    if (kind === 'base-file') {
      // Arquivo de área restrita da Base: quem não pode ver recebe só o aviso, nunca o caminho.
      const visible = !!manifest && baseFileVisible(manifest, viewer, String(row.ref));
      return { id: String(row.id), kind, label: str(row.label), ref: visible ? String(row.ref) : null, file: null, available: visible, createdAt: String(row.created_at) };
    }
    if (kind === 'private-file') {
      const file = runtime.db.prepare('SELECT id,name,size,mime,visibility FROM private_files WHERE id=?').get(String(row.ref)) as { id: string; name: string; size: number; mime: string; visibility: string } | undefined;
      const visible = !!file && canPrivate && (file.visibility !== 'restricted' || canRestricted);
      return { id: String(row.id), kind, label: str(row.label), ref: null, file: visible ? { id: file.id, name: file.name, size: Number(file.size), mime: file.mime } : null, available: visible, createdAt: String(row.created_at) };
    }
    return { id: String(row.id), kind, label: str(row.label), ref: String(row.ref), file: null, available: true, createdAt: String(row.created_at) };
  });
}

export function addAttachment(runtime: HubRuntime, viewer: Actor, actor: CrmActor, type: CrmEntityType, id: string, input: unknown): AttachmentView[] {
  const body = record(input);
  assertEntity(runtime.db, type, id);
  const kind = f.oneOf(body.kind, ['private-file', 'base-file', 'url'] as const, 'tipo de anexo');
  const label = f.text(body.label, 'o nome do anexo', 120);
  let value: string;
  if (kind === 'private-file') {
    if (!can(viewer.permissions, 'files:private')) throw new HttpError(403, 'Seu acesso não inclui arquivos privados.');
    const file = typeof body.ref === 'string' ? runtime.db.prepare('SELECT id,visibility FROM private_files WHERE id=?').get(body.ref) as { id: string; visibility: string } | undefined : undefined;
    if (!file || (file.visibility === 'restricted' && !can(viewer.permissions, 'restricted:read'))) throw new HttpError(400, 'Arquivo privado não encontrado.');
    value = file.id;
  } else if (kind === 'base-file') {
    if (!isSafeRelativePath(body.ref)) throw new HttpError(400, 'Caminho da Base inválido.');
    const entry = runtime.base.snapshot().files.find(item => item.path === body.ref);
    if (!entry || entry.restricted || !baseFileVisible(runtime.base.snapshot().manifest, viewer, entry.path)) throw new HttpError(400, 'Arquivo não encontrado na Base (ou restrito).');
    value = entry.path;
  } else value = f.url(body.ref)!;
  if (!value) throw new HttpError(400, 'Informe o anexo.');
  transaction(runtime.db, () => {
    runtime.db.prepare('INSERT INTO crm_attachments(id,entity_type,entity_id,kind,ref,label,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(), type, id, kind, value, label, actor.id, now());
    addActivity(runtime.db, actor, { entityType: type, entityId: id, kind: 'history', action: 'attachment_added', body: `Anexo adicionado${label ? `: ${label}` : ''}.`, data: { kind } });
  });
  return listAttachments(runtime, viewer, type, id);
}

export function deleteAttachment(runtime: HubRuntime, actor: CrmActor, attachmentId: string): void {
  const row = runtime.db.prepare('SELECT entity_type,entity_id,label FROM crm_attachments WHERE id=?').get(attachmentId) as { entity_type: CrmEntityType; entity_id: string; label: string | null } | undefined;
  if (!row) throw new HttpError(404, 'Anexo não encontrado.');
  transaction(runtime.db, () => {
    runtime.db.prepare('DELETE FROM crm_attachments WHERE id=?').run(attachmentId);
    addActivity(runtime.db, actor, { entityType: row.entity_type, entityId: row.entity_id, kind: 'history', action: 'attachment_removed', body: `Anexo removido${row.label ? `: ${row.label}` : ''}.` });
  });
}

/** Arquivar tira das listas e do funil sem apagar nada; restaurar devolve. */
export function setArchived(runtime: HubRuntime, actor: CrmActor, type: CrmEntityType, id: string, archived: boolean): void {
  transaction(runtime.db, () => {
    const changed = Number(runtime.db.prepare(`UPDATE ${TABLES[type]} SET archived_at=?, updated_at=? WHERE id=? AND archived_at IS ${archived ? 'NULL' : 'NOT NULL'}`).run(archived ? now() : null, now(), id).changes);
    if (!changed) { assertEntity(runtime.db, type, id); return; }
    addActivity(runtime.db, actor, { entityType: type, entityId: id, kind: 'history', action: archived ? 'archived' : 'restored', body: archived ? 'Arquivado.' : 'Restaurado.' });
  });
}

/**
 * Exclusão definitiva de dados pessoais (pedido do titular, LGPD). Remove o registro, o histórico,
 * as etiquetas e os anexos dele; oportunidades e tarefas ligadas ficam, sem a referência.
 */
export function purgeEntity(runtime: HubRuntime, actor: CrmActor, type: Exclude<CrmEntityType, 'opportunity'>, id: string): void {
  transaction(runtime.db, () => {
    assertEntity(runtime.db, type, id);
    if (type === 'contact') {
      for (const row of runtime.db.prepare('SELECT id FROM crm_opportunities WHERE contact_id=?').all(id) as Array<{ id: string }>) {
        addActivity(runtime.db, actor, { entityType: 'opportunity', entityId: row.id, kind: 'history', action: 'contact_purged', body: 'O contato desta oportunidade foi excluído definitivamente.' });
      }
      runtime.db.prepare('UPDATE crm_leads SET contact_id=NULL WHERE contact_id=?').run(id);
    } else if (type === 'lead') {
      runtime.db.prepare('UPDATE crm_opportunities SET lead_id=NULL WHERE lead_id=?').run(id);
    } else {
      runtime.db.prepare('UPDATE crm_contacts SET organization_id=NULL WHERE organization_id=?').run(id);
    }
    runtime.db.prepare('DELETE FROM crm_activities WHERE entity_type=? AND entity_id=?').run(type, id);
    runtime.db.prepare('DELETE FROM crm_entity_tags WHERE entity_type=? AND entity_id=?').run(type, id);
    runtime.db.prepare('DELETE FROM crm_attachments WHERE entity_type=? AND entity_id=?').run(type, id);
    runtime.db.prepare('UPDATE tasks SET related_type=NULL, related_id=NULL WHERE related_type=? AND related_id=?').run(type, id);
    runtime.db.prepare(`DELETE FROM ${TABLES[type]} WHERE id=?`).run(id);
  });
}

export { tagsOf, timeline };
