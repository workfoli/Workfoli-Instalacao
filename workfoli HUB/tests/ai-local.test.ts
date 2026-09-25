import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractAmount, extractDueDate, localProvider } from '../packages/hub/ai/local-provider.js';
import type { AiContext } from '../packages/hub/ai/provider.js';

function context(overrides: Partial<AiContext> = {}): AiContext {
  return {
    company: { name: 'Empresa Sintética', tagline: 'Organização que funciona.', description: 'Descrição sintética.', services: ['Serviço A', 'Serviço B'] },
    user: { name: 'Dona Sintética', role: 'owner' },
    projects: [{ id: 'site', name: 'Site institucional', type: 'website', status: 'active' }],
    tasks: { open: 1, doing: 0, items: [{ title: 'Revisar proposta', dueDate: '2026-10-01', status: 'open' }] },
    baseTasks: ['Revisar a memória (Agora)'],
    crm: {
      pipeline: 'Funil de vendas', openOpportunities: 3, byStage: { 'Novo lead': 2, Proposta: 1 }, stages: ['Novo lead', 'Proposta', 'Ganho', 'Perdido'], leadsOpen: 4, contacts: 7,
      labels: { contact: 'Cliente', contacts: 'Clientes', lead: 'Lead', leads: 'Leads', opportunity: 'Oportunidade', opportunities: 'Oportunidades' },
      sources: [{ id: 'instagram', label: 'Instagram' }, { id: 'google-ads', label: 'Google Ads' }, { id: 'indicacao', label: 'Indicação' }, { id: 'feira-anual', label: 'Feira anual' }],
    },
    knowledge: ['Empresa'], integrations: [{ provider: 'google-ads', label: 'Google Ads', state: 'planned' }],
    modules: { active: ['overview', 'tasks', 'crm', 'projects', 'ai'], planned: ['calendar'], custom: [] },
    actions: ['task.create', 'contact.create', 'lead.create', 'opportunity.create', 'project.create', 'note.create'],
    today: '2026-09-23',
    ...overrides,
  };
}

const ask = (text: string, overrides: Partial<AiContext> = {}) => localProvider.respond({ text, context: context(overrides) });

test('due dates in Portuguese resolve relative to today (2026-09-23 is a Wednesday)', () => {
  const today = new Date('2026-09-23T12:00:00');
  assert.deepEqual(extractDueDate('revisar o site até amanhã', today), { dueDate: '2026-09-24', rest: 'revisar o site' });
  assert.equal(extractDueDate('ligar para o cliente sexta', today).dueDate, '2026-09-25');
  assert.equal(extractDueDate('enviar relatório até 30/09', today).dueDate, '2026-09-30');
  assert.equal(extractDueDate('renovar domínio 05/01', today).dueDate, '2027-01-05', 'past day/month rolls to next year');
  assert.equal(extractDueDate('fechar orçamento em 3 dias', today).dueDate, '2026-09-26');
  assert.equal(extractDueDate('publicar hoje', today).dueDate, '2026-09-23');
  assert.equal(extractDueDate('sem prazo definido', today).dueDate, null);
  assert.equal(extractDueDate('data inválida 31/02', today).dueDate, null);
});

test('operational requests become typed drafts, never direct changes', async () => {
  const task = await ask('Crie uma tarefa para revisar o site até amanhã');
  assert.deepEqual(task.drafts, [{ type: 'task.create', payload: { title: 'Revisar o site', dueDate: '2026-09-24' } }]);
  const note = await ask('Anota: ligar para o fornecedor sexta');
  assert.equal(note.drafts[0]?.type, 'task.create');
  assert.equal((note.drafts[0]?.payload as { dueDate: string }).dueDate, '2026-09-25');
  const contact = await ask('Cadastre João Pereira como novo cliente interessado em um novo site, joao@exemplo.test, (11) 98888-7777');
  assert.equal(contact.drafts[0]?.type, 'contact.create');
  const payload = contact.drafts[0]!.payload as Record<string, string>;
  assert.equal(payload.name, 'João Pereira');
  assert.equal(payload.relationship, 'customer');
  assert.equal(payload.email, 'joao@exemplo.test');
  assert.ok(payload.phone?.includes('98888'));
  const project = await ask('Quero uma nova landing page para o serviço de consultoria');
  assert.equal(project.drafts[0]?.type, 'project.create');
  assert.equal((project.drafts[0]!.payload as { type: string }).type, 'landing-page');
  const registered = await ask('Registre na Base: decidimos atender somente empresas com contrato mensal.');
  assert.equal(registered.drafts[0]?.type, 'note.create');
});

