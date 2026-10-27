import assert from 'node:assert/strict';
import {validateSnapshot,hardConditions,checkRecommendation,constrainedRecommendationSchema,canonicalQuoteAssessment,verificationShortlistPool,handleAIRequest} from '../lib/hotel-ai.mjs';

// Synthetic fixtures and mock model responses only. No personal records,
// environment files, browser, network requests or real API credentials.
const Q=globalThis.StayQuoteEvidence;
const trip={city:'模拟城市',checkin:'2027-02-01',checkout:'2027-02-03',rooms:1,adults:2};
const people=[
  {id:'one',name:'模拟甲',budget:500,budgetHard:true,requireSmart:true,avoidMold:true,weights:{price:2,facilities:3},conditions:[{id:'freeCancel',mode:'must'}]},
  {id:'two',name:'模拟乙',budget:450,budgetHard:true,weights:{price:3,facilities:2},conditions:[{id:'breakfast',mode:'must'},{id:'quiet',mode:'must'}]}
];
function hotel(id,price=350){
  const name='模拟酒店'+id,room='模拟双床房';
  const offers=['ctrip','tongcheng'].map((provider,i)=>({id:provider+'-'+id,provider,platform:provider==='ctrip'?'携程':'同程',hotel:name,room,bed:'2张单人床',checkIn:trip.checkin,checkOut:trip.checkout,rooms:1,adults:2,children:0,currency:'CNY',stage:'room_list',listNightly:price+i*10,breakfast:2,breakfastText:'2份早餐',cancellation:'入住当天18:00前可免费取消',payment:'在线付',capturedAt:'2026-10-27T00:00:00Z',source:provider==='ctrip'?'https://hotels.ctrip.com/hotels/123.html':'https://www.ly.com/hotel/hoteldetail?hotelId=456',evidence:name+'\n'+room+'\n2份早餐\n入住当天18:00前可免费取消\n房型页参考价人民币'+(price+i*10)+'元'}));
  return {id,name,city:trip.city,room,price:null,referencePrice:price,priceBasis:'room_page_reference',metro:null,demo:false,facts:{smart:null,quiet:null,mold:null},evidence:[],quoteBundle:{query:{...trip},selected_offer_id:offers[0].id,offers}};
}
const input=(hotels=[hotel('a'),hotel('b',380)])=>({mode:'trip',trip:structuredClone(trip),preferencesConfirmed:true,people:structuredClone(people),hotels});
const guard=(s)=>s.hotels.map(h=>hardConditions(h,s.people,2027));
function basis(h){const o=h.quoteBundle.offers.find(o=>o.id===h.quoteBundle.selected_offer_id);return {source_id:Q.sourceId(h.id,o),quote:Q.text(o).split('\n').find(x=>x.startsWith('房型页参考价：'))};}
function answer(snapshot){
  const checks=guard(snapshot),pool=verificationShortlistPool(snapshot,checks),eligible=checks.filter(g=>!g.blocked.length&&!g.unknown.length).slice(0,2);
  return {summary:constrainedRecommendationSchema(snapshot,checks).properties.summary.enum?.[0]||'模拟结果',review_assessments:[],offer_assessments:snapshot.hotels.filter(h=>h.quoteBundle).map(canonicalQuoteAssessment),recommendations:eligible.map(g=>{const h=snapshot.hotels.find(h=>h.id===g.hotel_id);return {hotel_id:h.id,headline:'模拟正式候选',reasons:snapshot.people.map(p=>({member_id:p.id,explanation:'模拟正式理由',citations:[basis(h)]})),tradeoffs:[]};}),verification_shortlist:pool.slice(0,2).map((p,i)=>{const h=snapshot.hotels.find(h=>h.id===p.hotel_id);return {hotel_id:h.id,decision_scope:'verification_only',price_basis:'room_page_reference',headline:i===0?'优先核实候选':'备选核实候选',reasons:snapshot.people.map(member=>({member_id:member.id,explanation:'已采到预算范围内的对应套餐参考价；个人必要设施仍需核实。',citations:[basis(h)]})),verify_next:p.missing_conditions.map(condition=>({condition,question:'需确认是否满足「'+condition+'」的适用房型和条件；最终价格只在预订前复核。'}))};}),pending:[],not_selected:[],limitations:['本清单只安排核实顺序，非入住建议。']};
}
function assertCode(fn,code){assert.throws(fn,e=>e.code===code,'expected '+code);}

