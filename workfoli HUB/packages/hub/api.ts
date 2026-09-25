import { randomUUID } from 'node:crypto';
import { audit, listAudit } from './audit.js';
import { AuthError, consumeToken, createSession, hashToken, issueToken, LoginLimiter, newToken, peekToken, revokeSession } from './auth.js';
import { applyRolePresets, activateAccount, authenticate, changePassword, deleteRole, diffRolePresets, inviteUser, listRoles, listUsers, saveCustomRole, updateUser } from './users.js';
import { companyView, listBaseFiles, listDocuments, listProjects, projectDetail, readBaseFile, readBaseImage, readDocument, baseTasks } from './services/content.js';
import {
  createTask, deletePrivateFile, deleteRecord, deleteTask, listPrivateFiles, listRecords, listTasks,
  PRIVATE_FILE_LIMIT, readPrivateFile, saveRecord, storePrivateFile, updateTask,
} from './services/operations.js';
import { crmModuleLabel } from './crm/config.js';
import { userActor } from './crm/history.js';
import { crmSummary } from './crm/reports.js';
import {
  addAttachment, addEntityActivity, board, convertLead, createContact, createLead, createOpportunity, createOrganization, deleteAttachment,
  disqualifyLead, entityType, listContacts, listLeads, listOpportunities, listOrganizations, moveOpportunity, purgeEntity, reopenLead, setArchived,
  updateContact, updateLead, updateOpportunity, updateOrganization,
} from './crm/service.js';
import { contactDetail, crmSettingsView, leadDetail, opportunityDetail, organizationDetail, saveCrmConfig } from './crm/settings.js';
import { listTags } from './crm/tags.js';
import { disconnectIntegration, integrationOptions, integrationsView, saveIntegrationSettings } from './services/integrations.js';
import { isProvider } from './integrations/catalog.js';
import type { ConnectionProvider } from './integrations/catalog.js';
import { completeOAuth, startOAuth } from './integrations/oauth.js';
import type { CallbackOutcome } from './integrations/oauth.js';
import { syncProvider } from './integrations/sync.js';
import { connectWithToken } from './integrations/tokens.js';
import { overview } from './services/overview.js';
import { marketingSummary } from './services/marketing.js';
import { confirmProposal, listMessages, rejectProposal, sendMessage } from './ai/assistant.js';
import { HttpError, compile, raw } from './http.js';
import type { Method, RouteDefinition, RouteOptions } from './http.js';
import { can } from './permissions.js';
import { visibleModules } from './runtime.js';
import type { Actor, HubRuntime } from './runtime.js';
import { SnapshotBaseAccess } from './base-access.js';
import { now } from './db.js';
import { coreVersion } from '../instance/templates.js';
import { hubUrl } from '../instance/instance.js';

export interface ApiContext {
  runtime: HubRuntime;
  actor: Actor | null;
  session: { tokenHash: string; csrf: string } | null;
  device: { id: string; name: string } | null;
  query: URLSearchParams;
  body: unknown;
  rawBody: Buffer | null;
  headers: Record<string, string | string[] | undefined>;
  ip: string;
  setCookie(value: string, maxAgeSeconds: number): void;
  clearCookie(): void;
}

type Handler = (context: ApiContext, params: Record<string, string>) => unknown | Promise<unknown>;
export type ApiRoute = RouteDefinition<ApiContext> & { path: string; permissionFor?: (params: Record<string, string>) => string };

const routes: ApiRoute[] = [];
function route(method: Method, path: string, options: RouteOptions & { permissionFor?: (params: Record<string, string>) => string }, handler: Handler) {
  const { pattern, keys } = compile(path);
  routes.push({ method, path, pattern, keys, handler, options, ...(options.permissionFor ? { permissionFor: options.permissionFor } : {}) });
}

/** Tabela das rotas (método, caminho, autenticação, permissão fixa) para testes de proteção e documentação. */
export function apiRoutes(): Array<{ method: Method; path: string; auth: RouteOptions['auth']; permission: string | null; dynamicPermission: boolean }> {
  return routes.map(item => ({ method: item.method, path: item.path, auth: item.options.auth, permission: item.options.permission ?? null, dynamicPermission: !!item.permissionFor }));
}

export function matchRoute(method: string, pathname: string): { route: ApiRoute; params: Record<string, string> } | null | 'method' {
  let methodMismatch = false;
  for (const candidate of routes) {
    const match = candidate.pattern.exec(pathname);
    if (!match) continue;
    if (candidate.method !== method) { methodMismatch = true; continue; }
    return { route: candidate, params: Object.fromEntries(candidate.keys.map((key, index) => [key, match[index + 1]!])) };
  }
  return methodMismatch ? 'method' : null;
}

const actorOf = (context: ApiContext): Actor => {
  if (!context.actor) throw new HttpError(401, 'Entre para continuar.');
  return context.actor;
};
const record = (body: unknown): Record<string, unknown> => body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
const limiter = new LoginLimiter();
const pairingLimiter = new LoginLimiter(10, 15 * 60_000);

