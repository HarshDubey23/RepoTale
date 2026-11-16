// The page: ask for a repository, read it, then show the film, the map, the evidence and the exports.
import { analyze, parseRepo, permalink, blastRadius, RepoError, shot, readPage, crawlSite, setJinaKey } from './analyze.js';
import { buildArch, layoutArch, renderArch, mermaidArch, loadElk } from './arch.js';
import { VoicePool, VOICES, ELEVEN, elevenSay } from './voice.js';
import { buildStory, buildSiteStory, Player, record, storyboardOf, graphOf } from './story.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) k.startsWith('on') ? el.addEventListener(k.slice(2), v) : el.setAttribute(k, v === true ? '' : v);
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
  return el;
};
const base = f => f.split('/').pop();
const fmt = n => Number(n).toLocaleString('en');
const clock = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const store = { get(k, d) { try { const v = localStorage.getItem('repotale.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('repotale.' + k, JSON.stringify(v)); } catch {} } };

const savedVoice = store.get('voiceName', 'af_heart');
const opts = { voice: store.get('voice', true), voiceName: savedVoice === 'browser' ? 'af_heart' : savedVoice, captions: store.get('captions', true), tests: store.get('tests', false), back: store.get('back', false) };
// repotale.studio = false keeps the voice on the 90 MB CPU model, for machines short of disk.
const pool = new VoicePool({ studio: store.get('studio', true) });
let audioContext = null, voiceJob = 0;
let model = null, scenes = null, player = null, selected = null, recording = null;
let arch = null, archLay = null, archTheme = 'light';
// The film draws its type on a canvas, which only sees fonts the page has already loaded.
for (const f of ["700 40px 'Inter Tight'", "400 16px 'Inter Tight'", "600 16px 'Inter Tight'"]) document.fonts?.load(f);
document.fonts?.ready.then(() => player?.draw());

// ------------------------------------------------------------- the O in the name: a live import graph
(function glyph() {
  const c = $('#glyph'), ctx = c.getContext('2d'), N = 14;
  const nodes = Array.from({ length: N }, (_, i) => { const a = (i / N) * Math.PI * 2 - Math.PI / 2; return [160 + Math.cos(a) * 136, 160 + Math.sin(a) * 146]; });
  const links = [[0, 5], [0, 9], [2, 7], [3, 11], [4, 12], [6, 13], [8, 1], [10, 3], [12, 6], [1, 9]];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const draw = ms => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 320, 320);
    ctx.lineWidth = 3;
    links.forEach(([a, b], k) => {
      const lit = Math.floor(ms / 700) % links.length === k;
      ctx.strokeStyle = lit ? '#0071e3' : '#d2d2d7';
      ctx.beginPath(); ctx.moveTo(...nodes[a]); ctx.quadraticCurveTo(160, 160, ...nodes[b]); ctx.stroke();
      if (lit) {
        const u = (ms % 700) / 700, [x1, y1] = nodes[a], [x2, y2] = nodes[b];
        const x = (1 - u) ** 2 * x1 + 2 * (1 - u) * u * 160 + u * u * x2, y = (1 - u) ** 2 * y1 + 2 * (1 - u) * u * 160 + u * u * y2;
        ctx.fillStyle = '#0071e3'; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill();
      }
    });
    ctx.strokeStyle = '#1d1d1f'; ctx.lineWidth = 22; ctx.beginPath(); ctx.ellipse(160, 160, 136, 146, 0, 0, 7); ctx.stroke();
    nodes.forEach(([x, y], i) => { ctx.fillStyle = i % 4 === 0 ? '#0071e3' : '#ffffff'; ctx.fillRect(x - 9, y - 9, 18, 18); });
    if (!still) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
})();

// ------------------------------------------------------------- chrome: bar, entrances
let lastY = 0;
addEventListener('scroll', () => { const y = scrollY; $('.bar').classList.toggle('away', y > lastY && y > 400); lastY = y; }, { passive: true });
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.15 });
for (const el of $$('.how-text, .switches, .cta-form, .foot-top, .r-head')) { el.classList.add('reveal'); io.observe(el); }

// ------------------------------------------------------------- asking
const input = $('#repo');
// A long name shrinks to fit the box instead of running under the button.
const fitAsk = () => { input.style.fontSize = ''; let f = parseFloat(getComputedStyle(input).fontSize); while (input.scrollWidth > input.clientWidth && f > 18) { f -= 3; input.style.fontSize = f + 'px'; } };
input.addEventListener('input', fitAsk); addEventListener('resize', fitAsk); requestAnimationFrame(fitAsk);
$('#ask').addEventListener('submit', e => { e.preventDefault(); run(input.value); });
$$('.examples button').forEach(b => b.addEventListener('click', () => { input.value = b.dataset.repo; run(b.dataset.repo); }));
$('#cta').addEventListener('submit', e => { e.preventDefault(); const v = $('#cta-repo').value; input.value = v; $('#tell').scrollIntoView(); run(v); });

function stage(name, text, p) {
  const order = ['read', 'fetch', 'map', 'site', 'film'], at = order.indexOf(name);
  $$('#stages li').forEach((li, i) => {
    li.dataset.state = i < at ? 'done' : i === at ? 'now' : 'wait';
    li.style.setProperty('--p', i < at ? 1 : i === at ? p : 0);
    li.querySelector('b').textContent = i === at ? text : '';
  });
}

/** Any link that is not GitHub is a website to walk through. */
const siteOf = v => { if (!/^https?:\/\//i.test(v.trim())) return null; try { const u = new URL(v.trim()); return /(^|\.)github\.com$/i.test(u.host) ? null : u.href; } catch { return null; } };

// The stage list speaks about code; for a website it names what actually happens.
const stageLabels = () => $$('#stages li span').map(x => x.textContent);
const repoStages = stageLabels();
const label = names => $$('#stages li').forEach((li, i) => { li.querySelector('span').textContent = names[i]; li.hidden = !names[i]; });

async function runSite(url) {
  const err = $('#ask-error');
  setJinaKey($('#jina-key').value);
  label(['Open the website', '', '', 'Read and photograph each page', 'Write the film']);
  player?.pause();
  $('.ask-note').hidden = true; $('#stages').hidden = false;
  $('#ask').setAttribute('aria-busy', 'true'); $$('.ask-go, .examples button').forEach(b => b.disabled = true);
  try {
    const site = await crawlSite(url, { progress: (st, d, t) => stage(st, st === 'site' ? `${d} / ${t} pages` : 'opening the site', t ? d / t : 0) });
    stage('film', '', 0.6);
    scenes = buildSiteStory(site);
    model = { meta: { name: site.host, full: site.host }, site };
    $$('#stages li').forEach(li => { li.dataset.state = 'done'; li.style.setProperty('--p', 1); li.querySelector('b').textContent = ''; });
    history.replaceState(null, '', '#site=' + encodeURIComponent(site.start));
    showSite(site);
  } catch (e) {
    err.textContent = e instanceof RepoError ? e.message : `Something went wrong reading that website: ${e.message}`;
    err.hidden = false; $('#stages').hidden = true; console.error(e);
  } finally {
    $('#ask').removeAttribute('aria-busy'); $$('.ask-go, .examples button').forEach(b => b.disabled = false);
  }
}

/** A website has a film and nothing else: no code, so no architecture, files or evidence. */
function showSite(site) {
  $('#result').hidden = false;
  document.body.classList.add('has-result');
  $('#r-name').textContent = site.host;
  $('#r-desc').textContent = site.title ?? '';
  $('#r-meta').replaceChildren(`${site.pages.length} pages read and photographed from `, h('a', { href: site.start, target: '_blank', rel: 'noopener' }, site.start));
  document.title = `${site.host} — RepoTale`;
  for (const t of ['arch', 'map', 'evidence', 'export']) $('#t-' + t).hidden = true;
  selectTab('film');
  setupFilm();
  $('#result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

async function run(value) {
  fitAsk();
  const site = siteOf(value);
  if (site) return runSite(site);
  for (const t of ['arch', 'map', 'evidence', 'export']) $('#t-' + t).hidden = false;
  label(repoStages);
  const repo = parseRepo(value);
  const err = $('#ask-error');
  err.hidden = true;
  if (!repo) { err.textContent = 'That does not look like a repository or a website. Try owner/name, a github.com link, or https://any-website.com.'; err.hidden = false; return; }
  player?.pause();
  $('.ask-note').hidden = true; $('#stages').hidden = false;
  $('#ask').setAttribute('aria-busy', 'true'); $$('.ask-go, .examples button').forEach(b => b.disabled = true);
  try {
    model = await analyze(value, {
      token: $('#token').value.trim() || undefined,
      progress: (s, d, t) => stage(s, s === 'fetch' ? `${d} / ${t}` : '', t ? d / t : 0),
    });
    const shots = await photograph(model, $('#live').value.trim());
    stage('film', 'laying out the architecture', 0.3);
    // The diagram and the film's architecture beats share one layout.
    arch = null; archLay = null;
    try { const elk = await loadElk(); arch = buildArch(model); archLay = await layoutArch(arch, elk); } catch (e) { console.warn('layout', e); }
    stage('film', '', 0.7);
    scenes = buildStory(model, { shots, arch: arch && archLay ? { arch, lay: archLay } : null });
    stage('film', '', 1);
    $$('#stages li').forEach(li => { li.dataset.state = 'done'; li.style.setProperty('--p', 1); li.querySelector('b').textContent = ''; });
    history.replaceState(null, '', '#/' + model.meta.full);
    show();
  } catch (e) {
    err.textContent = e instanceof RepoError ? e.message : `Something went wrong reading that repository: ${e.message}`;
    err.hidden = false; $('#stages').hidden = true;
    console.error(e);
  } finally {
    $('#ask').removeAttribute('aria-busy'); $$('.ask-go, .examples button').forEach(b => b.disabled = false);
  }
}

/** Screenshots of the running site: the home page, then pages the code defines. Pages that cannot
 *  be photographed in time are left out of the film rather than shown broken. */
async function photograph(model, override) {
  const live = /^https?:\/\//.test(override) ? override.replace(/\/?$/, '/') : model.live;
  if (!live) { stage('site', 'no live site found', 1); return []; }
  model.live = live;
  const home = model.pages.find(p => p.route === '/');
  const want = [{ route: '/', file: home?.file ?? null, heading: home?.heading ?? null }, ...model.pages.filter(p => p.route !== '/')].slice(0, 5);
  // One at a time: the free screenshot service refuses requests made in parallel.
  const got = [];
  for (const [k, p] of want.entries()) {
    stage('site', `${k} / ${want.length}`, k / want.length);
    const url = new URL(p.route.replace(/^\//, ''), live).href;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const [img, read] = await Promise.all([shot(url, 40000), readPage(url)]); got.push({ ...p, url, img, read }); break; }
      catch { await new Promise(r => setTimeout(r, 1500)); }
    }
  }
  stage('site', `${got.length} / ${want.length}`, 1);
  return got;
}

// ------------------------------------------------------------- voice
function voiceNote(html) { $('#voice-note').innerHTML = html; }
/** Make the neural narration for every scene, in order, and fit each scene to its audio. */
function prepareVoice() {
  const job = ++voiceJob;
  pool.clear();
  for (const s of scenes) s.audio = null;
  if (opts.voice && opts.voiceName.startsWith('eleven:')) return prepareEleven(job);
  if (!opts.voice || opts.voiceName === 'browser') { voiceNote(opts.voice ? 'Using your browser’s own voice. Pick a neural voice for a natural one, and for a video with sound.' : 'Narration is off.'); return; }
  audioContext ??= new AudioContext();
  let ready = 0;
  const label = VOICES.find(v => v.id === opts.voiceName)?.label ?? opts.voiceName;
  voiceNote(`Neural voice <b>${label}</b>: starting. The first time, the voice model (about 90 MB) downloads once and is then kept by your browser.`);
  pool.onstatus = st => {
    if (job !== voiceJob) return;
    if (st.loading != null && !ready) voiceNote(`Neural voice <b>${label}</b>: loading the model, ${Math.round(st.loading * 100)}%.`);
    if (st.ready === 1 && !ready) voiceNote(`Neural voice <b>${label}</b>: ${st.mode === 'studio' ? 'studio quality on your graphics card' : 'standard quality on your processor'}, speaking the first scene.`);
    if (st.error) voiceNote(`The neural voice could not start here (${st.error}). Choose “Browser voice” instead.`);
  };
  scenes.forEach(s => pool.say(s.say, opts.voiceName).then(({ audio, rate }) => {
    if (job !== voiceJob) return;
    const buf = audioContext.createBuffer(1, audio.length, rate);
    buf.copyToChannel(audio, 0);
    s.audio = buf; s.duration = Math.max(3200, Math.round(buf.duration * 1000) + 650);
    ready++;
    voiceNote(ready === scenes.length ? `Neural voice <b>${label}</b>: ready. Download video now includes the narration.` : `Neural voice <b>${label}</b>: ${ready} of ${scenes.length} scenes ready. You can press play; it waits for each one.`);
    player?.emit();
  }, () => {}));
}
/** ElevenLabs with the visitor's key: the most natural voice, made in the cloud. */
function prepareEleven(job) {
  audioContext ??= new AudioContext();
  const key = $('#eleven-key').value.trim(), voice = opts.voiceName.slice(7);
  $('#eleven').hidden = false;
  if (!key) { voiceNote('Paste an ElevenLabs API key below to use its voices. It stays in this tab and goes only to api.elevenlabs.io.'); return; }
  let ready = 0;
  voiceNote('ElevenLabs: voicing the film…');
  const next = async i => {
    if (job !== voiceJob || i >= scenes.length) return;
    const s = scenes[i];
    try {
      const buf = await audioContext.decodeAudioData(await elevenSay(s.say, voice, key));
      if (job !== voiceJob) return;
      s.audio = buf; s.duration = Math.max(3200, Math.round(buf.duration * 1000) + 650);
      ready++; voiceNote(ready === scenes.length ? 'ElevenLabs: ready. Download video now includes the narration.' : `ElevenLabs: ${ready} of ${scenes.length} scenes ready.`);
      player?.emit();
      next(i + 1);
    } catch (e) { voiceNote(`${e.message} Choose another voice, or check the key.`); }
  };
  next(0);
}
$('#eleven-key').addEventListener('change', () => { if (scenes && opts.voiceName.startsWith('eleven:')) { player.pause(); prepareVoice(); } });

function fillVoices() {
  $('#voice').replaceChildren(
    h('optgroup', { label: 'Neural, in your browser, free' }, ...VOICES.map(v => h('option', { value: v.id }, v.label))),
    h('optgroup', { label: 'ElevenLabs, your API key' }, ...ELEVEN.map(v => h('option', { value: 'eleven:' + v.id }, v.label))));
  $('#voice').value = opts.voiceName;
}
fillVoices();
$('#voice').addEventListener('change', e => {
  opts.voiceName = e.target.value; store.set('voiceName', opts.voiceName);
  $('#eleven').hidden = !opts.voiceName.startsWith('eleven:');
  if (!scenes) return;
  player.pause(); player.opts.voiceName = opts.voiceName; prepareVoice(); player.draw();
});

// ------------------------------------------------------------- the result
function show() {
  const { meta, totals } = model;
  $('#result').hidden = false;
  document.body.classList.add('has-result');
  $('#r-name').textContent = meta.name;
  $('#r-desc').textContent = meta.description || `${totals.languages[0]?.[0] ?? 'A'} project by ${meta.owner}.`;
  $('#r-meta').replaceChildren(
    `${fmt(meta.stars)} stars · ${meta.license ?? 'no license'} · `,
    h('a', { href: `https://github.com/${meta.full}/tree/${meta.sha}` }, `${meta.ref}@${meta.sha.slice(0, 7)}`),
    ` · read ${fmt(totals.code + totals.tests)} of ${fmt(totals.files)} files`);
  document.title = `${meta.name} — RepoTale`;
  selectTab('arch');
  setupFilm(); drawMap(); drawEvidence(); drawExports(); drawHow(); syncBands(); drawArch();
  $('#result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

// tabs
function selectTab(name) {
  $$('.tabs [role="tab"]').forEach(t => {
    const on = t.id === 't-' + name;
    t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
    $('#' + t.getAttribute('aria-controls')).hidden = !on;
  });
  if (name !== 'film') player?.pause();
  if (name === 'arch' && arch) requestAnimationFrame(fitArch);
}
$$('.tabs [role="tab"]').forEach((t, i, all) => {
  t.addEventListener('click', () => selectTab(t.id.slice(2)));
  t.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
    const n = all[(i + d + all.length) % all.length]; n.focus(); selectTab(n.id.slice(2));
  });
});

// ------------------------------------------------------------- film
function setupFilm() {
  player?.pause();
  prepareVoice();
  player = new Player($('#film'), scenes, { voice: opts.voice, voiceName: opts.voiceName, captions: opts.captions, audioContext, onEnd: () => $('#bigplay').classList.remove('gone') });
  const list = $('#script');
  list.replaceChildren(...scenes.map((s, i) => h('li', { tabindex: 0, onclick: () => { player.seek(i); }, onkeydown: e => { if (e.key === 'Enter') player.seek(i); } },
    h('h3', {}, s.heading),
    h('p', {}, s.say),
    s.evidence.length ? h('div', { class: 'cites' }, s.evidence.map(e => h('a', { href: e.url, target: '_blank', rel: 'noopener', onclick: ev => ev.stopPropagation() }, e.file + (e.line ? `:${e.line}` : '')))) : null)));
  const sync = p => {
    $$('#script li').forEach((li, i) => li.setAttribute('aria-current', i === p.i));
    $('#play').textContent = p.playing ? 'Pause' : 'Play';
    $('#bigplay').classList.toggle('gone', p.playing || p.i > 0 || p.elapsed > 0);
    const before = scenes.slice(0, p.i).reduce((s, x) => s + x.duration, 0);
    $('#time').textContent = `${clock(before + p.elapsed)} / ${clock(p.total)}`;
    if (!seeking) { $('#seek').value = Math.round(((before + p.elapsed) / p.total) * 1000); $('#seek').style.setProperty('--fill', `${$('#seek').value / 10}%`); }
  };
  player.on(sync); sync(player);
  clearInterval(setupFilm.timer); setupFilm.timer = setInterval(() => player.playing && sync(player), 250);
  $('#rec-note').hidden = true;
}
$('#play').addEventListener('click', () => player.playing ? player.pause() : player.play());
// The big button means "watch": it plays and fills the screen.
$('#bigplay').addEventListener('click', () => { player.play(); fullscreen(true); });
let seeking = false;
$('#seek').addEventListener('input', e => { seeking = true; player.seekTo((e.target.value / 1000) * player.total); e.target.style.setProperty('--fill', `${e.target.value / 10}%`); });
$('#seek').addEventListener('change', () => { seeking = false; });
const fullscreen = on => { const w = $('#film-wrap'); if (on && !document.fullscreenElement) w.requestFullscreen?.().catch(() => {}); else if (!on && document.fullscreenElement) document.exitFullscreen(); };
$('#fs').addEventListener('click', () => fullscreen(!document.fullscreenElement));
$('#film').addEventListener('dblclick', () => fullscreen(!document.fullscreenElement));
document.addEventListener('fullscreenchange', () => { $('#fs').textContent = document.fullscreenElement === $('#film-wrap') ? 'Exit full screen' : 'Full screen'; });
$('#film').addEventListener('click', () => player.playing ? player.pause() : player.play());
$('#prev').addEventListener('click', () => player.seek(player.i - 1));
$('#next').addEventListener('click', () => player.seek(player.i + 1));
addEventListener('keydown', e => {
  if (!player || $('#p-film').hidden || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if (e.key === ' ' && (document.activeElement === document.body || document.fullscreenElement)) { e.preventDefault(); player.playing ? player.pause() : player.play(); }
  // Watching keys: arrows skip five seconds (shift: a scene), F fills the screen, M toggles the voice.
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const d = e.key === 'ArrowRight' ? 1 : -1; e.shiftKey ? player.seek(player.i + d) : player.seekTo(Math.max(0, player.time + d * 5000)); }
  if (e.key === 'f' || e.key === 'F') fullscreen(!document.fullscreenElement);
});
$('#rec').addEventListener('click', async () => {
  const btn = $('#rec'), note = $('#rec-note');
  if (recording) { recording.abort(); return; }
  recording = new AbortController();
  btn.textContent = 'Stop recording'; note.hidden = false;
  const signal = recording.signal;
  try {
    player.pause();
    const neural = opts.voice && opts.voiceName !== 'browser';
    // A voiced video needs every scene's audio first.
    while (neural && !signal.aborted && !scenes.every(s => s.audio)) {
      note.textContent = `Waiting for the voice: ${scenes.filter(s => s.audio).length} of ${scenes.length} scenes ready.`;
      await new Promise(r => setTimeout(r, 500));
    }
    const voiced = neural && scenes.every(s => s.audio);
    const blob = signal.aborted ? null : await record(scenes, { captions: opts.captions, audioContext: voiced ? audioContext : null, signal }, p => {
      note.textContent = `Recording in real time: ${Math.round(p * 100)}%. Keep this tab open.${voiced ? ' The narration is recorded into the file.' : ' Choose a neural voice to record narration; browser voices cannot be recorded.'}`;
    });
    if (blob) {
      const name = `${model.meta.name}-repotale.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
      note.replaceChildren('Done. ', h('a', { href: URL.createObjectURL(blob), download: name }, `Save ${name}`), ` (${(blob.size / 1e6).toFixed(1)} MB${voiced ? ', with narration' : ', silent with captions'}).`);
      download(blob, name);
    } else note.textContent = 'Recording stopped.';
  } catch (e) { note.textContent = e.message; }
  recording = null; btn.textContent = 'Download video';
});

// ------------------------------------------------------------- map
const SVGNS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el.append(...kids); return el; };

function drawMap() {
  const byFile = new Map(model.modules.map(m => [m.file, m]));
  const core = new Set(model.core.map(m => m.file)), entry = new Set(model.entries.map(m => m.file));
  const areas = model.areas.map(a => ({ ...a, files: a.files.filter(f => opts.tests || !byFile.get(f).test).sort((x, y) => byFile.get(y).importedBy.length - byFile.get(x).importedBy.length || x.localeCompare(y)) })).filter(a => a.files.length);
  const CW = 210, GAP = 70, RH = 30, TOP = 84, PAD = 24;
  const pos = new Map();
  areas.forEach((a, k) => a.files.forEach((f, r) => pos.set(f, { x: PAD + k * (CW + GAP), y: TOP + r * RH, col: k })));
  const W = PAD * 2 + areas.length * (CW + GAP) - GAP, H = TOP + Math.max(...areas.map(a => a.files.length)) * RH + PAD;
  const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Architecture of ${model.meta.full}: ${areas.length} areas, ${model.edges.length} imports` });
  svg.append(s('rect', { width: W, height: H, fill: '#f5f5f7' }));
  const edgeLayer = s('g'), nodeLayer = s('g');
  areas.forEach((a, k) => {
    const x = PAD + k * (CW + GAP);
    svg.append(s('text', { x, y: 40, fill: '#1d1d1f', 'font-family': 'Inter Tight', 'font-weight': 700, 'font-size': 24 }, base(a.name).slice(0, 18)));
    svg.append(s('text', { x, y: 62, fill: '#6e6e73', 'font-family': 'Inter Tight', 'font-size': 13 }, `${a.name === base(a.name) ? '' : a.name + ' · '}${a.files.length} file${a.files.length === 1 ? '' : 's'}`));
  });
  for (const e of model.edges) {
    const A = pos.get(e.from), B = pos.get(e.to); if (!A || !B) continue;
    const back = B.col <= A.col;
    if (back && !opts.back) continue;
    const x1 = A.x + CW, y1 = A.y + 12, x2 = B.x, y2 = B.y + 12;
    const d = back ? `M${A.x + CW} ${y1} C${A.x + CW + GAP * 0.8} ${y1}, ${B.x + CW + GAP * 0.8} ${y2}, ${B.x + CW} ${y2}` : `M${x1} ${y1} C${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
    edgeLayer.append(s('path', { d, class: 'edge', 'data-from': e.from, 'data-to': e.to }));
  }
  for (const [f, p] of pos) {
    const m = byFile.get(f);
    const g = s('g', { class: 'node', transform: `translate(${p.x} ${p.y})`, tabindex: 0, role: 'button', 'data-file': f, 'aria-label': `${f}, imported by ${m.importedBy.length}` });
    g.append(s('title', {}, f));
    g.append(s('rect', { width: CW, height: 24, fill: '#e8e8ed' }));
    g.append(s('rect', { width: 5, height: 24, fill: core.has(f) ? '#0071e3' : entry.has(f) ? '#1d1d1f' : m.test ? '#6e6e73' : '#e8e8ed' }));
    g.append(s('text', { x: 14, y: 16.5, fill: m.test ? '#6e6e73' : '#1d1d1f', 'font-family': 'Inter Tight', 'font-size': 13 }, base(f).length > 24 ? base(f).slice(0, 23) + '…' : base(f)));
    if (m.importedBy.length) g.append(s('text', { x: CW - 8, y: 16.5, fill: '#6e6e73', 'font-family': 'Inter Tight', 'font-size': 12, 'text-anchor': 'end' }, m.importedBy.length));
    g.addEventListener('click', () => select(f));
    g.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(f); } });
    nodeLayer.append(g);
  }
  svg.append(edgeLayer, nodeLayer);
  $('#map').replaceChildren(svg);
  if (selected && pos.has(selected)) select(selected, false); else { selected = null; inspectEmpty(); }
}
function inspectEmpty() { $('#inspect').replaceChildren(h('p', { class: 'inspect-empty' }, 'Select a file to see what it defines, what it imports, what imports it, and what a change to it could reach.')); }

function select(f, scroll = true) {
  selected = f;
  const m = model.modules.find(x => x.file === f), svg = $('#map svg');
  const reach = blastRadius(f, model.edges);
  const blast = $('#blast').checked;
  $$('.node', svg).forEach(n => {
    const nf = n.dataset.file;
    n.classList.toggle('sel', nf === f);
    for (const k of [1, 2, 3]) n.classList.toggle('hop' + k, blast && Math.min(3, reach.get(nf) ?? 0) === k);
    n.classList.toggle('dim', nf !== f && !(blast ? reach.has(nf) : m.imports.includes(nf) || m.importedBy.includes(nf)));
  });
  $$('.edge', svg).forEach(e => {
    const out = e.dataset.from === f, inn = e.dataset.to === f || (blast && reach.has(e.dataset.from) && (reach.has(e.dataset.to) || e.dataset.to === f));
    e.classList.toggle('out', out); e.classList.toggle('in', !out && inn); e.classList.toggle('dim', !out && !inn);
  });
  if (scroll) $(`.node[data-file="${CSS.escape(f)}"]`, svg)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  const tests = model.testsReaching(f);
  const link = (file, line) => h('a', { href: permalink(model.meta, file, line), target: '_blank', rel: 'noopener' }, file + (line ? `:${line}` : ''));
  const jump = file => h('button', { type: 'button', onclick: () => select(file) }, file);
  $('#inspect').replaceChildren(
    h('h3', {}, base(f)), h('p', { class: 'path' }, link(f), ` · ${fmt(m.lines)} lines`),
    h('div', { class: 'big' }, h('div', {}, h('b', {}, m.importedBy.length), h('span', {}, 'import it')), h('div', {}, h('b', {}, reach.size), h('span', {}, 'can feel a change')), h('div', {}, h('b', {}, tests.length), h('span', {}, 'tests reach it'))),
    m.symbols.length ? [h('h4', {}, `Defines (${m.symbols.length})`), h('ul', {}, m.symbols.slice(0, 40).map(sy => h('li', {}, h('a', { href: permalink(model.meta, f, sy.line), target: '_blank', rel: 'noopener' }, sy.name, h('small', {}, `${sy.kind} · line ${sy.line}`)))))] : null,
    m.imports.length ? [h('h4', {}, `Imports (${m.imports.length})`), h('ul', {}, m.imports.map(x => h('li', {}, jump(x))))] : null,
    m.importedBy.length ? [h('h4', {}, `Imported by (${m.importedBy.length})`), h('ul', {}, m.importedBy.map(x => h('li', {}, jump(x))))] : null,
    m.external.length ? [h('h4', {}, 'Packages'), h('ul', {}, [...new Set(m.external)].map(x => h('li', {}, h('a', { href: `https://www.npmjs.com/package/${x}`, target: '_blank', rel: 'noopener' }, x))))] : null,
  );
}
$('#blast').addEventListener('change', () => selected && select(selected, false));
$('#find').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase(); let first = null;
  $$('#map .node').forEach(n => { const hit = q && n.dataset.file.toLowerCase().includes(q); n.classList.toggle('hit', hit); if (hit && !first) first = n; });
  first?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
});

// ------------------------------------------------------------- evidence
function drawEvidence() {
  const { meta } = model, byFile = new Map(model.modules.map(m => [m.file, m]));
  const row = (file, right, line) => h('li', {}, h('a', { href: permalink(meta, file, line), target: '_blank', rel: 'noopener' }, file + (line ? `:${line}` : '')), h('span', {}, right));
  const code = model.modules.filter(m => !m.test);
  const mostUsed = [...code].sort((a, b) => b.importedBy.length - a.importedBy.length).slice(0, 15).filter(m => m.importedBy.length > 1);
  const untested = mostUsed.filter(m => !model.testsReaching(m.file).length).slice(0, 8);
  const biggest = [...code].sort((a, b) => b.lines - a.lines).slice(0, 6);
  const F = (title, note, items, cls = '') => h('section', { class: 'finding ' + cls }, h('h3', {}, title), h('p', {}, note), h('ul', {}, items));
  $('#evidence').replaceChildren(...[
    meta.truncated ? F('A sample, not the whole', `Read ${fmt(model.totals.code + model.totals.tests)} source files, preferring code near the top of the tree. Numbers below describe that sample.`, [], 'wide hot') : null,
    F('Core modules', 'Imported by the most other files. A change here travels furthest.', model.core.map(m => row(m.file, `${m.importedBy.length} importers`))),
    F('Entry points', 'Import others but nothing in the code imports them: where things start.', model.entries.map(m => row(m.file, `${m.imports.length} imports`))),
    F('Import cycles', model.cycles.length ? 'Files that import each other in a loop. Each loop makes them change together.' : 'None found: every import points one way.',
      model.cycles.slice(0, 8).map(c => row(c.loop[0], `${[...c.loop, c.loop[0]].map(base).join(' → ')}${c.size > c.loop.length ? ` (+${c.size - c.loop.length} tangled)` : ''}`, model.edges.find(e => e.from === c.loop[0] && e.to === (c.loop[1] ?? c.loop[0]))?.line)), model.cycles.length ? 'hot' : ''),
    F('Widely used, never tested', untested.length ? 'Imported by several files, yet no test file reaches them through imports.' : 'Every widely used module is reached by at least one test.', untested.map(m => row(m.file, `${m.importedBy.length} importers · 0 tests`)), untested.length ? 'hot' : ''),
    F('Largest files', 'By lines. Large files that are also core are the first places to split.', biggest.map(m => row(m.file, `${fmt(m.lines)} lines`))),
    F('Stack', 'Each name comes from a manifest in the repository.', model.stack.map(x => row(x.proof, `${x.name} · ${x.detail}`))),
    F('Packages used most', 'Outside packages, by how many files import them.', model.external.slice(0, 10).map(([p, n]) => h('li', {}, h('a', { href: `https://www.npmjs.com/package/${p}`, target: '_blank', rel: 'noopener' }, p), h('span', {}, `${n} files`)))),
    F('Languages', `Across all ${fmt(model.totals.files)} files in the tree.`, model.totals.languages.slice(0, 8).map(([l, n]) => h('li', {}, h('a', {}, l), h('span', {}, `${fmt(n)} files`)))),
  ].filter(Boolean));
}

// ------------------------------------------------------------- exports
function download(blob, name) { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
const json = (o, name) => download(new Blob([JSON.stringify(o, null, 2) + '\n'], { type: 'application/json' }), name);

function drawExports() {
  const { meta } = model;
  const share = `${location.origin}${location.pathname}#/${meta.full}`;
  const badge = `[![Explained by RepoTale](https://img.shields.io/badge/explained%20by-RepoTale-ff488b)](${share})`;
  const item = (title, note, action, pre) => h('li', {}, h('div', {}, h('h3', {}, title), h('p', {}, note)), action, pre ? h('pre', {}, pre) : null);
  const btn = (label, fn) => h('button', { class: 'ctl', type: 'button', onclick: fn }, label);
  const copy = text => async e => { const b = e.currentTarget, was = b.textContent; try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; } catch { b.textContent = 'Select and copy below'; } setTimeout(() => b.textContent = was, 1600); };
  $('#exports').replaceChildren(
    item('Share link', 'Opens this page and reads the same repository.', btn('Copy link', copy(share)), share),
    item('README badge', 'Paste into the README so visitors can open the film and the map.', btn('Copy markdown', copy(badge)), badge),
    item('Architecture diagram', 'SVG, PNG and Mermaid, in dark or light, from the toolbar above the diagram.', btn('Open the diagram', () => selectTab('arch'))),
    item('Storyboard', 'The film as reporeel.json. Run the CLI inside a clone to render it in HD with a local voice, and to check every citation against the code.', btn('Download', () => json(storyboardOf(model, scenes), 'reporeel.json')), `git clone ${meta.url}.git && cd ${meta.name}\n# put reporeel.json in the root, then:\nnpx @theharshdubey/reporeel video`),
    item('Graph.json', `Every module, symbol and import, pinned to commit ${meta.sha.slice(0, 7)}.`, btn('Download', () => json(graphOf(model), `${meta.name}-graph.json`))),
  );
}

// ------------------------------------------------------------- how it works
const STEPS = [
  ['First, read the whole tree', 'One request lists every file at the commit. Up to 220 source files are then read from GitHub\'s raw host, preferring code near the top of the tree over tests and vendored folders.'],
  ['Then, map every import', 'Imports in JavaScript, TypeScript, Python and Go are matched to the files they name. An edge exists only when the target is really in the tree; nothing is guessed.'],
  ['Next, cite every claim', 'Each finding links to the file and line it came from, pinned to the commit, so the link never drifts when the code moves on.'],
  ['Last, write the film', 'The findings and the live pages become scenes. Kokoro, an open neural voice, reads them in your browser; each scene lasts exactly as long as its sentence, and the video you download carries the voice.'],
];
function fragment(i) {
  const m = model;
  const files = m ? m.modules.slice(0, 5) : [{ file: 'source/index.ts', lines: 84 }, { file: 'source/core/Ky.ts', lines: 412 }, { file: 'source/errors/HTTPError.ts', lines: 31 }, { file: 'source/utils/merge.ts', lines: 96 }, { file: 'test/main.ts', lines: 590 }];
  const core = m?.core[0] ?? { file: 'source/core/Ky.ts', importedBy: Array(6), symbols: [{ name: 'Ky', line: 18 }] };
  const name = m?.meta.full ?? 'sindresorhus/ky';
  if (i === 0) return h('div', { class: 'frag' }, h('p', { class: 'frag-cap' }, name), files.map((f, k) => h('div', { class: 'frag-row' + (k === 1 ? ' on' : '') }, h('b', {}, f.file), h('span', {}, `${fmt(f.lines)} lines`))));
  if (i === 1) return h('div', { class: 'frag' }, h('p', { class: 'frag-cap' }, base(core.file)), h('div', { class: 'frag-row pink' }, h('b', {}, 'Imported by'), h('span', {}, `${core.importedBy.length} files`)),
    (m ? core.importedBy.slice(0, 4) : ['source/index.ts', 'source/types/options.ts', 'source/utils/normalize.ts']).map(f => h('div', { class: 'frag-row' }, h('b', {}, f), h('span', {}, '→ ' + base(core.file)))));
  if (i === 2) { const sy = core.symbols[0] ?? { name: base(core.file), line: 1 }; return h('div', { class: 'frag' }, h('p', { class: 'frag-cap' }, 'Cited'), h('div', { class: 'frag-row on' }, h('b', {}, h('code', {}, `${core.file}:${sy.line}`)), h('span', {}, (m?.meta.sha ?? '7c1e2a9').slice(0, 7))), h('div', { class: 'frag-row' }, h('b', {}, sy.name), h('span', {}, `line ${sy.line}`))); }
  return h('div', { class: 'frag' }, h('div', { class: 'frag-film' }, h('i', {}, `${core.file}:${core.symbols[0]?.line ?? 1}`), h('b', {}, m?.meta.name ?? 'ky'), h('span', {}, `The heart of it is ${base(core.file).replace(/\.[a-z]+$/, '')}. ${core.importedBy.length} other files import it.`)));
}
function drawHow() {
  const i = Number($('#how-range').value);
  $('#how-clause').textContent = STEPS[i][0]; $('#how-body').textContent = STEPS[i][1];
  $('#how-ui').replaceChildren(fragment(i));
  $('#how-range').setAttribute('aria-valuetext', ['Read', 'Map', 'Cite', 'Film'][i]);
  $('#how-range').style.setProperty('--fill', `${(i / 3) * 100}%`);
  $$('.how-names li').forEach((li, k) => li.classList.toggle('on', k === i));
}
$('#how-range').addEventListener('input', drawHow);
drawHow();

// ------------------------------------------------------------- switches
function syncBands() {
  $$('.band').forEach(b => { const on = !!opts[b.dataset.key]; b.classList.toggle('on', on); $('.toggle', b).setAttribute('aria-checked', on); });
  if (model) {
    const back = model.edges.filter(e => { const a = model.areas.findIndex(x => x.files.includes(e.from)), b = model.areas.findIndex(x => x.files.includes(e.to)); return b <= a; }).length;
    $('#back-more').textContent = `${model.meta.name} has ${fmt(back)} of ${fmt(model.edges.length)} imports going against the flow.`;
    $('#tests-more').textContent = `${model.meta.name} has ${fmt(model.totals.tests)} test files among the ${fmt(model.totals.code + model.totals.tests)} read.`;
  }
}
$$('.band').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.key; opts[k] = !opts[k]; store.set(k, opts[k]); syncBands();
  if (!model) return;
  if (k === 'voice' || k === 'captions') { player.pause(); player.opts[k] = opts[k]; if (k === 'voice') { prepareVoice(); player.opts.audioContext = audioContext; } player.draw(); }
  else drawMap();
}));
syncBands();

// ------------------------------------------------------------- architecture diagram
const view = { x: 0, y: 0, k: 1 };

/** The page's own fonts, embedded so the diagram keeps its type as an image or a PNG. */
let fontData = null;
async function withFont(svg) {
  try {
    fontData ??= (async () => {
      const css = await (await fetch('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;600;700&display=swap')).text();
      // Only the latin subsets: the diagram's text is file names and English.
      const blocks = css.split('/*').filter(b => b.startsWith(' latin */')).map(b => b.slice(10));
      const out = [];
      for (const b of blocks) {
        const url = b.match(/url\((https:[^)]+)\)/)[1];
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        out.push(b.replace(url, 'data:font/woff2;base64,' + btoa(bin)));
      }
      return out.join('');
    })();
    return svg.replace('<defs>', `<defs><style>${await fontData}</style>`);
  } catch { return svg; }
}
async function svgImage(svg) {
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([await withFont(svg)], { type: 'image/svg+xml' }));
  await img.decode();
  return img;
}
async function svgPNG(svg, scale = 2) {
  const img = await svgImage(svg);
  const c = Object.assign(document.createElement('canvas'), { width: img.naturalWidth * scale, height: img.naturalHeight * scale });
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/png'));
}

