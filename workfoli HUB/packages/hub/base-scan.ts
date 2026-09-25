import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import type { BaseManifest } from '../contract/workfoli-contract.mjs';
import { isSafeRelativePath } from '../contract/workfoli-contract.mjs';
import { detectSensitivity, restrictedName } from '../core/sensitivity.js';

/**
 * Leitura da Base para o Hub. Regras (iguais no modo local e no Local Agent):
 * - nunca segue links; ignora .git, node_modules, pastas ocultas e pastas privadas do manifesto;
 * - conteúdo só de documentos de conhecimento (.md/.txt nas raízes de contexto) e imagens de identidade;
 * - arquivos com nome reservado ou com credenciais/registros pessoais ficam "restritos" (sem conteúdo).
 */
export type SnapshotKind = 'document' | 'text' | 'image' | 'other';
export interface SnapshotFile {
  path: string; size: number; hash: string; kind: SnapshotKind; restricted: boolean; modifiedAt: string | null;
  /** Texto (documentos) ou base64 (imagens de identidade). Ausente nos demais arquivos. */
  content?: string;
}
export interface BaseSnapshot { revision: string; manifestHash: string; manifest: BaseManifest; files: SnapshotFile[]; takenAt: string; truncated: boolean; }

export const SCAN_LIMITS = Object.freeze({ files: 5_000, depth: 14, documentBytes: 512 * 1024, imageBytes: 2 * 1024 * 1024, textPreviewBytes: 256 * 1024, totalContentBytes: 24 * 1024 * 1024 });
const DOCUMENT = /\.(?:md|markdown|txt)$/i;
const TEXT = /\.(?:json|csv|tsv|ya?ml|html?|css|[cm]?[jt]sx?|xml|toml|ini|svg)$/i;
const IMAGE = /\.(?:png|jpe?g|webp|gif|svg)$/i;
const ALWAYS_SKIPPED = new Set(['.git', 'node_modules', '.workfoli', '.next', 'dist', 'build', '.cache', '.vercel', '.turbo']);

export function mimeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' } as Record<string, string>)[ext] ?? 'application/octet-stream';
}

/** Raízes cujo texto vira conhecimento (memória, contexto, serviços e projetos declarados). */
export function knowledgeRoots(manifest: BaseManifest): string[] {
  const roots = [manifest.context.memory, ...manifest.context.knowledge,
    ...manifest.services.map(service => service.path).filter((value): value is string => !!value),
    ...manifest.projects.map(project => project.path).filter((value): value is string => !!value)];
  return [...new Set(roots.map(root => root.replace(/\/$/, '')))];
}

/** Imagens que o Hub pode exibir: pasta de identidade e assets declarados. */
export function imageRoots(manifest: BaseManifest): string[] {
  return [manifest.context.identity, ...manifest.assets.map(asset => asset.path), manifest.identity.logo, manifest.identity.symbol]
    .filter((value): value is string => !!value);
}

const within = (file: string, root: string) => file.toLowerCase() === root.toLowerCase() || file.toLowerCase().startsWith(`${root.toLowerCase()}/`);

export function scanBase(baseDir: string, manifest: BaseManifest, manifestHash: string): BaseSnapshot {
  const root = path.resolve(baseDir);
  const privateRoots = manifest.data.private.map(value => value.toLowerCase());
  const docs = knowledgeRoots(manifest);
  const images = imageRoots(manifest);
  const extraDocs = [manifest.context.tasks, manifest.identity.guide].filter((value): value is string => !!value);
  const files: SnapshotFile[] = [];
  let truncated = false;
  let contentBytes = 0;

  const walk = (dir: string, relative: string, depth: number) => {
    if (depth > SCAN_LIMITS.depth || truncated) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (!isSafeRelativePath(rel)) continue;
      if (entry.isDirectory()) {
        if (ALWAYS_SKIPPED.has(entry.name.toLowerCase()) || privateRoots.some(value => within(rel, value))) continue;
        walk(path.join(dir, entry.name), rel, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= SCAN_LIMITS.files) { truncated = true; return; }
      const full = path.join(dir, entry.name);
      let stat: fs.Stats;
      try { stat = fs.lstatSync(full); } catch { continue; }
      if (!stat.isFile()) continue;
      const isDocument = DOCUMENT.test(entry.name) && (docs.some(value => within(rel, value)) || extraDocs.some(value => value.toLowerCase() === rel.toLowerCase()));
      const isImage = IMAGE.test(entry.name) && images.some(value => within(rel, value));
      const kind: SnapshotKind = isDocument ? 'document' : isImage ? 'image' : DOCUMENT.test(entry.name) || TEXT.test(entry.name) ? 'text' : 'other';
      const file: SnapshotFile = { path: rel, size: stat.size, hash: `${stat.size}-${Math.trunc(stat.mtimeMs)}`, kind, restricted: restrictedName(rel), modifiedAt: stat.mtime.toISOString() };
      const readable = (kind === 'document' && stat.size <= SCAN_LIMITS.documentBytes) || (kind === 'image' && stat.size <= SCAN_LIMITS.imageBytes);
      if (!file.restricted && readable && contentBytes + stat.size <= SCAN_LIMITS.totalContentBytes) {
        const bytes = fs.readFileSync(full);
        file.hash = createHash('sha256').update(bytes).digest('hex');
        if (kind === 'document') {
          const text = bytes.toString('utf8').replace(/^﻿/, '');
          const sensitivity = detectSensitivity(text);
          if (sensitivity.credentials || sensitivity.personalRecords) file.restricted = true;
          else file.content = text;
        } else if (!(kind === 'image' && file.path.toLowerCase().endsWith('.svg') && /<script|on[a-z]+\s*=|javascript:/i.test(bytes.toString('utf8')))) {
          file.content = bytes.toString('base64');
        } else file.restricted = true;
        if (file.content !== undefined) contentBytes += stat.size;
      } else if (kind === 'text' && !file.restricted && stat.size <= SCAN_LIMITS.textPreviewBytes) {
        // Texto técnico: só verifica credenciais para marcar restrição; conteúdo lido sob demanda (modo local).
        try { if (detectSensitivity(fs.readFileSync(full, 'utf8')).credentials) file.restricted = true; } catch { /* unreadable */ }
      }
      files.push(file);
    }
  };
  walk(root, '', 0);
  const revision = createHash('sha256').update(manifestHash).update(files.map(file => `${file.path}\u0000${file.hash}\u0000${file.restricted ? 1 : 0}`).join('\n')).digest('hex');
  return { revision, manifestHash, manifest, files, takenAt: new Date().toISOString(), truncated };
}

/** Título de um documento: primeiro cabeçalho Markdown, ou o nome do arquivo. */
export function documentTitle(file: string, content: string | undefined): string {
  const heading = content?.split(/\r?\n/).find(line => /^#{1,3}\s+\S/.test(line));
  if (heading) return heading.replace(/^#{1,3}\s+/, '').replace(/[*_`]/g, '').trim().slice(0, 140);
  return path.posix.basename(file).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
}

export function documentExcerpt(content: string | undefined): string {
  if (!content) return '';
  const lines = content.split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^(?:#|>|\||-{3,}|```|<!--)/.test(line));
  return (lines[0] ?? '').replace(/[*_`]/g, '').slice(0, 220);
}
