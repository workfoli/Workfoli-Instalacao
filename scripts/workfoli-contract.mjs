// Workfoli contract: Base ↔ Hub ↔ Instância.
//
// Fonte da Base: `scripts/workfoli-contract.mjs`.
// Contrato legado preservado para validar as Bases existentes sem depender do Hub.
// Manter o formato compatível com os manifestos existentes.
//
// Sem dependências e sem IO: recebe JSON já interpretado e devolve { ok, value, errors, warnings }.
// Mensagens nunca repetem valores recebidos (podem conter segredos ou caracteres de controle).

export const CONTRACT_VERSION = '3.0.0';
export const BASE_FORMAT = 'workfoli-base';
export const BASE_SCHEMA_VERSION = 3;
export const HUB_FORMAT = 'workfoli-hub';
export const HUB_SCHEMA_VERSION = 1;
export const INSTANCE_FORMAT = 'workfoli-instance';
export const INSTANCE_SCHEMA_VERSION = 1;
export const BASE_MANIFEST_FILE = 'workfoli.base.json';
export const HUB_CONFIG_FILE = 'workfoli.hub.json';
export const INSTANCE_FILE = 'workfoli.instance.json';

/** Módulos conhecidos por esta versão do contrato. A disponibilidade real é decidida pelo Core. */
export const MODULE_IDS = Object.freeze([
  'overview', 'company', 'knowledge', 'projects', 'files', 'tasks', 'crm', 'integrations', 'ai', 'history', 'users', 'settings',
  'calendar', 'marketing', 'site', 'campaigns', 'content', 'dashboards', 'automations', 'patients', 'media', 'finance', 'development',
]);
export const PROFILES = Object.freeze(['general', 'services', 'agency', 'clinic', 'development', 'retail']);
export const PROJECT_TYPES = Object.freeze(['website', 'landing-page', 'campaign', 'content', 'system', 'automation', 'integration', 'dashboard', 'data', 'brand', 'other']);
export const PROJECT_STATUSES = Object.freeze(['planned', 'active', 'paused', 'done', 'archived']);
export const SERVICE_STATUSES = Object.freeze(['active', 'planned', 'paused', 'retired']);
export const VISIBILITIES = Object.freeze(['public', 'internal', 'restricted']);
export const INTEGRATION_PROVIDERS = Object.freeze([
  'google', 'gmail', 'google-calendar', 'google-drive', 'google-ads', 'search-console', 'google-analytics',
  'meta', 'instagram', 'facebook', 'whatsapp', 'github', 'vercel', 'supabase', 'cloudflare', 'netlify', 'custom',
]);
export const INTEGRATION_STATUSES = Object.freeze(['planned', 'pending', 'connected', 'disabled']);
export const ASSET_KINDS = Object.freeze(['logo', 'symbol', 'icon', 'image', 'font', 'document', 'video', 'other']);
export const RESOURCE_KINDS = Object.freeze(['link', 'document', 'repository', 'dashboard', 'social', 'other']);
export const BASE_STATUSES = Object.freeze(['template', 'active']);
export const HUB_MODES = Object.freeze(['local', 'remote']);
export const AI_PROVIDERS = Object.freeze(['local', 'none', 'claude-cli', 'codex-cli']);
export const THEMES = Object.freeze(['dark', 'light', 'system']);
export const RESERVED_ROLE_IDS = Object.freeze(['owner', 'manager', 'admin', 'member', 'viewer']);

// ————— CRM (configuração na Base; dados vivos no banco da instância) —————
export const CRM_ENTITIES = Object.freeze(['contact', 'organization', 'lead', 'opportunity']);
export const CRM_FIELD_TYPES = Object.freeze(['text', 'textarea', 'number', 'currency', 'date', 'select', 'multiselect', 'checkbox', 'email', 'phone', 'url']);
export const CRM_STAGE_KINDS = Object.freeze(['open', 'won', 'lost']);
export const CRM_SOURCE_KINDS = Object.freeze(['paid', 'organic', 'social', 'referral', 'direct', 'event', 'import', 'manual', 'integration', 'other']);
export const CRM_AUTOMATION_EVENTS = Object.freeze(['lead_created', 'stage_entered', 'deal_won', 'deal_lost']);
/** Nomes das entidades na interface (o nome do módulo no menu continua em `modules.settings.crm.label`). */
export const CRM_LABEL_KEYS = Object.freeze(['contact', 'contacts', 'organization', 'organizations', 'lead', 'leads', 'opportunity', 'opportunities']);
/** Plataformas cujos formulários de lead podem alimentar o CRM (a conexão em si fica no Hub, nunca na Base). */
export const CRM_LEAD_PROVIDERS = Object.freeze(['meta', 'google']);
/** Campos nativos que uma etapa pode exigir antes de receber uma oportunidade (além de `custom.<id>`). */
export const CRM_REQUIRED_FIELD_KEYS = Object.freeze(['value', 'expectedCloseDate', 'ownerId', 'contactId', 'organizationId', 'priority', 'sourceId']);
/** Origens nativas: toda instalação reconhece; a Base pode acrescentar outras. */
export const CRM_CORE_SOURCES = Object.freeze([
  { id: 'google-ads', label: 'Google Ads', kind: 'paid' },
  { id: 'meta-ads', label: 'Meta Ads', kind: 'paid' },
  { id: 'instagram', label: 'Instagram', kind: 'social' },
  { id: 'google-organico', label: 'Google orgânico', kind: 'organic' },
  { id: 'site', label: 'Site', kind: 'direct' },
  { id: 'landing-page', label: 'Landing page', kind: 'direct' },
  { id: 'whatsapp', label: 'WhatsApp', kind: 'direct' },
  { id: 'indicacao', label: 'Indicação', kind: 'referral' },
  { id: 'importacao', label: 'Importação', kind: 'import' },
  { id: 'manual', label: 'Manual', kind: 'manual' },
  { id: 'outros', label: 'Outros', kind: 'other' },
].map(source => Object.freeze(source)));
export const DEFAULT_LOST_REASONS = Object.freeze(['Preço', 'Prazo', 'Sem resposta', 'Escolheu outra opção', 'Sem orçamento no momento', 'Outro']);

/** Configuração inicial genérica (template): útil, mas inteiramente editável por cada empresa. */
export function defaultCrmConfig() {
  return {
    enabled: true,
    labels: {},
    currency: 'BRL',
    pipelines: [{
      id: 'vendas', name: 'Funil de vendas', default: true,
      stages: [
        { id: 'novo-lead', name: 'Novo lead', kind: 'open', probability: 10 },
        { id: 'contato-realizado', name: 'Contato realizado', kind: 'open', probability: 20 },
        { id: 'qualificado', name: 'Qualificado', kind: 'open', probability: 40 },
        { id: 'proposta', name: 'Proposta', kind: 'open', probability: 60, requiredFields: ['value'] },
        { id: 'negociacao', name: 'Negociação', kind: 'open', probability: 80, requiredFields: ['value'] },
        { id: 'ganho', name: 'Ganho', kind: 'won', probability: 100 },
        { id: 'perdido', name: 'Perdido', kind: 'lost', probability: 0 },
      ],
    }],
    customFields: [],
    sources: [],
    lostReasons: [...DEFAULT_LOST_REASONS],
    automations: [],
    integrations: [],
  };
}

/**
 * Configuração efetiva do CRM de um manifesto já validado: a seção `crm` da Base ou, sem ela,
 * o padrão genérico. Habilitado somente quando "crm" está em `modules.enabled`.
 */
export function resolveCrmConfig(manifest) {
  const config = manifest?.crm ? JSON.parse(JSON.stringify(manifest.crm)) : defaultCrmConfig();
  config.enabled = Array.isArray(manifest?.modules?.enabled) && manifest.modules.enabled.includes('crm');
  return config;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SECRET_REF = /^[A-Z][A-Z0-9_]{1,63}$/;
const PERMISSION = /^[a-z][a-z0-9-]*:(?:read|write|admin|use|act|private|\*)$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const LOCALE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
const TIMEZONE = /^(?:UTC|[A-Z][A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){1,2})$/;
const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,6}(?:-[0-9A-Za-z.-]{1,32})?$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‪-‮⁦-⁩]/u;
// eslint-disable-next-line no-control-regex
const CONTROL_SINGLE_LINE = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/u;
const RESERVED_WINDOWS = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)(?:[ .]|$)/i;
const PLACEHOLDER = /^\[[^\]]*\]$/;

