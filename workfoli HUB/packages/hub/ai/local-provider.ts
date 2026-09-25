import type { AiContext, AiDraft, AiProvider, AiResponse } from './provider.js';

/**
 * Provedor local e determinístico: entende pedidos operacionais comuns em português e responde com o
 * contexto autorizado. Não usa rede nem modelo externo — é o padrão seguro de toda instalação e a base
 * de testes do fluxo proposta → confirmação → execução → auditoria.
 */
const norm = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const WEEKDAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-.\s]?\d{4}/;

function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Extrai um prazo ("até amanhã", "sexta", "30/09", "em 3 dias") e devolve o texto sem ele. */
export function extractDueDate(text: string, today: Date): { dueDate: string | null; rest: string } {
  const lowered = norm(text);
  const patterns: Array<[RegExp, (match: RegExpExecArray) => Date | null]> = [
    [/\b(?:ate |para |pra |no dia |dia )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, match => {
      const year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : today.getFullYear();
      const date = new Date(year, Number(match[2]) - 1, Number(match[1]));
      if (date.getMonth() !== Number(match[2]) - 1) return null;
      if (!match[3] && date < new Date(today.getFullYear(), today.getMonth(), today.getDate())) date.setFullYear(year + 1);
      return date;
    }],
    [/\b(?:ate |para |pra )?(hoje)\b/, () => new Date(today)],
    [/\b(?:ate |para |pra )?(amanha)\b/, () => { const date = new Date(today); date.setDate(date.getDate() + 1); return date; }],
    [/\bem (\d{1,2}) dias?\b/, match => { const date = new Date(today); date.setDate(date.getDate() + Number(match[1])); return date; }],
    [/\b(?:ate |para |pra |na |no )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\b/, match => {
      const target = WEEKDAYS.indexOf(match[1]!);
      const date = new Date(today);
      const delta = (target - date.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + delta);
      return date;
    }],
  ];
  for (const [pattern, resolve] of patterns) {
    const match = pattern.exec(lowered);
    if (!match) continue;
    const date = resolve(match);
    if (!date) continue;
    const rest = (text.slice(0, match.index) + text.slice(match.index + match[0].length)).replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').trim().replace(/[,;:\s-]+$/, '');
    return { dueDate: iso(date), rest };
  }
  return { dueDate: null, rest: text.trim() };
}

function cap(value: string): string {
  return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}

const RELATIONSHIP_WORDS: Array<[RegExp, string]> = [
  [/\b(?:cliente|clientes|paciente|pacientes)\b/, 'customer'], [/\bparceir[oa]s?\b/, 'partner'], [/\bfornecedor(?:a|es)?\b/, 'supplier'],
];
const LEAD_WORDS = /\b(?:lead|leads|prospect|prospecto)\b/;

/** Origem citada no pedido ("veio do Instagram", "pelo Google Ads"). Na dúvida, nenhuma. */
const SOURCE_WORDS: Array<[RegExp, string]> = [
  [/google ads|adwords|anuncio (?:do|no) google/, 'google-ads'], [/meta ads|facebook ads|anuncio (?:do|no) (?:facebook|instagram)/, 'meta-ads'],
  [/instagram/, 'instagram'], [/whats ?app/, 'whatsapp'], [/indicac|indicou|indicad/, 'indicacao'], [/landing ?page/, 'landing-page'],
  [/\bsite\b|formulario/, 'site'], [/google|busca organica|pesquisa organica/, 'google-organico'],
];

function sourceFrom(text: string, context: AiContext): string | null {
  const lowered = norm(text);
  const custom = context.crm?.sources.find(source => source.label.length > 2 && lowered.includes(norm(source.label)) && !SOURCE_WORDS.some(([, id]) => id === source.id));
  if (custom) return custom.id;
  const found = SOURCE_WORDS.find(([pattern]) => pattern.test(lowered))?.[1] ?? null;
  return found && (!context.crm || context.crm.sources.some(source => source.id === found)) ? found : null;
}

