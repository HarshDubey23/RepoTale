'use client';
import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';
const read = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export function ThemeToggle() {
  // The server cannot know the theme; the inline script in <head> has already set it before paint.
  const theme = useSyncExternalStore(subscribe, read, () => 'dark' as Theme);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const flip = () => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('rt-theme', next); } catch { /* private mode: the choice lasts for this page only */ }
    listeners.forEach(f => f());
  };
  return (
    <button type="button" onClick={flip} aria-label={`Switch to ${next} theme`}
      className="grid size-10 place-items-center rounded-m border border-border text-text-2 transition-colors duration-150 ease-rt hover:border-border-strong hover:text-text">
      {theme === 'dark' ? <Sun aria-hidden size={18} strokeWidth={1.75} /> : <Moon aria-hidden size={18} strokeWidth={1.75} />}
    </button>
  );
}
