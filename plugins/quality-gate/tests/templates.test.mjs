import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PLACEHOLDER,TIERS,TEMPLATES,ADDONS,REGISTRY_DIR,listTemplates,getTemplate,listAddOns,assembleConfig,applyChanges,scanLeftovers,preflightRefs} from '../lib/templates.mjs';
import {validate} from '../lib/kernel.mjs';

const text=v=>typeof v==='string'&&v.trim().length>0;
const runnerArgv=['$NODE','-e','process.exit(0)'];
const casesAnswer=[{id:'c1',input:{ok:true},expected:{ok:true}}];

function fullAnswers(t,{addOns=[],gateSubstitutions={},claimSubstitutions={},...rest}={}){
 const required=[...t.requiredSubstitutions,...addOns.flatMap(id=>ADDONS[id].requiredSubstitutions)];
 const gates={};
 for(const r of required){
  gates[r.gateId]??={};
  if(r.field==='argv')Object.assign(gates[r.gateId],{argv:runnerArgv});
  else if(r.field==='cases')Object.assign(gates[r.gateId],{cases:casesAnswer});
  else if(r.field==='file')Object.assign(gates[r.gateId],{file:'reg.json'});
  else if(r.field==='checks')Object.assign(gates[r.gateId],{checks:{...gates[r.gateId].checks,[r.checkId]:{argv:runnerArgv}}});
  else throw new Error(`unexpected required field ${r.field}`);
 }
 for(const [id,spec] of Object.entries(gateSubstitutions))gates[id]={...(gates[id]??{}),...spec};
 const substitutions={};
 if(Object.keys(gates).length)substitutions.gates=gates;
 if(Object.keys(claimSubstitutions).length)substitutions.claims=claimSubstitutions;
 return {templateId:t.id,...(addOns.length?{addOns}:{}),...(Object.keys(substitutions).length?{substitutions}:{}),...rest};
}

test('template library: 7 templates with unique ids and valid tiers',()=>{
 assert.equal(TEMPLATES.length,7);
 assert.equal(new Set(TEMPLATES.map(t=>t.id)).size,7);
 for(const t of TEMPLATES){
  assert.ok(TIERS.some(x=>x.id===t.tier),`tier ${t.tier}`);
  assert.ok(text(t.name)&&text(t.summary),t.id);
  assert.ok(t.availableAddOns.every(id=>Object.hasOwn(ADDONS,id)),`${t.id} add-on catalog`);
  for(const r of t.requiredSubstitutions){
   assert.ok(t.config.gates.some(g=>g.id===r.gateId),`${t.id} hint gate ${r.gateId}`);
   if(r.field==='checks')assert.ok(t.config.gates.find(g=>g.id===r.gateId).checks.some(c=>c.id===r.checkId),`${t.id} hint check ${r.checkId}`);
   else assert.ok(['argv','file','cases'].includes(r.field),`${t.id} hint field ${r.field}`);
  }
 }
});

test('every template config passes kernel validate as-is',()=>{
 for(const t of TEMPLATES)assert.doesNotThrow(()=>validate(structuredClone(t.config)),t.id);
});

test('tier accumulation: lite subset of pro subset of max',()=>{
 const ids=tier=>listTemplates(tier).map(t=>t.id);
 assert.deepEqual(ids('lite'),['minimal','node-engineering','web-api']);
 assert.deepEqual(ids('pro'),[...ids('lite'),'ledger-service','security-hardened','six-domain']);
 assert.deepEqual(ids('max'),[...ids('pro'),'release-governed']);
 assert.equal(listTemplates().length,7);
});

test('listTemplates rejects unknown tier; getTemplate rejects unknown id; listAddOns covers catalog',()=>{
 assert.throws(()=>listTemplates('bogus'),/Unknown tier/);
 assert.throws(()=>getTemplate('nope'),/Unknown template id/);
 assert.deepEqual(listAddOns().map(a=>a.id),Object.keys(ADDONS));
});

