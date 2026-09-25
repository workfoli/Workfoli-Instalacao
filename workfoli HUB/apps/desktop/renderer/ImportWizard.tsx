import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Archive, FolderOpen, X, Check, ShieldCheck, LoaderCircle, FileCheck2, TriangleAlert, ChevronDown } from 'lucide-react';
import type { Category, Evidence, FileEntry, ImportReport, Progress, ReviewInput, WorkfoliApi, WorkspaceData, WorkspaceSummary } from '../../../packages/contracts';
import FileTable from './FileTable';
import KnowledgeList from './KnowledgeList';
import PreviewDialog from './PreviewDialog';
import { bytes, CATEGORY_LABELS, count, ErrorNotice, errorText, PrivacyNote } from './ui';
import { useDialog } from './useDialog';

interface Props { api: WorkfoliApi; companyName: string; companyWorkspace?: WorkspaceSummary; onClose: () => void; onComplete: (workspace: WorkspaceData) => void; }
type Stage = 'source' | 'working' | 'review' | 'error';

export default function ImportWizard({ api, companyName, companyWorkspace, onClose, onComplete }: Props) {
  const [relationship, setRelationship] = useState<'company' | 'client' | null>(null);
  const [stage, setStage] = useState<Stage>('source');
  const [runId, setRunId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [name, setName] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [categories, setCategories] = useState<Record<string, Category>>({});
  const [knowledge, setKnowledge] = useState<ReviewInput['knowledge']>({});
  const [reviewTab, setReviewTab] = useState<'summary' | 'files' | 'knowledge'>('summary');
  const [focusFile, setFocusFile] = useState<{ id: string; nonce: number } | null>(null);
  const [preview, setPreview] = useState<{ file: FileEntry; evidence?: Evidence } | null>(null);
  const runRef = useRef<string | null>(null);
  const generation = useRef(0);
  const recentProgress = useRef(new Map<string, Progress>());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => api.onProgress(event => {
    recentProgress.current.set(event.runId, event);
    if (event.runId !== runRef.current) return;
    setProgress(event);
    if (event.phase === 'error') { setError(event.message); setStage('error'); }
  }), [api]);
  useEffect(() => {
    if (!runId || stage !== 'working') return;
    let active = true; let timeout: number | undefined;
    const poll = async () => {
      try {
        const result = await api.getImport(runId);
        if (!active || runRef.current !== runId) return;
        if (result) { setReport(result); setName(result.suggestedName); setStage('review'); return; }
        timeout = window.setTimeout(() => { void poll(); }, 650);
      } catch (cause) {
        if (active) { setError(errorText(cause)); setStage('error'); }
      }
    };
    void poll();
    return () => { active = false; if (timeout) window.clearTimeout(timeout); };
  }, [api, runId, stage]);

  const close = useCallback(async () => {
    if (busy || cancelling) return;
    setCancelling(true); setError(''); generation.current += 1;
    try {
      if (runRef.current) await api.cancelImport(runRef.current);
      runRef.current = null;
      onClose();
    } catch (cause) { setError(errorText(cause)); setCancelling(false); }
  }, [api, busy, cancelling, onClose]);
  const dialogRef = useDialog(() => { void close(); });

  async function select(kind: 'zip' | 'folder') {
    if (busy) return;
    setBusy(true); setError('');
    const currentGeneration = ++generation.current;
    try {
      if (runRef.current) { await api.cancelImport(runRef.current); runRef.current = null; setRunId(null); }
      const selected = await api.selectSource(kind);
      if (!selected || !alive.current || currentGeneration !== generation.current) return;
      setSourceName(selected.name); setReport(null); setProgress(null); setCategories({}); setKnowledge({}); setReviewTab('summary');
      const started = await api.startImport(selected.token);
      if (!alive.current || currentGeneration !== generation.current) { await api.cancelImport(started.runId); return; }
      runRef.current = started.runId; setRunId(started.runId);
      const cached = recentProgress.current.get(started.runId);
      if (cached) setProgress(cached);
      if (cached?.phase === 'error') { setError(cached.message); setStage('error'); }
      else setStage('working');
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function confirm() {
    if (!runRef.current || !relationship || !name.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const data = await api.confirmImport(runRef.current, { name: name.trim(), relationship, categories, knowledge });
      runRef.current = null;
      onComplete(data);
    } catch (cause) { if (alive.current) { setError(errorText(cause)); setBusy(false); } }
  }
  const relationshipChoice = <fieldset className="relationship-choice"><legend>Como você deseja utilizar este workspace?</legend><label className={relationship === 'company' ? 'selected' : ''}><input data-testid="relationship-company" type="radio" name="workspace-relationship" value="company" checked={relationship === 'company'} disabled={!!companyWorkspace || busy || cancelling} onChange={() => setRelationship('company')} required /><span><strong>Esta é a minha empresa</strong><small>{companyWorkspace ? `${companyWorkspace.name} já está vinculado como empresa principal.` : stage === 'review' && name.trim() ? `Ao confirmar, “${name.trim()}” será o nome da sua empresa principal, atualmente “${companyName}”.` : `O nome revisado na próxima etapa atualizará o nome da sua empresa principal, atualmente “${companyName}”.`}</small></span></label><label className={relationship === 'client' ? 'selected' : ''}><input data-testid="relationship-client" type="radio" name="workspace-relationship" value="client" checked={relationship === 'client'} disabled={busy || cancelling} onChange={() => setRelationship('client')} required /><span><strong>Esta empresa é um cliente meu</strong><small>{`Este workspace será um cliente de ${companyName}, com arquivos e conhecimento próprios.`}</small></span></label>{companyWorkspace && <p>Você pode importar como cliente. Para vincular outra empresa principal, altere primeiro o vínculo do workspace atual.</p>}</fieldset>;
  const activeStep = stage === 'source' ? 0 : stage === 'review' ? 2 : 1;
  const fraction = progress?.total && progress.total > 0 ? Math.min(100, Math.round(progress.processed / progress.total * 100)) : null;
  const pendingCount = report?.knowledge.filter(item => (knowledge[item.id]?.status ?? item.status) === 'pending').length ?? 0;

  return <><div className="modal-backdrop"><div ref={dialogRef} className={`import-dialog ${stage === 'review' ? 'review-dialog' : ''}`} role="dialog" aria-modal="true" aria-labelledby="import-title" tabIndex={-1}>
    <div className="dialog-header"><div><span className="eyebrow">NOVO WORKSPACE</span><h2 id="import-title">{stage === 'review' ? 'Revise antes de começar.' : 'Um lugar para todo o contexto.'}</h2></div><button className="icon-button" aria-label="Fechar importação" disabled={busy || cancelling} onClick={() => { void close(); }}><X size={21} /></button></div>
    <ol className="import-steps">{['Escolher origem', 'Analisar conteúdo', 'Revisar e criar'].map((label, index) => <li key={label} className={index === activeStep ? 'current' : index < activeStep ? 'complete' : ''} aria-current={index === activeStep ? 'step' : undefined}><span>{index < activeStep ? <Check size={13} /> : index + 1}</span>{label}</li>)}</ol>
    <div className="dialog-body">
      {error && <ErrorNotice>{error}</ErrorNotice>}
      {(stage === 'source' || stage === 'error') && <div className="source-stage">{relationshipChoice}<p className="source-intro">Escolha os arquivos que deseja organizar neste workspace. O Workfoli organiza a origem, identifica projetos e prepara as informações para sua revisão.</p><div className="source-choices"><button data-testid="select-zip" className="source-choice" disabled={busy || cancelling} onClick={() => { void select('zip'); }}><span className="source-choice-icon"><Archive size={28} strokeWidth={1.5} /></span><strong>Importar um ZIP</strong><span>Um pacote completo, com a estrutura original preservada.</span><span className="source-choice-action">Selecionar arquivo <ArrowRight size={16} /></span></button><button data-testid="select-folder" className="source-choice" disabled={busy || cancelling} onClick={() => { void select('folder'); }}><span className="source-choice-icon"><FolderOpen size={28} strokeWidth={1.5} /></span><strong>Escolher uma pasta</strong><span>Documentos, identidade e projetos que já estão no computador.</span><span className="source-choice-action">Selecionar pasta <ArrowRight size={16} /></span></button></div>{busy && <div className="inline-loading" role="status"><LoaderCircle size={16} className="spin" /> Preparando a origem…</div>}<div className="source-assurance"><ShieldCheck size={20} /><p><strong>Seus originais ficam preservados.</strong><br />A importação mantém uma cópia local e não executa scripts, links ou instruções encontrados nos arquivos.</p></div></div>}
      {stage === 'working' && <div className="progress-stage" aria-live="polite"><div className="progress-orb"><LoaderCircle size={40} strokeWidth={1.2} className="spin" /></div><span className="eyebrow">CONSTRUINDO O INVENTÁRIO</span><h3>Conhecendo os arquivos.</h3><p className="progress-source" title={sourceName}>{sourceName}</p><div className="progress-bar" role="progressbar" aria-label="Progresso da importação" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fraction ?? undefined}><span className={fraction === null ? 'indeterminate' : ''} style={fraction === null ? undefined : { width: `${Math.max(2, fraction)}%` }} /></div><div className="progress-detail"><span>{progress?.message || 'Preparando uma cópia segura da origem…'}</span><span>{fraction === null ? (progress?.processed ? count(progress.processed) : '') : `${fraction}%`}</span></div><p className="muted small">Você poderá revisar as categorias e o conhecimento antes de criar o workspace.</p></div>}
      {stage === 'review' && report && <div className="review-stage">{relationshipChoice}<div className="review-name-row"><label>{relationship === 'company' ? 'Nome da sua empresa' : relationship === 'client' ? 'Nome do cliente' : 'Nome do workspace'}<input data-testid="client-name" value={name} onChange={e => setName(e.target.value)} maxLength={120} autoComplete="off" placeholder="Nome da empresa deste workspace" /></label><div className="review-source"><span className="muted small">Origem preservada</span><strong title={report.sourceName}>{report.sourceName}</strong><span className="small muted">{report.sourceType === 'zip' ? 'Arquivo ZIP' : 'Pasta'} · {bytes(report.summary.bytes)}</span></div></div><nav className="tabs" aria-label="Etapas de revisão"><button className={reviewTab === 'summary' ? 'active' : ''} onClick={() => setReviewTab('summary')}>Resumo da análise</button><button className={reviewTab === 'files' ? 'active' : ''} onClick={() => setReviewTab('files')}>Arquivos <span>{count(report.summary.files)}</span></button><button className={reviewTab === 'knowledge' ? 'active' : ''} onClick={() => setReviewTab('knowledge')}>Conhecimento <span>{count(report.knowledge.length)}</span></button></nav>
        {reviewTab === 'summary' && <><div className="review-metrics"><div><strong>{count(report.summary.files)}</strong><span>arquivos regulares</span></div><div><strong>{count(report.projects.length)}</strong><span>projetos identificados</span></div><div><strong>{count(report.knowledge.length)}</strong><span>informações com origem</span></div><div><strong>{count(report.summary.duplicates)}</strong><span>cópias idênticas</span></div></div><div className="review-summary-grid"><section className="review-section"><h3>Como o conteúdo foi organizado</h3><div className="category-breakdown">{Object.entries(report.summary.categories).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).map(([category, value]) => <div key={category}><span>{CATEGORY_LABELS[category as Category] ?? category}</span><strong>{count(value)}</strong></div>)}</div><button className="text-button" onClick={() => setReviewTab('files')}>Revisar categorias <ArrowRight size={13} /></button></section><section className="review-section"><h3>Preservação e disponibilidade</h3><ul className="preservation-list"><li><FileCheck2 size={17} /><span><strong>{count(report.summary.indexed)}</strong> arquivos com texto para consulta</span></li><li><ShieldCheck size={17} /><span><strong>{count(report.summary.restricted)}</strong> entradas com acesso restrito</span></li><li><Archive size={17} /><span><strong>{count(report.summary.excluded)}</strong> entradas fora da busca</span></li><li><TriangleAlert size={17} /><span><strong>{count(report.summary.blocked)}</strong> entradas bloqueadas · <strong>{count(report.summary.links)}</strong> links não seguidos</span></li></ul><p className="small muted">Cada entrada mantém o caminho original e o motivo da classificação. Duplicatas são identificadas e mantidas.</p>{report.legacy.detected && <div className="legacy-note"><span className="tag">LeanAI identificado</span><p>Memórias e projetos legados foram reconhecidos. Skills e scripts permanecem inativos.</p></div>}</section></div>{report.warnings.length > 0 && <details className="warnings"><summary><TriangleAlert size={16} /> {count(report.warnings.length)} observações da importação <ChevronDown size={15} /></summary><ul>{report.warnings.slice(0, 100).map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message}{warning.fileId && <button className="text-button" onClick={() => { setFocusFile({ id: warning.fileId!, nonce: Date.now() }); setReviewTab('files'); }}>Ver arquivo</button>}</li>)}</ul>{report.warnings.length > 100 && <p className="small muted">Exibindo as primeiras 100 observações. O relatório completo é mantido no workspace.</p>}</details>}</>}
        {reviewTab === 'files' && <FileTable files={report.files} overrides={categories} onCategoryChange={(id, category) => setCategories(old => ({ ...old, [id]: category }))} focusFile={focusFile} onPreview={file => setPreview({ file })} />}
        {reviewTab === 'knowledge' && <><p className="tab-description">Confira os valores e suas fontes. Informações ainda não confirmadas continuam marcadas para revisão no workspace.</p><KnowledgeList items={report.knowledge} edits={knowledge} onEdit={(id, value) => setKnowledge(old => ({ ...old, [id]: value }))} onEvidence={evidence => { const file = report.files.find(item => item.id === evidence.fileId); if (file) setPreview({ file, evidence }); }} /></>}
      </div>}
    </div>
    <div className="dialog-footer"><div>{stage === 'review' ? <span className="small muted">{pendingCount ? `${count(pendingCount)} informações continuarão a revisar.` : 'Revisão do conhecimento concluída.'}</span> : <PrivacyNote />}</div><div className="footer-actions"><button className="secondary-button" disabled={busy || cancelling} onClick={() => { void close(); }}>{cancelling ? 'Cancelando…' : stage === 'working' ? 'Cancelar análise' : 'Cancelar'}</button>{stage === 'review' && <button data-testid="confirm-import" className="primary-button" disabled={!relationship || !name.trim() || busy || cancelling} onClick={() => { void confirm(); }}>{busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}{busy ? 'Criando workspace…' : relationship === 'company' ? 'Criar workspace da empresa' : relationship === 'client' ? 'Criar cliente' : 'Criar workspace'}</button>}{stage === 'error' && <button className="secondary-button" disabled={busy} onClick={() => { setStage('source'); setError(''); }}><ArrowLeft size={15} /> Escolher outra origem</button>}</div></div>
  </div></div>{preview && runId && <PreviewDialog api={api} file={preview.file} source={{ kind: 'import', id: runId }} evidence={preview.evidence} onClose={() => setPreview(null)} />}</>;
}
