import { createHash, randomBytes } from 'node:crypto';
import { audit } from '../audit.js';
import { now } from '../db.js';
import { HttpError } from '../http.js';
import { can } from '../permissions.js';
import type { Actor, HubRuntime } from '../runtime.js';
import { API_VERSIONS, PROVIDERS } from './catalog.js';
import type { ConnectionProvider, OAuthProvider } from './catalog.js';
import { liveConnection, markError, readBundle, saveConnection, writeBundle } from './connections.js';
import type { ConnectionRow, TokenBundle } from './connections.js';
import { ProviderError, requestJson } from './env.js';

/**
 * OAuth 2.0 com o navegador do sistema: o Hub nunca vê nem guarda a senha do Google, da Meta ou do
 * GitHub. Fluxo: Hub gera `state` (+ PKCE S256 quando o provedor aceita) → navegador → consentimento
 * no provedor → retorno ao Hub → troca do código no servidor → tokens cifrados no cofre da instância.
 */

const STATE_MINUTES = 10;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const b64url = (bytes: Buffer) => bytes.toString('base64url');

export function callbackPath(): string { return '/api/integrations/oauth/callback'; }

export function oauthProvider(provider: ConnectionProvider): OAuthProvider {
  const definition = PROVIDERS[provider];
  if (definition.kind !== 'oauth') throw new HttpError(400, `${definition.label} conecta por token, não por OAuth.`);
  return definition;
}

/** Credenciais do app OAuth desta instalação (nomes no catálogo; valores só no cofre de segredos). */
export function appCredentials(runtime: HubRuntime, definition: OAuthProvider): { clientId: string; clientSecret: string | null; missing: string[] } {
  const clientId = runtime.secrets.get(definition.appSecrets.clientId) ?? '';
  const clientSecret = runtime.secrets.get(definition.appSecrets.clientSecret) ?? null;
  const missing = [
    ...(clientId ? [] : [definition.appSecrets.clientId]),
    ...(definition.appSecrets.clientSecretRequired && !clientSecret ? [definition.appSecrets.clientSecret] : []),
  ];
  return { clientId, clientSecret, missing };
}

function authorizeEndpoint(runtime: HubRuntime, provider: ConnectionProvider): string {
  if (provider === 'google') return runtime.integrations.endpoint('google.authorize');
  if (provider === 'meta') return `${runtime.integrations.endpoint('meta.dialog')}/${API_VERSIONS.metaGraph}/dialog/oauth`;
  return runtime.integrations.endpoint('github.authorize');
}