export function sessionPayload(runtime: HubRuntime, actor: Actor, csrf: string) {
  const modules = visibleModules(runtime, actor);
  let company: { name: string; tagline: string | null; slug: string } = { name: runtime.instance.file.company.name, tagline: null, slug: runtime.instance.file.company.slug };
  try { const manifest = runtime.base.snapshot().manifest; company = { name: manifest.company.name, tagline: manifest.company.tagline ?? null, slug: manifest.company.slug }; } catch { /* Base indisponível: usa o nome da instância */ }
  const crmLabel = crmModuleLabel(runtime);
  return {
    csrf,
    user: { id: actor.id, name: actor.name, roleId: actor.roleId, permissions: actor.permissions },
    company, mode: runtime.config.mode, theme: runtime.config.branding.theme, version: coreVersion(),
    modules: {
      active: modules.active.map(module => ({ id: module.id, label: module.id === 'crm' ? crmLabel : module.label, icon: module.icon, description: module.description, admin: module.admin === true })),
      planned: modules.planned.map(module => ({ id: module.id, label: module.label, icon: module.icon, description: module.description })),
      custom: modules.custom.map(module => ({ id: module.id, label: module.label, icon: module.icon, description: module.description })),
    },
    base: runtime.base.status(),
  };
}

// ——————————————————— Público ———————————————————

route('GET', '/api/health', { auth: 'public' }, () => ({ ok: true, version: coreVersion() }));

route('GET', '/api/brand', { auth: 'public' }, ({ runtime }) => {
  try {
    const manifest = runtime.base.snapshot().manifest;
    return {
      company: { name: manifest.company.name, tagline: manifest.company.tagline ?? null },
      symbol: manifest.identity.symbol || manifest.identity.logo ? '/api/brand/image' : null,
      theme: runtime.config.branding.theme,
    };
  } catch { return { company: { name: runtime.instance.file.company.name, tagline: null }, symbol: null, theme: runtime.config.branding.theme }; }
});

route('GET', '/api/brand/image', { auth: 'public' }, ({ runtime }) => {
  const manifest = runtime.base.snapshot().manifest;
  const file = manifest.identity.symbol || manifest.identity.logo;
  if (!file) throw new HttpError(404, 'Sem símbolo.');
  const image = readBaseImage(runtime, file, { publicOnly: true });
  return raw(image.bytes, { 'Content-Type': image.mime, 'Cache-Control': 'private, max-age=300', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
});

route('POST', '/api/auth/login', { auth: 'public' }, async context => {
  const body = record(context.body);
  const key = `${context.ip}|${typeof body.email === 'string' ? body.email.toLowerCase().slice(0, 254) : ''}`;
  limiter.check(key);
  try {
    const user = await authenticate(context.runtime.db, body.email, body.password);
    limiter.succeed(key);
    const session = createSession(context.runtime.db, user.id, String(context.headers['user-agent'] ?? ''), context.runtime.config.security.sessionHours);
    context.setCookie(session.token, context.runtime.config.security.sessionHours * 3600);
    audit(context.runtime.db, { type: 'user', id: user.id }, 'auth.login', user.id);
    const row = context.runtime.db.prepare('SELECT permissions FROM roles WHERE id=?').get(user.roleId) as { permissions: string };
    return sessionPayload(context.runtime, { id: user.id, name: user.name, roleId: user.roleId, permissions: JSON.parse(row.permissions) as string[] }, session.csrf);
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) {
      limiter.fail(key);
      audit(context.runtime.db, { type: 'system', id: null }, 'auth.login-failed', null, { ip: context.ip }, 'denied');
    }
    throw error;
  }
});

route('GET', '/api/auth/activation', { auth: 'public' }, ({ runtime, query }) => peekToken(runtime.db, query.get('token')));

route('POST', '/api/auth/activate', { auth: 'public' }, async context => {
  const key = `activate|${context.ip}`;
  limiter.check(key);
  try {
    const user = await activateAccount(context.runtime.db, record(context.body));
    limiter.succeed(key);
    audit(context.runtime.db, { type: 'user', id: user.id }, 'auth.activated', user.id, { role: user.roleId });
    const session = createSession(context.runtime.db, user.id, String(context.headers['user-agent'] ?? ''), context.runtime.config.security.sessionHours);
    context.setCookie(session.token, context.runtime.config.security.sessionHours * 3600);
    const row = context.runtime.db.prepare('SELECT permissions FROM roles WHERE id=?').get(user.roleId) as { permissions: string };
    return sessionPayload(context.runtime, { id: user.id, name: user.name, roleId: user.roleId, permissions: JSON.parse(row.permissions) as string[] }, session.csrf);
  } catch (error) { if (error instanceof AuthError) limiter.fail(key); throw error; }
});

// ——————————————————— Sessão ———————————————————

route('GET', '/api/session', { auth: 'session' }, context => sessionPayload(context.runtime, actorOf(context), context.session!.csrf));

route('POST', '/api/auth/logout', { auth: 'session' }, context => {
  revokeSession(context.runtime.db, context.session!.tokenHash);
  context.clearCookie();
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'auth.logout', actorOf(context).id);
  return { ok: true };
});

