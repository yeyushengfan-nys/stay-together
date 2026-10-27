// Pure, transparent recommendation rules. No generated claims or hidden model scores.
(function(root){
  const dateYear=()=>new Date().getFullYear();
  const policyKeys=['invoice','lateCheckin'];
  const isPolicyEvidence=e=>e?.kind==='platform_policy'||e?.policyScope!==undefined;
  function cleanPolicyScope(s){
    const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
    const text=(v,n)=>typeof v==='string'&&v.trim()&&v.length<=n;
    if(!s||s.version!==1||!['ctrip','tongcheng'].includes(s.provider)||!text(s.hotel,140)||!text(s.room,180)||!date(s.checkin)||!date(s.checkout)||s.checkout<=s.checkin||!Number.isInteger(s.rooms)||s.rooms<1||s.rooms>4||!Number.isInteger(s.adults)||s.adults<1||s.adults>8||s.children!==0||!Number.isInteger(s.breakfastCount)||s.breakfastCount<0||s.breakfastCount>8||!['online','at_property'].includes(s.paymentBasis)||typeof s.requiresPaidConfirmed!=='boolean'||(s.requiresPaidConfirmed&&s.paymentBasis!=='online')||typeof s.offerId!=='string'||s.offerId.length>180)return null;
    return {version:1,provider:s.provider,hotel:s.hotel.trim(),room:s.room.trim(),checkin:s.checkin,checkout:s.checkout,rooms:s.rooms,adults:s.adults,children:0,breakfastCount:s.breakfastCount,paymentBasis:s.paymentBasis,requiresPaidConfirmed:s.requiresPaidConfirmed,offerId:s.offerId};
  }
  function policyPaymentBasis(value){
    const text=String(value||'');if(!text||/未注明|未知|待确认|不详/.test(text))return null;
    const online=/在线付|在线支付|线上付|线上支付|预付|提前支付/.test(text),atProperty=/到店付|到店支付|到店付款|前台付|现付/.test(text);
    return online===atProperty?null:online?'online':'at_property';
  }
  function cleanPolicySource(source,provider){
    try{const u=new URL(source),host=provider==='ctrip'?'ctrip.com':provider==='tongcheng'?'ly.com':'';
      if(!host||u.protocol!=='https:'||u.username||u.password||!(u.hostname===host||u.hostname.endsWith('.'+host)))return '';
      u.hash='';for(const k of [...u.searchParams.keys()])if(!['hotelId','hotelid','checkIn','checkOut','inDate','outDate','crn','rooms','adult','adultsNumber','children'].includes(k))u.searchParams.delete(k);
      return u.href;
    }catch{return '';}
  }
  function policyFactsFor(h,trip=h.quoteBundle?.query){
    const evidence=(h.evidence||[]).filter(isPolicyEvidence),controlledKeys=[...new Set(evidence.flatMap(e=>policyKeys.filter(k=>Object.hasOwn(e.claims||{},k))))],facts=Object.fromEntries(controlledKeys.map(k=>[k,null])),applied=[],conflicts=[],inactive=[];
    const Q=root.StayQuoteEvidence,bundle=trip&&(trip.children??0)===0?Q?.clean(h.quoteBundle,trip,h.name):null,offer=bundle?.offers?.find(o=>o.id===bundle.selected_offer_id&&Q.key(o.room)===Q.key(h.room));
    for(const e of evidence){
      const s=cleanPolicyScope(e.policyScope);let reason='';
      if(e.confirmed!==true)reason='来源尚未核对';
      else if(!s)reason='政策适用范围不完整';
      else if(!cleanPolicySource(e.source,s.provider))reason='缺少对应平台的官方来源';
      else if(!s.offerId)reason='尚未确认对应套餐';
      else if(!offer)reason='当前行程没有选中有效套餐';
      else if(s.provider!==offer.provider)reason='仅适用于另一预订平台';
      else if(s.offerId!==offer.id)reason='仅适用于另一套餐';
      else if(Q.key(s.hotel)!==Q.key(h.name)||Q.key(s.room)!==Q.key(offer.room))reason='酒店或目标房型不一致';
      else if(s.checkin!==offer.checkIn||s.checkout!==offer.checkOut||s.rooms!==offer.rooms||s.adults!==offer.adults||s.children!==offer.children)reason='日期或入住人数不一致';
      else if(Q.breakfastCount(offer)!==s.breakfastCount)reason='早餐份数不一致或未核清';
      else if(policyPaymentBasis(offer.payment)!==s.paymentBasis)reason='付款方式不一致或未注明';
      if(reason){inactive.push({id:e.id,reason});continue;}
      const claims=Object.fromEntries(policyKeys.filter(k=>typeof e.claims?.[k]==='boolean').map(k=>[k,e.claims[k]]));
      applied.push({id:e.id,claims,scope:s,requiresPaidConfirmed:s.requiresPaidConfirmed});
    }
    for(const k of controlledKeys){const values=[...new Set(applied.filter(e=>Object.hasOwn(e.claims,k)).map(e=>e.claims[k]))];if(values.length===1)facts[k]=values[0];else if(values.length>1)conflicts.push(k);}
    return {facts,controlledKeys,applied,conflicts,inactive};
  }
  function factsFor(h,trip){
    const f={...h.facts,...(h.quoteBundle&&root.StayQuoteEvidence?root.StayQuoteEvidence.facts(h.quoteBundle,h.room):{})};const conflicts=[];const byKey={};
    const policy=policyFactsFor(h,trip),controlled=new Set(policy.controlledKeys);
    for(const e of h.evidence||[]){if(!e.confirmed||isPolicyEvidence(e))continue;for(const [k,v]of Object.entries(e.claims||{})){if(v===null||v===''||controlled.has(k))continue;(byKey[k]??=[]).push(v);}}
    for(const [k,vs]of Object.entries(byKey)){const values=[...new Set(vs)];if(f[k]!==null&&f[k]!==undefined&&!values.includes(f[k]))values.push(f[k]);if(values.length>1){f[k]=null;conflicts.push(k);}else f[k]=values[0];}
    Object.assign(f,policy.facts);conflicts.push(...policy.conflicts);
    return{facts:f,conflicts,policy};
  }
  function evaluate(h,people,year=dateYear(),trip){
    const {facts:f,conflicts}=factsFor(h,trip),blocks=[],pending=[];
    const check=(value,predicate,label)=>{if(value===null||value===undefined)pending.push(label+'待确认');else if(!predicate(value))blocks.push(label+'不满足');};
    const scores=people.map(p=>{
      const extra=root.HotelCriteria?.constraints(f,p,year);if(extra){blocks.push(...extra.blocked);pending.push(...extra.unknown.map(x=>x+'待确认'));}
      if(p.budgetHard)check(h.price,v=>v<=p.budget,p.name+(h.priceBasis==='room_page_reference'?'的预算最终核对（已有参考价，含税应付价未核）':'的预算'));
      if(p.requireSmart)check(f.smart,v=>v===true,p.name+'要求智能马桶');
      if(p.requireLaundry)check(f.laundry,v=>v===true,p.name+'要求免费自助洗衣');
      if(p.avoidMold&&f.mold===true)blocks.push(p.name+'排除有潮味/霉味反馈的酒店');
      if(p.avoidMold&&f.mold==null)pending.push('潮味/霉味反馈待查证');
      if(p.transitHard)check(h.metro,v=>v<=p.maxMetro,p.name+'的地铁步行上限');
      const effectiveYear=f.renovated||f.opened;
      const amenities=[...(p.requireSmart||p.smartPreference==='prefer'?['smart']:[]),...(p.requireLaundry||p.laundryPreference==='prefer'?['laundry']:[]),...(root.HotelCriteria?.conditions(p).map(c=>c.id)||[])];
      const facilityScore=amenities.length?amenities.reduce((n,k)=>n+(f[k]===true?100:f[k]===false?0:25),0)/amenities.length:25;
      const vals={price:h.price==null?25:Math.max(0,Math.min(100,100-(h.price/p.budget)*45)),transit:h.metro==null?25:Math.max(0,100-h.metro*5),newness:root.HotelCriteria?(root.HotelCriteria.freshness(f,p.newnessPolicy,year).score??25):effectiveYear==null?25:Math.max(0,100-(year-effectiveYear)*14),facilities:facilityScore};
      const total=Object.values(p.weights).reduce((a,b)=>a+Number(b),0);
      return {id:p.id,name:p.name,score:total?Math.round(Object.entries(p.weights).reduce((s,[k,w])=>s+vals[k]*Number(w),0)/total):50};
    });
    const unique=a=>[...new Set(a)];
    return{hotel:h,facts:f,conflicts,blocks:unique(blocks),pending:unique(pending),scores,min:Math.min(...scores.map(s=>s.score)),avg:scores.reduce((a,b)=>a+b.score,0)/scores.length};
  }
  function rank(hotels,people,year=dateYear(),trip){const rows=hotels.map(h=>evaluate(h,people,year,trip));const eligible=rows.filter(r=>!r.blocks.length&&!r.pending.length).sort((a,b)=>b.min-a.min||b.avg-a.avg||((a.hotel.price??Infinity)-(b.hotel.price??Infinity)));return{rows,top:eligible.slice(0,2),eligible};}
  const api={factsFor,evaluate,rank,isPolicyEvidence,cleanPolicyScope,cleanPolicySource,policyPaymentBasis,policyFactsFor};if(typeof module!=='undefined')module.exports=api;root.HotelEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
