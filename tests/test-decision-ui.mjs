import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
// Synthetic fixtures only. No browser, network, private material or AI calls.
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const trip={city:'模拟城市',checkin:'2026-12-24',checkout:'2026-12-28',rooms:1,adults:2};
const person={id:'p1',name:'模拟同行人',budget:465,budgetHard:true,requireSmart:true,avoidMold:true,conditions:[{id:'breakfast',mode:'must'},{id:'freeCancel',mode:'must'},{id:'quiet',mode:'must'}],weights:{price:1,transit:0,newness:0,facilities:1}};
const ctx={console,Date,Map,Set,Number,URL,structuredClone,resultHTML:()=>'<p>Full audit</p>',collectorHTML:()=>'<p>Collector</p>',renderCompare:()=>{},render:()=>{},state:{people:[person],trip,hotels:[]},E,link:()=>'<a>Source</a>',comparisonHotels:()=>ctx.hotels,collectorJob:null,collectorConnected:false,collectorVersion:'0.2.5',collectorError:'',collectorActive:[],collectorPaused:[],collectorSameQuery:()=>true};
vm.createContext(ctx);
for(const file of ['quote-evidence.js','criteria.js','engine.js','decision-summary.js','package-match.js','decision-ui.js'])vm.runInContext(await readFile(new URL('../public/'+file,import.meta.url),'utf8'),ctx);
const PM=ctx.HotelPackageMatch;
function offer(id,provider,room,price,breakfast='无早餐',cancellation='入住当天18:00前可免费取消'){
 return {id,provider,platform:provider==='ctrip'?'携程':'同程',hotel:'模拟酒店甲',room,bed:room,listNightly:price,breakfastText:breakfast,breakfast:breakfast==='2份早餐'?2:breakfast==='1份早餐'?1:0,cancellation,payment:'在线付',adults:2,capturedAt:'2026-10-26T07:00:00Z',evidence:room+'\n'+breakfast+'\n'+cancellation,checkIn:trip.checkin,checkOut:trip.checkout,rooms:1,children:0,currency:'CNY',stage:'room_list',source:provider==='ctrip'?'https://hotels.ctrip.com/hotels/123.html':'https://www.ly.com/hotel/hoteldetail?hotelId=456'};
}
function hotel(offers,name='模拟酒店甲'){
 return {id:name,name,room:offers[0]?.room||'双床房',referencePrice:offers[0]?.listNightly??null,price:null,quoteBundle:{query:{...trip},selected_offer_id:offers[0]?.id||'',offers:offers.map(o=>({...o,hotel:name}))},evidence:[],facts:{smart:null,mold:null,quiet:true}};
}
const summary=h=>ctx.HotelDecisionSummary.build([h],ctx.state.people,trip)[0];
const htmlFor=h=>ctx.decisionCardHTML(summary(h)),primary=html=>html.split('<details')[0];
// A legacy fallback selected ID is not proof of matching current requirements.
const noMeals=hotel([offer('ct','ctrip','双床房',284),offer('tc','tongcheng','双床房',298)]);
const before=JSON.stringify({noMeals,people:ctx.state.people,trip});
let match=PM.build(noMeals,ctx.state.people,trip);
assert.equal(match.selectedOffer,null);assert.equal(match.fallbackOffer.id,'ct');assert.equal(match.scanned,2);
assert.equal(match.noMatchReasons[0].key,'breakfast');assert.match(match.noMatchReasons[0].label,/均无早餐.*2成人/);
ctx.hotels=[noMeals];let scoped=ctx.decisionScopedHotels()[0],html=htmlFor(scoped);
assert.match(primary(html),/未找到匹配套餐/);assert.match(primary(html),/当前没有匹配报价/);
assert.match(primary(html),/所需套餐预算尚不能判断/);assert(!primary(html).includes('¥284'));assert(!primary(html).includes('¥298'));
assert(!html.includes('不符合当前要求'));assert(!primary(html).includes('参考价在预算内'));
assert(html.includes('查看非匹配套餐参考价'));assert(html.includes('¥284'));assert(html.includes('¥298'));assert(html.includes('需2份（2成人）'));
assert(primary(html).includes('智能马桶'));assert(primary(html).includes('目标房型异味反馈'));assert(primary(html).includes('隔音有住客正向反馈'));
assert.equal(JSON.stringify({noMeals,people:ctx.state.people,trip}),before);
const record=ctx.collectorReferenceHTML({query:trip});assert(record.includes('非匹配套餐参考价'));assert(!record.includes('未通过本次房型条件'));
// The zero-match state is deterministic and does not need another AI request.
ctx.hotels=[noMeals,hotel([offer('ct-b','ctrip','双床房',180),offer('tc-b','tongcheng','双床房',179)],'模拟酒店乙'),hotel([offer('ct-c','ctrip','双床房',319),offer('tc-c','tongcheng','双床房',333)],'模拟酒店丙')];
html=ctx.decisionSummaryHTML(ctx.decisionScopedHotels());assert(html.includes('已查 3 家'));assert(html.includes('套餐匹配 0 家'));assert(html.includes('必要证据待核实 3 家'));
assert(html.includes('这轮没有找到符合要求的套餐'));assert(html.includes('不表示酒店没有其他套餐'));assert(!html.includes('家有明确不符合项'));
// Eight failed inspections stay available but collapsed, with no failure cards
// pushed into the initial primary view. Counts must still disclose all eight.
const noMealEight=Array.from({length:8},(_,i)=>hotel([offer('ct-'+i,'ctrip','双床房',200+i)],'模拟未匹配酒店'+i));
ctx.hotels=noMealEight;html=ctx.decisionSummaryHTML(ctx.decisionScopedHotels());
let recordAt=html.indexOf('<details class="decision-details decision-checked-record">');
assert(recordAt>0);assert(html.includes('已查 8 家'));assert(html.includes('套餐匹配 0 家'));assert(html.includes('查看已查 8 家与非匹配套餐记录'));
assert(!html.slice(0,recordAt).includes('data-decision-hotel='));assert(!html.includes('decision-primary-grid'));
assert.equal((html.match(/data-decision-hotel=/g)||[]).length,8);assert(!html.includes('decision-checked-record" open'));
// Inspect every captured plan. Prefer matching meal counts and cancellation text.
const expanded=hotel([offer('ct-cheap','ctrip','大床房',120),offer('ct-good','ctrip','双床房',381,'2份早餐'),offer('tc-cheap','tongcheng','大床房',99),offer('tc-different','tongcheng','双床房',350,'2份早餐','入住日12:00前免费取消'),offer('tc-matching','tongcheng','双床房',390,'双早','入住当日18:00前免费取消')]);
ctx.hotels=[expanded];scoped=ctx.decisionScopedHotels()[0];match=scoped.packageMatch;
assert.equal(scoped.room,'双床房');assert.equal(match.selectedOffer.id,'ct-good');assert.equal(match.offersByProvider.tongcheng.id,'tc-matching');
assert.equal(scoped.facts.breakfast,true);assert.equal(scoped.facts.freeCancel,true);
let selected=ctx.decisionOffers(scoped);assert.equal(selected[0].id,'ct-good');assert.equal(selected[1].id,'tc-matching');
assert(!ctx.decisionPriceNote(selected).includes('不同'));assert(ctx.decisionPriceNote(selected).includes('税费未核对'));
html=htmlFor(scoped);assert(primary(html).includes('¥381'));assert(primary(html).includes('¥390'));assert(!primary(html).includes('¥99'));
assert(primary(html).includes('套餐已匹配'));assert(primary(html).includes('匹配套餐参考价在预算内'));assert(!summary(scoped).formalEligible);
assert(!primary(html).includes('资料显示满足要求'));
// Matching plans are primary even when discovered later. Show at most three;
// extra matching records and nonmatching records remain in collapsed history.
ctx.hotels=[...noMealEight.slice(0,4),...Array.from({length:4},(_,i)=>hotel([offer('good-'+i,'ctrip','双床房',300+i,'2份早餐')],'模拟匹配酒店'+i))];
html=ctx.decisionSummaryHTML(ctx.decisionScopedHotels());recordAt=html.indexOf('<details class="decision-details decision-checked-record">');
assert(html.includes('已查 8 家'));assert(html.includes('套餐匹配 4 家'));assert(html.includes('其余已查记录（5 家，其中套餐匹配 1 家）'));
assert.equal((html.slice(0,recordAt).match(/data-decision-hotel=/g)||[]).length,3);assert(html.slice(0,recordAt).includes('模拟匹配酒店0'));assert(!html.slice(0,recordAt).includes('模拟未匹配酒店0'));
assert.equal((html.match(/data-decision-hotel=/g)||[]).length,8);
assert(!ctx.collectorHTML().includes('undefined'));
const oldRoomEvidence={...expanded,facts:{...expanded.facts,smart:true},evidence:[{id:'old-room-proof',room:'大床房',confirmed:true,claims:{smart:true}}]};
const reselected=PM.build(oldRoomEvidence,[person],trip).derivedHotel;
assert.equal(reselected.facts.smart,null);assert.equal(reselected.evidence[0].confirmed,false);assert.equal(oldRoomEvidence.facts.smart,true);assert.equal(oldRoomEvidence.evidence[0].confirmed,true);
// Different free-cancel times are known differences, despite both being true.
selected=[offer('a','ctrip','双床房',300,'2份早餐','入住日12:00前免费取消'),offer('b','tongcheng','双床房',280,'2份早餐','入住当天18:00前可免费取消')];
assert(ctx.decisionPriceNote(selected).includes('取消条件不同'));assert(ctx.decisionPriceNote(selected).includes('不直接比价'));
assert.equal(PM.cancellationKey(offer('a','ctrip','双床房',300,'2份早餐','入住日18:00前免费取消')),PM.cancellationKey(offer('b','tongcheng','双床房',280,'2份早餐','入住当天18:00前可免费取消')));
assert(ctx.decisionPriceNote([offer('a','ctrip','双床房',300,'早餐份数未注明'),offer('b','tongcheng','双床房',280,'早餐份数未注明')]).includes('早餐份数未核清'));
assert(ctx.decisionPriceNote([offer('a','ctrip','双床房',300,'2份早餐','未注明'),offer('b','tongcheng','双床房',280,'2份早餐','未注明')]).includes('取消条件未注明'));
// One breakfast, over-budget prices, expired windows and single beds cannot match.
assert.equal(PM.build(hotel([offer('one','ctrip','双床房',300,'1份早餐')]),[person],trip).selectedOffer,null);
assert.match(PM.build(hotel([offer('one','ctrip','双床房',300,'1份早餐')]),[person],trip).checks[0].fail[0].label,/仅1份.*需2份/);
assert.equal(PM.build(hotel([offer('over','ctrip','双床房',466,'2份早餐')]),[person],trip).selectedOffer,null);
assert.equal(PM.build(hotel([offer('expired','ctrip','双床房',300,'2份早餐','10月26日12:00前免费取消')]),[person],trip).selectedOffer,null);
assert.equal(PM.build(hotel([offer('king','ctrip','大床房',300,'2份早餐')]),[{...person,conditions:[...person.conditions,{id:'twinBeds',mode:'must'}]}],trip).selectedOffer,null);
match=PM.build(expanded,[{...person,conditions:[...person.conditions,{id:'twinBeds',mode:'must'}]}],trip);assert(match.selectedOffer);assert.equal(match.derivedHotel.facts.twinBeds,true);
// No breakfast requirement permits no-meal plans without changing saved settings.
const noMealRequirement={...person,conditions:person.conditions.filter(c=>c.id!=='breakfast')};
assert(PM.build(noMeals,[noMealRequirement],trip).selectedOffer);assert.equal(PM.build(noMeals,[noMealRequirement],trip).derivedHotel.facts.smart,null);
assert.equal(person.conditions.find(c=>c.id==='breakfast').mode,'must');
// Never borrow another room's platform price; stale dates clear the view copy.
const oneRoomOnly=hotel([offer('ct-twin','ctrip','双床房',381,'2份早餐'),offer('tc-king','tongcheng','大床房',99)]);
ctx.hotels=[oneRoomOnly];scoped=ctx.decisionScopedHotels()[0];assert.equal(ctx.decisionOffers(scoped)[1],null);assert(!primary(htmlFor(scoped)).includes('¥99'));
const stale=structuredClone(expanded);stale.quoteBundle.query.checkin='2026-12-20';ctx.hotels=[stale];scoped=ctx.decisionScopedHotels()[0];assert.equal(scoped.referencePrice,null);assert.equal(scoped.facts.breakfast,null);assert.equal(stale.referencePrice,120);
ctx.hotels=[hotel([])];assert.equal(ctx.decisionScopedHotels()[0].referencePrice,null);
const noPrice=hotel([offer('none','ctrip','双床房',null,'2份早餐')]);assert.equal(PM.build(noPrice,[{...noMealRequirement,budgetHard:false}],trip).selectedOffer,null);
// Manual/demo entries retain the original eligibility rules.
ctx.hotels=[{id:'demo',name:'虚构演示',demo:true,room:'模拟房型',price:300,evidence:[],facts:{breakfast:true,freeCancel:true,smart:true,mold:false,quiet:true}}];
scoped=ctx.decisionScopedHotels()[0];assert(!scoped.packageMatch);assert(summary(scoped).formalEligible);assert(htmlFor(scoped).includes('满足演示条件'));
for(const file of ['index.html','workspace.html']){const source=await readFile(new URL('../public/'+file,import.meta.url),'utf8');assert(!source.includes('src="live-prices.js"'));assert(!source.includes('src="price-entry.js"'));assert.equal((source.match(/src="quote-evidence.js"/g)||[]).length,1);assert(source.indexOf('decision-summary.js')<source.indexOf('decision-ui.js'));assert(source.indexOf('package-match.js')>source.indexOf('quote-evidence.js'));assert(source.indexOf('package-match.js')<source.indexOf('decision-ui.js'));}
// A verification order is useful without pretending unknown requirements passed.
const verifyHotel=hotel([offer('verify-ct','ctrip','双床房',381,'2份早餐'),offer('verify-tc','tongcheng','双床房',390,'2份早餐')]);
ctx.hotels=[verifyHotel];ctx.state.hotels=[verifyHotel];ctx.citationsHTML=cs=>cs.map(c=>'<button>'+E(c.quote)+'</button>').join('');ctx.fingerprint=()=> 'current';
const verification={hotel_id:verifyHotel.id,decision_scope:'verification_only',price_basis:'room_page_reference',headline:'优先核实候选',reasons:[{member_id:person.id,explanation:'套餐显示双早，房型参考价在预算内；智能马桶仍需核实。',citations:[{source_id:'example',quote:'早餐页面文字：2份早餐'}]}],verify_next:[{condition:'smart',question:'请确认这间双床房是否配备智能马桶。'},{condition:'budget',question:'预订前核对最终税费。'}]};
ctx.state.aiResult={fingerprint:'current',data:{generated_at:'2026-10-27T00:00:00Z',result:{recommendations:[],verification_shortlist:[verification]}}};
html=ctx.resultHTML();assert(html.includes('AI 建议先核实这1家'));assert(html.includes('正式入住条件仍未核齐'));assert(html.includes('已整理优先核实清单'));assert(html.includes('不代表已满足入住要求'));assert(html.includes('下一步'));assert(html.includes('其余 1 项核实任务'));assert(html.includes('早餐页面文字：2份早餐'));assert(!html.includes('已有1家正式候选'));
// A stale or tampered saved shortlist cannot bypass current exclusions.
ctx.hotels=[{...verifyHotel,facts:{...verifyHotel.facts,smart:false}}];assert(!ctx.resultHTML().includes('verification-card'));
ctx.hotels=[hotel([offer('over','ctrip','双床房',500,'2份早餐')])];assert(!ctx.resultHTML().includes('verification-card'));
ctx.hotels=[noMeals];assert(!ctx.resultHTML().includes('verification-card'));
ctx.hotels=[verifyHotel];ctx.state.aiResult.fingerprint='older';assert(!ctx.resultHTML().includes('verification-card'));assert(ctx.resultHTML().includes('资料已更新'));
ctx.state.aiResult.fingerprint='current';ctx.state.aiResult.data.result.verification_shortlist[0].reasons[0].explanation='<script>alert(1)</script>';html=ctx.resultHTML();assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));
delete ctx.state.aiResult.data.result.verification_shortlist;assert(!ctx.resultHTML().includes('verification-card'));
console.log('PASS current-preference package matching across all captured plans; adult breakfast counts, budgets, beds and cancellation windows; same-package display; secondary nonmatching prices; visible evidence gaps; unchanged saved data (synthetic fixtures).');
