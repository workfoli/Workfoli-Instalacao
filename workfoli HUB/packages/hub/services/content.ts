import path from 'node:path';
import type { BaseManifest } from '../../contract/workfoli-contract.mjs';
import { documentExcerpt, documentTitle, knowledgeRoots } from '../base-scan.js';
import type { SnapshotFile } from '../base-scan.js';
import { PROJECT_TYPE_LABELS } from '../base-changes.js';
import { can } from '../permissions.js';
import { canSeeVisibility } from '../runtime.js';
import type { Actor, HubRuntime } from '../runtime.js';
import { HttpError } from '../http.js';

const within = (file: string, root: string) => file.toLowerCase() === root.toLowerCase() || file.toLowerCase().startsWith(`${root.toLowerCase()}/`);

function manifest(runtime: HubRuntime): BaseManifest {
  return runtime.base.snapshot().manifest;
}

/**
 * Caminhos da Base que o ator não vê: pastas e arquivos de projetos, serviços, assets e recursos marcados
 * `restricted` (exigem `restricted:read`). Vale para todas as rotas: conhecimento, arquivos, imagens e anexos.
 */
export function hiddenBasePaths(current: BaseManifest, actor: Actor): string[] {
  return [...current.projects, ...current.services, ...current.assets, ...current.resources]
    .filter(item => item.path && !canSeeVisibility(actor, item.visibility))
    .map(item => item.path!.replace(/\/$/, ''));
}

/** O arquivo da Base está fora das áreas restritas que o ator não pode ver? */
export function baseFileVisible(current: BaseManifest, actor: Actor, file: string): boolean {
  return !hiddenBasePaths(current, actor).some(hidden => within(file, hidden));
}

export function companyView(runtime: HubRuntime, actor: Actor) {
  const current = manifest(runtime);
  const assetUrl = (file: string | null | undefined) => file ? `/api/base/image?path=${encodeURIComponent(file)}` : null;
  return {
    company: current.company,
    profile: current.profile,
    identity: {
      colors: current.identity.colors ?? {}, typography: current.identity.typography ?? {}, voice: current.identity.voice ?? {},
      guide: current.identity.guide ?? null, logo: assetUrl(current.identity.logo), symbol: assetUrl(current.identity.symbol),
    },
    services: current.services.filter(service => canSeeVisibility(actor, service.visibility)),
    resources: current.resources.filter(resource => canSeeVisibility(actor, resource.visibility)).map(resource => ({ ...resource, path: resource.path ?? null })),
    assets: current.assets.filter(asset => canSeeVisibility(actor, asset.visibility)).map(asset => ({ ...asset, url: /\.(?:png|jpe?g|webp|gif|svg)$/i.test(asset.path) ? assetUrl(asset.path) : null })),
  };
}

export interface DocumentInfo { path: string; title: string; folder: string; excerpt: string; size: number; modifiedAt: string | null; }

function folderLabel(current: BaseManifest, file: string): string {
  if (within(file, current.context.memory)) return 'Memória da empresa';
  const service = current.services.find(item => item.path && within(file, item.path));
  if (service) return `Serviço · ${service.name}`;
  const project = current.projects.find(item => item.path && within(file, item.path));
  if (project) return `Projeto · ${project.name}`;
  const top = file.split('/')[0] ?? '';
  const names: Record<string, string> = { processos: 'Processos', conhecimento: 'Conhecimento', servicos: 'Serviços', projetos: 'Projetos', marketing: 'Marketing', identidade: 'Identidade', infraestrutura: 'Infraestrutura' };
  return names[top] ?? top;
}

export function listDocuments(runtime: HubRuntime, actor: Actor): DocumentInfo[] {
  const snapshot = runtime.base.snapshot();
  const current = snapshot.manifest;
  const hidden = hiddenBasePaths(current, actor);
  return snapshot.files
    .filter(file => file.kind === 'document' && !file.restricted && file.content !== undefined)
    .filter(file => knowledgeRoots(current).some(root => within(file.path, root)) || file.path === current.identity.guide)
    .filter(file => !hidden.some(path => within(file.path, path)))
    .map(file => ({ path: file.path, title: documentTitle(file.path, file.content), folder: folderLabel(current, file.path), excerpt: documentExcerpt(file.content), size: file.size, modifiedAt: file.modifiedAt }));
}

export function readDocument(runtime: HubRuntime, actor: Actor, file: unknown) {
  if (typeof file !== 'string') throw new HttpError(400, 'Documento inválido.');
  const info = listDocuments(runtime, actor).find(item => item.path === file);
  if (!info) throw new HttpError(404, 'Documento não encontrado ou sem permissão.');
  const text = runtime.base.readText(file);
  if (!text) throw new HttpError(404, 'Documento indisponível.');
  return { ...info, content: text.content };
}

