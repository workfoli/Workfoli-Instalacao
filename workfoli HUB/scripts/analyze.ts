import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { analyzeSource } from '../packages/adapters/import-source.js';

const args=process.argv.slice(2);
if (!args[0] || args[0].startsWith('--')) {
  console.error('Uso: npm run analyze -- "C:\\caminho\\cliente.zip" [--output "C:\\pasta\\relatorios"]');
  process.exitCode=1;
} else {
  const sourcePath=path.resolve(args[0]);
  const outputIndex=args.indexOf('--output');
  const outputRoot=path.resolve(outputIndex>=0 && args[outputIndex+1] ? args[outputIndex+1]! : path.join(process.env.LOCALAPPDATA || os.tmpdir(),'Workfoli','analyses'));
  const runId=randomUUID(),stagingDir=path.join(outputRoot,runId);
  const controller=new AbortController(); process.on('SIGINT',()=>controller.abort());
  try {
    const stat=await fs.lstat(sourcePath); await fs.mkdir(stagingDir,{recursive:true});
    const start=Date.now(); let previous='';
    const {report}=await analyzeSource({runId,sourcePath,sourceType:stat.isDirectory()?'folder':'zip',stagingDir,signal:controller.signal,onProgress:p=>{if(p.phase!==previous){previous=p.phase;console.error(p.message);}}});
    console.log(JSON.stringify({runId,summary:report.summary,legacy:report.legacy.detected,versions:report.legacy.versions,projects:report.projects.map(p=>({name:p.name,type:p.type,root:p.root})),knowledge:report.knowledge.length,knowledgeFields:report.knowledge.map(k=>k.field),warnings:report.warnings.map(w=>w.code),sourceHash:report.sourceHash,seconds:Math.round((Date.now()-start)/100)/10,report:path.join(stagingDir,'manifest.json')},null,2));
  } catch(error) {
    console.error(error instanceof Error?error.message:'Falha na análise.');
    console.error('A origem permanece intacta. A pasta desta análise pode conter uma captura parcial:',stagingDir);
    process.exitCode=1;
  }
}
