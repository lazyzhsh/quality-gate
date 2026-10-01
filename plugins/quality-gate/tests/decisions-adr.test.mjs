import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {run} from '../lib/kernel.mjs';
import {failureReasons} from '../lib/summary.mjs';
import {leanFixture} from './fixture.mjs';

function project(t,{gateOptions={},adrRef='docs/adr/ADR-0900-example.md',frontmatter='status: accepted\ndate: 2026-10-01\ndeciders: user\n',extraAdr=null}={}){
 const f=leanFixture(t);
 const config={schemaVersion:'0.2',claims:[{id:'C0',statement:'decisions close'}],gates:[{id:'dec',kind:'decisions',level:'L0',enabled:true,stages:['close'],claimId:'C0',file:'decisions.json',...gateOptions}],risks:[],exceptions:[]};
 fs.writeFileSync(path.join(f.root,'.quality-gate.json'),JSON.stringify(config));
 fs.mkdirSync(path.join(f.root,'docs','adr'),{recursive:true});
 fs.writeFileSync(path.join(f.root,'docs','adr','ADR-0900-example.md'),`---\n${frontmatter}---\n\n# ADR-0900\n\n正文。\n`);
 if(extraAdr)for(const [name,content] of Object.entries(extraAdr))fs.writeFileSync(path.join(f.root,'docs','adr',name),content);
 const decision={id:'D-1',question:'采用哪个方案',status:'resolved',owner:'user',resolution:'方案 A',evidence:'已确认'};
 if(adrRef!==null)decision.adrRef={file:adrRef};
 fs.writeFileSync(path.join(f.root,'decisions.json'),JSON.stringify({decisions:[decision]}));
 return f;
}

test('a bound ADR with matching status verifies and passes',t=>{
 const f=project(t);
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 const check=result.evidence[0].details.adrChecks[0];
 assert.equal(check.status,'verified');
 assert.equal(check.adrStatus,'accepted');
});

test('register status mismatching the ADR fails named',t=>{
 const f=project(t,{adrRef:'docs/adr/ADR-0900-example.md'});
 const data=JSON.parse(fs.readFileSync(path.join(f.root,'decisions.json'),'utf8'));
 data.decisions[0].status='open';
 fs.writeFileSync(path.join(f.root,'decisions.json'),JSON.stringify(data));
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence[0].details.decisions[0].reasons.includes('adr-status-mismatch'),true);
 assert.equal(failureReasons(result.evidence[0]).some(r=>r.includes('D-1 登记状态 open 与 ADR status accepted 不一致')),true);
});

test('a missing ADR file or malformed frontmatter is distinguishable',t=>{
 const missing=project(t,{adrRef:'docs/adr/ADR-nope.md'});
 assert.equal(run(missing.root).status,'FAIL');
 assert.equal(run(missing.root).evidence[0].details.decisions[0].reasons.includes('adr-ref-missing'),true);
 const malformed=project(t,{frontmatter:'status: accepted\nnot a pair line\n'});
 assert.equal(run(malformed.root).status,'ERROR');
 const unknownKey=project(t,{frontmatter:'status: accepted\ntitle: 带未知键\n'});
 assert.equal(run(unknownKey.root).status,'ERROR');
 const badStatus=project(t,{frontmatter:'status: draft\n'});
 assert.equal(run(badStatus.root).status,'ERROR');
});

test('requireAdrRefs demands a binding per decision',t=>{
 const f=project(t,{gateOptions:{requireAdrRefs:true},adrRef:null});
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence[0].details.decisions[0].reasons.includes('adr-ref-required'),true);
 const bound=project(t,{gateOptions:{requireAdrRefs:true}});
 assert.equal(run(bound.root).status,'PASS');
});

test('supersedes chain verifies existence and reciprocity by basename',t=>{
 const f=project(t,{frontmatter:'status: superseded\ndate: 2026-10-01\nsuperseded-by: ADR-0901.md\n',extraAdr:{'ADR-0901.md':'---\nstatus: accepted\nsupersedes: ADR-0900-example.md\n---\n\n替代。\n'}});
 const data=JSON.parse(fs.readFileSync(path.join(f.root,'decisions.json'),'utf8'));
 data.decisions[0].status='resolved';
 fs.writeFileSync(path.join(f.root,'decisions.json'),JSON.stringify(data));
 // resolved↔superseded 不在映射内 → 状态不一致 FAIL（映射只认 resolved↔accepted）
 const result=run(f.root);
 assert.equal(result.evidence[0].details.decisions[0].reasons.includes('adr-status-mismatch'),true);
 const reciprocal=project(t,{frontmatter:'status: superseded\ndate: 2026-10-01\nsuperseded-by: ADR-0901.md\n',extraAdr:{'ADR-0901.md':'---\nstatus: accepted\nsupersedes: 别的文件.md\n---\n'}});
 const chain=run(reciprocal.root);
 assert.equal(chain.evidence[0].details.adrChecks[0].status,'chain-mismatch');
 const dangling=project(t,{frontmatter:'status: superseded\ndate: 2026-10-01\nsuperseded-by: ADR-missing.md\n'});
 assert.equal(run(dangling.root).evidence[0].details.adrChecks[0].status,'chain-missing');
});
