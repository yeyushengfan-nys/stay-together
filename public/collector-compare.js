(function(root){
 'use strict';
 const clean=s=>String(s||'').replace(/\s/g,'');
 function policy(text,total){
  const s=clean(text),m=s.match(/订单确认(?:后)?(\d+)分钟内(?:可)?免费取消/);
  if(!m||/不(?:可|能)免费取消/.test(s))return null;
  const fee=[...s.matchAll(/(?:收取|扣除)[^。；;]{0,15}?[¥￥]([\d,.]+)/g)].map(m=>Number(m[1].replace(/,/g,'')));
  const full=/扣除全部金额|收取全部金额|(?:收取|扣除)[^。；;]{0,10}(?:全款|全额)/.test(s)||fee.some(n=>Number.isFinite(total)&&Math.abs(n-total)<.02);
  const refund=/未确认|不确认/.test(s)&&/全额退款/.test(s);
  return full&&refund?{windowMinutes:Number(m[1]),after:'full_charge',beforeConfirmation:'full_refund'}:null;
 }
 function payment(text){return /到店付|现付/.test(text)?'pay_at_hotel':/担保/.test(text)?'guarantee':/线上预付|在线付|在线支付|预付房费/.test(text)?'online_prepaid':null;}
 function compare(a,b){
  const differences=[];for(const key of ['hotel','room','checkIn','checkOut','rooms','adults','children','currency'])if(a[key]!==b[key])differences.push(key);
  if(a.provider===b.provider)differences.push('samePlatform');
  if(!a.totalBasisConfirmed||!b.totalBasisConfirmed||!Number.isFinite(a.total)||!Number.isFinite(b.total)||a.stage!=='checkout_preview'||b.stage!=='checkout_preview')differences.push('checkoutTotal');
  if(a.breakfast!==b.breakfast||!a.breakfastConfirmed||!b.breakfastConfirmed)differences.push('breakfast');
  if(!a.bed||!b.bed||clean(a.bed)!==clean(b.bed))differences.push('bed');
  const ap=policy(a.cancellation,a.total),bp=policy(b.cancellation,b.total);
  if(!ap||!bp||JSON.stringify(ap)!==JSON.stringify(bp))differences.push('cancellation');
  const am=payment(a.payment),bm=payment(b.payment);if(!am||am!==bm)differences.push('payment');
  if(a.cashback||b.cashback)differences.push('cashback');
  if(!a.capturedAt||!b.capturedAt||!Number.isFinite(Date.parse(a.capturedAt))||!Number.isFinite(Date.parse(b.capturedAt))||Math.abs(Date.parse(a.capturedAt)-Date.parse(b.capturedAt))>10*60000)differences.push('captureTime');
  const comparable=differences.length===0,lower=comparable?(a.total<=b.total?a:b):null,higher=comparable?(a.total>b.total?a:b):null;
  return {comparable,differences,scope:'displayed_checkout_total',lower,higher,saving:comparable?Math.round((higher.total-lower.total)*100)/100:null,policy:comparable?ap:null,taxConfirmed:a.taxConfirmed===true&&b.taxConfirmed===true,caveats:['仅比较当前登录账号显示的订单预览总额，不代表全网最低价','会员、连住等优惠资格随账号变化','税费未单独核实；额外收费及实际支付以下单页为准']};
 }
 function pairs(rows){const found=[];for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const p=compare(rows[i],rows[j]);if(p.comparable)found.push(p);}return found;}
 root.StayCollectorCompare={compare,pairs,policy,payment};
})(typeof window!=='undefined'?window:globalThis);