/** Padrões de credenciais conhecidas. Um manifesto nunca carrega valores de segredo. */
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  /\bEAA[A-Za-z0-9]{40,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /\b(?:password|senha|secret|token|api[_-]?key)\s*[:=]\s*["']?(?=[^\s"']*\d)[A-Za-z0-9_\-+/=.]{8,}/i,
];

/** @param {string} value */
export function looksLikeSecret(value) {
  return typeof value === 'string' && SECRET_PATTERNS.some(pattern => pattern.test(value));
}

/** Gera um identificador curto a partir de um nome ("Clínica São João" → "clinica-sao-joao"). */
export function slugify(value, max = 48) {
  const slug = String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '');
  return slug;
}

class Collector {
  constructor() { /** @type {{path: string, message: string}[]} */ this.errors = []; /** @type {{path: string, message: string}[]} */ this.warnings = []; }
  /** @param {string} path @param {string} message */
  error(path, message) { this.errors.push({ path, message }); return undefined; }
  /** @param {string} path @param {string} message */
  warn(path, message) { this.warnings.push({ path, message }); }
}

/** Aceita somente objetos JSON simples; rejeita getters, protótipos e chaves não previstas. */
function object(c, value, path, allowed, required = []) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return c.error(path, 'precisa ser um objeto');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return c.error(path, 'precisa ser um objeto JSON simples');
  /** @type {Record<string, unknown>} */
  const result = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') { c.error(path, 'contém chave inválida'); continue; }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) { c.error(path, 'contém propriedade que não é dado JSON'); continue; }
    if (!allowed.includes(key)) {
      const label = key.length > 40 ? '(chave longa)' : key.replace(new RegExp(CONTROL_SINGLE_LINE.source, 'gu'), '?');
      c.error(path ? `${path}.${label}` : label, 'campo não previsto pelo contrato');
      continue;
    }
    result[key] = descriptor.value;
  }
  for (const key of required) if (!Object.hasOwn(result, key)) c.error(path ? `${path}.${key}` : key, 'campo obrigatório ausente');
  return result;
}

function array(c, value, path, max) {
  if (!Array.isArray(value)) return c.error(path, 'precisa ser uma lista');
  if (value.length > max) return c.error(path, `lista com mais de ${max} itens`);
  if (Reflect.ownKeys(value).length !== value.length + 1) return c.error(path, 'precisa ser uma lista JSON simples');
  return value;
}

function text(c, value, path, { max = 120, min = 1, multiline = false, nullable = false } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string') return c.error(path, nullable ? 'precisa ser texto ou null' : 'precisa ser texto');
  const normalized = value.normalize('NFC');
  if (normalized.length < min) return c.error(path, 'não pode ficar vazio');
  if (normalized.length > max) return c.error(path, `ultrapassa ${max} caracteres`);
  if (normalized.trim() !== normalized) return c.error(path, 'não pode começar ou terminar com espaços');
  if ((multiline ? CONTROL : CONTROL_SINGLE_LINE).test(normalized)) return c.error(path, 'contém caracteres de controle');
  if (looksLikeSecret(normalized)) return c.error(path, 'parece conter uma credencial; segredos nunca vão para o manifesto');
  return normalized;
}

function oneOf(c, value, path, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) return c.error(path, `valor fora da lista permitida (${allowed.slice(0, 8).join(', ')}${allowed.length > 8 ? ', …' : ''})`);
  return value;
}

function slug(c, value, path, max = 63) {
  if (typeof value !== 'string' || value.length > max || !SLUG.test(value)) return c.error(path, 'use letras minúsculas, números e hífens (ex.: presenca-digital)');
  return value;
}

function uuid(c, value, path, nullable = false) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || !UUID.test(value)) return c.error(path, nullable ? 'precisa ser UUID ou null' : 'precisa ser UUID');
  return value.toLowerCase();
}

function url(c, value, path, nullable = true) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || value.length > 2048 || CONTROL_SINGLE_LINE.test(value)) return c.error(path, 'URL inválida');
  let parsed;
  try { parsed = new URL(value); } catch { return c.error(path, 'URL inválida'); }
  if (!['https:', 'http:'].includes(parsed.protocol)) return c.error(path, 'somente URLs http(s)');
  if (parsed.username || parsed.password) return c.error(path, 'URL não pode conter usuário ou senha');
  if (looksLikeSecret(value) || /[?&](?:token|key|secret|password|access_token|api_key)=/i.test(value)) return c.error(path, 'URL parece conter credencial');
  return value;
}

function dateTime(c, value, path, nullable = true) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || !DATE_TIME.test(value) || !Number.isFinite(Date.parse(value))) return c.error(path, 'data inválida (use ISO 8601)');
  return value;
}

