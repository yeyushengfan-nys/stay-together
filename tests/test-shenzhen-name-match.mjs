import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readHotelPage} from '../collector-extension/reader.js';
import {hotelKey} from '../collector-extension/core.js';
const ct='瑞澜•庭院|AESTHETIC•DESIGNER城景府邸(深圳龙华茜坑地铁站店)';
const tc='瑞澜·庭院|AESTHETIC·DESIGNER城景府邸(深圳龙华茜坑地铁站店)';
const other='瑞澜·庭院|AESTHETIC·DESIGNER城景府邸(深圳另一家地铁站店)';
assert.equal(hotelKey(ct),hotelKey(tc));assert.notEqual(hotelKey(ct),hotelKey(other));
const q={city:'深圳',checkin:'2026-12-24',checkout:'2026-12-28',adults:2,rooms:1,children:0,maxHotels:3};
const task={provider:'tongcheng',phase:'locate',name:ct,searchTerm:ct};
const visible=innerText=>({innerText,getClientRects:()=>[{}],querySelector:()=>null,querySelectorAll:()=>[]});
function read(name){const header=visible('入住12月24日 周四 4晚 退房12月28日 周一 人数2成人0儿童');const anchor={...visible(name+'\n舒适\n¥227起'),href:'https://www.ly.com/hotel/hoteldetail?hotelId=21893150&inDate=2026-12-24&outDate=2026-12-28'};
 const context={URL,location:new URL('https://www.ly.com/hotel/hotellist?city=91&inDate=2026-12-24&outDate=2026-12-28&adultsNumber=2'),getComputedStyle:()=>({visibility:'visible'}),document:{body:visible((name+' '+header.innerText+' 为您推荐相似酒店。正在加载更多住宿。').repeat(3)),querySelector:s=>s==='#keyWordBox,.keyWordBox'?header:s==='input[placeholder="位置/品牌/酒店"]'?{value:ct}:null,querySelectorAll:s=>s==='a[href*="hoteldetail"]'?[anchor]:[]}};
 return vm.runInNewContext('('+readHotelPage.toString()+')',context)(q,task);
}
const found=read(tc);assert.equal(found.status,'ready');assert.equal(found.candidates.length,1);assert.equal(found.candidates[0].id,'21893150');
const missing=read(other);assert.equal(missing.status,'ready');assert.equal(missing.code,'hotel_not_matched');assert.equal(missing.candidates.length,0);
console.log('PASS captured Shenzhen dot variants match full branch name; a different branch remains rejected.');
console.log('PASS loaded but unmatched results finish explicitly instead of waiting/reloading because a footer still says loading.');
