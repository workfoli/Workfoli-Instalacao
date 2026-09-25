// E2E da aplicação em navegador real, sobre um CLONE descartável de uma instância.
//
// A instância original nunca é alterada: o banco é copiado com VACUUM INTO (leitura) e o clone não recebe
// segredos, arquivos privados nem backups. Todo registro criado é fictício. Google, Meta, GitHub, Vercel,
// Cloudflare e Supabase são provedores FALSOS locais (tests/fake-providers.ts): nenhuma conta real é usada.
//
// Uso (na pasta do Hub):
//   npm run build:hub
//   npm run test:e2e -- "..\instances\<empresa>" [--browser msedge|chrome|<executável>] [--also chrome,<executável>] [--keep]
// Capturas e relatório: test-results/e2e/ (fora do Git).
import { register } from 'tsx/esm/api';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

register();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadInstance } = await import('../packages/instance/instance.ts');
const { startHubServer } = await import('../packages/hub/server.ts');
const { liveConnection, readBundle, writeBundle } = await import('../packages/hub/integrations/connections.ts');
const { startFakeProviders } = await import('../tests/fake-providers.ts');

// ————————————————————————— Argumentos —————————————————————————
const options = { source: '', browser: 'msedge', also: [], keep: false };
for (let index = 2; index < process.argv.length; index++) {
  const value = process.argv[index];
  if (value === '--keep') options.keep = true;
  else if (value === '--browser') options.browser = process.argv[++index];
  else if (value === '--also') options.also = process.argv[++index].split(',').map(item => item.trim()).filter(Boolean);
  else if (!options.source) options.source = value;
}
if (!options.source) {
  console.error('Uso: npm run test:e2e -- <pasta da instância> [--browser msedge|chrome|<executável>] [--also chrome,<executável>] [--keep]');
  process.exit(2);
}
if (!fs.existsSync(path.join(root, 'dist-hub', 'index.html'))) throw new Error('Rode npm run build:hub antes do E2E.');
const source = path.resolve(options.source);
const out = path.join(root, 'test-results', 'e2e');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// ————————————————————————— Clone descartável —————————————————————————
const original = loadInstance(source);
for (const [key, value] of Object.entries(original.file.layout)) {
  if (value !== key) throw new Error(`Layout não padrão (${key}: ${value}); o E2E clona só instâncias com o layout padrão.`);
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'workfoli-e2e-'));
// O clone tem cópia da Base e do banco da empresa: é apagado ao sair, mesmo se o E2E for interrompido.
process.on('exit', () => { if (!options.keep) { try { fs.rmSync(temp, { recursive: true, force: true }); } catch { /* o sistema limpa a pasta temporária */ } } });
process.on('SIGINT', () => process.exit(130));
const clone = path.join(temp, 'instances', `${path.basename(source)}-e2e`);
fs.mkdirSync(clone, { recursive: true });
for (const entry of fs.readdirSync(source, { withFileTypes: true })) if (entry.isFile()) fs.copyFileSync(path.join(source, entry.name), path.join(clone, entry.name));
fs.cpSync(original.paths.base, path.join(clone, 'base'), { recursive: true, filter: file => !/[\\/](?:\.git|node_modules)(?:[\\/]|$)/.test(file) });
fs.cpSync(original.paths.hub, path.join(clone, 'hub'), { recursive: true });
for (const dir of ['data', 'files', 'secrets']) fs.mkdirSync(path.join(clone, dir), { recursive: true });
{
  const hubConfigFile = path.join(clone, 'hub', 'workfoli.hub.json');
  const hubConfig = JSON.parse(fs.readFileSync(hubConfigFile, 'utf8'));
  if (hubConfig.mode === 'remote' || hubConfig.server?.publicUrl) {
    hubConfig.mode = 'local';
    hubConfig.server = { ...hubConfig.server, publicUrl: null };
    fs.writeFileSync(hubConfigFile, JSON.stringify(hubConfig, null, 2));
    console.log('Clone ajustado: modo local e sem endereço público (a Base está copiada nele).');
  }
}
fs.writeFileSync(path.join(clone, 'secrets', 'README.md'), '# Segredos do clone de validação\n\nSó valores fictícios dos provedores falsos.\n');
{
  // Cópia consistente do banco real, sem escrever nada na original.
  const db = new DatabaseSync(original.dbPath, { readOnly: true });
  db.exec(`VACUUM INTO '${path.join(clone, 'data', 'hub.sqlite').replace(/'/g, "''")}'`);
  db.close();
}

// ————————————————————————— Resultado —————————————————————————
const results = [];
const problems = [];
const leaks = [];
const allowed = [];
const allow = (pattern, status, method) => allowed.push({ pattern, status, method });
const isAllowed = (method, url, status) => allowed.some(rule => rule.status === status && rule.pattern.test(url) && (!rule.method || rule.method === method));
allow(/\/api\/session$/, 401, 'GET');
const SECRETS = ['google-access', 'google-refresh', 'google-secret', 'meta-long', 'meta-short', 'meta-secret', 'page-token', 'github-access', 'github-secret', 'vercel-token-valido', 'cloudflare-token-ativo', 'sbp-token-sintetico', 'dev-token'];
const reads = new Set();
let current = null;
const slug = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });

async function step(name, fn) {
  const started = Date.now();
  const before = problems.length;
  try {
    await fn();
    await Promise.allSettled([...reads]);
    const fresh = problems.slice(before);
    if (fresh.length) throw new Error(`problemas no navegador/servidor: ${fresh.join(' | ')}`);
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`✔ ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    const message = String(error?.message ?? error).split('\n').filter(Boolean).slice(0, 6).join(' ⏎ ');
    results.push({ name, ok: false, error: message });
    console.log(`✖ ${name}\n    ${message}`);
    if (current) await current.screenshot({ path: path.join(out, `falha-${slug(name)}.png`), fullPage: true }).catch(() => {});
  }
}

// ————————————————————————— CLI real sobre o clone —————————————————————————
const cli = (args, input) => {
  const run = spawnSync(process.execPath, [path.join(root, 'bin', 'workfoli.mjs'), ...args], { cwd: root, encoding: 'utf8', input, timeout: 120_000 });
  return { code: run.status, out: `${run.stdout ?? ''}${run.stderr ?? ''}` };
};
let ownerLink = '';
await step('CLI: doctor, hub owner e secrets no clone (valores nunca impressos)', async () => {
  const doctor = cli(['doctor', clone]);
  assert.ok(/\[instância\]/.test(doctor.out), doctor.out);
  assert.ok(!/✗/.test(doctor.out), `doctor com erro:\n${doctor.out}`);
  const owner = cli(['hub', 'owner', clone]);
  const link = /(https?:\/\/\S+#\/ativar\?token=\S+)/.exec(owner.out)?.[1];
  assert.ok(link, owner.out);
  ownerLink = link;
  // Credenciais FICTÍCIAS dos provedores falsos, gravadas como o operador faria (valor pela entrada padrão).
  const values = { GOOGLE_OAUTH_CLIENT_ID: 'google-client', GOOGLE_OAUTH_CLIENT_SECRET: 'google-secret', GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-token', META_APP_ID: 'meta-app', META_APP_SECRET: 'meta-secret', GITHUB_OAUTH_CLIENT_ID: 'github-client', GITHUB_OAUTH_CLIENT_SECRET: 'github-secret' };
  for (const [name, value] of Object.entries(values)) {
    const set = cli(['secrets', 'set', clone, name], value);
    assert.equal(set.code, 0, set.out);
    assert.ok(!set.out.includes(value) || value.length < 8, `valor impresso ao gravar ${name}`);
  }
  const list = cli(['secrets', 'list', clone]);
  for (const [name, value] of Object.entries(values)) {
    assert.ok(list.out.includes(name), `${name} não listado`);
    if (value.length >= 8) assert.ok(!list.out.includes(value), `valor de ${name} impresso pela CLI`);
  }
  const sync = cli(['hub', 'sync', clone]);
  assert.equal(sync.code, 0, sync.out);
});

// ————————————————————————— Hub e provedores falsos —————————————————————————
const cleanups = [];
const fake = await startFakeProviders({ after: fn => cleanups.push(fn) });
const serverErrors = [];
const consoleError = console.error;
console.error = (...args) => { serverErrors.push(args.map(String).join(' ')); consoleError(...args); };
const server = await startHubServer({ instanceDir: clone, port: 0, quiet: false, integrations: { endpoints: fake.endpoints, autoSync: false } });
const hubUrl = server.url;
ownerLink = ownerLink.replace(/^https?:\/\/[^/#]+/, hubUrl);

function watch(page, label) {
  page.on('pageerror', error => problems.push(`[${label}] erro de página: ${error.message}`));
  page.on('dialog', dialog => { problems.push(`[${label}] diálogo JavaScript inesperado: ${dialog.message()}`); void dialog.dismiss(); });
  page.on('console', message => {
    if (message.type() !== 'error') return;
    // Falha de carregamento com status é julgada pela resposta (método + rota), logo abaixo.
    if (/status of \d{3}/.test(message.text())) return;
    problems.push(`[${label}] console: ${message.text().slice(0, 200)}`);
  });
  page.on('response', response => {
    const url = response.url();
    const status = response.status();
    const method = response.request().method();
    if (status >= 400 && !isAllowed(method, url, status)) problems.push(`[${label}] HTTP ${status} ${method} ${url.replace(/^https?:\/\/[^/]+/, '')}`);
    const type = response.headers()['content-type'] ?? '';
    if (url.startsWith(hubUrl) && /json|html/.test(type)) {
      // Corpo de página que já navegou para outra pode nunca chegar: a leitura desiste em 5 s.
      const body = Promise.race([response.text(), new Promise(resolve => setTimeout(() => resolve(''), 5_000))]);
      const read = body.then(body => {
        for (const secret of SECRETS) if (body.includes(secret)) leaks.push(`${secret} em ${method} ${url.replace(hubUrl, '')}`);
      }).catch(() => {}).finally(() => reads.delete(read));
      reads.add(read);
    }
  });
}

async function launch(spec) {
  if (spec === 'msedge' || spec === 'chrome') return chromium.launch({ channel: spec, headless: true });
  if (!fs.existsSync(spec)) throw new Error(`Navegador não encontrado: ${spec}`);
  return chromium.launch({ executablePath: spec, headless: true });
}
const browser = await launch(options.browser);
const PASSWORD = 'senha-ficticia-e2e-1';
const users = {
  owner: { name: 'Pessoa Fundadora Fictícia', email: 'fundadora@exemplo.test', password: PASSWORD },
  member: { name: 'Equipe Fictícia', email: 'equipe@exemplo.test', password: PASSWORD, role: 'Equipe' },
  viewer: { name: 'Leitura Fictícia', email: 'leitura@exemplo.test', password: PASSWORD, role: 'Leitura' },
  manager: { name: 'Gestor Fictício', email: 'gestor@exemplo.test', password: PASSWORD, role: 'Gestor Workfoli' },
  custom: { name: 'Atendimento Fictício', email: 'atendimento@exemplo.test', password: PASSWORD, role: 'Atendimento Fictício' },
};

async function newPage(label, contextOptions = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', acceptDownloads: true, ...contextOptions });
  const page = await context.newPage();
  watch(page, label);
  current = page;
  return page;
}
async function login(page, user) {
  await open(page, `#/`);
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.locator('.user-card .name', { hasText: user.name }).waitFor();
}
async function activate(page, link, user) {
  await page.goto(link);
  await page.getByRole('heading', { name: /Olá/ }).waitFor();
  await page.getByLabel('Seu nome').fill(user.name);
  await page.getByLabel('E-mail de acesso').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill(user.password);
  await page.getByLabel('Repita a senha').fill(user.password);
  await page.getByRole('button', { name: 'Ativar acesso' }).click();
  await page.locator('.user-card .name', { hasText: user.name }).waitFor();
}
/** Chamada à API com a sessão da própria página (cookie + CSRF), como a interface faria. */
async function apiAs(page, method, route, body, expected) {
  const escaped = route.split('?')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (expected >= 400) allow(new RegExp(`${escaped}(?:\\?.*)?$`), expected, method);
  const result = await page.evaluate(async ({ method, route, body }) => {
    const session = await fetch('/api/session').then(response => response.json());
    const response = await fetch(route, { method, headers: { 'Content-Type': 'application/json', 'X-Workfoli-CSRF': session.csrf }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json().catch(() => null) };
  }, { method, route, body });
  if (expected) assert.equal(result.status, expected, `${method} ${route}: ${JSON.stringify(result.data)?.slice(0, 200)}`);
  return result;
}
/** Abre uma rota do Hub com carregamento completo (sem diálogo aberto nem estado de etapas anteriores). */
async function open(page, route) {
  await page.goto('about:blank');
  await page.goto(`${hubUrl}/${route}`);
  await settle(page);
}
/** Espera a tela assentar: rede ociosa e nenhum "Carregando…" no conteúdo. */
async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.locator('main .loading').first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
}
const toast = (page, text) => page.locator('.toast', { hasText: text }).first().waitFor({ timeout: 10_000 });
const dialog = (page, name) => page.getByRole('dialog', { name });
const nav = page => page.locator('aside.sidebar');
const readManifest = () => JSON.parse(fs.readFileSync(path.join(clone, 'base', 'workfoli.base.json'), 'utf8'));

// ————————————————————————— Fluxos —————————————————————————
const owner = await newPage('proprietário');
const ids = {};

await step('ativação do proprietário pelo link da CLI, com erro de senha fraca antes', async () => {
  allow(/\/api\/auth\/activate$/, 400, 'POST');
  await owner.goto(ownerLink);
  await owner.getByRole('heading', { name: /Olá/ }).waitFor();
  await shot(owner, '00-ativacao');
  await owner.getByLabel('Seu nome').fill(users.owner.name);
  await owner.getByLabel('E-mail de acesso').fill(users.owner.email);
  await owner.getByLabel('Senha', { exact: true }).fill('aaaaaaaaaaaa');
  await owner.getByLabel('Repita a senha').fill('aaaaaaaaaaaa');
  await owner.getByRole('button', { name: 'Ativar acesso' }).click();
  await owner.getByRole('alert').filter({ hasText: /senha/i }).waitFor();
  await owner.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await owner.getByLabel('Repita a senha').fill('senha-diferente-123');
  await owner.getByRole('button', { name: 'Ativar acesso' }).click();
  await owner.getByText('As senhas não conferem.').waitFor();
  await owner.getByLabel('Repita a senha').fill(PASSWORD);
  await owner.getByRole('button', { name: 'Ativar acesso' }).click();
  await owner.locator('.user-card .name', { hasText: users.owner.name }).waitFor();
  const reuse = await fetch(`${hubUrl}/api/auth/activation?token=${encodeURIComponent(new URL(ownerLink.replace('#/ativar', 'ativar')).searchParams.get('token'))}`);
  assert.equal(reuse.status, 400, 'link de ativação é de uso único');
});

// Expectativas derivadas da PRÓPRIA instância: manifesto clonado e a configuração do CRM que a interface usa.
const manifest0 = readManifest();
// Buscas pelo e-mail fictício: continuam certas mesmo quando a instância já tem contatos reais.
const CARLA_SEARCH = `/api/crm/contacts?q=${encodeURIComponent('carla@exemplo.test')}`;
const ctx = { crm: null, documents: [] };
const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pipeline = () => ctx.crm.config.pipelines.find(item => item.default) ?? ctx.crm.config.pipelines[0];
const stagesOf = kind => pipeline().stages.filter(stage => stage.kind === kind);
const valueLabel = () => `Valor (${ctx.crm.config.currency})`;
const automationsOn = (event, match = () => true) => ctx.crm.config.automations.filter(item => item.enabled && item.when.event === event && match(item));
const taskTitles = (list, name) => list.flatMap(item => item.actions.filter(action => action.type === 'create_task').map(action => action.title.replaceAll('{nome}', name)));
const tagsFrom = list => list.flatMap(item => item.actions.filter(action => action.type === 'add_tag').map(action => action.tag));
const sourceForTests = () => ctx.crm.sources.find(source => !source.core) ?? ctx.crm.sources.find(source => source.id !== 'manual');
/** Mesma regra da interface (lib/crm.ts): campos exigidos pela etapa que a oportunidade ainda não tem. */
const missingFor = (opportunity, stage) => (stage.requiredFields ?? []).filter(key => {
  if (key === 'value') return !opportunity.valueCents;
  if (key === 'expectedCloseDate') return !opportunity.expectedCloseDate;
  if (key === 'ownerId') return !opportunity.owner;
  if (key === 'contactId') return !opportunity.contact;
  if (key === 'organizationId') return !opportunity.organization;
  if (key === 'sourceId') return !opportunity.source;
  if (key.startsWith('custom.')) { const value = opportunity.custom[key.slice(7)]; return value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length); }
  return false;
});
async function chooseFirst(select) {
  await select.locator('option').nth(1).waitFor({ state: 'attached' });
  await select.selectOption({ index: 1 });
}
/** Preenche um campo personalizado de qualquer tipo com valor fictício; devolve o texto esperado na ficha. */
async function fillCustom(box, field) {
  const label = new RegExp(`^${escapeRe(field.label)}`);
  if (field.type === 'multiselect') { await box.getByRole('group', { name: label }).getByRole('button').first().click(); return field.options[0]; }
  if (field.type === 'select') { await chooseFirst(box.getByLabel(label)); return field.options[0]; }
  if (field.type === 'checkbox') { await box.getByLabel(label).check(); return 'Sim'; }
  const value = { number: '10', currency: '10', date: '2026-10-30', email: 'campo@exemplo.test', url: 'https://exemplo.test/campo', phone: '+55 11 90000-0000' }[field.type] ?? 'Valor fictício';
  await box.getByLabel(label).fill(value);
  return value;
}
async function fillRequiredCustom(box, entity) {
  for (const field of ctx.crm.config.customFields.filter(item => item.entity === entity && item.required)) await fillCustom(box, field);
}
async function fillStageRequirements(box, keys) {
  for (const key of keys) {
    if (key === 'value') await box.getByLabel(valueLabel()).fill('12000');
    else if (key === 'expectedCloseDate') await box.getByLabel('Previsão de fechamento').fill('2026-10-30');
    else if (key === 'ownerId') await chooseFirst(box.getByLabel('Responsável'));
    else if (key === 'sourceId') await chooseFirst(box.getByLabel('Origem'));
    else if (key === 'contactId') await chooseFirst(box.getByLabel(ctx.crm.labels.contact, { exact: true }));
    else if (key === 'organizationId') await chooseFirst(box.getByLabel(ctx.crm.labels.organization, { exact: true }));
    else if (key.startsWith('custom.')) await fillCustom(box, ctx.crm.config.customFields.find(field => field.entity === 'opportunity' && field.id === key.slice(7)));
  }
}

