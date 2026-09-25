import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { WorkspaceStore } from '../packages/adapters/storage.js';
import { analyzeSource } from '../packages/adapters/import-source.js';
import { resolveContext } from '../packages/application/context.js';
import type { ReviewInput, WorkspaceRelationship } from '../packages/contracts/index.js';

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workfoli-identity-test-'));
  const dataDir = path.join(root, 'data');
  let store = new WorkspaceStore(dataDir);
  t.after(async () => {
    store.close();
    assert.ok(path.relative(os.tmpdir(), root).startsWith('workfoli-identity-test-'));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const source = path.join(root, 'source'); await fs.mkdir(source);
  async function draft(name: string) {
    await fs.writeFile(path.join(source, 'empresa.md'), `Nome: ${name}\nPúblico: Pequenas empresas\n`);
    const id = randomUUID();
    const result = await analyzeSource({ runId: id, sourcePath: source, sourceType: 'folder', stagingDir: store.createStage(id) });
    store.prepare(result.report, result.texts);
    return { id, report: result.report };
  }
  async function create(name: string, relationship: WorkspaceRelationship = 'client') {
    const { id, report } = await draft(name);
    const nameItem = report.knowledge.find(item => item.field === 'identity.name')!;
    return store.confirm(id, { name, relationship, categories: {}, knowledge: { [nameItem.id]: { status: 'confirmed' } } });
  }
  return { root, dataDir, get store() { return store; }, draft, create,
    reopen() { store.close(); store = new WorkspaceStore(dataDir); return store; },
    identify() { return store.saveEnvironment({ companyName: 'Operadora sintética', userName: 'Pessoa responsável' }); },
  };
}

test('identity is required, explicit relationship cannot be inferred, and environment persists', async t => {
  const f = await fixture(t);
  const draft = await f.draft('Empresa importada');
  assert.equal(f.store.getEnvironment(), null);
  assert.throws(() => f.store.confirm(draft.id, { name: 'Empresa importada', relationship: 'client', categories: {}, knowledge: {} }), /configure sua empresa/);
  assert.throws(() => f.store.saveEnvironment({ companyName: '  ', userName: 'Pessoa' }), /Informe/);
  assert.throws(() => f.store.saveEnvironment({ companyName: 'Empresa', userName: 'x\ny' }), /Informe/);
  const profile = f.identify();
  assert.throws(() => f.store.confirm(draft.id, { name: 'Empresa importada', categories: {}, knowledge: {} } as ReviewInput), /Escolha/);
  const client = f.store.confirm(draft.id, { name: 'Empresa importada', relationship: 'client', categories: {}, knowledge: {} });
  assert.equal(client.workspace.relationship, 'client');
  assert.equal(f.store.getEnvironment()!.company.workspaceId, undefined);
  const updated = f.store.saveEnvironment({ companyName: 'Novo nome institucional', userName: 'Novo nome local' });
  assert.equal(updated.instanceId, profile.instanceId);
  assert.equal(updated.company.id, profile.company.id);
  assert.equal(updated.user.id, profile.user.id);
  f.reopen(); assert.deepEqual(f.store.getEnvironment(), updated);
  assert.equal(f.store.get(client.workspace.id).workspace.relationship, 'client');
});

test('ownership is local, has one principal workspace, and changing relationship preserves every source and review', async t => {
  const f = await fixture(t); f.identify();
  const a = await f.create('Minha empresa', 'company'); const b = await f.create('Meu cliente');
  assert.equal(f.store.getEnvironment()!.company.workspaceId, a.workspace.id);
  assert.equal(f.store.list().filter(item => item.relationship === 'client').length, 1);
  assert.throws(() => f.store.setWorkspaceRelationship(b.workspace.id, 'company'), /Já existe/);
  const before = JSON.stringify(a.report);
  f.store.setWorkspaceRelationship(a.workspace.id, 'client');
  assert.equal(JSON.stringify(f.store.get(a.workspace.id).report), before);
  f.store.setWorkspaceRelationship(b.workspace.id, 'company');
  assert.equal(f.store.getEnvironment()!.company.name, 'Meu cliente');
  f.reopen(); assert.equal(f.store.get(b.workspace.id).workspace.relationship, 'company');
  // A workspace's own metadata cannot claim to own another installation.
  const db = new DatabaseSync(path.join(f.store.workspacePath(a.workspace.id), 'workspace.sqlite'));
  const summary = JSON.parse(String(db.prepare("SELECT value FROM meta WHERE key='workspace'").get()!.value));
  summary.relationship = 'company'; db.prepare("UPDATE meta SET value=? WHERE key='workspace'").run(JSON.stringify(summary)); db.close();
  f.reopen(); assert.equal(f.store.get(a.workspace.id).workspace.relationship, 'client');
  assert.equal(f.store.get(b.workspace.id).workspace.relationship, 'company');
});

test('migration from 0.2 keeps clients, original IDs, sources and decisions; backs up the catalog before identity assignment', async t => {
  const f = await fixture(t); f.identify();
  const data = await f.create('Empresa antiga');
  const sourcePath = path.join(f.store.workspacePath(data.workspace.id), 'source', 'entries', data.report.files[0]!.id);
  const source = await fs.readFile(sourcePath);
  const catalog = new DatabaseSync(path.join(f.dataDir, 'catalog.sqlite'));
  catalog.exec('DROP TABLE environment; DROP TABLE environment_activities'); catalog.close();
  f.reopen(); assert.equal(f.store.getEnvironment(), null);
  assert.equal(f.store.list()[0]!.relationship, 'client');
  const existing = f.store.get(data.workspace.id);
  f.identify();
  assert.deepEqual(f.store.get(data.workspace.id), existing);
  assert.deepEqual(await fs.readFile(sourcePath), source);
  const backups = await fs.readdir(path.join(f.dataDir, 'backups')); assert.equal(backups.length, 1);
  const backup = new DatabaseSync(path.join(f.dataDir, 'backups', backups[0]!), { readOnly: true });
  try { assert.equal(backup.prepare('SELECT COUNT(*) n FROM workspaces').get()!.n, 1); assert.equal(backup.prepare('SELECT COUNT(*) n FROM environment').get()!.n, 0); }
  finally { backup.close(); }
});

test('context resolves separate explicit scopes and excludes pending, rejected, conflicting or sensitive knowledge', async t => {
  const f = await fixture(t); f.identify();
  const company = await f.create('MATRIZ_SYNTHETIC', 'company');
  const a = await f.create('ALPHA_SYNTHETIC'); const b = await f.create('BETA_SYNTHETIC');
  const single = resolveContext(f.store, { scope: 'workspace', workspaceId: a.workspace.id });
  assert.equal(single.clients.length, 1);
  assert.equal(single.company.workspace, undefined);
  assert.equal(single.company.knowledge.length, 0);
  assert.equal(single.clients[0]!.knowledge.length, 1);
  assert.ok(!JSON.stringify(single).includes('BETA_SYNTHETIC'));
  assert.ok(!JSON.stringify(single.clients).includes('MATRIZ_SYNTHETIC'));
  const own = resolveContext(f.store, { scope: 'company' });
  assert.equal(own.company.workspace!.id, company.workspace.id); assert.equal(own.clients.length, 0);
  const all = resolveContext(f.store, { scope: 'portfolio' });
  assert.equal(all.clients.length, 2); assert.equal(all.company.knowledge.length, 1);
  f.store.updateKnowledge(b.workspace.id, b.report.knowledge.find(k => k.field === 'identity.name')!.id, 'confirmed', 'api_key=synthetic-secret-do-not-leak');
  const safe = resolveContext(f.store, { scope: 'portfolio' });
  assert.ok(!JSON.stringify(safe).includes('synthetic-secret-do-not-leak'));
  f.store.updateKnowledge(a.workspace.id, a.report.knowledge.find(k => k.field === 'identity.name')!.id, 'rejected');
  assert.equal(resolveContext(f.store, { scope: 'workspace', workspaceId: a.workspace.id }).clients[0]!.knowledge.length, 0);
  assert.throws(() => resolveContext(f.store, { scope: 'company', workspaceId: b.workspace.id }), /escopo/);
  assert.throws(() => resolveContext(f.store, { scope: 'workspace', workspaceId: randomUUID() }), /encontrado/);
  const db = new DatabaseSync(path.join(f.store.workspacePath(company.workspace.id), 'workspace.sqlite'));
  const duplicate = { ...company.report.knowledge.find(item => item.field === 'identity.name')!, id: randomUUID(), value: 'Nome contraditório', status: 'confirmed' };
  db.prepare('INSERT INTO knowledge VALUES (?,?)').run(duplicate.id, JSON.stringify(duplicate)); db.close();
  assert.equal(resolveContext(f.store, { scope: 'company' }).company.knowledge.length, 0);
});