route('POST', '/api/auth/password', { auth: 'session' }, async context => {
  const body = record(context.body);
  await changePassword(context.runtime.db, actorOf(context).id, body.current, body.next);
  context.clearCookie();
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'auth.password-changed', actorOf(context).id);
  return { ok: true, relogin: true };
});

route('GET', '/api/overview', { auth: 'session', permission: 'overview:read' }, context => overview(context.runtime, actorOf(context)));
route('GET', '/api/company', { auth: 'session', permission: 'company:read' }, context => companyView(context.runtime, actorOf(context)));

route('GET', '/api/base/image', { auth: 'session' }, context => {
  const actor = actorOf(context);
  if (!['company:read', 'files:read', 'knowledge:read'].some(permission => can(actor.permissions, permission))) throw new HttpError(403, 'Sem permissão.');
  const image = readBaseImage(context.runtime, context.query.get('path'), { actor });
  return raw(image.bytes, { 'Content-Type': image.mime, 'Cache-Control': 'private, max-age=60', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
});

route('GET', '/api/knowledge', { auth: 'session', permission: 'knowledge:read' }, context => ({ documents: listDocuments(context.runtime, actorOf(context)), base: context.runtime.base.status() }));
route('GET', '/api/knowledge/doc', { auth: 'session', permission: 'knowledge:read' }, context => readDocument(context.runtime, actorOf(context), context.query.get('path')));
route('POST', '/api/knowledge/notes', { auth: 'session', permission: 'knowledge:write' }, context => {
  const actor = actorOf(context);
  const body = record(context.body);
  const outcome = context.runtime.submitBaseChange({ type: 'knowledge.note', note: { title: body.title, body: body.body } }, { id: actor.id, name: actor.name });
  audit(context.runtime.db, { type: 'user', id: actor.id }, outcome.status === 'applied' ? 'base.note-created' : 'base.note-queued', outcome.status === 'applied' ? outcome.result.files[0] ?? null : outcome.commandId);
  return outcome;
});

route('GET', '/api/projects', { auth: 'session', permission: 'projects:read' }, context => listProjects(context.runtime, actorOf(context)));
route('GET', '/api/projects/:id', { auth: 'session', permission: 'projects:read' }, (context, params) => ({ ...projectDetail(context.runtime, actorOf(context), params.id!), tasks: listTasks(context.runtime, { projectId: params.id }) }));
route('POST', '/api/projects', { auth: 'session', permission: 'projects:write' }, context => {
  const actor = actorOf(context);
  const body = record(context.body);
  const outcome = context.runtime.submitBaseChange({ type: 'project.create', project: { name: body.name, type: body.type, summary: body.summary, services: body.services } }, { id: actor.id, name: actor.name });
  audit(context.runtime.db, { type: 'user', id: actor.id }, outcome.status === 'applied' ? 'base.project-created' : 'base.project-queued', outcome.status === 'applied' ? outcome.result.projectId ?? null : outcome.commandId);
  return outcome;
});

route('GET', '/api/files', { auth: 'session', permission: 'files:read' }, context => ({
  base: listBaseFiles(context.runtime, actorOf(context)),
  private: can(actorOf(context).permissions, 'files:private') ? listPrivateFiles(context.runtime, actorOf(context)) : null,
}));
route('GET', '/api/files/base', { auth: 'session', permission: 'files:read' }, context => readBaseFile(context.runtime, actorOf(context), context.query.get('path')));
route('POST', '/api/files/private', { auth: 'session', permission: 'files:private', rawBody: true, bodyLimit: PRIVATE_FILE_LIMIT }, context => {
  const actor = actorOf(context);
  const file = storePrivateFile(context.runtime, actor, context.headers['x-file-name'], context.headers['content-type'], context.rawBody ?? Buffer.alloc(0), context.query.get('visibility'));
  audit(context.runtime.db, { type: 'user', id: actor.id }, 'files.private-uploaded', file.id, { size: file.size, visibility: file.visibility });
  return file;
});
route('GET', '/api/files/private/:id', { auth: 'session', permission: 'files:private' }, (context, params) => {
  const actor = actorOf(context);
  const file = readPrivateFile(context.runtime, actor, params.id!);
  audit(context.runtime.db, { type: 'user', id: actor.id }, 'files.private-downloaded', params.id!);
  return raw(file.bytes, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; sandbox" });
});
route('DELETE', '/api/files/private/:id', { auth: 'session', permission: 'files:private' }, (context, params) => {
  const actor = actorOf(context);
  const name = deletePrivateFile(context.runtime, actor, params.id!);
  audit(context.runtime.db, { type: 'user', id: actor.id }, 'files.private-deleted', params.id!, { name });
  return { ok: true };
});

route('GET', '/api/tasks', { auth: 'session', permission: 'tasks:read' }, context => ({ tasks: listTasks(context.runtime, { status: context.query.get('status') ?? undefined, projectId: context.query.get('projectId') ?? undefined, relatedType: context.query.get('relatedType') ?? undefined, relatedId: context.query.get('relatedId') ?? undefined }), users: listUsers(context.runtime.db).filter(user => user.status === 'active').map(user => ({ id: user.id, name: user.name })) }));
route('GET', '/api/tasks/base', { auth: 'session', permission: 'tasks:read' }, context => ({ sections: baseTasks(context.runtime) }));
route('POST', '/api/tasks', { auth: 'session', permission: 'tasks:write' }, context => {
  const actor = actorOf(context);
  const task = createTask(context.runtime, actor, record(context.body));
  audit(context.runtime.db, { type: 'user', id: actor.id }, 'task.created', task.id);
  return task;
});
route('PATCH', '/api/tasks/:id', { auth: 'session', permission: 'tasks:write' }, (context, params) => {
  const task = updateTask(context.runtime, params.id!, record(context.body));
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'task.updated', task.id, { status: task.status });
  return task;
});
route('DELETE', '/api/tasks/:id', { auth: 'session', permission: 'tasks:write' }, (context, params) => {
  deleteTask(context.runtime, params.id!);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'task.deleted', params.id!);
  return { ok: true };
});

// ——————————————————— CRM ———————————————————
// Estrutura e regras vêm da Base; aqui só dados vivos. Toda escrita vira histórico e auditoria.

const crmActorOf = (context: ApiContext) => userActor(actorOf(context).id);
const listQuery = (query: URLSearchParams) => Object.fromEntries([...query.entries()].map(([key, value]) => [key, value.slice(0, 200)]));

route('GET', '/api/crm/config', { auth: 'session', permission: 'crm:read' }, context => crmSettingsView(context.runtime, actorOf(context)));
route('PUT', '/api/crm/config', { auth: 'session', permission: 'crm:admin' }, context => {
  const actor = actorOf(context);
  const outcome = saveCrmConfig(context.runtime, actor, context.body);
  audit(context.runtime.db, { type: 'user', id: actor.id }, outcome.status === 'applied' ? 'crm.config-updated' : 'crm.config-queued', outcome.status === 'applied' ? 'workfoli.base.json' : outcome.commandId);
  return outcome;
});
route('GET', '/api/crm/summary', { auth: 'session', permission: 'crm:read' }, context => crmSummary(context.runtime, { from: context.query.get('from'), to: context.query.get('to'), pipelineId: context.query.get('pipeline') ?? undefined }));
route('GET', '/api/crm/board', { auth: 'session', permission: 'crm:read' }, context => board(context.runtime, { pipelineId: context.query.get('pipeline') ?? undefined, q: context.query.get('q'), ownerId: context.query.get('owner'), sourceId: context.query.get('source'), tag: context.query.get('tag'), closedDays: context.query.get('closedDays') }));
route('GET', '/api/crm/tags', { auth: 'session', permission: 'crm:read' }, context => ({ tags: listTags(context.runtime.db) }));

route('GET', '/api/crm/organizations', { auth: 'session', permission: 'crm:read' }, context => ({ items: listOrganizations(context.runtime, listQuery(context.query)) }));
route('POST', '/api/crm/organizations', { auth: 'session', permission: 'crm:write' }, context => {
  const item = createOrganization(context.runtime, crmActorOf(context), context.body);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.organization-created', item.id);
  return item;
});
route('GET', '/api/crm/organizations/:id', { auth: 'session', permission: 'crm:read' }, (context, params) => organizationDetail(context.runtime, actorOf(context), params.id!));
route('PATCH', '/api/crm/organizations/:id', { auth: 'session', permission: 'crm:write' }, (context, params) => {
  const item = updateOrganization(context.runtime, crmActorOf(context), params.id!, context.body);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.organization-updated', item.id);
  return item;
});

route('GET', '/api/crm/contacts', { auth: 'session', permission: 'crm:read' }, context => ({ items: listContacts(context.runtime, listQuery(context.query)) }));
route('POST', '/api/crm/contacts', { auth: 'session', permission: 'crm:write' }, context => {
  const item = createContact(context.runtime, crmActorOf(context), context.body);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.contact-created', item.id);
  return item;
});
route('GET', '/api/crm/contacts/:id', { auth: 'session', permission: 'crm:read' }, (context, params) => contactDetail(context.runtime, actorOf(context), params.id!));
route('PATCH', '/api/crm/contacts/:id', { auth: 'session', permission: 'crm:write' }, (context, params) => {
  const item = updateContact(context.runtime, crmActorOf(context), params.id!, context.body);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.contact-updated', item.id);
  return item;
});

route('GET', '/api/crm/leads', { auth: 'session', permission: 'crm:read' }, context => ({ items: listLeads(context.runtime, listQuery(context.query)) }));
route('POST', '/api/crm/leads', { auth: 'session', permission: 'crm:write' }, context => {
  const item = createLead(context.runtime, crmActorOf(context), context.body);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.lead-created', item.id, { source: item.source?.id ?? '' });
  return item;
});
route('GET', '/api/crm/leads/:id', { auth: 'session', permission: 'crm:read' }, (context, params) => leadDetail(context.runtime, actorOf(context), params.id!));
route('PATCH', '/api/crm/leads/:id', { auth: 'session', permission: 'crm:write' }, (context, params) => {
  const item = updateLead(context.runtime, crmActorOf(context), params.id!, context.body);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.lead-updated', item.id, { status: item.status });
  return item;
});
route('POST', '/api/crm/leads/:id/convert', { auth: 'session', permission: 'crm:write' }, (context, params) => {
  const result = convertLead(context.runtime, crmActorOf(context), params.id!, context.body);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.lead-converted', params.id!, { contact: result.contact.id, opportunity: result.opportunity?.id ?? '' });
  return result;
});
route('POST', '/api/crm/leads/:id/disqualify', { auth: 'session', permission: 'crm:write' }, (context, params) => {
  const item = disqualifyLead(context.runtime, crmActorOf(context), params.id!, context.body);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.lead-disqualified', item.id);
  return item;
});
route('POST', '/api/crm/leads/:id/reopen', { auth: 'session', permission: 'crm:write' }, (context, params) => {
  const item = reopenLead(context.runtime, crmActorOf(context), params.id!);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.lead-reopened', item.id);
  return item;
});

route('GET', '/api/crm/opportunities', { auth: 'session', permission: 'crm:read' }, context => ({ items: listOpportunities(context.runtime, listQuery(context.query)) }));
route('POST', '/api/crm/opportunities', { auth: 'session', permission: 'crm:write' }, context => {
  const item = createOpportunity(context.runtime, crmActorOf(context), context.body);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.opportunity-created', item.id, { stage: item.stageId });
  return item;
});
route('GET', '/api/crm/opportunities/:id', { auth: 'session', permission: 'crm:read' }, (context, params) => opportunityDetail(context.runtime, actorOf(context), params.id!));
route('PATCH', '/api/crm/opportunities/:id', { auth: 'session', permission: 'crm:write' }, (context, params) => {
  const item = updateOpportunity(context.runtime, crmActorOf(context), params.id!, context.body);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.opportunity-updated', item.id);
  return item;
});
route('POST', '/api/crm/opportunities/:id/move', { auth: 'session', permission: 'crm:write' }, (context, params) => {
  const item = moveOpportunity(context.runtime, crmActorOf(context), params.id!, context.body);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.opportunity-moved', item.id, { stage: item.stageId, status: item.status });
  return item;
});

route('DELETE', '/api/crm/attachments/:id', { auth: 'session', permission: 'crm:write' }, (context, params) => {
  deleteAttachment(context.runtime, crmActorOf(context), params.id!);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.attachment-removed', params.id!);
  return { ok: true };
});
route('POST', '/api/crm/:entity/:id/activities', { auth: 'session', permission: 'crm:write' }, (context, params) => {
  const type = entityType(params.entity!);
  const entries = addEntityActivity(context.runtime, crmActorOf(context), type, params.id!, context.body);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.activity-added', `${type}/${params.id}`);
  return { timeline: entries };
});
route('POST', '/api/crm/:entity/:id/attachments', { auth: 'session', permission: 'crm:write' }, (context, params) => {
  const type = entityType(params.entity!);
  const attachments = addAttachment(context.runtime, actorOf(context), crmActorOf(context), type, params.id!, context.body);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.attachment-added', `${type}/${params.id}`);
  return { attachments };
});
route('POST', '/api/crm/:entity/:id/archive', { auth: 'session', permission: 'crm:write' }, (context, params) => {
  const type = entityType(params.entity!);
  setArchived(context.runtime, crmActorOf(context), type, params.id!, true);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.archived', `${type}/${params.id}`);
  return { ok: true };
});
route('POST', '/api/crm/:entity/:id/restore', { auth: 'session', permission: 'crm:write' }, (context, params) => {
  const type = entityType(params.entity!);
  setArchived(context.runtime, crmActorOf(context), type, params.id!, false);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.restored', `${type}/${params.id}`);
  return { ok: true };
});
route('DELETE', '/api/crm/:entity/:id', { auth: 'session', permission: 'crm:admin' }, (context, params) => {
  const type = entityType(params.entity!);
  if (type === 'opportunity') throw new HttpError(400, 'Oportunidades são arquivadas, não excluídas (histórico comercial).');
  if (record(context.body).confirm !== 'EXCLUIR') throw new HttpError(400, 'Confirme a exclusão definitiva digitando EXCLUIR.');
  purgeEntity(context.runtime, crmActorOf(context), type, params.id!);
  // Auditoria sem dados pessoais: só o tipo e o identificador interno.
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'crm.purged', `${type}/${params.id}`);
  return { ok: true };
});

