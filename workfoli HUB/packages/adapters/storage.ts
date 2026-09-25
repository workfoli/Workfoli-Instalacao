import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { CATEGORY_LABELS } from '../contracts/index.js';
import type { EnvironmentInput, EnvironmentProfile, FileEntry, FilePreview, ImportReport, KnowledgeItem, ReanalysisPreview, ReviewInput, WorkspaceData, WorkspaceRelationship, WorkspaceSummary } from '../contracts/index.js';
import { extractKnowledge, isKnowledgeSource, KNOWLEDGE_VERSION } from '../core/knowledge.js';
import { reconcileKnowledge } from '../core/reanalysis.js';
import { markKnowledgeConflicts } from '../core/knowledge-values.js';
import { sensitiveText } from '../core/classification.js';
import { decodeText } from './text.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function validId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('Identificador inválido.');
}
const SCHEMA = `
  PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, path TEXT NOT NULL, category TEXT NOT NULL, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS knowledge (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS activities (id INTEGER PRIMARY KEY, at TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL);
  CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(file_id UNINDEXED, path, text, tokenize='unicode61 remove_diacritics 2');
`;
const json = <T>(value: unknown): T => JSON.parse(String(value)) as T;
export interface StoredActivity { id: number; at: string; action: string; detail: string; }

