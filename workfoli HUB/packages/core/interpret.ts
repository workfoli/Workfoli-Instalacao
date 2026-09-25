import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Evidence, FileEntry, ImportReport, ImportWarning, Project } from '../contracts/index.js';
import { excludedCategories } from './classification.js';
import { extractKnowledge } from './knowledge.js';
export { extractKnowledge, isKnowledgeSource, KNOWLEDGE_VERSION } from './knowledge.js';
const parentPath = (value: string) => value.includes('/') ? value.slice(0, value.lastIndexOf('/')) : '';
const within = (value: string, root: string) => !root || value === root || value.startsWith(`${root}/`);
const evidence = (entry: FileEntry, line?: number): Evidence => ({ fileId: entry.id, path: entry.path, ...(line ? { line } : {}) });


function jsonObject(text: string | undefined): Record<string, unknown> | undefined {
  if (!text) return undefined;
  try { const value: unknown = JSON.parse(text); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; } catch { return undefined; }
}


export function interpret(files: FileEntry[], internalTexts: Map<string,string>) {
  const warnings: ImportWarning[] = [];
  const warnOnce = (code: string, message: string) => { if (!warnings.some(w => w.code === code)) warnings.push({ code, message }); };
  const usable = files.filter(entry => entry.kind === 'file' && entry.hash && !entry.sensitive && !excludedCategories.has(entry.category));
  const byPath = new Map(usable.map(entry => [entry.path, entry]));
  const legacyRoots = new Set<string>();
  for (const entry of usable) {
    if (/(?:^|\/)core\/leanai\.config\.json$/i.test(entry.path)) legacyRoots.add(entry.path.replace(/(?:^|\/)core\/leanai\.config\.json$/i, ''));
    if (/(?:^|\/)package\.json$/i.test(entry.path)) {
      const pkg = jsonObject(internalTexts.get(entry.id));
      if (typeof pkg?.name === 'string' && /leanai/i.test(pkg.name)) legacyRoots.add(parentPath(entry.path));
    }
  }
  const legacy: ImportReport['legacy'] = { detected: false, evidence: [], versions: [] };
  const projects: Project[] = [];
  for (const root of legacyRoots) {
    const nameAt = (suffix: string) => byPath.get(root ? `${root}/${suffix}` : suffix);
    const pkgFile = nameAt('package.json');
    const configFile = nameAt('core/leanai.config.json');
    const installFile = nameAt('core/instalacao.json');
    const pkg = jsonObject(pkgFile ? internalTexts.get(pkgFile.id) : undefined);
    const packageMatches = typeof pkg?.name === 'string' && /leanai/i.test(pkg.name);
    if (!(configFile && (installFile || packageMatches))) continue;
    legacy.detected = true;
    const markers = [packageMatches ? pkgFile : undefined, configFile, installFile].filter((entry): entry is FileEntry => !!entry);
    legacy.evidence.push(...markers.map(entry => evidence(entry)));
    if (typeof pkg?.version === 'string') legacy.versions.push(`package.json: ${pkg.version.slice(0, 100)}`);
    for (const marker of [configFile, installFile]) {
      if (!marker) continue;
      const json = jsonObject(internalTexts.get(marker.id));
      if (typeof json?.engineVersion === 'string') legacy.versions.push(`${path.posix.basename(marker.path)}: ${json.engineVersion.slice(0, 100)}`);
    }
    projects.push({ id: randomUUID(), root, name: path.posix.basename(root) || 'LeanAI', type: 'legacy', description: 'Framework LeanAI detectado por múltiplos arquivos. Scripts, skills e instruções permanecem inativos.', evidence: markers.map(entry => evidence(entry)) });
  }
  const projectRoots = new Set(projects.map(project => project.root));
  // A legacy installation can contain a software product without a package.json:
  // <name>/config/<name>.config.json plus server and core folders, whatever the product is called.
  for (const entry of usable) {
    const config = /(?:^|\/)([^/]+)\/config\/([^/]+)\.config\.json$/i.exec(entry.path);
    if (!config || config[1]!.toLowerCase() !== config[2]!.toLowerCase()) continue;
    const root = parentPath(parentPath(entry.path));
    const members = usable.filter(file => within(file.path, root));
    const server = members.find(file => /\/(?:servidor|server)\//i.test(file.path));
    const core = members.find(file => /\/(?:nucleo|core)\//i.test(file.path));
    if (server && core && !projectRoots.has(root)) {
      projects.push({ id: randomUUID(), root, name: path.posix.basename(root), type: 'software', description: 'Projeto de software identificado pela estrutura de configuração, servidor e núcleo. Scripts não foram executados e a presença do código não comprova dados operacionais.', evidence: [entry,server,core].map(file => evidence(file)) });
      projectRoots.add(root);
    }
  }
  for (const entry of [...usable].sort((a,b) => a.path.split('/').length - b.path.split('/').length)) {
    if (!/(?:^|\/)index\.html?$/i.test(entry.path)) continue;
    const root = parentPath(entry.path);
    if (projectRoots.has(root) || projects.some(project => project.type !== 'legacy' && within(root, project.root))) continue;
    projects.push({ id: randomUUID(), root, name: path.posix.basename(root) || 'Site', type: 'website', description: 'Site estático detectado pela página index.html. O conteúdo não foi executado.', evidence: [evidence(entry)] });
    projectRoots.add(root);
  }
  for (const entry of usable) {
    if (!/(?:^|\/)package\.json$/i.test(entry.path)) continue;
    const root = parentPath(entry.path);
    if (projectRoots.has(root)) continue;
    const pkg = jsonObject(internalTexts.get(entry.id));
    if (!pkg) continue;
    projects.push({ id: randomUUID(), root, name: typeof pkg.name === 'string' ? pkg.name.slice(0, 120) : path.posix.basename(root) || 'Software', type: 'software', description: 'Projeto de software identificado por manifesto. Dependências e scripts não foram executados.', evidence: [evidence(entry)] });
    projectRoots.add(root);
  }
  for (const project of projects.filter(project => project.type === 'website')) {
    for (const entry of files) if (within(entry.path, project.root) && ['code', 'media', 'other'].includes(entry.category)) {
      entry.category = 'site';
      entry.classification = { method: 'rule', confidence: 'medium', evidence: 'Arquivo pertence a uma pasta com projeto web identificado por index.html.' };
    }
  }

  const knowledge = extractKnowledge(files, internalTexts);
  if (knowledge.some(item => item.conflict)) warnOnce('knowledge-conflict', 'Foram encontrados valores diferentes para um mesmo campo de conhecimento. Revise as fontes antes de confirmar.');
  const versionValues = legacy.versions.map(version => version.slice(version.indexOf(':') + 1).trim());
  if (new Set(versionValues).size > 1) warnOnce('legacy-version-conflict', 'Os manifestos do legado declaram versões diferentes; os valores foram mantidos separadamente.');
  if (files.some(entry => entry.disposition === 'blocked')) warnOnce('blocked-entries', 'Algumas entradas foram bloqueadas e estão identificadas no inventário. Links não foram seguidos.');
  warnOnce('analysis-scope', 'Análise local limitada a texto. Imagens, PDF, Office e executáveis não foram analisados; a ausência de alertas não certifica ausência de conteúdo reservado.');

  return { legacy, projects, knowledge, warnings };
}
