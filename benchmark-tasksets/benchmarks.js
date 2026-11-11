/* Data-only updates live in data/short.json, medium.json, long.json. */
(async function () {
  'use strict';
  const root = document.querySelector('#taskset-benchmarks');
  const base = new URL('.', document.currentScript.src);
  const content = root.querySelector('#ts-content');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let task = 'short', tier = 'grok';
  const selections = new Map();
  let sets;
  try {
    sets = Object.fromEntries(await Promise.all(['short','medium','long'].map(async key => {
      const response = await fetch(new URL('data/' + key + '.json', base));
      if (!response.ok) throw Error('data unavailable');
      return [key, await response.json()];
    })));
  } catch (_) {
    content.textContent = 'Benchmark records are unavailable. Please reload this local preview.';
    return;
  }
  try {
    const saved = JSON.parse(localStorage.getItem('pc-taskset-draft') || '{}');
    if (sets[saved.task]) task = saved.task;
    if (['glm','grok','opus'].includes(saved.tier)) tier = saved.tier;
  } catch (_) {}
  function render() {
    root.querySelectorAll('[data-taskset]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.taskset === task)));
    root.querySelectorAll('[data-tier]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.tier === tier)));
    const set = sets[task];
    const heading = `<div class="ts-heading"><h3>${escape(set.label)} tasks <span>${escape(set.taskSet)} · ${set.taskCount} tasks</span></h3><p>${escape(set.judge)}.</p></div>`;
    if (set.status === 'withheld') {
      content.innerHTML = heading + '<div class="ts-withheld"><span class="ts-eyebrow">Next measurement round</span><h4>Being re-measured.</h4><p>Long-task figures will appear here when the settled candidate’s results are ready. Previous figures are withheld.</p></div>';
      return;
    }
    const current = BenchmarkSelection.windowFor(set.current_window,tier);
    const anchorWindow = BenchmarkSelection.windowFor(set.anchor_window,tier);
    const anchorRow = set.rows.find(r=>r.id===set.ratio_anchor);
    const ratioAnchor = anchorRow && BenchmarkSelection.recordsFor(set,anchorRow,tier)[0];
    const rows = set.rows.map(row => {
      const records = BenchmarkSelection.recordsFor(set,row,tier);
      if(current && records.length===0) return '';
      const selectionKey = task + ':' + tier + ':' + row.id;
      const record = records.find(r=>r.id === selections.get(selectionKey)) || records[0];
      const measured = record && !/not run|measuring/.test(record.completion);
      const ratio = BenchmarkSelection.timeRatio(record,ratioAnchor,set);
      const marker = BenchmarkSelection.marker(set,record,tier);
      const provenance = record ? `Date: ${record.date || 'not recorded'} · Worker: ${record.worker || 'not recorded'} · Window: ${record.window_id || 'not recorded'}` : '';
      const select = records.length > 1 ? `<label class="ts-run-label">Run record<select aria-label="Run record for ${escape(row.contender)}" data-record-row="${escape(row.id)}">${records.map(r => `<option value="${escape(r.id)}"${r.id===record.id?' selected':''}>${escape(r.window_id || 'Unmeasured')} · ${escape(r.model)}</option>`).join('')}</select></label>` : '';
      const values = record ? [record.completion,record.reportedTime,record.cost,record.tokens] : ['not run','not run','not run','not run'];
      const labels = ['Completed','Time','Cost','Tokens'];
      const detail = record ? `<details class="ts-provenance"><summary>Run details</summary>${select}<p>${escape(provenance)}</p><p><b>Clock:</b> ${escape(record.clock)}${record.clock==='FINAL'?' — tool-ready to verified answer':' — not normalized to FINAL'}. ${measured&&!ratio?'No paired speed claim.':''}</p><p><b>Source cell:</b> ${escape(record.source_run || 'not recorded')} · ${escape(record.sourceRunResolution)}</p><p>${escape(record.methodology || record.original?.methodology || '')}</p></details>` : '';
      return `<tr data-contender="${escape(row.id)}"><th scope="row"><span class="ts-name">${escape(row.contender)}</span><span class="ts-category">${escape(row.category)}</span><span class="ts-model">${escape(record?.model || 'No measurement on this tier')}</span>${measured?`<span class="ts-separate" tabindex="0" title="${escape(provenance)}">${escape(marker)}</span>`:''}${detail}</th>${values.map((v,i)=>`<td data-label="${labels[i]}"><span>${escape(v ?? 'not reported')}</span>${i===1&&ratio?`<small class="ts-clock">${ratio.toFixed(2)}× anchor / this time</small>`:''}${i===1&&measured?`<small class="ts-clock">${escape(record.clock)}</small>`:''}</td>`).join('')}</tr>`;
    }).join('');
    content.innerHTML = heading + `<p class="ts-caveat">${current?'Window '+escape(current)+(anchorWindow?' · anchor retest '+escape(anchorWindow):'')+'.':'Historical run records.'} ${escape(set.aggregation_note || 'All attempts count; time, cost and tokens are per completed task.')} Clock labels are explicit: rival self-reported and whole-call times have not been converted to FINAL. ${current?'Comparisons require matching tasks, judge, model and clock; reused rivals follow the documented freshness, version and worker-class rule.':'These records are not a matched-clock ranking.'}</p>${set.mappingNote?`<p class="ts-caveat">${escape(set.mappingNote)}</p>`:''}<table class="ts-table"><caption class="ts-sr">${escape(set.label)} task-set results, ${escape(tier)} model tier</caption><thead><tr><th scope="col">Contender</th><th scope="col">Completed</th><th scope="col">Time</th><th scope="col">Cost</th><th scope="col">Tokens</th></tr></thead><tbody>${rows}</tbody></table><p class="ts-footnote">Model tiers group models; the exact model is named in every row. Multiple historical readings stay under that contender’s run selector. Unmeasured cells say “not run” or “measuring”.</p>`;
  }
  root.addEventListener('click', event => {
    const b = event.target.closest('button'); if (!b) return;
    if (b.dataset.taskset) task = b.dataset.taskset;
    else if (b.dataset.tier) tier = b.dataset.tier;
    else return;
    render();
    try {localStorage.setItem('pc-taskset-draft',JSON.stringify({task,tier}));} catch (_) {}
  });
  root.addEventListener('change', event => {
    const row = event.target.dataset.recordRow;
    if (row) { selections.set(task+':'+tier+':'+row,event.target.value); render(); }
  });
  render();
})();
