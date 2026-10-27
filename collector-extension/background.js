import {SITE_ORIGIN,ACTIVE,PAUSED,validateQuery,trustedSender,makeJob,summarize,allowedTaskURL,loginURL,applySnapshot,hotelKey,discoveryURL} from './core.js';
import {readHotelPage,openCtripPreview,openTongchengPreview,searchPlatformHotels,toggleCtripAmenities,expandCtripRoomPlans,expandTongchengRoomPlans} from './reader.js';
let serial=Promise.resolve();
function serialized(fn){const next=serial.then(fn,fn);serial=next.catch(()=>{});return next;}
const getJob=async()=>{const data=await chrome.storage.session.get('job');return data.job||null;};
async function save(job){job.updatedAt=Date.now();await chrome.storage.session.set({job});}
async function tickSoon(){await chrome.alarms.create('collector-tick',{when:Date.now()+30000});}
async function pause(job,status,message){job.status=status;job.message=message;job.revision++;await save(job);if(job.taskTabId!==null)try{await chrome.tabs.update(job.taskTabId,{active:true});}catch{}}
async function step(){
 const job=await getJob();if(!job||!ACTIVE.includes(job.status))return;
 if(Date.now()-job.createdAt>45*60*1000){await pause(job,'needs_review','采集任务已超过45分钟，请核对行程后重新开始。');return;}
 const task=job.tasks[job.index];if(!task)return;
 try{
  if(job.taskTabId===null){
   if(['checkout','amenities'].includes(task.phase)){
    // Reuse only the tab created by this job. No arbitrary user tab is driven.
    if(!Number.isInteger(task.reuseTabId))throw Error('预览标签缺失');
    job.taskTabId=task.reuseTabId;task.startedAt=Date.now();await save(job);
    const tab=await chrome.tabs.get(job.taskTabId);if(!allowedTaskURL(tab.url))throw Error('预览页离开允许的平台');
    const result=await chrome.scripting.executeScript({target:{tabId:job.taskTabId},func:task.phase==='amenities'?toggleCtripAmenities:task.provider==='tongcheng'?openTongchengPreview:openCtripPreview,args:task.phase==='amenities'?[task.selected.rowKey,task.selected.room,false]:[task.selected.rowKey,task.selected.room,task.selected.listNightly]});
    if(!result[0]?.result?.clicked){
     if(task.phase==='amenities'&&result[0]?.result?.unavailable){applySnapshot(job,{status:'ready',offers:[],observations:[]});await save(job);await step();return;}
     await pause(job,'needs_review','套餐位置或金额已变化，已停止自动点击；请核对页面后跳过此项。');return;
    }
   }else{
    if(!allowedTaskURL(task.url))throw Error('入口地址不在允许范围');
    const tab=await chrome.tabs.create({url:task.url,active:false});job.taskTabId=tab.id;task.startedAt=Date.now();await save(job);
   }
   await tickSoon();return;
  }
  const tab=await chrome.tabs.get(job.taskTabId);
  // Newly created Chrome tabs can briefly expose no URL before committing.
  // Wait for that navigation; an empty URL is not an unapproved destination.
  if((!tab.url||tab.url==='about:blank')&&tab.status==='loading'&&Date.now()-(task.startedAt||job.createdAt)<60000){await tickSoon();return;}
  if(loginURL(tab.url)){await pause(job,'needs_login','请在刚打开的平台标签页登录。登录完成后，回住一起点击“我已处理，继续”。');return;}
  if(!allowedTaskURL(tab.url)){await pause(job,'needs_review','平台跳转到了未允许的地址，已停止，不会扩大访问范围。');return;}
  // Analytics or media can keep Chrome's tab status loading after the hotel UI
  // is usable. After five seconds the DOM reader validates identity and dates;
  // a URL or browser load event alone never proves a quote is ready.
  if(tab.status!=='complete'&&Date.now()-(task.startedAt||job.createdAt)<=5000){await tickSoon();return;}
  if(task.phase==='rooms'&&task.plansExpandedAt&&Date.now()-task.plansExpandedAt<1000){await tickSoon();return;}
  if(task.phase==='rooms'&&task.emptyRoomsReloadedAt&&Date.now()-task.emptyRoomsReloadedAt<2500){await tickSoon();return;}
  if(task.phase==='discover')task.matchNames=job.query.hotelNames||job.candidates.filter(c=>c.provider!==task.provider).map(c=>c.name);
  if(task.phase==='rooms')task.matchOffer=job.offers.find(o=>o.provider!==task.provider&&hotelKey(o.hotel)===hotelKey(task.canonicalName||task.name)&&(job.query.priceMode==='reference'?o.selectedForComparison:o.totalBasisConfirmed))||null;
  const result=await chrome.scripting.executeScript({target:{tabId:job.taskTabId},func:readHotelPage,args:[job.query,task]});
  let snapshot=result[0]?.result;if(!snapshot)throw Error('页面没有返回可读取资料');
  if(snapshot.code==='room_results_unavailable'&&snapshot.status==='needs_review'&&task.provider==='tongcheng'&&task.phase==='rooms'){
   // The reader has already checked identity, dates, occupancy and access
   // restrictions. One ordinary refresh may recover an empty room response;
   // a second empty response is recorded as missing data, never as no rooms.
   if(!task.emptyRoomsReloadedAt){task.emptyRoomsReloadedAt=Date.now();job.status='loading';job.message='同程房型返回空结果，正在普通刷新一次；仍为空则记录本平台未取得报价并继续。';job.revision++;await save(job);await chrome.tabs.reload(job.taskTabId,{bypassCache:true});await tickSoon();return;}
   snapshot={status:'failed',code:'room_results_unavailable',message:'同程本酒店房型页刷新一次后仍未返回可核对报价；已记录为未取得，继续其他候选，不能据此认定无房。'};
  }
  if(snapshot.status==='expand_plans'){
   if(!['ctrip','tongcheng'].includes(task.provider)||task.phase!=='rooms'||task.plansExpanded){await pause(job,'needs_review','更多套餐控件状态不明确，已停止重复展开。');return;}
   const action=await chrome.scripting.executeScript({target:{tabId:job.taskTabId},func:task.provider==='ctrip'?expandCtripRoomPlans:expandTongchengRoomPlans,args:[task.name]});
   task.plansExpanded=true;task.plansExpandedAt=Date.now();task.plansExpandedCount=action[0]?.result?.count||0;
   job.status='loading';job.message=task.plansExpandedCount?'已展开更多房型套餐，继续核对早餐份数和价格。':'本页未找到可安全展开的更多套餐，继续按已显示资料核对。';job.revision++;await save(job);await tickSoon();return;
  }
  // Hotel pages can report Chrome navigation complete before their search
  // header has adopted the requested itinerary. Never consume a quote during
  // this bounded settling period; a real persistent mismatch still pauses.
  if(snapshot.code==='query_mismatch'&&snapshot.settleEligible){
   task.queryMismatchAt??=Date.now();
   if(Date.now()-task.queryMismatchAt<10000){job.status='loading';job.message='平台正在同步本次日期和人数，暂不读取价格；目标 '+job.query.checkin+'至'+job.query.checkout+'、1间/'+job.query.adults+'成人。';job.revision++;await save(job);await tickSoon();return;}
  }else if(snapshot.status!=='loading')delete task.queryMismatchAt;
  if(task.phase==='amenities'&&snapshot.status==='loading'&&Date.now()-(task.startedAt||job.createdAt)>15000){snapshot={status:'ready',offers:[],observations:[],message:'设施弹窗未加载出明确资料，保留未知，继续核对报价。'};}
  if(snapshot.status==='search_required'){
   if(task.searchApplied){await pause(job,'needs_review','平台未采用本次搜索词，已暂停，不能把其他酒店当成目标酒店。');return;}
   const action=await chrome.scripting.executeScript({target:{tabId:job.taskTabId},func:searchPlatformHotels,args:[snapshot.term]});
   if(!action[0]?.result?.clicked){await pause(job,'needs_review','未找到可核对的酒店搜索控件，已停止自动操作。');return;}
   task.searchApplied=true;task.startedAt=Date.now();job.message='正在平台搜索 '+snapshot.term;job.revision++;await save(job);await tickSoon();return;
  }
  if(snapshot.status==='loading'&&(Date.now()-(task.startedAt||job.createdAt)>(task.provider==='tongcheng'?75000:60000)||job.retries>=(task.provider==='tongcheng'?60:20))){
   snapshot={status:'failed',message:task.provider==='tongcheng'?'同程本页等待已超过75秒（最多刷新一次），仍未取得可核对资料。本项保留为失败，继续其余候选；不会以旧价或起价代替。':'本页超过一分钟仍未加载出可核对报价。本项未取得报价，继续其余候选；不会用旧价格代替。'};
  }
  if(snapshot.status==='loading'&&task.provider==='tongcheng'&&!task.cacheReloaded&&Date.now()-(task.startedAt||job.createdAt)>25000){
   // Keep the original task deadline; a refresh must not restart another long wait.
   task.cacheReloaded=true;job.retries=0;job.status='loading';job.message='同程页面未完成初始化，正在刷新一次；本页总等待上限75秒，登录或验证码仍会暂停。';job.revision++;await save(job);await chrome.tabs.reload(job.taskTabId,{bypassCache:true});await tickSoon();return;
  }
  const oldTabId=job.taskTabId;
  if(task.phase==='amenities'&&snapshot.status==='ready'){
   const close=await chrome.scripting.executeScript({target:{tabId:oldTabId},func:toggleCtripAmenities,args:[task.selected.rowKey,task.selected.room,true]});
   if(!close[0]?.result?.clicked&&!close[0]?.result?.alreadyClosed){await pause(job,'needs_review','设施资料已读取，但弹窗未能安全关闭，已暂停后续操作。');return;}
  }
  applySnapshot(job,snapshot);await save(job);
  if(PAUSED.includes(job.status)){await chrome.tabs.update(oldTabId,{active:true});return;}
  if(snapshot.status==='loading'){await tickSoon();return;}
  const next=job.tasks[job.index];
  if(!['checkout','amenities'].includes(next?.phase))try{await chrome.tabs.remove(oldTabId);}catch{}
  if(ACTIVE.includes(job.status))await step();else await chrome.alarms.clear('collector-tick');
 }catch(e){
  await pause(job,'needs_review','采集标签页关闭、权限不足或页面结构变化，已暂停；可跳过此项或取消任务。');
 }
}
async function command(message,sender,isPopup=false){
 if(!isPopup&&!trustedSender(sender))throw Error('只接受住一起网站发起的采集请求。');
 const type=message?.type;
 if(type==='HELLO')return {installed:true,version:chrome.runtime.getManifest?.()?.version||'0.2.7',codeVersion:'0.2.7',origin:SITE_ORIGIN,supportedCities:['上海','北京','杭州','广州','深圳','成都'],selectionWorkflow:true,referenceWorkflow:true};
 let job=await getJob();
 if(type==='START'){
  if(isPopup||!Number.isInteger(sender.tab?.id))throw Error('请从住一起网站开始采集。');
  if(job&&(ACTIVE.includes(job.status)||PAUSED.includes(job.status)))throw Error('已有任务未结束，请继续或取消当前任务。');
  const q=validateQuery(message.query);job=makeJob(q,sender.tab.id);await save(job);await step();return {job:summarize(await getJob())};
 }
 if(!job)return {job:null};
 if(message.jobId&&message.jobId!==job.id)throw Error('任务已变化，请重新连接。');
 if(type==='STATUS'){await step();return {job:summarize(await getJob())};}
 if(type==='RESUME'){
  if(PAUSED.includes(job.status)){
   const task=job.tasks[job.index],afterLogin=job.status==='needs_login';job.status='collecting';job.retries=0;job.message='继续检查当前页面';task.startedAt=Date.now();
   // Re-enter Tongcheng through a fresh public name search after login. The
   // original hotel-list navigation context may have aged while the user logs in.
   if(afterLogin&&task.provider==='tongcheng'&&['rooms','checkout'].includes(task.phase)){
    task.phase='locate';task.searchTerm=task.name;task.matchNames=[task.name];task.url=discoveryURL(task.provider,job.query,task.name);delete task.selected;delete task.reuseTabId;delete task.hotelId;delete task.cacheReloaded;delete task.searchApplied;
    if(job.taskTabId!==null)try{await chrome.tabs.update(job.taskTabId,{url:task.url,active:true});}catch{job.taskTabId=null;}
   }else if(job.taskTabId!==null){try{const tab=await chrome.tabs.get(job.taskTabId);if(loginURL(tab.url)){if(['checkout','amenities'].includes(task.phase)){task.phase='rooms';delete task.selected;delete task.reuseTabId;}await chrome.tabs.update(job.taskTabId,{url:task.url,active:true});}}catch{job.taskTabId=null;}}
   await save(job);await tickSoon();void serialized(step);
  }
 }else if(type==='SKIP'){
  if(!PAUSED.includes(job.status))throw Error('只有暂停的页面可以跳过。');
  const tabId=job.taskTabId;applySnapshot(job,{status:'failed',message:'用户跳过：'+job.message});await save(job);if(tabId!==null)try{await chrome.tabs.remove(tabId);}catch{};await step();
 }else if(type==='CANCEL'){
  const tabId=job.taskTabId;job.status='cancelled';job.message='采集已取消；已取得的结果保留。';job.taskTabId=null;job.revision++;await save(job);await chrome.alarms.clear('collector-tick');if(tabId!==null)try{await chrome.tabs.remove(tabId);}catch{}
 }else if(type==='FOCUS'){
  if(job.taskTabId!==null)await chrome.tabs.update(job.taskTabId,{active:true});
 }else if(type==='CLEAR'){
  if(ACTIVE.includes(job.status)||PAUSED.includes(job.status))throw Error('请先取消正在进行的任务。');await chrome.storage.session.remove('job');return {job:null};
 }else throw Error('不支持的操作。');
 return {job:summarize(await getJob())};
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(sender.id!==chrome.runtime.id)return;
 if(message?.type==='PAGE_READY'){
  serialized(async()=>{const job=await getJob();const active=!!job&&job.taskTabId===sender.tab?.id&&ACTIVE.includes(job.status)&&allowedTaskURL(sender.url);if(active)await step();return {watch:active};}).then(respond,()=>respond({watch:false}));return true;
 }
 const popup=sender.url===chrome.runtime.getURL('popup.html');
 serialized(()=>command(message,sender,popup)).then(data=>respond({ok:true,...data}),e=>respond({ok:false,error:e.message}));return true;
});
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(change.status==='complete'||change.url)serialized(async()=>{const j=await getJob();if(j?.taskTabId===tabId)await step();});});
chrome.tabs.onRemoved.addListener(tabId=>serialized(async()=>{const job=await getJob();if(job?.taskTabId===tabId&&(ACTIVE.includes(job.status)||PAUSED.includes(job.status))){job.taskTabId=null;const task=job.tasks[job.index];if(['checkout','amenities'].includes(task?.phase)){task.phase='rooms';delete task.selected;delete task.reuseTabId;}await pause(job,'needs_review','采集标签页被关闭。点击“我已处理，继续采集”会重新打开当前酒店或搜索页。');}}));
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='collector-tick')serialized(step);});
