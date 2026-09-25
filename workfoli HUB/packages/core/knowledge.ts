import { randomUUID } from 'node:crypto';
import type { FileEntry, KnowledgeItem } from '../contracts/index.js';
import { markKnowledgeConflicts } from './knowledge-values.js';

export const KNOWLEDGE_VERSION = 2;
const MAX_ITEMS = 150;
const MAX_LINES = 5_000;
const MAX_VALUE = 900;
const normalized = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
const clean = (value: string) => value.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm, '').replace(/\*\*|__|`/g, '').trim();
const keyText = (value: string) => normalized(clean(value)).replace(/^\d+[.)]?\s*/, '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/:$/, '').trim();

type Mapping = { field: string; category: string };
type Context = { heading: string; level: number; synthetic?: boolean };
type Candidate = Mapping & { value: string; scope?: string; line: number; endLine: number };
const mapping = (field: string, category: string): Mapping => ({ field, category });
const typography = mapping('brand.typography', 'Identidade');
const palette = mapping('brand.palette', 'Identidade');
const rules: Array<[RegExp, Mapping]> = [
  [/^(?:nome(?: da empresa| do negocio)?|empresa|razao social|nome fantasia)$/, mapping('identity.name', 'Empresa')],
  [/^(?:negocio|sobre o negocio|descricao(?: do negocio| da empresa)?|quem somos)$/, mapping('business.description', 'Empresa')],
  [/^(?:especialidade|especialidades|segmento|atuacao|area de atuacao|perfil profissional|o que fazemos)$/, mapping('business.specialty', 'Empresa')],
  [/^(?:localizacao|cidade|endereco|sede|regiao(?: de atuacao| atendida| de atendimento)?|abrangencia)$/, mapping('business.location', 'Empresa')],
  [/^(?:publico(?: alvo)?|audiencia|cliente ideal|perfil (?:de|do) (?:paciente|cliente)|perfil dos (?:pacientes|clientes))$/, mapping('business.audience', 'Estratégia')],
  [/^(?:tom(?: de voz)?|voz|tom de comunicacao|linguagem)$/, mapping('communication.tone', 'Comunicação')],
  [/^(?:objetivo(?: principal)?|objetivos|prioridade(?: principal)?|prioridades|meta|metas)$/, mapping('strategy.objective', 'Estratégia')],
  [/^(?:missao|proposito)$/, mapping('business.mission', 'Empresa')],
  [/^(?:posicionamento|proposta de valor|diferencial|diferenciais)$/, mapping('business.positioning', 'Estratégia')],
  [/^(?:cor (?:primaria|principal)|primaria|principal|primary colou?r)$/, mapping('brand.primaryColor', 'Identidade')],
  [/^(?:cor secundaria|secundaria|secondary colou?r)$/, mapping('brand.secondaryColor', 'Identidade')],
  [/^(?:cor de fundo|fundo|background(?: colou?r)?)$/, mapping('brand.backgroundColor', 'Identidade')],
  [/^(?:cor de texto|texto|text colou?r)$/, mapping('brand.textColor', 'Identidade')],
  [/^(?:cor de destaque|destaque|accent(?: colou?r)?)$/, mapping('brand.accentColor', 'Identidade')],
  [/^(?:fonte(?: principal)?|fontes|tipografia|font family|familia tipografica)$/, typography],
  [/^(?:cores|paleta(?: de cores)?)$/, palette],
  [/^(?:site|website|url|endereco do site)$/, mapping('business.website', 'Empresa')],
];

export function isKnowledgeSource(entry: FileEntry): boolean {
  if (entry.kind !== 'file' || !entry.hash || entry.sensitive || entry.disposition !== 'indexed' || !['.md', '.txt'].includes(entry.extension.toLowerCase())) return false;
  const p = entry.path.replace(/\\/g, '/').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (/(?:^|\/)(?:node_modules|\.git|dist|build|templates?|examples?|exemplos|skills|\.agents|\.claude)(?:\/|$)/.test(p)) return false;
  if (/(?:pacientes?|patients?|prontuarios?|consultas?|clinico|clinical|confidencial|nao[-_ ]?publicar)/.test(p)) return false;
  return /(?:^|\/)(?:_memoria|memorias?)(?:\/).*\.(?:md|txt)$/.test(p)
    || /(?:^|\/)(?:empresa|brand[-_ ]?guide|design[-_ ]?guide|guia[-_ ]?(?:da[-_ ]?)?marca|marca|preferencias|estrategia)\.(?:md|txt)$/.test(p);
}

function scopeIn(text: string): string | undefined {
  const key = normalized(clean(text));
  if (/\b(?:redes sociais|pecas sociais|social media|instagram)\b/.test(key)) return 'Redes sociais';
  if (/^comum (?:as|a ambas|aos)\b/.test(key)) return 'Compartilhado';
  if (/\b(?:site|website|web)\b/.test(key)) return 'Site';
  return undefined;
}

function directMapping(label: string): Mapping | undefined {
  const key = keyText(label).replace(/(?:\s+(?:para|do|de|no|nas)\s+|\s*[—–:]\s*|\s+)(?:o )?(?:site|website|redes sociais)$/, '').trim();
  return rules.find(([pattern]) => pattern.test(key))?.[1];
}

function headingMapping(label: string): Mapping | undefined {
  const key = keyText(label);
  if (key === 'empresa') return undefined;
  const direct = directMapping(label);
  if (direct?.field === 'business.website' && /^(?:site|website)$/.test(key)) return undefined;
  return direct;
}

function contextMapping(context: Context[]): Mapping | undefined {
  for (let i = context.length - 1; i >= 0; i--) {
    const found = headingMapping(context[i]!.heading);
    if (found) return found;
    // Only an explicit publishing scope may sit between a value and its semantic heading.
    // Unrelated sections must not inherit a broad parent section's meaning.
    if (!scopeIn(context[i]!.heading)) return undefined;
  }
  return undefined;
}

function contextScope(context: Context[]): string | undefined {
  for (let i = context.length - 1; i >= 0; i--) {
    const found = scopeIn(context[i]!.heading);
    if (found) return found;
  }
  return undefined;
}

function qualifiedContext(value: string, context: Context[]): string {
  const qualified = context.filter(item => /\b(?:pendente|provisorio|provisoria|a confirmar|a validar|sugestao|proposta)\b/.test(normalized(item.heading)));
  return qualified.length ? `${qualified.map(item => clean(item.heading)).join(' / ')}: ${value}` : value;
}

function isPrivateOrClinical(value: string): boolean {
  return /(?:R\$|US\$|\bBRL\b|\b(?:honor[aá]rios|valor da consulta|pagamento|cpf|rg|prontu[aá]rio|diagn[oó]stico|prescri[cç][aã]o|medica[cç][aã]o|resultado de exame|paciente\s*:)\b)/i.test(value)
    || /\bpaciente\s*:/i.test(value)
    || /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(value)
    || /\b(?:CID[ -]?[A-Z]?\d|(?:nasciment[oa]|data de nascimento)\s*:)/i.test(value);
}

/** Accept public web domains, not local files, arbitrary labels, or executable schemes. */
function websiteValue(raw: string): string | undefined {
  let value = clean(raw);
  const markdown = /^\[([^\]]+)\]\(([^\s)]+)(?:\s+"[^"]*")?\)(.*)$/.exec(value);
  if (markdown) value = `${markdown[2]}${markdown[3]}`.trim();
  value = value.replace(/^<(https?:\/\/[^>]+)>/, '$1');
  const candidate = /^(\S+)([\s\S]*)$/.exec(value);
  if (!candidate) return undefined;
  const token = candidate[1]!.replace(/[.,;]$/, '');
  const tail = candidate[2]!.trim();
  if (tail && !/^(?:[—–-]\s*|\(|pendente\b|a confirmar\b|a validar\b|provis[oó]ri[oa]\b)/i.test(tail)) return undefined;
  if (/[\\<>@]|^[/.]|^[a-z]:[^/]/i.test(token) || /^(?:file|javascript|data|ftp):/i.test(token)) return undefined;
  if (!/^https?:\/\//i.test(token) && /\.(?:md|txt|html?|css|[cm]?js|json|pdf|docx?|xlsx?|zip)(?:[?#]|$)/i.test(token)) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(token) ? token : `https://${token}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    const host = url.hostname;
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host) || /\.(?:local|localhost|internal|invalid)$/i.test(host)) return undefined;
    return `${token}${tail ? ` ${tail}` : ''}`;
  } catch { return undefined; }
}

