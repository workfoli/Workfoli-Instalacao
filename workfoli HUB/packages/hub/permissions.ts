/**
 * Permissões da instância. Formato `escopo:ação`.
 * Ações: read < write < admin (hierárquicas); use/act para IA; private para arquivos privados.
 * `escopo:*` concede todas as ações do escopo; `*` concede tudo (somente papéis do Core).
 * A verificação acontece sempre no servidor: esconder um menu não é controle de acesso.
 */

export type Permission = string;

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  permissions: readonly Permission[];
  source: 'core' | 'base' | 'custom';
}

const LEVEL: Record<string, number> = { read: 1, write: 2, admin: 3 };
const PERMISSION = /^(?:\*|[a-z][a-z0-9-]*:(?:read|write|admin|use|act|private|\*))$/;

export const CORE_ROLES: readonly RoleDefinition[] = Object.freeze([
  { id: 'owner', name: 'Proprietário', description: 'Controle total da instância, inclusive propriedade e segurança.', permissions: ['*'], source: 'core' },
  { id: 'admin', name: 'Administrador', description: 'Administra usuários, módulos e integrações. Não transfere a propriedade.', permissions: ['*'], source: 'core' },
  {
    // Acesso de prestação de serviço da Workfoli: existe só se o proprietário conceder, e ele pode retirar a qualquer momento.
    id: 'manager', name: 'Gestor Workfoli', source: 'core',
    description: 'Equipe da Workfoli autorizada pelo proprietário: configura CRM, integrações, marketing e a operação. Não administra usuários, arquivos restritos nem a propriedade.',
    permissions: ['overview:read', 'company:read', 'knowledge:write', 'projects:write', 'files:read', 'tasks:write', 'crm:admin', 'integrations:admin', 'marketing:read',
      'ai:use', 'ai:act', 'audit:read', 'settings:admin'],
  },
  {
    id: 'member', name: 'Equipe', description: 'Opera tarefas, CRM e projetos; consulta a Base, o marketing e usa a IA.', source: 'core',
    permissions: ['overview:read', 'company:read', 'knowledge:read', 'projects:write', 'files:read', 'tasks:write', 'crm:write', 'integrations:read', 'marketing:read', 'ai:use', 'ai:act'],
  },
  {
    id: 'viewer', name: 'Leitura', description: 'Consulta sem alterar nada.', source: 'core',
    permissions: ['overview:read', 'company:read', 'knowledge:read', 'projects:read', 'files:read', 'tasks:read', 'crm:read'],
  },
].map((role): RoleDefinition => Object.freeze({ ...role, source: 'core' as const, permissions: Object.freeze([...role.permissions]) })));

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && PERMISSION.test(value);
}

/** `granted` contém `needed`? Considera curinga e hierarquia read < write < admin. */
export function can(granted: readonly Permission[], needed: Permission): boolean {
  // Permissão exigida inválida é erro de programação do Core, nunca "liberado".
  if (!isPermission(needed)) throw new Error('Permissão exigida inválida no Core.');
  if (granted.includes('*')) return true;
  if (needed === '*') return false;
  const [scope, action] = needed.split(':') as [string, string];
  for (const permission of granted) {
    const [grantedScope, grantedAction] = permission.split(':');
    if (grantedScope !== scope) continue;
    if (grantedAction === '*' || grantedAction === action) return true;
    if (LEVEL[action] && LEVEL[grantedAction!] && LEVEL[grantedAction!]! >= LEVEL[action]!) return true;
  }
  return false;
}

/** Normaliza uma lista vinda de fonte externa (Base/UI): remove inválidos e duplicados, nunca adiciona. */
export function sanitizePermissions(values: unknown, options: { allowWildcard?: boolean } = {}): Permission[] {
  if (!Array.isArray(values)) return [];
  const result: Permission[] = [];
  for (const value of values) {
    if (!isPermission(value) || result.includes(value)) continue;
    if (!options.allowWildcard && (value === '*' || value.endsWith(':*'))) continue;
    result.push(value);
  }
  return result;
}

/** Descrição legível para a tela de permissões. */
export function describePermission(permission: Permission): string {
  if (permission === '*') return 'Acesso total';
  const [scope, action] = permission.split(':');
  const actions: Record<string, string> = { read: 'ver', write: 'editar', admin: 'administrar', use: 'usar', act: 'executar ações', private: 'acessar privados', '*': 'tudo' };
  return `${scope}: ${actions[action!] ?? action}`;
}
