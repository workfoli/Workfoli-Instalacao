import { PROJECT_TYPES } from '../../contract/workfoli-contract.mjs';
import type { ProjectType } from '../../contract/workfoli-contract.mjs';
import { PROJECT_TYPE_LABELS } from '../base-changes.js';
import { HttpError } from '../http.js';
import { createTask, customModule, saveRecord } from '../services/operations.js';
import { crmConfig, crmLabels, crmSources, defaultPipeline, sourceLabel } from '../crm/config.js';
import { RELATIONSHIPS, createContact, createLead, createOpportunity } from '../crm/service.js';
import type { Relationship } from '../crm/service.js';
import type { Actor, HubRuntime } from '../runtime.js';

/**
 * Ações que a IA pode PROPOR. Lista fechada, campos tipados, permissão própria.
 * A execução passa pelos mesmos serviços da interface: a IA não tem atalho nem privilégio extra.
 * Nenhuma ação destrutiva (excluir, publicar, enviar, pagar) existe aqui.
 */
export interface ActionField { label: string; value: string; }
export interface ActionDefinition<P = Record<string, unknown>> {
  type: string;
  label: string;
  /** Rótulo com o vocabulário da empresa (ex.: "Cadastrar paciente"). */
  labelFor?(runtime: HubRuntime): string;
  permission(payload: P): string;
  validate(runtime: HubRuntime, payload: unknown): P;
  describe(runtime: HubRuntime, payload: P): ActionField[];
  execute(runtime: HubRuntime, actor: Actor, payload: P): { message: string; link?: string };
}

const text = (value: unknown, max: number, required = false): string | null => {
  if (value === undefined || value === null || value === '') { if (required) throw new HttpError(400, 'Campo obrigatório ausente na proposta.'); return null; }
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, 'Campo inválido na proposta.');
  return value.trim() || null;
};

const taskCreate: ActionDefinition<{ title: string; notes: string | null; dueDate: string | null; projectId: string | null }> = {
  type: 'task.create', label: 'Criar tarefa',
  permission: () => 'tasks:write',
  validate: (_runtime, payload) => {
    const value = payload as Record<string, unknown>;
    const dueDate = text(value?.dueDate, 10);
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new HttpError(400, 'Prazo inválido na proposta.');
    return { title: text(value?.title, 200, true)!, notes: text(value?.notes, 2000), dueDate, projectId: text(value?.projectId, 63) };
  },
  describe: (runtime, payload) => {
    const project = payload.projectId ? runtime.base.snapshot().manifest.projects.find(item => item.id === payload.projectId)?.name ?? payload.projectId : null;
    return [{ label: 'Tarefa', value: payload.title }, ...(payload.notes ? [{ label: 'Observações', value: payload.notes }] : []), ...(payload.dueDate ? [{ label: 'Prazo', value: payload.dueDate.split('-').reverse().join('/') }] : []), ...(project ? [{ label: 'Projeto', value: project }] : [])];
  },
  execute: (runtime, actor, payload) => {
    const task = createTask(runtime, actor, { ...payload, source: 'ai' });
    return { message: `Tarefa criada: ${task.title}`, link: '#/tasks' };
  },
};

const RELATIONSHIP_LABELS: Record<Relationship, string> = { prospect: 'Prospecção', customer: 'Cliente', partner: 'Parceiro', supplier: 'Fornecedor', other: 'Outro' };
const aiActor = (actor: Actor) => ({ type: 'ai' as const, id: actor.id, origin: 'ai' });

const contactCreate: ActionDefinition<{ name: string; relationship: Relationship; email: string | null; phone: string | null; organization: string | null; notes: string | null }> = {
  type: 'contact.create', label: 'Cadastrar contato',
  labelFor: runtime => `Cadastrar ${crmLabels(crmConfig(runtime)).contact.toLowerCase()}`,
  permission: () => 'crm:write',
  validate: (_runtime, payload) => {
    const value = payload as Record<string, unknown>;
    const relationship = typeof value?.relationship === 'string' && (RELATIONSHIPS as readonly string[]).includes(value.relationship) ? value.relationship as Relationship : 'prospect';
    return { name: text(value?.name, 160, true)!, relationship, email: text(value?.email, 254), phone: text(value?.phone, 40), organization: text(value?.organization, 160), notes: text(value?.notes, 2000) };
  },
  describe: (runtime, payload) => {
    const labels = crmLabels(crmConfig(runtime));
    return [{ label: labels.contact, value: payload.name }, { label: 'Relação', value: RELATIONSHIP_LABELS[payload.relationship] },
      ...(payload.email ? [{ label: 'E-mail', value: payload.email }] : []), ...(payload.phone ? [{ label: 'Telefone', value: payload.phone }] : []),
      ...(payload.organization ? [{ label: labels.organization, value: payload.organization }] : []), ...(payload.notes ? [{ label: 'Observações', value: payload.notes }] : [])];
  },
  execute: (runtime, actor, payload) => {
    const contact = createContact(runtime, aiActor(actor), { name: payload.name, relationship: payload.relationship, email: payload.email, phone: payload.phone, notes: payload.notes, ...(payload.organization ? { organizationName: payload.organization } : {}) });
    return { message: `${crmLabels(crmConfig(runtime)).contact} cadastrado: ${contact.name}`, link: `#/crm/contatos/${contact.id}` };
  },
};

