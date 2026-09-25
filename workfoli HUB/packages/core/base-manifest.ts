import { validateBaseManifest as validateContract } from '../contract/workfoli-contract.mjs';
import type { BaseManifest } from '../contract/workfoli-contract.mjs';

export type { BaseManifest };

/**
 * Valida um manifesto encontrado em material importado ou em backups.
 * Aceita v1 (Hub 0.2) convertendo para v2 em memória. Sem IO, sem execução, sem posse ou permissões.
 * A mensagem cita apenas os caminhos dos campos, nunca os valores recebidos.
 */
export function validateBaseManifest(input: unknown): BaseManifest {
  const result = validateContract(input, { expect: 'any' });
  if (!result.ok || !result.value) {
    const detail = result.errors.slice(0, 5).map(issue => `${issue.path || 'raiz'} (${issue.message})`).join('; ');
    throw new Error(`Manifesto da Base inválido: ${detail}.`);
  }
  return result.value;
}

/** Lista de módulos declarados, tolerando relatórios antigos que guardaram o formato v1. */
export function declaredModules(manifest: unknown): string[] {
  const modules = (manifest as { modules?: unknown } | null)?.modules;
  if (Array.isArray(modules)) return modules.filter((id): id is string => typeof id === 'string');
  const enabled = (modules as { enabled?: unknown } | undefined)?.enabled;
  return Array.isArray(enabled) ? enabled.filter((id): id is string => typeof id === 'string') : [];
}
