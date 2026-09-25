import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaultCrmConfig } from '../packages/contract/workfoli-contract.mjs';
import { MIGRATIONS, openHubDatabase } from '../packages/hub/db.js';
import { readBaseManifest } from '../packages/instance/base.js';
import { hub, invite, tempDir, write } from './helpers.js';

type Timeline = Array<{ action: string | null; kind: string; entityType: string; body: string | null }>;

test('the funnel follows the Base: stage rules, lost reasons, won turns the contact into a customer, history records it all', async t => {
  const { owner } = await hub(t);
  const settings = (await owner.get('/api/crm/config')).data;
  assert.deepEqual(settings.config.pipelines[0].stages.map((stage: { id: string }) => stage.id), ['novo-lead', 'contato-realizado', 'qualificado', 'proposta', 'negociacao', 'ganho', 'perdido']);
  assert.equal(settings.labels.contact, 'Cliente', 'vocabulary comes from the Base');
  assert.equal(settings.moduleLabel, 'Clientes');
  assert.ok(settings.sources.some((source: { id: string; core: boolean }) => source.id === 'meta-ads' && source.core));

  const contact = (await owner.post('/api/crm/contacts', { name: 'Marina Costa', email: 'marina@exemplo.test', organizationName: 'Padaria Central', tags: ['VIP'] })).data;
  assert.equal(contact.organization.name, 'Padaria Central');
  assert.equal(contact.relationship, 'prospect');
  assert.deepEqual(contact.tags, ['VIP']);
  const again = await owner.post('/api/crm/contacts', { name: 'Outra', organizationName: 'padaria central' });
  assert.equal(again.data.organization.id, contact.organization.id, 'companies are reused by name, case-insensitive');

  const created = await owner.post('/api/crm/opportunities', { title: 'Site novo', contactId: contact.id });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const deal = created.data;
  assert.equal(deal.stageId, 'novo-lead');
  assert.equal(deal.organization.id, contact.organization.id, 'company inherited from the contact');
  assert.equal(deal.owner.name, 'Dona Sintética', 'creator becomes the owner by default');

  const blocked = await owner.post(`/api/crm/opportunities/${deal.id}/move`, { stageId: 'proposta' });
  assert.equal(blocked.status, 422);
  assert.equal(blocked.data.code, 'stage-requirements');
  assert.deepEqual(blocked.data.details.missing, ['Valor']);
  const moved = await owner.post(`/api/crm/opportunities/${deal.id}/move`, { stageId: 'proposta', patch: { value: 4500.5 } });
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.equal(moved.data.valueCents, 450050);
  assert.equal((await owner.patch(`/api/crm/opportunities/${deal.id}`, { value: null })).status, 422, 'editing cannot break the current stage rule');

  assert.equal((await owner.post(`/api/crm/opportunities/${deal.id}/move`, { stageId: 'perdido' })).status, 400, 'losing needs a reason');
  assert.equal((await owner.post(`/api/crm/opportunities/${deal.id}/move`, { stageId: 'perdido', lostReason: 'Motivo inventado' })).status, 400);
  const lost = await owner.post(`/api/crm/opportunities/${deal.id}/move`, { stageId: 'perdido', lostReason: 'Preço', lostNote: 'Pediu desconto' });
  assert.equal(lost.data.status, 'lost');
  assert.equal(lost.data.lostReason, 'Preço');
  assert.ok(lost.data.closedAt);
  const reopened = await owner.post(`/api/crm/opportunities/${deal.id}/move`, { stageId: 'negociacao' });
  assert.equal(reopened.data.status, 'open');
  assert.equal(reopened.data.lostReason, null);
  assert.equal(reopened.data.closedAt, null);
  const won = await owner.post(`/api/crm/opportunities/${deal.id}/move`, { stageId: 'ganho' });
  assert.equal(won.data.status, 'won');

  const detail = (await owner.get(`/api/crm/contacts/${contact.id}`)).data;
  assert.equal(detail.contact.relationship, 'customer', 'a won deal turns the prospect into a customer');
  const actions = (detail.timeline as Timeline).map(entry => entry.action);
  for (const action of ['created', 'relationship_changed', 'stage_changed', 'value_changed', 'status.lost', 'status.open', 'status.won']) assert.ok(actions.includes(action), action);

  const board = (await owner.get('/api/crm/board')).data;
  assert.equal(board.stages.find((stage: { id: string }) => stage.id === 'ganho').count, 1, 'recently won deals stay visible');
  assert.equal(board.totals.openCount, 0);
  const summary = (await owner.get('/api/crm/summary')).data;
  assert.equal(summary.won.count, 1);
  assert.equal(summary.won.valueCents, 450050);
  assert.equal(summary.calculated.winRate, 1);
});

