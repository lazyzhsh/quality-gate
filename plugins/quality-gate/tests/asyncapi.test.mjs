import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {extractEventContract,compareEventSamples} from '../lib/asyncapi.mjs';
import {run,validate} from '../lib/kernel.mjs';
import {failureReasons} from '../lib/summary.mjs';

const source=fileURLToPath(new URL('../examples/asyncapi-demo',import.meta.url));
const read=()=>JSON.parse(fs.readFileSync(path.join(source,'asyncapi.json'),'utf8'));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-asyncapi-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(source,root,{recursive:true});return root;}
const baseSamples=()=>[
 {operationId:'receiveOrder',action:'receive',channel:'orders.request',messageId:'submit',contentType:'application/json',headers:{requestId:'fresh'},payload:{id:'o1',amount:1,currency:'CNY'}},
 {operationId:'sendAccepted',action:'send',channel:'orders.accepted',messageId:'accepted',contentType:'application/json',headers:{requestId:'fresh'},payload:{order:{id:'o1',amount:1,currency:'CNY'},status:'accepted'}}
];

test('AsyncAPI live event exchange verifies both application directions and independent payloads',t=>{
 const result=run(project(t));
 assert.equal(result.status,'PASS',JSON.stringify(result.evidence));
 const d=result.evidence[0].details;
 assert.equal(d.scope,'event');assert.equal(d.observationMode,'live');
 assert.deepEqual(d.expectedItems.map(i=>i.action),['receive','send']);
 assert.equal(d.observedItems[1].payload.order.amount,1250);
 assert.match(d.expectedSha256,/^[a-f0-9]{64}$/);
});

test('AsyncAPI application drift fails at the exact payload and channel paths, then repairs',t=>{
 const root=project(t), file=path.join(root,'app.mjs'), original=fs.readFileSync(file,'utf8');
 fs.writeFileSync(file,original.replace("status:'accepted'","status:'rejected'").replace("channel:'orders.accepted'","channel:'orders.wrong'"));
 const result=run(root), e=result.evidence[0];
 assert.equal(result.status,'FAIL');
 assert.ok(e.details.differences.some(d=>d.path==='/items/1/payload/status'&&d.rule==='event-enum'));
 assert.ok(failureReasons(e).some(s=>s.includes('/items/1/channel event-channel')));
 fs.writeFileSync(file,original);assert.equal(run(root).status,'PASS');
});

test('AsyncAPI contracts are read afresh: changed declarations cannot use an old normalized file',t=>{
 const root=project(t), doc=read();doc.components.schemas.Order.properties.amount.minimum=2000;
 fs.writeFileSync(path.join(root,'asyncapi.json'),JSON.stringify(doc));
 const result=run(root);assert.equal(result.status,'FAIL');
 assert.ok(result.evidence[0].details.differences.some(d=>d.rule==='event-minimum'));
});

test('AsyncAPI sample validation covers required, types, enums, additional fields, headers and direction',()=>{
 const expected=extractEventContract(read());
 const mutations=[
  [s=>delete s[0].payload.id,'event-required','/items/0/payload/id'],
  [s=>s[0].payload.amount='1','event-type','/items/0/payload/amount'],
  [s=>s[0].payload.amount=0,'event-minimum','/items/0/payload/amount'],
  [s=>s[0].payload.currency='EUR','event-enum','/items/0/payload/currency'],
  [s=>s[0].payload.surprise=true,'event-additional-property','/items/0/payload/surprise'],
  [s=>s[0].headers.requestId='','event-minLength','/items/0/headers/requestId'],
  [s=>delete s[0].headers,'event-type','/items/0/headers'],
  [s=>s[0].action='send','event-action','/items/0/action'],
  [s=>s[0].contentType='text/plain','event-content-type','/items/0/contentType']
 ];
 for(const [mutate,rule,at] of mutations){const samples=baseSamples();mutate(samples);assert.ok(compareEventSamples(expected,samples).some(d=>d.rule===rule&&d.path===at),rule);}
});

