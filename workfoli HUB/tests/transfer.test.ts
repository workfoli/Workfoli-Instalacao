import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';
import type { WorkspaceData } from '../packages/contracts/index.js';
import { analyzeSource } from '../packages/adapters/import-source.js';
import { exportWorkspacePackage, TRANSFER_MANIFEST } from '../packages/adapters/transfer.js';
import { WorkspaceStore } from '../packages/adapters/storage.js';

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workfoli-transfer-test-'));
  t.after(async () => {
    const relative = path.relative(os.tmpdir(), root);
    assert(relative.startsWith('workfoli-transfer-test-') && !relative.includes(path.sep));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const source = path.join(root, 'input'); await fs.mkdir(source);
  const write = async (name: string, text: string) => { const to = path.join(source, name); await fs.mkdir(path.dirname(to), { recursive: true }); await fs.writeFile(to, text); };
  const analyze = async (from = source, type: 'folder' | 'zip' = 'folder') => {
    const runId = randomUUID(), stagingDir = path.join(root, runId); await fs.mkdir(stagingDir);
    return { ...await analyzeSource({ runId, stagingDir, sourcePath: from, sourceType: type }), stagingDir };
  };
  return { root, source, write, analyze };
}

async function unzip(filePath: string): Promise<Map<string, Buffer>> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.open(filePath, { lazyEntries: true }, (error, result) => error ? reject(error) : resolve(result!)));
  const result = new Map<string, Buffer>();
  for (;;) {
    const entry = await new Promise<yauzl.Entry | undefined>((resolve, reject) => {
      const cleanup = () => { zip.off('entry', onEntry); zip.off('end', onEnd); zip.off('error', onError); };
      const onEntry = (entry: yauzl.Entry) => { cleanup(); resolve(entry); };
      const onEnd = () => { cleanup(); resolve(undefined); };
      const onError = (error: Error) => { cleanup(); reject(error); };
      zip.once('entry', onEntry); zip.once('end', onEnd); zip.once('error', onError); zip.readEntry();
    });
    if (!entry) break;
    const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => zip.openReadStream(entry, (error, result) => error ? reject(error) : resolve(result!)));
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    result.set(entry.fileName, Buffer.concat(chunks));
  }
  return result;
}

async function makeZip(destination: string, entries: Map<string, Buffer>): Promise<void> {
  const zip = new yazl.ZipFile();
  const done = pipeline(zip.outputStream, createWriteStream(destination, { flags: 'wx' }));
  for (const [name, bytes] of entries) zip.addBuffer(bytes, name);
  zip.end(); await done;
}

function dataFor(report: WorkspaceData['report']): WorkspaceData {
  return {
    workspace: { id: report.id, name: 'Aurora revisada', relationship: 'client', createdAt: report.createdAt, files: report.summary.files, projects: report.projects.length, knowledge: report.knowledge.length, sourceName: report.sourceName, legacy: report.legacy.detected },
    report,
  };
}

test('the same delivery becomes the recipient company or its client only by an explicit local choice', async t => {
  const f = await fixture(t);
  await f.write('_memoria/empresa.md', 'Nome: Aurora\nTom de voz: Claro e cuidadoso.');
  const original = await f.analyze();
  const item = original.report.knowledge.find(value => value.field === 'identity.name')!;
  item.status = 'confirmed'; item.originalValue = item.value; item.value = 'Aurora revisada'; item.origin = 'user';
  const delivery = path.join(f.root, 'delivery.zip');
  await exportWorkspacePackage(dataFor(original.report), original.stagingDir, delivery);
  const profiles = [];
  for (const relationship of ['company', 'client'] as const) {
    const store = new WorkspaceStore(path.join(f.root, `recipient-${relationship}`));
    try {
      const runId = randomUUID();
      const imported = await analyzeSource({ runId, stagingDir: store.createStage(runId), sourcePath: delivery, sourceType: 'zip' });
      store.prepare(imported.report, imported.texts);
      const review = { name: imported.report.suggestedName, relationship, categories: {}, knowledge: {} };
      assert.throws(() => store.confirm(runId, review), /configure sua empresa/);
      const profile = store.saveEnvironment({ companyName: 'Agência destinatária', userName: 'Pessoa destinatária' });
      profiles.push(profile);
      const data = store.confirm(runId, review);
      const environment = store.requireEnvironment();
      assert.equal(data.workspace.relationship, relationship);
      assert.notEqual(data.workspace.id, original.report.id);
      assert.equal(environment.user.id, profile.user.id);
      assert.equal(environment.company.name, relationship === 'company' ? 'Aurora revisada' : 'Agência destinatária');
      assert.equal(environment.company.workspaceId, relationship === 'company' ? data.workspace.id : undefined);
      assert.equal(store.list().filter(value => value.relationship === 'client').length, relationship === 'company' ? 0 : 1);
      assert.deepEqual(data.report.knowledge, original.report.knowledge);
      for (const file of data.report.files) {
        const bytes = await fs.readFile(path.join(store.workspacePath(data.workspace.id), 'source', 'entries', file.id));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), file.hash);
      }
    } finally { store.close(); }
  }
  assert.notEqual(profiles[0]!.instanceId, profiles[1]!.instanceId);
  assert.notEqual(profiles[0]!.company.id, profiles[1]!.company.id);
  assert.notEqual(profiles[0]!.user.id, profiles[1]!.user.id);
});

