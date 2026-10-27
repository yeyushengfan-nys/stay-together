import assert from 'node:assert/strict';
import {validateSnapshot,decisionConditions,verificationShortlistPool,canonicalQuoteAssessment,checkRecommendation} from '../lib/hotel-ai.mjs';

// Synthetic fixtures reproducing the disclosed v56 sentence. No actual user
// reviews, network calls, API credentials or browser state are read or written.
const trip={city:'模拟城市',checkin:'2027-03-01',checkout:'2027-03-03',rooms:1,adults:2};
const name='模拟酒店',room='模拟大床房';
const people=[{id:'me',name:'我',budget:500,budgetHard:true,weights:{price:1},conditions:[]},{id:'friend',name:'朋友',budget:500,budgetHard:true,weights:{price:1},conditions:[{id:'quiet',mode:'must'},{id:'breakfast',mode:'must'}]}];
const quote='环境安静舒适';
const review={id:'review',confirmed:true,platform:'携程',room,date:'2026-10-01',text:'【公开住客评价｜合成测试节选】\n住客短引：环境安静舒适\n仅供离线测试，不能视为真实酒店评价。',claims:{}};
const offer={id:'offer',provider:'ctrip',hotel:name,room,bed:'1张大床',checkIn:trip.checkin,checkOut:trip.checkout,rooms:1,adults:2,children:0,currency:'CNY',stage:'room_list',listNightly:300,breakfastText:'2份早餐',cancellation:'入住当天18:00前可免费取消',payment:'在线付',capturedAt:'2026-10-27T00:00:00Z',source:'https://hotels.ctrip.com/hotels/99999999.html',evidence:'模拟大床房\n2份早餐\n入住当天18:00前可免费取消'};
const input=()=>({mode:'trip',decision_scope:'reference_selection',trip:structuredClone(trip),people:structuredClone(people),hotels:[{id:'h',name,room,city:trip.city,demo:false,price:null,facts:{quiet:null},evidence:[structuredClone(review)],quoteBundle:{query:structuredClone(trip),selected_offer_id:offer.id,offers:[structuredClone(offer)]}}]});
const actual='对朋友来说，这家同名目标房型有“环境安静舒适”的正向材料，且双早已在房型页出现；不过安静不是每次都能保证，清洁反例也存在，所以更适合先核实而不是直接定。';
const availability=[
 '对朋友来说，这家房型页带双早、可免费取消，且有同名房型的安静正向短引；虽然隔音还不能当作已确认，但从已知信息看，比完全没有安静线索的候选更适合先核实。',
 '朋友的硬条件里最核心的是安静和早餐；这家至少有同名目标房型的安静正向线索，虽然不能直接当作当前房型已确认隔音，但比完全没有同房型安静线索的候选更值得先核实。'
];
function candidate(normalized,statement=actual,{citeReview=true}={}){
 const {snapshot:s,sources}=normalized,h=s.hotels[0],selected=globalThis.StayQuoteEvidence.sourceId(h.id,h.quoteBundle.offers[0]),basis={source_id:selected,quote:sources.get(selected).text.split('\n').find(x=>x.startsWith('早餐页面文字：'))};
 const guest=h.evidence[0],guestQuote=guest.text.split('\n').find(x=>x.startsWith('住客短引：')).slice('住客短引：'.length);
 const checks=[decisionConditions(h,s.people,s.trip,s.decision_scope)],pool=verificationShortlistPool(s,checks)[0];
 return {decision_scope:'reference_selection',price_basis:'room_page_reference',summary:'资料仍需核实。',recommendations:[],verification_shortlist:[{hotel_id:'h',decision_scope:'verification_only',price_basis:'room_page_reference',headline:'优先核实候选',reasons:s.people.map(p=>({member_id:p.id,explanation:p.id==='friend'?statement:'对应套餐参考价在每间每晚预算内，仍需补齐必要证据。',citations:[basis,...(citeReview?[{source_id:guest.id,quote:guestQuote}]:[])]})),verify_next:pool.missing_conditions.map(condition=>({condition,question:'目标房型是否满足安静要求仍待核实。'}))}],review_assessments:[{hotel_id:'h',explanation:'该节选只反映作者当时的体验，不能推广到未来入住。',citations:[{source_id:guest.id,quote:guestQuote}]}],offer_assessments:[canonicalQuoteAssessment(h)],pending:[],not_selected:[],limitations:[]};
}
const raw=input(),before=JSON.stringify(raw),n=validateSnapshot(raw);
for(const statement of [actual,actual.replace('“环境安静舒适”','‘环境安静舒适’'),actual.replace('“环境安静舒适”',"'环境安静舒适'"),actual.replace('这家同名目标房型有','同一房型住客反馈有')]){
 const result=checkRecommendation(candidate(n,statement),n.snapshot,n.sources);
 assert.equal(result.recommendations.length,0);assert(result.condition_checks[0].unknown.some(x=>x.includes('安静')));
 assert.equal(n.snapshot.hotels[0].facts.quiet,null,'The quote exception is not a confirmed quiet fact.');
}
for(const statement of [...availability,availability[0].replace('安静正向短引','安静相关证据'),availability[1].replace('安静正向线索','安静正面反馈')]){
 const result=checkRecommendation(candidate(n,statement),n.snapshot,n.sources);
 assert.equal(result.recommendations.length,0);assert(result.condition_checks[0].unknown.some(x=>x.includes('安静')));
 assert.equal(n.snapshot.hotels[0].facts.quiet,null);
}
checkRecommendation(candidate(n,'安静是否满足仍待确认；比完全没有安静线索的候选更适合先核实。',{citeReview:false}),n.snapshot,n.sources);
for(const feedback of ['闹市里难得的安静','房间很安静','隔音很好']){
 const positive=input();positive.hotels[0].evidence[0].text=review.text.replace(quote,feedback);const normalized=validateSnapshot(positive);
 for(const statement of availability)checkRecommendation(candidate(normalized,statement),normalized.snapshot,normalized.sources);
}
assert.equal(JSON.stringify(raw),before);
for(const statement of [
 '这家同名目标房型有“环境安静舒适”的正向材料。',
 actual+'酒店已安静。',
 actual+'该房型已经确认安静。',
 actual+'因此朋友的安静必须项已经满足。',
 actual+'因此朋友的必须项已经满足。',
 actual+'所以朋友的底线全部达标。',
 actual+'因此符合朋友的安静底线。',
 '有“环境安静舒适”的评价，因此安静已确认；不过安静不是每次都保证。',
 '“环境安静舒适”已确认；不过安静不是每次都保证。',
 '该房型配备“环境安静舒适”的条件；不过安静不是每次都能保证。',
 availability[0]+'因此朋友的必须项已经满足。',
 availability[1]+'所以朋友的底线全部达标。',
 availability[0]+'安静已确认。',
 availability[1]+'保证本次隔音。',
 '该酒店没有安静房间，仍需核实其他条件。',
 '该房型不具备隔音，安静线索仍待确认。',
 '该房型有安静保障，仍需核实其他条件。',
 '完全没有安静线索，所以这间房型不安静。',
 '这家同名目标房型有“环境安静舒适”的正向材料，不过房价不能保证，清洁反例也存在。',
 '房间很安静，朋友可以放心入住。'
])assert.throws(()=>checkRecommendation(candidate(n,statement),n.snapshot,n.sources),e=>e.code==='unsafe_verification_claim',statement);

