import { useEffect, useState } from 'react';
import { ArrowRight, Building2, Check, Download, Layers3, LoaderCircle, ShieldCheck, UserRound, Users, X } from 'lucide-react';
import type { ContextSnapshot, EnvironmentProfile, WorkfoliApi, WorkspaceData, WorkspaceSummary } from '../../../packages/contracts';
import { count, EmptyState, ErrorNotice, errorText, fieldLabel, Loading } from './ui';
import { useDialog } from './useDialog';

export function EnvironmentDialog({ api, environment, onClose, onSaved, onBackup }: { api: WorkfoliApi; environment: EnvironmentProfile | null; onClose: () => void; onSaved: (profile: EnvironmentProfile) => void; onBackup: () => void }) {
  const [companyName, setCompanyName] = useState(environment?.company.name ?? '');
  const [userName, setUserName] = useState(environment?.user.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const close = () => { if (environment && !saving) onClose(); };
  const ref = useDialog(close);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !companyName.trim() || !userName.trim()) return;
    setSaving(true); setError('');
    try { onSaved(await api.saveEnvironment({ companyName: companyName.trim(), userName: userName.trim() })); }
    catch (cause) { setError(errorText(cause)); setSaving(false); }
  }
  return <div className="modal-backdrop environment-backdrop"><form onSubmit={event => { void save(event); }}><div ref={ref} className="about-dialog environment-dialog" role="dialog" aria-modal="true" aria-labelledby="environment-title" tabIndex={-1}>
    <div className="dialog-header"><div><span className="eyebrow">{environment ? 'IDENTIDADE DO SEU ESPAÇO' : 'Bem-vindo ao Workfoli'}</span><h2 id="environment-title">{environment ? 'Empresa e usuário' : 'Primeiro, o seu contexto.'}</h2></div>{environment && <button type="button" className="icon-button" disabled={saving} aria-label="Fechar identidade" onClick={close}><X size={20} /></button>}</div>
    <div className="dialog-body"><p className="environment-intro">Sua empresa é o centro deste espaço. Os clientes terão seus próprios arquivos e conhecimento, separados do seu negócio.</p>{error && <ErrorNotice>{error}</ErrorNotice>}<label className="environment-field"><span><Building2 size={16} /> Nome da sua empresa</span><input data-testid="environment-company" value={companyName} onChange={event => setCompanyName(event.target.value)} maxLength={120} required disabled={saving} autoComplete="organization" placeholder="Como se chama o seu negócio?" /></label><label className="environment-field"><span><UserRound size={16} /> Seu nome</span><input data-testid="environment-user" value={userName} onChange={event => setUserName(event.target.value)} maxLength={120} required disabled={saving} autoComplete="name" placeholder="Como podemos chamar você?" /></label><div className="environment-hierarchy"><span><UserRound size={15} /> Você</span><ArrowRight size={14} /><span><Building2 size={15} /> Sua empresa</span><ArrowRight size={14} /><span><Users size={15} /> Clientes</span></div><p className="small muted">Você pode organizar sua empresa agora e importar os arquivos depois.</p></div>
    <div className="dialog-footer">{environment ? <span className="small muted">Identificação local, sem login de equipe.</span> : <button type="button" className="text-button" disabled={saving} onClick={onBackup}>Restaurar um backup</button>}<button data-testid="save-environment" type="submit" className="primary-button" disabled={saving || !companyName.trim() || !userName.trim()}>{saving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{saving ? 'Salvando…' : environment ? 'Salvar identidade' : 'Criar meu espaço'}</button></div>
  </div></form></div>;
}

