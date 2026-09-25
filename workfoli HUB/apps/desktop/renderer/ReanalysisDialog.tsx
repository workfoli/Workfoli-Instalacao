import { useEffect, useState } from 'react';
import { Check, LoaderCircle, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { Evidence, FileEntry, ReanalysisPreview, WorkfoliApi, WorkspaceData } from '../../../packages/contracts';
import KnowledgeList from './KnowledgeList';
import PreviewDialog from './PreviewDialog';
import { count, EmptyState, ErrorNotice, errorText, Loading } from './ui';
import { useDialog } from './useDialog';

interface Props {
  api: WorkfoliApi;
  workspace: WorkspaceData;
  onClose: () => void;
  onComplete: (workspace: WorkspaceData) => void;
}

export default function ReanalysisDialog({ api, workspace, onClose, onComplete }: Props) {
  const [proposal, setProposal] = useState<ReanalysisPreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<'proposed' | 'retained' | 'removed'>('proposed');
  const [preview, setPreview] = useState<{ file: FileEntry; evidence: Evidence } | null>(null);
  const ref = useDialog(() => { if (!applying) onClose(); });
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setProposal(null);
    void api.previewReanalysis(workspace.workspace.id)
      .then(value => { if (active) setProposal(value); })
      .catch(cause => { if (active) setError(errorText(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, workspace.workspace.id, attempt]);
  async function apply() {
    if (!proposal || applying) return;
    setApplying(true); setError('');
    try { onComplete(await api.applyReanalysis(workspace.workspace.id, proposal.token)); }
    catch (cause) { setError(errorText(cause)); setApplying(false); }
  }
  function showEvidence(evidence: Evidence) {
    const file = workspace.report.files.find(item => item.id === evidence.fileId);
    if (file) setPreview({ file, evidence });
    else setError('O arquivo desta evidência não está disponível no inventário.');
  }
  const hasChanges = !!proposal && proposal.added + proposal.updated + proposal.removed > 0;
  const reviewedIds = new Set(workspace.report.knowledge.filter(item => item.status !== 'pending' || item.origin === 'user').map(item => item.id));
  const proposedIds = new Set(proposal?.knowledge.map(item => item.id));
  const removedItems = workspace.report.knowledge.filter(item => !proposedIds.has(item.id));
  const visibleItems = tab === 'removed' ? removedItems : proposal?.knowledge.filter(item => tab === 'retained' ? reviewedIds.has(item.id) : !reviewedIds.has(item.id)) ?? [];
  return <><div className="modal-backdrop"><div ref={ref} className="import-dialog review-dialog reanalysis-dialog" role="dialog" aria-modal="true" aria-labelledby="reanalysis-title" tabIndex={-1}>
    <div className="dialog-header"><div><span className="eyebrow">{workspace.workspace.name}</span><h2 id="reanalysis-title">Reanalisar conhecimento</h2></div><button className="icon-button" aria-label="Fechar reanálise" disabled={applying} onClick={onClose}><X size={21} /></button></div>
    <div className="dialog-body">
      <p className="reanalysis-intro">Uma nova leitura dos documentos preservados pode identificar mais informações. Confira a proposta antes de aplicar.</p>
      <div className="reanalysis-assurance"><ShieldCheck size={21} /><p><strong>Suas decisões são preservadas.</strong><br />Informações confirmadas, descartadas ou corrigidas por você serão mantidas. Ao aplicar, uma cópia de segurança do conhecimento atual será criada automaticamente.</p></div>
      {error && <ErrorNotice retry={!applying ? () => setAttempt(value => value + 1) : undefined}>{error}</ErrorNotice>}
      {loading ? <Loading text="Lendo as fontes e preparando a proposta…" /> : proposal && <>
        <div className="review-metrics reanalysis-metrics"><div><strong>{count(proposal.added)}</strong><span>novas informações</span></div><div><strong>{count(proposal.updated)}</strong><span>pendentes atualizados</span></div><div><strong>{count(proposal.removed)}</strong><span>pendentes removidos</span></div><div><strong>{count(proposal.retainedReviewed)}</strong><span>revisados preservados</span></div></div>
        <p className="reanalysis-count">{count(proposal.previousCount)} informações atuais → {count(proposal.knowledge.length)} após aplicar.</p>
        {!hasChanges && <div className="reanalysis-unchanged"><Check size={17} /> O conhecimento já está atualizado com esta análise.</div>}
        <nav className="tabs" aria-label="Informações da reanálise"><button className={tab === 'proposed' ? 'active' : ''} onClick={() => setTab('proposed')}>Proposta para revisão</button><button className={tab === 'retained' ? 'active' : ''} onClick={() => setTab('retained')}>Revisados preservados</button><button className={tab === 'removed' ? 'active' : ''} onClick={() => setTab('removed')}>Pendentes removidos</button></nav>
        {tab === 'removed' && <p className="reanalysis-intro">Estas sugestões antigas não fazem parte da nova proposta. As fontes serão mantidas.</p>}
        {visibleItems.length ? <KnowledgeList key={tab} items={visibleItems} onEvidence={showEvidence} /> : <EmptyState icon={<Check size={23} />} title={tab === 'retained' ? 'Nenhuma decisão anterior a preservar' : tab === 'removed' ? 'Nenhuma sugestão será removida' : 'Nenhuma informação pendente nesta proposta'}>{tab === 'retained' ? 'As decisões de revisão passam a ser protegidas quando você confirma, descarta ou corrige uma informação.' : 'Confira as outras abas para ver o restante da proposta.'}</EmptyState>}
      </>}
    </div>
    <div className="dialog-footer"><span className="small muted">{applying ? 'Salvando uma cópia e aplicando a proposta…' : 'A reanálise só altera o cliente após sua confirmação.'}</span><div className="footer-actions"><button className="secondary-button" disabled={applying} onClick={onClose}>Cancelar</button><button data-testid="apply-reanalysis" className="primary-button" disabled={loading || applying || !proposal || !hasChanges} onClick={() => { void apply(); }}>{applying ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}{applying ? 'Aplicando…' : 'Aplicar reanálise'}</button></div></div>
  </div></div>{preview && <PreviewDialog api={api} file={preview.file} source={{ kind: 'workspace', id: workspace.workspace.id }} evidence={preview.evidence} onClose={() => setPreview(null)} />}</>;
}
