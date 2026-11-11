(async function(){
'use strict';
const root=document.querySelector('#taskset-benchmarks'),content=root.querySelector('#ts-content'),base=new URL('.',document.currentScript.src);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let task='short',tier='grok',reference='protocolis-adaptive',sets;const selected=new Map();let infoId=0;
try{sets=Object.fromEntries(await Promise.all(['short','medium','long'].map(async k=>{const r=await fetch(new URL('data/'+k+'.json',base));if(!r.ok)throw Error();return[k,await r.json()]})));}catch(e){content.textContent='Benchmark data could not load. Please reload.';return;}
try{const v=JSON.parse(localStorage.getItem('pc-taskset-draft')||'{}');if(sets[v.task])task=v.task;if(['glm','grok','opus'].includes(v.tier))tier=v.tier;if(['protocolis-adaptive','protocolis-standard'].includes(v.reference))reference=v.reference;}catch(e){}
function info(label,body){const id='ts-info-'+(++infoId);return `<span class="ts-info"><button type="button" class="ts-info-button" aria-label="${esc(label)}" aria-expanded="false" aria-controls="${id}">i</button><span class="ts-popover" id="${id}" role="region" aria-label="${esc(label)}" hidden>${body}</span></span>`;}
function closeInfo(){root.querySelectorAll('.ts-info-button[aria-expanded=true]').forEach(b=>{b.setAttribute('aria-expanded','false');document.getElementById(b.getAttribute('aria-controls')).hidden=true;});}
function normalize(s){return (s||'').toLowerCase().replace(/^.*\//,'').replace(/[^a-z0-9]/g,'');}
function numeric(s){if(typeof s!=='string'||!/^[\d$.,]+\s*(?:s|k)?$/.test(s))return null;const n=parseFloat(s.replace(/[$,]/g,''));return Number.isFinite(n)?n*(s.endsWith('k')?1000:1):null;}
function badge(ref,r,index,label,set){
 if(!ref||!r||ref.id===r.id||normalize(ref.model)!==normalize(r.model))return '';
 let text='',explain='',good=true;
 if(index===0){const a=/^(\d+)\/(\d+)$/.exec(ref.completion),b=/^(\d+)\/(\d+)$/.exec(r.completion);if(!a||!b||+a[2]===0||+b[2]===0)return '';const pp=100*(a[1]/a[2]-b[1]/b[2]);text=Math.abs(pp)<.05?'same rate':(pp>0?'+':'')+Number(pp.toFixed(1))+' pp';good=pp>=0;explain=`${label}: ${ref.completion}; ${r.contender}: ${r.completion}. Badge is the percentage-point difference in completion rate.`;}
 else{const field=['','reportedTime','cost','tokens'][index],a=numeric(ref[field]),b=numeric(r[field]);if(a===null||b===null||a<=0||b<=0)return '';const ratio=b/a;good=ratio>=1;const amount=Number((ratio>=1?ratio:1/ratio).toFixed(1));const comparable=index!==1||BenchmarkSelection.timeRatio(ref,r,set)!==null;
 if(Math.abs(ratio-1)<.02)text='≈ same';else if(index===1)text=comparable?amount+'× '+(good?'faster':'slower'):amount+'× '+(good?'time ratio':'inverse ratio');else text=Number((100*Math.abs(1-a/b)).toFixed(0))+'% '+(good?'less':'more');
 explain=`${label}: ${ref[field]}; ${r.contender}: ${r[field]}. ${index===1&&!comparable?'Reported-time ratio only; clocks or measurement windows are not qualified for a paired speed claim. ':''}${ref.window_id||'Unspecified window'} versus ${r.window_id||'unspecified window'}.`;
 }
 return `<span class="ts-advantage${good?'':' ts-loss'}" tabindex="0" title="${esc(explain)}">${esc(text)}</span>`;
}
function render(){
 closeInfo();root.querySelectorAll('[data-taskset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.taskset===task)));root.querySelectorAll('[data-tier]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tier===tier)));
 const set=sets[task],label=reference==='protocolis-standard'?'Protocolis Standard':'Protocolis Adaptive';
 const method=info('Benchmark methodology',`<p>${esc(set.judge)}.</p><p>${esc(set.aggregation_note||'All attempts count; time, cost and tokens are per completed task.')}</p><p>Each row names its actual model and measurement window. Time-ratio badges compare reported figures; only qualified matching measurements say “faster”. Missing figures are never estimated.</p>`);
 let top=`<div class="ts-heading"><span>${esc(set.label)} · ${set.taskCount} tasks</span>${method}<span class="ts-set-id">${esc(set.taskSet)}</span></div>`;
 if(set.status==='withheld'){content.innerHTML=top+'<div class="ts-withheld"><h4>Being re-measured.</h4><p>Long-task results will appear here when ready.</p></div>';return;}
 function records(row,ultra){let r=BenchmarkSelection.recordsFor(set,row,tier);if(row.id==='protocolis-adaptive')r=r.filter(x=>ultra?x.tier==='all':x.tier!=='all');return r;}
 function choice(row,ultra){const rr=records(row,ultra),key=task+':'+tier+':'+(ultra?'ultra:':'')+row.id;return rr.find(r=>r.id===selected.get(key))||rr[0];}
 const referenceRow=set.rows.find(r=>r.id===reference),ref=referenceRow&&choice(referenceRow,false);
 top+=`<div class="ts-comparison"><span>Compare against</span><div class="ts-reference" aria-label="Comparison reference"><button type="button" data-reference="protocolis-adaptive" aria-pressed="${reference==='protocolis-adaptive'}">Adaptive</button><button type="button" data-reference="protocolis-standard" aria-pressed="${reference==='protocolis-standard'}">Standard</button></div><span class="ts-guide">Badges show ${esc(label)}’s advantage over each row.</span></div>`;
 function table(rows,ultra){const head=ultra?'Ultrafast':'Contender';return `<table class="ts-table${ultra?' ts-ultra':''}"><caption class="ts-sr">${esc(set.label)} ${head} results</caption><thead><tr><th scope="col">${head}</th><th scope="col">Completed</th><th scope="col">Time<small>per completed task</small></th><th scope="col">Cost<small>per completed task</small></th><th scope="col">Tokens<small>per completed task</small></th></tr></thead><tbody>${rows.map(row=>{
 const rr=records(row,ultra),r=choice(row,ultra),key=task+':'+tier+':'+(ultra?'ultra:':'')+row.id,own=row.id.startsWith('protocolis-'),isRef=!ultra&&row.id===reference;
 const options=rr.length>1?`<label>Measurement window<select aria-label="Run record for ${esc(row.contender)}" data-record-key="${esc(key)}">${rr.map(x=>`<option value="${esc(x.id)}"${r.id===x.id?' selected':''}>${esc(x.window_id||'Awaiting measurement')} · ${esc(x.model)}</option>`).join('')}</select></label>`:'';
 const note=r?`<p><b>${esc(row.contender)}</b> · ${esc(row.category)}<br>${esc(r.model)}</p>${options}<p>Date: ${esc(r.date||'not recorded')} · Worker: ${esc(r.worker||'not recorded')}<br>Window: ${esc(r.window_id||'not recorded')}<br>Clock: ${esc(r.clock)}</p><p>${esc(r.methodology||r.original?.methodology||'')}</p>`:'<p>Awaiting a measurement on this task set and model tier.</p>';
 const values=r?[r.completion,r.reportedTime,r.cost,r.tokens]:['measuring','measuring','measuring','measuring'];
 return `<tr data-contender="${esc(row.id)}" data-section="${ultra?'ultra':'main'}" class="${isRef?'ts-selected ':''}${own?'ts-own ':''}${row.id==='protocolis-standard'?'ts-standard':''}"><th scope="row"><span class="ts-name">${esc(row.contender)}${isRef?'<small class="ts-reference-label">reference</small>':''}</span>${info(row.contender+' measurement details',note)}<span class="ts-meta">${esc(row.category)}${r&&r.model!=='not measured'?' · '+esc(r.model):''}</span></th>${values.map((v,i)=>`<td data-label="${['Completed','Time','Cost','Tokens'][i]}"><span class="ts-value">${esc(v??'not reported')}</span>${!ultra&&!isRef?badge(ref,r,i,label,set):''}</td>`).join('')}</tr>`;
 }).join('')}</tbody></table>`;}
 const main=set.rows.filter(r=>!['protocolis-lean','browser-use-ultrafast','jev-ultrafast'].includes(r.id));const ultra=['browser-use-ultrafast','jev-ultrafast','protocolis-adaptive','protocolis-lean'].map(id=>set.rows.find(r=>r.id===id)).filter(Boolean);
 content.innerHTML=top+table(main,false)+table(ultra,true);
}
root.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.classList.contains('ts-info-button')){const open=b.getAttribute('aria-expanded')==='true';closeInfo();if(!open){const p=document.getElementById(b.getAttribute('aria-controls'));b.setAttribute('aria-expanded','true');p.hidden=false;const box=b.getBoundingClientRect();p.style.left=Math.max(12,Math.min(box.left,innerWidth-p.offsetWidth-12))+'px';p.style.top=Math.min(box.bottom+8,Math.max(12,innerHeight-p.offsetHeight-12))+'px';}return;}
 if(b.dataset.taskset)task=b.dataset.taskset;else if(b.dataset.tier)tier=b.dataset.tier;else if(b.dataset.reference)reference=b.dataset.reference;else return;render();try{localStorage.setItem('pc-taskset-draft',JSON.stringify({task,tier,reference}));}catch(e){}
});
root.addEventListener('change',e=>{if(e.target.dataset.recordKey){selected.set(e.target.dataset.recordKey,e.target.value);render();}});
document.addEventListener('click',e=>{if(!e.target.closest('.ts-info'))closeInfo();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){const b=root.querySelector('.ts-info-button[aria-expanded=true]');closeInfo();b?.focus();}});window.addEventListener('resize',closeInfo);render();
})();
