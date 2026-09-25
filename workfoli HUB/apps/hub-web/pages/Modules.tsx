import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ModuleIcon } from '../components/Icon';
import { Button, Confirm, Dialog, Empty, Field, Loading, Notice, PageHead, useLoad, useToast } from '../components/ui';
import { del, errorMessage, get, patch, post } from '../lib/api';
import { can, formatDate } from '../lib/format';
import type { CustomField, CustomModule, ModuleInfo, Session } from '../lib/types';

interface RecordRow { id: string; data: Record<string, unknown>; createdAt: string; updatedAt: string; }

function display(field: CustomField | undefined, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field?.type === 'date' && typeof value === 'string') return formatDate(value);
  if (field?.type === 'checkbox') return value ? 'Sim' : 'Não';
  return String(value);
}

export function CustomModulePage({ id, session }: { id: string; session: Session }) {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => get<{ module: CustomModule; records: RecordRow[] }>(`/api/modules/${encodeURIComponent(id)}/records`), [id]);
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const [removing, setRemoving] = useState<RecordRow | null>(null);
  const [problem, setProblem] = useState('');
  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice>{error || 'Módulo indisponível.'}</Notice>;
  const { module } = data;
  const canWrite = can(session.user.permissions, `${module.id}:write`);
  const columns = module.listFields.map(fieldId => module.fields.find(field => field.id === fieldId)!).filter(Boolean);
  return (
    <>
      <PageHead eyebrow="Módulo da empresa" title={module.label} lead={module.description || undefined}
        actions={canWrite ? <Button variant="primary" onClick={() => setEditing('new')}><Plus size={16} />Novo {module.entityLabel.toLowerCase()}</Button> : undefined} />
      {problem ? <Notice>{problem}</Notice> : null}
      {data.records.length ? (
        <div className="table-wrap"><table className="table">
          <thead><tr>{columns.map(field => <th key={field.id}>{field.label}</th>)}<th className="hide-mobile">Atualizado</th></tr></thead>
          <tbody>{data.records.map(row => (
            <tr key={row.id} className={canWrite ? 'clickable' : undefined} onClick={() => canWrite && setEditing(row)}>
              {columns.map(field => <td key={field.id}>{display(field, row.data[field.id])}</td>)}
              <td className="faint hide-mobile">{formatDate(row.updatedAt)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <Empty icon={<ModuleIcon name={module.icon} size={20} />} title={`Nenhum ${module.entityLabel.toLowerCase()} ainda`} />}
      <RecordDialog module={module} value={editing} onClose={() => setEditing(null)} onDelete={row => { setEditing(null); setRemoving(row); }}
        onSaved={() => { setEditing(null); toast('Registro salvo.'); reload(); }} />
      <Confirm open={!!removing} title="Excluir registro?" message="O registro sai deste módulo. O histórico guarda a exclusão." confirmLabel="Excluir" onClose={() => setRemoving(null)}
        onConfirm={async () => { try { await del(`/api/modules/${module.id}/records/${removing!.id}`); setRemoving(null); toast('Registro excluído.'); reload(); } catch (cause) { setProblem(errorMessage(cause)); setRemoving(null); } }} />
    </>
  );
}

function RecordDialog({ module, value, onClose, onSaved, onDelete }: { module: CustomModule; value: RecordRow | 'new' | null; onClose: () => void; onSaved: () => void; onDelete: (row: RecordRow) => void }) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const initial = value && value !== 'new' ? value.data : {};
  const current = (fieldId: string) => (fieldId in form ? form[fieldId] : initial[fieldId]) ?? '';
  const close = () => { setForm({}); setError(''); onClose(); };
  const save = async () => {
    setBusy(true); setError('');
    const body = Object.fromEntries(module.fields.map(field => {
      const raw = current(field.id);
      return [field.id, field.type === 'checkbox' ? raw === true : field.type === 'number' && raw !== '' ? Number(raw) : raw === '' ? null : raw];
    }));
    try {
      if (value === 'new') await post(`/api/modules/${module.id}/records`, body); else if (value) await patch(`/api/modules/${module.id}/records/${value.id}`, body);
      setForm({}); onSaved();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!value} onClose={close} title={value === 'new' ? `Novo ${module.entityLabel.toLowerCase()}` : module.entityLabel}
      footer={<>{value && value !== 'new' ? <Button variant="danger" onClick={() => onDelete(value)}>Excluir</Button> : null}<span style={{ flex: 1 }} /><Button variant="ghost" onClick={close}>Cancelar</Button><Button variant="primary" busy={busy} onClick={save}>Salvar</Button></>}>
      <div className="form">
        {error ? <Notice>{error}</Notice> : null}
        {module.fields.map(field => (
          field.type === 'checkbox'
            ? <label key={field.id} className="checkbox"><input type="checkbox" checked={current(field.id) === true} onChange={event => setForm({ ...form, [field.id]: event.target.checked })} />{field.label}</label>
            : <Field key={field.id} label={`${field.label}${field.required ? ' *' : ''}`}>
              {field.type === 'textarea' ? <textarea className="textarea" rows={4} value={String(current(field.id))} onChange={event => setForm({ ...form, [field.id]: event.target.value })} />
                : field.type === 'select' ? <select className="select" value={String(current(field.id))} onChange={event => setForm({ ...form, [field.id]: event.target.value })}><option value="">—</option>{field.options?.map(option => <option key={option}>{option}</option>)}</select>
                  : <input className="input" type={field.type === 'phone' ? 'tel' : field.type} value={String(current(field.id))} onChange={event => setForm({ ...form, [field.id]: event.target.value })} />}
            </Field>
        ))}
      </div>
    </Dialog>
  );
}

export function PlannedModulePage({ module }: { module: ModuleInfo | undefined }) {
  if (!module) return <Empty title="Módulo não encontrado" />;
  return (
    <>
      <PageHead eyebrow="Planejado" title={module.label} lead={module.description} />
      <Empty icon={<ModuleIcon name={module.icon} size={20} />} title="Este módulo ainda não está disponível no Core">
        A Base desta empresa já indica que ele faz sentido. Ele será ativado por uma atualização do Core, sem recadastrar nada.
        Até lá, um administrador pode criar um módulo customizado simples (declarativo) na instalação do Hub.
      </Empty>
    </>
  );
}
