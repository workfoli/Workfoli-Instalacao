import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createCipheriv, createDecipheriv, scryptSync, createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { WorkspaceStore } from '../packages/adapters/storage.js';
import { analyzeSource } from '../packages/adapters/import-source.js';
import { createInstanceBackup, restoreInstanceBackup } from '../packages/adapters/backup.js';

const password = 'synthetic-strong-backup-password';
async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workfoli-backup-test-'));
  const store = new WorkspaceStore(path.join(root, 'data')); store.saveEnvironment({ companyName: 'Matriz sintética', userName: 'Pessoa sintética' });
  t.after(async () => { store.close(); assert.ok(path.relative(os.tmpdir(), root).startsWith('workfoli-backup-test-')); await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const source = path.join(root, 'source'); await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'empresa.md'), 'Nome: Empresa de teste\nPúblico: Empresas locais\n');
  await fs.writeFile(path.join(source, '.env'), 'PASSWORD=synthetic-private-value-must-survive-backup');
  const id = randomUUID(), stage = store.createStage(id);
  const result = await analyzeSource({ runId: id, sourceType: 'folder', sourcePath: source, stagingDir: stage });
  store.prepare(result.report, result.texts);
  const item = result.report.knowledge[0]!;
  const data = store.confirm(id, { name: 'Empresa de teste', relationship: 'company', categories: {}, knowledge: { [item.id]: { status: 'confirmed', value: 'Nome revisado' } } });
  return { root, store, data, backup: path.join(root, 'snapshot.workfoli-backup'), async destination(name = 'restored') { const dest = path.join(root, name); await fs.mkdir(dest); return dest; } };
}

test('encrypted backup rebuilds a complete isolated instance, preserving identity, decisions, private bytes, search and activity', async t => {
  const f = await fixture(t), before = f.store.get(f.data.workspace.id), profile = f.store.getEnvironment();
  const history = f.store.activities(f.data.workspace.id), environmentHistory = f.store.environmentActivities();
  const made = await createInstanceBackup(f.store, f.backup, password); assert.equal(made.workspaces, 1);
  const bytes = await fs.readFile(f.backup);
  assert.ok(!bytes.includes(Buffer.from('synthetic-private-value-must-survive-backup')));
  assert.ok(!bytes.includes(Buffer.from('Nome revisado')));
  const destination = await f.destination();
  const result = await restoreInstanceBackup(f.backup, destination, password);
  assert.equal(result.workspaces, 1); assert.ok(result.directory.startsWith(destination + path.sep));
  const recovered = new WorkspaceStore(result.directory);
  try {
    assert.deepEqual(recovered.getEnvironment(), profile);
    assert.deepEqual(recovered.get(f.data.workspace.id), before);
    assert.deepEqual(recovered.activities(f.data.workspace.id), history);
    assert.deepEqual(recovered.environmentActivities().slice(0, environmentHistory.length), environmentHistory);
    assert.equal(recovered.search(f.data.workspace.id, 'Empresas locais').length, 1);
    for (const file of f.data.report.files) assert.deepEqual(await fs.readFile(path.join(recovered.workspacePath(f.data.workspace.id), 'source', 'entries', file.id)), await fs.readFile(path.join(f.store.workspacePath(f.data.workspace.id), 'source', 'entries', file.id)));
    const secret = f.data.report.files.find(file => file.path === '.env')!;
    assert.equal(recovered.preview(f.data.workspace.id, secret.id).kind, 'unavailable');
  } finally { recovered.close(); }
  assert.deepEqual(f.store.get(f.data.workspace.id), before);
});

test('wrong passwords and ciphertext tampering never publish a recovered environment', async t => {
  const f = await fixture(t); await createInstanceBackup(f.store, f.backup, password);
  const wrong = await f.destination('wrong');
  await assert.rejects(restoreInstanceBackup(f.backup, wrong, 'incorrect-password-long-enough'), /Senha incorreta|alterado/);
  assert.deepEqual(await fs.readdir(wrong), []);
  const bytes = await fs.readFile(f.backup); bytes[Math.floor(bytes.length / 2)]! ^= 1;
  const altered = path.join(f.root, 'altered.workfoli-backup'); await fs.writeFile(altered, bytes);
  const tampered = await f.destination('tampered');
  await assert.rejects(restoreInstanceBackup(altered, tampered, password), /Senha incorreta|alterado/);
  assert.deepEqual(await fs.readdir(tampered), []);
});

