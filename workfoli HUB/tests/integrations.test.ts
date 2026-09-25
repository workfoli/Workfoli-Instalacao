import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { defaultCrmConfig } from '../packages/contract/workfoli-contract.mjs';
import { liveConnection, readBundle, writeBundle } from '../packages/hub/integrations/connections.js';
import { VaultError, dpapi, openVault } from '../packages/hub/integrations/vault.js';
import type { KeyProtector } from '../packages/hub/integrations/vault.js';
import { startFakeProviders } from './fake-providers.js';
import type { FakeProviders } from './fake-providers.js';
import { hub, invite, tempDir } from './helpers.js';

const testVault = () => openVault('.', { env: { WORKFOLI_VAULT_KEY: randomBytes(32).toString('base64') } });

async function setup(t: TestContext) {
  const fake = await startFakeProviders(t);
  const context = await hub(t, {}, { integrations: { endpoints: fake.endpoints, vault: testVault(), autoSync: false } });
  return { ...context, fake };
}

/** Faz o papel do navegador: abre a tela do provedor (que "consente") e segue o retorno até o Hub, sem cookie. */
async function consent(fake: FakeProviders, authorizeUrl: string) {
  assert.ok(authorizeUrl.startsWith(fake.url), 'authorization happens at the provider, never inside the Hub');
  const provider = await fetch(authorizeUrl, { redirect: 'manual' });
  assert.equal(provider.status, 302);
  const callback = provider.headers.get('location')!;
  const page = await fetch(callback, { redirect: 'manual' });
  return { callback, status: page.status, html: await page.text() };
}

const noTokens = (value: unknown) => {
  const text = JSON.stringify(value);
  for (const token of ['google-access', 'google-refresh', 'meta-long', 'meta-short', 'page-token', 'vercel-token-valido', 'github-access', 'github-secret', 'sbp-token-sintetico']) assert.ok(!text.includes(token), `token leaked: ${token}`);
};

