import * as fs from 'node:fs';
import path from 'node:path';
import { formatIssues, isSafeRelativePath, validateBaseManifest } from '../contract/workfoli-contract.mjs';
import type { BaseManifest } from '../contract/workfoli-contract.mjs';
import { detectSensitivity, restrictedName } from '../core/sensitivity.js';
import { readBaseManifest } from '../instance/base.js';
import type { HubDatabase } from './db.js';
import { getMeta, now, setMeta, transaction } from './db.js';
import { SCAN_LIMITS, mimeFor, scanBase } from './base-scan.js';
import type { BaseSnapshot, SnapshotFile } from './base-scan.js';

export class BaseUnavailableError extends Error {}

export interface BaseStatus {
  mode: 'local' | 'remote'; available: boolean; revision: string | null; updatedAt: string | null; message: string | null; truncated: boolean;
}

/** Leitura da Base pelo Hub. Duas fontes, mesma interface: disco (local) ou snapshot do Local Agent (remoto). */
export interface BaseAccess {
  readonly mode: 'local' | 'remote';
  snapshot(): BaseSnapshot;
  status(): BaseStatus;
  /** Texto de um arquivo não restrito (documentos sempre; texto técnico só no modo local). */
  readText(file: string): { content: string; truncated: boolean } | null;
  readImage(file: string): { mime: string; bytes: Buffer } | null;
  invalidate(): void;
}

export class FsBaseAccess implements BaseAccess {
  readonly mode = 'local' as const;
  private cache: { at: number; snapshot: BaseSnapshot } | null = null;
  private lastError: string | null = null;
  constructor(readonly baseDir: string, private readonly ttlMs = 3_000) {}

  snapshot(): BaseSnapshot {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.snapshot;
    try {
      const { manifest, hash } = readBaseManifest(this.baseDir, 'active');
      const snapshot = scanBase(this.baseDir, manifest, hash);
      this.cache = { at: Date.now(), snapshot };
      this.lastError = null;
      return snapshot;
    } catch (error) {
      this.lastError = (error as Error).message;
      // Mantém a última leitura válida: um erro de edição na Base não derruba o Hub.
      if (this.cache) return this.cache.snapshot;
      throw new BaseUnavailableError(`A Base não pôde ser lida: ${this.lastError}`);
    }
  }

  status(): BaseStatus {
    try {
      const snapshot = this.snapshot();
      return { mode: 'local', available: true, revision: snapshot.revision, updatedAt: snapshot.takenAt, message: this.lastError, truncated: snapshot.truncated };
    } catch (error) {
      return { mode: 'local', available: false, revision: null, updatedAt: null, message: (error as Error).message, truncated: false };
    }
  }

  private entry(file: string): SnapshotFile | undefined {
    if (!isSafeRelativePath(file)) return undefined;
    return this.snapshot().files.find(item => item.path === file);
  }

  readText(file: string) {
    const entry = this.entry(file);
    if (!entry || entry.restricted || (entry.kind !== 'document' && entry.kind !== 'text')) return null;
    if (entry.content !== undefined) return { content: entry.content, truncated: false };
    const full = path.join(this.baseDir, ...file.split('/'));
    const stat = fs.lstatSync(full);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const bytes = fs.readFileSync(full).subarray(0, SCAN_LIMITS.textPreviewBytes);
    const content = bytes.toString('utf8');
    const sensitivity = detectSensitivity(content);
    if (sensitivity.credentials || sensitivity.personalRecords) return null;
    return { content, truncated: stat.size > SCAN_LIMITS.textPreviewBytes };
  }

  readImage(file: string) {
    const entry = this.entry(file);
    if (!entry || entry.restricted || entry.kind !== 'image' || entry.content === undefined) return null;
    return { mime: mimeFor(file), bytes: Buffer.from(entry.content, 'base64') };
  }

  invalidate(): void { this.cache = null; }
}

/** Snapshot recebido do Local Agent e guardado no banco da instância (modo remoto). */
export class SnapshotBaseAccess implements BaseAccess {
  readonly mode = 'remote' as const;
  private cache: BaseSnapshot | null = null;
  constructor(private readonly db: HubDatabase) {}

  snapshot(): BaseSnapshot {
    if (this.cache) return this.cache;
    const manifestText = getMeta(this.db, 'snapshot.manifest');
    if (!manifestText) throw new BaseUnavailableError('Aguardando o computador da Base conectar o Local Agent.');
    const result = validateBaseManifest(JSON.parse(manifestText), { expect: 'active' });
    if (!result.ok || !result.value) throw new BaseUnavailableError('O último manifesto recebido é inválido.');
    const rows = this.db.prepare('SELECT path,hash,size,kind,restricted,content,modified_at FROM snapshot_files ORDER BY path').all() as Array<Record<string, unknown>>;
    this.cache = {
      revision: getMeta(this.db, 'snapshot.revision') ?? '', manifestHash: getMeta(this.db, 'snapshot.manifestHash') ?? '', manifest: result.value,
      takenAt: getMeta(this.db, 'snapshot.takenAt') ?? '', truncated: getMeta(this.db, 'snapshot.truncated') === '1',
      files: rows.map(row => ({
        path: String(row.path), hash: String(row.hash), size: Number(row.size), kind: row.kind as SnapshotFile['kind'], restricted: Number(row.restricted) === 1,
        modifiedAt: (row.modified_at as string | null) ?? null, ...(row.content === null || row.content === undefined ? {} : { content: String(row.content) }),
      })),
    };
    return this.cache;
  }

