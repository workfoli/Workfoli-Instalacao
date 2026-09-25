import { useState } from 'react';
import { BarList, Metric, PeriodFilter, formatCount, formatPercent, periodPreset } from '../../components/charts';
import type { PeriodValue } from '../../components/charts';
import { Card, Loading, Notice, useLoad } from '../../components/ui';
import { get } from '../../lib/api';
import { money } from '../../lib/crm';
import type { CrmSettings } from '../../lib/crm';

interface Summary {
  currency: string; period: { from: string; to: string; days: number };
  pipeline: { id: string; name: string }; pipelines: Array<{ id: string; name: string }>;
  open: { count: number; valueCents: number; weightedValueCents: number; stages: Array<{ id: string; name: string; probability: number | null; count: number; valueCents: number }>; orphanCount: number };
  leads: { total: number; converted: number; bySource: Array<{ sourceId: string | null; label: string; count: number }> };
  opportunities: { created: number };
  won: { count: number; valueCents: number; averageDays: number | null };
  lost: { count: number; byReason: Array<{ reason: string; count: number }> };
  wonBySource: Array<{ sourceId: string | null; label: string; count: number; valueCents: number }>;
  calculated: { winRate: number | null; leadConversionRate: number | null; averageDealCents: number | null };
}

/**
 * Resultados do CRM no período. Um filtro acima de tudo; indicadores como números (não gráficos de
 * uma barra); listas de barras de série única; taxas marcadas como cálculo da Workfoli.
 */
export function ResultsView({ settings }: { settings: CrmSettings }) {
  const [period, setPeriod] = useState<PeriodValue>(() => periodPreset('30'));
  const [pipelineId, setPipelineId] = useState('');
  const query = new URLSearchParams({ from: period.from, to: period.to, ...(pipelineId ? { pipeline: pipelineId } : {}) }).toString();
  const { data, error, loading } = useLoad(() => get<Summary>(`/api/crm/summary?${query}`), [query]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice>{error || 'Não foi possível carregar os resultados.'}</Notice>;
  const currency = data.currency;
  return (
    <>
      <PeriodFilter value={period} onChange={setPeriod}>
        {data.pipelines.length > 1 ? (
          <select className="select" value={data.pipeline.id} onChange={event => setPipelineId(event.target.value)} aria-label="Funil">
            {data.pipelines.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        ) : null}
      </PeriodFilter>
      <div className={`stack${loading ? ' refreshing' : ''}`} style={{ gap: 20 }}>
        <div className="grid grid-4">
          <Metric label="Em negociação agora" value={money(data.open.valueCents, currency, true)} hint={`${formatCount(data.open.count)} ${settings.labels.opportunities.toLowerCase()} em aberto`} provenance="crm" />
          <Metric label="Ponderado pela probabilidade" value={money(data.open.weightedValueCents, currency, true)} hint="valor × probabilidade de cada etapa" provenance="workfoli" />
          <Metric label="Ganhos no período" value={money(data.won.valueCents, currency, true)} hint={`${formatCount(data.won.count)} negócio(s)${data.won.averageDays !== null ? ` · ${data.won.averageDays} dias em média` : ''}`} provenance="crm" />
          <Metric label="Taxa de ganho" value={formatPercent(data.calculated.winRate, 0)} hint={`${data.won.count} ganhos, ${data.lost.count} perdidos no período`} provenance="workfoli" />
        </div>
        <div className="grid grid-3">
          <Metric label={`${settings.labels.leads} recebidos`} value={formatCount(data.leads.total)} hint={`${formatCount(data.leads.converted)} convertido(s)`} provenance="crm" />
          <Metric label="Conversão de leads" value={formatPercent(data.calculated.leadConversionRate, 0)} hint="leads do período já convertidos" provenance="workfoli" />
          <Metric label="Ticket médio (ganhos)" value={money(data.calculated.averageDealCents, currency, true)} provenance="workfoli" />
        </div>
        <div className="grid grid-2">
          <Card>
            <BarList title="Em aberto por etapa" subtitle={`${data.pipeline.name} · quantidade de ${settings.labels.opportunities.toLowerCase()}`}
              rows={data.open.stages.map(stage => ({ id: stage.id, label: stage.name, value: stage.count, hint: stage.valueCents ? money(stage.valueCents, currency, true) : undefined }))} format={formatCount} emptyText="Nenhuma etapa aberta." />
            {data.open.orphanCount ? <p className="faint" style={{ marginTop: 12 }}>+ {data.open.orphanCount} em etapa fora da configuração (veja o funil).</p> : null}
          </Card>
          <Card>
            <BarList title={`${settings.labels.leads} por origem`} subtitle="Recebidos no período" rows={data.leads.bySource.map(row => ({ id: row.sourceId ?? 'none', label: row.label, value: row.count }))} format={formatCount} emptyText="Nenhum lead no período." />
          </Card>
          <Card>
            <BarList title="Ganhos por origem" subtitle="Valor fechado no período" rows={data.wonBySource.map(row => ({ id: row.sourceId ?? 'none', label: row.label, value: row.valueCents, hint: `${row.count} negócio(s)` }))} format={value => money(value, currency, true)} emptyText="Nenhum negócio ganho no período." />
          </Card>
          <Card>
            <BarList title="Motivos de perda" subtitle="Negócios perdidos no período" rows={data.lost.byReason.map(row => ({ id: row.reason, label: row.reason, value: row.count }))} format={formatCount} emptyText="Nenhuma perda no período." />
          </Card>
        </div>
      </div>
    </>
  );
}
