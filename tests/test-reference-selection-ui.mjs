import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

// Synthetic UI fixtures only: no API, browser or saved-state writes.
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let detailedCalls=0;
const hotels=[{id:'one',name:'模拟酒店甲',room:'旧房型',price:9999},{id:'two',name:'模拟酒店乙',room:'另一旧房型',price:null}];
const people=[{id:'person',name:'模拟同行人'}];
const ctx={console,Date,Map,Set,Number,E,state:{hotels,people,trip:{city:'模拟城市'},mode:'trip'},fingerprint:()=> 'current',resultHTML:()=>{detailedCalls++;return '<p>完整记录</p>';},citationsHTML:cs=>(cs||[]).map(c=>'<q>'+E(c.quote)+'</q>').join(''),HotelDecisionSummary:{build:()=>[]},comparisonHotels:()=>[],collectorHTML:()=>'',renderCompare:()=>{},render:()=>{}};
vm.createContext(ctx);
vm.runInContext(await readFile(new URL('../public/decision-ui.js',import.meta.url),'utf8'),ctx);
const recommendation=(id,amount,room)=>({hotel_id:id,headline:'结合已知设施与个人取舍选择',decision_scope:'reference_selection',price_basis:'room_page_reference',selected_offer_id:'offer-'+id,reference_cny_per_room_per_night:amount,target_room:room,reasons:[{member_id:'person',explanation:'所选套餐参考价在每间每晚预算内。',citations:[{source_id:'quote-'+id,quote:'原文依据'}]}],tradeoffs:[{explanation:'预订前复核实际可订性。',citations:[]}]});
function save(result,extra={}){ctx.state.aiResult={fingerprint:'current',data:{generated_at:'2026-10-27T00:00:00Z',...extra,result}};}
const picks=[recommendation('one',381,'返回的目标双床房'),recommendation('two',390,'返回的目标家庭房')];
save({decision_scope:'reference_selection',price_basis:'room_page_reference',recommendations:picks,verification_shortlist:[]});
const before=JSON.stringify(ctx.state);
let html=ctx.resultHTML();
assert(html.includes('已给出参考价首选和备选'));assert(html.includes('参考价首选'));assert(html.includes('参考价备选'));
assert(html.includes('返回的目标双床房'));assert(html.includes('返回的目标家庭房'));assert(html.includes('¥381'));assert(html.includes('¥390'));assert(html.includes('每间每晚'));
assert(html.includes('data-selected-offer="offer-one"'));assert(html.includes('原文依据'));assert(html.includes('模拟同行人'));
assert(!html.includes('旧房型'));assert(!html.includes('9999'));assert(!html.includes('¥null'));assert(!html.includes('已有1家正式候选'));
assert(html.includes('参考价不是最终应付价'));assert(!html.includes('同条件最低'));assert.equal(JSON.stringify(ctx.state),before);assert.equal(detailedCalls,1);

// Top-level response scope is sufficient; the amount never falls back to the
// hotel record, even when a returned reference amount is absent.
save({recommendations:[{...picks[0],reference_cny_per_room_per_night:null}],verification_shortlist:[]},{decision_scope:'reference_selection',price_basis:'room_page_reference'});
html=ctx.resultHTML();assert(html.includes('已有1家参考价候选'));assert(html.includes('参考价待确认'));assert(!html.includes('9999'));
save({decision_scope:'reference_selection',recommendations:[],verification_shortlist:[]});
html=ctx.resultHTML();assert(html.includes('参考价选择尚缺必要证据'));assert(!html.includes('尚不能给出正式首选'));assert(!html.includes('reference-selection-card'));

// Final/default saved responses retain their original display path.
save({recommendations:[{hotel_id:'one',headline:'默认范围结论'}],verification_shortlist:[]});
html=ctx.resultHTML();assert(html.includes('已有1家正式候选'));assert(!html.includes('reference-selection-card'));assert(html.includes('完整记录'));
save({recommendations:[],verification_shortlist:[]});html=ctx.resultHTML();assert(html.includes('尚不能给出正式首选、备选'));assert(!html.includes('参考价选择尚缺必要证据'));

// Returned strings are escaped and changed fingerprints still hide results.
save({decision_scope:'reference_selection',recommendations:[{...picks[0],target_room:'<script>房型</script>'}],verification_shortlist:[]});
html=ctx.resultHTML();assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));
ctx.state.aiResult.fingerprint='old';html=ctx.resultHTML();assert(html.includes('资料已更新'));assert(!html.includes('reference-selection-card'));

