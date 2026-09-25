import { contextBridge, ipcRenderer } from 'electron';
import type { WorkfoliApi, Progress } from '../../../packages/contracts/index.js';
const api: WorkfoliApi = {
  getEnvironment: () => ipcRenderer.invoke('workfoli:environment'),
  saveEnvironment: input => ipcRenderer.invoke('workfoli:environment-save', input),
  setWorkspaceRelationship: (id, relationship) => ipcRenderer.invoke('workfoli:relationship', id, relationship),
  getContext: request => ipcRenderer.invoke('workfoli:context', request),
  exportWorkspace: id => ipcRenderer.invoke('workfoli:export', id),
  createBackup: password => ipcRenderer.invoke('workfoli:backup-create', password),
  restoreBackup: password => ipcRenderer.invoke('workfoli:backup-restore', password),
  listWorkspaces: () => ipcRenderer.invoke('workfoli:list'),
  getWorkspace: id => ipcRenderer.invoke('workfoli:get', id),
  selectSource: kind => ipcRenderer.invoke('workfoli:select', kind),
  startImport: token => ipcRenderer.invoke('workfoli:start', token),
  getImport: id => ipcRenderer.invoke('workfoli:import', id),
  cancelImport: id => ipcRenderer.invoke('workfoli:cancel', id),
  confirmImport: (id, review) => ipcRenderer.invoke('workfoli:confirm', id, review),
  previewFile: (workspaceId, fileId) => ipcRenderer.invoke('workfoli:preview', workspaceId, fileId),
  previewImport: (runId, fileId) => ipcRenderer.invoke('workfoli:preview-import', runId, fileId),
  searchFiles: (workspaceId, query) => ipcRenderer.invoke('workfoli:search', workspaceId, query),
  updateKnowledge: (workspaceId, id, status, value) => ipcRenderer.invoke('workfoli:knowledge', workspaceId, id, status, value),
  previewReanalysis: workspaceId => ipcRenderer.invoke('workfoli:reanalyze-preview', workspaceId),
  applyReanalysis: (workspaceId, token) => ipcRenderer.invoke('workfoli:reanalyze-apply', workspaceId, token),
  onProgress: callback => {
    const listener = (_event: Electron.IpcRendererEvent, progress: Progress) => callback(progress);
    ipcRenderer.on('workfoli:progress', listener);
    return () => { ipcRenderer.removeListener('workfoli:progress', listener); };
  },
  appInfo: () => ipcRenderer.invoke('workfoli:info'),
};
contextBridge.exposeInMainWorld('workfoli', Object.freeze(api));
