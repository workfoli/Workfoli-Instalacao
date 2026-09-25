import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { agentCycle, pairAgent } from '../packages/agent/agent.js';
import { readBaseManifest, writeBaseManifest } from '../packages/instance/base.js';
import { startHubServer } from '../packages/hub/server.js';
import { Client, makeInstance, write } from './helpers.js';

async function remoteHub(t: TestContext) {
  const fixture = makeInstance(t, { mode: 'remote' });
  const server = await startHubServer({ instanceDir: fixture.instanceDir, port: 0, quiet: true, webDir: path.join(fixture.root, 'sem-build') });
  t.after(() => server.close());
  const owner = new Client(server.url);
  assert.equal((await owner.post('/api/auth/activate', { token: fixture.activationToken, email: 'dona@exemplo.test', password: 'senha-sintetica-forte' })).status, 200);
  return { fixture, server, owner };
}

async function pair(owner: Client, fixture: { instanceDir: string }, url: string) {
  const { data } = await owner.post('/api/settings/pairing', { name: 'Notebook sintético' });
  return pairAgent({ instanceDir: fixture.instanceDir, hubUrl: url, code: data.code });
}

test('remote Hub waits for the Local Agent and receives only the permitted snapshot', async t => {
  const { fixture, server, owner } = await remoteHub(t);
  const before = await owner.get('/api/overview');
  assert.equal(before.data.base.available, false);
  assert.match(before.data.base.message, /Aguardando/);
  write(fixture.baseDir, 'processos/acesso.md', `# Acesso\n\napi_key = ${'Z9'.repeat(12)}\n`);
  const device = await pair(owner, fixture, server.url);
  assert.ok(fs.existsSync(path.join(fixture.instanceDir, 'secrets', 'agent.json')));
  const cycle = await agentCycle({ instanceDir: fixture.instanceDir });
  assert.equal(cycle.snapshot.changed, true);
  const docs = (await owner.get('/api/knowledge')).data.documents as Array<{ path: string }>;
  assert.ok(docs.some(doc => doc.path === '_memoria/empresa.md'));
  assert.ok(!docs.some(doc => doc.path === 'processos/acesso.md'));
  const stored = server.runtime.db.prepare("SELECT restricted, content FROM snapshot_files WHERE path='processos/acesso.md'").get() as { restricted: number; content: string | null };
  assert.equal(stored.restricted, 1);
  assert.equal(stored.content, null, 'restricted content never leaves the machine');
  assert.equal((await agentCycle({ instanceDir: fixture.instanceDir })).snapshot.changed, false, 'unchanged Base is not re-sent as new');
  const settings = await owner.get('/api/settings');
  assert.ok(settings.data.devices.some((item: { id: string }) => item.id === device.deviceId));
});

test('Hub changes become durable commands applied by the Agent with revision checks', async t => {
  const { fixture, server, owner } = await remoteHub(t);
  await pair(owner, fixture, server.url);
  await agentCycle({ instanceDir: fixture.instanceDir });
  const queued = await owner.post('/api/projects', { name: 'Site institucional', type: 'website' });
  assert.equal(queued.data.status, 'queued');
  assert.ok(!fs.existsSync(path.join(fixture.baseDir, 'projetos', 'site-institucional')), 'nothing is written before the Agent applies');
  assert.equal((await owner.get('/api/projects')).data.pending.length, 1);
  const cycle = await agentCycle({ instanceDir: fixture.instanceDir });
  assert.equal(cycle.applied, 1);
  assert.ok(fs.existsSync(path.join(fixture.baseDir, 'projetos', 'site-institucional', 'README.md')));
  const projects = await owner.get('/api/projects');
  assert.ok(projects.data.projects.some((item: { id: string }) => item.id === 'site-institucional'));
  assert.equal(projects.data.pending.length, 0);
  // Edição concorrente na Base: o comando antigo é recusado em vez de sobrescrever.
  const conflict = await owner.post('/api/projects', { name: 'Campanha de outubro', type: 'campaign' });
  assert.equal(conflict.data.status, 'queued');
  const loaded = readBaseManifest(fixture.baseDir);
  writeBaseManifest(fixture.baseDir, { ...loaded.manifest, company: { ...loaded.manifest.company, tagline: 'Editado no computador' } });
  const second = await agentCycle({ instanceDir: fixture.instanceDir });
  assert.equal(second.failed, 1);
  assert.ok(!fs.existsSync(path.join(fixture.baseDir, 'projetos', 'campanha-de-outubro')));
  const audit = (await owner.get('/api/audit?prefix=base.command')).data.entries.map((entry: { action: string }) => entry.action);
  assert.ok(audit.includes('base.command-applied') && audit.includes('base.command-failed'));
});