export function listProjects(runtime: HubRuntime, actor: Actor) {
  const current = manifest(runtime);
  const counts = new Map<string, { open: number; done: number }>();
  for (const row of runtime.db.prepare("SELECT project_id, SUM(status<>'done') AS open, SUM(status='done') AS done FROM tasks WHERE project_id IS NOT NULL GROUP BY project_id").all() as Array<{ project_id: string; open: number; done: number }>) {
    counts.set(row.project_id, { open: Number(row.open), done: Number(row.done) });
  }
  const services = new Map(current.services.map(service => [service.id, service.name]));
  const pending = runtime.config.mode === 'remote' && can(actor.permissions, 'projects:read')
    ? (runtime.db.prepare("SELECT id,payload,created_at FROM base_commands WHERE type='project.create' AND status IN ('queued','delivered') ORDER BY created_at").all() as Array<{ id: string; payload: string; created_at: string }>)
      .map(row => ({ commandId: row.id, name: (JSON.parse(row.payload) as { project: { name: string } }).project.name, createdAt: row.created_at }))
    : [];
  return {
    projects: current.projects.filter(project => canSeeVisibility(actor, project.visibility)).map(project => ({
      ...project, typeLabel: PROJECT_TYPE_LABELS[project.type], services: (project.services ?? []).map(id => ({ id, name: services.get(id) ?? id })),
      tasks: counts.get(project.id) ?? { open: 0, done: 0 },
    })),
    pending,
    types: Object.entries(PROJECT_TYPE_LABELS).map(([id, label]) => ({ id, label })),
    services: current.services.filter(service => canSeeVisibility(actor, service.visibility)).map(service => ({ id: service.id, name: service.name })),
  };
}

export function projectDetail(runtime: HubRuntime, actor: Actor, id: string) {
  const project = listProjects(runtime, actor).projects.find(item => item.id === id);
  if (!project) throw new HttpError(404, 'Projeto não encontrado.');
  const readmePath = project.path ? `${project.path}/README.md` : null;
  const readme = readmePath ? runtime.base.readText(readmePath) : null;
  const documents = listDocuments(runtime, actor).filter(doc => project.path && within(doc.path, project.path));
  return { project, readme: readme?.content ?? null, documents };
}

export interface FileNode { path: string; name: string; size: number; kind: SnapshotFile['kind']; restricted: boolean; modifiedAt: string | null; viewable: boolean; }

export function listBaseFiles(runtime: HubRuntime, actor: Actor): { files: FileNode[]; truncated: boolean; mode: string } {
  const snapshot = runtime.base.snapshot();
  const seeRestricted = can(actor.permissions, 'restricted:read');
  const hidden = hiddenBasePaths(snapshot.manifest, actor);
  const local = runtime.base.mode === 'local';
  return {
    mode: runtime.base.mode, truncated: snapshot.truncated,
    files: snapshot.files.filter(file => (seeRestricted || !file.restricted) && !hidden.some(path => within(file.path, path))).map(file => ({
      path: file.path, name: path.posix.basename(file.path), size: file.size, kind: file.kind, restricted: file.restricted, modifiedAt: file.modifiedAt,
      viewable: !file.restricted && (file.kind === 'document' || file.kind === 'image' ? file.content !== undefined : file.kind === 'text' && local),
    })),
  };
}

export function readBaseFile(runtime: HubRuntime, actor: Actor, file: unknown) {
  if (typeof file !== 'string') throw new HttpError(400, 'Arquivo inválido.');
  const node = listBaseFiles(runtime, actor).files.find(item => item.path === file);
  if (!node || !node.viewable) throw new HttpError(404, 'Arquivo indisponível para visualização.');
  if (node.kind === 'image') return { kind: 'image' as const, path: file, url: `/api/base/image?path=${encodeURIComponent(file)}` };
  const text = runtime.base.readText(file);
  if (!text) throw new HttpError(404, 'Arquivo indisponível para visualização.');
  return { kind: 'text' as const, path: file, content: text.content, truncated: text.truncated };
}

export function readBaseImage(runtime: HubRuntime, file: unknown, options: { publicOnly: true } | { actor: Actor }) {
  if (typeof file !== 'string') throw new HttpError(400, 'Imagem inválida.');
  const current = manifest(runtime);
  if ('publicOnly' in options) {
    // Antes do login só a marca da empresa (logo/símbolo) pode ser vista.
    if (file !== current.identity.logo && file !== current.identity.symbol) throw new HttpError(404, 'Imagem não encontrada.');
  } else if (!baseFileVisible(current, options.actor, file)) throw new HttpError(404, 'Imagem não encontrada.');
  const image = runtime.base.readImage(file);
  if (!image) throw new HttpError(404, 'Imagem não encontrada.');
  return image;
}

export interface BaseTaskSection { title: string; items: Array<{ text: string; done: boolean }>; }

/** Pendências registradas pelos agentes em `tarefas.md` (somente leitura no Hub). */
export function baseTasks(runtime: HubRuntime): BaseTaskSection[] {
  const current = manifest(runtime);
  if (!current.context.tasks) return [];
  const text = runtime.base.readText(current.context.tasks);
  if (!text) return [];
  const sections: BaseTaskSection[] = [];
  let section: BaseTaskSection | null = null;
  for (const line of text.content.split(/\r?\n/)) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) { section = { title: heading[1]!.trim(), items: [] }; sections.push(section); continue; }
    const item = /^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/.exec(line);
    // Texto puro para a interface: remove marcação inline (código e negrito), mantém o conteúdo.
    if (item && section) section.items.push({ text: item[2]!.replace(/`([^`]*)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').trim().slice(0, 300), done: item[1] !== ' ' });
  }
  return sections;
}