/** Nome, e-mail, telefone, empresa e observação a partir do trecho depois do verbo. */
function personFields(rest: string, text: string) {
  const email = EMAIL.exec(rest)?.[0] ?? null;
  if (email) rest = rest.replace(email, ' ');
  const phoneMatch = PHONE.exec(rest);
  const phone = phoneMatch && phoneMatch[0].replace(/\D/g, '').length >= 8 ? phoneMatch[0].trim() : null;
  if (phone) rest = rest.replace(phoneMatch![0], ' ');
  rest = rest.replace(/\s{2,}/g, ' ').trim();
  // Nome = trecho antes de "como", "interessado", "que", "veio", "da empresa", vírgula ou travessão.
  const split = /^(.+?)(?:\s+(?:como|interessad[oa]|que|veio|chegou|pelo|pela|via|da empresa|do|da|de)\s+|\s*[,;—–]\s*|$)([\s\S]*)$/i.exec(rest);
  const name = cap((split?.[1] ?? rest).replace(/^(?:o|a)\s+/i, '').replace(/[.:]+$/, '').trim());
  const tail = (split?.[2] ?? '').trim();
  if (name.length < 2 || name.length > 80 || !/\p{L}/u.test(name) || /\d{3,}/.test(name)) return null;
  const organization = /\b(?:da empresa|empresa)\s+([^,.;]+)/i.exec(text)?.[1]?.trim() ?? null;
  const notes = tail && !/^(?:novo|nova|cliente|contato|lead)\.?$/i.test(tail)
    ? cap(tail.replace(/^(?:um |uma |o |a )?(?:novo |nova )?(?:cliente|contato|lead|paciente)\s*/i, '').replace(/^,\s*/, '').replace(/[,;\s]+$/, '').trim()) || null : null;
  return { name, email, phone, organization, notes };
}

function contactDraft(text: string): AiDraft | null {
  const match = /^(?:por favor,?\s+)?(?:cadastr[ea]r?|adicion[ea]r?|registr[ea]r?|inclu[ai]r?|salv[ea]r?)\s+(?:(?:o|a|um|uma|este|esta|esse|essa)\s+)?(?:(?:nov[oa])\s+)?(?:(?:cliente|contato|paciente|parceir[oa]|fornecedor(?:a)?)\s*)?[:\-–]?\s*(.+)$/i.exec(text.trim());
  if (!match) return null;
  const fields = personFields(match[1]!.trim(), text);
  if (!fields) return null;
  const relationship = RELATIONSHIP_WORDS.find(([pattern]) => pattern.test(norm(text)))?.[1] ?? 'prospect';
  return { type: 'contact.create', payload: { name: fields.name, relationship, email: fields.email, phone: fields.phone, organization: fields.organization, notes: fields.notes } };
}

function leadDraft(text: string, context: AiContext): AiDraft | null {
  const lowered = norm(text);
  if (!LEAD_WORDS.test(lowered)) return null;
  const match = /^(?:por favor,?\s+)?(?:(?:cadastr[ea]r?|adicion[ea]r?|registr[ea]r?|inclu[ai]r?|salv[ea]r?|anot[ea]r?)\s+(?:(?:o|um|uma|este|esse)\s+)?(?:nov[oa]\s+)?(?:lead|prospect|prospecto)|(?:nov[oa]\s+)?(?:lead|prospect|prospecto))\s*(?:chegou|entrou)?\s*[:\-–,]?\s*(.+)$/i.exec(text.trim());
  if (!match) return null;
  const fields = personFields(match[1]!.trim(), text);
  if (!fields) return null;
  const interest = /\binteressad[oa]s? (?:em|no|na|nos|nas)\s+([^,.;]+)/i.exec(text)?.[1]?.trim();
  return { type: 'lead.create', payload: { name: fields.name, email: fields.email, phone: fields.phone, company: fields.organization, sourceId: sourceFrom(text, context), message: interest ? `Interesse: ${interest}` : null } };
}

