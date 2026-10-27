'use strict';
// Presentation only: prices, source records, preferences and eligibility stay intact.
const detailedAIResultHTML=resultHTML;
function referenceSelectionHTML(result){
 const recs=result.recommendations||[];
 if(!recs.length)return '';
 return '<section class="reference-selection"><h3>参考价范围内的选择</h3><p class="decision-muted">必要条件证据已核齐；以下按当前匹配套餐的房型页参考价选择。</p><div class="verification-grid">'+recs.map((x,i)=>{
  const h=state.hotels.find(h=>h.id===x.hotel_id),amount=x.reference_cny_per_room_per_night;
  const price=typeof amount==='number'&&Number.isFinite(amount)&&amount>0?'¥'+E(amount):'参考价待确认';
  return '<article class="hotel-card recommended reference-selection-card" data-selected-offer="'+E(x.selected_offer_id)+'"><span class="rank">参考价'+(i===0?'首选':'备选')+'</span>'+decisionHotelTitle(h?.name||'候选酒店')+'<p>'+E(x.headline)+'</p><p class="sub">'+E(x.target_room||'目标房型待确认')+' · <strong>'+price+'</strong> / 每间每晚 · 房型页参考价</p>'+(x.reasons||[]).map(a=>'<section class="ai-reason"><b>对'+E(state.people.find(p=>p.id===a.member_id)?.name||'同行人')+'来说</b><p>'+E(a.explanation)+'</p>'+citationsHTML(a.citations)+'</section>').join('')+((x.tradeoffs||[]).length?'<div class="tradeoff"><b>需要接受的取舍</b>'+x.tradeoffs.map(t=>'<p>'+E(t.explanation)+'</p>'+citationsHTML(t.citations)).join('')+'</div>':'')+'<p class="decision-muted">参考价不是最终应付价；最终税费、完整取消责任和可订性仍需预订前核对。</p></article>';
 }).join('')+'</div></section>';
}
function verificationShortlistHTML(result){
 const rows=HotelDecisionSummary.build(decisionScopedHotels(),state.people,state.trip),formal=new Set((result.recommendations||[]).map(x=>x.hotel_id));
 const list=(result.verification_shortlist||[]).filter(x=>{
  const row=rows.find(r=>r.hotel.id===x.hotel_id);
  return x.decision_scope==='verification_only'&&x.price_basis==='room_page_reference'&&row&&!formal.has(x.hotel_id)&&!row.conflicts.length&&row.budget.within!==false&&row.hotel.packageMatch?.selectedOffer;
 }).slice(0,2);
 if(!list.length)return '';
 return '<section class="verification-shortlist"><h3>AI 建议先核实这'+list.length+'家</h3><p class="decision-muted">核实顺序基于已知套餐和偏好；必要信息仍未确认，不代表已满足入住要求。</p><div class="verification-grid">'+list.map((x,i)=>{
  const row=rows.find(r=>r.hotel.id===x.hotel_id),h=row.hotel;
  const questions=x.verify_next||[],first=questions[0],rest=questions.slice(1);
  return '<article class="verification-card"><span class="verification-rank">'+(i===0?'先核实':'再核实')+'</span>'+decisionHotelTitle(h.name)+'<p class="decision-muted">'+E(h.room)+' · 房型页参考价</p>'+(x.reasons||[]).map(a=>'<section class="verification-member-reason"><b>对'+E(state.people.find(p=>p.id===a.member_id)?.name||'同行人')+'来说</b><p>'+E(a.explanation)+'</p>'+citationsHTML(a.citations)+'</section>').join('')+(first?'<div class="verification-next"><b>下一步</b><p>'+E(first.question)+'</p></div>':'')+(rest.length?'<details class="decision-details"><summary>其余 '+rest.length+' 项核实任务</summary><ul>'+rest.map(q=>'<li>'+E(q.question)+'</li>').join('')+'</ul></details>':'')+'<p class="verification-boundary">参考价不是最终应付价；任何必要条件核实不符，都应移出候选。</p></article>';
 }).join('')+'</div></section>';
}
resultHTML=function(){
 const saved=state.aiResult;
 if(!saved)return '<p class="decision-muted">可让 AI 解释评价与同行取舍。</p>';
 if(saved.fingerprint!==fingerprint())return '<p class="decision-muted">资料已更新，点上方按钮重新解读。</p>';
 const r=saved.data.result,recs=r.recommendations||[],reference=(r.decision_scope||saved.data.decision_scope)==='reference_selection',verification=verificationShortlistHTML(r);
 const summary=recs.length?'<p class="ai-compact-status good">AI 已完成 · '+(reference?(recs.length===2?'已给出参考价首选和备选':'已有1家参考价候选'):(recs.length===2?'已给出首选和备选':'已有1家正式候选'))+'</p><ol class="ai-shortlist">'+recs.map((x,i)=>'<li><b>'+E(state.hotels.find(h=>h.id===x.hotel_id)?.name)+'</b> · '+(reference?'参考价'+(i===0?'首选':'备选')+' · ':'')+E(x.headline)+'</li>').join('')+'</ol>':reference?'<p class="ai-compact-status good">AI 已完成解读 · 参考价选择尚缺必要证据</p><p class="decision-muted">目前资料不足或存在条件冲突，请先处理具体缺口。</p>':verification?'<p class="ai-compact-status good">AI 已完成 · 已整理优先核实清单</p><p class="decision-muted">正式入住条件仍未核齐，先按下方顺序补证。</p>':'<p class="ai-compact-status good">AI 已完成解读 · 尚不能给出正式首选、备选</p><p class="decision-muted">目前资料不足或存在条件冲突，请先处理具体缺口。</p>';
 const assessments=r.review_assessments||[],reviews=assessments.map(a=>'<details class="decision-details"'+(assessments.length===1?' open':'')+'><summary>'+E(state.hotels.find(h=>h.id===a.hotel_id)?.name)+' · 评价解读</summary><p>'+E(a.explanation)+'</p>'+citationsHTML(a.citations)+'</details>').join('');
 const meta='<p class="decision-muted">'+(state.mode==='demo'?'虚构演示资料':'我的行程 · '+E(state.trip.city))+' · '+E(new Date(saved.data.generated_at).toLocaleString('zh-CN'))+(saved.data.elapsed_ms?' · '+Math.round(saved.data.elapsed_ms/1000)+' 秒':'')+'</p>';
 return summary+meta+(reference?referenceSelectionHTML(r):'')+verification+reviews+'<details class="decision-details ai-full-record"><summary>完整 AI 记录与所有引用</summary>'+detailedAIResultHTML()+'</details>';
};

