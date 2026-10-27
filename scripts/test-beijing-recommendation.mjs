// Explicit live integration test. Never prints or persists a credential.
import {readFile,writeFile} from 'node:fs/promises';
import {handleAIRequest} from '../lib/hotel-ai.mjs';
if(!process.argv.includes('--live')){console.log('Live API call disabled. Add --live only for an authorized test.');process.exit(0);}
const inputPath=new URL('../public/verification-evidence/beijing-20261101-recheck/ai-input.json',import.meta.url);
const outputPath=new URL('../public/verification-evidence/beijing-20261101-recheck/ai-result.json',import.meta.url);
const env={};
let raw='';try{raw=await readFile(new URL('../.env.local',import.meta.url),'utf8');}catch{}
for(const name of ['OPENAI_API_KEY','OPENAI_MODEL']){
 const line=raw.split(/\r?\n/).find(l=>l.startsWith(name+'='));
 const value=process.env[name]||line?.slice(line.indexOf('=')+1).trim().replace(/^["']|["']$/g,'');
 if(value)env[name]=value;
}
if(!env.OPENAI_API_KEY){console.log('No local credential available; no request sent.');process.exit(1);}
let calls=0,upstream=null;const startedAt=new Date().toISOString(),start=Date.now();
const response=await handleAIRequest(new Request('http://127.0.0.1/api/ai/recommend',{method:'POST',headers:{'content-type':'application/json'},body:await readFile(inputPath,'utf8')}),env,{local:true,fetcher:async(...args)=>{
 calls++;const response=await fetch(...args);
 if(response.ok){const p=await response.clone().json();upstream={model:p.model,usage:p.usage,generatedText:(p.output||[]).flatMap(o=>o.content||[]).filter(p=>p.type==='output_text').map(p=>p.text).join('')};}
 return response;
}});
const body=await response.json();
const result={method:'Project backend handler invoked locally with a real OpenAI response; hosted login/UI path not tested',startedAt,elapsedMs:Date.now()-start,upstreamCalls:calls,httpStatus:response.status,...body,upstream};
await writeFile(outputPath,JSON.stringify(result,null,2));
await writeFile(new URL('./ai-attempt-'+startedAt.replace(/[:.]/g,'-')+'.json',outputPath),JSON.stringify(result,null,2));
console.log(JSON.stringify({httpStatus:response.status,realModel:body.mode==='real_model',recommendations:body.result?.recommendations?.length,blocked:body.result?.condition_checks?.[0]?.blocked,unknown:body.result?.condition_checks?.[0]?.unknown,elapsedMs:result.elapsedMs,upstreamCalls:calls,usage:body.usage,error:body.error?.code}));
if(!response.ok||body.mode!=='real_model'||body.result?.recommendations?.length!==0)process.exitCode=1;
