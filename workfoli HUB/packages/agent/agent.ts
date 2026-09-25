import * as fs from 'node:fs';
import path from 'node:path';
import { HUB_CONFIG_FILE, INSTANCE_FILE, formatIssues, validateHubConfig, validateInstanceFile } from '../contract/workfoli-contract.mjs';
import type { InstanceFile } from '../contract/workfoli-contract.mjs';
import { readBaseManifest } from '../instance/base.js';
import { InstanceError, readJsonFile, writeJsonAtomic } from '../instance/fsutil.js';
import { applyBaseChange, journal } from '../hub/base-changes.js';
import { scanBase } from '../hub/base-scan.js';

/**
 * Workfoli Local Agent (Bridge). Roda no computador onde a Base está.
 * - Conexão sempre de SAÍDA para o Hub da própria empresa (nenhuma porta aberta nesta máquina).
 * - Envia apenas o snapshot permitido da Base (documentos de conhecimento e imagens de identidade).
 * - Aplica somente alterações tipadas da fila, conferindo a revisão esperada; nunca executa comandos livres.
 * - Credencial do dispositivo fica na pasta secrets da instância; revogável pelo Hub.
 */
interface AgentPaths { dir: string; instance: InstanceFile; base: string; secrets: string; data: string; hubConfigFile: string; }
interface AgentCredential { hubUrl: string; deviceId: string; token: string; pairedAt: string; name: string; instanceId: string; }

const at = (dir: string, value: string) => path.isAbsolute(value) || /^[a-z]:[\\/]/i.test(value) ? path.resolve(value) : path.resolve(dir, value);

function agentPaths(instanceDir: string): AgentPaths {
  const dir = path.resolve(instanceDir);
  const file = path.join(dir, INSTANCE_FILE);
  if (!fs.existsSync(file)) throw new InstanceError(`Instância não encontrada em ${dir}.`);
  const result = validateInstanceFile(readJsonFile(file));
  if (!result.ok || !result.value) throw new InstanceError(`${INSTANCE_FILE} inválido:\n${formatIssues(result.errors)}`);
  const layout = result.value.layout;
  return { dir, instance: result.value, base: at(dir, layout.base), secrets: at(dir, layout.secrets), data: at(dir, layout.data), hubConfigFile: path.join(at(dir, layout.hub), HUB_CONFIG_FILE) };
}

const credentialFile = (paths: AgentPaths) => path.join(paths.secrets, 'agent.json');

function readCredential(paths: AgentPaths): AgentCredential {
  const file = credentialFile(paths);
  if (!fs.existsSync(file)) throw new InstanceError('Este computador ainda não foi pareado. Rode `workfoli agent pair`.');
  return readJsonFile(file) as AgentCredential;
}

function normalizeUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new InstanceError('URL do Hub inválida.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new InstanceError('Use uma URL http(s) sem credenciais.');
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new InstanceError('Fora desta máquina o Hub precisa de HTTPS.');
  return url.origin;
}

