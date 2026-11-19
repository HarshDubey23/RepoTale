'use client';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { target } from '@/lib/target';

export function RepoForm() {
  const id = useId();
  const [error, setError] = useState('');
  const [going, setGoing] = useState(false);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get('repo') ?? '');
    if (!value.trim()) return setError('Paste a GitHub repository first, like sindresorhus/ky.');
    const to = target(value);
    if (!to) return setError('That is not a GitHub repository. Use owner/name, a github.com link, or a pull request link.');
    setError('');
    setGoing(true);
    location.assign(to);
  };

  return (
    <form onSubmit={submit} noValidate className="w-full max-w-[560px]">
      <label htmlFor={id} className="sr-only">GitHub repository or pull request</label>
      <div className={`flex items-center gap-2 rounded-l border bg-surface p-1.5 shadow-rt transition-colors duration-150 ease-rt focus-within:border-accent ${error ? 'border-invented' : 'border-border-strong'}`}>
        <input id={id} name="repo" type="text" inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck={false}
          placeholder="Paste a repo URL" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : `${id}-hint`}
          onChange={() => error && setError('')}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-mono-s text-text outline-none placeholder:text-text-2 focus-visible:outline-none" />
        <button type="submit" disabled={going}
          className="inline-flex shrink-0 items-center gap-2 rounded-m bg-accent px-4 py-2.5 text-small font-semibold text-on-accent transition-colors duration-150 ease-rt hover:bg-accent-hover disabled:cursor-progress">
          {going ? <><LoaderCircle aria-hidden size={16} className="animate-spin" />Opening</> : <>Read it<ArrowRight aria-hidden size={16} /></>}
        </button>
      </div>
      <p id={`${id}-error`} role="alert" className={`mt-2 min-h-[1.45em] text-small ${error ? 'text-invented-text' : ''}`}>{error}</p>
      <p id={`${id}-hint`} className="sr-only">For example sindresorhus/ky, a github.com link, or a pull request link.</p>
    </form>
  );
}
