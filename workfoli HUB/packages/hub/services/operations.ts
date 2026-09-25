import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { looksLikeSecret } from '../../contract/workfoli-contract.mjs';
import { writeFileAtomic } from '../../instance/fsutil.js';
import { now, transaction } from '../db.js';
import { HttpError } from '../http.js';
import { validateRecord } from '../custom-modules.js';
import { addActivity } from '../crm/history.js';
import { can } from '../permissions.js';
import type { Actor, HubRuntime } from '../runtime.js';

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮]/;

function str(value: unknown, label: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === '') { if (required) throw new HttpError(400, `Informe ${label}.`); return null; }
  if (typeof value !== 'string') throw new HttpError(400, `${label} inválido.`);
  const clean = value.replace(/\r\n/g, '\n').trim();
  if (!clean) { if (required) throw new HttpError(400, `Informe ${label}.`); return null; }
  if (clean.length > max) throw new HttpError(400, `${label} ultrapassa ${max} caracteres.`);
  if (CONTROL.test(clean)) throw new HttpError(400, `${label} contém caracteres inválidos.`);
  if (looksLikeSecret(clean)) throw new HttpError(400, `${label} parece conter uma credencial. Guarde segredos na pasta secrets da instância.`);
  return clean;
}

function date(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new HttpError(400, `${label} precisa ser uma data (AAAA-MM-DD).`);
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string, fallback?: T): T {
  if ((value === undefined || value === null || value === '') && fallback) return fallback;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw new HttpError(400, `${label} inválido.`);
  return value as T;
}

// ————— Tarefas —————

export const TASK_STATUSES = ['open', 'doing', 'done'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
export const TASK_RELATED_TYPES = ['contact', 'organization', 'lead', 'opportunity'] as const;
export type TaskRelatedType = typeof TASK_RELATED_TYPES[number];
export interface TaskView {
  id: string; title: string; notes: string | null; status: TaskStatus; dueDate: string | null;
  assignee: { id: string; name: string } | null; projectId: string | null; createdAt: string; updatedAt: string; source: string;
  /** Registro do CRM ligado à tarefa (nome some se o registro foi excluído definitivamente). */
  related: { type: TaskRelatedType; id: string; label: string | null } | null;
}

function taskView(row: Record<string, unknown>): TaskView {
  return {
    id: String(row.id), title: String(row.title), notes: (row.notes as string | null) ?? null, status: row.status as TaskStatus, dueDate: (row.due_date as string | null) ?? null,
    assignee: row.assignee_id ? { id: String(row.assignee_id), name: String(row.assignee_name ?? '') } : null, projectId: (row.project_id as string | null) ?? null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), source: String(row.source),
    related: row.related_type && row.related_id ? { type: row.related_type as TaskRelatedType, id: String(row.related_id), label: (row.related_label as string | null) ?? null } : null,
  };
}

const TASK_SELECT = `SELECT t.*, u.name AS assignee_name,
  CASE t.related_type WHEN 'contact' THEN (SELECT name FROM crm_contacts WHERE id=t.related_id)
    WHEN 'organization' THEN (SELECT name FROM crm_organizations WHERE id=t.related_id)
    WHEN 'lead' THEN (SELECT name FROM crm_leads WHERE id=t.related_id)
    WHEN 'opportunity' THEN (SELECT title FROM crm_opportunities WHERE id=t.related_id) END AS related_label
  FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id`;

export function listTasks(runtime: HubRuntime, filter: { status?: unknown; projectId?: unknown; relatedType?: unknown; relatedId?: unknown } = {}): TaskView[] {
  const status = typeof filter.status === 'string' && (TASK_STATUSES as readonly string[]).includes(filter.status) ? filter.status : null;
  const project = typeof filter.projectId === 'string' && /^[a-z0-9-]{1,63}$/.test(filter.projectId) ? filter.projectId : null;
  const relatedType = typeof filter.relatedType === 'string' && (TASK_RELATED_TYPES as readonly string[]).includes(filter.relatedType) ? filter.relatedType : null;
  const relatedId = relatedType && typeof filter.relatedId === 'string' ? filter.relatedId.slice(0, 80) : null;
  const rows = runtime.db.prepare(`${TASK_SELECT}
    WHERE (? IS NULL OR t.status=?) AND (? IS NULL OR t.project_id=?) AND (? IS NULL OR (t.related_type=? AND t.related_id=?))
    ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'open' THEN 1 ELSE 2 END, COALESCE(t.due_date,'9999'), t.created_at DESC LIMIT 500`)
    .all(status, status, project, project, relatedType, relatedType, relatedId) as Array<Record<string, unknown>>;
  return rows.map(taskView);
}

export function getTask(runtime: HubRuntime, id: string): TaskView {
  const row = runtime.db.prepare(`${TASK_SELECT} WHERE t.id=?`).get(id) as Record<string, unknown> | undefined;
  if (!row) throw new HttpError(404, 'Tarefa não encontrada.');
  return taskView(row);
}

const RELATED_TABLES: Record<TaskRelatedType, string> = { contact: 'crm_contacts', organization: 'crm_organizations', lead: 'crm_leads', opportunity: 'crm_opportunities' };

