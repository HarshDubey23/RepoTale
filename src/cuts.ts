// Vertical (9:16) and square (1:1) cuts of the finished video, for Reels, Shorts, TikTok and the
// LinkedIn feed: the landscape video in the middle over a blurred, darkened copy of itself, with
// the project name above and the link below. The text is drawn by Chromium, so no font files or
// ffmpeg text filters are needed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ffmpeg } from './ffmpeg.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const FORMATS = { vertical: { w: 1080, h: 1920 }, square: { w: 1080, h: 1080 } } as const;
export type Format = keyof typeof FORMATS;

export async function cut(video: string, format: Format, o: { title: string; tagline?: string; link?: string; accent?: string; out: string }): Promise<string> {
  const { w, h } = FORMATS[format];
  const vh = Math.round((w * 9) / 16 / 2) * 2;                 // the 16:9 video, full width
  const top = Math.round((h - vh) / 2 / 2) * 2;
  const a = o.accent ?? '#ff7a45';
  mkdirSync(o.out, { recursive: true });
  const frame = join(o.out, `.frame-${format}.png`);
  const big = format === 'vertical';
  const glow = (y: number, hh: number, at: string) => `<div style="position:absolute;left:0;right:0;top:${y}px;height:${hh}px;background:radial-gradient(120% 90% at ${at},${a}40,transparent 70%)"></div>`;
  const html = `<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;background:transparent;font-family:Inter,system-ui,sans-serif;color:#fff">
    ${glow(0, top, '15% 0%')}${glow(top + vh, h - top - vh, '85% 100%')}
    <div style="position:absolute;left:72px;right:72px;bottom:${h - top + (big ? 70 : 34)}px">
      <div style="width:90px;height:10px;border-radius:5px;background:${a};margin-bottom:${big ? 34 : 20}px"></div>
      <div style="font-size:${big ? 96 : 64}px;font-weight:800;letter-spacing:-.04em;line-height:1">${esc(o.title)}</div>
      ${o.tagline ? `<div style="font-size:${big ? 44 : 32}px;line-height:1.25;color:#e3e3ea;margin-top:${big ? 26 : 14}px">${esc(o.tagline)}</div>` : ''}
    </div>
    ${o.link ? `<div style="position:absolute;left:0;right:0;top:${top + vh + (big ? 80 : 30)}px;text-align:center;font:600 ${big ? 40 : 30}px ui-monospace,monospace;color:${a}">${esc(o.link)}</div>` : ''}
  </body></html>`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(html);
    await page.screenshot({ path: frame, omitBackground: true });
  } finally { await browser.close(); }
  const file = join(o.out, `reporeel-${format}.mp4`);
  ffmpeg(['-i', video, '-i', frame, '-filter_complex',
    `[0:v]split[a][b];[a]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=28:2,eq=brightness=-0.32:saturation=0.8[bg];` +
    `[b]scale=${w}:${vh}:flags=lanczos[fg];[bg][fg]overlay=0:${top}[v1];[v1][1:v]overlay=0:0,format=yuv420p[v]`,
    '-map', '[v]', '-map', '0:a?', '-map_chapters', '0', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-c:a', 'copy', '-movflags', '+faststart', file]);
  writeFileSync(frame, '');
  return file;
}
