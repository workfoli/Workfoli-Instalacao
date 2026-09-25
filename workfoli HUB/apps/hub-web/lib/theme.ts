import { useEffect, useState } from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';
const KEY = 'workfoli.theme';

function read(fallback: ThemePreference): ThemePreference {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'dark' || value === 'light' || value === 'system' ? value : fallback;
  } catch { return fallback; }
}

function resolve(preference: ThemePreference): 'dark' | 'light' {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Preferência por pessoa (neste navegador); o padrão vem da configuração da instância. */
export function useTheme(fallback: ThemePreference): [ThemePreference, (value: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(() => read(fallback));
  useEffect(() => { setPreference(read(fallback)); }, [fallback]);
  useEffect(() => {
    const apply = () => {
      const resolved = resolve(preference);
      document.documentElement.dataset.theme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#151716' : '#F5F5F1');
    };
    apply();
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);
  const update = (value: ThemePreference) => {
    try { window.localStorage.setItem(KEY, value); } catch { /* navegação privada */ }
    setPreference(value);
  };
  return [preference, update];
}