test('backup refuses weak passwords, altered sources, occupied destinations and links without replacing data', async t => {
  const f = await fixture(t);
  await assert.rejects(createInstanceBackup(f.store, f.backup, 'short'), /12 caracteres/);
  await createInstanceBackup(f.store, f.backup, password);
  const original = await fs.readFile(f.backup);
  await assert.rejects(createInstanceBackup(f.store, f.backup, password), /EEXIST/);
  assert.deepEqual(await fs.readFile(f.backup), original);
  const occupied = await f.destination('occupied'); await fs.writeFile(path.join(occupied, 'keep.txt'), 'preserved');
  await assert.rejects(restoreInstanceBackup(f.backup, occupied, password), /pasta vazia/);
  assert.equal(await fs.readFile(path.join(occupied, 'keep.txt'), 'utf8'), 'preserved');
  const link = path.join(f.root, 'link'); await fs.symlink(occupied, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(restoreInstanceBackup(f.backup, link, password), /Links/);
  await fs.writeFile(path.join(f.store.workspacePath(f.data.workspace.id), 'source', 'entries', f.data.report.files[0]!.id), 'changed');
  const corruptOutput = path.join(f.root, 'corrupt.workfoli-backup');
  await assert.rejects(createInstanceBackup(f.store, corruptOutput, password), /integridade/);
  assert.equal(await fs.stat(corruptOutput).then(() => true, () => false), false);
});

test('authenticated but malformed archives cannot inject paths, databases, ownership or mismatched source bytes', async t => {
  const f = await fixture(t); await createInstanceBackup(f.store, f.backup, password);
  const encrypted = await fs.readFile(f.backup), magicLength = Buffer.byteLength('WORKFOLI-BACKUP-1\n'), headerSize = magicLength + 28;
  const header = encrypted.subarray(0, headerSize), secret = scryptSync(password, header.subarray(magicLength, magicLength + 16), 32, { N: 65_536, r: 8, p: 1, maxmem: 96 * 1024 ** 2 });
  const decipher = createDecipheriv('aes-256-gcm', secret, header.subarray(magicLength + 16)); decipher.setAAD(header); decipher.setAuthTag(encrypted.subarray(-16));
  const decrypted = Buffer.concat([decipher.update(encrypted.subarray(headerSize, -16)), decipher.final()]);
  const archive = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.fromBuffer(decrypted, { lazyEntries: true }, (error, zip) => error ? reject(error) : resolve(zip!)));
  const base = new Map<string, Buffer>();
  for (;;) {
    const entry = await new Promise<yauzl.Entry | undefined>((resolve, reject) => {
      const clean = () => { archive.off('entry', next); archive.off('end', end); archive.off('error', error); };
      const next = (entry: yauzl.Entry) => { clean(); resolve(entry); }, end = () => { clean(); resolve(undefined); }, error = (cause: Error) => { clean(); reject(cause); };
      archive.once('entry', next); archive.once('end', end); archive.once('error', error); archive.readEntry();
    });
    if (!entry) break;
    const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => archive.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream!)));
    const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    base.set(entry.fileName, Buffer.concat(chunks));
  }
  const variants: Array<(manifest: any, entries: Map<string, Buffer>) => void> = [
    manifest => { manifest.version = 100; },
    manifest => { manifest.files[0].path = '../outside.json'; },
    manifest => { manifest.environment.company.workspaceId = randomUUID(); },
    (_manifest, entries) => { entries.set(`workspaces/${f.data.workspace.id}/workspace.sqlite`, Buffer.from('untrusted database')); },
    (manifest, entries) => { const file = manifest.files.find((item: any) => item.path.includes('/source/entries/')); const value = Buffer.from('bytes changed'); entries.set(file.path, value); file.size = value.length; file.hash = createHash('sha256').update(value).digest('hex'); },
  ];
  for (let i = 0; i < variants.length; i++) {
    const entries = new Map(base), manifest = JSON.parse(entries.get('backup.json')!.toString('utf8')); variants[i]!(manifest, entries); entries.set('backup.json', Buffer.from(JSON.stringify(manifest)));
    const temporary = path.join(f.root, `forged-${i}.zip`), zip = new yazl.ZipFile(), done = pipeline(zip.outputStream, createWriteStream(temporary));
    for (const [name, value] of entries) zip.addBuffer(value, name); zip.end(); await done;
    const cipher = createCipheriv('aes-256-gcm', secret, header.subarray(magicLength + 16)); cipher.setAAD(header);
    const payload = Buffer.concat([cipher.update(await fs.readFile(temporary)), cipher.final()]);
    const forged = path.join(f.root, `forged-${i}.workfoli-backup`); await fs.writeFile(forged, Buffer.concat([header, payload, cipher.getAuthTag()]));
    const destination = await f.destination(`forged-${i}`);
    await assert.rejects(restoreInstanceBackup(forged, destination, password), /inválido|incompatível/);
    assert.deepEqual(await fs.readdir(destination), []);
  }
  secret.fill(0);
});
