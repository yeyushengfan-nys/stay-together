// Only a failed public main-script URL is retained in this extension's isolated
// world. No request headers, cookies, fetch responses or platform globals are read.
(()=>{
 const failures=[];
 globalThis.__stayCollectorResourceFailures=failures;
 const mainScript=target=>{
  if(target?.tagName!=='SCRIPT')return null;
  try{const u=new URL(target.src);return u.origin==='https://file.40017.cn'&&/^\/js40017cnproduct\/cn\/h\/hotel_i18n_pc\/product\/_nuxt\/entry\.[\w.-]+\.js$/.test(u.pathname)?u.origin+u.pathname:null;}catch{return null;}
 };
 addEventListener('error',event=>{const src=mainScript(event.target);if(src&&!failures.some(f=>f.src===src))failures.push({src,at:Date.now()});},true);
 addEventListener('load',event=>{const src=mainScript(event.target),i=failures.findIndex(f=>f.src===src);if(i>=0)failures.splice(i,1);},true);
 let last=0,observer;
 function notify(){if(Date.now()-last<2000)return;last=Date.now();chrome.runtime.sendMessage({type:'PAGE_READY'},()=>void chrome.runtime.lastError);}
 function start(){chrome.runtime.sendMessage({type:'PAGE_READY'},reply=>{
  if(chrome.runtime.lastError||!reply?.watch||observer||!document.documentElement)return;
  observer=new MutationObserver(notify);observer.observe(document.documentElement,{childList:true,subtree:true});notify();
 });}
 start();
 if(document.readyState==='loading')addEventListener('DOMContentLoaded',start,{once:true});
})();