function drawArch() {
  if (!arch || !archLay) { $('#dz').replaceChildren(h('p', { class: 'dz-wait' }, 'The layout engine could not load, so the diagram is missing. The Files view still works.')); return; }
  // Painted after the tab is visible, so fitting it measures a real size.
  requestAnimationFrame(paintArch);
}

function paintArch() {
  const dz = $('#dz');
  dz.innerHTML = renderArch(arch, archLay, { theme: archTheme });
  const svg = dz.querySelector('svg');
  svg.removeAttribute('width'); svg.removeAttribute('height');
  const [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number);
  svg.style.width = W + 'px'; svg.style.height = H + 'px';
  dz.classList.toggle('dark', archTheme === 'dark');
  fitArch();
  for (const n of $$('.node', svg)) {
    const id = n.dataset.id;
    n.addEventListener('mouseenter', () => trace(svg, id));
    n.addEventListener('mouseleave', () => trace(svg, null));
    n.addEventListener('focus', () => trace(svg, id));
    n.addEventListener('blur', () => trace(svg, null));
    const file = n.dataset.file;
    if (file) {
      const open = () => { if (!dragged) window.open(permalink(model.meta, file), '_blank', 'noopener'); };
      n.addEventListener('click', open);
      n.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
    }
  }
}

/** Light up a component, its arrows and its neighbours; dim the rest. */
function trace(svg, id) {
  svg.classList.toggle('tracing', !!id);
  if (!id) { for (const el of $$('.on', svg)) el.classList.remove('on'); return; }
  const near = new Set([id]);
  for (const e of $$('.edge, .elabel', svg)) {
    const on = e.dataset.from === id || e.dataset.to === id;
    e.classList.toggle('on', on);
    if (on) { near.add(e.dataset.from); near.add(e.dataset.to); }
  }
  for (const n of $$('.node', svg)) n.classList.toggle('on', near.has(n.dataset.id));
}

