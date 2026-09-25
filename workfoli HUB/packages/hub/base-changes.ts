import * as fs from 'node:fs';
import path from 'node:path';
import { PROJECT_TYPES, formatIssues, looksLikeSecret, slugify, validateCrmConfig } from '../contract/workfoli-contract.mjs';
import type { CrmConfig, ProjectType } from '../contract/workfoli-contract.mjs';
import { detectSensitivity } from '../core/sensitivity.js';
import { readBaseManifest, writeBaseManifest } from '../instance/base.js';
import { InstanceError, writeFileAtomic } from '../instance/fsutil.js';

/**
 * Alterações que o Hub pode pedir à Base. Lista fechada e tipada: nada de caminho livre, comando ou script.
 * Aplicadas diretamente (modo local) ou pelo Local Agent (modo remoto), com a MESMA função.
 */
export type BaseChange =
  | { type: 'project.create'; project: { name: string; type: ProjectType; summary: string | null; services: string[] } }
  | { type: 'knowledge.note'; note: { title: string; body: string } }
  | { type: 'crm.config'; crm: CrmConfig };

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  website: 'Site', 'landing-page': 'Landing page', campaign: 'Campanha', content: 'Conteúdo', system: 'Sistema', automation: 'Automação',
  integration: 'Integração', dashboard: 'Dashboard', data: 'Dados', brand: 'Marca', other: 'Outro',
};