test('every template assembles, validates and leaves no placeholder',()=>{
 for(const t of TEMPLATES){
  const before=structuredClone(t.config);
  const config=assembleConfig(fullAnswers(t));
  validate(config);
  assert.ok(!JSON.stringify(config).includes(PLACEHOLDER),t.id);
  assert.deepEqual(t.config,before,`${t.id} template mutated`);
 }
});

test('every available add-on assembles with its template (all at once)',()=>{
 for(const t of TEMPLATES){
  if(!t.availableAddOns.length)continue;
  const config=assembleConfig(fullAnswers(t,{addOns:[...t.availableAddOns]}));
  validate(config);
  for(const id of t.availableAddOns)assert.ok(config.gates.some(g=>g.id===id),`${t.id}+${id}`);
 }
});

test('disable removes gates and prunes orphan claims/risks; disabling placeholder gates removes the requirement',()=>{
 const config=assembleConfig(fullAnswers(getTemplate('minimal'),{disable:['assumptions']}));
 assert.deepEqual(config.gates.map(g=>g.id),['syntax']);
 assert.deepEqual(config.claims.map(c=>c.id),['C1']);
 assert.deepEqual(config.risks.map(r=>r.id),['R1']);
 const noSyntax=assembleConfig({templateId:'minimal',disable:['syntax']});
 assert.deepEqual(noSyntax.gates.map(g=>g.id),['assumptions']);
 validate(noSyntax);
});

test('claim statement substitution applies',()=>{
 const config=assembleConfig(fullAnswers(getTemplate('minimal'),{claimSubstitutions:{C1:{statement:'project tailored claim'}}}));
 assert.equal(config.claims.find(c=>c.id==='C1').statement,'project tailored claim');
});

test('answers validation rejects unknown fields, ids and shapes',()=>{
 assert.throws(()=>assembleConfig({templateId:'minimal',oops:true}),/Unknown answers field/);
 assert.throws(()=>assembleConfig({templateId:'nope'}),/Unknown template id/);
 assert.throws(()=>assembleConfig({templateId:'minimal',addOns:['nope']}),/Unknown add-on/);
 assert.throws(()=>assembleConfig({templateId:'minimal',addOns:['api-authz-scan']}),/not available for template/);
 assert.throws(()=>assembleConfig({templateId:'minimal',addOns:['change-scope','change-scope']}),/unique/);
 assert.throws(()=>assembleConfig({templateId:'minimal',disable:['nope']}),/Cannot disable/);
 assert.throws(()=>assembleConfig({templateId:'minimal',disable:['change-scope']}),/add-ons are opt-in/);
 assert.throws(()=>assembleConfig({templateId:'minimal',substitutions:{gates:{nope:{argv:runnerArgv}}}}),/Unknown substitution gate/);
 assert.throws(()=>assembleConfig({templateId:'minimal',substitutions:{claims:{nope:{statement:'x'}}}}),/Unknown substitution claim/);
 assert.throws(()=>assembleConfig({templateId:'minimal',substitutions:{gates:{syntax:{argv:[]}}}}),/argv/);
 assert.throws(()=>assembleConfig({templateId:'minimal',substitutions:{gates:{syntax:{argv:['ok','  ']}}}}),/argv/);
 assert.throws(()=>assembleConfig({templateId:'minimal',substitutions:{gates:{syntax:{timeoutMs:0}}}}),/timeoutMs/);
 assert.throws(()=>assembleConfig({templateId:'minimal',substitutions:{gates:{syntax:{bogus:1}}}}),/unsupported substitution field/);
});

test('engineering check substitution rejects unknown check ids',()=>{
 const base=fullAnswers(getTemplate('node-engineering'));
 const poisoned=structuredClone(base);
 poisoned.substitutions.gates.engineering={...poisoned.substitutions.gates.engineering,checks:{nope:{argv:runnerArgv}}};
 assert.throws(()=>assembleConfig(poisoned),/unknown check id/);
});

test('unresolved placeholders fail assembly with located paths',()=>{
 assert.throws(()=>assembleConfig({templateId:'minimal'}),/Unresolved placeholder at .*syntax/);
 const answers=fullAnswers(getTemplate('web-api'));
 delete answers.substitutions.gates.behavior.cases;
 assert.throws(()=>assembleConfig(answers),/Unresolved placeholder at .*behavior/);
});