const raw=input(),before=JSON.stringify(raw),{snapshot,sources}=validateSnapshot(raw),checks=guard(snapshot),pool=verificationShortlistPool(snapshot,checks);
assert.equal(pool.length,2);assert(checks.every(g=>!g.blocked.length&&g.unknown.length));
assert(pool.every(p=>p.reference_cny_per_room_per_night>0&&p.missing_conditions.some(c=>c.includes('预算'))));
// Shared missing facts are deduplicated across people; settings themselves stay unchanged.
assert.equal(pool[0].missing_conditions.filter(c=>c.includes('预算')).length,1);
let result=checkRecommendation(answer(snapshot),snapshot,sources);
assert.equal(result.recommendations.length,0);assert.equal(result.verification_shortlist.length,2);
assert.equal(snapshot.hotels[0].price,null);assert.equal(snapshot.hotels[0].facts.smart,null);
assert.equal(JSON.stringify(raw),before);
const schema=constrainedRecommendationSchema(snapshot,checks,sources);
assert(schema.required.includes('verification_shortlist'));assert.equal(schema.properties.recommendations.maxItems,0);assert.equal(schema.properties.verification_shortlist.maxItems,2);
assert.deepEqual(schema.properties.verification_shortlist.items.anyOf.map(s=>s.properties.hotel_id.enum[0]),['a','b']);
assert(schema.properties.verification_shortlist.items.anyOf[0].properties.reasons.items.properties.citations.items.anyOf.every(pair=>pair.properties.source_id.enum.every(id=>sources.get(id).hotel_id==='a')));

// Existing saved responses/mocks may omit the new channel, without weakening
// the unchanged formal gate. Strict real output schemas require the field.
const legacy=answer(snapshot);delete legacy.verification_shortlist;
assert.deepEqual(checkRecommendation(legacy,snapshot,sources).verification_shortlist,[]);

for(const field of ['smart','quiet','mold']){
  const bad=input();bad.hotels[0].facts[field]=field==='mold'?true:false;
  const normalized=validateSnapshot(bad).snapshot;
  assert(!verificationShortlistPool(normalized,guard(normalized)).some(p=>p.hotel_id==='a'));
}
const contradictory=input();contradictory.hotels[0].facts.smart=false;contradictory.hotels[0].evidence=[{id:'conflict',confirmed:true,room:contradictory.hotels[0].room,text:'模拟冲突材料',claims:{smart:true}}];
const contradictorySnapshot=validateSnapshot(contradictory).snapshot;assert.equal(guard(contradictorySnapshot)[0].blocked.length,0);assert(!verificationShortlistPool(contradictorySnapshot,guard(contradictorySnapshot)).some(p=>p.hotel_id==='a'));
const optionalConflict=input();optionalConflict.hotels[0].facts.pool=false;optionalConflict.hotels[0].evidence=[{id:'optional',confirmed:true,text:'模拟可选偏好冲突',claims:{pool:true}}];
const optionalSnapshot=validateSnapshot(optionalConflict).snapshot;assert(verificationShortlistPool(optionalSnapshot,guard(optionalSnapshot)).some(p=>p.hotel_id==='a'));
const over=validateSnapshot(input([hotel('over',451)])).snapshot;assert.equal(verificationShortlistPool(over,guard(over)).length,0);
const noMeal=input([hotel('none')]);for(const o of noMeal.hotels[0].quoteBundle.offers){o.breakfast=0;o.breakfastText='无早餐';o.evidence=o.evidence.replace('2份早餐','无早餐');}
const mealSnapshot=validateSnapshot(noMeal).snapshot;assert.equal(verificationShortlistPool(mealSnapshot,guard(mealSnapshot)).length,0);
const oneMeal=input([hotel('one')]);for(const o of oneMeal.hotels[0].quoteBundle.offers){o.breakfast=1;o.breakfastText='1份早餐';o.evidence=o.evidence.replace('2份早餐','1份早餐');}
const oneSnapshot=validateSnapshot(oneMeal).snapshot;assert.equal(verificationShortlistPool(oneSnapshot,guard(oneSnapshot)).length,0);
const expired=input([hotel('expired')]);for(const o of expired.hotels[0].quoteBundle.offers){o.cancellation='不可取消';o.evidence=o.evidence.replace('入住当天18:00前可免费取消','不可取消');}
const expiredSnapshot=validateSnapshot(expired).snapshot;assert.equal(verificationShortlistPool(expiredSnapshot,guard(expiredSnapshot)).length,0);
const king=input([hotel('king')]);king.people[0].conditions.push({id:'twinBeds',mode:'must'});king.hotels[0].room='模拟大床房';for(const o of king.hotels[0].quoteBundle.offers){o.room='模拟大床房';o.bed='1张大床';}
const kingSnapshot=validateSnapshot(king).snapshot;assert.equal(verificationShortlistPool(kingSnapshot,guard(kingSnapshot)).length,0);
const noQuote=input([hotel('missing')]);delete noQuote.hotels[0].quoteBundle;
const noQuoteSnapshot=validateSnapshot(noQuote).snapshot;assert.equal(verificationShortlistPool(noQuoteSnapshot,guard(noQuoteSnapshot)).length,0);
const noAmount=input([hotel('amount')]);for(const o of noAmount.hotels[0].quoteBundle.offers)o.listNightly=null;
const noAmountSnapshot=validateSnapshot(noAmount).snapshot;assert.equal(verificationShortlistPool(noAmountSnapshot,guard(noAmountSnapshot)).length,0);
const otherRoom=input([hotel('scope')]);otherRoom.hotels[0].room='另一个目标房型';
const otherSnapshot=validateSnapshot(otherRoom).snapshot;assert.equal(verificationShortlistPool(otherSnapshot,guard(otherSnapshot)).length,0);

