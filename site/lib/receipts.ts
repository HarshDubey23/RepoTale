import 'server-only';
// Receipts: each citation's code, highlighted once at build time in both themes, with the cited lines
// marked. The browser receives finished HTML and one small stylesheet; it never loads a highlighter.
import { transformerStyleToClass } from '@shikijs/transformers';
import { codeToHtml } from 'shiki';
import { citeLabel, permalink, type Fixture, type FixtureEdge } from './fixture';

export interface Receipt {
  id: string; from: string; to: string; file: string; line: number; end: number; label: string; href: string;
  names: string[]; verified: boolean; html: string;
}

const lang = (file: string) => (/\.tsx?$/.test(file) ? 'typescript' : /\.m?jsx?$/.test(file) ? 'javascript' : /\.py$/.test(file) ? 'python' : 'text');

/** Highlights the given edges. `css` holds the token colors as classes, so the markup carries no inline style. */
export async function receipts(f: Fixture, edges: FixtureEdge[]): Promise<{ list: Receipt[]; css: string }> {
  const toClass = transformerStyleToClass({ classPrefix: 'sk-' });
  const list: Receipt[] = [];
  for (const e of edges) { // in order: the class names are numbered as they are met
    const html = await codeToHtml(e.code.join('\n'), {
      lang: lang(e.from),
      themes: { light: 'github-light', dark: 'github-dark-default' },
      defaultColor: false,
      transformers: [{
        line(node, n) {
          const at = e.start + n - 1;
          node.properties['data-line'] = String(at);
          if (at >= e.line && at <= e.end) this.addClassToHast(node, 'cited');
        },
      }, toClass],
    });
    list.push({
      id: `${e.from}>${e.to}`, from: e.from, to: e.to, file: e.from, line: e.line, end: e.end,
      label: citeLabel(e.from, e.line, e.end), href: permalink(f, e.from, e.line, e.end), names: e.names, verified: e.verified, html,
    });
  }
  return { list, css: toClass.getCSS() };
}
