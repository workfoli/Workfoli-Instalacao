import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import { planMigrations } from '../hub/db.js';
import { coreRolesDrift } from '../hub/users.js';
import { checkBase, outdatedContractFiles, templateUpdateAvailable } from './base.js';
import { isInside, listFiles, sha256File } from './fsutil.js';
import { loadInstance } from './instance.js';
import { fileSecretStore } from './secrets.js';
import { HUB_ROOT, baseTemplateDir, coreVersion } from './templates.js';
import { DatabaseSync } from 'node:sqlite';

export type Level = 'ok' | 'info' | 'warn' | 'error';
export interface Finding { level: Level; area: string; message: string; }
export interface DoctorReport { findings: Finding[]; ok: boolean; }

function report(findings: Finding[]): DoctorReport {
  return { findings, ok: !findings.some(finding => finding.level === 'error') };
}

/** Termos proibidos nos templates (nomes de clientes etc.), lidos de arquivo privado fora dos templates. */
function readDenylist(file?: string): string[] {
  if (!file) return [];
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#') && line.length >= 3);
}

const TEXT = /\.(?:md|txt|json|ya?ml|[cm]?[jt]sx?|css|html?|toml|ini|svg)$/i;

function scanDenylist(root: string, terms: string[], area: string, findings: Finding[], skip: (relative: string) => boolean) {
  if (!terms.length) return;
  const lowered = terms.map(term => term.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase());
  const files = listFiles(root, (relative, entry) => entry.isDirectory() ? !skip(relative) : TEXT.test(entry.name) && !skip(relative));
  let hits = 0;
  for (const file of files) {
    const full = path.join(root, ...file.split('/'));
    if (fs.statSync(full).size > 2 * 1024 * 1024) continue;
    const content = fs.readFileSync(full, 'utf8').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const index = lowered.findIndex(term => content.includes(term) || file.toLowerCase().includes(term));
    // Nunca imprime o termo: a lista é privada.
    if (index >= 0) { hits++; findings.push({ level: 'error', area, message: `${file} contém o termo proibido nº ${index + 1} da lista privada` }); }
  }
  if (!hits) findings.push({ level: 'ok', area, message: `nenhum dos ${terms.length} termos da lista privada foi encontrado` });
}

function gitTracked(root: string, pattern: RegExp): string[] {
  const result = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).filter(line => pattern.test(line));
}

/** Diagnóstico dos dois templates canônicos (Base e Hub). Somente leitura. */
export function doctorTemplates(options: { baseTemplate?: string; denylist?: string } = {}): DoctorReport {
  const findings: Finding[] = [];
  let template: string | undefined;
  try { template = baseTemplateDir(options.baseTemplate); findings.push({ level: 'ok', area: 'base-template', message: `template encontrado em ${template}` }); }
  catch (error) { findings.push({ level: 'error', area: 'base-template', message: (error as Error).message }); }
  if (template) {
    const check = checkBase(template, 'template');
    for (const issue of check.errors) findings.push({ level: 'error', area: 'base-template', message: `${issue.path}: ${issue.message}` });
    for (const issue of check.warnings) findings.push({ level: 'warn', area: 'base-template', message: `${issue.path}: ${issue.message}` });
    if (check.ok) findings.push({ level: 'ok', area: 'base-template', message: 'manifesto do template válido (status template, sem identificador)' });
    const contract = path.join(HUB_ROOT, 'packages', 'contract', 'workfoli-contract.mjs');
    const copy = path.join(template, 'scripts', 'workfoli-contract.mjs');
    if (!fs.existsSync(copy)) findings.push({ level: 'error', area: 'contrato', message: 'a Base não tem a cópia do validador (rode npm run sync:contract no Hub)' });
    else if (sha256File(copy) !== sha256File(contract)) findings.push({ level: 'error', area: 'contrato', message: 'cópia do validador na Base está desatualizada (rode npm run sync:contract no Hub)' });
    else findings.push({ level: 'ok', area: 'contrato', message: 'validador da Base idêntico ao do Core' });
    for (const schema of ['workfoli.base.schema.json']) {
      const source = path.join(HUB_ROOT, 'packages', 'contract', 'schemas', schema);
      const target = path.join(template, 'schemas', schema);
      if (!fs.existsSync(target) || sha256File(source) !== sha256File(target)) findings.push({ level: 'error', area: 'contrato', message: `schemas/${schema} da Base difere do Core (rode npm run sync:contract)` });
    }
    for (const artifact of ['.workfoli', 'data', 'files', 'secrets', 'hub', 'workfoli.instance.json']) {
      if (fs.existsSync(path.join(template, artifact))) findings.push({ level: 'error', area: 'base-template', message: `artefato de instância dentro do template: ${artifact}` });
    }
    const claude = path.join(template, '.claude', 'skills');
    const agents = path.join(template, '.agents', 'skills');
    if (fs.existsSync(claude) && fs.existsSync(agents)) {
      const left = listFiles(claude, () => true), right = listFiles(agents, () => true);
      const drift = left.filter(file => !right.includes(file) || sha256File(path.join(claude, file)) !== sha256File(path.join(agents, file)));
      if (drift.length || left.length !== right.length) findings.push({ level: 'error', area: 'skills', message: 'espelho .agents/skills difere de .claude/skills (rode npm run sync:skills na Base)' });
      else findings.push({ level: 'ok', area: 'skills', message: `${left.length} arquivos de skills espelhados para o Codex` });
    }
    scanDenylist(template, readDenylist(options.denylist), 'base-template', findings, relative => /^(?:\.git|node_modules)(?:\/|$)/.test(relative));
  }
  const tracked = gitTracked(HUB_ROOT, /(?:^|\/)(?:instances|workspaces|clients)\/|\.sqlite\d?$|(?:^|\/)secrets\.env$|(?:^|\/)\.env$/i);
  if (tracked.length) findings.push({ level: 'error', area: 'hub-template', message: `dados de instância versionados no repositório do Hub: ${tracked.slice(0, 5).join(', ')}` });
  else findings.push({ level: 'ok', area: 'hub-template', message: 'repositório do Hub sem dados de instância versionados' });
  scanDenylist(HUB_ROOT, readDenylist(options.denylist), 'hub-template', findings,
    relative => /^(?:\.git|node_modules|dist|dist-electron|dist-hub|release|test-results|tmp)(?:\/|$)/.test(relative) || relative === 'package-lock.json');
  return report(findings);
}