test('neutral ZIP and folder round trips retain curated names, file IDs, categories, knowledge and source evidence', async t => {
  const f = await fixture(t);
  await f.write('_memoria/empresa.md', 'Nome: Aurora\nTom de voz: Claro e cuidadoso.');
  await f.write('site/index.html', '<h1>Empresa sintética</h1>');
  const original = await f.analyze();
  const file = original.report.files.find(file => file.path === '_memoria/empresa.md')!;
  file.category = 'marketing';
  file.classification = { method: 'manual', confidence: 'high', evidence: 'Classificação revisada pela pessoa responsável.' };
  const knowledge = original.report.knowledge.find(item => item.field === 'identity.name')!;
  knowledge.originalValue = knowledge.value; knowledge.value = 'Aurora revisada'; knowledge.origin = 'user'; knowledge.status = 'confirmed';
  const rejected = original.report.knowledge.find(item => item.field === 'communication.tone')!; rejected.status = 'rejected';
  const data = dataFor(original.report);
  const packagePath = path.join(f.root, 'transfer.zip');
  assert.deepEqual(await exportWorkspacePackage(data, original.stagingDir, packagePath), { files: 2, excluded: 0 });
  const entries = await unzip(packagePath);
  assert.deepEqual([...entries.keys()].sort(), [TRANSFER_MANIFEST, ...original.report.files.map(file => `source/entries/${file.id}`)].sort());
  const folder = path.join(f.root, 'package-folder'); await fs.mkdir(folder);
  for (const [name, bytes] of entries) { const output = path.join(folder, name); await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, bytes); }
  for (const [from, type] of [[packagePath, 'zip'], [folder, 'folder']] as const) {
    const imported = await f.analyze(from, type);
    assert.notEqual(imported.report.id, original.report.id);
    assert.equal(imported.report.suggestedName, data.workspace.name);
    assert.deepEqual(imported.report.files.map(file => file.id).sort(), original.report.files.map(file => file.id).sort());
    assert.equal(imported.report.files.find(item => item.id === file.id)?.category, 'marketing');
    assert.equal(imported.report.files.find(item => item.id === file.id)?.classification?.method, 'manual');
    assert.deepEqual(imported.report.knowledge, original.report.knowledge);
    assert.deepEqual(imported.report.projects, original.report.projects);
    assert(imported.report.warnings.some(warning => warning.code === 'workspace-transfer'));
    for (const item of imported.report.files) assert.equal(createHash('sha256').update(await fs.readFile(path.join(imported.stagingDir, 'source', 'entries', item.id))).digest('hex'), item.hash);
  }
});

test('export omits environment identity, original archives, technical artifacts and secrets found by the current scanner', async t => {
  const f = await fixture(t);
  await f.write('_memoria/empresa.md', 'Nome: Empresa pública');
  await f.write('.env', 'PASSWORD=synthetic-secret-value');
  await f.write('node_modules/pkg/readme.md', 'Dependência');
  await f.write('scripts/token.mjs', 'const api_key = "synthetic-sensitive-value";');
  const original = await f.analyze();
  await fs.writeFile(path.join(original.stagingDir, 'source', 'original.zip'), 'never exported');
  await fs.writeFile(path.join(original.stagingDir, 'workspace.sqlite'), 'never opened');
  const data = dataFor(original.report) as WorkspaceData & { owner: unknown; relationship: string };
  data.owner = { name: 'OWNER_MUST_NOT_ESCAPE', token: 'USER_TOKEN_MUST_NOT_ESCAPE' }; data.relationship = 'owned';
  Object.assign(data.workspace, { ownerId: 'OWNER_MUST_NOT_ESCAPE', instanceId: 'INSTANCE_MUST_NOT_ESCAPE', relationship: 'owned' });
  Object.assign(data.report, { owner: data.owner, relationship: 'owned' });
  const output = path.join(f.root, 'neutral.zip');
  assert.deepEqual(await exportWorkspacePackage(data, original.stagingDir, output), { files: 1, excluded: 3 });
  const entries = await unzip(output);
  const manifest = entries.get(TRANSFER_MANIFEST)!.toString('utf8');
  for (const forbidden of ['OWNER_MUST_NOT_ESCAPE', 'USER_TOKEN_MUST_NOT_ESCAPE', 'INSTANCE_MUST_NOT_ESCAPE', 'relationship', 'owner', 'original.zip', 'workspace.sqlite', 'synthetic-sensitive-value']) assert(!manifest.includes(forbidden), forbidden);
  assert.equal(entries.size, 2);
});