/** Caminho relativo portátil dentro da Base. Validação léxica: não abre arquivos. */
export function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024 || CONTROL_SINGLE_LINE.test(value)) return false;
  if (/[\\<>:"|?*%]/u.test(value) || value.startsWith('/')) return false;
  const normalized = value.normalize('NFC');
  return normalized.split('/').every(segment => segment && segment !== '.' && segment !== '..' && segment.length <= 255
    && segment.trim() === segment && !/[. ]$/.test(segment) && !RESERVED_WINDOWS.test(segment));
}

function relativePath(c, value, path, nullable = false) {
  if (value === null && nullable) return null;
  if (!isSafeRelativePath(value)) return c.error(path, 'caminho relativo inválido (use / e nada fora desta pasta)');
  return /** @type {string} */ (value).normalize('NFC');
}

function unique(c, items, path, key = 'id') {
  const seen = new Set();
  items.forEach((item, index) => {
    const value = item?.[key];
    if (typeof value !== 'string') return;
    if (seen.has(value)) c.error(`${path}[${index}].${key}`, 'identificador repetido');
    seen.add(value);
  });
}

function result(c, value) {
  const ok = c.errors.length === 0;
  return { ok, value: ok ? value : undefined, errors: c.errors, warnings: c.warnings };
}

function validateCompany(c, raw, status) {
  const company = object(c, raw, 'company', ['name', 'slug', 'legalName', 'segment', 'description', 'tagline', 'website', 'locale', 'timezone'], ['name', 'slug']);
  if (!company) return undefined;
  const name = text(c, company.name, 'company.name');
  if (status === 'active' && typeof name === 'string' && PLACEHOLDER.test(name)) c.error('company.name', 'ainda é um marcador do template; informe o nome da empresa');
  const out = { name, slug: slug(c, company.slug, 'company.slug', 48) };
  if (Object.hasOwn(company, 'legalName')) out.legalName = text(c, company.legalName, 'company.legalName', { max: 200, nullable: true });
  if (Object.hasOwn(company, 'segment')) out.segment = text(c, company.segment, 'company.segment', { max: 120, nullable: true });
  if (Object.hasOwn(company, 'description')) out.description = text(c, company.description, 'company.description', { max: 2000, multiline: true, nullable: true });
  if (Object.hasOwn(company, 'tagline')) out.tagline = text(c, company.tagline, 'company.tagline', { max: 200, nullable: true });
  if (Object.hasOwn(company, 'website')) out.website = url(c, company.website, 'company.website');
  out.locale = Object.hasOwn(company, 'locale') ? (typeof company.locale === 'string' && LOCALE.test(company.locale) ? company.locale : c.error('company.locale', 'use um código como pt-BR')) : 'pt-BR';
  out.timezone = Object.hasOwn(company, 'timezone') ? (typeof company.timezone === 'string' && TIMEZONE.test(company.timezone) ? company.timezone : c.error('company.timezone', 'use um fuso IANA como America/Sao_Paulo')) : 'America/Sao_Paulo';
  return out;
}

function validateIdentity(c, raw) {
  const identity = object(c, raw, 'identity', ['guide', 'logo', 'symbol', 'colors', 'typography', 'voice']);
  if (!identity) return undefined;
  const out = {};
  if (Object.hasOwn(identity, 'guide')) out.guide = relativePath(c, identity.guide, 'identity.guide', true);
  if (Object.hasOwn(identity, 'logo')) out.logo = relativePath(c, identity.logo, 'identity.logo', true);
  if (Object.hasOwn(identity, 'symbol')) out.symbol = relativePath(c, identity.symbol, 'identity.symbol', true);
  if (Object.hasOwn(identity, 'colors')) {
    const colors = object(c, identity.colors, 'identity.colors', ['background', 'surface', 'text', 'textSecondary', 'accent']);
    if (colors) {
      out.colors = {};
      for (const [key, value] of Object.entries(colors)) {
        if (typeof value !== 'string' || !COLOR.test(value)) c.error(`identity.colors.${key}`, 'use cor hexadecimal #RRGGBB');
        else out.colors[key] = value.toUpperCase();
      }
    }
  }
  if (Object.hasOwn(identity, 'typography')) {
    const typography = object(c, identity.typography, 'identity.typography', ['heading', 'body']);
    if (typography) {
      out.typography = {};
      for (const key of ['heading', 'body']) if (Object.hasOwn(typography, key)) out.typography[key] = text(c, typography[key], `identity.typography.${key}`, { max: 80 });
    }
  }
  if (Object.hasOwn(identity, 'voice')) {
    const voice = object(c, identity.voice, 'identity.voice', ['tagline', 'message', 'concept', 'method', 'description']);
    if (voice) {
      out.voice = {};
      for (const key of ['tagline', 'message', 'concept']) if (Object.hasOwn(voice, key)) out.voice[key] = text(c, voice[key], `identity.voice.${key}`, { max: 300, nullable: true });
      if (Object.hasOwn(voice, 'description')) out.voice.description = text(c, voice.description, 'identity.voice.description', { max: 1000, multiline: true, nullable: true });
      if (Object.hasOwn(voice, 'method')) {
        const steps = array(c, voice.method, 'identity.voice.method', 12);
        if (steps) out.voice.method = steps.map((step, index) => text(c, step, `identity.voice.method[${index}]`, { max: 60 }));
      }
    }
  }
  return out;
}

function validateContext(c, raw) {
  const context = object(c, raw, 'context', ['memory', 'identity', 'tasks', 'rules', 'knowledge'], ['memory', 'identity']);
  if (!context) return undefined;
  const out = {
    memory: relativePath(c, context.memory, 'context.memory'),
    identity: relativePath(c, context.identity, 'context.identity'),
  };
  if (Object.hasOwn(context, 'tasks')) out.tasks = relativePath(c, context.tasks, 'context.tasks', true);
  if (Object.hasOwn(context, 'rules')) out.rules = relativePath(c, context.rules, 'context.rules', true);
  if (Object.hasOwn(context, 'knowledge')) {
    const list = array(c, context.knowledge, 'context.knowledge', 50);
    if (list) out.knowledge = list.map((item, index) => relativePath(c, item, `context.knowledge[${index}]`));
  } else out.knowledge = [];
  return out;
}

function validateServices(c, raw) {
  const list = array(c, raw, 'services', 100);
  if (!list) return undefined;
  const out = list.map((item, index) => {
    const path = `services[${index}]`;
    const service = object(c, item, path, ['id', 'name', 'summary', 'path', 'status', 'visibility', 'transversal'], ['id', 'name']);
    if (!service) return undefined;
    const value = { id: slug(c, service.id, `${path}.id`), name: text(c, service.name, `${path}.name`) };
    if (Object.hasOwn(service, 'summary')) value.summary = text(c, service.summary, `${path}.summary`, { max: 600, multiline: true, nullable: true });
    if (Object.hasOwn(service, 'path')) value.path = relativePath(c, service.path, `${path}.path`, true);
    value.status = Object.hasOwn(service, 'status') ? oneOf(c, service.status, `${path}.status`, SERVICE_STATUSES) : 'active';
    value.visibility = Object.hasOwn(service, 'visibility') ? oneOf(c, service.visibility, `${path}.visibility`, VISIBILITIES) : 'internal';
    if (Object.hasOwn(service, 'transversal')) value.transversal = service.transversal === true ? true : service.transversal === false ? false : c.error(`${path}.transversal`, 'use true ou false');
    return value;
  });
  unique(c, out, 'services');
  return out;
}

function validateLinks(c, raw, path) {
  const list = array(c, raw, path, 20);
  if (!list) return undefined;
  return list.map((item, index) => {
    const link = object(c, item, `${path}[${index}]`, ['label', 'url'], ['label', 'url']);
    return link ? { label: text(c, link.label, `${path}[${index}].label`, { max: 80 }), url: url(c, link.url, `${path}[${index}].url`, false) } : undefined;
  });
}

function validateProjects(c, raw, serviceIds) {
  const list = array(c, raw, 'projects', 500);
  if (!list) return undefined;
  const out = list.map((item, index) => {
    const path = `projects[${index}]`;
    const project = object(c, item, path, ['id', 'name', 'type', 'status', 'path', 'summary', 'services', 'links', 'visibility', 'createdAt'], ['id', 'name', 'type']);
    if (!project) return undefined;
    const value = {
      id: slug(c, project.id, `${path}.id`),
      name: text(c, project.name, `${path}.name`),
      type: oneOf(c, project.type, `${path}.type`, PROJECT_TYPES),
      status: Object.hasOwn(project, 'status') ? oneOf(c, project.status, `${path}.status`, PROJECT_STATUSES) : 'active',
      visibility: Object.hasOwn(project, 'visibility') ? oneOf(c, project.visibility, `${path}.visibility`, VISIBILITIES) : 'internal',
    };
    if (Object.hasOwn(project, 'path')) value.path = relativePath(c, project.path, `${path}.path`, true);
    if (Object.hasOwn(project, 'summary')) value.summary = text(c, project.summary, `${path}.summary`, { max: 600, multiline: true, nullable: true });
    if (Object.hasOwn(project, 'createdAt')) value.createdAt = dateTime(c, project.createdAt, `${path}.createdAt`);
    if (Object.hasOwn(project, 'services')) {
      const services = array(c, project.services, `${path}.services`, 20);
      if (services) value.services = services.map((id, serviceIndex) => {
        const valid = slug(c, id, `${path}.services[${serviceIndex}]`);
        if (valid && serviceIds && !serviceIds.has(valid)) c.error(`${path}.services[${serviceIndex}]`, 'serviço não declarado em services');
        return valid;
      });
    }
    if (Object.hasOwn(project, 'links')) value.links = validateLinks(c, project.links, `${path}.links`);
    return value;
  });
  unique(c, out, 'projects');
  return out;
}

function validateModules(c, raw, version = BASE_SCHEMA_VERSION) {
  const modules = object(c, raw, 'modules', ['enabled', 'order', 'settings'], ['enabled']);
  if (!modules) return undefined;
  const out = {};
  const enabled = array(c, modules.enabled, 'modules.enabled', MODULE_IDS.length);
  if (enabled) {
    out.enabled = [];
    enabled.forEach((id, index) => {
      if (typeof id !== 'string' || !MODULE_IDS.includes(id)) return c.error(`modules.enabled[${index}]`, 'módulo desconhecido por este contrato');
      if (out.enabled.includes(id)) return c.error(`modules.enabled[${index}]`, 'módulo repetido');
      out.enabled.push(id);
    });
  }
  if (Object.hasOwn(modules, 'order')) {
    const order = array(c, modules.order, 'modules.order', MODULE_IDS.length);
    if (order) out.order = order.filter((id, index) => (typeof id === 'string' && MODULE_IDS.includes(id)) || c.error(`modules.order[${index}]`, 'módulo desconhecido por este contrato'));
  }
  if (Object.hasOwn(modules, 'settings')) {
    const settings = object(c, modules.settings, 'modules.settings', MODULE_IDS);
    if (settings) {
      out.settings = {};
      for (const [id, value] of Object.entries(settings)) {
        const path = `modules.settings.${id}`;
        // v2 guardava rótulos e etapas do CRM aqui; na v3 isso mora na seção `crm`.
        const setting = object(c, value, path, version >= 3 ? ['label', 'description'] : ['label', 'description', 'entityLabel', 'stages']);
        if (!setting) continue;
        const entry = {};
        if (Object.hasOwn(setting, 'label')) entry.label = text(c, setting.label, `${path}.label`, { max: 40 });
        if (Object.hasOwn(setting, 'description')) entry.description = text(c, setting.description, `${path}.description`, { max: 300, nullable: true });
        if (Object.hasOwn(setting, 'entityLabel')) entry.entityLabel = text(c, setting.entityLabel, `${path}.entityLabel`, { max: 40 });
        if (Object.hasOwn(setting, 'stages')) {
          const stages = array(c, setting.stages, `${path}.stages`, 20);
          if (stages) {
            entry.stages = stages.map((stage, index) => text(c, stage, `${path}.stages[${index}]`, { max: 40 }));
            if (new Set(entry.stages).size !== entry.stages.length) c.error(`${path}.stages`, 'etapas repetidas');
          }
        }
        out.settings[id] = entry;
      }
    }
  }
  return out;
}

function bool(c, value, path) {
  if (typeof value !== 'boolean') return c.error(path, 'use true ou false');
  return value;
}

function integer(c, value, path, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) return c.error(path, `use um inteiro de ${min} a ${max}`);
  return value;
}

