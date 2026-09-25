import { parentPort, workerData } from 'node:worker_threads';
import { analyzeSource } from '../../../packages/adapters/import-source.js';
const abort = new AbortController();
parentPort?.on('message', message => { if (message === 'cancel') abort.abort(); });
try {
  const result = await analyzeSource({ ...workerData, signal: abort.signal, onProgress: progress => parentPort?.postMessage({ type: 'progress', progress }) });
  parentPort?.postMessage({ type: 'result', result });
} catch (error) {
  parentPort?.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Não foi possível analisar a origem.' });
} finally { parentPort?.close(); }