test('leads: conversion links or creates contact, company and opportunity; duplicates are suggested, never merged silently', async t => {
  const { owner } = await hub(t);
  const existing = (await owner.post('/api/crm/contacts', { name: 'Carlos Lima', email: 'carlos@exemplo.test', phone: '(11) 98888-7777' })).data;
  const lead = (await owner.post('/api/crm/leads', {
    name: 'Carlos L.', email: 'CARLOS@exemplo.test', company: 'Oficina Lima', sourceId: 'google-ads',
    attribution: { provider: 'google', campaignName: 'Campanha sintética', gclid: 'abc123', unknownKey: 'descartado' },
  })).data;
  assert.equal(lead.status, 'new');
  assert.equal(lead.source.label, 'Google Ads');
  assert.deepEqual(lead.attribution, { provider: 'google', campaignName: 'Campanha sintética', gclid: 'abc123' });
  assert.equal((await owner.post('/api/crm/leads', { name: 'X', sourceId: 'origem-inventada' })).status, 400);
  const detail = (await owner.get(`/api/crm/leads/${lead.id}`)).data;
  assert.deepEqual(detail.matches, [{ id: existing.id, name: 'Carlos Lima' }]);
  assert.equal((await owner.get(`/api/crm/contacts/${existing.id}`)).data.contact.name, 'Carlos Lima', 'nothing is merged by itself');

  const converted = await owner.post(`/api/crm/leads/${lead.id}/convert`, { value: 1200 });
  assert.equal(converted.status, 200, JSON.stringify(converted.data));
  assert.equal(converted.data.contact.id, existing.id, 'same e-mail links to the existing contact');
  assert.equal(converted.data.contact.organization.name, 'Oficina Lima');
  assert.equal(converted.data.opportunity.title, 'Oficina Lima');
  assert.equal(converted.data.opportunity.source.id, 'google-ads');
  assert.equal(converted.data.opportunity.attribution.campaignName, 'Campanha sintética', 'attribution follows lead → opportunity');
  assert.equal(converted.data.lead.status, 'converted');
  assert.equal((await owner.post(`/api/crm/leads/${lead.id}/convert`, {})).status, 409);

  const other = (await owner.post('/api/crm/leads', { name: 'Paula Reis' })).data;
  assert.equal(other.source.id, 'manual');
  assert.equal((await owner.post(`/api/crm/leads/${other.id}/disqualify`, {})).status, 400, 'a reason is required');
  assert.equal((await owner.post(`/api/crm/leads/${other.id}/disqualify`, { reason: 'Fora do perfil' })).data.status, 'disqualified');
  assert.equal((await owner.patch(`/api/crm/leads/${other.id}`, { status: 'new' })).status, 409);
  assert.equal((await owner.post(`/api/crm/leads/${other.id}/reopen`)).data.status, 'working');
  const plain = await owner.post(`/api/crm/leads/${other.id}/convert`, { createOpportunity: false });
  assert.equal(plain.data.opportunity, null);
  assert.equal(plain.data.contact.name, 'Paula Reis');
  assert.equal((await owner.get('/api/crm/leads?status=active')).data.items.length, 0);
  const summary = (await owner.get('/api/crm/summary')).data;
  assert.equal(summary.leads.total, 2);
  assert.equal(summary.leads.converted, 2);
  assert.equal(summary.calculated.leadConversionRate, 1);
});

