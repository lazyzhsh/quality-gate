import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validate} from '../lib/kernel.mjs';
const qgate=fileURLToPath(new URL('../bin/qgate.mjs',import.meta.url));
const adapter=fileURLToPath(new URL('../hooks/adapter.mjs',import.meta.url));
const runCli=(...a)=>spawnSync(process.execPath,[qgate,...a],{encoding:'utf8'});
const invokeHook=input=>{const r=spawnSync(process.execPath,[adapter],{input:JSON.stringify(input)+'\n',encoding:'utf8'});assert.equal(r.status,0);return JSON.parse(r.stdout);};

function project(t,{withApp=true}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate init '));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 if(withApp){
  fs.writeFileSync(path.join(root,'app.mjs'),'export default 1;\n');
  fs.mkdirSync(path.join(root,'.quality-gate','registries'),{recursive:true});
  fs.writeFileSync(path.join(root,'.quality-gate','registries','assumptions.json'),JSON.stringify({assumptions:[{id:'A1',statement:'demo assumption',status:'confirmed'}]}));
 }
 return root;
}
const writeAnswers=(root,answers)=>{const file=path.join(root,'answers.json');fs.writeFileSync(file,JSON.stringify(answers));return file;};
const minimalAnswers={templateId:'minimal',substitutions:{gates:{syntax:{argv:['$NODE','--check','app.mjs']}}}};

test('templates lists presets by tier and rejects unknown tiers',()=>{
 const all=runCli('templates');
 assert.equal(all.status,0);
 const payload=JSON.parse(all.stdout);
 assert.equal(payload.templates.length,7);
 assert.equal(payload.addOns.length,6);
 assert.equal(payload.ontologyHint.fiboPinnedCatalogSha256,'eb9795a238457b85161bbb22610a6a5507a613fb76d377b05daba625b3816c4e');
 const lite=runCli('templates','lite');
 assert.equal(JSON.parse(lite.stdout).templates.map(t=>t.id).join(),'minimal,node-engineering,web-api');
 assert.match(lite.stderr,/档位 lite 可用模板 3 个/);
 const bogus=runCli('templates','bogus');
 assert.equal(bogus.status,2);
});

test('init writes a validated config and the first close run passes',t=>{
 const root=project(t);
 const answers=writeAnswers(root,minimalAnswers);
 const result=runCli('init',root,answers);
 assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
 const summary=JSON.parse(result.stdout);
 assert.equal(summary.status,'initialized');
 assert.deepEqual(summary.gates,['syntax','assumptions']);
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 assert.doesNotThrow(()=>validate(config));
 const close=runCli(root,'close');
 assert.equal(close.status,0,close.stderr);
 assert.match(close.stderr,/\*\*Quality Gate PASS\*\*/);
});

test('init refuses to overwrite an existing config unless --force is explicit',t=>{
 const root=project(t);
 const answers=writeAnswers(root,minimalAnswers);
 assert.equal(runCli('init',root,answers).status,0);
 fs.writeFileSync(path.join(root,'.quality-gate.json'),'{"schemaVersion":"0.1"}');
 const refused=runCli('init',root,answers);
 assert.equal(refused.status,2);
 assert.match(refused.stderr,/already exists; review it with the user, apply incremental changes via qgate\.mjs update, or pass --force/);
 const forced=runCli('init',root,answers,'--force');
 assert.equal(forced.status,0,forced.stderr);
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 assert.deepEqual(config.gates.map(g=>g.id),['syntax','assumptions']);
});

test('init reports answers and assembly failures without writing',t=>{
 const root=project(t);
 const missing=runCli('init',root,path.join(root,'nope.json'));
 assert.equal(missing.status,2);
 assert.match(missing.stderr,/ENOENT/);
 const unknown=writeAnswers(root,{templateId:'nope'});
 assert.match(runCli('init',root,unknown).stderr,/Unknown template id/);
 const unresolved=writeAnswers(root,{templateId:'minimal'});
 const unresolvedResult=runCli('init',root,unresolved);
 assert.equal(unresolvedResult.status,2);
 assert.match(unresolvedResult.stderr,/Unresolved placeholder at .*syntax/);
 assert.ok(!fs.existsSync(path.join(root,'.quality-gate.json')),'config must not be written on failure');
 const badUsage=runCli('init',root);
 assert.equal(badUsage.status,2);
 assert.match(badUsage.stderr,/Usage/);
});

test('missing config at run time reports an actionable onboarding message',t=>{
 const root=project(t,{withApp:false});
 const result=runCli(root,'close');
 assert.equal(result.status,2);
 assert.match(result.stderr,/missing \.quality-gate\.json: run onboarding first/);
 assert.match(result.stderr,/qgate\.mjs init/);
});

test('SessionStart first run points to /quality-gate-init; unreadable config is distinguished',t=>{
 const empty=project(t,{withApp:false});
 const firstRun=invokeHook({cwd:empty,hook_event_name:'SessionStart'}).hookSpecificOutput.additionalContext;
 assert.match(firstRun,/First run detected: no \.quality-gate\.json\. Run \/quality-gate-init/);
 fs.writeFileSync(path.join(empty,'.quality-gate.json'),'{broken');
 const broken=invokeHook({cwd:empty,hook_event_name:'SessionStart'}).hookSpecificOutput.additionalContext;
 assert.match(broken,/exists but cannot be read/);
 assert.ok(!broken.includes('/quality-gate-init'));
});
