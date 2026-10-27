// Local UI QA only. Deliberately does not load any API credentials.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {handleAIRequest} from '../lib/hotel-ai.mjs';
import {handlePriceSearch} from '../lib/hotel-price-search.mjs';
const root=resolve('public');
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1:8130');if(url.pathname.startsWith('/api/ai/')||url.pathname==='/api/hotel-prices'){let body='';for await(const chunk of req){body+=chunk;if(body.length>10000000)throw new Error('too large');}const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body}:{})});const result=url.pathname==='/api/hotel-prices'?await handlePriceSearch(request,{}):await handleAIRequest(request,{}, {local:true});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;}const file=resolve(root,'.'+(url.pathname==='/'?'/workspace.html':decodeURIComponent(url.pathname)));if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}const content=await readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream'});res.end(content);}catch{res.writeHead(404);res.end('Not found');}}).listen(8130,'127.0.0.1',()=>console.log('Local UI QA (no credentials, no paid calls): http://127.0.0.1:8130'));
