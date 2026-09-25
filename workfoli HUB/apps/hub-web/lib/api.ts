/** Cliente da API do Hub: mesma origem, cookie HttpOnly e cabeçalho CSRF em toda mutação. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string, readonly details?: Record<string, unknown>) { super(message); }
}

let csrf = '';
const unauthorized = new Set<() => void>();

export function setCsrf(value: string) { csrf = value; }
export function onUnauthorized(callback: () => void) { unauthorized.add(callback); return () => { unauthorized.delete(callback); }; }

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const method = options.method ?? (options.body === undefined ? 'GET' : 'POST');
  const binary = options.body instanceof Blob || options.body instanceof ArrayBuffer;
  let response: Response;
  try {
    response = await fetch(path, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: {
        ...(options.body !== undefined && !binary ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'X-Workfoli-CSRF': csrf } : {}),
        ...options.headers,
      },
      ...(options.body !== undefined ? { body: binary ? options.body as BodyInit : JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o Hub. Verifique se ele está em execução.');
  }
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json().catch(() => null) as ({ error?: string; code?: string; details?: Record<string, unknown> } | null) : null;
  if (response.status === 401 && !path.startsWith('/api/auth/')) unauthorized.forEach(callback => callback());
  if (!response.ok) throw new ApiError(response.status, data?.error ?? `O Hub respondeu ${response.status}.`, data?.code, data?.details);
  return data as T;
}

export const get = <T,>(path: string) => api<T>(path);
export const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const patch = <T,>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const put = <T,>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const del = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', ...(body === undefined ? {} : { body }) });

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Algo não saiu como esperado.';
}
