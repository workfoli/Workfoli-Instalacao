import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import { CATEGORY_LABELS } from '../contracts/index.js';
import type { Evidence, FileEntry, ImportReport, KnowledgeItem, Project, WorkspaceData } from '../contracts/index.js';
import { categoryFor, excludedCategories, restrictedPath, sensitiveText } from '../core/classification.js';
import { decodeText } from './text.js';
import type { ImportLimits } from './import-source.js';

export const TRANSFER_MANIFEST = 'workfoli-transfer.json';
export const TRANSFER_VERSION = 1;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const TEXT_FILE = /\.(?:md|txt|json|csv|css|html?|[cm]?js|tsx?|py|sh|ps1|bat|cmd|ya?ml|toml|xml|sql|env|ini|config)$/i;
const MAX_MANIFEST = 32 * 1024 ** 2;
const MAX_EXPORT_TEXT = 1024 ** 2;
const MAX_EXPORT_TEXT_TOTAL = 32 * 1024 ** 2;

type TransferReport = Pick<ImportReport, 'files' | 'projects' | 'knowledge' | 'legacy' | 'knowledgeAnalysis'>;
interface TransferManifest {
  format: 'workfoli-workspace'; version: 1;
  workspace: { name: string };
  report: TransferReport;
}
function invalid(message: string): never { throw new Error(`Pacote Workfoli inválido: ${message}`); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('estrutura de objeto esperada.'); return value as Record<string, unknown>; }
function str(value: unknown, max = 4_096, allowEmpty = false): string { if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) invalid('texto ausente ou fora dos limites.'); return value; }
function integer(value: unknown, max: number, min = 0): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalid('número fora dos limites.'); return value; }
function id(value: unknown): string { const result = str(value, 36); if (!ID.test(result)) invalid('identificador inválido.'); return result; }
function list(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) invalid('lista fora dos limites.'); return value; }