test('Google: OAuth with PKCE in the system browser, tokens only in the vault, data synced and normalized', async t => {
  const { server, owner, fake } = await setup(t);
  const before = (await owner.get('/api/integrations')).data;
  const googleCard = () => before.cards.find((card: { provider: string }) => card.provider === 'google');
  assert.equal(googleCard().state, 'app-missing');
  assert.deepEqual(googleCard().setup.missing, ['GOOGLE_OAUTH_CLIENT_ID']);
  const blocked = await owner.post('/api/integrations/google/connect', {});
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'app-credentials-missing');

  server.runtime.secrets.set('GOOGLE_OAUTH_CLIENT_ID', 'google-client');
  server.runtime.secrets.set('GOOGLE_OAUTH_CLIENT_SECRET', 'google-secret');
  const started = await owner.post('/api/integrations/google/connect', { capabilities: ['ads', 'analytics', 'search-console'] });
  assert.equal(started.status, 200, JSON.stringify(started.data));
  const authorize = new URL(started.data.authorizeUrl);
  assert.equal(authorize.searchParams.get('client_id'), 'google-client');
  assert.equal(authorize.searchParams.get('redirect_uri'), `${server.url}/api/integrations/oauth/callback`);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.match(authorize.searchParams.get('state')!, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(authorize.searchParams.get('access_type'), 'offline');
  assert.ok(authorize.searchParams.get('scope')!.includes('https://www.googleapis.com/auth/webmasters.readonly'));
  assert.ok(!authorize.searchParams.has('client_secret'), 'the app secret never goes to the browser');
  assert.match(started.data.warnings[0], /GOOGLE_ADS_DEVELOPER_TOKEN/);

  const done = await consent(fake, started.data.authorizeUrl);
  assert.equal(done.status, 200);
  assert.match(done.html, /Conexão concluída/);
  assert.match(done.html, /url=\/#\/integrations\?conectado=google/);
  assert.match((await (await fetch(done.callback)).text()), /já foi usado/, 'the state is single use');

  const view = (await owner.get('/api/integrations')).data;
  noTokens(view);
  const card = view.cards.find((item: { provider: string }) => item.provider === 'google');
  assert.equal(card.state, 'connected');
  assert.equal(card.account, 'marketing@exemplo.test');
  assert.ok(card.capabilities.every((capability: { granted: boolean }) => capability.granted));
  const stored = server.runtime.db.prepare('SELECT ciphertext FROM integration_tokens').all() as Array<{ ciphertext: string }>;
  assert.equal(stored.length, 1);
  noTokens(stored);
  noTokens(server.runtime.db.prepare('SELECT * FROM integration_connections').all());
  noTokens(server.runtime.db.prepare('SELECT * FROM audit').all());

  const options = (await owner.get('/api/integrations/google/options')).data;
  assert.match(options.adsCustomers.unavailable, /GOOGLE_ADS_DEVELOPER_TOKEN/);
  assert.deepEqual(options.ga4Properties.items.map((item: { id: string }) => item.id), ['987654']);
  assert.deepEqual(options.sites.items.map((item: { id: string }) => item.id), ['sc-domain:exemplo.test'], 'unverified sites are not offered');
  server.runtime.secrets.set('GOOGLE_ADS_DEVELOPER_TOKEN', 'dev-token');
  const accounts = (await owner.get('/api/integrations/google/options')).data.adsCustomers.items;
  assert.deepEqual(accounts, [{ id: '1234567890', label: 'Conta Sintética', detail: 'BRL' }]);
  assert.equal((await owner.patch('/api/integrations/google/settings', { ga4PropertyId: 'abc' })).status, 400);
  const saved = await owner.patch('/api/integrations/google/settings', { adsCustomerId: '123-456-7890', ga4PropertyId: '987654', searchConsoleSite: 'sc-domain:exemplo.test' });
  assert.equal(saved.data.settings.adsCustomerId, '1234567890');

  // Token perto de vencer: o Hub renova sozinho com o refresh token antes de chamar a API.
  const row = liveConnection(server.runtime.db, 'google')!;
  writeBundle(server.runtime, row, { ...readBundle(server.runtime, row), expiresAt: new Date(Date.now() - 1000).toISOString() });
  const period = { from: '2026-09-01', to: '2026-09-30' };
  const synced = await owner.post('/api/integrations/google/sync', period);
  assert.equal(synced.status, 200, JSON.stringify(synced.data));
  assert.deepEqual(synced.data.results.map((item: { kind: string; status: string }) => `${item.kind}:${item.status}`), ['google-ads:ok', 'google-analytics:ok', 'search-console:ok']);
  assert.equal(fake.state.googleAccess, 'google-access-2', 'refresh happened');
  const count = () => Number((server.runtime.db.prepare('SELECT COUNT(*) AS n FROM mkt_metrics_daily').get() as { n: number }).n);
  const rows = count();
  await owner.post('/api/integrations/google/sync', period);
  assert.equal(count(), rows, 'syncing twice never duplicates');

  const marketing = (await owner.get(`/api/marketing?from=${period.from}&to=${period.to}`)).data;
  noTokens(marketing);
  const google = marketing.ads.find((source: { id: string }) => source.id === 'google-ads');
  assert.deepEqual(google.platform, { impressions: 1800, clicks: 90, spendMicros: 45_000_000, conversions: 6, platformLeads: null });
  assert.equal(google.calculated.ctr, 0.05);
  assert.equal(google.calculated.cpcMicros, 500_000);
  assert.equal(google.calculated.costPerResultMicros, 7_500_000);
  assert.equal(google.campaigns[0].name, 'Pesquisa - Marca');
  const meta = marketing.ads.find((source: { id: string }) => source.id === 'meta-ads');
  assert.equal(meta.hasData, false);
  assert.deepEqual(meta.platform, { impressions: null, clicks: null, spendMicros: null, conversions: null, platformLeads: null }, 'no data is null, never an invented zero');
  assert.equal(marketing.site.analytics.platform.sessions, 200);
  assert.equal(marketing.site.searchConsole.calculated.averagePosition, 9.7, 'position is impression-weighted by the Workfoli');
  assert.ok(Math.abs(marketing.site.searchConsole.calculated.ctr - 40 / 1500) < 1e-9);
  assert.equal(marketing.daily.find((day: { date: string }) => day.date === '2026-09-20').googleSpendMicros, 25_000_000);
  assert.equal(marketing.daily.find((day: { date: string }) => day.date === '2026-09-05').googleSpendMicros, 0, 'synced source without activity that day');
  assert.equal(marketing.daily.find((day: { date: string }) => day.date === '2026-09-05').metaSpendMicros, null, 'never-synced source stays empty');

  // Refresh revogado no provedor: a conexão vira "vencida" e pede reconexão, sem inventar dados.
  fake.state.refreshValid = false;
  writeBundle(server.runtime, liveConnection(server.runtime.db, 'google')!, { ...readBundle(server.runtime, liveConnection(server.runtime.db, 'google')!), expiresAt: new Date(Date.now() - 1000).toISOString() });
  const expired = await owner.post('/api/integrations/google/sync', period);
  assert.equal(expired.status, 409);
  assert.equal(expired.data.code, 'reconnect');
  assert.equal((await owner.get('/api/integrations')).data.cards.find((item: { provider: string }) => item.provider === 'google').state, 'expired');

  const disconnected = await owner.post('/api/integrations/google/disconnect');
  assert.equal(disconnected.data.revoked, true);
  assert.deepEqual(fake.revoked, ['google:google-refresh']);
  assert.equal(Number((server.runtime.db.prepare('SELECT COUNT(*) AS n FROM integration_tokens').get() as { n: number }).n), 0, 'tokens are erased');
  assert.equal((await owner.get('/api/integrations')).data.cards.find((item: { provider: string }) => item.provider === 'google').state, 'available');
  noTokens(server.runtime.db.prepare('SELECT * FROM audit').all());
});

test('Meta: ads insights normalized and lead forms flowing into the CRM only when the Base links them', async t => {
  const { server, owner, fake } = await setup(t);
  server.runtime.secrets.set('META_APP_ID', 'meta-app');
  server.runtime.secrets.set('META_APP_SECRET', 'meta-secret');
  const started = (await owner.post('/api/integrations/meta/connect', {})).data;
  assert.ok(!new URL(started.authorizeUrl).searchParams.has('code_challenge'), 'Meta flow uses state + server-side secret');
  assert.match((await consent(fake, started.authorizeUrl)).html, /Meta conectado \(Empresa Sintética Ads\)/);
  const options = (await owner.get('/api/integrations/meta/options')).data;
  assert.deepEqual(options.adAccounts.items, [{ id: 'act_1234', label: 'Conta de anúncios', detail: 'BRL' }]);
  assert.deepEqual(options.pages.items, [{ id: '777', label: 'Página Sintética' }]);
  assert.equal((await owner.patch('/api/integrations/meta/settings', { pageIds: ['777', 'x'] })).status, 400);
  await owner.patch('/api/integrations/meta/settings', { adAccountId: 'act_1234', pageIds: ['777'] });
  const period = { from: '2026-09-01', to: '2026-09-30' };

  const unlinked = (await owner.post('/api/integrations/meta/sync', period)).data;
  const leadsResult = (report: { results: Array<{ kind: string }> }) => report.results.find(item => item.kind === 'meta-leads') as { status: string; message: string | null; stats?: Record<string, number> };
  assert.equal(leadsResult(unlinked).status, 'skipped');
  assert.match(leadsResult(unlinked).message!, /Base não liga/);
  assert.equal((await owner.get('/api/crm/leads')).data.items.length, 0, 'no lead enters the CRM without the Base rule');

  const config = { ...defaultCrmConfig(), integrations: [{ provider: 'meta', leads: true, source: 'meta-ads', pipeline: 'vendas' }] };
  assert.equal((await owner.call('PUT', '/api/crm/config', { crm: config })).status, 200);
  server.runtime.base.invalidate();
  const linked = (await owner.post('/api/integrations/meta/sync', period)).data;
  assert.equal(linked.results.find((item: { kind: string }) => item.kind === 'meta-ads').status, 'ok');
  assert.deepEqual(leadsResult(linked).stats, { forms: 1, received: 2, created: 2, duplicates: 0, opportunities: 2, failed: 0 });
  const leads = (await owner.get('/api/crm/leads')).data.items as Array<Record<string, any>>;
  const joana = leads.find(lead => lead.name === 'Joana Prado')!;
  assert.equal(joana.source.id, 'meta-ads');
  assert.equal(joana.status, 'converted');
  assert.equal(joana.attribution.campaignName, 'Leads - Setembro');
  assert.equal(joana.attribution.formName, 'Formulário Orçamento');
  assert.match(joana.message, /qual_servico: Site/);
  assert.equal(joana.origin, 'integration:meta');
  assert.ok(leads.some(lead => lead.name === 'Pedro Sá'), 'first + last name are combined');
  const deals = (await owner.get('/api/crm/opportunities')).data.items as Array<{ stageId: string; attribution: Record<string, string> }>;
  assert.equal(deals.length, 2);
  assert.ok(deals.every(deal => deal.stageId === 'novo-lead'));
  assert.ok(deals.some(deal => deal.attribution.adName === 'Anúncio A'), 'attribution travels lead → opportunity');

  const again = (await owner.post('/api/integrations/meta/sync', period)).data;
  assert.deepEqual(leadsResult(again).stats, { forms: 1, received: 2, created: 0, duplicates: 2, opportunities: 0, failed: 0 }, 'the same lead never enters twice');

  const marketing = (await owner.get(`/api/marketing?from=${period.from}&to=${period.to}`)).data;
  const meta = marketing.ads.find((source: { id: string }) => source.id === 'meta-ads');
  assert.equal(meta.platform.spendMicros, 400_500_000);
  assert.equal(meta.platform.platformLeads, 15, "'lead' already aggregates; no double counting");
  assert.equal(meta.crm.leads, 2);
  assert.equal(meta.calculated.costPerCrmLeadMicros, 200_250_000);
  assert.ok(!fake.calls.some(call => call.path.includes('evil')), 'paging never follows another host');
  assert.ok(fake.calls.filter(call => call.path.startsWith('/meta.graph/v23.0/777/leadgen_forms')).every(call => call.auth === 'Bearer page-token'));

  const result = await owner.post('/api/integrations/meta/disconnect');
  assert.equal(result.data.revoked, true);
  assert.deepEqual(fake.revoked, ['meta']);
  assert.equal((await owner.get('/api/crm/leads')).data.items.length, 2, 'CRM data stays with the company after disconnecting');
});

test('OAuth callback refuses forged, expired and cancelled returns; only admins connect; tokens pasted are verified and hidden', async t => {
  const { server, owner, fake } = await setup(t);
  const forged = await fetch(`${server.url}/api/integrations/oauth/callback?state=${'A'.repeat(43)}&code=x`);
  assert.match(await forged.text(), /não encontrado/);
  assert.match(await (await fetch(`${server.url}/api/integrations/oauth/callback?state=%3Cscript%3E&code=x`)).text(), /inválido/);
  server.runtime.secrets.set('GOOGLE_OAUTH_CLIENT_ID', 'google-client');
  server.runtime.secrets.set('GOOGLE_OAUTH_CLIENT_SECRET', 'google-secret');
  const started = (await owner.post('/api/integrations/google/connect', { capabilities: ['analytics'] })).data;
  const state = new URL(started.authorizeUrl).searchParams.get('state')!;
  const cancelled = await (await fetch(`${server.url}/api/integrations/oauth/callback?state=${state}&error=access_denied`)).text();
  assert.match(cancelled, /cancelada/);
  assert.ok(!/<script/i.test(cancelled));
  const again = (await owner.post('/api/integrations/google/connect', { capabilities: ['analytics'] })).data;
  server.runtime.db.prepare('UPDATE oauth_states SET expires_at=?').run(new Date(Date.now() - 1000).toISOString());
  assert.match((await consent(fake, again.authorizeUrl)).html, /expirou/);
  assert.equal((await owner.post('/api/integrations/google/connect', { capabilities: ['calendar'] })).status, 400);

  const member = await invite(owner, server, 'member', 'Membro', 'membro@exemplo.test');
  const memberView = (await member.get('/api/integrations')).data;
  assert.equal(memberView.admin, false);
  assert.ok(memberView.cards.every((card: Record<string, unknown>) => !('setup' in card)), 'credential names only for admins');
  assert.equal((await member.post('/api/integrations/google/connect', {})).status, 403);
  assert.equal((await member.post('/api/integrations/vercel/token', { token: 'vercel-token-valido-123' })).status, 403);

  assert.equal((await owner.post('/api/integrations/vercel/token', { token: 'curto' })).status, 400);
  const wrong = await owner.post('/api/integrations/vercel/token', { token: 'vercel-token-errado-000' });
  assert.equal(wrong.status, 502);
  assert.match(wrong.data.error, /Vercel respondeu com erro \(403\)/);
  const vercel = await owner.post('/api/integrations/vercel/token', { token: 'vercel-token-valido-123' });
  assert.equal(vercel.status, 200);
  noTokens(vercel.data);
  assert.equal((await owner.get('/api/integrations')).data.cards.find((card: { provider: string }) => card.provider === 'vercel').account, 'empresa-sintetica');
  const inactive = await owner.post('/api/integrations/cloudflare/token', { token: 'cloudflare-token-inativo' });
  assert.equal(inactive.status, 400);
  assert.equal((await owner.post('/api/integrations/google/token', { token: 'qualquer-coisa-longa' })).status, 400, 'OAuth providers never accept pasted tokens');
  assert.equal((await owner.post('/api/integrations/desconhecido/connect', {})).status, 404);
  noTokens(server.runtime.db.prepare('SELECT * FROM audit').all());
});

test('GitHub: OAuth with PKCE, secret only on the server, identity from the API and revocation on disconnect', async t => {
  const { server, owner, fake } = await setup(t);
  server.runtime.secrets.set('GITHUB_OAUTH_CLIENT_ID', 'github-client');
  server.runtime.secrets.set('GITHUB_OAUTH_CLIENT_SECRET', 'github-secret');
  const started = await owner.post('/api/integrations/github/connect', { capabilities: ['repos'] });
  assert.equal(started.status, 200, JSON.stringify(started.data));
  const authorize = new URL(started.data.authorizeUrl);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorize.searchParams.get('scope'), 'read:user repo');
  assert.ok(!started.data.authorizeUrl.includes('github-secret'), 'the app secret never goes to the browser');

  // Código trocado com falha (GitHub responde 200 com erro): nada é gravado e a página explica.
  fake.state.githubTokenError = true;
  const failed = await consent(fake, started.data.authorizeUrl);
  assert.match(failed.html, /Conexão não concluída/);
  assert.match(failed.html, /GitHub respondeu com erro/);
  assert.equal((await owner.get('/api/integrations')).data.cards.find((card: { provider: string }) => card.provider === 'github').state, 'available');

  fake.state.githubTokenError = false;
  const again = await owner.post('/api/integrations/github/connect', { capabilities: ['repos'] });
  const done = await consent(fake, again.data.authorizeUrl);
  assert.match(done.html, /GitHub conectado \(empresa-sintetica\)/);
  assert.match(await (await fetch(done.callback)).text(), /já foi usado/, 'the callback works once');
  const view = (await owner.get('/api/integrations')).data;
  noTokens(view);
  const card = view.cards.find((item: { provider: string }) => item.provider === 'github');
  assert.equal(card.state, 'connected');
  assert.equal(card.account, 'empresa-sintetica');
  assert.ok(card.scopes.some((scope: { label: string }) => scope.label === 'Repositórios privados'));
  const stored = JSON.stringify(server.runtime.db.prepare('SELECT * FROM integration_tokens').all());
  assert.ok(!stored.includes('github-access-1'), 'token stored only encrypted');

  const disconnected = await owner.post('/api/integrations/github/disconnect');
  assert.equal(disconnected.data.revoked, true);
  assert.deepEqual(fake.revoked, ['github:github-access-1'], 'grant revoked at GitHub with the app credentials');
  assert.equal((await owner.get('/api/integrations')).data.cards.find((item: { provider: string }) => item.provider === 'github').state, 'available');
  noTokens(server.runtime.db.prepare('SELECT * FROM audit').all());
});

