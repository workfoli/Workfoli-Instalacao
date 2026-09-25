import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronRight, Files, FolderClosed, FolderOpen, LayoutDashboard, Plus, Search, ShieldCheck, Users, X, Globe2, Code2, Boxes, ExternalLink, CircleHelp, Monitor, RefreshCw, Building2, UserRound, Layers3, Download, Settings2 } from 'lucide-react';
import type { ContextSnapshot, EnvironmentProfile, Evidence, FileEntry, KnowledgeItem, Project, WorkspaceData, WorkspaceSummary } from '../../../packages/contracts';
import ImportWizard from './ImportWizard';
import FileTable from './FileTable';
import KnowledgeList from './KnowledgeList';
import PreviewDialog from './PreviewDialog';
import ReanalysisDialog from './ReanalysisDialog';
import BackupDialog from './BackupDialog';
import BaseSummary from './BaseSummary';
import { CompanyHome, ContextDialog, EnvironmentDialog, ExportDialog, RelationshipDialog } from './EnvironmentViews';
import { bytes, count, date, EmptyState, ErrorNotice, errorText, initials, Loading, PrivacyNote } from './ui';
import { useDialog } from './useDialog';
import workfoliSymbol from './assets/workfoli-simbolo.png';

type View = 'overview' | 'files' | 'knowledge' | 'projects';
const viewLabels: Record<View, string> = { overview: 'Visão geral', files: 'Arquivos', knowledge: 'Conhecimento', projects: 'Projetos' };
const viewIcons = { overview: LayoutDashboard, files: Files, knowledge: BookOpen, projects: FolderClosed };
const api = window.workfoli;

