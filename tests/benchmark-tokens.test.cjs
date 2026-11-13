// Run with Node's test runner and jsdom available on NODE_PATH. No network or browser.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const script=read('benchmark-tasksets/benchmarks.js');
const selection=read('benchmark-tasksets/selection.js');
const S=require('../benchmark-tasksets/selection.js');
const data=Object.fromEntries(['short','medium','long'].map(k=>[k,JSON.parse(read(`benchmark-tasksets/data/${k}.json`))]));
const original=execFileSync('git',['show','557a547f6dbdb82a07e26bd136fec8a997481e5b:benchmark-tasksets/benchmarks.js'],{cwd:root,encoding:'utf8'});
const sentence='Cost follows tokens: the tokens each system sent to the model per completed task are shown beside its cost.';
const tiers=['glm','grok','opus'];
async function page(sets=data,source=script){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
 const dom=new JSDOM(read('index.html'),{url:'http://127.0.0.1:8879/',runScripts:'outside-only',virtualConsole:vc});
 const w=dom.window;
 w.CSS={escape:s=>s}; // contender IDs are site's existing ASCII identifiers
 Object.defineProperty(w.document,'currentScript',{value:{src:'http://127.0.0.1:8879/benchmark-tasksets/benchmarks.js'}});
 w.fetch=async url=>({ok:true,json:async()=>structuredClone(sets[path.basename(url.pathname,'.json')])});
 w.eval(selection);await w.eval(source);
 assert.deepEqual(errors,[]);
 return dom;
}
function view(w,task,tier){
 for(const [key,val] of [['taskset',task],['tier',tier]])w.document.querySelector(`[data-${key}="${val}"]`).click();
 return [...w.document.querySelectorAll('.ts-table tbody tr')];
}
function currentRecord(set,row,tier,ultra,selectedId){
 if(set.status==='withheld')return undefined;
 let rr=S.recordsFor(set,row,tier);
 if(row.id==='protocolis-adaptive')rr=rr.filter(r=>ultra?r.tier==='all':r.tier!=='all');
 return rr.find(r=>r.id===selectedId)||rr[0];
}
function checkRow(tr,set,tier){
 const row=set.rows.find(r=>r.id===tr.dataset.contender),ultra=tr.closest('table').querySelector('caption').textContent.includes('Ultrafast');
 const select=tr.querySelector('select'),r=currentRecord(set,row,tier,ultra,select?.value);
 const cost=tr.querySelector('[data-label="Cost"]'),tokens=tr.querySelector('[data-label="Tokens"]');
 assert.equal(cost.nextElementSibling,tokens,'tokens immediately follow cost');
 assert.equal(cost.querySelector('.ts-value').tagName,tokens.querySelector('.ts-value').tagName);
 const raw=r?.tokens;
 const expected=typeof raw==='string'&&/^[\d$.,]+\s*(?:s|k)?$/.test(raw)?raw:'not measured';
 assert.equal(tokens.querySelector('.ts-value').textContent,expected,`${set.id}/${tier}/${row.id}`);
 assert.equal(tokens.querySelector('.ts-value').className,cost.querySelector('.ts-value').className,'equal metric weight');
 const settings=tr.querySelector('.ts-settings-note');
 if(typeof r?.driven_by_detail==='string'&&r.driven_by_detail.trim()){
  assert.equal(settings?.textContent,'Settings: '+r.driven_by_detail);
  assert.equal(settings.children.length,0,'settings are one escaped plain-text line');
 }else assert.equal(settings,null,'omit absent settings');
 return r;
}
function unchangedSnapshot(w){
 return [...w.document.querySelectorAll('.ts-table')].map(table=>({
  caption:table.querySelector('caption').textContent,
  headers:[...table.querySelectorAll('thead th')].map(x=>x.classList.contains('ts-more-head')?'Details':x.textContent),
  rows:[...table.querySelectorAll('tbody tr')].map(tr=>({
   id:tr.dataset.contender,section:tr.dataset.section,action:tr.dataset.action,classes:tr.className,
   label:tr.getAttribute('aria-label'),current:tr.getAttribute('aria-current'),name:tr.querySelector('th').textContent,
   otherMetrics:[...tr.querySelectorAll('td[data-label]')].filter(x=>x.dataset.label!=='Tokens').map(x=>x.innerHTML),
   options:[...tr.querySelectorAll('option')].map(x=>[x.value,x.selected,x.textContent])
  }))
 }));
}
test('all nine published views use the site selection and show tokens beside cost, including empty/withheld rows',async()=>{
 const dom=await page();try{
  const w=dom.window;
  for(const task of Object.keys(data))for(const tier of tiers){
   const rows=view(w,task,tier);
   assert.equal(w.document.querySelectorAll('.ts-table').length,3);
   assert.equal(w.document.querySelectorAll('.ts-token-note').length,1);
   assert.equal(w.document.querySelector('.ts-token-note').textContent,sentence);
   assert.equal(w.document.querySelector('#ts-content').firstElementChild.className,'ts-token-note');
   assert.ok(rows.length>0,'preserve table structure for withheld Long');
   for(const table of w.document.querySelectorAll('.ts-table')){
    const h=[...table.querySelectorAll('thead th')].map(x=>x.textContent.replace(/\s+/g,' '));
    assert.match(h[4],/Cost.*per completed task/);assert.match(h[5],/Tokens.*per completed task/);
   }
   for(const tr of rows)checkRow(tr,data[task],tier);
   if(data[task].status==='withheld'){
    assert.ok(rows.every(tr=>!checkRow(tr,data[task],tier)),'no withheld records leak');
    assert.equal(w.document.querySelectorAll('.ts-table select').length,0);
   }
   const method=w.document.querySelector('.ts-more-head .ts-popover').textContent;
   assert.match(method,/mean input \+ output tokens.*completed runs/);assert.match(method,/Largest single request counts input tokens only/);
  }
 }finally{dom.window.close();}
});
test('all selectable measurement windows render their own token data',async()=>{
 const dom=await page();let choices=0;try{
  const w=dom.window;
  for(const task of Object.keys(data))for(const tier of tiers){
   view(w,task,tier);
   const keys=[...w.document.querySelectorAll('.ts-table select')].map(s=>[s.dataset.recordKey,[...s.options].map(o=>o.value)]);
   for(const [key,ids] of keys)for(const id of ids){
    const s=[...w.document.querySelectorAll('select')].find(s=>s.dataset.recordKey===key);
    s.value=id;s.dispatchEvent(new w.Event('change',{bubbles:true}));
    const selected=[...w.document.querySelectorAll('select')].find(s=>s.dataset.recordKey===key);
    assert.equal(checkRow(selected.closest('tr'),data[task],tier).id,id);choices++;
   }
  }
  assert.ok(choices>0,'exercise real historical choices');
 }finally{dom.window.close();}
});
test('grouping, columns, non-token metrics and reference/focus behavior remain identical to the selected base',async()=>{
 const before=await page(data,original),after=await page();try{
  for(const task of Object.keys(data))for(const tier of tiers){
   view(before.window,task,tier);view(after.window,task,tier);
   assert.deepEqual(unchangedSnapshot(after.window),unchangedSnapshot(before.window));
   const actions=[...before.window.document.querySelectorAll('tr[data-action]')].map(tr=>[tr.dataset.section,tr.dataset.contender]);
   for(const [section,id] of actions){
    for(const w of [before.window,after.window])w.document.querySelector(`tr[data-section="${section}"][data-contender="${id}"]`).click();
    assert.deepEqual(unchangedSnapshot(after.window),unchangedSnapshot(before.window));
   }
   for(const w of [before.window,after.window])w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));
   assert.deepEqual(unchangedSnapshot(after.window),unchangedSnapshot(before.window));
  }
 }finally{before.window.close();after.window.close();}
});
function fixture(){
 const sets=structuredClone(data);
 for(const set of Object.values(sets)){
  set.status='historical';set.current_window=null;set.anchor_window=null;
  for(const row of set.rows)row.records=[...tiers,'all'].map(tier=>({
   id:row.id+'-'+tier,tier,task_set_id:set.taskSet,judge_id:'synthetic-only',window_id:'synthetic-only',
   contender:row.contender,model:tier==='all'?'synthetic-choice':'synthetic-'+tier,completion:'1/1',
   reportedTime:'1 s',medianTime:'1 s',cost:'$1',tokens:'12.3k',comparisonEligible:false,
   maxRequestTokens:1234567,maxRequestNote:'Synthetic request exceeded the synthetic model limit. <img src=x onerror=alert(1)>',
   driven_by_detail:'Synthetic settings only: <img src=x onerror=alert(1)> & "quoted"'
  }));
 }
 return sets;
}
test('synthetic optional largest INPUT request and authored failure note appear in every group/tier, escaped',async()=>{
 const sets=fixture(),dom=await page(sets);try{
  for(const task of Object.keys(sets))for(const tier of tiers)for(const tr of view(dom.window,task,tier)){
   checkRow(tr,sets[task],tier);
   const note=tr.querySelector('.ts-request-note');
   assert.ok(note);assert.match(note.textContent,/largest single request: 1,234,567 tokens/);
   assert.match(note.textContent,/Synthetic request exceeded the synthetic model limit/);
   assert.equal(note.querySelector('img'),null);
   const button=tr.querySelector('.ts-info-button');button.click();assert.equal(button.getAttribute('aria-expanded'),'true');
  }
 }finally{dom.window.close();}
});
test('legacy missing token labels become not measured; invalid request sizes never become numbers or inferred failures',async()=>{
 for(const value of [undefined,null,'','not reported','measuring','not run','not verifiable']){
  const sets=fixture();for(const set of Object.values(sets))for(const row of set.rows)for(const r of row.records){
   r.tokens=value;r.maxRequestTokens='1234567';delete r.maxRequestNote;r.completion='0/1';
  }
  const dom=await page(sets);try{
   const rows=view(dom.window,'short','glm');
   for(const tr of rows){assert.equal(tr.querySelector('[data-label="Tokens"] .ts-value').textContent,'not measured');assert.equal(tr.querySelector('.ts-request-note'),null);}
  }finally{dom.window.close();}
 }
});
test('optional note can stand alone; zero stays measured only when explicitly supplied',async()=>{
 const sets=fixture();for(const set of Object.values(sets))for(const row of set.rows)for(const r of row.records){r.tokens='0';delete r.maxRequestTokens;}
 const dom=await page(sets);try{
  for(const tr of view(dom.window,'short','grok')){
   assert.equal(tr.querySelector('[data-label="Tokens"] .ts-value').textContent,'0');
   assert.doesNotMatch(tr.querySelector('.ts-request-note').textContent,/largest single request/);
  }
 }finally{dom.window.close();}
});
