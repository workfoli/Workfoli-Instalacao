import type { IntegrationProvider } from '../../contract/workfoli-contract.mjs';
import { audit } from '../audit.js';
import { crmConfig } from '../crm/config.js';
import { HttpError } from '../http.js';
import { can } from '../permissions.js';
import type { Actor, HubRuntime } from '../runtime.js';
import { analyticsProperties, googleAdsCustomers, metaAdAccounts, metaPages, searchConsoleSites } from '../integrations/adapters.js';
import type { Option } from '../integrations/adapters.js';
import { CONNECTION_PROVIDERS, PROVIDERS, SCOPE_LABELS } from '../integrations/catalog.js';
import type { ConnectionProvider } from '../integrations/catalog.js';
import { connectionScopes, connectionSettings, forgetConnection, liveConnection, requireConnection, updateSettings } from '../integrations/connections.js';
import type { ConnectionRow } from '../integrations/connections.js';
import { accessToken, appCredentials, callbackPath, revokeRemote } from '../integrations/oauth.js';

/** Integrações declaradas na Base (planejamento) → conexão real do Hub que as atende. */
const DECLARED_TO_CONNECTION: Readonly<Record<IntegrationProvider, ConnectionProvider | null>> = Object.freeze({
  google: 'google', 'google-ads': 'google', 'search-console': 'google', 'google-analytics': 'google', gmail: null, 'google-calendar': null, 'google-drive': null,
  meta: 'meta', instagram: 'meta', facebook: 'meta', whatsapp: null, github: 'github', vercel: 'vercel', supabase: 'supabase', cloudflare: 'cloudflare', netlify: null, custom: null,
});
const DECLARED_LABELS: Readonly<Record<IntegrationProvider, string>> = Object.freeze({
  google: 'Google', 'google-ads': 'Google Ads', 'search-console': 'Search Console', 'google-analytics': 'Google Analytics', gmail: 'Gmail', 'google-calendar': 'Google Agenda', 'google-drive': 'Google Drive',
  meta: 'Meta', instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp Business', github: 'GitHub', vercel: 'Vercel', supabase: 'Supabase', cloudflare: 'Cloudflare', netlify: 'Netlify', custom: 'Outra ferramenta',
});

export type CardState = 'app-missing' | 'available' | 'connected' | 'attention' | 'expired';
export const CARD_STATE_LABELS: Readonly<Record<CardState, string>> = Object.freeze({
  'app-missing': 'Aguardando credenciais do app', available: 'Pronta para conectar', connected: 'Conectada', attention: 'Conectada, com alerta', expired: 'Autorização vencida',
});

function stateOf(row: ConnectionRow | undefined, appMissing: string[]): CardState {
  if (row) return row.status === 'expired' ? 'expired' : row.status === 'connected' && !row.last_error ? 'connected' : 'attention';
  return appMissing.length ? 'app-missing' : 'available';
}

