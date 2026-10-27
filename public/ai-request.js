// Request lifecycle only. No retries, credentials, or application state writes.
(function (root) {
  'use strict';
  const deadlines = {recommend:125000, extract:110000, research:220000, discover:220000, audit:230000};
  class AIRequestError extends Error {
    constructor(code, message, details = {}) {super(message);this.name='AIRequestError';this.code=code;Object.assign(this,details);}
  }
  function createClient({fetcher=(...args)=>root.fetch(...args),now=()=>Date.now(),setTimer=(fn,ms)=>root.setTimeout(fn,ms),clearTimer=id=>root.clearTimeout(id),Controller=root.AbortController}={}) {
    const active = new Map();let sequence=0;
    const problem=(code,message,details)=>new AIRequestError(code,message,details);
    function state(group='recommend') {
      const entry=active.get(group);
      return entry?{id:entry.id,group,action:entry.action,mode:entry.mode,elapsed_ms:Math.max(0,now()-entry.started),timeout_ms:entry.timeoutMs,cancelled:entry.stopReason?.code==='ai_cancelled'}:null;
    }
    function cancel(group='recommend') {
      const entry=active.get(group);if(!entry)return false;
      entry.stop(problem('ai_cancelled','已停止本次等待，原有资料和结果已保留。已发出的后台处理可能继续，请勿连续重试。'));return true;
    }
    async function request(action,body,{group=action,timeoutMs=deadlines[action]||125000,mode=body?.mode||'trip'}={}) {
      if(active.has(group))throw problem('ai_request_busy','本次分析仍在进行，请等待或先取消。');
      if(!Number.isFinite(timeoutMs)||timeoutMs<=0)timeoutMs=deadlines[action]||125000;
      const controller=new Controller(),entry={id:++sequence,group,action,mode,started:now(),timeoutMs,stopReason:null};
      let rejectControl;
      const control=new Promise((_,reject)=>{rejectControl=reject;});
      entry.stop=error=>{if(entry.stopReason)return;entry.stopReason=error;rejectControl(error);controller.abort();};
      active.set(group,entry);
      const timeoutError=()=>problem('ai_timeout','本次等待已超时，原有资料和结果已保留。可以重新尝试。');
      const timer=setTimer(()=>entry.stop(timeoutError()),timeoutMs);
      const work=(async()=>{
        const response=await fetcher('/api/ai/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
        let data;try{data=await response.json();}catch(error){if(entry.stopReason)throw entry.stopReason;throw problem('ai_invalid_response','后台没有返回完整有效的结果，本次未应用，可以重试。');}
        if(entry.stopReason)throw entry.stopReason;
        if(active.get(group)!==entry)throw problem('ai_stale_response','这条结果已过期，本次未应用。');
        if(now()-entry.started>=timeoutMs)throw timeoutError();
        if(!response.ok){const code=data?.error?.code||'ai_request_failed';const message=code==='unverified_citation'?'引用无法核对，本次未更新。原有结果已保留，可重新尝试。':data?.error?.message||'AI 请求未完成，原有结果已保留。';throw problem(code,message,{attempts:data?.error?.attempts||[]});}
        if(data?.mode!=='real_model')throw problem('ai_invalid_response','未收到真实模型结果，本次未应用。');
        return {...data,elapsed_ms:Math.round(Math.max(0,now()-entry.started))};
      })();
      try{return await Promise.race([work,control]);}
      catch(error){
        if(error instanceof AIRequestError)throw error;
        if(entry.stopReason)throw entry.stopReason;
        throw problem('ai_network_error','连接 AI 时出现网络问题，原有资料和结果已保留。可以重试。');
      }finally{
        clearTimer(timer);
        if(active.get(group)===entry)active.delete(group);
      }
    }
    return {request,cancel,state,cancelAll(){for(const group of [...active.keys()])cancel(group);}};
  }
  const api={createClient,AIRequestError,deadlines};
  root.HotelAIRequest=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
