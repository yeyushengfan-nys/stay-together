'use strict';
let discoveryBusy=false,discoveryMessage='';
function discoveryQuery(){const d=state.discoveryDraft||{};return {city:d.city??state.trip.city??'',checkin:d.checkin??state.trip.checkin??'',checkout:d.checkout??state.trip.checkout??'',area:d.area??state.trip.area??'',notes:d.notes??'',rooms:Number(d.rooms??state.trip.rooms??1),adults:Number(d.adults??state.trip.adults??state.people.length),budget:Math.min(...state.people.map(p=>p.budget))};}
function discoveryFingerprint(query=discoveryQuery()){return JSON.stringify({query,people:state.people,preferencesConfirmed:!!state.preferencesConfirmed});}
function discoveryResultHTML(){
 const d=state.discoveryDossier;if(!d)return '<p class="muted">还没有候选？先填写行程，系统帮你找。无需提前知道酒店名字。</p>';
 if(d.fingerprint!==discoveryFingerprint())return '<div class="notice">行程或偏好已有修改，旧候选已收起。请按新条件重新查找。</div>';
 return `<p>${E(d.result.summary)}</p><p class="disclaimer">${E(d.query.city)} · ${E(d.query.checkin)} 至 ${E(d.query.checkout)} · ${d.query.rooms}间／${d.query.adults}位成人 · 人民币<br>检索时间：${E(new Date(d.retrieved_at).toLocaleString('zh-CN'))} · ${E(d.model)}${d.elapsed_ms?' · 用时'+Math.round(d.elapsed_ms/1000)+'秒':''}</p><div class="notice">以下为带来源的候选池。房价、库存和必要设施尚未逐项核实，不能视为符合预算的最终推荐。勾选1—4家，再进入深入比较。</div><div class="discovery-cards">${d.result.hotels.map((h,i)=>`<article class="panel discovery-card"><label class="check-label"><input type="checkbox" data-discovery-index="${i}"><b>${E(h.name)}</b></label><p>${E(h.area)}</p><p>${E(h.why_consider)}</p><p class="unknown">实时含税房价：待确认；可订状态：待确认</p>${researchLinks(h.source_ids,d)}<details><summary>还要核对什么</summary>${h.pending.map(p=>`<p>${E(p)}</p>`).join('')}</details></article>`).join('')}</div><button type="button" class="primary" id="use-discovery">把勾选酒店加入本次行程 →</button><details class="saved-research"><summary>本次检索的局限</summary>${d.result.limitations.map(s=>`<p>${E(s)}</p>`).join('')}</details>`;
}
const compareBeforeDiscovery=renderCompare;
renderCompare=function(){
 compareBeforeDiscovery();if(state.mode!=='trip')return;
 const main=$('#main'),old=main.querySelector('.research-panel'),q=discoveryQuery();if(!old)return;
 const optional=document.createElement('details');optional.className='saved-research existing-hotels';optional.innerHTML='<summary>我已有酒店名，直接查资料（可选）</summary>';old.before(optional);optional.append(old);
 const panel=document.createElement('section');panel.className='panel discovery-panel';panel.innerHTML=`<div class="eyebrow">01 · 先填行程，系统找酒店</div><h2>填行程，自动找酒店并比价</h2><p>先保存每个人的预算和必要条件，再填写本次城市、日期与人数。无需先知道酒店名，系统从平台发现候选，并逐家寻找相同套餐。</p><form id="discovery-form"><div class="form-grid"><label>目的地城市<input name="city" maxlength="40" required value="${E(q.city)}" placeholder="例如北京"></label><label>希望住的区域<input name="area" maxlength="160" value="${E(q.area)}" placeholder="例如王府井，或靠近地铁"></label><label>入住日期<input name="checkin" type="date" required value="${E(q.checkin)}"></label><label>退房日期<input name="checkout" type="date" required value="${E(q.checkout)}"></label><label>房间数<input name="rooms" type="number" min="1" max="4" required value="${q.rooms}"></label><label>成人数<input name="adults" type="number" min="1" max="8" required value="${q.adults}"></label><label>本次查找候选数量<select id="discovery-count" name="candidateCount">${[1,2,3].map(n=>`<option value="${n}" ${n===(state.collectorCandidateCount||3)?'selected':''}>${n} 家</option>`).join('')}</select></label><label class="wide">额外想法（可留空）<textarea name="notes" maxlength="600" placeholder="例如想住新一点、位置方便，或想体验套房">${E(q.notes)}</textarea></label></div><p class="discovery-budget">当前检索预算：每间每晚不高于 <b>¥${q.budget}</b>（人民币含税，按同行人中较低预算）。${state.people.map(p=>E(p.name)+' ¥'+E(p.budget)).join('；')}。<button type="button" class="text-button" data-action="preferences">修改同行偏好和预算 ↗</button></p>${state.preferencesConfirmed?'':'<p class="notice">这些还是初始偏好预设。请先点击上方“修改同行偏好和预算”，核对并保存。</p>'}<button class="primary" type="submit" ${discoveryBusy?'disabled':''}>${discoveryBusy?'正在联网寻找候选…':'找酒店并自动比价 →'}</button><p class="disclaimer">使用本机 Chrome 采集助手；目前自动采集携程与同程，飞猪、去哪儿的状态在结果中单列。只读取页面，不提交订单；登录和验证码由你处理。</p></form><div id="discovery-message" aria-live="polite">${discoveryMessage}</div><details class="saved-research"><summary>以前的公开资料候选（不参与本次实时报价）</summary><div id="discovery-results">${discoveryResultHTML()}</div></details>`;
 optional.before(panel);const steps=main.querySelector('.flow-steps');if(steps)steps.innerHTML='<span>① 填行程，找酒店</span><span>② 选候选，核对价格和资料</span><span>③ 看首选／备选或待确认</span>';
};
document.addEventListener('input',e=>{if(!e.target.closest('#discovery-form'))return;const f=$('#discovery-form');state.discoveryDraft=Object.fromEntries(['city','checkin','checkout','area','notes','rooms','adults'].map(k=>[k,f.elements[k].value]));save();$('#discovery-results').innerHTML=discoveryResultHTML();});
document.addEventListener('submit',async e=>{
 if(e.target.id!=='discovery-form')return;e.preventDefault();if(discoveryBusy||state.mode!=='trip')return;
 if(window.StartHotelSelection){await window.StartHotelSelection();return;}
 if(!state.preferencesConfirmed){toast('先核对并保存同行偏好，再开始找酒店');return;}
 const query=discoveryQuery();if(query.checkout<=query.checkin){toast('退房日期需要晚于入住日期');return;}if(query.adults<query.rooms){toast('每间房至少安排1位成人，请核对人数与房间数');return;}
 discoveryBusy=true;const fp=discoveryFingerprint(query);discoveryMessage='<p>正在联网寻找这个城市中可继续考察的酒店，请保持页面打开。</p>';render();
 try{const out=await callAI('discover',{query,people:state.people,preferencesConfirmed:state.preferencesConfirmed});out.fingerprint=fp;state.discoveryDossier=out;save();discoveryMessage='<p class="good">已取得带来源的候选。请核对名单，勾选你想继续比较的酒店。</p>';}
 catch(err){discoveryMessage=errorHTML(err);}finally{discoveryBusy=false;if(view==='compare')render();}
});
function applyDiscoverySelection(){
 const d=state.discoveryDossier;if(!d||d.fingerprint!==discoveryFingerprint()){toast('行程或偏好已变化，请重新查找');return;}
 const selected=[...document.querySelectorAll('[data-discovery-index]:checked')].map(x=>d.result.hotels[Number(x.dataset.discoveryIndex)]).filter(Boolean);
 if(!selected.length||selected.length>4){toast('请先勾选1—4家想深入比较的酒店');return;}
 const hotels=selected.map(h=>{const old=state.hotels.find(x=>!x.demo&&x.name===h.name&&HotelJourney.city(x.city)===HotelJourney.city(d.query.city));return {...old,id:old?.id||uid(),name:h.name,city:d.query.city,area:h.area,room:'具体房型待选择',price:null,metro:null,quoteDate:'',source:d.sources.find(s=>h.source_ids.includes(s.id))?.url||'',terms:'请核对本次日期和入住人数的人民币含税总价、早餐、取消与支付优惠条件',demo:false,facts:{opened:old?.facts.opened??null,renovated:old?.facts.renovated??null,smart:null,laundry:null,mold:null},evidence:[...(old?.evidence||[]).map(e=>({...e,confirmed:false})),{id:uid(),text:'【候选发现摘要，非住客逐字原文】\n'+h.why_consider+'\n本次行程：'+d.query.checkin+'至'+d.query.checkout+'；'+d.query.rooms+'间，'+d.query.adults+'位成人。\n实时房价与必要设施待确认。',claims:{},platform:'其他',room:'具体房型待选择',date:'',source:d.sources.find(s=>h.source_ids.includes(s.id))?.url||'',sourceLinks:h.source_ids.map(id=>d.sources.find(s=>s.id===id)).filter(Boolean),confirmed:false,demo:false,webResearch:true,image:null}]};});
 if(!confirm(`将把${d.query.city} ${d.query.checkin}至${d.query.checkout}设为当前行程，并比较所选${hotels.length}家酒店。原始资料保留并撤销旧确认状态；房型和报价需要重新核对，旧AI推荐会失效。继续？`))return;
 state=HotelJourney.select(state,{city:d.query.city},hotels);state.trip={city:d.query.city,checkin:d.query.checkin,checkout:d.query.checkout,area:d.query.area,rooms:d.query.rooms,adults:d.query.adults};state.researchDraft={city:d.query.city,names:selected.slice(0,2).map(h=>h.name).join('\n')};delete state.aiResult;filterHotel='';filterPlatform='';save();render();toast('候选已加入。请核对房型、含税总价和必要设施，再生成AI推荐。');
}
document.addEventListener('click',e=>{if(e.target.id==='use-discovery')applyDiscoverySelection();});
const guideBeforeDiscovery=renderGuide;
renderGuide=function(){guideBeforeDiscovery();$('#main .help-box').insertAdjacentHTML('afterbegin','<h3>不知道酒店名字也能开始</h3><p>在酒店对比页先填城市、入住退房日期、房间数和成人数。保存同行偏好后，点击“按行程帮我找酒店”。勾选候选加入行程，再核对具体房型、国内平台含税报价与设施。候选池未穷尽所有酒店，也不代表已验证库存或预算。</p>');};
render();

document.addEventListener('change',e=>{if(e.target.id==='discovery-count'){state.collectorCandidateCount=Number(e.target.value)||3;save();}});
