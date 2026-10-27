'use strict';
(()=>{
 const box=document.getElementById('client-records-content');
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const yuan=n=>'¥'+Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
 fetch('/client-price-records.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
  box.innerHTML='<div class="client-price-grid">'+data.records.map(r=>`<article class="help-box"><span class="tag real">${safe(r.platform)} · ${r.stage==='checkout_preview'?'已核对结算前页面':'房型列表，未核对结算总额'}</span><h3>${safe(r.hotel)} · ${safe(r.room)}</h3><p>${safe(r.bed)}；套餐标注 ${r.breakfast} 份早餐；1间／2成人</p><strong class="matrix-price">${r.total!=null?'两晚房费 '+yuan(r.total):'页面均价 '+yuan(r.listNightly)+'／间晚'}</strong><p>${r.total!=null?'均价 '+yuan(r.nightly)+'／间晚；房费总额不含担保金。':'两晚结算前总额本轮未取得，未用均价乘晚数冒充已核实总额。'}</p><p><b>取消：</b>${safe(r.cancellation)}</p><p><b>支付：</b>${safe(r.payment)}</p>${r.guarantee?'<p>另需在线担保 '+yuan(r.guarantee)+'，不重复加进房费。</p>':''}${r.cashback?'<p class="cashback">返现单列 '+yuan(r.cashback)+'；页面另列到店付款 '+yuan(r.displayedPayment)+'，房费明细仍是 '+yuan(r.total)+'。领取细则未展开，不重复扣减。</p>':r.listAfterCashback!=null?'<p class="cashback">另标返现后均价 '+yuan(r.listAfterCashback)+'；领取条件尚未展开，不当作无条件立减。</p>':''}<p class="muted">税费口径未独立核实；可能含账户专享条件。记录时间：${safe(new Date(r.capturedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))}（北京时间）</p><details><summary>查看原始依据与采集方式</summary><blockquote>${safe(r.evidence)}</blockquote><p class="muted">${safe(r.captureMethod)}</p></details></article>`).join('')+'</div><p class="notice">两平台房费明细均为两晚¥2718，均已取得房型、早餐和取消原文。取消表述、返现条件及税费核实状态仍有差别，不能直接标为同条件最低价。</p>';
 }).catch(()=>{box.textContent='客户端记录暂时无法加载，请重试。';});
})();
