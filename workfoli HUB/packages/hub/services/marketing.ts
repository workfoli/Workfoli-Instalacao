import { crmConfig, sourceLabel } from '../crm/config.js';
import type { HubRuntime } from '../runtime.js';
import { MARKETING_SOURCES } from '../integrations/catalog.js';
import type { MarketingSource } from '../integrations/catalog.js';
import { liveConnection } from '../integrations/connections.js';
import { addDays, resolvePeriod } from './period.js';

/**
 * Painel de marketing. Três tipos de número, sempre separados na resposta:
 *  - `platform`: exatamente o que Google/Meta informaram (sincronizado, com data de atualização);
 *  - `crm`: contagens do próprio CRM (leads, oportunidades, negócios ganhos);
 *  - `calculated`: razões calculadas pela Workfoli a partir dos dois (CTR, CPC, custo por lead...).
 * Métrica ausente é `null` (sem dado), nunca zero inventado.
 */

const ratio = (part: number | null, whole: number | null): number | null => (part === null || whole === null || whole <= 0 ? null : part / whole);
const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

interface CampaignView {
  id: string; name: string; status: string | null;
  platform: { impressions: number | null; clicks: number | null; spendMicros: number | null; conversions: number | null; platformLeads: number | null };
  calculated: { ctr: number | null; cpcMicros: number | null; costPerResultMicros: number | null };
}

function adsSource(runtime: HubRuntime, source: 'google-ads' | 'meta-ads', from: string, to: string, crmLeads: number, wonCents: number, crmCurrency: string) {
  const rows = runtime.db.prepare(`SELECT m.scope_id AS id, c.name, c.status,
      SUM(CASE WHEN m.metric='impressions' THEN m.value END) AS impressions, SUM(CASE WHEN m.metric='clicks' THEN m.value END) AS clicks,
      SUM(CASE WHEN m.metric='spend' THEN m.value END) AS spend, MAX(CASE WHEN m.metric='spend' THEN m.currency END) AS currency,
      SUM(CASE WHEN m.metric='conversions' THEN m.value END) AS conversions, SUM(CASE WHEN m.metric='platform_leads' THEN m.value END) AS platform_leads
    FROM mkt_metrics_daily m LEFT JOIN mkt_campaigns c ON c.provider=m.provider AND c.external_id=m.scope_id
    WHERE m.provider=? AND m.scope='campaign' AND m.date>=? AND m.date<=? GROUP BY m.scope_id ORDER BY spend DESC`).all(source, from, to) as Array<Record<string, unknown>>;
  const currencies = [...new Set(rows.map(row => row.currency).filter((value): value is string => typeof value === 'string'))];
  const sum = (key: string) => (rows.some(row => row[key] !== null && row[key] !== undefined) ? rows.reduce((total, row) => total + (num(row[key]) ?? 0), 0) : null);
  const totals = { impressions: sum('impressions'), clicks: sum('clicks'), spendMicros: sum('spend'), conversions: sum('conversions'), platformLeads: sum('platform_leads') };
  const results = source === 'meta-ads' ? totals.platformLeads : totals.conversions;
  const currency = currencies.length === 1 ? currencies[0]! : null;
  const campaigns: CampaignView[] = rows.map(row => {
    const platform = { impressions: num(row.impressions), clicks: num(row.clicks), spendMicros: num(row.spend), conversions: num(row.conversions), platformLeads: num(row.platform_leads) };
    return {
      id: String(row.id), name: (row.name as string | null) ?? `Campanha ${row.id}`, status: (row.status as string | null) ?? null, platform,
      calculated: { ctr: ratio(platform.clicks, platform.impressions), cpcMicros: ratio(platform.spendMicros, platform.clicks), costPerResultMicros: ratio(platform.spendMicros, source === 'meta-ads' ? platform.platformLeads : platform.conversions) },
    };
  });
  const sameCurrency = currency !== null && currency === crmCurrency;
  return {
    id: source, label: MARKETING_SOURCES[source].label, hasData: rows.length > 0, currency,
    mixedCurrencies: currencies.length > 1,
    resultLabel: source === 'meta-ads' ? 'Leads informados pela Meta' : 'Conversões informadas pelo Google',
    platform: totals,
    crm: { leads: crmLeads, wonValueCents: wonCents },
    calculated: {
      ctr: ratio(totals.clicks, totals.impressions), cpcMicros: ratio(totals.spendMicros, totals.clicks), costPerResultMicros: ratio(totals.spendMicros, results),
      costPerCrmLeadMicros: ratio(totals.spendMicros, crmLeads || null),
      // Retorno só quando investimento e CRM estão na mesma moeda; senão, não compara.
      wonPerSpend: sameCurrency && totals.spendMicros ? ratio(wonCents / 100, totals.spendMicros / 1_000_000) : null,
    },
    campaigns,
  };
}

