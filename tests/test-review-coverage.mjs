import assert from 'node:assert/strict';
import {handleAIRequest,reviewEvidence,validateSnapshot,hardConditions} from '../lib/hotel-ai.mjs';
const evidence=[
 {id:'positive',confirmed:true,room:'Twin',platform:'其他',text:'【公开住客评价短引＋人工核对说明】\nMock target-room positive feedback.'},
 {id:'other-room',confirmed:true,room:'Queen',platform:'其他',text:'【公开住客评价短引＋人工核对说明】\nMock other-room no-odor feedback; not Twin.'},
 {id:'negative',confirmed:true,room:'Queen',platform:'其他',text:'【公开住客评价短引＋人工核对说明】\nMock other-room cleaning complaint.'},
 {id:'page',confirmed:true,platform:'携程',text:'【平台页面资料，非住客原话】\nTwin beds.'},
 {id:'summary',confirmed:true,platform:'其他',webResearch:true,text:'Mock AI search summary.'}
];
const h={id:'h',name:'Mock Hotel',city:'Test',room:'Twin',price:null,facts:{quiet:true,smart:null,mold:null},evidence};
const input={mode:'trip',trip:{city:'Test',checkin:'2026-12-24'},people:[{id:'p',name:'Tester',budget:500,budgetHard:true,requireSmart:true,avoidMold:true,weights:{}}],hotels:[h]};
const {snapshot}=validateSnapshot(input);assert.deepEqual(reviewEvidence(snapshot.hotels[0]).map(e=>e.id),['positive','other-room','negative']);
const checks=hardConditions(snapshot.hotels[0],input.people);assert(checks.unknown.some(s=>s.includes('智能马桶')));assert(checks.unknown.some(s=>s.includes('霉味')));
const assessment={hotel_id:'h',explanation:'Mock: target-room and other-room observations are distinct.',citations:evidence.slice(0,3).map(e=>({source_id:e.id,quote:e.text.split('\n')[1]}))};
const answer=reviews=>({summary:'Mock only',review_assessments:reviews,offer_assessments:[],recommendations:[],pending:[],not_selected:[],limitations:[]});
let calls=0,prompt;
const r=await handleAIRequest(new Request('https://fixture.test/api/ai/recommend',{method:'POST',body:JSON.stringify(input)}),{OPENAI_API_KEY:'mock-placeholder'},{local:true,fetcher:async(url,options)=>{prompt=JSON.parse(JSON.parse(options.body).input[0].content[0].text);return Response.json({id:'mock-'+(++calls),model:'mock',status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(answer(calls===1?[{...assessment,citations:assessment.citations.slice(0,2)}]:[assessment]))}]}]});}});
const body=await r.json();assert.equal(r.status,200);assert.equal(calls,2);assert.equal(body.attempts[0].code,'missing_review_evidence');assert.deepEqual(body.attempts[0].review_coverage_issue.missing_source_ids,['negative']);assert.equal(body.result.review_assessments[0].citations.length,3);assert.deepEqual(prompt.review_coverage_required[0].review_ids,['positive','other-room','negative']);assert.equal(body.result.recommendations.length,0);
console.log('PASS marked reviews require all positive/negative citations; omission gets one bounded retry; platform notes are not guest reviews; missing hard evidence stays unknown (mock model).');
