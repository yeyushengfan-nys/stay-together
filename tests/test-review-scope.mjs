import assert from 'node:assert/strict';
import {validateSnapshot,checkRecommendation,assembleRecommendationResult,handleAIRequest,hardConditions} from '../lib/hotel-ai.mjs';

// Synthetic source text and mocked model responses only. No personal data,
// credentials, saved travel records or paid API/network calls are used.
const people=[
 {id:'me',name:'模拟甲',budget:500,budgetHard:true,requireSmart:true,weights:{}},
 {id:'friend',name:'模拟乙',budget:400,budgetHard:true,weights:{},conditions:[{id:'quiet',mode:'must'}]}
];
const reviews=[
 {id:'target',confirmed:true,demo:true,room:'合成双床房',platform:'其他',text:'【公开住客评价：合成测试】\n住客短引：“房间干净，夜间安静。”',claims:{}},
 {id:'other',confirmed:true,demo:true,room:'合成大床房',platform:'其他',text:'【公开住客评价：合成测试】\n住客短引：“床单有污渍。”',claims:{}},
 {id:'guest-request',confirmed:true,demo:true,room:'合成双床房',platform:'其他',text:'【公开住客评价：合成测试】\n住客短引：“我要求加一床被子，服务员很快送来。”',claims:{}},
 {id:'guest-standard',confirmed:true,demo:true,room:'合成双床房',platform:'其他',text:'【公开住客评价：合成测试】\n住客短引：“房间没有达到我的要求。”',claims:{}}
];
const raw={mode:'demo',trip:{city:'模拟城市',checkin:'2027-03-01'},people,hotels:[{id:'h',demo:true,name:'合成酒店',city:'模拟城市',room:'合成双床房',price:null,facts:{smart:false,quiet:true},evidence:reviews}]};
const before=JSON.stringify(raw),{snapshot,sources}=validateSnapshot(raw),quotes=reviews.map(r=>({source_id:r.id,quote:r.text.match(/“([^”]+)”/)[1]}));
assert(hardConditions(snapshot.hotels[0],[people[0]]).blocked.some(x=>x.includes('智能马桶')));
assert(!hardConditions(snapshot.hotels[0],[people[1]]).blocked.some(x=>x.includes('智能马桶')));
const safe='目标房型有清洁和夜间安静的正面反馈，另一房型有床品清洁反例。反馈仅限作者当时入住的房型，不能保证未来体验。';
const actual='同时已核实目标房型不是智能马桶，朋友的硬要求直接冲突。';
const answer=explanation=>({summary:'合成测试，只检验字段职责。',review_assessments:[{hotel_id:'h',explanation,citations:structuredClone(quotes)}],offer_assessments:[],recommendations:[],pending:[],not_selected:[],limitations:[]});
for(const text of [
 actual,
 '智能马桶是我必须满足的条件。',
 '朋友要求智能马桶，所以不能选择。',
 '模拟甲的硬要求直接冲突。',
 '模拟乙的预算在这间房型得到满足。',
 '这间房符合同行人的必要条件。',
 '这间房不符合另一位同行人的底线。',
 '朋友要智能马桶；这间没有，所以应排除。',
 '不能忽视：朋友的硬要求直接冲突。',
 '两人的硬要求都已满足。',
 '该酒店预算低于上限。',
 '不能据此判断预算，但朋友的预算已满足。',
 '这家满足所有必要条件。',
 '原文“朋友的硬要求直接冲突”，所以无法选择。',
 '“朋友”要求智能马桶。',
 '“我”的底线是智能马桶。'
])assert.throws(()=>checkRecommendation(answer(text),snapshot,sources),e=>e.code==='invalid_review_scope');
for(const text of [
 safe,
 '原文未提供价格，不能据此判断预算。',
 '住客原文“我要求加一床被子，服务员很快送来。”说明一次服务响应体验，不能保证未来入住。',
 '原文“房间没有达到我的要求。”仅代表作者当次体验。',
 '住客提到曾要求换房，房型日期未注明，不能推广到当前目标房型。',
 '这条评价的入住日期未知，其他房型的清洁反例不能推广为全店结论。'
])checkRecommendation(answer(text),snapshot,sources);
// A valid guest quote does not exempt the surrounding new member judgment.
assert.throws(()=>checkRecommendation(answer('住客原文“我要求加一床被子，服务员很快送来。”所以朋友的硬要求冲突。'),snapshot,sources),e=>e.code==='invalid_review_scope');
// The internal fixed-hotel review object is checked after program citation
// assembly too; malformed semantics are not rewritten into acceptable text.
const internal=explanation=>({...answer(explanation),review_assessments:{h:explanation}});
assert.throws(()=>assembleRecommendationResult(internal(actual),snapshot,sources),e=>e.code==='invalid_review_scope');
const assembled=assembleRecommendationResult(internal(safe),snapshot,sources);assert.equal(assembled.review_assessments[0].explanation,safe);assert.equal(assembled.review_assessments[0].citations.length,reviews.length);
const fakeCitation=answer(safe);fakeCitation.review_assessments[0].citations[0].quote='不存在的原文';assert.throws(()=>checkRecommendation(fakeCitation,snapshot,sources),e=>e.code==='unverified_citation');

let calls=0,sentPrompt,instructions;
const request=()=>new Request('https://fixture.test/api/ai/recommend',{method:'POST',body:JSON.stringify(raw)});
const response=await handleAIRequest(request(),{OPENAI_API_KEY:'mock-placeholder'},{local:true,fetcher:async(_url,options)=>{
 calls++;const body=JSON.parse(options.body);sentPrompt=JSON.parse(body.input[0].content[0].text);instructions=body.instructions;
 return Response.json({status:'completed',id:'mock-review-scope-'+calls,model:'mock',output:[{content:[{type:'output_text',text:JSON.stringify(internal(calls===1?actual:safe))}]}]});
}});
assert.equal(response.status,200);const out=await response.json();assert.equal(calls,2);assert.equal(out.attempts[0].status,'rejected');assert.equal(out.attempts[0].code,'invalid_review_scope');assert.equal(out.attempts[1].status,'accepted');assert.equal(out.result.review_assessments[0].explanation,safe);assert(!JSON.stringify(out.result).includes(actual));
assert(instructions.includes('只讨论客评原文、正反体验和房型日期范围'));assert(instructions.includes('不能夹带同行人硬要求归属'));
const members=new Map(sentPrompt.member_requirements.map(p=>[p.member_id,p]));assert(members.get('me').required_condition_ids.includes('smart'));assert(!members.get('friend').required_condition_ids.includes('smart'));
let failedCalls=0;
const rejected=await handleAIRequest(request(),{OPENAI_API_KEY:'mock-placeholder'},{local:true,fetcher:async()=>{
 failedCalls++;return Response.json({status:'completed',id:'mock-review-denied-'+failedCalls,model:'mock',output:[{content:[{type:'output_text',text:JSON.stringify(internal(actual))}]}]});
}});
assert.equal(rejected.status,502);const failure=await rejected.json();assert.equal(failedCalls,2);assert(failure.error.attempts.every(a=>a.code==='invalid_review_scope'));assert(!failure.result);
assert.equal(JSON.stringify(raw),before);
console.log('PASS review scope: member/hard-budget judgments rejected, literal guest requests and scoped positive/negative evidence preserved, fake citations still rejected, one bounded regeneration then failure retained, preferences unchanged. Mock only.');
