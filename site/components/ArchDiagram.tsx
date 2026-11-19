// One level of the architecture as SVG, drawn on the server with the import map's layout: parts (or files),
// the services the code calls and who starts it. A part, or a neighbouring part, is a link that opens it.
// Each arrow's thickness follows how many imports it stands for; its hover text says what crosses it.
import type { ArchEdge, ArchNode, ArchView } from '@/lib/arch';
import { layout, type Layout, type Orientation } from '@/lib/layout';

const fit = (s: string, chars: number) => (s.length <= chars ? s : `${s.slice(0, Math.max(1, Math.floor(chars) - 1))}…`);
const width = (n: number) => Math.min(4, 1.25 + Math.log2(Math.max(1, n)) * 0.75);
const plural = (n: number, w: string) => `${n.toLocaleString('en')} ${w}${n === 1 ? '' : 's'}`;

const FILL: Record<ArchNode['role'], string> = {
  part: 'fill-surface-2 stroke-border-strong', file: 'fill-surface-2 stroke-border', neighbour: 'fill-bg stroke-border-strong',
  service: 'fill-bg stroke-unverified', actor: 'fill-bg stroke-text-2',
};

export function ArchDiagram({ v, href, label }: { v: ArchView; href: (area: string) => string; label: string }) {
  const drawn = v.edges.filter(e => e.drawn).map(e => ({ ...e, verified: true }));
  return (
    <figure className="rounded-l border border-border bg-surface shadow-rt" aria-label={label}>
      <div className="px-2 py-4 md:px-4">
        <Svg v={v} l={layout(v.nodes, drawn, 'h')} o="h" href={href} />
        <Svg v={v} l={layout(v.nodes, drawn, 'v')} o="v" href={href} />
      </div>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border px-4 py-3 text-small text-text-2 md:px-6">
        <span className="inline-flex items-center gap-2"><span className="size-3 rounded-[3px] border-[1.5px] border-accent" aria-hidden />Where it starts</span>
        <span className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent" aria-hidden />Holds the heart</span>
        <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full border-[1.5px] border-unverified" aria-hidden />Outside service</span>
        <span>Thicker arrows carry more imports. <span className="hidden lg:inline">Read left to right.</span><span className="lg:hidden">Read top to bottom.</span></span>
      </figcaption>
    </figure>
  );
}

function Svg({ v, l, o, href }: { v: ArchView; l: Layout; o: Orientation; href: (area: string) => string }) {
  const wide = o === 'h', pad = wide ? 12 : 7, id = `arch-${o}`;
  const node = new Map(v.nodes.map(n => [n.id, n]));
  const edge = new Map(v.edges.map(e => [`${e.from}>${e.to}`, e]));
  return (
    <svg viewBox={`0 0 ${l.w} ${l.h}`} role="img" aria-label={`${v.title}: ${plural(v.nodes.length, 'box')}, ${plural(l.wires.length, 'arrow')}`}
      className={wide ? 'hidden h-auto w-full lg:block' : 'mx-auto block h-auto w-full max-w-[520px] lg:hidden'}>
      <defs>
        {/* Sized in drawing units, not by the line's width, so a heavy arrow keeps a small head. */}
        <marker id={`${id}-head`} viewBox="0 0 8 8" refX="8" refY="4" markerWidth={wide ? 8 : 7} markerHeight={wide ? 8 : 7} markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M0 0 8 4 0 8z" className="fill-text-3" />
        </marker>
      </defs>
      <g fill="none" strokeLinecap="round">
        {l.wires.map(w => {
          const e = edge.get(w.id) as ArchEdge;
          return (
            <path key={w.id} d={w.d} strokeWidth={width(e.count)} markerEnd={`url(#${id}-head)`} markerStart={e.both ? `url(#${id}-head)` : undefined}
              className={`arch-wire ${e.external ? 'stroke-unverified [stroke-dasharray:4_4]' : 'stroke-border-strong'}`}>
              <title>{`${node.get(e.from)?.title} → ${node.get(e.to)?.title}: ${e.external ? e.label : `${plural(e.count, 'import')}${e.label && !/imports?$/.test(e.label) ? `, ${e.label}` : ''}`}`}</title>
            </path>
          );
        })}
      </g>
      {l.boxes.map(b => {
        const n = node.get(b.id)!;
        const chars = (b.w - 2 * pad - (n.heart ? 8 : 0)) / (wide ? 6.8 : 5.7);
        const body = (
          <>
            <title>{`${n.title}${n.sub ? `: ${n.sub}` : ''}${n.file ? ` (${n.file})` : ''}`}</title>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={n.role === 'service' || n.role === 'actor' ? b.h / 2 : wide ? 8 : 6}
              strokeWidth={n.entry ? 1.5 : 1} className={`${FILL[n.role]} ${n.entry ? 'stroke-accent!' : ''} ${n.role === 'neighbour' ? '[stroke-dasharray:3_3]' : ''} transition-colors duration-150 ease-rt`} />
            <text x={b.x + pad} y={b.y + (wide ? 19 : 17)} className={`fill-text font-sans font-medium ${wide ? 'text-[13px]' : 'text-[11px]'}`}>{fit(n.title, chars)}</text>
            <text x={b.x + pad} y={b.y + (wide ? 34 : 31)} className={`fill-text-2 font-mono ${wide ? 'text-[11px]' : 'text-[9.5px]'}`}>{fit(n.sub, chars * 1.15)}</text>
            {n.heart && <circle cx={b.x + b.w - pad} cy={b.y + pad} r={wide ? 3.5 : 3} className="fill-accent" />}
          </>
        );
        return n.area && (n.role === 'part' || n.role === 'neighbour')
          ? <a key={b.id} href={href(n.area)} className="arch-link">{body}</a>
          : <g key={b.id}>{body}</g>;
      })}
    </svg>
  );
}
