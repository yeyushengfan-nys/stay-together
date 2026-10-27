import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {validateSnapshot,hardConditions,decisionConditions,referencePackage,checkRecommendation,constrainedRecommendationSchema,buildModelRecommendationContext,assembleRecommendationResult,verificationShortlistPool,handleAIRequest} from '../lib/hotel-ai.mjs';

// Explicitly synthetic fixtures. This test makes no network/browser/API calls
// and neither reads credentials nor changes persisted preferences or prices.
const Q=globalThis.StayQuoteEvidence;
const trip={city:'模拟城市',checkin:'2027-03-01',checkout:'2027-03-03',rooms:1,adults:2};
const people=[
 {id:'a',name:'模拟甲',budget:500,budgetHard:true,requireSmart:true,avoidMold:true,weights:{price:2},conditions:[{id:'freeCancel',mode:'must'},{id:'invoice',mode:'must'},{id:'lateCheckin',mode:'must'}]},
 {id:'b',name:'模拟乙',budget:450,budgetHard:true,weights:{price:3},conditions:[{id:'breakfast',mode:'must'},{id:'quiet',mode:'must'},{id:'twinBeds',mode:'must'}]}
];
function hotel(id,amount=350){
 const name='模拟酒店'+id,room='模拟双床房';
 const offers=['ctrip','tongcheng'].map((provider,i)=>({id:provider+'-'+id,provider,hotel:name,room,bed:'2张单人床',checkIn:trip.checkin,checkOut:trip.checkout,rooms:1,adults:2,children:0,currency:'CNY',stage:'room_list',listNightly:amount+i*10,breakfast:2,breakfastText:'2份早餐',cancellation:'入住当天18:00前可免费取消',payment:'在线付',capturedAt:'2026-10-27T00:00:00Z',source:provider==='ctrip'?'https://hotels.ctrip.com/hotels/123.html':'https://www.ly.com/hotel/hoteldetail?hotelId=456',evidence:name+'\n'+room+'\n2份早餐\n入住当天18:00前可免费取消\n参考价'+(amount+i*10)+'元'}));
 return {id,name,room,city:trip.city,demo:false,price:null,referencePrice:1,facts:{smart:true,mold:false,quiet:true,invoice:true,lateCheckin:true,twinBeds:true},evidence:[],quoteBundle:{query:{...trip},selected_offer_id:offers[0].id,offers}};
}
const input=()=>({mode:'trip',decision_scope:'reference_selection',trip:structuredClone(trip),people:structuredClone(people),hotels:[hotel('one'),hotel('two',380)]});
const guards=s=>s.hotels.map(h=>decisionConditions(h,s.people,s.trip,s.decision_scope));
const basis=h=>{const o=h.quoteBundle.offers.find(o=>o.id===h.quoteBundle.selected_offer_id);return {source_id:Q.sourceId(h.id,o),quote:Q.text(o).split('\n').find(line=>line.startsWith('房型页参考价：'))};};
function answer(s){
 const g=guards(s),pool=verificationShortlistPool(s,g);
 return {decision_scope:s.decision_scope,price_basis:'room_page_reference',summary:'按当前匹配套餐参考价选择，其他必要证据已逐项检查。',review_assessments:{},offer_assessments:[],recommendations:g.filter(x=>!x.blocked.length&&!x.unknown.length).slice(0,2).map(x=>{const h=s.hotels.find(h=>h.id===x.hotel_id),o=referencePackage(h,s.people,s.trip).offer;return {hotel_id:h.id,headline:'参考价选择',decision_scope:'reference_selection',price_basis:'room_page_reference',selected_offer_id:o.id,target_room:o.room,reference_cny_per_room_per_night:o.listNightly,reasons:s.people.map(p=>({member_id:p.id,explanation:'这间对应套餐参考价在你的预算范围内；房型和餐食满足已检查的必要条件。',citations:[basis(h)]})),tradeoffs:[]};}),verification_shortlist:pool.slice(0,2).map(p=>{const h=s.hotels.find(h=>h.id===p.hotel_id);return {hotel_id:p.hotel_id,decision_scope:'verification_only',price_basis:'room_page_reference',headline:'优先核实候选',reasons:s.people.map(p=>({member_id:p.id,explanation:'套餐参考价在预算内，其他必要证据仍需核实。',citations:[basis(h)]})),verify_next:[]};}),pending:[],not_selected:[],limitations:[]};
}
const raw=input(),before=JSON.stringify(raw),{snapshot:s,sources}=validateSnapshot(raw),g=guards(s);
assert(g.every(x=>!x.blocked.length&&!x.unknown.length));
assert(hardConditions(s.hotels[0],s.people,2027).unknown.some(x=>x.includes('含税房价')),'Default final gate remains unchanged.');
const assembled=assembleRecommendationResult(answer(s),s,sources);
assert.equal(assembled.recommendations.length,2);assert.equal(assembled.decision_scope,'reference_selection');assert.equal(assembled.price_basis,'room_page_reference');
assert.deepEqual(assembled.recommendations.map(r=>r.headline),['参考价首选','参考价备选']);
assert.equal(assembled.recommendations[0].reference_cny_per_room_per_night,350,'Use cleaned selected offer, never arbitrary referencePrice=1.');
assert.equal(assembled.pending.length,0,'Final-tax-price reminder is not a missing fact for this explicit reference scope.');
assert(assembled.limitations.some(x=>x.includes('最终含税应付价')));
assert.equal(s.hotels[0].price,null);assert(s.people.every(p=>p.budgetHard));assert.equal(JSON.stringify(raw),before);
const schema=constrainedRecommendationSchema(s,g,sources),model=buildModelRecommendationContext(s,g,sources);
assert.equal(schema.properties.recommendations.maxItems,2);assert.deepEqual(schema.properties.decision_scope.enum,['reference_selection']);assert.deepEqual(schema.properties.price_basis.enum,['room_page_reference']);
for(const item of schema.properties.recommendations.items.anyOf){assert.equal(item.properties.reference_cny_per_room_per_night.enum.length,1);assert(item.properties.reasons.items.properties.citations.items.anyOf.every(pair=>pair.properties.source_id.enum.every(id=>sources.get(id).hotel_id===item.properties.hotel_id.enum[0])));}
// Every schema-permitted reason quote now comes from the selected package,
// matching the final validator; another platform remains usable in tradeoffs.
for(const item of schema.properties.recommendations.items.anyOf){
 const id=item.properties.hotel_id.enum[0],h=s.hotels.find(h=>h.id===id),selectedID=Q.sourceId(id,{id:h.quoteBundle.selected_offer_id}),other=h.quoteBundle.offers.find(o=>o.id!==h.quoteBundle.selected_offer_id),otherID=Q.sourceId(id,other);
 const reasons=item.properties.reasons.items.properties.citations.items.anyOf,tradeoffs=item.properties.tradeoffs.items.properties.citations.items.anyOf;
 assert(reasons.every(pair=>pair.properties.source_id.enum.every(sourceID=>sourceID===selectedID)));
 assert(!reasons.some(pair=>pair.properties.source_id.enum.includes(otherID)));
 assert(tradeoffs.some(pair=>pair.properties.source_id.enum.includes(otherID)));
}
assert.equal(model.schema.properties.pending.maxItems,0);assert.equal(model.schema.properties.limitations.maxItems,0);