export default function App() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [environment, setEnvironment] = useState<EnvironmentProfile | null>(null);
  const [environmentReady, setEnvironmentReady] = useState(false);
  const [section, setSection] = useState<'company' | 'clients'>('company');
  const [editEnvironment, setEditEnvironment] = useState(false);
  const [showRelationship, setShowRelationship] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [contextScope, setContextScope] = useState<ContextSnapshot['scope'] | null>(null);
  const [notice, setNotice] = useState('');
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>('overview');
  const [loading, setLoading] = useState(!!api);
  const [loadingClient, setLoadingClient] = useState(false);
  const [error, setError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [preview, setPreview] = useState<{ file: FileEntry; workspaceId: string; evidence?: Evidence } | null>(null);
  const [showReanalysis, setShowReanalysis] = useState(false);
  const [pendingKnowledge, setPendingKnowledge] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [backupMode, setBackupMode] = useState<'create' | 'restore' | null>(null);
  const [appInfo, setAppInfo] = useState<{ version: string; dataDirectory: string } | null>(null);
  const workspaceRequest = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const listRequest = useRef(0);

  const refreshClients = useCallback(async () => {
    if (!api) return;
    const request = ++listRequest.current;
    setLoading(true); setError('');
    try { const [result, profile] = await Promise.all([api.listWorkspaces(), api.getEnvironment()]); if (request === listRequest.current) { setWorkspaces(result); setEnvironment(profile); setEnvironmentReady(true); } }
    catch (cause) { if (request === listRequest.current) setError(errorText(cause)); }
    finally { if (request === listRequest.current) setLoading(false); }
  }, []);
  useEffect(() => { void refreshClients(); if (api) void api.appInfo().then(setAppInfo).catch(() => {}); return () => { listRequest.current += 1; }; }, [refreshClients]);

  const openClient = useCallback(async (id: string) => {
    if (!api) return;
    const request = ++workspaceRequest.current;
    selectedRef.current = id; setSelectedId(id); setData(null); setView('overview'); setError(''); setPreview(null); setShowReanalysis(false); setShowRelationship(false); setShowExport(false); setContextScope(null); setNotice(''); setPendingKnowledge(null); setLoadingClient(true);
    try { const result = await api.getWorkspace(id); if (request === workspaceRequest.current) { setData(result); setSection(result.workspace.relationship === 'company' ? 'company' : 'clients'); } }
    catch (cause) { if (request === workspaceRequest.current) setError(errorText(cause)); }
    finally { if (request === workspaceRequest.current) setLoadingClient(false); }
  }, []);
  const goHome = useCallback(() => {
    setSection('clients'); setContextScope(null); setShowRelationship(false); setShowExport(false); setNotice('');
    workspaceRequest.current += 1; selectedRef.current = null; setSelectedId(null); setData(null); setError(''); setPreview(null); setShowReanalysis(false); setLoadingClient(false); setPendingKnowledge(null);
  }, []);
  const openCompany = () => {
    const company = workspaces.find(item => item.relationship === 'company');
    if (company) { void openClient(company.id); }
    else { goHome(); setSection('company'); }
  };
  const imported = useCallback((result: WorkspaceData) => {
    workspaceRequest.current += 1; listRequest.current += 1; selectedRef.current = result.workspace.id;
    setWorkspaces(old => [result.workspace, ...old.filter(item => item.id !== result.workspace.id)]);
    setSection(result.workspace.relationship === 'company' ? 'company' : 'clients'); setShowRelationship(false);
    void api?.getEnvironment().then(setEnvironment).catch(cause => setError(errorText(cause)));
    setSelectedId(result.workspace.id); setData(result); setView('overview'); setShowImport(false); setError(''); setLoading(false); setLoadingClient(false);
  }, []);
  async function updateKnowledge(id: string, status: KnowledgeItem['status'], value?: string): Promise<boolean> {
    if (!api || !data || pendingKnowledge) return false;
    const workspaceId = data.workspace.id; const currentRequest = workspaceRequest.current;
    setPendingKnowledge(id); setError('');
    try {
      const result = await api.updateKnowledge(workspaceId, id, status, value);
      if (selectedRef.current === workspaceId && workspaceRequest.current === currentRequest) {
        setData(result); setWorkspaces(old => old.map(item => item.id === workspaceId ? result.workspace : item));
        return true;
      }
    } catch (cause) { if (selectedRef.current === workspaceId && workspaceRequest.current === currentRequest) setError(errorText(cause)); }
    finally { if (selectedRef.current === workspaceId && workspaceRequest.current === currentRequest) setPendingKnowledge(null); }
    return false;
  }
  const showEvidence = (source: Evidence | string) => {
    const fileId = typeof source === 'string' ? source : source.fileId;
    const file = data?.report.files.find(item => item.id === fileId);
    if (file && data) setPreview({ file, workspaceId: data.workspace.id, evidence: typeof source === 'string' ? undefined : source });
    else setError('O arquivo de origem desta informação não está disponível no inventário.');
  };
  const searchFiles = useMemo(() => data && api ? (query: string) => api.searchFiles(data.workspace.id, query) : undefined, [data?.workspace.id]);
  const clients = workspaces.filter(item => item.relationship !== 'company');
  const companyWorkspace = workspaces.find(item => item.relationship === 'company');
  const selectedSummary = data?.workspace ?? workspaces.find(item => item.id === selectedId);
  const filteredClients = clients.filter(item => item.name.toLocaleLowerCase('pt-BR').includes(clientQuery.toLocaleLowerCase('pt-BR')));
  const pendingCount = data?.report.knowledge.filter(item => item.status === 'pending').length ?? 0;

  useEffect(() => {
    if (environmentReady && section === 'company' && !selectedId && companyWorkspace && !loadingClient) void openClient(companyWorkspace.id);
  }, [environmentReady, section, selectedId, companyWorkspace?.id, loadingClient, openClient]);

  return <div className="app-shell">
    <aside className="app-rail" aria-label="Navegação principal"><button className="brand-mark" onClick={goHome} aria-label="Workfoli — início"><img src={workfoliSymbol} alt="" /></button><div className="rail-divider" /><button className={`rail-button ${section === 'company' ? 'active' : ''}`} title="Minha empresa" aria-label="Minha empresa" onClick={openCompany}><Building2 size={21} /></button><button className={`rail-button ${!selectedId && section === 'clients' ? 'active' : ''}`} title="Todos os clientes" aria-label="Todos os clientes" onClick={goHome}><Users size={21} /></button><div className="rail-clients">{clients.slice(0, 7).map(client => <button key={client.id} className={`client-avatar rail-avatar ${selectedId === client.id ? 'selected' : ''}`} title={client.name} aria-label={`Abrir ${client.name}`} aria-current={selectedId === client.id ? 'page' : undefined} onClick={() => { void openClient(client.id); }}>{initials(client.name)}</button>)}</div><button data-testid="rail-new-client" className="rail-button add-client" title="Novo cliente" aria-label="Novo cliente" disabled={!api || !environment} onClick={() => setShowImport(true)}><Plus size={22} /></button><div className="rail-bottom"><span className="local-indicator" title="Dados locais" /><button className="rail-button" title="Sobre o Workfoli" aria-label="Sobre o Workfoli" onClick={() => setShowAbout(true)}><CircleHelp size={19} /></button></div></aside>
    {selectedId && <aside className="workspace-sidebar"><button className="back-link" onClick={goHome}><ArrowLeft size={14} /> Clientes</button><div className="workspace-identity"><span className="client-avatar large-avatar">{initials(selectedSummary?.name ?? 'Cliente')}</span><h2>{selectedSummary?.name ?? 'Carregando cliente'}</h2><span className="small muted">{selectedSummary?.relationship === 'company' ? 'Minha empresa' : 'Workspace do cliente'}</span></div><nav className="workspace-nav" aria-label="Áreas do cliente">{(Object.keys(viewLabels) as View[]).map(item => { const Icon = viewIcons[item]; return <button key={item} className={view === item ? 'active' : ''} aria-current={view === item ? 'page' : undefined} onClick={() => { setView(item); setError(''); }}><Icon size={18} /><span>{viewLabels[item]}</span>{item === 'knowledge' && pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}</button>; })}</nav><div className="sidebar-foot"><ShieldCheck size={17} /><p><strong>Contexto separado</strong><br />Os dados ficam no workspace deste negócio.</p></div></aside>}
    <div className="main-shell"><header className="topbar hierarchy-topbar"><div className="breadcrumb"><span>Workfoli</span><ChevronRight size={13} /><button onClick={section === 'company' ? openCompany : goHome}>{section === 'company' ? 'Minha empresa' : 'Clientes'}</button>{selectedId && <><ChevronRight size={13} /><span className="breadcrumb-current">{selectedSummary?.name ?? 'Workspace'}</span></>}</div>{environment ? <button className="environment-identity-button" aria-label="Editar empresa e usuário" onClick={() => setEditEnvironment(true)}><span><Building2 size={14} /><strong>{environment.company.name}</strong></span><span><UserRound size={14} />{environment.user.name}</span><Settings2 size={14} /></button> : <PrivacyNote />}</header><main className={selectedId ? 'workspace-main' : 'clients-main'}>
      {!api && <div className="desktop-notice"><Monitor size={20} /><div><strong>Abra no aplicativo desktop</strong><p>A importação e os dados locais ficam disponíveis no Workfoli para Windows.</p></div></div>}
      {error && <ErrorNotice retry={selectedId ? () => { void openClient(selectedId); } : () => { void refreshClients(); }}>{error}</ErrorNotice>}
      {notice && <div className="success-notice" role="status"><CheckCircle2 size={18} /><span>{notice}</span><button className="icon-button" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={16} /></button></div>}
      {!selectedId && section === 'company' && (loading ? <Loading text="Abrindo sua empresa…" /> : environment ? <CompanyHome environment={environment} onImport={() => setShowImport(true)} onContext={() => setContextScope('company')} /> : null)}
      {!selectedId && section === 'clients' && <><div className="page-heading"><div><span className="eyebrow">SEU ESPAÇO DE TRABALHO</span><h1>Clientes<span className="heading-dot">.</span></h1><p>Todo o contexto de cada negócio, no lugar certo.</p></div><div className="page-heading-actions"><button className="secondary-button" disabled={!environment} onClick={() => setContextScope('portfolio')}><Layers3 size={16} /> Contexto da carteira</button><button data-testid="new-client" className="primary-button" disabled={!api || !environment} onClick={() => setShowImport(true)}><Plus size={18} /> Novo cliente</button></div></div>
        {loading ? <Loading text="Abrindo seus clientes…" /> : clients.length === 0 ? <><section className="welcome-panel"><div className="welcome-copy"><span className="eyebrow terracotta">COMECE PELO QUE JÁ EXISTE</span><h2>Dos arquivos soltos<br />a um contexto completo.</h2><p>Reúna documentos, identidade e projetos em um espaço próprio para cada cliente. Importe uma pasta ou ZIP e revise o que foi encontrado.</p><button data-testid="first-client" className="primary-button" disabled={!api || !environment} onClick={() => setShowImport(true)}>Adicionar primeiro cliente <ArrowRight size={17} /></button><span className="welcome-footnote">Sem alterar os arquivos originais.</span></div><div className="welcome-illustration" aria-hidden="true"><div className="illustration-grid" /><div className="paper paper-back"><span /><span /><span /></div><div className="paper paper-middle"><div className="mini-lines"><span /><span /><span /></div></div><div className="folder-illustration"><div className="folder-tab" /><FolderOpen size={33} strokeWidth={1.1} /><strong>Um cliente.<br />Todo o contexto.</strong><div className="folder-rule" /><span>ARQUIVOS · CONHECIMENTO · PROJETOS</span></div><div className="illustration-badge"><CheckCircle2 size={17} /> Origem preservada</div><span className="illustration-spark">✳</span></div></section><div className="onboarding-guide"><div><span className="guide-number">01</span><h3>Traga os arquivos</h3><p>Escolha uma pasta ou ZIP do cliente, com a organização que já existe.</p></div><div><span className="guide-number">02</span><h3>Revise o contexto</h3><p>Confira categorias, projetos identificados e informações com fonte.</p></div><div><span className="guide-number">03</span><h3>Encontre tudo aqui</h3><p>Consulte arquivos e conhecimento em um workspace independente.</p></div></div></> : <><div className="clients-toolbar"><span>{count(clients.length)} {clients.length === 1 ? 'cliente no seu espaço' : 'clientes no seu espaço'}</span><label className="search-input"><Search size={16} /><input aria-label="Buscar clientes" placeholder="Buscar cliente" value={clientQuery} onChange={e => setClientQuery(e.target.value)} /></label></div><div className="client-grid">{filteredClients.map(client => <button className="client-card" key={client.id} onClick={() => { void openClient(client.id); }}><div className="client-card-top"><span className="client-avatar">{initials(client.name)}</span><ArrowRight size={18} /></div><h2>{client.name}</h2><p title={client.sourceName}>{client.sourceName}</p><div className="client-card-stats"><span><Files size={14} /> {count(client.files)} arquivos</span><span><FolderClosed size={14} /> {count(client.projects)} projetos</span></div><div className="client-card-footer"><span>Criado em {date(client.createdAt)}</span>{client.legacy && <span className="legacy-dot" title="Origem LeanAI reconhecida" />}</div></button>)}<button className="new-client-card" onClick={() => setShowImport(true)}><span><Plus size={23} /></span><strong>Um novo contexto</strong><p>Adicionar outro cliente</p></button></div>{filteredClients.length === 0 && <p className="muted">Nenhum cliente corresponde a “{clientQuery}”.</p>}</>}
      </>}
      {selectedId && loadingClient && <Loading text="Abrindo o contexto deste cliente…" />}
      {data && !loadingClient && <><div className="page-heading workspace-heading"><div><span className="eyebrow">{data.workspace.name}</span><h1>{viewLabels[view]}<span className="heading-dot">.</span></h1><p>{view === 'overview' ? 'Uma visão clara do que você já tem em mãos.' : view === 'files' ? 'A estrutura original, com categorias e disponibilidade de cada arquivo.' : view === 'knowledge' ? 'Informações verificáveis, sempre ligadas à sua origem.' : 'Os projetos encontrados nos arquivos deste cliente.'}</p></div>{view === 'overview' && <span className="snapshot-badge"><CheckCircle2 size={15} /> Origem preservada</span>}{view === 'knowledge' && <button data-testid="reanalyze-knowledge" className="secondary-button reanalyze-button" disabled={!!pendingKnowledge} onClick={() => setShowReanalysis(true)}><RefreshCw size={16} /> Reanalisar conhecimento</button>}</div>
        <div className="workspace-action-bar"><span><ShieldCheck size={15} /> {data.workspace.relationship === 'company' ? 'Contexto da sua empresa' : 'Contexto isolado deste cliente'}</span><div><button className="small-button" onClick={() => setContextScope(data.workspace.relationship === 'company' ? 'company' : 'workspace')}><Layers3 size={14} /> Ver contexto</button><button data-testid="change-relationship" className="small-button" disabled={!!pendingKnowledge} onClick={() => setShowRelationship(true)}><Building2 size={14} /> {data.workspace.relationship === 'company' ? 'Transformar em cliente' : 'Usar como minha empresa'}</button><button data-testid="export-workspace" className="small-button" onClick={() => setShowExport(true)}><Download size={14} /> Exportar ZIP</button></div></div>
        {view === 'overview' && <><BaseSummary base={data.report.base} onEvidence={showEvidence} /><Overview data={data} onNavigate={setView} onEvidence={showEvidence} /></>}
        {view === 'files' && <section className="content-panel"><FileTable key={data.workspace.id} files={data.report.files} searchFiles={searchFiles} onPreview={file => setPreview({ file, workspaceId: data.workspace.id })} /></section>}
        {view === 'knowledge' && <KnowledgeList key={data.workspace.id} items={data.report.knowledge} onStatus={(id, status) => { void updateKnowledge(id, status); }} onSave={updateKnowledge} pendingId={pendingKnowledge} onEvidence={showEvidence} />}
        {view === 'projects' && <Projects items={data.report.projects} onEvidence={showEvidence} />}
      </>}
    </main><footer className="app-footer"><span>Workfoli <span className="footer-separator">/</span> Sua empresa, organizada para funcionar melhor.</span><span>{appInfo ? `v${appInfo.version}` : 'Local · Windows'}</span></footer></div>
    {showImport && api && environment && <ImportWizard api={api} companyName={environment.company.name} companyWorkspace={companyWorkspace} onClose={() => setShowImport(false)} onComplete={imported} />}
    {preview && api && <PreviewDialog api={api} file={preview.file} source={{ kind: 'workspace', id: preview.workspaceId }} evidence={preview.evidence} onClose={() => setPreview(null)} />}
    {showReanalysis && data && api && <ReanalysisDialog api={api} workspace={data} onClose={() => setShowReanalysis(false)} onComplete={result => {
      if (selectedRef.current === result.workspace.id) { setData(result); setWorkspaces(old => old.map(item => item.id === result.workspace.id ? result.workspace : item)); setShowReanalysis(false); }
    }} />}
    {api && environmentReady && !backupMode && (!environment || editEnvironment) && <EnvironmentDialog api={api} environment={environment} onBackup={() => { setEditEnvironment(false); setBackupMode('restore'); }} onClose={() => setEditEnvironment(false)} onSaved={profile => { setEnvironment(profile); setEditEnvironment(false); void refreshClients(); if (selectedId && selectedId === profile.company.workspaceId) void openClient(selectedId); }} />}
    {showRelationship && data && api && <RelationshipDialog api={api} workspace={data.workspace} companyWorkspace={companyWorkspace} onClose={() => setShowRelationship(false)} onComplete={imported} />}
    {showExport && data && api && <ExportDialog api={api} workspace={data.workspace} onClose={() => setShowExport(false)} onComplete={result => { setShowExport(false); setNotice(`Pacote ${result.name} exportado: ${count(result.files)} arquivos incluídos e ${count(result.excluded)} excluídos.`); }} />}
    {contextScope && api && environment && <ContextDialog api={api} scope={contextScope} workspaceId={contextScope === 'workspace' ? selectedId ?? undefined : undefined} onClose={() => setContextScope(null)} />}
    {showAbout && <AboutDialog appInfo={appInfo} onBackup={() => { setShowAbout(false); setBackupMode('create'); }} onClose={() => setShowAbout(false)} />}
    {backupMode && api && <BackupDialog api={api} initialMode={backupMode} onClose={() => setBackupMode(null)} onRestored={() => { goHome(); setWorkspaces([]); setEnvironment(null); setEnvironmentReady(false); setSection('company'); setBackupMode(null); void refreshClients(); void api.appInfo().then(setAppInfo).catch(() => {}); }} />}
  </div>;
}