/** Diagnóstico de uma instância: contrato, camadas, banco, proprietário, segredos. Somente leitura. */
export function doctorInstance(instanceDir: string): DoctorReport {
  const findings: Finding[] = [];
  let instance;
  try { instance = loadInstance(instanceDir); }
  catch (error) { findings.push({ level: 'error', area: 'instância', message: (error as Error).message }); return report(findings); }
  findings.push({ level: 'ok', area: 'instância', message: `${instance.file.company.name} (${instance.file.instanceId})` });
  if (isInside(instance.dir, HUB_ROOT)) findings.push({ level: 'error', area: 'isolamento', message: 'instância dentro do repositório do Hub' });
  const base = checkBase(instance.paths.base, 'active');
  for (const issue of base.errors) findings.push({ level: 'error', area: 'base', message: `${issue.path}: ${issue.message}` });
  for (const issue of base.warnings) findings.push({ level: 'warn', area: 'base', message: `${issue.path}: ${issue.message}` });
  for (const issue of base.info) findings.push({ level: 'info', area: 'base', message: `${issue.path}: ${issue.message}` });
  if (base.ok) findings.push({ level: 'ok', area: 'base', message: 'Base válida pelo contrato e sem credenciais em arquivos versionáveis' });
  if (base.manifest && base.manifest.company.slug !== instance.file.company.slug) findings.push({ level: 'warn', area: 'base', message: 'nome da empresa mudou na Base; rode `workfoli hub sync --apply`' });
  const outdatedContract = fs.existsSync(instance.paths.base) ? outdatedContractFiles(instance.paths.base) : [];
  if (outdatedContract.length) findings.push({ level: 'warn', area: 'contrato', message: `validador dentro da Base diferente do Core (${outdatedContract.join(', ')}): "npm run validar" na Base pode recusar o manifesto; rode "workfoli update --apply"` });
  else findings.push({ level: 'ok', area: 'contrato', message: 'validador da Base igual ao do Core' });
  const templateUpdate = templateUpdateAvailable(instance.paths.base);
  if (templateUpdate) findings.push({ level: 'info', area: 'template', message: `template da Base ${templateUpdate.from} → ${templateUpdate.to} disponível ("workfoli update --apply --base-template")` });

  const version = coreVersion();
  if (instance.file.core.version !== version) findings.push({ level: 'warn', area: 'core', message: `instância criada com o Core ${instance.file.core.version}; Core atual ${version}. Rode \`workfoli update\`` });
  else findings.push({ level: 'ok', area: 'core', message: `Core ${version}` });

  const plan = planMigrations(instance.dbPath);
  if (!fs.existsSync(instance.dbPath)) findings.push({ level: 'error', area: 'banco', message: 'banco operacional ausente' });
  else if (plan.newer) findings.push({ level: 'error', area: 'banco', message: 'banco criado por versão mais nova do Core' });
  else if (plan.pending.length) findings.push({ level: 'warn', area: 'banco', message: `migrações pendentes: ${plan.pending.join(', ')} (rode \`workfoli update --apply\`)` });
  else {
    findings.push({ level: 'ok', area: 'banco', message: `esquema v${plan.current}` });
    const db = new DatabaseSync(instance.dbPath, { readOnly: true });
    try {
      const owners = db.prepare("SELECT status, COUNT(*) AS n FROM users WHERE role_id='owner' GROUP BY status").all() as Array<{ status: string; n: number }>;
      const active = owners.find(row => row.status === 'active')?.n ?? 0;
      if (active) findings.push({ level: 'ok', area: 'acesso', message: `${active} proprietário(s) ativo(s)` });
      else if (owners.some(row => row.status === 'pending')) findings.push({ level: 'warn', area: 'acesso', message: 'proprietário ainda não ativou o acesso (gere um link com `workfoli hub owner`)' });
      else findings.push({ level: 'error', area: 'acesso', message: 'instância sem proprietário' });
      const drift = coreRolesDrift(db);
      const stale = [...drift.missing, ...drift.outdated, ...drift.reserved];
      if (stale.length) findings.push({ level: 'warn', area: 'acesso', message: `papéis do Core desta versão ainda não gravados (${stale.join(', ')}): são atualizados ao abrir o Hub ou com "workfoli update --apply"` });
      const devices = db.prepare('SELECT COUNT(*) AS n FROM devices WHERE revoked_at IS NULL').get() as { n: number };
      if (instance.hubConfig.mode === 'remote') findings.push({ level: devices.n ? 'ok' : 'warn', area: 'agent', message: devices.n ? `${devices.n} Local Agent(s) pareado(s)` : 'modo remoto sem Local Agent pareado' });
      if (plan.current >= 2) {
        const connections = db.prepare("SELECT provider, status FROM integration_connections WHERE status<>'disconnected' ORDER BY provider").all() as Array<{ provider: string; status: string }>;
        for (const row of connections) {
          if (row.status === 'connected') findings.push({ level: 'ok', area: 'integrações', message: `${row.provider} conectado` });
          else findings.push({ level: 'warn', area: 'integrações', message: `${row.provider}: ${row.status === 'expired' ? 'autorização vencida (reconecte no Hub)' : 'conectado com erro (veja Integrações no Hub)'}` });
        }
      }
    } finally { db.close(); }
  }
  const secrets = fileSecretStore(instance.paths.secrets);
  const missing = (base.manifest?.integrations ?? []).filter(item => item.status !== 'planned' && item.status !== 'disabled')
    .flatMap(item => (item.secrets ?? []).filter(name => !secrets.has(name)).map(name => `${item.id}:${name}`));
  if (missing.length) findings.push({ level: 'warn', area: 'integrações', message: `credenciais ausentes: ${missing.join(', ')}` });
  const vaultKey = path.join(instance.paths.secrets, 'vault.key');
  if (fs.existsSync(vaultKey)) {
    let protection = 'desconhecida';
    try { protection = String((JSON.parse(fs.readFileSync(vaultKey, 'utf8')) as { protection?: unknown }).protection); } catch { /* relatado abaixo */ }
    if (protection === 'dpapi') findings.push({ level: 'ok', area: 'cofre', message: 'chave do cofre de tokens protegida pelo Windows (DPAPI) desta conta' });
    else if (protection === 'file') findings.push({ level: 'warn', area: 'cofre', message: 'chave do cofre de tokens sem proteção do sistema: restrinja a pasta secrets ou use WORKFOLI_VAULT_KEY do cofre do servidor' });
    else findings.push({ level: 'error', area: 'cofre', message: 'arquivo da chave do cofre ilegível: as integrações precisarão ser reconectadas' });
  }
  const secretFiles = fs.existsSync(instance.paths.base) ? listFiles(instance.paths.base, (_relative, entry) => entry.isDirectory() ? !/^(?:\.git|node_modules)$/.test(entry.name) : /^secrets\.env$|\.sqlite\d?$/i.test(entry.name)) : [];
  if (secretFiles.length) findings.push({ level: 'error', area: 'isolamento', message: `dados privados dentro da Base: ${secretFiles.slice(0, 5).join(', ')}` });
  const git = spawnSync('git', ['status', '--porcelain'], { cwd: instance.paths.base, encoding: 'utf8', windowsHide: true });
  if (git.status === 0) {
    const changes = git.stdout.split(/\r?\n/).filter(Boolean).length;
    findings.push({ level: 'info', area: 'git', message: changes ? `${changes} alteração(ões) não commitadas na Base` : 'Base sem alterações pendentes no Git' });
  }
  return report(findings);
}