// Other unknown/negative conditions cannot be bypassed by accepting reference prices.
for(const field of ['smart','invoice','lateCheckin','quiet']){
 const d=input();d.hotels[0].facts[field]=null;const n=validateSnapshot(d);assert(guards(n.snapshot)[0].unknown.length);
 const out=assembleRecommendationResult(answer(n.snapshot),n.snapshot,n.sources);assert(!out.recommendations.some(r=>r.hotel_id==='one'));assert(out.verification_shortlist.some(r=>r.hotel_id==='one'));assert(!out.pending.some(p=>p.hotel_id==='one'&&/最终含税价|最终预算/.test(p.question)));
 const denied=input();denied.hotels[0].facts[field]=false;const nn=validateSnapshot(denied);assert(guards(nn.snapshot)[0].blocked.length);assert(!verificationShortlistPool(nn.snapshot).some(p=>p.hotel_id==='one'));
}
const mold=input();mold.hotels[0].facts.mold=true;assert(guards(validateSnapshot(mold).snapshot)[0].blocked.length);
const bothUnknown=input();bothUnknown.hotels.forEach(h=>{h.facts.invoice=null;h.facts.lateCheckin=null;});const unresolved=validateSnapshot(bothUnknown),stillPending=assembleRecommendationResult(answer(unresolved.snapshot),unresolved.snapshot,unresolved.sources);assert.equal(stillPending.recommendations.length,0);assert.equal(stillPending.verification_shortlist.length,2);assert(stillPending.condition_checks.every(g=>g.unknown.length&&!g.unknown.some(x=>x.includes('含税房价'))));
// Every package mismatch is excluded; an old h.price or standalone referencePrice cannot rescue it.
const mutations=[
 h=>h.quoteBundle.offers.forEach(o=>o.listNightly=600),
 h=>h.quoteBundle.offers.forEach(o=>{o.breakfast=0;o.breakfastText='无早餐';o.evidence=o.evidence.replace('2份早餐','无早餐');}),
 h=>h.quoteBundle.offers.forEach(o=>{o.breakfast=1;o.breakfastText='1份早餐';o.evidence=o.evidence.replace('2份早餐','1份早餐');}),
 h=>h.quoteBundle.offers.forEach(o=>{o.bed='1张大床';o.room='模拟大床房';}),
 h=>h.quoteBundle.offers.forEach(o=>{o.cancellation='不可取消';o.evidence=o.evidence.replace('入住当天18:00前可免费取消','不可取消');}),
 h=>h.room='另一房型',
 h=>h.quoteBundle.selected_offer_id='missing',
 h=>{delete h.quoteBundle;h.price=10;h.referencePrice=10;}
];
for(const mutate of mutations){const d=input();d.hotels[0].price=10;mutate(d.hotels[0]);const n=validateSnapshot(d);const check=guards(n.snapshot)[0];assert(check.blocked.length||check.unknown.length);assert(!answer(n.snapshot).recommendations.some(r=>r.hotel_id==='one'));}
const stale=input();stale.hotels[0].quoteBundle.query.checkin='2027-03-02';assert.throws(()=>validateSnapshot(stale),e=>e.code==='stale_collected_quotes');
const changedPeople=input();changedPeople.trip.adults=3;assert.throws(()=>validateSnapshot(changedPeople),e=>e.code==='stale_collected_quotes');
const withChildren=input();withChildren.trip.children=1;
assert.throws(()=>validateSnapshot(withChildren),e=>e.code==='unsupported_child_occupancy'&&e.message.includes('无儿童')&&e.message.includes('成人报价'));
assert(decisionConditions(withChildren.hotels[0],withChildren.people,withChildren.trip,'reference_selection').blocked.some(x=>x.includes('无儿童')));
const zeroChildren=input();zeroChildren.trip.children=0;assert.equal(validateSnapshot(zeroChildren).snapshot.trip.children,0);
const oldFinalWithChildren=input();delete oldFinalWithChildren.decision_scope;oldFinalWithChildren.trip.children=1;assert.equal(validateSnapshot(oldFinalWithChildren).snapshot.decision_scope,'final','This fix does not change default final validation semantics.');
const invalidScope=input();invalidScope.decision_scope='anything';assert.throws(()=>validateSnapshot(invalidScope),e=>e.code==='invalid_decision_scope');

