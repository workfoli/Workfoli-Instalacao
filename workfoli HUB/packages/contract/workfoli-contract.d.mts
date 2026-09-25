// Tipos do contrato Workfoli. Implementação em workfoli-contract.mjs (JavaScript sem dependências).

export declare const CONTRACT_VERSION: string;
export declare const BASE_FORMAT: 'workfoli-base';
export declare const BASE_SCHEMA_VERSION: 3;
export declare const HUB_FORMAT: 'workfoli-hub';
export declare const HUB_SCHEMA_VERSION: 1;
export declare const INSTANCE_FORMAT: 'workfoli-instance';
export declare const INSTANCE_SCHEMA_VERSION: 1;
export declare const BASE_MANIFEST_FILE: 'workfoli.base.json';
export declare const HUB_CONFIG_FILE: 'workfoli.hub.json';
export declare const INSTANCE_FILE: 'workfoli.instance.json';

export type ModuleId =
  | 'overview' | 'company' | 'knowledge' | 'projects' | 'files' | 'tasks' | 'crm' | 'integrations' | 'ai' | 'history' | 'users' | 'settings'
  | 'calendar' | 'marketing' | 'site' | 'campaigns' | 'content' | 'dashboards' | 'automations' | 'patients' | 'media' | 'finance' | 'development';
export type Profile = 'general' | 'services' | 'agency' | 'clinic' | 'development' | 'retail';
export type ProjectType = 'website' | 'landing-page' | 'campaign' | 'content' | 'system' | 'automation' | 'integration' | 'dashboard' | 'data' | 'brand' | 'other';
export type ProjectStatus = 'planned' | 'active' | 'paused' | 'done' | 'archived';
export type ServiceStatus = 'active' | 'planned' | 'paused' | 'retired';
export type Visibility = 'public' | 'internal' | 'restricted';
export type IntegrationProvider =
  | 'google' | 'gmail' | 'google-calendar' | 'google-drive' | 'google-ads' | 'search-console' | 'google-analytics'
  | 'meta' | 'instagram' | 'facebook' | 'whatsapp' | 'github' | 'vercel' | 'supabase' | 'cloudflare' | 'netlify' | 'custom';
export type IntegrationStatus = 'planned' | 'pending' | 'connected' | 'disabled';
export type AssetKind = 'logo' | 'symbol' | 'icon' | 'image' | 'font' | 'document' | 'video' | 'other';
export type ResourceKind = 'link' | 'document' | 'repository' | 'dashboard' | 'social' | 'other';
export type BaseStatus = 'template' | 'active';
export type HubMode = 'local' | 'remote';
export type AiProvider = 'local' | 'none' | 'claude-cli' | 'codex-cli';
export type Theme = 'dark' | 'light' | 'system';

export declare const MODULE_IDS: readonly ModuleId[];
export declare const PROFILES: readonly Profile[];
export declare const PROJECT_TYPES: readonly ProjectType[];
export declare const PROJECT_STATUSES: readonly ProjectStatus[];
export declare const SERVICE_STATUSES: readonly ServiceStatus[];
export declare const VISIBILITIES: readonly Visibility[];
export declare const INTEGRATION_PROVIDERS: readonly IntegrationProvider[];
export declare const INTEGRATION_STATUSES: readonly IntegrationStatus[];
export declare const ASSET_KINDS: readonly AssetKind[];
export declare const RESOURCE_KINDS: readonly ResourceKind[];
export declare const BASE_STATUSES: readonly BaseStatus[];
export declare const HUB_MODES: readonly HubMode[];
export declare const AI_PROVIDERS: readonly AiProvider[];
export declare const THEMES: readonly Theme[];
export declare const RESERVED_ROLE_IDS: readonly string[];

export type CrmEntity = 'contact' | 'organization' | 'lead' | 'opportunity';
export type CrmFieldType = 'text' | 'textarea' | 'number' | 'currency' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'email' | 'phone' | 'url';
export type CrmStageKind = 'open' | 'won' | 'lost';
export type CrmSourceKind = 'paid' | 'organic' | 'social' | 'referral' | 'direct' | 'event' | 'import' | 'manual' | 'integration' | 'other';
export type CrmAutomationEvent = 'lead_created' | 'stage_entered' | 'deal_won' | 'deal_lost';
export type CrmLabelKey = 'contact' | 'contacts' | 'organization' | 'organizations' | 'lead' | 'leads' | 'opportunity' | 'opportunities';
export type CrmLeadProvider = 'meta' | 'google';
export declare const CRM_ENTITIES: readonly CrmEntity[];
export declare const CRM_FIELD_TYPES: readonly CrmFieldType[];
export declare const CRM_STAGE_KINDS: readonly CrmStageKind[];
export declare const CRM_SOURCE_KINDS: readonly CrmSourceKind[];
export declare const CRM_AUTOMATION_EVENTS: readonly CrmAutomationEvent[];
export declare const CRM_LABEL_KEYS: readonly CrmLabelKey[];
export declare const CRM_LEAD_PROVIDERS: readonly CrmLeadProvider[];
export declare const CRM_REQUIRED_FIELD_KEYS: readonly string[];
export declare const CRM_CORE_SOURCES: readonly Readonly<CrmSource>[];
export declare const DEFAULT_LOST_REASONS: readonly string[];