/** Área de Integrações. Nunca inclui tokens; nomes de credenciais só para quem administra. */
export function integrationsView(runtime: HubRuntime, actor: Actor) {
  const admin = can(actor.permissions, 'integrations:admin');
  let declared: Array<{ id: string; provider: IntegrationProvider; label?: string | null; purpose?: string | null; status: string }> = [];
  try { declared = runtime.base.snapshot().manifest.integrations; } catch { /* Base indisponível */ }
  const cards = CONNECTION_PROVIDERS.map(provider => {
    const definition = PROVIDERS[provider];
    const row = liveConnection(runtime.db, provider);
    const appMissing = definition.kind === 'oauth' ? appCredentials(runtime, definition).missing : [];
    const scopes = row ? connectionScopes(row) : [];
    const state = stateOf(row, appMissing);
    const connectedBy = row?.connected_by ? (runtime.db.prepare('SELECT name FROM users WHERE id=?').get(row.connected_by) as { name: string } | undefined)?.name ?? null : null;
    return {
      provider, label: definition.label, category: definition.category, description: definition.description, kind: definition.kind,
      state, stateLabel: CARD_STATE_LABELS[state], account: row?.account_label ?? null,
      connectedAt: row?.connected_at ?? null, connectedBy, lastSyncAt: row?.last_sync_at ?? null, lastError: row?.last_error ?? null,
      scopes: scopes.map(scope => ({ scope, label: SCOPE_LABELS[scope] ?? scope })),
      capabilities: definition.kind === 'oauth' ? definition.capabilities.map(capability => ({
        id: capability.id, label: capability.label, description: capability.description, default: capability.default,
        granted: !!row && capability.scopes.every(scope => scopes.includes(scope)),
        missing: admin ? (capability.requires ?? []).filter(name => !runtime.secrets.has(name)) : [],
      })) : [],
      settings: row ? connectionSettings(row) : null,
      syncable: provider === 'google' || provider === 'meta',
      declared: declared.filter(item => DECLARED_TO_CONNECTION[item.provider] === provider).map(item => ({ id: item.id, label: item.label ?? DECLARED_LABELS[item.provider], purpose: item.purpose ?? null, status: item.status })),
      ...(admin ? {
        setup: definition.kind === 'oauth'
          ? { appSecrets: [definition.appSecrets.clientId, ...(definition.appSecrets.clientSecretRequired || runtime.secrets.has(definition.appSecrets.clientSecret) ? [definition.appSecrets.clientSecret] : [])].map(name => ({ name, configured: runtime.secrets.has(name) })), missing: appMissing }
          : { tokenLabel: definition.tokenLabel, tokenHelp: definition.tokenHelp },
        runs: row ? (runtime.db.prepare('SELECT kind,status,started_at,finished_at,stats,error FROM integration_sync_runs WHERE connection_id=? ORDER BY started_at DESC LIMIT 8').all(row.id) as Array<Record<string, unknown>>)
          .map(run => ({ kind: String(run.kind), status: String(run.status), startedAt: String(run.started_at), finishedAt: (run.finished_at as string | null) ?? null, stats: run.stats ? JSON.parse(String(run.stats)) as Record<string, number> : {}, error: (run.error as string | null) ?? null })) : [],
      } : {}),
    };
  });
  const planned = declared.filter(item => !DECLARED_TO_CONNECTION[item.provider])
    .map(item => ({ id: item.id, provider: item.provider, label: item.label ?? DECLARED_LABELS[item.provider], purpose: item.purpose ?? null, status: item.status }));
  let crmLinks: ReturnType<typeof crmConfig>['integrations'] = [];
  try { crmLinks = crmConfig(runtime).integrations; } catch { crmLinks = []; }
  return { admin, cards, planned, crmLinks, callbackUrl: admin ? `${runtime.origin()}${callbackPath()}` : null };
}

type OptionList = { items: Option[] } | { error: string } | { unavailable: string };

async function optionList(load: () => Promise<Option[]>): Promise<OptionList> {
  try { return { items: await load() }; } catch (error) { return { error: error instanceof HttpError ? error.message : 'Falha ao consultar o provedor.' }; }
}

