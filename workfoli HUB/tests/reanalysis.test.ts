import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { WorkspaceStore } from '../packages/adapters/storage.js';
import { analyzeSource } from '../packages/adapters/import-source.js';
import type { KnowledgeItem } from '../packages/contracts/index.js';

const text = 'Nome: Empresa de teste\nTom: Direto e cuidadoso\nPúblico: Pequenas empresas\nCor principal: #123456\n## Tipografia\nSite: Serifada + Sans\n';
async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workfoli-reanalysis-test-'));
  const store = new WorkspaceStore(path.join(root, 'data'));
  store.saveEnvironment({ companyName: 'Agência de teste', userName: 'Pessoa de teste' });
  t.after(async () => {
    store.close();
    const relative = path.relative(os.tmpdir(), root);
    assert.ok(relative.startsWith('workfoli-reanalysis-test-') && !relative.startsWith('..'));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const source = path.join(root, 'input'); await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'empresa.md'), text);
  await fs.writeFile(path.join(source, '.env'), 'TOKEN=synthetic-secret-value');
  async function draft() {
    const id = randomUUID();
    const result = await analyzeSource({ runId: id, sourcePath: source, sourceType: 'folder', stagingDir: store.createStage(id) });
    const file = result.report.files.find(file => file.path.endsWith('empresa.md'))!;
    const make = (field: string, value: string, line: number): KnowledgeItem => ({ id: randomUUID(), field, value, category: 'Empresa', origin: 'explicit', status: 'pending', evidence: { fileId: file.id, path: file.path, line } });
    result.report.knowledge = [make('identity.name', 'Empresa de teste', 1), make('communication.tone', 'Direto e cuidadoso', 2), make('business.audience', 'Pequenas empresas', 3), make('business.website', 'Serifada + Sans', 6)];
    store.prepare(result.report, result.texts);
    return { id, file, report: result.report };
  }
  async function create() {
    const result = await draft();
    return { ...result, data: store.confirm(result.id, { name: 'Empresa de teste', relationship: 'client', categories: {}, knowledge: {} }) };
  }
  return { root, source, store, draft, create };
}

