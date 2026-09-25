import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { setImmediate as yieldToLoop } from 'node:timers/promises';
import type { Readable } from 'node:stream';
import yauzl from 'yauzl';
import iconv from 'iconv-lite';
import { categoryFor, restrictedPath, sensitiveText, excludedCategories } from '../core/classification.js';
import { decodeText } from './text.js';
import { validateBaseManifest } from '../core/base-manifest.js';
import { finishTransferSafety, restoreWorkspaceTransfer } from './transfer.js';
import { interpret, KNOWLEDGE_VERSION } from '../core/interpret.js';
import type { FileEntry, ImportReport, ImportWarning, Progress } from '../contracts/index.js';

export interface ImportLimits {
  maxZipBytes: number;
  maxExpandedBytes: number;
  maxEntries: number;
  maxFileBytes: number;
  maxTextBytes: number;
  maxTotalTextBytes: number;
  maxCompressionRatio: number;
  maxDurationMs: number;
  maxPathLength: number;
}

export const defaultImportLimits: Readonly<ImportLimits> = Object.freeze({
  maxZipBytes: 2 * 1024 ** 3, maxExpandedBytes: 10 * 1024 ** 3,
  maxEntries: 100_000, maxFileBytes: 1024 ** 3,
  maxTextBytes: 1024 ** 2, maxTotalTextBytes: 32 * 1024 ** 2,
  maxCompressionRatio: 1_000, maxDurationMs: 30 * 60_000, maxPathLength: 4_096,
});
export const DEFAULT_IMPORT_LIMITS = defaultImportLimits;

interface AnalyzeOptions {
  runId: string;
  sourcePath: string;
  sourceType: 'zip' | 'folder';
  stagingDir: string;
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
  limits?: Partial<ImportLimits>;
}
type SourceStat = Stats;
const textExtensions = new Set(['.md', '.txt', '.json', '.csv', '.css', '.html', '.htm']);

function sameFile(a: SourceStat, b: SourceStat): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

