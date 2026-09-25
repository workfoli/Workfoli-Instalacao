import { useState } from 'react';
import { ArchiveRestore, Download, KeyRound, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import type { WorkfoliApi } from '../../../packages/contracts';
import { count, ErrorNotice, errorText } from './ui';
import { useDialog } from './useDialog';

export default function BackupDialog({ api, initialMode, onClose, onRestored }: { api: WorkfoliApi; initialMode: 'create' | 'restore'; onClose: () => void; onRestored: () => void }) {
  const [mode, setMode] = useState(initialMode);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const close = () => { if (!busy) onClose(); };
  const ref = useDialog(close);
  async function run() {
    if (busy || password.length < 12 || mode === 'create' && password !== confirmation) return;
    setBusy(true); setError(''); setResult('');
    try {
      if (mode === 'create') {
        const created = await api.createBackup(password);
        if (created) { setResult(`${created.name}: ${count(created.workspaces)} workspaces protegidos. Guarde a senha em um local seguro.`); setPassword(''); setConfirmation(''); }
      } else {
        const restored = await api.restoreBackup(password);
        if (restored) { setPassword(''); onRestored(); return; }
      }
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><div ref={ref} className="about-dialog backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-title" tabIndex={-1}>
    <div className="dialog-header"><div><span className="eyebrow">SEU AMBIENTE, PROTEGIDO</span><h2 id="backup-title">Backup e recuperação</h2></div><button className="icon-button" aria-label="Fechar backup" onClick={close} disabled={busy}><X size={20} /></button></div>
    <div className="dialog-body"><div className="backup-tabs" role="group" aria-label="Operação de backup"><button className={mode === 'create' ? 'secondary-button active' : 'secondary-button'} disabled={busy} onClick={() => { setMode('create'); setError(''); setResult(''); setPassword(''); setConfirmation(''); }}><Download size={16} /> Criar backup</button><button className={mode === 'restore' ? 'secondary-button active' : 'secondary-button'} disabled={busy} onClick={() => { setMode('restore'); setError(''); setResult(''); setPassword(''); setConfirmation(''); }}><ArchiveRestore size={16} /> Recuperar ambiente</button></div>
      <p>{mode === 'create' ? 'Salve o estado atual da sua empresa, clientes, arquivos, revisões e histórico em um arquivo protegido por senha. O backup inclui arquivos privados.' : 'Escolha seu backup e uma pasta vazia. O Workfoli verificará o conteúdo e abrirá um novo ambiente recuperado. O ambiente atual será preservado.'}</p>
      <div className="context-boundary"><ShieldCheck size={18} /><span>{mode === 'create' ? 'Para entregar apenas um cliente a outra pessoa, use Exportar ZIP no workspace. O backup completo guarda todos os dados desta instalação.' : 'Você precisa da senha usada ao criar o backup. Uma senha incorreta ou um arquivo alterado impede a recuperação.'}</span></div>
      {error && <ErrorNotice>{error}</ErrorNotice>}{result && <p className="success-notice" role="status">{result}</p>}
      <label className="environment-field"><span><KeyRound size={16} /> {mode === 'create' ? 'Senha do backup' : 'Senha original do backup'}</span><input data-testid="backup-password" type="password" value={password} disabled={busy} autoComplete={mode === 'create' ? 'new-password' : 'off'} maxLength={256} onChange={event => setPassword(event.target.value)} placeholder="Pelo menos 12 caracteres" /></label>
      {mode === 'create' && <label className="environment-field"><span>Repita a senha</span><input data-testid="backup-password-confirm" type="password" value={confirmation} disabled={busy} autoComplete="new-password" maxLength={256} onChange={event => setConfirmation(event.target.value)} /></label>}
      <p className="small muted">A senha não é salva no Workfoli. Sem ela, o backup não pode ser recuperado.</p>
    </div>
    <div className="dialog-footer"><button className="secondary-button" disabled={busy} onClick={close}>Fechar</button><button data-testid={mode === 'create' ? 'create-backup' : 'restore-backup'} className="primary-button" disabled={busy || password.length < 12 || mode === 'create' && password !== confirmation} onClick={() => { void run(); }}>{busy ? <LoaderCircle size={16} className="spin" /> : mode === 'create' ? <Download size={16} /> : <ArchiveRestore size={16} />}{busy ? 'Processando…' : mode === 'create' ? 'Salvar backup protegido' : 'Restaurar e abrir em nova pasta'}</button></div>
  </div></div>;
}
