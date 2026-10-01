import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {ClaimService} from '../src/claims.mjs';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
let architectureViolations=0;
for(const file of ['src/claims.mjs','src/store.mjs']){
  const text=fs.readFileSync(file,'utf8');
  for(const line of text.split('\n'))if(/import\s[^;]*from\s*['"]\.\.[/'"]/.test(line))architectureViolations++;
}
const source=fs.readFileSync('src/claims.mjs','utf8');
const started=performance.now();
for(let i=0;i<10000;i++)new ClaimService({read:()=>null,write:x=>x});
const sampleLatencyMs=performance.now()-started;
const observedAt=new Date().toISOString();
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'src layering rule, eval rule and 10000 local constructor operations',observedAt,provenance:{source:'derived',tool:'node:perf_hooks local timing',generatedAt:observedAt},metrics:{architectureViolations,unsafeEvalOccurrences:(source.match(/\beval\s*\(/g)??[]).length,sampleLatencyMs}}));
