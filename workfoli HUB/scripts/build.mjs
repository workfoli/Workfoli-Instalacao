import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=path.join(root,'dist-electron');
if(path.dirname(output)!==root||path.basename(output)!=='dist-electron')throw new Error('Diretório de build inválido.');
if(await fs.lstat(output).then(stat=>stat.isSymbolicLink(),()=>false))throw new Error('Diretório de build não pode ser um link.');
await fs.rm(output,{recursive:true,force:true});
async function run(script,args){await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,script),...args],{cwd:root,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Build falhou (${code}).`)));});}
await run('node_modules/typescript/bin/tsc',['-p','tsconfig.json']);
// O contrato é JavaScript puro (compartilhado com a Base); o tsc não o emite.
const contract=path.join(output,'packages','contract');
await fs.mkdir(contract,{recursive:true});
await fs.copyFile(path.join(root,'packages','contract','workfoli-contract.mjs'),path.join(contract,'workfoli-contract.mjs'));
await run('node_modules/vite/bin/vite.js',['build']);
