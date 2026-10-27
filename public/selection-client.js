'use strict';

function collectorSelectionHTML(job){
 if(job?.query?.priceMode==='reference')return collectorReferenceHTML(job);
 if(!job?.offers?.length)return '';
 const result=StaySelection.build(job,state.people);
 const status={fits:'已通过所选必要条件',pending:'价格可看，必要条件仍有缺口',blocked:'不符合必要条件'};
 const price=(o,showPlan)=>o?`<strong>¥${E(o.total)}</strong><small>全程 · ¥${E(o.nightly)} / 晚</small>${showPlan?`<small>${E(o.room)} · ${E(o.breakfastText)} · ${E(o.payment)}</small>`:''}${o.guarantee!=null?`<small>另有担保¥${E(o.guarantee)}，不计入房费</small>`:''}<small>采集 ${E(new Date(o.capturedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}))}</small>`:'未取得完整总额';
 const platformPrice=(r,provider)=>{
  const o=r.pair?[r.pair.lower,r.pair.higher].find(o=>o.provider===provider):r.offers.filter(o=>o.provider===provider&&o.totalBasisConfirmed).sort((a,b)=>a.total-b.total)[0];return price(o,!r.pair);
 };
 const picks=result.top.length?`<div class="selection-picks">${result.top.map((r,i)=>`<div><b>${i?'备选':'首选'}：${E(r.name)}</b><p>${E(r.pair.lower.platform)} ¥${E(r.pair.lower.total)} / 全程；同套餐节省¥${E(r.pair.saving)}。</p><p>${r.satisfied.map(E).join('；')}</p></div>`).join('')}<p class="small">先保留通过必要条件且有同条件报价的酒店，再按大家设置的权重，优先照顾最低匹配分的同行人；同分时比较平均分和金额。该分数是透明规则，不是模型预测。</p></div>`:'<p class="notice">还没有酒店通过全部必要条件并取得两平台同条件总额。下表仍展示已查到的真实金额和具体缺口，不把资料不足当成满足。</p>';
 const rows=result.rows.map(r=>{
  const verified=r.offers.filter(o=>o.totalBasisConfirmed),ct=verified.find(o=>o.provider==='ctrip'),tc=verified.find(o=>o.provider==='tongcheng');
  const diffNames={hotel:'酒店身份',room:'房型',checkIn:'入住日',checkOut:'退房日',rooms:'房间数',adults:'成人数',children:'儿童数',currency:'币种',checkoutTotal:'预览总额',breakfast:'早餐',bed:'床型',cancellation:'取消条款及违约责任',payment:'付款方式',cashback:'返现口径',captureTime:'采集时间相隔超过10分钟'};
  const mismatch=ct&&tc?`<details><summary>查看未对齐原因</summary><p>${window.StayCollectorCompare.compare(ct,tc).differences.map(k=>E(diffNames[k]||k)).join('；')}未核对一致。</p><p>携程：${E(ct.room)}，${E(ct.breakfastText)}，${E(ct.payment)}；${E(ct.cancellation)}</p><p>同程：${E(tc.room)}，${E(tc.breakfastText)}，${E(tc.payment)}；${E(tc.cancellation)}</p></details>`:'<small>尚缺一平台完整预览总额。</small>';
  const conditions=r.pair?`<b class="good">同条件</b><small>${E(r.pair.lower.breakfastText)} · ${E(r.pair.lower.payment)}</small><b>差¥${E(r.pair.saving)} / 全程</b><details><summary>床型与取消条款</summary><p>${E(r.pair.lower.bed)}</p><p>确认后${r.pair.policy.windowMinutes}分钟内免费取消；之后全额扣费；确认前取消全退。</p></details>`:`<b>套餐未对齐</b><small>两列金额不能直接判最低。</small>${mismatch}`;
  const checks=`<b>${status[r.status]}</b><small>${r.satisfied.length}项已核对 · ${r.unknown.length}项待核对${r.blocks.length?' · '+r.blocks.length+'项不满足':''}</small><details><summary>查看条件与证据</summary>${r.blocks.map(x=>`<p class="bad">${E(x)}</p>`).join('')}${r.unknown.map(x=>`<p>${E(x)}</p>`).join('')}${r.satisfied.map(x=>`<p>${E(x)}</p>`).join('')}${r.observations.map(o=>`<p>${E(StaySelection.labels[o.key]||o.key)}：${E(o.value)} · ${E(o.evidence)}${o.room?'（'+E(o.room)+'）':''} ${link(o.source,'来源 ↗')}</p>`).join('')}</details>`;
  return `<tr class="selection-${r.status}"><td><b>${E(r.name)}</b><small>${E(r.room||'未取得目标房型')}</small></td><td>${platformPrice(r,'ctrip')}</td><td>${platformPrice(r,'tongcheng')}</td><td>未接入</td><td>未接入</td><td>${conditions}</td><td>${checks}</td></tr>`;
 }).join('');
 return `<div class="selection-summary"><h3>几家酒店，放在一张表里选</h3><p>${result.rows.length}家候选 · ${result.matched}家已取得两平台同条件价格 · ${result.eligible.length}家通过目前所选必要条件</p><p class="small">人民币、每间计算；金额为当前账号的全程订单预览总额。税费未独立核实；采集时间按浏览器本地时间显示。</p></div>${picks}<div class="table-wrap"><table class="selection-table"><thead><tr><th>酒店与房型</th><th>携程</th><th>同程</th><th>飞猪</th><th>去哪儿</th><th>能否直接比较</th><th>同行必要条件</th></tr></thead><tbody>${rows}</tbody></table></div><p class="small">本次自动报价覆盖2个平台。飞猪的完整房型与日期校验尚未接入；去哪儿当前页面未加载出酒店检索内容，两者均未参与本次比价。返现、担保及会员优惠见下方原始套餐。</p>`;
}