// Display readiness removes only the final-price gap in the explicit reference
// task. The summary engine's final eligibility and source rows remain intact.
let requestScope='reference_selection';ctx.aiRequestDecisionScope=()=>requestScope;
const readyRow={hotel:{id:'ready',name:'模拟参考价已齐',room:'模拟双床房',price:null,evidence:[],packageMatch:{enabled:true,selectedOffer:{id:'selected',listNightly:381},checks:[],requirements:{}}},code:'needs_evidence',formalEligible:false,budget:{basis:'reference',amount:381,ceiling:465,within:true},missing:[{key:'budget',label:'最终含税价（已有参考价仅用于初筛）'}],conflicts:[],known:[],optionalUnknown:[{key:'view',label:'景观符合期望'}]};
const rowBefore=JSON.stringify(readyRow);ctx.HotelDecisionSummary.build=()=>[readyRow];
assert.equal(ctx.referenceReady(readyRow),true);
html=ctx.decisionCardHTML(readyRow);assert(html.includes('参考价条件证据已齐，可生成选择'));assert(html.includes('decision-badge ready'));
assert(html.includes('最终含税应付价与完整取消责任仍需预订前核对'));assert(!html.includes('套餐已匹配 · 待核必要证据'));assert(!html.includes('房价或必要套餐信息仍需核对'));
assert(ctx.decisionSummaryHTML([readyRow.hotel]).includes('必要证据待核实 0 家'));assert.equal(readyRow.formalEligible,false);assert.equal(JSON.stringify(readyRow),rowBefore);
for(const key of ['smart','mold','quiet','invoice','metro','newness','breakfast']){
 const pendingRow={...readyRow,missing:[...readyRow.missing,{key,label:'仍待核实的必要条件'}]};
 assert.equal(ctx.referenceReady(pendingRow),false);ctx.HotelDecisionSummary.build=()=>[pendingRow];
 assert(ctx.decisionSummaryHTML([pendingRow.hotel]).includes('必要证据待核实 1 家'));assert(!ctx.decisionCardHTML(pendingRow).includes('参考价条件证据已齐'));
}
assert.equal(ctx.referenceReady({...readyRow,conflicts:[{key:'smart',label:'已知不符合'}]}),false);
assert.equal(ctx.referenceReady({...readyRow,budget:{...readyRow.budget,within:false}}),false);
assert.equal(ctx.referenceReady({...readyRow,budget:{...readyRow.budget,within:null}}),false);
assert.equal(ctx.referenceReady({...readyRow,hotel:{...readyRow.hotel,packageMatch:{enabled:true,selectedOffer:null}}}),false);
ctx.HotelDecisionSummary.build=()=>[readyRow];requestScope='final';assert.equal(ctx.referenceReady(readyRow),false);
assert(ctx.decisionSummaryHTML([readyRow.hotel]).includes('必要证据待核实 1 家'));assert(ctx.decisionCardHTML(readyRow).includes('套餐已匹配 · 待核必要证据'));
requestScope='reference_selection';ctx.state.mode='demo';assert.equal(ctx.referenceReady(readyRow),false);ctx.state.mode='trip';delete ctx.aiRequestDecisionScope;assert.equal(ctx.referenceReady(readyRow),false);
assert.equal(JSON.stringify(readyRow),rowBefore);

