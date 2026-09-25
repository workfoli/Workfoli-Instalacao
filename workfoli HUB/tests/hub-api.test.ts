import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { readBaseManifest } from '../packages/instance/base.js';
import { fileSecretStore } from '../packages/instance/secrets.js';
import { Client, hub, invite, rawRequest, write } from './helpers.js';

test('public surface is minimal and everything else requires a session', async t => {
  const { server } = await hub(t);
  const anonymous = new Client(server.url);
  assert.equal((await anonymous.get('/api/health')).status, 200);
  const brand = await anonymous.get('/api/brand');
  assert.equal(brand.data.company.name, 'Empresa Sintética');
  assert.equal((await anonymous.get('/api/brand/image')).status, 200);
  for (const route of ['/api/session', '/api/overview', '/api/tasks', '/api/knowledge', '/api/users', '/api/settings', '/api/base/image?path=identidade/simbolo.png']) {
    assert.equal((await anonymous.get(route)).status, 401, route);
  }
  const index = await anonymous.get('/');
  assert.equal(index.status, 503, 'without a UI build the Hub explains how to build it');
});

test('activation is single use, login is rate limited and sessions carry CSRF protection', async t => {
  const { fixture, server, owner } = await hub(t);
  const session = await owner.get('/api/session');
  assert.equal(session.data.user.roleId, 'owner');
  assert.ok(session.data.modules.active.some((module: { id: string; label: string }) => module.id === 'crm' && module.label === 'Clientes'));
  assert.deepEqual(session.data.modules.planned.map((module: { id: string }) => module.id), ['patients']);
  const reuse = await new Client(server.url).post('/api/auth/activate', { token: fixture.activationToken, email: 'x@exemplo.test', password: 'senha-sintetica-forte' });
  assert.equal(reuse.status, 400);
  const noCsrf = new Client(server.url); noCsrf.cookie = owner.cookie;
  assert.equal((await noCsrf.post('/api/tasks', { title: 'Sem token' })).status, 403);
  const member = await invite(owner, server, 'member', 'Membro', 'membro-login@exemplo.test');
  await member.post('/api/auth/logout');
  const attacker = new Client(server.url);
  for (let attempt = 0; attempt < 8; attempt++) await attacker.post('/api/auth/login', { email: 'dona@exemplo.test', password: 'errada-errada' });
  // Durante o bloqueio nem a senha correta passa: a força bruta não descobre quando acertou.
  assert.equal((await attacker.post('/api/auth/login', { email: 'dona@exemplo.test', password: 'senha-sintetica-forte' })).status, 429);
  // O bloqueio é por conta + origem: outra conta no mesmo IP continua entrando.
  assert.equal((await new Client(server.url).post('/api/auth/login', { email: 'membro-login@exemplo.test', password: 'outra-senha-forte-1' })).status, 200);
  const failures = await owner.get('/api/audit?prefix=auth.login-failed');
  assert.ok(failures.data.entries.length >= 8);
});

test('DNS rebinding and cross-origin requests are refused', async t => {
  const { server, owner } = await hub(t);
  assert.equal((await rawRequest(server.port, { path: '/api/health', headers: { Host: 'evil.example.test' } })).status, 421);
  assert.equal((await rawRequest(server.port, { path: '/api/health', headers: { Host: `localhost:${server.port}` } })).status, 200);
  const crossOrigin = await owner.call('POST', '/api/tasks', { title: 'x' }, { Origin: 'http://evil.example.test' });
  assert.equal(crossOrigin.status, 403);
});

