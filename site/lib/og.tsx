import 'server-only';
// Share cards (1200x630): the repository's own import map, drawn from the same layout as its page, with the
// counts that page shows. Satori draws these outside the browser, so styles are objects, as it requires.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import type { Fixture } from './fixture';
import { layout } from './layout';
import { dark as c } from './tokens';

export const size = { width: 1200, height: 630 };
const font = (f: string) => readFile(join(process.cwd(), 'assets', 'og', f));
const fit = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

interface Card { kicker: string; title: string; italic?: string; description?: string; f?: Fixture; foot: string; badge?: { text: string; tone: 'high' | 'medium' | 'low' } }

const TONE = { high: c.invented, medium: c.unverified, low: c.verified } as const;

export async function card({ kicker, title, italic, description, f, foot, badge }: Card) {
  const [serif, serifItalic, sans, mono] = await Promise.all([
    font('instrument-serif-latin-400-normal.woff'), font('instrument-serif-latin-400-italic.woff'),
    font('instrument-sans-latin-400-normal.woff'), font('jetbrains-mono-latin-400-normal.woff'),
  ]);
  const map = f && f.nodes.length ? layout(f.nodes, f.edges, 'h') : null;
  const box = { w: 1072, h: 196 };
  const k = map ? Math.min(box.w / map.w, box.h / map.h) : 1;
  const byId = new Map(f?.nodes.map(n => [n.id, n]) ?? []);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: c.bg, color: c.text, padding: '52px 64px', fontFamily: 'Sans' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'Serif', fontSize: 36, letterSpacing: -0.5 }}>RepoTale</div>
          <div style={{ fontFamily: 'Mono', fontSize: 20, color: c.text2 }}>{kicker}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: italic ? 'column' : 'row', marginTop: 34, fontFamily: 'Serif', fontSize: map ? 84 : 96, lineHeight: 1, letterSpacing: -1.5 }}>
          <span>{fit(title, 34)}</span>
          {italic && <span style={{ fontStyle: 'italic', color: c.accent }}>{italic}</span>}
        </div>
        {description && <div style={{ marginTop: 18, fontSize: 26, lineHeight: 1.35, color: c.text2, maxWidth: 1000 }}>{fit(description, 120)}</div>}
        <div style={{ flex: 1 }} />
        {map && (
          <div style={{ display: 'flex', position: 'relative', width: map.w * k, height: map.h * k, marginBottom: 22 }}>
            <svg width={map.w * k} height={map.h * k} viewBox={`0 0 ${map.w} ${map.h}`} style={{ position: 'absolute', left: 0, top: 0 }}>
              {map.wires.map(w => <path key={w.id} d={w.d} fill="none" stroke={c.borderStrong} strokeWidth={1.5} />)}
              {map.boxes.map(b => {
                const n = byId.get(b.id);
                return <rect key={b.id} x={b.x} y={b.y} width={b.w} height={b.h} rx={8} fill={c.surface2} stroke={n?.entry ? c.accent : c.border} strokeWidth={n?.entry ? 2 : 1} />;
              })}
            </svg>
            {map.boxes.map(b => (
              <div key={b.id} style={{ position: 'absolute', left: (b.x + 12) * k, top: b.y * k, height: b.h * k, display: 'flex', alignItems: 'center', fontSize: 15, color: c.text }}>
                {fit(byId.get(b.id)?.label ?? '', Math.floor((b.w - 24) / 7.6))}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${c.border}`, paddingTop: 20, fontFamily: 'Mono', fontSize: 20, color: c.text2 }}>
          <div style={{ display: 'flex' }}>{foot}</div>
          {f && <div style={{ display: 'flex', color: c.verified }}>{f.edges.filter(e => e.verified).length} of {f.edges.length} imports verified</div>}
          {badge && <div style={{ display: 'flex', alignItems: 'center', color: TONE[badge.tone] }}><div style={{ width: 12, height: 12, borderRadius: 6, background: TONE[badge.tone], marginRight: 12 }} />{badge.text}</div>}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Serif', data: serif, style: 'normal', weight: 400 },
        { name: 'Serif', data: serifItalic, style: 'italic', weight: 400 },
        { name: 'Sans', data: sans, style: 'normal', weight: 400 },
        { name: 'Mono', data: mono, style: 'normal', weight: 400 },
      ],
    },
  );
}
