import { randomUUID } from 'node:crypto';
import type { CrmAutomationEvent, CrmConfig } from '../../contract/workfoli-contract.mjs';
import { now } from '../db.js';
import type { HubDatabase } from '../db.js';
import { SYSTEM_ACTOR, addActivity } from './history.js';
import type { CrmEntityType } from './history.js';
import { addTag } from './tags.js';

export interface AutomationTarget {
  entityType: Extract<CrmEntityType, 'lead' | 'opportunity'>; entityId: string; name: string;
  pipelineId?: string | null; stageId?: string | null; ownerId?: string | null;
}

function dueDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Automações declarativas da Base. Ações possíveis são só as do contrato (criar tarefa, etiquetar):
 * nenhuma delas dispara novos eventos, então não há laço. Roda na mesma transação do evento.
 */
export function runAutomations(db: HubDatabase, config: CrmConfig, event: CrmAutomationEvent, target: AutomationTarget): number {
  let ran = 0;
  for (const automation of config.automations) {
    if (!automation.enabled || automation.when.event !== event) continue;
    if (automation.when.pipeline && automation.when.pipeline !== target.pipelineId) continue;
    if (event === 'stage_entered' && automation.when.stage !== target.stageId) continue;
    for (const action of automation.actions) {
      if (action.type === 'create_task') {
        const title = action.title.replace(/\{nome\}/g, target.name).slice(0, 200);
        const owner = action.assignTo === 'owner' && target.ownerId && db.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").get(target.ownerId) ? target.ownerId : null;
        const id = randomUUID();
        db.prepare(`INSERT INTO tasks(id,title,notes,status,due_date,assignee_id,project_id,created_by,created_at,updated_at,source,related_type,related_id)
          VALUES (?,?,?,'open',?,?,NULL,NULL,?,?,'automation',?,?)`).run(id, title, `Criada pela automação "${automation.name}".`, dueDate(action.dueInDays), owner, now(), now(), target.entityType, target.entityId);
        addActivity(db, SYSTEM_ACTOR, { entityType: target.entityType, entityId: target.entityId, kind: 'history', action: 'automation.task', body: `Automação "${automation.name}" criou a tarefa "${title}".`, data: { automation: automation.id, taskId: id } });
      } else if (action.type === 'add_tag') {
        if (addTag(db, target.entityType, target.entityId, action.tag)) {
          addActivity(db, SYSTEM_ACTOR, { entityType: target.entityType, entityId: target.entityId, kind: 'history', action: 'automation.tag', body: `Automação "${automation.name}" aplicou a etiqueta "${action.tag}".`, data: { automation: automation.id, tag: action.tag } });
        }
      }
    }
    ran += 1;
  }
  return ran;
}