// New result metadata and selected-plan citations are checked, not blindly trusted.
const ready=assembled;
for(const [key,value]of [['reference_cny_per_room_per_night',1],['target_room','另一房型'],['selected_offer_id','missing'],['price_basis','final']]){const bad=structuredClone(ready);bad.recommendations[0][key]=value;assert.throws(()=>checkRecommendation(bad,s,sources),e=>e.code==='invalid_reference_package');}
let bad=structuredClone(ready);bad.recommendations[0].reasons[0].citations=[basis(s.hotels[1])];assert.throws(()=>checkRecommendation(bad,s,sources),e=>e.code==='unverified_citation');
const otherOffer=s.hotels[0].quoteBundle.offers.find(o=>o.id!==s.hotels[0].quoteBundle.selected_offer_id),otherQuote={source_id:Q.sourceId('one',otherOffer),quote:Q.text(otherOffer).split('\n').find(line=>line.startsWith('房型页参考价：'))};
bad=structuredClone(ready);bad.recommendations[0].reasons[0].citations=[otherQuote];assert.throws(()=>checkRecommendation(bad,s,sources),e=>e.code==='missing_evidence');
const legalOtherPlatformTradeoff=structuredClone(ready);legalOtherPlatformTradeoff.recommendations[0].tradeoffs=[{explanation:'另一平台同房型参考价供核对，不表示最终应付价。',citations:[otherQuote]}];checkRecommendation(legalOtherPlatformTradeoff,s,sources);
bad=structuredClone(ready);bad.recommendations[0].reasons[0].citations=[{source_id:'hotel:one',quote:'酒店：模拟酒店one'}];assert.throws(()=>checkRecommendation(bad,s,sources),e=>e.code==='missing_evidence');
bad=structuredClone(ready);bad.recommendations[0].reasons.push(bad.recommendations[0].reasons[0]);assert.throws(()=>checkRecommendation(bad,s,sources),e=>e.code==='missing_evidence');
for(const text of ['最终含税应付价350元','最终预算已满足','同条件最低价','保证入住']){bad=structuredClone(ready);bad.recommendations[0].reasons[0].explanation=text;assert.throws(()=>checkRecommendation(bad,s,sources),e=>e.code==='unsafe_reference_claim');}
bad=structuredClone(ready);bad.recommendations[0].reasons[0].explanation='最终应付价未核实，参考价350元仅用于本次选择；不能保证未来入住。';checkRecommendation(bad,s,sources);
bad=structuredClone(ready);bad.decision_scope='final';assert.throws(()=>checkRecommendation(bad,s,sources),e=>e.code==='invalid_decision_scope');

