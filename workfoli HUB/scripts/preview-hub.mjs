// Pré-visualização do Hub de uma empresa SEM tocar na instância real.
// Copia a Base para uma instância temporária, instala o Hub, ativa um usuário de pré-visualização,
// captura as telas principais e apaga tudo ao final.
// Uso: node scripts/preview-hub.mjs "<pasta da Base>" [--out <pasta>] [--keep]
import { register } from 'tsx/esm/api';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

register();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const baseSource = args.find(arg => !arg.startsWith('--'));
const outIndex = args.indexOf('--out');
const out = path.resolve(outIndex >= 0 ? args[outIndex + 1] : path.join(root, 'test-results', 'preview'));
if (!baseSource) { console.error('Uso: node scripts/preview-hub.mjs "<pasta da Base>" [--out <pasta>]'); process.exit(1); }
if (!fs.existsSync(path.join(root, 'dist-hub', 'index.html'))) { console.error('Rode npm run build:hub antes.'); process.exit(1); }

const { readBaseManifest } = await import('../packages/instance/base.ts');
const { installHub } = await import('../packages/instance/instance.ts');
const { startHubServer } = await import('../packages/hub/server.ts');
const { manifest } = readBaseManifest(path.resolve(baseSource));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'workfoli-preview-'));
const instanceDir = path.join(temp, manifest.company.slug);
fs.cpSync(path.resolve(baseSource), path.join(instanceDir, 'base'), { recursive: true, filter: source => !/[\\/](?:\.git|node_modules)(?:[\\/]|$)/.test(source) });
const install = installHub({ instanceDir, port: 48791 });
const server = await startHubServer({ instanceDir, port: 0, quiet: true });
fs.mkdirSync(out, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ channel: process.env.WORKFOLI_BROWSER ?? 'msedge', headless: true }).catch(() => chromium.launch({ channel: 'chrome', headless: true }));
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' })).newPage();
  await page.goto(`${server.url}/#/ativar?token=${encodeURIComponent(install.activationToken)}`);
  await page.getByLabel('Seu nome').fill('Pré-visualização');
  await page.getByLabel('E-mail de acesso').fill('previa@exemplo.test');
  await page.getByLabel('Senha', { exact: true }).fill('previsualizacao-segura');
  await page.getByLabel('Repita a senha').fill('previsualizacao-segura');
  await page.getByRole('button', { name: 'Ativar acesso' }).click();
  await page.locator('.page-head h1').waitFor();
  for (const [hash, name] of [['#/', 'visao-geral'], ['#/company', 'empresa'], ['#/projects', 'projetos'], ['#/knowledge', 'conhecimento'], ['#/integrations', 'integracoes'], ['#/crm', 'crm']]) {
    await page.goto(`${server.url}/${hash}`);
    await page.locator('.page-head h1').waitFor();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(out, `${manifest.company.slug}-${name}.png`), fullPage: true });
  }
  await page.locator('button[aria-label*="Tema"]').click();
  await page.goto(`${server.url}/#/company`);
  await page.locator('.page-head h1').waitFor();
  await page.screenshot({ path: path.join(out, `${manifest.company.slug}-empresa-clara.png`), fullPage: true });
  console.log(`Pré-visualização de ${manifest.company.name} em ${out}`);
} finally {
  await browser?.close();
  await server.close();
  if (!args.includes('--keep')) fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
