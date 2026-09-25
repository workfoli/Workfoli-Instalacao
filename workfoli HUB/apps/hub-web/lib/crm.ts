/** Tipos e utilidades do CRM na interface. A estrutura vem da Base; os registros, do banco da instância. */

export type EntityType = 'contact' | 'organization' | 'lead' | 'opportunity';
export type StageKind = 'open' | 'won' | 'lost';
export type FieldType = 'text' | 'textarea' | 'number' | 'currency' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'email' | 'phone' | 'url';
export type Priority = 'low' | 'normal' | 'high';

export interface CrmStage { id: string; name: string; kind: StageKind; probability?: number; requiredFields?: string[]; }
export interface CrmPipeline { id: string; name: string; default: boolean; description?: string | null; stages: CrmStage[]; }
export interface CrmCustomField { id: string; entity: EntityType; label: string; type: FieldType; required: boolean; options?: string[]; help?: string | null; }
export interface CrmSource { id: string; label: string; kind: string; core?: boolean; }
export type CrmAction = { type: 'create_task'; title: string; dueInDays: number; assignTo: 'owner' | 'none' } | { type: 'add_tag'; tag: string };
export interface CrmAutomation { id: string; name: string; enabled: boolean; when: { event: string; pipeline?: string; stage?: string }; actions: CrmAction[]; }
export interface CrmIntegrationLink { provider: 'meta' | 'google'; leads: boolean; source: string; pipeline?: string; }
export interface CrmConfig {
  enabled: boolean; labels: Partial<Record<LabelKey, string>>; currency: string; pipelines: CrmPipeline[]; customFields: CrmCustomField[];
  sources: CrmSource[]; lostReasons: string[]; automations: CrmAutomation[]; integrations: CrmIntegrationLink[];
}
export type LabelKey = 'contact' | 'contacts' | 'organization' | 'organizations' | 'lead' | 'leads' | 'opportunity' | 'opportunities';

export interface CrmSettings {
  config: CrmConfig; labels: Record<LabelKey, string>; moduleLabel: string; sources: CrmSource[];
  usage: Record<string, Record<string, number>>; users: Array<{ id: string; name: string }>;
  canWrite: boolean; canAdmin: boolean; base: { mode: 'local' | 'remote' };
}

type Ref = { id: string; name: string } | null;
type SourceRef = { id: string; label: string } | null;
export interface Attribution { [key: string]: string | undefined; campaignName?: string; adName?: string; formName?: string; provider?: string; }

export interface Opportunity {
  id: string; title: string; pipelineId: string; stageId: string; stage: { id: string; name: string; kind: StageKind; probability: number | null } | null; pipelineName: string | null;
  status: 'open' | 'won' | 'lost'; valueCents: number | null; currency: string; priority: Priority; expectedCloseDate: string | null;
  contact: Ref; organization: Ref; leadId: string | null; source: SourceRef; owner: Ref; lostReason: string | null; lostNote: string | null;
  closedAt: string | null; stageEnteredAt: string; position: number; notes: string | null; attribution: Attribution; custom: Record<string, unknown>;
  tags: string[]; createdAt: string; updatedAt: string; archivedAt: string | null; origin: string;
}
export interface Contact {
  id: string; name: string; email: string | null; phone: string | null; jobTitle: string | null; relationship: string; organization: Ref; owner: Ref;
  source: SourceRef; notes: string | null; custom: Record<string, unknown>; tags: string[]; openOpportunities: number;
  createdAt: string; updatedAt: string; archivedAt: string | null; origin: string;
}
export interface Organization {
  id: string; name: string; website: string | null; email: string | null; phone: string | null; notes: string | null; owner: Ref; source: SourceRef;
  custom: Record<string, unknown>; tags: string[]; contacts: number; openOpportunities: number; createdAt: string; updatedAt: string; archivedAt: string | null; origin: string;
}
export interface Lead {
  id: string; name: string; email: string | null; phone: string | null; company: string | null; message: string | null;
  status: 'new' | 'working' | 'qualified' | 'disqualified' | 'converted'; source: SourceRef; owner: Ref; priority: Priority; attribution: Attribution;
  custom: Record<string, unknown>; tags: string[]; contact: Ref; opportunity: Ref; disqualifyReason: string | null; convertedAt: string | null;
  integration: { id: string; provider: string } | null; createdAt: string; updatedAt: string; archivedAt: string | null; origin: string;
}
export interface TimelineEntry {
  id: string; entityType: EntityType; entityId: string; entityLabel: string | null; kind: string; action: string | null; body: string | null;
  data: Record<string, unknown>; occurredAt: string; origin: string; actor: { type: string; id: string | null; name: string | null };
}
export interface Attachment { id: string; kind: 'private-file' | 'base-file' | 'url'; label: string | null; ref: string | null; file: { id: string; name: string; size: number; mime: string } | null; available: boolean; createdAt: string; }

