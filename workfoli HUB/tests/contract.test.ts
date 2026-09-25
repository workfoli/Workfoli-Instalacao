import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CRM_AUTOMATION_EVENTS, CRM_CORE_SOURCES, CRM_ENTITIES, CRM_FIELD_TYPES, CRM_LABEL_KEYS, CRM_LEAD_PROVIDERS, CRM_SOURCE_KINDS, CRM_STAGE_KINDS,
  INTEGRATION_PROVIDERS, MODULE_IDS, PROFILES, PROJECT_TYPES, RESERVED_ROLE_IDS, defaultCrmConfig, formatIssues, formatManifest, isSafeRelativePath, looksLikeSecret,
  resolveCrmConfig, slugify, upgradeBaseManifest, validateBaseManifest, validateHubConfig, validateInstanceFile,
} from '../packages/contract/workfoli-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = 'c5dc4932-4195-4b44-b818-347678144da9';

function active(): Record<string, any> {
  return {
    format: 'workfoli-base', schemaVersion: 3, baseId: ID, status: 'active',
    template: { id: 'workfoli-base', version: '3.0.0' },
    company: { name: 'Estúdio Sintético', slug: 'estudio-sintetico', tagline: 'Organização que funciona.', website: 'https://exemplo.test' },
    profile: 'services',
    identity: { guide: 'identidade/design-guide.md', colors: { background: '#151716', accent: '#b8f24a' }, typography: { heading: 'Manrope' }, voice: { method: ['Entender', 'Estruturar'] } },
    context: { memory: '_memoria', identity: 'identidade', tasks: 'tarefas.md', knowledge: ['_memoria', 'processos'] },
    services: [{ id: 'presenca-digital', name: 'Presença Digital', visibility: 'public' }],
    projects: [{ id: 'site', name: 'Site institucional', type: 'website', services: ['presenca-digital'], links: [{ label: 'Site', url: 'https://exemplo.test' }] }],
    modules: { enabled: ['overview', 'crm', 'patients'], settings: { crm: { label: 'Clientes' } } },
    crm: defaultCrmConfig(),
    integrations: [{ id: 'github', provider: 'github', secrets: ['GITHUB_TOKEN'] }],
    assets: [{ id: 'logo', kind: 'logo', path: 'identidade/logo.svg' }],
    resources: [{ id: 'instagram', kind: 'social', label: 'Instagram', url: 'https://instagram.com/exemplo' }],
    roles: [{ id: 'atendimento', name: 'Atendimento', permissions: ['crm:write', 'tasks:write', 'ai:use'] }],
    data: { versionable: ['_memoria', 'identidade'], private: ['dados'] },
  };
}

function template(): Record<string, any> {
  return { ...active(), baseId: null, status: 'template', company: { name: '[Nome da empresa]', slug: 'empresa' } };
}

test('a complete active manifest validates, normalizes and applies defaults', () => {
  const result = validateBaseManifest(active(), { expect: 'active' });
  assert.equal(result.ok, true, formatIssues(result.errors));
  const manifest = result.value!;
  assert.equal(manifest.identity.colors!.accent, '#B8F24A');
  assert.equal(manifest.company.locale, 'pt-BR');
  assert.equal(manifest.company.timezone, 'America/Sao_Paulo');
  assert.equal(manifest.projects[0]!.status, 'active');
  assert.equal(manifest.projects[0]!.visibility, 'internal');
  assert.equal(manifest.services[0]!.status, 'active');
  assert.deepEqual(manifest.modules.enabled, ['overview', 'crm', 'patients']);
});

test('template and active states are distinct and cannot be confused', () => {
  assert.equal(validateBaseManifest(template(), { expect: 'template' }).ok, true);
  const asActive = validateBaseManifest(template(), { expect: 'active' });
  assert.equal(asActive.ok, false);
  assert.match(formatIssues(asActive.errors), /base init/);
  assert.equal(validateBaseManifest({ ...template(), baseId: ID }).ok, false, 'template never carries a Base ID');
  assert.equal(validateBaseManifest({ ...active(), baseId: null }).ok, false, 'active Base needs an ID');
  const placeholder = validateBaseManifest({ ...active(), company: { name: '[Nome da empresa]', slug: 'empresa' } });
  assert.ok(placeholder.errors.some(issue => issue.path === 'company.name'));
});

