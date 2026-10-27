(function(root){
  'use strict';
  const amount=r=>r.total==null?r.listNightly:Math.round((r.total/(r.rooms*((Date.parse(r.checkOut)-Date.parse(r.checkIn))/86400000)))*100)/100;
  function comparison(a,b){
    const fields=['hotel','room','checkIn','checkOut','rooms','adults','children','currency','breakfast','cancellation','payment'];
    const differences=fields.filter(k=>a[k]!==b[k]);
    if(!a.taxConfirmed||!b.taxConfirmed)differences.push('tax');
    if(a.platform===b.platform)differences.push('samePlatform');
    if(a.total==null||b.total==null)differences.push('totalMissing');
    if(a.cashback||b.cashback)differences.push('cashback');
    return {comparable:differences.length===0,differences};
  }
  const api={amount,comparison};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HotelPriceCompare=api;
})(typeof window!=='undefined'?window:this);
