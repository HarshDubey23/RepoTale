// Stills: app screenshots, an architecture diagram as SVG/PNG, and the GitHub social preview card.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices } from 'playwright';
import { sceneHtml } from './templates.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Desktop and phone, dark and light, for each page. Desktop is captured at 2x so it stays sharp on retina. */
export async function shots(baseUrl: string, pages: string[], out: string, log = (_: string) => {}) {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(), files: string[] = [];
  try {
    for (const scheme of ['dark', 'light'] as const) for (const [form, opts] of [['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }], ['phone', devices['iPhone 14']]] as const) {
      const ctx = await browser.newContext({ ...opts, colorScheme: scheme });
      const page = await ctx.newPage();
      for (const p of pages) {
        const url = new URL(p, baseUrl).href, slug = (new URL(url).pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home');
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
        await page.waitForTimeout(800);
        const f = join(out, `${slug}-${form}-${scheme}.png`);
        await page.screenshot({ path: f });
        files.push(f); log(`  ${f}`);
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  return files;
}

/** Renders Mermaid to SVG and PNG with the same theme as the video. */
export async function diagram(mermaid: string, out: string, accent = '#ff7a45') {
  mkdirSync(out, { recursive: true });
  const html = join(out, '.diagram.html');
  writeFileSync(html, await sceneHtml({ type: 'diagram', mermaid, say: '' }, { accent, seconds: 1, repo: '', title: '' }));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
    await page.goto('file://' + html);
    await page.waitForFunction(() => (window as any).__ready, null, { timeout: 30_000 });
    await page.addStyleTag({ content: '.mark{display:none} *{animation:none!important;transition:none!important;opacity:1!important}' });
    await page.waitForTimeout(400);
    const svg = await page.locator('#d svg').evaluate(el => el.outerHTML);
    writeFileSync(join(out, 'architecture.svg'), svg);
    await page.locator('#d').screenshot({ path: join(out, 'architecture.png') });
  } finally { await browser.close(); }
  return { svg: join(out, 'architecture.svg'), png: join(out, 'architecture.png') };
}

/** GitHub's social preview is 1280x640; this is what shows when the repo link is shared anywhere. */
export async function socialCard(o: { title: string; tagline: string; repo: string; accent?: string; image?: string; stats?: string[] }, file: string) {
  const a = o.accent ?? '#ff7a45';
  // Inlined: a page loaded with setContent may not read local files.
  const data = o.image ? `data:image/${o.image.endsWith('.png') ? 'png' : 'jpeg'};base64,${readFileSync(o.image).toString('base64')}` : '';
  const img = o.image ? `<img src="${data}" style="position:absolute;right:-60px;top:110px;width:640px;border-radius:18px;box-shadow:0 30px 80px -20px #000;border:1px solid #2a2d3a;transform:perspective(1400px) rotateY(-12deg)">` : '';
  const html = `<!doctype html><html><body style="margin:0;width:1280px;height:640px;overflow:hidden;background:radial-gradient(900px 500px at 90% 0%,${a}38,transparent 60%),#0c0d12;color:#f3f3f6;font-family:Inter,system-ui,sans-serif;position:relative">
    ${img}
    <div style="position:absolute;left:72px;top:72px;right:${o.image ? 600 : 72}px">
      <div style="font:600 22px ui-monospace,monospace;color:${a};letter-spacing:.06em">${esc(o.repo)}</div>
      <div style="font-size:${o.title.length > 18 ? 76 : 96}px;font-weight:800;letter-spacing:-.045em;line-height:.95;margin:22px 0 26px">${esc(o.title)}</div>
      <div style="font-size:31px;line-height:1.3;color:#b9bbc8">${esc(o.tagline)}</div>
      <div style="display:flex;gap:12px;margin-top:34px;flex-wrap:wrap">${(o.stats ?? []).slice(0, 3).map(s => `<span style="font:600 20px ui-monospace,monospace;padding:10px 16px;border-radius:12px;background:#ffffff10;border:1px solid #ffffff1c">${esc(s)}</span>`).join('')}</div>
    </div>
    <div style="position:absolute;left:0;bottom:0;width:100%;height:10px;background:${a}"></div></body></html>`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: file });
  } finally { await browser.close(); }
  return file;
}