export interface BoardStage { id: string; name: string; kind: StageKind; probability: number | null; requiredFields: Array<{ key: string; label: string }>; count: number; valueCents: number; items: Opportunity[]; }
export interface Board {
  pipeline: { id: string; name: string; description: string | null }; pipelines: Array<{ id: string; name: string; default: boolean }>;
  stages: BoardStage[]; orphans: Opportunity[]; closedDays: number; currency: string; lostReasons: string[];
  totals: { openCount: number; openValueCents: number; weightedValueCents: number };
}

export const RELATIONSHIPS: Record<string, string> = { prospect: 'Prospecção', customer: 'Cliente', partner: 'Parceiro', supplier: 'Fornecedor', other: 'Outro' };
export const LEAD_STATUS: Record<Lead['status'], string> = { new: 'Novo', working: 'Em atendimento', qualified: 'Qualificado', disqualified: 'Descartado', converted: 'Convertido' };
export const PRIORITIES: Record<Priority, string> = { low: 'Baixa', normal: 'Normal', high: 'Alta' };
export const OPPORTUNITY_STATUS: Record<Opportunity['status'], string> = { open: 'Em aberto', won: 'Ganha', lost: 'Perdida' };
export const ACTIVITY_KINDS: Record<string, string> = { note: 'Nota', call: 'Ligação', meeting: 'Reunião', email: 'E-mail', message: 'Mensagem', whatsapp: 'WhatsApp', event: 'Evento' };
export const FIELD_TYPES: Record<FieldType, string> = {
  text: 'Texto curto', textarea: 'Texto longo', number: 'Número', currency: 'Valor (moeda)', date: 'Data', select: 'Lista (uma opção)',
  multiselect: 'Lista (várias opções)', checkbox: 'Sim/não', email: 'E-mail', phone: 'Telefone', url: 'Link',
};
export const ENTITY_LABELS: Record<EntityType, string> = { contact: 'Contato', organization: 'Empresa', lead: 'Lead', opportunity: 'Oportunidade' };
export const ENTITY_PATHS: Record<EntityType, string> = { contact: 'contacts', organization: 'organizations', lead: 'leads', opportunity: 'opportunities' };
export const ENTITY_ROUTES: Record<EntityType, string> = { contact: 'contatos', organization: 'empresas', lead: 'leads', opportunity: 'oportunidades' };
export const AUTOMATION_EVENTS: Record<string, string> = { lead_created: 'Lead criado', stage_entered: 'Entrou na etapa', deal_won: 'Negócio ganho', deal_lost: 'Negócio perdido' };
export const SOURCE_KINDS: Record<string, string> = { paid: 'Mídia paga', organic: 'Orgânico', social: 'Redes sociais', referral: 'Indicação', direct: 'Direto', event: 'Evento', import: 'Importação', manual: 'Manual', integration: 'Integração', other: 'Outro' };
export const REQUIRED_FIELD_OPTIONS: Record<string, string> = { value: 'Valor', expectedCloseDate: 'Previsão de fechamento', ownerId: 'Responsável', contactId: 'Contato', organizationId: 'Empresa', sourceId: 'Origem' };

export function entityHref(type: EntityType, id: string): string { return `#/crm/${ENTITY_ROUTES[type]}/${id}`; }

/** Centavos → moeda da empresa. `null` vira travessão: ausência de valor não é zero. */
export function money(cents: number | null | undefined, currency = 'BRL', compact = false): string {
  if (cents === null || cents === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, ...(compact && Math.abs(cents) >= 1_000_000 ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: cents % 100 ? 2 : 0 }) }).format(cents / 100);
}

export function customDisplay(field: CrmCustomField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (field.type === 'checkbox') return value ? 'Sim' : 'Não';
  if (field.type === 'multiselect' && Array.isArray(value)) return value.join(', ');
  if (field.type === 'currency' && typeof value === 'number') return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (field.type === 'date' && typeof value === 'string') return value.split('-').reverse().join('/');
  return String(value);
}

export const ATTRIBUTION_LABELS: Record<string, string> = {
  provider: 'Plataforma', campaignName: 'Campanha', campaignRef: 'ID da campanha', adSetName: 'Conjunto', adName: 'Anúncio', formName: 'Formulário',
  utmSource: 'utm_source', utmMedium: 'utm_medium', utmCampaign: 'utm_campaign', utmContent: 'utm_content', utmTerm: 'utm_term', gclid: 'gclid', fbclid: 'fbclid', landingPage: 'Página de entrada', referrer: 'Origem da visita',
};

export function daysSince(value: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
}

/** Campos que a etapa exige e a oportunidade ainda não tem (o servidor confere a mesma regra). */
export function missingForStage(opportunity: Opportunity, stage: CrmStage): string[] {
  return (stage.requiredFields ?? []).filter(key => {
    if (key === 'value') return !opportunity.valueCents;
    if (key === 'expectedCloseDate') return !opportunity.expectedCloseDate;
    if (key === 'ownerId') return !opportunity.owner;
    if (key === 'contactId') return !opportunity.contact;
    if (key === 'organizationId') return !opportunity.organization;
    if (key === 'sourceId') return !opportunity.source;
    if (key.startsWith('custom.')) { const value = opportunity.custom[key.slice(7)]; return value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length); }
    return false;
  });
}
