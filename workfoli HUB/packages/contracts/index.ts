import type { BaseManifest } from '../core/base-manifest.js';

export const CATEGORY_LABELS = {
  site: 'Site', identity: 'Identidade', marketing: 'Marketing', content: 'Conteúdo',
  documentation: 'Documentação', data: 'Dados', code: 'Código', legacy: 'Sistema legado',
  media: 'Mídia', other: 'Não classificados', dependencies: 'Dependências',
  history: 'Histórico Git', build: 'Builds', system: 'Sistema',
} as const;
export type Category = keyof typeof CATEGORY_LABELS;
export type Disposition = 'indexed' | 'metadata' | 'restricted' | 'blocked' | 'excluded';
export interface FileEntry {
  id: string; path: string; size: number; hash?: string; extension: string;
  kind: 'file' | 'symlink'; category: Category; disposition: Disposition;
  reason: string; sensitive: boolean; duplicateOf?: string;
  classification?: { method: 'rule' | 'manual'; confidence: 'high' | 'medium' | 'low'; evidence: string };
}
export interface Evidence { fileId: string; path: string; line?: number; endLine?: number; }
export interface KnowledgeItem {
  id: string; field: string; value: string; category: string;
  origin: 'explicit' | 'inferred' | 'user'; status: 'pending' | 'confirmed' | 'rejected';
  originalValue?: string;
  scope?: string;
  evidence: Evidence; conflict?: boolean;
}
export interface Project {
  id: string; name: string; root: string; type: 'website' | 'software' | 'legacy';
  description: string; evidence: Evidence[];
}
export interface ImportWarning { code: string; message: string; fileId?: string; }
export interface ImportSummary {
  files: number; links: number; directories: number; bytes: number;
  indexed: number; restricted: number; blocked: number; excluded: number; duplicates: number;
  categories: Record<string, number>;
}
export interface ImportReport {
  id: string; sourceName: string; sourceType: 'zip' | 'folder'; sourceHash?: string;
  createdAt: string; suggestedName: string; schemaVersion: 1;
  files: FileEntry[]; projects: Project[]; knowledge: KnowledgeItem[];
  legacy: { detected: boolean; evidence: Evidence[]; versions: string[] };
  summary: ImportSummary; warnings: ImportWarning[];
  knowledgeAnalysis?: { version: number; at: string };
  base?: { manifest: BaseManifest; evidence: Evidence };
}
export interface Progress {
  runId: string; phase: 'copying' | 'inventory' | 'analyzing' | 'review' | 'cancelled' | 'error';
  message: string; processed: number; total?: number;
}
export interface WorkspaceSummary {
  id: string; name: string; createdAt: string; files: number; projects: number;
  knowledge: number; sourceName: string; legacy: boolean;
  relationship: WorkspaceRelationship;
}
export type WorkspaceRelationship = 'company' | 'client';
export interface EnvironmentProfile {
  schemaVersion: 1; instanceId: string;
  company: { id: string; name: string; workspaceId?: string };
  user: { id: string; name: string };
  createdAt: string; updatedAt: string;
}
export interface EnvironmentInput { companyName: string; userName: string; }
export interface ContextRequest { scope: 'company' | 'portfolio' | 'workspace'; workspaceId?: string; }
export interface ContextSnapshot {
  scope: ContextRequest['scope']; environment: EnvironmentProfile;
  company: { workspace?: WorkspaceSummary; knowledge: KnowledgeItem[] };
  clients: Array<{ workspace: WorkspaceSummary; knowledge: KnowledgeItem[] }>;
  generatedAt: string;
}
export interface WorkspaceData { workspace: WorkspaceSummary; report: ImportReport; }
export interface ReviewInput {
  name: string; relationship: WorkspaceRelationship; categories: Record<string, Category>;
  knowledge: Record<string, { status: KnowledgeItem['status']; value?: string }>;
}
export interface FilePreview { kind: 'text' | 'image' | 'unavailable'; content: string; message?: string; }
export interface ReanalysisPreview {
  token: string; added: number; updated: number; removed: number;
  retainedReviewed: number; previousCount: number; knowledge: KnowledgeItem[];
}
export interface WorkfoliApi {
  getEnvironment(): Promise<EnvironmentProfile | null>;
  saveEnvironment(input: EnvironmentInput): Promise<EnvironmentProfile>;
  setWorkspaceRelationship(id: string, relationship: WorkspaceRelationship): Promise<WorkspaceData>;
  getContext(request: ContextRequest): Promise<ContextSnapshot>;
  exportWorkspace(id: string): Promise<{ name: string; files: number; excluded: number } | null>;
  createBackup(password: string): Promise<{ name: string; workspaces: number; files: number } | null>;
  restoreBackup(password: string): Promise<{ directory: string; workspaces: number; files: number } | null>;
  listWorkspaces(): Promise<WorkspaceSummary[]>;
  getWorkspace(id: string): Promise<WorkspaceData>;
  selectSource(kind: 'zip' | 'folder'): Promise<{ token: string; name: string } | null>;
  startImport(token: string): Promise<{ runId: string }>;
  getImport(runId: string): Promise<ImportReport | null>;
  cancelImport(runId: string): Promise<void>;
  confirmImport(runId: string, review: ReviewInput): Promise<WorkspaceData>;
  previewFile(workspaceId: string, fileId: string): Promise<FilePreview>;
  previewImport(runId: string, fileId: string): Promise<FilePreview>;
  searchFiles(workspaceId: string, query: string): Promise<string[]>;
  updateKnowledge(workspaceId: string, id: string, status: KnowledgeItem['status'], value?: string): Promise<WorkspaceData>;
  previewReanalysis(workspaceId: string): Promise<ReanalysisPreview>;
  applyReanalysis(workspaceId: string, token: string): Promise<WorkspaceData>;
  onProgress(callback: (progress: Progress) => void): () => void;
  appInfo(): Promise<{ version: string; dataDirectory: string }>;
}
