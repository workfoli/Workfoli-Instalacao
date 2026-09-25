import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Check, Send, Sparkles, X } from 'lucide-react';
import { Button, Loading, Notice, PageHead, Tag, useLoad, useToast } from '../components/ui';
import { errorMessage, get, post } from '../lib/api';
import { navigate } from '../lib/router';
import type { Message, Proposal } from '../lib/types';

const SUGGESTIONS = ['O que está pendente?', 'Resuma a empresa', 'Crie uma tarefa para revisar o site até sexta', 'Cadastre Maria Souza como nova cliente', 'Quero uma nova landing page para o serviço principal'];
const STATUS: Record<string, string> = { pending: 'Aguardando confirmação', executed: 'Executada', rejected: 'Recusada', expired: 'Expirada', failed: 'Falhou' };

export function AssistantPage({ initial }: { initial: string | null }) {
  const toast = useToast();
  const { data, error, loading, setData } = useLoad(() => get<{ messages: Message[]; provider: string; canAct: boolean }>('/api/ai/messages'));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);
  const send = async (value: string) => {
    const message = value.trim();
    if (!message || busy) return;
    setBusy(true); setProblem(''); setText('');
    try {
      await post<Message>('/api/ai/messages', { text: message });
      const fresh = await get<{ messages: Message[]; provider: string; canAct: boolean }>('/api/ai/messages');
      setData(fresh);
    } catch (cause) { setProblem(errorMessage(cause)); setText(message); } finally { setBusy(false); }
  };
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [data?.messages.length]);
  useEffect(() => {
    if (initial && data && !sentInitial.current) { sentInitial.current = true; navigate('/ai'); void send(initial); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, data]);
  const decide = async (proposal: Proposal, confirm: boolean) => {
    setProblem('');
    try {
      const result = await post<Proposal>(`/api/ai/proposals/${proposal.id}/${confirm ? 'confirm' : 'reject'}`, confirm ? { hash: proposal.hash } : {});
      if (result.status === 'executed' && result.result) toast(result.result.message);
      if (result.status === 'failed') setProblem(result.result?.message ?? 'A ação falhou.');
      setData({ ...data!, messages: data!.messages.map(message => ({ ...message, proposals: message.proposals.map(item => item.id === result.id ? result : item) })) });
    } catch (cause) { setProblem(errorMessage(cause)); }
  };
  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice>{error || 'Não foi possível abrir o assistente.'}</Notice>;
  const submit = (event: FormEvent) => { event.preventDefault(); void send(text); };
  return (
    <>
      <PageHead eyebrow="Ferramentas" title="IA" lead="Trabalha com o contexto autorizado da empresa. Toda alteração vira uma proposta: nada muda sem a sua confirmação, e tudo fica no histórico."
        actions={<Tag><Sparkles size={13} />{data.provider === 'local' ? 'Assistente local · sem envio externo' : data.provider}</Tag>} />
      {!data.canAct ? <Notice tone="info">Seu acesso permite consultas. Ações (criar tarefas, cadastros, projetos) exigem permissão de executar ações da IA.</Notice> : null}
      <div className="chat">
        {!data.messages.length ? (
          <div className="stack">
            <p className="muted">Comece por uma destas ou escreva do seu jeito:</p>
            <div className="chips">{SUGGESTIONS.map(suggestion => <button key={suggestion} className="chip-btn" onClick={() => send(suggestion)}>{suggestion}</button>)}</div>
          </div>
        ) : data.messages.map(message => (
          <div key={message.id} className={`msg ${message.role}`}>
            <div className="bubble">{message.text}</div>
            {message.proposals.map(proposal => <ProposalCard key={proposal.id} proposal={proposal} onDecide={decide} />)}
          </div>
        ))}
        {busy ? <Loading label="Pensando com o contexto da empresa…" /> : null}
        <div ref={end} />
      </div>
      {problem ? <Notice>{problem}</Notice> : null}
      <div className="composer">
        <form onSubmit={submit}>
          <textarea rows={1} value={text} onChange={event => setText(event.target.value)} placeholder="Peça algo: “Cadastre…”, “Crie uma tarefa…”, “O que está pendente?”" aria-label="Mensagem para a IA" maxLength={2000}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(text); } }} />
          <Button variant="primary" type="submit" busy={busy} disabled={!text.trim()} aria-label="Enviar"><Send size={16} /></Button>
        </form>
      </div>
    </>
  );
}

function ProposalCard({ proposal, onDecide }: { proposal: Proposal; onDecide: (proposal: Proposal, confirm: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const pending = proposal.status === 'pending';
  const act = async (confirm: boolean) => { setBusy(true); await onDecide(proposal, confirm); setBusy(false); };
  return (
    <div className={`proposal${pending ? '' : ' done'}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{proposal.label}</strong>
        <Tag tone={proposal.status === 'executed' ? 'accent' : 'outline'}>{STATUS[proposal.status] ?? proposal.status}</Tag>
      </div>
      <dl>{proposal.fields.map(field => <div key={field.label} style={{ display: 'contents' }}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
      {pending ? (
        <div className="row">
          <Button variant="primary" size="sm" busy={busy} onClick={() => act(true)}><Check size={15} />Confirmar</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(false)}><X size={15} />Recusar</Button>
          <span className="faint">Válida por 30 minutos.</span>
        </div>
      ) : proposal.result ? (
        <div className="row small"><span className="muted">{proposal.result.message}</span>{proposal.result.link && proposal.status === 'executed' ? <a className="btn btn-ghost btn-sm" href={proposal.result.link}>Abrir <ArrowRight size={14} /></a> : null}</div>
      ) : null}
    </div>
  );
}
