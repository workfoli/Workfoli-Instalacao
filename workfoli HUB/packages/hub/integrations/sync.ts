import { randomUUID } from 'node:crypto';
import { audit } from '../audit.js';
import { crmConfig } from '../crm/config.js';
import { addActivity } from '../crm/history.js';
import { convertLeadTx, insertLead } from '../crm/service.js';
import { now, transaction } from '../db.js';
import type { HubDatabase } from '../db.js';
import { HttpError } from '../http.js';
import type { HubRuntime } from '../runtime.js';
import { resolvePeriod } from '../services/period.js';
import { analyticsData, googleAdsData, metaAdsData, metaLeads, searchConsoleData } from './adapters.js';
import type { MarketingData } from './adapters.js';
import { MARKETING_SOURCES, PROVIDERS } from './catalog.js';
import type { ConnectionProvider, MarketingSource } from './catalog.js';
import { connectionScopes, connectionSettings, liveConnection, requireConnection, updateSettings } from './connections.js';
import type { ConnectionRow } from './connections.js';
import { accessToken } from './oauth.js';

export type SyncKind = MarketingSource | 'meta-leads';
export interface SyncResult { kind: SyncKind; label: string; status: 'ok' | 'error' | 'skipped'; message: string | null; stats?: Record<string, number>; }
export interface SyncReport { provider: ConnectionProvider; from: string; to: string; results: SyncResult[]; }

const LABELS: Record<SyncKind, string> = { ...Object.fromEntries(Object.entries(MARKETING_SOURCES).map(([id, info]) => [id, info.label])) as Record<MarketingSource, string>, 'meta-leads': 'Formulários de lead (Meta)' };

function granted(row: ConnectionRow, provider: ConnectionProvider, capability: string): boolean {
  const definition = PROVIDERS[provider];
  if (definition.kind !== 'oauth') return false;
  const scopes = connectionScopes(row);
  return (definition.capabilities.find(item => item.id === capability)?.scopes ?? ['?']).every(scope => scopes.includes(scope));
}

/** Substitui os dados do período (a plataforma pode corrigir números antigos): sincronizar de novo nunca duplica. */
function storeMarketing(db: HubDatabase, source: MarketingSource, scope: string, data: MarketingData, from: string, to: string): Record<string, number> {
  return transaction(db, () => {
    const stamp = now();
    for (const campaign of data.campaigns) {
      db.prepare(`INSERT INTO mkt_campaigns(provider,external_id,account_ref,name,status,objective,updated_at) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(provider,external_id) DO UPDATE SET account_ref=excluded.account_ref, name=excluded.name, status=excluded.status, objective=excluded.objective, updated_at=excluded.updated_at`)
        .run(source, campaign.externalId, campaign.accountRef, campaign.name, campaign.status, campaign.objective, stamp);
    }
    db.prepare('DELETE FROM mkt_metrics_daily WHERE provider=? AND scope=? AND date>=? AND date<=?').run(source, scope, from, to);
    const insert = db.prepare('INSERT INTO mkt_metrics_daily(provider,scope,scope_id,date,metric,value,unit,currency,fetched_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(provider,scope,scope_id,date,metric) DO UPDATE SET value=excluded.value, unit=excluded.unit, currency=excluded.currency, fetched_at=excluded.fetched_at');
    for (const row of data.metrics) insert.run(source, row.scope, row.scopeId, row.date, row.metric, row.value, row.unit, row.currency ?? null, stamp);
    return { campaigns: data.campaigns.length, rows: data.metrics.length };
  });
}

async function runKind(runtime: HubRuntime, row: ConnectionRow, kind: SyncKind, work: () => Promise<Record<string, number>>): Promise<SyncResult> {
  const id = randomUUID();
  runtime.db.prepare("INSERT INTO integration_sync_runs(id,connection_id,kind,status,started_at) VALUES (?,?,?,'running',?)").run(id, row.id, kind, now());
  try {
    const stats = await work();
    runtime.db.prepare("UPDATE integration_sync_runs SET status='ok', finished_at=?, stats=? WHERE id=?").run(now(), JSON.stringify(stats), id);
    return { kind, label: LABELS[kind], status: 'ok', message: null, stats };
  } catch (error) {
    const message = error instanceof HttpError ? error.message : 'Falha inesperada na sincronização.';
    runtime.db.prepare("UPDATE integration_sync_runs SET status='error', finished_at=?, error=? WHERE id=?").run(now(), message.slice(0, 300), id);
    return { kind, label: LABELS[kind], status: 'error', message };
  }
}

