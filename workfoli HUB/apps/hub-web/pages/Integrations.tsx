import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, CircleDashed, ExternalLink, KeyRound, Plug, RefreshCw, Settings2, Unplug } from 'lucide-react';
import { Button, Card, Confirm, Dialog, Field, FieldGroup, Loading, Notice, PageHead, Tag, useLoad, useToast } from '../components/ui';
import { errorMessage, get, patch, post } from '../lib/api';
import { formatDateTime, relative } from '../lib/format';
import { navigate } from '../lib/router';

type CardState = 'app-missing' | 'available' | 'connected' | 'attention' | 'expired';
interface IntegrationCard {
  provider: string; label: string; category: string; description: string; kind: 'oauth' | 'token';
  state: CardState; stateLabel: string; account: string | null; connectedAt: string | null; connectedBy: string | null; lastSyncAt: string | null; lastError: string | null;
  scopes: Array<{ scope: string; label: string }>;
  capabilities: Array<{ id: string; label: string; description: string; default: boolean; granted: boolean; missing: string[] }>;
  settings: Record<string, unknown> | null; syncable: boolean;
  declared: Array<{ id: string; label: string | null; purpose: string | null; status: string }>;
  setup?: { appSecrets?: Array<{ name: string; configured: boolean }>; missing?: string[]; tokenLabel?: string; tokenHelp?: string };
  runs?: Array<{ kind: string; status: string; startedAt: string; finishedAt: string | null; stats: Record<string, number>; error: string | null }>;
}
interface View {
  admin: boolean; cards: IntegrationCard[]; callbackUrl: string | null;
  planned: Array<{ id: string; provider: string; label: string; purpose: string | null; status: string }>;
  crmLinks: Array<{ provider: string; leads: boolean; source: string; pipeline?: string }>;
}
type OptionList = { items: Array<{ id: string; label: string; detail?: string | null }> } | { error: string } | { unavailable: string };
interface SyncResult { kind: string; label: string; status: 'ok' | 'error' | 'skipped'; message: string | null; stats?: Record<string, number>; }

const STATE_ICON: Record<CardState, typeof CircleCheck> = { 'app-missing': CircleDashed, available: Plug, connected: CircleCheck, attention: CircleAlert, expired: CircleAlert };
const STATS: Record<string, string> = { campaigns: 'campanhas', rows: 'linhas', forms: 'formulários', received: 'recebidos', created: 'novos', duplicates: 'repetidos', opportunities: 'oportunidades', failed: 'com erro' };

