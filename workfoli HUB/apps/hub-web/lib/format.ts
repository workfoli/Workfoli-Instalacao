const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date).replace('.', '');
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormat.format(date).replace('.', '');
}

export function relative(value: string | null | undefined): string {
  if (!value) return 'nunca';
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return '—';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return days < 30 ? `há ${days} dia${days > 1 ? 's' : ''}` : formatDate(value);
}

export function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(part => !/^(?:de|da|do|dos|das|e)$/i.test(part));
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] : parts[0]?.[1] ?? '')).toUpperCase() || 'W';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
}

export const ROLE_LABELS: Record<string, string> = { owner: 'Proprietário', admin: 'Administrador', manager: 'Gestor Workfoli', member: 'Equipe', viewer: 'Leitura' };
export const TASK_STATUS: Record<string, string> = { open: 'A fazer', doing: 'Em andamento', done: 'Concluída' };
export const PROJECT_STATUS: Record<string, string> = { planned: 'Planejado', active: 'Ativo', paused: 'Pausado', done: 'Concluído', archived: 'Arquivado' };
export const SERVICE_STATUS: Record<string, string> = { active: 'Ativo', planned: 'Planejado', paused: 'Pausado', retired: 'Encerrado' };

const ACTIONS: Record<string, string> = {
  'hub.installed': 'Instalou o Hub', 'hub.started': 'Iniciou o Hub', 'hub.synced': 'Sincronizou com a Base', 'core.updated': 'Atualizou o Core',
  'auth.login': 'Entrou', 'auth.logout': 'Saiu', 'auth.activated': 'Ativou o acesso', 'auth.login-failed': 'Tentativa de login recusada', 'auth.password-changed': 'Trocou a senha',
  'owner.activation-link': 'Gerou link de ativação do proprietário', 'owner.recovery-link': 'Gerou link de recuperação',
  'user.invited': 'Convidou usuário', 'user.updated': 'Alterou usuário', 'user.activation-link': 'Gerou novo link de ativação', 'role.saved': 'Salvou papel', 'role.deleted': 'Removeu papel', 'roles.base-applied': 'Aprovou papéis sugeridos pela Base',
  'task.created': 'Criou tarefa', 'task.updated': 'Atualizou tarefa', 'task.deleted': 'Excluiu tarefa',
  'crm.contact-created': 'Cadastrou contato', 'crm.contact-updated': 'Atualizou contato', 'crm.organization-created': 'Cadastrou empresa', 'crm.organization-updated': 'Atualizou empresa',
  'crm.lead-created': 'Registrou lead', 'crm.lead-updated': 'Atualizou lead', 'crm.lead-converted': 'Converteu lead', 'crm.lead-disqualified': 'Descartou lead', 'crm.lead-reopened': 'Reativou lead',
  'crm.opportunity-created': 'Criou oportunidade', 'crm.opportunity-updated': 'Atualizou oportunidade', 'crm.opportunity-moved': 'Moveu oportunidade no funil',
  'crm.activity-added': 'Registrou atividade no CRM', 'crm.attachment-added': 'Anexou no CRM', 'crm.attachment-removed': 'Removeu anexo do CRM', 'crm.archived': 'Arquivou registro do CRM', 'crm.restored': 'Restaurou registro do CRM',
  'crm.purged': 'Excluiu definitivamente registro do CRM (LGPD)', 'crm.config-updated': 'Alterou a configuração do CRM na Base', 'crm.config-queued': 'Pediu alteração da configuração do CRM',
  'integration.connect-started': 'Iniciou conexão de integração', 'integration.connected': 'Conectou integração', 'integration.connect-failed': 'Conexão de integração falhou', 'integration.connect-denied': 'Conexão de integração negada',
  'integration.consent-denied': 'Autorização cancelada no provedor', 'integration.disconnected': 'Desconectou integração', 'integration.synced': 'Sincronizou integração', 'integration.settings-updated': 'Escolheu contas da integração',
  'base.project-created': 'Criou projeto na Base', 'base.project-queued': 'Pediu projeto na Base', 'base.note-created': 'Registrou nota na Base', 'base.note-queued': 'Pediu nota na Base',
  'base.command-applied': 'Computador da Base aplicou alteração', 'base.command-failed': 'Computador da Base recusou alteração',
  'files.private-uploaded': 'Enviou arquivo privado', 'files.private-downloaded': 'Baixou arquivo privado', 'files.private-deleted': 'Excluiu arquivo privado',
  'ai.proposal.created': 'IA propôs uma ação', 'ai.proposal.executed': 'Confirmou ação da IA', 'ai.proposal.rejected': 'Recusou ação da IA', 'ai.proposal.failed': 'Ação da IA falhou', 'ai.proposal.denied': 'Ação da IA negada',
  'agent.paired': 'Pareou o Local Agent', 'agent.pairing-code': 'Gerou código de pareamento', 'agent.revoked': 'Revogou dispositivo', 'agent.snapshot': 'Recebeu atualização da Base',
  'record.created': 'Criou registro', 'record.updated': 'Atualizou registro', 'record.deleted': 'Excluiu registro', 'access.denied': 'Acesso negado',
};
export function actionLabel(action: string): string { return ACTIONS[action] ?? action; }

export function can(permissions: string[], needed: string): boolean {
  if (permissions.includes('*')) return true;
  const [scope, action] = needed.split(':');
  const level: Record<string, number> = { read: 1, write: 2, admin: 3 };
  return permissions.some(permission => {
    const [grantedScope, grantedAction] = permission.split(':');
    if (grantedScope !== scope) return false;
    if (grantedAction === '*' || grantedAction === action) return true;
    return !!(level[action!] && level[grantedAction!] && level[grantedAction!]! >= level[action!]!);
  });
}
