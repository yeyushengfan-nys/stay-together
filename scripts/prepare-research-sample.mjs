import {readFile,writeFile} from 'node:fs/promises';
import {sanitizeResearch} from '../lib/hotel-research.mjs';
const d=JSON.parse(await readFile('../tmp/beijing-research-live.json','utf8'));
sanitizeResearch(d.result,d.sources,d.names,d.city);
const used=new Set(d.result.hotels.flatMap(h=>[...h.items.flatMap(i=>i.source_ids),...h.coverage.flatMap(c=>c.source_ids)]));
const publicData={result:d.result,sources:d.sources.filter(s=>used.has(s.id)),names:d.names,city:d.city,model:d.model,mode:d.mode,retrieved_at:d.retrieved_at,search_call_count:d.search_call_count,source_note:d.source_note};
await writeFile('public/beijing-research.json',JSON.stringify(publicData,null,2));console.log(JSON.stringify({sampleReady:true,hotels:publicData.result.hotels.map(h=>({name:h.name,items:h.items.length,platforms:h.coverage.length})),sourceCount:publicData.sources.length}));