test('import rejects corrupt hashes, unsafe logical paths, invalid schema, forged evidence and unexpected package entries', async t => {
  const f = await fixture(t); await f.write('_memoria/empresa.md', 'Nome: Aurora');
  const original = await f.analyze(), valid = path.join(f.root, 'valid.zip');
  await exportWorkspacePackage(dataFor(original.report), original.stagingDir, valid);
  const base = await unzip(valid);
  const variants: Array<(manifest: any, entries: Map<string, Buffer>) => void> = [
    manifest => { manifest.version = 999; },
    manifest => { manifest.report.files[0].path = '../escape.txt'; },
    manifest => { manifest.report.files[0].id = '../../escape'; },
    manifest => { manifest.report.files[0].hash = '0'.repeat(64); },
    manifest => { manifest.report.knowledge[0].evidence.fileId = randomUUID(); },
    manifest => { manifest.report.knowledge[0].evidence.path = 'unrelated.txt'; },
    manifest => { manifest.report.files.push({ ...manifest.report.files[0] }); },
    (_manifest, entries) => { entries.set('workspace.sqlite', Buffer.from('untrusted')); },
  ];
  for (let index = 0; index < variants.length; index++) {
    const entries = new Map(base), manifest = JSON.parse(entries.get(TRANSFER_MANIFEST)!.toString('utf8'));
    variants[index]!(manifest, entries);
    entries.set(TRANSFER_MANIFEST, Buffer.from(JSON.stringify(manifest)));
    const broken = path.join(f.root, `broken-${index}.zip`); await makeZip(broken, entries);
    await assert.rejects(f.analyze(broken, 'zip'), /inválido|inseguro|divergente|duplicad|evidência|versão|inesperad/i);
  }
  assert.equal(await fs.access(path.join(f.root, 'escape.txt')).then(() => true, () => false), false);
});

test('import does not trust incoming safety flags or execute scripts and does not inherit owner metadata', async t => {
  const f = await fixture(t); await f.write('_memoria/empresa.md', 'Nome: Aurora');
  await f.write('scripts/test.mjs', 'throw new Error("THIS_SCRIPT_MUST_NOT_RUN");');
  const original = await f.analyze(), valid = path.join(f.root, 'valid.zip');
  await exportWorkspacePackage(dataFor(original.report), original.stagingDir, valid);
  const entries = await unzip(valid), manifest = JSON.parse(entries.get(TRANSFER_MANIFEST)!.toString('utf8'));
  const document = manifest.report.files.find((file: any) => file.path === '_memoria/empresa.md');
  const secret = Buffer.from('Nome: Aurora\napi_key=abcdefghijklmnopqrstuv');
  document.size = secret.length; document.hash = createHash('sha256').update(secret).digest('hex'); document.sensitive = false; document.disposition = 'indexed';
  entries.set(`source/entries/${document.id}`, secret);
  manifest.workspace.ownerId = 'IGNORE_OWNER'; manifest.workspace.relationship = 'owned'; manifest.owner = { name: 'IGNORE_OWNER' };
  entries.set(TRANSFER_MANIFEST, Buffer.from(JSON.stringify(manifest)));
  const malicious = path.join(f.root, 'incoming.zip'); await makeZip(malicious, entries);
  const imported = await f.analyze(malicious, 'zip');
  assert.equal(imported.report.files.find(file => file.id === document.id)?.disposition, 'restricted');
  assert.equal(imported.texts[document.id], undefined);
  assert.equal(imported.report.knowledge.length, 0);
  assert(!JSON.stringify(imported.report).includes('IGNORE_OWNER'));
  assert(!JSON.stringify(imported.report).includes('abcdefghijklmnopqrstuv'));
  assert.equal(imported.report.files.find(file => file.path === 'scripts/test.mjs')?.disposition, 'metadata');
});

test('export refuses changed source bytes, does not overwrite a destination, and raw app directories require neutral export', async t => {
  const f = await fixture(t); await f.write('_memoria/empresa.md', 'Nome: Aurora');
  const original = await f.analyze(), output = path.join(f.root, 'existing.zip');
  await fs.writeFile(output, 'keep this file');
  await assert.rejects(exportWorkspacePackage(dataFor(original.report), original.stagingDir, output), /EEXIST/);
  assert.equal(await fs.readFile(output, 'utf8'), 'keep this file');
  await assert.rejects(f.analyze(original.stagingDir), /Exporte pelo Workfoli/);
  await fs.writeFile(path.join(original.stagingDir, 'source', 'entries', original.report.files[0]!.id), 'tampered');
  await assert.rejects(exportWorkspacePackage(dataFor(original.report), original.stagingDir, path.join(f.root, 'changed.zip')), /Integridade/);
});
