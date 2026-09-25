import type { ContextRequest, ContextSnapshot, EnvironmentProfile, KnowledgeItem, WorkspaceData, WorkspaceSummary } from '../contracts/index.js';
import { restrictedPath, sensitiveText } from '../core/classification.js';

/** Local context resolution. This is not authentication or a connection to a model. */
export interface ContextRepository {
  requireEnvironment(): EnvironmentProfile;
  get(id: string): WorkspaceData;
  list(): WorkspaceSummary[];
}
export function resolveContext(store: ContextRepository, request: ContextRequest): ContextSnapshot {
  const environment = store.requireEnvironment();
  if (!request || !['company', 'portfolio', 'workspace'].includes(request.scope)) throw new Error('Escopo de contexto inválido.');
  if (request.scope !== 'workspace' && request.workspaceId !== undefined) throw new Error('O workspace só pode ser informado no escopo específico.');
  const eligible = (data: WorkspaceData): KnowledgeItem[] => data.report.knowledge.filter(item => {
    const file = data.report.files.find(entry => entry.id === item.evidence.fileId);
    return item.status === 'confirmed' && !item.conflict && file?.disposition === 'indexed' && !file.sensitive
      && !restrictedPath(file.path) && !sensitiveText(item.value);
  });
  const snapshot: ContextSnapshot = { scope: request.scope, environment, company: { knowledge: [] }, clients: [], generatedAt: new Date().toISOString() };
  const add = (data: WorkspaceData) => {
    const group = { workspace: data.workspace, knowledge: eligible(data) };
    if (data.workspace.relationship === 'company') snapshot.company = group;
    else snapshot.clients.push(group);
  };
  if (request.scope === 'workspace') {
    if (typeof request.workspaceId !== 'string') throw new Error('Selecione o workspace para consultar seu contexto.');
    add(store.get(request.workspaceId));
  } else {
    if (environment.company.workspaceId) add(store.get(environment.company.workspaceId));
    if (request.scope === 'portfolio') for (const workspace of store.list().filter(item => item.relationship === 'client')) add(store.get(workspace.id));
  }
  return snapshot;
}