test('assembled invalid configs are reported as assembly errors',()=>{
 assert.throws(()=>assembleConfig({templateId:'minimal',substitutions:{gates:{syntax:{argv:runnerArgv,timeoutMs:65000}}}}),/gate syntax: timeoutMs must be 1\.\.60000/);
 assert.throws(()=>assembleConfig(fullAnswers(getTemplate('minimal'),{requiredLevels:{close:['L9']}})),/Assembled config invalid: .*requiredLevels/);
 assert.throws(()=>assembleConfig({templateId:'minimal',disable:['syntax','assumptions']}),/Assembled config invalid: .*claims/);
});

test('answers.requiredLevels replaces the template value',()=>{
 const config=assembleConfig(fullAnswers(getTemplate('minimal'),{requiredLevels:{close:['L1']}}));
 assert.deepEqual(config.requiredLevels,{close:['L1']});
});

test('substituted argv containing the placeholder token is rejected',()=>{
 assert.throws(()=>assembleConfig({templateId:'minimal',substitutions:{gates:{syntax:{argv:['$NODE','--check',PLACEHOLDER]}}}}),/Unresolved placeholder/);
});

test('registry defaults: every file-ish field in templates and add-ons points at REGISTRY_DIR',()=>{
 const fileFields=g=>[...(text(g.file)?[g.file]:[]),...(text(g.dataFile)?[g.dataFile]:[]),...(g.files&&typeof g.files==='object'?Object.values(g.files).filter(text):[])];
 for(const t of TEMPLATES)for(const g of t.config.gates)for(const f of fileFields(g))assert.ok(f.startsWith(`${REGISTRY_DIR}/`),`${t.id}.${g.id}: ${f}`);
 for(const a of Object.values(ADDONS))for(const f of fileFields(a.gate))assert.ok(f.startsWith(`${REGISTRY_DIR}/`),`${a.id}: ${f}`);
});

test('assembleConfig stamps template provenance accepted by kernel validate',()=>{
 const config=assembleConfig(fullAnswers(getTemplate('minimal')));
 assert.equal(config.template.id,'minimal');
 assert.ok(!Number.isNaN(Date.parse(config.template.generatedAt)));
 assert.doesNotThrow(()=>validate(structuredClone(config)));
 const blankId=structuredClone(config);blankId.template={id:'  ',generatedAt:'2026-09-26T00:00:00.000Z'};
 assert.throws(()=>validate(blankId),/Invalid template provenance/);
 const missingDate=structuredClone(config);missingDate.template={id:'minimal'};
 assert.throws(()=>validate(missingDate),/Invalid template provenance/);
});

test('applyChanges is the shared incremental core used by update',()=>{
 const config=assembleConfig(fullAnswers(getTemplate('minimal')));
 applyChanges(config,{addOns:['change-scope']});
 validate(config);
 assert.ok(config.gates.some(g=>g.id==='change-scope'));
 assert.throws(()=>applyChanges(config,{oops:1}),/Unknown changes field/);
 assert.throws(()=>applyChanges(config,{disable:['nope']}),/not an existing gate/);
 assert.throws(()=>applyChanges(config,{addOns:['change-scope']}),/already exists in config/);
 assert.throws(()=>applyChanges(config,{addOns:['nope']}),/Unknown add-on/);
});

test('scanLeftovers reports root registries and .quality-gate; config refs add thorough tier',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-left-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 assert.deepEqual(scanLeftovers(root),{registryFiles:[],qualityGateDir:null});
 fs.writeFileSync(path.join(root,'app.mjs'),'');
 fs.writeFileSync(path.join(root,'rerun.json'),'{}');
 fs.writeFileSync(path.join(root,'notes.md'),'mine');
 fs.mkdirSync(path.join(root,'.quality-gate','runs'),{recursive:true});
 fs.writeFileSync(path.join(root,'.quality-gate','runs','a.json'),'{}');
 const found=scanLeftovers(root);
 assert.deepEqual(found.registryFiles,['rerun.json']);
 assert.equal(found.qualityGateDir.runsCount,1);
 const cfg=assembleConfig(fullAnswers(getTemplate('minimal')));
 fs.mkdirSync(path.join(root,'custom'),{recursive:true});
 fs.writeFileSync(path.join(root,'custom','reg.json'),'{}');
 cfg.gates.push({id:'custom',kind:'assumptions',level:'L0',enabled:true,stages:['close'],claimId:'C1',file:'custom/reg.json'});
 assert.ok(scanLeftovers(root,cfg).registryFiles.includes('custom/reg.json'));
});

