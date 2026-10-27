// Serialized into the isolated extension world. Only reads rendered hotel DOM.
// It never reads cookies, storage, application globals, password fields or inputs
// on login/booking pages. The only global diagnostic below belongs to this
// extension's isolated watcher, not the platform. All helpers are serialized.
export function readHotelPage(q,task){
 const trim=s=>String(s||'').replace(/\u00a0/g,' ').trim();
 const txt=e=>trim(e?.innerText);
 const compact=s=>trim(s).normalize('NFKC').toLowerCase().replace(/[\s()（）·・•‧∙⋅]/g,'');
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
 const money=s=>{const m=trim(s).match(/^[¥￥]?\s*([\d,]+(?:\.\d{1,2})?)$/);return m?Number(m[1].replace(/,/g,'')):null;};
 const amountAfter=(text,re)=>{const m=text.match(re);return m?Number(m[1].replace(/,/g,'')):null;};
 const hasDate=(text,date)=>{const a=date.split('-').map(Number);return [...String(text||'').matchAll(/(\d{1,2})月\s*(\d{1,2})日/g)].some(m=>Number(m[1])===a[1]&&Number(m[2])===a[2]);};
 const body=txt(document.body),url=new URL(location.href),provider=task.provider;
 if(['passport.ctrip.com','passport.ly.com'].includes(url.hostname))return {status:'needs_login',message:'请在采集标签页登录；完成后回住一起点继续。'};
 const challenge=[...document.querySelectorAll('iframe[src*="captcha"],iframe[id*="captcha"],iframe[src*="turing"],#tCaptchaDyMainWrap,[class*="captcha-dialog"]')].some(visible)||/拖动下方拼图|请完成安全验证|请完成验证|滑动验证|人机验证/.test(body);
 if(challenge)return {status:'needs_verification',message:'平台要求验证码，请你手动完成；助手不会尝试解题或绕过。'};
 if(/账号密码登录|验证码登录/.test(body)&&[...document.querySelectorAll('input[type="password"]')].some(visible))return {status:'needs_login',message:'平台要求登录，请你手动登录后继续。'};
 if(/访问过于频繁|请求过于频繁|Too Many Requests|访问异常|操作过于频繁|拒绝访问|访问受限/.test(body))return {status:'needs_review',code:'platform_restricted',message:'平台限制了本次访问，已停止请求；请按平台提示等待后再手动继续，不能绕过限制。'};
 if(provider==='tongcheng'&&Array.isArray(globalThis.__stayCollectorResourceFailures)&&globalThis.__stayCollectorResourceFailures.length)return {status:'needs_review',code:'main_script_failed',message:'同程主程序脚本未能加载，已暂停；这不是无房或登录失败。请先核对平台页和缓存问题；助手不会循环刷新，也不会清除账号数据。'};
 if(!body||body.length<100)return {status:'loading'};
 let datesOK=false,occupancyOK=false,shownDates='',shownPeople='';
 if(provider==='ctrip'&&task.phase!=='checkout'){
  const a=document.querySelector('#checkInInput'),b=document.querySelector('#checkOutInput');
  shownDates=[a?.value,b?.value].filter(Boolean).join(' → ');
  datesOK=!!a&&!!b&&hasDate(a.value,q.checkin)&&hasDate(b.value,q.checkout);
  shownPeople=body.slice(0,3500).replace(/\s+/g,'').match(/\d+间[,，]*\d+成人[,，]*\d+儿童/)?.[0]||'';
  occupancyOK=new RegExp(q.rooms+'间[,， ]*'+q.adults+'成人[,， ]*0儿童').test(shownPeople);
 }else{
  const searchHeader=txt(document.querySelector('#keyWordBox,.keyWordBox')).replace(/\s+/g,'');
  const header=task.phase==='checkout'?body.slice(0,16000):searchHeader;
  shownDates=[...header.matchAll(/\d{1,2}月\s*\d{1,2}日/g)].slice(0,2).map(m=>m[0]).join(' → ');
  datesOK=hasDate(header,q.checkin)&&hasDate(header,q.checkout);
  shownPeople=searchHeader.match(/人数\d+成人\d+儿童/)?.[0]||'';
  occupancyOK=task.phase==='checkout'||new RegExp('人数'+q.adults+'成人0儿童').test(searchHeader);
 }
 const shownIn=url.searchParams.get(provider==='ctrip'?'checkIn':task.phase==='checkout'?'checkindate':'inDate'),shownOut=url.searchParams.get(provider==='ctrip'?'checkOut':task.phase==='checkout'?'checkoutdate':'outDate');
 const urlDatesOK=!((shownIn&&shownIn!==q.checkin)||(shownOut&&shownOut!==q.checkout));
 if(!urlDatesOK)datesOK=false;
 // Query-string dates alone are never enough: platforms can silently reset UI.
 if(!datesOK||!occupancyOK){
  if(/加载中|正在加载|正在搜寻/.test(body))return {status:'loading'};
  return {status:'needs_review',code:'query_mismatch',settleEligible:urlDatesOK,diagnostic:{datesOK,occupancyOK,shownDates,shownPeople,urlIn:shownIn,urlOut:shownOut},message:'平台尚未确认本次日期或人数。页面读到：'+(shownDates||'日期尚未显示')+'；'+(shownPeople||'人数尚未显示')+'。目标：'+q.checkin+'至'+q.checkout+'、1间/'+q.adults+'成人。请查看平台页后继续。'};
 }
 if(['discover','locate'].includes(task.phase)){
  const term=task.searchTerm||'';
  const keyword=document.querySelector(provider==='ctrip'?'input[placeholder="位置/品牌/酒店 (选填)"]':'input[placeholder="位置/品牌/酒店"]');
  if(term&&keyword&&compact(keyword.value)!==compact(term))return {status:'search_required',term};
  let candidates=[];
  if(provider==='ctrip')candidates=[...document.querySelectorAll('.hotel-card[id]')].filter(visible).filter(e=>!/(^|\n)广告(\n|$)/.test(txt(e))).map((e,i)=>({id:e.id,name:txt(e.querySelector('.hotelName')),summary:txt(e).slice(0,500),listNightly:money(txt(e.querySelector('[aria-label^="Current price"]'))),platformRank:i+1}));
  else candidates=[...document.querySelectorAll('a[href*="hoteldetail"]')].filter(visible).flatMap((a,i)=>{try{const u=new URL(a.href),id=u.searchParams.get('hotelId'),name=txt(a.querySelector('h1,h2,h3,[class*="name"],[class*="Name"]'))||txt(a).split('\n')[0];return id&&name?[{id,name,summary:txt(a).slice(0,500),detailUrl:u.href,platformRank:i+1}]:[];}catch{return [];}});
  const listRows=candidates.length;const seen=new Set();candidates=candidates.filter(c=>/^\d{1,14}$/.test(c.id)&&c.name&&!seen.has(c.id)&&seen.add(c.id));
  const exact=task.phase==='locate'?[task.name]:q.hotelNames;
  if(exact?.length)candidates=candidates.filter(c=>exact.some(n=>compact(n)===compact(c.name)));
  if(task.matchNames?.length)candidates.sort((a,b)=>Number(task.matchNames.some(n=>compact(n)===compact(b.name)))-Number(task.matchNames.some(n=>compact(n)===compact(a.name))));
  if(task.phase==='discover'&&q.workflow==='selection'&&!q.hotelNames?.length){
   // List prices and facility words only decide which candidates to inspect
   // first. They never confirm the budget, a room's facilities or availability.
   const budgetTier=c=>q.budget==null?0:c.listNightly==null?1:c.listNightly<=q.budget?0:2;
   const p=q.discoveryPreferences||{},weight=k=>Math.max(0,Math.min(5,Number(p[k])||0)),hints=new Set(Array.isArray(p.priorityHints)?p.priorityHints:[]);
   const signals=[['smart','智能马桶',/智能马桶/,/(?:无|没有|不提供)智能马桶/,'facilitiesWeight'],['laundry','洗衣设施',/洗衣房|自助洗衣|洗衣服务/,/(?:无|没有|不提供)(?:洗衣房|自助洗衣|洗衣服务)/,'facilitiesWeight'],['newness','新开业或装修线索',/新开业|新装修|全新/,/(?:并非|不是|非)(?:新开业|新装修|全新)/,'newnessWeight'],['quiet','安静或隔音线索',/安静|隔音好|隔音效果好/,/不安静|隔音(?:很)?(?:差|不好)|吵闹/,'facilitiesWeight'],['transit','地铁线索',/近地铁|地铁站|交通便利/,/远离地铁|地铁(?:很)?远/,'transitWeight']];
   for(const c of candidates){
    c.discoverySignals=signals.filter(([key,,yes,no,w])=>(hints.has(key)||weight(w)>0)&&yes.test(c.summary)&&!no.test(c.summary)).map(([key,label,,,w])=>({key,label,weight:weight(w)}));
    c.discoveryScore=c.discoverySignals.reduce((sum,s)=>sum+s.weight,0)+(q.budget&&c.listNightly!=null&&c.listNightly<=q.budget?weight('priceWeight')*Math.max(0,1-c.listNightly/q.budget):0);
    c.rankingBasis='仅按预算与列表显式线索决定检查顺序；不代表设施、房型或体验已核实。';
   }
   candidates.sort((a,b)=>budgetTier(a)-budgetTier(b)||b.discoveryScore-a.discoveryScore||a.platformRank-b.platformRank);
  }
  if(!candidates.length){
   if(task.phase==='locate'&&listRows>0)return {status:'ready',candidates:[],code:'hotel_not_matched',message:'酒店列表已加载，但未找到名称可严格对应的分店；本平台未取得报价，不继续等待或混用相似酒店。'};
   if(/加载中|正在加载|正在搜寻/.test(body))return {status:'loading'};
   if(task.phase==='locate')return /没有找到|未找到符合|暂无相关酒店|无符合条件/.test(body)?{status:'ready',candidates:[],message:'本次按酒店名检索未找到同名且可核对身份的酒店。'}:{status:'loading'};
   return {status:'needs_review',message:'酒店列表结构未匹配。保留当前页供你核对；不会用预载酒店代替本次发现。'};
  }
  const pool=task.phase==='discover'&&q.workflow==='selection'&&!q.hotelNames?.length;
  return {status:'ready',candidates:candidates.slice(0,pool?12:q.maxHotels),discoverySummary:{visibleCandidateCount:listRows,returnedCandidateCount:Math.min(candidates.length,pool?12:q.maxHotels),scope:'本次页面可见且未标广告的酒店；不是全城穷举。'}};
 }
 const breakfast=s=>{
  const counts=new Set();
  for(const raw of String(s||'').split('\n')){
   const line=raw.replace(/\s+/g,'');if(!/早餐|餐食|含\d+早|双早|单早|不含早/.test(line))continue;
   // Whole-stay totals do not establish breakfast portions for each day/person.
   if((/(?:全程|累计|共计|合计|总计|总共|共)[^\d\n]{0,8}\d+/.test(line)||/\d+晚.*(?:早餐|含\d+早)/.test(line))&&!/每(?:日|天|晚|间)|每天/.test(line))continue;
   if(/无早餐|无餐食|不含早/.test(line)){counts.add(0);continue;}
   if(/双早|双人早餐/.test(line))counts.add(2);if(/单早/.test(line))counts.add(1);
   for(const m of line.matchAll(/(\d+)(?:人份|份|位|人)(?:自助)?早餐|含(\d+)早|早餐[^\d]{0,5}(\d+)(?:人份|份|位|人)/g)){const n=Number(m[1]||m[2]||m[3]);if(n>=0&&n<=10)counts.add(n);}
  }
  return counts.size===1?[...counts][0]:null;
 };
 const mealText=s=>{for(const line of String(s||'').split('\n').map(trim)){const m=line.match(/无早餐|无餐食|不含早|\d+\s*(?:人份|份|位|人)\s*(?:自助)?早餐|含\s*\d+\s*早|双人早餐|双早|单早|早餐[^\d\n]{0,5}\d+\s*(?:人份|份|位|人)/);if(m)return m[0];}return '早餐份数未注明';};
 const cancel=s=>s.split('\n').map(trim).find(l=>/取消|退订/.test(l))||'';
 const pay=s=>s.split('\n').map(trim).find(l=>/到店付|在线付|预付|现付/.test(l))||'';
 const paymentKey=s=>/到店付|现付/.test(s)?'pay_at_hotel':/担保/.test(s)?'guarantee':/线上预付|在线付|在线支付|预付/.test(s)?'online_prepaid':null;
 const cancellationKey=s=>{const t=String(s).replace(/\s/g,'');if(/确认(?:后)?30分钟内(?:可)?免费取消/.test(t))return 'confirmation_30m';if(/不可取消|不支持取消|不可免费取消|不能免费取消/.test(t))return 'nonrefundable';const time=t.match(/(\d{1,2}):(\d{2})前(?:可)?免费取消/);if(time&&/入住(?:当天|当日|日)/.test(t))return 'cutoff:'+q.checkin+':'+time[1].padStart(2,'0')+':'+time[2];const date=t.match(/(\d{1,2})月(\d{1,2})日/);return time&&date?'cutoff:'+q.checkin.slice(0,4)+'-'+date[1].padStart(2,'0')+'-'+date[2].padStart(2,'0')+':'+time[1].padStart(2,'0')+':'+time[2]:null;};
 const observations=[];
 const observe=(key,value,evidence,room='')=>observations.push({key,value,evidence:trim(evidence).slice(0,600),room,scope:room?'room':'hotel'});
 const roomFacts=(text,room)=>{
  const lines=text.split('\n').map(trim).filter(Boolean);
  for(const [key,term] of [['smart','智能马桶'],['desk','书桌'],['bathtub','浴缸'],['nonSmoking','禁烟']]){
   const line=lines.find(l=>l===term||l===term+' 免费');if(line)observe(key,true,line,room);
   const negative=lines.find(l=>new RegExp('^(?:无|没有|不提供)'+term+'[。！.!]?$').test(l));if(negative)observe(key,false,negative,room);
  }
  if(/2张[\d.]+米单人床/.test(text))observe('twinBeds',true,text.match(/2张[\d.]+米单人床/)[0],room);
  else if(/1张[\d.]+米(?:大床|特大床|双人床)/.test(text))observe('twinBeds',false,text.match(/1张[\d.]+米(?:大床|特大床|双人床)/)[0],room);
 };
 if(task.phase==='amenities'){
  const hotel=txt(document.querySelector('h1[class*="hotelOverview_name"]'));
  if(!hotel)return {status:'loading'};
  if(compact(hotel)!==compact(task.name))return {status:'needs_review',message:'设施资料所在酒店与本次候选不一致，已停止。'};
  const modal=[...document.querySelectorAll('[role="dialog"]')].filter(e=>visible(e)&&e.querySelector('[class*="galleryModal"]')).sort((a,b)=>Number(b.style.zIndex||0)-Number(a.style.zIndex||0))[0];
  if(!modal)return {status:'loading'};
  const title=txt(modal.querySelector('[class*="baseRoomLayer-roomName"]'));
  if(!title||/加载中|正在加载/.test(txt(modal)))return {status:'loading'};
  const content=txt(modal);if(compact(title)!==compact(task.selected.room))return {status:'needs_review',message:'设施弹窗房型不一致，已停止采用这些设施。'};
  roomFacts(content,task.selected.room);return {status:'ready',observations,offers:[]};
 }
 if(task.phase==='checkout'){
  const selected=task.selected;
  if(!selected||!body.includes(task.name)||!body.includes(selected.room))return {status:'needs_review',message:'订单预览的酒店或房型与刚才的套餐不一致，已停止。'};
  const nights=(Date.parse(q.checkout)-Date.parse(q.checkin))/86400000;
  const priceStart=provider==='ctrip'?body.indexOf('价格详情'):body.lastIndexOf('\n房费\n');
  if(priceStart<0)return {status:'loading'};
  const priceText=body.slice(priceStart,priceStart+2400);
  let total=null,baseTotal=null,discountTotal=null,finalPayment='';
  if(provider==='ctrip')total=amountAfter(priceText,new RegExp('1\\s*间\\s*[x×]\\s*'+nights+'\\s*晚\\s*[¥￥]\\s*([\\d,]+(?:\\.\\d{1,2})?)'));
  else{
   if(url.pathname!=='/hotel/book'||url.searchParams.get('hotelid')!==String(task.hotelId))return {status:'needs_review',message:'同程订单预览的酒店身份未匹配。'};
   // A guarantee is refundable security, never the room charge. Read only the
   // explicitly labelled prepayment OR pay-at-hotel room-charge block.
   const labels=[...document.querySelectorAll('.fang_fei')].filter(visible);
   const prepaid=labels.find(e=>txt(e)==='线上预付')?.parentElement;
   const atHotel=labels.find(e=>txt(e)==='到店付款')?.parentElement;
   if(prepaid&&atHotel)return {status:'needs_review',message:'页面同时列出预付和到店房费，付款口径未能可靠区分，已暂停。'};
   const block=prepaid||atHotel;
   const payable=block?amountAfter(txt(block),/(?:线上预付|到店付款)\s*[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/):null;
   const hasGuarantee=labels.some(e=>txt(e)==='在线担保');
   finalPayment=prepaid?'线上预付':atHotel?'到店付款'+(hasGuarantee?' · 需担保':''):'';
   baseTotal=amountAfter(priceText,new RegExp('房费\\s*'+nights+'\\s*晚\\s*[¥￥]\\s*([\\d,]+(?:\\.\\d{1,2})?)'));
   discountTotal=amountAfter(priceText,new RegExp('共计优惠\\s*'+nights+'\\s*晚优惠\\s*-\\s*[¥￥]\\s*([\\d,]+(?:\\.\\d{1,2})?)'));
   if(discountTotal===null&&baseTotal===payable)discountTotal=0;
   const daily=[...priceText.matchAll(/(20\d{2}-\d{2}-\d{2})[^\n]*\n\s*(\d+)\s*[x×]\s*[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/g)];
   const expected=Array.from({length:nights},(_,i)=>new Date(Date.parse(q.checkin)+i*86400000).toISOString().slice(0,10));
   const daysOK=daily.length===nights&&daily.every((m,i)=>m[1]===expected[i]&&Number(m[2])===q.rooms);
   if(payable!==null&&baseTotal!==null&&discountTotal!==null&&Math.abs(baseTotal-discountTotal-payable)<.02&&daysOK)total=payable;
  }
  if(total===null)return {status:'needs_review',message:'已进入订单预览，但没有读到明确的全程房费总额；不把担保金或均价当总额。'};
  const cancelStart=body.indexOf('取消政策'),cancelText=cancelStart>=0?body.slice(cancelStart,cancelStart+1200):'';
  const finalCancel=cancelText.split('\n').filter(l=>/取消|违约|退款|未入住|未能如约/.test(l)).map(trim).filter(Boolean).join(' ').slice(0,700)||selected.cancellation;
  if(cancellationKey(selected.cancellation)&&cancellationKey(finalCancel)!==cancellationKey(selected.cancellation))return {status:'needs_review',message:'订单预览的取消政策与所选套餐不同，已停止，不能按同条件比价。'};
  const checkoutBreakfast=breakfast(body);
  if(checkoutBreakfast!==null&&selected.breakfast!==null&&checkoutBreakfast!==selected.breakfast)return {status:'needs_review',message:'订单预览的餐食数量与所选套餐不同，已停止同条件比较。'};
  const breakfastInCheckout=selected.breakfast!==null&&checkoutBreakfast===selected.breakfast;
  const breakfastInSelectedPlan=selected.breakfast!==null&&String(selected.evidence||'').split('\n').some(l=>breakfast(l)===selected.breakfast);
  if(!breakfastInCheckout&&!breakfastInSelectedPlan)return {status:'needs_review',message:'订单预览和所选套餐原文均未能核对餐食条件，已暂停。'};
  const breakfastSource=breakfastInCheckout?'checkout_preview':'room_list';
  const breakfastEvidence=breakfastInCheckout?'订单预览明确显示“'+selected.breakfastText+'”':'刚才选中且已校验房型和价格的套餐列表明确写“'+selected.breakfastText+'”；订单预览未重复注明';
  const guarantee=amountAfter(body,/在线担保\s*[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/);
  const cashback=amountAfter(body,/本单返现\s*[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/);
  const displayedPayment=amountAfter(body,/到店付款\s*[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/);
  const exactBed=(body.match(/\d张\d+(?:\.\d+)?米(?:大床|特大床|单人床)/)||[])[0]||selected.bed;
  const finalPay=finalPayment||pay(body)||selected.payment;
  return {status:'ready',offers:[{...selected,bed:exactBed,total,baseTotal,discountTotal,qualification:provider==='tongcheng'&&priceText.includes('白金专享')?'含本机同程账号白金专享等优惠，其他账号可能不同':'含当前登录账号生效优惠，其他账号可能不同',breakfastConfirmed:breakfastInCheckout||breakfastInSelectedPlan,breakfastSource,breakfastEvidence,totalBasisConfirmed:true,stage:'checkout_preview',guarantee,cashback,displayedPayment,cancellation:finalCancel,payment:finalPay,evidence:[task.name,selected.room,exactBed,q.checkin+'至'+q.checkout,'1间×'+nights+'晚 订单预览总额¥'+total,baseTotal!==null?'优惠前房费¥'+baseTotal+'；共计优惠¥'+discountTotal+'\n'+priceText.slice(priceText.indexOf('共计优惠')).split('请您在提交订单')[0].trim():'','早餐：'+selected.breakfastText,'早餐依据：'+breakfastEvidence,finalCancel,finalPay,guarantee!==null?'担保¥'+guarantee:'',cashback!==null?'另列返现¥'+cashback:'',displayedPayment!==null?'页面另列到店付款¥'+displayedPayment:''].filter(Boolean).join('\n'),pending:['税费口径未独立核实','付款及优惠资格以平台为准']}]};
 }
 let offers=[],hotel='',address='';
 if(provider==='ctrip'){
  hotel=txt(document.querySelector('h1[class*="hotelOverview_name"]'));
  address=txt(document.querySelector('[class*="hotelOverview_addressText"]'));
  if(!hotel||compact(hotel)!==compact(task.name))return {status:'needs_review',message:'酒店名称与发现结果不一致，已暂停，避免串价。'};
  const intro=txt(document.querySelector('[class*="hotelOverview_hotelOverview-label"]'));
  const opened=intro.match(/开业[：:]\s*(20\d{2}|19\d{2})/),renovated=intro.match(/装修[：:]\s*(20\d{2}|19\d{2})/);
  if(opened)observe('opened',Number(opened[1]),opened[0]);if(renovated)observe('renovated',Number(renovated[1]),renovated[0]+'；范围未注明，不能当作目标客房翻新');
  const cards=[...document.querySelectorAll('#hotelRoomList [class*="commonRoomCard__"]')].filter(visible);
  if(!cards.length&&document.querySelector('[aria-label="Room selection"],#hotelRoomList')&&!/不接受预订|暂无可订|无可订房型|没有可预订/.test(body))return {status:'loading'};
  for(let ci=0;ci<cards.length;ci++){
   const card=cards[ci],room=txt(card.querySelector('[class*="commonRoomCard-title"]')),bed=txt(card.querySelector('[class*="baseRoom-bedsInfo"]'));
   roomFacts(txt(card.querySelector('[class*="baseRoom__"]')),room);
   const rows=[...card.querySelectorAll('[class*="saleRoomItemBox__"]')].filter(visible);
   for(let ri=0;ri<rows.length;ri++){
    const row=rows[ri],text=txt(row),price=row.querySelector('[aria-label^="Current price"]');
    if(!price||!visible(price)||!room)continue;
    const nightly=money(txt(price));if(nightly===null)continue;
    const count=breakfast(text),breakfastText=mealText(text);
    offers.push({rowKey:ci+':'+ri,hotel,address,room,bed,breakfast:count,breakfastText,listNightly:nightly,total:null,totalBasisConfirmed:false,cancellation:cancel(text),payment:pay(text),stage:'room_list',taxConfirmed:false,evidence:[hotel,room,bed,q.checkin+'至'+q.checkout,text].join('\n'),pending:['页面均价，尚未复核结算总额'],canPreview:!![...row.querySelectorAll('button,[role="button"]')].find(b=>txt(b)==='预订')});
   }
  }
 }else{
  hotel=task.name;
  if(!body.slice(0,6500).includes(hotel)){if(/加载中|正在加载/.test(body))return {status:'loading'};return {status:'needs_review',message:'同程页面未能核对到目标酒店名称。'};}
  // The main list excludes the duplicated recommendation card above it.
  const cards=[...document.querySelectorAll('.room-list-box .card[id]')].filter(visible);
  if(!cards.length&&/没有满足筛选条件的房型/.test(body))return {status:'needs_review',code:'room_results_unavailable',message:'同程未返回可核验房型，原因尚未确认；筛选条件或平台请求失败都可能产生这个空结果。不能据此认定无房，不会读取列表起价、推荐卡片或旧价补齐。'};
  for(let ci=0;ci<cards.length;ci++){
   const card=cards[ci],room=txt(card.querySelector('.roomInfoList-img h1')),roomDetails=txt(card.querySelector('.roomInfoList-img .room-card-cn'));
   if(!room)continue;
   const plans=[...card.querySelectorAll('.content-flex')].filter(visible);
   for(let ri=0;ri<plans.length;ri++){
    const plan=plans[ri],label=txt(plan.querySelector('h2')),text=txt(plan),price=plan.querySelector('.price .price-text p');
    if(!price||!visible(price)||!label)continue;
    let current=txt(price);for(const original of price.querySelectorAll('.original-price'))current=current.replace(txt(original),'');
    const nightly=money(current);if(nightly===null)continue;
    const btn=[...plan.querySelectorAll('.btn-top')].find(b=>txt(b)==='预订');
    offers.push({rowKey:ci+':'+ri,hotel,room,bed:roomDetails.split('\n').find(l=>l.includes('|')||l.includes('｜'))||'',breakfast:breakfast(label),breakfastText:/无餐食|不含早|无早餐/.test(label)?'无早餐':mealText(label),listNightly:nightly,total:null,totalBasisConfirmed:false,cancellation:label.replace(/^套餐\s*/,'').replace(/^(?:无餐食|不含早|无早餐|\d+\s*(?:人份|份|位|人)\s*(?:自助)?早餐|双人早餐|单人早餐|双早|单早|含\s*\d+\s*早|早餐\s*\d+\s*(?:份|位|人))\s*/,''),payment:pay(text),stage:'room_list',taxConfirmed:false,evidence:[hotel,room,roomDetails,q.checkin+'至'+q.checkout,'套餐：'+label,'页面当前均价¥'+nightly,text].join('\n'),pending:['页面均价，尚未复核结算总额','优惠为本机已登录账号口径，其他账号可能不同'],canPreview:!!btn});
   }
  }
 }
 if(!offers.length){if(/加载中|正在加载/.test(body))return {status:'loading'};if(/不接受预订|暂无可订|无可订房型|没有可预订/.test(body))return {status:'ready',offers:[],message:'平台本次没有可订房型，不能推定其他渠道无房。'};return {status:'needs_review',message:'未能可靠识别房型套餐价格，已保留页面；不会把其他金额凑成报价。'};}
 const reference=task.matchOffer;
 const usable=offers.filter(r=>(q.priceMode==='reference'||r.canPreview)&&(!q.roomName||r.room===q.roomName)&&(q.workflow!=='selection'||!q.budget||r.listNightly<=q.budget)&&(!(q.required||[]).includes('breakfast')||r.breakfast>=q.adults)&&(!(q.required||[]).includes('twinBeds')||/2张|双床/.test(r.bed+' '+r.room))&&(!(q.required||[]).includes('freeCancel')||(q.priceMode==='reference'?!!cancellationKey(r.cancellation)&&cancellationKey(r.cancellation)!=='nonrefundable':cancellationKey(r.cancellation)==='confirmation_30m'))).sort((a,b)=>Number(q.budget&&a.listNightly>q.budget)-Number(q.budget&&b.listNightly>q.budget)||a.listNightly-b.listNightly);
 const matching=reference?usable.filter(r=>compact(r.room)===compact(reference.room)&&r.breakfast===reference.breakfast&&cancellationKey(r.cancellation)&&cancellationKey(r.cancellation)===cancellationKey(reference.cancellation)&&(!paymentKey(r.payment)||paymentKey(r.payment)===paymentKey(reference.payment))):[];
 // Breakfast is mandatory only if requested; do not silently upgrade a user's
 // comparison to a more expensive meal plan that the other platform may lack.
 const selected=reference?(matching.find(r=>paymentKey(r.payment)&&paymentKey(r.payment)===paymentKey(reference.payment))||matching[0]):usable.find(r=>cancellationKey(r.cancellation)==='confirmation_30m'&&paymentKey(r.payment)==='online_prepaid')||usable.find(r=>paymentKey(r.payment)==='online_prepaid')||usable[0];
 const planSummary={visibleOfferCount:offers.length,eligibleOfferCount:usable.length,requiredBreakfastCount:(q.required||[]).includes('breakfast')?q.adults:0,roomSearchLimited:true,limitation:'只读取本次已展开且可见的房型套餐，未取得匹配套餐不代表酒店不提供；设施与完整取消责任仍需核实。'};
 if(task.phase==='rooms'&&q.workflow==='selection'&&!selected&&!task.plansExpanded){
  const extra=provider==='ctrip'?[...document.querySelectorAll('#hotelRoomList [role="button"][class*="foldButton-fold__"]')].filter(visible).filter(b=>/^展示额外\s*\d+\s*个房型价格[（(]/.test(txt(b))):[...document.querySelectorAll('.room-list-box .card[id] p.more-btn')].filter(visible).filter(b=>/^查看其他\s*\d+\s*个报价$/.test(txt(b)));
  if(extra.length)return {status:'expand_plans',code:'additional_room_plans',message:'当前可见套餐尚未匹配，正在展开平台提供的额外房型价格后再核对。',planSummary,expandablePlanGroups:Math.min(4,extra.length)};
 }
 const returned=offers.slice(0,12);if(selected&&!returned.includes(selected)){if(returned.length<12)returned.push(selected);else returned[11]=selected;}
 return {status:'ready',offers:returned,observations,previewCandidate:selected?{...selected,pending:[...selected.pending]}:null,planSummary};
}

// Public room-list expansion only. Identity/dates are validated by the reader
// before requesting this step; the expected hotel guards a navigation race.
// Exact observed role/class/text excludes booking, submit and payment controls.
export function expandCtripRoomPlans(expectedHotel=''){
 if(location.hostname!=='hotels.ctrip.com'||!/^\/hotels\/\d+\.html$/.test(location.pathname))return {clicked:false,count:0,remaining:0};
 const txt=e=>String(e?.innerText||'').replace(/\u00a0/g,' ').trim(),key=s=>String(s).normalize('NFKC').toLowerCase().replace(/[\s()（）·・•‧∙⋅]/g,'');
 const hotel=txt(document.querySelector('h1[class*="hotelOverview_name"]'));
 if(!hotel||(expectedHotel&&key(hotel)!==key(expectedHotel)))return {clicked:false,count:0,remaining:0,reason:'hotel_mismatch'};
 const buttons=[...document.querySelectorAll('#hotelRoomList [role="button"][class*="foldButton-fold__"]')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&/^展示额外\s*\d+\s*个房型价格[（(]/.test(txt(e)));
 let count=0;for(const button of buttons.slice(0,4)){button.click();count++;}
 return {clicked:count>0,count,remaining:Math.max(0,buttons.length-count)};
}

// Observed public Tongcheng room-card expansion. The recommendation cards and
// booking controls are outside this exact selector and text boundary.
export function expandTongchengRoomPlans(expectedHotel=''){
 if(location.hostname!=='www.ly.com'||location.pathname!=='/hotel/hoteldetail')return {clicked:false,count:0,remaining:0};
 const txt=e=>String(e?.innerText||'').replace(/\u00a0/g,' ').trim();
 if(!expectedHotel||!txt(document.body).slice(0,6500).includes(expectedHotel))return {clicked:false,count:0,remaining:0,reason:'hotel_mismatch'};
 const buttons=[...document.querySelectorAll('.room-list-box .card[id] p.more-btn')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&/^查看其他\s*\d+\s*个报价$/.test(txt(e)));
 let count=0;for(const button of buttons.slice(0,4)){button.click();count++;}
 return {clicked:count>0,count,remaining:Math.max(0,buttons.length-count)};
}

// Normal public search interaction, restricted to a city list and its search box.
export function searchPlatformHotels(term){
 if(typeof term!=='string'||!term.trim()||term.length>180)return {clicked:false};
 const tc=location.hostname==='www.ly.com'&&location.pathname==='/hotel/hotellist',ct=location.hostname==='hotels.ctrip.com'&&location.pathname.startsWith('/hotels/list');
 if(!tc&&!ct)return {clicked:false};
 const root=tc?document.querySelector('#keyWordBox'):document.querySelector('[aria-label="Search properties"]');
 const input=root?.querySelector(tc?'input[placeholder="位置/品牌/酒店"]':'input[placeholder="位置/品牌/酒店 (选填)"]');
 const button=tc?root?.querySelector('.searchBtn'):root?.querySelector('[role="button"][aria-label="搜索"]');
 if(!input||!button)return {clicked:false};
 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,term);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));button.click();return {clicked:true};
}

export function toggleCtripAmenities(rowKey,room,close=false){
 if(location.hostname!=='hotels.ctrip.com'||!/^\/hotels\/\d+\.html$/.test(location.pathname))return {clicked:false};
 if(close){const modal=[...document.querySelectorAll('[role="dialog"]')].find(e=>e.querySelector('[class*="galleryModal"]'));if(!modal)return {clicked:false,alreadyClosed:true};const button=modal.querySelector('[class*="galleryModal-close"]');if(!button)return {clicked:false};button.click();return {clicked:true};}
 const ci=Number(String(rowKey).split(':')[0]),card=[...document.querySelectorAll('#hotelRoomList [class*="commonRoomCard__"]')].filter(e=>e.getClientRects().length)[ci];
 if(!card||card.querySelector('[class*="commonRoomCard-title"]')?.innerText.trim()!==room)return {clicked:false};
 const button=card.querySelector('[data-test-id="baseRoom-roomAmenities"]');if(!button)return {clicked:false,unavailable:true};button.click();return {clicked:true};
}

// This is the only automated page click. It is restricted to the pre-booking
// room-list button labelled exactly 预订; it cannot click submit/payment buttons.
export function openCtripPreview(rowKey,expectedRoom,expectedPrice){
 if(location.hostname!=='hotels.ctrip.com'||location.pathname.includes('book'))return {clicked:false};
 const [ci,ri]=String(rowKey).split(':').map(Number),cards=[...document.querySelectorAll('#hotelRoomList [class*="commonRoomCard__"]')].filter(e=>e.getClientRects().length);
 const card=cards[ci];if(!card||card.querySelector('[class*="commonRoomCard-title"]')?.innerText.trim()!==expectedRoom)return {clicked:false};
 const row=[...card.querySelectorAll('[class*="saleRoomItemBox__"]')].filter(e=>e.getClientRects().length)[ri];
 const amount=row?.querySelector('[aria-label^="Current price"]')?.innerText.replace(/[¥￥,\s]/g,'');
 if(Number(amount)!==expectedPrice)return {clicked:false};
 const button=[...row.querySelectorAll('button,[role="button"]')].find(e=>e.innerText.trim()==='预订');
 if(!button)return {clicked:false};button.click();return {clicked:true};
}

// Restricted to the main room-list booking control; it cannot submit an order.
export function openTongchengPreview(rowKey,expectedRoom,expectedPrice){
 if(location.hostname!=='www.ly.com'||location.pathname!=='/hotel/hoteldetail')return {clicked:false};
 const visible=e=>!!e&&e.getClientRects().length>0;
 const [ci,ri]=String(rowKey).split(':').map(Number),card=[...document.querySelectorAll('.room-list-box .card[id]')].filter(visible)[ci];
 if(!card||card.querySelector('.roomInfoList-img h1')?.innerText.trim()!==expectedRoom)return {clicked:false};
 const plan=[...card.querySelectorAll('.content-flex')].filter(visible)[ri],price=plan?.querySelector('.price .price-text p');if(!price)return {clicked:false};
 let current=price.innerText.trim();for(const original of price.querySelectorAll('.original-price'))current=current.replace(original.innerText.trim(),'');
 if(Number(current.replace(/[¥￥,\s]/g,''))!==expectedPrice)return {clicked:false};
 const btn=[...plan.querySelectorAll('.btn-top')].find(e=>e.innerText.trim()==='预订');if(!btn)return {clicked:false};btn.click();return {clicked:true};
}