test('CRM configuration lives in the Base: validated, saved to the manifest, and stages in use cannot be removed', async t => {
  const { fixture, server, owner } = await hub(t);
  const base = defaultCrmConfig();
  const invalid = await owner.call('PUT', '/api/crm/config', { crm: { ...base, pipelines: [{ id: 'x', name: 'X', stages: [{ id: 'a', name: 'A', kind: 'open' }, { id: 'b', name: 'B', kind: 'won' }, { id: 'c', name: 'C', kind: 'won' }] }] } });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.data.code, 'invalid-config');

  const deal = (await owner.post('/api/crm/opportunities', { title: 'Em qualificação', stageId: 'qualificado' })).data;
  const withoutStage = structuredClone(base);
  withoutStage.pipelines[0]!.stages = withoutStage.pipelines[0]!.stages.filter(stage => stage.id !== 'qualificado');
  const refused = await owner.call('PUT', '/api/crm/config', { crm: withoutStage });
  assert.equal(refused.status, 409);
  assert.equal(refused.data.code, 'stages-in-use');
  assert.match(refused.data.error, /Qualificado \(Funil de vendas\): 1/);

  const next = structuredClone(base);
  next.labels = { contact: 'Cliente', contacts: 'Clientes' };
  next.customFields = [{ id: 'servico', entity: 'opportunity', label: 'Serviço de interesse', type: 'select', options: ['Site', 'Sistema'], required: false }];
  next.pipelines[0]!.stages.find(stage => stage.id === 'proposta')!.requiredFields = ['value', 'custom.servico'];
  next.pipelines[0]!.stages.find(stage => stage.id === 'qualificado')!.name = 'Diagnóstico';
  next.sources = [{ id: 'feira', label: 'Feira do setor', kind: 'event' }];
  const saved = await owner.call('PUT', '/api/crm/config', { crm: next });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.status, 'applied');
  const manifest = readBaseManifest(fixture.baseDir).manifest;
  assert.equal(manifest.crm!.customFields[0]!.label, 'Serviço de interesse', 'configuration is versioned with the Base');
  assert.equal(manifest.crm!.pipelines[0]!.stages[2]!.name, 'Diagnóstico');
  assert.equal(fs.readFileSync(path.join(fixture.baseDir, 'workfoli.base.json'), 'utf8').includes(deal.id), false, 'live data never goes to the Base');
  server.runtime.base.invalidate();

  assert.equal((await owner.post('/api/crm/opportunities', { title: 'X', custom: { servico: 'Foguete' } })).status, 400);
  assert.equal((await owner.post('/api/crm/opportunities', { title: 'X', custom: { cpf: '123' } })).status, 400, 'unknown custom fields are refused');
  const blocked = await owner.post(`/api/crm/opportunities/${deal.id}/move`, { stageId: 'proposta', patch: { value: 900 } });
  assert.equal(blocked.status, 422);
  assert.deepEqual(blocked.data.details.missing, ['Serviço de interesse']);
  assert.equal((await owner.get(`/api/crm/opportunities/${deal.id}`)).data.opportunity.valueCents, null, 'a refused move rolls back its patch');
  const moved = await owner.post(`/api/crm/opportunities/${deal.id}/move`, { stageId: 'proposta', patch: { value: 900, custom: { servico: 'Site' } } });
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.equal((await owner.post('/api/crm/leads', { name: 'Visitante', sourceId: 'feira' })).data.source.label, 'Feira do setor');

  const member = await invite(owner, server, 'member', 'Membro', 'membro@exemplo.test');
  assert.equal((await member.post('/api/crm/leads', { name: 'Lead da equipe' })).status, 200);
  assert.equal((await member.call('PUT', '/api/crm/config', { crm: next })).status, 403, 'only crm:admin changes the structure');
  const viewer = await invite(owner, server, 'viewer', 'Leitora', 'leitora@exemplo.test');
  assert.equal((await viewer.get('/api/crm/board')).status, 200);
  assert.equal((await viewer.post('/api/crm/contacts', { name: 'Tentativa' })).status, 403);

  const off = await owner.call('PUT', '/api/crm/config', { crm: { ...next, enabled: false } });
  assert.equal(off.status, 200, JSON.stringify(off.data));
  const disabled = readBaseManifest(fixture.baseDir).manifest;
  assert.ok(!disabled.modules.enabled.includes('crm'), 'crm.enabled and modules.enabled stay coherent');
  server.runtime.base.invalidate();
  const modules = (await owner.get('/api/session')).data.modules.active.map((module: { id: string }) => module.id);
  assert.ok(!modules.includes('crm'));
});