export function startOAuth(runtime: HubRuntime, actor: Actor, provider: ConnectionProvider, input: { capabilities?: unknown }) {
  const definition = oauthProvider(provider);
  const credentials = appCredentials(runtime, definition);
  if (credentials.missing.length) {
    throw new HttpError(409, `O app OAuth ${definition.label} desta instalação ainda não foi configurado (${credentials.missing.join(', ')}). Configure com \`workfoli secrets set\` na pasta do Hub.`, 'app-credentials-missing', { missing: credentials.missing });
  }
  const requested = input.capabilities === undefined ? definition.capabilities.filter(item => item.default).map(item => item.id)
    : Array.isArray(input.capabilities) ? input.capabilities.filter((item): item is string => typeof item === 'string') : null;
  if (!requested || requested.some(id => !definition.capabilities.some(item => item.id === id))) throw new HttpError(400, 'Capacidades inválidas para este provedor.');
  if (!requested.length && provider !== 'github') throw new HttpError(400, 'Escolha ao menos um recurso para conectar.');
  const capabilities = definition.capabilities.filter(item => requested.includes(item.id));
  const missingExtra = [...new Set(capabilities.flatMap(item => item.requires ?? []).filter(name => !runtime.secrets.has(name)))];
  const scopes = [...new Set([...definition.identityScopes, ...capabilities.flatMap(item => item.scopes)])];
  const state = b64url(randomBytes(32));
  const verifier = b64url(randomBytes(32));
  const stateHash = sha256(state);
  const redirectUri = `${runtime.origin()}${callbackPath()}`;
  const stamp = Date.now();
  runtime.db.prepare('DELETE FROM oauth_states WHERE expires_at<? OR (used_at IS NOT NULL AND created_at<?)').run(new Date(stamp).toISOString(), new Date(stamp - 86_400_000).toISOString());
  runtime.db.prepare('INSERT INTO oauth_states(state_hash,provider,user_id,verifier,redirect_uri,scopes,capabilities,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(stateHash, provider, actor.id, runtime.integrations.vault().encrypt(verifier, `oauth-state:${stateHash}`), redirectUri, JSON.stringify(scopes), JSON.stringify(capabilities.map(item => item.id)),
      new Date(stamp).toISOString(), new Date(stamp + STATE_MINUTES * 60_000).toISOString());
  const params = new URLSearchParams({
    client_id: credentials.clientId, redirect_uri: redirectUri, response_type: 'code', scope: scopes.join(definition.scopeSeparator), state,
    ...(definition.pkce ? { code_challenge: b64url(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' } : {}),
    ...definition.authorizeParams,
  });
  audit(runtime.db, { type: 'user', id: actor.id }, 'integration.connect-started', provider, { capabilities: capabilities.map(item => item.id) });
  return { authorizeUrl: `${authorizeEndpoint(runtime, provider)}?${params.toString()}`, redirectUri, scopes, expiresInMinutes: STATE_MINUTES, warnings: missingExtra.length ? [`Para ler dados, também será preciso configurar: ${missingExtra.join(', ')}.`] : [] };
}

interface TokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string }

function bundleFrom(response: TokenResponse, previous?: TokenBundle): TokenBundle {
  if (!response.access_token || typeof response.access_token !== 'string') throw new ProviderError('OAuth', 0, 'resposta sem token de acesso');
  return {
    accessToken: response.access_token,
    refreshToken: typeof response.refresh_token === 'string' ? response.refresh_token : previous?.refreshToken ?? null,
    tokenType: response.token_type ?? 'Bearer',
    expiresAt: typeof response.expires_in === 'number' && response.expires_in > 0 ? new Date(Date.now() + response.expires_in * 1000).toISOString() : previous?.expiresAt ?? null,
  };
}

async function exchangeCode(runtime: HubRuntime, provider: ConnectionProvider, code: string, redirectUri: string, verifier: string): Promise<{ bundle: TokenBundle; scope: string | null }> {
  const definition = oauthProvider(provider);
  const { clientId, clientSecret } = appCredentials(runtime, definition);
  const env = runtime.integrations;
  if (provider === 'meta') {
    const graph = `${env.endpoint('meta.graph')}/${API_VERSIONS.metaGraph}`;
    const short = await requestJson<TokenResponse>(env, 'Meta', `${graph}/oauth/access_token?${new URLSearchParams({ client_id: clientId, client_secret: clientSecret ?? '', redirect_uri: redirectUri, code })}`);
    // Token de curta duração → longa duração (cerca de 60 dias). A Meta não emite refresh token: perto do fim, reconectar.
    const long = await requestJson<TokenResponse>(env, 'Meta', `${graph}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: clientId, client_secret: clientSecret ?? '', fb_exchange_token: short.access_token ?? '' })}`);
    return { bundle: bundleFrom(long), scope: null };
  }
  const tokenUrl = env.endpoint(provider === 'google' ? 'google.token' : 'github.token');
  const response = await requestJson<TokenResponse>(env, definition.label, tokenUrl, {
    form: {
      grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}), ...(definition.pkce ? { code_verifier: verifier } : {}),
    },
  });
  return { bundle: bundleFrom(response), scope: typeof response.scope === 'string' ? response.scope : null };
}