const leadCreate: ActionDefinition<{ name: string; email: string | null; phone: string | null; company: string | null; sourceId: string | null; message: string | null }> = {
  type: 'lead.create', label: 'Registrar lead',
  labelFor: runtime => `Registrar ${crmLabels(crmConfig(runtime)).lead.toLowerCase()}`,
  permission: () => 'crm:write',
  validate: (runtime, payload) => {
    const value = payload as Record<string, unknown>;
    const source = text(value?.sourceId, 40);
    return {
      name: text(value?.name, 160, true)!, email: text(value?.email, 254), phone: text(value?.phone, 40), company: text(value?.company, 160),
      // Origem desconhecida não inventa categoria: fica em branco para a pessoa escolher.
      sourceId: source && crmSources(crmConfig(runtime)).some(item => item.id === source) ? source : null, message: text(value?.message, 2000),
    };
  },
  describe: (runtime, payload) => {
    const config = crmConfig(runtime);
    return [{ label: crmLabels(config).lead, value: payload.name }, ...(payload.company ? [{ label: 'Empresa', value: payload.company }] : []),
      ...(payload.email ? [{ label: 'E-mail', value: payload.email }] : []), ...(payload.phone ? [{ label: 'Telefone', value: payload.phone }] : []),
      { label: 'Origem', value: sourceLabel(config, payload.sourceId) ?? 'Manual' }, ...(payload.message ? [{ label: 'Mensagem', value: payload.message }] : [])];
  },
  execute: (runtime, actor, payload) => {
    const lead = createLead(runtime, aiActor(actor), { ...payload, sourceId: payload.sourceId ?? 'manual' });
    return { message: `${crmLabels(crmConfig(runtime)).lead} registrado: ${lead.name}`, link: `#/crm/leads/${lead.id}` };
  },
};

const opportunityCreate: ActionDefinition<{ title: string; value: number | null; contactId: string | null; contactName: string | null; stageId: string | null }> = {
  type: 'opportunity.create', label: 'Criar oportunidade',
  labelFor: runtime => `Criar ${crmLabels(crmConfig(runtime)).opportunity.toLowerCase()}`,
  permission: () => 'crm:write',
  validate: (runtime, payload) => {
    const value = payload as Record<string, unknown>;
    const amount = value?.value === null || value?.value === undefined || value?.value === '' ? null : Number(value.value);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 1e11)) throw new HttpError(400, 'Valor inválido na proposta.');
    const contactName = text(value?.contactName, 160);
    // Vincula ao contato somente quando o nome aponta para UM cadastro; na dúvida, fica sem vínculo.
    let contactId = text(value?.contactId, 80);
    if (!contactId && contactName) {
      const matches = runtime.db.prepare('SELECT id FROM crm_contacts WHERE name=? COLLATE NOCASE AND archived_at IS NULL LIMIT 2').all(contactName) as Array<{ id: string }>;
      contactId = matches.length === 1 ? matches[0]!.id : null;
    }
    const pipeline = defaultPipeline(crmConfig(runtime));
    const stageId = text(value?.stageId, 40);
    return { title: text(value?.title, 160, true)!, value: amount, contactId, contactName, stageId: stageId && pipeline.stages.some(stage => stage.id === stageId && stage.kind === 'open') ? stageId : null };
  },
  describe: (runtime, payload) => {
    const config = crmConfig(runtime);
    const pipeline = defaultPipeline(config);
    const stage = pipeline.stages.find(item => item.id === payload.stageId) ?? pipeline.stages.find(item => item.kind === 'open')!;
    const contact = payload.contactId ? (runtime.db.prepare('SELECT name FROM crm_contacts WHERE id=?').get(payload.contactId) as { name: string } | undefined)?.name : null;
    return [{ label: crmLabels(config).opportunity, value: payload.title },
      ...(payload.value !== null ? [{ label: 'Valor', value: payload.value.toLocaleString('pt-BR', { style: 'currency', currency: config.currency }) }] : []),
      { label: 'Funil', value: `${pipeline.name} → ${stage.name}` },
      { label: crmLabels(config).contact, value: contact ?? (payload.contactName ? `${payload.contactName} (não encontrado; fica sem vínculo)` : '—') }];
  },
  execute: (runtime, actor, payload) => {
    const opportunity = createOpportunity(runtime, aiActor(actor), { title: payload.title, value: payload.value, contactId: payload.contactId, ...(payload.stageId ? { stageId: payload.stageId } : {}) });
    return { message: `${crmLabels(crmConfig(runtime)).opportunity} criada: ${opportunity.title}`, link: `#/crm/oportunidades/${opportunity.id}` };
  },
};

