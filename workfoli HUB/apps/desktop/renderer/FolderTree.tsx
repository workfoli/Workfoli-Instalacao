import { useMemo } from 'react';
import { Folder, FolderTree as TreeIcon } from 'lucide-react';
import type { FileEntry } from '../../../packages/contracts';
interface Branch { name: string; path: string; count: number; children: Map<string,Branch>; }
export default function FolderTree({files,selected,onSelect}:{files:FileEntry[];selected:string;onSelect:(path:string)=>void}) {
  const tree=useMemo(()=>{
    const root:Branch={name:'Todas as pastas',path:'',count:files.length,children:new Map()};
    for(const file of files){let current=root;for(const name of file.path.split('/').slice(0,-1)){if(!current.children.has(name))current.children.set(name,{name,path:current.path?`${current.path}/${name}`:name,count:0,children:new Map()});current=current.children.get(name)!;current.count++;}}
    return root;
  },[files]);
  const branch=(node:Branch,depth=0):React.ReactNode=><li key={node.path}>{node.children.size>0?<details><summary><button aria-pressed={selected===node.path} onClick={event=>{event.stopPropagation();onSelect(node.path);}}><Folder size={13}/><span>{node.name}</span><small>{node.count}</small></button></summary>{depth<80?<ul>{[...node.children.values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(0,150).map(child=>branch(child,depth+1))}</ul>:<p>Use a busca por caminho para navegar mais fundo.</p>}{node.children.size>150&&<p>Primeiras 150 pastas. Use a busca para encontrar outras.</p>}</details>:<button className="tree-leaf" aria-pressed={selected===node.path} onClick={()=>onSelect(node.path)}><Folder size={13}/><span>{node.name}</span><small>{node.count}</small></button>}</li>;
  return <details className="folder-tree"><summary><TreeIcon size={15}/><span>Pastas da origem</span>{selected&&<span className="selected-folder">{selected}</span>}</summary><div className="folder-tree-body"><button className="text-button" onClick={()=>onSelect('')}>Todas as pastas · {files.length} entradas</button><ul>{[...tree.children.values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(0,150).map(node=>branch(node))}</ul></div></details>;
}
