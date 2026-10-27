// Explicit live integration check; reads the ignored local credential without printing it.
import {readFile,writeFile} from 'node:fs/promises';
import {requestModel,AppError,mapAPIError} from '../lib/hotel-ai.mjs';
import {researchHotels} from '../lib/hotel-research.mjs';
const lines=(await readFile('.env.local','utf8')).split(/\r?\n/),env={OPENAI_MODEL:'gpt-5.4-mini'};
for(const line of lines)if(line.startsWith('OPENAI_API_KEY='))env.OPENAI_API_KEY=line.slice(line.indexOf('=')+1).trim().replace(/^["']|["']$/g,'');
try{const result=await researchHotels({city:'北京',names:['北京瑰丽酒店','北京璞瑄酒店']},env,{fetcher:fetch,requestModel,AppError,mapAPIError});await writeFile('../tmp/beijing-research-live.json',JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,hotels:result.result.hotels.map(h=>({name:h.name,items:h.items.length,coverage:h.coverage})),sources:result.sources.length,searchCalls:result.search_call_count,model:result.model}));}catch(e){console.log(JSON.stringify({ok:false,code:e.code,message:e.message}));process.exitCode=1;}