async function call<T>(hubUrl: string, route: string, options: { method?: string; token?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${hubUrl}${route}`, {
      method: options.method ?? 'GET',
      headers: { ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    // Hub fora do ar ou rede indisponível: nada se perde (as alterações continuam na fila do Hub).
    throw Object.assign(new Error(`Sem resposta do Hub em ${hubUrl}. Confira se ele está no ar; as alterações pendentes continuam na fila.`), { status: 0 });
  }
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw Object.assign(new Error(data.error ?? `Hub respondeu ${response.status}.`), { status: response.status });
  return data as T;
}

export async function pairAgent(options: { instanceDir: string; hubUrl: string; code: string; name?: string }): Promise<{ deviceId: string; name: string }> {
  const paths = agentPaths(options.instanceDir);
  readBaseManifest(paths.base, 'active');
  const hubUrl = normalizeUrl(options.hubUrl);
  const result = await call<{ deviceId: string; name: string; token: string; instanceId: string }>(hubUrl, '/api/agent/pair', { method: 'POST', body: { code: options.code, name: options.name } });
  if (result.instanceId !== paths.instance.instanceId) {
    // Pareou com o Hub de OUTRA empresa: não guarda a credencial.
    throw new InstanceError('Este código pertence ao Hub de outra instância. Credencial descartada; revogue o dispositivo nesse Hub.');
  }
  fs.mkdirSync(paths.secrets, { recursive: true });
  writeJsonAtomic(credentialFile(paths), { hubUrl, deviceId: result.deviceId, token: result.token, pairedAt: new Date().toISOString(), name: result.name, instanceId: result.instanceId } satisfies AgentCredential);
  try { fs.chmodSync(credentialFile(paths), 0o600); } catch { /* Windows: protegido pelo perfil do usuário */ }
  return { deviceId: result.deviceId, name: result.name };
}

export interface CycleResult { snapshot: { changed: boolean; revision: string; files: number }; applied: number; failed: number; }

/**
 * Diário local dos comandos já aplicados. A entrega é "pelo menos uma vez": se o recibo se perder,
 * o Hub reenvia o comando e o Agent apenas reconfirma, sem aplicar de novo.
 */
interface AppliedLog { commands: Record<string, { at: string; summary: string }>; }
const appliedLogFile = (paths: AgentPaths) => path.join(paths.data, 'agent-applied.json');

function readAppliedLog(paths: AgentPaths): AppliedLog {
  const file = appliedLogFile(paths);
  if (!fs.existsSync(file)) return { commands: {} };
  try {
    const value = readJsonFile(file) as AppliedLog;
    return value && typeof value.commands === 'object' ? value : { commands: {} };
  } catch { return { commands: {} }; }
}

function rememberApplied(paths: AgentPaths, log: AppliedLog, id: string, summary: string): void {
  log.commands[id] = { at: new Date().toISOString(), summary };
  const entries = Object.entries(log.commands).sort(([, a], [, b]) => a.at.localeCompare(b.at)).slice(-500);
  writeJsonAtomic(appliedLogFile(paths), { commands: Object.fromEntries(entries) });
}

/** Um ciclo: envia snapshot, aplica comandos pendentes, reenvia se algo mudou. */
export async function agentCycle(options: { instanceDir: string; hubUrl?: string; signal?: AbortSignal; log?: (message: string) => void }): Promise<CycleResult> {
  const paths = agentPaths(options.instanceDir);
  const credential = readCredential(paths);
  if (credential.instanceId !== paths.instance.instanceId) throw new InstanceError('A credencial deste computador pertence a outra instância.');
  const hubUrl = normalizeUrl(options.hubUrl ?? credential.hubUrl);
  const upload = async () => {
    const { manifest, hash } = readBaseManifest(paths.base, 'active');
    const snapshot = scanBase(paths.base, manifest, hash);
    return call<CycleResult['snapshot']>(hubUrl, '/api/agent/snapshot', { method: 'POST', token: credential.token, body: snapshot, ...(options.signal ? { signal: options.signal } : {}) });
  };
  let snapshot = await upload();
  const { commands } = await call<{ commands: Array<{ id: string; type: string; change: unknown; expectedRevision: string | null; actorName: string | null }> }>(hubUrl, '/api/agent/commands', { token: credential.token, ...(options.signal ? { signal: options.signal } : {}) });
  let applied = 0, failed = 0;
  const log = readAppliedLog(paths);
  for (const command of commands) {
    if (!/^[0-9a-f-]{36}$/.test(command.id)) continue;
    const already = log.commands[command.id];
    if (already) {
      // Recibo perdido numa tentativa anterior: só reconfirma, sem reaplicar.
      await call(hubUrl, `/api/agent/commands/${command.id}/receipt`, { method: 'POST', token: credential.token, body: { status: 'applied', detail: already.summary } });
      continue;
    }
    let result: ReturnType<typeof applyBaseChange>;
    try {
      result = applyBaseChange(paths.base, command.change, { expectedManifestHash: command.expectedRevision, ...(command.actorName ? { actorName: command.actorName } : {}) });
    } catch (error) {
      // Só falha de APLICAÇÃO vira recibo de falha (ex.: a Base mudou desde o pedido).
      const detail = (error as Error).message.slice(0, 400);
      await call(hubUrl, `/api/agent/commands/${command.id}/receipt`, { method: 'POST', token: credential.token, body: { status: 'failed', detail } }).catch(() => undefined);
      options.log?.(`Comando recusado: ${detail}`);
      failed++;
      continue;
    }
    journal(paths.data, { source: 'agent', command: command.id, type: command.type, files: result.files });
    rememberApplied(paths, log, command.id, result.summary);
    // Se o recibo falhar aqui, o ciclo termina com erro e o próximo ciclo reconfirma pelo diário local.
    await call(hubUrl, `/api/agent/commands/${command.id}/receipt`, { method: 'POST', token: credential.token, body: { status: 'applied', detail: result.summary } });
    options.log?.(`Aplicado na Base: ${result.summary}`);
    applied++;
  }
  if (applied) snapshot = await upload();
  return { snapshot, applied, failed };
}

export async function runAgent(options: { instanceDir: string; hubUrl?: string; once?: boolean; signal?: AbortSignal; log?: (message: string) => void }): Promise<void> {
  const paths = agentPaths(options.instanceDir);
  let interval = 15;
  if (fs.existsSync(paths.hubConfigFile)) {
    const config = validateHubConfig(readJsonFile(paths.hubConfigFile));
    if (config.ok && config.value) interval = config.value.agent.intervalSeconds;
  }
  let backoff = interval;
  const log = options.log ?? (() => {});
  while (!options.signal?.aborted) {
    try {
      const result = await agentCycle(options);
      log(`Sincronizado (${result.snapshot.files} arquivos${result.snapshot.changed ? ', atualizado' : ''}${result.applied ? `, ${result.applied} alteração(ões) aplicada(s)` : ''}).`);
      backoff = interval;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401) throw new InstanceError('O Hub recusou este computador (pareamento revogado). Pareie novamente.');
      if (options.once) throw error;
      backoff = Math.min(backoff * 2, 300);
      log(`Hub indisponível (${(error as Error).message}). Nova tentativa em ${backoff}s.`);
    }
    if (options.once) return;
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, backoff * 1000);
      options.signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
}
