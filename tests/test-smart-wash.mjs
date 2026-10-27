import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Synthetic fixtures only. Heating/generic smart is deliberately distinct from
// a manually confirmed washing function; no API, user records or hotel lookup.
const read=name=>fs.readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const app=read('app.js'),listeners={},main={innerHTML:''},calls={save:0};
let dialogHTML='',hotelFieldsHTML='',nextId=0;
const people=[
 {id:'me',name:'合成成员甲',budget:500,budgetHard:false,requireSmart:true,requireLaundry:false,avoidMold:false,transitHard:false,maxMetro:15,weights:{price:3,transit:3,newness:3,facilities:3},conditions:[{id:'smartWash',mode:'must'}]},
 {id:'friend',name:'合成成员乙',budget:450,budgetHard:false,requireSmart:true,requireLaundry:false,avoidMold:false,transitHard:false,maxMetro:15,weights:{price:3,transit:3,newness:3,facilities:3},conditions:[{id:'quiet',mode:'prefer'},{id:'breakfast',mode:'must'}]}
];
const oldEvidence=Array.from({length:18},(_,i)=>({id:'synthetic-old-'+i,text:'合成旧材料'+i,confirmed:true,claims:{},platform:'酒店资料',room:'合成房型',source:'https://example.test/source/'+i}));
const hotel={id:'h',name:'合成酒店',room:'合成房型',price:300,referencePrice:290,facts:{smart:true,breakfast:true,opened:2025},quoteBundle:{synthetic:'unchanged'},evidence:structuredClone(oldEvidence)};
const state={mode:'trip',trip:{city:'合成城市',checkin:'2027-04-01',checkout:'2027-04-03'},people:structuredClone(people),hotels:[hotel]};
class FormDataMock{constructor(form){this.values=form.values;}get(k){return Object.hasOwn(this.values,k)?this.values[k]:null;}has(k){return Object.hasOwn(this.values,k)&&this.values[k]!==false;}}
const hotelForm={querySelector:()=>({insertAdjacentHTML:(_p,html)=>{hotelFieldsHTML=html;}})};
const ctx={console,URL,structuredClone,Date,Number,Object,JSON,state,FormData:FormDataMock,window:null,
 currentHotels:()=>state.hotels,hotelDialog:()=>{},renderCompare:()=>{},render:()=>{},
 showDialog:(_title,html)=>{dialogHTML=html;},toast:()=>{},save:()=>{calls.save++;return true;},closeDialog:()=>{},go:()=>{},
 uid:()=> 'synthetic-new-'+(++nextId),head:()=>'',banner:()=>'',link:()=>'',
 $:selector=>selector==='#hotel-form'?hotelForm:main,
 document:{addEventListener:(name,fn)=>{listeners[name]=fn;}},
 ocrBusy:false,pendingImage:null,filterHotel:'',filterPlatform:''};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(read('criteria.js'),ctx);vm.runInContext(read('engine.js'),ctx);vm.runInContext(read('claims.js'),ctx);
vm.runInContext(app.match(/^const E=.*$/m)[0],ctx);
vm.runInContext(app.match(/^const labels=.*$/m)[0],ctx);
vm.runInContext(app.match(/^function triOptions.*$/m)[0],ctx);
vm.runInContext(app.slice(app.indexOf('function evidenceDialog'),app.indexOf('async function recognize')),ctx);
vm.runInContext(app.slice(app.indexOf("document.addEventListener('change',async"),app.indexOf("document.addEventListener('click',async")),ctx);
vm.runInContext(app.slice(app.indexOf("document.addEventListener('submit',async"),app.indexOf("document.querySelector('.trip-wrap')")),ctx);
const submitEvidence=listeners.submit,changeEvidence=listeners.change;
const C=ctx.HotelCriteria,Engine=ctx.HotelEngine;
assert.equal(C.catalog.find(c=>c.id==='smartWash').label,'马桶清洗功能（臀洗／妇洗）');
assert.equal(C.catalog.length,17);assert.equal(C.catalog.at(-1).id,'smartWash');
assert.equal(new Set(C.catalog.map(c=>c.id)).size,C.catalog.length);

let result=Engine.evaluate(hotel,state.people,2027);
assert(result.pending.some(s=>s.includes('合成成员甲要求马桶清洗功能')));
assert(!result.pending.some(s=>s.includes('合成成员乙')));assert.equal(result.facts.smart,true);
assert.equal(Engine.rank([hotel],state.people,2027).top.length,0);
for(const text of ['有智能马桶。','有智能马桶，仅座圈加热。','具备臀洗和妇洗功能。']){
 assert(!Object.hasOwn(ctx.HotelClaims.suggest(text).claims,'smartWash'),'free text does not infer washing');
}
const confirmedWash=value=>({...hotel,evidence:[...hotel.evidence,{id:'synthetic-wash',confirmed:true,claims:{smartWash:value},platform:'酒店资料',room:hotel.room,source:'https://example.test/official',text:'合成人工核对结果'}]});
result=Engine.evaluate(confirmedWash(false),state.people,2027);
assert.equal(result.facts.smart,true);assert.equal(result.facts.smartWash,false);
assert(result.blocks.some(s=>s.includes('合成成员甲要求马桶清洗功能')));
assert(!result.blocks.some(s=>s.includes('智能马桶不满足')));
assert.equal(Engine.rank([confirmedWash(false)],state.people,2027).top.length,0);
assert.equal(Engine.rank([confirmedWash(true)],state.people,2027).top.length,1);
assert.equal(Engine.factsFor({...hotel,evidence:[{confirmed:false,claims:{smartWash:true}}]}).facts.smartWash,undefined);

