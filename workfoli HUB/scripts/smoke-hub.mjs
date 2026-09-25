// Smoke test da interface web do Hub em navegador real, com dados sintéticos.
// Cria uma instância temporária a partir do template real da Base, instala o Hub, ativa o proprietário,
// percorre os módulos, confirma uma ação da IA e salva capturas em test-results/hub/.
// Uso: npm run build:hub && npm run test:ui     (usa o Edge/Chrome instalado; não baixa navegador)
import { register } from 'tsx/esm/api';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

register();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { initBase, readBaseManifest, writeBaseManifest } = await import('../packages/instance/base.ts');
const { installHub } = await import('../packages/instance/instance.ts');
const { startHubServer } = await import('../packages/hub/server.ts');
const { defaultCrmConfig } = await import('../packages/contract/workfoli-contract.mjs');

if (!fs.existsSync(path.join(root, 'dist-hub', 'index.html'))) throw new Error('Rode npm run build:hub antes do teste de interface.');
const out = path.join(root, 'test-results', 'hub');
fs.mkdirSync(out, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'workfoli-ui-'));
const instanceDir = path.join(temp, 'instances', 'estudio-exemplo');
const baseDir = path.join(instanceDir, 'base');

// Empresa fictícia, preenchida como um operador faria depois do /instalar.
initBase({ dir: baseDir, name: 'Estúdio Exemplo', git: false, profile: 'services' });
const write = (relative, text) => { const file = path.join(baseDir, ...relative.split('/')); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
write('_memoria/empresa.md', '# Empresa\n\n**Nome:** Estúdio Exemplo\n**O que faz:** Design e desenvolvimento de presença digital para pequenos negócios.\n\n## Diferenciais\n\n- Atendimento direto com quem executa\n- Entregas semanais\n');
write('processos/atendimento.md', '# Atendimento\n\n**Quando acontece:** novo contato pelo site.\n\n## Passo a passo\n\n1. Responder em até 1 dia útil\n2. Agendar conversa inicial\n3. Registrar no CRM do Hub\n');
write('servicos/presenca-digital.md', '# Presença Digital\n\nSites e landing pages com a marca do cliente.\n');
write('tarefas.md', '# Tarefas\n\n## Agora\n\n- [ ] Revisar a memória da empresa\n- [ ] Completar o briefing do site\n\n## Feito\n\n- [x] Instalar a Base\n');
const loaded = readBaseManifest(baseDir);
writeBaseManifest(baseDir, {
  ...loaded.manifest,
  company: { ...loaded.manifest.company, tagline: 'Presença digital sem complicação.', description: 'Estúdio fictício usado para validar o Workfoli Hub.' },
  identity: { ...loaded.manifest.identity, colors: { background: '#151716', surface: '#202321', text: '#F5F5F1', textSecondary: '#B8BBB5', accent: '#B8F24A' }, typography: { heading: 'Manrope', body: 'Manrope' }, voice: { method: ['Entender', 'Estruturar', 'Executar', 'Evoluir'] } },
  services: [{ id: 'presenca-digital', name: 'Presença Digital', summary: 'Sites e landing pages.', path: 'servicos/presenca-digital.md', status: 'active', visibility: 'public' }],
  projects: [{ id: 'site-institucional', name: 'Site institucional', type: 'website', status: 'active', visibility: 'internal', summary: 'Novo site com a marca revisada.', services: ['presenca-digital'] }],
  modules: { enabled: [...new Set([...loaded.manifest.modules.enabled, 'crm', 'marketing', 'integrations', 'calendar'])], settings: { crm: { label: 'Clientes' } } },
  crm: { ...defaultCrmConfig(), labels: { contact: 'Cliente', contacts: 'Clientes' }, customFields: [{ id: 'servico', entity: 'opportunity', label: 'Serviço de interesse', type: 'select', options: ['Site', 'Landing page'], required: false }],
    automations: [{ id: 'responder', name: 'Responder lead', enabled: true, when: { event: 'lead_created' }, actions: [{ type: 'create_task', title: 'Responder {nome}', dueInDays: 0, assignTo: 'owner' }] }] },
  integrations: [{ id: 'github', provider: 'github', status: 'pending', purpose: 'Repositórios dos projetos', secrets: ['GITHUB_TOKEN'] }, { id: 'google-ads', provider: 'google-ads', status: 'planned' }],
});
const install = installHub({ instanceDir, port: 48790 });
const server = await startHubServer({ instanceDir, port: 0, quiet: true, integrations: { autoSync: false } });
const errors = [];
let browser;
let page;
try {
  browser = await chromium.launch({ channel: process.env.WORKFOLI_BROWSER ?? 'msedge', headless: true }).catch(() => chromium.launch({ channel: 'chrome', headless: true }));
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/401|Failed to load resource/.test(message.text())) errors.push(message.text()); });

  await page.goto(`${server.url}/#/ativar?token=${encodeURIComponent(install.activationToken)}`);
  await page.getByRole('heading', { name: /Olá/ }).waitFor();
  await page.screenshot({ path: path.join(out, '00-ativacao.png') });
  await page.getByLabel('Seu nome').fill('Ana Exemplo');
  await page.getByLabel('E-mail de acesso').fill('ana@exemplo.test');
  await page.getByLabel('Senha', { exact: true }).fill('senha-exemplo-segura');
  await page.getByLabel('Repita a senha').fill('senha-exemplo-segura');
  await page.getByRole('button', { name: 'Ativar acesso' }).click();
  await page.getByRole('heading', { name: /Ana/ }).waitFor();
  assert.ok(await page.getByText('Revisar a memória da empresa').isVisible());
  await page.screenshot({ path: path.join(out, '01-visao-geral.png'), fullPage: true });

  const visit = async (hash, name, check) => {
    await page.goto(`${server.url}/${hash}`);
    await page.getByText(check).first().waitFor({ timeout: 10_000 });
    await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  };
  await visit('#/company', '02-empresa', 'Presença Digital');
  await visit('#/knowledge', '03-conhecimento', 'Atendimento');
  await visit('#/projects', '04-projetos', 'Site institucional');
  await visit('#/tasks', '05-tarefas', 'Pendências registradas na Base');
  // Título longo sem espaços (link colado): no celular ele deve quebrar a linha, nunca alargar a tela.
  await page.getByLabel('Nova tarefa').fill('Revisar https://exemplo.test/um-endereco-muito-longo-sem-espacos-que-nao-pode-alargar-a-tela');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await page.getByText('um-endereco-muito-longo', { exact: false }).first().waitFor();
  await visit('#/crm', '06-crm-funil', 'Novo lead');

  // CRM: lead → conversão → oportunidade → regra da etapa (Proposta exige valor) → resultados.
  await page.getByRole('button', { name: 'Lead', exact: true }).click();
  const leadForm = page.getByRole('dialog');
  await leadForm.getByLabel('Nome', { exact: true }).fill('Bruno Lima');
  await leadForm.getByLabel('Empresa', { exact: true }).fill('Padaria Central');
  await leadForm.getByLabel('E-mail').fill('bruno@exemplo.test');
  await leadForm.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('button', { name: 'Converter' }).waitFor();
  assert.ok(await page.getByText('Responder Bruno Lima', { exact: true }).isVisible(), 'automation from the Base created the task');
  await page.screenshot({ path: path.join(out, '06b-crm-lead.png'), fullPage: true });
  await page.getByRole('button', { name: 'Converter' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Converter' }).click();
  await page.getByRole('heading', { name: /Padaria Central/ }).waitFor();
  await page.screenshot({ path: path.join(out, '06c-crm-oportunidade.png'), fullPage: true });
  await page.goto(`${server.url}/#/crm`);
  await page.getByLabel('Mover Padaria Central').selectOption({ label: 'Proposta' });
  await page.getByRole('dialog').getByLabel(/Valor/).fill('4500');
  await page.getByRole('dialog').getByRole('button', { name: 'Mover' }).click();
  await page.getByRole('region', { name: 'Proposta' }).getByRole('link', { name: 'Padaria Central' }).waitFor();
  await page.screenshot({ path: path.join(out, '06d-crm-funil-movido.png'), fullPage: true });
  await visit('#/crm/resultados', '06e-crm-resultados', 'Em negociação agora');
  await visit('#/crm/configuracao', '06f-crm-configuracao', 'Serviço de interesse');
  await visit('#/marketing', '06g-marketing', 'Nenhuma conta de mídia conectada');
  await visit('#/integrations', '07-integracoes', 'Aguardando credenciais do app');
  await page.getByRole('button', { name: 'Como ativar' }).first().click();
  await page.getByText('GOOGLE_OAUTH_CLIENT_ID').waitFor();
  await page.screenshot({ path: path.join(out, '07b-integracoes-ativar.png') });
  await page.keyboard.press('Escape');
  await visit('#/files', '08-arquivos', 'workfoli.base.json');
  await visit('#/users', '09-usuarios', 'Ana Exemplo');
  await visit('#/settings', '10-configuracoes', 'Local Agent');
  await visit('#/planned/calendar', '11-planejado', 'ainda não está disponível');

  await page.goto(`${server.url}/#/ai`);
  await page.getByLabel('Mensagem para a IA').fill('Cadastre Maria Souza como nova cliente, maria@exemplo.test');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Confirmar' }).waitFor();
  await page.screenshot({ path: path.join(out, '12-ia-proposta.png'), fullPage: true });
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByText('Executada').waitFor();
  await visit('#/crm/contatos', '13-crm-apos-ia', 'Maria Souza');
  await visit('#/history', '14-historico', 'Confirmou ação da IA');

  await page.getByRole('button', { name: /Tema escuro/ }).click();
  await page.goto(`${server.url}/#/`);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await page.screenshot({ path: path.join(out, '15-visao-geral-clara.png'), fullPage: true });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'pt-BR' });
  const phone = await mobile.newPage();
  phone.on('pageerror', error => errors.push(error.message));
  await phone.goto(`${server.url}/#/`);
  await phone.getByLabel('E-mail').fill('ana@exemplo.test');
  await phone.getByLabel('Senha').fill('senha-exemplo-segura');
  await phone.getByRole('button', { name: 'Entrar' }).click();
  await phone.getByRole('heading', { name: /Ana/ }).waitFor();
  await phone.getByText('um-endereco-muito-longo', { exact: false }).first().waitFor();
  await phone.screenshot({ path: path.join(out, '16-celular-visao-geral.png'), fullPage: true });
  for (const hash of ['#/', '#/tasks', '#/crm', '#/crm/contatos']) {
    await phone.goto(`${server.url}/${hash}`);
    await phone.waitForLoadState('networkidle');
    await phone.locator('main .loading').first().waitFor({ state: 'detached' }).catch(() => {});
    await phone.waitForTimeout(250);
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${hash} no celular rola ${overflow}px na horizontal`);
  }
  await phone.goto(`${server.url}/#/`);
  await phone.getByRole('heading', { name: /Ana/ }).waitFor();
  await phone.getByRole('button', { name: 'Abrir menu' }).click();
  await phone.waitForTimeout(300);
  await phone.screenshot({ path: path.join(out, '17-celular-menu.png') });

  assert.deepEqual(errors, [], `Erros no navegador:\n${errors.join('\n')}`);
  console.log(`Interface validada. Capturas em ${out}`);
} catch (error) {
  // Diagnóstico: captura a tela e as mensagens visíveis no momento da falha.
  if (page) {
    await page.screenshot({ path: path.join(out, '99-falha.png'), fullPage: true }).catch(() => {});
    const notices = await page.locator('.notice, .toast').allInnerTexts().catch(() => []);
    console.error(`URL: ${page.url()}
Mensagens na tela: ${JSON.stringify(notices)}
Erros do navegador: ${JSON.stringify(errors)}`);
  }
  throw error;
} finally {
  await browser?.close();
  await server.close();
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