/** "R$ 5.000,00", "5 mil", "8k" → número em reais. */
export function extractAmount(text: string): { value: number | null; rest: string } {
  const currency = /R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/i.exec(text);
  if (currency) return { value: Number(`${currency[1]!.replace(/\./g, '')}.${currency[2] ?? '0'}`), rest: text.replace(currency[0], ' ') };
  const thousands = /\b(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b/i.exec(text);
  if (thousands) return { value: Math.round(Number(thousands[1]!.replace(',', '.')) * 1000), rest: text.replace(thousands[0], ' ') };
  return { value: null, rest: text };
}

function opportunityDraft(text: string): AiDraft | null {
  const match = /^(?:por favor,?\s+)?(?:(?:cri[ea]r?|abr[ai]r?|registr[ea]r?|adicion[ea]r?|cadastr[ea]r?|inclu[ai]r?)\s+(?:uma?\s+)?(?:nov[oa]\s+)?|nov[oa]\s+)(?:oportunidade|negocio|negócio|negociação|negociacao)\s*[:\-–]?\s*(.*)$/i.exec(text.trim());
  if (!match) return null;
  const { value, rest } = extractAmount(match[1] ?? '');
  const cleaned = rest.replace(/\s+(?:de|no valor de|valor)\s*(?=[,.;]|$)/i, ' ').replace(/^\s*(?:de|no valor de|com)\s+(?=para|pra)/i, '').replace(/\s{2,}/g, ' ').trim();
  const target = /^(?:.*?\s)?(?:para|pra|com)\s+(?:o |a |os |as )?(.+)$/i.exec(cleaned)?.[1];
  const title = cap((target ?? cleaned).replace(/^(?:de|para|pra|com|:|-)\s+/i, '').replace(/[.!?,;]+$/, '').trim());
  if (title.length < 2 || title.length > 160) return null;
  return { type: 'opportunity.create', payload: { title, value, contactName: target ? title : null } };
}

const PROJECT_TYPES: Array<[RegExp, string, string]> = [
  [/landing ?pages?|pagina de captura/, 'landing-page', 'Landing page'], [/\bsite\b|website/, 'website', 'Site'], [/campanha/, 'campaign', 'Campanha'],
  [/sistema|crm|aplicativo|\bapp\b/, 'system', 'Sistema'], [/automa[cç]/, 'automation', 'Automação'], [/dashboard|painel/, 'dashboard', 'Dashboard'],
  [/integra[cç]/, 'integration', 'Integração'], [/conteudo|carrossel|post/, 'content', 'Conteúdo'], [/\bmarca\b|identidade/, 'brand', 'Marca'], [/projeto/, 'other', 'Projeto'],
];

function projectDraft(text: string): AiDraft | null {
  const lowered = norm(text);
  if (!/^(?:por favor,?\s+)?(?:cri[ea]r?|quero|queria|preciso(?: de)?|vamos (?:fazer|criar)|fa[cz]a|montar?|abr[ai]r?|comec[ea]r?|inicia[r]?)\b/.test(lowered)) return null;
  const found = PROJECT_TYPES.find(([pattern]) => pattern.test(lowered));
  if (!found || /\btarefa\b|\blembrete\b/.test(lowered)) return null;
  const [pattern, type, label] = found;
  const after = norm(text).search(pattern);
  const original = after >= 0 ? text.slice(after).replace(/^[^\s]+(?:\s+pages?)?/i, '') : '';
  const topic = original.replace(/^\s*(?:de|do|da|para|pra|sobre|com|:|-)\s+/i, '').replace(/[.!?]+$/, '').trim();
  const name = topic ? `${label} — ${cap(topic)}`.slice(0, 120) : `Nov${label === 'Campanha' || label === 'Landing page' || label === 'Automação' || label === 'Integração' || label === 'Marca' ? 'a' : 'o'} ${label.toLowerCase()}`;
  return { type: 'project.create', payload: { name, type, summary: topic ? `${label} sobre ${topic}.` : null } };
}

function taskDraft(text: string, today: Date): AiDraft | null {
  const match = /^(?:por favor,?\s+)?(?:(?:cri[ea]r?|adicion[ea]r?|coloqu[ea]r?|p[oõ]e|inclu[ai]r?)\s+(?:uma?\s+)?(?:nova\s+)?(?:tarefa|pend[eê]ncia|lembrete)|anot[ea]r?|lembr[ea]r?(?:-me)?(?: de)?|me lembr[ea] de)\s*(?:de|para|pra|:|-)?\s*(.+)$/i.exec(text.trim());
  if (!match) return null;
  const { dueDate, rest } = extractDueDate(match[1]!, today);
  const title = cap(rest.replace(/^(?:que|de|para)\s+/i, '').replace(/[.]+$/, '').trim());
  if (title.length < 3) return null;
  return { type: 'task.create', payload: { title: title.slice(0, 200), dueDate } };
}

function noteDraft(text: string): AiDraft | null {
  const match = /^(?:registr[ea]r?|salv[ea]r?|guard[ea]r?|document[ea]r?)\s+(?:na base|no conhecimento|como nota|uma nota|nota)\s*[:\-–]?\s*([\s\S]{3,})$/i.exec(text.trim());
  if (!match) return null;
  const body = match[1]!.trim();
  const title = cap(body.split(/[.\n]/)[0]!.slice(0, 80).trim());
  return { type: 'note.create', payload: { title, body } };
}

function list(items: string[], empty: string): string {
  return items.length ? items.map(item => `• ${item}`).join('\n') : empty;
}

function capabilities(context: AiContext): string {
  const lines: string[] = [];
  if (context.actions.includes('contact.create')) lines.push(`cadastrar ${context.crm?.labels.contacts.toLowerCase() ?? 'contatos'} ("Cadastre Maria Souza como nova cliente")`);
  if (context.actions.includes('lead.create')) lines.push(`registrar ${context.crm?.labels.leads.toLowerCase() ?? 'leads'} ("Novo lead: Ana Lima, ana@exemplo.test, veio do Instagram")`);
  if (context.actions.includes('opportunity.create')) lines.push(`abrir ${context.crm?.labels.opportunities.toLowerCase() ?? 'oportunidades'} no funil ("Crie uma oportunidade de R$ 5.000 para a Padaria Central")`);
  if (context.crm) lines.push('resumir o funil ("Como está o funil?")');
  if (context.actions.includes('task.create')) lines.push('criar tarefas com prazo ("Crie uma tarefa para revisar o site até sexta")');
  if (context.actions.includes('project.create')) lines.push('abrir projetos na Base ("Quero uma nova landing page para o serviço X")');
  if (context.actions.includes('note.create')) lines.push('registrar notas no conhecimento ("Registre na Base: ...")');
  if (context.tasks) lines.push('mostrar pendências ("O que está pendente?")');
  if (context.company) lines.push('resumir a empresa e os serviços');
  if (context.projects) lines.push('listar projetos');
  return lines.length ? `Posso:\n${list(lines, '')}\n\nToda alteração aparece antes como proposta para você confirmar.` : 'Seu acesso permite apenas consultas simples por aqui.';
}

export const localProvider: AiProvider = {
  id: 'local', label: 'Assistente local', external: false,
  async respond({ text, context }): Promise<AiResponse> {
    const lowered = norm(text.trim());
    const today = new Date(`${context.today}T12:00:00`);
    if (/^(?:oi|ola|bom dia|boa tarde|boa noite|ajuda|help|menu|o que (?:voce|vc) (?:faz|pode fazer)|como (?:voce|vc) (?:funciona|ajuda))\b/.test(lowered)) {
      return { reply: `Olá, ${context.user.name.split(' ')[0]}. Trabalho com o contexto da ${context.company?.name ?? 'empresa'} que o seu acesso permite ver.\n\n${capabilities(context)}`, drafts: [] };
    }
    if (/(?:area|modulo|tela|sistema) de agend|\bagendamentos?\b/.test(lowered) && /\b(?:cri|quer|precis|mont|fa[cz])/.test(lowered)) {
      const custom = context.modules.custom.find(module => /agend/.test(norm(module.label)));
      if (custom) return { reply: `Já existe o módulo "${custom.label}". Abra pelo menu lateral.`, drafts: [] };
      const drafts: AiDraft[] = context.actions.includes('task.create') ? [{ type: 'task.create', payload: { title: 'Definir a área de agendamento (campos, responsáveis e integração com a agenda)', dueDate: null } }] : [];
      return {
        reply: 'A Agenda completa ainda é um módulo planejado do Core. Enquanto isso, um administrador pode criar um módulo customizado de agendamentos (declarativo, sem código) em hub/modules. ' + (drafts.length ? 'Posso registrar a tarefa para definir essa área:' : ''),
        drafts,
      };
    }
    if (/\b(?:campanha|campanhas|anuncio|anuncios|google ads|meta ads|trafego pago)\b/.test(lowered) && /\b(?:analis|avali|como estao|relatorio|desempenho|resultado)/.test(lowered)) {
      const ads = (context.integrations ?? []).filter(item => ['google', 'google-ads', 'meta', 'facebook', 'instagram', 'google-analytics'].includes(item.provider));
      const connected = ads.filter(item => item.state === 'connected');
      const drafts: AiDraft[] = !connected.length && context.actions.includes('task.create') ? [{ type: 'task.create', payload: { title: 'Conectar Google Ads e Meta Ads à Workfoli para análise de campanhas', dueDate: null } }] : [];
      return {
        reply: connected.length
          ? `Integrações de mídia conectadas: ${connected.map(item => item.label).join(', ')}. Os números sincronizados ficam no módulo Marketing, com o dado da plataforma separado do que a Workfoli calcula. Eu ainda não interpreto métricas por aqui — não invento análise.`
          : `Ainda não há integração de anúncios conectada${ads.length ? ` (${ads.map(item => `${item.label}: ${item.state}`).join('; ')})` : ''}. Sem dados, eu não analiso campanhas — não invento números.${drafts.length ? ' Posso registrar a tarefa de conexão:' : ''}`,
        drafts,
      };
    }
    const note = noteDraft(text);
    if (note && context.actions.includes('note.create')) return { reply: 'Preparei a nota para registrar na Base. Confira antes de confirmar:', drafts: [note] };
    const task = taskDraft(text, today);
    if (task) return context.actions.includes('task.create') ? { reply: 'Preparei a tarefa. Confira e confirme:', drafts: [task] } : { reply: 'Seu acesso não permite criar tarefas.', drafts: [] };
    const lead = leadDraft(text, context);
    if (lead) return context.actions.includes('lead.create') ? { reply: `Preparei o registro do ${context.crm?.labels.lead.toLowerCase() ?? 'lead'}. Confira os campos:`, drafts: [lead] } : { reply: 'Seu acesso não permite registrar leads.', drafts: [] };
    const opportunity = opportunityDraft(text);
    if (opportunity) return context.actions.includes('opportunity.create') ? { reply: `Preparei a ${context.crm?.labels.opportunity.toLowerCase() ?? 'oportunidade'} para o funil. Confira:`, drafts: [opportunity] } : { reply: 'Seu acesso não permite criar oportunidades.', drafts: [] };
    const contact = contactDraft(text);
    if (contact) return context.actions.includes('contact.create') ? { reply: `Preparei o cadastro${context.crm ? ` de ${context.crm.labels.contact.toLowerCase()}` : ''}. Confira os campos:`, drafts: [contact] } : { reply: 'Seu acesso não permite cadastrar contatos.', drafts: [] };
    const project = projectDraft(text);
    if (project) return context.actions.includes('project.create') ? { reply: 'Preparei o projeto. Ao confirmar, ele passa a existir na Base (pasta e manifesto), com o briefing para completar:', drafts: [project] } : { reply: 'Seu acesso não permite criar projetos.', drafts: [] };
    if (/\b(?:pendente|pendentes|pendencias?|tarefas?|a fazer|o que falta|prioridades?)\b/.test(lowered)) {
      if (!context.tasks) return { reply: 'Seu acesso não inclui as tarefas.', drafts: [] };
      const items = context.tasks.items.slice(0, 8).map(item => `${item.title}${item.dueDate ? ` (até ${item.dueDate.split('-').reverse().join('/')})` : ''}${item.status === 'doing' ? ' — em andamento' : ''}`);
      const base = context.baseTasks?.length ? `\n\nNa Base (tarefas.md):\n${list(context.baseTasks.slice(0, 5), '')}` : '';
      return { reply: `${context.tasks.open + context.tasks.doing} tarefa(s) em aberto.\n${list(items, 'Nenhuma tarefa aberta no Hub.')}${base}`, drafts: [] };
    }
    if (/\bprojetos?\b/.test(lowered)) {
      if (!context.projects) return { reply: 'Seu acesso não inclui os projetos.', drafts: [] };
      return { reply: `Projetos na Base:\n${list(context.projects.map(item => `${item.name} (${item.status})`), 'Nenhum projeto registrado ainda.')}`, drafts: [] };
    }
    const funnel = /\b(?:funil|pipeline|oportunidades?|negocios?|negociacoes)\b/.test(lowered) && /\b(?:quantos|quantas|total|como esta|como estao|resum|situacao|andamento)\b/.test(lowered);
    if ((funnel || /\b(?:quantos|quantas|total de)\b.*\b(?:clientes|contatos|leads|pacientes)\b/.test(lowered)) && !context.crm) return { reply: 'Seu acesso não inclui o CRM.', drafts: [] };
    if (funnel && context.crm) {
      const stages = Object.entries(context.crm.byStage).map(([stage, count]) => `${stage}: ${count}`);
      return { reply: `${context.crm.openOpportunities} ${context.crm.labels.opportunities.toLowerCase()} em aberto no "${context.crm.pipeline}".\n${list(stages, '')}\n\n${context.crm.leadsOpen} ${context.crm.labels.leads.toLowerCase()} aguardando atendimento.`, drafts: [] };
    }
    if (/\b(?:quantos|quantas|total de)\b.*\b(?:clientes|contatos|leads|pacientes)\b/.test(lowered) && context.crm) {
      if (/\bleads?\b/.test(lowered)) return { reply: `${context.crm.leadsOpen} ${context.crm.labels.leads.toLowerCase()} em aberto (novos, em atendimento ou qualificados).`, drafts: [] };
      return { reply: `${context.crm.contacts} ${context.crm.labels.contacts.toLowerCase()} cadastrados e ${context.crm.openOpportunities} ${context.crm.labels.opportunities.toLowerCase()} em aberto.`, drafts: [] };
    }
    if (/\b(?:quem somos|sobre a empresa|resum[ae] a empresa|o que (?:a empresa|nos|fazemos)|nossos servicos|servicos)\b/.test(lowered)) {
      if (!context.company) return { reply: 'Seu acesso não inclui os dados institucionais.', drafts: [] };
      const company = context.company;
      return { reply: `${company.name}${company.tagline ? ` — ${company.tagline}` : ''}\n\n${company.description ?? ''}${company.services.length ? `\n\nServiços:\n${list(company.services, '')}` : ''}`.trim(), drafts: [] };
    }
    return { reply: `Ainda não sei fazer isso por aqui sem inventar. ${capabilities(context)}`, drafts: [] };
  },
};