export function CompanyHome({ environment, onImport, onContext }: { environment: EnvironmentProfile; onImport: () => void; onContext: () => void }) {
  return <><div className="page-heading"><div><span className="eyebrow">MINHA EMPRESA</span><h1>{environment.company.name}<span className="heading-dot">.</span></h1><p>O contexto do seu negócio começa aqui, {environment.user.name}.</p></div><button className="secondary-button" onClick={onContext}><Layers3 size={16} /> Ver contexto</button></div><section className="company-welcome content-panel"><div className="company-welcome-icon"><Building2 size={34} strokeWidth={1.4} /></div><span className="eyebrow">SEU NEGÓCIO, EM PRIMEIRO LUGAR</span><h2>Um espaço próprio para sua empresa.</h2><p>Importe a identidade, os documentos e os projetos de {environment.company.name}. Na revisão, escolha “Esta é a minha empresa” para vincular os arquivos a este espaço.</p><button data-testid="import-company" className="primary-button" onClick={onImport}>Importar arquivos da minha empresa <ArrowRight size={16} /></button><div className="company-separation"><ShieldCheck size={17} /><span>Os arquivos dos clientes ficam separados, na área Clientes.</span></div></section></>;
}

export function RelationshipDialog({ api, workspace, companyWorkspace, onClose, onComplete }: { api: WorkfoliApi; workspace: WorkspaceSummary; companyWorkspace?: WorkspaceSummary; onClose: () => void; onComplete: (result: WorkspaceData) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toCompany = workspace.relationship !== 'company';
  const blocked = toCompany && !!companyWorkspace && companyWorkspace.id !== workspace.id;
  const close = () => { if (!busy) onClose(); };
  const ref = useDialog(close);
  async function apply() {
    if (busy || blocked) return;
    setBusy(true); setError('');
    try { onComplete(await api.setWorkspaceRelationship(workspace.id, toCompany ? 'company' : 'client')); }
    catch (cause) { setError(errorText(cause)); setBusy(false); }
  }
  return <div className="modal-backdrop"><div ref={ref} className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="relationship-title" tabIndex={-1}><div className="dialog-header"><div><span className="eyebrow">VÍNCULO DO WORKSPACE</span><h2 id="relationship-title">{toCompany ? 'Usar como minha empresa' : 'Transformar em cliente'}</h2></div><button className="icon-button" disabled={busy} aria-label="Fechar alteração de vínculo" onClick={close}><X size={20} /></button></div><div className="dialog-body">{error && <ErrorNotice>{error}</ErrorNotice>}<p><strong>{workspace.name}</strong> {toCompany ? 'passará a ser sua empresa principal e sairá da lista de clientes. O nome da empresa principal será atualizado para este nome.' : 'passará a aparecer na lista de clientes. Sua identidade de empresa continuará cadastrada, sem um workspace de arquivos vinculado.'}</p><p>Os arquivos, os projetos e as decisões de conhecimento deste workspace serão mantidos.</p>{blocked && <div className="notice relationship-notice"><Building2 size={18} /><span><strong>{companyWorkspace.name}</strong> já é sua empresa principal. Para usar outro workspace, primeiro transforme o atual em cliente.</span></div>}</div><div className="dialog-footer"><button className="secondary-button" disabled={busy} onClick={close}>Cancelar</button><button data-testid="confirm-relationship" className="primary-button" disabled={busy || blocked} onClick={() => { void apply(); }}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{busy ? 'Salvando…' : 'Confirmar alteração'}</button></div></div></div>;
}

export function ContextDialog({ api, scope, workspaceId, onClose }: { api: WorkfoliApi; scope: ContextSnapshot['scope']; workspaceId?: string; onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<ContextSnapshot | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const ref = useDialog(onClose);
  useEffect(() => {
    let active = true; setSnapshot(null); setError('');
    void api.getContext({ scope, ...(workspaceId ? { workspaceId } : {}) }).then(result => { if (active) setSnapshot(result); }).catch(cause => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [api, scope, workspaceId, attempt]);
  const labels = { company: 'Contexto da minha empresa', portfolio: 'Contexto da carteira', workspace: 'Contexto deste workspace' };
  const descriptions = { company: 'Identidade da sua empresa e conhecimento do workspace principal.', portfolio: 'Uma visão explícita da sua empresa e dos clientes, com as fontes separadas por negócio.', workspace: 'Somente o workspace aberto. O conhecimento dos outros clientes não faz parte deste escopo.' };
  const groups = snapshot ? [...(snapshot.company.workspace ? [{ workspace: snapshot.company.workspace, knowledge: snapshot.company.knowledge }] : []), ...snapshot.clients].filter(group => scope !== 'workspace' || group.workspace.id === workspaceId) : [];
  return <div className="modal-backdrop"><div ref={ref} className="import-dialog context-dialog" role="dialog" aria-modal="true" aria-labelledby="context-title" tabIndex={-1}><div className="dialog-header"><div><span className="eyebrow">ESCOPO DE CONSULTA</span><h2 id="context-title">{labels[scope]}</h2></div><button className="icon-button" aria-label="Fechar contexto" onClick={onClose}><X size={20} /></button></div><div className="dialog-body"><p>{descriptions[scope]}</p><div className="context-boundary"><ShieldCheck size={18} /><span>Esta é uma consulta local do contexto disponível. Nenhuma mensagem é enviada a uma IA.</span></div>{error ? <ErrorNotice retry={() => setAttempt(value => value + 1)}>{error}</ErrorNotice> : !snapshot ? <Loading text="Preparando contexto deste escopo…" /> : <><div className="context-identity"><span><UserRound size={15} /> {snapshot.environment.user.name}</span><span><Building2 size={15} /> {snapshot.environment.company.name}</span></div>{groups.length ? groups.map(group => <section className="context-group" key={group.workspace.id}><div><h3>{group.workspace.name}</h3><span className="tag">{group.workspace.relationship === 'company' ? 'Minha empresa' : 'Cliente'}</span></div><p>{count(group.knowledge.length)} informações disponíveis neste escopo</p>{group.knowledge.length ? <ul>{group.knowledge.slice(0, 30).map(item => <li key={item.id}><strong>{fieldLabel(item.field)}</strong><span>{item.value}</span><small>{item.evidence.path}</small></li>)}</ul> : <p className="muted">Nenhuma informação disponível para este contexto.</p>}{group.knowledge.length > 30 && <p className="small muted">Exibindo 30 de {count(group.knowledge.length)} informações. Consulte o conhecimento do workspace para ver todas.</p>}</section>) : <EmptyState icon={<Layers3 size={24} />} title="O contexto começa pela identidade">Importe os arquivos da empresa ou dos clientes para adicionar conhecimento a este escopo.</EmptyState>}<p className="small muted">Consulta gerada em {new Date(snapshot.generatedAt).toLocaleString('pt-BR')}.</p></>}</div><div className="dialog-footer"><span className="small muted">Conteúdo organizado por origem.</span><button className="secondary-button" onClick={onClose}>Fechar</button></div></div></div>;
}

export function ExportDialog({ api, workspace, onClose, onComplete }: { api: WorkfoliApi; workspace: WorkspaceSummary; onClose: () => void; onComplete: (result: { name: string; files: number; excluded: number }) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = () => { if (!busy) onClose(); };
  const ref = useDialog(close);
  async function exportPackage() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await api.exportWorkspace(workspace.id);
      if (result) onComplete(result);
      else setBusy(false);
    } catch (cause) { setError(errorText(cause)); setBusy(false); }
  }
  return <div className="modal-backdrop"><div ref={ref} className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" tabIndex={-1}><div className="dialog-header"><div><span className="eyebrow">PACOTE PORTÁTIL</span><h2 id="export-title">Exportar {workspace.name}</h2></div><button className="icon-button" disabled={busy} aria-label="Fechar exportação" onClick={close}><X size={20} /></button></div><div className="dialog-body">{error && <ErrorNotice>{error}</ErrorNotice>}<p>O ZIP reúne os arquivos permitidos deste workspace e seu conhecimento para uma nova importação.</p><div className="context-boundary"><ShieldCheck size={18} /><span>Ficam fora do pacote: arquivos restritos ou bloqueados, sistema legado, dependências, histórico Git, builds e o ZIP original. Esta é uma exportação selecionada, não um backup integral.</span></div><p>Ao importar o pacote em outro espaço, você poderá escolher se ele representa sua empresa ou um cliente.</p><p className="small muted">Na próxima etapa, escolha onde salvar o ZIP.</p></div><div className="dialog-footer"><button className="secondary-button" disabled={busy} onClick={close}>Cancelar</button><button data-testid="confirm-export" className="primary-button" disabled={busy} onClick={() => { void exportPackage(); }}>{busy ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}{busy ? 'Exportando…' : 'Escolher destino e exportar'}</button></div></div></div>;
}
