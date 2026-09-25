import { HttpError } from '../http.js';
import type { HubRuntime } from '../runtime.js';
import { API_VERSIONS } from './catalog.js';
import { requestJson } from './env.js';

/**
 * Adaptadores: cada provedor fala a própria língua; daqui para dentro tudo é normalizado.
 * Métricas guardam SÓ o que a plataforma informou (dado da plataforma). Taxas e custos por
 * resultado são calculados depois, pela Workfoli, e exibidos como tal.
 */

export type MetricUnit = 'count' | 'micros' | 'ratio' | 'position';
export interface MetricRow { scope: 'account' | 'campaign' | 'property' | 'site'; scopeId: string; date: string; metric: string; value: number; unit: MetricUnit; currency?: string | null; }
export interface CampaignRow { externalId: string; name: string; status: string | null; objective: string | null; accountRef: string | null; }
export interface MarketingData { campaigns: CampaignRow[]; metrics: MetricRow[]; }
export interface Option { id: string; label: string; detail?: string | null; }

const number = (value: unknown): number => {
  const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};
const isoDay = (value: string) => (/^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value.slice(0, 10));

// ————————————————— Google Ads —————————————————

function adsHeaders(runtime: HubRuntime, token: string, loginCustomerId?: string | null): Record<string, string> {
  const developerToken = runtime.secrets.get('GOOGLE_ADS_DEVELOPER_TOKEN');
  if (!developerToken) throw new HttpError(409, 'Falta o token de desenvolvedor do Google Ads (GOOGLE_ADS_DEVELOPER_TOKEN) nesta instalação.', 'app-credentials-missing', { missing: ['GOOGLE_ADS_DEVELOPER_TOKEN'] });
  return { Authorization: `Bearer ${token}`, 'developer-token': developerToken, ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}) };
}

