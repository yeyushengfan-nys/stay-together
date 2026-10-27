// Evidence-based selection shared by all hotels; it contains no hotel IDs or prices.
(function(root){
 'use strict';
 const key=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s·・•‧∙⋅()（）]/g,'');
 const labels={smart:'智能马桶',smartWash:'马桶清洗功能（臀洗／妇洗）',laundry:'免费自助洗衣',nonSmoking:'无烟客房',twinBeds:'双床房',breakfast:'包含早餐',freeCancel:'免费取消',parking:'停车位',family:'亲子设施',petFriendly:'允许宠物',accessible:'无障碍客房',bathtub:'浴缸',gym:'健身房',pool:'泳池',invoice:'所需发票',desk:'办公桌',view:'指定景观',lateCheckin:'晚到入住',quiet:'安静／隔音',mold:'潮味／霉味反馈'};
 function required(people){return [...new Set(people.flatMap(p=>[...(p.requireSmart?['smart']:[]),...(p.requireLaundry?['laundry']:[]),...(p.avoidMold?['mold']:[]),...(p.conditions||[]).filter(c=>c.mode==='must').map(c=>c.id)]))];}
 function constraints(people){const budgets=people.filter(p=>p.budgetHard).map(p=>p.budget),mean=k=>people.length?people.reduce((n,p)=>n+Number(p.weights?.[k]??3),0)/people.length:3;const priorityHints=[...new Set([...required(people).filter(k=>['smart','smartWash','laundry','quiet','twinBeds','pool','bathtub','parking','nonSmoking'].includes(k)),...(mean('newness')>=3?['newness']:[]),...(mean('transit')>=3?['transit']:[])])];return {required:required(people),budget:budgets.length?Math.min(...budgets):null,discoveryPreferences:{priceWeight:mean('price'),transitWeight:mean('transit'),newnessWeight:mean('newness'),facilitiesWeight:mean('facilities'),priorityHints}};}
 function facts(job,name,room){
  const observations=(job.observations||[]).filter(o=>key(o.hotel)===key(name)&&(!o.room||key(o.room)===key(room))&&o.evidence&&o.source);
  const values={},conflicts=[];
  for(const o of observations){if(!(o.key in labels)&&!['opened','renovated','metro'].includes(o.key))continue;if(o.key in values&&values[o.key]!==o.value){values[o.key]=null;conflicts.push(o.key);}else if(!conflicts.includes(o.key))values[o.key]=o.value;}
  return {values,observations,conflicts};
 }
 function evaluate(job,name,people){
  const offers=job.offers.filter(o=>key(o.hotel)===key(name)),pairs=root.StayCollectorCompare.pairs(offers);
  const pair=pairs.sort((a,b)=>a.lower.total-b.lower.total)[0]||null;
  const verified=offers.filter(o=>o.totalBasisConfirmed&&Number.isFinite(o.nightly)).sort((a,b)=>a.nightly-b.nightly);
  const selected=pair?.lower||verified[0]||null,room=selected?.room||offers[0]?.room||'';
  const observed=facts(job,name,room),f={...observed.values},blocks=[],unknown=[],satisfied=[];
  if(selected){f.breakfast=selected.breakfastConfirmed?selected.breakfast>=job.query.adults:null;f.freeCancel=root.StayCollectorCompare.policy(selected.cancellation,selected.total)?true:null;}
  const check=(value,ok,label)=>{if(value==null)unknown.push(label+'缺少明确证据');else if(!ok(value))blocks.push(label+'不满足');else satisfied.push(label+'已核对');};
  for(const p of people){
   if(p.budgetHard)check(selected?.nightly,v=>v<=p.budget,p.name+'的每晚预算¥'+p.budget);
   if(p.requireSmart)check(f.smart,v=>v===true,p.name+'要求智能马桶');
   if(p.requireLaundry)check(f.laundry,v=>v===true,p.name+'要求免费自助洗衣');
   if(p.avoidMold)check(f.mold,v=>v===false,p.name+'要求核查潮味／霉味反馈');
   if(p.transitHard)check(f.metro,v=>v<=p.maxMetro,p.name+'要求地铁步行≤'+p.maxMetro+'分钟');
   for(const c of (p.conditions||[]).filter(c=>c.mode==='must'))check(f[c.id],v=>v===true,p.name+'要求'+(labels[c.id]||c.id));
   if(p.newnessHard){const n=root.HotelCriteria.freshness(f,p.newnessPolicy,Number(job.query.checkin.slice(0,4)));check(n.age,v=>v<=root.HotelCriteria.policy(p.newnessPolicy).newWithin,p.name+'的较新标准');}
  }
  if(!selected)unknown.push('尚未取得完整订单预览总额');
  const status=blocks.length?'blocked':unknown.length?'pending':'fits';
  const preference=root.HotelEngine?.evaluate({id:name,price:selected?.nightly??null,metro:f.metro??null,facts:f,evidence:[]},people.map(p=>({...p,weights:p.weights||{price:1,transit:0,newness:0,facilities:0}})),Number(job.query.checkin.slice(0,4)));
  return {name,offers,pairs,pair,selected,room,facts:f,observations:observed.observations,conflicts:observed.conflicts,status,preference,blocks:[...new Set(blocks)],unknown:[...new Set(unknown)],satisfied:[...new Set(satisfied)]};
 }
 function build(job,people){
  const names=[...new Map([...(job.candidates||[]).map(c=>c.canonicalName||c.name),...job.offers.map(o=>o.hotel)].map(n=>[key(n),n])).values()];
  const order={fits:0,pending:1,blocked:2};
  const rows=names.map(n=>evaluate(job,n,people)).sort((a,b)=>order[a.status]-order[b.status]||Number(!a.pair)-Number(!b.pair)||(b.preference?.min??0)-(a.preference?.min??0)||(b.preference?.avg??0)-(a.preference?.avg??0)||(a.selected?.nightly??Infinity)-(b.selected?.nightly??Infinity));
  const eligible=rows.filter(r=>r.status==='fits'&&r.pair);return {rows,eligible,top:eligible.slice(0,2),matched:rows.filter(r=>r.pair).length};
 }
 root.StaySelection={key,labels,required,constraints,facts,evaluate,build};
})(typeof window!=='undefined'?window:globalThis);
