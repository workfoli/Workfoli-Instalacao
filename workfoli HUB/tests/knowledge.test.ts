import assert from 'node:assert/strict';
import test from 'node:test';
import type { FileEntry } from '../packages/contracts/index.js';
import { extractKnowledge, isKnowledgeSource, KNOWLEDGE_VERSION } from '../packages/core/knowledge.js';
import { interpret } from '../packages/core/interpret.js';

function source(id: string, filePath = '_memoria/empresa.md', overrides: Partial<FileEntry> = {}): FileEntry {
  return { id, path: filePath, size: 100, hash: 'a'.repeat(64), extension: '.md', kind: 'file', category: 'documentation', disposition: 'indexed', sensitive: false, reason: 'Fixture sintética.', ...overrides };
}
function extract(text: string, filePath = '_memoria/empresa.md') {
  const file = source('source', filePath);
  return extractKnowledge([file], new Map([[file.id, text]]));
}

test('font families labelled Site are typography in context, never a website', () => {
  const items = extract('# Tipografia\n- Site: Lora + Inter\n- Redes sociais: Sora + Nunito\n', 'identidade/design-guide.md');
  assert.equal(items.length, 2);
  assert.deepEqual(items.map(item => [item.field, item.scope, item.value]), [
    ['brand.typography', 'Site', 'Lora + Inter'], ['brand.typography', 'Redes sociais', 'Sora + Nunito'],
  ]);
  assert(items.every(item => item.status === 'pending' && !item.conflict));
  assert.equal(extract('Site: Lora + Inter').length, 0);
});

test('website accepts valid URLs, domains and Markdown links, but rejects local files and schemes', () => {
  for (const [input, expected] of [
    ['https://empresa.example.com/sobre', 'https://empresa.example.com/sobre'],
    ['empresa.example.com.br', 'empresa.example.com.br'],
    ['[Site oficial](https://empresa.example.com)', 'https://empresa.example.com'],
    ['[Site oficial](https://empresa.example.com) — a confirmar', 'https://empresa.example.com — a confirmar'],
    ['<https://empresa.example.com>', 'https://empresa.example.com'],
  ]) {
    const [item] = extract(`Site: ${input}`);
    assert.equal(item?.field, 'business.website', input);
    assert.equal(item?.value, expected, input);
    assert.equal(item?.status, 'pending');
  }
  for (const input of ['Lora + Inter', 'C:\\clientes\\site', './site/index.html', '/tmp/site', 'index.html', 'manual.md', 'localhost:3000', 'http://127.0.0.1', 'https://workspace.local', 'file:///tmp/site', 'javascript:alert(1)', 'pessoa@example.com']) {
    assert.equal(extract(`Site: ${input}`).length, 0, input);
  }
});

test('sections map paragraphs and lists to complete assertions with inclusive source lines', () => {
  const text = [
    '# Empresa', '## Atuação', 'Consultoria de design para negócios locais.', '',
    '## Perfil de paciente', 'Adultos que procuram informação geral sobre prevenção.', '',
    '## Região de atuação', 'Região metropolitana e municípios vizinhos.', '',
    '## Tom de voz', '- Acolhedor e claro.', '- Explicar os termos sem simplificar demais.', '',
    '## Prioridade principal', 'Organizar o calendário de conteúdo.', 'A meta depende de validação com a equipe.',
  ].join('\n');
  const items = extract(text);
  assert.deepEqual(items.map(item => item.field), ['business.specialty', 'business.audience', 'business.location', 'communication.tone', 'strategy.objective']);
  assert.deepEqual(items.map(item => [item.evidence.line, item.evidence.endLine]), [[3, undefined], [6, undefined], [9, undefined], [12, 13], [16, 17]]);
  assert.equal(items[3]!.value, 'Acolhedor e claro.\nExplicar os termos sem simplificar demais.');
  assert.match(items[4]!.value, /depende de validação/);
  assert(items.every(item => item.status === 'pending' && item.origin === 'explicit'));
});

test('scope is inherited in either heading order, including parenthesized scope', () => {
  const first = extract('# Site\n## Tipografia\nLora e Inter.\n# Redes sociais\n## Tipografia\nSora e Nunito.', 'marca.md');
  const second = extract('# Tipografia\n## Site\nLora e Inter.\n## Redes sociais\nSora e Nunito.', 'marca.md');
  const third = extract('# Tipografia (Site)\nLora e Inter.\n# Tipografia — Redes sociais\nSora e Nunito.', 'marca.md');
  for (const items of [first, second, third]) {
    assert.deepEqual(items.map(item => [item.field, item.scope]), [['brand.typography', 'Site'], ['brand.typography', 'Redes sociais']]);
    assert(items.every(item => !item.conflict));
  }
});

