import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {leanFixture} from './fixture.mjs';
import {run} from '../lib/kernel.mjs';
import {setup} from './persistence-helpers.mjs';
const demo=fileURLToPath(new URL('../examples/persistence-demo/',import.meta.url));
for(const [mode,status] of [['normal','PASS'],['wrong-value','FAIL'],['missing-row','FAIL']])test('real HTTP and SQLite: '+mode,t=>{
 const f=setup(t,mode);const r=run(f.root);assert.equal(r.status,status,JSON.stringify(r));
 const d=r.evidence[0].details;assert.equal(d.request.status,201);assert.match(d.persistenceSource,/sqlite/);
 assert.equal(d.snapshots.before.recordCount,0);assert.equal(d.snapshots.after.recordCount,mode==='missing-row'?0:1);
 if(mode!=='missing-row')assert.equal(d.snapshots.delta.some(x=>x.field==='amount_minor'),true);
 if(mode==='wrong-value'){const field=d.fields.find(x=>x.field==='amount_minor');assert.equal(field.actual,1251);assert.equal(field.expected,1250);}
 if(mode==='missing-row')assert.equal(d.recordCount,0);
});

test('real idempotency and rejection gates pass against HTTP and SQLite',t=>{
 const f=leanFixture(t);
 fs.cpSync(demo,f.root,{recursive:true});
 const r=run(f.root);
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 const byId=new Map(r.evidence.map(evidence=>[evidence.gateId,evidence]));
 assert.equal(byId.get('order-idempotency').details.recordCount,1);
 const rejection=byId.get('order-rejection').details;
 assert.equal(rejection.recordCount,0);
 assert.equal(rejection.expectedRecordCount,0);
 assert.equal(rejection.request.status,422);
});
