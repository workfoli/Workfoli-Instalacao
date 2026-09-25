import { useEffect, useRef, useState } from 'react';
import { FileText, LockKeyhole, X } from 'lucide-react';
import type { Evidence, FileEntry, FilePreview, WorkfoliApi } from '../../../packages/contracts';
import { bytes, CategoryTag, dispositionLabels, EmptyState, ErrorNotice, errorText, FileIcon, Loading } from './ui';
import { useDialog } from './useDialog';

interface Props {
  api: WorkfoliApi;
  file: FileEntry;
  source: { kind: 'workspace' | 'import'; id: string };
  evidence?: Evidence;
  onClose: () => void;
}

export default function PreviewDialog({ api, file, source, evidence, onClose }: Props) {
  const ref = useDialog(onClose);
  const lineRef = useRef<HTMLSpanElement>(null);
  const [result, setResult] = useState<FilePreview | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const line = evidence?.line && Number.isInteger(evidence.line) && evidence.line > 0 ? evidence.line : undefined;
  const endLine = line ? Math.max(line, evidence?.endLine ?? line) : undefined;
  useEffect(() => {
    let active = true;
    setResult(null); setError('');
    const promise = source.kind === 'import' ? api.previewImport(source.id, file.id) : api.previewFile(source.id, file.id);
    void promise.then(value => { if (active) setResult(value); }).catch(cause => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [api, source.kind, source.id, file.id, attempt]);
  useEffect(() => {
    if (result?.kind === 'text' && line) lineRef.current?.scrollIntoView({ block: 'center' });
  }, [result, line]);
  const validImage = result?.kind === 'image' && /^data:image\/(?:png|jpeg|jpg|webp|gif|bmp);base64,/i.test(result.content);
  const textLines = result?.kind === 'text' ? result.content.split(/\r?\n/) : [];
  return <div className="modal-backdrop preview-backdrop"><div ref={ref} className="preview-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-title" tabIndex={-1}>
    <div className="dialog-header"><div className="preview-title"><span className="file-type-icon"><FileIcon file={file} size={21} /></span><div><h2 id="preview-title">{file.path.split('/').pop()}</h2><p>{file.path}</p></div></div><button className="icon-button" aria-label="Fechar prévia" onClick={onClose}><X size={21} /></button></div>
    <div className="preview-meta"><CategoryTag category={file.category} /><span>{bytes(file.size)}</span><span>{dispositionLabels[file.disposition]}</span>{line && <span className="evidence-location">{endLine !== line ? `Linhas ${line}–${endLine}` : `Linha ${line}`}</span>}</div>
    {file.reason && <div className="preview-reason">{file.reason}</div>}
    <div className="preview-body">{error ? <ErrorNotice retry={() => setAttempt(value => value + 1)}>{error}</ErrorNotice> : !result ? <Loading text="Preparando prévia…" /> : result.kind === 'text' ? <>
      {line && line > textLines.length && <p className="preview-message">O trecho indicado não está incluído nesta prévia. A referência original é a linha {line}.</p>}
      <pre className="text-preview numbered-preview" aria-label="Conteúdo original do arquivo"><code>{textLines.map((content, index) => {
        const number = index + 1;
        const highlighted = !!line && number >= line && number <= (endLine ?? line);
        return <span key={number} ref={number === line ? lineRef : undefined} data-line={number} className={`preview-line ${highlighted ? 'evidence-highlight' : ''}`}><span className="line-number" aria-hidden="true">{number}</span><span className="line-content">{content || '\u00a0'}</span></span>;
      })}</code></pre>{result.message && <p className="preview-message">{result.message}</p>}
    </> : validImage ? <div className="image-preview"><img src={result.content} alt={`Prévia de ${file.path}`} />{result.message && <p>{result.message}</p>}</div> : <EmptyState icon={file.sensitive ? <LockKeyhole size={25} /> : <FileText size={25} />} title="Prévia indisponível">{result.message || 'Este arquivo está no inventário, mas não possui uma prévia segura disponível.'}</EmptyState>}</div>
    <div className="dialog-footer"><span className="small muted">Visualização somente para leitura · conteúdo não executado</span><button className="secondary-button" onClick={onClose}>Fechar</button></div>
  </div></div>;
}