test('automations declared in the Base create tasks and tags in the same transaction', async t => {
  const { server, owner } = await hub(t);
  const config = defaultCrmConfig();
  config.automations = [
    { id: 'responder', name: 'Responder lead', enabled: true, when: { event: 'lead_created' }, actions: [{ type: 'create_task', title: 'Responder {nome}', dueInDays: 0, assignTo: 'owner' }] },
    { id: 'proposta', name: 'Acompanhar proposta', enabled: true, when: { event: 'stage_entered', pipeline: 'vendas', stage: 'proposta' }, actions: [{ type: 'add_tag', tag: 'proposta-enviada' }, { type: 'create_task', title: 'Cobrar retorno de {nome}', dueInDays: 3, assignTo: 'owner' }] },
    { id: 'pos-venda', name: 'Pós-venda', enabled: true, when: { event: 'deal_won' }, actions: [{ type: 'create_task', title: 'Iniciar projeto {nome}', dueInDays: 1, assignTo: 'none' }] },
    { id: 'desligada', name: 'Desligada', enabled: false, when: { event: 'lead_created' }, actions: [{ type: 'add_tag', tag: 'nunca' }] },
  ];
  assert.equal((await owner.call('PUT', '/api/crm/config', { crm: config })).status, 200);
  server.runtime.base.invalidate();
  const lead = (await owner.post('/api/crm/leads', { name: 'Rita Alves' })).data;
  const leadTasks = (await owner.get(`/api/tasks?relatedType=lead&relatedId=${lead.id}`)).data.tasks;
  assert.equal(leadTasks.length, 1);
  assert.equal(leadTasks[0].title, 'Responder Rita Alves');
  assert.equal(leadTasks[0].assignee.name, 'Dona Sintética');
  assert.equal(leadTasks[0].related.label, 'Rita Alves');
  assert.deepEqual(lead.tags, [], 'disabled automations never run');
  const deal = (await owner.post('/api/crm/opportunities', { title: 'Loja Sintética', value: 300 })).data;
  const moved = (await owner.post(`/api/crm/opportunities/${deal.id}/move`, { stageId: 'proposta' })).data;
  assert.deepEqual(moved.tags, ['proposta-enviada']);
  await owner.post(`/api/crm/opportunities/${deal.id}/move`, { stageId: 'ganho' });
  const titles = (await owner.get(`/api/tasks?relatedType=opportunity&relatedId=${deal.id}`)).data.tasks.map((task: { title: string }) => task.title).sort();
  assert.deepEqual(titles, ['Cobrar retorno de Loja Sintética', 'Iniciar projeto Loja Sintética']);
  const timeline = (await owner.get(`/api/crm/opportunities/${deal.id}`)).data.timeline as Timeline;
  assert.ok(timeline.some(entry => entry.action === 'automation.tag'));
  assert.ok(timeline.some(entry => entry.action === 'automation.task'));
});

test('activities, linked tasks and attachments build the record history; unsafe input is refused', async t => {
  const { fixture, server, owner } = await hub(t);
  const contact = (await owner.post('/api/crm/contacts', { name: 'Bruno Dias' })).data;
  const call = await owner.post(`/api/crm/contacts/${contact.id}/activities`, { kind: 'call', body: 'Ligação: pediu orçamento.' });
  assert.equal(call.status, 200);
  assert.equal(call.data.timeline[0].kind, 'call');
  assert.equal((await owner.post(`/api/crm/contacts/${contact.id}/activities`, { kind: 'history', body: 'forjado' })).status, 400, 'history entries are system-only');
  assert.equal((await owner.post(`/api/crm/contacts/${contact.id}/activities`, { kind: 'note', body: `chave ${['ghp', '_', 'B'.repeat(36)].join('')}` })).status, 400);
  const task = await owner.post('/api/tasks', { title: 'Enviar orçamento', relatedType: 'contact', relatedId: contact.id });
  assert.equal(task.data.related.label, 'Bruno Dias');
  assert.equal((await owner.post('/api/tasks', { title: 'x', relatedType: 'contact', relatedId: 'inexistente' })).status, 400);
  assert.equal((await owner.post(`/api/crm/contacts/${contact.id}/attachments`, { kind: 'url', ref: 'https://user:pass@exemplo.test/doc' })).status, 400);
  assert.equal((await owner.post(`/api/crm/contacts/${contact.id}/attachments`, { kind: 'url', ref: 'https://exemplo.test/proposta?token=abc' })).status, 400);
  const linked = await owner.post(`/api/crm/contacts/${contact.id}/attachments`, { kind: 'url', ref: 'https://exemplo.test/proposta.pdf', label: 'Proposta' });
  assert.equal(linked.data.attachments.length, 1);
  write(fixture.baseDir, 'dados/planilha.csv', 'nome\nFulano\n');
  server.runtime.base.invalidate();
  assert.equal((await owner.post(`/api/crm/contacts/${contact.id}/attachments`, { kind: 'base-file', ref: 'dados/planilha.csv' })).status, 400, 'private Base folders are never linked');
  assert.equal((await owner.post(`/api/crm/contacts/${contact.id}/attachments`, { kind: 'base-file', ref: 'processos/README.md' })).status, 200);
  const member = await invite(owner, server, 'member', 'Membro', 'membro2@exemplo.test');
  assert.equal((await member.post(`/api/crm/contacts/${contact.id}/attachments`, { kind: 'private-file', ref: '00000000-0000-4000-8000-000000000000' })).status, 403);
  const detail = (await owner.get(`/api/crm/contacts/${contact.id}`)).data;
  assert.equal(detail.tasks.length, 1);
  assert.equal(detail.attachments.length, 2);
  const actions = (detail.timeline as Timeline).map(entry => entry.action);
  assert.ok(actions.includes('task_created') && actions.includes('attachment_added') && actions.includes('call'));
});

