import { useMemo, useState } from 'react';
import { BookOpen, Plus, Search } from 'lucide-react';
import { Markdown } from '../components/Markdown';
import { Button, Dialog, Empty, Field, Loading, Notice, PageHead, useLoad, useToast } from '../components/ui';
import { errorMessage, get, post } from '../lib/api';
import { can, formatDateTime } from '../lib/format';
import { navigate } from '../lib/router';
import type { BaseChangeOutcome, DocumentInfo, Session } from '../lib/types';

export function KnowledgePage({ session, selected }: { session: Session; selected: string | null }) {
  const list = useLoad(() => get<{ documents: DocumentInfo[] }>('/api/knowledge'));
  const [filter, setFilter] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const current = selected ?? list.data?.documents[0]?.path ?? null;
  const doc = useLoad(() => current ? get<DocumentInfo & { content: string }>(`/api/knowledge/doc?path=${encodeURIComponent(current)}`) : Promise.resolve(null), [current]);
  const groups = useMemo(() => {
    const map = new Map<string, DocumentInfo[]>();
    for (const item of list.data?.documents ?? []) {
      if (filter && !`${item.title} ${item.path} ${item.excerpt}`.toLowerCase().includes(filter.toLowerCase())) continue;
      map.set(item.folder, [...(map.get(item.folder) ?? []), item]);
    }
    return [...map.entries()];
  }, [list.data, filter]);
  const canWrite = can(session.user.permissions, 'knowledge:write');
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <Notice>{list.error}</Notice>;
  return (
    <>
      <PageHead eyebrow="Base" title="Conhecimento" lead="Memória, processos, serviços e decisões da empresa, lidos da Base. Arquivos com credenciais ou dados pessoais nunca aparecem aqui."
        actions={canWrite ? <Button variant="primary" onClick={() => setNoteOpen(true)}><Plus size={16} />Registrar nota</Button> : undefined} />
      {!list.data?.documents.length ? <Empty icon={<BookOpen size={20} />} title="Nenhum documento ainda">Documentos em _memoria, processos, conhecimento e serviços aparecem aqui.</Empty> : (
        <div className="reader">
          <div className="doc-list">
            <label className="row" style={{ gap: 8 }}>
              <Search size={16} className="muted" aria-hidden="true" />
              <input className="input" placeholder="Filtrar documentos" value={filter} onChange={event => setFilter(event.target.value)} aria-label="Filtrar documentos" />
            </label>
            {groups.map(([folder, items]) => (
              <div className="doc-group" key={folder}>
                <div className="nav-label">{folder}</div>
                {items.map(item => <button key={item.path} className="doc-link" aria-current={item.path === current ? 'true' : undefined} onClick={() => navigate(`/knowledge?doc=${encodeURIComponent(item.path)}`)}>{item.title}</button>)}
              </div>
            ))}
          </div>
          <article className="card" style={{ minHeight: 320 }}>
            {doc.loading ? <Loading /> : doc.error ? <Notice>{doc.error}</Notice> : doc.data ? (
              <>
                <div className="faint" style={{ marginBottom: 18 }}>{doc.data.path} · atualizado {formatDateTime(doc.data.modifiedAt)}</div>
                <Markdown source={doc.data.content} />
              </>
            ) : <Empty title="Escolha um documento" />}
          </article>
        </div>
      )}
      <NoteDialog open={noteOpen} onClose={() => setNoteOpen(false)} onSaved={() => { setNoteOpen(false); list.reload(); }} />
    </>
  );
}

function NoteDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try {
      const outcome = await post<BaseChangeOutcome>('/api/knowledge/notes', { title, body });
      toast(outcome.status === 'applied' ? outcome.result.summary : outcome.summary);
      setTitle(''); setBody('');
      onSaved();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Registrar nota na Base" description="Vira um arquivo em conhecimento/notas, versionado com a Base. Não inclua senhas nem dados pessoais."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" busy={busy} disabled={!title.trim() || !body.trim()} onClick={save}>Registrar</Button></>}>
      <div className="form">
        {error ? <Notice>{error}</Notice> : null}
        <Field label="Título"><input className="input" value={title} onChange={event => setTitle(event.target.value)} maxLength={140} /></Field>
        <Field label="Texto"><textarea className="textarea" rows={8} value={body} onChange={event => setBody(event.target.value)} /></Field>
      </div>
    </Dialog>
  );
}
