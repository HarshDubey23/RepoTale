// The storyboard is the whole contract: an agent (or a person) writes it, `reporeel render` turns it
// into a video. Everything the video says and shows is in this one file, so it can be reviewed,
// diffed and re-rendered when the app changes.

export type Action =
  | { click: string }                          // a Playwright selector
  | { type: [selector: string, text: string] }
  | { press: string }                          // e.g. "Enter"
  | { hover: string }
  | { scroll: string | number }                // selector to bring into view, or pixels
  | { zoom: string }                           // zoom the camera onto an element, then back out
  | { wait: number }                           // ms
  | { waitFor: string };                       // wait until a selector is visible

/** `say` is the narration; `say_hi`, `say_ta`, ... hold translations used by `--lang`. `evidence` cites what backs the scene. */
export type Scene = { say: string; id?: string; evidence?: import('./evidence.ts').Evidence[]; [lang: `say_${string}`]: string | undefined } & (
  | { type: 'title'; heading: string; sub?: string }
  | { type: 'web'; url?: string; actions?: Action[] }
  | { type: 'code'; file: string; lines?: [number, number]; highlight?: [number, number][]; caption?: string }
  | { type: 'diagram'; mermaid: string; caption?: string }
  | { type: 'terminal'; commands: string[]; cwd?: string; timeoutMs?: number }
  | { type: 'stats'; heading?: string; items: { value: string; label: string }[] }
  | { type: 'end'; heading: string; links?: string[] }
);

export const SCHEMA_URL = 'https://raw.githubusercontent.com/HarshDubey23/RepoTale/main/schema/reporeel.schema.json';

export interface Storyboard {
  /** Editors use this for autocomplete and checking; reporeel ignores it. */
  $schema?: string;
  title: string;
  /** Folder of the project (relative to this file), or an owner/name label shown on the title card. */
  repo?: string;
  /** The running app, for web scenes. `start` is run in `repo` and awaited until `url` answers. */
  app?: { url: string; start?: string; readyTimeoutMs?: number };
  voice?: { provider: 'kokoro' | 'elevenlabs' | 'none'; voice?: string; speed?: number };
  theme?: { accent?: string; captions?: boolean };
  size?: { width: number; height: number };
  scenes: Scene[];
}

const TYPES = ['title', 'web', 'code', 'diagram', 'terminal', 'stats', 'end'];
const ACTIONS = ['click', 'type', 'press', 'hover', 'scroll', 'zoom', 'wait', 'waitFor'];

/** Returns a list of problems; empty means the storyboard can be rendered. */
export function validate(sb: any): string[] {
  const errs: string[] = [];
  if (!sb || typeof sb !== 'object') return ['storyboard must be a JSON object'];
  if (typeof sb.title !== 'string' || !sb.title) errs.push('title: required');
  if (sb.app?.url !== undefined && !/^https?:/i.test(String(sb.app.url))) errs.push('app.url: must be http or https');
  if (!Array.isArray(sb.scenes) || !sb.scenes.length) errs.push('scenes: need at least one');
  (sb.scenes ?? []).forEach((s: any, i: number) => {
    const at = `scenes[${i}]`;
    if (!TYPES.includes(s?.type)) return errs.push(`${at}.type: one of ${TYPES.join(', ')}`);
    if (typeof s.say !== 'string' || !s.say.trim()) errs.push(`${at}.say: the narration for this scene is required`);
    if (s.type === 'web' && !sb.app?.url && !/^https?:/.test(s.url ?? '')) errs.push(`${at}: web scenes need app.url or an absolute url`);
    if (s.type === 'web' && /^[a-z][a-z0-9+.-]*:/i.test(s.url ?? '') && !/^https?:/i.test(s.url)) errs.push(`${at}.url: only http and https pages can be recorded`);
    if (s.type === 'code' && typeof s.file !== 'string') errs.push(`${at}.file: required`);
    else if (s.type === 'code' && (/^([\\/]|[a-z]:)/i.test(s.file) || /(^|[\\/])\.\.([\\/]|$)/.test(s.file))) errs.push(`${at}.file: must be a path inside the repo`);
    if (s.type === 'diagram' && typeof s.mermaid !== 'string') errs.push(`${at}.mermaid: required`);
    if (s.type === 'terminal' && !(Array.isArray(s.commands) && s.commands.length)) errs.push(`${at}.commands: required`);
    if (s.type === 'stats' && !(Array.isArray(s.items) && s.items.length)) errs.push(`${at}.items: required`);
    if ((s.type === 'title' || s.type === 'end') && typeof s.heading !== 'string') errs.push(`${at}.heading: required`);
    if (s.evidence !== undefined && !Array.isArray(s.evidence)) errs.push(`${at}.evidence: must be a list`);
    else (s.evidence ?? []).forEach((e: any, j: number) => {
      if (!['file', 'symbol', 'test'].includes(e?.kind) || typeof e.id !== 'string' || !e.id) errs.push(`${at}.evidence[${j}]: needs kind (file, symbol or test) and id`);
      else if (e.lines !== undefined && !(Array.isArray(e.lines) && e.lines.length === 2)) errs.push(`${at}.evidence[${j}].lines: [first, last]`);
    });
    (s.actions ?? []).forEach((a: any, j: number) => {
      const keys = Object.keys(a ?? {});
      if (keys.length !== 1 || !ACTIONS.includes(keys[0])) errs.push(`${at}.actions[${j}]: one of ${ACTIONS.join(', ')}`);
    });
  });
  return errs;
}