function decisionScopedHotels(){
 const reference=state.mode==='trip'&&typeof aiRequestDecisionScope==='function'&&aiRequestDecisionScope()==='reference_selection';
 return comparisonHotels().map(h=>{
  if(!h.quoteBundle)return h;
  const {derivedHotel,...packageMatch}=HotelPackageMatch.build(h,state.people,state.trip);
  return {...derivedHotel,...(reference?{price:null}:{}),packageMatch};
 });
}
function decisionOffers(h){
 if(!h.quoteBundle?.offers?.length)return [];
 const match=h.packageMatch||HotelPackageMatch.build(h,state.people,state.trip);
 return ['ctrip','tongcheng'].map(provider=>match.offersByProvider[provider]);
}
function decisionPriceCell(o,provider,match){
 const name=provider==='ctrip'?'携程':'同程';
 const check=match?.checks.find(x=>x.offer.id===o?.id),nonmatching=check&&!check.matched;
 const breakfast=o?HotelPackageMatch.breakfastLabel(o):'',required=match?.requirements.breakfast?' · 需'+match.requirements.adults+'份（'+match.requirements.adults+'成人）':'';
 return '<div class="decision-price-cell'+(nonmatching?' price-unmatched':'')+'"><span>'+name+(nonmatching?' · 非匹配套餐':'')+'</span>'+(o?'<strong>¥'+E(o.listNightly??'—')+'</strong><small>'+E(breakfast+required)+'</small><small>'+E(o.cancellation||'取消规则未注明')+'</small>':'<strong class="price-missing">未取得该房型</strong>')+'</div>';
}
function decisionPriceNote(offers){
 const [a,b]=offers;if(!a||!b)return '缺少另一平台报价';
 const key=StayQuoteEvidence.key,differences=[];
 if(key(a.room)!==key(b.room))differences.push('房型');
 const ac=HotelPackageMatch.breakfastCount(a),bc=HotelPackageMatch.breakfastCount(b);
 if(ac!==null&&bc!==null?ac!==bc:key(a.breakfastText)!==key(b.breakfastText))differences.push('早餐');
 if(a.cancellation&&b.cancellation&&HotelPackageMatch.cancellationKey(a)!==HotelPackageMatch.cancellationKey(b))differences.push('取消条件');
 if(differences.length)return differences.join('、')+'不同，不直接比价';
 if(ac===null||bc===null)return '早餐份数未核清，不直接比价';
 if(!a.cancellation||!b.cancellation||/未注明|待确认/.test(a.cancellation+b.cancellation))return '取消条件未注明，不直接比价';
 return '房型、早餐与取消文字对应；完整责任与税费未核对';
}
function decisionHotelTitle(name){
 const branch=String(name).match(/[（(]([^）)]+)[）)]/),brand=String(name).split(/[（(]/)[0].split('|')[0];
 return '<h3 title="'+E(name)+'">'+E(brand)+'</h3>'+(branch?'<p class="decision-branch">'+E(branch[1])+'</p>':'');
}
function referenceReady(row){
 return state.mode==='trip'&&(state.trip?.children??0)===0&&typeof aiRequestDecisionScope==='function'&&aiRequestDecisionScope()==='reference_selection'&&!!row.hotel.packageMatch?.selectedOffer&&row.budget.basis==='reference'&&row.budget.within===true&&!row.conflicts.length&&row.missing.every(x=>x.key==='budget');
}
function decisionConflictLabel(conflict){
 const flags={smart:'requireSmart',laundry:'requireLaundry',mold:'avoidMold',budget:'budgetHard',metro:'transitHard'};
 const owners=(state.people||[]).filter(p=>(flags[conflict.key]&&p[flags[conflict.key]])||(typeof HotelCriteria!=='undefined'&&HotelCriteria.conditions(p).some(c=>c.id===conflict.key&&c.mode==='must')));
 const names=[...new Set(owners.map(p=>p.name||'同行人'))];
 return conflict.label+(names.length?'（'+names.join('、')+'的必须项）':'');
}
function decisionPolicyHTML(row){
 const records=(row.policy?.applied||[]).filter(p=>p.claims.invoice===true||p.claims.lateCheckin===true);
 if(!records.length)return '';
 return '<div class="decision-policy"><b>已核实的套餐政策</b>'+records.map(p=>'<p>'+E(p.scope.provider==='ctrip'?'携程':'同程')+'：'+[p.claims.invoice===true?'可开所需发票':null,p.claims.lateCheckin===true?'支持所咨询的晚到时段':null].filter(Boolean).map(E).join('；')+(p.requiresPaidConfirmed?'。仅在在线付款且酒店／供应商确认后生效':'。适用前提以核实原文为准')+'。</p>').join('')+'<small>仅适用于对应套餐及核实问句，并非已经预订或保房。改变发票或到店要求后需重新核实。</small></div>';
}
function decisionCardHTML(row){
 const h=row.hotel,match=h.packageMatch||(h.quoteBundle?HotelPackageMatch.build(h,state.people,state.trip):null),unmatched=!!(match?.enabled&&!match.selectedOffer),offers=decisionOffers(h),facilityGaps=row.missing.filter(x=>!['budget','breakfast','freeCancel','twinBeds'].includes(x.key)),budget=row.budget,reference=referenceReady(row);
 const cls=unmatched?'unmatched':row.code==='excluded'||row.code==='over_reference_budget'?'excluded':row.formalEligible||reference?'ready':'pending';
 const label=unmatched?'未找到匹配套餐':row.code==='excluded'?'必要条件有冲突':row.code==='over_reference_budget'?'当前参考价超预算':reference?'参考价条件证据已齐，可生成选择':row.formalEligible?(h.demo?'满足演示条件':'资料显示满足要求'):match?.selectedOffer?'套餐已匹配 · 待核必要证据':'可继续核实';
 const pair='<div class="decision-prices">'+decisionPriceCell(offers[0],'ctrip',match)+decisionPriceCell(offers[1],'tongcheng',match)+'</div><p class="decision-price-note">'+E(decisionPriceNote(offers))+'</p>';
 const unmatchedPrice=offers.some(Boolean)?'<details class="decision-details nonmatching-packages"><summary>查看非匹配套餐参考价</summary>'+pair+'<p class="decision-muted">这些金额对应当前不满足或未核清要求的套餐，不代表所需套餐价格。</p></details>':'';
 const price=unmatched?'<div class="decision-no-package"><b>当前没有匹配报价</b><p>'+match.noMatchReasons.map(x=>E(x.label)).join('；')+'</p></div>':offers.some(Boolean)?pair:'<div class="decision-single-price"><strong>'+(budget.amount!=null?'¥'+E(budget.amount):'尚无本次价格')+'</strong><small>'+(budget.basis==='reference'?'参考价 / 间 / 晚':budget.basis==='verified'?(h.demo?'演示价 / 间 / 晚':'录入价 / 间 / 晚'):'')+'</small></div>';
 const budgetText=unmatched?'所需套餐预算尚不能判断':budget.within===true?(budget.basis==='reference'?'匹配套餐参考价在预算内':'房价在预算内'):budget.within===false?(budget.basis==='reference'?'参考价超出预算':'房价超出预算'):'暂不能判断预算';
 const known=row.known.filter(x=>!['opened','renovated',...((row.policy?.controlledKeys)||[])].includes(x.key)).slice(0,3);
 const room=h.room||'尚未选择具体房型',attempt=(h.collectionAttempts||[]).at(-1),attemptNote=attempt?.status==='no_quote'?'<p class="decision-muted">最近一次核价未取得报价；保留人工核对资料，旧价不用于本次比较。</p>':'';
 const details='<details class="decision-details"><summary>房型、来源与可选条件</summary>'+offers.filter(Boolean).map(o=>'<p><b>'+E(o.platform)+'</b> · '+E(o.room)+'<br>'+E(o.breakfastText)+' · '+E(o.cancellation)+' · '+E(o.payment||'付款未注明')+'</p>'+link(o.source,'打开平台原页 ↗')+'<p class="decision-muted">采集 '+E(new Date(o.capturedAt).toLocaleString('zh-CN'))+'</p>').join('')+row.known.filter(x=>['opened','renovated'].includes(x.key)).map(x=>'<p>'+E(x.label)+'</p>').join('')+(row.optionalUnknown.length?'<p class="decision-muted">以下是可选偏好，缺资料不阻断推荐：'+row.optionalUnknown.map(x=>E(x.label)).join('、')+'。</p>':'')+'<div class="decision-card-actions"><button class="text-button" data-action="edit-hotel" data-id="'+E(h.id)+'">编辑资料</button><button class="text-button" data-action="add-evidence" data-id="'+E(h.id)+'">补充评价</button></div></details>';
 const visibleConflicts=unmatched?row.conflicts.filter(x=>!['breakfast','freeCancel','twinBeds','budget'].includes(x.key)):row.conflicts;
 return '<article class="decision-card decision-'+cls+'" data-decision-hotel="'+E(h.id)+'"><div class="decision-card-title">'+decisionHotelTitle(h.name)+'<span class="decision-badge '+cls+'">'+label+'</span></div><p class="decision-room">'+(unmatched?'已采房型：':'')+E(room)+'</p>'+attemptNote+price+'<p class="decision-budget '+(!unmatched&&budget.within===false?'bad':'')+'">'+E(budgetText)+(budget.ceiling!=null?' · 上限 ¥'+E(budget.ceiling):'')+'</p>'+(visibleConflicts.length?'<div class="decision-conflict"><b>必要条件有冲突</b><p>'+visibleConflicts.map(x=>E(decisionConflictLabel(x))).join('；')+'</p></div>':'')+(known.length?'<ul class="decision-known">'+known.map(x=>'<li>'+E(x.label)+'</li>').join('')+'</ul>':'')+decisionPolicyHTML(row)+(facilityGaps.length?'<div class="decision-gap"><b>设施与体验缺 '+facilityGaps.length+' 项必要证据</b><p>'+facilityGaps.map(x=>E(x.label)).join('、')+'</p></div>':!row.formalEligible&&!unmatched&&!reference?'<p class="decision-gap">房价或必要套餐信息仍需核对。</p>':'')+(reference?'<p class="decision-muted">最终含税应付价与完整取消责任仍需预订前核对。</p>':'')+'<div class="decision-card-footer"><button class="text-button" data-action="evidence-hotel" data-id="'+E(h.id)+'">查看 '+(h.evidence||[]).length+' 条资料 ↗</button></div>'+unmatchedPrice+details+'</article>';
}
function decisionReviewStatus(rows){
 const excluded=rows.filter(r=>r.conflicts.some(c=>!r.hotel.packageMatch?.enabled||r.hotel.packageMatch.selectedOffer||!['budget','breakfast','freeCancel','twinBeds'].includes(c.key))||r.code==='over_reference_budget'&&(!r.hotel.packageMatch?.enabled||r.hotel.packageMatch.selectedOffer)),excludedIds=new Set(excluded.map(r=>r.hotel.id));
 const ready=rows.filter(r=>!excludedIds.has(r.hotel.id)&&(r.formalEligible||referenceReady(r))),readyIds=new Set(ready.map(r=>r.hotel.id));
 return {ready,excluded,pending:rows.filter(r=>!excludedIds.has(r.hotel.id)&&!readyIds.has(r.hotel.id))};
}
function decisionSearchConclusion(rows,status){
 const job=(typeof collectorJob==='undefined'?null:collectorJob)||state.clientCollection,validJob=job&&typeof collectorSameQuery==='function'&&collectorSameQuery(job.query)?job:null,search=validJob?.search;
 const paused=validJob&&['needs_login','needs_verification','needs_review'].includes(validJob.status),active=validJob&&['discovering','collecting','loading'].includes(validJob.status),failed=validJob?.status==='failed';
 const scope=E(state.trip.city)+' '+E(state.trip.checkin)+' — '+E(state.trip.checkout);
 let title='',detail='';
 if(status.ready.length===1){title='本次只有1家已确认符合当前选择范围';detail='先保留这1家；尚未找到第二家满足全部已选必要条件的候选，不凑备选。';}
 else if(status.ready.length>1){title='已有'+status.ready.length+'家符合当前选择范围';detail='必要条件按已核对资料逐项检查，参考价不是最终应付价。';}
 else if(rows.length){title='本次已查范围暂没有已确认符合的候选';detail='已排除'+status.excluded.length+'家明确冲突的候选；另'+status.pending.length+'家仍有必要信息待核实；未知不会计为满足。';}
 if(paused){detail+=(detail?' ':'')+'查找已暂停，需先处理登录、验证或页面核对，当前不是搜索结束。';}
 else if(active){detail+=(detail?' ':'')+'仍在检查下一批候选，以下是目前取得的记录。';}
 else if(failed){detail+=(detail?' ':'')+'本轮采集未完成，不能据此判断没有合适酒店。';}
 else if(search?.stopReason==='pool_exhausted'){detail+=(detail?' ':'')+'本次加载的候选池已检查完毕'+(search.poolSize!=null?'（'+E(search.poolSize)+'家）':'')+'，未遍历全城酒店。';}
 else if(search?.stopReason==='inspection_limit'){detail+=(detail?' ':'')+'已到本批检查上限'+(search.remainingPool>0?'，池内还有'+E(search.remainingPool)+'家可继续检查':'')+'；这不是全城搜索结果。'+(validJob?.query.searchGoal==='requirements_review'&&validJob.continuationReady?'条件齐全的候选不足2家时，会自动继续本次池。':'');}
 const canContinue=!paused&&!active&&(!validJob||failed||search?.stopReason!=='pool_exhausted'||search.remainingPool>0);
 return title?'<div class="decision-zero" role="status"><h3>'+title+'</h3><p>'+detail+'</p><p class="decision-muted">范围：'+scope+'；保留全部同行要求。</p>'+(!status.ready.length&&canContinue?'<button class="secondary" data-collector="CONTINUE_SELECTION">保留要求，继续找下一批 →</button>':'')+'</div>':'';
}
function decisionSummaryHTML(hotels){
 const rows=HotelDecisionSummary.build(hotels,state.people,state.trip),quoteRows=rows.filter(r=>r.hotel.packageMatch?.enabled),matched=quoteRows.filter(r=>r.hotel.packageMatch.selectedOffer).length,status=decisionReviewStatus(rows);
 const captures=hotels.flatMap(h=>(h.quoteBundle?.offers||[]).map(o=>Date.parse(o.capturedAt))).filter(Number.isFinite),first=captures.length?new Date(Math.min(...captures)):null,last=captures.length?new Date(Math.max(...captures)):null;
 const snapshot=first?'<p class="decision-snapshot">报价快照 · '+E(first.toLocaleString('zh-CN'))+' — '+E(last.toLocaleTimeString('zh-CN'))+'</p>':'';
 const noPackage=quoteRows.length&&!matched?'<p class="decision-muted">这轮没有找到符合要求的套餐：'+[...new Set(quoteRows.flatMap(r=>r.hotel.packageMatch.noMatchReasons.map(x=>x.label)))].slice(0,3).map(E).join('；')+'。这是本次已采范围的结果，不表示酒店没有其他套餐。</p>':'';
 const candidates=status.ready.length?status.ready:status.pending.filter(r=>!quoteRows.length||r.hotel.packageMatch?.selectedOffer),visible=candidates.slice(0,3),visibleSet=new Set(visible),archived=rows.filter(r=>!visibleSet.has(r));
 const cards=visible.length?'<div class="decision-grid decision-primary-grid">'+visible.map(decisionCardHTML).join('')+'</div>':'';
 const otherMatched=archived.filter(r=>r.hotel.packageMatch?.selectedOffer).length;
 const records=archived.length?'<details class="decision-details decision-checked-record"><summary>'+(!visible.length?'查看已查 '+archived.length+' 家与非匹配套餐记录':'其余已查记录（'+archived.length+' 家'+(otherMatched?'，其中套餐匹配 '+otherMatched+' 家':'')+'）')+'</summary><p class="decision-muted">已排除的候选只保留核对记录，不占主候选位；未匹配套餐不当作入住建议。</p><div class="decision-grid">'+archived.map(decisionCardHTML).join('')+'</div></details>':'';
 return '<div class="decision-heading"><div><h2>价格和结论，一眼看清</h2><p>本行程累计已查 '+rows.length+' 家 · 已排除 '+status.excluded.length+' 家 · 必要证据待核实 '+status.pending.length+' 家 · 已确认符合当前范围 '+status.ready.length+' 家</p>'+(quoteRows.length?'<p class="decision-muted">套餐匹配 '+matched+' 家；这个数字不等于所有必要条件已满足。</p>':'')+'</div><button class="text-button" data-action="preferences">调整同行要求 ↗</button></div>'+snapshot+decisionSearchConclusion(rows,status)+noPackage+cards+records+'<p class="decision-common-note">当前选择范围为房型页参考价和已确认必要条件，不下单付款。套餐匹配仅检查房型、所需早餐、免费取消窗口及参考预算；参考价不是最终应付价，不以不同套餐判定最低价。</p>';
}