test('unknown keys, accessors and prototypes are rejected without echoing values', () => {
  const secret = 'value-that-must-not-leak-123456';
  for (const key of ['owner', 'users', 'scripts', 'hooks', 'token', 'permissions']) {
    const result = validateBaseManifest({ ...active(), [key]: secret });
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result.errors).includes(secret));
  }
  const withGetter = active();
  Object.defineProperty(withGetter.company, 'name', { enumerable: true, get() { throw new Error('accessor must not run'); } });
  assert.equal(validateBaseManifest(withGetter).ok, false);
  assert.equal(validateBaseManifest(Object.assign(Object.create({ admin: true }), active())).ok, false);
  const polluted = JSON.parse(JSON.stringify(active()).replace('"format":', '"__proto__":{"admin":true},"format":'));
  assert.equal(validateBaseManifest(polluted).ok, false);
  const control = validateBaseManifest({ ...active(), ['bad\u0000key']: 1 });
  assert.ok(control.errors.every(issue => !issue.path.includes('\u0000')));
});

test('credentials are refused anywhere in the manifest, including URLs and secret references', () => {
  const token = ['ghp', '_', 'A'.repeat(36)].join('');
  assert.equal(looksLikeSecret(token), true);
  assert.equal(looksLikeSecret('Usamos token: OAuth com escopo mínimo'), false);
  const cases = [
    { ...active(), company: { ...active().company, description: `Chave ${token}` } },
    { ...active(), company: { ...active().company, website: 'https://user:pass@exemplo.test' } },
    { ...active(), company: { ...active().company, website: 'https://exemplo.test/?access_token=abc123456789' } },
    { ...active(), integrations: [{ id: 'github', provider: 'github', secrets: [token] }] },
    { ...active(), integrations: [{ id: 'github', provider: 'github', secrets: ['github_token'] }] },
  ];
  for (const input of cases) {
    const result = validateBaseManifest(input);
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes(token));
  }
});

test('paths reject traversal, absolute names, device paths and Windows aliases', () => {
  const unsafe = ['', '/', '.', '..', '../outside', 'docs/../outside', '/tmp/data', 'C:/data', 'C:data', 'docs\\file',
    'docs//file', 'docs/', 'docs/./file', 'CON', 'nul.md', 'COM1', 'docs/name.', ' docs', 'docs/\u202edata', 'docs/*.md',
    'https://example.test', '%2e%2e/data', 'a'.repeat(256)];
  for (const value of unsafe) {
    assert.equal(isSafeRelativePath(value), false, value);
    assert.equal(validateBaseManifest({ ...active(), context: { ...active().context, memory: value } }).ok, false, value);
  }
  assert.equal(isSafeRelativePath('contexto/ação'), true);
});

test('references and collections are coherent', () => {
  const unknownService = validateBaseManifest({ ...active(), projects: [{ id: 'x', name: 'X', type: 'website', services: ['inexistente'] }] });
  assert.ok(unknownService.errors.some(issue => /services\[0\]/.test(issue.path)));
  const duplicate = validateBaseManifest({ ...active(), services: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }], projects: [] });
  assert.ok(duplicate.errors.some(issue => /identificador repetido/.test(issue.message)));
  assert.equal(validateBaseManifest({ ...active(), modules: { enabled: ['overview', 'overview'] } }).ok, false);
  assert.equal(validateBaseManifest({ ...active(), modules: { enabled: ['remote-plugin'] } }).ok, false);
  assert.equal(validateBaseManifest({ ...active(), projects: [{ id: 'x', name: 'X', type: 'spaceship' }] }).ok, false);
  const conflict = validateBaseManifest({ ...active(), data: { versionable: ['dados'], private: ['dados'] } });
  assert.equal(conflict.ok, false);
  const exposed = validateBaseManifest({ ...active(), context: { ...active().context, knowledge: ['dados/clientes'] } });
  assert.ok(exposed.errors.some(issue => issue.path === 'context'));
});