const projectCreate: ActionDefinition<{ name: string; type: ProjectType; summary: string | null }> = {
  type: 'project.create', label: 'Criar projeto na Base',
  permission: () => 'projects:write',
  validate: (_runtime, payload) => {
    const value = payload as Record<string, unknown>;
    if (typeof value?.type !== 'string' || !(PROJECT_TYPES as readonly string[]).includes(value.type)) throw new HttpError(400, 'Tipo de projeto inválido na proposta.');
    return { name: text(value.name, 120, true)!, type: value.type as ProjectType, summary: text(value.summary, 600) };
  },
  describe: (runtime, payload) => [
    { label: 'Projeto', value: payload.name }, { label: 'Tipo', value: PROJECT_TYPE_LABELS[payload.type] },
    ...(payload.summary ? [{ label: 'Objetivo', value: payload.summary }] : []),
    { label: 'Onde', value: runtime.config.mode === 'remote' ? 'Base (aplicado pelo computador conectado)' : 'Base da empresa (projetos/)' },
  ],
  execute: (runtime, actor, payload) => {
    const outcome = runtime.submitBaseChange({ type: 'project.create', project: { ...payload, services: [] } }, { id: actor.id, name: actor.name });
    return outcome.status === 'applied' ? { message: outcome.result.summary, link: '#/projects' } : { message: outcome.summary, link: '#/projects' };
  },
};

const noteCreate: ActionDefinition<{ title: string; body: string }> = {
  type: 'note.create', label: 'Registrar nota na Base',
  permission: () => 'knowledge:write',
  validate: (_runtime, payload) => {
    const value = payload as Record<string, unknown>;
    return { title: text(value?.title, 140, true)!, body: text(value?.body, 20_000, true)! };
  },
  describe: (_runtime, payload) => [{ label: 'Título', value: payload.title }, { label: 'Texto', value: payload.body.length > 400 ? `${payload.body.slice(0, 400)}…` : payload.body }],
  execute: (runtime, actor, payload) => {
    const outcome = runtime.submitBaseChange({ type: 'knowledge.note', note: payload }, { id: actor.id, name: actor.name });
    return outcome.status === 'applied' ? { message: outcome.result.summary, link: '#/knowledge' } : { message: outcome.summary, link: '#/knowledge' };
  },
};

const recordCreate: ActionDefinition<{ moduleId: string; data: Record<string, unknown> }> = {
  type: 'record.create', label: 'Criar registro',
  permission: payload => `${payload.moduleId}:write`,
  validate: (runtime, payload) => {
    const value = payload as Record<string, unknown>;
    if (typeof value?.moduleId !== 'string') throw new HttpError(400, 'Módulo inválido na proposta.');
    customModule(runtime, value.moduleId);
    if (!value.data || typeof value.data !== 'object') throw new HttpError(400, 'Dados inválidos na proposta.');
    return { moduleId: value.moduleId, data: value.data as Record<string, unknown> };
  },
  describe: (runtime, payload) => {
    const module = customModule(runtime, payload.moduleId);
    return [{ label: 'Módulo', value: module.label }, ...module.fields.filter(field => payload.data[field.id] !== undefined && payload.data[field.id] !== null).map(field => ({ label: field.label, value: String(payload.data[field.id]) }))];
  },
  execute: (runtime, actor, payload) => {
    saveRecord(runtime, actor, payload.moduleId, payload.data);
    return { message: `${customModule(runtime, payload.moduleId).entityLabel} registrado.`, link: `#/m/${payload.moduleId}` };
  },
};

export const ACTIONS: Readonly<Record<string, ActionDefinition<any>>> = Object.freeze({
  [taskCreate.type]: taskCreate, [contactCreate.type]: contactCreate, [leadCreate.type]: leadCreate, [opportunityCreate.type]: opportunityCreate, [projectCreate.type]: projectCreate,
  [noteCreate.type]: noteCreate, [recordCreate.type]: recordCreate,
});
