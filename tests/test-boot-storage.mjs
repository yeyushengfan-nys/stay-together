import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// In-memory synthetic localStorage only: no browser data, backup or network.
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const prefix=source.slice(0,source.indexOf('function toast('));
const key='stay-together-v1',tripSlot=key+'-isolated-trip',demoSlot=key+'-isolated-demo',modeKey=key+'-mode-v2';
const synthetic=(count=0)=>({version:1,mode:'trip',trip:{city:'合成城市甲',checkin:'2027-04-01',checkout:'2027-04-03'},people:[{id:'p',name:'合成同行人',budget:465,weights:{price:3,transit:3,newness:3,facilities:3},conditions:[{id:'smartWash',mode:'must'}]}],hotels:Array.from({length:count},(_,i)=>({id:'h'+i,name:'合成酒店'+i,city:i%2?'合成城市乙':'合成城市甲',price:null,metro:null,facts:{smartWash:false},evidence:[]}))});
function boot(initial={},readError=false){
 const records=new Map(Object.entries(initial)),writes=[],status={textContent:''};
 const ctx={console,structuredClone,crypto,Map,Set,Date,Number,JSON,location:{hash:'#compare'},document:{querySelector:()=>status},toast:()=>{},localStorage:{getItem:k=>{if(readError)throw Error('Synthetic storage denied');return records.has(k)?records.get(k):null;},setItem:(k,v)=>{writes.push({key:k,value:v});records.set(k,v);}}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../public/journey.js',import.meta.url),'utf8'),ctx);vm.runInContext(prefix,ctx);
 return {ctx,records,writes,status,run:code=>vm.runInContext(code,ctx)};
}
for(const count of [31,80,200]){
 const original=synthetic(count),b=boot({[tripSlot]:JSON.stringify(original),[modeKey]:'trip'});
 assert.equal(b.run('state.hotels.length'),count);assert.equal(b.run('state.people[0].budget'),465);assert.equal(b.run('state.people[0].conditions[0].id'),'smartWash');assert.equal(b.run('storageRecoveryErrors.size'),0);assert.equal(b.run('save()'),true);assert.deepEqual(JSON.parse(b.records.get(tripSlot)),original);
}
const omitted=synthetic(2);delete omitted.hotels[0].price;delete omitted.hotels[1].metro;
let b=boot({[tripSlot]:JSON.stringify(omitted)});assert.equal(b.run('state.hotels.length'),2);assert.equal(b.run('save()'),true);
const invalids=['  {invalid json\n','null','{}',JSON.stringify(synthetic(201)),JSON.stringify({...synthetic(),people:[]}),JSON.stringify({...synthetic(),hotels:[null]})];
for(const raw of invalids){
 b=boot({[tripSlot]:raw,[modeKey]:'trip'});assert.equal(b.records.get(tripSlot),raw);assert.equal(b.writes.length,0);assert.equal(b.run('save()'),false);assert.equal(b.records.get(tripSlot),raw);assert.equal(b.writes.length,0,'Normal boot save cannot overwrite invalid original bytes');assert(b.status.textContent.includes('已暂停保存'));assert(b.run('storageRecoveryHTML()').includes('原储存内容未改动'));assert(b.run('storageRecoveryHTML()').includes('不是原有行程'));
}
for(const badSlot of [key,demoSlot]){
 const raw='synthetic unreadable original';b=boot({[tripSlot]:JSON.stringify(synthetic(35)),[badSlot]:raw,[modeKey]:'trip'});assert.equal(b.run('state.hotels.length'),35);assert.equal(b.run('save()'),false);assert.equal(b.records.get(badSlot),raw);assert.equal(b.writes.length,0);
}
b=boot({},true);assert.equal(b.run('save()'),false);assert.equal(b.writes.length,0);assert(b.run('storageRecoveryErrors.size')>0);
const raw=JSON.stringify(synthetic(1));
for(const invalid of [synthetic(201),{...synthetic(),hotels:[null]}]){
 b=boot({[tripSlot]:raw,[demoSlot]:JSON.stringify({...synthetic(),mode:'demo'})});b.ctx.invalid=invalid;b.run('state=invalid');assert.equal(b.run('save()'),false);assert.equal(b.records.get(tripSlot),raw);
}
b=boot();assert.equal(b.run('storageRecoveryErrors.size'),0);assert(b.records.has(tripSlot));assert(b.records.has(demoSlot));assert.equal(b.run('save()'),true);
const restored=boot({[tripSlot]:JSON.stringify(synthetic(40))});assert.equal(restored.run('save()'),true);assert.equal(restored.run('state.hotels.length'),40);
console.log('PASS boot storage integrity: 31/80/200 cross-city histories and absent optional values survive; invalid/oversized/denied slots preserve original bytes and block boot/save overwrites; recovery warning and valid fresh/restored initialization (synthetic memory only).');