// ——————————————————— Integrações ———————————————————
// Cada empresa conecta as próprias contas. Tokens ficam cifrados no cofre da instância e nunca saem do servidor.

const callbackLimiter = new LoginLimiter(30, 15 * 60_000);

function providerParam(value: string | undefined): ConnectionProvider {
  if (!isProvider(value)) throw new HttpError(404, 'Integração desconhecida.');
  return value;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Página devolvida ao navegador no retorno do OAuth: sem script; volta sozinha para o Hub. */
function callbackPage(outcome: CallbackOutcome) {
  const target = `/#/integrations?${outcome.ok ? 'conectado' : 'falhou'}=${encodeURIComponent(outcome.provider ?? '')}`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="3;url=${target}"><title>Workfoli Hub</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#151716;color:#F5F5F1;font-family:Manrope,system-ui,sans-serif}
main{max-width:480px;padding:32px;border:1px solid #2c302d;border-radius:12px;background:#202321}h1{font-size:20px;margin:0 0 12px}
p{color:#B8BBB5;line-height:1.5}a{color:#B8F24A}.mark{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:8px;background:${outcome.ok ? '#B8F24A' : '#B8BBB5'}}</style></head>
<body><main><h1><span class="mark"></span>${outcome.ok ? 'Conexão concluída' : 'Conexão não concluída'}</h1><p>${escapeHtml(outcome.message)}</p><p><a href="${target}">Voltar ao Workfoli Hub</a></p></main></body></html>`;
  return raw(html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
}

route('GET', '/api/marketing', { auth: 'session', permission: 'marketing:read' }, context => marketingSummary(context.runtime, { from: context.query.get('from'), to: context.query.get('to') }));
route('GET', '/api/integrations', { auth: 'session', permission: 'integrations:read' }, context => integrationsView(context.runtime, actorOf(context)));
route('GET', '/api/integrations/oauth/callback', { auth: 'public' }, async context => {
  const key = `oauth|${context.ip}`;
  callbackLimiter.check(key);
  const outcome = await completeOAuth(context.runtime, context.query);
  if (outcome.ok) callbackLimiter.succeed(key); else callbackLimiter.fail(key);
  return callbackPage(outcome);
});
route('POST', '/api/integrations/:provider/connect', { auth: 'session', permission: 'integrations:admin' }, (context, params) => startOAuth(context.runtime, actorOf(context), providerParam(params.provider), record(context.body)));
route('POST', '/api/integrations/:provider/token', { auth: 'session', permission: 'integrations:admin' }, (context, params) => connectWithToken(context.runtime, actorOf(context), providerParam(params.provider), record(context.body)));
route('GET', '/api/integrations/:provider/options', { auth: 'session', permission: 'integrations:admin' }, (context, params) => integrationOptions(context.runtime, providerParam(params.provider)));
route('PATCH', '/api/integrations/:provider/settings', { auth: 'session', permission: 'integrations:admin' }, (context, params) => saveIntegrationSettings(context.runtime, actorOf(context), providerParam(params.provider), context.body));
route('POST', '/api/integrations/:provider/sync', { auth: 'session', permission: 'integrations:admin' }, (context, params) => {
  const body = record(context.body);
  return syncProvider(context.runtime, providerParam(params.provider), { from: body.from, to: body.to, actorId: actorOf(context).id });
});
route('POST', '/api/integrations/:provider/disconnect', { auth: 'session', permission: 'integrations:admin' }, (context, params) => disconnectIntegration(context.runtime, actorOf(context), providerParam(params.provider)));


route('GET', '/api/ai/messages', { auth: 'session', permission: 'ai:use' }, context => ({ messages: listMessages(context.runtime, actorOf(context)), provider: context.runtime.config.ai.provider, canAct: can(actorOf(context).permissions, 'ai:act') }));
route('POST', '/api/ai/messages', { auth: 'session', permission: 'ai:use' }, async context => sendMessage(context.runtime, actorOf(context), record(context.body).text));
route('POST', '/api/ai/proposals/:id/confirm', { auth: 'session', permission: 'ai:use' }, (context, params) => confirmProposal(context.runtime, actorOf(context), params.id!, record(context.body).hash));
route('POST', '/api/ai/proposals/:id/reject', { auth: 'session', permission: 'ai:use' }, (context, params) => rejectProposal(context.runtime, actorOf(context), params.id!));

route('GET', '/api/audit', { auth: 'session', permission: 'audit:read' }, context => ({ entries: listAudit(context.runtime.db, { limit: Number(context.query.get('limit')) || 50, before: Number(context.query.get('before')) || undefined, prefix: context.query.get('prefix') ?? undefined }) }));

// ——————————————————— Administração ———————————————————

route('GET', '/api/users', { auth: 'session', permission: 'users:admin' }, context => ({ users: listUsers(context.runtime.db), roles: listRoles(context.runtime.db) }));
route('POST', '/api/users', { auth: 'session', permission: 'users:admin' }, context => {
  const actor = actorOf(context);
  const { user, token } = inviteUser(context.runtime.db, actor, record(context.body));
  audit(context.runtime.db, { type: 'user', id: actor.id }, 'user.invited', user.id, { role: user.roleId });
  return { user, activationPath: `/#/ativar?token=${encodeURIComponent(token)}` };
});
route('PATCH', '/api/users/:id', { auth: 'session', permission: 'users:admin' }, (context, params) => {
  const actor = actorOf(context);
  const user = updateUser(context.runtime.db, actor, params.id!, record(context.body));
  audit(context.runtime.db, { type: 'user', id: actor.id }, 'user.updated', user.id, { role: user.roleId, status: user.status });
  return user;
});
route('POST', '/api/users/:id/activation', { auth: 'session', permission: 'users:admin' }, (context, params) => {
  const actor = actorOf(context);
  const target = listUsers(context.runtime.db).find(user => user.id === params.id);
  if (!target || target.status !== 'pending') throw new HttpError(400, 'Somente usuários pendentes recebem novo link.');
  if (target.roleId === 'owner' && actor.roleId !== 'owner') throw new HttpError(403, 'Somente o proprietário gera link para outro proprietário.');
  if (target.roleId === 'manager' && actor.roleId !== 'owner') throw new HttpError(403, 'Somente o proprietário gera link para o Gestor Workfoli.');
  const token = issueToken(context.runtime.db, 'activation', { userId: target.id, createdBy: actor.id, hours: 72 });
  audit(context.runtime.db, { type: 'user', id: actor.id }, 'user.activation-link', target.id);
  return { activationPath: `/#/ativar?token=${encodeURIComponent(token)}` };
});
route('POST', '/api/roles', { auth: 'session', permission: 'users:admin' }, context => {
  const role = saveCustomRole(context.runtime.db, record(context.body));
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'role.saved', role.id, { permissions: role.permissions });
  return role;
});
route('DELETE', '/api/roles/:id', { auth: 'session', permission: 'users:admin' }, (context, params) => {
  deleteRole(context.runtime.db, params.id!);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'role.deleted', params.id!);
  return { ok: true };
});

