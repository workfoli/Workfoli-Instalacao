import { createHash, randomUUID } from 'node:crypto';
import { audit } from '../audit.js';
import { now, transaction } from '../db.js';
import { HttpError } from '../http.js';
import { can } from '../permissions.js';
import { visibleModules } from '../runtime.js';
import type { Actor, HubRuntime } from '../runtime.js';
import { baseTasks, companyView, listDocuments, listProjects } from '../services/content.js';
import { integrationsView } from '../services/integrations.js';
import { listTasks } from '../services/operations.js';
import { crmConfig, crmLabels, crmSources, defaultPipeline } from '../crm/config.js';
import { ACTIONS } from './actions.js';
import { localProvider } from './local-provider.js';
import type { AiContext, AiProvider } from './provider.js';

const PROPOSAL_MINUTES = 30;

export interface ProposalView {
  id: string; type: string; label: string; fields: Array<{ label: string; value: string }>; status: string;
  hash: string; expiresAt: string; result: { message: string; link?: string } | null;
}
export interface MessageView { id: string; role: 'user' | 'assistant'; text: string; createdAt: string; proposals: ProposalView[]; }

function provider(runtime: HubRuntime): AiProvider {
  if (runtime.config.ai.provider === 'none') throw new HttpError(403, 'A IA está desligada nesta instalação.');
  // Provedores externos exigem adaptador e autorização explícita; enquanto não configurados, fica o local.
  return localProvider;
}

