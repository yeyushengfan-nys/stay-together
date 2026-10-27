// Analyze an exported backup without opening the browser or calling an API.
// Usage: node scripts/summarize-collection.mjs BACKUP.json [BASELINE.json]
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const [file,baseline]=process.argv.slice(2);
if(!file){console.error('Usage: node scripts/summarize-collection.mjs BACKUP.json [BASELINE.json]');process.exit(1);}
const data=JSON.parse(await readFile(file,'utf8')),job=data.clientCollection;
if(!job?.query||!Array.isArray(job.offers))throw Error('备份中没有采集任务。');
const ctx={window:{}};vm.createContext(ctx);
for(const path of ['collector-compare.js','reference-prices.js'])vm.runInContext(await readFile(new URL('../public/'+path,import.meta.url),'utf8'),ctx);
const R=ctx.window.StayReferencePrices,C=ctx.window.StayCollectorCompare;
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const unchanged=baseline?JSON.stringify(stable(data.people))===JSON.stringify(stable(JSON.parse(await readFile(baseline,'utf8')).people)):null;
const reference=R.build(job),primary=job.query.platforms.includes('ctrip')?'ctrip':job.query.platforms[0];
const primaryNames=[...new Set((job.candidates||[]).filter(c=>c.provider===primary).map(c=>c.canonicalName||c.name))];
const complete=job.offers.filter(o=>o.totalBasisConfirmed&&o.stage==='checkout_preview'),fullPairs=C.pairs(job.offers);
const brief=o=>o?{provider:o.provider,room:o.room,breakfast:o.breakfastText,cancellationHint:o.cancellation,paymentHint:o.payment,nightlyReference:o.listNightly,passedRoomFilters:!o.referenceFallback,capturedAt:o.capturedAt,source:o.source}:null;
const report={
 schemaVersion:1,query:job.query,status:job.status,progress:job.progress,
 durationMs:job.updatedAt-job.createdAt,startedAt:new Date(job.createdAt).toISOString(),finishedAt:new Date(job.updatedAt).toISOString(),
 plannedHotelPlatformPairs:primaryNames.length*job.query.platforms.length,
 roomPlansRead:job.offers.length,displayedRoomReferencePrices:reference.prices,
 referenceHotelsPassingRoomFiltersAndMatchingRoomMeal:reference.aligned,
 completeCheckoutQuotes:complete.length,fullyComparableHotels:new Set(fullPairs.map(p=>p.lower.hotel)).size,
 fullCheckoutVerification:job.query.priceMode==='reference'?'not_in_scope':'performed_where_available',
 decisionVerification:'not_assessed_by_this_price_collection_test',
 peopleUnchanged:unchanged,errors:job.errors||[],
 interventionAudit:'Backup does not contain a full pause/resume history. Do not infer zero human intervention from completed status alone.',
 definitions:{
  reference:'房型页每间每晚展示价；不是最终应付价，不推算全程总额。',
  referenceAligned:'两边选中套餐通过本次房型筛选，且酒店、房型名称、早餐对应；不代表完整取消、付款及税费条件已核验。',
  complete:'订单预览明确回传且已核对的全程房费总额。',
  decision:'单独验证AI推荐与全部必要条件，本报告不以取得价格代替决策通过。'
 },
 hotels:reference.rows.map(r=>({hotel:r.name,referenceOffers:[brief(r.ct),brief(r.tc)].filter(Boolean),qualifiedRoomMealAligned:r.aligned,referenceNightlyDifference:r.nightlyDifference,withinReferenceBudget:r.withinReferenceBudget}))
};
console.log(JSON.stringify(report,null,2));
