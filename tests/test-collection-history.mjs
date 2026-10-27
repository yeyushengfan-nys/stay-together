import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Synthetic attempts only; no saved user state, hotel lookup or network.
const q={city:'合成城市',checkin:'2027-04-01',checkout:'2027-04-03',rooms:1,adults:2,area:'合成区域一',searchGoal:'requirements_review'};
const people=[{id:'p',name:'合成成员',budget:500,budgetHard:true,requireSmart:true,conditions:[{id:'smartWash',mode:'must'}],weights:{price:3,transit:3,newness:3,facilities:3}}];
let nextId=0;
const ctx={console,URL,Date,Map,Set,structuredClone,uid:()=> 'new-'+(++nextId),HotelJourney:{city:s=>s},collectorHTML:()=>'',renderCompare:()=>{},render:()=>{},document:{addEventListener:()=>{}},collectorQuery:()=>q};ctx.window=ctx;vm.createContext(ctx);
for(const file of ['quote-evidence.js','criteria.js','engine.js','selection-engine.js','reference-prices.js','package-match.js','decision-summary.js','selection-client.js'])vm.runInContext(fs.readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),ctx);
const offer=(name,room='合成房型')=>({id:'ct-'+name,provider:'ctrip',hotel:name,room,bed:'双床',listNightly:300,breakfast:2,breakfastText:'2份早餐',cancellation:'入住当天18:00前可免费取消',payment:'在线付',selectedForComparison:true,checkIn:q.checkin,checkOut:q.checkout,rooms:1,adults:2,children:0,currency:'CNY',stage:'room_list',capturedAt:'2026-10-27T00:00:00Z',source:'https://hotels.ctrip.com/hotels/999.html',evidence:'2份早餐 入住当天18:00前可免费取消'});
const old={id:'old',name:'合成原酒店',city:q.city,room:'合成房型',demo:false,facts:{smart:true,smartWash:false},evidence:[{id:'manual-false',room:'合成房型',confirmed:true,claims:{smartWash:false},text:'合成人工明确否定',source:'https://example.test/official'}]};
const beforePeople=JSON.stringify(people);
ctx.state={mode:'trip',trip:{...q},people:structuredClone(people),hotels:[structuredClone(old)],hotelSelection:['old']};
function sync(id,names,offers,area=q.area){const job={id,revision:1,updatedAt:Date.parse('2026-10-27T00:00:00Z'),query:{...q,area},candidates:names.map(name=>({name})),offers,observations:[]};ctx.collectorSyncReferenceCandidates(job);return job;}
sync('batch-one',[old.name,'合成未获价酒店'],[offer(old.name)]);
assert.equal(ctx.state.hotelSelection.length,2);const failed=ctx.state.hotels.find(h=>h.name==='合成未获价酒店');assert.equal(failed.quoteBundle,null);assert.equal(failed.collectionAttempts[0].status,'no_quote');assert.equal(failed.collectionAttempts[0].scope.area,q.area);
assert.equal(ctx.HotelEngine.factsFor(ctx.state.hotels.find(h=>h.id==='old')).facts.smartWash,false);
sync('batch-two',['合成新增酒店'],[offer('合成新增酒店')],'合成区域二');
assert.equal(ctx.state.hotelSelection.length,3,'Unquoted earlier attempts remain visible when a new area is searched');assert(ctx.state.hotelSelection.includes(failed.id));
assert.equal(ctx.state.hotels.find(h=>h.name==='合成新增酒店').collectionAttempts[0].scope.area,'合成区域二');
sync('batch-two',['合成新增酒店'],[offer('合成新增酒店')],'合成区域二');assert.equal(ctx.state.hotels.find(h=>h.name==='合成新增酒店').collectionAttempts.length,1,'Repeated snapshots do not duplicate the same attempt');
// Failed re-reading the same hotel must not erase its checked room or explicit
// negative. The old quote is archived, never displayed as this attempt's price.
sync('batch-three',[old.name],[],'合成区域三');const refreshed=ctx.state.hotels.find(h=>h.id==='old');
assert.equal(refreshed.room,'合成房型');assert.equal(refreshed.evidence.find(e=>e.id==='manual-false').confirmed,true);assert.equal(ctx.HotelEngine.factsFor(refreshed).facts.smartWash,false);assert.equal(refreshed.facts.smart,true);
assert.equal(refreshed.quoteBundle,null);assert.equal(refreshed.price,null);assert.equal(refreshed.referencePrice,null);assert(refreshed.previousQuoteBundle.offers.length);assert.equal(refreshed.facts.breakfast,null);assert.equal(refreshed.facts.freeCancel,null);
assert.equal(ctx.state.hotelSelection.length,3);assert(ctx.collectorExcludedHotels(q).some(h=>h.name===old.name),'Confirmed negatives remain excluded even without a current quote');
// A base manual negative survives a same-room refresh; a genuinely new room
// resets room-scoped fields rather than applying the previous negative there.
const baseOnly={...structuredClone(old),id:'base-only',name:'合成基础字段酒店',evidence:[]};ctx.state.hotels.push(baseOnly);sync('batch-four',[baseOnly.name],[offer(baseOnly.name)]);assert.equal(ctx.state.hotels.find(h=>h.id==='base-only').facts.smartWash,false);
sync('batch-five',[baseOnly.name],[offer(baseOnly.name,'合成另一房型')]);assert.equal(ctx.state.hotels.find(h=>h.id==='base-only').facts.smartWash,null);
const otherDate={...q,checkin:'2027-05-01',checkout:'2027-05-03'};assert.equal(ctx.StayReferencePrices.hasAttempt(refreshed,otherDate),false);assert.equal(ctx.StayReferencePrices.hasAttempt(refreshed,{...q,area:'又一个区域'}),true,'Area belongs to individual attempts, not the trip identity');
assert.equal(JSON.stringify(ctx.state.people),beforePeople);assert.equal(JSON.stringify(old),JSON.stringify({id:'old',name:'合成原酒店',city:q.city,room:'合成房型',demo:false,facts:{smart:true,smartWash:false},evidence:[{id:'manual-false',room:'合成房型',confirmed:true,claims:{smartWash:false},text:'合成人工明确否定',source:'https://example.test/official'}]}));
console.log('PASS synthetic scoped attempt history: no-price records accumulate across areas, repeated snapshots deduplicate, failed re-query keeps checked negatives/room, old quotes archive without new-price claims, unquoted negatives reach exclusions, other dates and changed rooms remain scoped.');