// Duplicate hotels, wrong-hotel quotes, missing people and unsupported/gap-only
// reasons cannot masquerade as an evidence-backed verification candidate.
let bad=answer(snapshot);bad.verification_shortlist[1]=structuredClone(bad.verification_shortlist[0]);assertCode(()=>checkRecommendation(bad,snapshot,sources),'invalid_verification_shortlist');
bad=answer(snapshot);bad.verification_shortlist=null;assertCode(()=>checkRecommendation(bad,snapshot,sources),'invalid_verification_shortlist');
bad=answer(snapshot);bad.verification_shortlist[0]=null;assertCode(()=>checkRecommendation(bad,snapshot,sources),'invalid_verification_shortlist');
bad=answer(snapshot);bad.verification_shortlist[0].reasons[0].citations=[basis(snapshot.hotels[1])];assertCode(()=>checkRecommendation(bad,snapshot,sources),'unverified_citation');
bad=answer(snapshot);bad.verification_shortlist[0].reasons.pop();assertCode(()=>checkRecommendation(bad,snapshot,sources),'missing_verification_evidence');
bad=answer(snapshot);bad.verification_shortlist[0].reasons[1].member_id='one';assertCode(()=>checkRecommendation(bad,snapshot,sources),'missing_verification_evidence');
bad=answer(snapshot);bad.verification_shortlist[0].reasons[0].citations=[];assertCode(()=>checkRecommendation(bad,snapshot,sources),'missing_verification_evidence');
bad=answer(snapshot);bad.verification_shortlist[0].reasons[0]=null;assertCode(()=>checkRecommendation(bad,snapshot,sources),'missing_verification_evidence');
bad=answer(snapshot);for(const r of bad.verification_shortlist[0].reasons)r.citations=[{source_id:'hotel:a',quote:'对应房型智能马桶：待确认'}];assertCode(()=>checkRecommendation(bad,snapshot,sources),'missing_verification_evidence');
bad=answer(snapshot);bad.verification_shortlist[0].reasons[0].citations=[{...basis(snapshot.hotels[0]),quote:'房型页参考价：'}];assertCode(()=>checkRecommendation(bad,snapshot,sources),'missing_verification_evidence');
bad=answer(snapshot);bad.verification_shortlist[0].reasons[0].citations=[{source_id:'hotel:a',quote:'对应房型智能马桶：待确认'}];assertCode(()=>checkRecommendation(bad,snapshot,sources),'missing_verification_evidence');
bad=answer(snapshot);bad.verification_shortlist[0].verify_next.pop();assertCode(()=>checkRecommendation(bad,snapshot,sources),'invalid_verification_questions');
bad=answer(snapshot);bad.verification_shortlist[0].verify_next[0].condition='添加的无关要求';assertCode(()=>checkRecommendation(bad,snapshot,sources),'invalid_verification_questions');
for(const unsafe of ['可以放心入住，已经满足所有必要条件。','同条件最终更便宜。','这家配备智能马桶。','房间很安静。','没有霉味。']){bad=answer(snapshot);bad.verification_shortlist[0].reasons[0].explanation=unsafe;assertCode(()=>checkRecommendation(bad,snapshot,sources),'unsafe_verification_claim');}
// Reproduced semantic failure: an unknown facility cannot become a definite
// negative merely because the answer is only a verification work queue.
const actualUnknownDenial='不过这不是你要求的智能马桶房型，且电子普通发票、晚到保房都未确认，所以只能放在核实顺序里。';
for(const statement of [actualUnknownDenial,'这间没有智能马桶。','这间不配备智能马桶。','这不是所需的智能马桶房型。','不是未知，这间没有智能马桶。']){
 const candidate=answer(snapshot);candidate.verification_shortlist[0].reasons[0].explanation=statement;
 assert.throws(()=>checkRecommendation(candidate,snapshot,sources),e=>e.code==='unsafe_verification_claim'&&e.verification_issue.rule_id==='unknown_as_denied');
}
for(const statement of [
 '该目标房型是否配备智能马桶仍待确认，不能从未知推断有或无。',
 '未查到资料不代表没有智能马桶。',
 '目前未查到智能马桶的直接资料，因此不能认定该房型没有智能马桶。',
 '尚不能说这不是你要求的智能马桶房型，需要先核对该房型资料。'
]){const candidate=answer(snapshot);candidate.verification_shortlist[0].reasons[0].explanation=statement;checkRecommendation(candidate,snapshot,sources);}
const scopedDenialInput=input();scopedDenialInput.hotels[0].evidence.push({id:'synthetic-other-room',confirmed:true,platform:'合成测试材料',room:'其他房型',text:'合成材料，其他房型的住客短引：“没有智能马桶”。',claims:{}});
const scopedDenial=validateSnapshot(scopedDenialInput);
let scopedAnswer=answer(scopedDenial.snapshot);scopedAnswer.verification_shortlist[0].reasons[0].explanation='其他房型的住客短引“没有智能马桶”，不能据此认定目标房型没有智能马桶，目标房型仍待核实。';
scopedAnswer.verification_shortlist[0].reasons[0].citations.push({source_id:'synthetic-other-room',quote:'没有智能马桶'});
checkRecommendation(scopedAnswer,scopedDenial.snapshot,scopedDenial.sources);
scopedAnswer=answer(scopedDenial.snapshot);scopedAnswer.verification_shortlist[0].reasons[0].explanation='其他房型的住客短引“没有智能马桶”，不能据此认定目标房型没有智能马桶；这间目标房型没有智能马桶。';assertCode(()=>checkRecommendation(scopedAnswer,scopedDenial.snapshot,scopedDenial.sources),'unsafe_verification_claim');
const laundry=input();laundry.people[0].requireLaundry=true;const laundrySnapshot=validateSnapshot(laundry);
for(const unsafe of ['这家的智能马桶已确认，提供免费自助洗衣。','免费自助洗衣已确认。']){bad=answer(laundrySnapshot.snapshot);bad.verification_shortlist[0].reasons[0].explanation=unsafe;assertCode(()=>checkRecommendation(bad,laundrySnapshot.snapshot,laundrySnapshot.sources),'unsafe_verification_claim');}
bad=answer(snapshot);bad.verification_shortlist[0].reasons[0].explanation='仅是核实顺序，非正式推荐，不能保证入住体验。';checkRecommendation(bad,snapshot,sources);