function Overview({ data, onNavigate, onEvidence }: { data: WorkspaceData; onNavigate: (view: View) => void; onEvidence: (id: string) => void }) {
  const { report, workspace } = data;
  const confirmed = report.knowledge.filter(item => item.status === 'confirmed').length;
  const pending = report.knowledge.filter(item => item.status === 'pending').length;
  return <><div className="stat-grid"><button className="stat-card" onClick={() => onNavigate('files')}><span><Files size={18} /> Arquivos</span><strong>{count(report.summary.files)}</strong><small>{bytes(report.summary.bytes)} de conteúdo inventariado</small></button><button className="stat-card" onClick={() => onNavigate('knowledge')}><span><BookOpen size={18} /> Conhecimento</span><strong>{count(report.knowledge.length)}</strong><small>{count(confirmed)} confirmados · {count(pending)} a revisar</small></button><button className="stat-card" onClick={() => onNavigate('projects')}><span><FolderClosed size={18} /> Projetos</span><strong>{count(report.projects.length)}</strong><small>Identificados a partir dos arquivos</small></button></div>
    {pending > 0 && <div className="review-callout"><div className="callout-icon"><BookOpen size={21} /></div><div><strong>Seu olhar completa o contexto.</strong><p>{count(pending)} {pending === 1 ? 'informação aguarda' : 'informações aguardam'} revisão. Confira os valores e a fonte antes de confirmar.</p></div><button className="secondary-button" onClick={() => onNavigate('knowledge')}>Revisar conhecimento <ArrowRight size={15} /></button></div>}
    <div className="overview-columns"><section className="content-panel overview-projects"><div className="section-heading"><div><span className="eyebrow">ESTRUTURA IDENTIFICADA</span><h2>Projetos do negócio</h2></div><button className="text-button" onClick={() => onNavigate('projects')}>Ver todos <ArrowRight size={14} /></button></div>{report.projects.length ? <div className="project-mini-list">{report.projects.slice(0, 4).map(project => <button key={project.id} onClick={() => onNavigate('projects')}><span className={`project-icon project-${project.type}`}>{project.type === 'website' ? <Globe2 size={20} /> : project.type === 'legacy' ? <Boxes size={20} /> : <Code2 size={20} />}</span><span><strong>{project.name}</strong><small>{project.root || 'Raiz da origem'}</small></span><ChevronRight size={16} /></button>)}</div> : <EmptyState icon={<FolderClosed size={23} />} title="Nenhum projeto identificado">Os documentos continuam organizados em Arquivos.</EmptyState>}</section><section className="content-panel source-card"><span className="eyebrow">RASTREABILIDADE</span><h2>Uma origem, preservada.</h2><div className="origin-file"><span><ArrowDownToLine size={21} /></span><div><strong title={report.sourceName}>{report.sourceName}</strong><small>{report.sourceType === 'zip' ? 'Arquivo ZIP' : 'Pasta'} · {date(workspace.createdAt)}</small></div></div><dl><div><dt>Texto para consulta</dt><dd>{count(report.summary.indexed)} arquivos</dd></div><div><dt>Entradas restritas</dt><dd>{count(report.summary.restricted)}</dd></div><div><dt>Links não seguidos</dt><dd>{count(report.summary.links)}</dd></div><div><dt>Duplicatas mantidas</dt><dd>{count(report.summary.duplicates)}</dd></div></dl>{report.sourceHash && <details className="hash-details"><summary>Ver identificação da origem</summary><code>{report.sourceHash}</code></details>}<span className="source-footer"><ShieldCheck size={14} /> Seus originais não foram alterados.</span></section></div>
    {report.warnings.length > 0 && <details className="warnings overview-warnings"><summary>{count(report.warnings.length)} observações desta importação</summary><ul>{report.warnings.slice(0, 100).map((warning, index) => <li key={index}>{warning.message}{warning.fileId && <button className="text-button" onClick={() => onEvidence(warning.fileId!)}>Ver origem</button>}</li>)}</ul></details>}
  </>;
}