route('GET', '/api/settings', { auth: 'session', permission: 'settings:admin' }, ({ runtime }) => {
  const devices = runtime.db.prepare('SELECT id,name,created_at,last_seen_at,revoked_at FROM devices ORDER BY created_at DESC').all() as Array<Record<string, unknown>>;
  const commands = runtime.db.prepare("SELECT status, COUNT(*) AS n FROM base_commands GROUP BY status").all() as Array<{ status: string; n: number }>;
  let roles: ReturnType<typeof diffRolePresets> = [];
  try { roles = diffRolePresets(runtime.db, runtime.base.snapshot().manifest.roles); } catch { /* Base indisponível */ }
  return {
    instance: { id: runtime.instance.file.instanceId, company: runtime.instance.file.company, createdAt: runtime.instance.file.createdAt ?? null, core: runtime.instance.file.core.version, currentCore: coreVersion() },
    hub: { mode: runtime.config.mode, url: hubUrl(runtime.config), theme: runtime.config.branding.theme, ai: runtime.config.ai, disabledModules: runtime.config.modules.disabled, customModules: runtime.config.modules.custom, customErrors: runtime.custom.errors },
    base: runtime.base.status(),
    devices: devices.map(row => ({ id: String(row.id), name: String(row.name), createdAt: String(row.created_at), lastSeenAt: (row.last_seen_at as string | null) ?? null, revoked: !!row.revoked_at })),
    commands: Object.fromEntries(commands.map(row => [row.status, Number(row.n)])),
    pendingRoles: roles,
    secrets: runtime.secrets.names(),
  };
});
route('POST', '/api/settings/roles/apply', { auth: 'session', permission: 'settings:admin' }, context => {
  const actor = actorOf(context);
  if (actor.roleId !== 'owner') throw new HttpError(403, 'Somente o proprietário aprova papéis sugeridos pela Base.');
  const applied = applyRolePresets(context.runtime.db, context.runtime.base.snapshot().manifest.roles);
  audit(context.runtime.db, { type: 'user', id: actor.id }, 'roles.base-applied', null, { roles: applied });
  return { applied };
});
route('POST', '/api/settings/pairing', { auth: 'session', permission: 'settings:admin' }, context => {
  const actor = actorOf(context);
  const name = typeof record(context.body).name === 'string' ? String(record(context.body).name).slice(0, 80) : 'Computador da Base';
  const code = issueToken(context.runtime.db, 'pairing', { createdBy: actor.id, hours: 1, meta: { name } });
  audit(context.runtime.db, { type: 'user', id: actor.id }, 'agent.pairing-code', null);
  return { code, expiresInMinutes: 60 };
});
route('POST', '/api/devices/:id/revoke', { auth: 'session', permission: 'settings:admin' }, (context, params) => {
  const changed = Number(context.runtime.db.prepare('UPDATE devices SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(now(), params.id!).changes);
  if (!changed) throw new HttpError(404, 'Dispositivo não encontrado.');
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'agent.revoked', params.id!);
  return { ok: true };
});

// ——————————————————— Módulos customizados ———————————————————

route('GET', '/api/modules/:id/records', { auth: 'session', permissionFor: params => `${params.id}:read` }, (context, params) => listRecords(context.runtime, params.id!));
route('POST', '/api/modules/:id/records', { auth: 'session', permissionFor: params => `${params.id}:write` }, (context, params) => {
  const saved = saveRecord(context.runtime, actorOf(context), params.id!, context.body);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'record.created', `${params.id}/${saved.id}`);
  return saved;
});
route('PATCH', '/api/modules/:id/records/:rid', { auth: 'session', permissionFor: params => `${params.id}:write` }, (context, params) => {
  const saved = saveRecord(context.runtime, actorOf(context), params.id!, context.body, params.rid);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'record.updated', `${params.id}/${saved.id}`);
  return saved;
});
route('DELETE', '/api/modules/:id/records/:rid', { auth: 'session', permissionFor: params => `${params.id}:write` }, (context, params) => {
  deleteRecord(context.runtime, params.id!, params.rid!);
  audit(context.runtime.db, { type: 'user', id: actorOf(context).id }, 'record.deleted', `${params.id}/${params.rid}`);
  return { ok: true };
});

