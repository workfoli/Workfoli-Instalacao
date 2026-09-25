import { spawn } from 'node:child_process';
import path from 'node:path';
import { slugify } from '../contract/workfoli-contract.mjs';
import type { HubMode, Profile } from '../contract/workfoli-contract.mjs';
import { applyBaseUpgrade, checkBase, initBase, planBaseUpgrade } from '../instance/base.js';
import type { InitBaseResult } from '../instance/base.js';
import { doctorInstance, doctorTemplates } from '../instance/doctor.js';
import { hubUrl, installHub, loadInstance, syncHub } from '../instance/instance.js';
import type { LoadedInstance } from '../instance/instance.js';
import { fileSecretStore } from '../instance/secrets.js';
import { coreVersion, defaultInstancesRoot } from '../instance/templates.js';
import { applyUpdate, planUpdate } from '../instance/update.js';
import { audit } from '../hub/audit.js';
import { issueToken } from '../hub/auth.js';
import { openHubDatabase } from '../hub/db.js';
import { ensureOwner, inviteUser, ownerFirstAccess, recoverOwner } from '../hub/users.js';
import { flag, has, intFlag, parseArgs } from './args.js';
import type { ParsedArgs } from './args.js';
import { out, printFindings } from './output.js';
import { syncContract } from './sync-contract.js';

export class CliError extends Error { constructor(message: string, readonly code = 1) { super(message); } }

const HELP = `Workfoli ${coreVersion()} — Core, Base e Hub

Uso: workfoli <comando> [opções]

Empresa nova
  init <slug> --name "Empresa" [--root <pasta>] [--profile services] [--with-hub] [--port 4870]
      Cria instances/<slug>/base a partir do template canônico (e instala o Hub com --with-hub).

Base
  base init <pasta> --name "Empresa" [--slug s] [--profile p] [--template <pasta>] [--no-git]
  base validate <pasta> [--template] [--json]
  base upgrade <pasta> [--apply] [--template <pasta>]     Atualiza arquivos do template sem perder customizações.

Hub
  hub install <instância> [--base <pasta>] [--mode local|remote] [--port N] [--host H]
  hub sync <instância> [--apply]                          Relê a Base; --apply aprova papéis sugeridos.
  hub start <instância> [--port N] [--host H] [--open]    --open: navegador (na ativação, se o proprietário não tem conta).
  hub owner <instância> [--recover]                       Link de ativação do proprietário.
  hub invite <instância> --name "Nome" --role member      Convida usuário (link de ativação).
  hub pair-code <instância> [--name "Computador"]         Código para parear o Local Agent.

Local Agent
  agent pair <instância> --hub <url> --code <código> [--name "Computador"]
  agent run <instância> [--once] [--hub <url>]

Operação
  doctor [<instância>] [--templates] [--denylist <arquivo>] [--json]
  update <instância> [--apply] [--base-template] [--template <pasta>]
  secrets list <instância> | secrets set <instância> NOME (valor pela entrada padrão) | secrets remove <instância> NOME
  sync-contract                                            Copia o contrato do Core para o template da Base.

Aliases: iniciar, diagnosticar, atualizar, segredos; base criar|validar|atualizar; hub instalar|sincronizar|iniciar|proprietario|convidar|parear; agent parear|rodar.
`;

const ALIASES: Record<string, string> = { iniciar: 'init', diagnosticar: 'doctor', atualizar: 'update', segredos: 'secrets', ajuda: 'help', versao: 'version' };
const SUB_ALIASES: Record<string, Record<string, string>> = {
  base: { criar: 'init', validar: 'validate', atualizar: 'upgrade' },
  hub: { instalar: 'install', sincronizar: 'sync', iniciar: 'start', proprietario: 'owner', convidar: 'invite', parear: 'pair-code' },
  agent: { parear: 'pair', rodar: 'run' },
  secrets: { listar: 'list', gravar: 'set', remover: 'remove' },
};

function requireArg(value: string | undefined, message: string): string {
  if (!value) throw new CliError(message);
  return value;
}

