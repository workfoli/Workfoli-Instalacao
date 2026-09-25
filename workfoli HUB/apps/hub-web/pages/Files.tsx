import { useMemo, useRef, useState } from 'react';
import { Download, File, FileText, Image, Lock, Search, Trash2, Upload } from 'lucide-react';
import { Markdown } from '../components/Markdown';
import { Button, Confirm, Dialog, Empty, IconButton, Loading, Notice, PageHead, Tag, useLoad, useToast } from '../components/ui';
import { api, del, errorMessage, get } from '../lib/api';
import { bytes, formatDateTime } from '../lib/format';
import type { FileNode, PrivateFile } from '../lib/types';

type Preview = { kind: 'text'; path: string; content: string; truncated: boolean } | { kind: 'image'; path: string; url: string };

export function FilesPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => get<{ base: { files: FileNode[]; truncated: boolean; mode: string }; private: PrivateFile[] | null }>('/api/files'));
  const [tab, setTab] = useState<'base' | 'private'>('base');
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [problem, setProblem] = useState('');
  const [removing, setRemoving] = useState<PrivateFile | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const folders = useMemo(() => {
    const map = new Map<string, FileNode[]>();
    for (const file of data?.base.files ?? []) {
      if (filter && !file.path.toLowerCase().includes(filter.toLowerCase())) continue;
      const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '(raiz)';
      map.set(folder, [...(map.get(folder) ?? []), file]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [data, filter]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice>{error || 'Não foi possível carregar os arquivos.'}</Notice>;
  const open = async (file: FileNode) => {
    setProblem('');
    try { setPreview(await get<Preview>(`/api/files/base?path=${encodeURIComponent(file.path)}`)); }
    catch (cause) { setProblem(errorMessage(cause)); }
  };
  const upload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true); setProblem('');
    try {
      await api('/api/files/private', { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) } });
      toast('Arquivo guardado na área privada.'); reload();
    } catch (cause) { setProblem(errorMessage(cause)); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try { await del(`/api/files/private/${removing.id}`); toast('Arquivo excluído.'); setRemoving(null); reload(); }
    catch (cause) { setProblem(errorMessage(cause)); } finally { setBusy(false); }
  };
  const iconFor = (file: FileNode) => file.restricted ? <Lock size={16} /> : file.kind === 'image' ? <Image size={16} /> : file.kind === 'document' || file.kind === 'text' ? <FileText size={16} /> : <File size={16} />;
  return (
    <>
      <PageHead eyebrow="Empresa" title="Arquivos" lead="A Base versionada (somente leitura aqui) e a área de arquivos privados da instância, que nunca vai para o Git." />
      {problem ? <Notice>{problem}</Notice> : null}
      <div className="tabs" role="tablist">
        <button role="tab" className="tab" aria-selected={tab === 'base'} onClick={() => setTab('base')}>Base ({data.base.files.length})</button>
        {data.private ? <button role="tab" className="tab" aria-selected={tab === 'private'} onClick={() => setTab('private')}>Privados ({data.private.length})</button> : null}
      </div>
      {tab === 'base' ? (
        <>
          <label className="row" style={{ maxWidth: 420 }}><Search size={16} className="muted" aria-hidden="true" /><input className="input" placeholder="Filtrar por caminho" value={filter} onChange={event => setFilter(event.target.value)} aria-label="Filtrar arquivos" /></label>
          {data.base.truncated ? <Notice tone="info">A Base tem mais arquivos que o limite de leitura; parte deles não aparece.</Notice> : null}
          {folders.length ? folders.map(([folder, files]) => (
            <section key={folder} className="stack" style={{ gap: 4 }}>
              <div className="nav-label" style={{ padding: '0 2px' }}>{folder}</div>
              <div className="table-wrap"><table className="table"><tbody>{files.map(file => (
                <tr key={file.path} className={file.viewable ? 'clickable' : undefined} onClick={() => file.viewable && open(file)}>
                  <td style={{ width: 36 }} className="muted">{iconFor(file)}</td>
                  <td><span style={{ fontWeight: 580 }}>{file.name}</span>{file.restricted ? <> <Tag tone="outline">restrito</Tag></> : null}</td>
                  <td className="faint hide-mobile">{bytes(file.size)}</td>
                  <td className="faint hide-mobile">{formatDateTime(file.modifiedAt)}</td>
                </tr>
              ))}</tbody></table></div>
            </section>
          )) : <Empty title="Nenhum arquivo encontrado" />}
        </>
      ) : data.private ? (
        <>
          <div className="row">
            <input ref={input} type="file" className="sr-only" id="upload" onChange={event => upload(event.target.files)} />
            <Button variant="primary" busy={busy} onClick={() => input.current?.click()}><Upload size={16} />Enviar arquivo</Button>
            <span className="faint">Até 25 MB. Guardado na pasta privada da instância, com verificação de integridade.</span>
          </div>
          {data.private.length ? (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Arquivo</th><th className="hide-mobile">Tamanho</th><th className="hide-mobile">Enviado</th><th /></tr></thead>
              <tbody>{data.private.map(file => (
                <tr key={file.id}>
                  <td><span style={{ fontWeight: 580 }}>{file.name}</span>{file.visibility === 'restricted' ? <> <Tag tone="outline">restrito</Tag></> : null}</td>
                  <td className="faint hide-mobile">{bytes(file.size)}</td>
                  <td className="faint hide-mobile">{formatDateTime(file.createdAt)}{file.createdBy ? ` · ${file.createdBy}` : ''}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <a className="icon-btn sm" href={`/api/files/private/${file.id}`} aria-label={`Baixar ${file.name}`}><Download size={15} /></a>
                    <IconButton small label={`Excluir ${file.name}`} onClick={() => setRemoving(file)}><Trash2 size={15} /></IconButton>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty icon={<Lock size={20} />} title="Nenhum arquivo privado">Contratos, documentos e mídia privada ficam aqui, fora da Base e do Git.</Empty>}
        </>
      ) : null}
      <Dialog open={!!preview} onClose={() => setPreview(null)} title={preview?.path.split('/').pop() ?? ''} description={preview?.path} wide>
        {preview?.kind === 'image' ? <img src={preview.url} alt="" style={{ maxWidth: '100%', borderRadius: 8 }} />
          : preview?.kind === 'text' ? (/\.(?:md|markdown)$/i.test(preview.path) ? <Markdown source={preview.content} /> : <pre className="textfile">{preview.content}</pre>) : null}
        {preview?.kind === 'text' && preview.truncated ? <p className="faint" style={{ marginTop: 12 }}>Prévia limitada aos primeiros 256 KB.</p> : null}
      </Dialog>
      <Confirm open={!!removing} title="Excluir arquivo privado?" message={`"${removing?.name ?? ''}" será apagado da área privada da instância.`} confirmLabel="Excluir arquivo" busy={busy} onConfirm={remove} onClose={() => setRemoving(null)} />
    </>
  );
}
