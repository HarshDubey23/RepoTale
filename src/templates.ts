// Built-in scenes are small HTML pages that animate themselves for exactly the length of their
// narration. They are recorded the same way as the user's own app.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Scene } from './storyboard.ts';

const req = createRequire(import.meta.url);
const pkg = (name: string) => dirname(req.resolve(`${name}/package.json`));
const font = (p: string, f: string) => pathToFileURL(join(pkg(p), 'files', f)).href;
const MERMAID = pathToFileURL(join(pkg('mermaid'), 'dist', 'mermaid.min.js')).href;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface Ctx { accent: string; seconds: number; repo: string; repoDir?: string; title: string }

const base = (c: Ctx, body: string, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Inter Variable';src:url(${font('@fontsource-variable/inter', 'inter-latin-wght-normal.woff2')}) format('woff2');font-weight:100 900}
@font-face{font-family:'JetBrains Mono Variable';src:url(${font('@fontsource-variable/jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2')}) format('woff2');font-weight:100 900}
:root{--a:${c.accent};--bg:#0c0d12;--s:#15171f;--l:#262935;--t:#f3f3f6;--m:#9a9cab;--dur:${c.seconds}s}
*{box-sizing:border-box;margin:0}
html,body{height:100%;background:var(--bg);color:var(--t);font-family:'Inter Variable',system-ui,sans-serif;overflow:hidden}
body{background:radial-gradient(1200px 600px at 85% -10%,color-mix(in srgb,var(--a) 22%,transparent),transparent 60%),var(--bg)}
.wrap{position:absolute;inset:64px 80px 110px}
.kick{font:600 15px 'JetBrains Mono Variable',monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--a)}
.up{opacity:0;transform:translateY(18px);animation:up .8s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes up{to{opacity:1;transform:none}}
.mark{position:absolute;right:28px;top:24px;font:500 13px 'JetBrains Mono Variable',monospace;color:#5d6070}
${extra}</style></head><body><div class="mark">${esc(c.title)}</div>${body}</body></html>`;

export async function sceneHtml(s: Scene, c: Ctx): Promise<string> {
  switch (s.type) {
    case 'title':
      return base(c, `<div class="wrap" style="display:grid;align-content:center;gap:26px">
        <div class="kick up">${esc(c.repo || 'open source')}</div>
        <h1 class="up" style="animation-delay:.15s;font-size:92px;line-height:.98;letter-spacing:-.045em;font-weight:760;max-width:15ch">${esc(s.heading)}</h1>
        ${s.sub ? `<p class="up" style="animation-delay:.35s;font-size:30px;color:var(--m);max-width:34ch;line-height:1.35">${esc(s.sub)}</p>` : ''}
        <div class="up" style="animation-delay:.5s;width:120px;height:6px;border-radius:3px;background:var(--a)"></div></div>`);

    case 'end':
      return base(c, `<div class="wrap" style="display:grid;align-content:center;justify-items:center;text-align:center;gap:30px">
        <h1 class="up" style="font-size:84px;letter-spacing:-.04em;font-weight:760;max-width:18ch;line-height:1">${esc(s.heading)}</h1>
        <div class="up" style="animation-delay:.25s;display:flex;gap:14px;flex-wrap:wrap;justify-content:center">${(s.links ?? []).map(l => `<span style="font:500 22px 'JetBrains Mono Variable';padding:12px 20px;border:1.5px solid var(--l);border-radius:999px">${esc(l)}</span>`).join('')}</div>
        <p class="up" style="animation-delay:.6s;font:500 15px 'JetBrains Mono Variable';color:#5d6070">video made with reporeel</p></div>`);

    case 'stats': {
      const n = s.items.length;
      return base(c, `<div class="wrap" style="display:grid;align-content:center;gap:40px">
        ${s.heading ? `<h2 class="up" style="font-size:52px;letter-spacing:-.03em">${esc(s.heading)}</h2>` : ''}
        <div style="display:grid;grid-template-columns:repeat(${Math.min(n, 4)},1fr);gap:20px">${s.items.map((it, i) => `
          <div class="up" style="animation-delay:${0.2 + i * Math.min(0.6, (c.seconds * 0.5) / n)}s;background:var(--s);border:1px solid var(--l);border-radius:22px;padding:30px">
            <div data-count="${esc(it.value)}" style="font-size:${n > 3 ? 54 : 68}px;font-weight:760;letter-spacing:-.04em;color:var(--a)">${esc(it.value)}</div>
            <div style="font-size:21px;color:var(--m);margin-top:10px;line-height:1.35">${esc(it.label)}</div></div>`).join('')}</div></div>
        <script>
        // Count up the leading number of each value, keep the rest of the text as written.
        document.querySelectorAll('[data-count]').forEach((el, i) => {
          const m = el.dataset.count.match(/^([^0-9]*)([0-9][0-9,]*\\.?[0-9]*)(.*)$/); if (!m) return;
          const end = parseFloat(m[2].replace(/,/g, '')), dec = (m[2].split('.')[1] || '').length, t0 = performance.now() + 200 + i * 150;
          const tick = now => { const p = Math.min(1, Math.max(0, (now - t0) / 1200)), e = 1 - Math.pow(1 - p, 3);
            el.textContent = m[1] + (end * e).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3]; if (p < 1) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        });</script>`);
    }

    case 'code': {
      const { codeToHtml } = await import('shiki');
      const path = join(c.repoDir ?? '.', s.file);
      const all = readFileSync(path, 'utf8').split('\n');
      const [from, to] = s.lines ?? [1, Math.min(all.length, 40)];
      const lang = ({ ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', py: 'python', sol: 'solidity', rs: 'rust', go: 'go', java: 'java', circom: 'rust', css: 'css', html: 'html', json: 'json', md: 'markdown', sh: 'bash', yml: 'yaml', yaml: 'yaml', sql: 'sql' } as Record<string, string>)[s.file.split('.').pop()!] ?? 'text';
      const html = await codeToHtml(all.slice(from - 1, to).join('\n'), { lang, theme: 'github-dark-default' });
      const hl = (s.highlight ?? []).map(([a, b]) => [a - from + 1, b - from + 1]);
      const lines = to - from + 1;
      return base(c, `<div class="wrap" style="display:grid;grid-template-rows:auto 1fr;gap:18px">
          <div class="up" style="display:flex;justify-content:space-between;align-items:baseline;gap:20px">
            <div style="font:600 22px 'JetBrains Mono Variable'">${esc(s.file)}<span style="color:var(--m);font-weight:400"> · lines ${from}–${to}</span></div>
            ${s.caption ? `<div style="font-size:22px;color:var(--m)">${esc(s.caption)}</div>` : ''}</div>
          <div class="up code" style="animation-delay:.15s;background:var(--s);border:1px solid var(--l);border-radius:18px;overflow:hidden;position:relative">${html}</div></div>`,
        `.code pre{background:transparent!important;padding:22px 0;font:${lines > 26 ? 15 : lines > 18 ? 17 : 19}px/1.6 'JetBrains Mono Variable',monospace;counter-reset:ln ${from - 1};transition:transform 1.2s cubic-bezier(.2,.8,.2,1)}
         .code .line{display:inline-block;width:100%;padding:0 26px 0 0;transition:opacity .6s,background .6s}
         .code .line::before{counter-increment:ln;content:counter(ln);display:inline-block;width:64px;padding-right:20px;text-align:right;color:#4b4f5e}
         ${hl.length ? `.dim .line{opacity:.32}.dim .line.hl{opacity:1;background:color-mix(in srgb,var(--a) 16%,transparent);box-shadow:inset 4px 0 0 var(--a)}` : ''}`)
        + `<script>
          const L = [...document.querySelectorAll('.code .line')], H = ${JSON.stringify(hl)};
          H.forEach(([a,b]) => { for (let i=a;i<=b;i++) L[i-1]?.classList.add('hl'); });
          // Step through the highlighted ranges across the narration, scrolling each into view.
          const box = document.querySelector('.code'), pre = box.querySelector('pre');
          H.forEach(([a], k) => setTimeout(() => {
            box.classList.add('dim'); L.forEach(l => l.classList.remove('hl'));
            for (let i=H[k][0];i<=H[k][1];i++) L[i-1]?.classList.add('hl');
            const y = L[a-1].offsetTop - box.clientHeight * .3; pre.style.transform = 'translateY(' + -Math.max(0, Math.min(y, pre.scrollHeight - box.clientHeight)) + 'px)';
          }, 900 + k * (${c.seconds} * 1000 - 1400) / H.length));
        </script>`;
    }

    case 'diagram':
      return base(c, `<div class="wrap" style="display:grid;grid-template-rows:auto 1fr;gap:16px">
          ${s.caption ? `<div class="kick up">${esc(s.caption)}</div>` : '<div></div>'}
          <div id="d" class="up" style="animation-delay:.1s;min-height:0;overflow:hidden"></div></div>
        <script src="${MERMAID}"></script>
        <script>
          document.fonts.load('20px "Inter Variable"').then(() => {
          mermaid.initialize({ startOnLoad: false, theme: 'base', flowchart: { htmlLabels: false, padding: 18, nodeSpacing: 46, rankSpacing: 60 }, sequence: { useMaxWidth: true }, themeVariables: { darkMode: true, background: '#0c0d12', primaryColor: '#15171f', primaryBorderColor: '${c.accent}', primaryTextColor: '#f3f3f6', lineColor: '#9a9cab', secondaryColor: '#1d2030', tertiaryColor: '#15171f', fontFamily: 'Inter Variable', fontSize: '20px', edgeLabelBackground: '#0c0d12' } });
          mermaid.render('g', ${JSON.stringify(s.mermaid)}).then(({ svg }) => {
            const d = document.getElementById('d'); d.innerHTML = svg;
            // Fill the stage: the SVG scales up to the box and keeps its aspect ratio.
            const el = d.querySelector('svg'); el.removeAttribute('height'); el.style.maxWidth = 'none';
            el.style.width = d.clientWidth + 'px'; el.style.height = d.clientHeight + 'px'; el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            const parts = [...el.querySelectorAll('.node, .cluster, .edgePaths path, .edgeLabels .edgeLabel, .actor, .messageLine0, .messageLine1, .messageText')];
            const step = Math.min(350, (${c.seconds} * 1000 * .6) / Math.max(1, parts.length));
            parts.forEach((p, i) => { p.style.opacity = 0; p.style.transition = 'opacity .5s'; setTimeout(() => p.style.opacity = 1, 300 + i * step); });
            window.__ready = true;
          }).catch(e => { document.getElementById('d').textContent = 'diagram error: ' + e.message; window.__ready = true; });
          });
        </script>`);

    case 'terminal': {
      const runs = (s as any).__runs as { cmd: string; out: string }[];
      return base(c, `<div class="wrap" style="display:grid">
          <div class="up" style="background:#090a0e;border:1px solid var(--l);border-radius:16px;overflow:hidden;display:grid;grid-template-rows:auto 1fr;box-shadow:0 30px 80px -30px #000">
            <div style="display:flex;gap:8px;padding:14px 18px;border-bottom:1px solid var(--l)"><i style="width:13px;height:13px;border-radius:50%;background:#ff5f57"></i><i style="width:13px;height:13px;border-radius:50%;background:#febc2e"></i><i style="width:13px;height:13px;border-radius:50%;background:#28c840"></i></div>
            <pre id="t" style="padding:20px 26px;font:18px/1.55 'JetBrains Mono Variable',monospace;color:#d6d7de;white-space:pre-wrap;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end"></pre></div></div>
        <script>
          const runs = ${JSON.stringify(runs)}, t = document.getElementById('t'), budget = ${c.seconds} * 1000 - 600;
          const lines = runs.reduce((n, r) => n + r.out.split('\\n').length + 1, 0), per = Math.max(12, Math.min(220, budget * .55 / Math.max(1, lines)));
          const add = (html) => { const s = document.createElement('span'); s.innerHTML = html + '\\n'; t.appendChild(s); };
          const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]);
          (async () => { await new Promise(r => setTimeout(r, 400));
            for (const r of runs) {
              const p = document.createElement('span'); p.innerHTML = '<b style="color:${c.accent}">$</b> '; t.appendChild(p);
              for (const ch of r.cmd) { p.innerHTML += esc(ch); await new Promise(z => setTimeout(z, Math.min(55, budget * .2 / r.cmd.length / runs.length))); }
              p.innerHTML += '\\n';
              for (const l of r.out.split('\\n')) { add('<span style="color:' + (/(fail|error|✗|×)/i.test(l) ? '#ff7b72' : /(pass|ok|✓|success)/i.test(l) ? '#7ee787' : '#b4b6c2') + '">' + esc(l) + '</span>'); await new Promise(z => setTimeout(z, per)); }
            }
          })();
        </script>`);
    }

    case 'web':
      throw new Error('web scenes record the app itself');
  }
}
