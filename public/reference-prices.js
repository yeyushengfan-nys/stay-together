// Reference room-page prices stay separate from verified checkout totals.
(function(root){
 'use strict';
 const key=s=>String(s||'').normalize('NFKC').replace(/[\s·・•‧∙⋅()（）]/g,'').toLowerCase();
 function chosen(job,name,provider){
  const rows=job.offers.filter(o=>o.provider===provider&&key(o.hotel)===key(name)&&o.stage==='room_list'&&Number.isFinite(o.listNightly)&&o.listNightly>=0);
  const selected=rows.find(o=>o.selectedForComparison);if(selected)return selected;
  const fallback=rows.sort((a,b)=>a.listNightly-b.listNightly)[0];return fallback?{...fallback,referenceFallback:true}:null;
 }
 function build(job){
  const names=[...new Map([...(job.candidates||[]).map(c=>c.canonicalName||c.name),...job.offers.map(o=>o.hotel)].map(n=>[key(n),n])).values()];
  const rows=names.map(name=>{
   const ct=chosen(job,name,'ctrip'),tc=chosen(job,name,'tongcheng');
   const aligned=!!(ct&&tc&&!ct.referenceFallback&&!tc.referenceFallback&&key(ct.room)===key(tc.room)&&ct.breakfast!==null&&ct.breakfast===tc.breakfast);
   const selected=[ct,tc].filter(o=>o&&!o.referenceFallback).sort((a,b)=>a.listNightly-b.listNightly);
   const reference=selected[0]||[ct,tc].filter(Boolean).sort((a,b)=>a.listNightly-b.listNightly)[0]||null;
   return {name,ct,tc,reference,aligned,nightlyDifference:aligned?Math.round(Math.abs(ct.listNightly-tc.listNightly)*100)/100:null,withinReferenceBudget:reference&&job.query.budget?reference.listNightly<=job.query.budget:null};
  });
  return {rows,prices:rows.reduce((n,r)=>n+Number(!!r.ct)+Number(!!r.tc),0),aligned:rows.filter(r=>r.aligned).length};
 }
 function retainedEvidence(old,room){
  // Keep a user's completed source checks. A new price search is not a reason
  // to undo a review, but it must not promote old-room or old-package facts.
  const roomKeys=new Set(['smart','mold','quiet','nonSmoking','accessible','family','bathtub','desk','view']);
  const packageKeys=new Set(['price','referencePrice','nightly','total','taxConfirmed','breakfast','freeCancel','payment','cancellation']);
  const genericRooms=new Set(['','未注明','未标注','房型未注明','房型未知','未知','待确认','范围未明确','酒店','酒店级','酒店级资料','酒店级信息','全店','全店资料','hotel','allrooms','目标房型未取得','未取得匹配房型','具体房型待选择','具体房型待确认'].map(key));
  const target=key(room),knownTarget=!genericRooms.has(target),roomChanged=key(old?.room)!==target;
  return (old?.evidence||[]).filter(e=>!e.collectorSource).map(source=>{
   const e=structuredClone(source);if(e.confirmed!==true)return e;
   const keys=Object.keys(e.claims||{}),firstLine=String(e.text||'').split('\n')[0];
   const oldPackage=['quote','price','date_quote','platform_room_page'].includes(e.kind)||keys.some(k=>packageKeys.has(k))||/^【[^】]*(?:公开报价摘要|报价快照|房型报价|房型页|订单预览)/.test(firstLine);
   const scopedClaim=keys.some(k=>roomKeys.has(k)),recordRoom=key(e.room),hasNamedRoom=!genericRooms.has(recordRoom);
   const declaredHotel=e.scope==='hotel'||e.roomScope==='hotel'||e.room_scope==='hotel'||/适用范围[：:]\s*hotel(?:[；;\s]|$)/.test(e.text||'');
   // A checked review about another room remains useful context. With no
   // room-scoped claims it cannot confirm the target room's facilities.
   const reviewContext=!scopedClaim&&/^【(?:公开住客评价|评价截图)/.test(firstLine);
   const roomDependent=scopedClaim||(!declaredHotel&&hasNamedRoom&&!reviewContext);
   if(oldPackage||(roomDependent&&(!knownTarget||(hasNamedRoom?recordRoom!==target:roomChanged))))e.confirmed=false;
   return e;
  });
 }
 root.StayReferencePrices={key,chosen,build,retainedEvidence};
})(typeof window!=='undefined'?window:globalThis);

