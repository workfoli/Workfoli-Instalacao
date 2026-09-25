import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', size, busy, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm'; busy?: boolean }) {
  return (
    <button {...props} disabled={props.disabled || busy} className={`btn btn-${variant}${size === 'sm' ? ' btn-sm' : ''} ${className}`.trim()}>
      {busy ? <span className="spinner" aria-hidden="true" /> : null}{children}
    </button>
  );
}

export function IconButton({ label, children, small, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; small?: boolean }) {
  return <button type="button" {...props} className={`icon-btn${small ? ' sm' : ''} ${className.replace(/\bicon-btn\b/, '')}`.trim()} aria-label={label} title={label}>{children}</button>;
}

export function PageHead({ eyebrow, title, lead, actions }: { eyebrow?: string; title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  );
}

export function Card({ title, meta, actions, children, className = '' }: { title?: ReactNode; meta?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`.trim()}>
      {title || actions ? <div className="card-head"><div><h2>{title}</h2>{meta ? <div className="meta">{meta}</div> : null}</div>{actions}</div> : null}
      {children}
    </section>
  );
}

export function Stat({ value, label, hint }: { value: ReactNode; label: string; hint?: string }) {
  return <div className="stat"><span className="value">{value}</span><span className="label">{label}</span>{hint ? <span className="hint">{hint}</span> : null}</div>;
}

export function Tag({ children, tone }: { children: ReactNode; tone?: 'accent' | 'outline' }) {
  return <span className={`tag${tone ? ` ${tone}` : ''}`}>{children}</span>;
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty">{icon ? <div className="icon">{icon}</div> : null}<h3>{title}</h3>{children ? <p>{children}</p> : null}{action}</div>;
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return <div className="loading" role="status"><span className="spinner" aria-hidden="true" />{label}</div>;
}

export function Notice({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  return <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{tone === 'success' ? <CircleCheck size={17} /> : <CircleAlert size={17} />}<div>{children}</div></div>;
}

export function Field({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  // A ajuda fica fora do <label>: o nome acessível do campo é só o rótulo.
  return <div className="field"><label className="field-label"><span>{label}</span>{children}</label>{help ? <small className="help">{help}</small> : null}</div>;
}

/**
 * Grupo de controles com rótulo (chips, várias opções). Não usa <label>: um rótulo envolvendo botões vira o
 * nome acessível do primeiro botão, e clicar no texto do rótulo aciona esse botão.
 */
export function FieldGroup({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  const id = useId();
  return <div className="field"><div className="field-label" role="group" aria-labelledby={id}><span id={id}>{label}</span>{children}</div>{help ? <small className="help">{help}</small> : null}</div>;
}

export function Dialog({ open, title, description, onClose, children, footer, wide }: { open: boolean; title: string; description?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`dialog${wide ? ' wide' : ''}`} onCancel={event => { event.preventDefault(); onClose(); }} aria-label={title}>
      {open ? (
        <>
          <div className="dialog-head">
            <div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>
            <IconButton label="Fechar" onClick={onClose} small><X size={16} /></IconButton>
          </div>
          <div className="dialog-body">{children}</div>
          {footer ? <div className="dialog-foot">{footer}</div> : null}
        </>
      ) : null}
    </dialog>
  );
}

/** Confirmação explícita para ações que não podem ser desfeitas. */
export function Confirm({ open, title, message, confirmLabel, onConfirm, onClose, busy }: { open: boolean; title: string; message: ReactNode; confirmLabel: string; onConfirm: () => void; onClose: () => void; busy?: boolean }) {
  return (
    <Dialog open={open} title={title} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="danger" busy={busy} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <p className="muted">{message}</p>
    </Dialog>
  );
}

interface Toast { id: number; text: string; }
const ToastContext = createContext<(text: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts(current => [...current.slice(-3), { id, text }]);
    window.setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-area" aria-live="polite">{toasts.map(toast => <div key={toast.id} className="toast"><span className="mark" />{toast.text}</div>)}</div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

/** Carrega dados com estado de carregamento/erro e recarga manual. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []): { data: T | null; error: string; loading: boolean; reload: () => void; setData: (value: T) => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    loader().then(value => { if (alive) setData(value); }).catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick(value => value + 1), setData };
}