function splitPair(line: string): { key: string; value: string } | undefined {
  const match = /^([^:|]{2,85}):\s*(.*)$/.exec(clean(line));
  return match ? { key: match[1]!.trim(), value: match[2]!.trim() } : undefined;
}

function pairMapping(key: string, context: Context[]): { mapping: Mapping; scope?: string } | undefined {
  const inherited = contextMapping(context);
  const scope = scopeIn(key) ?? contextScope(context);
  const shortScope = /^(?:site|website|web|redes sociais|pecas sociais(?: e impressas)?|social media|instagram|comum as duas)$/.test(keyText(key));
  if (shortScope && inherited?.field.startsWith('brand.')) return { mapping: inherited, scope };
  const result = directMapping(key);
  if (!result) return undefined;
  // Ambiguous labels such as "principal" and "texto" only describe colors in a color section.
  if (/^(?:primaria|principal|secundaria|fundo|texto|destaque)$/.test(keyText(key)) && !inherited?.field.startsWith('brand.')) return undefined;
  return { mapping: result, ...(result.field.startsWith('brand.') && scope ? { scope } : {}) };
}

function headingAt(lines: string[], index: number): { heading: string; level: number; consumed: number; synthetic?: boolean } | undefined {
  const atx = /^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(lines[index]!);
  if (atx) return { heading: atx[2]!, level: atx[1]!.length, consumed: 1 };
  if (lines[index]!.trim() && index + 1 < lines.length && /^\s{0,3}(?:={3,}|-{3,})\s*$/.test(lines[index + 1]!)) return { heading: lines[index]!.trim(), level: lines[index + 1]!.trim()[0] === '=' ? 1 : 2, consumed: 2 };
  const bold = /^\s*\*\*([^*]+)\*\*(.*)$/.exec(lines[index]!);
  if (bold && !splitPair(bold[1]!) && (scopeIn(bold[1]!) || (!bold[2]!.trim() && headingMapping(bold[1]!)))) return { heading: bold[1]!, level: 7, consumed: 1, synthetic: true };
  return undefined;
}

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => clean(cell.replace(/\\\|/g, '|')));
const separator = (line: string) => line.includes('|') && cells(line).every(cell => /^:?-{3,}:?$/.test(cell.trim()));