  status(): BaseStatus {
    try {
      const snapshot = this.snapshot();
      return { mode: 'remote', available: true, revision: snapshot.revision, updatedAt: getMeta(this.db, 'snapshot.receivedAt') ?? snapshot.takenAt, message: null, truncated: snapshot.truncated };
    } catch (error) {
      return { mode: 'remote', available: false, revision: null, updatedAt: null, message: (error as Error).message, truncated: false };
    }
  }

  readText(file: string) {
    const entry = this.snapshot().files.find(item => item.path === file);
    if (!entry || entry.restricted || entry.kind !== 'document' || entry.content === undefined) return null;
    return { content: entry.content, truncated: false };
  }

  readImage(file: string) {
    const entry = this.snapshot().files.find(item => item.path === file);
    if (!entry || entry.restricted || entry.kind !== 'image' || entry.content === undefined) return null;
    return { mime: mimeFor(file), bytes: Buffer.from(entry.content, 'base64') };
  }

  invalidate(): void { this.cache = null; }

  /**
   * Recebe um snapshot do Agent. O Hub não confia no Agent para política: revalida manifesto, caminhos,
   * tamanhos, restrições por nome e sensibilidade do conteúdo antes de gravar.
   */
  receive(input: unknown, deviceId: string): { changed: boolean; revision: string; files: number } {
    const body = input as Partial<BaseSnapshot> | null;
    if (!body || typeof body !== 'object' || !Array.isArray(body.files) || typeof body.revision !== 'string' || !/^[a-f0-9]{64}$/.test(body.revision)) throw new Error('Snapshot inválido.');
    const validated = validateBaseManifest(body.manifest, { expect: 'active' });
    if (!validated.ok || !validated.value) throw new Error(`Manifesto inválido no snapshot:\n${formatIssues(validated.errors)}`);
    const manifest = validated.value;
    if (body.files.length > SCAN_LIMITS.files) throw new Error('Snapshot com arquivos demais.');
    const expectedBase = getMeta(this.db, 'snapshot.baseId');
    if (expectedBase && expectedBase !== manifest.baseId) throw new Error('Este Hub está ligado a outra Base. Snapshot recusado.');
    if (getMeta(this.db, 'snapshot.revision') === body.revision) {
      setMeta(this.db, 'snapshot.receivedAt', now());
      return { changed: false, revision: body.revision, files: body.files.length };
    }
    const files: SnapshotFile[] = [];
    let contentBytes = 0;
    const seen = new Set<string>();
    for (const raw of body.files) {
      const file = raw as Partial<SnapshotFile>;
      if (!file || typeof file.path !== 'string' || !isSafeRelativePath(file.path) || seen.has(file.path.toLowerCase())) throw new Error('Caminho inválido ou repetido no snapshot.');
      seen.add(file.path.toLowerCase());
      if (!['document', 'text', 'image', 'other'].includes(String(file.kind)) || !Number.isSafeInteger(file.size) || (file.size ?? -1) < 0 || typeof file.hash !== 'string' || file.hash.length > 80) throw new Error('Metadados inválidos no snapshot.');
      const entry: SnapshotFile = { path: file.path, kind: file.kind!, size: file.size!, hash: file.hash, restricted: file.restricted === true || restrictedName(file.path), modifiedAt: typeof file.modifiedAt === 'string' ? file.modifiedAt.slice(0, 40) : null };
      if (typeof file.content === 'string' && !entry.restricted && (entry.kind === 'document' || entry.kind === 'image')) {
        const limit = entry.kind === 'document' ? SCAN_LIMITS.documentBytes * 1.1 : SCAN_LIMITS.imageBytes * 1.4;
        if (file.content.length > limit) throw new Error('Conteúdo acima do limite no snapshot.');
        if (entry.kind === 'document') {
          const sensitivity = detectSensitivity(file.content);
          if (sensitivity.credentials || sensitivity.personalRecords) entry.restricted = true; else entry.content = file.content;
        } else entry.content = file.content;
        contentBytes += file.content.length;
      }
      files.push(entry);
    }
    if (contentBytes > SCAN_LIMITS.totalContentBytes * 1.4) throw new Error('Snapshot acima do limite total.');
    transaction(this.db, () => {
      this.db.exec('DELETE FROM snapshot_files');
      const insert = this.db.prepare('INSERT INTO snapshot_files(path,hash,size,kind,restricted,content,modified_at,updated_at) VALUES (?,?,?,?,?,?,?,?)');
      for (const file of files) insert.run(file.path, file.hash, file.size, file.kind, file.restricted ? 1 : 0, file.content ?? null, file.modifiedAt, now());
      setMeta(this.db, 'snapshot.manifest', JSON.stringify(manifest));
      setMeta(this.db, 'snapshot.manifestHash', typeof body.manifestHash === 'string' ? body.manifestHash.slice(0, 64) : '');
      setMeta(this.db, 'snapshot.revision', body.revision!);
      setMeta(this.db, 'snapshot.takenAt', typeof body.takenAt === 'string' ? body.takenAt.slice(0, 40) : now());
      setMeta(this.db, 'snapshot.receivedAt', now());
      setMeta(this.db, 'snapshot.truncated', body.truncated ? '1' : '0');
      setMeta(this.db, 'snapshot.deviceId', deviceId);
      if (!expectedBase && manifest.baseId) setMeta(this.db, 'snapshot.baseId', manifest.baseId);
    });
    this.cache = null;
    return { changed: true, revision: body.revision, files: files.length };
  }
}

export function manifestOf(access: BaseAccess): BaseManifest {
  return access.snapshot().manifest;
}
