import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import { InstanceError, writeFileAtomic } from '../../instance/fsutil.js';

/**
 * Cofre de tokens das integrações desta instância.
 *
 * - Cada token (OAuth ou colado pelo administrador) é cifrado com AES-256-GCM e amarrado ao registro
 *   dono dele (AAD): uma cifra copiada para outra linha não abre.
 * - A chave mestra fica em `secrets/vault.key` (fora da Base e do Git). No Windows ela é protegida pelo
 *   DPAPI da conta do usuário: uma cópia dos arquivos em outra máquina/conta não decifra nada.
 * - Em servidor, a chave pode vir de `WORKFOLI_VAULT_KEY` (base64, 32 bytes), gerida pelo cofre do provedor.
 */
export interface TokenVault {
  readonly keyId: string;
  readonly protection: KeyProtection;
  encrypt(plain: string, context: string): string;
  decrypt(box: string, context: string): string;
}

export type KeyProtection = 'env' | 'dpapi' | 'file';
export const VAULT_KEY_FILE = 'vault.key';

export interface KeyProtector {
  readonly id: 'dpapi';
  protect(key: Buffer): string;
  unprotect(data: string): Buffer;
}

export class VaultError extends Error {}

const b64url = (buffer: Buffer) => buffer.toString('base64url');

/** DPAPI (escopo do usuário atual) via PowerShell. Os bytes trafegam por stdin, nunca pela linha de comando. */
export const dpapi: KeyProtector = {
  id: 'dpapi',
  protect(key) { return runDpapi('Protect', key.toString('base64')); },
  unprotect(data) { return Buffer.from(runDpapi('Unprotect', data), 'base64'); },
};

function runDpapi(operation: 'Protect' | 'Unprotect', input: string): string {
  const script = [
    'Add-Type -AssemblyName System.Security',
    '$data = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())',
    `$out = [System.Security.Cryptography.ProtectedData]::${operation}($data, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)`,
    '[Console]::Out.Write([Convert]::ToBase64String($out))',
  ].join('; ');
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { input, encoding: 'utf8', windowsHide: true, timeout: 30_000, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new VaultError(operation === 'Protect' ? 'Não foi possível proteger a chave do cofre com o DPAPI do Windows.' : 'A chave do cofre não abre nesta conta do Windows (cópia de outra máquina ou usuário?). Reconecte as integrações.');
  }
}

function createVault(key: Buffer, protection: KeyProtection): TokenVault {
  if (key.length !== 32) throw new VaultError('Chave do cofre inválida.');
  const keyId = createHash('sha256').update(key).digest('hex').slice(0, 12);
  return {
    keyId, protection,
    encrypt(plain, context) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(context, 'utf8'));
      const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return ['v1', keyId, b64url(iv), b64url(cipher.getAuthTag()), b64url(data)].join('.');
    },
    decrypt(box, context) {
      const parts = box.split('.');
      if (parts.length !== 5 || parts[0] !== 'v1') throw new VaultError('Credencial cifrada em formato desconhecido.');
      if (parts[1] !== keyId) throw new VaultError('Credencial cifrada com outra chave de cofre (instância copiada?). Reconecte a integração.');
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[2]!, 'base64url'));
        decipher.setAAD(Buffer.from(context, 'utf8'));
        decipher.setAuthTag(Buffer.from(parts[3]!, 'base64url'));
        return Buffer.concat([decipher.update(Buffer.from(parts[4]!, 'base64url')), decipher.final()]).toString('utf8');
      } catch { throw new VaultError('Credencial cifrada não confere (alterada ou de outro registro).'); }
    },
  };
}

interface KeyFile { format: 'workfoli-vault-key'; version: 1; protection: 'dpapi' | 'file'; key: string; createdAt: string; }

/**
 * Abre (ou cria na primeira vez) o cofre da instância. Ordem: variável de ambiente, arquivo existente,
 * nova chave protegida pelo DPAPI no Windows (ou arquivo com permissão restrita nos demais sistemas).
 */
export function openVault(secretsDir: string, options: { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; protector?: KeyProtector | null } = {}): TokenVault {
  const env = options.env ?? process.env;
  if (env.WORKFOLI_VAULT_KEY) {
    const key = Buffer.from(env.WORKFOLI_VAULT_KEY, 'base64');
    if (key.length !== 32) throw new VaultError('WORKFOLI_VAULT_KEY precisa ter 32 bytes em base64.');
    return createVault(key, 'env');
  }
  const platform = options.platform ?? process.platform;
  const protector = options.protector === undefined ? (platform === 'win32' ? dpapi : null) : options.protector;
  const file = path.join(secretsDir, VAULT_KEY_FILE);
  if (fs.existsSync(file)) {
    let parsed: KeyFile;
    try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as KeyFile; } catch { throw new VaultError('Arquivo da chave do cofre corrompido.'); }
    if (parsed.format !== 'workfoli-vault-key' || parsed.version !== 1) throw new VaultError('Arquivo da chave do cofre em formato desconhecido.');
    if (parsed.protection === 'dpapi') {
      if (!protector) throw new VaultError('A chave do cofre foi protegida pelo Windows (DPAPI) e não abre neste sistema.');
      return createVault(protector.unprotect(parsed.key), 'dpapi');
    }
    return createVault(Buffer.from(parsed.key, 'base64'), 'file');
  }
  const key = randomBytes(32);
  let record: KeyFile;
  if (protector) {
    const protectedKey = protector.protect(key);
    // Confere antes de gravar: nunca fica uma chave que não se consegue abrir.
    if (!protector.unprotect(protectedKey).equals(key)) throw new VaultError('A proteção da chave do cofre não confere.');
    record = { format: 'workfoli-vault-key', version: 1, protection: 'dpapi', key: protectedKey, createdAt: new Date().toISOString() };
  } else record = { format: 'workfoli-vault-key', version: 1, protection: 'file', key: key.toString('base64'), createdAt: new Date().toISOString() };
  if (!fs.existsSync(secretsDir)) throw new InstanceError('Pasta secrets da instância não encontrada.');
  writeFileAtomic(file, `${JSON.stringify(record, null, 2)}\n`, { exclusive: true, mode: 0o600 });
  return createVault(key, record.protection);
}
