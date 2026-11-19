'use client';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* no clipboard permission: the command stays selectable */ }
  };
  return (
    <div className="flex items-center gap-2 rounded-m border border-border bg-surface py-1.5 pl-4 pr-1.5">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-mono-s text-text"><span className="select-none text-text-2" aria-hidden>$ </span>{command}</code>
      <button type="button" onClick={copy} aria-label={copied ? 'Copied' : 'Copy command'}
        className="grid size-9 shrink-0 place-items-center rounded-s text-text-2 transition-colors duration-150 ease-rt hover:bg-surface-2 hover:text-text">
        {copied ? <Check aria-hidden size={16} className="text-verified" /> : <Copy aria-hidden size={16} />}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? 'Command copied' : ''}</span>
    </div>
  );
}
