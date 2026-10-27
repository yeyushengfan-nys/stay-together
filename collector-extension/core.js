export const SITE_ORIGIN='https://stay-together-yusi-1024.yusinn0613.chatgpt.site';
// These city entrance IDs were read from the platforms' visible navigation.
// Unknown cities fail explicitly; they never silently fall back to Shanghai.
export const CITIES={上海:{ctrip:2,tongcheng:321},北京:{ctrip:1,tongcheng:53},杭州:{ctrip:17,tongcheng:383},广州:{ctrip:32,tongcheng:80},深圳:{ctrip:30,tongcheng:91},成都:{ctrip:28,tongcheng:324}};
export const ACTIVE=['discovering','collecting','loading'];
export const PAUSED=['needs_login','needs_verification','needs_review'];
export const hotelKey=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s·・•‧∙⋅()（）]/g,'');
export function trustedSender(sender){try{return new URL(sender.url||sender.tab?.url).origin===SITE_ORIGIN&&Number.isInteger(sender.tab?.id);}catch{return false;}}
export function validateQuery(raw,now=Date.now()){
 const city=String(raw?.city||'').trim().replace(/市$/,'');
 const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 if(!CITIES[city])throw Error('第一版支持上海、北京、杭州、广州、深圳、成都；尚未配置其他城市的客户端入口。');
 if(!validDate(raw.checkin)||!validDate(raw.checkout)||raw.checkin<today||raw.checkout<=raw.checkin||(Date.parse(raw.checkout)-Date.parse(raw.checkin))/86400000>14)throw Error('请填写今天或未来的有效入住日期，最多连续14晚。');
 const adults=Number(raw.adults??2),rooms=Number(raw.rooms??1);
 if(rooms!==1||!Number.isInteger(adults)||adults<1||adults>4||Number(raw.children||0)!==0)throw Error('第一版自动采集支持1间房、1—4位成人、不带儿童；其他人数请在平台人工核对。');
 if(raw.platforms!==undefined&&!Array.isArray(raw.platforms))throw Error('平台参数无效。');
 const platforms=[...new Set(raw.platforms||['ctrip','tongcheng'])];
 if(!platforms.length||platforms.some(p=>!['ctrip','tongcheng'].includes(p)))throw Error('请选择携程或同程。');
 const maxHotels=Number(raw.maxHotels??2);
 if(!Number.isInteger(maxHotels)||maxHotels<1||maxHotels>3)throw Error('每个平台最多采集1—3家酒店。');
 if(raw.hotelNames!==undefined&&(!Array.isArray(raw.hotelNames)||raw.hotelNames.length<1||raw.hotelNames.length>3||raw.hotelNames.some(n=>typeof n!=='string'||!n.trim()||n.length>180)))throw Error('指定酒店名称无效。');
 if(raw.roomName!==undefined&&(typeof raw.roomName!=='string'||raw.roomName.length>180))throw Error('指定房型无效。');
 const budget=raw.budget==null?null:Number(raw.budget);
 if(budget!==null&&(!Number.isFinite(budget)||budget<=0||budget>100000))throw Error('预算必须是有效的每间每晚人民币金额。');
 const required=Array.isArray(raw.required)?[...new Set(raw.required)].filter(k=>['smart','smartWash','laundry','nonSmoking','twinBeds','breakfast','freeCancel','parking','family','petFriendly','accessible','bathtub','gym','pool','invoice','desk','view','lateCheckin','quiet','mold'].includes(k)):[];
 const dp=raw.discoveryPreferences||{},discoveryPreferences={};for(const k of ['priceWeight','transitWeight','newnessWeight','facilitiesWeight'])discoveryPreferences[k]=Number.isFinite(dp[k])?Math.max(0,Math.min(5,dp[k])):3;
 discoveryPreferences.priorityHints=Array.isArray(dp.priorityHints)?[...new Set(dp.priorityHints.filter(k=>['smart','smartWash','laundry','quiet','twinBeds','newness','transit','pool','bathtub','parking','nonSmoking'].includes(k)))].slice(0,10):[];
 if(raw.searchGoal!==undefined&&!['packages','requirements_review'].includes(raw.searchGoal))throw Error('候选检查目标无效。');
 if(raw.excludeHotels!==undefined&&(!Array.isArray(raw.excludeHotels)||raw.excludeHotels.length>30))throw Error('最多传入30家已明确排除的酒店。');
 const excludeHotels=(raw.excludeHotels||[]).map(e=>{
  if(!e||typeof e!=='object'||Array.isArray(e)||e.name!==undefined&&(typeof e.name!=='string'||e.name.length>180)||e.platformIds!==undefined&&(!e.platformIds||typeof e.platformIds!=='object'||Array.isArray(e.platformIds)))throw Error('已排除酒店的身份资料无效。');
  const platformIds={};for(const [provider,id] of Object.entries(e.platformIds||{})){if(!['ctrip','tongcheng'].includes(provider)||typeof id!=='string'||!/^\d{1,14}$/.test(id))throw Error('已排除酒店的平台身份无效。');platformIds[provider]=id;}
  const name=(e.name||'').trim();if(!name&&!Object.keys(platformIds).length)throw Error('已排除酒店需要完整名称或平台身份。');return {name,platformIds};
 });
 if(raw.priceMode!==undefined&&!['reference','checkout'].includes(raw.priceMode))throw Error('价格采集模式无效。');
 return {city,checkin:raw.checkin,checkout:raw.checkout,adults,rooms,children:0,platforms,maxHotels,budget,required,discoveryPreferences,priceMode:raw.priceMode||'reference',searchGoal:raw.searchGoal||'packages',excludeHotels,area:String(raw.area||'').trim().slice(0,100),workflow:raw.workflow==='selection'?'selection':'quotes',...(raw.hotelNames?{hotelNames:[...new Set(raw.hotelNames.map(n=>n.trim()))]}:{}),...(raw.roomName?{roomName:raw.roomName.trim()}:{})};
}
export function excludedCandidate(candidate,provider,query){return (query.excludeHotels||[]).some(e=>e.name&&hotelKey(e.name)===hotelKey(candidate.name||candidate.hotel)||e.platformIds?.[provider]===String(candidate.id||candidate.hotelId));}
const remainingCandidates=job=>(job.candidatePool||[]).slice(job.poolCursor||0).filter(c=>!excludedCandidate(c,job.primaryProvider,job.query)).length;
export function discoveryURL(provider,q,term=''){
 const u=new URL(provider==='ctrip'?'https://hotels.ctrip.com/hotels/list/':'https://www.ly.com/hotel/hotellist');
 if(provider==='ctrip'){u.searchParams.set('cityId',CITIES[q.city].ctrip);u.searchParams.set('cityName',q.city);u.searchParams.set('checkIn',q.checkin);u.searchParams.set('checkOut',q.checkout);u.searchParams.set('crn','1');u.searchParams.set('adult',q.adults);u.searchParams.set('children','0');}
 else{u.searchParams.set('city',CITIES[q.city].tongcheng);u.searchParams.set('inDate',q.checkin);u.searchParams.set('outDate',q.checkout);u.searchParams.set('adultsNumber',q.adults);if(term)u.searchParams.set('keywords',term);}
 return u.href;
}
export function hotelURL(provider,id,q){
 if(!/^\d{1,14}$/.test(String(id)))throw Error('酒店身份无效。');
 const u=new URL(provider==='ctrip'?'https://hotels.ctrip.com/hotels/'+id+'.html':'https://www.ly.com/hotel/hoteldetail');
 if(provider==='ctrip'){u.searchParams.set('checkIn',q.checkin);u.searchParams.set('checkOut',q.checkout);u.searchParams.set('crn','1');u.searchParams.set('adult',q.adults);u.searchParams.set('children','0');}
 else{u.searchParams.set('hotelId',id);u.searchParams.set('inDate',q.checkin);u.searchParams.set('outDate',q.checkout);u.searchParams.set('adultsNumber',q.adults);}
 return u.href;
}
export function allowedTaskURL(value){try{const u=new URL(value);return u.protocol==='https:'&&['hotels.ctrip.com','www.ly.com','passport.ctrip.com','passport.ly.com'].includes(u.hostname);}catch{return false;}}
export function candidateURL(provider,c,q){
 const fallback=hotelURL(provider,c.id,q);if(provider!=='tongcheng'||typeof c.detailUrl!=='string'||c.detailUrl.length>5000)return fallback;
 try{const u=new URL(c.detailUrl);if(u.origin!=='https://www.ly.com'||u.pathname!=='/hotel/hoteldetail'||u.searchParams.get('hotelId')!==String(c.id))return fallback;
  if((u.searchParams.has('inDate')&&u.searchParams.get('inDate')!==q.checkin)||(u.searchParams.has('outDate')&&u.searchParams.get('outDate')!==q.checkout))return fallback;
  const out=new URL(fallback);for(const key of ['prc','cury','traceToken'])if(u.searchParams.has(key))out.searchParams.set(key,u.searchParams.get(key));return out.href;
 }catch{return fallback;}
}
export function loginURL(value){try{return ['passport.ctrip.com','passport.ly.com'].includes(new URL(value).hostname);}catch{return false;}}
export function makeJob(query,tabId,now=Date.now()){
 const primary=query.platforms.includes('ctrip')?'ctrip':query.platforms[0];
 const tasks=query.workflow==='selection'?[{provider:primary,phase:'discover',url:discoveryURL(primary,query,query.area),searchTerm:query.area}]:query.platforms.map(provider=>({provider,phase:'discover',url:discoveryURL(provider,query)}));
 const progressive=query.workflow==='selection'&&query.priceMode==='reference'&&!query.hotelNames?.length;
 return {id:crypto.randomUUID(),query,ownerTabId:tabId,createdAt:now,roundStartedAt:now,updatedAt:now,status:'discovering',message:'准备按行程发现候选，再逐家匹配另一平台',tasks,index:0,offers:[],candidates:[],observations:[],errors:[],events:[],taskTabId:null,retries:0,revision:0,...(progressive?{candidatePool:[],poolCursor:0,primaryProvider:primary,planChecks:[],matchedHotelKeys:[],search:{strategy:'bounded_pool',goal:query.searchGoal||'packages',scope:'仅核对本次已加载的最多12家候选；套餐匹配不代表全部必须条件已证实。',poolSize:0,inspected:0,roundInspected:0,roundStartedAtInspected:0,excludeSkipped:0,target:query.maxHotels,matched:0,inspectionLimit:8,stopReason:null}}:{})};
}
// Matches only observable package constraints. Facilities and subjective reviews
// remain separate evidence checks; this never declares a hotel fully eligible.
export function packageMatches(row,q){
 if(!row||!Number.isFinite(row.listNightly)||row.listNightly<=0||q.budget!=null&&row.listNightly>q.budget)return false;
 const req=q.required||[];
 if(req.includes('breakfast')&&(!Number.isInteger(row.breakfast)||row.breakfast<q.adults))return false;
 if(req.includes('twinBeds')&&!/2张|双床/.test(row.bed+' '+row.room))return false;
 if(req.includes('freeCancel')&&(!/免费取消/.test(row.cancellation)||/不可免费取消|不能免费取消|不支持免费取消|无免费取消/.test(row.cancellation)))return false;
 return !q.roomName||row.room===q.roomName;
}
function enqueuePoolCandidate(job){
 const s=job.search;if(!s)return false;
 if(s.goal!=='requirements_review'&&s.matched>=s.target){s.stopReason='target_met';return false;}
 while(job.poolCursor<job.candidatePool.length&&excludedCandidate(job.candidatePool[job.poolCursor],job.primaryProvider,job.query)){job.poolCursor++;s.excludeSkipped=(s.excludeSkipped||0)+1;}
 if(job.poolCursor>=job.candidatePool.length){s.stopReason='pool_exhausted';return false;}
 if(s.inspected>=s.inspectionLimit){s.stopReason='inspection_limit';return false;}
 const c=job.candidatePool[job.poolCursor++],provider=job.primaryProvider;
 job.candidates.push({...c,provider});s.inspected++;s.roundInspected=s.inspected-(s.roundStartedAtInspected||0);
 job.tasks.push({provider,phase:'rooms',hotelId:c.id,name:c.name,canonicalName:c.name,poolCandidate:true,url:candidateURL(provider,c,job.query)});
 return true;
}
function searchMessage(job){
 const s=job.search,terminal=['completed','failed'].includes(job.status);
 if(s.goal==='requirements_review')return `本批新增检查${s.roundInspected||0}家，累计检查${s.inspected}家；累计套餐匹配${s.matched}家，仅是房型、餐食、取消与参考预算。${terminal?(s.stopReason==='inspection_limit'?'本批最多8家已检查，池内仍有候选可继续。':'本次已加载的候选池已检查完。'):'正在继续检查尚未排除的候选。'}全部必须条件是否已证实由网站证据核验决定，未知不算符合，不代表全城无酒店。`;
 return terminal?`已查${s.inspected}家，至少一平台找到匹配房型、早餐、取消和参考预算的套餐${s.matched}家；${s.stopReason==='target_met'?'已达到候选目标':s.stopReason==='inspection_limit'?'已到本轮最多8家核对上限':'本次已加载的候选池已查完'}。必要设施与评价仍须核实，不代表全城搜索。`:`已查${s.inspected}家，套餐匹配${s.matched}/${s.target}家；不符合时继续查下一家。`;
}
export function continueSelection(job,raw,now=Date.now()){
 if(!job||!['completed','failed'].includes(job.status)||!job.search||!Array.isArray(job.candidatePool))throw Error('当前任务没有可续查的候选池，请先结束任务或重新开始。');
 const query=validateQuery(raw,now);
 if(query.workflow!=='selection'||query.priceMode!=='reference'||query.hotelNames?.length||query.roomName||!query.platforms.includes(job.primaryProvider)||['city','checkin','checkout','rooms','adults','area'].some(k=>String(query[k]??'')!==String(job.query[k]??'')))throw Error('行程、区域或主平台已变化，请按新条件重新开始，不能沿用旧候选池。');
 if(job.poolCursor>=job.candidatePool.length)throw Error('本次已加载候选池已查完，请调整区域或重新搜索；不代表全城没有符合酒店。');
 const exclusions=new Map([...(job.query.excludeHotels||[]),...query.excludeHotels].map(e=>[JSON.stringify([hotelKey(e.name),e.platformIds]),e]));
 if(exclusions.size>30)throw Error('已排除名单超过30家，请开始新的搜索范围。');
 job.query={...query,searchGoal:'requirements_review',excludeHotels:[...exclusions.values()]};
 job.roundStartedAt=now;job.updatedAt=now;job.search.goal='requirements_review';job.search.scope='仅核对本次已加载的最多12家候选；套餐匹配不代表全部必须条件已证实。';
 job.search.roundStartedAtInspected=job.search.inspected;job.search.roundInspected=0;job.search.inspectionLimit=Math.min(12,job.search.inspected+8);job.search.stopReason=null;job.search.excludeSkipped??=0;job.retries=0;job.taskTabId=null;
 const enqueued=enqueuePoolCandidate(job);job.status=enqueued?'collecting':job.offers.length?'completed':'failed';job.message=searchMessage(job);job.revision++;return job;
}
export function normalizeOffer(row,task,q,now=Date.now()){
 const num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
 const raw=String(row.evidence||'').slice(0,2200);
 const total=num(row.total),totalBasisConfirmed=total!==null&&row.totalBasisConfirmed===true;
 // No fallback from cancellation penalties, crossed-out prices or hotel start prices.
 return {id:task.provider+':'+task.hotelId+':'+String(row.rowKey),platform:task.provider==='ctrip'?'携程':'同程',provider:task.provider,hotel:String(task.canonicalName||row.hotel||task.name||''),platformHotelName:String(row.hotel||task.name||''),hotelId:task.hotelId,room:String(row.room||''),bed:String(row.bed||''),breakfast:Number.isInteger(row.breakfast)&&row.breakfast>=0&&row.breakfast<=10?row.breakfast:null,breakfastText:String(row.breakfastText||'未注明'),cancellation:String(row.cancellation||'未注明'),payment:String(row.payment||'未注明'),listNightly:num(row.listNightly),total,baseTotal:num(row.baseTotal),discountTotal:num(row.discountTotal),breakfastConfirmed:row.breakfastConfirmed===true,breakfastSource:String(row.breakfastSource||''),breakfastEvidence:String(row.breakfastEvidence||''),qualification:String(row.qualification||'当前登录账号口径，其他账号可能不同'),nightly:totalBasisConfirmed?Math.round(total/((Date.parse(q.checkout)-Date.parse(q.checkin))/86400000)*100)/100:null,totalBasisConfirmed,taxConfirmed:row.taxConfirmed===true,guarantee:num(row.guarantee),cashback:num(row.cashback),displayedPayment:num(row.displayedPayment),currency:'CNY',checkIn:q.checkin,checkOut:q.checkout,rooms:q.rooms,adults:q.adults,children:0,capturedAt:new Date(now).toISOString(),stage:row.stage||'room_list',source:hotelURL(task.provider,task.hotelId,q),evidence:raw,automatic:true,comparable:false,pending:Array.isArray(row.pending)?row.pending.map(String).slice(0,12):[]};
}
export function summarize(job){const remainingPool=remainingCandidates(job),availablePackageMatched=(job.matchedHotelKeys||[]).filter(k=>{const c=job.candidates.find(c=>hotelKey(c.name)===k);return c&&!excludedCandidate(c,c.provider,job.query);}).length;return {id:job.id,query:job.query,status:job.status,message:job.message,revision:job.revision,createdAt:job.createdAt,updatedAt:job.updatedAt,continuationReady:['completed','failed'].includes(job.status)&&!!job.search&&Array.isArray(job.candidatePool)&&remainingPool>0,offers:job.offers,candidates:job.candidates,observations:job.observations||[],errors:job.errors,progress:{done:job.index,total:job.tasks.length},search:job.search?{...job.search,remainingPool,availablePackageMatched}:null,planChecks:job.planChecks||[],timing:{elapsedMs:job.updatedAt-job.createdAt,roundElapsedMs:job.updatedAt-(job.roundStartedAt||job.createdAt),currentPhase:job.tasks[job.index]?.phase||null,currentProvider:job.tasks[job.index]?.provider||null},events:(job.events||[]).slice(-30),pausedTask:PAUSED.includes(job.status)?job.tasks[job.index]:null,taskTabId:job.taskTabId};}
export function applySnapshot(job,snapshot,now=Date.now()){
 const task=job.tasks[job.index];if(!task)return job;
 job.updatedAt=now;job.revision++;
 if(snapshot.status!=='loading'){job.events??=[];job.events.push({provider:task.provider,phase:task.phase,hotel:task.name||'',at:now,status:snapshot.status,code:snapshot.code||null,durationMs:task.startedAt?now-task.startedAt:null});}
 if(['needs_login','needs_verification','needs_review'].includes(snapshot.status)){job.status=snapshot.status;job.message=snapshot.message;return job;}
 if(snapshot.status==='loading'){job.retries++;job.status='loading';job.message='等待'+(task.provider==='ctrip'?'携程':'同程')+'页面加载';return job;}
 if(snapshot.status==='ready'&&['discover','locate'].includes(task.phase)){
  const discovered=(snapshot.candidates||[]).filter(c=>/^\d{1,14}$/.test(c.id)&&c.name);
  if(task.phase==='discover'&&job.search){
   const seen=new Set();job.candidatePool=discovered.filter(c=>!seen.has(hotelKey(c.name))&&seen.add(hotelKey(c.name))).slice(0,12);job.search.poolSize=job.candidatePool.length;
   // A bounded pool is not an exhaustive search of the city.
   if(!job.candidatePool.length)job.errors.push({provider:task.provider,phase:task.phase,code:snapshot.code||'no_candidates',message:snapshot.message||'当前列表未取得可核对的候选。'});
  }else{
  const candidates=discovered.slice(0,job.query.maxHotels);
  job.candidates.push(...candidates.map(c=>({...c,provider:task.provider})));
  const next=[];
  for(const c of candidates){next.push({provider:task.provider,phase:'rooms',hotelId:c.id,name:c.name,canonicalName:task.canonicalName||c.name,url:candidateURL(task.provider,c,job.query)});
   if(task.phase==='discover'&&job.query.workflow==='selection')for(const provider of job.query.platforms.filter(p=>p!==task.provider))next.push({provider,phase:'locate',name:c.name,canonicalName:c.name,matchNames:[c.name],searchTerm:c.name,url:discoveryURL(provider,job.query,c.name)});
  }
  job.tasks.splice(job.index+1,0,...next);
  if(!candidates.length)job.errors.push({provider:task.provider,hotel:task.name,phase:task.phase,code:snapshot.code||'no_matching_hotel',message:snapshot.message||'列表未取得可核对的酒店身份，没有填入预设酒店。'});
  }
 }else if(snapshot.status==='ready'){
  for(const observation of (snapshot.observations||[]).slice(0,50)){
   if(!['boolean','number'].includes(typeof observation.value)||!['opened','renovated','smart','smartWash','laundry','metro','mold','nonSmoking','twinBeds','breakfast','freeCancel','parking','family','petFriendly','accessible','bathtub','gym','pool','invoice','desk','view','lateCheckin','quiet'].includes(observation.key)||!observation.evidence)continue;
   const item={...observation,hotel:task.canonicalName||task.name,provider:task.provider,source:hotelURL(task.provider,task.hotelId,job.query),capturedAt:new Date(now).toISOString()};
   (job.observations??=[]).push(item);
  }
  const selected=job.search?(packageMatches(snapshot.previewCandidate,job.query)?snapshot.previewCandidate:null):snapshot.previewCandidate;
  const rows=(snapshot.offers||[]).filter(r=>r.room).slice(0,12);
  if(task.phase==='rooms'&&selected&&!rows.some(r=>r.rowKey===selected.rowKey)){if(rows.length<12)rows.push(selected);else rows[11]=selected;}
  for(const row of rows){const offer=normalizeOffer(row,task,job.query,now);offer.selectedForComparison=row.rowKey===selected?.rowKey;const old=job.offers.findIndex(o=>o.id===offer.id);if(old>=0)job.offers[old]=offer;else job.offers.push(offer);}
  if(task.phase==='rooms'&&task.poolCandidate&&job.search){
   const check={hotel:task.canonicalName||task.name,...snapshot.planSummary,visibleOfferCount:snapshot.planSummary?.visibleOfferCount??rows.length,eligibleOfferCount:selected?(snapshot.planSummary?.eligibleOfferCount||1):0,requiredBreakfastCount:(job.query.required||[]).includes('breakfast')?job.query.adults:0};
   job.planChecks.push(check);
   if(selected&&!job.matchedHotelKeys.includes(hotelKey(check.hotel))){job.matchedHotelKeys.push(hotelKey(check.hotel));job.search.matched=job.matchedHotelKeys.length;}
  }
  if(task.phase==='rooms'&&selected){
   const preview={...task,phase:'checkout',selected,reuseTabId:job.taskTabId},next=[];
   if(job.query.workflow==='selection'&&task.provider==='ctrip'&&!task.recheck)next.push({...preview,phase:'amenities'});
   if(job.query.priceMode!=='reference')next.push(preview);
   if(task.poolCandidate&&job.search)for(const provider of job.query.platforms.filter(p=>p!==task.provider))next.push({provider,phase:'locate',name:task.name,canonicalName:task.canonicalName||task.name,matchNames:[task.name],searchTerm:task.name,url:discoveryURL(provider,job.query,task.name)});
   job.tasks.splice(job.index+1,0,...next);
  }
  if(task.phase==='checkout'&&job.query.workflow==='selection'){
   const name=task.canonicalName||task.name,current=job.offers.find(o=>o.provider===task.provider&&hotelKey(o.hotel)===hotelKey(name)&&o.totalBasisConfirmed),other=job.offers.find(o=>o.provider!==task.provider&&hotelKey(o.hotel)===hotelKey(name)&&o.totalBasisConfirmed);
   const key=hotelKey(name);job.refreshedHotels??={};
   if(current&&other&&!job.refreshedHotels[key]&&Math.abs(Date.parse(current.capturedAt)-Date.parse(other.capturedAt))>10*60000){
    job.refreshedHotels[key]=true;job.tasks.splice(job.index+1,0,{provider:other.provider,phase:'rooms',hotelId:other.hotelId,name:other.platformHotelName||other.hotel,canonicalName:name,recheck:true,url:hotelURL(other.provider,other.hotelId,job.query)});
   }
  }
  if(!rows.length&&task.phase!=='amenities')job.errors.push({provider:task.provider,hotel:task.name,message:snapshot.message||'本次没有取得具体房型套餐。'});
 }else job.errors.push({provider:task.provider,hotel:task.name,message:snapshot.message||'页面未成功采集。'});
 job.index++;job.retries=0;job.taskTabId=null;
 if(job.search&&job.index>=job.tasks.length)enqueuePoolCandidate(job);
 job.status=job.index>=job.tasks.length?(job.offers.length?'completed':'failed'):'collecting';
 job.message=job.search?searchMessage(job):job.status==='completed'?(job.errors.length?'部分采集完成：':'自动采集结束：')+job.offers.length+'条房型套餐；未核实的条件仍单列。':job.status==='failed'?'本次未取得房型报价，请查看失败原因。':'继续下一家酒店';
 return job;
}
