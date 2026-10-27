import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {validateSnapshot,handleAIRequest} from '../lib/hotel-ai.mjs';
import '../public/ai-request.js';
// Synthetic diagnostic/privacy fixtures. No real API, credentials or user records.
const Q=globalThis.StayQuoteEvidence,trip={city:'模拟城市',checkin:'2027-03-01',checkout:'2027-03-03',rooms:1,adults:2};
const provider='ctrip',name='合成诊断酒店',room='合成双床房',offer={id:'synthetic-offer',provider,hotel:name,room,bed:'2张单人床',checkIn:trip.checkin,checkOut:trip.checkout,rooms:1,adults:2,children:0,currency:'CNY',stage:'room_list',listNightly:350,breakfast:2,breakfastText:'2份早餐',cancellation:'入住当天18:00前可免费取消',payment:'在线付',capturedAt:'2026-10-27T00:00:00Z',source:'https://hotels.ctrip.com/hotels/123.html',evidence:'PAGE_PRIVATE_MARKER 350元 2份早餐 入住当天18:00前可免费取消'};
const input={mode:'trip',trip,people:[{id:'p',name:'PERSON_PRIVATE_MARKER',budget:500,budgetHard:true,weights:{},conditions:[{id:'quiet',mode:'must'}]}],hotels:[{id:'h',name,city:trip.city,room,price:null,facts:{quiet:null},evidence:[],quoteBundle:{query:{...trip},selected_offer_id:offer.id,offers:[offer]}}]};
const rejected='该房型隔音已确认。SENTENCE_PRIVATE_MARKER <script>alert(1)</script>'+ '长'.repeat(700);
function modelAnswer(raw,review=false){const {snapshot:s}=validateSnapshot(raw),h=s.hotels[0],o=h.quoteBundle.offers[0];return {summary:'合成诊断测试',review_assessments:review?{h:'朋友的硬要求冲突。REVIEW_SENTENCE_PRIVATE_MARKER'}:{},offer_assessments:[],recommendations:[],verification_shortlist:[{hotel_id:'h',decision_scope:'verification_only',price_basis:'room_page_reference',headline:'优先核实候选',reasons:[{member_id:'p',explanation:review?'套餐参考价已取得，隔音仍待核实。':rejected,citations:[{source_id:Q.sourceId('h',o),quote:Q.text(o).split('\n').find(t=>t.startsWith('房型页参考价：'))}]}],verify_next:[]}],pending:[],not_selected:[],limitations:[]};}
const warnings=[],savedConsole={warn:console.warn,log:console.log,error:console.error};
for(const key of Object.keys(savedConsole))console[key]=(...values)=>warnings.push(values.map(String).join(' '));
let failure,reviewFailure,calls=0,repairInstructions='';
try{
 const run=async(raw,review=false)=>{
  let n=0;const response=await handleAIRequest(new Request('https://fixture.test/api/ai/recommend',{method:'POST',headers:{'x-private':'HEADER_PRIVATE_MARKER'},body:JSON.stringify(raw)}),{OPENAI_API_KEY:'KEY_PRIVATE_MARKER'},{local:true,fetcher:async(_url,options)=>{calls++;n++;if(n===2)repairInstructions=JSON.parse(options.body).instructions;return Response.json({status:'completed',id:'resp_diagnostic_'+calls,model:'mock',output:[{content:[{type:'output_text',text:JSON.stringify(modelAnswer(raw,review))}]}]});}});
  assert.equal(response.status,502);return response.json();
 };
 failure=await run(input);
 assert.equal(failure.error.code,'unsafe_verification_claim');assert.equal(failure.error.attempts.length,2);
 const issue=failure.error.attempts[0].verification_issue;
 assert.equal(issue.rejected_text,rejected.slice(0,600));assert.equal(issue.rejected_text.length,600);assert.equal(issue.match_excerpt,'隔音已确认');assert.equal(issue.condition_name,'隔音／安静');assert.equal(issue.condition_rule,2);
 assert(repairInstructions.includes(issue.rejected_text));assert(repairInstructions.includes('match_excerpt'));assert(!failure.result);
 const reviewInput=structuredClone(input);reviewInput.hotels[0].evidence=[{id:'review',confirmed:true,room,platform:'其他',text:'【公开住客评价：合成】\n住客短引：“房间整洁。”',claims:{}}];
 reviewFailure=await run(reviewInput,true);
 assert.equal(reviewFailure.error.code,'invalid_review_scope');assert.equal(reviewFailure.error.attempts[0].review_scope_issue.rejected_text,'朋友的硬要求冲突。REVIEW_SENTENCE_PRIVATE_MARKER');assert(repairInstructions.includes('REVIEW_SENTENCE_PRIVATE_MARKER'));
}finally{Object.assign(console,savedConsole);}
assert.equal(calls,4);assert.equal(warnings.length,2);
for(const text of warnings){for(const marker of ['SENTENCE_PRIVATE_MARKER','REVIEW_SENTENCE_PRIVATE_MARKER','PERSON_PRIVATE_MARKER','HEADER_PRIVATE_MARKER','KEY_PRIVATE_MARKER','PAGE_PRIVATE_MARKER','隔音已确认','rejected_text','match_excerpt','condition_name'])assert(!text.includes(marker));}
const safeLog=JSON.parse(warnings[0]);assert.equal(safeLog.attempts[0].verification_issue.condition_rule,2);assert.deepEqual(Object.keys(safeLog.attempts[0].verification_issue).sort(),['condition_rule','index','rule_id','section']);
// Without owner authorization, the endpoint never supplies attempts or calls upstream.
let deniedCalls=0;const denied=await handleAIRequest(new Request('https://fixture.test/api/ai/recommend',{method:'POST',body:JSON.stringify(input)}),{AI_OWNER_EMAIL:'owner@example.test',OPENAI_API_KEY:'KEY_PRIVATE_MARKER'},{fetcher:async()=>{deniedCalls++;throw new Error('must not run');}});assert.equal(denied.status,401);assert(!((await denied.json()).error.attempts));assert.equal(deniedCalls,0);
// Existing request client must carry owner diagnostics into the error UI.
const client=globalThis.HotelAIRequest.createClient({fetcher:async()=>({ok:false,json:async()=>failure})});await assert.rejects(client.request('recommend',{}),error=>error.attempts[0].verification_issue.rejected_text===rejected.slice(0,600));
const source=fs.readFileSync(new URL('../public/ai.js',import.meta.url),'utf8'),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),ctx={E,billing:'https://example.test/billing'};vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function rejectedAIDetailsHTML'),source.indexOf('const aiRequestClient=')),ctx);
const html=ctx.errorHTML({...failure.error,message:'本次未采用 <script>error</script>'});assert(html.includes('<details'));assert(!html.includes('<details open'));assert(html.includes('查看未采用句子'));assert(html.includes('不是已采用的建议'));assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert(!html.includes('<script>'));assert(html.includes('涉及条件'));assert(html.includes('触发片段'));
const reviewHTML=ctx.errorHTML(reviewFailure.error);assert(reviewHTML.includes('REVIEW_SENTENCE_PRIVATE_MARKER'));assert(!ctx.errorHTML({message:'无诊断',attempts:[]}).includes('<details'));
console.log('PASS bounded owner-only rejection text/match diagnostics and repair feedback; console whitelist excludes original text, names, key and headers; client preserves attempts; collapsed diagnostic UI escapes HTML and labels text as unadopted. Mock only.');