collectorHTML=function(){
 const saved=collectorJob||state.clientCollection,job=saved&&collectorSameQuery(saved.query)?saved:null;
 const active=collectorJob&&(collectorActive.includes(collectorJob.status)||collectorPaused.includes(collectorJob.status));
 const opts=collectorJob?.query||{platforms:['ctrip','tongcheng'],maxHotels:3};
 return `<div class="eyebrow">02 · 自动找候选，逐家匹配同套餐</div><h2>房型参考价与同行条件，一起看</h2><p class="collector-connection">${collectorConnected?'● 已连接本机采集助手 '+E(collectorVersion):'○ 尚未连接 Chrome 采集助手'} · <button type="button" class="text-button" data-collector="CONNECT">重新连接</button> · <a href="/collector-setup.html" target="_blank" rel="noopener">安装与权限说明 ↗</a></p>${collectorConnected&&!collectorContinuationCapable?'<p class="notice">请把采集助手更新到0.2.8，以排除已知冲突并继续查找；原同行要求不会改变。</p>':''}<p>上方点击“找酒店并自动比价”：先读取有限的非广告候选池，分批检查房型套餐并排除已明确冲突的候选；套餐匹配不代表必要设施已满足。参考价用于初筛；必要设施仍需明确证据。当前模式不进入订单预览。</p><details><summary>采集设置与单独重试</summary><div class="collector-controls"><label><input type="checkbox" id="collector-ctrip" ${opts.platforms.includes('ctrip')?'checked':''} ${active?'disabled':''}>携程</label><label><input type="checkbox" id="collector-tongcheng" ${opts.platforms.includes('tongcheng')?'checked':''} ${active?'disabled':''}>同程</label><span class="small">候选数量在上方行程中选择，默认3家。</span><button type="button" class="primary" data-collector="START" ${!collectorConnected||active||collectorBusy?'disabled':''}>重新找候选并查价 →</button></div></details><p class="small">本轮自动报价平台：携程、同程。飞猪、去哪儿分别显示未覆盖状态。支持上海等6城、1间房、1—4成人、无儿童、最多14晚；电脑及Chrome需保持运行。不会提交订单或付款。</p><p class="muted">完整同行偏好留在本站；助手只接收行程、汇总预算与必要条件，不接收姓名。年份不等于维护状态，未提及设施或霉味不代表满足条件。</p>${collectorError?`<p role="alert" class="notice">${E(collectorError)}</p>`:''}${active&&!collectorSameQuery(collectorJob.query)?`<p class="notice">另一个行程的任务仍在进行：${E(collectorJob.query.city)} ${E(collectorJob.query.checkin)}至${E(collectorJob.query.checkout)}。请先继续或取消。</p>`:''}${active?`<div class="collector-job"><b>${E(collectorJob.message)}</b><p>已完成 ${E(collectorJob.progress.done)} / ${E(collectorJob.progress.total)} 个步骤 · ${collectorJob.offers.length}条房型套餐</p><button type="button" class="secondary" data-collector="FOCUS">查看正在采集的平台页 ↗</button>${collectorPaused.includes(collectorJob.status)?'<button type="button" class="primary" data-collector="RESUME">我已处理，继续采集</button><button type="button" class="secondary" data-collector="SKIP">跳过这一页</button>':''}<button type="button" class="text-button" data-collector="CANCEL">取消采集</button></div>`:''}${saved&&!job?'<p class="notice">旧报价与上方城市、日期、人数或价格模式不同，已收起。</p>':''}${job?`<p class="small">本次目标 ${E(job.query.maxHotels)} 家 · 已发现 ${E(new Set(job.candidates.map(c=>StaySelection.key(c.canonicalName||c.name))).size)} 家 · 已用 ${Math.round((job.updatedAt-job.createdAt)/1000)} 秒</p><p><b>${E(job.query.city)} · ${E(job.query.checkin)}至${E(job.query.checkout)} · ${job.query.rooms}间 / ${job.query.adults}成人</b></p><p>${E(job.message)}${!collectorJob?'（上次记录，非本次实时查询）':''}</p>${job.errors.length?`<details><summary>${job.errors.length}项未采集成功</summary>${job.errors.map(e=>`<p>${E(e.provider==='tongcheng'?'同程':'携程')} · ${E(e.hotel||'搜索页')}：${E(e.message)}</p>`).join('')}</details>`:''}${collectorSelectionHTML(job)}<details class="selection-raw"><summary>展开原始房型套餐、来源和采集文字</summary>${collectorOffersHTML(job)}</details>`:'<p class="muted">填写上方行程并保存偏好后，一次开始找候选和查价。这里不会混入演示数据或人工历史价格。</p>'}`;
};