export async function googleAdsCustomers(runtime: HubRuntime, token: string, loginCustomerId?: string | null): Promise<Option[]> {
  const base = `${runtime.integrations.endpoint('google.ads')}/${API_VERSIONS.googleAds}`;
  const headers = adsHeaders(runtime, token, loginCustomerId);
  const list = await requestJson<{ resourceNames?: string[] }>(runtime.integrations, 'Google Ads', `${base}/customers:listAccessibleCustomers`, { headers });
  const ids = (list.resourceNames ?? []).map(name => name.replace(/^customers\//, '')).filter(id => /^\d{6,12}$/.test(id)).slice(0, 25);
  const options: Option[] = [];
  for (const id of ids) {
    try {
      const batches = await requestJson<Array<{ results?: Array<{ customer?: { descriptiveName?: string; currencyCode?: string; manager?: boolean } }> }>>(runtime.integrations, 'Google Ads', `${base}/customers/${id}/googleAds:searchStream`, {
        headers, json: { query: 'SELECT customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1' },
      });
      const customer = batches?.[0]?.results?.[0]?.customer;
      options.push({ id, label: customer?.descriptiveName || `Conta ${id}`, detail: [customer?.currencyCode, customer?.manager ? 'conta gerenciadora' : null].filter(Boolean).join(' · ') || null });
    } catch { options.push({ id, label: `Conta ${id}`, detail: 'sem acesso ao nome' }); }
  }
  return options;
}

export async function googleAdsData(runtime: HubRuntime, token: string, settings: { customerId: string; loginCustomerId?: string | null }, from: string, to: string): Promise<MarketingData> {
  const base = `${runtime.integrations.endpoint('google.ads')}/${API_VERSIONS.googleAds}`;
  const query = `SELECT customer.currency_code, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}'`;
  const batches = await requestJson<Array<{ results?: Array<Record<string, any>> }>>(runtime.integrations, 'Google Ads', `${base}/customers/${settings.customerId}/googleAds:searchStream`, {
    headers: adsHeaders(runtime, token, settings.loginCustomerId), json: { query }, timeoutMs: 60_000,
  });
  const campaigns = new Map<string, CampaignRow>();
  const metrics: MetricRow[] = [];
  for (const batch of Array.isArray(batches) ? batches : []) {
    for (const result of batch.results ?? []) {
      const id = String(result.campaign?.id ?? '');
      const date = String(result.segments?.date ?? '');
      if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const currency = typeof result.customer?.currencyCode === 'string' ? result.customer.currencyCode : null;
      campaigns.set(id, { externalId: id, name: String(result.campaign?.name ?? `Campanha ${id}`).slice(0, 200), status: result.campaign?.status ?? null, objective: result.campaign?.advertisingChannelType ?? null, accountRef: settings.customerId });
      const m = result.metrics ?? {};
      metrics.push(
        { scope: 'campaign', scopeId: id, date, metric: 'impressions', value: number(m.impressions), unit: 'count' },
        { scope: 'campaign', scopeId: id, date, metric: 'clicks', value: number(m.clicks), unit: 'count' },
        { scope: 'campaign', scopeId: id, date, metric: 'spend', value: number(m.costMicros), unit: 'micros', currency },
        { scope: 'campaign', scopeId: id, date, metric: 'conversions', value: number(m.conversions), unit: 'count' },
      );
    }
  }
  return { campaigns: [...campaigns.values()], metrics };
}

// ————————————————— Google Analytics 4 e Search Console —————————————————

export async function analyticsProperties(runtime: HubRuntime, token: string): Promise<Option[]> {
  const data = await requestJson<{ accountSummaries?: Array<{ displayName?: string; propertySummaries?: Array<{ property?: string; displayName?: string }> }> }>(
    runtime.integrations, 'Google Analytics', `${runtime.integrations.endpoint('google.analyticsAdmin')}/v1beta/accountSummaries?pageSize=200`, { headers: { Authorization: `Bearer ${token}` } });
  return (data.accountSummaries ?? []).flatMap(account => (account.propertySummaries ?? []).map(property => ({
    id: String(property.property ?? '').replace(/^properties\//, ''), label: property.displayName ?? 'Propriedade', detail: account.displayName ?? null,
  }))).filter(option => /^\d{3,20}$/.test(option.id));
}

export async function analyticsData(runtime: HubRuntime, token: string, propertyId: string, from: string, to: string): Promise<MarketingData> {
  const data = await requestJson<{ rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> }>(
    runtime.integrations, 'Google Analytics', `${runtime.integrations.endpoint('google.analyticsData')}/v1beta/properties/${propertyId}:runReport`, {
      headers: { Authorization: `Bearer ${token}` },
      json: { dateRanges: [{ startDate: from, endDate: to }], dimensions: [{ name: 'date' }], metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'keyEvents' }], limit: 1000 },
    });
  const metrics: MetricRow[] = [];
  for (const row of data.rows ?? []) {
    const date = isoDay(String(row.dimensionValues?.[0]?.value ?? ''));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const values = row.metricValues ?? [];
    metrics.push(
      { scope: 'property', scopeId: propertyId, date, metric: 'sessions', value: number(values[0]?.value), unit: 'count' },
      { scope: 'property', scopeId: propertyId, date, metric: 'users', value: number(values[1]?.value), unit: 'count' },
      { scope: 'property', scopeId: propertyId, date, metric: 'key_events', value: number(values[2]?.value), unit: 'count' },
    );
  }
  return { campaigns: [], metrics };
}

export async function searchConsoleSites(runtime: HubRuntime, token: string): Promise<Option[]> {
  const data = await requestJson<{ siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }> }>(runtime.integrations, 'Search Console', `${runtime.integrations.endpoint('google.searchConsole')}/sites`, { headers: { Authorization: `Bearer ${token}` } });
  return (data.siteEntry ?? []).filter(entry => typeof entry.siteUrl === 'string' && entry.permissionLevel !== 'siteUnverifiedUser')
    .map(entry => ({ id: entry.siteUrl!, label: entry.siteUrl!.replace(/^sc-domain:/, 'Domínio: '), detail: entry.permissionLevel ?? null }));
}