function text(value: unknown, label: string, max: number, required = true): string | null {
  if (value === undefined || value === null || value === '') { if (required) throw new InstanceError(`Informe ${label}.`); return null; }
  if (typeof value !== 'string') throw new InstanceError(`${label} inválido.`);
  const clean = value.replace(/\r\n/g, '\n').trim();
  if (!clean && required) throw new InstanceError(`Informe ${label}.`);
  if (clean.length > max) throw new InstanceError(`${label} ultrapassa ${max} caracteres.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮]/.test(clean)) throw new InstanceError(`${label} contém caracteres inválidos.`);
  if (looksLikeSecret(clean) || detectSensitivity(clean).credentials) throw new InstanceError(`${label} parece conter uma credencial. Segredos não vão para a Base.`);
  if (detectSensitivity(clean).personalRecords) throw new InstanceError(`${label} parece conter dados pessoais. Registre pessoas no CRM, não na Base.`);
  return clean;
}

export function validateBaseChange(input: unknown): BaseChange {
  const value = input as { type?: unknown; project?: Record<string, unknown>; note?: Record<string, unknown> } | null;
  if (!value || typeof value !== 'object') throw new InstanceError('Alteração inválida.');
  if (value.type === 'project.create' && value.project && typeof value.project === 'object') {
    const type = value.project.type;
    if (typeof type !== 'string' || !(PROJECT_TYPES as readonly string[]).includes(type)) throw new InstanceError('Tipo de projeto inválido.');
    const services = Array.isArray(value.project.services) ? value.project.services.filter((item): item is string => typeof item === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item)).slice(0, 20) : [];
    return { type: 'project.create', project: { name: text(value.project.name, 'o nome do projeto', 120)!, type: type as ProjectType, summary: text(value.project.summary, 'o resumo', 600, false), services } };
  }
  if (value.type === 'knowledge.note' && value.note && typeof value.note === 'object') {
    return { type: 'knowledge.note', note: { title: text(value.note.title, 'o título', 140)!, body: text(value.note.body, 'o texto da nota', 20_000)! } };
  }
  if (value.type === 'crm.config') {
    // Mesma validação do contrato: um comando enfileirado nunca grava configuração inválida na Base.
    const checked = validateCrmConfig((value as { crm?: unknown }).crm);
    if (!checked.ok) throw new InstanceError(`Configuração do CRM inválida:
${formatIssues(checked.errors)}`);
    return { type: 'crm.config', crm: checked.value! };
  }
  throw new InstanceError('Tipo de alteração não suportado.');
}

export interface AppliedChange { files: string[]; manifestHash: string; summary: string; projectId?: string; }

/**
 * Aplica uma alteração com revisão esperada (hash do manifesto). Se a Base mudou desde que a
 * alteração foi pedida, recusa em vez de sobrescrever. Escritas atômicas e sem sobrescrever arquivos.
 */
export function applyBaseChange(baseDir: string, raw: unknown, options: { expectedManifestHash?: string | null; actorName?: string } = {}): AppliedChange {
  const change = validateBaseChange(raw);
  const loaded = readBaseManifest(baseDir, 'active');
  if (options.expectedManifestHash && options.expectedManifestHash !== loaded.hash) {
    throw new InstanceError('A Base mudou desde o pedido (revisão diferente). Revise e peça novamente.');
  }
  const date = new Date().toISOString().slice(0, 10);
  const author = options.actorName ? ` por ${options.actorName.replace(/[\r\n]/g, ' ').slice(0, 80)}` : '';
  if (change.type === 'project.create') {
    const manifest = loaded.manifest;
    const baseSlug = slugify(change.project.name) || 'projeto';
    let id = baseSlug;
    for (let index = 2; manifest.projects.some(project => project.id === id) || fs.existsSync(path.join(baseDir, 'projetos', id)); index++) id = `${baseSlug}-${index}`;
    const known = new Set(manifest.services.map(service => service.id));
    const services = change.project.services.filter(service => known.has(service));
    const folder = `projetos/${id}`;
    const readme = [
      `# ${change.project.name}`, '',
      `- **Tipo:** ${PROJECT_TYPE_LABELS[change.project.type]}`,
      '- **Situação:** planejado',
      `- **Criado em:** ${date} pelo Workfoli Hub${author}`,
      ...(services.length ? [`- **Serviços:** ${services.join(', ')}`] : []), '',
      '## Objetivo', '', change.project.summary ?? 'A definir.', '',
      '## Briefing', '', 'Complete antes de executar: público, mensagem, entregas, prazos e responsáveis.', '',
    ].join('\n');
    const folderPath = path.join(baseDir, 'projetos', id);
    writeFileAtomic(path.join(folderPath, 'README.md'), readme, { exclusive: true });
    try {
      const manifestHash = writeBaseManifest(baseDir, {
        ...manifest,
        projects: [...manifest.projects, { id, name: change.project.name, type: change.project.type, status: 'planned', visibility: 'internal', path: folder, summary: change.project.summary, ...(services.length ? { services } : {}), createdAt: new Date().toISOString() }],
      }, { expectedHash: loaded.hash });
      return { files: [`${folder}/README.md`, 'workfoli.base.json'], manifestHash, summary: `Projeto "${change.project.name}" criado na Base`, projectId: id };
    } catch (error) {
      // Sem manifesto atualizado, a pasta recém-criada não fica órfã.
      fs.rmSync(folderPath, { recursive: true, force: true });
      throw error;
    }
  }
  if (change.type === 'crm.config') {
    const manifest = loaded.manifest;
    // "crm" em modules.enabled acompanha crm.enabled: a Base nunca fica incoerente.
    const enabled = manifest.modules.enabled.filter(id => id !== 'crm');
    const modules = { ...manifest.modules, enabled: change.crm.enabled ? [...enabled, 'crm' as const] : enabled };
    const manifestHash = writeBaseManifest(baseDir, { ...manifest, modules, crm: change.crm }, { expectedHash: loaded.hash });
    return { files: ['workfoli.base.json'], manifestHash, summary: 'Configuração do CRM atualizada na Base' };
  }
  const slug = slugify(change.note.title, 60) || 'nota';
  let file = `conhecimento/notas/${date}-${slug}.md`;
  for (let index = 2; fs.existsSync(path.join(baseDir, ...file.split('/'))); index++) file = `conhecimento/notas/${date}-${slug}-${index}.md`;
  writeFileAtomic(path.join(baseDir, ...file.split('/')), `# ${change.note.title}\n\n${change.note.body}\n\n---\n_Registrado pelo Workfoli Hub em ${date}${author}._\n`, { exclusive: true });
  return { files: [file], manifestHash: loaded.hash, summary: `Nota "${change.note.title}" registrada na Base` };
}

/** Diário local de alterações na Base (fora da Base, na pasta de dados da instância). */
export function journal(dataDir: string, entry: Record<string, unknown>): void {
  const dir = path.join(dataDir, 'journal');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'base-changes.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

export function currentManifestHash(baseDir: string): string {
  return readBaseManifest(baseDir, 'active').hash;
}
