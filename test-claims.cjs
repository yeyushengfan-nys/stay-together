const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={module:{exports:{}}};vm.runInNewContext(fs.readFileSync('public/claims.js','utf8'),ctx);const {suggest}=ctx.module.exports;
const cases=JSON.parse(fs.readFileSync('tests/claims-cases.json','utf8'));let fields=0;
for(const c of cases){const actual=suggest(c.text,{room:c.room,hotelName:c.hotelName,hotelNames:c.hotelNames});for(const[k,v]of Object.entries(c.expected)){assert.equal(actual.claims[k],v,c.text+' → '+k);fields++;}}
console.log(`${cases.length} local-hint cases / ${fields} labeled fields passed. These are regression fixtures, not a population accuracy estimate.`);