export async function searchConsoleData(runtime: HubRuntime, token: string, siteUrl: string, from: string, to: string): Promise<MarketingData> {
  const data = await requestJson<{ rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> }>(
    runtime.integrations, 'Search Console', `${runtime.integrations.endpoint('google.searchConsole')}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      headers: { Authorization: `Bearer ${token}` }, json: { startDate: from, endDate: to, dimensions: ['date'], rowLimit: 1000 },
    });
  const metrics: MetricRow[] = [];
  for (const row of data.rows ?? []) {
    const date = String(row.keys?.[0] ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    metrics.push(
      { scope: 'site', scopeId: siteUrl, date, metric: 'clicks', value: number(row.clicks), unit: 'count' },
      { scope: 'site', scopeId: siteUrl, date, metric: 'impressions', value: number(row.impressions), unit: 'count' },
      // Posição média do dia, como a plataforma informa (a média do período é ponderada pela Workfoli).
      { scope: 'site', scopeId: siteUrl, date, metric: 'position', value: number(row.position), unit: 'position' },
    );
  }
  return { campaigns: [], metrics };
}

// ————————————————— Meta Ads —————————————————

const graphBase = (runtime: HubRuntime) => `${runtime.integrations.endpoint('meta.graph')}/${API_VERSIONS.metaGraph}`;

/** Paginação da Graph API: só segue `next` do MESMO endereço base (nunca manda o token para outro host). */
async function graphPages<T>(runtime: HubRuntime, token: string, first: string, limit = 20): Promise<T[]> {
  const items: T[] = [];
  const origin = new URL(graphBase(runtime)).origin;
  let url: string | null = first;
  for (let page = 0; url && page < limit; page += 1) {
    const data: { data?: T[]; paging?: { next?: string } } = await requestJson(runtime.integrations, 'Meta', url, { headers: { Authorization: `Bearer ${token}` } });
    items.push(...(data.data ?? []));
    const next: string | undefined = data.paging?.next;
    url = next && new URL(next).origin === origin ? next : null;
  }
  return items;
}

export async function metaAdAccounts(runtime: HubRuntime, token: string): Promise<Option[]> {
  const accounts = await graphPages<{ id?: string; name?: string; currency?: string }>(runtime, token, `${graphBase(runtime)}/me/adaccounts?fields=id,name,currency,account_status&limit=100`, 5);
  return accounts.filter(account => typeof account.id === 'string' && /^act_\d+$/.test(account.id)).map(account => ({ id: account.id!, label: account.name ?? account.id!, detail: account.currency ?? null }));
}

const LEAD_ACTIONS = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];

export async function metaAdsData(runtime: HubRuntime, token: string, adAccountId: string, from: string, to: string): Promise<MarketingData> {
  const base = graphBase(runtime);
  const params = new URLSearchParams({ level: 'campaign', time_increment: '1', time_range: JSON.stringify({ since: from, until: to }), fields: 'campaign_id,campaign_name,impressions,clicks,spend,actions,account_currency', limit: '500' });
  const rows = await graphPages<Record<string, any>>(runtime, token, `${base}/${adAccountId}/insights?${params}`, 50);
  let statuses = new Map<string, { status: string | null; objective: string | null }>();
  try {
    const list = await graphPages<{ id?: string; status?: string; objective?: string }>(runtime, token, `${base}/${adAccountId}/campaigns?fields=id,status,objective&limit=200`, 10);
    statuses = new Map(list.filter(item => item.id).map(item => [item.id!, { status: item.status ?? null, objective: item.objective ?? null }]));
  } catch { /* status é complemento: sem ele os números continuam valendo */ }
  const campaigns = new Map<string, CampaignRow>();
  const metrics: MetricRow[] = [];
  for (const row of rows) {
    const id = String(row.campaign_id ?? '');
    const date = String(row.date_start ?? '');
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const extra = statuses.get(id);
    campaigns.set(id, { externalId: id, name: String(row.campaign_name ?? `Campanha ${id}`).slice(0, 200), status: extra?.status ?? null, objective: extra?.objective ?? null, accountRef: adAccountId });
    const actions: Array<{ action_type?: string; value?: string }> = Array.isArray(row.actions) ? row.actions : [];
    // "lead" já agrega os demais quando existe; somar tudo contaria em dobro.
    const leadAction = actions.find(action => action.action_type === 'lead');
    const leads = leadAction ? number(leadAction.value) : actions.filter(action => LEAD_ACTIONS.includes(String(action.action_type))).reduce((sum, action) => sum + number(action.value), 0);
    metrics.push(
      { scope: 'campaign', scopeId: id, date, metric: 'impressions', value: number(row.impressions), unit: 'count' },
      { scope: 'campaign', scopeId: id, date, metric: 'clicks', value: number(row.clicks), unit: 'count' },
      { scope: 'campaign', scopeId: id, date, metric: 'spend', value: Math.round(number(row.spend) * 1_000_000), unit: 'micros', currency: typeof row.account_currency === 'string' ? row.account_currency : null },
      { scope: 'campaign', scopeId: id, date, metric: 'platform_leads', value: leads, unit: 'count' },
    );
  }
  return { campaigns: [...campaigns.values()], metrics };
}

// ————————————————— Meta: formulários de lead —————————————————

export async function metaPages(runtime: HubRuntime, token: string): Promise<Option[]> {
  const pages = await graphPages<{ id?: string; name?: string }>(runtime, token, `${graphBase(runtime)}/me/accounts?fields=id,name&limit=100`, 5);
  return pages.filter(page => typeof page.id === 'string' && /^\d+$/.test(page.id)).map(page => ({ id: page.id!, label: page.name ?? page.id! }));
}

export interface IncomingLead {
  externalRef: string; createdAt: string | null; name: string; email: string | null; phone: string | null; company: string | null; message: string | null;
  attribution: Record<string, string>;
}

const FIELD_ALIASES: Record<string, 'name' | 'first' | 'last' | 'email' | 'phone' | 'company'> = {
  full_name: 'name', nome_completo: 'name', name: 'name', nome: 'name', first_name: 'first', last_name: 'last',
  email: 'email', 'e-mail': 'email', phone_number: 'phone', phone: 'phone', telefone: 'phone', whatsapp: 'phone', company_name: 'company', empresa: 'company',
};

/** Leads dos formulários das páginas escolhidas, desde `since`. Tokens de página são pedidos na hora e nunca guardados. */
export async function metaLeads(runtime: HubRuntime, token: string, pageIds: string[], since: string): Promise<{ leads: IncomingLead[]; forms: number }> {
  const base = graphBase(runtime);
  const leads: IncomingLead[] = [];
  let formsCount = 0;
  const sinceUnix = Math.floor(Date.parse(since) / 1000);
  for (const pageId of pageIds) {
    const page = await requestJson<{ access_token?: string }>(runtime.integrations, 'Meta', `${base}/${pageId}?fields=access_token`, { headers: { Authorization: `Bearer ${token}` } });
    const pageToken = page.access_token;
    if (!pageToken) continue;
    const forms = await graphPages<{ id?: string; name?: string }>(runtime, pageToken, `${base}/${pageId}/leadgen_forms?fields=id,name,status&limit=100`, 5);
    formsCount += forms.length;
    for (const form of forms) {
      if (!form.id) continue;
      const params = new URLSearchParams({
        fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name', limit: '100',
        filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: sinceUnix }]),
      });
      const rows = await graphPages<Record<string, any>>(runtime, pageToken, `${base}/${form.id}/leads?${params}`, 20);
      for (const row of rows) {
        const values: Partial<Record<'name' | 'first' | 'last' | 'email' | 'phone' | 'company', string>> = {};
        const extra: string[] = [];
        for (const field of Array.isArray(row.field_data) ? row.field_data : []) {
          const key = String(field?.name ?? '').toLowerCase();
          const value = Array.isArray(field?.values) ? field.values.filter((item: unknown) => typeof item === 'string').join(', ').trim() : '';
          if (!value) continue;
          const alias = FIELD_ALIASES[key];
          if (alias && !values[alias]) values[alias] = value.slice(0, 300);
          else extra.push(`${String(field.name).slice(0, 80)}: ${value.slice(0, 300)}`);
        }
        const name = values.name ?? [values.first, values.last].filter(Boolean).join(' ');
        leads.push({
          externalRef: String(row.id), createdAt: typeof row.created_time === 'string' && Number.isFinite(Date.parse(row.created_time)) ? new Date(row.created_time).toISOString() : null,
          name: name || values.email || values.phone || 'Lead sem nome', email: values.email ?? null, phone: values.phone ?? null, company: values.company ?? null,
          message: extra.length ? extra.join('\n').slice(0, 4000) : null,
          attribution: Object.fromEntries(Object.entries({
            provider: 'meta', formRef: form.id, formName: form.name, campaignRef: row.campaign_id, campaignName: row.campaign_name,
            adSetRef: row.adset_id, adSetName: row.adset_name, adRef: row.ad_id, adName: row.ad_name,
          }).filter(([, value]) => typeof value === 'string' && value).map(([key, value]) => [key, String(value)])),
        });
      }
    }
  }
  return { leads, forms: formsCount };
}

