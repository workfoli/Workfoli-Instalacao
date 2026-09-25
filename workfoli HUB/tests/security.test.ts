import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { apiRoutes, matchRoute, permissionFor } from '../packages/hub/api.js';
import { CORE_ROLES, can } from '../packages/hub/permissions.js';
import { readBaseManifest, writeBaseManifest } from '../packages/instance/base.js';
import { Client, PNG_1PX, hub, invite, rawRequest, tempDir, write } from './helpers.js';

// Superfície pública e de dispositivo conhecida. Rota nova fora destas listas precisa de sessão (e de revisão deste teste).
const PUBLIC_ROUTES = ['GET /api/health', 'GET /api/brand', 'GET /api/brand/image', 'POST /api/auth/login', 'GET /api/auth/activation',
  'POST /api/auth/activate', 'GET /api/integrations/oauth/callback', 'POST /api/agent/pair'];
const DEVICE_ROUTES = ['POST /api/agent/snapshot', 'GET /api/agent/commands', 'POST /api/agent/commands/:id/receipt'];
// Rotas de sessão sem permissão fixa: a própria sessão, sair, trocar senha e imagem da Base (confere permissão no handler).
const SESSION_ONLY = ['GET /api/base/image', 'GET /api/session', 'POST /api/auth/logout', 'POST /api/auth/password'];

const key = (item: { method: string; path: string }) => `${item.method} ${item.path}`;
/** Caminho concreto para uma rota com parâmetros (valores sintéticos que casam com o padrão). */
const concrete = (route: string) => route.replace(':provider', 'google').replace(':entity', 'contacts').replace(/:[a-z]+/gi, 'id-sintetico');

test('route table: only the known routes are public or device-only, every other route needs a session and CSRF', async t => {
  const table = apiRoutes();
  assert.deepEqual(table.filter(item => item.auth === 'public').map(key).sort(), [...PUBLIC_ROUTES].sort());
  assert.deepEqual(table.filter(item => item.auth === 'device').map(key).sort(), [...DEVICE_ROUTES].sort());
  assert.deepEqual(table.filter(item => item.auth === 'session' && !item.permission && !item.dynamicPermission).map(key).sort(), [...SESSION_ONLY].sort());

  const { server, owner } = await hub(t);
  const anonymous = new Client(server.url);
  for (const item of table.filter(entry => entry.auth !== 'public')) {
    const response = await anonymous.call(item.method, concrete(item.path), item.method === 'GET' ? undefined : {});
    assert.equal(response.status, 401, `${key(item)} sem sessão`);
  }
  const mutations = table.filter(item => item.auth === 'session' && item.method !== 'GET');
  // Sessão válida sem o token CSRF (outra aba/página forjando o pedido): recusado antes de qualquer efeito.
  const withoutCsrf = new Client(server.url);
  withoutCsrf.cookie = owner.cookie;
  for (const item of mutations) assert.equal((await withoutCsrf.call(item.method, concrete(item.path), {})).status, 403, `${key(item)} sem CSRF`);
  // Com CSRF, mas vindo de outra origem: recusado.
  for (const item of mutations) {
    assert.equal((await owner.call(item.method, concrete(item.path), {}, { Origin: 'http://pagina-maliciosa.example' })).status, 403, `${key(item)} de outra origem`);
  }
  assert.equal((await owner.get('/api/session')).status, 200, 'the owner session survived every refused attempt');
});

test('role matrix: each Core role is refused by the server exactly where its permissions end', async t => {
  const { server, owner } = await hub(t);
  const clients: Record<string, Client> = {
    viewer: await invite(owner, server, 'viewer', 'Leitura Sintética', 'leitura@exemplo.test'),
    member: await invite(owner, server, 'member', 'Equipe Sintética', 'equipe@exemplo.test'),
    manager: await invite(owner, server, 'manager', 'Gestor Sintético', 'gestor@exemplo.test'),
  };
  let refused = 0;
  for (const [roleId, client] of Object.entries(clients)) {
    const granted = CORE_ROLES.find(role => role.id === roleId)!.permissions;
    for (const item of apiRoutes().filter(entry => entry.auth === 'session')) {
      const route = concrete(item.path);
      const found = matchRoute(item.method, route);
      assert.ok(found && found !== 'method', route);
      const needed = permissionFor(found.route, found.params);
      if (!needed) continue;
      const allowed = can(granted, needed);
      // Escritas permitidas não são disparadas aqui (os testes de cada módulo cobrem o efeito).
      if (allowed && item.method !== 'GET') continue;
      const response = await client.call(item.method, route, item.method === 'GET' ? undefined : {});
      if (allowed) assert.ok(![401, 403].includes(response.status), `${roleId} deveria acessar ${key(item)} (${response.status})`);
      else { assert.equal(response.status, 403, `${roleId} não pode ${key(item)}`); refused++; }
    }
  }
  assert.ok(refused > 40, `matriz exercitou ${refused} recusas`);
  const denied = (await owner.get('/api/audit?prefix=access.denied&limit=200')).data.entries as unknown[];
  assert.ok(denied.length >= 40, 'every refusal is audited');
});

