import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Copy, Laptop, ShieldCheck } from 'lucide-react';
import { Button, Card, Field, IconButton, Loading, Notice, PageHead, Tag, useLoad, useToast } from '../components/ui';
import { errorMessage, get, post } from '../lib/api';
import { formatDateTime, relative } from '../lib/format';
import type { BaseStatus, Session } from '../lib/types';

interface SettingsData {
  instance: { id: string; company: { name: string; slug: string }; createdAt: string | null; core: string; currentCore: string };
  hub: { mode: 'local' | 'remote'; url: string; theme: string; ai: { provider: string; externalContext: boolean }; disabledModules: string[]; customModules: string[]; customErrors: Array<{ id: string; message: string }> };
  base: BaseStatus;
  devices: Array<{ id: string; name: string; createdAt: string; lastSeenAt: string | null; revoked: boolean }>;
  commands: Record<string, number>;
  pendingRoles: Array<{ id: string; change: 'new' | 'changed'; permissions: string[] }>;
  secrets: string[];
}

export function SettingsPage({ session, onSessionEnded }: { session: Session; onSessionEnded: () => void }) {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => get<SettingsData>('/api/settings'));
  const [code, setCode] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice>{error || 'Não foi possível carregar as configurações.'}</Notice>;
  const pair = async () => {
    try { const result = await post<{ code: string }>('/api/settings/pairing', { name: 'Computador da Base' }); setCode(result.code); } catch (cause) { setProblem(errorMessage(cause)); }
  };
  const revoke = async (id: string) => { try { await post(`/api/devices/${id}/revoke`); toast('Dispositivo revogado.'); reload(); } catch (cause) { setProblem(errorMessage(cause)); } };
  const applyRoles = async () => { try { const result = await post<{ applied: string[] }>('/api/settings/roles/apply'); toast(`Papéis aprovados: ${result.applied.join(', ')}`); reload(); } catch (cause) { setProblem(errorMessage(cause)); } };
  const pairCommand = code ? `workfoli agent pair "<pasta da instância>" --hub ${data.hub.url} --code ${code}` : '';
  return (
    <>
      <PageHead eyebrow="Administração" title="Configurações" lead="Instalação privada desta empresa: um Hub, uma Base, dados e credenciais próprios." />
      {problem ? <Notice>{problem}</Notice> : null}
      <div className="grid grid-2">
        <Card title="Instância">
          <dl className="stack small" style={{ margin: 0 }}>
            <Row label="Empresa" value={data.instance.company.name} />
            <Row label="Identificador" value={<code>{data.instance.id}</code>} />
            <Row label="Criada em" value={formatDateTime(data.instance.createdAt)} />
            <Row label="Core" value={<>{data.instance.core}{data.instance.core !== data.instance.currentCore ? <> <Tag tone="outline">atual {data.instance.currentCore}: rode workfoli update</Tag></> : null}</>} />
            <Row label="Endereço" value={data.hub.url} />
            <Row label="IA" value={data.hub.ai.provider === 'local' ? 'Assistente local (sem envio externo)' : `${data.hub.ai.provider}${data.hub.ai.externalContext ? ' · envio de contexto autorizado' : ''}`} />
          </dl>
        </Card>
        <Card title="Base" actions={<Tag tone={data.base.available ? 'accent' : 'outline'}><span className="pip" />{data.base.available ? 'disponível' : 'indisponível'}</Tag>}>
          <dl className="stack small" style={{ margin: 0 }}>
            <Row label="Modo" value={data.base.mode === 'local' ? 'Local: o Hub lê a Base neste computador' : 'Remoto: a Base chega pelo Local Agent'} />
            <Row label="Revisão" value={data.base.revision ? <code>{data.base.revision.slice(0, 12)}</code> : '—'} />
            <Row label="Atualizada" value={data.base.updatedAt ? relative(data.base.updatedAt) : '—'} />
            {data.base.message ? <Row label="Aviso" value={data.base.message} /> : null}
            {Object.keys(data.commands).length ? <Row label="Fila de alterações" value={Object.entries(data.commands).map(([status, count]) => `${status}: ${count}`).join(' · ')} /> : null}
          </dl>
        </Card>
      </div>
      {data.pendingRoles.length ? (
        <Card title="Papéis sugeridos pela Base" meta="A Base sugere; só o proprietário concede.">
          <div className="list">{data.pendingRoles.map(role => <div key={role.id} className="list-item"><div className="grow"><div className="title">{role.id} <span className="faint">({role.change === 'new' ? 'novo' : 'alterado'})</span></div><div className="sub" style={{ whiteSpace: 'normal' }}>{role.permissions.join(' · ')}</div></div></div>)}</div>
          {session.user.roleId === 'owner' ? <Button variant="primary" onClick={applyRoles} style={{ marginTop: 14 }}><ShieldCheck size={16} />Aprovar sugestões</Button> : <p className="faint">Aguardando aprovação do proprietário.</p>}
        </Card>
      ) : null}
      <Card title="Local Agent" meta="Ponte segura entre a Base no computador e este Hub. Conexão sempre de saída, revogável.">
        <div className="stack">
          {data.devices.length ? <div className="list">{data.devices.map(device => (
            <div key={device.id} className="list-item"><Laptop size={18} className="muted" /><div className="grow"><div className="title">{device.name}</div><div className="sub">Pareado {formatDateTime(device.createdAt)} · visto {relative(device.lastSeenAt)}</div></div>{device.revoked ? <Tag tone="outline">revogado</Tag> : <Button size="sm" variant="danger" onClick={() => revoke(device.id)}>Revogar</Button>}</div>
          ))}</div> : <p className="muted">{data.hub.mode === 'local' ? 'Neste modo o Hub lê a Base diretamente; o Local Agent é necessário quando o Hub estiver hospedado fora deste computador.' : 'Nenhum computador pareado ainda.'}</p>}
          <div className="row"><Button onClick={pair}>Gerar código de pareamento</Button><span className="faint">Uso único, válido por 1 hora.</span></div>
          {code ? (
            <div className="stack" style={{ gap: 6 }}>
              <div className="row"><input className="input" readOnly value={pairCommand} style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 12.5 }} onFocus={event => event.target.select()} aria-label="Comando de pareamento" /><IconButton label="Copiar" onClick={() => void navigator.clipboard?.writeText(pairCommand).then(() => toast('Comando copiado.'))}><Copy size={16} /></IconButton></div>
              <span className="faint">Rode no computador onde a Base está.</span>
            </div>
          ) : null}
        </div>
      </Card>
      <div className="grid grid-2">
        <Card title="Credenciais configuradas" meta="Somente nomes; valores nunca saem do servidor">
          {data.secrets.length ? <div className="row">{data.secrets.map(name => <Tag key={name}><code>{name}</code></Tag>)}</div> : <p className="muted">Nenhuma credencial gravada. Use <code>workfoli secrets set</code>.</p>}
          {data.hub.customErrors.length ? <Notice>{data.hub.customErrors.map(item => `${item.id}: ${item.message}`).join(' · ')}</Notice> : null}
        </Card>
        <PasswordCard onChanged={onSessionEnded} />
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return <div className="row" style={{ justifyContent: 'space-between', gap: 16, flexWrap: 'nowrap' }}><dt className="faint">{label}</dt><dd style={{ margin: 0, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{value}</dd></div>;
}

function PasswordCard({ onChanged }: { onChanged: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try { await post('/api/auth/password', { current, next }); onChanged(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return (
    <Card title="Sua senha" meta="Trocar a senha encerra todas as suas sessões">
      <form className="form" onSubmit={submit}>
        {error ? <Notice>{error}</Notice> : null}
        <Field label="Senha atual"><input className="input" type="password" autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} required /></Field>
        <Field label="Nova senha" help="Pelo menos 10 caracteres."><input className="input" type="password" autoComplete="new-password" value={next} onChange={event => setNext(event.target.value)} required minLength={10} /></Field>
        <Button type="submit" busy={busy}>Trocar senha</Button>
      </form>
    </Card>
  );
}
