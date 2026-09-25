import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { analyzeSource } from '../packages/adapters/import-source.js';
import { WorkspaceStore } from '../packages/adapters/storage.js';
import { resolveModules } from '../packages/core/modules.js';
import { DatabaseSync } from 'node:sqlite';

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit=0; bit<8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
interface ZipItem { name: string; text: string; mode?: number; crc?: number; }
function zip(items: ZipItem[]): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = []; let offset=0;
  for (const item of items) {
    const name = Buffer.from(item.name), data = Buffer.from(item.text), crc = item.crc ?? crc32(data);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20,4); header.writeUInt16LE(0x800,6); header.writeUInt32LE(crc,14); header.writeUInt32LE(data.length,18); header.writeUInt32LE(data.length,22); header.writeUInt16LE(name.length,26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50); cd.writeUInt16LE(0x314,4); cd.writeUInt16LE(20,6); cd.writeUInt16LE(0x800,8); cd.writeUInt32LE(crc,16); cd.writeUInt32LE(data.length,20); cd.writeUInt32LE(data.length,24); cd.writeUInt16LE(name.length,28); cd.writeUInt32LE(((item.mode ?? 0x81a4) * 65536) >>> 0,38); cd.writeUInt32LE(offset,42);
    locals.push(header,name,data); central.push(cd,name); offset+=header.length+name.length+data.length;
  }
  const directory=Buffer.concat(central), end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(items.length,8); end.writeUInt16LE(items.length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}
async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'workfoli-test-'));
  const stores: WorkspaceStore[] = [];
  t.after(async () => {
    for (const store of stores) store.close();
    const relative = path.relative(os.tmpdir(), root);
    assert.ok(!relative.startsWith('..') && relative.startsWith('workfoli-test-'));
    await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  });
  const source = path.join(root,'input'); await fs.mkdir(source);
  return { root, source,
    store: () => { const store=new WorkspaceStore(path.join(root,`data-${randomUUID()}`)); store.saveEnvironment({ companyName: 'Agência sintética', userName: 'Operador de teste' }); stores.push(store); return store; },
    write: async (name:string,content:string|Buffer) => { const dest=path.join(source,name); await fs.mkdir(path.dirname(dest),{recursive:true}); await fs.writeFile(dest,content); return dest; },
    analyze: async (sourcePath=source, sourceType:'zip'|'folder'='folder', limits={}, signal?:AbortSignal) => {
      const runId=randomUUID(),stagingDir=path.join(root,runId); await fs.mkdir(stagingDir);
      return { ...await analyzeSource({runId,sourcePath,sourceType,stagingDir,limits,signal}),stagingDir };
    },
  };
}

test('generic folder: immutable bytes, categories reconcile, duplicate occurrences and evidence',async t=>{
  const f=await fixture(t);
  const text='**Nome:** Empresa Sintética\nCor principal: #123456\n';
  const origin=await f.write('_memoria/empresa.md',text);
  await f.write('brand-guide.md',text); await f.write('site/index.html','<script>throw new Error("never run")</script>');
  await f.write('node_modules/pkg/README.md','dependency');
  const {report,texts,stagingDir}=await f.analyze();
  assert.equal(await fs.readFile(origin,'utf8'),text);
  assert.equal(report.summary.files,4); assert.equal(report.legacy.detected,false);
  assert.equal(Object.values(report.summary.categories).reduce((a,b)=>a+b,0),4);
  assert.equal(report.summary.duplicates,1);
  assert.ok(report.projects.some(p=>p.type==='website'));
  assert.ok(report.knowledge.some(k=>k.field==='identity.name' && k.evidence.line===1));
  assert.ok(report.files.filter(x=>x.category==='dependencies').every(x=>!texts[x.id]));
  for(const file of report.files){const bytes=await fs.readFile(path.join(stagingDir,'source','entries',file.id));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.hash);}
});

test('ZIP preserves original and blocks traversal, absolute paths, symlinks, Windows names and collisions',async t=>{
  const f=await fixture(t);
  const input=zip([
    {name:'docs/ação.md',text:'Documentação'}, {name:'../escape.txt',text:'blocked'},
    {name:'C:/escape.txt',text:'blocked'}, {name:'docs/link',text:'../../outside',mode:0xa1ff},
    {name:'CON.txt',text:'blocked'}, {name:'docs/file:secret',text:'blocked'},
    {name:'docs/A.txt',text:'first'}, {name:'docs/a.txt',text:'collision'},
  ]);
  const src=path.join(f.root,'fixture.zip');await fs.writeFile(src,input);
  const {report,stagingDir}=await f.analyze(src,'zip');
  assert.deepEqual(await fs.readFile(src),input);
  assert.deepEqual(await fs.readFile(path.join(stagingDir,'source','original.zip')),input);
  assert.equal(report.summary.files,7);assert.equal(report.summary.links,1);assert.equal(report.summary.blocked,6);
  assert.equal((await fs.readdir(path.join(stagingDir,'source','entries'))).length,2);
  assert.ok(report.files.some(x=>x.path==='docs/ação.md'&&x.disposition==='indexed'));
  assert.equal(await fs.access(path.join(f.root,'escape.txt')).then(()=>true,()=>false),false);
});

