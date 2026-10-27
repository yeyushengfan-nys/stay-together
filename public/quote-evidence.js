// Shared browser/server boundary: page evidence is scoped to one trip and one package.
(function(root){
 'use strict';
 const key=s=>String(s||'').normalize('NFKC').replace(/[\s·・•‧∙⋅()（）]/g,'').toLowerCase();
 const includes=(a,b)=>!!b&&String(a||'').replace(/\s/g,'').includes(String(b).replace(/\s/g,''));
 const clip=(s,n=3000)=>String(s||'').slice(0,n);
 function sourceURL(s,p){try{const u=new URL(s);const hosts=p==='ctrip'?['hotels.ctrip.com']:['www.ly.com','ly.com','ghotel.ly.com'];if(u.protocol!=='https:'||!hosts.includes(u.hostname))return '';for(const k of [...u.searchParams.keys()])if(!['hotelId','checkIn','checkOut','inDate','outDate','crn','adult','adultsNumber','children'].includes(k))u.searchParams.delete(k);return u.href;}catch{return '';}}
 function clean(raw,trip,name){
  const q=raw?.query;if(!q||key(q.city)!==key(trip.city)||q.checkin!==trip.checkin||q.checkout!==trip.checkout||q.rooms!==(trip.rooms||1)||q.adults!==(trip.adults||2)||!Array.isArray(raw.offers))return null;
  const offers=raw.offers.slice(0,80).filter(o=>['ctrip','tongcheng'].includes(o.provider)&&key(o.hotel)===key(name)&&o.checkIn===q.checkin&&o.checkOut===q.checkout&&o.rooms===q.rooms&&o.adults===q.adults&&o.children===0&&o.currency==='CNY'&&o.stage==='room_list'&&sourceURL(o.source,o.provider)&&o.room&&o.evidence&&Number.isFinite(Date.parse(o.capturedAt))).map(o=>({id:clip(o.id,180),provider:o.provider,platform:o.provider==='ctrip'?'携程':'同程',hotel:clip(o.hotel,140),room:clip(o.room,180),bed:clip(o.bed,200),checkIn:o.checkIn,checkOut:o.checkOut,rooms:o.rooms,adults:o.adults,children:0,currency:'CNY',stage:'room_list',listNightly:Number.isFinite(o.listNightly)&&o.listNightly>0?o.listNightly:null,breakfast:Number.isInteger(o.breakfast)&&o.breakfast>=0?o.breakfast:null,breakfastText:clip(o.breakfastText,160),cancellation:clip(o.cancellation,800),payment:clip(o.payment,100),capturedAt:o.capturedAt,source:sourceURL(o.source,o.provider),evidence:clip(o.evidence,4500),qualification:clip(o.qualification,180),price_basis:'room_page_reference',full_cancellation_verified:false,tax_verified:false}));
  return {version:1,job_id:clip(raw.job_id||raw.id,100),query:{city:q.city,checkin:q.checkin,checkout:q.checkout,rooms:q.rooms,adults:q.adults},selected_offer_id:clip(raw.selected_offer_id,180),offers};
 }
 function fromJob(job,name,offer){const b=clean({job_id:job.id,query:job.query,offers:job.offers,selected_offer_id:offer?.id},job.query,name);return b?.offers.length?b:null;}
 function breakfastCount(o){
  const t=o.breakfastText||'';if(!includes(o.evidence,t)&&!(/无早餐|无餐食/.test(t)&&/无早餐|无餐食/.test(o.evidence)))return null;
  if(/无早餐|无餐食|不含早/.test(t))return 0;
  if(/全程|累计|合计|总计|共\s*\d+\s*份/.test(t)&&!/每间每[日天晚]|每日|每天|每晚/.test(t))return null;
  const m=t.match(/(\d+)\s*(?:份|位|人).*早|含\s*(\d+)\s*早|早餐\s*(\d+)\s*(?:份|位|人)/);const n=/双早|双人早餐/.test(t)?2:/单早/.test(t)?1:m?Number(m[1]||m[2]||m[3]):null;
  return n;
 }
 function breakfast(o,adults){const n=breakfastCount(o);return n==null?null:n>=adults;}
 function freeCancel(o){
  const t=o.cancellation||'';if(!includes(o.evidence,t))return null;
  if(!/免费取消/.test(t))return /不可取消|不支持取消|取消收取全额/.test(t)?false:null;
  if(/不可免费取消|不能免费取消|无免费取消/.test(t))return false;
  if(/确认后\s*\d+\s*分钟内.*免费取消/.test(t))return true;
  const time=t.match(/(\d{1,2}):(\d{2})\s*前.*免费取消/);if(!time)return null;
  let date=/入住(?:当天|当日|日)/.test(t)?o.checkIn:null;
  const md=t.match(/(\d{1,2})月(\d{1,2})日/);if(md)date=o.checkIn.slice(0,4)+'-'+md[1].padStart(2,'0')+'-'+md[2].padStart(2,'0');
  if(!date)return null;
  const cutoff=Date.parse(`${date}T${time[1].padStart(2,'0')}:${time[2]}:00+08:00`);
  return Number.isFinite(cutoff)?Date.parse(o.capturedAt)<cutoff:null;
 }
 function facts(bundle,room){
  const offer=bundle?.offers.find(o=>o.id===bundle.selected_offer_id&&key(o.room)===key(room));
  return {breakfast:offer?breakfast(offer,bundle.query.adults):null,freeCancel:offer?freeCancel(offer):null};
 }
 const sourceId=(hotelID,o)=>'quote:'+hotelID+':'+o.id;
 function text(o){return [`平台：${o.platform}`,`酒店：${o.hotel}`,`房型：${o.room}`,`床型页面文字：${o.bed||'未注明'}`,`日期：${o.checkIn}至${o.checkOut}；${o.rooms}间/${o.adults}成人`,`房型页参考价：人民币${o.listNightly??'未知'}元／每间每晚（非最终应付价）`,`早餐页面文字：${o.breakfastText}`,`取消页面文字：${o.cancellation}`,`付款页面文字：${o.payment}`,`采集时间：${o.capturedAt}`,`账号条件：${o.qualification||'未独立核实'}`,`资料属性：本机自动读取的平台页面，非住客评价；未核验完整取消责任或税费。`,`页面采集原文：\n${o.evidence}`].join('\n');}
 function groups(bundle){
  const result=[];
  for(const a of bundle?.offers.filter(o=>o.provider==='ctrip')||[]){const b=bundle.offers.filter(o=>o.provider==='tongcheng'&&key(o.room)===key(a.room)&&o.breakfastText&&key(o.breakfastText)===key(a.breakfastText)).sort((x,y)=>(x.listNightly??Infinity)-(y.listNightly??Infinity))[0];if(!b||result.some(g=>key(g.room)===key(a.room)&&g.breakfast===a.breakfastText))continue;result.push({room:a.room,breakfast:a.breakfastText,ctrip_offer_id:a.id,tongcheng_offer_id:b.id,ctrip_reference:a.listNightly,tongcheng_reference:b.listNightly,ctrip_bed:a.bed,tongcheng_bed:b.bed,ctrip_cancellation:a.cancellation,tongcheng_cancellation:b.cancellation,ctrip_payment:a.payment,tongcheng_payment:b.payment,room_name_matches:true,bed_details_verified:false,cancellation_text_matches:key(a.cancellation)===key(b.cancellation),full_cancellation_verified:false,can_claim_final_cheaper:false});}
  return result;
 }
 root.StayQuoteEvidence={key,clean,fromJob,facts,sourceId,text,groups,breakfastCount};
})(typeof window!=='undefined'?window:globalThis);
