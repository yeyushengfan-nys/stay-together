import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const ctx={console,URL,Map,Set,Date,structuredClone,window:{},uid:()=>{throw Error('Existing hotel identity must be retained.');},HotelJourney:{city:s=>String(s).replace(/市$/,'')}};
vm.createContext(ctx);
for(const file of ['quote-evidence.js','criteria.js','selection-engine.js','reference-prices.js'])vm.runInContext(await readFile(new URL('../public/'+file,import.meta.url),'utf8'),ctx);
ctx.StayQuoteEvidence=ctx.window.StayQuoteEvidence;ctx.StaySelection=ctx.window.StaySelection;
const keep=ctx.window.StayReferencePrices.retainedEvidence;
const ev=(id,room,claims,patch={})=>({id,room,claims,confirmed:true,text:'Checked source: '+id,source:'https://fixture.test/'+id,...patch});
const old={id:'old',name:'测试酒店',city:'成都',demo:false,room:'Room A',price:999,referencePrice:950,terms:'Old package',facts:{smart:true},evidence:[
 ev('target-smart','Room A',{smart:true}),ev('target-mold','Room A',{mold:false}),ev('target-quiet','Room A',{quiet:true}),
 ev('other-room','Room B',{smart:false}),ev('unspecified-room','未注明',{quiet:true}),
 ev('hotel-opened','酒店级资料',{opened:2020}),ev('hotel-laundry','全店',{laundry:true}),
 ev('hotel-explicit','Some wording',{opened:2020},{scope:'hotel'}),
 ev('unconfirmed','Room A',{smart:true},{confirmed:false}),
 ev('old-price','Room A',{}, {text:'【用户核对的公开报价摘要，非住客原话】\nOld price 999'}),
 ev('old-breakfast','Room A',{breakfast:true}),ev('old-cancel','Room A',{freeCancel:true}),
 ev('old-collector','Room A',{smart:true},{collectorSource:true}),
 ev('other-review-context','Room B',{}, {text:'【公开住客评价｜人工核对节选】\nOther room review, no confirmed target-room claims.'})
]};
const original=JSON.stringify(old),same=keep(old,'Room A'),byID=items=>Object.fromEntries(items.map(e=>[e.id,e]));
let records=byID(same);
for(const id of ['target-smart','target-mold','target-quiet','unspecified-room','hotel-opened','hotel-laundry','hotel-explicit','other-review-context'])assert.equal(records[id].confirmed,true,id);
for(const id of ['other-room','unconfirmed','old-price','old-breakfast','old-cancel'])assert.equal(records[id].confirmed,false,id);
assert(!records['old-collector']);assert.equal(JSON.stringify(old),original);
records['target-smart'].claims.smart=false;assert.equal(old.evidence[0].claims.smart,true,'Returned evidence has independent nested records.');
records=byID(keep(old,'Room B'));
for(const id of ['target-smart','target-mold','target-quiet','unspecified-room','unconfirmed','old-price','old-breakfast','old-cancel'])assert.equal(records[id].confirmed,false,id);
for(const id of ['other-room','hotel-opened','hotel-laundry','hotel-explicit','other-review-context'])assert.equal(records[id].confirmed,true,id);
records=byID(keep(old,'目标房型未取得'));assert.equal(records['target-smart'].confirmed,false);assert.equal(records['hotel-opened'].confirmed,true);
assert.equal(JSON.stringify(old),original);

// Exercise the real sync entry point rather than just the pure helper.
const trip={city:'成都',checkin:'2026-12-30',checkout:'2027-01-02',rooms:1,adults:2};
const offer=room=>({id:'new-offer',provider:'ctrip',hotel:'测试酒店',room,bed:'1张1.5米双人床',listNightly:353,breakfast:2,breakfastText:'2份早餐',cancellation:'入住当天18:00前可免费取消',payment:'在线付',selectedForComparison:true,checkIn:trip.checkin,checkOut:trip.checkout,rooms:1,adults:2,children:0,currency:'CNY',stage:'room_list',capturedAt:'2026-10-26T12:00:00Z',source:'https://hotels.ctrip.com/hotels/123.html',evidence:'2份早餐\n入住当天18:00前可免费取消'});
function sync(room){
 const people=[{id:'member',conditions:[{id:'breakfast',mode:'must'}]}];
 ctx.state={mode:'trip',trip:structuredClone(trip),people:structuredClone(people),hotels:[old],aiResult:{old:true}};
 const job={id:'new-job',revision:2,query:{...trip,budget:500},candidates:[{name:'测试酒店'}],offers:[offer(room)],observations:[{hotel:'测试酒店',key:'opened',value:2020,evidence:'开业：2020',provider:'ctrip',room:'',source:'https://hotels.ctrip.com/hotels/123.html',capturedAt:'2026-10-26T12:00:00Z'}]};
 const beforeJob=JSON.stringify(job);ctx.job=job;vm.runInContext('collectorSyncReferenceCandidates(job)',ctx);
 assert.equal(JSON.stringify(job),beforeJob);assert.deepEqual(ctx.state.people,people);assert.deepEqual(ctx.state.trip,trip);assert.equal(JSON.stringify(old),original);
 const h=ctx.state.hotels[0];assert.equal(h.id,old.id);assert.equal(h.price,null);assert.equal(h.referencePrice,353);assert(!h.terms.includes('999'));assert.equal(h.quoteBundle.selected_offer_id,'new-offer');assert.equal(ctx.state.aiResult,undefined);
 assert.equal(h.evidence.filter(e=>e.collectorSource).length,1);assert.equal(h.evidence.find(e=>e.collectorSource).confirmed,false,'Fresh observations are not silently user-confirmed.');
 return byID(h.evidence);
}
assert.equal(sync('Room A')['target-smart'].confirmed,true);
records=sync('Room B');assert.equal(records['target-smart'].confirmed,false);assert.equal(records['other-room'].confirmed,true);assert.equal(records['hotel-laundry'].confirmed,true);assert.equal(records['unconfirmed'].confirmed,false);
console.log('PASS confirmed evidence survives same-room quote refresh; changed-room and old-package facts cannot leak; hotel-wide/unconfirmed states persist, new sources stay unconfirmed, preferences and inputs are untouched. Synthetic fixtures only.');
