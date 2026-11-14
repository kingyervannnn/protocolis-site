// Two charts from the benchmark rows. They read the same data files and the same record selection as the tables,
// so a chart and a table can never disagree, and a new result shows in both at once.
//  - #range: "More done, for less": tasks completed against cost per completed task, one point per system and model size,
//    for one task length (opens on Long). Time per completed task is a faint third axis (depth) and in each point's details.
//  - #bench-grid: "Where each system holds up": every system across model size and task length, shaded by tasks completed.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else {
    // On the site the tables' script loads the data files and announces them.
    const go = () => factory(root.__SETS__, root.BenchmarkSelection, root.document, root);
    if (root.__SETS__) go(); else root.document.addEventListener('ts-sets', go, { once: true });
  }
})(typeof window === 'object' ? window : globalThis, function (sets, S, doc, win) {
  'use strict';
  // The systems, in the tables' order and groups (Tools first, then Agents).
  const SYS = [
    { id: 'protocolis-adaptive-outside', name: 'Protocolis Adaptive', sub: 'outside agent', grp: 'tools', mode: 'ad', drive: 'outside' },
    { id: 'protocolis-standard-outside', name: 'Protocolis Standard', sub: 'outside agent', grp: 'tools', mode: 'st', drive: 'outside' },
    { id: 'playwright-mcp', name: 'Playwright MCP', sub: 'MCP server', grp: 'tools' },
    { id: 'browser-use-tools-mode', name: 'Browser Use', sub: 'tools mode', grp: 'tools' },
    { id: 'browser-harness', name: 'Browser Harness', sub: 'harness', grp: 'tools' },
    { id: 'protocolis-adaptive', name: 'Protocolis Adaptive', sub: 'own agent', grp: 'agents', mode: 'ad', drive: 'own' },
    { id: 'protocolis-standard', name: 'Protocolis Standard', sub: 'own agent', grp: 'agents', mode: 'st', drive: 'own' },
    { id: 'browser-use-own-agent', name: 'Browser Use', sub: 'own agent', grp: 'agents' },
    { id: 'stagehand', name: 'Stagehand', sub: 'framework', grp: 'agents' },
  ];
  const GROUPS = [['tools', 'Tools · I have an agent: which browser tool do I give it?'], ['agents', 'Agents · I hand over a task and get an answer']];
  const TIERS = [['glm', 'Small'], ['grok', 'Strong'], ['opus', 'Frontier']], TASKS = [['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']];
  const sys = id => SYS.find(s => s.id === id);
  const label = (list, k) => (list.find(x => x[0] === k) || [k, k])[1];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = s => { const m = /^\$?(\d+(?:\.\d+)?)(?: s)?$/.exec(typeof s === 'string' ? s.trim() : ''); return m && +m[1] > 0 ? +m[1] : null; };
  const pct1 = v => (Math.round(v * 1000) / 10).toFixed(1) + '%';

  // One cell: the record the tables show for this system, task set and tier (first of the site's own selection).
  function cell(task, tier, id) {
    const set = sets[task]; if (!set || set.status === 'withheld') return null;
    const row = set.rows.find(r => r.id === id); if (!row) return null;
    let rr = S.recordsFor(set, row, tier); if (id === 'protocolis-adaptive') rr = rr.filter(x => x.tier !== 'all');
    const rec = rr[0], m = rec && /^(\d+)\/(\d+)$/.exec(rec.completion || ''); if (!m || !+m[2]) return null;
    const right = +m[1], of = +m[2];
    return { id, task, tier, rec, right, of, rate: right / of, rpt: Math.max(1, Math.round(of / (set.taskCount || of))),
      time: num(rec.reportedTime), cost: num(rec.cost), passive: /APC_GATE_MODE=passive/.test(rec.driven_by_detail || '') };
  }
  const all = [];
  for (const [task] of TASKS) for (const [tier] of TIERS) for (const s of SYS) { const c = cell(task, tier, s.id); if (c) all.push(c); }
  const get = (task, tier, id) => all.find(c => c.task === task && c.tier === tier && c.id === id) || null;
  // Ours against the best rival in the same group, same task length and model size. A tie uses the tables' rule:
  // under 0.05 percentage points apart is the same rate.
  for (const c of all) {
    if (!sys(c.id).mode) continue;
    const riv = all.filter(r => !sys(r.id).mode && sys(r.id).grp === sys(c.id).grp && r.task === c.task && r.tier === c.tier);
    if (!riv.length) continue;
    const best = Math.max(...riv.map(r => r.rate)), pp = 100 * (c.rate - best);
    c.vs = Math.abs(pp) < 0.05 ? 'tie' : pp > 0 ? 'lead' : 'behind';
    c.vsNames = riv.filter(r => Math.abs(100 * (r.rate - best)) < 0.05).map(r => sys(r.id).name + ' (' + sys(r.id).sub + ')');
  }
  function details(c) {
    const s = sys(c.id), runs = c.rpt === 1 ? 'one run per task' : c.rpt + ' runs per task';
    const vs = c.vs === 'tie' ? 'Same completion as ' + c.vsNames.join(', ') : c.vs === 'behind' ? 'Behind ' + c.vsNames.join(', ') : c.vs === 'lead' ? 'Ahead of every rival in its group here' : '';
    const own = c.rec.clock && c.rec.clock !== 'FINAL' ? ' (its own clock)' : '';
    return `<b>${esc(s.name)} · ${esc(s.sub)}</b>${esc(label(TASKS, c.task))} tasks · ${esc(label(TIERS, c.tier))} model (${esc(c.rec.model)})<br>` +
      `${c.right} of ${c.of} completed (${pct1(c.rate)})<br>${esc(c.rec.reportedTime || 'time not reported')} per completed task${own} · ${esc(c.rec.cost || 'cost not reported')} each<br>` +
      `${c.of} runs counted · ${runs}${vs ? '<br>' + esc(vs) : ''}${c.passive ? '<br>† the test kit ran with challenge handling off' : ''}`;
  }
  // The faster-rival summary under the chart: every cell where a rival in the same group posts a faster time per completed task than ours.
  function fasterRivals() {
    let n = 0, good = 0;
    for (const [task] of TASKS) for (const [tier] of TIERS) for (const drive of ['own', 'outside']) {
      const ours = SYS.filter(s => s.drive === drive).map(s => get(task, tier, s.id)).filter(c => c && c.time != null);
      if (!ours.length) continue;
      const us = ours.reduce((a, b) => a.time <= b.time ? a : b), grp = sys(us.id).grp;
      for (const r of SYS.filter(s => !s.mode && s.grp === grp).map(s => get(task, tier, s.id))) {
        if (!r || r.time == null || r.time >= us.time) continue;
        n++; if (us.rate > r.rate && us.cost != null && r.cost != null && us.cost < r.cost) good++;
      }
    }
    return { n, good };
  }
  if (!doc) return { cell, all, details, fasterRivals };

  const tip = doc.getElementById('range-tip');
  const css = (el, n) => win.getComputedStyle(el).getPropertyValue(n).trim();
  function show(node, html, away) {
    tip.innerHTML = html; tip.hidden = false;
    const box = node.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    if (away) {
      // A chart point's depth line and time label run up and to the right, so its details open below and to the left of it,
      // moving right or up only where the screen edge leaves no room.
      const cx = box.left + box.width / 2, cy = box.top + box.height / 2, l = cx - w - 12, t = cy + 12;
      tip.style.left = Math.max(8, Math.min(l >= 8 ? l : cx + 12, win.innerWidth - w - 8)) + 'px';
      tip.style.top = Math.max(8, t + h <= win.innerHeight - 8 ? t : cy - h - 12) + 'px';
      return;
    }
    tip.style.left = Math.max(8, Math.min(box.left + box.width / 2 - w / 2, win.innerWidth - w - 8)) + 'px';
    tip.style.top = (box.top - h - 10 < 8 ? box.bottom + 10 : box.top - h - 10) + 'px';
  }
  const hide = () => { if (tip) tip.hidden = true; };
  win.addEventListener('scroll', hide, { passive: true });

  /* ---------- "More done, for less" ---------- */
  const host = doc.getElementById('range'), plot = doc.getElementById('range-plot');
  const state = { task: 'long', focus: null };
  function drawScatter() {
    const W = Math.max(300, Math.round(plot.clientWidth || 640)), small = W < 520;
    // Speed is the third dimension, drawn faint behind the 2D chart (an oblique view): the depth axis recedes up and to the right,
    // and each point's faint line runs back to its time per completed task, so further back is slower. The front face is unchanged.
    const D = small ? 46 : Math.round(Math.min(150, Math.max(60, W * 0.12))), dx = D * Math.cos(Math.PI * 32 / 180), dy = D * Math.sin(Math.PI * 32 / 180);
    const H = Math.round(Math.min(430, Math.max(280, W * 0.56)) + dy);
    const m = { l: small ? 40 : 52, r: Math.round(dx) + (small ? 42 : 46), t: Math.round(14 + dy), b: 42 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const cells = all.filter(c => c.task === state.task), pts = cells.filter(c => c.cost != null);
    const fg = css(host, '--fg'), fg2 = css(host, '--fg-2'), dim = css(host, '--dim'), rule = css(host, '--rule'), bg2 = css(host, '--bg-2');
    const col = { ad: css(host, '--ad'), st: css(host, '--st') }, riv = css(host, "--riv"), acc = css(host, "--accent");
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tasks completed against cost per completed task, with time per completed task as depth, ${esc(label(TASKS, state.task))} tasks"><!--defs-->`;
    if (!pts.length) { plot.innerHTML = s + `<text x="${m.l}" y="${m.t + 16}" fill="${dim}" font-size="12">No figure on record for this view.</text></svg>`; return; }
    // The cost axis (log) runs from the 1-2-5 value just below the cheapest point to the one just above the dearest, so no decade sits
    // empty; its lines are those two ends and every power of ten between them.
    const nice = (v, up) => { const e = Math.floor(Math.log10(v)), c = [1, 2, 5, 10].map(k => k * Math.pow(10, e)); return up ? c.find(k => k >= v * (1 - 1e-9)) : c.filter(k => k <= v * (1 + 1e-9)).pop(); };
    const cmin = Math.min(...pts.map(p => p.cost)), cmax = Math.max(...pts.map(p => p.cost)), lo = Math.log10(nice(cmin / 1.25)), hi = Math.max(lo + 0.5, Math.log10(nice(cmax * 1.25, true)));
    const xt = [Math.pow(10, lo)]; for (let e = Math.ceil(lo + 1e-9); e < hi - 1e-9; e++) xt.push(Math.pow(10, e)); xt.push(Math.pow(10, hi));
    const money = v => '$' + +v.toPrecision(v >= 1 ? 2 : 1);
    // The y-axis fits the tab's results (a dot chart needs no zero baseline): even steps, half a step of room below the lowest point.
    const rs = pts.map(p => 100 * p.rate), rmin = Math.min(...rs), rmax = Math.max(...rs), step = [2, 5, 10, 20, 25].find(k => Math.max(rmax - rmin, 10) / k <= 6) || 25;
    const y0 = Math.max(0, Math.floor((rmin - step / 2) / step) * step), y1 = Math.min(100, Math.ceil((rmax + step / 2) / step) * step);
    const X = v => m.l + (Math.log10(v) - lo) / (hi - lo) * iw, top = y1 + (y1 === 100 ? step * 0.3 : 0), Y = v => m.t + (top - 100 * v) / (top - y0) * ih;
    // The depth scale is logarithmic like cost and fits the tab: from the round time at or below the fastest point to the one at or above the slowest.
    const TK = [5, 10, 20, 30, 60, 120, 300, 600, 1200, 3600], tt = pts.map(p => p.time).filter(t => t != null);
    const tmin = tt.length ? Math.min(...tt) : 10, tmax = tt.length ? Math.max(...tt) : 20;
    const zlo = TK.filter(k => k <= tmin).pop() || 1, zhi = Math.max(TK.find(k => k >= tmax) || 7200, zlo * 2);
    const Z = t => (Math.log(t) - Math.log(zlo)) / (Math.log(zhi) - Math.log(zlo)), zmid = TK.filter(k => Z(k) > .25 && Z(k) < .75).sort((a, b) => Math.abs(Z(a) - .5) - Math.abs(Z(b) - .5))[0];
    const tf = t => t < 60 ? t + ' s' : t / 60 + ' min', xL = m.l, xR = m.l + iw, yT = m.t, yB = m.t + ih, P = (x, y, f) => `${(x + f * dx).toFixed(1)},${(y - f * dy).toFixed(1)}`;
    // Shading: marks are lit spheres (light from the upper left), and things further back fade, so the eye reads depth.
    const hx = h => { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, c => c + c); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const mix = (h, t, w) => '#' + hx(h).map((v, i) => Math.round(v + (hx(t)[i] - v) * w).toString(16).padStart(2, '0')).join('');
    const sph = {}; let defs = '';
    const ball = (k, hl = .5) => { if (!/^#([0-9a-f]{3}){1,2}$/i.test(k)) return k; const key = k + hl; if (!sph[key]) { const id = 'fc-s' + Object.keys(sph).length; sph[key] = `url(#${id})`;
      defs += `<radialGradient id="${id}" cx=".36" cy=".32" r=".78"><stop offset="0" stop-color="${mix(k, '#ffffff', hl)}"/><stop offset=".5" stop-color="${k}"/><stop offset="1" stop-color="${mix(k, '#000000', .5)}"/></radialGradient>`; } return sph[key]; };
    // The box behind the chart: its top and right faces, shaded apart (lit from above), carry the front grid's lines back to the far face,
    // with a rule at each round time; then its edges; then the time ticks and labels along the floor's right edge.
    const ys = [], xs = []; for (let t = y0; t <= y1; t += step) ys.push(Y(t / 100)); xt.forEach(v => xs.push(X(v)));
    const zk = TK.filter(k => k >= zlo && k <= zhi), L = (a, b) => `<polyline points="${a} ${b}"/>`;
    s += `<polygon points="${P(xL, yT, 0)} ${P(xR, yT, 0)} ${P(xR, yT, 1)} ${P(xL, yT, 1)}" fill="${fg}" fill-opacity=".045"/>` +
      `<polygon points="${P(xR, yT, 0)} ${P(xR, yB, 0)} ${P(xR, yB, 1)} ${P(xR, yT, 1)}" fill="${fg}" fill-opacity=".022"/>` +
      `<g stroke="${rule}" fill="none" stroke-opacity=".75">` + xs.map(x => L(P(x, yT, 0), P(x, yT, 1))).join('') + ys.map(y => L(P(xR, y, 0), P(xR, y, 1))).join('') +
      zk.map(k => L(P(xL, yT, Z(k)), P(xR, yT, Z(k))) + L(P(xR, yT, Z(k)), P(xR, yB, Z(k)))).join('') + '</g>' +
      `<g stroke="${rule}" fill="none"><polyline points="${P(xL, yT, 1)} ${P(xR, yT, 1)} ${P(xR, yB, 1)}"/>` +
      [[xL, yT], [xR, yT], [xR, yB]].map(([x, y]) => L(P(x, y, 0), P(x, y, 1))).join('') +
      zk.map(k => L(P(xR, yB, Z(k)), P(xR + 4, yB, Z(k)))).join('') + '</g>' +
      [zlo, zmid, zhi].filter(Boolean).map(k => `<text x="${(xR + Z(k) * dx + 7).toFixed(1)}" y="${(yB - Z(k) * dy + 3.5).toFixed(1)}" fill="${dim}" font-family="var(--font-mono)" font-size="${small ? 9.5 : 10}">${tf(k)}</text>`).join('');
    // The direction label takes the first clear corner, top left then bottom left, and is left out when points cover both.
    const marks = pts.flatMap(c => { const x = X(c.cost), y = Y(c.rate), f = c.time != null ? Z(c.time) : 0; return [[x, y], [x + f * dx, y - f * dy]]; });
    const spot = [m.t + 16, yB - 8].find(by => !marks.some(([x, y]) => x > m.l - 2 && x < m.l + 176 && y > by - 22 && y < by + 10));
    if (!small && spot) s += `<text x="${m.l + 8}" y="${spot}" fill="${acc}" font-family="var(--font-mono)" font-size="10.5" letter-spacing="1.2">↖ MORE DONE, FOR LESS</text>`;
    for (let t = y0; t <= y1; t += step) { const v = t / 100; s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(v)}" y2="${Y(v)}" stroke="${rule}"/><text x="${m.l - 7}" y="${Y(v) + 4}" fill="${dim}" font-family="var(--font-mono)" font-size="10.5" text-anchor="end">${t}%</text>`; }
    // an end's label gives way when it would crowd a power of ten's
    xt.forEach((v, i) => { const x = X(v), end = i === 0 || i === xt.length - 1, show = !end || !xt.some((u, j) => j > 0 && j < xt.length - 1 && Math.abs(X(u) - x) < 40);
      s += `<line x1="${x}" x2="${x}" y1="${m.t}" y2="${m.t + ih}" stroke="${rule}"/>` + (show ? `<text x="${x}" y="${m.t + ih + 17}" fill="${dim}" font-family="var(--font-mono)" font-size="10.5" text-anchor="middle">${money(v)}</text>` : ''); });
    s += `<text x="${m.l + iw / 2}" y="${H - 5}" fill="${fg2}" font-family="var(--font-mono)" font-size="11" text-anchor="middle">${small ? 'cost per completed task (log)' : 'cost per completed task (log scale) · less is better'}</text>` +
      `<text transform="translate(12 ${m.t + ih / 2}) rotate(-90)" fill="${fg2}" font-family="var(--font-mono)" font-size="11" text-anchor="middle">tasks completed</text>`;
    // rivals first, then ours on top; the rival picked in the tables below is drawn bright
    const order = pts.slice().sort((a, b) => (sys(a.id).mode ? 1 : 0) - (sys(b.id).mode ? 1 : 0) || (a.id === state.focus) - (b.id === state.focus));
    // Each point's line back to its time: it fades as it recedes and ends in the same mark, smaller with distance. All sit under the
    // full marks; pointing at a point lights its line and names its time.
    for (const c of order) if (c.time != null) {
      const o = sys(c.id), k = !o.mode ? (c.id === state.focus ? fg : riv) : col[o.mode], x = X(c.cost), y = Y(c.rate), f = Z(c.time), i = all.indexOf(c);
      const gx = (x + f * dx).toFixed(1), gy = (y - f * dy).toFixed(1), sc = 1 - 0.4 * f, r0 = !o.mode ? 5.5 : o.drive === 'own' ? 7 : 6;
      defs += `<linearGradient id="fc-l${i}" gradientUnits="userSpaceOnUse" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${gx}" y2="${gy}"><stop offset="0" stop-color="${k}" stop-opacity=".95"/><stop offset="1" stop-color="${k}" stop-opacity=".25"/></linearGradient>`;
      s += `<g class="fc-z" data-z="${i}"><line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${gx}" y2="${gy}" stroke="url(#fc-l${i})" stroke-width="1.6"/>` +
        (o.drive === 'outside' ? `<circle class="fc-g" cx="${gx}" cy="${gy}" r="${(r0 * sc).toFixed(1)}" fill="${bg2}" stroke="${k}" stroke-width="${(2.5 * sc).toFixed(1)}"/>`
          : `<circle class="fc-g" cx="${gx}" cy="${gy}" r="${(r0 * sc).toFixed(1)}" fill="${ball(k, o.mode ? .5 : .25)}"/>`) +
        `<text x="${(+gx + 7).toFixed(1)}" y="${(+gy - 6).toFixed(1)}" fill="${fg}" font-family="var(--font-mono)" font-size="10.5" paint-order="stroke" stroke="${bg2}" stroke-width="3">${esc(c.rec.reportedTime)}</text></g>`;
    }
    for (const c of order) {
      const x = X(c.cost).toFixed(1), y = Y(c.rate).toFixed(1), o = sys(c.id), i = all.indexOf(c);
      const mark = !o.mode ? `<circle cx="${x}" cy="${y}" r="5.5" fill="${ball(c.id === state.focus ? fg : riv, .25)}" stroke="${bg2}" stroke-width="2"/>`
        : o.drive === 'own' ? `<circle cx="${x}" cy="${y}" r="7" fill="${ball(col[o.mode])}" stroke="${bg2}" stroke-width="2"/>`
        : `<circle cx="${x}" cy="${y}" r="6" fill="${bg2}" stroke="${col[o.mode]}" stroke-width="2.5"/>`;
      s += `<g class="fc-pt" tabindex="0" data-i="${i}" aria-label="${esc(o.name + ', ' + o.sub + ', ' + label(TIERS, c.tier) + ' model: ' + c.right + ' of ' + c.of + ' completed, ' + (c.rec.cost || '') + ' and ' + (c.rec.reportedTime || 'unreported time') + ' per completed task')}"><circle cx="${x}" cy="${y}" r="14" fill="transparent"/>${mark}</g>`;
    }
    plot.innerHTML = s.replace('<!--defs-->', '<defs>' + defs + '</defs>') + '</svg>';
    const rows = cells.slice().sort((a, b) => b.rate - a.rate || (a.cost ?? 1e9) - (b.cost ?? 1e9));
    doc.getElementById('range-table').innerHTML = '<thead><tr><th>System</th><th>Model size</th><th>Completed</th><th>Cost per completed task</th><th>Time per completed task</th></tr></thead><tbody>' +
      rows.map(c => `<tr><td>${esc(sys(c.id).name)} · ${esc(sys(c.id).sub)}${c.passive ? ' †' : ''}</td><td>${esc(label(TIERS, c.tier))}</td><td>${c.right} of ${c.of} (${pct1(c.rate)})</td><td>${esc(c.rec.cost || 'not reported')}</td><td>${esc(c.rec.reportedTime || 'not reported')}</td></tr>`).join('') + '</tbody>';
    const rpts = [...new Set(cells.map(c => c.rpt))], runs = cells.map(c => c.of);
    doc.getElementById('range-runs').textContent = rpts.length === 1 && rpts[0] === 1
      ? `${label(TASKS, state.task)} tasks are one run per task (${Math.min(...runs)} to ${Math.max(...runs)} runs per point), so each is accurate to about ±20 percentage points.`
      : `${label(TASKS, state.task)} tasks: ${Math.min(...rpts)} to ${Math.max(...rpts)} runs per task; each point's details give its count.`;
    host.querySelectorAll('[data-flen]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.flen === state.task)));
  }
  if (host && plot) {
    const f = fasterRivals(), say = doc.getElementById('range-say');
    if (say) say.innerHTML = !f.n ? 'No rival is faster per completed task than ours in any measured cell.'
      : `Where a rival is faster per task, it finished fewer tasks at a higher cost per finished task: <b>${f.good} of ${f.n}</b> cells. <a href="#benchmarks">See every cell</a>.`;
    host.addEventListener('click', e => { const b = e.target.closest('[data-flen]'); if (b) { state.task = b.dataset.flen; hide(); drawScatter(); } });
    const pt = e => e.target.closest && e.target.closest('.fc-pt');
    const lit = i => plot.querySelectorAll('.fc-z').forEach(g => g.classList.toggle('on', g.dataset.z === i));
    const on = p => { show(p, details(all[+p.dataset.i]), true); lit(p.dataset.i); }, off = () => { hide(); lit(null); };
    plot.addEventListener('mouseover', e => { const p = pt(e); if (p) on(p); });
    plot.addEventListener('mouseout', e => { if (pt(e)) off(); });
    plot.addEventListener('focusin', e => { const p = pt(e); if (p) on(p); });
    plot.addEventListener('focusout', off);
    plot.addEventListener('click', e => { const p = pt(e); if (p) on(p); });
    // The rival picked in the tables below is the one drawn bright here.
    const table = doc.getElementById('ts-content');
    if (table && win.MutationObserver) new win.MutationObserver(() => {
      const f = table.querySelector('tr.ts-focus[data-section="main"],tr.ts-focus[data-section="tools"]'), id = f ? f.dataset.contender : null;
      if (id !== state.focus) { state.focus = id; drawScatter(); }
    }).observe(table, { childList: true });
    let w = 0, raf = 0;
    if (win.ResizeObserver) new win.ResizeObserver(() => { const n = plot.clientWidth; if (n && n !== w) { w = n; cancelAnimationFrame(raf); raf = requestAnimationFrame(drawScatter); } }).observe(plot);
    drawScatter();
  }

  /* ---------- "Where each system holds up" ---------- */
  const grid = doc.getElementById('bench-grid-table');
  if (grid) {
    const hex = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const lum = rgb => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(rgb[0]) + .7152 * f(rgb[1]) + .0722 * f(rgb[2]); };
    const box = grid.closest('.gr'), lo = hex(css(box, '--heat-lo')), hi = hex(css(box, '--heat-hi')), inkD = css(box, '--ink-dark'), inkL = css(box, '--ink-light');
    let h = '<thead><tr><th></th>' + TASKS.map(([, l]) => `<th class="len" colspan="3">${l} tasks</th><th class="gap"></th>`).join('') + '<th class="len" colspan="2">Summary</th></tr><tr><th></th>' +
      TASKS.map(() => TIERS.map(([, t]) => `<th>${t}</th>`).join('') + '<th class="gap"></th>').join('') + '<th>Lowest</th><th>Cells</th></tr></thead><tbody>';
    for (const [g, gl] of GROUPS) {
      h += `<tr class="grp"><th colspan="15">${esc(gl)}</th></tr>`;
      for (const s of SYS.filter(x => x.grp === g)) {
        const sw = s.mode ? `<span class="sw ${s.drive === 'outside' ? 'ring ' : ''}${s.mode}"></span>` : '<span class="sw riv"></span>';
        h += `<tr class="${s.mode ? 'ours' : ''}"><th class="sys" scope="row">${sw}${esc(s.name)}<small>${esc(s.sub)}</small></th>`;
        const vals = [];
        for (const [task] of TASKS) {
          for (const [tier] of TIERS) {
            const c = get(task, tier, s.id);
            if (!c) { h += '<td class="none" title="not measured">–</td>'; continue; }
            vals.push(c.rate);
            const rgb = lo.map((v, i) => Math.round(v + (hi[i] - v) * c.rate)), ink = lum(rgb) > .36 ? inkD : inkL;
            h += `<td class="c" tabindex="0" data-i="${all.indexOf(c)}" style="background:rgb(${rgb.join(',')});color:${ink}">${Math.round(c.rate * 100)}${c.passive ? '<sup>†</sup>' : ''}</td>`;
          }
          h += '<td class="gap"></td>';
        }
        h += `<td class="sum">${vals.length ? Math.round(Math.min(...vals) * 100) + '%' : '–'}</td><td class="sum">${vals.length}/9</td></tr>`;
      }
    }
    grid.innerHTML = h + '</tbody>';
    const td = e => e.target.closest && e.target.closest('td.c');
    grid.addEventListener('mouseover', e => { const t = td(e); if (t) show(t, details(all[+t.dataset.i])); });
    grid.addEventListener('mouseout', e => { if (td(e)) hide(); });
    grid.addEventListener('focusin', e => { const t = td(e); if (t) show(t, details(all[+t.dataset.i])); });
    grid.addEventListener('focusout', hide);
    // Picking a cell opens that task set and model size in the tables below.
    const open = t => { const c = all[+t.dataset.i], b = doc.getElementById('benchmarks'); if (!b) return;
      const tb = b.querySelector(`[data-tier="${c.tier}"]`), sb = b.querySelector(`[data-taskset="${c.task}"]`);
      if (tb && tb.getAttribute('aria-pressed') !== 'true') tb.click(); if (sb && sb.getAttribute('aria-pressed') !== 'true') sb.click(); };
    grid.addEventListener('click', e => { const t = td(e); if (t) open(t); });
    grid.addEventListener('keydown', e => { const t = td(e); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(t); } });
  }
});
