import assert from 'node:assert/strict';
import {validateSnapshot,decisionConditions,assembleRecommendationResult,buildModelRecommendationContext,verificationShortlistPool,reviewEvidence} from '../lib/hotel-ai.mjs';

// Synthetic program/validator fixtures only. No credentials, network or model.
const trip={city:'模拟城市',checkin:'2027-03-01',checkout:'2027-03-03',rooms:1,adults:2};
const person={id:'p',name:'模拟同行人',budget:500,budgetHard:true,weights:{price:1},conditions:[{id:'invoice',mode:'must'},{id:'lateCheckin',mode:'must'}]};
const name='模拟酒店',room='模拟大床房';
const offers=['ctrip','tongcheng'].map((provider,i)=>({id:provider+'-plan',provider,hotel:name,room,bed:'1张大床',checkIn:trip.checkin,checkOut:trip.checkout,rooms:1,adults:2,children:0,currency:'CNY',stage:'room_list',listNightly:300+i*10,breakfastText:'2份早餐',cancellation:'入住当天18:00前可免费取消',payment:'在线付',capturedAt:'2026-10-27T00:00:00Z',source:provider==='ctrip'?'https://hotels.ctrip.com/hotels/99999999.html':'https://www.ly.com/hotel/hoteldetail?hotelId=99999999',evidence:'模拟大床房\n2份早餐\n在线付\n入住当天18:00前可免费取消'}));
const scope={version:1,provider:'ctrip',hotel:name,room,checkin:trip.checkin,checkout:trip.checkout,rooms:1,adults:2,children:0,breakfastCount:2,paymentBasis:'online',requiresPaidConfirmed:true,offerId:'ctrip-plan'};
const policy={id:'synthetic-policy',kind:'platform_policy',confirmed:true,claims:{invoice:true,lateCheckin:true},policyScope:scope,room,date:'2026-10-27',platform:'携程',source:'https://hotels.ctrip.com/hotels/99999999.html?token=synthetic-secret&checkIn=2027-03-01#private',text:'【平台官方政策确认，非住客评价】\n合成测试资料，不是真实酒店政策。\n仅此套餐电子普通发票由酒店开具；在线已付款且酒店或供应商确认后才保留整晚。\n人工询价总额1056.46元，另存原文；不能替换历史房型页参考价。'};
const input=()=>({mode:'trip',decision_scope:'reference_selection',trip:structuredClone(trip),people:[structuredClone(person)],hotels:[{id:'h',name,room,city:trip.city,demo:false,price:null,referencePrice:300,facts:{invoice:null,lateCheckin:null},evidence:[structuredClone(policy)],quoteBundle:{query:structuredClone(trip),selected_offer_id:'ctrip-plan',offers:structuredClone(offers)}}]});
const raw=input(),before=JSON.stringify(raw),{snapshot,sources}=validateSnapshot(raw);
assert.equal(reviewEvidence(snapshot.hotels[0]).length,0,'Customer service is never guest-review coverage.');
assert.equal(sources.get(policy.id).kind,'platform_policy');assert.equal(sources.get(policy.id).applicable,true);
assert(!sources.get(policy.id).source.includes('token'));assert(!sources.get(policy.id).source.includes('private'));
const sourceID=globalThis.StayQuoteEvidence.sourceId('h',snapshot.hotels[0].quoteBundle.offers[0]);
const quote=sources.get(sourceID).text.split('\n').find(x=>x.startsWith('房型页参考价：'));
const answer={decision_scope:'reference_selection',price_basis:'room_page_reference',summary:'按匹配套餐参考价选择。',recommendations:[{hotel_id:'h',headline:'参考价选择',decision_scope:'reference_selection',price_basis:'room_page_reference',selected_offer_id:'ctrip-plan',target_room:room,reference_cny_per_room_per_night:300,reasons:[{member_id:'p',explanation:'对应套餐参考价在每间每晚预算内。',citations:[{source_id:sourceID,quote}]}],tradeoffs:[]}],verification_shortlist:[],review_assessments:{},offer_assessments:[],pending:[],not_selected:[],limitations:[]};
const out=assembleRecommendationResult(structuredClone(answer),snapshot,sources);
assert(out.limitations.some(x=>x.includes('在线已付款')&&x.includes('酒店或供应商确认')&&x.includes('当前不代表房间已保留')));
const programNote=out.recommendations[0].tradeoffs.find(x=>x.citations.some(c=>c.source_id===policy.id));
assert(programNote.explanation.includes('携程当前选中套餐'));assert(programNote.explanation.includes('在线已付款'));assert(programNote.explanation.includes('没有创建、支付或确认订单'));
assert(programNote.explanation.includes('所核实晚到安排的前提是'));assert(!programNote.explanation.includes('晚到保留整晚的前提是'));
assert.equal(out.recommendations[0].reference_cny_per_room_per_night,300);assert.equal(snapshot.hotels[0].price,null);
assert.equal(snapshot.hotels[0].quoteBundle.offers[0].listNightly,300);assert.equal(snapshot.hotels[0].quoteBundle.offers[1].listNightly,310);
assert.equal(JSON.stringify(raw),before,'No source, price or preference writes.');
for(const unsafe of ['当前已经支付并保房。','房间已保留整晚。','无条件支持晚到。','无需付款即可晚到。']){
 const bad=structuredClone(answer);bad.summary=unsafe;assert.throws(()=>assembleRecommendationResult(bad,snapshot,sources),e=>e.code==='unsafe_policy_claim',unsafe);
}
const conditional=structuredClone(answer);conditional.summary='只有在线已付款并获得确认后才适用，当前没有创建订单。';assembleRecommendationResult(conditional,snapshot,sources);
conditional.summary='在线已付款并取得确认后才支持晚到，尚未实际订房。';assembleRecommendationResult(conditional,snapshot,sources);