ctx.evidenceDialog('h');
assert(dialogHTML.includes('name="smartWash"'));assert(dialogHTML.includes('仅座圈加热不能证明有清洗功能'));
assert(/name="smartWash"><option value="" selected>/.test(dialogHTML),'new evidence starts unknown');
const preserved=JSON.stringify({people:state.people,trip:state.trip,price:hotel.price,referencePrice:hotel.referencePrice,facts:hotel.facts,quoteBundle:hotel.quoteBundle,evidence:hotel.evidence});
const values={hotel:'h',platform:'酒店资料',text:'合成客服原文：仅座圈加热，没有臀洗／妇洗。',date:'2026-10-27',room:hotel.room,source:'https://example.test/official',smart:'',smartWash:'false',laundry:'',mold:'',opened:'',confirmed:true};
await submitEvidence({target:{id:'evidence-form',values},preventDefault(){}});
assert.equal(hotel.evidence.length,19);assert.equal(calls.save,1);
const added=hotel.evidence.at(-1);
assert.equal(JSON.stringify(added.claims),'{"smartWash":false}');
assert.equal(added.confirmed,true);assert.equal(added.platform,'酒店资料');
for(const key of ['text','date','room','source'])assert.equal(added[key],values[key]);
assert.equal(added.demo,false);assert.equal(Engine.factsFor(hotel).facts.smart,true);
assert.equal(Engine.factsFor(hotel).facts.smartWash,false);
assert.equal(JSON.stringify({people:state.people,trip:state.trip,price:hotel.price,referencePrice:hotel.referencePrice,facts:hotel.facts,quoteBundle:hotel.quoteBundle,evidence:hotel.evidence.slice(0,18)}),preserved,'append-only evidence preserves all prior records, preferences and prices');
// Blank/missing new control cannot silently become a negative claim.
for(const smartWash of ['',undefined]){
 const v={...values};if(smartWash===undefined)delete v.smartWash;else v.smartWash=smartWash;
 await submitEvidence({target:{id:'evidence-form',values:v},preventDefault(){}});
 assert(!Object.hasOwn(hotel.evidence.at(-1).claims,'smartWash'));
}
const evidenceForm={elements:{smartWash:{value:'false'},confirmed:{checked:true}}};
await changeEvidence({target:{name:'hotel',closest:s=>s==='#evidence-form'?evidenceForm:null}});
assert.equal(evidenceForm.elements.smartWash.value,'');assert.equal(evidenceForm.elements.confirmed.checked,false);
evidenceForm.elements.smartWash.value='true';evidenceForm.elements.confirmed.checked=true;
await changeEvidence({target:{id:'evidence-file',files:[],closest:s=>s==='#evidence-form'?evidenceForm:null}});
assert.equal(evidenceForm.elements.smartWash.value,'');assert.equal(evidenceForm.elements.confirmed.checked,false);

// Existing catalog-driven preference and hotel editors expose the new field
// without rewriting existing choices or auto-enabling a must requirement.
vm.runInContext(read('preferences.js'),ctx);ctx.renderPreferences();
assert(main.innerHTML.includes('name="0-condition-smartWash"'));
assert(/name="0-condition-smartWash">[\s\S]*?<option value="must" selected>/.test(main.innerHTML));
const friendSelect=main.innerHTML.match(/name="1-condition-smartWash">([\s\S]*?)<\/select>/)[1];
assert(!friendSelect.includes('selected'));
ctx.hotelDialog('h');assert(hotelFieldsHTML.includes('name="criterion-smartWash"'));
assert(/name="criterion-smartWash"><option value="" selected>/.test(hotelFieldsHTML));
const prefValues={};
for(const [i,p]of state.people.entries()){
 Object.assign(prefValues,{[i+'-name']:p.name,[i+'-budget']:p.budget,[i+'-smart']:'must',[i+'-laundry']:'ignore',[i+'-maxMetro']:p.maxMetro,[i+'-newWithin']:3,[i+'-oldAfter']:8,[i+'-notes']:''});
 for(const [k,v]of Object.entries(p.weights))prefValues[i+'-weight-'+k]=v;
 for(const c of C.catalog)prefValues[i+'-condition-'+c.id]=p.conditions.find(x=>x.id===c.id)?.mode||'ignore';
}
const collected=ctx.collectGroupPreferences({values:prefValues});
assert.equal(JSON.stringify(collected.map(p=>p.conditions)),JSON.stringify(state.people.map(p=>p.conditions)));
assert.equal(collected[1].requireSmart,true);assert(!collected[1].conditions.some(c=>c.id==='smartWash'));
const factControls={renovationScope:{value:''},...Object.fromEntries(C.catalog.map(c=>['criterion-'+c.id,{value:c.id==='smartWash'?'false':''}]))};
assert.equal(ctx.HotelPreferences.readHotelFacts({elements:factControls}).smartWash,false);
console.log('PASS smartWash: independent/manual criterion, generic smart unchanged; unknown/false must guards, two-person choices, catalog editors and append-only evidence serialization (18 synthetic old records).');