// The archived collector's selectedForComparison flag is a package match, not
// a verdict on the whole hotel. Reuse the current target-room selection here.
collectorReferenceHTML=function(job){
 if(!collectorSameQuery(job.query))return '<p class="decision-muted">这份采集记录属于其他行程，不参与当前比较。</p>';
 const hotels=decisionScopedHotels().filter(h=>h.quoteBundle?.offers.length);
 const cell=o=>o?'<b>¥'+E(o.listNightly)+'</b><small>'+E(HotelPackageMatch.breakfastLabel(o))+'</small><small>'+E(o.cancellation)+'</small>':'未取得目标房型';
 return '<h3>当前目标房型的匹配结果</h3><p class="decision-muted">价格已取得和套餐可直接比价是两件事；以下与上方酒店卡片使用同一份房型资料。</p><div class="table-wrap"><table class="selection-table"><thead><tr><th>酒店与目标房型</th><th>携程参考价</th><th>同程参考价</th><th>已核对到哪里</th></tr></thead><tbody>'+hotels.map(h=>{const offers=decisionOffers(h);return '<tr><td><b>'+E(h.name)+'</b><small>'+E(h.room)+'</small></td><td>'+cell(offers[0])+'</td><td>'+cell(offers[1])+'</td><td>'+(!h.packageMatch.selectedOffer?'<b>非匹配套餐参考价</b><small>'+h.packageMatch.noMatchReasons.map(x=>E(x.label)).join('；')+'</small>':'')+E(decisionPriceNote(offers))+'</td></tr>';}).join('')+'</tbody></table></div><p class="decision-muted">均为已保存的每间每晚参考价；需要相同早餐、取消责任与税费口径才能判定哪个平台更便宜。酒店是否满足同行要求，见上方卡片。</p>';
};

