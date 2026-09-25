import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import {
  HUB_CONFIG_FILE, HUB_FORMAT, HUB_SCHEMA_VERSION, INSTANCE_FILE, INSTANCE_FORMAT, INSTANCE_SCHEMA_VERSION,
  formatIssues, validateHubConfig, validateInstanceFile,
} from '../contract/workfoli-contract.mjs';
import type { BaseManifest, HubConfig, HubMode, InstanceFile } from '../contract/workfoli-contract.mjs';
import { resolveModules } from '../core/modules.js';
import { audit } from '../hub/audit.js';
import { getMeta, now, openHubDatabase, setMeta } from '../hub/db.js';
import { applyRolePresets, diffRolePresets, ensureOwner, seedRoles } from '../hub/users.js';
import { readBaseManifest } from './base.js';
import { InstanceError, assertRealPath, copyTree, isInside, readJsonFile, samePath, writeFileAtomic, writeJsonAtomic } from './fsutil.js';
import { HUB_ROOT, baseTemplateDir, coreVersion, hubTemplateDir } from './templates.js';

export interface InstancePaths { root: string; base: string; hub: string; data: string; files: string; secrets: string; }
export interface LoadedInstance {
  dir: string; file: InstanceFile; paths: InstancePaths; hubConfig: HubConfig; hubConfigPath: string; dbPath: string;
}

export const DB_FILE = 'hub.sqlite';
const DEFAULT_LAYOUT = { base: 'base', hub: 'hub', data: 'data', files: 'files', secrets: 'secrets' } as const;

function resolveLayout(dir: string, layout: InstanceFile['layout']): InstancePaths {
  const at = (value: string) => path.isAbsolute(value) || /^[a-z]:[\\/]/i.test(value) ? path.resolve(value) : path.resolve(dir, value);
  const paths = { root: dir, base: at(layout.base), hub: at(layout.hub), data: at(layout.data), files: at(layout.files), secrets: at(layout.secrets) };
  // Camadas privadas nunca podem ficar dentro da Base versionável (nem a Base dentro delas).
  for (const key of ['data', 'files', 'secrets'] as const) {
    if (isInside(paths[key], paths.base) || isInside(paths.base, paths[key])) throw new InstanceError(`A camada "${key}" não pode ficar dentro da Base (nem o contrário).`);
    if (!isInside(paths[key], dir)) throw new InstanceError(`A camada "${key}" precisa ficar dentro da pasta da instância.`);
  }
  return paths;
}

/** Carrega e valida uma instância existente (sem abrir o banco). */
export function loadInstance(instanceDir: string): LoadedInstance {
  const dir = path.resolve(instanceDir);
  const file = path.join(dir, INSTANCE_FILE);
  if (!fs.existsSync(file)) throw new InstanceError(`Instância não encontrada em ${dir} (falta ${INSTANCE_FILE}).`);
  assertRealPath(dir);
  const instance = validateInstanceFile(readJsonFile(file));
  if (!instance.ok || !instance.value) throw new InstanceError(`${INSTANCE_FILE} inválido:\n${formatIssues(instance.errors)}`);
  const paths = resolveLayout(dir, instance.value.layout);
  const hubConfigPath = path.join(paths.hub, HUB_CONFIG_FILE);
  if (!fs.existsSync(hubConfigPath)) throw new InstanceError(`Configuração do Hub não encontrada (${HUB_CONFIG_FILE}).`);
  const hub = validateHubConfig(readJsonFile(hubConfigPath));
  if (!hub.ok || !hub.value) throw new InstanceError(`${HUB_CONFIG_FILE} inválido:\n${formatIssues(hub.errors)}`);
  return { dir, file: instance.value, paths, hubConfig: hub.value, hubConfigPath, dbPath: path.join(paths.data, DB_FILE) };
}

export interface InstallOptions { instanceDir: string; baseDir?: string; mode?: HubMode; port?: number; host?: string; ownerName?: string; }
export interface InstallResult {
  status: 'installed' | 'exists'; dir: string; url: string; activationToken: string | null;
  manifest: BaseManifest; modules: { active: string[]; planned: string[] }; rolesAdded: string[];
}

function assertOutsideTemplates(dir: string): void {
  if (isInside(dir, HUB_ROOT)) throw new InstanceError('Instâncias não podem ficar dentro do repositório do Hub (template canônico).');
  try {
    const template = baseTemplateDir();
    if (isInside(dir, template) || isInside(template, dir)) throw new InstanceError('Instâncias não podem ficar dentro do template da Base.');
  } catch (error) { if (!(error instanceof InstanceError) || /dentro/.test(error.message)) throw error; }
}