test('tasks and CRM are operational data with validation and an audit trail', async t => {
  const { server, owner } = await hub(t);
  const created = await owner.post('/api/tasks', { title: 'Revisar proposta', dueDate: '2026-10-01' });
  assert.equal(created.status, 200);
  assert.equal((await owner.post('/api/tasks', { title: '' })).status, 400);
  assert.equal((await owner.post('/api/tasks', { title: 'x', projectId: 'inexistente' })).status, 400);
  const updated = await owner.patch(`/api/tasks/${created.data.id}`, { status: 'done' });
  assert.equal(updated.data.status, 'done');
  const contact = await owner.post('/api/crm/contacts', { name: 'Cliente Sintético', email: 'cliente@exemplo.test', relationship: 'customer' });
  assert.equal(contact.status, 200, JSON.stringify(contact.data));
  assert.equal((await owner.post('/api/crm/contacts', { name: 'X', relationship: 'patient' })).status, 400, 'no sector-specific relationship in the Core');
  assert.equal((await owner.post('/api/crm/contacts', { name: 'Y', email: 'CLIENTE@exemplo.test' })).status, 409, 'duplicate e-mail is reported');
  assert.equal((await owner.post('/api/crm/contacts', { name: 'X', notes: `token ${['sk', '-', 'a'.repeat(30)].join('')}` })).status, 400);
  const audit = await owner.get('/api/audit');
  const actions = audit.data.entries.map((entry: { action: string }) => entry.action);
  for (const action of ['task.created', 'task.updated', 'crm.contact-created', 'auth.activated', 'hub.installed']) assert.ok(actions.includes(action), action);
  const leaked = server.runtime.db.prepare('SELECT COUNT(*) AS n FROM audit WHERE detail LIKE ? OR target LIKE ?').get('%senha-sintetica%', '%senha-sintetica%') as { n: number };
  assert.equal(leaked.n, 0, 'passwords never reach the audit log');
});

test('permissions are enforced by the server for every role, not just hidden in the menu', async t => {
  const { server, owner } = await hub(t);
  const viewer = await invite(owner, server, 'viewer', 'Leitora', 'leitora@exemplo.test');
  const session = await viewer.get('/api/session');
  const ids = session.data.modules.active.map((module: { id: string }) => module.id);
  assert.ok(!ids.includes('users') && !ids.includes('settings') && !ids.includes('ai'));
  assert.equal((await viewer.get('/api/tasks')).status, 200);
  assert.equal((await viewer.post('/api/tasks', { title: 'Tentativa' })).status, 403);
  assert.equal((await viewer.get('/api/users')).status, 403);
  assert.equal((await viewer.post('/api/users', { name: 'Intrusa', roleId: 'owner' })).status, 403);
  const denied = await owner.get('/api/audit?prefix=access');
  assert.ok(denied.data.entries.some((entry: { result: string }) => entry.result === 'denied'));
  const attendant = await invite(owner, server, 'atendimento', 'Atendente', 'atendente@exemplo.test');
  assert.equal((await attendant.post('/api/crm/contacts', { name: 'Lead Sintético' })).status, 200);
  assert.equal((await attendant.get('/api/knowledge')).status, 403, 'Base role preset grants only what it lists');
  const admin = await invite(owner, server, 'admin', 'Admin', 'admin@exemplo.test');
  const users = (await admin.get('/api/users')).data.users as Array<{ id: string; roleId: string }>;
  const ownerId = users.find(user => user.roleId === 'owner')!.id;
  assert.equal((await admin.patch(`/api/users/${ownerId}`, { status: 'disabled' })).status, 403, 'admin cannot touch ownership');
  const self = (await owner.get('/api/session')).data.user.id;
  assert.equal((await owner.patch(`/api/users/${self}`, { roleId: 'viewer' })).status, 403, 'nobody changes their own role');
});

test('Base content: knowledge, projects written to the Base, and restricted files never served', async t => {
  const { fixture, owner } = await hub(t);
  write(fixture.baseDir, 'processos/segredo.md', `# Acesso\n\nsenha: ${'Abc12345'.repeat(2)}\n`);
  write(fixture.baseDir, 'dados/planilha.csv', 'nome,telefone\nFulano,9999\n');
  const docs = (await owner.get('/api/knowledge')).data.documents as Array<{ path: string; title: string }>;
  assert.ok(docs.some(doc => doc.path === '_memoria/empresa.md'));
  assert.ok(docs.some(doc => doc.path === 'servicos/servico-a.md' && doc.title === 'Serviço A'));
  assert.ok(!docs.some(doc => doc.path === 'processos/segredo.md'), 'credential document is not knowledge');
  assert.equal((await owner.get('/api/knowledge/doc?path=processos/segredo.md')).status, 404);
  assert.equal((await owner.get('/api/knowledge/doc?path=../workfoli.instance.json')).status, 404);
  const files = (await owner.get('/api/files')).data.base.files as Array<{ path: string; restricted: boolean }>;
  assert.ok(!files.some(file => file.path.startsWith('dados/')), 'private folder never scanned');
  const project = await owner.post('/api/projects', { name: 'Landing page de lançamento', type: 'landing-page', summary: 'Captar interessados.' });
  assert.equal(project.data.status, 'applied', JSON.stringify(project.data));
  assert.ok(fs.existsSync(path.join(fixture.baseDir, 'projetos', 'landing-page-de-lancamento', 'README.md')));
  const manifest = readBaseManifest(fixture.baseDir).manifest;
  assert.ok(manifest.projects.some(item => item.id === 'landing-page-de-lancamento' && item.status === 'planned'));
  const listed = (await owner.get('/api/projects')).data.projects as Array<{ id: string }>;
  assert.ok(listed.some(item => item.id === 'landing-page-de-lancamento'));
  const personal = await owner.post('/api/knowledge/notes', { title: 'Paciente', body: 'Paciente: Fulano, CPF 123.456.789-00' });
  assert.equal(personal.status, 400, 'personal records do not go to the Base');
  const note = await owner.post('/api/knowledge/notes', { title: 'Decisão de tipografia', body: 'Usamos Manrope em toda a interface.' });
  assert.equal(note.data.status, 'applied');
  assert.ok(fs.readdirSync(path.join(fixture.baseDir, 'conhecimento', 'notas')).length === 1);
});