test('Supabase: token verified by listing projects, kept encrypted, never returned, removed on disconnect', async t => {
  const { server, owner } = await setup(t);
  const wrong = await owner.post('/api/integrations/supabase/token', { token: 'sbp-token-sintetico-errado' });
  assert.equal(wrong.status, 502);
  assert.match(wrong.data.error, /Supabase respondeu com erro \(401\)/);
  assert.equal((await owner.get('/api/integrations')).data.cards.find((card: { provider: string }) => card.provider === 'supabase').state, 'available', 'refused token saves nothing');
  const connected = await owner.post('/api/integrations/supabase/token', { token: 'sbp-token-sintetico-valido' });
  assert.equal(connected.status, 200, JSON.stringify(connected.data));
  noTokens(connected.data);
  const view = (await owner.get('/api/integrations')).data;
  noTokens(view);
  assert.equal(view.cards.find((card: { provider: string }) => card.provider === 'supabase').account, '2 projetos');
  assert.ok(!JSON.stringify(server.runtime.db.prepare('SELECT * FROM integration_tokens').all()).includes('sbp-token-sintetico-valido'));
  const disconnected = await owner.post('/api/integrations/supabase/disconnect');
  assert.equal(disconnected.status, 200);
  assert.equal(Number((server.runtime.db.prepare("SELECT COUNT(*) AS n FROM integration_tokens").get() as { n: number }).n), 0);
  noTokens(server.runtime.db.prepare('SELECT * FROM audit').all());
});

