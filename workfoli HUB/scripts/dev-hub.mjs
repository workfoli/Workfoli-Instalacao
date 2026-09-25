// Desenvolvimento da interface do Hub com recarga imediata.
// Uso: npm run dev:hub -- "<pasta da instância>"
// Sobe o servidor do Hub da instância (API) e o Vite com proxy para /api.
import { register } from 'tsx/esm/api';
import { createServer } from 'vite';

register();
const instanceDir = process.argv[2];
if (!instanceDir) {
  console.error('Informe a pasta da instância: npm run dev:hub -- "<instância>"');
  process.exit(1);
}
const { startHubServer } = await import('../packages/hub/server.ts');
const hub = await startHubServer({ instanceDir, devOrigins: ['http://127.0.0.1:5174'] });
process.env.WORKFOLI_HUB_URL = hub.url;
const vite = await createServer({ configFile: 'vite.hub.config.ts' });
await vite.listen();
console.log(`API do Hub: ${hub.url}`);
console.log('Interface em desenvolvimento: http://127.0.0.1:5174');
const stop = async () => { await vite.close(); await hub.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
