import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Brand } from '../components/Brand';
import { Button, Field, Loading, Notice } from '../components/ui';
import { api, errorMessage, get, setCsrf } from '../lib/api';
import { navigate } from '../lib/router';
import type { Brand as BrandInfo, Session } from '../lib/types';

function Side({ brand }: { brand: BrandInfo | null }) {
  return (
    <aside className="auth-side">
      <div className="eyebrow">{brand?.company.name ?? 'Workfoli'}</div>
      <p className="statement">Encontre o que precisa. Entenda o que está acontecendo. <em>Trabalhe com contexto.</em></p>
      <div className="auth-lines">{['Entender', 'Estruturar', 'Executar', 'Evoluir'].map(step => <div key={step}>{step}</div>)}</div>
    </aside>
  );
}

export function Login({ brand, onDone }: { brand: BrandInfo | null; onDone: (session: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const session = await api<Session>('/api/auth/login', { method: 'POST', body: { email, password } });
      setCsrf(session.csrf);
      onDone(session);
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <Side brand={brand} />
      <main className="auth-main">
        <Brand name={brand?.company.name ?? 'Workfoli Hub'} tagline={brand?.company.tagline ?? null} symbol={brand?.symbol ?? null} />
        <div className="stack">
          <h1>Entrar</h1>
          <p className="muted">Acesso privado desta empresa. Cada pessoa usa a própria conta.</p>
        </div>
        <form className="form" onSubmit={submit}>
          {error ? <Notice>{error}</Notice> : null}
          <Field label="E-mail"><input className="input" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required autoFocus /></Field>
          <Field label="Senha"><input className="input" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></Field>
          <Button variant="primary" type="submit" busy={busy}>Entrar</Button>
        </form>
        <p className="faint">Primeiro acesso? Use o link de ativação que você recebeu. Sem link, peça ao responsável pela instalação.</p>
      </main>
    </div>
  );
}

export function Activate({ brand, token, onDone }: { brand: BrandInfo | null; token: string; onDone: (session: Session) => void }) {
  const [info, setInfo] = useState<{ name: string; recovery: boolean; needsEmail: boolean } | null>(null);
  const [invalid, setInvalid] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    get<{ name: string; recovery: boolean; needsEmail: boolean }>(`/api/auth/activation?token=${encodeURIComponent(token)}`)
      .then(value => { setInfo(value); setName(value.name); })
      .catch(cause => setInvalid(errorMessage(cause)));
  }, [token]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) { setError('As senhas não conferem.'); return; }
    setBusy(true); setError('');
    try {
      const session = await api<Session>('/api/auth/activate', { method: 'POST', body: { token, email: email || undefined, password, name: info?.recovery ? undefined : name } });
      setCsrf(session.csrf);
      navigate('/');
      onDone(session);
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <Side brand={brand} />
      <main className="auth-main">
        <Brand name={brand?.company.name ?? 'Workfoli Hub'} tagline={brand?.company.tagline ?? null} symbol={brand?.symbol ?? null} />
        {invalid ? (
          <div className="stack"><h1>Link indisponível</h1><Notice>{invalid}</Notice><p className="muted">Links de ativação valem uma única vez e expiram. Peça um novo ao responsável.</p><Button onClick={() => navigate('/')}>Ir para o login</Button></div>
        ) : !info ? <Loading label="Conferindo o link…" /> : (
          <>
            <div className="stack">
              <h1>{info.recovery ? 'Nova senha' : `Olá, ${info.name.split(' ')[0]}`}</h1>
              <p className="muted">{info.recovery ? 'Defina uma nova senha para voltar a acessar.' : `Ative seu acesso a ${brand?.company.name ?? 'esta empresa'}.`}</p>
            </div>
            <form className="form" onSubmit={submit}>
              {error ? <Notice>{error}</Notice> : null}
              {!info.recovery ? <Field label="Seu nome"><input className="input" value={name} onChange={event => setName(event.target.value)} required maxLength={120} /></Field> : null}
              {info.needsEmail ? <Field label="E-mail de acesso"><input className="input" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /></Field> : null}
              <Field label="Senha" help="Pelo menos 10 caracteres."><input className="input" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={10} /></Field>
              <Field label="Repita a senha"><input className="input" type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} required minLength={10} /></Field>
              <Button variant="primary" type="submit" busy={busy}>{info.recovery ? 'Salvar senha' : 'Ativar acesso'}</Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