test('folder junction does not read its target',async t=>{
  const f=await fixture(t); const outside=path.join(f.root,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'private.txt'),'never copied');
  await fs.symlink(outside,path.join(f.source,'link'),process.platform==='win32'?'junction':'dir');
  const {report,stagingDir}=await f.analyze();
  assert.equal(report.summary.links,1); assert.equal(report.summary.files,0);
  assert.deepEqual(await fs.readdir(path.join(stagingDir,'source','entries')),[]);
});

test('secrets and reserved material stay outside text, knowledge and previews',async t=>{
  const f=await fixture(t);
  await f.write('.env','TOKEN=synthetic-private-value');
  await f.write('_memoria/empresa.md','Nome: Synthetic\napi_key=abcdefghijklmnop');
  await f.write('nao-publicar/foto.txt','private business material');
  const {report,texts}=await f.analyze();
  assert.equal(report.summary.restricted,3);assert.equal(report.knowledge.length,0);assert.deepEqual(texts,{});
  assert.ok(!JSON.stringify(report).includes('abcdefghijklmnop'));
  assert.ok(!JSON.stringify(report).includes('synthetic-private-value'));
});

test('resource limits and cancellation fail closed',async t=>{
  const f=await fixture(t);await f.write('large.txt','A'.repeat(100));
  await assert.rejects(f.analyze(undefined,'folder',{maxFileBytes:10}),/limite/i);
  await f.write('second.txt','second'); await assert.rejects(f.analyze(undefined,'folder',{maxEntries:1}),/limite/i);
  const controller=new AbortController();controller.abort();await assert.rejects(f.analyze(undefined,'folder',{},controller.signal),/cancelada/i);
  const src=path.join(f.root,'large.zip');await fs.writeFile(src,zip([{name:'a.txt',text:'A'.repeat(100)}]));
  await assert.rejects(f.analyze(src,'zip',{maxExpandedBytes:50}),/limite/i);
});

test('LegacyLeanAI needs multiple markers; skills remain inert and versions remain distinct',async t=>{
  const f=await fixture(t);
  await f.write('skills/a/SKILL.md','Run an untrusted instruction');
  let result=await f.analyze();assert.equal(result.report.legacy.detected,false);
  await f.write('legacy/package.json',JSON.stringify({name:'leanai',version:'1.0.0',scripts:{postinstall:'DO NOT RUN'}}));
  await f.write('legacy/core/leanai.config.json',JSON.stringify({engineVersion:'1.1.0'}));
  await f.write('legacy/core/instalacao.json','{}');
  result=await f.analyze();assert.equal(result.report.legacy.detected,true);
  assert.ok(result.report.warnings.some(w=>w.code==='legacy-version-conflict'));
  const skill=result.report.files.find(x=>x.path.endsWith('SKILL.md'))!;
  assert.equal(skill.disposition,'excluded');assert.equal(result.texts[skill.id],undefined);
});