/**
 * Seção `crm`: estrutura, regras e vocabulário do CRM desta empresa. Nenhum dado vivo (contatos,
 * leads, oportunidades) entra aqui: eles ficam no banco operacional da instância.
 */
function validateCrm(c, raw) {
  const crm = object(c, raw, 'crm', ['enabled', 'labels', 'currency', 'pipelines', 'customFields', 'sources', 'lostReasons', 'automations', 'integrations'], ['enabled']);
  if (!crm) return undefined;
  const out = { enabled: bool(c, crm.enabled, 'crm.enabled') };
  out.labels = {};
  if (Object.hasOwn(crm, 'labels')) {
    const labels = object(c, crm.labels, 'crm.labels', CRM_LABEL_KEYS);
    if (labels) for (const [key, value] of Object.entries(labels)) out.labels[key] = text(c, value, `crm.labels.${key}`, { max: 40 });
  }
  out.currency = Object.hasOwn(crm, 'currency') ? (typeof crm.currency === 'string' && /^[A-Z]{3}$/.test(crm.currency) ? crm.currency : c.error('crm.currency', 'use o código ISO da moeda (ex.: BRL)')) : 'BRL';

  // Campos personalizados antes dos funis: regras de etapa podem exigi-los.
  out.customFields = [];
  if (Object.hasOwn(crm, 'customFields')) {
    const list = array(c, crm.customFields, 'crm.customFields', 60);
    if (list) out.customFields = list.map((item, index) => {
      const path = `crm.customFields[${index}]`;
      const field = object(c, item, path, ['id', 'entity', 'label', 'type', 'options', 'required', 'help'], ['id', 'entity', 'label', 'type']);
      if (!field) return undefined;
      const value = {
        id: slug(c, field.id, `${path}.id`, 40), entity: oneOf(c, field.entity, `${path}.entity`, CRM_ENTITIES),
        label: text(c, field.label, `${path}.label`, { max: 60 }), type: oneOf(c, field.type, `${path}.type`, CRM_FIELD_TYPES),
        required: Object.hasOwn(field, 'required') ? bool(c, field.required, `${path}.required`) : false,
      };
      if (Object.hasOwn(field, 'help')) value.help = text(c, field.help, `${path}.help`, { max: 200, nullable: true });
      if (value.type === 'select' || value.type === 'multiselect') {
        const options = array(c, field.options, `${path}.options`, 50);
        if (options) {
          value.options = options.map((option, optionIndex) => text(c, option, `${path}.options[${optionIndex}]`, { max: 60 }));
          if (!value.options.length) c.error(`${path}.options`, 'informe ao menos uma opção');
          if (new Set(value.options).size !== value.options.length) c.error(`${path}.options`, 'opções repetidas');
        }
      } else if (Object.hasOwn(field, 'options')) c.error(`${path}.options`, 'somente campos de seleção têm opções');
      return value;
    });
    const seen = new Set();
    out.customFields.forEach((field, index) => {
      if (!field?.id || !field.entity) return;
      const key = `${field.entity}:${field.id}`;
      if (seen.has(key)) c.error(`crm.customFields[${index}].id`, 'campo repetido para a mesma entidade');
      seen.add(key);
    });
  }
  const opportunityFields = new Set(out.customFields.filter(field => field?.entity === 'opportunity').map(field => field.id));

  out.pipelines = [];
  if (Object.hasOwn(crm, 'pipelines')) {
    const list = array(c, crm.pipelines, 'crm.pipelines', 10);
    if (list) out.pipelines = list.map((item, index) => {
      const path = `crm.pipelines[${index}]`;
      const pipeline = object(c, item, path, ['id', 'name', 'default', 'description', 'stages'], ['id', 'name', 'stages']);
      if (!pipeline) return undefined;
      const value = { id: slug(c, pipeline.id, `${path}.id`, 40), name: text(c, pipeline.name, `${path}.name`, { max: 60 }), default: Object.hasOwn(pipeline, 'default') ? bool(c, pipeline.default, `${path}.default`) : false };
      if (Object.hasOwn(pipeline, 'description')) value.description = text(c, pipeline.description, `${path}.description`, { max: 300, nullable: true });
      const stages = array(c, pipeline.stages, `${path}.stages`, 30);
      value.stages = (stages ?? []).map((stageItem, stageIndex) => {
        const stagePath = `${path}.stages[${stageIndex}]`;
        const stage = object(c, stageItem, stagePath, ['id', 'name', 'kind', 'probability', 'requiredFields'], ['id', 'name', 'kind']);
        if (!stage) return undefined;
        const stageValue = { id: slug(c, stage.id, `${stagePath}.id`, 40), name: text(c, stage.name, `${stagePath}.name`, { max: 40 }), kind: oneOf(c, stage.kind, `${stagePath}.kind`, CRM_STAGE_KINDS) };
        if (Object.hasOwn(stage, 'probability')) stageValue.probability = integer(c, stage.probability, `${stagePath}.probability`, 0, 100);
        if (Object.hasOwn(stage, 'requiredFields')) {
          const required = array(c, stage.requiredFields, `${stagePath}.requiredFields`, 12);
          if (required) stageValue.requiredFields = required.map((key, keyIndex) => {
            if (typeof key === 'string' && (CRM_REQUIRED_FIELD_KEYS.includes(key) || (key.startsWith('custom.') && opportunityFields.has(key.slice(7))))) return key;
            return c.error(`${stagePath}.requiredFields[${keyIndex}]`, 'campo desconhecido (use um campo nativo ou custom.<id> de oportunidade)');
          });
        }
        return stageValue;
      });
      const valid = value.stages.filter(Boolean);
      unique(c, valid, `${path}.stages`);
      if (valid.length < 3) c.error(`${path}.stages`, 'um funil precisa de ao menos uma etapa aberta, uma de ganho e uma de perda');
      if (valid.filter(stage => stage.kind === 'won').length !== 1) c.error(`${path}.stages`, 'o funil precisa de exatamente uma etapa de ganho (kind "won")');
      if (valid.filter(stage => stage.kind === 'lost').length !== 1) c.error(`${path}.stages`, 'o funil precisa de exatamente uma etapa de perda (kind "lost")');
      if (!valid.some(stage => stage.kind === 'open')) c.error(`${path}.stages`, 'o funil precisa de ao menos uma etapa em aberto');
      return value;
    });
    unique(c, out.pipelines.filter(Boolean), 'crm.pipelines');
    const defaults = out.pipelines.filter(pipeline => pipeline?.default);
    if (defaults.length > 1) c.error('crm.pipelines', 'marque no máximo um funil como padrão');
    if (!defaults.length && out.pipelines[0]) out.pipelines[0].default = true;
  }
  if (out.enabled && !out.pipelines.length) c.error('crm.pipelines', 'CRM habilitado precisa de ao menos um funil');

  out.sources = [];
  if (Object.hasOwn(crm, 'sources')) {
    const list = array(c, crm.sources, 'crm.sources', 40);
    const core = new Set(CRM_CORE_SOURCES.map(source => source.id));
    if (list) out.sources = list.map((item, index) => {
      const path = `crm.sources[${index}]`;
      const source = object(c, item, path, ['id', 'label', 'kind'], ['id', 'label', 'kind']);
      if (!source) return undefined;
      const id = slug(c, source.id, `${path}.id`, 40);
      if (id && core.has(id)) c.error(`${path}.id`, 'origem nativa do Core; use outro identificador');
      return { id, label: text(c, source.label, `${path}.label`, { max: 60 }), kind: oneOf(c, source.kind, `${path}.kind`, CRM_SOURCE_KINDS) };
    });
    unique(c, out.sources.filter(Boolean), 'crm.sources');
  }

  out.lostReasons = [...DEFAULT_LOST_REASONS];
  if (Object.hasOwn(crm, 'lostReasons')) {
    const list = array(c, crm.lostReasons, 'crm.lostReasons', 30);
    if (list) {
      out.lostReasons = list.map((reason, index) => text(c, reason, `crm.lostReasons[${index}]`, { max: 80 }));
      if (new Set(out.lostReasons).size !== out.lostReasons.length) c.error('crm.lostReasons', 'motivos repetidos');
    }
  }

  out.automations = [];
  if (Object.hasOwn(crm, 'automations')) {
    const list = array(c, crm.automations, 'crm.automations', 30);
    if (list) out.automations = list.map((item, index) => {
      const path = `crm.automations[${index}]`;
      const automation = object(c, item, path, ['id', 'name', 'enabled', 'when', 'actions'], ['id', 'name', 'when', 'actions']);
      if (!automation) return undefined;
      const value = { id: slug(c, automation.id, `${path}.id`, 40), name: text(c, automation.name, `${path}.name`, { max: 80 }), enabled: Object.hasOwn(automation, 'enabled') ? bool(c, automation.enabled, `${path}.enabled`) : true };
      const when = object(c, automation.when, `${path}.when`, ['event', 'pipeline', 'stage'], ['event']);
      if (when) {
        value.when = { event: oneOf(c, when.event, `${path}.when.event`, CRM_AUTOMATION_EVENTS) };
        if (Object.hasOwn(when, 'pipeline')) value.when.pipeline = slug(c, when.pipeline, `${path}.when.pipeline`, 40);
        if (Object.hasOwn(when, 'stage')) value.when.stage = slug(c, when.stage, `${path}.when.stage`, 40);
        if (value.when.event === 'stage_entered') {
          const pipeline = out.pipelines.find(entry => entry?.id === value.when.pipeline);
          if (!pipeline || !pipeline.stages.some(stage => stage?.id === value.when.stage)) c.error(`${path}.when`, 'stage_entered precisa de pipeline e stage existentes');
        } else if (value.when.pipeline && !out.pipelines.some(entry => entry?.id === value.when.pipeline)) c.error(`${path}.when.pipeline`, 'funil inexistente');
      }
      const actions = array(c, automation.actions, `${path}.actions`, 5);
      value.actions = (actions ?? []).map((actionItem, actionIndex) => {
        const actionPath = `${path}.actions[${actionIndex}]`;
        const action = object(c, actionItem, actionPath, ['type', 'title', 'dueInDays', 'assignTo', 'tag'], ['type']);
        if (!action) return undefined;
        if (action.type === 'create_task') {
          return {
            type: 'create_task', title: text(c, action.title, `${actionPath}.title`, { max: 200 }),
            dueInDays: Object.hasOwn(action, 'dueInDays') ? integer(c, action.dueInDays, `${actionPath}.dueInDays`, 0, 365) : 1,
            assignTo: Object.hasOwn(action, 'assignTo') ? oneOf(c, action.assignTo, `${actionPath}.assignTo`, ['owner', 'none']) : 'owner',
          };
        }
        if (action.type === 'add_tag') return { type: 'add_tag', tag: text(c, action.tag, `${actionPath}.tag`, { max: 40 }) };
        return c.error(`${actionPath}.type`, 'ação desconhecida (create_task ou add_tag)');
      });
      if (actions && !actions.length) c.error(`${path}.actions`, 'informe ao menos uma ação');
      return value;
    });
    unique(c, out.automations.filter(Boolean), 'crm.automations');
  }

  // Vínculo entre uma plataforma conectada no Hub e o CRM: de onde vêm os leads e para onde vão.
  out.integrations = [];
  if (Object.hasOwn(crm, 'integrations')) {
    const list = array(c, crm.integrations, 'crm.integrations', CRM_LEAD_PROVIDERS.length);
    const sourceIds = new Set([...CRM_CORE_SOURCES.map(source => source.id), ...out.sources.filter(Boolean).map(source => source.id)]);
    if (list) out.integrations = list.map((item, index) => {
      const path = `crm.integrations[${index}]`;
      const link = object(c, item, path, ['provider', 'leads', 'source', 'pipeline'], ['provider', 'leads', 'source']);
      if (!link) return undefined;
      const value = { provider: oneOf(c, link.provider, `${path}.provider`, CRM_LEAD_PROVIDERS), leads: bool(c, link.leads, `${path}.leads`), source: slug(c, link.source, `${path}.source`, 40) };
      if (value.source && !sourceIds.has(value.source)) c.error(`${path}.source`, 'origem não declarada (use uma origem nativa ou de crm.sources)');
      if (Object.hasOwn(link, 'pipeline')) {
        value.pipeline = slug(c, link.pipeline, `${path}.pipeline`, 40);
        if (value.pipeline && !out.pipelines.some(pipeline => pipeline?.id === value.pipeline)) c.error(`${path}.pipeline`, 'funil inexistente');
      }
      return value;
    });
    unique(c, out.integrations.filter(Boolean), 'crm.integrations', 'provider');
  }
  return out;
}

