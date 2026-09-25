import { randomUUID } from 'node:crypto';
import type { HubConfig } from '../contract/workfoli-contract.mjs';
import { MODULE_REGISTRY, resolveModules } from '../core/modules.js';
import type { ModuleDefinition } from '../core/modules.js';
import { hubUrl, loadInstance } from '../instance/instance.js';
import type { LoadedInstance } from '../instance/instance.js';
import { fileSecretStore } from '../instance/secrets.js';
import type { SecretStore } from '../instance/secrets.js';
import { FsBaseAccess, SnapshotBaseAccess } from './base-access.js';
import type { BaseAccess } from './base-access.js';
import { applyBaseChange, journal, validateBaseChange } from './base-changes.js';
import type { AppliedChange } from './base-changes.js';
import { loadCustomModules } from './custom-modules.js';
import type { CustomModule, CustomModuleLoad } from './custom-modules.js';
import { audit } from './audit.js';
import { pruneSessions } from './auth.js';
import { now, openHubDatabase } from './db.js';
import type { HubDatabase } from './db.js';
import { can } from './permissions.js';
import { syncCoreRoles } from './users.js';
import { createIntegrationEnv } from './integrations/env.js';
import type { IntegrationEnv, IntegrationOptions } from './integrations/env.js';

export interface Actor { id: string; name: string; permissions: string[]; roleId: string; }
export type BaseChangeOutcome = { status: 'applied'; result: AppliedChange } | { status: 'queued'; commandId: string; summary: string };

export interface ResolvedModules { active: ModuleDefinition[]; planned: ModuleDefinition[]; custom: CustomModule[]; }

export interface HubRuntime {
  readonly instance: LoadedInstance;
  readonly db: HubDatabase;
  readonly config: HubConfig;
  readonly base: BaseAccess;
  readonly secrets: SecretStore;
  readonly custom: CustomModuleLoad;
  /** Integrações: endereços dos provedores, fetch e cofre de tokens desta instância. */
  readonly integrations: IntegrationEnv;
  /** Endereço pelo qual o navegador alcança este Hub (retorno do OAuth). */
  origin(): string;
  setOrigin(url: string): void;
  modules(): ResolvedModules;
  submitBaseChange(change: unknown, actor: { id: string | null; name: string }): BaseChangeOutcome;
  close(): void;
}

export interface RuntimeOptions { integrations?: IntegrationOptions; }

export function openRuntime(instanceDir: string, options: RuntimeOptions = {}): HubRuntime {
  const instance = loadInstance(instanceDir);
  const db = openHubDatabase(instance.dbPath);
  try { pruneSessions(db); } catch { /* limpeza oportunista nunca impede a abertura */ }
  // Papéis do Core iguais aos desta versão, mesmo que o Core tenha sido trocado sem `workfoli update`.
  const roles = syncCoreRoles(db);
  if (roles.added.length || roles.updated.length || roles.preserved.length) {
    audit(db, { type: 'system', id: null }, 'roles.core-synced', null, { added: roles.added.join(','), updated: roles.updated.join(','), preserved: roles.preserved.map(item => `${item.from}->${item.to}`).join(',') });
  }
  const config = instance.hubConfig;
  const base: BaseAccess = config.mode === 'remote' ? new SnapshotBaseAccess(db) : new FsBaseAccess(instance.paths.base);
  const custom = loadCustomModules(instance.paths.hub, config.modules.custom);
  const integrations = createIntegrationEnv(instance.paths.secrets, options.integrations);
  let origin: string | null = null;
  return {
    instance, db, config, base, custom, integrations,
    origin: () => origin ?? hubUrl(config),
    setOrigin(url) { origin = url.replace(/\/+$/, ''); },
    secrets: fileSecretStore(instance.paths.secrets, `instância ${instance.file.company.name}`),
    modules() {
      let manifest;
      try { manifest = base.snapshot().manifest; } catch { manifest = null; }
      const resolved = resolveModules(manifest?.modules.enabled ?? [], config.modules.disabled, manifest?.modules.order ?? []);
      return { ...resolved, custom: custom.modules };
    },
    submitBaseChange(raw, actor) {
      const change = validateBaseChange(raw);
      if (config.mode === 'local') {
        const result = applyBaseChange(instance.paths.base, change, { actorName: actor.name });
        journal(instance.paths.data, { actor: actor.id, type: change.type, files: result.files, manifestHash: result.manifestHash });
        base.invalidate();
        return { status: 'applied', result };
      }
      // Modo remoto: vira comando durável; o Local Agent aplica conferindo a revisão esperada.
      let expected: string | null = null;
      try { expected = base.snapshot().manifestHash || null; } catch { /* sem snapshot ainda */ }
      const id = randomUUID();
      db.prepare("INSERT INTO base_commands(id,type,payload,expected_revision,status,created_by,created_at) VALUES (?,?,?,?,'queued',?,?)")
        .run(id, change.type, JSON.stringify(change), change.type === 'knowledge.note' ? null : expected, actor.id, now());
      const summary = change.type === 'project.create' ? `Projeto "${change.project.name}" aguardando o computador da Base`
        : change.type === 'crm.config' ? 'Configuração do CRM aguardando o computador da Base'
          : `Nota "${change.note.title}" aguardando o computador da Base`;
      return { status: 'queued', commandId: id, summary };
    },
    close() { db.close(); },
  };
}

/** Permissão exigida para abrir um módulo. */
export function modulePermission(id: string): string {
  if (id === 'ai') return 'ai:use';
  if (id === 'users') return 'users:admin';
  if (id === 'settings') return 'settings:admin';
  if (id === 'history') return 'audit:read';
  const definition = (MODULE_REGISTRY as Record<string, ModuleDefinition | undefined>)[id];
  return `${definition?.scope ?? id}:read`;
}

export function visibleModules(runtime: HubRuntime, actor: Actor) {
  const modules = runtime.modules();
  return {
    active: modules.active.filter(module => can(actor.permissions, modulePermission(module.id))),
    planned: modules.planned,
    custom: modules.custom.filter(module => can(actor.permissions, `${module.id}:read`)),
  };
}

export function canSeeVisibility(actor: Actor, visibility: string | undefined): boolean {
  return visibility !== 'restricted' || can(actor.permissions, 'restricted:read');
}