// ——————————————————— Local Agent ———————————————————

route('POST', '/api/agent/pair', { auth: 'public' }, context => {
  const key = `pair|${context.ip}`;
  pairingLimiter.check(key);
  const body = record(context.body);
  let meta: Record<string, unknown> | null;
  try { meta = consumeToken(context.runtime.db, 'pairing', body.code).meta; } catch (error) { pairingLimiter.fail(key); throw error; }
  pairingLimiter.succeed(key);
  const token = newToken();
  const id = randomUUID();
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : String(meta?.name ?? 'Computador da Base');
  context.runtime.db.prepare('INSERT INTO devices(id,name,token_hash,created_at) VALUES (?,?,?,?)').run(id, name, hashToken(token), now());
  audit(context.runtime.db, { type: 'agent', id }, 'agent.paired', id, { name });
  return { deviceId: id, name, token, instanceId: context.runtime.instance.file.instanceId };
});

route('POST', '/api/agent/snapshot', { auth: 'device', bodyLimit: 40 * 1024 * 1024 }, context => {
  if (!(context.runtime.base instanceof SnapshotBaseAccess)) throw new HttpError(409, 'Este Hub lê a Base diretamente do disco (modo local); o Agent não precisa enviar snapshot.');
  const result = context.runtime.base.receive(context.body, context.device!.id);
  if (result.changed) audit(context.runtime.db, { type: 'agent', id: context.device!.id }, 'agent.snapshot', result.revision.slice(0, 16), { files: result.files });
  return result;
});
route('GET', '/api/agent/commands', { auth: 'device' }, ({ runtime }) => {
  const rows = runtime.db.prepare(`SELECT c.id,c.type,c.payload,c.expected_revision,u.name AS actor_name FROM base_commands c LEFT JOIN users u ON u.id=c.created_by
    WHERE c.status IN ('queued','delivered') ORDER BY c.created_at LIMIT 20`).all() as Array<Record<string, unknown>>;
  const mark = runtime.db.prepare("UPDATE base_commands SET status='delivered', delivered_at=? WHERE id=? AND status='queued'");
  for (const row of rows) mark.run(now(), row.id as string);
  return { commands: rows.map(row => ({ id: String(row.id), type: String(row.type), change: JSON.parse(String(row.payload)) as unknown, expectedRevision: (row.expected_revision as string | null) ?? null, actorName: (row.actor_name as string | null) ?? null })) };
});
route('POST', '/api/agent/commands/:id/receipt', { auth: 'device' }, (context, params) => {
  const body = record(context.body);
  const status = body.status === 'applied' ? 'applied' : body.status === 'failed' ? 'failed' : null;
  if (!status) throw new HttpError(400, 'Recibo inválido.');
  const detail = typeof body.detail === 'string' ? body.detail.slice(0, 500) : null;
  const changed = Number(context.runtime.db.prepare("UPDATE base_commands SET status=?, completed_at=?, receipt=? WHERE id=? AND status IN ('queued','delivered')")
    .run(status, now(), JSON.stringify({ detail, device: context.device!.id }), params.id!).changes);
  if (!changed) return { ok: true, duplicate: true };
  audit(context.runtime.db, { type: 'agent', id: context.device!.id }, status === 'applied' ? 'base.command-applied' : 'base.command-failed', params.id!, { detail: detail ?? '' }, status === 'applied' ? 'ok' : 'error');
  return { ok: true };
});

export function permissionFor(routeItem: ApiRoute, params: Record<string, string>): string | undefined {
  return routeItem.permissionFor ? routeItem.permissionFor(params) : routeItem.options.permission;
}
