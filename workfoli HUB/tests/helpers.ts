import { after } from 'node:test';
import type { TestContext } from 'node:test';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { request } from 'node:http';
import { defaultCrmConfig } from '../packages/contract/workfoli-contract.mjs';
import { initBase } from '../packages/instance/base.js';
import { installHub } from '../packages/instance/instance.js';
import type { InstallOptions } from '../packages/instance/instance.js';
import { HUB_ROOT } from '../packages/instance/templates.js';
import { startHubServer } from '../packages/hub/server.js';
import type { HubServer, StartOptions } from '../packages/hub/server.js';
import assert from 'node:assert/strict';

const temporary: string[] = [];
// Remoção no fim do arquivo: no Windows, bancos abertos por servidores de teste travam a pasta
// até os hooks de cada teste fecharem tudo.
after(() => {
  for (const dir of temporary.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* o SO limpa a pasta temporária */ }
  }
});

/** Pasta temporária removida ao fim do arquivo de teste. Nunca usa dados reais. */
export function tempDir(_t: TestContext, prefix = 'workfoli-test-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporary.push(dir);
  return dir;
}

export function write(root: string, relative: string, content: string | Buffer): string {
  const file = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

export const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** Template sintético da Base, com o contrato real do Core. */
export function makeTemplate(root: string): string {
  const dir = path.join(root, 'template-base');
  write(dir, 'workfoli.base.json', JSON.stringify({
    $schema: './schemas/workfoli.base.schema.json', format: 'workfoli-base', schemaVersion: 3, baseId: null, status: 'template',
    template: { id: 'workfoli-base', version: '3.0.0' },
    company: { name: '[Nome da empresa]', slug: 'empresa' }, profile: 'services',
    identity: { guide: 'identidade/design-guide.md', symbol: 'identidade/simbolo.png', colors: { background: '#151716', accent: '#B8F24A' } },
    context: { memory: '_memoria', identity: 'identidade', tasks: 'tarefas.md', rules: 'AGENTS.md', knowledge: ['_memoria', 'processos', 'conhecimento', 'servicos'] },
    services: [{ id: 'servico-a', name: 'Serviço A', summary: 'Serviço sintético.', path: 'servicos/servico-a.md', visibility: 'public' }],
    projects: [],
    modules: { enabled: ['overview', 'company', 'knowledge', 'projects', 'files', 'tasks', 'crm', 'integrations', 'ai', 'history', 'patients'], settings: { crm: { label: 'Clientes' } } },
    crm: { ...defaultCrmConfig(), labels: { contact: 'Cliente', contacts: 'Clientes' } },
    integrations: [{ id: 'github', provider: 'github', status: 'pending', secrets: ['GITHUB_TOKEN'] }, { id: 'google-ads', provider: 'google-ads', status: 'planned' }],
    roles: [{ id: 'atendimento', name: 'Atendimento', permissions: ['crm:write', 'tasks:write', 'ai:use'] }],
    data: { versionable: ['_memoria', 'identidade', 'processos'], private: ['dados'] },
  }, null, 2));
  write(dir, 'AGENTS.md', '# Regras\n\nRegras sintéticas.\n');
  write(dir, '.gitignore', '.env\n.env.*\n!.env.example\ndados/*\n!dados/README.md\n');
  write(dir, '_memoria/empresa.md', '# Empresa\n\n**Nome:**\n');
  write(dir, 'identidade/design-guide.md', '# Identidade\n\nCores do template.\n');
  write(dir, 'identidade/simbolo.png', PNG_1PX);
  write(dir, 'tarefas.md', '# Tarefas\n\n## Agora\n\n- [ ] Revisar a memória\n\n## Feito\n\n- [x] Instalar\n');
  write(dir, 'processos/README.md', '# Processos\n\nComo trabalhamos.\n');
  write(dir, 'conhecimento/README.md', '# Conhecimento\n\nDecisões e histórico.\n');
  write(dir, 'servicos/servico-a.md', '# Serviço A\n\nDescrição sintética.\n');
  write(dir, 'dados/README.md', 'Entradas locais.\n');
  write(dir, 'scripts/workfoli-contract.mjs', fs.readFileSync(path.join(HUB_ROOT, 'packages/contract/workfoli-contract.mjs')));
  write(dir, 'schemas/workfoli.base.schema.json', fs.readFileSync(path.join(HUB_ROOT, 'packages/contract/schemas/workfoli.base.schema.json')));
  return dir;
}

export interface Fixture { root: string; template: string; instanceDir: string; baseDir: string; activationToken: string; }

export function makeInstance(t: TestContext, options: Partial<InstallOptions> & { name?: string } = {}): Fixture {
  const root = tempDir(t);
  const template = makeTemplate(root);
  const instanceDir = path.join(root, 'instances', 'empresa-sintetica');
  const baseDir = path.join(instanceDir, 'base');
  initBase({ dir: baseDir, name: options.name ?? 'Empresa Sintética', template, git: false });
  const result = installHub({ instanceDir, mode: options.mode ?? 'local', port: 4870, ...options });
  return { root, template, instanceDir, baseDir, activationToken: result.activationToken! };
}

/** Cliente HTTP com cookie de sessão e token CSRF, como o navegador faria. */
export class Client {
  cookie = '';
  csrf = '';
  constructor(readonly baseUrl: string) {}
  async call<T = any>(method: string, route: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; data: T; headers: Headers }> {
    const response = await fetch(`${this.baseUrl}${route}`, {
      method,
      headers: {
        ...(body !== undefined && !(body instanceof Buffer) ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(this.csrf && method !== 'GET' ? { 'X-Workfoli-CSRF': this.csrf } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: body instanceof Buffer ? body : JSON.stringify(body) }),
    });
    const setCookie = response.headers.getSetCookie?.() ?? [];
    for (const value of setCookie) {
      // Cookie de sessão por instalação: wf_session_<id curto da instância>.
      const match = /^(wf_session_[a-f0-9]{12})=([^;]*)/.exec(value);
      if (match) this.cookie = match[2] ? `${match[1]}=${match[2]}` : '';
    }
    const type = response.headers.get('content-type') ?? '';
    const data = type.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
    if (data && typeof data === 'object' && 'csrf' in data && typeof (data as { csrf: unknown }).csrf === 'string') this.csrf = (data as { csrf: string }).csrf;
    return { status: response.status, data: data as T, headers: response.headers };
  }
  get<T = any>(route: string) { return this.call<T>('GET', route); }
  post<T = any>(route: string, body: unknown = {}) { return this.call<T>('POST', route, body); }
  patch<T = any>(route: string, body: unknown) { return this.call<T>('PATCH', route, body); }
  del<T = any>(route: string) { return this.call<T>('DELETE', route); }
}

/** Requisição crua (para testar cabeçalhos que o fetch não deixa alterar, como Host). */
export function rawRequest(port: number, options: { path: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: options.path, method: options.method ?? 'GET', headers: options.headers ?? {} }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

/** Instância com Hub rodando em porta livre e proprietário já ativado. */
export async function hub(t: TestContext, options: Parameters<typeof makeInstance>[1] = {}, server: Partial<StartOptions> = {}) {
  const fixture = makeInstance(t, options);
  const running: HubServer = await startHubServer({ instanceDir: fixture.instanceDir, port: 0, quiet: true, webDir: path.join(fixture.root, 'sem-build'), ...server });
  t.after(() => running.close());
  const owner = new Client(running.url);
  const activated = await owner.post('/api/auth/activate', { token: fixture.activationToken, email: 'dona@exemplo.test', password: 'senha-sintetica-forte', name: 'Dona Sintética' });
  assert.equal(activated.status, 200, JSON.stringify(activated.data));
  return { fixture, server: running, owner };
}

export async function invite(owner: Client, server: HubServer, roleId: string, name: string, email: string) {
  const invited = await owner.post('/api/users', { name, roleId });
  assert.equal(invited.status, 200, JSON.stringify(invited.data));
  const token = decodeURIComponent(/token=([^&]+)/.exec(invited.data.activationPath)![1]!);
  const client = new Client(server.url);
  const activated = await client.post('/api/auth/activate', { token, email, password: 'outra-senha-forte-1' });
  assert.equal(activated.status, 200, JSON.stringify(activated.data));
  return client;
}