test('vault: AES-256-GCM bound to its record, master key protected at rest', t => {
  const dir = tempDir(t);
  const reversible: KeyProtector = { id: 'dpapi', protect: key => Buffer.from(key.map(byte => byte ^ 0x5a)).toString('base64'), unprotect: data => Buffer.from(Buffer.from(data, 'base64').map(byte => byte ^ 0x5a)) };
  const vault = openVault(dir, { env: {}, protector: reversible });
  const stored = JSON.parse(fs.readFileSync(path.join(dir, 'vault.key'), 'utf8'));
  assert.equal(stored.protection, 'dpapi');
  const box = vault.encrypt('segredo-sintetico', 'integration-token:a');
  assert.ok(!box.includes('segredo'));
  assert.equal(openVault(dir, { env: {}, protector: reversible }).decrypt(box, 'integration-token:a'), 'segredo-sintetico', 'reopening keeps the same key');
  assert.throws(() => vault.decrypt(box, 'integration-token:b'), VaultError, 'a ciphertext moved to another record does not open');
  const parts = box.split('.');
  parts[4] = Buffer.from('x'.repeat(17)).toString('base64url');
  assert.throws(() => vault.decrypt(parts.join('.'), 'integration-token:a'), VaultError);
  assert.throws(() => openVault(dir, { env: {}, protector: null }), /DPAPI/, 'a DPAPI-protected key does not open without DPAPI');
  const other = openVault(tempDir(t), { env: {}, protector: null });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'vault.key'), 'utf8')).protection, 'dpapi');
  assert.throws(() => other.decrypt(box, 'integration-token:a'), /outra chave/);
  assert.throws(() => openVault(dir, { env: { WORKFOLI_VAULT_KEY: 'curta' } }), /32 bytes/);
});

test('vault: real Windows DPAPI round trip', { skip: process.platform !== 'win32' }, () => {
  const key = randomBytes(32);
  assert.ok(dpapi.unprotect(dpapi.protect(key)).equals(key));
});
