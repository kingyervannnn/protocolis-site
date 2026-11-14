// Range charts: real points from the benchmark rows, three layers (completed, speed, cost), two panels
// (across models, across task length). Reads the same data files and the same record selection as the tables.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else {
    // On the site the tables' script loads the data files and announces them; the draft page carries them inline.
    const go = () => factory(root.__SETS__, root.BenchmarkSelection, root.document, root);
    if (root.__SETS__) go(); else root.document.addEventListener('ts-sets', go, { once: true });
  }
})(typeof window === 'object' ? window : globalThis, function (sets, S, doc, win) {
  'use strict';
  const MAIN = ['playwright-mcp', 'browser-use-tools-mode', 'browser-harness', 'browser-use-own-agent', 'stagehand', 'protocolis-standard', 'protocolis-adaptive'];
  const TIERS = [['glm', 'Small'], ['grok', 'Strong'], ['opus', 'Frontier']], TASKS = [['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']];
  const UNIT = { completion: 'tasks completed', speed: 'seconds per completed task', cost: 'cost per completed task' };
  const state = { layer: 'completion', task: 'short', tier: 'grok', focus: null };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // The record the tables show for this system, task set and tier (first of the site's own selection).
  function record(task, tier, id) {
    const set = sets[task]; if (!set || set.status === 'withheld') return null;
    const row = set.rows.find(r => r.id === id); if (!row) return null;
    let rr = S.recordsFor(set, row, tier); if (id === 'protocolis-adaptive') rr = rr.filter(x => x.tier !== 'all');
    return rr[0] ? { row, rec: rr[0] } : null;
  }
  function value(layer, rec) {
    if (layer === 'completion') { const m = /^(\d+)\/(\d+)$/.exec(rec.completion || ''); return m && +m[2] ? 100 * m[1] / m[2] : null; }
    const s = layer === 'speed' ? rec.reportedTime : rec.cost; if (typeof s !== 'string') return null;
    const m = /^\$?(\d+(?:\.\d+)?)(?: s)?$/.exec(s); return m && +m[1] > 0 ? +m[1] : null;
  }
  function shown(layer, rec) {
    if (layer !== 'completion') return layer === 'speed' ? rec.reportedTime : rec.cost;
    const m = /^(\d+)\/(\d+)$/.exec(rec.completion); const p = 100 * m[1] / m[2];
    return (m[1] === m[2] ? '100' : (Math.round(p * 10) / 10).toFixed(1)) + '% (' + m[1] + ' of ' + m[2] + ')';
  }
  // Geometry is set per draw from the panel's real width, so one SVG unit is one CSS pixel: lines and labels keep their size
  // however wide the panel is (a fixed 400-unit canvas stretched to page width blew them up ~3x). Defaults are the old 400x210.
  let W = 400, H = 210, X0 = 46, X1 = 388, Y0 = 22, Y1 = 176, YL = 198;
  function geom(w) {
    W = Math.max(280, Math.round(w || 400)); const small = W < 520;
    H = Math.round(Math.min(360, Math.max(230, W * 0.3)));
    X0 = small ? 50 : 62; X1 = W - (small ? 10 : 18); Y0 = 14; Y1 = H - 34; YL = H - 10;
  }
  function scale(layer, vals) {
    if (layer === 'completion') {
      const lo = Math.min(80, Math.floor(Math.min(...vals) / 5) * 5), step = 100 - lo > 30 ? 10 : 5, ticks = [];
      for (let v = lo; v <= 100; v += step) ticks.push(v);
      return { y: v => Y0 + (100 - v) / (100 - lo) * (Y1 - Y0), ticks, text: v => v + '%' };
    }
    const lo = Math.min(...vals) / 1.6, hi = Math.max(...vals) * 1.6, L = Math.log10(lo), H = Math.log10(hi), ticks = [];
    for (let k = Math.floor(L) - 1; k <= Math.ceil(H); k++) for (const m of [1, 3]) { const v = +(m * Math.pow(10, k)).toPrecision(1); if (v >= lo && v <= hi) ticks.push(v); }
    return { y: v => Y1 - (Math.log10(v) - L) / (H - L) * (Y1 - Y0), ticks,
      text: v => layer === 'speed' ? v + ' s' : '$' + (v >= 0.1 ? v.toFixed(2) : String(v)) };
  }
  function kind(id) { return id === 'protocolis-adaptive' ? 'us' : id === 'protocolis-standard' ? 'st' : id === state.focus ? 'hi' : 'op'; }
  const FILL = { us: 'var(--accent)', st: '#8fa3b8', hi: 'var(--fg)', op: 'var(--dim)' };

  // panel: 'models' (x = tier, for the chosen task set) or 'length' (x = task set, for the chosen tier)
  function build(panel) {
    const cats = panel === 'models' ? TIERS : TASKS, layer = state.layer;
    const get = (id, c) => panel === 'models' ? record(state.task, c, id) : record(c, state.tier, id);
    const series = MAIN.map((id, k) => ({ id, k, pts: cats.map((c, i) => { const x = get(id, c[0]), v = x && value(layer, x.rec); return v == null ? null : { i, v, x, cat: c[1] }; }) }));
    const vals = series.flatMap(s => s.pts.filter(Boolean).map(p => p.v));
    const xc = i => X0 + (X1 - X0) * (i + .5) / cats.length, band = (X1 - X0) / cats.length;
    let out = `<line class="range-gl" x1="${X0}" y1="${Y0}" x2="${X0}" y2="${Y1}"/><line class="range-gl" x1="${X0}" y1="${Y1}" x2="${X1}" y2="${Y1}"/>`;
    cats.forEach((c, i) => {
      const withheld = panel === 'length' ? (sets[c[0]] || {}).status === 'withheld' : (sets[state.task] || {}).status === 'withheld';
      if (withheld) out += `<rect x="${(X0 + band * i + 3).toFixed(1)}" y="${Y0}" width="${(band - 6).toFixed(1)}" height="${Y1 - Y0}" fill="rgba(236,232,223,.035)"/><text class="range-lbl" x="${xc(i).toFixed(1)}" y="${(Y0 + Y1) / 2}" text-anchor="middle">being re-measured</text>`;
      out += `<text class="range-lbl" x="${xc(i).toFixed(1)}" y="${YL}" text-anchor="middle">${c[1]}</text>`;
    });
    if (!vals.length) return { svg: out + `<text class="range-lbl" x="${X0 + 8}" y="${Y0 + 14}">No figure on record for this view.</text>`, points: 0 };
    const sc = scale(layer, vals);
    sc.ticks.forEach(t => { const y = sc.y(t).toFixed(1); out += `<line class="range-gl" x1="${X0}" y1="${y}" x2="${X1}" y2="${y}" stroke-dasharray="2 6"/><text class="range-ylab" x="${X0 - 5}" y="${(+y + 3).toFixed(1)}" text-anchor="end">${sc.text(t)}</text>`; });
    const order = series.slice().sort((a, b) => ['op', 'st', 'us', 'hi'].indexOf(kind(a.id)) - ['op', 'st', 'us', 'hi'].indexOf(kind(b.id)));
    let points = 0, marks = '';
    order.forEach(s => {
      const k = kind(s.id), dx = (s.k - (MAIN.length - 1) / 2) * Math.min(7, Math.max(4.6, (X1 - X0) / 140));
      const pos = s.pts.filter(Boolean).map(p => ({ x: xc(p.i) + dx, y: sc.y(p.v), p }));
      if (pos.length > 1) out += `<path class="range-${k}" d="${pos.map((q, n) => (n ? 'L' : 'M') + q.x.toFixed(1) + ',' + q.y.toFixed(1)).join(' ')}"/>`;
      pos.forEach(q => {
        const rec = q.p.x.rec, own = layer === 'speed' && rec.clock && rec.clock !== 'FINAL';
        const tip = [q.p.x.row.contender, q.p.cat + ': ' + shown(layer, rec) + (own ? ' (its own clock)' : ''), rec.model].map(esc).join('|');
        marks += `<circle class="range-pt" tabindex="0" data-tip="${tip}" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${k === 'op' ? 2.8 : 3.5}" fill="${own ? 'var(--bg-2)' : FILL[k]}" stroke="${own ? FILL[k] : 'var(--bg-2)'}" stroke-width="1.5"/>`;
        points++;
      });
    });
    return { svg: out + marks, points };
  }
  if (!doc) return { state, build, record, value };

  const host = doc.getElementById('range'), tip = doc.getElementById('range-tip');
  function render() {
    for (const [id, panel, label] of [['range-models', 'models', 'Across models'], ['range-length', 'length', 'Across task length']])
      { const el = doc.getElementById(id); geom(el.clientWidth); el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}: ${UNIT[state.layer]}">${build(panel).svg}</svg>`; }
    host.querySelectorAll('[data-range-unit]').forEach(n => { n.textContent = UNIT[state.layer] + (state.layer === 'completion' ? '' : ' · lower is better'); });
    host.querySelectorAll('[data-layer]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.layer === state.layer)));
    host.querySelectorAll('[data-rtask]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.rtask === state.task)));
    host.querySelectorAll('[data-rtier]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.rtier === state.tier)));
  }
  function show(node) {
    const [name, line, model] = node.dataset.tip.split('|'); tip.innerHTML = `<b>${name}</b>${line}<br>${model}`; tip.hidden = false;
    const box = node.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(box.left + box.width / 2 - w / 2, win.innerWidth - w - 8)) + 'px';
    tip.style.top = (box.top - h - 10 < 8 ? box.bottom + 10 : box.top - h - 10) + 'px';
  }
  const hide = () => { tip.hidden = true; };
  host.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) { const p = e.target.closest('.range-pt'); if (p) show(p); return; }
    if (b.dataset.layer) state.layer = b.dataset.layer; else if (b.dataset.rtask) state.task = b.dataset.rtask; else if (b.dataset.rtier) state.tier = b.dataset.rtier; else return;
    hide(); render();
  });
  host.addEventListener('mouseover', e => { const p = e.target.closest('.range-pt'); if (p) show(p); });
  host.addEventListener('mouseout', e => { if (e.target.closest('.range-pt')) hide(); });
  host.addEventListener('focusin', e => { const p = e.target.closest('.range-pt'); if (p) show(p); });
  host.addEventListener('focusout', hide);
  win.addEventListener('scroll', hide, { passive: true });
  // The rival picked in the tables below is the one drawn bright here.
  const table = doc.getElementById('ts-content');
  if (table && win.MutationObserver) new win.MutationObserver(() => {
    const f = table.querySelector('tr.ts-focus[data-section="main"],tr.ts-focus[data-section="tools"]'), id = f ? f.dataset.contender : null;
    if (id !== state.focus) { state.focus = id; render(); }
  }).observe(table, { childList: true });
  // Redraw when a panel's width changes (the Range view starts hidden at width 0; window resizes).
  if (win.ResizeObserver) { const seen = new Map(), ro = new win.ResizeObserver(es => {
    if (es.some(e => { const w = Math.round(e.contentRect.width), c = w > 0 && w !== seen.get(e.target); seen.set(e.target, w); return c; })) render(); });
    ['range-models', 'range-length'].forEach(id => { const el = doc.getElementById(id); if (el) ro.observe(el); }); }
  render();
});