test('content marked restricted in the Base stays hidden from roles without restricted:read on every route', async t => {
  const { fixture, server, owner } = await hub(t);
  write(fixture.baseDir, 'projetos/reservado/README.md', '# Projeto reservado\n\nPlano sintético de acesso restrito.\n');
  write(fixture.baseDir, 'servicos/reservado.md', '# Serviço reservado\n\nDescrição sintética restrita.\n');
  write(fixture.baseDir, 'identidade/reservada.png', PNG_1PX);
  const loaded = readBaseManifest(fixture.baseDir);
  writeBaseManifest(fixture.baseDir, {
    ...loaded.manifest,
    projects: [...loaded.manifest.projects, { id: 'reservado', name: 'Projeto reservado', type: 'other', status: 'active', path: 'projetos/reservado', visibility: 'restricted' }],
    services: [...loaded.manifest.services, { id: 'reservado', name: 'Serviço reservado', summary: 'Sintético.', path: 'servicos/reservado.md', status: 'active', visibility: 'restricted' }],
    assets: [...loaded.manifest.assets, { id: 'foto-reservada', kind: 'image', path: 'identidade/reservada.png', visibility: 'restricted' }],
  });
  server.runtime.base.invalidate();
  const hidden = ['projetos/reservado/README.md', 'servicos/reservado.md', 'identidade/reservada.png'];

  // Quem tem restricted:read (proprietário) vê tudo.
  const ownerFiles = ((await owner.get('/api/files')).data.base.files as Array<{ path: string }>).map(file => file.path);
  for (const file of hidden) assert.ok(ownerFiles.includes(file), `owner lists ${file}`);
  assert.equal((await owner.get('/api/files/base?path=projetos/reservado/README.md')).status, 200);
  assert.equal((await owner.get('/api/base/image?path=identidade/reservada.png')).status, 200);

  for (const roleId of ['member', 'viewer', 'manager']) {
    const client = await invite(owner, server, roleId, `Pessoa ${roleId}`, `${roleId}@exemplo.test`);
    const files = ((await client.get('/api/files')).data.base.files as Array<{ path: string }>).map(file => file.path);
    for (const file of hidden) assert.ok(!files.includes(file), `${roleId} must not list ${file}`);
    assert.equal((await client.get('/api/files/base?path=projetos/reservado/README.md')).status, 404, `${roleId} reads restricted project file`);
    assert.equal((await client.get('/api/files/base?path=servicos/reservado.md')).status, 404, `${roleId} reads restricted service file`);
    assert.equal((await client.get('/api/base/image?path=identidade/reservada.png')).status, 404, `${roleId} fetches restricted asset`);
    const documents = ((await client.get('/api/knowledge')).data.documents as Array<{ path: string }>).map(doc => doc.path);
    assert.ok(!documents.some(doc => hidden.includes(doc)), `${roleId} sees restricted knowledge`);
    assert.equal((await client.get('/api/projects/reservado')).status, 404);
    // O que é visível continua funcionando.
    assert.equal((await client.get('/api/files/base?path=servicos/servico-a.md')).status, 200);
    assert.equal((await client.get('/api/base/image?path=identidade/simbolo.png')).status, 200);
  }
  // Anexar um arquivo restrito da Base a um registro do CRM também é recusado.
  const member = await invite(owner, server, 'member', 'Equipe Anexos', 'anexos@exemplo.test');
  const contact = await member.post('/api/crm/contacts', { name: 'Contato Sintético' });
  assert.equal(contact.status, 200, JSON.stringify(contact.data));
  const attach = await member.post(`/api/crm/contacts/${contact.data.id}/attachments`, { kind: 'base-file', ref: 'projetos/reservado/README.md', label: 'Plano' });
  assert.equal(attach.status, 400, 'restricted Base file cannot be attached by a role that cannot see it');
  // Anexado por quem pode ver: quem não pode recebe só o aviso, sem o caminho.
  assert.equal((await owner.post(`/api/crm/contacts/${contact.data.id}/attachments`, { kind: 'base-file', ref: 'projetos/reservado/README.md', label: 'Plano' })).status, 200);
  const seenByMember = (await member.get(`/api/crm/contacts/${contact.data.id}`)).data.attachments as Array<{ kind: string; ref: string | null; available: boolean }>;
  assert.deepEqual(seenByMember.map(item => [item.kind, item.ref, item.available]), [['base-file', null, false]]);
  const seenByOwner = (await owner.get(`/api/crm/contacts/${contact.data.id}`)).data.attachments as Array<{ ref: string | null; available: boolean }>;
  assert.deepEqual(seenByOwner.map(item => [item.ref, item.available]), [['projetos/reservado/README.md', true]]);
});

