import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

// Entirely synthetic fixtures. This test does not read saved state, credentials,
// or real hotel evidence, and never calls a network or model API.
const trip={city:'模拟城市',checkin:'2027-03-01',checkout:'2027-03-03',rooms:1,adults:2,children:0};
const people=[{id:'synthetic-member',name:'模拟同行人',budget:500,budgetHard:false,weights:{price:3,transit:2,newness:0,facilities:4},conditions:[{id:'invoice',mode:'must'},{id:'lateCheckin',mode:'must'}]}];
const scope={version:1,provider:'ctrip',hotel:'模拟酒店',room:'模拟大床房',checkin:trip.checkin,checkout:trip.checkout,rooms:1,adults:2,children:0,breakfastCount:2,paymentBasis:'online',requiresPaidConfirmed:true,offerId:'ct-plan'};
const policyText='【平台官方政策确认，非住客评价】\n仅供离线测试的合成资料，不能作为真实酒店或平台政策。仅限上述携程套餐；需已付款且预订成功，发票由平台按订单规则开具；晚到入住需保持已确认订单并提前联系酒店。';
const offer={id:'ct-plan',provider:'ctrip',hotel:scope.hotel,room:scope.room,bed:'1张1.8米大床',checkIn:trip.checkin,checkOut:trip.checkout,rooms:1,adults:2,children:0,currency:'CNY',stage:'room_list',listNightly:381,breakfast:2,breakfastText:'2份早餐',cancellation:'入住当天18:00前可免费取消',payment:'在线付',capturedAt:'2026-10-27T00:00:00Z',source:'https://hotels.ctrip.com/hotels/99999999.html',evidence:'合成测试套餐：模拟大床房；2份早餐；在线付；入住当天18:00前可免费取消。'};
const clone=value=>structuredClone(value);
function hotel(){return {id:'synthetic-policy-hotel',name:scope.hotel,city:trip.city,room:scope.room,price:432,referencePrice:381,metro:5,demo:false,facts:{invoice:true,lateCheckin:true},evidence:[{id:'synthetic-policy',kind:'platform_policy',confirmed:true,text:policyText,claims:{invoice:true,lateCheckin:true},policyScope:clone(scope),platform:'携程官方政策',room:scope.room,date:'2026-10-27',source:offer.source}],quoteBundle:{version:1,query:clone(trip),selected_offer_id:offer.id,offers:[clone(offer)]}};}
const browser={console,URL,Map,Set,Date,Number,Object,structuredClone};
vm.createContext(browser);
for(const file of ['criteria.js','quote-evidence.js','engine.js','decision-summary.js'])vm.runInContext(await readFile(new URL('../public/'+file,import.meta.url),'utf8'),browser,{filename:file});
const engine=browser.HotelEngine;
const tests=[];
const test=(name,run)=>tests.push({name,run});
const plain=value=>JSON.parse(JSON.stringify(value));
const policyLabels=['可开所需发票','支持晚到入住'];
function assertUnknown(guard,label){
  for(const expected of policyLabels)assert(guard.unknown.some(x=>x.includes(expected)),label+': '+expected+' must remain unknown');
  assert.equal(guard.blocked.length,0,label+': a scope mismatch is unknown, not a negative policy');
}
function assertInactive(h,label,currentTrip=trip){
  const before=JSON.stringify(h),prefsBefore=JSON.stringify(people),p=engine.policyFactsFor(h,currentTrip),resolved=engine.factsFor(h,currentTrip);
  for(const key of ['invoice','lateCheckin']){
    assert.equal(p.facts[key],null,label+': policy projection '+key);
    assert.equal(resolved.facts[key],null,label+': legacy '+key+' cannot fill a scoped gap');
    assert(p.controlledKeys.includes(key),label+': controlled key '+key);
  }
  assert.equal(p.applied.length,0,label+': inapplicable policy must not be applied');
  assert.equal(JSON.stringify(h),before,label+': hotel/price input unchanged');
  assert.equal(JSON.stringify(people),prefsBefore,label+': preferences unchanged');
}

