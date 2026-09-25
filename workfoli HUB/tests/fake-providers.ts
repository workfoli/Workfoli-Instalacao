import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { TestContext } from 'node:test';
import { DEFAULT_ENDPOINTS } from '../packages/hub/integrations/catalog.js';
import type { EndpointKey } from '../packages/hub/integrations/catalog.js';

/**
 * Provedores falsos (Google, Meta, GitHub, Vercel, Cloudflare, Supabase) para testar OAuth, sincronização e revogação
 * sem rede e sem contas reais. Valida o que os provedores reais validam: client_id, segredo, código de
 * uso único, redirect_uri e PKCE (S256).
 */
export interface FakeProviders {
  url: string;
  endpoints: Record<EndpointKey, string>;
  calls: Array<{ method: string; path: string; auth: string | null }>;
  revoked: string[];
  state: { googleAccess: string; refreshValid: boolean; metaLeads: Array<Record<string, unknown>>; githubTokenError: boolean };
}

const GOOGLE_SCOPES = 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly';

export async function startFakeProviders(t: TestContext): Promise<FakeProviders> {
  const pending = new Map<string, { challenge: string | null; redirect: string; clientId: string }>();
  const fake: FakeProviders = {
    url: '', endpoints: {} as Record<EndpointKey, string>, calls: [], revoked: [],
    state: {
      googleAccess: 'google-access-1', refreshValid: true, githubTokenError: false,
      metaLeads: [
        { id: 'lead-1', created_time: '2026-09-21T10:00:00+0000', field_data: [{ name: 'full_name', values: ['Joana Prado'] }, { name: 'email', values: ['joana@exemplo.test'] }, { name: 'phone_number', values: ['+55 11 97777-1111'] }, { name: 'qual_servico', values: ['Site'] }], ad_id: 'ad1', ad_name: 'Anúncio A', adset_id: 'as1', adset_name: 'Conjunto 1', campaign_id: 'c1', campaign_name: 'Leads - Setembro' },
        { id: 'lead-2', created_time: '2026-09-22T15:30:00+0000', field_data: [{ name: 'first_name', values: ['Pedro'] }, { name: 'last_name', values: ['Sá'] }, { name: 'email', values: ['pedro@exemplo.test'] }], campaign_id: 'c1', campaign_name: 'Leads - Setembro' },
      ],
    },
  };
  let codeCounter = 0;

  const body = async (req: IncomingMessage) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    if (/json/.test(String(req.headers['content-type']))) return JSON.parse(text || '{}') as Record<string, any>;
    return Object.fromEntries(new URLSearchParams(text)) as Record<string, any>;
  };
  const json = (res: ServerResponse, status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  const consent = (res: ServerResponse, url: URL, key: string) => {
    const code = `code-${key}-${++codeCounter}`;
    pending.set(code, { challenge: url.searchParams.get('code_challenge'), redirect: url.searchParams.get('redirect_uri') ?? '', clientId: url.searchParams.get('client_id') ?? '' });
    const location = new URL(url.searchParams.get('redirect_uri')!);
    location.searchParams.set('code', code);
    location.searchParams.set('state', url.searchParams.get('state') ?? '');
    res.writeHead(302, { Location: location.toString() });
    res.end();
  };
  const redeem = (code: string, redirect: string, verifier: string | null, clientId: string): boolean => {
    const entry = pending.get(code);
    if (!entry || entry.redirect !== redirect || entry.clientId !== clientId) return false;
    if (entry.challenge && createHash('sha256').update(verifier ?? '').digest('base64url') !== entry.challenge) return false;
    pending.delete(code);
    return true;
  };

  const server = createServer((req, res) => { void (async () => {
    const url = new URL(req.url ?? '/', fake.url);
    const path = decodeURIComponent(url.pathname);
    const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : null;
    fake.calls.push({ method: req.method ?? 'GET', path, auth });
    const bearer = auth?.replace(/^Bearer /, '') ?? '';
    // ————— Google —————
    if (path === '/google.authorize') return consent(res, url, 'google');
    if (path === '/google.token') {
      const form = await body(req);
      if (form.client_id !== 'google-client' || form.client_secret !== 'google-secret') return json(res, 401, { error: 'invalid_client' });
      if (form.grant_type === 'authorization_code') {
        if (!redeem(form.code, form.redirect_uri, form.code_verifier ?? null, form.client_id)) return json(res, 400, { error: 'invalid_grant', error_description: 'Bad code or verifier' });
        return json(res, 200, { access_token: fake.state.googleAccess, refresh_token: 'google-refresh', expires_in: 3600, scope: GOOGLE_SCOPES, token_type: 'Bearer' });
      }
      if (form.grant_type === 'refresh_token') {
        if (!fake.state.refreshValid || form.refresh_token !== 'google-refresh') return json(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
        fake.state.googleAccess = 'google-access-2';
        return json(res, 200, { access_token: fake.state.googleAccess, expires_in: 3600, token_type: 'Bearer' });
      }
      return json(res, 400, { error: 'unsupported_grant_type' });
    }
    if (path === '/google.revoke') { const form = await body(req); fake.revoked.push(`google:${form.token}`); return json(res, 200, {}); }
    if (path.startsWith('/google.')) {
      if (bearer !== fake.state.googleAccess) return json(res, 401, { error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } });
      if (path === '/google.userinfo') return json(res, 200, { sub: '1234', email: 'marketing@exemplo.test' });
      if (path.startsWith('/google.ads/')) {
        if (req.headers['developer-token'] !== 'dev-token') return json(res, 403, { error: { code: 403, message: 'The developer token is not approved.', status: 'PERMISSION_DENIED' } });
        if (path.endsWith('customers:listAccessibleCustomers')) return json(res, 200, { resourceNames: ['customers/1234567890'] });
        const payload = await body(req);
        if (/FROM customer\b/.test(payload.query)) return json(res, 200, [{ results: [{ customer: { descriptiveName: 'Conta Sintética', currencyCode: 'BRL', manager: false } }] }]);
        return json(res, 200, [{ results: [
          { customer: { currencyCode: 'BRL' }, campaign: { id: '111', name: 'Pesquisa - Marca', status: 'ENABLED', advertisingChannelType: 'SEARCH' }, segments: { date: '2026-09-20' }, metrics: { impressions: '1000', clicks: '50', costMicros: '25000000', conversions: 4 } },
          { customer: { currencyCode: 'BRL' }, campaign: { id: '111', name: 'Pesquisa - Marca', status: 'ENABLED', advertisingChannelType: 'SEARCH' }, segments: { date: '2026-09-21' }, metrics: { impressions: '800', clicks: '40', costMicros: '20000000', conversions: 2 } },
        ] }]);
      }
      if (path.endsWith('/v1beta/accountSummaries')) return json(res, 200, { accountSummaries: [{ displayName: 'Conta Analytics', propertySummaries: [{ property: 'properties/987654', displayName: 'Site Sintético' }] }] });
      if (path.endsWith(':runReport')) return json(res, 200, { rows: [
        { dimensionValues: [{ value: '20260920' }], metricValues: [{ value: '120' }, { value: '90' }, { value: '6' }] },
        { dimensionValues: [{ value: '20260921' }], metricValues: [{ value: '80' }, { value: '70' }, { value: '2' }] },
      ] });
      if (path === '/google.searchConsole/sites') return json(res, 200, { siteEntry: [{ siteUrl: 'sc-domain:exemplo.test', permissionLevel: 'siteOwner' }, { siteUrl: 'https://nao-verificado.test/', permissionLevel: 'siteUnverifiedUser' }] });
      if (path.endsWith('/searchAnalytics/query')) return json(res, 200, { rows: [{ keys: ['2026-09-20'], clicks: 30, impressions: 1000, ctr: 0.03, position: 8.5 }, { keys: ['2026-09-21'], clicks: 10, impressions: 500, ctr: 0.02, position: 12 }] });
    }
    // ————— Meta —————
    if (path === '/meta.dialog/v23.0/dialog/oauth') return consent(res, url, 'meta');
    if (path === '/meta.graph/v23.0/oauth/access_token') {
      const q = url.searchParams;
      if (q.get('client_id') !== 'meta-app' || q.get('client_secret') !== 'meta-secret') return json(res, 400, { error: { message: 'Invalid client', type: 'OAuthException', code: 101 } });
      if (q.get('grant_type') === 'fb_exchange_token') return q.get('fb_exchange_token') === 'meta-short' ? json(res, 200, { access_token: 'meta-long', token_type: 'bearer', expires_in: 5_184_000 }) : json(res, 400, { error: { message: 'Bad token', type: 'OAuthException' } });
      if (!redeem(q.get('code') ?? '', q.get('redirect_uri') ?? '', null, 'meta-app')) return json(res, 400, { error: { message: 'Invalid verification code', type: 'OAuthException', code: 100 } });
      return json(res, 200, { access_token: 'meta-short', token_type: 'bearer', expires_in: 3600 });
    }
    if (path.startsWith('/meta.graph/v23.0/')) {
      const rest = path.slice('/meta.graph/v23.0/'.length);
      if (rest === '777/leadgen_forms' || rest === 'f1/leads') {
        if (bearer !== 'page-token') return json(res, 401, { error: { message: 'Page token required', type: 'OAuthException' } });
        if (rest === '777/leadgen_forms') return json(res, 200, { data: [{ id: 'f1', name: 'Formulário Orçamento', status: 'ACTIVE' }] });
        return json(res, 200, { data: fake.state.metaLeads });
      }
      if (bearer !== 'meta-long') return json(res, 401, { error: { message: 'Invalid OAuth access token', type: 'OAuthException', code: 190 } });
      if (rest === 'me') return json(res, 200, { id: '555', name: 'Empresa Sintética Ads' });
      if (rest === 'me/permissions' && req.method === 'DELETE') { fake.revoked.push('meta'); return json(res, 200, { success: true }); }
      if (rest === 'me/permissions') return json(res, 200, { data: ['public_profile', 'ads_read', 'leads_retrieval', 'pages_show_list', 'pages_read_engagement', 'pages_manage_metadata'].map(permission => ({ permission, status: 'granted' })) });
      if (rest === 'me/adaccounts') return json(res, 200, { data: [{ id: 'act_1234', name: 'Conta de anúncios', currency: 'BRL' }] });
      if (rest === 'me/accounts') return json(res, 200, { data: [{ id: '777', name: 'Página Sintética' }] });
      if (rest === '777') return json(res, 200, { access_token: 'page-token', id: '777' });
      if (rest === 'act_1234/campaigns') return json(res, 200, { data: [{ id: 'c1', status: 'ACTIVE', objective: 'OUTCOME_LEADS' }] });
      if (rest === 'act_1234/insights') {
        if (url.searchParams.get('page') === '2') {
          // Um "next" apontando para outro host nunca é seguido (o token não sai do provedor).
          return json(res, 200, { data: [{ campaign_id: 'c1', campaign_name: 'Leads - Setembro', impressions: '2000', clicks: '30', spend: '100', actions: [{ action_type: 'lead', value: '3' }], account_currency: 'BRL', date_start: '2026-09-21' }], paging: { next: 'https://evil.invalid/steal' } });
        }
        return json(res, 200, { data: [{ campaign_id: 'c1', campaign_name: 'Leads - Setembro', impressions: '5000', clicks: '120', spend: '300.50', actions: [{ action_type: 'lead', value: '12' }, { action_type: 'onsite_conversion.lead_grouped', value: '12' }], account_currency: 'BRL', date_start: '2026-09-20' }], paging: { next: `${fake.url}/meta.graph/v23.0/act_1234/insights?page=2` } });
      }
    }
    // ————— GitHub (OAuth com PKCE; erros do token chegam com status 200, como no GitHub real) —————
    if (path === '/github.authorize') return consent(res, url, 'github');
    if (path === '/github.token') {
      const form = await body(req);
      if (form.client_id !== 'github-client' || form.client_secret !== 'github-secret') return json(res, 200, { error: 'incorrect_client_credentials', error_description: 'The client_id and/or client_secret passed are incorrect.' });
      if (fake.state.githubTokenError || !redeem(form.code, form.redirect_uri, form.code_verifier ?? null, form.client_id)) return json(res, 200, { error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' });
      return json(res, 200, { access_token: 'github-access-1', token_type: 'bearer', scope: 'repo,read:user' });
    }
    if (path === '/github.api/user') return bearer === 'github-access-1' ? json(res, 200, { login: 'empresa-sintetica', id: 4242 }) : json(res, 401, { message: 'Bad credentials' });
    if (path === '/github.api/applications/github-client/grant' && req.method === 'DELETE') {
      const form = await body(req);
      if (auth !== `Basic ${Buffer.from('github-client:github-secret').toString('base64')}`) return json(res, 401, { message: 'Bad credentials' });
      fake.revoked.push(`github:${form.access_token}`);
      res.writeHead(204); res.end(); return;
    }
    // ————— Provedores por token —————
    if (path === '/vercel.api/v2/user') return bearer === 'vercel-token-valido-123' ? json(res, 200, { user: { id: 'u1', username: 'empresa-sintetica', email: 'dev@exemplo.test' } }) : json(res, 403, { error: { code: 'forbidden', message: 'Not authorized' } });
    if (path === '/supabase.api/v1/projects') return bearer === 'sbp-token-sintetico-valido' ? json(res, 200, [{ id: 'p1', name: 'Projeto Sintético' }, { id: 'p2', name: 'Outro Projeto' }]) : json(res, 401, { message: 'Unauthorized' });
    if (path === '/cloudflare.api/user/tokens/verify') return json(res, 200, { success: true, result: { id: 'cf-token-id-9999', status: bearer === 'cloudflare-token-ativo' ? 'active' : 'disabled' } });
    return json(res, 404, { error: { message: 'not found' } });
  })(); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.endpoints = Object.fromEntries(Object.keys(DEFAULT_ENDPOINTS).map(key => [key, `${fake.url}/${key}`])) as Record<EndpointKey, string>;
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  return fake;
}