function tableCandidates(lines: string[], start: number, context: Context[]): { candidates: Candidate[]; next: number } {
  const headers = cells(lines[start]!);
  const result: Candidate[] = [];
  const inherited = contextMapping(context);
  const typographyTable = inherited?.field === 'brand.typography' || headers.some(header => /^(?:fonte|fontes|tipografia|familia tipografica)$/.test(keyText(header)));
  const colorTable = inherited?.field.startsWith('brand.') && inherited.field !== 'brand.typography' || headers.some(header => /^(?:hex|hexadecimal|cor|cores)$/.test(keyText(header)));
  let i = start + 2;
  const groupedTypography = new Map<string, { candidate: Candidate; labels: Set<string> }>();
  for (; i < lines.length && lines[i]!.includes('|') && lines[i]!.trim(); i++) {
    const row = cells(lines[i]!);
    if (row.length !== headers.length || row.every(cell => !cell)) continue;
    const key = row[0]!;
    const scope = scopeIn(key) ?? contextScope(context);
    const notesIndex = headers.findIndex(header => /^(?:observacao|observacoes|nota|notas|status|ressalva)$/.test(keyText(header)));
    const suffix = notesIndex >= 0 && row[notesIndex] ? ` — ${row[notesIndex]}` : '';
    const mapped = pairMapping(key, context);
    if (typographyTable) {
      const fontIndex = headers.findIndex(header => /^(?:fonte|fontes|tipografia|familia tipografica)$/.test(keyText(header)));
      const valueIndex = fontIndex >= 0 ? fontIndex : 1;
      const value = row[valueIndex];
      if (!value) continue;
      const labelIsScope = !!scopeIn(key);
      const label = keyText(key);
      const sentence = `${labelIsScope ? '' : `${key}: `}${value}${suffix}`;
      const groupKey = scope ?? '';
      const existing = groupedTypography.get(groupKey);
      // Title/body rows describe one typography system; repeated roles remain separate declarations.
      if (existing && !existing.labels.has(label) && !labelIsScope) {
        existing.candidate.value += `\n${sentence}`;
        existing.candidate.endLine = i + 1;
        existing.labels.add(label);
      } else {
        const candidate: Candidate = { ...typography, value: sentence, ...(scope ? { scope } : {}), line: i + 1, endLine: i + 1 };
        result.push(candidate);
        if (!existing && !labelIsScope) groupedTypography.set(groupKey, { candidate, labels: new Set([label]) });
      }
      continue;
    }
    if (colorTable) {
      const colorIndex = headers.findIndex(header => /^(?:hex|hexadecimal|cor|codigo)$/.test(keyText(header)));
      const value = row[colorIndex > 0 ? colorIndex : 1];
      if (!value) continue;
      const roleIndex = headers.findIndex(header => /^(?:uso|funcao|papel)$/.test(keyText(header)));
      const role = directMapping(key) ?? (roleIndex >= 0 ? directMapping(row[roleIndex]!) : undefined);
      const field = role?.field.startsWith('brand.') ? role : palette;
      const roleText = roleIndex > 0 && row[roleIndex] ? ` — ${row[roleIndex]}` : '';
      result.push({ ...field, value: `${key}: ${value}${roleText}${suffix}`, ...(scope ? { scope } : {}), line: i + 1, endLine: i + 1 });
      continue;
    }
    if (mapped) result.push({ ...mapped.mapping, value: row.slice(1).filter(Boolean).join(' — '), ...(mapped.scope ? { scope: mapped.scope } : {}), line: i + 1, endLine: i + 1 });
  }
  return { candidates: result, next: i };
}