/** Valida somente a seção `crm` (editor de configuração do Hub, alterações enfileiradas para a Base). */
export function validateCrmConfig(input) {
  const c = new Collector();
  return result(c, validateCrm(c, input));
}

function validateIntegrations(c, raw) {
  const list = array(c, raw, 'integrations', 60);
  if (!list) return undefined;
  const out = list.map((item, index) => {
    const path = `integrations[${index}]`;
    const integration = object(c, item, path, ['id', 'provider', 'label', 'purpose', 'status', 'secrets', 'account'], ['id', 'provider']);
    if (!integration) return undefined;
    const value = {
      id: slug(c, integration.id, `${path}.id`),
      provider: oneOf(c, integration.provider, `${path}.provider`, INTEGRATION_PROVIDERS),
      status: Object.hasOwn(integration, 'status') ? oneOf(c, integration.status, `${path}.status`, INTEGRATION_STATUSES) : 'planned',
    };
    if (Object.hasOwn(integration, 'label')) value.label = text(c, integration.label, `${path}.label`, { max: 80, nullable: true });
    if (Object.hasOwn(integration, 'purpose')) value.purpose = text(c, integration.purpose, `${path}.purpose`, { max: 300, nullable: true });
    // Conta externa descrita por um rótulo público (ex.: "@empresa"), nunca um token.
    if (Object.hasOwn(integration, 'account')) value.account = text(c, integration.account, `${path}.account`, { max: 120, nullable: true });
    if (Object.hasOwn(integration, 'secrets')) {
      const secrets = array(c, integration.secrets, `${path}.secrets`, 10);
      if (secrets) value.secrets = secrets.map((name, secretIndex) => typeof name === 'string' && SECRET_REF.test(name) ? name
        : c.error(`${path}.secrets[${secretIndex}]`, 'use somente o NOME da variável (ex.: GITHUB_TOKEN), nunca o valor'));
    }
    return value;
  });
  unique(c, out, 'integrations');
  return out;
}

function validateAssets(c, raw) {
  const list = array(c, raw, 'assets', 200);
  if (!list) return undefined;
  const out = list.map((item, index) => {
    const path = `assets[${index}]`;
    const asset = object(c, item, path, ['id', 'kind', 'path', 'label', 'visibility'], ['id', 'kind', 'path']);
    if (!asset) return undefined;
    const value = { id: slug(c, asset.id, `${path}.id`), kind: oneOf(c, asset.kind, `${path}.kind`, ASSET_KINDS), path: relativePath(c, asset.path, `${path}.path`) };
    if (Object.hasOwn(asset, 'label')) value.label = text(c, asset.label, `${path}.label`, { max: 80, nullable: true });
    value.visibility = Object.hasOwn(asset, 'visibility') ? oneOf(c, asset.visibility, `${path}.visibility`, VISIBILITIES) : 'internal';
    return value;
  });
  unique(c, out, 'assets');
  return out;
}