const skipped = (kind: SyncKind, message: string): SyncResult => ({ kind, label: LABELS[kind], status: 'skipped', message });

/**
 * Sincroniza o que estiver conectado, autorizado e configurado. O que falta configurar aparece como
 * "pulado" com o motivo; nada é inventado para preencher lacunas.
 */
export async function syncProvider(runtime: HubRuntime, provider: ConnectionProvider, options: { from?: unknown; to?: unknown; actorId?: string | null } = {}): Promise<SyncReport> {
  if (provider !== 'google' && provider !== 'meta') throw new HttpError(400, `${PROVIDERS[provider].label} não tem dados de marketing para sincronizar.`);
  const row = requireConnection(runtime.db, provider);
  if (row.status === 'expired') throw new HttpError(409, `A autorização de ${PROVIDERS[provider].label} venceu. Reconecte em Integrações.`, 'reconnect');
  const period = resolvePeriod(runtime, options, 30);
  const settings = connectionSettings(row);
  const token = await accessToken(runtime, row);
  const results: SyncResult[] = [];
  if (provider === 'google') {
    if (!granted(row, provider, 'ads')) results.push(skipped('google-ads', 'Google Ads não foi autorizado nesta conexão.'));
    else if (typeof settings.adsCustomerId !== 'string') results.push(skipped('google-ads', 'Escolha a conta do Google Ads em Gerenciar.'));
    else if (!runtime.secrets.has('GOOGLE_ADS_DEVELOPER_TOKEN')) results.push(skipped('google-ads', 'Falta o token de desenvolvedor do Google Ads (GOOGLE_ADS_DEVELOPER_TOKEN).'));
    else results.push(await runKind(runtime, row, 'google-ads', async () => storeMarketing(runtime.db, 'google-ads', 'campaign',
      await googleAdsData(runtime, token, { customerId: settings.adsCustomerId as string, loginCustomerId: typeof settings.adsLoginCustomerId === 'string' ? settings.adsLoginCustomerId : null }, period.from, period.to), period.from, period.to)));
    if (!granted(row, provider, 'analytics')) results.push(skipped('google-analytics', 'Google Analytics não foi autorizado nesta conexão.'));
    else if (typeof settings.ga4PropertyId !== 'string') results.push(skipped('google-analytics', 'Escolha a propriedade do GA4 em Gerenciar.'));
    else results.push(await runKind(runtime, row, 'google-analytics', async () => storeMarketing(runtime.db, 'google-analytics', 'property', await analyticsData(runtime, token, settings.ga4PropertyId as string, period.from, period.to), period.from, period.to)));
    if (!granted(row, provider, 'search-console')) results.push(skipped('search-console', 'Search Console não foi autorizado nesta conexão.'));
    else if (typeof settings.searchConsoleSite !== 'string') results.push(skipped('search-console', 'Escolha o site do Search Console em Gerenciar.'));
    else results.push(await runKind(runtime, row, 'search-console', async () => storeMarketing(runtime.db, 'search-console', 'site', await searchConsoleData(runtime, token, settings.searchConsoleSite as string, period.from, period.to), period.from, period.to)));
  } else {
    if (!granted(row, provider, 'ads')) results.push(skipped('meta-ads', 'Meta Ads não foi autorizado nesta conexão.'));
    else if (typeof settings.adAccountId !== 'string') results.push(skipped('meta-ads', 'Escolha a conta de anúncios em Gerenciar.'));
    else results.push(await runKind(runtime, row, 'meta-ads', async () => storeMarketing(runtime.db, 'meta-ads', 'campaign', await metaAdsData(runtime, token, settings.adAccountId as string, period.from, period.to), period.from, period.to)));
    results.push(await syncMetaLeads(runtime, row, token, settings));
  }
  const failures = results.filter(item => item.status === 'error');
  runtime.db.prepare('UPDATE integration_connections SET last_sync_at=?, last_error=?, updated_at=? WHERE id=?').run(now(), failures[0]?.message ?? null, now(), row.id);
  audit(runtime.db, options.actorId ? { type: 'user', id: options.actorId } : { type: 'system', id: null }, 'integration.synced', provider,
    { ok: results.filter(item => item.status === 'ok').length, errors: failures.length, skipped: results.filter(item => item.status === 'skipped').length }, failures.length ? 'error' : 'ok');
  return { provider, from: period.from, to: period.to, results };
}

