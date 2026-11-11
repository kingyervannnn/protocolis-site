(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BenchmarkSelection=factory();})(typeof window==='object'?window:globalThis,function(){
'use strict';
function windowFor(value,tier){return value&&typeof value==='object'?value[tier]||null:value||null;}
function contenderId(record){return (record.contender||'').toLowerCase().replace(/[^a-z0-9]+/g,'-');}
function recentReusable(set,record,targetWindow){
 if(!record||!targetWindow||!record.window_id||record.window_id===targetWindow)return false;
 const target=set.windows?.[targetWindow],id=contenderId(record),hours=set.comparable_within_hours;
 if(!target||!id||id.startsWith('protocolis-')||!Number.isFinite(hours)||hours<0)return false;
 if(!record.version||record.version!==target.contender_versions?.[id]||!record.worker_class||record.worker_class!==target.worker_class)return false;
 const exact=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(s)?Date.parse(s):NaN;
 const a=exact(record.measured_at),b=exact(target.measured_at);
 return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=hours*3600000;
}
function recordsFor(set,row,tier){
 const current=windowFor(set.current_window,tier),anchor=windowFor(set.anchor_window,tier);
 let records=row.records.filter(r=>(r.tier===tier||r.tier==='all')&&r.task_set_id===set.taskSet);
 if(current){const newer=anchor?records.filter(r=>r.window_id===anchor):[],bulk=records.filter(r=>r.window_id===current),reuse=row.reuse_plan?.[tier];records=newer.length?newer:bulk.length?bulk:reuse?.status==='reuse'?records.filter(r=>reuse.source_windows.includes(r.window_id)):[];}
 const seen=new Set();return records.filter(r=>{const k=JSON.stringify([r.model,r.completion,r.reportedTime,r.cost,r.tokens,r.window_id,r.clock]);if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>Number(/not run|measuring/.test(a.completion))-Number(/not run|measuring/.test(b.completion)));
}
function marker(set,record,tier){
 const current=windowFor(set.current_window,tier),anchor=windowFor(set.anchor_window,tier),target=anchor||current;
 if(recentReusable(set,record,target))return record.date||record.measured_at.slice(0,10);
 if(target&&record?.window_id!==target)return 'from window '+(record?.window_id||'unknown');
 return target?'window '+target:'separate run';
}
function timeRatio(record,anchor,set={}){
 if(!record||!anchor||record.id===anchor.id||!record.comparisonEligible||!anchor.comparisonEligible)return null;
 for(const field of ['task_set_id','judge_id','model','clock'])if(!record[field]||record[field]!==anchor[field])return null;
 if(!record.window_id||!anchor.window_id)return null;
 if(record.window_id!==anchor.window_id&&!recentReusable(set,record,anchor.window_id)&&!recentReusable(set,anchor,record.window_id))return null;
 const number=v=>typeof v==='number'?v:/^\d+(\.\d+)? s$/.test(v)?parseFloat(v):NaN;
 const ours=number(record.reportedTime),theirs=number(anchor.reportedTime);if(!Number.isFinite(ours)||!Number.isFinite(theirs)||ours<=0||theirs<=0)return null;
 return theirs/ours;
}
return {windowFor,recordsFor,timeRatio,recentReusable,marker};
});
