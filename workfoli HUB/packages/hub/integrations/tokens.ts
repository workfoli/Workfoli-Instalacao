import { audit } from '../audit.js';
import { HttpError } from '../http.js';
import type { Actor, HubRuntime } from '../runtime.js';
import { PROVIDERS } from './catalog.js';
import type { ConnectionProvider } from './catalog.js';
import { saveConnection } from './connections.js';
import { requestJson } from './env.js';

/**
 * Provedores sem OAuth para este uso: o administrador cola um token criado no painel do provedor.
 * O token é verificado no próprio provedor antes de ser guardado (cifrado) e nunca volta ao navegador.
 */
async function verify(runtime: HubRuntime, provider: ConnectionProvider, token: string): Promise<{ label: string | null; ref: string | null }> {
  const env = runtime.integrations;
  const auth = { Authorization: `Bearer ${token}` };
  if (provider === 'vercel') {
    const data = await requestJson<{ user?: { id?: string; username?: string; email?: string } }>(env, 'Vercel', `${env.endpoint('vercel.api')}/v2/user`, { headers: auth });
    return { label: data.user?.username ?? data.user?.email ?? null, ref: data.user?.id ?? null };
  }
  if (provider === 'cloudflare') {
    const data = await requestJson<{ success?: boolean; result?: { id?: string; status?: string } }>(env, 'Cloudflare', `${env.endpoint('cloudflare.api')}/user/tokens/verify`, { headers: auth });
    if (!data.success || data.result?.status !== 'active') throw new HttpError(400, 'A Cloudflare informou que este token não está ativo.');
    return { label: `Token ativo (…${String(data.result.id ?? '').slice(-4)})`, ref: data.result.id ?? null };
  }
  if (provider === 'supabase') {
    const projects = await requestJson<Array<{ id?: string; name?: string }>>(env, 'Supabase', `${env.endpoint('supabase.api')}/v1/projects`, { headers: auth });
    const count = Array.isArray(projects) ? projects.length : 0;
    return { label: `${count} projeto${count === 1 ? '' : 's'}`, ref: null };
  }
  throw new HttpError(400, 'Este provedor conecta por OAuth.');
}

export async function connectWithToken(runtime: HubRuntime, actor: Actor, provider: ConnectionProvider, input: { token?: unknown }) {
  const definition = PROVIDERS[provider];
  if (definition.kind !== 'token') throw new HttpError(400, `${definition.label} conecta pela tela de autorização (OAuth), não por token colado.`);
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  if (token.length < 16 || token.length > 4096 || /[\s\u0000-\u001f]/.test(token)) throw new HttpError(400, 'Token inválido: cole o token completo, sem espaços.');
  const identity = await verify(runtime, provider, token);
  saveConnection(runtime, provider, { accountLabel: identity.label, accountRef: identity.ref, scopes: [], connectedBy: actor.id, bundle: { accessToken: token, tokenType: 'Bearer' } });
  audit(runtime.db, { type: 'user', id: actor.id }, 'integration.connected', provider, { method: 'token' });
  return { provider, account: identity.label };
}
