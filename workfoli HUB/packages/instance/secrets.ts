import * as fs from 'node:fs';
import path from 'node:path';
import { InstanceError, writeFileAtomic } from './fsutil.js';

/**
 * Cofre local da instância: `secrets/secrets.env`, fora da Base e fora do Git.
 * Cada empresa tem o seu arquivo; nenhuma credencial é compartilhada entre instâncias.
 * Em produção remota, substituir por cofre do provedor (mesma interface).
 */
export const SECRETS_FILE = 'secrets.env';
const NAME = /^[A-Z][A-Z0-9_]{1,63}$/;

export interface SecretStore {
  names(): string[];
  has(name: string): boolean;
  get(name: string): string | undefined;
  set(name: string, value: string): void;
  remove(name: string): boolean;
}

function parse(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]{1,63})=(.*)$/.exec(line);
    if (match && match[2]) values.set(match[1]!, match[2]!);
  }
  return values;
}

export function fileSecretStore(secretsDir: string, label = 'instância'): SecretStore {
  const file = path.join(secretsDir, SECRETS_FILE);
  const read = () => fs.existsSync(file) ? parse(fs.readFileSync(file, 'utf8')) : new Map<string, string>();
  const write = (values: Map<string, string>) => {
    const lines = [`# Segredos da ${label}. Nunca versionar nem copiar para a Base.`, ...[...values].map(([key, value]) => `${key}=${value}`), ''];
    writeFileAtomic(file, lines.join('\n'), { mode: 0o600 });
  };
  return {
    names: () => [...read().keys()].sort(),
    has: name => read().has(name),
    get: name => read().get(name),
    set(name, value) {
      if (!NAME.test(name)) throw new InstanceError('Nome de segredo inválido (use MAIUSCULAS_COM_UNDERLINE).');
      if (typeof value !== 'string' || !value || value.length > 8192 || /[\r\n\0]/.test(value)) throw new InstanceError('Valor de segredo inválido.');
      const values = read(); values.set(name, value); write(values);
    },
    remove(name) {
      const values = read();
      const removed = values.delete(name);
      if (removed) write(values);
      return removed;
    },
  };
}
