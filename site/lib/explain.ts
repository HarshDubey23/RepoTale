// What a newcomer asks first: what is this, what does it do, how do I use it, and what does each part do. The
// answers come from what the authors wrote: the README (its opening paragraph, its feature list, its install
// command and first example) and the doc comments in the code. Each answer keeps the line it was read from, so
// it can be cited like everything else. When the authors wrote nothing, the answer says only what the code
// shows (the names a file defines); nothing is made up.

export interface Said { text: string; line: number; kind?: 'module' | 'class' | 'function' | 'type'; name?: string }
export interface Readme { intro: Said | null; features: Said[]; install: Said | null; example: { lang: string; code: string[]; line: number } | null }

/** Markdown to plain words: links, emphasis, inline code, images and HTML are reduced to their text. */
export function plain(s: string) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1').replace(/\[([^\]]+)\]/g, '$1')
    .replace(/<[^>]+>/g, '').replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1').replace(/`([^`]+)`/g, '$1')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ').trim();
}
const firstSentences = (s: string, max = 220) => {
  const parts = s.split(/(?<=[.!?])\s+(?=[A-Z])/);
  let out = parts[0] ?? '';
  for (const p of parts.slice(1)) { if ((out + ' ' + p).length > max) break; out += ' ' + p; }
  return out.length > max ? `${out.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : out;
};

const INSTALL = /^\s*(?:\$\s*)?(npm (?:i|install)|yarn add|pnpm (?:add|i)|bun add|pip3? install|uv add|poetry add|go get|go install|cargo add|gem install|composer require)\s+(?!-g\b)\S.*$/;
const CODE_LANG = /^(js|javascript|jsx|ts|typescript|tsx|mjs|py|python|go|golang|rust|rs|ruby|rb)$/i;

export function readReadme(text: string | null | undefined): Readme {
  const out: Readme = { intro: null, features: [], install: null, example: null };
  if (!text) return out;
  const lines = text.split(/\r?\n/);
  let fence: { lang: string; start: number; body: string[] } | null = null;
  let heading = '', para: { start: number; body: string[] } | null = null, list: Said[] = [], listHeading = '';
  const endPara = () => {
    if (para && !out.intro) {
      const t = plain(para.body.join(' '));
      // A paragraph of prose: long enough, and not a row of badges or a table of contents.
      if (t.length > 40 && /[a-z]{3,}.*[.!:]?/.test(t) && !/^(table of contents|contents)\b/i.test(t)) out.intro = { text: firstSentences(t), line: para.start };
    }
    para = null;
  };
  const endList = () => {
    // Features are a bullet list under a heading that says so, of short items that are not just links.
    if (!out.features.length && list.length >= 2 && /feature|benefit|highlight|why|what|offers|includes/i.test(listHeading)) out.features = list.slice(0, 5);
    list = [];
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd(), n = i + 1;
    const f = line.match(/^\s*(```|~~~)\s*([\w+-]*)/);
    if (f) {
      if (fence) {
        const body = fence.body;
        if (!out.install) { const k = body.findIndex(l => INSTALL.test(l)); if (k !== -1) out.install = { text: body[k]!.replace(/^\s*\$\s*/, '').trim(), line: fence.start + 1 + k }; }
        const code = body.length >= 3 && body.length <= 18 && !body.some(l => INSTALL.test(l)) && (CODE_LANG.test(fence.lang) || (!fence.lang && body.some(l => /[(){}=]/.test(l))));
        if (!out.example && code) out.example = { lang: fence.lang, code: body, line: fence.start + 1 };
        fence = null;
      } else { endPara(); endList(); fence = { lang: f[2] ?? '', start: n, body: [] }; }
      return;
    }
    if (fence) { fence.body.push(raw.replace(/\t/g, '  ')); return; }
    const h = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    if (h) { endPara(); endList(); heading = plain(h[1]!); return; }
    const b = line.match(/^\s{0,3}[-*+]\s+(.*)$/);
    if (b) {
      endPara();
      if (!list.length) listHeading = heading;
      const t = plain(b[1]!);
      if (t && !/^\[?[^\]]*\]?\(#/.test(b[1]!) && t.length <= 120 && !/^https?:/.test(t)) list.push({ text: t, line: n });
      return;
    }
    if (!line.trim()) { endPara(); if (list.length) endList(); return; }
    // A quoted line is often the project's one-line pitch (ky's "> Ky is a tiny and elegant HTTP client"); a
    // GitHub alert ("> [!NOTE]") is not.
    const quote = line.match(/^\s*>\s?(?!\s*\[!)(.*)$/);
    if (/^\s*(<|\[!\[|!\[|\[[^\]]+\]:|\||---|===)/.test(line) || (/^\s*>/.test(line) && !quote)) { endPara(); return; }
    if (list.length) endList();
    (para ??= { start: n, body: [] }).body.push(quote ? quote[1]! : line);
  });
  endPara(); endList();
  return out;
}

const LICENSE = /copyright|licen[sc]e|all rights reserved|@flow|eslint|prettier|ts-check|^!/i;

/** What a file does, in its authors' words: its module doc comment, else the doc comment of the first thing it
 *  exports. Null when there is none: the caller then says only what the file defines. */
export function roleOf(text: string, file: string): Said | null {
  const lines = text.split(/\r?\n/);
  // Comment marks, JSDoc tags, reStructuredText underlines and roles (:class:`~flask.Flask` reads "Flask") go.
  const clean = (s: string) => firstSentences(plain(s
    .replace(/\s*\*\/\s*$/gm, ' ').replace(/^\s*(\/\*\*?|\*\/|\*|\/\/+|#+|"""|''')\s?/gm, ' ').replace(/^\s*[~=\-^]{3,}\s*$/gm, ' ')
    .replace(/(^|\s)(:param\b|:returns?:|:raises\b|:meta\b|Args:|Returns:|Raises:|Example:)[\s\S]*$/, ' ')
    .replace(/:[\w:]+:`~?([^`]+)`/g, (_, x: string) => x.split('.').pop() ?? x).replace(/@\w+[\s\S]*$/, '')), 180);
  // Four words at least, and not boilerplate ("Module exports.", "Expose createApplication().").
  const good = (s: string) => s.split(/\s+/).length >= 4 && /[a-z]/.test(s) && !LICENSE.test(s) && !/^(module exports|expose\b|exports?\b|private\b|internal\b)/i.test(s);
  if (/\.py$/.test(file)) {
    // A module docstring is the first statement; else the docstring under the first public class or def.
    const first = lines.findIndex(l => l.trim() && !l.trim().startsWith('#'));
    const doc = (at: number) => {
      const m = lines[at]?.match(/^\s*[rbu]?("""|''')(.*)$/);
      if (!m) return null;
      const q = m[1]!, body = [m[2]!];
      if (!m[2]!.includes(q)) for (let k = at + 1; k < lines.length && k < at + 30; k++) { body.push(lines[k]!); if (lines[k]!.includes(q)) break; }
      const t = clean(body.join('\n').split(q)[0]!);
      return good(t) ? { text: t, line: at + 1 } : null;
    };
    const mod = first >= 0 ? doc(first) : null;
    if (mod) return { ...mod, kind: 'module' };
    // The first public class that is not an exception says most about a module; else its first public function.
    const pub = /^(class|def|async def)\s+[A-Za-z]\w*/, error = /^class\s+\w*(Error|Exception|Warning)\b|^class\s+\w+\([^)]*(Error|Exception)\b/;
    let def = lines.findIndex(l => /^class\s/.test(l) && pub.test(l) && !error.test(l));
    if (def === -1) def = lines.findIndex(l => /^(def|async def)\s/.test(l) && pub.test(l));
    if (def === -1) return null;
    let k = def; while (k < lines.length && !/:\s*(#.*)?$/.test(lines[k]!)) k++;
    const d = doc(k + 1);
    return d && { ...d, kind: /^class\s/.test(lines[def]!) ? 'class' : 'function', name: lines[def]!.match(/^(?:class|def|async def)\s+(\w+)/)?.[1] };
  }
  // JavaScript, TypeScript, Go: a leading comment block that is not a licence, else the comment above the first export.
  const block = (end: number) => {
    let start = end;
    if (/\*\/\s*$/.test(lines[end] ?? '')) { while (start > 0 && !/\/\*/.test(lines[start]!)) start--; }
    else if (/^\s*\/\//.test(lines[end] ?? '')) { while (start > 0 && /^\s*\/\//.test(lines[start - 1]!)) start--; }
    else return null;
    const t = clean(lines.slice(start, end + 1).join('\n'));
    return good(t) ? { text: t, line: start + 1 } : null;
  };
  // A comment at the very top speaks for the file only when a blank line, an import or Go's package line follows
  // it; one that runs straight into a declaration is that declaration's comment.
  const top = lines.findIndex(l => l.trim());
  if (top >= 0 && /^\s*(\/\*\*|\/\/)/.test(lines[top]!)) {
    let end = top;
    if (/\/\*/.test(lines[top]!)) while (end < lines.length - 1 && !/\*\//.test(lines[end]!)) end++;
    else while (end < lines.length - 1 && /^\s*\/\//.test(lines[end + 1]!)) end++;
    const next = (lines[end + 1] ?? '').trim(), t = block(end);
    if (t && (/\.go$/.test(file) ? /^package\b/.test(next) : !next || /^(import|const \w+ = require|'use|"use)/.test(next))) return { ...t, kind: 'module' };
  }
  // Else the comment on an exported class (it tends to say what the file is for), then on the first export.
  const exported = /^(export\s|func\s+[A-Z]|type\s+[A-Z]|exports\.)|module\.exports\s*=/;
  const docAt = (exp: number) => {
    let above = exp - 1;
    while (above > 0 && (/^\s*@/.test(lines[above]!) || (!lines[above]!.trim() && above === exp - 1))) above--;
    const t = exp > 0 ? block(above) : null;
    const l = lines[exp]!;
    return t && { ...t, kind: (/\bclass\s/.test(l) ? 'class' : /\b(interface|type|enum)\s+\w/.test(l) && !/^func/.test(l) ? 'type' : 'function') as Said['kind'], name: l.match(/\bclass\s+(\w+)/)?.[1] };
  };
  const cls = lines.findIndex(l => exported.test(l) && /\bclass\s/.test(l));
  const c = cls > 0 ? docAt(cls) : null;
  if (c) return c;
  const exp = lines.findIndex(l => exported.test(l));
  return exp > 0 ? docAt(exp) : null;
}

/** Whether a doc comment speaks for its whole file: a module's own, or a class named like the file or the project
 *  (KyError in KyError.ts, App in app.py, Flask in a project called flask). A function's comment describes only it. */
export function speaksForFile(r: Said | null, file: string, project: string): r is Said {
  if (!r) return false;
  if (r.kind === 'module') return true;
  if (r.kind !== 'class' || !r.name) return false;
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = norm(r.name), stem = norm((file.split('/').pop() ?? file).replace(/\.[a-z]+$/, '')), p = norm(project);
  return !!stem && ((!!p && n === p) || n.includes(stem) || (stem.length > 2 && stem.includes(n)));
}
