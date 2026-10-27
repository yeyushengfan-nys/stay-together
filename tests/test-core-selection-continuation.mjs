import assert from 'node:assert/strict';
import * as Core from '../collector-extension/core.js';

// Synthetic pure-state-machine fixtures only. No browser, network, saved-state,
// credential, or model API is used by this test.
const {validateQuery,makeJob,applySnapshot,summarize,hotelKey,packageMatches}=Core;
const now=Date.parse('2026-10-27T00:00:00Z');
const raw={city:'成都',checkin:'2027-03-01',checkout:'2027-03-03',rooms:1,adults:2,children:0,area:'合成测试片区',platforms:['ctrip','tongcheng'],maxHotels:3,budget:465,required:['breakfast','freeCancel','smartWash','quiet','invoice'],workflow:'selection',priceMode:'reference'};
const clone=value=>structuredClone(value);
const pool=Array.from({length:15},(_,i)=>({id:String(1001+i),name:'合成连锁酒店（测试'+(i+1)+'店）',listNightly:200}));
const row=(patch={})=>({rowKey:'0:0',room:'合成大床房',bed:'1张1.8米大床',breakfast:2,breakfastText:'2份早餐',listNightly:200,cancellation:'入住当天18:00前可免费取消',payment:'在线付',stage:'room_list',evidence:'离线合成测试套餐；不是实际房价或酒店证据。',...patch});
const q=(patch={})=>validateQuery({...clone(raw),...patch},now);
const tests=[];
const test=(name,run)=>tests.push({name,run});
const journal=[];
let tick=0;
function step(job,snapshot){job.taskTabId=77;applySnapshot(job,snapshot,now+1000*(++tick));}
function discover(job,candidates=pool){assert.equal(job.tasks[job.index].phase,'discover');step(job,{status:'ready',candidates:clone(candidates)});return job;}
function advance(job,{roomsFail=false,unmatched=false}={}){
  const task=job.tasks[job.index];assert(task,'An active job must have a task');
  assert.notEqual(task.phase,'checkout','Reference continuation must never enter an order page');
  journal.push({job:job.id,provider:task.provider,phase:task.phase,name:task.name,poolCandidate:!!task.poolCandidate});
  if(task.phase==='locate'){
    const index=pool.findIndex(c=>hotelKey(c.name)===hotelKey(task.name));
    step(job,{status:'ready',candidates:[{id:String(2001+Math.max(0,index)),name:task.name}]});
  }else if(task.phase==='amenities')step(job,{status:'ready',offers:[],observations:[{key:'opened',value:2024,room:'酒店级资料',evidence:'合成测试开业年份；未核实智能卫浴、安静或发票。'}]});
  else if(task.phase==='rooms'){
    if(roomsFail)step(job,{status:'error',message:'离线合成房型读取失败'});
    else {const r=row(unmatched?{breakfast:0,breakfastText:'无早餐'}:{});step(job,{status:'ready',offers:[r],previewCandidate:unmatched?null:r,planSummary:{visibleOfferCount:1,eligibleOfferCount:unmatched?0:1,limitation:'Synthetic visible row only; necessary facilities/reviews unknown'}});}
  }else assert.fail('Unexpected pure-state-machine phase: '+task.phase);
}
function finish(job,options={}){
  let steps=0;while(!['completed','failed'].includes(job.status)){assert(++steps<200,'State machine must stay bounded');advance(job,options);}
  return job;
}
function resume(job,query=job.query){
  assert.equal(typeof Core.continueSelection,'function','Core.continueSelection must be exported');
  return Core.continueSelection(job,query,now+1000*(++tick))||job;
}
function primaryRuns(job,from=0){return journal.slice(from).filter(t=>t.job===job.id&&t.phase==='rooms'&&t.poolCandidate).map(t=>t.name);}
function assertNoAllMustClaim(summary){
  assert.equal(summary.search?.allMustVerifiedCount??null,null,'Unknown necessary requirements must not produce a fabricated verified count');
  assert.equal(summary.query.searchGoal,'requirements_review','The request goal must remain explicit');
  assert.equal(summary.search.goal,'requirements_review','The progress goal must remain explicit');
  assert.equal(typeof(summary.search.scope??summary.scope),'string','The package-only evidence scope must remain explicit');
  assert(!/已(?:全部|完全)满足(?:所有|全部)?必要条件/.test(summary.message),'A package match is not full necessary-condition verification');
}
function assertRetained(items,old,label){for(const item of old)assert.deepEqual(items.find(x=>x.id?x.id===item.id:JSON.stringify(x)===JSON.stringify(item)),item,label);}

