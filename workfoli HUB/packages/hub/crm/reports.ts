import type { HubRuntime } from '../runtime.js';
import { resolvePeriod } from '../services/period.js';
import { crmConfig, crmSources, pipelineOf, sourceLabel } from './config.js';

const ratio = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

/**
 * Resumo do CRM num período. Contagens vêm direto do banco; taxas e valores ponderados são
 * CALCULADOS pela Workfoli (marcados como tal), nunca apresentados como dado de plataforma.
 */
export function crmSummary(runtime: HubRuntime, options: { from?: unknown; to?: unknown; pipelineId?: unknown } = {}) {
  const config = crmConfig(runtime);
  const pipeline = pipelineOf(config, options.pipelineId);
  const period = resolvePeriod(runtime, options);
  const db = runtime.db;
  const openRows = db.prepare(`SELECT stage_id, COUNT(*) AS n, COALESCE(SUM(value_cents),0) AS v FROM crm_opportunities
    WHERE pipeline_id=? AND status='open' AND archived_at IS NULL GROUP BY stage_id`).all(pipeline.id) as Array<{ stage_id: string; n: number; v: number }>;
  const stages = pipeline.stages.filter(stage => stage.kind === 'open').map(stage => {
    const row = openRows.find(item => item.stage_id === stage.id);
    return { id: stage.id, name: stage.name, probability: stage.probability ?? null, count: Number(row?.n ?? 0), valueCents: Number(row?.v ?? 0) };
  });
  const orphanCount = openRows.filter(row => !pipeline.stages.some(stage => stage.id === row.stage_id)).reduce((sum, row) => sum + Number(row.n), 0);
  const openValue = openRows.reduce((sum, row) => sum + Number(row.v), 0);
  const weighted = stages.reduce((sum, stage) => sum + (stage.probability === null ? 0 : Math.round(stage.valueCents * stage.probability / 100)), 0);

  const between = 'created_at>=? AND created_at<?';
  const leadsBySource = db.prepare(`SELECT source_id, COUNT(*) AS n FROM crm_leads WHERE ${between} AND archived_at IS NULL GROUP BY source_id ORDER BY n DESC`)
    .all(period.startUtc, period.endUtc) as Array<{ source_id: string | null; n: number }>;
  const leads = leadsBySource.reduce((sum, row) => sum + Number(row.n), 0);
  const converted = Number((db.prepare(`SELECT COUNT(*) AS n FROM crm_leads WHERE ${between} AND status='converted' AND archived_at IS NULL`).get(period.startUtc, period.endUtc) as { n: number }).n);
  const createdOpportunities = Number((db.prepare(`SELECT COUNT(*) AS n FROM crm_opportunities WHERE ${between} AND pipeline_id=? AND archived_at IS NULL`).get(period.startUtc, period.endUtc, pipeline.id) as { n: number }).n);
  const closed = db.prepare(`SELECT status, COUNT(*) AS n, COALESCE(SUM(value_cents),0) AS v,
      AVG(julianday(closed_at) - julianday(created_at)) AS days FROM crm_opportunities
    WHERE closed_at>=? AND closed_at<? AND pipeline_id=? AND status IN ('won','lost') AND archived_at IS NULL GROUP BY status`)
    .all(period.startUtc, period.endUtc, pipeline.id) as Array<{ status: 'won' | 'lost'; n: number; v: number; days: number | null }>;
  const won = closed.find(row => row.status === 'won');
  const lost = closed.find(row => row.status === 'lost');
  const lostReasons = db.prepare(`SELECT COALESCE(lost_reason,'Sem motivo') AS reason, COUNT(*) AS n FROM crm_opportunities
    WHERE closed_at>=? AND closed_at<? AND pipeline_id=? AND status='lost' AND archived_at IS NULL GROUP BY reason ORDER BY n DESC`)
    .all(period.startUtc, period.endUtc, pipeline.id) as Array<{ reason: string; n: number }>;
  const wonBySource = db.prepare(`SELECT source_id, COUNT(*) AS n, COALESCE(SUM(value_cents),0) AS v FROM crm_opportunities
    WHERE closed_at>=? AND closed_at<? AND status='won' AND archived_at IS NULL GROUP BY source_id`).all(period.startUtc, period.endUtc) as Array<{ source_id: string | null; n: number; v: number }>;
  const wonCount = Number(won?.n ?? 0), lostCount = Number(lost?.n ?? 0);

  return {
    currency: config.currency,
    period: { from: period.from, to: period.to, days: period.days, timeZone: period.timeZone },
    pipeline: { id: pipeline.id, name: pipeline.name },
    pipelines: config.pipelines.map(item => ({ id: item.id, name: item.name })),
    open: { count: stages.reduce((sum, stage) => sum + stage.count, 0) + orphanCount, valueCents: openValue, weightedValueCents: weighted, stages, orphanCount },
    leads: {
      total: leads, converted,
      bySource: leadsBySource.map(row => ({ sourceId: row.source_id, label: sourceLabel(config, row.source_id) ?? 'Sem origem', count: Number(row.n) })),
    },
    opportunities: { created: createdOpportunities },
    won: { count: wonCount, valueCents: Number(won?.v ?? 0), averageDays: won?.days === null || won?.days === undefined ? null : Math.round(Number(won.days) * 10) / 10 },
    lost: { count: lostCount, byReason: lostReasons.map(row => ({ reason: row.reason, count: Number(row.n) })) },
    wonBySource: wonBySource.map(row => ({ sourceId: row.source_id, label: sourceLabel(config, row.source_id) ?? 'Sem origem', count: Number(row.n), valueCents: Number(row.v) })),
    /** Indicadores derivados: calculados pela Workfoli a partir dos dados acima. */
    calculated: {
      winRate: ratio(wonCount, wonCount + lostCount),
      leadConversionRate: ratio(converted, leads),
      averageDealCents: wonCount ? Math.round(Number(won?.v ?? 0) / wonCount) : null,
    },
    sources: crmSources(config).map(source => ({ id: source.id, label: source.label, kind: source.kind })),
  };
}
