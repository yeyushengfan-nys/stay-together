'use strict';
let researchBusy=false,researchMessage='',publicCase=null,pendingResearchSelection=null;
const platforms=['酒店官网','携程/Trip.com','去哪儿','飞猪','同程','小红书','大众点评','抖音','豆瓣'];
const coverageLabels={public_result:'检索到公开摘要',link_only:'仅链接／正文待读取',no_result:'本次未取得资料'};
const currentDossier=()=>state.researchDossier||publicCase;
function researchLinks(ids,d){return(ids||[]).map(id=>{const s=d.sources.find(s=>s.id===id);return s?`<a class="research-source" href="${E(s.url)}" target="_blank" rel="noopener noreferrer">${E(s.title)} ↗</a>`:'';}).join('');}
function researchHTML(d){
 if(!d)return '<div class="empty">输入城市和酒店名，先查一轮公开资料。</div>';
 const hotels=d.result.hotels.slice().sort((a,b)=>a.query_index-b.query_index),topics=['开业与翻新','房型与动线','智能马桶','洗衣设施','卫生与异味','位置交通'];
 return `<div class="notice"><b>${d.origin==='live_search'?'本次联网检索':'已保存的公开资料案例'} · ${E(d.city)}</b><br>这份检索结果尚不等于当前行程的推荐。点击下方按钮后，才会加入对应城市的候选。</div><p class="disclaimer">检索于 ${E(new Date(d.retrieved_at).toLocaleString('zh-CN'))} · ${E(d.model)}<br>${E(d.source_note)}</p><button class="primary" type="button" id="compare-researched-hotels">使用这两家酒店，进入核对 →</button><div class="table-wrap" style="margin-top:18px"><table class="research-table"><thead><tr><th>你在意的细节</th>${hotels.map(h=>`<th>${E(h.name)}<span class="small">${E(h.area)}</span></th>`).join('')}</tr></thead><tbody>${topics.map(t=>`<tr><th>${t}</th>${hotels.map(h=>`<td>${h.items.filter(i=>i.topic===t).map(i=>`<p>${E(i.summary)}</p><p class="evidence-meta">${E(i.room_scope||'房型未注明')} · ${E(i.date_note||'日期未注明')}</p>${researchLinks(i.source_ids,d)}`).join('')||'<span class="unknown">待确认：本次资料不足</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div><details class="panel"><summary>查看各平台覆盖情况</summary><p class="muted">只表示本次取得了哪些资料；未取得不代表平台不存在评价。</p><div class="table-wrap"><table class="research-table"><thead><tr><th>来源</th>${hotels.map(h=>`<th>${E(h.name)}</th>`).join('')}</tr></thead><tbody>${platforms.map(p=>`<tr><th>${p}</th>${hotels.map(h=>{const c=h.coverage.find(c=>c.platform===p);return `<td><span class="tag">${E(coverageLabels[c?.status]||'本次未取得资料')}</span><p>${E(c?.note||'未取得可用资料。')}</p>${researchLinks(c?.source_ids,d)}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div></details><div class="recommendations">${hotels.map(h=>`<section class="panel"><h3>${E(h.name)} · 待确认</h3>${h.pending.map(q=>`<p>· ${E(q)}</p>`).join('')}<button class="secondary" data-research-import="${h.query_index}">只加入这家酒店 →</button></section>`).join('')}</div>`;
}
function importedHotel(h,d){return{id:uid(),city:d.city,name:h.name,area:h.area,room:'具体房型待选择',price:null,metro:null,quoteDate:'',source:d.sources.find(s=>h.coverage.find(c=>c.platform==='酒店官网')?.source_ids.includes(s.id))?.url||'',terms:'日期、含税价格、早餐与取消条件待确认',demo:false,researchImported:true,facts:{opened:null,renovated:null,smart:null,laundry:null,mold:null},evidence:h.items.map(i=>({id:uid(),text:'【联网检索摘要，非住客逐字原文】\n'+i.summary+'\n适用房型：'+i.room_scope+'\n来源日期：'+i.date_note,claims:{},platform:'其他',date:'',room:i.room_scope||'未注明',source:d.sources.find(s=>s.id===i.source_ids[0])?.url||'',sourceLinks:i.source_ids.map(id=>d.sources.find(s=>s.id===id)).filter(Boolean),confirmed:false,demo:false,webResearch:true,image:null}))};}
function useResearchSelection(d,indexes){
 const hotels=d.result.hotels.filter(h=>indexes.includes(h.query_index)).map(h=>{
  const fresh=importedHotel(h,d),old=state.hotels.find(x=>!x.demo&&x.name===h.name&&HotelJourney.city(x.city)===HotelJourney.city(d.city));if(!old)return fresh;
  const retained=old.evidence.filter(e=>!e.webResearch||e.confirmed),keys=new Set(retained.map(e=>e.text+'|'+e.source));
  return{...old,researchRetrievedAt:d.retrieved_at,source:fresh.source||old.source,evidence:[...retained,...fresh.evidence.filter(e=>!keys.has(e.text+'|'+e.source))]};
 });
 state=HotelJourney.select(state,d,hotels);state.researchDossier=d;filterHotel='';filterPlatform='';save();render();toast('已切换至'+d.city+'，本次仅比较所选酒店；请核对资料');
}
function requestResearchSelection(d,indexes){
 if(state.mode!=='trip'){toast('请先切换到我的行程');return;}
 if(state.trip.city&&HotelJourney.city(state.trip.city)!==HotelJourney.city(d.city)){
  pendingResearchSelection={d,indexes};showDialog('切换至'+d.city+'行程？',`<p>当前行程是 <b>${E(state.trip.city)}</b>，检索结果属于 <b>${E(d.city)}</b>。</p><p>确认后会切换城市，并清空当前日期，等待重新确认。其他城市的酒店资料仍保留，不会进入本次推荐。</p><div class="dialog-footer"><button class="secondary" type="button" id="cancel-city-switch">暂不切换</button><button class="primary" type="button" id="confirm-city-switch">确认切换并加入</button></div>`);return;
 }
 useResearchSelection(d,indexes);
}
const compareBeforeResearch=renderCompare;
renderCompare=function(){
 compareBeforeResearch();const main=$('#main'),existing=main.querySelector('.ai-panel');if(!existing)return;
 const panel=document.createElement('section');panel.className='research-panel panel';
 if(state.mode==='demo')panel.innerHTML='<h2>演示模式：杭州虚构案例</h2><p>这里用于测试字段提示和推荐变化。真实酒店检索与资料保存在“我的行程”。</p><button class="secondary" data-mode="trip">进入我的行程 →</button>';
 else panel.innerHTML=`<div class="eyebrow">01 · 输入候选酒店</div><h2>从酒店名字开始</h2><p>当前行程：${E(state.trip.city||'城市待设置')}。检索结果会单独标明城市，跨城市加入前会请你确认。</p><form id="research-form"><div class="form-grid"><label>检索城市<input name="research-city" value="${E(state.researchDraft?.city||state.trip.city||'北京')}" maxlength="40" required></label><label>酒店名称（每行一家，最多两家）<textarea name="research-names" rows="2" maxlength="220" required>${E(state.researchDraft?.names||'北京瑰丽酒店\n北京璞瑄酒店')}</textarea></label></div><button class="primary" type="submit" ${researchBusy?'disabled':''}>${researchBusy?'正在检索公开资料…':'自动查找酒店资料与评价 →'}</button><p class="disclaimer">只整理本次能取得的公开资料，各平台覆盖程度见结果。一次联网检索会使用 API 额度。</p></form><div id="research-message" aria-live="polite">${researchMessage}</div><details class="saved-research" ${!comparisonHotels().length?'open':''}><summary>查看${state.researchDossier?.origin==='live_search'?'本次检索结果':'北京两家酒店的公开资料案例'}</summary><div id="research-results">${researchHTML(currentDossier())}</div></details>`;
 existing.before(panel);const guide=document.createElement('div');guide.className='flow-steps';guide.innerHTML='<span>① 输入候选</span><span>② 核对资料和偏好</span><span>③ 查看首选／备选或暂不推荐</span>';main.querySelector('.summary-line').before(guide);
 if(Array.isArray(state.hotelSelection))main.querySelector('.summary-line').insertAdjacentHTML('afterend',`<div class="banner info"><strong>本次对比范围</strong><span>${comparisonHotels().map(h=>E(h.name)).join('、')||'暂无候选'}。<button class="text-button" id="show-all-candidates">查看当前城市全部候选</button></span></div>`);
};
document.addEventListener('input',e=>{if(e.target.closest('#research-form')){const f=$('#research-form');state.researchDraft={city:f.elements['research-city'].value,names:f.elements['research-names'].value};save();}});
document.addEventListener('submit',async e=>{
 if(e.target.id==='research-form'){
  e.preventDefault();if(researchBusy||state.mode!=='trip')return;const f=new FormData(e.target),city=String(f.get('research-city')).trim(),names=String(f.get('research-names')).split('\n').map(n=>n.trim()).filter(Boolean);if(!names.length||names.length>2){toast('每行一家，最多两家酒店');return;}
  state.researchDraft={city,names:names.join('\n')};save();researchBusy=true;researchMessage='<p>正在寻找公开来源并整理摘要，请保持页面打开。</p>';const started=performance.now();render();
  try{const data=await callAI('research',{city,names});data.origin='live_search';state.researchDossier=data;save();researchMessage=`<p class="good">本次联网检索完成，用时 ${Math.round((performance.now()-started)/1000)} 秒。请打开结果，核对来源和待确认信息。</p>`;}
  catch(err){researchMessage=errorHTML(err);}finally{researchBusy=false;if(view==='compare')render();}
 }
 if(e.target.id==='confirm-research-evidence'){
  e.preventDefault();const ev=currentHotels().flatMap(h=>h.evidence).find(e=>e.id===e.target.dataset.id);if(!ev)return;ev.confirmed=true;save();closeDialog();render();toast('已保存核对状态；必要设施仍需在资料卡中确认');
 }
});
document.addEventListener('click',e=>{
 if(e.target.id==='compare-researched-hotels'){const d=currentDossier();if(d)requestResearchSelection(d,d.result.hotels.map(h=>h.query_index));}
 const add=e.target.closest('[data-research-import]');if(add&&currentDossier())requestResearchSelection(currentDossier(),[Number(add.dataset.researchImport)]);
 if(e.target.id==='confirm-city-switch'&&pendingResearchSelection){const p=pendingResearchSelection;pendingResearchSelection=null;closeDialog();useResearchSelection(p.d,p.indexes);}
 if(e.target.id==='cancel-city-switch'){pendingResearchSelection=null;closeDialog();}
 if(e.target.id==='show-all-candidates'){delete state.hotelSelection;save();render();}
 const review=e.target.closest('[data-review-research]');if(review){const ev=currentHotels().flatMap(h=>h.evidence).find(e=>e.id===review.dataset.reviewResearch);if(!ev)return;showDialog('核对检索摘要与来源',`<p class="notice">这是 AI 整理的摘要。先打开来源检查，它不等于住客逐字原文。</p><p style="white-space:pre-wrap">${E(ev.text)}</p>${(ev.sourceLinks||[]).map(s=>link(s.url,s.title)).join('<br>')}<form id="confirm-research-evidence" data-id="${E(ev.id)}"><label class="check-label"><input name="confirmed" type="checkbox" required>我已查看来源并核对摘要，可用于后续比较</label><div class="dialog-footer"><button class="primary" type="submit">保存核对状态</button></div></form>`);}
});
const guideBeforeResearch=renderGuide;
renderGuide=function(){guideBeforeResearch();$('#main .help-box').insertAdjacentHTML('afterbegin','<h3>两种模式单独保存</h3><p>“我的行程”只展示当前城市的真实候选。“演示模式”保留杭州虚构案例，日期、价格和评价不会进入我的行程。跨城市加入检索结果时需要确认切换，并重新核对日期。</p>');};
fetch('/beijing-research.json').then(r=>r.ok?r.json():null).then(d=>{publicCase=d;if(view==='compare'&&state.mode==='trip'&&!state.researchDossier)render();}).catch(()=>{});
render();