/** Leads dos formulários da Meta entram no CRM somente se a Base ligou esse vínculo (crm.integrations). */
async function syncMetaLeads(runtime: HubRuntime, row: ConnectionRow, token: string, settings: Record<string, unknown>): Promise<SyncResult> {
  const config = crmConfig(runtime);
  const link = config.integrations.find(item => item.provider === 'meta');
  if (!config.enabled) return skipped('meta-leads', 'O CRM está desligado nesta Base.');
  if (!link?.leads) return skipped('meta-leads', 'A Base não liga os formulários da Meta ao CRM (Configuração do CRM → Integrações).');
  if (!granted(row, 'meta', 'leads')) return skipped('meta-leads', 'Os formulários de lead não foram autorizados nesta conexão.');
  const pageIds = Array.isArray(settings.pageIds) ? settings.pageIds.filter((item): item is string => typeof item === 'string') : [];
  if (!pageIds.length) return skipped('meta-leads', 'Escolha as páginas em Gerenciar.');
  return runKind(runtime, row, 'meta-leads', async () => {
    const cursor = typeof settings.leadsSince === 'string' ? settings.leadsSince : new Date(Date.now() - 30 * 86_400_000).toISOString();
    const startedAt = new Date().toISOString();
    const { leads, forms } = await metaLeads(runtime, token, pageIds, cursor);
    let created = 0, duplicates = 0, opportunities = 0, failed = 0;
    const actor = { type: 'integration' as const, id: row.id, origin: 'integration:meta' };
    for (const lead of leads) {
      // Cada lead na sua transação: um registro ruim não impede os outros, e o lead nunca se perde
      // porque a oportunidade automática falhou (ela é um segundo passo, com o motivo no histórico).
      let leadId: string | null = null;
      try {
        const result = transaction(runtime.db, () => insertLead(runtime, config, actor, {
          name: lead.name.slice(0, 160), email: lead.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email) ? lead.email.slice(0, 254) : null,
          phone: lead.phone && /^[+()\d\s.-]{6,40}$/.test(lead.phone) ? lead.phone : null, company: lead.company?.slice(0, 160) ?? null,
          message: lead.message, sourceId: link.source, attribution: lead.attribution,
        }, { integrationId: row.id, externalRef: lead.externalRef, provider: 'Meta Lead Ads', occurredAt: lead.createdAt }));
        if (result.duplicate) { duplicates += 1; continue; }
        created += 1;
        leadId = result.id;
      } catch { failed += 1; continue; }
      if (!link.pipeline || !leadId) continue;
      try {
        transaction(runtime.db, () => convertLeadTx(runtime, config, actor, leadId!, { pipelineId: link.pipeline }));
        opportunities += 1;
      } catch (error) {
        addActivity(runtime.db, actor, { entityType: 'lead', entityId: leadId, kind: 'history', action: 'auto_convert_failed', body: `Oportunidade automática não criada: ${error instanceof HttpError ? error.message : 'erro inesperado'}` });
      }
    }
    // Com falhas, o cursor não avança: a próxima rodada tenta de novo (a deduplicação evita repetir os que entraram).
    if (!failed) updateSettings(runtime.db, liveConnection(runtime.db, 'meta') ?? row, { leadsSince: startedAt });
    return { forms, received: leads.length, created, duplicates, opportunities, failed };
  });
}

/** Sincronização periódica: só o que está conectado há mais de `maxAgeHours` sem sincronizar. */
export async function autoSync(runtime: HubRuntime, maxAgeHours = 6): Promise<void> {
  for (const provider of ['google', 'meta'] as const) {
    const row = liveConnection(runtime.db, provider);
    if (!row || row.status !== 'connected') continue;
    if (row.last_sync_at && Date.now() - Date.parse(row.last_sync_at) < maxAgeHours * 3_600_000) continue;
    try { await syncProvider(runtime, provider, {}); } catch { /* registrado na conexão; tenta de novo no próximo ciclo */ }
  }
}