/** Abre o endereço local no navegador padrão (somente http(s) do próprio Hub). */
function openBrowser(url: string): void {
  if (!/^https?:\/\/[^\s"'&|<>^]+$/.test(url)) return;
  const [command, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(command, args as string[], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch { /* sem navegador disponível */ }
}

function activationLink(url: string, token: string): string {
  // O token vai no fragmento (#): não aparece em logs de servidor nem em cabeçalhos Referer.
  return `${url}/#/ativar?token=${encodeURIComponent(token)}`;
}

function ownerAccessOnStart(instance: LoadedInstance, issue: boolean) {
  const db = openHubDatabase(instance.dbPath);
  try {
    const access = ownerFirstAccess(db, { issue });
    if (access.token) audit(db, { type: 'system', id: null }, 'owner.activation-link', access.userId);
    return access;
  } finally { db.close(); }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new CliError('Envie o valor pela entrada padrão (ex.: Get-Content valor.txt | workfoli secrets set ...). O valor nunca é exibido.');
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

const GIT_STATUS: Record<InitBaseResult['git'], string> = {
  initialized: 'repositório criado com o primeiro commit',
  skipped: 'sem repositório (--no-git)',
  unavailable: 'Git não encontrado nesta máquina; crie o repositório depois',
  'no-commit': 'repositório criado, sem o primeiro commit',
};

function reportBaseGit(status: InitBaseResult['git']) {
  if (status === 'no-commit') out.warn('Primeiro commit não feito: configure a identidade do Git nesta Base (git config user.name e git config user.email) e rode "git commit".');
}

async function commandInit(args: ParsedArgs) {
  const slug = requireArg(args.positional[1] ?? (flag(args, 'name') ? slugify(flag(args, 'name')) : undefined), 'Informe o identificador da empresa: workfoli init <slug> --name "Empresa".');
  const name = requireArg(flag(args, 'name'), 'Informe --name "Nome da empresa".');
  const root = path.resolve(flag(args, 'root') ?? defaultInstancesRoot());
  const instanceDir = path.join(root, slug);
  const base = initBase({ dir: path.join(instanceDir, 'base'), name, slug, profile: flag(args, 'profile') as Profile | undefined, template: flag(args, 'template'), git: !has(args, 'no-git') });
  out.ok(`Base criada: ${base.dir} (${base.files} arquivos do template; Git: ${GIT_STATUS[base.git]})`);
  reportBaseGit(base.git);
  if (has(args, 'with-hub')) await commandHubInstall({ ...args, positional: ['hub', 'install', instanceDir] });
  else out.info(`Para instalar o Hub depois: workfoli hub install "${instanceDir}"`);
}

async function commandBase(args: ParsedArgs) {
  const sub = SUB_ALIASES.base![args.positional[1] ?? ''] ?? args.positional[1];
  const dir = args.positional[2];
  if (sub === 'init') {
    const result = initBase({ dir: requireArg(dir, 'Informe a pasta da nova Base.'), name: requireArg(flag(args, 'name'), 'Informe --name.'), slug: flag(args, 'slug'), profile: flag(args, 'profile') as Profile | undefined, template: flag(args, 'template'), git: !has(args, 'no-git') });
    out.ok(`Base criada em ${result.dir} para ${result.manifest.company.name} (${result.files} arquivos; Git: ${GIT_STATUS[result.git]}).`);
    reportBaseGit(result.git);
  } else if (sub === 'validate') {
    const check = checkBase(requireArg(dir, 'Informe a pasta da Base.'), has(args, 'template') ? 'template' : 'active');
    if (has(args, 'json')) out.json(check);
    else {
      for (const issue of check.errors) out.error(`${issue.path}: ${issue.message}`);
      for (const issue of check.warnings) out.warn(`${issue.path}: ${issue.message}`);
      for (const issue of check.info) out.info(`${issue.path}: ${issue.message}`);
      if (check.ok) out.ok(`Base válida: ${check.manifest?.company.name} (${check.manifest?.status}).`);
    }
    if (!check.ok) throw new CliError('A Base tem erros.', 2);
  } else if (sub === 'upgrade') {
    const base = requireArg(dir, 'Informe a pasta da Base.');
    const plan = has(args, 'apply') ? applyBaseUpgrade(base, flag(args, 'template')) : planBaseUpgrade(base, flag(args, 'template'));
    out.title(`Template da Base ${plan.from} → ${plan.to}${plan.lockMissing ? ' (sem lock: arquivos existentes tratados como customizados)' : ''}`);
    const labels: Record<string, string> = { add: 'novo', update: 'atualizado', 'keep-custom': 'customizado (mantido)', conflict: 'conflito → .workfoli/upgrade/', 'removed-by-client': 'removido pela empresa (mantido assim)', obsolete: 'fora do template (mantido)' };
    for (const item of plan.items.filter(item => item.action !== 'unchanged')) out.line(`  ${labels[item.action]}: ${item.path}`);
    out.line(has(args, 'apply') ? 'Aplicado.' : 'Simulação. Use --apply para aplicar.');
  } else throw new CliError('Use: workfoli base init|validate|upgrade <pasta>.');
}

async function commandHubInstall(args: ParsedArgs) {
  const dir = requireArg(args.positional[2], 'Informe a pasta da instância.');
  const result = installHub({ instanceDir: dir, baseDir: flag(args, 'base'), mode: flag(args, 'mode') as HubMode | undefined, port: intFlag(args, 'port'), host: flag(args, 'host') });
  if (result.status === 'exists') { out.info(`Hub já instalado em ${result.dir}. Nada foi sobrescrito. Use \`workfoli hub sync\`.`); return; }
  out.ok(`Hub instalado para ${result.manifest.company.name} em ${result.dir}`);
  out.info(`Módulos ativos: ${result.modules.active.join(', ')}`);
  if (result.modules.planned.length) out.info(`Módulos planejados (ainda não disponíveis): ${result.modules.planned.join(', ')}`);
  if (result.rolesAdded.length) out.info(`Papéis sugeridos pela Base: ${result.rolesAdded.join(', ')}`);
  out.line(`\nIniciar: workfoli hub start "${result.dir}"`);
  if (result.activationToken) out.line(`Ativar o proprietário (uso único, 24h): ${activationLink(result.url, result.activationToken)}`);
}

async function commandHub(args: ParsedArgs) {
  const sub = SUB_ALIASES.hub![args.positional[1] ?? ''] ?? args.positional[1];
  if (sub === 'install') return commandHubInstall(args);
  const dir = requireArg(args.positional[2], 'Informe a pasta da instância.');
  if (sub === 'sync') {
    const report = syncHub(dir, { apply: has(args, 'apply') });
    out.ok(`Base lida: ${report.manifest.company.name}${report.baseHashChanged ? ' (alterada desde a última sincronização)' : ''}`);
    out.info(`Módulos ativos: ${report.modules.active.join(', ')}`);
    if (report.company) out.warn(`Nome da empresa: "${report.company.before}" → "${report.company.after}"`);
    for (const role of report.roles) out.warn(`Papel sugerido pela Base (${role.change === 'new' ? 'novo' : 'alterado'}): ${role.id} → ${role.permissions.join(', ') || 'sem permissões'}`);
    out.line(has(args, 'apply') ? `Aplicado: ${report.applied.join(', ') || 'nada pendente'}.` : (report.roles.length || report.company ? 'Revise e rode com --apply para aprovar.' : 'Nada pendente.'));
    return;
  }
  const instance = loadInstance(dir);
  if (sub === 'start') {
    const { startHubServer } = await import('../hub/server.js');
    const server = await startHubServer({ instanceDir: dir, port: intFlag(args, 'port'), host: flag(args, 'host') });
    out.ok(`Workfoli Hub de ${instance.file.company.name} em ${server.url}`);
    // No computador do Hub, o atalho (--open) leva direto à ativação enquanto o proprietário não tem conta.
    const access = ownerAccessOnStart(instance, has(args, 'open') && instance.hubConfig.mode === 'local');
    if (access.token) out.info('Proprietário ainda sem conta: a página de ativação foi aberta no navegador (uso único, 24h; links anteriores deixam de valer).');
    else if (access.pending) out.warn(`Proprietário ainda sem conta: abra o link de ativação recebido ou gere outro com: workfoli hub owner "${dir}"`);
    out.info('Ctrl+C para encerrar.');
    if (has(args, 'open')) openBrowser(access.token ? activationLink(server.url, access.token) : server.url);
    await new Promise<void>(resolve => {
      const stop = () => { void server.close().then(resolve); };
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
    });
    return;
  }
  const db = openHubDatabase(instance.dbPath);
  try {
    const url = hubUrl(instance.hubConfig);
    if (sub === 'owner') {
      const result = has(args, 'recover') ? { ...recoverOwner(db), status: 'recovery' } : ensureOwner(db, { reissue: true });
      if (!result.token) { out.info('O proprietário já está ativo. Para redefinir a senha localmente use --recover.'); return; }
      audit(db, { type: 'system', id: null }, has(args, 'recover') ? 'owner.recovery-link' : 'owner.activation-link', result.userId);
      out.line(`Link de ${has(args, 'recover') ? 'recuperação (2h)' : 'ativação (24h)'}, uso único: ${activationLink(url, result.token)}`);
    } else if (sub === 'invite') {
      const { user, token } = inviteUser(db, { id: null, roleId: 'owner' }, { name: flag(args, 'name'), roleId: flag(args, 'role') ?? 'member' });
      audit(db, { type: 'system', id: null }, 'user.invited', user.id, { role: user.roleId });
      out.ok(`Convite criado para ${user.name} (${user.roleName}).`);
      out.line(`Link de ativação (72h, uso único): ${activationLink(url, token)}`);
    } else if (sub === 'pair-code') {
      const token = issueToken(db, 'pairing', { hours: 1, meta: { name: flag(args, 'name') ?? 'Computador da Base' } });
      audit(db, { type: 'system', id: null }, 'agent.pairing-code', null);
      out.line(`Código de pareamento (1h, uso único): ${token}`);
      out.line(`No computador da Base: workfoli agent pair "<instância>" --hub ${url} --code <código>`);
    } else throw new CliError('Use: workfoli hub install|sync|start|owner|invite|pair-code <instância>.');
  } finally { db.close(); }
}

async function commandAgent(args: ParsedArgs) {
  const sub = SUB_ALIASES.agent![args.positional[1] ?? ''] ?? args.positional[1];
  const dir = requireArg(args.positional[2], 'Informe a pasta da instância (onde está a Base).');
  const agent = await import('../agent/agent.js');
  if (sub === 'pair') {
    const device = await agent.pairAgent({ instanceDir: dir, hubUrl: requireArg(flag(args, 'hub'), 'Informe --hub <url>.'), code: requireArg(flag(args, 'code'), 'Informe --code.'), name: flag(args, 'name') });
    out.ok(`Local Agent pareado (${device.name}). Credencial guardada na pasta secrets da instância.`);
  } else if (sub === 'run') {
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort());
    await agent.runAgent({ instanceDir: dir, hubUrl: flag(args, 'hub'), once: has(args, 'once'), signal: controller.signal, log: message => out.info(message) });
  } else throw new CliError('Use: workfoli agent pair|run <instância>.');
}

async function commandDoctor(args: ParsedArgs) {
  const target = args.positional[1];
  const reports = [];
  if (has(args, 'templates') || !target) reports.push({ title: 'Templates canônicos', ...doctorTemplates({ denylist: flag(args, 'denylist') }) });
  if (target) reports.push({ title: `Instância ${target}`, ...doctorInstance(target) });
  if (has(args, 'json')) out.json(reports);
  else for (const report of reports) { out.title(report.title); printFindings(report.findings); }
  if (reports.some(report => !report.ok)) throw new CliError('Diagnóstico encontrou erros.', 2);
}

async function commandUpdate(args: ParsedArgs) {
  const dir = requireArg(args.positional[1], 'Informe a pasta da instância.');
  const options = { baseTemplate: has(args, 'base-template'), template: flag(args, 'template') };
  const plan = has(args, 'apply') ? applyUpdate(dir, options) : planUpdate(dir, options);
  out.title(has(args, 'apply') ? 'Atualização aplicada' : 'Plano de atualização (simulação)');
  out.line(`  Core: ${plan.core.from} → ${plan.core.to}${plan.core.changed ? '' : ' (igual)'}`);
  out.line(`  Banco: v${plan.database.current} → v${plan.database.target}${plan.database.pending.length ? ` (migrações ${plan.database.pending.join(', ')}, com cópia prévia)` : ' (atual)'}`);
  out.line(`  Manifesto da Base: v${plan.manifest.from} → v${plan.manifest.to}${plan.manifest.needsUpgrade ? ' (original guardado em data/backups)' : ' (atual)'}`);
  out.line(`  Validador da Base: ${plan.contract.outdated.length ? `desatualizado (${plan.contract.outdated.join(', ')}) → ${has(args, 'apply') ? 'atualizado, cópia anterior em data/backups' : 'será atualizado'}` : 'igual ao do Core'}`);
  const roleChanges = [...plan.roles.missing.map(id => `${id} (novo)`), ...plan.roles.outdated.map(id => `${id} (permissões desta versão)`), ...plan.roles.reserved.map(id => `${id} (id reservado: papel antigo preservado como ${id}-anterior)`)];
  out.line(`  Papéis do Core: ${roleChanges.length ? `${roleChanges.join(', ')} → ${has(args, 'apply') ? 'atualizados' : 'serão atualizados'}` : 'atuais'}`);
  if (plan.templateAvailable) out.line(`  Template da Base ${plan.templateAvailable.from} → ${plan.templateAvailable.to} disponível. Para aplicar sem perder customizações: workfoli update <instância> --apply --base-template`);
  if (plan.baseTemplate) out.line(`  Template da Base: ${plan.baseTemplate.from} → ${plan.baseTemplate.to} ${JSON.stringify(plan.baseTemplate.counts)}${plan.baseTemplate.conflicts.length ? ` — conflitos: ${plan.baseTemplate.conflicts.join(', ')}` : ''}`);
  if (!has(args, 'apply')) out.line('Use --apply para aplicar. Configuração e módulos customizados do Hub nunca são sobrescritos.');
}

async function commandSecrets(args: ParsedArgs) {
  const sub = SUB_ALIASES.secrets![args.positional[1] ?? ''] ?? args.positional[1];
  const instance = loadInstance(requireArg(args.positional[2], 'Informe a pasta da instância.'));
  const store = fileSecretStore(instance.paths.secrets, `instância ${instance.file.company.name}`);
  if (sub === 'list') {
    const names = store.names();
    out.line(names.length ? names.map(name => `  ${name} (configurado)`).join('\n') : '  Nenhum segredo configurado.');
  } else if (sub === 'set') {
    const name = requireArg(args.positional[3], 'Informe o NOME do segredo.');
    store.set(name, await readStdin());
    out.ok(`Segredo ${name} gravado para ${instance.file.company.name}. O valor não é exibido.`);
  } else if (sub === 'remove') {
    const name = requireArg(args.positional[3], 'Informe o NOME do segredo.');
    out.line(store.remove(name) ? `Segredo ${name} removido.` : `Segredo ${name} não existia.`);
  } else throw new CliError('Use: workfoli secrets list|set|remove <instância> [NOME].');
}

export async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  const command = ALIASES[args.positional[0] ?? ''] ?? args.positional[0];
  try {
    if (!command || command === 'help' || has(args, 'help')) { out.line(HELP); return 0; }
    if (command === 'version') { out.line(coreVersion()); return 0; }
    if (command === 'init') await commandInit(args);
    else if (command === 'base') await commandBase(args);
    else if (command === 'hub') await commandHub(args);
    else if (command === 'agent') await commandAgent(args);
    else if (command === 'doctor') await commandDoctor(args);
    else if (command === 'update') await commandUpdate(args);
    else if (command === 'secrets') await commandSecrets(args);
    else if (command === 'sync-contract') { for (const file of syncContract()) out.ok(`sincronizado: ${file}`); }
    else throw new CliError(`Comando desconhecido: ${command}. Rode "workfoli help".`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    out.error(message);
    return error instanceof CliError ? error.code : 1;
  }
}
