import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyBaseUpgrade, checkBase, initBase, planBaseUpgrade, readBaseManifest, writeBaseManifest } from '../packages/instance/base.js';
import { doctorInstance, doctorTemplates } from '../packages/instance/doctor.js';
import { sha256File, listFiles } from '../packages/instance/fsutil.js';
import { installHub, loadInstance, syncHub } from '../packages/instance/instance.js';
import { fileSecretStore } from '../packages/instance/secrets.js';
import { HUB_ROOT } from '../packages/instance/templates.js';
import { applyUpdate, planUpdate } from '../packages/instance/update.js';
import { openHubDatabase } from '../packages/hub/db.js';
import { activateAccount, ownerFirstAccess } from '../packages/hub/users.js';
import { makeInstance, makeTemplate, tempDir, write } from './helpers.js';

const templateHashes = (dir: string) => Object.fromEntries(listFiles(dir, () => true).map(file => [file, sha256File(path.join(dir, file))]));

test('a new Base comes from the template without touching it and gets its own identity', t => {
  const root = tempDir(t);
  const template = makeTemplate(root);
  const before = templateHashes(template);
  const first = initBase({ dir: path.join(root, 'a', 'base'), name: 'Clínica Sintética', template, git: false });
  const second = initBase({ dir: path.join(root, 'b', 'base'), name: 'Agência Sintética', template, git: false, profile: 'agency' });
  assert.deepEqual(templateHashes(template), before, 'template stays byte-identical');
  assert.equal(first.manifest.status, 'active');
  assert.equal(first.manifest.company.slug, 'clinica-sintetica');
  assert.notEqual(first.manifest.baseId, second.manifest.baseId);
  assert.equal(second.manifest.profile, 'agency');
  const lock = JSON.parse(fs.readFileSync(path.join(first.dir, '.workfoli', 'template.lock.json'), 'utf8'));
  assert.equal(lock.template.version, '3.0.0');
  assert.ok(lock.files['AGENTS.md']);
  assert.ok(!lock.files['workfoli.base.json'], 'manifest is merged structurally, never by file hash');
  assert.ok(!fs.existsSync(path.join(first.dir, 'dados', 'segredo.txt')));
});

test('Base creation refuses unsafe destinations and leaves nothing half-created', t => {
  const root = tempDir(t);
  const template = makeTemplate(root);
  write(root, 'ocupada/arquivo.txt', 'x');
  assert.throws(() => initBase({ dir: path.join(root, 'ocupada'), name: 'X', template, git: false }), /vazia/);
  assert.throws(() => initBase({ dir: path.join(template, 'dentro'), name: 'X', template, git: false }), /template/);
  assert.throws(() => initBase({ dir: path.join(HUB_ROOT, 'instancia-errada'), name: 'X', template, git: false }), /Hub|template/);
  const outer = initBase({ dir: path.join(root, 'externa'), name: 'Externa', template, git: false });
  assert.throws(() => initBase({ dir: path.join(outer.dir, 'aninhada'), name: 'X', template, git: false }), /outra Base/);
  assert.throws(() => initBase({ dir: path.join(root, 'sem-nome'), name: '   ', template, git: false }), /nome/);
  assert.ok(!fs.existsSync(path.join(root, 'sem-nome')));
});

test('checkBase blocks credentials in versionable files and unprotected private folders', t => {
  const root = tempDir(t);
  const template = makeTemplate(root);
  const base = initBase({ dir: path.join(root, 'base'), name: 'Empresa', template, git: false }).dir;
  assert.equal(checkBase(base).ok, true);
  const token = ['ghp', '_', 'B'.repeat(36)].join('');
  write(base, 'processos/deploy.md', `# Deploy\n\nToken: ${token}\n`);
  write(base, 'conhecimento/atendimento.md', '# Atendimento\n\nPaciente: Fulano de Tal\nCPF 123.456.789-00\n');
  write(base, '.env', 'API_KEY=x');
  const check = checkBase(base);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some(issue => issue.path === 'processos/deploy.md'));
  assert.ok(check.warnings.some(issue => issue.path === 'conhecimento/atendimento.md'));
  assert.ok(check.info.some(issue => issue.path === '.env'));
  assert.ok(!JSON.stringify(check).includes(token), 'report never repeats the secret');
  fs.writeFileSync(path.join(base, '.gitignore'), 'node_modules/\n');
  const unprotected = checkBase(base);
  assert.ok(unprotected.errors.some(issue => /dados/.test(issue.message)));
  assert.ok(unprotected.errors.some(issue => /\.env/.test(issue.message)));
});

