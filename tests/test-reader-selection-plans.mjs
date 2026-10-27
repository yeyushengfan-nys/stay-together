import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readHotelPage,expandCtripRoomPlans,expandTongchengRoomPlans} from '../collector-extension/reader.js';

const q={city:'成都',checkin:'2026-12-30',checkout:'2027-01-02',rooms:1,adults:2,children:0,workflow:'selection',priceMode:'reference',budget:465,required:['breakfast','freeCancel'],maxHotels:3};
const visible=text=>({innerText:text,getClientRects:()=>[{}],querySelector:()=>null,querySelectorAll:()=>[]});
function read(rows,{query=q,task={},expandable=[]}={}){
 const rowEls=rows.map((row,i)=>{const text=[row.meal,row.cancel||'入住当天18:00前可免费取消','在线付','¥'+(row.price??350)].join('\n');return {...visible(text),querySelector:s=>s.includes('Current price')?visible('¥'+(row.price??350)):null,querySelectorAll:s=>s==='button,[role="button"]'?[visible('预订')]:[]};});
 const card={...visible('目标房型\n1张1.5米双人床'),querySelector:s=>s.includes('commonRoomCard-title')?visible('标准大床房'):s.includes('baseRoom-bedsInfo')?visible('1张1.5米双人床'):s.includes('baseRoom__')?visible('1张1.5米双人床'):null,querySelectorAll:s=>s.includes('saleRoomItemBox__')?rowEls:[]};
 const ctx={URL,location:new URL('https://hotels.ctrip.com/hotels/44366247.html?checkIn=2026-12-30&checkOut=2027-01-02'),getComputedStyle:()=>({visibility:'visible'}),document:{body:visible(('1间,2成人,0儿童 酒店材料 ').repeat(20)),querySelector:s=>s==='#checkInInput'?{value:'12月30日'}:s==='#checkOutInput'?{value:'1月2日'}:s.includes('hotelOverview_name')?visible('测试酒店'):null,querySelectorAll:s=>s==='#hotelRoomList [class*="commonRoomCard__"]'?[card]:s==='#hotelRoomList [role="button"][class*="foldButton-fold__"]'?expandable:[]}};
 return vm.runInNewContext('('+readHotelPage.toString()+')',ctx)(query,{provider:'ctrip',phase:'rooms',name:'测试酒店',...task});
}
for(const meal of ['2份早餐','双早','含2早','2人早餐','早餐2份','2人份早餐','双人早餐']){
 const r=read([{meal}]);assert.equal(r.previewCandidate?.breakfast,2,meal);assert.equal(r.planSummary.eligibleOfferCount,1);assert.equal(r.planSummary.requiredBreakfastCount,2);assert(r.previewCandidate.evidence.includes(r.previewCandidate.breakfastText));
}
for(const meal of ['1份早餐','单早','含早','全程共6份早餐','3晚含6份早餐','3晚共6份早餐','全程早餐6份','1份早餐\n赠送咖啡2份','无早餐\n加购2份早餐'])assert.equal(read([{meal}]).previewCandidate,null,meal);
assert.equal(read([{meal:'2份早餐',price:466}]).previewCandidate,null,'Hard budget is a ceiling for selection.');
assert.equal(read([{meal:'2份早餐',price:465}]).previewCandidate.listNightly,465);
const later=read([...Array.from({length:12},()=>({meal:'无早餐',price:200})),{meal:'2份早餐',price:353}]);
assert.equal(later.offers.length,12);assert(later.offers.some(o=>o.rowKey==='0:12'));assert.equal(later.previewCandidate.rowKey,'0:12');assert.equal(later.planSummary.visibleOfferCount,13);
const reference={room:'标准大床房',breakfast:2,cancellation:'入住日18:00前可免费取消',payment:'在线付'};
assert(read([{meal:'2份早餐'}],{task:{matchOffer:reference}}).previewCandidate);
assert.equal(read([{meal:'2份早餐',cancel:'入住当天12:00前可免费取消'}],{task:{matchOffer:reference}}).previewCandidate,null,'Different known cutoff is not matched.');

let clicked=0;const extra={...visible('展示额外1个房型价格（¥353起）'),click:()=>clicked++};
assert.equal(read([{meal:'无早餐'}],{expandable:[extra]}).status,'expand_plans');
assert.equal(read([{meal:'无早餐'}],{expandable:[extra],task:{plansExpanded:true}}).status,'ready');
assert.equal(read([{meal:'2份早餐'}],{expandable:[extra]}).status,'ready');
const buttons=[...Array.from({length:6},()=>({...extra})),{...visible('预订'),click:()=>{throw Error('Must not book');}},{...visible('收起房型价格'),click:()=>{throw Error('Must not collapse');}}];
const expandCtx={location:new URL('https://hotels.ctrip.com/hotels/44366247.html'),getComputedStyle:()=>({visibility:'visible'}),document:{querySelector:()=>visible('测试酒店'),querySelectorAll:()=>buttons}};
let expanded=vm.runInNewContext('('+expandCtripRoomPlans.toString()+')',expandCtx)('测试酒店');assert.equal(expanded.count,4);assert.equal(expanded.remaining,2);assert.equal(clicked,4);
expanded=vm.runInNewContext('('+expandCtripRoomPlans.toString()+')',expandCtx)('另一家酒店');assert.equal(expanded.clicked,false);assert.equal(clicked,4);
for(const url of ['https://hotels.ctrip.com/hotels/booknew','https://evil.test/hotels/44366247.html']){const ctx={location:new URL(url),document:{querySelector:()=>{throw Error('Must not access wrong page');}}};assert.equal(vm.runInNewContext('('+expandCtripRoomPlans.toString()+')',ctx)().clicked,false);}

