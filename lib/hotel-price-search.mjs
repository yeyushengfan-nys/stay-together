// Official FlyAI search transport, not a hotel inventory/room-rate API.
// Protocol follows @fly-ai/flyai-cli 1.0.16. Production requires the owner's key;
// the SDK's shared demo API key is deliberately never used here.
import {createHash,createHmac,randomBytes} from 'node:crypto';
const endpoint='https://flyai.open.fliggy.com/mcp';
const sdkProtocolSigningDefault='XSbdYnucPARDc9knhD8+X6hxdD1Nh6ZGI6Hadg25kBw=';
const sha=s=>createHash('sha256').update(s).digest('hex');
export class PriceError extends Error {constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}
export function validatePriceQuery(raw,now=Date.now()){
 const x=raw?.query||raw||{},date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 const q={city:String(x.city||'').trim(),area:String(x.area||'').trim(),checkin:x.checkin,checkout:x.checkout,rooms:Number(x.rooms??1),adults:Number(x.adults??2)};
 const chinaToday=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 if(!q.city||q.city.length>40||q.area.length>120)throw new PriceError('invalid_place','请填写城市，区域可留空。');
 if(!date(q.checkin)||!date(q.checkout)||q.checkout<=q.checkin||q.checkin<chinaToday)throw new PriceError('invalid_dates','请填写有效的入住和退房日期，入住日期不能早于北京时间今天。');
 if((Date.parse(q.checkout)-Date.parse(q.checkin))/86400000>28)throw new PriceError('stay_too_long','第一版一次查询最多28晚。');
 if(!Number.isInteger(q.rooms)||q.rooms<1||q.rooms>4||!Number.isInteger(q.adults)||q.adults<q.rooms||q.adults>8)throw new PriceError('invalid_occupancy','请核对房间数与成人数：最多4间、8位成人，每间至少1位成人。');
 const people=Array.isArray(raw?.people)?raw.people:[];
 const budgets=people.map(p=>Number(p.budget)).filter(n=>Number.isFinite(n)&&n>0&&n<=100000);
 q.budget=budgets.length?Math.min(...budgets):null;
 // Only structured bed preference can be passed to this provider. No names,
 // personal notes, screenshots, smart-toilet or hygiene claims leave this route.
 q.twinBeds=people.some(p=>Array.isArray(p.conditions)&&p.conditions.some(c=>c?.id==='twinBeds'&&c.mode==='must'));
 if(x.targetHotels!==undefined){
  if(!Array.isArray(x.targetHotels)||!x.targetHotels.length||x.targetHotels.length>4)throw new PriceError('invalid_targets','一次只能核对1—4家指定酒店。');
  q.targetHotels=x.targetHotels.map(t=>({name:String(t?.name||'').trim(),address:String(t?.address||'').trim()}));
  if(q.targetHotels.some(t=>!t.name||t.name.length>80||!t.address||t.address.length>120))throw new PriceError('invalid_targets','指定酒店需要名称和可核对的街道地址。');
 }
 return q;
}
export function priceProviderStatus(env){return {complete_quote_channels:0,search_provider:{id:'fliggy_flyai',name:'飞猪官方酒店搜索',configured:!!env.FLYAI_API_KEY,capability:'hotel_search_reference_only'},platforms:['携程','同程','飞猪','去哪儿'].map(name=>({name,complete_quote_connected:false,status:'尚未接入正式房型报价'})),message:'尚无已开通的完整报价渠道；普通会员登录不等于网站API权限。'};}
export async function callFlyAI(query,env,{fetcher=fetch,now=Date.now(),timeoutMs=25000}={}){
 if(!env.FLYAI_API_KEY)throw new PriceError('provider_not_configured','尚未配置正式酒店数据接口，本次没有发起外部查价。',503);
 const args={destName:query.city,checkInDate:query.checkin,checkOutDate:query.checkout,limit:query.keyword?20:6,...(!query.keyword?{sort:'price_asc'}:{})};
 if(query.area)args.poiName=query.area;
 if(query.budget)args.maxPrice=query.budget;
 if(query.twinBeds)args.hotelBedTypes='双床房';
 if(query.keyword)args.keyWords=query.keyword;
 const body=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'search_hotels',arguments:args}});
 const authorization='Bearer '+String(env.FLYAI_API_KEY).trim(),timestamp=String(now),nonce=randomBytes(16).toString('hex');
 const sign=createHmac('sha256',env.FLYAI_SIGN_SECRET||sdkProtocolSigningDefault).update(['POST','/mcp',timestamp,nonce,sha(body),sha(authorization)].join('\n')).digest('base64url');
 let response;
 try{response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream',Authorization:authorization,'x-flyai-sign-ver':'7','x-flyai-sign-alg':'hmac-sha256','x-flyai-ts':timestamp,'x-flyai-nonce':nonce,'x-flyai-sign':sign,'User-Agent':'StayTogether-hotel-search/1.0'},body,signal:AbortSignal.timeout(timeoutMs),redirect:'manual'});}catch(e){const safe=String(e?.message||'').replaceAll(String(env.FLYAI_API_KEY),'[REDACTED]').replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').slice(0,350);console.error('FlyAI transport failure',String(e?.name||'Error'),safe);throw new PriceError('provider_unreachable','酒店数据服务暂时无法连接或超时；没有用旧价格替代。',502);}
 if(response.status>=300&&response.status<400)throw new PriceError('provider_redirect_rejected','酒店接口返回了重定向，已停止请求，密钥没有转发到其他地址。',502);
 if(response.status===401||response.status===403)throw new PriceError('provider_authorization','酒店数据接口尚未获授权，或正式密钥已失效。',502);
 if(response.status===429)throw new PriceError('provider_rate_limit','酒店数据接口调用额度或频率已达上限，请稍后重试。',429);
 if(!response.ok)throw new PriceError('provider_failed','酒店数据服务此次未完成查询。',502);
 const text=await response.text();if(text.length>1500000)throw new PriceError('provider_response_large','酒店数据返回过大，本次未采用。',502);
 let rpc;try{if(response.headers.get('content-type')?.includes('text/event-stream')){const events=text.replace(/\r\n/g,'\n').split('\n\n').flatMap(e=>{const line=e.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');try{return [JSON.parse(line)];}catch{return [];}});rpc=events.findLast(e=>e.result||e.error);}else rpc=JSON.parse(text);}catch{throw new PriceError('provider_invalid_response','酒店数据格式异常，本次未采用。',502);}
 if(rpc?.error||rpc?.result?.isError)throw new PriceError('provider_tool_failed','酒店搜索接口未成功执行，请检查该账号的接口权限。',502);
 let data;try{data=JSON.parse(rpc.result.content.find(c=>c.type==='text').text);}catch{throw new PriceError('provider_invalid_response','酒店数据格式异常，本次未采用。',502);}
 if(data.status!==0||!Array.isArray(data.data?.itemList))throw new PriceError('provider_search_failed','酒店数据服务未返回有效候选。',502);
 return {data,arguments_sent:args};
}
export function normalizeFlyAI(data,query,now=Date.now()){
 const hotels=data.data.itemList.slice(0,6).map(item=>{
  const priceRaw=typeof item.price==='string'?item.price:typeof item.price==='number'?String(item.price):'';
  // ¥3x is a masked string, never ¥3. An unmasked hotel-search price is still
  // only a reference without dates/occupancy/room/rate-plan confirmation.
  const masked=/[xX*?？]/.test(priceRaw),numeric=!masked&&/^(?:¥|￥)?\s*\d+(?:\.\d{1,2})?$/.test(priceRaw);
  const reference=numeric?Number(priceRaw.replace(/[¥￥\s]/g,'')):null;
  let source='';try{const u=new URL(item.detailUrl);if(u.protocol==='https:'&&['router.feizhu.com','www.fliggy.com','h5.m.taobao.com'].includes(u.hostname))source=u.href;}catch{}
  return {id:String(item.shId||'').slice(0,80),name:String(item.name||'').slice(0,160),address:String(item.address||'').slice(0,240),source,provider:'飞猪',price_raw:priceRaw.slice(0,60),price_status:masked?'masked':reference!==null?'reference_only':'not_returned',reference_price:reference,price_basis:null,total:null,currency:/[¥￥]/.test(priceRaw)?'CNY':null,comparable:false,room:null,breakfast:null,cancellation:null,tax_included:null};
 }).filter(h=>h.id&&h.name);
 return {query,retrieved_at:new Date(now).toISOString(),mode:'official_search_not_full_quotes',complete:false,offers:[],hotels,provider_message:String(data.systemMessage||'').slice(0,700),limitations:['此搜索没有确认房型、入住人数、早餐、取消和税费，不能用于预算通过或最低价判断。','部分区域筛选可能没有被满足，请核对酒店地址。','携程、同程和去哪儿的正式报价接口尚未开通；没有把未调用的平台标成已检索。'],message:hotels.some(h=>h.price_status==='masked')?'官方接口返回了脱敏价格，无法进行真实比价。':'取得官方搜索结果，尚未取得同条件完整报价。'};
}
const limits=new Map();
// A search keyword is not an identity guarantee: the live API returned other
// hotels for 上海大酒店. Require both name and street address before assigning money.
export function targetHotelMatches(item,target){
 const compact=s=>String(s||'').replace(/[\s，,。·（）()]/g,'');
 return compact(item.name)===compact(target.name)&&compact(item.address).includes(compact(target.address));
}
export async function searchTargetHotels(query,env,options={}){
 const hotels=[],missing=[],arguments_sent=[];
 for(const target of query.targetHotels){
  try{
   // Diagnostic lookup must show the requested hotel even if over budget;
   // no preference is changed and no reference price passes budget checks.
   // The provider failed to find 国际饭店 when its address was appended to
   // the keyword. Search distinctive names directly; disambiguate generic
   // names such as 上海大酒店 with the address, then verify both in all cases.
   const localName=target.name.replace(query.city,'');
   const keyword=/^(酒店|大酒店|饭店|宾馆)$/.test(localName)?target.name+' '+target.address:target.name;
   const out=await callFlyAI({...query,area:'',budget:null,twinBeds:false,keyword},env,{...options,timeoutMs:9000});
   arguments_sent.push(out.arguments_sent);
   const exact=out.data.data.itemList.filter(item=>targetHotelMatches(item,target));
   const normalized=normalizeFlyAI({data:{itemList:exact},systemMessage:out.data.systemMessage},query,options.now);
   if(normalized.hotels.length)hotels.push(normalized.hotels[0]);
   else missing.push({name:target.name,code:'identity_not_matched',reason:'未返回名称和地址均匹配的酒店；没有采用其他酒店的金额。'});
  }catch(e){
   if(e?.code==='provider_authorization'||e?.code==='provider_rate_limit')throw e;
   missing.push({name:target.name,code:e instanceof PriceError?e.code:'internal_error',reason:e instanceof PriceError?e.message:'本次未成功核对。'});
  }
 }
 const order=h=>query.targetHotels.findIndex(t=>t.name===h.name);
 hotels.sort((a,b)=>order(a)-order(b));missing.sort((a,b)=>order(a)-order(b));
 return {...normalizeFlyAI({data:{itemList:[]}},query,options.now),hotels,missing,arguments_sent,budget_filter_applied:false,message:`核对到${hotels.length}家指定酒店的搜索结果；金额口径和预订条件未确认，不是同房型完整报价。`};
}
export async function handlePriceSearch(request,env,{fetcher=fetch,now=Date.now()}={}){
 const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(request.method==='GET')return json(priceProviderStatus(env));
 if(request.method!=='POST')return json({error:{code:'method_not_allowed',message:'请求方式不支持。'}},405);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:{code:'origin_rejected',message:'请从酒店网站发起查询。'}},403);
 // Keep new externally billed calls owner-only until a public trial budget and
 // durable rate limit are configured. Existing AI access controls are unchanged.
 const email=request.headers.get('oai-authenticated-user-email');
 const configured=!!env.FLYAI_API_KEY;
 if(configured&&(!env.AI_OWNER_EMAIL||email?.toLowerCase()!==env.AI_OWNER_EMAIL.toLowerCase()))return json({error:{code:'owner_login_required',message:'正式数据接口目前仅网站所有者可联调，访客调用尚未开放。'}},401);
 try{
  if(Number(request.headers.get('content-length'))>20000)throw new PriceError('input_too_large','查询内容过长。',413);
  const raw=await request.text();if(raw.length>20000)throw new PriceError('input_too_large','查询内容过长。',413);
  let body;try{body=JSON.parse(raw);}catch{throw new PriceError('invalid_json','查询内容格式不正确。');}
  const q=validatePriceQuery(body,now);
  if(!configured)throw new PriceError('provider_not_configured','自动查价尚未开通正式报价权限，本次未向平台发起请求。你的偏好和历史价格记录未改变。',503);
  const recent=(limits.get(email)||[]).filter(t=>now-t<60000),weight=q.targetHotels?.length||1;if(recent.length+weight>4)throw new PriceError('slow_down','一分钟最多请求4次酒店搜索，请稍后重试。',429);recent.push(...Array(weight).fill(now));limits.set(email,recent);
  const start=Date.now();
  const result=q.targetHotels?await searchTargetHotels(q,env,{fetcher,now}):await (async()=>{const out=await callFlyAI(q,env,{fetcher,now});return {...normalizeFlyAI(out.data,q,now),arguments_sent:out.arguments_sent};})();
  return json({...result,elapsed_ms:Date.now()-start,platforms_called:['飞猪官方搜索'],platforms_not_called:['携程','同程','去哪儿']});
 }catch(e){return json({error:{code:e instanceof PriceError?e.code:'internal_error',message:e instanceof PriceError?e.message:'查询暂时未完成，请稍后重试。'},complete:false,offers:[]},e instanceof PriceError?e.status:500);}
}