function Projects({ items, onEvidence }: { items: Project[]; onEvidence: (evidence: Evidence) => void }) {
  if (!items.length) return <section className="content-panel"><EmptyState icon={<FolderClosed size={25} />} title="Nenhum projeto identificado">Esta origem não contém uma estrutura de projeto reconhecida. Seus arquivos continuam disponíveis para consulta.</EmptyState></section>;
  return <div className="projects-grid">{items.map(project => <article className="project-card" key={project.id}><div className="project-card-top"><span className={`project-icon project-${project.type}`}>{project.type === 'website' ? <Globe2 size={22} /> : project.type === 'legacy' ? <Boxes size={22} /> : <Code2 size={22} />}</span><span className="tag">{project.type === 'website' ? 'Site' : project.type === 'legacy' ? 'Sistema legado' : 'Software'}</span></div><h2>{project.name}</h2><p>{project.description}</p><div className="project-root"><FolderClosed size={14} /><span>{project.root || 'Raiz da origem'}</span></div><div className="project-evidence"><span className="eyebrow">EVIDÊNCIAS DA IDENTIFICAÇÃO</span>{project.evidence.map((evidence, index) => <button className="evidence-link" key={`${evidence.fileId}-${index}`} onClick={() => onEvidence(evidence)}><ExternalLink size={13} /><span>{evidence.path}{evidence.line ? ` · linha ${evidence.line}` : ''}</span></button>)}</div></article>)}</div>;
}

