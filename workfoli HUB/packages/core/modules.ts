import { MODULE_IDS, PROFILES } from '../contract/workfoli-contract.mjs';
import type { ModuleId, Profile } from '../contract/workfoli-contract.mjs';

export type { ModuleId };
export type BaseProfile = Profile;
/** available: implementado neste Core. planned: reconhecido pelo contrato, ainda sem implementação. */
export type ModuleStatus = 'available' | 'planned';
/** core: sempre presente. optional: ligado pela Base ou pela instalação do Hub. */
export type ModuleKind = 'core' | 'optional';

export interface ModuleDefinition {
  readonly id: ModuleId;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly status: ModuleStatus;
  readonly kind: ModuleKind;
  /** Escopo de permissão: o usuário precisa de `<scope>:read` para ver o módulo. */
  readonly scope: string;
  /** Somente administração (usuários, configurações). */
  readonly admin?: boolean;
}

const define = (id: ModuleId, label: string, description: string, icon: string, status: ModuleStatus, kind: ModuleKind, extra: { admin?: boolean; scope?: string } = {}): ModuleDefinition =>
  Object.freeze({ id, label, description, icon, status, kind, scope: extra.scope ?? id, ...(extra.admin ? { admin: true } : {}) });

/** Capacidades compiladas do produto. Uma Base não registra código nem concede permissões. */
export const MODULE_REGISTRY: Readonly<Record<ModuleId, ModuleDefinition>> = Object.freeze({
  overview: define('overview', 'Visão geral', 'Resumo da empresa, pendências e atividade recente.', 'layout-dashboard', 'available', 'core'),
  company: define('company', 'Empresa', 'Identidade, serviços, canais e informações institucionais.', 'building-2', 'available', 'optional'),
  knowledge: define('knowledge', 'Conhecimento', 'Memória, processos e documentos da Base.', 'book-open', 'available', 'optional'),
  projects: define('projects', 'Projetos', 'Sites, landing pages, campanhas, sistemas e demais projetos.', 'folder-kanban', 'available', 'optional'),
  files: define('files', 'Arquivos', 'Arquivos da Base e arquivos privados da empresa.', 'files', 'available', 'optional'),
  tasks: define('tasks', 'Tarefas', 'Tarefas operacionais da equipe.', 'list-checks', 'available', 'optional'),
  crm: define('crm', 'CRM', 'Funil de vendas, leads, contatos, empresas e histórico.', 'contact', 'available', 'optional'),
  integrations: define('integrations', 'Integrações', 'Ferramentas conectadas a esta empresa.', 'plug', 'available', 'optional'),
  ai: define('ai', 'IA', 'Assistente com o contexto autorizado da empresa.', 'sparkles', 'available', 'optional'),
  history: define('history', 'Histórico', 'Registro das ações realizadas na empresa.', 'history', 'available', 'optional', { scope: 'audit' }),
  users: define('users', 'Usuários', 'Pessoas, papéis e permissões.', 'users', 'available', 'core', { admin: true }),
  settings: define('settings', 'Configurações', 'Instalação, conexões e preferências.', 'settings', 'available', 'core', { admin: true }),
  calendar: define('calendar', 'Agenda', 'Compromissos e agendamentos.', 'calendar', 'planned', 'optional'),
  marketing: define('marketing', 'Marketing', 'Investimento, campanhas, site e leads: dados das plataformas separados dos cálculos da Workfoli.', 'megaphone', 'available', 'optional'),
  site: define('site', 'Site', 'Site e páginas publicadas.', 'globe', 'planned', 'optional'),
  campaigns: define('campaigns', 'Campanhas', 'Campanhas de mídia paga e resultados.', 'target', 'planned', 'optional'),
  content: define('content', 'Conteúdo', 'Calendário e peças de conteúdo.', 'pen-line', 'planned', 'optional'),
  dashboards: define('dashboards', 'Dashboards', 'Indicadores e painéis de dados.', 'chart-column', 'planned', 'optional'),
  automations: define('automations', 'Automações', 'Fluxos automáticos e integrações entre sistemas.', 'workflow', 'planned', 'optional'),
  patients: define('patients', 'Pacientes', 'Cadastro clínico com controles de saúde.', 'heart-pulse', 'planned', 'optional'),
  media: define('media', 'Mídia', 'Mídia privada com autorização de uso.', 'images', 'planned', 'optional'),
  finance: define('finance', 'Financeiro', 'Receitas, despesas e cobranças.', 'wallet', 'planned', 'optional'),
  development: define('development', 'Desenvolvimento', 'Repositórios, deploys e ambiente técnico.', 'code-2', 'planned', 'optional'),
});

