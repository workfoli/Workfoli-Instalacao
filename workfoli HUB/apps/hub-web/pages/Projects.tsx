import { useState } from 'react';
import { ArrowLeft, Clock, ExternalLink, FolderKanban, Plus } from 'lucide-react';
import { Markdown } from '../components/Markdown';
import { Button, Card, Dialog, Empty, Field, Loading, Notice, PageHead, Tag, useLoad, useToast } from '../components/ui';
import { errorMessage, get, post } from '../lib/api';
import { can, formatDate, PROJECT_STATUS, TASK_STATUS } from '../lib/format';
import type { BaseChangeOutcome, DocumentInfo, ProjectView, ProjectsResponse, Session, Task } from '../lib/types';

const FILTERS: Array<[string, string]> = [['todos', 'Todos'], ['active', 'Ativos'], ['planned', 'Planejados'], ['paused', 'Pausados'], ['done', 'Concluídos']];

export function ProjectsPage({ session }: { session: Session }) {
  const { data, error, loading, reload } = useLoad(() => get<ProjectsResponse>('/api/projects'));
  const [filter, setFilter] = useState('todos');
  const [open, setOpen] = useState(false);
  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice>{error || 'Não foi possível carregar os projetos.'}</Notice>;
  const projects = data.projects.filter(project => filter === 'todos' || project.status === filter);
  const canWrite = can(session.user.permissions, 'projects:write');
  return (
    <>
      <PageHead eyebrow="Base" title="Projetos" lead="Sites, landing pages, campanhas, sistemas e iniciativas registrados na Base da empresa."
        actions={canWrite ? <Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} />Novo projeto</Button> : undefined} />
      {data.pending.length ? (
        <Notice tone="info"><strong>Aguardando o computador da Base:</strong> {data.pending.map(item => item.name).join(', ')}. O projeto aparece aqui assim que o Local Agent aplicar a alteração.</Notice>
      ) : null}
      <div className="tabs" role="tablist">{FILTERS.map(([id, label]) => <button key={id} role="tab" className="tab" aria-selected={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>
      {projects.length ? (
        <div className="grid grid-3">{projects.map(project => <ProjectCard key={project.id} project={project} />)}</div>
      ) : <Empty icon={<FolderKanban size={20} />} title="Nenhum projeto aqui">{canWrite ? 'Crie o primeiro projeto: ele passa a existir na Base, com pasta e briefing.' : 'Os projetos vêm da Base da empresa.'}</Empty>}
      <NewProject open={open} data={data} onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload(); }} mode={session.mode} />
    </>
  );
}

function ProjectCard({ project }: { project: ProjectView }) {
  return (
    <a className="card" href={`#/projects/${project.id}`} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}><span className="faint">{project.typeLabel}</span><Tag tone={project.status === 'active' ? 'accent' : 'outline'}>{PROJECT_STATUS[project.status] ?? project.status}</Tag></div>
      <h3>{project.name}</h3>
      {project.summary ? <p className="muted small">{project.summary}</p> : null}
      <div className="row faint" style={{ marginTop: 'auto' }}>
        <span>{project.tasks.open} tarefa(s) aberta(s)</span>
        {project.services.length ? <span>· {project.services.map(service => service.name).join(', ')}</span> : null}
      </div>
    </a>
  );
}

function NewProject({ open, data, onClose, onDone, mode }: { open: boolean; data: ProjectsResponse; onClose: () => void; onDone: () => void; mode: string }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState('landing-page');
  const [summary, setSummary] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try {
      const outcome = await post<BaseChangeOutcome>('/api/projects', { name, type, summary: summary || undefined, services });
      toast(outcome.status === 'applied' ? outcome.result.summary : outcome.summary);
      setName(''); setSummary(''); setServices([]);
      onDone();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Novo projeto" description={mode === 'remote' ? 'O pedido vai para a fila e o computador da Base cria a pasta e o registro no manifesto.' : 'Cria a pasta do projeto e o registro no manifesto da Base.'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" busy={busy} disabled={!name.trim()} onClick={save}>Criar projeto</Button></>}>
      <div className="form">
        {error ? <Notice>{error}</Notice> : null}
        <Field label="Nome"><input className="input" value={name} onChange={event => setName(event.target.value)} maxLength={120} placeholder="Ex.: Landing page de lançamento" /></Field>
        <Field label="Tipo"><select className="select" value={type} onChange={event => setType(event.target.value)}>{data.types.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Field>
        <Field label="Objetivo" help="Uma frase. O briefing completo fica no README do projeto."><textarea className="textarea" rows={3} value={summary} onChange={event => setSummary(event.target.value)} maxLength={600} /></Field>
        {data.services.length ? (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
            <legend className="field"><span>Serviços relacionados</span></legend>
            <div className="row">{data.services.map(service => (
              <label key={service.id} className="checkbox"><input type="checkbox" checked={services.includes(service.id)} onChange={event => setServices(current => event.target.checked ? [...current, service.id] : current.filter(id => id !== service.id))} />{service.name}</label>
            ))}</div>
          </fieldset>
        ) : null}
      </div>
    </Dialog>
  );
}

export function ProjectDetailPage({ id }: { id: string }) {
  const { data, error, loading } = useLoad(() => get<{ project: ProjectView; readme: string | null; documents: DocumentInfo[]; tasks: Task[] }>(`/api/projects/${encodeURIComponent(id)}`), [id]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice>{error || 'Projeto não encontrado.'}</Notice>;
  const { project } = data;
  return (
    <>
      <a className="btn btn-ghost btn-sm" href="#/projects" style={{ alignSelf: 'flex-start' }}><ArrowLeft size={14} />Projetos</a>
      <PageHead eyebrow={project.typeLabel} title={project.name} lead={project.summary ?? undefined} actions={<Tag tone={project.status === 'active' ? 'accent' : 'outline'}>{PROJECT_STATUS[project.status] ?? project.status}</Tag>} />
      <div className="split">
        <Card title="Briefing" meta={project.path ?? undefined}>{data.readme ? <Markdown source={data.readme} /> : <p className="muted">Sem README na pasta do projeto.</p>}</Card>
        <div className="stack" style={{ gap: 20 }}>
          <Card title="Tarefas do projeto" meta={`${project.tasks.open} aberta(s) · ${project.tasks.done} concluída(s)`}>
            {data.tasks.length ? <div className="list">{data.tasks.map(task => <div key={task.id} className="list-item"><div className="grow"><div className="title">{task.title}</div><div className="sub">{task.dueDate ? `Prazo ${formatDate(task.dueDate)}` : 'Sem prazo'}</div></div><Tag>{TASK_STATUS[task.status]}</Tag></div>)}</div> : <p className="muted">Nenhuma tarefa ligada a este projeto.</p>}
          </Card>
          {data.documents.length > 1 ? <Card title="Documentos">{data.documents.map(doc => <a key={doc.path} className="list-item" href={`#/knowledge?doc=${encodeURIComponent(doc.path)}`} style={{ textDecoration: 'none' }}><div className="grow"><div className="title">{doc.title}</div><div className="sub">{doc.path}</div></div></a>)}</Card> : null}
          {project.links?.length ? <Card title="Links">{project.links.map(link => <a key={link.url} className="list-item" href={link.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}><div className="grow"><div className="title">{link.label}</div><div className="sub">{link.url}</div></div><ExternalLink size={15} /></a>)}</Card> : null}
          {project.createdAt ? <p className="faint row"><Clock size={14} />Registrado em {formatDate(project.createdAt)}</p> : null}
        </div>
      </div>
    </>
  );
}