export function IntegrationsPage({ query }: { query: URLSearchParams }) {
  const { data, error, loading, reload } = useLoad(() => get<View>('/api/integrations'));
  const [connecting, setConnecting] = useState<IntegrationCard | null>(null);
  const [managing, setManaging] = useState<IntegrationCard | null>(null);
  const [disconnecting, setDisconnecting] = useState<IntegrationCard | null>(null);
  const [setup, setSetup] = useState<IntegrationCard | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [results, setResults] = useState<{ label: string; items: SyncResult[] } | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const toast = useToast();
  const connected = query.get('conectado');
  const failed = query.get('falhou');
  useEffect(() => {
    if (connected) { setMessage({ tone: 'success', text: 'Conta conectada. Escolha as contas em “Gerenciar” e sincronize.' }); navigate('/integrations'); }
    else if (failed !== null) { setMessage({ tone: 'info', text: 'A conexão não foi concluída. Nada foi gravado; tente de novo.' }); navigate('/integrations'); }
  }, [connected, failed]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice>{error || 'Não foi possível carregar as integrações.'}</Notice>;

  const sync = async (card: IntegrationCard) => {
    setSyncing(card.provider); setMessage(null);
    try {
      const report = await post<{ results: SyncResult[] }>(`/api/integrations/${card.provider}/sync`, {});
      setResults({ label: card.label, items: report.results });
      reload();
    } catch (cause) { setMessage({ tone: 'error', text: errorMessage(cause) }); reload(); } finally { setSyncing(null); }
  };
  const metaLink = data.crmLinks.find(link => link.provider === 'meta');
  return (
    <>
      <PageHead eyebrow="Ferramentas" title="Integrações"
        lead="Cada empresa conecta as próprias contas. A autorização acontece na página do provedor, no seu navegador: o Hub nunca vê a sua senha e guarda os tokens cifrados nesta instância, sem compartilhar com outras empresas." />
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="grid grid-2">{data.cards.map(card => {
        const Icon = STATE_ICON[card.state];
        const live = card.state === 'connected' || card.state === 'attention' || card.state === 'expired';
        const selected = card.settings ? Object.entries(card.settings).filter(([key]) => key !== 'leadsSince') : [];
        return (
          <Card key={card.provider} title={card.label} meta={card.category}
            actions={<Tag tone={card.state === 'connected' ? 'accent' : 'outline'}><Icon size={13} aria-hidden="true" />{card.stateLabel}</Tag>}>
            <div className="stack">
              <p className="muted">{card.description}</p>
              {card.declared.length ? <p className="faint">Planejado na Base: {card.declared.map(item => item.purpose ? `${item.label ?? item.id} — ${item.purpose}` : item.label ?? item.id).join(' · ')}</p> : null}
              {live ? (
                <dl className="facts">
                  <dt>Conta</dt><dd>{card.account ?? '—'}</dd>
                  <dt>Conectado</dt><dd>{card.connectedAt ? `${relative(card.connectedAt)}${card.connectedBy ? ` por ${card.connectedBy}` : ''}` : '—'}</dd>
                  {card.syncable ? <><dt>Última sincronização</dt><dd>{card.lastSyncAt ? formatDateTime(card.lastSyncAt) : 'ainda não'}</dd></> : null}
                  {selected.length ? <><dt>Contas escolhidas</dt><dd>{selected.map(([, value]) => Array.isArray(value) ? value.join(', ') : String(value)).join(' · ')}</dd></> : null}
                  {card.scopes.length ? <><dt>Autorizado</dt><dd><span className="chips-input">{card.scopes.map(scope => <Tag key={scope.scope} tone="outline">{scope.label}</Tag>)}</span></dd></> : null}
                </dl>
              ) : null}
              {card.lastError ? <Notice tone="info">{card.lastError}</Notice> : null}
              {live && card.capabilities.some(capability => !capability.granted) ? <p className="faint">Não autorizado nesta conexão: {card.capabilities.filter(capability => !capability.granted).map(capability => capability.label).join(', ')}. Reconecte para incluir.</p> : null}
              {card.provider === 'meta' && live ? <p className="faint">Leads dos formulários {metaLink?.leads ? `entram no CRM${metaLink.pipeline ? ' com oportunidade aberta' : ''}` : 'não entram no CRM (ative em CRM → Configuração → Integrações)'}.</p> : null}
              {data.admin ? (
                <div className="row">
                  {card.state === 'app-missing' ? <Button onClick={() => setSetup(card)}><KeyRound size={15} />Como ativar</Button> : null}
                  {card.state === 'available' ? <Button variant="primary" onClick={() => setConnecting(card)}><Plug size={15} />{card.provider === 'supabase' ? 'Configurar' : 'Conectar'}</Button> : null}
                  {live && card.syncable ? <Button onClick={() => setManaging(card)}><Settings2 size={15} />Gerenciar</Button> : null}
                  {live && card.syncable ? <Button busy={syncing === card.provider} onClick={() => sync(card)}><RefreshCw size={15} />Sincronizar</Button> : null}
                  {live && card.kind === 'oauth' ? <Button variant="ghost" onClick={() => setConnecting(card)}>Reconectar</Button> : null}
                  {live ? <Button variant="ghost" onClick={() => setDisconnecting(card)}><Unplug size={15} />Desconectar</Button> : null}
                </div>
              ) : null}
            </div>
          </Card>
        );
      })}</div>
      {data.planned.length ? (
        <Card title="Planejadas na Base" meta="Declaradas no manifesto; ainda sem conector nesta versão do Core">
          <div className="list">{data.planned.map(item => (
            <div key={item.id} className="list-item"><div className="grow"><div className="title">{item.label}</div>{item.purpose ? <div className="sub">{item.purpose}</div> : null}</div><Tag tone="outline">Planejada</Tag></div>
          ))}</div>
        </Card>
      ) : null}
      {!data.admin ? <p className="faint">Somente administradores conectam, gerenciam ou desconectam contas.</p> : null}

      {connecting ? <ConnectDialog card={connecting} onClose={() => setConnecting(null)} onConnected={() => { setConnecting(null); toast(`${connecting.label} conectado.`); reload(); }} /> : null}
      {managing ? <ManageDialog card={managing} onClose={() => setManaging(null)} onSaved={() => { setManaging(null); toast('Contas salvas.'); reload(); }} /> : null}
      {setup ? <SetupDialog card={setup} callbackUrl={data.callbackUrl} onClose={() => setSetup(null)} /> : null}
      <Dialog open={!!results} title={results ? `Sincronização — ${results.label}` : ''} onClose={() => setResults(null)} footer={<Button variant="primary" onClick={() => setResults(null)}>Fechar</Button>}>
        <div className="list">{results?.items.map(item => (
          <div key={item.kind} className="list-item">
            <div className="grow">
              <div className="title">{item.label}</div>
              <div className="sub">{item.status === 'ok' ? Object.entries(item.stats ?? {}).map(([key, value]) => `${value} ${STATS[key] ?? key}`).join(' · ') || 'Concluído' : item.message}</div>
            </div>
            <Tag tone={item.status === 'ok' ? 'accent' : 'outline'}>{item.status === 'ok' ? 'Concluído' : item.status === 'skipped' ? 'Pulado' : 'Erro'}</Tag>
          </div>
        ))}</div>
      </Dialog>
      <DisconnectDialog card={disconnecting} onClose={() => setDisconnecting(null)} onDone={text => { setDisconnecting(null); setMessage({ tone: 'success', text }); reload(); }} />
    </>
  );
}

function ConnectDialog({ card, onClose, onConnected }: { card: IntegrationCard; onClose: () => void; onConnected: () => void }) {
  const [capabilities, setCapabilities] = useState<string[]>(() => card.capabilities.filter(item => item.default || item.granted).map(item => item.id));
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true); setError('');
    try {
      if (card.kind === 'token') { await post(`/api/integrations/${card.provider}/token`, { token }); setToken(''); onConnected(); return; }
      const started = await post<{ authorizeUrl: string }>(`/api/integrations/${card.provider}/connect`, { capabilities });
      // O navegador vai para a página oficial do provedor e volta sozinho para o Hub.
      window.location.assign(started.authorizeUrl);
    } catch (cause) { setError(errorMessage(cause)); setBusy(false); }
  };
  return (
    <Dialog open title={`Conectar ${card.label}`} onClose={onClose}
      description={card.kind === 'oauth' ? `Você será levado à página oficial do ${card.label} para entrar e autorizar. Depois volta para cá automaticamente.` : card.setup?.tokenHelp}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" busy={busy} disabled={card.kind === 'oauth' ? !capabilities.length && card.provider !== 'github' : token.trim().length < 16} onClick={go}>{card.kind === 'oauth' ? <>Continuar no {card.label}<ExternalLink size={15} /></> : 'Verificar e conectar'}</Button></>}>
      <div className="form">
        {error ? <Notice>{error}</Notice> : null}
        {card.kind === 'oauth' ? (
          <>
            <p className="muted">Escolha o que a Workfoli pode ler. Pedimos só o necessário para cada recurso:</p>
            {card.capabilities.map(capability => (
              <label key={capability.id} className="checkbox" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" checked={capabilities.includes(capability.id)} onChange={event => setCapabilities(event.target.checked ? [...capabilities, capability.id] : capabilities.filter(item => item !== capability.id))} />
                <span><strong>{capability.label}</strong><br /><span className="faint">{capability.description}{capability.missing.length ? ` Requer também: ${capability.missing.join(', ')}.` : ''}</span></span>
              </label>
            ))}
            <p className="faint">Nunca digite sua senha do {card.label} no Hub. Você pode revogar o acesso a qualquer momento aqui ou no painel da sua conta.</p>
          </>
        ) : (
          <Field label={card.setup?.tokenLabel ?? 'Token'} help="O token é verificado no provedor, guardado cifrado e nunca volta para o navegador.">
            <input className="input" type="password" autoComplete="off" spellCheck={false} value={token} onChange={event => setToken(event.target.value)} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

function ManageDialog({ card, onClose, onSaved }: { card: IntegrationCard; onClose: () => void; onSaved: () => void }) {
  const { data, error, loading } = useLoad(() => get<Record<string, OptionList>>(`/api/integrations/${card.provider}/options`), [card.provider]);
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...(card.settings ?? {}) }));
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const save = async () => {
    setBusy(true); setSaveError('');
    const keys = card.provider === 'google' ? ['adsCustomerId', 'adsLoginCustomerId', 'ga4PropertyId', 'searchConsoleSite'] : ['adAccountId', 'pageIds'];
    try { await patch(`/api/integrations/${card.provider}/settings`, Object.fromEntries(keys.map(key => [key, values[key] === '' ? null : values[key] ?? null]))); onSaved(); }
    catch (cause) { setSaveError(errorMessage(cause)); } finally { setBusy(false); }
  };
  const select = (key: string, label: string, list: OptionList | undefined, help?: string) => (
    <Field label={label} help={list && 'unavailable' in list ? list.unavailable : list && 'error' in list ? list.error : help}>
      <select className="select" value={String(values[key] ?? '')} disabled={!list || !('items' in list)} onChange={event => setValues({ ...values, [key]: event.target.value })}>
        <option value="">Não usar</option>
        {list && 'items' in list ? list.items.map(item => <option key={item.id} value={item.id}>{item.label}{item.detail ? ` (${item.detail})` : ''}</option>) : null}
      </select>
    </Field>
  );
  const pages = data?.pages && 'items' in data.pages ? data.pages.items : [];
  const chosen = Array.isArray(values.pageIds) ? values.pageIds as string[] : [];
  return (
    <Dialog open title={`Contas do ${card.label}`} description="Escolha o que esta empresa acompanha. Só aparecem contas que a conexão autorizada enxerga." onClose={onClose} wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" busy={busy} disabled={!data} onClick={save}>Salvar</Button></>}>
      {loading && !data ? <Loading label="Consultando o provedor…" /> : error ? <Notice>{error}</Notice> : (
        <div className="form">
          {saveError ? <Notice>{saveError}</Notice> : null}
          {card.provider === 'google' ? (
            <>
              {select('adsCustomerId', 'Conta do Google Ads', data?.adsCustomers)}
              <Field label="Conta gerenciadora (MCC), se houver" help="Opcional: só quando o acesso à conta vem por uma conta gerenciadora."><input className="input" inputMode="numeric" value={String(values.adsLoginCustomerId ?? '')} onChange={event => setValues({ ...values, adsLoginCustomerId: event.target.value })} placeholder="123-456-7890" /></Field>
              {select('ga4PropertyId', 'Propriedade do Google Analytics 4', data?.ga4Properties)}
              {select('searchConsoleSite', 'Site no Search Console', data?.sites)}
            </>
          ) : (
            <>
              {select('adAccountId', 'Conta de anúncios', data?.adAccounts)}
              <FieldGroup label="Páginas com formulários de lead" help={data?.pages && !('items' in data.pages) ? ('unavailable' in data.pages ? data.pages.unavailable : data.pages.error) : 'Os leads destas páginas entram no CRM se a regra estiver ligada na configuração do CRM.'}>
                <div className="chips-input">{pages.map(page => (
                  <button key={page.id} type="button" className="chip-toggle" aria-pressed={chosen.includes(page.id)} onClick={() => setValues({ ...values, pageIds: chosen.includes(page.id) ? chosen.filter(id => id !== page.id) : [...chosen, page.id] })}>{page.label}</button>
                ))}{!pages.length ? <span className="faint">Nenhuma página disponível.</span> : null}</div>
              </FieldGroup>
            </>
          )}
          {card.runs?.length ? (
            <div className="stack" style={{ gap: 6 }}>
              <div className="nav-label" style={{ padding: 0 }}>Últimas sincronizações</div>
              {card.runs.map(run => <div key={`${run.kind}-${run.startedAt}`} className="small"><Tag tone={run.status === 'ok' ? 'accent' : 'outline'}>{run.status === 'ok' ? 'ok' : run.status === 'running' ? 'em andamento' : 'erro'}</Tag> {run.kind} · {relative(run.startedAt)}{run.error ? ` · ${run.error}` : ''}</div>)}
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

function SetupDialog({ card, callbackUrl, onClose }: { card: IntegrationCard; callbackUrl: string | null; onClose: () => void }) {
  return (
    <Dialog open title={`Ativar ${card.label} nesta instalação`} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Entendi</Button>}
      description="A conexão usa o app OAuth oficial desta instalação. Enquanto as credenciais do app não forem configuradas, a ativação real fica bloqueada — o restante do Hub funciona normalmente.">
      <div className="stack">
        <div className="nav-label" style={{ padding: 0 }}>Credenciais do app (somente nomes)</div>
        {(card.setup?.appSecrets ?? []).map(secret => <div key={secret.name} className="row small"><KeyRound size={14} /><code>{secret.name}</code><Tag tone={secret.configured ? 'accent' : 'outline'}>{secret.configured ? 'configurada' : 'ausente'}</Tag></div>)}
        <p className="faint">No computador da instalação, na pasta do Workfoli Hub, envie o valor pela entrada padrão (ele nunca aparece na tela): <code>{'Get-Content valor.txt | .\\workfoli.cmd secrets set <pasta-da-instância> NOME'}</code></p>
        {callbackUrl ? <><div className="nav-label" style={{ padding: 0 }}>Endereço de retorno para cadastrar no app</div><code style={{ wordBreak: 'break-all' }}>{callbackUrl}</code></> : null}
        <p className="faint">Veja o passo a passo em docs/integracoes.md (Google Cloud, Meta for Developers, GitHub).</p>
      </div>
    </Dialog>
  );
}

function DisconnectDialog({ card, onClose, onDone }: { card: IntegrationCard | null; onClose: () => void; onDone: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    if (!card) return;
    setBusy(true); setError('');
    try { const result = await post<{ message: string }>(`/api/integrations/${card.provider}/disconnect`); onDone(result.message); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return (
    <Confirm open={!!card} title={card ? `Desconectar ${card.label}?` : ''} confirmLabel="Desconectar" busy={busy} onConfirm={run} onClose={onClose}
      message={<>{error ? <Notice>{error}</Notice> : null}O acesso é revogado no provedor (quando ele permite) e os tokens são apagados do cofre. Dados já sincronizados e leads no CRM continuam, pois são da empresa.</>} />
  );
}