test('CRM configuration edited in a remote Hub is queued and applied to the Base by the Agent', async t => {
  const { fixture, server, owner } = await remoteHub(t);
  await pair(owner, fixture, server.url);
  await agentCycle({ instanceDir: fixture.instanceDir });
  const current = (await owner.get('/api/crm/config')).data.config;
  const queued = await owner.call('PUT', '/api/crm/config', { crm: { ...current, lostReasons: [...current.lostReasons, 'Mudou de ideia'] } });
  assert.equal(queued.data.status, 'queued', JSON.stringify(queued.data));
  assert.ok(!readBaseManifest(fixture.baseDir).manifest.crm!.lostReasons.includes('Mudou de ideia'), 'nothing is written before the Agent applies');
  assert.equal((await agentCycle({ instanceDir: fixture.instanceDir })).applied, 1);
  assert.ok(readBaseManifest(fixture.baseDir).manifest.crm!.lostReasons.includes('Mudou de ideia'), 'the Agent wrote it to the Base');
  await agentCycle({ instanceDir: fixture.instanceDir });
  assert.ok((await owner.get('/api/crm/config')).data.config.lostReasons.includes('Mudou de ideia'), 'the new snapshot reaches the Hub');
  // Quem edita a Base no computador no meio do caminho vence: a alteração antiga é recusada, não sobrescreve.
  const stale = await owner.call('PUT', '/api/crm/config', { crm: { ...current, currency: 'USD' } });
  assert.equal(stale.data.status, 'queued');
  const loaded = readBaseManifest(fixture.baseDir);
  writeBaseManifest(fixture.baseDir, { ...loaded.manifest, company: { ...loaded.manifest.company, tagline: 'Editado no computador' } });
  assert.equal((await agentCycle({ instanceDir: fixture.instanceDir })).failed, 1);
  assert.equal(readBaseManifest(fixture.baseDir).manifest.crm!.currency, 'BRL');
});

test('a lost receipt never turns an applied change into a failure or a duplicate', async t => {
  const { fixture, server, owner } = await remoteHub(t);
  await pair(owner, fixture, server.url);
  await agentCycle({ instanceDir: fixture.instanceDir });
  await owner.post('/api/knowledge/notes', { title: 'Nota única', body: 'Aplicada uma vez só.' });
  // Simula a queda de rede exatamente no envio do recibo "applied".
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes('/receipt') && typeof init?.body === 'string' && init.body.includes('"applied"')) throw new TypeError('fetch failed');
    return realFetch(input, init);
  }) as typeof fetch;
  try { await assert.rejects(agentCycle({ instanceDir: fixture.instanceDir }), /Sem resposta do Hub/); }
  finally { globalThis.fetch = realFetch; }
  const notes = () => fs.readdirSync(path.join(fixture.baseDir, 'conhecimento', 'notas'));
  assert.equal(notes().length, 1);
  const retry = await agentCycle({ instanceDir: fixture.instanceDir });
  assert.equal(retry.failed, 0);
  assert.equal(notes().length, 1, 'the note is not written twice');
  const status = server.runtime.db.prepare("SELECT status FROM base_commands WHERE type='knowledge.note'").get() as { status: string };
  assert.equal(status.status, 'applied');
});

test('an unreachable Hub is reported clearly and queued changes wait for it', async t => {
  const { fixture, server, owner } = await remoteHub(t);
  await pair(owner, fixture, server.url);
  await agentCycle({ instanceDir: fixture.instanceDir });
  await owner.post('/api/knowledge/notes', { title: 'Nota na fila', body: 'Espera o computador da Base.' });
  // Hub inacessível (porta sem ninguém ouvindo): mensagem clara, nada aplicado, nada perdido.
  await assert.rejects(agentCycle({ instanceDir: fixture.instanceDir, hubUrl: 'http://127.0.0.1:9' }), /Sem resposta do Hub em http:\/\/127\.0\.0\.1:9/);
  assert.ok(!fs.existsSync(path.join(fixture.baseDir, 'conhecimento', 'notas')));
  assert.equal((server.runtime.db.prepare('SELECT status FROM base_commands').get() as { status: string }).status, 'queued');
  assert.equal((await agentCycle({ instanceDir: fixture.instanceDir })).applied, 1, 'applied as soon as the Hub is reachable again');
});

test('pairing codes are single use, devices can be revoked and never cross instances', async t => {
  const { fixture, server, owner } = await remoteHub(t);
  const { data } = await owner.post('/api/settings/pairing', {});
  await pairAgent({ instanceDir: fixture.instanceDir, hubUrl: server.url, code: data.code });
  await assert.rejects(pairAgent({ instanceDir: fixture.instanceDir, hubUrl: server.url, code: data.code }), /inválido ou expirado/);
  const device = (await owner.get('/api/settings')).data.devices[0];
  assert.equal((await owner.post(`/api/devices/${device.id}/revoke`)).status, 200);
  await assert.rejects(agentCycle({ instanceDir: fixture.instanceDir }), /Dispositivo não pareado ou revogado/);
  // Outra empresa: o Agent recusa guardar credencial de um Hub que não é o da sua instância.
  const other = await remoteHub(t);
  const code = (await other.owner.post('/api/settings/pairing', {})).data.code;
  fs.rmSync(path.join(fixture.instanceDir, 'secrets', 'agent.json'));
  await assert.rejects(pairAgent({ instanceDir: fixture.instanceDir, hubUrl: other.server.url, code }), /outra instância/);
  assert.ok(!fs.existsSync(path.join(fixture.instanceDir, 'secrets', 'agent.json')));
  await assert.rejects(pairAgent({ instanceDir: fixture.instanceDir, hubUrl: 'http://exemplo.test', code: 'x'.repeat(43) }), /HTTPS/);
});

test('a local-mode Hub refuses snapshots: the disk is its only source', async t => {
  const fixture = makeInstance(t);
  const server = await startHubServer({ instanceDir: fixture.instanceDir, port: 0, quiet: true, webDir: path.join(fixture.root, 'sem-build') });
  t.after(() => server.close());
  const owner = new Client(server.url);
  await owner.post('/api/auth/activate', { token: fixture.activationToken, email: 'dona@exemplo.test', password: 'senha-sintetica-forte' });
  await pair(owner, fixture, server.url);
  await assert.rejects(agentCycle({ instanceDir: fixture.instanceDir }), /modo local/);
});
