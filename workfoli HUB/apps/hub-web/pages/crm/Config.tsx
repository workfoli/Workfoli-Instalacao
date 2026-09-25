import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button, Card, Field, IconButton, Notice, Tag, useToast } from '../../components/ui';
import { ApiError, errorMessage, put } from '../../lib/api';
import { AUTOMATION_EVENTS, FIELD_TYPES, REQUIRED_FIELD_OPTIONS, SOURCE_KINDS } from '../../lib/crm';
import type { CrmAction, CrmAutomation, CrmConfig, CrmCustomField, CrmPipeline, CrmSettings, CrmStage, EntityType, FieldType, LabelKey, StageKind } from '../../lib/crm';

const slugify = (value: string, max = 36) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '');
function uniqueId(base: string, taken: string[], fallback: string): string {
  const root = slugify(base) || fallback;
  let id = root;
  for (let index = 2; taken.includes(id); index += 1) id = `${root.slice(0, 33)}-${index}`;
  return id;
}
const KINDS: Record<StageKind, string> = { open: 'Em aberto', won: 'Ganho', lost: 'Perdido' };
const LABEL_KEYS: Array<[LabelKey, string, string]> = [
  ['contact', 'Contato (singular)', 'Contato'], ['contacts', 'Contatos (plural)', 'Contatos'], ['organization', 'Empresa (singular)', 'Empresa'], ['organizations', 'Empresas (plural)', 'Empresas'],
  ['lead', 'Lead (singular)', 'Lead'], ['leads', 'Leads (plural)', 'Leads'], ['opportunity', 'Oportunidade (singular)', 'Oportunidade'], ['opportunities', 'Oportunidades (plural)', 'Oportunidades'],
];
const ENTITIES: Record<EntityType, string> = { contact: 'Contato', organization: 'Empresa', lead: 'Lead', opportunity: 'Oportunidade' };

/**
 * Configuração do CRM. Tudo aqui é ESTRUTURA e vai para o manifesto da Base (versionado); nenhum
 * registro vivo passa por esta tela. O contrato valida no servidor e devolve o caminho de cada erro.
 */
