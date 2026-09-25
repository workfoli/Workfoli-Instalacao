import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link2, Paperclip, Plus, Trash2 } from 'lucide-react';
import { Button, Dialog, Field, FieldGroup, IconButton, Notice, Tag, useToast } from './ui';
import { ApiError, del, errorMessage, post } from '../lib/api';
import { formatDate, formatDateTime, relative } from '../lib/format';
import {
  ACTIVITY_KINDS, ATTRIBUTION_LABELS, ENTITY_PATHS, PRIORITIES, customDisplay, entityHref, money,
} from '../lib/crm';
import type { Attachment, Attribution, CrmCustomField, CrmSettings, EntityType, TimelineEntry } from '../lib/crm';
import type { Task } from '../lib/types';

export type FormState = Record<string, unknown>;

/** Valor de um campo do formulário: o editado, ou o inicial. */
export const valueOf = (form: FormState, key: string, initial?: unknown): string => {
  const value = Object.hasOwn(form, key) ? form[key] : initial;
  return value === null || value === undefined ? '' : String(value);
};

export function OwnerSelect({ settings, value, onChange, label = 'Responsável' }: { settings: CrmSettings; value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <Field label={label}>
      <select className="select" value={value} onChange={event => onChange(event.target.value)}>
        <option value="">Sem responsável</option>
        {settings.users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
      </select>
    </Field>
  );
}

export function SourceSelect({ settings, value, onChange }: { settings: CrmSettings; value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Origem">
      <select className="select" value={value} onChange={event => onChange(event.target.value)}>
        <option value="">Sem origem</option>
        {settings.sources.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}
      </select>
    </Field>
  );
}

export function PrioritySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Prioridade">
      <select className="select" value={value || 'normal'} onChange={event => onChange(event.target.value)}>
        {Object.entries(PRIORITIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </Field>
  );
}

/** Etiquetas separadas por vírgula. */
export function TagsField({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  return (
    <Field label="Etiquetas" help="Separe por vírgula. Ex.: VIP, retorno">
      <input className="input" value={text} onChange={event => { setText(event.target.value); onChange(event.target.value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 20)); }} />
    </Field>
  );
}

/** Campos personalizados definidos na Base para a entidade. */
export function CustomFields({ fields, values, onChange }: { fields: CrmCustomField[]; values: Record<string, unknown>; onChange: (id: string, value: unknown) => void }) {
  if (!fields.length) return null;
  return (
    <div className="form-row">
      {fields.map(field => {
        const value = values[field.id];
        const label = `${field.label}${field.required ? ' *' : ''}`;
        if (field.type === 'checkbox') return <label key={field.id} className="checkbox"><input type="checkbox" checked={value === true} onChange={event => onChange(field.id, event.target.checked)} />{label}</label>;
        if (field.type === 'select') return (
          <Field key={field.id} label={label} help={field.help ?? undefined}>
            <select className="select" value={typeof value === 'string' ? value : ''} onChange={event => onChange(field.id, event.target.value || null)}>
              <option value="">—</option>{field.options?.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
        );
        if (field.type === 'multiselect') {
          const selected = Array.isArray(value) ? value as string[] : [];
          return (
            <FieldGroup key={field.id} label={label} help={field.help ?? undefined}>
              <div className="chips-input">{field.options?.map(option => (
                <button key={option} type="button" className="chip-toggle" aria-pressed={selected.includes(option)}
                  onClick={() => onChange(field.id, selected.includes(option) ? selected.filter(item => item !== option) : [...selected, option])}>{option}</button>
              ))}</div>
            </FieldGroup>
          );
        }
        if (field.type === 'textarea') return <Field key={field.id} label={label} help={field.help ?? undefined}><textarea className="textarea" rows={3} value={typeof value === 'string' ? value : ''} onChange={event => onChange(field.id, event.target.value)} /></Field>;
        const type = field.type === 'number' || field.type === 'currency' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'phone' ? 'tel' : 'text';
        return (
          <Field key={field.id} label={label} help={field.help ?? undefined}>
            <input className="input" type={type} step={field.type === 'currency' ? '0.01' : undefined} value={value === undefined || value === null ? '' : String(value)}
              onChange={event => onChange(field.id, type === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value)} />
          </Field>
        );
      })}
    </div>
  );
}

export function CustomFacts({ fields, values }: { fields: CrmCustomField[]; values: Record<string, unknown> }) {
  const known = new Set(fields.map(field => field.id));
  const orphan = Object.keys(values).filter(key => !known.has(key));
  return (
    <>
      {fields.map(field => <FactRow key={field.id} label={field.label}>{customDisplay(field, values[field.id])}</FactRow>)}
      {orphan.map(key => <FactRow key={key} label={`${key} (campo removido)`}>{String(values[key])}</FactRow>)}
    </>
  );
}

export function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return <><dt>{label}</dt><dd>{children}</dd></>;
}

export function AttributionFacts({ attribution }: { attribution: Attribution }) {
  const entries = Object.entries(attribution).filter(([, value]) => value);
  if (!entries.length) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="nav-label" style={{ padding: 0 }}>Atribuição</div>
      <dl className="facts">{entries.map(([key, value]) => <FactRow key={key} label={ATTRIBUTION_LABELS[key] ?? key}>{value}</FactRow>)}</dl>
    </div>
  );
}