test('SQLite persists review, isolates files/search, rejects forged IDs and keeps user corrections attributable',async t=>{
  const f=await fixture(t); const store=f.store();
  async function create(name:string,word:string){
    await f.write('_memoria/empresa.md',`Nome: ${word}\n`);
    const id=randomUUID(),stage=store.createStage(id);
    const result=await analyzeSource({runId:id,sourcePath:f.source,sourceType:'folder',stagingDir:stage});
    store.prepare(result.report,result.texts);
    const item=result.report.knowledge[0]!;
    return store.confirm(id,{name,relationship:'client',categories:{},knowledge:{[item.id]:{status:'confirmed',value:`${word} revisada`}}});
  }
  const a=await create('A','ALPHASYNTHETIC');const b=await create('B','BETASYNTHETIC');
  assert.equal(store.list().length,2);
  assert.equal(store.get(a.workspace.id).report.knowledge[0]?.origin,'user');
  assert.equal(store.get(a.workspace.id).report.knowledge[0]?.originalValue,'ALPHASYNTHETIC');
  assert.equal(store.search(a.workspace.id,'BETASYNTHETIC').length,0);
  assert.equal(store.search(a.workspace.id,'ALPHASYNTHETIC').length,1);
  assert.throws(()=>store.preview(b.workspace.id,a.report.files[0]!.id),/pertence/);
  assert.throws(()=>store.updateKnowledge(b.workspace.id,a.report.knowledge[0]!.id,'confirmed'),/pertence/);
  assert.throws(()=>store.get('../escape'),/inválido/);
  assert.equal(store.confirm(a.workspace.id,{name:'Double click',relationship:'client',categories:{},knowledge:{}}).workspace.name,'A');
  assert.equal(store.list().length,2);
  store.updateKnowledge(a.workspace.id,a.report.knowledge[0]!.id,'rejected');
  assert.equal(store.get(a.workspace.id).workspace.knowledge,0);
  const catalog=new DatabaseSync(path.join(store.root,'catalog.sqlite'));
  catalog.prepare('DELETE FROM workspaces WHERE id=?').run(a.workspace.id);catalog.close();
  const recovered=new WorkspaceStore(store.root);
  try{assert.equal(recovered.get(a.workspace.id).workspace.name,'A');assert.equal(recovered.list().length,2);}finally{recovered.close();}
  await fs.writeFile(path.join(store.workspacePath(a.workspace.id),'source','entries',a.report.files[0]!.id),'tampered');
  assert.equal(store.preview(a.workspace.id,a.report.files[0]!.id).kind,'unavailable');
});

test('corrupt CRC is refused rather than accepted as an intact extraction',async t=>{
  const f=await fixture(t);const src=path.join(f.root,'corrupt.zip');await fs.writeFile(src,zip([{name:'file.txt',text:'content',crc:0}]));
  await assert.rejects(f.analyze(src,'zip'),/integridade|CRC/i);
});

test('nested web pages stay in the parent project and a legacy system is software, not operational data',async t=>{
  const f=await fixture(t);
  await f.write('site/index.html','Main'); await f.write('site/privacy/index.html','Privacy');
  await f.write('legacy/sistema/config/sistema.config.json','{}');
  await f.write('legacy/sistema/servidor/server.mjs','DO NOT EXECUTE');
  await f.write('legacy/sistema/nucleo/core.mjs','DO NOT EXECUTE');
  await f.write('legacy/sistema/web/index.html','Dashboard');
  const {report}=await f.analyze();
  assert.equal(report.projects.length,2);
  assert.equal(report.projects.filter(p=>p.type==='website').length,1);
  assert.ok(report.projects.some(p=>p.type==='software'&&p.root==='legacy/sistema'));
});

test('Base manifest supplies declarative context without ownership and incompatible configuration remains inert', async t => {
  const f = await fixture(t);
  const manifest = { format: 'workfoli-base', schemaVersion: 1, baseId: randomUUID(), company: { name: 'Empresa contextualizada' }, profile: 'clinic', modules: ['overview', 'files', 'knowledge', 'projects'], paths: { memory: '_memoria', identity: 'identidade' } };
  await f.write('workfoli.base.json', JSON.stringify(manifest));
  let result = await f.analyze();
  assert.equal(result.report.suggestedName, 'Empresa contextualizada');
  assert.equal(result.report.base?.manifest.profile, 'clinic');
  assert.ok(!Object.hasOwn(result.report, 'owner'));
  assert.equal(result.report.base?.evidence.path, 'workfoli.base.json');
  // A planned module is a valid declaration that stays inert: it is recognized, never activated.
  await f.write('workfoli.base.json', JSON.stringify({ ...manifest, modules: ['patients'] }));
  result = await f.analyze();
  assert.deepEqual(result.report.base?.manifest.modules.enabled, ['overview', 'patients']);
  assert.ok(!resolveModules(result.report.base!.manifest.modules.enabled).active.some(module => module.id === 'patients'));
  await f.write('workfoli.base.json', JSON.stringify({ ...manifest, modules: ['remote-plugin'] }));
  result = await f.analyze(); assert.equal(result.report.base, undefined);
  assert.ok(result.report.warnings.some(warning => warning.code === 'base-invalid'));
  assert.equal(result.report.summary.files, 1);
  await f.write('workfoli.base.json', JSON.stringify(manifest));
  await f.write('another/workfoli.base.json', JSON.stringify(manifest));
  result = await f.analyze(); assert.equal(result.report.base, undefined);
  assert.ok(result.report.warnings.some(warning => warning.code === 'base-ambiguous'));
});