// Missing/omitted scope defaults to the existing final gate and does not silently opt in.
const finalInput=input();delete finalInput.decision_scope;const f=validateSnapshot(finalInput);assert.equal(f.snapshot.decision_scope,'final');assert(guards(f.snapshot).every(x=>x.unknown.some(c=>c.includes('含税房价'))));
const defaultBad=structuredClone(ready);delete defaultBad.decision_scope;delete defaultBad.price_basis;assert.throws(()=>checkRecommendation(defaultBad,f.snapshot,f.sources),e=>e.code==='hard_condition_failed');

// One complete synthetic request proves schema, prompt, validator and response agree.
let calls=0,requestBody;
const response=await handleAIRequest(new Request('https://example.test/api/ai/recommend',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(raw)}),{OPENAI_API_KEY:'mock-placeholder'},{local:true,fetcher:async(_url,options)=>{calls++;requestBody=JSON.parse(options.body);return Response.json({status:'completed',id:'resp_synthetic',model:'mock',output:[{content:[{type:'output_text',text:JSON.stringify(answer(s))}]}]});}});
assert.equal(response.status,200);const body=await response.json();assert.equal(calls,1);assert.equal(body.decision_scope,'reference_selection');assert.equal(body.result.decision_scope,'reference_selection');assert.equal(body.result.recommendations.length,2);
const sent=JSON.parse(requestBody.input[0].content[0].text);assert.equal(sent.decision_scope,'reference_selection');assert(sent.condition_checks.every(x=>!x.unknown.length));assert(sent.people.every(p=>p.budgetHard));assert(sent.hotels.every(h=>h.price===null));assert(requestBody.instructions.includes('不是最终应付价')||requestBody.instructions.includes('不得改写'));assert.deepEqual(requestBody.text.format.schema.properties.price_basis.enum,['room_page_reference']);
let invalidOccupancyCalls=0;
const childResponse=await handleAIRequest(new Request('https://example.test/api/ai/recommend',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(withChildren)}),{OPENAI_API_KEY:'mock-placeholder'},{local:true,fetcher:async()=>{invalidOccupancyCalls++;throw new Error('must not call upstream');}});
assert.equal(childResponse.status,400);assert.equal((await childResponse.json()).error.code,'unsupported_child_occupancy');assert.equal(invalidOccupancyCalls,0);

// Browser request/version and the detailed fallback renderer share the same scope.
const source=fs.readFileSync(new URL('../public/ai.js',import.meta.url),'utf8'),ctx={Number,E:x=>String(x??'').replaceAll('<','&lt;'),state:{mode:'trip',trip,people,preferencesConfirmed:true},analysisHotels:()=>s.hotels};vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function aiRequestDecisionScope'),source.indexOf('const fingerprint='))+';globalThis.getSnapshot=snapshot;',ctx);assert.equal(ctx.getSnapshot().analysis_version,13);assert.equal(ctx.getSnapshot().decision_scope,'reference_selection');ctx.state.mode='demo';assert.equal(ctx.getSnapshot().decision_scope,'final');
vm.runInContext(source.slice(source.indexOf('function aiDecisionScope'),source.indexOf('function resultHTML')),ctx);const html=ctx.aiRecommendationPriceHTML(body,body.result.recommendations[0],{price:9999,room:'旧房型'});assert(html.includes('350'));assert(html.includes('模拟双床房'));assert(!html.includes('9999'));assert(!html.includes('旧房型'));assert(html.includes('房型页参考价'));assert(html.includes('不是最终应付价'));
console.log('PASS explicit reference selection endpoint: selected clean real-package reference budget only; unchanged default final/facility/evidence gates; schema/prompt/validation/UI metadata agree; mismatch, unsafe final-price claims and bad citations rejected; preferences and h.price unchanged. Mock only.');
