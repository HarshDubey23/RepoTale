// `repotale tour`: sign in to a running web app (optional), walk its pages like a visitor, read
// what each page actually shows (headline, sections, actions, form fields, tables), and write a
// storyboard whose web scenes stay signed in. Credentials come only from environment variables,
// so they never appear in a command line, a storyboard or a video.
import type { Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Action, Scene, Storyboard } from './storyboard.ts';

export interface PageRead {
  url: string; title: string; h1: string | null; sections: string[]; actions: string[]; fields: string[];
  tables: number; lead: string | null; links: string[];
}

export interface TourOpts {
  loginUrl?: string; user?: string; pass?: string; max?: number; session: string; log: (m: string) => void;
}

// Links a tour must never follow: they sign out, destroy, or leave the app.
const UNSAFE = /log-?out|sign-?out|delete|remove|destroy|unsubscribe|deactivate|cancel-?subscription|reset/i;
const FILE = /\.(pdf|zip|csv|xlsx?|docx?|png|jpe?g|gif|svg|mp4|webm)$/i;

/** Which links are worth a scene: same site, not a file, not destructive, not a fragment. Pure. */
export function nextLinks(base: string, hrefs: string[]): string[] {
  const origin = new URL(base).origin, out = new Set<string>();
  for (const h of hrefs) {
    let u: URL; try { u = new URL(h, base); } catch { continue; }
    if (u.origin !== origin || FILE.test(u.pathname) || UNSAFE.test(u.pathname + u.search)) continue;
    u.hash = '';
    out.add(u.href.replace(/\/$/, '') || u.href);
  }
  return [...out];
}

const list = (a: string[]) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1);

/** What to say about one page, from what is on it. Pure. */
export function narrate(p: PageRead, i: number, total: number): string {
  const name = p.h1 ?? (p.title.split(/[|–—-]/)[0].trim() || new URL(p.url).pathname);
  const bits = [i === 0 ? `We start on ${name}.` : i === total - 1 ? `Finally, ${name}.` : `Next, ${name}.`];
  if (p.lead) bits.push(p.lead);
  if (p.sections.length) bits.push(`It is organised into ${list(p.sections.slice(0, 4).map(s => s.toLowerCase()))}.`);
  if (p.actions.length) bits.push(`From here you can ${list(p.actions.slice(0, 3).map(a => a.toLowerCase()))}.`);
  if (p.fields.length) bits.push(`Its form asks for ${list(p.fields.slice(0, 4).map(f => f.toLowerCase()))}.`);
  if (p.tables) bits.push(p.tables === 1 ? 'The data sits in a table.' : `The data sits in ${p.tables} tables.`);
  return bits.join(' ');
}

/** The camera for one page: settle, look at the headline, glide down the sections, point at the main action. */
export function moves(p: PageRead): Action[] {
  const a: Action[] = [{ wait: 900 }];
  if (p.h1) a.push({ zoom: 'h1' });
  if (p.sections[0]) a.push({ scroll: `text=${p.sections[0]}` });
  if (p.actions[0]) a.push({ hover: `text=${p.actions[0]}` });
  if (p.sections[1]) a.push({ scroll: `text=${p.sections[1]}` });
  a.push({ scroll: 1200 }, { wait: 600 });
  return a;
}

async function read(page: Page): Promise<PageRead> {
  return page.evaluate(() => {
    const txt = (e: Element) => (e as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() ?? '';
    const vis = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const uniq = (a: string[]) => [...new Set(a.filter(s => s && s.length > 1 && s.length < 60))];
    const main = document.querySelector('main') ?? document.body;
    return {
      url: location.href, title: document.title,
      h1: txt(main.querySelector('h1') ?? document.createElement('i')) || null,
      sections: uniq([...main.querySelectorAll('h2, h3, [role=tab]')].filter(vis).map(txt)).slice(0, 6),
      actions: uniq([...main.querySelectorAll('button, [role=button], a.btn, a[class*=button]')].filter(vis).map(txt)).filter(t => !/log-?out|sign-?out|delete|remove/i.test(t)).slice(0, 5),
      fields: uniq([...main.querySelectorAll('input:not([type=hidden]):not([type=password]), select, textarea')].filter(vis).map(e => {
        const id = e.getAttribute('id'); const l = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : e.closest('label');
        return (l && txt(l)) || e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.getAttribute('name') || '';
      })).slice(0, 6),
      tables: [...main.querySelectorAll('table, [role=grid]')].filter(vis).length,
      lead: [...main.querySelectorAll('p')].map(txt).find(t => t.length > 50 && t.length < 240) ?? null,
      links: [...document.querySelectorAll('a[href]')].map(a => (a as HTMLAnchorElement).href),
    };
  });
}

/** Fill the first username field and the password field, submit, and confirm the form is gone. */
async function login(page: Page, url: string, user: string, pass: string) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => page.waitForLoadState('load'));
  const name = page.locator('input[type=email], input[autocomplete=username], input[name*=email i], input[name*=user i], input[id*=email i], input[type=text]').first();
  const pw = page.locator('input[type=password]').first();
  await name.fill(user); await pw.fill(pass);
  const submit = page.locator('button[type=submit], input[type=submit]').first();
  await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), (await submit.count()) ? submit.click() : pw.press('Enter')]);
  await page.waitForTimeout(1500);
  if (await page.locator('input[type=password]').first().isVisible().catch(() => false)) throw new Error('sign-in did not go through: the password field is still showing. Check the credentials, or that the form has no captcha.');
}

export async function tour(start: string, o: TourOpts): Promise<{ pages: PageRead[]; session?: string }> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    let session: string | undefined;
    if (o.loginUrl) {
      if (!o.user || !o.pass) throw new Error('signing in needs the username and password in environment variables (see --user-env and --pass-env)');
      o.log(`signing in at ${o.loginUrl}`);
      await login(page, o.loginUrl, o.user, o.pass);
      mkdirSync(dirname(o.session), { recursive: true });
      await ctx.storageState({ path: o.session });
      session = o.session;
    }
    const firstUrl = o.loginUrl ? page.url() : start;
    const queue = [...new Set([start, firstUrl])], seen = new Set<string>(), pages: PageRead[] = [];
    while (queue.length && pages.length < (o.max ?? 8)) {
      const url = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);
      o.log(`reading ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => page.waitForLoadState('load').catch(() => {}));
      if (o.loginUrl && await page.locator('input[type=password]').first().isVisible().catch(() => false)) continue; // bounced to sign-in
      const r = await read(page);
      if (pages.some(p => p.url === r.url)) continue;
      pages.push(r);
      for (const l of nextLinks(r.url, r.links)) if (!seen.has(l)) queue.push(l);
    }
    return { pages, session };
  } finally { await browser.close(); }
}

/** The storyboard for a tour. */
export function tourStoryboard(start: string, pages: PageRead[], session?: string): Storyboard {
  const host = new URL(start).host;
  const scenes: Scene[] = [
    { type: 'title', heading: host, sub: `${pages.length} pages, seen as a signed-in user`, say: `A tour of ${host}: ${pages.length} pages, what each one shows and what you can do there.` },
    ...pages.map((p, i): Scene => ({ type: 'web', url: p.url, actions: moves(p), say: narrate(p, i, pages.length) })),
    { type: 'end', heading: host, links: [start], say: `That is ${host}, page by page.` },
  ];
  return { title: host, app: { url: new URL(start).origin, ...(session ? { session } : {}) }, scenes };
}
