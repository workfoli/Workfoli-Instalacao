import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronLeft, ChevronRight, SlidersHorizontal, Files, LockKeyhole, Copy, CornerDownRight } from 'lucide-react';
import type { Category, Disposition, FileEntry } from '../../../packages/contracts';
import { bytes, count, CategoryTag, CATEGORY_LABELS, dispositionLabels, EmptyState, FileIcon, ErrorNotice, errorText } from './ui';
import FolderTree from './FolderTree';

interface Props {
  files: FileEntry[];
  overrides?: Record<string, Category>;
  onCategoryChange?: (id: string, category: Category) => void;
  onPreview?: (file: FileEntry) => void;
  searchFiles?: (query: string) => Promise<string[]>;
  focusFile?: { id: string; nonce: number } | null;
}
const PAGE_SIZE = 50;

export default function FileTable({ files, overrides, onCategoryChange, onPreview, searchFiles, focusFile }: Props) {
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [disposition, setDisposition] = useState<Disposition | ''>('');
  const [page, setPage] = useState(0);
  const [matches, setMatches] = useState<{ query: string; ids: Set<string> } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchRef = useRef(searchFiles);
  searchRef.current = searchFiles;
  useEffect(() => {
    if (!focusFile) return;
    const file = files.find(x => x.id === focusFile.id);
    if (file) { setQuery(file.path); setFolder(''); setCategory(''); setDisposition(''); setPage(0); }
  }, [focusFile, files]);
  useEffect(() => { setPage(0); }, [query, category, disposition, folder]);
  useEffect(() => {
    const search = searchRef.current;
    let active = true;
    setSearchError(''); setMatches(null);
    if (!query.trim() || !search) { setSearching(false); return; }
    setSearching(true);
    const timeout = window.setTimeout(() => {
      void search(query.trim()).then(ids => { if (active) setMatches({ query, ids: new Set(ids) }); })
        .catch(error => { if (active) setSearchError(errorText(error)); })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [query]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('pt-BR');
    return files.filter(file => (!category || (overrides?.[file.id] ?? file.category) === category)
      && (!disposition || file.disposition === disposition)
      && (!folder || file.path.startsWith(`${folder}/`))
      && (!needle || file.path.toLocaleLowerCase('pt-BR').includes(needle) || (matches?.query === query && matches.ids.has(file.id))));
  }, [files, query, category, disposition, overrides, matches, folder]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  return <div className="file-explorer">
    <FolderTree files={files} selected={folder} onSelect={setFolder}/>
    <div className="file-toolbar">
      <label className="search-input"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchFiles ? 'Buscar por caminho ou conteúdo' : 'Filtrar por caminho do arquivo'} aria-label="Buscar arquivos" /><kbd>⌕</kbd></label>
      <label className="filter-select"><SlidersHorizontal size={15} /><select aria-label="Filtrar categoria" value={category} onChange={e => setCategory(e.target.value as Category | '')}><option value="">Todas as categorias</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <select className="plain-select disposition-filter" aria-label="Filtrar disponibilidade" value={disposition} onChange={e => setDisposition(e.target.value as Disposition | '')}><option value="">Todas as disponibilidades</option>{Object.entries(dispositionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>
    {searchError && <ErrorNotice>A busca no conteúdo falhou: {searchError} Os resultados por caminho continuam disponíveis.</ErrorNotice>}
    <div className="table-caption"><span>{count(filtered.length)} de {count(files.length)} entradas{searching && ' · Buscando conteúdo…'}</span>{(query || category || disposition) && <button className="text-button" onClick={() => { setQuery(''); setCategory(''); setDisposition(''); }}>Limpar filtros</button>}</div>
    {visible.length ? <div className="table-scroll"><table className="file-table"><thead><tr><th>Arquivo e caminho original</th><th>Categoria</th><th>Disponibilidade</th><th className="numeric">Tamanho</th></tr></thead><tbody>{visible.map(file => {
      const parts = file.path.split('/'); const name = parts.pop() || file.path; const parent = parts.join('/');
      return <tr key={file.id} className={file.id === focusFile?.id ? 'focused-row' : undefined}>
        <td><div className="file-cell"><span className="file-type-icon"><FileIcon file={file} /></span><div className="file-name-wrap">{onPreview ? <button className="file-name" title={file.path} onClick={() => onPreview(file)}>{name}</button> : <span className="file-name plain" title={file.path}>{name}</span>}<span className="file-path" title={file.path}>{parent || 'Raiz da origem'}</span><span className="file-details">{file.kind === 'symlink' && <span><CornerDownRight size={11} /> Link não seguido</span>}{file.sensitive && <span><LockKeyhole size={11} /> Sensível</span>}{file.duplicateOf && <span><Copy size={11} /> Duplicado</span>}</span></div></div></td>
        <td>{onCategoryChange ? <select className="category-edit" aria-label={`Categoria de ${file.path}`} value={overrides?.[file.id] ?? file.category} onChange={e => onCategoryChange(file.id, e.target.value as Category)}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <CategoryTag category={file.category} />}</td>
        <td><span className={`availability availability-${file.disposition}`} title={file.reason}><span />{dispositionLabels[file.disposition]}</span></td>
        <td className="numeric size-cell">{bytes(file.size)}</td>
      </tr>;
    })}</tbody></table></div> : <EmptyState icon={<Files size={24} />} title="Nenhum arquivo encontrado">Tente outro termo ou remova os filtros para ver as entradas da origem.</EmptyState>}
    <div className="pagination"><span>{visible.length ? `${count(safePage * PAGE_SIZE + 1)}–${count(safePage * PAGE_SIZE + visible.length)}` : '0'} de {count(filtered.length)}</span><div><button className="icon-button" aria-label="Página anterior" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft size={17} /></button><span>Página {safePage + 1} de {pages}</span><button className="icon-button" aria-label="Próxima página" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}><ChevronRight size={17} /></button></div></div>
  </div>;
}
