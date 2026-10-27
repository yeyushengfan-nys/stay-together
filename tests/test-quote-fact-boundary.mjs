import assert from 'node:assert/strict';
import {canonicalQuoteAssessment,constrainedRecommendationSchema} from '../lib/hotel-ai.mjs';
const common={hotel:'Test',room:'Twin',checkIn:'2026-12-24',checkOut:'2026-12-28',rooms:1,adults:2,capturedAt:'2026-10-26T07:45:00Z',cancellation:'入住当天18:00前可免费取消',payment:'未注明'};
const h={id:'h',quoteBundle:{selected_offer_id:'ct',offers:[{...common,id:'ct',provider:'ctrip',platform:'携程',listNightly:230,breakfastText:'2份早餐'},{...common,id:'tc',provider:'tongcheng',platform:'同程',room:'King',listNightly:190,breakfastText:'1份早餐'}]}};
const a=canonicalQuoteAssessment(h);
assert(a.explanation.includes('同程：King；房型页参考价人民币190元／每间每晚；早餐原文「1份早餐」'));
assert(!a.explanation.includes('同程：Twin'));
assert(a.explanation.includes('不能把这些金额直接相减'));
for(const c of a.citations){const o=h.quoteBundle.offers.find(o=>globalThis.StayQuoteEvidence.sourceId('h',o)===c.source_id);assert(globalThis.StayQuoteEvidence.text(o).includes(c.quote));}
const s=constrainedRecommendationSchema({hotels:[h]},[{hotel_id:'h',blocked:[],unknown:['smart']}]);
assert.equal(s.properties.summary.enum.length,1);
assert.equal(s.properties.not_selected.maxItems,0);
assert.deepEqual(s.properties.offer_assessments.items.anyOf[0].properties.explanation.enum,[a.explanation]);
assert.equal(s.properties.offer_assessments.items.anyOf[0].properties.citations.minItems,2);
console.log('PASS cross-room price/breakfast cannot be rewritten in package display schema; empty eligibility cannot generate an affirmative summary or alternative.');