test('AsyncAPI coverage rejects omitted and unknown messages, checking every repeated sample',()=>{
 const expected=extractEventContract(read());
 assert.equal(compareEventSamples(expected,[]).filter(d=>d.rule==='event-missing-message').length,2);
 const samples=baseSamples();samples[1].messageId='unknown';
 assert.deepEqual(new Set(compareEventSamples(expected,samples).map(d=>d.rule)),new Set(['event-unexpected-message','event-missing-message']));
 const repeated=baseSamples();repeated.push(structuredClone(repeated[0]));repeated[2].payload.amount=0;
 assert.ok(compareEventSamples(expected,repeated).some(d=>d.path==='/items/2/payload/amount'));
 assert.deepEqual(compareEventSamples(expected,baseSamples().reverse()),[]);
});

test('AsyncAPI alternatives must match exactly one message schema, even with a claimed messageId',()=>{
 const doc=read();doc.channels.requests.messages.other={$ref:'#/components/messages/SubmitOrder'};
 doc.operations.receiveOrder.messages.push({$ref:'#/channels/requests/messages/other'});
 const expected=extractEventContract(doc), samples=baseSamples();
 samples.push({...structuredClone(samples[0]),messageId:'other'});
 assert.equal(compareEventSamples(expected,samples).filter(d=>d.rule==='event-ambiguous-message').length,2);
});

test('AsyncAPI JSON Pointer escapes resolve local reusable schemas, messages, channels and operations',()=>{
 const doc=read();doc.components.schemas['Order/a~b']=doc.components.schemas.Order;delete doc.components.schemas.Order;
 doc.components.messages.SubmitOrder.payload.$ref='#/components/schemas/Order~1a~0b';
 doc.components.messages.OrderAccepted.payload.properties.order.$ref='#/components/schemas/Order~1a~0b';
 doc.components.channels={Requests:doc.channels.requests};doc.channels.requests={$ref:'#/components/channels/Requests'};
 doc.components.operations={Receive:doc.operations.receiveOrder};doc.operations.receiveOrder={$ref:'#/components/operations/Receive'};
 assert.deepEqual(compareEventSamples(extractEventContract(doc),baseSamples()),[]);
});

test('AsyncAPI unsupported or malformed declarations fail closed with a location',()=>{
 const mutations=[
  [d=>d.asyncapi='2.6.0',/version/],
  [d=>d.operations={},/nonempty operations/],
  [d=>d.operations.receiveOrder.reply={},/reply.*operations\/receiveOrder/],
  [d=>d.operations.receiveOrder.traits=[],/traits/],
  [d=>d.channels.requests.bindings={kafka:{}},/bindings/],
  [d=>d.servers={local:{host:'localhost',protocol:'kafka'}},/servers/],
  [d=>d.channels.requests.address='orders.{tenant}',/literal channel/],
  [d=>delete d.operations.receiveOrder.messages,/explicit nonempty messages/],
  [d=>d.operations.receiveOrder.messages.push(d.operations.receiveOrder.messages[0]),/duplicate message/],
  [d=>d.operations.receiveOrder.messages=[{$ref:'#/components/messages/SubmitOrder'}],/this channel/],
  [d=>d.operations.receiveOrder.messages=[{$ref:'#/channels/accepted/messages/accepted'}],/this channel/],
  [d=>d.components.messages.SubmitOrder.payload={$ref:'https://example.com/schema.json'},/local \$ref/],
  [d=>d.components.messages.SubmitOrder.payload={$ref:'#/components/schemas/Missing'},/missing reference/],
  [d=>d.components.schemas.Order.properties.self={$ref:'#/components/schemas/Order'},/cyclic/],
  [d=>d.components.schemas.Order.properties.amount.oneOf=[],/unsupported oneOf/],
  [d=>d.components.schemas.Order.properties.id.format='uuid',/unsupported format/],
  [d=>d.components.messages.SubmitOrder.payload={schemaFormat:'avro',schema:{}},/schemaFormat/],
  [d=>d.components.schemas.Order.required=['missing'],/required must/],
  [d=>d.components.schemas.Order.additionalProperties={},/must be boolean/],
  [d=>d.channels.requests.messages.unused={$ref:'#/components/messages/SubmitOrder'},/uncovered/]
 ];
 for(const [mutate,error] of mutations){const doc=read();mutate(doc);assert.throws(()=>extractEventContract(doc),error);}
});