function validateResources(c, raw) {
  const list = array(c, raw, 'resources', 200);
  if (!list) return undefined;
  const out = list.map((item, index) => {
    const path = `resources[${index}]`;
    const resource = object(c, item, path, ['id', 'kind', 'label', 'url', 'path', 'visibility'], ['id', 'kind', 'label']);
    if (!resource) return undefined;
    const value = { id: slug(c, resource.id, `${path}.id`), kind: oneOf(c, resource.kind, `${path}.kind`, RESOURCE_KINDS), label: text(c, resource.label, `${path}.label`, { max: 120 }) };
    if (Object.hasOwn(resource, 'url')) value.url = url(c, resource.url, `${path}.url`);
    if (Object.hasOwn(resource, 'path')) value.path = relativePath(c, resource.path, `${path}.path`, true);
    if (!value.url && !value.path) c.error(path, 'informe url ou path');
    value.visibility = Object.hasOwn(resource, 'visibility') ? oneOf(c, resource.visibility, `${path}.visibility`, VISIBILITIES) : 'internal';
    return value;
  });
  unique(c, out, 'resources');
  return out;
}

function validateRoles(c, raw) {
  const list = array(c, raw, 'roles', 30);
  if (!list) return undefined;
  const out = list.map((item, index) => {
    const path = `roles[${index}]`;
    const role = object(c, item, path, ['id', 'name', 'description', 'permissions'], ['id', 'name', 'permissions']);
    if (!role) return undefined;
    const id = slug(c, role.id, `${path}.id`, 40);
    if (id && RESERVED_ROLE_IDS.includes(id)) c.error(`${path}.id`, 'papel reservado do Core; escolha outro identificador');
    const value = { id, name: text(c, role.name, `${path}.name`, { max: 60 }) };
    if (Object.hasOwn(role, 'description')) value.description = text(c, role.description, `${path}.description`, { max: 300, nullable: true });
    const permissions = array(c, role.permissions, `${path}.permissions`, 80);
    if (permissions) value.permissions = permissions.map((permission, permissionIndex) => {
      // Sugestões vindas da Base nunca concedem administração total nem gestão de usuários.
      if (typeof permission !== 'string' || !PERMISSION.test(permission)) return c.error(`${path}.permissions[${permissionIndex}]`, 'permissão inválida (formato modulo:acao)');
      if (/^(?:users|settings):/.test(permission) || permission.endsWith(':*')) return c.error(`${path}.permissions[${permissionIndex}]`, 'a Base não pode sugerir administração; conceda pelo Hub');
      return permission;
    });
    return value;
  });
  unique(c, out, 'roles');
  return out;
}

function validateData(c, raw) {
  const data = object(c, raw, 'data', ['versionable', 'private']);
  if (!data) return undefined;
  const out = {};
  for (const key of ['versionable', 'private']) {
    if (!Object.hasOwn(data, key)) { out[key] = []; continue; }
    const list = array(c, data[key], `data.${key}`, 100);
    if (list) out[key] = list.map((item, index) => relativePath(c, item, `data.${key}[${index}]`));
  }
  const privatePaths = new Set((out.private ?? []).map(value => String(value).toLowerCase()));
  (out.versionable ?? []).forEach((value, index) => {
    if (typeof value === 'string' && privatePaths.has(value.toLowerCase())) c.error(`data.versionable[${index}]`, 'o mesmo caminho não pode ser versionável e privado');
  });
  return out;
}

/**
 * Formata um manifesto para leitura humana: objetos e listas curtos ficam numa linha (ex.: uma etapa
 * do funil), o resto é indentado. Pessoas e agentes editam a Base à mão; o arquivo precisa ser legível.
 * @param {unknown} value
 */
export function formatManifest(value) {
  const oneLine = node => Array.isArray(node) ? `[${node.map(oneLine).join(', ')}]`
    : node && typeof node === 'object' ? (Object.keys(node).length ? `{ ${Object.entries(node).map(([key, item]) => `${JSON.stringify(key)}: ${oneLine(item)}`).join(', ')} }` : '{}')
      : JSON.stringify(node);
  // "Folha": só valores simples ou listas de valores simples (cabe numa linha sem esconder estrutura).
  const leaf = node => (Array.isArray(node) ? node : Object.values(node)).every(item => item === null || typeof item !== 'object' || (Array.isArray(item) && item.every(inner => inner === null || typeof inner !== 'object')));
  const render = (node, indent) => {
    if (node === null || typeof node !== 'object') return JSON.stringify(node);
    const entries = Array.isArray(node) ? node.map(item => [null, item]) : Object.entries(node);
    if (!entries.length) return Array.isArray(node) ? '[]' : '{}';
    const flat = oneLine(node);
    if (leaf(node) && indent.length + flat.length <= 118) return flat;
    const inner = `${indent}  `;
    const lines = entries.map(([key, item]) => `${inner}${key === null ? '' : `${JSON.stringify(key)}: `}${render(item, inner)}`);
    return Array.isArray(node) ? `[\n${lines.join(',\n')}\n${indent}]` : `{\n${lines.join(',\n')}\n${indent}}`;
  };
  return `${render(value, '')}\n`;
}

/** Converte um manifesto v1 (Hub 0.2) para a estrutura v2, sem inventar dados. */
function upgradeV1toV2(input) {
  const name = typeof input.company?.name === 'string' ? input.company.name : '[Nome da empresa]';
  const v1Modules = Array.isArray(input.modules) ? input.modules.filter(id => typeof id === 'string') : [];
  const knowledge = [input.paths?.memory, input.paths?.projects].filter(value => typeof value === 'string');
  const profile = PROFILES.includes(input.profile) ? input.profile : 'general';
  return {
    format: BASE_FORMAT,
    schemaVersion: 2,
    baseId: input.baseId ?? null,
    status: 'active',
    company: { name, slug: slugify(name) || 'empresa' },
    profile,
    context: { memory: input.paths?.memory ?? '_memoria', identity: input.paths?.identity ?? 'identidade', knowledge },
    modules: { enabled: [...new Set(['overview', ...v1Modules])] },
  };
}

/** Plural simples para rótulos convertidos da v2; sem certeza (ex.: "Fornecedor"), não inventa. */
function pluralLabel(value) {
  return /[aeiouáéíóúâêôãõ]$/i.test(value) && value.length < 40 ? `${value}s` : undefined;
}

/**
 * Converte um manifesto v2 (já validado como v2) para v3: rótulos e etapas do CRM saem de
 * `modules.settings` e passam para a seção `crm`. Devolve o manifesto e as observações da conversão.
 */
function upgradeV2toV3(input) {
  /** @type {{path: string, message: string}[]} */
  const notes = [];
  const { settings, ...modules } = input.modules ?? {};
  const nextSettings = {};
  let legacy;
  for (const [id, entry] of Object.entries(settings ?? {})) {
    const { entityLabel, stages, ...rest } = entry ?? {};
    if (id === 'crm') legacy = { entityLabel, stages };
    else if (entityLabel !== undefined || stages !== undefined) notes.push({ path: `modules.settings.${id}`, message: 'entityLabel e stages só tinham efeito no CRM e foram retirados' });
    if (Object.keys(rest).length) nextSettings[id] = rest;
  }
  const output = { ...input, schemaVersion: 3, modules: { ...modules, ...(Object.keys(nextSettings).length ? { settings: nextSettings } : {}) } };
  const enabled = Array.isArray(modules.enabled) && modules.enabled.includes('crm');
  if (enabled || legacy) {
    const crm = defaultCrmConfig();
    crm.enabled = enabled;
    if (typeof legacy?.entityLabel === 'string') {
      crm.labels.contact = legacy.entityLabel;
      const plural = pluralLabel(legacy.entityLabel);
      if (plural) crm.labels.contacts = plural;
      notes.push({ path: 'crm.labels', message: 'o nome da entidade do CRM passou para crm.labels.contact' });
    }
    if (Array.isArray(legacy?.stages) && legacy.stages.length) {
      const used = new Set(['ganho', 'perdido']);
      const stages = legacy.stages.map((name, index) => {
        let id = slugify(name, 36) || `etapa-${index + 1}`;
        for (let n = 2; used.has(id); n += 1) id = `${slugify(name, 33) || 'etapa'}-${n}`;
        used.add(id);
        return { id, name, kind: 'open' };
      });
      crm.pipelines = [{
        id: 'vendas', name: 'Funil de vendas', default: true,
        stages: [...stages, { id: 'ganho', name: 'Ganho', kind: 'won', probability: 100 }, { id: 'perdido', name: 'Perdido', kind: 'lost', probability: 0 }],
      }];
      notes.push({ path: 'crm.pipelines', message: 'as etapas antigas viraram etapas em aberto do "Funil de vendas", com Ganho e Perdido ao final; revise o funil' });
    }
    output.crm = crm;
  }
  return { manifest: output, notes };
}