test('answers.ontology replaces the template provider with strict shape checks',()=>{
 const t=getTemplate('six-domain');
 const answers=fullAnswers(t);
 answers.ontology={type:'fibo-pinned',expectedCatalogSha256:'eb9795a238457b85161bbb22610a6a5507a613fb76d377b05daba625b3816c4e'};
 const config=assembleConfig(answers);
 assert.equal(config.ontology.type,'fibo-pinned');
 validate(config);
 const variant=mod=>{const a=fullAnswers(t);a.ontology=mod;return a;};
 assert.throws(()=>assembleConfig(variant({type:'fibo-pinned'})),/64-hex/);
 assert.throws(()=>assembleConfig(variant({type:'fibo-pinned',expectedCatalogSha256:'xyz',extra:1})),/64-hex/);
 assert.throws(()=>assembleConfig(variant({type:'local-catalog',file:'C:/abs.json'})),/project-relative/);
 assert.throws(()=>assembleConfig(variant({type:'local-catalog'})),/project-relative/);
 assert.throws(()=>assembleConfig(variant({type:'nope'})),/Unknown ontology type/);
 assert.throws(()=>assembleConfig(variant({type:'fibo-skeleton',extra:1})),/no other fields/);
 const local=fullAnswers(t);local.ontology={type:'local-catalog',file:'.quality-gate/registries/catalog.json'};
 validate(assembleConfig(local));
});

test('metrics thresholds are substitutable with project metric names',()=>{
 const t=getTemplate('six-domain');
 const answers=fullAnswers(t);
 answers.substitutions.gates.metrics={...answers.substitutions.gates.metrics,thresholds:{approvalLatencyMs:{max:500},claimsThroughput:{min:1}}};
 const config=assembleConfig(answers);
 assert.deepEqual(config.gates.find(g=>g.id==='metrics').thresholds,{approvalLatencyMs:{max:500},claimsThroughput:{min:1}});
 validate(config);
 const bad=fullAnswers(t);
 bad.substitutions.gates.metrics={...bad.substitutions.gates.metrics,thresholds:{broken:{}}};
 assert.throws(()=>assembleConfig(bad),/min and\/or max/);
 const range=fullAnswers(t);
 range.substitutions.gates.metrics={...range.substitutions.gates.metrics,thresholds:{inverted:{min:5,max:1}}};
 assert.throws(()=>assembleConfig(range),/min<=max/);
});

test('preflightRefs reports registry gate-id references missing from the config',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-preflight-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const cfg=assembleConfig(fullAnswers(getTemplate('six-domain')));
 fs.mkdirSync(path.join(root,'.quality-gate','registries'),{recursive:true});
 // 真实登记文件为嵌套结构：requirements[].acceptanceCriteria[].testGateIds；release 顶层的 verificationGateIds 同样收集
 fs.writeFileSync(path.join(root,REGISTRY_DIR,'requirements.json'),JSON.stringify({requirements:[{acceptanceCriteria:[{id:'AC-01',testGateIds:['old-rtm-gate','syntax']},{id:'AC-02',testGateIds:['behavior']}]}]}));
 fs.writeFileSync(path.join(root,REGISTRY_DIR,'release.json'),JSON.stringify({artifacts:[],verificationGateIds:['rollback-drill']}));
 const findings=preflightRefs(cfg,root);
 assert.deepEqual(findings,[{gateId:'rtm',file:`${REGISTRY_DIR}/requirements.json`,field:'testGateIds',unknownGateIds:['old-rtm-gate']}]);
 assert.deepEqual(preflightRefs(assembleConfig(fullAnswers(getTemplate('minimal'))),root),[],'missing registry files are skipped, not errors');
});
