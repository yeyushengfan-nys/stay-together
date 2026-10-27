// Presentation-only package matching. It never changes saved quotes or preferences.
(function(root){
 'use strict';
 const finite=n=>typeof n==='number'&&Number.isFinite(n),positive=n=>finite(n)&&n>0;
 const key=s=>root.StayQuoteEvidence.key(s);
 function requirements(people,trip){
  const must=new Set((people||[]).flatMap(p=>(p.conditions||[]).filter(c=>c.mode==='must').map(c=>c.id)));
  const budgets=(people||[]).filter(p=>p.budgetHard&&positive(p.budget)).map(p=>p.budget);
  return {adults:Number(trip.adults)||2,budget:budgets.length?Math.min(...budgets):null,breakfast:must.has('breakfast'),twinBeds:must.has('twinBeds'),freeCancel:must.has('freeCancel')};
 }
 function breakfastCount(o){
  if(root.StayQuoteEvidence.breakfastCount)return o?root.StayQuoteEvidence.breakfastCount(o):null;
  if(!o)return null;
  const t=o.breakfastText||'',e=String(o.evidence||'').replace(/\s/g,'');
  if(!t||!e.includes(t.replace(/\s/g,'')))return null;
  if(/无早餐|无餐食|不含早/.test(t))return 0;
  if(/双早/.test(t))return 2;if(/单早/.test(t))return 1;
  const m=t.match(/(\d+)\s*(?:份|位|人).*早|含\s*(\d+)\s*早/);
  return m?Number(m[1]||m[2]):null;
 }
 function breakfastLabel(o){const n=breakfastCount(o);return n===null?'早餐份数未注明':n===0?'无早餐':n+'份早餐';}
 function cancellationKey(o){
  if(!o)return '';
  return key(o.cancellation).replace(/^(?:套餐[:：]?)?(?:无餐食|不含早|无早餐|\d+份早餐|双人早餐|单人早餐|含\d+早)/,'').replace(/入住(?:当天|当日|日)/g,o.checkIn||'入住日').replace(/可免费取消/g,'免费取消');
 }
 function inspect(o,req){
  const facts=root.StayQuoteEvidence.facts({selected_offer_id:o.id,offers:[o],query:{adults:req.adults}},o.room),fail=[],unknown=[];
  const check=(k,value,label)=>{if(value===null)unknown.push({key:k,label});else if(!value)fail.push({key:k,label});};
  if(!positive(o.listNightly))unknown.push({key:'budget',label:'该套餐参考价未取得'});
  else if(req.budget!==null)check('budget',o.listNightly<=req.budget,'该套餐参考价超出每晚 ¥'+req.budget+' 上限');
  if(req.breakfast){const n=breakfastCount(o);check('breakfast',n===null?null:n>=req.adults,n===0?'该套餐不含早餐':n===null?'未注明'+req.adults+'成人所需早餐份数':'该套餐仅'+n+'份早餐，需'+req.adults+'份');}
  const s=o.bed+' '+o.room,twins=/2\s*张|两张|双床|\btwin\b/i.test(s)?true:/1\s*张|一张|大床|\bking\b|\bqueen\b/i.test(s)?false:null;
  facts.twinBeds=twins;
  if(req.twinBeds)check('twinBeds',twins,'该套餐未确认所需双床');
  if(req.freeCancel)check('freeCancel',facts.freeCancel,facts.freeCancel===null?'免费取消窗口未核实':'该套餐没有可用的免费取消窗口');
  return {offer:o,facts,fail,unknown,matched:!fail.length&&!unknown.length};
 }
 function pairFor(selected,offers,checks){
  if(!selected)return {ctrip:null,tongcheng:null};
  const result={};
  for(const provider of ['ctrip','tongcheng']){
   const rows=offers.filter(o=>o.provider===provider&&key(o.room)===key(selected.room));
   rows.sort((a,b)=>Number(a.id!==selected.id)-Number(b.id!==selected.id)||Number(breakfastCount(a)!==breakfastCount(selected))-Number(breakfastCount(b)!==breakfastCount(selected))||Number(cancellationKey(a)!==cancellationKey(selected))-Number(cancellationKey(b)!==cancellationKey(selected))||Number(!checks.find(x=>x.offer.id===a.id)?.matched)-Number(!checks.find(x=>x.offer.id===b.id)?.matched)||(a.listNightly??Infinity)-(b.listNightly??Infinity));
   result[provider]=rows[0]||null;
  }
  return result;
 }
 function build(hotel,people,trip){
  const req=requirements(people,trip),raw=hotel.quoteBundle;
  if(!raw)return {enabled:false,requirements:req,selectedOffer:null,fallbackOffer:null,offersByProvider:{ctrip:null,tongcheng:null},checks:[],matchedOffers:[],noMatchReasons:[],scanned:0,derivedHotel:{...hotel}};
  const bundle=root.StayQuoteEvidence.clean(raw,trip,hotel.name),offers=bundle?.offers||[],checks=offers.map(o=>inspect(o,req));
  const matched=checks.filter(x=>x.matched).sort((a,b)=>(a.offer.listNightly??Infinity)-(b.offer.listNightly??Infinity));
  const samePair=(a,b)=>a.provider!==b.provider&&key(a.room)===key(b.room)&&breakfastCount(a)!==null&&breakfastCount(a)===breakfastCount(b)&&a.cancellation&&!/未注明|待确认/.test(a.cancellation)&&cancellationKey(a)===cancellationKey(b);
  const selectedOffer=(matched.find(a=>matched.some(b=>samePair(a.offer,b.offer)))||matched[0])?.offer||null,fallbackOffer=selectedOffer?null:offers.filter(o=>positive(o.listNightly)).sort((a,b)=>a.listNightly-b.listNightly)[0]||null;
  const target=selectedOffer||fallbackOffer,room=target?.room||hotel.room||'未取得匹配房型',noMatchReasons=[];
  if(!selectedOffer){
   if(!offers.length)noMatchReasons.push({key:'quotes',label:'尚无当前行程可核对的套餐'});
   else{
    if(req.breakfast&&!checks.some(x=>breakfastCount(x.offer)!==null&&breakfastCount(x.offer)>=req.adults))noMatchReasons.push({key:'breakfast',label:checks.every(x=>breakfastCount(x.offer)===0)?'已采套餐均无早餐；当前要求'+req.adults+'成人各1份':'本次未采到明确包含'+req.adults+'份早餐的套餐'});
    if(req.budget!==null&&!checks.some(x=>positive(x.offer.listNightly)&&x.offer.listNightly<=req.budget))noMatchReasons.push({key:'budget',label:'已采套餐未取得每晚 ¥'+req.budget+' 内的参考价'});
    for(const [k,label] of [['twinBeds','未采到明确符合所需双床的套餐'],['freeCancel','未采到明确可用免费取消窗口的套餐']])if(req[k]&&checks.every(x=>[...x.fail,...x.unknown].some(i=>i.key===k)))noMatchReasons.push({key:k,label});
    if(!checks.some(x=>positive(x.offer.listNightly)))noMatchReasons.push({key:'budget',label:'已采套餐缺少可核对的参考价'});
    if(!noMatchReasons.length)noMatchReasons.push({key:'combination',label:'已采套餐没有同时满足预算、房型、早餐和取消要求'});
   }
  }
  const derivedBundle=bundle?.offers.length?{...bundle,selected_offer_id:target?.id||''}:null;
  const packageFacts={...root.StayQuoteEvidence.facts(derivedBundle,room),twinBeds:target?checks.find(x=>x.offer.id===target.id)?.facts.twinBeds??null:null};
  // Selecting a different meal plan may select a different room. Evidence for
  // the previous room cannot silently become evidence for this one.
  const roomChanged=key(room)!==key(hotel.room),scopedKeys=['smart','mold','quiet','nonSmoking','accessible','family','bathtub','desk','view'];
  const reset=roomChanged?Object.fromEntries(scopedKeys.map(k=>[k,null])):{};
  const evidence=(hotel.evidence||[]).map(e=>roomChanged&&Object.keys(e.claims||{}).some(k=>scopedKeys.includes(k))&&key(e.room)!==key(room)?{...e,confirmed:false}:e);
  const packageChanged=roomChanged||target?.id!==raw.selected_offer_id;
  const terms=target?`本次展示的房型页参考价：人民币${target.listNightly}元／每间每晚；${target.room}；${target.breakfastText}；${target.cancellation}；${target.payment}。未核对最终含税应付价。`:hotel.terms;
  const derivedHotel={...hotel,room,terms,price:packageChanged?null:hotel.price,quoteBundle:derivedBundle,referencePrice:target?.listNightly??null,facts:{...hotel.facts,...reset,...packageFacts},evidence,staleQuote:!offers.length};
  return {enabled:true,requirements:req,selectedOffer,fallbackOffer,offersByProvider:pairFor(target,offers,checks),checks,matchedOffers:matched.map(x=>x.offer),noMatchReasons,scanned:offers.length,derivedHotel};
 }
 root.HotelPackageMatch={build,requirements,breakfastCount,breakfastLabel,cancellationKey};
})(typeof globalThis!=='undefined'?globalThis:this);
