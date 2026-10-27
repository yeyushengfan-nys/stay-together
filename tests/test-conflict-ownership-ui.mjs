import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

// Synthetic UI/summary fixtures only. No browser, API or saved-data writes.
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const me={id:'me',name:'我',budget:500,budgetHard:true,requireSmart:true,requireLaundry:false,avoidMold:false,transitHard:false,conditions:[],weights:{price:1,facilities:1}};
const friend={...me,id:'friend',name:'朋友',requireSmart:false,smartPreference:'prefer'};
const hotel={id:'fixture-hotel',name:'模拟酒店',room:'模拟房型',price:300,facts:{smart:false},evidence:[]};
const ctx={console,Date,Map,Set,Number,URL,E,state:{mode:'trip',trip:{city:'模拟城市',checkin:'2027-03-01'},people:[me,friend],hotels:[hotel]},resultHTML:()=>'',collectorHTML:()=>'',comparisonHotels:()=>[hotel],renderCompare:()=>{},render:()=>{},link:()=>''};
vm.createContext(ctx);
for(const file of ['criteria.js','quote-evidence.js','engine.js','package-match.js','decision-summary.js','decision-ui.js'])vm.runInContext(await readFile(new URL('../public/'+file,import.meta.url),'utf8'),ctx);
const row=()=>ctx.HotelDecisionSummary.build([hotel],ctx.state.people,ctx.state.trip)[0];
const before=JSON.stringify(ctx.state);
let html=ctx.decisionCardHTML(row());
assert(html.includes('无智能马桶（我的必须项）'));
assert(!html.includes('无智能马桶（朋友的必须项）'));
assert(!html.includes('无智能马桶（我、朋友的必须项）'));
assert.equal(JSON.stringify(ctx.state),before);

ctx.state.people=[me,{...friend,requireSmart:true}];
html=ctx.decisionCardHTML(row());assert(html.includes('无智能马桶（我、朋友的必须项）'));

// Catalog requirements belong only to members who saved mode=must. A prefer
// setting and free-form notes cannot create another member's required item.
ctx.state.people=[{...me,requireSmart:false,conditions:[{id:'quiet',mode:'prefer'}],preferenceNotes:'智能马桶必须有，隔音很重要'}, {...friend,conditions:[{id:'quiet',mode:'must'}]}];
assert.equal(ctx.decisionConflictLabel({key:'quiet',label:'有隔音不佳反馈'}),'有隔音不佳反馈（朋友的必须项）');
assert.equal(ctx.decisionConflictLabel({key:'smart',label:'无智能马桶'}),'无智能马桶');
assert.equal(ctx.decisionConflictLabel({key:'unknown',label:'原始冲突说明'}),'原始冲突说明');
for(const [key,flag] of [['smart','requireSmart'],['laundry','requireLaundry'],['mold','avoidMold'],['budget','budgetHard'],['metro','transitHard']]){
 ctx.state.people=[{...me,requireSmart:false,budgetHard:false,[flag]:true},{...friend,requireSmart:false,budgetHard:false,[flag]:false}];
 assert.equal(ctx.decisionConflictLabel({key,label:'模拟冲突'}),'模拟冲突（我的必须项）');
}

// Names remain text, and rendering does not alter source conflict labels.
ctx.state.people=[{...me,name:'<朋友>'}];const escapedRow=row(),conflictsBefore=JSON.stringify(escapedRow.conflicts);
html=ctx.decisionCardHTML(escapedRow);assert(html.includes('无智能马桶（&lt;朋友&gt;的必须项）'));assert(!html.includes('无智能马桶（<朋友>'));
assert.equal(JSON.stringify(escapedRow.conflicts),conflictsBefore);
console.log('PASS conflict ownership from saved member requirements only: smart must/prefer, both members, catalog must, legacy flags, no-owner fallback, escaping and unchanged inputs (mock only).');