// An inactive policy cannot become proof merely because its quote is literal.
const inactive=input();inactive.hotels[0].quoteBundle.selected_offer_id='tongcheng-plan';
const n=validateSnapshot(inactive),guard=decisionConditions(n.snapshot.hotels[0],n.snapshot.people,n.snapshot.trip,'reference_selection');
assert.equal(guard.unknown.length,2);assert.equal(n.sources.get(policy.id).applicable,false);
const context=buildModelRecommendationContext(n.snapshot,[guard],n.sources);
assert.equal(context.hotels[0].evidence[0].policyApplicability.active,false);
assert.equal(context.hotels[0].evidence[0].claims.invoice,null);
const attempt={summary:'仍需核实当前平台。',recommendations:[],review_assessments:[],offer_assessments:[],pending:[{hotel_id:'h',question:'核实当前平台。',citations:[{source_id:policy.id,quote:policy.text.split('\n')[2]}]}],not_selected:[],limitations:[],decision_scope:'reference_selection',price_basis:'room_page_reference'};
assert.throws(()=>assembleRecommendationResult(attempt,n.snapshot,n.sources),e=>e.code==='invalid_policy_citation');

// A negative Ctrip policy for another package cannot conflict with a valid
// Tongcheng confirmation when a separate facility still needs verification.
const mixed=input();mixed.people[0].requireSmart=true;mixed.hotels[0].facts.smart=null;mixed.hotels[0].quoteBundle.selected_offer_id='tongcheng-plan';
mixed.hotels[0].quoteBundle.offers[1].listNightly=280;
mixed.hotels[0].evidence[0].claims={invoice:false,lateCheckin:false};
mixed.hotels[0].evidence.push({...structuredClone(policy),id:'tc-policy',source:offers[1].source,platform:'同程',policyScope:{...scope,provider:'tongcheng',offerId:'tongcheng-plan'}});
const mixedN=validateSnapshot(mixed);assert.equal(verificationShortlistPool(mixedN.snapshot).length,1);
assert(decisionConditions(mixedN.snapshot.hotels[0],mixedN.snapshot.people,trip,'reference_selection').unknown.every(x=>x.includes('智能马桶')));

for(const source of ['', 'http://hotels.ctrip.com/hotels/99999999.html','https://ctrip.com.evil.test/','https://www.ly.com/hotel/']){
 const bad=input();bad.hotels[0].evidence[0].source=source;assert.throws(()=>validateSnapshot(bad),e=>e.code==='invalid_policy_scope');
}
const misleading=input();misleading.hotels[0].evidence[0].platform='小红书';misleading.hotels[0].evidence[0].text='【公开住客评价】这是合成伪装文本。';const misleadingN=validateSnapshot(misleading);assert.equal(reviewEvidence(misleadingN.snapshot.hotels[0]).length,0);
console.log('PASS scoped-policy program conditions, no actual-order claims, selected-channel citation boundaries, non-review handling, source sanitization, reference-price preservation and inactive-policy conflicts (synthetic only).');