function AboutDialog({ appInfo, onClose, onBackup }: { appInfo: { version: string; dataDirectory: string } | null; onClose: () => void; onBackup: () => void }) {
  const ref = useDialog(onClose);
  return <div className="modal-backdrop"><div ref={ref} className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" tabIndex={-1}><div className="dialog-header"><div><span className="eyebrow">SEU CONTEXTO, NO SEU COMPUTADOR</span><h2 id="about-title">Workfoli{appInfo ? ` ${appInfo.version}` : ''}</h2></div><button className="icon-button" aria-label="Fechar informações" onClick={onClose}><X size={20} /></button></div><div className="dialog-body"><p>Um espaço independente para os arquivos, o conhecimento e os projetos de cada cliente.</p><p>Esta versão funciona localmente. O conteúdo importado não é enviado para serviços de IA e os originais não são alterados.</p>{appInfo && <div className="data-location"><strong>Seus dados ficam em</strong><code>{appInfo.dataDirectory}</code></div>}<button data-testid="open-backup" className="secondary-button" onClick={onBackup}>Backup e recuperação</button><p className="small muted">PDFs, documentos de escritório e formatos sem extrator são preservados no inventário. Texto estruturado é extraído dos formatos suportados, com indicação de origem.</p></div><div className="dialog-footer"><PrivacyNote /><button className="primary-button" onClick={onClose}>Entendi</button></div></div></div>;
}
