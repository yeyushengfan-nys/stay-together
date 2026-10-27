import assert from 'node:assert/strict';
import {handleAIRequest} from '../lib/hotel-ai.mjs';
// Explicitly synthetic demo data: no private capture, account or real trip is
// needed to verify the production handler's member-specific prompt contract.
const input={
 mode:'demo',scenario:'synthetic_member_context_test',
 trip:{city:'模拟城市',checkin:'2027-03-01',checkout:'2027-03-03',rooms:1,adults:2},
 people:[
  {id:'me',name:'模拟甲',budget:800,budgetHard:true,requireSmart:true,weights:{price:2,facilities:3},conditions:[{id:'freeCancel',mode:'must'}]},
  {id:'friend',name:'模拟乙',budget:465,budgetHard:true,weights:{price:3,facilities:2},conditions:[{id:'quiet',mode:'must'},{id:'breakfast',mode:'must'}]}
 ],
 hotels:[{id:'synthetic-hotel',name:'合成测试酒店',city:'模拟城市',demo:true,room:'合成双床房',price:null,metro:null,facts:{smart:null,quiet:null,breakfast:false,freeCancel:true},evidence:[]}]
};
const originalInput=JSON.stringify(input);
let prompt,apiCalls=0;
const response=await handleAIRequest(new Request('http://127.0.0.1/api/ai/recommend',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),{OPENAI_API_KEY:'local-test-placeholder'},{local:true,fetcher:async(url,options)=>{
 apiCalls++;prompt=JSON.parse(JSON.parse(options.body).input[0].content[0].text);
 return Response.json({status:'completed',model:'mock-test-only',output:[{content:[{type:'output_text',text:JSON.stringify({summary:'Test fixture',recommendations:[],pending:[],not_selected:[],limitations:[]})}]}]});
}});
assert.equal(response.status,200);assert.equal(apiCalls,1);
const members=prompt.member_condition_checks[0].members,me=members.find(m=>m.member_id==='me'),friend=members.find(m=>m.member_id==='friend');
assert.equal(me.budget_cny_per_room_per_night,800);assert.equal(friend.budget_cny_per_room_per_night,465);
assert(!me.unknown.some(s=>s.includes('安静')));assert(friend.unknown.some(s=>s.includes('安静')));
assert(!me.blocked.some(s=>s.includes('早餐')));assert(friend.blocked.some(s=>s.includes('早餐')));
assert(me.unknown.some(s=>s.includes('智能马桶')));assert(!friend.unknown.some(s=>s.includes('智能马桶')));
assert(me.unknown.some(s=>s.includes('房价')&&s.includes('预算金额已提供')));
assert(friend.unknown.some(s=>s.includes('房价')&&s.includes('预算金额已提供')));
const ownRequirements=prompt.member_requirements;
assert.deepEqual(ownRequirements.find(m=>m.member_id==='me').required_condition_ids,['budget','smart','freeCancel']);
assert.deepEqual(ownRequirements.find(m=>m.member_id==='friend').required_condition_ids,['budget','quiet','breakfast']);
assert.equal(JSON.stringify(input),originalInput);
console.log('PASS production handler sends correct member-specific requirements, known budgets and unknown prices; mock only.');