/** Converte manifestos antigos (v1, v2) para a versão atual, sem validar. Prefira `validateBaseManifest`. */
export function upgradeBaseManifest(input) {
  let current = input;
  if (current && typeof current === 'object' && current.schemaVersion === 1) current = upgradeV1toV2(current);
  if (current && typeof current === 'object' && current.schemaVersion === 2) current = upgradeV2toV3(current).manifest;
  return current;
}

const BASE_KEYS_V2 = ['$schema', 'format', 'schemaVersion', 'baseId', 'status', 'template', 'createdAt', 'updatedAt', 'company', 'profile',
  'identity', 'context', 'services', 'projects', 'modules', 'integrations', 'assets', 'resources', 'roles', 'data'];
const BASE_KEYS = [...BASE_KEYS_V2, 'crm'];

/**
 * Valida o manifesto da Base (`workfoli.base.json`). Manifestos v1 e v2 são conferidos na própria
 * versão e convertidos para a atual em memória (com aviso); `workfoli update` grava a conversão.
 * @param {unknown} input JSON já interpretado.
 * @param {{ expect?: 'any' | 'template' | 'active' }} [options]
 */
export function validateBaseManifest(input, options = {}) {
  const c = new Collector();
  let source = input;
  const version = source && typeof source === 'object' && !Array.isArray(source) ? /** @type {any} */ (source).schemaVersion : undefined;
  if (version === 1) {
    // A conversão só acontece depois de conferir a estrutura v1 inteira: nada desconhecido é descartado em silêncio.
    const v1 = object(c, source, '', ['format', 'schemaVersion', 'baseId', 'company', 'profile', 'modules', 'paths'], ['format', 'schemaVersion', 'baseId', 'company', 'profile', 'modules', 'paths']);
    if (v1) {
      object(c, v1.company, 'company', ['name'], ['name']);
      object(c, v1.paths, 'paths', ['memory', 'identity', 'projects'], ['memory', 'identity']);
      if (!Array.isArray(v1.modules)) c.error('modules', 'precisa ser uma lista');
      if (!['general', 'agency', 'clinic', 'development'].includes(/** @type {string} */ (v1.profile))) c.error('profile', 'perfil v1 desconhecido');
    }
    if (c.errors.length) return result(c, undefined);
    source = upgradeV1toV2(source);
  }
  if (version === 1 || version === 2) {
    // Idem para a v2: valida inteira na própria versão antes de converter.
    const legacy = new Collector();
    validateBaseCore(legacy, source, 2, options);
    if (legacy.errors.length) { c.errors.push(...legacy.errors); return result(c, undefined); }
    const upgraded = upgradeV2toV3(source);
    source = upgraded.manifest;
    c.warn('schemaVersion', `manifesto v${version} convertido para v${BASE_SCHEMA_VERSION} em memória; rode \`workfoli update\` para gravar a versão nova`);
    for (const note of upgraded.notes) c.warn(note.path, note.message);
  }
  return result(c, validateBaseCore(c, source, BASE_SCHEMA_VERSION, options));
}

function validateBaseCore(c, source, version, options) {
  const raw = object(c, source, '', version >= 3 ? BASE_KEYS : BASE_KEYS_V2, ['format', 'schemaVersion', 'baseId', 'status', 'company', 'profile', 'context', 'modules']);
  if (!raw) return undefined;
  if (raw.format !== BASE_FORMAT) c.error('format', `precisa ser "${BASE_FORMAT}"`);
  if (raw.schemaVersion !== version) {
    if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > BASE_SCHEMA_VERSION) c.error('schemaVersion', 'criado por uma versão mais nova do Workfoli; atualize o Core');
    else c.error('schemaVersion', `versão não suportada (esperado ${BASE_SCHEMA_VERSION})`);
  }
  const status = oneOf(c, raw.status, 'status', BASE_STATUSES);
  if (options.expect && options.expect !== 'any' && status && status !== options.expect) c.error('status', options.expect === 'active' ? 'esta pasta ainda é o modelo; rode /instalar para cadastrar a empresa' : 'o template precisa manter status "template"');
  const baseId = uuid(c, raw.baseId, 'baseId', true);
  if (status === 'active' && baseId === null) c.error('baseId', 'Base ativa precisa de identificador');
  if (status === 'template' && baseId) c.error('baseId', 'o modelo não pode ter identificador; cada empresa recebe o seu no /instalar');
  const manifest = { format: BASE_FORMAT, schemaVersion: version, baseId, status };
  if (Object.hasOwn(raw, 'template')) {
    const template = object(c, raw.template, 'template', ['id', 'version'], ['id', 'version']);
    if (template) manifest.template = { id: slug(c, template.id, 'template.id'), version: typeof template.version === 'string' && SEMVER.test(template.version) ? template.version : c.error('template.version', 'use versão semântica (ex.: 2.0.0)') };
  }
  if (Object.hasOwn(raw, 'createdAt')) manifest.createdAt = dateTime(c, raw.createdAt, 'createdAt');
  if (Object.hasOwn(raw, 'updatedAt')) manifest.updatedAt = dateTime(c, raw.updatedAt, 'updatedAt');
  manifest.company = validateCompany(c, raw.company, status);
  manifest.profile = oneOf(c, raw.profile, 'profile', PROFILES);
  manifest.identity = Object.hasOwn(raw, 'identity') ? validateIdentity(c, raw.identity) : {};
  manifest.context = validateContext(c, raw.context);
  manifest.services = Object.hasOwn(raw, 'services') ? validateServices(c, raw.services) : [];
  const serviceIds = new Set((manifest.services ?? []).map(service => service?.id).filter(Boolean));
  manifest.projects = Object.hasOwn(raw, 'projects') ? validateProjects(c, raw.projects, serviceIds) : [];
  manifest.modules = validateModules(c, raw.modules, version);
  if (version >= 3 && Object.hasOwn(raw, 'crm')) {
    manifest.crm = validateCrm(c, raw.crm);
    const listed = Array.isArray(manifest.modules?.enabled) && manifest.modules.enabled.includes('crm');
    if (manifest.crm && typeof manifest.crm.enabled === 'boolean' && manifest.crm.enabled !== listed) c.error('crm.enabled', 'precisa concordar com modules.enabled (inclua ou retire "crm" nos dois lugares)');
  }
  manifest.integrations = Object.hasOwn(raw, 'integrations') ? validateIntegrations(c, raw.integrations) : [];
  manifest.assets = Object.hasOwn(raw, 'assets') ? validateAssets(c, raw.assets) : [];
  manifest.resources = Object.hasOwn(raw, 'resources') ? validateResources(c, raw.resources) : [];
  manifest.roles = Object.hasOwn(raw, 'roles') ? validateRoles(c, raw.roles) : [];
  manifest.data = Object.hasOwn(raw, 'data') ? validateData(c, raw.data) : { versionable: [], private: [] };
  if (manifest.modules?.enabled && !manifest.modules.enabled.includes('overview')) c.warn('modules.enabled', 'sem "overview" o Hub abre direto no primeiro módulo');
  const privatePaths = (manifest.data?.private ?? []).map(value => String(value).toLowerCase());
  const exposed = [manifest.context?.memory, manifest.context?.identity, ...(manifest.context?.knowledge ?? [])].filter(Boolean);
  for (const value of exposed) {
    const lower = String(value).toLowerCase();
    if (privatePaths.some(privatePath => lower === privatePath || lower.startsWith(`${privatePath}/`))) c.error('context', 'um caminho de contexto está dentro de uma pasta privada');
  }
  return manifest;
}

/**
 * Valida a configuração da instalação do Hub (`workfoli.hub.json`).
 * @param {unknown} input
 */