test('AsyncAPI bounded expansion and invalid schema shapes cannot produce a passing contract',()=>{
 const mutations=[
  d=>d.components.schemas.Order.properties.id={type:'array'},
  d=>d.components.schemas.Order.properties.id={type:'string',minimum:1},
  d=>d.components.schemas.Order.properties.id={type:'string',minLength:2,maxLength:1},
  d=>d.components.schemas.Order.properties.amount.enum=[1,1],
  d=>d.components.schemas.Order.properties.amount.enum=['1'],
  d=>d.components.schemas.Order.required=['id','id'],
  d=>{let s={type:'string'};for(let i=0;i<14;i++)s={type:'array',items:s};d.components.schemas.Order.properties.deep=s;},
  d=>{for(let i=0;i<101;i++)d.operations[`op${i}`]=structuredClone(d.operations.receiveOrder);},
  d=>d.channels.requests.messages.submit={$ref:'#/components/messages/SubmitOrder',payload:{type:'string'}}
 ];
 for(const mutate of mutations){const d=read();mutate(d);assert.throws(()=>extractEventContract(d),/AsyncAPI:/);}
 const c=extractEventContract(read());
 assert.throws(()=>compareEventSamples(c,Array(1001).fill(baseSamples()[0])),/at most 1000/);
});

test('AsyncAPI nested arrays, numeric bounds and Unicode string limits are checked',()=>{
 const doc=read();doc.components.schemas.Order.properties.tags={type:'array',minItems:1,maxItems:2,items:{type:'string',minLength:1,maxLength:1}};
 doc.components.schemas.Order.properties.amount.maximum=5;
 const expected=extractEventContract(doc), samples=baseSamples();
 samples[0].payload.tags=['😀'];assert.deepEqual(compareEventSamples(expected,samples),[]);
 samples[0].payload.tags=['ab','x','y'];samples[0].payload.amount=6;
 const rules=compareEventSamples(expected,samples).map(d=>d.rule);
 for(const rule of ['event-maxLength','event-maxItems','event-maximum'])assert.ok(rules.includes(rule));
});

test('AsyncAPI stale/malformed runner output is ERROR; missing live mode is FAIL with evidence',t=>{
 const root=project(t), file=path.join(root,'runner.mjs');
 const runner=extra=>`let raw='';for await(const c of process.stdin)raw+=c;const q=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId:q.runId,kind:'event',source:'test observation',items:${JSON.stringify(baseSamples())},${extra}}));`;
 fs.writeFileSync(file,runner("runId:'stale'"));assert.equal(run(root).status,'ERROR');
 fs.writeFileSync(file,runner(''));let result=run(root);assert.equal(result.status,'FAIL');assert.equal(result.evidence[0].details.missingObservationMode,true);
 fs.writeFileSync(file,runner("mode:'static'"));assert.equal(run(root).status,'FAIL');
 fs.writeFileSync(file,runner("mode:'live',items:[]"));result=run(root);assert.equal(result.status,'FAIL');assert.ok(result.evidence[0].details.differences.every(d=>d.rule==='event-missing-message'));
 fs.writeFileSync(file,runner("mode:'live',items:[{}]"));assert.equal(run(root).status,'ERROR');
});

test('AsyncAPI scope validation disallows silent ignorePaths waivers and malformed contracts',t=>{
 const root=project(t), config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 config.gates[0].ignorePaths=['/items/*/payload/amount'];assert.throws(()=>validate(config),/does not support ignorePaths/);
 const doc=read();doc.operations.receiveOrder.action='publish';fs.writeFileSync(path.join(root,'asyncapi.json'),JSON.stringify(doc));
 assert.equal(run(root).status,'ERROR');
});

test('AsyncAPI extraction CLI returns normalized event contracts and nonzero unsupported-input errors',t=>{
 const root=project(t), cli=fileURLToPath(new URL('../adapters/asyncapi/extract-contract.mjs',import.meta.url));
 const invoke=input=>spawnSync(process.execPath,[cli],{cwd:root,input,encoding:'utf8',windowsHide:true,timeout:5000});
 let r=invoke(JSON.stringify({runId:'extract',file:'asyncapi.json'}));assert.equal(r.status,0,r.stderr);
 assert.deepEqual(JSON.parse(r.stdout).items,extractEventContract(read()).items);
 assert.equal(JSON.parse(r.stdout).kind,'event');
 assert.equal(invoke('{}').status,2);
 fs.writeFileSync(path.join(root,'asyncapi.json'),'asyncapi: 3.0.0');r=invoke(JSON.stringify({runId:'extract',file:'asyncapi.json'}));assert.equal(r.status,3);assert.equal(r.stdout,'');
});