await step('visão geral com o contexto real da Base (empresa, projetos, pendências)', async () => {
  await open(owner, `#/`);
  await owner.getByRole('heading', { name: /Pessoa/ }).waitFor();
  const company = manifest0.company.name;
  assert.equal(await owner.title(), `${company} · Workfoli Hub`);
  await nav(owner).getByText(company, { exact: true }).first().waitFor();
  const baseTasks = (await apiAs(owner, 'GET', '/api/tasks/base')).data.sections;
  if (baseTasks.some(section => !/feito|conclu/i.test(section.title) && section.items.some(item => !item.done))) await owner.getByText('Pendências na Base').waitFor();
  await owner.getByText('Base conectada').waitFor();
  ctx.crm = (await apiAs(owner, 'GET', '/api/crm/config')).data;
  ctx.documents = (await apiAs(owner, 'GET', '/api/knowledge')).data.documents;
  assert.ok(ctx.documents.length, 'a Base tem documentos de conhecimento');
  await shot(owner, '01-visao-geral');
});

await step('navegação por todos os módulos ativos e planejados, sem erro', async () => {
  const session = (await apiAs(owner, 'GET', '/api/session')).data;
  const links = await nav(owner).locator('a.nav-item').evaluateAll(items => items.map(item => ({ href: item.getAttribute('href'), label: item.textContent.trim() })));
  assert.equal(links.length, session.modules.active.length + session.modules.custom.length + session.modules.planned.length, `módulos no menu: ${links.map(item => item.label).join(', ')}`);
  for (const link of links) {
    await open(owner, link.href);
    await owner.locator('main#conteudo').waitFor();
    const text = await owner.locator('main#conteudo').innerText();
    assert.ok(!/Sem acesso a esta área|Página não encontrada|Não foi possível/.test(text), `${link.label}: ${text.slice(0, 160)}`);
    await shot(owner, `02-modulo-${slug(link.href.replace('#/', '') || 'visao-geral')}`);
  }
  await open(owner, `#/rota-inexistente`);
  await owner.getByText('Sem acesso a esta área').waitFor();
  await open(owner, `#/crm/%E0%A4%A`);
  await owner.locator('main#conteudo').waitFor();
});

await step('conhecimento: documento real aberto e nota registrada na Base (arquivo no disco)', async () => {
  await open(owner, `#/knowledge`);
  await owner.locator('main .doc-link').first().click();
  await owner.locator('main article .faint', { hasText: '·' }).waitFor();
  assert.ok((await owner.locator('main article').innerText()).length > 40, 'documento real exibido');
  await owner.getByRole('button', { name: 'Registrar nota' }).click();
  const box = dialog(owner, 'Registrar nota na Base');
  await box.getByLabel('Título').fill('Nota fictícia da validação');
  await box.getByLabel('Texto').fill('Registrada pelo E2E no clone da instância.');
  await box.getByRole('button', { name: 'Registrar' }).click();
  await toast(owner, '');
  const notes = path.join(clone, 'base', 'conhecimento', 'notas');
  assert.ok(fs.existsSync(notes) && fs.readdirSync(notes).some(file => /nota-ficticia-da-validacao/.test(file)), 'nota gravada na Base do clone');
});

await step('projetos: detalhe real e projeto novo gravado no manifesto', async () => {
  await open(owner, `#/projects`);
  await owner.getByRole('button', { name: 'Novo projeto' }).click();
  const box = dialog(owner, 'Novo projeto');
  await box.getByLabel('Nome').fill('Projeto Fictício E2E');
  await box.getByLabel('Objetivo').fill('Validar a criação de projeto pelo Hub.');
  await box.getByRole('button', { name: 'Criar projeto' }).click();
  await owner.getByText('Projeto Fictício E2E').first().waitFor();
  assert.ok(readManifest().projects.some(item => item.id === 'projeto-ficticio-e2e'), 'projeto no manifesto do clone');
  assert.ok(fs.existsSync(path.join(clone, 'base', 'projetos', 'projeto-ficticio-e2e', 'README.md')));
  await open(owner, `#/projects/projeto-ficticio-e2e`);
  await owner.getByText('Validar a criação de projeto pelo Hub.').first().waitFor();
});

await step('tarefas: criar, iniciar e concluir', async () => {
  await open(owner, `#/tasks`);
  await owner.getByLabel('Nova tarefa').fill('Tarefa fictícia E2E');
  await owner.getByRole('button', { name: 'Adicionar' }).click();
  await owner.locator('main').getByText('Tarefa fictícia E2E').first().waitFor();
  const taskCard = () => owner.locator('.item-card', { hasText: 'Tarefa fictícia E2E' });
  await taskCard().getByRole('button', { name: 'Iniciar' }).click();
  await taskCard().getByRole('button', { name: 'Concluir' }).click();
  await settle(owner);
  const tasks = (await apiAs(owner, 'GET', '/api/tasks')).data.tasks;
  assert.equal(tasks.find(task => task.title === 'Tarefa fictícia E2E')?.status, 'done');
});

await step('Base ↔ Hub: pendência escrita no disco aparece no Hub', async () => {
  const tasksFile = path.join(clone, 'base', manifest0.context.tasks ?? 'tarefas.md');
  fs.appendFileSync(tasksFile, '\n## Validação E2E\n\n- [ ] Pendência fictícia escrita direto no disco\n');
  await owner.waitForTimeout(3_200);
  await open(owner, `#/tasks`);
  await owner.getByText('Pendência fictícia escrita direto no disco').waitFor();
});

await step('CRM vazio (quando a instância ainda não tem registros): estados vazios do funil e das listas', async () => {
  const empty = !(await apiAs(owner, 'GET', '/api/crm/leads?status=')).data.items.length && !(await apiAs(owner, 'GET', '/api/crm/opportunities')).data.items.length;
  await open(owner, `#/crm`);
  if (empty) await owner.getByText('Funil vazio.', { exact: false }).waitFor();
  await shot(owner, '10-crm-funil');
  await open(owner, `#/crm/leads`);
  if (empty) await owner.getByText(/Nenhum registro em/).waitFor();
});

await step('CRM: lead com validação de e-mail, origem e automação da Base', async () => {
  allow(/\/api\/crm\/leads$/, 400, 'POST');
  const labels = ctx.crm.labels;
  await open(owner, `#/crm`);
  await owner.getByRole('button', { name: labels.lead, exact: true }).click();
  const box = dialog(owner, `Novo ${labels.lead.toLowerCase()}`);
  await box.getByLabel('Nome', { exact: true }).fill('Carla Fictícia');
  await box.getByLabel('E-mail').fill('email-invalido');
  await box.getByRole('button', { name: 'Salvar' }).click();
  await box.getByRole('alert').filter({ hasText: /e-mail/i }).waitFor();
  await box.getByLabel('E-mail').fill('carla@exemplo.test');
  await box.getByLabel('Empresa', { exact: true }).fill('Padaria Fictícia');
  await box.getByLabel('Telefone').fill('+55 11 90000-0001');
  await box.getByLabel('Origem').selectOption({ label: sourceForTests().label });
  await box.getByLabel('Mensagem ou interesse').fill('Quer um site novo (dado fictício).');
  await fillRequiredCustom(box, 'lead');
  await box.getByRole('button', { name: 'Salvar' }).click();
  await owner.getByRole('heading', { name: /Carla Fictícia/ }).waitFor();
  for (const title of taskTitles(automationsOn('lead_created'), 'Carla Fictícia')) await owner.getByRole('link', { name: title }).waitFor();
  ids.lead = owner.url().split('/').pop();
  await shot(owner, '11-crm-lead');
});

await step('CRM: conversão do lead em contato e oportunidade', async () => {
  await owner.getByRole('button', { name: 'Converter' }).click();
  await dialog(owner, 'Converter Carla Fictícia').getByRole('button', { name: 'Converter' }).click();
  await owner.getByRole('heading', { name: /Padaria Fictícia/ }).waitFor();
  ids.opportunity = owner.url().split('/').pop();
  const contacts = (await apiAs(owner, 'GET', CARLA_SEARCH)).data.items;
  assert.equal(contacts.length, 1);
  ids.contact = contacts[0].id;
});

await step('CRM: duplicidade sugerida, nunca unida sozinha', async () => {
  allow(/\/api\/crm\/contacts$/, 409, 'POST');
  const labels = ctx.crm.labels;
  await open(owner, `#/crm/contatos`);
  await owner.locator('main .filter-row').getByRole('button', { name: labels.contact, exact: true }).click();
  const box = dialog(owner, `Novo ${labels.contact.toLowerCase()}`);
  await box.getByLabel('Nome', { exact: true }).fill('Carla F. Duplicada');
  await box.getByLabel('E-mail').fill('carla@exemplo.test');
  await fillRequiredCustom(box, 'contact');
  await box.getByRole('button', { name: 'Salvar' }).click();
  await box.getByText('Já existe:').waitFor();
  assert.equal((await apiAs(owner, 'GET', CARLA_SEARCH)).data.items.length, 1, 'nada criado nem unido sem escolha');
  await box.getByLabel(/Cadastrar mesmo assim/).check();
  await box.getByRole('button', { name: 'Salvar' }).click();
  await owner.getByRole('heading', { name: /Carla F\. Duplicada/ }).waitFor();
  ids.duplicate = owner.url().split('/').pop();
  assert.equal((await apiAs(owner, 'GET', CARLA_SEARCH)).data.items.length, 2, 'duplicado só por escolha explícita');
});