export function validateHubConfig(input) {
  const c = new Collector();
  const raw = object(c, input, '', ['$schema', 'format', 'schemaVersion', 'hubId', 'mode', 'server', 'modules', 'branding', 'ai', 'security', 'agent'], ['format', 'schemaVersion', 'hubId', 'mode']);
  if (!raw) return result(c, undefined);
  if (raw.format !== HUB_FORMAT) c.error('format', `precisa ser "${HUB_FORMAT}"`);
  if (raw.schemaVersion !== HUB_SCHEMA_VERSION) c.error('schemaVersion', typeof raw.schemaVersion === 'number' && raw.schemaVersion > HUB_SCHEMA_VERSION ? 'criado por uma versão mais nova do Workfoli; atualize o Core' : 'versão não suportada');
  const config = { format: HUB_FORMAT, schemaVersion: HUB_SCHEMA_VERSION, hubId: uuid(c, raw.hubId, 'hubId'), mode: oneOf(c, raw.mode, 'mode', HUB_MODES) };
  const server = Object.hasOwn(raw, 'server') ? object(c, raw.server, 'server', ['host', 'port', 'publicUrl']) : {};
  if (server) {
    const host = Object.hasOwn(server, 'host') ? server.host : '127.0.0.1';
    const port = Object.hasOwn(server, 'port') ? server.port : 4870;
    config.server = {
      host: typeof host === 'string' && /^(?:127\.0\.0\.1|localhost|0\.0\.0\.0|::1|\d{1,3}(?:\.\d{1,3}){3})$/.test(host) ? host : c.error('server.host', 'use 127.0.0.1, localhost ou um IPv4'),
      port: Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : c.error('server.port', 'use uma porta entre 1024 e 65535'),
      publicUrl: Object.hasOwn(server, 'publicUrl') ? url(c, server.publicUrl, 'server.publicUrl') : null,
    };
    if (config.server.host === '0.0.0.0') c.warn('server.host', 'o Hub ficará acessível na rede local; use HTTPS/proxy antes de expor fora da máquina');
  }
  const modules = Object.hasOwn(raw, 'modules') ? object(c, raw.modules, 'modules', ['disabled', 'custom']) : {};
  if (modules) {
    config.modules = { disabled: [], custom: [] };
    if (Object.hasOwn(modules, 'disabled')) {
      const disabled = array(c, modules.disabled, 'modules.disabled', MODULE_IDS.length);
      if (disabled) config.modules.disabled = disabled.filter((id, index) => (typeof id === 'string' && MODULE_IDS.includes(id)) || c.error(`modules.disabled[${index}]`, 'módulo desconhecido'));
    }
    if (Object.hasOwn(modules, 'custom')) {
      const custom = array(c, modules.custom, 'modules.custom', 30);
      if (custom) config.modules.custom = custom.map((id, index) => {
        const valid = slug(c, id, `modules.custom[${index}]`, 40);
        if (valid && MODULE_IDS.includes(valid)) c.error(`modules.custom[${index}]`, 'use um identificador diferente dos módulos do Core');
        return valid;
      });
    }
  }
  const branding = Object.hasOwn(raw, 'branding') ? object(c, raw.branding, 'branding', ['theme', 'useBaseIdentity']) : {};
  if (branding) config.branding = {
    theme: Object.hasOwn(branding, 'theme') ? oneOf(c, branding.theme, 'branding.theme', THEMES) : 'dark',
    useBaseIdentity: Object.hasOwn(branding, 'useBaseIdentity') ? branding.useBaseIdentity === true : true,
  };
  const ai = Object.hasOwn(raw, 'ai') ? object(c, raw.ai, 'ai', ['provider', 'externalContext']) : {};
  if (ai) {
    config.ai = {
      provider: Object.hasOwn(ai, 'provider') ? oneOf(c, ai.provider, 'ai.provider', AI_PROVIDERS) : 'local',
      externalContext: Object.hasOwn(ai, 'externalContext') ? ai.externalContext === true : false,
    };
    if (['claude-cli', 'codex-cli'].includes(config.ai.provider) && !config.ai.externalContext) c.error('ai.externalContext', 'provedores externos exigem autorização explícita de envio de contexto (externalContext: true)');
  }
  const security = Object.hasOwn(raw, 'security') ? object(c, raw.security, 'security', ['sessionHours', 'idleMinutes']) : {};
  if (security) {
    const hours = Object.hasOwn(security, 'sessionHours') ? security.sessionHours : 12;
    const idle = Object.hasOwn(security, 'idleMinutes') ? security.idleMinutes : 120;
    config.security = {
      sessionHours: Number.isInteger(hours) && hours >= 1 && hours <= 720 ? hours : c.error('security.sessionHours', 'use de 1 a 720 horas'),
      idleMinutes: Number.isInteger(idle) && idle >= 5 && idle <= 1440 ? idle : c.error('security.idleMinutes', 'use de 5 a 1440 minutos'),
    };
  }
  const agent = Object.hasOwn(raw, 'agent') ? object(c, raw.agent, 'agent', ['hubUrl', 'intervalSeconds']) : {};
  if (agent) {
    const interval = Object.hasOwn(agent, 'intervalSeconds') ? agent.intervalSeconds : 15;
    config.agent = {
      hubUrl: Object.hasOwn(agent, 'hubUrl') ? url(c, agent.hubUrl, 'agent.hubUrl') : null,
      intervalSeconds: Number.isInteger(interval) && interval >= 2 && interval <= 3600 ? interval : c.error('agent.intervalSeconds', 'use de 2 a 3600 segundos'),
    };
  }
  return result(c, config);
}

/**
 * Valida o arquivo raiz de uma instância (`workfoli.instance.json`).
 * @param {unknown} input
 */
export function validateInstanceFile(input) {
  const c = new Collector();
  const raw = object(c, input, '', ['$schema', 'format', 'schemaVersion', 'instanceId', 'company', 'createdAt', 'core', 'layout'], ['format', 'schemaVersion', 'instanceId', 'company', 'core', 'layout']);
  if (!raw) return result(c, undefined);
  if (raw.format !== INSTANCE_FORMAT) c.error('format', `precisa ser "${INSTANCE_FORMAT}"`);
  if (raw.schemaVersion !== INSTANCE_SCHEMA_VERSION) c.error('schemaVersion', 'versão não suportada');
  const instance = { format: INSTANCE_FORMAT, schemaVersion: INSTANCE_SCHEMA_VERSION, instanceId: uuid(c, raw.instanceId, 'instanceId') };
  const company = object(c, raw.company, 'company', ['name', 'slug'], ['name', 'slug']);
  if (company) instance.company = { name: text(c, company.name, 'company.name'), slug: slug(c, company.slug, 'company.slug', 48) };
  if (Object.hasOwn(raw, 'createdAt')) instance.createdAt = dateTime(c, raw.createdAt, 'createdAt');
  const core = object(c, raw.core, 'core', ['version'], ['version']);
  if (core) instance.core = { version: typeof core.version === 'string' && SEMVER.test(core.version) ? core.version : c.error('core.version', 'use versão semântica') };
  const layout = object(c, raw.layout, 'layout', ['base', 'hub', 'data', 'files', 'secrets'], ['base', 'hub', 'data', 'files', 'secrets']);
  if (layout) {
    instance.layout = {};
    for (const key of ['base', 'hub', 'data', 'files', 'secrets']) {
      const value = layout[key];
      // Caminhos relativos à pasta da instância; a Base também pode estar em outro lugar (caminho absoluto).
      if (key === 'base' && typeof value === 'string' && (/^[a-z]:[\\/]/i.test(value) || value.startsWith('/')) && !CONTROL_SINGLE_LINE.test(value) && value.length <= 1024) instance.layout[key] = value;
      else instance.layout[key] = relativePath(c, value, `layout.${key}`);
    }
    const values = Object.values(instance.layout).filter(value => typeof value === 'string').map(value => value.toLowerCase());
    if (new Set(values).size !== values.length) c.error('layout', 'cada camada precisa de uma pasta própria');
  }
  return result(c, instance);
}

/** Formata erros para leitura humana (CLI e scripts). */
export function formatIssues(issues) {
  return issues.map(issue => `- ${issue.path || '(raiz)'}: ${issue.message}`).join('\n');
}
