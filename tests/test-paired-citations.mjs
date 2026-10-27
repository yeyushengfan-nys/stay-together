import assert from 'node:assert/strict';
import {citationFragments,validateSnapshot,hardConditions,constrainedRecommendationSchema,checkRecommendation,handleAIRequest,buildModelRecommendationContext,assembleRecommendationResult,canonicalQuoteAssessment,verificationShortlistPool,canonicalVerificationQuestions} from '../lib/hotel-ai.mjs';

// Entirely synthetic: no browser, real hotel material, environment files or API.
const trip={city:'模拟城市',checkin:'2027-02-01',checkout:'2027-02-03',rooms:1,adults:2};
const people=[{id:'one',name:'PERSON_PRIVATE',budget:500,budgetHard:true,requireSmart:true,avoidMold:true,weights:{price:1}},{id:'two',name:'模拟乙',budget:450,budgetHard:true,conditions:[{id:'breakfast',mode:'must'},{id:'freeCancel',mode:'must'}],weights:{price:1}}];
function hotel(id){
 const name='PRIVATE_HOTEL_'+id,room='模拟双床房';
 const offers=Array.from({length:19},(_,i)=>{const provider=i<10?'ctrip':'tongcheng';return {id:provider+'-'+id+'-'+i,provider,platform:provider==='ctrip'?'携程':'同程',hotel:name,room,bed:'2张单人床',checkIn:trip.checkin,checkOut:trip.checkout,rooms:1,adults:2,children:0,currency:'CNY',stage:'room_list',listNightly:300+i,breakfast:2,breakfastText:'2份早餐',cancellation:'入住当天18:00前可免费取消',payment:'在线付',capturedAt:'2026-10-27T00:00:00Z',source:provider==='ctrip'?'https://hotels.ctrip.com/hotels/123.html':'https://www.ly.com/hotel/hoteldetail?hotelId=456',evidence:room+'\n2份早餐\n入住当天18:00前可免费取消\nRAW_PAGE_SENTINEL_'+id+'_'+i+' '+ 'x'.repeat(3000)};});
 const evidence=[0,1].map(i=>({id:'review-'+id+'-'+i,confirmed:true,room:i===0?room:'其他房型',date:'2026-10-01',platform:'其他',source:'https://example.test/review/'+id+'/'+i,claims:{},text:'【公开住客评价短引＋人工核对说明】\n住客短引：“模拟住客'+id+i+'的原话，房间体验有个人差异。”。\n人工说明：这个日期和房型说明不能冒充住客原话。'}));
 return {id,name,city:trip.city,room,price:null,referencePrice:300,metro:null,demo:false,facts:{smart:null,mold:null},evidence,quoteBundle:{query:{...trip},selected_offer_id:offers[0].id,offers}};
}
const raw={mode:'trip',trip,people,hotels:['a','b','c'].map(hotel)},before=JSON.stringify(raw);
const {snapshot,sources}=validateSnapshot(raw),checks=snapshot.hotels.map(h=>hardConditions(h,snapshot.people,2027)),schema=constrainedRecommendationSchema(snapshot,checks,sources);
const choiceMap=item=>new Map(item.anyOf.map(branch=>[branch.properties.source_id.enum[0],branch.properties.quote.enum]));
const permits=(item,id,quote)=>choiceMap(item).get(id)?.includes(quote)||false;
for(const item of schema.properties.review_assessments.items.anyOf){
 const id=item.properties.hotel_id.enum[0],choices=choiceMap(item.properties.citations.items);
 assert.equal(choices.size,2);assert.equal(item.properties.citations.minItems,2);
 for(const [sourceID,quotes] of choices){assert(sourceID.startsWith('review-'+id));assert.equal(quotes.length,1);assert(!quotes[0].includes('人工说明'));assert(!quotes[0].includes('住客短引：'));assert(sources.get(sourceID).text.includes(quotes[0]));}
}
const reviewA=schema.properties.review_assessments.items.anyOf[0].properties.citations.items;
assert(permits(reviewA,'review-a-0','模拟住客a0的原话，房间体验有个人差异。'));
assert(!permits(reviewA,'review-a-0','模拟住客a1的原话，房间体验有个人差异。'));
assert(!permits(reviewA,'review-b-0','模拟住客b0的原话，房间体验有个人差异。'));
assert.equal(sources.get('review-a-1').room,'其他房型');assert.equal(sources.get('review-a-1').date,'2026-10-01');assert.equal(snapshot.hotels[0].evidence[1].room,'其他房型');
for(const item of schema.properties.verification_shortlist.items.anyOf){
 const id=item.properties.hotel_id.enum[0],choices=choiceMap(item.properties.reasons.items.properties.citations.items);
 assert(choices.size<=4,'Only target-page sources and the two confirmed reviews are repeated in the schema.');
 for(const [sourceID,quotes]of choices){assert.equal(sources.get(sourceID).hotel_id,id);for(const quote of quotes)assert(sources.get(sourceID).text.includes(quote));}
 const target='quote:'+id+':ctrip-'+id+'-0';assert(choices.has(target));assert(!permits(item.properties.reasons.items.properties.citations.items,target,'房型页参考价：'));
}
assert(!JSON.stringify(schema).includes('RAW_PAGE_SENTINEL'));assert(JSON.stringify(schema).length<70000);
assert([...sources.values()].some(s=>s.text.includes('RAW_PAGE_SENTINEL')),'Original evidence remains intact outside the compact enum.');
const generic={text:'【确认文字】\nOriginal sentence.\nSecond exact sentence.'};
assert.deepEqual(citationFragments(generic),['Original sentence.','Second exact sentence.']);
assert(citationFragments({text:'住客短引：“房间原话。”。\n人工说明：“这不是住客原话”。'}).every(s=>s==='房间原话。'));
assert.deepEqual(citationFragments({kind:'platform_room_page',text:'房型：目标双床房\n房型页参考价：人民币300元\n早餐页面文字：未知\n取消页面文字：未知\n页面采集原文：\n房型：其他大床房\n早餐页面文字：2份早餐'}),['房型：目标双床房','房型页参考价：人民币300元']);
const otherPlan=structuredClone(raw);for(const o of otherPlan.hotels[0].quoteBundle.offers.filter(o=>o.provider==='tongcheng'))o.room='其他房型';
const otherData=validateSnapshot(otherPlan),otherSchema=constrainedRecommendationSchema(otherData.snapshot,otherData.snapshot.hotels.map(h=>hardConditions(h,people,2027)),otherData.sources);
const pendingA=otherSchema.properties.pending.items.anyOf.find(p=>p.properties.hotel_id.enum[0]==='a');assert([...choiceMap(pendingA.properties.citations.items).keys()].filter(id=>id.startsWith('quote:')).every(id=>otherData.sources.get(id).room==='模拟双床房'));
const unknown={mode:'trip',trip,people,hotels:[{id:'empty',name:'模拟空资料',city:trip.city,room:'模拟房型',price:null,metro:null,facts:{},evidence:[]}]};
const empty=validateSnapshot(unknown),emptySchema=constrainedRecommendationSchema(empty.snapshot,[hardConditions(empty.snapshot.hotels[0],people,2027)],empty.sources);
assert.equal(emptySchema.properties.pending.items.anyOf[0].properties.citations.maxItems,0,'Unknown-only pending can still use [] but cannot invent a quotation.');
function noEmptyOptions(value){if(!value||typeof value!=='object')return;for(const k of ['anyOf','enum'])if(k in value)assert(value[k].length>0,'No empty '+k+' allowed in the real model schema.');if(value.type==='array'&&value.maxItems===0)assert(value.items&&typeof value.items==='object');for(const child of Object.values(value))if(Array.isArray(child))child.forEach(noEmptyOptions);else noEmptyOptions(child);}
noEmptyOptions(schema);noEmptyOptions(emptySchema);
// The model gets only selected/canonical packages, while the server keeps every
// original page for strict validation and saved-offer coverage accounting.
const context=buildModelRecommendationContext(snapshot,checks,sources);
assert.equal(context.hotels.reduce((n,h)=>n+h.quoteBundle.offers.length,0),6);assert.equal([...context.sources.values()].filter(s=>s.kind==='platform_room_page').length,6);
assert([...context.sources.values()].filter(s=>s.kind==='platform_room_page').every(s=>!s.text.includes('页面采集原文')&&!s.text.includes('RAW_PAGE_SENTINEL')));
assert.equal(context.hotels.reduce((n,h)=>n+h.quoteBundle.other_offer_summary.captured_offer_count,0),57);
for(const h of context.hotels)for(const e of h.evidence){assert.equal(context.sources.get(e.id).room,e.room);assert.equal(context.sources.get(e.id).date,e.date);assert.equal(context.sources.get(e.id).text,e.text);}
assert.equal(context.schema.properties.offer_assessments.maxItems,0);assert.equal(context.schema.properties.review_assessments.type,'object');assert.deepEqual(context.schema.properties.review_assessments.required,['a','b','c']);
assert.equal(context.schema.properties.pending.maxItems,0);assert.equal(context.schema.properties.limitations.maxItems,0);
for(const item of context.schema.properties.verification_shortlist.items.anyOf)assert.equal(item.properties.verify_next.maxItems,0);
noEmptyOptions(context.schema);
assert(JSON.stringify({hotels:context.hotels,sources:Object.fromEntries(context.sources),schema:context.schema}).length<JSON.stringify({hotels:snapshot.hotels,sources:Object.fromEntries(sources),schema}).length/4,'Compression must materially reduce prompt characters without claiming a token count.');
const candidates=verificationShortlistPool(snapshot,checks);
function modelAnswer(s=snapshot,cs=candidates){return {summary:'模拟解读',review_assessments:Object.fromEntries(s.hotels.map(h=>[h.id,'目标房型正面反馈和其他房型反例应分开看，少量评价不保证未来入住。'])),offer_assessments:[],recommendations:[],verification_shortlist:cs.slice(0,2).map((p,i)=>{const o=s.hotels.find(h=>h.id===p.hotel_id).quoteBundle.offers.find(o=>o.id===p.selected_offer_id);return {hotel_id:p.hotel_id,decision_scope:'verification_only',price_basis:'room_page_reference',headline:i?'备选核实候选':'优先核实候选',reasons:s.people.map(member=>({member_id:member.id,explanation:'已取得对应套餐参考价，必要设施仍待核实。',citations:[{source_id:globalThis.StayQuoteEvidence.sourceId(p.hotel_id,o),quote:globalThis.StayQuoteEvidence.text(o).split('\n').find(s=>s.startsWith('房型页参考价：'))}]})),verify_next:[]};}),pending:[],not_selected:[],limitations:[]};}
const assembled=assembleRecommendationResult(modelAnswer(),snapshot,sources);
assert.equal(assembled.recommendations.length,0);assert.equal(assembled.offer_assessments.length,3);assert.equal(assembled.review_assessments.length,3);
for(const h of snapshot.hotels){const a=assembled.offer_assessments.find(a=>a.hotel_id===h.id);assert.deepEqual(new Set(a.citations.map(c=>sources.get(c.source_id).provider)),new Set(['ctrip','tongcheng']));const r=assembled.review_assessments.find(r=>r.hotel_id===h.id);assert.deepEqual(new Set(r.citations.map(c=>c.source_id)),new Set(h.evidence.map(e=>e.id)));for(const c of r.citations)assert(sources.get(c.source_id).text.includes(c.quote));}
for(const item of assembled.verification_shortlist)assert.deepEqual(item.verify_next,canonicalVerificationQuestions(candidates.find(p=>p.hotel_id===item.hotel_id)));
const knownFacts=structuredClone(raw);knownFacts.hotels[0].facts.smart=true;knownFacts.hotels[0].facts.quiet=true;knownFacts.hotels[1].facts.smart=false;knownFacts.people[0].conditions=[{id:'quiet',mode:'must'}];
const knownData=validateSnapshot(knownFacts),knownChecks=knownData.snapshot.hotels.map(h=>hardConditions(h,knownData.snapshot.people,2027)),knownPool=verificationShortlistPool(knownData.snapshot,knownChecks),oldQuestions=modelAnswer(knownData.snapshot,knownPool);
oldQuestions.pending=[{hotel_id:'a',question:'请确认是否有智能马桶和安静资料。',citations:[]}];oldQuestions.limitations=['所有目标房型都没有安静资料，双方都把早餐当底线。'];
const knownResult=assembleRecommendationResult(oldQuestions,knownData.snapshot,knownData.sources);
assert(!knownResult.pending.filter(p=>p.hotel_id==='a').some(p=>/智能马桶|隔音|安静/.test(p.question)));
const explicitSmartConflict=knownResult.pending.find(p=>p.hotel_id==='b'&&p.question.includes('智能马桶'));assert(explicitSmartConflict);assert(explicitSmartConflict.question.startsWith('明确冲突'));assert(!explicitSmartConflict.question.includes('需确认是否'));
assert(knownResult.pending.every(p=>p.citations.length===0));assert(knownResult.limitations.some(s=>s.includes('正向反馈和反例')));assert(!knownResult.limitations.some(s=>/所有目标房型都没有|双方都把|都要求早餐/.test(s)));
const badOldQuestion=structuredClone(oldQuestions);badOldQuestion.pending[0].citations=[{source_id:'review-b-0',quote:'模拟住客b0的原话，房间体验有个人差异。'}];assert.throws(()=>assembleRecommendationResult(badOldQuestion,knownData.snapshot,knownData.sources),e=>e.code==='unverified_citation');
const fields=input=>input.hotels.forEach(h=>{h.facts.invoice=null;h.facts.lateCheckin=null;});
const invoiceRaw=structuredClone(raw);invoiceRaw.people[0].conditions=[{id:'invoice',mode:'must'},{id:'lateCheckin',mode:'must'}];fields(invoiceRaw);
const invoice=validateSnapshot(invoiceRaw),invoiceChecks=invoice.snapshot.hotels.map(h=>hardConditions(h,invoice.snapshot.people,2027)),invoicePool=verificationShortlistPool(invoice.snapshot,invoiceChecks);
const invoiceAnswer=modelAnswer(invoice.snapshot,invoicePool);assert.doesNotThrow(()=>assembleRecommendationResult(invoiceAnswer,invoice.snapshot,invoice.sources));
const badClaim=structuredClone(invoiceAnswer);badClaim.verification_shortlist[0].reasons[0].explanation='已确认能开所需发票并支持晚到入住。';assert.throws(()=>assembleRecommendationResult(badClaim,invoice.snapshot,invoice.sources),e=>e.code==='unsafe_verification_claim'&&e.verification_issue.section==='reason');
const listLimited=structuredClone(invoiceAnswer);listLimited.verification_shortlist[0].reasons[0].explanation='当前参考价可用于初筛，但“可开所需发票”“支持晚到入住”“潮味／霉味反馈”仍待确认。';assert.doesNotThrow(()=>assembleRecommendationResult(listLimited,invoice.snapshot,invoice.sources));
const quietRaw=structuredClone(invoiceRaw);quietRaw.people[0].conditions.push({id:'quiet',mode:'must'});quietRaw.hotels[0].evidence[0].text='【公开住客评价短引＋人工说明】\n住客短引：“环境安静舒适”。\n人工说明：仅当时房型体验，非保证。';
const quietData=validateSnapshot(quietRaw),quietChecks=quietData.snapshot.hotels.map(h=>hardConditions(h,quietData.snapshot.people,2027)),quietPool=verificationShortlistPool(quietData.snapshot,quietChecks),quietAnswer=modelAnswer(quietData.snapshot,quietPool);
quietAnswer.verification_shortlist[0].reasons[0].explanation='同名房型有“环境安静舒适”的正向住客短引，但这条只说明当时那次体验，不能当作当前房型已确认隔音，所以值得优先核实。';quietAnswer.verification_shortlist[0].reasons[0].citations.push({source_id:quietRaw.hotels[0].evidence[0].id,quote:'环境安静舒适'});assert.doesNotThrow(()=>assembleRecommendationResult(quietAnswer,quietData.snapshot,quietData.sources));
for(const explanation of ['不是未知，配备智能马桶。','配备智能马桶，而发票仍待确认。','不是未知，支持晚到入住。','有“环境安静舒适”的住客短引，因此当前房型隔音很好。']){const opposite=structuredClone(quietAnswer);opposite.verification_shortlist[0].reasons[0].explanation=explanation;assert.throws(()=>assembleRecommendationResult(opposite,quietData.snapshot,quietData.sources),e=>e.code==='unsafe_verification_claim');}
const duplicatedProvider=modelAnswer();duplicatedProvider.offer_assessments=snapshot.hotels.map(canonicalQuoteAssessment);duplicatedProvider.offer_assessments[0].citations[1]=duplicatedProvider.offer_assessments[0].citations[0];assert.throws(()=>assembleRecommendationResult(duplicatedProvider,snapshot,sources),e=>e.code==='missing_platform_evidence');
const badReview=modelAnswer();badReview.review_assessments=[{hotel_id:'a',explanation:'模拟',citations:[{source_id:'review-b-0',quote:'模拟住客b0的原话，房间体验有个人差异。'}]}];assert.throws(()=>assembleRecommendationResult(badReview,snapshot,sources),e=>e.code==='unverified_citation');
assert.equal(JSON.stringify(raw),before);
const gap={recommendations:[],pending:[{hotel_id:'empty',question:'核对缺口',citations:[{source_id:'hotel:empty',quote:'对应房型智能马桶：待确认'}]}]};
assert.throws(()=>checkRecommendation(gap,empty.snapshot,empty.sources),e=>e.code==='unverified_citation'&&e.citation_issue.reason==='gap_not_evidence');
assert.equal(gap.pending[0].citations.length,1,'A bad citation is rejected, never silently removed.');
assert.equal(JSON.stringify(raw),before);