test('matching official scope activates only its two policy claims',()=>{
  assert.equal(typeof engine.policyFactsFor,'function','HotelEngine.policyFactsFor must be exported');
  const h=hotel(),before=JSON.stringify(h),p=engine.policyFactsFor(h,trip);
  assert.deepEqual(plain(p.facts),{invoice:true,lateCheckin:true});
  assert.deepEqual(Array.from(p.controlledKeys).sort(),['invoice','lateCheckin']);
  assert.equal(p.applied.length,1);assert.equal(p.applied[0].id,'synthetic-policy');
  assert.equal(p.applied[0].requiresPaidConfirmed,true,'Paid/confirmed condition must remain explicit');
  assert.equal(p.conflicts.length,0);
  assert.equal(engine.factsFor(h,trip).facts.invoice,true);
  assert.equal(engine.factsFor(h,trip).facts.lateCheckin,true);
  assert.equal(JSON.stringify(h),before);
});

const mismatches=[
  ['another provider',h=>{h.evidence[0].policyScope.provider='tongcheng';}],
  ['selected package from another platform',h=>{h.quoteBundle.offers[0].provider='tongcheng';h.quoteBundle.offers[0].source='https://www.ly.com/hotel/hoteldetail?hotelId=99999999';}],
  ['another hotel',h=>{h.evidence[0].policyScope.hotel='另一模拟酒店';}],
  ['another room',h=>{h.evidence[0].policyScope.room='模拟双床房';}],
  ['another checkin',h=>{h.evidence[0].policyScope.checkin='2027-02-28';}],
  ['another checkout',h=>{h.evidence[0].policyScope.checkout='2027-03-04';}],
  ['another room count',h=>{h.evidence[0].policyScope.rooms=2;}],
  ['another adult count',h=>{h.evidence[0].policyScope.adults=3;}],
  ['another breakfast count',h=>{h.evidence[0].policyScope.breakfastCount=1;}],
  ['extra breakfast is a different package scope',h=>{h.quoteBundle.offers[0].breakfastText='3份早餐';h.quoteBundle.offers[0].evidence+='3份早餐';}],
  ['unknown breakfast despite a numeric count',h=>{h.quoteBundle.offers[0].breakfastText='早餐未注明';}],
  ['breakfast text absent from page evidence',h=>{h.quoteBundle.offers[0].evidence='合成房型套餐；在线付；入住当天18:00前可免费取消';}],
  ['another payment basis',h=>{h.quoteBundle.offers[0].payment='到店付';}],
  ['unknown payment basis',h=>{h.quoteBundle.offers[0].payment='未注明';}],
  ['mixed payment basis',h=>{h.quoteBundle.offers[0].payment='在线付或到店付';}],
  ['another selected offer with identical fields',h=>{h.quoteBundle.offers.push({...clone(offer),id:'ct-other-plan'});h.quoteBundle.selected_offer_id='ct-other-plan';}],
  ['selected offer missing',h=>{h.quoteBundle.selected_offer_id='missing';}],
  ['selected offer unset',h=>{h.quoteBundle.selected_offer_id='';}],
  ['policy not yet bound to an offer',h=>{h.evidence[0].policyScope.offerId='';}],
  ['unconfirmed policy',h=>{h.evidence[0].confirmed=false;}],
  ['no quote bundle',h=>{delete h.quoteBundle;}],
  ['invalid quote evidence',h=>{h.quoteBundle.offers[0].evidence='';}],
  ['invalid quote source',h=>{h.quoteBundle.offers[0].source='https://fixture.invalid/room';}],
  ['invalid quote currency',h=>{h.quoteBundle.offers[0].currency='USD';}],
  ['quote adults no longer match query',h=>{h.quoteBundle.offers[0].adults=1;}],
  ['quote children no longer match supported occupancy',h=>{h.quoteBundle.offers[0].children=1;}],
  ['target hotel differs from quote',h=>{h.name='另一模拟酒店';}],
  ['target room differs from quote',h=>{h.room='模拟双床房';}]
];
for(const [name,change]of mismatches)test(name,()=>{const h=hotel();change(h);assertInactive(h,name);});
test('explicit current trip overrides a stale otherwise matching quote',()=>assertInactive(hotel(),'current trip changed',{...trip,checkin:'2027-03-02',checkout:'2027-03-04'}));
test('current child occupancy cannot borrow an adult-only policy',()=>assertInactive(hotel(),'current trip has a child',{...trip,children:1}));
test('online payment aliases and normalized room names retain exact scoped binding',()=>{
  for(const payment of ['在线付','在线支付','预付']){
    const h=hotel();h.quoteBundle.offers[0].payment=payment;
    assert.equal(engine.policyFactsFor(h,trip).facts.invoice,true,payment);
  }
  const h=hotel();h.evidence[0].policyScope.room=' 模拟 大床房 ';
  assert.equal(engine.policyFactsFor(h,trip).facts.invoice,true);
});
test('at-property policies only apply to matching at-property packages',()=>{
  const h=hotel();Object.assign(h.evidence[0].policyScope,{paymentBasis:'at_property',requiresPaidConfirmed:false});h.quoteBundle.offers[0].payment='到店付';
  assert.equal(engine.policyFactsFor(h,trip).facts.invoice,true);
  h.quoteBundle.offers[0].payment='在线付';assertInactive(h,'at-property policy against online quote');
});
test('legacy unscoped facts and ordinary evidence retain their existing behavior',()=>{
  const h=hotel();h.evidence=[];
  assert.equal(engine.factsFor(h,trip).facts.invoice,true);
  assert.equal(engine.policyFactsFor(h,trip).controlledKeys.length,0);
  h.facts={};h.evidence=[{id:'legacy',confirmed:true,text:'合成 legacy 人工事实',claims:{invoice:true,lateCheckin:true,quiet:true,smart:true}}];
  const f=engine.factsFor(h,trip).facts;
  for(const key of ['invoice','lateCheckin','quiet','smart'])assert.equal(f[key],true,key);
  assert.equal(h.evidence[0].policyScope,undefined,'No implicit legacy migration');
  h.evidence.push({id:'ordinary-conflict',confirmed:true,text:'合成反例',claims:{quiet:false}});
  assert.equal(engine.factsFor(h,trip).facts.quiet,null);assert(engine.factsFor(h,trip).conflicts.includes('quiet'));
});
test('scoped control is per claim and does not erase a separate legacy fact',()=>{
  const h=hotel();h.evidence[0].claims={invoice:true};
  assert.deepEqual(Array.from(engine.policyFactsFor(h,trip).controlledKeys),['invoice']);
  h.evidence[0].policyScope.offerId='other';
  assert.equal(engine.factsFor(h,trip).facts.invoice,null);
  assert.equal(engine.factsFor(h,trip).facts.lateCheckin,true);
});
test('inactive scoped policy cannot fall back to unscoped evidence for controlled keys',()=>{
  const h=hotel();h.evidence[0].policyScope.offerId='different';
  h.evidence.push({id:'legacy-policy-copy',confirmed:true,text:'合成旧事实',claims:{invoice:true,lateCheckin:true,quiet:true}});
  assertInactive(h,'legacy evidence fallback');assert.equal(engine.factsFor(h,trip).facts.quiet,true);
});
test('active false claims and mutually conflicting scoped claims remain truthful',()=>{
  const h=hotel();h.evidence[0].claims.invoice=false;
  assert.equal(engine.factsFor(h,trip).facts.invoice,false);
  h.evidence.push({...clone(h.evidence[0]),id:'synthetic-policy-conflict',claims:{invoice:true,lateCheckin:true}});
  const p=engine.policyFactsFor(h,trip);assert.equal(p.facts.invoice,null);assert(p.conflicts.includes('invoice'));
  assert.equal(engine.factsFor(h,trip).facts.invoice,null);assert(engine.factsFor(h,trip).conflicts.includes('invoice'));
});
test('backup export and JSON import preserve policy conditions and source text',async()=>{
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const exported={};
  const context={console,Blob,Date,JSON,state:{version:1,mode:'trip',trip:clone(trip),people:clone(people),hotels:[hotel()]},imageGet:()=>{throw Error('Synthetic fixture has no images');},toast:()=>{},setTimeout:()=>0,URL:{createObjectURL:blob=>{exported.blob=blob;return 'blob:synthetic';},revokeObjectURL:()=>{}},document:{createElement:()=>({click(){exported.clicked=true;}})}};
  vm.createContext(context);
  const start=source.indexOf('async function exportData()'),end=source.indexOf("$('#export')",start);
  assert(start>=0&&end>start,'Real backup export entry point must exist');
  vm.runInContext(source.slice(start,end),context);await context.exportData();
  assert.equal(exported.clicked,true);
  const restored=JSON.parse(await exported.blob.text());
  assert.deepEqual(restored.hotels[0].evidence[0].policyScope,scope);
  assert.equal(restored.hotels[0].evidence[0].text,policyText);
  assert.equal(restored.hotels[0].evidence[0].kind,'platform_policy');
  assert.equal(restored.hotels[0].price,432);assert.deepEqual(restored.people,people);
  const validStart=source.indexOf('function validState('),validEnd=source.indexOf('function save(',validStart);
  vm.runInContext(source.slice(validStart,validEnd),context);
  assert.equal(context.validState(restored),true,'JSON-restored scoped evidence remains importable');
  assert.equal(engine.factsFor(restored.hotels[0],restored.trip).facts.invoice,true);
});