// Repeating a member's requirement is not a hotel capability assertion.
const requirementInput=input();requirementInput.people[0].conditions.push({id:'invoice',mode:'must'},{id:'lateCheckin',mode:'must'});
const requirementData=validateSnapshot(requirementInput);
for(const statement of [
 '你必须要智能马桶、免费取消、可开所需发票和支持晚到入住；现有材料尚不足，发票与晚到仍待确认。',
 '我的底线里包含智能、免费取消、可开所需发票和支持晚到入住。所需设施仍待确认。',
 '你的硬性点里还需要智能马桶、可开所需发票和支持晚到入住，而这些目前都还没核实。',
 '模拟甲的底线里包含支持晚到入住。现有资料未确认。',
 '住客评价只代表当时，不保证本次隔音。',
 '现有“很安静”来自双床房，不可直接当作这间大床房已确认安静。'
]){const candidate=answer(requirementData.snapshot);candidate.verification_shortlist[0].reasons[0].explanation=statement;checkRecommendation(candidate,requirementData.snapshot,requirementData.sources);}
for(const statement of [
 '我要求支持晚到入住，这家支持晚到入住。',
 '我的底线里包含支持晚到入住所以这家实际支持晚到入住。',
 '我必须要智能马桶而这家配备智能马桶。',
 '我的必要条件是智能马桶，但这家智能马桶已确认。',
 '你必须要智能马桶所以可以放心入住。',
 '不保证价格，但保证隔音。',
 '现有“很安静”来自双床房，因此这间大床房隔音很好。'
]){const candidate=answer(requirementData.snapshot);candidate.verification_shortlist[0].reasons[0].explanation=statement;assertCode(()=>checkRecommendation(candidate,requirementData.snapshot,requirementData.sources),'unsafe_verification_claim');}

