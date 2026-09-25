import { useState } from 'react';
import { Copy, Link2, Plus, UserPlus } from 'lucide-react';
import { Button, Card, Confirm, Dialog, Field, IconButton, Loading, Notice, PageHead, Tag, useLoad, useToast } from '../components/ui';
import { errorMessage, get, patch, post, del } from '../lib/api';
import { relative, ROLE_LABELS } from '../lib/format';
import type { RoleView, Session, UserView } from '../lib/types';

const SCOPES: Array<[string, string]> = [['overview', 'Visão geral'], ['company', 'Empresa'], ['knowledge', 'Conhecimento'], ['projects', 'Projetos'], ['files', 'Arquivos'], ['tasks', 'Tarefas'], ['crm', 'CRM'], ['integrations', 'Integrações'], ['audit', 'Histórico']];
const STATUS: Record<string, string> = { active: 'Ativo', pending: 'Convite pendente', disabled: 'Desativado' };

function copy(text: string, toast: (text: string) => void) {
  void navigator.clipboard?.writeText(text).then(() => toast('Link copiado.'), () => toast('Copie o link manualmente.'));
}

export function UsersPage({ session }: { session: Session }) {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => get<{ users: UserView[]; roles: RoleView[] }>('/api/users'));
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [problem, setProblem] = useState('');
  const [removingRole, setRemovingRole] = useState<RoleView | null>(null);
  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice>{error || 'Não foi possível carregar os usuários.'}</Notice>;
  const isOwner = session.user.roleId === 'owner';
  const update = async (user: UserView, body: Record<string, string>) => {
    setProblem('');
    try { await patch(`/api/users/${user.id}`, body); toast('Usuário atualizado.'); reload(); } catch (cause) { setProblem(errorMessage(cause)); }
  };
  const reissue = async (user: UserView) => {
    try { const result = await post<{ activationPath: string }>(`/api/users/${user.id}/activation`); setLink({ name: user.name, url: `${window.location.origin}${result.activationPath}` }); }
    catch (cause) { setProblem(errorMessage(cause)); }
  };
  const roleName = (id: string) => data.roles.find(role => role.id === id)?.name ?? ROLE_LABELS[id] ?? id;
  return (
    <>
      <PageHead eyebrow="Administração" title="Usuários e permissões" lead="Cada pessoa tem a própria conta. O papel define módulos, leitura, escrita, ações da IA e administração — conferidos pelo servidor em toda requisição."
        actions={<Button variant="primary" onClick={() => setInviting(true)}><UserPlus size={16} />Convidar</Button>} />
      {problem ? <Notice>{problem}</Notice> : null}
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Pessoa</th><th>Papel</th><th>Situação</th><th className="hide-mobile">Último acesso</th><th /></tr></thead>
        <tbody>{data.users.map(user => {
          const self = user.id === session.user.id;
          const ownerLocked = user.roleId === 'owner' && !isOwner;
          return (
            <tr key={user.id}>
              <td><div style={{ fontWeight: 620 }}>{user.name}{self ? <span className="faint"> (você)</span> : null}</div><div className="faint">{user.email ?? 'e-mail definido na ativação'}</div></td>
              <td>
                {self || ownerLocked ? roleName(user.roleId) : (
                  <select className="select" style={{ minHeight: 34, maxWidth: 200 }} value={user.roleId} onChange={event => update(user, { roleId: event.target.value })} aria-label={`Papel de ${user.name}`}>
                    {data.roles.filter(role => isOwner || role.id !== 'owner').map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                )}
              </td>
              <td><Tag tone={user.status === 'active' ? 'accent' : 'outline'}>{STATUS[user.status]}</Tag></td>
              <td className="faint hide-mobile">{user.lastLoginAt ? relative(user.lastLoginAt) : '—'}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {user.status === 'pending' && !ownerLocked ? <Button size="sm" variant="ghost" onClick={() => reissue(user)}><Link2 size={14} />Novo link</Button> : null}
                {!self && !ownerLocked && user.status !== 'pending' ? <Button size="sm" variant="ghost" onClick={() => update(user, { status: user.status === 'active' ? 'disabled' : 'active' })}>{user.status === 'active' ? 'Desativar' : 'Reativar'}</Button> : null}
              </td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <Card title="Papéis" meta="Core: fixos · Base: sugeridos pela Base e aprovados pelo proprietário · Personalizados: criados aqui" actions={<Button size="sm" onClick={() => setRoleOpen(true)}><Plus size={14} />Novo papel</Button>}>
        <div className="list">{data.roles.map(role => (
          <div key={role.id} className="list-item" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div className="row"><span className="title">{role.name}</span><Tag tone="outline">{role.source === 'core' ? 'Core' : role.source === 'base' ? 'Base' : 'Personalizado'}</Tag><span className="faint">{role.users} pessoa(s)</span></div>
              <div className="sub" style={{ whiteSpace: 'normal' }}>{role.permissions.includes('*') ? 'Acesso total' : role.permissions.join(' · ')}</div>
            </div>
            {role.source !== 'core' && !role.users ? <Button size="sm" variant="ghost" onClick={() => setRemovingRole(role)}>Remover</Button> : null}
          </div>
        ))}</div>
      </Card>
      <InviteDialog open={inviting} roles={data.roles.filter(role => isOwner || role.id !== 'owner')} onClose={() => setInviting(false)} onDone={(name, url) => { setInviting(false); setLink({ name, url }); reload(); }} />
      <Dialog open={!!link} onClose={() => setLink(null)} title={`Link de ativação — ${link?.name ?? ''}`} description="Envie por um canal privado. Vale uma única vez e expira em 72 horas; não fica salvo no Hub."
        footer={<Button variant="primary" onClick={() => setLink(null)}>Concluir</Button>}>
        <div className="row"><input className="input" readOnly value={link?.url ?? ''} style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 12.5 }} onFocus={event => event.target.select()} aria-label="Link de ativação" /><IconButton label="Copiar" onClick={() => link && copy(link.url, toast)}><Copy size={16} /></IconButton></div>
      </Dialog>
      <RoleDialog open={roleOpen} onClose={() => setRoleOpen(false)} onDone={() => { setRoleOpen(false); reload(); }} />
      <Confirm open={!!removingRole} title="Remover papel?" message={`O papel "${removingRole?.name ?? ''}" deixa de existir nesta instância.`} confirmLabel="Remover" onClose={() => setRemovingRole(null)}
        onConfirm={async () => { try { await del(`/api/roles/${removingRole!.id}`); toast('Papel removido.'); setRemovingRole(null); reload(); } catch (cause) { setProblem(errorMessage(cause)); setRemovingRole(null); } }} />
    </>
  );
}

function InviteDialog({ open, roles, onClose, onDone }: { open: boolean; roles: RoleView[]; onClose: () => void; onDone: (name: string, url: string) => void }) {
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const result = await post<{ user: UserView; activationPath: string }>('/api/users', { name, roleId });
      setName(''); onDone(result.user.name, `${window.location.origin}${result.activationPath}`);
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Convidar pessoa" description="A pessoa define o próprio e-mail e senha pelo link de ativação."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" busy={busy} disabled={!name.trim()} onClick={submit}>Gerar convite</Button></>}>
      <div className="form">
        {error ? <Notice>{error}</Notice> : null}
        <Field label="Nome"><input className="input" value={name} onChange={event => setName(event.target.value)} maxLength={120} /></Field>
        <Field label="Papel"><select className="select" value={roleId} onChange={event => setRoleId(event.target.value)}>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>
      </div>
    </Dialog>
  );
}

function RoleDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<string[]>(['overview:read']);
  const [ai, setAi] = useState<'none' | 'use' | 'act'>('use');
  const [privateFiles, setPrivateFiles] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const levelOf = (scope: string) => permissions.find(permission => permission.startsWith(`${scope}:`))?.split(':')[1] ?? 'none';
  const setLevel = (scope: string, level: string) => setPermissions(current => [...current.filter(permission => !permission.startsWith(`${scope}:`)), ...(level === 'none' ? [] : [`${scope}:${level}`])]);
  const submit = async () => {
    setBusy(true); setError('');
    const all = [...permissions, ...(ai === 'none' ? [] : ai === 'use' ? ['ai:use'] : ['ai:use', 'ai:act']), ...(privateFiles ? ['files:private'] : [])];
    try { await post('/api/roles', { name, permissions: all }); setName(''); onDone(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} wide title="Novo papel" description="Permissões por módulo. Administração de usuários e configurações fica com Proprietário e Administrador."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" busy={busy} disabled={!name.trim()} onClick={submit}>Salvar papel</Button></>}>
      <div className="form">
        {error ? <Notice>{error}</Notice> : null}
        <Field label="Nome do papel"><input className="input" value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Secretaria, Marketing" maxLength={60} /></Field>
        <div className="table-wrap"><table className="table"><thead><tr><th>Módulo</th><th>Sem acesso</th><th>Ver</th><th>Editar</th></tr></thead><tbody>
          {SCOPES.map(([scope, label]) => (
            <tr key={scope}><td>{label}</td>{['none', 'read', 'write'].map(level => <td key={level}><input type="radio" name={`p-${scope}`} checked={levelOf(scope) === level} onChange={() => setLevel(scope, level)} aria-label={`${label}: ${level}`} /></td>)}</tr>
          ))}
        </tbody></table></div>
        <div className="form-row">
          <Field label="IA"><select className="select" value={ai} onChange={event => setAi(event.target.value as typeof ai)}><option value="none">Sem acesso</option><option value="use">Consultar</option><option value="act">Consultar e propor ações</option></select></Field>
          <label className="checkbox" style={{ alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" checked={privateFiles} onChange={event => setPrivateFiles(event.target.checked)} />Arquivos privados</label>
        </div>
        <p className="faint">A IA nunca vê nem faz mais do que o papel permite: ações propostas ainda exigem a permissão do módulo.</p>
      </div>
    </Dialog>
  );
}
