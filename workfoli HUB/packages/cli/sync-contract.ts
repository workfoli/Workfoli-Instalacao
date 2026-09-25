import * as fs from 'node:fs';
import path from 'node:path';
import { InstanceError, sha256File, writeFileAtomic } from '../instance/fsutil.js';
import { HUB_ROOT, baseTemplateDir } from '../instance/templates.js';

/** Copia o contrato canônico (Core) para o template da Base. Só grava o que mudou. */
export function syncContract(templateOverride?: string): string[] {
  const template = baseTemplateDir(templateOverride);
  const pairs: Array<[string, string]> = [
    [path.join(HUB_ROOT, 'packages', 'contract', 'workfoli-contract.mjs'), path.join(template, 'scripts', 'workfoli-contract.mjs')],
    [path.join(HUB_ROOT, 'packages', 'contract', 'schemas', 'workfoli.base.schema.json'), path.join(template, 'schemas', 'workfoli.base.schema.json')],
  ];
  const written: string[] = [];
  for (const [source, target] of pairs) {
    if (!fs.existsSync(source)) throw new InstanceError(`Fonte do contrato ausente: ${source}`);
    if (fs.existsSync(target) && sha256File(source) === sha256File(target)) continue;
    writeFileAtomic(target, fs.readFileSync(source));
    written.push(path.relative(template, target).split(path.sep).join('/'));
  }
  return written;
}