// A real package/summary path can match the adult-only quote even if an
// imported trip contains children. It must not advertise reference readiness.
const actual={console,Date,Map,Set,Number,URL,E,state:{mode:'trip',trip:{city:'模拟城市',checkin:'2027-03-01',checkout:'2027-03-03',rooms:1,adults:2,children:1},people:[{id:'p',name:'模拟同行人',budget:500,budgetHard:true,weights:{price:3},conditions:[]}],hotels:[]},aiRequestDecisionScope:()=> 'reference_selection',resultHTML:()=>'',comparisonHotels:()=>[],collectorHTML:()=>'',renderCompare:()=>{},render:()=>{},link:()=>''};
vm.createContext(actual);
for(const file of ['criteria.js','quote-evidence.js','engine.js','package-match.js','decision-summary.js','decision-ui.js'])vm.runInContext(await readFile(new URL('../public/'+file,import.meta.url),'utf8'),actual);
const trip=actual.state.trip,name='模拟有儿童行程酒店',room='模拟大床房';
const offer={id:'adult-offer',provider:'ctrip',hotel:name,room,bed:'1张大床',checkIn:trip.checkin,checkOut:trip.checkout,rooms:1,adults:2,children:0,currency:'CNY',stage:'room_list',listNightly:300,breakfastText:'无早餐',cancellation:'入住当天18:00前可免费取消',payment:'在线付',capturedAt:'2026-10-27T00:00:00Z',source:'https://hotels.ctrip.com/hotels/123.html',evidence:'模拟大床房 无早餐 入住当天18:00前可免费取消'};
const raw={id:'child-trip-hotel',name,room,city:trip.city,price:null,referencePrice:300,facts:{},evidence:[],quoteBundle:{query:{...trip},selected_offer_id:offer.id,offers:[offer]}};
const match=actual.HotelPackageMatch.build(raw,actual.state.people,trip),derived={...match.derivedHotel,packageMatch:match};
const actualRow=actual.HotelDecisionSummary.build([derived],actual.state.people,trip)[0],actualBefore=JSON.stringify({trip,raw,actualRow});
assert(match.selectedOffer,'This adult-only package otherwise passes the existing package checks.');
assert.deepEqual(Array.from(actualRow.missing,x=>x.key),['budget']);
assert.equal(actual.referenceReady(actualRow),false);
assert(!actual.decisionCardHTML(actualRow).includes('参考价条件证据已齐，可生成选择'));
assert(actual.decisionSummaryHTML([derived]).includes('必要证据待核实 1 家'));
assert.equal(JSON.stringify({trip,raw,actualRow}),actualBefore,'The guard must not alter trip, preference or hotel data.');
actual.state.trip={...trip,children:0};assert.equal(actual.referenceReady(actualRow),true);
delete actual.state.trip.children;assert.equal(actual.referenceReady(actualRow),true);

// The same selected package can retain a separately recorded final price in
// storage. Explicit reference selection must use its 300 reference amount,
// while preserving that stored final price and the demo/final view semantics.
const oldFinal={...raw,price:9999},storedBefore=JSON.stringify(oldFinal);
actual.state.hotels=[oldFinal];actual.comparisonHotels=()=>actual.state.hotels;
let scoped=actual.decisionScopedHotels()[0],scopedRow=actual.HotelDecisionSummary.build([scoped],actual.state.people,actual.state.trip)[0];
assert.equal(scoped.price,null);assert.equal(scoped.referencePrice,300);
assert.equal(scopedRow.budget.amount,300);assert.equal(scopedRow.budget.basis,'reference');assert.equal(scopedRow.budget.within,true);
assert.equal(scopedRow.conflicts.length,0);assert.equal(actual.referenceReady(scopedRow),true);
const {decisionConditions}=await import('../lib/hotel-ai.mjs');
const serverGuard=decisionConditions(scoped,actual.state.people,actual.state.trip,'reference_selection');
assert.equal(serverGuard.blocked.length,0);assert.equal(serverGuard.unknown.length,0);
const aiSource=await readFile(new URL('../public/ai.js',import.meta.url),'utf8');
vm.runInContext(aiSource.slice(aiSource.indexOf('function analysisHotels'),aiSource.indexOf('function aiRequestDecisionScope')),actual);
assert.equal(actual.analysisHotels()[0].price,null);assert.equal(actual.analysisHotels()[0].referencePrice,300);
assert.equal(oldFinal.price,9999);assert.equal(JSON.stringify(oldFinal),storedBefore);
actual.aiRequestDecisionScope=()=> 'final';scoped=actual.decisionScopedHotels()[0];assert.equal(scoped.price,9999);
actual.aiRequestDecisionScope=()=> 'reference_selection';actual.state.mode='demo';scoped=actual.decisionScopedHotels()[0];assert.equal(scoped.price,9999);
actual.state.mode='trip';delete actual.aiRequestDecisionScope;scoped=actual.decisionScopedHotels()[0];assert.equal(scoped.price,9999);
actual.aiRequestDecisionScope=()=> 'reference_selection';actual.state.hotels=[{...oldFinal,quoteBundle:null}];assert.equal(actual.decisionScopedHotels()[0].price,9999);
assert.equal(JSON.stringify(oldFinal),storedBefore);
console.log('PASS reference-scope UI ranks, returned room/reference amount, scoped readiness/counts, retained necessary gaps/final eligibility, escaped text and unchanged state/default rendering (mock only).');