const {validateSnapshot,hardConditions,decisionConditions,buildModelRecommendationContext,reviewEvidence}=await import('../lib/hotel-ai.mjs');
function input(h,currentTrip=trip){return {mode:'trip',decision_scope:'reference_selection',trip:clone(currentTrip),people:clone(people),hotels:[h]};}
test('server normalization retains scoped official evidence and its paid-condition original',()=>{
  const raw=input(hotel()),before=JSON.stringify(raw),{snapshot,sources}=validateSnapshot(raw),e=snapshot.hotels[0].evidence[0];
  assert.deepEqual(plain(e.policyScope),scope);assert.equal(e.kind,'platform_policy');assert.equal(e.confirmed,true);
  assert.equal(e.text,policyText);assert.equal(sources.get(e.id).text,policyText);
  assert.equal(reviewEvidence(snapshot.hotels[0]).length,0,'Official policy is not guest review evidence');
  assert.equal(JSON.stringify(raw),before,'Server normalization does not edit hotel price or preferences');
  const h=snapshot.hotels[0],guard=hardConditions(h,snapshot.people,2027,snapshot.trip);
  assert.equal(guard.blocked.length,0);assert.equal(guard.unknown.length,0);
  assert.equal(decisionConditions(h,snapshot.people,snapshot.trip,'reference_selection').unknown.length,0);
});
test('server permits structurally valid inactive scope and pending offer binding',()=>{
  for(const offerId of ['different-package','']){
    const raw=input(hotel());raw.hotels[0].evidence[0].policyScope.offerId=offerId;
    const {snapshot}=validateSnapshot(raw),h=snapshot.hotels[0];
    assert.equal(h.evidence[0].policyScope.offerId,offerId);assert.equal(h.evidence[0].text,policyText);
    assertUnknown(hardConditions(h,snapshot.people,2027,snapshot.trip),'normalized '+offerId);
  }
});
test('server distinguishes an active negative policy from contradictory policy evidence',()=>{
  const raw=input(hotel());raw.hotels[0].evidence[0].claims.invoice=false;
  let {snapshot}=validateSnapshot(raw),guard=hardConditions(snapshot.hotels[0],snapshot.people,2027,snapshot.trip);
  assert(guard.blocked.some(x=>x.includes('可开所需发票')));assert(!guard.unknown.some(x=>x.includes('可开所需发票')));
  raw.hotels[0].evidence.push({...clone(raw.hotels[0].evidence[0]),id:'synthetic-policy-conflict',claims:{invoice:true,lateCheckin:true}});
  ({snapshot}=validateSnapshot(raw));guard=hardConditions(snapshot.hotels[0],snapshot.people,2027,snapshot.trip);
  assert(guard.unknown.some(x=>x.includes('可开所需发票')));assert(!guard.blocked.some(x=>x.includes('可开所需发票')));
});
const invalidScopes=[null,[],{...scope,version:2},{...scope,provider:'unknown'},{...scope,room:''},{...scope,checkin:'2027-02-30'},{...scope,rooms:0},{...scope,adults:'2'},{...scope,children:1},{...scope,breakfastCount:'2'},{...scope,paymentBasis:'unknown'},{...scope,requiresPaidConfirmed:'true'}];
for(const [index,bad]of invalidScopes.entries())test('malformed scope '+index+' cannot confirm policy',()=>{
  const raw=input(hotel());raw.hotels[0].evidence[0].policyScope=clone(bad);
  try{const {snapshot}=validateSnapshot(raw);assertUnknown(hardConditions(snapshot.hotels[0],snapshot.people,2027,snapshot.trip),'malformed scope '+index);}
  catch(error){assert.equal(error.code,'invalid_policy_scope','Malformed scope must fail with a specific boundary error');}
});
test('server, browser evaluation and decision summary share active and inactive projections',()=>{
  const cases=[['active',()=>{},false],['different offer',h=>{h.evidence[0].policyScope.offerId='other';},true],['different breakfast',h=>{h.evidence[0].policyScope.breakfastCount=1;},true],['unknown payment',h=>{h.quoteBundle.offers[0].payment='未注明';},true]];
  for(const [name,change,inactive]of cases){
    const h=hotel();change(h);const original=JSON.stringify(h),prefsBefore=JSON.stringify(people),{snapshot}=validateSnapshot(input(h)),normalized=snapshot.hotels[0];
    const server=hardConditions(normalized,snapshot.people,2027,snapshot.trip),decision=decisionConditions(normalized,snapshot.people,snapshot.trip,'reference_selection'),client=engine.evaluate(h,people,2027,trip),row=browser.HotelDecisionSummary.build([h],people,trip)[0];
    for(const label of policyLabels){
      assert.equal(server.unknown.some(x=>x.includes(label)),inactive,name+' server '+label);
      assert.equal(decision.unknown.some(x=>x.includes(label)),inactive,name+' decision '+label);
      assert.equal(client.pending.some(x=>x.includes(label)),inactive,name+' browser '+label);
    }
    for(const key of ['invoice','lateCheckin'])assert.equal(row.missing.some(x=>x.key===key),inactive,name+' summary '+key);
    assert.equal(row.formalEligible,!inactive,name+' formal eligibility');
    assert.equal(JSON.stringify(h),original);assert.equal(JSON.stringify(people),prefsBefore);
  }
});
test('browser and server honor the current trip even before the saved quote is refreshed',()=>{
  const h=hotel(),changed={...trip,checkin:'2027-03-02',checkout:'2027-03-04'},server=hardConditions(h,people,2027,changed),client=engine.evaluate(h,people,2027,changed),row=browser.HotelDecisionSummary.build([h],people,changed)[0];
  assertUnknown(server,'changed current trip');
  for(const label of policyLabels)assert(client.pending.some(x=>x.includes(label)),label);
  for(const key of ['invoice','lateCheckin'])assert(row.missing.some(x=>x.key===key),key);
});
test('model context carries active policy claims and keeps inactive claims unknown',()=>{
  for(const active of [true,false]){
    const raw=input(hotel());if(!active)raw.hotels[0].evidence[0].policyScope.offerId='other';
    const {snapshot,sources}=validateSnapshot(raw),checks=snapshot.hotels.map(h=>decisionConditions(h,snapshot.people,snapshot.trip,'reference_selection')),before=JSON.stringify(snapshot),context=buildModelRecommendationContext(snapshot,checks,sources),h=context.hotels[0],e=h.evidence.find(e=>e.id==='synthetic-policy');
    assert(e,'Original policy record remains inspectable in model context');assert.equal(e.text,policyText);
    assert.equal(context.sources.get(e.id).text,policyText,'Conditional source original must be retained');
    for(const key of ['invoice','lateCheckin']){
      if(active)assert.equal(e.claims?.[key],true,'Active model claim '+key);
      else {assert.notEqual(e.claims?.[key],true,'Inactive model claim '+key);assert.notEqual(h.facts?.[key],true,'Inactive model fact '+key);}
    }
    if(!active)assertUnknown(checks[0],'model boundary');
    assert.equal(JSON.stringify(snapshot),before,'Model context construction does not mutate server snapshot');
  }
});

const failures=[];
for(const {name,run}of tests){try{await run();}catch(error){failures.push({name,error});console.error('FAIL '+name+'\n'+String(error.stack||error).split('\n').slice(0,5).join('\n'));}}
assert.equal(failures.length,0,failures.length+' of '+tests.length+' scoped policy checks failed');
console.log('PASS '+tests.length+' offline synthetic policy checks: exact offer/trip/meal/payment scope; no legacy fallback; policy conflicts; backup round trip; server/browser/model parity; paid-confirmed source conditions and unchanged hotel price/preferences. No real evidence or network/API calls.');