test('query accepts the requirements goal, smartWash and bounded exact exclusions without mutation',()=>{
  const input={...clone(raw),searchGoal:'requirements_review',required:['smartWash','smartWash','quiet'],excludeHotels:[{name:' 合成酒店 '},{platformIds:{ctrip:'12345'}},{name:'另一个合成酒店',platformIds:{tongcheng:'67890'}}]},before=JSON.stringify(input),query=validateQuery(input,now);
  assert.equal(query.searchGoal,'requirements_review');assert.deepEqual(query.required,['smartWash','quiet']);
  assert.equal(query.excludeHotels.length,3);assert.equal(query.excludeHotels[1].platformIds.ctrip,'12345');assert.equal(query.excludeHotels[2].platformIds.tongcheng,'67890');
  assert.equal(JSON.stringify(input),before);
  assert.equal(q({searchGoal:'requirements_review',excludeHotels:Array.from({length:30},(_,i)=>({name:'合成排除'+i}))}).excludeHotels.length,30);
});
for(const [name,value]of [['non-array',{}],['too many',Array.from({length:31},(_,i)=>({name:'合成排除'+i}))],['null entry',[null]],['empty identity',[{}]],['invalid provider id',[{platformIds:{ctrip:'123/checkout'}}]],['overlong provider id',[{platformIds:{tongcheng:'123456789012345'}}]]])test('invalid exclusions: '+name,()=>assert.throws(()=>q({searchGoal:'requirements_review',excludeHotels:value})));