assert.throws(()=>checkRecommendation(candidate(n,actual,{citeReview:false}),n.snapshot,n.sources),e=>e.code==='unsafe_verification_claim','Attribution needs the same reason to cite the guest source.');
for(const statement of availability)assert.throws(()=>checkRecommendation(candidate(n,statement,{citeReview:false}),n.snapshot,n.sources),e=>e.code==='unsafe_verification_claim','Positive evidence availability needs its own reason citation.');
const unsupported=input();unsupported.hotels[0].evidence[0].text=review.text.replace(quote,'房间整洁舒适');const u=validateSnapshot(unsupported);
assert.throws(()=>checkRecommendation(candidate(u),u.snapshot,u.sources),e=>e.code==='unsafe_verification_claim','A literal but different citation cannot support the invented quiet quote.');
const otherRoom=input();otherRoom.hotels[0].evidence[0].room='另一双床房';const o=validateSnapshot(otherRoom);
assert.throws(()=>checkRecommendation(candidate(o),o.snapshot,o.sources),e=>e.code==='unsafe_verification_claim','Another room cannot become a same-target-room positive quote.');
for(const statement of availability){assert.throws(()=>checkRecommendation(candidate(o,statement),o.snapshot,o.sources),e=>e.code==='unsafe_verification_claim');assert.throws(()=>checkRecommendation(candidate(u,statement),u.snapshot,u.sources),e=>e.code==='unsafe_verification_claim');}
for(const feedback of ['不安静','并不安静','环境不够安静','房间不是很安静','环境没有那么安静','房间并没有很安静','隔音差','没有说不安静','我喜欢安静','安静是我的要求，结果太吵了']){
 const negative=input();negative.hotels[0].evidence[0].text=review.text.replace(quote,feedback);const normalized=validateSnapshot(negative);
 for(const statement of availability)assert.throws(()=>checkRecommendation(candidate(normalized,statement),normalized.snapshot,normalized.sources),e=>e.code==='unsafe_verification_claim','Not a positive quiet observation: '+feedback);
}
const wrongSources=new Map(n.sources);wrongSources.set('review',{...n.sources.get('review'),hotel_id:'another-hotel'});
assert.throws(()=>checkRecommendation(candidate(n),n.snapshot,wrongSources),e=>e.code==='unverified_citation');
for(const statement of availability)assert.throws(()=>checkRecommendation(candidate(n,statement),n.snapshot,wrongSources),e=>e.code==='unverified_citation');
const factual=input();factual.hotels[0].evidence[0]={...review,text:'【用户填写的设施资料】\n住客短引：环境安静舒适',platform:'酒店资料'};const f=validateSnapshot(factual);
assert.throws(()=>checkRecommendation(candidate(f,actual),f.snapshot,f.sources),e=>e.code==='unsafe_verification_claim','A non-review source cannot use the new current-room guest-quote exception.');
for(const statement of availability)assert.throws(()=>checkRecommendation(candidate(f,statement),f.snapshot,f.sources),e=>e.code==='unsafe_verification_claim');
const web=input();web.hotels[0].evidence[0].webResearch=true;const w=validateSnapshot(web);
for(const statement of availability)assert.throws(()=>checkRecommendation(candidate(w,statement),w.snapshot,w.sources),e=>e.code==='unsafe_verification_claim');
const policySources=new Map(n.sources);policySources.set('review',{...n.sources.get('review'),kind:'platform_policy'});
for(const statement of availability)assert.throws(()=>checkRecommendation(candidate(n,statement),n.snapshot,policySources),e=>e.code==='unsafe_verification_claim');
console.log('PASS literal current-room guest quiet quote with explicit uncertainty; unknown guard retained; no guarantee/promotion, wrong room/hotel/source, unsupported quote or uncited-evidence bypass (synthetic only).');
