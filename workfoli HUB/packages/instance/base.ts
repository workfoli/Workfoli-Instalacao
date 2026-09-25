import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import {
  BASE_MANIFEST_FILE, PROFILES, formatIssues, formatManifest, slugify, validateBaseManifest,
} from '../contract/workfoli-contract.mjs';
import type { BaseManifest, Issue, Profile } from '../contract/workfoli-contract.mjs';
import { detectSensitivity } from '../core/sensitivity.js';
import {
  InstanceError, assertRealPath, copyTree, isEmptyDir, isInside, listFiles, readJsonFile, sha256, sha256File, writeFileAtomic, writeJsonAtomic,
} from './fsutil.js';
import { HUB_ROOT, baseTemplateDir } from './templates.js';

export const LOCK_FILE = '.workfoli/template.lock.json';
const UPGRADE_DIR = '.workfoli/upgrade';

/** O que nunca sai do template para uma Base nova (ou para uma atualização). */
function templateFilter(relative: string, entry: fs.Dirent): boolean {
  const lower = relative.toLowerCase();
  const name = entry.name.toLowerCase();
  if (entry.isDirectory()) return !['.git', 'node_modules', '.workfoli'].includes(name);
  if (/^\.env(?:\.|$)/.test(name) && name !== '.env.example') return false;
  if (name.endsWith('.log') || name.endsWith('.tmp')) return false;
  // Pastas de entrada/saída levam só o README do template.
  if (/^(?:dados|saidas)\//.test(lower) && !/^(?:dados|saidas)\/readme\.md$/.test(lower)) return false;
  return true;
}

export interface LoadedManifest { manifest: BaseManifest; hash: string; warnings: Issue[]; }

export function manifestPath(baseDir: string): string {
  return path.join(baseDir, BASE_MANIFEST_FILE);
}

export function readBaseManifest(baseDir: string, expect: 'active' | 'template' | 'any' = 'active'): LoadedManifest {
  const file = manifestPath(baseDir);
  if (!fs.existsSync(file)) throw new InstanceError(`Esta pasta não é uma Base Workfoli (falta ${BASE_MANIFEST_FILE}).`);
  assertRealPath(file);
  const bytes = fs.readFileSync(file);
  const result = validateBaseManifest(readJsonFile(file), { expect });
  if (!result.ok || !result.value) throw new InstanceError(`Manifesto da Base inválido:\n${formatIssues(result.errors)}`);
  return { manifest: result.value, hash: sha256(bytes), warnings: result.warnings };
}

/** Grava o manifesto validado, preservando `$schema`. Nunca grava um manifesto inválido. */
export function writeBaseManifest(baseDir: string, manifest: BaseManifest, options: { expectedHash?: string } = {}): string {
  const file = manifestPath(baseDir);
  if (options.expectedHash && fs.existsSync(file) && sha256File(file) !== options.expectedHash) {
    throw new InstanceError('O manifesto da Base mudou desde a leitura. Recarregue antes de salvar.');
  }
  const next = { $schema: './schemas/workfoli.base.schema.json', ...manifest, updatedAt: new Date().toISOString() };
  const result = validateBaseManifest(next, { expect: manifest.status });
  if (!result.ok) throw new InstanceError(`Alteração recusada; o manifesto ficaria inválido:\n${formatIssues(result.errors)}`);
  const text = formatManifest(next);
  writeFileAtomic(file, text);
  return sha256(text);
}

export interface InitBaseOptions {
  dir: string; name: string; slug?: string; profile?: Profile; template?: string; git?: boolean;
  segment?: string; description?: string;
}
export interface InitBaseResult { dir: string; manifest: BaseManifest; files: number; git: 'initialized' | 'skipped' | 'unavailable' | 'no-commit'; }

/** Cria a Base de uma empresa a partir do template canônico, sem tocar no template. */
export function initBase(options: InitBaseOptions): InitBaseResult {
  const templateDir = baseTemplateDir(options.template);
  const dir = path.resolve(options.dir);
  if (isInside(dir, templateDir) || isInside(templateDir, dir)) throw new InstanceError('A Base da empresa não pode ficar dentro do template (nem o contrário).');
  if (isInside(dir, HUB_ROOT)) throw new InstanceError('A Base da empresa não pode ficar dentro do repositório do Hub.');
  if (!isEmptyDir(dir)) throw new InstanceError('A pasta de destino precisa estar vazia. Nada foi alterado.');
  for (let parent = path.dirname(dir); parent !== path.dirname(parent); parent = path.dirname(parent)) {
    if (fs.existsSync(manifestPath(parent))) throw new InstanceError('O destino está dentro de outra Base. Cada empresa precisa de uma pasta própria.');
  }
  const name = typeof options.name === 'string' ? options.name.trim() : '';
  if (!name) throw new InstanceError('Informe o nome da empresa (--name).');
  const slug = options.slug ?? slugify(name);
  if (!slug) throw new InstanceError('Não foi possível gerar um identificador a partir do nome; informe --slug.');
  if (options.profile && !PROFILES.includes(options.profile)) throw new InstanceError(`Perfil inválido. Use: ${PROFILES.join(', ')}.`);
  const template = readBaseManifest(templateDir, 'template').manifest;

  fs.mkdirSync(dir, { recursive: true });
  let copied: string[] = [];
  try {
    copied = copyTree(templateDir, dir, templateFilter);
    const stamp = new Date().toISOString();
    const manifest: BaseManifest = {
      ...template,
      baseId: randomUUID(), status: 'active', createdAt: stamp, updatedAt: stamp,
      company: {
        ...template.company, name, slug,
        segment: options.segment ?? template.company.segment ?? null,
        description: options.description ?? null,
      },
      profile: options.profile ?? template.profile,
    };
    writeBaseManifest(dir, manifest);
    const lock = {
      template: template.template ?? { id: 'workfoli-base', version: '0.0.0' },
      createdAt: stamp,
      files: Object.fromEntries(copied.filter(file => file !== BASE_MANIFEST_FILE).map(file => [file, sha256File(path.join(dir, ...file.split('/')))])),
    };
    writeJsonAtomic(path.join(dir, ...LOCK_FILE.split('/')), lock);
    const git = options.git === false ? 'skipped' : initGit(dir, `chore: criar Base ${name} a partir do template Workfoli ${lock.template.version}`);
    return { dir, manifest: readBaseManifest(dir).manifest, files: copied.length, git };
  } catch (error) {
    // Criação atômica do ponto de vista do usuário: uma Base pela metade não fica para trás.
    if (copied.length || fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

function initGit(dir: string, message: string): InitBaseResult['git'] {
  const run = (...args: string[]) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true });
  if (run('--version').status !== 0) return 'unavailable';
  if (run('init', '-q').status !== 0) return 'unavailable';
  run('add', '-A');
  const commit = run('commit', '-q', '-m', message);
  return commit.status === 0 ? 'initialized' : 'no-commit';
}

export interface BaseCheck { ok: boolean; errors: Issue[]; warnings: Issue[]; info: Issue[]; manifest?: BaseManifest; }

const TEXT_EXT = /\.(?:md|txt|json|ya?ml|csv|html?|css|[cm]?[jt]sx?|toml|ini|env|xml|sql)$/i;

/** Validação completa de uma Base no disco: contrato + caminhos + segredos + política de Git. */
export function checkBase(baseDir: string, expect: 'active' | 'template' = 'active'): BaseCheck {
  const check: BaseCheck = { ok: false, errors: [], warnings: [], info: [] };
  const dir = path.resolve(baseDir);
  let loaded: LoadedManifest;
  try { loaded = readBaseManifest(dir, expect); }
  catch (error) { check.errors.push({ path: BASE_MANIFEST_FILE, message: (error as Error).message }); return check; }
  const manifest = loaded.manifest;
  check.manifest = manifest;
  check.warnings.push(...loaded.warnings);
  const exists = (relative: string | null | undefined) => !relative || fs.existsSync(path.join(dir, ...relative.split('/')));
  const referenced: Array<[string, string | null | undefined]> = [
    ['context.memory', manifest.context.memory], ['context.identity', manifest.context.identity], ['context.tasks', manifest.context.tasks],
    ['context.rules', manifest.context.rules], ['identity.guide', manifest.identity.guide], ['identity.logo', manifest.identity.logo], ['identity.symbol', manifest.identity.symbol],
    ...manifest.context.knowledge.map((value, index): [string, string] => [`context.knowledge[${index}]`, value]),
    ...manifest.services.map((service, index): [string, string | null | undefined] => [`services[${index}].path`, service.path]),
    ...manifest.projects.map((project, index): [string, string | null | undefined] => [`projects[${index}].path`, project.path]),
    ...manifest.assets.map((asset, index): [string, string] => [`assets[${index}].path`, asset.path]),
  ];
  for (const [field, value] of referenced) if (!exists(value)) check.warnings.push({ path: field, message: 'caminho declarado não existe na Base' });

  const gitignore = fs.existsSync(path.join(dir, '.gitignore')) ? fs.readFileSync(path.join(dir, '.gitignore'), 'utf8').split(/\r?\n/).map(line => line.trim()) : [];
  for (const privatePath of manifest.data.private) {
    const covered = gitignore.some(line => [privatePath, `${privatePath}/`, `${privatePath}/*`, `/${privatePath}`, `/${privatePath}/`, `/${privatePath}/*`].includes(line));
    if (!covered) check.errors.push({ path: 'data.private', message: `a pasta privada "${privatePath}" não está no .gitignore` });
  }
  if (!gitignore.some(line => line === '.env' || line === '.env*' || line === '*.env')) check.errors.push({ path: '.gitignore', message: '.env precisa estar no .gitignore' });

  const privatePrefixes = manifest.data.private.map(value => `${value.toLowerCase()}/`);
  const files = listFiles(dir, (relative, entry) => {
    const lower = relative.toLowerCase();
    if (entry.isDirectory()) return !['.git', 'node_modules'].includes(entry.name.toLowerCase()) && !privatePrefixes.some(prefix => `${lower}/`.startsWith(prefix));
    return true;
  });
  for (const file of files) {
    const name = path.posix.basename(file).toLowerCase();
    if (/^\.env(?:\.|$)/.test(name) && name !== '.env.example') {
      // Ignorado pelo Git (conferido acima); aceitável para scripts locais das skills.
      check.info.push({ path: file, message: 'credenciais locais em .env (fora do Git); as credenciais do Hub ficam na pasta secrets da instância' });
      continue;
    }
    if (!TEXT_EXT.test(file) || name === '.env.example') continue;
    const full = path.join(dir, ...file.split('/'));
    const size = fs.statSync(full).size;
    if (size > 512 * 1024) continue;
    const sensitivity = detectSensitivity(fs.readFileSync(full, 'utf8'));
    if (sensitivity.credentials) check.errors.push({ path: file, message: 'possível credencial em arquivo versionável; remova o valor e use a pasta secrets da instância' });
    else if (sensitivity.personalRecords) check.warnings.push({ path: file, message: 'possível dado pessoal/clínico em arquivo versionável; dados de pessoas ficam no banco operacional' });
  }
  if (expect === 'active' && !fs.existsSync(path.join(dir, ...LOCK_FILE.split('/')))) check.info.push({ path: LOCK_FILE, message: 'sem lock do template; atualizações vão tratar todos os arquivos como customizados' });
  if (!fs.existsSync(path.join(dir, '.git'))) check.info.push({ path: '.git', message: 'a Base ainda não é um repositório Git' });
  check.ok = check.errors.length === 0;
  return check;
}

export type UpgradeAction = 'add' | 'update' | 'unchanged' | 'keep-custom' | 'conflict' | 'removed-by-client' | 'obsolete';
export interface UpgradePlan {
  from: string; to: string; lockMissing: boolean;
  items: Array<{ path: string; action: UpgradeAction }>;
}

interface TemplateLock { template: { id: string; version: string }; createdAt: string; updatedAt?: string; files: Record<string, string>; }

function readLock(dir: string): TemplateLock | null {
  const file = path.join(dir, ...LOCK_FILE.split('/'));
  if (!fs.existsSync(file)) return null;
  const value = readJsonFile(file) as TemplateLock;
  if (!value || typeof value !== 'object' || typeof value.files !== 'object') throw new InstanceError('Lock do template corrompido.');
  return value;
}

/**
 * Cópias do contrato que toda Base carrega (geradas pelo Core, nunca editadas à mão): o validador que
 * `npm run validar` e os agentes usam dentro da Base. Precisam acompanhar a versão do Core que gerencia a Base.
 */
export const BASE_CONTRACT_FILES: ReadonlyArray<readonly [target: string, source: string]> = Object.freeze([
  ['scripts/workfoli-contract.mjs', 'packages/contract/workfoli-contract.mjs'],
  ['schemas/workfoli.base.schema.json', 'packages/contract/schemas/workfoli.base.schema.json'],
] as const);

/** Cópias do contrato presentes na Base e diferentes das do Core atual. */
export function outdatedContractFiles(baseDir: string): string[] {
  return BASE_CONTRACT_FILES.filter(([target, source]) => {
    const file = path.join(baseDir, ...target.split('/'));
    return fs.existsSync(file) && sha256File(file) !== sha256File(path.join(HUB_ROOT, ...source.split('/')));
  }).map(([target]) => target);
}

/**
 * Atualiza as cópias do contrato na Base (a versão anterior vai para `backupDir`). O lock do template passa a
 * apontar para a versão nova, para que um `base upgrade` futuro não confunda a atualização com customização.
 */
export function refreshBaseContract(baseDir: string, backupDir: string): string[] {
  const outdated = outdatedContractFiles(baseDir);
  if (!outdated.length) return [];
  const lock = readLock(baseDir);
  for (const relative of outdated) {
    const target = path.join(baseDir, ...relative.split('/'));
    const source = BASE_CONTRACT_FILES.find(([file]) => file === relative)![1];
    writeFileAtomic(path.join(backupDir, ...relative.split('/')), fs.readFileSync(target));
    writeFileAtomic(target, fs.readFileSync(path.join(HUB_ROOT, ...source.split('/'))));
    if (lock && Object.hasOwn(lock.files, relative)) lock.files[relative] = sha256File(target);
  }
  if (lock) writeJsonAtomic(path.join(baseDir, ...LOCK_FILE.split('/')), { ...lock, updatedAt: new Date().toISOString() });
  return outdated;
}

/** Versão do template da Base disponível, quando for diferente da que a Base usa (ou `null`). */
export function templateUpdateAvailable(baseDir: string, templateOverride?: string): { from: string; to: string } | null {
  try {
    const current = readBaseManifest(baseDir, 'any').manifest.template?.version ?? readLock(baseDir)?.template.version ?? null;
    const available = readBaseManifest(baseTemplateDir(templateOverride), 'template').manifest.template?.version ?? null;
    return current && available && current !== available ? { from: current, to: available } : null;
  } catch { return null; }
}

/**
 * Atualiza os arquivos que vieram do template preservando customizações (merge em três vias por hash):
 * arquivo intocado pelo cliente recebe a versão nova; arquivo customizado fica; se os dois mudaram, a versão
 * do template vai para `.workfoli/upgrade/` para revisão manual. Nada é apagado.
 */
export function planBaseUpgrade(baseDir: string, templateOverride?: string): UpgradePlan {
  const dir = path.resolve(baseDir);
  const current = readBaseManifest(dir).manifest;
  const templateDir = baseTemplateDir(templateOverride);
  const template = readBaseManifest(templateDir, 'template').manifest;
  const lock = readLock(dir);
  const items: UpgradePlan['items'] = [];
  const templateFiles = listFiles(templateDir, templateFilter).filter(file => file !== BASE_MANIFEST_FILE);
  for (const file of templateFiles) {
    const target = path.join(dir, ...file.split('/'));
    const templateHash = sha256File(path.join(templateDir, ...file.split('/')));
    const lockHash = lock?.files[file];
    if (!fs.existsSync(target)) { items.push({ path: file, action: lockHash ? 'removed-by-client' : 'add' }); continue; }
    const baseHash = sha256File(target);
    if (baseHash === templateHash) items.push({ path: file, action: 'unchanged' });
    else if (lockHash && baseHash === lockHash) items.push({ path: file, action: 'update' });
    else if (lockHash && templateHash === lockHash) items.push({ path: file, action: 'keep-custom' });
    else items.push({ path: file, action: 'conflict' });
  }
  for (const file of Object.keys(lock?.files ?? {})) if (!templateFiles.includes(file)) items.push({ path: file, action: 'obsolete' });
  return { from: current.template?.version ?? lock?.template.version ?? 'desconhecida', to: template.template?.version ?? 'desconhecida', lockMissing: !lock, items };
}

export function applyBaseUpgrade(baseDir: string, templateOverride?: string): UpgradePlan {
  const dir = path.resolve(baseDir);
  const plan = planBaseUpgrade(dir, templateOverride);
  const templateDir = baseTemplateDir(templateOverride);
  const template = readBaseManifest(templateDir, 'template').manifest;
  const loaded = readBaseManifest(dir);
  const lock: TemplateLock = readLock(dir) ?? { template: template.template ?? { id: 'workfoli-base', version: '0.0.0' }, createdAt: new Date().toISOString(), files: {} };
  for (const item of plan.items) {
    const source = path.join(templateDir, ...item.path.split('/'));
    const target = path.join(dir, ...item.path.split('/'));
    if (item.action === 'add' || item.action === 'update') {
      writeFileAtomic(target, fs.readFileSync(source));
      lock.files[item.path] = sha256File(target);
    } else if (item.action === 'unchanged') lock.files[item.path] = sha256File(target);
    else if (item.action === 'conflict') {
      writeFileAtomic(path.join(dir, ...UPGRADE_DIR.split('/'), `${item.path}.template`), fs.readFileSync(source));
      lock.files[item.path] = sha256File(source);
    } else if (item.action === 'keep-custom') lock.files[item.path] = sha256File(source);
  }
  lock.template = template.template ?? lock.template;
  lock.updatedAt = new Date().toISOString();
  writeJsonAtomic(path.join(dir, ...LOCK_FILE.split('/')), lock);
  if (template.template) writeBaseManifest(dir, { ...loaded.manifest, template: template.template }, { expectedHash: loaded.hash });
  return plan;
}