test('role presets from the Base never grant administration', () => {
  for (const permission of ['users:admin', 'settings:write', 'crm:*', '*', 'CRM:read', 'crm']) {
    assert.equal(validateBaseManifest({ ...active(), roles: [{ id: 'r', name: 'R', permissions: [permission] }] }).ok, false, permission);
  }
  for (const id of RESERVED_ROLE_IDS) {
    assert.equal(validateBaseManifest({ ...active(), roles: [{ id, name: 'X', permissions: ['crm:read'] }] }).ok, false, id);
  }
  assert.ok(RESERVED_ROLE_IDS.includes('manager'), 'the Workfoli manager role is reserved for the Hub');
});

test('v1 manifests are upgraded with a warning and newer versions ask for a Core update', () => {
  const v1 = { format: 'workfoli-base', schemaVersion: 1, baseId: ID, company: { name: 'Empresa' }, profile: 'agency', modules: ['files'], paths: { memory: 'm', identity: 'i' } };
  const upgraded = validateBaseManifest(v1);
  assert.equal(upgraded.ok, true, formatIssues(upgraded.errors));
  assert.equal(upgraded.warnings.length, 1);
  assert.equal(upgraded.value!.schemaVersion, 3);
  assert.deepEqual(upgraded.value!.modules.enabled, ['overview', 'files']);
  assert.equal(upgraded.value!.crm, undefined, 'no CRM section is invented for a Base without CRM');
  const future = validateBaseManifest({ ...active(), schemaVersion: 4 });
  assert.match(formatIssues(future.errors), /mais nova/);
});

function v2(): Record<string, any> {
  const { crm: _crm, ...rest } = active();
  return { ...rest, schemaVersion: 2, modules: { enabled: ['overview', 'crm'], settings: { crm: { label: 'Clientes', entityLabel: 'Cliente', stages: ['Contato', 'Proposta', 'Ganho'] }, tasks: { label: 'Pendências', stages: ['A'] } } } };
}

test('v2 manifests are validated as v2 and converted: CRM stages and labels move to the crm section', () => {
  const result = validateBaseManifest(v2());
  assert.equal(result.ok, true, formatIssues(result.errors));
  const manifest = result.value!;
  assert.equal(manifest.schemaVersion, 3);
  assert.deepEqual(manifest.modules.settings, { crm: { label: 'Clientes' }, tasks: { label: 'Pendências' } });
  assert.equal(manifest.crm!.enabled, true);
  assert.deepEqual(manifest.crm!.labels, { contact: 'Cliente', contacts: 'Clientes' });
  const stages = manifest.crm!.pipelines[0]!.stages;
  assert.deepEqual(stages.map(stage => [stage.id, stage.kind]), [['contato', 'open'], ['proposta', 'open'], ['ganho-2', 'open'], ['ganho', 'won'], ['perdido', 'lost']]);
  assert.ok(result.warnings.some(issue => /convertido para v3/.test(issue.message)));
  assert.ok(result.warnings.some(issue => issue.path === 'modules.settings.tasks'), 'dropped keys are reported, never silently discarded');
  assert.ok(result.warnings.some(issue => issue.path === 'crm.pipelines'));
  // Invalid v2 input is reported in v2 terms, before any conversion.
  const invalid = validateBaseManifest({ ...v2(), modules: { enabled: ['overview'], settings: { crm: { stages: 'Contato' } } } });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some(issue => issue.path === 'modules.settings.crm.stages'));
  // A v2-only key is refused in v3, and v3-only keys are refused in v2.
  assert.equal(validateBaseManifest({ ...active(), modules: { enabled: ['overview', 'crm'], settings: { crm: { stages: ['A'] } } } }).ok, false);
  assert.equal(validateBaseManifest({ ...v2(), crm: defaultCrmConfig() }).ok, false);
  const upgraded = upgradeBaseManifest(v2()) as Record<string, any>;
  assert.equal(upgraded.schemaVersion, 3);
  assert.equal(validateBaseManifest(upgraded).ok, true);
});

