import assert from 'node:assert/strict';
import {validateSnapshot,handleAIRequest} from './lib/hotel-ai.mjs';
const p={id:'p',name:'我',budget:800,weights:{}},h={id:'r',name:'北京瑰丽酒店',city:'北京',demo:false,price:null,metro:null,facts:{smart:null,mold:null},evidence:[]},base={mode:'trip',trip:{city:'北京'},people:[p],hotels:[h]};
assert.equal(validateSnapshot(base).snapshot.hotels.length,1);
for(const [input,code]of [[{...base,hotels:[h,{...h,id:'d',demo:true}]},'demo_in_real_trip'],[{...base,hotels:[{...h,evidence:[{demo:true}]}]},'demo_in_real_trip'],[{...base,hotels:[{...h,city:'上海'}]},'mixed_cities'],[{...base,mode:'demo'},'real_in_demo'],[{...base,mode:undefined},'mode_required']])assert.throws(()=>validateSnapshot(input),e=>e.code===code);
let called=false;const req=new Request('https://test.example/api/ai/recommend',{method:'POST',body:JSON.stringify({...base,hotels:[{...h,demo:true}]})});const response=await handleAIRequest(req,{OPENAI_API_KEY:'placeholder'},{local:true,fetcher:()=>{called=true;throw Error('must not call');}});assert.equal(response.status,400);assert.equal(called,false,'mixed payload blocked before a paid model call');
console.log('API isolation passed: real/demo/city violations rejected before model calls.');
