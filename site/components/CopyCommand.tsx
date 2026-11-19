'use client';
import { Check, Copy, Link2 } from 'lucide-react';
import { useState } from 'react';

/** A command to copy, or with `share` a page path, copied as a full link on this site. */
export function CopyCommand({ command, share = false }: { command: string; share?: boolean }) {
  const [copied, setCopied] = useState(false);
  const what = share ? 'link' : 'command';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(share ? new URL(command, location.href).href : command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* no clipboard permission: the text stays selectable */ }
  };
  return (
    <div className="flex items-center gap-2 rounded-m border border-border bg-surface py-1.5 pl-4 pr-1.5">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-mono-s text-text">
        {share ? <Link2 aria-hidden size={14} className="mr-2 inline align-[-2px] text-text-2" /> : <span className="select-none text-text-2" aria-hidden>$ </span>}{command}
      </code>
      <button type="button" onClick={copy} aria-label={copied ? 'Copied' : `Copy ${what}`}
        className="grid size-9 shrink-0 place-items-center rounded-s text-text-2 transition-colors duration-150 ease-rt hover:bg-surface-2 hover:text-text">
        {copied ? <Check aria-hidden size={16} className="text-verified" /> : <Copy aria-hidden size={16} />}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? `${share ? 'Link' : 'Command'} copied` : ''}</span>
    </div>
  );
}