function collectorReferenceHTML(job){
 const result=window.StayReferencePrices.build(job);
 const cell=o=>o?`<strong>¥${E(o.listNightly)}</strong><small>参考价 / 每间每晚</small><small>${E(o.room)} · ${E(o.breakfastText)}</small>${o.referenceFallback?'<small class="bad">未通过所选房型条件，仅供查看</small>':''}<small>${E(o.cancellation)} · ${E(o.payment)}</small><small>采集 ${E(new Date(o.capturedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}))}</small>${link(o.source,'查看房型页 ↗')}`:'本页未取得房型参考价';
 const rows=result.rows.map(r=>{
  const room=r.reference?.room||'',f=StaySelection.facts(job,r.name,room);
  const comparison=r.aligned?`<b>通过房型条件，名称、早餐对应</b><small>参考价差 ¥${E(r.nightlyDifference)} / 晚</small>`:r.ct?.referenceFallback||r.tc?.referenceFallback?'<b>未通过本次房型条件</b><small>价格仅供查看，不计为符合条件的对应套餐。</small>':r.ct&&r.tc?'<b>房型或早餐未对应</b>':'<b>还缺另一平台房型参考价</b>';
  return `<tr><td><b>${E(r.name)}</b><small>${E(room||'目标房型尚未取得')}</small></td><td>${cell(r.ct)}</td><td>${cell(r.tc)}</td><td>${comparison}<small>房型可住人数、床型细项、完整取消规则、付款及税费尚未核对，不标最终最低价。</small></td><td>${r.withinReferenceBudget===true?'页面参考价在汇总预算内':r.withinReferenceBudget===false?'页面参考价超出汇总预算':'参考预算尚不能判断'}<details><summary>已取得的设施依据</summary>${f.observations.length?f.observations.map(o=>`<p>${E(StaySelection.labels[o.key]||o.key)}：${E(o.value)} · ${E(o.evidence)} ${link(o.source,'来源 ↗')}</p>`).join(''):'尚无目标房型设施证据。'}<p>智能马桶、卫生、安静等要求仍按原同行偏好核对；未知项保持待确认。</p></details></td></tr>`;
 }).join('');
 return `<div class="selection-summary"><h3>页面参考价，先缩小候选</h3><p>${result.rows.length}家候选 · ${result.prices}个展示的房型页参考价 · ${result.aligned}家通过房型条件且名称、早餐对应</p></div><p class="notice">当前为参考价模式：只读取房型页面，不进入订单预览。金额不是最终应付价，不推算全程总额，也不宣称已完成同条件最低价核验。</p><div class="table-wrap"><table class="selection-table"><thead><tr><th>酒店与房型</th><th>携程参考价</th><th>同程参考价</th><th>可以比较到哪一步</th><th>预算及设施</th></tr></thead><tbody>${rows}</tbody></table></div><p class="small">人民币、每间每晚；含当前页面账号优惠的展示口径。早餐、取消提示保留原文；未注明不代表满足。飞猪、去哪儿本轮未参与。本轮筛选条件按查询时保存；修改同行偏好后请重新查价。正式首选、备选仍需补齐必要条件证据。</p>`;
}

function collectorSyncReferenceCandidates(job){
 const result=window.StayReferencePrices.build(job),ids=[];
 for(const r of result.rows){
  const old=state.hotels.find(h=>!h.demo&&StaySelection.key(h.name)===StaySelection.key(r.name)&&HotelJourney.city(h.city)===HotelJourney.city(job.query.city));
  const id=old?.id||uid(),o=r.reference,room=o?.room||'目标房型未取得',observed=StaySelection.facts(job,r.name,room);
  const bundle=StayQuoteEvidence.fromJob(job,r.name,o),packageFacts=StayQuoteEvidence.facts(bundle,room);
  const h={...old,quoteBundle:bundle,id,name:r.name,city:job.query.city,area:job.query.area||'',room,price:null,referencePrice:o?.listNightly??null,priceBasis:'room_page_reference',metro:observed.values.metro??null,quoteDate:o?.capturedAt?.slice(0,10)||'',source:o?.source||'',terms:o?`房型页参考价：人民币${o.listNightly}元／每间每晚；${job.query.checkin}至${job.query.checkout}，${job.query.rooms}间/${job.query.adults}成人。${o.breakfastText}；${o.cancellation}；${o.payment}。未核对全程总额、税费及最终优惠。`:'本次未取得符合所选条件的房型参考价',demo:false,collector:true,facts:{smart:null,laundry:null,mold:null,opened:null,renovated:null,...observed.values,...packageFacts},evidence:[...window.StayReferencePrices.retainedEvidence(old,room),...observed.observations.map((obs,i)=>({id:job.id+'-'+id+'-'+i,text:'【平台页面资料，非住客原话】\n'+obs.evidence,claims:{[obs.key]:obs.value},platform:obs.provider==='ctrip'?'携程':'同程',room:obs.room||'酒店级资料',date:obs.capturedAt.slice(0,10),source:obs.source,confirmed:false,demo:false,collectorSource:true,image:null}))]};
  const at=state.hotels.findIndex(h=>h.id===id);if(at>=0)state.hotels[at]=h;else state.hotels.push(h);ids.push(id);
 }
 state.hotelSelection=ids;state.collectorAppliedRevision=job.id+':'+job.revision;delete state.aiResult;
}