/**
 * Instala o Hub sobre uma Base já estruturada. Idempotente: se a instância existe, nada é sobrescrito
 * (use `syncHub`). A empresa, módulos, papéis e identidade vêm do contrato da Base.
 */
export function installHub(options: InstallOptions): InstallResult {
  const dir = path.resolve(options.instanceDir);
  assertOutsideTemplates(dir);
  const baseDir = path.resolve(options.baseDir ?? path.join(dir, DEFAULT_LAYOUT.base));
  const { manifest } = readBaseManifest(baseDir, 'active');
  const instanceFile = path.join(dir, INSTANCE_FILE);
  if (fs.existsSync(instanceFile)) {
    const loaded = loadInstance(dir);
    if (!samePath(loaded.paths.base, baseDir)) throw new InstanceError('Esta instância já está ligada a outra Base. Nada foi alterado.');
    const modules = resolveModules(manifest.modules.enabled, loaded.hubConfig.modules.disabled, manifest.modules.order);
    return { status: 'exists', dir, url: hubUrl(loaded.hubConfig), activationToken: null, manifest, modules: { active: modules.active.map(item => item.id), planned: modules.planned.map(item => item.id) }, rolesAdded: [] };
  }
  const relativeBase = isInside(baseDir, dir) ? path.relative(dir, baseDir).split(path.sep).join('/') : baseDir;
  const layout = { ...DEFAULT_LAYOUT, base: relativeBase };
  const paths = resolveLayout(dir, layout);
  for (const key of ['hub', 'data', 'files', 'secrets'] as const) {
    if (fs.existsSync(paths[key]) && fs.readdirSync(paths[key]).length) throw new InstanceError(`A pasta ${key}/ já existe e não está vazia. Nada foi alterado.`);
  }
  const hubConfig: HubConfig = {
    format: HUB_FORMAT, schemaVersion: HUB_SCHEMA_VERSION, hubId: randomUUID(), mode: options.mode ?? 'local',
    server: { host: options.host ?? '127.0.0.1', port: options.port ?? 4870, publicUrl: null },
    modules: { disabled: [], custom: [] },
    branding: { theme: 'dark', useBaseIdentity: true },
    ai: { provider: 'local', externalContext: false },
    security: { sessionHours: 12, idleMinutes: 120 },
    agent: { hubUrl: null, intervalSeconds: 15 },
  };
  const validated = validateHubConfig(hubConfig);
  if (!validated.ok) throw new InstanceError(`Configuração inicial inválida:\n${formatIssues(validated.errors)}`);
  const instance: InstanceFile = {
    format: INSTANCE_FORMAT, schemaVersion: INSTANCE_SCHEMA_VERSION, instanceId: randomUUID(),
    company: { name: manifest.company.name, slug: manifest.company.slug }, createdAt: now(), core: { version: coreVersion() }, layout,
  };
  const instanceCheck = validateInstanceFile(instance);
  if (!instanceCheck.ok) throw new InstanceError(`Instância inválida:\n${formatIssues(instanceCheck.errors)}`);

  fs.mkdirSync(paths.hub, { recursive: true });
  copyTree(hubTemplateDir(), paths.hub, (_relative, entry) => entry.isDirectory() || !/^\.env/.test(entry.name));
  writeJsonAtomic(path.join(paths.hub, HUB_CONFIG_FILE), { $schema: path.relative(paths.hub, path.join(HUB_ROOT, 'packages', 'contract', 'schemas', 'workfoli.hub.schema.json')).split(path.sep).join('/'), ...hubConfig });
  for (const key of ['data', 'files', 'secrets'] as const) fs.mkdirSync(paths[key], { recursive: true });
  writeFileAtomic(path.join(paths.secrets, 'README.md'), '# Segredos da instância\n\nValores de credenciais desta empresa (`secrets.env`). Nunca versionar, nunca copiar para a Base.\nUse `workfoli secrets set <instância> NOME` para gravar um valor sem exibi-lo.\n');
  writeFileAtomic(path.join(dir, '.gitignore'), '# Camadas privadas da instância: nunca versionar.\ndata/\nfiles/\nsecrets/\n*.sqlite*\n');
  writeFileAtomic(path.join(dir, 'README.md'), instanceReadme(manifest.company.name, relativeBase));
  writeJsonAtomic(instanceFile, instance);

  const db = openHubDatabase(path.join(paths.data, DB_FILE), { create: true });
  try {
    setMeta(db, 'instanceId', instance.instanceId);
    setMeta(db, 'hubId', hubConfig.hubId);
    setMeta(db, 'createdAt', instance.createdAt ?? now());
    const { added } = seedRoles(db, manifest.roles);
    const owner = ensureOwner(db, { name: options.ownerName ?? 'Proprietário' });
    audit(db, { type: 'system', id: null }, 'hub.installed', instance.instanceId, { company: manifest.company.slug, mode: hubConfig.mode, core: instance.core.version });
    const modules = resolveModules(manifest.modules.enabled, [], manifest.modules.order);
    return {
      status: 'installed', dir, url: hubUrl(hubConfig), activationToken: owner.token, manifest,
      modules: { active: modules.active.map(item => item.id), planned: modules.planned.map(item => item.id) }, rolesAdded: added,
    };
  } finally { db.close(); }
}

