import { useState } from 'react';
import { Kanban } from 'lucide-react';
import { Loading, Notice, Tag, useLoad } from '../../components/ui';
import { ProvenanceBadge } from '../../components/charts';
import { MoveDialog } from './Forms';
import type { MoveRequest } from './Forms';
import { ApiError, errorMessage, get, post } from '../../lib/api';
import { initials } from '../../lib/format';
import { daysSince, entityHref, missingForStage, money } from '../../lib/crm';
import type { Board, CrmSettings, Opportunity } from '../../lib/crm';

export function BoardView({ settings, initialPipeline }: { settings: CrmSettings; initialPipeline?: string }) {
  const fallback = settings.config.pipelines.find(item => item.default)?.id ?? settings.config.pipelines[0]?.id ?? '';
  const [pipelineId, setPipelineId] = useState(initialPipeline && settings.config.pipelines.some(item => item.id === initialPipeline) ? initialPipeline : fallback);
  const [filters, setFilters] = useState({ q: '', owner: '', source: '' });
  const params = new URLSearchParams({ pipeline: pipelineId, ...(filters.q ? { q: filters.q } : {}), ...(filters.owner ? { owner: filters.owner } : {}), ...(filters.source ? { source: filters.source } : {}) });
  const { data, error, loading, reload } = useLoad(() => get<Board>(`/api/crm/board?${params.toString()}`), [params.toString()]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [request, setRequest] = useState<MoveRequest | null>(null);
  const [moveError, setMoveError] = useState('');
  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice>{error || 'Não foi possível carregar o funil.'}</Notice>;
  const pipeline = settings.config.pipelines.find(item => item.id === data.pipeline.id);
  const all = [...data.stages.flatMap(stage => stage.items), ...data.orphans];

  const move = async (opportunity: Opportunity, stageId: string) => {
    const stage = pipeline?.stages.find(item => item.id === stageId);
    if (!stage || (stage.id === opportunity.stageId && opportunity.pipelineId === data.pipeline.id)) return;
    setMoveError('');
    const missing = missingForStage(opportunity, stage);
    if (stage.kind === 'lost' || missing.length) { setRequest({ opportunity, stage, pipelineId: data.pipeline.id, missing }); return; }
    try { await post(`/api/crm/opportunities/${opportunity.id}/move`, { stageId, pipelineId: data.pipeline.id }); reload(); }
    catch (cause) {
      if (cause instanceof ApiError && cause.code === 'stage-requirements') setRequest({ opportunity, stage, pipelineId: data.pipeline.id, missing: [] });
      else setMoveError(errorMessage(cause));
    }
  };
  const canWrite = settings.canWrite;
  const card = (opportunity: Opportunity) => (
    <article key={opportunity.id} className={`item-card${dragging === opportunity.id ? ' dragging' : ''}`} draggable={canWrite}
      onDragStart={event => { event.dataTransfer.setData('text/plain', opportunity.id); event.dataTransfer.effectAllowed = 'move'; setDragging(opportunity.id); }}
      onDragEnd={() => { setDragging(null); setOver(null); }}>
      <a className="t" href={entityHref('opportunity', opportunity.id)}>{opportunity.title}</a>
      {opportunity.contact || opportunity.organization ? <span className="m">{[opportunity.contact?.name, opportunity.organization?.name].filter(Boolean).join(' · ')}</span> : null}
      <span className="m">
        <span className="v">{money(opportunity.valueCents, opportunity.currency)}</span>
        {opportunity.owner ? <span className="avatar" style={{ width: 22, height: 22, fontSize: 10 }} title={opportunity.owner.name}>{initials(opportunity.owner.name)}</span> : null}
        {opportunity.status === 'open' ? <span title="Dias nesta etapa">{daysSince(opportunity.stageEnteredAt)}d na etapa</span> : opportunity.lostReason ? <span>{opportunity.lostReason}</span> : null}
        {opportunity.priority === 'high' ? <Tag tone="accent">Alta</Tag> : null}
      </span>
      {opportunity.tags.length ? <span className="m">{opportunity.tags.slice(0, 3).map(tag => <Tag key={tag} tone="outline">{tag}</Tag>)}</span> : null}
      {canWrite ? (
        <select className="select move" value="" aria-label={`Mover ${opportunity.title}`} onChange={event => event.target.value && move(opportunity, event.target.value)}>
          <option value="">Mover para…</option>
          {pipeline?.stages.filter(stage => stage.id !== opportunity.stageId).map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
        </select>
      ) : null}
    </article>
  );

  return (
    <>
      <div className="filter-row" role="group" aria-label="Filtros do funil">
        {data.pipelines.length > 1 ? (
          <select className="select" value={data.pipeline.id} onChange={event => setPipelineId(event.target.value)} aria-label="Funil">
            {data.pipelines.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        ) : null}
        <input className="input" style={{ minWidth: 220 }} placeholder="Buscar oportunidade, contato ou empresa" defaultValue={filters.q} aria-label="Buscar"
          onKeyDown={event => { if (event.key === 'Enter') setFilters({ ...filters, q: (event.target as HTMLInputElement).value }); }} onBlur={event => setFilters({ ...filters, q: event.target.value })} />
        <select className="select" value={filters.owner} onChange={event => setFilters({ ...filters, owner: event.target.value })} aria-label="Responsável">
          <option value="">Todos os responsáveis</option>{settings.users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
        <select className="select" value={filters.source} onChange={event => setFilters({ ...filters, source: event.target.value })} aria-label="Origem">
          <option value="">Todas as origens</option>{settings.sources.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}
        </select>
      </div>
      <div className={`row${loading ? ' refreshing' : ''}`} style={{ justifyContent: 'space-between' }}>
        <div className="row small">
          <strong>{data.totals.openCount}</strong><span className="muted">em aberto</span><span className="faint">·</span>
          <strong>{money(data.totals.openValueCents, data.currency)}</strong><span className="muted">em negociação</span><span className="faint">·</span>
          <strong>{money(data.totals.weightedValueCents, data.currency)}</strong><span className="muted">ponderado pela probabilidade</span><ProvenanceBadge kind="workfoli" />
        </div>
        <span className="faint">Ganhos e perdidos: últimos {data.closedDays} dias</span>
      </div>
      {moveError ? <Notice>{moveError}</Notice> : null}
      {data.orphans.length ? (
        <Notice tone="info">
          <strong>{data.orphans.length} oportunidade(s) em etapa que saiu da configuração.</strong> Escolha a nova etapa:
          <div className="stack" style={{ marginTop: 10 }}>{data.orphans.map(opportunity => (
            <div key={opportunity.id} className="row"><a href={entityHref('opportunity', opportunity.id)}>{opportunity.title}</a>
              <select className="select move" style={{ width: 'auto' }} value="" aria-label={`Nova etapa de ${opportunity.title}`} onChange={event => event.target.value && move(opportunity, event.target.value)}>
                <option value="">Mover para…</option>{pipeline?.stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </div>
          ))}</div>
        </Notice>
      ) : null}
      {!all.length && !filters.q && !filters.owner && !filters.source ? (
        <p className="muted row"><Kanban size={16} aria-hidden="true" />Funil vazio. Crie uma oportunidade, converta um lead ou peça à IA: “Crie uma oportunidade de R$ 5.000 para a Padaria Central”.</p>
      ) : null}
      <div className={`board${loading ? ' refreshing' : ''}`}>
          {data.stages.map(stage => (
            <section key={stage.id} aria-label={stage.name} className={`column${over === stage.id ? ' drop-target' : ''}${stage.kind !== 'open' ? ' closed' : ''}`}
              onDragOver={event => { if (!canWrite) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (over !== stage.id) setOver(stage.id); }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null); }}
              onDrop={event => { event.preventDefault(); setOver(null); const target = all.find(item => item.id === event.dataTransfer.getData('text/plain')); if (target) void move(target, stage.id); }}>
              <div className="column-head">
                <span>{stage.name}{stage.probability !== null && stage.kind === 'open' ? <span className="faint"> · {stage.probability}%</span> : null}
                  <span className="sum">{stage.valueCents ? money(stage.valueCents, data.currency) : ' '}</span></span>
                <span className="count">{stage.count}</span>
              </div>
              {stage.requiredFields.length ? <div className="faint" style={{ fontSize: 12 }}>Exige: {stage.requiredFields.map(field => field.label).join(', ')}</div> : null}
              {stage.items.map(card)}
            </section>
          ))}
        </div>
      <MoveDialog settings={settings} request={request} onClose={() => setRequest(null)} onDone={() => { setRequest(null); reload(); }} />
    </>
  );
}