/** Contas, propriedades, sites e páginas que ESTA conexão enxerga, para o administrador escolher. */
export async function integrationOptions(runtime: HubRuntime, provider: ConnectionProvider) {
  if (provider !== 'google' && provider !== 'meta') throw new HttpError(400, `${PROVIDERS[provider].label} não tem contas para escolher.`);
  const row = requireConnection(runtime.db, provider);
  const token = await accessToken(runtime, row);
  const scopes = connectionScopes(row);
  const definition = PROVIDERS[provider];
  const has = (capability: string) => definition.kind === 'oauth' && (definition.capabilities.find(item => item.id === capability)?.scopes ?? ['?']).every(scope => scopes.includes(scope));
  const notGranted = (label: string): OptionList => ({ unavailable: `${label} não foi autorizado nesta conexão. Reconecte marcando esse recurso.` });
  if (provider === 'google') {
    const settings = connectionSettings(row);
    return {
      adsCustomers: !has('ads') ? notGranted('Google Ads') : !runtime.secrets.has('GOOGLE_ADS_DEVELOPER_TOKEN') ? { unavailable: 'Falta o token de desenvolvedor do Google Ads (GOOGLE_ADS_DEVELOPER_TOKEN) nesta instalação.' }
        : await optionList(() => googleAdsCustomers(runtime, token, typeof settings.adsLoginCustomerId === 'string' ? settings.adsLoginCustomerId : null)),
      ga4Properties: has('analytics') ? await optionList(() => analyticsProperties(runtime, token)) : notGranted('Google Analytics'),
      sites: has('search-console') ? await optionList(() => searchConsoleSites(runtime, token)) : notGranted('Search Console'),
    };
  }
  return {
    adAccounts: has('ads') ? await optionList(() => metaAdAccounts(runtime, token)) : notGranted('Meta Ads'),
    pages: has('leads') ? await optionList(() => metaPages(runtime, token)) : notGranted('Formulários de lead'),
  };
}

const digits = (value: unknown) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value);

/** Escolhas do administrador (identificadores de contas; nada secreto). */
export function saveIntegrationSettings(runtime: HubRuntime, actor: Actor, provider: ConnectionProvider, input: unknown) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const row = requireConnection(runtime.db, provider);
  const patch: Record<string, unknown> = {};
  const pick = (key: string, pattern: RegExp, label: string, transform: (value: unknown) => unknown = value => value) => {
    if (!Object.hasOwn(body, key)) return;
    const value = transform(body[key]);
    if (value === null || value === '') { patch[key] = null; return; }
    if (typeof value !== 'string' || !pattern.test(value)) throw new HttpError(400, `${label} inválido.`);
    patch[key] = value;
  };
  if (provider === 'google') {
    pick('adsCustomerId', /^\d{6,12}$/, 'Conta do Google Ads', digits);
    pick('adsLoginCustomerId', /^\d{6,12}$/, 'Conta gerenciadora do Google Ads', digits);
    pick('ga4PropertyId', /^\d{3,20}$/, 'Propriedade do GA4');
    pick('searchConsoleSite', /^(?:sc-domain:[a-z0-9.-]{3,253}|https?:\/\/[^\s?#]{3,300}\/)$/i, 'Site do Search Console');
  } else if (provider === 'meta') {
    pick('adAccountId', /^act_\d{3,30}$/, 'Conta de anúncios');
    if (Object.hasOwn(body, 'pageIds')) {
      if (!Array.isArray(body.pageIds) || body.pageIds.length > 20 || body.pageIds.some(id => typeof id !== 'string' || !/^\d{3,30}$/.test(id))) throw new HttpError(400, 'Páginas inválidas.');
      patch.pageIds = [...new Set(body.pageIds as string[])];
    }
  } else throw new HttpError(400, `${PROVIDERS[provider].label} não tem configurações de conta.`);
  const settings = updateSettings(runtime.db, row, patch);
  audit(runtime.db, { type: 'user', id: actor.id }, 'integration.settings-updated', provider, { keys: Object.keys(patch) });
  return { settings };
}

export async function disconnectIntegration(runtime: HubRuntime, actor: Actor, provider: ConnectionProvider) {
  const row = requireConnection(runtime.db, provider);
  const revoked = await revokeRemote(runtime, row);
  forgetConnection(runtime.db, row);
  audit(runtime.db, { type: 'user', id: actor.id }, 'integration.disconnected', provider, { revoked: revoked === null ? 'n/a' : revoked ? 'sim' : 'não confirmado' });
  const label = PROVIDERS[provider].label;
  return {
    revoked,
    message: revoked === true ? `${label} desconectado: acesso revogado no provedor e credenciais apagadas do cofre.`
      : revoked === false ? `${label} desconectado aqui (credenciais apagadas). Não foi possível confirmar a revogação no provedor: remova o acesso também no painel da conta.`
        : `${label} desconectado aqui (token apagado). Revogue o token também no painel da ${label}.`,
  };
}
