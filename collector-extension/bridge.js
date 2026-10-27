(()=>{
 const ORIGIN='https://stay-together-yusi-1024.yusinn0613.chatgpt.site';
 if(location.origin!==ORIGIN)return;
 const allowed=new Set(['HELLO','START','STATUS','RESUME','SKIP','CANCEL','FOCUS','CLEAR']);
 let lastStart=0;
 window.addEventListener('message',event=>{
  const m=event.data;if(event.source!==window||event.origin!==ORIGIN||m?.channel!=='stay-collector-request'||!allowed.has(m.type)||typeof m.requestId!=='string'||m.requestId.length>100)return;
  if(m.type==='START'){if(Date.now()-lastStart<3000)return;lastStart=Date.now();}
  const request={type:m.type,jobId:m.jobId,...(m.type==='START'?{query:m.query}:{})};
  chrome.runtime.sendMessage(request,response=>{
   const error=chrome.runtime.lastError;
   window.postMessage({channel:'stay-collector-response',requestId:m.requestId,...(error?{ok:false,error:'采集助手连接失效，请重新加载扩展和页面。'}:response)},ORIGIN);
  });
 });
 window.postMessage({channel:'stay-collector-ready'},ORIGIN);
})();
