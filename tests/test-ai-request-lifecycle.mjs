import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import '../public/ai-request.js';
const {createClient}=globalThis.HotelAIRequest;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const response=data=>({ok:true,json:async()=>({mode:'real_model',result:{summary:'Mock only'},...data})});
function clock(){let time=0,id=0;const timers=new Map();return{now:()=>time,setTimer:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},clearTimer:i=>timers.delete(i),advance(ms){time+=ms;for(const [i,t]of [...timers])if(t.at<=time){timers.delete(i);t.fn();}},size:()=>timers.size};}

// A fetch promise that ignores AbortSignal must still reach the client deadline.
{
 const c=clock(),network=deferred();let signal,calls=0;
 const client=createClient({...c,fetcher:async(_url,options)=>{calls++;signal=options.signal;return network.promise;}});
 const p=client.request('recommend',{mode:'demo'},{timeoutMs:25});const rejected=assert.rejects(p,e=>e.code==='ai_timeout');
 assert.equal(client.state().mode,'demo');c.advance(25);await rejected;assert.equal(signal.aborted,true);assert.equal(client.state(),null);assert.equal(calls,1);assert.equal(c.size(),0);
 network.resolve(response());await flush();assert.equal(client.state(),null);
}
// The same total deadline includes reading a response body, not just headers.
{
 const c=clock(),body=deferred();let signal;
 const client=createClient({...c,fetcher:async(_url,options)=>{signal=options.signal;return{ok:true,json:()=>body.promise};}});
 const p=client.request('recommend',{}, {timeoutMs:40});const rejected=assert.rejects(p,e=>e.code==='ai_timeout');await flush();c.advance(40);await rejected;assert.equal(signal.aborted,true);assert.equal(client.state(),null);assert.equal(c.size(),0);
 body.resolve({mode:'real_model',result:{}});await flush();
}
// One active request per group; stopping waiting cannot apply a late response.
{
 const c=clock(),old=deferred();let calls=0;
 const client=createClient({...c,fetcher:async()=>++calls===1?old.promise:response({marker:'new'})});
 const p=client.request('recommend',{mode:'trip'});const stopped=assert.rejects(p,e=>e.code==='ai_cancelled'&&e.message.includes('可能继续'));
 await assert.rejects(client.request('recommend',{}),e=>e.code==='ai_request_busy');assert.equal(calls,1);assert.equal(client.state().timeout_ms,125000);
 assert.equal(client.cancel(),true);await stopped;const next=await client.request('recommend',{});assert.equal(next.marker,'new');assert.equal(calls,2);
 old.resolve(response({marker:'old'}));await flush();assert.equal(client.state(),null);assert.equal(c.size(),0);
}
// Network/API errors do not cause implicit network retries; callers keep originals.
{
 let calls=0;const client=createClient({fetcher:async()=>{calls++;throw Error('Mock network');}});
 await assert.rejects(client.request('extract',{}),e=>e.code==='ai_network_error');assert.equal(calls,1);
 const api=createClient({fetcher:async()=>({ok:false,json:async()=>({error:{code:'unverified_citation',message:'Mock server error',attempts:[{status:'rejected'}]}})})});
 await assert.rejects(api.request('recommend',{}),e=>e.code==='unverified_citation'&&e.message.includes('本次未更新')&&e.attempts.length===1);
}

const requestSource=await readFile(new URL('../public/ai-request.js',import.meta.url),'utf8');
const uiSource=await readFile(new URL('../public/ai.js',import.meta.url),'utf8');
async function uiFixture(fetchRecommendation){
 const clicks=[],nodes=Object.fromEntries(['#ai-recommend','#ai-message','#ai-request-progress','#ai-progress-label'].map(k=>[k,{textContent:'',innerHTML:'',disabled:true,hidden:false}]));
 let modelCalls=0,renderCalls=0;
 const state={mode:'trip',trip:{city:'Mock City'},people:[],hotels:[{id:'mock',name:'Mock Hotel'}],preferencesConfirmed:true,aiResult:{fingerprint:'old',data:{result:{summary:'Original mock result'}}}};
 const ctx={console,Date,Map,Set,Number,JSON,Math,performance,AbortController,structuredClone,setTimeout,clearTimeout,setInterval,clearInterval,URL,
  state,view:'compare',E:v=>String(v??''),$:(selector)=>nodes[selector]||null,comparisonHotels:()=>state.hotels,
  renderCompare:()=>{},render:()=>{},evidenceDialog:()=>{},renderGuide:()=>{},renderEvidence:()=>{},save:()=>{},toast:()=>{},
  document:{addEventListener:(name,fn)=>{if(name==='click')clicks.push(fn);}},
  fetch:async(url,options)=>url.endsWith('/status')?{json:async()=>({configured:true,authorized:true})}:(modelCalls++,fetchRecommendation(url,options))};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(requestSource,ctx);vm.runInContext(uiSource,ctx);
 vm.runInContext('renderCompare=()=>{}',ctx);await flush();
 return{ctx,state,nodes,get modelCalls(){return modelCalls;},click:id=>clicks[0]({target:{id,closest:()=>null}})};
}
// Preparation/render errors must release busy state even before the request starts.
{
 const f=await uiFixture(async()=>response());vm.runInContext("renderCompare=()=>{throw Error('Mock render error')}",f.ctx);
 const original=f.state.aiResult;await f.click('ai-recommend');assert.equal(vm.runInContext('aiBusy',f.ctx),false);assert.equal(f.modelCalls,0);assert.equal(f.state.aiResult,original);assert.equal(f.nodes['#ai-recommend'].disabled,false);
}
// Stopping the UI preserves its previous accepted result, including after late delivery.
{
 const network=deferred(),f=await uiFixture(async()=>network.promise),original=f.state.aiResult;
 const pending=f.click('ai-recommend');await flush();await f.click('ai-recommend');assert.equal(f.modelCalls,1);
 await f.click('ai-cancel');await pending;assert.equal(vm.runInContext('aiBusy',f.ctx),false);assert.equal(f.state.aiResult,original);
 assert.equal(f.state.aiRuns.at(-1).status,'cancelled');network.resolve(response({result:{summary:'Late mock result'}}));await flush();assert.equal(f.state.aiResult,original);
}
// Success/error notices belong to their exact mode and input snapshot.
{
 const f=await uiFixture(async()=>response());vm.runInContext("setAIMessage('trip success')",f.ctx);
 f.state.mode='demo';assert.equal(vm.runInContext('currentAIMessage()',f.ctx),'');vm.runInContext("setAIMessage('demo rejected')",f.ctx);
 f.state.mode='trip';assert.equal(vm.runInContext('currentAIMessage()',f.ctx),'trip success');f.state.trip.city='Another mock city';assert.equal(vm.runInContext('currentAIMessage()',f.ctx),'');
}
for(const file of ['index.html','workspace.html']){const source=await readFile(new URL('../public/'+file,import.meta.url),'utf8');assert(source.indexOf('ai-request.js')<source.indexOf('ai.js'));assert.equal((source.match(/src="ai-request.js"/g)||[]).length,1);}
console.log('PASS total fetch/body deadline, ignored-abort late responses, explicit stop, no duplicate group requests/retries, API errors, UI preparation failure recovery, preserved accepted results, and mode/snapshot-isolated messages (mock only).');
