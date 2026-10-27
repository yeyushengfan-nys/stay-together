// Shared by the browser and server. Thresholds are user choices, not industry ratings.
(function(root){
 const catalog=[['quiet','安静／隔音'],['nonSmoking','无烟客房'],['twinBeds','双床房'],['breakfast','包含早餐'],['freeCancel','免费取消'],['parking','停车位'],['family','适合儿童／亲子设施'],['petFriendly','允许携带宠物'],['accessible','无障碍客房'],['bathtub','浴缸'],['gym','健身房'],['pool','泳池'],['invoice','可开所需发票'],['desk','办公桌／办公条件'],['view','景观符合期望'],['lateCheckin','支持晚到入住']].map(([id,label])=>({id,label}));
 const allowed=new Set(catalog.map(x=>x.id));
 function conditions(p){return (p.conditions||[]).filter(c=>allowed.has(c.id)&&['prefer','must'].includes(c.mode)).map(c=>({id:c.id,mode:c.mode,label:catalog.find(x=>x.id===c.id).label}));}
 function policy(p={}){return {newWithin:Number.isInteger(p.newWithin)&&p.newWithin>=0&&p.newWithin<=10?p.newWithin:3,oldAfter:Number.isInteger(p.oldAfter)&&p.oldAfter>=4&&p.oldAfter<=30?p.oldAfter:8,allowRenovation:!!p.allowRenovation};}
 function freshness(f={},p={},year=new Date().getFullYear()){
  p=policy(p);const opened=Number.isInteger(f.opened)&&f.opened<=year?f.opened:null;
  const renovated=p.allowRenovation&&f.renovationScope==='guestrooms'&&Number.isInteger(f.renovated)&&f.renovated<=year?f.renovated:null;
  const effective=Math.max(opened||0,renovated||0)||null;
  if(!effective)return {label:'年份不足，暂不判断新旧',score:null,age:null,basis:'待查开业年／适用客房翻新年'};
  const age=year-effective;return {age,basis:renovated&&renovated>=opened?'已确认客房翻新':'开业年份',label:age<=p.newWithin?'符合你的较新标准':age>=p.oldAfter?'年数较久，需看维护情况':'介于两者之间',score:age<=p.newWithin?100:age>=p.oldAfter?20:Math.round(100-80*(age-p.newWithin)/(p.oldAfter-p.newWithin))};
 }
 function constraints(f,p,year){const blocked=[],unknown=[];for(const c of conditions(p).filter(c=>c.mode==='must')){if(f[c.id]==null)unknown.push(p.name+'要求'+c.label);else if(f[c.id]!==true)blocked.push(p.name+'要求'+c.label);}if(p.newnessHard){const n=freshness(f,p.newnessPolicy,year);if(n.age==null)unknown.push(p.name+'的新旧标准');else if(n.age>policy(p.newnessPolicy).newWithin)blocked.push(p.name+'的新旧标准');}return{blocked,unknown};}
 const api={catalog,conditions,policy,freshness,constraints};if(typeof module!=='undefined')module.exports=api;root.HotelCriteria=api;
})(typeof globalThis!=='undefined'?globalThis:this);