test('CRM requests: leads with their origin, opportunities with value, contacts with relationship', async () => {
  const lead = await ask('Novo lead: Ana Lima, ana@exemplo.test, (21) 97777-6666, veio do Instagram interessada em identidade visual');
  assert.equal(lead.drafts[0]?.type, 'lead.create');
  const payload = lead.drafts[0]!.payload as Record<string, string | null>;
  assert.equal(payload.name, 'Ana Lima');
  assert.equal(payload.email, 'ana@exemplo.test');
  assert.equal(payload.sourceId, 'instagram');
  assert.equal(payload.message, 'Interesse: identidade visual');
  const custom = await ask('Cadastre o lead Pedro Alves, conheceu na Feira anual');
  assert.equal((custom.drafts[0]!.payload as { sourceId: string }).sourceId, 'feira-anual', 'custom sources from the Base are recognized');
  const unknownSource = await ask('Novo lead: Bruno Dias');
  assert.equal((unknownSource.drafts[0]!.payload as { sourceId: string | null }).sourceId, null, 'no origin is invented');
  const deal = await ask('Crie uma oportunidade de R$ 12.500,50 para a Padaria Central');
  assert.deepEqual(deal.drafts[0], { type: 'opportunity.create', payload: { title: 'Padaria Central', value: 12500.5, contactName: 'Padaria Central' } });
  const short = await ask('Nova oportunidade: Site institucional, 8 mil');
  assert.equal((short.drafts[0]!.payload as { value: number }).value, 8000);
  assert.equal((short.drafts[0]!.payload as { title: string }).title, 'Site institucional');
  const partner = await ask('Cadastre o parceiro Gráfica Norte');
  assert.equal((partner.drafts[0]!.payload as { relationship: string }).relationship, 'partner');
  assert.deepEqual(extractAmount('valor de 3,5 mil'), { value: 3500, rest: 'valor de  ' });
  const funnel = await ask('Como está o funil?');
  assert.match(funnel.reply, /3 oportunidades em aberto/);
  assert.match(funnel.reply, /Novo lead: 2/);
  const leads = await ask('Quantos leads temos?');
  assert.match(leads.reply, /4 leads/);
  const noCrm = await ask('Como está o funil?', { crm: null });
  assert.match(noCrm.reply, /não inclui o CRM/);
});

test('answers use only the authorized context and never invent data', async () => {
  const pending = await ask('O que está pendente?');
  assert.match(pending.reply, /Revisar proposta/);
  assert.match(pending.reply, /Revisar a memória/);
  const hidden = await ask('O que está pendente?', { tasks: null, baseTasks: null });
  assert.match(hidden.reply, /não inclui/);
  const company = await ask('Resuma a empresa');
  assert.match(company.reply, /Empresa Sintética/);
  assert.match(company.reply, /Serviço B/);
  const campaigns = await ask('Analise minhas campanhas de Google Ads');
  assert.match(campaigns.reply, /não invento/);
  assert.equal(campaigns.drafts[0]?.type, 'task.create');
  const unknown = await ask('Qual a cotação do dólar amanhã?');
  assert.equal(unknown.drafts.length, 0);
  assert.match(unknown.reply, /sem inventar/);
});

test('without the action permission the provider does not even draft it', async () => {
  const limited = { actions: [] as string[] };
  assert.equal((await ask('Crie uma tarefa para revisar o site', limited)).drafts.length, 0);
  assert.equal((await ask('Cadastre Maria como cliente', limited)).drafts.length, 0);
  assert.equal((await ask('Novo lead: Maria Souza', limited)).drafts.length, 0);
  assert.equal((await ask('Crie uma oportunidade de 5 mil para Maria', limited)).drafts.length, 0);
  assert.equal((await ask('Quero um novo site', limited)).drafts.length, 0);
  const scheduling = await ask('Crie uma área de agendamento', { actions: ['task.create'] });
  assert.match(scheduling.reply, /planejado/);
  assert.equal(scheduling.drafts[0]?.type, 'task.create');
});
