import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scrypt as derive } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import yauzl from 'yauzl';
import { WorkspaceStore, validId } from './storage.js';
import type { StoredActivity } from './storage.js';
import type { EnvironmentProfile, WorkspaceData } from '../contracts/index.js';
import { CATEGORY_LABELS } from '../contracts/index.js';
import { restrictedPath, sensitiveText } from '../core/classification.js';
import { decodeText } from './text.js';
import { validateBaseManifest } from '../core/base-manifest.js';

const MAGIC = Buffer.from('WORKFOLI-BACKUP-1\n');
const HEADER_SIZE = MAGIC.length + 16 + 12;
const MAX_BYTES = 10 * 1024 ** 3;
const MAX_METADATA = 64 * 1024 ** 2;
interface BackupFile { path: string; size: number; hash: string; }
interface Snapshot { data: WorkspaceData; activities: StoredActivity[]; }
interface Manifest { format: 'workfoli-backup'; version: 1; environment: EnvironmentProfile | null; environmentActivities: StoredActivity[]; workspaces: string[]; files: BackupFile[]; }
const fail = () => new Error('Backup inválido, incompleto ou incompatível.');
const object = (value: unknown): Record<string, any> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(); return value as Record<string, any>; };
const text = (value: unknown, max: number) => { if (typeof value !== 'string' || value.length > max) throw fail(); return value; };
const array = (value: unknown, max: number): any[] => { if (!Array.isArray(value) || value.length > max) throw fail(); return value; };
const number = (value: unknown, max = MAX_BYTES) => { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) throw fail(); return value; };
function key(password: string, salt: Buffer): Promise<Buffer> {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 1024) throw new Error('Use uma senha com pelo menos 12 caracteres e até 1.024 bytes.');
  return new Promise((resolve, reject) => derive(password, salt, 32, { N: 65_536, r: 8, p: 1, maxmem: 96 * 1024 ** 2 }, (error, result) => error ? reject(error) : resolve(result)));
}
async function physical(target: string, kind: 'file' | 'directory') {
  const resolved = path.resolve(target), actual = await fs.realpath(resolved), stat = await fs.lstat(resolved);
  if (actual.toLowerCase() !== resolved.toLowerCase() || stat.isSymbolicLink() || (kind === 'file' ? !stat.isFile() : !stat.isDirectory())) throw new Error('Links e redirecionamentos não são permitidos no backup.');
  return stat;
}
function inside(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
async function cleanTemporary(root: string) {
  if (!inside(os.tmpdir(), root) || !path.basename(root).startsWith('workfoli-backup-')) throw new Error('Área temporária inválida.');
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
async function digest(file: string): Promise<{ size: number; hash: string }> {
  await physical(file, 'file'); const hash = createHash('sha256'); let size = 0;
  for await (const chunk of createReadStream(file)) { size += chunk.length; if (size > MAX_BYTES) throw fail(); hash.update(chunk); }
  return { size, hash: hash.digest('hex') };
}
function archivePath(value: unknown): string {
  const result = text(value, 200);
  const uuid = '[a-f0-9-]{36}';
  if (!new RegExp(`^workspaces/${uuid}/(?:snapshot\\.json|manifest\\.json|source/(?:original\\.zip|entries/${uuid}))$`, 'i').test(result)) throw fail();
  const parts = result.split('/'); validId(parts[1]); if (parts[3] === 'entries') validId(parts[4]);
  return result;
}

/** Caller prevents mutations until the backup finishes. Source bytes remain immutable. */
export async function createInstanceBackup(store: WorkspaceStore, destination: string, password: string): Promise<{ workspaces: number; files: number }> {
  const salt = randomBytes(16), iv = randomBytes(12), secret = await key(password, salt);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workfoli-backup-'));
  let created = false;
  try {
    const snapshots = store.list().map(workspace => ({ data: store.get(workspace.id), activities: store.activities(workspace.id) }));
    if (snapshots.length > 1_000) throw new Error('O limite de workspaces do backup foi excedido.');
    const manifest: Manifest = { format: 'workfoli-backup', version: 1, environment: store.getEnvironment(), environmentActivities: store.environmentActivities(), workspaces: snapshots.map(item => item.data.workspace.id), files: [] };
    const sources = new Map<string, string>(); let total = 0;
    const add = async (logical: string, source: string, expectedHash?: string) => {
      archivePath(logical);
      const info = await digest(source); total += info.size;
      if (logical.endsWith('.json') && info.size > MAX_METADATA) throw fail();
      if (total > MAX_BYTES || manifest.files.length >= 100_000 || expectedHash && info.hash !== expectedHash) throw new Error('Limite ou integridade dos arquivos impediu o backup.');
      manifest.files.push({ path: logical, ...info }); sources.set(logical, source);
    };
    for (const snapshot of snapshots) {
      const id = snapshot.data.workspace.id, workspaceDir = store.workspacePath(id);
      const snapshotFile = path.join(root, `${id}.json`);
      await fs.writeFile(snapshotFile, JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
      await add(`workspaces/${id}/snapshot.json`, snapshotFile);
      await add(`workspaces/${id}/manifest.json`, path.join(workspaceDir, 'manifest.json'));
      for (const file of snapshot.data.report.files.filter(file => file.kind === 'file' && file.hash)) {
        validId(file.id); await add(`workspaces/${id}/source/entries/${file.id}`, path.join(workspaceDir, 'source', 'entries', file.id), file.hash);
      }
      const original = path.join(workspaceDir, 'source', 'original.zip');
      if (await fs.stat(original).then(() => true, () => false)) await add(`workspaces/${id}/source/original.zip`, original, snapshot.data.report.sourceHash);
    }
    const metadata = Buffer.from(JSON.stringify(manifest)); if (metadata.length > MAX_METADATA) throw fail();
    const header = Buffer.concat([MAGIC, salt, iv]);
    const output = await fs.open(destination, 'wx', 0o600); created = true;
    try { await output.writeFile(header); } finally { await output.close(); }
    const cipher = createCipheriv('aes-256-gcm', secret, iv); cipher.setAAD(header);
    const zip = new yazl.ZipFile();
    const completion = pipeline(zip.outputStream, cipher, createWriteStream(destination, { flags: 'a', mode: 0o600 }));
    void completion.catch(() => undefined);
    zip.on('error', error => cipher.destroy(error));
    zip.addBuffer(metadata, 'backup.json');
    for (const entry of manifest.files) {
      zip.addReadStreamLazy(entry.path, { size: entry.size, mode: 0o100600, compress: true }, callback => {
        void physical(sources.get(entry.path)!, 'file').then(() => {
          const hash = createHash('sha256'); let size = 0;
          const verifier = new Transform({ transform(chunk: Buffer, _encoding, done) { size += chunk.length; hash.update(chunk); done(size > entry.size ? fail() : null, chunk); }, flush(done) { done(size === entry.size && hash.digest('hex') === entry.hash ? undefined : fail()); } });
          const input = createReadStream(sources.get(entry.path)!); input.on('error', error => verifier.destroy(error)); verifier.on('close', () => input.destroy());
          callback(null, input.pipe(verifier));
        }, error => callback(error, undefined as never));
      });
    }
    zip.end(); await completion; await fs.appendFile(destination, cipher.getAuthTag());
    return { workspaces: snapshots.length, files: manifest.files.length };
  } catch (error) { if (created) await fs.unlink(destination).catch(() => {}); throw error; }
  finally { secret.fill(0); await cleanTemporary(root); }
}

function validateManifest(raw: unknown): Manifest {
  const input = object(raw);
  if (input.format !== 'workfoli-backup' || input.version !== 1) throw fail();
  const workspaces = array(input.workspaces, 1_000).map(item => { validId(item); return item; });
  if (new Set(workspaces).size !== workspaces.length) throw fail();
  const seen = new Set<string>(); let total = 0;
  const files = array(input.files, 100_000).map(raw => {
    const file = object(raw), logical = archivePath(file.path), size = number(file.size), hash = text(file.hash, 64);
    if (!workspaces.includes(logical.split('/')[1]!) || seen.has(logical.toLowerCase()) || !/^[a-f0-9]{64}$/.test(hash) || (total += size) > MAX_BYTES) throw fail();
    seen.add(logical.toLowerCase()); return { path: logical, size, hash };
  });
  for (const id of workspaces) if (!seen.has(`workspaces/${id}/snapshot.json`) || !seen.has(`workspaces/${id}/manifest.json`)) throw fail();
  let environment: EnvironmentProfile | null = null;
  if (input.environment !== null) {
    const p = object(input.environment), company = object(p.company), user = object(p.user);
    if (p.schemaVersion !== 1) throw fail(); validId(p.instanceId); validId(company.id); validId(user.id);
    const companyName = text(company.name, 120), userName = text(user.name, 120);
    if (!companyName.trim() || !userName.trim()) throw fail();
    if (company.workspaceId !== undefined && !workspaces.includes(company.workspaceId)) throw fail();
    environment = { schemaVersion: 1, instanceId: p.instanceId, company: { id: company.id, name: companyName, ...(company.workspaceId ? { workspaceId: company.workspaceId } : {}) }, user: { id: user.id, name: userName }, createdAt: text(p.createdAt, 40), updatedAt: text(p.updatedAt, 40) };
  }
  return { format: 'workfoli-backup', version: 1, environment, environmentActivities: validateActivities(input.environmentActivities), workspaces, files };
}

function validateActivities(input: unknown): StoredActivity[] {
  const seen = new Set<number>();
  return array(input, 100_000).map(raw => {
    const item = object(raw), id = number(item.id);
    if (seen.has(id)) throw fail(); seen.add(id);
    return { id, at: text(item.at, 40), action: text(item.action, 120), detail: text(item.detail, 64 * 1024) };
  });
}

function validateSnapshot(raw: unknown, id: string, files: BackupFile[]): Snapshot {
  const input = object(raw), data = object(input.data), workspace = object(data.workspace), report = object(data.report);
  if (workspace.id !== id || report.id !== id || report.schemaVersion !== 1 || !['zip', 'folder'].includes(report.sourceType)) throw fail();
  text(workspace.name, 120); text(workspace.createdAt, 40); text(workspace.sourceName, 4_096);
  text(report.createdAt, 40); text(report.sourceName, 4_096); text(report.suggestedName, 120);
  const entries = array(report.files, 100_000), known = new Map<string, any>();
  for (const entry of entries) {
    object(entry); validId(entry.id); if (known.has(entry.id)) throw fail(); known.set(entry.id, entry);
    text(entry.path, 4_096); number(entry.size); text(entry.extension, 100); text(entry.reason, 4_096);
    if (!['file', 'symlink'].includes(entry.kind) || !['indexed','metadata','restricted','blocked','excluded'].includes(entry.disposition) || typeof entry.sensitive !== 'boolean' || !Object.hasOwn(CATEGORY_LABELS, entry.category)) throw fail();
    if (entry.hash) { if (!/^[a-f0-9]{64}$/.test(entry.hash) || entry.kind !== 'file') throw fail(); const source = files.find(file => file.path === `workspaces/${id}/source/entries/${entry.id}`); if (!source || source.hash !== entry.hash || source.size !== entry.size) throw fail(); }
    else if (entry.disposition !== 'blocked') throw fail();
  }
  const evidence = (value: unknown) => { const e = object(value), file = known.get(e.fileId); if (!file || e.path !== file.path) throw fail(); if (e.line !== undefined) number(e.line, 5_000_000); if (e.endLine !== undefined) number(e.endLine, 5_000_000); };
  const knowledgeIds = new Set<string>();
  if (report.base !== undefined) { const base = object(report.base); base.manifest = validateBaseManifest(base.manifest); evidence(base.evidence); }
  for (const item of array(report.knowledge, 10_000)) { object(item); validId(item.id); if (knowledgeIds.has(item.id)) throw fail(); knowledgeIds.add(item.id); text(item.field, 120); text(item.value, 4_000); text(item.category, 120); if (!['pending','confirmed','rejected'].includes(item.status) || !['explicit','inferred','user'].includes(item.origin)) throw fail(); evidence(item.evidence); if (item.originalValue !== undefined) text(item.originalValue, 4_000); if (item.scope !== undefined) text(item.scope, 120); }
  const projectIds = new Set<string>();
  for (const project of array(report.projects, 10_000)) { object(project); validId(project.id); if (projectIds.has(project.id)) throw fail(); projectIds.add(project.id); text(project.name, 200); text(project.root, 4_096); text(project.description, 4_096); if (!['website','software','legacy'].includes(project.type)) throw fail(); array(project.evidence, 1_000).forEach(evidence); }
  object(report.summary); object(report.legacy); array(report.legacy.evidence, 1_000).forEach(evidence); array(report.legacy.versions, 1_000).forEach(value => text(value, 400));
  array(report.warnings, 100_000).forEach(warning => { object(warning); text(warning.code, 120); text(warning.message, 4_096); if (warning.fileId !== undefined && !known.has(warning.fileId)) throw fail(); });
  const activities = validateActivities(input.activities);
  return { data: data as WorkspaceData, activities };
}

/** Rebuilds local SQLite from authenticated, validated JSON; no received database is opened. */
export async function restoreInstanceBackup(source: string, destinationEmptyDirectory: string, password: string): Promise<{ directory: string; workspaces: number; files: number }> {
  const stat = await physical(source, 'file');
  const destination = path.resolve(destinationEmptyDirectory);
  await physical(destination, 'directory');
  if ((await fs.readdir(destination)).length) throw new Error('Escolha uma pasta vazia para restaurar. Seu ambiente atual será preservado.');
  if (stat.size < HEADER_SIZE + 16 || stat.size > MAX_BYTES) throw fail();
  const input = await fs.open(source, 'r'); const header = Buffer.alloc(HEADER_SIZE), tag = Buffer.alloc(16);
  try { await input.read(header, 0, header.length, 0); await input.read(tag, 0, 16, stat.size - 16); } finally { await input.close(); }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw fail();
  const secret = await key(password, header.subarray(MAGIC.length, MAGIC.length + 16));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workfoli-backup-')); let recovered: WorkspaceStore | undefined;
  const publish = path.join(destination, `.workfoli-restore-${randomUUID()}`); let published = false;
  try {
    const zipPath = path.join(root, 'authenticated.zip');
    const decipher = createDecipheriv('aes-256-gcm', secret, header.subarray(MAGIC.length + 16)); decipher.setAAD(header); decipher.setAuthTag(tag);
    try { await pipeline(createReadStream(source, { start: HEADER_SIZE, end: stat.size - 17 }), decipher, createWriteStream(zipPath, { flags: 'wx', mode: 0o600 })); }
    catch { throw new Error('Senha incorreta ou backup alterado. Nenhum dado foi restaurado.'); }
    const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.open(zipPath, { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (error, value) => error ? reject(fail()) : resolve(value!)));
    const extracted = new Map<string, { path: string; size: number; hash: string }>(); let total = 0; let archiveError: Error | undefined;
    zip.on('error', error => { archiveError = error; });
    try {
      if (zip.entryCount > 100_001) throw fail();
      for (;;) {
        if (archiveError) throw fail();
        const entry = await new Promise<yauzl.Entry | undefined>((resolve, reject) => {
          const clean = () => { zip.off('entry', onEntry); zip.off('end', onEnd); zip.off('error', onError); };
          const onEntry = (entry: yauzl.Entry) => { clean(); resolve(entry); };
          const onEnd = () => { clean(); resolve(undefined); };
          const onError = () => { clean(); reject(fail()); };
          zip.once('entry', onEntry); zip.once('end', onEnd); zip.once('error', onError); zip.readEntry();
        });
        if (!entry) break;
        const logical = entry.fileName, unixType = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (logical !== 'backup.json') archivePath(logical);
        if (extracted.has(logical.toLowerCase()) || ![0, 0x8000].includes(unixType) || entry.generalPurposeBitFlag & 1 || entry.uncompressedSize > MAX_BYTES || (total += entry.uncompressedSize) > MAX_BYTES) throw fail();
        if ((logical.endsWith('snapshot.json') || logical === 'backup.json' || logical.endsWith('manifest.json')) && entry.uncompressedSize > MAX_METADATA) throw fail();
        if (entry.uncompressedSize > 1024 ** 2 && entry.uncompressedSize / Math.max(1, entry.compressedSize) > 1_000) throw fail();
        const file = path.join(root, randomUUID()), hash = createHash('sha256'); let size = 0;
        const verifier = new Transform({ transform(chunk: Buffer, _encoding, done) { size += chunk.length; hash.update(chunk); done(size > entry.uncompressedSize ? fail() : null, chunk); } });
        const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => zip.openReadStream(entry, (error, stream) => error ? reject(fail()) : resolve(stream!)));
        await pipeline(stream, verifier, createWriteStream(file, { flags: 'wx', mode: 0o600 }));
        if (size !== entry.uncompressedSize) throw fail();
        extracted.set(logical.toLowerCase(), { path: file, size, hash: hash.digest('hex') });
      }
    } finally { zip.close(); }
    const metadata = extracted.get('backup.json'); if (!metadata) throw fail();
    const manifest = validateManifest(JSON.parse(await fs.readFile(metadata.path, 'utf8')));
    if (extracted.size !== manifest.files.length + 1) throw fail();
    for (const file of manifest.files) { const actual = extracted.get(file.path.toLowerCase()); if (!actual || actual.size !== file.size || actual.hash !== file.hash) throw fail(); }
    const snapshots: Snapshot[] = [];
    for (const id of manifest.workspaces) snapshots.push(validateSnapshot(JSON.parse(await fs.readFile(extracted.get(`workspaces/${id}/snapshot.json`)!.path, 'utf8')), id, manifest.files));
    await fs.mkdir(publish); recovered = new WorkspaceStore(publish);
    for (const snapshot of snapshots) {
      const id = snapshot.data.workspace.id, stage = recovered.createStage(id); const entries = path.join(stage, 'source', 'entries'); await fs.mkdir(entries, { recursive: true });
      for (const file of manifest.files.filter(file => file.path.startsWith(`workspaces/${id}/`) && !file.path.endsWith('/snapshot.json'))) {
        const relative = file.path.slice(`workspaces/${id}/`.length), target = path.join(stage, relative);
        if (!inside(stage, target)) throw fail(); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(extracted.get(file.path.toLowerCase())!.path, target);
      }
      const texts: Record<string, string> = {}; let textBytes = 0;
      for (const file of snapshot.data.report.files) {
        if (file.disposition !== 'indexed' || file.sensitive || !file.hash) continue;
        if (restrictedPath(file.path)) { file.sensitive = true; file.disposition = 'restricted'; continue; }
        if (file.size > 1024 ** 2 || (textBytes += file.size) > 32 * 1024 ** 2) continue;
        const content = decodeText(await fs.readFile(path.join(entries, file.id)));
        if (content === undefined) continue;
        if (sensitiveText(content)) { file.sensitive = true; file.disposition = 'restricted'; continue; }
        texts[file.id] = content;
      }
      recovered.restoreSnapshot(snapshot.data, texts, snapshot.activities);
    }
    recovered.restoreIdentity(manifest.environment, manifest.environmentActivities); recovered.close(); recovered = undefined;
    await fs.writeFile(path.join(publish, 'restored.json'), JSON.stringify({ version: 1, at: new Date().toISOString(), workspaces: snapshots.length }));
    // Publish under a newly created child. Never replace the current instance or an existing file.
    const finalDirectory = path.join(destination, 'Workfoli-restaurado');
    if (await fs.stat(finalDirectory).then(() => true, () => false)) throw new Error('O destino mudou durante a recuperação. Escolha outra pasta vazia.');
    await fs.rename(publish, finalDirectory); published = true;
    return { directory: finalDirectory, workspaces: snapshots.length, files: manifest.files.length };
  } finally {
    recovered?.close(); secret.fill(0); await cleanTemporary(root);
    if (!published && await fs.stat(publish).then(() => true, () => false)) { if (!inside(destination, publish)) throw fail(); await fs.rm(publish, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  }
}