async function identify(runtime: HubRuntime, provider: ConnectionProvider, bundle: TokenBundle, scope: string | null): Promise<{ label: string | null; ref: string | null; scopes: string[] }> {
  const env = runtime.integrations;
  const auth = { Authorization: `Bearer ${bundle.accessToken}` };
  if (provider === 'google') {
    const user = await requestJson<{ email?: string; sub?: string }>(env, 'Google', env.endpoint('google.userinfo'), { headers: auth });
    return { label: user.email ?? null, ref: user.sub ?? null, scopes: (scope ?? '').split(' ').filter(Boolean) };
  }
  if (provider === 'meta') {
    const graph = `${env.endpoint('meta.graph')}/${API_VERSIONS.metaGraph}`;
    const user = await requestJson<{ id?: string; name?: string }>(env, 'Meta', `${graph}/me?fields=id,name`, { headers: auth });
    const permissions = await requestJson<{ data?: Array<{ permission: string; status: string }> }>(env, 'Meta', `${graph}/me/permissions`, { headers: auth });
    return { label: user.name ?? null, ref: user.id ?? null, scopes: (permissions.data ?? []).filter(item => item.status === 'granted').map(item => item.permission) };
  }
  const user = await requestJson<{ login?: string; id?: number }>(env, 'GitHub', `${env.endpoint('github.api')}/user`, { headers: { ...auth, Accept: 'application/vnd.github+json' } });
  return { label: user.login ?? null, ref: user.id ? String(user.id) : null, scopes: ['read:user', ...(scope ?? '').split(/[,\s]+/).filter(Boolean)] };
}

export interface CallbackOutcome { ok: boolean; provider: ConnectionProvider | null; message: string; }

/** Retorno do navegador. Validado só pelo `state` (uso único, 10 min, amarrado a quem iniciou). */
export async function completeOAuth(runtime: HubRuntime, query: URLSearchParams): Promise<CallbackOutcome> {
  const state = query.get('state') ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return { ok: false, provider: null, message: 'Retorno de conexão inválido. Volte ao Hub e tente de novo.' };
  const stateHash = sha256(state);
  const row = runtime.db.prepare('SELECT * FROM oauth_states WHERE state_hash=?').get(stateHash) as Record<string, string | null> | undefined;
  if (!row) return { ok: false, provider: null, message: 'Pedido de conexão não encontrado. Volte ao Hub e clique em Conectar de novo.' };
  const provider = row.provider as ConnectionProvider;
  const claimed = Number(runtime.db.prepare('UPDATE oauth_states SET used_at=? WHERE state_hash=? AND used_at IS NULL').run(now(), stateHash).changes);
  if (!claimed) return { ok: false, provider, message: 'Este retorno já foi usado. Se a conexão não aparecer no Hub, conecte de novo.' };
  if (Date.parse(String(row.expires_at)) <= Date.now()) return { ok: false, provider, message: 'O pedido de conexão expirou (10 minutos). Volte ao Hub e clique em Conectar de novo.' };
  const label = PROVIDERS[provider].label;
  if (query.get('error')) {
    audit(runtime.db, { type: 'user', id: row.user_id }, 'integration.consent-denied', provider, { reason: String(query.get('error')).slice(0, 60) }, 'denied');
    return { ok: false, provider, message: `A conexão com ${label} foi cancelada na tela de autorização. Nada foi gravado.` };
  }
  const code = query.get('code') ?? '';
  if (!code || code.length > 4096 || /[\u0000-\u001f\s]/.test(code)) return { ok: false, provider, message: 'Retorno sem código de autorização.' };
  const user = runtime.db.prepare("SELECT u.id, u.status, r.permissions FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?").get(row.user_id) as { id: string; status: string; permissions: string } | undefined;
  if (!user || user.status !== 'active' || !can(JSON.parse(user.permissions) as string[], 'integrations:admin')) {
    audit(runtime.db, { type: 'user', id: row.user_id }, 'integration.connect-denied', provider, {}, 'denied');
    return { ok: false, provider, message: 'Quem iniciou a conexão não tem mais permissão para administrar integrações.' };
  }
  try {
    const verifier = runtime.integrations.vault().decrypt(String(row.verifier), `oauth-state:${stateHash}`);
    const { bundle, scope } = await exchangeCode(runtime, provider, code, String(row.redirect_uri), verifier);
    const identity = await identify(runtime, provider, bundle, scope);
    saveConnection(runtime, provider, { accountLabel: identity.label, accountRef: identity.ref, scopes: identity.scopes, connectedBy: user.id, bundle });
    audit(runtime.db, { type: 'user', id: user.id }, 'integration.connected', provider, { scopes: identity.scopes.length });
    return { ok: true, provider, message: `${label} conectado${identity.label ? ` (${identity.label})` : ''}. Você já pode fechar esta aba e voltar ao Workfoli Hub.` };
  } catch (error) {
    audit(runtime.db, { type: 'user', id: user.id }, 'integration.connect-failed', provider, { status: error instanceof ProviderError ? error.providerStatus : 0 }, 'error');
    return { ok: false, provider, message: error instanceof HttpError ? error.message : `Não foi possível concluir a conexão com ${label}.` };
  }
}

