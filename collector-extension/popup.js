function show(r){const j=r?.job;document.getElementById('status').textContent=!r?.ok?(r?.error||'连接失败'):j?j.query.city+' '+j.query.checkin+' → '+j.query.checkout+'\n'+j.message+'\n已取得 '+j.offers.length+' 条套餐':'尚未开始采集。在网站点击“自动采集客户端房价”。';}
chrome.runtime.sendMessage({type:'STATUS'},show);
document.addEventListener('click',e=>{const type=e.target.dataset.command;if(type)chrome.runtime.sendMessage({type},show);});