test('reanalysis replaces pending mistakes, preserves every human decision, and backs up before applying', async t => {
  const { store, create, source } = await fixture(t); const { id, file, data } = await create();
  const [name, tone, audience, wrongSite] = data.report.knowledge;
  store.updateKnowledge(id, name!.id, 'confirmed');
  store.updateKnowledge(id, tone!.id, 'rejected');
  store.updateKnowledge(id, audience!.id, 'pending', 'Público corrigido pela pessoa');
  const before = store.get(id);
  const proposal = store.previewReanalysis(id);
  assert.deepEqual(store.get(id), before, 'a preview must not write the workspace');
  assert.equal(proposal.retainedReviewed, 3); assert.equal(proposal.removed, 1);
  assert.ok(proposal.added >= 1);
  assert.ok(!proposal.knowledge.some(item => item.id === wrongSite!.id));
  // The renderer cannot modify the stored proposal before submitting its token.
  proposal.knowledge[0]!.value = 'forged renderer change';
  const updated = store.applyReanalysis(id, proposal.token);
  for (const item of before.report.knowledge.slice(0, 3)) assert.deepEqual(updated.report.knowledge.find(next => next.id === item.id), item);
  assert.ok(updated.report.knowledge.some(item => item.field === 'brand.primaryColor' && item.status === 'pending'));
  assert.equal(store.list().length, 1); assert.equal(updated.workspace.id, id);
  const backupNames = await fs.readdir(path.join(store.workspacePath(id), 'backups')); assert.equal(backupNames.length, 1);
  const backup = new DatabaseSync(path.join(store.workspacePath(id), 'backups', backupNames[0]!), { readOnly: true });
  try { assert.equal(backup.prepare('SELECT COUNT(*) n FROM knowledge').get()!.n, 4); assert.equal(backup.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok'); } finally { backup.close(); }
  assert.equal(await fs.readFile(path.join(source, 'empresa.md'), 'utf8'), text);
  assert.equal(await fs.readFile(path.join(store.workspacePath(id), 'source', 'entries', file.id), 'utf8'), text);
  const again = store.previewReanalysis(id);
  assert.equal(again.added, 0); assert.equal(again.removed, 0); assert.equal(again.updated, 0);
  assert.deepEqual(again.knowledge, updated.report.knowledge);
  assert.throws(() => store.applyReanalysis(id, proposal.token), /proposta/i);
});

test('reanalysis rejects foreign, obsolete proposals and review changes made after preview', async t => {
  const { store, create } = await fixture(t); const a = await create(); const b = await create();
  const proposal = store.previewReanalysis(a.id);
  assert.throws(() => store.applyReanalysis(b.id, proposal.token), /proposta/i);
  store.updateKnowledge(a.id, a.data.report.knowledge[0]!.id, 'confirmed');
  assert.throws(() => store.applyReanalysis(a.id, proposal.token), /mudou/i);
  const old = store.previewReanalysis(a.id); store.previewReanalysis(a.id);
  assert.throws(() => store.applyReanalysis(a.id, old.token), /proposta/i);
});

test('edits validate input and preserve the first extracted value across multiple corrections', async t => {
  const { store, create } = await fixture(t); const a = await create(); const item = a.data.report.knowledge[0]!;
  store.updateKnowledge(a.id, item.id, 'confirmed', 'Primeira correção');
  const result = store.updateKnowledge(a.id, item.id, 'confirmed', 'Segunda correção');
  const edited = result.report.knowledge.find(k => k.id === item.id)!;
  assert.equal(edited.originalValue, item.value); assert.equal(edited.value, 'Segunda correção'); assert.equal(edited.origin, 'user');
  assert.throws(() => store.updateKnowledge(a.id, item.id, 'confirmed', '  '), /valor/i);
  assert.throws(() => store.updateKnowledge(a.id, item.id, 'confirmed', 'x'.repeat(2001)), /valor/i);
  assert.deepEqual(store.get(a.id), result);
});

test('integrity change between preview and apply cannot replace knowledge', async t => {
  const { store, create } = await fixture(t); const a = await create();
  const proposal = store.previewReanalysis(a.id); const before = store.get(a.id);
  await fs.writeFile(path.join(store.workspacePath(a.id), 'source', 'entries', a.file.id), text.replace('Empresa', 'Alterad'));
  assert.throws(() => store.applyReanalysis(a.id, proposal.token), /integridade/i);
  assert.throws(() => store.previewReanalysis(a.id), /integridade/i);
  assert.deepEqual(store.get(a.id), before);
});

test('failure inside the replacement transaction rolls back knowledge and catalog', async t => {
  const { store, create } = await fixture(t); const a = await create(); const proposal = store.previewReanalysis(a.id);
  const before = store.get(a.id);
  const db = new DatabaseSync(path.join(store.workspacePath(a.id), 'workspace.sqlite'));
  db.exec("CREATE TRIGGER fail_reanalysis BEFORE INSERT ON knowledge BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END"); db.close();
  assert.throws(() => store.applyReanalysis(a.id, proposal.token), /synthetic write failure/);
  assert.deepEqual(store.get(a.id), before); assert.deepEqual(store.list()[0], before.workspace);
});

test('staging previews use the same membership and restriction protections as published workspaces', async t => {
  const { store, draft } = await fixture(t); const a = await draft(); const b = await draft();
  assert.equal(store.previewImport(a.id, a.file.id).content, text);
  const secret = a.report.files.find(file => file.path.endsWith('.env'))!;
  assert.equal(store.previewImport(a.id, secret.id).kind, 'unavailable');
  assert.throws(() => store.previewImport(a.id, b.file.id), /pertence/i);
  assert.throws(() => store.previewImport('../outside', a.file.id), /inválido/i);
});
