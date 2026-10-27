import assert from 'node:assert/strict';
import {handleAIRequest} from '../lib/hotel-ai.mjs';
const input={mode:'demo',trip:{city:'Test'},people:[{id:'p',name:'Tester',budget:500,budgetHard:true,weights:{}}],hotels:[{id:'h',name:'Fixture',demo:true,price:null,facts:{},evidence:[{id:'e',confirmed:true,demo:true,text:'Original sentence.'}]}]};
const result=quote=>({summary:'Fixture only',recommendations:[],pending:[{hotel_id:'h',question:'Confirm missing data',citations:[{source_id:'e',quote}]}],not_selected:[],limitations:[]});
const req=()=>new Request('https://fixture.test/api/ai/recommend',{method:'POST',body:JSON.stringify(input)});
const env={OPENAI_API_KEY:'mock-placeholder'};
async function run(outputs){let calls=0,bodies=[];const response=await handleAIRequest(req(),env,{local:true,fetcher:async(url,options)=>{bodies.push(JSON.parse(options.body));const value=outputs[calls++];return Response.json({id:'mock-'+calls,status:'completed',model:'mock-only',usage:{input_tokens:10,output_tokens:5},output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});}});return{status:response.status,data:await response.json(),calls,bodies};}
let r=await run([result('Invented sentence.'),result('Original sentence.')]);
assert.equal(r.status,200);assert.equal(r.calls,2);assert.deepEqual(r.data.attempts.map(a=>a.status),['rejected','accepted']);assert.equal(r.data.attempts[0].citation_issue.reason,'quote_not_in_source');assert(r.bodies[1].instructions.includes('Invented sentence.'));assert(r.data.result.pending.every(q=>q.citations.length===0));assert(r.data.result.pending.some(q=>q.question.includes('最终含税')));
r=await run([result('Invented sentence.'),result('Still invented.')]);
assert.equal(r.status,502);assert.equal(r.calls,2);assert.equal(r.data.error.code,'unverified_citation');assert.equal(r.data.error.attempts.length,2);assert.equal(r.data.result,undefined);
r=await run([result('Original sentence.')]);assert.equal(r.calls,1);assert.equal(r.status,200);
const violated={...result('Original sentence.'),recommendations:[{hotel_id:'h',headline:'Invalid',reasons:[],tradeoffs:[]}]};
r=await run([violated]);assert.equal(r.status,502);assert.equal(r.calls,1);assert.equal(r.data.error.code,'hard_condition_failed');
console.log('PASS bounded citation repair, retained rejection/usage, strict second rejection, no retry on hard constraints; mock only.');