test('crm section: pipelines need one won, one lost and open stages; defaults are normalized', () => {
  const withPipelines = (pipelines: unknown) => validateBaseManifest({ ...active(), crm: { ...defaultCrmConfig(), pipelines } });
  const stage = (id: string, kind: string) => ({ id, name: id, kind });
  assert.equal(withPipelines([{ id: 'a', name: 'A', stages: [stage('x', 'open'), stage('g', 'won'), stage('p', 'lost')] }]).ok, true);
  assert.equal(withPipelines([{ id: 'a', name: 'A', stages: [stage('x', 'open'), stage('g', 'won'), stage('h', 'won'), stage('p', 'lost')] }]).ok, false);
  assert.equal(withPipelines([{ id: 'a', name: 'A', stages: [stage('x', 'open'), stage('g', 'won')] }]).ok, false);
  assert.equal(withPipelines([{ id: 'a', name: 'A', stages: [stage('g', 'won'), stage('p', 'lost'), stage('q', 'won')] }]).ok, false);
  assert.equal(withPipelines([{ id: 'a', name: 'A', stages: [stage('x', 'open'), stage('x', 'open'), stage('g', 'won'), stage('p', 'lost')] }]).ok, false);
  assert.equal(withPipelines([]).ok, false, 'an enabled CRM needs a pipeline');
  const two = withPipelines([
    { id: 'a', name: 'A', stages: [stage('x', 'open'), stage('g', 'won'), stage('p', 'lost')] },
    { id: 'b', name: 'B', stages: [stage('x', 'open'), stage('g', 'won'), stage('p', 'lost')] },
  ]);
  assert.equal(two.ok, true, formatIssues(two.errors));
  assert.deepEqual(two.value!.crm!.pipelines.map(pipeline => pipeline.default), [true, false]);
  const bothDefault = withPipelines([
    { id: 'a', name: 'A', default: true, stages: [stage('x', 'open'), stage('g', 'won'), stage('p', 'lost')] },
    { id: 'b', name: 'B', default: true, stages: [stage('x', 'open'), stage('g', 'won'), stage('p', 'lost')] },
  ]);
  assert.equal(bothDefault.ok, false);
  const probability = withPipelines([{ id: 'a', name: 'A', stages: [{ ...stage('x', 'open'), probability: 101 }, stage('g', 'won'), stage('p', 'lost')] }]);
  assert.equal(probability.ok, false);
});