export function marketingSummary(runtime: HubRuntime, input: { from?: unknown; to?: unknown } = {}) {
  const period = resolvePeriod(runtime, input, 30);
  const db = runtime.db;
  const config = crmConfig(runtime);
  const crmBySource = (sourceId: string) => Number((db.prepare('SELECT COUNT(*) AS n FROM crm_leads WHERE source_id=? AND created_at>=? AND created_at<? AND archived_at IS NULL').get(sourceId, period.startUtc, period.endUtc) as { n: number }).n);
  const wonBySource = (sourceId: string) => Number((db.prepare("SELECT COALESCE(SUM(value_cents),0) AS v FROM crm_opportunities WHERE source_id=? AND status='won' AND closed_at>=? AND closed_at<? AND archived_at IS NULL").get(sourceId, period.startUtc, period.endUtc) as { v: number }).v);
  const ads = (['google-ads', 'meta-ads'] as const).map(source => adsSource(runtime, source, period.from, period.to, crmBySource(source), wonBySource(source), config.currency));

  const siteMetric = (provider: MarketingSource, metric: string) => {
    const row = db.prepare('SELECT COUNT(*) AS n, SUM(value) AS v FROM mkt_metrics_daily WHERE provider=? AND metric=? AND date>=? AND date<=?').get(provider, metric, period.from, period.to) as { n: number; v: number | null };
    return Number(row.n) ? Number(row.v) : null;
  };
  const scImpressions = siteMetric('search-console', 'impressions');
  const weightedPosition = db.prepare(`SELECT SUM(p.value * i.value) / NULLIF(SUM(i.value), 0) AS position FROM mkt_metrics_daily p
    JOIN mkt_metrics_daily i ON i.provider=p.provider AND i.scope_id=p.scope_id AND i.date=p.date AND i.metric='impressions'
    WHERE p.provider='search-console' AND p.metric='position' AND p.date>=? AND p.date<=?`).get(period.from, period.to) as { position: number | null };
  const organicLeads = crmBySource('google-organico') + crmBySource('site');

  // Série diária: dia sem linha vale 0 só para fontes que têm dados no período (a plataforma não reportou atividade).
  const days: string[] = [];
  for (let day = period.from; day <= period.to; day = addDays(day, 1)) days.push(day);
  const dailyRows = db.prepare(`SELECT provider, date, metric, SUM(value) AS v FROM mkt_metrics_daily WHERE date>=? AND date<=? AND metric IN ('spend','clicks','sessions') GROUP BY provider, date, metric`)
    .all(period.from, period.to) as Array<{ provider: string; date: string; metric: string; v: number }>;
  const hasSource = (provider: string) => dailyRows.some(row => row.provider === provider);
  const value = (provider: string, date: string, metric: string) => hasSource(provider) ? Number(dailyRows.find(row => row.provider === provider && row.date === date && row.metric === metric)?.v ?? 0) : null;
  // Dia do lead no fuso da empresa (não em UTC), para bater com o dia das plataformas.
  const dayOf = new Intl.DateTimeFormat('en-CA', { timeZone: period.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const leadCounts = new Map<string, number>();
  for (const row of db.prepare('SELECT created_at FROM crm_leads WHERE created_at>=? AND created_at<? AND archived_at IS NULL').all(period.startUtc, period.endUtc) as Array<{ created_at: string }>) {
    const day = dayOf.format(new Date(row.created_at));
    leadCounts.set(day, (leadCounts.get(day) ?? 0) + 1);
  }
  const daily = days.map(date => ({
    date,
    googleSpendMicros: value('google-ads', date, 'spend'), metaSpendMicros: value('meta-ads', date, 'spend'),
    sessions: value('google-analytics', date, 'sessions'),
    crmLeads: leadCounts.get(date) ?? 0,
  }));

  const connection = (provider: 'google' | 'meta') => {
    const row = liveConnection(db, provider);
    return row ? { status: row.status, lastSyncAt: row.last_sync_at, lastError: row.last_error } : null;
  };
  const leadsBySource = db.prepare('SELECT source_id, COUNT(*) AS n FROM crm_leads WHERE created_at>=? AND created_at<? AND archived_at IS NULL GROUP BY source_id ORDER BY n DESC')
    .all(period.startUtc, period.endUtc) as Array<{ source_id: string | null; n: number }>;
  return {
    period: { from: period.from, to: period.to, days: period.days, timeZone: period.timeZone },
    currency: config.currency,
    connections: { google: connection('google'), meta: connection('meta') },
    ads,
    site: {
      analytics: { hasData: siteMetric('google-analytics', 'sessions') !== null, platform: { sessions: siteMetric('google-analytics', 'sessions'), keyEvents: siteMetric('google-analytics', 'key_events') } },
      searchConsole: {
        hasData: scImpressions !== null,
        platform: { clicks: siteMetric('search-console', 'clicks'), impressions: scImpressions },
        calculated: { ctr: ratio(siteMetric('search-console', 'clicks'), scImpressions), averagePosition: weightedPosition.position === null ? null : Math.round(Number(weightedPosition.position) * 10) / 10 },
      },
      crm: { organicLeads },
    },
    crm: { leadsBySource: leadsBySource.map(row => ({ sourceId: row.source_id, label: sourceLabel(config, row.source_id) ?? 'Sem origem', count: Number(row.n) })) },
    daily,
  };
}