export interface CrmStage { id: string; name: string; kind: CrmStageKind; probability?: number; requiredFields?: string[]; }
export interface CrmPipeline { id: string; name: string; default: boolean; description?: string | null; stages: CrmStage[]; }
export interface CrmCustomField {
  id: string; entity: CrmEntity; label: string; type: CrmFieldType; required: boolean; options?: string[]; help?: string | null;
}
export interface CrmSource { id: string; label: string; kind: CrmSourceKind; }
export type CrmAutomationAction =
  | { type: 'create_task'; title: string; dueInDays: number; assignTo: 'owner' | 'none' }
  | { type: 'add_tag'; tag: string };
export interface CrmAutomation {
  id: string; name: string; enabled: boolean;
  when: { event: CrmAutomationEvent; pipeline?: string; stage?: string };
  actions: CrmAutomationAction[];
}
export interface CrmIntegrationLink { provider: CrmLeadProvider; leads: boolean; source: string; pipeline?: string; }
export interface CrmConfig {
  enabled: boolean; labels: Partial<Record<CrmLabelKey, string>>; currency: string;
  pipelines: CrmPipeline[]; customFields: CrmCustomField[]; sources: CrmSource[]; lostReasons: string[];
  automations: CrmAutomation[]; integrations: CrmIntegrationLink[];
}

export interface Company {
  name: string; slug: string; legalName?: string | null; segment?: string | null; description?: string | null;
  tagline?: string | null; website?: string | null; locale: string; timezone: string;
}
export interface Identity {
  guide?: string | null; logo?: string | null; symbol?: string | null;
  colors?: Partial<Record<'background' | 'surface' | 'text' | 'textSecondary' | 'accent', string>>;
  typography?: { heading?: string; body?: string };
  voice?: { tagline?: string | null; message?: string | null; concept?: string | null; description?: string | null; method?: string[] };
}
export interface BaseContext { memory: string; identity: string; tasks?: string | null; rules?: string | null; knowledge: string[]; }
export interface Service { id: string; name: string; summary?: string | null; path?: string | null; status: ServiceStatus; visibility: Visibility; transversal?: boolean; }
export interface Link { label: string; url: string; }
export interface Project {
  id: string; name: string; type: ProjectType; status: ProjectStatus; visibility: Visibility; path?: string | null;
  summary?: string | null; services?: string[]; links?: Link[]; createdAt?: string | null;
}
export interface ModuleSettings { label?: string; description?: string | null; }
export interface Modules { enabled: ModuleId[]; order?: ModuleId[]; settings?: Partial<Record<ModuleId, ModuleSettings>>; }
export interface Integration {
  id: string; provider: IntegrationProvider; status: IntegrationStatus; label?: string | null; purpose?: string | null;
  account?: string | null; secrets?: string[];
}
export interface Asset { id: string; kind: AssetKind; path: string; label?: string | null; visibility: Visibility; }
export interface Resource { id: string; kind: ResourceKind; label: string; url?: string | null; path?: string | null; visibility: Visibility; }
export interface RolePreset { id: string; name: string; description?: string | null; permissions: string[]; }
export interface DataPolicy { versionable: string[]; private: string[]; }
export interface BaseManifest {
  format: 'workfoli-base'; schemaVersion: 3; baseId: string | null; status: BaseStatus;
  template?: { id: string; version: string }; createdAt?: string | null; updatedAt?: string | null;
  company: Company; profile: Profile; identity: Identity; context: BaseContext;
  services: Service[]; projects: Project[]; modules: Modules; crm?: CrmConfig; integrations: Integration[];
  assets: Asset[]; resources: Resource[]; roles: RolePreset[]; data: DataPolicy;
}
export interface HubConfig {
  format: 'workfoli-hub'; schemaVersion: 1; hubId: string; mode: HubMode;
  server: { host: string; port: number; publicUrl: string | null };
  modules: { disabled: ModuleId[]; custom: string[] };
  branding: { theme: Theme; useBaseIdentity: boolean };
  ai: { provider: AiProvider; externalContext: boolean };
  security: { sessionHours: number; idleMinutes: number };
  agent: { hubUrl: string | null; intervalSeconds: number };
}
export interface InstanceFile {
  format: 'workfoli-instance'; schemaVersion: 1; instanceId: string;
  company: { name: string; slug: string }; createdAt?: string | null; core: { version: string };
  layout: { base: string; hub: string; data: string; files: string; secrets: string };
}
export interface Issue { path: string; message: string; }
export interface ValidationResult<T> { ok: boolean; value?: T; errors: Issue[]; warnings: Issue[]; }

export declare function looksLikeSecret(value: string): boolean;
export declare function slugify(value: unknown, max?: number): string;
export declare function isSafeRelativePath(value: unknown): value is string;
export declare function upgradeBaseManifest(input: unknown): unknown;
export declare function formatManifest(value: unknown): string;
export declare function defaultCrmConfig(): CrmConfig;
export declare function validateCrmConfig(input: unknown): ValidationResult<CrmConfig>;
export declare function resolveCrmConfig(manifest: Pick<BaseManifest, 'modules' | 'crm'> | undefined): CrmConfig;
export declare function validateBaseManifest(input: unknown, options?: { expect?: 'any' | 'template' | 'active' }): ValidationResult<BaseManifest>;
export declare function validateHubConfig(input: unknown): ValidationResult<HubConfig>;
export declare function validateInstanceFile(input: unknown): ValidationResult<InstanceFile>;
export declare function formatIssues(issues: Issue[]): string;