await step('CRM: regras de etapa da Base, ganho e automações', async () => {
  allow(/\/api\/crm\/opportunities\/[^/]+\/move$/, 422, 'POST');
  await open(owner, `#/crm/oportunidades/${ids.opportunity}`);
  const stages = owner.getByRole('group', { name: 'Etapa' });
  const current = async () => (await apiAs(owner, 'GET', `/api/crm/opportunities/${ids.opportunity}`)).data.opportunity;
  const start = await current();
  const openStages = stagesOf('open');
  let ruleChecked = false;
  for (const stage of openStages.slice(openStages.findIndex(item => item.id === start.stageId) + 1)) {
    const missing = missingFor(await current(), stage);
    await stages.getByRole('button', { name: stage.name, exact: true }).click();
    if (missing.length) {
      const box = dialog(owner, `Mover para ${stage.name}`);
      if (!ruleChecked) {
        // A regra da Base vale no servidor: mover sem o que a etapa exige é recusado com a lista do que falta.
        await box.getByRole('button', { name: 'Mover' }).click();
        await box.getByRole('alert').filter({ hasText: /preencha/i }).waitFor();
        ruleChecked = true;
      }
      await fillStageRequirements(box, missing);
      await box.getByRole('button', { name: 'Mover' }).click();
    }
    await toast(owner, `Movida para ${stage.name}.`);
    for (const title of taskTitles(automationsOn('stage_entered', item => item.when.pipeline === pipeline().id && item.when.stage === stage.id), start.title)) await owner.getByRole('link', { name: title }).waitFor();
  }
  const won = stagesOf('won')[0];
  await stages.getByRole('button', { name: won.name, exact: true }).click();
  const wonMissing = missingFor(await current(), won);
  if (wonMissing.length) { const box = dialog(owner, `Mover para ${won.name}`); await fillStageRequirements(box, wonMissing); await box.getByRole('button', { name: 'Mover' }).click(); }
  await toast(owner, `Movida para ${won.name}.`);
  await owner.getByRole('heading', { name: new RegExp(`${escapeRe(won.name)} · Ganha`) }).waitFor();
  for (const title of taskTitles(automationsOn('deal_won'), start.title)) await owner.getByRole('link', { name: title }).waitFor();
  const detail = await current();
  assert.equal(detail.status, 'won');
  for (const tag of tagsFrom(automationsOn('deal_won'))) assert.ok(detail.tags.includes(tag), `automação aplicou a etiqueta ${tag}`);
  if (!ruleChecked) console.log('    (o funil padrão desta instância não exige campos para mudar de etapa)');
  await shot(owner, '12-crm-oportunidade-ganha');
});

await step('CRM: nota, reunião, tarefa ligada, anexos (link, Base, recusa de token) e campos personalizados', async () => {
  allow(/\/api\/crm\/opportunities\/[^/]+\/attachments$/, 400, 'POST');
  await open(owner, `#/crm/oportunidades/${ids.opportunity}`);
  await owner.getByLabel('Tipo de registro').selectOption('meeting');
  await owner.getByLabel('Registro', { exact: true }).fill('Reunião fictícia de alinhamento.');
  await owner.getByRole('button', { name: 'Registrar' }).click();
  await toast(owner, 'Registrado no histórico.');
  await owner.getByText('Reunião fictícia de alinhamento.').waitFor();
  await owner.getByLabel('Nova tarefa').fill('Enviar contrato fictício');
  await owner.getByRole('button', { name: 'Adicionar' }).click();
  await toast(owner, 'Tarefa criada.');
  const attach = async (kind, ref, label) => {
    await owner.getByRole('button', { name: 'Anexar' }).click();
    const box = dialog(owner, 'Anexar');
    await box.getByLabel('Tipo').selectOption(kind);
    await box.locator('.field').nth(1).locator('input').fill(ref);
    if (label) await box.getByLabel('Nome (opcional)').fill(label);
    await box.getByRole('button', { name: 'Anexar' }).click();
    return box;
  };
  const refused = await attach('url', 'https://exemplo.test/arquivo?token=abcdef123456', 'Com token');
  await refused.getByRole('alert').waitFor();
  await refused.getByRole('button', { name: 'Cancelar' }).click();
  await attach('url', 'https://exemplo.test/proposta-ficticia.pdf', 'Proposta fictícia');
  await toast(owner, 'Anexo adicionado.');
  await attach('base-file', ctx.documents[0].path, 'Documento da Base');
  await owner.getByRole('link', { name: 'Documento da Base' }).waitFor();
  const labels = ctx.crm.labels;
  await owner.getByRole('button', { name: 'Editar' }).click();
  const edit = dialog(owner, `Editar ${labels.opportunity.toLowerCase()}`);
  const customField = ctx.crm.config.customFields.find(field => field.entity === 'opportunity' && ['select', 'text'].includes(field.type));
  const shown = customField ? await fillCustom(edit, customField) : null;
  await edit.getByLabel('Etiquetas').fill('cliente, vip');
  await edit.getByRole('button', { name: 'Salvar' }).click();
  await toast(owner, `${labels.opportunity} atualizada.`);
  if (shown) await owner.locator('dl.facts').getByText(shown, { exact: true }).first().waitFor();
  const timeline = await owner.locator('ol.timeline').innerText();
  for (const expected of ['Criado', 'Etapa', 'Ganha', 'Reunião', 'Anexo', 'Tarefa']) assert.ok(timeline.includes(expected), `histórico sem "${expected}"`);
  await shot(owner, '13-crm-historico');
});

await step('CRM: oportunidade nova no funil, filtros e perda com motivo obrigatório', async () => {
  const labels = ctx.crm.labels;
  const title = 'Site institucional — Oficina Fictícia';
  const [first] = stagesOf('open');
  const lost = stagesOf('lost')[0];
  const reason = ctx.crm.config.lostReasons[0];
  await open(owner, `#/crm`);
  await owner.getByRole('button', { name: labels.opportunity, exact: true }).click();
  const box = dialog(owner, `Nova ${labels.opportunity.toLowerCase()}`);
  await box.getByLabel('Título').fill(title);
  await box.getByLabel(valueLabel()).fill('8000');
  await fillRequiredCustom(box, 'opportunity');
  await box.getByRole('button', { name: 'Salvar' }).click();
  await owner.getByRole('region', { name: first.name, exact: true }).getByRole('link', { name: title }).waitFor();
  await owner.getByLabel('Buscar').fill('Oficina');
  await owner.getByLabel('Buscar').press('Enter');
  await settle(owner);
  assert.equal(await owner.locator('.board .item-card').count(), 1, 'busca filtra o funil');
  await owner.getByLabel('Buscar').fill('');
  await owner.getByLabel('Buscar').press('Enter');
  await owner.getByLabel('Origem').selectOption({ label: sourceForTests().label });
  // Filtro de origem: a oportunidade sem origem sai do funil; a do lead convertido (com origem) fica.
  await owner.locator('.board').getByText(title).waitFor({ state: 'detached', timeout: 10_000 });
  await owner.locator('.board').getByText('Padaria Fictícia').first().waitFor();
  await owner.getByLabel('Origem').selectOption('');
  await owner.getByLabel(`Mover ${title}`).selectOption({ label: lost.name });
  const dialogLost = dialog(owner, 'Registrar perda');
  assert.ok(await dialogLost.getByRole('button', { name: 'Registrar perda' }).isDisabled(), 'perda exige motivo');
  await dialogLost.getByLabel('Motivo').selectOption(reason);
  await dialogLost.getByRole('button', { name: 'Registrar perda' }).click();
  await owner.getByRole('region', { name: lost.name, exact: true }).getByRole('link', { name: title }).waitFor();
  const tasks = (await apiAs(owner, 'GET', '/api/tasks')).data.tasks.map(task => task.title);
  for (const expected of taskTitles(automationsOn('deal_lost'), title)) assert.ok(tasks.includes(expected), `automação de perda sem a tarefa "${expected}"`);
  await shot(owner, '14-crm-funil');
});

await step('CRM: resultados do período com proveniência', async () => {
  await open(owner, `#/crm/resultados`);
  await owner.getByText('Taxa de ganho').waitFor();
  // textContent: os selos de proveniência usam maiúsculas por CSS (innerText devolveria o texto transformado).
  const text = (await owner.locator('main').textContent()) ?? '';
  // A tela mostra o mesmo cálculo do servidor (vale também para instâncias que já têm negócios reais).
  // Mesmo período padrão da tela (últimos 30 dias, datas locais do navegador).
  const period = await owner.evaluate(() => {
    const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return { from: iso(start), to: iso(new Date()) };
  });
  const summary = (await apiAs(owner, 'GET', `/api/crm/summary?from=${period.from}&to=${period.to}`)).data;
  assert.ok(summary.won.count >= 1 && summary.lost.count >= 1, 'ganho e perda do teste no período');
  assert.ok(new RegExp(`${Math.round(summary.calculated.winRate * 100)}\\s?%`).test(text), `taxa de ganho ${summary.calculated.winRate}`);
  assert.ok(text.includes(ctx.crm.config.lostReasons[0]), 'motivo de perda no relatório');
  assert.ok(text.includes('Calculado pela Workfoli') && text.includes('Do CRM'), 'proveniência marcada');
  await shot(owner, '15-crm-resultados');
});

