import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { LogOut, Menu, Monitor, Moon, Sun } from 'lucide-react';
import { ModuleIcon } from './Icon';
import { Brand } from './Brand';
import { IconButton } from './ui';
import { initials, ROLE_LABELS, relative } from '../lib/format';
import type { ModuleInfo, Session } from '../lib/types';
import type { ThemePreference } from '../lib/theme';

const GROUPS: Array<{ label: string; ids: string[] }> = [
  { label: 'Operação', ids: ['overview', 'tasks', 'crm', 'marketing', 'projects'] },
  { label: 'Empresa', ids: ['company', 'knowledge', 'files'] },
  { label: 'Ferramentas', ids: ['ai', 'integrations', 'history'] },
  { label: 'Administração', ids: ['users', 'settings'] },
];

export function routeFor(id: string): string { return id === 'overview' ? '#/' : `#/${id}`; }

function NavLink({ module, current, onNavigate }: { module: ModuleInfo; current: boolean; onNavigate: () => void }) {
  return (
    <a className="nav-item" href={routeFor(module.id)} aria-current={current ? 'page' : undefined} onClick={onNavigate}>
      <ModuleIcon name={module.icon} />{module.label}
    </a>
  );
}

export function Shell({ session, symbol, active, title, theme, onTheme, onLogout, children }: {
  session: Session; symbol: string | null; active: string; title: string; theme: ThemePreference;
  onTheme: (value: ThemePreference) => void; onLogout: () => void; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [active]);
  const byId = new Map(session.modules.active.map(module => [module.id, module]));
  const custom = session.modules.custom.map(module => ({ ...module, id: `m/${module.id}` }));
  const nextTheme: Record<ThemePreference, ThemePreference> = { dark: 'light', light: 'system', system: 'dark' };
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const themeLabel = { dark: 'Tema escuro', light: 'Tema claro', system: 'Tema do sistema' }[theme];
  return (
    <div className="app">
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Navegação">
        <Brand name={session.company.name} tagline={session.company.tagline} symbol={symbol} />
        <div className="sidebar-nav">
        {GROUPS.map(group => {
          const modules = group.ids.map(id => byId.get(id)).filter((module): module is ModuleInfo => !!module);
          const extra = group.label === 'Operação' ? custom : [];
          if (!modules.length && !extra.length) return null;
          return (
            <nav className="nav-group" key={group.label} aria-label={group.label}>
              <div className="nav-label">{group.label}</div>
              {modules.map(module => <NavLink key={module.id} module={module} current={active === module.id} onNavigate={() => setOpen(false)} />)}
              {extra.map(module => <NavLink key={module.id} module={module} current={active === module.id} onNavigate={() => setOpen(false)} />)}
            </nav>
          );
        })}
        {session.modules.planned.length ? (
          <nav className="nav-group" aria-label="Módulos planejados">
            <div className="nav-label">Planejados</div>
            {session.modules.planned.map(module => (
              <a key={module.id} className="nav-item planned" href={`#/planned/${module.id}`} aria-current={active === `planned/${module.id}` ? 'page' : undefined}>
                <ModuleIcon name={module.icon} />{module.label}<span className="soon">em breve</span>
              </a>
            ))}
          </nav>
        ) : null}
        </div>
        <div className="sidebar-foot">
          <div className="user-card">
            <span className="avatar" aria-hidden="true">{initials(session.user.name)}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="name">{session.user.name}</div>
              <div className="role">{ROLE_LABELS[session.user.roleId] ?? session.user.roleId}</div>
            </div>
            <IconButton label={`${themeLabel} (trocar)`} small onClick={() => onTheme(nextTheme[theme])}><ThemeIcon size={16} /></IconButton>
            <IconButton label="Sair" small onClick={onLogout}><LogOut size={16} /></IconButton>
          </div>
          <div className="signature"><span>Workfoli Hub</span><span>{session.version}</span></div>
        </div>
      </aside>
      <div className={`scrim${open ? ' open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="main">
        <header className="topbar">
          <IconButton label="Abrir menu" className="icon-btn menu-button" onClick={() => setOpen(true)}><Menu size={18} /></IconButton>
          <span className="title">{title}</span>
          <span className="spacer" />
          <BaseStatusPill session={session} />
        </header>
        <main className="content" id="conteudo">{children}</main>
      </div>
    </div>
  );
}

function BaseStatusPill({ session }: { session: Session }) {
  const base = session.base;
  const label = !base.available ? (base.mode === 'remote' ? 'Aguardando o computador da Base' : 'Base indisponível')
    : base.mode === 'remote' ? `Base sincronizada ${relative(base.updatedAt)}` : 'Base conectada';
  return <span className={`tag${base.available ? ' accent' : ''} hide-mobile`} title={base.message ?? undefined}><span className="pip" />{label}</span>;
}