function collectorSyncCandidates(job){
 if(job.query.priceMode==='reference')return collectorSyncReferenceCandidates(job);
 const result=StaySelection.build(job,state.people),ids=[];
 for(const r of result.rows){
  const old=state.hotels.find(h=>!h.demo&&StaySelection.key(h.name)===StaySelection.key(r.name)&&HotelJourney.city(h.city)===HotelJourney.city(job.query.city));
  const id=old?.id||uid(),o=r.selected;
  const h={...old,id,name:r.name,city:job.query.city,area:job.query.area||'',room:r.room||'房型未取得',price:o?.nightly??null,metro:r.facts.metro??null,quoteDate:o?.capturedAt?.slice(0,10)||'',source:o?.source||r.offers[0]?.source||'',terms:o?`自动采集：${job.query.checkin}至${job.query.checkout}，${job.query.rooms}间/${job.query.adults}成人，全程订单预览¥${o.total}，${o.breakfastText}；${o.cancellation}；${o.payment}。含当前账号优惠，税费未独立核实。`:'本次未取得完整预览总额',demo:false,collector:true,facts:{smart:null,laundry:null,mold:null,opened:null,renovated:null,...r.facts},evidence:[...(old?.evidence||[]).filter(e=>!e.collectorSource).map(e=>({...e,confirmed:false})),...r.observations.map((obs,i)=>({id:job.id+'-'+id+'-'+i,text:'【平台页面结构化资料，非住客原话】\n'+obs.evidence,claims:{[obs.key]:obs.value},platform:obs.provider==='ctrip'?'携程':'同程',room:obs.room||'酒店级资料',date:obs.capturedAt.slice(0,10),source:obs.source,confirmed:false,demo:false,collectorSource:true,image:null}))]};
  const index=state.hotels.findIndex(h=>h.id===id);if(index>=0)state.hotels[index]=h;else state.hotels.push(h);ids.push(id);
 }
 state.hotelSelection=ids;state.collectorAppliedRevision=job.id+':'+job.revision;delete state.aiResult;
}