test('installing the Hub reads the Base contract, isolates data layers and is idempotent', t => {
  const fixture = makeInstance(t);
  const instance = loadInstance(fixture.instanceDir);
  assert.equal(instance.file.company.name, 'Empresa Sintética');
  for (const layer of ['data', 'files', 'secrets'] as const) {
    assert.ok(fs.existsSync(instance.paths[layer]));
    assert.ok(!instance.paths[layer].startsWith(instance.paths.base));
  }
  assert.match(fs.readFileSync(path.join(fixture.instanceDir, '.gitignore'), 'utf8'), /secrets\//);
  const db = new DatabaseSync(instance.dbPath, { readOnly: true });
  try {
    const roles = (db.prepare('SELECT id,source FROM roles ORDER BY id').all() as Array<{ id: string; source: string }>).map(row => `${row.id}:${row.source}`);
    assert.deepEqual(roles, ['admin:core', 'atendimento:base', 'manager:core', 'member:core', 'owner:core', 'viewer:core']);
    const owner = db.prepare("SELECT status FROM users WHERE role_id='owner'").get() as { status: string };
    assert.equal(owner.status, 'pending');
  } finally { db.close(); }
  assert.ok(fixture.activationToken.length >= 40);
  const again = installHub({ instanceDir: fixture.instanceDir });
  assert.equal(again.status, 'exists');
  assert.equal(again.activationToken, null);
  const otherBase = initBase({ dir: path.join(fixture.root, 'outra-base'), name: 'Outra', template: fixture.template, git: false });
  assert.throws(() => installHub({ instanceDir: fixture.instanceDir, baseDir: otherBase.dir }), /outra Base/);
  assert.deepEqual(installHub({ instanceDir: fixture.instanceDir }).modules.planned, ['patients']);
  assert.throws(() => installHub({ instanceDir: path.join(HUB_ROOT, 'instances', 'x'), baseDir: fixture.baseDir }), /repositório do Hub/);
});

test('first access on the Hub computer gets a fresh owner link only while the owner has no account', async t => {
  const fixture = makeInstance(t);
  const db = openHubDatabase(loadInstance(fixture.instanceDir).dbPath);
  try {
    const activationTokens = () => (db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE kind='activation'").get() as { n: number }).n;
    const before = activationTokens();
    assert.deepEqual(ownerFirstAccess(db, { issue: false }), { pending: true, userId: null, token: null });
    assert.equal(activationTokens(), before, 'without --open nothing is issued');
    const fresh = ownerFirstAccess(db, { issue: true });
    assert.equal(fresh.pending, true);
    assert.ok(fresh.token && fresh.token !== fixture.activationToken);
    await assert.rejects(activateAccount(db, { token: fixture.activationToken, email: 'dona@exemplo.test', password: 'senha-sintetica-forte' }), /inválido|expirado/, 'the previous link stops working');
    await activateAccount(db, { token: fresh.token, name: 'Dona Sintética', email: 'dona@exemplo.test', password: 'senha-sintetica-forte' });
    assert.deepEqual(ownerFirstAccess(db, { issue: true }), { pending: false, userId: null, token: null });
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE kind='activation' AND used_at IS NULL").get() as { n: number }).n, 0, 'an active owner never gets a new link on start');
  } finally { db.close(); }
});

test('sync reads display data live but requires approval for role suggestions and renames', t => {
  const fixture = makeInstance(t);
  const loaded = readBaseManifest(fixture.baseDir);
  writeBaseManifest(fixture.baseDir, {
    ...loaded.manifest, company: { ...loaded.manifest.company, name: 'Empresa Renomeada', slug: 'empresa-renomeada' },
    roles: [{ id: 'atendimento', name: 'Atendimento', permissions: ['crm:write'] }, { id: 'marketing', name: 'Marketing', permissions: ['projects:write'] }],
  });
  const dry = syncHub(fixture.instanceDir);
  assert.deepEqual(dry.roles.map(role => `${role.id}:${role.change}`).sort(), ['atendimento:changed', 'marketing:new']);
  assert.equal(dry.company?.after, 'Empresa Renomeada');
  assert.deepEqual(dry.applied, []);
  assert.equal(loadInstance(fixture.instanceDir).file.company.name, 'Empresa Sintética');
  const applied = syncHub(fixture.instanceDir, { apply: true });
  assert.deepEqual(applied.applied.sort(), ['company', 'role:atendimento', 'role:marketing']);
  assert.equal(loadInstance(fixture.instanceDir).file.company.name, 'Empresa Renomeada');
  assert.deepEqual(syncHub(fixture.instanceDir).roles, []);
});

test('template upgrade keeps customizations and never deletes company files', t => {
  const root = tempDir(t);
  const template = makeTemplate(root);
  const base = initBase({ dir: path.join(root, 'base'), name: 'Empresa', template, git: false }).dir;
  write(base, 'processos/README.md', '# Processos\n\nNosso jeito próprio.\n');           // customizado pela empresa
  fs.rmSync(path.join(base, 'conhecimento', 'README.md'));                           // removido pela empresa
  write(template, 'AGENTS.md', '# Regras\n\nRegras novas do template.\n');            // template mudou, empresa não
  write(template, 'processos/README.md', '# Processos\n\nVersão nova do template.\n'); // os dois mudaram
  write(template, 'novidade.md', '# Novo arquivo do template\n');
  const manifest = JSON.parse(fs.readFileSync(path.join(template, 'workfoli.base.json'), 'utf8'));
  manifest.template.version = '2.1.0';
  write(template, 'workfoli.base.json', JSON.stringify(manifest));
  const plan = planBaseUpgrade(base, template);
  const action = (file: string) => plan.items.find(item => item.path === file)?.action;
  assert.equal(action('AGENTS.md'), 'update');
  assert.equal(action('processos/README.md'), 'conflict');
  assert.equal(action('conhecimento/README.md'), 'removed-by-client');
  assert.equal(action('novidade.md'), 'add');
  assert.equal(action('tarefas.md'), 'unchanged');
  applyBaseUpgrade(base, template);
  assert.match(fs.readFileSync(path.join(base, 'AGENTS.md'), 'utf8'), /Regras novas/);
  assert.match(fs.readFileSync(path.join(base, 'processos', 'README.md'), 'utf8'), /jeito próprio/);
  assert.match(fs.readFileSync(path.join(base, '.workfoli', 'upgrade', 'processos', 'README.md.template'), 'utf8'), /Versão nova/);
  assert.ok(!fs.existsSync(path.join(base, 'conhecimento', 'README.md')));
  assert.ok(fs.existsSync(path.join(base, 'novidade.md')));
  assert.equal(readBaseManifest(base).manifest.template?.version, '2.1.0');
  assert.ok(planBaseUpgrade(base, template).items.every(item => ['unchanged', 'keep-custom', 'removed-by-client'].includes(item.action)));
});

test('update keeps the validator inside the Base in step with the Core, with a backup of the old copy', t => {
  const fixture = makeInstance(t);
  const old = '// cópia antiga do contrato (v2)\nexport const CONTRACT_VERSION = "2.0.0";\n';
  write(fixture.baseDir, 'scripts/workfoli-contract.mjs', old);
  const lockFile = path.join(fixture.baseDir, '.workfoli', 'template.lock.json');
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  lock.files['scripts/workfoli-contract.mjs'] = sha256File(path.join(fixture.baseDir, 'scripts', 'workfoli-contract.mjs'));
  fs.writeFileSync(lockFile, JSON.stringify(lock));
  assert.deepEqual(planUpdate(fixture.instanceDir).contract.outdated, ['scripts/workfoli-contract.mjs']);
  assert.ok(doctorInstance(fixture.instanceDir).findings.some(finding => finding.area === 'contrato' && finding.level === 'warn'), 'doctor warns before the update');
  applyUpdate(fixture.instanceDir);
  const refreshed = path.join(fixture.baseDir, 'scripts', 'workfoli-contract.mjs');
  assert.equal(sha256File(refreshed), sha256File(path.join(HUB_ROOT, 'packages', 'contract', 'workfoli-contract.mjs')), 'the Base validator is the Core validator again');
  const backups = fs.readdirSync(path.join(fixture.instanceDir, 'data', 'backups')).filter(name => name.startsWith('contrato-'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(fixture.instanceDir, 'data', 'backups', backups[0]!, 'scripts', 'workfoli-contract.mjs'), 'utf8'), old, 'the previous copy is kept');
  assert.equal(JSON.parse(fs.readFileSync(lockFile, 'utf8')).files['scripts/workfoli-contract.mjs'], sha256File(refreshed), 'a later base upgrade will not mistake it for a customization');
  assert.deepEqual(planUpdate(fixture.instanceDir).contract.outdated, []);
  assert.ok(doctorInstance(fixture.instanceDir).findings.some(finding => finding.area === 'contrato' && finding.level === 'ok'));
});

test('update converts a v1 manifest with backup and pins the current Core', t => {
  const fixture = makeInstance(t);
  const current = readBaseManifest(fixture.baseDir).manifest;
  write(fixture.baseDir, 'workfoli.base.json', JSON.stringify({ format: 'workfoli-base', schemaVersion: 1, baseId: current.baseId, company: { name: 'Empresa Sintética' }, profile: 'general', modules: ['overview', 'files'], paths: { memory: '_memoria', identity: 'identidade' } }));
  const instanceFile = path.join(fixture.instanceDir, 'workfoli.instance.json');
  const instance = JSON.parse(fs.readFileSync(instanceFile, 'utf8'));
  fs.writeFileSync(instanceFile, JSON.stringify({ ...instance, core: { version: '0.1.0' } }));
  const plan = planUpdate(fixture.instanceDir);
  assert.equal(plan.manifest.needsUpgrade, true);
  assert.equal(plan.core.changed, true);
  applyUpdate(fixture.instanceDir);
  assert.equal(readBaseManifest(fixture.baseDir).manifest.schemaVersion, 3);
  assert.ok(fs.readdirSync(path.join(fixture.instanceDir, 'data', 'backups')).some(file => file.startsWith('workfoli.base-v1-')));
  assert.equal(planUpdate(fixture.instanceDir).core.changed, false);
});

test('roles added or changed by a newer Core reach older databases, never taking over a custom role', t => {
  const fixture = makeInstance(t);
  const dbPath = loadInstance(fixture.instanceDir).dbPath;
  // Banco como o de uma instância criada antes do papel "Gestor Workfoli": papel ausente, Equipe com permissões antigas,
  // e um papel personalizado que usava o id "manager", com uma pessoa nele.
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys=ON');
  db.prepare("DELETE FROM roles WHERE id='manager'").run();
  db.prepare("UPDATE roles SET permissions=? WHERE id='member'").run(JSON.stringify(['overview:read', 'crm:write']));
  db.prepare("INSERT INTO roles(id,name,description,permissions,source,created_at,updated_at) VALUES ('manager','Gerente da loja','',?,'custom',?,?)").run(JSON.stringify(['tasks:write']), new Date().toISOString(), new Date().toISOString());
  db.prepare("INSERT INTO users(id,name,email,role_id,status,created_at,updated_at) VALUES ('u-gerente','Gerente Sintética','gerente@exemplo.test','manager','active',?,?)").run(new Date().toISOString(), new Date().toISOString());
  db.close();

  const plan = planUpdate(fixture.instanceDir);
  assert.deepEqual(plan.roles, { missing: [], outdated: ['member'], reserved: ['manager'] });
  assert.ok(doctorInstance(fixture.instanceDir).findings.some(finding => finding.area === 'acesso' && finding.level === 'warn' && /papéis do Core/.test(finding.message)));
  applyUpdate(fixture.instanceDir);
  const after = new DatabaseSync(dbPath, { readOnly: true });
  const role = (id: string) => after.prepare('SELECT name, permissions, source FROM roles WHERE id=?').get(id) as { name: string; permissions: string; source: string } | undefined;
  assert.equal(role('manager')?.source, 'core');
  assert.ok(JSON.parse(role('manager')!.permissions).includes('crm:admin'));
  assert.ok(JSON.parse(role('member')!.permissions).includes('marketing:read'), 'Equipe recebe as permissões desta versão');
  assert.deepEqual({ ...role('manager-anterior') }, { name: 'Gerente da loja', permissions: JSON.stringify(['tasks:write']), source: 'custom' }, 'o papel antigo é preservado');
  assert.equal((after.prepare("SELECT role_id FROM users WHERE id='u-gerente'").get() as { role_id: string }).role_id, 'manager-anterior', 'quem usava o papel antigo não ganha o acesso da Workfoli');
  after.close();
  assert.deepEqual(planUpdate(fixture.instanceDir).roles, { missing: [], outdated: [], reserved: [] });
});

test('opening the Hub brings Core roles up to date even without running update', async t => {
  const fixture = makeInstance(t);
  const dbPath = loadInstance(fixture.instanceDir).dbPath;
  const db = new DatabaseSync(dbPath);
  db.prepare("DELETE FROM roles WHERE id='manager'").run();
  db.close();
  const { startHubServer } = await import('../packages/hub/server.js');
  const server = await startHubServer({ instanceDir: fixture.instanceDir, port: 0, quiet: true, webDir: path.join(fixture.root, 'sem-build') });
  t.after(() => server.close());
  assert.equal((server.runtime.db.prepare("SELECT source FROM roles WHERE id='manager'").get() as { source: string }).source, 'core');
  const audit = server.runtime.db.prepare("SELECT detail FROM audit WHERE action='roles.core-synced'").all() as Array<{ detail: string }>;
  assert.equal(audit.length, 1);
  assert.match(audit[0]!.detail, /manager/);
});

test('secrets live outside the Base, per instance, and only by name', t => {
  const fixture = makeInstance(t);
  const store = fileSecretStore(path.join(fixture.instanceDir, 'secrets'));
  store.set('GITHUB_TOKEN', 'valor-sintetico-123');
  assert.deepEqual(store.names(), ['GITHUB_TOKEN']);
  assert.equal(store.get('GITHUB_TOKEN'), 'valor-sintetico-123');
  assert.throws(() => store.set('github_token', 'x'), /Nome/);
  assert.throws(() => store.set('OUTRO', 'linha\nquebrada'), /Valor/);
  assert.equal(store.remove('GITHUB_TOKEN'), true);
  assert.ok(!listFiles(fixture.baseDir, () => true).some(file => /secrets\.env$/.test(file)));
});

test('doctor reports a healthy instance and catches data leaking into the Base', t => {
  const fixture = makeInstance(t);
  const healthy = doctorInstance(fixture.instanceDir);
  assert.equal(healthy.ok, true, JSON.stringify(healthy.findings.filter(item => item.level === 'error')));
  assert.ok(healthy.findings.some(item => item.area === 'acesso' && item.level === 'warn'), 'pending owner is reported');
  write(fixture.baseDir, 'dados-vazados/hub.sqlite', 'x');
  assert.equal(doctorInstance(fixture.instanceDir).ok, false);
});

test('template doctor validates the contract copy and a private denylist without printing terms', t => {
  const root = tempDir(t);
  const template = makeTemplate(root);
  const denylist = write(root, 'denylist.txt', '# privado\nTermoSecretoDoCliente\n');
  assert.ok(doctorTemplates({ baseTemplate: template, denylist }).findings.every(item => item.area !== 'base-template' || item.level !== 'error'));
  write(template, 'processos/cliente.md', 'Material do TermoSecretoDoCliente');
  const report = doctorTemplates({ baseTemplate: template, denylist });
  const hit = report.findings.find(item => /termo proibido/.test(item.message));
  assert.ok(hit);
  assert.ok(!JSON.stringify(report).includes('TermoSecretoDoCliente'));
  write(template, 'scripts/workfoli-contract.mjs', '// desatualizado');
  assert.ok(doctorTemplates({ baseTemplate: template }).findings.some(item => item.area === 'contrato' && item.level === 'error'));
});
