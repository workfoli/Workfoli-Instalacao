import { looksLikeSecret } from '../../contract/workfoli-contract.mjs';
import { HttpError } from '../http.js';
import { DEFAULT_ENDPOINTS } from './catalog.js';
import type { EndpointKey } from './catalog.js';
import { openVault } from './vault.js';
import type { TokenVault } from './vault.js';

/** Opções só para testes e ferramentas internas: nunca vêm da Base, da configuração ou do navegador. */
export interface IntegrationOptions {
  endpoints?: Partial<Record<EndpointKey, string>>;
  fetch?: typeof fetch;
  vault?: TokenVault;
  /** Sincronização automática periódica (padrão: ligada no servidor). */
  autoSync?: boolean;
}

export interface IntegrationEnv {
  endpoint(key: EndpointKey): string;
  readonly fetch: typeof fetch;
  vault(): TokenVault;
  readonly autoSync: boolean;
}

export function createIntegrationEnv(secretsDir: string, options: IntegrationOptions = {}): IntegrationEnv {
  let vault: TokenVault | null = options.vault ?? null;
  return {
    endpoint: key => (options.endpoints?.[key] ?? DEFAULT_ENDPOINTS[key]).replace(/\/+$/, ''),
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    vault: () => (vault ??= openVault(secretsDir)),
    autoSync: options.autoSync ?? true,
  };
}

/** Erro devolvido por um provedor externo. A mensagem é curta, sem controle e sem nada que pareça credencial. */
export class ProviderError extends HttpError {
  constructor(readonly provider: string, readonly providerStatus: number, detail: string | null, readonly reason?: string) {
    super(502, `${provider} respondeu com erro${providerStatus ? ` (${providerStatus})` : ''}${detail ? `: ${detail}` : '.'}`, 'provider-error', { provider, status: providerStatus, ...(reason ? { reason } : {}) });
  }
}

export function cleanDetail(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 200);
  return looksLikeSecret(clean) || /(?:access|refresh)_token|bearer\s+[a-z0-9]/i.test(clean) ? 'detalhe omitido (continha dado sensível)' : clean;
}

function providerMessage(data: unknown): { detail: string | null; reason?: string } {
  if (!data || typeof data !== 'object') return { detail: null };
  const value = data as Record<string, any>;
  const error = value.error;
  if (typeof error === 'string') return { detail: cleanDetail(value.error_description ?? error), reason: error };
  if (error && typeof error === 'object') {
    const reason = error.status ?? error.type ?? error.code ?? error.details?.[0]?.errors?.[0]?.errorCode;
    return { detail: cleanDetail(error.message ?? error.error_user_msg), ...(reason ? { reason: String(typeof reason === 'object' ? Object.values(reason)[0] : reason) } : {}) };
  }
  if (Array.isArray(value.errors) && value.errors[0]) return { detail: cleanDetail(value.errors[0].message) };
  return { detail: cleanDetail(value.message) };
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  form?: Record<string, string>;
  json?: unknown;
  timeoutMs?: number;
}

/**
 * Chamada JSON a um provedor. Não segue redirecionamentos (o cabeçalho de autorização nunca vai para
 * outro endereço), tem tempo-limite e transforma falhas em ProviderError legível.
 */
export async function requestJson<T = any>(env: IntegrationEnv, provider: string, url: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'Workfoli-Hub', ...options.headers };
  let body: string | undefined;
  if (options.form) { body = new URLSearchParams(options.form).toString(); headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
  else if (options.json !== undefined) { body = JSON.stringify(options.json); headers['Content-Type'] = 'application/json'; }
  let response: Response;
  try {
    response = await env.fetch(url, { method: options.method ?? (body ? 'POST' : 'GET'), headers, body, redirect: 'manual', signal: AbortSignal.timeout(options.timeoutMs ?? 20_000) });
  } catch (error) {
    throw new ProviderError(provider, 0, (error as Error).name === 'TimeoutError' ? 'tempo esgotado' : 'sem resposta (rede)');
  }
  const text = await response.text();
  let data: unknown = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!response.ok) {
    const message = providerMessage(data);
    throw new ProviderError(provider, response.status, message.detail, message.reason);
  }
  // Alguns provedores (GitHub no OAuth) respondem 200 com { error }.
  if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') {
    const message = providerMessage(data);
    throw new ProviderError(provider, response.status, message.detail, message.reason);
  }
  return data as T;
}