/** Deterministic source assertions only. No source text is evaluated or executed. */
export function extractKnowledge(files: FileEntry[], internalTexts: ReadonlyMap<string, string>): KnowledgeItem[] {
  const knowledge: KnowledgeItem[] = [];
  for (const entry of files) {
    if (knowledge.length >= MAX_ITEMS) break;
    if (!isKnowledgeSource(entry)) continue;
    const content = internalTexts.get(entry.id);
    if (!content) continue;
    const lines = content.split(/\r?\n/).slice(0, MAX_LINES);
    // Erase fenced blocks and HTML comments without changing line numbers.
    let fence: string | undefined;
    let comment = false;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]!;
      if (fence) { if (new RegExp(`^\\s{0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = undefined; lines[i] = ''; continue; }
      const opening = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (opening) { fence = opening[1]!; lines[i] = ''; continue; }
      if (comment) { const end = line.indexOf('-->'); if (end < 0) { lines[i] = ''; continue; } line = line.slice(end + 3); comment = false; }
      const begin = line.indexOf('<!--');
      if (begin >= 0) { const end = line.indexOf('-->', begin + 4); if (end < 0) { line = line.slice(0, begin); comment = true; } else line = line.slice(0, begin) + line.slice(end + 3); }
      lines[i] = line;
    }
    const context: Context[] = [];
    let narrativeCaptured = false;
    const pathScope = /(?:^|\/)(?:landing-page|site|website|www)(?:\/|$)/i.test(entry.path.replace(/\\/g, '/')) ? 'Site' : undefined;
    const add = (candidate: Candidate) => {
      if (knowledge.length >= MAX_ITEMS) return;
      let value = clean(candidate.value);
      if (!value || value.length > MAX_VALUE || isPrivateOrClinical(value) || /^[^\n:]{1,100}:$/.test(value)) return;
      if (candidate.field === 'business.website') { const url = websiteValue(value); if (!url) return; value = url; }
      if (/^(?:\[[^\]]*\]|<[^>]*>|a definir|preencher|exemplo|n\/a|pendente|nao informado)\.?$/i.test(value)) return;
      if (candidate.field.startsWith('brand.') && (candidate.field.endsWith('Color') || candidate.field === 'brand.palette') && !/#[\da-f]{3}(?:[\da-f]{3})?\b|\brgba?\s*\(|\bhsla?\s*\(/i.test(value)) return;
      value = qualifiedContext(value, context);
      if (value.length > MAX_VALUE) return;
      const scope = candidate.scope ?? (candidate.field.startsWith('brand.') ? pathScope : undefined);
      const sourceCallsItInferred = (candidate.field.startsWith('brand.') && candidate.field !== 'brand.typography' && /(?:cores|paleta)[^\n]{0,100}(?:leitura visual|estimad|inferid|n[aã]o (?:s[aã]o )?(?:valores )?oficia)/i.test(content))
        || (candidate.field === 'communication.tone' && /\btom\b[^\n]{0,80}(?:derivad|inferid)/i.test(content));
      knowledge.push({ id: randomUUID(), field: candidate.field, value, category: candidate.category, origin: sourceCallsItInferred ? 'inferred' : 'explicit', status: 'pending', ...(scope ? { scope } : {}), evidence: { fileId: entry.id, path: entry.path, line: candidate.line, ...(candidate.endLine > candidate.line ? { endLine: candidate.endLine } : {}) } });
    };
    for (let i = 0; i < lines.length && knowledge.length < MAX_ITEMS;) {
      const heading = headingAt(lines, i);
      if (heading) {
        narrativeCaptured = false;
        if (heading.synthetic) while (context.at(-1)?.synthetic) context.pop();
        const level = heading.synthetic ? (context.at(-1)?.level ?? 0) + 1 : heading.level;
        while (context.length && context[context.length - 1]!.level >= level) context.pop();
        context.push({ heading: heading.heading, level, ...(heading.synthetic ? { synthetic: true } : {}) });
        i += heading.consumed;
        continue;
      }
      if (!lines[i]!.trim() || /^\s*(?:>|---+|\*\*\*+)/.test(lines[i]!)) { i++; continue; }
      if (i + 1 < lines.length && lines[i]!.includes('|') && separator(lines[i + 1]!)) {
        const table = tableCandidates(lines, i, context);
        for (const candidate of table.candidates) add(candidate);
        i = table.next;
        continue;
      }
      const pair = splitPair(lines[i]!);
      if (pair && !pair.value) { i++; continue; }
      const pairRule = pair ? pairMapping(pair.key, context) : undefined;
      const inherited = contextMapping(context);
      const selected = pairRule?.mapping ?? inherited;
      const collectPalette = !pairRule && inherited?.field === 'brand.palette' && /^\s*[-*+]\s+/.test(lines[i]!);
      const start = i;
      const paragraphs: string[] = [pairRule ? pair!.value : clean(lines[i]!)];
      i++;
      for (; i < lines.length; i++) {
        if (headingAt(lines, i) || /^\s*(?:>|---+|\*\*\*+)/.test(lines[i]!) || (i + 1 < lines.length && lines[i]!.includes('|') && separator(lines[i + 1]!))) break;
        if (!lines[i]!.trim()) {
          break;
        }
        const nextPair = splitPair(lines[i]!);
        if (nextPair && !collectPalette && (pairRule || pairMapping(nextPair.key, context))) break;
        // A non-indented bullet starts its own labelled assertion, while continuation prose retains caveats.
        if (pairRule && /^\s*[-*+]\s+/.test(lines[i]!)) break;
        paragraphs.push(clean(lines[i]!));
      }
      if (!selected) continue;
      if (!pairRule && narrativeCaptured) continue;
      if (!pairRule && selected.field === 'brand.palette' && !collectPalette) continue;
      // Typography instructions and commentary are not declarations of font families.
      if (!pairRule && selected.field === 'brand.typography' && ((paragraphs.join(' ').length > 120 && !/[+]|\((?:t[ií]tulos?|corpo)\)/i.test(paragraphs.join(' '))) || /^(?:nao\b|mesmo caso\b|a referencia\b|duas?\b|familias em uso\b|existem\b|as fontes\b)/.test(normalized(paragraphs.join(' '))))) continue;
      const scope = pairRule?.scope ?? (selected.field.startsWith('brand.') ? contextScope(context) : undefined);
      let endLine = i;
      while (endLine > start + 1 && !lines[endLine - 1]!.trim()) endLine--;
      const before = knowledge.length;
      add({ ...selected, value: paragraphs.join('\n').trim(), ...(scope ? { scope } : {}), line: start + 1, endLine });
      if (!pairRule && knowledge.length > before) narrativeCaptured = true;
    }
  }
  markKnowledgeConflicts(knowledge);
  return knowledge;
}
