import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import { HUB_ROOT } from '../packages/instance/templates.js';
import { makeTemplate, tempDir } from './helpers.js';

function cli(args: string[], options: { input?: string; env?: Record<string, string> } = {}) {
  const result = spawnSync(process.execPath, [path.join(HUB_ROOT, 'bin', 'workfoli.mjs'), ...args], {
    encoding: 'utf8', windowsHide: true, input: options.input, env: { ...process.env, NO_COLOR: '1', ...options.env }, timeout: 60_000,
  });
  return { code: result.status ?? -1, out: `${result.stdout}${result.stderr}` };
}

test('CLI creates a company, installs the Hub, diagnoses and manages secrets end to end', t => {
  const root = tempDir(t);
  const template = makeTemplate(root);
  const instances = path.join(root, 'instances');
  const init = cli(['init', 'empresa-cli', '--name', 'Empresa CLI', '--root', instances, '--template', template, '--no-git', '--with-hub', '--port', '48710']);
  assert.equal(init.code, 0, init.out);
  assert.match(init.out, /Hub instalado para Empresa CLI/);
  assert.match(init.out, /#\/ativar\?token=/);
  const instance = path.join(instances, 'empresa-cli');
  assert.equal(cli(['base', 'validate', path.join(instance, 'base')]).code, 0);
  const doctor = cli(['doctor', instance]);
  assert.equal(doctor.code, 0, doctor.out);
  assert.match(doctor.out, /proprietário ainda não ativou/);
  const again = cli(['hub', 'install', instance]);
  assert.equal(again.code, 0);
  assert.match(again.out, /Nada foi sobrescrito/);
  const secret = cli(['secrets', 'set', instance, 'GITHUB_TOKEN'], { input: 'valor-cli-sintetico\n' });
  assert.equal(secret.code, 0, secret.out);
  assert.ok(!secret.out.includes('valor-cli-sintetico'), 'value never echoed');
  assert.match(cli(['secrets', 'list', instance]).out, /GITHUB_TOKEN \(configurado\)/);
  assert.match(cli(['hub', 'owner', instance]).out, /ativação \(24h\)/);
  assert.match(cli(['hub', 'pair-code', instance]).out, /Código de pareamento/);
  const update = cli(['update', instance]);
  assert.equal(update.code, 0, update.out);
  assert.match(update.out, /simulação/);
  assert.match(cli(['diagnosticar', instance]).out, /Base válida/);
  const bad = cli(['base', 'validate', root]);
  assert.equal(bad.code, 2);
  assert.match(bad.out, /não é uma Base/);
  assert.equal(cli(['comando-inexistente']).code, 1);
  assert.match(cli(['help']).out, /workfoli <comando>/);
  assert.ok(fs.existsSync(path.join(instance, 'secrets', 'secrets.env')));
});

test('hub start says how to reach a pending owner without printing or replacing links', async t => {
  const root = tempDir(t);
  const template = makeTemplate(root);
  const instances = path.join(root, 'instances');
  assert.equal(cli(['init', 'empresa-start', '--name', 'Empresa Start', '--root', instances, '--template', template, '--no-git', '--with-hub']).code, 0);
  const child = spawn(process.execPath, [path.join(HUB_ROOT, 'bin', 'workfoli.mjs'), 'hub', 'start', path.join(instances, 'empresa-start'), '--port', '0'], {
    windowsHide: true, env: { ...process.env, NO_COLOR: '1' },
  });
  let output = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`hub start não terminou de iniciar: ${output}`)); }, 30_000);
    const read = (chunk: Buffer) => { output += chunk.toString('utf8'); if (/Ctrl\+C/.test(output)) child.kill(); };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('exit', () => { clearTimeout(timer); resolve(); });
  });
  assert.match(output, /Workfoli Hub de Empresa Start em http:\/\/127\.0\.0\.1:\d+/);
  assert.match(output, /Proprietário ainda sem conta: .*workfoli hub owner/);
  assert.doesNotMatch(output, /token=/, 'links only reach the terminal through hub owner');
});
