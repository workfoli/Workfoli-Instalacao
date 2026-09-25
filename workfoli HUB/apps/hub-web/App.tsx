import { useCallback, useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Shell } from './components/Shell';
import { Empty, Loading, ToastProvider } from './components/ui';
import { api, get, onUnauthorized, setCsrf } from './lib/api';
import { useRoute } from './lib/router';
import { useTheme } from './lib/theme';
import type { Brand, Session } from './lib/types';
import { Activate, Login } from './pages/Access';
import { AssistantPage } from './pages/Assistant';
import { CompanyPage } from './pages/Company';
import { CrmPage } from './pages/crm/CrmPage';
import { FilesPage } from './pages/Files';
import { HistoryPage } from './pages/History';
import { IntegrationsPage } from './pages/Integrations';
import { KnowledgePage } from './pages/Knowledge';
import { MarketingPage } from './pages/Marketing';
import { CustomModulePage, PlannedModulePage } from './pages/Modules';
import { OverviewPage } from './pages/Overview';
import { ProjectDetailPage, ProjectsPage } from './pages/Projects';
import { SettingsPage } from './pages/Settings';
import { TasksPage } from './pages/Tasks';
import { UsersPage } from './pages/Users';

export default function App() {
  return <ToastProvider><Root /></ToastProvider>;
}

function Root() {
  const route = useRoute();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [theme, setTheme] = useTheme(session?.theme ?? brand?.theme ?? 'dark');

  const accept = useCallback((value: Session | null) => { if (value) setCsrf(value.csrf); setSession(value); }, []);
  useEffect(() => {
    get<Brand>('/api/brand').then(setBrand).catch(() => setBrand(null));
    get<Session>('/api/session').then(accept).catch(() => accept(null));
    return onUnauthorized(() => setSession(null));
  }, [accept]);
  useEffect(() => {
    const name = session?.company.name ?? brand?.company.name;
    document.title = name ? `${name} · Workfoli Hub` : 'Workfoli Hub';
    if (brand?.symbol) {
      const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (icon) { icon.href = brand.symbol; icon.type = 'image/png'; }
    }
  }, [brand, session]);

  // Troca de senha já encerra as sessões no servidor: só volta para a entrada, sem chamar "sair" de novo.
  const sessionEnded = useCallback(() => { setSession(null); window.location.hash = '#/'; }, []);
  const logout = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* sessão já encerrada */ }
    setSession(null);
    window.location.hash = '#/';
  }, []);

  if (route.path === '/ativar') return <Activate brand={brand} token={route.query.get('token') ?? ''} onDone={accept} />;
  if (session === undefined) return <div className="auth"><div /><main className="auth-main"><Loading label="Abrindo o Hub…" /></main></div>;
  if (!session) return <Login brand={brand} onDone={accept} />;

  const [first = '', second] = route.segments;
  const moduleId = first === '' ? 'overview' : first === 'm' ? `m/${second}` : first === 'planned' ? `planned/${second}` : first;
  const active = new Set(session.modules.active.map(module => module.id));
  const allowed = moduleId.startsWith('m/') ? session.modules.custom.some(module => `m/${module.id}` === moduleId) : moduleId.startsWith('planned/') || active.has(moduleId);
  const titles: Record<string, string> = Object.fromEntries([...session.modules.active, ...session.modules.custom.map(module => ({ ...module, id: `m/${module.id}` }))].map(module => [module.id, module.label]));
  const title = moduleId.startsWith('planned/') ? session.modules.planned.find(module => module.id === second)?.label ?? 'Planejado' : titles[moduleId] ?? session.company.name;

  let page;
  if (!allowed) page = <Empty icon={<Lock size={20} />} title="Sem acesso a esta área">Seu papel não inclui este módulo, ou ele não está ativo nesta empresa.</Empty>;
  else if (moduleId === 'overview') page = <OverviewPage session={session} />;
  else if (moduleId === 'company') page = <CompanyPage />;
  else if (moduleId === 'knowledge') page = <KnowledgePage session={session} selected={route.query.get('doc')} />;
  else if (moduleId === 'projects') page = second ? <ProjectDetailPage id={second} /> : <ProjectsPage session={session} />;
  else if (moduleId === 'files') page = <FilesPage />;
  else if (moduleId === 'tasks') page = <TasksPage session={session} />;
  else if (moduleId === 'crm') page = <CrmPage segments={route.segments.slice(1)} query={route.query} />;
  else if (moduleId === 'marketing') page = <MarketingPage />;
  else if (moduleId === 'integrations') page = <IntegrationsPage query={route.query} />;
  else if (moduleId === 'ai') page = <AssistantPage initial={route.query.get('q')} />;
  else if (moduleId === 'history') page = <HistoryPage />;
  else if (moduleId === 'users') page = <UsersPage session={session} />;
  else if (moduleId === 'settings') page = <SettingsPage session={session} onSessionEnded={sessionEnded} />;
  else if (moduleId.startsWith('m/')) page = <CustomModulePage id={second!} session={session} />;
  else if (moduleId.startsWith('planned/')) page = <PlannedModulePage module={session.modules.planned.find(module => module.id === second)} />;
  else page = <Empty title="Página não encontrada" />;

  return (
    <Shell session={session} symbol={brand?.symbol ?? null} active={moduleId} title={title} theme={theme} onTheme={setTheme} onLogout={logout}>
      {page}
    </Shell>
  );
}