// Diagnostics contain only codes, bounded attempt status/reason, and an API
// request ID. Never the submitted names, quote/source text, headers or key.
const warnings=[],oldWarn=console.warn;let calls=0;
console.warn=value=>warnings.push(String(value));
let response;
try{
 response=await handleAIRequest(new Request('https://fixture.test/api/ai/recommend',{method:'POST',headers:{'x-private':'HEADER_PRIVATE'},body:JSON.stringify(raw)}),{OPENAI_API_KEY:'KEY_PRIVATE_MOCK'},{local:true,fetcher:async()=>{
  calls++;return Response.json({status:'completed',id:'resp_mock_'+calls,model:'mock',output:[{content:[{type:'output_text',text:JSON.stringify({recommendations:[],pending:[{hotel_id:'a',question:'核实缺口',citations:[{source_id:'review-a-0',quote:'QUOTE_PRIVATE_NOT_IN_SOURCE'}]}],not_selected:[]})}]}]});
 }});
}finally{console.warn=oldWarn;}
assert.equal(response.status,502);assert.equal(calls,2);assert.equal(warnings.length,1);
const diagnostic=JSON.parse(warnings[0]);assert.equal(diagnostic.action,'recommend');assert.equal(diagnostic.error_code,'unverified_citation');assert.equal(diagnostic.attempts.length,2);assert.equal(diagnostic.attempts[1].request_id,'resp_mock_2');assert(diagnostic.attempts.every(a=>a.status==='rejected'&&a.citation_issue_reason==='quote_not_in_source'));
for(const marker of ['PERSON_PRIVATE','PRIVATE_HOTEL','QUOTE_PRIVATE','HEADER_PRIVATE','KEY_PRIVATE','review-a-0','RAW_PAGE_SENTINEL'])assert(!warnings[0].includes(marker));
let observedPrompt,observedSchema;
const successful=await handleAIRequest(new Request('https://fixture.test/api/ai/recommend',{method:'POST',body:JSON.stringify(raw)}),{OPENAI_API_KEY:'mock-only'},{local:true,fetcher:async(_url,options)=>{const request=JSON.parse(options.body);observedPrompt=JSON.parse(request.input[0].content[0].text);observedSchema=request.text.format.schema;return Response.json({status:'completed',id:'resp_mock_success',model:'mock',output:[{content:[{type:'output_text',text:JSON.stringify(modelAnswer())}]}]});}});
assert.equal(successful.status,200);const successfulBody=await successful.json();assert(Array.isArray(successfulBody.result.review_assessments));assert.equal(successfulBody.result.review_assessments.length,3);assert.equal(successfulBody.result.offer_assessments.length,3);assert.equal(successfulBody.result.verification_shortlist.length,2);
assert.equal(successfulBody.quote_coverage.reduce((n,h)=>n+h.offer_count,0),57);assert.equal(successfulBody.quote_coverage.reduce((n,h)=>n+h.model_offer_count,0),6);assert.equal(Object.keys(successfulBody.quote_sources).length,57);assert.equal(observedPrompt.hotels.reduce((n,h)=>n+h.quoteBundle.offers.length,0),6);assert.equal(observedSchema.properties.review_assessments.type,'object');assert.equal(observedSchema.properties.offer_assessments.maxItems,0);assert.equal(JSON.stringify(raw),before);
assert.equal(observedSchema.properties.pending.maxItems,0);assert.equal(observedSchema.properties.limitations.maxItems,0);
const owned=observedPrompt.member_requirements;assert(!owned[0].required_condition_ids.includes('breakfast'));assert(owned[1].required_condition_ids.includes('breakfast'));assert(!owned[0].required_condition_ids.includes('freeCancel'));assert(owned[1].required_condition_ids.includes('freeCancel'));
console.log('PASS paired citations, compact 57->6 model packages, original source/review metadata retention, deterministic provider/review coverage and verification questions, strict rejection of invalid legacy/model material, empty pending and sanitized diagnostics (mock only).');
