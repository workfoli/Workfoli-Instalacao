import { listAudit } from '../audit.js';
import { can } from '../permissions.js';
import type { Actor, HubRuntime } from '../runtime.js';
import { baseTasks, companyView, listDocuments, listProjects } from './content.js';
import { listTasks } from './operations.js';
import { crmModuleLabel } from '../crm/config.js';
import { crmSummary } from '../crm/reports.js';

const safe = <T>(read: () => T, fallback: T): T => { try { return read(); } catch { return fallback; } };

/** Painel inicial: só inclui blocos que o usuário pode ver. */
export function overview(runtime: HubRuntime, actor: Actor) {
  const allowed = (permission: string) => can(actor.permissions, permission);
  const status = runtime.base.status();
  const company = allowed('company:read') ? safe(() => companyView(runtime, actor), null) : null;
  const tasks = allowed('tasks:read') ? listTasks(runtime) : null;
  const projects = allowed('projects:read') ? safe(() => listProjects(runtime, actor).projects, []) : null;
  const documents = allowed('knowledge:read') ? safe(() => listDocuments(runtime, actor), []) : null;
  const crm = allowed('crm:read') ? safe(() => {
    const summary = crmSummary(runtime, {});
    const newLeads = Number((runtime.db.prepare("SELECT COUNT(*) AS n FROM crm_leads WHERE status='new' AND archived_at IS NULL").get() as { n: number }).n);
    return {
      label: crmModuleLabel(runtime), pipeline: summary.pipeline.name, currency: summary.currency, newLeads,
      openCount: summary.open.count, openValueCents: summary.open.valueCents,
      stages: summary.open.stages.map(stage => ({ stage: stage.name, count: stage.count })),
    };
  }, null) : null;
  return {
    user: { name: actor.name },
    company: company ? { name: company.company.name, tagline: company.company.tagline ?? null, description: company.company.description ?? null, segment: company.company.segment ?? null, services: company.services.map(service => ({ id: service.id, name: service.name, status: service.status, transversal: service.transversal === true })), method: company.identity.voice.method ?? [], message: company.identity.voice.message ?? null, concept: company.identity.voice.concept ?? null } : null,
    base: status,
    counts: {
      tasksOpen: tasks ? tasks.filter(task => task.status !== 'done').length : null,
      tasksDoing: tasks ? tasks.filter(task => task.status === 'doing').length : null,
      projectsActive: projects ? projects.filter(project => project.status === 'active').length : null,
      projectsPlanned: projects ? projects.filter(project => project.status === 'planned').length : null,
      documents: documents ? documents.length : null,
      opportunitiesOpen: crm ? crm.openCount : null,
      leadsNew: crm ? crm.newLeads : null,
    },
    myTasks: tasks ? tasks.filter(task => task.status !== 'done' && (task.assignee?.id === actor.id || !task.assignee)).slice(0, 6) : null,
    baseTasks: allowed('tasks:read') ? safe(() => baseTasks(runtime).filter(section => !/feito|conclu/i.test(section.title)).map(section => ({ ...section, items: section.items.filter(item => !item.done).slice(0, 5) })).filter(section => section.items.length), []) : null,
    projects: projects ? projects.filter(project => project.status === 'active' || project.status === 'planned').slice(0, 6).map(project => ({ id: project.id, name: project.name, typeLabel: project.typeLabel, status: project.status })) : null,
    crm,
    activity: allowed('audit:read') ? listAudit(runtime.db, { limit: 8 }) : null,
  };
}