test('crm section: custom fields, required fields, sources, automations and integrations are cross-checked', () => {
  const crm = (patch: Record<string, unknown>) => validateBaseManifest({ ...active(), crm: { ...defaultCrmConfig(), ...patch } });
  const pipeline = (requiredFields: string[]) => [{ id: 'vendas', name: 'Vendas', stages: [{ id: 'aberta', name: 'Aberta', kind: 'open', requiredFields }, { id: 'ganho', name: 'Ganho', kind: 'won' }, { id: 'perdido', name: 'Perdido', kind: 'lost' }] }];
  const interest = { id: 'servico', entity: 'opportunity', label: 'Serviço de interesse', type: 'select', options: ['Site', 'Sistema'] };
  assert.equal(crm({ customFields: [interest], pipelines: pipeline(['value', 'custom.servico']) }).ok, true);
  assert.equal(crm({ customFields: [], pipelines: pipeline(['custom.servico']) }).ok, false, 'required custom field must exist');
  assert.equal(crm({ pipelines: pipeline(['cpf']) }).ok, false);
  assert.equal(crm({ customFields: [{ ...interest, options: [] }] }).ok, false);
  assert.equal(crm({ customFields: [{ ...interest, type: 'text' }] }).ok, false, 'only select fields carry options');
  assert.equal(crm({ customFields: [interest, { ...interest, label: 'Outro' }] }).ok, false);
  assert.equal(crm({ customFields: [interest, { ...interest, entity: 'contact' }] }).ok, true, 'ids are unique per entity');
  assert.equal(crm({ customFields: [{ ...interest, entity: 'patient' }] }).ok, false);
  assert.equal(crm({ sources: [{ id: 'feira', label: 'Feira', kind: 'event' }] }).ok, true);
  assert.equal(crm({ sources: [{ id: 'google-ads', label: 'Outro', kind: 'paid' }] }).ok, false, 'core sources cannot be redefined');
  const automation = (when: Record<string, unknown>) => ({ automations: [{ id: 'a', name: 'A', when, actions: [{ type: 'create_task', title: 'Ligar' }] }] });
  const valid = crm(automation({ event: 'stage_entered', pipeline: 'vendas', stage: 'proposta' }));
  assert.equal(valid.ok, true, formatIssues(valid.errors));
  assert.deepEqual(valid.value!.crm!.automations[0]!.actions[0], { type: 'create_task', title: 'Ligar', dueInDays: 1, assignTo: 'owner' });
  assert.equal(crm(automation({ event: 'stage_entered', pipeline: 'vendas', stage: 'inexistente' })).ok, false);
  assert.equal(crm(automation({ event: 'deal_won', pipeline: 'outro' })).ok, false);
  assert.equal(crm({ automations: [{ id: 'a', name: 'A', when: { event: 'lead_created' }, actions: [{ type: 'run_script', title: 'x' }] }] }).ok, false);
  assert.equal(crm({ automations: [{ id: 'a', name: 'A', when: { event: 'lead_created' }, actions: [] }] }).ok, false);
  assert.equal(crm({ integrations: [{ provider: 'meta', leads: true, source: 'meta-ads', pipeline: 'vendas' }] }).ok, true);
  assert.equal(crm({ integrations: [{ provider: 'meta', leads: true, source: 'desconhecida' }] }).ok, false);
  assert.equal(crm({ integrations: [{ provider: 'meta', leads: true, source: 'meta-ads', pipeline: 'outro' }] }).ok, false);
  assert.equal(crm({ integrations: [{ provider: 'meta', leads: true, source: 'meta-ads', token: 'x' }] }).ok, false, 'connections never live in the Base');
  assert.equal(crm({ labels: { contact: 'Paciente', patient: 'X' } }).ok, false);
  assert.equal(crm({ currency: 'real' }).ok, false);
  assert.equal(crm({ lostReasons: ['Preço', 'Preço'] }).ok, false);
});

test('crm.enabled must agree with modules.enabled, and a Base without the section gets the generic default', () => {
  assert.equal(validateBaseManifest({ ...active(), crm: { ...defaultCrmConfig(), enabled: false } }).ok, false);
  const { crm: _crm, ...withoutCrm } = active();
  const result = validateBaseManifest(withoutCrm);
  assert.equal(result.ok, true, formatIssues(result.errors));
  const config = resolveCrmConfig(result.value!);
  assert.equal(config.enabled, true);
  assert.deepEqual(config.pipelines[0]!.stages.map(stage => stage.name), ['Novo lead', 'Contato realizado', 'Qualificado', 'Proposta', 'Negociação', 'Ganho', 'Perdido']);
  assert.equal(resolveCrmConfig({ modules: { enabled: ['overview'] } }).enabled, false);
  // The default is fully editable and never shares state between calls.
  const first = defaultCrmConfig();
  first.pipelines[0]!.stages.pop();
  assert.equal(defaultCrmConfig().pipelines[0]!.stages.length, 7);
});

test('hub configuration requires explicit consent for external AI and safe server settings', () => {
  const base = { format: 'workfoli-hub', schemaVersion: 1, hubId: ID, mode: 'local' };
  const ok = validateHubConfig(base);
  assert.equal(ok.ok, true, formatIssues(ok.errors));
  assert.deepEqual(ok.value!.server, { host: '127.0.0.1', port: 4870, publicUrl: null });
  assert.equal(ok.value!.ai.provider, 'local');
  assert.equal(ok.value!.branding.theme, 'dark');
  assert.equal(validateHubConfig({ ...base, ai: { provider: 'claude-cli' } }).ok, false);
  assert.equal(validateHubConfig({ ...base, ai: { provider: 'claude-cli', externalContext: true } }).ok, true);
  assert.equal(validateHubConfig({ ...base, server: { port: 80 } }).ok, false);
  assert.equal(validateHubConfig({ ...base, server: { host: 'example.com' } }).ok, false);
  assert.equal(validateHubConfig({ ...base, server: { host: '0.0.0.0' } }).warnings.length, 1);
  assert.equal(validateHubConfig({ ...base, modules: { custom: ['crm'] } }).ok, false, 'custom modules cannot shadow Core modules');
  assert.equal(validateHubConfig({ ...base, mode: 'cloud' }).ok, false);
  assert.equal(validateHubConfig({ ...base, password: 'x' }).ok, false);
});

