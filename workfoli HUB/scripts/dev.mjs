import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
await new Promise((resolve, reject) => {
  const compiler = spawn(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], { stdio: 'inherit' });
  compiler.on('exit', code => code === 0 ? resolve() : reject(new Error('Corrija os erros de TypeScript.')));
});
const server = await createServer();
await server.listen();
const env = { ...process.env, WORKFOLI_DEV_URL: 'http://127.0.0.1:5173' };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), ['.'], { stdio: 'inherit', env, windowsHide: true });
child.on('exit', async code => { await server.close(); process.exit(code ?? 0); });
process.on('SIGINT', () => child.kill());
