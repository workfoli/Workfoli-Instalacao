import { useState } from 'react';
import { BookOpen, Check, X, ExternalLink, TriangleAlert, Undo2, Search, Pencil, LoaderCircle } from 'lucide-react';
import type { Evidence, KnowledgeItem, ReviewInput } from '../../../packages/contracts';
import { count, EmptyState, fieldLabel, StatusTag } from './ui';

interface Props {
  items: KnowledgeItem[];
  edits?: ReviewInput['knowledge'];
  onEdit?: (id: string, edit: { status: KnowledgeItem['status']; value?: string }) => void;
  onStatus?: (id: string, status: KnowledgeItem['status']) => void;
  onSave?: (id: string, status: KnowledgeItem['status'], value: string) => Promise<boolean>;
  onEvidence: (evidence: Evidence) => void;
  pendingId?: string | null;
}
const originLabels: Record<KnowledgeItem['origin'], string> = {
  explicit: 'Declarado na fonte', inferred: 'Inferência · requer revisão', user: 'Corrigido por você',
};
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');

export default function KnowledgeList({ items, edits, onEdit, onStatus, onSave, onEvidence, pendingId }: Props) {
  const [status, setStatus] = useState<KnowledgeItem['status'] | ''>('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const filtered = items.filter(item => (!status || (edits?.[item.id]?.status ?? item.status) === status)
    && (!query.trim() || normalize(`${fieldLabel(item.field)} ${item.field} ${edits?.[item.id]?.value ?? item.value} ${item.originalValue ?? ''} ${item.category} ${item.scope ?? ''} ${item.evidence.path} ${originLabels[item.origin]}`).includes(normalize(query.trim()))));
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  const safePage = Math.min(page, pages - 1);
  const saveValue = async (item: KnowledgeItem) => {
    if (!onSave || !draftValue.trim() || pendingId) return;
    if (await onSave(item.id, item.status, draftValue.trim())) setEditingId(null);
  };
  return <div className="knowledge-list">
    <div className="knowledge-toolbar"><label className="search-input"><Search size={17} /><input aria-label="Buscar conhecimento" placeholder="Buscar informação, contexto ou fonte" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label><select className="plain-select" aria-label="Filtrar revisão do conhecimento" value={status} onChange={e => { setStatus(e.target.value as KnowledgeItem['status'] | ''); setPage(0); }}><option value="">Todos os estados</option><option value="pending">A revisar</option><option value="confirmed">Confirmados</option><option value="rejected">Descartados</option></select><span className="muted small">{count(filtered.length)} informações</span></div>
    {!filtered.length ? <EmptyState icon={<BookOpen size={24} />} title={items.length ? 'Nenhuma informação neste filtro' : 'O conhecimento começa nas fontes'}>{items.length ? 'Altere o filtro para encontrar outras informações.' : 'Nenhuma afirmação estruturada foi identificada nesta origem. Os documentos preservados continuam disponíveis em Arquivos.'}</EmptyState> : <div className="knowledge-grid">{filtered.slice(safePage * 30, (safePage + 1) * 30).map(item => {
      const current = { status: edits?.[item.id]?.status ?? item.status, value: edits?.[item.id]?.value ?? item.value };
      const changedInReview = !!onEdit && current.value !== item.value;
      const originalValue = changedInReview ? item.originalValue ?? item.value : item.originalValue;
      const editing = editingId === item.id;
      const setItemStatus = (next: KnowledgeItem['status']) => onEdit ? onEdit(item.id, { ...current, status: next }) : onStatus?.(item.id, next);
      return <article key={item.id} className={`knowledge-card knowledge-${current.status}`} data-knowledge-id={item.id}>
        <div className="knowledge-card-top"><span className="eyebrow">{item.category}</span><StatusTag status={current.status} /></div>
        <div className="knowledge-title-row"><h3>{fieldLabel(item.field)}</h3>{onSave && !editing && <button className="small-button edit-knowledge" disabled={!!pendingId} onClick={() => { setEditingId(item.id); setDraftValue(current.value); }} aria-label={`Editar ${fieldLabel(item.field)}`}><Pencil size={13} /> Editar</button>}</div>
        {item.scope && <p className="knowledge-scope"><span>Contexto</span> {item.scope}</p>}
        {onEdit ? <textarea aria-label={`Valor: ${fieldLabel(item.field)}`} className="knowledge-value-edit" rows={Math.min(6, Math.max(2, Math.ceil(current.value.length / 65)))} value={current.value} maxLength={2000} onChange={e => onEdit(item.id, { ...current, value: e.target.value })} /> : editing ? <div className="knowledge-edit-form"><textarea autoFocus aria-label={`Editar valor: ${fieldLabel(item.field)}`} className="knowledge-value-edit" rows={Math.min(7, Math.max(3, Math.ceil(draftValue.length / 65)))} value={draftValue} maxLength={2000} disabled={!!pendingId} onChange={e => setDraftValue(e.target.value)} /><div className="edit-form-actions"><button className="small-button active-action" disabled={!!pendingId || !draftValue.trim()} onClick={() => { void saveValue(item); }}>{pendingId === item.id ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />} Salvar alteração</button><button className="small-button" disabled={!!pendingId} onClick={() => setEditingId(null)}>Cancelar</button></div><p className="edit-form-note">O estado de revisão será mantido. O valor original continuará registrado.</p></div> : <p className="knowledge-value">{current.value}</p>}
        <div className="knowledge-origin"><span>{changedInReview ? 'Correção nesta revisão' : originLabels[item.origin]}</span>{item.conflict && <span className="conflict-label"><TriangleAlert size={13} /> Possível conflito</span>}</div>
        {originalValue !== undefined && <details className="original-value"><summary>Valor original na fonte</summary><p>{originalValue}</p></details>}
        <button className="evidence-link" onClick={() => onEvidence(item.evidence)} title={item.evidence.path}><ExternalLink size={14} /><span>{item.evidence.path}{item.evidence.line ? item.evidence.endLine && item.evidence.endLine > item.evidence.line ? ` · linhas ${item.evidence.line}–${item.evidence.endLine}` : ` · linha ${item.evidence.line}` : ''}</span></button>
        {(onEdit || onStatus) && !editing && <div className="knowledge-actions"><button disabled={!!pendingId} className={`small-button ${current.status === 'confirmed' ? 'active-action' : ''}`} aria-pressed={current.status === 'confirmed'} onClick={() => setItemStatus('confirmed')}><Check size={14} /> Confirmar</button><button disabled={!!pendingId} className={`small-button ${current.status === 'rejected' ? 'rejected-action' : ''}`} aria-pressed={current.status === 'rejected'} onClick={() => setItemStatus('rejected')}><X size={14} /> Descartar</button>{current.status !== 'pending' && <button disabled={!!pendingId} className="icon-button reset-knowledge" title="Marcar para revisão" aria-label={`Reabrir revisão de ${fieldLabel(item.field)}`} onClick={() => setItemStatus('pending')}><Undo2 size={14} /></button>}{pendingId === item.id && <span className="small muted" role="status">Salvando…</span>}</div>}
      </article>;
    })}</div>}
    {pages > 1 && <div className="pagination"><span>{count(filtered.length)} informações</span><div><button className="small-button" disabled={!safePage} onClick={() => setPage(safePage - 1)}>Anterior</button><span>{safePage + 1} de {pages}</span><button className="small-button" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>Próxima</button></div></div>}
  </div>;
}
