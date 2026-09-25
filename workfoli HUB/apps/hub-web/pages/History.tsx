import { useEffect, useState } from 'react';
import { Button, Empty, Loading, Notice, PageHead, Tag } from '../components/ui';
import { errorMessage, get } from '../lib/api';
import { actionLabel, formatDateTime } from '../lib/format';
import type { AuditEntry } from '../lib/types';

const FILTERS: Array<[string, string]> = [['', 'Tudo'], ['auth', 'Acessos'], ['task', 'Tarefas'], ['crm', 'CRM'], ['base', 'Base'], ['ai', 'IA'], ['user', 'Usuários'], ['files', 'Arquivos'], ['agent', 'Local Agent']];
const ACTOR: Record<string, string> = { system: 'Sistema', agent: 'Computador da Base' };

export function HistoryPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [prefix, setPrefix] = useState('');
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const [error, setError] = useState('');
  const load = async (reset: boolean) => {
    setLoading(true); setError('');
    try {
      const before = reset ? '' : `&before=${entries[entries.length - 1]?.id ?? ''}`;
      const data = await get<{ entries: AuditEntry[] }>(`/api/audit?limit=50${prefix ? `&prefix=${prefix}` : ''}${before}`);
      setEntries(current => reset ? data.entries : [...current, ...data.entries]);
      setMore(data.entries.length === 50);
    } catch (cause) { setError(errorMessage(cause)); } finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(true); }, [prefix]);
  return (
    <>
      <PageHead eyebrow="Ferramentas" title="Histórico" lead="Registro das ações desta instância: acessos, alterações, decisões da IA e sincronizações. Sem senhas, tokens ou conteúdos." />
      <div className="tabs" role="tablist">{FILTERS.map(([id, label]) => <button key={id || 'all'} role="tab" className="tab" aria-selected={prefix === id} onClick={() => setPrefix(id)}>{label}</button>)}</div>
      {error ? <Notice>{error}</Notice> : null}
      {entries.length ? (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th className="hide-mobile">Detalhe</th><th>Resultado</th></tr></thead>
          <tbody>{entries.map(entry => (
            <tr key={entry.id}>
              <td className="faint" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.at)}</td>
              <td>{entry.actorName ?? ACTOR[entry.actorType] ?? '—'}{entry.actorType === 'ai' ? <span className="faint"> · via IA</span> : null}</td>
              <td>{actionLabel(entry.action)}</td>
              <td className="faint hide-mobile" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.detail ? Object.entries(entry.detail).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`).join(' · ') : ''}</td>
              <td><Tag tone={entry.result === 'ok' ? undefined : 'outline'}>{entry.result === 'ok' ? 'ok' : entry.result === 'denied' ? 'negado' : 'erro'}</Tag></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : loading ? null : <Empty title="Nada registrado neste filtro" />}
      {loading ? <Loading /> : more && entries.length ? <Button onClick={() => load(false)} style={{ alignSelf: 'center' }}>Carregar mais</Button> : null}
    </>
  );
}
