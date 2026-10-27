import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {summarize} from '../collector-extension/core.js';
// Entirely synthetic trips, hotel IDs and sources; no browser or network.
const trip={city:'模拟城市',checkin:'2027-04-01',checkout:'2027-04-03',rooms:1,adults:2,area:'模拟区域'};
const people=[{id:'member-a',name:'合成同行甲',budget:500,budgetHard:true,requireSmart:true,conditions:[{id:'smartWash',mode:'must'}],weights:{price:3,transit:3,newness:3,facilities:3}},{id:'member-b',name:'合成同行乙',budget:450,budgetHard:true,conditions:[],weights:{price:3,transit:3,newness:3,facilities:3}}];
function offer(name,id,provider='ctrip'){return {id:provider+':'+id,provider,hotel:name,room:'合成双床房',bed:'2张单人床',listNightly:300,breakfast:2,breakfastText:'2份早餐',cancellation:'入住当天18:00前可免费取消',payment:'在线付',checkIn:trip.checkin,checkOut:trip.checkout,rooms:1,adults:2,children:0,currency:'CNY',stage:'room_list',capturedAt:'2026-10-27T00:00:00Z',source:provider==='ctrip'?'https://hotels.ctrip.com/hotels/'+id+'.html':'https://www.ly.com/hotel/hoteldetail?hotelId='+id,evidence:'合成双床房\n2份早餐\n入住当天18:00前可免费取消\n在线付'};}
function hotel(id,wash){const name='合成酒店'+id,offers=[offer(name,'10'+id),offer(name,'20'+id,'tongcheng')];return {id,name,city:trip.city,room:'合成双床房',price:null,referencePrice:300,demo:false,quoteBundle:{query:{...trip},selected_offer_id:offers[0].id,offers},facts:{smart:true},evidence:wash===undefined?[]:[{id:'proof-'+id,room:'合成双床房',platform:'酒店资料',text:'合成人工核对',source:'https://example.test/confirmed',confirmed:true,claims:{smartWash:wash}}]};}
const excluded=hotel('1',false),unknown=hotel('2'),stale=hotel('3',false),otherCity=hotel('4',false);
stale.quoteBundle.query.checkin='2027-03-01';otherCity.city='另一模拟城市';otherCity.quoteBundle.query.city='另一模拟城市';
const state={mode:'trip',preferencesConfirmed:true,trip:{...trip},people:structuredClone(people),hotels:[excluded,unknown,stale,otherCity],hotelSelection:[excluded.id,unknown.id]};
const beforePeople=JSON.stringify(state.people),beforeOld=JSON.stringify(state.hotels),timers=[],requests=[];
let responseJob=null,fail=false;
const ctx={console,URL,Map,Set,Date,Promise,structuredClone,crypto,location:{origin:'https://example.test'},state,view:'other',E:String,link:()=>'',toast:()=>{},uid:()=> 'synthetic-new',save:()=>true,render:()=>{},renderCompare:()=>{},discoveryQuery:()=>({...trip}),setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{},document:{addEventListener:()=>{},getElementById:()=>null},addEventListener:()=>{},postMessage:()=>{},HotelJourney:{city:s=>String(s).replace(/市$/,'')}};
ctx.window=ctx;vm.createContext(ctx);
for(const file of ['quote-evidence.js','criteria.js','engine.js','collector-compare.js','selection-engine.js','reference-prices.js','package-match.js','decision-summary.js','collector-client.js','selection-client.js'])vm.runInContext(fs.readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),ctx);
ctx.respond=async(type,extra)=>{requests.push({type,...structuredClone(extra)});if(fail)throw Error('合成网络失败');return {job:{...structuredClone(responseJob),query:structuredClone(extra.query)}};};
vm.runInContext('collectorConnected=true;collectorSelectionCapable=true;collectorContinuationCapable=true;collectorRequest=respond;',ctx);
const exclusions=ctx.collectorExcludedHotels();assert.equal(exclusions.length,1);assert.equal(exclusions[0].name,excluded.name);assert.equal(exclusions[0].platformIds.ctrip,'101');assert.equal(exclusions[0].platformIds.tongcheng,'201');
assert(!JSON.stringify(exclusions).includes(unknown.name));assert(!JSON.stringify(exclusions).includes(stale.name));assert(!JSON.stringify(exclusions).includes(otherCity.name));
const newOffer=offer('合成新酒店','999');responseJob={id:'pool-job',revision:1,status:'completed',message:'合成检查完成',createdAt:1,updatedAt:2,candidates:[{name:newOffer.hotel}],offers:[newOffer],observations:[],errors:[],progress:{done:1,total:1},continuationReady:false,search:{inspected:1,poolSize:1,remainingPool:0,stopReason:'pool_exhausted'}};
await ctx.StartHotelSelection();
let request=requests.at(-1);assert.equal(request.type,'START');assert.equal(request.query.searchGoal,'requirements_review');assert(request.query.required.includes('smartWash'));assert.equal(request.query.excludeHotels[0].name,excluded.name);assert(!JSON.stringify(request.query).includes('合成同行'));
assert(state.hotelSelection.includes(excluded.id));assert(state.hotelSelection.includes(unknown.id));assert(!state.hotelSelection.includes(stale.id));assert(!state.hotelSelection.includes(otherCity.id));assert(state.hotelSelection.includes('synthetic-new'));
assert.equal(JSON.stringify(state.people),beforePeople);assert.equal(JSON.stringify(state.hotels.slice(0,4)),beforeOld);
// Continue a real saved pool, never infer capability from version alone.
const previous=summarize({...state.clientCollection,revision:2,candidatePool:[{id:'888',name:'合成下一家'},{id:'889',name:'合成再下一家'}],poolCursor:0,primaryProvider:'ctrip',matchedHotelKeys:[],tasks:[],index:0,events:[],search:{...state.clientCollection.search,stopReason:'inspection_limit'}});
assert.equal(previous.continuationReady,true);assert.equal(previous.search.remainingPool,2);assert(!Object.hasOwn(previous,'candidatePool'));assert.equal(ctx.collectorCanContinue({...previous,search:null},previous.query),false);
state.clientCollection=previous;ctx.previous=previous;vm.runInContext('collectorJob=previous;',ctx);
responseJob={...responseJob,id:previous.id,revision:3};
await ctx.StartHotelSelection({continue:true});request=requests.at(-1);assert.equal(request.type,'CONTINUE_SELECTION');assert.equal(request.jobId,previous.id);assert(request.query.required.includes('smartWash'));assert.equal(JSON.stringify(state.people),beforePeople);
// Older/no-pool records start a fresh bounded query with the same exclusions.
ctx.previous={...previous,continuationReady:false};vm.runInContext('collectorJob=previous;',ctx);await ctx.StartHotelSelection({continue:true});assert.equal(requests.at(-1).type,'START');assert.equal(requests.at(-1).query.excludeHotels[0].name,excluded.name);
vm.runInContext('collectorContinuationCapable=false;',ctx);const count=requests.length;await ctx.StartHotelSelection({continue:true});assert.equal(requests.length,count);assert(vm.runInContext('collectorError',ctx).includes('0.2.8'));vm.runInContext('collectorContinuationCapable=true;',ctx);
// A failed continuation preserves all current choices/data and is not retried.
const stable=JSON.stringify({trip:state.trip,people:state.people,hotels:state.hotels,selection:state.hotelSelection});fail=true;await ctx.StartHotelSelection({continue:true});assert.equal(JSON.stringify({trip:state.trip,people:state.people,hotels:state.hotels,selection:state.hotelSelection}),stable);assert.equal(vm.runInContext('collectorError',ctx),'合成网络失败');fail=false;
// Bounded automatic continuation is scheduled once per completed revision;
// auth/failed/exhausted records never trigger it and unknown is never ready.
const currentQuery={...ctx.collectorQuery(),workflow:'selection',searchGoal:'requirements_review',platforms:['ctrip','tongcheng'],maxHotels:3};
const autoJob={...previous,query:currentQuery,id:'automatic',revision:8,status:'completed',continuationReady:true,search:{remainingPool:4,stopReason:'inspection_limit'}};
const timerCount=timers.length;assert.equal(ctx.collectorMaybeContinue(autoJob),true);assert.equal(ctx.collectorMaybeContinue(autoJob),false);assert.equal(timers.length,timerCount+1);assert.equal(timers.at(-1).ms,0);
const autoTimer=timers.at(-1);ctx.autoJob=autoJob;vm.runInContext('collectorJob=autoJob;',ctx);responseJob={...responseJob,id:autoJob.id,revision:9};const autoRequests=requests.length;await autoTimer.fn();assert.equal(requests.length,autoRequests+1);assert.equal(requests.at(-1).type,'CONTINUE_SELECTION');assert.equal(requests.at(-1).jobId,autoJob.id);assert.equal(ctx.collectorMaybeContinue(autoJob),false);
for(const status of ['failed','needs_login','needs_verification','needs_review','collecting'])assert.equal(ctx.collectorMaybeContinue({...autoJob,status,revision:autoJob.revision+1}),false);
assert.equal(ctx.collectorMaybeContinue({...autoJob,revision:10,search:{remainingPool:0,stopReason:'pool_exhausted'}}),false);
const eligible=[hotel('5',true),hotel('6',true)];state.hotels.push(...eligible);assert.equal(ctx.collectorMaybeContinue({...autoJob,revision:11}),false);assert.equal(JSON.stringify(state.people),beforePeople);
// AI sees surviving unknown candidates before excluded history; no forced second
// candidate, no preference changes and no AI call.
ctx.decisionScopedHotels=()=>[excluded,unknown].map(h=>{const {derivedHotel,...packageMatch}=ctx.HotelPackageMatch.build(h,state.people,state.trip);return {...derivedHotel,packageMatch};});
const ai=fs.readFileSync(new URL('../public/ai.js',import.meta.url),'utf8');vm.runInContext(ai.match(/^function analysisHotels.*$/m)[0],ctx);
assert.equal(ctx.analysisHotels().length,1);assert.equal(ctx.analysisHotels()[0].id,unknown.id);assert(!Object.hasOwn(ctx.analysisHotels()[0],'packageMatch'));
console.log('PASS requirements-review continuation: exact-trip confirmed exclusions, smartWash transport, 0.2.8 capability, same-pool command, append-only history, bounded/idempotent automatic next batch, paused/failure/exhaustion stops and unknown-first AI candidates. Synthetic offline fixtures only.');
