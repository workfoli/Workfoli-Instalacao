import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { BarList, DailyChart, Metric, PeriodFilter, ProvenanceBadge, formatCount, formatMicros, formatPercent, periodPreset } from '../components/charts';
import type { PeriodValue } from '../components/charts';
import { Card, Loading, Notice, PageHead, Tag, useLoad } from '../components/ui';
import { get } from '../lib/api';
import { formatDateTime, relative } from '../lib/format';
import { money } from '../lib/crm';

interface AdsSource {
  id: 'google-ads' | 'meta-ads'; label: string; hasData: boolean; currency: string | null; mixedCurrencies: boolean; resultLabel: string;
  platform: { impressions: number | null; clicks: number | null; spendMicros: number | null; conversions: number | null; platformLeads: number | null };
  crm: { leads: number; wonValueCents: number };
  calculated: { ctr: number | null; cpcMicros: number | null; costPerResultMicros: number | null; costPerCrmLeadMicros: number | null; wonPerSpend: number | null };
  campaigns: Array<{ id: string; name: string; status: string | null; platform: AdsSource['platform']; calculated: { ctr: number | null; cpcMicros: number | null; costPerResultMicros: number | null } }>;
}
interface Summary {
  period: { from: string; to: string; days: number }; currency: string;
  connections: Record<'google' | 'meta', { status: string; lastSyncAt: string | null; lastError: string | null } | null>;
  ads: AdsSource[];
  site: {
    analytics: { hasData: boolean; platform: { sessions: number | null; keyEvents: number | null } };
    searchConsole: { hasData: boolean; platform: { clicks: number | null; impressions: number | null }; calculated: { ctr: number | null; averagePosition: number | null } };
    crm: { organicLeads: number };
  };
  crm: { leadsBySource: Array<{ sourceId: string | null; label: string; count: number }> };
  daily: Array<{ date: string; googleSpendMicros: number | null; metaSpendMicros: number | null; sessions: number | null; crmLeads: number }>;
}

const count = (value: number | null) => (value === null ? '—' : formatCount(value));
const STATUS: Record<string, string> = { ENABLED: 'Ativa', PAUSED: 'Pausada', REMOVED: 'Removida', ACTIVE: 'Ativa', ARCHIVED: 'Arquivada', DELETED: 'Excluída' };

/**
 * Marketing: o que as plataformas informaram (com a hora da última sincronização), o que o CRM registrou
 * e o que a Workfoli calcula a partir dos dois — sempre rotulados. Sem dado, fica em branco.
 */