test('legacy package goal still stops after its first three matching hotels',()=>{
  const query=q(),before=JSON.stringify(query),job=finish(discover(makeJob(query,7,now)));
  assert.equal(job.status,'completed');assert.equal(job.search.inspected,3);assert.equal(job.search.matched,3);assert.equal(job.search.stopReason,'target_met');
  assert.equal(job.poolCursor,3);assert.equal(job.candidatePool.length,12);assert.equal(job.query.required.includes('smartWash'),true);
  assert.deepEqual(primaryRuns(job),pool.slice(0,3).map(c=>c.name));assert(!job.tasks.some(t=>t.phase==='checkout'));
  assert.equal(JSON.stringify(query),before);
});
test('requirements review continues beyond three packages and stops at eight inspections',()=>{
  const query=q({searchGoal:'requirements_review'}),before=JSON.stringify(query),job=finish(discover(makeJob(query,7,now))),summary=summarize(job);
  assert.equal(job.status,'completed');assert.equal(job.search.inspected,8);assert.equal(job.search.roundInspected,8);assert.equal(job.search.matched,8);
  assert.equal(job.search.stopReason,'inspection_limit');assert.equal(job.candidatePool.length,12);assert.equal(job.poolCursor,8);assert.equal(summary.search.remainingPool,4);
  assert.equal(summary.continuationReady,true);assert.equal(Object.hasOwn(summary,'candidatePool'),false,'Internal uninspected candidates are not exposed in the public summary');
  assert.equal(new Set(primaryRuns(job)).size,8);assert.equal(primaryRuns(job).length,8);
  assertNoAllMustClaim(summary);assert.equal(JSON.stringify(query),before);
  assert.equal(packageMatches(row(),query),true,'Unknown smartWash, quiet and invoice do not erase an observed package match');
});
test('continuing the eight-hotel review reuses its pool and inspects only the remaining four',()=>{
  let job=finish(discover(makeJob(q({searchGoal:'requirements_review'}),7,now)));
  const identity=job.id,created=job.createdAt,previousRoundStarted=job.roundStartedAt??job.createdAt,owner=job.ownerTabId,offers=clone(job.offers),observations=clone(job.observations),from=journal.length,prefs={people:[{name:'合成同行人',budget:465,conditions:[{id:'quiet',mode:'must'}]}]},prefsBefore=JSON.stringify(prefs);
  job=resume(job);assert.equal(job.id,identity);assert.equal(job.createdAt,created);assert.equal(job.ownerTabId,owner);
  assert.equal(job.roundStartedAt>previousRoundStarted,true,'Continuation starts a fresh bounded round without changing createdAt');
  assert.equal(job.tasks[job.index].name,pool[8].name);
  finish(job);
  assert.equal(job.search.inspected,12);assert.equal(job.search.roundInspected,4);assert.equal(job.search.matched,12);assert.equal(job.search.stopReason,'pool_exhausted');
  assert.equal(job.poolCursor,12);assert.equal(summarize(job).search.remainingPool,0);assert.deepEqual(primaryRuns(job,from),pool.slice(8,12).map(c=>c.name));
  assert.equal(summarize(job).continuationReady,false);
  assertRetained(job.offers,offers,'Previous offers remain available for audit');assertRetained(job.observations,observations,'Previous observations remain available for audit');
  assert(!journal.slice(from).some(t=>t.job===job.id&&t.phase==='discover'));assert.equal(new Set(primaryRuns(job)).size,12);assert.equal(primaryRuns(job).length,12);
  assert.equal(JSON.stringify(prefs),prefsBefore);assertNoAllMustClaim(summarize(job));
  const finished=JSON.stringify(job);assert.throws(()=>resume(job));assert.equal(JSON.stringify(job),finished,'Exhausted continuation must not mutate the completed job');
});
test('old first-three package result continues at hotel four after excluding those known hotels',()=>{
  let job=finish(discover(makeJob(q(),7,now)));
  const oldOffers=clone(job.offers),oldObservations=clone(job.observations),oldPool=clone(job.candidatePool),from=journal.length;
  const query=q({searchGoal:'requirements_review',required:['breakfast','freeCancel','smartWash','lateCheckin'],excludeHotels:pool.slice(0,3).map(c=>({name:c.name,platformIds:{ctrip:c.id}}))}),queryBefore=JSON.stringify(query);
  job=resume(job,query);
  assert.equal(job.tasks[job.index].name,pool[3].name,'Known rejected hotels must not be selected again');
  const continuedSummary=summarize(job);assert.equal(continuedSummary.search.availablePackageMatched??continuedSummary.availablePackageMatched,0,'Excluded prior matches remain audit evidence, not currently available matches');
  assert.equal(continuedSummary.continuationReady,false,'An active continuation cannot be started again');
  assert.equal(job.query.searchGoal,'requirements_review');assert(job.query.required.includes('smartWash'));assert(job.query.required.includes('lateCheckin'));
  finish(job);
  const queried=primaryRuns(job,from);assert.equal(queried[0],pool[3].name);
  assert(!queried.some(name=>pool.slice(0,3).some(c=>hotelKey(c.name)===hotelKey(name))));
  assert.equal(job.search.inspected,11);assert.equal(job.search.roundInspected,8);assert.equal(summarize(job).search.remainingPool,1);
  const summary=summarize(job);assert.equal(summary.search.availablePackageMatched??summary.availablePackageMatched,8);assert.equal(summary.continuationReady,true);
  assert.deepEqual(job.candidatePool,oldPool);assertRetained(job.offers,oldOffers,'Continuation retains original offers');assertRetained(job.observations,oldObservations,'Continuation retains original observations');
  assert.equal(JSON.stringify(query),queryBefore,'Updated requirement input is not rewritten');assertNoAllMustClaim(summarize(job));
});
test('fresh START applies three known exclusions before consuming the first inspection slot',()=>{
  const query=q({searchGoal:'requirements_review',excludeHotels:pool.slice(0,3).map(c=>({name:c.name}))});
  let job=discover(makeJob(query,7,now));assert.equal(job.tasks[job.index].name,pool[3].name);assert.equal(job.search.inspected,1);assert.equal(job.search.excludeSkipped,3);
  finish(job);assert.deepEqual(primaryRuns(job),pool.slice(3,11).map(c=>c.name));assert.equal(job.search.inspected,8);assert.equal(job.search.roundInspected,8);
  assert.equal(job.search.excludeSkipped,3);assert.equal(summarize(job).search.remainingPool,1);
  job=resume(job);finish(job);assert.equal(job.search.inspected,9);assert.equal(job.search.roundInspected,1);assert.equal(job.search.excludeSkipped,3);assert.equal(summarize(job).search.remainingPool,0);
  assert.equal(new Set(primaryRuns(job)).size,9);assert.equal(job.search.stopReason,'pool_exhausted');
});
test('exclusion names use normalized exact identity and never remove a same-brand hotel by substring',()=>{
  const candidates=[{id:'1001',name:'合成品牌酒店'},{id:'1002',name:'合成品牌酒店（地铁分店）'},{id:'1003',name:'另一家合成酒店'}];
  const job=finish(discover(makeJob(q({searchGoal:'requirements_review',platforms:['ctrip'],excludeHotels:[{name:' 合成 品牌酒店 '}]}),7,now),candidates));
  assert.deepEqual(primaryRuns(job),candidates.slice(1).map(c=>c.name));assert.equal(job.search.excludeSkipped,1);assert.equal(job.search.inspected,2);
});
for(const provider of ['ctrip','tongcheng'])test(provider+' provider hotel ID excludes an exact hotel even when its displayed name differs',()=>{
  const candidates=[{id:'1001',name:'身份相同但名称变化的合成酒店'},{id:'1002',name:'同品牌的另一家合成酒店'}],query=q({searchGoal:'requirements_review',platforms:[provider],excludeHotels:[{name:'旧显示名称',platformIds:{[provider]:'1001'}}]});
  const job=finish(discover(makeJob(query,7,now),candidates));assert.deepEqual(primaryRuns(job),[candidates[1].name]);assert.equal(job.search.excludeSkipped,1);assert.equal(job.search.inspected,1);
});
test('provider IDs remain provider-specific and do not cross-exclude matching digits',()=>{
  const candidates=[{id:'1001',name:'合成携程酒店'}],job=finish(discover(makeJob(q({searchGoal:'requirements_review',platforms:['ctrip'],excludeHotels:[{platformIds:{tongcheng:'1001'}}]}),7,now),candidates));
  assert.deepEqual(primaryRuns(job),[candidates[0].name]);assert.equal(job.search.excludeSkipped,0);
});
test('exclusions merge across continuation and remainingPool ignores an excluded unseen hotel',()=>{
  let job=finish(discover(makeJob(q({searchGoal:'requirements_review',excludeHotels:[{name:pool[0].name}]}),7,now)));
  assert.equal(job.search.inspected,8);assert.equal(job.poolCursor,9);assert.equal(summarize(job).search.remainingPool,3);
  const from=journal.length,next=q({searchGoal:'requirements_review',excludeHotels:[{platformIds:{ctrip:pool[9].id}}]});
  job=resume(job,next);finish(job);
  assert.deepEqual(primaryRuns(job,from),[pool[10].name,pool[11].name]);assert.equal(job.search.inspected,10);assert.equal(job.search.roundInspected,2);assert.equal(job.search.excludeSkipped,2);
  assert.equal(job.query.excludeHotels.length,2,'New exclusions must not replace an earlier rejection');assert.equal(summarize(job).search.remainingPool,0);
});
test('an entirely excluded bounded pool ends without inspecting or fabricating package matches',()=>{
  const job=discover(makeJob(q({searchGoal:'requirements_review',excludeHotels:pool.slice(0,12).map(c=>({name:c.name}))}),7,now));
  assert(['completed','failed'].includes(job.status));assert.equal(job.search.inspected,0);assert.equal(job.search.roundInspected,0);assert.equal(job.search.matched,0);assert.equal(job.search.excludeSkipped,12);
  assert.equal(job.search.stopReason,'pool_exhausted');assert.equal(summarize(job).search.remainingPool,0);assert.equal(job.offers.length,0);assertNoAllMustClaim(summarize(job));
});
for(const [name,patch]of [['city',{city:'北京'}],['checkin',{checkin:'2027-03-02'}],['checkout',{checkout:'2027-03-04'}],['rooms',{rooms:2}],['adults',{adults:3}],['area',{area:'另一合成片区'}]])test('continuation refuses changed '+name+' without editing the saved job',()=>{
  const job=finish(discover(makeJob(q({searchGoal:'requirements_review'}),7,now))),before=JSON.stringify(job);
  assert.throws(()=>resume(job,{...clone(job.query),...patch}));assert.equal(JSON.stringify(job),before);
});
for(const status of ['discovering','collecting','loading','needs_login','needs_verification','needs_review','cancelled'])test('continuation refuses nonterminal status '+status,()=>{
  const job=finish(discover(makeJob(q({searchGoal:'requirements_review'}),7,now)));job.status=status;const before=JSON.stringify(job);
  assert.throws(()=>resume(job));assert.equal(JSON.stringify(job),before);
});
test('continuation requires the prior bounded pool and search state',()=>{
  for(const missing of ['candidatePool','search']){
    const job=finish(discover(makeJob(q({searchGoal:'requirements_review'}),7,now)));delete job[missing];const before=JSON.stringify(job);
    assert.throws(()=>resume(job));assert.equal(JSON.stringify(job),before);
  }
});
test('a failed eight-hotel attempt can continue its remaining pool and retain its failure evidence',()=>{
  let job=finish(discover(makeJob(q({searchGoal:'requirements_review'}),7,now)),{roomsFail:true});
  assert.equal(job.status,'failed');assert.equal(job.search.inspected,8);assert.equal(job.search.matched,0);const errors=clone(job.errors),from=journal.length;
  job=resume(job);finish(job);assert.equal(job.status,'completed');assert.equal(job.search.inspected,12);assert.equal(job.search.roundInspected,4);assert.equal(job.search.matched,4);
  assert.deepEqual(primaryRuns(job,from),pool.slice(8,12).map(c=>c.name));assert.deepEqual(job.errors.slice(0,errors.length),errors);assert.equal(summarize(job).search.remainingPool,0);
});

const failures=[];
for(const {name,run}of tests){try{await run();}catch(error){failures.push({name,error});console.error('FAIL '+name+'\n'+String(error.stack||error).split('\n').slice(0,5).join('\n'));}}
assert.equal(failures.length,0,failures.length+' of '+tests.length+' selection continuation checks failed');
console.log('PASS '+tests.length+' offline synthetic continuation checks: legacy package target; eight inspections per round/twelve retained candidates; exact exclusions; cumulative cursors/counts; old evidence retained; unknown requirements explicit; guarded scope/status/exhaustion; no order tasks or preference mutations.');