test('AI proposes typed actions, executes only the confirmed hash, once, within permissions', async t => {
  const { server, owner } = await hub(t);
  const reply = await owner.post('/api/ai/messages', { text: 'Crie uma tarefa para revisar o site até amanhã' });
  assert.equal(reply.status, 200);
  const proposal = reply.data.proposals[0];
  assert.equal(proposal.type, 'task.create');
  assert.ok(proposal.fields.some((field: { label: string }) => field.label === 'Prazo'));
  assert.equal((await owner.get('/api/tasks')).data.tasks.length, 0, 'nothing happens before confirmation');
  assert.equal((await owner.post(`/api/ai/proposals/${proposal.id}/confirm`, { hash: 'f'.repeat(64) })).status, 409);
  const executed = await owner.post(`/api/ai/proposals/${proposal.id}/confirm`, { hash: proposal.hash });
  assert.equal(executed.data.status, 'executed');
  assert.equal((await owner.post(`/api/ai/proposals/${proposal.id}/confirm`, { hash: proposal.hash })).status, 409, 'no double execution');
  assert.equal((await owner.get('/api/tasks')).data.tasks.length, 1);
  const contact = await owner.post('/api/ai/messages', { text: 'Cadastre Maria Souza como nova cliente, maria@exemplo.test, interessada em site' });
  const contactProposal = contact.data.proposals[0];
  assert.equal(contactProposal.type, 'contact.create');
  assert.ok(contactProposal.fields.some((field: { value: string }) => field.value === 'Maria Souza'));
  await owner.post(`/api/ai/proposals/${contactProposal.id}/confirm`, { hash: contactProposal.hash });
  const contacts = (await owner.get('/api/crm/contacts')).data.items as Array<{ name: string; email: string; relationship: string; origin: string }>;
  assert.ok(contacts.some(item => item.name === 'Maria Souza' && item.email === 'maria@exemplo.test' && item.relationship === 'customer' && item.origin === 'ai'));
  const lead = await owner.post('/api/ai/messages', { text: 'Novo lead: Ana Lima, ana@exemplo.test, veio do Instagram' });
  const leadProposal = lead.data.proposals[0];
  assert.equal(leadProposal.type, 'lead.create');
  assert.ok(leadProposal.fields.some((field: { label: string; value: string }) => field.label === 'Origem' && field.value === 'Instagram'));
  await owner.post(`/api/ai/proposals/${leadProposal.id}/confirm`, { hash: leadProposal.hash });
  const leads = (await owner.get('/api/crm/leads')).data.items as Array<{ name: string; source: { id: string } | null }>;
  assert.ok(leads.some(item => item.name === 'Ana Lima' && item.source?.id === 'instagram'));
  const deal = await owner.post('/api/ai/messages', { text: 'Crie uma oportunidade de R$ 5.000 para Maria Souza' });
  const dealProposal = deal.data.proposals[0];
  assert.equal(dealProposal.type, 'opportunity.create');
  await owner.post(`/api/ai/proposals/${dealProposal.id}/confirm`, { hash: dealProposal.hash });
  const deals = (await owner.get('/api/crm/opportunities')).data.items as Array<{ title: string; valueCents: number; contact: { name: string } | null }>;
  assert.ok(deals.some(item => item.title === 'Maria Souza' && item.valueCents === 500000 && item.contact?.name === 'Maria Souza'), 'AI links the deal to the single matching contact');
  const campaigns = await owner.post('/api/ai/messages', { text: 'Analise minhas campanhas do Google Ads' });
  assert.match(campaigns.data.text, /não invento/);
  const viewer = await invite(owner, server, 'viewer', 'Leitora', 'leitora2@exemplo.test');
  assert.equal((await viewer.post('/api/ai/messages', { text: 'oi' })).status, 403, 'viewer has no ai:use');
  const member = await invite(owner, server, 'member', 'Membro', 'membro@exemplo.test');
  const rejected = await member.post('/api/ai/messages', { text: 'Crie uma tarefa para ligar para o fornecedor' });
  await member.post(`/api/ai/proposals/${rejected.data.proposals[0].id}/reject`);
  assert.equal((await member.post(`/api/ai/proposals/${rejected.data.proposals[0].id}/confirm`, { hash: rejected.data.proposals[0].hash })).status, 409);
  assert.equal((await member.post(`/api/ai/proposals/${proposal.id}/confirm`, { hash: proposal.hash })).status, 404, 'proposals belong to their author');
  const actions = (await owner.get('/api/audit?prefix=ai')).data.entries.map((entry: { action: string }) => entry.action);
  assert.ok(actions.includes('ai.proposal.created') && actions.includes('ai.proposal.executed') && actions.includes('ai.proposal.rejected'));
});