export function MarketingPage() {
  const [period, setPeriod] = useState<PeriodValue>(() => periodPreset('30'));
  const query = `from=${period.from}&to=${period.to}`;
  const { data, error, loading } = useLoad(() => get<Summary>(`/api/marketing?${query}`), [query]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice>{error || 'Não foi possível carregar o marketing.'}</Notice>;
  const connectedAny = !!(data.connections.google || data.connections.meta);
  const syncInfo = (provider: 'google' | 'meta') => {
    const connection = data.connections[provider];
    return connection ? (connection.lastSyncAt ? `atualizado ${relative(connection.lastSyncAt)}` : 'ainda não sincronizado') : 'não conectado';
  };
  return (
    <>
      <PageHead eyebrow="Operação" title="Marketing"
        lead="Investimento, campanhas, site e leads. Números das plataformas aparecem como informados; taxas e custos por resultado são calculados pela Workfoli e marcados assim." />
      <PeriodFilter value={period} onChange={setPeriod}>
        <span className="faint">Google: {syncInfo('google')} · Meta: {syncInfo('meta')}</span>
      </PeriodFilter>
      {!connectedAny ? (
        <Notice tone="info">Nenhuma conta de mídia conectada. Conecte Google e Meta em <a href="#/integrations">Integrações</a> para ver investimento e campanhas. Os leads do CRM já aparecem abaixo.</Notice>
      ) : null}
      <div className={`stack${loading ? ' refreshing' : ''}`} style={{ gap: 24 }}>
        {data.ads.map(source => <AdsSection key={source.id} source={source} daily={data.daily} crmCurrency={data.currency} lastSync={data.connections[source.id === 'google-ads' ? 'google' : 'meta']?.lastSyncAt ?? null} />)}

        <Card title="Site" meta={`Google Analytics 4 e Search Console · ${syncInfo('google')}`}>
          {!data.site.analytics.hasData && !data.site.searchConsole.hasData ? (
            <p className="muted">Sem dados do site no período. Conecte o Google (Analytics e Search Console) e escolha a propriedade e o site em Integrações → Gerenciar.</p>
          ) : (
            <div className="stack" style={{ gap: 20 }}>
              <div className="grid grid-3">
                <Metric label="Sessões" value={count(data.site.analytics.platform.sessions)} provenance="platform" detail="GA4" />
                <Metric label="Eventos-chave" value={count(data.site.analytics.platform.keyEvents)} provenance="platform" detail="GA4" />
                <Metric label="Leads do site e busca orgânica" value={formatCount(data.site.crm.organicLeads)} hint="origem Site ou Google orgânico" provenance="crm" />
              </div>
              <div className="grid grid-4">
                <Metric label="Cliques na busca" value={count(data.site.searchConsole.platform.clicks)} provenance="platform" detail="Search Console" />
                <Metric label="Impressões na busca" value={count(data.site.searchConsole.platform.impressions)} provenance="platform" detail="Search Console" />
                <Metric label="CTR da busca" value={formatPercent(data.site.searchConsole.calculated.ctr)} provenance="workfoli" />
                <Metric label="Posição média" value={data.site.searchConsole.calculated.averagePosition ?? '—'} hint="ponderada pelas impressões" provenance="workfoli" />
              </div>
              {data.site.analytics.hasData ? <DailyChart title="Sessões por dia" subtitle="Google Analytics 4 · dado da plataforma" kind="line" points={data.daily.map(day => ({ x: day.date, y: day.sessions }))} format={formatCount} /> : null}
            </div>
          )}
        </Card>

        <div className="grid grid-2">
          <Card><DailyChart title="Leads no CRM por dia" subtitle="Todas as origens · do CRM" points={data.daily.map(day => ({ x: day.date, y: day.crmLeads }))} format={formatCount} emptyText="Nenhum lead no período." /></Card>
          <Card><BarList title="Leads por origem" subtitle="Do CRM, no período" rows={data.crm.leadsBySource.map(row => ({ id: row.sourceId ?? 'none', label: row.label, value: row.count }))} format={formatCount} emptyText="Nenhum lead no período." /></Card>
        </div>
      </div>
    </>
  );
}

function AdsSection({ source, daily, crmCurrency, lastSync }: { source: AdsSource; daily: Summary['daily']; crmCurrency: string; lastSync: string | null }) {
  const currency = source.currency;
  const micros = (value: number | null) => formatMicros(value, currency);
  const spendKey = source.id === 'google-ads' ? 'googleSpendMicros' : 'metaSpendMicros';
  const result = source.id === 'meta-ads' ? source.platform.platformLeads : source.platform.conversions;
  return (
    <Card title={<><Megaphone size={18} />{source.label}</>} meta={lastSync ? `Última sincronização ${formatDateTime(lastSync)}` : 'Sem sincronização'}>
      {!source.hasData ? (
        <p className="muted">Sem dados do {source.label} no período. Conecte a conta em <a href="#/integrations">Integrações</a>, escolha a conta de anúncios em Gerenciar e sincronize. Sem dados, nada é estimado.</p>
      ) : (
        <div className="stack" style={{ gap: 20 }}>
          {source.mixedCurrencies ? <Notice tone="info">Há campanhas em mais de uma moeda; os totais somam valores de moedas diferentes e servem só de referência.</Notice> : null}
          <div className="grid grid-4">
            <Metric label="Investimento" value={formatMicros(source.platform.spendMicros, currency, true)} provenance="platform" />
            <Metric label="Impressões" value={count(source.platform.impressions)} provenance="platform" />
            <Metric label="Cliques" value={count(source.platform.clicks)} provenance="platform" />
            <Metric label={source.resultLabel} value={count(result)} provenance="platform" />
          </div>
          <div className="grid grid-4">
            <Metric label="CTR" value={formatPercent(source.calculated.ctr, 2)} hint="cliques ÷ impressões" provenance="workfoli" />
            <Metric label="Custo por clique" value={micros(source.calculated.cpcMicros)} provenance="workfoli" />
            <Metric label={source.id === 'meta-ads' ? 'Custo por lead (Meta)' : 'Custo por conversão'} value={micros(source.calculated.costPerResultMicros)} provenance="workfoli" />
            <Metric label="Custo por lead no CRM" value={micros(source.calculated.costPerCrmLeadMicros)} hint={`${source.crm.leads} lead(s) com esta origem`} provenance="workfoli" />
          </div>
          <div className="row small">
            <span className="muted">Negócios ganhos desta origem no período:</span><strong>{money(source.crm.wonValueCents, crmCurrency)}</strong><ProvenanceBadge kind="crm" />
            {source.calculated.wonPerSpend !== null ? <><span className="faint">·</span><span className="muted">retorno sobre o investimento:</span><strong>{source.calculated.wonPerSpend.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}×</strong><ProvenanceBadge kind="workfoli" /></> : null}
          </div>
          <DailyChart title="Investimento por dia" subtitle={`${source.label} · dado da plataforma`} points={daily.map(day => ({ x: day.date, y: day[spendKey] }))}
            format={value => formatMicros(value, currency)} axisFormat={value => formatMicros(value, currency, true)} />
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Campanha</th><th className="hide-mobile">Situação</th><th className="num">Investimento</th><th className="num hide-mobile">Impressões</th><th className="num">Cliques</th><th className="num">CTR*</th><th className="num">{source.id === 'meta-ads' ? 'Leads' : 'Conv.'}</th><th className="num">Custo/result.*</th></tr></thead>
              <tbody>{source.campaigns.map(campaign => (
                <tr key={campaign.id}>
                  <td>{campaign.name}</td>
                  <td className="hide-mobile">{campaign.status ? <Tag tone={/ENABLED|ACTIVE/.test(campaign.status) ? 'accent' : 'outline'}>{STATUS[campaign.status] ?? campaign.status}</Tag> : '—'}</td>
                  <td className="num">{micros(campaign.platform.spendMicros)}</td>
                  <td className="num hide-mobile">{count(campaign.platform.impressions)}</td>
                  <td className="num">{count(campaign.platform.clicks)}</td>
                  <td className="num">{formatPercent(campaign.calculated.ctr, 2)}</td>
                  <td className="num">{count(source.id === 'meta-ads' ? campaign.platform.platformLeads : campaign.platform.conversions)}</td>
                  <td className="num">{micros(campaign.calculated.costPerResultMicros)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="faint">* Calculado pela Workfoli a partir dos números da plataforma.</p>
        </div>
      )}
    </Card>
  );
}