let tcClicks=0;const tcExtra={...visible('查看其他4个报价'),click:()=>tcClicks++};
function readTC({expanded=false,meal='无餐食'}={}){
 const label=meal+'入住日18:00前可免费取消',plan={...visible(label+'\n¥370'),querySelector:s=>s==='h2'?visible(label):s==='.price .price-text p'?visible('¥370'):null,querySelectorAll:s=>s==='.btn-top'?[visible('预订')]:[]};
 const card={...visible('标准大床房'),id:'r1',querySelector:s=>s==='.roomInfoList-img h1'?visible('标准大床房'):s==='.roomInfoList-img .room-card-cn'?visible('大床 | 20㎡ | 2成人'):null,querySelectorAll:s=>s==='.content-flex'?[plan]:[]};
 const header='入住12月30日 退房1月2日 人数2成人0儿童',ctx={URL,location:new URL('https://www.ly.com/hotel/hoteldetail?hotelId=94281996&inDate=2026-12-30&outDate=2027-01-02'),getComputedStyle:()=>({visibility:'visible'}),document:{body:visible('测试酒店\n'+header+'\n'+('平台已显示酒店房型 ').repeat(20)),querySelector:s=>s==='#keyWordBox,.keyWordBox'?visible(header):null,querySelectorAll:s=>s==='.room-list-box .card[id]'?[card]:s==='.room-list-box .card[id] p.more-btn'?[tcExtra]:[]}};
 return vm.runInNewContext('('+readHotelPage.toString()+')',ctx)(q,{provider:'tongcheng',phase:'rooms',name:'测试酒店',plansExpanded:expanded});
}
assert.equal(readTC().status,'expand_plans');assert.equal(readTC({expanded:true}).status,'ready');assert.equal(readTC({meal:'2份早餐'}).previewCandidate.breakfast,2);
for(const meal of ['2份早餐','双人早餐','含2早','双早','早餐2份']){const result=readTC({meal});assert.equal(result.previewCandidate.cancellation,'入住日18:00前可免费取消');assert(result.previewCandidate.evidence.includes(meal+'入住日18:00前可免费取消'),'Original package text remains intact.');}
assert.equal(readTC({expanded:true,meal:'1份早餐'}).offers[0].cancellation,'入住日18:00前可免费取消');
const tcControls=[...Array.from({length:6},()=>({...tcExtra})),{...visible('收起报价'),click:()=>{throw Error('Must not collapse');}},{...visible('预订'),click:()=>{throw Error('Must not book');}}];
const tcCtx={location:new URL('https://www.ly.com/hotel/hoteldetail?hotelId=94281996'),getComputedStyle:()=>({visibility:'visible'}),document:{body:visible('测试酒店\n房型套餐'),querySelectorAll:s=>{assert.equal(s,'.room-list-box .card[id] p.more-btn');return tcControls;}}};
expanded=vm.runInNewContext('('+expandTongchengRoomPlans.toString()+')',tcCtx)('测试酒店');assert.equal(expanded.count,4);assert.equal(expanded.remaining,2);assert.equal(tcClicks,4);
assert.equal(vm.runInNewContext('('+expandTongchengRoomPlans.toString()+')',tcCtx)('其他酒店').clicked,false);assert.equal(tcClicks,4);
for(const url of ['https://www.ly.com/hotel/book','https://passport.ly.com/','https://evil.test/hotel/hoteldetail']){const ctx={location:new URL(url),document:{querySelectorAll:()=>{throw Error('Must not access wrong page');}}};assert.equal(vm.runInNewContext('('+expandTongchengRoomPlans.toString()+')',ctx)('测试酒店').clicked,false);}

function discover({task={},query=q}={}){
 const cards=Array.from({length:15},(_,i)=>{const text=i===0?'普通便宜酒店':i===1?'新开业，智能马桶':'普通酒店'+i;return {...visible(text),id:String(i+1),querySelector:s=>s==='.hotelName'?visible('酒店'+i):s.includes('Current price')?visible('¥'+(i===0?100:300)):null};});
 cards.push({...visible('广告\n广告酒店'),id:'99',querySelector:s=>s==='.hotelName'?visible('广告酒店'):visible('¥1')});
 const ctx={URL,location:new URL('https://hotels.ctrip.com/hotels/list/'),getComputedStyle:()=>({visibility:'visible'}),document:{body:visible(('1间,2成人,0儿童 酒店列表 ').repeat(20)),querySelector:s=>s==='#checkInInput'?{value:'12月30日'}:s==='#checkOutInput'?{value:'1月2日'}:null,querySelectorAll:s=>s==='.hotel-card[id]'?cards:[]}};
 return vm.runInNewContext('('+readHotelPage.toString()+')',ctx)(query,{provider:'ctrip',phase:'discover',...task});
}
const pool=discover({query:{...q,discoveryPreferences:{priceWeight:2,facilitiesWeight:5,newnessWeight:5,priorityHints:['smart','newness']}}});
assert.equal(pool.candidates.length,12);assert.equal(pool.candidates[0].name,'酒店1');assert.equal(pool.candidates[0].platformRank,2);assert.equal(pool.candidates[0].discoverySignals.length,2);assert(pool.candidates[0].rankingBasis.includes('不代表'));assert(!pool.candidates.some(c=>c.id==='99'));
assert.equal(discover({task:{phase:'locate',name:'酒店10'}}).candidates.length,1);
assert.equal(discover({query:{...q,workflow:'quotes'}}).candidates.length,3);
console.log('PASS meal portions vs whole-stay totals, hard budget, later eligible preservation, known cancellation cutoff matching, bounded safe plan expansion, 12-candidate hint ranking and exact locate. Mock rendered DOM only.');