function checkTaskRefs(runtime: HubRuntime, input: Record<string, unknown>): { relatedType: TaskRelatedType; relatedId: string } | null | undefined {
  const { assigneeId, projectId } = input;
  if (assigneeId !== undefined && assigneeId !== null && assigneeId !== '') {
    if (typeof assigneeId !== 'string' || !runtime.db.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").get(assigneeId)) throw new HttpError(400, 'Responsável inválido.');
  }
  if (projectId !== undefined && projectId !== null && projectId !== '') {
    let known = false;
    try { known = runtime.base.snapshot().manifest.projects.some(project => project.id === projectId); } catch { known = false; }
    if (!known) throw new HttpError(400, 'Projeto inexistente na Base.');
  }
  if (!Object.hasOwn(input, 'relatedType') && !Object.hasOwn(input, 'relatedId')) return undefined;
  if (!input.relatedType && !input.relatedId) return null;
  const type = oneOf(input.relatedType, TASK_RELATED_TYPES, 'Tipo de registro');
  if (typeof input.relatedId !== 'string' || !runtime.db.prepare(`SELECT 1 FROM ${RELATED_TABLES[type]} WHERE id=?`).get(input.relatedId)) throw new HttpError(400, 'Registro do CRM não encontrado.');
  return { relatedType: type, relatedId: input.relatedId };
}

export function createTask(runtime: HubRuntime, actor: Actor, input: Record<string, unknown>): TaskView {
  const title = str(input.title, 'o título', 200, true)!;
  const related = checkTaskRefs(runtime, input) ?? null;
  const id = randomUUID();
  const source = typeof input.source === 'string' && input.source === 'ai' ? 'ai' : 'hub';
  transaction(runtime.db, () => {
    runtime.db.prepare('INSERT INTO tasks(id,title,notes,status,due_date,assignee_id,project_id,created_by,created_at,updated_at,source,related_type,related_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, title, str(input.notes, 'as observações', 5000), oneOf(input.status, TASK_STATUSES, 'Situação', 'open'), date(input.dueDate, 'Prazo'),
        (input.assigneeId as string) || null, (input.projectId as string) || null, actor.id, now(), now(), source, related?.relatedType ?? null, related?.relatedId ?? null);
    if (related) addActivity(runtime.db, { type: source === 'ai' ? 'ai' : 'user', id: actor.id }, { entityType: related.relatedType, entityId: related.relatedId, kind: 'history', action: 'task_created', body: `Tarefa criada: ${title}.`, data: { taskId: id } });
  });
  return getTask(runtime, id);
}

export function updateTask(runtime: HubRuntime, id: string, input: Record<string, unknown>): TaskView {
  const current = runtime.db.prepare('SELECT * FROM tasks WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!current) throw new HttpError(404, 'Tarefa não encontrada.');
  const related = checkTaskRefs(runtime, input);
  const has = (key: string) => Object.hasOwn(input, key);
  runtime.db.prepare('UPDATE tasks SET title=?, notes=?, status=?, due_date=?, assignee_id=?, project_id=?, related_type=?, related_id=?, updated_at=? WHERE id=?').run(
    has('title') ? str(input.title, 'o título', 200, true) : current.title as string,
    has('notes') ? str(input.notes, 'as observações', 5000) : (current.notes as string | null),
    has('status') ? oneOf(input.status, TASK_STATUSES, 'Situação') : current.status as string,
    has('dueDate') ? date(input.dueDate, 'Prazo') : (current.due_date as string | null),
    has('assigneeId') ? ((input.assigneeId as string) || null) : (current.assignee_id as string | null),
    has('projectId') ? ((input.projectId as string) || null) : (current.project_id as string | null),
    related === undefined ? (current.related_type as string | null) : related?.relatedType ?? null,
    related === undefined ? (current.related_id as string | null) : related?.relatedId ?? null,
    now(), id);
  return getTask(runtime, id);
}

export function deleteTask(runtime: HubRuntime, id: string): void {
  if (!Number(runtime.db.prepare('DELETE FROM tasks WHERE id=?').run(id).changes)) throw new HttpError(404, 'Tarefa não encontrada.');
}

// ————— Módulos customizados —————

export function customModule(runtime: HubRuntime, id: string) {
  const module = runtime.custom.modules.find(item => item.id === id);
  if (!module) throw new HttpError(404, 'Módulo não encontrado.');
  return module;
}

export function listRecords(runtime: HubRuntime, moduleId: string) {
  const module = customModule(runtime, moduleId);
  const rows = runtime.db.prepare('SELECT id,data,created_at,updated_at FROM records WHERE module_id=? ORDER BY created_at DESC LIMIT 1000').all(module.id) as Array<Record<string, unknown>>;
  return { module, records: rows.map(row => ({ id: String(row.id), data: JSON.parse(String(row.data)) as Record<string, unknown>, createdAt: String(row.created_at), updatedAt: String(row.updated_at) })) };
}

export function saveRecord(runtime: HubRuntime, actor: Actor, moduleId: string, input: unknown, recordId?: string) {
  const module = customModule(runtime, moduleId);
  let data;
  try { data = validateRecord(module, input); } catch (error) { throw new HttpError(400, (error as Error).message); }
  for (const value of Object.values(data)) if (typeof value === 'string' && looksLikeSecret(value)) throw new HttpError(400, 'Um campo parece conter credencial.');
  if (recordId) {
    if (!Number(runtime.db.prepare('UPDATE records SET data=?, updated_at=? WHERE id=? AND module_id=?').run(JSON.stringify(data), now(), recordId, module.id).changes)) throw new HttpError(404, 'Registro não encontrado.');
    return { id: recordId, data };
  }
  const id = randomUUID();
  runtime.db.prepare('INSERT INTO records(id,module_id,data,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id, module.id, JSON.stringify(data), actor.id, now(), now());
  return { id, data };
}

export function deleteRecord(runtime: HubRuntime, moduleId: string, recordId: string): void {
  customModule(runtime, moduleId);
  if (!Number(runtime.db.prepare('DELETE FROM records WHERE id=? AND module_id=?').run(recordId, moduleId).changes)) throw new HttpError(404, 'Registro não encontrado.');
}

// ————— Arquivos privados (fora da Base e do Git) —————

export const PRIVATE_FILE_LIMIT = 25 * 1024 * 1024;

export function listPrivateFiles(runtime: HubRuntime, actor: Actor) {
  const restricted = can(actor.permissions, 'restricted:read');
  return (runtime.db.prepare(`SELECT p.id,p.name,p.mime,p.size,p.visibility,p.note,p.created_at,u.name AS created_by_name FROM private_files p LEFT JOIN users u ON u.id=p.created_by
    WHERE (?=1 OR p.visibility='internal') ORDER BY p.created_at DESC LIMIT 500`).all(restricted ? 1 : 0) as Array<Record<string, unknown>>)
    .map(row => ({ id: String(row.id), name: String(row.name), mime: String(row.mime), size: Number(row.size), visibility: String(row.visibility), note: (row.note as string | null) ?? null, createdAt: String(row.created_at), createdBy: (row.created_by_name as string | null) ?? null }));
}

function privatePath(runtime: HubRuntime, id: string): string {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, 'Arquivo inválido.');
  return path.join(runtime.instance.paths.files, 'private', id);
}

export function storePrivateFile(runtime: HubRuntime, actor: Actor, name: unknown, mime: unknown, bytes: Buffer, visibility: unknown) {
  let decoded = '';
  try { decoded = typeof name === 'string' ? decodeURIComponent(name) : ''; } catch { throw new HttpError(400, 'Nome do arquivo inválido.'); }
  const cleanName = decoded.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().slice(0, 160);
  if (!cleanName) throw new HttpError(400, 'Informe o nome do arquivo.');
  if (!bytes.length) throw new HttpError(400, 'Arquivo vazio.');
  const type = typeof mime === 'string' && /^[a-z]+\/[a-z0-9.+-]{1,80}$/i.test(mime) ? mime.toLowerCase() : 'application/octet-stream';
  const level = visibility === 'restricted' ? 'restricted' : 'internal';
  if (level === 'restricted' && !can(actor.permissions, 'restricted:read')) throw new HttpError(403, 'Sem permissão para arquivos restritos.');
  const id = randomUUID();
  const target = privatePath(runtime, id);
  writeFileAtomic(target, bytes, { exclusive: true, mode: 0o600 });
  try {
    transaction(runtime.db, () => runtime.db.prepare('INSERT INTO private_files(id,name,mime,size,sha256,visibility,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, cleanName, type, bytes.length, createHash('sha256').update(bytes).digest('hex'), level, actor.id, now()));
  } catch (error) { fs.rmSync(target, { force: true }); throw error; }
  return listPrivateFiles(runtime, actor).find(file => file.id === id)!;
}

export function readPrivateFile(runtime: HubRuntime, actor: Actor, id: string) {
  const row = runtime.db.prepare('SELECT name,mime,size,sha256,visibility FROM private_files WHERE id=?').get(id) as { name: string; mime: string; size: number; sha256: string; visibility: string } | undefined;
  if (!row || (row.visibility === 'restricted' && !can(actor.permissions, 'restricted:read'))) throw new HttpError(404, 'Arquivo não encontrado.');
  const bytes = fs.readFileSync(privatePath(runtime, id));
  if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw new HttpError(409, 'A integridade do arquivo mudou. Download bloqueado.');
  return { name: row.name, mime: row.mime, bytes };
}

export function deletePrivateFile(runtime: HubRuntime, actor: Actor, id: string): string {
  const row = runtime.db.prepare('SELECT name,visibility FROM private_files WHERE id=?').get(id) as { name: string; visibility: string } | undefined;
  if (!row || (row.visibility === 'restricted' && !can(actor.permissions, 'restricted:read'))) throw new HttpError(404, 'Arquivo não encontrado.');
  transaction(runtime.db, () => runtime.db.prepare('DELETE FROM private_files WHERE id=?').run(id));
  fs.rmSync(privatePath(runtime, id), { force: true });
  return row.name;
}