function collectorReviewRows(query=collectorQuery()){
 if(typeof HotelPackageMatch==='undefined'||typeof HotelDecisionSummary==='undefined')return [];
 const hotels=state.hotels.filter(h=>!h.demo&&HotelJourney.city(h.city)===HotelJourney.city(query.city)&&(StayQuoteEvidence.clean(h.quoteBundle,query,h.name)?.offers.length||window.StayReferencePrices.hasAttempt(h,query))).map(h=>{
  const {derivedHotel,...packageMatch}=HotelPackageMatch.build(h,state.people,query);return {...derivedHotel,packageMatch};
 });
 return HotelDecisionSummary.build(hotels,state.people,query);
}
function collectorExcludedHotels(query=collectorQuery()){
 return collectorReviewRows(query).filter(r=>r.conflicts.some(c=>r.hotel.packageMatch?.selectedOffer||!['budget','breakfast','freeCancel','twinBeds'].includes(c.key))).slice(0,30).map(r=>{
  const platformIds={};
  for(const offer of r.hotel.quoteBundle?.offers||[]){try{const u=new URL(offer.source),id=u.searchParams.get('hotelId')||u.pathname.match(/\/hotels\/(\d+)\.html/)?.[1];if(/^\d+$/.test(id||''))platformIds[offer.provider]=id;}catch{}}
  return {name:r.hotel.name,platformIds};
 });
}
function collectorCanContinue(job,query){
 return !!job&&['completed','failed'].includes(job.status)&&job.query?.workflow==='selection'&&job.continuationReady===true&&!!job.search&&['city','checkin','checkout','rooms','adults','area'].every(k=>String(job.query[k]??'').replace(/市$/,'')===String(query[k]??'').replace(/市$/,''));
}
const collectorAutomaticRounds=new Set();
function collectorMaybeContinue(job){
 if(job?.status!=='completed'||job.query?.searchGoal!=='requirements_review'||job.continuationReady!==true||!(job.search?.remainingPool>0)||!collectorSameQuery(job.query)||!collectorContinuationCapable)return false;
 const key=job.id+':'+job.revision;if(collectorAutomaticRounds.has(key))return false;
 const ready=collectorReviewRows().filter(r=>r.formalEligible||(r.hotel.packageMatch?.selectedOffer&&r.budget.basis==='reference'&&r.budget.within===true&&!r.conflicts.length&&r.missing.every(x=>x.key==='budget')));
 if(ready.length>=2)return false;
 collectorAutomaticRounds.add(key);
 setTimeout(()=>{if(collectorBusy||collectorJob?.id!==job.id||collectorJob?.revision!==job.revision||!collectorSameQuery(job.query))return;return window.StartHotelSelection({continue:true,automatic:true});},0);
 return true;
}
window.StartHotelSelection=async function(options={}){
 if(collectorBusy)return;if(!state.preferencesConfirmed){toast('请先核对并保存同行偏好');return;}
 if(!collectorConnected)await collectorConnect();
 if(!collectorConnected||!collectorSelectionCapable||!collectorContinuationCapable){collectorError='请更新并重新加载0.2.8采集助手，再刷新本站；这一版才支持排除已知冲突并继续查找，原同行要求不会改变。';collectorPaint();return;}
 collectorBusy=true;collectorError='';
 try{
  const query={...collectorQuery(),platforms:options.platforms||['ctrip','tongcheng'],maxHotels:Number(document.getElementById('discovery-count')?.value||state.collectorCandidateCount||3),workflow:'selection',searchGoal:'requirements_review'};
  query.excludeHotels=collectorExcludedHotels(query);
  const previous=collectorJob||state.clientCollection,continuing=options.continue===true&&collectorCanContinue(previous,query),sameTrip=['city','checkin','checkout','rooms','adults'].every(k=>String(state.trip[k]??(k==='rooms'?1:k==='adults'?state.people.length:''))===String(query[k]??''));
  const data=await collectorRequest(continuing?'CONTINUE_SELECTION':'START',{...(continuing?{jobId:previous.id}:{}),query});
  const q=data.job.query;state.trip={...state.trip,city:q.city,checkin:q.checkin,checkout:q.checkout,rooms:q.rooms,adults:q.adults,area:q.area};if(!sameTrip)state.hotelSelection=[];delete state.aiResult;save();collectorAccept(data);render();
 }catch(e){collectorError=e.message;collectorPaint();}finally{collectorBusy=false;collectorPaint();}
};

// Intercept the old advanced START control before its bubbling listener.
document.addEventListener('click',event=>{
 const continuation=event.target.closest('[data-collector="CONTINUE_SELECTION"]');
 if(continuation){event.stopImmediatePropagation();event.preventDefault();window.StartHotelSelection({continue:true});return;}
 const target=event.target.closest('[data-collector="START"]');
 if(target&&!target.hasAttribute('data-collector-hotel')){event.stopImmediatePropagation();event.preventDefault();window.StartHotelSelection({platforms:[document.getElementById('collector-ctrip')?.checked?'ctrip':null,document.getElementById('collector-tongcheng')?.checked?'tongcheng':null].filter(Boolean)});}
},true);
document.addEventListener('input',event=>{
 if(event.target.closest('#trip-form')&&['city','checkin','checkout','area'].includes(event.target.name)){
  const q=discoveryQuery();state.discoveryDraft={...q,[event.target.name]:event.target.value};save();
 }
});
render();
