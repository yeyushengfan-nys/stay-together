import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Synthetic forms/captured packages only: no browser accounts, CS messages,
// real API calls, orders, payment or persistent user records.
const trip={city:'模拟城市',checkin:'2027-03-01',checkout:'2027-03-04',rooms:1,adults:2,children:0};
const room='合成双床房',name='合成酒店<script>';
function offer(id,provider='ctrip',targetRoom=room){return {id,provider,hotel:name,room:targetRoom,bed:'2张单人床',checkIn:trip.checkin,checkOut:trip.checkout,rooms:1,adults:2,children:0,currency:'CNY',stage:'room_list',listNightly:provider==='ctrip'?350:370,breakfast:2,breakfastText:'2份早餐',payment:'在线付',cancellation:'入住当天18:00前可免费取消',capturedAt:'2026-10-27T00:00:00Z',source:provider==='ctrip'?'https://hotels.ctrip.com/hotels/123.html':'https://www.ly.com/hotel/hoteldetail?hotelId=456',evidence:targetRoom+' 2份早餐 在线付 入住当天18:00前可免费取消 合成参考价350元'};}
const hotel={id:'h',name,room,city:trip.city,demo:false,price:null,referencePrice:350,facts:{invoice:null,lateCheckin:null,smart:true},quoteBundle:{query:{...trip},selected_offer_id:'ct',offers:[offer('ct'),offer('tc','tongcheng'),offer('other-room','ctrip','其他房型')]},evidence:[]};
const state={mode:'trip',trip:structuredClone(trip),people:[{id:'p',name:'合成成员',budget:500,budgetHard:true,weights:{},conditions:[{id:'invoice',mode:'must'},{id:'lateCheckin',mode:'must'}]}],hotels:[hotel]};
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const calls={save:0,close:0,go:[],toast:[]},main={innerHTML:''};let dialogHTML='',ids=0;
class FormDataMock{constructor(form){this.values=form.values;}get(key){return this.values[key]??null;}has(key){return Object.hasOwn(this.values,key)&&this.values[key]!==false;}}
const ctx={console,URL,Date,Map,Set,Number,Object,JSON,structuredClone,Error,state,E,FormData:FormDataMock,filterHotel:'',filterPlatform:'',labels:{},today:()=> '2026-10-27',uid:()=> 'synthetic-policy-'+(++ids),currentHotels:()=>state.hotels,$:()=>main,head:(_a,_b,_c,buttons)=>buttons,banner:()=>'',save:()=>{calls.save++;return true;},closeDialog:()=>calls.close++,go:v=>calls.go.push(v),toast:t=>calls.toast.push(t),showDialog:(_title,html)=>{dialogHTML=html;}};
ctx.window=ctx;vm.createContext(ctx);
for(const file of ['quote-evidence.js','criteria.js','engine.js'])vm.runInContext(fs.readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),ctx);
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
vm.runInContext(source.slice(source.indexOf('function safeURL'),source.indexOf('const dbPromise=')),ctx);
vm.runInContext(source.slice(source.indexOf('function policyOfferChoices'),source.indexOf('function evidenceDialog')),ctx);
vm.runInContext(source.slice(source.indexOf('function renderEvidence'),source.indexOf('function renderGuide')),ctx);
const base=JSON.stringify({trip:state.trip,people:state.people,facts:hotel.facts,price:hotel.price,referencePrice:hotel.referencePrice,quoteBundle:hotel.quoteBundle});
const fields={invoice:'true',invoiceDetail:'电子普通发票；按平台流程由酒店开具',lateCheckin:'true',lateDetail:'23:00—24:00抵店，满足前提后整晚保留',precondition:'paid_confirmed',date:'2026-10-27',source:'https://hotels.ctrip.com/hotels/123.html?hotelId=1&token=TEST_PRIVATE#session',text:'合成官方答复：在线支付且酒店确认后整晚保留，可申请电子普通发票。客服新报价总计1060.46元。<img src=x onerror=alert(1)>',confirmed:true};
assert.deepEqual(Array.from(ctx.policyOfferChoices(hotel),o=>o.id),['ct','tc']);
ctx.policyDialog('h');assert(dialogHTML.includes('官方政策'));assert(dialogHTML.includes('readonly'));assert(dialogHTML.includes('2成人'));assert(dialogHTML.includes('2份'));assert(dialogHTML.includes('在线付'));assert(dialogHTML.includes('paid_confirmed'));assert(!dialogHTML.includes('other-room'));assert(!dialogHTML.includes('<script>'));assert(dialogHTML.includes('&lt;script&gt;'));
assert(dialogHTML.includes('切换选择会清空未保存内容'));assert(dialogHTML.includes('不会更换当前分析套餐'));
const e=ctx.makePolicyEvidence(hotel,'ct',{...fields,smart:'false'});
assert.equal(e.kind,'platform_policy');assert.equal(e.confirmed,true);assert.deepEqual(Object.keys(e.claims).sort(),['invoice','lateCheckin']);assert.equal(e.claims.invoice,true);assert.equal(e.claims.lateCheckin,true);
assert.equal(e.policyScope.offerId,'ct');assert.equal(e.policyScope.provider,'ctrip');assert.equal(e.policyScope.room,room);assert.equal(e.policyScope.breakfastCount,2);assert.equal(e.policyScope.paymentBasis,'online');assert.equal(e.policyScope.requiresPaidConfirmed,true);
assert.equal(e.room,room);assert.equal(e.platform,'携程');assert.equal(e.source,'https://hotels.ctrip.com/hotels/123.html?hotelId=1');assert(e.text.startsWith('【平台官方政策确认，非住客评价】'));assert(e.text.includes('1060.46'));assert(e.text.includes('仅在线支付且酒店／供应商确认后成立'));assert(e.text.includes('本记录不代表已订房、已付款或已确认'));
assert.equal(hotel.evidence.length,0);assert.equal(calls.save,0);assert.equal(JSON.stringify({trip:state.trip,people:state.people,facts:hotel.facts,price:hotel.price,referencePrice:hotel.referencePrice,quoteBundle:hotel.quoteBundle}),base);
const lateOnly=ctx.makePolicyEvidence(hotel,'ct',{...fields,invoice:''});assert.deepEqual(Object.keys(lateOnly.claims),['lateCheckin']);
const deniedInvoice=ctx.makePolicyEvidence(hotel,'ct',{...fields,invoice:'false',lateCheckin:''});assert.equal(deniedInvoice.claims.invoice,false);assert(!Object.hasOwn(deniedInvoice.claims,'lateCheckin'));
for(const patch of [
 {confirmed:false},{text:''},{date:''},{date:'2027-02-31'},{precondition:''},{invoice:'',lateCheckin:''},{invoiceDetail:''},{lateDetail:''},
 {source:'http://hotels.ctrip.com/hotels/123.html'},{source:'https://www.ly.com/hotel/123'},{source:'https://ctrip.com.evil.example/policy'},{source:'javascript:alert(1)'},{source:'https://user:pass@hotels.ctrip.com/policy'}
])assert.throws(()=>ctx.makePolicyEvidence(hotel,'ct',{...fields,...patch}));
assert.throws(()=>ctx.makePolicyEvidence(hotel,'other-room',fields),/目标房型/);
assert.throws(()=>ctx.makePolicyEvidence(hotel,'missing',fields),/套餐/);
const unknownPayment=structuredClone(hotel);unknownPayment.quoteBundle.offers[0].payment='未注明';state.hotels=[unknownPayment];ctx.policyDialog('h');assert(dialogHTML.includes('不能猜测'));assert(/type="submit" disabled/.test(dialogHTML));assert.throws(()=>ctx.makePolicyEvidence(unknownPayment,'ct',fields),/付款方式/);
const unknownMeals=structuredClone(hotel);unknownMeals.quoteBundle.offers[0].breakfastText='含早餐';unknownMeals.quoteBundle.offers[0].evidence='含早餐 在线付';state.hotels=[unknownMeals];ctx.policyDialog('h');assert(dialogHTML.includes('早餐份数未核清'));assert(/type="submit" disabled/.test(dialogHTML));assert.throws(()=>ctx.makePolicyEvidence(unknownMeals,'ct',fields),/早餐份数/);
const atProperty=structuredClone(hotel);atProperty.quoteBundle.offers[0].payment='到店付';atProperty.quoteBundle.offers[0].evidence=atProperty.quoteBundle.offers[0].evidence.replace('在线付','到店付');assert.throws(()=>ctx.makePolicyEvidence(atProperty,'ct',fields),/到店付/);const propertyPolicy=ctx.makePolicyEvidence(atProperty,'ct',{...fields,precondition:'none'});assert.equal(propertyPolicy.policyScope.paymentBasis,'at_property');assert.equal(propertyPolicy.policyScope.requiresPaidConfirmed,false);
state.hotels=[hotel];state.trip.checkin='2027-03-02';assert.throws(()=>ctx.makePolicyEvidence(hotel,'ct',fields),/当前行程/);state.trip.checkin=trip.checkin;
const oldRoom=hotel.room;hotel.room='另一目标房型';assert.throws(()=>ctx.makePolicyEvidence(hotel,'ct',fields),/目标房型/);hotel.room=oldRoom;
// Save through the actual form helper: append one policy only, no global fields,
// preference edits, quotation replacement, new order or inferred new total.
const values={hotel:'h',offer:'ct',...fields};assert.equal(ctx.savePolicyForm({values}),true);assert.equal(hotel.evidence.length,1);assert.equal(calls.save,1);assert.equal(calls.close,1);assert.equal(calls.go.at(-1),'evidence');assert.equal(JSON.stringify({trip:state.trip,people:state.people,facts:hotel.facts,price:hotel.price,referencePrice:hotel.referencePrice,quoteBundle:hotel.quoteBundle}),base);
const applied=ctx.HotelEngine.policyFactsFor(hotel,state.trip);assert.equal(applied.facts.invoice,true);assert.equal(applied.facts.lateCheckin,true);
ctx.renderEvidence();assert(main.innerHTML.includes('官方政策确认 · 非住客评价'));assert(main.innerHTML.includes('当前选中套餐适用'));assert(main.innerHTML.includes('仅在线支付且酒店／供应商确认后成立'));assert(main.innerHTML.includes('不要求现在付款'));assert(main.innerHTML.includes('&lt;img'));assert(!main.innerHTML.includes('<img src=x'));assert(!main.innerHTML.includes('用户导入 · 已确认'));assert(main.innerHTML.includes('data-action="add-policy"'));
const otherPolicy=ctx.makePolicyEvidence(hotel,'tc',{...fields,source:'https://www.ly.com/newhelp/policy'}),onlyOther={...hotel,evidence:[otherPolicy]};const inactive=ctx.HotelEngine.policyFactsFor(onlyOther,state.trip);assert.equal(inactive.facts.invoice,null);assert(inactive.inactive[0].reason.includes('另一预订平台'));assert(ctx.policyEvidenceHTML(onlyOther,otherPolicy).includes('当前未应用：仅适用于另一预订平台'));assert.equal(hotel.quoteBundle.selected_offer_id,'ct');
const conflicted={...hotel,evidence:[hotel.evidence[0],deniedInvoice]};assert(ctx.policyEvidenceHTML(conflicted,deniedInvoice).includes('政策记录有冲突'));
const incomplete={...e,policyScope:null};assert(ctx.policyEvidenceHTML({...hotel,evidence:[incomplete]},incomplete).includes('适用前提未核清'));
const savedCount=hotel.evidence.length;assert.equal(ctx.savePolicyForm({values:{...values,confirmed:false}}),false);assert.equal(hotel.evidence.length,savedCount);assert.equal(calls.save,1);
state.mode='demo';assert.throws(()=>ctx.makePolicyEvidence(hotel,'ct',fields),/我的行程/);state.mode='trip';
assert(source.includes("if(a==='add-policy')policyDialog(id)"));assert(source.includes("if(e.target.id==='policy-form'){e.preventDefault();savePolicyForm(e.target);return;}"));
console.log('PASS scoped policy UI: explicit current-package fields, tri-state invoice/late policies, payment-confirmation precondition, source sanitization, blocked unknown/stale/other-room inputs, inactive other-platform records, escaped non-review rendering, and append-only save preserving prices/quotes/preferences. Synthetic offline fixtures only.');