// One formal candidate must not occupy a verification slot; two formal
// candidates close the independent channel entirely.
const mixed=input();Object.assign(mixed.hotels[0],{price:350,facts:{smart:true,mold:false,quiet:true}});
let normalized=validateSnapshot(mixed),mixedAnswer=answer(normalized.snapshot);
assert.equal(mixedAnswer.recommendations.length,1);assert.deepEqual(mixedAnswer.verification_shortlist.map(p=>p.hotel_id),['b']);checkRecommendation(mixedAnswer,normalized.snapshot,normalized.sources);
Object.assign(mixed.hotels[1],{price:380,facts:{smart:true,mold:false,quiet:true}});normalized=validateSnapshot(mixed);
assert.equal(verificationShortlistPool(normalized.snapshot,guard(normalized.snapshot)).length,0);assert.equal(constrainedRecommendationSchema(normalized.snapshot,guard(normalized.snapshot)).properties.verification_shortlist.maxItems,0);

// Real handler contract and the existing one-repair mechanism, exercised only
// through a mock fetcher. A cross-hotel citation is rejected before the repair.
let calls=0,modelPrompt,modelSchema;
const response=await handleAIRequest(new Request('https://fixture.test/api/ai/recommend',{method:'POST',body:JSON.stringify(raw)}),{OPENAI_API_KEY:'mock-placeholder'},{local:true,fetcher:async(url,options)=>{
  calls++;const request=JSON.parse(options.body);modelPrompt=JSON.parse(request.input[0].content[0].text);modelSchema=request.text.format.schema;
  const out=answer(snapshot);if(calls===1)out.verification_shortlist[0].reasons[0].citations=[basis(snapshot.hotels[1])];
  return Response.json({status:'completed',id:'mock-'+calls,model:'mock-model',output:[{content:[{type:'output_text',text:JSON.stringify(out)}]}]});
}});
assert.equal(response.status,200);const body=await response.json();assert.equal(calls,2);assert.equal(body.attempts[0].code,'unverified_citation');assert.equal(body.attempts[1].status,'accepted');
assert.equal(body.result.recommendations.length,0);assert.equal(body.result.verification_shortlist.length,2);
assert.equal(modelPrompt.verification_candidates.length,2);assert.equal(modelSchema.properties.recommendations.maxItems,0);assert.equal(modelSchema.properties.verification_shortlist.maxItems,2);
const requirements=new Map(modelPrompt.member_requirements.map(p=>[p.member_id,p]));assert(requirements.get('one').required_condition_ids.includes('freeCancel'));assert(!requirements.get('two').required_condition_ids.includes('freeCancel'));assert(requirements.get('two').required_condition_ids.includes('breakfast'));assert(!requirements.get('one').required_condition_ids.includes('breakfast'));
assert.equal(JSON.stringify(raw),before);
// Denial errors use the existing one-repair path; the rejected original is
// never replaced or silently marked as a successful answer.
let denialCalls=0;
const repairedDenial=await handleAIRequest(new Request('https://fixture.test/api/ai/recommend',{method:'POST',body:JSON.stringify(raw)}),{OPENAI_API_KEY:'mock-placeholder'},{local:true,fetcher:async()=>{
 denialCalls++;const out=answer(snapshot);if(denialCalls===1)out.verification_shortlist[0].reasons[0].explanation=actualUnknownDenial;
 return Response.json({status:'completed',id:'mock-denial-'+denialCalls,model:'mock-model',output:[{content:[{type:'output_text',text:JSON.stringify(out)}]}]});
}});
assert.equal(repairedDenial.status,200);const denialBody=await repairedDenial.json();assert.equal(denialCalls,2);assert.equal(denialBody.attempts[0].code,'unsafe_verification_claim');assert.equal(denialBody.attempts[0].verification_issue.rule_id,'unknown_as_denied');assert.equal(denialBody.attempts[1].status,'accepted');assert(!JSON.stringify(denialBody.result).includes(actualUnknownDenial));
console.log('PASS independent verification shortlist: reference packages and unknown facilities may yield a scoped work queue while formal stays zero; explicit conflicts, price/meal/bed/cancel mismatches, absent evidence, wrong-room sources, duplicates, missing members, unsafe claims and omitted gaps are guarded; mock citation repair and preference preservation pass.');