const HISTORY_ACTIONS: Record<string, string> = {
  created: 'Criado', updated: 'Atualizado', owner_changed: 'Responsável', value_changed: 'Valor', stage_changed: 'Etapa', 'status.won': 'Ganha', 'status.lost': 'Perdida', 'status.open': 'Reaberta',
  converted: 'Convertido', disqualified: 'Descartado', reopened: 'Reativado', lead_linked: 'Lead vinculado', relationship_changed: 'Relação', tags_changed: 'Etiquetas',
  task_created: 'Tarefa', 'automation.task': 'Automação', 'automation.tag': 'Automação', attachment_added: 'Anexo', attachment_removed: 'Anexo', archived: 'Arquivado', restored: 'Restaurado',
  migrated: 'Importado', contact_purged: 'Contato excluído', auto_convert_failed: 'Integração',
};

function actorLabel(entry: TimelineEntry): string {
  if (entry.actor.type === 'ai') return `${entry.actor.name ?? 'Usuário'} via IA`;
  if (entry.actor.type === 'integration') return entry.origin.startsWith('integration:') ? `Integração ${entry.origin.slice(12)}` : 'Integração';
  if (entry.actor.type === 'system') return entry.origin === 'migration' ? 'Migração' : 'Automação';
  if (entry.actor.type === 'agent') return 'Computador da Base';
  return entry.actor.name ?? 'Usuário';
}