const fullCollectorHTML=collectorHTML;
collectorHTML=function(){
 const job=collectorJob||state.clientCollection,active=collectorJob&&(collectorActive.includes(collectorJob.status)||collectorPaused.includes(collectorJob.status));
 const connected=collectorConnected?'已连接 '+E(collectorVersion):'未连接';
 const progress=active?'<div class="collector-job"><b>'+E(collectorJob.message)+'</b><p>'+E(collectorJob.progress.done)+' / '+E(collectorJob.progress.total)+' 步</p><button class="secondary" data-collector="FOCUS">查看平台页</button> '+(collectorPaused.includes(collectorJob.status)?'<button class="primary" data-collector="RESUME">处理后继续</button> <button class="secondary" data-collector="SKIP">跳过此页</button> ':'')+'<button class="text-button" data-collector="CANCEL">取消</button></div>':'';
 const search=job?.search,record=search?'本次检索已查 '+search.inspected+' 家 / 本次池 '+search.poolSize+' 家'+(Number.isInteger(search.roundInspected)?' · 本批 '+search.roundInspected+' 家':'')+(Number.isInteger(search.remainingPool)?' · 池内剩余 '+search.remainingPool+' 家':''):(job?.offers?.length||0)+'条已采套餐记录';
 return '<div class="collector-compact-line"><span class="collector-connection">携程 / 同程 · '+connected+'</span><span class="decision-muted">'+(job&&collectorSameQuery(job.query)?record:'填写行程后开始查价')+'</span></div>'+progress+(collectorError?'<p class="notice" role="alert">'+E(collectorError)+'</p>':'')+'<details class="decision-details collector-full-record"><summary>连接设置、采集状态与原始记录</summary>'+fullCollectorHTML()+'</details>';
};