function unsafePath(name: string, maxLength: number): string | undefined {
  if (!name || name.length > maxLength) return 'Nome vazio ou caminho além do limite.';
  if (/^[\\/]|^[a-z]:/i.test(name)) return 'Caminho absoluto ou de dispositivo bloqueado.';
  const parts = name.replace(/\\/g, '/').replace(/\/$/, '').split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return 'Caminho com travessia ou componente vazio bloqueado.';
  if (parts.some(part => /[\x00-\x1f\x7f<>:"|?*]/.test(part) || /[. ]$/.test(part))) return 'Nome incompatível com armazenamento seguro no Windows.';
  if (parts.some(part => /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) return 'Nome reservado do Windows bloqueado.';
  return undefined;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
function updateCrc(crc: number, bytes: Buffer): number {
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
  return crc;
}
function crc32(bytes: Buffer): number { return (updateCrc(0xffffffff, bytes) ^ 0xffffffff) >>> 0; }

function zipName(entry: yauzl.Entry): { name: string; legacyEncoding: boolean } {
  const raw = entry.fileName as unknown as Buffer;
  if (!Buffer.isBuffer(raw)) return { name: String(raw), legacyEncoding: false };
  for (const extra of entry.extraFields) {
    if (extra.id === 0x7075 && extra.data.length >= 5 && extra.data[0] === 1 && extra.data.readUInt32LE(1) === crc32(raw)) {
      try { return { name: new TextDecoder('utf-8', { fatal: true }).decode(extra.data.subarray(5)), legacyEncoding: false }; } catch { /* use original bytes */ }
    }
  }
  if (entry.generalPurposeBitFlag & 0x800) return { name: new TextDecoder('utf-8', { fatal: true }).decode(raw), legacyEncoding: false };
  // Brazilian legacy exports commonly use OEM 850. ASCII is identical in both encodings.
  return { name: iconv.decode(raw, 'cp850'), legacyEncoding: raw.some(byte => byte > 127) };
}

export async function analyzeSource(options: AnalyzeOptions): Promise<{ report: ImportReport; texts: Record<string, string> }> {
  const limits = { ...defaultImportLimits, ...options.limits };
  for (const [key, value] of Object.entries(limits)) if (!Number.isFinite(value) || value <= 0) throw new Error(`Limite de importação inválido: ${key}.`);
  const started = Date.now();
  const sourcePath = path.resolve(options.sourcePath);
  const staging = path.resolve(options.stagingDir);
  const stagingRelative = path.relative(sourcePath, staging);
  if (options.sourceType === 'folder' && (!stagingRelative || (!stagingRelative.startsWith(`..${path.sep}`) && stagingRelative !== '..' && !path.isAbsolute(stagingRelative)))) throw new Error('A área temporária não pode estar dentro da pasta de origem.');
  const sourceDir = path.join(staging, 'source');
  const entriesDir = path.join(sourceDir, 'entries');
  await fs.mkdir(entriesDir, { recursive: true, mode: 0o700 });
  const files: FileEntry[] = [];
  const warnings: ImportWarning[] = [];
  const warningCodes = new Set<string>();
  const warnOnce = (code: string, message: string) => { if (!warningCodes.has(code)) { warningCodes.add(code); warnings.push({ code, message }); } };
  let directories = 0;
  let processed = 0;
  let actualBytes = 0;
  let declaredBytes = 0;
  let lastProgress = 0;
  let sourceHash: string | undefined;
  const check = () => {
    if (options.signal?.aborted) { const error = new Error('Importação cancelada.'); error.name = 'AbortError'; throw error; }
    if (Date.now() - started > limits.maxDurationMs) throw new Error('O tempo máximo da importação foi excedido.');
  };
  const progress = (phase: Progress['phase'], message: string, force = false, total?: number) => {
    check();
    if (force || Date.now() - lastProgress >= 50) { lastProgress = Date.now(); options.onProgress?.({ runId: options.runId, phase, message, processed, ...(total === undefined ? {} : { total }) }); }
  };
  const countEntry = () => { check(); if (++processed > limits.maxEntries) throw new Error('O limite de entradas da importação foi excedido.'); };
  const declaredSize = (size: number) => {
    if (!Number.isSafeInteger(size) || size < 0 || size > limits.maxFileBytes) throw new Error('Um arquivo excede o limite de tamanho permitido.');
    declaredBytes += size;
    if (declaredBytes > limits.maxExpandedBytes) throw new Error('O limite total de bytes da importação foi excedido.');
  };
  const makeEntry = (originalPath: string, size: number, kind: FileEntry['kind'] = 'file', blocked?: string): FileEntry => {
    const filePath = originalPath.replace(/\\/g, '/').replace(/[\x00-\x1f\x7f]/g, '�').slice(0, limits.maxPathLength);
    const category = categoryFor(filePath);
    const sensitive = restrictedPath(filePath);
    const entry: FileEntry = {
      id: randomUUID(), path: filePath, size, extension: path.posix.extname(filePath).toLowerCase(), kind, category, sensitive,
      disposition: blocked ? 'blocked' : sensitive ? 'restricted' : excludedCategories.has(category) || category === 'legacy' ? 'excluded' : 'metadata',
      reason: blocked ?? (sensitive ? 'Conteúdo reservado; fora de busca e conhecimento.' : excludedCategories.has(category) ? 'Artefato técnico preservado; fora da busca de negócio.' : category === 'legacy' ? 'Instruções e recursos legados preservados como dados inativos.' : 'Preservado; análise textual ainda não realizada.'),
      classification: { method: 'rule', confidence: category === 'other' ? 'low' : excludedCategories.has(category) ? 'high' : 'medium', evidence: category === 'other' ? 'Nenhuma regra de nome, pasta ou extensão identificou uma categoria.' : 'Categoria sugerida por regras locais sobre o nome, a pasta e a extensão. Revise se necessário.' },
    };
    files.push(entry);
    return entry;
  };
  const pathsSeen = new Map<string, { spelling: string; directory: boolean }>();
  const claimPath = (filePath: string, directory: boolean): string | undefined => {
    const p = filePath.replace(/\\/g, '/').replace(/\/$/, '');
    const parts = p.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const spelling = parts.slice(0, i).join('/').normalize('NFC');
      const key = spelling.toLowerCase();
      const existing = pathsSeen.get(key);
      const isDir = i < parts.length || directory;
      if (existing && (existing.spelling !== spelling || !existing.directory || !isDir)) return 'Colisão de nomes, maiúsculas/minúsculas ou normalização Unicode.';
    }
    for (let i = 1; i <= parts.length; i++) {
      const spelling = parts.slice(0, i).join('/').normalize('NFC');
      pathsSeen.set(spelling.toLowerCase(), { spelling, directory: i < parts.length || directory });
    }
    return undefined;
  };

  const writeStream = async (stream: Readable, destination: string, expected: number, countExpanded: boolean, expectedCrc?: number): Promise<string> => {
    const output = await fs.open(destination, 'wx', 0o600);
    const hash = createHash('sha256');
    let written = 0;
    let crc = 0xffffffff;
    let finished = false;
    const abort = () => stream.destroy(Object.assign(new Error('Importação cancelada.'), { name: 'AbortError' }));
    options.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => stream.destroy(new Error('O tempo máximo da importação foi excedido.')), Math.max(1, limits.maxDurationMs - (Date.now() - started)));
    try {
      for await (const piece of stream) {
        check();
        const chunk = Buffer.isBuffer(piece) ? piece : Buffer.from(piece as string);
        written += chunk.length;
        if (written > expected || (countExpanded && written > limits.maxFileBytes)) throw new Error('O arquivo produziu mais bytes que o tamanho permitido.');
        if (countExpanded && (actualBytes += chunk.length) > limits.maxExpandedBytes) throw new Error('O limite de descompressão foi excedido.');
        hash.update(chunk);
        if (expectedCrc !== undefined) crc = updateCrc(crc, chunk);
        let offset = 0;
        while (offset < chunk.length) { const result = await output.write(chunk, offset, chunk.length - offset); if (!result.bytesWritten) throw new Error('Não foi possível concluir a gravação do snapshot.'); offset += result.bytesWritten; }
        progress('copying', 'Preservando os arquivos de origem…');
      }
      if (written !== expected) throw new Error('O tamanho do arquivo mudou durante a captura.');
      if (expectedCrc !== undefined && ((crc ^ 0xffffffff) >>> 0) !== expectedCrc) throw new Error('Falha de integridade CRC em uma entrada do ZIP.');
      await output.sync();
      finished = true;
      return hash.digest('hex');
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      if (!finished) stream.destroy();
      await output.close();
    }
  };

  const assertPhysicalPath = async (target: string) => {
    const actual = await fs.realpath(target);
    const normalizedActual = process.platform === 'win32' ? actual.toLowerCase() : actual;
    const normalizedTarget = process.platform === 'win32' ? path.resolve(target).toLowerCase() : path.resolve(target);
    if (normalizedActual !== normalizedTarget) throw new Error('Links e redirecionamentos de filesystem não são seguidos.');
  };
  const copyRegular = async (from: string, to: string, before: SourceStat, expanded: boolean): Promise<string> => {
    check();
    await assertPhysicalPath(from);
    const input = await fs.open(from, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const opened = await input.stat();
      if (!opened.isFile() || !sameFile(before, opened)) throw new Error('A origem mudou durante a captura.');
      const hash = await writeStream(input.createReadStream({ autoClose: false }), to, before.size, expanded);
      if (!sameFile(before, await input.stat()) || !sameFile(before, await fs.lstat(from))) throw new Error('A origem mudou durante a captura.');
      await assertPhysicalPath(from);
      return hash;
    } finally { await input.close(); }
  };

  progress('inventory', 'Validando a origem…', true);
  const original = await fs.lstat(sourcePath);
  if (original.isSymbolicLink()) throw new Error('A origem selecionada é um link. Selecione uma pasta ou ZIP físico.');
  await assertPhysicalPath(sourcePath);
  if (options.sourceType === 'folder') {
    if (!original.isDirectory()) throw new Error('A origem selecionada não é uma pasta.');
    const visit = async (directory: string, relative: string, before: SourceStat): Promise<void> => {
      check();
      await assertPhysicalPath(directory);
      const children = await fs.readdir(directory, { withFileTypes: true });
      children.sort((a, b) => a.name.localeCompare(b.name, 'en'));
      for (const child of children) {
        countEntry();
        const logical = relative ? `${relative}/${child.name}` : child.name;
        const childPath = path.join(directory, child.name);
        const stat = await fs.lstat(childPath);
        const invalid = unsafePath(logical, limits.maxPathLength);
        if (stat.isSymbolicLink()) { makeEntry(logical, stat.size, 'symlink', 'Link simbólico ou junction preservado somente no manifesto; destino não seguido.'); continue; }
        if (stat.isDirectory()) {
          directories++;
          if (invalid) { warnings.push({ code: 'blocked-directory', message: `Diretório não capturado: ${logical.slice(0, 200)}. ${invalid}` }); continue; }
          const collision = claimPath(logical, true);
          if (collision) { warnings.push({ code: 'blocked-directory', message: `Diretório não capturado: ${logical.slice(0, 200)}. ${collision}` }); continue; }
          await visit(childPath, logical, stat);
        } else {
          if (!stat.isFile()) { makeEntry(logical, stat.size, 'file', 'Entrada especial do filesystem não capturada.'); continue; }
          declaredSize(stat.size);
          const entry = makeEntry(logical, stat.size, 'file', invalid ?? claimPath(logical, false));
          if (entry.disposition !== 'blocked') entry.hash = await copyRegular(childPath, path.join(entriesDir, entry.id), stat, true);
        }
        progress('inventory', `Inventariando ${processed} entradas…`);
        if (processed % 50 === 0) await yieldToLoop();
      }
      const after = await fs.lstat(directory);
      if (!after.isDirectory() || !sameFile(before, after)) throw new Error('A estrutura da pasta mudou durante a captura. Tente novamente com a origem estável.');
      await assertPhysicalPath(directory);
    };
    await visit(sourcePath, '', original);
  } else {
    if (!original.isFile()) throw new Error('A origem selecionada não é um arquivo ZIP.');
    if (original.size > limits.maxZipBytes) throw new Error('O ZIP excede o tamanho máximo permitido.');
    const zipPath = path.join(sourceDir, 'original.zip');
    sourceHash = await copyRegular(sourcePath, zipPath, original, false);
    const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.open(zipPath, { lazyEntries: true, autoClose: false, decodeStrings: false, validateEntrySizes: true }, (error, result) => error ? reject(error) : resolve(result!)));
    let archiveError: Error | undefined;
    const archiveErrorHandler = (error: Error) => { archiveError = error; };
    zip.on('error', archiveErrorHandler);
    try {
      if (zip.entryCount > limits.maxEntries) throw new Error('O ZIP excede o limite de entradas permitido.');
      while (true) {
        check();
        if (archiveError) throw archiveError;
        const item = await new Promise<yauzl.Entry | undefined>((resolve, reject) => {
          const cleanup = () => { zip.off('entry', onEntry); zip.off('end', onEnd); zip.off('error', onError); };
          const onEntry = (entry: yauzl.Entry) => { cleanup(); resolve(entry); };
          const onEnd = () => { cleanup(); resolve(undefined); };
          const onError = (error: Error) => { cleanup(); reject(error); };
          zip.once('entry', onEntry); zip.once('end', onEnd); zip.once('error', onError); zip.readEntry();
        });
        if (!item) break;
        countEntry();
        const decoded = zipName(item);
        if (decoded.legacyEncoding) warnOnce('legacy-zip-encoding', 'Nomes sem indicação UTF-8 foram interpretados como OEM 850. O ZIP original preserva os bytes dos nomes.');
        const logical = decoded.name.replace(/\\/g, '/');
        const unixType = (item.externalFileAttributes >>> 16) & 0xf000;
        const isLink = unixType === 0xa000;
        const isDirectory = /\/$/.test(logical) || unixType === 0x4000;
        const invalid = unsafePath(logical, limits.maxPathLength);
        if (isDirectory && !isLink) {
          directories++;
          const blocked = invalid ?? claimPath(logical, true);
          if (blocked) warnings.push({ code: 'blocked-directory', message: `Diretório não materializado: ${logical.slice(0, 200)}. ${blocked}` });
          continue;
        }
        declaredSize(item.uncompressedSize);
        if (item.uncompressedSize > 1024 ** 2 && item.uncompressedSize / Math.max(1, item.compressedSize) > limits.maxCompressionRatio) throw new Error('O ZIP excede a taxa de expansão permitida.');
        const special = unixType !== 0 && unixType !== 0x8000 && !isLink;
        const blocked = invalid ?? (isLink ? 'Link do ZIP preservado somente no arquivo original; destino não seguido.' : special ? 'Entrada especial do ZIP preservada somente no arquivo original.' : (item.generalPurposeBitFlag & 1) ? 'Entrada criptografada preservada no ZIP; extração não suportada.' : claimPath(logical, false));
        const entry = makeEntry(logical, item.uncompressedSize, isLink ? 'symlink' : 'file', blocked);
        if (entry.disposition !== 'blocked') {
          const stream = await new Promise<Readable>((resolve, reject) => zip.openReadStream(item, (error, result) => error ? reject(error) : resolve(result!)));
          entry.hash = await writeStream(stream, path.join(entriesDir, entry.id), item.uncompressedSize, true, item.crc32);
        }
        progress('inventory', `Inventariando ${processed} entradas…`, false, zip.entryCount);
        if (processed % 50 === 0) await yieldToLoop();
      }
      if (archiveError) throw archiveError;
    } finally { zip.close(); }
  }

  const transfer = await restoreWorkspaceTransfer(files, entriesDir, limits, check);
  if (transfer) {
    files.splice(0, files.length, ...transfer.report.files);
    const parents = new Set<string>();
    for (const file of files) {
      const pieces = file.path.split('/');
      for (let index = 1; index < pieces.length; index++) parents.add(pieces.slice(0, index).join('/'));
    }
    directories = parents.size;
    warnings.push({ code: 'workspace-transfer', message: 'Pacote Workfoli: nome, categorias e decisões anteriores foram restaurados. Revise o conteúdo antes de confirmar. O vínculo com o proprietário deve ser escolhido neste computador.' });
  }
  progress('analyzing', 'Classificando conteúdo e procurando evidências…', true, files.length);
  const hashes = new Map<string, string>();
  const texts: Record<string, string> = {};
  const internalTexts = new Map<string, string>();
  let textBytes = 0;
  for (let index = 0; index < files.length; index++) {
    check();
    const entry = files[index]!;
    if (entry.hash) {
      const existing = hashes.get(entry.hash);
      if (existing) entry.duplicateOf = existing;
      else hashes.set(entry.hash, entry.id);
    }
    if (entry.kind !== 'file' || !entry.hash || entry.sensitive || excludedCategories.has(entry.category)) continue;
    const safetyText = transfer && /\.(?:[cm]?js|tsx?|py|sh|ps1|bat|cmd|ya?ml|toml|xml|sql|ini|config)$/.test(entry.extension);
    if (!textExtensions.has(entry.extension) && !safetyText) { if (entry.disposition !== 'excluded') entry.reason = 'Formato preservado; extração textual não disponível nesta versão.'; continue; }
    if (entry.size > limits.maxTextBytes) { if (entry.disposition !== 'excluded') entry.reason = 'Preservado; excede o limite de análise textual por arquivo.'; continue; }
    if (textBytes + entry.size > limits.maxTotalTextBytes) { entry.reason = 'Preservado; limite total de análise textual atingido.'; warnOnce('text-budget', 'Alguns textos foram preservados sem análise por atingir o limite total de leitura.'); continue; }
    const bytes = await fs.readFile(path.join(entriesDir, entry.id));
    textBytes += bytes.length;
    const content = decodeText(bytes);
    if (content === undefined) { entry.reason = 'Preservado; conteúdo binário em extensão textual.'; continue; }
    if (sensitiveText(content)) {
      entry.sensitive = true; entry.disposition = 'restricted'; entry.reason = 'Indício de segredo ou material reservado; fora de busca, prévia e conhecimento.';
      warnings.push({ code: 'restricted-content', message: 'Um arquivo contém indicação de segredo ou conteúdo reservado.', fileId: entry.id });
      continue;
    }
    if (!textExtensions.has(entry.extension)) { entry.reason = 'Texto verificado para indicação de conteúdo reservado; código mantido inativo, sem indexação.'; continue; }
    internalTexts.set(entry.id, content);
    if (entry.disposition !== 'excluded') { entry.disposition = 'indexed'; entry.reason = 'Texto extraído localmente; conteúdo tratado como dados inativos.'; texts[entry.id] = content; }
    if (index % 50 === 0) { progress('analyzing', `Analisando arquivos ${index + 1}/${files.length}…`); await yieldToLoop(); }
  }

  const interpreted = transfer ? { ...finishTransferSafety(transfer, files), warnings: [] as ImportWarning[] } : interpret(files, internalTexts);
  const { legacy, projects, knowledge, warnings: interpretationWarnings } = interpreted;
  let base: ImportReport['base'];
  const baseMarkers = files.filter(file => /(?:^|\/)workfoli\.base\.json$/i.test(file.path));
  if (baseMarkers.length > 1) warnings.push({ code: 'base-ambiguous', message: 'Há mais de uma Base nesta origem. Os arquivos foram preservados, sem escolher uma configuração automaticamente.' });
  else if (baseMarkers.length === 1) {
    const marker = baseMarkers[0]!;
    try {
      const content = internalTexts.get(marker.id);
      if (!content || marker.disposition !== 'indexed' || marker.sensitive) throw new Error('unavailable');
      const manifest = validateBaseManifest(JSON.parse(content));
      base = { manifest, evidence: { fileId: marker.id, path: marker.path } };
      warnings.push({ code: 'workfoli-base', message: 'Base Workfoli reconhecida. Perfil e módulos são configuração declarativa; não concedem acesso nem executam recursos.' });
    } catch { warnings.push({ code: 'base-invalid', message: 'O manifesto da Base não é compatível ou não está disponível para leitura segura. A origem foi preservada sem ativar sua configuração.', fileId: marker.id }); }
  }
  if (transfer?.excludedKnowledge) warnings.push({ code: 'transfer-knowledge-restricted', message: `${transfer.excludedKnowledge} registros de conhecimento foram excluídos pela política de segurança atual ou por falta de texto verificável.` });
  warnings.push(...interpretationWarnings);
  const regular = files.filter(entry => entry.kind === 'file');
  const categories: Record<string, number> = {};
  for (const entry of regular) categories[entry.category] = (categories[entry.category] ?? 0) + 1;
  const sourceName = path.basename(sourcePath);
  const report: ImportReport = {
    id: options.runId, sourceName, sourceType: options.sourceType, ...(sourceHash ? { sourceHash } : {}),
    createdAt: new Date().toISOString(), suggestedName: transfer?.name ?? base?.manifest.company.name ?? sourceName.replace(/\.zip$/i, ''), schemaVersion: 1,
    ...(base ? { base } : {}),
    knowledgeAnalysis: transfer?.report.knowledgeAnalysis ?? { version: KNOWLEDGE_VERSION, at: new Date().toISOString() },
    files, projects, knowledge, legacy,
    summary: {
      files: regular.length, links: files.length - regular.length, directories, bytes: regular.reduce((total, entry) => total + entry.size, 0),
      indexed: regular.filter(entry => entry.disposition === 'indexed').length,
      restricted: regular.filter(entry => entry.disposition === 'restricted').length,
      blocked: files.filter(entry => entry.disposition === 'blocked').length,
      excluded: regular.filter(entry => entry.disposition === 'excluded').length,
      duplicates: regular.filter(entry => !!entry.duplicateOf).length, categories,
    }, warnings,
  };
  check();
  await fs.writeFile(path.join(staging, 'manifest.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  progress('review', 'Inventário pronto para revisão.', true, processed);
  return { report, texts };
}