export function hubUrl(config: HubConfig): string {
  if (config.server.publicUrl) return config.server.publicUrl.replace(/\/$/, '');
  const host = config.server.host === '0.0.0.0' ? '127.0.0.1' : config.server.host;
  return `http://${host.includes(':') ? `[${host}]` : host}:${config.server.port}`;
}

function instanceReadme(company: string, base: string): string {
  return `# Instância Workfoli — ${company}

Instalação privada e isolada desta empresa (single-tenant). Não é template.

| Pasta | Camada | Git |
|---|---|---|
| \`${base}/\` | Base versionável (contexto, identidade, processos, projetos) | repositório próprio da empresa |
| \`hub/\` | Configuração do Hub e módulos customizados | versionável (sem segredos) |
| \`data/\` | Dados operacionais (banco do Hub, journal, backups) | nunca |
| \`files/\` | Arquivos privados | nunca |
| \`secrets/\` | Credenciais desta empresa | nunca |

Comandos úteis (na pasta do Workfoli Hub): \`workfoli doctor <esta pasta>\`, \`workfoli hub start <esta pasta>\`, \`workfoli hub sync <esta pasta>\`.
`;
}

export interface SyncReport {
  manifest: BaseManifest; baseHashChanged: boolean;
  company: { before: string; after: string } | null;
  modules: { active: string[]; planned: string[] };
  roles: Array<{ id: string; change: 'new' | 'changed'; permissions: string[] }>;
  applied: string[];
}

/**
 * Sincroniza a instalação com a Base: dados de exibição são lidos ao vivo; o que concede acesso
 * (papéis sugeridos pela Base) só é aplicado com `apply` — aprovação explícita do operador.
 */
export function syncHub(instanceDir: string, options: { apply?: boolean } = {}): SyncReport {
  const instance = loadInstance(instanceDir);
  const { manifest, hash } = readBaseManifest(instance.paths.base, 'active');
  const db = openHubDatabase(instance.dbPath);
  try {
    const previousHash = getMeta(db, 'base.manifestHash');
    const roles = diffRolePresets(db, manifest.roles);
    const applied: string[] = [];
    let company: SyncReport['company'] = null;
    if (instance.file.company.name !== manifest.company.name || instance.file.company.slug !== manifest.company.slug) {
      company = { before: instance.file.company.name, after: manifest.company.name };
      if (options.apply) {
        writeJsonAtomic(path.join(instance.dir, INSTANCE_FILE), { ...instance.file, company: { name: manifest.company.name, slug: manifest.company.slug } });
        applied.push('company');
      }
    }
    if (options.apply && roles.length) applied.push(...applyRolePresets(db, manifest.roles).map(id => `role:${id}`));
    if (options.apply) {
      setMeta(db, 'base.manifestHash', hash);
      audit(db, { type: 'system', id: null }, 'hub.synced', instance.file.instanceId, { applied: applied.join(',') || 'nada' });
    }
    const modules = resolveModules(manifest.modules.enabled, instance.hubConfig.modules.disabled, manifest.modules.order);
    return {
      manifest, baseHashChanged: previousHash !== hash, company,
      modules: { active: modules.active.map(item => item.id), planned: modules.planned.map(item => item.id) }, roles, applied,
    };
  } finally { db.close(); }
}
