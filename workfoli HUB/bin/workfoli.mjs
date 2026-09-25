#!/usr/bin/env node
// Lançador da CLI do Workfoli. Executa o TypeScript do Core diretamente (tsx), sem etapa de build.
import { register } from 'tsx/esm/api';

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  console.error(`O Workfoli precisa do Node.js 22 ou mais novo (atual: ${process.versions.node}).`);
  process.exit(1);
}
register();
const { main } = await import('../packages/cli/main.ts');
process.exitCode = await main(process.argv.slice(2));
