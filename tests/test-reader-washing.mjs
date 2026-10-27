import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readHotelPage} from '../collector-extension/reader.js';
// Rendered DOM doubles only. No browser, account, network or actual hotel data.
const q={city:'成都',checkin:'2026-12-30',checkout:'2027-01-02',rooms:1,adults:2,children:0,required:['smartWash'],workflow:'selection',priceMode:'reference'};
const visible=text=>({innerText:text,getClientRects:()=>[{}],querySelector:()=>null,querySelectorAll:()=>[]});
function read(facilities,{title='模拟目标房型',hotel='模拟酒店'}={}){
 const modal={...visible(title+'\n'+facilities),style:{zIndex:'10002'},querySelector:s=>s.includes('galleryModal')?{}:s.includes('baseRoomLayer-roomName')?visible(title):null};
 const ctx={URL,location:new URL('https://hotels.ctrip.com/hotels/99999999.html?checkIn=2026-12-30&checkOut=2027-01-02'),getComputedStyle:()=>({visibility:'visible'}),document:{body:visible(('1间,2成人,0儿童 酒店资料 ').repeat(20)),querySelector:s=>s==='#checkInInput'?{value:'12月30日'}:s==='#checkOutInput'?{value:'1月2日'}:s.includes('hotelOverview_name')?visible(hotel):null,querySelectorAll:s=>s==='[role="dialog"]'?[modal]:[]}};
 return vm.runInNewContext('('+readHotelPage.toString()+')',ctx)(q,{provider:'ctrip',phase:'amenities',hotelId:'99999999',name:'模拟酒店',selected:{room:'模拟目标房型'}});
}
for(const text of ['臀洗','妇洗','臀部清洗','妇部冲洗','马桶清洗功能','智能马桶（臀洗／妇洗）']){
 const r=read(text),o=r.observations.find(o=>o.key==='smartWash');assert.equal(r.status,'ready');assert.equal(o?.value,true,text);assert.equal(o.room,'模拟目标房型');assert.equal(o.scope,'room');assert(o.evidence.includes(text));
}
for(const text of ['无臀洗','不支持妇洗','没有马桶清洗功能','仅加热，无臀洗/妇洗','臀洗：不支持'])assert.equal(read(text).observations.find(o=>o.key==='smartWash')?.value,false,text);
for(const text of ['智能马桶','座圈加热','自动冲水','智能马桶\n自动冲水\n座圈加热','是否支持臀洗','没有资料确认臀洗','臀洗未注明'])assert.equal(read(text).observations.some(o=>o.key==='smartWash'),false,text);
assert.equal(read('臀洗',{title:'另一房型'}).status,'needs_review');assert.equal(read('臀洗',{hotel:'另一酒店'}).status,'needs_review');
console.log('PASS exact rendered-room explicit body-washing evidence only; heating/generic smart/automatic flushing/unknown descriptions never imply washing; room/hotel identity protected (synthetic DOM only).');