export class WorkspaceStore {
  readonly root: string;
  private catalog: DatabaseSync;
  private proposals = new Map<string, { token: string; fingerprint: string; expires: number; result: ReanalysisPreview }>();
  constructor(root: string) {
    this.root = path.resolve(root);
    for (const dir of [this.root, this.stagingRoot, this.workspacesRoot]) {
      fs.mkdirSync(dir, { recursive: true });
      if (fs.lstatSync(dir).isSymbolicLink()) throw new Error('A pasta de dados não pode ser um link.');
    }
    this.catalog = new DatabaseSync(path.join(this.root, 'catalog.sqlite'));
    this.catalog.exec('CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
    this.catalog.exec('CREATE TABLE IF NOT EXISTS environment (key TEXT PRIMARY KEY, data TEXT NOT NULL)');
    this.catalog.exec('CREATE TABLE IF NOT EXISTS environment_activities (id INTEGER PRIMARY KEY, at TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL)');
    this.recover();
  }
  get stagingRoot() { return path.join(this.root, 'staging'); }
  get workspacesRoot() { return path.join(this.root, 'workspaces'); }
  stage(id: string) { validId(id); return path.join(this.stagingRoot, id); }
  workspacePath(id: string) { validId(id); return path.join(this.workspacesRoot, id); }
  close() { this.catalog.close(); }
  getEnvironment(): EnvironmentProfile | null {
    const row = this.catalog.prepare("SELECT data FROM environment WHERE key='profile'").get();
    if (!row) return null;
    const profile = json<EnvironmentProfile>(row.data);
    if (profile.schemaVersion !== 1) throw new Error('Esta instalação exige uma versão mais recente do Workfoli.');
    return profile;
  }
  environmentActivities(): StoredActivity[] {
    return this.catalog.prepare('SELECT id,at,action,detail FROM environment_activities ORDER BY id').all() as unknown as StoredActivity[];
  }
  requireEnvironment(): EnvironmentProfile {
    const profile = this.getEnvironment();
    if (!profile) throw new Error('Antes de adicionar um workspace, configure sua empresa e seu nome.');
    return profile;
  }
  private saveProfile(profile: EnvironmentProfile, action: string, detail: object) {
    this.catalog.prepare('INSERT OR REPLACE INTO environment VALUES (?,?)').run('profile', JSON.stringify(profile));
    this.catalog.prepare('INSERT INTO environment_activities(at,action,detail) VALUES (?,?,?)').run(profile.updatedAt, action, JSON.stringify(detail));
  }
  saveEnvironment(input: EnvironmentInput): EnvironmentProfile {
    const name = (value: unknown) => {
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 120 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Informe empresa e usuário com até 120 caracteres, sem quebras de linha.');
      return value.trim();
    };
    if (!input || typeof input !== 'object') throw new Error('Identificação inválida.');
    const companyName = name(input.companyName), userName = name(input.userName);
    const previous = this.getEnvironment();
    const now = new Date().toISOString();
    const profile: EnvironmentProfile = previous ? { ...previous, company: { ...previous.company, name: companyName }, user: { ...previous.user, name: userName }, updatedAt: now } : {
      schemaVersion: 1, instanceId: randomUUID(), company: { id: randomUUID(), name: companyName }, user: { id: randomUUID(), name: userName }, createdAt: now, updatedAt: now,
    };
    // Save the original catalog before assigning identity to an existing installation.
    if (!previous && this.list().length) {
      const dir = path.join(this.root, 'backups'); fs.mkdirSync(dir, { recursive: true }); this.assertDirectory(dir);
      this.catalog.prepare('VACUUM INTO ?').run(path.join(dir, `catalog-before-identity-${randomUUID()}.sqlite`));
    }
    this.catalog.exec('BEGIN IMMEDIATE');
    try { this.saveProfile(profile, previous ? 'environment.updated' : 'environment.created', { companyId: profile.company.id, userId: profile.user.id }); this.catalog.exec('COMMIT'); }
    catch (error) { this.catalog.exec('ROLLBACK'); throw error; }
    return profile;
  }
  private validateRelationship(value: unknown, id: string): asserts value is WorkspaceRelationship {
    if (value !== 'company' && value !== 'client') throw new Error('Escolha se este workspace é sua empresa ou um cliente.');
    const profile = this.requireEnvironment();
    if (value === 'company' && profile.company.workspaceId && profile.company.workspaceId !== id) throw new Error('Já existe um workspace da sua empresa. Altere o vínculo atual antes de escolher outro.');
  }
  private assignRelationship(id: string, name: string, relationship: WorkspaceRelationship) {
    const profile = this.requireEnvironment();
    if (relationship === 'company') { profile.company.workspaceId = id; profile.company.name = name; }
    else if (profile.company.workspaceId === id) delete profile.company.workspaceId;
    profile.updatedAt = new Date().toISOString();
    this.saveProfile(profile, 'workspace.relationship', { workspaceId: id, relationship });
  }
  setWorkspaceRelationship(id: string, relationship: WorkspaceRelationship): WorkspaceData {
    this.validateRelationship(relationship, id);
    const workspace = this.get(id).workspace;
    if (workspace.relationship === relationship) return this.get(id);
    this.catalog.exec('BEGIN IMMEDIATE');
    try { this.assignRelationship(id, workspace.name, relationship); this.catalog.exec('COMMIT'); }
    catch (error) { this.catalog.exec('ROLLBACK'); throw error; }
    return this.get(id);
  }
  private withRelationship(workspace: WorkspaceSummary): WorkspaceSummary {
    // The imported workspace never defines the owner of this installation.
    return { ...workspace, relationship: this.getEnvironment()?.company.workspaceId === workspace.id ? 'company' : 'client' };
  }
  private assertDirectory(dir: string) {
    const relative = path.relative(this.root, dir);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Caminho fora dos dados do aplicativo.');
    let current = this.root;
    for (const part of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Diretório de dados inválido.');
    }
  }
  createStage(id: string) {
    const dir = this.stage(id);
    fs.mkdirSync(dir, { recursive: false });
    return dir;
  }
  discardStage(id: string) {
    const dir = this.stage(id);
    if (fs.existsSync(dir)) {
      this.assertDirectory(dir);
      // Only the UUID-named staging directory owned by this application is removed.
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
  prepare(report: ImportReport, texts: Record<string, string>) {
    const dir = this.stage(report.id);
    this.assertDirectory(dir);
    const db = new DatabaseSync(path.join(dir, 'workspace.sqlite'));
    try {
      db.exec(SCHEMA);
      db.exec('BEGIN IMMEDIATE');
      const header = { ...report, files: [], projects: [], knowledge: [] };
      db.prepare('INSERT INTO meta VALUES (?, ?)').run('report', JSON.stringify(header));
      const file = db.prepare('INSERT INTO files VALUES (?, ?, ?, ?)');
      const search = db.prepare('INSERT INTO search(file_id,path,text) VALUES (?,?,?)');
      for (const entry of report.files) {
        file.run(entry.id, entry.path, entry.category, JSON.stringify(entry));
        // Never allow importer output to put restricted content into a search index.
        if (!entry.sensitive && entry.disposition === 'indexed' && texts[entry.id]) search.run(entry.id, entry.path, texts[entry.id]!);
      }
      const entriesById = new Map(report.files.map(entry => [entry.id, entry]));
      const knowledge = db.prepare('INSERT INTO knowledge VALUES (?, ?)');
      for (const item of report.knowledge) {
        const source = entriesById.get(item.evidence.fileId);
        if (source && !source.sensitive && source.disposition === 'indexed') knowledge.run(item.id, JSON.stringify(item));
      }
      const project = db.prepare('INSERT INTO projects VALUES (?, ?)');
      for (const item of report.projects) project.run(item.id, JSON.stringify(item));
      db.exec('COMMIT');
    } finally { db.close(); }
  }
  private readReport(db: DatabaseSync): ImportReport {
    const row = db.prepare("SELECT value FROM meta WHERE key='report'").get();
    if (!row) throw new Error('Importação incompleta.');
    const report = json<ImportReport>(row.value);
    if (report.schemaVersion !== 1) throw new Error('Este workspace exige uma versão mais recente do Workfoli.');
    report.files = db.prepare('SELECT data FROM files ORDER BY rowid').all().map(row => json<FileEntry>(row.data));
    report.knowledge = db.prepare('SELECT data FROM knowledge ORDER BY rowid').all().map(row => json<KnowledgeItem>(row.data));
    markKnowledgeConflicts(report.knowledge);
    report.projects = db.prepare('SELECT data FROM projects ORDER BY rowid').all().map(row => json(row.data));
    report.summary.categories = {};
    for (const file of report.files) if (file.kind === 'file') report.summary.categories[file.category] = (report.summary.categories[file.category] ?? 0) + 1;
    return report;
  }
  draft(id: string): ImportReport | null {
    const dir = this.stage(id);
    if (!fs.existsSync(path.join(dir, 'workspace.sqlite'))) return null;
    this.assertDirectory(dir);
    const db = new DatabaseSync(path.join(dir, 'workspace.sqlite'), { readOnly: true });
    try { return this.readReport(db); } finally { db.close(); }
  }
  confirm(id: string, review: ReviewInput): WorkspaceData {
    validId(id);
    const existing = this.catalog.prepare('SELECT data FROM workspaces WHERE id=?').get(id);
    if (existing) return this.get(id);
    this.validateRelationship(review?.relationship, id);
    if (!review || typeof review.name !== 'string' || !review.name.trim() || review.name.length > 120) throw new Error('Informe um nome com até 120 caracteres.');
    if (!review.categories || typeof review.categories !== 'object' || !review.knowledge || typeof review.knowledge !== 'object') throw new Error('Revisão inválida.');
    const dir = this.stage(id);
    this.assertDirectory(dir);
    const db = new DatabaseSync(path.join(dir, 'workspace.sqlite'));
    let summary: WorkspaceSummary;
    try {
      const report = this.readReport(db);
      db.exec('BEGIN IMMEDIATE');
      for (const [fileId, category] of Object.entries(review.categories)) {
        if (typeof category !== 'string' || !Object.hasOwn(CATEGORY_LABELS, category)) throw new Error('Categoria inválida.');
        const entry = report.files.find(file => file.id === fileId);
        if (!entry) throw new Error('Arquivo não pertence a esta importação.');
        entry.category = category;
        entry.classification = { method: 'manual', confidence: 'high', evidence: 'Categoria definida por você na revisão da importação.' };
        db.prepare('UPDATE files SET category=?, data=? WHERE id=?').run(category, JSON.stringify(entry), fileId);
      }
      for (const [knowledgeId, change] of Object.entries(review.knowledge)) {
        const item = report.knowledge.find(k => k.id === knowledgeId);
        if (!item || !change || !['pending','confirmed','rejected'].includes(change.status)) throw new Error('Revisão de conhecimento inválida.');
        item.status = change.status;
        if (change.value !== undefined && change.value !== item.value) {
          if (typeof change.value !== 'string' || !change.value.trim() || change.value.length > 2000) throw new Error('Valor de conhecimento inválido.');
          item.originalValue = item.value;
          item.value = change.value.trim();
          item.origin = 'user';
        }
        db.prepare('UPDATE knowledge SET data=? WHERE id=?').run(JSON.stringify(item), item.id);
      }
      summary = { id, name: review.name.trim(), createdAt: new Date().toISOString(), files: report.summary.files, projects: report.projects.length, knowledge: report.knowledge.filter(k => k.status !== 'rejected').length, sourceName: report.sourceName, legacy: report.legacy.detected, relationship: 'client' };
      db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('workspace', JSON.stringify(summary));
      db.prepare('INSERT INTO activities(at,action,detail) VALUES (?,?,?)').run(summary.createdAt, 'import.confirmed', JSON.stringify({ sourceHash: report.sourceHash, reviewedFiles: Object.keys(review.categories).length, reviewedKnowledge: Object.keys(review.knowledge).length }));
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* no open transaction */ }
      throw error;
    } finally { db.close(); }
    fs.writeFileSync(path.join(dir, 'ready.json'), JSON.stringify({ schemaVersion: 1, id }), { flag: 'w' });
    const destination = this.workspacePath(id);
    fs.renameSync(dir, destination);
    this.catalog.exec('BEGIN IMMEDIATE');
    try {
      this.catalog.prepare('INSERT OR REPLACE INTO workspaces VALUES (?,?)').run(id, JSON.stringify(summary));
      this.assignRelationship(id, summary.name, review.relationship);
      this.catalog.exec('COMMIT');
    } catch (error) { this.catalog.exec('ROLLBACK'); throw error; }
    return this.get(id);
  }
  private recover() {
    for (const entry of fs.readdirSync(this.workspacesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !UUID.test(entry.name)) continue;
      const dir = this.workspacePath(entry.name);
      if (!fs.existsSync(path.join(dir, 'ready.json'))) continue;
      try {
        this.assertDirectory(dir);
        const db = new DatabaseSync(path.join(dir, 'workspace.sqlite'), { readOnly: true });
        try {
          const row = db.prepare("SELECT value FROM meta WHERE key='workspace'").get();
          if (!row) continue;
          const workspace = json<WorkspaceSummary>(row.value);
          if (workspace.id !== entry.name) continue;
          this.catalog.prepare('INSERT OR REPLACE INTO workspaces VALUES (?,?)').run(workspace.id, JSON.stringify(workspace));
        } finally { db.close(); }
      } catch { /* An incomplete workspace is never published. */ }
    }
  }
  list(): WorkspaceSummary[] {
    return this.catalog.prepare('SELECT data FROM workspaces ORDER BY rowid DESC').all().map(row => this.withRelationship(json<WorkspaceSummary>(row.data)));
  }
  private open(id: string, write = false): DatabaseSync {
    validId(id);
    if (!this.catalog.prepare('SELECT id FROM workspaces WHERE id=?').get(id)) throw new Error('Workspace não encontrado.');
    const dir = this.workspacePath(id);
    this.assertDirectory(dir);
    return new DatabaseSync(path.join(dir, 'workspace.sqlite'), { readOnly: !write });
  }
  get(id: string): WorkspaceData {
    const db = this.open(id);
    try {
      const row = db.prepare("SELECT value FROM meta WHERE key='workspace'").get();
      if (!row) throw new Error('Workspace incompleto.');
      return { workspace: this.withRelationship(json<WorkspaceSummary>(row.value)), report: this.readReport(db) };
    } finally { db.close(); }
  }
  activities(id: string): StoredActivity[] {
    const db = this.open(id);
    try { return db.prepare('SELECT id,at,action,detail FROM activities ORDER BY id').all() as unknown as StoredActivity[]; }
    finally { db.close(); }
  }
  /** Backup recovery only: caller validates the neutral snapshot in a new, private root. */
  restoreSnapshot(data: WorkspaceData, texts: Record<string, string>, activities: StoredActivity[]) {
    const id = data.workspace.id;
    validId(id);
    if (this.catalog.prepare('SELECT id FROM workspaces WHERE id=?').get(id)) throw new Error('O destino da recuperação já contém este workspace.');
    this.prepare(data.report, texts);
    const dir = this.stage(id);
    const db = new DatabaseSync(path.join(dir, 'workspace.sqlite'));
    try {
      db.exec('BEGIN IMMEDIATE');
      db.prepare('INSERT INTO meta VALUES (?,?)').run('workspace', JSON.stringify({ ...data.workspace, relationship: 'client' }));
      const insert = db.prepare('INSERT INTO activities(id,at,action,detail) VALUES (?,?,?,?)');
      for (const activity of activities) insert.run(activity.id, activity.at, activity.action, activity.detail);
      db.exec('COMMIT');
    } finally { db.close(); }
    fs.writeFileSync(path.join(dir, 'ready.json'), JSON.stringify({ schemaVersion: 1, id }), { flag: 'wx' });
    fs.renameSync(dir, this.workspacePath(id));
    this.catalog.prepare('INSERT INTO workspaces VALUES (?,?)').run(id, JSON.stringify({ ...data.workspace, relationship: 'client' }));
  }
  restoreIdentity(profile: EnvironmentProfile | null, activities: StoredActivity[] = []) {
    if (this.getEnvironment()) throw new Error('O destino já possui uma identidade.');
    if (!profile) return;
    validId(profile.instanceId); validId(profile.company.id); validId(profile.user.id);
    if (profile.company.workspaceId) this.get(profile.company.workspaceId);
    const insert = this.catalog.prepare('INSERT INTO environment_activities(id,at,action,detail) VALUES (?,?,?,?)');
    for (const activity of activities) insert.run(activity.id, activity.at, activity.action, activity.detail);
    this.saveProfile(profile, 'backup.restored', { instanceId: profile.instanceId });
  }
  updateKnowledge(workspaceId: string, id: string, status: KnowledgeItem['status'], value?: string): WorkspaceData {
    validId(id);
    if (!['pending','confirmed','rejected'].includes(status)) throw new Error('Estado inválido.');
    if (value !== undefined && (typeof value !== 'string' || !value.trim() || value.length > 2000)) throw new Error('Informe um valor com até 2000 caracteres.');
    const db = this.open(workspaceId, true);
    try {
      const row = db.prepare('SELECT data FROM knowledge WHERE id=?').get(id);
      if (!row) throw new Error('Conhecimento não pertence a este workspace.');
      const item = json<KnowledgeItem>(row.data);
      item.status = status;
      if (value !== undefined && value.trim() !== item.value) {
        item.originalValue ??= item.value;
        item.value = value.trim();
        item.origin = 'user';
      }
      db.exec('BEGIN IMMEDIATE');
      db.prepare('UPDATE knowledge SET data=? WHERE id=?').run(JSON.stringify(item), id);
      db.prepare('INSERT INTO activities(at,action,detail) VALUES (?,?,?)').run(new Date().toISOString(), value !== undefined ? 'knowledge.edited' : 'knowledge.reviewed', JSON.stringify({ id, status }));
      const summaryRow = db.prepare("SELECT value FROM meta WHERE key='workspace'").get()!;
      const summary = json<WorkspaceSummary>(summaryRow.value);
      summary.knowledge = db.prepare('SELECT data FROM knowledge').all().map(r => json<KnowledgeItem>(r.data)).filter(k => k.status !== 'rejected').length;
      db.prepare("UPDATE meta SET value=? WHERE key='workspace'").run(JSON.stringify(summary));
      db.exec('COMMIT');
      this.catalog.prepare('UPDATE workspaces SET data=? WHERE id=?').run(JSON.stringify(summary), workspaceId);
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* transaction did not start */ }
      throw error;
    } finally { db.close(); }
    return this.get(workspaceId);
  }
  private fingerprint(db: DatabaseSync, report: ImportReport): string {
    return createHash('sha256').update(JSON.stringify({
      report, revision: db.prepare('SELECT MAX(id) AS revision FROM activities').get()?.revision,
    })).digest('hex');
  }
  private knowledgeTexts(workspaceId: string, files: FileEntry[]): Map<string, string> {
    const dir = path.join(this.workspacePath(workspaceId), 'source', 'entries');
    this.assertDirectory(dir);
    const texts = new Map<string, string>();
    let total = 0;
    for (const file of files.filter(isKnowledgeSource)) {
      validId(file.id);
      if (file.size > 1024 ** 2 || (total += file.size) > 32 * 1024 ** 2) throw new Error('As fontes excedem o limite de reanálise de texto.');
      const filename = path.join(dir, file.id);
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.size) throw new Error('A integridade de uma fonte mudou. Reanálise interrompida.');
      const bytes = fs.readFileSync(filename);
      if (!file.hash || createHash('sha256').update(bytes).digest('hex') !== file.hash.toLowerCase()) throw new Error('A integridade de uma fonte mudou. Reanálise interrompida.');
      const text = decodeText(bytes);
      if (text === undefined || sensitiveText(text)) throw new Error('Uma fonte não está disponível para reanálise segura. Nenhum conhecimento foi alterado.');
      texts.set(file.id, text);
    }
    return texts;
  }
  previewReanalysis(workspaceId: string): ReanalysisPreview {
    const db = this.open(workspaceId);
    try {
      const report = this.readReport(db);
      const texts = this.knowledgeTexts(workspaceId, report.files);
      const result = { token: randomUUID(), ...reconcileKnowledge(report.knowledge, extractKnowledge(report.files, texts)) };
      for (const [id, proposal] of this.proposals) if (proposal.expires < Date.now()) this.proposals.delete(id);
      if (this.proposals.size >= 20) this.proposals.delete(this.proposals.keys().next().value!);
      this.proposals.set(workspaceId, { token: result.token, fingerprint: this.fingerprint(db, report), expires: Date.now() + 30 * 60_000, result: structuredClone(result) });
      return result;
    } finally { db.close(); }
  }
  applyReanalysis(workspaceId: string, token: string): WorkspaceData {
    validId(token);
    const proposal = this.proposals.get(workspaceId);
    if (!proposal || proposal.token !== token || proposal.expires < Date.now()) throw new Error('Gere uma nova proposta de reanálise antes de aplicar.');
    const db = this.open(workspaceId, true);
    try {
      const report = this.readReport(db);
      const ensureCurrent = () => {
        if (this.fingerprint(db, this.readReport(db)) !== proposal.fingerprint) throw new Error('O conhecimento mudou após a proposta. Reanalise novamente para preservar suas alterações.');
      };
      ensureCurrent();
      this.knowledgeTexts(workspaceId, report.files);
      const backups = path.join(this.workspacePath(workspaceId), 'backups');
      fs.mkdirSync(backups, { recursive: true }); this.assertDirectory(backups);
      const backupName = `knowledge-${Date.now()}-${randomUUID()}.sqlite`;
      db.prepare('VACUUM INTO ?').run(path.join(backups, backupName));
      db.exec('BEGIN IMMEDIATE');
      ensureCurrent();
      db.exec('DELETE FROM knowledge');
      const insert = db.prepare('INSERT INTO knowledge VALUES (?,?)');
      for (const item of proposal.result.knowledge) insert.run(item.id, JSON.stringify(item));
      const at = new Date().toISOString();
      const header = { ...report, files: [], projects: [], knowledge: [], knowledgeAnalysis: { version: KNOWLEDGE_VERSION, at } };
      header.warnings = header.warnings.filter(warning => warning.code !== 'knowledge-conflict');
      if (proposal.result.knowledge.some(item => item.conflict)) header.warnings.push({ code: 'knowledge-conflict', message: 'Há valores diferentes para o mesmo campo e contexto. Confira as fontes antes de confirmar.' });
      db.prepare("UPDATE meta SET value=? WHERE key='report'").run(JSON.stringify(header));
      const summary = json<WorkspaceSummary>(db.prepare("SELECT value FROM meta WHERE key='workspace'").get()!.value);
      summary.knowledge = proposal.result.knowledge.filter(item => item.status !== 'rejected').length;
      db.prepare("UPDATE meta SET value=? WHERE key='workspace'").run(JSON.stringify(summary));
      const { added, updated, removed, retainedReviewed } = proposal.result;
      db.prepare('INSERT INTO activities(at,action,detail) VALUES (?,?,?)').run(at, 'knowledge.reanalyzed', JSON.stringify({ version: KNOWLEDGE_VERSION, added, updated, removed, retainedReviewed, backup: backupName }));
      db.exec('COMMIT');
      this.proposals.delete(workspaceId);
      this.catalog.prepare('UPDATE workspaces SET data=? WHERE id=?').run(JSON.stringify(summary), workspaceId);
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* no transaction opened */ }
      throw error;
    } finally { db.close(); }
    return this.get(workspaceId);
  }
  search(id: string, query: string): string[] {
    if (typeof query !== 'string' || query.length > 300) throw new Error('Busca inválida.');
    const db = this.open(id);
    try {
      const terms = query.trim().split(/\s+/u).filter(Boolean).slice(0, 12);
      if (!terms.length) return [];
      const match = terms.map(term => `"${term.replaceAll('"', '""')}"*`).join(' AND ');
      return db.prepare('SELECT file_id FROM search WHERE search MATCH ? ORDER BY rank LIMIT 1000').all(match).map(row => String(row.file_id));
    } finally { db.close(); }
  }
  preview(workspaceId: string, fileId: string): FilePreview {
    validId(fileId);
    const db = this.open(workspaceId);
    try { return this.previewFrom(db, this.workspacePath(workspaceId), fileId); } finally { db.close(); }
  }
  previewImport(runId: string, fileId: string): FilePreview {
    validId(fileId);
    const dir = this.stage(runId);
    this.assertDirectory(dir);
    const db = new DatabaseSync(path.join(dir, 'workspace.sqlite'), { readOnly: true });
    try { return this.previewFrom(db, dir, fileId); } finally { db.close(); }
  }
  private previewFrom(db: DatabaseSync, root: string, fileId: string): FilePreview {
    try {
      const row = db.prepare('SELECT data FROM files WHERE id=?').get(fileId);
      if (!row) throw new Error('Arquivo não pertence a este workspace.');
      const file = json<FileEntry>(row.data);
      const unavailable = (message: string): FilePreview => ({ kind: 'unavailable', content: '', message });
      if (file.sensitive || file.disposition === 'restricted') return unavailable('Conteúdo restrito: preservado, sem prévia e fora do conhecimento.');
      if (file.kind !== 'file' || file.disposition === 'blocked') return unavailable('Esta entrada não foi materializada por segurança.');
      if (file.disposition === 'excluded') return unavailable('Arquivo técnico preservado, excluído da análise.');
      if (file.size > 8 * 1024 * 1024) return unavailable('Arquivo preservado. Prévia limitada a 8 MiB.');
      const dir = path.join(root, 'source', 'entries');
      this.assertDirectory(dir);
      const filename = path.join(dir, fileId);
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.size) return unavailable('A integridade do arquivo precisa ser verificada.');
      const bytes = fs.readFileSync(filename);
      if (file.hash && createHash('sha256').update(bytes).digest('hex') !== file.hash.toLowerCase()) return unavailable('O arquivo preservado mudou. Prévia bloqueada.');
      const text = db.prepare('SELECT text FROM search WHERE file_id=?').get(fileId);
      if (text) return { kind: 'text', content: String(text.text).slice(0, 150_000), ...(String(text.text).length > 150_000 ? { message: 'Prévia limitada aos primeiros 150 mil caracteres. O arquivo completo permanece preservado.' } : {}) };
      let mime: string | undefined;
      if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = 'image/png';
      else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg';
      else if (bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP') mime = 'image/webp';
      if (mime) return { kind: 'image', content: `data:${mime};base64,${bytes.toString('base64')}` };
      return unavailable('Arquivo preservado. Este formato ainda não tem prévia no Workfoli.');
    } catch (error) { throw error; }
  }
}
