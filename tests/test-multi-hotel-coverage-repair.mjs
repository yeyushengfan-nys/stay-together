import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleAIRequest} from '../lib/hotel-ai.mjs';
const bundle=JSON.parse(await readFile(new URL('fixtures/beijing-room-page-bundle.json',import.meta.url),'utf8'));
const Q=globalThis.StayQuoteEvidence;
const hotels=['h1','h2','h3'].map(id=>({id,name:bundle.offers[0].hotel,city:'北京',room:bundle.offers[0].room,price:null,facts:{},evidence:[],quoteBundle:structuredClone(bundle),demo:false}));
const input={mode:'trip',trip:bundle.query,people:[{id:'p',name:'Tester',budget:500,budgetHard:true,weights:{}}],hotels};
const assessments=hotels.map(h=>({hotel_id:h.id,explanation:'Mock fixture',citations:['ctrip','tongcheng'].map(p=>{const o=bundle.offers.find(o=>o.provider===p);return{source_id:Q.sourceId(h.id,o),quote:o.cancellation};})}));
const result=items=>({summary:'Mock only',offer_assessments:items,recommendations:[],pending:[],not_selected:[],limitations:[]});
async function run(outputs){let calls=0,prompt;const r=await handleAIRequest(new Request('https://fixture.test/api/ai/recommend',{method:'POST',body:JSON.stringify(input)}),{OPENAI_API_KEY:'mock-placeholder'},{local:true,fetcher:async(url,options)=>{prompt=JSON.parse(JSON.parse(options.body).input[0].content[0].text);const x=outputs[calls++];return Response.json({id:'mock-'+calls,status:'completed',model:'mock',usage:{input_tokens:1,output_tokens:1},output:[{content:[{type:'output_text',text:JSON.stringify(x)}]}]});}});return{status:r.status,data:await r.json(),calls,prompt};}
let r=await run([result(assessments.slice(0,2)),result(assessments)]);
assert.equal(r.status,200);assert.equal(r.calls,2);assert.equal(r.data.attempts[0].code,'missing_platform_evidence');assert.equal(r.data.attempts[0].quote_coverage_issue.hotel_id,'h3');assert.equal(r.data.attempts[0].quote_coverage_issue.assessment_count,0);assert.equal(r.data.result.offer_assessments.length,3);
assert.equal(r.prompt.quote_coverage_required.length,3);assert.equal(r.prompt.hotels[0].quoteBundle.offers[0].evidence,undefined);assert(!r.prompt.sources[r.prompt.hotels[0].quoteBundle.offers[0].source_id].text.includes('页面采集原文'));assert(r.prompt.hotels[0].quoteBundle.offers.length<bundle.offers.length);
const oneProvider=structuredClone(assessments);oneProvider[2].citations.pop();r=await run([result(oneProvider),result(oneProvider)]);
assert.equal(r.status,502);assert.equal(r.calls,2);assert.equal(r.data.error.code,'missing_platform_evidence');assert.equal(r.data.error.attempts.length,2);assert.deepEqual(r.data.error.attempts[1].quote_coverage_issue.missing_providers,['tongcheng']);assert.equal(r.data.result,undefined);
console.log('PASS three-hotel omission is repaired once, and repeated missing-platform evidence remains rejected.');
console.log('PASS compact target packages keep explicit source IDs; raw page text stays server-side and strict validation is unchanged; mock only.');
