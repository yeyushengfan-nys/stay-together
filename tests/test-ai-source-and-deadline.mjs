import assert from 'node:assert/strict';
import {requestModel,validateSnapshot,constrainedRecommendationSchema,hardConditions,checkRecommendation} from '../lib/hotel-ai.mjs';

const env={OPENAI_API_KEY:'mock-placeholder'};
let seenSignal;
await assert.rejects(requestModel(env,[],'',{},'mock',{timeoutMs:15,fetcher:async(_url,options)=>{seenSignal=options.signal;return new Promise(()=>{});}}),e=>e.code==='ai_network_error');
assert(seenSignal.aborted,'Deadline also aborts the upstream fetch.');
await assert.rejects(requestModel(env,[],'',{},'mock',{timeoutMs:15,fetcher:async()=>({ok:true,json:()=>new Promise(()=>{})})}),e=>e.code==='ai_network_error');
await assert.rejects(requestModel(env,[],'',{},'mock',{fetcher:async()=>Response.json({error:{code:'insufficient_quota'}},{status:429})}),e=>e.code==='api_quota_exhausted');
await assert.rejects(requestModel(env,[],'',{},'mock',{fetcher:async()=>new Response('not JSON')}),e=>e.code==='invalid_ai_response');

const input={mode:'demo',trip:{city:'Fixture'},people:[{id:'p',name:'Tester',budget:500,budgetHard:true,weights:{}}],hotels:['a','b'].map(id=>({id,name:'Synthetic '+id,demo:true,price:200,facts:{},evidence:[{id:'review-'+id,confirmed:true,demo:true,text:'Room '+id+' is clean.',claims:{}}]}))};
const {snapshot,sources}=validateSnapshot(input),checks=snapshot.hotels.map(h=>hardConditions(h,snapshot.people));
const schema=constrainedRecommendationSchema(snapshot,checks,sources);
for(const item of schema.properties.recommendations.items.anyOf){
  const id=item.properties.hotel_id.enum[0];
  assert.deepEqual(item.properties.reasons.items.properties.citations.items.properties.source_id.enum,['review-'+id,'hotel:'+id]);
  assert.deepEqual(item.properties.tradeoffs.items.properties.citations.items.properties.source_id.enum,['review-'+id,'hotel:'+id]);
}
for(const item of schema.properties.pending.items.anyOf){
  const id=item.properties.hotel_id.enum[0];
  assert(item.properties.citations.items.anyOf.every(pair=>pair.properties.source_id.enum.every(source=>sources.get(source).hotel_id===id)));
}
const wrong={recommendations:[{hotel_id:'a',headline:'Test only',reasons:[{member_id:'p',explanation:'Wrong source',citations:[{source_id:'hotel:b',quote:'Synthetic b'}]}],tradeoffs:[]}],pending:[],not_selected:[]};
assert.throws(()=>checkRecommendation(wrong,snapshot,sources),e=>e.code==='unverified_citation'&&e.citation_issue.reason==='wrong_hotel');
console.log('PASS fetch/body deadlines, abort cleanup, correct quota/format classification, per-hotel source schemas and unchanged wrong-hotel rejection. Mock only.');
