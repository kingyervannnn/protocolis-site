(async function(){
'use strict';
const root=document.querySelector('#benchmarks')||document.querySelector('#taskset-benchmarks'),content=root.querySelector('#ts-content'),base=new URL('.',document.currentScript.src);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Two comparison groups, one per table. ref: our row the others are compared with; own: our rows that can become the reference;
// focus: the one rival being compared, null for the all-rivals summary (the default; never remembered across visits).
const G={main:{ref:'protocolis-adaptive',own:['protocolis-adaptive','protocolis-standard'],focus:null},ultra:{ref:'protocolis-lean',own:['protocolis-lean','protocolis-adaptive'],focus:null}};
let task='short',tier='grok',sets;const selected=new Map();let infoId=0;
try{sets=Object.fromEntries(await Promise.all(['short','medium','long'].map(async k=>{const r=await fetch(new URL('data/'+k+'.json',base));if(!r.ok)throw Error();return[k,await r.json()]})));}catch(e){content.textContent='Benchmark data could not load. Please reload.';return;}
try{const v=JSON.parse(localStorage.getItem('pc-taskset-draft')||'{}');if(sets[v.task])task=v.task;if(['glm','grok','opus'].includes(v.tier))tier=v.tier;if(G.main.own.includes(v.reference))G.main.ref=v.reference;if(G.ultra.own.includes(v.ultraReference))G.ultra.ref=v.ultraReference;}catch(e){}
function save(){try{localStorage.setItem('pc-taskset-draft',JSON.stringify({task,tier,reference:G.main.ref,ultraReference:G.ultra.ref}));}catch(e){}}
function info(label,body){const id='ts-info-'+(++infoId);return `<span class="ts-info"><button type="button" class="ts-info-button" aria-label="${esc(label)}" aria-expanded="false" aria-controls="${id}">i</button><span class="ts-popover" id="${id}" role="region" aria-label="${esc(label)}" hidden>${body}</span></span>`;}
function closeInfo(){root.querySelectorAll('.ts-info-button[aria-expanded=true]').forEach(b=>{b.setAttribute('aria-expanded','false');document.getElementById(b.getAttribute('aria-controls')).hidden=true;});}
function normalize(s){return (s||'').toLowerCase().replace(/^.*\//,'').replace(/[^a-z0-9]/g,'');}
function numeric(s){if(typeof s!=='string'||!/^[\d$.,]+\s*(?:s|k)?$/.test(s))return null;const n=parseFloat(s.replace(/[$,]/g,''));return Number.isFinite(n)?n*(s.endsWith('k')?1000:1):null;}
const num=x=>x>=10?Math.round(x):Number(x.toFixed(1)),pct=x=>Math.round(100*x)+'%',delta=(big,small,good,explain)=>({big,small,good,explain});
// Completion is shown as a rate (right / counted, the counted runs after the row's stated void rules) with the count beside it.
// One decimal always; only a full row shows 100%. A row short of full never displays 100% (99.95%+ shows 99.9%).
function rate(s){const m=/^(\d+)\/(\d+)$/.exec(String(s??''));if(!m||+m[2]===0)return null;const n=+m[1],d=+m[2];let t=(Math.round(1000*n/d)/10).toFixed(1);if(n===d)t='100';else if(t==='100.0')t='99.9';return{n,d,text:t+'%'};}
const rateText=s=>{const x=rate(s);return x?`${x.text} (${x.n} of ${x.d})`:String(s??'');};
// Compares a contender record r with our reference record ref; returns a big figure and a small caption.
// side 'row': it sits on the contender's row and describes the contender's number.
// side 'ours': it sits on our reference row and describes our number against the focused contender.
function compare(ref,r,index,set,side){
 if(!ref||!r||ref.id===r.id||normalize(ref.model)!==normalize(r.model))return null;
 const ours=side==='ours';
 if(index===0){
  const a=/^(\d+)\/(\d+)$/.exec(ref.completion),b=/^(\d+)\/(\d+)$/.exec(r.completion);if(!a||!b||+a[2]===0||+b[2]===0)return null;
  const pp=100*(a[1]/a[2]-b[1]/b[2]),n=Number(Math.abs(pp).toFixed(1)),good=pp>=0,explain=`${ref.contender}: ${rateText(ref.completion)}; ${r.contender}: ${rateText(r.completion)}. Percentage-point difference in completion rate.`;
  if(Math.abs(pp)<.05)return delta('','same rate',true,explain);
  return ours?delta((pp>0?'+':'−')+n+' pp','completion',good,explain):delta(n+' pp',pp>0?'lower':'higher',good,explain);
 }
 const field=['','reportedTime','cost','tokens'][index],a=numeric(ref[field]),b=numeric(r[field]);if(a===null||b===null||a<=0||b<=0)return null;
 const ratio=b/a,good=ratio>=1,qualified=index!==1||BenchmarkSelection.timeRatio(ref,r,set)!==null;
 const note=index===1&&!qualified?' Reported times only: the two runs are not on a qualified matching clock and window, so this is not a paired speed claim.':'';
 const explain=`${ref.contender}: ${ref[field]}; ${r.contender}: ${r[field]}.${note} ${ref.window_id||'Unspecified window'} versus ${r.window_id||'unspecified window'}.`;
 if(Math.abs(ratio-1)<.02)return delta('','≈ same',true,explain);
 const x=num(good?ratio:1/ratio)+'×';
 if(index===1)return ours?delta(x,good?(qualified?'faster':'less time'):(qualified?'slower':'more time'),good,explain):delta(x,good?(qualified?'slower':'the time'):(qualified?'faster':'less time'),good,explain);
 if(ours)return good?delta(pct(1-1/ratio),'less',good,explain):delta(pct(1/ratio-1),'more',good,explain);
 return good?(ratio>=2?delta(num(ratio)+'×',index===2?'the cost':'the tokens',good,explain):delta(pct(ratio-1),'more',good,explain)):delta(pct(1-ratio),'less',good,explain);
}
// Our reference row against every rival at once: a range when we lead or tie them all (floor and ceiling both shown), a count when any rival is ahead.
function summarize(ref,rivals,index,set){
 const items=rivals.map(x=>({...x,c:compare(ref,x.rec,index,set,'ours')})).filter(x=>x.c);if(!items.length)return null;if(items.length===1)return items[0].c;
 const n=items.length,explain='Versus each rival measured here: '+items.map(x=>`${x.row.contender} ${(x.c.big+' '+x.c.small).trim()}`).join('; ')+'.';
 if(index===0){
  const rate=s=>{const m=/^(\d+)\/(\d+)$/.exec(s);return m[1]/m[2];},v=items.map(x=>100*(rate(ref.completion)-rate(x.rec.completion))),wins=v.filter(p=>p>.05).length,losses=v.filter(p=>p<-.05).length,lo=num(Math.max(0,Math.min(...v))),hi=num(Math.max(...v));
  if(losses)return null; // a rival leads on this metric: no summary claim on our row (the per-rival view shows it)
  if(!wins)return delta('','same rate',true,explain);
  return delta(lo===hi?`+${hi} pp`:`+${lo}–${hi} pp`,'completion',true,explain);
 }
 const field=['','reportedTime','cost','tokens'][index],v=items.map(x=>numeric(x.rec[field])/numeric(ref[field])),wins=v.filter(r=>r>=1.02).length,losses=v.filter(r=>r<=.98).length,hi=Math.max(...v),lo=wins<n?1:Math.min(...v);
 const saved=r=>Math.round(100*(1-1/r));
 if(losses)return null; // a rival leads on this metric: no summary claim on our row (the per-rival view shows it)
 if(!wins)return delta('','≈ same',true,explain);
 if(index===1){const word=items.every(x=>BenchmarkSelection.timeRatio(ref,x.rec,set)!==null)?'faster':'less time';return delta(num(lo)===num(hi)?num(hi)+'×':`${num(lo)}–${num(hi)}×`,word,true,explain);}
 return delta(saved(lo)===saved(hi)?saved(hi)+'%':`${saved(lo)}–${saved(hi)}%`,'less',true,explain);
}
function badge(c,side,neutral){return c?`<span class="ts-delta ts-${side}${neutral?' ts-neutral':c.good?'':' ts-loss'}${c.big?'':' ts-plain'}" title="${esc(c.explain)}">${c.big?`<b>${esc(c.big)}</b> `:''}<small>${esc(c.small)}</small></span>`:'';}
// Rows show "category · model"; long model names are shortened here (the full name stays in each row's details).
function shortModel(m){return String(m||'').replace(/^[a-z0-9-]+\//i,'').replace(/ chooser/i,'').replace(/ non-reasoning helper/i,' NR').replace(/^Hosted service; model not reported$/i,'hosted · model not reported');}
function render(){
 closeInfo();root.querySelectorAll('[data-taskset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.taskset===task)));root.querySelectorAll('[data-tier]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tier===tier)));
 const set=sets[task];
 const method=info('Benchmark methodology',`<p>${esc(set.judge)}.</p><p>${esc(set.aggregation_note||'All attempts count; time, cost and tokens are per completed task.')}</p><p>Each row names its actual model and measurement window. Comparisons use reported figures; only qualified matching measurements say “faster” or “slower”. Missing figures are never estimated.</p>`);
 // A withheld task set shows its full table structure with every figure pending; no record is shown until it is published.
 function records(row,ultra){if(set.status==='withheld')return [];let r=BenchmarkSelection.recordsFor(set,row,tier);if(row.id==='protocolis-adaptive')r=r.filter(x=>ultra?x.tier==='all':x.tier!=='all');return r;}
 function choice(row,ultra){const rr=records(row,ultra),key=task+':'+tier+':'+(ultra?'ultra:':'')+row.id;return rr.find(r=>r.id===selected.get(key))||rr[0];}
 const main=set.rows.filter(r=>!['protocolis-lean','browser-use-ultrafast','jev-ultrafast'].includes(r.id));const ultra=['protocolis-adaptive','protocolis-lean','browser-use-ultrafast','jev-ultrafast'].map(id=>set.rows.find(r=>r.id===id)).filter(Boolean);
 // Each table is its own comparison group: our reference row, the rivals with a figure comparable to it, and the focused rival (if any).
 function prepare(rows,key){
  const g=G[key],u=key==='ultra',refRow=rows.find(r=>r.id===g.ref)||rows.find(r=>g.own.includes(r.id)),ref=refRow&&choice(refRow,u);
  const rivals=rows.filter(r=>!g.own.includes(r.id)).map(row=>({row,rec:choice(row,u)})).filter(x=>[0,1,2,3].some(i=>compare(ref,x.rec,i,set,'ours')));
  return {key,u,g,refRow,ref,rivals,focused:rivals.find(x=>x.row.id===g.focus)};
 }
 function table(rows,v){const ultra=v.u,head=ultra?'Ultrafast':'Contender',short=v.refRow?v.refRow.contender.replace(/^Protocolis /,''):'Protocolis';return `<table class="ts-table${ultra?' ts-ultra':''}"><caption class="ts-sr">${esc(set.label)} ${head} results</caption><colgroup><col class="ts-col-name"><col><col><col><col><col><col class="ts-col-more"></colgroup>${ultra?
 // Same columns and units as the main table, so the Ultrafast group gets a labelled divider instead of a second visible header; the column names stay for screen readers.
 `<thead class="ts-divider"><tr><th scope="col"><span class="ts-divider-label">Ultrafast <small>· small choice model</small></span></th><th scope="col"><span class="ts-sr">Completed</span></th><th scope="col"><span class="ts-sr">Mean time per completed task</span></th><th scope="col"><span class="ts-sr">Median time per completed task</span></th><th scope="col"><span class="ts-sr">Cost per completed task</span></th><th scope="col"><span class="ts-sr">Tokens per completed task</span></th><th scope="col"><span class="ts-sr">Details</span></th></tr></thead>`
 :`<thead><tr><th scope="col">${head}<small class="ts-th-note">${set.taskCount} tasks<span> · ${esc(set.taskSet)}</span></small></th><th scope="col">Completed</th><th scope="col">Mean time<small>per completed task</small></th><th scope="col">Median time<small>per completed task</small></th><th scope="col">Cost<small>per completed task</small></th><th scope="col">Tokens<small>per completed task</small></th><th scope="col" class="ts-more-head">${method}</th></tr></thead>`}<tbody>${rows.map(row=>{
 const rr=records(row,ultra),r=choice(row,ultra),key=task+':'+tier+':'+(ultra?'ultra:':'')+row.id,own=row.id.startsWith('protocolis-'),ownHere=v.g.own.includes(row.id);
 const isRef=v.refRow&&row.id===v.refRow.id,isFocus=!!v.focused&&row.id===v.focused.row.id,comparable=v.rivals.some(x=>x.row.id===row.id);
 const action=isRef?'':ownHere?'ref':comparable?'focus':'';
 const options=rr.length>1?`<label>Measurement window<select aria-label="Run record for ${esc(row.contender)}" data-record-key="${esc(key)}">${rr.map(x=>`<option value="${esc(x.id)}"${r.id===x.id?' selected':''}>${esc(x.window_id||'Awaiting measurement')} · ${esc(x.model)}</option>`).join('')}</select></label>`:'';
 const note=r?`<p><b>${esc(row.contender)}</b> · ${esc(row.category)}<br>${esc(r.model)}</p>${r.completionNote?`<p>Completed ${esc(rateText(r.completion))}: ${esc(r.completionNote)}</p>`:''}${options}<p>Date: ${esc(r.date||'not recorded')} · Worker: ${esc(r.worker||'not recorded')}<br>Window: ${esc(r.window_id||'not recorded')}<br>Clock: ${esc(r.clock)}</p><p>${esc(r.methodology||r.original?.methodology||'')}</p>`:'<p>Awaiting a measurement on this task set and model tier.</p>';
 const values=r?[r.completion,r.reportedTime,r.cost,r.tokens]:['measuring','measuring','measuring','measuring'];
 const cellList=values.map((val,i)=>{const b=isRef?badge(v.focused?compare(r,v.focused.rec,i,set,'ours'):summarize(r,v.rivals,i,set),'ours'):badge(compare(v.ref,r,i,set,'row'),'row',ownHere);const cr=i===0?rate(val):null,cn=cr&&r.completionNote;
 // The count stays in the row itself (never only in a tooltip); a row whose denominator is short because of a void carries its note.
 const shown=cr?`${esc(cr.text)}<small class="ts-count${cn?' ts-count-note':''}"${cn?` title="${esc(r.completionNote)}"`:''}>${cr.n} of ${cr.d}${cn?`<span aria-hidden="true">*</span><span class="ts-sr"> (${esc(r.completionNote)})</span>`:''}</small>`:esc(val??'not reported');
 return `<td data-label="${['Completed','Mean time','Cost','Tokens'][i]}"><span class="ts-cell${b?' ts-pair':''}"><span class="ts-value${cr?' ts-rate':''}">${shown}</span>${b}</span></td>`;});
 // Median per completed task on the same clock and rows as the mean (record.medianTime); no comparison badge, so the mean stays the compared figure.
 cellList.splice(2,0,`<td data-label="Median time"><span class="ts-cell"><span class="ts-value">${esc(r?(r.medianTime||'—'):'measuring')}</span></span></td>`);
 const cells=cellList.join('');
 const n=v.rivals.length;let sub='';if(isRef)sub=`<span class="ts-vs">${v.focused?`vs ${esc(v.focused.row.contender)}`:n>1?`vs all ${n} rivals`:n?`vs ${esc(v.rivals[0].row.contender)}`:'no matched rival yet'}</span>`; // one line, so the reference row is no taller than the others; the row hover and title carry the click hint
 const tag=isRef?'<small class="ts-reference-label">reference</small>':'';
 const rowLabel=action==='ref'?`Make ${row.contender} the reference`:action==='focus'?`Compare ${row.contender} with ${short}`:'';
 return `<tr data-contender="${esc(row.id)}" data-section="${v.key}"${action?` data-action="${action}" tabindex="0" aria-label="${esc(rowLabel)}" title="${esc(action==='ref'?'Click to make this the reference':isFocus?'Click again to compare with all rivals':'Click to compare')}"`:''}${isFocus?' aria-current="true"':''} class="${isRef?'ts-selected ':''}${isFocus?'ts-focus ':''}${own?'ts-own ':''}${row.id==='protocolis-standard'?'ts-standard':''}${row.id==='protocolis-lean'?'ts-lean':''}"><th scope="row"><span class="ts-name">${esc(row.contender)}${tag}</span><span class="ts-meta">${esc(row.category)}${r&&r.model!=='not measured'?' · '+esc(shortModel(r.model)):''}</span>${sub}</th>${cells}<td class="ts-more-cell">${info(row.contender+' measurement details',note)}</td></tr>`;
 }).join('')}</tbody></table>`;}
 content.innerHTML=table(main,prepare(main,'main'))+table(ultra,prepare(ultra,'ultra'));
}
function act(tr){const sec=tr.dataset.section,g=G[sec],id=tr.dataset.contender;if(!g)return;if(tr.dataset.action==='ref')g.ref=id;else if(tr.dataset.action==='focus')g.focus=g.focus===id&&tr.classList.contains('ts-focus')?null:id;else return;render();save();const again=root.querySelector(`tr[data-section=${sec}][data-contender="${CSS.escape(id)}"]`);if(again&&document.activeElement===document.body)again.focus({preventScroll:true});}
function unfocus(){if(G.main.focus===null&&G.ultra.focus===null)return false;G.main.focus=G.ultra.focus=null;render();return true;}
root.addEventListener('click',e=>{
 const b=e.target.closest('button');
 if(b){
  if(b.classList.contains('ts-info-button')){const isOpen=b.getAttribute('aria-expanded')==='true';closeInfo();if(!isOpen){const p=document.getElementById(b.getAttribute('aria-controls'));b.setAttribute('aria-expanded','true');p.hidden=false;const box=b.getBoundingClientRect();p.style.left=Math.max(12,Math.min(box.right-p.offsetWidth,innerWidth-p.offsetWidth-12))+'px';p.style.top=Math.min(box.bottom+8,Math.max(12,innerHeight-p.offsetHeight-12))+'px';}return;}
  if(b.dataset.taskset)task=b.dataset.taskset;else if(b.dataset.tier)tier=b.dataset.tier;else return;render();save();return;
 }
 if(e.target.closest('.ts-info'))return;
 const tr=e.target.closest('tr[data-action]');if(tr){act(tr);return;}
 // Clicking empty space inside the benchmarks section (not elsewhere on the page) returns both tables to the all-rivals summary.
 if(!e.target.closest('select,label,a,input'))unfocus();
});
root.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('tr[data-action]')){e.preventDefault();act(e.target);}});
root.addEventListener('change',e=>{if(e.target.dataset.recordKey){selected.set(e.target.dataset.recordKey,e.target.value);render();}});
document.addEventListener('click',e=>{if(!e.target.closest('.ts-info'))closeInfo();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){const b=root.querySelector('.ts-info-button[aria-expanded=true]');if(b){closeInfo();b.focus();}else unfocus();}});window.addEventListener('resize',closeInfo);render();
})();
