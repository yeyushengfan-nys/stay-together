import assert from 'node:assert/strict';
import {validateQuery,makeJob,applySnapshot,summarize,packageMatches} from '../collector-extension/core.js';
const now=Date.parse('2026-10-26T00:00:00Z');
const q=validateQuery({city:'成都',checkin:'2026-12-30',checkout:'2027-01-02',rooms:1,adults:2,platforms:['ctrip','tongcheng'],maxHotels:2,budget:465,required:['breakfast','freeCancel','smart'],workflow:'selection',priceMode:'reference'},now);
const candidates=Array.from({length:12},(_,i)=>({id:String(i+1),name:'Synthetic '+(i+1),listNightly:200}));
const row=(count=0,price=200)=>({rowKey:'0:0',room:'Twin',bed:'2张1.2米单人床',breakfast:count,breakfastText:count+'份早餐',listNightly:price,cancellation:'入住当天18:00前可免费取消',payment:'在线付',stage:'room_list',evidence:'Test fixture only, not a real price'});
const step=(j,s)=>{j.taskTabId=77;applySnapshot(j,s,now+1000*j.revision);};
let j=makeJob(q,7,now);step(j,{status:'ready',candidates});
assert.equal(j.search.poolSize,12);assert.equal(j.candidates.length,1);
for(let i=0;i<3;i++){
 assert.equal(j.tasks[j.index].provider,'ctrip');assert.equal(j.tasks[j.index].phase,'rooms');
 step(j,{status:'ready',offers:[row(1)],previewCandidate:null,planSummary:{visibleOfferCount:1,eligibleOfferCount:0,limitation:'Visible rows only'}});
}
assert.equal(j.tasks[j.index].name,'Synthetic 4');assert.equal(j.search.matched,0);assert(!j.tasks.some(t=>t.provider==='tongcheng'));
for(let i=4;i<=5;i++){
 assert.equal(j.tasks[j.index].name,'Synthetic '+i);
 step(j,{status:'ready',offers:[row(2)],previewCandidate:row(2)});
 assert.equal(j.tasks[j.index].phase,'amenities');assert(!j.tasks.some(t=>t.phase==='checkout'));
 step(j,{status:'ready',observations:[],offers:[]});
 assert.equal(j.tasks[j.index].provider,'tongcheng');assert.equal(j.tasks[j.index].phase,'locate');
 step(j,{status:'ready',candidates:[{id:String(100+i),name:'Synthetic '+i}]});
 step(j,{status:'ready',offers:[row(2,210)],previewCandidate:row(2,210)});
}
assert.equal(j.status,'completed');assert.equal(j.search.inspected,5);assert.equal(j.search.matched,2);assert.equal(j.search.stopReason,'target_met');assert(!j.candidates.some(c=>c.name==='Synthetic 6'));
assert.equal(summarize(j).search.matched,2);assert(j.message.includes('必要设施与评价仍须核实'));
j=makeJob(q,7,now);step(j,{status:'ready',candidates});
while(j.status!=='completed')step(j,{status:'ready',offers:[row(0)],previewCandidate:null});
assert.equal(j.search.inspected,8);assert.equal(j.search.matched,0);assert.equal(j.search.stopReason,'inspection_limit');assert.equal(j.offers.length,8);assert(j.message.includes('套餐0家'));
assert.equal(packageMatches(row(1),q),false);assert.equal(packageMatches(row(2,466),q),false);assert.equal(packageMatches({...row(2),cancellation:'不可免费取消'},q),false);
assert.equal(packageMatches(row(2,465),q),true);
j=makeJob(q,7,now);step(j,{status:'ready',candidates:candidates.slice(0,1)});step(j,{status:'ready',offers:[row(1)],previewCandidate:row(1)});assert.equal(j.search.matched,0);assert.equal(j.search.stopReason,'pool_exhausted');
assert(!JSON.stringify(j.query).includes('name'));assert.equal(q.required.includes('smart'),true);
console.log('PASS failed first three replenish to fourth/fifth; only matched hotels get cross-platform tasks; budget/meal constraints cannot be bypassed; bounded eight-hotel stop reports shortage; no checkout or preference mutation. Synthetic only.');