function validPath(value: unknown, max = 4_096, root = false): string {
  const result = str(value, max, root);
  if (root && result === '') return result;
  if (/^[\\/]|^[a-z]:/i.test(result) || /[\\\x00-\x1f\x7f<>:"|?*]/.test(result)) invalid('caminho inseguro.');
  if (result.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) invalid('caminho inseguro.');
  return result;
}

function parseManifest(value: unknown, limits: Pick<ImportLimits, 'maxEntries' | 'maxFileBytes' | 'maxExpandedBytes' | 'maxPathLength'>): TransferManifest {
  const manifest = object(value);
  if (manifest.format !== 'workfoli-workspace' || manifest.version !== TRANSFER_VERSION) invalid('formato ou versão não suportados.');
  const workspace = object(manifest.workspace);
  const name = str(workspace.name, 120);
  if (sensitiveText(name)) invalid('nome contém indicação de conteúdo reservado.');
  const report = object(manifest.report);
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  let total = 0;
  const files = list(report.files, limits.maxEntries).map(raw => {
    const value = object(raw);
    const fileId = id(value.id);
    const filePath = validPath(value.path, limits.maxPathLength);
    const collision = filePath.normalize('NFC').toLowerCase();
    if (seenIds.has(fileId.toLowerCase()) || seenPaths.has(collision)) invalid('identificadores ou caminhos duplicados.');
    seenIds.add(fileId.toLowerCase()); seenPaths.add(collision);
    if (value.kind !== 'file') invalid('somente fontes regulares são aceitas na transferência.');
    const hash = str(value.hash, 64);
    if (!HASH.test(hash)) invalid('hash SHA-256 inválido.');
    const size = integer(value.size, limits.maxFileBytes);
    total += size;
    if (total > limits.maxExpandedBytes) invalid('tamanho total além do limite.');
    const category = str(value.category, 30);
    if (!Object.hasOwn(CATEGORY_LABELS, category)) invalid('categoria desconhecida.');
    const file: FileEntry = { id: fileId, path: filePath, size, hash, extension: path.posix.extname(filePath).toLowerCase(), kind: 'file', category: category as FileEntry['category'], disposition: 'metadata', sensitive: false, reason: 'Fonte transferida; segurança reavaliada localmente.' };
    if (value.classification !== undefined) {
      const classification = object(value.classification);
      if (!['manual', 'rule'].includes(String(classification.method)) || !['high', 'medium', 'low'].includes(String(classification.confidence))) invalid('classificação inválida.');
      const reason = str(classification.evidence, 1_000);
      if (!sensitiveText(reason)) file.classification = { method: classification.method as 'manual' | 'rule', confidence: classification.confidence as 'high' | 'medium' | 'low', evidence: reason };
    }
    return file;
  });
  const byId = new Map(files.map(file => [file.id, file]));
  for (const file of files) {
    const parts = file.path.split('/');
    for (let i = 1; i < parts.length; i++) if (seenPaths.has(parts.slice(0, i).join('/').normalize('NFC').toLowerCase())) invalid('arquivo usado como diretório.');
  }
  const evidence = (raw: unknown): Evidence => {
    const value = object(raw);
    const fileId = id(value.fileId);
    const file = byId.get(fileId);
    if (!file || value.path !== file.path) invalid('evidência não corresponde a uma fonte do pacote.');
    const line = value.line === undefined ? undefined : integer(value.line, 5_000_000, 1);
    const endLine = value.endLine === undefined ? undefined : integer(value.endLine, 5_000_000, line ?? 1);
    if (endLine !== undefined && line === undefined) invalid('intervalo de evidência sem início.');
    return { fileId, path: file.path, ...(line === undefined ? {} : { line }), ...(endLine === undefined ? {} : { endLine }) };
  };
  const knowledgeIds = new Set<string>();
  const knowledge = list(report.knowledge, 10_000).map(raw => {
    const value = object(raw);
    const knowledgeId = id(value.id);
    if (knowledgeIds.has(knowledgeId.toLowerCase())) invalid('conhecimento com identificador duplicado.');
    knowledgeIds.add(knowledgeId.toLowerCase());
    const field = str(value.field, 120);
    if (!/^[a-z][a-z0-9_.-]*$/i.test(field)) invalid('campo de conhecimento inválido.');
    if (!['explicit', 'inferred', 'user'].includes(String(value.origin)) || !['pending', 'confirmed', 'rejected'].includes(String(value.status))) invalid('decisão de conhecimento inválida.');
    return { id: knowledgeId, field, value: str(value.value, 4_000), category: str(value.category, 120), origin: value.origin as KnowledgeItem['origin'], status: value.status as KnowledgeItem['status'], evidence: evidence(value.evidence), ...(value.scope === undefined ? {} : { scope: str(value.scope, 120) }), ...(value.originalValue === undefined ? {} : { originalValue: str(value.originalValue, 4_000) }), ...(value.conflict === true ? { conflict: true } : {}) } satisfies KnowledgeItem;
  });
  const projectIds = new Set<string>();
  const projects = list(report.projects, 1_000).map(raw => {
    const value = object(raw);
    const projectId = id(value.id);
    if (projectIds.has(projectId.toLowerCase())) invalid('projeto com identificador duplicado.');
    projectIds.add(projectId.toLowerCase());
    if (!['website', 'software', 'legacy'].includes(String(value.type))) invalid('tipo de projeto desconhecido.');
    const root = validPath(value.root, limits.maxPathLength, true);
    const refs = list(value.evidence, 100).map(evidence);
    if (refs.some(ref => root && ref.path !== root && !ref.path.startsWith(`${root}/`))) invalid('evidência fora do projeto.');
    return { id: projectId, name: str(value.name, 160), root, type: value.type as Project['type'], description: str(value.description, 2_000), evidence: refs } satisfies Project;
  });
  const legacyInput = object(report.legacy);
  const legacy = { detected: legacyInput.detected === true, evidence: list(legacyInput.evidence, 100).map(evidence), versions: list(legacyInput.versions, 100).map(version => str(version, 200)) };
  let knowledgeAnalysis: ImportReport['knowledgeAnalysis'];
  if (report.knowledgeAnalysis !== undefined) {
    const analysis = object(report.knowledgeAnalysis);
    const at = str(analysis.at, 40);
    if (!Number.isFinite(Date.parse(at))) invalid('data de análise inválida.');
    knowledgeAnalysis = { version: integer(analysis.version, 1_000, 1), at };
  }
  return { format: 'workfoli-workspace', version: 1, workspace: { name }, report: { files, knowledge, projects, legacy, ...(knowledgeAnalysis ? { knowledgeAnalysis } : {}) } };
}

async function physicalFile(filePath: string): Promise<fs.FileHandle> {
  const resolved = path.resolve(filePath);
  const real = await fs.realpath(resolved);
  if ((process.platform === 'win32' ? real.toLowerCase() !== resolved.toLowerCase() : real !== resolved)) throw new Error('Fonte contém link ou redirecionamento de filesystem.');
  const stat = await fs.lstat(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('A fonte não é um arquivo regular.');
  const handle = await fs.open(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const opened = await handle.stat();
  if (opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== stat.size || opened.mtimeMs !== stat.mtimeMs) { await handle.close(); throw new Error('A fonte mudou durante a leitura.'); }
  return handle;
}

async function inspectFile(filePath: string, entry: FileEntry, includeText: boolean): Promise<string | undefined> {
  const handle = await physicalFile(filePath);
  const hash = createHash('sha256');
  const buffers: Buffer[] = [];
  let size = 0;
  try {
    for await (const raw of handle.createReadStream({ autoClose: false })) {
      const chunk = raw as Buffer;
      size += chunk.length;
      if (size > entry.size) throw new Error('Integridade da fonte alterada: tamanho divergente.');
      hash.update(chunk);
      if (includeText) buffers.push(chunk);
    }
    if (size !== entry.size || hash.digest('hex') !== entry.hash) throw new Error('Integridade da fonte alterada: hash divergente.');
    return includeText ? decodeText(Buffer.concat(buffers)) : undefined;
  } finally { await handle.close(); }
}

/** Business content only. Environment identity, relationships, SQLite and original archives are not serialized. */
export async function exportWorkspacePackage(data: WorkspaceData, workspaceDir: string, destination: string): Promise<{ files: number; excluded: number }> {
  const selected: FileEntry[] = [];
  let textBytes = 0;
  for (const entry of data.report.files) {
    const current = categoryFor(entry.path);
    if (entry.kind !== 'file' || !entry.hash || !ID.test(entry.id) || entry.sensitive || restrictedPath(entry.path) || !['indexed', 'metadata'].includes(entry.disposition) || excludedCategories.has(current) || current === 'legacy' || excludedCategories.has(entry.category) || entry.category === 'legacy') continue;
    validPath(entry.path);
    if (sensitiveText(entry.path)) continue;
    const scan = entry.size <= MAX_EXPORT_TEXT;
    if (TEXT_FILE.test(entry.path) && (!scan || textBytes + entry.size > MAX_EXPORT_TEXT_TOTAL)) continue;
    const includeText = scan && textBytes + entry.size <= MAX_EXPORT_TEXT_TOTAL;
    const text = await inspectFile(path.join(workspaceDir, 'source', 'entries', entry.id), entry, includeText);
    if (includeText) textBytes += entry.size;
    if (text !== undefined && sensitiveText(text)) continue;
    selected.push(entry);
  }
  const included = new Set(selected.map(entry => entry.id));
  const safeText = (value: string) => !sensitiveText(value);
  const curated: TransferReport = {
    files: selected,
    knowledge: data.report.knowledge.filter(item => included.has(item.evidence.fileId) && [item.value, item.originalValue ?? '', item.scope ?? '', item.category].every(safeText)),
    projects: data.report.projects.filter(project => [project.name, project.description].every(safeText)).map(project => ({ ...project, evidence: project.evidence.filter(ref => included.has(ref.fileId)) })).filter(project => project.evidence.length),
    legacy: { detected: data.report.legacy.detected, evidence: data.report.legacy.evidence.filter(ref => included.has(ref.fileId)), versions: data.report.legacy.versions.filter(safeText) },
    ...(data.report.knowledgeAnalysis ? { knowledgeAnalysis: data.report.knowledgeAnalysis } : {}),
  };
  // Reconstruct every metadata object through the validator: extra owner/instance fields cannot escape.
  const manifest = parseManifest({ format: 'workfoli-workspace', version: 1, workspace: { name: data.workspace.name }, report: curated }, { maxEntries: 100_000, maxFileBytes: 1024 ** 3, maxExpandedBytes: 10 * 1024 ** 3, maxPathLength: 4_096 });
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2));
  if (bytes.length > MAX_MANIFEST) throw new Error('Manifesto de transferência excede o limite permitido.');
  const zip = new yazl.ZipFile();
  const output = createWriteStream(destination, { flags: 'wx', mode: 0o600 });
  let created = false;
  output.once('open', () => { created = true; });
  zip.on('error', error => output.destroy(error));
  const completion = pipeline(zip.outputStream, output);
  // Install a rejection handler before asynchronous source opening starts.
  void completion.catch(() => undefined);
  try {
    zip.addBuffer(bytes, TRANSFER_MANIFEST);
    for (const entry of manifest.report.files) {
      zip.addReadStreamLazy(`source/entries/${entry.id}`, { size: entry.size, mode: 0o100600, compress: true }, callback => {
        void (async () => {
          const handle = await physicalFile(path.join(workspaceDir, 'source', 'entries', entry.id));
          const hash = createHash('sha256'); let size = 0;
          const verify = new Transform({
            transform(chunk: Buffer, _encoding, done) { size += chunk.length; hash.update(chunk); if (size > entry.size) done(new Error('A fonte mudou durante a exportação.')); else done(null, chunk); },
            flush(done) { done(size === entry.size && hash.digest('hex') === entry.hash ? undefined : new Error('Hash da fonte mudou durante a exportação.')); },
          });
          const input = handle.createReadStream();
          input.on('error', error => verify.destroy(error));
          verify.on('close', () => { input.destroy(); void handle.close(); });
          callback(null, input.pipe(verify));
        })().catch(error => callback(error, undefined as never));
      });
    }
    zip.end();
    await completion;
    return { files: selected.length, excluded: data.report.files.length - selected.length };
  } catch (error) {
    output.destroy();
    await completion.catch(() => undefined);
    if (created) await fs.unlink(destination).catch(() => undefined);
    throw error;
  }
}

export interface RestoredTransfer { name: string; report: TransferReport; excludedKnowledge: number; }

/** Called only after generic ZIP/folder capture has applied path, stream, CRC and resource checks. */
export async function restoreWorkspaceTransfer(captured: FileEntry[], entriesDir: string, limits: ImportLimits, check: () => void): Promise<RestoredTransfer | undefined> {
  const markers = captured.filter(entry => entry.kind === 'file' && /(?:^|\/)workfoli-transfer\.json$/.test(entry.path));
  if (!markers.length) {
    const raw = captured.find(entry => /(?:^|\/)manifest\.json$/.test(entry.path) && captured.some(candidate => candidate.path.startsWith(`${entry.path.slice(0, -'manifest.json'.length)}source/entries/`)));
    if (raw) throw new Error('Esta é uma pasta interna de workspace. Exporte pelo Workfoli para transferir a curadoria atual sem bancos, credenciais ou dados do proprietário.');
    return undefined;
  }
  if (markers.length !== 1) invalid('mais de um manifesto de transferência.');
  const marker = markers[0]!;
  if (!marker.hash || marker.disposition === 'blocked' || marker.size > Math.min(MAX_MANIFEST, limits.maxTotalTextBytes)) invalid('manifesto não pôde ser capturado dentro dos limites.');
  check();
  const raw = await fs.readFile(path.join(entriesDir, marker.id));
  if (createHash('sha256').update(raw).digest('hex') !== marker.hash) invalid('hash do manifesto divergente.');
  let input: unknown;
  try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { invalid('manifesto JSON não é válido.'); }
  const manifest = parseManifest(input, limits);
  const prefix = marker.path.slice(0, -TRANSFER_MANIFEST.length);
  const byPath = new Map(captured.map(entry => [entry.path, entry]));
  const expected = new Set([marker.path, ...manifest.report.files.map(file => `${prefix}source/entries/${file.id}`)]);
  if (captured.some(entry => !expected.has(entry.path) || entry.kind !== 'file' || !entry.hash || entry.disposition === 'blocked')) invalid('pacote contém entradas inesperadas ou bloqueadas.');
  for (const file of manifest.report.files) {
    const snapshot = byPath.get(`${prefix}source/entries/${file.id}`);
    if (!snapshot || snapshot.size !== file.size || snapshot.hash !== file.hash) invalid('fonte ausente, tamanho ou hash divergente.');
  }
  const restoredDir = path.join(path.dirname(entriesDir), `transfer-${randomUUID()}`);
  await fs.mkdir(restoredDir, { mode: 0o700 });
  for (const file of manifest.report.files) {
    check();
    const snapshot = byPath.get(`${prefix}source/entries/${file.id}`)!;
    await fs.copyFile(path.join(entriesDir, snapshot.id), path.join(restoredDir, file.id), constants.COPYFILE_EXCL);
    const classified = categoryFor(file.path);
    if (restrictedPath(file.path)) { file.sensitive = true; file.disposition = 'restricted'; file.reason = 'Conteúdo reservado pela política atual; fora de busca e conhecimento.'; }
    else if (excludedCategories.has(classified) || classified === 'legacy' || excludedCategories.has(file.category) || file.category === 'legacy') { file.disposition = 'excluded'; file.reason = 'Recurso técnico ou instruções inativas; fora da busca de negócio.'; }
  }
  // Only generated files in this import's captured entries directory are removed.
  for (const entry of captured) if (entry.hash) await fs.unlink(path.join(entriesDir, entry.id));
  await fs.rmdir(entriesDir);
  await fs.rename(restoredDir, entriesDir);
  return { name: manifest.workspace.name, report: manifest.report, excludedKnowledge: 0 };
}

/** Apply current safety policy after text extraction; incoming review flags never grant access. */
export function finishTransferSafety(transfer: RestoredTransfer, files: FileEntry[]): TransferReport {
  const readable = new Set(files.filter(file => file.disposition === 'indexed' && !file.sensitive).map(file => file.id));
  const safe = new Set(files.filter(file => !file.sensitive && !['blocked', 'excluded', 'restricted'].includes(file.disposition)).map(file => file.id));
  const knowledge = transfer.report.knowledge.filter(item => readable.has(item.evidence.fileId) && ![item.value, item.originalValue ?? '', item.scope ?? '', item.category].some(sensitiveText));
  transfer.excludedKnowledge = transfer.report.knowledge.length - knowledge.length;
  return { ...transfer.report, files, knowledge, projects: transfer.report.projects.filter(project => !sensitiveText(`${project.name}\n${project.description}`)).map(project => ({ ...project, evidence: project.evidence.filter(ref => safe.has(ref.fileId)) })).filter(project => project.evidence.length), legacy: { ...transfer.report.legacy, evidence: transfer.report.legacy.evidence.filter(ref => safe.has(ref.fileId)), versions: transfer.report.legacy.versions.filter(value => !sensitiveText(value)) } };
}
