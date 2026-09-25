import { app, BrowserWindow, dialog, ipcMain, protocol, session } from 'electron';
import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkspaceStore, validId } from '../../../packages/adapters/storage.js';
import { resolveContext } from '../../../packages/application/context.js';
import { exportWorkspacePackage } from '../../../packages/adapters/transfer.js';
import { createInstanceBackup, restoreInstanceBackup } from '../../../packages/adapters/backup.js';
import type { ContextRequest, EnvironmentInput, ImportReport, KnowledgeItem, Progress, ReviewInput, WorkspaceRelationship } from '../../../packages/contracts/index.js';

app.setName('Workfoli');
protocol.registerSchemesAsPrivileged([{ scheme: 'workfoli', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const here = path.dirname(fileURLToPath(import.meta.url));
const devUrl = !app.isPackaged && process.env.WORKFOLI_DEV_URL === 'http://127.0.0.1:5173' ? process.env.WORKFOLI_DEV_URL : undefined;
let window: BrowserWindow;
let store: WorkspaceStore;
let activeWorkspace: string | undefined;
const selections = new Map<string, { path: string; type: 'zip' | 'folder'; expires: number }>();
const jobs = new Map<string, { worker?: Worker; error?: string; state: 'running' | 'review' | 'cancelled' | 'error' | 'committed' }>();
const progress = (value: Progress) => { if (window && !window.isDestroyed()) window.webContents.send('workfoli:progress', value); };
const requireActive = (id: unknown) => { validId(id); store.requireEnvironment(); if (id !== activeWorkspace) throw new Error('Selecione este workspace antes de consultar seu conteúdo.'); return id; };
const exportsInProgress = new Set<string>();
let maintenance = false;
const mutating = new Set(['environment-save', 'relationship', 'start', 'confirm', 'knowledge', 'reanalyze-apply', 'export', 'backup-create', 'backup-restore']);
const locationFile = () => path.join(app.getPath('userData'), 'active-instance.json');
function dataRoot() {
  if (process.env.WORKFOLI_DATA_DIR) return process.env.WORKFOLI_DATA_DIR;
  if (fs.existsSync(locationFile())) {
    const value = JSON.parse(fs.readFileSync(locationFile(), 'utf8')) as { directory?: unknown };
    if (typeof value.directory !== 'string' || !path.isAbsolute(value.directory) || !fs.existsSync(path.join(value.directory, 'restored.json'))) throw new Error('O ambiente restaurado não está disponível. Reconecte a unidade onde ele foi salvo.');
    return value.directory;
  }
  return path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'Workfoli', 'data');
}

function registerIPC() {
  const handle = (name: string, callback: (...args: any[]) => unknown) => {
    ipcMain.handle(`workfoli:${name}`, async (event, ...args: unknown[]) => {
      const sender = event.senderFrame;
      const expected = devUrl ? `${devUrl}/` : 'workfoli://app/';
      if (event.sender !== window.webContents || sender !== window.webContents.mainFrame || !sender?.url.startsWith(expected)) throw new Error('Origem da operação inválida.');
      if (maintenance && mutating.has(name)) throw new Error('Aguarde o backup ou a recuperação terminar.');
      return callback(...args);
    });
  };
  handle('info', () => ({ version: app.getVersion(), dataDirectory: store.root }));
  handle('environment', () => store.getEnvironment());
  handle('environment-save', (input: EnvironmentInput) => store.saveEnvironment(input));
  handle('relationship', (id: string, relationship: WorkspaceRelationship) => store.setWorkspaceRelationship(requireActive(id), relationship));
  handle('context', (request: ContextRequest) => {
    if (request?.scope === 'workspace') requireActive(request.workspaceId);
    return resolveContext(store, request);
  });
  handle('list', () => store.list());
  handle('get', (id: string) => { store.requireEnvironment(); const data = store.get(id); activeWorkspace = id; return data; });
  handle('backup-create', async (password: string) => {
    if ([...jobs.values()].some(job => ['running', 'review'].includes(job.state)) || exportsInProgress.size) throw new Error('Conclua a importação ou exportação antes do backup.');
    maintenance = true; let temporary: string | undefined;
    try {
      const selected = await dialog.showSaveDialog(window, { title: 'Salvar backup completo protegido por senha', defaultPath: `Workfoli-${new Date().toISOString().slice(0, 10)}.workfoli-backup`, filters: [{ name: 'Backup cifrado Workfoli', extensions: ['workfoli-backup'] }] });
      if (selected.canceled || !selected.filePath) return null;
      const destination = path.resolve(selected.filePath), relative = path.relative(store.root, destination);
      if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('Salve o backup fora da pasta interna do aplicativo.');
      const parent = path.dirname(destination);
      if (fs.realpathSync(parent).toLowerCase() !== parent.toLowerCase() || fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) throw new Error('Destino de backup inválido.');
      temporary = path.join(parent, `.workfoli-backup-${randomUUID()}.tmp`);
      const result = await createInstanceBackup(store, temporary, password);
      fs.renameSync(temporary, destination); temporary = undefined;
      return { name: path.basename(destination), ...result };
    } finally { if (temporary && fs.existsSync(temporary)) fs.unlinkSync(temporary); maintenance = false; }
  });
  handle('backup-restore', async (password: string) => {
    if ([...jobs.values()].some(job => ['running', 'review'].includes(job.state)) || exportsInProgress.size) throw new Error('Conclua a importação ou exportação antes da recuperação.');
    maintenance = true;
    try {
      const backup = await dialog.showOpenDialog(window, { title: 'Escolher backup completo do Workfoli', properties: ['openFile'], filters: [{ name: 'Backup cifrado Workfoli', extensions: ['workfoli-backup'] }] });
      if (backup.canceled || !backup.filePaths[0]) return null;
      const target = await dialog.showOpenDialog(window, { title: 'Escolher pasta vazia para o ambiente recuperado', properties: ['openDirectory', 'createDirectory'] });
      if (target.canceled || !target.filePaths[0]) return null;
      const destination = path.resolve(target.filePaths[0]), relative = path.relative(store.root, destination);
      if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('Escolha uma pasta fora do ambiente atual.');
      const result = await restoreInstanceBackup(backup.filePaths[0], destination, password);
      const restored = new WorkspaceStore(result.directory);
      const preference = `${locationFile()}.${randomUUID()}.tmp`;
      try { fs.writeFileSync(preference, JSON.stringify({ directory: result.directory }), { flag: 'wx' }); fs.renameSync(preference, locationFile()); }
      catch (error) { restored.close(); if (fs.existsSync(preference)) fs.unlinkSync(preference); throw error; }
      store.close(); store = restored; activeWorkspace = undefined; jobs.clear(); selections.clear();
      return result;
    } finally { maintenance = false; }
  });
  handle('export', async (id: string) => {
    requireActive(id);
    if (exportsInProgress.size) throw new Error('Aguarde a exportação atual terminar.');
    exportsInProgress.add(id);
    let temporary: string | undefined;
    try {
      const data = store.get(id);
      const fileName = data.workspace.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '').slice(0, 80) || 'empresa';
      const selected = await dialog.showSaveDialog(window, { title: 'Exportar entrega da empresa', defaultPath: `${fileName}.workfoli.zip`, filters: [{ name: 'Pacote Workfoli', extensions: ['zip'] }] });
      if (selected.canceled || !selected.filePath) return null;
      const destination = path.resolve(selected.filePath);
      const relative = path.relative(store.root, destination);
      if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('Salve a entrega fora da pasta interna de dados do Workfoli.');
      const parent = path.dirname(destination);
      if (fs.realpathSync(parent).toLowerCase() !== parent.toLowerCase()) throw new Error('A pasta de destino não pode ser um link ou redirecionamento.');
      if (fs.existsSync(destination) && (!fs.lstatSync(destination).isFile() || fs.lstatSync(destination).isSymbolicLink())) throw new Error('Destino de exportação inválido.');
      temporary = path.join(parent, `.workfoli-export-${randomUUID()}.tmp`);
      const result = await exportWorkspacePackage(data, store.workspacePath(id), temporary);
      fs.renameSync(temporary, destination); temporary = undefined;
      return { name: path.basename(destination), ...result };
    } finally {
      if (temporary && fs.existsSync(temporary)) fs.unlinkSync(temporary);
      exportsInProgress.delete(id);
    }
  });
  handle('select', async (kind: string) => {
    store.requireEnvironment();
    if (kind !== 'zip' && kind !== 'folder') throw new Error('Tipo de origem inválido.');
    const result = await dialog.showOpenDialog(window, kind === 'zip'
      ? { title: 'Importar empresa de um ZIP', properties: ['openFile'], filters: [{ name: 'Arquivo ZIP', extensions: ['zip'] }] }
      : { title: 'Importar pasta da empresa', properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    const source = path.resolve(result.filePaths[0]);
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink() || (kind === 'folder' ? !stat.isDirectory() : !stat.isFile())) throw new Error('Selecione uma origem regular, sem links.');
    const relative = path.relative(source, store.root);
    if (source === store.root || (relative && !relative.startsWith('..') && !path.isAbsolute(relative))) throw new Error('A origem não pode conter a pasta de dados do Workfoli.');
    const insideData = path.relative(store.root, source);
    if (!insideData.startsWith('..') && !path.isAbsolute(insideData)) throw new Error('Selecione uma origem fora dos dados internos do aplicativo.');
    for (const [token, selection] of selections) if (selection.expires < Date.now()) selections.delete(token);
    const token = randomUUID();
    selections.set(token, { path: source, type: kind, expires: Date.now() + 600_000 });
    return { token, name: path.basename(source) };
  });
  handle('start', (token: string) => {
    validId(token);
    if ([...jobs.values()].some(job => job.state === 'running' || job.state === 'review')) throw new Error('Conclua ou cancele a importação atual antes de iniciar outra.');
    const selection = selections.get(token);
    if (!selection || selection.expires < Date.now()) throw new Error('Selecione a origem novamente.');
    selections.delete(token);
    const runId = randomUUID();
    const stagingDir = store.createStage(runId);
    const worker = new Worker(new URL('./import-worker.js', import.meta.url), { workerData: { runId, sourcePath: selection.path, sourceType: selection.type, stagingDir }, resourceLimits: { maxOldGenerationSizeMb: 384 } });
    const job: { worker?: Worker; error?: string; state: 'running' | 'review' | 'cancelled' | 'error' | 'committed' } = { worker, state: 'running' };
    jobs.set(runId, job);
    const fail = (message: string) => {
      if (job.state !== 'running') return;
      job.error = message; job.state = 'error';
      progress({ runId, phase: 'error', message, processed: 0 });
    };
    worker.on('message', (message: { type: string; progress?: Progress; message?: string; result?: { report: ImportReport; texts: Record<string,string> } }) => {
      if (job.state !== 'running') return;
      if (message.type === 'progress' && message.progress) progress(message.progress);
      else if (message.type === 'error') fail(message.message ?? 'A importação não pôde ser concluída.');
      else if (message.type === 'result' && message.result) {
        try {
          store.prepare(message.result.report, message.result.texts);
          job.state = 'review';
          progress({ runId, phase: 'review', message: 'Análise concluída. Revise antes de criar o workspace.', processed: message.result.report.summary.files });
        } catch { fail('Não foi possível salvar a análise. Verifique o espaço livre e tente novamente.'); }
      }
    });
    worker.on('error', () => fail('O processo de análise foi interrompido. A origem permanece intacta.'));
    worker.on('exit', () => {
      job.worker = undefined;
      if (job.state === 'running') fail('A análise terminou antes de concluir. Tente novamente.');
      if (job.state === 'error' || job.state === 'cancelled') store.discardStage(runId);
    });
    return { runId };
  });
  handle('import', (id: string) => {
    validId(id);
    const job = jobs.get(id);
    if (!job) throw new Error('Importação não encontrada.');
    if (job.state === 'error') throw new Error(job.error);
    if (job.state === 'cancelled') throw new Error('Importação cancelada.');
    return job.state === 'review' ? store.draft(id) : null;
  });
  handle('cancel', async (id: string) => {
    validId(id); const job = jobs.get(id);
    if (!job || job.state === 'committed') return;
    job.state = 'cancelled';
    if (job.worker) { job.worker.postMessage('cancel'); await job.worker.terminate(); }
    store.discardStage(id);
    progress({ runId: id, phase: 'cancelled', message: 'Importação cancelada. A origem permanece intacta.', processed: 0 });
  });
  handle('confirm', (id: string, review: ReviewInput) => {
    validId(id); const job = jobs.get(id);
    if (!job || !['review','committed'].includes(job.state)) throw new Error('Aguarde a análise antes de confirmar.');
    const result = store.confirm(id, review);
    job.state = 'committed'; activeWorkspace = result.workspace.id;
    return result;
  });
  handle('preview', (id: string, fileId: string) => store.preview(requireActive(id), fileId));
  handle('preview-import', (id: string, fileId: string) => {
    validId(id);
    if (jobs.get(id)?.state !== 'review') throw new Error('A prévia fica disponível quando a análise estiver pronta para revisão.');
    return store.previewImport(id, fileId);
  });
  handle('search', (id: string, query: string) => store.search(requireActive(id), query));
  handle('knowledge', (workspaceId: string, id: string, status: KnowledgeItem['status'], value?: string) => store.updateKnowledge(requireActive(workspaceId), id, status, value));
  handle('reanalyze-preview', (id: string) => store.previewReanalysis(requireActive(id)));
  handle('reanalyze-apply', (id: string, token: string) => store.applyReanalysis(requireActive(id), token));
}

app.whenReady().then(async () => {
  store = new WorkspaceStore(dataRoot());
  const root = path.join(app.getAppPath(), 'dist');
  protocol.handle('workfoli', async request => {
    const url = new URL(request.url);
    if (url.host !== 'app' || request.method !== 'GET') return new Response('Not found', { status: 404 });
    let relative: string;
    try { relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'; } catch { return new Response('Invalid path', { status: 400 }); }
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root + path.sep) || relative.includes('\\') || !/\.(html|js|css|svg|woff2|png|ico)$/.test(filename)) return new Response('Not found', { status: 404 });
    const mime: Record<string,string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' };
    try { return new Response(new Uint8Array(await fs.promises.readFile(filename)), { headers: { 'Content-Type': mime[path.extname(filename)]!, 'X-Content-Type-Options': 'nosniff' } }); }
    catch { return new Response('Not found', { status: 404 }); }
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = details.url.startsWith('workfoli://app/') || details.url.startsWith('data:') || details.url.startsWith('devtools:') || Boolean(devUrl && (details.url.startsWith(`${devUrl}/`) || details.url.startsWith('ws://127.0.0.1:5173/')));
    callback({ cancel: !allowed });
  });
  window = new BrowserWindow({ width: 1420, height: 940, minWidth: 900, minHeight: 680, title: 'Workfoli', icon: path.join(app.getAppPath(),'resources/icon.png'), backgroundColor: '#F5F5F1', autoHideMenuBar: true,
    webPreferences: { preload: path.join(here, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('close', event => { if (maintenance || exportsInProgress.size) event.preventDefault(); });
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  registerIPC();
  await window.loadURL(devUrl ?? 'workfoli://app/index.html');
}).catch(error => { dialog.showErrorBox('Não foi possível abrir o Workfoli', error instanceof Error ? error.message : 'Erro de inicialização.'); app.quit(); });

app.on('window-all-closed', () => app.quit());
let quitting = false;
app.on('before-quit', event => {
  if (maintenance) { event.preventDefault(); return; }
  if (quitting) return;
  quitting = true; event.preventDefault();
  Promise.all([...jobs.values()].filter(job => job.worker).map(job => job.worker!.terminate())).finally(() => { store?.close(); app.quit(); });
});
