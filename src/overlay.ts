// Injected into every page that is recorded, including the user's own app: a cursor that glides
// instead of teleporting, click ripples, a camera zoom, and captions that light up word by word.
// Pure DOM, no dependencies, and it never intercepts events.
export const OVERLAY = String.raw`(() => {
  if (window.__rr) return;
  const css = '#__rr_root{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:Inter Variable,Inter,system-ui,sans-serif}'
    + '#__rr_cur{position:absolute;left:0;top:0;width:22px;height:22px;transform:translate(-200px,-200px);transition:transform var(--t,600ms) cubic-bezier(.22,.9,.3,1);filter:drop-shadow(0 2px 3px #0008)}'
    + '.__rr_rip{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid var(--rr-accent,#ff7a45);animation:__rr_rip .6s ease-out forwards}'
    + '@keyframes __rr_rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}'
    + '#__rr_cap{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);max-width:min(980px,84vw);padding:10px 20px;border-radius:12px;background:#0b0b10e6;color:#8b8b99;font-size:24px;line-height:1.35;font-weight:550;text-align:center;opacity:0;transition:opacity .3s;box-shadow:0 10px 30px #0006}'
    + '#__rr_cap b{font-weight:550;color:#fff;transition:color .15s}';
  const boot = () => {
    if (document.getElementById('__rr_root')) return;
    const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st);
    const root = document.createElement('div'); root.id = '__rr_root';
    root.innerHTML = '<svg id="__rr_cur" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6-3.6 6.6z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg><div id="__rr_cap"></div>';
    document.documentElement.appendChild(root);
  };
  let pos = [-200, -200], zoomed = false;
  window.__rr = {
    boot,
    accent: c => document.documentElement.style.setProperty('--rr-accent', c),
    hideCursor: () => { boot(); document.getElementById('__rr_cur').style.opacity = '0'; },
    cursorTo(x, y, ms = 650) {
      boot(); const c = document.getElementById('__rr_cur');
      c.style.setProperty('--t', ms + 'ms'); c.style.opacity = '1';
      c.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 2) + 'px)'; pos = [x, y];
      return new Promise(r => setTimeout(r, ms));
    },
    ripple(x, y) {
      const d = document.createElement('div'); d.className = '__rr_rip'; d.style.left = x + 'px'; d.style.top = y + 'px';
      document.getElementById('__rr_root').appendChild(d); setTimeout(() => d.remove(), 700);
    },
    caption(text, seconds) {
      boot(); const cap = document.getElementById('__rr_cap');
      clearTimeout(window.__rr_ct);
      if (!text) { cap.style.opacity = '0'; return; }
      // Subtitle-style: one short phrase at a time (break at punctuation, at most ~12 words), timed by
      // its share of the characters, with the words lighting up as they are spoken.
      const words = text.split(/\s+/), chunks = [[]];
      words.forEach(w => { const c = chunks.at(-1); c.push(w); if (c.length >= 12 || (c.length >= 5 && /[.,;:?!]$/.test(w))) chunks.push([]); });
      if (!chunks.at(-1).length) chunks.pop();
      const total = text.length + words.length;
      const show = k => {
        if (k >= chunks.length) return;
        const ws = chunks[k], dur = seconds * ws.reduce((n, w) => n + w.length + 1, 0) / total;
        cap.innerHTML = ws.map(w => '<span>' + w.replace(/[<&]/g, c => c === '<' ? '&lt;' : '&amp;') + '</span>').join(' ');
        cap.style.opacity = '1';
        const spans = [...cap.children], len = ws.reduce((n, w) => n + w.length + 1, 0);
        let t = 0; spans.forEach((sp, i) => { setTimeout(() => { sp.style.color = '#fff'; }, t * 1000); t += dur * (ws[i].length + 1) / len; });
        window.__rr_ct = setTimeout(() => show(k + 1), dur * 1000);
      };
      show(0);
    },
    zoom(rect, scale = 1.6, ms = 700) {
      const de = document.documentElement, b = document.body;
      const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
      b.style.transition = 'transform ' + ms + 'ms cubic-bezier(.22,.9,.3,1)';
      b.style.transformOrigin = (cx + scrollX) + 'px ' + (cy + scrollY) + 'px';
      b.style.transform = zoomed ? '' : 'scale(' + scale + ')';
      zoomed = !zoomed;
      return new Promise(r => setTimeout(r, ms));
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();`;