/** Histórico: quem, quando, o quê e de onde. Inclui o que aconteceu nos registros ligados. */
export function Timeline({ entries, self }: { entries: TimelineEntry[]; self: { type: EntityType; id: string } }) {
  if (!entries.length) return <p className="muted">Sem histórico ainda.</p>;
  return (
    <ol className="timeline">
      {entries.map(entry => {
        const activity = entry.kind !== 'history';
        const elsewhere = entry.entityType !== self.type || entry.entityId !== self.id;
        return (
          <li key={entry.id}>
            <span className={`dot${activity ? ' activity' : ''}`} aria-hidden="true" />
            <div>
              <div className="what">
                <strong>{activity ? ACTIVITY_KINDS[entry.kind] ?? entry.kind : HISTORY_ACTIONS[entry.action ?? ''] ?? 'Registro'}</strong>
                {!activity && entry.body ? <span className="muted"> · {entry.body}</span> : null}
                {elsewhere && entry.entityLabel ? <> · <a href={entityHref(entry.entityType, entry.entityId)}>{entry.entityLabel}</a></> : null}
              </div>
              <div className="who">{actorLabel(entry)} · <time dateTime={entry.occurredAt} title={formatDateTime(entry.occurredAt)}>{relative(entry.occurredAt)}</time></div>
              {activity && entry.body ? <div className="body">{entry.body}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ActivityComposer({ type, id, onDone }: { type: EntityType; id: string; onDone: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState('note');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try { await post(`/api/crm/${ENTITY_PATHS[type]}/${id}/activities`, { kind, body }); setBody(''); toast('Registrado no histórico.'); onDone(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      {error ? <Notice>{error}</Notice> : null}
      <div className="row">
        <select className="select" style={{ width: 'auto' }} value={kind} onChange={event => setKind(event.target.value)} aria-label="Tipo de registro">
          {Object.entries(ACTIVITY_KINDS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
      <textarea className="textarea" rows={3} value={body} onChange={event => setBody(event.target.value)} placeholder="O que aconteceu? (ligação, reunião, combinado…)" aria-label="Registro" maxLength={5000} />
      <div className="row" style={{ justifyContent: 'flex-end' }}><Button variant="primary" size="sm" busy={busy} disabled={!body.trim()} onClick={save}>Registrar</Button></div>
    </div>
  );
}

export function LinkedTasks({ type, id, tasks, canWrite, onChange }: { type: EntityType; id: string; tasks: Task[] | null; canWrite: boolean; onChange: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (tasks === null) return <p className="faint">Seu acesso não inclui tarefas.</p>;
  const add = async () => {
    setBusy(true); setError('');
    try { await post('/api/tasks', { title, dueDate: due || null, relatedType: type, relatedId: id }); setTitle(''); setDue(''); toast('Tarefa criada.'); onChange(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      {error ? <Notice>{error}</Notice> : null}
      {tasks.length ? <div className="list">{tasks.map(task => (
        <a key={task.id} className="list-item" href="#/tasks" style={{ textDecoration: 'none' }}>
          <div className="grow"><div className="title">{task.title}</div><div className="sub">{task.dueDate ? `Prazo ${formatDate(task.dueDate)}` : 'Sem prazo'}{task.assignee ? ` · ${task.assignee.name}` : ''}{task.source === 'automation' ? ' · automação' : ''}</div></div>
          <Tag tone={task.status === 'done' ? 'outline' : undefined}>{task.status === 'done' ? 'Concluída' : task.status === 'doing' ? 'Em andamento' : 'A fazer'}</Tag>
        </a>
      ))}</div> : <p className="muted">Nenhuma tarefa ligada.</p>}
      {canWrite ? (
        <div className="row">
          <input className="input" style={{ flex: 1, minWidth: 160 }} value={title} onChange={event => setTitle(event.target.value)} placeholder="Nova tarefa (ex.: enviar proposta)" aria-label="Nova tarefa" maxLength={200} />
          <input className="input" style={{ width: 'auto' }} type="date" value={due} onChange={event => setDue(event.target.value)} aria-label="Prazo" />
          <Button size="sm" busy={busy} disabled={!title.trim()} onClick={add}><Plus size={14} />Adicionar</Button>
        </div>
      ) : null}
    </div>
  );
}

export function Attachments({ type, id, items, canWrite, onChange }: { type: EntityType; id: string; items: Attachment[]; canWrite: boolean; onChange: () => void }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: 'url', ref: '', label: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try { await post(`/api/crm/${ENTITY_PATHS[type]}/${id}/attachments`, form); setAdding(false); setForm({ kind: 'url', ref: '', label: '' }); toast('Anexo adicionado.'); onChange(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  const remove = async (attachment: Attachment) => {
    try { await del(`/api/crm/attachments/${attachment.id}`); toast('Anexo removido.'); onChange(); } catch (cause) { setError(errorMessage(cause)); }
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      {error && !adding ? <Notice>{error}</Notice> : null}
      {items.length ? <div className="list">{items.map(item => (
        <div key={item.id} className="list-item">
          {item.kind === 'url' ? <Link2 size={16} aria-hidden="true" /> : <Paperclip size={16} aria-hidden="true" />}
          <div className="grow">
            {item.kind === 'url' ? <a className="title" href={item.ref!} target="_blank" rel="noopener noreferrer">{item.label ?? item.ref}</a>
              : item.kind === 'base-file' ? (item.ref ? <a className="title" href={`#/files?path=${encodeURIComponent(item.ref)}`}>{item.label ?? item.ref}</a> : <span className="title muted">Arquivo da Base (sem acesso)</span>)
                : item.file ? <a className="title" href={`/api/files/private/${item.file.id}`}>{item.label ?? item.file.name}</a> : <span className="title muted">Arquivo privado (sem acesso)</span>}
            <div className="sub">{item.kind === 'url' ? 'Link' : item.kind === 'base-file' ? 'Arquivo da Base' : 'Arquivo privado'} · {relative(item.createdAt)}</div>
          </div>
          {canWrite ? <IconButton label="Remover anexo" small onClick={() => remove(item)}><Trash2 size={15} /></IconButton> : null}
        </div>
      ))}</div> : <p className="muted">Sem anexos.</p>}
      {canWrite ? <div><Button size="sm" onClick={() => setAdding(true)}><Plus size={14} />Anexar</Button></div> : null}
      <Dialog open={adding} title="Anexar" onClose={() => setAdding(false)}
        footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button><Button variant="primary" busy={busy} disabled={!form.ref.trim()} onClick={save}>Anexar</Button></>}>
        <div className="form">
          {error ? <Notice>{error}</Notice> : null}
          <Field label="Tipo">
            <select className="select" value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value })}>
              <option value="url">Link (proposta, documento compartilhado)</option>
              <option value="base-file">Arquivo da Base (caminho)</option>
              <option value="private-file">Arquivo privado (identificador)</option>
            </select>
          </Field>
          <Field label={form.kind === 'url' ? 'Endereço' : form.kind === 'base-file' ? 'Caminho na Base' : 'Identificador do arquivo privado'} help={form.kind === 'private-file' ? 'Envie o arquivo em Arquivos → Privados e cole o identificador.' : form.kind === 'url' ? 'Links com senha ou token são recusados.' : undefined}>
            <input className="input" value={form.ref} onChange={event => setForm({ ...form, ref: event.target.value })} />
          </Field>
          <Field label="Nome (opcional)"><input className="input" value={form.label} maxLength={120} onChange={event => setForm({ ...form, label: event.target.value })} /></Field>
        </div>
      </Dialog>
    </div>
  );
}

/** Exclusão definitiva (LGPD): digita EXCLUIR, sem atalho. */
export function PurgeDialog({ open, type, id, name, onClose, onDone }: { open: boolean; type: EntityType; id: string; name: string; onClose: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true); setError('');
    try { await del(`/api/crm/${ENTITY_PATHS[type]}/${id}`, { confirm }); onDone(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} title="Excluir definitivamente" description={`Remove ${name}, o histórico e as etiquetas deste registro. Use para pedidos de exclusão de dados pessoais. Não há como desfazer.`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="danger" busy={busy} disabled={confirm !== 'EXCLUIR'} onClick={run}>Excluir definitivamente</Button></>}>
      <div className="form">
        {error ? <Notice>{error}</Notice> : null}
        <p className="muted">Para arquivar sem apagar, use “Arquivar”. Oportunidades ligadas continuam, sem a referência.</p>
        <Field label="Digite EXCLUIR para confirmar"><input className="input" value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="off" /></Field>
      </div>
    </Dialog>
  );
}

/** Mensagem de erro com a lista de campos que faltam (regras de etapa, campos obrigatórios). */
export function missingFrom(error: unknown): string[] {
  if (error instanceof ApiError && error.details && Array.isArray(error.details.missing)) return error.details.missing as string[];
  return [];
}

export const moneyInput = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : String(cents / 100));
export { money };
