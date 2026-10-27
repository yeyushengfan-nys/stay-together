import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {validateQuery,trustedSender,makeJob,applySnapshot,normalizeOffer,allowedTaskURL,candidateURL,SITE_ORIGIN} from '../collector-extension/core.js';
import {readHotelPage,openCtripPreview} from '../collector-extension/reader.js';
let checks=0;function check(name,fn){fn();checks++;console.log('PASS '+name);}
const now=Date.parse('2026-10-25T09:00:00Z'),raw={city:'上海',checkin:'2026-10-25',checkout:'2026-10-27',rooms:1,adults:2,platforms:['ctrip'],maxHotels:1,priceMode:'checkout'},q=validateQuery(raw,now);
check('城市日期人数边界不会静默改成默认行程',()=>{for(const patch of [{city:'火星'},{checkin:'2026-02-30'},{checkin:'2026-10-24'},{checkout:'2026-11-20'},{rooms:2},{adults:1.5},{children:1},{maxHotels:Infinity},{maxHotels:1.5},{platforms:'ctrip'},{platforms:['evil']}])assert.throws(()=>validateQuery({...raw,...patch},now));assert.equal(validateQuery({...raw,city:'上海市'},now).city,'上海');});
check('网站请求需要精确来源和真实标签身份',()=>{assert(trustedSender({url:SITE_ORIGIN+'/workspace',tab:{id:7}}));assert(!trustedSender({url:SITE_ORIGIN+'.evil.com',tab:{id:7}}));assert(!trustedSender({url:SITE_ORIGIN}));assert(!allowedTaskURL('http://hotels.ctrip.com/'));assert(!allowedTaskURL('https://hotels.ctrip.com.evil.com/'));});
check('无具体酒店身份时不插入预设候选',()=>{const j=makeJob(q,7,now);applySnapshot(j,{status:'ready',candidates:[{id:'javascript:1',name:'x'}]},now);assert.equal(j.tasks.length,1);assert.equal(j.status,'failed');assert.equal(j.offers.length,0);});
const discovery=JSON.parse(await readFile(new URL('./collector-fixtures/ctrip-discovery-live.json',import.meta.url))),rooms=JSON.parse(await readFile(new URL('./collector-fixtures/ctrip-rooms-live.json',import.meta.url))),checkout=JSON.parse(await readFile(new URL('./collector-fixtures/ctrip-checkout-live.json',import.meta.url)));
check('实测材料：城市发现→房型→订单预览更新同一报价',()=>{const j=makeJob(q,7,now);j.taskTabId=100;applySnapshot(j,discovery.result,now);assert.equal(j.tasks[1].hotelId,'90105082');const snap={...rooms.result,previewCandidate:{...rooms.result.offers[0]}};j.taskTabId=101;applySnapshot(j,snap,now);assert.equal(j.tasks[2].phase,'checkout');assert.equal(j.tasks[2].reuseTabId,101);assert.equal(j.offers[0].total,null);applySnapshot(j,checkout.result,now);assert.equal(j.offers[0].total,388);assert.equal(j.offers[0].nightly,194);assert.equal(j.status,'completed');assert.equal(j.offers.length,8);});
check('登录、验证码和日期不符均保留当前步骤等待处理',()=>{for(const status of ['needs_login','needs_verification','needs_review']){const j=makeJob(q,7,now);j.taskTabId=44;applySnapshot(j,{status,message:'暂停'},now);assert.equal(j.index,0);assert.equal(j.taskTabId,44);assert.equal(j.offers.length,0);assert.equal(j.status,status);}});
check('起价、罚金及字符串金额不推算总价；担保和返现不抵减',()=>{const t={provider:'ctrip',hotelId:'1',name:'酒店'};const o=normalizeOffer({room:'标准房',listNightly:194,total:'388',totalBasisConfirmed:true,guarantee:99,cashback:50,breakfast:1.5,evidence:'取消罚金9999'},t,q,now);assert.equal(o.total,null);assert.equal(o.nightly,null);assert.equal(o.totalBasisConfirmed,false);assert.equal(o.breakfast,null);const p=normalizeOffer({room:'标准房',total:388,totalBasisConfirmed:true,guarantee:194,cashback:50},t,q,now);assert.equal(p.total,388);assert.equal(p.nightly,194);assert.equal(p.comparable,false);});
// Minimal DOM doubles exercise actual reader safety branches, no network or account data.
const visible=text=>({innerText:text,getClientRects:()=>[{}],querySelector:()=>null,querySelectorAll:()=>[]});
function readerWith(body,task,extra={}){const context={URL,location:new URL(extra.url||'https://hotels.ctrip.com/hotels/1.html?checkIn=2026-10-25&checkOut=2026-10-27'),getComputedStyle:()=>({visibility:'visible'}),document:{body:visible(body),querySelector:sel=>sel==='#checkInInput'?{value:extra.checkin||'10月25日'}:sel==='#checkOutInput'?{value:'10月27日'}:null,querySelectorAll:()=>[]}};return vm.runInNewContext('('+readHotelPage.toString()+')',context)(q,task);}
check('真实读取器拒绝验证码、限制访问与错误日期',()=>{assert.equal(readerWith('请完成安全验证',{provider:'ctrip',phase:'rooms'}).status,'needs_verification');assert.equal(readerWith('访问过于频繁',{provider:'ctrip',phase:'rooms'}).status,'needs_review');assert.equal(readerWith(('1间, 2成人, 0儿童 酒店资料 ').repeat(30),{provider:'ctrip',phase:'rooms'},{checkin:'10月26日'}).status,'needs_review');});
check('真实读取器不会读取登录输入框',()=>{assert.equal(readerWith('',{provider:'ctrip',phase:'discover'},{url:'https://passport.ctrip.com/user/login'}).status,'needs_login');});
check('北京11月单日日期按数值核对，真实搜索头优先于页面其他日期',()=>{
 const query={...q,city:'北京',checkin:'2026-11-01',checkout:'2026-11-03'};
 const read=(header,url='https://www.ly.com/hotel/hotellist?inDate=2026-11-01&outDate=2026-11-03')=>{
  const ctx={URL,location:new URL(url),getComputedStyle:()=>({visibility:'visible'}),document:{body:visible(header+'\n'+('酒店介绍 11月1日 11月3日 没有找到 ').repeat(20)),querySelector:s=>s==='#keyWordBox,.keyWordBox'?visible(header):null,querySelectorAll:()=>[]}};
  return vm.runInNewContext('('+readHotelPage.toString()+')',ctx)(query,{provider:'tongcheng',phase:'locate',name:'目标酒店'});
 };
 for(const text of ['入住 11月1日 周日 2晚 退房11月3日 周二 人数2 成人 0 儿童','入住11月01日 退房11月03日 人数2成人0儿童'])assert.equal(read(text).status,'ready');
 const wrong=read('入住10月26日 退房10月27日 人数2成人0儿童');assert.equal(wrong.code,'query_mismatch');assert.equal(wrong.diagnostic.datesOK,false);assert.equal(wrong.settleEligible,true);
 const wrongURL=read('入住11月1日 退房11月3日 人数2成人0儿童','https://www.ly.com/hotel/hotellist?inDate=2025-11-01&outDate=2025-11-03');assert.equal(wrongURL.settleEligible,false);
 assert.equal(read('入住11月1日 退房11月3日 人数1成人0儿童').diagnostic.occupancyOK,false);
});
check('按当前预算优先考察候选，广告不入池，起价不冒充完整报价',()=>{
 const card=(id,name,price,ad=false)=>({...visible(name+'\n'+(ad?'广告\n':'')+'页面价格¥'+price),id,querySelector:s=>s==='.hotelName'?visible(name):s.includes('Current price')?visible('¥'+price):null});
 const cards=[card('11','较贵酒店',900),card('22','预算内酒店',80),card('33','另一家预算内酒店',90),card('44','广告酒店',60,true)];
 const ctx={URL,location:new URL('https://hotels.ctrip.com/hotels/list/'),getComputedStyle:()=>({visibility:'visible'}),document:{body:visible(('1间,2成人,0儿童 酒店列表 ').repeat(15)),querySelector:s=>s==='#checkInInput'?{value:'10月25日'}:s==='#checkOutInput'?{value:'10月27日'}:null,querySelectorAll:s=>s==='.hotel-card[id]'?cards:[]}};
 const r=vm.runInNewContext('('+readHotelPage.toString()+')',ctx)({...q,workflow:'selection',budget:100,maxHotels:3},{provider:'ctrip',phase:'discover'});
 assert.equal(r.status,'ready');assert.equal(r.candidates[0].name,'预算内酒店');assert.equal(r.candidates[1].name,'另一家预算内酒店');assert.equal(r.candidates.some(c=>c.id==='44'),false);assert.equal(r.offers,undefined);
});
check('结算预览不把担保金当房费、不串酒店',()=>{const selected={room:'标准房',rowKey:'0:0',breakfast:0,breakfastText:'无早餐',listNightly:999},task={provider:'ctrip',phase:'checkout',hotelId:'1',name:'甲酒店',selected};const header='甲酒店 标准房 无早餐 10月25日 10月27日 ';const r=readerWith(header+'价格详情 1间×2晚 ¥388 在线担保¥9999 '.repeat(8),task);assert.equal(r.offers[0].total,388);assert.equal(r.offers[0].guarantee,9999);assert.equal(readerWith(('乙酒店 标准房 10月25日 10月27日 价格详情 1间×2晚 ¥388 ').repeat(5),task).status,'needs_review');assert.equal(readerWith(header+('价格详情 在线担保¥9999 ').repeat(10),task).status,'needs_review');});
check('携程不重复展示餐食时保留套餐原文证据；两处都无来源仍拒绝',()=>{const task={provider:'ctrip',phase:'checkout',hotelId:'1',name:'甲酒店',selected:{room:'标准房',rowKey:'0:0',breakfast:0,breakfastText:'无早餐',listNightly:194,evidence:'甲酒店\n标准房\n无早餐\n在线付'}};const body='甲酒店 标准房 10月25日 10月27日 '+('价格详情 1间×2晚 ¥388 ').repeat(8);const result=readerWith(body,task);assert.equal(result.status,'ready');assert.equal(result.offers[0].breakfastSource,'room_list');assert.equal(result.offers[0].breakfastConfirmed,true);assert.equal(readerWith(body,{...task,selected:{...task.selected,evidence:'未提及餐食'}}).status,'needs_review');});
check('设施弹窗等待标题加载，不把图片数量当房型；真实身份不符仍拒绝',()=>{
 const task={provider:'ctrip',phase:'amenities',hotelId:'1',name:'甲酒店',selected:{room:'标准房'}};
 const read=(title,hotel='甲酒店')=>{
  const modal={...visible('5\n标准房\n书桌'),style:{zIndex:'10002'},querySelector:s=>s.includes('galleryModal')?{}:s.includes('baseRoomLayer-roomName')?visible(title):null};
  const ctx={URL,location:new URL('https://hotels.ctrip.com/hotels/1.html'),getComputedStyle:()=>({visibility:'visible'}),document:{body:visible(('1间,2成人,0儿童 酒店资料 ').repeat(15)),querySelector:s=>s==='#checkInInput'?{value:'10月25日'}:s==='#checkOutInput'?{value:'10月27日'}:s.includes('hotelOverview_name')?visible(hotel):null,querySelectorAll:s=>s==='[role="dialog"]'?[modal]:[]}};
  return vm.runInNewContext('('+readHotelPage.toString()+')',ctx)(q,task);
 };
 assert.equal(read('').status,'loading');assert.equal(read('另一房型').status,'needs_review');assert.equal(read('标准房','乙酒店').status,'needs_review');
 const ready=read('标准房');assert.equal(ready.status,'ready');assert.equal(ready.observations[0].key,'desk');assert.equal(ready.observations.some(o=>o.key==='smart'),false);
});
check('自动点击函数在预览页面没有点击权限',()=>{let clicked=false;const ctx={location:{hostname:'hotels.ctrip.com',pathname:'/hotels/booknew'},document:{querySelectorAll:()=>{clicked=true;return [];}}};assert.equal(vm.runInNewContext('('+openCtripPreview.toString()+')',ctx)('0:0','房',1).clicked,false);assert.equal(clicked,false);});
// Execute the real service worker against a bounded Chrome API double. This checks
// sequencing/pausing/cancellation, not just a copy of the implementation.
let data={},listener,tabRemoved,tabCounter=100,tabs=new Map(),snapshots=[],scriptCalls=0,removed=[],reloads=[];
const event=()=>({addListener:()=>{}});
globalThis.chrome={runtime:{id:'test-extension',getURL:p=>'chrome-extension://test-extension/'+p,onMessage:{addListener:fn=>{listener=fn;}}},storage:{session:{get:async()=>structuredClone(data),set:async v=>{data=structuredClone(v);},remove:async()=>{data={};}}},alarms:{create:async()=>{},clear:async()=>{},onAlarm:event()},tabs:{create:async({url})=>{const t={id:tabCounter++,url,status:'complete'};tabs.set(t.id,t);return t;},get:async id=>tabs.get(id),update:async(id,changes={})=>{const t=tabs.get(id);if(!t)throw Error('missing tab');Object.assign(t,changes);return t;},reload:async(id,options)=>{reloads.push({id,options});},remove:async id=>{removed.push(id);tabs.delete(id);},onUpdated:event(),onRemoved:{addListener:fn=>{tabRemoved=fn;}}},scripting:{executeScript:async()=>{scriptCalls++;return [{result:snapshots.shift()||{status:'loading'}}];}}};
await import('../collector-extension/background.js');
const sender={id:'test-extension',url:SITE_ORIGIN+'/workspace',tab:{id:77}};
const send=(type,extra={},who=sender)=>new Promise(resolve=>listener({type,...extra},who,resolve));
let res=await send('START',{query:{...raw,checkin:'2090-01-01',checkout:'2090-01-03'}});assert(res.ok);assert.equal(tabs.size,1);snapshots.push({status:'needs_verification',message:'请处理验证'});res=await send('STATUS');assert.equal(res.job.status,'needs_verification');const pausedCalls=scriptCalls;await send('STATUS');assert.equal(scriptCalls,pausedCalls);snapshots.push({status:'ready',candidates:[]});res=await send('RESUME');res=await send('STATUS');assert.equal(res.job.status,'failed');assert.equal(tabs.size,0);checks++;console.log('PASS 实际 worker 暂停后轮询不采集，明确继续才执行');
await send('START',{query:{...raw,checkin:'2090-01-01',checkout:'2090-01-03'}});const beforeCancel=scriptCalls;res=await send('CANCEL');assert.equal(res.job.status,'cancelled');await send('STATUS');assert.equal(scriptCalls,beforeCancel);assert.equal(tabs.size,0);checks++;console.log('PASS 实际 worker 取消后不再读取，只关闭任务创建的标签');
await send('START',{query:{...raw,checkin:'2090-01-01',checkout:'2090-01-03'}});const pendingTab=[...tabs.values()][0];pendingTab.url=undefined;pendingTab.status='loading';res=await send('STATUS');assert.notEqual(res.job.status,'needs_review');pendingTab.url='https://passport.ctrip.com/user/login';pendingTab.status='complete';res=await send('STATUS');assert.equal(res.job.status,'needs_login');tabs.delete(pendingTab.id);await tabRemoved(pendingTab.id);res=await send('STATUS');assert.equal(res.job.status,'needs_review');await send('RESUME');await send('STATUS');assert.equal(tabs.size,1);await send('CANCEL');checks++;console.log('PASS 新标签URL尚未提交时等待；关闭登录页后继续会重开原查询');
await send('START',{query:{...raw,platforms:['tongcheng'],checkin:'2090-01-01',checkout:'2090-01-03'}});data.job.tasks[0].startedAt=Date.now()-50000;res=await send('STATUS');assert.equal(reloads.length,1);assert.equal(reloads[0].options.bypassCache,true);data.job.tasks[0].startedAt=Date.now()-76000;res=await send('STATUS');assert.equal(res.job.status,'failed');assert.equal(reloads.length,1);assert.equal(res.job.errors.length,1);assert.equal(tabs.size,0);await send('CANCEL');checks++;console.log('PASS 同程只刷新一次，加载失败如实记录，不伪造报价');
await send('START',{query:{...raw,platforms:['tongcheng'],checkin:'2090-01-01',checkout:'2090-01-03'}});data.job.tasks[0].startedAt=Date.now()-50000;snapshots.push({status:'needs_verification',message:'拼图验证'});res=await send('STATUS');assert.equal(res.job.status,'needs_verification');assert.equal(reloads.length,1);await send('CANCEL');checks++;console.log('PASS 遇验证码不触发缓存刷新或自动解题');
res=await send('START',{query:raw},{id:'test-extension',url:'https://evil.com',tab:{id:66}});assert.equal(res.ok,false);checks++;console.log('PASS 实际 worker 拒绝其他网站控制');
{
 await send('START',{query:{...raw,checkin:'2090-01-01',checkout:'2090-01-03'}});
 const mismatch={status:'needs_review',code:'query_mismatch',settleEligible:true,message:'日期尚未同步'};
 snapshots.push(mismatch);res=await send('STATUS');assert.equal(res.job.status,'loading');assert.equal(res.job.offers.length,0);assert.equal(res.job.progress.done,0);
 data.job.tasks[0].queryMismatchAt=Date.now()-11000;snapshots.push(mismatch);res=await send('STATUS');assert.equal(res.job.status,'needs_review');assert.equal(res.job.offers.length,0);
 snapshots.push({status:'ready',candidates:[]});res=await send('RESUME');res=await send('STATUS');assert.equal(res.job.status,'failed');
 await send('START',{query:{...raw,checkin:'2090-01-01',checkout:'2090-01-03'}});snapshots.push({...mismatch,settleEligible:false});res=await send('STATUS');assert.equal(res.job.status,'needs_review');await send('CANCEL');
 checks++;console.log('PASS 页面日期同步短暂等待且不采价，持续不符和URL年份错误仍暂停');
}
{
 const future=validateQuery({...raw,platforms:['tongcheng'],checkin:'2090-01-01',checkout:'2090-01-03'}),id=tabCounter++,j=makeJob(future,77);
 j.tasks=[{provider:'tongcheng',phase:'rooms',hotelId:'1',name:'本次酒店',canonicalName:'本次酒店',cacheReloaded:true,url:'https://www.ly.com/hotel/hoteldetail?hotelId=1&traceToken=old-navigation'}];j.taskTabId=id;j.status='needs_login';data={job:j};tabs.set(id,{id,url:'https://passport.ly.com/',status:'complete'});
 res=await send('RESUME');res=await send('STATUS');assert.equal(data.job.tasks[0].phase,'locate');const entry=new URL(tabs.get(id).url);assert.equal(entry.pathname,'/hotel/hotellist');assert.equal(entry.searchParams.get('keywords'),'本次酒店');assert.equal(entry.searchParams.has('traceToken'),false);assert.equal(data.job.tasks[0].hotelId,undefined);await send('CANCEL');
 checks++;console.log('PASS 同程登录后重新定位同名酒店，不沿用登录前的旧列表上下文');
}
{
 const future=validateQuery({...raw,checkin:'2090-01-01',checkout:'2090-01-03'}),id=tabCounter++;
 const j=makeJob(future,77);j.tasks=[{provider:'ctrip',phase:'checkout',hotelId:'1',name:'甲酒店',startedAt:Date.now()-10000}];j.taskTabId=id;j.status='collecting';data={job:j};tabs.set(id,{id,url:'https://hotels.ctrip.com/hotels/booknew',status:'loading'});
 const before=scriptCalls;snapshots.push(checkout.result);res=await send('STATUS');assert.equal(scriptCalls,before+1);assert.equal(res.job.status,'completed');assert.equal(res.job.offers[0].total,388);
 checks++;console.log('PASS 浏览器资源未结束时仍检查已显示的报价DOM，避免携程无谓等满一分钟');
}
{
 const future=validateQuery({...raw,checkin:'2090-01-01',checkout:'2090-01-03'}),id=tabCounter++;
 const j=makeJob(future,77),selected={...checkout.result.offers[0],rowKey:'0:0'};
 j.tasks=[{provider:'ctrip',phase:'amenities',hotelId:'1',name:'甲酒店',selected,startedAt:Date.now()-20000},{provider:'ctrip',phase:'checkout',hotelId:'1',name:'甲酒店',selected,reuseTabId:id}];j.taskTabId=id;j.status='collecting';data={job:j};tabs.set(id,{id,url:'https://hotels.ctrip.com/hotels/1.html',status:'complete'});
 snapshots.push({status:'loading'},{clicked:true},{clicked:true});res=await send('STATUS');assert.equal(res.job.progress.done,1);assert.equal(res.job.errors.length,0);assert.equal(res.job.offers.length,0);
 snapshots.push(checkout.result);res=await send('STATUS');assert.equal(res.job.status,'completed');assert.equal(res.job.offers[0].total,388);
 checks++;console.log('PASS 设施迟迟未加载时保留未知，继续读取总价，不虚构设施');
}
const manifest=JSON.parse(await readFile(new URL('../collector-extension/manifest.json',import.meta.url)));assert(!manifest.permissions.some(p=>['cookies','debugger','webRequest','history'].includes(p)));assert(!JSON.stringify(manifest).includes('<all_urls>'));assert(!manifest.content_scripts.some(s=>s.matches.some(m=>m.includes('passport'))));checks++;console.log('PASS 扩展权限未含 Cookie、历史、调试器、全站或登录页脚本');
check('同程原链接只保留白名单酒店路径及本次日期',()=>{const c={id:'71835510',detailUrl:'https://www.ly.com/hotel/hoteldetail?hotelId=71835510&inDate=2026-10-25&outDate=2026-10-27&traceToken=public-navigation-context'};assert.equal(new URL(candidateURL('tongcheng',c,q)).searchParams.get('traceToken'),'public-navigation-context');for(const u of ['https://evil.com/hotel/hoteldetail?hotelId=71835510','javascript:alert(1)','https://www.ly.com/pay?hotelId=71835510'])assert.equal(new URL(candidateURL('tongcheng',{...c,detailUrl:u},q)).pathname,'/hotel/hoteldetail');assert.throws(()=>validateQuery({...raw,hotelNames:'wrong'},now));assert.equal(validateQuery({...raw,hotelNames:['艺龙安悦酒店'],roomName:'大床'},now).hotelNames[0],'艺龙安悦酒店');});
const tcFixture=JSON.parse(await readFile(new URL('./collector-fixtures/tongcheng-checkout-live.json',import.meta.url)));
const wanxinFixture=JSON.parse(await readFile(new URL('./collector-fixtures/tongcheng-wanxin-rooms-live.json',import.meta.url)));
check('真实万信R材料：不把293元到店担保套餐配给在线付，选择302元后再核对预览',()=>{
 const roomNames=[...new Set(wanxinFixture.result.offers.map(o=>o.room))];
 const cards=[visible('优选推荐'),...roomNames.map(room=>{
  const entries=wanxinFixture.result.offers.filter(o=>o.room===room),plans=entries.map(o=>{
   const original=o.evidence.match(/¥(\d+)¥(\d+)/),price={...visible('¥'+original[1]+'¥'+o.listNightly),querySelectorAll:s=>s==='.original-price'?[visible('¥'+original[1])]:[]};
   return {...visible(o.evidence),querySelector:s=>s==='h2'?visible(o.evidence.match(/套餐：(.*)/)[1]):s==='.price .price-text p'?price:null,querySelectorAll:s=>s==='.btn-top'?[visible('预订')]:[]};
  });
  return {...visible(room),querySelector:s=>s==='.roomInfoList-img h1'?visible(room):s==='.roomInfoList-img .room-card-cn'?visible(room+'\n'+entries[0].bed):null,querySelectorAll:s=>s==='.content-flex'?plans:[]};
 })];
 const ctx={URL,location:new URL('https://www.ly.com/hotel/hoteldetail?hotelId=40201934&inDate=2026-10-25&outDate=2026-10-27'),getComputedStyle:()=>({visibility:'visible'}),document:{body:visible((wanxinFixture.task.name+' 10月25日 10月27日 ').repeat(8)),querySelector:s=>s==='#keyWordBox,.keyWordBox'?visible('入住10月25日 退房10月27日 人数2成人0儿童'):null,querySelectorAll:s=>s==='.room-list-box .card[id]'?cards:[]}};
 const r=vm.runInNewContext('('+readHotelPage.toString()+')',ctx)(wanxinFixture.query,wanxinFixture.task);
 assert.equal(r.status,'ready');assert.equal(r.offers.length,4);assert.equal(r.previewCandidate.listNightly,302);assert.equal(r.previewCandidate.payment,'');assert.equal(r.offers.find(o=>o.listNightly===293).payment,'到店付·需担保');
});
check('未要求早餐不擅自升级双早；明确要求双早时才排除无早套餐',()=>{
 const rows=[{meal:'无早餐',price:213},{meal:'2份早餐',price:270}].map(o=>({...visible(o.meal+'\n订单确认后30分钟内免费取消\n在线付\n预订'),querySelector:s=>s.includes('Current price')?visible('¥'+o.price):null,querySelectorAll:s=>s==='button,[role="button"]'?[visible('预订')]:[]}));
 const card={...visible('双床房'),querySelector:s=>s.includes('commonRoomCard-title')?visible('双床房'):s.includes('baseRoom-bedsInfo')?visible('2张1.1米单人床'):null,querySelectorAll:s=>s.includes('saleRoomItemBox__')?rows:[]};
 const ctx={URL,location:new URL('https://hotels.ctrip.com/hotels/1.html'),getComputedStyle:()=>({visibility:'visible'}),document:{body:visible(('1间,2成人,0儿童 酒店资料 ').repeat(15)),querySelector:s=>s==='#checkInInput'?{value:'10月25日'}:s==='#checkOutInput'?{value:'10月27日'}:s.includes('hotelOverview_name')?visible('甲酒店'):null,querySelectorAll:s=>s.includes('commonRoomCard__')?[card]:[]}};
 const read=vm.runInNewContext('('+readHotelPage.toString()+')',ctx),task={provider:'ctrip',phase:'rooms',name:'甲酒店'};
 assert.equal(read(q,task).previewCandidate.breakfast,0);assert.equal(read(q,task).previewCandidate.listNightly,213);
 assert.equal(read({...q,required:['breakfast']},task).previewCandidate.breakfast,2);
 for(const row of rows)row.querySelectorAll=()=>[];assert.equal(read(q,task).previewCandidate,null);assert.equal(read({...q,priceMode:'reference'},task).previewCandidate.listNightly,213);
});
const cc={window:{}};vm.createContext(cc);vm.runInContext(await readFile(new URL('../public/collector-compare.js',import.meta.url),'utf8'),cc);const C=cc.window.StayCollectorCompare;
const ct=normalizeOffer({...checkout.result.offers[0],breakfastConfirmed:true},{provider:'ctrip',hotelId:'90105082',name:'艺龙安悦酒店(上海浦东大道歇浦路地铁站店)'},q,now);
ct.cancellation='订单确认后30分钟内免费取消；之后不可取消，未入住将收取您¥388。如订单不确认将全额退款。';ct.payment='在线付';
const tc=normalizeOffer(tcFixture.result.offers[0],{provider:'tongcheng',hotelId:'71835510',name:ct.hotel},q,now);
check('370元折后账单保留506减136，不把183元不可取消套餐混比',()=>{assert.equal(tc.total,370);assert.equal(tc.baseTotal,506);assert.equal(tc.discountTotal,136);const pair=C.compare(ct,tc);assert.equal(pair.comparable,true);assert.equal(pair.saving,18);assert.equal(pair.scope,'displayed_checkout_total');assert.equal(pair.taxConfirmed,false);assert.equal(C.compare(ct,{...tc,cancellation:'不可取消'}).comparable,false);for(const patch of [{breakfast:1},{room:'其他房型'},{bed:'2张单人床'},{totalBasisConfirmed:false},{payment:'到店付'},{capturedAt:new Date(now+11*60000).toISOString()}])assert.equal(C.compare(ct,{...tc,...patch}).comparable,false);});
check('登录等待导致报价超过10分钟时重查较旧平台一次，不篡改时间或循环刷新',()=>{
 const j=makeJob({...q,workflow:'selection'},7,now);j.tasks=[{provider:'tongcheng',phase:'checkout',hotelId:'71835510',name:ct.hotel,canonicalName:ct.hotel}];j.offers=[structuredClone(ct)];j.status='collecting';
 applySnapshot(j,tcFixture.result,now+11*60000);assert.equal(j.tasks[1].recheck,true);assert.equal(j.tasks[1].provider,'ctrip');assert.equal(j.offers.find(o=>o.provider==='ctrip').capturedAt,ct.capturedAt);
 j.taskTabId=101;applySnapshot(j,{...rooms.result,previewCandidate:rooms.result.offers[0]},now+11*60000+1000);assert.equal(j.tasks[j.index].phase,'checkout');
 applySnapshot(j,checkout.result,now+11*60000+2000);assert.equal(j.status,'completed');assert.equal(j.tasks.length,3);assert.equal(Object.keys(j.refreshedHotels).length,1);
});
// Actual reader exercised against a sanitized billing fragment observed in the live DOM.
function tcBill(amount=370,discount=136,policy='订单确认后30分钟内可免费取消；逾期不可取消，未入住扣除全部金额。如未确认，将全额退款。'){
 const selected={...tcFixture.result.offers[0],cancellation:'订单确认30分钟内可免费取消'};
 const text=ct.hotel+'\n'+ct.room+'\n1张1.51米大床\n10月25日 10月27日\n取消政策\n'+policy+'\n线上预付\n¥'+amount+'\n房费\n2晚￥506\n2026-10-25 无餐食\n1 x ¥253\n2026-10-26 无餐食\n1 x ¥253\n共计优惠\n2晚优惠 -￥'+discount;
 const label={innerText:'线上预付',getClientRects:()=>[{}],parentElement:{innerText:'线上预付\n¥'+amount}};
 const ctx={URL,location:new URL('https://www.ly.com/hotel/book?hotelid=71835510&checkindate=2026-10-25&checkoutdate=2026-10-27'),getComputedStyle:()=>({visibility:'visible'}),document:{body:{innerText:text},querySelector:()=>null,querySelectorAll:sel=>sel==='.fang_fei'?[label]:[]}};
 return vm.runInNewContext('('+readHotelPage.toString()+')',ctx)(q,{provider:'tongcheng',phase:'checkout',hotelId:'71835510',name:ct.hotel,selected});
}
check('实际账单读取器核算折后金额，拒绝算术不符或政策变化',()=>{assert.equal(tcBill().offers[0].total,370);assert.equal(tcBill(369).status,'needs_review');assert.equal(tcBill(370,130).status,'needs_review');assert.equal(tcBill(370,136,'订单一经确认不可取消，未入住扣除全部金额。').status,'needs_review');});
const guaranteeFixture=JSON.parse(await readFile(new URL('./collector-fixtures/tongcheng-guarantee-checkout-live.json',import.meta.url)));
function guaranteeBill(patch={}){
 const f=guaranteeFixture,selected={room:'特惠大床房',rowKey:'1:0',breakfast:0,breakfastText:'无早餐',listNightly:293,cancellation:'订单确认30分钟内可免费取消',payment:'到店付·需担保'};
 const labels=patch.labels||f.labels;
 const text=f.header+'\n'+f.cancellation+'\n'+labels.map(l=>l.parentText).join('\n')+'\n'+(patch.billing||f.billing);
 const ctx={URL,location:new URL(f.url),getComputedStyle:()=>({visibility:'visible'}),document:{body:visible(text),querySelector:()=>null,querySelectorAll:s=>s==='.fang_fei'?labels.map(l=>({...visible(l.text),parentElement:visible(l.parentText)})):[]}};
 return vm.runInNewContext('('+readHotelPage.toString()+')',ctx)(q,{provider:'tongcheng',phase:'checkout',hotelId:'40201934',name:'上海万信R酒店(陆家嘴金融街区店)',selected});
}
check('实测到店付账单：760减174为586元房费，283元担保另列，继续而非误报缺总额',()=>{
 const r=guaranteeBill();assert.equal(r.status,'ready');const o=r.offers[0];assert.equal(o.total,586);assert.equal(o.baseTotal,760);assert.equal(o.discountTotal,174);assert.equal(o.guarantee,283);assert.equal(o.displayedPayment,586);assert.equal(o.payment,'到店付款 · 需担保');assert.equal(o.breakfastConfirmed,true);
});
check('到店付安全边界：只有担保金、双付款口径、错日期和折扣不符均不能成为房费',()=>{
 assert.equal(guaranteeBill({labels:guaranteeFixture.labels.filter(l=>l.text!=='到店付款')}).status,'needs_review');
 assert.equal(guaranteeBill({labels:[...guaranteeFixture.labels,{text:'线上预付',parentText:'线上预付\n¥283'}]}).status,'needs_review');
 assert.equal(guaranteeBill({billing:guaranteeFixture.billing.replace('2026-10-26','2026-10-28')}).status,'needs_review');
 assert.equal(guaranteeBill({billing:guaranteeFixture.billing.replace('-￥174','-￥175')}).status,'needs_review');
});
check('房费相同仍不把不同违约责任强配；到店担保和预付条件必须分别匹配',()=>{
 const r=guaranteeBill().offers[0];const a=normalizeOffer(r,{provider:'tongcheng',hotelId:'40201934',name:'上海万信R酒店(陆家嘴金融街区店)'},q,now);
 const b={...a,provider:'ctrip',cancellation:'订单确认后30分钟内免费取消。若未入住将扣除担保费用支付给酒店。暂扣¥283用于担保。'};
 assert.equal(C.compare(a,b).comparable,false);assert(C.compare(a,b).differences.includes('cancellation'));
 assert(C.compare(a,{...a,provider:'ctrip',payment:'在线付'}).differences.includes('payment'));
});
// Website receives a finished task without replacing companion preferences or trip.
const people=[{name:'我',budget:4000,conditions:[{id:'smart',required:true}]},{name:'朋友',budget:800,conditions:[{id:'metro',required:true}]}];
const siteState={mode:'trip',people:structuredClone(people),trip:{city:'上海',checkin:'2026-10-25',checkout:'2026-10-27',rooms:1,adults:2}};
const siteCtx={crypto,Map,Promise,location:{origin:SITE_ORIGIN},window:{addEventListener:()=>{},postMessage:()=>{}},document:{addEventListener:()=>{},getElementById:()=>null},setTimeout:()=>1,clearTimeout:()=>{},state:siteState,save:()=>{},view:'preferences',render:()=>{},renderCompare:()=>{},discoveryQuery:()=>siteState.trip,E:String};
vm.createContext(siteCtx);vm.runInContext(await readFile(new URL('../public/collector-client.js',import.meta.url),'utf8'),siteCtx);
vm.runInContext('collectorAccept({job:{id:"finished",query:collectorQuery(),status:"completed",offers:[]}})',siteCtx);
assert.deepEqual(siteState.people,people);assert.equal(siteState.trip.city,'上海');assert(!Object.hasOwn(vm.runInContext('collectorQuery()',siteCtx),'people'));siteState.trip.checkin='2026-10-26';assert.equal(vm.runInContext('collectorSameQuery(state.clientCollection.query)',siteCtx),false);checks++;console.log('PASS 网站回传不修改同行偏好，改日期即收起旧价，助手不接收同行资料');
const activeJob={id:'j',query:{...raw,platforms:['ctrip'],maxHotels:1},status:'needs_login',message:'请登录',offers:[],errors:[],progress:{done:0,total:1}};
siteCtx.activeJob=activeJob;siteState.trip.checkin=raw.checkin;vm.runInContext('collectorAccept({job:activeJob})',siteCtx);const activeHTML=vm.runInContext('collectorHTML()',siteCtx);assert.match(activeHTML,/<option value="1" selected>/);assert.doesNotMatch(activeHTML,/<option value="2" selected>/);checks++;console.log('PASS 暂停状态显示实际请求的候选数量，不重置为默认值');
siteCtx.probes=[];vm.runInContext('collectorRequest=type=>new Promise((resolve,reject)=>probes.push({type,resolve,reject})); var firstConnect=collectorConnect(); var secondConnect=collectorConnect();',siteCtx);
siteCtx.probes[1].resolve({installed:true});await new Promise(setImmediate);siteCtx.probes[2].resolve({job:null});await vm.runInContext('secondConnect',siteCtx);siteCtx.probes[0].reject(new Error('old timeout'));await vm.runInContext('firstConnect',siteCtx);assert.equal(vm.runInContext('collectorConnected',siteCtx),true);checks++;console.log('PASS 较早连接请求超时不会覆盖较晚已成功连接的状态');
// New worker branches are exercised with mocked rendered-page messages only.
for(const provider of ['ctrip','tongcheng']){
 const fq=validateQuery({...raw,checkin:'2090-01-01',checkout:'2090-01-03',priceMode:'reference',platforms:[provider],required:['breakfast']});
 const id=tabCounter++,j=makeJob(fq,77);j.tasks=[{provider,phase:'rooms',hotelId:'1',name:'Synthetic Hotel',startedAt:Date.now()-10000}];j.taskTabId=id;j.status='collecting';data={job:j};tabs.set(id,{id,url:provider==='ctrip'?'https://hotels.ctrip.com/hotels/1.html':'https://www.ly.com/hotel/hoteldetail?hotelId=1',status:'complete'});
 snapshots.length=0;snapshots.push({status:'expand_plans'},{clicked:true,count:1});res=await send('STATUS');assert.equal(res.job.progress.done,0);assert.equal(res.job.offers.length,0);assert.equal(data.job.tasks[0].plansExpanded,true);
 data.job.tasks[0].plansExpandedAt=Date.now()-3000;
 const selected={rowKey:'0:0',room:'Synthetic Room',breakfast:2,breakfastText:'2份早餐',listNightly:300,cancellation:'入住当天18:00前可免费取消',payment:'在线付',evidence:'Synthetic only'};
 snapshots.push({status:'ready',offers:[selected],previewCandidate:selected});res=await send('STATUS');assert.equal(res.job.status,'completed');assert.equal(res.job.offers[0].breakfast,2);assert(!data.job.tasks.some(t=>t.phase==='checkout'));
}
checks++;console.log('PASS 实际worker先展开两平台公开套餐再采双早，不进入订单预览');
{
 const fq=validateQuery({...raw,checkin:'2090-01-01',checkout:'2090-01-03',priceMode:'reference',platforms:['tongcheng']});
 const id=tabCounter++,j=makeJob(fq,77);j.tasks=[{provider:'tongcheng',phase:'rooms',hotelId:'1',name:'Synthetic Hotel',startedAt:Date.now()-10000}];j.taskTabId=id;j.status='collecting';data={job:j};tabs.set(id,{id,url:'https://www.ly.com/hotel/hoteldetail?hotelId=1',status:'complete'});
 const empty={status:'needs_review',code:'room_results_unavailable',message:'Synthetic empty response'},before=reloads.length;snapshots.length=0;snapshots.push(empty);res=await send('STATUS');assert.equal(res.job.status,'loading');assert.equal(reloads.length,before+1);assert.equal(res.job.offers.length,0);
 data.job.tasks[0].emptyRoomsReloadedAt=Date.now()-3000;snapshots.push(empty);res=await send('STATUS');assert.equal(res.job.status,'failed');assert.equal(reloads.length,before+1);assert.equal(res.job.errors.length,1);assert(res.job.errors[0].message.includes('不能据此认定无房'));
}
checks++;console.log('PASS 明确空房型仅普通刷新一次，仍空记缺报价并结束，不补旧价');
console.log(`\n${checks}项测试通过。自动化测试不代替各平台的现场验收。`);
