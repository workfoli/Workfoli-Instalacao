import { formatIssues, validateCrmConfig } from '../../contract/workfoli-contract.mjs';
import { HttpError } from '../http.js';
import { can } from '../permissions.js';
import type { Actor, BaseChangeOutcome, HubRuntime } from '../runtime.js';
import { listTasks } from '../services/operations.js';
import { listUsers } from '../users.js';
import { crmConfig, crmLabels, crmModuleLabel, crmSources, findStage } from './config.js';
import { timeline } from './history.js';
import type { CrmEntityType } from './history.js';
import {
  getContact, getLead, getOpportunity, getOrganization, leadMatches, listAttachments, listContacts, listLeads, listOpportunities,
} from './service.js';

/** Tudo o que a interface precisa para montar o CRM desta empresa (estrutura vinda da Base). */
export function crmSettingsView(runtime: HubRuntime, actor: Actor) {
  const config = crmConfig(runtime);
  const usage: Record<string, Record<string, number>> = {};
  for (const row of runtime.db.prepare("SELECT pipeline_id, stage_id, COUNT(*) AS n FROM crm_opportunities WHERE status='open' AND archived_at IS NULL GROUP BY pipeline_id, stage_id").all() as Array<{ pipeline_id: string; stage_id: string; n: number }>) {
    (usage[row.pipeline_id] ??= {})[row.stage_id] = Number(row.n);
  }
  return {
    config, labels: crmLabels(config), moduleLabel: crmModuleLabel(runtime), sources: crmSources(config), usage,
    users: listUsers(runtime.db).filter(user => user.status === 'active').map(user => ({ id: user.id, name: user.name })),
    canWrite: can(actor.permissions, 'crm:write'), canAdmin: can(actor.permissions, 'crm:admin'),
    base: { mode: runtime.config.mode },
  };
}

/**
 * Salva a configuração do CRM NA BASE (alteração tipada `crm.config`: direto no modo local, pelo Local
 * Agent no remoto). Recusa remover ou fechar etapas que ainda têm oportunidades abertas.
 */
export function saveCrmConfig(runtime: HubRuntime, actor: Actor, input: unknown): BaseChangeOutcome {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const checked = validateCrmConfig(body.crm);
  if (!checked.ok) throw new HttpError(400, `Configuração do CRM inválida:\n${formatIssues(checked.errors)}`, 'invalid-config', { issues: checked.errors });
  const next = checked.value!;
  const current = crmConfig(runtime);
  const rows = runtime.db.prepare("SELECT pipeline_id, stage_id, COUNT(*) AS n FROM crm_opportunities WHERE status='open' AND archived_at IS NULL GROUP BY pipeline_id, stage_id").all() as Array<{ pipeline_id: string; stage_id: string; n: number }>;
  const blocked = rows.flatMap(row => {
    const before = findStage(current, row.pipeline_id, row.stage_id);
    if (!before) return []; // já estava fora da configuração: não impede salvar
    const after = findStage(next, row.pipeline_id, row.stage_id);
    return after && after.stage.kind === 'open' ? [] : [{ pipelineId: row.pipeline_id, stageId: row.stage_id, name: `${before.stage.name} (${before.pipeline.name})`, count: Number(row.n) }];
  });
  if (blocked.length) {
    throw new HttpError(409, `Há oportunidades abertas em etapas que seriam removidas ou fechadas: ${blocked.map(item => `${item.name}: ${item.count}`).join('; ')}. Mova-as antes de salvar.`, 'stages-in-use', { stages: blocked });
  }
  return runtime.submitBaseChange({ type: 'crm.config', crm: next }, { id: actor.id, name: actor.name });
}

function related(runtime: HubRuntime, viewer: Actor, type: CrmEntityType, id: string) {
  return {
    timeline: timeline(runtime.db, type, id),
    tasks: can(viewer.permissions, 'tasks:read') ? listTasks(runtime, { relatedType: type, relatedId: id }) : null,
    attachments: listAttachments(runtime, viewer, type, id),
  };
}

export function contactDetail(runtime: HubRuntime, viewer: Actor, id: string) {
  const contact = getContact(runtime, id);
  return { contact, opportunities: listOpportunities(runtime, { contactId: id }), leads: listLeads(runtime, { contactId: id }), ...related(runtime, viewer, 'contact', id) };
}

export function organizationDetail(runtime: HubRuntime, viewer: Actor, id: string) {
  const organization = getOrganization(runtime, id);
  return { organization, contacts: listContacts(runtime, { organizationId: id }), opportunities: listOpportunities(runtime, { organizationId: id }), ...related(runtime, viewer, 'organization', id) };
}

export function leadDetail(runtime: HubRuntime, viewer: Actor, id: string) {
  const lead = getLead(runtime, id);
  return { lead, matches: lead.status === 'converted' ? [] : leadMatches(runtime, lead), ...related(runtime, viewer, 'lead', id) };
}

export function opportunityDetail(runtime: HubRuntime, viewer: Actor, id: string) {
  const opportunity = getOpportunity(runtime, id);
  const safe = <T>(read: () => T): T | null => { try { return read(); } catch { return null; } };
  return {
    opportunity,
    contact: opportunity.contact ? safe(() => getContact(runtime, opportunity.contact!.id)) : null,
    organization: opportunity.organization ? safe(() => getOrganization(runtime, opportunity.organization!.id)) : null,
    lead: opportunity.leadId ? safe(() => getLead(runtime, opportunity.leadId!)) : null,
    ...related(runtime, viewer, 'opportunity', id),
  };
}
