import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';

export class InstanceError extends Error {}

/** `child` está dentro de `parent` (ou é o próprio)? Comparação sem diferenciar maiúsculas no Windows. */
export function isInside(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

export function samePath(a: string, b: string): boolean {
  const left = path.resolve(a), right = path.resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/** Recusa links/junctions em qualquer componente abaixo de `root`. */
export function assertRealPath(target: string, root?: string): void {
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) return;
  const real = fs.realpathSync.native(resolved);
  if (!samePath(real, resolved)) throw new InstanceError('Links simbólicos ou junctions não são aceitos nas pastas da instância.');
  if (root && !isInside(resolved, root)) throw new InstanceError('Caminho fora da pasta permitida.');
}

export function readJsonFile(file: string, maxBytes = 2 * 1024 * 1024): unknown {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new InstanceError(`Arquivo inválido: ${path.basename(file)}.`);
  if (stat.size > maxBytes) throw new InstanceError(`Arquivo grande demais: ${path.basename(file)}.`);
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  try { return JSON.parse(text) as unknown; } catch { throw new InstanceError(`JSON inválido em ${path.basename(file)}.`); }
}

/** Grava via arquivo temporário + rename: leitores nunca veem um arquivo pela metade. */
export function writeFileAtomic(file: string, data: string | Buffer, options: { exclusive?: boolean; mode?: number } = {}): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (options.exclusive && fs.existsSync(file)) throw new InstanceError(`Já existe: ${path.basename(file)}.`);
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  const handle = fs.openSync(temporary, 'wx', options.mode ?? 0o644);
  try {
    fs.writeSync(handle, typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
    fs.fsyncSync(handle);
  } finally { fs.closeSync(handle); }
  try { fs.renameSync(temporary, file); }
  catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
}

export function writeJsonAtomic(file: string, value: unknown, options: { exclusive?: boolean } = {}): void {
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`, options);
}

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function sha256File(file: string): string {
  return sha256(fs.readFileSync(file));
}

export interface CopyFilter { (relative: string, entry: fs.Dirent): boolean; }

/** Copia uma árvore sem seguir links. Não sobrescreve: destino precisa estar vazio ou inexistente. */
export function copyTree(source: string, destination: string, filter: CopyFilter): string[] {
  const copied: string[] = [];
  const walk = (dir: string, relative: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink() || !filter(rel, entry)) continue;
      const from = path.join(dir, entry.name), to = path.join(destination, ...rel.split('/'));
      if (entry.isDirectory()) { fs.mkdirSync(to, { recursive: true }); walk(from, rel); }
      else if (entry.isFile()) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
        copied.push(rel);
      }
    }
  };
  walk(source, '');
  return copied;
}

export function isEmptyDir(dir: string): boolean {
  return !fs.existsSync(dir) || (fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length === 0);
}

/** Lista arquivos regulares (relativos, com /) sem seguir links. */
export function listFiles(root: string, filter: CopyFilter, limit = 20_000): string[] {
  const files: string[] = [];
  const walk = (dir: string, relative: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink() || !filter(rel, entry)) continue;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (entry.isFile()) { files.push(rel); if (files.length > limit) throw new InstanceError('Pasta com arquivos demais para esta operação.'); }
    }
  };
  walk(root, '');
  return files.sort();
}