await step('CRM: configuração na Base (funil novo, etapa reordenada, campo, origem, motivo) e erro de validação', async () => {
  allow(/\/api\/crm\/config$/, 400, 'PUT');
  await open(owner, `#/crm/configuracao`);
  await owner.getByRole('button', { name: 'Funil', exact: true }).click();
  const pipelineNames = owner.getByLabel('Nome do funil');
  await pipelineNames.last().fill('Parcerias');
  const block = owner.locator('.config-block').filter({ has: owner.locator('input[aria-label="Nome do funil"]') }).last();
  await block.getByRole('button', { name: 'Etapa', exact: true }).click();
  const stageNames = block.getByLabel('Nome da etapa');
  await stageNames.nth(1).fill('Primeira conversa');
  await block.locator('.config-stage').nth(2).getByRole('button', { name: 'Subir' }).click();
  // Validação do contrato: etapa sem nome é recusada e o erro aparece com o caminho.
  await stageNames.nth(1).fill('');
  await owner.getByRole('button', { name: 'Salvar na Base' }).click();
  await owner.getByRole('alert').first().waitFor();
  await stageNames.nth(1).fill('Novo');
  const fieldsCard = owner.locator('section.card').filter({ has: owner.getByRole('heading', { name: 'Campos personalizados' }) });
  await fieldsCard.getByRole('button', { name: 'Campo', exact: true }).click();
  await fieldsCard.locator('.config-block').last().getByLabel('Nome').fill('Indicação');
  const sourcesCard = owner.locator('section.card').filter({ has: owner.getByRole('heading', { name: 'Origens' }) });
  await sourcesCard.getByRole('button', { name: 'Origem', exact: true }).click();
  await sourcesCard.getByLabel('Nome da origem').last().fill('Indicação de cliente');
  await owner.getByLabel('Novo motivo de perda').fill('Momento inadequado');
  await owner.locator('section.card').filter({ has: owner.getByRole('heading', { name: 'Motivos de perda' }) }).getByRole('button', { name: 'Adicionar' }).click();
  await owner.getByRole('button', { name: 'Salvar na Base' }).click();
  await toast(owner, 'Configuração salva na Base.');
  const crm = readManifest().crm;
  const parcerias = crm.pipelines.find(item => item.name === 'Parcerias');
  assert.ok(parcerias, 'funil novo no manifesto');
  assert.deepEqual(parcerias.stages.map(stage => stage.name), ['Primeira conversa', 'Novo', 'Ganho', 'Perdido'], 'etapa criada e reordenada');
  assert.ok(crm.customFields.some(field => field.label === 'Indicação'), 'campo personalizado no manifesto');
  assert.ok(crm.sources.some(source => source.label === 'Indicação de cliente'), 'origem no manifesto');
  assert.ok(crm.lostReasons.includes('Momento inadequado'), 'motivo de perda no manifesto');
  const validate = cli(['base', 'validate', path.join(clone, 'base')]);
  assert.equal(validate.code, 0, validate.out);
  await open(owner, `#/crm`);
  await owner.getByLabel('Funil', { exact: true }).selectOption({ label: 'Parcerias' });
  await owner.getByRole('region', { name: 'Primeira conversa' }).waitFor();
  await shot(owner, '16-crm-configuracao-funil-novo');
});

await step('CRM: lead com origem nova, descarte com motivo e reativação', async () => {
  const labels = ctx.crm.labels;
  await open(owner, `#/crm`);
  await owner.getByRole('button', { name: labels.lead, exact: true }).click();
  const box = dialog(owner, `Novo ${labels.lead.toLowerCase()}`);
  await box.getByLabel('Nome', { exact: true }).fill('Lead Descartável Fictício');
  await box.getByLabel('Origem').selectOption({ label: 'Indicação de cliente' });
  await fillRequiredCustom(box, 'lead');
  await box.getByRole('button', { name: 'Salvar' }).click();
  await owner.getByRole('heading', { name: /Lead Descartável Fictício/ }).waitFor();
  await owner.getByRole('button', { name: 'Descartar' }).click();
  const discard = dialog(owner, 'Descartar lead');
  await discard.getByLabel('Motivo').fill('Fora do perfil (fictício)');
  await discard.getByRole('button', { name: 'Descartar' }).click();
  await owner.getByRole('heading', { name: /Descartado/ }).waitFor();
  await owner.getByRole('button', { name: 'Reativar' }).click();
  // Reativado volta para a fila de atendimento (não como lead novo), sem o motivo do descarte.
  await owner.getByRole('heading', { name: /Em atendimento/ }).waitFor();
  await open(owner, `#/crm/leads`);
  await owner.getByLabel('Origem').selectOption({ label: 'Indicação de cliente' });
  await owner.getByRole('link', { name: 'Lead Descartável Fictício' }).waitFor();
});

await step('CRM: texto malicioso é exibido como texto (sem XSS)', async () => {
  const name = '<img src=x onerror="document.title=\'XSS\'">Lead XSS';
  await apiAs(owner, 'POST', '/api/crm/leads', { name, sourceId: 'manual' }, 200);
  await open(owner, `#/crm/leads`);
  await owner.getByText(name).first().waitFor();
  assert.notEqual(await owner.title(), 'XSS');
  assert.equal(await owner.locator('main img[src="x"]').count(), 0);
});

await step('CRM: arquivar/restaurar e exclusão definitiva (LGPD) com confirmação digitada', async () => {
  await open(owner, `#/crm/contatos/${ids.duplicate}`);
  await owner.getByRole('button', { name: 'Arquivar' }).click();
  await toast(owner, 'Arquivado (nada foi apagado).');
  await owner.getByRole('button', { name: 'Restaurar' }).click();
  await toast(owner, 'Restaurado.');
  await owner.getByRole('button', { name: 'Excluir' }).click();
  const purge = dialog(owner, 'Excluir definitivamente');
  assert.ok(await purge.getByRole('button', { name: 'Excluir definitivamente' }).isDisabled(), 'exige digitar EXCLUIR');
  await purge.getByLabel('Digite EXCLUIR para confirmar').fill('EXCLUIR');
  await purge.getByRole('button', { name: 'Excluir definitivamente' }).click();
  await toast(owner, 'Excluído definitivamente.');
  assert.equal((await apiAs(owner, 'GET', CARLA_SEARCH)).data.items.length, 1);
  const audit = JSON.stringify((await apiAs(owner, 'GET', '/api/audit?prefix=crm.purged')).data.entries);
  assert.ok(audit.includes('crm.purged') && !/Carla|carla@/.test(audit), 'auditoria sem dados pessoais');
});

await step('arquivos: Base (prévia), privado (upload, download íntegro, exclusão) e anexo privado no CRM', async () => {
  await open(owner, `#/files`);
  const document = ctx.documents[0].path;
  const name = document.split('/').pop();
  await owner.getByLabel('Filtrar arquivos').fill(document);
  await owner.locator('main table').getByText(name, { exact: true }).first().click();
  const preview = dialog(owner, name);
  await preview.locator('.dialog-body').waitFor();
  assert.ok((await preview.locator('.dialog-body').innerText()).trim().length > 0, 'prévia do documento da Base');
  await owner.keyboard.press('Escape');
  await preview.waitFor({ state: 'hidden' });
  await owner.getByRole('tab', { name: /Privados/ }).click();
  const content = 'Contrato fictício — validação E2E. Nenhum dado real.';
  await owner.setInputFiles('#upload', { name: 'contrato-ficticio.txt', mimeType: 'text/plain', buffer: Buffer.from(content) });
  await toast(owner, 'Arquivo guardado na área privada.');
  const [download] = await Promise.all([owner.waitForEvent('download'), owner.getByLabel('Baixar contrato-ficticio.txt').click()]);
  const saved = path.join(temp, 'download.txt');
  await download.saveAs(saved);
  assert.equal(fs.readFileSync(saved, 'utf8'), content, 'download íntegro');
  const privateId = (await apiAs(owner, 'GET', '/api/files')).data.private.find(file => file.name === 'contrato-ficticio.txt').id;
  await apiAs(owner, 'POST', `/api/crm/contacts/${ids.contact}/attachments`, { kind: 'private-file', ref: privateId, label: 'Contrato' }, 200);
  await open(owner, `#/crm/contatos/${ids.contact}`);
  await owner.getByRole('link', { name: 'Contrato' }).waitFor();
  await open(owner, `#/files`);
  await owner.getByRole('tab', { name: /Privados/ }).click();
  await owner.getByRole('button', { name: 'Excluir contrato-ficticio.txt' }).click();
  await dialog(owner, 'Excluir arquivo privado?').getByRole('button', { name: 'Excluir arquivo' }).click();
  await toast(owner, 'Arquivo excluído.');
  assert.equal(fs.readdirSync(path.join(clone, 'files', 'private')).length, 0, 'arquivo removido do disco');
});

await step('IA: proposta confirmada executa; proposta recusada não executa', async () => {
  await open(owner, `#/ai`);
  await owner.getByLabel('Mensagem para a IA').fill('Crie uma tarefa para revisar a proposta fictícia até sexta');
  await owner.keyboard.press('Enter');
  await owner.getByRole('button', { name: 'Confirmar' }).first().waitFor();
  await shot(owner, '20-ia-proposta');
  await owner.getByRole('button', { name: 'Confirmar' }).first().click();
  await owner.getByText('Executada').first().waitFor();
  await owner.getByLabel('Mensagem para a IA').fill('Cadastre Joana Recusada como nova cliente, joana.recusada@exemplo.test');
  await owner.keyboard.press('Enter');
  await owner.getByRole('button', { name: 'Recusar' }).first().waitFor();
  await owner.getByRole('button', { name: 'Recusar' }).first().click();
  await owner.getByText('Recusada').first().waitFor();
  assert.equal((await apiAs(owner, 'GET', '/api/crm/contacts?q=Joana%20Recusada')).data.items.length, 0, 'recusa não executa');
  const tasks = (await apiAs(owner, 'GET', '/api/tasks')).data.tasks;
  assert.ok(tasks.some(task => /revisar a proposta fictícia/i.test(task.title) && task.source === 'ai'));
});