/**
 * Token de acesso válido para chamar a API. Renova com o refresh token quando está para vencer;
 * sem renovação possível, marca a conexão como expirada (o Hub mostra "Reconectar").
 */
export async function accessToken(runtime: HubRuntime, row: ConnectionRow): Promise<string> {
  const bundle = readBundle(runtime, row);
  const expiresAt = bundle.expiresAt ? Date.parse(bundle.expiresAt) : Number.POSITIVE_INFINITY;
  if (expiresAt - Date.now() > 120_000) return bundle.accessToken;
  const label = PROVIDERS[row.provider].label;
  if (row.provider === 'google' && bundle.refreshToken) {
    const definition = oauthProvider('google');
    const { clientId, clientSecret } = appCredentials(runtime, definition);
    try {
      const refreshed = bundleFrom(await requestJson<TokenResponse>(runtime.integrations, 'Google', runtime.integrations.endpoint('google.token'), {
        form: { grant_type: 'refresh_token', refresh_token: bundle.refreshToken, client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}) },
      }), bundle);
      writeBundle(runtime, row, refreshed);
      return refreshed.accessToken;
    } catch (error) {
      if (error instanceof ProviderError && error.reason === 'invalid_grant') {
        markError(runtime.db, row.id, 'expired', 'A autorização foi revogada ou expirou no Google. Reconecte.');
        throw new HttpError(409, 'A autorização do Google expirou ou foi revogada. Reconecte em Integrações.', 'reconnect');
      }
      throw error;
    }
  }
  markError(runtime.db, row.id, 'expired', `A autorização de ${label} venceu. Reconecte.`);
  throw new HttpError(409, `A autorização de ${label} venceu. Reconecte em Integrações.`, 'reconnect');
}

/** Revoga no provedor (quando existe API para isso). Falha na revogação não impede apagar localmente. */
export async function revokeRemote(runtime: HubRuntime, row: ConnectionRow): Promise<boolean | null> {
  const definition = PROVIDERS[row.provider];
  if (definition.kind !== 'oauth') return null;
  let bundle: TokenBundle;
  try { bundle = readBundle(runtime, row); } catch { return false; }
  const env = runtime.integrations;
  try {
    if (row.provider === 'google') {
      await requestJson(env, 'Google', env.endpoint('google.revoke'), { form: { token: bundle.refreshToken ?? bundle.accessToken } });
    } else if (row.provider === 'meta') {
      await requestJson(env, 'Meta', `${env.endpoint('meta.graph')}/${API_VERSIONS.metaGraph}/me/permissions`, { method: 'DELETE', headers: { Authorization: `Bearer ${bundle.accessToken}` } });
    } else {
      const { clientId, clientSecret } = appCredentials(runtime, definition);
      await requestJson(env, 'GitHub', `${env.endpoint('github.api')}/applications/${encodeURIComponent(clientId)}/grant`, {
        method: 'DELETE', json: { access_token: bundle.accessToken },
        headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret ?? ''}`).toString('base64')}`, Accept: 'application/vnd.github+json' },
      });
    }
    return true;
  } catch { return false; }
}

export function hasLiveConnection(runtime: HubRuntime, provider: ConnectionProvider): boolean {
  return !!liveConnection(runtime.db, provider);
}
