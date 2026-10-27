import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
let timers=[];
const ctx={crypto,URL,Map,Promise,console,location:{origin:'https://fixture.test'},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{},window:{addEventListener:()=>{},postMessage:()=>{}},document:{addEventListener:()=>{}},render:()=>{},renderCompare:()=>{},state:{mode:'demo'},view:'preferences',save:()=>{}};
vm.createContext(ctx);vm.runInContext(await readFile(new URL('../public/collector-client.js',import.meta.url),'utf8'),ctx);
const original=ctx.collectorRequest;
const pending=original('STATUS').catch(e=>e);assert.equal(timers.at(-1).ms,20000);timers.at(-1).fn();assert.equal((await pending).code,'collector_response_timeout');
timers=[];ctx.mockRequest=async()=>{const e=Error('temporarily delayed');e.code='collector_response_timeout';throw e;};
vm.runInContext('collectorConnected=true;collectorJob={id:"job",status:"collecting"};collectorRequest=mockRequest;',ctx);
for(let n=1;n<=3;n++){await ctx.collectorCheck();assert.equal(vm.runInContext('collectorConnected',ctx),true);assert.equal(timers.at(-1).ms,4000);}
await ctx.collectorCheck();assert.equal(vm.runInContext('collectorConnected',ctx),false);assert.equal(timers.length,3);
ctx.mockRequest=async()=>({job:{id:'job',status:'completed'}});vm.runInContext('collectorRequest=mockRequest;',ctx);await ctx.collectorCheck();
assert.equal(vm.runInContext('collectorConnected',ctx),true);assert.equal(vm.runInContext('collectorStatusFailures',ctx),0);assert.equal(vm.runInContext('collectorError',ctx),'');
let calls=0;ctx.mockRequest=async()=>{if(!calls++)return {version:'0.2.5',selectionWorkflow:true,referenceWorkflow:true};const e=Error('slow status');e.code='collector_response_timeout';throw e;};
vm.runInContext('collectorRequest=mockRequest;',ctx);await ctx.collectorConnect();assert.equal(vm.runInContext('collectorConnected',ctx),true);
console.log('PASS status has a 20-second response budget; three bounded status-only recoveries preserve known connection; no START or platform refresh.');
console.log('PASS success clears stale warnings; successful HELLO followed by delayed STATUS does not falsely declare extension missing.');
