import assert from 'node:assert/strict';
import {SITE_ORIGIN,validateQuery,makeJob,applySnapshot} from '../collector-extension/core.js';
// Executes the actual worker against an in-memory Chrome double, no browser,
// network, API credentials, platform accounts, orders or payments.
const now=Date.now(),query=validateQuery({city:'成都',checkin:'2090-01-01',checkout:'2090-01-03',rooms:1,adults:2,platforms:['ctrip'],maxHotels:3,budget:465,required:['breakfast'],workflow:'selection',priceMode:'reference'},now);
const row={rowKey:'plan',room:'模拟房型',bed:'1张大床',breakfast:2,breakfastText:'2份早餐',listNightly:300,cancellation:'入住当天18:00前可免费取消',payment:'在线付',evidence:'合成套餐资料，不是真实价格'};
const job=makeJob(query,7,now-3600000);applySnapshot(job,{status:'ready',candidates:Array.from({length:12},(_,i)=>({id:String(i+1),name:'模拟酒店'+(i+1)}))},now);
while(!['completed','failed'].includes(job.status)){const t=job.tasks[job.index];applySnapshot(job,t.phase==='rooms'?{status:'ready',offers:[row],previewCandidate:row}:{status:'ready',offers:[],observations:[]},now);}
assert.equal(job.search.matched,3);const storedOffers=JSON.stringify(job.offers),oldID=job.id,oldCreated=job.createdAt;
let data={job:structuredClone(job)},listener,created=0,reads=0;const tabs=new Map(),event=()=>({addListener:()=>{}});
globalThis.chrome={runtime:{id:'mock-extension',getManifest:()=>({version:'0.2.8'}),getURL:p=>'chrome-extension://mock-extension/'+p,onMessage:{addListener:fn=>{listener=fn;}}},storage:{session:{get:async()=>structuredClone(data),set:async v=>{data=structuredClone(v);},remove:async()=>{data={};}}},alarms:{create:async()=>{},clear:async()=>{},onAlarm:event()},tabs:{create:async({url})=>{const tab={id:++created,url,status:'complete'};tabs.set(tab.id,tab);return tab;},get:async id=>tabs.get(id),update:async(id,changes)=>Object.assign(tabs.get(id),changes),remove:async id=>tabs.delete(id),reload:async()=>{throw Error('No refresh needed');},onUpdated:event(),onRemoved:event()},scripting:{executeScript:async()=>{reads++;return [{result:{status:'loading'}}];}}};
await import('../collector-extension/background.js');
const sender={id:'mock-extension',url:SITE_ORIGIN+'/workspace',tab:{id:7}},send=(type,extra={},who=sender)=>new Promise(resolve=>listener({type,...extra},who,resolve));
let response=await send('HELLO');assert.equal(response.continuationWorkflow,true);assert.equal(response.smartWashEvidence,true);assert.equal(response.version,'0.2.8');
const next={...query,searchGoal:'requirements_review',required:['breakfast','smartWash'],excludeHotels:[1,2,3].map(i=>({name:'模拟酒店'+i,platformIds:{ctrip:String(i)}}))};
response=await send('CONTINUE_SELECTION',{jobId:oldID,query:next});assert.equal(response.ok,true);assert.equal(response.job.id,oldID);assert.equal(response.job.createdAt,oldCreated);assert.equal(response.job.status,'collecting');assert.equal(response.job.search.roundInspected,1);assert.equal(response.job.query.required.includes('smartWash'),true);assert.equal(JSON.stringify(response.job.offers),storedOffers);assert.equal(data.job.tasks[data.job.index].name,'模拟酒店4');assert.equal(created,1);assert.equal(reads,0,'Start creates only a task-owned tab.');
response=await send('CONTINUE_SELECTION',{jobId:oldID,query:next});assert.equal(response.ok,false);assert.equal(created,1,'Duplicate continuation cannot open a second batch.');
response=await send('CONTINUE_SELECTION',{jobId:oldID,query:next},{...sender,url:'https://untrusted.test'});assert.equal(response.ok,false);assert.equal(created,1);
tabs.get(1).url='https://passport.ctrip.com/user/login';response=await send('STATUS');assert.equal(response.job.status,'needs_login');assert.equal(reads,0);
await send('CANCEL');assert.equal(tabs.size,0);
console.log('PASS actual continuation worker reuses stored pool/history, starts hotel four with washing requirement, rejects duplicate/untrusted control, and pauses for login without reading credentials or booking (Chrome mock only).');
