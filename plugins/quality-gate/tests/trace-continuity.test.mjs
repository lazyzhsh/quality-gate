import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {run,validate} from '../lib/kernel.mjs';import {failureReasons} from '../lib/summary.mjs';
const source=fileURLToPath(new URL('../examples/trace-continuity-demo',import.meta.url));
function project(t,fault){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-trace-'));t.after(()=>fs.rmSync(root,{recursive:true}));
 fs.cpSync(source,root,{recursive:true});
 if(fault){
  const configPath=path.join(root,'.quality-gate.json'),config=JSON.parse(fs.readFileSync(configPath,'utf8'));
  config.gates[0].argv.push(fault);
  fs.writeFileSync(configPath,JSON.stringify(config));
 }
 return root;
}
const gate=result=>result.evidence[0];
const failingLink=(result,call)=>gate(result).details.links.find(link=>link.call===call);
const rules=(result,call)=>failingLink(result,call).problems.map(problem=>problem.rule);

test('continuous propagation across both declared links passes with traceparent required',t=>{
 const result=run(project(t));
 assert.equal(result.status,'PASS',JSON.stringify(gate(result)));
 assert.deepEqual(gate(result).details.links.map(link=>link.status),['PASS','PASS']);
 assert.equal(gate(result).details.requireTraceparent,true);
 assert.deepEqual(gate(result).details.extraLinks,[]);
});

test('dropped context fails named link with a new trace id',t=>{
 const result=run(project(t,'drop-context'));
 assert.equal(result.status,'FAIL');
 assert.equal(failingLink(result,'gateway->orders').status,'FAIL');
 assert.ok(rules(result,'gateway->orders').includes('trace-id-discontinuity'));
 assert.equal(failingLink(result,'orders->payments').status,'PASS');
});

test('wrong parent span id fails the span chain of the named link',t=>{
 const result=run(project(t,'wrong-parent-span'));
 assert.equal(result.status,'FAIL');
 assert.ok(rules(result,'gateway->orders').includes('span-id-mismatch'));
});

test('swallowed downstream call fails as a missing propagation record',t=>{
 const result=run(project(t,'skip-payments'));
 assert.equal(result.status,'FAIL');
 assert.deepEqual(rules(result,'orders->payments'),['missing-link']);
 assert.ok(failureReasons(gate(result)).some(reason=>reason.includes('断链 orders->payments（missing-link）')),JSON.stringify(failureReasons(gate(result))));
});

test('malformed traceparent header surfaces its own rule beside the lost context',t=>{
 const result=run(project(t,'bad-traceparent'));
 assert.equal(result.status,'FAIL');
 assert.ok(rules(result,'gateway->orders').includes('invalid-traceparent'));
 assert.ok(rules(result,'gateway->orders').includes('trace-id-discontinuity'));
});

const fakeRunner=(root,propagation)=>fs.writeFileSync(path.join(root,'runner.mjs'),`let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input);
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'synthetic drill',propagation:${JSON.stringify(propagation)}}));
`);
const T='a'.repeat(32),S='b'.repeat(16),C='c'.repeat(16),OTHER='d'.repeat(32);

test('requireTraceparent fails a continuous pair that omits the header',t=>{
 const root=project(t);
 fakeRunner(root,[{call:'gateway->orders',parent:{service:'gateway',traceId:T,spanId:S},child:{service:'orders',traceId:T,spanId:C,parentSpanId:S}}]);
 const result=run(root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(rules(result,'gateway->orders'),['missing-traceparent']);
});

test('a well-formed but inconsistent traceparent fails as a mismatch without breaking ids',t=>{
 const root=project(t);
 fakeRunner(root,[{call:'gateway->orders',parent:{service:'gateway',traceId:T,spanId:S},child:{service:'orders',traceId:T,spanId:C,parentSpanId:S},traceparent:`00-${OTHER}-${S}-01`}]);
 const result=run(root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(rules(result,'gateway->orders'),['traceparent-mismatch']);
});

test('undeclared reported pairs land in the audit face without failing',t=>{
 const root=project(t);
 const extra={call:'orders->audit',parent:{service:'orders',traceId:T,spanId:S},child:{service:'audit',traceId:T,spanId:C,parentSpanId:S},traceparent:`00-${T}-${S}-01`};
 fakeRunner(root,[
  {call:'gateway->orders',parent:{service:'gateway',traceId:T,spanId:S},child:{service:'orders',traceId:T,spanId:C,parentSpanId:S},traceparent:`00-${T}-${S}-01`},
  {call:'orders->payments',parent:{service:'orders',traceId:T,spanId:C},child:{service:'payments',traceId:T,spanId:'e'.repeat(16),parentSpanId:C},traceparent:`00-${T}-${C}-01`},
  extra
 ]);
 const result=run(root);
 assert.equal(result.status,'PASS',JSON.stringify(gate(result)));
 assert.deepEqual(gate(result).details.extraLinks,['orders->audit']);
});

test('stale observation fails closed',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'runner.mjs'),`console.log(JSON.stringify({schemaVersion:'0.1',runId:'old',source:'fake',propagation:[]}));`);
 assert.equal(run(root).status,'ERROR');
});

test('validation rejects level, link shape and flag problems',t=>{
 const config=JSON.parse(fs.readFileSync(path.join(source,'.quality-gate.json'),'utf8'));
 const variant=mutate=>{const copy=structuredClone(config);mutate(copy.gates[0]);return copy;};
 assert.throws(()=>validate(variant(g=>{g.level='L3';})),/trace-continuity requires L4/);
 assert.throws(()=>validate(variant(g=>{g.links=[];})),/Invalid trace-continuity links/);
 assert.throws(()=>validate(variant(g=>{g.links=['a->b','a->b'];})),/Duplicate trace-continuity link/);
 assert.throws(()=>validate(variant(g=>{g.requireTraceparent='yes';})),/Invalid requireTraceparent/);
 assert.doesNotThrow(()=>validate(variant(g=>{delete g.requireTraceparent;})));
});
