import { useEffect, useState } from 'react';

export interface Route { path: string; segments: string[]; query: URLSearchParams; }

/** Trecho de rota decodificado; um % malformado (link colado pela metade) fica como está em vez de derrubar a interface. */
const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };

/** Rotas no fragmento (#/...): o servidor só entrega a interface, e tokens de ativação nunca vão ao servidor pela URL. */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?', 2) as [string, string | undefined];
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  return { path, segments: path.split('/').filter(Boolean).map(decode), query: new URLSearchParams(queryPart ?? '') };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const update = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
}

export function navigate(to: string) {
  const target = to.startsWith('#') ? to : `#${to}`;
  if (window.location.hash !== target) window.location.hash = target;
}

export function href(path: string, query?: Record<string, string>) {
  const search = query ? `?${new URLSearchParams(query).toString()}` : '';
  return `#${path}${search}`;
}
