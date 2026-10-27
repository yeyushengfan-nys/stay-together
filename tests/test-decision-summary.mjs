import assert from 'node:assert/strict';
import '../public/criteria.js';
import '../public/quote-evidence.js';
import '../public/engine.js';
import '../public/decision-summary.js';

// All hotels and people below are synthetic test fixtures.
const trip={city:'Fixture City',checkin:'2026-12-01'};
const people=[
  {id:'one',name:'甲',budget:500,budgetHard:true,requireSmart:true,avoidMold:true,weights:{price:1,newness:1},conditions:[{id:'breakfast',mode:'must'},{id:'pool',mode:'prefer'}]},
  {id:'two',name:'乙',budget:450,budgetHard:true,requireSmart:true,avoidMold:true,weights:{price:1},conditions:[{id:'quiet',mode:'must'},{id:'bathtub',mode:'prefer'},{id:'view',mode:'prefer'}]}
];
const hotel=(extra={})=>({id:'fixture',name:'Simulated Hotel',price:400,referencePrice:null,metro:5,room:'Simulated Twin',facts:{smart:true,mold:false,quiet:true,breakfast:true,opened:2024,renovated:null,pool:null,bathtub:null,view:null},evidence:[],...extra});
const build=(h,p=people)=>globalThis.HotelDecisionSummary.build([h],p,trip)[0];

let r=build(hotel());
assert.equal(r.code,'ready');assert.equal(r.formalEligible,true);assert.equal(r.budget.basis,'verified');assert.equal(r.budget.ceiling,450);
assert.deepEqual(r.optionalUnknown.map(x=>x.key),['pool','bathtub','view']);
assert(r.known.some(x=>x.key==='quiet'&&x.label==='隔音有住客正向反馈'));
assert.equal(r.missing.length,0);

const ref=hotel({price:null,referencePrice:381,priceBasis:'room_page_reference'});
r=build(ref);assert.equal(r.code,'needs_evidence');assert.equal(r.formalEligible,false);assert.equal(r.budget.within,true);assert.equal(r.budget.basis,'reference');assert.deepEqual(r.missing.map(x=>x.key),['budget']);
r=build(hotel({price:null,referencePrice:480,priceBasis:'room_page_reference'}));assert.equal(r.code,'over_reference_budget');assert.equal(r.label,'当前参考价超预算');assert.equal(r.formalEligible,false);
r=build(hotel({price:480}));assert.equal(r.code,'excluded');assert(r.conflicts.some(x=>x.key==='budget'));
r=build(hotel({facts:{smart:null,mold:null,quiet:true,breakfast:false}}));assert.equal(r.code,'excluded');assert.equal(r.conflicts.find(x=>x.key==='breakfast').label,'不含所需早餐');assert.equal(r.missing.filter(x=>x.key==='smart').length,1);assert.equal(r.missing.filter(x=>x.key==='mold').length,1);assert.equal(r.missing.find(x=>x.key==='mold').label,'目标房型异味反馈');

const newnessPeople=people.map((p,i)=>({...p,newnessHard:true,newnessPolicy:{newWithin:i===0?3:1,oldAfter:8,allowRenovation:false}}));
r=build(hotel(),newnessPeople);assert.equal(r.code,'excluded');assert.equal(r.conflicts.find(x=>x.key==='newness').label,'不符合乙的新旧要求');
const roomRenovation=hotel({facts:{...hotel().facts,opened:2000,renovated:2026,renovationScope:'guestrooms'}});
r=build(roomRenovation,newnessPeople.map(p=>({...p,newnessPolicy:{...p.newnessPolicy,allowRenovation:true}})));assert.equal(r.code,'ready');
r=build({...roomRenovation,facts:{...roomRenovation.facts,renovationScope:'public'}},newnessPeople.map(p=>({...p,newnessPolicy:{...p.newnessPolicy,allowRenovation:true}})));assert.equal(r.code,'excluded');

const transitPeople=people.map(p=>({...p,transitHard:true,maxMetro:3}));
r=build(hotel(),transitPeople);assert.equal(r.code,'excluded');assert.equal(r.conflicts.filter(x=>x.key==='metro').length,1);
r=build(hotel({metro:null}),transitPeople);assert.equal(r.missing.filter(x=>x.key==='metro').length,1);
const laundryPeople=people.map(p=>({...p,requireLaundry:true}));r=build(hotel(),laundryPeople);assert.equal(r.missing.filter(x=>x.key==='laundry').length,1);
const softPeople=people.map(p=>({...p,budgetHard:false,laundryPreference:'prefer'}));r=build(hotel({price:null,referencePrice:600}),softPeople);assert.equal(r.formalEligible,true);assert.equal(r.code,'ready');assert.equal(r.budget.basis,'reference');assert.equal(r.budget.within,false);assert(r.optionalUnknown.some(x=>x.key==='laundry'));

const a=hotel(),b=hotel({id:'second',name:'Second Simulated Hotel',price:390});const input=[a,b],inputPeople=structuredClone(people),before=JSON.stringify({input,inputPeople,trip});
const rows=globalThis.HotelDecisionSummary.build(input,inputPeople,trip);assert.deepEqual(rows.map(x=>x.hotel.id),['fixture','second']);assert.equal(JSON.stringify({input,inputPeople,trip}),before);
const conflicting=hotel({evidence:[{confirmed:true,claims:{smart:false}}]});r=build(conflicting);assert.equal(r.formalEligible,false);assert(r.missing.some(x=>x.key==='smart'&&x.label.includes('冲突')));
console.log('PASS display-only decisions: hard/soft budget separation, reference price bounds, deduplicated necessary gaps, optional unknowns, per-person freshness, target-room renovation, transit/laundry conditions, conflict handling and no state mutation (synthetic fixtures).');