test('instance file keeps each data layer in its own folder', () => {
  const instance = { format: 'workfoli-instance', schemaVersion: 1, instanceId: ID, company: { name: 'Empresa', slug: 'empresa' }, core: { version: '0.3.0' }, layout: { base: 'base', hub: 'hub', data: 'data', files: 'files', secrets: 'secrets' } };
  assert.equal(validateInstanceFile(instance).ok, true);
  assert.equal(validateInstanceFile({ ...instance, layout: { ...instance.layout, base: 'C:\\Bases\\empresa' } }).ok, true);
  assert.equal(validateInstanceFile({ ...instance, layout: { ...instance.layout, data: 'base' } }).ok, false);
  assert.equal(validateInstanceFile({ ...instance, layout: { ...instance.layout, secrets: '../fora' } }).ok, false);
});

test('slugify produces stable identifiers from Portuguese names', () => {
  assert.equal(slugify('Clínica São João & Cia.'), 'clinica-sao-joao-cia');
  assert.equal(slugify('  '), '');
  assert.equal(slugify('A'.repeat(80)).length, 48);
});

test('manifests are formatted for people: short objects on one line, same data after parsing', () => {
  const manifest = validateBaseManifest(active()).value!;
  const text = formatManifest(manifest);
  assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(manifest)), 'formatting never changes the data');
  assert.match(text, /\n {10}\{ "id": "proposta", "name": "Proposta", "kind": "open", "probability": 60, "requiredFields": \["value"\] \},?\n/);
  assert.ok(text.endsWith('}\n'));
  assert.equal(formatManifest({ a: 'x"y\\z', b: [] }), '{ "a": "x\\"y\\\\z", "b": [] }\n', 'strings are escaped exactly as JSON');
});

test('JSON Schema enums stay aligned with the validator constants', () => {
  const schema = JSON.parse(readFileSync(path.join(root, 'packages/contract/schemas/workfoli.base.schema.json'), 'utf8'));
  assert.deepEqual(schema.$defs.moduleId.enum, [...MODULE_IDS]);
  assert.deepEqual(schema.properties.profile.enum, [...PROFILES]);
  assert.deepEqual(schema.properties.projects.items.properties.type.enum, [...PROJECT_TYPES]);
  assert.deepEqual(schema.properties.integrations.items.properties.provider.enum, [...INTEGRATION_PROVIDERS]);
  const crm = schema.properties.crm.properties;
  assert.deepEqual(crm.labels.propertyNames.enum, [...CRM_LABEL_KEYS]);
  assert.deepEqual(crm.pipelines.items.properties.stages.items.properties.kind.enum, [...CRM_STAGE_KINDS]);
  assert.deepEqual(crm.customFields.items.properties.entity.enum, [...CRM_ENTITIES]);
  assert.deepEqual(crm.customFields.items.properties.type.enum, [...CRM_FIELD_TYPES]);
  assert.deepEqual(crm.sources.items.properties.kind.enum, [...CRM_SOURCE_KINDS]);
  assert.deepEqual(crm.automations.items.properties.when.properties.event.enum, [...CRM_AUTOMATION_EVENTS]);
  assert.deepEqual(crm.integrations.items.properties.provider.enum, [...CRM_LEAD_PROVIDERS]);
  for (const source of CRM_CORE_SOURCES) assert.ok(crm.sources.description.includes(source.id), source.id);
  assert.deepEqual(schema.properties.roles.items.properties.id.not.enum, [...RESERVED_ROLE_IDS]);
});