test('color tables retain roles, source rows, scope and qualifications', () => {
  const items = extract([
    '# Site', '## Cores', '| Cor | Hex | Observação |', '| --- | --- | --- |',
    '| Primária | #123456 | Pendente de validação. |', '| Secundária | #ABCDEF | Uso em detalhes. |',
    '# Redes sociais', '## Cores', '- Cor primária: #654321 (proposta provisória).',
  ].join('\n'), 'design-guide.md');
  assert.deepEqual(items.map(item => [item.field, item.scope, item.evidence.line]), [
    ['brand.primaryColor', 'Site', 5], ['brand.secondaryColor', 'Site', 6], ['brand.primaryColor', 'Redes sociais', 9],
  ]);
  assert.match(items[0]!.value, /#123456.*Pendente/);
  assert.match(items[2]!.value, /proposta provisória/);
  assert(items.every(item => item.status === 'pending' && !item.conflict));
});

test('typography tables group complementary roles and preserve publication scopes', () => {
  const roles = extract('# Tipografia\n| Uso | Fonte |\n| --- | --- |\n| Títulos | Lora |\n| Corpo | Inter |', 'brand-guide.md');
  assert.equal(roles.length, 1);
  assert.equal(roles[0]!.value, 'Títulos: Lora\nCorpo: Inter');
  assert.deepEqual(roles[0]!.evidence, { fileId: 'source', path: 'brand-guide.md', line: 4, endLine: 5 });
  const scoped = extract('# Tipografia\n| Canal | Fonte | Status |\n| --- | --- | --- |\n| Site | Lora + Inter | Pendente |\n| Redes sociais | Sora + Nunito | A confirmar |', 'brand-guide.md');
  assert.equal(scoped.length, 2);
  assert.deepEqual(scoped.map(item => item.scope), ['Site', 'Redes sociais']);
  assert(scoped.every(item => !item.conflict && item.status === 'pending'));
  assert.match(scoped[1]!.value, /A confirmar/);
});

test('generic field/value tables and Markdown links remain supported', () => {
  const items = extract('| Campo | Valor |\n| --- | --- |\n| Nome | Empresa Aurora |\n| Site | [Página oficial](https://aurora.example.com) |\n| Tom de voz | Claro e cuidadoso. |');
  assert.deepEqual(items.map(item => [item.field, item.evidence.line]), [['identity.name', 3], ['business.website', 4], ['communication.tone', 5]]);
  assert.equal(items[1]!.value, 'https://aurora.example.com');
});

test('conflicts use field and scope and never silently merge declarations from different sources', () => {
  const files = [source('first', 'identidade/brand-guide.md'), source('second', 'identidade/design-guide.md')];
  const items = extractKnowledge(files, new Map([
    ['first', '# Tipografia\nSite: Lora + Inter\nRedes sociais: Sora + Nunito'],
    ['second', '# Tipografia\nSite: Merriweather + Source Sans'],
  ]));
  assert.equal(items.length, 3);
  assert.equal(items.filter(item => item.scope === 'Site' && item.conflict).length, 2);
  assert.equal(items.find(item => item.scope === 'Redes sociais')?.conflict, undefined);
  assert.equal(new Set(items.map(item => item.id)).size, 3);
  const same = extractKnowledge(files, new Map([['first', 'Nome: Aurora'], ['second', 'Nome: Aurora']]));
  assert.equal(same.length, 2);
  assert(same.every(item => !item.conflict));
});

test('retains heading and continuation caveats without turning proposals into confirmed knowledge', () => {
  const items = extract('# Tom de voz (proposta pendente)\nClaro, acolhedor e direto.\n\n# Cores\nCor primária: #112233\n  A confirmar antes da publicação.', 'marca.md');
  assert.equal(items.length, 2);
  assert.match(items[0]!.value, /proposta pendente/);
  assert.match(items[1]!.value, /A confirmar antes da publicação/);
  assert.equal(items[1]!.evidence.endLine, 6);
  assert(items.every(item => item.status === 'pending'));
});

test('does not extract personal clinical records, prices, hidden comments or code samples', () => {
  const items = extract([
    'Nome: Empresa Aurora', 'Preço: R$ 500', 'Objetivo: Cobrar R$ 500 por consulta.',
    'Perfil de paciente: Paciente: Pessoa Exemplo; CPF 000.000.000-00.',
    'Atuação: Diagnóstico registrado no prontuário.', '```md', 'Nome: Exemplo em código', '```',
    '<!--', 'Nome: Exemplo oculto', '-->', 'Site: https://aurora.example.com',
  ].join('\n'));
  assert.deepEqual(items.map(item => item.field), ['identity.name', 'business.website']);
  assert.deepEqual(items.map(item => item.evidence.line), [1, 12]);
});

test('eligibility stays confined to indexed memory and guide sources', () => {
  assert.equal(KNOWLEDGE_VERSION, 2);
  assert.equal(isKnowledgeSource(source('one')), true);
  for (const entry of [
    source('x', 'README.md'), source('x', 'scripts/analysis.ts', { extension: '.ts' }),
    source('x', 'templates/empresa.md'), source('x', '_memoria/pacientes.md'),
    source('x', '_memoria/empresa.md', { sensitive: true }), source('x', '_memoria/empresa.md', { disposition: 'excluded' }),
    source('x', '_memoria/empresa.md', { kind: 'symlink' }), source('x', '_memoria/empresa.md', { hash: undefined }),
  ]) {
    assert.equal(isKnowledgeSource(entry), false, entry.path);
    assert.equal(extractKnowledge([entry], new Map([[entry.id, 'Nome: Não extrair']])).length, 0);
  }
});

test('does not clip long values and interpret delegates to the same extractor', () => {
  assert.equal(extract(`# Tom de voz\n${'Uma frase completa. '.repeat(100)}`).length, 0);
  const file = source('id', 'marca.md');
  const content = '# Tipografia\nSite: Lora + Inter\nRedes sociais: Sora + Nunito';
  const result = interpret([file], new Map([[file.id, content]]));
  assert.equal(result.knowledge.length, 2);
  assert(result.knowledge.every(item => item.status === 'pending'));
  assert(!result.warnings.some(warning => warning.code === 'knowledge-conflict'));
});

test('keeps scoped palettes apart and excludes commentary and empty labels', () => {
  const items = extract([
    '# Identidade', '## Cores', '**Peças sociais e impressas — clara.** Origem: peças recebidas.',
    '', '- Fundo principal: #112233', '- Destaque / CTA: #445566', '- Texto: #778899',
    '', '**Site (`site/`) — escura.** Origem: material institucional.', '', '- Fundo escuro: #111111', '- Seções claras: #EEEEEE',
    '', '## Tipografia', 'Mesmo caso das cores: duas famílias em uso.', '', '- **Peças sociais:** Lora (títulos) + Inter (corpo)', '- **Site:** Sora (títulos) + Nunito (corpo)',
    '', 'Não trocar a família sem revisão.', '', '## Prioridade principal', 'Melhorar a qualidade das solicitações.', '', 'Funil desenhado:', '```', 'A -> B', '```', '', 'Frentes, em ordem:', '1. Iniciativa com outra descrição.',
  ].join('\n'), 'design-guide.md');
  assert.equal(items.length, 5);
  assert.deepEqual(items.filter(item => item.field === 'brand.palette').map(item => item.scope), ['Redes sociais', 'Site']);
  assert(items.every(item => !item.conflict));
  assert.equal(items.find(item => item.field === 'strategy.objective')?.value, 'Melhorar a qualidade das solicitações.');
  assert(!items.some(item => /mesmo caso|trocar a fam|funil desenhado/i.test(item.value)));
});

test('document metadata does not become business knowledge and asset paths do not conflict with matching font families', () => {
  const items = extract('# Empresa\n> O agente lê este arquivo antes de responder.\n\n**Nome:** Aurora\n**Negócio:** Comunicação\n**Equipe:**\n- Pessoa de exemplo\n\n## Histórico\nTexto operacional.', 'empresa.md');
  assert.deepEqual(items.map(item => item.field), ['identity.name', 'business.description']);
  const files = [source('a', 'site/marca.md'), source('b', 'design-guide.md')];
  const fonts = extractKnowledge(files, new Map([
    ['a', 'Tipografia: Lora (títulos) + Inter (corpo), arquivos locais em assets/fonts.'],
    ['b', '## Tipografia\nSite: Lora (títulos) + Inter (corpo) — arquivos em site/assets/fonts'],
  ]));
  assert.equal(fonts.length, 2); assert(fonts.every(item => item.scope === 'Site' && !item.conflict));
});

test('source qualifications keep estimated colors and derived tone marked as inferred', () => {
  const colors = extract('> As cores abaixo são leitura visual, não valores oficiais.\n\n## Cores\nCor principal: #123456', 'marca.md');
  assert.equal(colors[0]?.origin, 'inferred'); assert.equal(colors[0]?.status, 'pending');
  const tone = extract('## Tom de voz\nClaro e acolhedor.\n\n> O tom acima é derivado de uma conversa inicial.', 'preferencias.md');
  assert.equal(tone[0]?.origin, 'inferred');
});
