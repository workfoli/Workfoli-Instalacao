import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InstanceError } from './fsutil.js';

/** Raiz do repositório do Hub/Core (onde fica o package.json). */
export const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function coreVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(HUB_ROOT, 'package.json'), 'utf8')) as { version?: string };
  return pkg.version ?? '0.0.0';
}

/** Template de instalação do Hub: faz parte deste repositório. */
export function hubTemplateDir(): string {
  return path.join(HUB_ROOT, 'template', 'hub');
}

/**
 * Template canônico da Base. Ordem: WORKFOLI_BASE_TEMPLATE, depois a pasta irmã `workfoli BASE`.
 * A Base é um repositório separado; o Hub não guarda cópia dela.
 */
export function baseTemplateDir(explicit?: string): string {
  const candidates = [explicit, process.env.WORKFOLI_BASE_TEMPLATE, path.resolve(HUB_ROOT, '..', 'workfoli BASE')].filter((value): value is string => !!value);
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'workfoli.base.json'))) return path.resolve(candidate);
  }
  throw new InstanceError('Template da Base não encontrado. Informe --template <pasta> ou defina WORKFOLI_BASE_TEMPLATE.');
}

/** Pasta padrão onde as instâncias reais ficam (fora dos dois templates). */
export function defaultInstancesRoot(): string {
  return path.resolve(process.env.WORKFOLI_INSTANCES ?? path.join(HUB_ROOT, '..', 'instances'));
}
