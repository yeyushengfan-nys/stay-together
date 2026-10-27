// Pure, transparent recommendation rules. No generated claims or hidden model scores.
(function(root){
  const dateYear=()=>new Date().getFullYear();
  function factsFor(h){
    const f={...h.facts,...(h.quoteBundle&&root.StayQuoteEvidence?root.StayQuoteEvidence.facts(h.quoteBundle,h.room):{})};const conflicts=[];const byKey={};
    for(const e of h.evidence||[]){if(!e.confirmed)continue;for(const [k,v]of Object.entries(e.claims||{})){if(v===null||v==='')continue;(byKey[k]??=[]).push(v);}}
    for(const [k,vs]of Object.entries(byKey)){const values=[...new Set(vs)];if(f[k]!==null&&f[k]!==undefined&&!values.includes(f[k]))values.push(f[k]);if(values.length>1){f[k]=null;conflicts.push(k);}else f[k]=values[0];}
    return{facts:f,conflicts};
  }
  function evaluate(h,people,year=dateYear()){
    const {facts:f,conflicts}=factsFor(h),blocks=[],pending=[];
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
  function rank(hotels,people,year=dateYear()){const rows=hotels.map(h=>evaluate(h,people,year));const eligible=rows.filter(r=>!r.blocks.length&&!r.pending.length).sort((a,b)=>b.min-a.min||b.avg-a.avg||((a.hotel.price??Infinity)-(b.hotel.price??Infinity)));return{rows,top:eligible.slice(0,2),eligible};}
  const api={factsFor,evaluate,rank};if(typeof module!=='undefined')module.exports=api;root.HotelEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
