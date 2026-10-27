'use strict';
let livePriceBusy=false,livePriceResult=null,livePriceError='';
const livePriceBefore=renderCompare;
function livePriceFingerprint(){return JSON.stringify({query:discoveryQuery(),people:state.people});}
renderCompare=function(){
 livePriceBefore();if(state.mode!=='trip')return;
 const panel=document.createElement('section');panel.className='panel live-price-panel';
 const result=livePriceResult?.fingerprint===livePriceFingerprint()?livePriceResult.data:null;
 panel.innerHTML=`<div class="eyebrow">自动查价 · 正式报价接入中</div><h2>按行程自动查询酒店数据</h2><p>沿用上方城市、入住退房日期和同行偏好，无需提前输入酒店名。现阶段尚未开通可比房型报价；普通订房账号登录不会自动给网站API权限。</p><p class="notice">自动比价尚未完成。此入口用于数据接口联调；不会把历史快照、脱敏价或搜索起价当作实时房费。</p><button type="button" class="secondary" id="live-price-query" ${livePriceBusy?'disabled':''}>${livePriceBusy?'正在请求数据服务…':'按当前行程检查自动查价连接 →'}</button> <a class="quote-source" href="/prices" target="_blank" rel="noopener noreferrer">查看已核对的上海人工查价记录 ↗</a><div aria-live="polite" id="live-price-result">${livePriceError?'<p class="notice">'+E(livePriceError)+'</p>':''}${result?`<p>${E(result.message)}</p><p class="muted">本次只调用：${result.platforms_called.map(E).join('、')}；未调用：${result.platforms_not_called.map(E).join('、')}。完整可比报价：${result.offers.length}条。</p>${result.hotels.map(h=>`<article class="help-box"><b>${E(h.name)}</b><p>${E(h.address)}</p><p>${h.price_status==='masked'?'平台返回脱敏价格 '+E(h.price_raw)+'，不能还原具体金额':h.reference_price!==null?'平台搜索参考价 ¥'+h.reference_price+'，不是已核实的本次房型房费':'平台未返回价格'}</p><p class="muted">房型、人数适用范围、早餐、取消和税费尚未由此接口确认，不进入推荐或预算判断。</p>${link(h.source,'查看平台原始信息 ↗')}</article>`).join('')}`:''}</div>`;
 const audit=document.querySelector('.audit-panel');if(audit)audit.before(panel);else $('#main').append(panel);
};
document.addEventListener('click',async e=>{
 if(e.target.id!=='live-price-query'||livePriceBusy)return;
 const query=discoveryQuery(),fp=livePriceFingerprint();
 livePriceBusy=true;livePriceError='';livePriceResult=null;render();
 try{
  const response=await fetch('/api/hotel-prices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,people:state.people.map(p=>({budget:p.budget,conditions:p.conditions}))}),signal:AbortSignal.timeout(30000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'自动查价暂时未完成。');
  livePriceResult={fingerprint:fp,data};
 }catch(err){livePriceError=err.name==='TimeoutError'?'本次查询超时，没有用旧价格替代。':err.message||'自动查价暂时未完成。';}
 finally{livePriceBusy=false;if(view==='compare')render();}
});
render();
