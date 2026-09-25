import { useState } from 'react';
import type { FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Button, Card, Confirm, Dialog, Field, Loading, Notice, PageHead, useLoad, useToast } from '../components/ui';
import { del, errorMessage, get, patch, post } from '../lib/api';
import { can, formatDate, TASK_STATUS } from '../lib/format';
import { entityHref } from '../lib/crm';
import type { Person, ProjectsResponse, Session, Task } from '../lib/types';

const COLUMNS: Task['status'][] = ['open', 'doing', 'done'];

export function TasksPage({ session }: { session: Session }) {
  const toast = useToast();
  const tasks = useLoad(() => get<{ tasks: Task[]; users: Person[] }>('/api/tasks'));
  const base = useLoad(() => get<{ sections: Array<{ title: string; items: Array<{ text: string; done: boolean }> }> }>('/api/tasks/base').catch(() => ({ sections: [] })));
  const projects = useLoad(() => session.modules.active.some(module => module.id === 'projects') ? get<ProjectsResponse>('/api/projects').catch(() => null) : Promise.resolve(null));
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);
  const [error, setError] = useState('');
  const canWrite = can(session.user.permissions, 'tasks:write');
  if (tasks.loading && !tasks.data) return <Loading />;
  if (tasks.error || !tasks.data) return <Notice>{tasks.error || 'Não foi possível carregar as tarefas.'}</Notice>;
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setError('');
    try { await post('/api/tasks', { title }); setTitle(''); tasks.reload(); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  const move = async (task: Task, status: Task['status']) => {
    try { await patch(`/api/tasks/${task.id}`, { status }); tasks.reload(); if (status === 'done') toast('Tarefa concluída.'); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  const openSections = (base.data?.sections ?? []).filter(section => !/feito|conclu/i.test(section.title) && section.items.some(item => !item.done));
  return (
    <>
      <PageHead eyebrow="Operação" title="Tarefas" lead="Tarefas da equipe, guardadas no banco da instância. Pendências registradas pelos agentes na Base aparecem ao lado." />
      {error ? <Notice>{error}</Notice> : null}
      {canWrite ? (
        <form className="quick-add" onSubmit={add}>
          <input className="input" value={title} onChange={event => setTitle(event.target.value)} placeholder="Nova tarefa…" aria-label="Nova tarefa" maxLength={200} />
          <Button variant="primary" type="submit"><Plus size={16} />Adicionar</Button>
        </form>
      ) : null}
      <div className="board">
        {COLUMNS.map(status => {
          const items = tasks.data!.tasks.filter(task => task.status === status);
          return (
            <section className="column" key={status} aria-label={TASK_STATUS[status]}>
              <div className="column-head"><span>{TASK_STATUS[status]}</span><span className="count">{items.length}</span></div>
              {items.map(task => (
                <div key={task.id} className="item-card">
                  {canWrite
                    ? <button className="t" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'inherit', font: 'inherit', fontWeight: 620 }} onClick={() => setEditing(task)}>{task.title}</button>
                    : <span className="t">{task.title}</span>}
                  <span className="m">
                    {task.dueDate ? <span>{formatDate(task.dueDate)}</span> : null}
                    {task.assignee ? <span>{task.assignee.name}</span> : null}
                    {task.source === 'ai' ? <span>via IA</span> : task.source === 'automation' ? <span>automação</span> : null}
                    {task.related ? <a href={entityHref(task.related.type, task.related.id)}>{task.related.label ?? 'registro removido'}</a> : null}
                  </span>
                  {canWrite && status !== 'done' ? (
                    <span className="row" style={{ gap: 6 }}>
                      {status === 'open' ? <Button size="sm" variant="ghost" onClick={() => move(task, 'doing')}>Iniciar</Button> : null}
                      <Button size="sm" variant="secondary" onClick={() => move(task, 'done')}>Concluir</Button>
                    </span>
                  ) : null}
                </div>
              ))}
              {!items.length ? <p className="faint" style={{ padding: '4px' }}>Nada aqui.</p> : null}
            </section>
          );
        })}
      </div>
      {openSections.length ? (
        <Card title="Pendências registradas na Base" meta="tarefas.md · mantidas pelos agentes (somente leitura aqui)">
          <div className="grid grid-2">{openSections.map(section => (
            <div key={section.title} className="stack" style={{ gap: 6 }}>
              <div className="nav-label" style={{ padding: 0 }}>{section.title}</div>
              {section.items.filter(item => !item.done).map(item => <div key={item.text} className="small">· {item.text}</div>)}
            </div>
          ))}</div>
        </Card>
      ) : null}
      <TaskDialog task={editing} users={tasks.data.users} projects={projects.data?.projects ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); tasks.reload(); }} />
    </>
  );
}

function TaskDialog({ task, users, projects, onClose, onSaved }: { task: Task | null; users: Person[]; projects: Array<{ id: string; name: string }>; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<Task> & { assigneeId?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const current = task ? { ...task, assigneeId: task.assignee?.id ?? '', ...form } : null;
  const reset = () => { setForm({}); setError(''); };
  const save = async () => {
    if (!task || !current) return;
    setBusy(true); setError('');
    try {
      await patch(`/api/tasks/${task.id}`, { title: current.title, notes: current.notes ?? '', status: current.status, dueDate: current.dueDate ?? '', assigneeId: current.assigneeId ?? '', projectId: current.projectId ?? '' });
      reset(); onSaved();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!task) return;
    setBusy(true);
    try { await del(`/api/tasks/${task.id}`); toast('Tarefa excluída.'); setConfirming(false); reset(); onSaved(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return (
    <>
      <Dialog open={!!task && !confirming} onClose={() => { reset(); onClose(); }} title="Tarefa"
        footer={<><Button variant="danger" onClick={() => setConfirming(true)}>Excluir</Button><span style={{ flex: 1 }} /><Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancelar</Button><Button variant="primary" busy={busy} onClick={save}>Salvar</Button></>}>
        {current ? (
          <div className="form">
            {error ? <Notice>{error}</Notice> : null}
            <Field label="Título"><input className="input" value={current.title} onChange={event => setForm({ ...form, title: event.target.value })} maxLength={200} /></Field>
            <Field label="Observações"><textarea className="textarea" rows={4} value={current.notes ?? ''} onChange={event => setForm({ ...form, notes: event.target.value })} /></Field>
            <div className="form-row">
              <Field label="Situação"><select className="select" value={current.status} onChange={event => setForm({ ...form, status: event.target.value as Task['status'] })}>{COLUMNS.map(status => <option key={status} value={status}>{TASK_STATUS[status]}</option>)}</select></Field>
              <Field label="Prazo"><input className="input" type="date" value={current.dueDate ?? ''} onChange={event => setForm({ ...form, dueDate: event.target.value || null })} /></Field>
            </div>
            <div className="form-row">
              <Field label="Responsável"><select className="select" value={current.assigneeId ?? ''} onChange={event => setForm({ ...form, assigneeId: event.target.value })}><option value="">Sem responsável</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field>
              <Field label="Projeto"><select className="select" value={current.projectId ?? ''} onChange={event => setForm({ ...form, projectId: event.target.value || null })}><option value="">Nenhum</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
            </div>
          </div>
        ) : null}
      </Dialog>
      <Confirm open={confirming} title="Excluir tarefa?" message="A tarefa sai do quadro. O registro da exclusão fica no histórico." confirmLabel="Excluir tarefa" busy={busy} onConfirm={remove} onClose={() => setConfirming(false)} />
    </>
  );
}