/** Contexto mínimo e autorizado: cada bloco só entra se o usuário pode ler o módulo correspondente. */
export function buildContext(runtime: HubRuntime, actor: Actor): AiContext {
  const allowed = (permission: string) => can(actor.permissions, permission);
  const safe = <T>(read: () => T): T | null => { try { return read(); } catch { return null; } };
  const modules = visibleModules(runtime, actor);
  const company = allowed('company:read') ? safe(() => {
    const view = companyView(runtime, actor);
    return { name: view.company.name, tagline: view.company.tagline ?? null, description: view.company.description ?? null, services: view.services.map(service => service.name) };
  }) : null;
  const tasks = allowed('tasks:read') ? (() => {
    const all = listTasks(runtime).filter(task => task.status !== 'done');
    return { open: all.filter(task => task.status === 'open').length, doing: all.filter(task => task.status === 'doing').length, items: all.slice(0, 20).map(task => ({ title: task.title, dueDate: task.dueDate, status: task.status })) };
  })() : null;
  const crm = allowed('crm:read') ? safe(() => {
    const config = crmConfig(runtime);
    const labels = crmLabels(config);
    const pipeline = defaultPipeline(config);
    const rows = runtime.db.prepare("SELECT stage_id, COUNT(*) AS n FROM crm_opportunities WHERE pipeline_id=? AND status='open' AND archived_at IS NULL GROUP BY stage_id").all(pipeline.id) as Array<{ stage_id: string; n: number }>;
    const count = (sql: string) => Number((runtime.db.prepare(sql).get() as { n: number }).n);
    return {
      pipeline: pipeline.name, openOpportunities: rows.reduce((sum, row) => sum + Number(row.n), 0),
      byStage: Object.fromEntries(pipeline.stages.filter(stage => stage.kind === 'open').map(stage => [stage.name, Number(rows.find(row => row.stage_id === stage.id)?.n ?? 0)])),
      stages: pipeline.stages.map(stage => stage.name),
      leadsOpen: count("SELECT COUNT(*) AS n FROM crm_leads WHERE status IN ('new','working','qualified') AND archived_at IS NULL"),
      contacts: count('SELECT COUNT(*) AS n FROM crm_contacts WHERE archived_at IS NULL'),
      labels: { contact: labels.contact, contacts: labels.contacts, lead: labels.lead, leads: labels.leads, opportunity: labels.opportunity, opportunities: labels.opportunities },
      sources: crmSources(config).map(source => ({ id: source.id, label: source.label })),
    };
  }) : null;
  const actions = allowed('ai:act') ? Object.values(ACTIONS).filter(action => {
    if (action.type === 'record.create') return modules.custom.some(module => allowed(`${module.id}:write`));
    return allowed(action.permission({} as never));
  }).map(action => action.type) : [];
  return {
    company, tasks, crm, actions,
    user: { name: actor.name, role: actor.roleId },
    projects: allowed('projects:read') ? safe(() => listProjects(runtime, actor).projects.map(project => ({ id: project.id, name: project.name, type: project.type, status: project.status }))) : null,
    baseTasks: allowed('tasks:read') ? safe(() => baseTasks(runtime).flatMap(section => section.items.filter(item => !item.done).map(item => `${item.text} (${section.title})`))) : null,
    knowledge: allowed('knowledge:read') ? safe(() => listDocuments(runtime, actor).map(doc => doc.title).slice(0, 60)) : null,
    integrations: allowed('integrations:read') ? safe(() => integrationsView(runtime, actor).cards.map(card => ({ provider: card.provider, label: card.label, state: card.state === 'attention' ? 'connected' : card.state }))) : null,
    modules: { active: modules.active.map(module => module.id), planned: modules.planned.map(module => module.id), custom: modules.custom.map(module => ({ id: module.id, label: module.label })) },
    today: new Date().toISOString().slice(0, 10),
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

const proposalHash = (type: string, payload: unknown) => createHash('sha256').update(`${type}\n${canonical(payload)}`).digest('hex');

function proposalView(runtime: HubRuntime, row: Record<string, unknown>): ProposalView {
  const action = ACTIONS[String(row.type)];
  const payload = JSON.parse(String(row.payload)) as Record<string, unknown>;
  let fields: ProposalView['fields'] = [];
  try { fields = action ? action.describe(runtime, payload) : []; } catch { fields = []; }
  const expired = row.status === 'pending' && Date.parse(String(row.expires_at)) <= Date.now();
  return {
    id: String(row.id), type: String(row.type), label: (() => { try { return action?.labelFor?.(runtime) ?? action?.label ?? String(row.type); } catch { return action?.label ?? String(row.type); } })(), fields, status: expired ? 'expired' : String(row.status),
    hash: String(row.hash), expiresAt: String(row.expires_at), result: row.result ? JSON.parse(String(row.result)) as ProposalView['result'] : null,
  };
}

export function listMessages(runtime: HubRuntime, actor: Actor): MessageView[] {
  const rows = runtime.db.prepare('SELECT id,role,text,proposals,created_at FROM ai_messages WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 60').all(actor.id) as Array<Record<string, unknown>>;
  return rows.reverse().map(row => {
    const ids = row.proposals ? JSON.parse(String(row.proposals)) as string[] : [];
    const proposals = ids.map(id => runtime.db.prepare('SELECT * FROM proposals WHERE id=? AND user_id=?').get(id, actor.id) as Record<string, unknown> | undefined)
      .filter((value): value is Record<string, unknown> => !!value).map(value => proposalView(runtime, value));
    return { id: String(row.id), role: row.role as MessageView['role'], text: String(row.text), createdAt: String(row.created_at), proposals };
  });
}

export async function sendMessage(runtime: HubRuntime, actor: Actor, input: unknown): Promise<MessageView> {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text || text.length > 2000) throw new HttpError(400, 'Escreva uma mensagem de até 2000 caracteres.');
  const ai = provider(runtime);
  const context = buildContext(runtime, actor);
  runtime.db.prepare("INSERT INTO ai_messages(id,user_id,role,text,created_at) VALUES (?,?,'user',?,?)").run(randomUUID(), actor.id, text, now());
  const response = await ai.respond({ text, context });
  const notes: string[] = [];
  const proposalIds: string[] = [];
  for (const draft of response.drafts.slice(0, 5)) {
    const action = ACTIONS[draft.type];
    if (!action) continue;
    let payload;
    try { payload = action.validate(runtime, draft.payload); }
    catch (error) { notes.push(`Não consegui montar a proposta: ${(error as Error).message}`); continue; }
    // A IA nunca amplia permissões: sem ai:act e sem a permissão da ação, a proposta nem é criada.
    if (!can(actor.permissions, 'ai:act') || !can(actor.permissions, action.permission(payload))) { notes.push(`Seu acesso não permite "${action.label}".`); continue; }
    const id = randomUUID();
    runtime.db.prepare("INSERT INTO proposals(id,user_id,type,payload,summary,hash,status,created_at,expires_at) VALUES (?,?,?,?,?,?,'pending',?,?)")
      .run(id, actor.id, action.type, JSON.stringify(payload), action.label, proposalHash(action.type, payload), now(), new Date(Date.now() + PROPOSAL_MINUTES * 60_000).toISOString());
    audit(runtime.db, { type: 'ai', id: actor.id }, 'ai.proposal.created', id, { type: action.type, provider: ai.id });
    proposalIds.push(id);
  }
  const reply = [response.reply, ...notes].filter(Boolean).join('\n\n');
  const id = randomUUID();
  runtime.db.prepare("INSERT INTO ai_messages(id,user_id,role,text,proposals,created_at) VALUES (?,?,'assistant',?,?,?)").run(id, actor.id, reply, JSON.stringify(proposalIds), now());
  return listMessages(runtime, actor).find(message => message.id === id)!;
}

/**
 * Confirmação: o usuário confirma EXATAMENTE a proposta exibida (hash). Revalida validade, permissões e
 * dados no momento da execução; executa pelos serviços normais; audita sucesso ou falha.
 */
export function confirmProposal(runtime: HubRuntime, actor: Actor, id: string, hash: unknown): ProposalView {
  const row = runtime.db.prepare('SELECT * FROM proposals WHERE id=? AND user_id=?').get(id, actor.id) as Record<string, unknown> | undefined;
  if (!row) throw new HttpError(404, 'Proposta não encontrada.');
  if (row.status !== 'pending') throw new HttpError(409, 'Esta proposta já foi decidida.');
  if (Date.parse(String(row.expires_at)) <= Date.now()) {
    runtime.db.prepare("UPDATE proposals SET status='expired', decided_at=? WHERE id=?").run(now(), id);
    throw new HttpError(410, 'A proposta expirou. Peça novamente.');
  }
  if (typeof hash !== 'string' || hash !== row.hash) throw new HttpError(409, 'A proposta mudou desde que foi exibida. Recarregue antes de confirmar.');
  const action = ACTIONS[String(row.type)];
  if (!action) throw new HttpError(400, 'Ação não suportada.');
  const payload = action.validate(runtime, JSON.parse(String(row.payload)));
  if (!can(actor.permissions, 'ai:act') || !can(actor.permissions, action.permission(payload))) {
    audit(runtime.db, { type: 'user', id: actor.id }, 'ai.proposal.denied', id, { type: action.type }, 'denied');
    throw new HttpError(403, 'Seu acesso atual não permite esta ação.');
  }
  // Marca como decidida antes de executar: duas confirmações simultâneas não duplicam o efeito.
  const claimed = transaction(runtime.db, () => Number(runtime.db.prepare("UPDATE proposals SET status='executed', decided_at=? WHERE id=? AND status='pending'").run(now(), id).changes));
  if (!claimed) throw new HttpError(409, 'Esta proposta já foi decidida.');
  try {
    const result = action.execute(runtime, actor, payload);
    runtime.db.prepare('UPDATE proposals SET result=? WHERE id=?').run(JSON.stringify(result), id);
    audit(runtime.db, { type: 'user', id: actor.id }, 'ai.proposal.executed', id, { type: action.type });
  } catch (error) {
    const message = error instanceof HttpError || error instanceof Error ? error.message : 'Falha ao executar.';
    runtime.db.prepare("UPDATE proposals SET status='failed', result=? WHERE id=?").run(JSON.stringify({ message }), id);
    audit(runtime.db, { type: 'user', id: actor.id }, 'ai.proposal.failed', id, { type: action.type }, 'error');
  }
  return proposalView(runtime, runtime.db.prepare('SELECT * FROM proposals WHERE id=?').get(id) as Record<string, unknown>);
}

export function rejectProposal(runtime: HubRuntime, actor: Actor, id: string): ProposalView {
  const changed = Number(runtime.db.prepare("UPDATE proposals SET status='rejected', decided_at=? WHERE id=? AND user_id=? AND status='pending'").run(now(), id, actor.id).changes);
  if (!changed) throw new HttpError(409, 'Proposta inexistente ou já decidida.');
  audit(runtime.db, { type: 'user', id: actor.id }, 'ai.proposal.rejected', id);
  return proposalView(runtime, runtime.db.prepare('SELECT * FROM proposals WHERE id=?').get(id) as Record<string, unknown>);
}