const BASE_SET: readonly ModuleId[] = ['overview', 'company', 'knowledge', 'projects', 'files', 'tasks', 'ai', 'history', 'users', 'settings'];
const suggestion = (...extra: ModuleId[]): readonly ModuleId[] => Object.freeze([...BASE_SET, ...extra]);
const PROFILE_SUGGESTIONS: Readonly<Record<BaseProfile, readonly ModuleId[]>> = Object.freeze({
  general: suggestion(),
  services: suggestion('crm', 'integrations', 'marketing'),
  agency: suggestion('crm', 'integrations', 'marketing', 'campaigns', 'content'),
  clinic: suggestion('crm', 'calendar', 'patients', 'media'),
  development: suggestion('integrations', 'development'),
  retail: suggestion('crm', 'finance'),
});

if (MODULE_IDS.some(id => !Object.hasOwn(MODULE_REGISTRY, id))) throw new Error('Registro de módulos incompleto para o contrato atual.');

export function isBaseProfile(value: unknown): value is BaseProfile {
  return typeof value === 'string' && (PROFILES as readonly string[]).includes(value);
}

export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && Object.hasOwn(MODULE_REGISTRY, value);
}

/** Sugestões não habilitam nada: módulos planejados continuam marcados como planejados. */
export function suggestModules(profile: BaseProfile): ModuleDefinition[] {
  if (!isBaseProfile(profile)) throw new Error('Perfil da Base inválido.');
  return PROFILE_SUGGESTIONS[profile].map(id => MODULE_REGISTRY[id]);
}

/**
 * Módulos efetivamente ativos: núcleo + pedidos da Base − desligados na instalação.
 * Planejados nunca ficam ativos; aparecem em `planned` para a interface explicar o que falta.
 */
export function resolveModules(requested: readonly ModuleId[], disabled: readonly ModuleId[] = [], order: readonly ModuleId[] = []) {
  const wanted = new Set<ModuleId>([...requested.filter(isModuleId), ...(Object.values(MODULE_REGISTRY).filter(module => module.kind === 'core').map(module => module.id))]);
  for (const id of disabled) if (MODULE_REGISTRY[id]?.kind !== 'core') wanted.delete(id);
  const rank = (id: ModuleId) => { const index = order.indexOf(id); return index < 0 ? 100 + (MODULE_IDS as readonly string[]).indexOf(id) : index; };
  const sorted = [...wanted].sort((a, b) => rank(a) - rank(b));
  return {
    active: sorted.filter(id => MODULE_REGISTRY[id].status === 'available').map(id => MODULE_REGISTRY[id]),
    planned: sorted.filter(id => MODULE_REGISTRY[id].status === 'planned').map(id => MODULE_REGISTRY[id]),
  };
}

export type DataAuthority = 'base-versionable' | 'operational' | 'private' | 'secrets' | 'derived';

/** Categories describe already classified data; they do not classify arbitrary files. */
export const DATA_AUTHORITIES = Object.freeze({
  identity: 'base-versionable',
  brand: 'base-versionable',
  services: 'base-versionable',
  processes: 'base-versionable',
  'non-sensitive-documentation': 'base-versionable',
  'module-configuration': 'base-versionable',
  crm: 'operational',
  contacts: 'operational',
  calendar: 'operational',
  tasks: 'operational',
  patients: 'operational',
  users: 'operational',
  permissions: 'operational',
  sessions: 'operational',
  consents: 'operational',
  audit: 'operational',
  'private-media': 'private',
  'private-documents': 'private',
  'consent-evidence': 'private',
  tokens: 'secrets',
  keys: 'secrets',
  indexes: 'derived',
  embeddings: 'derived',
  summaries: 'derived',
  search: 'derived',
} as const satisfies Record<string, DataAuthority>);

export type DataCategory = keyof typeof DATA_AUTHORITIES;

/** Canonical authority only: never a publication, Git, sync or access authorization. */
export function dataAuthority(category: DataCategory): DataAuthority {
  if (typeof category !== 'string' || !Object.hasOwn(DATA_AUTHORITIES, category)) {
    throw new Error('Categoria de política de dados desconhecida.');
  }
  return DATA_AUTHORITIES[category];
}