test('two installations on the same machine never share sessions, links or devices', async t => {
  const alfa = await hub(t, { name: 'Empresa Alfa Sintética' });
  const beta = await hub(t, { name: 'Empresa Beta Sintética' });
  const name = (client: Client) => client.cookie.split('=')[0];
  // Navegadores não separam cookies por porta: com o mesmo nome, entrar num Hub derrubaria a sessão do outro.
  assert.notEqual(name(alfa.owner), name(beta.owner), 'each installation uses its own session cookie name');
  const both = `${alfa.owner.cookie}; ${beta.owner.cookie}`;
  const withBoth = await fetch(`${beta.server.url}/api/session`, { headers: { Cookie: both } });
  assert.equal(withBoth.status, 200, 'Beta picks its own cookie even when the browser also sends Alfa\'s');
  const onlyAlfa = await fetch(`${beta.server.url}/api/overview`, { headers: { Cookie: alfa.owner.cookie } });
  assert.equal(onlyAlfa.status, 401, 'a session of Alfa is not a session of Beta');
  const cleared = onlyAlfa.headers.getSetCookie().join(' ');
  assert.ok(!cleared.includes(`${name(alfa.owner)}=`), 'Beta never clears the cookie of Alfa');
  assert.equal((await alfa.owner.get('/api/session')).status, 200, 'Alfa session intact');

  const invited = await alfa.owner.post('/api/users', { name: 'Pessoa Sintética', roleId: 'member' });
  const token = decodeURIComponent(/token=([^&]+)/.exec(invited.data.activationPath)![1]!);
  assert.equal((await new Client(beta.server.url).get(`/api/auth/activation?token=${encodeURIComponent(token)}`)).status, 400, 'activation link is per installation');
  const code = (await alfa.owner.post('/api/settings/pairing', { name: 'Computador Alfa' })).data.code as string;
  assert.equal((await new Client(beta.server.url).post('/api/agent/pair', { code })).status, 400, 'pairing code is per installation');
  const paired = await new Client(alfa.server.url).post('/api/agent/pair', { code });
  assert.equal(paired.status, 200);
  const device = await fetch(`${beta.server.url}/api/agent/commands`, { headers: { Authorization: `Bearer ${paired.data.token}` } });
  assert.equal(device.status, 401, 'a device of Alfa is not a device of Beta');
});

test('private uploads neutralize hostile names, reject malformed headers cleanly and download as attachments', async t => {
  const { fixture, owner } = await hub(t);
  const upload = (fileName: string) => owner.call('POST', '/api/files/private', Buffer.from('conteúdo sintético'), { 'Content-Type': 'text/plain', 'X-File-Name': fileName });
  const traversal = await upload(encodeURIComponent('..\\..\\secrets\\vault.key'));
  assert.equal(traversal.status, 200, JSON.stringify(traversal.data));
  assert.ok(!/[\\/]/.test(traversal.data.name), 'separators removed from the stored name');
  assert.ok(fs.existsSync(path.join(fixture.instanceDir, 'files', 'private', traversal.data.id)), 'stored by id inside files/private');
  const html = await upload(encodeURIComponent('<img src=x onerror=alert(1)>.html'));
  assert.equal(html.status, 200);
  assert.ok(!/[<>]/.test(html.data.name), 'markup characters neutralized in the name');
  const malformed = await upload('%E0%A4%A');
  assert.equal(malformed.status, 400);
  assert.match(malformed.data.error, /nome do arquivo/i);
  const download = await owner.get(`/api/files/private/${html.data.id}`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition') ?? '', /^attachment;/);
  assert.equal(download.headers.get('content-type'), 'application/octet-stream', 'never rendered inline as HTML');
  assert.match(download.headers.get('content-security-policy') ?? '', /sandbox/);
  assert.equal((await owner.get('/api/files/private/..%2F..%2Fsecrets')).status, 404);
  assert.equal((await owner.get(`/api/files/private/${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}`)).status, 404);
});

test('static files: encoded traversal never leaves the web folder', async t => {
  const outside = tempDir(t, 'workfoli-web-');
  const web = path.join(outside, 'web');
  write(web, 'index.html', '<!doctype html><title>Workfoli Hub</title><div id="root">INDEX-SINTETICO</div>');
  write(web, 'assets/app.js', 'console.log("app")');
  write(outside, 'canario.txt', 'CANARIO-FORA-DA-PASTA');
  const { server } = await hub(t, {}, { webDir: web });
  const probes = ['/..%2Fcanario.txt', '/%2e%2e/canario.txt', '/..%5Ccanario.txt', '/assets/..%2F..%2Fcanario.txt', '/assets/%2e%2e%5c%2e%2e%5ccanario.txt', '/%252e%252e/canario.txt'];
  for (const probe of probes) {
    const response = await rawRequest(server.port, { path: probe, headers: { Host: `127.0.0.1:${server.port}` } });
    assert.ok(!response.body.includes('CANARIO'), `${probe} escaped the web folder`);
  }
  const asset = await rawRequest(server.port, { path: '/assets/app.js', headers: { Host: `127.0.0.1:${server.port}` } });
  assert.equal(asset.status, 200);
  assert.match(asset.body, /console\.log/);
});