test('archive keeps data; permanent deletion (LGPD) needs crm:admin, explicit confirmation and leaves no personal data behind', async t => {
  const { server, owner } = await hub(t);
  const contact = (await owner.post('/api/crm/contacts', { name: 'Titular Sintético', email: 'titular@exemplo.test', tags: ['lgpd'] })).data;
  const deal = (await owner.post('/api/crm/opportunities', { title: 'Contrato anual', contactId: contact.id })).data;
  await owner.post(`/api/crm/contacts/${contact.id}/activities`, { kind: 'note', body: 'Conversa sobre o contrato.' });
  assert.equal((await owner.post(`/api/crm/contacts/${contact.id}/archive`)).status, 200);
  assert.equal((await owner.get('/api/crm/contacts')).data.items.length, 0);
  assert.equal((await owner.get('/api/crm/contacts?archived=1')).data.items.length, 1);
  await owner.post(`/api/crm/contacts/${contact.id}/restore`);
  assert.equal((await owner.get('/api/crm/contacts')).data.items.length, 1);

  const member = await invite(owner, server, 'member', 'Membro', 'membro3@exemplo.test');
  assert.equal((await member.call('DELETE', `/api/crm/contacts/${contact.id}`, { confirm: 'EXCLUIR' })).status, 403);
  assert.equal((await owner.call('DELETE', `/api/crm/contacts/${contact.id}`, {})).status, 400);
  assert.equal((await owner.call('DELETE', `/api/crm/opportunities/${deal.id}`, { confirm: 'EXCLUIR' })).status, 400, 'deals are archived, not deleted');
  assert.equal((await owner.call('DELETE', `/api/crm/contacts/${contact.id}`, { confirm: 'EXCLUIR' })).status, 200);
  assert.equal((await owner.get(`/api/crm/contacts/${contact.id}`)).status, 404);
  const kept = (await owner.get(`/api/crm/opportunities/${deal.id}`)).data;
  assert.equal(kept.opportunity.contact, null);
  assert.ok((kept.timeline as Timeline).some(entry => entry.action === 'contact_purged'));
  const db = server.runtime.db;
  const traces = db.prepare("SELECT (SELECT COUNT(*) FROM crm_activities WHERE entity_type='contact' AND entity_id=?) + (SELECT COUNT(*) FROM crm_entity_tags WHERE entity_type='contact' AND entity_id=?) AS n").get(contact.id, contact.id) as { n: number };
  assert.equal(traces.n, 0);
  const leaked = db.prepare("SELECT COUNT(*) AS n FROM audit WHERE detail LIKE '%titular%' OR target LIKE '%Titular%'").get() as { n: number };
  assert.equal(leaked.n, 0, 'the audit trail keeps no personal data of the removed contact');
});

