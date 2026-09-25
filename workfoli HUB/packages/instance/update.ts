import * as fs from 'node:fs';
import path from 'node:path';
import { BASE_SCHEMA_VERSION, formatIssues, validateBaseManifest } from '../contract/workfoli-contract.mjs';
import { audit } from '../hub/audit.js';
import { DatabaseSync } from 'node:sqlite';
import { openHubDatabase, planMigrations } from '../hub/db.js';
import { coreRolesDrift, syncCoreRoles } from '../hub/users.js';
import type { CoreRolesDrift } from '../hub/users.js';
import { applyBaseUpgrade, manifestPath, outdatedContractFiles, planBaseUpgrade, refreshBaseContract, templateUpdateAvailable, writeBaseManifest } from './base.js';
import type { UpgradePlan } from './base.js';
import { InstanceError, readJsonFile, writeFileAtomic, writeJsonAtomic } from './fsutil.js';
import { INSTANCE_FILE } from '../contract/workfoli-contract.mjs';
import { loadInstance } from './instance.js';
import { coreVersion } from './templates.js';

export interface UpdatePlan {
  core: { from: string; to: string; changed: boolean };
  database: { current: number; target: number; pending: number[]; newer: boolean };
  manifest: { from: number; to: number; needsUpgrade: boolean };
  /** Cópias do contrato dentro da Base (validador usado por `npm run validar` e pelos agentes) diferentes das do Core. */
  contract: { outdated: string[] };
  /** Papéis do Core ausentes ou de outra versão no banco (novos papéis e permissões de cada versão). */
  roles: CoreRolesDrift;
  baseTemplate: { from: string; to: string; counts: Record<string, number>; conflicts: string[] } | null;
  /** Template novo disponível (quando `--base-template` não foi pedido). */
  templateAvailable: { from: string; to: string } | null;
}

function counts(plan: UpgradePlan): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of plan.items) result[item.action] = (result[item.action] ?? 0) + 1;
  return result;
}

/** O que `update --apply` faria. Somente leitura. */
export function planUpdate(instanceDir: string, options: { baseTemplate?: boolean; template?: string } = {}): UpdatePlan {
  const instance = loadInstance(instanceDir);
  const raw = readJsonFile(manifestPath(instance.paths.base)) as { schemaVersion?: unknown };
  const from = typeof raw?.schemaVersion === 'number' ? raw.schemaVersion : 0;
  let baseTemplate: UpdatePlan['baseTemplate'] = null;
  if (options.baseTemplate) {
    const upgrade = planBaseUpgrade(instance.paths.base, options.template);
    baseTemplate = { from: upgrade.from, to: upgrade.to, counts: counts(upgrade), conflicts: upgrade.items.filter(item => item.action === 'conflict').map(item => item.path) };
  }
  const version = coreVersion();
  const database = planMigrations(instance.dbPath);
  let roles: CoreRolesDrift = { missing: [], outdated: [], reserved: [] };
  if (fs.existsSync(instance.dbPath) && !database.newer) {
    const db = new DatabaseSync(instance.dbPath, { readOnly: true });
    try { roles = coreRolesDrift(db); } finally { db.close(); }
  }
  return {
    core: { from: instance.file.core.version, to: version, changed: instance.file.core.version !== version },
    database,
    manifest: { from, to: BASE_SCHEMA_VERSION, needsUpgrade: from < BASE_SCHEMA_VERSION },
    contract: { outdated: outdatedContractFiles(instance.paths.base) },
    roles,
    baseTemplate,
    templateAvailable: options.baseTemplate ? null : templateUpdateAvailable(instance.paths.base, options.template),
  };
}

/**
 * Aplica a atualização: migrações do banco (com cópia prévia), manifesto v1→v2 (original guardado em
 * data/backups), versão do Core fixada na instância e, se pedido, arquivos do template da Base
 * preservando customizações. Configuração e módulos customizados do Hub nunca são sobrescritos.
 */
export function applyUpdate(instanceDir: string, options: { baseTemplate?: boolean; template?: string } = {}): UpdatePlan {
  const plan = planUpdate(instanceDir, options);
  if (plan.database.newer) throw new InstanceError('O banco foi criado por uma versão mais nova do Core. Nada foi alterado.');
  const instance = loadInstance(instanceDir);
  const backups = path.join(instance.paths.data, 'backups');
  fs.mkdirSync(backups, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (plan.manifest.needsUpgrade) {
    const file = manifestPath(instance.paths.base);
    writeFileAtomic(path.join(backups, `workfoli.base-v${plan.manifest.from}-${stamp}.json`), fs.readFileSync(file));
    const result = validateBaseManifest(readJsonFile(file), { expect: 'any' });
    if (!result.ok || !result.value) throw new InstanceError(`Manifesto não pode ser convertido:\n${formatIssues(result.errors)}`);
    writeBaseManifest(instance.paths.base, result.value);
  }
  // O validador dentro da Base acompanha o Core: sem isso, `npm run validar` na Base recusaria o manifesto novo.
  refreshBaseContract(instance.paths.base, path.join(backups, `contrato-${stamp}`));
  const db = openHubDatabase(instance.dbPath, { migrate: true });
  try {
    const roles = syncCoreRoles(db);
    if (options.baseTemplate) applyBaseUpgrade(instance.paths.base, options.template);
    if (plan.core.changed) writeJsonAtomic(path.join(instance.dir, INSTANCE_FILE), { ...instance.file, core: { version: plan.core.to } });
    audit(db, { type: 'system', id: null }, 'core.updated', instance.file.instanceId, {
      coreFrom: plan.core.from, coreTo: plan.core.to, database: plan.database.pending.join(',') || 'nenhuma',
      manifest: plan.manifest.needsUpgrade ? `v${plan.manifest.from}->v${plan.manifest.to}` : 'atual', contract: plan.contract.outdated.length ? 'atualizado' : 'atual', baseTemplate: options.baseTemplate ? 'sim' : 'não',
      roles: [...roles.added.map(id => `+${id}`), ...roles.updated.map(id => `~${id}`), ...roles.preserved.map(item => `${item.from}->${item.to}`)].join(',') || 'atuais',
    });
  } finally { db.close(); }
  return plan;
}