const fullComparisonRender=renderCompare;
function decisionBrowserContextHTML(){
 if(state.mode!=='trip')return '';
 return '<div class="notice browser-trip-context"><b>当前浏览器行程：'+E(state.trip.city||'城市未设置')+' · '+E(state.trip.checkin||'入住未设置')+' — '+E(state.trip.checkout||'退房未设置')+' · '+E(state.trip.rooms||1)+'间 / '+E(state.trip.adults||state.people.length)+'成人</b><p>资料和同行偏好仅保存在此浏览器，不会自动同步其他浏览器；这里显示的是本浏览器保存的行程。</p></div>';
}
function decisionArchiveHTML(){
 if(state.mode!=='trip'||typeof HotelJourney==='undefined')return '';
 const history=HotelJourney.scope(state,{selection:false,includeHistory:true}).filter(h=>!HotelJourney.belongs(h,state.trip,state.people));
 return history.length?'<details class="decision-details historical-hotel-record"><summary>历史资料 '+history.length+' 家（未加入本次行程）</summary><p class="decision-muted">保留原资料和证据，不作为本次候选；重新加入会清空旧报价，需核对当前房价。</p><ul>'+history.map(h=>'<li><b>'+E(h.name)+'</b> <button class="text-button" data-action="evidence-hotel" data-id="'+E(h.id)+'">查看资料</button> <button class="text-button" data-action="join-history" data-id="'+E(h.id)+'">加入本次行程</button></li>').join('')+'</ul></details>':'';
}
renderCompare=function(){
 fullComparisonRender();
 const main=$('#main'),hotels=decisionScopedHotels();
 main.classList.add('decision-page');
 main.insertAdjacentHTML('afterbegin',decisionBrowserContextHTML());
 const banner=main.querySelector('.banner.info');if(banner)banner.remove();
 const summary=main.querySelector('.summary-line');
 if(summary)summary.innerHTML='<span><b>'+hotels.length+'</b>家候选</span><span><b>'+state.people.length+'</b>位同行人</span><span>'+E(state.trip.city)+' · '+E(state.trip.checkin)+' — '+E(state.trip.checkout)+'</span>';
 const search=main.querySelector('.discovery-panel');
 if(search){
  search.querySelector('h2').textContent='行程与查价';
  const intro=search.querySelector(':scope > p');if(intro)intro.remove();
  const history=search.querySelector('.saved-research');if(history)history.remove();
  const legal=search.querySelector('#discovery-form > .disclaimer');if(legal)legal.textContent='通过本机 Chrome 读取携程、同程页面；登录或验证码需要你处理。';
  if(hotels.length){const details=document.createElement('details');details.className='decision-details trip-search-details';details.innerHTML='<summary>修改行程或重新查价</summary>';search.before(details);details.append(search);}
 }
 if(hotels.length||state.mode==='trip'){const panel=document.createElement('section');panel.id='decision-results';panel.innerHTML=(hotels.length?decisionSummaryHTML(hotels):'<div class="decision-zero"><h2>本次行程还没有已绑定候选</h2><p>填写当前日期和人数后开始查找；历史手工资料未自动当作本次候选或报价。</p></div>')+decisionArchiveHTML();if(summary)summary.after(panel);else main.prepend(panel);}
 const rule=main.querySelector('.rule-preview');
 const intro=[...main.querySelectorAll('.section-intro')].find(e=>e.querySelector('h2')?.textContent==='本次候选，一起比较');
 if(intro){const table=intro.nextElementSibling,notice=table?.nextElementSibling;const details=document.createElement('details');details.className='decision-details all-fields-record';details.innerHTML='<summary>全部字段与规则计算</summary>';intro.before(details);if(rule)details.append(rule);details.append(intro);if(table)details.append(table);if(notice?.classList.contains('disclaimer'))details.append(notice);}
 const ai=main.querySelector('.ai-panel');
 if(ai){
  ai.querySelector('h2').textContent='AI 解读与下一步';
  const button=ai.querySelector('#ai-recommend');if(button&&!aiBusy)button.textContent=state.aiResult?'更新 AI 解读 →':'让 AI 整理选择与依据 →';
  const introText=ai.querySelector(':scope > .muted');if(introText)introText.remove();
  const consent=ai.querySelector(':scope > .disclaimer');if(consent)consent.textContent='AI分析主区最多3家候选；点击会将偏好、房型与评价资料发送至 OpenAI，引用失败时最多重试一次。';
  const status=ai.querySelector('.ai-status');if(status&&aiStatus?.authorized&&aiStatus?.configured)status.hidden=true;
 }
 const audit=main.querySelector('.audit-panel > summary');if(audit)audit.textContent='补充必要设施与公开资料';
 main.querySelectorAll('.flow-steps').forEach(e=>e.remove());
 const footer=main.querySelector('.footer-note');if(footer)footer.textContent='住一起 · 资料有依据，选择有取舍';
};
render();