// Integrações (provedores falsos locais).
const card = (page, name) => page.locator('section.card').filter({ has: page.locator('h2', { hasText: new RegExp(`^${name}$`) }) });
async function oauth(page, provider, label) {
  await open(page, `#/integrations`);
  const target = card(page, label);
  await target.getByRole('button', { name: /^(Conectar|Reconectar)$/ }).first().click();
  await dialog(page, `Conectar ${label}`).getByRole('button', { name: new RegExp(`Continuar no ${label}`) }).click();
  await page.waitForURL(/\/api\/integrations\/oauth\/callback/);
  const html = await page.locator('main').innerText();
  await shot(page, `30-oauth-${provider}-retorno`);
  await page.waitForURL(/#\/integrations/, { timeout: 15_000 });
  return html;
}

await step('integrações: estados iniciais (credenciais do app pela CLI, planejadas da Base)', async () => {
  await open(owner, `#/integrations`);
  for (const label of ['Google', 'Meta', 'GitHub', 'Vercel', 'Cloudflare', 'Supabase']) await card(owner, label).getByText('Pronta para conectar').waitFor();
  // O que a Base declara continua visível (no cartão do conector ou em "Planejadas na Base").
  if (manifest0.integrations.length) await owner.locator('main').getByText(/Planejad[oa]s? na Base/).first().waitFor();
  await shot(owner, '31-integracoes-inicial');
});

await step('Google: OAuth simulado com PKCE, contas escolhidas, sincronização e marketing com proveniência', async () => {
  const html = await oauth(owner, 'google', 'Google');
  assert.match(html, /Conexão concluída/);
  await owner.getByText('Conta conectada.').waitFor();
  const google = card(owner, 'Google');
  await google.getByText('marketing@exemplo.test').waitFor();
  await google.getByRole('button', { name: 'Gerenciar' }).click();
  const manage = dialog(owner, 'Contas do Google');
  for (const label of ['Conta do Google Ads', 'Propriedade do Google Analytics 4', 'Site no Search Console']) {
    await manage.getByLabel(label).locator('option').nth(1).waitFor({ state: 'attached' });
    await manage.getByLabel(label).selectOption({ index: 1 });
  }
  await manage.getByRole('button', { name: 'Salvar' }).click();
  await toast(owner, 'Contas salvas.');
  await google.getByRole('button', { name: 'Sincronizar' }).click();
  const report = dialog(owner, 'Sincronização — Google');
  await report.waitFor();
  assert.equal(await report.getByText('Erro', { exact: true }).count(), 0, await report.innerText());
  await report.locator('.dialog-foot').getByRole('button', { name: 'Fechar' }).click();
  await open(owner, `#/marketing`);
  await owner.getByText('Pesquisa - Marca').first().waitFor();
  const text = (await owner.locator('main').textContent()) ?? '';
  for (const badge of ['Dado da plataforma', 'Calculado pela Workfoli', 'Do CRM']) assert.ok(text.includes(badge), `sem "${badge}"`);
  await shot(owner, '32-marketing-google');
});

await step('Meta: leads dos formulários entram no CRM só depois de ligados na configuração', async () => {
  await open(owner, `#/crm/configuracao`);
  await owner.getByLabel(/Importar leads dos formulários da Meta/).check();
  await owner.getByRole('button', { name: 'Salvar na Base' }).click();
  await toast(owner, 'Configuração salva na Base.');
  assert.ok(readManifest().crm.integrations.some(item => item.provider === 'meta' && item.leads), 'vínculo Meta → CRM no manifesto');
  const html = await oauth(owner, 'meta', 'Meta');
  assert.match(html, /Conexão concluída/);
  const meta = card(owner, 'Meta');
  await meta.getByRole('button', { name: 'Gerenciar' }).click();
  const manage = dialog(owner, 'Contas do Meta');
  await manage.getByLabel('Conta de anúncios').locator('option').nth(1).waitFor({ state: 'attached' });
  await manage.getByLabel('Conta de anúncios').selectOption({ index: 1 });
  await manage.getByRole('button', { name: 'Página Sintética' }).click();
  await manage.getByRole('button', { name: 'Salvar' }).click();
  await toast(owner, 'Contas salvas.');
  await meta.getByRole('button', { name: 'Sincronizar' }).click();
  const report = dialog(owner, 'Sincronização — Meta');
  await report.waitFor();
  assert.equal(await report.getByText('Erro', { exact: true }).count(), 0, await report.innerText());
  await report.locator('.dialog-foot').getByRole('button', { name: 'Fechar' }).click();
  await open(owner, `#/crm/leads`);
  await owner.getByRole('link', { name: 'Joana Prado' }).waitFor();
  await owner.getByRole('link', { name: 'Pedro Sá' }).waitFor();
  await shot(owner, '33-crm-leads-meta');
});

await step('GitHub: erro do provedor mostrado sem gravar nada; depois conexão concluída', async () => {
  fake.state.githubTokenError = true;
  const failed = await oauth(owner, 'github', 'GitHub');
  assert.match(failed, /Conexão não concluída/);
  await owner.getByText('A conexão não foi concluída.', { exact: false }).waitFor();
  await card(owner, 'GitHub').getByText('Pronta para conectar').waitFor();
  fake.state.githubTokenError = false;
  const done = await oauth(owner, 'github', 'GitHub');
  assert.match(done, /GitHub conectado \(empresa-sintetica\)/);
  await card(owner, 'GitHub').getByText('empresa-sintetica').waitFor();
});

await step('Vercel, Cloudflare e Supabase: token verificado no provedor, erros claros, nunca devolvido', async () => {
  allow(/\/api\/integrations\/vercel\/token$/, 502, 'POST');
  allow(/\/api\/integrations\/cloudflare\/token$/, 400, 'POST');
  const connect = async (label, button, tokenLabel, token) => {
    await open(owner, `#/integrations`);
    await card(owner, label).getByRole('button', { name: button }).click();
    const box = dialog(owner, `Conectar ${label}`);
    await box.getByLabel(tokenLabel).fill(token);
    await box.getByRole('button', { name: 'Verificar e conectar' }).click();
    return box;
  };
  const wrong = await connect('Vercel', 'Conectar', 'Token de acesso da Vercel', 'vercel-token-errado-000');
  await wrong.getByRole('alert').filter({ hasText: /Vercel respondeu com erro \(403\)/ }).waitFor();
  await wrong.getByLabel('Token de acesso da Vercel').fill('vercel-token-valido-123');
  await wrong.getByRole('button', { name: 'Verificar e conectar' }).click();
  await toast(owner, 'Vercel conectado.');
  const inactive = await connect('Cloudflare', 'Conectar', 'Token de API da Cloudflare', 'cloudflare-token-inativo');
  await inactive.getByRole('alert').filter({ hasText: /não está ativo/ }).waitFor();
  await inactive.getByLabel('Token de API da Cloudflare').fill('cloudflare-token-ativo');
  await inactive.getByRole('button', { name: 'Verificar e conectar' }).click();
  await toast(owner, 'Cloudflare conectado.');
  await connect('Supabase', 'Configurar', 'Token de acesso pessoal do Supabase', 'sbp-token-sintetico-valido');
  await toast(owner, 'Supabase conectado.');
  await card(owner, 'Supabase').getByText('2 projetos').waitFor();
  await shot(owner, '34-integracoes-conectadas');
});

await step('Google: renovação automática do token, autorização revogada vira "reconectar", reconexão e desconexão com revogação', async () => {
  allow(/\/api\/integrations\/google\/sync$/, 409, 'POST');
  const expire = () => { const row = liveConnection(server.runtime.db, 'google'); writeBundle(server.runtime, row, { ...readBundle(server.runtime, row), expiresAt: new Date(Date.now() - 1000).toISOString() }); };
  expire();
  await open(owner, `#/integrations`);
  await card(owner, 'Google').getByRole('button', { name: 'Sincronizar' }).click();
  await dialog(owner, 'Sincronização — Google').locator('.dialog-foot').getByRole('button', { name: 'Fechar' }).click();
  assert.equal(fake.state.googleAccess, 'google-access-2', 'token renovado pelo refresh token');
  fake.state.refreshValid = false;
  expire();
  await card(owner, 'Google').getByRole('button', { name: 'Sincronizar' }).click();
  await owner.getByRole('alert').filter({ hasText: /Reconecte/ }).waitFor();
  await card(owner, 'Google').getByText('Autorização vencida').waitFor();
  fake.state.refreshValid = true;
  const again = await oauth(owner, 'google', 'Google');
  assert.match(again, /Conexão concluída/);
  await card(owner, 'Google').getByText('Conectada', { exact: true }).waitFor();
  await card(owner, 'Google').getByRole('button', { name: 'Desconectar' }).click();
  await dialog(owner, 'Desconectar Google?').getByRole('button', { name: 'Desconectar' }).click();
  await card(owner, 'Google').getByText('Pronta para conectar').waitFor();
  assert.ok(fake.revoked.some(item => item.startsWith('google:')), 'revogado no provedor');
});

await step('tokens: ausentes das respostas ao navegador, do banco em claro, da auditoria e do log do servidor', async () => {
  await Promise.allSettled([...reads]);
  assert.deepEqual(leaks, [], `tokens vistos pelo navegador: ${leaks.join(' | ')}`);
  const tokensTable = JSON.stringify(server.runtime.db.prepare('SELECT * FROM integration_tokens').all());
  const auditTable = JSON.stringify(server.runtime.db.prepare('SELECT * FROM audit').all());
  for (const secret of SECRETS) {
    assert.ok(!tokensTable.includes(secret), `${secret} em claro no cofre`);
    assert.ok(!auditTable.includes(secret), `${secret} na auditoria`);
    assert.ok(!serverErrors.join('\n').includes(secret), `${secret} no log do servidor`);
  }
  const dbBytes = fs.readFileSync(path.join(clone, 'data', 'hub.sqlite')).toString('latin1');
  for (const secret of ['google-access', 'google-refresh', 'meta-long', 'github-access-1', 'vercel-token-valido', 'sbp-token-sintetico']) assert.ok(!dbBytes.includes(secret), `${secret} no arquivo do banco`);
  const journal = path.join(clone, 'data');
  for (const file of fs.readdirSync(journal).filter(name => /\.(?:jsonl?|log)$/.test(name))) {
    const text = fs.readFileSync(path.join(journal, file), 'utf8');
    for (const secret of SECRETS) assert.ok(!text.includes(secret), `${secret} em data/${file}`);
  }
});

// Permissões com usuários diferentes.
const pages = {};
await step('usuários: papel personalizado e convites (Equipe, Leitura, Gestor Workfoli, personalizado)', async () => {
  await open(owner, `#/users`);
  await owner.getByRole('button', { name: 'Novo papel' }).click();
  const role = dialog(owner, 'Novo papel');
  await role.getByLabel('Nome do papel').fill('Atendimento Fictício');
  await role.getByLabel('CRM: write').check();
  await role.getByLabel('Tarefas: write').check();
  await role.getByLabel('IA').selectOption('use');
  await role.getByRole('button', { name: 'Salvar papel' }).click();
  await owner.getByText('Atendimento Fictício').first().waitFor();
  for (const key of ['member', 'viewer', 'manager', 'custom']) {
    const user = users[key];
    await owner.getByRole('button', { name: 'Convidar' }).click();
    const invite = dialog(owner, 'Convidar pessoa');
    await invite.getByLabel('Nome').fill(user.name);
    await invite.getByLabel('Papel').selectOption({ label: user.role });
    await invite.getByRole('button', { name: 'Gerar convite' }).click();
    const linkBox = dialog(owner, `Link de ativação — ${user.name}`);
    const link = await linkBox.getByLabel('Link de ativação').inputValue();
    await linkBox.getByRole('button', { name: 'Concluir' }).click();
    const page = await newPage(key);
    await activate(page, link, user);
    pages[key] = page;
  }
  current = owner;
  await shot(owner, '40-usuarios');
});

await step('Equipe: opera o CRM, sem administração nem exclusão definitiva (servidor confirma)', async () => {
  const page = pages.member; current = page;
  const menu = await nav(page).innerText();
  for (const hidden of ['Usuários', 'Configurações']) assert.ok(!menu.includes(hidden), `menu mostra ${hidden}`);
  await open(page, `#/users`);
  await page.getByText('Sem acesso a esta área').waitFor();
  await open(page, `#/crm/configuracao`);
  await page.getByText('Sem acesso a esta área').waitFor();
  assert.equal(await page.getByRole('tab', { name: 'Configuração' }).count(), 0);
  await open(page, `#/crm/contatos/${ids.contact}`);
  await page.getByRole('heading', { name: /Carla Fictícia/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Excluir' }).count(), 0, 'sem exclusão definitiva');
  await apiAs(page, 'DELETE', `/api/crm/contacts/${ids.contact}`, { confirm: 'EXCLUIR' }, 403);
  await apiAs(page, 'GET', '/api/users', undefined, 403);
  await apiAs(page, 'PUT', '/api/crm/config', { crm: {} }, 403);
  await apiAs(page, 'POST', '/api/crm/leads', { name: 'Lead da Equipe Fictícia', sourceId: 'manual' }, 200);
});

await step('Leitura: só consulta; botões de escrita ausentes e servidor recusa escrita', async () => {
  const page = pages.viewer; current = page;
  const menu = await nav(page).innerText();
  for (const hidden of ['IA', 'Integrações', 'Usuários', 'Configurações', 'Marketing']) assert.ok(!menu.split('\n').includes(hidden), `menu mostra ${hidden}`);
  await open(page, `#/crm`);
  await page.getByRole('tab', { name: 'Funil' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Lead', exact: true }).count(), 0);
  assert.equal(await page.locator('select.move').count(), 0, 'sem mover no funil');
  await open(page, `#/ai`);
  await page.getByText('Sem acesso a esta área').waitFor();
  await apiAs(page, 'POST', '/api/crm/leads', { name: 'Não deveria entrar' }, 403);
  await apiAs(page, 'POST', '/api/tasks', { title: 'Não deveria entrar' }, 403);
  await apiAs(page, 'GET', '/api/integrations', undefined, 403);
});

await step('Gestor Workfoli: configura CRM e integrações, sem usuários', async () => {
  const page = pages.manager; current = page;
  const menu = await nav(page).innerText();
  assert.ok(menu.includes('Integrações') && menu.includes('Configurações') && !menu.includes('Usuários'), menu);
  await open(page, `#/crm/configuracao`);
  await page.getByRole('button', { name: 'Salvar na Base' }).waitFor();
  await open(page, `#/integrations`);
  await card(page, 'Meta').getByRole('button', { name: 'Sincronizar' }).waitFor();
  await open(page, `#/users`);
  await page.getByText('Sem acesso a esta área').waitFor();
  await apiAs(page, 'GET', '/api/users', undefined, 403);
  await apiAs(page, 'POST', '/api/settings/roles/apply', {}, 403);
});

await step('papel personalizado: IA consulta, mas não propõe ações sem "executar ações"', async () => {
  const page = pages.custom; current = page;
  await open(page, `#/ai`);
  await page.getByText('Seu acesso permite consultas.', { exact: false }).waitFor();
  await page.getByLabel('Mensagem para a IA').fill('Crie uma tarefa para revisar o site até sexta');
  await page.keyboard.press('Enter');
  await page.locator('.msg.assistant').last().waitFor();
  await settle(page);
  assert.equal(await page.getByRole('button', { name: 'Confirmar' }).count(), 0, 'nenhuma proposta executável');
  assert.ok(/não permite/i.test(await page.locator('.msg.assistant').last().innerText()));
});

await step('desativar usuário encerra a sessão dele na hora', async () => {
  current = owner;
  await open(owner, `#/users`);
  await owner.locator('tr', { hasText: users.member.name }).getByRole('button', { name: 'Desativar' }).click();
  await toast(owner, 'Usuário atualizado.');
  allow(/\/api\/.+/, 401, 'GET');
  const page = pages.member; current = page;
  await open(page, `#/crm`);
  await page.getByRole('heading', { name: 'Entrar' }).waitFor();
  allowed.pop();
  current = owner;
});

await step('configurações: instância, credenciais só por nome, código de pareamento do Local Agent', async () => {
  await open(owner, `#/settings`);
  await owner.getByText('GOOGLE_OAUTH_CLIENT_ID').waitFor();
  assert.ok(!(await owner.locator('main').innerText()).includes('google-secret'));
  await owner.getByRole('button', { name: 'Gerar código de pareamento' }).click();
  assert.match(await owner.getByLabel('Comando de pareamento').inputValue(), /agent pair .* --code \S{40,}/);
  await shot(owner, '50-configuracoes');
});

await step('histórico (auditoria) navegável', async () => {
  await open(owner, `#/history`);
  await owner.locator('main').getByText(/IA|CRM|Integra/).first().waitFor();
  await shot(owner, '51-historico');
});

// Aparência, acessibilidade e tamanhos.
const contrastAudit = page => page.evaluate(() => {
  // Cores calculadas chegam como rgb()/rgba() ou, quando vêm de color-mix(), como color(srgb r g b / a) em 0–1.
  const parse = value => {
    const rgb = /rgba?\(([^)]+)\)/.exec(value);
    if (rgb) { const [r, g, b, a = 1] = rgb[1].split(',').map(Number); return { r, g, b, a }; }
    const srgb = /color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+))?\)/.exec(value);
    if (srgb) return { r: Number(srgb[1]) * 255, g: Number(srgb[2]) * 255, b: Number(srgb[3]) * 255, a: srgb[4] === undefined ? 1 : Number(srgb[4]) };
    return { unknown: value };
  };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const background = element => { for (let node = element; node; node = node.parentElement) { const color = parse(getComputedStyle(node).backgroundColor); if (color.unknown || color.a > 0.9) return color; } return parse(getComputedStyle(document.body).backgroundColor); };
  const issues = new Map();
  let measured = 0;
  for (const element of document.querySelectorAll('main *, aside *')) {
    if (!element.childNodes.length || ![...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none' || element.closest('[aria-hidden="true"]') || element.closest('button:disabled')) continue;
    const fg = parse(style.color); const bg = background(element);
    // Formato de cor desconhecido nunca passa em silêncio: vira achado.
    if (fg.unknown || bg.unknown) { issues.set(`cor não medida: ${fg.unknown ?? bg.unknown}`, element.tagName); continue; }
    measured++;
    const blended = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
    const [light, dark] = [lum(blended), lum(bg)].sort((a, b) => b - a);
    const ratio = (light + 0.05) / (dark + 0.05);
    const size = parseFloat(style.fontSize); const bold = Number(style.fontWeight) >= 700;
    const needed = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio < needed) issues.set(`${style.color} sobre ${`rgb(${bg.r}, ${bg.g}, ${bg.b})`} (${size}px)`, `${ratio.toFixed(2)} < ${needed} — "${element.textContent.trim().slice(0, 30)}"`);
  }
  return { measured, issues: [...issues.entries()].map(([key, value]) => `${key}: ${value}`) };
});
const a11yAudit = page => page.evaluate(() => {
  const issues = [];
  const nameOf = element => (element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').trim();
  for (const element of document.querySelectorAll('button, a[href], [role="tab"], [role="button"]')) if (!nameOf(element)) issues.push(`sem nome acessível: ${element.outerHTML.slice(0, 90)}`);
  for (const element of document.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
    if (!(element.labels?.length || element.getAttribute('aria-label') || element.getAttribute('aria-labelledby'))) issues.push(`campo sem rótulo: ${element.outerHTML.slice(0, 90)}`);
  }
  for (const image of document.querySelectorAll('img')) if (!image.hasAttribute('alt')) issues.push(`imagem sem alt: ${image.outerHTML.slice(0, 90)}`);
  if (!document.documentElement.lang) issues.push('html sem lang');
  return issues;
});
const auditedRoutes = ['#/', '#/crm', `#/crm/oportunidades/${ids.opportunity}`, '#/crm/resultados', '#/marketing', '#/integrations', '#/users', '#/settings', '#/files', '#/tasks', '#/ai'];
const findings = { a11y: new Set(), contrast: { dark: new Set(), light: new Set() } };

await step('acessibilidade básica: nomes, rótulos, alt e idioma em todas as telas principais', async () => {
  for (const route of auditedRoutes) {
    await open(owner, route);
    await settle(owner);
    for (const issue of await a11yAudit(owner)) findings.a11y.add(`${route}: ${issue}`);
  }
  assert.deepEqual([...findings.a11y], []);
});

await step('tema escuro e claro: paleta oficial, Manrope e contraste de texto', async () => {
  for (const theme of ['dark', 'light']) {
    await owner.evaluate(value => localStorage.setItem('workfoli.theme', value), theme);
    for (const route of auditedRoutes) {
      await open(owner, route);
      await settle(owner);
      const info = await owner.evaluate(() => ({ theme: document.documentElement.dataset.theme, background: getComputedStyle(document.body).backgroundColor, font: getComputedStyle(document.body).fontFamily, manrope: [...document.fonts].some(font => /Manrope/.test(font.family) && font.status === 'loaded') }));
      assert.equal(info.theme, theme);
      assert.equal(info.background, theme === 'dark' ? 'rgb(21, 23, 22)' : 'rgb(245, 245, 241)');
      assert.ok(info.manrope && /Manrope/.test(info.font), info.font);
      const contrast = await contrastAudit(owner);
      assert.ok(contrast.measured > 20, `${route}: só ${contrast.measured} textos medidos`);
      for (const issue of contrast.issues) findings.contrast[theme].add(`${route} ${issue}`);
      if (['#/', '#/crm', '#/marketing'].includes(route)) await shot(owner, `60-tema-${theme}-${slug(route.replace('#/', '') || 'visao-geral')}`);
    }
  }
  await owner.evaluate(() => localStorage.setItem('workfoli.theme', 'dark'));
  const all = [...findings.contrast.dark, ...findings.contrast.light];
  assert.deepEqual(all, [], `contraste abaixo do mínimo WCAG AA:\n${all.join('\n')}`);
});

await step('troca de tema pelo botão (escuro → claro → sistema → escuro)', async () => {
  await open(owner, `#/`);
  await owner.getByRole('button', { name: 'Tema escuro (trocar)' }).click();
  assert.equal(await owner.evaluate(() => document.documentElement.dataset.theme), 'light');
  await owner.getByRole('button', { name: 'Tema claro (trocar)' }).click();
  await owner.getByRole('button', { name: 'Tema do sistema (trocar)' }).click();
  await owner.getByRole('button', { name: 'Tema escuro (trocar)' }).waitFor();
});

await step('teclado: login só pelo teclado, foco visível, Esc fecha diálogos', async () => {
  const page = await newPage('teclado');
  await open(page, `#/`);
  await page.getByLabel('E-mail').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('type')), 'email', 'foco inicial no e-mail');
  await page.keyboard.type(users.owner.email);
  await page.keyboard.press('Tab');
  await page.keyboard.type(users.owner.password);
  const ring = await page.evaluate(() => { const style = getComputedStyle(document.activeElement); return `${style.outlineStyle} ${style.outlineWidth} ${style.boxShadow}`; });
  assert.ok(!/^none 0px none$/.test(ring), `sem indicação de foco: ${ring}`);
  await page.keyboard.press('Enter');
  await page.locator('.user-card .name', { hasText: users.owner.name }).waitFor();
  await open(page, `#/users`);
  await page.getByRole('button', { name: 'Convidar' }).focus();
  await page.keyboard.press('Enter');
  await dialog(page, 'Convidar pessoa').waitFor();
  await page.keyboard.press('Escape');
  await dialog(page, 'Convidar pessoa').waitFor({ state: 'hidden' });
  await page.context().close();
  current = owner;
});

await step('tamanhos: 1024, 768 e 390 px sem rolagem horizontal; menu móvel', async () => {
  for (const [width, height] of [[1024, 768], [768, 1024], [390, 844]]) {
    const page = await newPage(`${width}px`, { viewport: { width, height }, deviceScaleFactor: width < 500 ? 2 : 1 });
    await login(page, users.owner);
    for (const route of ['#/', '#/crm', `#/crm/oportunidades/${ids.opportunity}`, '#/marketing', '#/integrations', '#/users', '#/files']) {
      await open(page, route);
      await settle(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 1, `${width}px ${route}: ${overflow}px de rolagem horizontal`);
      if (route === '#/' || route === '#/crm') await shot(page, `70-${width}-${slug(route.replace('#/', '') || 'visao-geral')}`);
    }
    if (width <= 768) {
      await page.getByRole('button', { name: 'Abrir menu' }).click();
      await nav(page).getByRole('link', { name: ctx.crm.moduleLabel, exact: true }).click();
      await page.getByRole('tab', { name: 'Funil' }).waitFor();
    }
    await page.context().close();
  }
  current = owner;
});

await step('sessão: sair em uma aba derruba a outra; voltar não mostra dados', async () => {
  allow(/\/api\/.+/, 401, 'GET');
  const second = await owner.context().newPage();
  watch(second, 'segunda aba');
  await second.goto(`${hubUrl}/#/crm`);
  await second.getByRole('tab', { name: 'Funil' }).waitFor();
  await open(owner, '#/crm');
  await owner.getByRole('tab', { name: 'Funil' }).waitFor();
  await owner.getByRole('button', { name: 'Sair' }).click();
  await owner.getByRole('heading', { name: 'Entrar' }).waitFor();
  await second.goto(`${hubUrl}/#/crm/leads`);
  await second.getByRole('heading', { name: 'Entrar' }).waitFor();
  // Voltar no navegador para a tela do CRM não mostra dados: a sessão acabou no servidor.
  await owner.goBack();
  assert.match(owner.url(), /#\/crm$/);
  await owner.getByRole('heading', { name: 'Entrar' }).waitFor();
  assert.equal(await owner.getByRole('tab', { name: 'Funil' }).count(), 0);
  await second.close();
  allowed.pop();
});

await step('troca de senha: sessões encerradas, senha antiga recusada, nova aceita', async () => {
  allow(/\/api\/auth\/login$/, 401, 'POST');
  await login(owner, users.owner);
  await open(owner, `#/settings`);
  await owner.getByLabel('Senha atual').fill(users.owner.password);
  await owner.getByLabel('Nova senha').fill('senha-ficticia-e2e-2');
  await owner.getByRole('button', { name: 'Trocar senha' }).click();
  await owner.getByRole('heading', { name: 'Entrar' }).waitFor();
  await owner.getByLabel('E-mail').fill(users.owner.email);
  await owner.getByLabel('Senha').fill(users.owner.password);
  await owner.getByRole('button', { name: 'Entrar' }).click();
  await owner.getByText('E-mail ou senha incorretos.').waitFor();
  users.owner.password = 'senha-ficticia-e2e-2';
  await login(owner, users.owner);
});

for (const extra of options.also) {
  await step(`outro navegador (${path.basename(extra)}): login, CRM, oportunidade, tema e celular`, async () => {
    const other = await launch(extra);
    try {
      const context = await other.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR' });
      const page = await context.newPage();
      watch(page, path.basename(extra));
      current = page;
      await login(page, users.owner);
      await open(page, `#/crm`);
      await page.getByRole('region', { name: stagesOf('lost')[0].name, exact: true }).waitFor();
      await open(page, `#/crm/oportunidades/${ids.opportunity}`);
      await page.getByRole('heading', { name: /Padaria Fictícia/ }).waitFor();
      await page.getByRole('button', { name: /Tema .* \(trocar\)/ }).click();
      await shot(page, `80-${slug(path.basename(extra))}-oportunidade`);
      const phone = await other.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
      const mobile = await phone.newPage();
      watch(mobile, `${path.basename(extra)} celular`);
      await login(mobile, users.owner);
      await mobile.getByRole('button', { name: 'Abrir menu' }).click();
      await shot(mobile, `81-${slug(path.basename(extra))}-celular-menu`);
      const version = other.version();
      console.log(`    ${path.basename(extra)} ${version}`);
    } finally { await other.close(); current = owner; }
  });
}

await step('servidor: nenhum erro interno registrado durante a validação', async () => {
  assert.deepEqual(serverErrors, []);
});

// ————————————————————————— Encerramento —————————————————————————
await browser.close();
await server.close();
for (const cleanup of cleanups.reverse()) await cleanup();
console.error = consoleError;
const report = {
  source: path.basename(source), browser: options.browser, also: options.also, at: new Date().toISOString(),
  passed: results.filter(item => item.ok).length, failed: results.filter(item => !item.ok).length, results,
  findings: { a11y: [...findings.a11y], contrast: { dark: [...findings.contrast.dark], light: [...findings.contrast.light] } },
};
fs.writeFileSync(path.join(out, 'relatorio.json'), JSON.stringify(report, null, 2));
if (options.keep) console.log(`Clone mantido em ${clone}`);
else fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
console.log(`\n${report.passed}/${results.length} etapas ok. Capturas e relatório em ${out}`);
process.exit(report.failed ? 1 : 0);
