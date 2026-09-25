import { test } from 'node:test';
import assert from 'node:assert/strict';
import { declaredModules, validateBaseManifest } from '../packages/core/base-manifest.js';
import { DATA_AUTHORITIES, MODULE_REGISTRY, dataAuthority, resolveModules, suggestModules } from '../packages/core/modules.js';
import type { BaseProfile, DataCategory } from '../packages/core/modules.js';
import { MODULE_IDS } from '../packages/contract/workfoli-contract.mjs';

function v1() {
  return {
    format: 'workfoli-base', schemaVersion: 1,
    baseId: 'c5dc4932-4195-4b44-b818-347678144da9',
    company: { name: 'Empresa Sintética' }, profile: 'general',
    modules: ['overview', 'files', 'knowledge', 'projects'],
    paths: { memory: '_memoria', identity: 'identidade', projects: 'projetos' },
  };
}

test('v1 manifests from Hub 0.2 are upgraded to the current schema in memory without inventing data', () => {
  const manifest = validateBaseManifest(v1());
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.crm, undefined, 'a Base without CRM gets no invented CRM section');
  assert.equal(manifest.status, 'active');
  assert.equal(manifest.company.name, 'Empresa Sintética');
  assert.equal(manifest.company.slug, 'empresa-sintetica');
  assert.deepEqual(manifest.modules.enabled, ['overview', 'files', 'knowledge', 'projects']);
  assert.deepEqual(manifest.context.knowledge, ['_memoria', 'projetos']);
  assert.deepEqual(manifest.services, []);
  assert.deepEqual(declaredModules(v1()), ['overview', 'files', 'knowledge', 'projects']);
  assert.deepEqual(declaredModules(manifest), ['overview', 'files', 'knowledge', 'projects']);
  assert.deepEqual(declaredModules(null), []);
});

test('adapter errors cite field paths but never received values', () => {
  const secret = 'synthetic-secret-must-not-appear';
  for (const key of ['owner', 'instanceId', 'users', 'scripts', 'hooks', 'token', 'apiKey']) {
    assert.throws(() => validateBaseManifest({ ...v1(), [key]: secret }), error => {
      assert.ok(error instanceof Error); assert.match(error.message, /Manifesto da Base inválido/); assert.ok(!error.message.includes(secret)); return true;
    });
  }
  for (const input of [null, [], 'text', {}, { ...v1(), schemaVersion: 3 }, { ...v1(), baseId: '../instance' }, { ...v1(), profile: 'constructor' }]) {
    assert.throws(() => validateBaseManifest(input), /Manifesto da Base inválido/);
  }
});

test('registry covers every contract module and keeps planned capabilities explicit', () => {
  assert.deepEqual(Object.keys(MODULE_REGISTRY).sort(), [...MODULE_IDS].sort());
  assert.ok(Object.isFrozen(MODULE_REGISTRY));
  assert.ok(Object.values(MODULE_REGISTRY).every(Object.isFrozen));
  assert.equal(MODULE_REGISTRY.patients.status, 'planned');
  assert.equal(MODULE_REGISTRY.crm.status, 'available');
  assert.ok(suggestModules('clinic').some(module => module.id === 'patients' && module.status === 'planned'));
  assert.ok(suggestModules('agency').some(module => module.id === 'marketing' && module.status === 'available'));
  assert.ok(suggestModules('agency').some(module => module.id === 'campaigns' && module.status === 'planned'));
  assert.ok(!suggestModules('general').some(module => module.id === 'crm'));
  assert.throws(() => suggestModules('unknown' as BaseProfile), /Perfil/);
});

test('resolved modules always include the core, honour disabled/order and never activate planned ones', () => {
  const { active, planned } = resolveModules(['crm', 'patients', 'knowledge', 'overview'], ['crm', 'users'], ['knowledge', 'overview']);
  const ids = active.map(module => module.id);
  assert.deepEqual(ids.slice(0, 2), ['knowledge', 'overview']);
  assert.ok(ids.includes('users') && ids.includes('settings'), 'core modules cannot be disabled');
  assert.ok(!ids.includes('crm'));
  assert.deepEqual(planned.map(module => module.id), ['patients']);
});

test('data authority separates versionable, operational, private, secrets and derived data', () => {
  assert.equal(dataAuthority('identity'), 'base-versionable');
  assert.equal(dataAuthority('non-sensitive-documentation'), 'base-versionable');
  for (const category of ['patients', 'crm', 'permissions', 'sessions', 'consents'] as const) assert.equal(dataAuthority(category), 'operational');
  for (const category of ['private-media', 'private-documents', 'consent-evidence'] as const) assert.equal(dataAuthority(category), 'private');
  for (const category of ['tokens', 'keys'] as const) assert.equal(dataAuthority(category), 'secrets');
  for (const category of ['indexes', 'embeddings', 'summaries'] as const) assert.equal(dataAuthority(category), 'derived');
  assert.ok(Object.isFrozen(DATA_AUTHORITIES));
  assert.throws(() => dataAuthority('constructor' as DataCategory), /desconhecida/);
});