function applyView() { const svg = $('#dz svg'); if (svg) svg.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`; }
function fitArch() {
  const dz = $('#dz'), svg = dz.querySelector('svg'); if (!svg) return;
  const [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number);
  const k = Math.min(dz.clientWidth / W, dz.clientHeight / H, 1.2);
  Object.assign(view, { k, x: (dz.clientWidth - W * k) / 2, y: Math.max(0, (dz.clientHeight - H * k) / 2) });
  applyView();
}
function zoomAt(f, cx, cy) {
  const k = Math.min(4, Math.max(0.08, view.k * f));
  view.x = cx - (cx - view.x) * (k / view.k); view.y = cy - (cy - view.y) * (k / view.k); view.k = k;
  applyView();
}
let dragged = false;
{
  const dz = $('#dz');
  let start = null;
  const pts = new Map();
  dz.addEventListener('wheel', e => { e.preventDefault(); const r = dz.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  dz.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, d: null }; dragged = false; });
  dz.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) {
      // Pinch: zoom by the change in distance between the two fingers.
      const [[x1, y1], [x2, y2]] = [...pts.values()], d = Math.hypot(x2 - x1, y2 - y1), r = dz.getBoundingClientRect();
      if (start.d) zoomAt(d / start.d, (x1 + x2) / 2 - r.left, (y1 + y2) / 2 - r.top);
      start.d = d; dragged = true; return;
    }
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { dragged = true; dz.classList.add('grabbing'); dz.setPointerCapture(e.pointerId); }
    if (dragged) { view.x = start.vx + dx; view.y = start.vy + dy; applyView(); }
  });
  const end = e => { pts.delete(e.pointerId); dz.classList.remove('grabbing'); if (!pts.size) setTimeout(() => { dragged = false; }, 0); };
  dz.addEventListener('pointerup', end); dz.addEventListener('pointercancel', end);
  dz.addEventListener('dblclick', e => { const r = dz.getBoundingClientRect(); zoomAt(1.6, e.clientX - r.left, e.clientY - r.top); });
  dz.addEventListener('keydown', e => {
    const step = 60, map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (map[e.key]) { e.preventDefault(); view.x += map[e.key][0]; view.y += map[e.key][1]; applyView(); }
    if (e.key === '+' || e.key === '=') zoomAt(1.25, dz.clientWidth / 2, dz.clientHeight / 2);
    if (e.key === '-') zoomAt(0.8, dz.clientWidth / 2, dz.clientHeight / 2);
    if (e.key === '0') fitArch();
  });
}
$('#dz-in').addEventListener('click', () => zoomAt(1.3, $('#dz').clientWidth / 2, $('#dz').clientHeight / 2));
$('#dz-out').addEventListener('click', () => zoomAt(1 / 1.3, $('#dz').clientWidth / 2, $('#dz').clientHeight / 2));
$('#dz-fit').addEventListener('click', fitArch);
$('#dz-full').addEventListener('click', () => { const w = $('#dz-wrap'); document.fullscreenElement ? document.exitFullscreen() : w.requestFullscreen?.(); });
document.addEventListener('fullscreenchange', () => { $('#dz-full').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; setTimeout(fitArch, 60); });
addEventListener('resize', () => { if (arch && !$('#p-arch').hidden) fitArch(); });
$('#dz-theme').addEventListener('click', e => {
  archTheme = archTheme === 'dark' ? 'light' : 'dark';
  e.currentTarget.textContent = archTheme === 'dark' ? 'Light' : 'Dark';
  e.currentTarget.setAttribute('aria-pressed', archTheme === 'dark');
  if (arch) paintArch();
});
const archName = ext => `${model.meta.name}-architecture${archTheme === 'dark' ? '-dark' : ''}.${ext}`;
$('#dz-svg').addEventListener('click', () => arch && download(new Blob([renderArch(arch, archLay, { theme: archTheme })], { type: 'image/svg+xml' }), archName('svg')));
$('#dz-png').addEventListener('click', async e => { if (!arch) return; const b = e.currentTarget; b.disabled = true; download(await svgPNG(renderArch(arch, archLay, { theme: archTheme })), archName('png')); b.disabled = false; });
$('#dz-mermaid').addEventListener('click', async e => {
  if (!arch) return;
  const b = e.currentTarget;
  try { await navigator.clipboard.writeText('```mermaid\n' + mermaidArch(arch) + '\n```'); b.textContent = 'Copied'; } catch { b.textContent = 'Copy failed'; }
  setTimeout(() => { b.textContent = 'Copy Mermaid'; }, 1600);
});

// ------------------------------------------------------------- deep links: #/owner/name
const fromHash = () => {
  requestAnimationFrame(fitAsk);
  const site = location.hash.match(/^#site=(.+)$/);
  if (site) { input.value = decodeURIComponent(site[1]); return run(input.value); }
  const m = location.hash.match(/^#\/([\w.-]+\/[\w.-]+)/); if (m) { input.value = m[1]; run(m[1]); }
};
addEventListener('hashchange', () => { if (!model || (!location.hash.endsWith(model.meta.full) && !model.site)) fromHash(); });
fromHash();