test('the board lists deals whose stage left the Base so they can be moved; manager access is granted only by the owner', async t => {
  const { fixture, server, owner } = await hub(t);
  const deal = (await owner.post('/api/crm/opportunities', { title: 'Etapa renomeada', stageId: 'contato-realizado' })).data;
  const file = path.join(fixture.baseDir, 'workfoli.base.json');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('"contato-realizado"', '"primeiro-contato"'));
  server.runtime.base.invalidate();
  const board = (await owner.get('/api/crm/board')).data;
  assert.deepEqual(board.orphans.map((item: { id: string }) => item.id), [deal.id]);
  assert.equal((await owner.post(`/api/crm/opportunities/${deal.id}/move`, { stageId: 'primeiro-contato' })).data.stage.name, 'Contato realizado');

  const admin = await invite(owner, server, 'admin', 'Admin', 'admin@exemplo.test');
  assert.equal((await admin.post('/api/users', { name: 'Gestor', roleId: 'manager' })).status, 403, 'admins cannot grant Workfoli access');
  const manager = await invite(owner, server, 'manager', 'Gestor Workfoli', 'gestor@workfoli.test');
  assert.equal((await manager.call('PUT', '/api/crm/config', { crm: defaultCrmConfig() })).status, 409, 'the renamed stage is in use, so the old default cannot replace it');
  const current = (await manager.get('/api/crm/config')).data.config;
  assert.equal((await manager.call('PUT', '/api/crm/config', { crm: { ...current, lostReasons: [...current.lostReasons, 'Mudou de ideia'] } })).status, 200, 'manager configures the CRM');
  assert.equal((await manager.get('/api/users')).status, 403, 'manager does not administer users');
  const users = (await owner.get('/api/users')).data.users as Array<{ id: string; roleId: string }>;
  const managerId = users.find(user => user.roleId === 'manager')!.id;
  assert.equal((await admin.patch(`/api/users/${managerId}`, { status: 'disabled' })).status, 403, 'only the owner revokes it');
  assert.equal((await owner.patch(`/api/users/${managerId}`, { status: 'disabled' })).status, 200);
});

test('database v1 → v2 migration keeps every legacy contact, with backup, history and funnel position', t => {
  const dir = tempDir(t);
  const file = path.join(dir, 'hub.sqlite');
  const legacy = new DatabaseSync(file);
  legacy.exec(MIGRATIONS[0]!.sql);
  legacy.exec('PRAGMA user_version = 1');
  const at = '2026-01-10T12:00:00.000Z';
  const insert = legacy.prepare('INSERT INTO contacts(id,name,kind,email,phone,organization,stage,notes,owner_id,created_by,created_at,updated_at,source) VALUES (?,?,?,?,?,?,?,?,NULL,NULL,?,?,?)');
  insert.run('c1', 'Ana Antiga', 'client', 'ana@exemplo.test', null, 'Loja Um', 'Proposta', 'Cliente fiel', at, at, 'hub');
  insert.run('c2', 'Beto Antigo', 'lead', null, '(11) 90000-0000', 'loja um', null, null, at, at, 'ai');
  insert.run('c3', 'Caio Antigo', 'partner', null, null, null, 'Cliente ativo', null, at, at, 'hub');
  legacy.close();

  const db = openHubDatabase(file);
  try {
    assert.equal(Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version), 2);
    assert.equal(Number((db.prepare('SELECT COUNT(*) AS n FROM legacy_contacts_v1').get() as { n: number }).n), 3, 'the original table is kept');
    const contacts = db.prepare('SELECT id, relationship, organization_id, origin FROM crm_contacts ORDER BY id').all() as Array<{ id: string; relationship: string; organization_id: string | null; origin: string }>;
    assert.deepEqual(contacts.map(row => [row.id, row.relationship, row.origin]), [['c1', 'customer', 'hub'], ['c2', 'prospect', 'ai'], ['c3', 'partner', 'hub']]);
    assert.equal(contacts[0]!.organization_id, contacts[1]!.organization_id, 'companies are deduplicated case-insensitively');
    const deals = db.prepare('SELECT contact_id, pipeline_id, stage_id, status FROM crm_opportunities ORDER BY contact_id').all() as Array<Record<string, string>>;
    assert.deepEqual(deals.map(row => [row.contact_id, row.pipeline_id, row.stage_id, row.status]), [['c1', 'vendas', 'proposta', 'open'], ['c3', 'vendas', 'cliente-ativo', 'open']]);
    assert.equal(Number((db.prepare("SELECT COUNT(*) AS n FROM crm_activities WHERE action='migrated'").get() as { n: number }).n), 5);
  } finally { db.close(); }
  assert.ok(fs.readdirSync(path.join(dir, 'backups')).some(name => name.startsWith('hub-v1-')), 'a copy is taken before migrating');

  const fresh = openHubDatabase(path.join(dir, 'novo.sqlite'), { create: true });
  try {
    assert.equal(fresh.prepare("SELECT name FROM sqlite_master WHERE name IN ('contacts','legacy_contacts_v1')").get(), undefined, 'new installs carry no legacy table');
  } finally { fresh.close(); }
});
