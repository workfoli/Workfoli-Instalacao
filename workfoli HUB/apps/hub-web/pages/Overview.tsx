import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button, Card, Empty, Loading, Notice, PageHead, Stat, Tag, useLoad } from '../components/ui';
import { get } from '../lib/api';
import { actionLabel, firstName, formatDate, greeting, PROJECT_STATUS, relative, TASK_STATUS } from '../lib/format';
import { navigate } from '../lib/router';
import type { Overview, Session } from '../lib/types';
import { money } from '../lib/crm';

export function OverviewPage({ session }: { session: Session }) {
  const { data, error, loading } = useLoad(() => get<Overview>('/api/overview'));
  const [ask, setAsk] = useState('');
  const hasAi = session.modules.active.some(module => module.id === 'ai');
  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice>{error || 'Não foi possível carregar a visão geral.'}</Notice>;
  const submitAsk = (event: FormEvent) => { event.preventDefault(); if (ask.trim()) navigate(`/ai?q=${encodeURIComponent(ask.trim())}`); };
  const stats = [
    data.counts.tasksOpen !== null ? { value: data.counts.tasksOpen, label: 'Tarefas em aberto', hint: data.counts.tasksDoing ? `${data.counts.tasksDoing} em andamento` : undefined } : null,
    data.counts.projectsActive !== null ? { value: data.counts.projectsActive, label: 'Projetos ativos', hint: data.counts.projectsPlanned ? `${data.counts.projectsPlanned} planejado(s)` : undefined } : null,
    data.crm ? { value: data.crm.openCount, label: 'Oportunidades em aberto', hint: data.crm.newLeads ? `${data.crm.newLeads} lead(s) novo(s) aguardando` : money(data.crm.openValueCents, data.crm.currency) } : null,
    data.counts.documents !== null ? { value: data.counts.documents, label: 'Documentos na Base', hint: undefined } : null,
  ].filter((item): item is { value: number; label: string; hint: string | undefined } => !!item);
  return (
    <>
      <PageHead eyebrow={data.company?.name ?? session.company.name} title={`${greeting()}, ${firstName(data.user.name)}.`} lead={data.company?.tagline ?? data.company?.description ?? undefined} />
      {!data.base.available ? <Notice tone="info">{data.base.message ?? 'A Base ainda não está disponível.'}</Notice> : null}
      {stats.length ? <div className="grid grid-4">{stats.map(stat => <Stat key={stat.label} value={stat.value} label={stat.label} hint={stat.hint} />)}</div> : null}
      {data.company?.method.length ? (
        <div className="method" aria-label="Método">
          {data.company.method.map((step, index) => <div className="step" key={step}><span className="n">{String(index + 1).padStart(2, '0')}</span><span className="name">{step}</span></div>)}
        </div>
      ) : null}
      <div className="split">
        <div className="stack" style={{ gap: 20 }}>
          {data.myTasks ? (
            <Card title="Tarefas" meta="Suas e sem responsável" actions={<a className="btn btn-ghost btn-sm" href="#/tasks">Ver todas <ArrowRight size={14} /></a>}>
              {data.myTasks.length ? (
                <div className="list">{data.myTasks.map(task => (
                  <a key={task.id} className="list-item" href="#/tasks" style={{ textDecoration: 'none' }}>
                    <div className="grow"><div className="title">{task.title}</div><div className="sub">{task.dueDate ? `Prazo ${formatDate(task.dueDate)}` : 'Sem prazo'}</div></div>
                    <Tag tone={task.status === 'doing' ? 'accent' : undefined}>{TASK_STATUS[task.status]}</Tag>
                  </a>
                ))}</div>
              ) : <p className="muted">Nada em aberto por aqui.</p>}
            </Card>
          ) : null}
          {data.projects ? (
            <Card title="Projetos" meta="Ativos e planejados" actions={<a className="btn btn-ghost btn-sm" href="#/projects">Abrir <ArrowRight size={14} /></a>}>
              {data.projects.length ? (
                <div className="list">{data.projects.map(project => (
                  <a key={project.id} className="list-item" href={`#/projects/${project.id}`} style={{ textDecoration: 'none' }}>
                    <div className="grow"><div className="title">{project.name}</div><div className="sub">{project.typeLabel}</div></div>
                    <Tag tone={project.status === 'active' ? 'accent' : 'outline'}>{PROJECT_STATUS[project.status] ?? project.status}</Tag>
                  </a>
                ))}</div>
              ) : <p className="muted">Nenhum projeto registrado na Base.</p>}
            </Card>
          ) : null}
        </div>
        <div className="stack" style={{ gap: 20 }}>
          {data.baseTasks && data.baseTasks.length ? (
            <Card title="Pendências na Base" meta="Registradas em tarefas.md">
              {data.baseTasks.map(section => (
                <div key={section.title} className="stack" style={{ gap: 6, marginBottom: 12 }}>
                  <div className="nav-label" style={{ padding: 0 }}>{section.title}</div>
                  {section.items.map(item => <div key={item.text} className="small">· {item.text}</div>)}
                </div>
              ))}
            </Card>
          ) : null}
          {data.crm ? (
            <Card title={data.crm.label} meta={`${data.crm.pipeline} · ${money(data.crm.openValueCents, data.crm.currency)} em aberto`} actions={<a className="btn btn-ghost btn-sm" href="#/crm">Funil <ArrowRight size={14} /></a>}>
              <div className="stack">{data.crm.stages.map(stage => (
                <div key={stage.stage} className="stack" style={{ gap: 6 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><span className="small">{stage.stage}</span><span className="faint">{stage.count}</span></div>
                  <div className="bar"><span style={{ width: `${data.crm!.openCount ? Math.round(stage.count / data.crm!.openCount * 100) : 0}%` }} /></div>
                </div>
              ))}</div>
            </Card>
          ) : null}
          {data.activity ? (
            <Card title="Atividade recente" actions={<a className="btn btn-ghost btn-sm" href="#/history">Histórico <ArrowRight size={14} /></a>}>
              {data.activity.length ? <div className="list">{data.activity.map(entry => (
                <div key={entry.id} className="list-item"><div className="grow"><div className="title" style={{ fontWeight: 560 }}>{actionLabel(entry.action)}</div><div className="sub">{entry.actorName ?? (entry.actorType === 'system' ? 'Sistema' : entry.actorType === 'agent' ? 'Computador da Base' : '—')} · {relative(entry.at)}</div></div></div>
              ))}</div> : <Empty title="Sem atividade ainda" />}
            </Card>
          ) : null}
        </div>
      </div>
      {hasAi ? (
        <Card title={<><Sparkles size={18} /> Peça algo</>} meta="A IA usa só o contexto que o seu acesso permite e pede confirmação antes de alterar qualquer coisa.">
          <form className="row" onSubmit={submitAsk}>
            <input className="input" style={{ flex: 1, minWidth: 220 }} value={ask} onChange={event => setAsk(event.target.value)} placeholder="Ex.: O que está pendente? · Crie uma tarefa para revisar o site até sexta" aria-label="Pedido para a IA" />
            <Button variant="primary" type="submit">Enviar</Button>
          </form>
        </Card>
      ) : null}
    </>
  );
}
