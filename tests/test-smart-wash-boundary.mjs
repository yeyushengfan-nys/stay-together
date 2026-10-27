import assert from 'node:assert/strict';
import {validateSnapshot,decisionConditions,constrainedRecommendationSchema,checkRecommendation,verificationShortlistPool} from '../lib/hotel-ai.mjs';
import '../public/reference-prices.js';

// Synthetic manual-confirmation fixtures only. No saved user evidence, APIs,
// credentials, browser state or actual hotel statements are used.
const trip={city:'模拟城市',checkin:'2027-03-01',checkout:'2027-03-03',rooms:1,adults:2};
const name='模拟酒店',room='模拟大床房';
const people=[{id:'me',name:'我',budget:500,budgetHard:true,requireSmart:true,weights:{price:1},conditions:[{id:'smartWash',mode:'must'}]},{id:'friend',name:'朋友',budget:500,budgetHard:true,weights:{price:1},conditions:[]}];
const offer={id:'plan',provider:'ctrip',hotel:name,room,bed:'1张大床',checkIn:trip.checkin,checkOut:trip.checkout,rooms:1,adults:2,children:0,currency:'CNY',stage:'room_list',listNightly:300,breakfastText:'2份早餐',cancellation:'入住当天18:00前可免费取消',payment:'在线付',capturedAt:'2026-10-27T00:00:00Z',source:'https://hotels.ctrip.com/hotels/99999999.html',evidence:'模拟大床房\n2份早餐\n入住当天18:00前可免费取消'};
const input=()=>({mode:'trip',decision_scope:'reference_selection',trip:structuredClone(trip),people:structuredClone(people),hotels:[{id:'h',name,room,city:trip.city,demo:false,price:null,facts:{smart:true},evidence:[],quoteBundle:{query:structuredClone(trip),selected_offer_id:offer.id,offers:[structuredClone(offer)]}}]});
const guard=n=>decisionConditions(n.snapshot.hotels[0],n.snapshot.people,n.snapshot.trip,'reference_selection');
assert(globalThis.HotelCriteria.catalog.some(c=>c.id==='smartWash'));
const raw=input(),before=JSON.stringify(raw),n=validateSnapshot(raw),unknown=guard(n);
assert(unknown.unknown.some(x=>x.includes('马桶清洗功能')));assert.equal(unknown.blocked.length,0);
assert.equal(n.snapshot.hotels[0].facts.smart,true);assert.equal(n.snapshot.hotels[0].facts.smartWash,undefined);
assert(n.sources.get('hotel:h').text.includes('马桶清洗功能（臀洗／妇洗）：待确认'));
assert.equal(constrainedRecommendationSchema(n.snapshot,[unknown],n.sources).properties.recommendations.maxItems,0);
assert.equal(JSON.stringify(raw),before);

// Generic smart / heated-seat claims and free text never imply washing.
for(const evidence of [
 {claims:{smart:true},text:'合成记录：泛称智能马桶，座圈可加热。'},
 {claims:{},text:'合成记录：文本写着臀洗、妇洗，但用户尚未确认对应字段。'}
]){
 const d=input();d.hotels[0].evidence=[{id:'manual',confirmed:true,room,platform:'酒店资料',...evidence}];const normalized=validateSnapshot(d);
 assert(guard(normalized).unknown.some(x=>x.includes('马桶清洗功能')));
 assert.equal(globalThis.HotelEngine.factsFor(d.hotels[0],trip).facts.smartWash,undefined);
}
for(const value of [false,true]){
 const d=input();d.hotels[0].evidence=[{id:'wash',confirmed:true,room,platform:'酒店资料',text:'【客服设施答复，非住客评价】合成字段核对记录。',claims:{smartWash:value}}];
 const original=JSON.stringify(d),normalized=validateSnapshot(d),g=guard(normalized),resolved=globalThis.HotelEngine.factsFor(d.hotels[0],trip).facts;
 assert.equal(normalized.snapshot.hotels[0].facts.smart,true);assert.equal(normalized.snapshot.hotels[0].evidence[0].claims.smartWash,value);
 assert.equal(resolved.smart,true);assert.equal(resolved.smartWash,value);
 assert.equal(g.blocked.some(x=>x.includes('马桶清洗功能')),!value);assert(!g.unknown.some(x=>x.includes('马桶清洗功能')));
 assert.equal(decisionConditions(normalized.snapshot.hotels[0],[normalized.snapshot.people[1]],trip,'reference_selection').blocked.length,0,'The friend did not require washing.');
 if(!value)assert.equal(verificationShortlistPool(normalized.snapshot).length,0,'A known required-function conflict is excluded, not a verification candidate.');
 assert.equal(JSON.stringify(d),original);
}
const all=input();all.people[0].conditions=globalThis.HotelCriteria.catalog.map(c=>({id:c.id,mode:'prefer'}));
assert.equal(all.people[0].conditions.length,17);validateSnapshot(all);
all.people[0].conditions.push({id:'smartWash',mode:'prefer'});assert.throws(()=>validateSnapshot(all),e=>e.code==='invalid_conditions');

// Switching to another target room clears only the view's room-specific fact
// and confirmation; the original source remains intact for audit/backup.
const switched=input(),h=switched.hotels[0];h.facts.smartWash=true;
h.evidence=[{id:'old-room-wash',confirmed:true,room,claims:{smartWash:true},text:'合成已核对房型设施资料。'}];
h.quoteBundle.offers[0].breakfastText='无早餐';h.quoteBundle.offers[0].evidence='模拟大床房\n无早餐\n入住当天18:00前可免费取消';
h.quoteBundle.offers.push({...offer,id:'new-room',room:'模拟双床房',bed:'2张单人床',listNightly:320});
switched.people[0].conditions.push({id:'breakfast',mode:'must'});
const preserved=JSON.stringify(switched),match=globalThis.HotelPackageMatch.build(h,switched.people,trip);
assert.equal(match.derivedHotel.room,'模拟双床房');assert.equal(match.derivedHotel.facts.smartWash,null);
assert.equal(match.derivedHotel.evidence[0].confirmed,false);
assert.equal(globalThis.HotelEngine.factsFor(match.derivedHotel,trip).facts.smartWash,null);
const retained=globalThis.StayReferencePrices.retainedEvidence(h,'模拟双床房');assert.equal(retained[0].confirmed,false);
assert.equal(globalThis.StayReferencePrices.retainedEvidence(h,room)[0].confirmed,true);
assert.equal(JSON.stringify(switched),preserved);

const sourceID=globalThis.StayQuoteEvidence.sourceId('h',n.snapshot.hotels[0].quoteBundle.offers[0]);
const bad={decision_scope:'reference_selection',price_basis:'room_page_reference',summary:'合成错误尝试。',recommendations:[{hotel_id:'h',headline:'错误使用泛称智能满足洗净要求',reasons:[{member_id:'me',explanation:'已有智能马桶。',citations:[{source_id:sourceID,quote:n.sources.get(sourceID).text.split('\n')[0]}]}],tradeoffs:[]}],review_assessments:[],offer_assessments:[],pending:[],not_selected:[],limitations:[]};
assert.throws(()=>checkRecommendation(bad,n.snapshot,n.sources),e=>e.code==='hard_condition_failed');
console.log('PASS smartWash is a separate explicit required fact; generic smart/heated seat and text do not imply it, false excludes only its owner, 17 catalog conditions validate, and room switching invalidates washing evidence without writes (synthetic only).');