test('private files stay outside the Base, keep integrity and respect access', async t => {
  const { fixture, server, owner } = await hub(t);
  const bytes = Buffer.from('conteúdo privado sintético');
  const uploaded = await owner.call('POST', '/api/files/private', bytes, { 'Content-Type': 'text/plain', 'X-File-Name': encodeURIComponent('contrato sintético.txt') });
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.data));
  const stored = path.join(fixture.instanceDir, 'files', 'private', uploaded.data.id);
  assert.ok(fs.existsSync(stored));
  const download = await owner.get(`/api/files/private/${uploaded.data.id}`);
  assert.equal(Buffer.compare(download.data as Buffer, bytes), 0);
  assert.match(download.headers.get('content-disposition') ?? '', /attachment/);
  fs.writeFileSync(stored, 'adulterado');
  assert.equal((await owner.get(`/api/files/private/${uploaded.data.id}`)).status, 409);
  const member = await invite(owner, server, 'member', 'Membro', 'membro2@exemplo.test');
  assert.equal((await member.get(`/api/files/private/${uploaded.data.id}`)).status, 403);
  assert.equal((await member.get('/api/files')).data.private, null);
});

test('integrations show app credential presence to admins only, never values, and keep Base declarations visible', async t => {
  const { fixture, server, owner } = await hub(t);
  const secret = 'valor-secreto-sintetico-987';
  fileSecretStore(path.join(fixture.instanceDir, 'secrets')).set('GITHUB_OAUTH_CLIENT_ID', secret);
  const list = (await owner.get('/api/integrations')).data;
  const github = list.cards.find((item: { provider: string }) => item.provider === 'github');
  assert.equal(github.state, 'app-missing', 'client secret is still missing');
  assert.deepEqual(github.setup.appSecrets, [{ name: 'GITHUB_OAUTH_CLIENT_ID', configured: true }, { name: 'GITHUB_OAUTH_CLIENT_SECRET', configured: false }]);
  assert.deepEqual(github.declared.map((item: { id: string }) => item.id), ['github'], 'what the Base planned stays visible');
  const google = list.cards.find((item: { provider: string }) => item.provider === 'google');
  assert.deepEqual(google.declared.map((item: { id: string }) => item.id), ['google-ads']);
  const member = await invite(owner, server, 'member', 'Membro', 'membro3@exemplo.test');
  const memberView = (await member.get('/api/integrations')).data.cards.find((item: { provider: string }) => item.provider === 'github');
  assert.equal(memberView.setup, undefined);
  for (const route of ['/api/integrations', '/api/settings', '/api/overview', '/api/session']) {
    assert.ok(!JSON.stringify((await owner.get(route)).data).includes(secret), route);
  }
});
