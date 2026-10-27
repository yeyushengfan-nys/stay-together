// Conservative local hints. This is not the vision model; unknown is deliberate.
(function(root){
  function suggest(text,options={}){
    const claims={smart:null,laundry:null,mold:null,opened:null},notes=[],votes={smart:[],laundry:[],mold:[],opened:[]},uncertain=new Set();
    const t=String(text||'').replace(/[ \t\r]+/g,'');
    const hotelNames=(options.hotelNames||[]).filter(n=>n&&n!==options.hotelName);
    if(/(?:酒店[AB甲乙]|[AB甲乙]酒店|[AB]家)/i.test(t)||hotelNames.some(n=>t.includes(n))){return{claims,notes:['涉及多家酒店，无法可靠归属；所有字段保留待确认。']};}
    const ambiguous=/是否|有没有|不清楚|不确定|未确认|没查到|未查到|听说|据说|可能|也许|好像|没有说|没说|未说|不是没有|并非没有|不能说没有|不代表没有|不一定|未必|不准确|不实|声称|宣传|没有不|不是不|并非不/;
    const fields={smart:/智能马桶|智能坐便/,laundry:/洗衣|洗烘|代洗/,mold:/霉味|潮味/,opened:/开业|开张/};
    const roomTypes=[...new Set((t.match(/行政套房|行政大床房|行政房|基础房|普通房|豪华大床房|豪华房|套房/g)||[]).map(r=>r.includes('套房')?'套房':r))];
    const scopeUnclear=roomTypes.length>1||(roomTypes.length===1&&(!options.room||!String(options.room).includes(roomTypes[0])));
    for(const sentence of t.split(/[。！？!?；;\n]+/).filter(Boolean)){
      const relevant=Object.keys(fields).filter(k=>fields[k].test(sentence));
      if(ambiguous.test(sentence)||/[?？]/.test(sentence)) {for(const k of relevant)uncertain.add(k);continue;}
      for(const k of relevant){if(k!=='opened'&&scopeUnclear){uncertain.add(k);continue;}
        if(k==='smart'){
          if(/(?:没有|没配|未配|不配备|不提供|不是|并非|不含|无).{0,4}(?:智能马桶|智能坐便)/.test(sentence))votes.smart.push(false);
          else if(/(?:有|配备|配置|带|提供|安装|使用).{0,3}(?:智能马桶|智能坐便)/.test(sentence))votes.smart.push(true);
          else uncertain.add(k);
        }
        if(k==='laundry'){
          if(/(?:仅|只有|会员|套餐|限时|每次|每天.{0,3}件|烘干.{0,4}收费)/.test(sentence)){uncertain.add(k);continue;}
          const serviceText=sentence.replace(/不收费|无需付费|不用付费|不需要付费/g,'免费');
          const negative=/(?:没有|无|不设|不提供).{0,4}(?:自助洗衣|洗衣房|自助洗衣机)|(?:不是|并非|不提供|没有|无|非).{0,2}免费(?:自助)?洗衣|(?:不免费|收费|付费)/.test(serviceText);
          const positiveText=serviceText.replace(/(?:不是|并非|不提供|没有|无|非).{0,2}免费(?:自助)?洗衣(?:房|机)?/g,'');
          const positive=/免费(?:(?!代洗|没有|不是|收费|付费).){0,8}自助洗衣|自助洗衣(?:房|机)?(?:可|可以|是|为|完全|全程|提供|使用|服务|均|都){0,4}免费/.test(positiveText);
          // Contrasting service types or qualifications need human confirmation.
          if(negative&&positive)uncertain.add(k);else if(negative)votes.laundry.push(false);else if(positive)votes.laundry.push(true);else uncertain.add(k);
        }
        if(k==='mold'){
          const neg=/(?:没有|没|未|无)(?:有|闻到|闻见|发现|出现)?(?:明显|任何|一点|什么)?(?:的)?(?:霉味|潮味)/.test(sentence);
          const cleaned=sentence.replace(/(?:没有|没|未|无)(?:有|闻到|闻见|发现|出现)?(?:明显|任何|一点|什么)?(?:的)?(?:霉味|潮味)/g,'');
          const pos=/(?:有|闻到|闻见|出现|一股|存在).{0,4}(?:霉味|潮味)/.test(cleaned);
          if(neg)votes.mold.push(false);if(pos)votes.mold.push(true);if(!neg&&!pos)uncertain.add(k);
        }
        if(k==='opened'){
          if(/(?:不是|并非|不在|未在).{0,4}(?:20\d{2}|19\d{2})年/.test(sentence)){uncertain.add(k);continue;}
          const years=[...sentence.matchAll(/(20\d{2}|19\d{2})年(?:正式|开始|新)?(?:开业|开张)/g)].map(m=>Number(m[1]));
          if(years.length)votes.opened.push(...years);else uncertain.add(k);
        }
      }
    }
    for(const k of Object.keys(claims)){const vs=[...new Set(votes[k])];if(!uncertain.has(k)&&vs.length===1)claims[k]=vs[0];else if(uncertain.has(k)||vs.length>1)notes.push(({smart:'智能马桶',laundry:'免费自助洗衣',mold:'潮味／霉味',opened:'开业年份'})[k]+'：涉及限定、疑问、房型差异或冲突，保留待确认。');}
    return{claims,notes};
  }
  const api={suggest};if(typeof module!=='undefined')module.exports=api;root.HotelClaims=api;
})(typeof globalThis!=='undefined'?globalThis:this);
