import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {quote} from './business.mjs';
let raw='';for await(const part of process.stdin)raw+=part;
const request=JSON.parse(raw);
const source=fs.readFileSync('business.mjs','utf8');
const started=performance.now();
for(let i=0;i<1000;i++)quote({amount:i,currency:'USD'});
const metrics={
 architectureViolations:(source.match(/from\s+['"]\.\.\/legacy/g)??[]).length,
 unsafeEvalOccurrences:(source.match(/\beval\s*\(/g)??[]).length,
 sampleLatencyMs:performance.now()-started
};
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'metrics-demo/runner.mjs',metrics}));