export function ConfigView({ settings, onSaved }: { settings: CrmSettings; onSaved: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<CrmConfig>(() => structuredClone(settings.config));
  const [issues, setIssues] = useState<Array<{ path: string; message: string }>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newReason, setNewReason] = useState('');
  const update = (change: (next: CrmConfig) => void) => setDraft(current => { const next = structuredClone(current); change(next); return next; });
  const usage = (pipelineId: string, stageId?: string) => stageId ? settings.usage[pipelineId]?.[stageId] ?? 0 : Object.values(settings.usage[pipelineId] ?? {}).reduce((sum, value) => sum + value, 0);
  const opportunityFields = draft.customFields.filter(field => field.entity === 'opportunity');

  const save = async () => {
    setBusy(true); setError(''); setIssues([]);
    try {
      const outcome = await put<{ status: 'applied' | 'queued'; summary?: string }>('/api/crm/config', { crm: draft });
      toast(outcome.status === 'applied' ? 'Configuração salva na Base.' : 'Configuração enviada ao computador da Base.');
      onSaved();
    } catch (cause) {
      if (cause instanceof ApiError && Array.isArray(cause.details?.issues)) setIssues(cause.details!.issues as Array<{ path: string; message: string }>);
      setError(errorMessage(cause).split('\n')[0]!);
    } finally { setBusy(false); }
  };

  const stageRow = (pipeline: CrmPipeline, pipelineIndex: number, stage: CrmStage, index: number) => {
    const inUse = usage(pipeline.id, stage.id);
    const setStage = (change: (target: CrmStage) => void) => update(next => change(next.pipelines[pipelineIndex]!.stages[index]!));
    const requiredOptions: Array<[string, string]> = [...Object.entries(REQUIRED_FIELD_OPTIONS), ...opportunityFields.map(field => [`custom.${field.id}`, field.label] as [string, string])];
    return (
      <div key={index} className="config-stage">
        <span className="handle">{String(index + 1).padStart(2, '0')}</span>
        <input className="input" value={stage.name} maxLength={40} aria-label="Nome da etapa" onChange={event => setStage(target => {
          target.name = event.target.value;
          // Etapa nova ganha identificador pelo nome; etapa existente mantém o dela (oportunidades apontam para ele).
          const original = settings.config.pipelines.find(item => item.id === pipeline.id)?.stages.some(item => item.id === stage.id);
          if (!original) target.id = uniqueId(event.target.value, pipeline.stages.filter((_, other) => other !== index).map(item => item.id), 'etapa');
        })} />
        <select className="select" value={stage.kind} aria-label="Tipo da etapa" onChange={event => setStage(target => { target.kind = event.target.value as StageKind; })}>
          {Object.entries(KINDS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <input className="input" type="number" min={0} max={100} value={stage.probability ?? ''} placeholder="%" aria-label="Probabilidade (%)"
          onChange={event => setStage(target => { if (event.target.value === '') delete target.probability; else target.probability = Math.max(0, Math.min(100, Math.round(Number(event.target.value)))); })} />
        <div className="chips-input" role="group" aria-label="Campos exigidos para entrar na etapa">
          {stage.kind === 'open' ? requiredOptions.map(([key, label]) => (
            <button key={key} type="button" className="chip-toggle" aria-pressed={stage.requiredFields?.includes(key) === true}
              onClick={() => setStage(target => { const list = target.requiredFields ?? []; target.requiredFields = list.includes(key) ? list.filter(item => item !== key) : [...list, key]; if (!target.requiredFields.length) delete target.requiredFields; })}>{label}</button>
          )) : <span className="faint">{stage.kind === 'won' ? 'Fecha como ganho' : 'Exige motivo da perda'}</span>}
        </div>
        <div className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
          <IconButton label="Subir" small disabled={index === 0} onClick={() => update(next => { const stages = next.pipelines[pipelineIndex]!.stages; [stages[index - 1], stages[index]] = [stages[index]!, stages[index - 1]!]; })}><ArrowUp size={14} /></IconButton>
          <IconButton label="Descer" small disabled={index === pipeline.stages.length - 1} onClick={() => update(next => { const stages = next.pipelines[pipelineIndex]!.stages; [stages[index + 1], stages[index]] = [stages[index]!, stages[index + 1]!]; })}><ArrowDown size={14} /></IconButton>
          <IconButton label={inUse ? `${inUse} oportunidade(s) abertas nesta etapa: mova antes de remover` : 'Remover etapa'} small disabled={inUse > 0}
            onClick={() => update(next => { next.pipelines[pipelineIndex]!.stages.splice(index, 1); })}><Trash2 size={14} /></IconButton>
        </div>
      </div>
    );
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Notice tone="info">Estas definições ficam no manifesto da Base ({settings.base.mode === 'remote' ? 'aplicadas pelo computador da Base' : 'gravadas agora'}) e valem para toda a equipe. Registros existentes nunca são apagados por aqui.</Notice>
      {error ? <Notice>{error}{issues.length ? <ul className="issues">{issues.slice(0, 12).map(issue => <li key={`${issue.path}-${issue.message}`}><code>{issue.path}</code>: {issue.message}</li>)}</ul> : null}</Notice> : null}

      <Card title="Funis e etapas" meta="Cada funil precisa de etapas em aberto, uma de ganho e uma de perda" actions={<Button size="sm" disabled={draft.pipelines.length >= 10} onClick={() => update(next => {
        const id = uniqueId('Novo funil', next.pipelines.map(item => item.id), 'funil');
        next.pipelines.push({ id, name: 'Novo funil', default: false, stages: [{ id: 'novo', name: 'Novo', kind: 'open', probability: 10 }, { id: 'ganho', name: 'Ganho', kind: 'won', probability: 100 }, { id: 'perdido', name: 'Perdido', kind: 'lost', probability: 0 }] });
      })}><Plus size={14} />Funil</Button>}>
        <div className="stack" style={{ gap: 18 }}>
          {draft.pipelines.map((pipeline, pipelineIndex) => (
            <div key={pipelineIndex} className="config-block">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row">
                  <input className="input" style={{ width: 260 }} value={pipeline.name} maxLength={60} aria-label="Nome do funil" onChange={event => update(next => { next.pipelines[pipelineIndex]!.name = event.target.value; })} />
                  <label className="checkbox small"><input type="radio" name="default-pipeline" checked={pipeline.default} onChange={() => update(next => { next.pipelines.forEach((item, index) => { item.default = index === pipelineIndex; }); })} />Padrão</label>
                  {usage(pipeline.id) ? <Tag tone="outline">{usage(pipeline.id)} em aberto</Tag> : null}
                </div>
                <div className="row">
                  <Button size="sm" onClick={() => update(next => {
                    const stages = next.pipelines[pipelineIndex]!.stages;
                    const at = stages.findIndex(stage => stage.kind !== 'open');
                    stages.splice(at < 0 ? stages.length : at, 0, { id: uniqueId('Nova etapa', stages.map(stage => stage.id), 'etapa'), name: 'Nova etapa', kind: 'open' });
                  })}><Plus size={14} />Etapa</Button>
                  <IconButton label={usage(pipeline.id) ? 'Há oportunidades abertas neste funil' : 'Remover funil'} small disabled={draft.pipelines.length <= 1 || usage(pipeline.id) > 0}
                    onClick={() => update(next => { next.pipelines.splice(pipelineIndex, 1); if (!next.pipelines.some(item => item.default) && next.pipelines[0]) next.pipelines[0].default = true; })}><Trash2 size={14} /></IconButton>
                </div>
              </div>
              <div className="config-stage faint small" aria-hidden="true"><span /><span>Etapa</span><span>Tipo</span><span>Prob.</span><span>Exige para entrar</span><span /></div>
              {pipeline.stages.map((stage, index) => stageRow(pipeline, pipelineIndex, stage, index))}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Campos personalizados" meta="Informações próprias do seu negócio (sem dados sensíveis de saúde: esses pedem módulo próprio)" actions={<Button size="sm" disabled={draft.customFields.length >= 60} onClick={() => update(next => {
        next.customFields.push({ id: uniqueId('Novo campo', next.customFields.filter(field => field.entity === 'opportunity').map(field => field.id), 'campo'), entity: 'opportunity', label: 'Novo campo', type: 'text', required: false });
      })}><Plus size={14} />Campo</Button>}>
        {draft.customFields.length ? (
          <div className="stack">{draft.customFields.map((field, index) => {
            const set = (change: (target: CrmCustomField) => void) => update(next => change(next.customFields[index]!));
            const isNew = !settings.config.customFields.some(item => item.id === field.id && item.entity === field.entity);
            return (
              <div key={index} className="config-block">
                <div className="form-row">
                  <Field label="Nome"><input className="input" value={field.label} maxLength={60} onChange={event => set(target => { target.label = event.target.value; if (isNew) target.id = uniqueId(event.target.value, draft.customFields.filter((item, other) => other !== index && item.entity === target.entity).map(item => item.id), 'campo'); })} /></Field>
                  <Field label="Onde aparece"><select className="select" value={field.entity} disabled={!isNew} onChange={event => set(target => { target.entity = event.target.value as EntityType; })}>{Object.entries(ENTITIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
                </div>
                <div className="form-row">
                  <Field label="Tipo"><select className="select" value={field.type} onChange={event => set(target => { target.type = event.target.value as FieldType; if (target.type !== 'select' && target.type !== 'multiselect') delete target.options; else target.options = target.options?.length ? target.options : ['Opção 1']; })}>{Object.entries(FIELD_TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
                  {field.type === 'select' || field.type === 'multiselect' ? (
                    <Field label="Opções" help="Separe por vírgula."><input className="input" value={field.options?.join(', ') ?? ''} onChange={event => set(target => { target.options = event.target.value.split(',').map(item => item.trim()).filter(Boolean); })} /></Field>
                  ) : <div />}
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <label className="checkbox small"><input type="checkbox" checked={field.required} onChange={event => set(target => { target.required = event.target.checked; })} />Obrigatório ao cadastrar</label>
                  <span className="faint">Identificador: <code>{field.id}</code></span>
                  <Button size="sm" variant="ghost" onClick={() => update(next => {
                    next.customFields.splice(index, 1);
                    for (const pipeline of next.pipelines) for (const stage of pipeline.stages) if (stage.requiredFields) { stage.requiredFields = stage.requiredFields.filter(key => key !== `custom.${field.id}` || field.entity !== 'opportunity'); if (!stage.requiredFields.length) delete stage.requiredFields; }
                  })}><Trash2 size={14} />Remover</Button>
                </div>
              </div>
            );
          })}</div>
        ) : <p className="muted">Nenhum campo extra. Os campos comuns (nome, contato, empresa, origem, responsável, valor, datas, etiquetas) já existem.</p>}
        <p className="faint" style={{ marginTop: 12 }}>Remover um campo não apaga os valores já gravados: eles continuam visíveis como “campo removido”.</p>
      </Card>

      <div className="grid grid-2">
        <Card title="Origens" meta="De onde vêm os leads e negócios" actions={<Button size="sm" disabled={draft.sources.length >= 40} onClick={() => update(next => { next.sources.push({ id: uniqueId('Nova origem', [...settings.sources.filter(source => source.core).map(source => source.id), ...next.sources.map(source => source.id)], 'origem'), label: 'Nova origem', kind: 'other' }); })}><Plus size={14} />Origem</Button>}>
          <div className="stack">
            <div className="chips-input">{settings.sources.filter(source => source.core).map(source => <Tag key={source.id} tone="outline">{source.label}</Tag>)}</div>
            <p className="faint">Origens nativas (sempre disponíveis). Acrescente as suas:</p>
            {draft.sources.map((source, index) => (
              <div key={index} className="row">
                <input className="input" style={{ flex: 1 }} value={source.label} maxLength={60} aria-label="Nome da origem" onChange={event => update(next => {
                  next.sources[index]!.label = event.target.value;
                  if (!settings.config.sources.some(item => item.id === source.id)) next.sources[index]!.id = uniqueId(event.target.value, [...settings.sources.filter(item => item.core).map(item => item.id), ...next.sources.filter((_, other) => other !== index).map(item => item.id)], 'origem');
                })} />
                <select className="select" style={{ width: 'auto' }} value={source.kind} aria-label="Tipo de origem" onChange={event => update(next => { next.sources[index]!.kind = event.target.value; })}>{Object.entries(SOURCE_KINDS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                <IconButton label="Remover origem" small onClick={() => update(next => { next.sources.splice(index, 1); })}><Trash2 size={14} /></IconButton>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Motivos de perda" meta="Escolhidos ao marcar um negócio como perdido">
          <div className="stack">
            <div className="chips-input">{draft.lostReasons.map((reason, index) => (
              <span key={reason} className="tag">{reason}<button type="button" className="icon-btn sm" style={{ width: 20, height: 20 }} aria-label={`Remover ${reason}`} onClick={() => update(next => { next.lostReasons.splice(index, 1); })}>×</button></span>
            ))}</div>
            <div className="row">
              <input className="input" style={{ flex: 1 }} value={newReason} maxLength={80} placeholder="Novo motivo" aria-label="Novo motivo de perda" onChange={event => setNewReason(event.target.value)} />
              <Button size="sm" disabled={!newReason.trim() || draft.lostReasons.includes(newReason.trim())} onClick={() => { update(next => { next.lostReasons.push(newReason.trim()); }); setNewReason(''); }}><Plus size={14} />Adicionar</Button>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Automações" meta="Regras simples: quando algo acontece no CRM, cria tarefa ou aplica etiqueta" actions={<Button size="sm" disabled={draft.automations.length >= 30} onClick={() => update(next => { next.automations.push({ id: uniqueId('Nova automação', next.automations.map(item => item.id), 'automacao'), name: 'Nova automação', enabled: true, when: { event: 'lead_created' }, actions: [{ type: 'create_task', title: 'Responder {nome}', dueInDays: 0, assignTo: 'owner' }] }); })}><Plus size={14} />Automação</Button>}>
        {draft.automations.length ? <div className="stack">{draft.automations.map((automation, index) => (
          <AutomationEditor key={index} automation={automation} pipelines={draft.pipelines}
            onChange={value => update(next => { next.automations[index] = value; })} onRemove={() => update(next => { next.automations.splice(index, 1); })} />
        ))}</div> : <p className="muted">Nenhuma automação. Exemplo útil: “Lead criado → criar tarefa Responder {'{nome}'} para hoje”.</p>}
      </Card>

      <div className="grid grid-2">
        <Card title="Integrações com o CRM" meta="A conexão da conta fica em Integrações; aqui só o que ela alimenta">
          {(['meta'] as const).map(provider => {
            const link = draft.integrations.find(item => item.provider === provider);
            const set = (value: typeof link | null) => update(next => { next.integrations = next.integrations.filter(item => item.provider !== provider); if (value) next.integrations.push(value); });
            return (
              <div key={provider} className="stack">
                <label className="checkbox"><input type="checkbox" checked={!!link?.leads} onChange={event => set(event.target.checked ? { provider, leads: true, source: link?.source ?? 'meta-ads', ...(link?.pipeline ? { pipeline: link.pipeline } : {}) } : null)} />Importar leads dos formulários da Meta (Facebook/Instagram)</label>
                {link?.leads ? (
                  <div className="form-row">
                    <Field label="Origem aplicada"><select className="select" value={link.source} onChange={event => set({ ...link, source: event.target.value })}>{[...settings.sources.filter(item => item.core), ...draft.sources].map(source => <option key={source.id} value={source.id}>{source.label}</option>)}</select></Field>
                    <Field label="Abrir oportunidade em"><select className="select" value={link.pipeline ?? ''} onChange={event => { const rest = { ...link }; delete rest.pipeline; set(event.target.value ? { ...rest, pipeline: event.target.value } : rest); }}><option value="">Não abrir (só lead)</option>{draft.pipelines.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                  </div>
                ) : null}
              </div>
            );
          })}
        </Card>
        <Card title="Nomes e moeda" meta="O vocabulário do seu negócio (ex.: Paciente, Aluno, Cliente)">
          <div className="form-row">
            {LABEL_KEYS.map(([key, label, placeholder]) => (
              <Field key={key} label={label}><input className="input" value={draft.labels[key] ?? ''} placeholder={placeholder} maxLength={40} onChange={event => update(next => { if (event.target.value.trim()) next.labels[key] = event.target.value; else delete next.labels[key]; })} /></Field>
            ))}
            <Field label="Moeda"><select className="select" value={draft.currency} onChange={event => update(next => { next.currency = event.target.value; })}>{['BRL', 'USD', 'EUR'].map(code => <option key={code} value={code}>{code}</option>)}</select></Field>
          </div>
        </Card>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '12px 0' }}>
        <Button variant="ghost" onClick={() => { setDraft(structuredClone(settings.config)); setIssues([]); setError(''); }}>Descartar alterações</Button>
        <Button variant="primary" busy={busy} onClick={save}>Salvar na Base</Button>
      </div>
    </div>
  );
}

function AutomationEditor({ automation, pipelines, onChange, onRemove }: { automation: CrmAutomation; pipelines: CrmPipeline[]; onChange: (value: CrmAutomation) => void; onRemove: () => void }) {
  const pipeline = pipelines.find(item => item.id === automation.when.pipeline);
  const setAction = (index: number, action: CrmAction) => onChange({ ...automation, actions: automation.actions.map((item, other) => other === index ? action : item) });
  return (
    <div className="config-block">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <input className="input" style={{ flex: 1, minWidth: 200 }} value={automation.name} maxLength={80} aria-label="Nome da automação" onChange={event => onChange({ ...automation, name: event.target.value })} />
        <label className="checkbox small"><input type="checkbox" checked={automation.enabled} onChange={event => onChange({ ...automation, enabled: event.target.checked })} />Ligada</label>
        <IconButton label="Remover automação" small onClick={onRemove}><Trash2 size={14} /></IconButton>
      </div>
      <div className="form-row">
        <Field label="Quando"><select className="select" value={automation.when.event} onChange={event => onChange({ ...automation, when: { event: event.target.value, ...(event.target.value === 'stage_entered' ? { pipeline: pipelines[0]?.id, stage: pipelines[0]?.stages[0]?.id } : {}) } })}>
          {Object.entries(AUTOMATION_EVENTS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
        {automation.when.event === 'stage_entered' ? (
          <div className="form-row">
            <Field label="Funil"><select className="select" value={automation.when.pipeline ?? ''} onChange={event => onChange({ ...automation, when: { event: 'stage_entered', pipeline: event.target.value, stage: pipelines.find(item => item.id === event.target.value)?.stages[0]?.id } })}>{pipelines.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Etapa"><select className="select" value={automation.when.stage ?? ''} onChange={event => onChange({ ...automation, when: { ...automation.when, stage: event.target.value } })}>{pipeline?.stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></Field>
          </div>
        ) : <div />}
      </div>
      {automation.actions.map((action, index) => (
        <div key={index} className="row">
          <select className="select" style={{ width: 'auto' }} value={action.type} aria-label="Ação" onChange={event => setAction(index, event.target.value === 'add_tag' ? { type: 'add_tag', tag: 'etiqueta' } : { type: 'create_task', title: 'Tarefa para {nome}', dueInDays: 1, assignTo: 'owner' })}>
            <option value="create_task">Criar tarefa</option><option value="add_tag">Aplicar etiqueta</option>
          </select>
          {action.type === 'create_task' ? (
            <>
              <input className="input" style={{ flex: 1, minWidth: 180 }} value={action.title} maxLength={200} aria-label="Título da tarefa" onChange={event => setAction(index, { ...action, title: event.target.value })} />
              <label className="row small">em<input className="input" style={{ width: 70 }} type="number" min={0} max={365} value={action.dueInDays} aria-label="Prazo em dias" onChange={event => setAction(index, { ...action, dueInDays: Math.max(0, Math.min(365, Number(event.target.value) || 0)) })} />dia(s)</label>
              <select className="select" style={{ width: 'auto' }} value={action.assignTo} aria-label="Responsável da tarefa" onChange={event => setAction(index, { ...action, assignTo: event.target.value as 'owner' | 'none' })}><option value="owner">para o responsável</option><option value="none">sem responsável</option></select>
            </>
          ) : <input className="input" style={{ flex: 1 }} value={action.tag} maxLength={40} aria-label="Etiqueta" onChange={event => setAction(index, { ...action, tag: event.target.value })} />}
          <IconButton label="Remover ação" small disabled={automation.actions.length <= 1} onClick={() => onChange({ ...automation, actions: automation.actions.filter((_, other) => other !== index) })}><Trash2 size={14} /></IconButton>
        </div>
      ))}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="faint">Use {'{nome}'} no título para o nome do lead ou da oportunidade.</span>
        <Button size="sm" variant="ghost" disabled={automation.actions.length >= 5} onClick={() => onChange({ ...automation, actions: [...automation.actions, { type: 'add_tag', tag: 'etiqueta' }] })}><Plus size={14} />Ação</Button>
      </div>
    </div>
  );
}
