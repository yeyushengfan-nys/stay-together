'use strict';
(()=>{
 const output=document.getElementById('flyai-test-result'),button=document.getElementById('refresh-flyai-test');
 const targets=[{name:'上海新世界丽笙大酒店',address:'南京西路88号'},{name:'上海大酒店',address:'九江路505号'},{name:'上海国际饭店',address:'南京西路170号'},{name:'上海扬子饭店',address:'汉口路740号'}];
 const query={city:'上海',checkin:'2026-10-25',checkout:'2026-10-27',rooms:1,adults:2,targetHotels:targets};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function show(data,snapshot){
  const items=data.hotels||data.data?.itemList||[];
  const rows=targets.map(t=>{
   const h=items.find(x=>x.name===t.name),raw=h?.price_raw??h?.price??'',failure=data.missing?.find(x=>x.name===t.name);
   const safeAmount=/^(?:¥|￥)?\s*\d+(?:\.\d{1,2})?$/.test(String(raw));
   return `<tr><td>${esc(t.name)}<small>${esc(h?.address||t.address)}</small></td><td><strong>${safeAmount?esc(raw):'本次未取得匹配金额'}</strong><small>${safeAmount?'平台搜索金额 · 每晚／全程口径未说明':esc(failure?.reason||'平台未返回有效数字')} ${failure?.code?'（'+esc(failure.code)+'）':''}</small></td><td>房型、早餐、取消、税费未返回</td></tr>`;
  }).join('');
  output.innerHTML=`<p class="notice">${snapshot?'已保存的真实接口快照（打开页面未重新查价）':'刚刚从网站后台实时查询'} · ${esc(new Date(data.retrieved_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))} 北京时间</p><p>请求日期：2026-10-25 → 2026-10-27；1间／2成人为本案例设定，接口未确认人数适用范围。完整可比报价：0条。</p><div class="price-table-wrap"><table class="price-table"><thead><tr><th>酒店</th><th>接口原样金额（人民币）</th><th>缺少的预订条件</th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted">没有乘除晚数，没有套用历史房型，也没有把搜索金额送进推荐或预算判断。此处未自动调用携程、同程或去哪儿。</p>`;
 }
 fetch('/flyai-shanghai-test.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>show(d,true)).catch(()=>{output.textContent='已保存记录暂时无法加载，可以重新查询。';});
 button.addEventListener('click',async()=>{
  button.disabled=true;button.textContent='正在查询飞猪官方接口…';output.textContent='正在核对四家酒店的名称、地址和搜索金额…';
  try{
   const r=await fetch('/api/hotel-prices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(45000)}),d=await r.json();
   if(!r.ok)throw Error(d.error?.message||'此次未完成查询。');show(d,false);
  }catch(e){output.textContent=e.name==='TimeoutError'?'本次查询超时，未使用旧价格替代。':e.message||'此次未完成查询。';}
  finally{button.disabled=false;button.textContent='重新查询这四家酒店 →';}
 });
})();
